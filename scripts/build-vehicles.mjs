// Turns the downloaded Sketchfab vehicles (assets-src/sketchfab/raw) into game-ready models:
//   public/models/vehicles/<id>.glb      detailed: ~60k triangles, textures max 1024 px (WebP)
//   public/models/vehicles/<id>_lod.glb  light (traffic): ~12k triangles, colors baked into the
//                                        vertices, ONE mesh + ONE material = one draw call
// and writes src/game/vehicles/sketchfabManifest.ts + the vehicle part of CREDITS.md.
// Usage: node scripts/build-vehicles.mjs [id ...]
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import {
  dedup, normals, getBounds, join as joinPrims, meshopt, prune, quantize, simplify, textureCompress, transformMesh, weld,
} from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';

const RAW = 'assets-src/sketchfab/raw';
const OUT = 'public/models/vehicles';
const picks = JSON.parse(readFileSync('assets-src/sketchfab/picks.json', 'utf8'));
const fixes = existsSync('scripts/vehicle-fixes.json') ? JSON.parse(readFileSync('scripts/vehicle-fixes.json', 'utf8')) : {};
const MANIFEST = 'assets-src/sketchfab/manifest.json';
const manifest = existsSync(MANIFEST) ? JSON.parse(readFileSync(MANIFEST, 'utf8')) : {};

/** Real-world sizes (meters): length, and whether it is a motorbike. */
const SIZES = {
  'golfo-2025': 4.28, polino: 4.07, cinque: 3.63, kuper: 3.86, klio: 4.05, yarus: 4.18, 'teslo-modelo3': 4.72, seel: 4.8,
  'oudi-a4': 4.76, 'beemer-3': 4.71, 'mersedez-c': 4.75, taykan: 4.96, 'modelo-y': 4.75, 'id-vier': 4.58, 'atto-3': 4.46,
  'kio-ev6': 4.69, 'volvu-xc90': 4.95, 'rangy-rover': 4.95, 'id-bus': 4.71, jiep: 4.79, 'porsha-911': 4.57, korvet: 4.63,
  ferrara: 4.61, maxlaren: 4.54, hurricano: 4.52, jessko: 4.61, chirone: 4.54,
  vespo: 1.85, 'hondo-cbr': 2.13, 'kawa-z900': 2.07, 'yamaho-r1': 2.06, harly: 2.6, 'beemer-gs': 2.27, dukati: 2.1,
};
const BIKES = new Set(['vespo', 'hondo-cbr', 'kawa-z900', 'yamaho-r1', 'harly', 'beemer-gs', 'dukati']);

await MeshoptEncoder.ready;
await MeshoptSimplifier.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
mkdirSync(OUT, { recursive: true });

const triCount = (doc) => {
  let n = 0;
  for (const m of doc.getRoot().listMeshes())
    for (const p of m.listPrimitives()) {
      const idx = p.getIndices();
      n += (idx ? idx.getCount() : p.getAttribute('POSITION').getCount()) / 3;
    }
  return Math.round(n);
};

async function readRaw(id) {
  const glb = `${RAW}/${id}.glb`;
  if (existsSync(glb)) return io.read(glb);
  return io.read(`${RAW}/${id}/scene.gltf`);
}

// ---- small column-major 4x4 helpers ----
const mul = (a, b) => {
  const o = new Array(16).fill(0);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k];
  return o;
};
const apply = (m, x, y, z, w) => [m[0] * x + m[4] * y + m[8] * z + m[12] * w, m[1] * x + m[5] * y + m[9] * z + m[13] * w, m[2] * x + m[6] * y + m[10] * z + m[14] * w];

/**
 * Puts every mesh in world space, directly under the scene, and removes the rest of the
 * node tree (including skeletons). Rigged (skinned) parts are baked in their rest pose.
 * (gltf-transform's flatten() keeps bone hierarchies, which left wheels tiny and misplaced.)
 */
