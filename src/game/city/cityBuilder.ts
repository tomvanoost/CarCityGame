import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { CURB_HEIGHT, HALF_CITY, ROAD_WIDTH, generateCity, type CityLayout, type District, type Placement, type Rect } from './layout';
import { createBatchMaterial, createRoadMaterial, createTerrainMaterial, createTowerMaterial, createWaterMaterial } from './materials';
import { ALL_CITY_MODELS, isSketchfabCity, loadCityModels, type CityModel } from './models';
import { SKETCHFAB_CITY } from './sketchfabCity';
import { SfInstances } from './sfInstances';

export interface CityQuality {
  /** Distance where buildings switch to their light version. */
  buildingLod: number;
  /** Distance where trees switch to their light version / disappear. */
  natureLod: number;
  natureMax: number;
  /** Beyond this distance the fog hides everything. */
  fogFar: number;
}

export interface City {
  group: THREE.Group;
  layout: CityLayout;
  /** Call every frame with the camera position (LOD work is throttled inside). */
  update(camera: THREE.Vector3, dt: number): void;
  dispose(): void;
}

const LOT_COLORS: Record<District, string> = {
  downtown: '#a9a59d', midrise: '#a9a59d', shops: '#80b35c', townhouses: '#7fb25b',
  apartments: '#82b55e', residential: '#7db35a', park: '#79b458', gas: '#7fb25b',
};
const SIDEWALK_COLOR = '#b9b5ad';
const GRASS = '#74ad52';

// ---------- small geometry helpers (vertex-colored) ----------
class GeoBuilder {
  pos: number[] = [];
  col: number[] = [];
  private c = new THREE.Color();
  quad(x0: number, z0: number, x1: number, z1: number, y: number, color: string) {
    this.c.set(color);
    this.pos.push(x0, y, z0, x0, y, z1, x1, y, z1, x0, y, z0, x1, y, z1, x1, y, z0);
    for (let i = 0; i < 6; i++) this.col.push(this.c.r, this.c.g, this.c.b);
  }
  /** Vertical faces around a rectangle (curbs). */
  walls(r: Rect, y0: number, y1: number, color: string) {
    this.c.set(color);
    const e: [number, number, number, number][] = [[r.x0, r.z1, r.x1, r.z1], [r.x1, r.z1, r.x1, r.z0], [r.x1, r.z0, r.x0, r.z0], [r.x0, r.z0, r.x0, r.z1]];
    for (const [ax, az, bx, bz] of e) {
      this.pos.push(ax, y0, az, bx, y0, bz, bx, y1, bz, ax, y0, az, bx, y1, bz, ax, y1, az);
      for (let i = 0; i < 6; i++) this.col.push(this.c.r, this.c.g, this.c.b);
    }
  }
  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.computeVertexNormals();
    return g;
  }
}

function coloredBox(w: number, h: number, d: number, color: string, x: number, y: number, z: number): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d).toNonIndexed();
  g.deleteAttribute('uv');
  g.translate(x, y + h / 2, z);
  const c = new THREE.Color(color);
  const n = g.getAttribute('position').count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) arr.set([c.r, c.g, c.b], i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return g;
}

function coloredCylinder(r: number, h: number, color: string, x: number, y: number, z: number, seg = 24): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(r, r, h, seg).toNonIndexed();
  g.deleteAttribute('uv');
  g.translate(x, y + h / 2, z);
  const c = new THREE.Color(color);
  const n = g.getAttribute('position').count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) arr.set([c.r, c.g, c.b], i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return g;
}

/**
 * A BatchedMesh where each instance can switch between a detailed and a light
 * geometry (LOD) or hide, based on distance to the camera.
 */
class LodBatch {
  mesh: THREE.BatchedMesh;
  private ids = new Map<string, [number, number]>();
  private inst: { x: number; z: number; lod0: number; lod1: number; state: number }[] = [];

