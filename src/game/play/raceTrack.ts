import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RACE, racePoints } from '../city/outskirts';
import { groundHeight } from './collision';
import { createBeacon, tickBeacon } from './markers';

/** Checkpoint arches along the loop (the start/finish arch comes on top). */
export const CHECKPOINTS = 6;
/** Prize money per medal. */
export const MEDAL_PRIZE = { gold: 150, silver: 100, bronze: 50 } as const;
export type Medal = keyof typeof MEDAL_PRIZE;

const paint = (g: THREE.BufferGeometry, color: string) => {
  const geo = g.index ? g.toNonIndexed() : g;
  const c = new THREE.Color(color), n = geo.getAttribute('position').count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) a.set([c.r, c.g, c.b], i * 3);
  geo.setAttribute('color', new THREE.BufferAttribute(a, 3));
  geo.deleteAttribute('uv');
  return geo;
};

/** Track length in meters (the closed loop). */
export function raceLength() {
  const p = racePoints();
  let l = 0;
  for (let i = 0; i < p.length; i++) l += Math.hypot(p[(i + 1) % p.length].x - p[i].x, p[(i + 1) % p.length].z - p[i].z);
  return l;
}

/** Medal for a lap time; the times scale with the car's top speed so every car can win gold. */
export function medalFor(seconds: number, topSpeedKmh: number): Medal {
  const ideal = raceLength() / ((Math.min(topSpeedKmh, 200) / 3.6) * 0.62);
  return seconds <= ideal * 1.2 ? 'gold' : seconds <= ideal * 1.6 ? 'silver' : 'bronze';
}

/** The desert race track: dirt surface, red/white curbs, checkpoint arches and a checkered start/finish arch. */
export class RaceTrack {
  readonly group = new THREE.Group();
  /** Checkpoint positions (index 0 = start/finish), with the track direction there. */
  readonly gates: { x: number; z: number; dir: number }[] = [];
  private beacon: THREE.Mesh;
  private time = 0;

  constructor() {
    const p = racePoints(), n = p.length;
    const dirAt = (i: number) => {
      const a = p[(i - 1 + n) % n], b = p[(i + 1) % n];
      return Math.atan2(b.x - a.x, b.z - a.z);
    };
    // ---- surface: one ribbon around the loop, plus the access path ----
    const pos: number[] = [], col: number[] = [];
    const dirt = new THREE.Color('#b98a52'), dark = new THREE.Color('#a87a45');
    const quad = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3, color: THREE.Color) => {
      for (const v of [a, b, c, a, c, d]) { pos.push(v.x, v.y, v.z); col.push(color.r, color.g, color.b); }
    };
    const edge = (i: number, side: number, w: number) => {
      const d = dirAt(i), x = p[i].x + Math.cos(d) * side * w, z = p[i].z - Math.sin(d) * side * w;
      return new THREE.Vector3(x, groundHeight(x, z) + 0.06, z);
    };
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      quad(edge(i, -1, RACE.half), edge(j, -1, RACE.half), edge(j, 1, RACE.half), edge(i, 1, RACE.half), i % 2 ? dirt : dark);
    }
    const ax = RACE.access.x, az0 = RACE.access.z0, az1 = p[0].z, w = 3.5;
    const v = (x: number, z: number) => new THREE.Vector3(x, groundHeight(x, z) + 0.05, z);
    for (let s = 0; s < 12; s++) {
      const za = az0 + ((az1 - az0) * s) / 12, zb = az0 + ((az1 - az0) * (s + 1)) / 12;
      quad(v(ax - w, za), v(ax - w, zb), v(ax + w, zb), v(ax + w, za), dirt);
    }
    const surf = new THREE.BufferGeometry();
    surf.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    surf.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    surf.computeVertexNormals();
    const surface = new THREE.Mesh(surf, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
    surface.receiveShadow = true;

    // ---- curbs, arches and start line (one merged mesh) ----
    const parts: THREE.BufferGeometry[] = [];
    for (let i = 0; i < n; i++) {
      const d = dirAt(i), len = Math.hypot(p[(i + 1) % n].x - p[i].x, p[(i + 1) % n].z - p[i].z) + 0.3;
      for (const side of [-1, 1]) {
        const e = edge(i, side, RACE.half + 0.5), e2 = edge((i + 1) % n, side, RACE.half + 0.5);
        const g = new THREE.BoxGeometry(1, 0.25, len).rotateY(d).translate((e.x + e2.x) / 2, (e.y + e2.y) / 2 + 0.06, (e.z + e2.z) / 2);
        parts.push(paint(g, i % 2 ? '#ffffff' : '#e5484d'));
      }
    }
    const arch = (i: number, color: string, checkered: boolean) => {
      const d = dirAt(i), cx = p[i].x, cz = p[i].z, y = groundHeight(cx, cz), span = RACE.half + 1.6;
      const local: THREE.BufferGeometry[] = [];
      for (const side of [-1, 1]) local.push(paint(new THREE.CylinderGeometry(0.45, 0.55, 6.4, 10).translate(side * span, 3.2, 0), color));
      if (checkered) {
        for (let k = 0; k < 14; k++) for (let r = 0; r < 2; r++) {
          local.push(paint(new THREE.BoxGeometry((span * 2) / 14, 0.6, 0.3).translate(-span + (k + 0.5) * (span * 2) / 14, 5.9 + r * 0.6, 0), (k + r) % 2 ? '#ffffff' : '#1c1d20'));
        }
        // Start line on the ground.
        for (let k = 0; k < 13; k++) for (let r = 0; r < 2; r++) {
          local.push(paint(new THREE.BoxGeometry(1, 0.04, 0.8).translate(-RACE.half + 0.5 + k, 0.1, (r - 0.5) * 0.8), (k + r) % 2 ? '#ffffff' : '#1c1d20'));
        }
      } else {
        local.push(paint(new THREE.CylinderGeometry(0.6, 0.6, span * 2, 12).rotateZ(Math.PI / 2).translate(0, 6.2, 0), color));
      }
      for (const g of local) parts.push(g.rotateY(d).translate(cx, y, cz));
    };
    arch(0, '#1c1d20', true);
    const colors = ['#e5484d', '#ff9f1c', '#f5c400', '#2fa84f', '#1f6fe0', '#8e5bd9'];
    this.gates.push({ x: p[0].x, z: p[0].z, dir: dirAt(0) });
    for (let k = 1; k <= CHECKPOINTS; k++) {
      const i = Math.round((k / (CHECKPOINTS + 1)) * n);
      arch(i, colors[(k - 1) % colors.length], false);
      this.gates.push({ x: p[i].x, z: p[i].z, dir: dirAt(i) });
    }
    const deco = new THREE.Mesh(mergeGeometries(parts)!, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 }));
    deco.castShadow = true;
    deco.receiveShadow = true;

    this.beacon = createBeacon('#ffd400', RACE.half + 1, 16);
    this.beacon.visible = false;
    this.group.add(surface, deco, this.beacon);
  }

  /** Show the glowing column at a gate (null hides it). */
  highlight(gate: number | null) {
    this.beacon.visible = gate !== null;
    if (gate === null) return;
    const g = this.gates[gate];
    this.beacon.position.set(g.x, groundHeight(g.x, g.z), g.z);
  }

  update(dt: number) {
    this.time += dt;
    if (this.beacon.visible) tickBeacon(this.beacon, this.time);
  }

  dispose() {
    this.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) { m.geometry.dispose(); (m.material as THREE.Material).dispose(); }
    });
    this.group.removeFromParent();
  }
}
