import './ui/styles.css';
import { onLangChange } from './i18n';
import { getBackend, setProfile } from './services/session';
import { startFpsMeter } from './ui/fps';
import { langToggle } from './ui/langToggle';
import { loginScreen } from './ui/loginScreen';
import { menuScreen } from './ui/menuScreen';
import { registerScreen } from './ui/registerScreen';
import type { Screen, ScreenName } from './ui/screens';

const screens: Record<ScreenName, Screen> = {
  login: loginScreen,
  register: registerScreen,
  menu: menuScreen,
};

const app = document.getElementById('app')!;
let current: ScreenName = 'login';
let cleanup: (() => void) | void;

function navigate(to: ScreenName) {
  cleanup?.();
  current = to;
  app.replaceChildren();
  const root = document.createElement('div');
  root.className = `screen screen-${to}`;
  app.append(root, langToggle());
  cleanup = screens[to](root, navigate);
}

async function boot() {
  startFpsMeter();
  app.innerHTML = '<div class="boot">🚗</div>';
  try {
    const profile = await (await getBackend()).restore();
    setProfile(profile);
    navigate(profile ? 'menu' : 'login');
  } catch (e) {
    console.error(e);
    navigate('login');
  }
  // Re-render the current screen when the language changes.
  onLangChange(() => navigate(current));
}

boot();
