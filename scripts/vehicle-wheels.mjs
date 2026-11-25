// Adds the wheel positions (scripts/lib/wheels.mjs) of every processed vehicle to
// src/game/vehicles/sketchfabManifest.ts without the raw Sketchfab files.
// Usage: node scripts/vehicle-wheels.mjs
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import { readFileSync, writeFileSync } from 'node:fs';
import { findWheels } from './lib/wheels.mjs';

const fixes = JSON.parse(readFileSync('scripts/vehicle-fixes.json', 'utf8'));

await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
const FILE = 'src/game/vehicles/sketchfabManifest.ts';
const src = readFileSync(FILE, 'utf8');
const start = src.indexOf('= {') + 2, end = src.lastIndexOf('};') + 1;
const manifest = JSON.parse(src.slice(start, end));
for (const [id, v] of Object.entries(manifest)) {
  const doc = await io.read(`public/models/vehicles/${id}.glb`);
  // `"wheels": false` in vehicle-fixes.json: keep the wheels still (the guess was wrong).
  v.wheels = fixes[id]?.wheels === false ? null : findWheels(doc, v.bike, v.height);
  console.log(id.padEnd(16), v.wheels ? v.wheels.map((w) => `[${w.join(', ')}]`).join(' ') : 'no wheels found');
}
let head = src.slice(0, start);
if (!head.includes('wheels')) head = head.replace('  seat: [number, number, number];', '  seat: [number, number, number];\n  /** [x, y, z, radius, halfWidth] per wheel (cars fl, fr, rl, rr; bikes front, rear), or null. */\n  wheels: [number, number, number, number, number][] | null;');
writeFileSync(FILE, head + JSON.stringify(manifest, null, 2) + src.slice(end));
