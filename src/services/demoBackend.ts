import { newProfile, normalizeProfile } from './profile';
import { LocalMultiplayer } from './multiplayer';
import { AuthError, type Backend, type Gender, type PlayerProfile } from './types';

const USERS_KEY = 'carcity.demo.users';
const SESSION_KEY = 'carcity.demo.session';

interface DemoUser { hash: string; profile: PlayerProfile }

/** Used when Firebase isn't configured yet: everything lives in localStorage. */
export class DemoBackend implements Backend {
  private mp = new LocalMultiplayer();
  multiplayer() { return this.mp; }

  readonly mode = 'demo' as const;
  private current: string | null = null;

  async restore() {
    const name = read<string | null>(SESSION_KEY, null);
    const user = name ? this.users()[name] : undefined;
    if (!name || !user) return null;
    this.current = name;
    return normalizeProfile(user.profile, name);
  }

  async login(username: string, password: string) {
    const key = username.toLowerCase();
    const user = this.users()[key];
    if (!user || user.hash !== (await hash(password))) throw new AuthError('errWrong');
    this.current = key;
    write(SESSION_KEY, key);
    return normalizeProfile(user.profile, username);
  }

  async register(username: string, password: string, gender: Gender) {
    const key = username.toLowerCase();
    const users = this.users();
    if (users[key]) throw new AuthError('errTaken');
    const profile = newProfile(username, gender);
    users[key] = { hash: await hash(password), profile };
    write(USERS_KEY, users);
    this.current = key;
    write(SESSION_KEY, key);
    return profile;
  }

  async logout() {
    this.current = null;
    write(SESSION_KEY, null);
  }

  async save(changes: Partial<PlayerProfile>) {
    if (!this.current) return;
    const users = this.users();
    const u = users[this.current];
    if (!u) return;
    u.profile = { ...u.profile, ...changes };
    write(USERS_KEY, users);
  }

  private users(): Record<string, DemoUser> {
    return read(USERS_KEY, {});
  }
}

async function hash(text: string): Promise<string> {
  if (!crypto?.subtle) return `plain:${text}`;
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`carcity:${text}`));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
}

function read<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* ignore */ }
}
