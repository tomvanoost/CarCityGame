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
}
