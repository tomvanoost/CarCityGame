/**
 * All controls end up in one place, whether they come from the keyboard
 * or from the on-screen tablet controls.
 */
export class Input {
  /** Values set by the touch controls (0..1 / -1..1). */
  touch = { throttle: 0, brake: 0, steer: 0, moveX: 0, moveY: 0, run: false };
  private keys = new Set<string>();
  private jumpQueued = false;
  private interactQueued = false;
  private hornQueued = false;
  private lookDX = 0;
  private lookDY = 0;

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
      this.keys.add(k);
      if (k.startsWith('Arrow') || k === 'Space') e.preventDefault();
    } else this.keys.delete(k);
  };
  private onBlur = () => this.keys.clear();

  private key(...codes: string[]) { return codes.some((c) => this.keys.has(c)) ? 1 : 0; }

  /** Car controls. Steer: +1 = right. */
  drive() {
    const fwd = this.key('KeyW', 'ArrowUp'), back = this.key('KeyS', 'ArrowDown');
    const steer = this.key('KeyD', 'ArrowRight') - this.key('KeyA', 'ArrowLeft');
    return {
      throttle: Math.max(fwd, this.touch.throttle),
      brake: Math.max(back, this.touch.brake),
      steer: Math.max(-1, Math.min(1, steer + this.touch.steer)),
      handbrake: this.keys.has('Space'),
    };
  }

  /** Walking: x = right, y = forward, relative to the camera. */
  walk() {
    let x = this.key('KeyD', 'ArrowRight') - this.key('KeyA', 'ArrowLeft') + this.touch.moveX;
    let y = this.key('KeyW', 'ArrowUp') - this.key('KeyS', 'ArrowDown') + this.touch.moveY;
    const len = Math.hypot(x, y);
    if (len > 1) { x /= len; y /= len; }
    const run = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight') || this.touch.run;
    return { x, y, run };
  }

  queueJump() { this.jumpQueued = true; }
  queueHorn() { this.hornQueued = true; }
  queueInteract() { this.interactQueued = true; }
  addLook(dx: number, dy: number) { this.lookDX += dx; this.lookDY += dy; }

  /** One-shot actions: true once per press. */
  takeJump() { const j = this.jumpQueued; this.jumpQueued = false; return j; }
  takeInteract() { const i = this.interactQueued; this.interactQueued = false; return i; }
  takeHorn() { const h = this.hornQueued; this.hornQueued = false; return h; }
  takeLook() { const l = { dx: this.lookDX, dy: this.lookDY }; this.lookDX = this.lookDY = 0; return l; }

  dispose() {
    window.removeEventListener('keydown', this.onKey);
    window.removeEventListener('keyup', this.onKey);
    window.removeEventListener('blur', this.onBlur);
  }
}
