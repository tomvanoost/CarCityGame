import { initializeApp } from 'firebase/app';
import {
  browserLocalPersistence,
  createUserWithEmailAndPassword,
  getAuth,
  onAuthStateChanged,
  setPersistence,
  signInWithEmailAndPassword,
  signOut,
  type Auth,
  type User,
} from 'firebase/auth';
import { get, getDatabase, onValue, ref, set, update, type Database } from 'firebase/database';
import type { FirebaseWebConfig } from '../config';
import { newProfile, normalizeProfile } from './profile';
import { AuthError, type Backend, type Gender, type PlayerProfile } from './types';
import { getProfile, setProfile } from './session';

/**
 * Players only type a username. Firebase Auth needs an e-mail, so we turn the
 * username into a fake, never-used address. Passwords are handled by Firebase
 * Auth (hashed) and are never stored in the database.
 */
const toEmail = (username: string) => `${username.toLowerCase()}@players.carcitygame.app`;

export class FirebaseBackend implements Backend {
  readonly mode = 'firebase' as const;
  private auth: Auth;
  private db: Database;
  private stopListening: (() => void) | null = null;
  /** The last value we wrote per field (JSON), to tell our own echoes from outside changes. */
  private written: Record<string, string> = {};

  constructor(config: FirebaseWebConfig) {
    const app = initializeApp(config);
    this.auth = getAuth(app);
    this.db = getDatabase(app);
  }

  async restore(): Promise<PlayerProfile | null> {
    await setPersistence(this.auth, browserLocalPersistence);
    const user = await new Promise<User | null>((resolve) => {
      const unsub = onAuthStateChanged(this.auth, (u) => { unsub(); resolve(u); });
    });
    return user ? this.loadProfile(user) : null;
  }

  async login(username: string, password: string): Promise<PlayerProfile> {
    try {
      const cred = await signInWithEmailAndPassword(this.auth, toEmail(username), password);
      return await this.loadProfile(cred.user, username);
    } catch (e) {
      throw mapError(e);
    }
  }

  async register(username: string, password: string, gender: Gender): Promise<PlayerProfile> {
    try {
      const cred = await createUserWithEmailAndPassword(this.auth, toEmail(username), password);
      const profile = newProfile(username, gender);
      await set(ref(this.db, `users/${cred.user.uid}`), profile);
      this.listen(cred.user.uid, profile.username);
      return profile;
    } catch (e) {
      throw mapError(e);
    }
  }

  async logout() {
    this.stopListening?.();
    this.stopListening = null;
    await signOut(this.auth);
  }

  async save(changes: Partial<PlayerProfile>) {
    const uid = this.auth.currentUser?.uid;
    if (!uid) return;
    for (const [k, v] of Object.entries(changes)) this.written[k] = JSON.stringify(v);
    await update(ref(this.db, `users/${uid}`), changes);
  }

  private async loadProfile(user: User, fallbackName?: string): Promise<PlayerProfile> {
    const name = fallbackName ?? user.email?.split('@')[0] ?? 'player';
    const snap = await get(ref(this.db, `users/${user.uid}`));
    if (!snap.exists()) {
      // Account exists but no data yet (e.g. a failed first save): create it.
      const profile = newProfile(name, 'boy');
      await set(ref(this.db, `users/${user.uid}`), profile);
      this.listen(user.uid, profile.username);
      return profile;
    }
    const profile = normalizeProfile(snap.val(), name);
    this.listen(user.uid, profile.username);
    return profile;
  }

  /**
   * Live updates: changes made in the Firebase console (e.g. an admin changing money)
   * show up in the game right away. Without this, the open game kept its own copy and
   * saved it back (also when the page closes on F5), undoing the change.
   * Our own writes come back here too, with the same values, so they change nothing.
   */
  private listen(uid: string, username: string) {
    this.stopListening?.();
    this.written = {};
    let first = true;
    this.stopListening = onValue(ref(this.db, `users/${uid}`), (snap) => {
      if (first) { first = false; return; } // the profile was just loaded
      const cur = getProfile();
      if (!snap.exists() || !cur || cur.username !== username) return;
      // Take over only fields that someone else changed: not equal to what we have,
      // and not just the echo of what we wrote ourselves (the game saves rounded values).
      const server = normalizeProfile(snap.val(), username) as unknown as Record<string, unknown>;
      const mine = cur as unknown as Record<string, unknown>;
      const changed: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(server)) {
        const j = JSON.stringify(v);
        if (j !== JSON.stringify(mine[k]) && j !== this.written[k]) changed[k] = v;
      }
      if (Object.keys(changed).length) {
        for (const [k, v] of Object.entries(changed)) this.written[k] = JSON.stringify(v);
        setProfile({ ...cur, ...changed } as PlayerProfile);
      }
    });
  }
}

function mapError(e: unknown): AuthError {
  const code = (e as { code?: string })?.code ?? '';
  if (['auth/invalid-credential', 'auth/wrong-password', 'auth/user-not-found', 'auth/invalid-email'].includes(code))
    return new AuthError('errWrong');
  if (code === 'auth/email-already-in-use') return new AuthError('errTaken');
  if (code === 'auth/network-request-failed') return new AuthError('errNetwork');
  console.error(e);
  return new AuthError('errUnknown');
}