function bakeToWorld(doc) {
  const root = doc.getRoot();
  const scene = root.getDefaultScene() ?? root.listScenes()[0];
  const meshNodes = root.listNodes().filter((n) => n.getMesh());
  const done = new Set();
  for (const node of meshNodes) {
    const mesh = node.getMesh();
    const skin = node.getSkin();
    if (skin) {
      const joints = skin.listJoints();
      const ibm = skin.getInverseBindMatrices();
      const jm = joints.map((j, i) => mul(j.getWorldMatrix(), ibm ? ibm.getElement(i, new Array(16)) : [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]));
      for (const prim of mesh.listPrimitives()) {
        if (done.has(prim)) continue;
        done.add(prim);
        const J = prim.getAttribute('JOINTS_0'), W = prim.getAttribute('WEIGHTS_0');
        const P = prim.getAttribute('POSITION'), N = prim.getAttribute('NORMAL');
        if (!J || !W) continue;
        const j4 = [], w4 = [], v = [], out = new Float32Array(P.getCount() * 3), nout = N ? new Float32Array(N.getCount() * 3) : null;
        for (let i = 0; i < P.getCount(); i++) {
          J.getElement(i, j4); W.getElement(i, w4); P.getElement(i, v);
          const acc = [0, 0, 0], nacc = [0, 0, 0];
          const n = N ? N.getElement(i, []) : null;
          for (let k = 0; k < 4; k++) {
            if (!w4[k]) continue;
            const m = jm[j4[k]];
            const pp = apply(m, v[0], v[1], v[2], 1);
            for (let c = 0; c < 3; c++) acc[c] += pp[c] * w4[k];
            if (n) { const nn = apply(m, n[0], n[1], n[2], 0); for (let c = 0; c < 3; c++) nacc[c] += nn[c] * w4[k]; }
          }
          out.set(acc, i * 3);
          if (nout) { const l = Math.hypot(...nacc) || 1; nout.set(nacc.map((x) => x / l), i * 3); }
        }
        P.setArray(out);
        if (N && nout) N.setArray(nout);
        prim.setAttribute('JOINTS_0', null).setAttribute('WEIGHTS_0', null);
      }
      node.setSkin(null);
    } else {
      transformMesh(mesh, node.getWorldMatrix());
    }
  }
  // Re-attach the mesh nodes to the scene with identity transforms; drop everything else.
  for (const node of meshNodes) {
    const parent = node.getParentNode();
    if (parent) parent.removeChild(node);
    for (const child of node.listChildren()) node.removeChild(child);
    node.setMatrix([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
    scene.addChild(node);
  }
  const keep = new Set(meshNodes);
  for (const node of root.listNodes()) if (!keep.has(node)) node.dispose();
  for (const sk of root.listSkins()) sk.dispose();
  for (const a of root.listAnimations()) a.dispose();
}

/** Bakes all transforms, removes floors/backdrops, aligns the vehicle: +Z forward, on the ground, real length. */
async function normalize(doc, id) {
  const root = doc.getRoot();
  const scene = root.getDefaultScene() ?? root.listScenes()[0];
  // Meshes shared by several nodes (e.g. four identical wheels) get their own copy first,
  // otherwise baking each node's transform would move the same mesh several times.
  const used = new Set();
  for (const node of root.listNodes()) {
    const mesh = node.getMesh();
    if (!mesh) continue;
    if (used.has(mesh)) node.setMesh(mesh.clone());
    else used.add(mesh);
  }
  bakeToWorld(doc);
  // Drop lines/points and empty primitives.
  for (const m of root.listMeshes()) for (const p of m.listPrimitives()) if (p.getMode() !== 4 || !p.getAttribute('POSITION')) p.dispose();
  // Floors / backdrops: very flat meshes that are as large as (or larger than) the whole model.
  let all = getBounds(scene);
  const size = all.max.map((v, i) => v - all.min[i]);
  for (const node of root.listNodes()) {
    if (!node.getMesh()) continue;
    const b = getBounds(node);
    const h = b.max[1] - b.min[1], fx = b.max[0] - b.min[0], fz = b.max[2] - b.min[2];
    if (h < size[1] * 0.02 && fx * fz > size[0] * size[2] * 0.6) node.dispose();
  }
  all = getBounds(scene);
  const dx = all.max[0] - all.min[0], dz = all.max[2] - all.min[2];
  // Rotate so the length is along Z, plus a manual fix (degrees) when the front faces backwards.
  let rot = dx > dz ? -Math.PI / 2 : 0;
  rot += ((fixes[id]?.rotate ?? 0) * Math.PI) / 180;
  const len = Math.max(dx, dz);
  const s = SIZES[id] / len;
  const cx = (all.min[0] + all.max[0]) / 2, cz = (all.min[2] + all.max[2]) / 2;
  const c = Math.cos(rot), sn = Math.sin(rot);
  // Column-major 4x4: translate(-center) -> rotateY -> scale -> lift to the ground.
  const m = [
    c * s, 0, -sn * s, 0,
    0, s, 0, 0,
    sn * s, 0, c * s, 0,
    s * (-cx * c - cz * sn), -all.min[1] * s, s * (cx * sn - cz * c), 1,
  ];
  for (const mesh of root.listMeshes()) transformMesh(mesh, m);
  await doc.transform(prune());
  const b = getBounds(scene);
  return { length: b.max[2] - b.min[2], width: b.max[0] - b.min[0], height: b.max[1] - b.min[1] };
}

/**
 * Some uploads have no colors at all (every material plain white/grey, no textures).
 * Then give each material a sensible look based on its name.
 */
function autoColor(doc, paintHex, paintNames = []) {
  const mats = doc.getRoot().listMaterials();
  if (!mats.length || doc.getRoot().listTextures().length) return false;
  // Colorless = every material is a plain grey (r ≈ g ≈ b).
  const grey = (m) => { const [r, g, b] = m.getBaseColorFactor(); return Math.max(r, g, b) - Math.min(r, g, b) < 0.03; };
  if (!mats.every(grey)) return false;
  const hex = (h) => [1, 3, 5].map((i) => Math.pow(parseInt(h.slice(i, i + 2), 16) / 255, 2.2));
  const paint = hex(paintHex);
  for (const m of mats) {
    const n = m.getName().toLowerCase();
    const set = (rgb, metal, rough, extra = {}) => {
      m.setBaseColorFactor([...rgb, extra.alpha ?? 1]).setMetallicFactor(metal).setRoughnessFactor(rough);
      if (extra.alpha) m.setAlphaMode('BLEND');
      if (extra.emissive) m.setEmissiveFactor(extra.emissive);
    };
    if (paintNames.some((p) => n.includes(p.toLowerCase()))) set(paint, 0.6, 0.3);
    else if (/glass|window|windshield/.test(n) && !/light|lamp/.test(n)) set([0.04, 0.06, 0.08], 0.3, 0.05, { alpha: 0.55 });
    else if (/brake|tail|rear.?light|red/.test(n)) set([0.6, 0.02, 0.02], 0, 0.3, { emissive: [0.5, 0.02, 0.02] });
    else if (/light|lamp|bulb|led|head/.test(n)) set([0.95, 0.95, 0.95], 0.2, 0.1, { emissive: [0.6, 0.6, 0.6] });
    else if (/tire|tyre|rubber/.test(n)) set([0.02, 0.02, 0.02], 0, 0.9);
    else if (/chrome|badge|logo|emblem|silver|metal|rim|wheel|exhaust|rotor/.test(n)) set([0.75, 0.75, 0.77], 1, 0.25);
    else if (/paint|body|exterior/.test(n) && !/(^|[^a-z])int/.test(n)) set(paint, 0.6, 0.3);
    else if (/(^|[^a-z])int|interior|seat|dash|carpet|leather|fabric|steer/.test(n)) set([0.05, 0.05, 0.055], 0, 0.8);
    else set([0.03, 0.03, 0.035], 0.1, 0.6); // trims, plastics, everything else
  }
  return true;
}

/** Marks the car-paint material(s) so the game can recolor them. */
function markPaint(doc, paintNames = []) {
  const mats = doc.getRoot().listMaterials();
  const named = (m) => paintNames.some((p) => m.getName().toLowerCase().includes(p.toLowerCase()));
  const paint = mats.filter((m) => named(m) || (/paint|carbody|body_?col|exterior_?body|bodywork|lack/i.test(m.getName()) && !/glass|window|light|chrome/i.test(m.getName())));
  for (const m of paint) m.setName('CCG_PAINT');
  return paint.length > 0;
}

/** Simplifies until the target is reached, allowing a bit more deviation each round. */
async function simplifyTo(doc, target, error, keepNormals = true) {
  const run = async () => {
    await doc.transform(weld());
    for (let round = 0, err = error; round < 5 && triCount(doc) > target * 1.1; round++, err *= 2.5) {
      const n = triCount(doc);
      await doc.transform(simplify({ simplifier: MeshoptSimplifier, ratio: Math.max(0.005, target / n), error: err }));
    }
  };
  if (!keepNormals) dropNormals(doc);
  await run();
  if (triCount(doc) > target * 1.5 && keepNormals) {
    // Loose triangles with per-face normals can't be merged: drop normals, simplify, recompute them.
    dropNormals(doc);
    await run();
    await doc.transform(normals({ overwrite: true }));
  }
}

function dropNormals(doc) {
  for (const m of doc.getRoot().listMeshes()) for (const p of m.listPrimitives()) p.setAttribute('NORMAL', null);
}

/** Average color of a texture image (sRGB -> linear), cached. */
const meanCache = new Map();
async function textureMean(tex) {
  if (!tex) return [1, 1, 1];
  if (meanCache.has(tex)) return meanCache.get(tex);
  let v = [1, 1, 1];
  try {
    const st = await sharp(Buffer.from(tex.getImage())).stats();
    v = st.channels.slice(0, 3).map((ch) => Math.pow(ch.mean / 255, 2.2));
  } catch { /* unsupported image */ }
  meanCache.set(tex, v);
  return v;
}

/** Light version: colors baked into the vertices, one material, one mesh. */
async function buildLod(doc, length) {
  const root = doc.getRoot();
  // The windows are opaque in this version: drop the interior and tiny parts (bolts, badges, buttons).
  for (const node of root.listNodes()) {
    const mesh = node.getMesh();
    if (!mesh) continue;
    const b = getBounds(node);
    const diag = Math.hypot(b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]);
    const name = `${node.getName()} ${mesh.getName()}`;
    if (diag < length * 0.06 || /(^|[^a-z])(int|interior|seat|dash|steering|pedal|carpet|console|speaker|belt)/i.test(name)) node.dispose();
  }
  await doc.transform(prune());
  const buffer = root.listBuffers()[0];
  const shared = doc.createMaterial('CCG_LOD').setBaseColorFactor([1, 1, 1, 1]).setRoughnessFactor(0.45).setMetallicFactor(0.2);
  for (const mesh of root.listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const mat = prim.getMaterial();
      let col = [0.6, 0.6, 0.6];
      if (mat) {
        const f = mat.getBaseColorFactor();
        const t = await textureMean(mat.getBaseColorTexture());
        col = [f[0] * t[0], f[1] * t[1], f[2] * t[2]];
        const e = mat.getEmissiveFactor();
        if (Math.max(...e) > 0.5) col = e.slice(0, 3);
        if (mat.getAlphaMode() === 'BLEND' || f[3] < 0.9 || /glass|window/i.test(mat.getName())) col = [0.05, 0.08, 0.11];
      }
      for (const sem of prim.listSemantics()) if (sem !== 'POSITION') prim.setAttribute(sem, null);
      for (const t of prim.listTargets()) t.dispose();
      const n = prim.getAttribute('POSITION').getCount();
      const arr = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) arr.set(col, i * 3);
      prim.setAttribute('COLOR_0', doc.createAccessor().setType('VEC3').setArray(arr).setBuffer(buffer));
      prim.setMaterial(shared);
    }
  }
  // Colors are baked into the vertices: no images needed at all.
  for (const m of root.listMaterials()) if (m !== shared) m.dispose();
  for (const t of root.listTextures()) t.dispose();
  await doc.transform(prune());
}

