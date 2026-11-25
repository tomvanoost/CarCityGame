import { t } from '../i18n';
import { getFirebaseConfig } from '../config';
import { h, svgIcon } from './dom';

export function field(type: string, label: string, icon: string, autocomplete: string) {
  const input = h('input', {
    type, placeholder: label, 'aria-label': label, autocomplete,
    autocapitalize: 'off', spellcheck: 'false', maxlength: 32,
  });
  const wrap = h('label', { class: 'field' }, svgIcon(icon, 22), input);
  return { wrap, input };
}

export function logo(): HTMLElement {
  const el = h('div', { class: 'logo' });
  el.innerHTML = `<span class="logo-car">🚗</span><span>Car<b>City</b></span>`;
  return el;
}

export function authCard(...children: HTMLElement[]): HTMLElement {
  const demo = getFirebaseConfig() ? null : h('div', { class: 'demo-note' }, t('demoMode'));
  return h('div', { class: 'auth-wrap' }, h('div', { class: 'card auth-card' }, ...children), demo);
}

export function showError(el: HTMLElement, msg: string) {
  el.textContent = msg;
  el.classList.toggle('visible', !!msg);
}

export function setBusy(btn: HTMLButtonElement, busy: boolean) {
  btn.disabled = busy;
  btn.classList.toggle('busy', busy);
}
