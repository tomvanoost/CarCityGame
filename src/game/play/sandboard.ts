import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { BIG_DUNE } from '../city/outskirts';
import { groundHeight } from './collision';

/** Renting a sandboard for one run (rope tow up + slide down). */
export const SANDBOARD_PRICE = 10;

const D = BIG_DUNE;
/** The rental stand at the foot of the dune (north side), and the spot in front of its counter. */
export const SANDBOARD_STAND = { x: D.x - 9, z: D.z - D.r - 6 };
export const SANDBOARD_FRONT = { x: SANDBOARD_STAND.x, z: SANDBOARD_STAND.z - 2.6 };
/** Rope tow: from the foot of the dune up to just below the top (east of the slide). */
const TOW = { x: D.x + 7, z0: D.z - D.r + 2, z1: D.z - 6 };
/** The slide: from the top straight down the north face, out onto the flat sand. */
const SLIDE = { x: D.x, z0: D.z - 2, z1: D.z - D.r - 14 };
/** Where you step off after the slide (and the top you came from, to face away from it). */
export const SANDBOARD_END = { x: SLIDE.x, z: SLIDE.z1 };
export const SANDBOARD_TOP = { x: SLIDE.x, z: SLIDE.z0 };

const TO_TOW = 2, TOW_TIME = 14, TO_TOP = 2.5, SLIDE_TIME = 7;
export const SANDBOARD_TIME = TO_TOW + TOW_TIME + TO_TOP + SLIDE_TIME;

function paint(g: THREE.BufferGeometry, color: string) {
  const geo = g.index ? g.toNonIndexed() : g;
  const c = new THREE.Color(color), n = geo.getAttribute('position').count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) a.set([c.r, c.g, c.b], i * 3);
  geo.setAttribute('color', new THREE.BufferAttribute(a, 3));
  geo.deleteAttribute('uv');
  return geo;
}
const box = (w: number, h: number, d: number, x: number, y: number, z: number, color: string) => paint(new THREE.BoxGeometry(w, h, d).translate(x, y, z), color);
const ease = (t: number) => t * t * (3 - 2 * t);

/** A sandboard: a rounded board with two foot straps (lies along Z, top at y = 0.06). */
function boardGeometry(color: string) {
  return mergeGeometries([
    paint(new THREE.CylinderGeometry(0.16, 0.16, 0.05, 12).scale(1, 1, 1).translate(0, 0.025, 0.55), color),
    paint(new THREE.CylinderGeometry(0.16, 0.16, 0.05, 12).translate(0, 0.025, -0.55), color),
    box(0.32, 0.05, 1.1, 0, 0.025, 0, color),
    box(0.34, 0.04, 0.08, 0, 0.07, 0.25, '#1c1d20'),
    box(0.34, 0.04, 0.08, 0, 0.07, -0.25, '#1c1d20'),
  ])!;
}

/**
 * The sandboard hill on the big dune: a rental stand, a rope tow with T-bars up the slope, and
 * a ride (`board()`): pulled up by the tow, then sliding down the dune with sand spraying behind you.
 */
export class Sandboard {
  readonly group = new THREE.Group();
  /** Where your feet go while riding (the avatar stands on it). */
  readonly seat = new THREE.Object3D();
  private board: THREE.Mesh;
  private myBar: THREE.Mesh;
  private bars: THREE.InstancedMesh;
  private spray: THREE.Points;
  private sprayData: { x: number; y: number; z: number; vx: number; vy: number; vz: number; t: number }[] = [];
  private ride: { t: number } | null = null;
  private time = 0;
  private m = new THREE.Matrix4();

