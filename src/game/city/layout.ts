import { APARTMENTS, BUSHES, HOUSES, PINES, SHOPS, TOWNHOUSES, TREES } from './models';
import { Rng } from './rng';
import { BALLOON, BIG_DUNE, BRIDGE, DESERT, HIGHWAYS, FIREWORKS, FLOAT_STAND, FOOTBRIDGE, JETTY, LAKE, LAKE_TOWN, PETTING, STREAM, WORLD_EDGE, RACE, desertAmount, inDesertTown, noTrees, onOutRoad, raceDistance } from './outskirts';
import { buildingCollider, generateTowns, type TownsData } from './towns';

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
/** Wide avenues (every other grid line, 3 lanes each way + a median) are this half wide; small roads ROAD_WIDTH / 2. */
export const WIDE_HALF = 11;
/** Is grid line i a wide avenue? (The odd lines; the outer lines 0 and GRID_BLOCKS stay small roads.) */
export const isWideLine = (i: number) => i % 2 === 1;
/** Half width of the road on grid line i. */
export const roadHalf = (i: number) => (isWideLine(i) ? WIDE_HALF : ROAD_WIDTH / 2);
/** Lane centers on a wide avenue, measured from its middle: left-turn, straight, right-turn lane. */
export const WIDE_LANES = [2.67, 6, 9.33];
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
export interface Collider {
  x0: number; z0: number; x1: number; z1: number;
  /** Small things (trees, lamp posts, traffic lights) that a fast car knocks over instead of stopping at. */
  knock?: 'tree' | 'metal';
  /** Knocked over right now: no collision until it's back up. */
  off?: boolean;
  /** Lake / stream: blocks cars and people, but not the camera. */
  water?: boolean;
}

