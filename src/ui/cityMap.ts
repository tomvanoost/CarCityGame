import type { CityLayout, District } from '../game/city/layout';
import type { MapState } from '../game/play/game';
import type { P, RoadGraph } from '../game/play/roads';
import { BALLOON, BRIDGE, DESERT, FIREWORKS, DESERT_TOWN, FARM, FOOTBRIDGE, LAKE, LAKE_TOWN, JETTY, OUT_ROADS, PATH, PETTING, RACE, STREAM, racePoints } from '../game/city/outskirts';

/** World extent shown on the maps: -E..E meters on both axes (city, desert, lake, countryside). */
const E = 2350;
/** What the big map shows: the city, the desert town (east), the lake town (south) and the farmland between. */
const VIEW = { x0: -560, x1: 2120, z0: -560, z1: 2020 };
/** Places outside the city, with an icon on both maps. */
const OUT_PLACES: [P, string, string][] = [
  [{ x: DESERT_TOWN.x, z: DESERT_TOWN.z }, '🏜️', '#d9a441'],
  [{ x: LAKE_TOWN.x, z: LAKE_TOWN.z }, '🏘️', '#e5484d'],
  [{ x: LAKE.x, z: LAKE.z }, '🌉', '#2f8bff'],
  [{ x: (FARM.x0 + FARM.x1) / 2, z: (FARM.z0 + FARM.z1) / 2 }, '🚜', '#16b862'],
  [{ x: RACE.access.x, z: RACE.z + RACE.rz + 30 }, '🏁', '#1c1d20'],
  [{ x: JETTY.x, z: JETTY.z0 - 14 }, '🎣', '#2f8bff'],
  [{ x: PETTING.x, z: PETTING.z }, '🐐', '#2fa84f'],
  [{ x: BALLOON.x, z: BALLOON.z }, '🎈', '#e5484d'],
  [{ x: FIREWORKS.x, z: FIREWORKS.z }, '🎆', '#9b5de5'],
];
/** Base map resolution: pixels per meter (the whole world must fit in a canvas tablets allow). */
const K = 0.7;

const BLOCK_COLORS: Record<District, string> = {
  downtown: '#d9d4cb', midrise: '#d9d4cb', shops: '#e8dfcf', townhouses: '#e6dccc',
  apartments: '#e3dccd', residential: '#e4ead2', park: '#a9d98a', gas: '#e8dfcf',
};

