import * as THREE from 'three';
import { buildCar, type BuiltCar } from '../vehicles/carBuilder';
import type { VehicleSpec } from '../vehicles/types';
import { groundHeight, type CollisionWorld } from './collision';

export interface Obstacle { x: number; z: number; r: number }

export interface DriveInput { throttle: number; brake: number; steer: number; handbrake: boolean }

/**
 * Arcade car: easy to drive for kids, no damage. A simple bicycle model:
 * the heading changes with speed / wheelbase * tan(steering angle).
 * Bumping into things just pushes the car back and slows it down.
 */
export class Vehicle {
  readonly car: BuiltCar;
  readonly root = new THREE.Group();
  /** Position on the ground (x, z), heading: 0 = facing +Z. */
  x = 0;
  z = 0;
  heading = 0;
  /** Forward speed in m/s (negative = reversing). */
  speed = 0;
  private steerAngle = 0;
  private y = 0;
  private roll = 0;
  private pitch = 0;
  private wheelSpin = 0;
  private readonly maxSpeed: number;
  private readonly accel: number;
  private readonly wheelbase: number;
  private readonly radius: number;
  private readonly circles: number[];
  private tmp = { x: 0, z: 0 };
  /** Set when the car bumped into something this frame (for a little shake). */
  bumped = 0;
  /** True while the car is braking by itself for a person. */
  yielding = false;

  constructor(readonly spec: VehicleSpec, color?: string) {
    this.car = buildCar(spec.shape, color ?? spec.color);
    this.root.add(this.car.root);
    const s = spec.shape;
    this.maxSpeed = 8 + spec.stats.speed * 2; // Golfo: 18 m/s = 65 km/h
    this.accel = 3 + spec.stats.accel * 0.6;
    this.wheelbase = (s.rearAxle - s.frontAxle) * s.length;
    this.radius = s.width / 2;
    // Three circles along the length approximate the car's footprint.
    const half = s.length / 2 - this.radius;
    this.circles = [half, 0, -half];
    for (const p of Object.values(this.car.wheels)) p.rotation.order = 'YXZ';
  }

  get length() { return this.spec.shape.length; }
  get width() { return this.spec.shape.width; }
  get kmh() { return Math.abs(this.speed) * 3.6; }

  place(x: number, z: number, heading: number) {
    this.x = x;
    this.z = z;
    this.heading = heading;
    this.speed = 0;
    this.y = groundHeight(x, z);
    this.syncVisual(0);
  }

  update(dt: number, input: DriveInput | null, world: CollisionWorld, people: Obstacle[] = []) {
    // No driver: parked with the handbrake on (never rolls away).
    const inp = input ?? { throttle: 0, brake: 0, steer: 0, handbrake: true };
    // --- speed ---
    if (inp.throttle > 0) {
      if (this.speed < -0.5) this.speed += 14 * inp.throttle * dt; // braking out of reverse
      else this.speed += this.accel * inp.throttle * (1 - Math.max(0, this.speed) / this.maxSpeed) * dt;
    }
    if (inp.brake > 0) {
      if (this.speed > 0.5) this.speed -= 14 * inp.brake * dt;
      else this.speed = Math.max(-5, this.speed - 4 * inp.brake * dt); // reverse
    }
    if (inp.handbrake) this.speed *= Math.pow(0.08, dt);
    if (!inp.throttle && !inp.brake) {
      const drag = 1.6 * dt;
      this.speed = Math.abs(this.speed) <= drag ? 0 : this.speed - Math.sign(this.speed) * drag;
    }
    // --- steering (less steering angle at high speed = stable) ---
    const maxAngle = 0.62 / (1 + Math.abs(this.speed) / 14);
    const target = -inp.steer * maxAngle;
    this.steerAngle += THREE.MathUtils.clamp(target - this.steerAngle, -3 * dt, 3 * dt);
    this.heading += (this.speed / this.wheelbase) * Math.tan(this.steerAngle) * dt;

    // --- never drive into a person: limit speed so the car can always stop in time ---
    this.yielding = this.yieldToPeople(people);

    // --- move + collide ---
    this.x += Math.sin(this.heading) * this.speed * dt;
    this.z += Math.cos(this.heading) * this.speed * dt;
    this.bumped = Math.max(0, this.bumped - dt);
    const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
    for (const off of this.circles) {
      const cx = this.x + fx * off, cz = this.z + fz * off;
      const r = world.resolveCircle(cx, cz, this.radius, this.tmp);
      if (!r.hit) continue;
      this.x += this.tmp.x - cx;
      this.z += this.tmp.z - cz;
      // Only lose speed when driving *into* the obstacle.
      const into = -(r.nx * fx + r.nz * fz) * Math.sign(this.speed || 1);
      if (into > 0.2) {
        if (Math.abs(this.speed) > 3) this.bumped = 0.3;
        this.speed *= 1 - 0.8 * into;
      }
    }
    // Hard safety net: if a person is still touching the car, push the car back and stop.
    for (const off of this.circles) {
      const cx = this.x + fx * off, cz = this.z + fz * off;
      for (const o of people) {
        const dx = cx - o.x, dz = cz - o.z, d = Math.hypot(dx, dz), min = this.radius + o.r;
        if (d < min && d > 1e-4) {
          this.x += (dx / d) * (min - d);
          this.z += (dz / d) * (min - d);
          this.speed = 0;
        }
      }
    }
    this.syncVisual(dt, inp.steer);
  }

