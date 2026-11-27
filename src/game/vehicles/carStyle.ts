import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
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

/** Garage extras: underglow colors and spoiler colors ('' = none). */
export const NEON_COLORS = ['', '#00e5ff', '#ff3df2', '#39ff14', '#ffd400', '#ff3b3b'];
export const SPOILER_COLORS = ['', '#1c1d20', '#ffffff', '#e5484d'];

let glowTex: THREE.Texture | null = null;
/** A soft rectangle of light: bright in the middle, fading out at the edges. */
function glowTexture() {
  if (glowTex) return glowTex;
  const c = document.createElement('canvas');
  c.width = 64; c.height = 128;
  const g = c.getContext('2d')!;
  const img = g.createImageData(64, 128);
  for (let y = 0; y < 128; y++) for (let x = 0; x < 64; x++) {
    const dx = Math.abs(x - 31.5) / 32, dy = Math.abs(y - 63.5) / 64;
    const d = Math.max(dx * 1.05, dy);
    const a = Math.max(0, 1 - d) ** 1.6;
    const i = (y * 64 + x) * 4;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = 255;
    img.data[i + 3] = Math.round(a * 255);
  }
  g.putImageData(img, 0, 0);
  glowTex = new THREE.CanvasTexture(c);
  return glowTex;
}

/** Car size in its own space (wheels included), measured once per car. */
function localBox(car: BuiltCar) {
  const parent = car.root.parent;
  const p0 = car.root.position.clone(), q0 = car.root.quaternion.clone(), s0 = car.root.scale.clone();
  parent?.remove(car.root);
  car.root.position.set(0, 0, 0); car.root.quaternion.identity(); car.root.scale.set(1, 1, 1);
  car.root.updateMatrixWorld(true);
  const meshes: THREE.Object3D[] = [];
  car.root.traverse((o) => {
    const m = o as THREE.Mesh;
    // The body only: not the people inside, our own add-ons or the soft shadow plane under the car (a basic material).
    const basic = (Array.isArray(m.material) ? m.material : [m.material]).some((x) => (x as THREE.Material)?.type === 'MeshBasicMaterial');
    if (m.isMesh && o.visible && !(m as THREE.SkinnedMesh).isSkinnedMesh && !o.name.startsWith('CCG_') && !basic) meshes.push(o);
  });
  const box = new THREE.Box3();
  for (const m of meshes) box.expandByObject(m);
  return {
    box, meshes,
    restore: () => {
      car.root.position.copy(p0); car.root.quaternion.copy(q0); car.root.scale.copy(s0);
      parent?.add(car.root);
      car.root.updateMatrixWorld(true);
    },
  };
}

/** Underglow: a colored glow on the ground under the car (additive, no real light, so it's cheap). '' removes it. */
export function applyNeon(car: BuiltCar, color: string, isBike = false) {
  const old = car.root.getObjectByName('CCG_NEON') as THREE.Mesh | undefined;
  if (old) { old.removeFromParent(); old.geometry.dispose(); (old.material as THREE.Material).dispose(); }
  if (!color || isBike) return;
  const { box, restore } = localBox(car);
  restore();
  const w = (box.max.x - box.min.x) * 1.35, l = (box.max.z - box.min.z) * 1.15;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, l).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({
    map: glowTexture(), color, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, fog: true,
  }));
  mesh.name = 'CCG_NEON';
  mesh.position.set((box.min.x + box.max.x) / 2, box.min.y + 0.04, (box.min.z + box.max.z) / 2);
  mesh.renderOrder = 1;
  car.root.add(mesh);
}

/** Spoiler: a wing on two posts on the trunk lid, following the car's shape (found with rays). '' removes it. */
export function applySpoiler(car: BuiltCar, color: string, isBike = false) {
  const old = car.root.getObjectByName('CCG_SPOILER') as THREE.Mesh | undefined;
  if (old) { old.removeFromParent(); old.geometry.dispose(); (old.material as THREE.Material).dispose(); }
  if (!color || isBike) return;
  const { box, meshes, restore } = localBox(car);
  const len = box.max.z - box.min.z, width = box.max.x - box.min.x;
  // The rear is at -Z: find the trunk top a little in from the back.
  const z = box.min.z + len * 0.07, top = box.max.y + 1;
  const hit = (x: number) => {
    ray.set(new THREE.Vector3(x, top, z), down);
    const h = ray.intersectObjects(meshes.filter((m) => !m.userData.wheelPart), false)[0];
    return h ? h.point.y : null;
  };
  const mx = (box.min.x + box.max.x) / 2;
  const yl = hit(mx - width * 0.25), yr = hit(mx + width * 0.25), yc = hit(mx);
  restore();
  const base = Math.max(yl ?? -Infinity, yr ?? -Infinity, yc ?? -Infinity);
  if (!Number.isFinite(base)) return;
  // The measured width includes the mirrors; the roof is narrower, so the wing stays about roof-wide.
  const postH = 0.15, wingW = Math.min(width * 0.7, 1.3);
  const parts = [
    new THREE.BoxGeometry(wingW, 0.04, 0.32).rotateX(-0.12).translate(0, base + postH + 0.02, z),
    new THREE.BoxGeometry(0.04, 0.16, 0.36).translate(-wingW / 2, base + postH + 0.02, z),
    new THREE.BoxGeometry(0.04, 0.16, 0.36).translate(wingW / 2, base + postH + 0.02, z),
  ];
  for (const s of [-1, 1]) parts.push(new THREE.BoxGeometry(0.05, postH + 0.04, 0.12).translate(s * wingW * 0.32, base + postH / 2, z + 0.02));
  const cx = (box.min.x + box.max.x) / 2;
  const geo = mergeGeometries(parts)!.translate(cx, 0, 0);
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.3 }));
  mesh.name = 'CCG_SPOILER';
  mesh.castShadow = true;
  car.root.add(mesh);
}
