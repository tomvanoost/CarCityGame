import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { PETTING } from '../city/outskirts';
import { groundHeight } from './collision';
import { createIcon } from './markers';

export type FarmAnimalKind = 'goat' | 'sheep' | 'rabbit' | 'pony';
export const FEED_PRICE = 2;
export const ANIMAL_EMOJI: Record<FarmAnimalKind, string> = { goat: '🐐', sheep: '🐑', rabbit: '🐰', pony: '🐴' };

const paint = (g: THREE.BufferGeometry, color: string) => {
  const geo = g.index ? g.toNonIndexed() : g;
  const c = new THREE.Color(color), n = geo.getAttribute('position').count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) a.set([c.r, c.g, c.b], i * 3);
  geo.setAttribute('color', new THREE.BufferAttribute(a, 3));
  geo.deleteAttribute('uv');
  return geo;
};
const box = (w: number, h: number, d: number, x: number, y: number, z: number, color: string) => paint(new THREE.BoxGeometry(w, h, d).translate(x, y, z), color);

/** A friendly low-poly animal, looking along +Z, feet at y = 0. */
function animalGeometry(kind: FarmAnimalKind): THREE.BufferGeometry {
  const p: THREE.BufferGeometry[] = [];
  const legs = (h: number, x: number, z: number, w: number, color: string) => {
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) p.push(box(w, h, w, sx * x, h / 2, sz * z, color));
  };
  const eyes = (y: number, z: number, x: number) => { for (const s of [-1, 1]) p.push(box(0.05, 0.05, 0.03, s * x, y, z, '#1c1d20')); };
  if (kind === 'sheep') {
    legs(0.35, 0.18, 0.28, 0.09, '#2b2b2b');
    p.push(paint(new THREE.SphereGeometry(0.38, 10, 8).scale(1, 0.85, 1.25).translate(0, 0.62, 0), '#f4f1ea'));
    p.push(box(0.24, 0.24, 0.3, 0, 0.75, 0.52, '#2b2b2b'));
    for (const s of [-1, 1]) p.push(box(0.14, 0.05, 0.08, s * 0.17, 0.82, 0.5, '#2b2b2b'));
    eyes(0.8, 0.675, 0.07);
  } else if (kind === 'goat') {
    legs(0.42, 0.14, 0.26, 0.08, '#8a6a4a');
    p.push(box(0.36, 0.34, 0.75, 0, 0.6, 0, '#d9cbb5'));
    p.push(box(0.2, 0.32, 0.18, 0, 0.86, 0.38, '#d9cbb5'));
    p.push(box(0.2, 0.2, 0.3, 0, 1.0, 0.52, '#e8dccb'));
    for (const s of [-1, 1]) p.push(box(0.05, 0.22, 0.05, s * 0.07, 1.18, 0.45, '#6b5a48').rotateX(-0.4)); // horns
    p.push(box(0.06, 0.14, 0.06, 0, 0.84, 0.66, '#cbb89c')); // beard
    eyes(1.04, 0.675, 0.07);
  } else if (kind === 'rabbit') {
    p.push(paint(new THREE.SphereGeometry(0.17, 10, 8).scale(1, 0.85, 1.25).translate(0, 0.16, 0), '#c9a27a'));
    p.push(paint(new THREE.SphereGeometry(0.11, 10, 8).translate(0, 0.28, 0.17), '#c9a27a'));
    for (const s of [-1, 1]) p.push(box(0.05, 0.2, 0.03, s * 0.045, 0.45, 0.15, '#c9a27a'));
    p.push(paint(new THREE.SphereGeometry(0.06, 8, 6).translate(0, 0.2, -0.22), '#ffffff')); // tail
    eyes(0.31, 0.275, 0.05);
  } else {
    legs(0.75, 0.18, 0.42, 0.11, '#7a4f2e');
    p.push(box(0.46, 0.46, 1.1, 0, 0.98, 0, '#9a6538'));
    p.push(box(0.28, 0.5, 0.26, 0, 1.3, 0.55, '#9a6538').rotateX(0)); // neck
    p.push(box(0.26, 0.26, 0.48, 0, 1.55, 0.72, '#9a6538'));
    p.push(box(0.08, 0.5, 0.42, 0, 1.4, 0.5, '#3a2a1c')); // mane
    p.push(box(0.1, 0.5, 0.1, 0, 0.85, -0.6, '#3a2a1c').rotateX(0.3)); // tail
    for (const s of [-1, 1]) p.push(box(0.06, 0.14, 0.06, s * 0.08, 1.74, 0.6, '#9a6538'));
    eyes(1.6, 0.965, 0.1);
  }
  return mergeGeometries(p)!;
}

