import * as THREE from 'three';
import { groundHeight } from './collision';
import type { RoadGraph } from './roads';

/** A Dutch-style blue highway sign ("A1" + motorway symbol). */
function highwayTexture() {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 192;
  const g = c.getContext('2d')!;
  g.fillStyle = '#1f4fa3'; g.fillRect(0, 0, 256, 192);
  g.strokeStyle = '#ffffff'; g.lineWidth = 8; g.strokeRect(8, 8, 240, 176);
  g.fillStyle = '#e5484d'; g.fillRect(70, 26, 116, 52);
  g.fillStyle = '#ffffff'; g.font = '900 44px Nunito, Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('A1', 128, 54);
  // Motorway symbol: a bridge over two roads.
  g.fillRect(70, 112, 116, 12);
  for (const x of [88, 168]) { g.beginPath(); g.moveTo(x - 6, 170); g.lineTo(x + 6, 170); g.lineTo(x + 2, 124); g.lineTo(x - 2, 124); g.fill(); }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Round speed limit sign: red ring with the number. */
function drawLimit(g: CanvasRenderingContext2D, kmh: number) {
  g.clearRect(0, 0, 128, 128);
  g.fillStyle = '#e5484d'; g.beginPath(); g.arc(64, 64, 62, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#ffffff'; g.beginPath(); g.arc(64, 64, 48, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#1c1d20'; g.font = '900 46px Nunito, Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(String(kmh), 64, 68);
}

/**
 * Signs where you drive onto the highway: the blue A1 sign and the speed limit (100 by day, 120 at
 * night; all limit signs share one texture that is redrawn when the limit changes).
 */
export class HighwaySigns {
  readonly group = new THREE.Group();
  private limitCanvas = document.createElement('canvas');
  private limitTex: THREE.CanvasTexture;
  private kmh = 0;

  constructor(graph: RoadGraph) {
    this.limitCanvas.width = this.limitCanvas.height = 128;
    this.limitTex = new THREE.CanvasTexture(this.limitCanvas);
    this.limitTex.colorSpace = THREE.SRGBColorSpace;
    this.setKmh(100);
    const blue = new THREE.MeshStandardMaterial({ map: highwayTexture(), roughness: 0.6 });
    const limit = new THREE.MeshStandardMaterial({ map: this.limitTex, transparent: true, alphaTest: 0.5, roughness: 0.6 });
    const pole = new THREE.MeshStandardMaterial({ color: '#8c949c', roughness: 0.5, metalness: 0.3 });
    const N = graph.nodes;
    for (const e of graph.highwayEnds) {
      const A = N[e.node], B = N[e.towards];
      const l = Math.hypot(B.x - A.x, B.z - A.z), d = { x: (B.x - A.x) / l, z: (B.z - A.z) / l }, r = { x: -d.z, z: d.x };
      // 30 m onto the highway, on the right-hand side, facing the drivers.
      const x = A.x + d.x * 30 + r.x * 7.5, z = A.z + d.z * 30 + r.z * 7.5, y = groundHeight(x, z);
      const g = new THREE.Group();
      g.position.set(x, y, z);
      g.rotation.y = Math.atan2(-d.x, -d.z);
      const p1 = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 3.2, 8), pole);
      p1.position.set(0.9, 1.6, 0);
      const p2 = p1.clone(); p2.position.x = -0.9;
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 1.65), blue);
      sign.position.set(0, 2.6, 0.08);
      const lim = new THREE.Mesh(new THREE.CircleGeometry(0.55, 24), limit);
      lim.position.set(0, 1.2, 0.09);
      g.add(p1, p2, sign, lim);
      this.group.add(g);
    }
  }

  setKmh(kmh: number) {
    if (kmh === this.kmh) return;
    this.kmh = kmh;
    drawLimit(this.limitCanvas.getContext('2d')!, kmh);
    this.limitTex.needsUpdate = true;
  }

  dispose() {
    this.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) { m.geometry.dispose(); const mat = m.material as THREE.MeshStandardMaterial; mat.map?.dispose(); mat.dispose(); }
    });
    this.group.removeFromParent();
  }
}
