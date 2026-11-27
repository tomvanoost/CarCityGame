import { GRID_BLOCKS, LINES, WIDE_LANES, roadHalf, type CityLayout } from '../city/layout';
import { A2_POINTS, DESERT_TOWN, HW_HALF, HW_LANES, LAKE_TOWN, LINK_ROAD, SOUTH_ROAD, type HighwayName } from '../city/outskirts';

export interface P { x: number; z: number }

/** Distance from the road center to the middle of the right-hand lane. */
export const LANE = 2.5;

/**
 * The road grid as a graph: intersections are nodes, road pieces between them are edges.
 * Roads that run through a merged block (the park) are left out.
 */
export class RoadGraph {
  readonly nodes: P[] = [];
  /** Neighbor node ids per node. */
  readonly adj: number[][] = [];
  readonly edges: [number, number][] = [];
  /**
   * For navigation: the city grid plus the loop outside the city (east to the desert town, south
   * through the farmland, west to the lake town's ring road, north over the bridge back to the city).
   * Traffic drives the loop too (`adj` / `edges`); the towns' side streets aren't in the graph.
   */
  readonly navEdges: [number, number][] = [];
  readonly navAdj: number[][] = [];
  private valid: boolean[] = [];
  /** Highway road pieces ("a-b" keys both ways): A1 (100 / 120 km/h) or A2 (no limit). */
  private highway = new Map<string, HighwayName>();
  /** The highway ends where you drive on / off it (for the blue signs). */
  readonly highwayEnds: { node: number; towards: number; name: HighwayName }[] = [];

  isHighway(a: number, b: number) { return this.highway.get(`${a}-${b}`) === 'A1'; }
  /** The A2 Autobahn: every car drives as fast as it can. */
  isAutobahn(a: number, b: number) { return this.highway.get(`${a}-${b}`) === 'A2'; }

  /** Grid line numbers of a city node (null for nodes outside the city grid). */
  private gridIJ(node: number) {
    const n = GRID_BLOCKS + 1;
    return node < n * n ? { i: Math.floor(node / n), j: node % n } : null;
  }

  /** Half width of the road between nodes a and b (wide avenues 11 m, small roads 5 m). */
  halfOf(a: number, b: number) {
    if (this.highway.has(`${a}-${b}`)) return HW_HALF;
    const A = this.gridIJ(a), B = this.gridIJ(b);
    if (!A || !B) return 5;
    return A.j === B.j ? roadHalf(A.j) : roadHalf(A.i);
  }

  /** Half width of the road that crosses the road (node, other) at `node`. */
  crossHalf(node: number, other: number) {
    const A = this.gridIJ(node), B = this.gridIJ(other);
    if (!A || !B) return 5;
    return A.j === B.j ? roadHalf(A.i) : roadHalf(A.j);
  }

  /** Lane centers (from the road's middle, on the right-hand side) of the road a-b. */
  lanesOf(a: number, b: number): readonly number[] {
    if (this.highway.has(`${a}-${b}`)) return HW_LANES;
    return this.halfOf(a, b) > 6 ? WIDE_LANES : [LANE];
  }

  /** The lane cars normally drive in: the middle lane of an avenue, the only lane of a small road. */
  cruiseLane(a: number, b: number) { const l = this.lanesOf(a, b); return this.highway.has(`${a}-${b}`) ? l[l.length - 1] : l[Math.floor(l.length / 2)]; }

  /** Where the crossing at `node` begins on the road (node, other): the turn curve starts here. */
  insetAt(node: number, other: number) { return this.crossHalf(node, other) + 2.5; }

