import * as THREE from 'three';
import { groundHeight } from './collision';
import { LANE, pathLength, pointAt, projectOnPath, type P, type RoadGraph } from './roads';
import { moveOf } from './trafficLights';

const SPACING = 7; // meters between road arrows
const AHEAD = 140; // show arrows this far ahead
const MAX_ARROWS = Math.ceil(AHEAD / SPACING) + 1;

/**
 * Turn-by-turn style guidance: a route along the roads to a target, shown as
 * glowing chevrons that flow along the lane you should be in: on an avenue the left lane before a left
 * turn, the right lane before a right turn and the middle lane to go straight on (like the road arrows),
 * curving through the crossing. Recalculates when you leave the route.
 */
export class Navigator {
  readonly arrows: THREE.InstancedMesh;
  target: P | null = null;
  path: P[] = [];
  private length = 0;
  private progress = 0;
  /** The route moved into the right lanes (what the chevrons follow), and how far along it you are. */
  private lanePath: P[] = [];
  private laneLength = 0;
  private laneProgress = 0;
  /** How far the player is from the route (meters). */
  offRoute = 0;
  private recheck = 0;
  private better = 1;
  private time = 0;
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private up = new THREE.Vector3(0, 1, 0);

  constructor(private graph: RoadGraph) {
    const shape = new THREE.Shape();
    // A flat ">" chevron pointing +Z, ~1.8 m wide.
    shape.moveTo(0, 0.7); shape.lineTo(0.9, -0.2); shape.lineTo(0.9, -0.65); shape.lineTo(0, 0.25);
    shape.lineTo(-0.9, -0.65); shape.lineTo(-0.9, -0.2); shape.closePath();
    const geo = new THREE.ShapeGeometry(shape).rotateX(-Math.PI / 2).rotateY(Math.PI);
    // rotateX maps shape +y to -z; rotateY(PI) flips it so the tip points to +Z.
    const mat = new THREE.MeshBasicMaterial({ color: '#4fe3ff', transparent: true, opacity: 0.95, depthWrite: false, fog: false,
      polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -8 });
    this.arrows = new THREE.InstancedMesh(geo, mat, MAX_ARROWS);
    this.arrows.count = 0;
    this.arrows.frustumCulled = false;
    this.arrows.renderOrder = 3;
  }

  /** Set (or clear) the target. Recalculates the route from `from`. */
  setTarget(t: P | null, from: P, heading?: number) {
    this.target = t;
    if (!t) { this.path = []; this.arrows.count = 0; return; }
    this.setPath(this.graph.route(from, t, heading));
  }

  private setPath(path: P[]) {
    this.path = path;
    this.length = pathLength(path);
    this.progress = 0;
    this.lanePath = this.inLanes(path);
    this.laneLength = pathLength(this.lanePath);
    this.laneProgress = 0;
  }

  /**
   * The route (through the middle of each crossing) moved into lanes: every road piece in the lane for the
   * next turn (changing lanes well before the crossing), and a curve through each crossing from lane to lane.
   */
  private inLanes(path: P[]): P[] {
    const g = this.graph, nodes = g.nodes;
    if (path.length < 3) return path.slice();
    const idx = path.map((p) => nodes.indexOf(p as never));
    const dirOf = (a: P, b: P) => { const l = Math.hypot(b.x - a.x, b.z - a.z) || 1; return { x: (b.x - a.x) / l, z: (b.z - a.z) / l }; };
    // The node a free end (your position on the road, the target) lies towards, seen from node `n`.
    const toward = (n: number, p: P) => {
      const d = dirOf(nodes[n], p);
      let best = -1, bd = 0.7;
      for (const m of g.adj[n] ?? []) { const e = dirOf(nodes[n], nodes[m]); const k = e.x * d.x + e.z * d.z; if (k > bd) { bd = k; best = m; } }
      return best;
    };
    // Lanes of piece i (path[i] -> path[i+1]); a piece with a free end uses the road it lies on.
    const ends = (i: number) => {
      let a = idx[i], b = idx[i + 1];
      if (a < 0 && b >= 0) a = toward(b, path[i]);
      else if (b < 0 && a >= 0) b = toward(a, path[i + 1]);
      return [a, b] as const;
    };
    const lanesOf = (i: number): readonly number[] => {
      const [a, b] = ends(i);
      return a >= 0 && b >= 0 ? g.lanesOf(a, b) : [LANE];
    };
    // How far from the middle of the crossing at the start / end of piece i the lane part begins / ends.
    const insetStart = (i: number) => { const [a, b] = ends(i); return idx[i] >= 0 && b >= 0 ? g.crossHalf(a, b) + 0.4 : 0; };
    const insetEnd = (i: number) => { const [a, b] = ends(i); return idx[i + 1] >= 0 && a >= 0 ? g.crossHalf(b, a) + 0.4 : 0; };
    const n = path.length - 1; // pieces 0 .. n-1 (piece 0 is from your position onto the road)
    // The move at every inner point, and the lane to arrive in / leave in.
    const laneIn: number[] = [], laneOut: number[] = [];
    for (let i = 1; i < n; i++) {
      const A = lanesOf(i - 1), B = lanesOf(i);
      const mv = idx[i] >= 0 ? moveOf(path[i - 1], path[i], path[i + 1]) : 'straight';
      const k = mv === 'left' ? 0 : mv === 'right' ? 1 : 0.5;
      laneIn[i] = A[Math.round(k * (A.length - 1))];
      laneOut[i] = B[Math.round(k * (B.length - 1))];
    }
    const out: P[] = [path[0]];
    const at = (p: P, d: { x: number; z: number }, along: number, lane: number) => ({ x: p.x + d.x * along - d.z * lane, z: p.z + d.z * along + d.x * lane });
    for (let i = 1; i < n; i++) {
      const a = path[i], b = path[i + 1], d = dirOf(a, b), len = Math.hypot(b.x - a.x, b.z - a.z);
      const L = lanesOf(i), mid = L[Math.floor(L.length / 2)];
      const start = laneOut[i] ?? mid, end = i + 1 < n ? laneIn[i + 1] : mid;
      const s0 = Math.min(len / 2, insetStart(i)), s1 = Math.max(s0, len - (i + 1 < n ? insetEnd(i) : 0));
      // Change lanes in the middle part of the piece, done ~20 m before the crossing.
      const c1 = Math.max(s0, s1 - 20), c0 = Math.min(c1, Math.max(s0 + 4, c1 - 25));
      out.push(at(a, d, s0, start), at(a, d, c0, start), at(a, d, c1, end), at(a, d, s1, end));
      if (i + 1 < n) {
        // Through the crossing: a curve from the lane you come in to the lane you leave in.
        const c = path[i + 1], d2 = dirOf(c, path[i + 2]);
        const mv = idx[i + 1] >= 0 ? moveOf(a, c, path[i + 2]) : 'straight';
        const p0 = out[out.length - 1];
        const p2 = at(c, d2, insetStart(i + 1), laneOut[i + 1]);
        const dot = d.x * d2.x + d.z * d2.z;
        if (mv !== 'straight' && dot > -0.9) {
          const along = (p2.x - p0.x) * d.x + (p2.z - p0.z) * d.z;
          const p1 = { x: p0.x + d.x * along, z: p0.z + d.z * along };
          for (let k = 1; k < 8; k++) {
            const t = k / 8, u = 1 - t;
            out.push({ x: u * u * p0.x + 2 * u * t * p1.x + t * t * p2.x, z: u * u * p0.z + 2 * u * t * p1.z + t * t * p2.z });
          }
        }
      }
    }
    out.push(path[n]);
    // Drop points that are (almost) on top of each other.
    return out.filter((p, i) => i === 0 || Math.hypot(p.x - out[i - 1].x, p.z - out[i - 1].z) > 0.05);
  }

