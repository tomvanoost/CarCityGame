import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { FLOAT_STAND, inLake } from '../city/outskirts';
import { groundHeight } from './collision';

export const KITE_PRICE = 15;
/** Where you buy the kite: the east side of the beach stand (the float is sold at its front). */
export const KITE_FRONT = { x: FLOAT_STAND.x + 3.4, z: FLOAT_STAND.z };
/** Seconds the kite must stay up (high enough) in one go for the sticker. */
export const KITE_STICKER_TIME = 60;
/** Flying high enough to count as "up". */
const UP_HEIGHT = 5;

/** On the beach: the sand and grass strip around the lake (not in the water). */
export const onBeach = (x: number, z: number) => inLake(x, z, 30) && !inLake(x, z, 0);

function paint(g: THREE.BufferGeometry, color: string) {
  const geo = g.index ? g.toNonIndexed() : g;
  const c = new THREE.Color(color), n = geo.getAttribute('position').count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) a.set([c.r, c.g, c.b], i * 3);
  geo.setAttribute('color', new THREE.BufferAttribute(a, 3));
  geo.deleteAttribute('uv');
  return geo;
}

/** A diamond kite (in the XY plane, facing +Z) in four colored panels, with a tail of little bows. */
function kiteGeometry() {
  const tri = (a: number[], b: number[], c: number[], color: string) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([...a, ...b, ...c], 3));
    g.computeVertexNormals();
    return paint(g, color);
  };
  const T = [0, 0.75, 0], B = [0, -1.05, 0], L = [-0.6, 0.15, 0], R = [0.6, 0.15, 0], C = [0, 0.15, 0.02];
  const parts = [
    tri(T, L, C, '#e5484d'), tri(T, C, R, '#ffd400'), tri(L, B, C, '#1f8fe0'), tri(C, B, R, '#16b862'),
    paint(new THREE.BoxGeometry(0.03, 1.8, 0.03).translate(0, -0.15, 0.03), '#6b4428'),
    paint(new THREE.BoxGeometry(1.2, 0.03, 0.03).translate(0, 0.15, 0.03), '#6b4428'),
  ];
  for (let i = 0; i < 4; i++) parts.push(paint(new THREE.BoxGeometry(0.22, 0.1, 0.02).rotateZ(i % 2 ? 0.5 : -0.5).translate(0, -1.3 - i * 0.32, 0), i % 2 ? '#ff8a2b' : '#8e5bd9'));
  return mergeGeometries(parts)!;
}

/**
 * Your kite: when you have one and walk on the beach it flies on a string, downwind (over the land,
 * the wind comes from the lake). Walking keeps it up, running makes it climb; standing still lets it sink.
 * Also a kite on show at the beach stand.
 */
export class Kite {
  readonly group = new THREE.Group();
  private kite: THREE.Mesh;
  private line: THREE.Line;
  private height = 0;
  private time = 0;
  /** Seconds it has been up in one go. */
  upTime = 0;

  constructor() {
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, side: THREE.DoubleSide });
    const geo = kiteGeometry();
    this.kite = new THREE.Mesh(geo, mat);
    this.kite.visible = false;
    this.kite.scale.setScalar(1.8); // big enough to see well up high
    this.line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), new THREE.LineBasicMaterial({ color: '#f4f4f4' }));
    this.line.frustumCulled = false;
    this.line.visible = false;
    // A kite leaning against the beach stand (for sale).
    const show = new THREE.Mesh(geo, mat);
    show.position.set(FLOAT_STAND.x + 1.75, groundHeight(FLOAT_STAND.x, FLOAT_STAND.z) + 1.1, FLOAT_STAND.z + 0.2);
    show.rotation.set(-0.25, Math.PI / 2, 0);
    show.scale.setScalar(0.8);
    this.group.add(this.kite, this.line, show);
  }

  /**
   * Every frame. flying = you have a kite and walk on the beach; hand = where you hold the string;
   * speed = how fast you go (m/s). Returns true once it has been up long enough for the sticker.
   */
  update(dt: number, flying: boolean, hand: THREE.Vector3, speed: number): boolean {
    this.time += dt;
    if (!flying) {
      this.height = 0; this.upTime = 0;
      this.kite.visible = this.line.visible = false;
      return false;
    }
    // Climb towards the height your speed gives (standing still: it sinks slowly to the ground).
    const target = speed < 0.3 ? 1.5 : 5 + Math.min(1, speed / 6.5) * 13;
    this.height += (target - this.height) * Math.min(1, dt * (target > this.height ? 0.6 : 0.25));
    this.upTime = this.height > UP_HEIGHT ? this.upTime + dt : 0;
    const h = Math.max(1.5, this.height), away = 4 + h * 0.8;
    const sway = Math.sin(this.time * 0.9) * 2.5 + Math.sin(this.time * 2.3) * 0.6;
    // The wind blows from the lake (south) to the land (north): the kite flies north of you.
    const kx = hand.x + sway, kz = hand.z - away, ky = hand.y + h;
    this.kite.position.set(kx, ky, kz);
    this.kite.rotation.set(-0.35 + Math.sin(this.time * 1.7) * 0.08, 0, Math.sin(this.time * 1.3) * 0.25);
    const pos = this.line.geometry.getAttribute('position') as THREE.BufferAttribute;
    pos.setXYZ(0, hand.x, hand.y, hand.z);
    pos.setXYZ(1, kx, ky - 0.15, kz + 0.02);
    pos.needsUpdate = true;
    this.kite.visible = this.line.visible = true;
    return this.upTime >= KITE_STICKER_TIME;
  }

  dispose() {
    this.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh || (o as THREE.Line).isLine) { m.geometry.dispose(); (m.material as THREE.Material).dispose(); }
    });
    this.group.removeFromParent();
  }
}
