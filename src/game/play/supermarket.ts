import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { CityLayout } from '../city/layout';
import { groundHeight } from './collision';

export type SnackId = 'juice' | 'banana' | 'chocolate';
/** What the supermarket sells: price, and what it does for a minute. */
export const SNACKS: { id: SnackId; emoji: string; price: number }[] = [
  { id: 'juice', emoji: '🧃', price: 3 }, // run faster
  { id: 'banana', emoji: '🍌', price: 2 }, // jump higher
  { id: 'chocolate', emoji: '🍫', price: 2 }, // hold a chocolate bar
];
export const SNACK_TIME = 60;

const paint = (g: THREE.BufferGeometry, color: string) => {
  const geo = g.index ? g.toNonIndexed() : g;
  const c = new THREE.Color(color), n = geo.getAttribute('position').count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) a.set([c.r, c.g, c.b], i * 3);
  geo.setAttribute('color', new THREE.BufferAttribute(a, 3));
  geo.deleteAttribute('uv');
  return geo;
};

/** A chocolate bar in its wrapper (for holding), about 14 cm. */
export function chocolateGeometry(): THREE.BufferGeometry {
  return mergeGeometries([
    paint(new THREE.BoxGeometry(0.06, 0.14, 0.02).translate(0, 0.07, 0), '#6b3d22'),
    paint(new THREE.BoxGeometry(0.062, 0.07, 0.022).translate(0, 0.035, 0), '#e5484d'),
  ])!;
}

/** "🛒 SUPERMARKT" sign texture. */
function signTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 96;
  const g = c.getContext('2d')!;
  g.fillStyle = '#e5484d'; g.fillRect(0, 0, 512, 96);
  g.fillStyle = '#ffffff';
  g.font = '900 56px Nunito, Arial, sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('🛒 SUPERMARKT', 256, 52);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/**
 * The supermarket: a big store with a glass front, a red sign, a few rooftop units and a parking
 * lot with white lines. One merged mesh plus the sign.
 */
export class SupermarketBuilding {
  readonly group = new THREE.Group();

  constructor(layout: CityLayout) {
    const sm = layout.pois.supermarket;
    const y = groundHeight(sm.x, sm.z);
    const parts: THREE.BufferGeometry[] = [];
    const box = (w: number, h: number, d: number, x: number, yy: number, z: number, color: string) =>
      parts.push(paint(new THREE.BoxGeometry(w, h, d).translate(x, yy, z), color));
    const fz = sm.d / 2;
    box(sm.w, 7, sm.d, 0, 3.5, 0, '#eef0f2'); // walls
    box(sm.w + 0.6, 0.5, sm.d + 0.6, 0, 7.2, 0, '#c9ced4'); // roof edge
    box(sm.w * 0.8, 3.2, 0.1, 0, 1.8, fz + 0.03, '#2b4a66'); // glass front
    box(4, 2.8, 0.12, 0, 1.4, fz + 0.06, '#7fb2d9'); // entrance doors
    box(sm.w, 0.6, 2.2, 0, 3.8, fz + 1.1, '#e5484d'); // canopy over the entrance
    for (const x of [-sm.w / 2 + 1, sm.w / 2 - 1]) box(0.3, 3.5, 0.3, x, 1.75, fz + 2, '#c9ced4');
    for (const [x, z] of [[-8, -4], [0, 3], [9, -2]]) box(3, 1.2, 2.2, x, 8, z, '#9aa3ad'); // rooftop units
    // Shopping carts by the door.
    for (let k = 0; k < 4; k++) box(0.6, 0.8, 0.9, 6 + k * 0.25, 0.5, fz + 2.8, '#b8c0c8');
    // Parking lot lines.
    const p = sm.parking;
    for (let x = p.x0 + 3; x < p.x1 - 2; x += 3.2) parts.push(paint(new THREE.PlaneGeometry(0.15, 5).rotateX(-Math.PI / 2).translate(x - sm.x, 0.035, p.z0 + 3.5 - sm.z), '#ffffff'));
    const mesh = new THREE.Mesh(mergeGeometries(parts)!, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, metalness: 0 }));
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    // Asphalt parking lot (slightly above the lot so it never flickers).
    const lotMesh = new THREE.Mesh(new THREE.PlaneGeometry(p.x1 - p.x0, p.z1 - p.z0).rotateX(-Math.PI / 2).translate((p.x0 + p.x1) / 2 - sm.x, 0.02, (p.z0 + p.z1) / 2 - sm.z),
      new THREE.MeshStandardMaterial({ color: '#4a4d52', roughness: 0.95, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 }));
    lotMesh.receiveShadow = true;
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(14, 2.6), new THREE.MeshStandardMaterial({ map: signTexture(), roughness: 0.6 }));
    sign.position.set(0, 5.6, fz + 0.06);
    this.group.add(lotMesh, mesh, sign);
    this.group.position.set(sm.x, y, sm.z);
  }

  dispose() {
    this.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      m.geometry.dispose();
      const mat = m.material as THREE.MeshStandardMaterial;
      mat.map?.dispose();
      mat.dispose();
    });
    this.group.removeFromParent();
  }
}