async function finish(doc, out, { textures }) {
  await doc.transform(dedup(), joinPrims({ keepNamed: false }), prune());
  if (textures) await doc.transform(textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [1024, 1024], quality: 80 }));
  await doc.transform(quantize(), meshopt({ encoder: MeshoptEncoder, level: 'high' }));
  await io.write(out, doc);
  return statSync(out).size;
}

const only = process.argv.slice(2);
for (const [id, p] of Object.entries(picks)) {
  if (only.length && !only.includes(id)) continue;
  if (!existsSync(`${RAW}/${id}.glb`) && !existsSync(`${RAW}/${id}/scene.gltf`)) { console.log(id.padEnd(14), 'not downloaded'); continue; }
  try {
    const bike = BIKES.has(id);
    // Detailed version.
    const doc0 = await readRaw(id);
    const dims = await normalize(doc0, id);
    const color = fixes[id]?.color ?? '#c8102e';
    const paintNames = fixes[id]?.paint ?? [];
    autoColor(doc0, color, paintNames);
    const paintable = markPaint(doc0, paintNames);
    await simplifyTo(doc0, bike ? 40000 : 60000, 0.004);
    const tris0 = triCount(doc0);
    const size0 = await finish(doc0, `${OUT}/${id}.glb`, { textures: true });
    // Light version (from a fresh read, so its simplification starts from full detail).
    const doc1 = await readRaw(id);
    const d1 = await normalize(doc1, id);
    autoColor(doc1, color, paintNames);
    await buildLod(doc1, d1.length);
    await simplifyTo(doc1, bike ? 6000 : 12000, 0.02, false);
    const tris1 = triCount(doc1);
    const size1 = await finish(doc1, `${OUT}/${id}_lod.glb`, { textures: false });
    manifest[id] = {
      ...dims, bike, paintable, tris0, tris1, size0, size1,
      // Driver's hips (vehicle-local): left seat (+X), a bit behind the middle.
      seat: bike ? [0, dims.height * 0.5, -dims.length * 0.08] : [dims.width * 0.2, dims.height * 0.42, -dims.length * 0.07],
      credit: { name: p.name, author: p.author, authorUrl: p.authorUrl, license: p.license, url: p.url },
    };
    console.log(`${id.padEnd(14)} ${dims.length.toFixed(2)}x${dims.width.toFixed(2)}x${dims.height.toFixed(2)} m  ` +
      `${String(tris0).padStart(6)} tris ${(size0 / 1e6).toFixed(1)} MB | lod ${String(tris1).padStart(5)} tris ${(size1 / 1e3).toFixed(0)} KB${paintable ? '' : '  (no paint material)'}`);
  } catch (e) {
    console.log(id.padEnd(14), 'FAILED:', e.message);
  }
}
writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2));

// Generated TypeScript manifest for the game.
const ts = `// GENERATED by scripts/build-vehicles.mjs — do not edit by hand.
export interface SketchfabVehicle {
  length: number; width: number; height: number; bike: boolean; paintable: boolean;
  seat: [number, number, number];
  credit: { name: string; author: string; authorUrl: string; license: string; url: string };
}
export const SKETCHFAB_VEHICLES: Record<string, SketchfabVehicle> = ${JSON.stringify(
  Object.fromEntries(Object.entries(manifest).map(([k, v]) => [k, { length: v.length, width: v.width, height: v.height, bike: v.bike, paintable: v.paintable, seat: v.seat, credit: v.credit }])),
  null, 2)};
`;
writeFileSync('src/game/vehicles/sketchfabManifest.ts', ts);
console.log('manifest:', Object.keys(manifest).length, 'vehicles');
