import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { CityLayout } from '../city/layout';
import { groundHeight } from './collision';

export const RIDE_PRICE = 10;
export type RideKind = 'wheel' | 'carousel';

const WHEEL_R = 10, WHEEL_HUB = 12.6, GONDOLAS = 12;
/** One full turn of the Ferris wheel (s); a ride is one turn. */
const WHEEL_TURN = 48;
const CAROUSEL_R = 5, HORSES = 8;
/** One turn of the carousel (s); a ride is two turns. */
const CAROUSEL_TURN = 12;

const paint = (g: THREE.BufferGeometry, color: string) => {
  const geo = g.index ? g.toNonIndexed() : g;
  const c = new THREE.Color(color), n = geo.getAttribute('position').count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) a.set([c.r, c.g, c.b], i * 3);
  geo.setAttribute('color', new THREE.BufferAttribute(a, 3));
  geo.deleteAttribute('uv');
  return geo;
};
const box = (w: number, h: number, d: number, x: number, y: number, z: number, color: string) => paint(new THREE.BoxGeometry(w, h, d).translate(x, y, z), color);
/** A round bar from a to b. */
const bar = (a: THREE.Vector3, b: THREE.Vector3, r: number, color: string, seg = 6) => {
  const len = a.distanceTo(b);
  const g = new THREE.CylinderGeometry(r, r, len, seg);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize()));
  g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
  return paint(g, color);
};
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const COLORS = ['#e5484d', '#ff9f1c', '#f5c400', '#2fa84f', '#1f6fe0', '#8e5bd9'];

/**
 * The fun fair in the park: a Ferris wheel and a carousel that always turn. You ride as a passenger:
 * `board()` gives the seat (an Object3D that follows your gondola or horse) to put the avatar on.
 */
export class FunFair {
  readonly group = new THREE.Group();
  private wheel = new THREE.Group();
  private gondolas: THREE.InstancedMesh;
  private carouselTop = new THREE.Group();
  private horses: THREE.InstancedMesh;
  private wheelAngle = 0;
  private carouselAngle = 0;
  private time = 0;
  private readonly wy: number;
  private readonly cy: number;
  private readonly seat = new THREE.Object3D();
  private riding: { kind: RideKind; index: number } | null = null;
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private p = new THREE.Vector3();
  private s = new THREE.Vector3(1, 1, 1);

