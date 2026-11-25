import * as THREE from 'three';
import type { CarShape } from './types';

/**
 * Car paint that also draws headlights, taillights, grille and black lower trim
 * directly on the body, per pixel. The body geometry carries an `aFace` attribute:
 *   x, y = position on the front/rear face (normalized, see carBuilder)
 *   z    = 1 at the front half, 0 at the rear half
 *   w    = raw cross-section height (-1 bottom .. 1 top), for the lower trim
 * Shapes are uniforms, so all cars share one shader program.
 */
export function createBodyMaterial(shape: CarShape, color: THREE.ColorRepresentation) {
  const mat = new THREE.MeshPhysicalMaterial({ color, metalness: 0.6, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.03 });

  const head = { slim: [0.7, 0.56, 0.22, 0.1], round: [0.64, 0.52, 0.15, 0.15], bar: [0.72, 0.56, 0.2, 0.085] }[shape.headlights];
  const grilleW = shape.grille === 'wide' ? 0.56 : shape.grille === 'small' ? 0.36 : 0;
  const uniforms = {
    uHead: { value: new THREE.Vector4(...head) },
    uHeadKind: { value: shape.headlights === 'round' ? 1 : shape.headlights === 'bar' ? 2 : 0 },
    uTail: { value: new THREE.Vector4(0.72, 0.5, 0.22, 0.12) },
    uTailBar: { value: shape.taillights === 'bar' ? 1 : 0 },
    uGrille: { value: new THREE.Vector4(0, -0.02, grilleW, 0.24) },
  };

  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 aFace;\nvarying vec4 vFace;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFace = aFace;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec4 vFace;
uniform vec4 uHead; uniform float uHeadKind; uniform vec4 uTail; uniform float uTailBar; uniform vec4 uGrille;
float sdBox(vec2 p, vec2 b, float r) { vec2 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }
float fill(float d) { float aa = fwidth(d) * 0.8 + 1e-4; return 1.0 - smoothstep(-aa, aa, d); }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
vec2 fp = vec2(abs(vFace.x), vFace.y);
float front = step(0.5, vFace.z);
// headlight
vec2 hp = fp - uHead.xy;
if (uHeadKind < 0.5 || uHeadKind > 1.5) hp.y -= (fp.x - uHead.x) * 0.22;
float dHead = uHeadKind > 0.5 && uHeadKind < 1.5 ? length(hp) - uHead.z : sdBox(hp, uHead.zw, 0.05);
if (uHeadKind > 1.5) dHead = min(dHead, sdBox(fp - vec2(0.0, uHead.y + 0.0), vec2(0.6, 0.016), 0.01));
float mHead = fill(dHead) * front;
float mHousing = fill(dHead - 0.06) * front;
// grille
float mGrille = uGrille.z > 0.0 ? fill(sdBox(fp - uGrille.xy, uGrille.zw, 0.08)) * front : 0.0;
// taillights
float dTail = sdBox(fp - uTail.xy, uTail.zw, 0.04);
if (uTailBar > 0.5) dTail = min(dTail, sdBox(fp - vec2(0.0, uTail.y), vec2(0.95, 0.025), 0.01));
float mTail = fill(dTail) * (1.0 - front);
float mTailHousing = fill(dTail - 0.035) * (1.0 - front);
// lower plastic trim
float mTrim = 1.0 - smoothstep(-0.58, -0.54, vFace.w);
float mBlack = max(max(mHousing, mGrille), mTailHousing);
diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.02), mBlack);
diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.05), mTrim);
diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.95), mHead);
diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.55, 0.02, 0.02), mTail);`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
roughnessFactor = mix(roughnessFactor, 0.65, mTrim);
roughnessFactor = mix(roughnessFactor, 0.12, max(mBlack, mHead));`)
      .replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>
metalnessFactor = mix(metalnessFactor, 0.05, max(mTrim, max(mBlack, max(mHead, mTail))));`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
totalEmissiveRadiance += vec3(1.6, 1.7, 1.8) * mHead + vec3(1.6, 0.05, 0.05) * mTail;`);
  };
  mat.customProgramCacheKey = () => 'carBody';
  return mat;
}
