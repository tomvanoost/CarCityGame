import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Friendlier faces: a shiny highlight in each eye and a small smile.
 * Built in the character's own mesh space and skinned 100% to the Head bone, so
 * the details follow every animation. Returns null if the character has no face.
 *
 * The geometry has position, normal, color, skinIndex, skinWeight and an index,
 * so it can be merged into a pedestrian's single mesh or drawn as its own mesh.
 */
export function faceDetailGeometry(meshes: THREE.SkinnedMesh[]): THREE.BufferGeometry | null {
  const byMat = (name: string) => meshes.find((m) => (m.material as THREE.Material).name === name);
  const face = byMat('Face'), skin = byMat('Skin');
  if (!face || !skin) return null;
  const headIndex = face.skeleton.bones.findIndex((b) => b.name === 'Head');
  if (headIndex < 0) return null;

  // Eyes: the Face material is two blobs, left (x < 0) and right (x > 0).
  // The same material also has the eyebrows on top: keep only the lower 62% (the eyes).
  const fp = face.geometry.getAttribute('position');
  const all = new THREE.Box3().setFromBufferAttribute(fp as THREE.BufferAttribute);
  const browY = all.min.y + (all.max.y - all.min.y) * 0.62;
  const eyes = [new THREE.Box3(), new THREE.Box3()];
  const v = new THREE.Vector3();
  for (let i = 0; i < fp.count; i++) {
    v.fromBufferAttribute(fp, i);
    if (v.y > browY) continue;
    eyes[v.x < 0 ? 0 : 1].expandByPoint(v);
  }
  if (eyes.some((e) => e.isEmpty())) return null;
  const size = eyes[0].getSize(new THREE.Vector3());
  const spacing = eyes[1].getCenter(new THREE.Vector3()).x - eyes[0].getCenter(new THREE.Vector3()).x;

  const parts: { geo: THREE.BufferGeometry; color: THREE.Color }[] = [];
  const white = new THREE.Color('#ffffff');
  for (const e of eyes) {
    const c = e.getCenter(new THREE.Vector3());
    const r = Math.min(size.x, size.y) * 0.17;
    const g = new THREE.SphereGeometry(r, 10, 8);
    g.scale(1, 1, 0.35);
    g.translate(c.x + size.x * 0.12, c.y + size.y * 0.22, e.max.z + r * 0.05);
    parts.push({ geo: g, color: white });
  }

  // Smile: a thin arc below the eyes, on the skin surface.
  const mouthY = eyes[0].min.y - size.y * 0.75;
  const sp = skin.geometry.getAttribute('position');
  let frontZ = -Infinity;
  for (let i = 0; i < sp.count; i++) {
    v.fromBufferAttribute(sp, i);
    if (Math.abs(v.x) < spacing * 0.3 && Math.abs(v.y - mouthY) < size.y * 0.6) frontZ = Math.max(frontZ, v.z);
  }
  if (frontZ > -Infinity) {
    const radius = spacing * 0.2, arc = Math.PI * 0.55;
    const g = new THREE.TorusGeometry(radius, radius * 0.16, 6, 14, arc);
    g.rotateZ(-Math.PI / 2 - arc / 2); // U-shape, centered at the bottom
    g.translate(0, mouthY + radius * 0.6, frontZ + radius * 0.05);
    parts.push({ geo: g, color: new THREE.Color('#5a2a22') });
  }

  // Common attribute set: position, normal, color, skinIndex, skinWeight (+ index).
  const ready = parts.map(({ geo, color }) => {
    const g = geo.toNonIndexed();
    geo.dispose();
    g.deleteAttribute('uv');
    const n = g.getAttribute('position').count;
    const col = new Float32Array(n * 3), si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      col.set([color.r, color.g, color.b], i * 3);
      si[i * 4] = headIndex;
      sw[i * 4] = 1;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4));
    g.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
    g.setIndex(Array.from({ length: n }, (_, i) => i));
    return g;
  });
  const merged = mergeGeometries(ready);
  ready.forEach((g) => g.dispose());
  return merged;
}

/** Shared glossy material for face details drawn as their own mesh (player avatar). */
let faceMat: THREE.MeshStandardMaterial | null = null;
export function faceDetailMaterial() {
  return (faceMat ??= new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.3 }));
}
