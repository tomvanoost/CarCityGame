import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { createRenderer, fitToCanvas, studioEnvironment } from '../engine/renderer';
import type { Gender } from '../services/types';
import { Avatar } from './avatar/avatar';

/** A colored box standing on y = 0 at (x, z) (y lifts it), for the room furniture. */
function box(w: number, h: number, d: number, color: string, x: number, y: number, z: number, ry = 0) {
  const g = new THREE.BoxGeometry(w, h, d).toNonIndexed();
  g.deleteAttribute('uv');
  g.rotateY(ry).translate(x, y + h / 2, z);
  return paint(g, color);
}
function cyl(rTop: number, rBot: number, h: number, color: string, x: number, y: number, z: number, seg = 20) {
  const g = new THREE.CylinderGeometry(rTop, rBot, h, seg).toNonIndexed();
  g.deleteAttribute('uv');
  g.translate(x, y + h / 2, z);
  return paint(g, color);
}
function ball(r: number, color: string, x: number, y: number, z: number, sy = 1) {
  const g = new THREE.IcosahedronGeometry(r, 1).toNonIndexed();
  g.deleteAttribute('uv');
  g.scale(1, sy, 1).translate(x, y, z);
  return paint(g, color);
}
function paint(g: THREE.BufferGeometry, color: string) {
  const c = new THREE.Color(color);
  const n = g.getAttribute('position').count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) arr.set([c.r, c.g, c.b], i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return g;
}

/** The cozy living room: floor, two walls with a window, sofa, rug, table, lamp, plant, shelf, TV. */
function buildRoom(): THREE.Mesh {
  const W = 6, D = 5, H = 3;
  const parts = [
    // Floor (warm wood planks) and walls (soft peach / mint), skirting boards.
    ...Array.from({ length: 10 }, (_, i) => box(W, 0.06, D / 10 - 0.01, i % 2 ? '#c99a6b' : '#d4a777', 0, 0, -D / 2 + D / 20 + (i * D) / 10)),
    box(W, H, 0.12, '#f6dcc8', 0, 0, -D / 2 - 0.06),
    box(0.12, H, D, '#d7eedf', -W / 2 - 0.06, 0, 0),
    box(W, 0.14, 0.04, '#ffffff', 0, 0.06, -D / 2 + 0.02),
    box(0.04, 0.14, D, '#ffffff', -W / 2 + 0.02, 0.06, 0),
    // Window on the back wall: white frame, a light sky, a cross bar and a little sill.
    box(1.9, 1.5, 0.08, '#ffffff', 1.3, 1.0, -D / 2 + 0.02),
    box(1.7, 1.3, 0.09, '#a9dcff', 1.3, 1.1, -D / 2 + 0.02),
    box(0.06, 1.3, 0.1, '#ffffff', 1.3, 1.1, -D / 2 + 0.03),
    box(1.7, 0.06, 0.1, '#ffffff', 1.3, 1.72, -D / 2 + 0.03),
    box(2.1, 0.08, 0.28, '#ffffff', 1.3, 0.94, -D / 2 + 0.14),
    ball(0.16, '#ff8fb5', 0.75, 1.13, -D / 2 + 0.16), ball(0.13, '#ffd34d', 1.05, 1.1, -D / 2 + 0.16), // flowers on the sill
    // Sofa against the side wall (blue), with two cushions.
    box(0.9, 0.42, 2.4, '#3d7fd9', -W / 2 + 0.55, 0.0, 0.2),
    box(0.28, 0.85, 2.4, '#3270c4', -W / 2 + 0.22, 0.0, 0.2),
    box(0.9, 0.62, 0.26, '#3270c4', -W / 2 + 0.55, 0.0, -1.08),
    box(0.9, 0.62, 0.26, '#3270c4', -W / 2 + 0.55, 0.0, 1.48),
    box(0.16, 0.42, 0.5, '#ffd34d', -W / 2 + 0.42, 0.42, -0.45, 0.2),
    box(0.16, 0.42, 0.5, '#ff7ac2', -W / 2 + 0.42, 0.42, 0.85, -0.2),
    // Round rug and a small coffee table with a mug.
    cyl(1.35, 1.35, 0.02, '#f2b64c', -0.4, 0.06, 0.35, 40),
    cyl(1.0, 1.0, 0.025, '#ffe08a', -0.4, 0.07, 0.35, 40),
    box(1.1, 0.06, 0.65, '#a0663a', -1.2, 0.42, 0.3),
    ...[[-0.5, -0.27], [0.5, -0.27], [-0.5, 0.27], [0.5, 0.27]].map(([dx, dz]) => box(0.06, 0.42, 0.06, '#8a5530', -1.2 + dx, 0, 0.3 + dz)),
    cyl(0.07, 0.07, 0.13, '#e5484d', -1.0, 0.48, 0.25, 12),
    // Floor lamp with a warm shade (back-left corner).
    cyl(0.18, 0.2, 0.05, '#555b66', -W / 2 + 0.45, 0, -D / 2 + 0.45, 16),
    cyl(0.025, 0.025, 1.55, '#555b66', -W / 2 + 0.45, 0.05, -D / 2 + 0.45, 8),
    cyl(0.18, 0.3, 0.38, '#ffe6a8', -W / 2 + 0.45, 1.55, -D / 2 + 0.45, 16),
    // Plant in a pot (back-right corner).
    cyl(0.24, 0.18, 0.42, '#e07a4f', W / 2 - 0.5, 0, -D / 2 + 0.5, 16),
    ball(0.38, '#4caf50', W / 2 - 0.5, 0.8, -D / 2 + 0.5, 1.2),
    ball(0.26, '#66c46a', W / 2 - 0.36, 1.12, -D / 2 + 0.42),
    // Bookshelf with colorful books (back wall, left of the window).
    // An open shelf: back panel, sides, top/bottom and two shelves, so the books show.
    box(1.2, 1.7, 0.04, '#9a6a3e', -1.3, 0, -D / 2 + 0.04),
    box(0.05, 1.7, 0.36, '#b07a4a', -1.88, 0, -D / 2 + 0.2), box(0.05, 1.7, 0.36, '#b07a4a', -0.72, 0, -D / 2 + 0.2),
    ...[0, 0.42, 0.98, 1.66].map((y) => box(1.2, 0.04, 0.36, '#b07a4a', -1.3, y, -D / 2 + 0.2)),
    ...['#e5484d', '#3d9bff', '#20b76b', '#ffd34d', '#9b6bff', '#ff8fb5'].map((c, i) => box(0.12, 0.34, 0.24, c, -1.72 + i * 0.16, 0.46, -D / 2 + 0.2)),
    ...['#20b76b', '#ff8a3d', '#3d9bff', '#e5484d'].map((c, i) => box(0.13, 0.3, 0.24, c, -1.66 + i * 0.18, 1.02, -D / 2 + 0.2)),
    // Picture on the side wall (a little sun over hills).
    box(0.05, 0.75, 1.0, '#ffffff', -W / 2 + 0.03, 1.55, 0.2),
    box(0.06, 0.62, 0.86, '#bfe6ff', -W / 2 + 0.04, 1.62, 0.2),
    box(0.07, 0.25, 0.86, '#6cc46e', -W / 2 + 0.05, 1.62, 0.2),
    ball(0.1, '#ffd34d', -W / 2 + 0.06, 2.05, 0.4),
    // TV on a low cabinet (right side), screen showing a happy blue.
    box(1.4, 0.45, 0.45, '#ffffff', W / 2 - 0.4, 0, 0.6, Math.PI / 2),
    box(1.3, 0.75, 0.06, '#1d2b44', W / 2 - 0.4, 0.6, 0.6, Math.PI / 2),
    box(1.16, 0.62, 0.065, '#4fb3ff', W / 2 - 0.43, 0.665, 0.6, Math.PI / 2),
  ];
  const geo = mergeGeometries(parts)!;
  parts.forEach((p) => p.dispose());
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, flatShading: true }));
  mesh.receiveShadow = mesh.castShadow = true;
  return mesh;
}

