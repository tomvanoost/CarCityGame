import * as THREE from 'three';
import { GRID_BLOCKS, isWideLine } from '../city/layout';
import { groundHeight } from './collision';
import { LANE, type RoadGraph } from './roads';
import { moveOf } from './trafficLights';

/**
 * Dashed turning lines painted across the city crossings with an avenue (like the guide lines at Dutch junctions):
 * from each turning lane, a curve to the lane you end up in, so you can see where to start steering and
 * how far. Left turns start in the left lane, right turns in the right lane. All lines are one mesh.
 */
export function turnLinesMesh(graph: RoadGraph): THREE.Mesh {
  const N = graph.nodes, gridNodes = (GRID_BLOCKS + 1) * (GRID_BLOCKS + 1);
  const pos: number[] = [];
  const DASH = 1.5, GAP = 1, W = 0.14;
  const dir = (a: number, b: number) => { const l = Math.hypot(N[b].x - N[a].x, N[b].z - N[a].z) || 1; return { x: (N[b].x - N[a].x) / l, z: (N[b].z - N[a].z) / l }; };
  graph.adj.forEach((adj, b) => {
    if (b >= gridNodes || adj.length < 3) return;
    // Only where an avenue crosses (the crossings with traffic lights); small crossings are too tight.
    const n = GRID_BLOCKS + 1;
    if (!isWideLine(Math.floor(b / n)) && !isWideLine(b % n)) return;
    const B = N[b];
    for (const a of adj) for (const c of adj) {
      if (c === a) continue;
      const move = moveOf(N[a], B, N[c]);
      if (move === 'straight') continue;
      const lanesIn = graph.lanesOf(a, b), lanesOut = graph.lanesOf(b, c);
      const laneIn = lanesIn.length > 1 ? (move === 'left' ? lanesIn[0] : lanesIn[lanesIn.length - 1]) : LANE;
      const laneOut = move === 'left' ? lanesOut[0] : lanesOut[lanesOut.length - 1];
      const d1 = dir(a, b), d2 = dir(b, c);
      // Lanes are on the right of the driving direction: right(d) = (-d.z, d.x).
      const back = graph.crossHalf(b, a) + 0.4, fwd = graph.crossHalf(b, c) + 0.4;
      const p0 = { x: B.x - d1.x * back - d1.z * laneIn, z: B.z - d1.z * back + d1.x * laneIn };
      const p2 = { x: B.x + d2.x * fwd - d2.z * laneOut, z: B.z + d2.z * fwd + d2.x * laneOut };
      // Control point: where the two lane lines meet (same as the traffic cars' turn).
      const along = (p2.x - p0.x) * d1.x + (p2.z - p0.z) * d1.z;
      const p1 = { x: p0.x + d1.x * along, z: p0.z + d1.z * along };
      const at = (t: number) => {
        const u = 1 - t;
        return { x: u * u * p0.x + 2 * u * t * p1.x + t * t * p2.x, z: u * u * p0.z + 2 * u * t * p1.z + t * t * p2.z };
      };
      // Walk the curve in small steps and lay dashes along it.
      const steps = 60, pts = Array.from({ length: steps + 1 }, (_, i) => at(i / steps));
      const cum = [0];
      for (let i = 1; i <= steps; i++) cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z));
      const total = cum[steps], y = groundHeight(B.x, B.z) + 0.05;
      const point = (s: number) => {
        let i = 1;
        while (i < steps && cum[i] < s) i++;
        const k = (s - cum[i - 1]) / Math.max(1e-6, cum[i] - cum[i - 1]);
        return { x: pts[i - 1].x + (pts[i].x - pts[i - 1].x) * k, z: pts[i - 1].z + (pts[i].z - pts[i - 1].z) * k };
      };
      for (let s = 0.3; s + DASH <= total; s += DASH + GAP) {
        const A0 = point(s), A1 = point(s + DASH);
        const l = Math.hypot(A1.x - A0.x, A1.z - A0.z) || 1, nx = -(A1.z - A0.z) / l * W, nz = (A1.x - A0.x) / l * W;
        pos.push(
          A0.x - nx, y, A0.z - nz, A1.x - nx, y, A1.z - nz, A1.x + nx, y, A1.z + nz,
          A0.x - nx, y, A0.z - nz, A1.x + nx, y, A1.z + nz, A0.x + nx, y, A0.z + nz,
        );
      }
    }
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(new Float32Array(pos.length).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
    color: '#f4f4f4', emissive: '#8a8a8a', roughness: 0.7, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
  }));
  mesh.receiveShadow = true;
  mesh.renderOrder = 2;
  return mesh;
}
