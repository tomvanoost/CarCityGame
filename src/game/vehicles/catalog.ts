import { makeShape, presets, type ShapeParams } from './shapeGen';
import type { BikeShape, VehicleSpec } from './types';

/**
 * All vehicles. Shapes follow the real cars' proportions, with look-alike names
 * (no real brand names or logos). Prices fit the in-game economy: a job pays
 * roughly EUR 300-450.
 */
type Stats = VehicleSpec['stats'];
const car = (id: string, brand: string, model: string, year: number, price: number, color: string, stats: Stats, shape: ShapeParams): VehicleSpec =>
  ({ id, brand, model, year, price, kind: 'car', color, stats, shape: makeShape(shape) });
const bike = (id: string, brand: string, model: string, year: number, price: number, color: string, stats: Stats, shape: BikeShape): VehicleSpec =>
  ({ id, brand, model, year, price, kind: 'motor', color, stats, bike: shape });

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
  // --- small cars ---
  car('polino', 'Volkswerk', 'Polino', 2024, 6000, '#e94b3c', { speed: 4, accel: 4, handling: 7 },
    presets.hatch({ length: 4.07, width: 1.75, height: 1.45, frontOverhang: 0.8, rearOverhang: 0.72, headlights: 'bar', grille: 'small' })),
  car('cinque', 'Fiato', 'Cinque-e', 2024, 5000, '#9ed8c8', { speed: 3, accel: 4, handling: 9 },
    presets.hatch({ length: 3.63, width: 1.68, height: 1.53, wheelRadius: 0.29, frontOverhang: 0.62, rearOverhang: 0.55, belt: 0.98, nose: 0.82, ws: 0.3, roofFront: 0.45, roofRear: 0.82, rearEnd: 0.96, boxiness: 3.4, endRound: 0.34, headlights: 'round', grille: 'none', pillars: [[0.84, 0.92]] })),
  car('kuper', 'Moni', 'Kuper SE', 2024, 9000, '#2f6b4f', { speed: 5, accel: 6, handling: 9 },
    presets.hatch({ length: 3.86, width: 1.73, height: 1.43, wheelRadius: 0.3, frontOverhang: 0.65, rearOverhang: 0.6, ws: 0.33, roofFront: 0.44, roofRear: 0.86, rearEnd: 0.97, headlights: 'round', roofColor: 'black', grille: 'wide', boxiness: 4.5, pillars: [[0.86, 0.94]] })),
  car('klio', 'Renaud', 'Klio', 2024, 7000, '#3a7bd5', { speed: 4, accel: 5, handling: 7 },
    presets.hatch({ length: 4.05, width: 1.79, height: 1.44, roofRear: 0.78, rearEnd: 0.94, headlights: 'slim', grille: 'wide', endRound: 0.28 })),
  car('yarus', 'Toyoda', 'Yarus', 2024, 6500, '#f2f2f2', { speed: 4, accel: 4, handling: 8 },
    presets.hatch({ length: 3.94, width: 1.75, height: 1.5, wheelRadius: 0.3, roofRear: 0.79, rearEnd: 0.95, roofColor: 'black', headlights: 'slim', grille: 'wide' })),
  // --- sedans ---
  {
    id: 'teslo-modelo3',
    brand: 'Teslo',
    model: 'Modelo 3',
    year: 2024,
    price: 24000,
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
  car('seel', 'BYDee', 'Seel', 2024, 22000, '#7f8fa6', { speed: 8, accel: 8, handling: 7 },
    presets.sedan({ length: 4.8, width: 1.88, height: 1.46, roofFront: 0.48, roofRear: 0.64, rearEnd: 0.88, grille: 'none', taillights: 'bar', rims: 'aero', endRound: 0.3 })),
  car('oudi-a4', 'Oudi', 'A4', 2024, 26000, '#202326', { speed: 7, accel: 7, handling: 8 },
    presets.sedan({ length: 4.76, width: 1.85, height: 1.43, grille: 'wide', headlights: 'bar', taillights: 'bar', rims: 'multi' })),
  car('beemer-3', 'Beemer', '3-Serie', 2024, 27000, '#2a4f9e', { speed: 7, accel: 8, handling: 9 },
    presets.sedan({ length: 4.71, width: 1.83, height: 1.44, frontOverhang: 0.8, grille: 'small', headlights: 'slim', rims: 'spokes5' })),
  car('mersedez-c', 'Mersedez', 'C-Klasse', 2024, 29000, '#c9ccd1', { speed: 7, accel: 7, handling: 7 },
    presets.sedan({ length: 4.75, width: 1.82, height: 1.44, roofRear: 0.64, rearEnd: 0.8, tail: 1.0, grille: 'wide', rims: 'multi' })),
  car('taykan', 'Porsha', 'Taykan', 2024, 60000, '#8fb7e0', { speed: 9, accel: 10, handling: 9 },
    presets.sedan({ length: 4.96, width: 1.97, height: 1.38, belt: 0.92, nose: 0.66, wheelRadius: 0.35, roofFront: 0.5, roofRear: 0.62, rearEnd: 0.9, grille: 'none', taillights: 'bar', rims: 'sport', boxiness: 3.6, endRound: 0.34 })),
  // --- SUVs ---
  car('modelo-y', 'Teslo', 'Modelo Y', 2024, 28000, '#f4f4f4', { speed: 8, accel: 9, handling: 7 },
    presets.suv({ length: 4.75, height: 1.62, belt: 1.05, nose: 0.88, roofRear: 0.7, rearEnd: 0.92, grille: 'none', rims: 'aero', roofColor: 'black', boxiness: 4, endRound: 0.32, pillars: [[0.58, 0.6]] })),
  car('id-vier', 'Volkswerk', 'iD.Vier', 2024, 25000, '#4a5a6a', { speed: 6, accel: 7, handling: 7 },
    presets.suv({ length: 4.58, height: 1.63, headlights: 'bar', grille: 'none', roofColor: 'black', rims: 'aero', roofRear: 0.82, rearEnd: 0.95 })),
  car('atto-3', 'BYDee', 'Atto 3', 2024, 20000, '#3f86c6', { speed: 6, accel: 7, handling: 7 },
    presets.suv({ length: 4.46, height: 1.62, taillights: 'bar', grille: 'none', rims: 'multi' })),
  car('kio-ev6', 'Kio', 'EV6', 2024, 27000, '#5a6b4f', { speed: 8, accel: 9, handling: 8 },
    presets.suv({ length: 4.69, height: 1.55, belt: 1.0, nose: 0.82, clearance: 0.18, roofFront: 0.46, roofRear: 0.7, rearEnd: 0.92, taillights: 'bar', grille: 'none', rims: 'sport', boxiness: 4, endRound: 0.3 })),
  car('volvu-xc90', 'Volvu', 'XC90', 2024, 45000, '#d8d2c4', { speed: 7, accel: 6, handling: 6 },
    presets.suv({ length: 4.95, width: 1.96, height: 1.78, grille: 'wide', headlights: 'slim', rims: 'multi', boxiness: 6.5, pillars: [[0.5, 0.52], [0.7, 0.72], [0.86, 0.93]] })),
  car('rangy-rover', 'Rangy', 'Rover', 2024, 70000, '#2b3a2f', { speed: 7, accel: 7, handling: 6 },
    presets.suv({ length: 5.05, width: 2.0, height: 1.87, belt: 1.22, nose: 1.08, wheelRadius: 0.4, ws: 0.28, roofFront: 0.38, roofRear: 0.92, rearEnd: 0.975, roofColor: 'black', grille: 'wide', headlights: 'slim', boxiness: 8, endRound: 0.18, rims: 'spokes5' })),
  // --- vans & off-road ---
  car('id-bus', 'Volkswerk', 'iD.Bus', 2024, 30000, '#f2b632', { speed: 5, accel: 6, handling: 6 },
    presets.van({ headlights: 'bar', grille: 'none', rims: 'aero', roofColor: 'body' })),
  car('jiep', 'Jiep', 'Wrangel', 2024, 35000, '#c0392b', { speed: 5, accel: 6, handling: 6 },
    presets.jeep({ roofColor: 'black' })),
  // --- sports cars ---
  car('porsha-911', 'Porsha', '911 Karrera', 2024, 90000, '#d4d6d9', { speed: 9, accel: 9, handling: 10 },
    presets.sports({ length: 4.52, width: 1.85, height: 1.3, belt: 0.9, nose: 0.66, frontOverhang: 0.98, rearOverhang: 1.05, ws: 0.33, roofFront: 0.46, roofRear: 0.56, rearEnd: 0.9, headlights: 'round', grille: 'none', roofColor: 'body', boxiness: 3.2, endRound: 0.36 })),
  car('korvet', 'Shevy', 'Korvet', 2024, 70000, '#f5c400', { speed: 9, accel: 9, handling: 8 },
    presets.sports({ length: 4.63, width: 1.93, height: 1.23, ws: 0.4, roofFront: 0.52, roofRear: 0.6, rearEnd: 0.84, headlights: 'slim', spoiler: true })),
  car('ferrara', 'Ferrara', 'Rosso F8', 2024, 160000, '#d0101c', { speed: 10, accel: 10, handling: 9 },
    presets.sports({ length: 4.61, width: 1.98, height: 1.2, headlights: 'slim', grille: 'wide' })),
  car('maxlaren', 'MaxLaren', '720', 2024, 150000, '#ff7a00', { speed: 10, accel: 10, handling: 9 },
    presets.sports({ length: 4.54, width: 1.93, height: 1.19, nose: 0.58, ws: 0.36, roofFront: 0.5, roofRear: 0.62, rearEnd: 0.88, headlights: 'bar', grille: 'small', spoiler: true })),
  car('hurricano', 'Lambergini', 'Hurricano', 2024, 190000, '#7ac142', { speed: 10, accel: 10, handling: 9 },
    presets.sports({ length: 4.52, width: 1.93, height: 1.16, belt: 0.8, nose: 0.55, ws: 0.38, roofFront: 0.5, roofRear: 0.62, rearEnd: 0.82, boxiness: 3, endRound: 0.22, headlights: 'slim', grille: 'wide', spoiler: true })),
  car('jessko', 'Koenigsberg', 'Jessko', 2024, 250000, '#e8e8e8', { speed: 10, accel: 10, handling: 10 },
    presets.sports({ length: 4.61, width: 2.03, height: 1.21, nose: 0.58, ws: 0.37, roofFront: 0.49, roofRear: 0.6, rearEnd: 0.84, headlights: 'slim', grille: 'wide', spoiler: true, roofColor: 'black' })),
  car('chirone', 'Bugatto', 'Chirone', 2024, 300000, '#1f4fa3', { speed: 10, accel: 10, handling: 9 },
    presets.sports({ length: 4.54, width: 2.04, height: 1.21, nose: 0.66, ws: 0.36, roofFront: 0.48, roofRear: 0.62, rearEnd: 0.86, headlights: 'slim', grille: 'small', roofColor: 'black', boxiness: 3.4, endRound: 0.34 })),
  // --- motorbikes ---
  bike('vespo', 'Vespo', 'Primavera', 2024, 3000, '#9ed8c8', { speed: 3, accel: 5, handling: 9 },
    { style: 'scooter', wheelbase: 1.33, wheelRadius: 0.29, seatHeight: 0.8, rims: 'spokes5' }),
  bike('hondo-cbr', 'Hondo', 'CBR 650', 2024, 8000, '#f2f2f2', { speed: 7, accel: 8, handling: 9 },
    { style: 'sport', wheelbase: 1.45, wheelRadius: 0.33, seatHeight: 0.85, rims: 'spokes5' }),
  bike('kawa-z900', 'Kawasakki', 'Z900', 2024, 9000, '#5bbf3a', { speed: 7, accel: 8, handling: 9 },
    { style: 'naked', wheelbase: 1.45, wheelRadius: 0.33, seatHeight: 0.82, rims: 'sport' }),
  bike('yamaho-r1', 'Yamaho', 'R1', 2024, 12000, '#1f4fa3', { speed: 8, accel: 9, handling: 9 },
    { style: 'sport', wheelbase: 1.4, wheelRadius: 0.33, seatHeight: 0.86, rims: 'sport' }),
  bike('harly', 'Harly', 'Glide', 2024, 15000, '#151515', { speed: 6, accel: 6, handling: 6 },
    { style: 'cruiser', wheelbase: 1.65, wheelRadius: 0.35, seatHeight: 0.7, rims: 'multi' }),
  bike('beemer-gs', 'Beemer', 'GS 1300', 2024, 16000, '#f2f2f2', { speed: 7, accel: 7, handling: 8 },
    { style: 'adventure', wheelbase: 1.52, wheelRadius: 0.38, seatHeight: 0.9, rims: 'multi' }),
  bike('dukati', 'Dukati', 'Panigali', 2024, 18000, '#c8101c', { speed: 9, accel: 10, handling: 9 },
    { style: 'sport', wheelbase: 1.47, wheelRadius: 0.33, seatHeight: 0.84, rims: 'sport' }),
];

export const getVehicle = (id: string) => VEHICLES.find((v) => v.id === id) ?? VEHICLES[0];
export const vehicleName = (v: VehicleSpec) => `${v.brand} ${v.model} ${v.year}`;
