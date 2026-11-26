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
import { get, getDatabase, limitToLast, onChildAdded, onChildChanged, onChildRemoved, onDisconnect, onValue, push, query, ref, remove, serverTimestamp, set, update, type Database } from 'firebase/database';
import { CHAT_MAX, chatLimiter, EMOTES, EMPTY_ROOM_TTL, safeMessage, throttledSender, type ChatMessage, type MpService, type MpSession, type PlayerState, type RemotePlayer, type RoomInfo } from './multiplayer';
import { cleanText } from './textFilter';
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
  private mp: MpService | null = null;

  /**
   * Multiplayer in the Realtime Database:
   *   mp/rooms/{room}         { name, host, hostUid, created }
   *   mp/online/{room}/{uid}  true while connected (for the player count in the server list)
   *   mp/players/{room}/{uid} the player's live state
   *   mp/chat/{room}/{msg}    chat lines and emotes { uid, name, text | emote, at } (the last 20 are read)
   * Both player entries are removed by the server when the connection drops (onDisconnect).
   * Child events are used, so each update only sends the one player that changed.
   */
  multiplayer(): MpService {
    if (this.mp) return this.mp;
    const db = this.db, auth = this.auth;
    const uid = () => { const u = auth.currentUser; if (!u) throw new Error('not logged in'); return u.uid; };
    this.mp = {
      async listRooms(): Promise<RoomInfo[]> {
        // The rules allow reading who is online per server (mp/online/{room}), not all at once.
        const rooms = Object.entries(((await get(ref(db, 'mp/rooms'))).val() ?? {}) as Record<string, { name: string; host: string; created: number }>);
        const counts = await Promise.all(rooms.map(([id]) => get(ref(db, `mp/online/${id}`))
          .then((snap) => Object.keys(snap.val() ?? {}).length).catch(() => 0)));
        const now = Date.now();
        return rooms
          .map(([id, r], i) => ({ id, name: r.name, host: r.host, created: r.created ?? 0, players: counts[i] }))
          .filter((r) => r.players > 0 || now - r.created < EMPTY_ROOM_TTL)
          .sort((a, b) => b.players - a.players || b.created - a.created);
      },
      async createRoom(name: string, host: string) {
        const r = push(ref(db, 'mp/rooms'));
        await set(r, { name, host, hostUid: uid(), created: serverTimestamp() });
        return r.key!;
      },
      async join(roomId: string): Promise<MpSession> {
        const me = uid();
        const room = (await get(ref(db, `mp/rooms/${roomId}`))).val() as { name: string } | null;
        if (!room) throw new Error('room gone');
        const onlineRef = ref(db, `mp/online/${roomId}/${me}`), meRef = ref(db, `mp/players/${roomId}/${me}`);
        await onDisconnect(onlineRef).remove();
        await onDisconnect(meRef).remove();
        await set(onlineRef, true);
        const players = new Map<string, RemotePlayer>();
        const listeners = new Set<(p: Map<string, RemotePlayer>) => void>();
        const emit = () => listeners.forEach((l) => l(players));
        const roomRef = ref(db, `mp/players/${roomId}`);
        const put = (id: string | null, val: PlayerState | null) => { if (!id || id === me || !val) return; players.set(id, { ...val, id, at: Date.now() }); emit(); };
        const offs = [
          onChildAdded(roomRef, (s) => put(s.key, s.val())),
          onChildChanged(roomRef, (s) => put(s.key, s.val())),
          onChildRemoved(roomRef, (s) => { if (s.key && players.delete(s.key)) emit(); }),
        ];
        const send = throttledSender((state) => { void set(meRef, state).catch(() => {}); });
        let left = false;
        let myName = '';
        const canChat = chatLimiter();
        const chatRef = ref(db, `mp/chat/${roomId}`);
        const post = (body: { text?: string; emote?: string }) => {
          if (left || !canChat()) return false;
          void push(chatRef, { uid: me, name: myName, at: serverTimestamp(), ...body }).catch(() => {});
          return true;
        };
        const chatListeners = new Set<(m: ChatMessage) => void>();
        const chatLog: ChatMessage[] = [];
        offs.push(onChildAdded(query(chatRef, limitToLast(20)), (snap) => {
          const v = snap.val() as { uid: string; name: string; text?: string; emote?: string; at: number };
          const m = safeMessage({ id: snap.key!, from: v.uid, name: v.name, text: v.text, emote: v.emote, at: v.at });
          if (!m) return;
          chatLog.push(m); if (chatLog.length > 20) chatLog.shift();
          chatListeners.forEach((l) => l(m));
        }));
        const leave = () => {
          if (left) return;
          left = true;
          offs.forEach((off) => off());
          void remove(meRef).catch(() => {});
          void remove(onlineRef).catch(() => {});
          window.removeEventListener('pagehide', leave);
        };
        window.addEventListener('pagehide', leave);
        return {
          roomId, roomName: room.name, myId: me,
          publish: (s) => { if (!left) { myName = s.name; send(s); } },
          sendChat: (text) => { const t = cleanText(text, CHAT_MAX); return t ? post({ text: t }) : false; },
          sendEmote: (emote) => ((EMOTES as readonly string[]).includes(emote) ? post({ emote }) : false),
          onChat: (cb) => { chatLog.forEach(cb); chatListeners.add(cb); return () => chatListeners.delete(cb); },
          onPlayers: (cb) => { listeners.add(cb); cb(players); return () => listeners.delete(cb); },
          leave,
        };
      },
    };
    return this.mp;
  }

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
