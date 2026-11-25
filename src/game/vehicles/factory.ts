import type * as THREE from 'three';
import { buildBike } from './bikeBuilder';
import { buildCar, type BuiltCar } from './carBuilder';
import { SKETCHFAB_VEHICLES } from './sketchfabManifest';
import { loadSketchfabVehicle } from './sketchfabVehicle';
import type { VehicleSpec } from './types';

/** Builds the 3D model of any vehicle (car or motorbike). */
export function buildVehicle(spec: VehicleSpec, color?: THREE.ColorRepresentation): BuiltCar {
  const c = color ?? spec.color;
  return spec.bike ? buildBike(spec.bike, c) : buildCar(spec.shape!, c);
}

/**
 * Loads the vehicle's 3D model: the Sketchfab model when there is one, otherwise (or if loading
 * fails) the built-in procedural model. `lod` = light version for traffic.
 */
export async function loadVehicle(spec: VehicleSpec, color?: THREE.ColorRepresentation, opts: { lod?: boolean } = {}): Promise<BuiltCar> {
  if (spec.id in SKETCHFAB_VEHICLES) {
    try {
      return await loadSketchfabVehicle(spec.id, color, opts.lod);
    } catch (e) {
      console.warn('Sketchfab model failed, using built-in model', spec.id, e);
    }
  }
  return buildVehicle(spec, color);
}

/** Size info for physics and cameras. */
export function vehicleDims(spec: VehicleSpec) {
  const sf = SKETCHFAB_VEHICLES[spec.id];
  if (sf) return { length: sf.length, width: sf.bike ? Math.min(sf.width, 0.9) : sf.width, wheelRadius: sf.bike ? 0.32 : 0.34, wheelbase: sf.length * (sf.bike ? 0.68 : 0.6), isBike: sf.bike };
  if (spec.bike) {
    const b = spec.bike;
    return { length: b.wheelbase + b.wheelRadius * 2 + 0.1, width: 0.8, wheelRadius: b.wheelRadius, wheelbase: b.wheelbase, isBike: true };
  }
  const s = spec.shape!;
  return { length: s.length, width: s.width, wheelRadius: s.wheelRadius, wheelbase: (s.rearAxle - s.frontAxle) * s.length, isBike: false };
}
