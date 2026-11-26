import type * as THREE from 'three';
import { isTouch } from '../../engine/renderer';

export interface Quality {
  name: 'max' | 'high' | 'low' | 'fast';
  /** Smooth edges (costs GPU time). */
  antialias: boolean;
  maxPixelRatio: number;
  /** Lowest render scale the dynamic resolution may use. */
  minPixelRatio: number;
  people: number;
  traffic: number;
  shadowMap: number;
  shadowSize: number;
  fogNear: number;
  fogFar: number;
  buildingLod: number;
  natureLod: number;
  natureMax: number;
}

/** The player's choice in Settings (⚙️): "Kwaliteit" (max quality) or "Snel" (fast, more FPS). Saved on this device. */
export type QualityChoice = 'quality' | 'fast';
const QUALITY_KEY = 'carcity.quality';

export function loadQualityChoice(): QualityChoice | null {
  try {
    const v = localStorage.getItem(QUALITY_KEY);
    return v === 'quality' || v === 'pretty' ? 'quality' : v === 'fast' ? 'fast' : null; // 'pretty' = the old name
  } catch { return null; }
}

/** null = automatic again. */
export function saveQualityChoice(c: QualityChoice | null) {
  try { if (c) localStorage.setItem(QUALITY_KEY, c); else localStorage.removeItem(QUALITY_KEY); } catch { /* private mode: only for this visit */ }
}

const one = Math.min(1, window.devicePixelRatio);
const sharp = Math.min(2, window.devicePixelRatio);
const PRESETS: Record<Quality['name'], Quality> = {
  // "Kwaliteit": the sharpest picture the screen can show (never lowered), big soft shadows,
  // far view, more people and cars, more detailed buildings and trees further away.
  max: { name: 'max', antialias: true, maxPixelRatio: 2, minPixelRatio: sharp, people: 44, traffic: 16, shadowMap: 4096, shadowSize: 230, fogNear: 220, fogFar: 820, buildingLod: 230, natureLod: 120, natureMax: 430 },
  high: { name: 'high', antialias: true, maxPixelRatio: 2, minPixelRatio: one, people: 36, traffic: 12, shadowMap: 2048, shadowSize: 190, fogNear: 160, fogFar: 640, buildingLod: 150, natureLod: 80, natureMax: 330 },
  low: { name: 'low', antialias: true, maxPixelRatio: 1.5, minPixelRatio: one, people: 22, traffic: 8, shadowMap: 1024, shadowSize: 130, fogNear: 110, fogFar: 430, buildingLod: 100, natureLod: 50, natureMax: 220 },
  // "Snel": as many FPS as possible. Fewer pixels, no shadows, no edge smoothing, fewer people
  // and cars, a short view and simple buildings and trees close by.
  fast: { name: 'fast', antialias: false, maxPixelRatio: 0.8, minPixelRatio: 0.6, people: 8, traffic: 4, shadowMap: 0, shadowSize: 0, fogNear: 70, fogFar: 280, buildingLod: 55, natureLod: 25, natureMax: 130 },
};

/** The player's choice, or automatic: tablets/phones a lighter preset, desktops the full one. */
export function pickQuality(): Quality {
  const choice = loadQualityChoice();
  if (choice) return PRESETS[choice === 'quality' ? 'max' : 'fast'];
  return PRESETS[isTouch || navigator.hardwareConcurrency <= 4 ? 'low' : 'high'];
}

/**
 * Dynamic resolution: if the game runs slower than ~40 FPS, render fewer pixels;
 * when it's smooth again, go back up. It never goes below one render pixel per screen
 * pixel (the old 0.6 minimum made everything blurry on tablets that stay under the
 * "back up" threshold), so it only trades away extra sharpness on high-DPI screens.
 */
export class ResolutionScaler {
  private ratio: number;
  private frames = 0;
  private time = 0;

  constructor(private renderer: THREE.WebGLRenderer, private max: number, private min = Math.min(1, window.devicePixelRatio)) {
    this.ratio = Math.min(window.devicePixelRatio, max);
    renderer.setPixelRatio(this.ratio);
  }

  update(dt: number) {
    this.frames++;
    this.time += dt;
    if (this.time < 1.5) return;
    const fps = this.frames / this.time;
    this.frames = 0;
    this.time = 0;
    const target = Math.min(window.devicePixelRatio, this.max);
    let next = this.ratio;
    if (fps < 40) next = Math.max(this.min, this.ratio - 0.15);
    else if (fps > 50 && this.ratio < target) next = Math.min(target, this.ratio + 0.1);
    if (next !== this.ratio) {
      this.ratio = next;
      this.renderer.setPixelRatio(next);
    }
  }
}
