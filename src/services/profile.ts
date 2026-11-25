import { DEFAULT_VEHICLE, START_MONEY } from '../config';
import type { Gender, PlayerProfile } from './types';

export function newProfile(username: string, gender: Gender): PlayerProfile {
  return {
    username,
    gender,
    money: START_MONEY,
    ownedVehicles: [DEFAULT_VEHICLE],
    selectedVehicle: DEFAULT_VEHICLE,
    ownedClothes: [],
    equipped: { hat: null, top: null, bottom: null, shoes: null },
    lastDailyBonus: 0,
    createdAt: Date.now(),
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
  p.ownedClothes = toArray(raw.ownedClothes, []);
  if (!p.ownedVehicles.includes(p.selectedVehicle)) p.selectedVehicle = p.ownedVehicles[0];
  return p;
}

function toArray(v: unknown, fallback: string[]): string[] {
  if (Array.isArray(v)) return v.filter((x) => typeof x === 'string');
  if (v && typeof v === 'object') return Object.values(v).filter((x): x is string => typeof x === 'string');
  return [...fallback];
}

export const USERNAME_RE = /^[a-zA-Z0-9_]{3,16}$/;
