/**
 * The land outside the city, as plain numbers and helpers (used by the layout, the ground height,
 * the 3D build, the road graph and the maps):
 * - east: a road through a desert with dunes to a desert town (low adobe buildings, a plaza);
 * - south: a road over a big lake on a long car bridge to a lake town (Dutch gabled houses around a
 *   ring road, a church on the square); a small stream with a footbridge (people only);
 * - a loop road from the desert town south through farmland (fields, barns, windmills) and west to
 *   the lake town, so you can drive all the way round.
 *
 * World axes as in the city: X = east, Z = south, meters.
 */

/** Edge of the playable world. */
export const WORLD_EDGE = 2300;

// Same numbers as layout.ts (not imported: layout.ts imports this file). HALF_CITY 480 + half a road.
const ROAD_WIDTH = 10;
const CITY_EDGE = 480 + ROAD_WIDTH / 2;
export const OUT_ROAD_HALF = ROAD_WIDTH / 2;

/** Desert town: a main street (east-west) and a cross street (north-south). */
export const DESERT_TOWN = { x: 1850, z: 0, x0: 1650, x1: 2050, z0: -200, z1: 200 };
/** Lake town: a ring road around a central square. */
export const LAKE_TOWN = { x: 0, z: 1775, ring: 150, square: 40, r: 215 };

/** Road east from the middle of the city's east side, through the desert to the desert town. */
export const EAST_ROAD = { z: 0, x0: CITY_EDGE, x1: DESERT_TOWN.x0 };
/** Road south from the middle of the city's south side, over the lake to the lake town's ring road. */
export const SOUTH_ROAD = { x: 0, z0: CITY_EDGE, z1: LAKE_TOWN.z - LAKE_TOWN.ring };
/** The loop: from the desert town south through the farmland, then west to the lake town. */
export const FARM_ROAD = { x: DESERT_TOWN.x, z0: DESERT_TOWN.z1, z1: LAKE_TOWN.z };
export const LINK_ROAD = { z: LAKE_TOWN.z, x0: LAKE_TOWN.x + LAKE_TOWN.ring, x1: DESERT_TOWN.x };

/** All straight roads outside the city (incl. the towns' own straight streets), as segments. */
export const OUT_ROADS: { ax: number; az: number; bx: number; bz: number }[] = [
  { ax: EAST_ROAD.x0, az: 0, bx: DESERT_TOWN.x1, bz: 0 }, // east road + the desert town's main street
  { ax: DESERT_TOWN.x, az: DESERT_TOWN.z0, bx: DESERT_TOWN.x, bz: FARM_ROAD.z1 }, // cross street + farm road
  { ax: LINK_ROAD.x0, az: LINK_ROAD.z, bx: LINK_ROAD.x1 + OUT_ROAD_HALF, bz: LINK_ROAD.z },
  { ax: SOUTH_ROAD.x, az: SOUTH_ROAD.z0, bx: SOUTH_ROAD.x, bz: SOUTH_ROAD.z1 },
  // Lake town: streets from the ring road to the central square (west, south, east, north).
  { ax: LAKE_TOWN.x - LAKE_TOWN.ring, az: LAKE_TOWN.z, bx: LAKE_TOWN.x - LAKE_TOWN.square, bz: LAKE_TOWN.z },
  { ax: LAKE_TOWN.x, az: LAKE_TOWN.z + LAKE_TOWN.square, bx: LAKE_TOWN.x, bz: LAKE_TOWN.z + LAKE_TOWN.ring },
  { ax: LAKE_TOWN.x + LAKE_TOWN.square, az: LAKE_TOWN.z, bx: LAKE_TOWN.x + LAKE_TOWN.ring, bz: LAKE_TOWN.z },
  { ax: LAKE_TOWN.x, az: LAKE_TOWN.z - LAKE_TOWN.ring, bx: LAKE_TOWN.x, bz: LAKE_TOWN.z - LAKE_TOWN.square },
];

/**
 * Highways: divided roads (2 lanes each way, a median with a guardrail, hard shoulders), only joined to
 * other roads at their ends. A1 = the loop roads between the towns (100 / 120 km/h); A2 = the Autobahn
 * north and east of the city, where every car drives as fast as it can.
 */
