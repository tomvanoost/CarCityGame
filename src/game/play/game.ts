import * as THREE from 'three';
import { createRenderer, fitToCanvas } from '../../engine/renderer';
import { getProfile, setProfile, updateProfile } from '../../services/session';
import type { PlayerProfile } from '../../services/types';
import { Avatar } from '../avatar/avatar';
import { buildCity, type City } from '../city/cityBuilder';
import { HALF_CITY, LINES } from '../city/layout';
import { getVehicle } from '../vehicles/catalog';
import { SEATED_SCALE, seatedRootPosition } from '../vehicles/carBuilder';
import { createSky, skyEnvironment, SKY, Sun } from '../world/sky';
import { pickQuality, ResolutionScaler } from '../world/quality';
import { CollisionWorld } from './collision';
import { FollowCamera } from './followCamera';
import type { Input } from './input';
import { Jobs, type ActiveJob, type PlaceKey } from './jobs';
import { createArrow, createIcon } from './markers';
import { Navigator } from './navigation';
import { Pedestrians } from './pedestrians';
import { Wildlife } from './wildlife';
import { CarWash, WASH_PRICE, WASH_TIME } from './carWash';
import { Garage, type GarageSpot } from './garage';
import { DAY, EVENING, headlightRig, loadEvening, saveEvening, SirenLights, StreetLamps, TurnSignals } from '../world/evening';
import { SKETCHFAB_VEHICLES } from '../vehicles/sketchfabManifest';
import type { MpSession } from '../../services/multiplayer';
import { RemotePlayers } from './remotePlayers';
import type { VehicleSpec } from '../vehicles/types';
import { awardSticker } from '../../ui/stickers';
import { RoadGraph, type P } from './roads';
import { Traffic } from './traffic';
import { Player } from './player';
import { Vehicle } from './vehicle';
import { sounds } from './sounds';

export type Mode = 'driving' | 'walking';

/** Something you can do right here with the big blue button. */
export type ContextAction = { kind: 'refuel' } | { kind: 'wash'; price: number } | { kind: 'takeCar'; id: string } | { kind: 'home' } | { kind: 'apartment' } | { kind: 'buyApartment'; price: number };

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
  job: { kind: ActiveJob['kind']; place: PlaceKey; reward: number; meters: number } | null;
  /** Navigation to a destination you picked on the map. */
  dest: { meters: number } | null;
  /** The car's real top speed and the player's own max speed (🏁), km/h; null = no limit. */
  topSpeed: number;
  maxSpeed: number | null;
  /** Multiplayer: server name and how many other players are there (null when playing alone). */
  mp: { room: string; others: number } | null;
  /** Turn signal that is blinking right now. */
  blinker: 'left' | 'right' | null;
  /** Driving an emergency vehicle (shows the 🚨 button), and whether its siren is on. */
  police: boolean;
  siren: boolean;
}

/** Everything the minimap / big map needs to draw. */
export interface MapState {
  x: number;
  z: number;
  heading: number;
  path: P[];
  job: P | null;
  dest: P | null;
}

