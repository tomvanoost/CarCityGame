import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { loadClips, loadGltf } from '../../engine/assets';
import { animsUrl, outfitUrl } from '../avatar/clothes';
import type { Block, CityLayout, District } from '../city/layout';
import { Rng } from '../city/rng';
import { groundHeight } from './collision';
import { createBeacon, createIcon, disposeMarker, tickBeacon } from './markers';

export type JobKind = 'delivery' | 'taxi' | 'pizza';

/** Where a job goes, with a kid-friendly name (i18n key). */
export type PlaceKey = 'placeHouse' | 'placeApartment' | 'placePark' | 'placeCenter' | 'placeShops' | 'placeGas';

interface Offer {
  kind: JobKind;
  x: number;
  z: number;
  group: THREE.Group;
  beacon: THREE.Mesh;
  mixer?: THREE.AnimationMixer;
}

export interface ActiveJob {
  kind: JobKind;
  x: number;
  z: number;
  place: PlaceKey;
  reward: number;
  /** Pizza: seconds the pizzas stay warm (0 = cooled down, still paid normally). */
  timeLeft?: number;
  /** Pizza: delivered while still warm (gets the bonus). */
  hot?: boolean;
}

/** Pizza delivered warm: this much extra. */
export const PIZZA_BONUS = 0.5;

export interface JobEvents {
  onStart(job: ActiveJob): void;
  onDone(job: ActiveJob): void;
}

const RING = 2.6;
const DISTRICT_PLACE: Record<District, PlaceKey> = {
  residential: 'placeHouse', apartments: 'placeApartment', park: 'placePark', downtown: 'placeCenter',
  midrise: 'placeCenter', shops: 'placeShops', townhouses: 'placeShops', gas: 'placeGas',
};

/**
 * Delivery and taxi jobs. Offers float around the player; drive (or walk, for
 * packages) into one to start. Then follow the arrow to the green beacon.
 */
export class Jobs {
  readonly group = new THREE.Group();
  private offers: Offer[] = [];
  active: ActiveJob | null = null;
  private target?: THREE.Group;
  private rng = new Rng(Date.now() & 0xffff);
  private time = 0;
  private passenger?: { scene: THREE.Object3D; clip: THREE.AnimationClip };
  private refill = 0;

