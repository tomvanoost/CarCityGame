import * as THREE from 'three';
import { cleanText } from '../../services/textFilter';
import type { RemotePlayer } from '../../services/multiplayer';
import { Avatar } from '../avatar/avatar';
import { getVehicle } from '../vehicles/catalog';
import { SEATED_SCALE, seatedRootPosition, type BuiltCar } from '../vehicles/carBuilder';
import { loadVehicle, vehicleDims } from '../vehicles/factory';
import { SKETCHFAB_VEHICLES } from '../vehicles/sketchfabManifest';
import { SirenLights, TurnSignals } from '../world/evening';
import { groundHeight } from './collision';

interface Entry {
  target: RemotePlayer;
  x: number; z: number; h: number;
  root: THREE.Group;
  car?: BuiltCar; carKey: string; carRoot?: THREE.Group;
  avatar?: Avatar; avatarKey: string; seated: boolean;
  siren?: SirenLights; signals?: TurnSignals;
  label: THREE.Sprite;
  bubble?: THREE.Sprite;
  bubbleUntil: number;
  /** Load counters (separate for car and avatar: they load at the same time). */
  carLoad: number;
  avatarLoad: number;
}

/** A name tag above a player's head: white bubble with the (filtered) name. */
function nameTag(name: string): THREE.Sprite {
  const text = cleanText(name, 20) || '?';
  const c = document.createElement('canvas');
  const g0 = c.getContext('2d')!;
  g0.font = '800 30px Nunito, sans-serif';
  // The canvas (and the sprite) grows with the name, so long names are never cut off.
  const w = Math.ceil(g0.measureText(text).width) + 40;
  c.width = Math.max(128, w); c.height = 64;
  const g = c.getContext('2d')!;
  g.font = '800 30px Nunito, sans-serif';
  g.fillStyle = 'rgba(255,255,255,0.92)';
  g.beginPath(); g.roundRect((c.width - w) / 2, 8, w, 48, 24); g.fill();
  g.fillStyle = '#1d2b44'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, c.width / 2, 33);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false, fog: false }));
  s.scale.set(0.6 * (c.width / 64), 0.6, 1);
  s.renderOrder = 4;
  return s;
}

const angleLerp = (a: number, b: number, k: number) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * k;

/**
 * The other players in a multiplayer server: their car or their avatar walking,
 * with a name tag, siren lights and turn signals. Positions arrive a few times per second and are
 * smoothed (and predicted a little from the speed) so everyone moves fluently.
 * They are "ghosts" like the people in the city: you drive right through them.
 */
export class RemotePlayers {
  readonly group = new THREE.Group();
  private entries = new Map<string, Entry>();
  private disposed = false;

  get count() { return this.entries.size; }

  /** Where everyone is now (smoothed), with their cleaned name: for the minimap and navigation. */
  positions(): { id: string; name: string; x: number; z: number }[] {
    return [...this.entries].map(([id, e]) => ({ id, name: cleanText(e.target.name, 20) || '?', x: e.x, z: e.z }));
  }

  sync(players: Map<string, RemotePlayer>) {
    for (const [id, p] of players) {
      const e = this.entries.get(id);
      if (e) { e.target = p; continue; }
      const root = new THREE.Group();
      const label = nameTag(p.name);
      root.add(label);
      this.group.add(root);
      this.entries.set(id, { target: p, x: p.x, z: p.z, h: p.h, root, carKey: '', avatarKey: '', seated: false, label, bubbleUntil: 0, carLoad: 0, avatarLoad: 0 });
    }
    for (const [id, e] of this.entries) if (!players.has(id)) { this.remove(e); this.entries.delete(id); }
  }

