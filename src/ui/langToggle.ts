import { getLang, setLang } from '../i18n';
import { h } from './dom';

export function langToggle(): HTMLElement {
  const make = (l: 'nl' | 'en') =>
    h('button', { class: getLang() === l ? 'active' : '', onclick: () => setLang(l), 'aria-label': l }, l.toUpperCase());
  return h('div', { class: 'lang-toggle' }, make('nl'), make('en'));
}
