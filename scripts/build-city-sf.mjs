// Turns the downloaded Sketchfab city models (assets-src/sketchfab/raw-city) into:
//   public/models/city-sf/<id>.glb      close-up: textured (512 px), a few thousand triangles
//   public/models/city-sf/<id>_lod.glb  far away: colors in the vertices, one mesh (city batch format)
// and writes src/game/city/sketchfabCity.ts + the city part of CREDITS.md.
// Usage: node scripts/build-city-sf.mjs [id ...]
import { getBounds, prune, transformMesh } from '@gltf-transform/functions';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import sharp from 'sharp';
import { bakeToWorld, finish, io, simplifyTo, textureMean, triCount } from './lib/pipeline.mjs';

const RAW = 'assets-src/sketchfab/raw-city';
const OUT = 'public/models/city-sf';
const picks = JSON.parse(readFileSync('assets-src/sketchfab/picks-city.json', 'utf8'));
const fixes = existsSync('scripts/city-fixes.json') ? JSON.parse(readFileSync('scripts/city-fixes.json', 'utf8')) : {};
/** Real height (m), triangle budget close-up / far. */
const CAT = {
  house: { h: 8, near: 5000, far: 300 },
  townhouse: { h: 13, near: 6000, far: 400 },
  shop: { h: 7, near: 6000, far: 400 },
  apartment: { h: 18, near: 10000, far: 800 },
  tower: { h: 75, near: 15000, far: 4000 },
  tree: { h: 8, near: 2500, far: 200 },
  pine: { h: 10, near: 2000, far: 200 },
  bush: { h: 1.3, near: 1500, far: 0 },
};
mkdirSync(OUT, { recursive: true });

async function prepare(id, p) {
  const doc = await io.read(existsSync(`${RAW}/${id}.glb`) ? `${RAW}/${id}.glb` : `${RAW}/${id}/scene.gltf`);
  const root = doc.getRoot();
  const scene = root.getDefaultScene() ?? root.listScenes()[0];
  bakeToWorld(doc);
  // Per-model fix: drop parts by node name (e.g. a canal + quay that came with a house).
  for (const name of fixes[id]?.dropNodes ?? []) for (const n of root.listNodes()) if (n.getName().includes(name)) n.dispose();
  for (const m of root.listMeshes()) for (const pr of m.listPrimitives()) if (pr.getMode() !== 4 || !pr.getAttribute('POSITION')) pr.dispose();
  // Remove ground plates: flat meshes about as large as (or larger than) the whole model.
  let b = getBounds(scene);
  const size = b.max.map((v, i) => v - b.min[i]);
  for (const node of root.listNodes()) {
    if (!node.getMesh()) continue;
    const nb = getBounds(node);
    if (nb.max[1] - nb.min[1] < size[1] * 0.03 && (nb.max[0] - nb.min[0]) * (nb.max[2] - nb.min[2]) > size[0] * size[2] * 0.5) node.dispose();
  }
  b = getBounds(scene);
  const c = CAT[p.category];
  const s = (fixes[id]?.height ?? c.h) / (b.max[1] - b.min[1]);
  const rot = ((fixes[id]?.rotate ?? 0) * Math.PI) / 180, co = Math.cos(rot), sn = Math.sin(rot);
  const cx = (b.min[0] + b.max[0]) / 2, cz = (b.min[2] + b.max[2]) / 2;
  const m = [co * s, 0, -sn * s, 0, 0, s, 0, 0, sn * s, 0, co * s, 0,
    s * (-cx * co - cz * sn), -b.min[1] * s, s * (cx * sn - cz * co), 1];
  for (const mesh of root.listMeshes()) transformMesh(mesh, m);
  await doc.transform(prune());
  const nb = getBounds(scene);
  return { doc, dims: { x: nb.max[0] - nb.min[0], y: nb.max[1] - nb.min[1], z: nb.max[2] - nb.min[2] } };
}

/** Decoded texture pixels (128x128 RGBA), cached. */
const pixCache = new Map();
async function pixels(tex) {
  if (!pixCache.has(tex)) {
    pixCache.set(tex, sharp(Buffer.from(tex.getImage())).resize(128, 128, { fit: 'fill' }).ensureAlpha().raw().toBuffer().catch(() => null));
  }
  return pixCache.get(tex);
}

/**
 * Far version for the city batch: keeps ALL parts, colors per vertex sampled from the texture
 * (facades keep their brick / window colors); for see-through textures (leaves) the average of
 * the visible pixels. One shared material, POSITION + COLOR_0 only.
 */
