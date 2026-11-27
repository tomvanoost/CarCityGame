import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { CityLayout } from '../city/layout';
import { groundHeight } from './collision';

/** Money for each right answer (each question pays once a day). */
export const QUIZ_REWARD = 10;
/** Questions per round. */
export const QUIZ_ROUND = 5;

/**
 * Picture quiz about the game world. The texts are in i18n as `quiz_<n>_q` (question), `quiz_<n>_a`
 * (the right answer) and `quiz_<n>_b` / `quiz_<n>_c` (wrong answers); `emoji` is the picture.
 */
export const QUIZ: { n: number; emoji: string }[] = [
  { n: 1, emoji: '🎈' }, { n: 2, emoji: '🍦' }, { n: 3, emoji: '🛣️' }, { n: 4, emoji: '🚦' },
  { n: 5, emoji: '🐐' }, { n: 6, emoji: '🎣' }, { n: 7, emoji: '🥐' }, { n: 8, emoji: '🌙' },
  { n: 9, emoji: '🏂' }, { n: 10, emoji: '⛽' }, { n: 11, emoji: '🗺️' }, { n: 12, emoji: '💎' },
  { n: 13, emoji: '🚗' }, { n: 14, emoji: '🏁' },
];

/** Today as "YYYY-MM-DD" (local time): quiz money is earned once a day per question. */
export function today(now = new Date()) {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

/** A round: `count` different random questions, each with its three answers shuffled (0 = right). */
export function quizRound(count = QUIZ_ROUND) {
  const pool = [...QUIZ].sort(() => Math.random() - 0.5).slice(0, count);
  return pool.map((q) => ({ ...q, order: (['a', 'b', 'c'] as const).slice().sort(() => Math.random() - 0.5) }));
}

function paint(g: THREE.BufferGeometry, color: string) {
  const geo = g.index ? g.toNonIndexed() : g;
  const c = new THREE.Color(color), n = geo.getAttribute('position').count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) a.set([c.r, c.g, c.b], i * 3);
  geo.setAttribute('color', new THREE.BufferAttribute(a, 3));
  geo.deleteAttribute('uv');
  return geo;
}

function signTexture() {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 104;
  const g = c.getContext('2d')!;
  g.fillStyle = '#23466e'; g.fillRect(0, 0, 512, 104);
  g.strokeStyle = '#f4d58d'; g.lineWidth = 6; g.strokeRect(6, 6, 500, 92);
  g.fillStyle = '#ffffff'; g.font = '900 50px Nunito, Arial, sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('📚 BIEB', 256, 54);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** The little library on the lake town square: brick walls, big windows with bookshelves, steps and a sign. */
export class LibraryBuilding {
  readonly group = new THREE.Group();

  constructor(layout: CityLayout) {
    const lb = layout.pois.library;
    const parts: THREE.BufferGeometry[] = [];
    const box = (w: number, h: number, d: number, x: number, y: number, z: number, color: string) => parts.push(paint(new THREE.BoxGeometry(w, h, d).translate(x, y, z), color));
    box(9, 5, 7, 0, 2.5, 0, '#b5563f'); // brick walls
    box(9.4, 0.4, 7.4, 0, 5.2, 0, '#e8dcc4'); // cornice
    box(8.6, 0.9, 6.6, 0, 5.85, 0, '#3e4a5a'); // flat roof edge
    // Two big windows full of colorful books, and the door between them.
    for (const x of [-2.6, 2.6]) {
      box(2.6, 2.4, 0.08, x, 2.4, 3.53, '#dfe9f2');
      for (let r = 0; r < 3; r++) for (let i = 0; i < 8; i++) {
        const col = ['#e5484d', '#1f8fe0', '#16b862', '#ffd400', '#8e5bd9', '#ff8a2b'][(i + r * 3) % 6];
        box(0.26, 0.55, 0.06, x - 1.05 + i * 0.3, 1.55 + r * 0.75, 3.58, col);
      }
      for (let r = 0; r < 3; r++) box(2.5, 0.06, 0.12, x, 1.25 + r * 0.75, 3.6, '#7a4a2a');
    }
    box(1.5, 2.8, 0.1, 0, 1.4, 3.54, '#2f5d8a'); // door
    box(0.12, 0.12, 0.12, 0.5, 1.4, 3.62, '#f4d58d'); // door knob
    box(2.6, 0.18, 1, 0, 0.09, 4.0, '#c9c2b4'); // steps
    box(2.2, 0.18, 0.6, 0, 0.27, 3.8, '#d6cfc1');
    // A giant open book on the roof.
    for (const s of [-1, 1]) parts.push(paint(new THREE.BoxGeometry(1.5, 0.08, 1.9).rotateZ(s * 0.35).translate(s * 0.72, 6.65, 0), '#ffffff'));
    box(0.12, 0.3, 1.9, 0, 6.45, 0, '#e5484d');
    const mesh = new THREE.Mesh(mergeGeometries(parts)!, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 }));
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 0.95), new THREE.MeshStandardMaterial({ map: signTexture(), roughness: 0.6 }));
    sign.position.set(0, 4.3, 3.56);
    this.group.add(mesh, sign);
    this.group.position.set(lb.x, groundHeight(lb.x, lb.z), lb.z);
    this.group.rotation.y = lb.rot;
  }

  dispose() {
    this.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      m.geometry.dispose();
      const mat = m.material as THREE.MeshStandardMaterial;
      mat.map?.dispose();
      mat.dispose();
    });
    this.group.removeFromParent();
  }
}