/** Draws the city once (roads, blocks, buildings, park) to a canvas. */
export function renderBaseMap(layout: CityLayout, roads: RoadGraph): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = E * 2 * K;
  const g = c.getContext('2d')!;
  const X = (x: number) => (x + E) * K;
  // Meadows, the forest ring around the city, the city ground.
  g.fillStyle = '#a6d486';
  g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = '#7fb865';
  g.fillRect(X(-760), X(-760), 1520 * K, 1520 * K);
  // Desert (sand, soft edge).
  for (let i = 0; i < 6; i++) {
    const m = 15 * i;
    g.fillStyle = `rgba(236, 216, 164, ${0.25 + i * 0.15})`;
    g.fillRect(X(DESERT.x0 + m), X(DESERT.z0 + m), (DESERT.x1 - DESERT.x0 - 2 * m) * K, (DESERT.z1 - DESERT.z0 - 2 * m) * K);
  }
  // Lake with a beach, and the stream.
  g.fillStyle = '#efe2bd';
  g.beginPath(); g.ellipse(X(LAKE.x), X(LAKE.z), (LAKE.rx + 10) * K, (LAKE.rz + 10) * K, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#6fb6ea';
  g.beginPath(); g.ellipse(X(LAKE.x), X(LAKE.z), LAKE.rx * K, LAKE.rz * K, 0, 0, Math.PI * 2); g.fill();
  g.fillRect(X(STREAM.x0), X(STREAM.z0), (STREAM.x1 - STREAM.x0) * K, (STREAM.z1 - STREAM.z0) * K);
  // Farmland fields, the desert town plaza, the lake town square.
  const CROP: Record<string, string> = { wheat: '#ecd97f', green: '#8cc46a', plowed: '#b9967a', tulips: '#f29bb5' };
  for (const f of layout.towns.fields) { g.fillStyle = CROP[f.crop]; g.fillRect(X(f.x0), X(f.z0), (f.x1 - f.x0) * K, (f.z1 - f.z0) * K); }
  const pl = layout.towns.plaza;
  g.fillStyle = '#e6d2ad'; g.fillRect(X(pl.x0), X(pl.z0), (pl.x1 - pl.x0) * K, (pl.z1 - pl.z0) * K);
  g.fillStyle = '#ddd5c6'; g.beginPath(); g.arc(X(LAKE_TOWN.x), X(LAKE_TOWN.z), LAKE_TOWN.square * K, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#9fcf7f';
  g.fillRect(X(-520), X(-520), 1040 * K, 1040 * K);
  for (const b of layout.blocks) {
    g.fillStyle = BLOCK_COLORS[b.district];
    g.fillRect(X(b.slab.x0), X(b.slab.z0), (b.slab.x1 - b.slab.x0) * K, (b.slab.z1 - b.slab.z0) * K);
  }
  const pk = layout.park;
  g.fillStyle = '#6fb6ea';
  g.beginPath(); g.arc(X(pk.pond.x), X(pk.pond.z), pk.pond.r * K, 0, Math.PI * 2); g.fill();
  // Buildings (big colliders only, not trees, lamps, railings or water), in the city and the towns.
  g.fillStyle = '#a99c86';
  g.strokeStyle = '#8c7f6a';
  g.lineWidth = Math.max(1, K);
  for (const b of layout.colliders) {
    const w = b.x1 - b.x0, d = b.z1 - b.z0;
    if ((w < 3 && d < 3) || b.water || Math.min(w, d) < 1) continue;
    if (Math.max(Math.abs(b.x0), Math.abs(b.z0)) < 520 && Math.max(Math.abs(b.x1), Math.abs(b.z1)) > 525) continue;
    g.fillRect(X(b.x0), X(b.z0), w * K, d * K);
    g.strokeRect(X(b.x0), X(b.z0), w * K, d * K);
  }
  const gas = layout.gas.rect;
  g.fillStyle = '#b9bcc0';
  g.fillRect(X(gas.x0), X(gas.z0), (gas.x1 - gas.x0) * K, (gas.z1 - gas.z0) * K);
  // Roads: casing + white surface, like a real map.
  g.lineCap = 'round';
  // Wide avenues are drawn wider than the small roads (each width in its own pass).
  for (const [extra, col] of [[3, '#b9b3a6'], [0, '#ffffff']] as const) {
    g.strokeStyle = col;
    for (const wide of [false, true]) {
      g.lineWidth = ((wide ? 22 : 10) + extra) * K;
      g.beginPath();
      for (const [a, b] of roads.navEdges) {
        const A = roads.nodes[a], B = roads.nodes[b];
        if (Math.max(Math.abs(A.x), Math.abs(A.z), Math.abs(B.x), Math.abs(B.z)) > 490) continue; // drawn below
        if ((roads.halfOf(a, b) > 6) !== wide) continue;
        g.moveTo(X(A.x), X(A.z));
        g.lineTo(X(B.x), X(B.z));
      }
      g.stroke();
    }
    g.lineWidth = (10 + extra) * K;
    g.beginPath();
    for (const r of OUT_ROADS) { g.moveTo(X(r.ax), X(r.az)); g.lineTo(X(r.bx), X(r.bz)); }
    g.moveTo(X(LAKE_TOWN.x + LAKE_TOWN.ring), X(LAKE_TOWN.z));
    g.arc(X(LAKE_TOWN.x), X(LAKE_TOWN.z), LAKE_TOWN.ring * K, 0, Math.PI * 2);
    g.stroke();
  }
  // The desert race track: a dirt loop with its access path.
  {
    const pts = racePoints();
    g.strokeStyle = '#a87a45'; g.lineWidth = RACE.half * 2 * K; g.lineJoin = 'round';
    g.beginPath();
    pts.forEach((p, i) => (i ? g.lineTo(X(p.x), X(p.z)) : g.moveTo(X(p.x), X(p.z))));
    g.closePath();
    g.moveTo(X(RACE.access.x), X(RACE.access.z0)); g.lineTo(X(pts[0].x), X(pts[0].z));
    g.stroke();
  }
  // The car bridge (grey edges over the water), the gravel path and the wooden footbridge.
  g.strokeStyle = '#7d8086'; g.lineWidth = 3 * K;
  for (const side of [-1, 1]) {
    g.beginPath(); g.moveTo(X(BRIDGE.x + side * 6.5), X(BRIDGE.z0 + 40)); g.lineTo(X(BRIDGE.x + side * 6.5), X(BRIDGE.z1 - 40)); g.stroke();
  }
  g.lineCap = 'butt';
  g.strokeStyle = '#e2d6bd'; g.lineWidth = 3 * K;
  g.beginPath(); g.moveTo(X(PATH.x0), X(PATH.z)); g.lineTo(X(PATH.x1), X(PATH.z)); g.stroke();
  g.strokeStyle = '#9a6a3c'; g.lineWidth = 4 * K;
  g.beginPath(); g.moveTo(X(FOOTBRIDGE.x0), X(FOOTBRIDGE.z)); g.lineTo(X(FOOTBRIDGE.x1), X(FOOTBRIDGE.z)); g.stroke();
  return c;
}

/** A white round badge with an emoji, centered at (x, y). */
function badge(g: CanvasRenderingContext2D, emoji: string, x: number, y: number, r: number, ring: string) {
  g.fillStyle = '#ffffff';
  g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  g.lineWidth = r * 0.18; g.strokeStyle = ring; g.stroke();
  g.font = `${r * 1.15}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(emoji, x, y + r * 0.06);
}

function playerArrow(g: CanvasRenderingContext2D, x: number, y: number, angle: number, s: number) {
  g.save();
  g.translate(x, y);
  g.rotate(angle);
  g.beginPath();
  g.moveTo(0, -s); g.lineTo(s * 0.75, s * 0.8); g.lineTo(0, s * 0.4); g.lineTo(-s * 0.75, s * 0.8); g.closePath();
  g.fillStyle = '#2f8bff'; g.fill();
  g.lineWidth = s * 0.22; g.strokeStyle = '#ffffff'; g.stroke();
  g.restore();
}

function drawRoute(g: CanvasRenderingContext2D, path: P[], toX: (p: P) => [number, number], width: number) {
  if (path.length < 2) return;
  g.lineCap = 'round'; g.lineJoin = 'round';
  for (const [w, col] of [[width + 3, '#ffffff'], [width, '#1fa7ff']] as const) {
    g.strokeStyle = col; g.lineWidth = w;
    g.beginPath();
    path.forEach((p, i) => { const [x, y] = toX(p); if (i) g.lineTo(x, y); else g.moveTo(x, y); });
    g.stroke();
  }
}

export interface MapPlaces { home: P; apartment: P; gas: P; iceCream: P; supermarket: P; petShop: P; paintShop: P; pizzeria: P; funFair: P; bakery: P; busDepot: P }

/** Small round map in the corner. It turns with you: forward is always up. */
export class Minimap {
  readonly el: HTMLCanvasElement;
  /** Name label shown when you hover over another player's dot. */
  readonly tip: HTMLDivElement;
  private size = 0;
  /** Other players' dots as drawn last time (CSS pixels), for hover and click. */
  private dots: { id: string; name: string; x: number; y: number }[] = [];

  /** onPlayer: a player's dot was clicked / tapped (navigate there). */
  constructor(private base: HTMLCanvasElement, private places: MapPlaces, onOpen: () => void, onPlayer?: (id: string) => void) {
    this.el = document.createElement('canvas');
    this.el.className = 'minimap';
    this.el.setAttribute('aria-label', 'map');
    this.tip = document.createElement('div');
    this.tip.className = 'minimap-tip';
    this.tip.hidden = true;
    const hit = (e: MouseEvent) => {
      const r = this.el.getBoundingClientRect();
      const x = e.clientX - r.left, y = e.clientY - r.top;
      let best: (typeof this.dots)[number] | null = null, bd = 13; // forgiving for fingers
      for (const d of this.dots) { const dd = Math.hypot(d.x - x, d.y - y); if (dd < bd) { bd = dd; best = d; } }
      return best;
    };
    this.el.addEventListener('click', (e) => {
      const d = onPlayer && hit(e);
      if (d) { onPlayer!(d.id); this.tip.hidden = true; } else onOpen();
    });
    this.el.addEventListener('pointermove', (e) => {
      const d = e.pointerType === 'mouse' ? hit(e) : null;
      this.tip.hidden = !d;
      this.el.style.cursor = d ? 'pointer' : '';
      if (d) {
        this.tip.textContent = d.name;
        this.tip.style.left = `${d.x}px`;
        this.tip.style.top = `${d.y}px`;
      }
    });
    this.el.addEventListener('pointerleave', () => { this.tip.hidden = true; });
  }

  draw(s: MapState) {
    const css = this.el.clientWidth;
    if (!css) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (this.size !== css) {
      this.size = css;
      this.el.width = this.el.height = Math.round(css * dpr);
    }
    const W = this.el.width, R = W / 2;
    const zoom = W / (260 * K); // ~260 m across
    const g = this.el.getContext('2d')!;
    g.clearRect(0, 0, W, W);
    g.save();
    g.beginPath(); g.arc(R, R, R, 0, Math.PI * 2); g.clip();
    // Rotate so the facing direction (sin h, cos h) in map space points up.
    const rot = -Math.PI / 2 - Math.atan2(Math.cos(s.heading), Math.sin(s.heading));
    g.translate(R, R);
    g.rotate(rot);
    g.scale(zoom, zoom);
    g.translate(-(s.x + E) * K, -(s.z + E) * K);
    g.drawImage(this.base, 0, 0);
    drawRoute(g, s.path, (p) => [(p.x + E) * K, (p.z + E) * K], 6 / zoom * dpr);
    g.restore();
    // Icons stay upright; far ones stick to the edge so you can see which way they are.
    const icon = (p: P | null, emoji: string, ring: string) => {
      if (!p) return;
      let dx = (p.x - s.x) * K * zoom, dy = (p.z - s.z) * K * zoom;
      const c = Math.cos(rot), sn = Math.sin(rot);
      [dx, dy] = [dx * c - dy * sn, dx * sn + dy * c];
      const d = Math.hypot(dx, dy), max = R - 17 * dpr; // stay inside the white ring
      const far = d > max;
      if (far) { dx *= max / d; dy *= max / d; }
      // Far away places: a smaller, see-through badge on the edge (only shows the direction).
      g.globalAlpha = far ? 0.8 : 1;
      badge(g, emoji, R + dx, R + dy, (far ? 7.5 : 10) * dpr, ring);
      g.globalAlpha = 1;
    };
    // Towns and places outside the city only when you're nearby (the minimap edge would get crowded).
    for (const [p, emoji, ring] of OUT_PLACES) if (Math.hypot(p.x - s.x, p.z - s.z) < 600) icon(p, emoji, ring);
    icon(this.places.gas, '⛽', '#e5484d');
    icon(this.places.iceCream, '🍦', '#ff6f91');
    icon(this.places.supermarket, '🛒', '#e5484d');
    icon(this.places.petShop, '🐾', '#2f9e6a');
    icon(this.places.paintShop, '🎨', '#8e5bd9');
    icon(this.places.pizzeria, '🍕', '#e5484d');
    icon(this.places.funFair, '🎡', '#1f6fe0');
    icon(this.places.bakery, '🥐', '#a8642f');
    icon(this.places.busDepot, '🚌', '#1f6fe0');
    icon(this.places.apartment, '🏢', '#8e5bd9');
    icon(this.places.home, '🏠', '#ff8a2b');
    icon(s.dest, '📍', '#16b862');
    icon(s.job, '⭐', '#16b862');
    // Other players: small yellow dots (on the edge when they're out of range).
    this.dots = [];
    const c = Math.cos(rot), sn = Math.sin(rot);
    for (const p of s.players) {
      let dx = (p.x - s.x) * K * zoom, dy = (p.z - s.z) * K * zoom;
      [dx, dy] = [dx * c - dy * sn, dx * sn + dy * c];
      const d = Math.hypot(dx, dy), max = R - 12 * dpr;
      if (d > max) { dx *= max / d; dy *= max / d; }
      const followed = s.following === p.id;
      g.beginPath();
      g.arc(R + dx, R + dy, (followed ? 6 : 4.5) * dpr, 0, Math.PI * 2);
      g.fillStyle = '#ffd21f';
      g.fill();
      g.lineWidth = (followed ? 2.5 : 1.5) * dpr;
      g.strokeStyle = followed ? '#16b862' : '#1d2b44';
      g.stroke();
      this.dots.push({ id: p.id, name: p.name, x: (R + dx) / dpr, y: (R + dy) / dpr });
    }
    playerArrow(g, R, R, 0, 9 * dpr);
    // Ring + "N" marker.
    g.lineWidth = 4 * dpr; g.strokeStyle = '#ffffff';
    g.beginPath(); g.arc(R, R, R - 2 * dpr, 0, Math.PI * 2); g.stroke();
    // North (world -Z, map (0, -1)) after rotation is (sin rot, -cos rot).
    const nx = R + Math.sin(rot) * (R - 10 * dpr);
    const ny = R - Math.cos(rot) * (R - 10 * dpr);
    g.fillStyle = '#1d2b44'; g.font = `900 ${11 * dpr}px Nunito, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('N', nx, ny);
  }
}

