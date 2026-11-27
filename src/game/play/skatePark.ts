import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { CityLayout } from '../city/layout';
import { groundHeight } from './collision';

/** Half-pipe: flat bottom half-width, ramp radius, deck width, length (along Z). */
export const PIPE = { flat: 3, r: 3.5, deck: 1.5, len: 8 };
export const SKATE_TIME = 15;

/** Height of the half-pipe surface at x (across the pipe, 0 = middle). */
function pipeY(x: number) {
  const a = Math.abs(x) - PIPE.flat;
  if (a <= 0) return 0;
  const k = Math.min(a, PIPE.r * 0.999);
  return PIPE.r - Math.sqrt(PIPE.r * PIPE.r - k * k);
}
/** Slope angle of the surface at x (0 flat .. π/2 vertical). */
function pipeSlope(x: number) {
  const a = Math.abs(x) - PIPE.flat;
  if (a <= 0) return 0;
  return Math.asin(Math.min(0.999, a / PIPE.r)) * Math.sign(x);
}

function paint(g: THREE.BufferGeometry, color: string) {
  const geo = g.index ? g.toNonIndexed() : g;
  const c = new THREE.Color(color), n = geo.getAttribute('position').count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) a.set([c.r, c.g, c.b], i * 3);
  geo.setAttribute('color', new THREE.BufferAttribute(a, 3));
  geo.deleteAttribute('uv');
  return geo;
}
const box = (w: number, h: number, d: number, x: number, y: number, z: number, color: string) => paint(new THREE.BoxGeometry(w, h, d).translate(x, y, z), color);

/** A skateboard (along Z, top at y = 0.12): a deck with kicked ends and four wheels. */
function boardGeometry() {
  return mergeGeometries([
    box(0.22, 0.03, 0.62, 0, 0.1, 0, '#ff5a5f'),
    paint(new THREE.BoxGeometry(0.22, 0.03, 0.12).rotateX(-0.4).translate(0, 0.12, 0.35), '#ff5a5f'),
    paint(new THREE.BoxGeometry(0.22, 0.03, 0.12).rotateX(0.4).translate(0, 0.12, -0.35), '#ff5a5f'),
    ...[-0.22, 0.22].flatMap((z) => [-0.08, 0.08].map((x) => paint(new THREE.CylinderGeometry(0.035, 0.035, 0.04, 8).rotateZ(Math.PI / 2).translate(x, 0.04, z), '#ffd400'))),
  ])!;
}

/**
 * The skate park in the city park: a concrete half-pipe (open on both long sides), a bench and a sign.
 * `start()` gives a ride: you roll in, swing up and down the pipe higher and higher, catch air at the
 * top with a little turn and stars, and roll out again. Nobody falls.
 */
export class SkatePark {
  readonly group = new THREE.Group();
  readonly seat = new THREE.Object3D();
  private board: THREE.Mesh;
  private stars: THREE.Points;
  private starData: { x: number; y: number; z: number; vx: number; vy: number; vz: number; t: number }[] = [];
  private ride: { t: number } | null = null;
  private airWas = false;
  private y0: number;
  private origin: THREE.Vector3;

