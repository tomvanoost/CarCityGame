import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { loadClips, loadGltf } from '../../engine/assets';
import type { Gender } from '../../services/types';
import { animsUrl, getClothes, outfitUrl } from './clothes';
import { faceDetailGeometry, faceDetailMaterial } from './faceDetails';
import { attachGear } from './gear';

export type AnimName =
  | 'Idle' | 'Walk' | 'Run' | 'Jump' | 'SitDown' | 'StandUp'
  | 'Victory' | 'PickUp' | 'Walk_Carry' | 'Run_Carry';

const AVATAR_HEIGHT = 1.7; // meters
/** The source models export skin as black; this is the default skin tone. */
export const DEFAULT_SKIN = '#f1c6a0';
const EYES = '#2b1d16';

export class Avatar {
  readonly root = new THREE.Group();
  private mixer: THREE.AnimationMixer;
  private actions = new Map<string, THREE.AnimationAction>();
  private current?: THREE.AnimationAction;
  private afterOnce: AnimName | null = 'Idle';

  private constructor(model: THREE.Object3D, clips: THREE.AnimationClip[]) {
    this.root.add(model);
    this.mixer = new THREE.AnimationMixer(model);
    for (const clip of clips) this.actions.set(clip.name, this.mixer.clipAction(clip));
    this.mixer.addEventListener('finished', () => { if (this.afterOnce) this.play(this.afterOnce); });
  }

  /** Loads the outfit + shared animations and returns a ready-to-use avatar. */
  static async create(gender: Gender, outfitId: string | null): Promise<Avatar> {
    const item = getClothes(outfitId);
    const [gltf, clips] = await Promise.all([loadGltf(outfitUrl(item.model, gender)), loadClips(animsUrl(gender))]);
    const model = cloneSkinned(gltf.scene);

    // Normalize size and stand on the ground (y = 0).
    const box = new THREE.Box3().setFromObject(model);
    const scale = AVATAR_HEIGHT / (box.max.y - box.min.y);
    model.scale.setScalar(scale);
    model.position.y = -box.min.y * scale;

    model.traverse((o) => {
      const mesh = o as THREE.SkinnedMesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      mesh.frustumCulled = false; // skinned bounds don't follow animation
      // Own material copies so colors can differ between avatars.
      const mats = (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).map((m) => {
        const c = (m as THREE.MeshStandardMaterial).clone();
        const color = c.name === 'Skin' ? DEFAULT_SKIN : c.name === 'Face' ? EYES : item.colors?.[c.name];
        if (color) c.color.set(color);
        // Material feel: soft skin, glossy eyes, a little sheen on hair, matte fabric.
        c.roughness = c.name === 'Skin' ? 0.6 : c.name === 'Face' ? 0.15 : /Hair/.test(c.name) ? 0.45 : 0.82;
        c.metalness = 0;
        return c;
      });
      mesh.material = Array.isArray(mesh.material) ? mats : mats[0];
    });

    // Eye highlights + smile, skinned to the head bone.
    const skinned: THREE.SkinnedMesh[] = [];
    model.traverse((o) => { if ((o as THREE.SkinnedMesh).isSkinnedMesh) skinned.push(o as THREE.SkinnedMesh); });
    const faceGeo = faceDetailGeometry(skinned);
    if (faceGeo) {
      const ref = skinned[0];
      const fm = new THREE.SkinnedMesh(faceGeo, faceDetailMaterial());
      fm.bind(ref.skeleton, ref.bindMatrix);
      fm.position.copy(ref.position);
      fm.quaternion.copy(ref.quaternion);
      fm.scale.copy(ref.scale);
      fm.frustumCulled = false;
      fm.userData.ownGeometry = true;
      ref.parent!.add(fm);
    }

    const avatar = new Avatar(model, clips);
    avatar.play('Idle');
    if (item.gear?.length) { avatar.update(0); attachGear(model, item.gear); }
    return avatar;
  }

  /**
   * Plays an animation. `once` plays it one time, then `then` (default Idle);
   * pass `then: null` to hold the last pose (e.g. sitting in the car).
   */
  play(name: AnimName, opts: { once?: boolean; fade?: number; then?: AnimName | null } = {}) {
    const next = this.actions.get(name);
    if (!next || (next === this.current && !opts.once)) return;
    if (opts.once) this.afterOnce = opts.then === undefined ? 'Idle' : opts.then;
    next.reset();
    next.setLoop(opts.once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
    next.clampWhenFinished = !!opts.once;
    next.fadeIn(opts.fade ?? 0.25).play();
    this.current?.fadeOut(opts.fade ?? 0.25);
    this.current = next;
  }

  /** Shows or hides tall head gear (helmet bubble, antenna), e.g. hidden while sitting in a car. */
  setTallGear(visible: boolean) {
    this.root.traverse((o) => { if (o.userData.tallGear) o.visible = visible; });
  }

  get currentName(): string | undefined {
    return this.current?.getClip().name;
  }

  update(dt: number) {
    this.mixer.update(dt);
  }

  dispose() {
    this.mixer.stopAllAction();
    this.root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      // Geometry is shared with the loader cache; only our own geometry and material clones are freed.
      if (mesh.userData.ownGeometry) {
        mesh.geometry.dispose();
        if (mesh.userData.ownMaterial) (mesh.material as THREE.Material).dispose();
        return;
      }
      (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).forEach((m) => m.dispose());
    });
    this.root.removeFromParent();
  }
}
