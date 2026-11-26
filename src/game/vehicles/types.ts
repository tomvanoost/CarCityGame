/** A curve as [t, value] keys; t runs from 0 (front bumper) to 1 (rear bumper). */
export type Curve = [number, number][];

export type HeadlightStyle = 'slim' | 'round' | 'bar';
export type TaillightStyle = 'split' | 'bar';
export type RimStyle = 'spokes5' | 'multi' | 'aero' | 'sport';

export interface CarShape {
  /** Overall size in meters. */
  length: number;
  width: number;
  /** Axle positions as t (0..1 along the length). */
  frontAxle: number;
  rearAxle: number;
  wheelRadius: number;
  wheelWidth: number;
  /** Top of the body: bumper -> hood -> beltline -> trunk/tail (meters). */
  top: Curve;
  /** Bottom of the body (ground clearance). Wheel arches are cut automatically. */
  bottom: Curve;
  /** Roof / glass line. Starts and ends where it meets `top`. */
  roof: Curve;
  /** Plan-view width factor (0..1 of `width`). */
  plan: Curve;
  /** How much the sides lean in towards the top (0 = straight). */
  tumblehome?: number;
  /** Cross-section roundness (2 = ellipse, higher = boxier). */
  boxiness?: number;
  /** Radius of rounded nose/tail. */
  endRound?: number;
  headlights: HeadlightStyle;
  taillights: TaillightStyle;
  rims: RimStyle;
  roofColor?: 'body' | 'black';
  grille?: 'wide' | 'small' | 'none';
  /** Body-colored window pillars as t ranges, e.g. B and C pillars. */
  pillars?: [number, number][];
  /** Rear wing (sports cars). */
  spoiler?: boolean;
  /** 2 or 4 doors (for the door seams and handles). */
  doors?: 2 | 4;
  /** Number of exhaust tips (0 = electric). */
  exhaust?: 0 | 1 | 2;
  /** Thickness of the black wheel-arch trim in meters. */
  archTrim?: number;
  /** Window trim color. */
  trim?: 'chrome' | 'black';
}

export type BikeStyle = 'sport' | 'naked' | 'cruiser' | 'scooter' | 'adventure';

/** Motorbikes are built from a few simple parts (see bikeBuilder.ts). */
export interface BikeShape {
  style: BikeStyle;
  wheelbase: number;
  wheelRadius: number;
  seatHeight: number;
  rims: RimStyle;
}

export interface VehicleSpec {
  id: string;
  brand: string;
  model: string;
  year: number;
  price: number;
  kind: 'car' | 'motor';
  /** Default paint color. */
  color: string;
  /** Emergency vehicle: has a siren (R) with flashing lights; traffic pulls over for it. */
  siren?: 'police' | 'fire' | 'ambulance';
  /** Electric car: no engine "vroom", a soft electric whine instead. */
  electric?: boolean;
  /** Real top speed of the car it's modeled on, in km/h (also the in-game top speed). */
  topSpeed: number;
  /** Gameplay stats (1..10) shown in the shop. */
  stats: { speed: number; accel: number; handling: number };
  /** Cars have a body shape, motorbikes a bike shape. */
  shape?: CarShape;
  bike?: BikeShape;
}
