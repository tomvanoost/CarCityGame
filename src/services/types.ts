export type Gender = 'boy' | 'girl';

export interface Equipped {
  /** Clothes item id (see game/avatar/clothes.ts). */
  outfit: string;
}

export interface PlayerProfile {
  username: string;
  gender: Gender;
  money: number;
  ownedVehicles: string[];
  selectedVehicle: string;
  ownedClothes: string[];
  equipped: Equipped;
  lastDailyBonus: number; // epoch ms
  createdAt: number;
  /** Fuel in the tank, 0..1. */
  fuel: number;
  ownsApartment: boolean;
  /** Where you start when you press Play. */
  spawn: 'home' | 'apartment';
  /** Total km driven (fun statistic). */
  km: number;
  /** Chosen paint color per owned vehicle id. */
  vehicleColors: Record<string, string>;
  /** Paint shop extras per vehicle id: roof stripe color and rim color (missing = none). */
  vehicleStripes: Record<string, string>;
  vehicleRims: Record<string, string>;
  /** Garage extras per vehicle: underglow and spoiler color ('' = none). */
  vehicleNeon: Record<string, string>;
  vehicleSpoiler: Record<string, string>;
  /** The first-time tutorial was shown (or skipped). */
  tutorialDone: boolean;
  /** Earned sticker ids (see game/stickers.ts). */
  stickers: string[];
  /** Finished jobs (for stickers). */
  deliveries: number;
  taxiRides: number;
  /** Pets you bought (ids from game/play/pets.ts) and the one that comes along ('' = none). */
  pets: string[];
  activePet: string;
  /** Furniture in your apartment (ids from game/furniture.ts). */
  furniture: string[];
  /** Coin hunt: ids of the coins you found (see game/play/coins.ts). */
  coins: string[];
  /** Horn shop: horns you bought, and the horn chosen per vehicle (see game/horns.ts). */
  horns: string[];
  vehicleHorns: Record<string, string>;
  /** Desert race: best lap time (seconds) per vehicle. */
  raceBest: Record<string, number>;
  /** Fish album: how many of each kind you caught (and let go again). */
  fish: Record<string, number>;
  /** Petting farm: the kinds of animals you fed. */
  animalsFed: string[];
  /** Has the rubber duck float for swimming. */
  swimFloat: boolean;
  /** Has a kite (flies on the beach). */
  kite: boolean;
  /** Treasure hunt: the week of the treasure map you have, and the last week you found the chest (0 = none). */
  treasureMap: number;
  treasureFound: number;
  /** Library quiz: the day ("YYYY-MM-DD") and the questions answered right that day (each pays once a day). */
  quizDay: string;
  quizRight: number[];
  /** Dents per vehicle (from bumping into cars); the garage repairs them. */
  vehicleDents: Record<string, import('../game/vehicles/dents').Dent[]>;
  /** Today's daily missions progress (see game/missions.ts); reset when the day changes. */
  missions?: { day: string; progress: Partial<Record<import('../game/missions').MissionId, number>>; done: import('../game/missions').MissionId[] };
}

/** Error codes the UI turns into friendly translated messages. */
export type AuthErrorCode = 'errWrong' | 'errTaken' | 'errNetwork' | 'errUnknown';

export class AuthError extends Error {
  constructor(public code: AuthErrorCode) {
    super(code);
  }
}

export interface Backend {
  readonly mode: 'firebase' | 'demo';
  /** Restores a previous session, if any. */
  restore(): Promise<PlayerProfile | null>;
  login(username: string, password: string): Promise<PlayerProfile>;
  register(username: string, password: string, gender: Gender): Promise<PlayerProfile>;
  logout(): Promise<void>;
  save(changes: Partial<PlayerProfile>): Promise<void>;
  /** Multiplayer servers and players (Firebase, or browser tabs in demo mode). */
  multiplayer(): import('./multiplayer').MpService;
}
