import { t } from '../i18n';
import { getBackend, setProfile } from '../services/session';
import { AuthError } from '../services/types';
import { skyBackground } from './background';
import { h, icons, svgIcon } from './dom';
import { authCard, field, logo, setBusy, showError } from './formParts';
import type { Screen } from './screens';

export const loginScreen: Screen = (root, nav) => {
  const user = field('text', t('username'), icons.user, 'username');
  const pass = field('password', t('password'), icons.lock, 'current-password');
  const error = h('div', { class: 'form-error', role: 'alert' });
  const submit = h('button', { class: 'btn btn-primary btn-big', type: 'submit' }, t('login'));

  const form = h('form', { class: 'auth-form', novalidate: true },
    user.wrap, pass.wrap, error, submit,
  );
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    showError(error, '');
    if (!user.input.value.trim() || !pass.input.value) return showError(error, t('errWrong'));
    setBusy(submit, true);
    try {
      const backend = await getBackend();
      setProfile(await backend.login(user.input.value.trim(), pass.input.value));
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
        h('span', {}, t('noAccount')),
        h('button', { class: 'btn btn-ghost', onclick: () => nav('register') }, svgIcon(icons.user, 18), t('register')),
      ),
    ),
  );
  user.input.focus();
};