  constructor(private layout: CityLayout) {
    const { wheel, carousel } = layout.pois.funFair;
    this.wy = groundHeight(wheel.x, wheel.z);
    this.cy = groundHeight(carousel.x, carousel.z);
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.1 });

    // ---- Ferris wheel: the stand (still) ----
    const stand: THREE.BufferGeometry[] = [box(6, 0.5, 5, 0, 0.25, 0, '#d9d4c7'), box(2.4, 0.3, 1.6, 0, 0.65, 2.3, '#c9c3b4')];
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) stand.push(bar(V(sx * 7, 0, sz * 3.2), V(0, WHEEL_HUB, sz * 1.35), 0.22, '#f4f4f4'));
    for (const sz of [-1, 1]) stand.push(bar(V(-4.6, 4.2, sz * 2.6), V(4.6, 4.2, sz * 2.6), 0.14, '#f4f4f4'));
    stand.push(bar(V(0, WHEEL_HUB, -1.6), V(0, WHEEL_HUB, 1.6), 0.45, '#8a8f96', 12));
    const standMesh = new THREE.Mesh(mergeGeometries(stand)!, mat);
    standMesh.position.set(wheel.x, this.wy, wheel.z);

    // ---- Ferris wheel: the turning ring, spokes and gondola bars ----
    const ring: THREE.BufferGeometry[] = [];
    for (const z of [-1.05, 1.05]) {
      ring.push(paint(new THREE.TorusGeometry(WHEEL_R, 0.16, 6, 48).translate(0, 0, z), '#ffffff'));
      ring.push(paint(new THREE.TorusGeometry(WHEEL_R * 0.55, 0.1, 6, 32).translate(0, 0, z), '#ffffff'));
      for (let i = 0; i < GONDOLAS; i++) {
        const a = (i / GONDOLAS) * Math.PI * 2;
        ring.push(bar(V(0, 0, z), V(Math.cos(a) * WHEEL_R, Math.sin(a) * WHEEL_R, z), 0.07, COLORS[i % COLORS.length], 4));
      }
    }
    for (let i = 0; i < GONDOLAS; i++) {
      const a = (i / GONDOLAS) * Math.PI * 2;
      ring.push(bar(V(Math.cos(a) * WHEEL_R, Math.sin(a) * WHEEL_R, -1.1), V(Math.cos(a) * WHEEL_R, Math.sin(a) * WHEEL_R, 1.1), 0.08, '#c0c4ca', 4));
      // Little light bulbs on the rim.
      const b = a + Math.PI / GONDOLAS;
      ring.push(paint(new THREE.SphereGeometry(0.18, 6, 4).translate(Math.cos(b) * WHEEL_R, Math.sin(b) * WHEEL_R, 1.25), '#fff3a6'));
    }
    const ringMesh = new THREE.Mesh(mergeGeometries(ring)!, mat);
    this.wheel.add(ringMesh);
    this.wheel.position.set(wheel.x, this.wy + WHEEL_HUB, wheel.z);

    // ---- Gondolas: open cabins hanging below their bar (instanced, each its own color) ----
    const gw = 1.7, gd = 1.5;
    const cabin: THREE.BufferGeometry[] = [
      box(gw, 0.12, gd, 0, -2.15, 0, '#ffffff'),
      box(gw, 0.55, 0.06, 0, -1.85, gd / 2, '#ffffff'), box(gw, 0.55, 0.06, 0, -1.85, -gd / 2, '#ffffff'),
      box(0.06, 0.55, gd, gw / 2, -1.85, 0, '#ffffff'), box(0.06, 0.55, gd, -gw / 2, -1.85, 0, '#ffffff'),
      box(gw + 0.2, 0.12, gd + 0.2, 0, -0.35, 0, '#ffffff'),
      box(0.5, 0.35, 0.5, 0, -0.15, 0, '#d0d3d8'),
    ];
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) cabin.push(box(0.06, 1.7, 0.06, sx * (gw / 2 - 0.05), -1.25, sz * (gd / 2 - 0.05), '#e8e8e8'));
    this.gondolas = new THREE.InstancedMesh(mergeGeometries(cabin)!, mat, GONDOLAS);
    for (let i = 0; i < GONDOLAS; i++) this.gondolas.setColorAt(i, new THREE.Color(COLORS[i % COLORS.length]).lerp(new THREE.Color('#ffffff'), 0.15));

    // ---- Carousel: base (still), turning top with poles + striped roof, horses ----
    const base = new THREE.Mesh(mergeGeometries([
      paint(new THREE.CylinderGeometry(7.3, 7.5, 0.4, 32).translate(0, 0.2, 0), '#c9b48a'),
      paint(new THREE.CylinderGeometry(1.4, 1.4, 0.3, 16).translate(0, 0.55, 0), '#8e5bd9'),
    ])!, mat);
    base.position.set(carousel.x, this.cy, carousel.z);
    const top: THREE.BufferGeometry[] = [
      paint(new THREE.CylinderGeometry(6.6, 6.6, 0.2, 32).translate(0, 0.5, 0), '#f3e6c4'),
      paint(new THREE.CylinderGeometry(1.1, 1.1, 4.6, 16).translate(0, 2.8, 0), '#f5c400'),
      paint(new THREE.CylinderGeometry(7.2, 7.2, 0.5, 32, 1, true).translate(0, 5.35, 0), '#e5484d'),
    ];
    // Striped roof: a cone made of colored slices.
    const slices = 16;
    for (let i = 0; i < slices; i++) {
      top.push(paint(new THREE.ConeGeometry(7.4, 2.4, 2, 1, true, (i / slices) * Math.PI * 2, (Math.PI * 2) / slices).translate(0, 6.8, 0), i % 2 ? '#ffffff' : '#e5484d'));
    }
    top.push(paint(new THREE.SphereGeometry(0.4, 8, 6).translate(0, 8.1, 0), '#f5c400'));
    for (let i = 0; i < HORSES; i++) {
      const a = (i / HORSES) * Math.PI * 2;
      top.push(bar(V(Math.cos(a) * CAROUSEL_R, 0.6, Math.sin(a) * CAROUSEL_R), V(Math.cos(a) * CAROUSEL_R, 5.6, Math.sin(a) * CAROUSEL_R), 0.06, '#f5c400', 6));
    }
    const topMesh = new THREE.Mesh(mergeGeometries(top)!, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.1, side: THREE.DoubleSide }));
    this.carouselTop.add(topMesh);
    this.carouselTop.position.set(carousel.x, this.cy, carousel.z);

    // A friendly low-poly horse, looking along +Z (white body: the instance color tints it).
    const horse: THREE.BufferGeometry[] = [
      box(0.5, 0.5, 1.3, 0, 0, 0, '#ffffff'),
      box(0.3, 0.6, 0.3, 0, 0.35, 0.6, '#ffffff').rotateX(-0.4),
      box(0.3, 0.3, 0.55, 0, 0.75, 0.85, '#ffffff'),
      box(0.12, 0.5, 0.35, 0, 0.5, 0.5, '#5a3a22'), // mane
      box(0.56, 0.08, 0.5, 0, 0.27, 0, '#c8352d'), // saddle
      box(0.1, 0.5, 0.1, 0, -0.05, -0.75, '#5a3a22').rotateX(0.5), // tail
    ];
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) horse.push(box(0.12, 0.6, 0.12, sx * 0.17, -0.5, sz * 0.48, '#ffffff'));
    this.horses = new THREE.InstancedMesh(mergeGeometries(horse)!, mat, HORSES);
    const horseColors = ['#ffffff', '#f2c9a0', '#bfe3ff', '#ffd1e8'];
    for (let i = 0; i < HORSES; i++) this.horses.setColorAt(i, new THREE.Color(horseColors[i % horseColors.length]));

    for (const m of [standMesh, ringMesh, this.gondolas, base, topMesh, this.horses]) { m.castShadow = true; m.receiveShadow = true; }
    this.gondolas.frustumCulled = this.horses.frustumCulled = false;
    this.group.add(standMesh, this.wheel, this.gondolas, base, this.carouselTop, this.horses, this.seat);
    this.update(0);
  }

  private gondolaAngle(i: number) { return this.wheelAngle + (i / GONDOLAS) * Math.PI * 2; }
  private horseAngle(i: number) { return this.carouselAngle + (i / HORSES) * Math.PI * 2; }
  private horseLift(i: number) { return Math.sin(this.time * 2.2 + i * 1.7) * 0.25; }

  /** Get on: returns the seat to put the avatar on (hips at its origin) and how long the ride lasts. */
  board(kind: RideKind): { seat: THREE.Object3D; duration: number } {
    let best = 0, bestD = Infinity;
    const count = kind === 'wheel' ? GONDOLAS : HORSES;
    const front = this.layout.pois.funFair[kind].front;
    const { carousel } = this.layout.pois.funFair;
    for (let i = 0; i < count; i++) {
      // Wheel: the gondola nearest the bottom. Carousel: the horse nearest the entrance.
      const d = kind === 'wheel'
        ? Math.sin(this.gondolaAngle(i)) + 1
        : Math.hypot(carousel.x + Math.cos(this.horseAngle(i)) * CAROUSEL_R - front.x, carousel.z + Math.sin(this.horseAngle(i)) * CAROUSEL_R - front.z);
      if (d < bestD) { bestD = d; best = i; }
    }
    this.riding = { kind, index: best };
    this.update(0);
    return { seat: this.seat, duration: kind === 'wheel' ? WHEEL_TURN : CAROUSEL_TURN * 2 };
  }

  leave() { this.riding = null; }

  update(dt: number) {
    this.time += dt;
    this.wheelAngle += (dt / WHEEL_TURN) * Math.PI * 2;
    this.carouselAngle += (dt / CAROUSEL_TURN) * Math.PI * 2;
    const { wheel, carousel } = this.layout.pois.funFair;
    this.wheel.rotation.z = this.wheelAngle;
    // Gondolas hang straight down, whatever the wheel's angle.
    this.q.identity();
    for (let i = 0; i < GONDOLAS; i++) {
      const a = this.gondolaAngle(i);
      this.p.set(wheel.x + Math.cos(a) * WHEEL_R, this.wy + WHEEL_HUB + Math.sin(a) * WHEEL_R, wheel.z);
      this.gondolas.setMatrixAt(i, this.m.compose(this.p, this.q, this.s));
      if (this.riding?.kind === 'wheel' && this.riding.index === i) {
        this.seat.position.set(this.p.x, this.p.y - 1.6, this.p.z - 0.15);
        this.seat.rotation.set(0, 0, 0);
      }
    }
    this.gondolas.instanceMatrix.needsUpdate = true;
    this.carouselTop.rotation.y = -this.carouselAngle;
    for (let i = 0; i < HORSES; i++) {
      const a = this.horseAngle(i);
      const heading = Math.atan2(-Math.sin(a), Math.cos(a));
      this.p.set(carousel.x + Math.cos(a) * CAROUSEL_R, this.cy + 1.75 + this.horseLift(i), carousel.z + Math.sin(a) * CAROUSEL_R);
      this.q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, heading);
      this.horses.setMatrixAt(i, this.m.compose(this.p, this.q, this.s));
      if (this.riding?.kind === 'carousel' && this.riding.index === i) {
        this.seat.position.set(this.p.x, this.p.y + 0.45, this.p.z);
        this.seat.rotation.set(0, heading, 0);
      }
    }
    this.horses.instanceMatrix.needsUpdate = true;
  }

  dispose() {
    this.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) { m.geometry.dispose(); (m.material as THREE.Material).dispose(); }
    });
    this.group.removeFromParent();
  }
}
