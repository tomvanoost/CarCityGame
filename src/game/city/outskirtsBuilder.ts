import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { CityLayout } from './layout';
import {
  BRIDGE, DESERT, DESERT_TOWN, FOOTBRIDGE, HIGHWAYS, HW_HALF, LAKE, LAKE_TOWN, OUT_ROADS, OUT_ROAD_HALF, PATH, STREAM,
  bridgeHeight, desertAmount, duneHeight, footbridgeHeight, outskirtsHeight,
} from './outskirts';
import type { Field, TownBuilding } from './towns';

const GRASS = new THREE.Color('#74ad52');
const SAND = new THREE.Color('#e2c68c');
const BEACH = new THREE.Color('#e6d3a2');

/** Collects triangles with a color per vertex (computed normals). */
class Tris {
  pos: number[] = [];
  col: number[] = [];
  private c = new THREE.Color();
  tri(a: number[], b: number[], c: number[], color: THREE.ColorRepresentation | [THREE.Color, THREE.Color, THREE.Color]) {
    this.pos.push(...a, ...b, ...c);
    if (Array.isArray(color)) for (const k of color) this.col.push(k.r, k.g, k.b);
    else { this.c.set(color); for (let i = 0; i < 3; i++) this.col.push(this.c.r, this.c.g, this.c.b); }
  }
  /** Quad a-b-c-d (counter-clockwise seen from the side it faces). */
  quad(a: number[], b: number[], c: number[], d: number[], color: THREE.ColorRepresentation) {
    this.tri(a, b, c, color); this.tri(a, c, d, color);
  }
  /** Axis-aligned box. */
  box(cx: number, cy: number, cz: number, sx: number, sy: number, sz: number, color: THREE.ColorRepresentation) {
    const x0 = cx - sx / 2, x1 = cx + sx / 2, y0 = cy - sy / 2, y1 = cy + sy / 2, z0 = cz - sz / 2, z1 = cz + sz / 2;
    this.quad([x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0], color); // top
    this.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], color); // +z
    this.quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], color); // -z
    this.quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], color); // +x
    this.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], color); // -x
    this.quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], color); // bottom
  }
  /** Upright cylinder (r0 at the bottom, r1 at the top), sides and top cap. */
  cyl(cx: number, cz: number, r0: number, r1: number, y0: number, y1: number, color: THREE.ColorRepresentation, seg = 12) {
    for (let i = 0; i < seg; i++) {
      const a0 = (i / seg) * Math.PI * 2, a1 = ((i + 1) / seg) * Math.PI * 2;
      const p = (a: number, r: number, y: number) => [cx + Math.cos(a) * r, y, cz + Math.sin(a) * r];
      this.quad(p(a0, r0, y0), p(a0, r1, y1), p(a1, r1, y1), p(a1, r0, y0), color);
      if (r1 > 0) this.tri([cx, y1, cz], p(a1, r1, y1), p(a0, r1, y1), color);
    }
  }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.computeVertexNormals();
    return g;
  }
}

/** Road surface texture: asphalt, white edge lines, a dashed middle line (repeats every 12 m). */
function roadTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 256;
  const g = c.getContext('2d')!;
  g.fillStyle = '#3a3d42'; g.fillRect(0, 0, 128, 256);
  for (let i = 0; i < 1400; i++) { const v = 50 + Math.random() * 25; g.fillStyle = `rgb(${v},${v + 2},${v + 5})`; g.fillRect(Math.random() * 128, Math.random() * 256, 2, 2); }
  g.fillStyle = '#ebebeb';
  g.fillRect(6, 0, 4, 256); g.fillRect(118, 0, 4, 256);
  g.fillRect(62, 0, 4, 128);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.ClampToEdgeWrapping; t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/**
 * Highway surface across its 18 m: hard shoulder with a solid line, two lanes with a dashed line between
 * them (3 m dash, 9 m gap), a solid line along the median and the median strip itself; same on the other side.
 */
