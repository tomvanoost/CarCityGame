import * as THREE from 'three';

export const SKY = {
  zenith: new THREE.Color('#4f9ee8'),
  horizon: new THREE.Color('#cfe6f7'),
  sunDir: new THREE.Vector3(0.45, 0.62, 0.35).normalize(),
};

/** Seconds of game time for the sky (clouds drift, stars twinkle); the game adds dt every frame. */
export const SKY_TIME = { value: 0 };

/**
 * Gradient sky dome with a soft sun glow, drifting clouds, and at night twinkling stars and the moon
 * (at night the "sun" direction is the moonlight). How dark it is comes from the zenith color, so the
 * day/night cycle needs no extra input. Follows the camera, drawn behind everything.
 */
export function createSky(): THREE.Mesh {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      zenith: { value: SKY.zenith },
      horizon: { value: SKY.horizon },
      sunDir: { value: SKY.sunDir },
      uTime: SKY_TIME,
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_Position = p.xyww; // always at the far plane
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 zenith, horizon, sunDir;
      uniform float uTime;
      varying vec3 vDir;
      float hash21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
      float hash31(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.yzx + 33.33); return fract((p.x + p.y) * p.z); }
      float vnoise(vec2 p) {
        vec2 i = floor(p), f = fract(p);
        float a = hash21(i), b = hash21(i + vec2(1, 0)), c = hash21(i + vec2(0, 1)), d = hash21(i + vec2(1, 1));
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
      }
      float fbm(vec2 p) { return vnoise(p) * 0.5 + vnoise(p * 2.03) * 0.28 + vnoise(p * 4.1) * 0.14 + vnoise(p * 8.3) * 0.08; }
      void main() {
        vec3 d = normalize(vDir);
        float h = max(d.y, 0.0);
        vec3 col = mix(horizon, zenith, pow(h, 0.45)); // (a bit more of the deep zenith blue higher up)
        // How dark is it? (linear zenith brightness: day ~0.3, evening ~0.06, night ~0.01)
        float night = 1.0 - smoothstep(0.02, 0.07, dot(zenith, vec3(0.3, 0.59, 0.11)));
        float low = 1.0 - smoothstep(0.12, 0.5, sunDir.y); // sun near the horizon: sunrise / sunset
        float s = max(dot(d, sunDir), 0.0);
        // Sun (by day) or moon (at night): a disc and a glow; warmer and wider when the sun is low.
        vec3 sunCol = mix(mix(vec3(1.0, 0.92, 0.75), vec3(1.0, 0.62, 0.35), low * (1.0 - night)), vec3(0.85, 0.9, 1.0), night);
        float disc = pow(s, 600.0) * 3.0 * (1.0 - night);
        // The moon: a crisp round disc with soft grey patches, and a faint halo.
        float moon = smoothstep(0.99955, 0.99965, s) * night;
        vec3 moonCol = vec3(0.92, 0.94, 1.0) * (0.8 + 0.2 * vnoise((d.xz - sunDir.xz) * 1400.0));
        // Sunset / sunrise: a soft pink band above the orange horizon, strongest on the sun's side.
        float band = smoothstep(0.02, 0.12, h) * (1.0 - smoothstep(0.14, 0.5, h)) * low * (1.0 - night);
        col = mix(col, vec3(0.88, 0.32, 0.42) * (0.75 + 0.5 * s), band * 0.42);
        col += sunCol * (disc + pow(s, mix(12.0, 60.0, night)) * mix(0.18 + low * 0.25, 0.05, night));
        col = mix(col, moonCol, moon);
        // Stars: tiny twinkling points high in the night sky.
        vec3 sd = d * 260.0, cell = floor(sd);
        float hs = hash31(cell);
        float star = hs > 0.9965 ? smoothstep(0.32, 0.0, length(fract(sd) - 0.5)) * (0.65 + 0.35 * sin(uTime * 2.5 + hs * 300.0)) : 0.0;
        // Clouds: soft fbm patches on a sky plane, drifting with the wind; thinner towards the horizon.
        float cloud = 0.0, shade = 0.0;
        if (d.y > 0.0) {
          vec2 uv = d.xz / (d.y + 0.18) * 1.4 + vec2(uTime * 0.006, uTime * 0.0025);
          float n = fbm(uv);
          cloud = smoothstep(0.52, 0.8, n) * smoothstep(0.02, 0.22, d.y);
          shade = smoothstep(0.55, 0.9, fbm(uv * 1.3 + 3.7)); // darker cloud bellies
        }
        vec3 cloudDay = mix(vec3(1.0), vec3(0.78, 0.82, 0.88), shade * 0.6) + sunCol * pow(s, 6.0) * 0.4;
        vec3 cloudSunset = mix(mix(vec3(1.0, 0.62, 0.62), vec3(1.0, 0.72, 0.5), s), horizon * 1.2, 0.3); // pink, orange towards the sun
        vec3 cloudCol = mix(mix(cloudDay, cloudSunset, low), zenith * 1.8 + vec3(0.02), night);
        col += vec3(1.0) * star * night * smoothstep(0.03, 0.25, d.y) * (1.0 - cloud) * 1.6;
        col = mix(col, cloudCol, cloud * mix(0.92, 0.6, night));
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), mat);
  sky.scale.setScalar(5000);
  sky.frustumCulled = false;
  sky.renderOrder = -1;
  return sky;
}

