import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { CURB_HEIGHT, type CityLayout } from '../city/layout';
import { groundHeight } from './collision';
import { createIcon } from './markers';
import type { Wildlife } from './wildlife';

/** A picnic basket costs this at the supermarket or the bakery; you can carry a few. */
export const PICNIC_PRICE = 5;
export const MAX_BASKETS = 3;
/** How long you sit on the blanket (seconds). */
const PICNIC_TIME = 16;

function paint(g: THREE.BufferGeometry, color: string) {
  const geo = g.index ? g.toNonIndexed() : g;
  const c = new THREE.Color(color), n = geo.getAttribute('position').count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) a.set([c.r, c.g, c.b], i * 3);
  geo.setAttribute('color', new THREE.BufferAttribute(a, 3));
  geo.deleteAttribute('uv');
  return geo;
}

/** A red-and-white checked blanket (2.6 × 2 m) lying on the grass, centered on the origin. */
function blanketGeometry() {
  const parts: THREE.BufferGeometry[] = [];
  const nx = 8, nz = 6, w = 2.6, d = 2;
  for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
    const red = (i + j) % 2 === 0;
    parts.push(paint(new THREE.BoxGeometry(w / nx, 0.02, d / nz).translate(-w / 2 + (i + 0.5) * (w / nx), 0.01, -d / 2 + (j + 0.5) * (d / nz)), red ? '#e0393e' : '#f6f1e7'));
  }
  return mergeGeometries(parts)!;
}

/** A wicker basket with a lid and a handle, plus two plates with a sandwich and an apple. */
function basketGeometry() {
  const parts = [
    paint(new THREE.BoxGeometry(0.5, 0.3, 0.34).translate(0, 0.15, 0), '#b07a3e'),
    paint(new THREE.BoxGeometry(0.54, 0.05, 0.38).translate(0, 0.32, 0), '#8f5f2c'),
    paint(new THREE.TorusGeometry(0.17, 0.022, 5, 12, Math.PI).translate(0, 0.34, 0), '#8f5f2c'),
    paint(new THREE.CylinderGeometry(0.16, 0.16, 0.02, 14).translate(0.55, 0.01, 0.35), '#ffffff'),
    paint(new THREE.CylinderGeometry(0.16, 0.16, 0.02, 14).translate(-0.55, 0.01, 0.35), '#ffffff'),
    paint(new THREE.BoxGeometry(0.16, 0.06, 0.12).translate(0.55, 0.05, 0.35), '#f2c46d'),
    paint(new THREE.SphereGeometry(0.06, 8, 6).translate(-0.55, 0.07, 0.35), '#d6312f'),
  ];
  return mergeGeometries(parts)!;
}

/**
 * Picnic in the park: a checked blanket on the grass by the pond. With a picnic basket (bought at the
 * supermarket or the bakery) you sit down on it, open the basket and share it with the ducks: they
 * swim over to the shore in front of you and little hearts float up above them.
 * 2 small meshes (blanket always, basket only during a picnic) + 3 heart icons.
 */
export class Picnic {
  readonly group = new THREE.Group();
  /** Where you sit (avatar root goes here), facing the pond. */
  readonly seat = new THREE.Object3D();
  /** Where you stand to start a picnic (next to the blanket, away from the pond). */
  readonly front: { x: number; z: number };
  readonly spot: { x: number; z: number };
  private basket: THREE.Mesh;
  private hearts: THREE.Sprite[];
  private t = -1;
  private v = new THREE.Vector3();

  constructor(layout: CityLayout, private wildlife?: Wildlife) {
    const pd = layout.park.pond;
    // West of the pond, between two of the trees around it, just outside the pond's edge.
    const a = Math.PI * 1.1, d = pd.r + 5;
    const x = pd.x + Math.cos(a) * d, z = pd.z + Math.sin(a) * d;
    const y = groundHeight(x, z);
    const face = Math.atan2(pd.x - x, pd.z - z); // towards the pond
    this.spot = { x, z };
    this.front = { x: x - Math.sin(face) * 2.2, z: z - Math.cos(face) * 2.2 };
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 });
    const blanket = new THREE.Mesh(blanketGeometry(), mat);
    blanket.position.set(x, y + CURB_HEIGHT + 0.01, z); // (the park lawn is raised like a sidewalk)
    blanket.rotation.y = face;
    blanket.receiveShadow = true;
    this.basket = new THREE.Mesh(basketGeometry(), mat);
    this.basket.position.set(x + Math.sin(face + 1.2) * 0.75, y + CURB_HEIGHT + 0.03, z + Math.cos(face + 1.2) * 0.75);
    this.basket.rotation.y = face;
    this.basket.castShadow = true;
    this.basket.visible = false;
    this.seat.position.set(x - Math.sin(face) * 0.35, y + CURB_HEIGHT + 0.05, z - Math.cos(face) * 0.35);
    this.seat.rotation.y = face;
    this.hearts = [0, 1, 2].map(() => { const h = createIcon('💕', '#ff6f91', 0.045); h.visible = false; this.group.add(h); return h; });
    this.group.add(blanket, this.basket, this.seat);
  }

  get active() { return this.t >= 0; }

  /** On (or right next to) the blanket: no grass blades grow there. */
  covers(x: number, z: number) { return Math.hypot(x - this.spot.x, z - this.spot.z) < 1.9; }

  /** Sit down for a picnic: the basket opens and the ducks come over. */
  board() {
    this.t = 0;
    this.basket.visible = true;
    this.wildlife?.attract(this.spot.x, this.spot.z, PICNIC_TIME);
    return { seat: this.seat, duration: PICNIC_TIME };
  }

  leave() {
    this.t = -1;
    this.basket.visible = false;
    for (const h of this.hearts) h.visible = false;
  }

  update(dt: number) {
    if (this.t < 0) return;
    this.t += dt;
    // Hearts float up above the two mother ducks and a duckling, one after another, once they've arrived.
    const birds = [{ kind: 'duck', index: 0 }, { kind: 'duck', index: 1 }, { kind: 'duckling', index: 0 }] as const;
    this.hearts.forEach((h, k) => {
      const phase = (this.t - 3 - k * 0.7) % 2.1;
      h.visible = this.t > 3 + k * 0.7 && !!this.wildlife;
      if (!h.visible || !this.wildlife) return;
      this.wildlife.where(birds[k], this.v);
      h.position.set(this.v.x, this.v.y + 0.6 + phase * 0.5, this.v.z);
      (h.material as THREE.SpriteMaterial).opacity = Math.min(1, (2.1 - phase) * 1.5);
    });
  }

  dispose() {
    this.group.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) m.geometry.dispose(); });
    this.group.removeFromParent();
  }
}
