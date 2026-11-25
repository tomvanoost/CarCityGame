import { t } from '../i18n';
import { USERNAME_RE } from '../services/profile';
import { getBackend, setProfile } from '../services/session';
import { AuthError, type Gender } from '../services/types';
import { skyBackground } from './background';
import { h, icons, svgIcon } from './dom';
import { authCard, field, logo, setBusy, showError } from './formParts';
import type { Screen } from './screens';

export const registerScreen: Screen = (root, nav) => {
  const user = field('text', t('username'), icons.user, 'username');
  const pass = field('password', t('password'), icons.lock, 'new-password');
  const pass2 = field('password', t('confirmPassword'), icons.lock, 'new-password');
  const error = h('div', { class: 'form-error', role: 'alert' });
  const submit = h('button', { class: 'btn btn-primary btn-big', type: 'submit' }, t('register'));

  let gender: Gender | null = null;
  const genderBtn = (g: Gender, emoji: string) => {
    const b = h('button', { type: 'button', class: `gender-btn ${g}`, 'aria-pressed': 'false' },
      h('span', { class: 'gender-emoji' }, emoji), h('span', {}, t(g)));
    b.addEventListener('click', () => {
      gender = g;
      picker.querySelectorAll('.gender-btn').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    });
    return b;
  };
  const picker = h('div', { class: 'gender-picker' }, genderBtn('boy', '👦'), genderBtn('girl', '👧'));

  const form = h('form', { class: 'auth-form', novalidate: true },
    user.wrap, pass.wrap, pass2.wrap,
    h('div', { class: 'label' }, t('chooseAvatar')), picker,
    error, submit,
  );

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = user.input.value.trim();
    if (!USERNAME_RE.test(name)) return showError(error, t('errUsername'));
    if (pass.input.value.length < 6) return showError(error, t('errPassword'));
    if (pass.input.value !== pass2.input.value) return showError(error, t('errMatch'));
    if (!gender) return showError(error, t('errGender'));
    showError(error, '');
    setBusy(submit, true);
    try {
      const backend = await getBackend();
      setProfile(await backend.register(name, pass.input.value, gender));
      nav('menu');
    } catch (err) {
      showError(error, t(err instanceof AuthError ? err.code : 'errUnknown'));
      setBusy(submit, false);
    }
  });

  root.append(
    skyBackground(),
    authCard(
      logo(),
      form,
      h('div', { class: 'switch-line' },
        h('span', {}, t('haveAccount')),
        h('button', { class: 'btn btn-ghost', onclick: () => nav('login') }, svgIcon(icons.lock, 18), t('login')),
      ),
    ),
  );
  user.input.focus();
};
