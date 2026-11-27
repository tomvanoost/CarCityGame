import * as THREE from 'three';
import { clearDents } from '../vehicles/dents';
import { PAINT_COLORS, VEHICLES } from '../vehicles/catalog';
import { SKETCHFAB_VEHICLES } from '../vehicles/sketchfabManifest';
import { TurnSignals, headlightRig } from '../world/evening';
import { SEATED_SCALE, seatedRootPosition, type BuiltCar } from '../vehicles/carBuilder';
import { loadVehicle, vehicleDims } from '../vehicles/factory';
import type { VehicleSpec } from '../vehicles/types';
import { groundHeight } from './collision';
import type { Pedestrians } from './pedestrians';
import { LANE, type P, type RoadGraph } from './roads';
import { moveOf, type TrafficLights } from './trafficLights';
import type { Vehicle } from './vehicle';

/**
 * Friendly AI traffic. Cars drive in the right-hand lane, turn smoothly at
 * intersections, take turns at crossings, and ALWAYS stop for people, for the
 * player and for each other. Only cars near the player exist (recycled).
 */

const CRUISE = 13.9; // m/s (50 km/h in the city)
const TURN = 6;
const DECEL = 7;
/** How fast a car may take a bend: straight on = no limit, a gentle 45° bend (the autobahn corners) ~90 km/h, a turn slowly. */
const curveSpeed = (dot: number) => (dot > 0.9 ? Infinity : dot > 0.6 ? 25 : TURN);
/** Police siren: cars this close pull over this far toward their curb (half onto the sidewalk) and crawl. */
const SIREN_RANGE = 55;
const PULL_OVER = 2.1; // car edge ~0.6 m over the curb, clear of the trees and lamps 1.3 m from it
const PULL_SPEED = 2.5;

type Seg =
  | { kind: 'line'; a: P; b: P; len: number }
  | { kind: 'curve'; p0: P; p1: P; p2: P; len: number; straight: boolean; dot: number; laneOut: number };

interface Car {
  spec: VehicleSpec;
  /** The model shown now: the light one, or the detailed one when the car is close to you. */
  built: BuiltCar;
  light: BuiltCar;
  full?: BuiltCar;
  loadingFull?: boolean;
  color: string;
  driver?: THREE.Object3D;
  driverScale?: number;
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
  /** 0..1: how far the car has pulled over to the curb for a police siren. */
  pull: number;
  /** Seconds left in the overtaking lane on the highway (0 = keep right). */
  overtake: number;
  /** Turn signals / hazard lights (hidden meshes when off, so no extra draw calls). */
  signals: TurnSignals;
  /** Seconds left with the hazard lights on (after braking hard on the highway). */
  hazard: number;
  /** Node after `to`, chosen once when approaching the intersection. */
  nextNode?: number;
  /** Sideways position: distance from the road's middle to the right (the lane the car is in). */
  lane: number;
}

const sub = (a: P, b: P) => ({ x: a.x - b.x, z: a.z - b.z });
const norm = (v: P) => { const l = Math.hypot(v.x, v.z) || 1; return { x: v.x / l, z: v.z / l }; };
const right = (d: P) => ({ x: -d.z, z: d.x });

export class Traffic {
  readonly group = new THREE.Group();
  readonly cars: Car[] = [];
  private lights = false;
  private owners = new Map<number, Car>();
  /** Traffic lights at the crossings (cars stop at red), and the highway speed now (m/s). */
  private signals?: TrafficLights;
  private highwaySpeed = 100 / 3.6;
  setTrafficLights(l: TrafficLights) { this.signals = l; }
  /** Highway speed limit: 100 km/h by day, 120 km/h at night. */
  setHighwayKmh(kmh: number) { this.highwaySpeed = kmh / 3.6; }
  private pending: number;
  private building = false;
  private disposed = false;

  private detailTimer = 0;

  /** detailSlots: how many nearby cars may use the detailed model (0 on the fastest setting). */
  constructor(private graph: RoadGraph, count: number, private detailSlots = 2) {
    this.pending = count;
  }

  /** Point at distance s from node a towards node b, `lane` meters to the right of the road's middle. */
  private lanePoint(a: number, b: number, s: number, lane = LANE): P {
    const A = this.graph.nodes[a], B = this.graph.nodes[b];
    const d = norm(sub(B, A)), r = right(d);
    return { x: A.x + d.x * s + r.x * lane, z: A.z + d.z * s + r.z * lane };
  }

