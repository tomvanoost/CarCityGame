import { AvatarView } from '../game/avatar/avatarView';
import { CLOTHES, getClothes } from '../game/avatar/clothes';
import { getLang, t } from '../i18n';
import { getProfile, onProfileChange, updateProfile } from '../services/session';
import { h, icons, svgIcon } from './dom';
import type { Screen } from './screens';
import { toast } from './toast';

const euro = (n: number) => `€ ${Math.round(n).toLocaleString('nl-NL')}`;
/** A representative color per outfit, for the little dot on each tile. */
const DOT: Record<string, string> = { Worker: '#e0a526', Chef: '#f2f2f2', Cowboy: '#8a4b22', OldClassy: '#5a4a3a', Suit: '#1c1d20', Pirate: '#2b2f4a', Viking: '#7a5a3a', Ninja: '#1a1a1a', Kimono: '#e8e2d5' };

/** Clothes shop: try outfits on your 3D avatar, buy them, wear them. */
export const clothesShopScreen: Screen = (root, nav) => {
  const p0 = getProfile();
  if (!p0) return nav('login');

  let trying = p0.equipped.outfit;
  let confirm = false;
  const canvas = h('canvas', { class: 'shop-avatar-canvas' });
  const view = new AvatarView(canvas);
  view.show(p0.gender, trying);

  const money = h('div', { class: 'hud-money shop-money' }, svgIcon(icons.coin, 20), h('span', {}, euro(p0.money)));
  const back = h('button', { class: 'icon-btn back-btn', 'aria-label': t('back'), onclick: () => nav('menu') }, svgIcon('<path d="M15 5l-7 7 7 7"/>', 26));
  const grid = h('div', { class: 'clothes-grid' });
  const action = h('div', { class: 'clothes-action' });
  const panel = h('div', { class: 'card clothes-panel' }, h('h2', {}, `👕 ${t('clothesShop')}`), grid, action);
  root.append(h('div', { class: 'clothes-bg' }), canvas, back, money, panel);

  const render = () => {
    const p = getProfile()!;
    const lang = getLang();
    grid.replaceChildren(...CLOTHES.map((c) => {
      const owned = p.ownedClothes.includes(c.id);
      const dot = c.colors?.Shirt ?? c.colors?.Clothes ?? DOT[c.model] ?? '#3d7bd9';
      const tile = h('button', { class: `tile clothes-tile ${c.id === trying ? 'active' : ''}` },
        h('span', { class: 'shop-dot big', style: `background:${dot}` }),
        h('span', {}, c.name[lang]),
        h('small', {}, p.equipped.outfit === c.id ? `✓ ${t('wearing')}` : owned ? t('owned') : euro(c.price)),
      );
      tile.addEventListener('click', () => {
        trying = c.id;
        confirm = false;
        view.show(p.gender, c.id);
        render();
      });
      return tile;
    }));
    const item = getClothes(trying);
    const owned = p.ownedClothes.includes(item.id);
    let btn: HTMLButtonElement;
    if (p.equipped.outfit === item.id) {
      btn = h('button', { class: 'btn btn-big shop-buy chosen', disabled: true }, `✓ ${t('wearing')}`);
    } else if (owned) {
      btn = h('button', { class: 'btn btn-primary btn-big shop-buy' }, t('wear'));
      btn.addEventListener('click', () => { updateProfile({ equipped: { outfit: item.id } }); render(); });
    } else if (item.price > p.money) {
      btn = h('button', { class: 'btn btn-big shop-buy', disabled: true }, `${t('needMore')} ${euro(item.price - p.money)}`);
    } else {
      btn = h('button', { class: `btn btn-primary btn-big shop-buy ${confirm ? 'confirm' : ''}` }, confirm ? `${t('sureBuy')} ${euro(item.price)}` : `${t('buy')} ${euro(item.price)}`);
      btn.addEventListener('click', () => {
        if (!confirm) { confirm = true; render(); return; }
        const cur = getProfile()!;
        if (cur.money < item.price) return;
        updateProfile({ money: cur.money - item.price, ownedClothes: [...cur.ownedClothes, item.id], equipped: { outfit: item.id } });
        confirm = false;
        toast(`🎉 ${item.name[getLang()]}!`);
        render();
      });
    }
    action.replaceChildren(h('div', { class: 'try-hint' }, t('tapToTry')), btn);
  };

  const off = onProfileChange((p) => { money.lastElementChild!.textContent = euro(p.money); });
  render();
  return () => { off(); view.dispose(); };
};
