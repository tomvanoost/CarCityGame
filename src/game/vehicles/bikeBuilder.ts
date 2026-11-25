import * as THREE from 'three';
import { buildWheel, sharedVehicleMaterials, type BuiltCar } from './carBuilder';
import type { BikeShape } from './types';

/**
 * Motorbikes from simple parts: wheels, frame, tank, seat, fairing, lights.
 * Same axes as cars: +Z forward, +Y up, origin on the ground.
 */
export function buildBike(shape: BikeShape, color: THREE.ColorRepresentation): BuiltCar {
  const mats = sharedVehicleMaterials();
  const paint = new THREE.MeshPhysicalMaterial({ color, metalness: 0.5, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.05 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x24272c, roughness: 0.5, metalness: 0.6 });
  const seatMat = new THREE.MeshStandardMaterial({ color: 0x141416, roughness: 0.85 });
  const own = [paint, dark, seatMat];
  const root = new THREE.Group();
  const r = shape.wheelRadius, wb = shape.wheelbase, s = shape.style;
  const fz = wb / 2, rz = -wb / 2;

  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, rx = 0, sc?: [number, number, number]) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.rotation.x = rx;
    if (sc) m.scale.set(...sc);
    m.castShadow = true;
    root.add(m);
    return m;
  };
  /** A tube between two points (y, z) in the bike's middle plane. */
  const tube = (a: [number, number], b: [number, number], radius: number, mat: THREE.Material, x = 0) => {
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const g = new THREE.CylinderGeometry(radius, radius, len, 10);
    const m = add(g, mat, x, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
    m.rotation.x = Math.atan2(b[1] - a[1], b[0] - a[0]);
    return m;
  };

  // --- wheels ---
  const wheelW = s === 'scooter' ? 0.13 : s === 'adventure' ? 0.15 : 0.17;
  const makeWheel = (z: number) => {
    const pivot = new THREE.Group();
    pivot.position.set(0, r, z);
    pivot.rotation.order = 'YXZ';
    const w = buildWheel(r, wheelW, shape.rims, mats);
    w.position.x = -wheelW * 0.3; // center the rim face
    pivot.add(w);
    root.add(pivot);
    return pivot;
  };
  const front = makeWheel(fz), rear = makeWheel(rz);

  const head: [number, number] = s === 'cruiser' ? [r + 0.72, fz - 0.42] : s === 'scooter' ? [r + 0.62, fz - 0.18] : [r + 0.62, fz - 0.3];
  // --- fork + handlebar ---
  for (const x of [-0.08, 0.08]) tube([r, fz], head, 0.025, mats.rimSilver, x);
  const barW = s === 'cruiser' ? 0.85 : s === 'adventure' ? 0.78 : 0.62;
  const bar = add(new THREE.CylinderGeometry(0.018, 0.018, barW, 8), mats.black, 0, head[0] + (s === 'cruiser' ? 0.16 : 0.08), head[1] - 0.05);
  bar.rotation.z = Math.PI / 2;
  add(new THREE.CylinderGeometry(0.075, 0.075, 0.06, 18), mats.head, 0, head[0] - 0.02, head[1] + 0.06, Math.PI / 2);

  if (s === 'scooter') {
    // Step-through body: front shield, floor, rear body over the engine.
    add(new THREE.BoxGeometry(0.42, 0.7, 0.08), paint, 0, r + 0.32, fz - 0.24, -0.25);
    add(new THREE.BoxGeometry(0.34, 0.08, 0.55), dark, 0, r - 0.02, 0.05);
    add(new THREE.SphereGeometry(0.5, 20, 14), paint, 0, r + 0.22, rz + 0.18, 0, [0.42, 0.55, 1.05]);
    add(new THREE.BoxGeometry(0.3, 0.1, 0.62), seatMat, 0, shape.seatHeight, rz + 0.22);
  } else {
    // Frame, engine, tank, seat, tail.
    tube(head, [r + 0.18, -0.12], 0.035, dark);
    tube([r + 0.18, -0.12], [r + 0.02, rz + 0.05], 0.03, dark, 0.12);
    tube([r + 0.18, -0.12], [r + 0.02, rz + 0.05], 0.03, dark, -0.12);
    // Engine: crankcase + two cylinders.
    add(new THREE.BoxGeometry(0.24, 0.22, 0.34), dark, 0, r + 0.02, 0.0);
    for (const z of [-0.06, 0.1]) add(new THREE.CylinderGeometry(0.07, 0.08, 0.26, 12), mats.brake, 0, r + 0.22, z, 0.25);
    // Tank sits on the frame.
    const tankY = s === 'cruiser' ? r + 0.5 : r + 0.55;
    add(new THREE.SphereGeometry(0.5, 20, 14), paint, 0, tankY, 0.1, -0.12, [0.34, 0.24, 0.62]);
    // Front fender.
    add(new THREE.SphereGeometry(0.5, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), s === 'cruiser' ? mats.rimSilver : paint, 0, r + 0.03, fz, 0, [0.2, 0.25, r * 2.3]);
    const seatLen = s === 'cruiser' ? 0.6 : 0.55;
    add(new THREE.BoxGeometry(0.3, 0.09, seatLen), seatMat, 0, shape.seatHeight, -0.28);
    add(new THREE.BoxGeometry(0.24, 0.12, 0.4), paint, 0, shape.seatHeight + 0.02, rz + 0.25, s === 'sport' ? -0.25 : 0);
    // exhaust
    const ex = add(new THREE.CylinderGeometry(0.05, 0.06, 0.7, 12), mats.rimSilver, 0.17, r + (s === 'cruiser' ? 0.05 : 0.18), rz + 0.32, Math.PI / 2 + (s === 'sport' ? -0.35 : -0.08));
    ex.castShadow = false;
    if (s === 'sport' || s === 'adventure') {
      // Fairing + small windscreen.
      add(new THREE.SphereGeometry(0.5, 20, 14), paint, 0, r + 0.46, fz - 0.3, 0.45, [0.36, 0.4, 0.62]);
      add(new THREE.BoxGeometry(0.34, 0.26, 0.02), mats.glass, 0, head[0] + 0.12, head[1] + 0.02, -0.5);
    }
    if (s === 'cruiser') {
      // Big rear fender.
      add(new THREE.SphereGeometry(0.5, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), paint, 0, r + 0.02, rz, 0, [0.3, 0.45, r * 2.6]);
    }
  }
  add(new THREE.BoxGeometry(0.16, 0.05, 0.03), mats.tail, 0, shape.seatHeight + 0.02, rz + 0.02);
  add(new THREE.BoxGeometry(0.18, 0.1, 0.02), mats.plate, 0, r + 0.32, rz - 0.04);

  return {
    root,
    wheels: { fl: front, fr: front, rl: rear, rr: rear },
    seat: new THREE.Vector3(0, shape.seatHeight - 0.42, -0.42),
    setColor: (c) => paint.color.set(c),
    dispose() {
      root.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
      own.forEach((m) => m.dispose());
      root.removeFromParent();
    },
  };
}
