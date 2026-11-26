import { Gamepads, type PadKind } from '../game/play/gamepad';
import { loadQualityChoice, saveQualityChoice, type QualityChoice } from '../game/world/quality';
import { loadChatOn, saveChatOn } from '../services/multiplayer';
import { sounds } from '../game/play/sounds';
import { t } from '../i18n';
import { h } from './dom';
import { toast } from './toast';

const PAD_ICON: Record<PadKind, string> = { xbox: '🎮', playstation: '🎮', nintendo: '🎮', wheel: '🏎️', other: '🕹️' };

/**
 * ⚙️ Settings (from the home menu): graphics ("Snel" for more FPS or "Kwaliteit" for the most beautiful
 * picture) and the controllers / steering wheels that are connected, with what their buttons do.
 */
export function openSettings() {
  const close = () => { clearInterval(timer); window.removeEventListener('gamepadconnected', renderPads); window.removeEventListener('gamepaddisconnected', renderPads); overlay.remove(); };

  const options = h('div', { class: 'quality-options' });
  const auto = h('div', { class: 'settings-auto' });
  const renderQuality = () => {
    const current = loadQualityChoice();
    const option = (c: QualityChoice, emoji: string, title: string, text: string) => {
      const b = h('button', { class: `quality-option ${current === c ? 'active' : ''}` },
        h('span', { class: 'quality-emoji' }, emoji), h('b', {}, title), h('small', {}, text));
      b.addEventListener('click', () => { saveQualityChoice(c); renderQuality(); toast(t('qualitySaved')); });
      return b;
    };
    options.replaceChildren(
      option('fast', '⚡', t('qualityFast'), t('qualityFastText')),
      option('quality', '✨', t('qualityMax'), t('qualityMaxText')),
    );
    if (current) {
      const b = h('button', { class: 'btn btn-small' }, `🤖 ${t('qualityAutoBtn')}`);
      b.addEventListener('click', () => { saveQualityChoice(null); renderQuality(); toast(t('qualitySaved')); });
      auto.replaceChildren(b);
    } else auto.replaceChildren(h('div', { class: 'try-hint' }, t('qualityAuto')));
  };

  const pads = h('div', { class: 'pad-list' });
  // Browsers only show a controller after one of its buttons is pressed: check often (also for the live test).
  let shown = '';
  const renderPads = () => {
    const list = Gamepads.list();
    const key = list.map((p) => p.kind + p.name + p.active).join('|');
    if (key === shown && pads.childElementCount) return;
    shown = key;
    const kindName = (k: PadKind) => t(k === 'xbox' ? 'padXbox' : k === 'playstation' ? 'padPlaystation' : k === 'nintendo' ? 'padNintendo' : k === 'wheel' ? 'padWheel' : 'padOther');
    pads.replaceChildren(
      ...(list.length
        ? list.map((p) => h('div', { class: `pad-item ${p.active ? 'pressing' : ''}` },
          h('span', { class: 'pad-icon' }, PAD_ICON[p.kind]),
          h('span', { class: 'pad-name' }, h('b', {}, kindName(p.kind)), h('small', {}, p.name)),
          // Live test: shows what you press right now, so you can see the controller works.
          h('small', { class: 'pad-state' }, p.active ? `${p.active} ${t('padWorks')}` : `✓ ${t('padConnected')}`)))
        : [h('div', { class: 'try-hint' }, t('padNone'))]),
      h('div', { class: 'pad-help' }, h('b', {}, `🎮 ${t('padHelpTitle')}`), h('span', {}, t('padHelp'))),
      h('div', { class: 'pad-help' }, h('b', {}, `🏎️ ${t('padWheelTitle')}`), h('span', {}, t('padWheelHelp'))),
    );
  };
  const timer = setInterval(renderPads, 150);
  window.addEventListener('gamepadconnected', renderPads);
  window.addEventListener('gamepaddisconnected', renderPads);

  // Chat in multiplayer on or off (off: only the friendly emoji).
  const chatRow = h('div', { class: 'settings-chat' });
  const renderChat = () => {
    const on = loadChatOn();
    const btn = (value: boolean, label: string) => {
      const b = h('button', { class: `btn settings-choice ${on === value ? 'active' : ''}` }, label);
      b.addEventListener('click', () => { saveChatOn(value); renderChat(); toast(t('qualitySaved')); });
      return b;
    };
    chatRow.replaceChildren(btn(true, `💬 ${t('chatOnBtn')}`), btn(false, `😀 ${t('chatOffBtn')}`));
  };
  renderChat();

  // Engine sound on or off (the horn, coins etc. keep playing).
  const engineRow = h('div', { class: 'settings-chat' });
  const renderEngine = () => {
    const btn = (value: boolean, label: string) => {
      const b = h('button', { class: `btn settings-choice ${sounds.engineOn === value ? 'active' : ''}` }, label);
      b.addEventListener('click', () => { sounds.setEngineOn(value); renderEngine(); toast(t('qualitySaved')); });
      return b;
    };
    engineRow.replaceChildren(btn(true, `🔊 ${t('engineOnBtn')}`), btn(false, `🔇 ${t('engineOffBtn')}`));
  };
  renderEngine();

  const overlay = h('div', { class: 'quality-picker' },
    h('div', { class: 'card quality-card settings-card' },
      h('div', { class: 'place-head' },
        h('h2', {}, `⚙️ ${t('settings')}`),
        h('button', { class: 'icon-btn close-btn', 'aria-label': t('back'), onclick: close }, '✕'),
      ),
      h('h3', { class: 'settings-title' }, `🖼️ ${t('quality')}`),
      options,
      auto,
      h('h3', { class: 'settings-title' }, `🎮 ${t('controls')}`),
      pads,
      h('h3', { class: 'settings-title' }, `💬 ${t('chatSetting')}`),
      chatRow,
      h('h3', { class: 'settings-title' }, `🚗 ${t('engineSetting')}`),
      engineRow,
    ),
  );
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  renderQuality();
  renderPads();
  document.body.append(overlay);
  return close;
}