  /** Meters left to the target along the route. */
  get remaining() { return Math.max(0, this.length - this.progress); }

  /** The part of the route that is still ahead of you (for the maps). */
  remainingPath(): P[] {
    if (this.path.length < 2) return [];
    const start = pointAt(this.path, this.progress);
    const out: P[] = [{ x: start.x, z: start.z }];
    let acc = 0;
    for (let i = 1; i < this.path.length; i++) {
      acc += Math.hypot(this.path[i].x - this.path[i - 1].x, this.path[i].z - this.path[i - 1].z);
      if (acc > this.progress) out.push(this.path[i]);
    }
    return out;
  }

  /** A point on the route ~`ahead` meters in front of the player (for the floating arrow). */
  lookAhead(ahead: number): P | null {
    if (!this.path.length) return null;
    const p = pointAt(this.path, Math.min(this.length, this.progress + ahead));
    return { x: p.x, z: p.z };
  }

  update(dt: number, pos: P, heading?: number) {
    this.time += dt;
    if (!this.target || !this.path.length) return;
    // Follow the route forward: look near where you were, so a road that the route uses
    // twice (there and back) can't make the progress jump back.
    let pr = projectOnPath(this.path, pos, this.progress - 25, this.progress + 90);
    if (pr.d > 18) pr = projectOnPath(this.path, pos);
    this.progress = pr.s;
    this.offRoute = pr.d;
    // Found a shorter way (e.g. you turned around)? Take it (checked once a second).
    this.better -= dt;
    if (this.better <= 0) {
      this.better = 1;
      const alt = this.graph.route(pos, this.target, heading);
      const len = pathLength(alt);
      if (len < this.remaining - 15) this.setPath(alt);
    }
    // Left the route? Find a new one (at most twice a second).
    this.recheck -= dt;
    if (pr.d > 18 && this.recheck <= 0) {
      this.recheck = 0.5;
      this.setTarget(this.target, pos, heading);
      return;
    }
    // Flowing chevrons along the lane path, starting a few meters ahead.
    let lp = projectOnPath(this.lanePath, pos, this.laneProgress - 25, this.laneProgress + 90);
    if (lp.d > 18) lp = projectOnPath(this.lanePath, pos);
    this.laneProgress = lp.s;
    const flow = (this.time * 8) % SPACING;
    let k = 0;
    for (let s = this.laneProgress + 7 + flow; s < Math.min(this.laneLength - 2, this.laneProgress + AHEAD) && k < MAX_ARROWS; s += SPACING) {
      const p = pointAt(this.lanePath, s);
      const x = p.x, z = p.z;
      this.q.setFromAxisAngle(this.up, Math.atan2(p.dx, p.dz));
      const fade = 1 - (s - this.laneProgress) / AHEAD;
      this.m.compose(new THREE.Vector3(x, groundHeight(x, z) + 0.05, z), this.q, new THREE.Vector3(1 + fade * 0.6, 1, 1 + fade * 0.6));
      this.arrows.setMatrixAt(k++, this.m);
    }
    this.arrows.count = k;
    this.arrows.instanceMatrix.needsUpdate = true;
  }

  dispose() {
    this.arrows.geometry.dispose();
    (this.arrows.material as THREE.Material).dispose();
    this.arrows.removeFromParent();
  }
}
