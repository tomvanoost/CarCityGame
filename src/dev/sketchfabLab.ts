import * as THREE from 'three';
import { loadGltf } from '../engine/assets';
import { createRenderer, studioEnvironment } from '../engine/renderer';
import { SKETCHFAB_VEHICLES } from '../game/vehicles/sketchfabManifest';

/**
 * Dev tool: /?sflab=1 (or 2) shows the processed Sketchfab vehicles in a grid, front-right view.
 * Add &lod=1 to see the light (traffic) versions. A red line on the ground marks +Z (the front).
 */
export async function startSketchfabLab(page: number, lod: boolean) {
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
    cam.position.set(d * 0.62, d * 0.3, d * 0.75);
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
