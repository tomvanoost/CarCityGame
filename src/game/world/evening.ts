import * as THREE from 'three';
import type { CityLayout } from '../city/layout';
import { groundHeight } from '../play/collision';

/**
 * Optional soft evening light (🌙 button in the game): a warm, low sun, a deep-blue sky with a
 * peach horizon, glowing street lamps with pools of light on the sidewalk, and headlights on
 * every car. Everything is fake light (glowing shapes and light textures, no real lamps), so
 * it costs almost nothing on tablets: 2 draw calls for all lamps, 1 per car for headlights.
 */

const EVENING_KEY = 'carcity.evening';
export function loadEvening(): boolean {
  try { return localStorage.getItem(EVENING_KEY) === '1'; } catch { return false; }
}
export function saveEvening(on: boolean) {
  try { localStorage.setItem(EVENING_KEY, on ? '1' : '0'); } catch { /* private mode: only this visit */ }
}

/** The look of each time of day. */
export const DAY = {
  zenith: '#4f9ee8', horizon: '#cfe6f7', sunDir: [0.45, 0.62, 0.35] as const,
  sun: '#fff1dd', sunI: 2.1, hemiSky: '#cfe6ff', hemiGround: '#6b8a55', hemiI: 0.75, env: 0.7,
};
export const EVENING = {
  zenith: '#2e3f7c', horizon: '#f2a57a', sunDir: [0.62, 0.2, 0.35] as const,
  sun: '#ffb27a', sunI: 1.5, hemiSky: '#9aa0e0', hemiGround: '#5e5a6c', hemiI: 0.85, env: 0.52,
};

/** Night: a deep blue sky, soft blue moonlight (still friendly, never pitch dark). */
export const NIGHT = {
  zenith: '#0f1a3d', horizon: '#2c3f70', sunDir: [-0.35, 0.55, 0.3] as const,
  sun: '#a9bcff', sunI: 0.55, hemiSky: '#5a6cb0', hemiGround: '#2c2c3e', hemiI: 0.7, env: 0.32,
};

type Look = Omit<typeof DAY, 'sunDir'> & { sunDir: readonly [number, number, number] };
/** Key moments of the day (hour → look); the light blends smoothly between them. */
const DAY_KEYS: [number, Look][] = [[0, NIGHT], [5, NIGHT], [6.2, EVENING], [7.5, DAY], [17, DAY], [18.6, EVENING], [20, NIGHT], [24, NIGHT]];

export interface LightNow {
  zenith: THREE.Color; horizon: THREE.Color; sunDir: THREE.Vector3; sun: THREE.Color; sunI: number;
  hemiSky: THREE.Color; hemiGround: THREE.Color; hemiI: number; env: number;
}

/** The light at a time of day (minutes after midnight), blended between the key moments. */
export function lightAt(minutes: number): LightNow {
  const h = ((minutes / 60) % 24 + 24) % 24;
  let i = 0;
  while (i < DAY_KEYS.length - 2 && h >= DAY_KEYS[i + 1][0]) i++;
  const [h0, a] = DAY_KEYS[i], [h1, b] = DAY_KEYS[i + 1];
  const t = h1 > h0 ? Math.min(1, Math.max(0, (h - h0) / (h1 - h0))) : 0;
  const c = (x: string, y: string) => new THREE.Color(x).lerp(new THREE.Color(y), t);
  const n = (x: number, y: number) => x + (y - x) * t;
  return {
    zenith: c(a.zenith, b.zenith), horizon: c(a.horizon, b.horizon),
    sunDir: new THREE.Vector3(n(a.sunDir[0], b.sunDir[0]), n(a.sunDir[1], b.sunDir[1]), n(a.sunDir[2], b.sunDir[2])).normalize(),
    sun: c(a.sun, b.sun), sunI: n(a.sunI, b.sunI), hemiSky: c(a.hemiSky, b.hemiSky), hemiGround: c(a.hemiGround, b.hemiGround),
    hemiI: n(a.hemiI, b.hemiI), env: n(a.env, b.env),
  };
}

/** Soft round light texture (white center fading out), shared by all glows. */
let glowTex: THREE.Texture | null = null;
function glowTexture() {
  if (glowTex) return glowTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.35, 'rgba(255,255,255,0.55)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  glowTex = new THREE.CanvasTexture(c);
  glowTex.colorSpace = THREE.SRGBColorSpace;
  return glowTex;
}
const additive = (color: string, opacity: number) => new THREE.MeshBasicMaterial({
  map: glowTexture(), color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, side: THREE.DoubleSide,
});