export interface GameEvents {
  onProgress(p: number): void;
  onReady(): void;
  onState(state: GameState): void;
  /** Money earned (shown as a big "+€" popup). */
  onMoney(amount: number, reason: 'job' | 'daily' | 'apartment' | 'fuel' | 'wash'): void;
  onJobStart(job: ActiveJob): void;
  /** Player walked into the house/apartment. */
  onPlace(place: 'home' | 'apartment'): void;
  /** Short message (i18n key + optional number). */
  onMessage(key: 'needMoney' | 'freeFuel' | 'fuelEmpty' | 'arrived' | 'washed', n?: number): void;
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
  garage?: Garage;
  lamps?: StreetLamps;
  /** Soft evening light on (street lamps and headlights glow). */
  evening = loadEvening();
  jobs?: Jobs;
  traffic?: Traffic;
  roads?: RoadGraph;
  private nav?: Navigator;
  /** Destination picked on the big map. */
  private dest: P | null = null;
  private trafficCount = 8;
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
  private honking = false;
  /** Police car: flashing lights on its roof, and whether the siren is on. */
  private sirenLights?: SirenLights;
  private sirenOn = false;
  /** Turn signals (1 / 2, d-pad left / right); they switch off by themselves after the turn. */
  private signals?: TurnSignals;
  private blinkTurned = 0;
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
    this.renderer = createRenderer(canvas, { shadows: q.shadowMap > 0, antialias: q.antialias });
    this.scaler = new ResolutionScaler(this.renderer, q.maxPixelRatio, q.minPixelRatio);
    this.scene.fog = new THREE.Fog(SKY.horizon, q.fogNear, q.fogFar);
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
    this.carWash = new CarWash(city.layout);
    this.scene.add(this.carWash.group);
    this.lamps = new StreetLamps(city.layout);
    this.scene.add(this.lamps.group);
    if (this.evening) this.applyLight();
    this.jobs = new Jobs(city.layout, {
      onStart: (job) => this.events.onJobStart(job),
      onDone: (job) => {
        this.addMoney(job.reward, 'job');
        const p = this.profile;
        void updateProfile(job.kind === 'delivery' ? { deliveries: p.deliveries + 1 } : { taxiRides: p.taxiRides + 1 });
      },
    });
    this.scene.add(this.jobs.group);
    // Roads, navigation and friendly traffic.
    this.roads = new RoadGraph(city.layout);
    this.nav = new Navigator(this.roads);
    this.scene.add(this.nav.arrows);
    this.traffic = new Traffic(this.roads, this.trafficCount);
    this.scene.add(this.traffic.group);
    this.traffic.setLights(this.evening);
  }

  /** Pick a destination (from the big map), or null to stop navigating. */
  setDestination(p: P | null) { this.dest = p; }

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

  /** Decide where to navigate: a job first, then your map destination, then fuel. */
  private updateNav(dt: number, pos: P) {
    if (!this.nav) return;
    if (this.dest && Math.hypot(pos.x - this.dest.x, pos.z - this.dest.z) < 14) {
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
    this.scene.add(v.root);
    this.vehicle = v;
  }

  // ---------------- money ----------------

  private addMoney(amount: number, reason: 'job' | 'daily' | 'apartment' | 'fuel' | 'km') {
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

  /** Saves money/fuel/km at most every few seconds (and on exit). */
  private save(force = false) {
    if (!this.dirty) return;
    // Real time (not game time), so slow devices still save every few seconds.
    const now = performance.now();
    if (!force && now - this.lastSave < 4000) return;
    this.lastSave = now;
    this.dirty = false;
    const p = this.profile;
    updateProfile({ money: Math.round(p.money), fuel: Math.round(p.fuel * 1000) / 1000, km: Math.round(p.km * 10) / 10 });
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
    this.offPlayers = session.onPlayers((players) => this.remote?.sync(players));
  }

  private shareState() {
    const v = this.vehicle, pl = this.player, p = this.profile;
    if (!this.mp || !v || !pl) return;
    const driving = this.mode === 'driving';
    this.mp.publish({
      name: p.username, gender: p.gender, outfit: p.equipped.outfit, vehicle: v.spec.id,
      color: p.vehicleColors[v.spec.id] ?? v.spec.color, mode: this.mode,
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
      if (this.carWash?.inside(v.x, v.z) && (v.kmh < 4 || this.washTimer > 0)) return { kind: 'wash', price: WASH_PRICE };
      const c = L.gas.canopy;
      const under = v.x > c.x0 - 2 && v.x < c.x1 + 2 && v.z > c.z0 - 2 && v.z < c.z1 + 2;
      if (under && v.kmh < 4 && (this.profile.fuel < 0.98 || this.refueling)) return { kind: 'refuel' };
      return null;
    }
    const p = this.player;
    const near = (d: { x: number; z: number }) => Math.hypot(p.x - d.x, p.z - d.z) < 3.2;
    if (near(L.pois.home.door)) return { kind: 'home' };
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
        break;
      }
      case 'takeCar': {
        const spot = this.garage?.near(this.player!.x, this.player!.z)?.spot;
        if (spot) void this.takeCar(c.id, spot);
        break;
      }
      case 'home':
      case 'apartment':
        this.paused = true;
        this.events.onPlace(c.kind);
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
    this.evening = on;
    saveEvening(on);
    this.applyLight();
  }

  private applyLight() {
    const L = this.evening ? EVENING : DAY;
    SKY.zenith.set(L.zenith);
    SKY.horizon.set(L.horizon);
    SKY.sunDir.set(L.sunDir[0], L.sunDir[1], L.sunDir[2]).normalize();
    (this.scene.fog as THREE.Fog).color.copy(SKY.horizon);
    this.sun.light.color.set(L.sun);
    this.sun.light.intensity = L.sunI;
    this.sun.hemi.color.set(L.hemiSky);
    this.sun.hemi.groundColor.set(L.hemiGround);
    this.sun.hemi.intensity = L.hemiI;
    // Reflections come from the sky: bake them again for the new colors (only when switching).
    const old = this.scene.environment;
    this.scene.environment = skyEnvironment(this.renderer);
    old?.dispose();
    this.scene.environmentIntensity = L.env;
    this.sun.follow(this.focus, true);
    if (this.lamps) this.lamps.group.visible = this.evening;
    const head = this.vehicle?.root.getObjectByName('CCG_HEADLIGHTS');
    if (head) head.visible = this.evening;
    this.traffic?.setLights(this.evening);
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
  pause() { this.paused = true; }

  /** HUD buttons. (The E key does: context action first, otherwise get in/out.) */
  pressCar() { this.pendingCar = true; }
  pressContext() { this.pendingContext = true; }

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
    if (!this.paused) {
      if ((key || this.pendingContext) && ctx) this.doContext(ctx);
      else if (key || this.pendingCar) this.toggleCar();
    }
    this.pendingCar = this.pendingContext = false;
    const look = this.input.takeLook();
    this.follow.look(look.dx, look.dy);
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
    if (this.shineTimer > 0) {
      this.shineTimer = Math.max(0, this.shineTimer - dt);
      if (this.shineTimer === 0) this.setShine(false);
    }
    if (p.fuel <= 0 && !this.fuelWarned) { this.fuelWarned = true; this.events.onMessage('fuelEmpty'); }
    if (p.fuel > 0.05) this.fuelWarned = false;

    const driveInput = this.input.drive();
    const driving = this.mode === 'driving' && !this.paused;
    // Hold to honk: the sound plays (and repeats) while the horn is held, and stops when released.
    const honk = this.input.hornHeld() && this.mode === 'driving' && !this.paused;
    if (honk && !this.honking) {
      sounds.hornStart();
      this.people?.honk(v.x, v.z);
      awardSticker('honk');
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
    sounds.engine(driving, v.kmh, driving ? driveInput.throttle : 0, !!v.spec.electric);
    if (driving) {
      const before = { x: v.x, z: v.z };
      const h0 = v.heading;
      v.update(dt, driveInput, this.world); // you drive right through people: no stopping, no bump
      if (this.signals?.side) {
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
      }
      this.focus.set(v.x, v.root.position.y + 1.3, v.z);
      if (v.bumped > 0.25) this.shake = 0.25;
      this.follow.update(dt, this.focus, {
        behindYaw: Math.abs(v.speed) > 0.5 ? v.heading + Math.PI + (v.speed < -0.5 ? Math.PI : 0) : null,
        distance: 7.5 + Math.min(v.kmh, 160) * 0.03,
        pitch: 0.26,
        blocked: this.blocked,
      });
    } else {
      v.update(dt, null, this.world);
      if (!this.paused) this.player.update(dt, this.input.walk(), jump, this.follow.yaw, this.world);
      this.focus.set(this.player.x, this.player.y + 1.4, this.player.z);
      this.follow.update(dt, this.focus, { behindYaw: null, distance: 5.5, pitch: 0.32, blocked: this.blocked });
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
    if (this.mode === 'walking' && this.jobs?.active?.kind === 'delivery') {
      const n = this.avatar.currentName;
      if (n === 'Walk' || n === 'Run') this.avatar.play(n === 'Walk' ? 'Walk_Carry' : 'Run_Carry', { fade: 0.2 });
    }
    this.yieldTimer = v.yielding ? 1.2 : Math.max(0, this.yieldTimer - dt);
    this.avatar.update(dt);
    this.sun.follow(this.focus);
    this.shareState();
    this.remote?.update(dt);
    this.city.update(this.camera.position, dt);
    this.wildlife?.update(dt, this.camera.position, this.focus);
    this.carWash?.update(dt, this.camera.position, this.washTimer, v);
    this.scaler.update(dt);
    this.renderer.render(this.scene, this.camera);
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
      job: job ? { kind: job.kind, place: job.place, reward: job.reward, meters: Math.round((this.nav?.remaining || Math.hypot(job.x - pos.x, job.z - pos.z)) / 10) * 10 } : null,
      dest: !job && this.dest ? { meters: Math.round((this.nav?.remaining ?? 0) / 10) * 10 } : null,
      topSpeed: v.spec.topSpeed,
      maxSpeed: this.maxKmh,
      blinker: this.mode === 'driving' ? this.signals?.side ?? null : null,
      mp: this.mp ? { room: this.mp.roomName, others: this.remote?.count ?? 0 } : null,
      police: this.mode === 'driving' && !!v.spec.siren,
      siren: this.sirenOn,
    };
    const key = JSON.stringify(state);
    if (key !== this.lastState) {
      this.lastState = key;
      this.events.onState(state);
    }
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
    this.carWash?.dispose();
    this.garage?.dispose();
    this.lamps?.dispose();
    // The sky colors are shared (also used by the menu backdrop): put the day colors back.
    SKY.zenith.set(DAY.zenith); SKY.horizon.set(DAY.horizon); SKY.sunDir.set(DAY.sunDir[0], DAY.sunDir[1], DAY.sunDir[2]).normalize();
    this.avatar?.dispose();
    this.vehicle?.dispose();
    this.city?.dispose();
    this.scene.environment?.dispose();
    this.renderer.dispose();
  }
}

