import { APARTMENTS, BUSHES, HOUSES, PINES, SHOPS, TOWNHOUSES, TREES } from './models';
import { Rng } from './rng';

/**
 * The city plan, as plain data. Deterministic: the same seed always gives the
 * same city, so places like the gas station and your house never move.
 *
 * World axes: X = east, Z = south, Y = up. Units: meters. Center = (0, 0).
 * Roads form a grid; between them are blocks (sidewalk ring + lot).
 */

export const GRID_BLOCKS = 10;
export const BLOCK_SPACING = 96;
export const ROAD_WIDTH = 10;
export const SIDEWALK = 4;
export const CURB_HEIGHT = 0.15;
export const HALF_CITY = (GRID_BLOCKS * BLOCK_SPACING) / 2; // 480
/** Road center lines (same for X and Z). */
export const LINES = Array.from({ length: GRID_BLOCKS + 1 }, (_, i) => -HALF_CITY + i * BLOCK_SPACING);

export type District = 'downtown' | 'townhouses' | 'shops' | 'apartments' | 'midrise' | 'residential' | 'park' | 'gas';

export interface Rect { x0: number; z0: number; x1: number; z1: number }

export interface Block {
  bx: number;
  bz: number;
  district: District;
  /** Raised slab incl. sidewalk. */
  slab: Rect;
  /** Buildable lot inside the sidewalk. */
  lot: Rect;
}

export interface Placement {
  model: string;
  x: number;
  z: number;
  /** Rotation around Y (radians). */
  rot: number;
  /** Extra uniform scale on top of the model's own scale. */
  scale: number;
  /** Wall color for recolorable (pack 3) buildings. */
  color?: string;
}

export interface Tower { x: number; z: number; w: number; d: number; h: number; color: string }

/** Axis-aligned box used for collisions (step 5). */
export interface Collider { x0: number; z0: number; x1: number; z1: number }

export interface CityLayout {
  blocks: Block[];
  buildings: Placement[];
  towers: Tower[];
  nature: Placement[];
  props: Placement[];
  colliders: Collider[];
  park: { rect: Rect; pond: { x: number; z: number; r: number }; fountain: { x: number; z: number } };
  gas: { rect: Rect; canopy: Rect; pumps: { x: number; z: number }[]; shop: Placement };
  /** Important places for gameplay. */
  pois: {
    spawn: { x: number; z: number; rot: number };
    gasStation: { x: number; z: number };
    home: { x: number; z: number; door: { x: number; z: number } };
    apartment: { x: number; z: number; door: { x: number; z: number } };
  };
  /** Paths inside the park (thin paved rectangles). */
  paths: Rect[];
}

export type Sizes = Map<string, { x: number; y: number; z: number }>;

const WALL_COLORS = ['#e8d5b0', '#d9a38a', '#b8cfe0', '#f0e6d2', '#c9e0c0', '#e6c3c3', '#f2d98c', '#c9b6d9'];
const TOWER_COLORS = ['#d8dde3', '#c7ccd4', '#e9e4da', '#b9c3cf', '#d6cfc4', '#a9b4c2', '#e2e6ea'];

const PARK_BLOCKS = [[7, 3], [8, 3], [7, 4], [8, 4]];
const GAS_BLOCK = [6, 7];
const HOME_BLOCK = [2, 6];
const APARTMENT_BLOCK = [6, 2];

const isPark = (bx: number, bz: number) => PARK_BLOCKS.some(([a, b]) => a === bx && b === bz);

