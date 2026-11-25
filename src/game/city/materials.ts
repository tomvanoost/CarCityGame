import * as THREE from 'three';
import { BLOCK_SPACING, HALF_CITY, ROAD_WIDTH } from './layout';

/** Shared GLSL helpers: value noise + anti-aliased masks. */
const NOISE = /* glsl */ `
float hash21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  float a = hash21(i), b = hash21(i + vec2(1, 0)), c = hash21(i + vec2(0, 1)), d = hash21(i + vec2(1, 1));
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float fbm(vec2 p) { return vnoise(p) * 0.55 + vnoise(p * 2.1) * 0.3 + vnoise(p * 4.3) * 0.15; }
float aaLess(float d, float w) { float aa = fwidth(d) + 1e-4; return 1.0 - smoothstep(w - aa, w + aa, d); }
`;

/** Adds a world-position varying to a standard material's shaders. */
function withWorldPos(shader: THREE.WebGLProgramParametersWithUniforms) {
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nvarying vec3 vWorld;')
    .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
      vec4 cityWorld = vec4(transformed, 1.0);
      #ifdef USE_BATCHING
        cityWorld = batchingMatrix * cityWorld;
      #endif
      #ifdef USE_INSTANCING
        cityWorld = instanceMatrix * cityWorld;
      #endif
      vWorld = (modelMatrix * cityWorld).xyz;`);
  shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>\nvarying vec3 vWorld;\n${NOISE}`);
}

/**
 * Material for all batched models (buildings, trees, props): flat-shaded vertex colors.
 * Per-instance color replaces the "Main" wall color (aMain = 1) instead of tinting everything.
 */
export function createBatchMaterial() {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.85, metalness: 0, envMapIntensity: 0.6 });
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aMain;')
      .replace('#include <color_vertex>', `#include <color_vertex>
        #ifdef USE_BATCHING_COLOR
          vColor.rgb = mix(color.rgb, getBatchingColor(getIndirectIndex(gl_DrawID)).rgb, aMain);
        #endif`);
  };
  mat.customProgramCacheKey = () => 'cityBatch';
  return mat;
}

/** Ground & block slabs: vertex colors with soft natural variation. */
export function createTerrainMaterial() {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0, envMapIntensity: 0.45 });
  mat.onBeforeCompile = (shader) => {
    withWorldPos(shader);
    shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      float big = fbm(vWorld.xz * 0.025);
      float fine = vnoise(vWorld.xz * 1.7);
      diffuseColor.rgb *= 0.86 + 0.22 * big + 0.06 * fine;`);
  };
  mat.customProgramCacheKey = () => 'cityTerrain';
  return mat;
}

/** One big plane under the whole grid; lane lines and zebra crossings are drawn per pixel. */
export function createRoadMaterial() {
  const mat = new THREE.MeshStandardMaterial({ color: 0x3a3d42, roughness: 0.95, metalness: 0, envMapIntensity: 0.25 });
  mat.onBeforeCompile = (shader) => {
    withWorldPos(shader);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        const float SPACING = ${BLOCK_SPACING.toFixed(1)};
        const float HALF = ${HALF_CITY.toFixed(1)};
        const float HW = ${(ROAD_WIDTH / 2).toFixed(2)};
        float lineOffset(float v) { float g = v + HALF; return g - floor(g / SPACING + 0.5) * SPACING; }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        float dx = lineOffset(vWorld.x), dz = lineOffset(vWorld.z);
        float ax = abs(dx), az = abs(dz);
        bool inV = ax < HW, inH = az < HW;
        // asphalt texture
        diffuseColor.rgb *= 0.82 + 0.25 * fbm(vWorld.xz * 0.35) + 0.08 * vnoise(vWorld.xz * 9.0);
        float paint = 0.0;
        if (inV != inH) {
          float across = inV ? dx : dz;     // distance from the road's center line
          float along = inV ? vWorld.z : vWorld.x;
          float toCross = inV ? az : ax;    // distance to the nearest crossing road center
          float aAcross = abs(across);
          // dashed center line (not near crossings)
          float dash = step(fract(along / 6.0), 0.5) * step(HW + 4.0, toCross);
          paint = max(paint, aaLess(aAcross, 0.09) * dash);
          // solid edge lines
          paint = max(paint, aaLess(abs(aAcross - (HW - 0.4)), 0.07) * step(HW + 0.2, toCross));
          // zebra crossing right before each crossing
          float zebraBand = step(HW + 0.8, toCross) * (1.0 - step(HW + 3.6, toCross));
          float stripes = aaLess(abs(fract(across / 1.1) - 0.5), 0.24);
          paint = max(paint, zebraBand * stripes * step(aAcross, HW - 0.7));
        }
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.92), paint);`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.6, paint);');
  };
  mat.customProgramCacheKey = () => 'cityRoad';
  return mat;
}

