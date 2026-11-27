import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { JETTY, SWIM } from '../city/outskirts';
import { duckGeometry, ducklingGeometry } from './wildlife';

/** A boat trip around the lake. */
export const BOAT_PRICE = 10;
export const BOAT_TIME = 70;

/** Where the boat lies at the jetty (on its east side, near the end), and where you stand to get on. */
const DOCK = { x: JETTY.x + 3.2, z: JETTY.z0 + 22 };
export const BOAT_FRONT = { x: JETTY.x + 0.5, z: DOCK.z - 0.5 };

/**
 * The route: out of the swimming zone to the south, a loop around the west half of the lake (staying
 * well clear of the car bridge in the middle), and back to the jetty. The boat leaves and arrives facing south.
 */
const ROUTE = [
  [DOCK.x, DOCK.z], [DOCK.x + 4, SWIM.zMax + 12], [-245, 905], [-340, 980], [-350, 1060], [-280, 1140],
  [-170, 1175], [-80, 1130], [-55, 1040], [-75, 950], [-110, 880], [DOCK.x + 6, SWIM.zMax - 2], [DOCK.x + 1, DOCK.z + 8],
];

function paint(g: THREE.BufferGeometry, color: string) {
  const geo = g.index ? g.toNonIndexed() : g;
  const c = new THREE.Color(color), n = geo.getAttribute('position').count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) a.set([c.r, c.g, c.b], i * 3);
  geo.setAttribute('color', new THREE.BufferAttribute(a, 3));
  geo.deleteAttribute('uv');
  return geo;
}
const box = (w: number, h: number, d: number, x: number, y: number, z: number, color: string) => paint(new THREE.BoxGeometry(w, h, d).translate(x, y, z), color);

/** The little ferry (faces +Z, waterline at y = 0): a white hull with a red stripe, a cabin, a bench on the back deck. */
function boatGeometry() {
  const hull = new THREE.Shape();
  hull.moveTo(-1.3, -2.8); hull.lineTo(1.3, -2.8); hull.lineTo(1.3, 1.4); hull.quadraticCurveTo(1.2, 2.6, 0, 3.3); hull.quadraticCurveTo(-1.2, 2.6, -1.3, 1.4); hull.lineTo(-1.3, -2.8);
  const ext = (depth: number, y: number, color: string, scale = 1) =>
    paint(new THREE.ExtrudeGeometry(hull, { depth, bevelEnabled: false }).rotateX(Math.PI / 2).scale(scale, 1, scale).translate(0, y + depth, 0), color);
  return mergeGeometries([
    ext(0.9, -0.35, '#f7f7f2'), // hull
    ext(0.12, 0.42, '#e5484d', 1.01), // red stripe
    ext(0.06, 0.55, '#c99a63', 0.95), // wooden deck
    box(1.9, 1.2, 1.8, 0, 1.2, 0.9, '#ffffff'), // cabin
    box(2.1, 0.12, 2.1, 0, 1.86, 0.9, '#1f4fa3'), // cabin roof
    box(1.6, 0.5, 0.05, 0, 1.35, 1.81, '#7fb8e6'), // front window
    box(0.05, 0.45, 1.3, 0.96, 1.35, 0.9, '#7fb8e6'), box(0.05, 0.45, 1.3, -0.96, 1.35, 0.9, '#7fb8e6'),
    // A bench across the back deck (facing forward) with a backrest.
    box(2.2, 0.1, 0.5, 0, 0.95, -2.3, '#8a5a35'), box(2.2, 0.45, 0.08, 0, 1.25, -2.55, '#8a5a35'),
    box(0.1, 0.4, 0.4, 0.95, 0.75, -2.3, '#6b4428'), box(0.1, 0.4, 0.4, -0.95, 0.75, -2.3, '#6b4428'),
    // Railing posts and rail around the back deck.
    ...[-2.6, -1.8, -1, -0.2].flatMap((z) => [box(0.05, 0.55, 0.05, 1.22, 0.9, z, '#d0d4d9'), box(0.05, 0.55, 0.05, -1.22, 0.9, z, '#d0d4d9')]),
    box(0.05, 0.05, 2.5, 1.22, 1.17, -1.4, '#d0d4d9'), box(0.05, 0.05, 2.5, -1.22, 1.17, -1.4, '#d0d4d9'),
    // A life ring on the cabin's back wall and a little flag on the roof.
    paint(new THREE.TorusGeometry(0.22, 0.06, 6, 14).translate(0, 1.2, -0.02), '#ff6a1a'),
    box(0.03, 0.8, 0.03, 0, 2.3, 0.2, '#d0d4d9'), box(0.45, 0.28, 0.02, 0.23, 2.55, 0.2, '#e5484d'),
  ])!;
}

