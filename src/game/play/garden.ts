import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { CityLayout } from '../city/layout';
import { groundHeight } from './collision';

export type CropId = 'carrot' | 'tomato' | 'pumpkin';
/** What you can plant: seed price, real minutes to grow, money per vegetable at the supermarket. */
export const CROPS: { id: CropId; emoji: string; price: number; minutes: number; sell: number }[] = [
  { id: 'carrot', emoji: '🥕', price: 5, minutes: 2, sell: 3 },
  { id: 'tomato', emoji: '🍅', price: 5, minutes: 3, sell: 4 },
  { id: 'pumpkin', emoji: '🎃', price: 5, minutes: 4, sell: 6 },
];
/** Vegetables you get from one harvest (the 16 plants in the four beds give 8 good ones). */
export const HARVEST = 8;
export const cropOf = (id: string) => CROPS.find((c) => c.id === id);

/** How far the garden has grown: 0 (just sown) .. 1 (ripe), from the sowing time (epoch ms). */
export function growth(crop: CropId, at: number, now = Date.now()) {
  const c = cropOf(crop)!;
  return Math.max(0, Math.min(1, (now - at) / (c.minutes * 60000)));
}

function paint(g: THREE.BufferGeometry, color: string) {
  const geo = g.index ? g.toNonIndexed() : g;
  const c = new THREE.Color(color), n = geo.getAttribute('position').count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) a.set([c.r, c.g, c.b], i * 3);
  geo.setAttribute('color', new THREE.BufferAttribute(a, 3));
  geo.deleteAttribute('uv');
  return geo;
}
const box = (w: number, h: number, d: number, x: number, y: number, z: number, color: string) => paint(new THREE.BoxGeometry(w, h, d).translate(x, y, z), color);

/** The vegetable that shows when a plant is ripe (sits on / in the soil, plant origin at y = 0). */
function fruitGeometry(crop: CropId) {
  if (crop === 'carrot') return mergeGeometries([paint(new THREE.ConeGeometry(0.09, 0.25, 8).rotateX(Math.PI).translate(0, 0.08, 0), '#ff8a1a')])!;
  if (crop === 'tomato') return mergeGeometries([0, 1, 2].map((i) => paint(new THREE.SphereGeometry(0.09, 10, 8).translate(Math.cos(i * 2.1) * 0.13, 0.32 + i * 0.07, Math.sin(i * 2.1) * 0.13), '#e5332a')))!;
  return mergeGeometries([
    paint(new THREE.SphereGeometry(0.26, 14, 10).scale(1, 0.75, 1).translate(0.18, 0.18, 0.05), '#ff8a1a'),
    paint(new THREE.CylinderGeometry(0.03, 0.04, 0.12, 6).translate(0.18, 0.4, 0.05), '#5a7a2a'),
  ])!;
}

/**
 * Your vegetable garden behind your house: four soil beds in a little white fence, with a watering
 * can and a sign. Plants (leaves + vegetables) are two instanced meshes that grow with `growth()`.
 */
export class Garden {
  readonly group = new THREE.Group();
  private leaves: THREE.InstancedMesh;
  private fruits: Record<CropId, THREE.InstancedMesh>;
  private spots: { x: number; z: number }[] = [];
  private m = new THREE.Matrix4();
  private shown = '';

