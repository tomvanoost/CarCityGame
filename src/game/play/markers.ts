import * as THREE from 'three';

/**
 * Visual helpers for gameplay: glowing beacon columns, floating emoji icons that
 * stay readable from anywhere, and the big guidance arrow.
 */

const iconCache = new Map<string, THREE.Texture>();

/** Emoji in a white round badge, as a texture. */
function iconTexture(emoji: string, ring: string): THREE.Texture {
  const key = emoji + ring;
  let tex = iconCache.get(key);
  if (tex) return tex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = 'rgba(0,0,0,0.18)';
  g.beginPath(); g.arc(64, 68, 56, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#ffffff';
  g.beginPath(); g.arc(64, 62, 54, 0, Math.PI * 2); g.fill();
  g.lineWidth = 9; g.strokeStyle = ring; g.stroke();
  g.font = '64px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(emoji, 64, 66);
  tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  iconCache.set(key, tex);
  return tex;
}

/** A floating icon that keeps the same size on screen (like a map pin). */
export function createIcon(emoji: string, ring: string, size = 0.055): THREE.Sprite {
  const mat = new THREE.SpriteMaterial({ map: iconTexture(emoji, ring), sizeAttenuation: false, depthTest: false, fog: false, transparent: true });
  const s = new THREE.Sprite(mat);
  s.scale.set(size, size, 1);
  s.renderOrder = 10;
  return s;
}

const beaconGeo = new THREE.CylinderGeometry(1, 1, 1, 32, 1, true).translate(0, 0.5, 0);

/** A soft glowing light column standing on the ground. */
export function createBeacon(color: string, radius = 2.2, height = 14): THREE.Mesh {
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    uniforms: { uColor: { value: new THREE.Color(color) }, uTime: { value: 0 } },
    vertexShader: 'varying float vY; void main(){ vY = position.y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `uniform vec3 uColor; uniform float uTime; varying float vY;
      void main(){ float a = (1.0 - vY) * (0.55 + 0.15 * sin(uTime * 3.0 + vY * 6.0)); gl_FragColor = vec4(uColor * a, a); }`,
  });
  const m = new THREE.Mesh(beaconGeo, mat);
  m.scale.set(radius, height, radius);
  m.renderOrder = 5;
  return m;
}

/** Animates beacons (pulse) — call each frame. */
export function tickBeacon(b: THREE.Mesh, t: number) {
  (b.material as THREE.ShaderMaterial).uniforms.uTime.value = t;
}

/** Big friendly yellow arrow that floats above the player and points to a target. */
export function createArrow(): THREE.Group {
  const mat = new THREE.MeshStandardMaterial({ color: '#ffd000', emissive: '#ffb000', emissiveIntensity: 0.6, roughness: 0.4 });
  const shape = new THREE.Shape();
  shape.moveTo(0, 1.3); shape.lineTo(0.9, 0.2); shape.lineTo(0.35, 0.2); shape.lineTo(0.35, -1);
  shape.lineTo(-0.35, -1); shape.lineTo(-0.35, 0.2); shape.lineTo(-0.9, 0.2); shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.3, bevelEnabled: true, bevelSize: 0.06, bevelThickness: 0.06, bevelSegments: 2 });
  geo.translate(0, 0, -0.15);
  geo.rotateX(-Math.PI / 2); // lie flat, pointing to -Z... then
  geo.rotateY(Math.PI); // point to +Z
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = false;
  // Tilt (nose up) so the camera behind the player sees the arrow's face pointing forward.
  mesh.rotation.x = -0.55;
  const g = new THREE.Group();
  g.add(mesh);
  return g;
}

export function disposeMarker(o: THREE.Object3D) {
  o.traverse((x) => {
    const m = x as THREE.Mesh;
    if ((m as THREE.SkinnedMesh).isSkinnedMesh) return; // shared character model
    if (m.geometry && m.geometry !== beaconGeo) m.geometry.dispose();
    const mat = m.material as THREE.Material | undefined;
    mat?.dispose();
  });
  o.removeFromParent();
}
