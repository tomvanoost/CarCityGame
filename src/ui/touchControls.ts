import type { Input } from '../game/play/input';
import { h } from './dom';

/**
 * On-screen controls for tablets/phones (also work with a mouse):
 * - driving: steering wheel (left) + brake and gas pedals (right)
 * - walking: a joystick that appears where you put your finger (left half) + jump button
 * Dragging anywhere else rotates the camera (handled by the game screen).
 */
export class TouchControls {
  readonly drive: HTMLElement;
  readonly walk: HTMLElement;
  private wheel: HTMLElement;
  private wheelAngle = 0;
  private wheelHeld = false;
  private raf = 0;

  constructor(private input: Input) {
    // ---- steering wheel ----
    this.wheel = h('div', { class: 'wheel' });
    this.wheel.innerHTML = `<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="44" fill="none" stroke="currentColor" stroke-width="9"/>
      <circle cx="50" cy="50" r="11" fill="currentColor"/><path d="M50 39V8M39 52L10 62M61 52L90 62" stroke="currentColor" stroke-width="9" stroke-linecap="round"/>
      <circle cx="50" cy="6" r="4" fill="#ffd34d"/></svg>`;
    let start = 0, startAngle = 0, pid = -1;
    const angleAt = (e: PointerEvent) => {
      const r = this.wheel.getBoundingClientRect();
      return Math.atan2(e.clientX - (r.left + r.width / 2), -(e.clientY - (r.top + r.height / 2))) * (180 / Math.PI);
    };
    this.wheel.addEventListener('pointerdown', (e) => {
      pid = e.pointerId;
      this.wheel.setPointerCapture(pid);
      start = angleAt(e);
      startAngle = this.wheelAngle;
      this.wheelHeld = true;
    });
    this.wheel.addEventListener('pointermove', (e) => {
      if (e.pointerId !== pid) return;
      let d = angleAt(e) - start;
      d = ((d + 540) % 360) - 180;
      this.wheelAngle = Math.max(-140, Math.min(140, startAngle + d));
      start = angleAt(e);
      startAngle = this.wheelAngle;
      this.applyWheel();
    });
    const releaseWheel = (e: PointerEvent) => { if (e.pointerId === pid) { pid = -1; this.wheelHeld = false; } };
    this.wheel.addEventListener('pointerup', releaseWheel);
    this.wheel.addEventListener('pointercancel', releaseWheel);

    // ---- pedals ----
    const pedal = (cls: string, label: string, set: (v: number) => void) => {
      const el = h('div', { class: `pedal ${cls}` }, h('span', {}, label));
      const on = (e: PointerEvent) => { el.setPointerCapture(e.pointerId); el.classList.add('down'); set(1); };
      const off = () => { el.classList.remove('down'); set(0); };
      el.addEventListener('pointerdown', on);
      el.addEventListener('pointerup', off);
      el.addEventListener('pointercancel', off);
      return el;
    };
    const brake = pedal('brake', '◼', (v) => (input.touch.brake = v));
    const gas = pedal('gas', '▲', (v) => (input.touch.throttle = v));
    this.drive = h('div', { class: 'touch-drive' }, this.wheel, h('div', { class: 'pedals' }, brake, gas));

    // ---- joystick ----
    const zone = h('div', { class: 'joy-zone' });
    const base = h('div', { class: 'joy-base' });
    const knob = h('div', { class: 'joy-knob' });
    base.append(knob);
    zone.append(base);
    let jid = -1, cx = 0, cy = 0;
    const R = 56;
    zone.addEventListener('pointerdown', (e) => {
      jid = e.pointerId;
      zone.setPointerCapture(jid);
      cx = e.clientX; cy = e.clientY;
      base.style.left = `${cx}px`;
      base.style.top = `${cy}px`;
      base.classList.add('on');
    });
    zone.addEventListener('pointermove', (e) => {
      if (e.pointerId !== jid) return;
      let dx = e.clientX - cx, dy = e.clientY - cy;
      const len = Math.hypot(dx, dy);
      if (len > R) { dx *= R / len; dy *= R / len; }
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
      input.touch.moveX = dx / R;
      input.touch.moveY = -dy / R;
    });
    const releaseJoy = (e: PointerEvent) => {
      if (e.pointerId !== jid) return;
      jid = -1;
      base.classList.remove('on');
      knob.style.transform = '';
      input.touch.moveX = input.touch.moveY = 0;
    };
    zone.addEventListener('pointerup', releaseJoy);
    zone.addEventListener('pointercancel', releaseJoy);
    const jump = h('button', { class: 'jump-btn', 'aria-label': 'jump' });
    jump.innerHTML = '<svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M5 12l7-7 7 7"/></svg>';
    jump.addEventListener('pointerdown', (e) => { e.preventDefault(); input.queueJump(); });
    this.walk = h('div', { class: 'touch-walk' }, zone, jump);

    const tick = () => {
      this.raf = requestAnimationFrame(tick);
      if (!this.wheelHeld && this.wheelAngle !== 0) {
        // Wheel springs back to the middle when you let go.
        this.wheelAngle *= 0.8;
        if (Math.abs(this.wheelAngle) < 1) this.wheelAngle = 0;
        this.applyWheel();
      }
    };
    tick();
  }

  private applyWheel() {
    this.wheel.style.transform = `rotate(${this.wheelAngle}deg)`;
    const s = this.wheelAngle / 140;
    this.input.touch.steer = Math.sign(s) * Math.pow(Math.abs(s), 1.3);
  }

  /** Clears all touch values (e.g. when switching modes). */
  reset() {
    Object.assign(this.input.touch, { throttle: 0, brake: 0, steer: 0, moveX: 0, moveY: 0, run: false });
    this.wheelAngle = 0;
    this.applyWheel();
    this.drive.querySelectorAll('.pedal').forEach((p) => p.classList.remove('down'));
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    this.reset();
  }
}
