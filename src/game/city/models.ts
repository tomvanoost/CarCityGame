import * as THREE from 'three';
import { loadGltf } from '../../engine/assets';
import { SKETCHFAB_CITY, type SfCategory } from './sketchfabCity';

/**
 * Sketchfab models of a category. With fewer than 3 good ones the built-in (CC0) models are
 * mixed in (buildings only), so streets don't repeat one building over and over (low-quality Sketchfab results
 * are skipped in scripts/city-fixes.json).
 */
const sf = <T extends readonly string[]>(cat: SfCategory, fallback: T, mix = true): readonly string[] => {
  const ids = Object.keys(SKETCHFAB_CITY).filter((id) => SKETCHFAB_CITY[id].category === cat);
  if (!ids.length) return fallback;
  if (ids.length >= 3 || !mix) return ids;
  // Each Sketchfab model about as often as two CC0 models, so the good ones still stand out.
  return [...ids.flatMap((id) => [id, id]), ...fallback];
};
export const isSketchfabCity = (name: string) => name in SKETCHFAB_CITY;

/** City model groups. All buildings face +Z (front door) in their source files. */
const CC0_TOWNHOUSES = ['Building1_Large', 'Building1_Small', 'Building2_Large', 'Building2_Small', 'Building3_Big', 'Building3_Small', 'Building4'] as const;
const CC0_HOUSES = ['1Story_GableRoof', '2Story_GableRoof', '2Story_GableRoof', '1Story_RoundRoof', '2Story_RoundRoof', '2Story_Sidehouse'] as const;
const CC0_SHOPS = ['1Story', '1Story_Sign', '1Story_RoundRoof', '2Story_Sign', '2Story_Wide', '2Story_Double', '2Story_Columns', '2Story_Center'] as const;
const CC0_APARTMENTS = ['3Story_Balcony', '3Story_Small', '4Story_Center', '4Story', '4Story_Wide_2Doors', '6Story_Stack', '2Story_Balcony', '2Story_2', '2Story_Stairs', '2Story_Sidehouse', '2Story', '2Story_Wide_2Doors', '2Story_RoundRoof'] as const;
const CC0_TREES = ['CommonTree_1', 'CommonTree_2', 'CommonTree_3', 'CommonTree_4', 'CommonTree_5', 'BirchTree_1', 'BirchTree_2', 'BirchTree_3'] as const;
const CC0_PINES = ['PineTree_1', 'PineTree_2', 'PineTree_3'] as const;
export const TOWNHOUSES = sf('townhouse', CC0_TOWNHOUSES);
export const HOUSES = sf('house', CC0_HOUSES);
export const SHOPS = sf('shop', CC0_SHOPS);
export const APARTMENTS = sf('apartment', CC0_APARTMENTS);
// The Sketchfab street trees looked out of place (a huge dark blob; a cone on a grass dome):
// the built-in trees match the built-in buildings better.
export const TREES = CC0_TREES;
export const PINES = sf('pine', CC0_PINES, false);
export const BUSHES = sf('bush', ['Bush_1', 'Bush_2', 'BushBerries_1'] as const, false);
export const SMALL_NATURE = ['Bush_1', 'Bush_2', 'BushBerries_1', 'Flowers', 'Rock_Moss_1', 'Rock_Moss_2', 'Lilypad'] as const;
export const PROPS = ['Streetlight_Single', 'TrafficLight_2'] as const;
const WITH_LOD = new Set<string>([...CC0_TOWNHOUSES, ...CC0_HOUSES, ...CC0_SHOPS, ...CC0_APARTMENTS, ...CC0_TREES, ...CC0_PINES, 'Willow_1']);

/** Scale from source units to meters. */
export function modelScale(name: string): number {
  if ((TOWNHOUSES as readonly string[]).includes(name)) return 3.2;
  if (name.includes('Story')) return 2.8;
  if (name.includes('Tree') || name === 'Willow_1') return 2.6;
  if (name === 'Streetlight_Single') return 5.5;
  if (name === 'TrafficLight_2') return 4.2;
  if (name === 'Lilypad') return 1.2;
  return 1.6;
}

