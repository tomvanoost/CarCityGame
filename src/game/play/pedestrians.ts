import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { loadClips, loadGltf } from '../../engine/assets';
import { animsUrl, outfitUrl, type OutfitModel } from '../avatar/clothes';
import { faceDetailGeometry } from '../avatar/faceDetails';
import type { CityLayout } from '../city/layout';
import { Rng } from '../city/rng';
import { groundHeight, type CollisionWorld } from './collision';
import type { Vehicle } from './vehicle';

/**
 * People walking around the city.
 * - They walk loops around blocks on the sidewalk and cross streets at the zebra crossings.
 * - They wait at a crossing when a car is coming, and step aside when a car drives at them.
 * - Only people near the player exist; far ones are recycled (cheap on tablets).
 * - Each person is ONE skinned mesh (all parts merged, colors baked) = one draw call.
 */

const TEMPLATES: [OutfitModel, 'boy' | 'girl'][] = [
  ['Casual', 'boy'], ['Casual2', 'girl'], ['Worker', 'boy'], ['Chef', 'girl'],
  ['Suit', 'boy'], ['Casual3', 'girl'], ['OldClassy', 'boy'], ['Casual', 'girl'],
  ['Cowboy', 'girl'], ['Casual2', 'boy'],
];
const RING_INSET = 2.6; // walking line: meters in from the curb
const SKIN_TONES = ['#f1c6a0', '#e0ac7e', '#c68a5c', '#8d5a3b', '#f6d5b8'];
const EYES = '#2b1d16';

interface Template { scene: THREE.Object3D; clips: THREE.AnimationClip[] }

type State = 'walk' | 'wait' | 'cross' | 'dodge';

interface Person {
  root: THREE.Object3D;
  mesh: THREE.Object3D;
  mixer: THREE.AnimationMixer;
  actions: Record<'Idle' | 'Walk' | 'Run', THREE.AnimationAction>;
  anim: 'Idle' | 'Walk' | 'Run';
  x: number;
  z: number;
  heading: number;
  speed: number;
  block: number;
  /** Corner index the person walks towards (0..3), and direction around the block. */
  corner: number;
  dir: 1 | -1;
  state: State;
  /** Where the person walks to right now. */
  tx: number;
  tz: number;
  timer: number;
  /** After crossing: continue on this block from this corner. */
  next?: { block: number; corner: number };
  active: boolean;
}

/** The four corners of a block's sidewalk loop: 0 NW, 1 NE, 2 SE, 3 SW. */
function ringCorners(slab: { x0: number; z0: number; x1: number; z1: number }) {
  const i = RING_INSET;
  return [
    { x: slab.x0 + i, z: slab.z0 + i }, { x: slab.x1 - i, z: slab.z0 + i },
    { x: slab.x1 - i, z: slab.z1 - i }, { x: slab.x0 + i, z: slab.z1 - i },
  ];
}

