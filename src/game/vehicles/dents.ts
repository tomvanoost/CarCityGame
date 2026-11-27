import * as THREE from 'three';

/** A dent on a car body: where it is and which way the surface faces (in the car's own space). */
export interface Dent { p: [number, number, number]; n: [number, number, number] }

/** Most dents one car shows (more crashes don't add more). */
export const MAX_DENTS = 5;
export const REPAIR_PRICE = 500;

let texture: THREE.Texture | null = null;
/** A crumpled round patch: soft shadow in the middle, a bright rim and a few creases (works on every paint color). */
function dentTexture() {
  if (texture) return texture;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const shade = g.createRadialGradient(58, 58, 4, 64, 64, 62);
  shade.addColorStop(0, 'rgba(0,0,0,0.55)');
  shade.addColorStop(0.55, 'rgba(0,0,0,0.3)');
  shade.addColorStop(0.78, 'rgba(255,255,255,0.35)');
  shade.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = shade;
  g.beginPath(); g.arc(64, 64, 62, 0, Math.PI * 2); g.fill();
  // Creases: dark lines with a light edge next to them.
  for (const [a, l] of [[0.4, 40], [1.9, 34], [3.3, 44], [4.6, 30], [5.6, 36]]) {
    for (const [col, off] of [['rgba(0,0,0,0.5)', 0], ['rgba(255,255,255,0.35)', 2]] as const) {
      g.strokeStyle = col; g.lineWidth = 2.5;
      g.beginPath();
      g.moveTo(64 + Math.cos(a) * 8 + off, 64 + Math.sin(a) * 8);
      g.lineTo(64 + Math.cos(a + 0.25) * l * 0.6 + off, 64 + Math.sin(a + 0.25) * l * 0.6);
      g.lineTo(64 + Math.cos(a) * l + off, 64 + Math.sin(a) * l);
      g.stroke();
    }
  }
  texture = new THREE.CanvasTexture(c);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

const ray = new THREE.Raycaster();
const tmpBox = new THREE.Box3();

/**
 * Where a car gets dented when something hits it from `from` (a world point): cast a ray from there
 * towards the car's middle at body height and take the first body surface (not wheels, not lights).
 */
export function findDent(root: THREE.Object3D, from: { x: number; z: number }): Dent | null {
  root.updateWorldMatrix(true, true); // parents too: the car may have moved since the last frame was drawn
  const meshes: THREE.Object3D[] = [];
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    // Not wheels, dents, stripes or the people sitting inside.
    if (!m.isMesh || !m.visible || (m as THREE.SkinnedMesh).isSkinnedMesh || o.userData.wheelPart || o.name === 'CCG_DENT' || o.name === 'CCG_STRIPE') return;
    let hidden = false;
    for (let p: THREE.Object3D | null = o; p && p !== root; p = p.parent) if (!p.visible || p.name === 'CCG_HEADLIGHTS') hidden = true;
    if (!hidden) meshes.push(o);
  });
  if (!meshes.length) return null;
  tmpBox.makeEmpty();
  for (const m of meshes) tmpBox.expandByObject(m);
  const center = tmpBox.getCenter(new THREE.Vector3());
  const dir = new THREE.Vector3(center.x - from.x, 0, center.z - from.z);
  if (dir.lengthSq() < 1e-6) dir.set(0, 0, 1);
  dir.normalize();
  const inv = root.getWorldQuaternion(new THREE.Quaternion()).invert();
  const out = dir.clone().negate().applyQuaternion(inv);
  ray.far = 30;
  // A few heights on the body; the first hit wins.
  for (const k of [0.42, 0.32, 0.55, 0.65]) {
    const y = tmpBox.min.y + (tmpBox.max.y - tmpBox.min.y) * k;
    // Start well outside the car so the ray always hits its outside.
    ray.set(new THREE.Vector3(center.x - dir.x * 8, y, center.z - dir.z * 8), dir);
    const hit = ray.intersectObjects(meshes, false)[0];
    if (!hit || !hit.face) continue;
    const pt = root.worldToLocal(hit.point.clone());
    const nl = hit.face.normal.clone().transformDirection(hit.object.matrixWorld).applyQuaternion(inv).normalize();
    // Face normals of some models point inwards: make the dent face out of the car (towards the hit side).
    if (nl.dot(out) < 0) nl.negate();
    return pack(pt, nl);
  }
  // Nothing hit (an odd model): put it on the edge of the car's box, facing the other car.
  const size = tmpBox.getSize(new THREE.Vector3());
  const tx = Math.abs(dir.x) > 1e-4 ? size.x / 2 / Math.abs(dir.x) : Infinity, tz = Math.abs(dir.z) > 1e-4 ? size.z / 2 / Math.abs(dir.z) : Infinity;
  const edge = center.clone().addScaledVector(dir, -Math.min(tx, tz) * 0.9);
  edge.y = tmpBox.min.y + size.y * 0.42;
  return pack(root.worldToLocal(edge), out.normalize());
}

function pack(p: THREE.Vector3, n: THREE.Vector3): Dent {
  const r = (v: number) => Math.round(v * 1000) / 1000;
  return { p: [r(p.x), r(p.y), r(p.z)], n: [r(n.x), r(n.y), r(n.z)] };
}

let geo: THREE.PlaneGeometry | null = null;
const Z = new THREE.Vector3(0, 0, 1);

/** Show a dent on a car (a child of `root`, in its space). */
export function addDentMesh(root: THREE.Object3D, d: Dent) {
  geo ??= new THREE.PlaneGeometry(0.6, 0.6);
  const mat = new THREE.MeshBasicMaterial({ map: dentTexture(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
  const m = new THREE.Mesh(geo, mat);
  m.name = 'CCG_DENT';
  const n = new THREE.Vector3(...d.n);
  m.position.set(d.p[0], d.p[1], d.p[2]).addScaledVector(n, 0.012);
  m.quaternion.setFromUnitVectors(Z, n);
  m.rotateZ((d.p[0] * 13 + d.p[2] * 7) % (Math.PI * 2)); // every dent turned a bit differently
  m.renderOrder = 2;
  root.add(m);
}

export const dentCount = (root: THREE.Object3D) => root.children.filter((c) => c.name === 'CCG_DENT').length;

/** Remove all dents (repaired, or a traffic car that drives off and comes back). */
export function clearDents(root: THREE.Object3D) {
  for (const c of [...root.children]) {
    if (c.name !== 'CCG_DENT') continue;
    c.removeFromParent();
    ((c as THREE.Mesh).material as THREE.Material).dispose();
  }
}
