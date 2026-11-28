import * as THREE from 'three';
import type { CityLayout } from '../city/layout';
import { Rng } from '../city/rng';
import { groundHeight } from './collision';
import { coinGeometry } from './coins';

/** A team coin hunt every 10 minutes, open for 4 minutes (the same for everyone: worked out from the clock). */
const EVERY = 10 * 60 * 1000;
const OPEN = 4 * 60 * 1000;
export const HUNT_COINS = 12;
export const HUNT_COIN_REWARD = 10;
export const HUNT_BONUS = 50;

/** "huntId:mask" as shared in the player state: which coins this player picked up in that hunt. */
export function parseHunt(v: unknown): { id: number; mask: number } | null {
  if (typeof v !== 'string' || v.length > 24) return null;
  const [a, b] = v.split(':');
  const id = Number(a), mask = Number(b);
  if (!Number.isInteger(id) || !Number.isInteger(mask) || mask < 0 || mask >= 1 << HUNT_COINS) return null;
  return { id, mask };
}

const hashStr = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; };

/**
 * Treasure hunt with friends (multiplayer only): a trail of 12 golden coins around one city block appears
 * for a few minutes. Everyone in the server sees the same trail (from the clock and the server's id) and
 * the coins anyone picks up disappear for everyone: you collect them together, nobody races anybody.
 * Each coin you pick up gives €10; when the whole trail is found, everyone who helped gets a bonus.
 */
export class TeamHunt {
  readonly group = new THREE.Group();
  private mesh: THREE.InstancedMesh;
  private spots: { x: number; y: number; z: number }[] = [];
  /** The hunt shown now (its id), the coins I found and the coins found by anyone. */
  private id = -1;
  myMask = 0;
  private allMask = 0;
  private bonusGiven = -1;
  private t = 0;
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private p = new THREE.Vector3();
  private s = new THREE.Vector3();

  constructor(private layout: CityLayout, private roomId: string) {
    this.mesh = new THREE.InstancedMesh(coinGeometry(), new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.8, roughness: 0.25, emissive: '#7a5200', emissiveIntensity: 0.6 }), HUNT_COINS);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = true;
    this.mesh.visible = false;
    this.group.add(this.mesh);
  }

  /** The middle of the trail while a hunt is open (for the maps), else null. */
  get center() { return this.id >= 0 && this.spots.length ? { x: this.cx, z: this.cz } : null; }
  private cx = 0;
  private cz = 0;
  /** What to share with the others ('' when no hunt is open). */
  get share() { return this.id >= 0 ? `${this.id}:${this.myMask}` : ''; }
  get found() { let n = 0; for (let i = 0; i < HUNT_COINS; i++) if (this.allMask & (1 << i)) n++; return n; }
  get open() { return this.id >= 0; }

  /** The trail for hunt `id`: evenly around the sidewalk of one block (picked from the id + the server). */
  private build(id: number) {
    const rng = new Rng(hashStr(`${this.roomId}:${id}`));
    const blocks = this.layout.blocks.filter((b) => b.district !== 'park' && b.district !== 'gas');
    const b = rng.pick(blocks.length ? blocks : this.layout.blocks);
    const r = b.slab, i = 2.6;
    const pts = [[r.x0 + i, r.z0 + i], [r.x1 - i, r.z0 + i], [r.x1 - i, r.z1 - i], [r.x0 + i, r.z1 - i]];
    const len = (k: number) => Math.hypot(pts[(k + 1) % 4][0] - pts[k][0], pts[(k + 1) % 4][1] - pts[k][1]);
    const total = len(0) + len(1) + len(2) + len(3);
    this.spots = [];
    for (let c = 0; c < HUNT_COINS; c++) {
      let d = ((c + 0.5) / HUNT_COINS) * total, k = 0;
      while (d > len(k)) { d -= len(k); k++; }
      const a = pts[k], e = pts[(k + 1) % 4], f = d / len(k);
      const x = a[0] + (e[0] - a[0]) * f, z = a[1] + (e[1] - a[1]) * f;
      this.spots.push({ x, y: groundHeight(x, z) + 1.2, z });
    }
    this.cx = (r.x0 + r.x1) / 2; this.cz = (r.z0 + r.z1) / 2;
  }

  /**
   * now: the clock (ms); pos: you; others: the masks the other players share for this hunt.
   * Returns what happened this frame: a hunt started, coins I picked up, the trail was completed.
   */
  update(dt: number, now: number, pos: { x: number; z: number }, others: { id: number; mask: number }[]) {
    const ev = { started: false, picked: 0, completed: false };
    const id = Math.floor(now / EVERY), open = now - id * EVERY < OPEN;
    if (!open) {
      if (this.id >= 0) { this.id = -1; this.mesh.visible = false; }
      return ev;
    }
    if (id !== this.id) {
      this.id = id; this.myMask = 0; this.allMask = 0;
      this.build(id);
      this.mesh.visible = true;
      ev.started = true;
    }
    let all = this.myMask;
    for (const o of others) if (o.id === id) all |= o.mask;
    this.t += dt;
    this.spots.forEach((c, i) => {
      const bit = 1 << i;
      if (!(all & bit) && Math.abs(pos.x - c.x) < 2.4 && Math.abs(pos.z - c.z) < 2.4) {
        this.myMask |= bit; all |= bit; ev.picked++;
      }
      this.q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, this.t * 2.6 + i);
      this.p.set(c.x, c.y + Math.sin(this.t * 2 + i) * 0.18, c.z);
      this.s.setScalar(all & bit ? 0 : 1.25);
      this.mesh.setMatrixAt(i, this.m.compose(this.p, this.q, this.s));
    });
    this.mesh.instanceMatrix.needsUpdate = true;
    this.allMask = all;
    if (all === (1 << HUNT_COINS) - 1 && this.bonusGiven !== id && this.myMask) { this.bonusGiven = id; ev.completed = true; }
    return ev;
  }

  dispose() {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
    this.group.removeFromParent();
  }
}
