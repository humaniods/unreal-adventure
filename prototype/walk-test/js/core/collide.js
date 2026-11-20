'use strict';
/* Solid buildings and stalls for the Triund walk test.
   Footprints are 2-D polygons on the ground plane (x, z). The walker is a circle; resolve() pushes it out of any
   footprint it overlaps, along the nearest edge, so it slides along walls instead of stopping dead.
   A grid of 16 m cells keeps the lookup to the few footprints around the walker. */
window.TriundCollide = {
  create() {
    const CELL = 16, grid = new Map(), polys = [];
    const key = (i, j) => i * 73856093 ^ j * 19349663;
    function add(pts, low) {       // pts: [[x, z], ...], any winding, convex or not; low: knee-high (benches, tables)
      if (!pts || pts.length < 3) return;
      let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
      for (const p of pts) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); z0 = Math.min(z0, p[1]); z1 = Math.max(z1, p[1]); }
      const poly = { pts, x0, x1, z0, z1, low: !!low, off: false }, id = polys.push(poly) - 1;
      for (let i = Math.floor((x0 - 1) / CELL); i <= Math.floor((x1 + 1) / CELL); i++)
        for (let j = Math.floor((z0 - 1) / CELL); j <= Math.floor((z1 + 1) / CELL); j++) {
          const k = key(i, j); let l = grid.get(k); if (!l) grid.set(k, l = []); l.push(id);
        }
      return id;
    }
    // rectangle centred at (x, z), rotated by ry (three.js Y rotation), w along local x, d along local z
    function rect(x, z, ry, w, d, low) {
      const c = Math.cos(ry), s = Math.sin(ry), out = [];
      for (const [lx, lz] of [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]]) out.push([x + lx * c + lz * s, z - lx * s + lz * c]);
      return add(out, low);
    }
    function inside(pts, x, z) {
      let c = false;
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const a = pts[i], b = pts[j];
        if ((a[1] > z) !== (b[1] > z) && x < (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]) + a[0]) c = !c;
      }
      return c;
    }
    // nearest point on the polygon outline
    function nearest(pts, x, z) {
      let best = Infinity, bx = 0, bz = 0;
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const a = pts[j], b = pts[i], ex = b[0] - a[0], ez = b[1] - a[1], l2 = ex * ex + ez * ez || 1e-9;
        let t = ((x - a[0]) * ex + (z - a[1]) * ez) / l2; t = t < 0 ? 0 : t > 1 ? 1 : t;
        const px = a[0] + ex * t, pz = a[1] + ez * t, d2 = (x - px) ** 2 + (z - pz) ** 2;
        if (d2 < best) { best = d2; bx = px; bz = pz; }
      }
      return { x: bx, z: bz, d: Math.sqrt(best) };
    }
    // push a circle (x, z, r) out of every footprint it touches; two passes settle corners.
    // rLow (optional): a smaller radius against knee-high things (benches, tables), so a walker whose eye-height
    // margin is wide for walls can still pass between two benches like a real body
    function resolve(x, z, r0, rLow) {
      for (let pass = 0; pass < 2; pass++) {
        const l = grid.get(key(Math.floor(x / CELL), Math.floor(z / CELL))); if (!l) break;
        let moved = false;
        for (const id of l) {
          const p = polys[id], r = p.low && rLow != null ? rLow : r0;
          if (p.off) continue;
          if (x < p.x0 - r || x > p.x1 + r || z < p.z0 - r || z > p.z1 + r) continue;
          const n = nearest(p.pts, x, z), inn = inside(p.pts, x, z);
          if (!inn && n.d >= r) continue;
          let nx = x - n.x, nz = z - n.z; const l2 = Math.hypot(nx, nz) || 1e-6; nx /= l2; nz /= l2;
          if (inn) { nx = -nx; nz = -nz; }
          x = n.x + nx * r; z = n.z + nz * r; moved = true;
        }
        if (!moved) break;
      }
      return { x, z };
    }
    // inside(x, z, tallOnly): tallOnly skips knee-high things a camera can look over
    // a round footprint (tree trunk, boulder): an octagon of radius r
    function circle(x, z, r, low) { const pts = []; for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; pts.push([x + Math.cos(a) * r, z + Math.sin(a) * r]); } return add(pts, low); }
    // disable(id): the thing is gone (a tree cleared from in front of a sign board)
    const disable = id => { if (id != null && polys[id]) polys[id].off = true; };
    const enable = id => { if (id != null && polys[id]) polys[id].off = false; };
    return { add, rect, circle, resolve, disable, enable, inside: (x, z, tallOnly) => { const l = grid.get(key(Math.floor(x / CELL), Math.floor(z / CELL))) || []; return l.some(id => !polys[id].off && !(tallOnly && polys[id].low) && inside(polys[id].pts, x, z)); }, get count() { return polys.length; } };
  }
};
