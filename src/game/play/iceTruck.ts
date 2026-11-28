import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { GRID_BLOCKS, LINES, WIDE_LANES } from '../city/layout';
import { groundHeight } from './collision';
import type { RoadGraph } from './roads';
import { moveOf, type TrafficLights } from './trafficLights';

/** The truck drives round the park blocks (grid lines x 7–9, z 3–5), always turning right. */
const LOOP: [number, number][] = [[7, 3], [8, 3], [9, 3], [9, 4], [9, 5], [8, 5], [7, 5], [7, 4]];
const LANE = WIDE_LANES[2]; // the curb lane
const SPEED = 7;
const PARK_TIME = 22;
const LEN = 5.4, WID = 2.1;

function paint(g: THREE.BufferGeometry, color: string) {
  const geo = g.index ? g.toNonIndexed() : g;
  const c = new THREE.Color(color), n = geo.getAttribute('position').count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) a.set([c.r, c.g, c.b], i * 3);
  geo.setAttribute('color', new THREE.BufferAttribute(a, 3));
  geo.deleteAttribute('uv');
  return geo;
}
const box = (w: number, h: number, d: number, x: number, y: number, z: number, color: string) => paint(new THREE.BoxGeometry(w, h, d).translate(x, y, z), color);

/** A cheerful ice cream van (faces +Z): pink and white, a serving hatch on the right (−X), a cone on the roof. */
function truckGeometry() {
  const parts = [
    box(WID, 0.5, LEN, 0, 0.55, 0, '#f4f1ea'), // chassis / lower body
    box(WID, 1.7, 3.6, 0, 1.65, -0.85, '#ffffff'), // box body (back)
    box(WID * 1.002, 0.35, 3.62, 0, 1.25, -0.85, '#ff6f91'), // pink stripe
    box(WID, 1.2, 1.7, 0, 1.4, 1.75, '#ff9eb5'), // cab
    box(WID * 0.96, 0.55, 0.05, 0, 1.65, 2.61, '#2a3542'), // windscreen
    box(0.05, 0.5, 1.0, -WID / 2 - 0.01, 1.6, 1.8, '#2a3542'), box(0.05, 0.5, 1.0, WID / 2 + 0.01, 1.6, 1.8, '#2a3542'), // side windows
    box(0.05, 0.9, 2.0, -WID / 2 - 0.02, 1.85, -0.7, '#3a2f3a'), // serving hatch (right side)
    box(0.7, 0.06, 2.2, -WID / 2 - 0.35, 2.4, -0.7, '#ff6f91'), // awning over the hatch
    box(0.25, 0.08, 2.0, -WID / 2 - 0.12, 1.36, -0.7, '#ffffff'), // counter
    box(WID * 0.9, 0.12, 3.4, 0, 2.55, -0.85, '#ffd1dc'), // roof
    paint(new THREE.ConeGeometry(0.35, 1.0, 14).rotateX(Math.PI).translate(0, 3.1, -0.85), '#d9a35b'), // giant cone
    paint(new THREE.SphereGeometry(0.42, 14, 10).translate(0, 3.7, -0.85), '#f7a1b8'),
    paint(new THREE.SphereGeometry(0.34, 14, 10).translate(0, 4.12, -0.85), '#fbf0cf'),
    paint(new THREE.SphereGeometry(0.07, 8, 6).translate(0.05, 4.48, -0.85), '#e5484d'), // cherry
    box(1.6, 0.1, 0.12, 0, 0.9, 2.66, '#c9ccd1'), box(1.6, 0.1, 0.12, 0, 0.6, -2.66, '#c9ccd1'), // bumpers
    box(0.3, 0.16, 0.04, -0.7, 1.0, 2.66, '#fff8d6'), box(0.3, 0.16, 0.04, 0.7, 1.0, 2.66, '#fff8d6'), // headlights
  ];
  for (const [x, z] of [[-WID / 2 + 0.05, 1.7], [WID / 2 - 0.05, 1.7], [-WID / 2 + 0.05, -1.7], [WID / 2 - 0.05, -1.7]]) {
    parts.push(paint(new THREE.CylinderGeometry(0.42, 0.42, 0.3, 14).rotateZ(Math.PI / 2).translate(x, 0.42, z), '#1c1d20'));
  }
  return mergeGeometries(parts)!;
}

