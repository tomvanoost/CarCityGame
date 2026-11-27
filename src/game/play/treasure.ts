import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { CityLayout } from '../city/layout';
import { DESERT, DESERT_TOWN, FARM, LAKE, LAKE_TOWN, inLake, inStream, onOutRoad } from '../city/outskirts';
import { groundHeight } from './collision';

/** What the treasure chest holds. */
export const TREASURE_PRIZE = 500;
/** How big the blurry spot on the treasure map is (meters, radius). The chest is always inside it. */
export const TREASURE_RADIUS = 55;

/** This week's number (a new treasure every Monday). */
export function weekNumber(now = Date.now()) {
  return Math.floor((now / 86400000 + 3) / 7); // day 0 (1 Jan 1970) was a Thursday
}

export interface TreasureSpot { x: number; z: number; /** Middle of the blurry spot on the map. */ cx: number; cz: number }

/**
 * This week's hiding place: picked from the week number (the same for everybody), in the park, the
 * desert, the lake town, the farm or on the beach, never in water, on a road or inside something.
 */
export function treasureSpot(layout: CityLayout, week: number): TreasureSpot {
  let seed = (week * 2654435761) >>> 0;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const range = (a: number, b: number) => a + rnd() * (b - a);
  const free = (x: number, z: number) => !layout.colliders.some((c) => !c.off && x > c.x0 - 2 && x < c.x1 + 2 && z > c.z0 - 2 && z < c.z1 + 2)
    && !inLake(x, z, 5) && !inStream(x, z, 4) && !onOutRoad(x, z, 3);
  const pr = layout.park.rect;
  const places: (() => { x: number; z: number })[] = [
    () => ({ x: range(pr.x0 + 10, pr.x1 - 10), z: range(pr.z0 + 10, pr.z1 - 10) }),
    () => ({ x: range(DESERT.x0 + 150, DESERT_TOWN.x0 - 80), z: range(DESERT.z0 + 150, DESERT.z1 - 150) }),
    () => { const a = rnd() * Math.PI * 2, r = range(25, LAKE_TOWN.r - 20); return { x: LAKE_TOWN.x + Math.cos(a) * r, z: LAKE_TOWN.z + Math.sin(a) * r }; },
    () => ({ x: range(FARM.x0 + 40, FARM.x1 - 40), z: range(FARM.z0 + 40, FARM.z1 - 40) }),
    () => { const a = range(Math.PI * 1.15, Math.PI * 1.85); return { x: LAKE.x + Math.cos(a) * (LAKE.rx + 16), z: LAKE.z + Math.sin(a) * (LAKE.rz + 16) }; },
  ];
  const pick = places[Math.floor(rnd() * places.length)];
  let p = { x: (pr.x0 + pr.x1) / 2, z: (pr.z0 + pr.z1) / 2 };
  for (let i = 0; i < 300; i++) { const q = pick(); if (free(q.x, q.z)) { p = q; break; } }
  // The spot on the map is a bit off, so you still have to look around.
  const a = rnd() * Math.PI * 2, off = range(12, TREASURE_RADIUS * 0.6);
  return { x: p.x, z: p.z, cx: p.x + Math.cos(a) * off, cz: p.z + Math.sin(a) * off };
}

/** A soft four-pointed star for the sparkles. */
function sparkTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const glow = g.createRadialGradient(32, 32, 0, 32, 32, 30);
  glow.addColorStop(0, 'rgba(255,255,255,1)'); glow.addColorStop(0.25, 'rgba(255,255,255,0.6)'); glow.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = glow; g.fillRect(0, 0, 64, 64);
  g.fillStyle = '#ffffff';
  g.beginPath();
  for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2, r = i % 2 ? 5 : 30; g.lineTo(32 + Math.cos(a) * r, 32 + Math.sin(a) * r); }
  g.fill();
  return new THREE.CanvasTexture(c);
}

function paint(g: THREE.BufferGeometry, color: string) {
  const geo = g.index ? g.toNonIndexed() : g;
  const c = new THREE.Color(color), n = geo.getAttribute('position').count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) a.set([c.r, c.g, c.b], i * 3);
  geo.setAttribute('color', new THREE.BufferAttribute(a, 3));
  geo.deleteAttribute('uv');
  return geo;
}

/** The post office stand in the park (opposite the ice cream stand): you get the treasure map here. */
export function postOfficeMesh(layout: CityLayout) {
  const po = layout.pois.postOffice;
  const parts: THREE.BufferGeometry[] = [];
  const box = (w: number, h: number, d: number, x: number, y: number, z: number, color: string) =>
    parts.push(paint(new THREE.BoxGeometry(w, h, d).translate(x, y, z), color));
  box(3, 2.3, 2.2, 0, 1.15, 0, '#ff8c1a'); // orange kiosk
  box(3.2, 0.12, 0.6, 0, 1.15, 1.2, '#ffffff'); // counter
  box(2.4, 0.9, 0.05, 0, 1.8, 1.11, '#2f3440'); // window
  box(3.3, 0.18, 2.5, 0, 2.4, 0, '#1f4fa3'); // blue roof
  // A big envelope on the roof.
  box(1.5, 1, 0.12, 0, 3.05, 0, '#ffffff');
  for (const s of [-1, 1]) parts.push(paint(new THREE.BoxGeometry(0.85, 0.06, 0.04).rotateZ(s * 0.6).translate(s * 0.36, 3.3, 0.08), '#e5484d')); // envelope flap
  // A red letterbox beside it.
  box(0.5, 0.7, 0.4, 1.9, 0.95, 0.6, '#e5484d');
  box(0.08, 0.6, 0.08, 1.9, 0.3, 0.6, '#5a5f66');
  box(0.3, 0.05, 0.05, 1.9, 1.1, 0.81, '#1c1d20');
  const mesh = new THREE.Mesh(mergeGeometries(parts)!, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, side: THREE.DoubleSide }));
  mesh.position.set(po.x, groundHeight(po.x, po.z), po.z);
  mesh.castShadow = true;
  return mesh;
}

