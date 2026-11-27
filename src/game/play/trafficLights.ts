import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { GRID_BLOCKS } from '../city/layout';
import { groundHeight } from './collision';
import type { P, RoadGraph } from './roads';

export type Move = 'left' | 'straight' | 'right';
export type Light = 'green' | 'amber' | 'red';
type Axis = 'x' | 'z';

/** One cycle: each phase is green, then amber, then a moment of all-red. */
const GREEN_MAIN = 9, GREEN_LEFT = 5, AMBER = 2.5, ALL_RED = 1;
const PHASES: { axis: Axis; moves: Move[]; green: number }[] = [
  { axis: 'z', moves: ['straight', 'right'], green: GREEN_MAIN },
  { axis: 'z', moves: ['left'], green: GREEN_LEFT },
  { axis: 'x', moves: ['straight', 'right'], green: GREEN_MAIN },
  { axis: 'x', moves: ['left'], green: GREEN_LEFT },
];
const CYCLE = PHASES.reduce((s, p) => s + p.green + AMBER + ALL_RED, 0);
const MOVES: Move[] = ['left', 'straight', 'right'];
const LAMP_COLORS: Record<Light, THREE.Color> = { red: new THREE.Color('#ff2a1a'), amber: new THREE.Color('#ffaa00'), green: new THREE.Color('#22e05a') };
const OFF = 0.07;

const norm = (v: P) => { const l = Math.hypot(v.x, v.z) || 1; return { x: v.x / l, z: v.z / l }; };
const axisOf = (from: P, to: P): Axis => (Math.abs(to.x - from.x) > Math.abs(to.z - from.z) ? 'x' : 'z');

/** Which way a car turns at `to` when it goes from `from` on to `next`. */
export function moveOf(from: P, to: P, next: P): Move {
  const d1 = norm({ x: to.x - from.x, z: to.z - from.z }), d2 = norm({ x: next.x - to.x, z: next.z - to.z });
  const dot = d1.x * d2.x + d1.z * d2.z;
  if (dot > 0.9) return 'straight';
  if (dot < -0.9) return 'left'; // turning around counts as a left turn
  // Lanes are on the side of right(d) = (-d.z, d.x): turning towards that side is a right turn.
  const cross = d1.x * d2.z - d1.z * d2.x;
  return cross > 0 ? 'right' : 'left';
}

function paint(g: THREE.BufferGeometry, color: string) {
  const geo = g.index ? g.toNonIndexed() : g;
  const c = new THREE.Color(color), n = geo.getAttribute('position').count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) a.set([c.r, c.g, c.b], i * 3);
  geo.setAttribute('color', new THREE.BufferAttribute(a, 3));
  geo.deleteAttribute('uv');
  return geo;
}

