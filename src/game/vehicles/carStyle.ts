import * as THREE from 'three';
import type { BuiltCar } from './carBuilder';

/** Paint shop options: roof stripe and rim colors ('' = none / factory look). */
export const STRIPE_COLORS = ['', '#ffffff', '#1c1d20', '#e5484d', '#f5c400'];
export const RIM_COLORS = ['', '#1c1d20', '#f5c400', '#e5484d', '#ffffff'];
/** Extra paint colors in the paint shop (on top of the vehicle shop's colors). */
export const EXTRA_PAINT = ['#ffd700', '#7fd3ff', '#9be3c3', '#1f5e3a', '#5a2d82', '#ff4fa3'];

const ray = new THREE.Raycaster();
const down = new THREE.Vector3(0, -1, 0);

/**
 * Two racing stripes over the roof (front to back), following the roof's shape: the height is
 * found by casting rays down onto the car. '' removes them.
 */
export function applyStripe(car: BuiltCar, color: string, isBike = false) {
  const old = car.root.getObjectByName('CCG_STRIPE');
  if (old) {
    old.removeFromParent();
    ((old as THREE.Mesh).geometry).dispose();
    ((old as THREE.Mesh).material as THREE.Material).dispose();
  }
  if (!color || isBike) return;
  // Measure in the car's own space: take it out of the world for a moment.
  const parent = car.root.parent, saved = car.root.matrix.clone();
  const p0 = car.root.position.clone(), q0 = car.root.quaternion.clone(), s0 = car.root.scale.clone();
  parent?.remove(car.root);
  car.root.position.set(0, 0, 0); car.root.quaternion.identity(); car.root.scale.set(1, 1, 1);
  car.root.updateMatrixWorld(true);
  const meshes: THREE.Object3D[] = [];
  car.root.traverse((o) => { if ((o as THREE.Mesh).isMesh && !o.userData.wheelPart && o.visible) meshes.push(o); });
  const box = new THREE.Box3().setFromObject(car.root);
  const top = box.max.y + 1;
  const len = box.max.z - box.min.z;
  // The roof: from a bit in front of the middle to a bit behind it.
  const z0 = box.min.z + len * 0.3, z1 = box.min.z + len * 0.72, steps = 10;
  const pos: number[] = [];
  const hit = (x: number, z: number) => {
    ray.set(new THREE.Vector3(x, top, z), down);
    const h = ray.intersectObjects(meshes, false)[0];
    return h ? h.point.y + 0.012 : null;
  };
  for (const cx of [-0.17, 0.17]) {
    const w = 0.13;
    for (let i = 0; i < steps; i++) {
      const za = z0 + ((z1 - z0) * i) / steps, zb = z0 + ((z1 - z0) * (i + 1)) / steps;
      const ya = hit(cx, za), yb = hit(cx, zb);
      if (ya === null || yb === null) continue;
      pos.push(cx - w / 2, ya, za, cx - w / 2, yb, zb, cx + w / 2, yb, zb, cx - w / 2, ya, za, cx + w / 2, yb, zb, cx + w / 2, ya, za);
    }
  }
  car.root.position.copy(p0); car.root.quaternion.copy(q0); car.root.scale.copy(s0);
  car.root.matrix.copy(saved);
  parent?.add(car.root);
  car.root.updateMatrixWorld(true);
  if (!pos.length) return;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  const mesh = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.1, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  mesh.name = 'CCG_STRIPE';
  car.root.add(mesh);
}

/** Tints the rims (the light, metal parts of the wheels; tyres stay black). '' = factory look. */
export function applyRims(car: BuiltCar, color: string) {
  for (const pivot of new Set(Object.values(car.wheels))) {
    pivot.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const orig = (mesh.userData.rimOrig as THREE.Material | THREE.Material[] | undefined) ?? mesh.material;
      if (!color) {
        if (mesh.userData.rimOrig) { mesh.material = mesh.userData.rimOrig; delete mesh.userData.rimOrig; }
        return;
      }
      const list = Array.isArray(orig) ? orig : [orig];
      const next = list.map((m) => {
        const sm = m as THREE.MeshStandardMaterial;
        if (!sm.isMeshStandardMaterial) return m;
        const lum = (sm.color.r + sm.color.g + sm.color.b) / 3;
        if (lum < 0.22 && sm.metalness < 0.5) return m; // tyre / dark rubber
        const c = sm.clone();
        c.color.set(color);
        return c;
      });
      if (!mesh.userData.rimOrig) mesh.userData.rimOrig = orig;
      else (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).forEach((m) => { if (!list.includes(m)) m.dispose(); });
      mesh.material = Array.isArray(orig) ? next : next[0];
    });
  }
}
