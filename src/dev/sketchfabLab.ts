import * as THREE from 'three';
import { loadGltf } from '../engine/assets';
import { createRenderer, studioEnvironment } from '../engine/renderer';
import { SKETCHFAB_CITY } from '../game/city/sketchfabCity';
import { SKETCHFAB_VEHICLES } from '../game/vehicles/sketchfabManifest';

/**
 * Dev tool: /?sflab=1 (or 2) shows the processed Sketchfab vehicles in a grid, front-right view.
 * Add &lod=1 to see the light (traffic) versions, &view=front to look straight at the nose. A red line on the ground marks +Z (the front).
 */
export async function startSketchfabLab(page: number, lod: boolean, view = '') {
  document.body.innerHTML = '';
  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'position:fixed;inset:0;width:100%;height:100%';
  document.body.append(canvas);
  const renderer = createRenderer(canvas);
  renderer.setSize(innerWidth, innerHeight, false);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#dbe9f7');
  scene.environment = studioEnvironment(renderer);
  const sun = new THREE.DirectionalLight('#fff', 2);
  sun.position.set(4, 8, 5);
  scene.add(new THREE.HemisphereLight('#fff', '#9cc4ea', 0.9), sun);
  const front = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.02, 3).translate(0, 0, 1.5), new THREE.MeshBasicMaterial({ color: 'red' }));
  scene.add(front);
  const ids = Object.keys(SKETCHFAB_VEHICLES).slice((page - 1) * 20, page * 20);
  const cols = 5, rows = Math.ceil(ids.length / cols);
  const w = innerWidth / cols, h = innerHeight / rows;
  const cam = new THREE.PerspectiveCamera(26, w / h, 0.1, 200);
  renderer.setScissorTest(true);
  const labels = document.createElement('div');
  labels.style.cssText = 'position:fixed;inset:0;font:12px sans-serif;pointer-events:none';
  document.body.append(labels);
  const loaded = await Promise.all(ids.map((id) => loadGltf(`/models/vehicles/${id}${lod ? '_lod' : ''}.glb`)));
  ids.forEach((id, i) => {
    const m = SKETCHFAB_VEHICLES[id];
    const obj = loaded[i].scene;
    if (lod) obj.traverse((o) => { const mm = (o as THREE.Mesh).material as THREE.MeshStandardMaterial; if (mm) { mm.flatShading = true; mm.vertexColors = true; mm.needsUpdate = true; } });
    scene.add(obj);
    const x = (i % cols) * w, y = innerHeight - (Math.floor(i / cols) + 1) * h;
    renderer.setViewport(x, y, w, h);
    renderer.setScissor(x, y, w, h);
    const d = m.bike ? 4.4 : 8.8;
    // &view=front: straight at the nose, to spot models that face backwards.
    if (view === 'front') cam.position.set(0, d * 0.18, d * 0.95);
    else cam.position.set(d * 0.62, d * 0.3, d * 0.75);
    cam.lookAt(0, m.height * 0.45, 0);
    renderer.render(scene, cam);
    scene.remove(obj);
    const l = document.createElement('div');
    l.style.cssText = `position:absolute;left:${x + 4}px;top:${innerHeight - y - h + 4}px;background:#fff9;padding:1px 4px`;
    l.textContent = `${id} ${m.length.toFixed(1)}×${m.width.toFixed(1)}×${m.height.toFixed(1)}`;
    labels.append(l);
  });
  document.title = 'ready';
}

/** /?cflab=1 : processed Sketchfab city models (close-up versions; &lod=1 for far versions). */
export async function startCityLab(lod: boolean) {
  document.body.innerHTML = '';
  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'position:fixed;inset:0;width:100%;height:100%';
  document.body.append(canvas);
  const renderer = createRenderer(canvas);
  renderer.setSize(innerWidth, innerHeight, false);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#dbe9f7');
  scene.environment = studioEnvironment(renderer);
  const sun = new THREE.DirectionalLight('#fff', 2);
  sun.position.set(4, 8, 5);
  scene.add(new THREE.HemisphereLight('#fff', '#9cc4ea', 0.9), sun);
  const ids = Object.keys(SKETCHFAB_CITY).filter((id) => !lod || SKETCHFAB_CITY[id].lod);
  const cols = 6, rows = Math.ceil(ids.length / cols);
  const w = innerWidth / cols, h = innerHeight / rows;
  const cam = new THREE.PerspectiveCamera(30, w / h, 0.1, 5000);
  renderer.setScissorTest(true);
  const labels = document.createElement('div');
  labels.style.cssText = 'position:fixed;inset:0;font:11px sans-serif;pointer-events:none';
  document.body.append(labels);
  const loaded = await Promise.all(ids.map((id) => loadGltf(`/models/city-sf/${id}${lod ? '_lod' : ''}.glb`).catch(() => null)));
  ids.forEach((id, i) => {
    const m = SKETCHFAB_CITY[id];
    const x = (i % cols) * w, y = innerHeight - (Math.floor(i / cols) + 1) * h;
    const l = document.createElement('div');
    l.style.cssText = `position:absolute;left:${x + 3}px;top:${innerHeight - y - h + 3}px;background:#fff9;padding:1px 3px`;
    l.textContent = `${id} ${m.x.toFixed(0)}x${m.y.toFixed(0)}x${m.z.toFixed(0)}`;
    labels.append(l);
    const g = loaded[i];
    if (!g) return;
    const obj = g.scene;
    if (lod) obj.traverse((o) => { const mm = (o as THREE.Mesh).material as THREE.MeshStandardMaterial; if (mm) { mm.flatShading = true; mm.vertexColors = true; mm.needsUpdate = true; } });
    scene.add(obj);
    renderer.setViewport(x, y, w, h);
    renderer.setScissor(x, y, w, h);
    // Frame the real bounds of the loaded model (the manifest sizes are placement sizes).
    const box = new THREE.Box3().setFromObject(obj), size = box.getSize(new THREE.Vector3()), mid = box.getCenter(new THREE.Vector3());
    const r = Math.max(size.x, size.y, size.z) * 1.7;
    cam.position.set(mid.x + r * 0.55, mid.y + r * 0.3, mid.z + r * 1.0);
    cam.lookAt(mid);
    renderer.render(scene, cam);
    scene.remove(obj);
  });
  document.title = 'ready';
}
