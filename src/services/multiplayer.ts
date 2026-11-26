/**
 * Multiplayer: servers ("rooms") that players create or pick from a list, and the live state of
 * everyone in a room (position, car or walking, outfit, siren, turn signals...).
 *
 * - With Firebase: rooms and players live in the Realtime Database (see database.rules.json);
 *   a player disappears automatically when the connection drops (onDisconnect).
 * - Demo mode (no Firebase): rooms are shared between browser tabs on this device
 *   (BroadcastChannel + localStorage), handy for trying it out and for tests.
 */

export interface RoomInfo {
  id: string;
  name: string;
  host: string;
  players: number;
  created: number;
}

/** What every player shares about themselves, a few times per second. */
export interface PlayerState {
  name: string;
  gender: 'boy' | 'girl';
  outfit: string;
  vehicle: string;
  color: string;
  mode: 'driving' | 'walking';
  x: number;
  z: number;
  /** Heading (radians). */
  h: number;
  /** Speed (m/s) of the car or the walker, for smooth movement and the walk/run animation. */
  v: number;
  siren: boolean;
  blink: 'left' | 'right' | null;
  /** Paint shop extras on the car: roof stripe and rim color ('' = none). */
  stripe?: string;
  rims?: string;
}

export interface RemotePlayer extends PlayerState {
  id: string;
  /** When we received it (ms, our clock). */
  at: number;
}

/** Quick emotes everyone can send (no typing needed). */
export const EMOTES = ['👋', '😀', '😂', '👍', '🎉', '❤️', '😮', '🚗'] as const;

/** A chat message or emote in a server. Text is cleaned by the sender AND again by every receiver. */
export interface ChatMessage {
  id: string;
  from: string;
  name: string;
  text?: string;
  emote?: string;
  at: number;
}
export const CHAT_MAX = 60;
const CHAT_KEEP = 20;
const CHAT_EVERY = 2000; // ms between messages from one player

/** Makes an incoming message safe to show (never trust the sender). */
export function safeMessage(m: Partial<ChatMessage> & { id: string }): ChatMessage | null {
  const name = cleanText(String(m.name ?? ''), 16);
  if (m.emote && (EMOTES as readonly string[]).includes(m.emote)) return { id: m.id, from: String(m.from ?? ''), name, emote: m.emote, at: Number(m.at) || Date.now() };
  const text = cleanText(String(m.text ?? ''), CHAT_MAX);
  return text ? { id: m.id, from: String(m.from ?? ''), name, text, at: Number(m.at) || Date.now() } : null;
}

/** Allows one message per CHAT_EVERY ms. */
export function chatLimiter() {
  let last = 0;
  return () => { const now = Date.now(); if (now - last < CHAT_EVERY) return false; last = now; return true; };
}

export interface MpSession {
  readonly roomId: string;
  readonly roomName: string;
  readonly myId: string;
  /** Share my state (throttled to ~6 per second; unchanged states are skipped). */
  publish(state: PlayerState): void;
  /** Everyone else in the room (called on every change). */
  onPlayers(cb: (players: Map<string, RemotePlayer>) => void): () => void;
  /** Send a chat line (cleaned; false if sent too soon after the last one) or a quick emote. */
  sendChat(text: string): boolean;
  sendEmote(emote: string): boolean;
  /** The last messages (on subscribe) and every new one. */
  onChat(cb: (m: ChatMessage) => void): () => void;
  leave(): void;
}

export interface MpService {
  listRooms(): Promise<RoomInfo[]>;
  createRoom(name: string, host: string): Promise<string>;
  join(roomId: string): Promise<MpSession>;
}

import { cleanText } from './textFilter';

/** Rooms nobody is in are hidden from the list after this long. */
export const EMPTY_ROOM_TTL = 10 * 60 * 1000;
const SEND_EVERY = 160; // ms

/** Rounds positions so tiny jiggles don't count as changes (and messages stay small). */
export function packState(s: PlayerState): PlayerState {
  const r = (n: number, d = 10) => Math.round(n * d) / d;
  return { ...s, x: r(s.x), z: r(s.z), h: r(s.h, 100), v: r(s.v) };
}

/** Calls `send` at most every SEND_EVERY ms, with the latest state, and only if it changed. */
export function throttledSender(send: (s: PlayerState) => void) {
  let last = '', pending: PlayerState | null = null, timer = 0, lastAt = 0;
  const flush = () => {
    timer = 0;
    if (!pending) return;
    const key = JSON.stringify(pending);
    if (key !== last) { last = key; lastAt = performance.now(); send(pending); }
    pending = null;
  };
  return (s: PlayerState) => {
    pending = packState(s);
    // A small "I'm still here" resend every 3 s even when standing still.
    if (performance.now() - lastAt > 3000) last = '';
    if (!timer) timer = window.setTimeout(flush, SEND_EVERY);
  };
}

// ---------------------------------------------------------------------------------------------
// Demo mode: browser tabs on this device.

const ROOMS_KEY = 'carcity.mp.rooms';

