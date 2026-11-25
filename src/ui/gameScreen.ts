import { isTouch } from '../engine/renderer';
import { Game, type GameState } from '../game/play/game';
import { Input } from '../game/play/input';
import { t } from '../i18n';
import { getProfile } from '../services/session';
import { h, svgIcon } from './dom';
import type { Screen } from './screens';
import { TouchControls } from './touchControls';

const TABLET_KEY = 'carcity.tablet';
const loadTablet = () => {
  try { const v = localStorage.getItem(TABLET_KEY); if (v !== null) return v === '1'; } catch { /* ignore */ }
  return isTouch;
};

/** The game: drive and walk around the city. Simple HUD, big buttons. */
export const gameScreen: Screen = (root, nav) => {
  const profile = getProfile();
  if (!profile) return nav('login');

  const canvas = h('canvas', { class: 'game-canvas' });
  const bar = h('div', { class: 'load-bar-fill' });
  const loading = h('div', { class: 'loading' },
    h('div', { class: 'loading-car' }, '🚗'),
    h('div', { class: 'loading-text' }, t('loadingCity')),
    h('div', { class: 'load-bar' }, bar),
  );
  const back = h('button', { class: 'icon-btn back-btn', 'aria-label': t('back'), onclick: () => nav('menu') },
    svgIcon('<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/>', 24));

  const input = new Input();
  const touch = new TouchControls(input);
  let tablet = loadTablet();
  const tabletBtn = h('button', { class: 'icon-btn tablet-btn', title: t('tabletMode'), 'aria-label': t('tabletMode') },
    svgIcon('<rect x="4" y="2" width="16" height="20" rx="2.5"/><circle cx="12" cy="18" r="1"/>', 22));

  const speed = h('div', { class: 'speed' }, h('b', {}, '0'), h('small', {}, 'km/h'));
  const action = h('button', { class: 'action-btn' });
  const actionLabel = h('span', {});
  const actionKey = h('kbd', {}, 'E');
  action.append(svgIcon('<path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4"/><path d="M9 17l5-5-5-5"/><path d="M14 12H3"/>', 26), actionLabel, actionKey);
  const hint = h('div', { class: 'keys-hint' }, t('keysHint'));
  const yieldBubble = h('div', { class: 'yield-bubble' }, '✋ ', t('yieldPeople'));

  root.append(canvas, touch.drive, touch.walk, speed, yieldBubble, action, hint, back, tabletBtn, loading);

  let state: GameState = { mode: 'driving', canEnter: false, kmh: 0, yielding: false };
  const render = () => {
    const driving = state.mode === 'driving';
    root.classList.toggle('tablet', tablet);
    touch.drive.hidden = !(tablet && driving);
    touch.walk.hidden = !(tablet && !driving);
    speed.hidden = !driving;
    speed.firstElementChild!.textContent = String(state.kmh);
    action.hidden = !(driving || state.canEnter);
    action.classList.toggle('enter', !driving);
    action.classList.toggle('disabled', driving && state.kmh > 8);
    actionLabel.textContent = driving ? t('getOut') : t('getIn');
    actionKey.hidden = tablet;
    tabletBtn.classList.toggle('active', tablet);
    yieldBubble.classList.toggle('show', state.yielding);
  };

  const game = new Game(canvas, input, profile, {
    onProgress: (p) => { bar.style.width = `${Math.round(p * 100)}%`; },
    onReady: () => {
      loading.classList.add('done');
      if (!tablet) setTimeout(() => hint.classList.add('hide'), 7000);
      else hint.classList.add('hide');
    },
    onState: (s) => {
      if (s.mode !== state.mode) touch.reset();
      state = s;
      render();
    },
  });
  action.addEventListener('click', () => game.interact());
  tabletBtn.addEventListener('click', () => {
    tablet = !tablet;
    try { localStorage.setItem(TABLET_KEY, tablet ? '1' : '0'); } catch { /* ignore */ }
    touch.reset();
    render();
  });

  // Drag on the 3D view to look around.
  const drags = new Map<number, { x: number; y: number }>();
  canvas.addEventListener('pointerdown', (e) => { canvas.setPointerCapture(e.pointerId); drags.set(e.pointerId, { x: e.clientX, y: e.clientY }); });
  canvas.addEventListener('pointermove', (e) => {
    const d = drags.get(e.pointerId);
    if (!d) return;
    input.addLook(e.clientX - d.x, e.clientY - d.y);
    d.x = e.clientX; d.y = e.clientY;
  });
  const endDrag = (e: PointerEvent) => drags.delete(e.pointerId);
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);
  render();

  if (import.meta.env.DEV) Object.assign(window, { carcityDebug: { game, input } });

  return () => {
    game.dispose();
    touch.dispose();
    input.dispose();
  };
};
