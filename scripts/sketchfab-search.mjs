// Searches Sketchfab for each vehicle (downloadable only) and picks the FIRST result whose
// license allows modifying the model (needed to optimize it): CC0, CC-BY, CC-BY-SA, CC-BY-NC, CC-BY-NC-SA.
// The API token is added by the environment's network proxy (never stored in code).
// Writes assets-src/sketchfab/picks.json. Usage: node scripts/sketchfab-search.mjs
import { mkdirSync, writeFileSync } from 'node:fs';

export const QUERIES = {
  'golfo-2025': '2025 volkswagen golf',
  polino: '2024 volkswagen polo',
  cinque: '2024 fiat 500e',
  kuper: '2024 mini cooper se',
  klio: '2024 renault clio',
  yarus: '2024 toyota yaris',
  'teslo-modelo3': '2024 tesla model 3',
  seel: '2024 byd seal',
  'oudi-a4': '2024 audi a4',
  'beemer-3': '2024 bmw 3 series',
  'mersedez-c': '2024 mercedes c-class',
  taykan: '2024 porsche taycan',
  'modelo-y': '2024 tesla model y',
  'id-vier': '2024 volkswagen id.4',
  'atto-3': '2024 byd atto 3',
  'kio-ev6': '2024 kia ev6',
  'volvu-xc90': '2024 volvo xc90',
  'rangy-rover': '2024 range rover',
  'id-bus': '2024 volkswagen id. buzz',
  jiep: '2024 jeep wrangler',
  'porsha-911': '2024 porsche 911',
  korvet: '2024 chevrolet corvette',
  ferrara: '2024 ferrari f8 tributo',
  maxlaren: '2024 mclaren 720s',
  hurricano: '2024 lamborghini huracan',
  jessko: '2024 koenigsegg jesko',
  chirone: '2024 bugatti chiron',
  vespo: '2024 vespa primavera',
  'hondo-cbr': '2024 honda cbr650r',
  'kawa-z900': '2024 kawasaki z900',
  'yamaho-r1': '2024 yamaha r1',
  harly: '2024 harley davidson street glide',
  'beemer-gs': '2024 bmw r 1300 gs',
  dukati: '2024 ducati panigale v4',
};

const OK = new Set(['cc0', 'by', 'by-sa', 'by-nc', 'by-nc-sa']);
const picks = {};
for (const [id, q] of Object.entries(QUERIES)) {
  const url = `https://api.sketchfab.com/v3/search?type=models&downloadable=true&count=24&q=${encodeURIComponent(q)}`;
  const res = await fetch(url);
  const data = await res.json();
  const results = data.results ?? [];
  // Search results don't include the license: check each result's details, in order.
  let firstOk = -1, m = null;
  const skipped = [];
  for (let i = 0; i < Math.min(results.length, 12); i++) {
    const det = await (await fetch(`https://api.sketchfab.com/v3/models/${results[i].uid}`)).json();
    await new Promise((r) => setTimeout(r, 250));
    if (OK.has(det.license?.slug)) { firstOk = i; m = det; break; }
    skipped.push(`${results[i].name} (${det.license?.label ?? 'unknown license'})`);
  }
  picks[id] = m ? {
    query: q, rank: firstOk + 1, skipped,
    uid: m.uid, name: m.name, author: m.user?.displayName || m.user?.username, authorUrl: m.user?.profileUrl,
    license: m.license?.label, licenseSlug: m.license?.slug, url: m.viewerUrl, faces: m.faceCount, archives: m.archives,
  } : { query: q, rank: 0, none: true };
  const p = picks[id];
  console.log(`${id.padEnd(14)} ${q.padEnd(34)} ${p.none ? 'NO RESULT' : `#${p.rank} ${p.name.slice(0, 40).padEnd(40)} ${p.license.padEnd(22)} ${String(p.faces).padStart(8)} faces`}`);
  await new Promise((r) => setTimeout(r, 400));
}
mkdirSync('assets-src/sketchfab', { recursive: true });
writeFileSync('assets-src/sketchfab/picks.json', JSON.stringify(picks, null, 2));
