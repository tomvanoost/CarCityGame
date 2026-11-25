// Writes the Sketchfab city credits into CREDITS.md (between markers).
import { readFileSync, writeFileSync } from 'node:fs';
const picks = JSON.parse(readFileSync('assets-src/sketchfab/picks-city.json', 'utf8'));
const manifest = JSON.parse(readFileSync('assets-src/sketchfab/manifest-city.json', 'utf8'));
const fixes = JSON.parse(readFileSync('scripts/city-fixes.json', 'utf8'));
const used = Object.keys(manifest).map((id) => { const p = picks[id]; return `| ${p.category} | [${p.name}](${p.url}) | [${p.author}](${p.authorUrl}) | ${p.license} | "${p.query}" #${p.rank} |`; });
const skipped = Object.entries(fixes).filter(([, f]) => f.skip).map(([id, f]) => `- "${picks[id]?.name}" ("${picks[id]?.query}" #${picks[id]?.rank}): ${f.skip}`);
const block = `<!-- sketchfab-city:start -->
## Buildings and trees (Sketchfab)
Houses, townhouses, shops, apartments, trees, pines and bushes come from Sketchfab (downloadable,
first usable results per search term), modified for the game (\`scripts/build-city-sf.mjs\`).
Office towers downtown, roads, street lights and small props stay built-in / CC0.

| Category | Model | Author | License | Search (rank) |
|---|---|---|---|---|
${used.join('\n')}

Skipped results (and why):
${skipped.join('\n')}
<!-- sketchfab-city:end -->`;
let c = readFileSync('CREDITS.md', 'utf8');
c = c.includes('<!-- sketchfab-city:start -->') ? c.replace(/<!-- sketchfab-city:start -->[\s\S]*<!-- sketchfab-city:end -->/, block) : c.replace('\n## Rebuilding the models', `\n${block}\n\n## Rebuilding the models`);
writeFileSync('CREDITS.md', c);
console.log('city credits:', used.length, 'used,', skipped.length, 'skipped');
