import * as THREE from 'three';
import { loadGltf } from '../../engine/assets';
import { contactShadow, SEATED_SCALE, type BuiltCar } from './carBuilder';
import { SKETCHFAB_VEHICLES } from './sketchfabManifest';

/** Height from the hips to the top of the head of a seated character at scale 1 (measured). */
const HEAD_ABOVE_HIP = 1.23;

/**
 * Driver's hips (vehicle-local), from real-car proportions: a driver sits roughly in the
 * middle of the car, on the left (+X), with the hips at about a third of the roof height.
 * In low sports cars the driver sits lower (and, if needed, a bit smaller) so the head
 * always stays under the roof.
 */
function seatFor(info: { length: number; width: number; height: number; bike: boolean }) {
  if (info.bike) return { seat: new THREE.Vector3(0, info.height * 0.62, -info.length * 0.1), scale: SEATED_SCALE };
  const roof = info.height - 0.1;
  const hip = Math.max(0.22, Math.min(info.height * 0.32, roof - HEAD_ABOVE_HIP * SEATED_SCALE));
  const scale = Math.min(SEATED_SCALE, (roof - hip) / HEAD_ABOVE_HIP);
  return { seat: new THREE.Vector3(info.width * 0.18, hip, info.length * 0.01), scale };
}

type Wheel = [number, number, number, number, number];

/**
 * Cuts the wheels out of a loaded model (once per file; every copy shares the result):
 * triangles that lie fully inside a wheel's cylinder move to their own mesh under a pivot
 * at the wheel center (`CCG_WHEEL_<i>`) with a spin group inside (`CCG_SPIN`). The pivot
 * steers, the spin group rolls. Wheel spots come from scripts/lib/wheels.mjs.
 */
function splitWheels(model: THREE.Object3D, wheels: Wheel[], byAxle: boolean) {
  if (model.userData.wheelsSplit) return;
  model.userData.wheelsSplit = true;
  model.updateMatrixWorld(true);
  const toModel = new THREE.Matrix4().copy(model.matrixWorld).invert();
  // byAxle (traffic cars, they only roll): both wheels of an axle share one part, fewer draw calls.
  const groupOf = (k: number) => (byAxle && wheels.length === 4 ? (k < 2 ? 0 : 1) : k);
  const centers: [number, number, number][] = byAxle && wheels.length === 4
    ? [[0, (wheels[0][1] + wheels[1][1]) / 2, (wheels[0][2] + wheels[1][2]) / 2], [0, (wheels[2][1] + wheels[3][1]) / 2, (wheels[2][2] + wheels[3][2]) / 2]]
    : wheels.map(([x, y, z]) => [x, y, z]);
  const pivots = centers.map(([x, y, z], i) => {
    const pivot = new THREE.Group();
    pivot.name = `CCG_WHEEL_${i}`;
    pivot.position.set(x, y, z);
    const spin = new THREE.Group();
    spin.name = 'CCG_SPIN';
    pivot.add(spin);
    return pivot;
  });
  const meshes: THREE.Mesh[] = [];
  model.traverse((o) => { if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh); });
  const m = new THREE.Matrix4(), v = new THREE.Vector3();
  for (const mesh of meshes) {
    const g = mesh.geometry;
    const pos = g.getAttribute('position');
    if (!pos) continue;
    m.multiplyMatrices(toModel, mesh.matrixWorld);
    // Which wheel (if any) each vertex is inside of.
    const inWheel = new Int8Array(pos.count).fill(-1);
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(m);
      for (let k = 0; k < wheels.length; k++) {
        const [x, y, z, r, hw] = wheels[k];
        if (Math.abs(v.x - x) <= hw + 0.04 && (v.y - y) ** 2 + (v.z - z) ** 2 <= (r * 1.06) ** 2) { inWheel[i] = k; break; }
      }
    }
    const index = g.getIndex();
    const count = index ? index.count : pos.count;
    const body: number[] = [];
    const parts: number[][] = centers.map(() => []);
    for (let t = 0; t < count; t += 3) {
      const a = index ? index.getX(t) : t, b = index ? index.getX(t + 1) : t + 1, c = index ? index.getX(t + 2) : t + 2;
      const k = inWheel[a];
      if (k >= 0 && inWheel[b] === k && inWheel[c] === k) parts[groupOf(k)].push(a, b, c);
      else body.push(a, b, c);
    }
    if (body.length === count) continue;
    const withIndex = (idx: number[]) => {
      const ng = new THREE.BufferGeometry();
      for (const [name, attr] of Object.entries(g.attributes)) ng.setAttribute(name, attr);
      ng.setIndex(idx);
      ng.computeBoundingSphere();
      return ng;
    };
    mesh.geometry = withIndex(body);
    parts.forEach((idx, k) => {
      if (!idx.length) return;
      const part = new THREE.Mesh(withIndex(idx), mesh.material);
      // Traffic wheels sit inside the car's own shadow: no extra shadow draw calls.
      part.userData.wheelPart = true;
      // Same place as before, but relative to the wheel center so it rolls around it.
      part.matrix.copy(m).premultiply(new THREE.Matrix4().makeTranslation(-centers[k][0], -centers[k][1], -centers[k][2]));
      part.matrix.decompose(part.position, part.quaternion, part.scale);
      pivots[k].children[0].add(part);
    });
  }
  // Pivots live in the model's own space.
  for (const p of pivots) model.add(p);
}

