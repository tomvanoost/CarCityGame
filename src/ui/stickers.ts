import { getSticker, newlyEarned, STICKERS, type StickerId } from '../game/stickers';
import { sounds } from '../game/play/sounds';
import { COIN_COUNT } from '../game/play/coins';
import { FISH } from '../game/play/fishing';
import { t, type TKey } from '../i18n';
import { getProfile, onProfileChange, updateProfile } from '../services/session';
import { h } from './dom';

const name = (id: StickerId) => t(`st_${id}` as TKey);
const hint = (id: StickerId) => t(`st_${id}_hint` as TKey);

// ---------- celebration popup ----------
let pop: HTMLElement | null = null;
let queue: StickerId[] = [];
let showing = false;

function showNext() {
  const id = queue.shift();
  if (!id) { showing = false; return; }
  showing = true;
  pop ??= document.body.appendChild(h('div', { class: 'sticker-pop' }));
  pop.replaceChildren(
    h('div', { class: 'sticker-pop-emoji' }, getSticker(id)!.emoji),
    h('div', { class: 'sticker-pop-text' }, h('small', {}, `🎉 ${t('stickerNew')}`), h('b', {}, name(id))),
  );
  pop.classList.remove('show');
  void pop.offsetWidth; // restart the animation
  pop.classList.add('show');
  sounds.coin();
  setTimeout(() => { pop?.classList.remove('show'); setTimeout(showNext, 300); }, 2800);
}

function celebrate(ids: StickerId[]) {
  queue.push(...ids);
  if (!showing) showNext();
}

/** Gives a sticker (for event stickers like the first honk). Saved in the profile. */
export function awardSticker(id: StickerId) {
  const p = getProfile();
  if (!p || p.stickers.includes(id)) return;
  void updateProfile({ stickers: [...p.stickers, id] });
  celebrate([id]);
}

/**
 * Watches the profile and hands out stickers as soon as they are earned. Stickers that
 * were already earned when a profile loads (e.g. older players) are added quietly.
 */
export function watchStickers() {
  let lastUser = '';
  onProfileChange((p) => {
    const ids = newlyEarned(p);
    const fresh = p.username !== lastUser;
    lastUser = p.username;
    if (!ids.length) return;
    void updateProfile({ stickers: [...p.stickers, ...ids] });
    if (!fresh) celebrate(ids);
  });
}

// ---------- sticker book ----------
/** Big, simple overlay with all stickers: earned ones in color, the rest as a grey "?" with a hint. */
export function openStickerBook(onClose?: () => void) {
  const p = getProfile();
  if (!p) return;
  const close = () => { overlay.remove(); onClose?.(); };
  const have = STICKERS.filter((s) => p.stickers.includes(s.id)).length;
  const grid = h('div', { class: 'sticker-grid' }, ...STICKERS.map((s) => {
    const got = p.stickers.includes(s.id);
    return h('div', { class: `sticker ${got ? 'got' : 'locked'}` },
      h('div', { class: 'sticker-emoji' }, got ? s.emoji : '?'),
      h('b', {}, got ? name(s.id) : '???'),
      h('small', {}, hint(s.id)),
    );
  }));
  const overlay = h('div', { class: 'sticker-book' },
    h('div', { class: 'card sticker-card' },
      h('div', { class: 'place-head' },
        h('h2', {}, `⭐ ${t('stickerBook')} ${have}/${STICKERS.length}`),
        h('button', { class: 'icon-btn close-btn', 'aria-label': t('back'), onclick: close }, '✕'),
      ),
      h('div', { class: 'coin-count' }, `🪙 ${t('coinHunt')}: ${p.coins.length}/${COIN_COUNT}`),
      h('div', { class: 'fish-album' }, h('b', {}, `🎣 ${t('fishAlbum')}`), ...FISH.map((f) => {
        const n = p.fish?.[f.id] ?? 0;
        return h('span', { class: `fish-chip ${n ? '' : 'locked'}`, title: n ? t(`fish_${f.id}` as TKey) : '?' }, n ? `${f.emoji} ${n}` : '❔');
      })),
      grid,
    ),
  );
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  document.body.append(overlay);
}