function highwayTexture(): THREE.Texture {
  const W = 288, c = document.createElement('canvas');
  c.width = W; c.height = 192;
  const g = c.getContext('2d')!, px = (m: number) => ((m + HW_HALF) / (HW_HALF * 2)) * W;
  g.fillStyle = '#34373c'; g.fillRect(0, 0, W, 192);
  for (let i = 0; i < 2200; i++) { const v = 46 + Math.random() * 25; g.fillStyle = `rgb(${v},${v + 2},${v + 5})`; g.fillRect(Math.random() * W, Math.random() * 192, 2, 2); }
  g.fillStyle = '#56595e'; g.fillRect(px(-1), 0, px(1) - px(-1), 192); // median
  g.fillStyle = '#ebebeb';
  for (const side of [-1, 1]) {
    const line = (m: number, w = 0.18) => g.fillRect(px(side * m) - (w / (HW_HALF * 2)) * W / 2, 0, (w / (HW_HALF * 2)) * W, 192);
    line(1.1); line(8.1, 0.22); // solid lines along the median and the hard shoulder
    const x = px(side * 4.5) - 2;
    g.fillRect(x, 0, 4, 48); // dashed lane line (3 m of every 12 m)
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.ClampToEdgeWrapping; t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/**
 * One highway piece as a strip, lengthened at the ends where it meets another piece at an angle, so the
 * corner has no gap (the outer corner of the bend gets filled).
 */
function highwayPiece(r: (typeof HIGHWAYS)[number]) {
  const len = Math.hypot(r.bx - r.ax, r.bz - r.az), dx = (r.bx - r.ax) / len, dz = (r.bz - r.az) / len;
  const extra = (x: number, z: number) => {
    const o = HIGHWAYS.find((q) => q !== r && ((Math.hypot(q.ax - x, q.az - z) < 1) || (Math.hypot(q.bx - x, q.bz - z) < 1)));
    if (!o) return 0;
    const ol = Math.hypot(o.bx - o.ax, o.bz - o.az), cos = Math.abs((dx * (o.bx - o.ax) + dz * (o.bz - o.az)) / ol);
    const half = Math.acos(Math.min(1, cos)) / 2;
    return Math.min(HW_HALF, HW_HALF * Math.tan(half));
  };
  const ea = extra(r.ax, r.az), eb = extra(r.bx, r.bz);
  return roadStrip(r.ax - dx * ea, r.az - dz * ea, r.bx + dx * eb, r.bz + dz * eb, outskirtsHeight, HW_HALF, 0.04);
}

/** A straight road strip from a to b (meters), following `height` along its length. */
function roadStrip(ax: number, az: number, bx: number, bz: number, height: (x: number, z: number) => number, half = OUT_ROAD_HALF, lift = 0.025): THREE.BufferGeometry {
  const len = Math.hypot(bx - ax, bz - az), dx = (bx - ax) / len, dz = (bz - az) / len;
  const nx = -dz * half, nz = dx * half;
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  const steps = Math.ceil(len / 4);
  for (let i = 0; i <= steps; i++) {
    const s = (len * i) / steps, x = ax + dx * s, z = az + dz * s, y = height(x, z) + lift;
    pos.push(x + nx, y, z + nz, x - nx, y, z - nz);
    uv.push(0, s / 12, 1, s / 12);
    if (i) { const k = i * 2; idx.push(k - 2, k - 1, k, k - 1, k + 1, k); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  // Make sure the road faces up.
  const n = g.getAttribute('normal');
  if (n.getY(0) < 0) { idx.reverse(); g.setIndex(idx); g.computeVertexNormals(); }
  return g;
}

/**
 * Builds everything outside the city: the ground (grass, desert sand with dunes), the roads out,
 * the lake with its beach, the stream, the car bridge, the footbridge with its path, and the
 * desert's cacti and rocks. A handful of meshes in total (ground, roads, structures, water, cacti, rocks).
 */
export function buildOutskirts(layout: CityLayout, terrainMat: THREE.Material, waterMat: THREE.Material, track: <T extends { dispose(): void }>(x: T) => T): THREE.Group {
  const group = new THREE.Group();
  const col = new THREE.Color();

  // ---------- ground: coarse grass grid, fine desert grid with dunes ----------
  const ground = new Tris();
  const C = 80, E = 3440; // big cells: the ground is flat (the desert has its own fine grid)
  const inDesertRect = (x: number, z: number) => x >= DESERT.x0 && x <= DESERT.x1 && z >= DESERT.z0 && z <= DESERT.z1;
  for (let x = -E; x < E; x += C) {
    for (let z = -E; z < E; z += C) {
      if (inDesertRect(x + C / 2, z + C / 2)) continue; // the desert grid covers this cell
      ground.quad([x, -0.05, z], [x, -0.05, z + C], [x + C, -0.05, z + C], [x + C, -0.05, z], GRASS);
    }
  }
  const D = 10;
  const dv = (x: number, z: number) => {
    const h = duneHeight(x, z);
    // Dune crests a bit lighter, the hollows a bit darker and warmer.
    col.copy(SAND).multiplyScalar(0.88 + Math.min(1, h / 3.8) * 0.2);
    col.lerp(GRASS, 1 - desertAmount(x, z));
    return { p: [x, h - 0.05, z], c: col.clone() };
  };
  for (let x = DESERT.x0; x < DESERT.x1; x += D) {
    for (let z = DESERT.z0; z < DESERT.z1; z += D) {
      const a = dv(x, z), b = dv(x, z + D), c = dv(x + D, z + D), d = dv(x + D, z);
      ground.tri(a.p, b.p, c.p, [a.c, b.c, c.c]);
      ground.tri(a.p, c.p, d.p, [a.c, c.c, d.c]);
    }
  }
  // Beach around the lake: sand fading into grass.
  const ring = 96;
  for (let i = 0; i < ring; i++) {
    const a0 = (i / ring) * Math.PI * 2, a1 = ((i + 1) / ring) * Math.PI * 2;
    const p = (a: number, grow: number) => [LAKE.x + Math.cos(a) * (LAKE.rx + grow), -0.035, LAKE.z + Math.sin(a) * (LAKE.rz + grow)];
    ground.tri(p(a0, -2), p(a1, 16), p(a1, -2), [BEACH, GRASS, BEACH]);
    ground.tri(p(a0, -2), p(a0, 16), p(a1, 16), [BEACH, GRASS, GRASS]);
  }
  // Stream banks and the gravel path to the footbridge.
  ground.quad([STREAM.x0 - 2, -0.035, STREAM.z0 - 2], [STREAM.x0 - 2, -0.035, STREAM.z1], [STREAM.x1 + 2, -0.035, STREAM.z1], [STREAM.x1 + 2, -0.035, STREAM.z0 - 2], '#a89a7c');
  for (const [x0, x1] of [[PATH.x0, STREAM.x0 - 2], [STREAM.x1 + 2, PATH.x1]]) {
    ground.quad([x0, -0.03, PATH.z - PATH.half], [x0, -0.03, PATH.z + PATH.half], [x1, -0.03, PATH.z + PATH.half], [x1, -0.03, PATH.z - PATH.half], '#d8c9a5');
  }
  const groundMesh = new THREE.Mesh(track(ground.build()), terrainMat);
  groundMesh.receiveShadow = true;

  // ---------- roads out of the city ----------
  const roadMat = track(new THREE.MeshStandardMaterial({ map: track(roadTexture()), roughness: 0.92, metalness: 0, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 }));
  const roadGeo = mergeGeometries([
    ...OUT_ROADS.map((r) => roadStrip(r.ax, r.az, r.bx, r.bz, outskirtsHeight)),
    ringStrip(LAKE_TOWN.x, LAKE_TOWN.z, LAKE_TOWN.ring),
  ])!;
  const roads = new THREE.Mesh(track(roadGeo), roadMat);
  roads.receiveShadow = true;
  roads.renderOrder = 1;
  // Highways: wider strips on top of the roads they replace (one mesh, one highway texture).
  const hwMat = track(new THREE.MeshStandardMaterial({ map: track(highwayTexture()), roughness: 0.9, metalness: 0, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -6 }));
  const highways = new THREE.Mesh(track(mergeGeometries(HIGHWAYS.map((r) => highwayPiece(r)))!), hwMat);
  highways.receiveShadow = true;
  highways.renderOrder = 2;

  // ---------- structures: car bridge, footbridge, road-end barriers ----------
  const st = new Tris();
  const concrete = '#b9b6ae', rail = '#f2f2f2', wood = '#9a6a3c', woodDark = '#7a5230';
  // Car bridge: slab edges under the road, railings, pillars in the water.
  for (let z = BRIDGE.z0; z < BRIDGE.z1; z += 4) {
    const z1 = Math.min(BRIDGE.z1, z + 4), h0 = bridgeHeight(z), h1 = bridgeHeight(z1);
    for (const side of [-1, 1]) {
      const x = BRIDGE.x + side * BRIDGE.half;
      // Outer face of the slab (0.9 m thick) and the curb on top.
      const a = [x, h0 + 0.02, z], b = [x, h1 + 0.02, z1], c = [x, h1 - 0.9, z1], d = [x, h0 - 0.9, z];
      if (side > 0) st.quad(d, c, b, a, concrete); else st.quad(a, b, c, d, concrete);
      if (h0 > 0.3 || h1 > 0.3) st.quad([BRIDGE.x - BRIDGE.half, h0 - 0.9, z], [BRIDGE.x + BRIDGE.half, h0 - 0.9, z], [BRIDGE.x + BRIDGE.half, h1 - 0.9, z1], [BRIDGE.x - BRIDGE.half, h1 - 0.9, z1], concrete);
    }
  }
  for (let z = BRIDGE.z0 + 12; z <= BRIDGE.z1 - 12; z += 3) {
    const h = bridgeHeight(z);
    for (const side of [-1, 1]) st.box(BRIDGE.x + side * (BRIDGE.half + 0.15), h + 0.55, z, 0.14, 1.1, 0.14, rail);
  }
  for (let z = BRIDGE.z0 + 12; z < BRIDGE.z1 - 12; z += 3) {
    const h = (bridgeHeight(z) + bridgeHeight(z + 3)) / 2;
    for (const side of [-1, 1]) {
      st.box(BRIDGE.x + side * (BRIDGE.half + 0.15), h + 1.1, z + 1.5, 0.12, 0.12, 3.05, '#d8343c');
      st.box(BRIDGE.x + side * (BRIDGE.half + 0.15), h + 0.6, z + 1.5, 0.08, 0.08, 3.05, rail);
    }
  }
  for (let z = LAKE.z - LAKE.rz + 10; z < LAKE.z + LAKE.rz; z += 36) {
    const h = bridgeHeight(z);
    st.box(BRIDGE.x, (h - 0.9 - 3) / 2, z, BRIDGE.half * 1.5, h - 0.9 + 3, 1.6, concrete);
  }
  // Highway median: a steel guardrail on posts (stops 14 m before the ends, where cars turn on and off).
  for (const r of HIGHWAYS) {
    const len = Math.hypot(r.bx - r.ax, r.bz - r.az), dx = (r.bx - r.ax) / len, dz = (r.bz - r.az) / len;
    for (let s = 14; s < len - 14; s += 4) {
      const x = r.ax + dx * s, z = r.az + dz * s, y = outskirtsHeight(x, z);
      st.box(x, y + 0.35, z, 0.12, 0.7, 0.12, '#9aa0a8');
      // 4 m of rail along the road (works for diagonal roads too): two sides and a top.
      const e = Math.min(4, len - 14 - s), x1 = x + dx * e, z1 = z + dz * e, y1 = outskirtsHeight(x1, z1);
      const nx = -dz * 0.07, nz = dx * 0.07, lo = 0.48, hi = 0.76;
      for (const k of [-1, 1]) {
        const A = [x + nx * k, y + lo, z + nz * k], B = [x1 + nx * k, y1 + lo, z1 + nz * k], C = [x1 + nx * k, y1 + hi, z1 + nz * k], D = [x + nx * k, y + hi, z + nz * k];
        st.quad(A, B, C, D, '#c4c9cf'); st.quad(A, D, C, B, '#c4c9cf'); // both sides face out
      }
      const T = [[x - nx, y + hi, z - nz], [x + nx, y + hi, z + nz], [x1 + nx, y1 + hi, z1 + nz], [x1 - nx, y1 + hi, z1 - nz]];
      st.quad(T[0], T[1], T[2], T[3], '#d6dade'); st.quad(T[0], T[3], T[2], T[1], '#d6dade');
    }
  }
  // Footbridge: an arched wooden deck with railings.
  const fb = FOOTBRIDGE;
  for (let x = fb.x0; x < fb.x1; x += 1) {
    const h0 = footbridgeHeight(x) + 0.06, h1 = footbridgeHeight(x + 1) + 0.06;
    st.quad([x, h0, fb.z - fb.half], [x, h0, fb.z + fb.half], [x + 1, h1, fb.z + fb.half], [x + 1, h1, fb.z - fb.half], (Math.round(x) % 2 ? wood : woodDark));
    for (const side of [-1, 1]) {
      const z = fb.z + side * fb.half;
      st.quad([x, h0 - 0.18, z], [x + 1, h1 - 0.18, z], [x + 1, h1, z], [x, h0, z], woodDark);
    }
  }
  for (let x = fb.x0 + 1; x <= fb.x1 - 1; x += 2.5) {
    const h = footbridgeHeight(x);
    for (const side of [-1, 1]) st.box(x, h + 0.55, fb.z + side * (fb.half - 0.05), 0.12, 1, 0.12, woodDark);
  }
  for (let x = fb.x0 + 1; x < fb.x1 - 1; x += 1) {
    const h = (footbridgeHeight(x) + footbridgeHeight(x + 1)) / 2;
    for (const side of [-1, 1]) st.box(x + 0.5, h + 1.02, fb.z + side * (fb.half - 0.05), 1.02, 0.08, 0.1, wood);
  }
  // Striped barriers where the roads end.
  for (const [x, z, alongX] of [[DESERT_TOWN.x1 + 3, DESERT_TOWN.z, false]] as const) {
    for (let k = -2; k <= 2; k++) {
      const ox = alongX ? k * 2 : 0, oz = alongX ? 0 : k * 2;
      st.box(x + ox, 0.55, z + oz, alongX ? 2 : 0.25, 0.35, alongX ? 0.25 : 2, k % 2 ? '#ffffff' : '#e5484d');
      st.box(x + ox, 0.25, z + oz, 0.12, 0.5, 0.12, '#cccccc');
    }
  }
  // Towns and farms: every building, palm, well, water tower, windmill tower and hay bale.
  const T = layout.towns;
  for (const b of T.buildings) addBuilding(st, b);
  for (const p of T.palms) addPalm(st, p.x, p.z, p.s);
  const well = T.plaza.well;
  st.cyl(well.x, well.z, 1.3, 1.3, 0, 0.9, '#b8a07c', 14);
  st.cyl(well.x, well.z, 1.0, 1.0, 0.88, 0.9, '#3d7fb8', 14);
  for (const [dx, dz] of [[-1.1, 0], [1.1, 0]]) st.box(well.x + dx, 1.6, well.z + dz, 0.15, 1.4, 0.15, woodDark);
  st.cyl(well.x, well.z, 1.6, 0, 2.3, 3.1, '#b2502f', 4);
  for (const w of T.windmills) {
    st.cyl(w.x, w.z, 2.6, 1.6, 0, 11, '#7a5a40', 8);
    st.cyl(w.x, w.z, 1.8, 0, 11, 13, '#3d3d40', 8);
    st.box(w.x, 1.6, w.z, 5.4, 0.25, 5.4, woodDark); // little balcony
  }
  for (const b of T.bales) st.cyl(b.x, b.z, 0.7, 0.7, 0, 1.2, '#e2c46a', 10);
  // Double-sided: palm leaves and the sails are seen from both sides.
  const structMat = track(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0, side: THREE.DoubleSide }));
  const structures = new THREE.Mesh(track(st.build()), structMat);
  structures.castShadow = true;
  structures.receiveShadow = true;

  // ---------- water: the lake and the stream ----------
  const lakeGeo = new THREE.CircleGeometry(1, 96).rotateX(-Math.PI / 2).scale(LAKE.rx, 1, LAKE.rz).translate(LAKE.x, -0.01, LAKE.z);
  const streamGeo = new THREE.PlaneGeometry(STREAM.x1 - STREAM.x0, STREAM.z1 - STREAM.z0 + 12).rotateX(-Math.PI / 2)
    .translate((STREAM.x0 + STREAM.x1) / 2, -0.012, (STREAM.z0 + STREAM.z1) / 2 + 6);
  for (const g of [lakeGeo, streamGeo]) g.deleteAttribute('uv');
  const water = new THREE.Mesh(track(mergeGeometries([lakeGeo, streamGeo])!), waterMat);
  water.receiveShadow = true;

  // ---------- desert: cacti and rocks (two merged meshes) ----------
  const cactusParts: THREE.BufferGeometry[] = [];
  const cactusColor = new THREE.Color('#4f8a3c');
  const paint = (g: THREE.BufferGeometry, c: THREE.Color) => {
    const n = g.getAttribute('position').count, a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) a.set([c.r, c.g, c.b], i * 3);
    g.setAttribute('color', new THREE.BufferAttribute(a, 3));
    g.deleteAttribute('uv');
    return g;
  };
  for (const c of layout.desert.cacti) {
    const s = c.s, y = duneHeight(c.x, c.z) - 0.1, m = new THREE.Matrix4().makeRotationY(c.rot).setPosition(c.x, y, c.z);
    const parts: THREE.BufferGeometry[] = [new THREE.CylinderGeometry(0.28, 0.32, 2.8, 8).translate(0, 1.4, 0)];
    parts.push(new THREE.SphereGeometry(0.28, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, 2.8, 0));
    // Arms: out sideways, then up.
    for (const side of c.rot > 3 ? [1] : [1, -1]) {
      const ay = 1.1 + (side > 0 ? 0.3 : 0);
      parts.push(new THREE.CylinderGeometry(0.17, 0.17, 0.6, 6).rotateZ(Math.PI / 2).translate(side * 0.55, ay, 0));
      parts.push(new THREE.CylinderGeometry(0.17, 0.17, 0.9, 6).translate(side * 0.82, ay + 0.4, 0));
      parts.push(new THREE.SphereGeometry(0.17, 6, 3, 0, Math.PI * 2, 0, Math.PI / 2).translate(side * 0.82, ay + 0.85, 0));
    }
    for (const p of parts) cactusParts.push(paint(p.toNonIndexed().scale(s, s, s).applyMatrix4(m), cactusColor));
  }
  const rockParts: THREE.BufferGeometry[] = [];
  let seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (const r of layout.desert.rocks) {
    const g = new THREE.IcosahedronGeometry(1, 0).toNonIndexed();
    const p = g.getAttribute('position');
    for (let i = 0; i < p.count; i++) p.setXYZ(i, p.getX(i) * (0.8 + rnd() * 0.4), p.getY(i) * (0.8 + rnd() * 0.4), p.getZ(i) * (0.8 + rnd() * 0.4));
    g.computeVertexNormals();
    g.scale(r.s * 1.2, r.s * 0.7, r.s).rotateY(r.rot).translate(r.x, duneHeight(r.x, r.z) + r.s * 0.2, r.z);
    rockParts.push(paint(g, new THREE.Color().setHSL(0.08, 0.35, 0.45 + rnd() * 0.12)));
  }
  const natMat = track(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0, flatShading: true }));
  const extras: THREE.Mesh[] = [];
  if (cactusParts.length) extras.push(new THREE.Mesh(track(mergeGeometries(cactusParts)!), natMat));
  if (rockParts.length) extras.push(new THREE.Mesh(track(mergeGeometries(rockParts)!), natMat));
  for (const m of extras) { m.castShadow = true; m.receiveShadow = true; }

  // Flat things on the ground (fields, the plaza, the square, boardwalks): own material that is
  // drawn slightly in front of the ground, so they never flicker.
  const ov = new Tris();
  for (const f of T.fields) addField(ov, f);
  const pl = T.plaza;
  ov.quad([pl.x0, 0.03, pl.z0], [pl.x0, 0.03, pl.z1], [pl.x1, 0.03, pl.z1], [pl.x1, 0.03, pl.z0], '#d8c3a0');
  for (const side of [-1, 1]) {
    const z0 = DESERT_TOWN.z + side * (OUT_ROAD_HALF + 0.2), z1 = DESERT_TOWN.z + side * (OUT_ROAD_HALF + 3.2);
    for (const [x0, x1] of [[DESERT_TOWN.x0, DESERT_TOWN.x - 8], [DESERT_TOWN.x + 8, DESERT_TOWN.x1]]) {
      const a = [x0, 0.05, Math.min(z0, z1)], b2 = [x0, 0.05, Math.max(z0, z1)], c = [x1, 0.05, Math.max(z0, z1)], d = [x1, 0.05, Math.min(z0, z1)];
      ov.quad(a, b2, c, d, '#a07a52');
    }
  }
  for (let i = 0; i < 48; i++) {
    const a0 = (i / 48) * Math.PI * 2, a1 = ((i + 1) / 48) * Math.PI * 2, r = LAKE_TOWN.square;
    ov.tri([LAKE_TOWN.x, 0.03, LAKE_TOWN.z], [LAKE_TOWN.x + Math.cos(a1) * r, 0.03, LAKE_TOWN.z + Math.sin(a1) * r], [LAKE_TOWN.x + Math.cos(a0) * r, 0.03, LAKE_TOWN.z + Math.sin(a0) * r], i % 2 ? '#cfc6b8' : '#c4baa9');
  }
  const ovMat = track(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 }));
  const overlay = new THREE.Mesh(track(ov.build()), ovMat);
  overlay.receiveShadow = true;

  // Windmill sails: one instanced mesh, turning slowly.
  const sailParts = new Tris();
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2, c = Math.cos(a), sn = Math.sin(a);
    const P = (x: number, y: number) => [x * c - y * sn, x * sn + y * c, 0];
    // A lattice blade: a long spar and a white sail cloth next to it.
    sailParts.quad(P(-0.15, 0.6), P(0.15, 0.6), P(0.15, 9), P(-0.15, 9), '#4a3a2a');
    sailParts.quad(P(0.15, 2), P(1.6, 2), P(1.6, 9), P(0.15, 9), '#f2efe6');
  }
  const sailMat = track(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, metalness: 0, side: THREE.DoubleSide }));
  const sails = new THREE.InstancedMesh(track(sailParts.build()), sailMat, Math.max(1, T.windmills.length));
  sails.count = T.windmills.length;
  sails.castShadow = true;
  sails.frustumCulled = false;
  const sm = new THREE.Matrix4(), sq = new THREE.Quaternion(), se = new THREE.Euler(), sp = new THREE.Vector3(), ss = new THREE.Vector3(1, 1, 1);
  let spin = 0;
  const placeSails = () => {
    T.windmills.forEach((w, i) => {
      // The hub sits at the front of the cap, facing (sin rot, cos rot).
      sp.set(w.x + Math.sin(w.rot) * 2.2, 12, w.z + Math.cos(w.rot) * 2.2);
      se.set(0, w.rot, spin + i, 'YXZ');
      sails.setMatrixAt(i, sm.compose(sp, sq.setFromEuler(se), ss));
    });
    sails.instanceMatrix.needsUpdate = true;
  };
  placeSails();
  group.userData.update = (dt: number) => { spin -= dt * 0.6; placeSails(); };

  group.add(groundMesh, roads, highways, structures, water, overlay, sails, ...extras);
  return group;
}

