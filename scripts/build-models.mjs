// Optimizes the CC0 source models in assets-src/ into small .glb files in public/models/.
// - Characters: one mesh-only file per outfit + one shared animation file per gender.
// - Violent animations (punch, shoot, sword, death, ...) are removed: this is a kids game.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, meshopt, prune, quantize, resample, weld } from '@gltf-transform/functions';
import { MeshoptEncoder } from 'meshoptimizer';
import { mkdirSync, readdirSync, statSync } from 'node:fs';
import { basename, join } from 'node:path';

const SRC = 'assets-src/characters';
const OUT = 'public/models/characters';
const KEEP_ANIMS = ['Idle', 'Walk', 'Run', 'Jump', 'SitDown', 'StandUp', 'Victory', 'PickUp', 'Walk_Carry', 'Run_Carry'];

await MeshoptEncoder.ready;
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
for (const f of readdirSync(SRC).filter((f) => f.endsWith('.gltf')).sort()) {
  const out = await buildOutfit(f);
  console.log(out.padEnd(48), kb(out));
}
for (const [file, g] of [['Casual_Male.gltf', 'male'], ['Casual_Female.gltf', 'female']]) {
  const out = await buildAnims(file, g);
  console.log(out.padEnd(48), kb(out));
}
