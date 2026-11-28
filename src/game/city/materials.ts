import * as THREE from 'three';
import { BLOCK_SPACING, HALF_CITY, ROAD_WIDTH, WIDE_HALF } from './layout';
import { LAKE } from './outskirts';
import { SKY } from '../world/sky';
import { WEATHER } from '../world/weather';

/** Sidewalk and curb colors (the ground shader recognises them to draw paving tiles and curb stones). */
export const SIDEWALK_COLOR = '#b9b5ad';
export const CURB_COLOR = '#9d9991';
const glslColor = (hex: string) => { const c = new THREE.Color(hex); return `vec3(${c.r.toFixed(4)}, ${c.g.toFixed(4)}, ${c.b.toFixed(4)})`; };

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
    withWorldPos(shader);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aMain;\nattribute float aKind;\nvarying float vKind;')
      .replace('#include <color_vertex>', `#include <color_vertex>
        vKind = aKind;
        #ifdef USE_BATCHING_COLOR
          vColor.rgb = mix(color.rgb, getBatchingColor(getIndirectIndex(gl_DrawID)).rgb, aMain);
        #endif`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vKind;')
      .replace('#include <color_fragment>', `#include <color_fragment>
        // Surface kinds (from the model build): 2 = window glass, 3 = roof tiles.
        float glassM = step(1.5, vKind) * (1.0 - step(2.5, vKind));
        float roofM = step(2.5, vKind);
        // Walls: subtle plaster / stone variation.
        float wallN = fbm(vWorld.xz * 0.9 + vWorld.y * 0.7);
        diffuseColor.rgb *= mix(0.9 + 0.18 * wallN, 1.0, glassM);
        // Roofs: rows of tiles.
        float rows = smoothstep(0.7, 0.95, fract(vWorld.y * 4.5));
        diffuseColor.rgb *= 1.0 - roofM * rows * 0.3;
        // Windows: dark reflective glass, a few with curtains.
        float cell = hash21(floor(vWorld.xz * 0.6) + floor(vWorld.y * 0.32) * 7.0);
        vec3 glassCol = mix(vec3(0.06, 0.1, 0.15), vec3(0.15, 0.2, 0.26), cell);
        if (cell > 0.88) glassCol = vec3(0.5, 0.42, 0.3);
        diffuseColor.rgb = mix(diffuseColor.rgb, glassCol, glassM);
        // Soft "ambient occlusion" near the ground: buildings and trees look grounded.
        diffuseColor.rgb *= mix(0.62, 1.0, smoothstep(0.15, 2.6, vWorld.y));`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.07, glassM);\nroughnessFactor = mix(roughnessFactor, 0.6, roofM);')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = mix(metalnessFactor, 0.8, glassM * (1.0 - step(0.88, cell)));');
  };
  mat.customProgramCacheKey = () => 'cityBatch';
  return mat;
}

/**
 * A tileable grass texture drawn on a canvas at load time (no download): soft clumps plus thousands
 * of short blades in lighter and darker, slightly yellow or blue-green tones. It is a multiplier
 * around mid-grey, so the lawn keeps the color the city gave it.
 */
