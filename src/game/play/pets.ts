import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { CityLayout } from '../city/layout';
import { groundHeight } from './collision';

export type PetKind = 'dog' | 'cat';
export interface PetSpec { id: string; kind: PetKind; color: string; dark: string; price: number }

/** The pets in the pet shop. */
export const PETS: PetSpec[] = [
  { id: 'dog_golden', kind: 'dog', color: '#d9a35b', dark: '#9c6b33', price: 300 },
  { id: 'dog_brown', kind: 'dog', color: '#8a5a3a', dark: '#5a3a22', price: 300 },
  { id: 'dog_white', kind: 'dog', color: '#f2efe8', dark: '#3a3a3a', price: 300 },
  { id: 'dog_black', kind: 'dog', color: '#3a3a3e', dark: '#c8a070', price: 300 },
  { id: 'cat_orange', kind: 'cat', color: '#f08a3c', dark: '#b85a1e', price: 250 },
  { id: 'cat_grey', kind: 'cat', color: '#9aa0a8', dark: '#5d636b', price: 250 },
  { id: 'cat_black', kind: 'cat', color: '#2e2e33', dark: '#f2efe8', price: 250 },
  { id: 'cat_white', kind: 'cat', color: '#f4f2ee', dark: '#e0a060', price: 250 },
];
export const getPet = (id: string) => PETS.find((p) => p.id === id);

const paint = (g: THREE.BufferGeometry, color: string) => {
  const geo = g.index ? g.toNonIndexed() : g;
  const c = new THREE.Color(color), n = geo.getAttribute('position').count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) a.set([c.r, c.g, c.b], i * 3);
  geo.setAttribute('color', new THREE.BufferAttribute(a, 3));
  geo.deleteAttribute('uv');
  return geo;
};
const box = (w: number, h: number, d: number, x: number, y: number, z: number, color: string) => paint(new THREE.BoxGeometry(w, h, d).translate(x, y, z), color);

/**
 * A cute low-poly dog or cat (front = +Z) that follows you around: legs swing when it walks, the
 * body bobs and the tail wags. Body + head are one mesh, legs and tail are small separate parts.
 */
export class Pet {
  readonly root = new THREE.Group();
  private legs: THREE.Object3D[] = [];
  private tail: THREE.Object3D;
  private body: THREE.Object3D;
  private mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, metalness: 0 });
  private t = Math.random() * 10;
  x = 0;
  z = 0;
  heading = 0;
  private moving = 0;

  constructor(readonly spec: PetSpec) {
    const dog = spec.kind === 'dog', c = spec.color, d = spec.dark;
    const L = dog ? 0.62 : 0.5, W = dog ? 0.3 : 0.24, H = dog ? 0.28 : 0.22, legH = dog ? 0.26 : 0.2;
    const parts: THREE.BufferGeometry[] = [box(W, H, L, 0, legH + H / 2, 0, c)];
    const hy = legH + H + (dog ? 0.08 : 0.06), hz = L / 2 + 0.06, hs = dog ? 0.28 : 0.24;
    parts.push(box(hs, hs, hs, 0, hy, hz, c));
    // Eyes and nose.
    for (const x of [-hs * 0.25, hs * 0.25]) parts.push(box(0.04, 0.05, 0.02, x, hy + 0.03, hz + hs / 2 + 0.005, '#1d1d22'));
    if (dog) {
      parts.push(box(hs * 0.55, hs * 0.4, 0.14, 0, hy - 0.06, hz + hs / 2 + 0.06, c)); // snout
      parts.push(box(0.06, 0.05, 0.04, 0, hy - 0.02, hz + hs / 2 + 0.14, '#1d1d22'));
      for (const x of [-hs / 2 - 0.02, hs / 2 + 0.02]) parts.push(box(0.05, 0.16, 0.12, x, hy - 0.02, hz - 0.02, d)); // floppy ears
    } else {
      parts.push(box(0.04, 0.03, 0.02, 0, hy - 0.04, hz + hs / 2 + 0.005, '#e88a9a'));
      for (const x of [-hs * 0.3, hs * 0.3]) parts.push(paint(new THREE.ConeGeometry(0.05, 0.1, 4).translate(x, hy + hs / 2 + 0.04, hz - 0.02), c)); // pointy ears
    }
    parts.push(box(W * 0.8, 0.02, L * 0.5, 0, legH + H + 0.005, -L * 0.1, d)); // a patch on the back
    this.body = new THREE.Mesh(mergeGeometries(parts)!, this.mat);
    this.body.castShadow = true;
    this.root.add(this.body);
    for (const [x, z] of [[-W / 2 + 0.05, L / 2 - 0.08], [W / 2 - 0.05, L / 2 - 0.08], [-W / 2 + 0.05, -L / 2 + 0.08], [W / 2 - 0.05, -L / 2 + 0.08]]) {
      const leg = new THREE.Mesh(box(0.08, legH, 0.08, 0, -legH / 2, 0, c), this.mat);
      leg.position.set(x, legH, z); // pivot at the hip
      this.root.add(leg);
      this.legs.push(leg);
    }
    const tl = dog ? 0.26 : 0.38;
    const tail = new THREE.Mesh(box(0.05, 0.05, tl, 0, 0, -tl / 2, dog ? c : d), this.mat);
    tail.position.set(0, legH + H * 0.8, -L / 2);
    tail.rotation.x = dog ? -0.7 : -1.1; // pointing up and back
    this.root.add(tail);
    this.tail = tail;
  }

  place(x: number, z: number, heading: number) {
    this.x = x; this.z = z; this.heading = heading;
    this.root.position.set(x, groundHeight(x, z), z);
    this.root.rotation.y = heading;
  }

  /** Walking: trot after a spot behind the player; sit still when close. */
  follow(dt: number, target: { x: number; z: number }, maxSpeed: number) {
    const dx = target.x - this.x, dz = target.z - this.z, d = Math.hypot(dx, dz);
    if (d > 25) { this.place(target.x, target.z, this.heading); return; } // e.g. after a long drive
    let speed = 0;
    if (d > 0.5) {
      speed = Math.min(Math.max(maxSpeed * 1.15, 1.5), d * 3);
      this.x += (dx / d) * speed * dt;
      this.z += (dz / d) * speed * dt;
      const want = Math.atan2(dx, dz);
      this.heading += Math.atan2(Math.sin(want - this.heading), Math.cos(want - this.heading)) * Math.min(1, dt * 8);
    }
    this.moving += ((speed > 0.3 ? 1 : 0) - this.moving) * Math.min(1, dt * 6);
    this.root.position.set(this.x, groundHeight(this.x, this.z), this.z);
    this.root.rotation.y = this.heading;
    this.animate(dt, speed);
  }

  /** Riding along (in the car): just the tail wags. */
  animate(dt: number, speed = 0) {
    this.t += dt * (2 + speed * 2.2);
    const swing = Math.sin(this.t * 2) * 0.6 * this.moving;
    this.legs.forEach((leg, i) => { leg.rotation.x = (i === 0 || i === 3 ? swing : -swing); });
    this.body.position.y = Math.abs(Math.sin(this.t * 2)) * 0.025 * this.moving;
    this.tail.rotation.y = Math.sin(this.t * (this.spec.kind === 'dog' ? 7 : 2.5)) * (this.spec.kind === 'dog' ? 0.6 : 0.3);
  }

  dispose() {
    this.root.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) m.geometry.dispose(); });
    this.mat.dispose();
    this.root.removeFromParent();
  }
}

