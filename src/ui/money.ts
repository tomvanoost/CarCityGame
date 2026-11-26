/** Short number suffixes: thousand, million, billion, trillion, quadrillion, quintillion, ... */
const SUFFIXES = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc'];

/**
 * Short money amounts: 950 → "950", 1634 → "1.6K", 2 300 000 → "2.3M", 1.2e9 → "1.2B", 4e12 → "4T".
 * Rounded down, so it never shows more than you really have.
 */
export function compactNumber(n: number): string {
  const sign = n < 0 ? '-' : '';
  let v = Math.floor(Math.abs(n));
  if (v < 1000) return sign + v;
  let i = 0;
  while (v >= 1000 && i < SUFFIXES.length - 1) { v /= 1000; i++; }
  const shown = v >= 100 ? Math.floor(v) : Math.floor(v * 10) / 10;
  return `${sign}${shown}${SUFFIXES[i]}`;
}

/** Money as shown everywhere in the game: "€ 1.6K". */
export const euro = (n: number) => `€ ${compactNumber(n)}`;
