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
/** Measurements (car-local meters, +Z forward) for seams, handles and arch trim. */
export interface BodyDetails {
  /** Front door leading edge, B-pillar seam, rear door trailing edge (z). Use -99 to skip. */
  doorFront: number;
  doorMid: number;
  doorRear: number;
  /** Hood rear line and trunk front line (z). */
  cowl: number;
  trunk: number;
  belt: number;
  halfWidth: number;
  frontAxle: number;
  rearAxle: number;
  wheelRadius: number;
  archRadius: number;
  /** Thickness of the black wheel-arch trim (SUVs have more). */
  archTrim: number;
}

export function createBodyMaterial(shape: CarShape, color: THREE.ColorRepresentation, d: BodyDetails) {
  const mat = new THREE.MeshPhysicalMaterial({ color, metalness: 0.6, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.03 });

  const head = { slim: [0.7, 0.56, 0.22, 0.1], round: [0.64, 0.52, 0.15, 0.15], bar: [0.72, 0.56, 0.2, 0.085] }[shape.headlights];
  const grilleW = shape.grille === 'wide' ? 0.56 : shape.grille === 'small' ? 0.36 : 0;
  const uniforms = {
    uHead: { value: new THREE.Vector4(...head) },
    uHeadKind: { value: shape.headlights === 'round' ? 1 : shape.headlights === 'bar' ? 2 : 0 },
    uTail: { value: new THREE.Vector4(0.72, 0.5, 0.22, 0.12) },
    uTailBar: { value: shape.taillights === 'bar' ? 1 : 0 },
    uGrille: { value: new THREE.Vector4(0, -0.02, grilleW, 0.24) },
    uDoors: { value: new THREE.Vector4(d.doorFront, d.doorMid, d.doorRear, d.cowl) },
    uBody: { value: new THREE.Vector4(d.trunk, d.belt, d.halfWidth, d.archTrim) },
    uArch: { value: new THREE.Vector4(d.frontAxle, d.rearAxle, d.wheelRadius, d.archRadius) },
  };

  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 aFace;\nvarying vec4 vFace;\nvarying vec3 vLocal;\nvarying vec3 vObjN;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFace = aFace;\nvLocal = position;\nvObjN = normal;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec4 vFace;
varying vec3 vLocal;
varying vec3 vObjN;
uniform vec4 uDoors; uniform vec4 uBody; uniform vec4 uArch;
uniform vec4 uHead; uniform float uHeadKind; uniform vec4 uTail; uniform float uTailBar; uniform vec4 uGrille;
float sdBox(vec2 p, vec2 b, float r) { vec2 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }
float fill(float d) { float aa = fwidth(d) * 0.8 + 1e-4; return 1.0 - smoothstep(-aa, aa, d); }
float line(float d, float w) { float aa = fwidth(d) + 1e-4; return 1.0 - smoothstep(w - aa, w + aa, abs(d)); }`)
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
diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.55, 0.02, 0.02), mTail);
// ---- body details (car-local meters) ----
vec3 lp = vLocal;
float sideN = step(0.6, abs(vObjN.x));
float topN = step(0.7, vObjN.y);
float paintArea = (1.0 - mTrim) * (1.0 - mBlack) * (1.0 - mHead) * (1.0 - mTail);
float doorBand = step(0.3, lp.y) * step(lp.y, uBody.y - 0.04);
float seam = 0.0;
seam = max(seam, sideN * doorBand * line(lp.z - uDoors.x, 0.005));
seam = max(seam, sideN * doorBand * line(lp.z - uDoors.y, 0.005));
seam = max(seam, sideN * doorBand * line(lp.z - uDoors.z, 0.005));
seam = max(seam, topN * line(lp.z - uDoors.w, 0.005) * step(abs(lp.x), uBody.z * 0.8));
seam = max(seam, topN * line(abs(lp.x) - uBody.z * 0.66, 0.005) * step(uDoors.w, lp.z) * step(lp.z, uDoors.w + 1.6));
seam = max(seam, topN * line(lp.z - uBody.x, 0.005) * step(abs(lp.x), uBody.z * 0.78));
// door handles: just ahead of the rear edge of each door
float hy = uBody.y - 0.13;
float handle = sideN * fill(sdBox(vec2(lp.z - (uDoors.y + 0.17), lp.y - hy), vec2(0.1, 0.017), 0.015));
handle = max(handle, sideN * step(-90.0, uDoors.z) * fill(sdBox(vec2(lp.z - (uDoors.z + 0.17), lp.y - hy), vec2(0.1, 0.017), 0.015)));
// black trim around the wheel arches
float dF = length(vec2(lp.z - uArch.x, lp.y - uArch.z)), dR = length(vec2(lp.z - uArch.y, lp.y - uArch.z));
float arch = sideN * step(uArch.z * 0.55, lp.y) * max(
  step(uArch.w - 0.01, dF) * step(dF, uArch.w + uBody.w),
  step(uArch.w - 0.01, dR) * step(dR, uArch.w + uBody.w));
// character line along the side: a soft highlight that catches the light
float crease = sideN * line(lp.y - (uBody.y - 0.2), 0.012) * step(uArch.y + uArch.w, lp.z) * step(lp.z, uArch.x - uArch.w);
diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 1.25 + 0.04, crease * paintArea);
diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.015), seam * paintArea);
diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.04), arch * paintArea);
diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.55), handle * paintArea);
// grille mesh and light details
float mesh = max(step(0.78, fract(lp.x * 16.0)), step(0.78, fract(lp.y * 16.0)));
diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.12), mGrille * mesh * (1.0 - mHead));
float led = 0.55 + 0.45 * step(0.45, fract(fp.x * 22.0));
float tailBars = 0.6 + 0.4 * step(0.5, fract(fp.y * 26.0));
float mArchTrim = arch * paintArea;`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
roughnessFactor = mix(roughnessFactor, 0.65, mTrim);
roughnessFactor = mix(roughnessFactor, 0.12, max(mBlack, mHead));
roughnessFactor = mix(roughnessFactor, 0.7, mArchTrim);
roughnessFactor = mix(roughnessFactor, 0.2, handle);`)
      .replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>
metalnessFactor = mix(metalnessFactor, 0.05, max(mTrim, max(mBlack, max(mHead, mTail))));
metalnessFactor = mix(metalnessFactor, 0.0, mArchTrim);
metalnessFactor = mix(metalnessFactor, 1.0, handle);`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
totalEmissiveRadiance += vec3(1.6, 1.7, 1.8) * mHead * led + vec3(1.6, 0.05, 0.05) * mTail * tailBars;`);
  };
  mat.customProgramCacheKey = () => 'carBody';
  return mat;
}