export const HW_HALF = 9;
/** Highway lane centers from the middle: the fast (left) lane and the normal (right) lane. */
export const HW_LANES = [2.75, 6.25];
export type HighwayName = 'A1' | 'A2';
/** The A2: from the city's north avenue up north, east, and down into the desert town (45° bends at the corners). */
export const A2_POINTS = [
  { x: 0, z: -480 }, { x: 0, z: -1420 }, { x: 80, z: -1500 }, { x: 1770, z: -1500 }, { x: 1850, z: -1420 }, { x: 1850, z: -230 },
];
export const HIGHWAYS: { name: HighwayName; ax: number; az: number; bx: number; bz: number }[] = [
  { name: 'A1', ax: CITY_EDGE + 20, az: 0, bx: DESERT_TOWN.x0 - 20, bz: 0 },
  { name: 'A1', ax: DESERT_TOWN.x, az: DESERT_TOWN.z1 + 20, bx: DESERT_TOWN.x, bz: LAKE_TOWN.z },
  { name: 'A1', ax: LAKE_TOWN.x + LAKE_TOWN.r + 10, az: LAKE_TOWN.z, bx: DESERT_TOWN.x, bz: LAKE_TOWN.z },
  { name: 'A1', ax: 0, az: CITY_EDGE + 20, bx: 0, bz: LAKE_TOWN.z - LAKE_TOWN.r - 10 },
  ...A2_POINTS.slice(0, -1).map((p, i) => ({ name: 'A2' as const, ax: p.x, az: i === 0 ? -CITY_EDGE - 20 : p.z, bx: A2_POINTS[i + 1].x, bz: A2_POINTS[i + 1].z })),
];

/** Distance from (x, z) to the nearest highway's center line. */
export function highwayDistance(x: number, z: number) {
  let best = Infinity;
  for (const r of HIGHWAYS) {
    const dx = r.bx - r.ax, dz = r.bz - r.az, len2 = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((x - r.ax) * dx + (z - r.az) * dz) / len2));
    best = Math.min(best, Math.hypot(x - (r.ax + dx * t), z - (r.az + dz * t)));
  }
  return best;
}

/** The desert (sand from here; it fades in over the first 80 m). Edges on the 80 m ground grid. */
export const DESERT = { x0: 640, x1: 2400, z0: -800, z1: 800 };
const DESERT_FADE = 80;

/** Farmland in the south-east, between the lake and the loop road. */
export const FARM = { x0: 560, x1: 1800, z0: 840, z1: 1700 };

/** The big lake (an ellipse). */
export const LAKE = { x: 0, z: 1010, rx: 420, rz: 230 };

/** The car bridge over the lake (along the south road): ramps up, a long flat deck, ramps down. */
export const BRIDGE = { x: 0, half: HW_HALF + 0.6, z0: 700, z1: 1320, ramp: 60, h: 3.2 };

/** A small stream that runs into the lake from the north, west of the south road. */
export const STREAM = { x0: -62, x1: -50, z0: 540, z1: 800 };

/** A wooden footbridge over the stream (people only: the gap between the bollards is too narrow for cars). */
export const FOOTBRIDGE = { z: 660, half: 1.3, x0: -71, x1: -41, h: 0.9 };
/** Gravel path from the south road to the footbridge and a bit beyond. */
export const PATH = { z: 660, half: 1.4, x0: -95, x1: -HW_HALF };

