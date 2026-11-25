// Turns processed vehicles 180° around Y (front <-> back) without the raw Sketchfab files.
// Usage: node scripts/flip-vehicles.mjs <id> [id ...]
// Adds a rotated parent node to each scene root of public/models/vehicles/<id>.glb and
// <id>_lod.glb. Also add `"rotate": 180` for the id in scripts/vehicle-fixes.json so a
// full rebuild (scripts/build-vehicles.mjs) gives the same result.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';

await MeshoptDecoder.ready;
await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder, 'meshopt.encoder': MeshoptEncoder });

for (const id of process.argv.slice(2)) {
  for (const file of [`public/models/vehicles/${id}.glb`, `public/models/vehicles/${id}_lod.glb`]) {
    const doc = await io.read(file);
    for (const scene of doc.getRoot().listScenes()) {
      const pivot = doc.createNode('CCG_FLIP').setRotation([0, 1, 0, 0]); // 180° around Y
      for (const child of scene.listChildren()) { scene.removeChild(child); pivot.addChild(child); }
      scene.addChild(pivot);
    }
    await io.write(file, doc);
    console.log('flipped', file);
  }
}
