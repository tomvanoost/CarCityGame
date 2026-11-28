import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { CityLayout } from '../city/layout';
import { BRIDGE, DESERT, DESERT_TOWN, FARM, FOOTBRIDGE, LAKE, LAKE_TOWN, inLake, inStream, onOutRoad } from '../city/outskirts';
import { groundHeight } from './collision';

/** Coin hunt: how many coins there are and what each one is worth. */
export const COIN_COUNT = 30;
export const COIN_REWARD = 25;

export interface CoinSpot { id: string; x: number; z: number }

/**
 * The 30 hidden coins: always the same spots (fixed seed, seeded city layout), spread over the
 * city sidewalks, the park, both bridges, the desert, the desert town, the lake town, the farm and the beach.
 */
export function coinSpots(layout: CityLayout): CoinSpot[] {
  let seed = 20261127;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const range = (a: number, b: number) => a + rnd() * (b - a);
  const free = (x: number, z: number) => !layout.colliders.some((c) => !c.off && x > c.x0 - 1.2 && x < c.x1 + 1.2 && z > c.z0 - 1.2 && z < c.z1 + 1.2)
    && !inLake(x, z, 4) && !inStream(x, z, 3);
  const spots: { x: number; z: number }[] = [];
  const far = (x: number, z: number) => spots.every((s) => Math.hypot(s.x - x, s.z - z) > 40);
  /** Try random points from `pick` until one is free (and not too close to another coin). */
  const add = (n: number, pick: () => { x: number; z: number }, check = free) => {
    for (let k = 0, tries = 0; k < n && tries < 400; tries++) {
      const p = pick();
      if (check(p.x, p.z) && far(p.x, p.z)) { spots.push(p); k++; }
    }
  };
  // City: on the sidewalks of random blocks.
  const blocks = layout.blocks.filter((b) => b.district !== 'park');
  add(12, () => {
    const b = blocks[Math.floor(rnd() * blocks.length)];
    const s = b.slab, side = Math.floor(rnd() * 4), m = 1.8;
    if (side === 0) return { x: range(s.x0 + 3, s.x1 - 3), z: s.z0 + m };
    if (side === 1) return { x: range(s.x0 + 3, s.x1 - 3), z: s.z1 - m };
    if (side === 2) return { x: s.x0 + m, z: range(s.z0 + 3, s.z1 - 3) };
    return { x: s.x1 - m, z: range(s.z0 + 3, s.z1 - 3) };
  });
  const pr = layout.park.rect;
  add(4, () => ({ x: range(pr.x0 + 8, pr.x1 - 8), z: range(pr.z0 + 8, pr.z1 - 8) }));
  // On the car bridge (two) and the middle of the footbridge: no collider checks there (railings are colliders).
  spots.push({ x: BRIDGE.x - 2, z: BRIDGE.z0 + (BRIDGE.z1 - BRIDGE.z0) * 0.35 }, { x: BRIDGE.x + 2, z: BRIDGE.z0 + (BRIDGE.z1 - BRIDGE.z0) * 0.7 });
  spots.push({ x: (FOOTBRIDGE.x0 + FOOTBRIDGE.x1) / 2, z: FOOTBRIDGE.z });
  add(3, () => ({ x: range(DESERT.x0 + 150, DESERT_TOWN.x0 - 60), z: range(DESERT.z0 + 150, DESERT.z1 - 150) }));
  add(2, () => ({ x: range(DESERT_TOWN.x0 + 20, DESERT_TOWN.x1 - 20), z: range(DESERT_TOWN.z0 + 20, DESERT_TOWN.z1 - 20) }));
  add(3, () => { const a = rnd() * Math.PI * 2, r = range(20, LAKE_TOWN.r - 20); return { x: LAKE_TOWN.x + Math.cos(a) * r, z: LAKE_TOWN.z + Math.sin(a) * r }; });
  add(2, () => ({ x: range(FARM.x0 + 40, FARM.x1 - 40), z: range(FARM.z0 + 40, FARM.z1 - 40) }));
  // The beach on the lake's north shore.
  add(1, () => { const a = range(Math.PI * 1.15, Math.PI * 1.85); return { x: LAKE.x + Math.cos(a) * (LAKE.rx + 14), z: LAKE.z + Math.sin(a) * (LAKE.rz + 14) }; }, (x, z) => free(x, z) && !onOutRoad(x, z, 2));
  return spots.slice(0, COIN_COUNT).map((s, i) => ({ id: `c${i}`, x: Math.round(s.x * 10) / 10, z: Math.round(s.z * 10) / 10 }));
}

