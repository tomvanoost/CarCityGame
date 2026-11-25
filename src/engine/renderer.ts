import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

export const isTouch = matchMedia('(pointer: coarse)').matches;

export interface RendererOptions {
  alpha?: boolean;
  shadows?: boolean;
}

/** Creates a renderer with good-looking, tablet-friendly defaults. */
export function createRenderer(canvas: HTMLCanvasElement, opts: RendererOptions = {}) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: !!opts.alpha,
    powerPreference: 'high-performance',
  });
  // Pixel ratio is the biggest performance knob: cap it on touch devices.
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, isTouch ? 1.5 : 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  if (opts.shadows) {
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  }
  return renderer;
}

/** Soft studio reflections for shiny materials (car paint, glass, chrome). */
export function studioEnvironment(renderer: THREE.WebGLRenderer): THREE.Texture {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();
  return env;
}

/** Keeps a renderer + camera sized to its canvas' CSS box. Returns true when resized. */
export function fitToCanvas(renderer: THREE.WebGLRenderer, camera: THREE.PerspectiveCamera): boolean {
  const c = renderer.domElement;
  const w = c.clientWidth;
  const h = c.clientHeight;
  if (!w || !h) return false;
  const size = renderer.getSize(new THREE.Vector2());
  if (size.x === w && size.y === h) return false;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  return true;
}

/** Frees GPU memory of everything below `root`. */
export function disposeObject(root: THREE.Object3D) {
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.geometry) mesh.geometry.dispose();
    const mats = mesh.material ? (Array.isArray(mesh.material) ? mesh.material : [mesh.material]) : [];
    for (const m of mats) {
      for (const v of Object.values(m)) if (v instanceof THREE.Texture) v.dispose();
      m.dispose();
    }
  });
}