/**
 * The boat at the jetty and its trip: `board()` gives the seat on the back bench; the boat then sails
 * the loop by itself (slow start and stop, gentle bobbing). A few ducks swim on the lake.
 */
export class Boat {
  readonly group = new THREE.Group();
  readonly seat = new THREE.Object3D();
  private craft: THREE.Mesh;
  private curve: THREE.CatmullRomCurve3;
  private ducks: THREE.InstancedMesh;
  private ducklings: THREE.InstancedMesh;
  private duckData: { x: number; z: number; r: number; a: number; s: number }[] = [];
  private ride: { t: number } | null = null;
  private time = 0;
  private m = new THREE.Matrix4();

  constructor() {
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 });
    this.craft = new THREE.Mesh(boatGeometry(), mat);
    this.craft.castShadow = true;
    this.seat.position.set(0.45, 1.0, -2.3); // on the back bench, looking forward
    this.craft.add(this.seat);
    this.curve = new THREE.CatmullRomCurve3(ROUTE.map(([x, z]) => new THREE.Vector3(x, 0, z)), true, 'centripetal');
    // Ducks: three mothers with three ducklings each, paddling slow circles on the lake.
    for (const [x, z] of [[-230, 1010], [-120, 1100], [-300, 1090]]) this.duckData.push({ x, z, r: 14 + Math.random() * 8, a: Math.random() * 6.28, s: 0.05 + Math.random() * 0.03 });
    const duckMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7 });
    this.ducks = new THREE.InstancedMesh(duckGeometry(), duckMat, this.duckData.length);
    this.ducklings = new THREE.InstancedMesh(ducklingGeometry(), duckMat, this.duckData.length * 3);
    this.ducks.frustumCulled = this.ducklings.frustumCulled = false;
    this.group.add(this.craft, this.ducks, this.ducklings);
    this.update(0);
  }

  /** Get on: returns the seat (hips at its origin) and how long the trip lasts. */
  board(): { seat: THREE.Object3D; duration: number } {
    this.ride = { t: 0 };
    return { seat: this.seat, duration: BOAT_TIME };
  }

  leave() { this.ride = null; }

  /** Where the boat is heading (for the camera behind it). */
  get heading() { return this.craft.rotation.y; }

  update(dt: number) {
    this.time += dt;
    // Trip progress 0..1 along the loop: starts and stops gently at the jetty.
    let u = 0;
    if (this.ride) {
      this.ride.t = Math.min(BOAT_TIME, this.ride.t + dt);
      const k = this.ride.t / BOAT_TIME;
      u = k - Math.sin(2 * Math.PI * k) / (2 * Math.PI);
    }
    const p = this.curve.getPointAt(u % 1), tan = this.curve.getTangentAt(u % 1);
    this.craft.position.set(p.x, Math.sin(this.time * 1.3) * 0.05, p.z);
    this.craft.rotation.set(Math.sin(this.time * 0.9) * 0.015, Math.atan2(tan.x, tan.z), Math.sin(this.time * 1.1) * 0.025, 'YXZ');
    // Ducks paddle around, the ducklings in a row behind their mother.
    const q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), one = new THREE.Vector3(1, 1, 1), pos = new THREE.Vector3();
    this.duckData.forEach((d, i) => {
      for (let j = 0; j < 4; j++) {
        const a = d.a + this.time * d.s - j * 0.06;
        pos.set(d.x + Math.cos(a) * d.r, Math.sin(this.time * 2 + j) * 0.015, d.z + Math.sin(a) * d.r);
        q.setFromAxisAngle(up, Math.atan2(-Math.sin(a), Math.cos(a)));
        this.m.compose(pos, q, j === 0 ? one.clone().multiplyScalar(1.6) : one.clone().multiplyScalar(1.4));
        if (j === 0) this.ducks.setMatrixAt(i, this.m); else this.ducklings.setMatrixAt(i * 3 + j - 1, this.m);
      }
    });
    this.ducks.instanceMatrix.needsUpdate = this.ducklings.instanceMatrix.needsUpdate = true;
  }

  dispose() {
    this.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) { m.geometry.dispose(); (m.material as THREE.Material).dispose(); }
    });
    this.group.removeFromParent();
  }
}
