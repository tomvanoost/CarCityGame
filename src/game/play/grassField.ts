import * as THREE from 'three';
import { BLOCK_SPACING, HALF_CITY, ROAD_WIDTH, isOnRoad, type CityLayout, type District, type Rect } from '../city/layout';
import { groundHeight } from './collision';
import { isMeadow } from '../city/outskirts';

/** Lawns of these districts are grass (downtown and midrise lots are paved). */
const GREEN: Partial<Record<District, true>> = { shops: true, townhouses: true, apartments: true, residential: true, park: true, gas: true };

/** Grid spacing for flowers (m). */
const FLOWER_CELL = 0.6;

const inRect = (r: Rect, x: number, z: number, m = 0) => x > r.x0 + m && x < r.x1 - m && z > r.z0 + m && z < r.z1 - m;

/** Small seeded hash per grid cell (the same tuft always grows in the same spot). */
function hash(i: number, j: number, k: number) {
  let h = (i * 374761393 + j * 668265263 + k * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** One tuft: a handful of thin blade triangles fanning out a little. aH: 0 at the root, 1 at the tip. */
function tuftGeometry(): THREE.BufferGeometry {
  const pos: number[] = [], h: number[] = [];
  const BLADES = 9;
  for (let b = 0; b < BLADES; b++) {
    const a = (b / BLADES) * Math.PI * 2 + b * 0.7;
    const r = 0.02 + (b % 3) * 0.03, height = 0.13 + ((b * 37) % 10) / 10 * 0.12, w = 0.014;
    const cx = Math.cos(a) * r, cz = Math.sin(a) * r;
    const lean = 0.03 + ((b * 13) % 5) * 0.015; // blades lean outward
    const px = -Math.sin(a) * w, pz = Math.cos(a) * w; // blade width across
    pos.push(cx - px, 0, cz - pz, cx + px, 0, cz + pz, cx + Math.cos(a) * lean, height, cz + Math.sin(a) * lean);
    h.push(0, 0, 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aH', new THREE.Float32BufferAttribute(h, 1));
  // Normals straight up: blades are lit like the lawn they grow on (no dark backsides).
  g.setAttribute('normal', new THREE.Float32BufferAttribute(new Array(pos.length / 3).fill(0).flatMap(() => [0, 1, 0]), 3));
  return g;
}

/**
 * One little flower: a thin stem (aPart 0), five petals (aPart 1, colored per instance) and a yellow
 * heart (aPart 2) on top. aH: 0 at the root, 1 at the flower head (for the wind).
 */
function flowerGeometry(): THREE.BufferGeometry {
  const pos: number[] = [], h: number[] = [], part: number[] = [];
  const H = 0.32, w = 0.009;
  pos.push(-w, 0, 0, w, 0, 0, 0, H, 0); h.push(0, 0, 1); part.push(0, 0, 0);
  pos.push(0, 0, -w, 0, 0, w, 0, H, 0); h.push(0, 0, 1); part.push(0, 0, 0);
  const R = 0.075, P = 5;
  for (let i = 0; i < P; i++) {
    const a0 = (i / P) * Math.PI * 2, a1 = a0 + (Math.PI * 2) / P * 0.8, am = (a0 + a1) / 2;
    pos.push(0, H, 0, Math.cos(a0) * R * 0.55, H + 0.006, Math.sin(a0) * R * 0.55, Math.cos(am) * R, H + 0.012, Math.sin(am) * R);
    pos.push(0, H, 0, Math.cos(am) * R, H + 0.012, Math.sin(am) * R, Math.cos(a1) * R * 0.55, H + 0.006, Math.sin(a1) * R * 0.55);
    h.push(1, 1, 1, 1, 1, 1); part.push(1, 1, 1, 1, 1, 1);
  }
  const c = 0.022;
  pos.push(-c, H + 0.016, -c, c, H + 0.016, -c, 0, H + 0.016, c * 1.4); h.push(1, 1, 1); part.push(2, 2, 2);
  pos.push(-c, H + 0.016, c * 0.6, c, H + 0.016, c * 0.6, 0, H + 0.016, -c * 1.4); h.push(1, 1, 1); part.push(2, 2, 2);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aH', new THREE.Float32BufferAttribute(h, 1));
  g.setAttribute('aPart', new THREE.Float32BufferAttribute(part, 1));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(new Array(pos.length / 3).fill(0).flatMap(() => [0, 1, 0]), 3));
  return g;
}

/** Flower colors: mostly white daisies and yellow buttercups, now and then purple, pink or red. */
const FLOWERS = ['#f4f4ee', '#f4f4ee', '#f4f4ee', '#ffd83a', '#ffd83a', '#b58cff', '#ff9ccf', '#ff5a4a'].map((c) => new THREE.Color(c));

/**
 * Grass blades around the player: one InstancedMesh (one draw call) of small tufts on a fixed world
 * grid, only on lawns, park grass and the countryside (never on roads, sidewalks, paths or under
 * buildings). They sway in a gentle wind (vertex shader) and shrink away towards the edge, so you
 * never see where they stop. Rebuilt only when you've moved a few meters. Off on the "Snel" setting.
 */
export class GrassField {
  readonly mesh: THREE.InstancedMesh;
  readonly flowers: THREE.InstancedMesh;
  private time = { value: 0 };
  private center = { value: new THREE.Vector2() };
  private cx = 1e9;
  private cz = 1e9;
  private blocks = new Map<number, { lot: Rect; slab: Rect; green: boolean }>();
  private tmp = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private s = new THREE.Vector3();
  private p = new THREE.Vector3();
  private col = new THREE.Color();
  private up = new THREE.Vector3(0, 1, 0);

  /** radius: how far the grass reaches (m); cell: grid spacing (m). */
  constructor(private layout: CityLayout, private blocked: (x: number, z: number) => boolean, private radius = 26, private cell = 0.42) {
    // Grid cell -> block (park blocks cover 2 x 2 cells).
    const ci = (v: number) => Math.floor((v + HALF_CITY) / BLOCK_SPACING);
    for (const b of layout.blocks) {
      const e = { lot: b.lot, slab: b.slab, green: !!GREEN[b.district] };
      for (let i = ci(b.slab.x0); i <= ci(b.slab.x1); i++) for (let j = ci(b.slab.z0); j <= ci(b.slab.z1); j++) this.blocks.set(i * 1000 + j, e);
    }
    const max = Math.ceil(Math.PI * (radius / cell) ** 2 * 1.05);
    const mat = this.material('grassBlades', '', `
          // Darker near the ground, lighter towards the tip.
          diffuseColor.rgb *= mix(0.72, 1.12, vH);`);
    this.mesh = new THREE.InstancedMesh(tuftGeometry(), mat, max);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = true;
    // Instance colors need an initial buffer.
    this.mesh.setColorAt(0, this.col.set('#ffffff'));
    // Flowers: a second instanced mesh, sparser and a little less far.
    const fmax = Math.ceil(Math.PI * (radius * 0.85 / FLOWER_CELL) ** 2 * 1.05);
    const fmat = this.material('grassFlowers', 'attribute float aPart;\nvarying float vPart;', `
          // Stem green, petals in the flower's color (instance color), a yellow heart.
          if (vPart < 0.5) diffuseColor.rgb = vec3(0.16, 0.33, 0.08) * mix(0.75, 1.1, vH);
          else if (vPart > 1.5) diffuseColor.rgb = vec3(1.0, 0.72, 0.1);
          else diffuseColor.rgb *= 1.25; // petals catch the light`, 'vPart = aPart;');
    this.flowers = new THREE.InstancedMesh(flowerGeometry(), fmat, fmax);
    this.flowers.count = 0;
    this.flowers.frustumCulled = false;
    this.flowers.castShadow = false;
    this.flowers.receiveShadow = true;
    this.flowers.setColorAt(0, this.col.set('#ffffff'));
  }

  /** A wind-swaying, edge-fading material; frag runs after the color is set (vH = 0 root .. 1 tip). */
  private material(key: string, extraDecl: string, frag: string, extraVert = '') {
    const radius = this.radius;
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.9, metalness: 0, side: THREE.DoubleSide });
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = this.time;
      shader.uniforms.uCenter = this.center;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>
          attribute float aH;
          uniform float uTime;
          uniform vec2 uCenter;
          varying float vH;
          ${extraDecl}`)
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          vH = aH;
          ${extraVert}
          vec3 base = (instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
          // Shrink towards the edge of the patch.
          float edge = 1.0 - smoothstep(${(radius * 0.6).toFixed(1)}, ${(radius * 0.97).toFixed(1)}, distance(base.xz, uCenter));
          transformed *= edge;
          // Wind: slow waves rolling over the grass plus a little flutter; only the tips move.
          float wave = sin(uTime * 1.6 + base.x * 0.35 + base.z * 0.22) * 0.6 + sin(uTime * 3.7 + base.x * 1.3 - base.z * 0.9) * 0.25;
          transformed.x += wave * 0.05 * aH * aH;
          transformed.z += wave * 0.03 * aH * aH;`);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>\nvarying float vH;\n${extraDecl.replace(/attribute[^;]*;/g, '')}`)
        .replace('#include <color_fragment>', `#include <color_fragment>${frag}`);
    };
    mat.customProgramCacheKey = () => key;
    return mat;
  }

  /** Is there grass at (x, z)? */
  isGrass(x: number, z: number): boolean {
    const edge = HALF_CITY + ROAD_WIDTH / 2;
    if (Math.abs(x) > edge || Math.abs(z) > edge) return isMeadow(x, z) && !this.blocked(x, z); // countryside (not desert, water, roads)
    if (isOnRoad(x, z)) return false;
    const L = this.layout;
    const b = this.blocks.get(Math.floor((x + HALF_CITY) / BLOCK_SPACING) * 1000 + Math.floor((z + HALF_CITY) / BLOCK_SPACING));
    if (!b || !inRect(b.slab, x, z)) return false;
    if (!b.green || !inRect(b.lot, x, z, 0.25)) return false; // paved lot or sidewalk
    for (const p of L.paths) if (inRect(p, x, z, -0.3)) return false;
    if (inRect(L.gas.rect, x, z, -0.5)) return false;
    return !this.blocked(x, z);
  }

  /** Every frame: wind time; replant around the player when they've moved a few meters. */
  update(dt: number, focus: { x: number; z: number }) {
    this.time.value += dt;
    this.center.value.set(focus.x, focus.z);
    if (Math.hypot(focus.x - this.cx, focus.z - this.cz) < 3) return;
    this.cx = focus.x; this.cz = focus.z;
    const c = this.cell, R = this.radius, r2 = R * R;
    const i0 = Math.floor((focus.x - R) / c), i1 = Math.ceil((focus.x + R) / c);
    const j0 = Math.floor((focus.z - R) / c), j1 = Math.ceil((focus.z + R) / c);
    let n = 0;
    const max = this.mesh.instanceMatrix.count;
    for (let i = i0; i <= i1 && n < max; i++) {
      for (let j = j0; j <= j1 && n < max; j++) {
        const x = (i + hash(i, j, 1)) * c, z = (j + hash(i, j, 2)) * c;
        const dx = x - focus.x, dz = z - focus.z;
        if (dx * dx + dz * dz > r2) continue;
        if (hash(i, j, 3) < 0.06) continue; // a few bare spots
        if (!this.isGrass(x, z)) continue;
        const sc = 0.75 + hash(i, j, 4) * 0.6;
        this.p.set(x, groundHeight(x, z) - 0.02, z);
        this.q.setFromAxisAngle(this.up, hash(i, j, 5) * Math.PI * 2);
        this.s.set(sc, sc * (0.8 + hash(i, j, 6) * 0.5), sc);
        this.mesh.setMatrixAt(n, this.tmp.compose(this.p, this.q, this.s));
        // Lawn green with a little variety (some yellower, some deeper).
        const t = hash(i, j, 7);
        this.col.setRGB(0.25 + t * 0.09, 0.45 + t * 0.06, 0.11 + (1 - t) * 0.03);
        this.mesh.setColorAt(n, this.col);
        n++;
      }
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    this.plantFlowers(focus);
  }

  /** Flowers grow in patches (a few meters across, mostly one kind per patch), a few loose ones elsewhere. */
  private plantFlowers(focus: { x: number; z: number }) {
    const c = FLOWER_CELL, R = this.radius * 0.85, r2 = R * R;
    const i0 = Math.floor((focus.x - R) / c), i1 = Math.ceil((focus.x + R) / c);
    const j0 = Math.floor((focus.z - R) / c), j1 = Math.ceil((focus.z + R) / c);
    const max = this.flowers.instanceMatrix.count;
    let n = 0;
    for (let i = i0; i <= i1 && n < max; i++) {
      for (let j = j0; j <= j1 && n < max; j++) {
        const x = (i + hash(i, j, 11)) * c, z = (j + hash(i, j, 12)) * c;
        const dx = x - focus.x, dz = z - focus.z;
        if (dx * dx + dz * dz > r2) continue;
        const pi = Math.floor(x / 6), pj = Math.floor(z / 6); // patch cell
        const inPatch = hash(pi, pj, 13) > 0.55;
        if (hash(i, j, 14) > (inPatch ? 0.75 : 0.03)) continue;
        if (!this.isGrass(x, z)) continue;
        const sc = 0.95 + hash(i, j, 15) * 0.5;
        this.p.set(x, groundHeight(x, z) - 0.01, z);
        this.q.setFromAxisAngle(this.up, hash(i, j, 16) * Math.PI * 2);
        this.s.set(sc, sc * (0.75 + hash(i, j, 17) * 0.6), sc);
        this.flowers.setMatrixAt(n, this.tmp.compose(this.p, this.q, this.s));
        // Mostly the patch's own kind, sometimes another one mixed in.
        const kind = hash(i, j, 18) < 0.8 ? Math.floor(hash(pi, pj, 19) * FLOWERS.length) : Math.floor(hash(i, j, 20) * FLOWERS.length);
        this.flowers.setColorAt(n, FLOWERS[kind]);
        n++;
      }
    }
    this.flowers.count = n;
    this.flowers.instanceMatrix.needsUpdate = true;
    if (this.flowers.instanceColor) this.flowers.instanceColor.needsUpdate = true;
  }

  dispose() {
    for (const m of [this.mesh, this.flowers]) {
      m.geometry.dispose();
      (m.material as THREE.Material).dispose();
      m.removeFromParent();
    }
  }
}