/**
 * Office towers: instanced unit boxes. Windows are drawn from world position, so
 * any tower size gets correctly sized windows. Glass reflects the sky.
 */
export function createTowerMaterial() {
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.75, metalness: 0 });
  mat.onBeforeCompile = (shader) => {
    withWorldPos(shader);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWN;\nvarying vec3 vTower;')
      .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\nvWN = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * objectNormal);\nvTower = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWN;\nvarying vec3 vTower;')
      .replace('#include <color_fragment>', `#include <color_fragment>
        float glass = 0.0;
        // Round the tower id: interpolated varyings differ slightly per pixel, and a hash
        // would turn that tiny noise into speckles.
        vec2 towerId = floor(vTower.xz + 0.5);
        float style = hash21(towerId * 0.013);
        if (abs(vWN.y) < 0.5) {
          float u = abs(vWN.x) > 0.5 ? vWorld.z : vWorld.x;
          float v = vWorld.y;
          float floorH = 3.6;
          float colW = style > 0.5 ? 3.0 : 2.2;
          float fu = fract(u / colW), fv = fract(v / floorH);
          if (style > 0.75) {
            // horizontal ribbon windows
            glass = step(0.28, fv) * step(fv, 0.88);
          } else {
            glass = step(0.12, fu) * step(fu, 0.88) * step(0.26, fv) * step(fv, 0.86);
          }
          if (v < 4.4) glass = step(0.08, fu) * step(fu, 0.92) * step(v, 3.6); // lobby
          float tint = hash21(floor(vec2(u / colW, v / floorH) + 0.001) * 0.37 + towerId * 0.011);
          vec3 glassCol = mix(vec3(0.08, 0.13, 0.2), vec3(0.18, 0.24, 0.3), tint * 0.6);
          if (tint > 0.93) glassCol = vec3(0.55, 0.5, 0.42); // a few open curtains
          diffuseColor.rgb = mix(diffuseColor.rgb, glassCol, glass);
        } else {
          diffuseColor.rgb *= 0.55; // roof
        }`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.06, glass);')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = mix(metalnessFactor, 0.9, glass);');
  };
  mat.customProgramCacheKey = () => 'cityTower';
  return mat;
}

/** Pond / fountain water with gentle moving ripples. */
export function createWaterMaterial() {
  const uTime = { value: 0 };
  const mat = new THREE.MeshStandardMaterial({ color: 0x3d8fd6, roughness: 0.08, metalness: 0.2 });
  mat.onBeforeCompile = (shader) => {
    withWorldPos(shader);
    shader.uniforms.uTime = uTime;
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        vec2 wp = vWorld.xz * 0.6;
        float n1 = vnoise(wp + uTime * 0.4), n2 = vnoise(wp * 1.7 - uTime * 0.3);
        normal = normalize(normal + (vec3(n1 - 0.5, 0.0, n2 - 0.5) * 0.35));`);
  };
  mat.customProgramCacheKey = () => 'cityWater';
  return { mat, uTime };
}
