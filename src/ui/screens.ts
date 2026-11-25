export type ScreenName = 'login' | 'register' | 'menu' | 'game';
export type Navigate = (to: ScreenName) => void;
/** A screen renders into root and returns a cleanup function. */
export type Screen = (root: HTMLElement, nav: Navigate) => (() => void) | void;