const smooth = (a: number, b: number, v: number) => {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Inside the lake ellipse (grown by `m` meters). */
export function inLake(x: number, z: number, m = 0) {
  const dx = (x - LAKE.x) / (LAKE.rx + m), dz = (z - LAKE.z) / (LAKE.rz + m);
  return dx * dx + dz * dz < 1;
}

export function inStream(x: number, z: number, m = 0) {
  return x > STREAM.x0 - m && x < STREAM.x1 + m && z > STREAM.z0 - m && z < STREAM.z1 + m;
}

/** Water surface here (lake or stream), bridges or not. */
export const isWater = (x: number, z: number) => inLake(x, z) || inStream(x, z);

/** Distance from (x, z) to the nearest straight road outside the city (its center line). */
export function outRoadDistance(x: number, z: number) {
  let best = Infinity;
  for (const r of OUT_ROADS) {
    const dx = r.bx - r.ax, dz = r.bz - r.az, len2 = dx * dx + dz * dz;
    const t = Math.max(0, Math.min(1, ((x - r.ax) * dx + (z - r.az) * dz) / len2));
    best = Math.min(best, Math.hypot(x - (r.ax + dx * t), z - (r.az + dz * t)));
  }
  return best;
}

/** Distance from the lake town's ring road center line. */
export const ringDistance = (x: number, z: number) => Math.abs(Math.hypot(x - LAKE_TOWN.x, z - LAKE_TOWN.z) - LAKE_TOWN.ring);

/** On one of the roads outside the city (incl. the car bridge and the ring road). m: extra margin. */
export function onOutRoad(x: number, z: number, m = 0) {
  return outRoadDistance(x, z) < OUT_ROAD_HALF + m || ringDistance(x, z) < OUT_ROAD_HALF + m || highwayDistance(x, z) < HW_HALF + m;
}

export const onPath = (x: number, z: number, m = 0) => x > PATH.x0 - m && x < PATH.x1 + m && Math.abs(z - PATH.z) < PATH.half + m;

export const inDesertTown = (x: number, z: number, m = 0) =>
  x > DESERT_TOWN.x0 - m && x < DESERT_TOWN.x1 + m && z > DESERT_TOWN.z0 - m && z < DESERT_TOWN.z1 + m;
export const inLakeTown = (x: number, z: number, m = 0) => Math.hypot(x - LAKE_TOWN.x, z - LAKE_TOWN.z) < LAKE_TOWN.r + m;
export const inFarm = (x: number, z: number, m = 0) => x > FARM.x0 - m && x < FARM.x1 + m && z > FARM.z0 - m && z < FARM.z1 + m;

/**
 * Desert race track: a loop with S-bends north of the east road, plus a short dirt path from the road
 * to the start line (point 0, the side nearest the road). `half` = half the track width.
 */
export const RACE = { x: 1150, z: -430, rx: 260, rz: 150, half: 6.5, n: 160, access: { x: 1150, z0: EAST_ROAD.z - 6 } };
let racePts: { x: number; z: number }[] | null = null;
/** The track's center line (closed loop, point 0 = start/finish). */
export function racePoints() {
  if (racePts) return racePts;
  racePts = [];
  for (let i = 0; i < RACE.n; i++) {
    const a = Math.PI / 2 + (i / RACE.n) * Math.PI * 2;
    racePts.push({ x: RACE.x + Math.cos(a) * RACE.rx + Math.sin(a * 2) * 35, z: RACE.z + Math.sin(a) * RACE.rz + Math.sin(a * 3) * 28 });
  }
  return racePts;
}
const segDist = (x: number, z: number, ax: number, az: number, bx: number, bz: number) => {
  const dx = bx - ax, dz = bz - az, l = dx * dx + dz * dz;
  const t = l ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l)) : 0;
  return Math.hypot(x - ax - dx * t, z - az - dz * t);
};
/** Distance to the track's center line or its access path (Infinity when far away). */
export function raceDistance(x: number, z: number) {
  if (x < RACE.x - RACE.rx - 140 || x > RACE.x + RACE.rx + 140 || z < RACE.z - RACE.rz - 140 || z > RACE.access.z0 + 60) return Infinity;
  const p = racePoints();
  let d = segDist(x, z, RACE.access.x, RACE.access.z0, p[0].x, p[0].z);
  for (let i = 0; i < p.length; i++) {
    const a = p[i], b = p[(i + 1) % p.length];
    d = Math.min(d, segDist(x, z, a.x, a.z, b.x, b.z));
  }
  return d;
}

/** 0 outside the desert, 1 in its middle (smooth edge). */
export function desertAmount(x: number, z: number) {
  const d = Math.min(x - DESERT.x0, DESERT.x1 - x, z - DESERT.z0, DESERT.z1 - z);
  return smooth(0, DESERT_FADE, d);
}

/** Gentle dunes you can drive over (flat on and next to the roads and in the desert town). */
/** The big dune for sandboarding (south of the east road): a round hill, the slope faces north (-z). */
export const BIG_DUNE = { x: 1250, z: 430, r: 75, h: 17 };
/** Height of the big dune (0 outside it): a smooth round hill. */
export function bigDuneHeight(x: number, z: number) {
  const d = Math.hypot(x - BIG_DUNE.x, z - BIG_DUNE.z);
  return d >= BIG_DUNE.r ? 0 : BIG_DUNE.h * 0.5 * (1 + Math.cos((Math.PI * d) / BIG_DUNE.r));
}

export function duneHeight(x: number, z: number) {
  const a = desertAmount(x, z);
  if (a <= 0) return 0;
  const big = bigDuneHeight(x, z);
  if (big > 0) return Math.max(big, duneWaves(x, z, a));
  return duneWaves(x, z, a);
}

function duneWaves(x: number, z: number, a: number) {
  // How far outside the desert town (0 inside): flat in town, dunes start 40 m out.
  const out = Math.max(DESERT_TOWN.x0 - x, x - DESERT_TOWN.x1, DESERT_TOWN.z0 - z, z - DESERT_TOWN.z1);
  const flat = Math.min(smooth(10, 45, outRoadDistance(x, z)), smooth(HW_HALF + 6, HW_HALF + 45, highwayDistance(x, z)), smooth(0, 40, out), smooth(RACE.half + 6, RACE.half + 40, raceDistance(x, z)), smooth(BALLOON.r + 8, BALLOON.r + 40, Math.hypot(x - BALLOON.x, z - BALLOON.z)));
  if (flat <= 0) return 0;
  const n = Math.sin(x * 0.045 + Math.sin(z * 0.02) * 2) * 0.6 + Math.sin(z * 0.06 + x * 0.013) * 0.4;
  return Math.max(0, (n * 0.5 + 0.5)) * 3.8 * a * flat;
}

