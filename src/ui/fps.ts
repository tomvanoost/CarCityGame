/** Always-visible, very cheap FPS counter (updates twice per second). */
export function startFpsMeter() {
  const el = document.createElement('div');
  el.className = 'fps';
  document.body.append(el);
  let frames = 0;
  let last = performance.now();
  const loop = (now: number) => {
    frames++;
    if (now - last >= 500) {
      const fps = Math.round((frames * 1000) / (now - last));
      el.textContent = `${fps} FPS`;
      el.dataset.level = fps >= 50 ? 'good' : fps >= 30 ? 'ok' : 'bad';
      frames = 0;
      last = now;
    }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}
