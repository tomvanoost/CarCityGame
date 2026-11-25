// Writes the Sketchfab vehicle credits into CREDITS.md (between the markers).
import { readFileSync, writeFileSync } from 'node:fs';
const picks = JSON.parse(readFileSync('assets-src/sketchfab/picks.json', 'utf8'));
const manifest = JSON.parse(readFileSync('assets-src/sketchfab/manifest.json', 'utf8'));
const lines = Object.keys(manifest).map((id) => {
  const p = picks[id];
  return `| ${id} | [${p.name}](${p.url}) | [${p.author}](${p.authorUrl}) | ${p.license} | "${p.query}" #${p.rank}${p.replaced ? ` (${p.replaced})` : ''} |`;
});
const block = `<!-- sketchfab-vehicles:start -->
## Vehicles (Sketchfab)
All vehicle models come from [Sketchfab](https://sketchfab.com) (downloadable models). They were
**modified** for the game: simplified, textures resized/compressed, re-oriented and re-scaled, and some
uncolored models were given colors (\`scripts/build-vehicles.mjs\`). In the game they have look-alike names.

- **CC Attribution (BY):** free to use with credit (below).
- **NonCommercial (NC):** only for non-commercial use — the game must stay free (no ads, no paid items).
- **ShareAlike (SA):** the modified models are shared under the same license.

| Game id | Model | Author | License | Search (rank) |
|---|---|---|---|---|
${lines.join('\n')}
<!-- sketchfab-vehicles:end -->`;
let credits = readFileSync('CREDITS.md', 'utf8');
if (credits.includes('<!-- sketchfab-vehicles:start -->')) credits = credits.replace(/<!-- sketchfab-vehicles:start -->[\s\S]*<!-- sketchfab-vehicles:end -->/, block);
else credits = credits.replace('\n## Rebuilding the models', `\n${block}\n\n## Rebuilding the models`);
writeFileSync('CREDITS.md', credits);
console.log('credits for', lines.length, 'vehicles');