/** Height of the car bridge deck at z (0 where it meets the ground). */
export function bridgeHeight(z: number) {
  const b = BRIDGE;
  if (z <= b.z0 || z >= b.z1) return 0;
  return b.h * Math.min(smooth(b.z0, b.z0 + b.ramp, z), 1 - smooth(b.z1 - b.ramp, b.z1, z));
}

/** Hot air balloon field: a launch pad south of the east road, at the start of the desert. */
export const BALLOON = { x: 780, z: 42, r: 9 };

/** Petting farm: a fenced paddock next to the farm road (gate on the east side, towards the road). */
export const PETTING = { x: 1812, z: 1000, w: 26, d: 20, gate: 4 };

/** Fishing jetty on the lake's north shore: from the grass (z0) out over the water (z1). */
export const JETTY = { x: -160, z0: 784, z1: 814, half: 1.3, h: 0.45 };
/** Swimming zone at the north beach (marked with buoys): you can swim here, nowhere else in the water. */
export const SWIM = { x0: -250, x1: -25, zMax: LAKE.z - LAKE.rz + 50 };
export const inSwimZone = (x: number, z: number) => x > SWIM.x0 && x < SWIM.x1 && z < SWIM.zMax;
/** How deep you are in the lake (0 on land; deeper over the first 8 m from the shore, at most `max`). */
export function swimDepth(x: number, z: number, max = 1.05) {
  const e = ((x - LAKE.x) / LAKE.rx) ** 2 + ((z - LAKE.z) / LAKE.rz) ** 2;
  if (e >= 1) return 0;
  const inside = (1 - Math.sqrt(e)) * LAKE.rz; // about how far from the shore
  return Math.min(1, inside / 8) * max;
}
/** Beach stand that sells the rubber duck float (next to the fireworks stand). */
export const FLOAT_STAND = { x: -122, z: 771 };

/** Fireworks stand on the north beach of the lake, east of the jetty. */
export const FIREWORKS = { x: JETTY.x + 50, z: 770 };
export const onJetty = (x: number, z: number) => Math.abs(x - JETTY.x) < JETTY.half && z > JETTY.z0 && z < JETTY.z1;
/** Jetty deck height: a short ramp up from the grass, then flat. */
export const jettyHeight = (z: number) => JETTY.h * smooth(JETTY.z0, JETTY.z0 + 4, z);

export const onBridge = (x: number, z: number) => Math.abs(x - BRIDGE.x) < BRIDGE.half && z > BRIDGE.z0 && z < BRIDGE.z1;
export const onFootbridge = (x: number, z: number) => x > FOOTBRIDGE.x0 && x < FOOTBRIDGE.x1 && Math.abs(z - FOOTBRIDGE.z) < FOOTBRIDGE.half;

/** Footbridge deck height (a gentle arch). */
export function footbridgeHeight(x: number) {
  const t = (x - FOOTBRIDGE.x0) / (FOOTBRIDGE.x1 - FOOTBRIDGE.x0);
  return t <= 0 || t >= 1 ? 0 : Math.sin(t * Math.PI) * FOOTBRIDGE.h;
}

/** Height of the ground / road / bridge outside the city. */
export function outskirtsHeight(x: number, z: number) {
  if (onBridge(x, z)) return bridgeHeight(z);
  if (onFootbridge(x, z)) return footbridgeHeight(x);
  if (onJetty(x, z)) return jettyHeight(z);
  if (x > DESERT.x0 && z > DESERT.z0 && z < DESERT.z1) return duneHeight(x, z);
  return 0;
}

/** Plain meadow (grass blades may grow here): not desert, water, beach, roads, towns, fields or the path. */
export function isMeadow(x: number, z: number) {
  return desertAmount(x, z) < 0.3 && !inLake(x, z, 14) && !inStream(x, z, 2) && !onOutRoad(x, z, 1.5) && !onPath(x, z, 0.5) &&
    !inLakeTown(x, z, -LAKE_TOWN.r + LAKE_TOWN.square + 2) && !inFarm(x, z) && Math.max(Math.abs(x), Math.abs(z)) < WORLD_EDGE;
}

/** Keep forest trees out of here: desert, water + beach, roads, towns, fields, the path and around the footbridge. */
export function noTrees(x: number, z: number) {
  return desertAmount(x, z) > 0 || inLake(x, z, 30) || inStream(x, z, 10) || onOutRoad(x, z, 9) || onPath(x, z, 6) ||
    inLakeTown(x, z, 15) || inDesertTown(x, z, 30) || inFarm(x, z, 10) ||
    (x > FOOTBRIDGE.x0 - 15 && x < FOOTBRIDGE.x1 + 15 && Math.abs(z - FOOTBRIDGE.z) < 15);
}
