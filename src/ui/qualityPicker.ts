import { loadQualityChoice, saveQualityChoice, type QualityChoice } from '../game/world/quality';
import { t } from '../i18n';
import { h } from './dom';
import { toast } from './toast';

/** ⚙️ in the menu: two big buttons, "Mooi" (prettiest picture) or "Snel" (smoother on older tablets). */
export function openQualityPicker() {
  const current = loadQualityChoice();
  const close = () => overlay.remove();
  const option = (c: QualityChoice, emoji: string, title: string, text: string) => {
    const b = h('button', { class: `quality-option ${current === c ? 'active' : ''}` },
      h('span', { class: 'quality-emoji' }, emoji), h('b', {}, title), h('small', {}, text));
    b.addEventListener('click', () => { saveQualityChoice(c); close(); toast(t('qualitySaved')); });
    return b;
  };
  const overlay = h('div', { class: 'quality-picker' },
    h('div', { class: 'card quality-card' },
      h('div', { class: 'place-head' },
        h('h2', {}, `⚙️ ${t('quality')}`),
        h('button', { class: 'icon-btn close-btn', 'aria-label': t('back'), onclick: close }, '✕'),
      ),
      h('div', { class: 'quality-options' },
        option('pretty', '✨', t('qualityPretty'), t('qualityPrettyText')),
        option('fast', '⚡', t('qualityFast'), t('qualityFastText')),
      ),
      current ? null : h('div', { class: 'try-hint' }, t('qualityAuto')),
    ),
  );
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  document.body.append(overlay);
}
