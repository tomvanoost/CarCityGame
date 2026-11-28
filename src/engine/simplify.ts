import * as THREE from 'three';
import type { MeshoptSimplifier as Simplifier } from 'meshoptimizer/simplifier';

/**
 * Lighter versions of meshes for things far away (people, traffic cars): the same vertices (so skinning,
 * colors and UVs stay as they are) with fewer triangles, made once at load time with meshoptimizer.
 * The simplifier is its own small file (~19 kB gzip), loaded in the background on first use.
 */
let simplifier: typeof Simplifier | null = null;
let loading: Promise<typeof Simplifier | null> | null = null;

export function loadSimplifier(): Promise<typeof Simplifier | null> {
  loading ??= import('meshoptimizer/simplifier')
    .then(async ({ MeshoptSimplifier }) => { await MeshoptSimplifier.ready; simplifier = MeshoptSimplifier; return simplifier; })
    .catch(() => null);
  return loading;
}

/** The simplifier has loaded (before that, lighter() returns the geometry unchanged). */
export const simplifierReady = () => !!simplifier;

const cache = new WeakMap<THREE.BufferGeometry, THREE.BufferGeometry>();

/**
 * A lighter copy of `geo` with about `ratio` of the triangles (shared attribute buffers, new index), or
 * `geo` itself when that isn't possible (simplifier not loaded yet, no index, or it would hardly help).
 * permissive: may also collapse across color / normal seams (for models made of many separately colored
 * parts, like the light traffic cars, which otherwise hardly simplify at all).
 */
export function lighter(geo: THREE.BufferGeometry, ratio: number, error = 0.02, lockBorder = true, permissive = false): THREE.BufferGeometry {
  const hit = cache.get(geo);
  if (hit) return hit;
  const index = geo.getIndex(), pos = geo.getAttribute('position');
  if (!simplifier || !index || !pos || index.count < 600) return geo;
  const p = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) { p[i * 3] = pos.getX(i); p[i * 3 + 1] = pos.getY(i); p[i * 3 + 2] = pos.getZ(i); }
  const src = new Uint32Array(index.count);
  for (let i = 0; i < index.count; i++) src[i] = index.getX(i);
  const target = Math.max(3, Math.floor((index.count / 3) * ratio) * 3);
  const [out] = simplifier.simplify(src, p, 3, target, error, lockBorder ? ['LockBorder'] : permissive ? ['Permissive'] : []);
  if (out.length > index.count * 0.85) { cache.set(geo, geo); return geo; }
  const g = new THREE.BufferGeometry();
  for (const [name, attr] of Object.entries(geo.attributes)) g.setAttribute(name, attr); // shared buffers
  g.setIndex(new THREE.BufferAttribute(pos.count > 65535 ? out : new Uint16Array(out), 1));
  g.groups = [];
  if (!geo.boundingSphere) geo.computeBoundingSphere();
  g.boundingSphere = geo.boundingSphere!.clone();
  if (geo.boundingBox) g.boundingBox = geo.boundingBox.clone();
  cache.set(geo, g);
  return g;
}