  /** The straight part of a road, along its middle (the car adds its lane), between the two crossings. */
  private lineSeg(a: number, b: number): Seg {
    const len = Math.hypot(this.graph.nodes[b].x - this.graph.nodes[a].x, this.graph.nodes[b].z - this.graph.nodes[a].z);
    const p = this.lanePoint(a, b, this.graph.insetAt(a, b), 0), q = this.lanePoint(a, b, len - this.graph.insetAt(b, a), 0);
    return { kind: 'line', a: p, b: q, len: Math.hypot(q.x - p.x, q.z - p.z) };
  }

  /** The lane a car turns into: the rightmost for a right turn, the leftmost for a left turn, else the same / middle one. */
  private exitLane(a: number, b: number, c: number, laneIn: number) {
    const N = this.graph.nodes, lanes = this.graph.lanesOf(b, c);
    const move = moveOf(N[a], N[b], N[c]);
    if (move === 'right') return lanes[lanes.length - 1];
    if (move === 'left') return lanes[0];
    return lanes.reduce((best, l) => (Math.abs(l - laneIn) < Math.abs(best - laneIn) ? l : best), lanes[0]);
  }

  private curveSeg(a: number, b: number, c: number, laneIn = LANE, laneOut = LANE): Seg {
    const N = this.graph.nodes;
    const lenAB = Math.hypot(N[b].x - N[a].x, N[b].z - N[a].z);
    const p0 = this.lanePoint(a, b, lenAB - this.graph.insetAt(b, a), laneIn), p2 = this.lanePoint(b, c, this.graph.insetAt(b, c), laneOut);
    const d1 = norm(sub(N[b], N[a])), d2 = norm(sub(N[c], N[b]));
    const dot = d1.x * d2.x + d1.z * d2.z;
    const B = N[b];
    // Control point: where the two lanes meet (turns), halfway (straight on), past the middle (turning around).
    const along = (p2.x - p0.x) * d1.x + (p2.z - p0.z) * d1.z;
    const p1 = dot > 0.9 ? { x: (p0.x + p2.x) / 2, z: (p0.z + p2.z) / 2 }
      : dot < -0.9 ? { x: B.x + d1.x * 6, z: B.z + d1.z * 6 }
      : { x: p0.x + d1.x * along, z: p0.z + d1.z * along };
    const chord = Math.hypot(p2.x - p0.x, p2.z - p0.z);
    const len = (Math.hypot(p1.x - p0.x, p1.z - p0.z) + Math.hypot(p2.x - p1.x, p2.z - p1.z) + chord) / 2;
    return { kind: 'curve', p0, p1, p2, len, straight: dot > 0.9, dot, laneOut };
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
      clearDents(car.root); // a 'new' car: no dents
      // nextNode must be cleared: a turn planned on the car's old road would send it across the blocks.
      const lane = this.graph.cruiseLane(from, to);
      // On the highways cars come in at speed (fast cars keep leaving the area around you and come back).
      const speed = this.graph.isAutobahn(from, to) ? car.spec.topSpeed / 3.6 * 0.8 : this.graph.isHighway(from, to) ? this.highwaySpeed * 0.8 : CRUISE * 0.6;
      Object.assign(car, { from, to, seg, d, lane, speed, x: p.x - p.dir.z * lane, z: p.z + p.dir.x * lane, heading: Math.atan2(p.dir.x, p.dir.z), waited: 0, holds: -1, nextNode: undefined, pull: 0, overtake: 0, hazard: 0 });
      return true;
    }
    return false;
  }

  private async build(focus: P) {
    // Traffic uses the realistic (Sketchfab) cars only, so the street looks consistent.
    const all = VEHICLES.filter((v) => v.kind === 'car' && v.price < 100000 && !v.siren);
    const real = all.filter((v) => v.id in SKETCHFAB_VEHICLES);
    const cars = real.length >= 4 ? real : all;
    const spec = cars[Math.floor(Math.random() * cars.length)];
    const color = PAINT_COLORS[Math.floor(Math.random() * PAINT_COLORS.length)];
    const built = await loadVehicle(spec, color, { lod: true });
    if (this.disposed) { built.dispose(); return; }
    const root = new THREE.Group();
    root.add(built.root);
    const dims = vehicleDims(spec);
    const head = headlightRig(dims.length, dims.width);
    head.visible = this.lights;
    root.add(head);
    const signals = new TurnSignals(dims.length, dims.width);
    root.add(signals.group);
    const car: Car = {
      spec, built, light: built, color, root, half: dims.length / 2, radius: dims.width / 2,
      from: 0, to: 0, seg: this.lineSeg(...this.graph.edges[0]), d: 0, speed: 0, x: 0, z: 0, heading: 0,
      waited: 0, holds: -1, hasDriver: false, spin: 0, pull: 0, overtake: 0, signals, hazard: 0, lane: LANE,
    };
    this.cars.push(car);
    this.group.add(root);
    if (!this.place(car, focus)) root.visible = false;
  }

  /** Is lane `lane` of this car's road free from a bit behind it to well ahead (to change into it)? */
  private laneFree(car: Car, lane: number, you: { x: number; z: number; v: number }) {
    if (this.cars.some((o) => o !== car && o.root.visible && o.from === car.from && o.to === car.to && o.seg.kind === 'line'
      && Math.abs(o.lane - lane) < 1.8 && o.d > car.d - 18 && o.d < car.d + 30)) return false;
    // You (the player): in that lane, a bit ahead, or behind and coming closer? Then it isn't free:
    // the faster you come, the further back you're seen (5 s of closing speed).
    const fx = Math.sin(car.heading), fz = Math.cos(car.heading), rx = you.x - car.x, rz = you.z - car.z;
    const along = rx * fx + rz * fz, right = -rx * fz + rz * fx; // + = to the car's right (lanes count to the right)
    if (Math.abs(right - (lane - car.lane)) > 2.2) return true;
    const behind = 20 + Math.max(0, you.v - car.speed) * 5;
    return !(along > -behind && along < 30);
  }

  /** Evening: headlights on for every traffic car. */
  setLights(on: boolean) {
    this.lights = on;
    for (const c of this.cars) { const h = c.root.getObjectByName('CCG_HEADLIGHTS'); if (h) h.visible = on; }
  }

  /** Circles (x, z, r) covering each traffic car, for collisions. */
  circles(): { x: number; z: number; r: number; car: THREE.Object3D }[] {
    const out: { x: number; z: number; r: number; car: THREE.Object3D }[] = [];
    for (const c of this.cars) {
      if (!c.root.visible) continue;
      const fx = Math.sin(c.heading), fz = Math.cos(c.heading), o = c.half - c.radius;
      for (const k of [o, 0, -o]) out.push({ x: c.x + fx * k, z: c.z + fz * k, r: c.radius, car: c.root });
    }
    return out;
  }

  /** siren: the player's police car has its siren on; nearby cars pull over to let it pass. */
  update(dt: number, focus: P, player: Vehicle, walker: P | null, people: Pedestrians | undefined, siren = false) {
    // Build the pool gradually (one car per frame) so loading never stutters.
    if (this.pending > 0 && !this.building) {
      this.pending--;
      this.building = true;
      this.build(focus).finally(() => { this.building = false; });
    }

    this.detailTimer -= dt;
    if (this.detailTimer <= 0) { this.detailTimer = 0.5; this.updateDetail(focus); }

    const peds = people?.obstacles() ?? [];
    const pc = { x: player.x, z: player.z, h: player.heading, half: player.length / 2, r: player.width / 2, v: Math.abs(player.speed) };

    for (const car of this.cars) {
      if (!car.hasDriver && people?.ready) {
        const drv = people.makeDriver();
        if (drv) {
          car.built.root.add(drv);
          car.driver = drv;
          car.driverScale = drv.scale.x;
          const scale = car.built.seatScale ?? SEATED_SCALE;
          drv.position.copy(seatedRootPosition(car.built.seat, scale));
          drv.scale.multiplyScalar(scale);
          car.hasDriver = true;
        }
      }
      if (Math.hypot(car.x - focus.x, car.z - focus.z) > 230) { car.root.visible = this.place(car, focus); continue; }

      const fwd = { x: Math.sin(car.heading), z: Math.cos(car.heading) };
      const lateralMax = car.seg.kind === 'curve' ? 2.2 : 1.6;
      const N = this.graph.nodes;
      // City streets 50 km/h, the A1 100 / 120 km/h, the autobahn (A2) as fast as the car can go.
      const autobahn = this.graph.isAutobahn(car.from, car.to);
      const cruise = autobahn ? Math.max(this.highwaySpeed, car.spec.topSpeed / 3.6) : this.graph.isHighway(car.from, car.to) ? this.highwaySpeed : CRUISE;
      let allowed = car.seg.kind === 'curve' ? Math.min(cruise, curveSpeed(car.seg.dot)) : cruise;
      let carAhead = false;
      const left = car.seg.kind === 'line' ? car.seg.len - car.d : Infinity;
      // Waiting at a red light is normal: only give up waiting for other cars after much longer there.
      const nearLights = left < 60 && !!this.signals?.hasLights(car.to);
      const forced = car.waited > (nearLights ? 50 : 8); // never stuck forever: ignore other cars after a long wait
      const look = Math.max(32, (car.speed * car.speed) / (2 * DECEL) + 12); // fast cars look further ahead
      // Highway lanes: keep right; see a slower car far ahead in your lane in time and move to the left
      // lane before having to brake, but only when that lane is free (also of you, coming up behind).
      const onHighway = autobahn || this.graph.isHighway(car.from, car.to);
      const hwLanes = onHighway && car.seg.kind === 'line' ? this.graph.lanesOf(car.from, car.to) : null;
      let hwGoal: number | null = null, slowAhead = Infinity;
      if (hwLanes) {
        car.overtake = Math.max(0, car.overtake - dt);
        const plan = Math.max(60, car.speed * 5);
        for (const o of this.cars) {
          if (o === car || !o.root.visible || o.from !== car.from || o.to !== car.to || o.seg.kind !== 'line') continue;
          const gap = o.d - car.d;
          if (gap > 0 && gap < plan && Math.abs(o.lane - car.lane) < 1.8) slowAhead = Math.min(slowAhead, o.speed);
        }
        const leftLane = hwLanes[0], keep = this.graph.cruiseLane(car.from, car.to);
        if (slowAhead < cruise * 0.92 && car.lane > leftLane + 0.5 && left > 80 && this.laneFree(car, leftLane, pc)) car.overtake = 5;
        // Stay left while overtaking, or while the right lane next to you isn't free yet.
        hwGoal = car.overtake > 0 || (car.lane < keep - 0.5 && !this.laneFree(car, keep, pc)) ? leftLane : keep;
      }
      const check = (x: number, z: number, r: number, isCar: boolean) => {
        if (isCar && forced) return;
        const rx = x - car.x, rz = z - car.z;
        const ahead = rx * fwd.x + rz * fwd.z;
        if (ahead <= 0 || ahead > look) return;
        if (Math.abs(rx * fwd.z - rz * fwd.x) > lateralMax + r) return;
        const gap = ahead - car.half - r - 1.5;
        const v = gap <= 0 ? 0 : Math.sqrt(2 * DECEL * gap);
        if (isCar && v < cruise * 0.9) carAhead = true;
        allowed = Math.min(allowed, v);
      };
      for (const p of peds) check(p.x, p.z, p.r + 0.4, false);
      if (walker) check(walker.x, walker.z, 0.8, false);
      const po = pc.half - pc.r;
      for (const k of [po, 0, -po]) check(pc.x + Math.sin(pc.h) * k, pc.z + Math.cos(pc.h) * k, pc.r, false);
      for (const o of this.cars) {
        if (o === car || !o.root.visible) continue;
        // Moving over to another highway lane: the car in the lane you're leaving no longer counts
        // (once you're partly across and not right behind it), so you don't brake for it.
        if (hwGoal !== null && o.from === car.from && o.to === car.to && Math.abs(o.lane - hwGoal) > 1.8
          && Math.abs(car.lane - hwGoal) < 2.6 && o.d - car.d > car.half + o.half + 4) continue;
        const oo = o.half - o.radius;
        for (const k of [oo, 0, -oo]) check(o.x + Math.sin(o.heading) * k, o.z + Math.cos(o.heading) * k, o.radius, true);
      }
      // Slow down in time before a bend or a turn (the end of the highway, the autobahn corners).
      if (left < 250 && car.speed > TURN) {
        const A = N[car.from], B = N[car.to], C = N[this.peekNext(car)];
        const l1 = Math.hypot(B.x - A.x, B.z - A.z) || 1, l2 = Math.hypot(C.x - B.x, C.z - B.z) || 1;
        const vb = curveSpeed(((B.x - A.x) * (C.x - B.x) + (B.z - A.z) * (C.z - B.z)) / (l1 * l2));
        if (vb < car.speed) allowed = Math.min(allowed, Math.sqrt(vb * vb + 2 * DECEL * 0.6 * Math.max(0, left)));
      }
      // Traffic lights: stop at the line on red, and on amber when there's still room to stop.
      let redStop = false;
      if (left < 45 && this.signals && car.holds !== car.to) {
        const light = this.signals.state(car.from, car.to, moveOf(N[car.from], N[car.to], N[this.peekNext(car)]));
        const stopDist = (car.speed * car.speed) / (2 * DECEL);
        if (light === 'red' || (light === 'amber' && left > stopDist + 1)) {
          redStop = true;
          allowed = Math.min(allowed, Math.sqrt(2 * DECEL * Math.max(0, left - car.half - 1.6))); // front bumper just behind the stop line
        }
      }
      // Take turns at intersections: one car at a time crosses each one.
      if (car.seg.kind === 'line') {
        // (At crossings with traffic lights the lights take care of this.)
        if (left < 12 && car.holds !== car.to && !redStop && !this.signals?.hasLights(car.to)) {
          const owner = this.owners.get(car.to);
          if (owner && owner !== car && !forced) allowed = Math.min(allowed, Math.sqrt(2 * DECEL * Math.max(0, left - 1)));
          else { this.owners.set(car.to, car); car.holds = car.to; }
        }
      }

      // Police siren nearby: pull over to the curb and crawl, so the police car can pass.
      const wantPull = siren && Math.hypot(car.x - player.x, car.z - player.z) < SIREN_RANGE ? 1 : 0;
      car.pull += THREE.MathUtils.clamp(wantPull - car.pull, -0.7 * dt, 1.1 * dt);
      if (car.pull > 0.05) allowed = Math.min(allowed, PULL_SPEED + (1 - car.pull) * CRUISE);

      const target = Math.min(allowed, cruise);
      // Lights like real drivers: hazard lights when braking hard on the highway (a jam ahead) or when
      // pulled over for a siren; otherwise the turn signal on the last stretch before turning.
      // Hazard lights only for a real jam: braking hard for a very slow car, with no way to go around.
      if (onHighway && carAhead && car.speed > 16 && target < car.speed * 0.45 && slowAhead < cruise * 0.4 && car.overtake <= 0) car.hazard = 5;
      car.hazard = Math.max(0, car.hazard - dt);
      let blinkSide: 'left' | 'right' | 'both' | null = null;
      if (car.hazard > 0 || car.pull > 0.3) blinkSide = 'both';
      else if (hwGoal !== null && Math.abs(hwGoal - car.lane) > 0.3) blinkSide = hwGoal < car.lane ? 'left' : 'right'; // changing lanes
      else if (car.seg.kind === 'line' && left < 45 && !autobahn) { // (not for the autobahn's gentle bends)
        const mv = moveOf(N[car.from], N[car.to], N[this.peekNext(car)]);
        if (mv !== 'straight') blinkSide = mv;
      } else if (car.seg.kind === 'curve' && !car.seg.straight) blinkSide = car.signals.side === 'both' ? null : car.signals.side;
      car.signals.side = blinkSide;
      car.signals.update(dt);
      car.speed += THREE.MathUtils.clamp(target - car.speed, -12 * dt, (autobahn ? 5 : 3) * dt);
      car.speed = Math.max(0, Math.min(car.speed, allowed + 0.01));
      car.waited = car.speed < 0.3 ? car.waited + dt : 0;

      // Lanes: on an avenue, pick the turning lane well before a crossing with lights, else drive in the middle lane.
      let laneGoal = car.lane;
      if (car.seg.kind === 'line') {
        const lanes = this.graph.lanesOf(car.from, car.to);
        laneGoal = this.graph.cruiseLane(car.from, car.to);
        if (hwGoal !== null) laneGoal = hwGoal; // highway: decided above (overtaking)
        else if (lanes.length > 1 && left < 75 && this.signals?.hasLights(car.to)) {
          const mv = moveOf(N[car.from], N[car.to], N[this.peekNext(car)]);
          laneGoal = mv === 'left' ? lanes[0] : mv === 'right' ? lanes[lanes.length - 1] : lanes[1];
        }
      }
      const laneStep = THREE.MathUtils.clamp(laneGoal - car.lane, -1.6 * dt, 1.6 * dt);
      car.lane += laneStep;

      // Move along the segments.
      car.d += car.speed * dt;
      while (car.d >= car.seg.len) {
        car.d -= car.seg.len;
        if (car.seg.kind === 'line') {
          const next = this.peekNext(car);
          car.seg = this.curveSeg(car.from, car.to, next, car.lane, this.exitLane(car.from, car.to, next, car.lane));
        } else {
          car.lane = car.seg.laneOut;
          if (this.owners.get(car.to) === car) this.owners.delete(car.to);
          car.holds = -1;
          car.from = car.to;
          car.to = car.nextNode!;
          car.nextNode = undefined;
          car.seg = this.lineSeg(car.from, car.to);
        }
      }
      const p = this.sample(car.seg, car.d);
      // On a straight part the car drives in its lane (curves already run lane to lane); pulled over: toward the curb.
      const off = car.pull * PULL_OVER + (car.seg.kind === 'line' ? car.lane : 0);
      car.x = p.x - p.dir.z * off; car.z = p.z + p.dir.x * off;
      // Changing lanes: the car turns a little towards the side it moves to.
      const side = car.seg.kind === 'line' && car.speed > 0.5 ? laneStep / dt : 0;
      const fwdSpeed = Math.max(car.speed, 1); // standing still: just face along the road
      const want = Math.atan2(p.dir.x * fwdSpeed - p.dir.z * side, p.dir.z * fwdSpeed + p.dir.x * side);
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

  /**
   * The few traffic cars close to you get the detailed model (textures, real lights and wheels);
   * the rest stay the light one-draw-call version. Swapped back (and freed) when they drive off.
   */
  private updateDetail(focus: P) {
    const dist = (c: Car) => Math.hypot(c.x - focus.x, c.z - focus.z);
    const near = this.detailSlots > 0
      ? this.cars.filter((c) => c.root.visible && dist(c) < (c.full ? 40 : 28)).sort((a, b) => dist(a) - dist(b)).slice(0, this.detailSlots)
      : [];
    for (const c of this.cars) {
      const want = near.includes(c);
      if (want && !c.full && !c.loadingFull) {
        c.loadingFull = true;
        // The model's own colors, like the light version (which has its colors baked in): no color jump.
        loadVehicle(c.spec).then((full) => {
          c.loadingFull = false;
          if (this.disposed || !this.cars.includes(c)) { full.dispose(); return; }
          c.full = full;
          this.show(c, full);
        }).catch(() => { c.loadingFull = false; });
      } else if (!want && c.full) {
        const full = c.full;
        c.full = undefined;
        this.show(c, c.light);
        full.dispose();
      }
    }
  }

  /** Puts this model in the car (with its driver and the same wheel spin). */
  private show(c: Car, model: BuiltCar) {
    if (c.built === model) return;
    c.built.root.removeFromParent();
    c.root.add(model.root);
    c.built = model;
    if (c.driver) {
      model.root.add(c.driver);
      const scale = model.seatScale ?? SEATED_SCALE;
      c.driver.position.copy(seatedRootPosition(model.seat, scale));
      c.driver.scale.setScalar((c.driverScale ?? 1) * scale);
    }
  }

  /** The node after `to` (chosen once per intersection). */
  private peekNext(car: Car) {
    // Safety net: only ever turn onto a road that really leaves the crossing the car drives to.
    if (car.nextNode !== undefined && !this.graph.adj[car.to].includes(car.nextNode)) car.nextNode = undefined;
    if (car.nextNode === undefined) car.nextNode = this.pickNext(car);
    return car.nextNode;
  }

  dispose() {
    this.disposed = true;
    for (const c of this.cars) { c.light.dispose(); c.full?.dispose(); c.signals.dispose(); }
    this.group.removeFromParent();
  }
}

const TRAFFIC_KEY = 'carcity.traffic';
/** ⚙️ Settings: traffic cars on or off (saved on this device; on by default). */
export function loadTrafficOn(): boolean {
  try { return localStorage.getItem(TRAFFIC_KEY) !== 'off'; } catch { return true; }
}
export function saveTrafficOn(on: boolean) {
  try { localStorage.setItem(TRAFFIC_KEY, on ? 'on' : 'off'); } catch { /* private mode */ }
}
