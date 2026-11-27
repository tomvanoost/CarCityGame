/** Horn shop (in the paint shop garage): fun horn sounds, synthesized in sounds.ts. Names in i18n as `horn_<id>`. */
export type HornId = 'normal' | 'duck' | 'bell' | 'clown' | 'train' | 'melody';

export interface Horn { id: HornId; emoji: string; price: number }

export const HORNS: Horn[] = [
  { id: 'normal', emoji: '📯', price: 0 },
  { id: 'duck', emoji: '🦆', price: 50 },
  { id: 'bell', emoji: '🔔', price: 50 },
  { id: 'clown', emoji: '🤡', price: 80 },
  { id: 'train', emoji: '🚂', price: 100 },
  { id: 'melody', emoji: '🎵', price: 150 },
];

export const isHorn = (id: unknown): id is HornId => HORNS.some((h) => h.id === id);
