import * as THREE from 'three';
import { PAINT_COLORS, VEHICLES } from '../vehicles/catalog';
import type { BuiltCar } from '../vehicles/carBuilder';
import { buildVehicle, vehicleDims } from '../vehicles/factory';
import type { VehicleSpec } from '../vehicles/types';
import { groundHeight } from './collision';
import type { Pedestrians } from './pedestrians';
import { LANE, type P, type RoadGraph } from './roads';
import type { Vehicle } from './vehicle';

/**
 * Friendly AI traffic. Cars drive in the right-hand lane, turn smoothly at
 * intersections, take turns at crossings, and ALWAYS stop for people, for the
 * player and for each other. Only cars near the player exist (recycled).
 */

const CRUISE = 9.5; // m/s (~34 km/h)
const TURN = 5;
const DECEL = 7;
const INSET = 7; // where the turn curve starts/ends, from the intersection center

type Seg =
  | { kind: 'line'; a: P; b: P; len: number }
  | { kind: 'curve'; p0: P; p1: P; p2: P; len: number; straight: boolean };

interface Car {
  spec: VehicleSpec;
  built: BuiltCar;
  root: THREE.Group;
  half: number;
  radius: number;
  from: number;
  to: number;
  seg: Seg;
  d: number;
  speed: number;
  x: number;
  z: number;
  heading: number;
  waited: number;
  holds: number;
  hasDriver: boolean;
  spin: number;
  /** Node after `to`, chosen once when approaching the intersection. */
  nextNode?: number;
}

const sub = (a: P, b: P) => ({ x: a.x - b.x, z: a.z - b.z });
const norm = (v: P) => { const l = Math.hypot(v.x, v.z) || 1; return { x: v.x / l, z: v.z / l }; };
const right = (d: P) => ({ x: -d.z, z: d.x });

export class Traffic {
  readonly group = new THREE.Group();
  readonly cars: Car[] = [];
  private owners = new Map<number, Car>();
  private pending: number;

  constructor(private graph: RoadGraph, count: number) {
    this.pending = count;
  }

  /** Lane point at distance s from node a towards node b. */
  private lanePoint(a: number, b: number, s: number): P {
    const A = this.graph.nodes[a], B = this.graph.nodes[b];
    const d = norm(sub(B, A)), r = right(d);
    return { x: A.x + d.x * s + r.x * LANE, z: A.z + d.z * s + r.z * LANE };
  }

  private lineSeg(a: number, b: number): Seg {
    const len = Math.hypot(this.graph.nodes[b].x - this.graph.nodes[a].x, this.graph.nodes[b].z - this.graph.nodes[a].z);
    const p = this.lanePoint(a, b, INSET), q = this.lanePoint(a, b, len - INSET);
    return { kind: 'line', a: p, b: q, len: Math.hypot(q.x - p.x, q.z - p.z) };
  }

  private curveSeg(a: number, b: number, c: number): Seg {
    const N = this.graph.nodes;
    const lenAB = Math.hypot(N[b].x - N[a].x, N[b].z - N[a].z);
    const p0 = this.lanePoint(a, b, lenAB - INSET), p2 = this.lanePoint(b, c, INSET);
    const d1 = norm(sub(N[b], N[a])), d2 = norm(sub(N[c], N[b]));
    const dot = d1.x * d2.x + d1.z * d2.z;
    const r1 = right(d1), r2 = right(d2), B = N[b];
    const p1 = dot > 0.9 ? { x: B.x + r1.x * LANE, z: B.z + r1.z * LANE }
      : dot < -0.9 ? { x: B.x + d1.x * 6, z: B.z + d1.z * 6 }
      : { x: B.x + (r1.x + r2.x) * LANE, z: B.z + (r1.z + r2.z) * LANE };
    const chord = Math.hypot(p2.x - p0.x, p2.z - p0.z);
    const len = (Math.hypot(p1.x - p0.x, p1.z - p0.z) + Math.hypot(p2.x - p1.x, p2.z - p1.z) + chord) / 2;
    return { kind: 'curve', p0, p1, p2, len, straight: dot > 0.9 };
  }

