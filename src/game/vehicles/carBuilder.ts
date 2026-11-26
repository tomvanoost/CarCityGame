import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { createBodyMaterial } from './bodyMaterial';
import type { CarShape, Curve, RimStyle } from './types';

/**
 * Builds a car mesh from a compact shape description (see types.ts).
 * The body is a "loft": cross-sections swept along the car's length, shaped by
 * side-profile curves. This keeps every car unique, small and fast to render.
 *
 * Local axes: +Z = forward, +Y = up, X = sideways. Origin = ground, center.
 */

export interface BuiltCar {
  root: THREE.Group;
  /** Wheel pivots: rotate .rotation.x to spin, front ones .rotation.y to steer. */
  wheels: { fl: THREE.Group; fr: THREE.Group; rl: THREE.Group; rr: THREE.Group };
  setColor(color: THREE.ColorRepresentation): void;
  /** Where the driver's hips go (vehicle-local). Use `seatedRootPosition()` to place a character. */
  seat: THREE.Vector3;
  /** Scale for the character in the seat (smaller in very low cars); default SEATED_SCALE. */
  seatScale?: number;
  dispose(): void;
}

// ---------- shared materials (one copy for all cars) ----------
let shared: ReturnType<typeof makeSharedMaterials> | null = null;
/** Materials shared by all vehicles (glass, tires, rims, lights...). */
export function sharedVehicleMaterials() { return (shared ??= makeSharedMaterials()); }
function makeSharedMaterials() {
  return {
    glass: new THREE.MeshPhysicalMaterial({ color: 0x0e1822, metalness: 0.25, roughness: 0.04, clearcoat: 1, transparent: true, opacity: 0.68 }),
    chrome: new THREE.MeshStandardMaterial({ color: 0xe8ebef, roughness: 0.12, metalness: 1 }),
    caliperRed: new THREE.MeshStandardMaterial({ color: 0xc8161d, roughness: 0.35, metalness: 0.3 }),
    caliperGrey: new THREE.MeshStandardMaterial({ color: 0x5f646b, roughness: 0.45, metalness: 0.6 }),
    seat: new THREE.MeshStandardMaterial({ color: 0x2a2c31, roughness: 0.85 }),
    shadow: new THREE.MeshBasicMaterial({ map: blobTexture(), transparent: true, depthWrite: false, opacity: 0.55 }),
    trim: new THREE.MeshStandardMaterial({ color: 0x15171a, roughness: 0.6, metalness: 0.1 }),
    black: new THREE.MeshPhysicalMaterial({ color: 0x0a0a0c, roughness: 0.25, metalness: 0.3, clearcoat: 0.8 }),
    tire: new THREE.MeshStandardMaterial({ color: 0x1b1b1d, roughness: 0.92, metalness: 0 }),
    rimSilver: new THREE.MeshStandardMaterial({ color: 0xd9dde2, roughness: 0.22, metalness: 1 }),
    rimDark: new THREE.MeshStandardMaterial({ color: 0x2c2f35, roughness: 0.3, metalness: 0.9 }),
    brake: new THREE.MeshStandardMaterial({ color: 0x55585e, roughness: 0.5, metalness: 0.8 }),
    head: new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xeaf4ff, emissiveIntensity: 1.6, roughness: 0.1 }),
    tail: new THREE.MeshStandardMaterial({ color: 0x8a0a0a, emissive: 0xff1a1a, emissiveIntensity: 1.2, roughness: 0.2 }),
    plate: new THREE.MeshStandardMaterial({ color: 0xf2c500, roughness: 0.4 }),
    interior: new THREE.MeshStandardMaterial({ color: 0x222428, roughness: 0.9 }),
  };
}

/** Soft round shadow texture placed under vehicles so they sit on the ground. */
function blobTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grd = g.createRadialGradient(32, 32, 4, 32, 32, 32);
  grd.addColorStop(0, 'rgba(0,0,0,0.85)');
  grd.addColorStop(0.55, 'rgba(0,0,0,0.45)');
  grd.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

