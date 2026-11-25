import type * as THREE from 'three';
import { isTouch } from '../../engine/renderer';

export interface Quality {
  name: 'high' | 'low';
  maxPixelRatio: number;
  shadowMap: number;
  shadowSize: number;
  fogNear: number;
  fogFar: number;
  buildingLod: number;
  natureLod: number;
  natureMax: number;
}

/** Tablets/phones get a lighter preset; desktops the full one. */
export function pickQuality(): Quality {
  const low = isTouch || navigator.hardwareConcurrency <= 4;
  return low
    ? { name: 'low', maxPixelRatio: 1.5, shadowMap: 1024, shadowSize: 130, fogNear: 110, fogFar: 430, buildingLod: 100, natureLod: 50, natureMax: 220 }
    : { name: 'high', maxPixelRatio: 2, shadowMap: 2048, shadowSize: 190, fogNear: 160, fogFar: 640, buildingLod: 150, natureLod: 80, natureMax: 330 };
}

/**
 * Dynamic resolution: if the game runs slower than ~45 FPS, render fewer pixels;
 * when it's smooth again, go back up. Keeps the game fluid on every device.
 */
export class ResolutionScaler {
  private ratio: number;
  private frames = 0;
  private time = 0;

  constructor(private renderer: THREE.WebGLRenderer, private max: number, private min = 0.6) {
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
    if (fps < 45) next = Math.max(this.min, this.ratio - 0.15);
    else if (fps > 58 && this.ratio < target) next = Math.min(target, this.ratio + 0.1);
    if (next !== this.ratio) {
      this.ratio = next;
      this.renderer.setPixelRatio(next);
    }
  }
}
