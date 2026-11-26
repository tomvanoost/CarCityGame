import { renderEngineLoop } from './engineSound';
/**
 * Friendly game sounds, synthesized with WebAudio (no audio files to download).
 * - engine: a rendered loop of a running 4-cylinder (engineSound.ts) pitched with the revs and a
 *   6-gear gearbox (electric cars: a quiet rising whine)
 * - horn: a real car honk (public/sounds/horn.mp3) that sounds as long as the horn is held
 *   (repeating); a synthesized two-tone horn until the file has loaded
 * - coin: a bright "ching" when you earn money
 * - door: a soft "clunk" when you get in or out
 * Browsers only allow audio after a tap or key press, so the AudioContext is
 * created on the first user gesture. Muting is remembered on this device.
 */
const MUTE_KEY = 'carcity.muted';
const ENGINE_KEY = 'carcity.engineSound';
const loadMuted = () => { try { return localStorage.getItem(MUTE_KEY) === '1'; } catch { return false; } };

class Sounds {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private engineGain: GainNode | null = null;
  /** Low-revs and high-revs engine loops (crossfaded) and their volumes. */
  private engineLoops: { src: AudioBufferSourceNode; gain: GainNode; rpm: number }[] = [];
  private engineFilter: BiquadFilterNode | null = null;
  /** Combustion part (rumble) and electric part (whine) of the engine sound. */
  private rumbleGain: GainNode | null = null;
  private whineGain: GainNode | null = null;
  private whineOsc: OscillatorNode[] = [];
  private muted = loadMuted();
  /** Engine sound on/off (⚙️ Settings, saved on this device); the other sounds stay. */
  engineOn = (() => { try { return localStorage.getItem(ENGINE_KEY) !== 'off'; } catch { return true; } })();
  /** The toot that is playing now (its own volume node), so a new tap can cut it off. */
  private hornBus: { gain: GainNode; oscs: AudioScheduledSourceNode[] } | null = null;
  /** The recorded honk, loaded once audio is unlocked. */
  private hornBuffer: AudioBuffer | null = null;
  private hornLoading = false;

  get isMuted() { return this.muted; }

  setEngineOn(on: boolean) {
    this.engineOn = on;
    try { localStorage.setItem(ENGINE_KEY, on ? 'on' : 'off'); } catch { /* private mode */ }
  }