export const hasSketchfabModel = (id: string) => id in SKETCHFAB_VEHICLES;
export const isPaintable = (id: string) => !hasSketchfabModel(id) || SKETCHFAB_VEHICLES[id].paintable;

/**
 * Loads a processed Sketchfab vehicle (see scripts/build-vehicles.mjs) as a BuiltCar.
 * `lod` = the light version for traffic: one mesh with vertex colors.
 * The model already faces +Z, stands on y = 0 and has its real size.
 */
export async function loadSketchfabVehicle(id: string, color?: THREE.ColorRepresentation, lod = false): Promise<BuiltCar> {
  const info = SKETCHFAB_VEHICLES[id];
  const gltf = await loadGltf(`/models/vehicles/${id}${lod ? '_lod' : ''}.glb`);
  if (info.wheels) splitWheels(gltf.scene, info.wheels, lod);
  const model = gltf.scene.clone(true);
  const own: THREE.Material[] = [];
  const paint: THREE.MeshStandardMaterial[] = [];
  model.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = !(lod && mesh.userData.wheelPart);
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const next = mats.map((m) => {
      const sm = m as THREE.MeshStandardMaterial;
      if (lod && !sm.flatShading) {
        // Shared by all traffic cars of this model: colors are in the vertices, no normals stored.
        sm.flatShading = true;
        sm.vertexColors = true;
        sm.needsUpdate = true;
      }
      if (sm.name === 'CCG_PAINT') {
        const c = sm.clone();
        own.push(c);
        paint.push(c);
        return c;
      }
      return m;
    });
    mesh.material = Array.isArray(mesh.material) ? next : next[0];
  });
  const root = new THREE.Group();
  root.add(model);
  root.add(contactShadow(info.width * 1.25, info.length * 1.12));
  const setColor = (c: THREE.ColorRepresentation) => paint.forEach((m) => m.color.set(c));
  if (color && info.paintable) setColor(color);
  // Wheel pivots (cut out by splitWheels); models without wheel data get dummies.
  const dummy = () => new THREE.Group();
  const pivot = (i: number) => {
    const p = model.getObjectByName(`CCG_WHEEL_${i}`);
    if (!p) return dummy();
    p.userData.spin = p.getObjectByName('CCG_SPIN');
    return p as THREE.Group;
  };
  const wheels = info.bike || (lod && info.wheels)
    ? (() => { const f = pivot(0), r = pivot(1); return { fl: f, fr: f, rl: r, rr: r }; })()
    : { fl: pivot(0), fr: pivot(1), rl: pivot(2), rr: pivot(3) };
  return {
    root,
    wheels,
    seat: seatFor(info).seat,
    seatScale: seatFor(info).scale,
    setColor,
    dispose() {
      own.forEach((m) => m.dispose());
      root.traverse((o) => { if (o !== model && (o as THREE.Mesh).isMesh && (o as THREE.Mesh).geometry.type === 'PlaneGeometry') (o as THREE.Mesh).geometry.dispose(); });
      root.removeFromParent();
    },
  };
}