interface Animal {
  kind: FarmAnimalKind;
  mesh: THREE.Mesh;
  x: number;
  z: number;
  heading: number;
  tx: number;
  tz: number;
  wait: number;
  /** Happy time after being fed: hops and wiggles. */
  happy: number;
  heart?: THREE.Sprite;
}

/** The petting farm: fence with a gate, a hay rack, a sign, and animals that stroll around. */
export class PettingFarm {
  readonly group = new THREE.Group();
  readonly animals: Animal[] = [];
  private time = 0;

  constructor() {
    const P = PETTING, x0 = P.x - P.w / 2, x1 = P.x + P.w / 2, z0 = P.z - P.d / 2, z1 = P.z + P.d / 2;
    const y = groundHeight(P.x, P.z);
    const parts: THREE.BufferGeometry[] = [];
    // Fence: posts every 2 m, two rails; a gap for the gate on the east side.
    const fence = (ax: number, az: number, bx: number, bz: number) => {
      const len = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.round(len / 2)), rot = Math.atan2(bx - ax, bz - az);
      for (let i = 0; i <= n; i++) parts.push(box(0.14, 1.1, 0.14, ax + ((bx - ax) * i) / n, 0.55, az + ((bz - az) * i) / n, '#8a5a35'));
      for (const h of [0.45, 0.9]) parts.push(box(0.07, 0.1, len, 0, h, 0, '#a8703f').rotateY(rot).translate((ax + bx) / 2, 0, (az + bz) / 2));
    };
    fence(x0, z0, x1, z0); fence(x0, z1, x1, z1); fence(x0, z0, x0, z1);
    fence(x1, z0, x1, P.z - P.gate / 2); fence(x1, P.z + P.gate / 2, x1, z1);
    // Hay rack with hay, a water trough and a little shed in a corner.
    parts.push(box(2.4, 0.9, 1, x0 + 3, 0.45, z0 + 2, '#8a5a35'), box(2.2, 0.5, 0.8, x0 + 3, 1.05, z0 + 2, '#e3c463'));
    parts.push(box(2, 0.45, 0.7, x0 + 3, 0.22, z1 - 2, '#7a7f86'), box(1.8, 0.05, 0.5, x0 + 3, 0.46, z1 - 2, '#4f9ae0'));
    parts.push(box(3.2, 2.2, 3, x0 + 2.4, 1.1, P.z, '#b13a2e'), box(3.6, 0.2, 3.4, x0 + 2.4, 2.3, P.z, '#4a4f57'));
    // A sign by the gate.
    parts.push(box(0.1, 1.8, 0.1, x1 + 1.2, 0.9, P.z + P.gate / 2 + 0.6, '#8a5a35'), box(0.06, 0.7, 1.4, x1 + 1.2, 1.7, P.z + P.gate / 2 + 0.6, '#f3e3c3'));
    const deco = new THREE.Mesh(mergeGeometries(parts)!, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 }));
    deco.position.y = y;
    deco.castShadow = true;
    deco.receiveShadow = true;
    const sign = createIcon('🐐', '#2fa84f', 0.05);
    sign.position.set(x1 + 1.3, y + 3, P.z + P.gate / 2 + 0.6);
    this.group.add(deco, sign);

    const kinds: FarmAnimalKind[] = ['goat', 'goat', 'sheep', 'sheep', 'rabbit', 'rabbit', 'pony'];
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75 });
    const geos = new Map<FarmAnimalKind, THREE.BufferGeometry>();
    kinds.forEach((kind, i) => {
      if (!geos.has(kind)) geos.set(kind, animalGeometry(kind));
      const mesh = new THREE.Mesh(geos.get(kind)!, mat);
      mesh.castShadow = true;
      const x = P.x - 4 + (i % 4) * 3, z = P.z - 4 + Math.floor(i / 4) * 6;
      this.animals.push({ kind, mesh, x, z, heading: i, tx: x, tz: z, wait: i * 0.7, happy: 0 });
      this.group.add(mesh);
    });
    this.update(0);
  }

  /** The animal you're standing next to (within reach), if any. */
  nearest(x: number, z: number, reach = 2.2) {
    let best: Animal | null = null, bd = reach;
    for (const a of this.animals) {
      const d = Math.hypot(a.x - x, a.z - z);
      if (d < bd) { bd = d; best = a; }
    }
    return best;
  }

  /** It ate: hop, wiggle and a heart. */
  feed(a: Animal, faceX: number, faceZ: number) {
    a.happy = 1.6;
    a.wait = 2.5;
    a.tx = a.x; a.tz = a.z;
    a.heading = Math.atan2(faceX - a.x, faceZ - a.z);
    if (!a.heart) {
      a.heart = createIcon('❤️', '#ff6f91', 0.04);
      this.group.add(a.heart);
    }
    a.heart.visible = true;
  }

  update(dt: number) {
    this.time += dt;
    const P = PETTING, m = 2.2;
    for (const a of this.animals) {
      a.wait -= dt;
      a.happy = Math.max(0, a.happy - dt);
      const dx = a.tx - a.x, dz = a.tz - a.z, d = Math.hypot(dx, dz);
      const speed = a.kind === 'pony' ? 0.9 : a.kind === 'rabbit' ? 1.1 : 0.6;
      if (a.wait <= 0 && d < 0.2) {
        // Pick a new spot inside the fence (away from the shed) and stroll there after a little rest.
        a.tx = P.x - P.w / 2 + 5 + Math.random() * (P.w - 5 - m);
        a.tz = P.z - P.d / 2 + m + Math.random() * (P.d - 2 * m);
        a.wait = 2 + Math.random() * 4;
      }
      let moving = false;
      if (a.wait <= 0 && d >= 0.2 && a.happy <= 0) {
        a.heading += Math.atan2(Math.sin(Math.atan2(dx, dz) - a.heading), Math.cos(Math.atan2(dx, dz) - a.heading)) * Math.min(1, dt * 4);
        a.x += Math.sin(a.heading) * speed * dt;
        a.z += Math.cos(a.heading) * speed * dt;
        moving = true;
      }
      const y = groundHeight(a.x, a.z);
      // Rabbits hop when they move; everybody hops and wiggles when happy.
      const hop = a.happy > 0 ? Math.abs(Math.sin(this.time * 9)) * 0.35 : moving && a.kind === 'rabbit' ? Math.abs(Math.sin(this.time * 8)) * 0.15 : 0;
      a.mesh.position.set(a.x, y + hop, a.z);
      a.mesh.rotation.set(0, a.heading + (a.happy > 0 ? Math.sin(this.time * 14) * 0.25 : 0), moving ? Math.sin(this.time * 6) * 0.03 : 0);
      if (a.heart) {
        a.heart.visible = a.happy > 0;
        a.heart.position.set(a.x, y + (a.kind === 'pony' ? 2.3 : a.kind === 'rabbit' ? 0.9 : 1.5) + (1.6 - a.happy) * 0.5, a.z);
      }
    }
  }

  dispose() {
    this.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) { m.geometry.dispose(); (m.material as THREE.Material).dispose(); }
      if ((o as THREE.Sprite).isSprite) { const s = o as THREE.Sprite; s.material.map?.dispose(); s.material.dispose(); }
    });
    this.group.removeFromParent();
  }
}
