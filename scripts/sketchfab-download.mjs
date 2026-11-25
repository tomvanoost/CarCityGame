// Downloads every picked model (glb, or zipped glTF as fallback) into assets-src/sketchfab/raw/.
// Asks for a fresh download link per model (links expire after a few minutes).
// Run with: NODE_USE_ENV_PROXY=1 node scripts/sketchfab-download.mjs [picks.json] [rawDir]
import { createWriteStream, existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { execFileSync } from 'node:child_process';

// Optional args: picks file and output folder (defaults: vehicles).
const PICKS = process.argv[2] ?? 'assets-src/sketchfab/picks.json';
const RAWDIR = process.argv[3] ?? 'assets-src/sketchfab/raw';
const picks = JSON.parse(readFileSync(PICKS, 'utf8'));
mkdirSync(RAWDIR, { recursive: true });
for (const [id, p] of Object.entries(picks)) {
  const glbPath = `${RAWDIR}/${id}.glb`, dir = `${RAWDIR}/${id}`;
  if (existsSync(glbPath) || existsSync(`${dir}/scene.gltf`)) { console.log(id, 'already downloaded'); continue; }
  let d = null;
  for (let tries = 0; tries < 4 && !(d?.glb || d?.gltf); tries++) {
    if (tries) await new Promise((r) => setTimeout(r, 5000 * tries));
    d = await (await fetch(`https://api.sketchfab.com/v3/models/${p.uid}/download`)).json();
  }
  if (!d?.glb && !d?.gltf) { console.log(id, 'NO DOWNLOAD', JSON.stringify(d).slice(0, 200)); continue; }
  const isGlb = !!d.glb, url = (d.glb ?? d.gltf).url;
  const out = isGlb ? glbPath : `${dir}.zip`;
  const res = await fetch(url);
  await pipeline(Readable.fromWeb(res.body), createWriteStream(out));
  if (!isGlb) {
    mkdirSync(dir, { recursive: true });
    execFileSync('unzip', ['-q', '-o', out, '-d', dir]);
  }
  console.log(id, isGlb ? 'glb' : 'gltf', (statSync(out).size / 1e6).toFixed(1), 'MB');
}
console.log('done');
