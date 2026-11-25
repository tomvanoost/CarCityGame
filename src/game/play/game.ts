import * as THREE from 'three';
import { createRenderer, fitToCanvas } from '../../engine/renderer';
import type { PlayerProfile } from '../../services/types';
import { Avatar } from '../avatar/avatar';
import { buildCity, type City } from '../city/cityBuilder';
import { getVehicle } from '../vehicles/catalog';
import { createSky, skyEnvironment, SKY, Sun } from '../world/sky';
import { pickQuality, ResolutionScaler } from '../world/quality';
import { CollisionWorld } from './collision';
import { FollowCamera } from './followCamera';
import type { Input } from './input';
import { Pedestrians } from './pedestrians';
import { Player } from './player';
import { Vehicle } from './vehicle';

export type Mode = 'driving' | 'walking';

export interface GameState { mode: Mode; canEnter: boolean; kmh: number; yielding: boolean }

export interface GameEvents {
  onProgress(p: number): void;
  onReady(): void;
  /** Mode changed, or whether "get in" is possible changed. */
  onState(state: GameState): void;
}

/** Distance from the car within which you can get in. */
const ENTER_DISTANCE = 4;

/** The playable game: city + your car + your avatar + camera, driven by Input. */
export class Game {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(55, 1, 0.5, 6000);
  private follow = new FollowCamera(this.camera);
  private sun: Sun;
  private scaler: ResolutionScaler;
  private city?: City;
  private world?: CollisionWorld;
  vehicle?: Vehicle;
  people?: Pedestrians;
  player?: Player;
  avatar?: Avatar;
  mode: Mode = 'driving';
  private raf = 0;
  private last = performance.now();
  private disposed = false;
  private lastState = '';
  private focus = new THREE.Vector3();
  private shake = 0;
  private peopleCount = 24;
  private yieldTimer = 0;

  constructor(canvas: HTMLCanvasElement, private input: Input, private profile: PlayerProfile, private events: GameEvents) {
    const q = pickQuality();
    this.peopleCount = q.name === 'high' ? 36 : 22;
    this.renderer = createRenderer(canvas, { shadows: true });
    this.scaler = new ResolutionScaler(this.renderer, q.maxPixelRatio);
    this.scene.fog = new THREE.Fog(SKY.horizon, q.fogNear, q.fogFar);
    this.scene.environment = skyEnvironment(this.renderer);
    this.scene.environmentIntensity = 0.7;
    this.scene.add(createSky());
    this.sun = new Sun(this.renderer, q.shadowSize, q.shadowMap);
    this.sun.addTo(this.scene);
    this.load(q);
    this.loop();
  }

  private async load(q: ReturnType<typeof pickQuality>) {
    const [city, avatar] = await Promise.all([
      buildCity(q, (p) => this.events.onProgress(p * 0.95)),
      Avatar.create(this.profile.gender, this.profile.equipped.outfit),
    ]);
    if (this.disposed) { city.dispose(); avatar.dispose(); return; }
    this.city = city;
    this.avatar = avatar;
    this.scene.add(city.group);
    this.world = new CollisionWorld(city.layout.colliders);

    const vehicle = new Vehicle(getVehicle(this.profile.selectedVehicle));
    const spawn = city.layout.pois.spawn;
    vehicle.place(spawn.x, spawn.z, spawn.rot);
    this.scene.add(vehicle.root);
    this.vehicle = vehicle;
    this.player = new Player(avatar);
    avatar.root.traverse((o) => { o.castShadow = true; });
    this.seatAvatar();
    this.follow.yaw = spawn.rot + Math.PI;
    this.focus.set(spawn.x, 1.2, spawn.z);
    this.follow.update(0, this.focus, { behindYaw: this.follow.yaw, distance: 8, pitch: 0.28, snap: true });
    this.sun.follow(this.focus, true);
    this.events.onProgress(1);
    this.events.onReady();
    // People load in the background after the city is visible.
    this.people = new Pedestrians(city.layout, this.world, this.peopleCount);
    this.scene.add(this.people.group);
    this.people.load();
  }

