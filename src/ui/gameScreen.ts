import * as THREE from 'three';
import { MapControls } from 'three/examples/jsm/controls/MapControls.js';
import { createRenderer, fitToCanvas } from '../engine/renderer';
import { buildCity, type City } from '../game/city/cityBuilder';
import { createSky, skyEnvironment, SKY, Sun } from '../game/world/sky';
import { pickQuality, ResolutionScaler } from '../game/world/quality';
import { t } from '../i18n';
import { h, svgIcon } from './dom';
import type { Screen } from './screens';
import { toast } from './toast';

/** Step 4: explore the city (tour camera). Step 5 adds driving and walking. */
export const gameScreen: Screen = (root, nav) => {
  const canvas = h('canvas', { class: 'game-canvas' });
  const bar = h('div', { class: 'load-bar-fill' });
  const loading = h('div', { class: 'loading' },
    h('div', { class: 'loading-car' }, '🚗'),
    h('div', { class: 'loading-text' }, t('loadingCity')),
    h('div', { class: 'load-bar' }, bar),
  );
  const back = h('button', { class: 'icon-btn back-btn', 'aria-label': t('back'), onclick: () => nav('menu') },
    svgIcon('<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/>', 24));
  root.append(canvas, loading, back);

  const quality = pickQuality();
  const renderer = createRenderer(canvas, { shadows: true });
  const scaler = new ResolutionScaler(renderer, quality.maxPixelRatio);
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(SKY.horizon, quality.fogNear, quality.fogFar);
  scene.environment = skyEnvironment(renderer);
  scene.environmentIntensity = 0.7;
  scene.add(createSky());
  const sun = new Sun(renderer, quality.shadowSize, quality.shadowMap);
  sun.addTo(scene);

  const camera = new THREE.PerspectiveCamera(50, 1, 0.5, 6000);
  const controls = new MapControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.screenSpacePanning = false;
  controls.minDistance = 15;
  controls.maxDistance = 320;
  controls.maxPolarAngle = 1.3;
  controls.panSpeed = 1.2;

  let city: City | null = null;
  let disposed = false;
  let raf = 0;
  let last = performance.now();
  const bounds = 700;

  buildCity(quality, (p) => { bar.style.width = `${Math.round(p * 100)}%`; }).then((c) => {
    if (disposed) return c.dispose();
    city = c;
    scene.add(c.group);
    const s = c.layout.pois.spawn;
    controls.target.set(s.x, 0, s.z);
    camera.position.set(s.x + 70, 60, s.z + 90);
    controls.update();
    sun.follow(controls.target, true);
    loading.classList.add('done');
    toast(t('tourHint'));
  });

  if (import.meta.env.DEV) Object.assign(window, { carcityDebug: { camera, controls, scene, renderer, getCity: () => city } });

  const loop = () => {
    raf = requestAnimationFrame(loop);
    const now = performance.now();
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    fitToCanvas(renderer, camera);
    if (!city) return;
    controls.update();
    // Keep the camera above the city area.
    controls.target.x = THREE.MathUtils.clamp(controls.target.x, -bounds, bounds);
    controls.target.z = THREE.MathUtils.clamp(controls.target.z, -bounds, bounds);
    sun.follow(controls.target);
    city.update(camera.position, dt);
    scaler.update(dt);
    renderer.render(scene, camera);
  };
  loop();

  return () => {
    disposed = true;
    cancelAnimationFrame(raf);
    controls.dispose();
    city?.dispose();
    scene.environment?.dispose();
    renderer.dispose();
  };
};
