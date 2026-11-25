import * as THREE from 'three';
import { createRenderer, disposeObject, fitToCanvas, studioEnvironment } from '../engine/renderer';
import type { BuiltCar } from './vehicles/carBuilder';
import { buildVehicle, vehicleDims } from './vehicles/factory';
import { getVehicle } from './vehicles/catalog';

/** Menu backdrop: the selected car on a slowly turning platform. Drag to spin it. */
export class Showroom {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
  private turntable = new THREE.Group();
  private car?: BuiltCar;
  private carId = '';
  private raf = 0;
  private last = performance.now();
  private spin = 0.25; // rad/s
  private dragX: number | null = null;
  private popIn = 1;
  /** Camera distance factor: smaller vehicles are shown closer. */
  private zoom = 1;
  /** Moves the vehicle up on screen (in meters of camera aim), e.g. above a bottom panel. */
  lift = 0;

  constructor(private canvas: HTMLCanvasElement) {
    this.renderer = createRenderer(canvas, { shadows: true });
    this.scene.environment = studioEnvironment(this.renderer);
    this.scene.environmentIntensity = 0.9;
    this.scene.background = new THREE.Color('#bfe0ff');
    this.scene.fog = new THREE.Fog('#bfe0ff', 14, 32);

    const hemi = new THREE.HemisphereLight('#ffffff', '#9cc4ea', 0.9);
    const sun = new THREE.DirectionalLight('#ffffff', 2.2);
    sun.position.set(4, 8, 5);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.left = sun.shadow.camera.bottom = -4;
    sun.shadow.camera.right = sun.shadow.camera.top = 4;
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 20;
    sun.shadow.bias = -0.0005;
    sun.shadow.radius = 4;
    this.scene.add(hemi, sun);

    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(40, 48).rotateX(-Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: '#dcecfb', roughness: 0.85 }),
    );
    floor.receiveShadow = true;
    const plate = new THREE.Mesh(
      new THREE.CylinderGeometry(3.3, 3.4, 0.08, 64),
      new THREE.MeshPhysicalMaterial({ color: '#ffffff', roughness: 0.25, clearcoat: 0.6 }),
    );
    plate.position.y = 0.04;
    plate.receiveShadow = true;
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(3.36, 0.03, 8, 96).rotateX(Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: '#2f8bff', emissive: '#2f8bff', emissiveIntensity: 0.8 }),
    );
    ring.position.y = 0.075;
    this.turntable.position.y = 0.08;
    this.scene.add(floor, plate, ring, this.turntable);

    canvas.addEventListener('pointerdown', this.onDown);
    window.addEventListener('pointermove', this.onMove);
    window.addEventListener('pointerup', this.onUp);
    this.loop();
  }

  showVehicle(id: string, color?: string) {
    if (id === this.carId) {
      if (color) this.car?.setColor(color);
      return;
    }
    this.carId = id;
    this.car?.dispose();
    const spec = getVehicle(id);
    this.car = buildVehicle(spec, color ?? spec.color);
    const d = vehicleDims(spec);
    this.zoom = d.isBike ? 0.55 : Math.max(0.8, d.length / 4.4);
    this.frame();
    this.turntable.add(this.car.root);
    this.popIn = 0;
  }

  private onDown = (e: PointerEvent) => { this.dragX = e.clientX; };
  private onMove = (e: PointerEvent) => {
    if (this.dragX === null) return;
    this.turntable.rotation.y += (e.clientX - this.dragX) * 0.01;
    this.dragX = e.clientX;
  };
  private onUp = () => { this.dragX = null; };

  /** Re-aims the camera (call after changing `lift`). */
  frame() {
    const portrait = this.camera.aspect < 1;
    // Frame the car: further away on narrow (portrait) screens.
    const dist = (portrait ? 9.5 / Math.max(this.camera.aspect, 0.42) : 9.5) * this.zoom;
    this.camera.position.set(dist * 0.62, dist * 0.24, dist * 0.78);
    this.camera.lookAt(0, ((portrait ? 1.1 : 0.45) - (portrait ? this.lift : 0)) * this.zoom, 0);
  }

  private loop = () => {
    this.raf = requestAnimationFrame(this.loop);
    const now = performance.now();
    const dt = Math.min((now - this.last) / 1000, 0.1);
    this.last = now;
    if (fitToCanvas(this.renderer, this.camera)) this.frame();
    if (this.dragX === null) this.turntable.rotation.y += this.spin * dt;
    if (this.car && this.popIn < 1) {
      this.popIn = Math.min(1, this.popIn + dt * 3);
      const s = 1 - Math.pow(1 - this.popIn, 3);
      this.car.root.scale.setScalar(0.85 + 0.15 * s);
      this.car.root.position.y = (1 - s) * 0.4;
    }
    this.renderer.render(this.scene, this.camera);
  };

  dispose() {
    cancelAnimationFrame(this.raf);
    this.canvas.removeEventListener('pointerdown', this.onDown);
    window.removeEventListener('pointermove', this.onMove);
    window.removeEventListener('pointerup', this.onUp);
    this.car?.dispose();
    disposeObject(this.scene);
    this.scene.environment?.dispose();
    this.renderer.dispose();
  }
}
