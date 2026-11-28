import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { CityLayout } from '../city/layout';
import { groundHeight } from './collision';

/**
 * Friendly park animals, made from a few low-poly shapes (no downloads, no textures):
 * - two duck families (a mother with yellow ducklings in a row) paddling around the pond
 * - little birds hopping and pecking on the park grass; they flutter up and land somewhere
 *   else when you come close (birds on the tree tops can't be seen from the game camera)
 * - a small flock flying circles over the park trees, flapping their wings
 * Every kind is one InstancedMesh (5 draw calls in total), and nothing is updated or drawn
 * when the camera is far from the park.
 */

const tint = (g: THREE.BufferGeometry, color: string) => {
  const c = new THREE.Color(color);
  const n = g.getAttribute('position').count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) arr.set([c.r, c.g, c.b], i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  g.deleteAttribute('uv');
  return g.index ? g.toNonIndexed() : g;
};
const ball = (r: number, sx: number, sy: number, sz: number, x: number, y: number, z: number, color: string, seg = 8) =>
  tint(new THREE.SphereGeometry(r, seg, Math.max(4, seg - 2)).scale(sx, sy, sz).translate(x, y, z), color);
const cone = (r: number, h: number, x: number, y: number, z: number, color: string) =>
  tint(new THREE.ConeGeometry(r, h, 6).rotateX(Math.PI / 2).translate(x, y, z), color);
const merge = (parts: THREE.BufferGeometry[]) => {
  const g = mergeGeometries(parts)!;
  parts.forEach((p) => p.dispose());
  g.computeVertexNormals();
  return g;
};

/** Mother duck (mallard-like), facing +Z, waterline at y = 0. */
export function duckGeometry() {
  return merge([
    ball(0.22, 1, 0.62, 1.45, 0, 0.06, 0, '#8a6a4a'), // body
    cone(0.1, 0.22, 0, 0.12, -0.38, '#5a4634'), // tail
    ball(0.11, 1, 1, 1.1, 0, 0.3, 0.24, '#2f7d4a'), // green head
    ball(0.07, 1.1, 0.5, 1, 0, 0.2, 0.22, '#f4f1e8'), // white collar
    cone(0.045, 0.12, 0, 0.29, 0.38, '#f2a516'), // beak
    ball(0.02, 1, 1, 1, 0.07, 0.34, 0.31, '#111111', 4), // eyes
    ball(0.02, 1, 1, 1, -0.07, 0.34, 0.31, '#111111', 4),
  ]);
}

/** Duckling: a small fluffy yellow ball with an orange beak. */
export function ducklingGeometry() {
  return merge([
    ball(0.09, 1, 0.75, 1.25, 0, 0.04, 0, '#ffd84a'),
    ball(0.06, 1, 1, 1, 0, 0.15, 0.08, '#ffe066'),
    cone(0.025, 0.06, 0, 0.145, 0.16, '#f28c16'),
    ball(0.012, 1, 1, 1, 0.035, 0.17, 0.12, '#111111', 4),
    ball(0.012, 1, 1, 1, -0.035, 0.17, 0.12, '#111111', 4),
  ]);
}

/** Small bird body (sparrow-like), facing +Z, feet at y = 0. */
function birdGeometry() {
  return merge([
    ball(0.08, 1, 0.85, 1.4, 0, 0.09, 0, '#7a5a3c'),
    ball(0.055, 1, 1, 1, 0, 0.15, 0.09, '#8f6a45'),
    ball(0.05, 1, 0.7, 1, 0, 0.07, 0.04, '#e9dcc4'), // light belly
    cone(0.02, 0.05, 0, 0.145, 0.155, '#e0a020'),
    cone(0.035, 0.1, 0, 0.1, -0.13, '#5e452e'), // tail
  ]);
}

/** One wing, hinged at x = 0 on the bird's shoulder, pointing to +X (mirrored for the left). */
function wingGeometry() {
  const g = new THREE.BoxGeometry(0.16, 0.012, 0.09).translate(0.08, 0, 0);
  return merge([tint(g, '#6b4e33')]);
}

