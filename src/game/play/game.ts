import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { createRenderer, fitToCanvas } from '../../engine/renderer';
import { getProfile, setProfile, updateProfile } from '../../services/session';
import type { PlayerProfile } from '../../services/types';
import { Avatar } from '../avatar/avatar';
import { buildCity, type City } from '../city/cityBuilder';
import { HALF_CITY, LINES } from '../city/layout';
import { getVehicle } from '../vehicles/catalog';
import { SEATED_SCALE, seatedRootPosition } from '../vehicles/carBuilder';
import { createSky, skyEnvironment, SKY, SKY_TIME, Sun } from '../world/sky';
import { Weather } from '../world/weather';
import { Wipers } from '../vehicles/wipers';
import { IceTruck } from './iceTruck';
import { pickQuality, ResolutionScaler } from '../world/quality';
import { CollisionWorld } from './collision';
import { FollowCamera } from './followCamera';
import type { Input } from './input';
import { Jobs, type ActiveJob, type PlaceKey } from './jobs';
import { createArrow, createIcon } from './markers';
import { Navigator } from './navigation';
import { Pedestrians } from './pedestrians';
import { BIRD_KINDS, Wildlife, type BirdKind } from './wildlife';
import { CarWash, WASH_PRICE, WASH_TIME } from './carWash';
import { Pet, PetShopBuilding, getPet } from './pets';
import { FURNITURE } from '../furniture';
import { EXTRA_PRICE, NEON_PRICE, PAINT_PRICE, PaintShopBuilding, SPOILER_PRICE } from './paintShop';
import { PizzeriaBuilding } from './pizzeria';
import { BusShelters } from './busStops';
import { BRUSH_PRICE, FEED_PRICE, PettingFarm, type FarmAnimalKind } from './pettingFarm';
import { BAKERY, BAKERY_TIME, BakeryBuilding, bakeryGeometry, type BakeryId } from './bakery';
import { FunFair, RIDE_PRICE, type RideKind as FairRide } from './funFair';
import { BALLOON_FRONT, BALLOON_PRICE, Balloon } from './balloon';
import { BOAT_FRONT, BOAT_PRICE, Boat } from './boat';
import { SkatePark } from './skatePark';
import { KITE_FRONT, KITE_PRICE, Kite, onBeach } from './kite';
import { CROPS, Garden, HARVEST, cropOf, growth, type CropId } from './garden';
import { SANDBOARD_END, SANDBOARD_FRONT, SANDBOARD_PRICE, SANDBOARD_TOP, Sandboard } from './sandboard';
import { FIREWORKS_FRONT, FIREWORKS_PRICE, FIREWORKS_STAND, Fireworks } from './fireworks';
import { Beach, FLOAT_FRONT, FLOAT_PRICE, floatGeometry } from './beach';
type RideKind = FairRide | 'balloon' | 'sandboard' | 'boat' | 'skate';
import { COIN_COUNT, COIN_REWARD, Coins } from './coins';
import { turnLinesMesh } from './turnLines';
import { LibraryBuilding, QUIZ_REWARD, today } from './library';
import { TREASURE_PRIZE, TREASURE_RADIUS, TreasureChest, postOfficeMesh, treasureSpot, weekNumber } from './treasure';
import { HORNS, isHorn, type HornId } from '../horns';
import { MAX_DENTS, REPAIR_PRICE, addDentMesh, clearDents, dentCount, findDent } from '../vehicles/dents';
import { CHECKPOINTS, MEDAL_PRIZE, RaceTrack, medalFor, type Medal } from './raceTrack';
import { BALLOON, BIG_DUNE, PETTING, RACE } from '../city/outskirts';
import { BITE_TIME, FISH, FISH_SPOT, FLOAT, FishingJetty, randomFish, rodGeometry } from './fishing';
import { missionDay, todaysMissions, type Mission, type MissionId } from '../missions';
import { applyNeon, applyRims, applySpoiler, applyStripe } from '../vehicles/carStyle';
import { SNACKS, SNACK_TIME, SupermarketBuilding, chocolateGeometry, type SnackId } from './supermarket';
import { FLAVORS, ICE_CREAM_PRICE, ICE_CREAM_TIME, IceCreamStand, coneGeometry, type Flavor } from './iceCream';
import { Garage, type GarageSpot } from './garage';
import { DAY, headlightRig, lightAt, loadEvening, saveEvening, SirenLights, StreetLamps, TurnSignals } from '../world/evening';
import { SKETCHFAB_VEHICLES } from '../vehicles/sketchfabManifest';
import type { MpSession } from '../../services/multiplayer';
import { RemotePlayers } from './remotePlayers';
import type { VehicleSpec } from '../vehicles/types';
import { awardSticker } from '../../ui/stickers';
import { RoadGraph, type P } from './roads';
import { loadTrafficOn, Traffic } from './traffic';
import { TrafficLights } from './trafficLights';
import { HighwaySigns } from './highwaySigns';
import { Player } from './player';
import { Vehicle } from './vehicle';
import { cleanText } from '../../services/textFilter';
import { GrassField } from './grassField';
import { sounds } from './sounds';

export type Mode = 'driving' | 'walking';

/** Something you can do right here with the big blue button. */
export type ContextAction = { kind: 'buyFloat'; price: number } | { kind: 'fireworks'; price: number } | { kind: 'feed'; animal: FarmAnimalKind; price: number; brush: number } | { kind: 'bakery' } | { kind: 'paintShop' } | { kind: 'petShop' } | { kind: 'supermarket' } | { kind: 'iceCream'; price: number } | { kind: 'refuel' } | { kind: 'wash'; price: number } | { kind: 'takeCar'; id: string } | { kind: 'home' } | { kind: 'apartment' } | { kind: 'buyApartment'; price: number } | { kind: 'ride'; ride: RideKind; price: number } | { kind: 'rideStop' } | { kind: 'raceStart' } | { kind: 'raceStop' } | { kind: 'fish' } | { kind: 'fishReel'; bite: boolean } | { kind: 'treasureMap' } | { kind: 'openTreasure' } | { kind: 'library' } | { kind: 'buyKite'; price: number } | { kind: 'iceTruck' } | { kind: 'garden' } | { kind: 'gardenWait'; secs: number; crop: CropId } | { kind: 'harvest'; crop: CropId } | { kind: 'binoculars'; looking: boolean };

const MAX_SPEED_KEY = 'carcity.maxSpeed';
function loadMaxSpeed(): number | null {
  try { const v = Number(localStorage.getItem(MAX_SPEED_KEY)); return v > 0 ? v : null; } catch { return null; }
}

/** Lamp colors per emergency vehicle: police red + blue, fire truck red, ambulance blue. */
const SIREN_COLORS: Record<NonNullable<VehicleSpec['siren']>, [string, string]> = {
  police: ['#ff2a2a', '#2a6bff'], fire: ['#ff2a2a', '#ff5a1a'], ambulance: ['#2a6bff', '#3aa0ff'],
};

/** Where the light bar goes: the top of the roof (found with a ray), over the cab for trucks and vans. */
function lightBarSpot(v: Vehicle): [number, number] {
  const sf = SKETCHFAB_VEHICLES[v.spec.id];
  const height = sf?.height ?? 1.4;
  const z = v.spec.siren === 'fire' ? v.length / 2 - 0.9 : v.spec.siren === 'ambulance' ? v.length / 2 - 2.3 : -0.15;
  v.car.root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(v.car.root.matrixWorld).invert();
  const from = new THREE.Vector3(0, height + 2, z).applyMatrix4(v.car.root.matrixWorld);
  const hit = new THREE.Raycaster(from, new THREE.Vector3(0, -1, 0)).intersectObject(v.car.root, true)[0];
  return [hit ? hit.point.applyMatrix4(inv).y : height, z];
}

export interface GameState {
  mode: Mode;
  canEnter: boolean;
  kmh: number;
  yielding: boolean;
  fuel: number;
  refueling: boolean;
  /** The car is in the car wash right now. */
  washing: boolean;
  context: ContextAction | null;
  /** Desert race: countdown (> 0 before the start), lap time, next gate (1..6, 0 = finish). */
  race: { countdown: number; time: number; gate: number; total: number } | null;
  /** Game clock "HH:MM". */
  clock: string;
  job: { kind: ActiveJob['kind']; place: PlaceKey; reward: number; meters: number; timeLeft?: number; stop?: number; stops?: number } | null;
  /** Navigation to a destination you picked on the map. */
  dest: { meters: number } | null;
  /** The car's real top speed and the player's own max speed (🏁), km/h; null = no limit. */
  topSpeed: number;
  maxSpeed: number | null;
  /** Multiplayer: server name and how many other players are there (null when playing alone). */
  mp: { room: string; others: number } | null;
  /** Dashboard view is on (the HUD shows the mirror frame). */
  cockpit: boolean;
  /** Turn signal that is blinking right now. */
  blinker: 'left' | 'right' | 'both' | null;
  /** Driving an emergency vehicle (shows the 🚨 button), and whether its siren is on. */
  police: boolean;
  siren: boolean;
  /** Looking through the binoculars at a bird (the HUD shows the round view and its name). */
  binoc: { kind: BirdKind; fresh: boolean; seen: number } | null;
}

/** Everything the minimap / big map needs to draw. */
export interface MapState {
  x: number;
  z: number;
  heading: number;
  path: P[];
  job: P | null;
  dest: P | null;
  /** Other players in the multiplayer server (empty when playing alone). */
  players: { id: string; name: string; x: number; z: number }[];
  /** The player we're navigating to, if any. */
  following: string | null;
  /** Treasure map: the blurry spot where this week's chest is (null = no map, or already found). */
  treasure: { x: number; z: number; r: number } | null;
}

export interface GameEvents {
  onProgress(p: number): void;
  onReady(): void;
  onState(state: GameState): void;
  /** Money earned (shown as a big "+€" popup). */
  onMoney(amount: number, reason: 'job' | 'daily' | 'apartment' | 'fuel' | 'wash' | 'iceCream' | 'supermarket' | 'petShop' | 'paintShop' | 'furniture' | 'funFair' | 'mission' | 'coin' | 'race' | 'fish' | 'bakery' | 'farm' | 'balloon' | 'fireworks' | 'beach' | 'treasure' | 'sandboard' | 'quiz' | 'boat' | 'garden'): void;
  /** A daily mission is finished (its reward was paid). */
  onMission?(m: Mission): void;
  /** Coin hunt: a coin was found (found = how many you have now). */
  onCoin?(found: number, total: number): void;
  /** Desert race finished. */
  /** Fishing: caught something (`isNew` = first of its kind). */
  onFish?(fish: (typeof FISH)[number], isNew: boolean): void;
  onRaceDone?(r: { medal: Medal; time: number; best: number; record: boolean; prize: number }): void;
  onJobStart(job: ActiveJob): void;
  onJobDone?(job: ActiveJob): void;
  /** Bus route: people got on at stop `stop` of `stops`. */
  onBusStop?(stop: number, stops: number): void;
  /** Petting farm: you fed an animal. */
  onFed?(animal: FarmAnimalKind): void;
  /** Player walked into the house/apartment. */
  onPlace(place: 'home' | 'apartment' | 'iceCream' | 'supermarket' | 'petShop' | 'paintShop' | 'bakery' | 'library' | 'garden'): void;
  /** Short message (i18n key + optional number). */
  onMessage(key: 'needMoney' | 'freeFuel' | 'fuelEmpty' | 'arrived' | 'washed' | 'fishWait' | 'fishGone' | 'dented' | 'fireworksEvening' | 'floatBought' | 'kiteBought' | 'harvested' | 'gardenGrowing' | 'treasureMapGot' | 'treasureHave' | 'treasureNextWeek', n?: number): void;
  /** Multiplayer: someone joined / left the server, or we reached the player we navigated to. */
  onPlayer?(kind: 'joined' | 'left' | 'found', name: string): void;
  /** Photo mode: the interact key / controller A was pressed (take the picture). */
  onPhotoKey?(): void;
}

const ENTER_DISTANCE = 4;
export const APARTMENT_PRICE = 5000;
const DAILY_BONUS = 500;
/** Money per 100 m driven. */
const KM_REWARD = 2;
/** A full tank lasts this many meters. */
const TANK_METERS = 14000;
/** Price of a full tank. */
const TANK_PRICE = 60;