export interface CityModel {
  name: string;
  lod0: THREE.BufferGeometry;
  lod1: THREE.BufferGeometry | null;
  /** Footprint in meters (after scale): width along X, depth along Z, height. */
  size: THREE.Vector3;
}

/**
 * Loads a city .glb and returns a clean, float, non-quantized geometry with
 * position + color + aMain, centered on X/Z with its bottom at y = 0, in meters.
 */
async function loadGeometry(url: string, scale: number): Promise<THREE.BufferGeometry> {
  const gltf = await loadGltf(url);
  gltf.scene.updateMatrixWorld(true);
  let mesh: THREE.Mesh | null = null;
  gltf.scene.traverse((o) => { if ((o as THREE.Mesh).isMesh && !mesh) mesh = o as THREE.Mesh; });
  if (!mesh) throw new Error(`no mesh in ${url}`);
  const src = (mesh as THREE.Mesh).geometry;
  const geo = new THREE.BufferGeometry();
  const toFloat = (attr: THREE.BufferAttribute | THREE.InterleavedBufferAttribute, size: number) => {
    const out = new Float32Array(attr.count * size);
    for (let i = 0; i < attr.count; i++) for (let c = 0; c < size; c++) out[i * size + c] = attr.getComponent(i, c);
    return new THREE.BufferAttribute(out, size);
  };
  geo.setAttribute('position', toFloat(src.getAttribute('position'), 3));
  geo.setAttribute('color', toFloat(src.getAttribute('color'), 3));
  const main = src.getAttribute('_main');
  geo.setAttribute('aMain', main ? toFloat(main, 1) : new THREE.BufferAttribute(new Float32Array(src.getAttribute('position').count), 1));
  const kind = src.getAttribute('_kind');
  geo.setAttribute('aKind', kind ? toFloat(kind, 1) : new THREE.BufferAttribute(new Float32Array(src.getAttribute('position').count), 1));
  geo.setIndex(src.getIndex()!.clone());
  geo.applyMatrix4((mesh as THREE.Mesh).matrixWorld);
  geo.scale(scale, scale, scale);
  geo.computeBoundingBox();
  const b = geo.boundingBox!;
  geo.translate(-(b.min.x + b.max.x) / 2, -b.min.y, -(b.min.z + b.max.z) / 2);
  geo.computeBoundingBox();
  geo.computeBoundingSphere();
  return geo;
}

export async function loadCityModels(names: string[], onProgress: (done: number, total: number) => void) {
  const models = new Map<string, CityModel>();
  let done = 0;
  const total = names.length;
  await Promise.all(names.map(async (name) => {
    if (isSketchfabCity(name)) {
      // Drawn by SfInstances; the layout only needs the size (already in meters).
      const i = SKETCHFAB_CITY[name];
      models.set(name, { name, lod0: new THREE.BufferGeometry(), lod1: null, size: new THREE.Vector3(i.x, i.y, i.z) });
      onProgress(++done, total);
      return;
    }
    const s = modelScale(name);
    const [lod0, lod1] = await Promise.all([
      loadGeometry(`/models/city/${name}.glb`, s),
      WITH_LOD.has(name) ? loadGeometry(`/models/city/${name}_lod.glb`, s) : Promise.resolve(null),
    ]);
    const size = lod0.boundingBox!.getSize(new THREE.Vector3());
    models.set(name, { name, lod0, lod1, size });
    onProgress(++done, total);
  }));
  return models;
}

export const ALL_CITY_MODELS = [...TOWNHOUSES, ...HOUSES, ...SHOPS, ...APARTMENTS, ...TREES, ...PINES, ...BUSHES, ...SMALL_NATURE, ...PROPS];
