import { AvatarView } from '../game/avatar/avatarView';
import { Showroom } from '../game/showroom';
import { getVehicle, vehicleName } from '../game/vehicles/catalog';
import { t } from '../i18n';
import { getBackend, getProfile, onProfileChange, setProfile, updateProfile } from '../services/session';
import { euro } from './money';
import { h, icons, svgIcon } from './dom';
import type { Screen } from './screens';
import { openStickerBook } from './stickers';
import { openSettings } from './settings';
import { STICKERS } from '../game/stickers';

/** Game menu: avatar (top-left), selected car in the showroom, shops and Play. */
export const menuScreen: Screen = (root, nav) => {
  const p = getProfile();
  if (!p) return nav('login');

  // --- 3D views ---
  const showroomCanvas = h('canvas', { class: 'showroom-canvas' });
  const avatarCanvas = h('canvas', { class: 'avatar-canvas', title: '🙂' });
  const showroom = new Showroom(showroomCanvas);
  const avatarView = new AvatarView(avatarCanvas);
  showroom.showVehicle(p.selectedVehicle, p.vehicleColors[p.selectedVehicle]);
  avatarView.show(p.gender, p.equipped.outfit);

  // --- avatar card ---
  const money = h('div', { class: 'money-chip' }, svgIcon(icons.coin, 20), h('span', {}, euro(p.money)));
  const stickerCount = h('span', {});
  const stickerBtn = h('button', { class: 'sticker-btn', onclick: () => openStickerBook() }, '⭐ ', h('span', {}, t('stickers')), ' ', stickerCount);
  const renderStickers = () => { stickerCount.textContent = `${getProfile()?.stickers.length ?? 0}/${STICKERS.length}`; };
  renderStickers();
  const card = h('div', { class: 'card avatar-card' },
    avatarCanvas,
    h('div', { class: 'avatar-name' }, p.username),
    money,
    stickerBtn,
  );

  // --- car picker (only owned cars) ---
  const carName = h('div', { class: 'car-name' });
  const prev = h('button', { class: 'round-btn', 'aria-label': 'previous' }, svgIcon('<path d="M15 5l-7 7 7 7"/>', 26));
  const next = h('button', { class: 'round-btn', 'aria-label': 'next' }, svgIcon('<path d="M9 5l7 7-7 7"/>', 26));
  const picker = h('div', { class: 'car-picker' }, prev, carName, next);

  let closeSettings: (() => void) | null = null;
  let saveTimer = 0;
  const renderCar = () => {
    const prof = getProfile()!;
    const spec = getVehicle(prof.selectedVehicle);
    carName.replaceChildren(h('small', {}, t('myVehicles')), h('span', {}, vehicleName(spec)));
    const many = prof.ownedVehicles.length > 1;
    prev.hidden = next.hidden = !many;
    showroom.showVehicle(prof.selectedVehicle, prof.vehicleColors[prof.selectedVehicle]);
  };
  const step = (dir: number) => {
    const prof = getProfile()!;
    const list = prof.ownedVehicles;
    const i = (list.indexOf(prof.selectedVehicle) + dir + list.length) % list.length;
    setProfile({ ...prof, selectedVehicle: list[i] });
    renderCar();
    clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => { saveTimer = 0; updateProfile({ selectedVehicle: getProfile()!.selectedVehicle }); }, 600);
  };
  prev.addEventListener('click', () => step(-1));
  next.addEventListener('click', () => step(1));
  renderCar();

  // --- actions ---
  const actions = h('div', { class: 'menu-actions' },
    h('button', { class: 'btn btn-tile', onclick: () => nav('vehicleShop') }, svgIcon(icons.car, 30), h('span', {}, t('vehicleShop'))),
    h('button', { class: 'btn btn-primary btn-play', onclick: () => nav('game') }, svgIcon(icons.play, 30), h('span', {}, t('play'))),
    h('button', { class: 'btn btn-tile', onclick: () => nav('clothesShop') }, svgIcon(icons.shirt, 30), h('span', {}, t('clothesShop'))),
    h('button', { class: 'btn btn-tile', onclick: () => nav('multiplayer') }, h('span', { class: 'tile-emoji' }, '🌐'), h('span', {}, t('multiplayer'))),
  );

  const logout = async () => {
    await (await getBackend()).logout();
    setProfile(null);
    nav('login');
  };

  root.append(
    showroomCanvas,
    card,
    h('div', { class: 'drag-hint' }, t('dragToTurn')),
    picker,
    actions,
    h('button', { class: 'icon-btn logout', onclick: logout, 'aria-label': t('logout'), title: t('logout') }, svgIcon(icons.logout, 22)),
    h('button', { class: 'btn settings-btn', onclick: () => { closeSettings = openSettings(); }, 'aria-label': t('settings'), title: t('settings') }, '⚙️ ', h('span', {}, t('settings'))),
  );

  const offProfile = onProfileChange((np) => {
    money.lastElementChild!.textContent = euro(np.money);
    renderStickers();
  });

  return () => {
    if (saveTimer) updateProfile({ selectedVehicle: getProfile()?.selectedVehicle });
    clearTimeout(saveTimer);
    offProfile();
    document.querySelector('.sticker-book')?.remove();
    closeSettings?.();
    showroom.dispose();
    avatarView.dispose();
  };
};