  private sample(seg: Seg, d: number) {
    const t = Math.min(1, d / seg.len);
    if (seg.kind === 'line') {
      const dir = norm(sub(seg.b, seg.a));
      return { x: seg.a.x + (seg.b.x - seg.a.x) * t, z: seg.a.z + (seg.b.z - seg.a.z) * t, dir };
    }
    const u = 1 - t;
    const x = u * u * seg.p0.x + 2 * u * t * seg.p1.x + t * t * seg.p2.x;
    const z = u * u * seg.p0.z + 2 * u * t * seg.p1.z + t * t * seg.p2.z;
    const dir = norm({ x: 2 * u * (seg.p1.x - seg.p0.x) + 2 * t * (seg.p2.x - seg.p1.x), z: 2 * u * (seg.p1.z - seg.p0.z) + 2 * t * (seg.p2.z - seg.p1.z) });
    return { x, z, dir };
  }

  private pickNext(car: Car) {
    const opts = this.graph.adj[car.to].filter((n) => n !== car.from);
    const list = opts.length ? opts : this.graph.adj[car.to];
    // Prefer going straight a bit.
    const N = this.graph.nodes, d1 = norm(sub(N[car.to], N[car.from]));
    const straight = list.find((n) => { const d2 = norm(sub(N[n], N[car.to])); return d1.x * d2.x + d1.z * d2.z > 0.9; });
    return straight !== undefined && Math.random() < 0.5 ? straight : list[Math.floor(Math.random() * list.length)];
  }

  /** Put a car on a random road piece 50-180 m from the focus, away from other cars. */
  private place(car: Car, focus: P): boolean {
    for (let tries = 0; tries < 25; tries++) {
      const [a, b] = this.graph.edges[Math.floor(Math.random() * this.graph.edges.length)];
      const [from, to] = Math.random() < 0.5 ? [a, b] : [b, a];
      const seg = this.lineSeg(from, to);
      const d = Math.random() * seg.len;
      const p = this.sample(seg, d);
      const dist = Math.hypot(p.x - focus.x, p.z - focus.z);
      if (dist < 50 || dist > 180) continue;
      if (this.cars.some((c) => c !== car && Math.hypot(c.x - p.x, c.z - p.z) < 16)) continue;
      if (car.holds >= 0 && this.owners.get(car.holds) === car) this.owners.delete(car.holds);
      Object.assign(car, { from, to, seg, d, speed: CRUISE * 0.6, x: p.x, z: p.z, heading: Math.atan2(p.dir.x, p.dir.z), waited: 0, holds: -1 });
      return true;
    }
    return false;
  }

  private build(focus: P) {
    const cars = VEHICLES.filter((v) => v.kind === 'car' && v.price < 100000);
    const spec = cars[Math.floor(Math.random() * cars.length)];
    const built = buildVehicle(spec, PAINT_COLORS[Math.floor(Math.random() * PAINT_COLORS.length)]);
    const root = new THREE.Group();
    root.add(built.root);
    const dims = vehicleDims(spec);
    const car: Car = {
      spec, built, root, half: dims.length / 2, radius: dims.width / 2,
      from: 0, to: 0, seg: this.lineSeg(...this.graph.edges[0]), d: 0, speed: 0, x: 0, z: 0, heading: 0,
      waited: 0, holds: -1, hasDriver: false, spin: 0,
    };
    this.cars.push(car);
    this.group.add(root);
    if (!this.place(car, focus)) root.visible = false;
  }

  /** Circles (x, z, r) covering each traffic car, for collisions. */
  circles(): { x: number; z: number; r: number }[] {
    const out: { x: number; z: number; r: number }[] = [];
    for (const c of this.cars) {
      if (!c.root.visible) continue;
      const fx = Math.sin(c.heading), fz = Math.cos(c.heading), o = c.half - c.radius;
      for (const k of [o, 0, -o]) out.push({ x: c.x + fx * k, z: c.z + fz * k, r: c.radius });
    }
    return out;
  }

