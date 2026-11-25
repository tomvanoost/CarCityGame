// Shared glTF processing steps for Sketchfab models (vehicles and city).
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, getBounds, join as joinPrims, meshopt, normals, prune, quantize, simplify, textureCompress, transformMesh, weld } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';
import { statSync } from 'node:fs';

await MeshoptEncoder.ready;
await MeshoptSimplifier.ready;
export const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });

export const triCount = (doc) => {
  let n = 0;
  for (const m of doc.getRoot().listMeshes())
    for (const p of m.listPrimitives()) {
      const idx = p.getIndices();
      n += (idx ? idx.getCount() : p.getAttribute('POSITION').getCount()) / 3;
    }
  return Math.round(n);
};


// ---- small column-major 4x4 helpers ----
export const mul = (a, b) => {
  const o = new Array(16).fill(0);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k];
  return o;
};
export const apply = (m, x, y, z, w) => [m[0] * x + m[4] * y + m[8] * z + m[12] * w, m[1] * x + m[5] * y + m[9] * z + m[13] * w, m[2] * x + m[6] * y + m[10] * z + m[14] * w];

/**
 * Puts every mesh in world space, directly under the scene, and removes the rest of the
 * node tree (including skeletons). Rigged (skinned) parts are baked in their rest pose.
 * (gltf-transform's flatten() keeps bone hierarchies, which left wheels tiny and misplaced.)
 */
export function bakeToWorld(doc) {
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


/**
 * Some uploads have no colors at all (every material plain white/grey, no textures).
 * Then give each material a sensible look based on its name.
 */
export function autoColor(doc, paintHex, paintNames = []) {
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


/** Simplifies until the target is reached, allowing a bit more deviation each round. */
export async function simplifyTo(doc, target, error, keepNormals = true) {
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

export function dropNormals(doc) {
  for (const m of doc.getRoot().listMeshes()) for (const p of m.listPrimitives()) p.setAttribute('NORMAL', null);
}


/** Average color of a texture image (sRGB -> linear), cached. */
const meanCache = new Map();
export async function textureMean(tex) {
  if (!tex) return [1, 1, 1];
  if (meanCache.has(tex)) return meanCache.get(tex);
  let v = [1, 1, 1];
  try {
    // Average over visible pixels only (leaf textures are mostly transparent).
    const { data, info } = await sharp(Buffer.from(tex.getImage())).resize(64, 64, { fit: 'fill' }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    let r = 0, g = 0, b = 0, n = 0;
    for (let i = 0; i < data.length; i += info.channels) {
      if (data[i + 3] < 128) continue;
      r += data[i]; g += data[i + 1]; b += data[i + 2]; n++;
    }
    if (n) v = [r, g, b].map((c) => Math.pow(c / n / 255, 2.2));
  } catch { /* unsupported image */ }
  meanCache.set(tex, v);
  return v;
}


/** Light version: colors baked into the vertices, one material, one mesh. */
export async function buildLod(doc, length) {
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


export async function finish(doc, out, { textures, size = 1024 }) {
  await doc.transform(dedup(), joinPrims({ keepNamed: false }), prune());
  if (textures) await doc.transform(textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [size, size], quality: 80 }));
  await doc.transform(quantize(), meshopt({ encoder: MeshoptEncoder, level: 'high' }));
  await io.write(out, doc);
  return statSync(out).size;
}