  /** A speech bubble with a chat line or an emote above a player, for 5 seconds. */
  showBubble(id: string, text: string, emote: boolean) {
    const e = this.entries.get(id);
    if (!e) return;
    this.clearBubble(e);
    const c = document.createElement('canvas');
    c.width = 512; c.height = 128;
    const g = c.getContext('2d')!;
    g.font = emote ? '72px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif' : '700 34px Nunito, sans-serif';
    const w = Math.min(500, g.measureText(text).width + 48);
    g.fillStyle = 'rgba(255,255,255,0.96)';
    g.beginPath(); g.roundRect((512 - w) / 2, 6, w, 96, 30); g.fill();
    g.beginPath(); g.moveTo(240, 100); g.lineTo(272, 100); g.lineTo(256, 122); g.fill();
    g.fillStyle = '#1d2b44'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, 256, 56, 470);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false, fog: false }));
    sprite.scale.set(4, 1, 1);
    sprite.renderOrder = 5;
    e.root.add(sprite);
    e.bubble = sprite;
    e.bubbleUntil = Date.now() + 5000;
  }

  private clearBubble(e: Entry) {
    if (!e.bubble) return;
    e.bubble.material.map?.dispose();
    e.bubble.material.dispose();
    e.bubble.removeFromParent();
    e.bubble = undefined;
  }

  private remove(e: Entry) {
    this.clearBubble(e);
    e.carLoad++; e.avatarLoad++;
    e.car?.dispose();
    e.avatar?.dispose();
    e.siren?.dispose();
    e.signals?.dispose();
    e.label.material.map?.dispose();
    e.label.material.dispose();
    e.root.removeFromParent();
  }

  /** (Re)load the car and avatar when the player picks another car or outfit. */
  private async refresh(e: Entry) {
    const p = e.target;
    const carKey = `${p.vehicle}/${p.color}`, avatarKey = `${p.gender}/${p.outfit}`;
    if (carKey !== e.carKey) {
      e.carKey = carKey;
      const id = ++e.carLoad;
      const spec = getVehicle(p.vehicle);
      // The detailed model: there are only a few players, and the light traffic version has a lower,
      // simpler roof (the driver's hair would stick out) and loses the emergency vehicles' livery.
      const car = await loadVehicle(spec, p.color).catch(() => null);
      if (!car || id !== e.carLoad || this.disposed) { car?.dispose(); return; }
      e.car?.dispose(); e.siren?.dispose(); e.signals?.dispose();
      e.carRoot?.removeFromParent();
      e.car = car;
      const holder = new THREE.Group();
      holder.add(car.root);
      const dims = vehicleDims(spec);
      e.signals = new TurnSignals(dims.length, dims.width);
      holder.add(e.signals.group);
      if (spec.siren) {
        const height = SKETCHFAB_VEHICLES[spec.id]?.height ?? 1.4;
        const z = spec.siren === 'fire' ? dims.length / 2 - 0.9 : spec.siren === 'ambulance' ? dims.length / 2 - 2.3 : -0.15;
        e.siren = new SirenLights(dims.width, height - 0.05, z, spec.siren === 'police' ? ['#ff2a2a', '#2a6bff'] : spec.siren === 'fire' ? ['#ff2a2a', '#ff5a1a'] : ['#2a6bff', '#3aa0ff']);
        holder.add(e.siren.group);
      }
      e.carRoot = holder;
      e.root.add(holder);
      e.seated = false;
    }
    if (avatarKey !== e.avatarKey) {
      e.avatarKey = avatarKey;
      const id = ++e.avatarLoad;
      const avatar = await Avatar.create(p.gender, p.outfit).catch(() => null);
      if (!avatar || id !== e.avatarLoad || this.disposed) { avatar?.dispose(); return; }
      e.avatar?.dispose();
      e.avatar = avatar;
      avatar.root.traverse((o) => { o.castShadow = !o.userData.glass; });
      e.seated = false;
    }
  }

  update(dt: number) {
    const now = Date.now();
    for (const e of this.entries.values()) {
      const p = e.target;
      if (`${p.vehicle}/${p.color}` !== e.carKey || `${p.gender}/${p.outfit}` !== e.avatarKey) void this.refresh(e);
      // Predict a little from the speed (updates arrive ~6 times a second), then glide there.
      const ahead = Math.min(0.4, (now - p.at) / 1000);
      const tx = p.x + Math.sin(p.h) * p.v * ahead, tz = p.z + Math.cos(p.h) * p.v * ahead;
      const k = 1 - Math.exp(-dt * 8);
      if (Math.hypot(tx - e.x, tz - e.z) > 25) { e.x = tx; e.z = tz; e.h = p.h; } // teleported / respawned
      else { e.x += (tx - e.x) * k; e.z += (tz - e.z) * k; e.h = angleLerp(e.h, p.h, k); }
      const y = groundHeight(e.x, e.z);
      e.root.position.set(e.x, y, e.z);
      const driving = p.mode === 'driving';
      if (e.carRoot) {
        e.carRoot.visible = driving;
        e.carRoot.rotation.y = e.h;
      }
      if (e.siren) { e.siren.on = driving && p.siren; e.siren.update(dt); }
      if (e.signals) { e.signals.side = driving ? p.blink : null; e.signals.update(dt); }
      const a = e.avatar;
      if (a) {
        if (driving && e.car) {
          if (!e.seated) {
            e.car.root.add(a.root);
            const scale = e.car.seatScale ?? SEATED_SCALE;
            a.root.position.copy(seatedRootPosition(e.car.seat, scale));
            a.root.rotation.set(0, 0, 0);
            a.root.scale.setScalar(scale);
            a.setTallGear(false);
            a.play('SitDown', { once: true, then: null });
            e.seated = true;
          }
        } else {
          if (e.seated || a.root.parent !== e.root) {
            e.root.add(a.root);
            a.root.position.set(0, 0, 0);
            a.root.scale.setScalar(1);
            a.setTallGear(true);
            e.seated = false;
          }
          a.root.rotation.y = e.h;
          const speed = Math.abs(p.v);
          a.play(speed > 3.2 ? 'Run' : speed > 0.3 ? 'Walk' : 'Idle');
        }
        a.update(dt);
      }
      e.label.position.set(0, driving ? (SKETCHFAB_VEHICLES[p.vehicle]?.height ?? 1.5) + 0.7 : 2.2, 0);
      if (e.bubble) {
        if (now > e.bubbleUntil) this.clearBubble(e);
        else e.bubble.position.set(0, e.label.position.y + 0.9, 0);
      }
    }
  }

  dispose() {
    this.disposed = true;
    for (const e of this.entries.values()) this.remove(e);
    this.entries.clear();
    this.group.removeFromParent();
  }
}