let grassTex: THREE.Texture | null = null;
let grassMean = 0.5;
function grassTexture(): THREE.Texture {
  if (grassTex) return grassTex;
  const N = 512, c = document.createElement('canvas');
  c.width = c.height = N;
  const g = c.getContext('2d')!;
  let seed = 11;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  g.fillStyle = 'rgb(128,128,128)';
  g.fillRect(0, 0, N, N);
  // Draws a shape 9 times (shifted by the tile size) so the texture tiles without seams.
  const wrap = (draw: (ox: number, oy: number) => void) => { for (const ox of [-N, 0, N]) for (const oy of [-N, 0, N]) draw(ox, oy); };
  // Clumps: soft lighter / darker patches.
  for (let i = 0; i < 70; i++) {
    const x = rnd() * N, y = rnd() * N, r = 14 + rnd() * 46, v = 80 + rnd() * 95;
    wrap((ox, oy) => {
      const gr = g.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r);
      gr.addColorStop(0, `rgba(${v},${v + 6},${v - 10},0.8)`);
      gr.addColorStop(1, `rgba(${v},${v},${v},0)`);
      g.fillStyle = gr;
      g.fillRect(x + ox - r, y + oy - r, r * 2, r * 2);
    });
  }
  // Blades: short strokes, seen from above they point every way; dark ones first, light tips on top.
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < 16000; i++) {
      const x = rnd() * N, y = rnd() * N, len = 3 + rnd() * 7, a = rnd() * Math.PI * 2;
      const t = rnd();
      const v = pass === 0 ? 40 + t * 45 : 165 + t * 55;
      const warm = (rnd() - 0.35) * (pass === 0 ? 18 : 40); // a little yellow (dry) or blue-green
      g.strokeStyle = `rgba(${Math.round(v + warm)},${Math.round(v + 8)},${Math.round(v - 14 - warm)},${pass === 0 ? 0.85 : 0.7})`;
      g.lineWidth = pass === 0 ? 2 : 1.3;
      wrap((ox, oy) => {
        if (x + ox < -12 || x + ox > N + 12 || y + oy < -12 || y + oy > N + 12) return;
        g.beginPath();
        g.moveTo(x + ox, y + oy);
        g.lineTo(x + ox + Math.cos(a) * len, y + oy + Math.sin(a) * len);
        g.stroke();
      });
    }
  }
  // Average brightness, so the shader can keep the lawn's overall color (the texture only adds detail).
  const px = g.getImageData(0, 0, N, N).data;
  let sum = 0;
  for (let i = 0; i < px.length; i += 4) sum += px[i] + px[i + 1] + px[i + 2];
  grassMean = sum / (px.length / 4) / 3 / 255;
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  tex.colorSpace = THREE.NoColorSpace; // a brightness / tint multiplier, not a color
  grassTex = tex;
  return tex;
}

/**
 * Ground & block slabs: vertex colors with soft natural variation. Green ground (lawns, park,
 * countryside) gets the grass texture, mixed at two sizes plus large-scale noise and dry patches so
 * the tiling never shows; sidewalks and lots keep their plain look.
 */
