let el: HTMLDivElement | null = null;
let timer = 0;

/** Small friendly message at the bottom of the screen. */
export function toast(msg: string) {
  if (!el) {
    el = document.createElement('div');
    el.className = 'toast';
    document.body.append(el);
  }
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(timer);
  timer = window.setTimeout(() => el?.classList.remove('show'), 2200);
}
