import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Extra pieces for the hero outfits (cape, helmet, jetpack, cap...), made from a few simple shapes
 * and attached to a bone of the character, so they follow every animation. Each piece is one small
 * mesh (one draw call), sized for the 1.7 m avatar.
 */
export type GearKind = 'cape' | 'bubbleHelmet' | 'jetpack' | 'backpack' | 'cap' | 'capBackwards' | 'antenna' | 'goggles';

export interface GearPiece { kind: GearKind; color: string; color2?: string }

/** Head center and size relative to the head bone, and the back of the chest relative to the torso bone (meters, measured). */
const HEAD = new THREE.Vector3(0, 0.27, 0.04);
const HEAD_R = 0.34;
const BACK_Z = -0.12;

const paint = (g: THREE.BufferGeometry, color: string) => {
  const c = new THREE.Color(color), n = g.getAttribute('position').count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) a.set([c.r, c.g, c.b], i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  g.deleteAttribute('uv');
  return g;
};
const merged = (parts: THREE.BufferGeometry[]) => {
  const g = mergeGeometries(parts.map((p) => (p.index ? p.toNonIndexed() : p)))!;
  parts.forEach((p) => p.dispose());
  return g;
};

/** Geometry in avatar space around the bone (origin = bone position, +Z = forward, +Y = up). */
function shape(p: GearPiece): { geo: THREE.BufferGeometry; bone: 'Head' | 'Torso'; glass?: boolean; side?: THREE.Side } {
  const c2 = p.color2 ?? '#ffffff';
  switch (p.kind) {
    case 'cape': {
      // Hangs from the shoulders down to the knees, a little wider and further back at the bottom.
      const g = new THREE.PlaneGeometry(1, 1, 1, 6);
      const pos = g.getAttribute('position');
      for (let i = 0; i < pos.count; i++) {
        const t = 0.5 - pos.getY(i); // 0 top .. 1 bottom
        pos.setXYZ(i, pos.getX(i) * (0.34 + t * 0.3), 0.24 - t * 0.68, BACK_Z - 0.02 - t * t * 0.12);
      }
      g.computeVertexNormals();
      return { geo: paint(g, p.color), bone: 'Torso', side: THREE.DoubleSide };
    }
    case 'bubbleHelmet': {
      const glass = new THREE.SphereGeometry(HEAD_R + 0.1, 24, 16).translate(HEAD.x, HEAD.y + 0.02, HEAD.z);
      return { geo: paint(glass, p.color), bone: 'Head', glass: true };
    }
    case 'jetpack': {
      const parts: THREE.BufferGeometry[] = [];
      for (const x of [-0.085, 0.085]) {
        parts.push(paint(new THREE.CylinderGeometry(0.075, 0.075, 0.34, 14).translate(x, 0.03, BACK_Z - 0.11), p.color));
        parts.push(paint(new THREE.SphereGeometry(0.075, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2).translate(x, 0.2, BACK_Z - 0.11), p.color));
        parts.push(paint(new THREE.CylinderGeometry(0.05, 0.07, 0.07, 12).translate(x, -0.175, BACK_Z - 0.11), c2));
      }
      parts.push(paint(new THREE.BoxGeometry(0.2, 0.22, 0.05).translate(0, 0.04, BACK_Z - 0.04), c2));
      return { geo: merged(parts), bone: 'Torso' };
    }
    case 'backpack': {
      const parts = [
        paint(new THREE.BoxGeometry(0.3, 0.32, 0.14).translate(0, 0.02, BACK_Z - 0.08), p.color),
        paint(new THREE.BoxGeometry(0.22, 0.12, 0.05).translate(0, -0.05, BACK_Z - 0.17), c2),
        paint(new THREE.CylinderGeometry(0.07, 0.07, 0.32, 12).rotateZ(Math.PI / 2).translate(0, 0.2, BACK_Z - 0.08), c2),
      ];
      return { geo: merged(parts), bone: 'Torso' };
    }
    case 'cap':
    case 'capBackwards': {
      const dir = p.kind === 'cap' ? 1 : -1;
      const parts = [
        paint(new THREE.SphereGeometry(HEAD_R + 0.025, 22, 10, 0, Math.PI * 2, 0, Math.PI * 0.42).translate(HEAD.x, HEAD.y - 0.01, HEAD.z), p.color),
        paint(new THREE.CylinderGeometry(0.2, 0.2, 0.025, 20, 1, false, -Math.PI / 2, Math.PI).scale(1.15, 1, 1.1)
          .rotateY(dir > 0 ? 0 : Math.PI).translate(HEAD.x, HEAD.y + 0.11, HEAD.z + dir * (HEAD_R - 0.02)), c2),
        paint(new THREE.SphereGeometry(0.035, 8, 6).translate(HEAD.x, HEAD.y + HEAD_R + 0.01, HEAD.z), c2),
      ];
      return { geo: merged(parts), bone: 'Head' };
    }
    case 'antenna': {
      const top = HEAD.y + HEAD_R + 0.02;
      const parts = [
        paint(new THREE.CylinderGeometry(0.06, 0.08, 0.05, 14).translate(HEAD.x, top, HEAD.z), c2),
        paint(new THREE.CylinderGeometry(0.012, 0.012, 0.2, 8).translate(HEAD.x, top + 0.12, HEAD.z), c2),
        paint(new THREE.SphereGeometry(0.05, 12, 8).translate(HEAD.x, top + 0.24, HEAD.z), p.color),
      ];
      return { geo: merged(parts), bone: 'Head' };
    }
    case 'goggles': {
      const y = HEAD.y + 0.13, parts = [
        paint(new THREE.TorusGeometry(HEAD_R + 0.01, 0.022, 6, 32).rotateX(Math.PI / 2).translate(HEAD.x, y, HEAD.z), c2),
      ];
      for (const x of [-0.11, 0.11]) {
        parts.push(paint(new THREE.CylinderGeometry(0.075, 0.075, 0.06, 18).rotateX(Math.PI / 2).translate(HEAD.x + x, y, HEAD.z + HEAD_R - 0.01), c2));
        parts.push(paint(new THREE.CylinderGeometry(0.06, 0.06, 0.02, 18).rotateX(Math.PI / 2).translate(HEAD.x + x, y, HEAD.z + HEAD_R + 0.025), p.color));
      }
      return { geo: merged(parts), bone: 'Head' };
    }
  }
}

