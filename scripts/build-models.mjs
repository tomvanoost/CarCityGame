// Optimizes the CC0 source models in assets-src/ into small .glb files in public/models/.
// - Characters: one mesh-only file per outfit + one shared animation file per gender.
// - Violent animations (punch, shoot, sword, death, ...) are removed: this is a kids game.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, flatten, join as joinPrims, meshopt, prune, quantize, resample, simplify, weld } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';
import { mkdirSync, readdirSync, statSync } from 'node:fs';
import { basename, join } from 'node:path';

const SRC = 'assets-src/characters';
const OUT = 'public/models/characters';
const KEEP_ANIMS = ['Idle', 'Walk', 'Run', 'Jump', 'SitDown', 'StandUp', 'Victory', 'PickUp', 'Walk_Carry', 'Run_Carry'];

await MeshoptEncoder.ready;
await MeshoptSimplifier.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
mkdirSync(OUT, { recursive: true });

const compress = [dedup(), weld(), quantize(), meshopt({ encoder: MeshoptEncoder, level: 'high' })];

async function buildOutfit(file) {
  const doc = await io.read(join(SRC, file));
  const root = doc.getRoot();
  root.listAnimations().forEach((a) => a.dispose());
  // Soft, non-metallic fabric/skin look; colors stay as authored.
  for (const m of root.listMaterials()) m.setMetallicFactor(0).setRoughnessFactor(0.75);
  await doc.transform(prune(), ...compress);
  const out = join(OUT, basename(file, '.gltf') + '.glb');
  await io.write(out, doc);
  return out;
}

async function buildAnims(file, gender) {
  const doc = await io.read(join(SRC, file));
  const root = doc.getRoot();
  for (const a of root.listAnimations()) if (!KEEP_ANIMS.includes(a.getName())) a.dispose();
  for (const n of root.listNodes()) { n.setMesh(null); n.setSkin(null); }
  root.listSkins().forEach((s) => s.dispose());
  root.listMeshes().forEach((m) => m.dispose());
  await doc.transform(resample(), prune({ keepLeaves: true }), dedup(), meshopt({ encoder: MeshoptEncoder, level: 'high' }));
  const out = join(OUT, `anims_${gender}.glb`);
  await io.write(out, doc);
  return out;
}

const kb = (f) => `${(statSync(f).size / 1024).toFixed(0)} KB`;
const onlyCity = process.argv.includes('--city');
if (!onlyCity) for (const f of readdirSync(SRC).filter((f) => f.endsWith('.gltf')).sort()) {
  const out = await buildOutfit(f);
  console.log(out.padEnd(48), kb(out));
}
if (!onlyCity) for (const [file, g] of [['Casual_Male.gltf', 'male'], ['Casual_Female.gltf', 'female']]) {
  const out = await buildAnims(file, g);
  console.log(out.padEnd(48), kb(out));
}

// ---------------------------------------------------------------------------
// City models: each becomes ONE mesh with baked vertex colors (so the whole city
// can share one material and be drawn with a few BatchedMesh draw calls), plus a
// much lighter "_lod" version for far away. Vertices of the "Main" wall material
// get a _MAIN = 1 attribute so the game can recolor walls per building.
// ---------------------------------------------------------------------------
const CITY_SRC = 'assets-src/city';
const CITY_OUT = 'public/models/city';
// [source, max vertices LOD0, max vertices LOD1]
const CITY = [
  ...['Building1_Large', 'Building1_Small', 'Building2_Large', 'Building2_Small', 'Building3_Big', 'Building3_Small', 'Building4']
    .map((n) => [`buildings_pack_2/${n}`, 12000, 700]),
  ...['1Story_GableRoof_Mat', '1Story_Mat', '1Story_RoundRoof_Mat', '1Story_Sign_Mat', '2Story_2_Mat', '2Story_Balcony_Mat',
    '2Story_Center_Mat', '2Story_Columns_Mat', '2Story_Double_Mat', '2Story_GableRoof_Mat', '2Story_Mat', '2Story_RoundRoof_Mat',
    '2Story_Sidehouse_Mat', '2Story_Sign_Mat', '2Story_Stairs_Mat', '2Story_Wide_2Doors_Mat', '2Story_Wide_Mat', '3Story_Balcony_Mat',
    '3Story_Small_Mat', '4Story_Center_Mat', '4Story_Mat', '4Story_Wide_2Doors_Mat', '6Story_Stack_Mat']
    .map((n) => [`buildings_pack_3/${n}`, 3500, 500]),
  ...['CommonTree_1', 'CommonTree_2', 'CommonTree_3', 'CommonTree_4', 'CommonTree_5', 'BirchTree_1', 'BirchTree_2', 'BirchTree_3',
    'PineTree_1', 'PineTree_2', 'PineTree_3', 'Willow_1'].map((n) => [`nature_pack/${n}`, 900, 140]),
  ...['Bush_1', 'Bush_2', 'BushBerries_1', 'Flowers', 'Rock_Moss_1', 'Rock_Moss_2', 'Lilypad'].map((n) => [`nature_pack/${n}`, 600, 0]),
  ['street_pack/Streetlight_Single', 900, 0],
  ['street_pack/TrafficLight_2', 900, 0],
];