  /** Put the avatar in the driver's seat, sitting. */
  private seatAvatar() {
    const v = this.vehicle!, a = this.avatar!;
    v.car.root.add(a.root);
    a.root.position.set(v.car.seat.x, 0.02, v.car.seat.z - 0.1);
    a.root.rotation.set(0, 0, 0);
    a.root.scale.setScalar(0.74);
    a.play('SitDown', { once: true, fade: 0.2, then: null });
    this.mode = 'driving';
  }

  /** E / tap the button: get in or out of the car. */
  private toggleCar() {
    const v = this.vehicle!, a = this.avatar!, p = this.player!;
    if (this.mode === 'driving') {
      if (v.kmh > 8) return; // first slow down
      v.speed = 0;
      const door = v.localToWorld(v.width / 2 + 0.9, v.car.seat.z);
      this.scene.add(a.root);
      a.root.scale.setScalar(1);
      p.place(door.x, door.z, v.heading + Math.PI / 2);
      a.play('StandUp', { once: true, fade: 0.15, then: 'Idle' });
      this.mode = 'walking';
    } else if (this.canEnter()) {
      this.seatAvatar();
      this.follow.look(0, 0);
    }
  }

  private canEnter() {
    if (this.mode !== 'walking' || !this.vehicle || !this.player) return false;
    return Math.hypot(this.player.x - this.vehicle.x, this.player.z - this.vehicle.z) < ENTER_DISTANCE;
  }

  private loop = () => {
    this.raf = requestAnimationFrame(this.loop);
    const now = performance.now();
    const dt = Math.min((now - this.last) / 1000, 0.05);
    this.last = now;
    fitToCanvas(this.renderer, this.camera);
    if (!this.city || !this.vehicle || !this.player || !this.avatar || !this.world) return;

    if (this.input.takeInteract()) this.toggleCar();
    const look = this.input.takeLook();
    this.follow.look(look.dx, look.dy);
    const jump = this.input.takeJump();

    const v = this.vehicle;
    if (this.mode === 'driving') {
      v.update(dt, this.input.drive(), this.world, this.people?.obstacles());
      this.focus.set(v.x, v.root.position.y + 1.3, v.z);
      if (v.bumped > 0.25) this.shake = 0.25;
      this.follow.update(dt, this.focus, {
        behindYaw: Math.abs(v.speed) > 0.5 ? v.heading + Math.PI + (v.speed < -0.5 ? Math.PI : 0) : null,
        distance: 7.5 + v.kmh * 0.03,
        pitch: 0.26,
        blocked: this.blocked,
      });
    } else {
      v.update(dt, null, this.world, this.people?.obstacles());
      this.player.update(dt, this.input.walk(), jump, this.follow.yaw, this.world);
      this.focus.set(this.player.x, this.player.y + 1.4, this.player.z);
      this.follow.update(dt, this.focus, { behindYaw: null, distance: 5.5, pitch: 0.32, blocked: this.blocked });
    }
    if (this.shake > 0) {
      this.shake -= dt;
      this.camera.position.x += (Math.random() - 0.5) * this.shake * 0.4;
      this.camera.position.y += (Math.random() - 0.5) * this.shake * 0.4;
    }
    this.people?.update(dt, this.focus.x, this.focus.z, v, this.mode === 'walking' ? this.player : null);
    this.yieldTimer = v.yielding ? 1.2 : Math.max(0, this.yieldTimer - dt);
    this.avatar.update(dt);
    this.sun.follow(this.focus);
    this.city.update(this.camera.position, dt);
    this.scaler.update(dt);
    this.renderer.render(this.scene, this.camera);

    const state: GameState = { mode: this.mode, canEnter: this.canEnter(), kmh: Math.round(v.kmh), yielding: this.mode === 'driving' && this.yieldTimer > 0 };
    const key = `${state.mode}|${state.canEnter}|${state.kmh}|${state.yielding}`;
    if (key !== this.lastState) {
      this.lastState = key;
      this.events.onState(state);
    }
  };

  private blocked = (x: number, z: number) => this.world!.pointBlocked(x, z);

  /** Called by the HUD button (same as pressing E). */
  interact() { this.input.queueInteract(); }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.people?.dispose();
    this.avatar?.dispose();
    this.vehicle?.dispose();
    this.city?.dispose();
    this.scene.environment?.dispose();
    this.renderer.dispose();
  }
}
