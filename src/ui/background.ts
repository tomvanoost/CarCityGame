import { h } from './dom';

/** Soft sky + city skyline backdrop used by the login/register screens. */
export function skyBackground(): HTMLElement {
  const skyline = `
  <svg class="skyline" viewBox="0 0 1200 220" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
    <path fill="#8fc6ff" d="M0 220V120h60V80h50v40h40V60h70v60h30V90h60v30h50V40h80v80h40V100h60v20h40V70h70v50h50V90h60v30h40V50h80v70h50V100h60v120z"/>
    <path fill="#5aa7f5" d="M0 220V160h90v-40h60v40h70v-60h50v60h80v-30h60v30h90v-50h70v50h60v-30h80v30h70v-70h60v70h100v-40h60v40h70v60z"/>
    <rect y="200" width="1200" height="20" fill="#3f8ee0"/>
  </svg>`;
  const bg = h('div', { class: 'sky-bg' });
  bg.innerHTML = `<div class="cloud c1"></div><div class="cloud c2"></div><div class="cloud c3"></div>${skyline}`;
  return bg;
}