/** A white arrow pointing up on a black round lamp (the instance color tints the arrow). */
function arrowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  g.fillStyle = '#000000';
  g.beginPath(); g.arc(32, 32, 31, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#ffffff';
  g.beginPath();
  g.moveTo(32, 8); g.lineTo(52, 30); g.lineTo(39, 30); g.lineTo(39, 56); g.lineTo(25, 56); g.lineTo(25, 30); g.lineTo(12, 30);
  g.closePath(); g.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

interface Approach { from: number; axis: Axis; lamp0: number }
interface Junction { node: number; offset: number; approaches: Approach[]; phase: number; sub: number }

/**
 * Dutch-style traffic lights at the city crossings: for every road into a crossing a pole on the
 * right with three lights (left / straight / right arrows), each red-amber-green. The phases go
 * north-south straight+right, north-south left, east-west straight+right, east-west left.
 * All poles are one InstancedMesh and all lamps another (2 draw calls); lamp colors only change
 * when a light switches.
 */
export class TrafficLights {
  readonly group = new THREE.Group();
  private junctions: Junction[] = [];
  private byNode = new Map<number, Junction>();
  private lamps: THREE.InstancedMesh;
  private time = 0;

  constructor(private graph: RoadGraph) {
    const gridNodes = (GRID_BLOCKS + 1) * (GRID_BLOCKS + 1);
    const N = graph.nodes;
    let lampCount = 0;
    graph.adj.forEach((adj, node) => {
      if (node >= gridNodes || adj.length < 3) return;
      const approaches = adj.map((from) => { const a = { from, axis: axisOf(N[from], N[node]), lamp0: lampCount }; lampCount += 9; return a; });
      // Neighbouring crossings start their cycle at different moments.
      const j: Junction = { node, offset: ((node * 7.31) % 1) * CYCLE, approaches, phase: -1, sub: -1 };
      this.junctions.push(j);
      this.byNode.set(node, j);
    });

    // Pole with an arm and three black housings (left / straight / right), facing the cars (+Z).
    const housing = (x: number) => [
      paint(new THREE.BoxGeometry(0.34, 0.95, 0.22).translate(x, 3.3, 0), '#1c1d20'),
      paint(new THREE.BoxGeometry(0.42, 1.05, 0.04).translate(x, 3.3, -0.12), '#f2f2f2'), // white backboard edge
      paint(new THREE.BoxGeometry(0.36, 0.05, 0.3).translate(x, 3.8, 0.05), '#1c1d20'),
    ];
    const poleGeo = mergeGeometries([
      paint(new THREE.CylinderGeometry(0.07, 0.08, 3.9, 8).translate(0, 1.95, 0), '#8c949c'),
      paint(new THREE.BoxGeometry(1.9, 0.08, 0.08).translate(-0.85, 3.85, 0), '#8c949c'),
      ...housing(-1.55), ...housing(-1.05), ...housing(-0.55),
    ])!;
    const poles = new THREE.InstancedMesh(poleGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.2 }), this.junctions.reduce((s, j) => s + j.approaches.length, 0));
    poles.castShadow = true;
    this.lamps = new THREE.InstancedMesh(new THREE.CircleGeometry(0.12, 14), new THREE.MeshBasicMaterial({ map: arrowTexture(), toneMapped: false }), lampCount);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(1, 1, 1), up = new THREE.Vector3(0, 1, 0);
    const base = new THREE.Object3D(), lamp = new THREE.Object3D();
    base.add(lamp);
    let pi = 0;
    for (const j of this.junctions) {
      const C = N[j.node];
      for (const a of j.approaches) {
        // Cars drive towards the crossing along d; the pole stands on their right, before the crossing.
        const d = norm({ x: C.x - N[a.from].x, z: C.z - N[a.from].z }), r = { x: -d.z, z: d.x };
        const x = C.x - d.x * 7.2 + r.x * 6.2, z = C.z - d.z * 7.2 + r.z * 6.2;
        base.position.set(x, groundHeight(x, z), z);
        // Local +Z faces the cars (towards -d); local -X points over the road (towards -r).
        base.quaternion.setFromAxisAngle(up, Math.atan2(-d.x, -d.z));
        base.updateMatrixWorld(true);
        poles.setMatrixAt(pi++, base.matrixWorld);
        MOVES.forEach((mv, h) => {
          const hx = [-1.55, -1.05, -0.55][h];
          ['red', 'amber', 'green'].forEach((_, k) => {
            lamp.position.set(hx, 3.6 - k * 0.3, 0.115);
            // The arrow texture points up: turn it for left / right.
            lamp.rotation.set(0, 0, mv === 'left' ? Math.PI / 2 : mv === 'right' ? -Math.PI / 2 : 0);
            lamp.updateMatrixWorld(true);
            this.lamps.setMatrixAt(a.lamp0 + h * 3 + k, lamp.matrixWorld);
          });
        });
      }
    }
    void m; void q; void s;
    poles.instanceMatrix.needsUpdate = true;
    this.lamps.instanceMatrix.needsUpdate = true;
    for (let i = 0; i < lampCount; i++) this.lamps.setColorAt(i, new THREE.Color(OFF, OFF, OFF));
    this.group.add(poles, this.lamps);
    this.update(0);
  }

  /** Where junction j is in its cycle: phase index and 0 = green, 1 = amber, 2 = all-red. */
  private stage(j: Junction) {
    let t = (this.time + j.offset) % CYCLE;
    for (let i = 0; i < PHASES.length; i++) {
      const p = PHASES[i];
      if (t < p.green) return { phase: i, sub: 0 };
      t -= p.green;
      if (t < AMBER) return { phase: i, sub: 1 };
      t -= AMBER;
      if (t < ALL_RED) return { phase: i, sub: 2 };
      t -= ALL_RED;
    }
    return { phase: 0, sub: 0 };
  }

  private lightFor(j: Junction, axis: Axis, move: Move): Light {
    const p = PHASES[j.phase];
    if (j.sub === 2 || p.axis !== axis || !p.moves.includes(move)) return 'red';
    return j.sub === 0 ? 'green' : 'amber';
  }

  /** The light for a car driving from node `from` to crossing `to` and turning `move` (null: no lights there). */
  state(from: number, to: number, move: Move): Light | null {
    const j = this.byNode.get(to);
    if (!j) return null;
    return this.lightFor(j, axisOf(this.graph.nodes[from], this.graph.nodes[to]), move);
  }

  hasLights(node: number) { return this.byNode.has(node); }

  update(dt: number) {
    this.time += dt;
    let changed = false;
    const c = new THREE.Color();
    for (const j of this.junctions) {
      const st = this.stage(j);
      if (st.phase === j.phase && st.sub === j.sub) continue;
      j.phase = st.phase; j.sub = st.sub;
      changed = true;
      for (const a of j.approaches) {
        MOVES.forEach((mv, h) => {
          const light = this.lightFor(j, a.axis, mv);
          (['red', 'amber', 'green'] as Light[]).forEach((k, i) => {
            c.copy(LAMP_COLORS[k]);
            if (k !== light) c.multiplyScalar(OFF);
            this.lamps.setColorAt(a.lamp0 + h * 3 + i, c);
          });
        });
      }
    }
    if (changed && this.lamps.instanceColor) this.lamps.instanceColor.needsUpdate = true;
  }

  dispose() {
    this.group.traverse((o) => {
      const mm = o as THREE.Mesh;
      if (mm.isMesh) {
        mm.geometry.dispose();
        const mat = mm.material as THREE.MeshBasicMaterial;
        mat.map?.dispose();
        mat.dispose();
      }
    });
    this.group.removeFromParent();
  }
}