/** The gold coin (upright, with a raised rim and a star on both faces), shared by the coin hunts. */
export function coinGeometry(): THREE.BufferGeometry {
  // A thick gold coin standing upright, with a raised rim.
  const tint = (g: THREE.BufferGeometry, color: string) => {
    const geo = g.index ? g.toNonIndexed() : g, c = new THREE.Color(color), n = geo.getAttribute('position').count;
    const a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) a.set([c.r, c.g, c.b], i * 3);
    geo.setAttribute('color', new THREE.BufferAttribute(a, 3));
    geo.deleteAttribute('uv');
    return geo;
  };
  // A five-pointed star, raised on both faces.
  const star = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 + Math.PI / 2, r = i % 2 ? 0.14 : 0.34;
    if (i) star.lineTo(Math.cos(a) * r, Math.sin(a) * r); else star.moveTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  return mergeGeometries([
    tint(new THREE.CylinderGeometry(0.55, 0.55, 0.12, 24).rotateX(Math.PI / 2), '#e8a810'),
    tint(new THREE.CylinderGeometry(0.45, 0.45, 0.15, 24).rotateX(Math.PI / 2), '#ffd84a'),
    tint(new THREE.ExtrudeGeometry(star, { depth: 0.2, bevelEnabled: false }).translate(0, 0, -0.1), '#fff1a8'),
  ])!;
}

/** The coins in the world: one InstancedMesh, spinning and bobbing; found coins are hidden. */
export class Coins {
  readonly group = new THREE.Group();
  readonly spots: CoinSpot[];
  private mesh: THREE.InstancedMesh;
  private found: Set<string>;
  private time = 0;
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private p = new THREE.Vector3();
  private s = new THREE.Vector3();
  private ys: number[];

  constructor(layout: CityLayout, found: string[], private onFind: (spot: CoinSpot) => void) {
    this.spots = coinSpots(layout);
    this.found = new Set(found);
    this.ys = this.spots.map((s) => groundHeight(s.x, s.z) + 1.1);
    const geo = coinGeometry();
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.8, roughness: 0.28, emissive: '#6b4700', emissiveIntensity: 0.3 });
    this.mesh = new THREE.InstancedMesh(geo, mat, this.spots.length);
    this.mesh.castShadow = true;
    this.mesh.frustumCulled = false;
    this.group.add(this.mesh);
    this.update(0, null);
  }

  get foundCount() { return this.found.size; }

  update(dt: number, pos: { x: number; z: number } | null, radius = 2.2) {
    this.time += dt;
    for (let i = 0; i < this.spots.length; i++) {
      const c = this.spots[i];
      const gone = this.found.has(c.id);
      if (!gone && pos && Math.abs(pos.x - c.x) < radius && Math.abs(pos.z - c.z) < radius && Math.hypot(pos.x - c.x, pos.z - c.z) < radius) {
        this.found.add(c.id);
        this.onFind(c);
      }
      this.q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, this.time * 2.4 + i);
      this.p.set(c.x, this.ys[i] + Math.sin(this.time * 2 + i) * 0.15, c.z);
      this.s.setScalar(this.found.has(c.id) ? 0 : 1);
      this.mesh.setMatrixAt(i, this.m.compose(this.p, this.q, this.s));
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  dispose() {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
    this.group.removeFromParent();
  }
}
