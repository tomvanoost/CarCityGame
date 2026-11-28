import * as THREE from 'three';
import { inLake } from '../city/outskirts';
import { groundHeight, type CollisionWorld } from './collision';

/** You need to throw it at least this far for the sticker (only from up high: the lake bridge). */
export const PLANE_STICKER_M = 50;
const SPEED = 9.5; // m/s forward when thrown
const GLIDE = 10; // meters forward per meter down (a very good paper plane)

/** A folded paper plane (white, two wings and a keel), pointing +Z, ~0.7 m long. */
function planeGeometry() {
  const p = [
    // left wing, right wing (top), keel
    0, 0, 0.25, -0.2, 0.02, -0.2, 0, 0, -0.2,
    0, 0, 0.25, 0, 0, -0.2, 0.2, 0.02, -0.2,
    0, 0, 0.25, 0, 0, -0.2, 0, -0.07, -0.18,
  ];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  g.scale(1.6, 1.6, 1.6); // a bit bigger than real, so you can follow it in the air
  g.computeVertexNormals();
  return g;
}

/**
 * The paper plane from the library: thrown from your hand (a little upwards, where you look), it glides
 * down slowly with a gentle wobble until it touches the ground or the water, or hits a wall. How far it
 * flew (along the ground) is the score: the higher you throw from, the further it goes. One small mesh.
 */
export class PaperPlane {
  readonly mesh = new THREE.Mesh(planeGeometry(), new THREE.MeshStandardMaterial({ color: '#f7f7f2', roughness: 0.8, side: THREE.DoubleSide }));
  private pos = new THREE.Vector3();
  private start = { x: 0, z: 0 };
  private yaw = 0;
  private vy = 0;
  private t = 0;
  private drift = 0;
  /** Flying (true), lying where it landed (false, for a moment), or put away (mesh hidden). */
  flying = false;
  private lying = 0;

  constructor() {
    this.mesh.castShadow = true;
    this.mesh.visible = false;
  }

  /** Throw it from (x, y, z) towards yaw (radians, 0 = +Z). */
  throw(x: number, y: number, z: number, yaw: number) {
    this.pos.set(x, y, z);
    this.start = { x, z };
    this.yaw = yaw;
    this.vy = 2.2; // a little upwards
    this.t = 0;
    this.drift = (Math.random() - 0.5) * 0.25;
    this.flying = true;
    this.lying = 0;
    this.mesh.visible = true;
  }

  /** Flies on; returns the distance (m) once when it lands, otherwise null. */
  update(dt: number, world: CollisionWorld): number | null {
    if (!this.flying) {
      if (this.lying > 0) { this.lying -= dt; if (this.lying <= 0) this.mesh.visible = false; }
      return null;
    }
    this.t += dt;
    // Glide: the climb from the throw dies away, then it sinks at a steady rate with a soft up-and-down wobble.
    const sink = SPEED / GLIDE;
    this.vy += (-sink - this.vy) * Math.min(1, dt * 1.6);
    const wobble = Math.sin(this.t * 2.6) * 0.35;
    this.yaw += this.drift * dt;
    const step = SPEED * dt;
    this.pos.x += Math.sin(this.yaw) * step;
    this.pos.z += Math.cos(this.yaw) * step;
    this.pos.y += (this.vy + wobble) * dt;
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.set(-Math.atan2(this.vy + wobble, SPEED), this.yaw, Math.sin(this.t * 1.7) * 0.25, 'YXZ');
    // The surface below: the ground, a bridge deck, or the water of the lake.
    const overWater = inLake(this.pos.x, this.pos.z);
    const floor = overWater ? Math.max(0, groundHeight(this.pos.x, this.pos.z)) : groundHeight(this.pos.x, this.pos.z);
    // Walls and trees stop it when it flies low into them (not over the water: the bridge railings are low).
    const hitWall = !overWater && this.pos.y < floor + 2.2 && world.pointBlocked(this.pos.x, this.pos.z);
    if (this.pos.y <= floor + 0.03 || hitWall || this.t > 30) {
      this.pos.y = Math.max(this.pos.y, floor + 0.03);
      this.mesh.position.copy(this.pos);
      this.mesh.rotation.set(0, this.yaw, 0);
      this.flying = false;
      this.lying = 4;
      return Math.hypot(this.pos.x - this.start.x, this.pos.z - this.start.z);
    }
    return null;
  }

  dispose() {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
    this.mesh.removeFromParent();
  }
}
