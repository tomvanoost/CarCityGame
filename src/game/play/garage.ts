import * as THREE from 'three';
import type { Collider, CityLayout } from '../city/layout';
import { getVehicle } from '../vehicles/catalog';
import { loadVehicle } from '../vehicles/factory';
import type { BuiltCar } from '../vehicles/carBuilder';
import { groundHeight, type CollisionWorld } from './collision';

export interface GarageSpot { x: number; z: number; rot: number }

/**
 * Your other cars, parked in the front yard next to your house (nose to the street).
 * Walk up to one to take it; the car you drove goes into its place.
 * Parked cars use the light traffic models, so the home area stays fast.
 */
export class Garage {
  readonly group = new THREE.Group();
  readonly spots: GarageSpot[] = [];
  private cars: { id: string; built: BuiltCar; spot: GarageSpot }[] = [];
  private version = 0;

  constructor(layout: CityLayout, world: CollisionWorld) {
    const h = layout.pois.home;
    // "Out" = from the house to the street; "along" = along the street.
    const ox = Math.sign(Math.round(h.door.x - h.x)), oz = Math.sign(Math.round(h.door.z - h.z));
    const ax = oz, az = -ox;
    const front = Math.hypot(h.door.x - h.x, h.door.z - h.z) - 1.5; // house center to its front wall
    const depth = front + 2.4; // car center: 2.4 m in front of the house wall
    const rot = Math.atan2(ox, oz); // facing the street
    for (const side of [8.4, 11.4, 14.4, -5.6, -8.6]) {
      const x = h.x + ox * depth + ax * side, z = h.z + oz * depth + az * side;
      // Skip spots that would touch a house, tree or bush.
      const clear = [-1, 0, 1].every((k) => [-1, 1].every((j) => !world.pointBlocked(x + ax * 1.15 * j + ox * 2.3 * k, z + az * 1.15 * j + oz * 2.3 * k)))
        && layout.nature.every((p) => Math.hypot(p.x - x, p.z - z) > 2.8);
      if (clear) this.spots.push({ x, z, rot });
      if (this.spots.length === 4) break;
    }
  }

  /**
   * Shows the owned cars except the one you drive. Cars that were already parked keep their
   * spot; `taken` is the spot where your car stands right now (it stays free for it).
   */
  async refresh(owned: string[], selected: string, colors: Record<string, string>, taken?: GarageSpot) {
    const v = ++this.version;
    const before = new Map(this.cars.map((c) => [c.id, c.spot]));
    const free = this.spots.filter((s) => s !== taken && ![...before.entries()].some(([id, sp]) => sp === s && id !== selected && owned.includes(id)));
    const plan: { id: string; spot: GarageSpot }[] = [];
    for (const id of owned.filter((x) => x !== selected).reverse()) { // newest cars first
      const keep = before.get(id);
      const spot = keep && keep !== taken ? keep : free.shift();
      if (spot) plan.push({ id, spot });
    }
    const built = await Promise.all(plan.map(({ id }) => loadVehicle(getVehicle(id), colors[id], { lod: true }).catch(() => null)));
    if (v !== this.version) { built.forEach((b) => b?.dispose()); return; } // a newer refresh won
    this.clear();
    plan.forEach(({ id, spot }, i) => {
      const b = built[i];
      if (!b) return;
      b.root.position.set(spot.x, groundHeight(spot.x, spot.z), spot.z);
      b.root.rotation.y = spot.rot;
      b.root.traverse((o) => { o.castShadow = true; });
      this.group.add(b.root);
      this.cars.push({ id, built: b, spot });
    });
  }

  /** Boxes the player and the car can't go through. */
  colliders(): Collider[] {
    return this.cars.map(({ spot }) => {
      const along = Math.abs(Math.sin(spot.rot)) > 0.5; // car length along X?
      const hx = along ? 2.3 : 1.05, hz = along ? 1.05 : 2.3;
      return { x0: spot.x - hx, z0: spot.z - hz, x1: spot.x + hx, z1: spot.z + hz };
    });
  }

  /** The parked car right next to you (walking), if any. */
  near(x: number, z: number): { id: string; spot: GarageSpot } | null {
    let best: { id: string; spot: GarageSpot } | null = null, bd = 3.4;
    for (const c of this.cars) {
      const d = Math.hypot(c.spot.x - x, c.spot.z - z);
      if (d < bd) { bd = d; best = { id: c.id, spot: c.spot }; }
    }
    return best;
  }

  private clear() {
    for (const c of this.cars) c.built.dispose();
    this.cars = [];
  }

  dispose() {
    this.version++;
    this.clear();
    this.group.removeFromParent();
  }
}