/**
 * This week's treasure chest: only shown when you have the map and haven't found it yet; it
 * sparkles so you can spot it from a distance.
 */
export class TreasureChest {
  readonly group = new THREE.Group();
  private chest: THREE.Mesh;
  private lid: THREE.Mesh;
  private sparks: THREE.Points;
  private sparkData: { a: number; r: number; t: number; s: number }[] = [];
  private time = 0;
  /** Lid opening (0 closed .. 1 open), after you found it. */
  private open = -1;

  constructor(readonly spot: TreasureSpot) {
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.2 });
    this.chest = new THREE.Mesh(mergeGeometries([
      paint(new THREE.BoxGeometry(1.1, 0.6, 0.7).translate(0, 0.3, 0), '#8a5a2b'),
      paint(new THREE.BoxGeometry(1.14, 0.08, 0.74).translate(0, 0.08, 0), '#e8b931'),
      paint(new THREE.BoxGeometry(1.14, 0.08, 0.74).translate(0, 0.56, 0), '#e8b931'),
      paint(new THREE.BoxGeometry(0.16, 0.2, 0.06).translate(0, 0.5, 0.37), '#e8b931'), // lock
      paint(new THREE.BoxGeometry(0.9, 0.12, 0.5).translate(0, 0.6, 0), '#ffd84a'), // gold inside
    ])!, mat);
    this.lid = new THREE.Mesh(mergeGeometries([
      paint(new THREE.CylinderGeometry(0.35, 0.35, 1.1, 12, 1, false, 0, Math.PI).rotateZ(Math.PI / 2).translate(0, 0, 0.35), '#8a5a2b'),
      paint(new THREE.CylinderGeometry(0.36, 0.36, 0.08, 12, 1, false, 0, Math.PI).rotateZ(Math.PI / 2).translate(0.4, 0, 0.35), '#e8b931'),
      paint(new THREE.CylinderGeometry(0.36, 0.36, 0.08, 12, 1, false, 0, Math.PI).rotateZ(Math.PI / 2).translate(-0.4, 0, 0.35), '#e8b931'),
    ])!, mat);
    this.lid.position.set(0, 0.6, -0.35); // hinge at the back
    this.chest.add(this.lid);
    this.chest.castShadow = true;
    const y = groundHeight(spot.x, spot.z);
    this.chest.position.set(spot.x, y, spot.z);
    this.chest.rotation.y = (spot.x * 13.7) % (Math.PI * 2);
    // Sparkles: little gold stars rising around the chest.
    const n = 24, pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) this.sparkData.push({ a: Math.random() * Math.PI * 2, r: 0.3 + Math.random() * 0.8, t: Math.random(), s: 0.6 + Math.random() * 0.6 });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.sparks = new THREE.Points(geo, new THREE.PointsMaterial({ map: sparkTexture(), color: '#ffe680', size: 0.35, transparent: true, opacity: 0.95, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.sparks.position.set(spot.x, y, spot.z);
    this.sparks.frustumCulled = false;
    this.group.add(this.chest, this.sparks);
    this.group.visible = false;
  }

  /** Show it or not; returns how far you are from it. */
  update(dt: number, show: boolean, x: number, z: number) {
    const dist = Math.hypot(x - this.spot.x, z - this.spot.z);
    this.group.visible = (show && dist < 160) || this.open >= 0;
    if (!this.group.visible) return dist;
    this.time += dt;
    if (this.open >= 0) {
      this.open = Math.min(1, this.open + dt * 1.5);
      this.lid.rotation.x = -this.open * 1.9;
    }
    const p = this.sparks.geometry.getAttribute('position') as THREE.BufferAttribute;
    this.sparkData.forEach((s, i) => {
      s.t += dt * s.s * (this.open >= 0 ? 2 : 1);
      if (s.t > 1) { s.t -= 1; s.a = Math.random() * Math.PI * 2; }
      const r = s.r * (this.open >= 0 ? 0.5 : 1);
      p.setXYZ(i, Math.cos(s.a + s.t) * r, 0.4 + s.t * (this.open >= 0 ? 3 : 1.8), Math.sin(s.a + s.t) * r);
    });
    p.needsUpdate = true;
    (this.sparks.material as THREE.PointsMaterial).size = 0.3 + Math.sin(this.time * 8) * 0.08;
    return dist;
  }

  /** You found it: the lid opens and gold sparkles shoot up; it disappears after a while. */
  openUp() {
    this.open = 0;
    setTimeout(() => { this.open = -1; this.group.visible = false; }, 6000);
  }

  dispose() {
    this.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh || (o as THREE.Points).isPoints) { m.geometry.dispose(); (m.material as THREE.Material).dispose(); }
    });
    this.group.removeFromParent();
  }
}
