import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { CityLayout } from '../city/layout';
import { groundHeight } from './collision';

const paint = (g: THREE.BufferGeometry, color: string) => {
  const geo = g.index ? g.toNonIndexed() : g;
  const c = new THREE.Color(color), n = geo.getAttribute('position').count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) a.set([c.r, c.g, c.b], i * 3);
  geo.setAttribute('color', new THREE.BufferAttribute(a, 3));
  geo.deleteAttribute('uv');
  return geo;
};
const box = (w: number, h: number, d: number, x: number, y: number, z: number, color: string) => paint(new THREE.BoxGeometry(w, h, d).translate(x, y, z), color);

/** The pizzeria: a red kiosk with a checkered awning, a chimney for the oven and a giant pizza on the roof. */
export class PizzeriaBuilding {
  readonly group = new THREE.Group();

  constructor(layout: CityLayout) {
    const pz = layout.pois.pizzeria;
    const parts: THREE.BufferGeometry[] = [
      box(6, 3, 4.4, 0, 1.5, 0, '#c8352d'),
      box(6.3, 0.25, 4.7, 0, 3.12, 0, '#ffffff'),
      box(4.4, 1.1, 0.06, 0, 1.9, 2.22, '#3a2f2a'), // serving window
      box(6.2, 0.12, 0.6, 0, 1.25, 2.4, '#f4e7c8'), // counter
      box(0.8, 1.6, 0.8, -2.2, 3.9, -1.2, '#8a8f96'), // oven chimney
    ];
    for (let i = 0; i < 8; i++) parts.push(paint(new THREE.BoxGeometry(0.75, 0.06, 1.2).rotateX(0.35).translate(-2.625 + i * 0.75, 2.75, 2.75), i % 2 ? '#ffffff' : '#2fa84f'));
    // Giant pizza: crust, sauce, cheese and pepperoni slices, tilted towards the street.
    const pizza: THREE.BufferGeometry[] = [
      paint(new THREE.CylinderGeometry(1.5, 1.5, 0.18, 24), '#e3a857'),
      paint(new THREE.CylinderGeometry(1.32, 1.32, 0.2, 24), '#d9452b'),
      paint(new THREE.CylinderGeometry(1.2, 1.2, 0.22, 24), '#ffd56b'),
    ];
    for (let k = 0; k < 7; k++) {
      const a = (k / 7) * Math.PI * 2, r = k ? 0.75 : 0;
      pizza.push(paint(new THREE.CylinderGeometry(0.2, 0.2, 0.24, 12).translate(Math.cos(a) * r, 0, Math.sin(a) * r), '#b5281c'));
    }
    for (const g of pizza) parts.push(g.rotateX(-1.05).translate(0, 4.6, 0.4));
    parts.push(box(0.15, 1.3, 0.15, 0, 3.8, -0.2, '#5a5f66'));
    const mesh = new THREE.Mesh(mergeGeometries(parts)!, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.65, metalness: 0 }));
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.group.add(mesh);
    this.group.position.set(pz.x, groundHeight(pz.x, pz.z), pz.z);
  }

  dispose() {
    this.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) { m.geometry.dispose(); (m.material as THREE.Material).dispose(); }
    });
    this.group.removeFromParent();
  }
}
