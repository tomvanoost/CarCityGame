import * as THREE from 'three';
import type { CityLayout } from '../city/layout';
import { groundHeight } from './collision';

export const WASH_PRICE = 10;
export const WASH_TIME = 4.5;

/**
 * The moving parts of the car wash at the gas station (the walls and roof are part of the
 * city mesh): three soft brush rollers that spin and sweep over the car while washing, and
 * foam bubbles that float up and pop. Two draw calls, only drawn near the gas station.
 */
export class CarWash {
  readonly group = new THREE.Group();
  readonly zone: { x0: number; z0: number; x1: number; z1: number };
  private brushes: THREE.InstancedMesh;
  private bubbles: THREE.InstancedMesh;
  private bubbleState: { x: number; y: number; z: number; vy: number; life: number; size: number }[] = [];
  private spin = 0;
  private sweep = 0;
  private y: number;
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private v = new THREE.Vector3();
  private s = new THREE.Vector3();
  private hide = new THREE.Matrix4().makeScale(0, 0, 0);

  constructor(layout: CityLayout) {
    this.zone = layout.gas.wash;
    this.y = groundHeight((this.zone.x0 + this.zone.x1) / 2, (this.zone.z0 + this.zone.z1) / 2);
    // Fluffy roller: a cylinder with colored stripes, so you can see it spin.
    const g = new THREE.CylinderGeometry(0.42, 0.42, 1, 18, 1).toNonIndexed();
    const pos = g.getAttribute('position');
    const col = new Float32Array(pos.count * 3);
    const blue = new THREE.Color('#3d9bff'), pink = new THREE.Color('#ff7ac2');
    for (let i = 0; i < pos.count; i++) {
      const a = Math.atan2(pos.getZ(i), pos.getX(i));
      (Math.floor(((a + Math.PI) / (Math.PI * 2)) * 6) % 2 ? blue : pink).toArray(col, i * 3);
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.brushes = new THREE.InstancedMesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }), 3);
    this.bubbles = new THREE.InstancedMesh(
      new THREE.IcosahedronGeometry(0.16, 1),
      new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.15, metalness: 0, transparent: true, opacity: 0.75 }),
      60,
    );
    for (const im of [this.brushes, this.bubbles]) { im.frustumCulled = false; this.group.add(im); }
    for (let i = 0; i < 60; i++) this.bubbleState.push({ x: 0, y: 0, z: 0, vy: 0, life: 0, size: 0 });
    this.place(0);
  }

  /** Is the car (center x, z) inside the tunnel? */
  inside(x: number, z: number) {
    const w = this.zone;
    return x > w.x0 + 1 && x < w.x1 - 1 && z > w.z0 && z < w.z1;
  }

  /** Rollers: two upright ones at the sides, one lying across the top; `t` 0..1 sweeps them along. */
  private place(t: number) {
    const w = this.zone, cz = (w.z0 + w.z1) / 2;
    const x = w.x0 + 2 + (w.x1 - w.x0 - 4) * t;
    const side = (i: number, z: number) => {
      this.q.setFromAxisAngle(this.v.set(0, 1, 0), this.spin * (i ? 1 : -1));
      this.m.compose(this.v.set(x, this.y + 1.2, z), this.q, this.s.set(1, 2.3, 1));
      this.brushes.setMatrixAt(i, this.m);
    };
    side(0, w.z0 + 0.55);
    side(1, w.z1 - 0.55);
    // The top roller lies along Z and spins around Z.
    const qz = new THREE.Quaternion().setFromAxisAngle(this.v.set(1, 0, 0), Math.PI / 2);
    this.q.setFromAxisAngle(this.v.set(0, 0, 1), this.spin).multiply(qz);
    this.m.compose(this.v.set(x + 0.9, this.y + 2.45, cz), this.q, this.s.set(0.9, w.z1 - w.z0 - 1.4, 0.9));
    this.brushes.setMatrixAt(2, this.m);
    this.brushes.instanceMatrix.needsUpdate = true;
  }

  /** washing: seconds left of the current wash (0 = idle); car: where the car stands. */
  update(dt: number, camera: THREE.Vector3, washing: number, car: { x: number; z: number }) {
    const cx = (this.zone.x0 + this.zone.x1) / 2, cz = (this.zone.z0 + this.zone.z1) / 2;
    const near = Math.hypot(camera.x - cx, camera.z - cz) < 140;
    this.group.visible = near;
    if (!near) return;
    if (washing > 0) {
      this.spin += dt * 9;
      // Sweep from the front to the back and back again during one wash.
      const p = 1 - washing / WASH_TIME;
      this.sweep = 0.5 - 0.5 * Math.cos(p * Math.PI * 2);
      // New bubbles around the car.
      for (const b of this.bubbleState) {
        if (b.life > 0 || Math.random() > dt * 14) continue;
        b.x = car.x + (Math.random() - 0.5) * 3.6;
        b.z = car.z + (Math.random() - 0.5) * 2.2;
        b.y = this.y + 0.3 + Math.random() * 1.4;
        b.vy = 0.4 + Math.random() * 0.6;
        b.size = 0.6 + Math.random() * 1.2;
        b.life = 1.2 + Math.random() * 1.2;
      }
    } else {
      this.sweep += (0 - this.sweep) * Math.min(1, dt * 2);
    }
    this.place(this.sweep);
    // Bubbles float up, wobble, grow a little and pop.
    this.bubbleState.forEach((b, i) => {
      if (b.life <= 0) { this.bubbles.setMatrixAt(i, this.hide); return; }
      b.life -= dt;
      b.y += b.vy * dt;
      b.x += Math.sin(b.life * 5 + i) * dt * 0.3;
      const k = b.size * Math.min(1, b.life * 2) * (1 + (1.6 - b.life) * 0.15);
      this.m.compose(this.v.set(b.x, b.y, b.z), this.q.identity(), this.s.setScalar(Math.max(0.001, k)));
      this.bubbles.setMatrixAt(i, this.m);
    });
    this.bubbles.instanceMatrix.needsUpdate = true;
  }

  dispose() {
    for (const im of [this.brushes, this.bubbles]) { im.geometry.dispose(); (im.material as THREE.Material).dispose(); }
    this.group.removeFromParent();
  }
}