  setMuted(m: boolean) {
    this.muted = m;
    try { localStorage.setItem(MUTE_KEY, m ? '1' : '0'); } catch { /* ignore */ }
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.8, this.ctx.currentTime, 0.05);
  }

  /** Call from a user gesture (tap / key) so the browser lets us play audio. */
  unlock = () => {
    if (!this.ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      try { this.ctx = new AC(); } catch { return; }
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.8;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended' && !document.hidden) void this.ctx.resume().catch(() => {});
    this.loadHorn();
  };

  private loadHorn() {
    if (this.hornLoading || !this.ctx) return;
    this.hornLoading = true;
    const ctx = this.ctx;
    fetch('/sounds/horn.mp3')
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
      .then((data) => ctx.decodeAudioData(data))
      .then((buf) => { this.hornBuffer = buf; })
      .catch(() => { this.hornLoading = false; }); // try again on the next tap
  }

  private ready() { return this.ctx && this.master && this.ctx.state === 'running' && !this.muted ? this.ctx : null; }

  private startEngine(ctx: AudioContext) {
    this.engineGain = ctx.createGain();
    this.engineGain.gain.value = 0;
    this.engineGain.connect(this.master!);
    // Combustion ("vroom"): two loops of a real-sounding engine (low and high revs) that are
    // crossfaded and sped up / slowed down with the revs, through a lowpass that opens with the gas.
    this.rumbleGain = ctx.createGain();
    this.rumbleGain.connect(this.engineGain);
    this.engineFilter = ctx.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.value = 1200;
    this.engineFilter.Q.value = 0.5;
    this.engineFilter.connect(this.rumbleGain);
    this.engineLoops = ([[1100, 0], [3600, 1]] as const).map(([rpm, bright]) => {
      const data = renderEngineLoop(ctx.sampleRate, rpm, bright);
      const buf = ctx.createBuffer(1, data.length, ctx.sampleRate);
      buf.getChannelData(0).set(data);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      src.connect(gain).connect(this.engineFilter!);
      src.start();
      return { src, gain, rpm };
    });
    // Electric: two soft sines a fifth apart, the futuristic whine of an electric motor.
    this.whineGain = ctx.createGain();
    this.whineGain.gain.value = 0;
    this.whineGain.connect(this.engineGain);
    const w1 = ctx.createOscillator(); w1.type = 'sine';
    const w2 = ctx.createOscillator(); w2.type = 'triangle';
    const w2Gain = ctx.createGain(); w2Gain.gain.value = 0.25;
    w1.connect(this.whineGain);
    w2.connect(w2Gain).connect(this.whineGain);
    w1.start(); w2.start();
    this.whineOsc = [w1, w2];
  }

  /** Gearbox for the engine sound: current gear, and the speed share of the top speed where each gear ends. */
  private gear = 0;
  private static readonly GEAR_TOPS = [0.12, 0.24, 0.38, 0.55, 0.75, 1.0];

  /**
   * Every frame: the engine while driving. Combustion cars go through 6 gears: in each gear the revs
   * climb (low - mid - high), then a short "clutch" dip and the revs drop for the next gear; slowing
   * down shifts back down. Electric cars don't go "vroom": a quiet whine that rises with the speed.
   */
  engine(on: boolean, kmh: number, throttle: number, electric = false, topSpeed = 200) {
    const ctx = this.ready();
    if (!ctx) return;
    if (!this.engineGain) { if (!on) return; this.startEngine(ctx); }
    const t = ctx.currentTime, k = Math.min(1, kmh / 120);
    // Gear and revs from the speed (share of the car's real top speed).
    const share = Math.min(1, Math.abs(kmh) / Math.max(60, topSpeed));
    const tops = Sounds.GEAR_TOPS;
    let g = tops.findIndex((top) => share <= top);
    if (g < 0) g = tops.length - 1;
    const lo = g === 0 ? 0 : tops[g - 1], within = (share - lo) / (tops[g] - lo);
    const IDLE = 800, LOW = 2000, HIGH = 4600; // a calm engine: never screaming high revs
    let rpm = g === 0 ? IDLE + within * (HIGH - IDLE) : LOW + within * (HIGH - LOW);
    if (Math.abs(kmh) < 2) rpm = IDLE + throttle * 1800; // standing still: blip the throttle
    const shifted = g !== this.gear && on && !electric && Math.abs(kmh) > 2;
    this.gear = g;
    // Each loop plays faster or slower to match the revs; low revs use the deep loop, high revs the raspy one.
    const high = Math.min(1, Math.max(0, (rpm - 1700) / 1700));
    this.engineLoops.forEach((l, i) => {
      l.src.playbackRate.setTargetAtTime(rpm / l.rpm, t, 0.05);
      l.gain.gain.setTargetAtTime(i === 0 ? Math.cos(high * Math.PI / 2) : Math.sin(high * Math.PI / 2), t, 0.05);
    });
    // Off the gas the engine sounds muffled; on the gas it opens up.
    this.engineFilter!.frequency.setTargetAtTime(260 + rpm * 0.07 + throttle * 350, t, 0.08);
    const whine = 260 + Math.min(1, kmh / 200) * 900;
    this.whineOsc[0].frequency.setTargetAtTime(whine, t, 0.1);
    this.whineOsc[1].frequency.setTargetAtTime(whine * 1.5, t, 0.1);
    this.rumbleGain!.gain.setTargetAtTime(electric ? 0 : 1, t, 0.05);
    this.whineGain!.gain.setTargetAtTime(electric ? 0.06 + k * 0.13 + throttle * 0.06 : 0, t, 0.05);
    const vol = on && this.engineOn ? 0.06 + (rpm / HIGH) * 0.035 + throttle * 0.025 : 0;
    const eg = this.engineGain!.gain;
    if (shifted) {
      // Clutch: quieter for a moment while the revs drop, then back.
      eg.cancelScheduledValues(t);
      eg.setValueAtTime(eg.value, t);
      eg.linearRampToValueAtTime(vol * 0.35, t + 0.05);
      eg.linearRampToValueAtTime(vol, t + 0.2);
    } else if (!this.shiftUntil || t > this.shiftUntil) {
      eg.setTargetAtTime(vol, t, on ? 0.12 : 0.08);
    }
    if (shifted) this.shiftUntil = t + 0.2;
  }
  private shiftUntil = 0;

  private tone(ctx: AudioContext, type: OscillatorType, freq: number, start: number, dur: number, vol: number, endFreq?: number, out?: AudioNode) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, start);
    if (endFreq) o.frequency.exponentialRampToValueAtTime(endFreq, start + dur);
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(vol, start + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    o.connect(g).connect(out ?? this.master!);
    o.start(start);
    o.stop(start + dur + 0.02);
    return o;
  }

  /** Cuts the horn off with a very short fade (no click). */
  hornStop() {
    const ctx = this.ctx, old = this.hornBus;
    if (!ctx || !old) return;
    const t = ctx.currentTime;
    old.gain.gain.cancelScheduledValues(t);
    old.gain.gain.setValueAtTime(old.gain.gain.value, t);
    old.gain.gain.linearRampToValueAtTime(0, t + 0.03);
    for (const o of old.oscs) { try { o.stop(t + 0.04); } catch { /* already stopped */ } }
    this.hornBus = null;
  }

  /**
   * Starts the horn; it keeps sounding (the honk repeats) until hornStop(). A short tap gives a
   * short toot, holding gives the whole honk and more. Uses the recorded honk once it has loaded,
   * a synthesized two-tone horn before that.
   */
  hornStart() {
    const ctx = this.ready();
    if (!ctx) return;
    this.hornStop();
    const t = ctx.currentTime;
    const gain = ctx.createGain();
    gain.connect(this.master!);
    const oscs: AudioScheduledSourceNode[] = [];
    if (this.hornBuffer) {
      // The real honk (it is recorded loud: play it at about half volume), looped while held.
      const src = ctx.createBufferSource();
      src.buffer = this.hornBuffer;
      src.loop = true;
      src.connect(gain);
      oscs.push(src);
      gain.gain.value = 0.55;
    } else {
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.07, t + 0.012);
      for (const [type, f] of [['square', 440], ['triangle', 554]] as const) {
        const o = ctx.createOscillator();
        o.type = type;
        o.frequency.value = f;
        o.connect(gain);
        oscs.push(o);
      }
    }
    for (const o of oscs) o.start(t + 0.005);
    const bus = { gain, oscs };
    this.hornBus = bus;
    oscs[0].onended = () => { gain.disconnect(); if (this.hornBus === bus) this.hornBus = null; };
  }

  private siren: { gain: GainNode; osc: OscillatorNode[]; timer: number } | null = null;

  /**
   * Siren: the European two-tone "tatu-tata" (two notes taking turns), soft enough for a kids game.
   * Police high and quick, ambulance a bit lower, fire truck low and slow. Plays until sirenOff().
   */
  sirenOn(kind: 'police' | 'fire' | 'ambulance' = 'police') {
    const ctx = this.ready();
    if (!ctx || this.siren) return;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.gain.setTargetAtTime(0.09, ctx.currentTime, 0.05);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 2400;
    filter.connect(gain).connect(this.master!);
    const a = ctx.createOscillator(), b = ctx.createOscillator();
    a.type = 'square'; b.type = 'triangle';
    const bGain = ctx.createGain(); bGain.gain.value = 0.6;
    a.connect(filter); b.connect(bGain).connect(filter);
    const [notes, every] = kind === 'fire' ? [[370, 494], 700] : kind === 'ambulance' ? [[440, 587], 520] : [[466, 622], 450];
    let i = 0;
    const step = () => {
      const t = ctx.currentTime, f = notes[i++ % 2];
      a.frequency.setTargetAtTime(f, t, 0.01);
      b.frequency.setTargetAtTime(f * 2, t, 0.01);
    };
    step();
    a.start(); b.start();
    this.siren = { gain, osc: [a, b], timer: window.setInterval(step, every) };
  }

  sirenOff() {
    const s = this.siren, ctx = this.ctx;
    if (!s || !ctx) return;
    clearInterval(s.timer);
    const t = ctx.currentTime;
    s.gain.gain.setTargetAtTime(0, t, 0.04);
    for (const o of s.osc) { try { o.stop(t + 0.25); } catch { /* already stopped */ } }
    s.osc[0].onended = () => s.gain.disconnect();
    this.siren = null;
  }

  /** Turn signal "tick" (on) and "tock" (off): a short soft click. */
  blinkerTick(on: boolean) {
    const ctx = this.ready();
    if (!ctx) return;
    this.tone(ctx, 'square', on ? 1400 : 1050, ctx.currentTime, 0.025, 0.035);
  }

  /** Bright coin "ching". */
  coin() {
    const ctx = this.ready();
    if (!ctx) return;
    const t = ctx.currentTime;
    this.tone(ctx, 'triangle', 988, t, 0.12, 0.12);
    this.tone(ctx, 'triangle', 1319, t + 0.08, 0.35, 0.12);
    this.tone(ctx, 'sine', 2637, t + 0.08, 0.25, 0.03);
  }

  /** Cartoon "bonk + whoosh" when a tree or lamp post tips over. */
  knock() {
    const ctx = this.ready();
    if (!ctx) return;
    const t = ctx.currentTime;
    this.tone(ctx, 'triangle', 520, t, 0.12, 0.22, 140);
    this.tone(ctx, 'sine', 90, t, 0.18, 0.3, 50);
    this.tone(ctx, 'sine', 900, t + 0.06, 0.35, 0.05, 300);
  }

  /** Soft car door clunk. */
  door() {
    const ctx = this.ready();
    if (!ctx) return;
    const t = ctx.currentTime;
    this.tone(ctx, 'sine', 160, t, 0.14, 0.25, 60);
    this.tone(ctx, 'triangle', 420, t, 0.05, 0.06, 200);
  }

  /** Engine off (leaving the game screen, pause, hidden tab). */
  stopEngine() {
    if (this.ctx && this.engineGain) this.engineGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.05);
  }

  /** Pause all audio while the tab is hidden. */
  setHidden(hidden: boolean) {
    if (!this.ctx) return;
    if (hidden) void this.ctx.suspend().catch(() => {});
    else void this.ctx.resume().catch(() => {});
  }
}

export const sounds = new Sounds();