/** The playable game: city + car + avatar + people + jobs, driven by Input. */
export class Game {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(55, 1, 0.5, 6000);
  private follow = new FollowCamera(this.camera);
  private sun: Sun;
  private scaler: ResolutionScaler;
  city?: City;
  private world?: CollisionWorld;
  vehicle?: Vehicle;
  people?: Pedestrians;
  wildlife?: Wildlife;
  carWash?: CarWash;
  private iceStand?: IceCreamStand;
  private postOffice?: THREE.Mesh;
  private weather?: Weather;
  private wipers?: Wipers;
  private iceTruck?: IceTruck;
  private jingleTimer = 0;
  private fogBase = { near: 0, far: 0 };
  private library?: LibraryBuilding;
  private sandboard?: Sandboard;
  private boat?: Boat;
  private skate?: SkatePark;
  private skateRolling = false;
  private kite?: Kite;
  private garden?: Garden;
  private kiteAwarded = false;
  private sandboardAnim: 'walk' | 'slide' | null = null;
  private turnLines?: THREE.Mesh;
  private chest?: TreasureChest;
  private week = weekNumber();
  private supermarket?: SupermarketBuilding;
  private petShop?: PetShopBuilding;
  private paintShop?: PaintShopBuilding;
  private pizzeria?: PizzeriaBuilding;
  private busShelters?: BusShelters;
  private farm?: PettingFarm;
  private bakery?: BakeryBuilding;
  private funFair?: FunFair;
  private balloon?: Balloon;
  private fireworks?: Fireworks;
  private beach?: Beach;
  /** The duck float around your waist (shown while swimming, if you have one). */
  private floatMesh?: THREE.Mesh;
  private wasSwimming = false;
  private coins?: Coins;
  private raceTrack?: RaceTrack;
  private jetty?: FishingJetty;
  /** Fishing at the end of the jetty: waiting for a bite, or the float is under (tap now!). */
  private fishing: { phase: 'wait' | 'bite'; t: number } | null = null;
  /** The race you're driving: countdown first, then the lap time; `next` = the gate to drive through (0 = finish). */
  private race: { count: number; t: number; next: number; passed: number } | null = null;
  /** Riding the Ferris wheel or the carousel (as a passenger: no walking). */
  private ride: { kind: RideKind; t: number; dur: number; exit: { x: number; z: number }; from: { x: number; z: number } } | null = null;
  /** Your pet that comes along (follows you on foot, sits next to you in the car). */
  private pet?: Pet;
  /** Seconds left holding an ice cream (0 = none). */
  private iceCreamTimer = 0;
  /** Binoculars at the park pond: the bird you're looking at, for how long, and where you stood. */
  private binoc: { kind: BirdKind; index: number; t: number; fresh: boolean; x: number; z: number } | null = null;
  private binocLook = new THREE.Vector3();
  private binocAim = new THREE.Vector3();
  private binocSave = { pos: new THREE.Vector3(), quat: new THREE.Quaternion(), fov: 0 };
  garage?: Garage;
  lamps?: StreetLamps;
  /** Soft evening light on (street lamps and headlights glow). */
  evening = loadEvening();
  /** Game clock (minutes after midnight): one game minute per real second, so a day takes 24 minutes. */
  clock = (loadEvening() ? 20 : 10) * 60;
  private lightTimer = 0;
  private bakedLook = '';
  private sunDirShown = new THREE.Vector3();
  jobs?: Jobs;
  traffic?: Traffic;
  private trafficLights?: TrafficLights;
  private highwaySigns?: HighwaySigns;
  /** Places outside the city that aren't drawn when you're far away (saves draw calls): center, size. */
  private farCull: { obj: THREE.Object3D; x: number; z: number; r: number; keep?: () => boolean; far?: number }[] = [];
  private cullTimer = 0;
  roads?: RoadGraph;
  private nav?: Navigator;
  /** Destination picked on the big map. */
  private dest: P | null = null;
  private trafficCount = 8;
  /** Nearby traffic cars that may use the detailed model. */
  private trafficDetail = 2;
  /** Grass blades around the player (m); 0 = off (Snel). */
  private grassRadius = 26;
  private grass?: GrassField;
  player?: Player;
  avatar?: Avatar;
  mode: Mode = 'driving';
  private arrow = createArrow();
  private raf = 0;
  private last = performance.now();
  private disposed = false;
  private lastState = '';
  private focus = new THREE.Vector3();
  private shake = 0;
  private peopleCount = 24;
  private yieldTimer = 0;
  private meters = 0;
  /** Meters driven / walked that still have to count for the daily missions. */
  private missionDrive = 0;
  private missionWalk = 0;
  private dirty = false;
  private lastSave = 0;
  private refueling = false;
  /** Seconds left of the current car wash (0 = not washing). */
  private washTimer = 0;
  /** Seconds left of the extra shine after a wash. */
  private shineTimer = 0;
  private paused = false;
  private fuelWarned = false;
  private fuelBill = 0;
  private pendingCar = false;
  private pendingContext = false;
  private pendingBrush = false;
  private honking = false;
  /** Police car: flashing lights on its roof, and whether the siren is on. */
  private sirenLights?: SirenLights;
  private sirenOn = false;
  /** Turn signals (1 / 2, d-pad left / right); they switch off by themselves after the turn. */
  private signals?: TurnSignals;
  private blinkTurned = 0;
  /** Dashboard view: the camera sits in the driver's seat (F2 / View button / 🎥). */
  private cockpit = false;
  /** 📷 Photo mode: the car / you stand still and the camera turns freely around (distance in meters). */
  private photo = false;
  private photoDist = 7;
  private cockpitYaw = 0;
  private cockpitPitch = 0;
  /** The rear-view mirror in the dashboard view: a small second view, looking back from the car's rear. */
  private mirrorCam = new THREE.PerspectiveCamera(48, 3.3, 0.3, 300);
  /** Multiplayer server we're on (if any), and the other players there. */
  private mp: MpSession | null = null;
  private remote?: RemotePlayers;
  private offPlayers?: () => void;
  /** The player's max speed (km/h, 🏁 next to the home button), saved on this device; null = the car's top speed. */
  private maxKmh: number | null = loadMaxSpeed();

  constructor(canvas: HTMLCanvasElement, private input: Input, profile: PlayerProfile, private events: GameEvents) {
    const q = pickQuality();
    this.peopleCount = q.people;
    this.trafficCount = q.traffic;
    this.trafficDetail = q.name === 'fast' ? 0 : q.name === 'low' ? 1 : 2;
    this.grassRadius = q.name === 'fast' ? 0 : q.name === 'low' ? 16 : 26;
    this.renderer = createRenderer(canvas, { shadows: q.shadowMap > 0, antialias: q.antialias });
    this.scaler = new ResolutionScaler(this.renderer, q.maxPixelRatio, q.minPixelRatio);
    this.scene.fog = new THREE.Fog(SKY.horizon, q.fogNear, q.fogFar);
    this.fogBase = { near: q.fogNear, far: q.fogFar };
    // Rain showers and rainbows (only on the higher quality settings).
    this.weather = new Weather(q.name === 'max' || q.name === 'high');
    this.weather.onRainbow = () => awardSticker('rainbow');
    this.scene.add(this.weather.group);
    this.scene.environment = skyEnvironment(this.renderer);
    this.scene.environmentIntensity = 0.7;
    this.scene.add(createSky());
    this.sun = new Sun(this.renderer, q.shadowSize, q.shadowMap);
    this.sun.addTo(this.scene);
    this.arrow.visible = false;
    this.scene.add(this.arrow);
    this.load(q, profile);
    this.loop();
    document.addEventListener('visibilitychange', this.onHide);
    window.addEventListener('pagehide', this.onHide);
  }

  /** Save right away when the tab is hidden or closed. */
  private onHide = () => { this.save(true); sounds.setHidden(document.hidden); };

  private get profile() { return getProfile()!; }

  private async load(q: ReturnType<typeof pickQuality>, profile: PlayerProfile) {
    const [city, avatar] = await Promise.all([
      buildCity(q, (p) => this.events.onProgress(p * 0.95)),
      Avatar.create(profile.gender, profile.equipped.outfit),
    ]);
    if (this.disposed) { city.dispose(); avatar.dispose(); return; }
    this.city = city;
    this.avatar = avatar;
    this.scene.add(city.group);
    this.world = new CollisionWorld(city.layout.colliders);
    this.player = new Player(avatar);
    this.player.hasFloat = this.profile.swimFloat;
    avatar.root.traverse((o) => { o.castShadow = !o.userData.glass; });

    const spawn = this.spawnPoint(profile.spawn);
    await this.setVehicle(profile.selectedVehicle, spawn);
    if (this.disposed) return;
    // Your other cars wait in the front yard at home.
    this.garage = new Garage(city.layout, this.world);
    this.scene.add(this.garage.group);
    void this.refreshGarage();
    this.seatAvatar();
    this.follow.yaw = spawn.rot + Math.PI;
    this.focus.set(spawn.x, 1.2, spawn.z);
    this.follow.update(0, this.focus, { behindYaw: this.follow.yaw, distance: 8, pitch: 0.28, snap: true });
    this.sun.follow(this.focus, true);

    // Map pins for important places: always visible, so kids can find them.
    const pois = city.layout.pois;
    const pin = (emoji: string, ring: string, x: number, z: number, y: number) => {
      const s = createIcon(emoji, ring, 0.045);
      s.position.set(x, y, z);
      this.scene.add(s);
    };
    pin('🏠', '#ff8a2b', pois.home.x, pois.home.z, 16);
    pin('🏢', '#8e5bd9', pois.apartment.x, pois.apartment.z, 34);
    pin('⛽', '#e5484d', pois.gasStation.x, pois.gasStation.z, 12);

    this.events.onProgress(1);
    this.events.onReady();
    this.dailyBonus();

    // People and jobs load in the background after the city is visible.
    this.people = new Pedestrians(city.layout, this.world, this.peopleCount);
    this.scene.add(this.people.group);
    this.people.load();
    this.wildlife = new Wildlife(city.layout);
    this.scene.add(this.wildlife.group);
    if (this.grassRadius > 0) {
      this.grass = new GrassField(city.layout, (x, z) => this.world!.pointBlocked(x, z), this.grassRadius);
      this.scene.add(this.grass.mesh, this.grass.flowers);
    }
    this.carWash = new CarWash(city.layout);
    this.scene.add(this.carWash.group);
    this.iceStand = new IceCreamStand(city.layout);
    this.scene.add(this.iceStand.group);
    this.postOffice = postOfficeMesh(city.layout);
    this.chest = new TreasureChest(treasureSpot(city.layout, this.week));
    this.scene.add(this.postOffice, this.chest.group);
    this.supermarket = new SupermarketBuilding(city.layout);
    this.scene.add(this.supermarket.group);
    this.petShop = new PetShopBuilding(city.layout);
    this.scene.add(this.petShop.group);
    this.paintShop = new PaintShopBuilding(city.layout);
    this.scene.add(this.paintShop.group);
    this.pizzeria = new PizzeriaBuilding(city.layout);
    this.scene.add(this.pizzeria.group);
    this.busShelters = new BusShelters(city.layout);
    this.scene.add(this.busShelters.group);
    this.farm = new PettingFarm();
    this.scene.add(this.farm.group);
    this.bakery = new BakeryBuilding(city.layout);
    this.scene.add(this.bakery.group);
    this.library = new LibraryBuilding(city.layout);
    this.scene.add(this.library.group);
    this.funFair = new FunFair(city.layout);
    this.scene.add(this.funFair.group);
    this.sandboard = new Sandboard();
    this.scene.add(this.sandboard.group);
    this.boat = new Boat();
    this.scene.add(this.boat.group);
    this.skate = new SkatePark(city.layout);
    this.scene.add(this.skate.group);
    this.kite = new Kite();
    this.scene.add(this.kite.group);
    this.garden = new Garden(city.layout);
    this.scene.add(this.garden.group);
    this.balloon = new Balloon();
    this.scene.add(this.balloon.group);
    this.fireworks = new Fireworks((k) => sounds.firework(k));
    this.scene.add(this.fireworks.group);
    this.beach = new Beach();
    this.scene.add(this.beach.group);
    this.coins = new Coins(city.layout, this.profile.coins, (c) => {
      const coins = [...new Set([...this.profile.coins, c.id])];
      setProfile({ ...this.profile, coins });
      void updateProfile({ coins });
      this.addMoney(COIN_REWARD, 'coin');
      this.events.onCoin?.(coins.length, COIN_COUNT);
    });
    this.scene.add(this.coins.group);
    this.raceTrack = new RaceTrack();
    this.scene.add(this.raceTrack.group);
    this.jetty = new FishingJetty();
    this.scene.add(this.jetty.group);
    this.setPet(this.profile.activePet);
    this.lamps = new StreetLamps(city.layout);
    this.scene.add(this.lamps.group);
    this.applyLight(true);
    this.jobs = new Jobs(city.layout, {
      onStart: (job) => this.events.onJobStart(job),
      onBusStop: (stop, stops, pay) => { this.addMoney(pay, 'job'); this.events.onBusStop?.(stop, stops); },
      onDone: (job) => {
        this.addMoney(job.reward, 'job');
        const p = this.profile;
        void updateProfile(job.kind === 'taxi' || job.kind === 'bus' ? { taxiRides: p.taxiRides + 1 } : { deliveries: p.deliveries + 1 });
        if (job.kind === 'bus') awardSticker('bus');
        if (job.kind === 'pizza') awardSticker('pizza');
        this.mission('jobs');
        if (job.kind === 'pizza' && job.hot) this.mission('pizza');
        this.events.onJobDone?.(job);
      },
    });
    this.scene.add(this.jobs.group);
    // Roads, navigation and friendly traffic.
    this.roads = new RoadGraph(city.layout);
    this.nav = new Navigator(this.roads);
    this.scene.add(this.nav.arrows);
    this.traffic = new Traffic(this.roads, loadTrafficOn() ? this.trafficCount : 0, this.trafficDetail);
    // Dutch traffic lights at the crossings, and the highway signs on the loop roads.
    this.trafficLights = new TrafficLights(this.roads);
    this.scene.add(this.trafficLights.group);
    this.traffic.setTrafficLights(this.trafficLights);
    this.highwaySigns = new HighwaySigns(this.roads);
    this.scene.add(this.highwaySigns.group);
    // The ice cream truck that drives round the park.
    this.iceTruck = new IceTruck(this.roads);
    this.scene.add(this.iceTruck.root);
    this.setupFarCull();
    // Dashed turning lines across the crossings: where to start steering, and how much.
    this.turnLines = turnLinesMesh(this.roads);
    this.scene.add(this.turnLines);
    this.scene.add(this.traffic.group);
    this.traffic.setLights(this.evening);
    void this.warmShaders();
  }

  /**
   * Compile the shaders of everything in the world in the background (also the far places that are
   * hidden now), so nothing stutters the first time it comes into view.
   */
  private async warmShaders() {
    const hidden = this.farCull.filter((c) => !c.obj.visible);
    hidden.forEach((c) => { c.obj.visible = true; });
    try { await this.renderer.compileAsync(this.scene, this.camera); } catch { /* older browsers: compiled on first sight */ }
    this.cullTimer = 0; // hide the far places again on the next frame
  }

  /** Pick a destination (from the big map), or null to stop navigating. */
  setDestination(p: P | null) { this.dest = p; this.followId = null; }

  /** Navigate to another player in the server (the route follows them). Returns their name. */
  navigateToPlayer(id: string): string | null {
    const p = this.remote?.positions().find((q) => q.id === id);
    if (!p) return null;
    this.dest = { x: p.x, z: p.z };
    this.followId = id;
    this.followTimer = 0;
    return p.name;
  }
  private followId: string | null = null;
  /** Multiplayer: everyone we've seen, and since when they're missing (0 = here). */
  private knownPlayers = new Map<string, { name: string; goneAt: number }>();
  private followTimer = 0;

  /**
   * Things far from you aren't drawn: each place outside the city (and each highway sign) gets a
   * center and a size, and is hidden when you're more than ~450 m beyond it. Rides that move the
   * place (boat, balloon, sandboard) and things in use (race, fireworks, your kite) always stay.
   */
  private setupFarCull() {
    if (!this.city) return;
    const L = this.city.layout, add = (obj: THREE.Object3D | undefined, x: number, z: number, r: number, keep?: () => boolean, far?: number) => { if (obj) this.farCull.push({ obj, x, z, r, keep, far }); };
    add(this.farm?.group, PETTING.x, PETTING.z, 40);
    add(this.sandboard?.group, BIG_DUNE.x, BIG_DUNE.z, 110, () => this.ride?.kind === 'sandboard');
    add(this.boat?.group, -200, 1030, 260, () => this.ride?.kind === 'boat');
    add(this.balloon?.group, BALLOON.x, BALLOON.z, 40, () => this.ride?.kind === 'balloon');
    add(this.raceTrack?.group, RACE.x, RACE.z, 300, () => !!this.race);
    add(this.fireworks?.group, FIREWORKS_STAND.x, FIREWORKS_STAND.z, 70, () => !!this.fireworks?.active);
    add(this.beach?.group, FLOAT_FRONT.x, FLOAT_FRONT.z, 160);
    add(this.kite?.group, FLOAT_FRONT.x, FLOAT_FRONT.z, 40, () => this.profile.kite && this.mode === 'walking');
    add(this.library?.group, L.pois.library.x, L.pois.library.z, 15);
    add(this.bakery?.group, L.pois.bakery.x, L.pois.bakery.z, 15);
    add(this.garden?.group, L.pois.home.garden.x, L.pois.home.garden.z, 8);
    for (const sign of this.highwaySigns?.group.children ?? []) add(sign, sign.position.x, sign.position.z, 5);
    // In the city, buildings hide things sooner: the fun fair only within ~300 m (unless you're on a ride).
    const fw = L.pois.funFair.wheel;
    add(this.funFair?.group, fw.x, fw.z + 20, 30, () => this.ride?.kind === 'wheel' || this.ride?.kind === 'carousel', 300);
  }