export function createTerrainMaterial() {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0, envMapIntensity: 0.45 });
  const tex = grassTexture();
  mat.onBeforeCompile = (shader) => {
    withWorldPos(shader);
    shader.uniforms.uGrass = { value: tex };
    shader.uniforms.uGrassMean = { value: grassMean };
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform sampler2D uGrass;
        uniform float uGrassMean;
        const vec3 SIDEWALK = ${glslColor(SIDEWALK_COLOR)};
        const vec3 CURB = ${glslColor(CURB_COLOR)};
        float lineOffsetT(float v) { float g = v + ${HALF_CITY.toFixed(1)}; return g - floor(g / ${BLOCK_SPACING.toFixed(1)} + 0.5) * ${BLOCK_SPACING.toFixed(1)}; }
        float halfOfT(float v) { float i = floor((v + ${HALF_CITY.toFixed(1)}) / ${BLOCK_SPACING.toFixed(1)} + 0.5); return mod(i, 2.0) > 0.5 ? ${WIDE_HALF.toFixed(2)} : ${(ROAD_WIDTH / 2).toFixed(2)}; }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
      float big = fbm(vWorld.xz * 0.025);
      float fine = vnoise(vWorld.xz * 1.7);
      // Grass where the ground is green.
      vec3 vc = diffuseColor.rgb;
      float grassM = smoothstep(0.015, 0.06, vc.g - max(vc.r, vc.b));
      if (grassM > 0.0) {
        // Two sizes, slightly rotated against each other, so the pattern never lines up.
        vec2 uv = vWorld.xz;
        vec3 g1 = texture2D(uGrass, uv / 1.7).rgb;
        vec3 g2 = texture2D(uGrass, mat2(0.8, -0.6, 0.6, 0.8) * uv / 6.1 + 0.37).rgb;
        float pick = smoothstep(0.35, 0.65, vnoise(uv * 0.09));
        vec3 gt = mix(g1, g2, 0.35 + 0.3 * pick) / uGrassMean;
        // Up close the blades show; far away they average out to a soft lawn.
        float dist = length(vWorld - cameraPosition);
        gt = mix(gt, vec3(1.0), smoothstep(60.0, 220.0, dist) * 0.6);
        vec3 grass = vc * gt;
        // Large patches: a bit lusher here, drier (yellower) there.
        float dry = smoothstep(0.55, 0.8, fbm(uv * 0.018 + 3.1));
        grass = mix(grass, grass * vec3(1.18, 1.05, 0.72), dry * 0.55);
        // Clover patches: deeper blue-green with little round leaves.
        float cloverM = smoothstep(0.62, 0.72, vnoise(uv * 0.35 + 7.3)) * (1.0 - smoothstep(60.0, 120.0, dist));
        if (cloverM > 0.0) {
          vec2 cl = mat2(0.8, -0.6, 0.6, 0.8) * uv * 13.0;
          vec2 cf = fract(cl) - 0.5 + (vec2(hash21(floor(cl)), hash21(floor(cl) + 3.1)) - 0.5) * 0.7;
          float leaf = (1.0 - smoothstep(0.12, 0.26, length(cf))) * step(0.35, hash21(floor(cl) + 9.7));
          vec3 clover = grass * vec3(0.82, 1.0, 0.92) * mix(0.92, 1.08, leaf);
          grass = mix(grass, clover, cloverM * 0.8);
        }
        grass *= 0.9 + 0.2 * big;
        // A touch less cartoon-saturated, like real grass.
        grass = mix(grass, vec3(dot(grass, vec3(0.3, 0.59, 0.11))), 0.12);
        diffuseColor.rgb = mix(vc * (0.86 + 0.22 * big + 0.06 * fine), grass, grassM);
      } else {
        diffuseColor.rgb *= 0.86 + 0.22 * big + 0.06 * fine;
      }
      // City sidewalks: square paving tiles with mortar joints, and a lighter curb stone along the road.
      float near = 1.0 - smoothstep(40.0, 90.0, length(vWorld - cameraPosition));
      if (near > 0.0 && length(vc - SIDEWALK) < 0.02) {
        float rdx = lineOffsetT(vWorld.x), rdz = lineOffsetT(vWorld.z);
        float edge = min(abs(rdx) - halfOfT(vWorld.x), abs(rdz) - halfOfT(vWorld.z)); // meters from the road edge
        vec2 tile = vWorld.xz / 0.75;
        vec2 tf = abs(fract(tile) - 0.5);
        float joint = aaLess(0.5 - max(tf.x, tf.y), 0.035);
        float tone = 0.94 + 0.1 * hash21(floor(tile));
        vec3 paving = diffuseColor.rgb * tone * (1.0 - 0.18 * joint);
        // Curb stone: a light band 0.3 m wide with a joint every metre.
        float curb = 1.0 - step(0.3, edge);
        float along = abs(rdx) - halfOfT(vWorld.x) < abs(rdz) - halfOfT(vWorld.z) ? vWorld.z : vWorld.x;
        float cj = aaLess(abs(fract(along) - 0.5) - 0.48, 0.0);
        vec3 curbCol = vec3(0.6, 0.59, 0.56) * (1.0 - 0.25 * cj) * (0.95 + 0.08 * fine);
        diffuseColor.rgb = mix(diffuseColor.rgb, mix(paving, curbCol, curb), near);
      }
      // The curb's side: stone blocks with a joint every metre.
      if (near > 0.0 && length(vc - CURB) < 0.02) {
        float cj = aaLess(abs(fract(vWorld.x + vWorld.z) - 0.5) - 0.48, 0.0);
        diffuseColor.rgb *= 1.0 - 0.3 * cj * near;
      }`);
  };
  mat.customProgramCacheKey = () => 'cityTerrainGrass2';
  return mat;
}

/** One big plane under the whole grid; lane lines and zebra crossings are drawn per pixel. */
export function createRoadMaterial() {
  const mat = new THREE.MeshStandardMaterial({ color: 0x3a3d42, roughness: 0.95, metalness: 0, envMapIntensity: 0.25, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
  mat.onBeforeCompile = (shader) => {
    withWorldPos(shader);
    shader.uniforms.uWet = WEATHER.wet;
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform float uWet;
        const float SPACING = ${BLOCK_SPACING.toFixed(1)};
        const float HALF = ${HALF_CITY.toFixed(1)};
        const float SMALL = ${(ROAD_WIDTH / 2).toFixed(2)};
        const float WIDE = ${WIDE_HALF.toFixed(2)};
        float lineOffset(float v) { float g = v + HALF; return g - floor(g / SPACING + 0.5) * SPACING; }
        // Every other grid line (the odd ones) is a wide avenue.
        float halfOf(float v) { float i = floor((v + HALF) / SPACING + 0.5); return mod(i, 2.0) > 0.5 ? WIDE : SMALL; }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        float dx = lineOffset(vWorld.x), dz = lineOffset(vWorld.z);
        float hx = halfOf(vWorld.x), hz = halfOf(vWorld.z);
        float ax = abs(dx), az = abs(dz);
        bool inV = ax < hx, inH = az < hz;
        // asphalt texture
        diffuseColor.rgb *= 0.82 + 0.25 * fbm(vWorld.xz * 0.35) + 0.08 * vnoise(vWorld.xz * 9.0);
        float paint = 0.0;
        if (inV != inH) {
          float across = inV ? dx : dz;     // distance from the road's center line
          float along = inV ? vWorld.z : vWorld.x;
          float toCross = inV ? az : ax;    // distance to the nearest crossing road center
          float HW = inV ? hx : hz;         // this road's half width
          float HC = inV ? hz : hx;         // the crossing road's half width
          float aAcross = abs(across);
          float nearCross = step(toCross, HC + 30.0);
          // The half of the road that drives towards the crossing ahead (right-hand traffic).
          float approach = inV ? step(0.0, dx * dz) : step(dx * dz, 0.0);
          if (HW > SMALL + 0.5) {
            // Wide avenue: double line in the middle, lane lines (dashed, solid near crossings).
            paint = max(paint, (aaLess(abs(aAcross - 0.25), 0.08)) * step(HC + 0.2, toCross));
            float dashW = step(fract(along / 12.0), 0.25);
            for (int k = 0; k < 2; k++) {
              float lx = k == 0 ? 4.33 : 7.67;
              paint = max(paint, aaLess(abs(aAcross - lx), 0.08) * step(HC + 4.5, toCross) * max(dashW, nearCross));
            }
          } else {
            // Small road: dashed center line (not near crossings).
            float dash = step(fract(along / 6.0), 0.5) * step(HC + 4.0, toCross);
            paint = max(paint, aaLess(aAcross, 0.09) * dash);
          }
          // solid edge lines
          paint = max(paint, aaLess(abs(aAcross - (HW - 0.4)), 0.07) * step(HC + 0.2, toCross));
          // zebra crossing right before each crossing
          float zebraBand = step(HC + 0.8, toCross) * (1.0 - step(HC + 3.6, toCross));
          float stripes = aaLess(abs(fract(across / 1.1) - 0.5), 0.24);
          paint = max(paint, zebraBand * stripes * step(aAcross, HW - 0.7));
          // stop line across the lanes that drive towards the crossing
          paint = max(paint, step(HC + 4.0, toCross) * (1.0 - step(HC + 4.45, toCross)) * approach * step(0.5, aAcross) * step(aAcross, HW - 0.5));
        }
        // Details up close: repair patches, fine cracks, worn paint, tyre tracks, manhole covers.
        float nearR = 1.0 - smoothstep(35.0, 110.0, length(vWorld - cameraPosition));
        if (nearR > 0.0) {
          // Patches: now and then a darker rectangle of newer asphalt with a dark seam.
          vec2 pc = floor(vWorld.xz / 9.0), pf = fract(vWorld.xz / 9.0);
          float ph = hash21(pc + 17.0);
          if (ph > 0.86) {
            vec2 lo = vec2(0.15 + 0.3 * hash21(pc + 1.0), 0.15 + 0.3 * hash21(pc + 2.0)), hi = lo + vec2(0.25 + 0.25 * hash21(pc + 3.0), 0.2 + 0.3 * hash21(pc + 4.0));
            vec2 inP = step(lo, pf) * step(pf, hi);
            float patchM = inP.x * inP.y;
            vec2 dd = min(pf - lo, hi - pf) * 9.0;
            float seam = patchM * aaLess(min(dd.x, dd.y), 0.06);
            diffuseColor.rgb *= mix(1.0, 0.86, patchM * nearR) * (1.0 - 0.35 * seam * nearR);
          }
          // Fine cracks: thin dark lines along a noise ridge, only here and there.
          float cr = abs(vnoise(vWorld.xz * 2.2) - 0.5);
          float crackM = aaLess(cr, 0.006) * smoothstep(0.72, 0.85, vnoise(vWorld.xz * 0.1 + 5.0)) * (1.0 - smoothstep(10.0, 30.0, length(vWorld - cameraPosition)));
          diffuseColor.rgb *= 1.0 - 0.22 * crackM;
          // Worn paint: lines a bit patchy.
          paint *= 1.0 - 0.35 * smoothstep(0.5, 0.85, vnoise(vWorld.xz * 1.3)) * nearR;
          if (inV != inH) {
            float across = inV ? dx : dz, along = inV ? vWorld.z : vWorld.x;
            float aAcross = abs(across), HW = inV ? hx : hz;
            // Tyre tracks: slightly darker, smoother bands where the wheels roll (in each lane).
            float lane = HW > SMALL + 0.5 ? mod(aAcross, 3.33) : aAcross;
            float laneC = HW > SMALL + 0.5 ? 1.67 : 2.5;
            float track = (aaLess(abs(lane - (laneC - 0.8)), 0.25) + aaLess(abs(lane - (laneC + 0.8)), 0.25)) * (1.0 - paint);
            diffuseColor.rgb *= 1.0 - 0.07 * track * nearR;
            // Manhole covers: a round iron lid every ~35 m, in the middle of a lane.
            float cell = floor(along / 35.0);
            float mh = hash21(vec2(cell, inV ? floor((vWorld.x + HALF) / SPACING + 0.5) : floor((vWorld.z + HALF) / SPACING + 0.5) + 50.0));
            if (mh > 0.45) {
              float side = mh > 0.72 ? 1.0 : -1.0;
              vec2 c = vec2((cell + 0.3 + 0.4 * mh) * 35.0, side * laneC);
              vec2 rel = vec2(along - c.x, across - c.y);
              float r = length(rel);
              float lid = 1.0 - smoothstep(0.34, 0.36, r);
              float rim = aaLess(abs(r - 0.33), 0.025);
              float grid = aaLess(abs(fract(rel.x * 6.0) - 0.5) - 0.42, 0.0) * step(r, 0.3);
              vec3 iron = vec3(0.13, 0.13, 0.14) * (1.0 - 0.3 * grid) + vec3(0.05) * rim;
              diffuseColor.rgb = mix(diffuseColor.rgb, iron, lid * nearR);
              paint *= 1.0 - lid;
            }
          }
        }
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.92), paint);
        // Rain: the asphalt gets darker, and puddles form in the low spots (they shine like mirrors).
        float puddle = smoothstep(0.62, 0.7, fbm(vWorld.xz * 0.11 + 3.1)) * uWet;
        diffuseColor.rgb *= 1.0 - 0.3 * uWet - 0.25 * puddle;`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.6, paint);\nroughnessFactor = mix(roughnessFactor, 0.55, uWet * 0.6);\nroughnessFactor = mix(roughnessFactor, 0.05, puddle);');
  };
  mat.customProgramCacheKey = () => 'cityRoad2';
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
          // Window opening (slightly larger than the glass): the rim around the glass is the frame.
          float open = 0.0, frame = 0.0;
          if (style > 0.75) {
            // horizontal ribbon windows with thin mullions
            open = step(0.26, fv) * step(fv, 0.9);
            glass = step(0.29, fv) * step(fv, 0.87) * (1.0 - step(abs(fu - 0.5), 0.02));
          } else {
            open = step(0.1, fu) * step(fu, 0.9) * step(0.24, fv) * step(fv, 0.88);
            glass = step(0.13, fu) * step(fu, 0.87) * step(0.27, fv) * step(fv, 0.85);
            // A divider in the middle of each window (two panes).
            glass *= 1.0 - step(abs(fu - 0.5), 0.018);
          }
          frame = open * (1.0 - glass);
          float sill = step(0.19, fv) * step(fv, 0.24) * (style > 0.75 ? 1.0 : step(0.1, fu) * step(fu, 0.9));
          bool lobby = v < 4.4;
          if (lobby) {
            open = step(0.06, fu) * step(fu, 0.94) * step(v, 3.75);
            glass = step(0.08, fu) * step(fu, 0.92) * step(v, 3.6);
            frame = open * (1.0 - glass);
            sill = 0.0;
          }
          // Entrance: a dark double door with a light frame in the middle of each side.
          float along = abs(vWN.x) > 0.5 ? vTower.z : vTower.x;
          float du = abs(u - along);
          float door = lobby ? step(du, 1.5) * step(v, 3.0) : 0.0;
          float doorFrame = lobby ? (step(du, 1.65) * step(v, 3.15)) * (1.0 - door) + door * step(abs(du - 0.0), 0.05) : 0.0;
          // vertical fins every other column, a floor slab line and a darker band between floors
          float fin = step(0.9, fract(u / (colW * 2.0)));
          float slab = 1.0 - step(0.07, fv);
          float spandrel = lobby ? 0.0 : step(0.07, fv) * step(fv, 0.24) * (1.0 - sill);
          diffuseColor.rgb *= 1.0 + fin * 0.18 * (1.0 - open);
          diffuseColor.rgb *= 1.0 - slab * 0.18;
          diffuseColor.rgb *= 1.0 - spandrel * 0.08;
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.86, 0.87, 0.88), frame * 0.85); // light window frames
          diffuseColor.rgb *= 1.0 - sill * 0.35; // shadow under the window: depth
          float tint = hash21(floor(vec2(u / colW, v / floorH) + 0.001) * 0.37 + towerId * 0.011);
          vec3 glassCol = mix(vec3(0.08, 0.13, 0.2), vec3(0.18, 0.24, 0.3), tint * 0.6);
          if (tint > 0.93) glassCol = vec3(0.55, 0.5, 0.42); // a few open curtains
          diffuseColor.rgb = mix(diffuseColor.rgb, glassCol, glass);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.05, 0.07, 0.1), door);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.8, 0.82, 0.85), clamp(doorFrame, 0.0, 1.0));
          glass = max(glass, door);
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
/**
 * Water (the lake, the stream, the park pond): calm big swells with fine ripples on top (the ripples
 * fade out in the distance, so far water lies smooth and mirrors the sky), sun glitter that twinkles on
 * the sun's reflection, the sky's horizon color at low angles (orange at sunset), and on the lake a
 * deep blue middle, turquoise shallows and a soft moving foam line along the shore.
 */
