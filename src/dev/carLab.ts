import * as THREE from 'three';
import { createRenderer, studioEnvironment } from '../engine/renderer';
import { buildCar } from '../game/vehicles/carBuilder';
import { getVehicle } from '../game/vehicles/catalog';

/**
 * Developer tool for designing car shapes: open /?carlab=<vehicle-id>.
 * Shows the car from four angles at once. Not linked from the game UI.
 */
export function startCarLab(id: string) {
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
  const car = buildCar(spec.shape, new URLSearchParams(location.search).get('color') ?? spec.color);
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
