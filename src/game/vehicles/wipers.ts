import * as THREE from 'three';

const armMat = new THREE.MeshStandardMaterial({ color: '#15171a', roughness: 0.6 });
const armGeo = new THREE.BoxGeometry(1, 0.025, 0.035);
/** Windscreen spot per model (found once with rays): base point and slope, or null (no windscreen found). */
const spots = new Map<string, { y: number; z: number; slope: number; w: number } | null>();

/**
 * Finds the bottom of the windscreen: rays down along the car's middle from the nose backwards; where
 * the surface suddenly rises (hood → glass) is the windscreen base, and the rise gives its slope.
 */
function findWindscreen(model: THREE.Object3D, length: number, height: number) {
  model.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(model.matrixWorld).invert();
  const ray = new THREE.Raycaster();
  const down = new THREE.Vector3(0, -1, 0);
  const meshes: THREE.Object3D[] = [];
  model.traverse((o) => { if ((o as THREE.Mesh).isMesh && !(o as THREE.Mesh).userData.wheelPart) meshes.push(o); });
  const ys: { z: number; y: number }[] = [];
  for (let z = length / 2; z > -length * 0.1; z -= 0.08) {
    const from = new THREE.Vector3(0, height + 2, z).applyMatrix4(model.matrixWorld);
    ray.set(from, down);
    const hit = ray.intersectObjects(meshes, false)[0];
    if (hit) ys.push({ z, y: hit.point.clone().applyMatrix4(inv).y });
  }
  // The hood: the first stretch of samples; then look for a steep climb of at least 0.35 m.
  for (let i = 3; i < ys.length - 4; i++) {
    const rise = ys[i + 4].y - ys[i].y, run = ys[i].z - ys[i + 4].z;
    if (rise > 0.18 && rise / run > 0.35 && ys[i].y > height * 0.45) {
      // Also make sure it keeps rising (a real windscreen, not a bump).
      if (ys[Math.min(ys.length - 1, i + 8)].y - ys[i].y < 0.3) continue;
      return { y: ys[i].y + 0.02, z: ys[i].z - 0.04, slope: Math.atan2(rise, run), w: 0 };
    }
  }
  return null;
}

/**
 * Two wiper arms on the windscreen that sweep back and forth while it rains (hidden when dry: the
 * models may have their own parked wipers). `key` caches the windscreen spot per model.
 */
export class Wipers {
  readonly group = new THREE.Group();
  private arms: THREE.Group[] = [];
  private t = Math.random() * 3;

  constructor(model: THREE.Object3D, key: string, length: number, width: number, height: number) {
    if (!spots.has(key)) spots.set(key, findWindscreen(model, length, height));
    const s = spots.get(key);
    this.group.visible = false;
    if (!s) return;
    // A frame lying on the glass: local Y = the glass's normal, local -Z = up the glass.
    const base = new THREE.Group();
    base.position.set(0, s.y, s.z);
    base.rotation.x = s.slope;
    const len = Math.min(0.62, width * 0.32);
    for (const px of [-width * 0.3, width * 0.04]) {
      const pivot = new THREE.Group();
      pivot.position.set(px, 0.02, 0);
      const arm = new THREE.Mesh(armGeo, armMat);
      arm.scale.x = len;
      arm.position.x = len / 2; // turns around its left end
      pivot.add(arm);
      base.add(pivot);
      this.arms.push(pivot);
    }
    this.group.add(base);
  }

  /** rain: 0..1 (how hard it rains). */
  update(dt: number, rain: number) {
    const on = rain > 0.05 && this.arms.length > 0;
    this.group.visible = on;
    if (!on) return;
    this.t += dt * (0.9 + rain * 0.6);
    // Sweep up and back: fast out, a short pause at the bottom.
    const k = Math.max(0, Math.sin(this.t * Math.PI));
    for (const p of this.arms) p.rotation.y = k * 1.45;
  }
}