/** Shared headlight material: warm white, added on top of what is behind. */
let headMat: THREE.MeshBasicMaterial | null = null;

/**
 * Headlights for one car (car faces +Z, stands on y = 0): two glowing lamps at the front corners
 * and a soft beam of light on the road ahead, all in one mesh with one shared material.
 */
export function headlightRig(length: number, width: number): THREE.Mesh {
  headMat ??= additive('#ffe7b8', 0.85);
  const front = length / 2;
  const parts: THREE.BufferGeometry[] = [];
  for (const sx of [-1, 1]) {
    // Glowing lamp: a small camera-independent "puff" (a few crossed quads around the lamp).
    for (const ry of [0, Math.PI / 2]) {
      parts.push(new THREE.PlaneGeometry(0.55, 0.42).rotateY(ry).translate(sx * width * 0.33, 0.68, front + 0.05));
    }
  }
  // Beam: a long soft oval on the road in front of the car.
  parts.push(new THREE.PlaneGeometry(width * 1.5, 9).rotateX(-Math.PI / 2).translate(0, 0.04, front + 4.2));
  const geo = mergeGeos(parts);
  const mesh = new THREE.Mesh(geo, headMat);
  mesh.renderOrder = 2;
  mesh.frustumCulled = false;
  mesh.name = 'CCG_HEADLIGHTS';
  return mesh;
}

