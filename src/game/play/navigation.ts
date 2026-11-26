import * as THREE from 'three';
import { groundHeight } from './collision';
import { LANE, pathLength, pointAt, projectOnPath, type P, type RoadGraph } from './roads';

const SPACING = 7; // meters between road arrows
const AHEAD = 140; // show arrows this far ahead
const MAX_ARROWS = Math.ceil(AHEAD / SPACING) + 1;

/**
 * Turn-by-turn style guidance: a route along the roads to a target, shown as
 * glowing chevrons that flow along the right-hand lane. Recalculates when you leave the route.
 */
export class Navigator {
  readonly arrows: THREE.InstancedMesh;
  target: P | null = null;
  path: P[] = [];
  private length = 0;
  private progress = 0;
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
    this.path = this.graph.route(from, t, heading);
    this.length = pathLength(this.path);
    this.progress = 0;
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
      if (len < this.remaining - 15) { this.path = alt; this.length = len; this.progress = 0; }
    }
    // Left the route? Find a new one (at most twice a second).
    this.recheck -= dt;
    if (pr.d > 18 && this.recheck <= 0) {
      this.recheck = 0.5;
      this.setTarget(this.target, pos, heading);
      return;
    }
    // Flowing chevrons along the lane, starting a few meters ahead.
    const flow = (this.time * 8) % SPACING;
    let k = 0;
    for (let s = this.progress + 7 + flow; s < Math.min(this.length - 2, this.progress + AHEAD) && k < MAX_ARROWS; s += SPACING) {
      const p = pointAt(this.path, s);
      // Right-hand lane: right of the travel direction is (-dz, dx).
      const x = p.x - p.dz * LANE, z = p.z + p.dx * LANE;
      this.q.setFromAxisAngle(this.up, Math.atan2(p.dx, p.dz));
      const fade = 1 - (s - this.progress) / AHEAD;
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