export function createWaterMaterial() {
  const uTime = { value: 0 };
  // (Sky reflection turned down: the calm water would otherwise mirror the pale sky and lose its blue.)
  const mat = new THREE.MeshStandardMaterial({ color: 0x3d8fd6, roughness: 0.09, metalness: 0.05, envMapIntensity: 0.3 });
  mat.onBeforeCompile = (shader) => {
    withWorldPos(shader);
    shader.uniforms.uTime = uTime;
    shader.uniforms.uLake = { value: new THREE.Vector4(LAKE.x, LAKE.z, LAKE.rx, LAKE.rz) };
    shader.uniforms.uSunDir = { value: SKY.sunDir };
    shader.uniforms.uHorizon = { value: SKY.horizon };
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uTime; uniform vec4 uLake; uniform vec3 uSunDir; uniform vec3 uHorizon;')
      .replace('#include <color_fragment>', `#include <color_fragment>
        vec3 toCam = normalize(cameraPosition - vWorld);
        float lakeE = length((vWorld.xz - uLake.xy) / uLake.zw); // 0 in the middle .. 1 at the shore
        float onLake = 1.0 - step(1.02, lakeE);
        // Deep blue in the middle, turquoise shallows near the shore (the pond and stream keep their color).
        vec3 lakeCol = mix(vec3(0.05, 0.27, 0.52), vec3(0.18, 0.58, 0.70), smoothstep(0.80, 1.0, lakeE));
        diffuseColor.rgb = mix(diffuseColor.rgb, lakeCol, onLake);
        // A soft foam line that rolls towards the beach, and a white edge right at the sand.
        float shoreM = (1.0 - lakeE) * uLake.w; // ~meters from the shore
        float roll = smoothstep(0.82, 1.0, sin(shoreM * 0.9 + uTime * 1.3 + vnoise(vWorld.xz * 0.15) * 4.0));
        float foam = onLake * (roll * (1.0 - smoothstep(0.0, 9.0, shoreM)) * 0.45 + (1.0 - smoothstep(0.0, 1.6, shoreM)) * 0.6);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.96, 0.98, 1.0), clamp(foam, 0.0, 0.85));
        // Looking across the water at a low angle it takes the sky's horizon color.
        float fres = pow(1.0 - max(toCam.y, 0.0), 6.0);
        diffuseColor.rgb = mix(diffuseColor.rgb, uHorizon, fres * 0.3);`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        // Waves in world space: slow big swells + quick small ripples (fading with distance).
        float near = 1.0 - smoothstep(50.0, 240.0, length(vWorld.xz - cameraPosition.xz));
        vec2 wp = vWorld.xz;
        float s1 = vnoise(wp * 0.07 + uTime * vec2(0.05, 0.03)), s2 = vnoise(wp * 0.07 + vec2(5.2, 1.3) - uTime * 0.04);
        float r1 = vnoise(wp * 0.55 + uTime * 0.35), r2 = vnoise(wp * 0.7 - uTime * 0.3 + 7.1);
        vec3 waterN = normalize(vec3((s1 - 0.5) * 0.22 + (r1 - 0.5) * 0.3 * near, 1.0, (s2 - 0.5) * 0.22 + (r2 - 0.5) * 0.3 * near));
        normal = normalize((viewMatrix * vec4(waterN, 0.0)).xyz);
        // Lean the surface a little towards the viewer: at low angles calm water would mirror the pale
        // sky almost fully; this keeps more of the water's own blue (a common trick for game water).
        normal = normalize(normal + normalize(vViewPosition) * 0.45);`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        // Sun glitter: tiny facets that catch the sun twinkle on its reflection path.
        vec3 glintN = normalize(waterN + vec3(vnoise(wp * 3.1 + uTime * 1.7) - 0.5, 0.0, vnoise(wp * 2.7 - uTime * 1.5 + 3.3) - 0.5) * 0.35);
        float glint = pow(max(dot(reflect(-toCam, glintN), normalize(uSunDir)), 0.0), 300.0);
        float twinkle = step(0.72, vnoise(wp * 2.3 + uTime * 2.2));
        float sunUp = smoothstep(-0.02, 0.12, uSunDir.y);
        totalEmissiveRadiance += mix(vec3(1.0, 0.96, 0.88), uHorizon, 0.35) * glint * twinkle * sunUp * 2.5;`);
  };
  mat.customProgramCacheKey = () => 'cityWater2';
  return { mat, uTime };
}