interface Duck { family: number; lag: number }
interface GroundBird {
  x: number; z: number; heading: number; timer: number; hop: number; peck: number;
  /** Flying to a new spot: from, to and progress 0..1 (-1 = on the ground). */
  fx: number; fz: number; tx: number; tz: number; fly: number;
}
/** The kinds of birds you can spot with the binoculars at the pond. */
export const BIRD_KINDS = ['duck', 'duckling', 'sparrow', 'swallow'] as const;
export type BirdKind = (typeof BIRD_KINDS)[number];
export const BIRD_EMOJI: Record<BirdKind, string> = { duck: '🦆', duckling: '🐥', sparrow: '🐦', swallow: '🕊️' };

const DUCK = 1.6; // ducks a bit bigger than life, so kids can see them on the big pond
const BIRD = 1.7;

export class Wildlife {
  readonly group = new THREE.Group();
  private material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, flatShading: true });
  private moms: THREE.InstancedMesh;
  private kids: THREE.InstancedMesh;
  private birds: THREE.InstancedMesh;
  private wingL: THREE.InstancedMesh;
  private wingR: THREE.InstancedMesh;
  private ducklings: Duck[] = [];
  private ground: GroundBird[] = [];
  private flyers = 6;
  private t = 0;
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();
  private p = new THREE.Vector3();
  private s = new THREE.Vector3(1, 1, 1);
  private center: { x: number; z: number };
  private pond: { x: number; z: number; r: number; y: number };

  private parkRect: { x0: number; z0: number; x1: number; z1: number };

  constructor(layout: CityLayout) {
    const pk = layout.park;
    this.pond = { x: pk.pond.x, z: pk.pond.z, r: pk.pond.r, y: groundHeight(pk.pond.x, pk.pond.z) + 0.03 };
    const r = pk.rect;
    this.center = { x: (r.x0 + r.x1) / 2, z: (r.z0 + r.z1) / 2 };

    // Two families: a mother with 4 and one with 3 ducklings.
    for (const [family, n] of [[0, 4], [1, 3]] as const) for (let i = 1; i <= n; i++) this.ducklings.push({ family, lag: i });

    // Little birds in small groups on the grass.
    this.parkRect = { x0: r.x0 + 6, z0: r.z0 + 6, x1: r.x1 - 6, z1: r.z1 - 6 };
    for (let g = 0; g < 3; g++) {
      const c = this.grassSpot();
      for (let i = 0; i < 3; i++) {
        const x = c.x + (Math.random() - 0.5) * 3, z = c.z + (Math.random() - 0.5) * 3;
        this.ground.push({ x, z, heading: Math.random() * 6.28, timer: Math.random() * 2, hop: 0, peck: 0, fx: x, fz: z, tx: x, tz: z, fly: -1 });
      }
    }

    const make = (g: THREE.BufferGeometry, count: number) => {
      const im = new THREE.InstancedMesh(g, this.material, Math.max(1, count));
      im.count = count;
      im.frustumCulled = false; // instances move around; the group is hidden when far away
      this.group.add(im);
      return im;
    };
    this.moms = make(duckGeometry(), 2);
    this.kids = make(ducklingGeometry(), this.ducklings.length);
    const nBirds = this.ground.length + this.flyers;
    this.birds = make(birdGeometry(), nBirds);
    const wing = wingGeometry();
    this.wingR = make(wing, nBirds);
    this.wingL = make(wing.clone().scale(-1, 1, 1), nBirds);
  }

  /** A random spot on the park grass, away from the pond. */
  private grassSpot() {
    const r = this.parkRect, pd = this.pond;
    for (let i = 0; i < 30; i++) {
      const x = r.x0 + Math.random() * (r.x1 - r.x0), z = r.z0 + Math.random() * (r.z1 - r.z0);
      if (Math.hypot(x - pd.x, z - pd.z) > pd.r + 3) return { x, z };
    }
    return { x: r.x0, z: r.z0 };
  }

  /** Spot on a family's paddling loop at time t (with a gentle wobble), plus the heading. */
  private duckAt(family: number, t: number) {
    const pd = this.pond;
    const speed = family === 0 ? 0.09 : -0.07; // radians per second, the two families go opposite ways
    const a = (family === 0 ? 0 : 2.4) + t * speed;
    const rad = pd.r * (family === 0 ? 0.78 : 0.6) + Math.sin(t * 0.21 + family) * pd.r * 0.05;
    const x = pd.x + Math.cos(a) * rad, z = pd.z + Math.sin(a) * rad;
    // Heading along the loop (tangent), in the direction of travel.
    const heading = Math.atan2(-Math.sin(a) * Math.sign(speed), Math.cos(a) * Math.sign(speed));
    return { x, z, heading, speed: Math.abs(speed) * rad };
  }

  private put(im: THREE.InstancedMesh, i: number, x: number, y: number, z: number, yaw: number, roll = 0, pitch = 0, scale = 1) {
    this.e.set(pitch, yaw, roll, 'YXZ');
    this.q.setFromEuler(this.e);
    this.p.set(x, y, z);
    this.s.setScalar(scale);
    im.setMatrixAt(i, this.m.compose(this.p, this.q, this.s));
  }

  /**
   * A bird to look at: a kind you haven't seen yet first, otherwise any kind (different from `not`); of that
   * kind the one nearest to you (less likely to be behind a tree).
   */
  pick(seen: readonly string[], not: BirdKind | undefined, from: { x: number; z: number }): { kind: BirdKind; index: number } {
    const fresh = BIRD_KINDS.filter((k) => !seen.includes(k));
    const pool = fresh.length ? fresh : BIRD_KINDS.filter((k) => k !== not);
    const kind = pool[Math.floor(Math.random() * pool.length)];
    const count = kind === 'duck' ? 2 : kind === 'duckling' ? this.ducklings.length : kind === 'sparrow' ? this.ground.length : this.flyers;
    const v = new THREE.Vector3();
    let index = 0, best = Infinity;
    for (let i = 0; i < count; i++) {
      this.where({ kind, index: i }, v);
      const d = Math.hypot(v.x - from.x, v.z - from.z);
      if (d < best) { best = d; index = i; }
    }
    return { kind, index };
  }

  /** Where that bird is now (its middle, a little above its feet). */
  where(b: { kind: BirdKind; index: number }, out: THREE.Vector3) {
    const im = b.kind === 'duck' ? this.moms : b.kind === 'duckling' ? this.kids : this.birds;
    const i = b.kind === 'swallow' ? this.ground.length + b.index : b.index;
    im.getMatrixAt(i, this.m);
    out.setFromMatrixPosition(this.m);
    out.y += b.kind === 'duck' ? 0.25 : b.kind === 'swallow' ? 0.2 : 0.12;
    return out;
  }

  /** focus: the player or the car (birds fly away from it). */
  update(dt: number, camera: THREE.Vector3, focus: { x: number; z: number }) {
    // Only when the park is near: costs nothing anywhere else in the city.
    const near = Math.hypot(camera.x - this.center.x, camera.z - this.center.z) < 170;
    this.group.visible = near;
    if (!near) return;
    this.t += dt;
    const t = this.t, pd = this.pond;

    // Ducks: mothers lead, ducklings follow in a row on the same loop, a bit behind.
    for (let f = 0; f < 2; f++) {
      const d = this.duckAt(f, t);
      const bob = Math.sin(t * 2.2 + f) * 0.012;
      this.put(this.moms, f, d.x, pd.y + bob, d.z, d.heading, Math.sin(t * 1.7 + f) * 0.05, 0, DUCK);
    }
    this.ducklings.forEach((k, i) => {
      const lead = this.duckAt(k.family, 0);
      const delay = (0.55 * DUCK * k.lag) / Math.max(0.05, lead.speed); // in a neat row behind mom
      const d = this.duckAt(k.family, t - delay);
      const wiggle = Math.sin(t * 3 + i * 1.3) * 0.06;
      this.put(this.kids, i, d.x + Math.cos(d.heading) * wiggle, pd.y + Math.sin(t * 3.1 + i) * 0.01, d.z - Math.sin(d.heading) * wiggle, d.heading + wiggle, 0, 0, DUCK);
    });

    // Ground birds: hop and peck; flutter to another spot when someone comes close.
    this.ground.forEach((b, i) => {
      const gy = groundHeight(b.x, b.z);
      if (b.fly < 0 && Math.hypot(focus.x - b.x, focus.z - b.z) < 5) {
        const to = this.grassSpot();
        Object.assign(b, { fx: b.x, fz: b.z, tx: to.x, tz: to.z, fly: 0, heading: Math.atan2(to.x - b.x, to.z - b.z) });
      }
      let y = gy, flap = -1.45, wingScale = 0.65, pitch = 0;
      if (b.fly >= 0) {
        // Up, over and down in a soft arc (about 1 second per 8 m).
        const len = Math.hypot(b.tx - b.fx, b.tz - b.fz);
        b.fly = Math.min(1, b.fly + dt / Math.max(1.2, len / 8));
        b.x = b.fx + (b.tx - b.fx) * b.fly;
        b.z = b.fz + (b.tz - b.fz) * b.fly;
        y = groundHeight(b.x, b.z) + Math.sin(b.fly * Math.PI) * Math.min(6, 1.5 + len * 0.2);
        flap = Math.sin(t * 38 + i) * 0.9;
        wingScale = 1;
        if (b.fly >= 1) { b.fly = -1; b.timer = 0.5 + Math.random(); }
      } else {
        b.timer -= dt;
        if (b.timer <= 0) {
          b.timer = 0.6 + Math.random() * 1.6;
          if (Math.random() < 0.5) { b.peck = 0.35; } else { b.heading += (Math.random() - 0.5) * 2.4; b.hop = 0.25; }
        }
        if (b.hop > 0) {
          b.hop = Math.max(0, b.hop - dt);
          b.x += Math.sin(b.heading) * dt * 1.2;
          b.z += Math.cos(b.heading) * dt * 1.2;
          y = gy + Math.sin((b.hop / 0.25) * Math.PI) * 0.08;
        }
        if (b.peck > 0) { b.peck = Math.max(0, b.peck - dt); pitch = Math.sin((b.peck / 0.35) * Math.PI) * 0.7; }
      }
      this.put(this.birds, i, b.x, y, b.z, b.heading, 0, pitch, BIRD);
      const ox = Math.cos(b.heading) * 0.075 * BIRD, oz = -Math.sin(b.heading) * 0.075 * BIRD, wy = y + 0.12 * BIRD;
      this.put(this.wingR, i, b.x + ox, wy, b.z + oz, b.heading, flap, pitch, BIRD * wingScale);
      this.put(this.wingL, i, b.x - ox, wy, b.z - oz, b.heading, -flap, pitch, BIRD * wingScale);
    });

    // Flock: big lazy circles over the park, each bird a bit higher or lower, flapping and gliding.
    for (let j = 0; j < this.flyers; j++) {
      const i = this.ground.length + j;
      const a = t * 0.35 + (j / this.flyers) * Math.PI * 2 * 0.35;
      const rad = 18 + (j % 3) * 3;
      const x = this.center.x + Math.cos(a) * rad, z = this.center.z + Math.sin(a) * rad;
      const y = groundHeight(this.center.x, this.center.z) + 11 + Math.sin(t * 0.8 + j) * 1.0 + (j % 2) * 1.2;
      const heading = Math.atan2(-Math.sin(a), Math.cos(a));
      const bank = 0.35;
      this.put(this.birds, i, x, y, z, heading, bank, 0, 1.8);
      // Flap for a while, then glide with the wings out.
      const flapping = Math.sin(t * 0.9 + j * 1.7) > -0.2;
      const flap = flapping ? Math.sin(t * 14 + j) * 0.7 : 0.1;
      // Wing roots on the shoulders (the +X wing on the +X side).
      const ox = Math.cos(heading) * 0.12, oz = -Math.sin(heading) * 0.12;
      this.put(this.wingR, i, x + ox, y + 0.22, z + oz, heading, bank + flap, 0, 1.8);
      this.put(this.wingL, i, x - ox, y + 0.22, z - oz, heading, bank - flap, 0, 1.8);
    }
    for (const im of [this.moms, this.kids, this.birds, this.wingL, this.wingR]) im.instanceMatrix.needsUpdate = true;
  }

  dispose() {
    for (const im of [this.moms, this.kids, this.birds, this.wingL, this.wingR]) im.geometry.dispose();
    this.material.dispose();
    this.group.removeFromParent();
  }
}