  constructor(layout: CityLayout) {
    const gd = layout.pois.home.garden;
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 });
    const parts: THREE.BufferGeometry[] = [];
    // Four beds of dark soil with wooden edges (2 x 2), a path between them.
    for (const bx of [-1.4, 1.4]) for (const bz of [-1.2, 1.2]) {
      parts.push(box(2, 0.2, 1.8, bx, 0.1, bz, '#5a3d27'));
      for (const s of [-1, 1]) { parts.push(box(2.1, 0.26, 0.1, bx, 0.13, bz + s * 0.92, '#8a5a35'), box(0.1, 0.26, 1.9, bx + s * 1.02, 0.13, bz, '#8a5a35')); }
      for (const px of [-0.5, 0.5]) for (const pz of [-0.45, 0.45]) this.spots.push({ x: bx + px, z: bz + pz });
    }
    // A low white picket fence around it, open on the house side (+Z).
    const fence = (x0: number, z0: number, x1: number, z1: number) => {
      const len = Math.hypot(x1 - x0, z1 - z0), n = Math.round(len / 0.35);
      for (let i = 0; i <= n; i++) { const k = i / n; parts.push(box(0.08, 0.7, 0.08, x0 + (x1 - x0) * k, 0.35, z0 + (z1 - z0) * k, '#f4f1ea')); }
      const alongX = Math.abs(x1 - x0) > Math.abs(z1 - z0);
      parts.push(box(alongX ? len : 0.05, 0.06, alongX ? 0.05 : len, (x0 + x1) / 2, 0.5, (z0 + z1) / 2, '#f4f1ea'));
    };
    fence(-3, -2.7, 3, -2.7); fence(-3, -2.7, -3, 2.7); fence(3, -2.7, 3, 2.7);
    fence(-3, 2.7, -1.1, 2.7); fence(1.1, 2.7, 3, 2.7);
    // Watering can and a sign with a carrot on it.
    parts.push(paint(new THREE.CylinderGeometry(0.16, 0.18, 0.3, 10).translate(2.5, 0.15, 2.2), '#2f9e6a'));
    parts.push(paint(new THREE.CylinderGeometry(0.025, 0.04, 0.35, 6).rotateZ(-0.9).translate(2.72, 0.26, 2.2), '#2f9e6a'));
    parts.push(box(0.06, 1, 0.06, -2.6, 0.5, 2.4, '#8a5a35'), box(0.7, 0.45, 0.04, -2.6, 1.05, 2.42, '#fff3c4'));
    parts.push(paint(new THREE.ConeGeometry(0.08, 0.32, 8).rotateZ(Math.PI / 2).translate(-2.6, 1.05, 2.46), '#ff8a1a'));
    const base = new THREE.Mesh(mergeGeometries(parts)!, mat);
    base.receiveShadow = true;
    // Plants: a leafy tuft (all crops) and the vegetable for each crop.
    const leaf = mergeGeometries([0, 1, 2, 3, 4].map((i) => paint(new THREE.ConeGeometry(0.06, 0.45, 5).rotateZ(0.35).rotateY((i / 5) * Math.PI * 2).translate(0, 0.22, 0), i % 2 ? '#4caf50' : '#6cc04a')))!;
    this.leaves = new THREE.InstancedMesh(leaf, mat, this.spots.length);
    this.fruits = { carrot: null!, tomato: null!, pumpkin: null! };
    for (const c of CROPS) {
      const f = new THREE.InstancedMesh(fruitGeometry(c.id), mat, this.spots.length);
      f.visible = false;
      this.fruits[c.id] = f;
    }
    this.leaves.visible = false;
    this.group.add(base, this.leaves, ...Object.values(this.fruits));
    this.group.position.set(gd.x, groundHeight(gd.x, gd.z), gd.z);
    this.group.rotation.y = gd.rot;
  }

  /** Show the plants: crop (null = empty beds) and how far they have grown (0..1). */
  update(crop: CropId | null, grown: number) {
    const key = `${crop}:${grown.toFixed(2)}`;
    if (key === this.shown) return;
    this.shown = key;
    this.leaves.visible = !!crop;
    for (const c of CROPS) this.fruits[c.id].visible = crop === c.id && grown > 0.55;
    if (!crop) return;
    // Leaves grow from tiny sprouts; the vegetables appear and swell in the second half.
    const leafScale = 0.15 + 0.85 * Math.min(1, grown / 0.7), fruitScale = Math.max(0.01, Math.min(1, (grown - 0.55) / 0.45));
    const s = new THREE.Vector3(), q = new THREE.Quaternion(), p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    this.spots.forEach((sp, i) => {
      q.setFromAxisAngle(up, i * 1.7);
      this.m.compose(p.set(sp.x, 0.2, sp.z), q, s.setScalar(leafScale * (crop === 'pumpkin' ? 1.25 : 1)));
      this.leaves.setMatrixAt(i, this.m);
      this.m.compose(p.set(sp.x, 0.2, sp.z), q, s.setScalar(fruitScale));
      this.fruits[crop].setMatrixAt(i, this.m);
    });
    this.leaves.instanceMatrix.needsUpdate = true;
    this.fruits[crop].instanceMatrix.needsUpdate = true;
  }

  dispose() {
    this.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) { m.geometry.dispose(); (m.material as THREE.Material).dispose(); }
    });
    this.group.removeFromParent();
  }
}
