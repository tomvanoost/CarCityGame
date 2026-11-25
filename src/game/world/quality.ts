import type * as THREE from 'three';
import { isTouch } from '../../engine/renderer';

export interface Quality {
  name: 'high' | 'low' | 'fast';
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

/** The player's choice in the menu (⚙️): "Mooi" (pretty) or "Snel" (fast). Saved on this device. */
export type QualityChoice = 'pretty' | 'fast';
const QUALITY_KEY = 'carcity.quality';

export function loadQualityChoice(): QualityChoice | null {
  try { const v = localStorage.getItem(QUALITY_KEY); return v === 'pretty' || v === 'fast' ? v : null; } catch { return null; }
}

export function saveQualityChoice(c: QualityChoice) {
  try { localStorage.setItem(QUALITY_KEY, c); } catch { /* private mode: only for this visit */ }
}

const one = Math.min(1, window.devicePixelRatio);
const PRESETS: Record<Quality['name'], Quality> = {
  high: { name: 'high', maxPixelRatio: 2, minPixelRatio: one, people: 36, traffic: 12, shadowMap: 2048, shadowSize: 190, fogNear: 160, fogFar: 640, buildingLod: 150, natureLod: 80, natureMax: 330 },
  low: { name: 'low', maxPixelRatio: 1.5, minPixelRatio: one, people: 22, traffic: 8, shadowMap: 1024, shadowSize: 130, fogNear: 110, fogFar: 430, buildingLod: 100, natureLod: 50, natureMax: 220 },
  // "Snel": for slow tablets. Fewer pixels, small shadows, fewer people and cars, shorter view.
  fast: { name: 'fast', maxPixelRatio: 1, minPixelRatio: 0.75, people: 12, traffic: 5, shadowMap: 512, shadowSize: 90, fogNear: 90, fogFar: 340, buildingLod: 70, natureLod: 35, natureMax: 160 },
};

/** The player's choice, or automatic: tablets/phones a lighter preset, desktops the full one. */
export function pickQuality(): Quality {
  const choice = loadQualityChoice();
  if (choice) return PRESETS[choice === 'pretty' ? 'high' : 'fast'];
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