/** "🐾 DIERENWINKEL" sign texture. */
function signTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 96;
  const g = c.getContext('2d')!;
  g.fillStyle = '#2f9e6a'; g.fillRect(0, 0, 512, 96);
  g.fillStyle = '#ffffff';
  g.font = '900 54px Nunito, Arial, sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('🐾 DIEREN', 256, 52);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** The pet shop next to the supermarket: a small shop with a green awning, a sign and a dog house out front. */
export class PetShopBuilding {
  readonly group = new THREE.Group();

  constructor(layout: CityLayout) {
    const ps = layout.pois.petShop;
    const parts: THREE.BufferGeometry[] = [
      box(12, 5, 10, 0, 2.5, 0, '#fff4dd'),
      box(12.4, 0.4, 10.4, 0, 5.2, 0, '#2f9e6a'),
      box(8, 2.6, 0.1, 0, 1.6, 5.03, '#2b4a66'), // shop window
      box(1.6, 2.4, 0.12, -4.6, 1.2, 5.05, '#7a5230'), // door
    ];
    for (let i = 0; i < 8; i++) parts.push(paint(new THREE.BoxGeometry(1.5, 0.06, 1.4).rotateX(0.35).translate(-5.25 + i * 1.5, 3.6, 5.6), i % 2 ? '#ffffff' : '#2f9e6a'));
    // A little dog house by the door.
    parts.push(box(1.2, 0.9, 1.2, 4.6, 0.45, 6.4, '#c46a3a'));
    parts.push(paint(new THREE.ConeGeometry(0.95, 0.6, 4).rotateY(Math.PI / 4).translate(4.6, 1.2, 6.4), '#8a3a24'));
    parts.push(box(0.5, 0.55, 0.02, 4.6, 0.3, 7.01, '#3a2a22'));
    const mesh = new THREE.Mesh(mergeGeometries(parts)!, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, metalness: 0 }));
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(8, 1.5), new THREE.MeshStandardMaterial({ map: signTexture(), roughness: 0.6 }));
    sign.position.set(0, 4.4, 5.06);
    this.group.add(mesh, sign);
    this.group.position.set(ps.x, groundHeight(ps.x, ps.z), ps.z);
  }

  dispose() {
    this.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      m.geometry.dispose();
      const mat = m.material as THREE.MeshStandardMaterial;
      mat.map?.dispose();
      mat.dispose();
    });
    this.group.removeFromParent();
  }
}
