// Picks city models on Sketchfab: per category, the first N downloadable results whose license
// allows modifying, that are not too heavy and are a single object (not a pack/scene/city).
// Run with: NODE_USE_ENV_PROXY=1 node scripts/sketchfab-search-city.mjs
import { mkdirSync, writeFileSync } from 'node:fs';

export const CATEGORIES = {
  house: { q: 'dutch house', n: 4, maxFaces: 150000 },
  townhouse: { q: 'amsterdam canal house', n: 4, maxFaces: 150000 },
  shop: { q: 'shop building', n: 7, maxFaces: 150000 },
  apartment: { q: 'apartment building', n: 4, maxFaces: 200000 },
  tower: { q: 'skyscraper', n: 3, maxFaces: 200000 },
  tree: { q: 'tree', n: 9, maxFaces: 60000 },
  pine: { q: 'pine tree', n: 2, maxFaces: 60000 },
  bush: { q: 'bush', n: 2, maxFaces: 30000 },
};
const OK = new Set(['cc0', 'by', 'by-sa', 'by-nc', 'by-nc-sa']);
const NOT_SINGLE = /\b(pack|kit|collection|set|scene|city|town|village|street|district|environment|map|assets?|bundle|neighbou?rhood|block)\b/i;
const picks = {};
for (const [cat, { q, n, maxFaces }] of Object.entries(CATEGORIES)) {
  const url = `https://api.sketchfab.com/v3/search?type=models&downloadable=true&count=24&max_face_count=${maxFaces}&q=${encodeURIComponent(q)}`;
  const results = (await (await fetch(url)).json()).results ?? [];
  let k = 0;
  for (let i = 0; i < results.length && k < n; i++) {
    const r = results[i];
    if (NOT_SINGLE.test(r.name)) continue;
    const m = await (await fetch(`https://api.sketchfab.com/v3/models/${r.uid}`)).json();
    await new Promise((res) => setTimeout(res, 200));
    if (!OK.has(m.license?.slug)) continue;
    const id = `sf_${cat}_${++k}`;
    picks[id] = { category: cat, query: q, rank: i + 1, uid: m.uid, name: m.name, author: m.user?.displayName || m.user?.username,
      authorUrl: m.user?.profileUrl, license: m.license.label, licenseSlug: m.license.slug, url: m.viewerUrl, faces: m.faceCount };
    console.log(`${id.padEnd(15)} #${String(i + 1).padStart(2)} ${m.name.slice(0, 48).padEnd(48)} ${m.license.label.replace('CC Attribution', 'CC BY').padEnd(20)} ${String(m.faceCount).padStart(7)}`);
  }
}
mkdirSync('assets-src/sketchfab', { recursive: true });
writeFileSync('assets-src/sketchfab/picks-city.json', JSON.stringify(picks, null, 2));