  constructor(private layout: CityLayout) {
    const sp = layout.pois.skatePark;
    this.y0 = groundHeight(sp.x, sp.z);
    this.origin = new THREE.Vector3(sp.x, this.y0, sp.z);
    // Half-pipe: the cross-section (ramps + decks), extruded along Z.
    const P = PIPE, W = P.flat + P.r + P.deck;
    const sh = new THREE.Shape();
    sh.moveTo(-W, 0); sh.lineTo(-W, P.r); sh.lineTo(-(P.flat + P.r), P.r);
    for (let i = 1; i <= 16; i++) { const x = -(P.flat + P.r) + (P.r * i) / 16; sh.lineTo(x, pipeY(x)); }
    sh.lineTo(P.flat, 0);
    for (let i = 1; i <= 16; i++) { const x = P.flat + (P.r * i) / 16; sh.lineTo(x, pipeY(x)); }
    sh.lineTo(W, P.r); sh.lineTo(W, 0); sh.lineTo(-W, 0);
    const parts: THREE.BufferGeometry[] = [
      paint(new THREE.ExtrudeGeometry(sh, { depth: P.len, bevelEnabled: false, curveSegments: 1 }).translate(0, 0, -P.len / 2), '#b9bdc2'),
      box(W * 2 + 3, 0.06, P.len + 7, 0, 0.03, 0, '#a6aab0'), // concrete pad
    ];
    // Steel coping along both lips, and railings at the back of the decks.
    for (const s of [-1, 1]) {
      parts.push(paint(new THREE.CylinderGeometry(0.05, 0.05, P.len, 8).rotateX(Math.PI / 2).translate(s * (P.flat + P.r), P.r, 0), '#e2e5e8'));
      for (const z of [-P.len / 2 + 0.1, 0, P.len / 2 - 0.1]) parts.push(box(0.05, 0.9, 0.05, s * (W - 0.1), P.r + 0.45, z, '#5a5f66'));
      parts.push(box(0.05, 0.05, P.len, s * (W - 0.1), P.r + 0.9, 0, '#5a5f66'));
    }
    // A bench, a sign with a skateboard on it, and two traffic cones.
    parts.push(box(1.8, 0.1, 0.45, -3, 0.45, P.len / 2 + 2.6, '#8a5a35'), box(0.1, 0.4, 0.4, -3.8, 0.22, P.len / 2 + 2.6, '#5a5f66'), box(0.1, 0.4, 0.4, -2.2, 0.22, P.len / 2 + 2.6, '#5a5f66'));
    parts.push(box(0.08, 2, 0.08, 4, 1, P.len / 2 + 2.8, '#5a5f66'), box(1.2, 0.7, 0.05, 4, 2, P.len / 2 + 2.8, '#1f8fe0'));
    parts.push(boardGeometry().rotateX(Math.PI / 2).rotateZ(0.3).translate(4, 2, P.len / 2 + 2.84));
    for (const x of [-6, 6]) parts.push(paint(new THREE.ConeGeometry(0.2, 0.5, 10).translate(x, 0.25, P.len / 2 + 2), '#ff8a1a'));
    const mesh = new THREE.Mesh(mergeGeometries(parts)!, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 }));
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.position.copy(this.origin);
    // The board under your feet during the ride, and stars when you catch air.
    this.board = new THREE.Mesh(boardGeometry(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 }));
    this.board.visible = false;
    this.board.castShadow = true;
    this.seat.add(this.board);
    const n = 30;
    for (let i = 0; i < n; i++) this.starData.push({ x: 0, y: -100, z: 0, vx: 0, vy: 0, vz: 0, t: 0 });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    this.stars = new THREE.Points(geo, new THREE.PointsMaterial({ color: '#ffe14d', size: 0.3, transparent: true, depthWrite: false }));
    this.stars.frustumCulled = false;
    this.group.add(mesh, this.seat, this.stars);
  }

  /** Where you stand to start (on the pad, south of the pipe's open side). */
  get front() { return this.layout.pois.skatePark.front; }

  start(): { seat: THREE.Object3D; duration: number } {
    this.ride = { t: 0 };
    this.board.visible = true;
    return { seat: this.seat, duration: SKATE_TIME };
  }

  leave() { this.ride = null; this.board.visible = false; }

  /** Rolling (true) or walking in / out (false), for the avatar animation. */
  get rolling() { return !!this.ride && this.ride.t > 1.2 && this.ride.t < SKATE_TIME - 1.2; }

  update(dt: number) {
    const sp = this.layout.pois.skatePark, f = sp.front;
    if (this.ride) {
      const r = this.ride;
      r.t = Math.min(SKATE_TIME, r.t + dt);
      const t = r.t, top = PIPE.flat + PIPE.r;
      let x = 0, z = 0, y = 0, yaw = 0, tilt = 0, air = 0;
      if (t < 1.2) {
        // Walk in from the front to the middle of the pipe.
        const k = t / 1.2; x = 0; z = (f.z - sp.z) * (1 - k); yaw = Math.PI;
      } else if (t > SKATE_TIME - 1.2) {
        const k = (t - (SKATE_TIME - 1.2)) / 1.2; x = 0; z = (f.z - sp.z) * k; yaw = 0;
      } else {
        // Swing back and forth, higher each time; near the top: air with a half turn.
        const u = t - 1.2, T = 2.6, ph = (u / T) * Math.PI * 2;
        const grow = Math.min(1, u / (T * 1.5)), calm = Math.min(1, (SKATE_TIME - 1.2 - t) / 1.5);
        const amp = (2.5 + (top * 0.97 - 2.5) * grow) * calm;
        const sn = Math.sin(ph);
        x = amp * sn;
        const vx = Math.cos(ph);
        air = grow * calm > 0.8 ? Math.max(0, (Math.abs(sn) - 0.94) / 0.06) : 0;
        y = pipeY(x) + air * 1.3;
        yaw = vx >= 0 ? Math.PI / 2 : -Math.PI / 2;
        if (air > 0) yaw += Math.sign(sn) * air * Math.PI * 0.5; // the half turn in the air
        tilt = -pipeSlope(x) * (1 - air) * 0.85; // stand on the ramp, upright in the air
      }
      this.seat.position.set(sp.x + x, this.y0 + y, sp.z + z);
      this.seat.rotation.set(0, 0, 0);
      this.seat.rotateZ(tilt);
      this.seat.rotateY(yaw);
      this.board.rotation.y = 0;
      // A burst of stars each time you take off.
      const inAir = air > 0.2;
      if (inAir && !this.airWas) {
        let k = 0;
        for (const s of this.starData) {
          if (s.t > 0 || k >= 10) continue;
          k++;
          s.x = this.seat.position.x; s.y = this.seat.position.y + 1.2; s.z = this.seat.position.z;
          s.vx = (Math.random() - 0.5) * 3; s.vy = 1.5 + Math.random() * 2; s.vz = (Math.random() - 0.5) * 3; s.t = 1;
        }
      }
      this.airWas = inAir;
    }
    const p = this.stars.geometry.getAttribute('position') as THREE.BufferAttribute;
    this.starData.forEach((s, i) => {
      if (s.t > 0) { s.t -= dt; s.vy -= 4 * dt; s.x += s.vx * dt; s.y += s.vy * dt; s.z += s.vz * dt; if (s.t <= 0) s.y = -100; }
      p.setXYZ(i, s.x, s.y, s.z);
    });
    p.needsUpdate = true;
  }

  dispose() {
    this.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh || (o as THREE.Points).isPoints) { m.geometry.dispose(); (m.material as THREE.Material).dispose(); }
    });
    this.group.removeFromParent();
  }
}
