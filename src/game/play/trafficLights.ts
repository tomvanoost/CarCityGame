import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { GRID_BLOCKS, WIDE_LANES, isWideLine } from '../city/layout';
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

/** White road arrow (left / straight / right) on a transparent background, pointing along +Z of the plane. */
function roadArrowTexture(move: Move) {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 192;
  const g = c.getContext('2d')!;
  g.fillStyle = 'rgba(240,240,240,0.92)';
  g.beginPath();
  if (move === 'straight') {
    g.moveTo(32, 8); g.lineTo(56, 60); g.lineTo(40, 60); g.lineTo(40, 184); g.lineTo(24, 184); g.lineTo(24, 60); g.lineTo(8, 60);
  } else {
    // A shaft that bends to one side at the top.
    // Seen by a driver, the plane's +X (the canvas' right side) is on the left: so a right arrow bends to the canvas' left.
    const s = move === 'left' ? 1 : -1, cx = 32;
    g.moveTo(cx - 8, 184); g.lineTo(cx + 8, 184); g.lineTo(cx + 8, 70);
    if (s > 0) { g.lineTo(cx + 14, 70); g.lineTo(cx + 14, 50); g.lineTo(cx + 30, 76); g.lineTo(cx + 14, 102); g.lineTo(cx + 14, 86); g.lineTo(cx - 8, 86); }
    else { g.lineTo(cx + 8, 86); g.lineTo(cx - 14, 86); g.lineTo(cx - 14, 102); g.lineTo(cx - 30, 76); g.lineTo(cx - 14, 50); g.lineTo(cx - 14, 70); g.lineTo(cx - 8, 70); }
    g.lineTo(cx - 8, 184);
  }
  g.closePath(); g.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.flipY = false;
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
      // Lights where two avenues cross (3 lanes on every approach); where the small ring road meets an
      // avenue there are none (cars take turns).
      const n = GRID_BLOCKS + 1;
      if (!isWideLine(Math.floor(node / n)) || !isWideLine(node % n)) return;
      const approaches = adj.map((from) => { const a = { from, axis: axisOf(N[from], N[node]), lamp0: lampCount }; lampCount += 9; return a; });
      // Neighbouring crossings start their cycle at different moments.
      const j: Junction = { node, offset: ((node * 7.31) % 1) * CYCLE, approaches, phase: -1, sub: -1 };
      this.junctions.push(j);
      this.byNode.set(node, j);
    });

    // Poles with an arm and three black housings (left / straight / right), facing the cars (+Z).
    // Short arm on small roads (the three lights side by side); on avenues a long arm with one light above each lane.
    const housing = (x: number) => [
      paint(new THREE.BoxGeometry(0.34, 0.95, 0.22).translate(x, 3.3, 0), '#1c1d20'),
      paint(new THREE.BoxGeometry(0.42, 1.05, 0.04).translate(x, 3.3, -0.12), '#f2f2f2'), // white backboard edge
      paint(new THREE.BoxGeometry(0.36, 0.05, 0.3).translate(x, 3.8, 0.05), '#1c1d20'),
    ];
    const SHORT = [-1.55, -1.05, -0.55];
    // Avenue: the pole stands 1.2 m beyond the curb (half width 11); lanes at 2.67 / 6 / 9.33 m from the middle.
    const LONG = WIDE_LANES.map((l) => -(11 + 1.2 - l));
    const pole = (heads: number[]) => mergeGeometries([
      paint(new THREE.CylinderGeometry(0.07, 0.08, 3.9, 6, 1, true).translate(0, 1.95, 0), '#8c949c'),
      paint(new THREE.BoxGeometry(-heads[0] + 0.4, 0.08, 0.08).translate(heads[0] / 2 - 0.1, 3.85, 0), '#8c949c'),
      ...heads.flatMap(housing),
    ])!;
    const all = this.junctions.flatMap((j) => j.approaches);
    const wide = (a: Approach, node: number) => graph.halfOf(a.from, node) > 6;
    const nWide = this.junctions.reduce((s, j) => s + j.approaches.filter((a) => wide(a, j.node)).length, 0);
    const poleMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.2 });
    const shortPoles = new THREE.InstancedMesh(pole(SHORT), poleMat, Math.max(1, all.length - nWide));
    const longPoles = new THREE.InstancedMesh(pole(LONG), poleMat, Math.max(1, nWide));
    shortPoles.count = all.length - nWide; longPoles.count = nWide;
    shortPoles.castShadow = longPoles.castShadow = true;
    this.lamps = new THREE.InstancedMesh(new THREE.CircleGeometry(0.12, 8), new THREE.MeshBasicMaterial({ map: arrowTexture(), toneMapped: false }), lampCount);
    // Arrows painted in the three lanes of each avenue before the crossing (one mesh per arrow kind).
    const arrowMeshes = MOVES.map((mv) => new THREE.InstancedMesh(new THREE.PlaneGeometry(1.4, 4.2).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: roadArrowTexture(mv), transparent: true, depthWrite: false, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }), Math.max(1, nWide)));
    const arrowCount = [0, 0, 0];
    const up = new THREE.Vector3(0, 1, 0);
    const base = new THREE.Object3D(), lamp = new THREE.Object3D();
    base.add(lamp);
    let si = 0, li = 0;
    for (const j of this.junctions) {
      const C = N[j.node];
      for (const a of j.approaches) {
        // Cars drive towards the crossing along d; the pole stands on their right, behind the stop line.
        const d = norm({ x: C.x - N[a.from].x, z: C.z - N[a.from].z }), r = { x: -d.z, z: d.x };
        const isWide = wide(a, j.node);
        const back = graph.crossHalf(j.node, a.from) + 4.6, out = graph.halfOf(a.from, j.node) + 1.2;
        const x = C.x - d.x * back + r.x * out, z = C.z - d.z * back + r.z * out;
        base.position.set(x, groundHeight(x, z), z);
        // Local +Z faces the cars (towards -d); local -X points over the road (towards -r).
        base.quaternion.setFromAxisAngle(up, Math.atan2(-d.x, -d.z));
        base.updateMatrixWorld(true);
        if (isWide) longPoles.setMatrixAt(li++, base.matrixWorld); else shortPoles.setMatrixAt(si++, base.matrixWorld);
        const heads = isWide ? LONG : SHORT;
        MOVES.forEach((mv, h) => {
          ['red', 'amber', 'green'].forEach((_, k) => {
            lamp.position.set(heads[h], 3.6 - k * 0.3, 0.115);
            // The arrow texture points up: turn it for left / right.
            lamp.rotation.set(0, 0, mv === 'left' ? Math.PI / 2 : mv === 'right' ? -Math.PI / 2 : 0);
            lamp.updateMatrixWorld(true);
            this.lamps.setMatrixAt(a.lamp0 + h * 3 + k, lamp.matrixWorld);
          });
          if (isWide) {
            // The road arrow in this lane, 12 m before the stop line, pointing the way cars drive.
            const ax = C.x - d.x * (back + 12) + r.x * WIDE_LANES[h], az = C.z - d.z * (back + 12) + r.z * WIDE_LANES[h];
            const mm = new THREE.Matrix4().makeRotationY(Math.atan2(d.x, d.z)).setPosition(ax, groundHeight(ax, az) + 0.04, az);
            arrowMeshes[h].setMatrixAt(arrowCount[h]++, mm);
          }
        });
      }
    }
    arrowMeshes.forEach((m, h) => { m.count = arrowCount[h]; m.instanceMatrix.needsUpdate = true; m.receiveShadow = true; });
    longPoles.instanceMatrix.needsUpdate = true;
    const poles = shortPoles;
    this.group.add(longPoles, ...arrowMeshes);
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
