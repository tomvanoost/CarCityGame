import * as THREE from 'three';
import { createRenderer, studioEnvironment } from '../engine/renderer';
import { buildVehicle } from '../game/vehicles/factory';
import { VEHICLES, getVehicle, vehicleName } from '../game/vehicles/catalog';

/**
 * Developer tool for designing car shapes: open /?carlab=<vehicle-id>.
 * Shows the car from four angles at once. Not linked from the game UI.
 */
/** /?carlab=all : every vehicle in a labeled grid (3/4 front view). */
function startAll(start = 0) {
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
  const list = VEHICLES.slice(start, start + 20);
  const cols = 5, rows = Math.ceil(list.length / cols);
  const w = innerWidth / cols, h = innerHeight / rows;
  const cam = new THREE.PerspectiveCamera(26, w / h, 0.1, 100);
  renderer.setScissorTest(true);
  const labels = document.createElement('div');
  labels.style.cssText = 'position:fixed;inset:0;font:12px sans-serif;pointer-events:none';
  document.body.append(labels);
  list.forEach((spec, i) => {
    const car = buildVehicle(spec);
    scene.add(car.root);
    const x = (i % cols) * w, y = innerHeight - (Math.floor(i / cols) + 1) * h;
    renderer.setViewport(x, y, w, h);
    renderer.setScissor(x, y, w, h);
    const d = spec.bike ? 4.2 : 8.5;
    cam.position.set(d * 0.62, d * 0.3, d * 0.75);
    cam.lookAt(0, 0.6, 0);
    renderer.render(scene, cam);
    car.dispose();
    const l = document.createElement('div');
    l.style.cssText = `position:absolute;left:${x + 4}px;top:${innerHeight - y - h + 4}px;background:#fff9;padding:1px 4px`;
    l.textContent = `${vehicleName(spec)} €${spec.price}`;
    labels.append(l);
  });
  document.title = 'ready';
}

export function startCarLab(id: string) {
  if (id === 'all' || id === 'all2') return startAll(id === 'all2' ? 20 : 0);
  document.body.innerHTML = '';
  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'position:fixed;inset:0;width:100%;height:100%';
  document.body.append(canvas);
  const renderer = createRenderer(canvas, { shadows: true });
  renderer.setSize(innerWidth, innerHeight, false);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#cfe5fb');
  scene.environment = studioEnvironment(renderer);
  const sun = new THREE.DirectionalLight('#fff', 2.2);
  sun.position.set(4, 8, 5);
  sun.castShadow = true;
  scene.add(new THREE.HemisphereLight('#fff', '#9cc4ea', 0.9), sun);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(30, 30).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#e6eef7' }));
  floor.receiveShadow = true;
  scene.add(floor);
  const spec = getVehicle(id);
  const car = buildVehicle(spec, new URLSearchParams(location.search).get('color') ?? spec.color);
  scene.add(car.root);

  const cam = new THREE.PerspectiveCamera(28, innerWidth / innerHeight, 0.1, 100);
  const views: [number, number, number][] = [[6.5, 2.2, 7.5], [10, 1.2, 0.01], [-6, 2.4, -7], [0.01, 1.4, 10]];
  const w = innerWidth / 2, h = innerHeight / 2;
  cam.aspect = w / h;
  cam.updateProjectionMatrix();
  renderer.setScissorTest(true);
  views.forEach((v, i) => {
    const x = (i % 2) * w, y = (i < 2 ? 1 : 0) * h;
    renderer.setViewport(x, y, w, h);
    renderer.setScissor(x, y, w, h);
    cam.position.set(...v);
    cam.lookAt(0, 0.65, 0);
    renderer.render(scene, cam);
  });
  document.title = 'ready';
}
