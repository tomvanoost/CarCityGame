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
  /** Driver seat position (local), for putting the avatar inside. */
  seat: THREE.Vector3;
  dispose(): void;
}

// ---------- shared materials (one copy for all cars) ----------
let shared: ReturnType<typeof makeSharedMaterials> | null = null;
function makeSharedMaterials() {
  return {
    glass: new THREE.MeshPhysicalMaterial({ color: 0x0b1118, metalness: 0.2, roughness: 0.05, clearcoat: 1, transparent: true, opacity: 0.82 }),
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
function buildWheel(r: number, w: number, style: RimStyle, mats: ReturnType<typeof makeSharedMaterials>): THREE.Group {
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
  return g;
}

// ---------- the car ----------
export function buildCar(shape: CarShape, color: THREE.ColorRepresentation): BuiltCar {
  const mats = (shared ??= makeSharedMaterials());
  const bodyMat = createBodyMaterial(shape, color);
  const paint = new THREE.MeshPhysicalMaterial({ color, metalness: 0.6, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.03 });
  const roofMat = shape.roofColor === 'black' ? mats.black : paint;

  const L = shape.length, W = shape.width;
  const top = makeCurve(shape.top), bottom = makeCurve(shape.bottom), plan = makeCurve(shape.plan), roof = makeCurve(shape.roof);
  const tumble = shape.tumblehome ?? 0.05, box = shape.boxiness ?? 5, endR = shape.endRound ?? 0.2;
  const zOf = (t: number) => L / 2 - t * L;
  const axles = [shape.frontAxle, shape.rearAxle].map(zOf);
  const archR = shape.wheelRadius * 1.1;

  const root = new THREE.Group();

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
  const r0 = shape.roof[0][0], r1 = shape.roof[shape.roof.length - 1][0];
  const CN = 60, CR = 32;
  const cabRings: THREE.Vector3[][] = [];
  const slope: number[] = [];
  for (let i = 0; i < CN; i++) {
    const t = r0 + (i / (CN - 1)) * (r1 - r0);
    const z = zOf(t);
    const belt = top(t) - 0.02;
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
  // group 0 = glass, 1 = roof panel / pillars
  const cabT = (i: number) => r0 + ((i + 0.5) / (CN - 1)) * (r1 - r0);
  const cabGeo = loft(cabRings, (i, j) => {
    const a = ((j + 0.5) / CR) * Math.PI * 2;
    const cy = Math.sin(a), ax = Math.abs(Math.cos(a));
    const flat = slope[i] < 0.3 && slope[i + 1] < 0.3;
    if (cy > 0.86 && flat) return 1; // roof
    if (cy > 0.5 && ax > 0.62 && !flat) return 1; // A-pillar / rear pillar edges
    const t = cabT(i);
    if (cy > -0.2 && cy < 0.9 && ax > 0.5 && shape.pillars?.some(([p0, p1]) => t >= p0 && t <= p1)) return 1;
    return 0;
  }, 2);
  const cabin = new THREE.Mesh(cabGeo, [mats.glass, roofMat]);
  cabin.castShadow = true;
  root.add(cabin);

  // Dark interior block so the inside isn't see-through, plus seats.
  const tMid = (r0 + r1) / 2;
  const innerW = W * plan(tMid) * 0.78;
  const interior = new THREE.Mesh(new THREE.BoxGeometry(innerW, 0.35, (r1 - r0) * L * 0.62), mats.interior);
  interior.position.set(0, top(tMid) - 0.1, zOf(tMid));
  root.add(interior);

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

  const mt = r0 + (r1 - r0) * 0.12;
  for (const sx of [-1, 1]) {
    const mirror = add(new THREE.BoxGeometry(0.2, 0.1, 0.07), paint, sx * ((W / 2) * plan(mt) * 0.84 + 0.05), top(mt) + 0.05, zOf(mt));
    mirror.castShadow = true;
  }

  // --- wheels ---
  const wx = W / 2 - shape.wheelWidth / 2 - 0.02;
  const makeWheel = (x: number, z: number) => {
    const pivot = new THREE.Group();
    pivot.position.set(x, shape.wheelRadius, z);
    const wheel = buildWheel(shape.wheelRadius, shape.wheelWidth, shape.rims, mats);
    if (x < 0) wheel.rotation.y = Math.PI; // rim faces outward
    pivot.add(wheel);
    root.add(pivot);
    return pivot;
  };
  const wheels = {
    fl: makeWheel(wx, axles[0]),
    fr: makeWheel(-wx, axles[0]),
    rl: makeWheel(wx, axles[1]),
    rr: makeWheel(-wx, axles[1]),
  };

  const seat = new THREE.Vector3(W * 0.2, top(tMid) - 0.35, zOf(tMid) + 0.1);

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
