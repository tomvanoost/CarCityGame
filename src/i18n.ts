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
    yieldPeople: 'Stop! Daar loopt iemand.',
    refuel: 'Tanken',
    refueling: 'Tanken… (tik om te stoppen)',
    buyApartment: 'Koop appartement',
    apartmentBought: 'Appartement gekocht!',
    goInside: 'Naar binnen',
    deliverTo: 'Breng het pakket naar',
    driveTo: 'Breng je passagier naar',
    placeHouse: 'een huis',
    placeApartment: 'een flat',
    placePark: 'het park',
    placeCenter: 'het centrum',
    placeShops: 'de winkelstraat',
    placeGas: 'het tankstation',
    jobDone: 'Klus gedaan!',
    dailyBonus: 'Dagbonus!',
    pickedPackage: '📦 Pakket opgehaald! Volg de gele pijl.',
    pickedPassenger: '🚕 Passagier ingestapt! Volg de gele pijl.',
    needMoney: 'Je hebt nog wat geld nodig:',
    freeFuel: '⛽ De pomphouder geeft je gratis wat benzine!',
    fuelEmpty: '⛽ De tank is leeg! Rij langzaam naar het tankstation (volg de pijl).',
    yourHouse: 'Jouw huis',
    yourApartment: 'Jouw appartement',
    myClothes: 'Mijn kleding',
    startHere: 'Hier beginnen als ik ga spelen',
    continuePlaying: 'Verder spelen',
    getIn: 'Instappen',
    getOut: 'Uitstappen',
    tabletMode: 'Tabletbediening aan/uit',
    keysHint: 'W A S D of pijltjes: rijden en lopen · E: in- en uitstappen · Spatie: springen · Sleep: rondkijken',
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
    yieldPeople: 'Stop! Someone is walking there.',
    refuel: 'Fill up',
    refueling: 'Filling up… (tap to stop)',
    buyApartment: 'Buy apartment',
    apartmentBought: 'Apartment bought!',
    goInside: 'Go inside',
    deliverTo: 'Bring the package to',
    driveTo: 'Drive your passenger to',
    placeHouse: 'a house',
    placeApartment: 'an apartment block',
    placePark: 'the park',
    placeCenter: 'downtown',
    placeShops: 'the shopping street',
    placeGas: 'the gas station',
    jobDone: 'Job done!',
    dailyBonus: 'Daily bonus!',
    pickedPackage: '📦 Package picked up! Follow the yellow arrow.',
    pickedPassenger: '🚕 Passenger got in! Follow the yellow arrow.',
    needMoney: 'You still need some money:',
    freeFuel: '⛽ The attendant gives you some free fuel!',
    fuelEmpty: '⛽ The tank is empty! Drive slowly to the gas station (follow the arrow).',
    yourHouse: 'Your house',
    yourApartment: 'Your apartment',
    myClothes: 'My clothes',
    startHere: 'Start here when I play',
    continuePlaying: 'Keep playing',
    getIn: 'Get in',
    getOut: 'Get out',
    tabletMode: 'Tablet controls on/off',
    keysHint: 'W A S D or arrows: drive and walk · E: get in and out · Space: jump · Drag: look around',
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
