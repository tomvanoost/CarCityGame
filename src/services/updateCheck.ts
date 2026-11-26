import { t } from '../i18n';

declare const __BUILD_ID__: string;

const EVERY = 60_000; // check once a minute
const COUNTDOWN = 20; // seconds

/**
 * Notices a new deploy (fly.io) while the game is open: `/version.json` holds the id of the build
 * on the server; when it differs from the one this page runs, a banner counts down 20 seconds,
 * the game saves (event `carcity-save`) and the page reloads with the new version.
 * Only in the real (production) build.
 */
export function watchForUpdates() {
  if (!import.meta.env.PROD) return;
  let started = false;
  const check = async () => {
    if (started || document.hidden) return;
    try {
      const r = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' });
      if (!r.ok) return;
      const v = (await r.json()) as { id?: string };
      if (v.id && v.id !== __BUILD_ID__) { started = true; countdown(); }
    } catch { /* offline: try again later */ }
  };
  window.setInterval(check, EVERY);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) void check(); });
}

function countdown() {
  const banner = document.createElement('div');
  banner.className = 'update-banner';
  document.body.append(banner);
  let n = COUNTDOWN;
  const show = () => { banner.textContent = t('updateIn').replace('{n}', String(n)); };
  show();
  const timer = window.setInterval(() => {
    n--;
    if (n > 0) { show(); return; }
    clearInterval(timer);
    banner.textContent = t('updating');
    window.dispatchEvent(new Event('carcity-save'));
    // A moment for the save to reach the server, then load the new version.
    window.setTimeout(() => location.reload(), 800);
  }, 1000);
}
