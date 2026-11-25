import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { buildWheel, contactShadow, mergeStaticParts, sharedVehicleMaterials, type BuiltCar } from './carBuilder';
import type { BikeShape } from './types';

/**
 * Motorbikes. Bodywork (fairing, tank, tail) is made from side-view outlines that are
 * extruded to width with rounded edges, which gives sleek, believable panels.
 * Same axes as cars: +Z forward, +Y up, origin on the ground.
 */
export function buildBike(shape: BikeShape, color: THREE.ColorRepresentation): BuiltCar {
  const mats = sharedVehicleMaterials();
  const paint = new THREE.MeshPhysicalMaterial({ color, metalness: 0.5, roughness: 0.28, clearcoat: 1, clearcoatRoughness: 0.05 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x24272c, roughness: 0.5, metalness: 0.6 });
  const seatMat = new THREE.MeshStandardMaterial({ color: 0x141416, roughness: 0.85 });
  const own = [paint, dark, seatMat];
  const root = new THREE.Group();
  const r = shape.wheelRadius, wb = shape.wheelbase, s = shape.style;
  const fz = wb / 2, rz = -wb / 2;

  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, rx = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.rotation.x = rx;
    m.castShadow = true;
    root.add(m);
    return m;
  };
  /** A tube between two points (y, z) in the bike's middle plane. */
  const tube = (a: [number, number], b: [number, number], radius: number, mat: THREE.Material, x = 0) => {
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const m = add(new THREE.CylinderGeometry(radius, radius, len, 10), mat, x, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
    m.rotation.x = Math.atan2(b[1] - a[1], b[0] - a[0]);
    return m;
  };
  /** Side-view outline [z, y][] extruded to `width` (centered on x), with rounded edges. */
  const panel = (pts: [number, number][], width: number, mat: THREE.Material) => {
    const sh = new THREE.Shape(pts.map(([z, y]) => new THREE.Vector2(z, y)));
    const bevel = Math.min(0.05, width * 0.3);
    const depth = Math.max(0.01, width - bevel * 2);
    const g = new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: true, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 3, curveSegments: 6 });
    g.translate(0, 0, -depth / 2);
    g.rotateY(-Math.PI / 2); // outline x (our z) -> world z, extrusion -> world x
    // Taper: narrower towards the top, bottom and both ends, so panels look rounded, not slab-sided.
    g.computeBoundingBox();
    const b = g.boundingBox!;
    const pos = g.getAttribute('position');
    for (let i = 0; i < pos.count; i++) {
      const v = (pos.getY(i) - b.min.y) / (b.max.y - b.min.y || 1);
      const u = (pos.getZ(i) - b.min.z) / (b.max.z - b.min.z || 1);
      const k = (0.5 + 0.5 * Math.sin(Math.PI * v)) * (0.72 + 0.28 * Math.sin(Math.PI * Math.min(1, Math.max(0, u)))) ;
      pos.setX(i, pos.getX(i) * k);
    }
    g.deleteAttribute('normal');
    g.deleteAttribute('uv');
    const smooth = mergeVertices(g, 1e-4);
    g.dispose();
    smooth.computeVertexNormals();
    return add(smooth, mat, 0, 0, 0);
  };

  // --- wheels (pivot steers, inner group spins) ---
  const wheelW = s === 'scooter' ? 0.13 : s === 'adventure' ? 0.15 : 0.17;
  const makeWheel = (z: number) => {
    const pivot = new THREE.Group();
    pivot.position.set(0, r, z);
    pivot.rotation.order = 'YXZ';
    const w = buildWheel(r, wheelW, shape.rims, mats);
    w.position.x = -wheelW * 0.3;
    const spin = new THREE.Group();
    spin.add(w);
    pivot.add(spin);
    pivot.userData.spin = spin;
    root.add(pivot);
    return pivot;
  };
  const front = makeWheel(fz), rear = makeWheel(rz);

  const head: [number, number] = s === 'cruiser' ? [r + 0.72, fz - 0.42] : s === 'scooter' ? [r + 0.62, fz - 0.2] : [r + 0.62, fz - 0.3];
  // --- fork, handlebar with grips ---
  for (const x of [-0.08, 0.08]) tube([r, fz], head, 0.025, mats.rimSilver, x);
  const barW = s === 'cruiser' ? 0.85 : s === 'adventure' ? 0.78 : 0.62;
  const bar = add(new THREE.CylinderGeometry(0.018, 0.018, barW, 8), mats.black, 0, head[0] + (s === 'cruiser' ? 0.16 : 0.08), head[1] - 0.05);
  bar.rotation.z = Math.PI / 2;
  for (const x of [-barW / 2, barW / 2]) add(new THREE.CylinderGeometry(0.024, 0.024, 0.11, 8).rotateZ(Math.PI / 2), seatMat, x * 0.95, bar.position.y, bar.position.z);

  const y0 = r; // axle height
  const sy = shape.seatHeight;
  if (s === 'scooter') {
    // Front shield, floorboard, rounded rear body, seat.
    panel([[fz - 0.14, y0 + 0.05], [fz - 0.1, y0 + 0.76], [fz - 0.2, y0 + 0.78], [fz - 0.24, y0 + 0.08]], 0.42, paint);
    panel([[fz - 0.28, y0 - 0.08], [fz - 0.28, y0 + 0.02], [-0.05, y0 + 0.02], [-0.05, y0 - 0.08]], 0.34, dark);
    panel([[0.0, y0 - 0.05], [0.05, y0 + 0.35], [-0.1, sy - 0.04], [rz - 0.02, sy - 0.06], [rz - 0.16, y0 + 0.25], [rz + 0.1, y0 - 0.02]], 0.44, paint);
    panel([[0.02, sy - 0.04], [0.0, sy + 0.05], [rz + 0.02, sy + 0.06], [rz - 0.02, sy - 0.04]], 0.32, seatMat);
    add(new THREE.CylinderGeometry(0.07, 0.07, 0.05, 18).rotateX(Math.PI / 2), mats.head, 0, y0 + 0.62, fz - 0.06);
  } else {
    // Frame and engine.
    tube(head, [y0 + 0.18, -0.12], 0.035, dark);
    tube([y0 + 0.18, -0.12], [y0 + 0.02, rz + 0.05], 0.03, dark, 0.12);
    tube([y0 + 0.18, -0.12], [y0 + 0.02, rz + 0.05], 0.03, dark, -0.12);
    add(new THREE.BoxGeometry(0.24, 0.22, 0.34), dark, 0, y0 + 0.02, 0.0);
    for (const z of [-0.06, 0.1]) add(new THREE.CylinderGeometry(0.07, 0.08, 0.26, 12), mats.brake, 0, y0 + 0.22, z, 0.25);
    if (s === 'sport') {
      // One sleek panel: beak, fairing, tank, then the raised tail.
      panel([
        [fz - 0.05, y0 + 0.42], [fz - 0.16, y0 + 0.72], [fz - 0.42, y0 + 0.76], [0.02, y0 + 0.7],
        [-0.12, sy + 0.02], [-0.42, sy + 0.04], [rz + 0.12, sy + 0.2], [rz + 0.02, sy + 0.16],
        [rz + 0.22, sy - 0.04], [-0.1, y0 + 0.36], [fz - 0.4, y0 + 0.12], [fz - 0.18, y0 + 0.2],
      ], 0.34, paint);
      add(new THREE.BoxGeometry(0.28, 0.2, 0.02), mats.glass, 0, y0 + 0.82, fz - 0.26, -0.95);
      for (const x of [-0.07, 0.07]) add(new THREE.CylinderGeometry(0.05, 0.05, 0.04, 14).rotateX(Math.PI / 2), mats.head, x, y0 + 0.5, fz - 0.03);
    } else if (s === 'adventure') {
      panel([[fz - 0.12, y0 + 0.5], [fz - 0.22, y0 + 0.9], [0.05, y0 + 0.82], [-0.12, sy + 0.04], [-0.12, y0 + 0.38], [fz - 0.38, y0 + 0.3]], 0.42, paint);
      panel([[-0.12, sy - 0.02], [rz + 0.1, sy + 0.08], [rz, sy - 0.02], [-0.12, sy - 0.12]], 0.3, dark);
      add(new THREE.BoxGeometry(0.36, 0.34, 0.02), mats.glass, 0, y0 + 1.0, fz - 0.28, -0.35);
      add(new THREE.CylinderGeometry(0.075, 0.075, 0.05, 18).rotateX(Math.PI / 2), mats.head, 0, y0 + 0.62, fz - 0.1);
    } else {
      // Naked and cruiser: teardrop tank, small tail, round headlight.
      const low = s === 'cruiser' ? -0.08 : 0;
      panel([[0.3, y0 + 0.5 + low], [0.24, y0 + 0.68 + low], [-0.02, y0 + 0.7 + low], [-0.16, y0 + 0.55 + low], [0.02, y0 + 0.44 + low]], 0.36, paint);
      panel([[-0.36, sy - 0.02], [rz + 0.1, sy + (s === 'cruiser' ? 0.0 : 0.12)], [rz + 0.02, sy + 0.04], [-0.3, sy - 0.1]], 0.24, paint);
      add(new THREE.CylinderGeometry(0.085, 0.085, 0.07, 18).rotateX(Math.PI / 2), mats.head, 0, head[0] - 0.04, head[1] + 0.08);
      if (s === 'cruiser') {
        // Big rear fender (paint) and chrome front fender.
        panel([[rz + 0.38, y0 + 0.02], [rz + 0.2, y0 + r + 0.12], [rz - 0.18, y0 + r + 0.05], [rz - 0.3, y0 - 0.05], [rz - 0.05, y0 + r - 0.05], [rz + 0.22, y0 + 0.1]], 0.3, paint);
        panel([[fz + 0.28, y0], [fz + 0.12, y0 + r + 0.08], [fz - 0.2, y0 + r + 0.05], [fz - 0.05, y0 + r - 0.02], [fz + 0.18, y0 + 0.02]], 0.22, mats.chrome);
      }
    }
    // Seat and exhaust.
    panel([[0.02, sy - 0.04], [-0.06, sy + 0.05], [-0.45, sy + 0.07], [-0.52, sy - 0.02], [-0.3, sy - 0.06]], 0.3, seatMat);
    const ex = add(new THREE.CylinderGeometry(0.05, 0.06, 0.6, 12), mats.chrome, 0.17, y0 + (s === 'cruiser' ? 0.05 : 0.2), rz + 0.32, Math.PI / 2 + (s === 'sport' ? -0.4 : -0.08));
    ex.castShadow = false;
    if (s !== 'cruiser') {
      panel([[fz + 0.22, y0 + 0.05], [fz + 0.08, y0 + r + 0.06], [fz - 0.16, y0 + r + 0.04], [fz - 0.02, y0 + r - 0.02], [fz + 0.14, y0 + 0.05]], 0.14, paint);
    }
  }
  add(new THREE.BoxGeometry(0.16, 0.05, 0.03), mats.tail, 0, sy + 0.04, rz + 0.03);
  add(new THREE.BoxGeometry(0.18, 0.1, 0.02), mats.plate, 0, r + 0.32, rz - 0.04);
  const shadowMesh = contactShadow(0.9, wb + r * 2.6);
  root.add(shadowMesh);
  mergeStaticParts(root, new Set([shadowMesh]));

  return {
    root,
    wheels: { fl: front, fr: front, rl: rear, rr: rear },
    seat: new THREE.Vector3(0, sy - 0.42, -0.42),
    setColor: (c) => paint.color.set(c),
    dispose() {
      root.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
      own.forEach((m) => m.dispose());
      root.removeFromParent();
    },
  };
}
