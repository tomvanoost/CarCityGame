import * as THREE from 'three';

export const SKY = {
  zenith: new THREE.Color('#4f9ee8'),
  horizon: new THREE.Color('#cfe6f7'),
  sunDir: new THREE.Vector3(0.45, 0.62, 0.35).normalize(),
};

/** Gradient sky dome with a soft sun glow. Follows the camera, drawn behind everything. */
export function createSky(): THREE.Mesh {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      zenith: { value: SKY.zenith },
      horizon: { value: SKY.horizon },
      sunDir: { value: SKY.sunDir },
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
      varying vec3 vDir;
      void main() {
        float h = max(vDir.y, 0.0);
        vec3 col = mix(horizon, zenith, pow(h, 0.55));
        float s = max(dot(normalize(vDir), sunDir), 0.0);
        col += vec3(1.0, 0.92, 0.75) * (pow(s, 600.0) * 3.0 + pow(s, 12.0) * 0.18);
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