/** The big map: north up, tap to choose where to go. */
export class BigMap {
  readonly canvas: HTMLCanvasElement;
  private view = { scale: 1, ox: 0, oy: 0 };

  constructor(private base: HTMLCanvasElement, private places: MapPlaces, onPick: (p: P) => void) {
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'bigmap-canvas';
    this.canvas.addEventListener('click', (e) => {
      const r = this.canvas.getBoundingClientRect();
      const dpr = this.canvas.width / r.width;
      const px = (e.clientX - r.left) * dpr, py = (e.clientY - r.top) * dpr;
      const x = (px - this.view.ox) / this.view.scale / K - E, z = (py - this.view.oy) / this.view.scale / K - E;
      if (Math.abs(x) < E && Math.abs(z) < E) onPick({ x, z });
    });
  }

  draw(s: MapState) {
    const r = this.canvas.getBoundingClientRect();
    if (!r.width) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = Math.round(r.width * dpr), H = Math.round(r.height * dpr);
    if (this.canvas.width !== W || this.canvas.height !== H) { this.canvas.width = W; this.canvas.height = H; }
    const g = this.canvas.getContext('2d')!;
    // Show the city, the desert and the lake as large as possible.
    const vw = VIEW.x1 - VIEW.x0, vh = VIEW.z1 - VIEW.z0;
    const scale = Math.min(W / (vw * K), H / (vh * K));
    const cx = (VIEW.x0 + VIEW.x1) / 2, cz = (VIEW.z0 + VIEW.z1) / 2;
    this.view = { scale, ox: W / 2 - (cx + E) * K * scale, oy: H / 2 - (cz + E) * K * scale };
    g.fillStyle = '#7fb865';
    g.fillRect(0, 0, W, H);
    g.save();
    g.translate(this.view.ox, this.view.oy);
    g.scale(scale, scale);
    g.drawImage(this.base, 0, 0);
    drawRoute(g, s.path, (p) => [(p.x + E) * K, (p.z + E) * K], 7 / scale);
    g.restore();
    const at = (p: P): [number, number] => [this.view.ox + (p.x + E) * K * scale, this.view.oy + (p.z + E) * K * scale];
    const big = 16 * dpr;
    for (const [p, emoji, ring] of OUT_PLACES) badge(g, emoji, ...at(p), big, ring);
    badge(g, '⛽', ...at(this.places.gas), big, '#e5484d');
    badge(g, '🍦', ...at(this.places.iceCream), big, '#ff6f91');
    badge(g, '🛒', ...at(this.places.supermarket), big, '#e5484d');
    badge(g, '🐾', ...at(this.places.petShop), big, '#2f9e6a');
    badge(g, '🎨', ...at(this.places.paintShop), big, '#8e5bd9');
    badge(g, '🍕', ...at(this.places.pizzeria), big, '#e5484d');
    badge(g, '🎡', ...at(this.places.funFair), big, '#1f6fe0');
    badge(g, '🥐', ...at(this.places.bakery), big, '#a8642f');
    badge(g, '🚌', ...at(this.places.busDepot), big, '#1f6fe0');
    badge(g, '🏢', ...at(this.places.apartment), big, '#8e5bd9');
    badge(g, '🏠', ...at(this.places.home), big, '#ff8a2b');
    if (s.job) badge(g, '⭐', ...at(s.job), big, '#16b862');
    if (s.dest) badge(g, '📍', ...at(s.dest), big, '#16b862');
    const [px, py] = at(s);
    playerArrow(g, px, py, Math.atan2(Math.cos(s.heading), Math.sin(s.heading)) + Math.PI / 2, 12 * dpr);
  }
}
