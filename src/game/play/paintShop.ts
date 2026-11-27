import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { CityLayout } from '../city/layout';
import { groundHeight } from './collision';

export const PAINT_PRICE = 50;
export const EXTRA_PRICE = 80;
export const NEON_PRICE = 150;
export const SPOILER_PRICE = 100;

const paint = (g: THREE.BufferGeometry, color: string) => {
  const geo = g.index ? g.toNonIndexed() : g;
  const c = new THREE.Color(color), n = geo.getAttribute('position').count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) a.set([c.r, c.g, c.b], i * 3);
  geo.setAttribute('color', new THREE.BufferAttribute(a, 3));
  geo.deleteAttribute('uv');
  return geo;
};
const box = (w: number, h: number, d: number, x: number, y: number, z: number, color: string) => paint(new THREE.BoxGeometry(w, h, d).translate(x, y, z), color);

function signTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 96;
  const g = c.getContext('2d')!;
  const grad = g.createLinearGradient(0, 0, 512, 0);
  ['#e5484d', '#ff9f1c', '#f5c400', '#2fa84f', '#1f6fe0', '#8e5bd9'].forEach((col, i, a) => grad.addColorStop(i / (a.length - 1), col));
  g.fillStyle = grad; g.fillRect(0, 0, 512, 96);
  g.fillStyle = '#ffffff';
  g.font = '900 54px Nunito, Arial, sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('🔧 GARAGE 🎨', 256, 52);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** The paint shop: a garage with a wide open door, a rainbow sign, paint cans and a spray booth light inside. */
export class PaintShopBuilding {
  readonly group = new THREE.Group();

  constructor(layout: CityLayout) {
    const ps = layout.pois.paintShop;
    const parts: THREE.BufferGeometry[] = [
      box(14, 6, 11, 0, 3, 0, '#e9edf2'),
      box(14.4, 0.4, 11.4, 0, 6.2, 0, '#5a6170'),
      box(8, 4.2, 0.1, 0, 2.1, 5.52, '#22262e'), // open door (dark inside)
      box(8.4, 0.3, 0.2, 0, 4.35, 5.55, '#f5c400'),
    ];
    // Rainbow stripes along the side walls.
    ['#e5484d', '#ff9f1c', '#f5c400', '#2fa84f', '#1f6fe0', '#8e5bd9'].forEach((c, i) => {
      for (const side of [-1, 1]) parts.push(box(0.05, 0.3, 10, side * 7.03, 1 + i * 0.3, 0, c));
    });
    // Paint cans by the door.
    ['#e5484d', '#1f6fe0', '#f5c400', '#2fa84f'].forEach((c, i) => {
      parts.push(paint(new THREE.CylinderGeometry(0.3, 0.3, 0.5, 10).translate(5.2 + (i % 2) * 0.7, 0.25 + Math.floor(i / 2) * 0.5, 6.2), c));
    });
    const mesh = new THREE.Mesh(mergeGeometries(parts)!, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0 }));
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(8, 1.5), new THREE.MeshStandardMaterial({ map: signTexture(), roughness: 0.6 }));
    sign.position.set(0, 5.2, 5.57);
    this.group.add(mesh, sign);
    this.group.position.set(ps.x, groundHeight(ps.x, ps.z), ps.z);
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
