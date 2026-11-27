/**
 * The little photo album: the last photos you took (small JPEGs) in this browser. A convenience only:
 * it can be empty (private window, cleared data) and the game works the same without it.
 */
const KEY = 'carcity.photos';
const MAX = 12;

export interface Photo { at: number; src: string }

export function loadPhotos(): Photo[] {
  try {
    const list = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(list) ? list.filter((p) => p && typeof p.src === 'string' && p.src.startsWith('data:image/')) : [];
  } catch { return []; }
}

/** Adds a photo at the front (oldest ones drop off; if storage is full, keeps fewer). */
export function addPhoto(src: string) {
  let list = [{ at: Date.now(), src }, ...loadPhotos()].slice(0, MAX);
  while (list.length) {
    try { localStorage.setItem(KEY, JSON.stringify(list)); return; } catch { list = list.slice(0, -1); }
  }
}

/** Downloads a picture (data URL) as a file. */
export function downloadPhoto(src: string, at = Date.now()) {
  const d = new Date(at), pad = (n: number) => String(n).padStart(2, '0');
  const a = document.createElement('a');
  a.href = src;
  a.download = `carcity-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}.jpg`;
  document.body.append(a);
  a.click();
  a.remove();
}
