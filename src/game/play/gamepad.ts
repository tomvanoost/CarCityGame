/**
 * Game controllers through the browser's Gamepad API:
 * - Xbox, PlayStation and Nintendo (Switch Pro / Joy-Con pair) controllers. Browsers give these the
 *   "standard" layout, so the buttons are found by their place on the controller.
 * - Logitech steering wheels with pedals (G29, G920, G923, Driving Force...): wheel = steering,
 *   gas and brake pedals, buttons for getting in/out and the horn.
 *
 * Controller layout (standard):            Wheel:
 *   left stick / d-pad  steer, walk          wheel       steer
 *   right trigger / stick forward  gas       gas pedal   gas
 *   left trigger / stick back  brake/reverse brake pedal brake / reverse
 *   right stick         look around          button 1 (✕/A)   get in / out
 *   A / ✕ (bottom)      jump / handbrake     button 2 (□/X)   horn
 *   Y / △ (top)         get in / out         paddles          horn
 *   X / □ (left)        horn
 *   B / ○ (right)       run (walking), close a panel   button 4 (△/Y)   close a panel
 */

export type PadKind = 'xbox' | 'playstation' | 'nintendo' | 'wheel' | 'other';

export interface PadState {
  throttle: number;
  brake: number;
  steer: number;
  handbrake: boolean;
  moveX: number;
  moveY: number;
  run: boolean;
  lookX: number;
  lookY: number;
  /** Buttons pressed since the last poll (one-shot). */
  interact: boolean;
  jump: boolean;
  horn: boolean;
  /** "Back" (B / ○, or wheel button 4): closes an open panel. */
  back: boolean;
}

const DEAD = 0.15;
const dead = (v: number) => (Math.abs(v) < DEAD ? 0 : (v - Math.sign(v) * DEAD) / (1 - DEAD));

/** What kind of controller this is, from the name the browser reports. */
export function padKind(pad: Gamepad): PadKind {
  const id = pad.id.toLowerCase();
  if (/wheel|g29|g920|g923|g27|g25|driving force|racing|c24f|c262|c266|c267|c26d|c26e|c29a|c29b|c298|c294/.test(id)) return 'wheel';
  if (/xbox|xinput|045e/.test(id)) return 'xbox';
  if (/playstation|dualshock|dualsense|wireless controller|054c/.test(id)) return 'playstation';
  if (/nintendo|switch|pro controller|joy-con|057e/.test(id)) return 'nintendo';
  return pad.mapping === 'standard' ? 'xbox' : 'other';
}

/**
 * Pedal axes per wheel family (Chrome / Edge on Windows and macOS). PlayStation-style wheels
 * (G29, G923 PS) and Xbox-style wheels (G920, G923 Xbox) report the pedals on different axes.
 */
function pedalAxes(pad: Gamepad): { gas: number; brake: number } {
  const id = pad.id.toLowerCase();
  if (/g920|c262|c26d|c26e|xbox/.test(id)) return { gas: 1, brake: 2 };
  if (pad.axes.length > 5) return { gas: 2, brake: 5 }; // G29, G923 PS, Driving Force
  return { gas: 1, brake: 2 };
}

export class Gamepads {
  /** Per pad: buttons held at the last poll, for one-shot presses. */
  private held = new Map<number, boolean[]>();
  /** Per wheel pedal axis: the value it rests at (+1 or -1, depending on browser), once seen. */
  private rest = new Map<string, number>();

  /** Connected controllers (for the settings screen), with what is pressed right now (for the test). */
  static list(): { index: number; kind: PadKind; name: string; standard: boolean; active: string }[] {
    const pads = typeof navigator.getGamepads === 'function' ? navigator.getGamepads() : [];
    return [...pads].filter((p): p is Gamepad => !!p && p.connected).map((p) => {
      const pressed = p.buttons.map((b, i) => (b.pressed ? i : -1)).filter((i) => i >= 0);
      const moved = p.axes.some((a, i) => Math.abs(a) > 0.5 && !(p.mapping !== 'standard' && Math.abs(a) > 0.98 && i >= 2));
      return { index: p.index, kind: padKind(p), name: p.id.replace(/\(.*?\)/g, '').trim(), standard: p.mapping === 'standard',
        active: pressed.length ? `🔘 ${pressed.join(', ')}` : moved ? '🕹️' : '' };
    });
  }

