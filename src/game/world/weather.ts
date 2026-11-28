import * as THREE from 'three';

/** How wet the world is right now (0 dry .. 1 pouring); shaders read it (road puddles). */
export const WEATHER = { wet: { value: 0 }, puddles: { value: 0 } };
/** After the rain: the road is dry again after ~75 s, the puddles last ~2.5 minutes (they shrink first). */
const DRY_TIME = 75, PUDDLE_TIME = 150;

const RAIN_TIME = 55; // seconds of rain (incl. 8 s fading in and out)
const RAINBOW_TIME = 45;
const FADE = 8;
const DROPS = 1400;
/** The box of rain around the camera (meters). */
const BOX = { w: 70, h: 34 };

/**
 * Now and then a short light rain shower: falling streaks around the camera (one draw call), a grey
 * sky, wet roads with puddles; afterwards (by day) a rainbow on the side away from the sun.
 * Cheap: only on the higher quality settings.
 */
export class Weather {
  readonly group = new THREE.Group();
  private rain: THREE.LineSegments;
  private rainbow: THREE.Mesh;
  private drops: Float32Array;
  private phase: 'clear' | 'rain' | 'rainbow' = 'clear';
  private t = 0;
  private wait: number;
  /** 0..1: how much it rains now (for the sky, the light and the sound). */
  amount = 0;
  /** 0..1: how visible the rainbow is. */
  bow = 0;
  /** Called once each time a rainbow appears (sticker). */
  onRainbow?: () => void;

