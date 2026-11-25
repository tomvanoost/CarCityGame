export type Gender = 'boy' | 'girl';

export interface Equipped {
  hat: string | null;
  top: string | null;
  bottom: string | null;
  shoes: string | null;
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
