import type { Gender } from '../../services/types';
import type { GearPiece } from './gear';

export type OutfitModel =
  | 'Casual' | 'Casual2' | 'Casual3' | 'Chef' | 'Cowboy' | 'Kimono'
  | 'OldClassy' | 'Suit' | 'Worker' | 'Pirate' | 'Viking' | 'Ninja';

export interface ClothesItem {
  id: string;
  model: OutfitModel;
  name: { nl: string; en: string };
  price: number;
  /** Material name -> color, applied on top of the model's own colors. */
  colors?: Record<string, string>;
  /** Hero extras attached to the character (cape, helmet, jetpack...). */
  gear?: GearPiece[];
  /** Shown with a star in the shop. */
  hero?: boolean;
}

/** Every player owns this outfit from the start. */
export const DEFAULT_OUTFIT = 'casual-blue';

export const CLOTHES: ClothesItem[] = [
  { id: 'casual-blue', model: 'Casual', name: { nl: 'Vrijetijds blauw', en: 'Casual blue' }, price: 0, colors: { Shirt: '#3d7bd9', Pants: '#3b3f4a' } },
  { id: 'casual-red', model: 'Casual', name: { nl: 'Vrijetijds rood', en: 'Casual red' }, price: 150, colors: { Shirt: '#e0473b', Pants: '#2e3a59' } },
  { id: 'casual-green', model: 'Casual', name: { nl: 'Vrijetijds groen', en: 'Casual green' }, price: 150, colors: { Shirt: '#3fb36b', Pants: '#4a3b2e' } },
  { id: 'hoodie-purple', model: 'Casual2', name: { nl: 'Hoodie paars', en: 'Hoodie purple' }, price: 250, colors: { Shirt: '#8e5bd9', Pants: '#26324d' } },
  { id: 'hoodie-orange', model: 'Casual2', name: { nl: 'Hoodie oranje', en: 'Hoodie orange' }, price: 250, colors: { Shirt: '#f08a24', Pants: '#2b2b2b' } },
  { id: 'sporty-white', model: 'Casual3', name: { nl: 'Sportief wit', en: 'Sporty white' }, price: 300, colors: { Shirt: '#f2f2f2', Pants: '#36404f' } },
  { id: 'sporty-pink', model: 'Casual3', name: { nl: 'Sportief roze', en: 'Sporty pink' }, price: 300, colors: { Shirt: '#ff7eb6', Pants: '#3a3550' } },
  { id: 'worker', model: 'Worker', name: { nl: 'Bouwvakker', en: 'Builder' }, price: 400 },
  { id: 'chef', model: 'Chef', name: { nl: 'Kok', en: 'Chef' }, price: 500 },
  { id: 'cowboy', model: 'Cowboy', name: { nl: 'Cowboy', en: 'Cowboy' }, price: 650 },
  { id: 'classy', model: 'OldClassy', name: { nl: 'Chique', en: 'Classy' }, price: 700 },
  { id: 'kimono', model: 'Kimono', name: { nl: 'Kimono', en: 'Kimono' }, price: 750, colors: { Clothes: '#e8e2d5', Band: '#c0392b' } },
  { id: 'suit', model: 'Suit', name: { nl: 'Pak', en: 'Suit' }, price: 900 },
  { id: 'pirate', model: 'Pirate', name: { nl: 'Piraat', en: 'Pirate' }, price: 1000 },
  { id: 'viking', model: 'Viking', name: { nl: 'Viking', en: 'Viking' }, price: 1100 },
  { id: 'ninja', model: 'Ninja', name: { nl: 'Ninja', en: 'Ninja' }, price: 1200 },
  // --- hero outfits: bold colors + extras, original designs ---
  { id: 'hero-skater', model: 'Casual2', hero: true, name: { nl: 'Skater', en: 'Skater' }, price: 1400,
    colors: { Shirt: '#7ed321', Pants: '#2b2f6b', Belt: '#ffd34d' }, gear: [{ kind: 'capBackwards', color: '#ff4f8b', color2: '#ffffff' }] },
  { id: 'hero-racer', model: 'Casual', hero: true, name: { nl: 'Coureur', en: 'Racing driver' }, price: 1500,
    colors: { Shirt: '#e8262b', Pants: '#e8262b', Belt: '#1b1b1b' }, gear: [{ kind: 'cap', color: '#1b1b1b', color2: '#e8262b' }] },
  { id: 'hero-pilot', model: 'Casual3', hero: true, name: { nl: 'Piloot', en: 'Pilot' }, price: 1600,
    colors: { Shirt: '#7a5236', Pants: '#3e4a3a', Belt: '#2b1d14' }, gear: [{ kind: 'goggles', color: '#7fd3ff', color2: '#5a3a22' }, { kind: 'backpack', color: '#5a3a22', color2: '#3e4a3a' }] },
  { id: 'hero-explorer', model: 'Cowboy', hero: true, name: { nl: 'Ontdekkingsreiziger', en: 'Explorer' }, price: 1700,
    colors: { Jacket: '#b59b62', Top: '#f2e6c8', Scarf: '#2e9b5f', HatBrown: '#c8a46a', HatLightBrown: '#e6cfa0', Pants: '#6b5a3a' },
    gear: [{ kind: 'backpack', color: '#3f7d4f', color2: '#8a6a3a' }] },
  { id: 'hero-super', model: 'Casual3', hero: true, name: { nl: 'Superheld', en: 'Superhero' }, price: 1800,
    colors: { Shirt: '#1f5fe0', Pants: '#1f3fa0', Belt: '#ffd34d' }, gear: [{ kind: 'cape', color: '#e8262b' }] },
  { id: 'hero-neon-ninja', model: 'Ninja', hero: true, name: { nl: 'Neon-ninja', en: 'Neon ninja' }, price: 1900,
    colors: { Main: '#14b8a6', Details: '#ffd34d', Grey: '#f2f2f2' }, gear: [{ kind: 'cape', color: '#ffd34d' }] },
  { id: 'hero-robot', model: 'Suit', hero: true, name: { nl: 'Robotpak', en: 'Robot suit' }, price: 2100,
    colors: { Black: '#6b7f99', Shirt: '#cfd8e3', Details: '#22c1ff', Belt: '#22c1ff' },
    gear: [{ kind: 'antenna', color: '#ff4f8b', color2: '#cfd8e3' }, { kind: 'jetpack', color: '#cfd8e3', color2: '#22c1ff' }] },
  // --- emergency services (go with the police car, fire truck and ambulance) ---
  { id: 'job-police', model: 'Suit', hero: true, name: { nl: 'Politie', en: 'Police' }, price: 2000,
    colors: { Black: '#1d2f5c', Shirt: '#bcd4f2', Details: '#1d2f5c', Belt: '#15181f' },
    gear: [{ kind: 'peakedCap', color: '#1d2f5c', color2: '#ffd34d' }] },
  { id: 'job-fire', model: 'Worker', hero: true, name: { nl: 'Brandweer', en: 'Firefighter' }, price: 2000,
    colors: { Shirt: '#2b2f38', Vest: '#e8c04a', Pants: '#2b2f38', Hat: '#d0101c' },
    gear: [{ kind: 'jetpack', color: '#c8ccd2', color2: '#d0101c' }] },
  { id: 'job-ambulance', model: 'Casual3', hero: true, name: { nl: 'Ambulance', en: 'Paramedic' }, price: 2000,
    colors: { Shirt: '#f2e600', Pants: '#22325a', Belt: '#15181f' },
    gear: [{ kind: 'backpack', color: '#2fa84f', color2: '#ffffff' }] },
  { id: 'hero-astronaut', model: 'Worker', hero: true, name: { nl: 'Astronaut', en: 'Astronaut' }, price: 2400,
    colors: { Shirt: '#f4f5f7', Vest: '#ff8a2b', Pants: '#f4f5f7', Hat: '#f4f5f7' },
    gear: [{ kind: 'bubbleHelmet', color: '#d8ecff' }, { kind: 'jetpack', color: '#f4f5f7', color2: '#ff8a2b' }] },
];

export const getClothes = (id: string | null | undefined) =>
  CLOTHES.find((c) => c.id === id) ?? CLOTHES.find((c) => c.id === DEFAULT_OUTFIT)!;

export const outfitUrl = (model: OutfitModel, gender: Gender) =>
  `/models/characters/${model}_${gender === 'girl' ? 'Female' : 'Male'}.glb`;

export const animsUrl = (gender: Gender) => `/models/characters/anims_${gender === 'girl' ? 'female' : 'male'}.glb`;
