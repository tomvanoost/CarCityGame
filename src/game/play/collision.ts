import { CURB_HEIGHT, HALF_CITY, ROAD_WIDTH, isOnRoad, type Collider } from '../city/layout';

/** Edge of the playable world (just inside the forest ring). */
export const WORLD_LIMIT = HALF_CITY + 45;

/**
 * Spatial hash of axis-aligned boxes. Lets us test a circle against only the few
 * boxes nearby instead of thousands.
 */
export class CollisionWorld {
  private cell = 16;
  private grid = new Map<number, number[]>();

  /** Things knocked over since the last takeKnocked(). */
  private knocked: Collider[] = [];

  constructor(private boxes: Collider[]) {
    boxes.forEach((b, i) => {
      for (let cx = this.ci(b.x0); cx <= this.ci(b.x1); cx++)
        for (let cz = this.ci(b.z0); cz <= this.ci(b.z1); cz++) {
          const k = this.key(cx, cz);
          let list = this.grid.get(k);
          if (!list) this.grid.set(k, (list = []));
          list.push(i);
        }
    });
  }

  /** True if the point is inside any box (used to keep the camera out of buildings). */
  pointBlocked(x: number, z: number): boolean {
    const list = this.grid.get(this.key(this.ci(x), this.ci(z)));
    if (!list) return false;
    for (const i of list) {
      const b = this.boxes[i];
      if (b.off) continue;
      // Ignore thin things (trees, lamps): only buildings block the camera.
      if (b.x1 - b.x0 < 2 && b.z1 - b.z0 < 2) continue;
      if (x > b.x0 - 0.3 && x < b.x1 + 0.3 && z > b.z0 - 0.3 && z < b.z1 + 0.3) return true;
    }
    return false;
  }

  private ci(v: number) { return Math.floor(v / this.cell); }
  private key(cx: number, cz: number) { return (cx + 1000) * 4000 + (cz + 1000); }

  /**
   * Pushes a circle out of any boxes it overlaps. Returns the push vector
   * (0, 0 when free), and writes the corrected position into `out`.
   */
  resolveCircle(x: number, z: number, r: number, out: { x: number; z: number }, canKnock = false): { nx: number; nz: number; hit: boolean; knocked: number } {
    let px = x, pz = z, hit = false, nx = 0, nz = 0, knocked = 0;
    const seen = new Set<number>();
    for (let cx = this.ci(x - r); cx <= this.ci(x + r); cx++) {
      for (let cz = this.ci(z - r); cz <= this.ci(z + r); cz++) {
        const list = this.grid.get(this.key(cx, cz));
        if (!list) continue;
        for (const i of list) {
          if (seen.has(i)) continue;
          seen.add(i);
          const b = this.boxes[i];
          if (b.off) continue;
          const qx = Math.max(b.x0, Math.min(px, b.x1)), qz = Math.max(b.z0, Math.min(pz, b.z1));
          let dx = px - qx, dz = pz - qz;
          const d2 = dx * dx + dz * dz;
          if (d2 >= r * r) continue;
          if (canKnock && b.knock) {
            // A fast car knocks it over and keeps going.
            b.off = true;
            this.knocked.push(b);
            knocked++;
            continue;
          }
          hit = true;
          if (d2 > 1e-8) {
            const d = Math.sqrt(d2), push = r - d;
            dx /= d; dz /= d;
            px += dx * push; pz += dz * push;
            nx += dx; nz += dz;
          } else {
            // Center is inside the box: leave by the nearest side.
            const opts = [[px - b.x0, -1, 0], [b.x1 - px, 1, 0], [pz - b.z0, 0, -1], [b.z1 - pz, 0, 1]];
            opts.sort((a, c) => a[0] - c[0]);
            const [dist, ox, oz] = opts[0];
            px += ox * (dist + r); pz += oz * (dist + r);
            nx += ox; nz += oz;
          }
        }
      }
    }
    // World edge.
    const lim = WORLD_LIMIT - r;
    if (Math.abs(px) > lim) { nx -= Math.sign(px); px = Math.sign(px) * lim; hit = true; }
    if (Math.abs(pz) > lim) { nz -= Math.sign(pz); pz = Math.sign(pz) * lim; hit = true; }
    out.x = px;
    out.z = pz;
    const n = Math.hypot(nx, nz) || 1;
    return { nx: nx / n, nz: nz / n, hit, knocked };
  }

  /** The things knocked over since the last call (the game tips them over and brings them back later). */
  takeKnocked(): Collider[] {
    const k = this.knocked;
    this.knocked = [];
    return k;
  }
}

/** Height of the walkable/drivable surface: roads at 0, block slabs (sidewalks, lots) at the curb height. */
export function groundHeight(x: number, z: number): number {
  const edge = HALF_CITY + ROAD_WIDTH / 2;
  if (Math.abs(x) > edge || Math.abs(z) > edge) return 0;
  return isOnRoad(x, z) ? 0 : CURB_HEIGHT;
}