  constructor() {
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75 });
    // Rental stand: a wooden hut with a striped roof and boards leaning against it.
    const s = SANDBOARD_STAND, sy = groundHeight(s.x, s.z);
    const parts: THREE.BufferGeometry[] = [
      box(3, 2.2, 2, 0, 1.1, 0, '#c58b4f'),
      box(3.2, 0.12, 0.6, 0, 1.1, -1.15, '#f2e3c4'), // counter (faces -z, towards the road)
      box(2.4, 0.9, 0.05, 0, 1.7, -1.02, '#3a2c22'),
    ];
    for (let i = 0; i < 8; i++) parts.push(paint(new THREE.BoxGeometry(0.42, 0.08, 2.6).rotateX(-0.15).translate(-1.47 + i * 0.42, 2.45, -0.15), i % 2 ? '#ffffff' : '#ff8a2b'));
    ['#1f8fe0', '#e5484d', '#16b862', '#ffd400'].forEach((c, i) => {
      parts.push(boardGeometry(c).rotateX(-1.3).translate(1.75, 0.65, -0.6 + i * 0.4));
    });
    // A sign on a post: a little dune with a board on it.
    parts.push(box(0.08, 2.4, 0.08, -2.1, 1.2, -1.1, '#8a5a35'), box(1.1, 0.7, 0.05, -2.1, 2.5, -1.1, '#fff3c4'));
    parts.push(paint(new THREE.SphereGeometry(0.35, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2).scale(1.2, 0.6, 0.2).translate(-2.1, 2.3, -1.16), '#e7c27d'));
    const stand = new THREE.Mesh(mergeGeometries(parts)!, mat);
    stand.position.set(s.x, sy, s.z);
    stand.castShadow = true;

    // Rope tow: a pole at the bottom and the top, a rope between them.
    const bottom = new THREE.Vector3(TOW.x, groundHeight(TOW.x, TOW.z0) + 2.6, TOW.z0 - 1.5);
    const top = new THREE.Vector3(TOW.x, groundHeight(TOW.x, TOW.z1) + 2.6, TOW.z1 + 1.5);
    const towParts: THREE.BufferGeometry[] = [];
    for (const p of [bottom, top]) {
      towParts.push(box(0.2, 2.8, 0.2, p.x + 0.6, p.y - 1.3, p.z, '#e5484d'), box(1.4, 0.15, 0.15, p.x, p.y, p.z, '#e5484d'));
      towParts.push(paint(new THREE.CylinderGeometry(0.28, 0.28, 0.18, 14).rotateZ(Math.PI / 2).translate(p.x, p.y - 0.15, p.z), '#5a5f66'));
    }
    const len = bottom.distanceTo(top);
    towParts.push(paint(new THREE.CylinderGeometry(0.025, 0.025, len, 5).rotateX(Math.PI / 2).lookAt(new THREE.Vector3(0, top.y - bottom.y, top.z - bottom.z))
      .translate((bottom.x + top.x) / 2, (bottom.y + top.y) / 2 - 0.25, (bottom.z + top.z) / 2), '#3a3d42'));
    const tow = new THREE.Mesh(mergeGeometries(towParts)!, mat);
    tow.castShadow = true;
    // T-bars hanging from the rope (they move up the rope).
    const bar = mergeGeometries([box(0.03, 1.2, 0.03, 0, -0.6, 0, '#3a3d42'), box(0.7, 0.07, 0.07, 0, -1.2, 0, '#ffd400')])!;
    this.bars = new THREE.InstancedMesh(bar, mat, 8);
    this.bars.frustumCulled = false;
    this.towLine = { bottom, top };

    // The T-bar you hold on the way up: from the rope down to just behind your back.
    this.myBar = new THREE.Mesh(mergeGeometries([box(0.03, 1.45, 0.03, 0, 1.62, -0.28, '#3a3d42'), box(0.7, 0.07, 0.07, 0, 0.9, -0.28, '#ffd400')])!, mat);
    this.myBar.visible = false;
    this.seat.add(this.myBar);
    this.board = new THREE.Mesh(boardGeometry('#1f8fe0'), mat);
    this.board.castShadow = true;
    this.board.visible = false;
    this.seat.add(this.board);

    // Sand spray behind the board while sliding.
    const n = 60, pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) this.sprayData.push({ x: 0, y: -100, z: 0, vx: 0, vy: 0, vz: 0, t: 0 });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.spray = new THREE.Points(geo, new THREE.PointsMaterial({ color: '#e2bf7e', size: 0.22, transparent: true, opacity: 0.85, depthWrite: false }));
    this.spray.frustumCulled = false;

    this.group.add(stand, tow, this.bars, this.spray, this.seat);
    this.update(0);
  }

  private towLine: { bottom: THREE.Vector3; top: THREE.Vector3 };

  /** Get on: returns the spot your feet stand on and how long the ride lasts. */
  start(): { seat: THREE.Object3D; duration: number } {
    this.ride = { t: 0 };
    this.board.visible = true;
    return { seat: this.seat, duration: SANDBOARD_TIME };
  }

  leave() { this.ride = null; this.board.visible = false; this.myBar.visible = false; }

  /** Which part of the ride we're in, for the animation ('walk' = being pulled / walking, 'slide'). */
  get phase(): 'walk' | 'slide' | null {
    if (!this.ride) return null;
    return this.ride.t < TO_TOW + TOW_TIME + TO_TOP ? 'walk' : 'slide';
  }

  update(dt: number) {
    this.time += dt;
    // T-bars run up the rope all the time.
    const { bottom, top } = this.towLine, L = bottom.distanceTo(top);
    for (let i = 0; i < 8; i++) {
      const k = ((this.time * (L / TOW_TIME)) / L + i / 8) % 1;
      this.m.makeTranslation(bottom.x + (top.x - bottom.x) * k, bottom.y + (top.y - bottom.y) * k - 0.25, bottom.z + (top.z - bottom.z) * k);
      this.bars.setMatrixAt(i, this.m);
    }
    this.bars.instanceMatrix.needsUpdate = true;

    let sliding = false;
    if (this.ride) {
      const r = this.ride;
      r.t = Math.min(SANDBOARD_TIME, r.t + dt);
      const t = r.t;
      let x: number, z: number, yaw: number;
      const s = SANDBOARD_FRONT;
      if (t < TO_TOW) {
        const k = ease(t / TO_TOW);
        x = s.x + (TOW.x - s.x) * k; z = s.z + (TOW.z0 - s.z) * k; yaw = Math.atan2(TOW.x - s.x, TOW.z0 - s.z);
      } else if (t < TO_TOW + TOW_TIME) {
        const k = (t - TO_TOW) / TOW_TIME;
        x = TOW.x; z = TOW.z0 + (TOW.z1 - TOW.z0) * k; yaw = 0; // up the slope (+z)
      } else if (t < TO_TOW + TOW_TIME + TO_TOP) {
        const k = ease((t - TO_TOW - TOW_TIME) / TO_TOP);
        x = TOW.x + (SLIDE.x - TOW.x) * k; z = TOW.z1 + (SLIDE.z0 - TOW.z1) * k; yaw = Math.PI * k; // turn around at the top
      } else {
        // Slide: speeds up down the slope, slows down on the flat sand at the end.
        const k = (t - TO_TOW - TOW_TIME - TO_TOP) / SLIDE_TIME;
        const e = k < 0.75 ? 0.75 * (k / 0.75) ** 1.6 : 0.75 + 0.25 * (1 - (1 - (k - 0.75) / 0.25) ** 2);
        x = SLIDE.x + Math.sin(k * Math.PI * 3) * 3 * (1 - k); // gentle swoops
        z = SLIDE.z0 + (SLIDE.z1 - SLIDE.z0) * e;
        yaw = Math.PI + Math.cos(k * Math.PI * 3) * 0.35 * (1 - k);
        sliding = k < 0.97;
      }
      const y = groundHeight(x, z);
      this.seat.position.set(x, y + (this.phase === 'slide' ? 0.06 : 0), z);
      this.seat.rotation.set(0, yaw, 0);
      // Lean with the slope while sliding (board flat on the sand).
      if (this.phase === 'slide') {
        const ahead = groundHeight(x, z - 1), slope = Math.atan2(y - ahead, 1);
        this.seat.rotation.set(-slope, yaw, 0, 'YXZ');
      }
      this.board.visible = this.phase === 'slide';
      this.myBar.visible = t >= TO_TOW && t < TO_TOW + TOW_TIME;
      this.board.rotation.y = 0.5; // a little sideways, like a snowboarder
    }
    // Spray: new grains from the back of the board while sliding; they fly up and fall back.
    const p = this.spray.geometry.getAttribute('position') as THREE.BufferAttribute;
    this.sprayData.forEach((g, i) => {
      if (g.t <= 0 && sliding && Math.random() < dt * 30) {
        const yaw = this.seat.rotation.y, back = { x: -Math.sin(yaw), z: -Math.cos(yaw) };
        g.x = this.seat.position.x + back.x * 0.6; g.y = this.seat.position.y + 0.1; g.z = this.seat.position.z + back.z * 0.6;
        g.vx = back.x * 2 + (Math.random() - 0.5) * 2.5; g.vy = 1.5 + Math.random() * 2; g.vz = back.z * 2 + (Math.random() - 0.5) * 2.5;
        g.t = 0.8;
      }
      if (g.t > 0) {
        g.t -= dt; g.vy -= 9 * dt;
        g.x += g.vx * dt; g.y += g.vy * dt; g.z += g.vz * dt;
        if (g.t <= 0) g.y = -100;
      }
      p.setXYZ(i, g.x, g.y, g.z);
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