/**
 * Adds the gear to a posed character (`model` in avatar space, standing at the origin, facing +Z).
 * Call once, right after the first animation frame.
 */
export function attachGear(model: THREE.Object3D, gear: GearPiece[]) {
  model.updateMatrixWorld(true);
  const inv = new THREE.Matrix4(), boneAt = new THREE.Vector3();
  for (const piece of gear) {
    const { geo, bone: boneName, glass, side } = shape(piece);
    const bone = model.getObjectByName(boneName);
    if (!bone) { geo.dispose(); continue; }
    const mat = glass
      ? new THREE.MeshStandardMaterial({ color: piece.color, transparent: true, opacity: 0.28, roughness: 0.05, metalness: 0, depthWrite: false })
      : new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0, side: side ?? THREE.FrontSide });
    const mesh = new THREE.Mesh(geo, mat);
    // The shape is built around the bone's spot in avatar space; move it into the bone's own space.
    bone.getWorldPosition(boneAt);
    inv.copy(bone.matrixWorld).invert();
    mesh.matrix.copy(inv).multiply(new THREE.Matrix4().makeTranslation(boneAt.x, boneAt.y, boneAt.z));
    mesh.matrix.decompose(mesh.position, mesh.quaternion, mesh.scale);
    mesh.castShadow = !glass;
    mesh.userData.glass = !!glass;
    mesh.frustumCulled = false;
    mesh.renderOrder = glass ? 2 : 0;
    mesh.userData.ownGeometry = true;
    mesh.userData.ownMaterial = true;
    // Tall head pieces would stick out through a car roof: hidden while seated.
    mesh.userData.tallGear = piece.kind === 'bubbleHelmet' || piece.kind === 'antenna';
    bone.add(mesh);
  }
}
