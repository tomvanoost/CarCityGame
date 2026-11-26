import * as THREE from 'three';
import type { Avatar } from '../avatar/avatar';
import { groundHeight, type CollisionWorld } from './collision';

const WALK = 3.2, RUN = 6.5, GRAVITY = 18, JUMP = 6.2, RADIUS = 0.35;

/** On-foot movement: walk / run / jump with smooth turning and collisions. */
export class Player {
  /** Walking speed right now (m/s), e.g. for other players' walk/run animation in multiplayer. */
  speed = 0;
  x = 0;
  z = 0;
  y = 0;
  heading = 0;
  private vy = 0;
  private grounded = true;
  private tmp = { x: 0, z: 0 };

  constructor(readonly avatar: Avatar) {}

  place(x: number, z: number, heading: number) {
    this.x = x; this.z = z; this.heading = heading;
    this.y = groundHeight(x, z);
    this.vy = 0;
    this.sync();
  }

  /** move: x = right, y = forward (camera relative). camYaw: direction the camera looks from. */
  update(dt: number, move: { x: number; y: number; run: boolean }, jump: boolean, camYaw: number, world: CollisionWorld) {
    // Camera looks along -(sin camYaw, cos camYaw); "forward" for the player is that direction.
    const fx = -Math.sin(camYaw), fz = -Math.cos(camYaw);
    const rx = -fz, rz = fx; // right-hand side
    let dx = fx * move.y + rx * move.x, dz = fz * move.y + rz * move.x;
    const amount = Math.min(1, Math.hypot(move.x, move.y));
    const running = move.run || amount > 0.92;
    const speed = (running ? RUN : WALK) * amount;
    this.speed = amount > 0.05 ? speed : 0;
    if (amount > 0.05) {
      const len = Math.hypot(dx, dz);
      dx /= len; dz /= len;
      const target = Math.atan2(dx, dz);
      let diff = target - this.heading;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      this.heading += diff * Math.min(1, dt * 12);
      this.x += dx * speed * dt;
      this.z += dz * speed * dt;
      world.resolveCircle(this.x, this.z, RADIUS, this.tmp);
      this.x = this.tmp.x;
      this.z = this.tmp.z;
    }
    // Gravity + jumping (also steps up onto curbs smoothly).
    const gy = groundHeight(this.x, this.z);
    if (jump && this.grounded) {
      this.vy = JUMP;
      this.grounded = false;
      this.avatar.play('Jump', { once: true, fade: 0.1, then: 'Idle' });
    }
    this.vy -= GRAVITY * dt;
    this.y += this.vy * dt;
    if (this.y <= gy) {
      if (!this.grounded && this.vy < -2 && gy - this.y < 0.3) this.avatar.play('Idle', { fade: 0.15 });
      this.y = this.grounded ? THREE.MathUtils.lerp(this.y, gy, Math.min(1, dt * 15)) : gy;
      if (gy - this.y > 0.01 && this.grounded) this.y = gy;
      this.vy = 0;
      this.grounded = true;
    }
    // Animation follows the movement.
    if (this.grounded && this.avatar.currentName !== 'Jump') {
      this.avatar.play(amount < 0.05 ? 'Idle' : running ? 'Run' : 'Walk', { fade: 0.2 });
    }
    this.sync();
  }

  private sync() {
    this.avatar.root.position.set(this.x, this.y, this.z);
    this.avatar.root.rotation.y = this.heading;
  }
}