export class Pedestrians {
  readonly group = new THREE.Group();
  private templates: Template[] = [];
  private people: Person[] = [];
  private rings: { x: number; z: number }[][];
  private cornerIndex = new Map<string, { block: number; corner: number }>();
  private rng = new Rng(77);
  private tmp = { x: 0, z: 0 };
  private material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75 });
  private geometries: THREE.BufferGeometry[] = [];
  private disposed = false;

  constructor(layout: CityLayout, private world: CollisionWorld, private count: number) {
    this.rings = layout.blocks.map((b) => ringCorners(b.slab));
    this.rings.forEach((r, block) => r.forEach((c, corner) => this.cornerIndex.set(this.key(c.x, c.z), { block, corner })));
  }

  private key(x: number, z: number) { return `${Math.round(x)},${Math.round(z)}`; }

  /** Loads the people models in the background; people appear when ready. */
  async load() {
    const clips = { boy: loadClips(animsUrl('boy')), girl: loadClips(animsUrl('girl')) };
    const loaded = await Promise.all(TEMPLATES.map(async ([model, gender], i) => {
      const gltf = await loadGltf(outfitUrl(model, gender));
      return { scene: this.mergeCharacter(gltf.scene, SKIN_TONES[i % SKIN_TONES.length]), clips: await clips[gender] };
    }));
    if (this.disposed) return;
    this.templates = loaded;
  }

  /**
   * Merges all parts of a character into one skinned mesh with baked vertex colors,
   * normalized to 1.7 m, so each person costs a single draw call.
   */
  private mergeCharacter(source: THREE.Object3D, skin: string): THREE.Object3D {
    const scene = cloneSkinned(source);
    const meshes: THREE.SkinnedMesh[] = [];
    scene.traverse((o) => { if ((o as THREE.SkinnedMesh).isSkinnedMesh) meshes.push(o as THREE.SkinnedMesh); });
    const parts = meshes.map((m) => {
      const g = new THREE.BufferGeometry();
      for (const name of ['position', 'normal', 'skinIndex', 'skinWeight']) {
        const a = m.geometry.getAttribute(name);
        const size = a.itemSize;
        const arr = name === 'skinIndex' ? new Uint16Array(a.count * size) : new Float32Array(a.count * size);
        for (let i = 0; i < a.count; i++) for (let c = 0; c < size; c++) arr[i * size + c] = a.getComponent(i, c);
        g.setAttribute(name, new THREE.BufferAttribute(arr, size));
      }
      const mat = m.material as THREE.MeshStandardMaterial;
      const col = new THREE.Color(mat.name === 'Skin' ? skin : mat.name === 'Face' ? EYES : mat.color);
      const colors = new Float32Array(g.getAttribute('position').count * 3);
      for (let i = 0; i < colors.length; i += 3) colors.set([col.r, col.g, col.b], i);
      g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      g.setIndex(m.geometry.getIndex()!.clone());
      return g;
    });
    const face = faceDetailGeometry(meshes);
    if (face) parts.push(face);
    const merged = mergeGeometries(parts)!;
    parts.forEach((p) => p.dispose());
    this.geometries.push(merged);
    const first = meshes[0];
    const mesh = new THREE.SkinnedMesh(merged, this.material);
    mesh.bind(first.skeleton, first.bindMatrix);
    mesh.position.copy(first.position);
    mesh.quaternion.copy(first.quaternion);
    mesh.scale.copy(first.scale);
    mesh.frustumCulled = false;
    first.parent!.add(mesh);
    meshes.forEach((m) => m.removeFromParent());
    const box = new THREE.Box3().setFromObject(scene);
    const s = 1.7 / (box.max.y - box.min.y);
    scene.scale.setScalar(s);
    scene.position.y = -box.min.y * s;
    const holder = new THREE.Group();
    holder.add(scene);
    return holder;
  }

  private spawn(p: Person | null, fx: number, fz: number): Person | null {
    if (!this.templates.length) return null;
    // Pick a sidewalk spot 25..110 m from the player.
    for (let tries = 0; tries < 30; tries++) {
      const block = this.rng.int(0, this.rings.length - 1);
      const ring = this.rings[block];
      const corner = this.rng.int(0, 3);
      const a = ring[corner], b = ring[(corner + 1) % 4];
      const t = this.rng.next();
      const x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t;
      const d = Math.hypot(x - fx, z - fz);
      if (d < 25 || d > 110) continue;
      if (!p) {
        const tpl = this.rng.pick(this.templates);
        const root = cloneSkinned(tpl.scene);
        const child = this.rng.chance(0.25);
        root.scale.setScalar(child ? this.rng.range(0.62, 0.72) : this.rng.range(0.92, 1.05));
        const mixer = new THREE.AnimationMixer(root);
        const clip = (n: string) => mixer.clipAction(tpl.clips.find((c) => c.name === n)!);
        const actions = { Idle: clip('Idle'), Walk: clip('Walk'), Run: clip('Run') };
        actions.Walk.play();
        mixer.update(this.rng.range(0, 2)); // desync
        let mesh: THREE.Object3D = root;
        root.traverse((o) => { if ((o as THREE.SkinnedMesh).isSkinnedMesh) mesh = o; });
        p = { root, mesh, mixer, actions, anim: 'Walk', x, z, heading: 0, speed: 1, block, corner: 0, dir: 1, state: 'walk', tx: 0, tz: 0, timer: 0, active: true };
        this.group.add(root);
        this.people.push(p);
      }
      p.x = x; p.z = z; p.block = block; p.active = true; p.root.visible = true;
      p.dir = this.rng.chance(0.5) ? 1 : -1;
      p.corner = p.dir === 1 ? (corner + 1) % 4 : corner;
      p.speed = this.rng.range(1.1, 1.6) * (p.root.scale.x < 0.8 ? 0.85 : 1);
      p.state = 'walk';
      p.next = undefined;
      const c = this.rings[block][p.corner];
      p.tx = c.x; p.tz = c.z;
      return p;
    }
    return p;
  }

  private play(p: Person, name: 'Idle' | 'Walk' | 'Run') {
    if (p.anim === name) return;
    p.actions[name].reset().fadeIn(0.25).play();
    p.actions[p.anim].fadeOut(0.25);
    p.anim = name;
  }

  /** Is a moving car close to the point (x, z) and heading towards it? */
  private carComing(car: Vehicle | null, x: number, z: number, range: number) {
    if (!car || Math.abs(car.speed) < 0.8) return false;
    const dx = x - car.x, dz = z - car.z;
    const d = Math.hypot(dx, dz);
    if (d > range) return false;
    const fx = Math.sin(car.heading) * Math.sign(car.speed), fz = Math.cos(car.heading) * Math.sign(car.speed);
    return (dx * fx + dz * fz) / (d || 1) > 0.3 || d < 6;
  }

  /** Arrived at a corner: turn and keep walking around the block, or cross the street. */
  private atCorner(p: Person, car: Vehicle | null) {
    const ring = this.rings[p.block];
    const here = ring[p.corner];
    if (this.rng.chance(0.4)) {
      // Cross at the zebra: mirror the corner across the road, along one of the two axes.
      const c = { x: (ring[0].x + ring[2].x) / 2, z: (ring[0].z + ring[2].z) / 2 };
      const sx = Math.sign(here.x - c.x), sz = Math.sign(here.z - c.z);
      const gap = 2 * (5 + RING_INSET); // road width + both sidewalk insets
      const options = this.rng.chance(0.5)
        ? [{ x: here.x + sx * gap, z: here.z }, { x: here.x, z: here.z + sz * gap }]
        : [{ x: here.x, z: here.z + sz * gap }, { x: here.x + sx * gap, z: here.z }];
      for (const o of options) {
        const target = this.cornerIndex.get(this.key(o.x, o.z));
        if (!target) continue;
        p.tx = o.x; p.tz = o.z;
        p.next = target;
        p.state = this.carComing(car, (here.x + o.x) / 2, (here.z + o.z) / 2, 30) ? 'wait' : 'cross';
        return;
      }
    }
    p.corner = (p.corner + p.dir + 4) % 4;
    const n = ring[p.corner];
    p.tx = n.x; p.tz = n.z;
  }

  /** Positions of people, as circles the car must not touch. */
  obstacles(): { x: number; z: number; r: number }[] {
    return this.people.filter((p) => p.active).map((p) => ({ x: p.x, z: p.z, r: 0.45 }));
  }

  update(dt: number, fx: number, fz: number, car: Vehicle | null, playerPos: { x: number; z: number } | null) {
    if (!this.templates.length) return;
    // Keep the right number of people around the player.
    while (this.people.length < this.count) if (!this.spawn(null, fx, fz)) break;

    for (const p of this.people) {
      const dist = Math.hypot(p.x - fx, p.z - fz);
      if (dist > 140) { this.spawn(p, fx, fz); continue; }

      // Step aside when a car drives at you.
      if (car && Math.abs(car.speed) > 0.5 && p.state !== 'dodge') {
        const sgn = Math.sign(car.speed);
        const fwdX = Math.sin(car.heading) * sgn, fwdZ = Math.cos(car.heading) * sgn;
        const rx = p.x - car.x, rz = p.z - car.z;
        const ahead = rx * fwdX + rz * fwdZ, lateral = rx * fwdZ - rz * fwdX;
        if (ahead > 0 && ahead < 6 + Math.abs(car.speed) * 1.2 && Math.abs(lateral) < car.width / 2 + 1.2) {
          const side = lateral >= 0 ? 1 : -1;
          const push = car.width / 2 + 2.2 - Math.abs(lateral);
          p.tx = p.x + fwdZ * side * push;
          p.tz = p.z - fwdX * side * push;
          p.state = 'dodge';
          p.timer = 1.6;
        }
      }

      let speed = p.speed;
      if (p.state === 'wait') {
        speed = 0;
        const here = this.rings[p.block][p.corner];
        if (!this.carComing(car, (here.x + p.tx) / 2, (here.z + p.tz) / 2, 30)) p.state = 'cross';
      } else if (p.state === 'cross') {
        speed = p.speed * 1.35; // hurry a bit on the road
      } else if (p.state === 'dodge') {
        speed = 3.2;
        p.timer -= dt;
      }

      const dx = p.tx - p.x, dz = p.tz - p.z;
      const d = Math.hypot(dx, dz);
      if (speed > 0 && d > 0.05) {
        const step = Math.min(d, speed * dt);
        p.x += (dx / d) * step;
        p.z += (dz / d) * step;
        const target = Math.atan2(dx, dz);
        const diff = Math.atan2(Math.sin(target - p.heading), Math.cos(target - p.heading));
        p.heading += diff * Math.min(1, dt * 8);
      }
      if (p.state === 'dodge' && (d < 0.1 || p.timer <= 0)) {
        // Back to walking: head for the next corner again.
        p.state = p.next ? 'cross' : 'walk';
        if (p.next) {
          const t = this.rings[p.next.block][p.next.corner];
          p.tx = t.x; p.tz = t.z;
        } else {
          const c = this.rings[p.block][p.corner];
          p.tx = c.x; p.tz = c.z;
        }
      } else if (d < 0.15 && p.state !== 'wait') {
        if (p.state === 'cross' && p.next) {
          p.block = p.next.block;
          p.corner = p.next.corner;
          p.next = undefined;
          p.state = 'walk';
          p.corner = (p.corner + p.dir + 4) % 4;
          const n = this.rings[p.block][p.corner];
          p.tx = n.x; p.tz = n.z;
        } else if (p.state === 'walk') this.atCorner(p, car);
      }

      // Never stand inside the parked car or the player.
      if (car) {
        for (const off of [car.length / 2 - car.width / 2, 0, -(car.length / 2 - car.width / 2)]) {
          const cx = car.x + Math.sin(car.heading) * off, cz = car.z + Math.cos(car.heading) * off;
          const ex = p.x - cx, ez = p.z - cz, e = Math.hypot(ex, ez), min = car.width / 2 + 0.45;
          if (e < min && e > 1e-4) { p.x = cx + (ex / e) * min; p.z = cz + (ez / e) * min; }
        }
      }
      if (playerPos) {
        const ex = p.x - playerPos.x, ez = p.z - playerPos.z, e = Math.hypot(ex, ez);
        if (e < 0.8 && e > 1e-4) { p.x = playerPos.x + (ex / e) * 0.8; p.z = playerPos.z + (ez / e) * 0.8; }
      }
      if (p.state === 'dodge') {
        this.world.resolveCircle(p.x, p.z, 0.35, this.tmp);
        p.x = this.tmp.x; p.z = this.tmp.z;
      }

      const moving = speed > 0 && d > 0.05;
      this.play(p, !moving ? 'Idle' : speed > 2.5 ? 'Run' : 'Walk');
      p.actions.Walk.timeScale = speed / (1.4 * p.root.scale.x);
      const visible = dist < 95;
      p.root.visible = visible;
      if (visible) {
        p.mixer.update(dt);
        p.root.position.set(p.x, groundHeight(p.x, p.z), p.z);
        p.root.rotation.y = p.heading;
        p.mesh.castShadow = dist < 45;
      }
    }
  }

  dispose() {
    this.disposed = true;
    for (const p of this.people) p.mixer.stopAllAction();
    this.geometries.forEach((g) => g.dispose());
    this.material.dispose();
    this.group.removeFromParent();
  }
}
