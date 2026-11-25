import * as THREE from 'three';
import { loadGltf } from '../../engine/assets';
import { contactShadow, type BuiltCar } from './carBuilder';
import { SKETCHFAB_VEHICLES } from './sketchfabManifest';

/**
 * Driver's hips (vehicle-local), from real-car proportions: a driver sits roughly in the
 * middle of the car, on the left (+X), with the hips at about a third of the roof height.
 */
function seatFor(info: { length: number; width: number; height: number; bike: boolean }) {
  if (info.bike) return new THREE.Vector3(0, info.height * 0.62, -info.length * 0.1);
  return new THREE.Vector3(info.width * 0.18, info.height * 0.32, info.length * 0.01);
}

export const hasSketchfabModel = (id: string) => id in SKETCHFAB_VEHICLES;
export const isPaintable = (id: string) => !hasSketchfabModel(id) || SKETCHFAB_VEHICLES[id].paintable;

/**
 * Loads a processed Sketchfab vehicle (see scripts/build-vehicles.mjs) as a BuiltCar.
 * `lod` = the light version for traffic: one mesh with vertex colors.
 * The model already faces +Z, stands on y = 0 and has its real size.
 */
export async function loadSketchfabVehicle(id: string, color?: THREE.ColorRepresentation, lod = false): Promise<BuiltCar> {
  const info = SKETCHFAB_VEHICLES[id];
  const gltf = await loadGltf(`/models/vehicles/${id}${lod ? '_lod' : ''}.glb`);
  const model = gltf.scene.clone(true);
  const own: THREE.Material[] = [];
  const paint: THREE.MeshStandardMaterial[] = [];
  model.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = true;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const next = mats.map((m) => {
      const sm = m as THREE.MeshStandardMaterial;
      if (lod && !sm.flatShading) {
        // Shared by all traffic cars of this model: colors are in the vertices, no normals stored.
        sm.flatShading = true;
        sm.vertexColors = true;
        sm.needsUpdate = true;
      }
      if (sm.name === 'CCG_PAINT') {
        const c = sm.clone();
        own.push(c);
        paint.push(c);
        return c;
      }
      return m;
    });
    mesh.material = Array.isArray(mesh.material) ? next : next[0];
  });
  const root = new THREE.Group();
  root.add(model);
  root.add(contactShadow(info.width * 1.25, info.length * 1.12));
  const setColor = (c: THREE.ColorRepresentation) => paint.forEach((m) => m.color.set(c));
  if (color && info.paintable) setColor(color);
  // These models have no separate wheel parts: dummy pivots keep the game code simple.
  const dummy = () => new THREE.Group();
  return {
    root,
    wheels: { fl: dummy(), fr: dummy(), rl: dummy(), rr: dummy() },
    seat: seatFor(info),
    setColor,
    dispose() {
      own.forEach((m) => m.dispose());
      root.traverse((o) => { if (o !== model && (o as THREE.Mesh).isMesh && (o as THREE.Mesh).geometry.type === 'PlaneGeometry') (o as THREE.Mesh).geometry.dispose(); });
      root.removeFromParent();
    },
  };
}
