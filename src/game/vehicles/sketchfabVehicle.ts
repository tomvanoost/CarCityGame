import * as THREE from 'three';
import { loadGltf } from '../../engine/assets';
import { contactShadow, SEATED_SCALE, type BuiltCar } from './carBuilder';
import { SKETCHFAB_VEHICLES } from './sketchfabManifest';

/** Height from the hips to the top of the head of a seated character at scale 1 (measured: 1.23, plus a little for hair). */
const HEAD_ABOVE_HIP = 1.26;

/** Where the driver sits along the car (z, meters from the middle): trucks and vans have the cab up front. */
const SEAT_Z: Record<string, (length: number) => number> = {
  brandweer: (l) => l / 2 - 1.35,
  ambulance: (l) => l / 2 - 2.3, // behind the long sloping windscreen
};
const seatZ = (id: string, length: number) => SEAT_Z[id]?.(length) ?? length * 0.01;

/**
 * The roof right above the driver's head (rays down onto the model; the car's total height also
 * counts antennas, spoilers and light bars). The highest hit of a few rays close together is used,
 * so a ray that slips onto the sloping windscreen or through a glass roof doesn't count. Cached.
 */
function roofAboveDriver(model: THREE.Object3D, info: { length: number; width: number; height: number }, z: number) {
  if (model.userData.roofY !== undefined) return model.userData.roofY as number;
  model.updateMatrixWorld(true);
  const ray = new THREE.Raycaster();
  const down = new THREE.Vector3(0, -1, 0);
  let roof = -1;
  for (const dx of [-0.06, 0.06]) for (const dz of [-0.08, 0.06]) {
    ray.set(new THREE.Vector3(info.width * 0.18 + dx, info.height + 1, z + dz), down);
    const hit = ray.intersectObject(model, true).find((h) => h.point.y > info.height * 0.5);
    if (hit) roof = Math.max(roof, hit.point.y);
  }
  if (roof < 0) roof = info.height;
  model.userData.roofY = roof;
  return roof;
}

/**
 * Driver's hips (vehicle-local): on the left (+X), with the head just under the roof, so the driver
 * is nicely visible through the windows. Only under a very low roof does the driver get a bit smaller.
 */
function seatFor(info: { length: number; width: number; height: number; bike: boolean }, roofY: number, z: number) {
  if (info.bike) return { seat: new THREE.Vector3(0, info.height * 0.62, -info.length * 0.1), scale: SEATED_SCALE };
  const roof = Math.min(info.height - 0.05, roofY - 0.05);
  const hip = Math.max(0.22, Math.min(info.height * 0.45, roof - HEAD_ABOVE_HIP * SEATED_SCALE));
  const scale = Math.min(SEATED_SCALE, (roof - hip) / HEAD_ABOVE_HIP);
  return { seat: new THREE.Vector3(info.width * 0.18, hip, z), scale };
}

type Wheel = [number, number, number, number, number];

/**
 * Only the rim (spokes, hub) rolls: the part within this share of the wheel radius. The round
 * tire stays put (it looks the same turning or not), so no piece of tire or wheel arch is cut
 * out and swung around.
 */
const RIM = 0.8;

/**
 * Cuts the wheels out of a loaded model (once per file; every copy shares the result):
 * triangles that lie fully inside a wheel's cylinder move to their own mesh under a pivot
 * at the wheel center (`CCG_WHEEL_<i>`) with a spin group inside (`CCG_SPIN`). The pivot
 * steers, the spin group rolls. Wheel spots come from scripts/lib/wheels.mjs.
 */
function splitWheels(model: THREE.Object3D, found: Wheel[], byAxle: boolean) {
  if (model.userData.wheelsSplit) return;
  model.userData.wheelsSplit = true;
  model.updateMatrixWorld(true);
  const toModel = new THREE.Matrix4().copy(model.matrixWorld).invert();
  const wheels = refineWheels(model, toModel, found);
  model.userData.wheelShift = wheels.map((w, k) => Math.hypot(w[1] - found[k][1], w[2] - found[k][2]));
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
        if (Math.abs(v.x - x) <= hw + 0.04 && (v.y - y) ** 2 + (v.z - z) ** 2 <= (r * RIM) ** 2) { inWheel[i] = k; break; }
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

/**
 * The found wheel spots can be a few cm off the real axle; a rim spinning around the wrong
 * point wobbles. This moves each center to the middle of the rim's own vertices (a few rounds,
 * as the cylinder then catches the rim better).
 */
function refineWheels(model: THREE.Object3D, toModel: THREE.Matrix4, wheels: Wheel[]): Wheel[] {
  const pts: number[] = [];
  const m = new THREE.Matrix4(), v = new THREE.Vector3();
  model.traverse((o) => {
    const mesh = o as THREE.Mesh, pos = mesh.isMesh ? mesh.geometry.getAttribute('position') : null;
    if (!pos) return;
    m.multiplyMatrices(toModel, mesh.matrixWorld);
    for (let i = 0; i < pos.count; i++) { v.fromBufferAttribute(pos, i).applyMatrix4(m); pts.push(v.x, v.y, v.z); }
  });
  return wheels.map(([x, y0, z0, r, hw]) => {
    let y = y0, z = z0;
    for (let round = 0; round < 6; round++) {
      let y1 = Infinity, y2 = -Infinity, z1 = Infinity, z2 = -Infinity;
      for (let i = 0; i < pts.length; i += 3) {
        if (Math.abs(pts[i] - x) > hw + 0.04 || (pts[i + 1] - y) ** 2 + (pts[i + 2] - z) ** 2 > (r * RIM) ** 2) continue;
        y1 = Math.min(y1, pts[i + 1]); y2 = Math.max(y2, pts[i + 1]); z1 = Math.min(z1, pts[i + 2]); z2 = Math.max(z2, pts[i + 2]);
      }
      if (y1 > y2) break;
      // The middle of the rim (it's round). Small steps only: a big jump means something else was caught.
      const ny = (y1 + y2) / 2, nz = (z1 + z2) / 2, max = r * 0.1;
      y += THREE.MathUtils.clamp(ny - y, -max, max);
      z += THREE.MathUtils.clamp(nz - z, -max, max);
    }
    return [x, y, z, r, hw];
  });
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
  const z = seatZ(id, info.length);
  const seat = seatFor(info, info.bike ? info.height : roofAboveDriver(gltf.scene, info, z), z);
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
      if (lod && !sm.vertexColors) {
        // Shared by all traffic cars of this model: colors are in the vertices. Older light models
        // have no normals stored: shade those flat (newer ones have smooth normals).
        sm.flatShading = !mesh.geometry.getAttribute('normal');
        sm.vertexColors = true;
        sm.needsUpdate = true;
      }
      // Clear window glass that some models made solid (e.g. the fire truck): see-through, so the
      // dashboard view looks out of the windscreen. Coloured lamp glass (red, orange...) stays as it is.
      if (!lod && !sm.transparent && /^(glass|windows?|windshield|windscreen|window_?glass)$|glasswindows/i.test(sm.name)) {
        const c = sm.clone();
        c.transparent = true;
        c.opacity = 0.28;
        c.depthWrite = false;
        own.push(c);
        return c;
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
    seat: seat.seat,
    seatScale: seat.scale,
    setColor,
    dispose() {
      own.forEach((m) => m.dispose());
      root.traverse((o) => { if (o !== model && (o as THREE.Mesh).isMesh && (o as THREE.Mesh).geometry.type === 'PlaneGeometry') (o as THREE.Mesh).geometry.dispose(); });
      root.removeFromParent();
    },
  };
}