  private updateFarCull(dt: number) {
    this.cullTimer -= dt;
    if (this.cullTimer > 0) return;
    this.cullTimer = 0.5;
    for (const c of this.farCull) c.obj.visible = (c.keep?.() ?? false) || Math.hypot(this.focus.x - c.x, this.focus.z - c.z) < c.r + (c.far ?? 450);
  }

  /** You have this week's treasure map and haven't found the chest yet. */
  private hasTreasureMap() { return this.profile.treasureMap === this.week && this.profile.treasureFound !== this.week; }

  mapState(): MapState | null {
    if (!this.vehicle || !this.player) return null;
    const driving = this.mode === 'driving';
    const job = this.jobs?.active;
    return {
      x: driving ? this.vehicle.x : this.player.x,
      z: driving ? this.vehicle.z : this.player.z,
      heading: driving ? this.vehicle.heading : this.player.heading,
      path: this.nav?.remainingPath() ?? [],
      job: job ? { x: job.x, z: job.z } : null,
      dest: this.dest,
      players: this.remote?.positions() ?? [],
      following: this.followId,
      treasure: this.hasTreasureMap() && this.chest ? { x: this.chest.spot.cx, z: this.chest.spot.cz, r: TREASURE_RADIUS } : null,
    };
  }

  /** Bump softly into traffic cars (no damage, they always stop for you anyway). */
  private bumpTraffic() {
    if (!this.traffic) return;
    const circles = this.traffic.circles();
    if (!circles.length) return;
    if (this.mode === 'driving') {
      const v = this.vehicle!, fx = Math.sin(v.heading), fz = Math.cos(v.heading), o = v.length / 2 - v.width / 2;
      for (const k of [o, 0, -o]) {
        const cx = v.x + fx * k, cz = v.z + fz * k;
        for (const c of circles) {
          const dx = cx - c.x, dz = cz - c.z, d = Math.hypot(dx, dz), min = c.r + v.width / 2;
          if (d < min && d > 1e-4) {
            v.x += (dx / d) * (min - d);
            v.z += (dz / d) * (min - d);
            if (Math.abs(v.speed) > 4 && this.crashTimer === 0) this.carCrash(c.car, Math.abs(v.speed));
            v.speed *= 0.5;
            if (Math.abs(v.speed) > 2) v.bumped = 0.3;
          }
        }
      }
    } else {
      const p = this.player!;
      for (const c of circles) {
        const dx = p.x - c.x, dz = p.z - c.z, d = Math.hypot(dx, dz), min = c.r + 0.4;
        if (d < min && d > 1e-4) { p.x += (dx / d) * (min - d); p.z += (dz / d) * (min - d); }
      }
    }
  }

  /** No new crash (sound + dents) for a moment after one, so one bump is one crash. */
  private crashTimer = 0;

  /** You drove into a traffic car: a crunch, and a dent in both cars (yours stays until the garage repairs it). */
  private carCrash(other: THREE.Object3D, speed: number) {
    const v = this.vehicle!, id = v.spec.id;
    this.crashTimer = 1.5;
    sounds.carCrash(Math.min(1, speed / 18));
    this.shake = 0.35;
    if (dentCount(other) < 3) {
      const od = findDent(other, v);
      if (od) addDentMesh(other, od);
    }
    if (v.isBike) return;
    const mine = this.profile.vehicleDents[id] ?? [];
    if (mine.length >= MAX_DENTS) return;
    const pos = other.getWorldPosition(new THREE.Vector3());
    const d = findDent(v.car.root, pos);
    if (!d) return;
    addDentMesh(v.car.root, d);
    const vehicleDents = { ...this.profile.vehicleDents, [id]: [...mine, d] };
    setProfile({ ...this.profile, vehicleDents });
    void updateProfile({ vehicleDents });
    if (!mine.length) this.events.onMessage('dented', REPAIR_PRICE);
  }

  /** Garage: take all the dents out of the car you're in. False if there isn't enough money. */
  repairCar(): boolean {
    const v = this.vehicle, p = this.profile;
    if (!v || !(p.vehicleDents[v.spec.id]?.length)) return false;
    if (p.money < REPAIR_PRICE) { this.events.onMessage('needMoney', REPAIR_PRICE - p.money); return false; }
    clearDents(v.car.root);
    const vehicleDents = { ...p.vehicleDents, [v.spec.id]: [] };
    setProfile({ ...p, money: p.money - REPAIR_PRICE, vehicleDents });
    void updateProfile({ money: p.money - REPAIR_PRICE, vehicleDents });
    this.events.onMoney(-REPAIR_PRICE, 'paintShop');
    sounds.coin();
    this.setShine(false);
    this.setShine(true);
    this.shineTimer = 20;
    return true;
  }

  /** Decide where to navigate: a job first, then your map destination, then fuel. */
  private updateNav(dt: number, pos: P) {
    if (!this.nav) return;
    // Following another player: move the destination with them (not every frame: re-routing costs).
    if (this.followId) {
      const p = this.remote?.positions().find((q) => q.id === this.followId);
      if (!p) { this.followId = null; this.dest = null; }
      else {
        this.followTimer -= dt;
        if (Math.hypot(pos.x - p.x, pos.z - p.z) < 10) {
          this.followId = null;
          this.dest = null;
          this.events.onPlayer?.('found', p.name);
        } else if (this.followTimer <= 0 && this.dest && Math.hypot(p.x - this.dest.x, p.z - this.dest.z) > 8) {
          this.dest = { x: p.x, z: p.z };
          this.followTimer = 1;
        }
      }
    }
    if (this.dest && !this.followId && Math.hypot(pos.x - this.dest.x, pos.z - this.dest.z) < 14) {
      this.dest = null;
      this.events.onMessage('arrived');
    }
    const job = this.jobs?.active;
    const target = job ? { x: job.x, z: job.z } : this.dest ?? (this.profile.fuel < 0.15 ? this.city!.layout.pois.gasStation : null);
    const cur = this.nav.target;
    const heading = this.mode === 'driving' ? this.vehicle!.heading : this.player!.heading;
    if (!target !== !cur || (target && cur && Math.hypot(target.x - cur.x, target.z - cur.z) > 1)) this.nav.setTarget(target, pos, heading);
    this.nav.update(dt, pos, heading);
  }

  /** A spot on the road lane next to a door, facing along the road. */
  private roadSpotNear(x: number, z: number) {
    const near = (v: number) => LINES.reduce((a, b) => (Math.abs(b - v) < Math.abs(a - v) ? b : a));
    const lx = near(x), lz = near(z);
    if (Math.abs(lz - z) <= Math.abs(lx - x)) {
      // horizontal road (runs along X): drive east in the lane on the south side
      const cx = THREE.MathUtils.clamp(x, -HALF_CITY + 12, HALF_CITY - 12);
      return { x: cx, z: lz + 2.5, rot: Math.PI / 2 };
    }
    const cz = THREE.MathUtils.clamp(z, -HALF_CITY + 12, HALF_CITY - 12);
    return { x: lx - 2.5, z: cz, rot: 0 };
  }

  private spawnPoint(where: 'home' | 'apartment') {
    const pois = this.city!.layout.pois;
    if (where === 'apartment') return this.roadSpotNear(pois.apartment.door.x, pois.apartment.door.z);
    return pois.spawn;
  }

  private async setVehicle(id: string, at: { x: number; z: number; rot: number }) {
    // Load the model first, so the old car stays until the new one is ready.
    const v = await Vehicle.create(getVehicle(id), this.profile.vehicleColors[id]);
    if (this.disposed) { v.dispose(); return; }
    // Paint shop extras on this car.
    applyStripe(v.car, this.profile.vehicleStripes[id] ?? '', v.isBike);
    applyRims(v.car, this.profile.vehicleRims[id] ?? '');
    applyNeon(v.car, this.profile.vehicleNeon[id] ?? '', v.isBike);
    applySpoiler(v.car, this.profile.vehicleSpoiler[id] ?? '', v.isBike);
    for (const d of this.profile.vehicleDents[id] ?? []) addDentMesh(v.car.root, d);
    const wasSeated = this.mode === 'driving' && this.avatar?.root.parent === this.vehicle?.car.root;
    if (wasSeated) this.scene.add(this.avatar!.root);
    this.setSiren(false);
    this.sirenLights?.dispose();
    this.sirenLights = undefined;
    this.signals?.dispose();
    this.signals = new TurnSignals(v.length, v.width);
    this.blinkTurned = 0;
    this.vehicle?.dispose();
    v.place(at.x, at.z, at.rot);
    v.root.add(this.signals.group);
    if (v.spec.siren) {
      this.sirenLights = new SirenLights(v.width, ...lightBarSpot(v), SIREN_COLORS[v.spec.siren]);
      v.root.add(this.sirenLights.group);
    }
    const lights = headlightRig(v.length, v.width);
    lights.visible = this.evening;
    v.root.add(lights);
    // Windscreen wipers (they sweep while it rains).
    this.wipers = v.isBike ? undefined : new Wipers(v.car.root, id, v.length, v.width, SKETCHFAB_VEHICLES[id]?.height ?? 1.45);
    if (this.wipers) v.car.root.add(this.wipers.group);
    this.scene.add(v.root);
    this.vehicle = v;
  }

  // ---------------- money ----------------

  /** Daily missions: add progress; a finished mission pays its reward right away. */
  private mission(id: MissionId, amount = 1) {
    const list = todaysMissions();
    const m = list.find((x) => x.id === id);
    if (!m) return;
    const st = missionDay(this.profile);
    if (st.done.includes(id)) return;
    const value = Math.min(m.goal, (st.progress[id] ?? 0) + amount);
    const finished = value >= m.goal - 1e-6;
    const next = { day: st.day, progress: { ...st.progress, [id]: Math.round(value * 100) / 100 }, done: finished ? [...st.done, id] : st.done };
    setProfile({ ...this.profile, missions: next });
    if (!finished) { this.dirty = true; return; }
    void updateProfile({ missions: next });
    this.addMoney(m.reward, 'mission');
    this.events.onMission?.(m);
    if (list.every((x) => next.done.includes(x.id))) awardSticker('missions');
  }

  private addMoney(amount: number, reason: 'job' | 'daily' | 'apartment' | 'fuel' | 'km' | 'mission' | 'coin' | 'race' | 'fish') {
    const p = this.profile;
    setProfile({ ...p, money: Math.max(0, p.money + amount) });
    this.dirty = true;
    if (reason !== 'km' && amount > 0) { this.events.onMoney(amount, reason); sounds.coin(); }
  }

  private dailyBonus() {
    const p = this.profile;
    const today = new Date().toDateString();
    if (new Date(p.lastDailyBonus).toDateString() === today) return;
    setProfile({ ...p, lastDailyBonus: Date.now() });
    updateProfile({ lastDailyBonus: Date.now() });
    setTimeout(() => this.addMoney(DAILY_BONUS, 'daily'), 1200);
  }

  /** Buy an ice cream at the stand: you hold it for a minute. False if there isn't enough money. */
  buyIceCream(flavor: Flavor): boolean {
    const p = this.profile;
    if (p.money < ICE_CREAM_PRICE) { this.events.onMessage('needMoney', ICE_CREAM_PRICE - p.money); return false; }
    setProfile({ ...p, money: p.money - ICE_CREAM_PRICE });
    void updateProfile({ money: p.money - ICE_CREAM_PRICE });
    this.events.onMoney(-ICE_CREAM_PRICE, 'iceCream');
    const f = FLAVORS.find((q) => q.id === flavor) ?? FLAVORS[0];
    this.avatar?.holdItem(coneGeometry(f.color).scale(1.6, 1.6, 1.6)); // a bit bigger: easy to see
    this.iceCreamTimer = ICE_CREAM_TIME;
    sounds.coin();
    awardSticker('iceCream');
    this.mission('iceCream');
    return true;
  }

  /** Buy a snack at the supermarket (juice: run faster, banana: jump higher, chocolate: hold it). */
  /** Bakery: buy a treat; you hold it for a minute and it gives a small boost. */
  /**
   * Library quiz: an answer was given. A right answer pays €10, once a day per question; returns the
   * money earned (0 when wrong or already earned today).
   */
  answerQuiz(n: number, right: boolean): number {
    if (!right) return 0;
    const p = this.profile, day = today();
    const done = p.quizDay === day ? p.quizRight : [];
    if (done.includes(n)) return 0;
    const quizRight = [...done, n];
    setProfile({ ...p, money: p.money + QUIZ_REWARD, quizDay: day, quizRight });
    void updateProfile({ money: p.money + QUIZ_REWARD, quizDay: day, quizRight });
    this.events.onMoney(QUIZ_REWARD, 'quiz');
    sounds.coin();
    return QUIZ_REWARD;
  }

  buyBakery(id: BakeryId): boolean {
    const item = BAKERY.find((q) => q.id === id)!;
    const p = this.profile;
    if (p.money < item.price) { this.events.onMessage('needMoney', item.price - p.money); return false; }
    setProfile({ ...p, money: p.money - item.price });
    void updateProfile({ money: p.money - item.price });
    this.events.onMoney(-item.price, 'bakery');
    if (this.player) {
      if (id === 'croissant') this.player.speedBoost = BAKERY_TIME;
      if (id === 'cake') this.player.jumpBoost = BAKERY_TIME;
      if (id === 'cookie') { this.player.speedBoost = BAKERY_TIME / 2; this.player.jumpBoost = BAKERY_TIME / 2; }
    }
    this.avatar?.holdItem(bakeryGeometry(id).scale(1.6, 1.6, 1.6));
    this.iceCreamTimer = BAKERY_TIME;
    sounds.coin();
    awardSticker('baker');
    return true;
  }

  /** Vegetable garden: buy seeds and sow all four beds with one crop. */
  sowGarden(crop: CropId): boolean {
    const c = cropOf(crop)!, p = this.profile;
    if (p.garden) return false;
    if (p.money < c.price) { this.events.onMessage('needMoney', c.price - p.money); return false; }
    const garden = { crop, at: Date.now() };
    setProfile({ ...p, money: p.money - c.price, garden });
    void updateProfile({ money: p.money - c.price, garden });
    this.events.onMoney(-c.price, 'garden');
    sounds.coin();
    return true;
  }

  /** Supermarket: sell all the vegetables you harvested; returns the money earned. */
  sellHarvest(): number {
    const p = this.profile;
    const total = CROPS.reduce((s, c) => s + (p.basket[c.id] ?? 0) * c.sell, 0);
    if (!total) return 0;
    setProfile({ ...p, money: p.money + total, basket: {} });
    void updateProfile({ money: p.money + total, basket: {} });
    this.events.onMoney(total, 'garden');
    sounds.coin();
    awardSticker('gardener');
    return total;
  }

  /** The harvest you carry (crop → how many). */
  get basket() { return this.profile.basket; }

