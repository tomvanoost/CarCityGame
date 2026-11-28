import * as THREE from 'three';

/**
 * Faceted ("flat") look without `flatShading`: every triangle gets its own vertices with the face normal.
 * Looks the same as a flatShading material, but the material can then share the normal shader program
 * with the other vertex-colored materials (one compiled program less for each flat material dropped).
 */
export function flatNormals(geo: THREE.BufferGeometry): THREE.BufferGeometry {
  const g = geo.index ? geo.toNonIndexed() : geo;
  if (g !== geo) geo.dispose();
  g.deleteAttribute('normal');
  g.computeVertexNormals(); // non-indexed: each vertex gets its own triangle's normal
  return g;
}
