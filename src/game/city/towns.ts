import type { Rng } from './rng';
import { DESERT_TOWN, FARM, LAKE_TOWN, inLake, onOutRoad } from './outskirts';

/**
 * The two towns outside the city and the farmland, generated differently from the city grid:
 * - desert town: low adobe buildings along a main street and a cross street, a plaza with palms and
 *   a well, a water tower;
 * - lake town: Dutch gabled rowhouses facing a ring road (inside and outside it) and along the
 *   streets to a central square with a church;
 * - farmland: fields in rows (wheat, green, ploughed, tulip stripes), farmyards with a farmhouse,
 *   a red barn and a silo, windmills and hay bales.
 * Plain data (deterministic from the city seed); outskirtsBuilder.ts turns it into meshes.
 */

export type BuildingStyle = 'adobe' | 'gable' | 'church' | 'barn' | 'farmhouse' | 'silo' | 'watertower';

export interface TownBuilding {
  style: BuildingStyle;
  x: number; z: number;
  /** Width (along the front), depth, wall height (m). */
  w: number; d: number; h: number;
  /** Rotation around Y; the front faces +Z before rotating. */
  rot: number;
  color: string;
  roof: string;
  /** Adobe: a porch roof in front. */
  porch?: boolean;
}

export type Crop = 'wheat' | 'green' | 'plowed' | 'tulips';
export interface Field { x0: number; z0: number; x1: number; z1: number; crop: Crop; alongX: boolean }

export interface TownsData {
  buildings: TownBuilding[];
  fields: Field[];
  windmills: { x: number; z: number; rot: number }[];
  bales: { x: number; z: number; rot: number }[];
  palms: { x: number; z: number; s: number }[];
  /** Spots for ordinary trees (added to the city's nature, drawn with the other trees). */
  trees: { x: number; z: number }[];
  /** Desert town plaza (paved) and its well. */
  plaza: { x0: number; z0: number; x1: number; z1: number; well: { x: number; z: number } };
}

const ADOBE = ['#e8c9a0', '#d9a273', '#c98a5e', '#f1e0c5', '#e3b38a', '#cf9c79', '#e9d3b4'];
const ROWHOUSE = ['#b55a3c', '#8e3b2e', '#d9c7a3', '#efe8da', '#6f8fa8', '#c7d6c2', '#e6b8a2', '#a64a3a', '#f2d16b'];
const ROOFS = ['#5b5f66', '#7a3b2e', '#4a4f57', '#8a4a35'];

