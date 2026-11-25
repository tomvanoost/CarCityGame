import type { Gender } from '../../services/types';

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
];

export const getClothes = (id: string | null | undefined) =>
  CLOTHES.find((c) => c.id === id) ?? CLOTHES.find((c) => c.id === DEFAULT_OUTFIT)!;

export const outfitUrl = (model: OutfitModel, gender: Gender) =>
  `/models/characters/${model}_${gender === 'girl' ? 'Female' : 'Male'}.glb`;

export const animsUrl = (gender: Gender) => `/models/characters/anims_${gender === 'girl' ? 'female' : 'male'}.glb`;
