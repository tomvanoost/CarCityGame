import { DEFAULT_VEHICLE, START_MONEY } from '../config';
import { DEFAULT_OUTFIT } from '../game/avatar/clothes';
import type { Gender, PlayerProfile } from './types';
import { CLASSIC_FURNITURE, STARTER_FURNITURE } from '../game/furniture';
import type { MissionId } from '../game/missions';
import type { Dent } from '../game/vehicles/dents';

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
    vehicleNeon: {},
    vehicleSpoiler: {},
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
    raceBest: {},
    fish: {},
    animalsFed: [],
    animalsBrushed: [],
    swimFloat: false,
    kite: false,
    garden: null,
    basket: {},
    treasureMap: 0,
    treasureFound: 0,
    quizDay: '',
    quizRight: [],
    vehicleDents: {},
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
  if (!p.vehicleNeon || typeof p.vehicleNeon !== 'object') p.vehicleNeon = {};
  if (!p.vehicleSpoiler || typeof p.vehicleSpoiler !== 'object') p.vehicleSpoiler = {};
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
  if (!p.raceBest || typeof p.raceBest !== 'object') p.raceBest = {};
  if (!p.fish || typeof p.fish !== 'object') p.fish = {};
  p.animalsFed = toArray(raw.animalsFed, []);
  p.animalsBrushed = toArray(raw.animalsBrushed, []);
  p.swimFloat = p.swimFloat === true;
  p.kite = p.kite === true;
  const gd = raw.garden as { crop?: unknown; at?: unknown } | null | undefined;
  p.garden = gd && ['carrot', 'tomato', 'pumpkin'].includes(String(gd.crop)) && Number(gd.at) > 0 ? { crop: gd.crop as 'carrot', at: Number(gd.at) } : null;
  const bk: Record<string, number> = {};
  if (raw.basket && typeof raw.basket === 'object') for (const [k, v] of Object.entries(raw.basket as Record<string, unknown>)) if (['carrot', 'tomato', 'pumpkin'].includes(k) && Number(v) > 0) bk[k] = Math.floor(Number(v));
  p.basket = bk;
  p.treasureMap = Number(p.treasureMap) || 0;
  p.treasureFound = Number(p.treasureFound) || 0;
  p.quizDay = typeof p.quizDay === 'string' ? p.quizDay : '';
  p.quizRight = toArray(raw.quizRight, []).map(Number).filter((n) => n > 0);
  // Dents: keep only well-formed ones (the database may turn arrays into objects).
  const dents: Record<string, Dent[]> = {};
  if (raw.vehicleDents && typeof raw.vehicleDents === 'object') {
    for (const [id, list] of Object.entries(raw.vehicleDents as Record<string, unknown>)) {
      const arr = (Array.isArray(list) ? list : list && typeof list === 'object' ? Object.values(list) : []) as Dent[];
      const ok = arr.filter((d) => d && [0, 1, 2].every((i) => typeof Object.values(d.p ?? {})[i] === 'number' && typeof Object.values(d.n ?? {})[i] === 'number'))
        .map((d) => ({ p: Object.values(d.p).slice(0, 3) as Dent['p'], n: Object.values(d.n).slice(0, 3) as Dent['n'] }));
      if (ok.length) dents[id] = ok.slice(0, 5);
    }
  }
  p.vehicleDents = dents;
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
