import { t, type TKey } from '../i18n';
import { h } from './dom';

/** Everything the game has, grouped (texts in i18n.ts: featG_<group> and feat_<group><n>). */
const GROUPS: { id: string; emoji: string; items: [string, string][] }[] = [
  { id: 'drive', emoji: '🚗', items: [['🚙', 'feat_drive1'], ['🚓', 'feat_drive2'], ['🛣️', 'feat_drive3'], ['🚦', 'feat_drive4'], ['💡', 'feat_drive5'], ['🪞', 'feat_drive6'], ['📯', 'feat_drive7'], ['🎨', 'feat_drive8'], ['⛽', 'feat_drive9'], ['🔧', 'feat_drive10'], ['🏁', 'feat_drive11'], ['🧭', 'feat_drive12'], ['📷', 'feat_drive13'], ['🎮', 'feat_drive14']] },
  { id: 'work', emoji: '💰', items: [['🍕', 'feat_work1'], ['🚌', 'feat_work2'], ['✅', 'feat_work3'], ['🪙', 'feat_work4'], ['🗺️', 'feat_work5']] },
  { id: 'shops', emoji: '🛍️', items: [['👕', 'feat_shops1'], ['🛒', 'feat_shops2'], ['🍦', 'feat_shops3'], ['🐾', 'feat_shops4'], ['🏠', 'feat_shops5'], ['🛋️', 'feat_shops6'], ['🥕', 'feat_shops7']] },
  { id: 'fun', emoji: '🎉', items: [['🎡', 'feat_fun1'], ['🎈', 'feat_fun2'], ['⛴️', 'feat_fun3'], ['🏊', 'feat_fun4'], ['🪁', 'feat_fun5'], ['🏂', 'feat_fun6'], ['🛹', 'feat_fun7'], ['🎣', 'feat_fun8'], ['🎆', 'feat_fun9'], ['🐐', 'feat_fun10'], ['📚', 'feat_fun11'], ['🔭', 'feat_fun12'], ['🌳', 'feat_fun13'], ['🧺', 'feat_fun14']] },
  { id: 'world', emoji: '🌍', items: [['🏙️', 'feat_world1'], ['🚶', 'feat_world2'], ['🦆', 'feat_world3'], ['🌙', 'feat_world4'], ['🌧️', 'feat_world5']] },
  { id: 'more', emoji: '⭐', items: [['🌐', 'feat_more1'], ['⭐', 'feat_more2'], ['🎓', 'feat_more3'], ['⚙️', 'feat_more4'], ['🇳🇱', 'feat_more5']] },
];

/** 📋 Features (from the home menu): a list of everything you can do in the game. */
export function openFeatures() {
  const close = () => overlay.remove();
  const overlay = h('div', { class: 'quality-picker' },
    h('div', { class: 'card quality-card settings-card features-card' },
      h('div', { class: 'place-head' },
        h('h2', {}, `📋 ${t('featuresTitle')}`),
        h('button', { class: 'icon-btn close-btn', 'aria-label': t('back'), onclick: close }, '✕'),
      ),
      ...GROUPS.map((g) => h('section', { class: 'feature-group' },
        h('h3', { class: 'settings-title' }, `${g.emoji} ${t(`featG_${g.id}` as TKey)}`),
        h('ul', { class: 'feature-list' }, ...g.items.map(([emoji, key]) =>
          h('li', {}, h('span', { class: 'feature-emoji' }, emoji), h('span', {}, t(key as TKey))))),
      )),
    ),
  );
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  document.body.append(overlay);
  return close;
}
