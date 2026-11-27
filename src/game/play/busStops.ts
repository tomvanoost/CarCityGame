import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { CityLayout } from '../city/layout';
import { groundHeight } from './collision';

/** Money per bus stop, and the bonus for driving the whole route. */
export const BUS_STOP_PAY = 15;
export const BUS_ROUTE_BONUS = 50;

const paint = (g: THREE.BufferGeometry, color: string) => {
  const geo = g.index ? g.toNonIndexed() : g;
  const c = new THREE.Color(color), n = geo.getAttribute('position').count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) a.set([c.r, c.g, c.b], i * 3);
  geo.setAttribute('color', new THREE.BufferAttribute(a, 3));
  geo.deleteAttribute('uv');
  return geo;
};

/** All bus shelters in one mesh: a roof, a glass back wall, a bench and a pole with a round 🚌 sign. */
export class BusShelters {
  readonly group = new THREE.Group();

  constructor(layout: CityLayout) {
    const parts: THREE.BufferGeometry[] = [];
    const glass: THREE.BufferGeometry[] = [];
    layout.pois.busStops.forEach((s, i) => {
      const y = groundHeight(s.x, s.z);
      const local: THREE.BufferGeometry[] = [
        paint(new THREE.BoxGeometry(3.4, 0.12, 1.5).translate(0, 2.45, 0.1), '#2f8bff'), // roof
        paint(new THREE.BoxGeometry(2.4, 0.08, 0.45).translate(0, 0.5, -0.35), '#8a5a35'), // bench
        paint(new THREE.BoxGeometry(0.08, 0.5, 0.4).translate(-1.0, 0.25, -0.35), '#55595f'),
        paint(new THREE.BoxGeometry(0.08, 0.5, 0.4).translate(1.0, 0.25, -0.35), '#55595f'),
        // Pole with a sign; the depot (first stop) gets a yellow sign, the others white.
        paint(new THREE.CylinderGeometry(0.05, 0.05, 2.8, 6).translate(1.9, 1.4, 0.6), '#55595f'),
        paint(new THREE.CylinderGeometry(0.32, 0.32, 0.06, 16).rotateX(Math.PI / 2).translate(1.9, 2.75, 0.6), i === 0 ? '#f5c400' : '#ffffff'),
        paint(new THREE.CylinderGeometry(0.22, 0.22, 0.07, 16).rotateX(Math.PI / 2).translate(1.9, 2.75, 0.6), '#2f8bff'),
      ];
      for (const x of [-1.6, 1.6]) for (const z of [-0.55]) local.push(paint(new THREE.BoxGeometry(0.08, 2.4, 0.08).translate(x, 1.2, z), '#55595f'));
      for (const g of local) parts.push(g.rotateY(s.rot).translate(s.x, y, s.z));
      glass.push(new THREE.BoxGeometry(3.1, 1.9, 0.04).translate(0, 1.35, -0.58).rotateY(s.rot).translate(s.x, y, s.z));
    });
    const mesh = new THREE.Mesh(mergeGeometries(parts)!, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 }));
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    for (const g of glass) g.deleteAttribute('uv');
    const glassMesh = new THREE.Mesh(mergeGeometries(glass)!, new THREE.MeshStandardMaterial({ color: '#bfe3ff', transparent: true, opacity: 0.35, roughness: 0.1, metalness: 0.1 }));
    this.group.add(mesh, glassMesh);
  }

  dispose() {
    this.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) { m.geometry.dispose(); (m.material as THREE.Material).dispose(); }
    });
    this.group.removeFromParent();
  }
}