  buySnack(id: SnackId): boolean {
    const item = SNACKS.find((q) => q.id === id)!;
    const p = this.profile;
    if (p.money < item.price) { this.events.onMessage('needMoney', item.price - p.money); return false; }
    setProfile({ ...p, money: p.money - item.price });
    void updateProfile({ money: p.money - item.price });
    this.events.onMoney(-item.price, 'supermarket');
    if (id === 'juice' && this.player) this.player.speedBoost = SNACK_TIME;
    if (id === 'banana' && this.player) this.player.jumpBoost = SNACK_TIME;
    if (id === 'chocolate') { this.avatar?.holdItem(chocolateGeometry().scale(1.6, 1.6, 1.6)); this.iceCreamTimer = SNACK_TIME; }
    sounds.coin();
    awardSticker('supermarket');
    return true;
  }

  /**
   * Paint shop: new paint (EUR 50), a roof stripe or rim color (EUR 80 each) for the car you're in.
   * Choosing what the car already has is free. The car shines afterwards.
   */
  paintCar(part: 'color' | 'stripe' | 'rims' | 'neon' | 'spoiler', value: string): boolean {
    const v = this.vehicle, p = this.profile;
    if (!v) return false;
    const id = v.spec.id;
    const current = part === 'color' ? p.vehicleColors[id] ?? v.spec.color : part === 'stripe' ? p.vehicleStripes[id] ?? '' : part === 'neon' ? p.vehicleNeon[id] ?? '' : part === 'spoiler' ? p.vehicleSpoiler[id] ?? '' : p.vehicleRims[id] ?? '';
    if (current === value) return true;
    const price = part === 'color' ? PAINT_PRICE : part === 'neon' ? NEON_PRICE : part === 'spoiler' ? SPOILER_PRICE : EXTRA_PRICE;
    if (p.money < price) { this.events.onMessage('needMoney', price - p.money); return false; }
    const changes: Partial<PlayerProfile> = { money: p.money - price };
    if (part === 'color') { changes.vehicleColors = { ...p.vehicleColors, [id]: value }; v.car.setColor(value); }
    if (part === 'stripe') { changes.vehicleStripes = { ...p.vehicleStripes, [id]: value }; applyStripe(v.car, value, v.isBike); }
    if (part === 'rims') { changes.vehicleRims = { ...p.vehicleRims, [id]: value }; applyRims(v.car, value); }
    if (part === 'neon') { changes.vehicleNeon = { ...p.vehicleNeon, [id]: value }; applyNeon(v.car, value, v.isBike); }
    if (part === 'spoiler') { changes.vehicleSpoiler = { ...p.vehicleSpoiler, [id]: value }; applySpoiler(v.car, value, v.isBike); }
    setProfile({ ...p, ...changes });
    void updateProfile(changes);
    this.events.onMoney(-price, 'paintShop');
    this.setShine(false);
    this.setShine(true);
    this.shineTimer = 20;
    sounds.coin();
    awardSticker('paintShop');
    return true;
  }

  /** The horn of the car you're in. */
  carHorn(): HornId {
    const id = this.vehicle ? this.profile.vehicleHorns[this.vehicle.spec.id] : undefined;
    return isHorn(id) ? id : 'normal';
  }

  /** Horn shop: hear a horn for a moment. */
  previewHorn(id: HornId) {
    sounds.hornStart(id);
    clearTimeout(this.previewTimer);
    this.previewTimer = window.setTimeout(() => { if (!this.honking) sounds.hornStop(); }, 1400);
  }
  private previewTimer = 0;

  /** Horn shop: buy a horn (once) and/or choose it for the car you're in. False if there isn't enough money. */
  chooseHorn(id: HornId): boolean {
    const v = this.vehicle, p = this.profile, horn = HORNS.find((x) => x.id === id);
    if (!v || !horn) return false;
    const owned = horn.price === 0 || p.horns.includes(id);
    if (!owned && p.money < horn.price) { this.events.onMessage('needMoney', horn.price - p.money); return false; }
    const changes: Partial<PlayerProfile> = { vehicleHorns: { ...p.vehicleHorns, [v.spec.id]: id } };
    if (!owned) { changes.horns = [...p.horns, id]; changes.money = p.money - horn.price; }
    setProfile({ ...p, ...changes });
    void updateProfile(changes);
    if (!owned) { this.events.onMoney(-horn.price, 'paintShop'); sounds.coin(); awardSticker('hornShop'); }
    return true;
  }

  /** What the car you're in has now (for the paint shop panel). */
  carLook() {
    const v = this.vehicle, p = this.profile;
    if (!v) return null;
    const id = v.spec.id;
    return { neon: p.vehicleNeon[id] ?? '', spoiler: p.vehicleSpoiler[id] ?? '', dents: p.vehicleDents[id]?.length ?? 0, color: p.vehicleColors[id] ?? v.spec.color, stripe: p.vehicleStripes[id] ?? '', rims: p.vehicleRims[id] ?? '', paintable: SKETCHFAB_VEHICLES[id]?.paintable ?? true, bike: v.isBike };
  }

  /** Buy a piece of furniture for the apartment. False if there isn't enough money. */
  buyFurniture(id: string): boolean {
    const item = FURNITURE.find((f) => f.id === id), p = this.profile;
    if (!item || p.furniture.includes(id)) return false;
    if (p.money < item.price) { this.events.onMessage('needMoney', item.price - p.money); return false; }
    const furniture = [...p.furniture, id];
    setProfile({ ...p, money: p.money - item.price, furniture });
    void updateProfile({ money: p.money - item.price, furniture });
    this.events.onMoney(-item.price, 'furniture');
    sounds.coin();
    awardSticker('furniture');
    return true;
  }

  /** Buy a pet in the pet shop (it comes along right away). False if there isn't enough money. */
  buyPet(id: string): boolean {
    const spec = getPet(id), p = this.profile;
    if (!spec) return false;
    if (p.pets.includes(id)) { this.choosePet(id); return true; }
    if (p.money < spec.price) { this.events.onMessage('needMoney', spec.price - p.money); return false; }
    const pets = [...p.pets, id];
    setProfile({ ...p, money: p.money - spec.price, pets, activePet: id });
    void updateProfile({ money: p.money - spec.price, pets, activePet: id });
    this.events.onMoney(-spec.price, 'petShop');
    this.setPet(id);
    sounds.coin();
    return true;
  }

  /** Pick which of your pets comes along ('' = none). */
  choosePet(id: string) {
    const p = this.profile;
    if (id && !p.pets.includes(id)) return;
    setProfile({ ...p, activePet: id });
    void updateProfile({ activePet: id });
    this.setPet(id);
  }

  private setPet(id: string) {
    if (this.pet?.spec.id === id) return;
    this.pet?.dispose();
    this.pet = undefined;
    const spec = getPet(id);
    if (!spec || !this.player) return;
    this.pet = new Pet(spec);
    const pl = this.player;
    this.pet.place(pl.x - Math.sin(pl.heading) * 1.5, pl.z - Math.cos(pl.heading) * 1.5, pl.heading);
    this.scene.add(this.pet.root);
  }

  /** On foot: the pet trots after you (a bit behind, to the side). In the car: on the passenger seat. */
  private updatePet(dt: number) {
    const pet = this.pet, v = this.vehicle, pl = this.player;
    if (!pet || !v || !pl) return;
    if (this.mode === 'driving') {
      if (pet.root.parent !== v.car.root) {
        v.car.root.add(pet.root);
        const s = v.car.seat;
        pet.root.position.set(-s.x, s.y - 0.32, s.z);
        pet.root.rotation.set(0, 0, 0);
        pet.root.scale.setScalar(0.85);
      }
      pet.animate(dt);
      return;
    }
    if (pet.root.parent !== this.scene) {
      this.scene.add(pet.root);
      pet.root.scale.setScalar(1);
      pet.place(pl.x - Math.sin(pl.heading) * 1.2 + Math.cos(pl.heading) * 0.8, pl.z - Math.cos(pl.heading) * 1.2 - Math.sin(pl.heading) * 0.8, pl.heading);
    }
    const back = 1.3, side = 0.6;
    pet.follow(dt, { x: pl.x - Math.sin(pl.heading) * back + Math.cos(pl.heading) * side, z: pl.z - Math.cos(pl.heading) * back - Math.sin(pl.heading) * side }, pl.speed);
  }

  /** Save right now (before the page reloads for an update). */
  saveNow() { this.save(true); }

  /** Saves money/fuel/km at most every few seconds (and on exit). */
  private save(force = false) {
    if (!this.dirty) return;
    // Real time (not game time), so slow devices still save every few seconds.
    const now = performance.now();
    if (!force && now - this.lastSave < 4000) return;
    this.lastSave = now;
    this.dirty = false;
    const p = this.profile;
    updateProfile({ money: Math.round(p.money), fuel: Math.round(p.fuel * 1000) / 1000, km: Math.round(p.km * 10) / 10, ...(p.missions ? { missions: p.missions } : {}) });
  }

  // ---------------- car / walking ----------------

  private seatAvatar() {
    const v = this.vehicle!, a = this.avatar!;
    v.car.root.add(a.root);
    const scale = v.car.seatScale ?? SEATED_SCALE;
    a.root.position.copy(seatedRootPosition(v.car.seat, scale));
    a.root.rotation.set(0, 0, 0);
    a.root.scale.setScalar(scale);
    a.setTallGear(false);
    a.play('SitDown', { once: true, fade: 0.2, then: null });
    this.mode = 'driving';
  }

  private startFishing() {
    const p = this.player, a = this.avatar;
    if (!p || !a) return;
    this.iceCreamTimer = 0;
    a.holdItem(rodGeometry());
    p.heading = Math.atan2(FLOAT.x - p.x, FLOAT.z - p.z);
    this.follow.yaw = Math.PI - 0.35; // camera a bit to the left, so the float shows next to you
    this.fishing = { phase: 'wait', t: 3 + Math.random() * 5 };
  }

  private stopFishing() {
    this.fishing = null;
    this.avatar?.holdItem(null);
  }

  private catchFish() {
    const fish = randomFish(), p = this.profile;
    const isNew = !p.fish[fish.id];
    const counts = { ...p.fish, [fish.id]: (p.fish[fish.id] ?? 0) + 1 };
    setProfile({ ...this.profile, fish: counts });
    void updateProfile({ fish: counts });
    this.addMoney(fish.reward, 'fish');
    this.events.onFish?.(fish, isNew);
    awardSticker('fish');
    if (FISH.every((f) => counts[f.id])) awardSticker('fishAll');
    if (this.fishing) this.fishing = { phase: 'wait', t: 3 + Math.random() * 6 };
  }

  /** Fishing: wait for a bite, then the float stays under for a moment; walking away stops. */
  private updateFishing(dt: number) {
    const f = this.fishing, p = this.player, a = this.avatar;
    if (!p || !a) return;
    if (f && (this.mode !== 'walking' || Math.hypot(p.x - FISH_SPOT.x, p.z - FISH_SPOT.z) > 3.2)) this.stopFishing();
    let tip: THREE.Vector3 | null = null;
    if (this.fishing) {
      const g = this.fishing;
      g.t -= dt;
      if (g.t <= 0 && g.phase === 'wait') { g.phase = 'bite'; g.t = BITE_TIME; sounds.blinkerTick(true); }
      else if (g.t <= 0) { this.events.onMessage('fishGone'); g.phase = 'wait'; g.t = 3 + Math.random() * 5; }
      tip = new THREE.Vector3(p.x + Math.sin(p.heading) * 1.7, p.y + 2.5, p.z + Math.cos(p.heading) * 1.7);
    }
    this.jetty?.update(dt, tip, this.fishing?.phase === 'bite');
  }

