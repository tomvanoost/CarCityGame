// Turns the downloaded Sketchfab vehicles (assets-src/sketchfab/raw) into game-ready models:
//   public/models/vehicles/<id>.glb      detailed: ~60k triangles, textures max 1024 px (WebP)
//   public/models/vehicles/<id>_lod.glb  light (traffic): ~12k triangles, colors baked into the
//                                        vertices, ONE mesh + ONE material = one draw call
// and writes src/game/vehicles/sketchfabManifest.ts + the vehicle part of CREDITS.md.
// Usage: node scripts/build-vehicles.mjs [id ...]
import { getBounds, prune, transformMesh } from '@gltf-transform/functions';
import { autoColor, bakeToWorld, buildLod, finish, io, simplifyTo, triCount } from './lib/pipeline.mjs';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import { findWheels } from './lib/wheels.mjs';

await MeshoptDecoder.ready;
const reader = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });

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
  politie: 4.89, 'hyundo-kono': 4.385,
  brandweer: 7.6, ambulance: 6.0,
  vespo: 1.85, 'hondo-cbr': 2.13, 'kawa-z900': 2.07, 'yamaho-r1': 2.06, harly: 2.6, 'beemer-gs': 2.27, dukati: 2.1,
};
const BIKES = new Set(['vespo', 'hondo-cbr', 'kawa-z900', 'yamaho-r1', 'harly', 'beemer-gs', 'dukati']);

mkdirSync(OUT, { recursive: true });

async function readRaw(id) {
  const glb = `${RAW}/${id}.glb`;
  if (existsSync(glb)) return io.read(glb);
  return io.read(`${RAW}/${id}/scene.gltf`);
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

/** Marks the car-paint material(s) so the game can recolor them. */
function markPaint(doc, paintNames = []) {
  const mats = doc.getRoot().listMaterials();
  const named = (m) => paintNames.some((p) => m.getName().toLowerCase().includes(p.toLowerCase()));
  const paint = mats.filter((m) => named(m) || (/paint|carbody|body_?col|exterior_?body|bodywork|lack/i.test(m.getName()) && !/glass|window|light|chrome/i.test(m.getName())));
  for (const m of paint) m.setName('CCG_PAINT');
  return paint.length > 0;
}

const only = process.argv.slice(2);
for (const [id, p] of Object.entries(picks)) {
  if (fixes[id]?.skip) { delete manifest[id]; console.log(id.padEnd(14), 'skipped:', fixes[id].skip); continue; }
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
    await simplifyTo(doc0, fixes[id]?.tris ?? (bike ? 40000 : 60000), 0.004);
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
      // Wheel spots, so the game can cut the wheels out and spin them.
      wheels: fixes[id]?.wheels === false ? null : findWheels(await reader.read(`${OUT}/${id}.glb`), bike, dims.height),
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
  /** [x, y, z, radius, halfWidth] per wheel (cars fl, fr, rl, rr; bikes front, rear), or null. */
  wheels: [number, number, number, number, number][] | null;
  credit: { name: string; author: string; authorUrl: string; license: string; url: string };
}
export const SKETCHFAB_VEHICLES: Record<string, SketchfabVehicle> = ${JSON.stringify(
  Object.fromEntries(Object.entries(manifest).map(([k, v]) => [k, { length: v.length, width: v.width, height: v.height, bike: v.bike, paintable: v.paintable, seat: v.seat, wheels: v.wheels ?? null, credit: v.credit }])),
  null, 2)};
`;
writeFileSync('src/game/vehicles/sketchfabManifest.ts', ts);
console.log('manifest:', Object.keys(manifest).length, 'vehicles');
