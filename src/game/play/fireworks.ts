import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { FIREWORKS, LAKE } from '../city/outskirts';
import { groundHeight } from './collision';

export const FIREWORKS_PRICE = 25;
/** The stand on the beach (east of the jetty) and the spot in front of it. */
export const FIREWORKS_STAND = FIREWORKS;
export const FIREWORKS_FRONT = { x: FIREWORKS_STAND.x, z: FIREWORKS_STAND.z - 2.6 };
/** Where the rockets go up: out over the water. */
const LAUNCH = { x: FIREWORKS_STAND.x, z: LAKE.z - LAKE.rz + 55 };

const SHOW_TIME = 20, ROCKETS = 14, PER_BURST = 90, MAX = ROCKETS * PER_BURST + ROCKETS;
const COLORS = ['#ff4d6d', '#ffd166', '#4dd2ff', '#9b5de5', '#06d6a0', '#ff9f1c', '#ffffff'];

const paint = (g: THREE.BufferGeometry, color: string) => {
  const geo = g.index ? g.toNonIndexed() : g;
  const c = new THREE.Color(color), n = geo.getAttribute('position').count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) a.set([c.r, c.g, c.b], i * 3);
  geo.setAttribute('color', new THREE.BufferAttribute(a, 3));
  geo.deleteAttribute('uv');
  return geo;
};

function starTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.25, 'rgba(255,255,255,0.8)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

interface Rocket { at: number; x: number; z: number; top: number; color: THREE.Color; burst: boolean; slot: number }

/**
 * Fireworks over the lake: a stand on the beach, and a 20 s show of rockets that burst into colored
 * stars. All sparks are one Points object (one draw call), moved on the CPU.
 */
export class Fireworks {
  readonly group = new THREE.Group();
  private points: THREE.Points;
  private pos = new Float32Array(MAX * 3);
  private vel = new Float32Array(MAX * 3);
  private col = new Float32Array(MAX * 3);
  private base = new Float32Array(MAX * 3);
  private life = new Float32Array(MAX);
  private rockets: Rocket[] = [];
  private t = 0;
  /** A show is going on. */
  active = false;

