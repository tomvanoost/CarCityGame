import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { CityLayout } from '../city/layout';
import { groundHeight } from './collision';

export const ICE_CREAM_PRICE = 5;
/** How long you hold the ice cream (seconds). */
export const ICE_CREAM_TIME = 60;

export type Flavor = 'strawberry' | 'chocolate' | 'vanilla' | 'mint';
export const FLAVORS: { id: Flavor; emoji: string; color: string }[] = [
  { id: 'strawberry', emoji: '🍓', color: '#f7a1b8' },
  { id: 'chocolate', emoji: '🍫', color: '#7b4a2d' },
  { id: 'vanilla', emoji: '🍦', color: '#fbf0cf' },
  { id: 'mint', emoji: '🌿', color: '#a8e6c8' },
];

const paint = (g: THREE.BufferGeometry, color: string) => {
  const geo = g.index ? g.toNonIndexed() : g;
  const c = new THREE.Color(color), n = geo.getAttribute('position').count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) a.set([c.r, c.g, c.b], i * 3);
  geo.setAttribute('color', new THREE.BufferAttribute(a, 3));
  geo.deleteAttribute('uv');
  return geo;
};

/** An ice cream cone (cone + 1 scoop), about 18 cm tall, standing on y = 0. */
export function coneGeometry(scoop: string): THREE.BufferGeometry {
  return mergeGeometries([
    paint(new THREE.ConeGeometry(0.035, 0.12, 10).rotateX(Math.PI).translate(0, 0.06, 0), '#d9a35b'),
    paint(new THREE.SphereGeometry(0.045, 12, 8).translate(0, 0.135, 0), scoop),
  ])!;
}

/**
 * The ice cream stand in the park: a pink kiosk with a counter, a striped awning and a giant cone
 * on the roof, so you can spot it from far away. One merged mesh (one draw call).
 */
export class IceCreamStand {
  readonly group = new THREE.Group();

  constructor(layout: CityLayout) {
    const ic = layout.pois.iceCream;
    const parts: THREE.BufferGeometry[] = [];
    const box = (w: number, h: number, d: number, x: number, y: number, z: number, color: string) =>
      parts.push(paint(new THREE.BoxGeometry(w, h, d).translate(x, y, z), color));
    // Kiosk body, counter in front (+Z), roof.
    box(3, 2.2, 2.2, 0, 1.1, 0, '#ffb6c8');
    box(3.2, 0.12, 0.6, 0, 1.15, 1.2, '#ffffff'); // counter top
    box(2.4, 0.9, 0.05, 0, 1.75, 1.11, '#3a2f3a'); // serving window (dark)
    box(3.3, 0.18, 2.5, 0, 2.3, 0, '#ffffff'); // roof
    // Striped awning over the window.
    for (let i = 0; i < 8; i++) {
      const x = -1.5 + 0.1875 + i * 0.375;
      parts.push(paint(new THREE.BoxGeometry(0.375, 0.06, 0.9).rotateX(0.35).translate(x, 2.05, 1.45), i % 2 ? '#ffffff' : '#ff6f91'));
    }
    // Giant cone on the roof.
    parts.push(paint(new THREE.ConeGeometry(0.42, 1.3, 14).rotateX(Math.PI).translate(0, 3.05, 0), '#d9a35b'));
    parts.push(paint(new THREE.SphereGeometry(0.5, 16, 10).translate(0, 3.85, 0), '#f7a1b8'));
    parts.push(paint(new THREE.SphereGeometry(0.42, 16, 10).translate(0, 4.35, 0), '#fbf0cf'));
    parts.push(paint(new THREE.SphereGeometry(0.1, 8, 6).translate(0, 4.82, 0), '#e5484d')); // cherry
    // A few cones on display on the counter.
    for (const [x, c] of [[-1, '#a8e6c8'], [-0.6, '#7b4a2d'], [0.7, '#f7a1b8']] as const) parts.push(coneGeometry(c).translate(x, 1.21, 1.25));
    const mesh = new THREE.Mesh(mergeGeometries(parts)!, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0 }));
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.group.add(mesh);
    this.group.position.set(ic.x, groundHeight(ic.x, ic.z), ic.z);
  }

  dispose() {
    this.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) { m.geometry.dispose(); (m.material as THREE.Material).dispose(); }
    });
    this.group.removeFromParent();
  }
}
