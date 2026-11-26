import { t } from '../i18n';
import { setCurrentSession, type RoomInfo } from '../services/multiplayer';
import { getBackend, getProfile } from '../services/session';
import { cleanText } from '../services/textFilter';
import { h, svgIcon } from './dom';
import type { Screen } from './screens';
import { toast } from './toast';

/**
 * 🌐 Multiplayer: make your own server or pick one from the list, then play in the same city as
 * the other players there. The list refreshes by itself every few seconds.
 */
export const multiplayerScreen: Screen = (root, nav) => {
  const profile = getProfile();
  if (!profile) return nav('login');
  let disposed = false;
  let busy = false;

  const back = h('button', { class: 'icon-btn back-btn', 'aria-label': t('back'), onclick: () => nav('menu') }, svgIcon('<path d="M15 5l-7 7 7 7"/>', 26));
  const nameInput = h('input', { class: 'mp-name', maxlength: '24', value: t('mpDefaultName').replace('{name}', profile.username), 'aria-label': t('mpServerName') }) as HTMLInputElement;
  const createBtn = h('button', { class: 'btn btn-primary btn-big' }, `➕ ${t('mpCreate')}`);
  const list = h('div', { class: 'mp-list' }, h('div', { class: 'try-hint' }, t('mpLoading')));

  const join = async (roomId: string) => {
    if (busy) return;
    busy = true;
    try {
      const mp = (await getBackend()).multiplayer();
      const session = await mp.join(roomId);
      if (disposed) return session.leave();
      setCurrentSession(session);
      nav('game');
    } catch {
      toast(t('mpJoinFailed'));
      void refresh();
    } finally { busy = false; }
  };

  createBtn.addEventListener('click', async () => {
    const name = cleanText(nameInput.value, 24) || t('mpDefaultName').replace('{name}', profile.username);
    if (busy) return;
    busy = true;
    try {
      const mp = (await getBackend()).multiplayer();
      const id = await mp.createRoom(name, profile.username);
      busy = false;
      await join(id);
    } catch {
      toast(t('mpJoinFailed'));
    } finally { busy = false; }
  });

  const row = (r: RoomInfo) => {
    const btn = h('button', { class: 'btn btn-primary mp-join' }, t('mpJoin'));
    btn.addEventListener('click', () => join(r.id));
    return h('div', { class: 'mp-row' },
      h('span', { class: 'mp-icon' }, '🌐'),
      h('span', { class: 'mp-info' }, h('b', {}, r.name), h('small', {}, `${t('mpBy')} ${r.host}`)),
      h('span', { class: 'mp-count' }, `👥 ${r.players}`),
      btn);
  };

  const refresh = async () => {
    try {
      const rooms = await (await getBackend()).multiplayer().listRooms();
      if (disposed) return;
      list.replaceChildren(...(rooms.length ? rooms.map(row) : [h('div', { class: 'try-hint' }, t('mpEmpty'))]));
    } catch {
      if (!disposed) list.replaceChildren(h('div', { class: 'try-hint' }, t('mpOffline')));
    }
  };
  void refresh();
  const timer = window.setInterval(refresh, 3000);

  root.append(
    back,
    h('div', { class: 'card mp-card' },
      h('h2', {}, `🌐 ${t('multiplayer')}`),
      h('div', { class: 'mp-create' }, h('label', {}, t('mpServerName')), nameInput, createBtn),
      h('h3', { class: 'settings-title' }, `📋 ${t('mpServers')}`),
      list,
      h('div', { class: 'try-hint' }, t('mpHint')),
    ),
  );

  return () => { disposed = true; clearInterval(timer); };
};