  update(dt: number, focus: P, player: Vehicle, walker: P | null, people: Pedestrians | undefined) {
    // Build the pool gradually (one car per frame) so loading never stutters.
    if (this.pending > 0) { this.pending--; this.build(focus); }

    const peds = people?.obstacles() ?? [];
    const pc = { x: player.x, z: player.z, h: player.heading, half: player.length / 2, r: player.width / 2 };

    for (const car of this.cars) {
      if (!car.hasDriver && people?.ready) {
        const drv = people.makeDriver();
        if (drv) {
          car.built.root.add(drv);
          drv.position.set(car.built.seat.x, 0.02, car.built.seat.z - 0.1);
          drv.scale.multiplyScalar(0.74);
          car.hasDriver = true;
        }
      }
      if (Math.hypot(car.x - focus.x, car.z - focus.z) > 230) { car.root.visible = this.place(car, focus); continue; }

      const fwd = { x: Math.sin(car.heading), z: Math.cos(car.heading) };
      const lateralMax = car.seg.kind === 'curve' ? 2.2 : 1.6;
      let allowed = car.seg.kind === 'curve' && !car.seg.straight ? TURN : CRUISE;
      const forced = car.waited > 8; // never stuck forever: ignore other cars after a long wait
      const check = (x: number, z: number, r: number, isCar: boolean) => {
        if (isCar && forced) return;
        const rx = x - car.x, rz = z - car.z;
        const ahead = rx * fwd.x + rz * fwd.z;
        if (ahead <= 0 || ahead > 32) return;
        if (Math.abs(rx * fwd.z - rz * fwd.x) > lateralMax + r) return;
        const gap = ahead - car.half - r - 1.5;
        allowed = Math.min(allowed, gap <= 0 ? 0 : Math.sqrt(2 * DECEL * gap));
      };
      for (const p of peds) check(p.x, p.z, p.r + 0.4, false);
      if (walker) check(walker.x, walker.z, 0.8, false);
      const po = pc.half - pc.r;
      for (const k of [po, 0, -po]) check(pc.x + Math.sin(pc.h) * k, pc.z + Math.cos(pc.h) * k, pc.r, false);
      for (const o of this.cars) {
        if (o === car || !o.root.visible) continue;
        const oo = o.half - o.radius;
        for (const k of [oo, 0, -oo]) check(o.x + Math.sin(o.heading) * k, o.z + Math.cos(o.heading) * k, o.radius, true);
      }
      // Take turns at intersections: one car at a time crosses each one.
      if (car.seg.kind === 'line') {
        const left = car.seg.len - car.d;
        if (left < 12 && car.holds !== car.to) {
          const owner = this.owners.get(car.to);
          if (owner && owner !== car && !forced) allowed = Math.min(allowed, Math.sqrt(2 * DECEL * Math.max(0, left - 1)));
          else { this.owners.set(car.to, car); car.holds = car.to; }
        }
      }

      const target = Math.min(allowed, CRUISE);
      car.speed += THREE.MathUtils.clamp(target - car.speed, -12 * dt, 3 * dt);
      car.speed = Math.max(0, Math.min(car.speed, allowed + 0.01));
      car.waited = car.speed < 0.3 ? car.waited + dt : 0;

      // Move along the segments.
      car.d += car.speed * dt;
      while (car.d >= car.seg.len) {
        car.d -= car.seg.len;
        if (car.seg.kind === 'line') {
          car.seg = this.curveSeg(car.from, car.to, this.peekNext(car));
        } else {
          if (this.owners.get(car.to) === car) this.owners.delete(car.to);
          car.holds = -1;
          car.from = car.to;
          car.to = car.nextNode!;
          car.nextNode = undefined;
          car.seg = this.lineSeg(car.from, car.to);
        }
      }
      const p = this.sample(car.seg, car.d);
      car.x = p.x; car.z = p.z;
      const want = Math.atan2(p.dir.x, p.dir.z);
      car.heading += Math.atan2(Math.sin(want - car.heading), Math.cos(want - car.heading)) * Math.min(1, dt * 12);

      const visible = Math.hypot(car.x - focus.x, car.z - focus.z) < 170;
      car.root.visible = visible;
      if (visible) {
        car.root.position.set(car.x, groundHeight(car.x, car.z), car.z);
        car.root.rotation.y = car.heading;
        car.spin += car.speed * dt / 0.33;
        for (const w of new Set(Object.values(car.built.wheels))) ((w.userData.spin as THREE.Object3D) ?? w).rotation.x = car.spin;
      }
    }
  }

  /** The node after `to` (chosen once per intersection). */
  private peekNext(car: Car) {
    if (car.nextNode === undefined) car.nextNode = this.pickNext(car);
    return car.nextNode;
  }

  dispose() {
    for (const c of this.cars) c.built.dispose();
    this.group.removeFromParent();
  }
}
