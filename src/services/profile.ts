import { DEFAULT_VEHICLE, START_MONEY } from '../config';
import { DEFAULT_OUTFIT } from '../game/avatar/clothes';
import type { Gender, PlayerProfile } from './types';
import { CLASSIC_FURNITURE, STARTER_FURNITURE } from '../game/furniture';
import type { MissionId } from '../game/missions';

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
    furniture: [...STARTER_FURNITURE],
    coins: [],
    horns: [],
    vehicleHorns: {},
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
  // Before the furniture shop every apartment came fully furnished: keep that for existing players.
  p.furniture = raw.furniture === undefined && raw.ownsApartment ? [...CLASSIC_FURNITURE] : toArray(raw.furniture, STARTER_FURNITURE);
  p.coins = toArray(raw.coins, []);
  p.horns = toArray(raw.horns, []);
  if (!p.vehicleHorns || typeof p.vehicleHorns !== 'object') p.vehicleHorns = {};
  // Daily missions: keep only well-formed progress.
  const m = raw.missions as { day?: unknown; progress?: unknown; done?: unknown } | undefined;
  if (m && typeof m.day === 'string') {
    const progress: Record<string, number> = {};
    if (m.progress && typeof m.progress === 'object') for (const [k, v] of Object.entries(m.progress)) if (typeof v === 'number') progress[k] = v;
    p.missions = { day: m.day, progress, done: toArray(m.done, []) as MissionId[] };
  } else delete p.missions;
  return p;
}

function toArray(v: unknown, fallback: string[]): string[] {
  if (Array.isArray(v)) return v.filter((x) => typeof x === 'string');
  if (v && typeof v === 'object') return Object.values(v).filter((x): x is string => typeof x === 'string');
  return [...fallback];
}

export const USERNAME_RE = /^[a-zA-Z0-9_]{3,16}$/;