/** Flat soft shadow under a vehicle (sized in meters). */
export function contactShadow(width: number, length: number): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(width, length).rotateX(-Math.PI / 2), sharedVehicleMaterials().shadow);
  m.position.y = 0.025;
  m.renderOrder = 2;
  return m;
}

/**
 * Merges the static small parts of a vehicle (direct mesh children of `root`, not the
 * wheels) that share a material into one mesh each: fewer draw calls per car.
 */
export function mergeStaticParts(root: THREE.Group, keep: Set<THREE.Object3D>) {
  const buckets = new Map<THREE.Material, THREE.Mesh[]>();
  for (const c of root.children) {
    const m = c as THREE.Mesh;
    if (!m.isMesh || keep.has(m) || Array.isArray(m.material)) continue;
    const list = buckets.get(m.material) ?? [];
    list.push(m);
    buckets.set(m.material, list);
  }
  for (const [mat, list] of buckets) {
    if (list.length < 2) continue;
    const geos = list.map((m) => {
      m.updateMatrix();
      let g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
      for (const n of Object.keys(g.attributes)) if (n !== 'position' && n !== 'normal') g.deleteAttribute(n);
      if (!g.getAttribute('normal')) g.computeVertexNormals();
      g = g.applyMatrix4(m.matrix);
      return g;
    });
    const merged = new THREE.Mesh(mergeGeometries(geos), mat);
    merged.castShadow = list.some((m) => m.castShadow);
    merged.receiveShadow = list.some((m) => m.receiveShadow);
    geos.forEach((g) => g.dispose());
    for (const m of list) { m.removeFromParent(); m.geometry.dispose(); }
    root.add(merged);
  }
}

/**
 * Hip position of a character in the end pose of the SitDown animation, relative to the
 * character's root, at scale 1 (measured from the shared character skeleton).
 */
const SEATED_HIP = { y: 0.34, z: -0.19 };
/** Scale of characters sitting in vehicles. */
export const SEATED_SCALE = 0.74;

/** Root position that puts a seated character's hips on `seat`. */
export function seatedRootPosition(seat: THREE.Vector3, scale = SEATED_SCALE): THREE.Vector3 {
  return new THREE.Vector3(seat.x, seat.y - SEATED_HIP.y * scale, seat.z - SEATED_HIP.z * scale);
}

// ---------- curve helper: smooth monotone interpolation ----------
function makeCurve(keys: Curve): (t: number) => number {
  const k = [...keys].sort((a, b) => a[0] - b[0]);
  const n = k.length;
  const d: number[] = [];
  const m: number[] = new Array(n).fill(0);
  for (let i = 0; i < n - 1; i++) d.push((k[i + 1][1] - k[i][1]) / (k[i + 1][0] - k[i][0]));
  m[0] = d[0];
  m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) { m[i] = m[i + 1] = 0; continue; }
    const a = m[i] / d[i], b = m[i + 1] / d[i], s = a * a + b * b;
    if (s > 9) { const tau = 3 / Math.sqrt(s); m[i] = tau * a * d[i]; m[i + 1] = tau * b * d[i]; }
  }
  return (t: number) => {
    if (t <= k[0][0]) return k[0][1];
    if (t >= k[n - 1][0]) return k[n - 1][1];
    let i = 0;
    while (t > k[i + 1][0]) i++;
    const h = k[i + 1][0] - k[i][0], u = (t - k[i][0]) / h;
    const u2 = u * u, u3 = u2 * u;
    return (2 * u3 - 3 * u2 + 1) * k[i][1] + (u3 - 2 * u2 + u) * h * m[i] + (-2 * u3 + 3 * u2) * k[i + 1][1] + (u3 - u2) * h * m[i + 1];
  };
}

/** Superellipse point for angle phi (n = boxiness). */
function superPt(phi: number, n: number): [number, number] {
  const c = Math.cos(phi), s = Math.sin(phi);
  return [Math.sign(c) * Math.abs(c) ** (2 / n), Math.sign(s) * Math.abs(s) ** (2 / n)];
}

