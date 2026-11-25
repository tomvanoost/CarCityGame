export type Lang = 'nl' | 'en';

const dict = {
  nl: {
    username: 'Gebruikersnaam',
    password: 'Wachtwoord',
    confirmPassword: 'Herhaal wachtwoord',
    login: 'Inloggen',
    register: 'Account maken',
    noAccount: 'Nog geen account?',
    haveAccount: 'Heb je al een account?',
    boy: 'Jongen',
    girl: 'Meisje',
    chooseAvatar: 'Kies je speler',
    logout: 'Uitloggen',
    loading: 'Laden…',
    demoMode: 'Demo-modus: je voortgang wordt alleen in deze browser bewaard.',
    errUsername: 'Gebruikersnaam: 3–16 letters, cijfers of _',
    errPassword: 'Wachtwoord: minimaal 6 tekens',
    errMatch: 'De wachtwoorden zijn niet hetzelfde',
    errGender: 'Kies jongen of meisje',
    errWrong: 'Gebruikersnaam of wachtwoord klopt niet',
    errTaken: 'Deze gebruikersnaam bestaat al',
    errNetwork: 'Geen verbinding. Probeer het opnieuw.',
    errUnknown: 'Er ging iets mis. Probeer het opnieuw.',
    welcome: 'Hoi',
    vehicleShop: 'Autowinkel',
    clothesShop: 'Kledingwinkel',
    myVehicles: 'Mijn voertuigen',
    play: 'Spelen',
    comingSoon: 'Komt binnenkort',
    shopSoon: 'De winkels komen in stap 8!',
    dragToTurn: 'Sleep om te draaien',
    loadingCity: 'De stad wordt gebouwd…',
    tourHint: 'Sleep om te bewegen, knijp om te zoomen. Rijden komt in stap 5!',
    back: 'Terug',
  },
  en: {
    username: 'Username',
    password: 'Password',
    confirmPassword: 'Confirm password',
    login: 'Log in',
    register: 'Create account',
    noAccount: 'No account yet?',
    haveAccount: 'Already have an account?',
    boy: 'Boy',
    girl: 'Girl',
    chooseAvatar: 'Choose your player',
    logout: 'Log out',
    loading: 'Loading…',
    demoMode: 'Demo mode: your progress is only saved in this browser.',
    errUsername: 'Username: 3–16 letters, numbers or _',
    errPassword: 'Password: at least 6 characters',
    errMatch: 'The passwords do not match',
    errGender: 'Choose boy or girl',
    errWrong: 'Wrong username or password',
    errTaken: 'This username is already taken',
    errNetwork: 'No connection. Please try again.',
    errUnknown: 'Something went wrong. Please try again.',
    welcome: 'Hi',
    vehicleShop: 'Vehicle shop',
    clothesShop: 'Clothes shop',
    myVehicles: 'My vehicles',
    play: 'Play',
    comingSoon: 'Coming soon',
    shopSoon: 'The shops are coming in step 8!',
    dragToTurn: 'Drag to turn',
    loadingCity: 'Building the city…',
    tourHint: 'Drag to move, pinch to zoom. Driving is coming in step 5!',
    back: 'Back',
  },
} as const;

export type TKey = keyof (typeof dict)['nl'];

function loadLang(): Lang {
  try {
    const v = localStorage.getItem('carcity.lang');
    if (v === 'nl' || v === 'en') return v;
  } catch { /* storage blocked */ }
  return 'nl'; // Dutch by default
}

let lang: Lang = loadLang();
const listeners = new Set<() => void>();

export const t = (key: TKey): string => dict[lang][key];
export const getLang = () => lang;

export function setLang(l: Lang) {
  lang = l;
  document.documentElement.lang = l;
  try { localStorage.setItem('carcity.lang', l); } catch { /* ignore */ }
  listeners.forEach((fn) => fn());
}

export function onLangChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
