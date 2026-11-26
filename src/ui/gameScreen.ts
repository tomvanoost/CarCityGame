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

  root.append(canvas, touch.drive, touch.walk, dash, yieldBubble, jobCard, ctxBtn, action, hornBtn, sirenBtn, hint, popups, back, speedBtn, money, speedPop, tabletBtn, soundBtn, eveningBtn, viewBtn, mapWrap, panel, mapOverlay, loading);

  let tutorialOpen = false;
  let state: GameState = { mode: 'driving', canEnter: false, kmh: 0, yielding: false, fuel: 1, refueling: false, washing: false, context: null, job: null, dest: null, topSpeed: 0, maxSpeed: null, blinker: null, mp: null, police: false, siren: false };
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
    onMoney: (amount, reason) => popup(amount, t(reason === 'job' ? 'jobDone' : reason === 'daily' ? 'dailyBonus' : reason === 'apartment' ? 'apartmentBought' : reason === 'wash' ? 'carWash' : 'refuel')),
    onJobStart: (job) => toast(job.kind === 'delivery' ? t('pickedPackage') : t('pickedPassenger')),
    onPlace: (place) => openPanel(place),
    onMessage: (key, n) => toast(n ? `${t(key)} ${euro(n)}` : t(key)),
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
      places = { home: L.pois.home.door, apartment: L.pois.apartment.door, gas: L.pois.gasStation };
      minimap = new Minimap(base, places, openMap);
      mapWrap.append(minimap.el);
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
  function openPanel(place: 'home' | 'apartment') {
    const p = getProfile()!;
    touch.reset();
    const close = () => { panel.hidden = true; closeRoom(); game.resume(); render(); };
    if (place === 'apartment' && !room) {
      roomCanvas = h('canvas', { class: 'room-canvas', title: '🙂' }) as HTMLCanvasElement;
      room = new ApartmentRoom(roomCanvas);
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
      h('h3', {}, t('myVehicles')),
      tiles(p.ownedVehicles.map((id) => ({
        id, emoji: getVehicle(id).kind === 'motor' ? '🏍️' : '🚗', label: vehicleName(getVehicle(id)), active: id === p.selectedVehicle,
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

  // Controller B / ○ or Esc: close the open panel (taps its ✕ button).
  const onBack = (e: Event) => {
    if (e instanceof KeyboardEvent && e.key !== 'Escape') return;
    const btn = [...root.querySelectorAll<HTMLButtonElement>('.close-btn')].find((b) => b.offsetParent !== null);
    btn?.click();
  };
  window.addEventListener('carcity-back', onBack);
  window.addEventListener('keydown', onBack);

  if (import.meta.env.DEV) Object.assign(window, { carcityDebug: { game, input } });

  return () => {
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
