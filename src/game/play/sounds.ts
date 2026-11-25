/**
 * Friendly game sounds, synthesized with WebAudio (no audio files to download).
 * - engine: a soft hum whose pitch follows the speed
 * - horn: a cheerful two-tone "toot toot"
 * - coin: a bright "ching" when you earn money
 * - door: a soft "clunk" when you get in or out
 * Browsers only allow audio after a tap or key press, so the AudioContext is
 * created on the first user gesture. Muting is remembered on this device.
 */
const MUTE_KEY = 'carcity.muted';
const loadMuted = () => { try { return localStorage.getItem(MUTE_KEY) === '1'; } catch { return false; } };

class Sounds {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private engineGain: GainNode | null = null;
  private engineOsc: OscillatorNode[] = [];
  private engineFilter: BiquadFilterNode | null = null;
  private muted = loadMuted();
  private lastHorn = 0;

  get isMuted() { return this.muted; }

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
  };

  private ready() { return this.ctx && this.master && this.ctx.state === 'running' && !this.muted ? this.ctx : null; }

  private startEngine(ctx: AudioContext) {
    this.engineGain = ctx.createGain();
    this.engineGain.gain.value = 0;
    this.engineFilter = ctx.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.value = 300;
    this.engineFilter.connect(this.engineGain);
    this.engineGain.connect(this.master!);
    const saw = ctx.createOscillator(); saw.type = 'sawtooth';
    const sub = ctx.createOscillator(); sub.type = 'sine';
    const subGain = ctx.createGain(); subGain.gain.value = 0.8;
    saw.connect(this.engineFilter);
    sub.connect(subGain).connect(this.engineGain);
    saw.start(); sub.start();
    this.engineOsc = [saw, sub];
  }

  /** Every frame: engine on while driving; pitch follows the speed, a bit louder on the gas. */
  engine(on: boolean, kmh: number, throttle: number) {
    const ctx = this.ready();
    if (!ctx) return;
    if (!this.engineGain) { if (!on) return; this.startEngine(ctx); }
    const t = ctx.currentTime, k = Math.min(1, kmh / 120);
    const base = 42 + k * 70 + throttle * 8;
    this.engineOsc[0].frequency.setTargetAtTime(base, t, 0.12);
    this.engineOsc[1].frequency.setTargetAtTime(base / 2, t, 0.12);
    this.engineFilter!.frequency.setTargetAtTime(240 + k * 600 + throttle * 150, t, 0.12);
    this.engineGain!.gain.setTargetAtTime(on ? 0.05 + k * 0.05 + throttle * 0.03 : 0, t, on ? 0.15 : 0.08);
  }

  private tone(ctx: AudioContext, type: OscillatorType, freq: number, start: number, dur: number, vol: number, endFreq?: number) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, start);
    if (endFreq) o.frequency.exponentialRampToValueAtTime(endFreq, start + dur);
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(vol, start + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    o.connect(g).connect(this.master!);
    o.start(start);
    o.stop(start + dur + 0.02);
  }

  /** Cheerful two-tone toot toot. */
  horn() {
    const ctx = this.ready();
    if (!ctx || ctx.currentTime - this.lastHorn < 0.5) return;
    const t = (this.lastHorn = ctx.currentTime);
    for (const [s, f] of [[0, 440], [0.18, 554]] as const) {
      this.tone(ctx, 'square', f, t + s, 0.16, 0.06);
      this.tone(ctx, 'triangle', f * 1.5, t + s, 0.16, 0.05);
    }
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
