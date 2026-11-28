import { Gamepads, type PadState } from './gamepad';

/**
 * All controls end up in one place, whether they come from the keyboard, the on-screen
 * tablet controls, a game controller or a steering wheel.
 */
/** Keyboard steering goes up to this share of full lock. */
const KEY_STEER_MAX = 0.85;

export class Input {
  /** Values set by the touch controls (0..1 / -1..1). */
  touch = { throttle: 0, brake: 0, steer: 0, moveX: 0, moveY: 0, run: false, horn: false };
  private keys = new Set<string>();
  private jumpQueued = false;
  private interactQueued = false;
  private hornQueued = false;
  /** Second action (B, or the horn button X / □ while walking): e.g. brush an animal. */
  private altQueued = false;
  private sirenQueued = false;
  private blinkQueued: 'left' | 'right' | 'both' | null = null;
  private viewQueued = false;
  private lookDX = 0;
  private lookDY = 0;
  private gamepads = new Gamepads();
  private pad: PadState | null = null;

  constructor() {
    window.addEventListener('keydown', this.onKey);
    window.addEventListener('keyup', this.onKey);
    window.addEventListener('blur', this.onBlur);
  }

  private onKey = (e: KeyboardEvent) => {
    if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
    const k = e.code;
    if (e.type === 'keydown') {
      if (!e.repeat && (k === 'KeyE' || k === 'KeyF' || k === 'Enter')) this.interactQueued = true;
      if (!e.repeat && k === 'Space') this.jumpQueued = true;
      if (!e.repeat && k === 'KeyH') this.hornQueued = true;
      if (!e.repeat && k === 'KeyB') this.altQueued = true; // B = borstelen (brush)
      if (!e.repeat && k === 'KeyR') this.sirenQueued = true;
      if (!e.repeat && k === 'F2') { this.viewQueued = true; e.preventDefault(); }
      if (!e.repeat && (k === 'Digit1' || k === 'Numpad1')) this.blinkQueued = 'left';
      if (!e.repeat && (k === 'Digit2' || k === 'Numpad2')) this.blinkQueued = 'right';
      if (!e.repeat && (k === 'Digit3' || k === 'Numpad3')) this.blinkQueued = 'both'; // hazard lights
      this.keys.add(k);
      if (k.startsWith('Arrow') || k === 'Space') e.preventDefault();
    } else this.keys.delete(k);
  };
  private onBlur = () => this.keys.clear();

  /** Smoothed keyboard steering (-KEY_STEER_MAX..KEY_STEER_MAX). */
  private keySteer = 0;

  private key(...codes: string[]) { return codes.some((c) => this.keys.has(c)) ? 1 : 0; }

  /** Once per frame: read the game controllers / steering wheel. */
  poll(dt: number) {
    // Keyboard steering eases in (a key is all-or-nothing, which made the car twitchy) and is
    // gentler than full lock; letting go straightens out quickly.
    const want = (this.key('KeyD', 'ArrowRight') - this.key('KeyA', 'ArrowLeft')) * KEY_STEER_MAX;
    const rate = want === 0 || Math.sign(want) !== Math.sign(this.keySteer) ? 6 : 3.2;
    this.keySteer += Math.max(-rate * dt, Math.min(rate * dt, want - this.keySteer));
    const p = this.gamepads.poll();
    this.pad = p;
    if (!p) return;
    if (p.interact) this.interactQueued = true;
    if (p.jump) this.jumpQueued = true;
    if (p.horn) { this.hornQueued = true; this.altQueued = true; }
    if (p.siren) this.sirenQueued = true;
    if (p.view) this.viewQueued = true;
    if (p.blinkLeft) this.blinkQueued = 'left';
    if (p.blinkRight) this.blinkQueued = 'right';
    if (p.hazard) this.blinkQueued = 'both';
    // The game screen closes an open panel (house, shop, map) on this, like the ✕ button.
    if (p.back) window.dispatchEvent(new Event('carcity-back'));
    // Right stick looks around like dragging the screen (~700 px per second at full tilt).
    if (p.lookX || p.lookY) this.addLook(p.lookX * 700 * dt, p.lookY * 450 * dt);
  }

  /** Car controls. Steer: +1 = right. */
  drive() {
    const fwd = this.key('KeyW', 'ArrowUp'), back = this.key('KeyS', 'ArrowDown');
    const steer = this.keySteer;
    const pad = this.pad;
    return {
      throttle: Math.max(fwd, this.touch.throttle, pad?.throttle ?? 0),
      brake: Math.max(back, this.touch.brake, pad?.brake ?? 0),
      steer: Math.max(-1, Math.min(1, steer + this.touch.steer + (pad?.steer ?? 0))),
      handbrake: this.keys.has('Space') || !!pad?.handbrake,
    };
  }

  /** Walking: x = right, y = forward, relative to the camera. */
  walk() {
    let x = this.key('KeyD', 'ArrowRight') - this.key('KeyA', 'ArrowLeft') + this.touch.moveX + (this.pad?.moveX ?? 0);
    let y = this.key('KeyW', 'ArrowUp') - this.key('KeyS', 'ArrowDown') + this.touch.moveY + (this.pad?.moveY ?? 0);
    const len = Math.hypot(x, y);
    if (len > 1) { x /= len; y /= len; }
    const run = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight') || this.touch.run || !!this.pad?.run;
    return { x, y, run };
  }

  queueJump() { this.jumpQueued = true; }
  queueHorn() { this.hornQueued = true; }
  takeAlt() { const a = this.altQueued; this.altQueued = false; return a; }
  queueSiren() { this.sirenQueued = true; }
  queueBlink(side: 'left' | 'right' | 'both') { this.blinkQueued = side; }
  queueView() { this.viewQueued = true; }
  /** Camera view switch pressed (F2, View / Create / Capture, 🎥): once per press. */
  takeView() { const v = this.viewQueued; this.viewQueued = false; return v; }
  /** Turn signal pressed (1 / 2, d-pad left / right, the arrow buttons): once per press. */
  takeBlink() { const b = this.blinkQueued; this.blinkQueued = null; return b; }
  /** Siren switch pressed (R, 🚨 button, controller RB / R1): true once per press. */
  takeSiren() { const s = this.sirenQueued; this.sirenQueued = false; return s; }
  queueInteract() { this.interactQueued = true; }
  addLook(dx: number, dy: number) { this.lookDX += dx; this.lookDY += dy; }

  /** One-shot actions: true once per press. */
  takeJump() { const j = this.jumpQueued; this.jumpQueued = false; return j; }
  takeInteract() { const i = this.interactQueued; this.interactQueued = false; return i; }
  takeHorn() { const h = this.hornQueued; this.hornQueued = false; return h; }
  /**
   * Is the horn held right now (H key, 📯 button, controller / wheel button)? A press that was
   * already released before this frame still counts once, so a very quick tap gives a short toot.
   */
  hornHeld() {
    return this.takeHorn() || this.keys.has('KeyH') || this.touch.horn || !!this.pad?.hornHeld;
  }
  takeLook() { const l = { dx: this.lookDX, dy: this.lookDY }; this.lookDX = this.lookDY = 0; return l; }

  dispose() {
    window.removeEventListener('keydown', this.onKey);
    window.removeEventListener('keyup', this.onKey);
    window.removeEventListener('blur', this.onBlur);
  }
}
