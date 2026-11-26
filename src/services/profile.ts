import { DEFAULT_VEHICLE, START_MONEY } from '../config';
import { DEFAULT_OUTFIT } from '../game/avatar/clothes';
import type { Gender, PlayerProfile } from './types';

export function newProfile(username: string, gender: Gender): PlayerProfile {
  return {
    username,
    gender,
    money: START_MONEY,
    ownedVehicles: [DEFAULT_VEHICLE],
    selectedVehicle: DEFAULT_VEHICLE,
    ownedClothes: [DEFAULT_OUTFIT],
    equipped: { outfit: DEFAULT_OUTFIT },
    lastDailyBonus: 0,
    createdAt: Date.now(),
    fuel: 1,
    ownsApartment: false,
    spawn: 'home',
    km: 0,
    vehicleColors: {},
    vehicleStripes: {},
    vehicleRims: {},
    tutorialDone: false,
    stickers: [],
    deliveries: 0,
    taxiRides: 0,
    pets: [],
    activePet: '',
  };
}

/** Fills in missing fields (Firebase drops empty arrays / nulls). */
export function normalizeProfile(raw: Partial<PlayerProfile>, fallbackName: string): PlayerProfile {
  const base = newProfile(raw.username ?? fallbackName, raw.gender ?? 'boy');
  const p: PlayerProfile = {
    ...base,
    ...raw,
    equipped: { ...base.equipped, ...(raw.equipped ?? {}) },
  };
  p.ownedVehicles = toArray(raw.ownedVehicles, base.ownedVehicles);
  p.ownedClothes = toArray(raw.ownedClothes, base.ownedClothes);
  if (!p.ownedClothes.includes(DEFAULT_OUTFIT)) p.ownedClothes.unshift(DEFAULT_OUTFIT);
  if (!p.ownedClothes.includes(p.equipped.outfit)) p.equipped.outfit = DEFAULT_OUTFIT;
  if (!p.ownedVehicles.includes(p.selectedVehicle)) p.selectedVehicle = p.ownedVehicles[0];
  p.fuel = typeof p.fuel === 'number' ? Math.min(1, Math.max(0, p.fuel)) : 1;
  if (p.spawn === 'apartment' && !p.ownsApartment) p.spawn = 'home';
  if (!p.vehicleColors || typeof p.vehicleColors !== 'object') p.vehicleColors = {};
  if (!p.vehicleStripes || typeof p.vehicleStripes !== 'object') p.vehicleStripes = {};
  if (!p.vehicleRims || typeof p.vehicleRims !== 'object') p.vehicleRims = {};
  p.tutorialDone = p.tutorialDone === true;
  p.stickers = toArray(raw.stickers, []);
  p.deliveries = typeof p.deliveries === 'number' ? p.deliveries : 0;
  p.taxiRides = typeof p.taxiRides === 'number' ? p.taxiRides : 0;
  p.pets = toArray(raw.pets, []);
  p.activePet = typeof p.activePet === 'string' && p.pets.includes(p.activePet) ? p.activePet : '';
  return p;
}

function toArray(v: unknown, fallback: string[]): string[] {
  if (Array.isArray(v)) return v.filter((x) => typeof x === 'string');
  if (v && typeof v === 'object') return Object.values(v).filter((x): x is string => typeof x === 'string');
  return [...fallback];
}

export const USERNAME_RE = /^[a-zA-Z0-9_]{3,16}$/;