export function generateCity(sizes: Sizes, seed = 2025): CityLayout {
  const rng = new Rng(seed);
  const L: CityLayout = {
    blocks: [], buildings: [], towers: [], nature: [], props: [], colliders: [], paths: [],
    park: null!, gas: null!, pois: null!,
  };
  const inset = ROAD_WIDTH / 2;

  // ---------- blocks & districts ----------
  for (let bx = 0; bx < GRID_BLOCKS; bx++) {
    for (let bz = 0; bz < GRID_BLOCKS; bz++) {
      if (isPark(bx, bz) && !(bx === 7 && bz === 3)) continue; // park = one merged block
      let district: District;
      const ring = Math.max(Math.abs(bx - 4.5), Math.abs(bz - 4.5));
      if (isPark(bx, bz)) district = 'park';
      else if (bx === GAS_BLOCK[0] && bz === GAS_BLOCK[1]) district = 'gas';
      else if (ring === 0.5) district = 'downtown';
      else if (ring === 1.5) district = rng.pick(['townhouses', 'townhouses', 'shops', 'apartments', 'midrise'] as const);
      else if (ring === 2.5) district = rng.pick(['apartments', 'residential', 'residential', 'townhouses', 'shops'] as const);
      else district = 'residential';
      if (bx === HOME_BLOCK[0] && bz === HOME_BLOCK[1]) district = 'residential';
      if (bx === APARTMENT_BLOCK[0] && bz === APARTMENT_BLOCK[1]) district = 'apartments';

      const bx1 = district === 'park' ? bx + 2 : bx + 1;
      const bz1 = district === 'park' ? bz + 2 : bz + 1;
      const slab = { x0: LINES[bx] + inset, z0: LINES[bz] + inset, x1: LINES[bx1] - inset, z1: LINES[bz1] - inset };
      const lot = { x0: slab.x0 + SIDEWALK, z0: slab.z0 + SIDEWALK, x1: slab.x1 - SIDEWALK, z1: slab.z1 - SIDEWALK };
      L.blocks.push({ bx, bz, district, slab, lot });
    }
  }

  const addBuilding = (p: Placement) => {
    L.buildings.push(p);
    const s = sizes.get(p.model)!;
    const turned = Math.abs(Math.sin(p.rot)) > 0.5;
    const hw = ((turned ? s.z : s.x) * p.scale) / 2, hd = ((turned ? s.x : s.z) * p.scale) / 2;
    L.colliders.push({ x0: p.x - hw, z0: p.z - hd, x1: p.x + hw, z1: p.z + hd });
  };
  const addTree = (x: number, z: number, model?: string, scale?: number) => {
    L.nature.push({ model: model ?? rng.pick(TREES), x, z, rot: rng.range(0, Math.PI * 2), scale: scale ?? rng.range(0.85, 1.2) });
    L.colliders.push({ x0: x - 0.4, z0: z - 0.4, x1: x + 0.4, z1: z + 0.4 });
  };
  const addSmall = (x: number, z: number, model: string, scale = 1) =>
    L.nature.push({ model, x, z, rot: rng.range(0, Math.PI * 2), scale: scale * rng.range(0.8, 1.2) });

  /**
   * The four sides of a lot. `along` runs along the side, `out` points to the road.
   * Front of a building (+Z) must face `out`, so rot = atan2(out.x, out.z).
   */
  const sides = (r: Rect) => [
    { ox: r.x0, oz: r.z1, ax: 1, az: 0, outX: 0, outZ: 1, len: r.x1 - r.x0 }, // south
    { ox: r.x1, oz: r.z0, ax: -1, az: 0, outX: 0, outZ: -1, len: r.x1 - r.x0 }, // north
    { ox: r.x1, oz: r.z1, ax: 0, az: -1, outX: 1, outZ: 0, len: r.z1 - r.z0 }, // east
    { ox: r.x0, oz: r.z0, ax: 0, az: 1, outX: -1, outZ: 0, len: r.z1 - r.z0 }, // west
  ];

  /** Lines a side with buildings from `pool`, like a city street. */
  const fillRow = (r: Rect, pool: readonly string[], opts: { corner: number; setback: number; gap: number; colored?: boolean; scale?: number }) => {
    for (const s of sides(r)) {
      let cursor = opts.corner;
      const end = s.len - opts.corner;
      while (cursor < end - 4) {
        const fits = pool.filter((m) => sizes.get(m)!.x * (opts.scale ?? 1) <= end - cursor);
        if (!fits.length) break;
        const model = rng.pick(fits);
        const sz = sizes.get(model)!;
        const w = sz.x * (opts.scale ?? 1), d = sz.z * (opts.scale ?? 1);
        const c = cursor + w / 2;
        const inward = opts.setback + d / 2;
        addBuilding({
          model, scale: opts.scale ?? 1,
          x: s.ox + s.ax * c - s.outX * inward,
          z: s.oz + s.az * c - s.outZ * inward,
          rot: Math.atan2(s.outX, s.outZ),
          color: opts.colored ? rng.pick(WALL_COLORS) : undefined,
        });
        cursor += w + opts.gap;
      }
    }
  };

  const courtyardTrees = (r: Rect, margin: number, count: number) => {
    for (let i = 0; i < count; i++) addTree(rng.range(r.x0 + margin, r.x1 - margin), rng.range(r.z0 + margin, r.z1 - margin));
  };

  const towersIn = (r: Rect, minH: number, maxH: number) => {
    const mx = (r.x0 + r.x1) / 2, mz = (r.z0 + r.z1) / 2;
    const quads = [[r.x0, r.z0, mx, mz], [mx, r.z0, r.x1, mz], [r.x0, mz, mx, r.z1], [mx, mz, r.x1, r.z1]];
    let plazas = 0;
    for (const [x0, z0, x1, z1] of quads) {
      if (plazas === 0 && rng.chance(0.22)) {
        plazas++;
        for (let i = 0; i < 4; i++) addTree(rng.range(x0 + 6, x1 - 6), rng.range(z0 + 6, z1 - 6));
        continue;
      }
      const w = rng.range(18, x1 - x0 - 6), d = rng.range(18, z1 - z0 - 6);
      const x = (x0 + x1) / 2 + rng.range(-1.5, 1.5), z = (z0 + z1) / 2 + rng.range(-1.5, 1.5);
      const h = Math.round(rng.range(minH, maxH) / 3.6) * 3.6 + 1.2;
      L.towers.push({ x, z, w, d, h, color: rng.pick(TOWER_COLORS) });
      // +1 m for the podium around the tower base.
      L.colliders.push({ x0: x - w / 2 - 1, z0: z - d / 2 - 1, x1: x + w / 2 + 1, z1: z + d / 2 + 1 });
    }
  };

  let homeLot: { x: number; z: number; door: { x: number; z: number } } | null = null;
  let apartment: { x: number; z: number; door: { x: number; z: number } } | null = null;

  for (const b of L.blocks) {
    const r = b.lot;
    const center = Math.max(Math.abs(b.bx - 4.5), Math.abs(b.bz - 4.5)) === 0.5;
    switch (b.district) {
      case 'downtown':
        towersIn(r, center ? 40 : 30, center ? 95 : 70);
        break;
      case 'midrise':
        towersIn(r, 14, 30);
        break;
      case 'townhouses':
        fillRow(r, TOWNHOUSES, { corner: 2, setback: 0.5, gap: 0.2 });
        courtyardTrees(r, 18, 6);
        break;
      case 'shops':
        fillRow(r, SHOPS, { corner: 3, setback: 1, gap: 0.6, colored: true });
        courtyardTrees(r, 16, 5);
        break;
      case 'apartments': {
        const before = L.buildings.length;
        fillRow(r, APARTMENTS, { corner: 3, setback: 1.5, gap: 1.5, colored: true });
        courtyardTrees(r, 16, 7);
        if (b.bx === APARTMENT_BLOCK[0] && b.bz === APARTMENT_BLOCK[1]) {
          // The tallest building in this block becomes "your apartment".
          const mine = L.buildings.slice(before).reduce((a, c) => (sizes.get(c.model)!.y > sizes.get(a.model)!.y ? c : a));
          const d = sizes.get(mine.model)!.z / 2 + 1.5;
          apartment = { x: mine.x, z: mine.z, door: { x: mine.x + Math.sin(mine.rot) * d, z: mine.z + Math.cos(mine.rot) * d } };
        }
        break;
      }
      case 'residential': {
        // North/south sides: 4 lots along the full length; east/west: 2 lots in the middle.
        for (const s of sides(r)) {
          const ns = s.az === 0;
          const n = ns ? 4 : 2;
          const start = ns ? 0 : 21;
          const lotW = (s.len - (ns ? 0 : 42)) / n;
          for (let i = 0; i < n; i++) {
            const c = start + lotW * (i + 0.5);
            const model = rng.pick(HOUSES);
            const sz = sizes.get(model)!;
            const setback = 6;
            const inward = setback + sz.z / 2;
            const x = s.ox + s.ax * c - s.outX * inward, z = s.oz + s.az * c - s.outZ * inward;
            const rot = Math.atan2(s.outX, s.outZ);
            addBuilding({ model, x, z, rot, scale: 1, color: rng.pick(WALL_COLORS) });
            // Front garden: a bush or flowers; a tree beside the house.
            const gx = s.ox + s.ax * (c + lotW * 0.32) - s.outX * 2.5, gz = s.oz + s.az * (c + lotW * 0.32) - s.outZ * 2.5;
            addSmall(gx, gz, rng.chance(0.75) ? rng.pick(BUSHES) : 'Flowers', 1.2);
            if (rng.chance(0.7)) addTree(s.ox + s.ax * (c - lotW * 0.38) - s.outX * (setback + 4), s.oz + s.az * (c - lotW * 0.38) - s.outZ * (setback + 4));
            if (!homeLot && b.bx === HOME_BLOCK[0] && b.bz === HOME_BLOCK[1] && ns && i === 1) {
              homeLot = { x, z, door: { x: x + s.outX * (sz.z / 2 + 1.5), z: z + s.outZ * (sz.z / 2 + 1.5) } };
            }
          }
        }
        courtyardTrees(r, 24, 4);
        break;
      }
      case 'park': {
        const cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2;
        const pond = { x: cx + 28, z: cz - 24, r: 22 };
        const fountain = { x: cx - 20, z: cz + 18 };
        L.park = { rect: r, pond, fountain };
        L.colliders.push({ x0: pond.x - pond.r, z0: pond.z - pond.r, x1: pond.x + pond.r, z1: pond.z + pond.r });
        L.colliders.push({ x0: fountain.x - 4, z0: fountain.z - 4, x1: fountain.x + 4, z1: fountain.z + 4 });
        // Cross paths + a ring path.
        L.paths.push({ x0: r.x0, z0: fountain.z - 2, x1: r.x1, z1: fountain.z + 2 });
        L.paths.push({ x0: fountain.x - 2, z0: r.z0, x1: fountain.x + 2, z1: r.z1 });
        // Trees, avoiding pond and paths.
        for (let i = 0; i < 140; i++) {
          const x = rng.range(r.x0 + 4, r.x1 - 4), z = rng.range(r.z0 + 4, r.z1 - 4);
          if (Math.hypot(x - pond.x, z - pond.z) < pond.r + 6) continue;
          if (Math.abs(z - fountain.z) < 6 || Math.abs(x - fountain.x) < 6) continue;
          if (rng.chance(0.75)) addTree(x, z);
          else addSmall(x, z, rng.chance(0.6) ? rng.pick(BUSHES) : rng.pick(['Flowers', 'Rock_Moss_1', 'Rock_Moss_2']), 1.4);
        }
        for (let i = 0; i < 12; i++) {
          const a = rng.range(0, Math.PI * 2), d = rng.range(4, pond.r - 3);
          addSmall(pond.x + Math.cos(a) * d, pond.z + Math.sin(a) * d, 'Lilypad', 1.4);
        }
        for (let i = 0; i < 10; i++) {
          const a = (i / 10) * Math.PI * 2;
          addTree(pond.x + Math.cos(a) * (pond.r + 4), pond.z + Math.sin(a) * (pond.r + 4), undefined, 1.1);
        }
        break;
      }
      case 'gas': {
        // Gas station on the south-west corner, facing the road to the west.
        const canopy = { x0: r.x0 + 8, z0: r.z1 - 34, x1: r.x0 + 32, z1: r.z1 - 10 };
        const pumps = [0, 1, 2].flatMap((i) => [
          { x: canopy.x0 + 6 + i * 6, z: (canopy.z0 + canopy.z1) / 2 - 4 },
          { x: canopy.x0 + 6 + i * 6, z: (canopy.z0 + canopy.z1) / 2 + 4 },
        ]);
        const shop: Placement = { model: SHOPS[0], x: r.x0 + 48, z: r.z1 - 22, rot: -Math.PI / 2, scale: 1, color: '#f2f2f2' };
        addBuilding(shop);
        for (const p of pumps) L.colliders.push({ x0: p.x - 0.6, z0: p.z - 1, x1: p.x + 0.6, z1: p.z + 1 });
        L.gas = { rect: { x0: r.x0, z0: r.z1 - 44, x1: r.x0 + 60, z1: r.z1 }, canopy, pumps, shop };
        fillRow({ x0: r.x0, z0: r.z0, x1: r.x1, z1: r.z1 - 46 }, SHOPS, { corner: 3, setback: 1, gap: 1, colored: true });
        courtyardTrees({ x0: r.x0 + 62, z0: r.z1 - 44, x1: r.x1, z1: r.z1 }, 4, 5);
        break;
      }
    }

    // ---------- sidewalk trees & street lights ----------
    for (const s of sides(b.slab)) {
      const off = 1.3; // from the curb
      let k = 0;
      for (let d = 10; d < s.len - 8; d += 12, k++) {
        const x = s.ox + s.ax * d - s.outX * off, z = s.oz + s.az * d - s.outZ * off;
        if (k % 3 === 1) {
          L.props.push({ model: 'Streetlight_Single', x, z, rot: Math.atan2(s.outX, s.outZ), scale: 1 });
          L.colliders.push({ x0: x - 0.2, z0: z - 0.2, x1: x + 0.2, z1: z + 0.2 });
        } else if (b.district !== 'gas' || k % 3 === 0) {
          addTree(x, z, undefined, rng.range(0.75, 0.95));
        }
      }
    }
  }

  // ---------- traffic lights at inner-city crossings ----------
  for (let i = 2; i <= 8; i++) {
    for (let j = 2; j <= 8; j++) {
      if (isPark(i - 1, j - 1) && isPark(i, j)) continue;
      const cx = LINES[i], cz = LINES[j];
      const o = ROAD_WIDTH / 2 + 0.8;
      for (const [sx, sz] of [[1, 1], [-1, -1]]) {
        const x = cx + sx * o, z = cz + sz * o;
        L.props.push({ model: 'TrafficLight_2', x, z, rot: Math.atan2(-sx, -sz) + Math.PI / 4, scale: 1 });
        L.colliders.push({ x0: x - 0.2, z0: z - 0.2, x1: x + 0.2, z1: z + 0.2 });
      }
    }
  }

  // ---------- forest ring outside the city ----------
  const inner = HALF_CITY + ROAD_WIDTH / 2 + 18, outer = 760;
  for (let x = -outer; x <= outer; x += 20) {
    for (let z = -outer; z <= outer; z += 20) {
      if (Math.max(Math.abs(x), Math.abs(z)) < inner) continue;
      if (!rng.chance(0.55)) continue;
      const px = x + rng.range(-8, 8), pz = z + rng.range(-8, 8);
      if (rng.chance(0.12)) addSmall(px, pz, rng.chance(0.5) ? rng.pick(BUSHES) : rng.pick(['Rock_Moss_1', 'Rock_Moss_2']), 2);
      else {
        L.nature.push({ model: rng.chance(0.45) ? rng.pick(PINES) : rng.pick(TREES), x: px, z: pz, rot: rng.range(0, 6.28), scale: rng.range(1, 1.5) });
        L.colliders.push({ x0: px - 0.5, z0: pz - 0.5, x1: px + 0.5, z1: pz + 0.5 });
      }
    }
  }

  // ---------- points of interest ----------
  const gasC = { x: (L.gas.canopy.x0 + L.gas.canopy.x1) / 2, z: (L.gas.canopy.z0 + L.gas.canopy.z1) / 2 };
  L.pois = {
    // Start on the road next to your house, facing east.
    spawn: { x: homeLot!.x, z: LINES[HOME_BLOCK[1] + 1] + 2.5, rot: Math.PI / 2 },
    gasStation: gasC,
    home: homeLot!,
    apartment: apartment!,
  };
  return L;
}

/** True if (x, z) is on a road (not on a block slab). */
export function isOnRoad(x: number, z: number): boolean {
  const near = (v: number) => {
    const i = Math.round((v + HALF_CITY) / BLOCK_SPACING);
    return Math.abs(v - LINES[Math.max(0, Math.min(GRID_BLOCKS, i))]) <= ROAD_WIDTH / 2;
  };
  return Math.abs(x) <= HALF_CITY + ROAD_WIDTH / 2 && Math.abs(z) <= HALF_CITY + ROAD_WIDTH / 2 && (near(x) || near(z));
}
