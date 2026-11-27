import type { PlayerProfile } from '../services/types';

/**
 * Daily missions: three simple goals a day, the same for everyone on the same date.
 * Texts are in i18n as `mi_<id>` (with {n} for the goal).
 */
export type MissionId = 'drive' | 'jobs' | 'honk' | 'walk' | 'iceCream' | 'funFair' | 'pizza' | 'wash';

export interface Mission { id: MissionId; emoji: string; goal: number; reward: number }

export const MISSIONS: Mission[] = [
  { id: 'drive', emoji: '🚗', goal: 5, reward: 150 }, // km
  { id: 'jobs', emoji: '📦', goal: 2, reward: 200 },
  { id: 'honk', emoji: '📯', goal: 3, reward: 80 }, // honk at cars nearby
  { id: 'walk', emoji: '🚶', goal: 500, reward: 100 }, // meters
  { id: 'iceCream', emoji: '🍦', goal: 1, reward: 60 },
  { id: 'funFair', emoji: '🎡', goal: 1, reward: 60 },
  { id: 'pizza', emoji: '🍕', goal: 1, reward: 150 },
  { id: 'wash', emoji: '🫧', goal: 1, reward: 60 },
];

export interface MissionDay { day: string; progress: Partial<Record<MissionId, number>>; done: MissionId[] }

/** Today's date as YYYY-MM-DD in the player's own time zone. */
export function todayKey(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** The three missions of a day: picked from the date, so they change at midnight. */
export function todaysMissions(day = todayKey()): Mission[] {
  let seed = 0;
  for (const ch of day) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
  const pool = [...MISSIONS];
  const out: Mission[] = [];
  while (out.length < 3) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    out.push(pool.splice(seed % pool.length, 1)[0]);
  }
  return out;
}

/** The player's progress for today (empty when the saved progress is from another day). */
export function missionDay(p: PlayerProfile, day = todayKey()): MissionDay {
  const m = p.missions;
  if (!m || m.day !== day) return { day, progress: {}, done: [] };
  return m;
}