/**
 * Generic loft: `rings[i]` is a closed loop of points at station z[i].
 * `classify(i, j)` picks a material group for the quad between ring i..i+1, segment j..j+1.
 */
function loft(rings: THREE.Vector3[][], classify: (i: number, j: number) => number, groups: number): THREE.BufferGeometry {
  const R = rings[0].length;
  const pos: number[] = [];
  for (const ring of rings) for (const p of ring) pos.push(p.x, p.y, p.z);
  const idx: number[][] = Array.from({ length: groups }, () => []);
  for (let i = 0; i < rings.length - 1; i++) {
    for (let j = 0; j < R; j++) {
      const j2 = (j + 1) % R;
      const a = i * R + j, b = i * R + j2, c = (i + 1) * R + j, d = (i + 1) * R + j2;
      const g = idx[classify(i, j)];
      g.push(a, c, b, b, c, d);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  const all: number[] = [];
  let start = 0;
  idx.forEach((list, g) => {
    all.push(...list);
    geo.addGroup(start, list.length, g);
    start += list.length;
  });
  geo.setIndex(all);
  geo.computeVertexNormals();
  return geo;
}

// ---------- wheels ----------
export function buildWheel(r: number, w: number, style: RimStyle, mats: ReturnType<typeof makeSharedMaterials>): THREE.Group {
  const g = new THREE.Group();
  // Tire: lathe of a rounded profile, axis turned to X.
  const pts: THREE.Vector2[] = [];
  const inner = r * 0.68, hw = w / 2, bevel = Math.min(w * 0.25, r * 0.18);
  pts.push(new THREE.Vector2(inner, -hw));
  for (let i = 0; i <= 6; i++) {
    const a = -Math.PI / 2 + (i / 6) * (Math.PI / 2);
    pts.push(new THREE.Vector2(r - bevel + Math.cos(a) * bevel, -hw + bevel + Math.sin(a) * bevel));
  }
  for (let i = 0; i <= 6; i++) {
    const a = (i / 6) * (Math.PI / 2);
    pts.push(new THREE.Vector2(r - bevel + Math.cos(a) * bevel, hw - bevel + Math.sin(a) * bevel));
  }
  pts.push(new THREE.Vector2(inner, hw));
  const tireGeo = new THREE.LatheGeometry(pts, 28);
  tireGeo.rotateZ(Math.PI / 2);
  const tire = new THREE.Mesh(tireGeo, mats.tire);
  tire.castShadow = true;
  g.add(tire);

  // Rim: dish + spokes, merged into one geometry.
  const rimR = inner * 1.02;
  const parts: THREE.BufferGeometry[] = [];
  const barrel = new THREE.CylinderGeometry(rimR, rimR, w * 0.9, 24, 1, true);
  barrel.rotateZ(Math.PI / 2);
  parts.push(barrel);
  const hub = new THREE.CylinderGeometry(rimR * 0.22, rimR * 0.26, w * 0.2, 12);
  hub.rotateZ(Math.PI / 2);
  hub.translate(w * 0.32, 0, 0);
  parts.push(hub);
  const cfg: Record<RimStyle, { n: number; sw: number; disc: boolean }> = {
    spokes5: { n: 5, sw: 0.22, disc: false },
    multi: { n: 10, sw: 0.09, disc: false },
    sport: { n: 7, sw: 0.13, disc: false },
    aero: { n: 5, sw: 0.3, disc: true },
  };
  const { n, sw, disc } = cfg[style];
  if (disc) {
    const d = new THREE.CylinderGeometry(rimR * 0.95, rimR * 0.95, 0.02, 24);
    d.rotateZ(Math.PI / 2);
    d.translate(w * 0.36, 0, 0);
    parts.push(d);
  }
  for (let i = 0; i < n; i++) {
    const s = new THREE.BoxGeometry(w * 0.12, rimR * 0.95, rimR * sw);
    s.translate(w * 0.34, rimR * 0.5, 0);
    s.rotateX((i / n) * Math.PI * 2);
    parts.push(s);
  }
  const rim = new THREE.Mesh(mergeGeometries(parts.map((p) => p.toNonIndexed())), style === 'sport' || style === 'aero' ? mats.rimDark : mats.rimSilver);
  parts.forEach((p) => p.dispose());
  g.add(rim);

  const brake = new THREE.Mesh(new THREE.CylinderGeometry(rimR * 0.7, rimR * 0.7, 0.03, 20), mats.brake);
  brake.geometry.rotateZ(Math.PI / 2);
  g.add(brake);
  // Polished rim lip, center cap and wheel nuts: merged into one chrome mesh.
  const chromeParts: THREE.BufferGeometry[] = [];
  const lip = new THREE.TorusGeometry(rimR * 0.98, rimR * 0.045, 6, 28).rotateY(Math.PI / 2).translate(w * 0.4, 0, 0);
  chromeParts.push(lip);
  const cap = new THREE.CylinderGeometry(rimR * 0.13, rimR * 0.13, 0.02, 14).rotateZ(Math.PI / 2).translate(w * 0.43, 0, 0);
  if (style === 'sport' || style === 'aero') chromeParts.push(cap);
  else { const c = new THREE.Mesh(cap, mats.black); g.add(c); }
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    chromeParts.push(new THREE.CylinderGeometry(rimR * 0.03, rimR * 0.03, 0.025, 6).rotateZ(Math.PI / 2).translate(w * 0.42, Math.cos(a) * rimR * 0.2, Math.sin(a) * rimR * 0.2));
  }
  const flat = chromeParts.map((p) => { const n = p.toNonIndexed(); n.deleteAttribute('uv'); return n; });
  g.add(new THREE.Mesh(mergeGeometries(flat), mats.chrome));
  chromeParts.forEach((p) => p.dispose());
  flat.forEach((p) => p.dispose());
  return g;
}

// ---------- the car ----------
export function buildCar(shape: CarShape, color: THREE.ColorRepresentation): BuiltCar {
  const mats = (shared ??= makeSharedMaterials());
  const paint = new THREE.MeshPhysicalMaterial({ color, metalness: 0.6, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.03 });
  const roofMat = shape.roofColor === 'black' ? mats.black : paint;

  const L = shape.length, W = shape.width;
  const top = makeCurve(shape.top), bottom = makeCurve(shape.bottom), plan = makeCurve(shape.plan), roof = makeCurve(shape.roof);
  const tumble = shape.tumblehome ?? 0.05, box = shape.boxiness ?? 5, endR = shape.endRound ?? 0.2;
  const zOf = (t: number) => L / 2 - t * L;
  const axles = [shape.frontAxle, shape.rearAxle].map(zOf);
  const archR = shape.wheelRadius * 1.1;

  const root = new THREE.Group();
  const r0 = shape.roof[0][0], r1 = shape.roof[shape.roof.length - 1][0];
  const tMid = (r0 + r1) / 2;

  // Measurements for seams, handles and arch trim (drawn by the body shader).
  const doors = shape.doors ?? 4;
  const doorFront = axles[0] - archR - 0.12;
  const bPillar = shape.pillars?.find(([p0, p1]) => (p0 + p1) / 2 > 0.45 && (p0 + p1) / 2 < 0.7);
  const doorRear4 = axles[1] + archR + 0.1;
  const details = {
    doorFront,
    doorMid: doors === 4 ? (bPillar ? zOf((bPillar[0] + bPillar[1]) / 2) : (doorFront + doorRear4) / 2) : zOf(r0 + (r1 - r0) * 0.62),
    doorRear: doors === 4 ? doorRear4 : -99,
    cowl: zOf(r0) + 0.06,
    trunk: zOf(r1) - 0.05,
    belt: top(tMid),
    halfWidth: W / 2,
    frontAxle: axles[0],
    rearAxle: axles[1],
    wheelRadius: shape.wheelRadius,
    archRadius: archR,
    archTrim: shape.archTrim ?? 0.035,
  };
  const bodyMat = createBodyMaterial(shape, color, details);

  // --- body ---
  const ts: number[] = [];
  const N = 130;
  for (let i = 0; i < N; i++) ts.push(i / (N - 1));
  for (let i = 1; i < 10; i++) { const e = ((i / 10) ** 2 * endR) / L; ts.push(e, 1 - e); }
  ts.sort((a, b) => a - b);

  const R = 36;
  const bodyRings: THREE.Vector3[][] = [];
  const scales: number[] = [];
  for (const t of ts) {
    const z = zOf(t);
    const yt = top(t);
    let yb = bottom(t);
    for (const az of axles) {
      const dz = Math.abs(z - az);
      if (dz < archR) yb = Math.max(yb, shape.wheelRadius + Math.sqrt(archR * archR - dz * dz) * 0.92);
    }
    yb = Math.min(yb, yt - 0.08);
    // Rounded nose / tail.
    const dEnd = Math.min(t * L, (1 - t) * L);
    const s = dEnd < endR ? Math.sqrt(Math.max(0, 1 - (1 - dEnd / endR) ** 2)) : 1;
    scales.push(s);
    const hw = (W / 2) * plan(t) * s;
    const mid = (yt + yb) / 2, hh = ((yt - yb) / 2) * s;
    const ring: THREE.Vector3[] = [];
    for (let j = 0; j < R; j++) {
      const [cx, cy] = superPt((j / R) * Math.PI * 2, box);
      ring.push(new THREE.Vector3(hw * cx * (1 - tumble * (cy + 1) / 2), mid + hh * cy, z));
    }
    bodyRings.push(ring);
  }
  // Per-vertex face coordinates for the body shader (lights, grille, trim).
  // On the rounded nose/tail the rings shrink, so a point's position on the
  // front face is its ring coordinate times the ring scale: s * (cx, cy).
  const face: number[] = [];
  ts.forEach((t, i) => {
    for (let j = 0; j < R; j++) {
      const [cx, cy] = superPt((j / R) * Math.PI * 2, box);
      face.push(cx * scales[i], cy * scales[i], t < 0.5 ? 1 : 0, cy);
    }
  });
  const bodyGeo = loft(bodyRings, () => 0, 1);
  bodyGeo.setAttribute('aFace', new THREE.Float32BufferAttribute(face, 4));
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  body.castShadow = true;
  body.receiveShadow = true;
  root.add(body);

  // --- cabin (glass + roof) ---
  const CN = 60, CR = 32;
  const belts: number[] = [];
  const cabRings: THREE.Vector3[][] = [];
  const slope: number[] = [];
  for (let i = 0; i < CN; i++) {
    const t = r0 + (i / (CN - 1)) * (r1 - r0);
    const z = zOf(t);
    const belt = top(t) - 0.02;
    belts.push(belt);
    const yr = Math.max(roof(t), belt + 0.002);
    const yb = belt - 0.14;
    const hw = (W / 2) * plan(t);
    const mid = (yb + yr) / 2, hh = (yr - yb) / 2;
    const ring: THREE.Vector3[] = [];
    for (let j = 0; j < CR; j++) {
      const [cx, cy] = superPt((j / CR) * Math.PI * 2, 3.6);
      const k = (cy + 1) / 2; // 0 bottom .. 1 top
      ring.push(new THREE.Vector3(hw * cx * (0.93 - 0.17 * k), mid + hh * cy, z));
    }
    cabRings.push(ring);
    const dt = 0.01;
    slope.push(Math.abs(roof(t + dt) - roof(t - dt)) / (2 * dt * L));
  }
  // group 0 = glass, 1 = roof panel / pillars, 2 = window trim along the bottom of the side windows
  const cabT = (i: number) => r0 + ((i + 0.5) / (CN - 1)) * (r1 - r0);
  const cabGeo = loft(cabRings, (i, j) => {
    const a = ((j + 0.5) / CR) * Math.PI * 2;
    const cy = Math.sin(a), ax = Math.abs(Math.cos(a));
    const y = (cabRings[i][j].y + cabRings[i][(j + 1) % CR].y) / 2;
    if (ax > 0.55 && y > belts[i] - 0.005 && y < belts[i] + 0.045 && i > 1 && i < CN - 3) return 2;
    const flat = slope[i] < 0.3 && slope[i + 1] < 0.3;
    if (cy > 0.86 && flat) return 1; // roof
    if (cy > 0.5 && ax > 0.62 && !flat) return 1; // A-pillar / rear pillar edges
    const t = cabT(i);
    if (cy > -0.2 && cy < 0.9 && ax > 0.5 && shape.pillars?.some(([p0, p1]) => t >= p0 && t <= p1)) return 1;
    return 0;
  }, 3);
  const cabin = new THREE.Mesh(cabGeo, [mats.glass, roofMat, shape.trim === 'chrome' ? mats.chrome : mats.black]);
  cabin.castShadow = true;
  root.add(cabin);

  // Interior: floor/tub, dashboard, seats and a steering wheel (seen through the glass).
  const innerW = W * plan(tMid) * 0.78;
  const floorY = top(tMid) - 0.5;
  const interior = new THREE.Mesh(new THREE.BoxGeometry(innerW, 0.3, (r1 - r0) * L * 0.7), mats.interior);
  interior.position.set(0, floorY, zOf(tMid));
  root.add(interior);
  const dashZ = zOf(r0) - 0.32;
  const dash = new THREE.Mesh(new THREE.BoxGeometry(innerW, 0.18, 0.32), mats.interior);
  dash.position.set(0, top(r0 + 0.02) - 0.02, dashZ);
  root.add(dash);
  // Driver position: the hips sit ~0.5 m behind the steering wheel, high enough that the
  // head shows in the window, low enough that it stays under the roof (sports cars are low).
  const hipZ = dashZ - 0.7;
  const tHip = (L / 2 - hipZ) / L;
  const hipY = Math.min(top(tHip) - 0.32, roof(tHip) - 0.8);
  const hipX = W * 0.2;
  const seatGeo = new THREE.BoxGeometry(0.46, 0.62, 0.12).translate(0, 0.31, 0);
  const cushionGeo = new THREE.BoxGeometry(0.46, 0.12, 0.46);
  for (const sx of [-1, 1]) {
    const back = new THREE.Mesh(seatGeo, mats.seat);
    back.position.set(sx * hipX, hipY - 0.08, hipZ - 0.22);
    back.rotation.x = -0.2;
    root.add(back);
    const cushion = new THREE.Mesh(cushionGeo, mats.seat);
    cushion.position.set(sx * hipX, hipY - 0.12, hipZ + 0.02);
    root.add(cushion);
  }
  if (doors === 4) {
    const bench = new THREE.Mesh(new THREE.BoxGeometry(innerW * 0.9, 0.5, 0.12).translate(0, 0.25, 0), mats.seat);
    bench.position.set(0, hipY - 0.1, hipZ - 0.95);
    bench.rotation.x = -0.15;
    root.add(bench);
  }
  const wheelRing = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.022, 6, 20), mats.black);
  wheelRing.position.set(hipX, hipY + 0.32, hipZ + 0.45);
  wheelRing.rotation.x = -0.45;
  root.add(wheelRing);
  const column = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.3, 8), mats.black);
  column.position.set(hipX, hipY + 0.27, hipZ + 0.58);
  column.rotation.x = -0.45 + Math.PI / 2;
  root.add(column);

  // Chassis filler (hides see-through between wheel arches).
  const chassis = new THREE.Mesh(
    new THREE.BoxGeometry(W * 0.72, 0.42, (shape.rearAxle - shape.frontAxle) * L + archR * 2.4),
    mats.trim,
  );
  chassis.position.set(0, shape.wheelRadius + 0.05, (axles[0] + axles[1]) / 2);
  root.add(chassis);

  // --- lights, grille, plates, mirrors ---
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, ry = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.rotation.y = ry;
    root.add(m);
    return m;
  };
  // Plates sit on the rounded nose/tail at normalized height `ny` (see aFace).
  const plate = (tEnd: number, ny: number, dir: number) => {
    const tt = tEnd === 0 ? endR / L : 1 - endR / L;
    const yt = top(tt), yb = bottom(tt), mid = (yt + yb) / 2, hh = (yt - yb) / 2;
    const d = endR * (1 - Math.sqrt(1 - ny * ny)) * 0.9;
    add(new THREE.BoxGeometry(0.52, 0.11, 0.03), mats.plate, 0, mid + hh * ny, dir * (L / 2 - d));
  };
  plate(0, -0.6, 1);
  plate(1, -0.05, -1);

  if (shape.spoiler) {
    const sy = top(0.94) + 0.22, sz = zOf(0.95);
    for (const sx of [-0.45, 0.45]) add(new THREE.BoxGeometry(0.06, 0.24, 0.12), mats.black, sx * W * 0.8, sy - 0.12, sz);
    add(new THREE.BoxGeometry(W * 0.92, 0.05, 0.34), mats.black, 0, sy, sz - 0.04).castShadow = true;
  }

  const mt = r0 + (r1 - r0) * 0.12;
  for (const sx of [-1, 1]) {
    const mx = sx * ((W / 2) * plan(mt) * 0.84 + 0.07);
    const head = add(new THREE.SphereGeometry(0.5, 14, 10), paint, mx, top(mt) + 0.07, zOf(mt));
    head.scale.set(0.2, 0.11, 0.1);
    head.castShadow = true;
    const glassM = add(new THREE.CircleGeometry(0.5, 14), mats.chrome, mx, top(mt) + 0.07, zOf(mt) - 0.051, Math.PI);
    glassM.scale.set(0.17, 0.085, 1);
    add(new THREE.BoxGeometry(0.1, 0.03, 0.05), mats.black, mx - sx * 0.08, top(mt) + 0.03, zOf(mt));
  }
  // Exhaust tips under the rear bumper.
  const ex = shape.exhaust ?? 0;
  for (let i = 0; i < ex; i++) {
    const sx = ex === 1 ? -0.3 : i === 0 ? -0.32 : 0.32;
    const tip = add(new THREE.CylinderGeometry(0.045, 0.05, 0.12, 14).rotateX(Math.PI / 2), mats.chrome, sx * W, bottom(0.97) + 0.07, -L / 2 + endR * 0.45);
    tip.castShadow = false;
  }

  // --- wheels ---
  const wx = W / 2 - shape.wheelWidth / 2 - 0.02;
  const makeWheel = (x: number, z: number) => {
    const pivot = new THREE.Group();
    pivot.position.set(x, shape.wheelRadius, z);
    const wheel = buildWheel(shape.wheelRadius, shape.wheelWidth, shape.rims, mats);
    const spin = new THREE.Group();
    spin.add(wheel);
    if (x < 0) wheel.rotation.y = Math.PI; // rim faces outward
    pivot.add(spin);
    pivot.userData.spin = spin;
    // Brake caliper: does not turn with the wheel.
    const cal = new THREE.Mesh(new THREE.BoxGeometry(0.06, shape.wheelRadius * 0.42, shape.wheelRadius * 0.28),
      shape.rims === 'sport' ? mats.caliperRed : mats.caliperGrey);
    cal.position.set(Math.sign(x) * shape.wheelWidth * 0.12, shape.wheelRadius * 0.28, -shape.wheelRadius * 0.28);
    cal.rotation.x = 0.8;
    pivot.add(cal);
    root.add(pivot);
    return pivot;
  };
  const wheels = {
    fl: makeWheel(wx, axles[0]),
    fr: makeWheel(-wx, axles[0]),
    rl: makeWheel(wx, axles[1]),
    rr: makeWheel(-wx, axles[1]),
  };

  const seat = new THREE.Vector3(hipX, hipY, hipZ);

  // Soft contact shadow so the car sits on the road.
  const shadowMesh = contactShadow(W * 1.35, L * 1.15);
  root.add(shadowMesh);
  mergeStaticParts(root, new Set([body, cabin, shadowMesh]));

  return {
    root,
    wheels,
    seat,
    setColor: (c) => { paint.color.set(c); bodyMat.color.set(c); },
    dispose() {
      root.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
      paint.dispose();
      bodyMat.dispose();
      root.removeFromParent();
    },
  };
}
