import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { BALLOON, LAKE } from '../city/outskirts';
import { groundHeight } from './collision';

export const BALLOON_PRICE = 20;
/** One ride: up, out over the desert towards the lake, back and down (s). */
const RIDE_TIME = 60;
const TOP = 90, OUT = 230;

const paint = (g: THREE.BufferGeometry, color: string) => {
  const geo = g.index ? g.toNonIndexed() : g;
  const c = new THREE.Color(color), n = geo.getAttribute('position').count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) a.set([c.r, c.g, c.b], i * 3);
  geo.setAttribute('color', new THREE.BufferAttribute(a, 3));
  geo.deleteAttribute('uv');
  return geo;
};
const box = (w: number, h: number, d: number, x: number, y: number, z: number, color: string) => paint(new THREE.BoxGeometry(w, h, d).translate(x, y, z), color);
const ease = (t: number) => t * t * (3 - 2 * t);

/** Where you stand to get in (next to the basket, on the road side). */
export const BALLOON_FRONT = { x: BALLOON.x, z: BALLOON.z - 3.2 };

/**
 * The hot air balloon on its launch pad: a striped envelope, ropes, a wicker basket and a burner.
 * `board()` gives the seat in the basket; the balloon then floats up, out and back by itself.
 */
export class Balloon {
  readonly group = new THREE.Group();
  private craft = new THREE.Group();
  private flame: THREE.Mesh;
  private readonly seat = new THREE.Object3D();
  private ride: { t: number } | null = null;
  private time = 0;
  private readonly y0: number;
  private readonly dir: { x: number; z: number };

