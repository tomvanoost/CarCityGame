import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { CURB_HEIGHT, HALF_CITY, ROAD_WIDTH, generateCity, type CityLayout, type District, type Placement, type Rect } from './layout';
import { createBatchMaterial, createRoadMaterial, createTerrainMaterial, createTowerMaterial, createWaterMaterial } from './materials';
import { ALL_CITY_MODELS, isSketchfabCity, loadCityModels, type CityModel } from './models';
import { SKETCHFAB_CITY } from './sketchfabCity';
import { SfInstances } from './sfInstances';
import { buildOutskirts } from './outskirtsBuilder';
import { Knockables, type KnockTarget } from './knockables';

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
  /** Tips over the tree / lamp post at (x, z) the way (dirX, dirZ); onBack runs when it stands again. */
  knock(x: number, z: number, dirX: number, dirZ: number, onBack: () => void): boolean;
  dispose(): void;
}

const LOT_COLORS: Record<District, string> = {
  downtown: '#a9a59d', midrise: '#a9a59d', shops: '#80b35c', townhouses: '#7fb25b',
  apartments: '#82b55e', residential: '#7db35a', park: '#79b458', gas: '#7fb25b',
};
import { CURB_COLOR, SIDEWALK_COLOR } from './materials';

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

/** A soft dark rectangle with blurred edges (for the ground shadow around a building). */
function softRectTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  g.filter = 'blur(12px)';
  g.fillStyle = 'rgba(0,0,0,1)';
  g.fillRect(26, 26, 76, 76);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function softDiscTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grd = g.createRadialGradient(32, 32, 2, 32, 32, 32);
  grd.addColorStop(0, 'rgba(0,0,0,0.9)'); grd.addColorStop(0.5, 'rgba(0,0,0,0.5)'); grd.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

/**
 * Soft contact shadows on the ground ("ambient occlusion" feel, no post-processing): a blurred dark
 * rectangle around the foot of every building and a soft round blob under every tree and bush.
 * Two instanced meshes (2 draw calls), drawn just above the ground.
 */
