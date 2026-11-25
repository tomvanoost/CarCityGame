import { isTouch } from '../engine/renderer';
import { getClothes } from '../game/avatar/clothes';
import { Game, type GameState } from '../game/play/game';
import { Input } from '../game/play/input';
import { getVehicle, vehicleName } from '../game/vehicles/catalog';
import { getLang, t } from '../i18n';
import { getProfile, onProfileChange } from '../services/session';
import { h, icons, svgIcon } from './dom';
import type { Screen } from './screens';
import { toast } from './toast';
import { TouchControls } from './touchControls';

const TABLET_KEY = 'carcity.tablet';
const loadTablet = () => {
  try { const v = localStorage.getItem(TABLET_KEY); if (v !== null) return v === '1'; } catch { /* ignore */ }
  return isTouch;
};
const euro = (n: number) => `€ ${Math.round(n).toLocaleString('nl-NL')}`;

/** The game: drive, walk, earn money. Simple HUD, big buttons. */
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
  const money = h('div', { class: 'hud-money' }, svgIcon(icons.coin, 20), h('span', {}, euro(profile.money)));

  const input = new Input();
  const touch = new TouchControls(input);
  let tablet = loadTablet();
  const tabletBtn = h('button', { class: 'icon-btn tablet-btn', title: t('tabletMode'), 'aria-label': t('tabletMode') },
    svgIcon('<rect x="4" y="2" width="16" height="20" rx="2.5"/><circle cx="12" cy="18" r="1"/>', 22));

  const fuelFill = h('i', {});
  const fuel = h('div', { class: 'fuel' }, h('span', {}, '⛽'), h('div', { class: 'fuel-bar' }, fuelFill));
  const speed = h('div', { class: 'speed' }, h('b', {}, '0'), h('small', {}, 'km/h'));
  const dash = h('div', { class: 'dash' }, speed, fuel);
  const action = h('button', { class: 'action-btn' });
  const actionLabel = h('span', {});
  const actionKey = h('kbd', {}, 'E');
  action.append(svgIcon('<path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4"/><path d="M9 17l5-5-5-5"/><path d="M14 12H3"/>', 26), actionLabel, actionKey);
  const ctxBtn = h('button', { class: 'context-btn' });
  const hint = h('div', { class: 'keys-hint' }, t('keysHint'));
  const yieldBubble = h('div', { class: 'yield-bubble' }, '✋ ', t('yieldPeople'));
  const jobCard = h('div', { class: 'job-card' });
  const popups = h('div', { class: 'popups' });
  const panel = h('div', { class: 'place-panel', hidden: true });

  root.append(canvas, touch.drive, touch.walk, dash, yieldBubble, jobCard, ctxBtn, action, hint, popups, back, money, tabletBtn, panel, loading);

  let state: GameState = { mode: 'driving', canEnter: false, kmh: 0, yielding: false, fuel: 1, refueling: false, context: null, job: null };
  const render = () => {
    const driving = state.mode === 'driving';
    root.classList.toggle('tablet', tablet);
    root.classList.toggle('panel-open', !panel.hidden);
    touch.drive.hidden = !(tablet && driving) || !panel.hidden;
    touch.walk.hidden = !(tablet && !driving) || !panel.hidden;
    dash.hidden = !driving;
    speed.firstElementChild!.textContent = String(state.kmh);
    fuelFill.style.width = `${Math.max(3, state.fuel * 100)}%`;
    fuel.classList.toggle('low', state.fuel < 0.2);
    action.hidden = !(driving || state.canEnter);
    action.classList.toggle('enter', !driving);
    action.classList.toggle('disabled', driving && state.kmh > 8);
    actionLabel.textContent = driving ? t('getOut') : t('getIn');
    actionKey.hidden = tablet;
    tabletBtn.classList.toggle('active', tablet);
    yieldBubble.classList.toggle('show', state.yielding);
    // Context button: refuel / go inside / buy apartment.
    const c = state.context;
    ctxBtn.hidden = !c;
    if (c) {
      ctxBtn.textContent = c.kind === 'refuel' ? (state.refueling ? `⛽ ${t('refueling')}` : `⛽ ${t('refuel')}`)
        : c.kind === 'buyApartment' ? `🏢 ${t('buyApartment')} ${euro(c.price)}` : `🏠 ${t('goInside')}`;
      ctxBtn.classList.toggle('busy', state.refueling);
    }
    // Job card: what to do and how far.
    jobCard.hidden = !state.job;
    if (state.job) {
      const j = state.job;
      jobCard.replaceChildren(
        h('span', { class: 'job-icon' }, j.kind === 'delivery' ? '📦' : '🚕'),
        h('span', { class: 'job-text' }, `${t(j.kind === 'delivery' ? 'deliverTo' : 'driveTo')} ${t(j.place)}`),
        h('b', {}, `${j.meters} m`),
        h('span', { class: 'job-reward' }, euro(j.reward)),
      );
    }
  };

  const popup = (amount: number, label: string) => {
    const el = h('div', { class: `popup ${amount < 0 ? 'neg' : ''}` }, h('b', {}, `${amount > 0 ? '+' : '−'}${euro(Math.abs(amount))}`), h('span', {}, label));
    popups.append(el);
    setTimeout(() => el.remove(), 2600);
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
    onMoney: (amount, reason) => popup(amount, t(reason === 'job' ? 'jobDone' : reason === 'daily' ? 'dailyBonus' : reason === 'apartment' ? 'apartmentBought' : 'refuel')),
    onJobStart: (job) => toast(job.kind === 'delivery' ? t('pickedPackage') : t('pickedPassenger')),
    onPlace: (place) => openPanel(place),
    onMessage: (key, n) => toast(n ? `${t(key)} ${euro(n)}` : t(key)),
  });
  action.addEventListener('click', () => game.pressCar());
  ctxBtn.addEventListener('click', () => game.pressContext());
  tabletBtn.addEventListener('click', () => {
    tablet = !tablet;
    try { localStorage.setItem(TABLET_KEY, tablet ? '1' : '0'); } catch { /* ignore */ }
    touch.reset();
    render();
  });
  const offProfile = onProfileChange((p) => { money.lastElementChild!.textContent = euro(p.money); });

  // ---------- house / apartment panel ----------
  function openPanel(place: 'home' | 'apartment') {
    const p = getProfile()!;
    touch.reset();
    const close = () => { panel.hidden = true; game.resume(); render(); };
    const tiles = (items: { id: string; label: string; emoji: string; active: boolean; onPick: () => void }[]) =>
      h('div', { class: 'tiles' }, ...items.map((it) => {
        const b = h('button', { class: `tile ${it.active ? 'active' : ''}` }, h('span', { class: 'tile-emoji' }, it.emoji), h('span', {}, it.label));
        b.addEventListener('click', () => { it.onPick(); openPanel(place); });
        return b;
      }));
    const lang = getLang();
    panel.replaceChildren(h('div', { class: 'card place-card' },
      h('div', { class: 'place-head' },
        h('h2', {}, place === 'home' ? `🏠 ${t('yourHouse')}` : `🏢 ${t('yourApartment')}`),
        h('button', { class: 'icon-btn close-btn', 'aria-label': t('back'), onclick: close }, '✕'),
      ),
      h('h3', {}, t('myVehicles')),
      tiles(p.ownedVehicles.map((id) => ({
        id, emoji: '🚗', label: vehicleName(getVehicle(id)), active: id === p.selectedVehicle,
        onPick: () => game.swapVehicle(id, place),
      }))),
      h('h3', {}, t('myClothes')),
      tiles(p.ownedClothes.map((id) => ({
        id, emoji: '👕', label: getClothes(id).name[lang], active: id === p.equipped.outfit,
        onPick: () => game.changeOutfit(id),
      }))),
      h('label', { class: 'spawn-toggle' },
        (() => {
          const cb = h('input', { type: 'checkbox' }) as HTMLInputElement;
          cb.checked = p.spawn === place;
          cb.addEventListener('change', () => game.setSpawn(cb.checked ? place : 'home'));
          return cb;
        })(),
        h('span', {}, t('startHere')),
      ),
      h('button', { class: 'btn btn-primary btn-big', onclick: close }, t('continuePlaying')),
    ));
    panel.hidden = false;
    render();
  }

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
    offProfile();
    game.dispose();
    touch.dispose();
    input.dispose();
  };
};