/** The lake town's ring road: a circular strip with the road texture. */
function ringStrip(cx: number, cz: number, r: number): THREE.BufferGeometry {
  const seg = 160, pos: number[] = [], uv: number[] = [], idx: number[] = [];
  for (let i = 0; i <= seg; i++) {
    const a = (i / seg) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a), along = a * r;
    pos.push(cx + c * (r - OUT_ROAD_HALF), 0.025, cz + s * (r - OUT_ROAD_HALF), cx + c * (r + OUT_ROAD_HALF), 0.025, cz + s * (r + OUT_ROAD_HALF));
    uv.push(0, along / 12, 1, along / 12);
    if (i) { const k = i * 2; idx.push(k - 2, k, k - 1, k - 1, k, k + 1); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  if (g.getAttribute('normal').getY(0) < 0) { idx.reverse(); g.setIndex(idx); g.computeVertexNormals(); }
  return g;
}

/** Maps building-local points (front = +Z) to world points. */
function placer(b: { x: number; z: number; rot: number }) {
  const c = Math.cos(b.rot), s = Math.sin(b.rot);
  return (x: number, y: number, z: number) => [b.x + x * c + z * s, y, b.z - x * s + z * c];
}

/** A box in building-local space. */
function lbox(t: Tris, P: ReturnType<typeof placer>, cx: number, cy: number, cz: number, sx: number, sy: number, sz: number, color: string) {
  const x0 = cx - sx / 2, x1 = cx + sx / 2, y0 = cy - sy / 2, y1 = cy + sy / 2, z0 = cz - sz / 2, z1 = cz + sz / 2;
  t.quad(P(x0, y1, z0), P(x0, y1, z1), P(x1, y1, z1), P(x1, y1, z0), color);
  t.quad(P(x0, y0, z1), P(x1, y0, z1), P(x1, y1, z1), P(x0, y1, z1), color);
  t.quad(P(x1, y0, z0), P(x0, y0, z0), P(x0, y1, z0), P(x1, y1, z0), color);
  t.quad(P(x1, y0, z1), P(x1, y0, z0), P(x1, y1, z0), P(x1, y1, z1), color);
  t.quad(P(x0, y0, z0), P(x0, y0, z1), P(x0, y1, z1), P(x0, y1, z0), color);
}

/** A flat rectangle on the front wall (z = zf), e.g. a window or a door. */
function frontQuad(t: Tris, P: ReturnType<typeof placer>, x0: number, y0: number, x1: number, y1: number, zf: number, color: string) {
  t.quad(P(x0, y0, zf), P(x1, y0, zf), P(x1, y1, zf), P(x0, y1, zf), color);
}

/** A gabled house body + roof (the gable faces the front). Returns the roof height. */
function gableHouse(t: Tris, P: ReturnType<typeof placer>, w: number, d: number, h: number, wall: string, roof: string) {
  lbox(t, P, 0, h / 2, 0, w, h, d, wall);
  const rh = w * 0.55, o = 0.25, hw = w / 2 + o, hd = d / 2 + o;
  t.tri(P(-w / 2, h, d / 2), P(w / 2, h, d / 2), P(0, h + rh, d / 2), wall); // front gable
  t.tri(P(w / 2, h, -d / 2), P(-w / 2, h, -d / 2), P(0, h + rh, -d / 2), wall); // back gable
  t.quad(P(-hw, h - 0.15, -hd), P(-hw, h - 0.15, hd), P(0, h + rh + 0.1, hd), P(0, h + rh + 0.1, -hd), roof);
  t.quad(P(hw, h - 0.15, hd), P(hw, h - 0.15, -hd), P(0, h + rh + 0.1, -hd), P(0, h + rh + 0.1, hd), roof);
  return rh;
}

function addBuilding(t: Tris, b: TownBuilding) {
  const P = placer(b), zf = b.d / 2 + 0.03;
  const glass = '#2b3542', frame = '#f4f1ea';
  switch (b.style) {
    case 'gable':
    case 'farmhouse': {
      const rh = gableHouse(t, P, b.w, b.d, b.h, b.color, b.roof);
      const floors = Math.max(1, Math.floor(b.h / 3)), cols = b.w > 8.5 ? 3 : 2;
      for (let f = 0; f < floors; f++) {
        for (let c = 0; c < cols; c++) {
          const x = -b.w / 2 + (b.w / cols) * (c + 0.5), y = 1 + f * 3 + (f === 0 ? 0.4 : 0);
          if (f === 0 && c === (cols === 3 ? 1 : 0)) { frontQuad(t, P, x - 0.6, 0, x + 0.6, 2.3, zf, '#5a3a26'); continue; } // door
          frontQuad(t, P, x - 0.65, y - 0.1, x + 0.65, y + 1.6, zf, frame);
          frontQuad(t, P, x - 0.5, y, x + 0.5, y + 1.5, zf + 0.01, glass);
        }
      }
      frontQuad(t, P, -0.5, b.h + rh * 0.25, 0.5, b.h + rh * 0.25 + 1, zf, glass); // attic window
      break;
    }
    case 'adobe': {
      lbox(t, P, 0, b.h / 2, 0, b.w, b.h, b.d, b.color);
      // Parapet around the flat roof.
      for (const [x, z, sx, sz] of [[0, b.d / 2 - 0.15, b.w, 0.3], [0, -b.d / 2 + 0.15, b.w, 0.3], [b.w / 2 - 0.15, 0, 0.3, b.d], [-b.w / 2 + 0.15, 0, 0.3, b.d]]) lbox(t, P, x, b.h + 0.25, z, sx, 0.5, sz, b.color);
      frontQuad(t, P, -0.7, 0, 0.7, 2.3, zf, '#6b4426');
      const floors = b.h > 6.5 ? 2 : 1;
      for (let f = 0; f < floors; f++) for (const x of [-b.w / 3, b.w / 3]) frontQuad(t, P, x - 0.6, 1.1 + f * 3, x + 0.6, 2.2 + f * 3, zf, glass);
      // Wooden beam ends under the roof.
      for (let k = 0; k < 6; k++) lbox(t, P, -b.w / 2 + 1 + k * ((b.w - 2) / 5), b.h - 0.5, b.d / 2 + 0.3, 0.22, 0.22, 0.6, '#6b4a2e');
      if (b.porch) {
        lbox(t, P, 0, 2.9, b.d / 2 + 1.4, b.w * 0.8, 0.15, 2.8, '#8a6440');
        for (const x of [-b.w * 0.38, 0, b.w * 0.38]) lbox(t, P, x, 1.45, b.d / 2 + 2.6, 0.18, 2.9, 0.18, '#6b4a2e');
      }
      break;
    }
    case 'church': {
      gableHouse(t, P, b.w, b.d, b.h, b.color, b.roof);
      // Tower at the front with a spire and a clock.
      const tz = b.d / 2 + 3;
      lbox(t, P, 0, 11, tz, 6, 22, 6, b.color);
      const top = 22;
      t.tri(P(-3.2, top, tz + 3.2), P(3.2, top, tz + 3.2), P(0, top + 11, tz), b.roof);
      t.tri(P(3.2, top, tz + 3.2), P(3.2, top, tz - 3.2), P(0, top + 11, tz), b.roof);
      t.tri(P(3.2, top, tz - 3.2), P(-3.2, top, tz - 3.2), P(0, top + 11, tz), b.roof);
      t.tri(P(-3.2, top, tz - 3.2), P(-3.2, top, tz + 3.2), P(0, top + 11, tz), b.roof);
      frontQuad(t, P, -1.3, 17, 1.3, 19.6, tz + 3.03, '#ffffff');
      frontQuad(t, P, -0.1, 17.6, 0.1, 19.1, tz + 3.05, '#222222');
      frontQuad(t, P, -1.1, 0, 1.1, 3.2, tz + 3.03, '#5a3a26');
      for (const z of [-6, 0, 6]) for (const side of [-1, 1]) {
        const x = side * (b.w / 2 + 0.03);
        if (side < 0) t.quad(P(x, 3, z - 0.8), P(x, 3, z + 0.8), P(x, 7, z + 0.8), P(x, 7, z - 0.8), '#4a6fa5');
        else t.quad(P(x, 3, z + 0.8), P(x, 3, z - 0.8), P(x, 7, z - 0.8), P(x, 7, z + 0.8), '#4a6fa5');
      }
      break;
    }
    case 'barn': {
      gableHouse(t, P, b.w, b.d, b.h, b.color, b.roof);
      frontQuad(t, P, -3, 0, 3, 5, zf, '#8a2a20');
      for (const [x0, y0, x1, y1] of [[-3.2, 4.9, 3.2, 5.3], [-3.2, -0.1, -2.8, 5.3], [2.8, -0.1, 3.2, 5.3]]) frontQuad(t, P, x0, y0, x1, y1, zf + 0.01, '#ffffff');
      break;
    }
    case 'silo':
      t.cyl(b.x, b.z, b.w / 2, b.w / 2, 0, b.h, b.color, 16);
      t.cyl(b.x, b.z, b.w / 2, 0.01, b.h, b.h + b.w * 0.45, b.roof, 16);
      break;
    case 'watertower':
      for (const [dx, dz] of [[-2, -2], [2, -2], [-2, 2], [2, 2]]) t.box(b.x + dx, 4.5, b.z + dz, 0.3, 9, 0.3, '#6b4a2e');
      t.cyl(b.x, b.z, 3, 3, 9, 13, b.color, 14);
      t.cyl(b.x, b.z, 3.3, 0.01, 13, 14.6, b.roof, 14);
      break;
  }
}

/** A palm tree: a tall trunk and drooping leaves. */
function addPalm(t: Tris, x: number, z: number, s: number) {
  const h = 7 * s;
  t.cyl(x, z, 0.28 * s, 0.18 * s, 0, h, '#8b6b4a', 7);
  for (let k = 0; k < 7; k++) {
    const a = (k / 7) * Math.PI * 2, c = Math.cos(a), sn = Math.sin(a), L = 3.4 * s, wd = 0.6 * s;
    const tip = [x + c * L, h - 1.4 * s, z + sn * L], mid = [x + c * L * 0.5, h + 0.3 * s, z + sn * L * 0.5];
    const l = [-sn * wd, 0, c * wd];
    t.tri([x, h, z], [mid[0] + l[0], mid[1], mid[2] + l[2]], mid, '#4f9a3c');
    t.tri([x, h, z], mid, [mid[0] - l[0], mid[1], mid[2] - l[2]], '#468a35');
    t.tri([mid[0] + l[0], mid[1], mid[2] + l[2]], tip, mid, '#4f9a3c');
    t.tri(mid, tip, [mid[0] - l[0], mid[1], mid[2] - l[2]], '#468a35');
  }
}

const CROPS: Record<string, string[]> = {
  wheat: ['#e3c766', '#d4b552'],
  green: ['#6ea34a', '#5d9240'],
  plowed: ['#8b6a4a', '#7a5b3e'],
  tulips: ['#e5484d', '#4f8a3c', '#ffd23f', '#4f8a3c', '#ff7eb6', '#4f8a3c', '#9b5de5', '#4f8a3c'],
};

/** A field: stripes of the crop (rows) along X or Z. */
function addField(t: Tris, f: Field) {
  const cols = CROPS[f.crop], w = f.crop === 'tulips' ? 2 : 3;
  const len = f.alongX ? f.z1 - f.z0 : f.x1 - f.x0;
  for (let i = 0, k = 0; i < len; i += w, k++) {
    const a = i, b = Math.min(len, i + w), c = cols[k % cols.length];
    if (f.alongX) t.quad([f.x0, 0.02, f.z0 + a], [f.x0, 0.02, f.z0 + b], [f.x1, 0.02, f.z0 + b], [f.x1, 0.02, f.z0 + a], c);
    else t.quad([f.x0 + a, 0.02, f.z0], [f.x0 + a, 0.02, f.z1], [f.x0 + b, 0.02, f.z1], [f.x0 + b, 0.02, f.z0], c);
  }
}
