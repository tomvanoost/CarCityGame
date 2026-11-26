/** Furniture for the apartment (see apartmentRoom.ts for where each piece stands). */
export const FURNITURE: { id: string; emoji: string; price: number }[] = [
  { id: 'sofa', emoji: '🛋️', price: 0 },
  { id: 'rug', emoji: '🟠', price: 0 },
  { id: 'table', emoji: '☕', price: 0 },
  { id: 'lamp', emoji: '💡', price: 60 },
  { id: 'plant', emoji: '🪴', price: 40 },
  { id: 'picture', emoji: '🖼️', price: 50 },
  { id: 'posterCar', emoji: '🏎️', price: 30 },
  { id: 'posterStar', emoji: '⭐', price: 30 },
  { id: 'shelf', emoji: '📚', price: 120 },
  { id: 'bed', emoji: '🛏️', price: 200 },
  { id: 'tv', emoji: '📺', price: 250 },
];
/** What a new apartment comes with. */
export const STARTER_FURNITURE = ['sofa', 'rug', 'table'];
/** What every apartment had before the furniture shop (kept for existing players). */
export const CLASSIC_FURNITURE = ['sofa', 'rug', 'table', 'lamp', 'plant', 'shelf', 'picture', 'tv'];