/** Image-based lighting from the sky colors, for reflections on glass and paint. */
export function skyEnvironment(renderer: THREE.WebGLRenderer): THREE.Texture {
  const scene = new THREE.Scene();
  const sky = createSky();
  sky.scale.setScalar(100);
  scene.add(sky);
  const ground = new THREE.Mesh(new THREE.CircleGeometry(100, 16).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#7d8a98' }));
  ground.position.y = -2;
  scene.add(ground);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const tex = pmrem.fromScene(scene, 0, 0.1, 200).texture;
  pmrem.dispose();
  (sky.material as THREE.Material).dispose();
  sky.geometry.dispose();
  ground.geometry.dispose();
  (ground.material as THREE.Material).dispose();
  return tex;
}

/**
 * Sun with a shadow area that follows a focus point (the player / camera target).
 * Shadows are only re-rendered when the focus moves, which saves a lot on tablets.
 */
export class Sun {
  readonly light: THREE.DirectionalLight;
  readonly hemi: THREE.HemisphereLight;
  private lastFocus = new THREE.Vector3(1e9, 0, 0);

  constructor(private renderer: THREE.WebGLRenderer, private size: number, mapSize: number) {
    this.light = new THREE.DirectionalLight('#fff1dd', 2.1);
    // mapSize 0 = no shadows ("Snel" in the settings).
    this.light.castShadow = mapSize > 0;
    this.light.shadow.mapSize.set(Math.max(mapSize, 1), Math.max(mapSize, 1));
    const cam = this.light.shadow.camera;
    cam.left = cam.bottom = -size / 2;
    cam.right = cam.top = size / 2;
    cam.near = 1;
    cam.far = 600;
    this.light.shadow.bias = -0.0004;
    this.light.shadow.normalBias = 0.6;
    this.hemi = new THREE.HemisphereLight('#cfe6ff', '#6b8a55', 0.75);
    this.light.shadow.radius = 3;
    renderer.shadowMap.autoUpdate = false;
    renderer.shadowMap.needsUpdate = true;
  }

  addTo(scene: THREE.Scene) {
    scene.add(this.light, this.light.target, this.hemi);
  }

  /** Moves the shadow area to `focus`, snapped to shadow texels to avoid shimmering. */
  follow(focus: THREE.Vector3, force = false) {
    if (!force && focus.distanceToSquared(this.lastFocus) < 9) return;
    const texel = this.light.castShadow ? this.size / this.light.shadow.mapSize.x : 1;
    const fx = Math.round(focus.x / texel) * texel, fz = Math.round(focus.z / texel) * texel;
    this.light.target.position.set(fx, 0, fz);
    this.light.position.set(fx + SKY.sunDir.x * 300, SKY.sunDir.y * 300, fz + SKY.sunDir.z * 300);
    this.light.target.updateMatrixWorld();
    this.light.updateMatrixWorld();
    this.lastFocus.copy(focus);
    if (this.light.castShadow) this.renderer.shadowMap.needsUpdate = true;
  }
}