export interface CityLayout {
  blocks: Block[];
  buildings: Placement[];
  towers: Tower[];
  nature: Placement[];
  props: Placement[];
  colliders: Collider[];
  park: { rect: Rect; pond: { x: number; z: number; r: number }; fountain: { x: number; z: number } };
  gas: { rect: Rect; canopy: Rect; pumps: { x: number; z: number }[]; shop: Placement; /** Drive-through car wash (inside, along X). */ wash: Rect };
  /** Desert decorations (cacti and rocks), outside the city. */
  desert: { cacti: { x: number; z: number; s: number; rot: number }[]; rocks: { x: number; z: number; s: number; rot: number }[] };
  /** The desert town, the lake town and the farmland (see towns.ts). */
  towns: TownsData;
  pois: {
    spawn: { x: number; z: number; rot: number };
    gasStation: { x: number; z: number };
    home: { x: number; z: number; door: { x: number; z: number } };
    apartment: { x: number; z: number; door: { x: number; z: number } };
    /** Ice cream stand in the park: where it stands, and the spot in front of its counter (+Z side). */
    iceCream: { x: number; z: number; front: { x: number; z: number } };
    /** Post office stand in the park, opposite the ice cream stand (the treasure map). */
    postOffice: { x: number; z: number; front: { x: number; z: number } };
    /** Supermarket on a shops block near home: building middle, its entrance (+Z side), the parking lot. */
    supermarket: { x: number; z: number; w: number; d: number; front: { x: number; z: number }; parking: Rect };
    /** Pet shop next to the supermarket (front = +Z). */
    petShop: { x: number; z: number; front: { x: number; z: number } };
    /** Fun fair in the park's north-west corner: a Ferris wheel (axle along Z) and a carousel; `front` = where you board. */
    funFair: {
      wheel: { x: number; z: number; front: { x: number; z: number } };
      carousel: { x: number; z: number; front: { x: number; z: number } };
    };
    /**
     * Bus route: the depot (index 0) and 5 stops in a loop around downtown. `x/z` = the shelter on the
     * sidewalk, `stop` = where the car stops on the road next to it, `rot` = the shelter's front (towards the road).
     */
    busStops: { x: number; z: number; rot: number; stop: { x: number; z: number } }[];
    /** Bakery on the lake town square (turned by `rot`; `front` = the spot by its door). */
    bakery: { x: number; z: number; rot: number; front: { x: number; z: number } };
    /** Pizzeria kiosk at the front corner of the supermarket parking lot (counter = +Z, towards the road). */
    pizzeria: { x: number; z: number; front: { x: number; z: number } };
    /** Paint shop garage on the other side of the supermarket (door = +Z); drive up to `front`. */
    paintShop: { x: number; z: number; front: { x: number; z: number } };
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
    park: null!, gas: null!, pois: null!, desert: { cacti: [], rocks: [] }, towns: null!,
  };

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
      const slab = { x0: LINES[bx] + roadHalf(bx), z0: LINES[bz] + roadHalf(bz), x1: LINES[bx1] - roadHalf(bx1), z1: LINES[bz1] - roadHalf(bz1) };
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
    L.colliders.push({ x0: x - 0.4, z0: z - 0.4, x1: x + 0.4, z1: z + 0.4, knock: 'tree' });
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
        // Car wash: a 12 m tunnel between the canopy and the shops, open at both ends (drive through along X).
        const wz = r.z1 - 39.5;
        const wash = { x0: r.x0 + 12, z0: wz - 2.6, x1: r.x0 + 24, z1: wz + 2.6 };
        L.colliders.push({ x0: wash.x0, z0: wash.z0 - 0.5, x1: wash.x1, z1: wash.z0 }, { x0: wash.x0, z0: wash.z1, x1: wash.x1, z1: wash.z1 + 0.5 });
        L.gas = { rect: { x0: r.x0, z0: r.z1 - 44, x1: r.x0 + 60, z1: r.z1 }, canopy, pumps, shop, wash };
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
          L.colliders.push({ x0: x - 0.2, z0: z - 0.2, x1: x + 0.2, z1: z + 0.2, knock: 'metal' });
        } else if (b.district !== 'gas' || k % 3 === 0) {
          addTree(x, z, undefined, rng.range(0.75, 0.95));
        }
      }
    }
  }

  // (Traffic lights are real now: see play/trafficLights.ts.)

  // ---------- forest ring outside the city (kept off the roads out, the lake and the desert) ----------
  const inner = HALF_CITY + ROAD_WIDTH / 2 + 18, outer = 760;
  const tree = (px: number, pz: number, scale: number) => {
    L.nature.push({ model: rng.chance(0.45) ? rng.pick(PINES) : rng.pick(TREES), x: px, z: pz, rot: rng.range(0, 6.28), scale });
    L.colliders.push({ x0: px - 0.5, z0: pz - 0.5, x1: px + 0.5, z1: pz + 0.5, knock: 'tree' });
  };
  for (let x = -outer; x <= outer; x += 20) {
    for (let z = -outer; z <= outer; z += 20) {
      if (Math.max(Math.abs(x), Math.abs(z)) < inner) continue;
      if (!rng.chance(0.55)) continue;
      const px = x + rng.range(-8, 8), pz = z + rng.range(-8, 8);
      const small = rng.chance(0.12);
      if (noTrees(px, pz)) continue;
      if (small) addSmall(px, pz, rng.chance(0.5) ? rng.pick(BUSHES) : rng.pick(['Rock_Moss_1', 'Rock_Moss_2']), 2);
      else tree(px, pz, rng.range(1, 1.5));
    }
  }
  // Countryside further out: open meadows with a tree here and there.
  for (let x = -WORLD_EDGE; x <= WORLD_EDGE; x += 30) {
    for (let z = -WORLD_EDGE; z <= WORLD_EDGE; z += 30) {
      if (Math.max(Math.abs(x), Math.abs(z)) <= outer + 10) continue;
      if (!rng.chance(0.22)) continue;
      const px = x + rng.range(-12, 12), pz = z + rng.range(-12, 12);
      if (noTrees(px, pz) || Math.max(Math.abs(px), Math.abs(pz)) > WORLD_EDGE - 10) continue;
      tree(px, pz, rng.range(1, 1.5));
    }
  }

  // ---------- desert: cacti and rocks (not on the road; filtered off the big dune afterwards, so the
  // random sequence for everything else stays the same) ----------
  for (let i = 0; i < 260; i++) {
    const x = rng.range(DESERT.x0 + 60, DESERT.x1 - 20), z = rng.range(DESERT.z0 + 30, DESERT.z1 - 30);
    if (onOutRoad(x, z, 8) || desertAmount(x, z) < 0.6 || inDesertTown(x, z, 25) || raceDistance(x, z) < RACE.half + 10 || Math.hypot(x - BALLOON.x, z - BALLOON.z) < BALLOON.r + 12) continue;
    if (rng.chance(0.55)) {
      const s2 = rng.range(0.8, 1.4);
      L.desert.cacti.push({ x, z, s: s2, rot: rng.range(0, 6.28) });
      L.colliders.push({ x0: x - 0.45 * s2, z0: z - 0.45 * s2, x1: x + 0.45 * s2, z1: z + 0.45 * s2 });
    } else {
      const s2 = rng.range(0.6, 2.6);
      L.desert.rocks.push({ x, z, s: s2, rot: rng.range(0, 6.28) });
      if (s2 > 1.1) L.colliders.push({ x0: x - 0.8 * s2, z0: z - 0.8 * s2, x1: x + 0.8 * s2, z1: z + 0.8 * s2 });
    }
  }
  // The big sandboard dune stays clear (the slide, the rope tow and the stand).
  const onBigDune = (x: number, z: number) => Math.hypot(x - BIG_DUNE.x, z - BIG_DUNE.z) < BIG_DUNE.r + 25;
  L.desert.cacti = L.desert.cacti.filter((c) => !onBigDune(c.x, c.z));
  L.desert.rocks = L.desert.rocks.filter((c) => !onBigDune(c.x, c.z));
  L.colliders = L.colliders.filter((c) => !onBigDune((c.x0 + c.x1) / 2, (c.z0 + c.z1) / 2));
  // The sandboard rental stand at the foot of the dune (see SANDBOARD_STAND in play/sandboard.ts).
  const sbX = BIG_DUNE.x - 9, sbZ = BIG_DUNE.z - BIG_DUNE.r - 6;
  L.colliders.push({ x0: sbX - 1.6, z0: sbZ - 1.1, x1: sbX + 2.1, z1: sbZ + 1.1 });

  // ---------- towns and farmland outside the city ----------
  const T = generateTowns(rng);
  L.towns = T;
  for (const b of T.buildings) L.colliders.push(buildingCollider(b));
  for (const w of T.windmills) L.colliders.push({ x0: w.x - 2.6, z0: w.z - 2.6, x1: w.x + 2.6, z1: w.z + 2.6 });
  for (const b of T.bales) L.colliders.push({ x0: b.x - 0.7, z0: b.z - 0.7, x1: b.x + 0.7, z1: b.z + 0.7 });
  for (const p of T.palms) L.colliders.push({ x0: p.x - 0.3, z0: p.z - 0.3, x1: p.x + 0.3, z1: p.z + 0.3 });
  const well = T.plaza.well;
  L.colliders.push({ x0: well.x - 1.4, z0: well.z - 1.4, x1: well.x + 1.4, z1: well.z + 1.4 });
  for (const t of T.trees) {
    L.nature.push({ model: rng.pick(TREES), x: t.x, z: t.z, rot: rng.range(0, 6.28), scale: rng.range(0.85, 1.15) });
    L.colliders.push({ x0: t.x - 0.4, z0: t.z - 0.4, x1: t.x + 0.4, z1: t.z + 0.4, knock: 'tree' });
  }

  // ---------- water: the lake (in bands, with a gap for the bridge) and the stream ----------
  for (let z = LAKE.z - LAKE.rz; z < LAKE.z + LAKE.rz; z += 6) {
    // Widest point of this band (the band's edge nearest the middle).
    const dz = Math.max(0, Math.min(Math.abs(z - LAKE.z), Math.abs(z + 6 - LAKE.z)) - 0.01);
    const w = LAKE.rx * Math.sqrt(Math.max(0, 1 - (dz / LAKE.rz) ** 2)) - 1.5;
    if (w <= 0) continue;
    const gap = BRIDGE.half + 0.5;
    if (w > gap) {
      L.colliders.push({ x0: LAKE.x - w, z0: z, x1: LAKE.x - gap, z1: z + 6, water: true });
      L.colliders.push({ x0: LAKE.x + gap, z0: z, x1: LAKE.x + w, z1: z + 6, water: true });
    }
  }
  // The fireworks stand on the north beach of the lake (east of the jetty).
  L.colliders.push({ x0: FIREWORKS.x - 1.3, z0: FIREWORKS.z - 0.8, x1: FIREWORKS.x + 1.3, z1: FIREWORKS.z + 0.8 });
  // The float stand's crate on the beach.
  L.colliders.push({ x0: FLOAT_STAND.x + 0.1, z0: FLOAT_STAND.z + 0.05, x1: FLOAT_STAND.x + 1.5, z1: FLOAT_STAND.z + 0.8 });
  // Highway medians: the guardrail between the two directions (cars can't drive through it).
  for (const r of HIGHWAYS) {
    const len = Math.hypot(r.bx - r.ax, r.bz - r.az), dx = (r.bx - r.ax) / len, dz = (r.bz - r.az) / len;
    const step = Math.abs(dx) < 0.01 || Math.abs(dz) < 0.01 ? 20 : 1.5;
    for (let s = 14; s < len - 14; s += step) {
      const e = Math.min(len - 14, s + step), x0 = r.ax + dx * s, z0 = r.az + dz * s, x1 = r.ax + dx * e, z1 = r.az + dz * e;
      L.colliders.push({ x0: Math.min(x0, x1) - 0.25, z0: Math.min(z0, z1) - 0.25, x1: Math.max(x0, x1) + 0.25, z1: Math.max(z0, z1) + 0.25 });
    }
  }
  // The balloon basket on its launch pad.
  L.colliders.push({ x0: BALLOON.x - 0.9, z0: BALLOON.z - 0.9, x1: BALLOON.x + 0.9, z1: BALLOON.z + 0.9 });
  // The petting farm: fence (with a gate gap on the road side), nothing else growing inside.
  {
    const P = PETTING, x0 = P.x - P.w / 2, x1 = P.x + P.w / 2, z0 = P.z - P.d / 2, z1 = P.z + P.d / 2, t = 0.25;
    const inside = (x: number, z: number) => x > x0 - 3 && x < x1 + 3 && z > z0 - 3 && z < z1 + 3;
    L.nature = L.nature.filter((n) => !inside(n.x, n.z));
    L.colliders = L.colliders.filter((c) => !inside((c.x0 + c.x1) / 2, (c.z0 + c.z1) / 2));
    L.colliders.push({ x0, z0: z0 - t, x1, z1: z0 + t }, { x0, z0: z1 - t, x1, z1: z1 + t }, { x0: x0 - t, z0, x1: x0 + t, z1 });
    L.colliders.push({ x0: x1 - t, z0, x1: x1 + t, z1: P.z - P.gate / 2 }, { x0: x1 - t, z0: P.z + P.gate / 2, x1: x1 + t, z1 });
  }
  // The fishing jetty: cut a walkway out of the water, with railings along its sides.
  {
    const jx0 = JETTY.x - JETTY.half, jx1 = JETTY.x + JETTY.half;
    L.colliders = L.colliders.flatMap((c) => {
      if (!c.water || c.x1 <= jx0 || c.x0 >= jx1 || c.z1 <= JETTY.z0 || c.z0 >= JETTY.z1 - 0.5) return [c];
      const out: Collider[] = [];
      if (c.x0 < jx0) out.push({ ...c, x1: jx0 });
      if (c.x1 > jx1) out.push({ ...c, x0: jx1 });
      if (c.z1 > JETTY.z1 - 0.5) out.push({ ...c, x0: Math.max(c.x0, jx0), x1: Math.min(c.x1, jx1), z0: JETTY.z1 - 0.5 });
      return out;
    });
  }
  // Bridge railings (you can't drive off the bridge).
  for (const side of [-1, 1]) {
    const x = BRIDGE.x + side * (BRIDGE.half + 0.2);
    L.colliders.push({ x0: x - 0.25, z0: BRIDGE.z0 + 12, x1: x + 0.25, z1: BRIDGE.z1 - 12 });
  }
  // Stream, with a narrow gap at the footbridge: people fit through, cars don't.
  const gapHalf = 0.8;
  L.colliders.push({ x0: STREAM.x0, z0: STREAM.z0, x1: STREAM.x1, z1: FOOTBRIDGE.z - gapHalf, water: true });
  L.colliders.push({ x0: STREAM.x0, z0: FOOTBRIDGE.z + gapHalf, x1: STREAM.x1, z1: STREAM.z1, water: true });

  // ---------- ice cream stand in the park, next to the fountain (on the grass, beside the paths) ----------
  const ic = { x: L.park.fountain.x + 10, z: L.park.fountain.z - 9 };
  // No trees or bushes inside or right next to the stand.
  const clear = (x: number, z: number) => Math.abs(x - ic.x) < 4.5 && Math.abs(z - ic.z) < 4.5;
  L.nature = L.nature.filter((n) => !clear(n.x, n.z));
  L.colliders = L.colliders.filter((c) => !(c.knock && clear((c.x0 + c.x1) / 2, (c.z0 + c.z1) / 2)));
  L.colliders.push({ x0: ic.x - 1.5, z0: ic.z - 1.1, x1: ic.x + 1.5, z1: ic.z + 1.1 });
  // The post office stand on the other side of the path.
  const po = { x: L.park.fountain.x - 10, z: L.park.fountain.z - 9 };
  const clearPo = (x: number, z: number) => Math.abs(x - po.x) < 5 && Math.abs(z - po.z) < 4.5;
  L.nature = L.nature.filter((n) => !clearPo(n.x, n.z));
  L.colliders = L.colliders.filter((c) => !(c.knock && clearPo((c.x0 + c.x1) / 2, (c.z0 + c.z1) / 2)));
  L.colliders.push({ x0: po.x - 1.5, z0: po.z - 1.1, x1: po.x + 2.2, z1: po.z + 1.1 });

  // ---------- bus stops: six blocks in a ring around the middle; a shelter on the sidewalk facing the road ----------
  const busStops: { x: number; z: number; rot: number; stop: { x: number; z: number } }[] = [];
  {
    const used = new Set<Block>();
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2 + 0.3, tx = Math.cos(a) * 230, tz = Math.sin(a) * 230;
      const b = L.blocks.filter((q) => !used.has(q) && q.district !== 'park' && q.district !== 'gas')
        .sort((p, q) => Math.hypot((p.slab.x0 + p.slab.x1) / 2 - tx, (p.slab.z0 + p.slab.z1) / 2 - tz) - Math.hypot((q.slab.x0 + q.slab.x1) / 2 - tx, (q.slab.z0 + q.slab.z1) / 2 - tz))[0];
      if (!b) continue;
      used.add(b);
      const s = b.slab, cx = (s.x0 + s.x1) / 2, cz = (s.z0 + s.z1) / 2;
      // The side of the block that faces away from the middle of the city (outward normal), with the shelter 2 m in.
      const sides = [
        { x: cx, z: s.z0 + 2, nx: 0, nz: -1 }, { x: cx, z: s.z1 - 2, nx: 0, nz: 1 },
        { x: s.x0 + 2, z: cz, nx: -1, nz: 0 }, { x: s.x1 - 2, z: cz, nx: 1, nz: 0 },
      ];
      const side = sides.sort((p, q) => (q.nx * cx + q.nz * cz) - (p.nx * cx + p.nz * cz))[0];
      // Keep the sidewalk around the shelter clear.
      const near = (x: number, z: number) => Math.hypot(x - side.x, z - side.z) < 3.5;
      L.nature = L.nature.filter((n) => !near(n.x, n.z));
      L.props = L.props.filter((n) => !near(n.x, n.z));
      L.colliders = L.colliders.filter((c) => !near((c.x0 + c.x1) / 2, (c.z0 + c.z1) / 2));
      const hw = side.nx ? 0.6 : 1.6, hd = side.nx ? 1.6 : 0.6;
      L.colliders.push({ x0: side.x - hw, z0: side.z - hd, x1: side.x + hw, z1: side.z + hd });
      busStops.push({ x: side.x, z: side.z, rot: Math.atan2(side.nx, side.nz), stop: { x: side.x + side.nx * 6, z: side.z + side.nz * 6 } });
    }
  }

  // ---------- bakery on the lake town square (north-west of the church, facing the north street) ----------
  const bkX = LAKE_TOWN.x - 22, bkZ = LAKE_TOWN.z - 22;
  L.colliders.push({ x0: bkX - 4.6, z0: bkZ - 3.6, x1: bkX + 4.6, z1: bkZ + 3.6 });
  const bakery = { x: bkX, z: bkZ, rot: 0, front: { x: bkX + 1.5, z: bkZ + 5.6 } };

  // ---------- fun fair in the park's north-west corner (away from the pond and the paths) ----------
  const pr = L.park.rect;
  const wheel = { x: pr.x0 + 32, z: pr.z0 + 30, front: { x: pr.x0 + 32, z: pr.z0 + 34.5 } };
  const carousel = { x: pr.x0 + 32, z: pr.z0 + 68, front: { x: pr.x0 + 42.5, z: pr.z0 + 68 } };
  const fair = (x: number, z: number) => x > pr.x0 + 10 && x < pr.x0 + 56 && z > pr.z0 + 14 && z < pr.z0 + 82;
  L.nature = L.nature.filter((n) => !fair(n.x, n.z));
  L.colliders = L.colliders.filter((c) => !(c.knock && fair((c.x0 + c.x1) / 2, (c.z0 + c.z1) / 2)));
  L.colliders.push({ x0: wheel.x - 3, z0: wheel.z - 2.5, x1: wheel.x + 3, z1: wheel.z + 2.5 });
  for (const s of [-1, 1]) L.colliders.push({ x0: wheel.x + s * 7 - 0.8, z0: wheel.z - 3.5, x1: wheel.x + s * 7 + 0.8, z1: wheel.z + 3.5 });
  L.colliders.push({ x0: carousel.x - 7.5, z0: carousel.z - 7.5, x1: carousel.x + 7.5, z1: carousel.z + 7.5 });
  const funFair = { wheel, carousel };

  // ---------- supermarket: on the shops block nearest to home (replaces that block's buildings) ----------
  const shopBlocks = L.blocks.filter((b) => b.district === 'shops');
  const sb = shopBlocks.sort((a, b) => Math.hypot(a.bx - HOME_BLOCK[0], a.bz - HOME_BLOCK[1]) - Math.hypot(b.bx - HOME_BLOCK[0], b.bz - HOME_BLOCK[1]))[0] ?? L.blocks[0];
  const lot = sb.lot;
  const inLot = (x: number, z: number) => x > lot.x0 && x < lot.x1 && z > lot.z0 && z < lot.z1;
  L.buildings = L.buildings.filter((b) => !inLot(b.x, b.z));
  L.nature = L.nature.filter((n) => !inLot(n.x, n.z));
  L.colliders = L.colliders.filter((c) => !inLot((c.x0 + c.x1) / 2, (c.z0 + c.z1) / 2));
  const smW = 34, smD = 24, smX = (lot.x0 + lot.x1) / 2, smZ = lot.z0 + 6 + smD / 2;
  L.colliders.push({ x0: smX - smW / 2, z0: smZ - smD / 2, x1: smX + smW / 2, z1: smZ + smD / 2 });
  // Pet shop in the free corner left of the supermarket.
  const psX = lot.x0 + 10, psZ = smZ + smD / 2 - 6;
  L.colliders.push({ x0: psX - 6, z0: psZ - 5, x1: psX + 6, z1: psZ + 5 });
  const petShop = { x: psX, z: psZ, front: { x: psX, z: psZ + 7 } };
  // Paint shop garage in the free corner right of the supermarket.
  const pgX = lot.x1 - 10, pgZ = psZ;
  L.colliders.push({ x0: pgX - 7, z0: pgZ - 5.5, x1: pgX + 7, z1: pgZ + 5.5 });
  const paintShop = { x: pgX, z: pgZ, front: { x: pgX, z: pgZ + 10 } };
  // Pizzeria kiosk at the front-left corner of the parking lot, facing the road.
  const pzX = lot.x0 + 9, pzZ = lot.z1 - 10;
  L.colliders.push({ x0: pzX - 3, z0: pzZ - 2.2, x1: pzX + 3, z1: pzZ + 2.2 });
  const pizzeria = { x: pzX, z: pzZ, front: { x: pzX, z: pzZ + 4.5 } };
  const supermarket = { x: smX, z: smZ, w: smW, d: smD, front: { x: smX, z: smZ + smD / 2 + 2 }, parking: { x0: lot.x0 + 4, z0: smZ + smD / 2 + 4, x1: lot.x1 - 4, z1: lot.z1 - 2 } };

  // ---------- points of interest ----------
  const gasC = { x: (L.gas.canopy.x0 + L.gas.canopy.x1) / 2, z: (L.gas.canopy.z0 + L.gas.canopy.z1) / 2 };
  L.pois = {
    // Start on the road next to your house, facing east.
    spawn: { x: homeLot!.x, z: LINES[HOME_BLOCK[1] + 1] + (isWideLine(HOME_BLOCK[1] + 1) ? WIDE_LANES[2] : 2.5), rot: Math.PI / 2 },
    gasStation: gasC,
    home: homeLot!,
    apartment: apartment!,
    iceCream: { x: ic.x, z: ic.z, front: { x: ic.x, z: ic.z + 2.4 } },
    postOffice: { x: po.x, z: po.z, front: { x: po.x, z: po.z + 2.4 } },
    supermarket,
    petShop,
    paintShop,
    pizzeria,
    funFair,
    bakery,
    busStops,
  };
  return L;
}

/** True if (x, z) is on a road (not on a block slab). */
export function isOnRoad(x: number, z: number): boolean {
  const near = (v: number) => {
    const i = Math.round((v + HALF_CITY) / BLOCK_SPACING);
    const k = Math.max(0, Math.min(GRID_BLOCKS, i));
    return Math.abs(v - LINES[k]) <= roadHalf(k);
  };
  return Math.abs(x) <= HALF_CITY + ROAD_WIDTH / 2 && Math.abs(z) <= HALF_CITY + ROAD_WIDTH / 2 && (near(x) || near(z));
}
