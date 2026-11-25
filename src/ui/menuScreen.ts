import { t } from '../i18n';
import { getBackend, getProfile, setProfile } from '../services/session';
import { h, icons, svgIcon } from './dom';
import type { Screen } from './screens';

/** Step 2 placeholder. Step 3 adds the 3D avatar, shops and car selector. */
export const menuScreen: Screen = (root, nav) => {
  const p = getProfile();
  if (!p) return nav('login');

  const logout = async () => {
    await (await getBackend()).logout();
    setProfile(null);
    nav('login');
  };

  root.append(
    h('div', { class: 'menu-bg' }),
    h('div', { class: 'menu-top' },
      h('div', { class: 'player-chip' },
        h('span', { class: 'gender-emoji' }, p.gender === 'girl' ? '👧' : '👦'),
        h('span', {}, `${t('welcome')} ${p.username}!`),
      ),
      h('div', { class: 'money-chip' }, svgIcon(icons.coin, 22), `€ ${p.money.toLocaleString()}`),
    ),
    h('div', { class: 'menu-center' },
      h('button', { class: 'btn btn-primary btn-huge', disabled: true }, svgIcon(icons.play, 28), t('play')),
      h('div', { class: 'soon' }, t('comingSoon')),
    ),
    h('button', { class: 'btn btn-ghost logout', onclick: logout }, svgIcon(icons.logout, 20), t('logout')),
  );
};
