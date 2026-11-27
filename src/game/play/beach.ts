import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { FLOAT_STAND, LAKE, SWIM, inLake } from '../city/outskirts';
import { groundHeight } from './collision';

export const FLOAT_PRICE = 15;
export const FLOAT_FRONT = { x: FLOAT_STAND.x, z: FLOAT_STAND.z - 2.4 };

const paint = (g: THREE.BufferGeometry, color: string) => {
  const geo = g.index ? g.toNonIndexed() : g;
  const c = new THREE.Color(color), n = geo.getAttribute('position').count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) a.set([c.r, c.g, c.b], i * 3);
  geo.setAttribute('color', new THREE.BufferAttribute(a, 3));
  geo.deleteAttribute('uv');
  return geo;
};

/** The rubber duck float you wear around your waist while swimming (avatar space, waist height). */
export function floatGeometry() {
  return mergeGeometries([
    paint(new THREE.TorusGeometry(0.36, 0.12, 8, 20).rotateX(Math.PI / 2), '#ffd400'),
    paint(new THREE.SphereGeometry(0.13, 10, 8).translate(0, 0.16, 0.36), '#ffd400'), // duck head at the front
    paint(new THREE.ConeGeometry(0.05, 0.12, 6).rotateX(Math.PI / 2).translate(0, 0.15, 0.5), '#ff8a00'), // beak
    paint(new THREE.SphereGeometry(0.022, 6, 4).translate(0.06, 0.2, 0.47), '#1c1d20'),
    paint(new THREE.SphereGeometry(0.022, 6, 4).translate(-0.06, 0.2, 0.47), '#1c1d20'),
  ])!;
}

/**
 * The swimming beach: buoys around the swimming zone, a beach umbrella stand that sells the duck
 * float, and little ripples where you swim.
 */
export class Beach {
  readonly group = new THREE.Group();
  private buoys: THREE.InstancedMesh;
  private buoyPos: { x: number; z: number }[] = [];
  private ripples: { mesh: THREE.Mesh; t: number }[] = [];
  private time = 0;
  private next = 0;

  constructor() {
    // Buoys along the edge of the swimming zone (only where it's water).
    const add = (x: number, z: number) => { if (inLake(x, z, -2)) this.buoyPos.push({ x, z }); };
    for (let x = SWIM.x0; x <= SWIM.x1; x += 9) add(x, SWIM.zMax);
    for (let z = LAKE.z - LAKE.rz; z < SWIM.zMax; z += 9) { add(SWIM.x0, z); add(SWIM.x1, z); }
    const ball = mergeGeometries([
      paint(new THREE.SphereGeometry(0.35, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), '#e5484d'),
      paint(new THREE.SphereGeometry(0.35, 10, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), '#ffffff'),
    ])!;
    this.buoys = new THREE.InstancedMesh(ball, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5 }), this.buoyPos.length);
    this.buoys.frustumCulled = false;

    // The float stand: a striped beach umbrella, a crate with yellow floats and a little sign.
    const s = FLOAT_STAND, y = groundHeight(s.x, s.z);
    const parts: THREE.BufferGeometry[] = [paint(new THREE.CylinderGeometry(0.05, 0.05, 2.6, 6).translate(0, 1.3, 0), '#d9d4c7')];
    for (let i = 0; i < 8; i++) parts.push(paint(new THREE.ConeGeometry(1.6, 0.6, 2, 1, true, (i / 8) * Math.PI * 2, Math.PI / 4).translate(0, 2.7, 0), i % 2 ? '#ffffff' : '#1f8fe0'));
    parts.push(paint(new THREE.BoxGeometry(1.2, 0.5, 0.7).translate(0.8, 0.25, 0.4), '#a0703f'));
    for (let i = 0; i < 3; i++) parts.push(paint(new THREE.TorusGeometry(0.22, 0.08, 6, 14).rotateX(Math.PI / 2 - 0.3).translate(0.5 + i * 0.3, 0.6, 0.4), '#ffd400'));
    parts.push(paint(new THREE.BoxGeometry(0.05, 1.2, 0.05).translate(-0.9, 0.6, -0.6), '#8a5a35'), paint(new THREE.BoxGeometry(0.7, 0.45, 0.04).translate(-0.9, 1.25, -0.6), '#fff3c4'));
    parts.push(paint(new THREE.BoxGeometry(1.6, 0.03, 0.8).translate(-0.6, 0.02, 0.6), '#e5484d')); // towel
    const stand = new THREE.Mesh(mergeGeometries(parts)!, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, side: THREE.DoubleSide }));
    stand.position.set(s.x, y, s.z);
    stand.castShadow = true;
    this.group.add(this.buoys, stand);
    this.update(0, null);
  }

  /** Ripples: `swimmer` = where you swim and whether you're moving (null = not swimming). */
  update(dt: number, swimmer: { x: number; z: number; moving: boolean } | null) {
    this.time += dt;
    const m = new THREE.Matrix4();
    this.buoyPos.forEach((b, i) => {
      m.makeRotationZ(Math.sin(this.time * 1.5 + i) * 0.12).setPosition(b.x, Math.sin(this.time * 1.2 + i * 0.7) * 0.06, b.z);
      this.buoys.setMatrixAt(i, m);
    });
    this.buoys.instanceMatrix.needsUpdate = true;
    this.next -= dt;
    if (swimmer && this.next <= 0) {
      this.next = swimmer.moving ? 0.45 : 1.4;
      let r = this.ripples.find((q) => q.t <= 0);
      if (!r && this.ripples.length < 6) {
        r = { mesh: new THREE.Mesh(new THREE.RingGeometry(0.35, 0.5, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, depthWrite: false })), t: 0 };
        this.group.add(r.mesh);
        this.ripples.push(r);
      }
      if (r) { r.t = 1; r.mesh.position.set(swimmer.x, 0.03, swimmer.z); }
    }
    for (const r of this.ripples) {
      r.t = Math.max(0, r.t - dt / 1.2);
      r.mesh.visible = r.t > 0;
      const k = 1 + (1 - r.t) * 2.5;
      r.mesh.scale.set(k, 1, k);
      (r.mesh.material as THREE.MeshBasicMaterial).opacity = r.t * 0.7;
    }
  }

  dispose() {
    this.group.traverse((o) => {
      const mm = o as THREE.Mesh;
      if (mm.isMesh) { mm.geometry.dispose(); (mm.material as THREE.Material).dispose(); }
    });
    this.group.removeFromParent();
  }
}
