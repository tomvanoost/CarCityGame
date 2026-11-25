import * as THREE from 'three';
import { loadGltf } from '../../engine/assets';
import type { Placement } from './layout';
import { SKETCHFAB_CITY } from './sketchfabCity';

/** One drawable part: geometry + material + its transform inside the model (keeps quantized data intact). */
interface Part { geometry: THREE.BufferGeometry; material: THREE.Material; local: THREE.Matrix4 }

/** Loads one glb as a list of (geometry, material) parts in model space. */
async function loadParts(url: string): Promise<Part[]> {
  const gltf = await loadGltf(url);
  gltf.scene.updateMatrixWorld(true);
  const parts: Part[] = [];
  gltf.scene.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    // Don't bake the node transform into the geometry: positions are quantized (normalized
    // integers) and would be clipped. The transform goes into the instance matrices instead.
    const g = m.geometry;
    const local = m.matrixWorld.clone();
    for (const mat of Array.isArray(m.material) ? m.material : [m.material]) {
      if (mat.name === 'CCG_LOD') {
        // Far trees: colors in the vertices, no normals stored, leaves seen from both sides.
        const sm = mat as THREE.MeshStandardMaterial;
        sm.vertexColors = true;
        sm.flatShading = true;
        sm.side = THREE.DoubleSide;
        sm.needsUpdate = true;
      }
      parts.push({ geometry: g, material: mat, local });
    }
  });
  return parts;
}

/**
 * Draws all copies of the Sketchfab city models with instancing. Each model has a close-up
 * (textured, detailed) and a far version; every copy switches by distance, and copies that are
 * too far away are not drawn. Parts with no copies in view are skipped entirely.
 */
export class SfInstances {
  readonly group = new THREE.Group();
  private sets: {
    near: THREE.InstancedMesh[];
    far: THREE.InstancedMesh[];
    nearLocal: THREE.Matrix4[];
    farLocal: THREE.Matrix4[];
    inst: { x: number; z: number; m: THREE.Matrix4 }[];
    nearDist: number;
    maxDist: number;
  }[] = [];
  private tmp = new THREE.Matrix4();

  /** Adds all placements of one model. nearDist/maxDist: switch and hide distances (m). */
  async add(model: string, placements: { p: Placement; y: number }[], nearDist: number, maxDist: number) {
    const info = SKETCHFAB_CITY[model];
    const [near, far] = await Promise.all([
      loadParts(`/models/city-sf/${model}.glb`),
      info.lod ? loadParts(`/models/city-sf/${model}_lod.glb`) : Promise.resolve([] as Part[]),
    ]);
    const make = (parts: Part[], shadows: boolean) => parts.map(({ geometry, material }) => {
      const im = new THREE.InstancedMesh(geometry, material, placements.length);
      im.count = 0;
      im.visible = false;
      im.frustumCulled = false;
      im.castShadow = shadows;
      im.receiveShadow = true;
      this.group.add(im);
      return im;
    });
    const inst = placements.map(({ p, y }) => ({
      x: p.x, z: p.z,
      m: new THREE.Matrix4().compose(new THREE.Vector3(p.x, y, p.z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), p.rot), new THREE.Vector3(p.scale, p.scale, p.scale)),
    }));
    this.sets.push({ near: make(near, true), far: make(far, false), nearLocal: near.map((q) => q.local), farLocal: far.map((q) => q.local), inst, nearDist, maxDist });
  }

  update(cx: number, cy: number, cz: number) {
    const h2 = cy * cy;
    for (const s of this.sets) {
      const n2 = s.nearDist * s.nearDist, m2 = s.maxDist * s.maxDist;
      let kn = 0, kf = 0;
      for (const it of s.inst) {
        const dx = it.x - cx, dz = it.z - cz, d2 = dx * dx + dz * dz + h2;
        if (d2 < n2 || (!s.far.length && d2 < m2)) {
          s.near.forEach((im, i) => im.setMatrixAt(kn, this.tmp.multiplyMatrices(it.m, s.nearLocal[i])));
          kn++;
        } else if (d2 < m2) {
          s.far.forEach((im, i) => im.setMatrixAt(kf, this.tmp.multiplyMatrices(it.m, s.farLocal[i])));
          kf++;
        }
      }
      for (const im of s.near) { im.count = kn; im.visible = kn > 0; im.instanceMatrix.needsUpdate = true; }
      for (const im of s.far) { im.count = kf; im.visible = kf > 0; im.instanceMatrix.needsUpdate = true; }
    }
  }

  dispose() {
    this.group.removeFromParent();
  }
}
