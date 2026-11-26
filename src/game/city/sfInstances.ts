import * as THREE from 'three';
import type { KnockTarget } from './knockables';
import { loadGltf } from '../../engine/assets';
import type { Placement } from './layout';
import { SKETCHFAB_CITY } from './sketchfabCity';

/** Wind time shared by all tree leaves (advanced every frame by tick()). */
const windTime = { value: 0 };

/** Leaves sway gently: the higher up the tree, the more; each tree has its own rhythm. */
function addLeafWind(mat: THREE.Material, height: number) {
  if (mat.userData.wind) return;
  mat.userData.wind = true;
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uWind = windTime;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uWind;')
      // Leaf cards face every way and looked almost black: light them as a round crown instead
      // (normals point out from the middle of the crown).
      // Positions are quantized (a -1..1 box around the model's middle, scaled up by the instance
      // matrix), so "out from the middle" is simply the position itself, a bit lifted.
      // Leaf cards face every way and looked almost black: light them as a round crown instead.
      .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
        vec3 crownN = normalize(position + vec3(0.0, 0.25, 0.0));
        objectNormal = normalize(mix(objectNormal, crownN, 0.85));`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        #ifdef USE_INSTANCING
          vec2 treePos = instanceMatrix[3].xz;
        #else
          vec2 treePos = vec2(0.0);
        #endif
        float k = clamp(transformed.y * 0.5 + 0.5, 0.0, 1.0);
        k *= k;
        float ph = treePos.x * 0.13 + treePos.y * 0.17;
        // ~12 cm of sway at the top (one unit = half the tree height).
        float amp = ${(2 / height).toFixed(3)};
        transformed.x += (sin(uWind * 1.1 + ph) * 0.12 + sin(uWind * 2.9 + ph * 3.0 + transformed.y * 4.0) * 0.04) * k * amp;
        transformed.z += sin(uWind * 0.9 + ph * 1.7) * 0.08 * k * amp;`);
  };
  // A little brighter and less shiny, like sunlit leaves.
  const sm = mat as THREE.MeshStandardMaterial;
  if (sm.color) sm.color.multiplyScalar(1.15);
  if ('roughness' in sm) sm.roughness = Math.max(sm.roughness, 0.8);
  mat.customProgramCacheKey = () => `leafWind${height.toFixed(1)}`;
  mat.needsUpdate = true;
}

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
    /** slot: index in near (>= 0), in far (-2 - index), or -1 when hidden. */
    inst: { x: number; z: number; m: THREE.Matrix4; slot: number }[];
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
    // Tree leaves (alpha-tested) sway in the wind.
    if (info.category === 'tree') for (const q of [...near, ...far]) if (q.material.alphaTest > 0) addLeafWind(q.material, info.y);
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
      x: p.x, z: p.z, slot: -1,
      m: new THREE.Matrix4().compose(new THREE.Vector3(p.x, y, p.z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), p.rot), new THREE.Vector3(p.scale, p.scale, p.scale)),
    }));
    this.sets.push({ near: make(near, true), far: make(far, false), nearLocal: near.map((q) => q.local), farLocal: far.map((q) => q.local), inst, nearDist, maxDist });
  }

  /** Every frame: advance the wind. */
  tick(dt: number) { windTime.value += dt; }

  update(cx: number, cy: number, cz: number) {
    const h2 = cy * cy;
    for (const s of this.sets) {
      const n2 = s.nearDist * s.nearDist, m2 = s.maxDist * s.maxDist;
      let kn = 0, kf = 0;
      for (const it of s.inst) {
        const dx = it.x - cx, dz = it.z - cz, d2 = dx * dx + dz * dz + h2;
        if (d2 < n2 || (!s.far.length && d2 < m2)) {
          s.near.forEach((im, i) => im.setMatrixAt(kn, this.tmp.multiplyMatrices(it.m, s.nearLocal[i])));
          it.slot = kn++;
        } else if (d2 < m2) {
          s.far.forEach((im, i) => im.setMatrixAt(kf, this.tmp.multiplyMatrices(it.m, s.farLocal[i])));
          it.slot = -2 - kf++;
        } else it.slot = -1;
      }
      for (const im of s.near) { im.count = kn; im.visible = kn > 0; im.instanceMatrix.needsUpdate = true; }
      for (const im of s.far) { im.count = kf; im.visible = kf > 0; im.instanceMatrix.needsUpdate = true; }
    }
  }

  /** The instance standing at (x, z), to tip it over (null if none). */
  find(x: number, z: number): KnockTarget | null {
    for (const s of this.sets) {
      const it = s.inst.find((q) => Math.abs(q.x - x) < 0.3 && Math.abs(q.z - z) < 0.3);
      if (!it) continue;
      return {
        get: (out) => { out.copy(it.m); },
        set: (m) => {
          it.m.copy(m);
          if (it.slot === -1) return;
          const far = it.slot < -1, k = far ? -2 - it.slot : it.slot;
          (far ? s.far : s.near).forEach((im, i) => {
            im.setMatrixAt(k, this.tmp.multiplyMatrices(it.m, (far ? s.farLocal : s.nearLocal)[i]));
            im.instanceMatrix.needsUpdate = true;
          });
        },
      };
    }
    return null;
  }

  dispose() {
    this.group.removeFromParent();
  }
}