  constructor(private enabled: boolean) {
    this.wait = 150 + Math.random() * 150; // first shower after 2.5 – 5 minutes
    // Rain: short vertical streaks; positions are relative to the camera box, wrapped every frame.
    this.drops = new Float32Array(DROPS * 3);
    for (let i = 0; i < DROPS; i++) this.drops.set([(Math.random() - 0.5) * BOX.w, Math.random() * BOX.h, (Math.random() - 0.5) * BOX.w], i * 3);
    const pos = new Float32Array(DROPS * 6);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.rain = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: '#dfe8f2', transparent: true, opacity: 0, depthWrite: false }));
    this.rain.frustumCulled = false;
    this.rain.visible = false;
    // Rainbow: a flat ring with the colors across its width, soft at both ends and edges.
    const bowMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, fog: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
      uniforms: { uAlpha: { value: 0 } },
      vertexShader: /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */ `
        uniform float uAlpha; varying vec2 vUv;
        vec3 band(float x) {
          // red outside .. violet inside
          vec3 c = vec3(0.0);
          c += vec3(1.0, 0.1, 0.1) * smoothstep(0.0, 0.17, x) * (1.0 - smoothstep(0.17, 0.33, x));
          c += vec3(1.0, 0.55, 0.0) * smoothstep(0.12, 0.27, x) * (1.0 - smoothstep(0.27, 0.42, x));
          c += vec3(1.0, 0.95, 0.1) * smoothstep(0.25, 0.4, x) * (1.0 - smoothstep(0.4, 0.55, x));
          c += vec3(0.15, 0.9, 0.2) * smoothstep(0.38, 0.53, x) * (1.0 - smoothstep(0.53, 0.68, x));
          c += vec3(0.1, 0.45, 1.0) * smoothstep(0.52, 0.67, x) * (1.0 - smoothstep(0.67, 0.82, x));
          c += vec3(0.5, 0.2, 0.9) * smoothstep(0.66, 0.81, x) * (1.0 - smoothstep(0.81, 1.0, x));
          return c;
        }
        void main() {
          float x = 1.0 - vUv.y; // across the ring
          float ends = smoothstep(0.0, 0.18, vUv.x) * smoothstep(1.0, 0.82, vUv.x);
          gl_FragColor = vec4(band(x) * uAlpha * ends * 0.55, 1.0);
        }`,
    });
    // RingGeometry's uv isn't along the arc: build an arc strip with uv.x along it, uv.y across it.
    const seg = 64, inner = 0.86, outer = 1.0, arc = Math.PI;
    const p: number[] = [], uv: number[] = [], idx: number[] = [];
    for (let i = 0; i <= seg; i++) {
      const a = (i / seg) * arc, c = Math.cos(a), s = Math.sin(a);
      p.push(c * inner, s * inner, 0, c * outer, s * outer, 0);
      uv.push(i / seg, 0, i / seg, 1);
      if (i < seg) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
    }
    const bowGeo = new THREE.BufferGeometry();
    bowGeo.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
    bowGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    bowGeo.setIndex(idx);
    this.rainbow = new THREE.Mesh(bowGeo, bowMat);
    this.rainbow.frustumCulled = false;
    this.rainbow.visible = false;
    this.rainbow.renderOrder = -0.5;
    this.group.add(this.rain, this.rainbow);
  }

  /** Start a shower now (dev / tests). */
  force(phase: 'rain' | 'rainbow') { this.phase = phase; this.t = phase === 'rainbow' ? 0 : 0; if (phase === 'rainbow') this.onRainbow?.(); }

  /** dt; the camera; the sun direction (for the rainbow side); daytime = can there be a rainbow. */
  update(dt: number, camera: THREE.Camera, sunDir: THREE.Vector3, daytime: boolean) {
    if (!this.enabled) return;
    this.t += dt;
    if (this.phase === 'clear' && this.t > this.wait) { this.phase = 'rain'; this.t = 0; }
    else if (this.phase === 'rain' && this.t > RAIN_TIME) {
      this.phase = daytime ? 'rainbow' : 'clear'; this.t = 0;
      this.wait = 300 + Math.random() * 300; // next shower after 5 – 10 minutes
      if (this.phase === 'rainbow') this.onRainbow?.();
    } else if (this.phase === 'rainbow' && this.t > RAINBOW_TIME) { this.phase = 'clear'; this.t = 0; }
    const fadeIn = (len: number) => Math.min(1, this.t / FADE, (len - this.t) / FADE);
    this.amount = this.phase === 'rain' ? Math.max(0, fadeIn(RAIN_TIME)) : 0;
    this.bow = this.phase === 'rainbow' ? Math.max(0, fadeIn(RAINBOW_TIME)) : 0;
    // The roads dry up slowly after the rain (in patches, see the road shader); puddles last longest.
    const raining = this.phase === 'rain';
    WEATHER.wet.value = raining ? Math.max(WEATHER.wet.value, this.amount) : Math.max(0, WEATHER.wet.value - dt / DRY_TIME);
    WEATHER.puddles.value = raining ? Math.max(WEATHER.puddles.value, this.amount) : Math.max(0, WEATHER.puddles.value - dt / PUDDLE_TIME);

    // Rain streaks: fall, wrap around the box that follows the camera.
    this.rain.visible = this.amount > 0.01;
    if (this.rain.visible) {
      (this.rain.material as THREE.LineBasicMaterial).opacity = 0.65 * this.amount;
      const cp = camera.position, pos = this.rain.geometry.getAttribute('position') as THREE.BufferAttribute, a = pos.array as Float32Array;
      const n = Math.floor(DROPS * (0.3 + 0.7 * this.amount)), fall = 16 * dt;
      for (let i = 0; i < DROPS; i++) {
        const k = i * 3;
        this.drops[k + 1] -= fall;
        if (this.drops[k + 1] < 0) this.drops[k + 1] += BOX.h;
        if (i >= n) { a.fill(0, i * 6, i * 6 + 6); continue; }
        // World position: wrapped around the camera on x/z so the rain never runs out.
        const wrap = (v: number, c: number) => c + ((((v - c) % BOX.w) + BOX.w * 1.5) % BOX.w) - BOX.w / 2;
        const x = wrap(this.drops[k], cp.x), z = wrap(this.drops[k + 2], cp.z), y = cp.y - 8 + this.drops[k + 1];
        a[i * 6] = x; a[i * 6 + 1] = y; a[i * 6 + 2] = z;
        a[i * 6 + 3] = x + 0.06; a[i * 6 + 4] = y - 1.0; a[i * 6 + 5] = z + 0.04;
      }
      pos.needsUpdate = true;
    }
    // Rainbow: far away, on the side opposite the sun, standing up and facing the camera.
    this.rainbow.visible = this.bow > 0.01;
    if (this.rainbow.visible) {
      (this.rainbow.material as THREE.ShaderMaterial).uniforms.uAlpha.value = this.bow;
      const away = new THREE.Vector3(-sunDir.x, 0, -sunDir.z).normalize();
      const c = camera.position, dist = 700, r = 330;
      this.rainbow.position.set(c.x + away.x * dist, c.y - 60, c.z + away.z * dist);
      this.rainbow.scale.setScalar(r);
      this.rainbow.lookAt(c.x, c.y - 60, c.z);
    }
  }

  dispose() {
    this.rain.geometry.dispose(); (this.rain.material as THREE.Material).dispose();
    this.rainbow.geometry.dispose(); (this.rainbow.material as THREE.Material).dispose();
    this.group.removeFromParent();
  }
}
