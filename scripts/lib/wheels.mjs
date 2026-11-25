// Finds the wheels of a processed vehicle (+Z forward, on y = 0, real size), so the game can
// cut them out of the mesh and spin them. Returns [x, y, z, radius, halfWidth] per wheel:
// cars fl, fr, rl, rr (left = +X), bikes front, rear; or null when no wheels can be found.
// 1) Tire / wheel materials when the model has them (exact). 2) Otherwise the spots where the
// model touches the ground (contact patches) with a typical wheel radius.
const TIRE = /tire|tyre|wheel/i;
const NOT_TIRE = /steer|brake ?light/i;

function verts(doc) {
  const out = [];
  for (const node of doc.getRoot().listNodes()) {
    const mesh = node.getMesh();
    if (!mesh) continue;
    const m = node.getWorldMatrix();
    for (const prim of mesh.listPrimitives()) {
      const pos = prim.getAttribute('POSITION');
      const name = `${mesh.getName()} ${node.getName()} ${prim.getMaterial()?.getName() ?? ''}`;
      const tire = TIRE.test(name) && !NOT_TIRE.test(name);
      const v = [0, 0, 0];
      for (let i = 0; i < pos.getCount(); i++) {
        pos.getElement(i, v);
        out.push({
          x: m[0] * v[0] + m[4] * v[1] + m[8] * v[2] + m[12],
          y: m[1] * v[0] + m[5] * v[1] + m[9] * v[2] + m[13],
          z: m[2] * v[0] + m[6] * v[1] + m[10] * v[2] + m[14],
          tire,
        });
      }
    }
  }
  return out;
}

const box = (ps) => {
  const b = { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity, z0: Infinity, z1: -Infinity };
  for (const p of ps) {
    b.x0 = Math.min(b.x0, p.x); b.x1 = Math.max(b.x1, p.x);
    b.y0 = Math.min(b.y0, p.y); b.y1 = Math.max(b.y1, p.y);
    b.z0 = Math.min(b.z0, p.z); b.z1 = Math.max(b.z1, p.z);
  }
  return b;
};
const r3 = (n) => Math.round(n * 1000) / 1000;

export function findWheels(doc, bike, height) {
  const all = verts(doc);
  const slots = bike ? [[0, 1], [0, -1]] : [[1, 1], [-1, 1], [1, -1], [-1, -1]];
  const inSlot = (p, [sx, sz]) => (bike || Math.sign(p.x) === sx) && Math.sign(p.z) === sz;
  const wheels = [];
  for (const slot of slots) {
    const tires = all.filter((p) => p.tire && inSlot(p, slot));
    let w = null;
    if (tires.length > 30) {
      const b = box(tires);
      const r = Math.max(b.y1 - b.y0, b.z1 - b.z0) / 2;
      if (r > 0.15 && r < 0.6 && b.y0 < 0.1) w = [(b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, (b.z0 + b.z1) / 2, r, Math.max(0.05, (b.x1 - b.x0) / 2)];
    }
    if (!w) {
      // Contact patch: the lowest points of this corner.
      const low = all.filter((p) => p.y < 0.04 && inSlot(p, slot));
      if (low.length < 3) return null;
      const b = box(low);
      if (b.z1 - b.z0 > 0.6 || (!bike && b.x1 - b.x0 > 0.5)) return null; // a flat floor, not tires
      const r = bike ? 0.31 : Math.min(0.4, Math.max(0.29, height * 0.22));
      w = [bike ? 0 : (b.x0 + b.x1) / 2, r, (b.z0 + b.z1) / 2, r, bike ? 0.08 : Math.min(0.17, Math.max(0.09, (b.x1 - b.x0) / 2 + 0.03))];
    }
    wheels.push(w.map(r3));
  }
  return wheels;
}