  constructor() {
    this.y0 = groundHeight(BALLOON.x, BALLOON.z);
    // Launch pad: a round wooden deck with a little fence ring and a flag.
    const pad: THREE.BufferGeometry[] = [paint(new THREE.CylinderGeometry(BALLOON.r, BALLOON.r, 0.25, 32).translate(0, 0.12, 0), '#c9a46a')];
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      if (Math.abs(Math.atan2(Math.sin(a + Math.PI / 2), Math.cos(a + Math.PI / 2))) < 0.5) continue; // opening towards the road
      pad.push(box(0.12, 0.8, 0.12, Math.cos(a) * (BALLOON.r - 0.3), 0.6, Math.sin(a) * (BALLOON.r - 0.3), '#8a5a35'));
    }
    pad.push(box(0.08, 4, 0.08, BALLOON.r - 1, 2, BALLOON.r - 1, '#9aa0a8'), box(0.9, 0.55, 0.03, BALLOON.r - 0.5, 3.6, BALLOON.r - 1, '#e5484d'));
    const padMesh = new THREE.Mesh(mergeGeometries(pad)!, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 }));
    padMesh.receiveShadow = true;
    padMesh.position.set(BALLOON.x, this.y0, BALLOON.z);

    // Envelope: a lathe shape (round top, narrowing to the mouth), in colored slices.
    const prof: THREE.Vector2[] = [];
    for (let i = 0; i <= 14; i++) {
      const t = i / 14, a = t * Math.PI * 0.82;
      prof.push(new THREE.Vector2(Math.sin(a) * 6.2 * (t > 0.75 ? 1 - (t - 0.75) * 1.6 : 1) + 0.0001, 6.2 * Math.cos(a)));
    }
    prof.push(new THREE.Vector2(1.3, -7.2));
    prof.reverse();
    const slices = 12, colors = ['#e5484d', '#f5c400', '#1f6fe0', '#ffffff'];
    const env: THREE.BufferGeometry[] = [];
    for (let i = 0; i < slices; i++) env.push(paint(new THREE.LatheGeometry(prof, 3, (i / slices) * Math.PI * 2, (Math.PI * 2) / slices), colors[i % colors.length]));
    const parts = env.map((g) => g.translate(0, 13, 0));
    // Ropes from the mouth to the basket, the basket and the burner frame.
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4, top = new THREE.Vector3(Math.cos(a) * 1.25, 5.8, Math.sin(a) * 1.25), bot = new THREE.Vector3(Math.cos(a) * 0.75, 1.15, Math.sin(a) * 0.75);
      const g = new THREE.CylinderGeometry(0.025, 0.025, top.distanceTo(bot), 4);
      g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), top.clone().sub(bot).normalize()));
      parts.push(paint(g.translate((top.x + bot.x) / 2, (top.y + bot.y) / 2, (top.z + bot.z) / 2), '#5a4a3a'));
    }
    parts.push(box(1.6, 1.0, 1.6, 0, 0.5, 0, '#a0703f'), box(1.7, 0.12, 1.7, 0, 1.06, 0, '#7a5530'));
    for (let i = 0; i < 4; i++) parts.push(box(1.62, 0.05, 1.62, 0, 0.2 + i * 0.22, 0, '#8f6235')); // wicker bands
    parts.push(box(0.5, 0.35, 0.5, 0, 2.3, 0, '#55595f'), box(0.05, 1.2, 0.05, 0.25, 1.7, 0.25, '#55595f'), box(0.05, 1.2, 0.05, -0.25, 1.7, -0.25, '#55595f'));
    const craftMesh = new THREE.Mesh(mergeGeometries(parts)!, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, side: THREE.DoubleSide }));
    craftMesh.castShadow = true;
    this.flame = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.9, 10).translate(0, 2.95, 0), new THREE.MeshBasicMaterial({ color: '#ffb02e', transparent: true, opacity: 0.9 }));
    this.flame.visible = false;
    this.seat.position.set(-0.2, 1.02, 0.1); // high enough to look over the edge of the basket
    this.craft.add(craftMesh, this.flame, this.seat);
    this.group.add(padMesh, this.craft);
    // Fly towards the lake.
    const dx = LAKE.x - BALLOON.x, dz = LAKE.z - BALLOON.z, l = Math.hypot(dx, dz);
    this.dir = { x: dx / l, z: dz / l };
    this.update(0);
  }

  /** Get in: returns the seat (hips at its origin) and how long the ride lasts. */
  board(): { seat: THREE.Object3D; duration: number } {
    this.ride = { t: 0 };
    return { seat: this.seat, duration: RIDE_TIME };
  }

  leave() { this.ride = null; }

  update(dt: number) {
    this.time += dt;
    let x = BALLOON.x, z = BALLOON.z, y = this.y0 + 0.25;
    if (this.ride) {
      const r = this.ride;
      r.t = Math.min(RIDE_TIME, r.t + dt);
      const k = r.t / RIDE_TIME;
      // Up in the first 15 s, down in the last 15 s; out and back in a gentle loop.
      const up = Math.min(ease(Math.min(1, r.t / 15)), ease(Math.min(1, (RIDE_TIME - r.t) / 15)));
      const out = Math.sin(Math.PI * k) * OUT, side = Math.sin(Math.PI * 2 * k) * 70;
      x += this.dir.x * out - this.dir.z * side;
      z += this.dir.z * out + this.dir.x * side;
      y += up * TOP;
      // The burner roars now and then while flying.
      this.flame.visible = Math.sin(this.time * 1.3) > 0.55 && up > 0.05 && up < 0.99 ? true : up > 0.05 && (this.time % 6) < 1.2;
      if (this.flame.visible) this.flame.scale.setScalar(0.9 + Math.sin(this.time * 30) * 0.15);
    } else {
      this.flame.visible = false;
      y += Math.sin(this.time * 0.8) * 0.04; // a tethered balloon sways a little
    }
    this.craft.position.set(x, y, z);
    this.craft.rotation.y = Math.sin(this.time * 0.15) * 0.4;
  }

  dispose() {
    this.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) { m.geometry.dispose(); (m.material as THREE.Material).dispose(); }
    });
    this.group.removeFromParent();
  }
}