/**
 * The ice cream truck: drives round the park in the curb lane, stops at red lights and for cars and
 * people ahead, and now and then parks at the curb for a while playing its jingle; walk up to the
 * hatch to buy a cone.
 */
export class IceTruck {
  readonly root = new THREE.Group();
  private path: { x: number; z: number; s: number }[] = [];
  /** Where crossings are along the path: s of the stop line, the nodes and the turn. */
  private crossings: { s: number; from: number; to: number; next: number }[] = [];
  private parks: number[] = [];
  private total = 0;
  private s = 0;
  private speed = 0;
  private parked = 0;
  private nextPark = 0;
  heading = 0;
  x = 0;
  z = 0;

  constructor(private graph: RoadGraph) {
    const mesh = new THREE.Mesh(truckGeometry(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55 }));
    mesh.castShadow = true;
    this.root.add(mesh);
    // Build the path in the curb lane: the 4 corners of the loop rounded (radius 4 m), joined by
    // straight runs; then cut into short pieces so distances along it are exact.
    const n = GRID_BLOCKS + 1, id = (i: number, j: number) => i * n + j;
    const P = LOOP.map(([i, j]) => ({ x: LINES[i], z: LINES[j] }));
    const dirOf = (a: { x: number; z: number }, b: { x: number; z: number }) => ({ x: Math.sign(b.x - a.x), z: Math.sign(b.z - a.z) });
    const rough: { x: number; z: number }[] = [];
    const R = 4;
    for (let k = 0; k < P.length; k++) {
      const prev = P[(k + P.length - 1) % P.length], b = P[k], next = P[(k + 1) % P.length];
      const d = dirOf(prev, b), d2 = dirOf(b, next);
      if (d.x === d2.x && d.z === d2.z) continue; // straight through: no corner here
      const r = { x: -d.z, z: d.x }, r2 = { x: -d2.z, z: d2.x };
      const cx = b.x + r.x * LANE + r2.x * LANE, cz = b.z + r.z * LANE + r2.z * LANE;
      const p0 = { x: cx - d.x * R, z: cz - d.z * R }, p2 = { x: cx + d2.x * R, z: cz + d2.z * R };
      for (let q = 0; q <= 6; q++) {
        const t = q / 6, u = 1 - t;
        rough.push({ x: u * u * p0.x + 2 * u * t * cx + t * t * p2.x, z: u * u * p0.z + 2 * u * t * cz + t * t * p2.z });
      }
    }
    const pts: { x: number; z: number }[] = [];
    for (let k = 0; k < rough.length; k++) {
      const a = rough[k], b = rough[(k + 1) % rough.length];
      const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 2));
      for (let q = 0; q < steps; q++) pts.push({ x: a.x + ((b.x - a.x) * q) / steps, z: a.z + ((b.z - a.z) * q) / steps });
    }
    let s = 0;
    pts.forEach((p, i) => {
      if (i > 0) s += Math.hypot(p.x - pts[i - 1].x, p.z - pts[i - 1].z);
      this.path.push({ ...p, s });
    });
    this.total = s + Math.hypot(pts[0].x - pts[pts.length - 1].x, pts[0].z - pts[pts.length - 1].z);
    // Stop lines: 15.5 m before each crossing node (avenue half width + the zebra), along the path.
    for (let k = 0; k < LOOP.length; k++) {
      const [ai, aj] = LOOP[k], [bi, bj] = LOOP[(k + 1) % LOOP.length], [ci, cj] = LOOP[(k + 2) % LOOP.length];
      const b = { x: LINES[bi], z: LINES[bj] };
      const stopAt = this.nearestS(b.x, b.z) - 15.5;
      this.crossings.push({ s: (stopAt + this.total) % this.total, from: id(ai, aj), to: id(bi, bj), next: id(ci, cj) });
    }
    // Places to park: in the middle of each block side (between two crossings).
    for (let k = 0; k < LOOP.length; k += 2) {
      const [ai, aj] = LOOP[k], [bi, bj] = LOOP[(k + 1) % LOOP.length];
      this.parks.push(this.nearestS((LINES[ai] + LINES[bi]) / 2, (LINES[aj] + LINES[bj]) / 2));
    }
    this.s = this.parks[0] - 30;
    this.nextPark = 1;
    this.place();
  }

  private nearestS(x: number, z: number) {
    let best = 0, bd = Infinity;
    for (const p of this.path) { const d = Math.hypot(p.x - x, p.z - z); if (d < bd) { bd = d; best = p.s; } }
    return best;
  }

  private at(s: number) {
    s = ((s % this.total) + this.total) % this.total;
    let i = 1;
    while (i < this.path.length && this.path[i].s < s) i++;
    const a = this.path[i - 1], b = this.path[i % this.path.length], len = (i < this.path.length ? b.s : this.total) - a.s || 1;
    const k = (s - a.s) / len;
    return { x: a.x + (b.x - a.x) * k, z: a.z + (b.z - a.z) * k, h: Math.atan2(b.x - a.x, b.z - a.z) };
  }

  private place() {
    const p = this.at(this.s), ahead = this.at(this.s + 1.5);
    this.x = p.x; this.z = p.z;
    this.heading = Math.atan2(ahead.x - p.x, ahead.z - p.z);
    this.root.position.set(p.x, groundHeight(p.x, p.z), p.z);
    this.root.rotation.y = this.heading;
  }

  /** Parked at the curb right now (selling ice cream). */
  get isParked() { return this.parked > 0; }

  /** The spot by the serving hatch (sidewalk side). */
  get hatch() {
    const r = { x: -Math.cos(this.heading), z: Math.sin(this.heading) }; // the truck's right side
    return { x: this.x + r.x * 2.2 - Math.sin(this.heading) * 0.7, z: this.z + r.z * 2.2 - Math.cos(this.heading) * 0.7 };
  }

  /** For traffic: the truck as an obstacle. */
  get body() { return { x: this.x, z: this.z, h: this.heading, half: LEN / 2, r: WID / 2 }; }

  /** obstacles: cars and people (circles) the truck must not drive into. Returns true when it just parked. */
  update(dt: number, lights: TrafficLights | undefined, obstacles: { x: number; z: number; r: number }[]): boolean {
    let justParked = false;
    if (this.parked > 0) {
      this.parked -= dt;
      this.speed = 0;
      return false;
    }
    let allowed = SPEED;
    const s = ((this.s % this.total) + this.total) % this.total;
    const dist = (target: number) => ((target - s) % this.total + this.total) % this.total;
    // Park at the next parking spot.
    const pd = dist(this.parks[this.nextPark]);
    if (pd < 25) allowed = Math.min(allowed, Math.sqrt(2 * 3 * Math.max(0, pd - 0.3)));
    if (pd < 0.4 && this.speed < 0.5) { this.parked = PARK_TIME; this.nextPark = (this.nextPark + 1) % this.parks.length; justParked = true; }
    // Traffic lights ahead.
    for (const c of this.crossings) {
      const d = dist(c.s);
      if (d > 30) continue;
      const N = this.graph.nodes;
      const light = lights?.state(c.from, c.to, moveOf(N[c.from], N[c.to], N[c.next]));
      if (light === 'red' || (light === 'amber' && d > (this.speed * this.speed) / 10 + 1)) allowed = Math.min(allowed, Math.sqrt(2 * 4 * Math.max(0, d - 0.5)));
    }
    // Cars and people in front.
    const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
    for (const o of obstacles) {
      const rx = o.x - this.x, rz = o.z - this.z, ahead = rx * fx + rz * fz;
      if (ahead <= 0 || ahead > 20) continue;
      if (Math.abs(rx * fz - rz * fx) > WID / 2 + o.r + 0.4) continue;
      allowed = Math.min(allowed, Math.sqrt(2 * 5 * Math.max(0, ahead - LEN / 2 - o.r - 1.2)));
    }
    this.speed += THREE.MathUtils.clamp(allowed - this.speed, -8 * dt, 2 * dt);
    this.speed = Math.max(0, Math.min(this.speed, allowed + 0.01));
    this.s += this.speed * dt;
    this.place();
    return justParked;
  }

  dispose() {
    this.root.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { m.geometry.dispose(); (m.material as THREE.Material).dispose(); } });
    this.root.removeFromParent();
  }
}