  constructor(private onPop: (k: number) => void) {
    const s = FIREWORKS_STAND, y = groundHeight(s.x, s.z);
    const parts: THREE.BufferGeometry[] = [
      paint(new THREE.BoxGeometry(2.2, 1, 1.2).translate(0, 0.5, 0), '#8a5a35'),
      paint(new THREE.BoxGeometry(2.4, 0.08, 1.4).translate(0, 1.02, 0), '#6b4426'),
      paint(new THREE.BoxGeometry(0.08, 1.6, 0.08).translate(-1, 1.8, -0.5), '#6b4426'),
      paint(new THREE.BoxGeometry(0.08, 1.6, 0.08).translate(1, 1.8, -0.5), '#6b4426'),
      paint(new THREE.BoxGeometry(2.3, 0.6, 0.06).translate(0, 2.4, -0.5), '#1f2a44'),
    ];
    // Rocket tubes on the counter, in happy colors, and stars on the sign.
    ['#e5484d', '#f5c400', '#1f6fe0', '#2fa84f'].forEach((c, i) => parts.push(paint(new THREE.CylinderGeometry(0.09, 0.09, 0.5, 8).translate(-0.6 + i * 0.4, 1.3, 0.1), c)));
    ['#ffd166', '#ff4d6d', '#4dd2ff'].forEach((c, i) => parts.push(paint(new THREE.OctahedronGeometry(0.14).translate(-0.6 + i * 0.6, 2.4, -0.45), c)));
    const stand = new THREE.Mesh(mergeGeometries(parts)!, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75 }));
    stand.position.set(s.x, y, s.z);
    stand.rotation.y = Math.PI; // the counter faces the grass (where you stand), the lake is behind it
    stand.castShadow = true;

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    this.points = new THREE.Points(geo, new THREE.PointsMaterial({
      size: 3, map: starTexture(), vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    }));
    this.points.frustumCulled = false;
    this.points.visible = false;
    this.group.add(stand, this.points);
  }

  /** Start a show (does nothing while one is going on). */
  start() {
    if (this.active) return;
    this.active = true;
    this.t = 0;
    this.life.fill(0);
    this.col.fill(0);
    this.rockets = [];
    for (let i = 0; i < ROCKETS; i++) {
      this.rockets.push({
        at: 0.5 + (i / ROCKETS) * (SHOW_TIME - 4) + Math.random() * 0.6,
        x: LAUNCH.x + (Math.random() - 0.5) * 70, z: LAUNCH.z + (Math.random() - 0.5) * 30,
        top: 28 + Math.random() * 16, color: new THREE.Color(COLORS[i % COLORS.length]), burst: false, slot: i,
      });
    }
    this.points.visible = true;
  }

  update(dt: number) {
    if (!this.active) return;
    this.t += dt;
    const g = 9;
    for (const r of this.rockets) {
      const trail = ROCKETS * PER_BURST + r.slot;
      const k = (this.t - r.at) / 1.3;
      if (k < 0) continue;
      if (k < 1 && !r.burst) {
        // The rising rocket: one bright spark slowing down near the top.
        this.pos.set([r.x, r.top * (1 - (1 - k) * (1 - k)), r.z], trail * 3);
        this.col.set([1, 0.85, 0.6], trail * 3);
        continue;
      }
      if (!r.burst) {
        r.burst = true;
        this.col.set([0, 0, 0], trail * 3);
        this.onPop(Math.max(0.2, 1 - (r.top - 28) / 40));
        const two = Math.random() < 0.4 ? new THREE.Color(COLORS[(r.slot + 3) % COLORS.length]) : r.color;
        for (let i = 0; i < PER_BURST; i++) {
          const j = r.slot * PER_BURST + i;
          // Evenly spread directions on a sphere (golden spiral), a little random speed.
          const y = 1 - (2 * (i + 0.5)) / PER_BURST, rr = Math.sqrt(1 - y * y), a = i * 2.39996;
          const sp = 11 + Math.random() * 3;
          this.vel.set([Math.cos(a) * rr * sp, y * sp, Math.sin(a) * rr * sp], j * 3);
          this.pos.set([r.x, r.top, r.z], j * 3);
          const c = i % 2 ? two : r.color;
          this.base.set([c.r, c.g, c.b], j * 3);
          this.life[j] = 1;
        }
      }
    }
    // Sparks: fly out, slow down, fall and fade.
    const drag = Math.exp(-dt * 1.6);
    for (let j = 0; j < ROCKETS * PER_BURST; j++) {
      if (this.life[j] <= 0) continue;
      this.life[j] = Math.max(0, this.life[j] - dt / 2.2);
      const i = j * 3;
      this.vel[i] *= drag; this.vel[i + 1] = this.vel[i + 1] * drag - g * dt * 0.35; this.vel[i + 2] *= drag;
      this.pos[i] += this.vel[i] * dt; this.pos[i + 1] += this.vel[i + 1] * dt; this.pos[i + 2] += this.vel[i + 2] * dt;
      const f = this.life[j] ** 1.5 * (0.75 + Math.random() * 0.25); // a little twinkle
      this.col[i] = this.base[i] * f; this.col[i + 1] = this.base[i + 1] * f; this.col[i + 2] = this.base[i + 2] * f;
    }
    const geo = this.points.geometry;
    geo.attributes.position.needsUpdate = true;
    geo.attributes.color.needsUpdate = true;
    if (this.t > SHOW_TIME + 2.5) { this.active = false; this.points.visible = false; }
  }

  dispose() {
    this.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh || (o as THREE.Points).isPoints) {
        m.geometry.dispose();
        const mat = m.material as THREE.MeshStandardMaterial;
        mat.map?.dispose();
        mat.dispose();
      }
    });
    this.group.removeFromParent();
  }
}