export function generateTowns(rng: Rng): TownsData {
  const T: TownsData = { buildings: [], fields: [], windmills: [], bales: [], palms: [], trees: [], plaza: null! };

  // ---------------- desert town ----------------
  const D = DESERT_TOWN;
  const plaza = { x0: D.x + 14, z0: D.z - 84, x1: D.x + 94, z1: D.z - 14, well: { x: D.x + 54, z: D.z - 49 } };
  T.plaza = plaza;
  const inPlaza = (x: number, z: number, m: number) => x > plaza.x0 - m && x < plaza.x1 + m && z > plaza.z0 - m && z < plaza.z1 + m;
  const adobe = (x: number, z: number, w: number, d: number, rot: number) => {
    const twoFloors = rng.chance(0.25);
    T.buildings.push({ style: 'adobe', x, z, w, d, h: twoFloors ? rng.range(7, 8.5) : rng.range(4.2, 5.6), rot, color: rng.pick(ADOBE), roof: '#b98a5e', porch: rng.chance(0.55) });
  };
  // Along the main street (east-west), both sides, leaving the crossing and the plaza free.
  for (const side of [-1, 1]) {
    let x = D.x0 + 8;
    while (x < D.x1 - 10) {
      const w = rng.range(13, 21), d = rng.range(11, 15), cx = x + w / 2, cz = D.z + side * (8 + d / 2);
      x += w + rng.range(2, 6);
      if (Math.abs(cx - D.x) < 12 + w / 2) continue;
      if (inPlaza(cx, cz, w / 2)) continue;
      adobe(cx, cz, w, d, side < 0 ? 0 : Math.PI);
    }
  }
  // Along the cross street (north-south), both sides.
  for (const side of [-1, 1]) {
    for (const half of [-1, 1]) {
      let z = 16;
      while (z < 190) {
        const w = rng.range(12, 18), d = rng.range(11, 14), cz = D.z + half * (z + w / 2), cx = D.x + side * (8 + d / 2);
        z += w + rng.range(2, 6);
        if (inPlaza(cx, cz, w / 2)) continue;
        adobe(cx, cz, w, d, side < 0 ? Math.PI / 2 : -Math.PI / 2);
      }
    }
  }
  // Second row behind the main street, and a water tower.
  for (const side of [-1, 1]) {
    for (let x = D.x0 + 20; x < D.x1 - 20; x += rng.range(30, 45)) {
      const cz = D.z + side * rng.range(52, 80);
      if (Math.abs(x - D.x) < 30 || inPlaza(x, cz, 14)) continue;
      adobe(x, cz, rng.range(12, 18), rng.range(10, 13), rng.chance(0.5) ? 0 : Math.PI);
    }
  }
  T.buildings.push({ style: 'watertower', x: D.x + 130, z: D.z - 120, w: 6, d: 6, h: 14, rot: 0, color: '#9a7b5c', roof: '#7d6a55' });
  for (const [px, pz] of [[plaza.x0 + 6, plaza.z0 + 6], [plaza.x1 - 6, plaza.z0 + 6], [plaza.x0 + 6, plaza.z1 - 6], [plaza.x1 - 6, plaza.z1 - 6]]) T.palms.push({ x: px, z: pz, s: rng.range(0.9, 1.2) });
  for (let i = 0; i < 10; i++) {
    const x = D.x0 + rng.range(10, 390), z = D.z + (rng.chance(0.5) ? 1 : -1) * rng.range(7.5, 9.5);
    if (Math.abs(x - D.x) > 14 && !inPlaza(x, z, 4)) T.palms.push({ x, z, s: rng.range(0.8, 1.1) });
  }

  // ---------------- lake town ----------------
  const L = LAKE_TOWN;
  const entries = [0, Math.PI / 2, Math.PI, -Math.PI / 2]; // east, south, west, north (atan2(z, x))
  const nearEntry = (a: number, r: number, gap: number) => entries.some((e) => Math.abs(Math.atan2(Math.sin(a - e), Math.cos(a - e))) * r < gap);
  const gable = (x: number, z: number, w: number, d: number, rot: number) =>
    T.buildings.push({ style: 'gable', x, z, w, d, h: rng.range(6.5, 10.5), rot, color: rng.pick(ROWHOUSE), roof: rng.pick(ROOFS) });
  // Rows of houses facing the ring road, outside and inside it.
  for (const [ringR, facesIn] of [[L.ring + 8, true], [L.ring - 8, false]] as const) {
    let a = -Math.PI;
    while (a < Math.PI) {
      const w = rng.range(7, 10), d = rng.range(9, 12);
      const r = ringR + (facesIn ? d / 2 : -d / 2);
      const step = (w + 0.4) / r;
      const am = a + step / 2;
      a += step;
      if (nearEntry(am, r, 10 + w / 2)) continue;
      const x = L.x + Math.cos(am) * r, z = L.z + Math.sin(am) * r;
      // Front (+Z before rotation) towards the ring road.
      const toRoad = facesIn ? Math.atan2(-Math.cos(am), -Math.sin(am)) : Math.atan2(Math.cos(am), Math.sin(am));
      gable(x, z, w, d, toRoad);
    }
  }
  // Houses along the four streets between the ring and the square.
  for (const e of entries) {
    const ux = Math.cos(e), uz = Math.sin(e), px = -uz, pz = ux;
    for (const side of [-1, 1]) {
      let s = L.square + 8;
      while (s < L.ring - 22) {
        const w = rng.range(7, 9.5), d = rng.range(9, 11);
        const along = s + w / 2, off = side * (5 + 3 + d / 2);
        s += w + 0.4;
        const x = L.x + ux * along + px * off, z = L.z + uz * along + pz * off;
        gable(x, z, w, d, Math.atan2(-px * side, -pz * side));
      }
    }
  }
  T.buildings.push({ style: 'church', x: L.x, z: L.z + 4, w: 12, d: 24, h: 10, rot: Math.PI, color: '#d8cfc0', roof: '#4a4f57' });
  // Trees in the gaps between the house rows (inside the ring, between the streets).
  for (let i = 0; i < 28; i++) {
    const a = rng.range(-Math.PI, Math.PI), r = rng.range(L.square + 30, L.ring - 30);
    if (nearEntry(a, r, 22)) continue;
    T.trees.push({ x: L.x + Math.cos(a) * r, z: L.z + Math.sin(a) * r });
  }

  // ---------------- farmland ----------------
  const F = FARM;
  const FW = 120, FD = 90, gap = 8;
  const yards: [number, number][] = [];
  for (let x = F.x0; x + FW <= F.x1; x += FW + gap) {
    for (let z = F.z0; z + FD <= F.z1; z += FD + gap) {
      const cx = x + FW / 2, cz = z + FD / 2;
      if (inLake(cx, cz, 70) || onOutRoad(cx, cz, FW / 2)) continue;
      // Now and then a farmyard instead of a field.
      if (yards.length < 4 && rng.chance(0.12)) { yards.push([cx, cz]); continue; }
      const crop: Crop = rng.chance(0.18) ? 'tulips' : rng.pick(['wheat', 'wheat', 'green', 'green', 'plowed']);
      T.fields.push({ x0: x, z0: z, x1: x + FW, z1: z + FD, crop, alongX: rng.chance(0.5) });
      if (crop === 'wheat' && rng.chance(0.6)) for (let k = 0; k < 6; k++) T.bales.push({ x: x + rng.range(10, FW - 10), z: z + rng.range(10, FD - 10), rot: rng.range(0, Math.PI) });
      if (rng.chance(0.12) && T.windmills.length < 5) T.windmills.push({ x: x + rng.pick([6, FW - 6]), z: z + rng.pick([6, FD - 6]), rot: rng.range(-0.6, 0.6) });
    }
  }
  if (!yards.length) yards.push([F.x0 + 300, F.z0 + 200]);
  for (const [cx, cz] of yards) {
    T.buildings.push({ style: 'farmhouse', x: cx - 25, z: cz - 15, w: 11, d: 14, h: 5.5, rot: 0, color: rng.pick(['#efe8da', '#b55a3c', '#d9c7a3']), roof: rng.pick(ROOFS) });
    T.buildings.push({ style: 'barn', x: cx + 15, z: cz - 5, w: 16, d: 26, h: 7, rot: Math.PI / 2, color: '#b13a2e', roof: '#4a4f57' });
    T.buildings.push({ style: 'silo', x: cx + 15, z: cz + 22, w: 6, d: 6, h: 13, rot: 0, color: '#cfd3d6', roof: '#8d949b' });
    for (let k = 0; k < 4; k++) T.trees.push({ x: cx - 45 + k * 9, z: cz - 38 });
  }
  return T;
}

/** Ground-plan box of a building (for collisions): axis-aligned when turned by a multiple of 90°, else a safe inner square. */
export function buildingCollider(b: TownBuilding): { x0: number; z0: number; x1: number; z1: number } {
  const q = ((b.rot % (Math.PI / 2)) + Math.PI / 2) % (Math.PI / 2);
  const right = q < 0.01 || q > Math.PI / 2 - 0.01;
  if (b.style === 'silo' || b.style === 'watertower') return { x0: b.x - b.w / 2, z0: b.z - b.d / 2, x1: b.x + b.w / 2, z1: b.z + b.d / 2 };
  if (right) {
    const turned = Math.abs(Math.sin(b.rot)) > 0.5;
    const hw = (turned ? b.d : b.w) / 2, hd = (turned ? b.w : b.d) / 2;
    return { x0: b.x - hw, z0: b.z - hd, x1: b.x + hw, z1: b.z + hd };
  }
  const h = Math.min(b.w, b.d) * 0.42;
  return { x0: b.x - h, z0: b.z - h, x1: b.x + h, z1: b.z + h };
}