function mergeGeos(parts: THREE.BufferGeometry[]) {
  // Plane geometries all have position/normal/uv and an index: concatenate them.
  let vCount = 0, iCount = 0;
  for (const p of parts) { vCount += p.getAttribute('position').count; iCount += p.getIndex()!.count; }
  const pos = new Float32Array(vCount * 3), uv = new Float32Array(vCount * 2), idx = new Uint32Array(iCount);
  let vo = 0, io = 0;
  for (const p of parts) {
    pos.set(p.getAttribute('position').array as Float32Array, vo * 3);
    uv.set(p.getAttribute('uv').array as Float32Array, vo * 2);
    const ix = p.getIndex()!.array;
    for (let i = 0; i < ix.length; i++) idx[io + i] = ix[i] + vo;
    vo += p.getAttribute('position').count;
    io += ix.length;
    p.dispose();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  return g;
}

/** Glowing lanterns and light pools under every street lamp (hidden during the day). */
export class StreetLamps {
  readonly group = new THREE.Group();
  private meshes: THREE.InstancedMesh[] = [];
  private lamps: { x: number; z: number; glow: THREE.Matrix4; pool: THREE.Matrix4 }[] = [];

  constructor(layout: CityLayout) {
    const lamps = layout.props.filter((p) => p.model.startsWith('Streetlight'));
    const n = Math.max(1, lamps.length);
    // Lantern glow: a camera-facing-ish puff made of two crossed quads.
    const puff = mergeGeos([new THREE.PlaneGeometry(2.2, 2.2), new THREE.PlaneGeometry(2.2, 2.2).rotateY(Math.PI / 2)]);
    const glow = new THREE.InstancedMesh(puff, additive('#ffcf73', 0.95), n);
    const pool = new THREE.InstancedMesh(new THREE.PlaneGeometry(10, 10).rotateX(-Math.PI / 2), additive('#ffc46a', 0.5), n);
    lamps.forEach((p, i) => {
      const y = groundHeight(p.x, p.z);
      const g = new THREE.Matrix4().makeTranslation(p.x, y + 5.45 * p.scale, p.z), q = new THREE.Matrix4().makeTranslation(p.x, y + 0.03, p.z);
      glow.setMatrixAt(i, g);
      pool.setMatrixAt(i, q);
      this.lamps.push({ x: p.x, z: p.z, glow: g, pool: q });
    });
    glow.count = pool.count = lamps.length;
    for (const im of [glow, pool]) {
      im.frustumCulled = false;
      im.renderOrder = 2;
      this.group.add(im);
      this.meshes.push(im);
    }
    this.group.visible = false;
  }

  /** Turns the light of the lamp at (x, z) off while it lies knocked over, and on again. */
  setLit(x: number, z: number, lit: boolean) {
    const i = this.lamps.findIndex((l) => Math.abs(l.x - x) < 0.3 && Math.abs(l.z - z) < 0.3);
    if (i < 0) return;
    const off = new THREE.Matrix4().makeScale(0, 0, 0);
    this.meshes[0].setMatrixAt(i, lit ? this.lamps[i].glow : off);
    this.meshes[1].setMatrixAt(i, lit ? this.lamps[i].pool : off);
    for (const im of this.meshes) im.instanceMatrix.needsUpdate = true;
  }

  dispose() {
    for (const im of this.meshes) { im.geometry.dispose(); (im.material as THREE.Material).dispose(); }
    this.group.removeFromParent();
  }
}

/**
 * Flashing emergency lights for the light bar on the roof (car faces +Z, stands on y = 0): a red glow
 * on the left and a blue one on the right that flash in turn, and a soft colored glow on the road.
 * Fake light only (2 small meshes), hidden while the siren is off.
 */
export class SirenLights {
  readonly group = new THREE.Group();
  private red: THREE.Mesh;
  private blue: THREE.Mesh;
  private pool: THREE.Mesh;
  private t = 0;

  /** colors: [left, right] lamp colors (police red + blue, fire red, ambulance blue). */
  constructor(width: number, height: number, roofZ: number, private colors: [string, string] = ['#ff2a2a', '#2a6bff']) {
    const puff = () => mergeGeos([0, Math.PI / 2, Math.PI / 4, -Math.PI / 4].map((ry) => new THREE.PlaneGeometry(0.9, 0.7).rotateY(ry)));
    this.red = new THREE.Mesh(puff(), additive(colors[0], 0.95));
    this.blue = new THREE.Mesh(puff(), additive(colors[1], 0.95));
    this.red.position.set(width * 0.2, height + 0.02, roofZ);
    this.blue.position.set(-width * 0.2, height + 0.02, roofZ);
    this.pool = new THREE.Mesh(new THREE.PlaneGeometry(width * 3.2, width * 4).rotateX(-Math.PI / 2), additive('#ffffff', 0.35));
    this.pool.position.y = 0.05;
    for (const m of [this.red, this.blue, this.pool]) { m.renderOrder = 2; m.frustumCulled = false; this.group.add(m); }
    this.group.visible = false;
  }

  set on(v: boolean) { this.group.visible = v; }
  get on() { return this.group.visible; }

  /** Every frame: red and blue take turns (quick double flash, like real police lights). */
  update(dt: number) {
    if (!this.group.visible) return;
    this.t += dt;
    const phase = this.t % 0.8, left = phase < 0.4, k = phase % 0.4;
    const flash = k < 0.1 || (k > 0.17 && k < 0.27);
    this.red.visible = left && flash;
    this.blue.visible = !left && flash;
    (this.pool.material as THREE.MeshBasicMaterial).color.set(left ? this.colors[0] : this.colors[1]);
    (this.pool.material as THREE.MeshBasicMaterial).opacity = flash ? 0.35 : 0.12;
  }

  dispose() {
    for (const m of [this.red, this.blue, this.pool]) { m.geometry.dispose(); (m.material as THREE.Material).dispose(); }
    this.group.removeFromParent();
  }
}

/**
 * Turn signals: orange lamps at the front and rear corners (car faces +Z, the driver's left is +X)
 * that blink on the chosen side, or on both sides (hazard lights). Fake light: 1 small mesh per side, hidden when off.
 */
export class TurnSignals {
  readonly group = new THREE.Group();
  private sides: Record<'left' | 'right', THREE.Mesh>;
  private t = 0;
  side: 'left' | 'right' | 'both' | null = null;

  constructor(length: number, width: number) {
    const mat = additive('#ff8400', 1);
    const make = (sx: number) => {
      const parts: THREE.BufferGeometry[] = [];
      // On the body corners (the width counts the mirrors, so a bit inward), front and rear.
      for (const [z, y] of [[length / 2 - 0.12, 0.72], [-length / 2 + 0.1, 0.9]]) {
        for (const ry of [0, Math.PI / 2]) parts.push(new THREE.PlaneGeometry(0.36, 0.3).rotateY(ry).translate(sx * width * 0.37, y, z));
      }
      const m = new THREE.Mesh(mergeGeos(parts), mat);
      m.renderOrder = 2; m.frustumCulled = false; m.visible = false;
      this.group.add(m);
      return m;
    };
    this.sides = { left: make(1), right: make(-1) };
  }

  /** Every frame; returns true at the moment the lamp switches (for the tick sound). */
  update(dt: number): boolean {
    const was = this.sides.left.visible || this.sides.right.visible;
    this.t = this.side ? this.t + dt : 0;
    const on = !!this.side && this.t % 0.7 < 0.35;
    this.sides.left.visible = on && this.side !== 'right';
    this.sides.right.visible = on && this.side !== 'left';
    return !!this.side && on !== was;
  }

  dispose() {
    this.sides.left.geometry.dispose(); this.sides.right.geometry.dispose();
    (this.sides.left.material as THREE.Material).dispose();
    this.group.removeFromParent();
  }
}