  constructor(models: CityModel[], instances: number, material: THREE.Material) {
    let verts = 0, idx = 0;
    for (const m of models) {
      verts += m.lod0.getAttribute('position').count + (m.lod1?.getAttribute('position').count ?? 0);
      idx += m.lod0.getIndex()!.count + (m.lod1?.getIndex()!.count ?? 0);
    }
    this.mesh = new THREE.BatchedMesh(instances, verts, idx, material);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    for (const m of models) {
      const a = this.mesh.addGeometry(m.lod0);
      const b = m.lod1 ? this.mesh.addGeometry(m.lod1) : -1;
      this.ids.set(m.name, [a, b]);
    }
  }

  add(p: Placement, y = 0, color?: string) {
    const [lod0, lod1] = this.ids.get(p.model)!;
    const id = this.mesh.addInstance(lod0);
    const m = new THREE.Matrix4().compose(
      new THREE.Vector3(p.x, y, p.z),
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), p.rot),
      new THREE.Vector3(p.scale, p.scale, p.scale),
    );
    this.mesh.setMatrixAt(id, m);
    this.mesh.setColorAt(id, new THREE.Color(color ?? '#ffffff'));
    this.inst[id] = { x: p.x, z: p.z, lod0, lod1, state: 0 };
  }

  /** state: 0 = detailed, 1 = light, 2 = hidden */
  updateLod(cx: number, cy: number, cz: number, lodDist: number, maxDist: number) {
    const l2 = lodDist * lodDist, m2 = maxDist * maxDist, h2 = cy * cy;
    for (let i = 0; i < this.inst.length; i++) {
      const it = this.inst[i];
      const dx = it.x - cx, dz = it.z - cz, d2 = dx * dx + dz * dz + h2;
      let s = d2 < l2 ? 0 : d2 < m2 ? 1 : 2;
      if (s === 1 && it.lod1 < 0) s = d2 < m2 * 0.5 ? 0 : 2; // no light version: keep detailed a bit, then hide
      if (s === it.state) continue;
      if (s === 2) this.mesh.setVisibleAt(i, false);
      else {
        if (it.state === 2) this.mesh.setVisibleAt(i, true);
        this.mesh.setGeometryIdAt(i, s === 0 ? it.lod0 : it.lod1);
      }
      it.state = s;
    }
  }
}

