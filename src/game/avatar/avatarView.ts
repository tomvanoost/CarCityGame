import * as THREE from 'three';
import { createRenderer, fitToCanvas, studioEnvironment } from '../../engine/renderer';
import type { Gender } from '../../services/types';
import { Avatar } from './avatar';

/** Small transparent canvas that shows the player's avatar (menu card, clothes shop). */
export class AvatarView {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(30, 1, 0.1, 20);
  private avatar?: Avatar;
  private raf = 0;
  private last = performance.now();
  private loadId = 0;
  private disposed = false;

  constructor(private canvas: HTMLCanvasElement) {
    this.renderer = createRenderer(canvas, { alpha: true });
    this.renderer.setClearColor(0x000000, 0);
    this.scene.environment = studioEnvironment(this.renderer);
    this.scene.environmentIntensity = 0.6;
    const key = new THREE.DirectionalLight('#ffffff', 2.4);
    key.position.set(1.5, 3, 3);
    const rim = new THREE.DirectionalLight('#9fd0ff', 1.4);
    rim.position.set(-2, 2, -2);
    this.scene.add(new THREE.HemisphereLight('#ffffff', '#88a', 1.1), key, rim);
    this.camera.position.set(0, 1.05, 3.9);
    this.camera.lookAt(0, 0.88, 0);
    canvas.addEventListener('click', this.cheer);
    this.loop();
  }

  async show(gender: Gender, outfitId: string | null) {
    const id = ++this.loadId;
    const avatar = await Avatar.create(gender, outfitId);
    if (id !== this.loadId || this.disposed) return avatar.dispose();
    this.avatar?.dispose();
    this.avatar = avatar;
    avatar.root.rotation.y = 0.35;
    this.scene.add(avatar.root);
    avatar.play('Victory', { once: true });
  }

  private cheer = () => this.avatar?.play('Victory', { once: true });

  private loop = () => {
    this.raf = requestAnimationFrame(this.loop);
    const now = performance.now();
    const dt = Math.min((now - this.last) / 1000, 0.1);
    this.last = now;
    fitToCanvas(this.renderer, this.camera);
    this.avatar?.update(dt);
    this.renderer.render(this.scene, this.camera);
  };

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.canvas.removeEventListener('click', this.cheer);
    this.avatar?.dispose();
    this.scene.environment?.dispose();
    this.renderer.dispose();
  }
}
