import * as THREE from 'three';

/** Reads and writes the world matrix of one drawn object (an instance in a batch). */
export interface KnockTarget {
  get(out: THREE.Matrix4): void;
  set(m: THREE.Matrix4): void;
}

interface Fall {
  target: KnockTarget;
  base: THREE.Matrix4;
  pivot: THREE.Vector3;
  axis: THREE.Vector3;
  t: number;
  /** Back-up animation running (s), or -1. */
  grow: number;
  /** Shrunk away (scale 0 already written). */
  hidden: boolean;
  onBack: () => void;
}

const FALL = 0.9, LIE = 3.2, SHRINK = 0.5, GROW = 0.7;
/** Comes back after this long, once the camera is far enough away not to see it pop up. */
const RESPAWN = 25, RESPAWN_DIST = 30;

/** Playful bounce at the end of the fall (like a toy tipping over). */
function bounceOut(x: number) {
  const n = 7.5625, d = 2.75;
  if (x < 1 / d) return n * x * x;
  if (x < 2 / d) return n * (x -= 1.5 / d) * x + 0.75;
  if (x < 2.5 / d) return n * (x -= 2.25 / d) * x + 0.9375;
  return n * (x -= 2.625 / d) * x + 0.984375;
}
/** Pops up a bit too big, then settles. */
function backOut(x: number) {
  const c = 1.9;
  return 1 + (c + 1) * (x - 1) ** 3 + c * (x - 1) ** 2;
}

/**
 * Trees, lamp posts and traffic lights that tip over when a fast car hits them: they fall the way
 * the car drove, bounce, lie for a moment, shrink away (so you never drive through them), and grow
 * back a while later. Nothing breaks for real and nobody gets hurt — it's a toy city.
 */
export class Knockables {
  private falls: Fall[] = [];
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private s = new THREE.Vector3();
  private t1 = new THREE.Matrix4();

  get active() { return this.falls.length; }

  knock(target: KnockTarget, dirX: number, dirZ: number, onBack: () => void) {
    const base = new THREE.Matrix4();
    target.get(base);
    const pivot = new THREE.Vector3().setFromMatrixPosition(base);
    const n = Math.hypot(dirX, dirZ) || 1;
    // Rotating about (dz, 0, -dx) tips the top towards (dx, dz).
    const axis = new THREE.Vector3(dirZ / n, 0, -dirX / n);
    this.falls.push({ target, base, pivot, axis, t: 0, grow: -1, hidden: false, onBack });
  }

  update(dt: number, cam: THREE.Vector3) {
    for (let i = this.falls.length - 1; i >= 0; i--) {
      const f = this.falls[i];
      f.t += dt;
      let angle = 0, scale = 1;
      if (f.grow >= 0) {
        f.grow += dt;
        const k = Math.min(1, f.grow / GROW);
        scale = backOut(k);
        if (k >= 1) {
          f.target.set(f.base);
          f.onBack();
          this.falls.splice(i, 1);
          continue;
        }
      } else if (f.t < FALL) angle = 1.45 * bounceOut(f.t / FALL);
      else if (f.t < FALL + LIE) angle = 1.45;
      else if (f.t < FALL + LIE + SHRINK) { angle = 1.45; scale = 1 - (f.t - FALL - LIE) / SHRINK; }
      else {
        scale = 0;
        if (f.t > RESPAWN && Math.hypot(cam.x - f.pivot.x, cam.z - f.pivot.z) > RESPAWN_DIST) f.grow = 0;
        else if (f.hidden) continue; // already hidden: nothing to update
        else f.hidden = true;
      }
      // M = T(pivot) · R(axis, angle) · S(scale) · T(-pivot) · base
      this.q.setFromAxisAngle(f.axis, angle);
      this.s.setScalar(Math.max(scale, 1e-4));
      this.m.compose(f.pivot, this.q, this.s);
      this.t1.makeTranslation(-f.pivot.x, -f.pivot.y, -f.pivot.z);
      this.m.multiply(this.t1).multiply(f.base);
      f.target.set(this.m);
    }
  }
}
