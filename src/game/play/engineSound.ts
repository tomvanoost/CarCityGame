/**
 * A realistic engine sound without audio files: one second of a running 4-cylinder engine is
 * rendered once (every cylinder firing is a little "pop": a thump plus a puff of noise, with small
 * random differences like a real engine), sent through exhaust-pipe resonances, and played as a
 * seamless loop. The game changes its playback speed with the revs, like racing games do with
 * recorded engine loops.
 */

/** Small seeded random generator (the same sound every time). */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

/** Bandpass resonator (RBJ biquad) run twice around the loop, so the loop has no click at the seam. */
function resonate(x: Float32Array, sr: number, freq: number, q: number): Float32Array {
  const w = (2 * Math.PI * freq) / sr, alpha = Math.sin(w) / (2 * q), a0 = 1 + alpha;
  const b0 = alpha / a0, b2 = -alpha / a0, a1 = (-2 * Math.cos(w)) / a0, a2 = (1 - alpha) / a0;
  const y = new Float32Array(x.length);
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let pass = 0; pass < 2; pass++) {
    for (let n = 0; n < x.length; n++) {
      const v = b0 * x[n] + b2 * x2 - a1 * y1 - a2 * y2;
      x2 = x1; x1 = x[n]; y2 = y1; y1 = v;
      if (pass === 1) y[n] = v;
    }
  }
  return y;
}

/** One-pole lowpass, also wrapped around the loop. */
function lowpass(x: Float32Array, sr: number, freq: number): Float32Array {
  const k = 1 - Math.exp((-2 * Math.PI * freq) / sr);
  const y = new Float32Array(x.length);
  let v = 0;
  for (let pass = 0; pass < 2; pass++) for (let n = 0; n < x.length; n++) { v += (x[n] - v) * k; if (pass === 1) y[n] = v; }
  return y;
}

/**
 * Renders a loop of the engine running at `rpm`. bright: 0 = deep and soft (low revs),
 * 1 = more rasp (high revs). Returns mono samples; the loop holds a whole number of firings.
 */
export function renderEngineLoop(sr: number, rpm: number, bright: number, seed = 7): Float32Array {
  const fire = (rpm / 60) * 2; // 4 cylinders: 2 firings per turn
  const firings = Math.max(8, Math.round(fire * 1.0) & ~3); // ~1 s, a multiple of 4 cylinders
  const len = Math.round((firings * sr) / fire), period = len / firings;
  const r = rng(seed);
  const x = new Float32Array(len);
  const cyl = [1, 0.8, 0.93, 0.74]; // cylinders are never exactly equal: that gives the "burble"
  const thumpW = period * 0.45, puff = sr * 0.0035;
  for (let i = 0; i < firings; i++) {
    const at = i * period + (r() - 0.5) * period * 0.05;
    const amp = cyl[i % 4] * (0.85 + r() * 0.3);
    for (let k = 0; k < thumpW; k++) {
      const n = Math.floor(at + k) % len;
      x[(n + len) % len] += amp * Math.sin((Math.PI * k) / thumpW) * Math.exp(-k / (thumpW * 0.35));
    }
    // Only a tiny, soft puff: noise is what made it hiss in your ears.
    for (let k = 0; k < puff * 4; k++) {
      const n = Math.floor(at + k) % len;
      x[(n + len) % len] += amp * (0.06 + bright * 0.06) * (r() * 2 - 1) * Math.exp(-k / puff);
    }
  }
  for (let n = 0; n < len; n++) x[n] += (r() * 2 - 1) * 0.004; // a breath of air
  // Exhaust and body resonances (fixed in Hz, like a real pipe) plus the plain low end.
  const parts: [Float32Array, number][] = [
    // Warm and round: mostly the low end, nothing sharp up high.
    [lowpass(x, sr, 140), 1.8],
    [resonate(x, sr, 90, 1.4), 1.0],
    [resonate(x, sr, 210, 2), 0.45 + bright * 0.15],
  ];
  const out = new Float32Array(len);
  let peak = 1e-6;
  for (let n = 0; n < len; n++) {
    let v = 0;
    for (const [p, g] of parts) v += p[n] * g;
    out[n] = v;
    peak = Math.max(peak, Math.abs(v));
  }
  // A gentle lowpass on the whole thing and only a hint of saturation (hard clipping sounds harsh).
  const soft = lowpass(lowpass(out, sr, 700), sr, 700);
  peak = 1e-6;
  for (let n = 0; n < len; n++) peak = Math.max(peak, Math.abs(soft[n]));
  for (let n = 0; n < len; n++) out[n] = Math.tanh((soft[n] / peak) * 1.1) * 0.8;
  return out;
}
