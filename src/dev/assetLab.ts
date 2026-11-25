import * as THREE from 'three';
import { loadGltf } from '../engine/assets';
import { createRenderer, studioEnvironment } from '../engine/renderer';

/** Dev tool: /?assetlab=<folder> renders every model of public/_lab/<folder> in a labeled grid. */
export async function startAssetLab(folder: string, files: string[]) {
  document.body.innerHTML = '';
  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'position:fixed;inset:0;width:100%;height:100%';
  document.body.append(canvas);
  const renderer = createRenderer(canvas);
  renderer.setSize(innerWidth, innerHeight, false);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#dfeefc');
  scene.environment = studioEnvironment(renderer);
  const sun = new THREE.DirectionalLight('#fff', 2);
  sun.position.set(3, 6, 4);
  scene.add(new THREE.HemisphereLight('#fff', '#99a', 1), sun);
  const cols = Math.ceil(Math.sqrt(files.length * innerWidth / innerHeight));
  const rows = Math.ceil(files.length / cols);
  const cam = new THREE.PerspectiveCamera(30, (innerWidth / cols) / (innerHeight / rows), 0.01, 1000);
  renderer.setScissorTest(true);
  const labels = document.createElement('div');
  labels.style.cssText = 'position:fixed;inset:0;font:11px sans-serif;pointer-events:none';
  document.body.append(labels);
  const cw = innerWidth / cols, ch = innerHeight / rows;
  const loaded = await Promise.all(files.map((f) => loadGltf(`/_lab/${folder}/${f}`)));
  for (let i = 0; i < files.length; i++) {
    const obj = loaded[i].scene;
    scene.add(obj);
    const box = new THREE.Box3().setFromObject(obj);
    const size = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3());
    const r = size.length() * 0.75;
    cam.position.set(c.x + r * 0.8, c.y + r * 0.5, c.z + r * 1.1);
    cam.lookAt(c);
    const x = (i % cols) * cw, y = innerHeight - (Math.floor(i / cols) + 1) * ch;
    renderer.setViewport(x, y, cw, ch);
    renderer.setScissor(x, y, cw, ch);
    renderer.render(scene, cam);
    scene.remove(obj);
    const l = document.createElement('div');
    l.style.cssText = `position:absolute;left:${x + 3}px;top:${innerHeight - y - ch + 3}px;background:#fff8;padding:1px 3px`;
    l.textContent = `${files[i].replace('.glb', '')} ${size.x.toFixed(1)}×${size.y.toFixed(1)}×${size.z.toFixed(1)}`;
    labels.append(l);
  }
  document.title = 'ready';
}