  /**
   * Looks ahead (or behind when reversing) for people in the car's path and caps
   * the speed to what still allows a calm stop before them. Returns true if braking.
   */
  private yieldToPeople(people: Obstacle[]): boolean {
    if (Math.abs(this.speed) < 0.05 || !people.length) return false;
    const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
    const dir = Math.sign(this.speed);
    // While turning, the path bends: look a bit wider.
    const extra = 0.6 + Math.abs(this.steerAngle) * 3;
    let allowed = Infinity;
    for (const o of people) {
      const rx = o.x - this.x, rz = o.z - this.z;
      const ahead = (rx * fx + rz * fz) * dir;
      const lateral = Math.abs(rx * fz - rz * fx);
      if (ahead <= 0 || ahead > 30 || lateral > this.width / 2 + o.r + extra) continue;
      const gap = ahead - this.length / 2 - o.r - 0.8;
      allowed = Math.min(allowed, gap <= 0 ? 0 : Math.sqrt(2 * 9 * gap));
    }
    if (allowed === Infinity || Math.abs(this.speed) <= allowed) return false;
    this.speed = dir * allowed;
    return true;
  }

  private syncVisual(dt: number, steer = 0) {
    const gy = groundHeight(this.x, this.z);
    this.y += (gy - this.y) * Math.min(1, dt * 12 || 1); // smooth over curbs
    this.root.position.set(this.x, this.y, this.z);
    this.root.rotation.y = this.heading;
    // A bit of body lean in corners and nose dive when braking: feels alive.
    const targetRoll = THREE.MathUtils.clamp(steer * Math.abs(this.speed) * 0.006, -0.05, 0.05);
    this.roll += (targetRoll - this.roll) * Math.min(1, dt * 5);
    this.car.root.rotation.z = this.roll;
    this.car.root.rotation.x = this.pitch;
    this.wheelSpin += (this.speed * dt) / this.spec.shape.wheelRadius;
    const w = this.car.wheels;
    for (const p of [w.fl, w.fr, w.rl, w.rr]) p.rotation.x = this.wheelSpin;
    w.fl.rotation.y = w.fr.rotation.y = this.steerAngle;
  }

  /** World position of a point given in the car's local space. */
  localToWorld(lx: number, lz: number) {
    const s = Math.sin(this.heading), c = Math.cos(this.heading);
    return { x: this.x + lx * c + lz * s, z: this.z - lx * s + lz * c };
  }

  dispose() {
    this.car.dispose();
    this.root.removeFromParent();
  }
}
