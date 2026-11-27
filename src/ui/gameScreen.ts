import { FLAVORS, ICE_CREAM_PRICE } from '../game/play/iceCream';
import { SNACKS } from '../game/play/supermarket';
import { PETS, getPet } from '../game/play/pets';
import { FURNITURE } from '../game/furniture';
import { EXTRA_PRICE, PAINT_PRICE } from '../game/play/paintShop';
import { PAINT_COLORS } from '../game/vehicles/catalog';
import { EXTRA_PAINT, RIM_COLORS, STRIPE_COLORS } from '../game/vehicles/carStyle';
import { isTouch } from '../engine/renderer';
import { getClothes } from '../game/avatar/clothes';
import { Game, type GameState } from '../game/play/game';
import { Input } from '../game/play/input';
import { getVehicle, vehicleName } from '../game/vehicles/catalog';
import { getLang, t } from '../i18n';
import { getProfile, onProfileChange, updateProfile } from '../services/session';
import { createTutorial } from './tutorial';
import { ApartmentRoom } from '../game/apartmentRoom';
import { euro } from './money';
import { CHAT_MAX, EMOTES, getCurrentSession, loadChatOn, setCurrentSession } from '../services/multiplayer';
import { h, icons, svgIcon } from './dom';
import type { Screen } from './screens';
import { toast } from './toast';
import { BigMap, Minimap, renderBaseMap, type MapPlaces } from './cityMap';
import { TouchControls } from './touchControls';
import { missionText } from './missions';
import { HORNS } from '../game/horns';
import { sounds } from '../game/play/sounds';

