import { getFirebaseConfig } from '../config';
import type { Backend, PlayerProfile } from './types';

let backend: Backend | null = null;
let profile: PlayerProfile | null = null;
const listeners = new Set<(p: PlayerProfile) => void>();

/** Picks Firebase when configured, otherwise the local demo backend. Firebase is lazy-loaded. */
export async function getBackend(): Promise<Backend> {
  if (backend) return backend;
  const cfg = getFirebaseConfig();
  if (cfg) {
    const { FirebaseBackend } = await import('./firebaseBackend');
    backend = new FirebaseBackend(cfg);
  } else {
    const { DemoBackend } = await import('./demoBackend');
    backend = new DemoBackend();
  }
  return backend;
}

export const getProfile = () => profile;

export function setProfile(p: PlayerProfile | null) {
  profile = p;
  if (p) listeners.forEach((fn) => fn(p));
}

/** Applies changes locally right away and saves them in the background. */
export async function updateProfile(changes: Partial<PlayerProfile>) {
  if (!profile) return;
  setProfile({ ...profile, ...changes });
  await (await getBackend()).save(changes);
}

export function onProfileChange(fn: (p: PlayerProfile) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
