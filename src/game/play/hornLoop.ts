/**
 * Makes a recorded honk loop seamlessly while the horn is held: the attack plays once, then only the
 * steady middle part repeats. The loop end is moved to where the waveform matches the loop start best
 * (so the pitch lines up), and the last few milliseconds before the loop end are crossfaded into the
 * sound just before the loop start, so the jump back can't be heard.
 * The original file stays as it is; this works on a copy of the decoded sound.
 */
export interface HornLoop { buffer: AudioBuffer; loopStart: number; loopEnd: number }

export function prepareHornLoop(ctx: BaseAudioContext, src: AudioBuffer): HornLoop {
  const sr = src.sampleRate, n = src.length, chans = src.numberOfChannels;
  const mono = new Float32Array(n);
  for (let c = 0; c < chans; c++) { const d = src.getChannelData(c); for (let i = 0; i < n; i++) mono[i] += d[i] / chans; }

  // Loudness in 10 ms steps: where does the honk sound (ignoring the silence at both ends)?
  const win = Math.round(sr * 0.01), steps = Math.floor(n / win), rms = new Float32Array(steps);
  let peak = 0;
  for (let s = 0; s < steps; s++) {
    let sum = 0;
    for (let i = s * win; i < (s + 1) * win; i++) sum += mono[i] * mono[i];
    rms[s] = Math.sqrt(sum / win);
    peak = Math.max(peak, rms[s]);
  }
  let a = 0, b = steps - 1;
  while (a < steps && rms[a] < peak * 0.25) a++;
  while (b > a && rms[b] < peak * 0.25) b--;
  const on = a * win, off = (b + 1) * win;
  const len = off - on;
  // Too short to find a steady part: loop the sounding part as it is.
  if (len < sr * 0.12) return { buffer: src, loopStart: on / sr, loopEnd: off / sr };

  // The steady middle part: after the attack, before the fade-out.
  let ls = Math.round(on + len * 0.25);
  let le = Math.round(on + len * 0.8);
  // Line the end up with the start: pick the loop end (within ±12 ms) whose waveform matches best.
  const cmp = Math.min(Math.round(sr * 0.02), Math.floor((le - ls) / 4));
  const range = Math.round(sr * 0.012);
  let best = le, bestScore = -Infinity;
  for (let e = le - range; e <= le + range; e++) {
    if (e + cmp >= n || e - cmp <= ls) continue;
    let score = 0;
    for (let i = 0; i < cmp; i++) score += mono[ls + i] * mono[e + i];
    if (score > bestScore) { bestScore = score; best = e; }
  }
  le = best;

  // Copy the sound and crossfade the end of the loop into what comes just before the loop start.
  const fade = Math.min(Math.round(sr * 0.04), Math.floor((le - ls) / 3), ls);
  const out = ctx.createBuffer(chans, n, sr);
  for (let c = 0; c < chans; c++) {
    const d = src.getChannelData(c), o = out.getChannelData(c);
    o.set(d);
    for (let i = 0; i < fade; i++) {
      const w = i / fade;
      // A straight (equal-gain) blend: both pieces are lined up in phase, so this keeps the volume even
      // (an equal-power blend would make a little bump here).
      const gOut = 1 - w, gIn = w;
      o[le - fade + i] = d[le - fade + i] * gOut + d[ls - fade + i] * gIn;
    }
  }
  if (ls < 1) ls = 1;
  return { buffer: out, loopStart: ls / sr, loopEnd: le / sr };
}