  /** Swimming: splash + sticker when you go in, the duck float around your waist, ripples. */
  private updateSwimming(dt: number) {
    const pl = this.player, a = this.avatar;
    if (!pl || !a) return;
    const swimming = this.mode === 'walking' && !this.ride && pl.swimming;
    if (swimming && !this.wasSwimming) { sounds.splash(); awardSticker('swim'); }
    this.wasSwimming = swimming;
    if (swimming && pl.hasFloat && !this.floatMesh) {
      this.floatMesh = new THREE.Mesh(floatGeometry(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4 }));
      this.floatMesh.position.y = 1.0;
    }
    if (this.floatMesh) {
      if (swimming && pl.hasFloat && this.floatMesh.parent !== a.root) a.root.add(this.floatMesh);
      this.floatMesh.visible = swimming && pl.hasFloat;
    }
    this.beach?.update(dt, swimming ? { x: pl.x, z: pl.z, moving: pl.speed > 0.1 } : null);
  }

  private stopRace() {
    this.race = null;
    this.raceTrack?.highlight(null);
  }

  /** Desert race: 3-2-1 (the car waits), then drive through the gates in order and back over the finish line. */
  private updateRace(dt: number) {
    const r = this.race, v = this.vehicle, track = this.raceTrack;
    if (!r || !v || !track) return;
    if (this.mode !== 'driving' || r.t > 600) { this.stopRace(); return; }
    if (r.count > 0) {
      v.limit = 0;
      const before = Math.ceil(r.count);
      r.count -= dt;
      if (Math.ceil(r.count) !== before) sounds.blinkerTick(r.count > 0);
      if (r.count <= 0) { r.count = 0; sounds.coin(); }
      return;
    }
    r.t += dt;
    const g = track.gates[r.next];
    if (Math.hypot(v.x - g.x, v.z - g.z) > RACE.half + 4) return;
    if (r.next === 0) { this.finishRace(r.t); return; }
    r.passed++;
    sounds.blinkerTick(true);
    r.next = r.passed >= CHECKPOINTS ? 0 : r.next + 1;
    track.highlight(r.next);
  }

  private finishRace(time: number) {
    const v = this.vehicle!, p = this.profile, id = v.spec.id;
    this.stopRace();
    const medal = medalFor(time, v.spec.topSpeed);
    const old = p.raceBest[id];
    const record = !old || time < old;
    const best = record ? time : old;
    const raceBest = { ...p.raceBest, [id]: Math.round(best * 10) / 10 };
    setProfile({ ...this.profile, raceBest });
    void updateProfile({ raceBest });
    const prize = MEDAL_PRIZE[medal];
    this.addMoney(prize, 'race');
    this.events.onRaceDone?.({ medal, time, best, record, prize });
    awardSticker('race');
    if (medal === 'gold') awardSticker('raceGold');
  }

  /** Pay and get on the Ferris wheel or the carousel; you get off by yourself when the ride is over. */
  private startRide(kind: RideKind, price: number) {
    if (!this.funFair || !this.balloon || !this.avatar || !this.city || this.ride) return;
    const p = this.profile;
    if (p.money < price) { this.events.onMessage('needMoney', price - p.money); return; }
    setProfile({ ...p, money: p.money - price });
    void updateProfile({ money: p.money - price });
    if (kind === 'skate') {
      // Skateboarding is free: you stand on the board and the ride does the tricks.
      if (!this.skate) return;
      const { seat, duration } = this.skate.start();
      const a = this.avatar;
      seat.add(a.root);
      a.root.position.set(0, 0.12, 0);
      a.root.rotation.set(0, 0, 0);
      a.root.scale.setScalar(1);
      a.play('Walk', { fade: 0.2 });
      this.skateRolling = false;
      const sp = this.city.layout.pois.skatePark;
      this.ride = { kind, t: 0, dur: duration, exit: sp.front, from: { x: sp.x, z: sp.z } };
      awardSticker('skater');
      return;
    }
    if (kind === 'sandboard') {
      // Sandboard: you stand on it (no sitting); pulled up by the rope tow, then you slide down.
      if (!this.sandboard) return;
      this.events.onMoney(-price, 'sandboard');
      const { seat, duration } = this.sandboard.start();
      const a = this.avatar;
      seat.add(a.root);
      a.root.position.set(0, 0.06, 0);
      a.root.rotation.set(0, 0, 0);
      a.root.scale.setScalar(1);
      a.play('Walk', { fade: 0.2 });
      this.sandboardAnim = 'walk';
      this.ride = { kind, t: 0, dur: duration, exit: SANDBOARD_END, from: SANDBOARD_TOP };
      awardSticker('sandboard');
      return;
    }
    if (kind === 'boat' && !this.boat) return;
    this.events.onMoney(-price, kind === 'balloon' ? 'balloon' : kind === 'boat' ? 'boat' : 'funFair');
    const { seat, duration } = kind === 'balloon' ? this.balloon.board() : kind === 'boat' ? this.boat!.board() : this.funFair.board(kind);
    const fair = kind === 'balloon' || kind === 'boat' ? null : this.city.layout.pois.funFair[kind];
    // Off the boat you step back onto the jetty, facing land (north).
    const exit = fair ? fair.front : kind === 'boat' ? BOAT_FRONT : BALLOON_FRONT;
    const from = fair ?? (kind === 'boat' ? { x: BOAT_FRONT.x, z: BOAT_FRONT.z + 3 } : { x: BALLOON_FRONT.x, z: BALLOON_FRONT.z + 3 });
    const a = this.avatar, scale = 0.9;
    seat.add(a.root);
    a.root.position.copy(seatedRootPosition(new THREE.Vector3(), scale));
    a.root.rotation.set(0, 0, 0);
    a.root.scale.setScalar(scale);
    a.setTallGear(false);
    a.play('SitDown', { once: true, fade: 0.2, then: null });
    this.ride = { kind, t: 0, dur: duration, exit, from };
    awardSticker(kind === 'balloon' ? 'balloon' : kind === 'boat' ? 'boat' : 'funFair');
    if (kind !== 'boat') this.mission('funFair');
  }

  private endRide() {
    if (!this.ride || !this.avatar || !this.player || !this.city) return;
    const front = this.ride.exit, fair = this.ride.from;
    if (this.ride.kind === 'skate') this.skate?.leave();
    if (this.ride.kind === 'balloon') this.balloon?.leave();
    else if (this.ride.kind === 'boat') this.boat?.leave();
    else if (this.ride.kind === 'sandboard') this.sandboard?.leave();
    else this.funFair?.leave();
    const wasBoard = this.ride.kind === 'sandboard' || this.ride.kind === 'skate';
    this.ride = null;
    const a = this.avatar;
    this.scene.add(a.root);
    a.root.scale.setScalar(1);
    a.setTallGear(true);
    // Step off facing away from the ride.
    this.player.place(front.x, front.z, Math.atan2(front.x - fair.x, front.z - fair.z));
    if (wasBoard) a.play('Idle', { fade: 0.2 }); else a.play('StandUp', { once: true, fade: 0.15, then: 'Idle' });
  }

  private toggleCar() {
    const v = this.vehicle!, a = this.avatar!, p = this.player!;
    if (this.mode === 'driving') {
      if (v.kmh > 8) return;
      v.speed = 0;
      const door = v.localToWorld(v.width / 2 + 0.9, v.car.seat.z);
      this.scene.add(a.root);
      a.root.scale.setScalar(1);
      a.setTallGear(true);
      p.place(door.x, door.z, v.heading + Math.PI / 2);
      a.play('StandUp', { once: true, fade: 0.15, then: 'Idle' });
      this.mode = 'walking';
      this.setSiren(false);
      if (this.signals) this.signals.side = null;
      sounds.door();
    } else if (this.canEnter()) {
      this.seatAvatar();
      sounds.door();
    }
  }

  /** Play on a multiplayer server: share my state, show the others. */
  setMultiplayer(session: MpSession) {
    this.mp = session;
    this.remote = new RemotePlayers();
    this.scene.add(this.remote.group);
    // "<name> joined the server" (not for the players who were already there when we joined).
    // Someone only counts as gone after missing for a few seconds, so a short connection hiccup
    // doesn't show "left" + "joined" again.
    const since = Date.now();
    this.offPlayers = session.onPlayers((players) => {
      this.remote?.sync(players);
      for (const [id, p] of players) {
        const k = this.knownPlayers.get(id);
        if (k) { k.goneAt = 0; k.name = p.name; continue; }
        this.knownPlayers.set(id, { name: p.name, goneAt: 0 });
        if (Date.now() - since > 4000) this.events.onPlayer?.('joined', cleanText(p.name, 20) || '?');
      }
      for (const [id, k] of this.knownPlayers) if (!players.has(id) && !k.goneAt) k.goneAt = Date.now();
    });
  }

  /**
   * The camera's near/far range. Normally near = 0.5 m (good depth precision for the whole city), but
   * in the dashboard view the steering wheel and gauges are closer than that and would be cut away.
   */
  private setCameraRange(cockpit: boolean) {
    const near = cockpit ? 0.05 : 0.5, far = cockpit ? 2500 : 6000;
    if (this.camera.near === near) return;
    this.camera.near = near;
    this.camera.far = far;
    this.camera.updateProjectionMatrix();
  }

  /**
   * How far along the car the driver's eyes are (car-local z). As far back as 30 cm behind the hips,
   * but never behind a wall (the partition behind a van's cab, a supercar's rear bulkhead): it tries
   * spots from back to front and takes the first one with nothing right in front of it. Cached per car.
   */
  private cockpitEyeZ(v: Vehicle): number {
    const car = v.car;
    if (car.root.userData.eyeZ !== undefined) return car.root.userData.eyeZ as number;
    const scale = car.seatScale ?? 0.74;
    // Ray in the car's own space (car root without its world transform).
    const holder = new THREE.Group();
    const parent = car.root.parent;
    const saved = car.root.matrix.clone();
    holder.add(car.root);
    car.root.position.set(0, 0, 0); car.root.rotation.set(0, 0, 0); car.root.scale.setScalar(1);
    holder.updateMatrixWorld(true);
    const ray = new THREE.Raycaster();
    const dir = new THREE.Vector3(0, Math.sin(-0.12), Math.cos(-0.12));
    let eyeZ = car.seat.z + 0.1;
    for (const dz of [-0.3, -0.2, -0.1, 0, 0.1]) {
      ray.set(new THREE.Vector3(car.seat.x, car.seat.y + 1.0 * scale, car.seat.z + dz), dir);
      ray.far = 0.35;
      // Ignore your own driver (sitting right there, hidden in this view).
      const avatarRoot = this.avatar?.root;
      const isAvatar = (o: THREE.Object3D | null) => { for (; o; o = o.parent) if (o === avatarRoot) return true; return false; };
      const hit = ray.intersectObject(car.root, true).find((h) => !isAvatar(h.object));
      if (!hit) { eyeZ = car.seat.z + dz; break; }
    }
    // Put the car back where it was.
    parent?.add(car.root);
    saved.decompose(car.root.position, car.root.quaternion, car.root.scale);
    car.root.userData.eyeZ = eyeZ;
    return eyeZ;
  }

  /**
   * Mirrors (dashboard view only): the view back along the left and the right side of the car, drawn over
   * the wing mirrors (so they don't hide the traffic lights ahead). Same size formula as the frames in the
   * HUD (.mirror-frame): 4% from the side, top 43%, width min(19vw, 320px), height 56% of the width.
   */
  private renderMirror(v: Vehicle, side: 1 | -1) {
    const r = this.renderer, canvas = r.domElement;
    const cssW = canvas.clientWidth, cssH = canvas.clientHeight;
    if (!cssW || !cssH) return;
    const w = Math.min(cssW * 0.19, 320), h = w * 0.56, top = cssH * 0.43;
    const left = side > 0 ? cssW * 0.04 : cssW * 0.96 - w;
    const sf = SKETCHFAB_VEHICLES[v.spec.id];
    // From the wing mirror (+x is the car's left side, -x its right), looking back and a little outward.
    const back = new THREE.Vector3(side * (v.width / 2 + 0.25), (sf?.height ?? 1.4) * 0.75, v.length / 2 - 1.4);
    v.car.root.updateWorldMatrix(true, false);
    const from = back.clone().applyMatrix4(v.car.root.matrixWorld);
    const yaw = v.heading + Math.PI - 0.12 * side;
    this.mirrorCam.aspect = w / h;
    this.mirrorCam.updateProjectionMatrix();
    this.mirrorCam.position.copy(from);
    this.mirrorCam.lookAt(from.x + Math.sin(yaw) * 10, from.y - 0.6, from.z + Math.cos(yaw) * 10);
    r.setScissorTest(true);
    r.setScissor(left, cssH - top - h, w, h);
    r.setViewport(left, cssH - top - h, w, h);
    r.autoClear = false;
    r.clear(true, true, false);
    r.render(this.scene, this.mirrorCam);
    r.autoClear = true;
    r.setScissorTest(false);
    r.setViewport(0, 0, cssW, cssH);
  }

  /** Dashboard view: the camera at the driver's eyes, looking out of the windscreen. */
  private placeCockpitCamera(v: Vehicle) {
    this.setCameraRange(true);
    const car = v.car, scale = car.seatScale ?? 0.74;
    // Update from the top (the car's root moved this frame), or the camera lags a frame behind.
    car.root.updateWorldMatrix(true, false);
    // Eyes: above the hips, and a bit behind them (you lean back in the seat), so the steering
    // wheel and the gauges are in front of you instead of right under your nose.
    const eyeZ = this.cockpitEyeZ(v);
    const eye = new THREE.Vector3(car.seat.x, car.seat.y + 1.0 * scale, eyeZ).applyMatrix4(car.root.matrixWorld);
    const yaw = v.heading + this.cockpitYaw, pitch = -0.12 + this.cockpitPitch;
    const dir = new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
    this.camera.position.copy(eye);
    this.camera.lookAt(eye.clone().add(dir));
  }

  /** Show a chat line / emote above the player who sent it. */
  showChatBubble(playerId: string, text: string, emote: boolean) {
    this.remote?.showBubble(playerId, text, emote);
  }

  private shareState() {
    const v = this.vehicle, pl = this.player, p = this.profile;
    if (!this.mp || !v || !pl) return;
    const driving = this.mode === 'driving';
    this.mp.publish({
      name: p.username, gender: p.gender, outfit: p.equipped.outfit, vehicle: v.spec.id,
      color: p.vehicleColors[v.spec.id] ?? v.spec.color, mode: this.mode,
      stripe: p.vehicleStripes[v.spec.id] ?? '', rims: p.vehicleRims[v.spec.id] ?? '',
      neon: p.vehicleNeon[v.spec.id] ?? '', spoiler: p.vehicleSpoiler[v.spec.id] ?? '',
      x: driving ? v.x : pl.x, z: driving ? v.z : pl.z, h: driving ? v.heading : pl.heading,
      v: driving ? v.speed : pl.speed, siren: this.sirenOn, blink: driving ? this.signals?.side ?? null : null,
    });
  }

  /** 🏁 Max speed (km/h), or null for no limit (the car's own top speed). */
  setMaxSpeed(kmh: number | null) {
    this.maxKmh = kmh;
    try { if (kmh) localStorage.setItem(MAX_SPEED_KEY, String(kmh)); else localStorage.removeItem(MAX_SPEED_KEY); } catch { /* private mode */ }
  }

  /** Siren + flashing lights on/off (police, fire truck, ambulance); traffic pulls over while it is on. */
  private setSiren(on: boolean) {
    if (on === this.sirenOn) return;
    this.sirenOn = on;
    if (this.sirenLights) this.sirenLights.on = on;
    if (on) sounds.sirenOn(this.vehicle?.spec.siren); else sounds.sirenOff();
  }

  private canEnter() {
    if (this.mode !== 'walking' || !this.vehicle || !this.player) return false;
    return Math.hypot(this.player.x - this.vehicle.x, this.player.z - this.vehicle.z) < ENTER_DISTANCE;
  }

  // ---------------- places ----------------

  private context(): ContextAction | null {
    if (!this.city || !this.vehicle || !this.player) return null;
    const L = this.city.layout, v = this.vehicle;
    if (this.mode === 'driving') {
      if (this.race) return { kind: 'raceStop' };
      const start = this.raceTrack?.gates[0];
      if (start && Math.hypot(v.x - start.x, v.z - start.z) < 14 && v.kmh < 15) return { kind: 'raceStart' };
      if (this.carWash?.inside(v.x, v.z) && (v.kmh < 4 || this.washTimer > 0)) return { kind: 'wash', price: WASH_PRICE };
      const c = L.gas.canopy;
      const under = v.x > c.x0 - 2 && v.x < c.x1 + 2 && v.z > c.z0 - 2 && v.z < c.z1 + 2;
      if (under && v.kmh < 4 && (this.profile.fuel < 0.98 || this.refueling)) return { kind: 'refuel' };
      const ps = L.pois.paintShop.front;
      if (Math.hypot(v.x - ps.x, v.z - ps.z) < 7 && v.kmh < 6) return { kind: 'paintShop' };
      return null;
    }
    if (this.ride) return { kind: 'rideStop' };
    if (this.fishing) return { kind: 'fishReel', bite: this.fishing.phase === 'bite' };
    const p = this.player;
    if (Math.hypot(p.x - FISH_SPOT.x, p.z - FISH_SPOT.z) < 2.6) return { kind: 'fish' };
    const near = (d: { x: number; z: number }) => Math.hypot(p.x - d.x, p.z - d.z) < 3.2;
    if (near(L.pois.funFair.wheel.front)) return { kind: 'ride', ride: 'wheel', price: RIDE_PRICE };
    if (near(L.pois.funFair.carousel.front)) return { kind: 'ride', ride: 'carousel', price: RIDE_PRICE };
    if (near(BALLOON_FRONT)) return { kind: 'ride', ride: 'balloon', price: BALLOON_PRICE };
    if (near(BOAT_FRONT)) return { kind: 'ride', ride: 'boat', price: BOAT_PRICE };
    if (near(L.pois.skatePark.front)) return { kind: 'ride', ride: 'skate', price: 0 };
    if (near(SANDBOARD_FRONT)) return { kind: 'ride', ride: 'sandboard', price: SANDBOARD_PRICE };
    if (near(FLOAT_FRONT) && !this.profile.swimFloat) return { kind: 'buyFloat', price: FLOAT_PRICE };
    if (near(KITE_FRONT) && !this.profile.kite) return { kind: 'buyKite', price: KITE_PRICE };
    if (near(FIREWORKS_FRONT) && !this.fireworks?.active) return { kind: 'fireworks', price: FIREWORKS_PRICE };
    if (near(L.pois.home.door)) return { kind: 'home' };
    // Vegetable garden: sow (empty), wait (growing) or harvest (ripe).
    const gd = L.pois.home.garden;
    if (Math.hypot(p.x - gd.x, p.z - gd.z) < 3.6) {
      const g = this.profile.garden;
      if (!g) return { kind: 'garden' };
      const k = growth(g.crop, g.at);
      if (k >= 1) return { kind: 'harvest', crop: g.crop };
      return { kind: 'gardenWait', crop: g.crop, secs: Math.ceil((1 - k) * cropOf(g.crop)!.minutes * 60) };
    }
    if (near(L.pois.iceCream.front)) return { kind: 'iceCream', price: ICE_CREAM_PRICE };
    if (this.iceTruck?.isParked && near(this.iceTruck.hatch)) return { kind: 'iceTruck' };
    if (near(L.pois.postOffice.front)) return { kind: 'treasureMap' };
    if (this.chest && this.hasTreasureMap() && Math.hypot(p.x - this.chest.spot.x, p.z - this.chest.spot.z) < 2.6) return { kind: 'openTreasure' };
    if (Math.hypot(p.x - L.pois.supermarket.front.x, p.z - L.pois.supermarket.front.z) < 4) return { kind: 'supermarket' };
    if (near(L.pois.petShop.front)) return { kind: 'petShop' };
    if (near(L.pois.bakery.front)) return { kind: 'bakery' };
    if (near(L.pois.library.front)) return { kind: 'library' };
    // Binoculars: anywhere on the edge of the park pond.
    const pd = L.park.pond;
    if (this.binoc || Math.max(Math.abs(p.x - pd.x), Math.abs(p.z - pd.z)) < pd.r + 6) return { kind: 'binoculars', looking: !!this.binoc };
    const animal = this.farm?.nearest(p.x, p.z);
    if (animal) return { kind: 'feed', animal: animal.kind, price: FEED_PRICE, brush: BRUSH_PRICE };
    const parked = this.garage?.near(p.x, p.z);
    if (parked) return { kind: 'takeCar', id: parked.id };
    if (near(L.pois.apartment.door)) return this.profile.ownsApartment ? { kind: 'apartment' } : { kind: 'buyApartment', price: APARTMENT_PRICE };
    return null;
  }

  private doContext(c: ContextAction) {
    switch (c.kind) {
      case 'refuel':
        this.refueling = !this.refueling;
        break;
      case 'wash': {
        if (this.washTimer > 0) break;
        const p = this.profile;
        if (p.money < c.price) { this.events.onMessage('needMoney', c.price - p.money); break; }
        setProfile({ ...p, money: p.money - c.price });
        void updateProfile({ money: p.money - c.price });
        this.events.onMoney(-c.price, 'wash');
        this.washTimer = WASH_TIME;
        this.mission('wash');
        break;
      }
      case 'takeCar': {
        const spot = this.garage?.near(this.player!.x, this.player!.z)?.spot;
        if (spot) void this.takeCar(c.id, spot);
        break;
      }
      case 'home':
      case 'apartment':
      case 'iceTruck':
        this.paused = true;
        this.events.onPlace('iceCream');
        break;
      case 'iceCream':
      case 'supermarket':
      case 'petShop':
      case 'paintShop':
      case 'bakery':
      case 'library':
      case 'garden':
        this.paused = true;
        this.events.onPlace(c.kind);
        break;
      case 'ride':
        this.startRide(c.ride, c.price);
        break;
      case 'treasureMap': {
        // One free map a week; the chest moves every Monday.
        const p = this.profile;
        if (p.treasureFound === this.week) { this.events.onMessage('treasureNextWeek'); break; }
        if (p.treasureMap === this.week) { this.events.onMessage('treasureHave'); break; }
        setProfile({ ...p, treasureMap: this.week });
        void updateProfile({ treasureMap: this.week });
        sounds.coin();
        this.events.onMessage('treasureMapGot');
        break;
      }
      case 'openTreasure': {
        const p = this.profile;
        if (!this.hasTreasureMap()) break;
        setProfile({ ...p, money: p.money + TREASURE_PRIZE, treasureFound: this.week });
        void updateProfile({ money: p.money + TREASURE_PRIZE, treasureFound: this.week });
        this.chest?.openUp();
        this.events.onMoney(TREASURE_PRIZE, 'treasure');
        sounds.coin();
        awardSticker('treasure');
        break;
      }
      case 'gardenWait':
        this.events.onMessage('gardenGrowing');
        break;
      case 'harvest': {
        const p = this.profile;
        if (!p.garden) break;
        const basket = { ...p.basket, [p.garden.crop]: (p.basket[p.garden.crop] ?? 0) + HARVEST };
        setProfile({ ...p, garden: null, basket });
        void updateProfile({ garden: null, basket });
        sounds.coin();
        this.events.onMessage('harvested'); // (8 vegetables: HARVEST)
        break;
      }
      case 'buyKite': {
        const p = this.profile;
        if (p.money < c.price) { this.events.onMessage('needMoney', c.price - p.money); break; }
        setProfile({ ...p, money: p.money - c.price, kite: true });
        void updateProfile({ money: p.money - c.price, kite: true });
        this.events.onMoney(-c.price, 'beach');
        sounds.coin();
        this.events.onMessage('kiteBought');
        break;
      }
      case 'buyFloat': {
        const p = this.profile;
        if (p.money < c.price) { this.events.onMessage('needMoney', c.price - p.money); break; }
        setProfile({ ...p, money: p.money - c.price, swimFloat: true });
        void updateProfile({ money: p.money - c.price, swimFloat: true });
        this.events.onMoney(-c.price, 'beach');
        if (this.player) this.player.hasFloat = true;
        sounds.coin();
        this.events.onMessage('floatBought');
        break;
      }
      case 'fireworks': {
        // Fireworks only show up well in the dark: by day you get a hint (and pay nothing).
        if (!this.evening) { this.events.onMessage('fireworksEvening'); break; }
        const p = this.profile, pl = this.player!;
        if (p.money < c.price) { this.events.onMessage('needMoney', c.price - p.money); break; }
        setProfile({ ...p, money: p.money - c.price });
        void updateProfile({ money: p.money - c.price });
        this.events.onMoney(-c.price, 'fireworks');
        this.fireworks?.start();
        // Turn around to watch the lake.
        pl.heading = Math.atan2(FIREWORKS_STAND.x - pl.x, 900 - pl.z);
        this.follow.yaw = pl.heading + Math.PI;
        awardSticker('fireworks');
        break;
      }
      case 'feed': {
        const p = this.profile, pl = this.player!, a = this.farm?.nearest(pl.x, pl.z);
        if (!a || a.happy > 0) break;
        if (p.money < c.price) { this.events.onMessage('needMoney', c.price - p.money); break; }
        const animalsFed = p.animalsFed.includes(a.kind) ? p.animalsFed : [...p.animalsFed, a.kind];
        setProfile({ ...p, money: p.money - c.price, animalsFed });
        void updateProfile({ money: p.money - c.price, animalsFed });
        this.events.onMoney(-c.price, 'farm');
        this.farm!.feed(a, pl.x, pl.z);
        sounds.coin();
        this.events.onFed?.(a.kind);
        if (['goat', 'sheep', 'rabbit', 'pony'].every((k) => animalsFed.includes(k))) awardSticker('farmFriend');
        break;
      }
      case 'binoculars':
        this.lookAtBird();
        break;
      case 'fish':
        this.startFishing();
        break;
      case 'fishReel':
        if (c.bite) this.catchFish();
        else this.events.onMessage('fishWait');
        break;
      case 'raceStart':
        this.race = { count: 2.999, t: 0, next: 1, passed: 0 };
        this.raceTrack?.highlight(1);
        sounds.blinkerTick(true);
        break;
      case 'raceStop':
        this.stopRace();
        break;
      case 'rideStop':
        this.endRide();
        break;
      case 'buyApartment': {
        const p = this.profile;
        if (p.money < c.price) { this.events.onMessage('needMoney', c.price - p.money); break; }
        setProfile({ ...p, money: p.money - c.price, ownsApartment: true });
        updateProfile({ money: p.money - c.price, ownsApartment: true });
        this.events.onMoney(-c.price, 'apartment');
        break;
      }
    }
  }

  private refuel(dt: number, ctx: ContextAction | null) {
    const p = this.profile;
    if (!this.refueling) return;
    // Stop when full, when driving off or when getting out.
    if (p.fuel >= 0.999 || ctx?.kind !== 'refuel' || this.mode !== 'driving') { this.refueling = false; this.payFuel(true); return; }
    const add = Math.min(1 - p.fuel, dt * 0.3);
    const cost = add * TANK_PRICE;
    if (p.money >= this.fuelBill + cost) {
      this.fuelBill += cost;
      setProfile({ ...p, fuel: p.fuel + add });
      this.payFuel(false);
    } else if (p.fuel < 0.3) {
      // Can't pay? The friendly attendant fills you up to 30% for free.
      setProfile({ ...p, fuel: 0.3 });
      this.events.onMessage('freeFuel');
      this.refueling = false;
    } else {
      this.refueling = false;
      this.payFuel(true);
      this.events.onMessage('needMoney', Math.ceil(cost));
    }
    this.dirty = true;
  }

  /** Money is always whole euros: pay the fuel bill per full euro (and the rest at the end). */
  private payFuel(final: boolean) {
    const euros = final ? Math.ceil(this.fuelBill - 1e-6) : Math.floor(this.fuelBill);
    if (euros <= 0) { if (final) this.fuelBill = 0; return; }
    this.fuelBill = final ? 0 : this.fuelBill - euros;
    const p = this.profile;
    setProfile({ ...p, money: Math.max(0, p.money - euros) });
  }

  /** From the home panel: switch to another owned car (it appears on the road outside). */
  /**
   * Freshly washed: glossier paint and brighter reflections (the original values are kept in
   * userData and put back when the shine wears off or the car changes).
   */
  private setShine(on: boolean) {
    this.vehicle?.car.root.traverse((o) => {
      const mats = (o as THREE.Mesh).material;
      if (!mats) return;
      for (const m of (Array.isArray(mats) ? mats : [mats]) as THREE.MeshStandardMaterial[]) {
        if (!m.isMeshStandardMaterial) continue;
        const ud = m.userData as { shine?: { r: number; e: number } };
        if (on && !ud.shine) {
          ud.shine = { r: m.roughness, e: m.envMapIntensity };
          m.roughness = Math.max(0.05, m.roughness * 0.35);
          m.envMapIntensity = m.envMapIntensity * 1.8;
        } else if (!on && ud.shine) {
          m.roughness = ud.shine.r;
          m.envMapIntensity = ud.shine.e;
          delete ud.shine;
        }
      }
    });
  }

  /** 🌙 / ☀️ button: switch between day and the soft evening light (remembered on this device). */
  setEvening(on: boolean) {
    // The 🌙 / ☀️ button skips the clock to the evening or the morning.
    this.clock = (on ? 20 : 8) * 60;
    saveEvening(on);
    this.applyLight(true);
  }

  /** "14:05" */
  clockText() {
    const m = Math.floor(this.clock) % 1440;
    return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  }

  /**
   * The light for the clock time: sky, sun, fog and hemisphere blend smoothly through the day. The
   * expensive bits (sky reflections, shadows) are only redone when the light has really changed.
   */
  private applyLight(full = false) {
    const L = lightAt(this.clock);
    const hour = (this.clock / 60) % 24;
    // Rain: a grey sky, less sun, a bit more haze.
    const rain = this.weather?.amount ?? 0;
    const grey = (c: THREE.Color) => c.clone().lerp(new THREE.Color(c.r * 0.3 + c.g * 0.59 + c.b * 0.11, c.r * 0.3 + c.g * 0.59 + c.b * 0.11, c.r * 0.3 + c.g * 0.59 + c.b * 0.11).multiplyScalar(0.8), rain * 0.75);
    SKY.zenith.copy(grey(L.zenith));
    SKY.horizon.copy(grey(L.horizon));
    SKY.sunDir.copy(L.sunDir);
    const fog = this.scene.fog as THREE.Fog;
    fog.color.copy(SKY.horizon);
    fog.near = this.fogBase.near * (1 - 0.4 * rain); fog.far = this.fogBase.far * (1 - 0.3 * rain);
    this.sun.light.color.copy(L.sun);
    this.sun.light.intensity = L.sunI * (1 - 0.55 * rain);
    this.sun.hemi.color.copy(L.hemiSky);
    this.sun.hemi.groundColor.copy(L.hemiGround);
    this.sun.hemi.intensity = L.hemiI;
    this.scene.environmentIntensity = L.env;
    // Reflections come from the sky: bake them again when its colors changed noticeably.
    const look = `${SKY.zenith.getHexString().slice(0, 4)}${SKY.horizon.getHexString().slice(0, 4)}`;
    if (full || look !== this.bakedLook) {
      this.bakedLook = look;
      const old = this.scene.environment;
      this.scene.environment = skyEnvironment(this.renderer);
      old?.dispose();
    }
    if (full || this.sunDirShown.angleTo(L.sunDir) > 0.03) {
      this.sunDirShown.copy(L.sunDir);
      this.sun.follow(this.focus, true);
    }
    // Evening and night: street lamps, headlights and traffic lights glow.
    const evening = hour >= 18.5 || hour < 6.2;
    if (full || evening !== this.evening) {
      this.evening = evening;
      if (this.lamps) this.lamps.group.visible = evening;
      const head = this.vehicle?.root.getObjectByName('CCG_HEADLIGHTS');
      if (head) head.visible = evening;
      this.traffic?.setLights(evening);
    }
    // Highway: 100 km/h by day (6:00-18:00), 120 km/h at night.
    const kmh = hour >= 6 && hour < 18 ? 100 : 120;
    this.traffic?.setHighwayKmh(kmh);
    this.highwaySigns?.setKmh(kmh);
  }

  swapVehicle(id: string, place: 'home' | 'apartment') {
    this.setShine(false);
    this.shineTimer = 0;
    if (!this.profile.ownedVehicles.includes(id)) return;
    setProfile({ ...this.profile, selectedVehicle: id });
    updateProfile({ selectedVehicle: id });
    void this.setVehicle(id, this.spawnPoint(place)).then(() => this.refreshGarage());
  }

  /** Walked up to a parked car at home: it becomes your car, the old one goes into the yard. */
  private async takeCar(id: string, spot: GarageSpot) {
    if (!this.profile.ownedVehicles.includes(id) || id === this.profile.selectedVehicle) return;
    this.setShine(false);
    this.shineTimer = 0;
    setProfile({ ...this.profile, selectedVehicle: id });
    void updateProfile({ selectedVehicle: id });
    await this.setVehicle(id, spot);
    await this.refreshGarage(spot);
  }

  /** Shows the right cars in the yard, and makes them solid (you can't walk or drive through). */
  private async refreshGarage(taken?: GarageSpot) {
    if (!this.garage || !this.city) return;
    const p = this.profile;
    await this.garage.refresh(p.ownedVehicles, p.selectedVehicle, p.vehicleColors, taken);
    if (this.disposed || !this.city) return;
    this.world = new CollisionWorld([...this.city.layout.colliders, ...this.garage.colliders()]);
  }

  /** From the home panel: change clothes (owned outfits only). */
  async changeOutfit(id: string) {
    const p = this.profile;
    if (!p.ownedClothes.includes(id) || !this.player) return;
    setProfile({ ...p, equipped: { outfit: id } });
    updateProfile({ equipped: { outfit: id } });
    const next = await Avatar.create(p.gender, id);
    if (this.disposed) return next.dispose();
    next.root.traverse((o) => { o.castShadow = !o.userData.glass; });
    const old = this.avatar!;
    this.avatar = next;
    const pl = new Player(next);
    pl.place(this.player.x, this.player.z, this.player.heading);
    this.player = pl;
    this.scene.add(next.root);
    old.dispose();
  }

  setSpawn(where: 'home' | 'apartment') {
    setProfile({ ...this.profile, spawn: where });
    updateProfile({ spawn: where });
  }

  /** Close the house panel / map and continue playing. */
  resume() { this.paused = false; }

  /** 📷 Photo mode on / off: everything stops, the camera turns around the car (or you) by dragging. */
  setPhotoMode(on: boolean) {
    this.photo = on;
    this.photoDist = this.mode === 'driving' ? 7 : 4.5;
    if (on) this.cockpit = false;
  }
  get photoMode() { return this.photo; }
  /** Photo mode: camera closer (-1) or further away (+1). */
  photoZoom(dir: number) { this.photoDist = THREE.MathUtils.clamp(this.photoDist + dir * 1.5, 2.5, 16); }

  /**
   * Takes the picture: renders the view once more and reads it back right away (same frame), as a big
   * JPEG for downloading and a small one for the photo album.
   */
  takePhoto(): { full: string; thumb: string } {
    this.renderer.render(this.scene, this.camera);
    const src = this.renderer.domElement;
    const scaled = (maxW: number, q: number) => {
      const k = Math.min(1, maxW / src.width), c = document.createElement('canvas');
      c.width = Math.round(src.width * k); c.height = Math.round(src.height * k);
      c.getContext('2d')!.drawImage(src, 0, 0, c.width, c.height);
      return c.toDataURL('image/jpeg', q);
    };
    return { full: scaled(1920, 0.9), thumb: scaled(360, 0.75) };
  }
  pause() { this.paused = true; }

  /** HUD buttons. (The E key does: context action first, otherwise get in/out.) */
  pressCar() { this.pendingCar = true; }
  pressContext() { this.pendingContext = true; }
  /** Second button (petting farm: brush the animal). */
  pressBrush() { this.pendingBrush = true; }

  /** Look through the binoculars at a bird by the pond (a new kind first); press again for another one. */
  private lookAtBird() {
    if (!this.wildlife || !this.player || this.mode !== 'walking') return;
    const p = this.profile;
    const b = this.wildlife.pick(p.birdsSeen, this.binoc?.kind, this.player);
    const fresh = !p.birdsSeen.includes(b.kind);
    const first = !this.binoc;
    this.binoc = { ...b, t: 8, fresh, x: this.player.x, z: this.player.z };
    this.wildlife.where(b, this.binocAim);
    if (first) this.binocLook.copy(this.binocAim); // start on the bird; later the view follows it smoothly
    if (!fresh) return;
    const birdsSeen = [...p.birdsSeen, b.kind];
    setProfile({ ...p, birdsSeen });
    void updateProfile({ birdsSeen });
    if (BIRD_KINDS.every((k) => birdsSeen.includes(k))) awardSticker('birdWatcher');
  }

  /**
   * Binocular view for this frame: from your eyes, zoomed in on the bird (narrow field of view). The normal
   * camera is put back right after rendering, so the follow camera and LOD don't notice.
   */
  private binocView(dt: number): boolean {
    const b = this.binoc, pl = this.player;
    if (!b || !pl || !this.wildlife) return false;
    b.t -= dt;
    // Walking away, time up, or anything else going on: put the binoculars down.
    if (b.t <= 0 || this.mode !== 'walking' || this.paused || this.photo || Math.hypot(pl.x - b.x, pl.z - b.z) > 1.2) { this.binoc = null; return false; }
    this.wildlife.where(b, this.binocAim);
    this.binocLook.lerp(this.binocAim, 1 - Math.exp(-dt * 6));
    const cam = this.camera, s = this.binocSave;
    s.pos.copy(cam.position); s.quat.copy(cam.quaternion); s.fov = cam.fov;
    cam.position.set(pl.x, pl.y + 1.5, pl.z);
    const dist = cam.position.distanceTo(this.binocLook);
    cam.fov = THREE.MathUtils.clamp(THREE.MathUtils.radToDeg(2 * Math.atan(1.4 / Math.max(1, dist))), 5, 35);
    cam.updateProjectionMatrix();
    cam.lookAt(this.binocLook);
    return true;
  }

  /** Brush the animal you're next to (€2): it sways contentedly and hearts float up; a sticker for every kind. */
  private brushAnimal() {
    const p = this.profile, pl = this.player!, a = this.farm?.nearest(pl.x, pl.z);
    if (!a || a.brushed > 0 || this.mode !== 'walking') return;
    if (p.money < BRUSH_PRICE) { this.events.onMessage('needMoney', BRUSH_PRICE - p.money); return; }
    const animalsBrushed = p.animalsBrushed.includes(a.kind) ? p.animalsBrushed : [...p.animalsBrushed, a.kind];
    setProfile({ ...p, money: p.money - BRUSH_PRICE, animalsBrushed });
    void updateProfile({ money: p.money - BRUSH_PRICE, animalsBrushed });
    this.events.onMoney(-BRUSH_PRICE, 'farm');
    this.farm!.brush(a, pl.x, pl.z);
    pl.heading = Math.atan2(a.x - pl.x, a.z - pl.z);
    this.avatar?.holdItem(brushGeometry());
    this.iceCreamTimer = 3; // put the brush away again after brushing
    sounds.coin();
    if (['goat', 'sheep', 'rabbit', 'pony'].every((k) => animalsBrushed.includes(k))) awardSticker('groomer');
  }

  // ---------------- main loop ----------------

  private loop = () => {
    this.raf = requestAnimationFrame(this.loop);
    const now = performance.now();
    const dt = Math.min((now - this.last) / 1000, 0.05);
    this.last = now;
    fitToCanvas(this.renderer, this.camera);
    if (!this.city || !this.vehicle || !this.player || !this.avatar || !this.world) return;
    this.save();

    this.input.poll(dt); // game controllers / steering wheel
    const ctx = this.context();
    const key = this.input.takeInteract();
    if (this.photo) {
      if (key) this.events.onPhotoKey?.(); // E / controller A: take the picture
    } else if (!this.paused) {
      if ((key || this.pendingContext) && ctx) this.doContext(ctx);
      else if ((key || this.pendingCar) && !this.ride) this.toggleCar();
    }
    const brushKey = this.input.takeAlt();
    if ((brushKey || this.pendingBrush) && !this.paused && ctx?.kind === 'feed') this.brushAnimal();
    this.pendingCar = this.pendingContext = this.pendingBrush = false;
    const look = this.input.takeLook();
    if (this.input.takeView() && this.mode === 'driving' && !this.paused) { this.cockpit = !this.cockpit; this.cockpitYaw = this.cockpitPitch = 0; }
    const inCockpit = this.cockpit && this.mode === 'driving';
    if (inCockpit) {
      // Look around a little from the seat (drag / right stick); it drifts back to straight ahead.
      this.cockpitYaw = THREE.MathUtils.clamp(this.cockpitYaw - look.dx * 0.005, -1.3, 1.3);
      this.cockpitPitch = THREE.MathUtils.clamp(this.cockpitPitch - look.dy * 0.004, -0.5, 0.35);
      if (!look.dx && !look.dy) { this.cockpitYaw *= 0.97; this.cockpitPitch *= 0.97; }
    } else this.follow.look(look.dx, look.dy);
    const jump = this.input.takeJump();
    const v = this.vehicle;
    const p = this.profile;

    // Fuel: an empty tank still lets you crawl (never stuck) to the gas station.
    v.limit = p.fuel <= 0 ? 4 : Infinity;
    // In the car wash the car stands still until it is done, then it shines for a while.
    if (this.washTimer > 0) {
      v.limit = 0;
      this.washTimer = Math.max(0, this.washTimer - dt);
      if (this.washTimer === 0) {
        this.setShine(true);
        this.shineTimer = 60;
        this.events.onMessage('washed');
        awardSticker('carWash');
      }
    }
    this.updateRace(dt);
    this.updateFishing(dt);
    if (this.shineTimer > 0) {
      this.shineTimer = Math.max(0, this.shineTimer - dt);
      if (this.shineTimer === 0) this.setShine(false);
    }
    if (p.fuel <= 0 && !this.fuelWarned) { this.fuelWarned = true; this.events.onMessage('fuelEmpty'); }
    if (p.fuel > 0.05) this.fuelWarned = false;

    const driveInput = this.input.drive();
    const driving = this.mode === 'driving' && !this.paused && !this.photo;
    // Hold to honk: the sound plays (and repeats) while the horn is held, and stops when released.
    const honk = this.input.hornHeld() && this.mode === 'driving' && !this.paused;
    if (honk && !this.honking) {
      sounds.hornStart(this.carHorn());
      this.people?.honk(v.x, v.z);
      awardSticker('honk');
      // Mission "honk at cars": counts when a traffic car is close by.
      if (this.traffic?.cars.some((c) => Math.hypot(c.x - v.x, c.z - v.z) < 25)) this.mission('honk');
    } else if (!honk && this.honking) sounds.hornStop();
    this.honking = honk;
    // R / 🚨 / controller RB: siren on or off (police car only).
    if (this.input.takeSiren() && this.mode === 'driving' && !this.paused && v.spec.siren) this.setSiren(!this.sirenOn);
    this.sirenLights?.update(dt);
    // Turn signals: same side again = off, other side = switch; off by itself once the turn is made.
    const blink = this.input.takeBlink();
    if (this.signals) {
      if (blink && this.mode === 'driving' && !this.paused) {
        this.signals.side = this.signals.side === blink ? null : blink;
        this.blinkTurned = 0;
        sounds.blinkerTick(true);
      }
      if (this.signals.update(dt)) sounds.blinkerTick(this.signals.side !== null && this.signals.group.children.some((c) => c.visible));
    }
    v.cap = this.maxKmh ? this.maxKmh / 3.6 : Infinity;
    sounds.engine(driving, v.kmh, driving ? driveInput.throttle : 0, !!v.spec.electric, v.spec.topSpeed);
    if (this.photo) {
      // Photo mode: the car rolls to a stop, the camera circles freely (drag / right stick).
      v.update(dt, null, this.world);
      if (this.mode === 'driving') this.focus.set(v.x, v.root.position.y + 1, v.z);
      else this.focus.set(this.player.x, this.player.y + 1.1, this.player.z);
      this.setCameraRange(false);
      this.follow.update(dt, this.focus, { behindYaw: null, distance: this.photoDist, pitch: 0.2, blocked: this.blocked });
    } else if (driving) {
      const before = { x: v.x, z: v.z };
      const h0 = v.heading;
      v.update(dt, driveInput, this.world); // you drive right through people: no stopping, no bump
      this.knockOver(v);
      this.bumpSoundTimer = Math.max(0, this.bumpSoundTimer - dt);
      this.crashTimer = Math.max(0, this.crashTimer - dt);
      if (v.wallHit) {
        if (this.bumpSoundTimer === 0) sounds.bump(Math.min(1, v.wallHit / 15));
        this.bumpSoundTimer = 0.4; // sliding along a wall doesn't keep thudding
        v.wallHit = 0;
      }
      if (this.signals?.side && this.signals.side !== 'both') { // hazard lights stay on until switched off
        // Left turns raise the heading, right turns lower it. Turned ~60° and the wheel is straight again: off.
        this.blinkTurned += (v.heading - h0) * (this.signals.side === 'left' ? 1 : -1);
        if (this.blinkTurned > 1.05 && Math.abs(driveInput.steer) < 0.15) this.signals.side = null;
      }
      const moved = Math.hypot(v.x - before.x, v.z - before.z);
      if (moved > 0) {
        this.meters += moved;
        const fuel = Math.max(0, p.fuel - moved / TANK_METERS);
        // Fresh profile, not `p` from the start of the frame: the horn may have just added a sticker.
        setProfile({ ...this.profile, fuel, km: p.km + moved / 1000 });
        this.dirty = true;
        while (this.meters >= 100) { this.meters -= 100; this.addMoney(KM_REWARD, 'km'); }
        this.missionDrive += moved;
        if (this.missionDrive >= 100) { this.mission('drive', this.missionDrive / 1000); this.missionDrive = 0; }
      }
      this.focus.set(v.x, v.root.position.y + 1.3, v.z);
      if (v.bumped > 0.25) this.shake = 0.25;
      if (this.cockpit) this.placeCockpitCamera(v);
      else this.setCameraRange(false);
      if (!this.cockpit) this.follow.update(dt, this.focus, {
        behindYaw: Math.abs(v.speed) > 0.5 ? v.heading + Math.PI + (v.speed < -0.5 ? Math.PI : 0) : null,
        distance: 7.5 + Math.min(v.kmh, 120) * 0.012, // only a little further back when fast
        pitch: 0.26,
        blocked: this.blocked,
      });
    } else {
      v.update(dt, null, this.world);
      if (this.ride) {
        // On a ride: the camera follows your gondola / horse (from the top of the wheel you see the whole city).
        this.ride.t += dt;
        this.avatar.root.getWorldPosition(this.focus);
        this.focus.y += 0.9;
        this.setCameraRange(false);
        if (this.ride.kind === 'sandboard' && this.sandboard) {
          // Walking with the tow, then standing on the board; the camera follows from behind.
          const ph = this.sandboard.phase;
          if (ph && ph !== this.sandboardAnim) { this.sandboardAnim = ph; this.avatar.play(ph === 'walk' ? 'Walk' : 'Idle', { fade: 0.25 }); }
          this.follow.update(dt, this.focus, { behindYaw: this.sandboard.seat.rotation.y + Math.PI, distance: 6.5, pitch: 0.28 });
        } else if (this.ride.kind === 'skate' && this.skate) {
          const rolling = this.skate.rolling;
          if (rolling !== this.skateRolling) { this.skateRolling = rolling; this.avatar.play(rolling ? 'Idle' : 'Walk', { fade: 0.2 }); }
          // Watch from the open side of the pipe, a little from above.
          const sp = this.city.layout.pois.skatePark;
          this.focus.set(sp.x, this.focus.y - 0.5, sp.z);
          this.follow.update(dt, this.focus, { behindYaw: 0, distance: 10.5, pitch: 0.32 });
        } else if (this.ride.kind === 'boat' && this.boat) {
          this.follow.update(dt, this.focus, { behindYaw: this.boat.heading + Math.PI, distance: 9, pitch: 0.3 });
        } else this.follow.update(dt, this.focus, { behindYaw: null, distance: this.ride.kind === 'wheel' ? 4.5 : this.ride.kind === 'balloon' ? 7 : 6, pitch: this.ride.kind === 'wheel' ? 0.2 : this.ride.kind === 'balloon' ? 0.3 : 0.35 });
        if (this.ride.t >= this.ride.dur) this.endRide();
      } else {
        const wx = this.player.x, wz = this.player.z;
        if (!this.paused) this.player.update(dt, this.input.walk(), jump, this.follow.yaw, this.world);
        this.missionWalk += Math.min(1, Math.hypot(this.player.x - wx, this.player.z - wz));
        if (this.missionWalk >= 10) { this.mission('walk', this.missionWalk); this.missionWalk = 0; }
        this.focus.set(this.player.x, this.player.y + 1.4, this.player.z);
        this.setCameraRange(false);
        // Watching fireworks near the stand: the camera looks out over the lake at sky level.
        const watching = this.fireworks?.active && Math.hypot(this.player.x - FIREWORKS_STAND.x, this.player.z - FIREWORKS_STAND.z) < 30;
        if (watching) this.focus.y += 10;
        this.follow.update(dt, this.focus, { behindYaw: null, distance: watching ? 9 : 5.5, pitch: watching ? 0.06 : 0.32, blocked: this.blocked });
      }
    }
    this.refuel(dt, ctx);
    if (this.shake > 0) {
      this.shake -= dt;
      this.camera.position.x += (Math.random() - 0.5) * this.shake * 0.4;
      this.camera.position.y += (Math.random() - 0.5) * this.shake * 0.4;
    }
    const pos = this.mode === 'driving' ? v : this.player;
    this.people?.update(dt, this.focus.x, this.focus.z, v, this.mode === 'walking' ? this.player : null);
    this.jobs?.update(dt, pos, this.mode === 'driving', v.kmh);
    this.traffic?.update(dt, this.focus, v, this.mode === 'walking' ? this.player : null, this.people, this.sirenOn);
    this.bumpTraffic();
    this.updateNav(dt, pos);
    this.updateArrow(dt, pos);
    // Carry the package in your arms while walking with a delivery.
    if (this.mode === 'walking' && this.jobs?.active && this.jobs.active.kind !== 'taxi') {
      const n = this.avatar.currentName;
      if (n === 'Walk' || n === 'Run') this.avatar.play(n === 'Walk' ? 'Walk_Carry' : 'Run_Carry', { fade: 0.2 });
    }
    this.yieldTimer = v.yielding ? 1.2 : Math.max(0, this.yieldTimer - dt);
    // In the dashboard view your own driver is hidden, so you look over the real dashboard.
    this.avatar.root.visible = !(this.cockpit && this.mode === 'driving') && !this.binoc; // (binoculars: you look from your own eyes)
    this.funFair?.update(dt);
    this.trafficLights?.update(dt);
    this.balloon?.update(dt);
    if (this.skate && (this.ride?.kind === 'skate' || Math.hypot(this.focus.x - this.city.layout.pois.skatePark.x, this.focus.z - this.city.layout.pois.skatePark.z) < 120)) this.skate.update(dt);
    if (this.boat && (this.ride?.kind === 'boat' || Math.hypot(this.focus.x - BOAT_FRONT.x, this.focus.z - (BOAT_FRONT.z + 200)) < 600)) this.boat.update(dt);
    if (this.sandboard && (this.ride?.kind === 'sandboard' || Math.hypot(this.focus.x - SANDBOARD_FRONT.x, this.focus.z - SANDBOARD_FRONT.z) < 300)) this.sandboard.update(dt);
    this.fireworks?.update(dt);
    this.updateSwimming(dt);
    this.updateFarCull(dt);
    if (this.iceTruck && this.traffic) {
      const obs = [...this.traffic.circles(), ...(this.people?.obstacles() ?? []), { x: v.x, z: v.z, r: v.width / 2 + 0.3 }, ...(this.mode === 'walking' && this.player ? [{ x: this.player.x, z: this.player.z, r: 0.6 }] : [])];
      this.iceTruck.update(dt, this.trafficLights, obs);
      this.traffic.obstacles = [this.iceTruck.body];
      // The jingle while it's parked, louder when you're close.
      const d = Math.hypot(this.focus.x - this.iceTruck.x, this.focus.z - this.iceTruck.z);
      this.jingleTimer -= dt;
      if (this.iceTruck.isParked && d < 90 && this.jingleTimer <= 0) { this.jingleTimer = 7; sounds.jingle(1 - d / 90); }
    }
    if (this.garden && Math.hypot(this.focus.x - this.city.layout.pois.home.garden.x, this.focus.z - this.city.layout.pois.home.garden.z) < 150) {
      const g = this.profile.garden;
      this.garden.update(g?.crop ?? null, g ? growth(g.crop, g.at) : 0);
    }
    // Kite: flies while you walk on the beach (not swimming, not on a ride); a minute up = sticker.
    if (this.kite && this.player && this.avatar) {
      const pl = this.player;
      const flying = this.profile.kite && this.mode === 'walking' && !this.ride && !pl.swimming && onBeach(pl.x, pl.z);
      const hand = new THREE.Vector3(pl.x + Math.cos(pl.heading) * 0.3, pl.y + 1.15, pl.z - Math.sin(pl.heading) * 0.3);
      if (this.kite.update(dt, flying, hand, pl.speed) && !this.kiteAwarded) { this.kiteAwarded = true; awardSticker('kite'); }
    }
    if (this.farm && Math.hypot(this.focus.x - PETTING.x, this.focus.z - PETTING.z) < 400) this.farm.update(dt);
    this.coins?.update(dt, this.ride ? null : pos, this.mode === 'driving' ? 3.5 : 2);
    this.chest?.update(dt, this.hasTreasureMap(), pos.x, pos.z);
    this.avatar.update(dt);
    this.updatePet(dt);
    // The clock runs on (one game minute per second); the light follows it.
    this.clock = (this.clock + dt) % 1440;
    SKY_TIME.value += dt;
    if (this.weather) {
      const hr = (this.clock / 60) % 24;
      this.weather.update(dt, this.camera, SKY.sunDir, hr >= 7 && hr < 18);
      sounds.rain(this.weather.amount);
      this.wipers?.update(dt, this.weather.amount);
      this.traffic?.setRain(this.weather.amount);
    }
    this.lightTimer -= dt;
    if (this.lightTimer <= 0) { this.lightTimer = 0.5; this.applyLight(); }
    this.sun.follow(this.focus);
    this.shareState();
    this.remote?.update(dt);
    for (const [id, k] of this.knownPlayers) {
      if (k.goneAt && Date.now() - k.goneAt > 6000) { this.knownPlayers.delete(id); this.events.onPlayer?.('left', cleanText(k.name, 20) || '?'); }
    }
    this.city.update(this.camera.position, dt);
    this.wildlife?.update(dt, this.camera.position, this.focus);
    this.grass?.update(dt, this.focus);
    this.carWash?.update(dt, this.camera.position, this.washTimer, v);
    if (this.iceCreamTimer > 0) {
      this.iceCreamTimer -= dt;
      if (this.iceCreamTimer <= 0) this.avatar.holdItem(null); // finished it
    }
    this.scaler.update(dt);
    const binoc = this.binocView(dt);
    this.renderer.render(this.scene, this.camera);
    if (binoc) {
      const s = this.binocSave;
      this.camera.position.copy(s.pos); this.camera.quaternion.copy(s.quat); this.camera.fov = s.fov;
      this.camera.updateProjectionMatrix();
    }
    if (this.cockpit && this.mode === 'driving') { this.renderMirror(v, 1); this.renderMirror(v, -1); }
    this.emitState(ctx);
  };

  /** Points the yellow arrow at the job destination, or at the gas station when fuel is low. */
  private updateArrow(dt: number, pos: { x: number; z: number }) {
    // Point at a spot on the route a little ahead, so the arrow shows where to turn.
    const target = this.nav?.lookAhead(22) ?? null;
    // While driving on the route, the arrows on the road guide you; the big floating
    // arrow only helps when walking or when you are far from the route.
    const onRoute = this.mode === 'driving' && (this.nav?.offRoute ?? 99) < 8;
    this.arrow.visible = !!target && (this.nav?.remaining ?? 0) > 12 && !onRoute;
    if (!target || !this.arrow.visible) return;
    const y = this.mode === 'driving' ? 2.7 : 2.4;
    this.arrow.position.set(pos.x, y + Math.sin(performance.now() / 300) * 0.15, pos.z);
    const want = Math.atan2(target.x - pos.x, target.z - pos.z);
    const diff = Math.atan2(Math.sin(want - this.arrow.rotation.y), Math.cos(want - this.arrow.rotation.y));
    this.arrow.rotation.y += diff * Math.min(1, dt * 8);
    this.arrow.scale.setScalar(this.mode === 'driving' ? 1.15 : 0.65);
  }

  private emitState(ctx: ContextAction | null) {
    const v = this.vehicle!, p = this.profile;
    const job = this.jobs?.active;
    const pos = this.mode === 'driving' ? v : this.player!;
    const state: GameState = {
      mode: this.mode,
      canEnter: this.canEnter(),
      kmh: Math.round(v.kmh),
      yielding: this.mode === 'driving' && this.yieldTimer > 0,
      fuel: Math.round(p.fuel * 100) / 100,
      refueling: this.refueling,
      washing: this.washTimer > 0,
      context: ctx,
      job: job ? { kind: job.kind, place: job.place, reward: job.reward, meters: Math.round((this.nav?.remaining || Math.hypot(job.x - pos.x, job.z - pos.z)) / 10) * 10, timeLeft: job.timeLeft === undefined ? undefined : Math.ceil(job.timeLeft), stop: job.stop, stops: job.stops } : null,
      dest: !job && this.dest ? { meters: Math.round((this.nav?.remaining ?? 0) / 10) * 10 } : null,
      topSpeed: v.spec.topSpeed,
      clock: this.clockText(),
      race: this.race ? { countdown: Math.ceil(this.race.count), time: this.race.t, gate: this.race.passed, total: CHECKPOINTS } : null,
      maxSpeed: this.maxKmh,
      blinker: this.mode === 'driving' ? this.signals?.side ?? null : null,
      cockpit: this.cockpit && this.mode === 'driving',
      mp: this.mp ? { room: this.mp.roomName, others: this.remote?.count ?? 0 } : null,
      police: this.mode === 'driving' && !!v.spec.siren,
      siren: this.sirenOn,
      binoc: this.binoc ? { kind: this.binoc.kind, fresh: this.binoc.fresh, seen: p.birdsSeen.length } : null,
    };
    const key = JSON.stringify(state);
    if (key !== this.lastState) {
      this.lastState = key;
      this.events.onState(state);
    }
  }

  /** Trees / lamp posts the car just hit tip over the way it drove, and come back later. */
  private bumpSoundTimer = 0;

  private knockOver(v: Vehicle) {
    const hits = this.world?.takeKnocked();
    if (!hits?.length || !this.city) return;
    const dx = Math.sin(v.heading) * Math.sign(v.speed || 1), dz = Math.cos(v.heading) * Math.sign(v.speed || 1);
    for (const b of hits) {
      const x = (b.x0 + b.x1) / 2, z = (b.z0 + b.z1) / 2;
      // Lean a little away from the car's middle too, so a tree hit with the corner falls to that side.
      const side = (x - v.x) * dz - (z - v.z) * dx;
      const sx = dx + dz * Math.sign(side) * 0.35, sz = dz - dx * Math.sign(side) * 0.35;
      this.lamps?.setLit(x, z, false);
      this.city.knock(x, z, sx, sz, () => { b.off = false; this.lamps?.setLit(x, z, true); });
    }
    // One sound per kind (several trees at once still sound like one crash).
    for (const kind of new Set(hits.map((b) => b.knock ?? 'tree'))) sounds.knock(kind, Math.min(1, Math.abs(v.speed) / 20));
    this.shake = Math.max(this.shake, 0.2);
  }

  private blocked = (x: number, z: number) => this.world!.pointBlocked(x, z);

  dispose() {
    this.disposed = true;
    sounds.stopEngine();
    sounds.sirenOff();
    sounds.hornStop();
    this.sirenLights?.dispose();
    this.signals?.dispose();
    this.offPlayers?.();
    this.remote?.dispose();
    this.mp?.leave();
    cancelAnimationFrame(this.raf);
    document.removeEventListener('visibilitychange', this.onHide);
    window.removeEventListener('pagehide', this.onHide);
    this.payFuel(true);
    this.save(true);
    this.jobs?.dispose();
    this.traffic?.dispose();
    this.nav?.dispose();
    this.people?.dispose();
    this.wildlife?.dispose();
    this.grass?.dispose();
    this.carWash?.dispose();
    this.iceStand?.dispose();
    this.chest?.dispose();
    if (this.postOffice) { this.postOffice.geometry.dispose(); (this.postOffice.material as THREE.Material).dispose(); this.postOffice.removeFromParent(); }
    this.supermarket?.dispose();
    this.petShop?.dispose();
    this.paintShop?.dispose();
    this.pizzeria?.dispose();
    this.busShelters?.dispose();
    this.farm?.dispose();
    this.bakery?.dispose();
    this.library?.dispose();
    this.funFair?.dispose();
    this.balloon?.dispose();
    this.sandboard?.dispose();
    this.boat?.dispose();
    this.weather?.dispose();
    this.iceTruck?.dispose();
    sounds.rain(0);
    this.skate?.dispose();
    this.kite?.dispose();
    this.garden?.dispose();
    this.fireworks?.dispose();
    this.beach?.dispose();
    this.coins?.dispose();
    this.raceTrack?.dispose();
    this.jetty?.dispose();
    this.pet?.dispose();
    this.garage?.dispose();
    this.lamps?.dispose();
    this.trafficLights?.dispose();
    if (this.turnLines) { this.turnLines.geometry.dispose(); (this.turnLines.material as THREE.Material).dispose(); this.turnLines.removeFromParent(); }
    this.highwaySigns?.dispose();
    // The sky colors are shared (also used by the menu backdrop): put the day colors back.
    SKY.zenith.set(DAY.zenith); SKY.horizon.set(DAY.horizon); SKY.sunDir.set(DAY.sunDir[0], DAY.sunDir[1], DAY.sunDir[2]).normalize();
    this.avatar?.dispose();
    this.vehicle?.dispose();
    this.city?.dispose();
    this.scene.environment?.dispose();
    this.renderer.dispose();
  }
}


/** A pet brush you hold while brushing (in the hand, pointing forward). */
function brushGeometry() {
  const wood = new THREE.BoxGeometry(0.06, 0.05, 0.3).translate(0, 0, 0.1);
  const head = new THREE.BoxGeometry(0.12, 0.05, 0.1).translate(0, -0.03, 0.27);
  const bristles = new THREE.BoxGeometry(0.11, 0.04, 0.09).translate(0, -0.07, 0.27);
  const paintG = (g: THREE.BufferGeometry, c: string) => {
    const geo = g.toNonIndexed(), col = new THREE.Color(c), n = geo.getAttribute('position').count, a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) a.set([col.r, col.g, col.b], i * 3);
    geo.setAttribute('color', new THREE.BufferAttribute(a, 3));
    return geo;
  };
  return mergeGeometries([paintG(wood, '#a0703f'), paintG(head, '#a0703f'), paintG(bristles, '#f2e6c9')])!;
}