export async function buildCity(quality: CityQuality, onProgress: (p: number) => void): Promise<City> {
  const models = await loadCityModels([...new Set(ALL_CITY_MODELS)], (d, t) => onProgress((d / t) * 0.9));
  const sizes = new Map([...models].map(([k, m]) => [k, { x: m.size.x, y: m.size.y, z: m.size.z }]));
  const layout = generateCity(sizes);
  const group = new THREE.Group();
  const disposables: { dispose(): void }[] = [];
  const track = <T extends { dispose(): void }>(x: T) => (disposables.push(x), x);

  // ---------- ground, roads, block slabs ----------
  const terrainMat = track(createTerrainMaterial());
  const groundGeo = new GeoBuilder();
  // Slightly below the roads (y = 0.02) so the two never z-fight, even on
  // devices with a low-precision depth buffer.
  groundGeo.quad(-1600, -1600, 1600, 1600, -0.05, GRASS);
  const ground = new THREE.Mesh(track(groundGeo.build()), terrainMat);
  ground.receiveShadow = true;

  const roadSize = (HALF_CITY + ROAD_WIDTH / 2) * 2;
  const road = new THREE.Mesh(track(new THREE.PlaneGeometry(roadSize, roadSize).rotateX(-Math.PI / 2)), track(createRoadMaterial()));
  road.position.y = 0.02;
  road.receiveShadow = true;
  road.renderOrder = 1; // drawn after the ground

  const slabs = new GeoBuilder();
  const top = CURB_HEIGHT;
  for (const b of layout.blocks) {
    const s = b.slab, l = b.lot;
    slabs.walls(s, 0, top, '#9d9991');
    // sidewalk ring
    slabs.quad(s.x0, s.z0, s.x1, l.z0, top, SIDEWALK_COLOR);
    slabs.quad(s.x0, l.z1, s.x1, s.z1, top, SIDEWALK_COLOR);
    slabs.quad(s.x0, l.z0, l.x0, l.z1, top, SIDEWALK_COLOR);
    slabs.quad(l.x1, l.z0, s.x1, l.z1, top, SIDEWALK_COLOR);
    slabs.quad(l.x0, l.z0, l.x1, l.z1, top, LOT_COLORS[b.district]);
  }
  for (const p of layout.paths) slabs.quad(p.x0, p.z0, p.x1, p.z1, top + 0.01, '#e2d6bd');
  const g = layout.gas;
  slabs.quad(g.rect.x0, g.rect.z0, g.rect.x1, g.rect.z1, top + 0.01, '#55595e');
  const slabMesh = new THREE.Mesh(track(slabs.build()), terrainMat);
  slabMesh.receiveShadow = true;
  group.add(ground, road, slabMesh);

  // ---------- batched buildings, trees and props ----------
  const batchMat = track(createBatchMaterial());
  // Sketchfab models are drawn with instancing (SfInstances); the rest stays in the batches.
  const groundY = (p: Placement) => (Math.max(Math.abs(p.x), Math.abs(p.z)) < HALF_CITY + ROAD_WIDTH ? top : 0);
  const sfPlacements = new Map<string, { p: Placement; y: number }[]>();
  const oldBuildings = layout.buildings.filter((p) => !isSketchfabCity(p.model));
  const oldNature = layout.nature.filter((p) => !isSketchfabCity(p.model));
  for (const p of [...layout.buildings, ...layout.nature]) {
    if (!isSketchfabCity(p.model)) continue;
    const list = sfPlacements.get(p.model) ?? [];
    list.push({ p, y: layout.buildings.includes(p) ? top : groundY(p) });
    sfPlacements.set(p.model, list);
  }
  const sfInst = new SfInstances();
  await Promise.all([...sfPlacements].map(([model, list]) => {
    const cat = SKETCHFAB_CITY[model].category;
    const isNature = cat === 'tree' || cat === 'pine' || cat === 'bush';
    const near = isNature ? quality.natureLod : quality.buildingLod;
    // Buildings beyond the fog can't be seen: don't draw them.
    const max = cat === 'bush' ? quality.natureMax * 0.5 : isNature ? quality.natureMax : quality.fogFar * 1.05;
    return sfInst.add(model, list, near, max);
  }));
  group.add(sfInst.group);

  const bModels = [...new Set(oldBuildings.map((p) => p.model))].map((n) => models.get(n)!);
  const buildings = new LodBatch(bModels, Math.max(1, oldBuildings.length), batchMat);
  for (const p of oldBuildings) buildings.add(p, top, p.color);
  const nModels = [...new Set([...oldNature, ...layout.props].map((p) => p.model))].map((n) => models.get(n)!);
  const nature = new LodBatch(nModels, oldNature.length + layout.props.length, batchMat);
  for (const p of oldNature) nature.add(p, groundY(p));
  for (const p of layout.props) nature.add(p, top);
  group.add(track(buildings.mesh), track(nature.mesh));

  // ---------- towers ----------
  // Each tower = podium (2 floors, slightly wider) + main shaft, and tall towers get a
  // narrower setback section on top. All boxes share one InstancedMesh (1 draw call).
  type Box = { x: number; z: number; w: number; d: number; y: number; h: number; color: string };
  const boxes: Box[] = [];
  const roofParts: THREE.BufferGeometry[] = [];
  const parapet = (x: number, z: number, w: number, d: number, y: number, color: string) => {
    roofParts.push(coloredBox(w + 0.4, 0.9, 0.4, color, x, y, z - d / 2));
    roofParts.push(coloredBox(w + 0.4, 0.9, 0.4, color, x, y, z + d / 2));
    roofParts.push(coloredBox(0.4, 0.9, d, color, x - w / 2, y, z));
    roofParts.push(coloredBox(0.4, 0.9, d, color, x + w / 2, y, z));
  };
  for (const t of layout.towers) {
    const podiumH = 7.2;
    boxes.push({ x: t.x, z: t.z, w: t.w + 2, d: t.d + 2, y: top, h: podiumH, color: '#8f969e' });
    const tall = t.h > 45;
    const shaftH = tall ? Math.round((t.h * 0.7) / 3.6) * 3.6 : t.h;
    boxes.push({ x: t.x, z: t.z, w: t.w, d: t.d, y: top, h: shaftH, color: t.color });
    let topY = top + shaftH, tw = t.w, td = t.d;
    if (tall) {
      parapet(t.x, t.z, t.w, t.d, topY, t.color);
      tw = t.w * 0.72; td = t.d * 0.72;
      const upH = t.h - shaftH;
      boxes.push({ x: t.x, z: t.z, w: tw, d: td, y: topY, h: upH, color: t.color });
      topY += upH;
    }
    // Crown: a slightly wider band at the very top, then rooftop machine rooms.
    roofParts.push(coloredBox(tw + 0.8, 1.4, td + 0.8, '#5d6670', t.x, topY - 1.4, t.z));
    parapet(t.x, t.z, tw, td, topY, t.color);
    roofParts.push(coloredBox(tw * 0.35, 3.2, td * 0.3, '#9aa1a8', t.x + tw * 0.15, topY, t.z - td * 0.12));
    roofParts.push(coloredBox(3, 1.6, 2, '#b8bec4', t.x - tw * 0.25, topY, t.z + td * 0.25));
    if (tall) roofParts.push(coloredBox(0.3, 9, 0.3, '#c8ccd0', t.x + tw * 0.2, topY + 3.2, t.z - td * 0.12)); // antenna
  }
  const towerGeo = track(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0));
  const towers = new THREE.InstancedMesh(towerGeo, track(createTowerMaterial()), boxes.length);
  const m4 = new THREE.Matrix4();
  boxes.forEach((bx, i) => {
    m4.compose(new THREE.Vector3(bx.x, bx.y, bx.z), new THREE.Quaternion(), new THREE.Vector3(bx.w, bx.h, bx.d));
    towers.setMatrixAt(i, m4);
    towers.setColorAt(i, new THREE.Color(bx.color));
  });
  towers.castShadow = towers.receiveShadow = true;
  group.add(towers);

  // ---------- park: pond + fountain, gas station: canopy + pumps ----------
  const water = createWaterMaterial();
  track(water.mat);
  const pk = layout.park;
  const pond = new THREE.Mesh(track(new THREE.CircleGeometry(pk.pond.r, 64).rotateX(-Math.PI / 2)), water.mat);
  pond.position.set(pk.pond.x, top + 0.03, pk.pond.z);
  pond.receiveShadow = true;
  const fx = pk.fountain.x, fz = pk.fountain.z;
  const fountainWater = new THREE.Mesh(track(new THREE.CircleGeometry(3.4, 32).rotateX(-Math.PI / 2)), water.mat);
  fountainWater.position.set(fx, top + 0.55, fz);
  group.add(pond, fountainWater);

  const parts: THREE.BufferGeometry[] = [...roofParts];
  // pond rim stones
  for (let i = 0; i < 48; i++) {
    const a = (i / 48) * Math.PI * 2;
    parts.push(coloredBox(2.9, 0.35, 1.2, i % 2 ? '#b9b4a8' : '#a8a397', pk.pond.x + Math.cos(a) * (pk.pond.r + 0.4), top, pk.pond.z + Math.sin(a) * (pk.pond.r + 0.4)));
  }
  parts.push(coloredCylinder(4, 0.6, '#d8d2c4', fx, top, fz, 32));
  parts.push(coloredCylinder(0.6, 2.2, '#e6e0d2', fx, top, fz, 16));
  parts.push(coloredCylinder(1.6, 0.35, '#d8d2c4', fx, top + 2.2, fz, 24));
  parts.push(coloredCylinder(0.25, 0.9, '#7cc4ff', fx, top + 2.5, fz, 12));
  // gas station
  const c = g.canopy, ch = 5.5;
  for (const [x, z] of [[c.x0 + 2, c.z0 + 2], [c.x1 - 2, c.z0 + 2], [c.x0 + 2, c.z1 - 2], [c.x1 - 2, c.z1 - 2]])
    parts.push(coloredBox(0.6, ch, 0.6, '#e8ecef', x, top, z));
  parts.push(coloredBox(c.x1 - c.x0, 0.9, c.z1 - c.z0, '#f4f6f8', (c.x0 + c.x1) / 2, top + ch, (c.z0 + c.z1) / 2));
  parts.push(coloredBox(c.x1 - c.x0 + 0.1, 0.35, c.z1 - c.z0 + 0.1, '#2f8bff', (c.x0 + c.x1) / 2, top + ch + 0.3, (c.z0 + c.z1) / 2));
  for (const p of g.pumps) {
    parts.push(coloredBox(1.6, 0.25, 3.0, '#c9cdd1', p.x, top, p.z));
    parts.push(coloredBox(0.9, 1.7, 0.6, '#ffffff', p.x, top + 0.25, p.z));
    parts.push(coloredBox(0.92, 0.35, 0.62, '#2f8bff', p.x, top + 1.95, p.z));
    parts.push(coloredBox(0.6, 0.4, 0.64, '#1d2b44', p.x, top + 1.3, p.z));
  }
  parts.push(coloredBox(0.8, 9, 0.8, '#e8ecef', c.x0 - 3, top, c.z1 + 2));
  parts.push(coloredBox(3.2, 3, 0.9, '#2f8bff', c.x0 - 3, top + 8, c.z1 + 2));
  const misc = new THREE.Mesh(track(mergeGeometries(parts.map((p) => {
    // make every part share the same attribute set
    for (const n of Object.keys(p.attributes)) if (n !== 'position' && n !== 'color') p.deleteAttribute(n);
    return p;
  }))), track(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, flatShading: true })));
  parts.forEach((p) => p.dispose());
  misc.castShadow = misc.receiveShadow = true;
  group.add(misc);

  // ---------- distant hills on the horizon ----------
  group.add(createHills(track));

  onProgress(1);
  let lodTimer = 1;
  const last = new THREE.Vector2(1e9, 1e9);
  let lastY = 0;

  return {
    group,
    layout,
    update(cam, dt) {
      water.uTime.value += dt;
      lodTimer += dt;
      // Re-check LODs a few times per second, or right away after a big jump.
      if (lodTimer < 0.25 && Math.hypot(cam.x - last.x, cam.z - last.y, cam.y - lastY) < 30) return;
      lastY = cam.y;
      lodTimer = 0;
      last.set(cam.x, cam.z);
      buildings.updateLod(cam.x, cam.y, cam.z, quality.buildingLod, 2000);
      sfInst.update(cam.x, cam.y, cam.z);
      nature.updateLod(cam.x, cam.y, cam.z, quality.natureLod, quality.natureMax);
    },
    dispose() {
      disposables.forEach((d) => d.dispose());
      sfInst.dispose();
      models.forEach((m) => { m.lod0.dispose(); m.lod1?.dispose(); });
      group.removeFromParent();
    },
  };
}

