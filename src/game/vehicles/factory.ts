import type * as THREE from 'three';
import { buildBike } from './bikeBuilder';
import { buildCar, type BuiltCar } from './carBuilder';
import type { VehicleSpec } from './types';

/** Builds the 3D model of any vehicle (car or motorbike). */
export function buildVehicle(spec: VehicleSpec, color?: THREE.ColorRepresentation): BuiltCar {
  const c = color ?? spec.color;
  return spec.bike ? buildBike(spec.bike, c) : buildCar(spec.shape!, c);
}

/** Size info for physics and cameras. */
export function vehicleDims(spec: VehicleSpec) {
  if (spec.bike) {
    const b = spec.bike;
    return { length: b.wheelbase + b.wheelRadius * 2 + 0.1, width: 0.8, wheelRadius: b.wheelRadius, wheelbase: b.wheelbase, isBike: true };
  }
  const s = spec.shape!;
  return { length: s.length, width: s.width, wheelRadius: s.wheelRadius, wheelbase: (s.rearAxle - s.frontAxle) * s.length, isBike: false };
}
