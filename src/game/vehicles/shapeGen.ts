import type { CarShape, Curve, HeadlightStyle, RimStyle, TaillightStyle } from './types';

/**
 * Describe a car with a few understandable measurements, get a full CarShape.
 * Lengths/heights in meters; "t" values run from 0 (front bumper) to 1 (rear bumper).
 */
export interface ShapeParams {
  length: number;
  width: number;
  /** Roof height. */
  height: number;
  wheelRadius: number;
  wheelWidth?: number;
  frontOverhang: number;
  rearOverhang: number;
  /** Height of the window line (top of the doors). */
  belt: number;
  /** Height of the front of the hood / rear of the trunk. */
  nose: number;
  tail: number;
  clearance?: number;
  /** Windshield base, roof front, roof rear, rear glass end (t). */
  ws: number;
  roofFront: number;
  roofRear: number;
  rearEnd: number;
  boxiness?: number;
  tumblehome?: number;
  endRound?: number;
  headlights?: HeadlightStyle;
  taillights?: TaillightStyle;
  rims?: RimStyle;
  grille?: 'wide' | 'small' | 'none';
  roofColor?: 'body' | 'black';
  pillars?: [number, number][];
  spoiler?: boolean;
  doors?: 2 | 4;
  exhaust?: 0 | 1 | 2;
  archTrim?: number;
  trim?: 'chrome' | 'black';
}

export function makeShape(p: ShapeParams): CarShape {
  const L = p.length;
  const cl = p.clearance ?? 0.18;
  const deck = Math.min(0.97, p.rearEnd + 0.01);
  const top: Curve = [
    [0, p.nose - 0.22], [0.03, p.nose], [p.ws * 0.35, p.nose + (p.belt - p.nose) * 0.45],
    [p.ws, p.belt - 0.03], [(p.ws + deck) / 2, p.belt], [deck, p.belt - 0.01],
    [Math.min(0.985, deck + 0.02), Math.max(p.tail, p.belt - 0.1)], [1, p.tail - 0.25],
  ];
  // Keep keys strictly increasing in t.
  const clean = (c: Curve) => c.filter((k, i) => i === 0 || k[0] > c[i - 1][0] + 1e-3);
  const wsTop = p.roofFront;
  const roof: Curve = clean([
    [p.ws, p.belt - 0.02],
    [p.ws + (wsTop - p.ws) * 0.5, p.belt + (p.height - p.belt) * 0.72],
    [wsTop, p.height],
    [(wsTop + p.roofRear) / 2, p.height + 0.01],
    [p.roofRear, p.height - 0.02],
    [p.roofRear + (p.rearEnd - p.roofRear) * 0.55, p.belt + (p.height - p.belt) * 0.45],
    [p.rearEnd, p.belt + 0.01],
  ]);
  return {
    length: L,
    width: p.width,
    frontAxle: p.frontOverhang / L,
    rearAxle: 1 - p.rearOverhang / L,
    wheelRadius: p.wheelRadius,
    wheelWidth: p.wheelWidth ?? 0.22,
    top: clean(top),
    bottom: [[0, cl + 0.12], [0.05, cl], [0.95, cl + 0.02], [1, cl + 0.15]],
    roof,
    plan: [[0, 0.8], [0.07, 0.95], [0.2, 1], [0.8, 1], [0.95, 0.96], [1, 0.86]],
    tumblehome: p.tumblehome ?? 0.06,
    boxiness: p.boxiness ?? 5,
    endRound: p.endRound ?? 0.24,
    headlights: p.headlights ?? 'slim',
    taillights: p.taillights ?? 'split',
    rims: p.rims ?? 'spokes5',
    grille: p.grille ?? 'small',
    roofColor: p.roofColor,
    pillars: p.pillars,
    spoiler: p.spoiler,
    doors: p.doors,
    exhaust: p.exhaust,
    archTrim: p.archTrim,
    trim: p.trim,
  };
}

/** Presets per car type. Spread one and override what makes the model unique. */
export const presets = {
  hatch: (o: Partial<ShapeParams> = {}): ShapeParams => ({
    length: 4.1, width: 1.76, height: 1.46, wheelRadius: 0.31, frontOverhang: 0.82, rearOverhang: 0.72,
    belt: 0.98, nose: 0.82, tail: 0.95, ws: 0.34, roofFront: 0.48, roofRear: 0.8, rearEnd: 0.955,
    pillars: [[0.6, 0.62], [0.8, 0.9]], ...o,
  }),
  sedan: (o: Partial<ShapeParams> = {}): ShapeParams => ({
    length: 4.75, width: 1.83, height: 1.44, wheelRadius: 0.33, frontOverhang: 0.88, rearOverhang: 1.0,
    belt: 0.97, nose: 0.76, tail: 0.98, ws: 0.32, roofFront: 0.47, roofRear: 0.66, rearEnd: 0.84,
    pillars: [[0.58, 0.6]], ...o,
  }),
  suv: (o: Partial<ShapeParams> = {}): ShapeParams => ({
    length: 4.65, width: 1.9, height: 1.68, wheelRadius: 0.37, wheelWidth: 0.25, frontOverhang: 0.9, rearOverhang: 0.95,
    belt: 1.12, nose: 0.98, tail: 1.08, clearance: 0.24, ws: 0.3, roofFront: 0.43, roofRear: 0.86, rearEnd: 0.965,
    boxiness: 5.5, archTrim: 0.07, pillars: [[0.57, 0.59], [0.84, 0.92]], ...o,
  }),
  sports: (o: Partial<ShapeParams> = {}): ShapeParams => ({
    length: 4.55, width: 1.95, height: 1.2, wheelRadius: 0.34, wheelWidth: 0.27, frontOverhang: 1.0, rearOverhang: 0.95,
    belt: 0.84, nose: 0.62, tail: 0.88, clearance: 0.12, ws: 0.36, roofFront: 0.52, roofRear: 0.64, rearEnd: 0.86,
    boxiness: 3.6, tumblehome: 0.1, endRound: 0.32, rims: 'sport', grille: 'wide', roofColor: 'black', doors: 2, exhaust: 2, ...o,
  }),
  van: (o: Partial<ShapeParams> = {}): ShapeParams => ({
    length: 4.7, width: 1.98, height: 1.95, wheelRadius: 0.36, wheelWidth: 0.25, frontOverhang: 0.75, rearOverhang: 0.75,
    belt: 1.12, nose: 1.02, tail: 1.1, clearance: 0.22, ws: 0.12, roofFront: 0.24, roofRear: 0.95, rearEnd: 0.985,
    boxiness: 6.5, endRound: 0.3, pillars: [[0.4, 0.42], [0.7, 0.72]], ...o,
  }),
  jeep: (o: Partial<ShapeParams> = {}): ShapeParams => ({
    length: 4.35, width: 1.9, height: 1.85, wheelRadius: 0.42, wheelWidth: 0.3, frontOverhang: 0.7, rearOverhang: 0.75,
    belt: 1.22, nose: 1.12, tail: 1.2, clearance: 0.3, ws: 0.32, roofFront: 0.36, roofRear: 0.95, rearEnd: 0.975,
    boxiness: 9, tumblehome: 0.02, endRound: 0.12, headlights: 'round', grille: 'wide', rims: 'multi', archTrim: 0.1, exhaust: 1, pillars: [[0.6, 0.62], [0.8, 0.82]], ...o,
  }),
};