export class LocalMultiplayer implements MpService {
  private loadRooms(): Record<string, Omit<RoomInfo, 'players' | 'id'> & { seen: Record<string, number> }> {
    try { return JSON.parse(localStorage.getItem(ROOMS_KEY) || '{}'); } catch { return {}; }
  }
  private saveRooms(r: ReturnType<LocalMultiplayer['loadRooms']>) {
    try { localStorage.setItem(ROOMS_KEY, JSON.stringify(r)); } catch { /* ignore */ }
  }

  async listRooms(): Promise<RoomInfo[]> {
    const now = Date.now(), rooms = this.loadRooms();
    return Object.entries(rooms)
      .map(([id, r]) => ({ id, name: r.name, host: r.host, created: r.created, players: Object.values(r.seen ?? {}).filter((t) => now - t < 6000).length }))
      .filter((r) => r.players > 0 || now - r.created < EMPTY_ROOM_TTL)
      .sort((a, b) => b.players - a.players || b.created - a.created);
  }

  async createRoom(name: string, host: string) {
    const rooms = this.loadRooms();
    const id = Math.random().toString(36).slice(2, 10);
    rooms[id] = { name, host, created: Date.now(), seen: {} };
    this.saveRooms(rooms);
    return id;
  }

  async join(roomId: string): Promise<MpSession> {
    const rooms = this.loadRooms();
    const room = rooms[roomId];
    if (!room) throw new Error('room gone');
    const myId = Math.random().toString(36).slice(2, 10);
    const ch = new BroadcastChannel(`carcity-mp-${roomId}`);
    const players = new Map<string, RemotePlayer>();
    const listeners = new Set<(p: Map<string, RemotePlayer>) => void>();
    const emit = () => listeners.forEach((l) => l(players));
    const markSeen = () => {
      const r = this.loadRooms();
      if (r[roomId]) { r[roomId].seen = { ...r[roomId].seen, [myId]: Date.now() }; this.saveRooms(r); }
    };
    markSeen();
    const alive = window.setInterval(() => {
      markSeen();
      // Drop players we haven't heard from in a while (tab closed).
      let changed = false;
      for (const [id, p] of players) if (Date.now() - p.at > 6000) { players.delete(id); changed = true; }
      if (changed) emit();
    }, 2000);
    const chat: ChatMessage[] = [];
    const chatListeners = new Set<(m: ChatMessage) => void>();
    const gotChat = (raw: Partial<ChatMessage> & { id: string }) => {
      const m = safeMessage(raw);
      if (!m) return;
      chat.push(m); if (chat.length > CHAT_KEEP) chat.shift();
      chatListeners.forEach((l) => l(m));
    };
    ch.onmessage = (e: MessageEvent) => {
      const m = e.data as { type: 'state'; id: string; state: PlayerState } | { type: 'leave'; id: string } | { type: 'chat'; id: string; msg: ChatMessage };
      if (m.type === 'chat') { gotChat(m.msg); return; }
      if (m.id === myId) return;
      if (m.type === 'leave') players.delete(m.id);
      else players.set(m.id, { ...m.state, id: m.id, at: Date.now() });
      emit();
    };
    let left = false;
    const send = throttledSender((state) => { if (!left) ch.postMessage({ type: 'state', id: myId, state }); });
    const leave = () => {
      if (left) return;
      left = true;
      clearInterval(alive);
      ch.postMessage({ type: 'leave', id: myId });
      ch.close();
      const r = this.loadRooms();
      if (r[roomId]) { delete r[roomId].seen[myId]; this.saveRooms(r); }
      window.removeEventListener('pagehide', leave);
    };
    window.addEventListener('pagehide', leave);
    const canChat = chatLimiter();
    let myName = '';
    const post = (body: { text?: string; emote?: string }) => {
      if (left || !canChat()) return false;
      const msg = { id: Math.random().toString(36).slice(2), from: myId, name: myName, at: Date.now(), ...body };
      ch.postMessage({ type: 'chat', id: myId, msg });
      gotChat(msg); // BroadcastChannel doesn't echo to ourselves
      return true;
    };
    return {
      roomId, roomName: room.name, myId,
      publish: (st) => { myName = st.name; send(st); },
      sendChat: (text) => { const t = cleanText(text, CHAT_MAX); return t ? post({ text: t }) : false; },
      sendEmote: (emote) => ((EMOTES as readonly string[]).includes(emote) ? post({ emote }) : false),
      onChat: (cb) => { chat.forEach(cb); chatListeners.add(cb); return () => chatListeners.delete(cb); },
      onPlayers: (cb) => { listeners.add(cb); cb(players); return () => listeners.delete(cb); },
      leave,
    };
  }
}

// ---------------------------------------------------------------------------------------------
// The session the game should join (set by the multiplayer screen, read by the game screen).

let current: MpSession | null = null;
export const setCurrentSession = (s: MpSession | null) => { current = s; };
export const getCurrentSession = () => current;

// ---------------------------------------------------------------------------------------------
// Chat on/off (⚙️ Settings, saved on this device). Off: no typing and no text from others, only emotes.

const CHAT_KEY = 'carcity.chat';
export function loadChatOn(): boolean {
  try { return localStorage.getItem(CHAT_KEY) !== 'off'; } catch { return true; }
}
export function saveChatOn(on: boolean) {
  try { localStorage.setItem(CHAT_KEY, on ? 'on' : 'off'); } catch { /* private mode */ }
}