function groundShadows(layout: CityLayout, models: Map<string, CityModel>, groundY: (p: Placement) => number, track: <T extends { dispose(): void }>(x: T) => T) {
  const group = new THREE.Group();
  const mat = (tex: THREE.Texture, opacity: number) => track(new THREE.MeshBasicMaterial({ map: track(tex), transparent: true, depthWrite: false, opacity, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  const plane = track(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2));
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), pos = new THREE.Vector3(), scl = new THREE.Vector3();
  // Buildings: footprint + a margin (the texture's blurred edge falls just outside the walls).
  const sizeOf = (p: Placement) => {
    const sf = SKETCHFAB_CITY[p.model];
    if (sf) return { x: sf.x * p.scale, z: sf.z * p.scale };
    const md = models.get(p.model);
    return md ? { x: md.size.x * p.scale, z: md.size.z * p.scale } : null;
  };
  const bList = layout.buildings.map((p) => ({ p, s: sizeOf(p) })).filter((b) => b.s);
  const bMesh = new THREE.InstancedMesh(plane, mat(softRectTexture(), 0.55), Math.max(1, bList.length));
  bList.forEach(({ p, s }, i) => {
    // The texture's solid core is 60 % of its size: scale so the core matches the walls.
    m.compose(pos.set(p.x, CURB_HEIGHT + 0.012, p.z), q.setFromAxisAngle(up, p.rot), scl.set(s!.x / 0.6 + 1.2, 1, s!.z / 0.6 + 1.2));
    bMesh.setMatrixAt(i, m);
  });
  bMesh.count = bList.length;
  // Trees and bushes (not rocks, flowers or lily pads).
  const tree = (p: Placement) => {
    const sf = SKETCHFAB_CITY[p.model];
    if (sf) return sf.category === 'tree' || sf.category === 'pine' ? 3.6 : sf.category === 'bush' ? 1.6 : 0;
    return /tree|pine|birch|willow|palm/i.test(p.model) ? 3.6 : /bush|hedge|shrub/i.test(p.model) ? 1.6 : 0;
  };
  const tList = layout.nature.map((p) => ({ p, d: tree(p) })).filter((t) => t.d > 0);
  const tMesh = new THREE.InstancedMesh(plane, mat(softDiscTexture(), 0.6), Math.max(1, tList.length));
  tList.forEach(({ p, d }, i) => {
    m.compose(pos.set(p.x, groundY(p) + 0.014, p.z), q.identity(), scl.set(d * p.scale, 1, d * p.scale));
    tMesh.setMatrixAt(i, m);
  });
  tMesh.count = tList.length;
  for (const im of [bMesh, tMesh]) { im.renderOrder = 1; im.receiveShadow = false; im.castShadow = false; im.frustumCulled = false; group.add(im); }
  return group;
}

/**
 * A plain box with the model's size and the same vertex attributes as its other LODs (for the batch):
 * walls in the building's own wall colour (aMain = 1), a darker roof. 12 triangles, for far away.
 */
function boxLod(m: CityModel): THREE.BufferGeometry {
  const ref = m.lod1 ?? m.lod0;
  ref.computeBoundingBox();
  const bb = ref.boundingBox!, size = bb.getSize(new THREE.Vector3()), c = bb.getCenter(new THREE.Vector3());
  const box = new THREE.BoxGeometry(size.x * 0.97, size.y, size.z * 0.97).translate(c.x, c.y, c.z);
  const n = box.getAttribute('position').count, nrm = box.getAttribute('normal');
  const geo = new THREE.BufferGeometry();
  geo.setIndex(box.getIndex()!.clone());
  for (const [name, attr] of Object.entries(ref.attributes)) {
    if (name === 'position' || name === 'normal') { geo.setAttribute(name, box.getAttribute(name).clone()); continue; }
    const a = new Float32Array(n * attr.itemSize);
    for (let i = 0; i < n; i++) {
      const top = nrm.getY(i) > 0.5;
      // (walls a bit dark: windows and shade averaged in)
      if (name === 'color') { const col = top ? [0.3, 0.28, 0.27] : [0.62, 0.6, 0.58]; for (let k = 0; k < attr.itemSize; k++) a[i * attr.itemSize + k] = k < 3 ? col[k] : 1; }
      else if (name === 'aMain') a[i] = top ? 0 : 1;
    }
    geo.setAttribute(name, new THREE.BufferAttribute(a, attr.itemSize, attr.normalized));
  }
  box.dispose();
  return geo;
}

/**
 * A BatchedMesh where each instance switches between a detailed geometry, a light one, a plain box
 * (far away) or hides (beyond the fog), based on distance to the camera.
 */
class LodBatch {
  mesh: THREE.BatchedMesh;
  private ids = new Map<string, [number, number, number]>();
  private inst: { x: number; z: number; lod0: number; lod1: number; box: number; state: number }[] = [];

  /** boxes: also add a plain box version of every model (for buildings far away). */
  constructor(models: CityModel[], instances: number, material: THREE.Material, boxes = false) {
    let verts = 0, idx = 0;
    const boxGeos = new Map<string, THREE.BufferGeometry>();
    for (const m of models) {
      if (boxes) boxGeos.set(m.name, boxLod(m));
      verts += m.lod0.getAttribute('position').count + (m.lod1?.getAttribute('position').count ?? 0) + (boxes ? 24 : 0);
      idx += m.lod0.getIndex()!.count + (m.lod1?.getIndex()!.count ?? 0) + (boxes ? 36 : 0);
    }
    this.mesh = new THREE.BatchedMesh(instances, verts, idx, material);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    for (const m of models) {
      const a = this.mesh.addGeometry(m.lod0);
      const b = m.lod1 ? this.mesh.addGeometry(m.lod1) : -1;
      const bx = boxGeos.has(m.name) ? this.mesh.addGeometry(boxGeos.get(m.name)!) : -1;
      boxGeos.get(m.name)?.dispose();
      this.ids.set(m.name, [a, b, bx]);
    }
  }

  add(p: Placement, y = 0, color?: string) {
    const [lod0, lod1, box] = this.ids.get(p.model)!;
    const id = this.mesh.addInstance(lod0);
    const m = new THREE.Matrix4().compose(
      new THREE.Vector3(p.x, y, p.z),
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), p.rot),
      new THREE.Vector3(p.scale, p.scale, p.scale),
    );
    this.mesh.setMatrixAt(id, m);
    this.mesh.setColorAt(id, new THREE.Color(color ?? '#ffffff'));
    this.inst[id] = { x: p.x, z: p.z, lod0, lod1, box, state: 0 };
  }

  /** The instance standing at (x, z), to tip it over (null if none). */
  find(x: number, z: number): KnockTarget | null {
    const id = this.inst.findIndex((q) => q && Math.abs(q.x - x) < 0.3 && Math.abs(q.z - z) < 0.3);
    if (id < 0) return null;
    return { get: (out) => { this.mesh.getMatrixAt(id, out); }, set: (m) => { this.mesh.setMatrixAt(id, m); } };
  }

  /** state: 0 = detailed, 1 = light, 3 = box, 2 = hidden. boxDist: from here on a plain box (Infinity = never). */
  updateLod(cx: number, cy: number, cz: number, lodDist: number, maxDist: number, boxDist = Infinity) {
    const l2 = lodDist * lodDist, m2 = maxDist * maxDist, b2 = boxDist * boxDist, h2 = cy * cy;
    for (let i = 0; i < this.inst.length; i++) {
      const it = this.inst[i];
      const dx = it.x - cx, dz = it.z - cz, d2 = dx * dx + dz * dz + h2;
      let s = d2 < l2 ? 0 : d2 < m2 ? 1 : 2;
      if (s === 1 && it.lod1 < 0) s = d2 < m2 * 0.5 ? 0 : 2; // no light version: keep detailed a bit, then hide
      if (s === 1 && d2 >= b2 && it.box >= 0) s = 3;
      if (s === it.state) continue;
      if (s === 2) this.mesh.setVisibleAt(i, false);
      else {
        if (it.state === 2) this.mesh.setVisibleAt(i, true);
        this.mesh.setGeometryIdAt(i, s === 0 ? it.lod0 : s === 1 ? it.lod1 : it.box);
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

  const roadSize = (HALF_CITY + ROAD_WIDTH / 2) * 2;
  const road = new THREE.Mesh(track(new THREE.PlaneGeometry(roadSize, roadSize).rotateX(-Math.PI / 2)), track(createRoadMaterial()));
  road.position.y = 0.02;
  road.receiveShadow = true;
  road.renderOrder = 1; // drawn after the ground

  const slabs = new GeoBuilder();
  const top = CURB_HEIGHT;
  for (const b of layout.blocks) {
    const s = b.slab, l = b.lot;
    slabs.walls(s, 0, top, CURB_COLOR);
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
  group.add(road, slabMesh);

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
  const buildings = new LodBatch(bModels, Math.max(1, oldBuildings.length), batchMat, true);
  for (const p of oldBuildings) buildings.add(p, top, p.color);
  const nModels = [...new Set([...oldNature, ...layout.props].map((p) => p.model))].map((n) => models.get(n)!);
  const nature = new LodBatch(nModels, oldNature.length + layout.props.length, batchMat);
  for (const p of oldNature) nature.add(p, groundY(p));
  for (const p of layout.props) nature.add(p, top);
  group.add(track(buildings.mesh), track(nature.mesh));
  group.add(groundShadows(layout, models, groundY, track));

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
  const tallest = Math.max(...layout.towers.map((t) => t.h));
  layout.towers.forEach((t, ti) => {
    const podiumH = 7.2;
    boxes.push({ x: t.x, z: t.z, w: t.w + 2, d: t.d + 2, y: top, h: podiumH, color: '#8f969e' });
    // Entrance canopies over the doors in the middle of each podium side (the doors are in the shader).
    const pw = (t.w + 2) / 2, pd = (t.d + 2) / 2;
    roofParts.push(
      coloredBox(4.4, 0.25, 1.8, '#2f3a46', t.x, top + 3.15, t.z + pd + 0.9), coloredBox(4.4, 0.25, 1.8, '#2f3a46', t.x, top + 3.15, t.z - pd - 0.9),
      coloredBox(1.8, 0.25, 4.4, '#2f3a46', t.x + pw + 0.9, top + 3.15, t.z), coloredBox(1.8, 0.25, 4.4, '#2f3a46', t.x - pw - 0.9, top + 3.15, t.z),
    );
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
    // A different rooftop on every tower: helipad on the tallest, else a water tank, a garden or cooling units.
    const rx = t.x - tw * 0.2, rz = t.z - td * 0.2;
    if (t.h === tallest) {
      const r = Math.min(tw, td) * 0.22;
      roofParts.push(coloredCylinder(r + 0.4, 0.2, '#f2f2f2', rx, topY, rz, 32), coloredCylinder(r, 0.24, '#3a4250', rx, topY, rz, 32));
      roofParts.push(coloredBox(r * 0.18, 0.26, r * 1.1, '#f2f2f2', rx - r * 0.35, topY, rz), coloredBox(r * 0.18, 0.26, r * 1.1, '#f2f2f2', rx + r * 0.35, topY, rz), coloredBox(r * 0.7, 0.26, r * 0.18, '#f2f2f2', rx, topY, rz));
    } else if (ti % 3 === 0) {
      for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) roofParts.push(coloredBox(0.22, 1.8, 0.22, '#6e5a44', rx + dx * 1.1, topY, rz + dz * 1.1));
      roofParts.push(coloredCylinder(1.6, 2.6, '#a8835a', rx, topY + 1.8, rz, 20), coloredCylinder(1.75, 0.5, '#7a6045', rx, topY + 4.4, rz, 20));
    } else if (ti % 3 === 1) {
      roofParts.push(coloredBox(tw * 0.45, 0.35, td * 0.4, '#6fae4f', rx, topY, rz));
      for (const [dx, dz] of [[-0.12, -0.1], [0.1, 0.08], [-0.05, 0.12]]) roofParts.push(coloredCylinder(0.8, 1.4, '#4f9a3c', rx + dx * tw, topY + 0.35, rz + dz * td, 8));
    } else {
      for (let k = 0; k < 3; k++) {
        roofParts.push(coloredBox(2.2, 1.3, 2.2, '#c4c9ce', rx + (k - 1) * 2.8, topY, rz));
        roofParts.push(coloredCylinder(0.8, 0.12, '#59616b', rx + (k - 1) * 2.8, topY + 1.3, rz, 16));
      }
    }
  });
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
  // Everything outside the city: ground (grass, desert dunes), roads out, the lake with its bridges.
  // (The ground sits slightly below the roads at y = 0.02, so the two never z-fight.)
  const outskirts = buildOutskirts(layout, terrainMat, water.mat, track);
  group.add(outskirts);

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
    // Island with yellow bumper posts at both ends.
    parts.push(coloredBox(1.6, 0.25, 3.0, '#c9cdd1', p.x, top, p.z));
    parts.push(coloredBox(1.66, 0.06, 3.06, '#f2c230', p.x, top + 0.25, p.z));
    for (const dz of [-1.3, 1.3]) parts.push(coloredCylinder(0.11, 0.85, '#ffc933', p.x, top + 0.3, p.z + dz, 10));
    // Pump: white body on a dark plinth, blue top, display and nozzles on both sides.
    parts.push(coloredBox(0.86, 0.18, 0.66, '#3a4556', p.x, top + 0.3, p.z));
    parts.push(coloredBox(0.8, 1.6, 0.6, '#ffffff', p.x, top + 0.48, p.z));
    parts.push(coloredBox(0.84, 0.38, 0.64, '#2f8bff', p.x, top + 2.06, p.z));
    parts.push(coloredBox(0.86, 0.06, 0.66, '#1f6fd6', p.x, top + 2.44, p.z));
    parts.push(coloredBox(0.84, 0.34, 0.42, '#1d2b44', p.x, top + 1.55, p.z)); // screen
    parts.push(coloredBox(0.83, 0.1, 0.5, '#20b76b', p.x, top + 1.32, p.z)); // fuel stripe
    for (const dz of [-0.17, 0.17]) {
      parts.push(coloredBox(0.96, 0.22, 0.14, '#2b2f36', p.x, top + 0.95, p.z + dz)); // nozzle holders
      parts.push(coloredBox(1.02, 0.12, 0.07, dz < 0 ? '#20b76b' : '#e5484d', p.x, top + 1.05, p.z + dz)); // nozzles
    }
  }
  // Car wash: two walls, a roof with a blue band, and a round bubble sign on top.
  const w = g.wash, wcx = (w.x0 + w.x1) / 2, wcz = (w.z0 + w.z1) / 2, wl = w.x1 - w.x0, wh = 3.6;
  for (const zz of [w.z0 - 0.25, w.z1 + 0.25]) {
    parts.push(coloredBox(wl, wh, 0.5, '#f4f6f8', wcx, top, zz));
    parts.push(coloredBox(wl + 0.02, 0.5, 0.52, '#2f8bff', wcx, top + 0.5, zz));
  }
  parts.push(coloredBox(wl + 0.6, 0.45, w.z1 - w.z0 + 1.6, '#e8ecef', wcx, top + wh, wcz));
  parts.push(coloredBox(wl + 0.62, 0.3, w.z1 - w.z0 + 1.62, '#2f8bff', wcx, top + wh + 0.1, wcz));
  parts.push(coloredBox(0.25, 1.2, 0.25, '#e8ecef', wcx, top + wh + 0.45, wcz));
  // Standing round sign (facing the road, -X): a light-blue disc with white "bubbles".
  const disc = (r: number, color: string, dy: number, dz: number, dx: number) =>
    coloredCylinder(r, 0.25, color, 0, -0.125, 0, 24).rotateZ(Math.PI / 2).translate(wcx + dx, top + wh + 1.9 + dy, wcz + dz);
  parts.push(disc(1.1, '#7cc4ff', 0, 0, 0), disc(0.42, '#ffffff', 0.2, -0.3, -0.06), disc(0.26, '#ffffff', -0.35, 0.35, -0.06), disc(0.18, '#ffffff', 0.45, 0.45, -0.06));
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
  const knockables = new Knockables();
  let lodTimer = 1;
  const last = new THREE.Vector2(1e9, 1e9);
  let lastY = 0;

  return {
    group,
    layout,
    knock(x, z, dirX, dirZ, onBack) {
      const target = sfInst.find(x, z) ?? nature.find(x, z);
      if (!target) { onBack(); return false; }
      knockables.knock(target, dirX, dirZ, onBack);
      return true;
    },
    update(cam, dt) {
      water.uTime.value += dt;
      if (knockables.active) knockables.update(dt, cam);
      outskirts.userData.update?.(dt); // windmill sails
      lodTimer += dt;
      // Re-check LODs a few times per second, or right away after a big jump.
      if (lodTimer < 0.25 && Math.hypot(cam.x - last.x, cam.z - last.y, cam.y - lastY) < 30) return;
      lastY = cam.y;
      lodTimer = 0;
      last.set(cam.x, cam.z);
      // Light version beyond buildingLod, a plain box deep in the fog (75% of the fog distance), nothing beyond it.
      buildings.updateLod(cam.x, cam.y, cam.z, quality.buildingLod, quality.fogFar * 1.05, Math.max(quality.buildingLod * 2, quality.fogFar * 0.75));
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
  const seg = 128, rings = 6, r0 = 2500, r1 = 3300; // beyond the towns at the world edge (2300 m)
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
