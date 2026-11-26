/**
 * The land outside the city: a road east into a desert with dunes, and a road south to a big lake
 * with a long car bridge, plus a small stream with a footbridge (people only). Plain numbers and
 * helpers, used by the layout (trees, water colliders), the ground height, the 3D build and the map.
 *
 * World axes as in the city: X = east, Z = south, meters.
 */

/** Edge of the playable world. */
export const WORLD_EDGE = 1430;

// Same numbers as layout.ts (not imported: layout.ts imports this file). HALF_CITY 480 + half a road.
const ROAD_WIDTH = 10;
const CITY_EDGE = 480 + ROAD_WIDTH / 2;

/** Road east from the middle of the city's east side, into the desert. */
export const EAST_ROAD = { z: 0, x0: CITY_EDGE, x1: 1385 };
/** Road south from the middle of the city's south side, over the lake. */
export const SOUTH_ROAD = { x: 0, z0: CITY_EDGE, z1: 1385 };
export const OUT_ROAD_HALF = ROAD_WIDTH / 2;

/** The desert (sand from here; it fades in over the first 80 m). */
export const DESERT = { x0: 680, x1: 1440, z0: -720, z1: 720 };
const DESERT_FADE = 80;

/** The big lake (an ellipse). */
export const LAKE = { x: 0, z: 1010, rx: 420, rz: 230 };

/** The car bridge over the lake (along the south road): ramps up, a long flat deck, ramps down. */
export const BRIDGE = { x: 0, half: 5.6, z0: 700, z1: 1320, ramp: 60, h: 3.2 };

/** A small stream that runs into the lake from the north, west of the south road. */
export const STREAM = { x0: -62, x1: -50, z0: 540, z1: 800 };

/** A wooden footbridge over the stream (people only: the gap between the bollards is too narrow for cars). */
export const FOOTBRIDGE = { z: 660, half: 1.3, x0: -71, x1: -41, h: 0.9 };
/** Gravel path from the south road to the footbridge and a bit beyond. */
export const PATH = { z: 660, half: 1.4, x0: -95, x1: -OUT_ROAD_HALF };

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

/** On one of the roads out of the city (incl. the car bridge). m: extra margin. */
export function onOutRoad(x: number, z: number, m = 0) {
  const h = OUT_ROAD_HALF + m;
  return (x > EAST_ROAD.x0 - 1 && x < EAST_ROAD.x1 + h && Math.abs(z - EAST_ROAD.z) < h) ||
    (z > SOUTH_ROAD.z0 - 1 && z < SOUTH_ROAD.z1 + h && Math.abs(x - SOUTH_ROAD.x) < h);
}

export const onPath = (x: number, z: number, m = 0) => x > PATH.x0 - m && x < PATH.x1 + m && Math.abs(z - PATH.z) < PATH.half + m;

/** 0 outside the desert, 1 in its middle (smooth edge). */
export function desertAmount(x: number, z: number) {
  const d = Math.min(x - DESERT.x0, DESERT.x1 - x, z - DESERT.z0, DESERT.z1 - z);
  return smooth(0, DESERT_FADE, d);
}

/** Gentle dunes you can drive over (flat on and next to the road). */
export function duneHeight(x: number, z: number) {
  const a = desertAmount(x, z);
  if (a <= 0) return 0;
  const nearRoad = smooth(10, 45, Math.abs(z - EAST_ROAD.z));
  const n = Math.sin(x * 0.045 + Math.sin(z * 0.02) * 2) * 0.55 + Math.sin(z * 0.06 + x * 0.013) * 0.3 + Math.sin((x + z) * 0.11) * 0.15;
  return Math.max(0, (n * 0.5 + 0.5)) * 3.8 * a * nearRoad;
}

/** Height of the car bridge deck at z (0 where it meets the ground). */
export function bridgeHeight(z: number) {
  const b = BRIDGE;
  if (z <= b.z0 || z >= b.z1) return 0;
  return b.h * Math.min(smooth(b.z0, b.z0 + b.ramp, z), 1 - smooth(b.z1 - b.ramp, b.z1, z));
}

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
  if (x > DESERT.x0) return duneHeight(x, z);
  return 0;
}

/** Plain meadow (grass blades may grow here): not desert, water, beach, roads or the path. */
export function isMeadow(x: number, z: number) {
  return desertAmount(x, z) < 0.3 && !inLake(x, z, 14) && !inStream(x, z, 2) && !onOutRoad(x, z, 1.5) && !onPath(x, z, 0.5) &&
    Math.max(Math.abs(x), Math.abs(z)) < WORLD_EDGE;
}

/** Keep trees out of here: desert, water + beach, roads, the path and around the footbridge. */
export function noTrees(x: number, z: number) {
  return desertAmount(x, z) > 0 || inLake(x, z, 30) || inStream(x, z, 10) || onOutRoad(x, z, 9) || onPath(x, z, 6) ||
    (x > FOOTBRIDGE.x0 - 15 && x < FOOTBRIDGE.x1 + 15 && Math.abs(z - FOOTBRIDGE.z) < 15);
}
