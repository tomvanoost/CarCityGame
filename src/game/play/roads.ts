import { GRID_BLOCKS, LINES, type CityLayout } from '../city/layout';
import { EAST_ROAD, SOUTH_ROAD } from '../city/outskirts';

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
   * For navigation and the maps: the city grid plus the roads out of the city (east to the desert,
   * south over the lake). Traffic only uses the grid (`adj` / `edges`): the roads out are dead ends.
   */
  readonly navEdges: [number, number][] = [];
  readonly navAdj: number[][] = [];
  private valid: boolean[] = [];

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
    // Roads out of the city: from the grid crossing on the city edge to the road's end.
    const nearestNode = (x: number, z: number) => this.nodes.reduce((best, p, i) => (Math.hypot(p.x - x, p.z - z) < Math.hypot(this.nodes[best].x - x, this.nodes[best].z - z) ? i : best), 0);
    const addOut = (from: { x: number; z: number }, end: { x: number; z: number }) => {
      const a = nearestNode(from.x, from.z), b = this.nodes.length;
      this.nodes.push(end);
      this.adj[b] = [];
      this.navAdj[b] = [a];
      this.navAdj[a].push(b);
      this.navEdges.push([a, b]);
    };
    addOut({ x: EAST_ROAD.x0, z: EAST_ROAD.z }, { x: EAST_ROAD.x1, z: EAST_ROAD.z });
    addOut({ x: SOUTH_ROAD.x, z: SOUTH_ROAD.z0 }, { x: SOUTH_ROAD.x, z: SOUTH_ROAD.z1 });
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
