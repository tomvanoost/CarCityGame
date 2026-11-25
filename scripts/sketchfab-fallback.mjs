// For vehicles without a usable first result: show why, then retry without the year.
import { readFileSync, writeFileSync } from 'node:fs';
const OK = new Set(['cc0', 'by', 'by-sa', 'by-nc', 'by-nc-sa']);
const picks = JSON.parse(readFileSync('assets-src/sketchfab/picks.json', 'utf8'));
const search = async (q) => (await (await fetch(`https://api.sketchfab.com/v3/search?type=models&downloadable=true&count=24&q=${encodeURIComponent(q)}`)).json()).results ?? [];
for (const [id, p] of Object.entries(picks)) {
  if (!p.none) continue;
  const first = await search(p.query);
  const why = [];
  for (const r of first.slice(0, 3)) {
    const det = await (await fetch(`https://api.sketchfab.com/v3/models/${r.uid}`)).json();
    why.push(`${r.name} [${det.license?.label ?? '?'}]`);
  }
  const q2 = p.query.replace(/^\d{4}\s+/, '');
  const results = await search(q2);
  let m = null, rank = 0;
  for (let i = 0; i < Math.min(results.length, 12); i++) {
    const det = await (await fetch(`https://api.sketchfab.com/v3/models/${results[i].uid}`)).json();
    if (OK.has(det.license?.slug)) { m = det; rank = i + 1; break; }
  }
  console.log(`${id.padEnd(12)} "${p.query}": ${first.length} results ${why.length ? '(' + why.join('; ') + ')' : ''}`);
  if (m) {
    picks[id] = { query: q2, originalQuery: p.query, rank, skipped: [], uid: m.uid, name: m.name, author: m.user?.displayName || m.user?.username,
      authorUrl: m.user?.profileUrl, license: m.license?.label, licenseSlug: m.license?.slug, url: m.viewerUrl, faces: m.faceCount, archives: m.archives };
    console.log(`   -> "${q2}" #${rank}: ${m.name} | ${m.license?.label} | ${m.faceCount} faces`);
  } else console.log(`   -> "${q2}": still nothing usable`);
}
writeFileSync('assets-src/sketchfab/picks.json', JSON.stringify(picks, null, 2));