/**
 * The 3D view inside your apartment (shown at the top of the apartment panel): a cozy room
 * with your avatar in it. Tap to make your avatar cheer; the camera sways gently.
 */
export class ApartmentRoom {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(42, 2, 0.1, 50);
  private room = buildRoom();
  private avatar?: Avatar;
  private shown = '';
  private raf = 0;
  private t = 0;
  private last = performance.now();
  private loadId = 0;
  private disposed = false;

  constructor(private canvas: HTMLCanvasElement) {
    this.renderer = createRenderer(canvas, { shadows: true });
    this.scene.background = new THREE.Color('#f6dcc8');
    this.scene.environment = studioEnvironment(this.renderer);
    this.scene.environmentIntensity = 0.45;
    // Warm daylight from the window, a soft fill, and the cozy glow of the floor lamp.
    const sunIn = new THREE.DirectionalLight('#fff3e0', 2.0);
    sunIn.position.set(2.5, 4, 1.5);
    sunIn.castShadow = true;
    sunIn.shadow.mapSize.set(512, 512);
    const s = sunIn.shadow.camera;
    s.left = s.bottom = -4; s.right = s.top = 4;
    const lamp = new THREE.PointLight('#ffcf7a', 3, 5, 1.5);
    lamp.position.set(-2.55, 1.6, -2.05);
    this.scene.add(new THREE.HemisphereLight('#fff6ec', '#c9a27a', 1.2), sunIn, lamp, this.room);
    canvas.addEventListener('click', this.cheer);
    this.loop();
  }

  /** Puts your avatar (in its current outfit) in the room; does nothing if it's already there. */
  async show(gender: Gender, outfitId: string) {
    const key = `${gender}/${outfitId}`;
    if (key === this.shown) return;
    this.shown = key;
    const id = ++this.loadId;
    const avatar = await Avatar.create(gender, outfitId);
    if (id !== this.loadId || this.disposed) return avatar.dispose();
    this.avatar?.dispose();
    this.avatar = avatar;
    avatar.root.position.set(0.4, 0.06, 0.6);
    avatar.root.rotation.y = -0.35;
    avatar.root.traverse((o) => { o.castShadow = !o.userData.glass; });
    this.scene.add(avatar.root);
    avatar.play('Victory', { once: true });
  }

  private cheer = () => this.avatar?.play('Victory', { once: true });

  private loop = () => {
    this.raf = requestAnimationFrame(this.loop);
    const now = performance.now();
    const dt = Math.min((now - this.last) / 1000, 0.1);
    this.last = now;
    this.t += dt;
    fitToCanvas(this.renderer, this.camera);
    // Gentle sway, looking into the corner of the room.
    const a = 0.22 + Math.sin(this.t * 0.25) * 0.1;
    this.camera.position.set(Math.sin(a) * 5.6 - 0.3, 2.4, Math.cos(a) * 5.6);
    this.camera.lookAt(-0.5, 0.95, -0.6);
    this.avatar?.update(dt);
    this.renderer.render(this.scene, this.camera);
  };

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.canvas.removeEventListener('click', this.cheer);
    this.avatar?.dispose();
    this.room.geometry.dispose();
    (this.room.material as THREE.Material).dispose();
    this.scene.environment?.dispose();
    this.renderer.dispose();
  }
}
