import { t, type TKey } from '../i18n';
import { h } from './dom';

/**
 * First-time tutorial: a few friendly speech bubbles, one at a time.
 * Shown once per player (profile.tutorialDone), with big buttons.
 */
export function createTutorial(tablet: boolean, onDone: () => void): HTMLElement {
  const steps: { emoji: string; title: TKey; text: TKey }[] = [
    { emoji: '🚗', title: 'tutDriveTitle', text: tablet ? 'tutDriveTablet' : 'tutDriveKeys' },
    { emoji: '🚶', title: 'tutWalkTitle', text: tablet ? 'tutWalkTablet' : 'tutWalkKeys' },
    { emoji: '📦', title: 'tutJobsTitle', text: 'tutJobs' },
    { emoji: '⛽', title: 'tutGasTitle', text: 'tutGas' },
  ];
  let i = 0;
  const emoji = h('div', { class: 'tut-emoji' });
  const title = h('h2', {});
  const text = h('p', {});
  const dots = h('div', { class: 'tut-dots' }, ...steps.map(() => h('i', {})));
  const next = h('button', { class: 'btn btn-primary btn-big tut-next' });
  const skip = h('button', { class: 'tut-skip' }, t('tutSkip'));
  const card = h('div', { class: 'tut-bubble' }, emoji, title, text, dots, next, skip);
  const root = h('div', { class: 'tutorial' }, card);

  const show = () => {
    const s = steps[i];
    emoji.textContent = s.emoji;
    title.textContent = t(s.title);
    text.textContent = t(s.text);
    next.textContent = i === steps.length - 1 ? `${t('tutGo')} 🎉` : `${t('tutNext')} ▶`;
    [...dots.children].forEach((d, k) => d.classList.toggle('on', k === i));
    card.classList.remove('pop');
    void card.offsetWidth; // restart the pop animation
    card.classList.add('pop');
  };
  const finish = () => { root.remove(); onDone(); };
  next.addEventListener('click', () => { if (++i >= steps.length) finish(); else show(); });
  skip.addEventListener('click', finish);
  show();
  return root;
}
