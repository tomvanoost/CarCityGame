import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { JETTY, jettyHeight } from '../city/outskirts';

/** What you can catch (catch and release). Names in i18n as `fish_<id>`. */
export const FISH = [
  { id: 'roach', emoji: '🐟', reward: 5, weight: 30 },
  { id: 'perch', emoji: '🐠', reward: 8, weight: 26 },
  { id: 'crayfish', emoji: '🦞', reward: 12, weight: 14 },
  { id: 'carp', emoji: '🐡', reward: 15, weight: 14 },
  { id: 'boot', emoji: '🥾', reward: 5, weight: 10 },
  { id: 'goldfish', emoji: '🌟', reward: 25, weight: 6 },
] as const;
export type FishId = (typeof FISH)[number]['id'];

export function randomFish() {
  let r = Math.random() * FISH.reduce((s, f) => s + f.weight, 0);
  for (const f of FISH) { r -= f.weight; if (r <= 0) return f; }
  return FISH[0];
}

/** Where you stand to fish (the end of the jetty) and where the float lands. */
export const FISH_SPOT = { x: JETTY.x, z: JETTY.z1 - 1.6 };
export const FLOAT = { x: JETTY.x + 3.2, z: JETTY.z1 + 6 };
/** How long the float stays under: tap within this time. */
export const BITE_TIME = 1.8;

const paint = (g: THREE.BufferGeometry, color: string) => {
  const geo = g.index ? g.toNonIndexed() : g;
  const c = new THREE.Color(color), n = geo.getAttribute('position').count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) a.set([c.r, c.g, c.b], i * 3);
  geo.setAttribute('color', new THREE.BufferAttribute(a, 3));
  geo.deleteAttribute('uv');
  return geo;
};

/** A fishing rod to hold in the hand (points forward and up). */
export function rodGeometry() {
  return mergeGeometries([
    paint(new THREE.CylinderGeometry(0.025, 0.03, 0.35, 6).translate(0, 0.17, 0), '#3a2f2a'),
    paint(new THREE.CylinderGeometry(0.006, 0.018, 1.9, 5).translate(0, 1.3, 0), '#c8a46a'),
    paint(new THREE.TorusGeometry(0.05, 0.015, 4, 8).rotateY(Math.PI / 2).translate(0.04, 0.3, 0), '#9aa0a8'),
  ])!.rotateX(0.9);
}

/**
 * The fishing jetty (wooden deck on posts with a little bench), plus the float, the line and a
 * splash ring while you fish.
 */
export class FishingJetty {
  readonly group = new THREE.Group();
  private float: THREE.Mesh;
  private ring: THREE.Mesh;
  private line: THREE.Line;
  private time = 0;
  private splash = 0;

  constructor() {
    const parts: THREE.BufferGeometry[] = [];
    const len = JETTY.z1 - JETTY.z0, w = JETTY.half * 2;
    // Planks (slightly different browns), following the ramp at the shore end.
    for (let z = JETTY.z0; z < JETTY.z1 - 0.1; z += 0.5) {
      const y = jettyHeight(z + 0.25);
      parts.push(paint(new THREE.BoxGeometry(w, 0.08, 0.46).translate(JETTY.x, y - 0.04, z + 0.25), (Math.round(z * 2) % 3) ? '#a0703f' : '#8f6235'));
    }
    // Posts in the water and a low railing on both sides of the water part.
    for (let z = JETTY.z0 + 8; z <= JETTY.z1; z += 3) {
      for (const s of [-1, 1]) {
        parts.push(paint(new THREE.CylinderGeometry(0.12, 0.12, 1.6, 6).translate(JETTY.x + s * (JETTY.half - 0.1), JETTY.h - 0.6, Math.min(z, JETTY.z1 - 0.15)), '#6e4a28'));
        parts.push(paint(new THREE.CylinderGeometry(0.06, 0.06, 0.8, 5).translate(JETTY.x + s * (JETTY.half - 0.1), JETTY.h + 0.4, Math.min(z, JETTY.z1 - 0.15)), '#7b5530'));
      }
    }
    for (const s of [-1, 1]) parts.push(paint(new THREE.BoxGeometry(0.08, 0.08, len - 8).translate(JETTY.x + s * (JETTY.half - 0.1), JETTY.h + 0.78, JETTY.z0 + 8 + (len - 8) / 2), '#8f6235'));
    // A little bench near the end, and a bucket.
    parts.push(paint(new THREE.BoxGeometry(1.4, 0.08, 0.4).translate(JETTY.x - 0.4, JETTY.h + 0.45, JETTY.z1 - 5), '#7b5530'));
    for (const dx of [-0.95, 0.15]) parts.push(paint(new THREE.BoxGeometry(0.08, 0.45, 0.35).translate(JETTY.x + dx, JETTY.h + 0.22, JETTY.z1 - 5), '#6e4a28'));
    parts.push(paint(new THREE.CylinderGeometry(0.2, 0.16, 0.35, 10).translate(JETTY.x + 0.8, JETTY.h + 0.18, JETTY.z1 - 3), '#3d7fd9'));
    const deck = new THREE.Mesh(mergeGeometries(parts)!, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 }));
    deck.castShadow = true;
    deck.receiveShadow = true;

    // Float: red top, white bottom.
    this.float = new THREE.Mesh(mergeGeometries([
      paint(new THREE.SphereGeometry(0.24, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), '#e5484d'),
      paint(new THREE.SphereGeometry(0.24, 12, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), '#ffffff'),
      paint(new THREE.CylinderGeometry(0.03, 0.03, 0.4, 5).translate(0, 0.38, 0), '#e5484d'),
    ])!, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5 }));
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.45, 0.65, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, depthWrite: false }));
    this.line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), new THREE.LineBasicMaterial({ color: '#f4f4f4', transparent: true, opacity: 0.8 }));
    this.float.visible = this.ring.visible = this.line.visible = false;
    this.line.frustumCulled = false;
    this.group.add(deck, this.float, this.ring, this.line);
  }

  /**
   * Float and line while fishing. `tip` = the rod tip in the world (null = not fishing),
   * `bite` = the float is pulled under.
   */
  update(dt: number, tip: THREE.Vector3 | null, bite: boolean) {
    this.time += dt;
    const on = !!tip;
    this.float.visible = this.line.visible = on;
    if (!on) { this.ring.visible = false; return; }
    const y = bite ? -0.2 + Math.sin(this.time * 18) * 0.08 : Math.sin(this.time * 2.2) * 0.04 + 0.04;
    this.float.position.set(FLOAT.x, y, FLOAT.z);
    if (bite && this.splash <= 0) this.splash = 0.8;
    this.splash = Math.max(0, this.splash - dt);
    this.ring.visible = this.splash > 0;
    if (this.ring.visible) {
      const k = 1 + (0.8 - this.splash) * 3;
      this.ring.scale.set(k, 1, k);
      this.ring.position.set(FLOAT.x, 0.02, FLOAT.z);
      (this.ring.material as THREE.MeshBasicMaterial).opacity = this.splash;
    }
    const pos = this.line.geometry.getAttribute('position') as THREE.BufferAttribute;
    pos.setXYZ(0, tip!.x, tip!.y, tip!.z);
    pos.setXYZ(1, FLOAT.x, y + 0.55, FLOAT.z);
    pos.needsUpdate = true;
  }

  dispose() {
    this.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh || (o as THREE.Line).isLine) { m.geometry.dispose(); (m.material as THREE.Material).dispose(); }
    });
    this.group.removeFromParent();
  }
}