async function buildCityLod(doc) {
  const root = doc.getRoot();
  const buffer = root.listBuffers()[0];
  const shared = doc.createMaterial('CCG_LOD').setBaseColorFactor([1, 1, 1, 1]).setRoughnessFactor(0.8).setMetallicFactor(0);
  for (const mesh of root.listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const mat = prim.getMaterial();
      const pos = prim.getAttribute('POSITION');
      const n = pos.getCount();
      const col = new Float32Array(n * 3);
      const f = mat ? mat.getBaseColorFactor() : [0.7, 0.7, 0.7, 1];
      const tex = mat?.getBaseColorTexture();
      const uv = prim.getAttribute('TEXCOORD_0');
      const cutout = mat && mat.getAlphaMode() !== 'OPAQUE';
      const px = tex && uv && !cutout ? await pixels(tex) : null;
      const avg = await textureMean(tex);
      const t = [0, 0];
      for (let i = 0; i < n; i++) {
        let c = [f[0] * avg[0], f[1] * avg[1], f[2] * avg[2]];
        if (px) {
          uv.getElement(i, t);
          const x = Math.min(127, Math.max(0, Math.floor((((t[0] % 1) + 1) % 1) * 128)));
          const y = Math.min(127, Math.max(0, Math.floor((((t[1] % 1) + 1) % 1) * 128)));
          const k = (y * 128 + x) * 4;
          c = [0, 1, 2].map((j) => f[j] * Math.pow(px[k + j] / 255, 2.2));
        }
        col.set(c, i * 3);
      }
      for (const sem of prim.listSemantics()) if (sem !== 'POSITION') prim.setAttribute(sem, null);
      prim.setAttribute('COLOR_0', doc.createAccessor().setType('VEC3').setArray(col).setBuffer(buffer));
      prim.setMaterial(shared);
    }
  }
  for (const m of root.listMaterials()) if (m !== shared) m.dispose();
  for (const tx of root.listTextures()) tx.dispose();
  await doc.transform(prune());
}

const only = process.argv.slice(2);
const manifestPath = 'assets-src/sketchfab/manifest-city.json';
const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : {};
for (const [id, p] of Object.entries(picks)) {
  if (only.length && !only.includes(id)) continue;
  if (fixes[id]?.skip) { delete manifest[id]; console.log(id.padEnd(15), 'skipped:', fixes[id].skip); continue; }
  try {
    const c = CAT[p.category];
    const { doc, dims } = await prepare(id, p);
    await simplifyTo(doc, c.near, 0.004);
    const t0 = triCount(doc);
    const s0 = await finish(doc, `${OUT}/${id}.glb`, { textures: true, size: 512 });
    let t1 = 0, s1 = 0;
    if (c.far) {
      const { doc: d1 } = await prepare(id, p);
      if (p.category === 'tree' || p.category === 'pine') {
        // Trees far away: colors in the vertices (leaves = average of visible pixels), very light.
        await buildCityLod(d1);
        await simplifyTo(d1, c.far, 0.02, false);
        t1 = triCount(d1);
        s1 = await finish(d1, `${OUT}/${id}_lod.glb`, { textures: false });
      } else {
        // Buildings far away: same textures (small), simplified more (vertex colors can't show facades).
        await simplifyTo(d1, c.far, 0.03);
        t1 = triCount(d1);
        if (t1 > c.far * 1.5) {
          // Texture seams block simplification: use colors sampled from the texture per vertex instead.
          const { doc: d2 } = await prepare(id, p);
          await buildCityLod(d2);
          await simplifyTo(d2, c.far, 0.02, false);
          t1 = triCount(d2);
          s1 = await finish(d2, `${OUT}/${id}_lod.glb`, { textures: false });
        } else {
          s1 = await finish(d1, `${OUT}/${id}_lod.glb`, { textures: true, size: 256 });
        }
      }
    }
    manifest[id] = { category: p.category, ...dims, lod: !!c.far,
      credit: { name: p.name, author: p.author, authorUrl: p.authorUrl, license: p.license, url: p.url } };
    console.log(`${id.padEnd(15)} ${dims.x.toFixed(1)}x${dims.y.toFixed(1)}x${dims.z.toFixed(1)} m  ${String(t0).padStart(6)} tris ${(s0 / 1e3).toFixed(0).padStart(5)} KB | far ${String(t1).padStart(5)} tris ${(s1 / 1e3).toFixed(0)} KB`);
  } catch (e) {
    console.log(id.padEnd(15), 'FAILED:', e.message);
  }
}
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
writeFileSync('src/game/city/sketchfabCity.ts', `// GENERATED by scripts/build-city-sf.mjs — do not edit by hand.
export type SfCategory = 'house' | 'townhouse' | 'shop' | 'apartment' | 'tower' | 'tree' | 'pine' | 'bush';
export interface SfCityModel {
  category: SfCategory; x: number; y: number; z: number; lod: boolean;
  credit: { name: string; author: string; authorUrl: string; license: string; url: string };
}
export const SKETCHFAB_CITY: Record<string, SfCityModel> = ${JSON.stringify(manifest, null, 2)};
`);
console.log('city manifest:', Object.keys(manifest).length, 'models');
