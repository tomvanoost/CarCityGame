export interface FirebaseWebConfig {
  apiKey: string;
  authDomain: string;
  databaseURL: string;
  projectId: string;
  appId: string;
}

declare global {
  interface Window {
    CARCITY_CONFIG?: { firebase?: Partial<FirebaseWebConfig> };
  }
}

/** Returns the Firebase config, or null when it isn't filled in (demo mode). */
export function getFirebaseConfig(): FirebaseWebConfig | null {
  const fb = window.CARCITY_CONFIG?.firebase;
  if (!fb?.apiKey || !fb.databaseURL) return null;
  return fb as FirebaseWebConfig;
}

export const START_MONEY = 1000;
export const DEFAULT_VEHICLE = 'golfo-2025';
