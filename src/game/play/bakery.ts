import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { CityLayout } from '../city/layout';
import { groundHeight } from './collision';

export type BakeryId = 'croissant' | 'cake' | 'cookie';
/** What the bakery sells: price, and what it does for a while (you hold it while it lasts). */
export const BAKERY: { id: BakeryId; emoji: string; price: number }[] = [
  { id: 'croissant', emoji: '🥐', price: 4 }, // run faster
  { id: 'cake', emoji: '🍰', price: 6 }, // jump higher
  { id: 'cookie', emoji: '🍪', price: 3 }, // a little of both
];
export const BAKERY_TIME = 60;

const paint = (g: THREE.BufferGeometry, color: string) => {
  const geo = g.index ? g.toNonIndexed() : g;
  const c = new THREE.Color(color), n = geo.getAttribute('position').count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) a.set([c.r, c.g, c.b], i * 3);
  geo.setAttribute('color', new THREE.BufferAttribute(a, 3));
  geo.deleteAttribute('uv');
  return geo;
};

/** The treat to hold in your hand (built standing up, about 10-15 cm). */
export function bakeryGeometry(id: BakeryId): THREE.BufferGeometry {
  if (id === 'croissant') {
    // A curved roll: a few fat segments along an arc, darker at the ends.
    const parts: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 5; i++) {
      const a = -0.9 + i * 0.45, r = i === 2 ? 0.035 : i === 0 || i === 4 ? 0.02 : 0.03;
      parts.push(paint(new THREE.SphereGeometry(r, 8, 6).scale(1, 1, 1.3).translate(Math.sin(a) * 0.06, 0.06 + Math.cos(a) * 0.03, 0), i === 2 ? '#e0a050' : '#c98a3c'));
    }
    return mergeGeometries(parts)!;
  }
  if (id === 'cake') {
    // A wedge of layer cake with cream and a strawberry.
    const wedge = (h: number, y: number, color: string) => paint(new THREE.CylinderGeometry(0.09, 0.09, h, 12, 1, false, 0, Math.PI / 3).translate(0, y, 0), color);
    return mergeGeometries([
      wedge(0.035, 0.02, '#f2d9a6'), wedge(0.012, 0.044, '#f6f0e8'), wedge(0.035, 0.068, '#f2d9a6'), wedge(0.014, 0.093, '#ffffff'),
      paint(new THREE.SphereGeometry(0.016, 8, 6).translate(0.035, 0.11, 0.035), '#e5484d'),
    ])!;
  }
  // Cookie: a flat disc with chocolate chips, standing up.
  const parts: THREE.BufferGeometry[] = [paint(new THREE.CylinderGeometry(0.06, 0.06, 0.018, 16).rotateX(Math.PI / 2).translate(0, 0.07, 0), '#d9a35b')];
  for (const [x, y] of [[0.02, 0.09], [-0.025, 0.075], [0.01, 0.05], [-0.01, 0.1], [0.03, 0.06]]) {
    parts.push(paint(new THREE.SphereGeometry(0.009, 5, 4).translate(x, y, 0.01), '#4a2a18'), paint(new THREE.SphereGeometry(0.009, 5, 4).translate(-x, y, -0.01), '#4a2a18'));
  }
  return mergeGeometries(parts)!;
}

/** "🥐 BAKKERIJ" sign texture. */
function signTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 96;
  const g = c.getContext('2d')!;
  g.fillStyle = '#7a4a2a'; g.fillRect(0, 0, 512, 96);
  g.strokeStyle = '#f2d9a6'; g.lineWidth = 6; g.strokeRect(6, 6, 500, 84);
  g.fillStyle = '#fff3d6';
  g.font = '900 54px Nunito, Arial, sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('🥐 BAKKERIJ', 256, 52);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** The bakery on the lake town square: a cosy shop with a striped awning, a shop window with breads and a sign. */
export class BakeryBuilding {
  readonly group = new THREE.Group();

  constructor(layout: CityLayout) {
    const bk = layout.pois.bakery;
    const parts: THREE.BufferGeometry[] = [];
    const box = (w: number, h: number, d: number, x: number, y: number, z: number, color: string) => parts.push(paint(new THREE.BoxGeometry(w, h, d).translate(x, y, z), color));
    box(9, 4.6, 7, 0, 2.3, 0, '#f3e3c3'); // walls
    // Pitched roof: two slanted slabs plus the gable ends.
    for (const s of [-1, 1]) parts.push(paint(new THREE.BoxGeometry(9.6, 0.25, 4.3).rotateX(s * 0.55).translate(0, 5.6, s * 1.8), '#8a4b2c'));
    const gable = new THREE.Shape([new THREE.Vector2(-3.5, 0), new THREE.Vector2(3.5, 0), new THREE.Vector2(0, 2.1)]);
    parts.push(paint(new THREE.ExtrudeGeometry(gable, { depth: 9, bevelEnabled: false }).rotateY(Math.PI / 2).translate(-4.5, 4.6, 0), '#f3e3c3'));
    box(0.8, 1.4, 0.8, 2.6, 6.4, -1, '#a85a3a'); // chimney
    box(6, 1.8, 0.08, -0.6, 1.9, 3.53, '#2e3d4f'); // shop window
    box(1.4, 2.6, 0.1, 3.4, 1.3, 3.54, '#6b3f22'); // door
    box(6.2, 0.15, 0.6, -0.6, 0.9, 3.75, '#d9c7a3'); // window sill / counter
    // Striped awning over the window.
    for (let i = 0; i < 9; i++) parts.push(paint(new THREE.BoxGeometry(0.75, 0.06, 1.3).rotateX(0.4).translate(-3.6 + i * 0.75, 3.15, 4.1), i % 2 ? '#ffffff' : '#c8352d'));
    // Breads in the window.
    for (let i = 0; i < 4; i++) parts.push(paint(new THREE.SphereGeometry(0.28, 8, 6).scale(1.4, 0.7, 0.9).translate(-2.8 + i * 1.5, 1.25, 3.4), i % 2 ? '#c98a3c' : '#e0a050'));
    // A little bench and two flower pots outside.
    box(1.8, 0.1, 0.5, -2.5, 0.5, 4.9, '#7a4a2a');
    for (const x of [-3.2, -1.8]) box(0.1, 0.5, 0.45, x, 0.25, 4.9, '#5a3a22');
    for (const x of [-4.2, 4.2]) {
      parts.push(paint(new THREE.CylinderGeometry(0.32, 0.25, 0.5, 8).translate(x, 0.25, 4.3), '#b55a3c'));
      parts.push(paint(new THREE.SphereGeometry(0.38, 8, 6).translate(x, 0.75, 4.3), '#4f9a4a'));
    }
    const mesh = new THREE.Mesh(mergeGeometries(parts)!, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75 }));
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(5.5, 1.05), new THREE.MeshStandardMaterial({ map: signTexture(), roughness: 0.6 }));
    sign.position.set(-0.3, 4.1, 3.56);
    this.group.add(mesh, sign);
    this.group.position.set(bk.x, groundHeight(bk.x, bk.z), bk.z);
    this.group.rotation.y = bk.rot;
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
