import type * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import versions from 'virtual:model-versions';

const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
const cache = new Map<string, Promise<GLTF>>();

/** Loads a .glb once; later calls share the same parsed result (clone before adding to a scene). */
export function loadGltf(url: string): Promise<GLTF> {
  let p = cache.get(url);
  if (!p) {
    // ?v=<content hash>: a changed model always gets a new URL, so no browser shows an old copy.
    const v = versions[url];
    p = loader.loadAsync(v ? `${url}?v=${v}` : url).then((gltf) => {
      // Sharper textures when seen at an angle (walls, car sides); cheap on every GPU.
      gltf.scene.traverse((o) => {
        const mats = (o as THREE.Mesh).material;
        if (!mats) return;
        for (const m of Array.isArray(mats) ? mats : [mats]) {
          for (const t of [(m as THREE.MeshStandardMaterial).map, (m as THREE.MeshStandardMaterial).normalMap]) if (t) t.anisotropy = 4;
        }
      });
      return gltf;
    });
    p.catch(() => cache.delete(url));
    cache.set(url, p);
  }
  return p;
}

export async function loadClips(url: string): Promise<THREE.AnimationClip[]> {
  return (await loadGltf(url)).animations;
}
