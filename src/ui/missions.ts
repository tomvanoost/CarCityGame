import { missionDay, todaysMissions, type Mission } from '../game/missions';
import { t, type TKey } from '../i18n';
import type { PlayerProfile } from '../services/types';
import { h } from './dom';
import { euro } from './money';

/** "Drive 5 km" etc. */
export const missionText = (m: Mission) => t(`mi_${m.id}` as TKey).replace('{n}', String(m.goal));

/** Small "🎯 Today's missions" panel for the menu: three goals with a progress bar each. */
export function renderMissions(el: HTMLElement, p: PlayerProfile) {
  const st = missionDay(p);
  const rows = todaysMissions().map((m) => {
    const done = st.done.includes(m.id);
    const value = done ? m.goal : Math.min(m.goal, st.progress[m.id] ?? 0);
    const shown = m.id === 'drive' ? value.toFixed(1).replace(/\.0$/, '') : String(Math.floor(value));
    const bar = h('div', { class: 'mission-bar' }, h('i', { style: `width: ${Math.round((value / m.goal) * 100)}%` }));
    return h('div', { class: `mission ${done ? 'done' : ''}` },
      h('span', { class: 'mission-emoji' }, done ? '✅' : m.emoji),
      h('div', { class: 'mission-body' },
        h('div', { class: 'mission-text' }, missionText(m)),
        done ? h('div', { class: 'mission-reward' }, `${t('missionPaid')} ${euro(m.reward)}`) : h('div', { class: 'mission-row' }, bar, h('small', {}, `${shown}/${m.goal}`)),
      ),
      done ? '' : h('span', { class: 'mission-reward' }, euro(m.reward)),
    );
  });
  el.replaceChildren(h('div', { class: 'missions-title' }, `🎯 ${t('missionsToday')}`), ...rows);
}
