import type { VehicleSpec } from './types';

/**
 * All vehicles. Shapes follow the real cars' proportions, with look-alike names.
 * Dimensions in meters; curves use t = 0 (front) .. 1 (rear).
 */
export const VEHICLES: VehicleSpec[] = [
  {
    id: 'golfo-2025',
    brand: 'Volkswerk',
    model: 'Golfo',
    year: 2025,
    price: 0,
    kind: 'car',
    color: '#d7dbe0',
    stats: { speed: 5, accel: 5, handling: 7 },
    shape: {
      length: 4.28, width: 1.79,
      frontAxle: 0.205, rearAxle: 0.82,
      wheelRadius: 0.32, wheelWidth: 0.22,
      top: [[0, 0.56], [0.03, 0.74], [0.09, 0.83], [0.3, 0.93], [0.36, 0.96], [0.8, 0.99], [0.93, 0.98], [0.975, 0.9], [1, 0.62]],
      bottom: [[0, 0.3], [0.05, 0.2], [0.95, 0.22], [1, 0.36]],
      roof: [[0.34, 0.95], [0.41, 1.22], [0.48, 1.4], [0.62, 1.45], [0.78, 1.43], [0.86, 1.37], [0.93, 1.16], [0.96, 0.99]],
      plan: [[0, 0.8], [0.06, 0.95], [0.2, 1], [0.82, 1], [0.95, 0.96], [1, 0.86]],
      tumblehome: 0.05, boxiness: 6, endRound: 0.24,
      headlights: 'bar', taillights: 'split', rims: 'spokes5', grille: 'wide',
      pillars: [[0.6, 0.625], [0.8, 0.9]],
    },
  },
  {
    id: 'teslo-modelo3',
    brand: 'Teslo',
    model: 'Modelo 3',
    year: 2024,
    price: 42000,
    kind: 'car',
    color: '#c8102e',
    stats: { speed: 8, accel: 9, handling: 8 },
    shape: {
      length: 4.72, width: 1.85,
      frontAxle: 0.19, rearAxle: 0.79,
      wheelRadius: 0.335, wheelWidth: 0.235,
      top: [[0, 0.5], [0.03, 0.66], [0.1, 0.75], [0.3, 0.86], [0.36, 0.9], [0.75, 0.97], [0.9, 0.99], [0.97, 0.94], [1, 0.62]],
      bottom: [[0, 0.28], [0.05, 0.18], [0.95, 0.2], [1, 0.34]],
      roof: [[0.32, 0.88], [0.42, 1.22], [0.52, 1.42], [0.62, 1.44], [0.74, 1.36], [0.86, 1.08], [0.9, 0.99]],
      plan: [[0, 0.78], [0.07, 0.95], [0.2, 1], [0.8, 1], [0.95, 0.95], [1, 0.84]],
      tumblehome: 0.08, boxiness: 4, endRound: 0.32,
      headlights: 'slim', taillights: 'split', rims: 'aero', grille: 'none', roofColor: 'black',
      pillars: [[0.6, 0.62]],
    },
  },
];

export const getVehicle = (id: string) => VEHICLES.find((v) => v.id === id) ?? VEHICLES[0];
export const vehicleName = (v: VehicleSpec) => `${v.brand} ${v.model} ${v.year}`;