  constructor(layout: CityLayout) {
    const n = GRID_BLOCKS + 1;
    const inside = (x: number, z: number) =>
      layout.blocks.some((b) => x > b.slab.x0 + 1 && x < b.slab.x1 - 1 && z > b.slab.z0 + 1 && z < b.slab.z1 - 1);
    for (let i = 0; i < n; i++)
      for (let j = 0; j < n; j++) {
        const id = i * n + j;
        this.nodes[id] = { x: LINES[i], z: LINES[j] };
        this.valid[id] = !inside(LINES[i], LINES[j]);
        this.adj[id] = [];
      }
    const link = (a: number, b: number) => {
      if (!this.valid[a] || !this.valid[b]) return;
      const m = { x: (this.nodes[a].x + this.nodes[b].x) / 2, z: (this.nodes[a].z + this.nodes[b].z) / 2 };
      if (inside(m.x, m.z)) return;
      this.adj[a].push(b);
      this.adj[b].push(a);
      this.edges.push([a, b]);
    };
    for (let i = 0; i < n; i++)
      for (let j = 0; j < n; j++) {
        if (i + 1 < n) link(i * n + j, (i + 1) * n + j);
        if (j + 1 < n) link(i * n + j, i * n + j + 1);
      }
    this.navEdges.push(...this.edges);
    this.adj.forEach((a, i) => { this.navAdj[i] = [...a]; });
    // The loop outside the city.
    const nearestNode = (x: number, z: number) => this.nodes.reduce((best, p, i) => (Math.hypot(p.x - x, p.z - z) < Math.hypot(this.nodes[best].x - x, this.nodes[best].z - z) ? i : best), 0);
    const add = (p: P) => { const id = this.nodes.length; this.nodes.push(p); this.adj[id] = []; this.navAdj[id] = []; return id; };
    const join = (a: number, b: number, highway?: HighwayName) => {
      this.adj[a].push(b); this.adj[b].push(a); this.edges.push([a, b]);
      this.navAdj[a].push(b); this.navAdj[b].push(a); this.navEdges.push([a, b]);
      if (highway) { this.highway.set(`${a}-${b}`, highway); this.highway.set(`${b}-${a}`, highway); }
    };
    // Lake town ring road: 48 points around the square (k = 0 east, 12 south, 24 west, 36 north). Enough
    // points that the straight pieces between them stay on the round road (16 cut ~3 m into the grass).
    const RING = 48;
    const ring: number[] = [];
    for (let k = 0; k < RING; k++) {
      const a = (k / RING) * Math.PI * 2;
      ring.push(add({ x: LAKE_TOWN.x + Math.cos(a) * LAKE_TOWN.ring, z: LAKE_TOWN.z + Math.sin(a) * LAKE_TOWN.ring }));
    }
    ring.forEach((id, k) => join(id, ring[(k + 1) % RING]));
    const cityEast = nearestNode(480, DESERT_TOWN.z), citySouth = nearestNode(SOUTH_ROAD.x, 480);
    const desertTown = add({ x: DESERT_TOWN.x, z: DESERT_TOWN.z });
    const farmCorner = add({ x: DESERT_TOWN.x, z: LINK_ROAD.z });
    // The loop roads are the A1 highway between the towns; inside the towns they are normal streets.
    const dtWest = add({ x: DESERT_TOWN.x0 - 20, z: DESERT_TOWN.z });
    const dtSouth = add({ x: DESERT_TOWN.x, z: DESERT_TOWN.z1 + 20 });
    const ltEast = add({ x: LAKE_TOWN.x + LAKE_TOWN.r + 10, z: LAKE_TOWN.z });
    const ltNorth = add({ x: SOUTH_ROAD.x, z: LAKE_TOWN.z - LAKE_TOWN.r - 10 });
    join(cityEast, dtWest, 'A1'); join(dtWest, desertTown);
    join(desertTown, dtSouth); join(dtSouth, farmCorner, 'A1');
    join(farmCorner, ltEast, 'A1'); join(ltEast, ring[0]);
    join(ring[36], ltNorth); join(ltNorth, citySouth, 'A1');
    this.highwayEnds.push(
      { node: cityEast, towards: dtWest, name: 'A1' }, { node: dtWest, towards: cityEast, name: 'A1' },
      { node: dtSouth, towards: farmCorner, name: 'A1' }, { node: ltEast, towards: farmCorner, name: 'A1' },
      { node: ltNorth, towards: citySouth, name: 'A1' }, { node: citySouth, towards: ltNorth, name: 'A1' },
    );
    // The A2 Autobahn: from the city's north avenue to the desert town's north entrance.
    const cityNorth = nearestNode(A2_POINTS[0].x, A2_POINTS[0].z);
    const a2 = [cityNorth, ...A2_POINTS.slice(1).map((p) => add(p))];
    for (let k = 0; k + 1 < a2.length; k++) join(a2[k], a2[k + 1], 'A2');
    join(a2[a2.length - 1], desertTown);
    this.highwayEnds.push({ node: cityNorth, towards: a2[1], name: 'A2' }, { node: a2[a2.length - 1], towards: a2[a2.length - 2], name: 'A2' });
  }

