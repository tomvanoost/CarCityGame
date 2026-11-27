import type { PlayerProfile } from '../services/types';

/**
 * Stickers (achievements). Most are earned automatically from the profile;
 * "event" stickers (no check) are given by the game with awardSticker().
 * Name and hint texts are in i18n as `st_<id>` and `st_<id>_hint`.
 */
export interface Sticker {
  id: StickerId;
  emoji: string;
  check?: (p: PlayerProfile) => boolean;
}

export type StickerId = 'firstDrive' | 'honk' | 'firstDelivery' | 'firstTaxi' | 'jobs10' | 'km10' | 'km50'
  | 'newCar' | 'newClothes' | 'apartment' | 'saver' | 'carWash' | 'iceCream' | 'supermarket' | 'pet' | 'paintShop' | 'furniture' | 'pizza' | 'funFair' | 'missions' | 'coins10' | 'coins30' | 'hornShop' | 'race' | 'raceGold' | 'fish' | 'fishAll' | 'baker' | 'bus' | 'farmFriend' | 'balloon' | 'fireworks' | 'swim' | 'treasure' | 'sandboard' | 'clever' | 'boat' | 'kite' | 'gardener';

const jobs = (p: PlayerProfile) => p.deliveries + p.taxiRides;

export const STICKERS: Sticker[] = [
  { id: 'firstDrive', emoji: '🚗', check: (p) => p.km >= 0.5 },
  { id: 'honk', emoji: '📯' },
  { id: 'firstDelivery', emoji: '📦', check: (p) => p.deliveries >= 1 },
  { id: 'firstTaxi', emoji: '🚕', check: (p) => p.taxiRides >= 1 },
  { id: 'jobs10', emoji: '🏅', check: (p) => jobs(p) >= 10 },
  { id: 'km10', emoji: '🛣️', check: (p) => p.km >= 10 },
  { id: 'km50', emoji: '🌍', check: (p) => p.km >= 50 },
  { id: 'newCar', emoji: '🚙', check: (p) => p.ownedVehicles.length >= 2 },
  { id: 'newClothes', emoji: '👕', check: (p) => p.ownedClothes.length >= 2 },
  { id: 'apartment', emoji: '🏢', check: (p) => p.ownsApartment },
  { id: 'saver', emoji: '💰', check: (p) => p.money >= 10000 },
  { id: 'carWash', emoji: '🫧' },
  { id: 'iceCream', emoji: '🍦' },
  { id: 'supermarket', emoji: '🛒' },
  { id: 'paintShop', emoji: '🎨' },
  { id: 'pizza', emoji: '🍕' },
  { id: 'funFair', emoji: '🎡' },
  { id: 'missions', emoji: '🎯' },
  { id: 'hornShop', emoji: '🦆' },
  { id: 'race', emoji: '🏁' },
  { id: 'raceGold', emoji: '🥇' },
  { id: 'fish', emoji: '🎣' },
  { id: 'fishAll', emoji: '🐡' },
  { id: 'baker', emoji: '🥐' },
  { id: 'bus', emoji: '🚌' },
  { id: 'farmFriend', emoji: '🐐' },
  { id: 'balloon', emoji: '🎈' },
  { id: 'fireworks', emoji: '🎆' },
  { id: 'swim', emoji: '🏊' },
  { id: 'treasure', emoji: '💎' },
  { id: 'sandboard', emoji: '🏂' },
  { id: 'clever', emoji: '🦉' },
  { id: 'boat', emoji: '⛴️' },
  { id: 'kite', emoji: '🪁' },
  { id: 'gardener', emoji: '🥕' },
  { id: 'coins10', emoji: '🪙', check: (p) => (p.coins?.length ?? 0) >= 10 },
  { id: 'coins30', emoji: '👑', check: (p) => (p.coins?.length ?? 0) >= 30 },
  { id: 'furniture', emoji: '🛋️' },
  { id: 'pet', emoji: '🐾', check: (p) => (p.pets?.length ?? 0) >= 1 },
];

export const getSticker = (id: string) => STICKERS.find((s) => s.id === id);

/** Stickers the profile has earned but does not have yet. */
export function newlyEarned(p: PlayerProfile): StickerId[] {
  return STICKERS.filter((s) => s.check && !p.stickers.includes(s.id) && s.check(p)).map((s) => s.id);
}