/** A ring of soft low-poly hills far outside the city, so the horizon isn't empty. */
function createHills(track: <T extends { dispose(): void }>(x: T) => T): THREE.Mesh {
  const seg = 96, rings = 6, r0 = 820, r1 = 1500;
  const pos: number[] = [], col: number[] = [];
  const h = (a: number, r: number) => {
    const t = (r - r0) / (r1 - r0);
    const n = Math.sin(a * 5) * 0.5 + Math.sin(a * 11 + 1.3) * 0.3 + Math.sin(a * 23 + 0.7) * 0.2;
    return Math.max(0, Math.sin(t * Math.PI) * (60 + 45 * n));
  };
  const c1 = new THREE.Color('#6fa653'), c2 = new THREE.Color('#5c9447');
  for (let i = 0; i < seg; i++) {
    for (let j = 0; j < rings; j++) {
      const a0 = (i / seg) * Math.PI * 2, a1 = ((i + 1) / seg) * Math.PI * 2;
      const ra = r0 + ((r1 - r0) * j) / rings, rb = r0 + ((r1 - r0) * (j + 1)) / rings;
      const p = (a: number, r: number) => [Math.cos(a) * r, h(a, r), Math.sin(a) * r];
      const v = [p(a0, ra), p(a1, ra), p(a1, rb), p(a0, rb)];
      for (const k of [0, 2, 1, 0, 3, 2]) pos.push(...v[k]);
      const c = (i + j) % 2 ? c1 : c2;
      for (let k = 0; k < 6; k++) col.push(c.r, c.g, c.b);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.computeVertexNormals();
  return new THREE.Mesh(track(geo), track(new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1, side: THREE.DoubleSide })));
}