  /** Closest point on any road center line. */
  nearestOnRoad(p: P) {
    let best = { edge: 0, t: 0, d: Infinity, x: 0, z: 0 };
    this.navEdges.forEach(([a, b], e) => {
      const A = this.nodes[a], B = this.nodes[b];
      const dx = B.x - A.x, dz = B.z - A.z, len2 = dx * dx + dz * dz;
      const t = Math.max(0, Math.min(1, ((p.x - A.x) * dx + (p.z - A.z) * dz) / len2));
      const x = A.x + dx * t, z = A.z + dz * t;
      const d = Math.hypot(p.x - x, p.z - z);
      if (d < best.d) best = { edge: e, t, d, x, z };
    });
    return best;
  }

  /**
   * Route along the roads from `from` to `to` (Dijkstra; the graph is tiny).
   * Returns a polyline: start, road points ..., destination.
   */
  route(fromLive: P, toLive: P, heading?: number): P[] {
    // Copies: callers often pass objects that keep moving (the car's position).
    const from = { x: fromLive.x, z: fromLive.z }, to = { x: toLive.x, z: toLive.z };
    const s = this.nearestOnRoad(from), g = this.nearestOnRoad(to);
    const sp = { x: s.x, z: s.z }, gp = { x: g.x, z: g.z };
    if (s.edge === g.edge) return [from, sp, gp, to];
    const N = this.nodes.length;
    const dist = new Array(N).fill(Infinity), prev = new Array<number>(N).fill(-1), done = new Array(N).fill(false);
    const [sa, sb] = this.navEdges[s.edge], [ga, gb] = this.navEdges[g.edge];
    const d = (a: P, b: P) => Math.hypot(a.x - b.x, a.z - b.z);
    // Turning around costs extra: prefer to keep driving the way you are facing.
    const turnCost = (node: number) => {
      if (heading === undefined) return 0;
      const n = this.nodes[node], dx = n.x - sp.x, dz = n.z - sp.z;
      return dx * Math.sin(heading) + dz * Math.cos(heading) < 0 ? 120 : 0;
    };
    dist[sa] = d(sp, this.nodes[sa]) + turnCost(sa);
    dist[sb] = d(sp, this.nodes[sb]) + turnCost(sb);
    for (;;) {
      let u = -1;
      for (let i = 0; i < N; i++) if (!done[i] && dist[i] < Infinity && (u < 0 || dist[i] < dist[u])) u = i;
      if (u < 0) break;
      done[u] = true;
      for (const v of this.navAdj[u]) {
        const nd = dist[u] + d(this.nodes[u], this.nodes[v]);
        if (nd < dist[v]) { dist[v] = nd; prev[v] = u; }
      }
    }
    const endVia = dist[ga] + d(this.nodes[ga], gp) <= dist[gb] + d(this.nodes[gb], gp) ? ga : gb;
    const chain: P[] = [];
    for (let v = endVia; v >= 0; v = prev[v]) chain.unshift(this.nodes[v]);
    return [from, sp, ...chain, gp, to];
  }
}

/** Total length of a polyline. */
export function pathLength(path: P[]) {
  let l = 0;
  for (let i = 1; i < path.length; i++) l += Math.hypot(path[i].x - path[i - 1].x, path[i].z - path[i - 1].z);
  return l;
}

/** Point and direction at distance `s` along a polyline. */
export function pointAt(path: P[], s: number): { x: number; z: number; dx: number; dz: number } {
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1], b = path[i];
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    if (s <= len || i === path.length - 1) {
      const t = len > 0 ? Math.min(1, s / len) : 0;
      return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, dx: len ? (b.x - a.x) / len : 0, dz: len ? (b.z - a.z) / len : 1 };
    }
    s -= len;
  }
  const last = path[path.length - 1];
  return { x: last.x, z: last.z, dx: 0, dz: 1 };
}

/** Distance along the path of the point closest to p, and how far p is from the path. */
export function projectOnPath(path: P[], p: P, sMin = -Infinity, sMax = Infinity) {
  let best = { s: 0, d: Infinity }, acc = 0;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1], b = path[i];
    const dx = b.x - a.x, dz = b.z - a.z, len = Math.hypot(dx, dz);
    if (len < 1e-6) continue;
    // Only the part of the segment inside [sMin, sMax] counts.
    const t0 = Math.max(0, Math.min(1, (sMin - acc) / len)), t1 = Math.max(0, Math.min(1, (sMax - acc) / len));
    if (t1 > t0 || (t0 === t1 && sMin <= acc + t0 * len && acc + t0 * len <= sMax)) {
      const t = Math.max(t0, Math.min(t1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / (len * len)));
      const d = Math.hypot(p.x - (a.x + dx * t), p.z - (a.z + dz * t));
      if (d < best.d) best = { s: acc + t * len, d };
    }
    acc += len;
  }
  return best;
}