  constructor(private layout: CityLayout, private events: JobEvents) {
    // A waving passenger model for taxi offers (loaded in the background).
    Promise.all([loadGltf(outfitUrl('Casual2', 'girl')), loadClips(animsUrl('girl'))]).then(([g, clips]) => {
      const box = new THREE.Box3().setFromObject(g.scene);
      const s = 1.7 / (box.max.y - box.min.y);
      const holder = new THREE.Group();
      const scene = cloneSkinned(g.scene);
      scene.scale.setScalar(s);
      scene.position.y = -box.min.y * s;
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        m.frustumCulled = false;
        const mat = (m.material as THREE.MeshStandardMaterial).clone();
        if (mat.name === 'Skin') mat.color.set('#e0ac7e');
        if (mat.name === 'Face') mat.color.set('#2b1d16');
        if (mat.name === 'Shirt') mat.color.set('#ffcc00');
        m.material = mat;
      });
      holder.add(scene);
      this.passenger = { scene: holder, clip: clips.find((c) => c.name === 'Victory')! };
    });
  }

  /** A random sidewalk spot on a block (optionally of certain districts). */
  private spotOn(blocks: Block[]) {
    const b = this.rng.pick(blocks);
    const s = b.slab;
    const side = this.rng.int(0, 3), t = this.rng.range(0.2, 0.8);
    const x0 = s.x0 + RING, x1 = s.x1 - RING, z0 = s.z0 + RING, z1 = s.z1 - RING;
    const p = [
      { x: x0 + (x1 - x0) * t, z: z0 }, { x: x1, z: z0 + (z1 - z0) * t },
      { x: x0 + (x1 - x0) * t, z: z1 }, { x: x0, z: z0 + (z1 - z0) * t },
    ][side];
    return { ...p, district: b.district };
  }

  private blocksNear(x: number, z: number, min: number, max: number, districts?: District[]) {
    return this.layout.blocks.filter((b) => {
      if (districts && !districts.includes(b.district)) return false;
      const cx = (b.slab.x0 + b.slab.x1) / 2, cz = (b.slab.z0 + b.slab.z1) / 2;
      const d = Math.hypot(cx - x, cz - z);
      return d >= min && d <= max;
    });
  }

  private makeOffer(kind: JobKind, px: number, pz: number) {
    const blocks = this.blocksNear(px, pz, 40, 320, kind === 'delivery' ? ['shops', 'townhouses', 'downtown', 'midrise'] : undefined);
    if (!blocks.length && kind !== 'pizza') return;
    // Pizza jobs always start at the pizzeria.
    const spot = kind === 'pizza' ? { ...this.layout.pois.pizzeria.front, district: 'shops' as District } : this.spotOn(blocks);
    const group = new THREE.Group();
    group.position.set(spot.x, groundHeight(spot.x, spot.z), spot.z);
    const beacon = createBeacon(kind === 'delivery' ? '#3d9bff' : kind === 'pizza' ? '#ff5a3c' : '#ffc400', 1.8, 10);
    const icon = createIcon(kind === 'delivery' ? '📦' : kind === 'pizza' ? '🍕' : '🚕', kind === 'delivery' ? '#2f8bff' : kind === 'pizza' ? '#e5484d' : '#ffb300', 0.05);
    icon.position.y = 6;
    group.add(beacon, icon);
    let mixer: THREE.AnimationMixer | undefined;
    if (kind === 'taxi' && this.passenger) {
      const person = cloneSkinned(this.passenger.scene);
      mixer = new THREE.AnimationMixer(person);
      mixer.clipAction(this.passenger.clip).play();
      person.rotation.y = this.rng.range(0, Math.PI * 2);
      group.add(person);
    }
    this.group.add(group);
    this.offers.push({ kind, x: spot.x, z: spot.z, group, beacon, mixer });
  }

  private startJob(o: Offer) {
    const from = { x: o.x, z: o.z };
    const blocks = o.kind === 'delivery' || o.kind === 'pizza'
      ? this.blocksNear(from.x, from.z, 200, 650, ['residential', 'apartments'])
      : this.blocksNear(from.x, from.z, 220, 700);
    const dest = this.spotOn(blocks.length ? blocks : this.layout.blocks);
    const dist = Math.hypot(dest.x - from.x, dest.z - from.z);
    const reward = Math.round((o.kind === 'taxi' ? 120 : o.kind === 'pizza' ? 90 : 80) + dist * (o.kind === 'taxi' ? 0.55 : o.kind === 'pizza' ? 0.5 : 0.45)) * 1;
    this.active = { kind: o.kind, x: dest.x, z: dest.z, place: DISTRICT_PLACE[dest.district], reward: Math.round(reward / 10) * 10 };
    // Pizzas stay warm long enough for a calm drive (roads are longer than the straight line).
    if (o.kind === 'pizza') this.active.timeLeft = Math.round(dist * 1.4 / 9 + 25);
    // Clear all offers: focus on this job.
    for (const off of this.offers) disposeMarker(off.group);
    this.offers = [];
    this.target = new THREE.Group();
    this.target.position.set(dest.x, groundHeight(dest.x, dest.z), dest.z);
    this.target.add(createBeacon('#21d07a', 2.6, 18));
    const icon = createIcon(o.kind === 'taxi' ? '📍' : '🏠', '#16b862', 0.06);
    icon.position.y = 8;
    this.target.add(icon);
    this.group.add(this.target);
    this.events.onStart(this.active);
  }

  /**
   * pos: player or car position. inCar: whether driving. kmh: car speed.
   */
  update(dt: number, pos: { x: number; z: number }, inCar: boolean, kmh: number) {
    this.time += dt;
    if (this.active) {
      this.target!.children.forEach((c) => { if ((c as THREE.Mesh).isMesh) tickBeacon(c as THREE.Mesh, this.time); });
      if (this.active.timeLeft !== undefined) this.active.timeLeft = Math.max(0, this.active.timeLeft - dt);
      const d = Math.hypot(pos.x - this.active.x, pos.z - this.active.z);
      const ok = this.active.kind === 'taxi' ? inCar && d < 7 && kmh < 18 : (inCar ? d < 7 && kmh < 25 : d < 3);
      if (ok) {
        const job = this.active;
        if (job.kind === 'pizza' && (job.timeLeft ?? 0) > 0) { job.hot = true; job.reward = Math.round(job.reward * (1 + PIZZA_BONUS) / 10) * 10; }
        this.active = null;
        disposeMarker(this.target!);
        this.target = undefined;
        this.refill = 1.5;
        this.events.onDone(job);
      }
      return;
    }
    // Keep 3 delivery + 2 taxi offers around the player, plus the pizzeria's offer when it is near.
    this.refill -= dt;
    for (const o of this.offers) {
      o.mixer?.update(dt);
      tickBeacon(o.beacon, this.time);
      o.group.visible = Math.hypot(o.x - pos.x, o.z - pos.z) < 420;
    }
    this.offers = this.offers.filter((o) => {
      if (Math.hypot(o.x - pos.x, o.z - pos.z) < 650) return true;
      disposeMarker(o.group);
      return false;
    });
    if (this.refill <= 0) {
      this.refill = 0.5;
      const n = (k: JobKind) => this.offers.filter((o) => o.kind === k).length;
      if (n('delivery') < 3) this.makeOffer('delivery', pos.x, pos.z);
      else if (n('taxi') < 2) this.makeOffer('taxi', pos.x, pos.z);
      if (n('pizza') < 1 && Math.hypot(this.layout.pois.pizzeria.x - pos.x, this.layout.pois.pizzeria.z - pos.z) < 600) this.makeOffer('pizza', pos.x, pos.z);
    }
    for (const o of this.offers) {
      const d = Math.hypot(pos.x - o.x, pos.z - o.z);
      const pick = o.kind === 'taxi' ? inCar && d < 6 && kmh < 15 : (inCar ? d < 6 && kmh < 20 : d < 2.2);
      if (pick) { this.startJob(o); break; }
    }
  }

  /** Cancel the current job (e.g. the player wants a different one). */
  cancel() {
    if (!this.active) return;
    this.active = null;
    if (this.target) disposeMarker(this.target);
    this.target = undefined;
  }

  dispose() {
    for (const o of this.offers) disposeMarker(o.group);
    if (this.target) disposeMarker(this.target);
    this.group.removeFromParent();
  }
}