function vertexCount(doc) {
  let n = 0;
  for (const m of doc.getRoot().listMeshes()) for (const p of m.listPrimitives()) n += p.getAttribute('POSITION').getCount();
  return n;
}

async function buildCityModel(src, maxVerts, far = false) {
  const doc = await io.read(join(CITY_SRC, src + '.glb'));
  const root = doc.getRoot();
  // Flat-shaded style: normals are computed in the shader (flatShading), so drop them.
  // Without per-face normals, vertices can be shared and the mesh can be simplified.
  for (const mesh of root.listMeshes())
    for (const prim of mesh.listPrimitives())
      for (const sem of prim.listSemantics()) if (sem !== 'POSITION') prim.setAttribute(sem, null);
  await doc.transform(weld());
  const count = vertexCount(doc);
  if (count > maxVerts) {
    const ratio = Math.max(0.02, maxVerts / count);
    // Simplify each material part separately, so colors never bleed.
    await doc.transform(simplify({ simplifier: MeshoptSimplifier, ratio, error: far ? 0.15 : maxVerts < 1000 ? 0.04 : maxVerts > 10000 ? 0.004 : 0.01, lockBorder: !far }));
  }
  // Bake material colors into vertex colors.
  const shared = doc.createMaterial('City').setBaseColorFactor([1, 1, 1, 1]).setRoughnessFactor(0.85).setMetallicFactor(0);
  const buffer = root.listBuffers()[0];
  for (const mesh of root.listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const mat = prim.getMaterial();
      const [r, g, b] = mat ? mat.getBaseColorFactor() : [1, 1, 1];
      const name = mat?.getName() ?? '';
      const isMain = name === 'Main' ? 1 : 0;
      // Surface kind for the city shader: 0 = normal, 2 = glass (reflective windows), 3 = roof tiles.
      const kind = /^(Glass|Windows|DarkGrey)$/.test(name) ? 2 : /^(RoofBricks|DarkRed)$/.test(name) ? 3 : 0;
      const n = prim.getAttribute('POSITION').getCount();
      const col = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) col.set([r, g, b], i * 3);
      prim.setAttribute('COLOR_0', doc.createAccessor().setType('VEC3').setArray(col).setBuffer(buffer));
      prim.setAttribute('_MAIN', doc.createAccessor().setType('SCALAR').setArray(new Float32Array(n).fill(isMain)).setBuffer(buffer));
      prim.setAttribute('_KIND', doc.createAccessor().setType('SCALAR').setArray(new Float32Array(n).fill(kind)).setBuffer(buffer));
      prim.setMaterial(shared);
    }
  }
  await doc.transform(flatten(), joinPrims({ keepNamed: false }), prune(), dedup(), weld());
  await doc.transform(quantize({ quantizeColor: 8 }), meshopt({ encoder: MeshoptEncoder, level: 'high' }));
  return doc;
}

mkdirSync(CITY_OUT, { recursive: true });
let total = 0;
for (const [src, lod0, lod1] of CITY) {
  const name = basename(src).replace('_Mat', '');
  const out = join(CITY_OUT, `${name}.glb`);
  const doc0 = await buildCityModel(src, lod0);
  await io.write(out, doc0);
  let line = `${out.padEnd(48)} ${kb(out).padStart(7)}  ${vertexCount(doc0)} v`;
  total += statSync(out).size;
  if (lod1) {
    const outL = join(CITY_OUT, `${name}_lod.glb`);
    const doc1 = await buildCityModel(src, lod1, true);
    await io.write(outL, doc1);
    total += statSync(outL).size;
    line += `  | lod ${kb(outL)} ${vertexCount(doc1)} v`;
  }
  console.log(line);
}
console.log(`city total: ${(total / 1024 / 1024).toFixed(1)} MB`);