  poll(): PadState | null {
    const pads = typeof navigator.getGamepads === 'function' ? navigator.getGamepads() : [];
    let s: PadState | null = null;
    for (const pad of pads) {
      if (!pad || !pad.connected) continue;
      s ??= { throttle: 0, brake: 0, steer: 0, handbrake: false, moveX: 0, moveY: 0, run: false, lookX: 0, lookY: 0, interact: false, jump: false, horn: false, back: false };
      const b = (i: number) => pad.buttons[i]?.pressed ?? false;
      const bv = (i: number) => pad.buttons[i]?.value ?? 0;
      const prev = this.held.get(pad.index) ?? [];
      const now = pad.buttons.map((x) => x.pressed);
      const tap = (i: number) => !!now[i] && !prev[i];
      this.held.set(pad.index, now);

      if (padKind(pad) === 'wheel') {
        // Wheels turn ~900°: a little extra steering so kids don't have to turn it all the way.
        const steer = Math.max(-1, Math.min(1, (pad.axes[0] ?? 0) * 1.6));
        const { gas, brake } = pedalAxes(pad);
        s.steer += Math.abs(steer) < 0.02 ? 0 : steer;
        s.throttle = Math.max(s.throttle, this.pedal(pad, gas));
        s.brake = Math.max(s.brake, this.pedal(pad, brake));
        s.interact ||= tap(0);
        s.horn ||= tap(2) || tap(4) || tap(5);
        s.handbrake ||= b(1);
        s.back ||= tap(3);
        continue;
      }

      // Controller (Xbox / PlayStation / Nintendo / other). Browsers give most controllers the
      // "standard" layout; some Bluetooth controllers (Firefox, Android, generic pads) come
      // without it: then the triggers and d-pad are axes (left trigger 2, right trigger 5, d-pad 6/7).
      const std = pad.mapping === 'standard';
      const lx = dead(pad.axes[0] ?? 0), ly = dead(pad.axes[1] ?? 0);
      let dx = (b(15) ? 1 : 0) - (b(14) ? 1 : 0), dy = (b(13) ? 1 : 0) - (b(12) ? 1 : 0);
      let lt = std ? bv(6) : 0, rt = std ? bv(7) : 0;
      let rx = pad.axes[2] ?? 0, ry = pad.axes[3] ?? 0;
      if (!std) {
        dx = 0; dy = 0;
        if (pad.axes.length >= 6) { lt = this.pedal(pad, 2); rt = this.pedal(pad, 5); rx = pad.axes[3] ?? 0; ry = pad.axes[4] ?? 0; }
        if (pad.axes.length >= 8) { dx = Math.round(pad.axes[6] ?? 0); dy = Math.round(pad.axes[7] ?? 0); }
      }
      s.steer += lx + dx;
      // Gas: right trigger, or push the stick / d-pad forward. Brake (and reverse): left trigger or back.
      s.throttle = Math.max(s.throttle, rt, ly < -0.2 ? -ly : 0, dy < 0 ? 1 : 0);
      s.brake = Math.max(s.brake, lt, ly > 0.2 ? ly : 0, dy > 0 ? 1 : 0);
      s.handbrake ||= b(0);
      s.moveX += lx + dx;
      s.moveY += -(ly + dy);
      s.run ||= b(1) || b(10) || Math.hypot(lx, ly) > 0.95;
      s.lookX += dead(rx);
      s.lookY += dead(ry);
      s.interact ||= tap(3);
      s.jump ||= tap(0);
      s.horn ||= tap(2);
      s.back ||= tap(1);
    }
    if (s) s.steer = Math.max(-1, Math.min(1, s.steer));
    return s;
  }

  /** 0 (released) .. 1 (pressed); 0 until the pedal's rest position has been seen (no ghost gas). */
  private pedal(pad: Gamepad, axis: number) {
    const v = pad.axes[axis];
    if (v === undefined) return 0;
    const key = `${pad.index}:${axis}`;
    let rest = this.rest.get(key);
    if (rest === undefined) {
      if (Math.abs(v) < 0.9) return 0;
      rest = Math.sign(v);
      this.rest.set(key, rest);
    }
    const p = (1 - v * rest) / 2;
    return p < 0.04 ? 0 : Math.min(1, p);
  }
}
