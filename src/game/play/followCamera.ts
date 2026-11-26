import * as THREE from 'three';

/**
 * Third-person camera. It stays behind the car / player, and the player can drag
 * to look around; after a moment it swings back behind the car by itself.
 */
export class FollowCamera {
  yaw = 0;
  pitch = 0.3;
  distance = 7;
  private target = new THREE.Vector3();
  private lookTimer = 0;
  /** Actual distance used this frame (shorter when a building is in the way). */
  private shown = 7;

  constructor(readonly camera: THREE.PerspectiveCamera) {}

  /** dx/dy: drag in pixels. */
  look(dx: number, dy: number) {
    if (!dx && !dy) return;
    this.yaw -= dx * 0.006;
    this.pitch = THREE.MathUtils.clamp(this.pitch + dy * 0.004, 0.05, 1.1);
    this.lookTimer = 2.5;
  }

  /**
   * focus: point to look at. behindYaw: the yaw that is "behind" the car (null = free, e.g. walking).
   */
  update(dt: number, focus: THREE.Vector3, opts: { behindYaw: number | null; distance: number; pitch: number; snap?: boolean; blocked?: (x: number, z: number) => boolean }) {
    this.lookTimer = Math.max(0, this.lookTimer - dt);
    if (opts.behindYaw !== null && this.lookTimer === 0) {
      let diff = opts.behindYaw - this.yaw;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      this.yaw += diff * Math.min(1, dt * 3);
      this.pitch += (opts.pitch - this.pitch) * Math.min(1, dt * 2);
    }
    this.distance += (opts.distance - this.distance) * Math.min(1, dt * 3);
    if (opts.snap) this.target.copy(focus);
    else {
      this.target.lerp(focus, Math.min(1, dt * 10));
      // Smooth, but never trailing behind: at high speed the lerp alone fell metres behind the car.
      const lag = this.target.distanceTo(focus);
      if (lag > 0.5) this.target.lerp(focus, 1 - 0.5 / lag);
    }
    const cp = Math.cos(this.pitch);
    // Pull the camera in if a building is between it and the player.
    let dist = this.distance;
    if (opts.blocked) {
      for (let i = 1; i <= 8; i++) {
        const d = (this.distance * i) / 8;
        if (opts.blocked(this.target.x + Math.sin(this.yaw) * cp * d, this.target.z + Math.cos(this.yaw) * cp * d)) {
          dist = Math.max(0.8, d - this.distance / 8);
          break;
        }
      }
    }
    this.shown += (dist - this.shown) * Math.min(1, dt * (dist < this.shown ? 20 : 4));
    // The closer the camera has to come (wall behind you), the more it looks down from above.
    const squeeze = 1 - this.shown / this.distance;
    const pitch = Math.min(1.35, this.pitch + squeeze * 0.9);
    const lift = squeeze * 3;
    const c2 = Math.cos(pitch);
    this.camera.position.set(
      this.target.x + Math.sin(this.yaw) * c2 * this.shown,
      this.target.y + Math.sin(pitch) * this.shown + lift,
      this.target.z + Math.cos(this.yaw) * c2 * this.shown,
    );
    this.camera.position.y = Math.max(this.camera.position.y, 0.6);
    this.camera.lookAt(this.target);
  }
}