const TABLET_KEY = 'carcity.tablet';
const loadTablet = () => {
  try { const v = localStorage.getItem(TABLET_KEY); if (v !== null) return v === '1'; } catch { /* ignore */ }
  return isTouch;
};

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
  const money = h('div', { class: 'hud-money game-money' }, svgIcon(icons.coin, 20), h('span', {}, euro(profile.money)));

  // 🏁 Max speed: tap to set how fast your car may go (up to its real top speed).
  const speedBtn = h('button', { class: 'speed-limit-btn', 'aria-label': t('maxSpeed'), title: t('maxSpeed') }, '🏁 ', h('b', {}, 'MAX'));
  const speedValue = h('b', { class: 'speed-pop-value' }, '');
  const slider = h('input', { type: 'range', min: '10', step: '5', class: 'speed-slider', 'aria-label': t('maxSpeed') }) as HTMLInputElement;
  const minus = h('button', { class: 'btn speed-step' }, '−');
  const plus = h('button', { class: 'btn speed-step' }, '+');
  const noLimit = h('button', { class: 'btn btn-primary speed-nolimit' }, `🚀 ${t('noLimit')}`);
  const speedPop = h('div', { class: 'card speed-pop', hidden: true },
    h('div', { class: 'place-head' }, h('h2', {}, `🏁 ${t('maxSpeed')}`),
      h('button', { class: 'icon-btn close-btn', 'aria-label': t('back'), onclick: () => { speedPop.hidden = true; } }, '✕')),
    speedValue,
    h('div', { class: 'speed-row' }, minus, slider, plus),
    noLimit,
  );
  /** Shows the limit; a value at (or over) the car's top speed means "no limit". */
  const setLimit = (kmh: number | null) => {
    const top = state.topSpeed || 250;
    const v = kmh && kmh < top ? Math.max(10, Math.round(kmh / 5) * 5) : null;
    game.setMaxSpeed(v);
    showLimit(v);
  };
  const showLimit = (v: number | null) => {
    const top = state.topSpeed || 250;
    slider.max = String(top);
    slider.value = String(v ?? top);
    speedValue.textContent = v ? `${v} km/h` : `${t('noLimit')} (${top} km/h)`;
    speedBtn.lastElementChild!.textContent = v ? String(v) : 'MAX';
  };
  slider.addEventListener('input', () => setLimit(Number(slider.value)));
  minus.addEventListener('click', () => setLimit((state.maxSpeed ?? state.topSpeed) - 10));
  plus.addEventListener('click', () => setLimit((state.maxSpeed ?? state.topSpeed) + 10));
  noLimit.addEventListener('click', () => setLimit(null));
  speedBtn.addEventListener('click', () => { showLimit(state.maxSpeed); speedPop.hidden = !speedPop.hidden; });

  const input = new Input();
  const touch = new TouchControls(input);
  let tablet = loadTablet();
  const tabletBtn = h('button', { class: 'icon-btn tablet-btn', title: t('tabletMode'), 'aria-label': t('tabletMode') },
    svgIcon('<rect x="4" y="2" width="16" height="20" rx="2.5"/><circle cx="12" cy="18" r="1"/>', 22));

  const speakerOn = '<path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16.5 8.5a5 5 0 0 1 0 7"/><path d="M19 6a8.5 8.5 0 0 1 0 12"/>';
  const speakerOff = '<path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M17 9l5 6M22 9l-5 6"/>';
  const soundBtn = h('button', { class: 'icon-btn sound-btn', title: t('soundOnOff'), 'aria-label': t('soundOnOff') });
  // 🎥 Dashboard view on/off (also F2, or View / Create / Capture on a controller).
  // The rear-view mirror's frame (the game draws the view behind the car inside it, dashboard view only).
  const mirrorFrame = h('div', { class: 'mirror-frame', hidden: true });
  const viewBtn = h('button', { class: 'icon-btn view-btn', title: `${t('dashView')} (F2)`, 'aria-label': t('dashView') }, '🎥');
  viewBtn.addEventListener('click', () => input.queueView());
  const renderSound = () => {
    soundBtn.replaceChildren(svgIcon(sounds.isMuted ? speakerOff : speakerOn, 22));
    soundBtn.classList.toggle('muted', sounds.isMuted);
  };
  renderSound();
  soundBtn.addEventListener('click', () => { sounds.unlock(); sounds.setMuted(!sounds.isMuted); renderSound(); });
  // 🌙 / ☀️: soft evening light with street lamps and headlights, or daylight.
  const eveningBtn = h('button', { class: 'icon-btn evening-btn', title: t('eveningOnOff'), 'aria-label': t('eveningOnOff') });
  const renderEvening = () => { eveningBtn.textContent = game.evening ? '☀️' : '🌙'; eveningBtn.classList.toggle('active', game.evening); };
  eveningBtn.addEventListener('click', () => { game.setEvening(!game.evening); renderEvening(); });
  // Browsers only allow sound after a tap or key press.
  window.addEventListener('pointerdown', sounds.unlock);
  window.addEventListener('keydown', sounds.unlock);

  // Horn: a friendly toot; people nearby wave back.
  const hornBtn = h('button', { class: 'horn-btn', title: t('honk'), 'aria-label': t('honk') });
  hornBtn.textContent = '📯';
  // Hold to honk: the horn sounds while the button is held down.
  hornBtn.addEventListener('pointerdown', (e) => {
    e.preventDefault(); e.stopPropagation(); sounds.unlock();
    hornBtn.setPointerCapture?.(e.pointerId);
    input.queueHorn(); input.touch.horn = true;
  });
  for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture'] as const) hornBtn.addEventListener(ev, () => { input.touch.horn = false; });
  // Police car: 🚨 switches the siren and flashing lights on/off (also R or controller RB).
  const sirenBtn = h('button', { class: 'siren-btn', title: t('siren'), 'aria-label': t('siren') }, '🚨');
  sirenBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); sounds.unlock(); input.queueSiren(); });
  const fuelFill = h('i', {});
  const fuel = h('div', { class: 'fuel' }, h('span', {}, '⛽'), h('div', { class: 'fuel-bar' }, fuelFill));
  const speed = h('div', { class: 'speed' }, h('b', {}, '0'), h('small', {}, 'km/h'));
  // Turn signals: the green arrows next to the speed (tap them, or 1 / 2, or the d-pad).
  const blinkBtn = (side: 'left' | 'right') => {
    const b = h('button', { class: `blinker-btn ${side}`, 'aria-label': t(side === 'left' ? 'blinkLeft' : 'blinkRight'), title: t(side === 'left' ? 'blinkLeft' : 'blinkRight') }, side === 'left' ? '◀' : '▶');
    b.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); sounds.unlock(); input.queueBlink(side); });
    return b;
  };
  const blinkL = blinkBtn('left'), blinkR = blinkBtn('right');
  const dash = h('div', { class: 'dash' }, h('div', { class: 'dash-row' }, blinkL, speed, blinkR), fuel);
  const action = h('button', { class: 'action-btn' });
  const actionLabel = h('span', {});
  const actionKey = h('kbd', {}, 'E');
  action.append(svgIcon('<path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4"/><path d="M9 17l5-5-5-5"/><path d="M14 12H3"/>', 26), actionLabel, actionKey);
  const ctxBtn = h('button', { class: 'context-btn' });
  const countEl = h('div', { class: 'race-count', hidden: true }, '3');
  /** 0:52.3 */
  const raceTime = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`;
  const hint = h('div', { class: 'keys-hint' }, t('keysHint'));
  const yieldBubble = h('div', { class: 'yield-bubble' }, '✋ ', t('yieldPeople'));
  const jobCard = h('div', { class: 'job-card' });
  const popups = h('div', { class: 'popups' });
  const panel = h('div', { class: 'place-panel', hidden: true });
  const mapWrap = h('div', { class: 'minimap-wrap' });
  const bigHolder = h('div', { class: 'bigmap-holder' });
  const closeMap = () => { mapOverlay.hidden = true; game.resume(); render(); };
  const navBtn = (label: string, onClick: () => void) => h('button', { class: 'btn nav-btn', onclick: onClick }, label);
  let places: MapPlaces | null = null;
  const goTo = (key: keyof MapPlaces) => { if (places) { game.setDestination(places[key]); toast(t('destSet')); closeMap(); } };
  const mapOverlay = h('div', { class: 'bigmap', hidden: true },
    h('div', { class: 'card bigmap-card' },
      h('div', { class: 'place-head' }, h('h2', {}, `🗺️ ${t('map')}`), h('button', { class: 'icon-btn close-btn', 'aria-label': t('back'), onclick: () => closeMap() }, '✕')),
      h('div', { class: 'try-hint' }, t('mapHint')),
      bigHolder,
      h('div', { class: 'nav-btns' },
        navBtn(`🏠 ${t('goHome')}`, () => goTo('home')),
        navBtn(`🏢 ${t('goApartment')}`, () => goTo('apartment')),
        navBtn(`⛽ ${t('goGas')}`, () => goTo('gas')),
        navBtn(`✕ ${t('stopNav')}`, () => { game.setDestination(null); closeMap(); }),
      ),
    ),
  );

  root.append(canvas, touch.drive, touch.walk, dash, yieldBubble, jobCard, countEl, ctxBtn, action, hornBtn, sirenBtn, hint, popups, back, speedBtn, money, speedPop, tabletBtn, soundBtn, eveningBtn, viewBtn, mirrorFrame, mapWrap, panel, mapOverlay, loading);

  let tutorialOpen = false;
  let state: GameState = { mode: 'driving', canEnter: false, kmh: 0, yielding: false, fuel: 1, refueling: false, washing: false, context: null, race: null, job: null, dest: null, topSpeed: 0, maxSpeed: null, blinker: null, cockpit: false, mp: null, police: false, siren: false };
  const render = () => {
    const driving = state.mode === 'driving';
    if (!speedPop.hidden) showLimit(state.maxSpeed); else speedBtn.lastElementChild!.textContent = state.maxSpeed && state.maxSpeed < state.topSpeed ? String(state.maxSpeed) : 'MAX';
    root.classList.toggle('tablet', tablet);
    const overlay = !panel.hidden || !mapOverlay.hidden || tutorialOpen;
    root.classList.toggle('panel-open', overlay);
    touch.drive.hidden = !(tablet && driving) || overlay;
    touch.walk.hidden = !(tablet && !driving) || overlay;
    dash.hidden = !driving;
    hornBtn.hidden = !driving || overlay;
    sirenBtn.hidden = !(driving && state.police) || overlay;
    viewBtn.hidden = !driving;
    mirrorFrame.hidden = !state.cockpit;
    if (state.mp) mpPill.textContent = `🌐 ${state.mp.room} · 👥 ${state.mp.others + 1}`;
    blinkL.classList.toggle('on', state.blinker === 'left');
    blinkR.classList.toggle('on', state.blinker === 'right');
    sirenBtn.classList.toggle('on', state.siren);
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
        : c.kind === 'wash' ? (state.washing ? `🫧 ${t('washing')}` : `🫧 ${t('wash')} ${euro(c.price)}`)
        : c.kind === 'takeCar' ? `🔑 ${t('takeCar')}: ${vehicleName(getVehicle(c.id))}`
        : c.kind === 'iceCream' ? `🍦 ${t('buyIceCream')} ${euro(c.price)}`
        : c.kind === 'supermarket' ? `🛒 ${t('goShopping')}`
        : c.kind === 'petShop' ? `🐾 ${t('visitPetShop')}`
        : c.kind === 'paintShop' ? `🎨 ${t('paintShop')}`
        : c.kind === 'ride' ? `${c.ride === 'wheel' ? '🎡' : '🎠'} ${t(c.ride === 'wheel' ? 'rideWheel' : 'rideCarousel')} ${euro(c.price)}`
        : c.kind === 'rideStop' ? `🚶 ${t('rideStop')}`
        : c.kind === 'raceStart' ? `🏁 ${t('raceStart')}`
        : c.kind === 'raceStop' ? `✋ ${t('raceStop')}`
        : c.kind === 'buyApartment' ? `🏢 ${t('buyApartment')} ${euro(c.price)}` : `🏠 ${t('goInside')}`;
      ctxBtn.classList.toggle('busy', state.refueling || state.washing);
    }
    // Job card: what to do and how far.
    jobCard.hidden = !state.job && !state.dest;
    if (!state.job && state.dest) {
      const cancel = h('button', { class: 'job-cancel', 'aria-label': t('stopNav') }, '✕');
      cancel.addEventListener('click', () => game.setDestination(null));
      jobCard.replaceChildren(h('span', { class: 'job-icon' }, '📍'), h('span', { class: 'job-text' }, t('toDest')), h('b', {}, `${state.dest.meters} m`), cancel);
    }
    // Desert race: lap time and gates, plus the big 3-2-1.
    countEl.hidden = !state.race || state.race.countdown <= 0;
    if (state.race) {
      const r = state.race;
      if (r.countdown > 0) countEl.textContent = String(r.countdown);
      jobCard.hidden = false;
      jobCard.replaceChildren(h('span', { class: 'job-icon' }, '🏁'), h('b', {}, raceTime(r.time)), h('span', { class: 'job-text' }, `🚩 ${r.gate}/${r.total}`));
    } else if (state.job) {
      const j = state.job;
      jobCard.replaceChildren(
        h('span', { class: 'job-icon' }, j.kind === 'delivery' ? '📦' : j.kind === 'pizza' ? '🍕' : '🚕'),
        h('span', { class: 'job-text' }, `${t(j.kind === 'taxi' ? 'driveTo' : j.kind === 'pizza' ? 'pizzaTo' : 'deliverTo')} ${t(j.place)}`),
        h('b', {}, `${j.meters} m`),
        h('span', { class: 'job-reward' }, euro(j.reward)),
      );
      if (j.timeLeft !== undefined) {
        jobCard.append(h('span', { class: `job-timer ${j.timeLeft > 0 ? '' : 'cold'}`, title: j.timeLeft > 0 ? t('pizzaWarm') : t('pizzaCold') }, j.timeLeft > 0 ? `🔥 ${j.timeLeft} s` : '❄️'));
      }
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
      // Very first play: a few friendly tips, shown only once.
      if (!getProfile()?.tutorialDone) {
        tutorialOpen = true;
        game.pause();
        touch.reset();
        root.append(createTutorial(tablet, () => {
          tutorialOpen = false;
          game.resume();
          void updateProfile({ tutorialDone: true });
          render();
        }));
        render();
      }
    },
    onState: (s) => {
      if (s.mode !== state.mode) touch.reset();
      state = s;
      render();
    },
    onMoney: (amount, reason) => popup(amount, t(reason === 'job' ? 'jobDone' : reason === 'daily' ? 'dailyBonus' : reason === 'apartment' ? 'apartmentBought' : reason === 'wash' ? 'carWash' : reason === 'iceCream' ? 'iceCreamShop' : reason === 'supermarket' ? 'supermarket' : reason === 'petShop' ? 'petShop' : reason === 'paintShop' ? 'paintShop' : reason === 'furniture' ? 'furnitureShop' : reason === 'funFair' ? 'funFair' : reason === 'mission' ? 'missionDone' : reason === 'coin' ? 'coinFound' : reason === 'race' ? 'raceFinish' : 'refuel')),
    onJobStart: (job) => toast(job.kind === 'delivery' ? t('pickedPackage') : job.kind === 'pizza' ? t('pickedPizza') : t('pickedPassenger')),
    onRaceDone: (r) => toast(`${r.medal === 'gold' ? '🥇' : r.medal === 'silver' ? '🥈' : '🥉'} ${t(r.medal === 'gold' ? 'medalGold' : r.medal === 'silver' ? 'medalSilver' : 'medalBronze')} ${raceTime(r.time)}${r.record ? ` — ${t('raceRecord')}` : ` (${t('raceBest')} ${raceTime(r.best)})`}`),
    onCoin: (n, total) => toast(`🪙 ${t('coinFound')} ${n}/${total}`),
    onMission: (m) => toast(`${m.emoji} ${t('missionDone')} ${missionText(m)}`),
    onJobDone: (job) => { if (job.kind === 'pizza') toast(job.hot ? t('pizzaHot') : t('pizzaThanks')); },
    onPlace: (place) => (place === 'iceCream' ? openIceCream() : place === 'supermarket' ? openSupermarket() : place === 'petShop' ? openPetShop() : place === 'paintShop' ? openPaintShop() : openPanel(place)),
    onMessage: (key, n) => toast(n ? `${t(key)} ${euro(n)}` : t(key)),
    onPlayer: (kind, name) => toast(t(kind === 'joined' ? 'mpJoined' : kind === 'left' ? 'mpLeft' : 'mpFound').replace('{name}', name)),
  });

  let chatCleanup = () => {};
  // Multiplayer: join the server picked on the multiplayer screen.
  const mpSession = getCurrentSession();
  setCurrentSession(null);
  if (mpSession) game.setMultiplayer(mpSession);
  const mpPill = h('div', { class: 'mp-pill', hidden: !mpSession }, '');
  root.append(mpPill);

  // 💬 Chat + emotes (multiplayer only). Every line is filtered (rude words, links, phone numbers);
  // tap a name to mute that player; chat can be switched off in ⚙️ Settings (then only emotes).
  if (mpSession) {
    const chatOn = loadChatOn();
    const muted = new Set<string>();
    let unread = 0;
    const badge = h('span', { class: 'chat-badge', hidden: true }, '');
    const chatBtn = h('button', { class: 'chat-btn', 'aria-label': t('chat'), title: `${t('chat')} (T)` }, '💬', badge);
    const log = h('div', { class: 'chat-log' });
    const input = h('input', { class: 'chat-input', maxlength: String(CHAT_MAX), placeholder: t('chatPlaceholder'), 'aria-label': t('chat') }) as HTMLInputElement;
    const sendBtn = h('button', { class: 'btn btn-primary chat-send' }, t('chatSend'));
    const emotes = h('div', { class: 'chat-emotes' }, ...EMOTES.map((em) => {
      const b = h('button', { class: 'chat-emote' }, em);
      b.addEventListener('click', () => { if (!mpSession.sendEmote(em)) toast(t('chatTooFast')); });
      return b;
    }));
    const panel = h('div', { class: 'card chat-panel', hidden: true },
      h('div', { class: 'place-head' }, h('h2', {}, `💬 ${t('chat')}`),
        h('button', { class: 'icon-btn close-btn', 'aria-label': t('back'), onclick: () => { panel.hidden = true; input.blur(); } }, '✕')),
      log, emotes,
      chatOn ? h('div', { class: 'chat-row' }, input, sendBtn) : h('div', { class: 'try-hint' }, t('chatOffHint')),
      h('div', { class: 'try-hint' }, t('chatMuteHint')),
    );
    const send = () => {
      const text = input.value.trim();
      if (!text) return;
      if (mpSession.sendChat(text)) input.value = '';
      else toast(t('chatTooFast'));
    };
    sendBtn.addEventListener('click', send);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); send(); } e.stopPropagation(); });
    const open = () => { panel.hidden = !panel.hidden; unread = 0; badge.hidden = true; if (!panel.hidden && chatOn) setTimeout(() => input.focus(), 50); };
    chatBtn.addEventListener('click', open);
    window.addEventListener('keydown', onChatKey);
    function onChatKey(e: KeyboardEvent) { if (e.code === 'KeyT' && document.activeElement !== input && panel.hidden) { e.preventDefault(); open(); } }
    const offChat = mpSession.onChat((m) => {
      if (muted.has(m.from) || (!chatOn && m.text)) return;
      const mine = m.from === mpSession.myId;
      const name = h('button', { class: 'chat-name', title: t('chatMute') }, mine ? t('chatYou') : m.name);
      if (!mine) name.addEventListener('click', () => { muted.add(m.from); toast(`🔇 ${m.name}`); [...log.querySelectorAll(`[data-from="${m.from}"]`)].forEach((el) => el.remove()); });
      const row = h('div', { class: `chat-line ${m.emote ? 'emote' : ''} ${mine ? 'mine' : ''}`, 'data-from': m.from }, name, h('span', {}, m.emote ?? m.text ?? ''));
      log.append(row);
      while (log.childElementCount > 20) log.firstElementChild!.remove();
      log.scrollTop = log.scrollHeight;
      if (!mine) game.showChatBubble(m.from, m.emote ?? m.text ?? '', !!m.emote);
      if (panel.hidden && !mine) { unread++; badge.textContent = String(unread); badge.hidden = false; }
    });
    root.append(chatBtn, panel);
    chatCleanup = () => { offChat(); window.removeEventListener('keydown', onChatKey); };
  }
  action.addEventListener('click', () => game.pressCar());
  renderEvening();
  ctxBtn.addEventListener('click', () => game.pressContext());
  tabletBtn.addEventListener('click', () => {
    tablet = !tablet;
    try { localStorage.setItem(TABLET_KEY, tablet ? '1' : '0'); } catch { /* ignore */ }
    touch.reset();
    render();
  });
  // ---------- minimap + big map ----------
  let minimap: Minimap | null = null, bigMap: BigMap | null = null, mapRaf = 0, lastMap = 0;
  const openMap = () => {
    touch.reset();
    game.pause();
    mapOverlay.hidden = false;
    render();
    const ms = game.mapState();
    if (ms) requestAnimationFrame(() => bigMap?.draw(ms));
  };
  const mapLoop = (now: number) => {
    mapRaf = requestAnimationFrame(mapLoop);
    if (now - lastMap < 100) return; // 10 times per second is plenty
    lastMap = now;
    const ms = game.mapState();
    if (!ms) return;
    if (!minimap && game.roads && game.city) {
      const L = game.city.layout;
      const base = renderBaseMap(L, game.roads);
      places = { home: L.pois.home.door, apartment: L.pois.apartment.door, gas: L.pois.gasStation, iceCream: L.pois.iceCream.front, supermarket: L.pois.supermarket.front, petShop: L.pois.petShop.front, paintShop: L.pois.paintShop.front, pizzeria: L.pois.pizzeria.front, funFair: L.pois.funFair.wheel.front };
      minimap = new Minimap(base, places, openMap, (id) => {
        const name = game.navigateToPlayer(id);
        if (name) toast(t('mpNavTo').replace('{name}', name));
      });
      mapWrap.append(minimap.el, minimap.tip);
      bigMap = new BigMap(base, places, (p) => { game.setDestination(p); toast(t('destSet')); closeMap(); });
      bigHolder.append(bigMap.canvas);
    }
    minimap?.draw(ms);
    if (!mapOverlay.hidden) bigMap?.draw(ms);
  };
  mapRaf = requestAnimationFrame(mapLoop);

  const offProfile = onProfileChange((p) => { money.lastElementChild!.textContent = euro(p.money); });

  // ---------- house / apartment panel ----------
  // Inside the apartment: a cozy 3D room with your avatar (kept while the panel is open).
  let room: ApartmentRoom | null = null;
  let roomCanvas: HTMLCanvasElement | null = null;
  const closeRoom = () => { room?.dispose(); room = null; roomCanvas = null; };
  /** The ice cream stand: four flavors as big buttons. */
  function openIceCream() {
    touch.reset();
    const close = () => { panel.hidden = true; game.resume(); render(); };
    panel.replaceChildren(h('div', { class: 'card place-card' },
      h('div', { class: 'place-head' },
        h('h2', {}, `🍦 ${t('iceCreamShop')}`),
        h('button', { class: 'icon-btn close-btn', 'aria-label': t('back'), onclick: close }, '✕'),
      ),
      h('h3', {}, `${t('pickFlavor')} (${euro(ICE_CREAM_PRICE)})`),
      h('div', { class: 'tiles' }, ...FLAVORS.map((f) => {
        const b = h('button', { class: 'tile flavor-tile' },
          h('span', { class: 'tile-emoji flavor-scoop', style: `background:${f.color}` }, f.emoji),
          h('span', {}, t(`fl_${f.id}`)));
        b.addEventListener('click', () => { if (game.buyIceCream(f.id)) { close(); toast(t('yum')); } });
        return b;
      })),
      h('button', { class: 'btn btn-primary btn-big', onclick: close }, t('continuePlaying')),
    ));
    panel.hidden = false;
    render();
  }

  /** The supermarket: three snacks as big buttons, each with what it does. */
  function openSupermarket() {
    touch.reset();
    const close = () => { panel.hidden = true; game.resume(); render(); };
    panel.replaceChildren(h('div', { class: 'card place-card' },
      h('div', { class: 'place-head' },
        h('h2', {}, `🛒 ${t('supermarket')}`),
        h('button', { class: 'icon-btn close-btn', 'aria-label': t('back'), onclick: close }, '✕'),
      ),
      h('h3', {}, t('pickSnack')),
      h('div', { class: 'tiles' }, ...SNACKS.map((sn) => {
        const b = h('button', { class: 'tile snack-tile' },
          h('span', { class: 'tile-emoji' }, sn.emoji),
          h('b', {}, `${t(`sn_${sn.id}`)} ${euro(sn.price)}`),
          h('small', {}, t(`sn_${sn.id}_info`)));
        b.addEventListener('click', () => { if (game.buySnack(sn.id)) { close(); toast(t('snackBought')); } });
        return b;
      })),
      h('button', { class: 'btn btn-primary btn-big', onclick: close }, t('continuePlaying')),
    ));
    panel.hidden = false;
    render();
  }

  type TKey = Parameters<typeof t>[0];
  /** A pet tile: the animal emoji on its own color, the name, and the price or "with you". */
  const petTile = (id: string, extra: string, active: boolean, onPick: () => void) => {
    const spec = getPet(id)!;
    const b = h('button', { class: `tile pet-tile ${active ? 'active' : ''}` },
      h('span', { class: 'tile-emoji pet-dot', style: `background:${spec.color}` }, spec.kind === 'dog' ? '🐶' : '🐱'),
      h('b', {}, t(`pet_${id}` as TKey)), h('small', {}, extra));
    b.addEventListener('click', onPick);
    return b;
  };

  /** The paint shop: new paint, a roof stripe, rim colors for the car you're in. */
  function openPaintShop() {
    touch.reset();
    const close = () => { panel.hidden = true; game.resume(); render(); };
    const look = game.carLook();
    if (!look) return close();
    const row = (part: 'color' | 'stripe' | 'rims', colors: string[], current: string, price: number) =>
      h('div', { class: 'swatches paint-swatches' }, ...colors.map((c) => {
        const b = h('button', { class: `swatch ${c === current ? 'active' : ''} ${c ? '' : 'swatch-none'}`, style: c ? `background:${c}` : '', 'aria-label': c || t('noPet') }, c ? '' : '🚫');
        b.addEventListener('click', () => { if (game.paintCar(part, c)) { toast(`🎨 ${t('painted')}`); openPaintShop(); } });
        return b;
      }), h('span', { class: 'paint-price' }, euro(price)));
    panel.replaceChildren(h('div', { class: 'card place-card' },
      h('div', { class: 'place-head' },
        h('h2', {}, `🎨 ${t('paintShop')}`),
        h('button', { class: 'icon-btn close-btn', 'aria-label': t('back'), onclick: close }, '✕'),
      ),
      look.paintable ? h('h3', {}, t('paintColor')) : null,
      look.paintable ? row('color', [...PAINT_COLORS, ...EXTRA_PAINT], look.color, PAINT_PRICE) : null,
      look.bike ? null : h('h3', {}, t('roofStripe')),
      look.bike ? null : row('stripe', STRIPE_COLORS, look.stripe, EXTRA_PRICE),
      h('h3', {}, t('rimColor')),
      row('rims', RIM_COLORS, look.rims, EXTRA_PRICE),
      h('h3', {}, `📯 ${t('hornShop')}`),
      h('div', { class: 'horn-grid' }, ...HORNS.map((hn) => {
        const owned = hn.price === 0 || getProfile()!.horns.includes(hn.id);
        const chosen = game.carHorn() === hn.id;
        const b = h('button', { class: `horn-tile ${chosen ? 'active' : ''}` },
          h('span', { class: 'horn-emoji' }, hn.emoji),
          h('b', {}, t(`horn_${hn.id}` as TKey)),
          h('small', {}, chosen ? `✓ ${t('hornChosen')}` : owned ? t('hornChoose') : euro(hn.price)),
        );
        b.addEventListener('click', () => {
          game.previewHorn(hn.id);
          if (chosen) return;
          if (game.chooseHorn(hn.id)) { toast(`${hn.emoji} ${t('hornNew')}`); openPaintShop(); }
        });
        return b;
      })),
      h('div', { class: 'try-hint' }, t('hornHint')),
      h('button', { class: 'btn btn-primary btn-big', onclick: close }, t('continuePlaying')),
    ));
    panel.hidden = false;
    render();
  }

  /** The pet shop: every dog and cat; owned ones can be chosen, others bought. */
  function openPetShop() {
    touch.reset();
    const close = () => { panel.hidden = true; game.resume(); render(); };
    const p = getProfile()!;
    panel.replaceChildren(h('div', { class: 'card place-card' },
      h('div', { class: 'place-head' },
        h('h2', {}, `🐾 ${t('petShop')}`),
        h('button', { class: 'icon-btn close-btn', 'aria-label': t('back'), onclick: close }, '✕'),
      ),
      h('h3', {}, t('pickPet')),
      h('div', { class: 'tiles' }, ...PETS.map((pt) => {
        const owned = p.pets.includes(pt.id), active = p.activePet === pt.id;
        return petTile(pt.id, active ? t('petWithYou') : owned ? t('petOwned') : euro(pt.price), active, () => {
          if (game.buyPet(pt.id)) { close(); toast(t('petComes').replace('{name}', t(`pet_${pt.id}` as TKey))); }
        });
      })),
      h('button', { class: 'btn btn-primary btn-big', onclick: close }, t('continuePlaying')),
    ));
    panel.hidden = false;
    render();
  }

  function openPanel(place: 'home' | 'apartment') {
    const p = getProfile()!;
    touch.reset();
    const close = () => { panel.hidden = true; closeRoom(); game.resume(); render(); };
    if (place === 'apartment' && !room) {
      roomCanvas = h('canvas', { class: 'room-canvas', title: '🙂' }) as HTMLCanvasElement;
      room = new ApartmentRoom(roomCanvas, p.furniture);
    }
    if (place === 'apartment') void room!.show(p.gender, p.equipped.outfit);
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
      place === 'apartment' ? roomCanvas : null,
      place === 'apartment' ? h('h3', {}, `🛋️ ${t('furnitureShop')}`) : null,
      place === 'apartment' ? h('div', { class: 'tiles' }, ...FURNITURE.filter((f) => f.price > 0 || p.furniture.includes(f.id)).map((f) => {
        const owned = p.furniture.includes(f.id);
        const b = h('button', { class: `tile furniture-tile ${owned ? 'active' : ''}` },
          h('span', { class: 'tile-emoji' }, f.emoji), h('b', {}, t(`fu_${f.id}` as TKey)), h('small', {}, owned ? `✓ ${t('inYourRoom')}` : euro(f.price)));
        if (!owned) b.addEventListener('click', () => { if (game.buyFurniture(f.id)) { room?.setFurniture(getProfile()!.furniture); openPanel(place); } });
        return b;
      })) : null,
      h('h3', {}, t('myVehicles')),
      tiles(p.ownedVehicles.map((id) => ({
        id, emoji: getVehicle(id).kind === 'motor' ? '🏍️' : '🚗', label: vehicleName(getVehicle(id)), active: id === p.selectedVehicle,
        onPick: () => game.swapVehicle(id, place),
      }))),
      p.pets.length ? h('h3', {}, `🐾 ${t('myPets')}`) : null,
      p.pets.length ? h('div', { class: 'tiles' },
        ...p.pets.map((id) => petTile(id, p.activePet === id ? t('petWithYou') : '', p.activePet === id, () => { game.choosePet(id); openPanel(place); })),
        (() => { const b = h('button', { class: `tile ${p.activePet ? '' : 'active'}` }, h('span', { class: 'tile-emoji' }, '🚫'), h('span', {}, t('noPet'))); b.addEventListener('click', () => { game.choosePet(''); openPanel(place); }); return b; })(),
      ) : null,
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

  // Controller B / ○ or Esc: close the open panel (taps its ✕ button).
  const onBack = (e: Event) => {
    if (e instanceof KeyboardEvent && e.key !== 'Escape') return;
    const btn = [...root.querySelectorAll<HTMLButtonElement>('.close-btn')].find((b) => b.offsetParent !== null);
    btn?.click();
  };
  window.addEventListener('carcity-back', onBack);
  window.addEventListener('keydown', onBack);

  if (import.meta.env.DEV) Object.assign(window, { carcityDebug: { game, input } });
  // A new version is about to load: save money / fuel / km first.
  const onUpdateSave = () => game.saveNow();
  window.addEventListener('carcity-save', onUpdateSave);

  return () => {
    window.removeEventListener('carcity-save', onUpdateSave);
    chatCleanup();
    window.removeEventListener('carcity-back', onBack);
    window.removeEventListener('keydown', onBack);
    closeRoom();
    cancelAnimationFrame(mapRaf);
    window.removeEventListener('pointerdown', sounds.unlock);
    window.removeEventListener('keydown', sounds.unlock);
    offProfile();
    game.dispose();
    touch.dispose();
    input.dispose();
  };
};
