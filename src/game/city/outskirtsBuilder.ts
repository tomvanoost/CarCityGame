import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { CityLayout } from './layout';
import {
  BRIDGE, DESERT, EAST_ROAD, FOOTBRIDGE, LAKE, OUT_ROAD_HALF, PATH, SOUTH_ROAD, STREAM,
  bridgeHeight, desertAmount, duneHeight, footbridgeHeight,
} from './outskirts';

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

/** A straight road strip from a to b (meters), following `height` along its length. */
function roadStrip(ax: number, az: number, bx: number, bz: number, height: (x: number, z: number) => number): THREE.BufferGeometry {
  const len = Math.hypot(bx - ax, bz - az), dx = (bx - ax) / len, dz = (bz - az) / len;
  const nx = -dz * OUT_ROAD_HALF, nz = dx * OUT_ROAD_HALF;
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  const steps = Math.ceil(len / 4);
  for (let i = 0; i <= steps; i++) {
    const s = (len * i) / steps, x = ax + dx * s, z = az + dz * s, y = height(x, z) + 0.025;
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
  const C = 40, E = 2600;
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
    roadStrip(EAST_ROAD.x0, EAST_ROAD.z, EAST_ROAD.x1, EAST_ROAD.z, duneHeight),
    roadStrip(SOUTH_ROAD.x, SOUTH_ROAD.z0, SOUTH_ROAD.x, SOUTH_ROAD.z1, (_x, z) => bridgeHeight(z)),
  ])!;
  const roads = new THREE.Mesh(track(roadGeo), roadMat);
  roads.receiveShadow = true;
  roads.renderOrder = 1;

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
  for (const [x, z, alongX] of [[EAST_ROAD.x1 + 3, EAST_ROAD.z, false], [SOUTH_ROAD.x, SOUTH_ROAD.z1 + 3, true]] as const) {
    for (let k = -2; k <= 2; k++) {
      const ox = alongX ? k * 2 : 0, oz = alongX ? 0 : k * 2;
      st.box(x + ox, 0.55, z + oz, alongX ? 2 : 0.25, 0.35, alongX ? 0.25 : 2, k % 2 ? '#ffffff' : '#e5484d');
      st.box(x + ox, 0.25, z + oz, 0.12, 0.5, 0.12, '#cccccc');
    }
  }
  const structMat = track(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0 }));
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

  group.add(groundMesh, roads, structures, water, ...extras);
  return group;
}
