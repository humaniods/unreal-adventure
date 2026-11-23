'use strict';
/* McLeod Ganj and Dharamkot as they are: the street is lined with shops.
   For every OSM building in town (more than 300 m south of Gallu Devi) each wall that faces a street (OSM ways
   exported by build.py) gets, at street level:
   - shop fronts: open shutters rolled up over a lit interior with shelves of goods, or a shutter pulled down;
     a sign board over each with the real name from OSM (restaurant, cafe, bar, bakery, guest house...) where the
     place is in that building, otherwise the kind of shop the town is full of (woollens, handicrafts, momos, money
     exchange, trek gear, mobile recharge...); awnings over some
   - balconies with railings on the upper floors
   Across the streets: strings of Tibetan prayer flags. Along the roads: electric poles with sagging wires.
   In front of the shops: parked scooters and motorbikes.
   Everything is merged into a few meshes per 240 m chunk and the signs share one canvas atlas, so the 1 GB
   GPU holds all of it.
   Interface: build(o) -> { counts } */
window.TriundTown = {
  build(o) {
    const { THREE, scene, H, data, streets, avoid, collide, rng } = o, GD = o.goods || null;
    const shops = [];   // open shops you can buy from: { x, z (in front of the counter), nx, nz, title, cat }
    const lin = c => new THREE.Color(c).convertSRGBToLinear();
    const TOWN_Z = 300;                                     // world z (= -north) beyond which is town
    const counts = { walls: 0, shops: 0, named: 0, balconies: 0, flags: 0, poles: 0, bikes: 0 };
    const R = rng ? rng(4242) : Math.random;

    /* ---------- streets: segment grid ---------- */
    const CELL = 16, G = new Map(), K = (i, j) => i * 70001 + j, SEG = [];
    for (const st of streets || []) {
      if (st.k === 'steps') continue;
      const pts = st.e.map((e, i) => [e, -st.n[i]]);
      if (!pts.some(p => p[1] > TOWN_Z - 50)) continue;
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1], b = pts[i], id = SEG.push({ a, b, k: st.k, nm: st.nm }) - 1;
        for (let x = Math.floor(Math.min(a[0], b[0]) / CELL); x <= Math.floor(Math.max(a[0], b[0]) / CELL); x++)
          for (let z = Math.floor(Math.min(a[1], b[1]) / CELL); z <= Math.floor(Math.max(a[1], b[1]) / CELL); z++) { const k = K(x, z); let l = G.get(k); if (!l) G.set(k, l = []); l.push(id); }
      }
    }
    function nearStreet(x, z) {
      let best = Infinity, bs = null; const i0 = Math.floor(x / CELL), j0 = Math.floor(z / CELL);
      for (let i = i0 - 1; i <= i0 + 1; i++) for (let j = j0 - 1; j <= j0 + 1; j++) for (const id of G.get(K(i, j)) || []) {
        const s = SEG[id], ex = s.b[0] - s.a[0], ez = s.b[1] - s.a[1], l2 = ex * ex + ez * ez || 1e-9, t = Math.max(0, Math.min(1, ((x - s.a[0]) * ex + (z - s.a[1]) * ez) / l2));
        const d = Math.hypot(s.a[0] + ex * t - x, s.a[1] + ez * t - z); if (d < best) { best = d; bs = s; }
      }
      return { d: best, s: bs };
    }

    /* ---------- merged geometry with vertex colours ---------- */
    function Batch() { this.p = []; this.n = []; this.c = []; this.uv = []; }
    Batch.prototype.quad = function (a, b, c, d, col, uv) {
      const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = d[0] - a[0], vy = d[1] - a[1], vz = d[2] - a[2];
      let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
      const U = uv || [[0, 0], [1, 0], [1, 1], [0, 1]];
      for (const [p, t] of [[a, U[0]], [b, U[1]], [c, U[2]], [a, U[0]], [c, U[2]], [d, U[3]]]) { this.p.push(p[0], p[1], p[2]); this.n.push(nx, ny, nz); this.c.push(col.r, col.g, col.b); this.uv.push(t[0], t[1]); }
    };
    // an axis box in a local frame: origin o, unit wall direction (ux, uz), outward normal (nx, nz)
    Batch.prototype.box = function (F, u0, u1, y0, y1, n0, n1, col) {
      const P = (u, y, n) => [F.ox + F.ux * u + F.nx * n, y, F.oz + F.uz * u + F.nz * n];
      const a = P(u0, y0, n1), b = P(u1, y0, n1), c = P(u1, y1, n1), d = P(u0, y1, n1), e = P(u0, y0, n0), f = P(u1, y0, n0), g = P(u1, y1, n0), h = P(u0, y1, n0);
      this.quad(a, b, c, d, col); this.quad(f, e, h, g, col); this.quad(d, c, g, h, col); this.quad(e, f, b, a, col); this.quad(b, f, g, c, col); this.quad(e, a, d, h, col);
    };
    Batch.prototype.mesh = function (mat) {
      if (!this.p.length) return null;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
      const m = new THREE.Mesh(g, mat); m.castShadow = true; m.receiveShadow = true; scene.add(m); return m;
    };
    // chunks of 240 m: each its own meshes, hidden beyond 450 m (update)
    const CHK = 240, chunks = new Map();
    const chunk = (x, z) => { const k = Math.floor(x / CHK) + "," + Math.floor(z / CHK); let c = chunks.get(k); if (!c) chunks.set(k, c = { x: (Math.floor(x / CHK) + 0.5) * CHK, z: (Math.floor(z / CHK) + 0.5) * CHK, facade: new Batch(), signs: new Batch(), flags: new Batch(), poles: new Batch(), bikes: new Batch(), goods: GD ? new GD.Quads() : null, meshes: [] }); return c; };
    let facade = null, signs = null, flags = null, goods = null;
    const C = (h, k) => lin(h).multiplyScalar(k == null ? 1 : k);

    /* ---------- sign atlas: 8 x 42 cells of 256 x 48 px ---------- */
    const AW = 2048, AH = 2048, CW = 256, CH = 48, COLS = AW / CW, ROWS = Math.floor(AH / CH);
    const atlas = document.createElement('canvas'); atlas.width = AW; atlas.height = AH; const ax = atlas.getContext('2d');
    ax.fillStyle = '#333'; ax.fillRect(0, 0, AW, AH);
    const cells = new Map(); let nextCell = 0;
    const PALETTE = [['#b3261e', '#fff4e0'], ['#1f4e8c', '#ffffff'], ['#1f6b3a', '#fff8d8'], ['#f2c230', '#2a1a04'], ['#f4f1ea', '#7a1f1f'], ['#6b1f2a', '#f2d27a'], ['#e07a1f', '#ffffff'], ['#2a2a2a', '#f2c230'], ['#7a3fa0', '#ffffff']];
    function cell(title, sub, pal) {
      const key = title + '|' + sub + '|' + pal; if (cells.has(key)) return cells.get(key);
      if (nextCell >= COLS * ROWS) return cells.values().next().value;
      const i = nextCell++, cx = (i % COLS) * CW, cy = Math.floor(i / COLS) * CH, [bg, fg] = PALETTE[pal % PALETTE.length];
      ax.fillStyle = bg; ax.fillRect(cx, cy, CW, CH);
      ax.strokeStyle = fg; ax.globalAlpha = 0.5; ax.lineWidth = 2; ax.strokeRect(cx + 3, cy + 3, CW - 6, CH - 6); ax.globalAlpha = 1;
      ax.fillStyle = fg; ax.textAlign = 'center'; ax.textBaseline = 'middle';
      let fs = sub ? 24 : 30; const t = title.toUpperCase();
      ax.font = `700 ${fs}px Rajdhani, 'Arial Narrow', sans-serif`;
      while (ax.measureText(t).width > CW - 16 && fs > 12) { fs--; ax.font = `700 ${fs}px Rajdhani, 'Arial Narrow', sans-serif`; }
      ax.fillText(t, cx + CW / 2, cy + (sub ? 18 : CH / 2 + 1));
      if (sub) { ax.font = `600 13px Rajdhani, 'Arial Narrow', sans-serif`; ax.fillText(sub.toUpperCase(), cx + CW / 2, cy + 38); }
      const uv = { u0: cx / AW, u1: (cx + CW) / AW, v0: 1 - (cy + CH) / AH, v1: 1 - cy / AH }; cells.set(key, uv); return uv;
    }
    // what the town's shops are (generic, for the ones OSM does not name)
    const GENERIC = [['Woollen Shawls', 'Kullu · Pashmina'], ['Tibetan Handicrafts', 'Singing bowls · Thangka'], ['Momos & Thukpa', 'Veg · Chicken'], ['General Store', 'Biscuits · Cold drinks'],
      ['Money Exchange', 'Travel · Taxi booking'], ['Trek Gear', 'Rent · Sale'], ['Mobile & Recharge', 'Sim cards · Accessories'], ['Chemist', 'Medicines'], ['Books & Maps', 'Second-hand books'],
      ['Bakery', 'Cakes · Cookies'], ['Juice Corner', 'Fresh juice · Lassi'], ['Tailor', 'Alterations'], ['Cyber Cafe', 'Print · Xerox'], ['Fruit & Vegetables', ''], ['Jewellery', 'Silver · Turquoise'], ['Kiryana Store', 'Daily needs']];
    const SUB = { restaurant: 'Restaurant', cafe: 'Cafe', bar: 'Bar', fast_food: 'Fast food', bakery: 'Bakery', kiosk: 'Kiosk', convenience: 'General store', greengrocer: 'Fruit · Vegetables',
      gift: 'Gifts · Handicrafts', clothes: 'Clothes', laundry: 'Laundry', tattoo: 'Tattoo studio', guest_house: 'Guest house', hotel: 'Hotel', hostel: 'Hostel', cosmetics: 'Cosmetics', butcher: 'Meat shop', books: 'Books' };

    /* ---------- named places by building ---------- */
    const byB = new Map();
    for (const p of data.pois) if (p.b >= 0 && p.name && p.n < -TOWN_Z && ['cafe', 'shop', 'lodge'].includes(p.kind) && !(o.skipIds && o.skipIds.has(p.id))) { let l = byB.get(p.b); if (!l) byB.set(p.b, l = []); l.push(p); }
    const avoidNear = (x, z, r) => (avoid || []).some(a => (a.x - x) ** 2 + (a.z - z) ** 2 < r * r);

    const metal = C(0x7d8287), metalD = C(0x5d6267), dark = C(0x16130f), shelf = C(0x8a6a48), wallW = [0xe8e2d4, 0xf0e6cc, 0xe6cfc4, 0xcfe0e6, 0xd8e6cf, 0xf2e2a8, 0xe2c8a8];
    const AWN = [0x1f5fa8, 0x2f8a4a, 0xb3261e, 0xe0a020, 0x3a3a3a, 0x7a3fa0];
    const RAIL = [0xf2f2ee, 0x2f6f4f, 0x1f4e8c, 0x8a6a48, 0x3a3a3a, 0xc9a23a];
    const GOODS = [0xe0402a, 0xf2c230, 0x2f6fd6, 0x2f9a52, 0xf08a24, 0xd04a8a, 0xf2f2ee, 0x8a5a3c, 0x40c0c0];
    const bikes = [];

    data.buildings.forEach((b, bi) => {
      const P = []; let cx = 0, cz = 0;
      for (let k = 0; k < b.p.length; k += 2) { P.push([b.p[k], -b.p[k + 1]]); cx += b.p[k]; cz -= b.p[k + 1]; }
      cx /= P.length; cz /= P.length; if (cz < TOWN_Z) return;
      let area = 0; for (let i = 0, j = P.length - 1; i < P.length; j = i++) area += (P[j][0] + P[i][0]) * (P[j][1] - P[i][1]);
      const sgn = area > 0 ? 1 : -1;
      let gMax = -Infinity; for (const p of P) gMax = Math.max(gMax, H(p[0], p[1]));
      const lv = b.lv || 1, yG = gMax + 0.15, yt = yG + lv * 2.9;
      const r = rng ? rng(bi * 31 + 7) : Math.random;
      const named = (byB.get(bi) || []).slice(), frames = [];
      { const c = chunk(cx, cz); facade = c.facade; signs = c.signs; goods = c.goods; }
      for (let i = 0; i < P.length; i++) {
        const a = P[i], c = P[(i + 1) % P.length], ex = c[0] - a[0], ez = c[1] - a[1], len = Math.hypot(ex, ez);
        if (len < 2.8) continue;
        const ux = ex / len, uz = ez / len; let nx = uz * sgn, nz = -ux * sgn;
        const mx = (a[0] + c[0]) / 2, mz = (a[1] + c[1]) / 2;
        // outward: half a metre out is outside the footprint
        { let inside = false; const tx = mx + nx * 0.5, tz = mz + nz * 0.5; for (let p = 0, q = P.length - 1; p < P.length; q = p++) if ((P[p][1] > tz) !== (P[q][1] > tz) && tx < (P[q][0] - P[p][0]) * (tz - P[p][1]) / (P[q][1] - P[p][1] + 1e-12) + P[p][0]) inside = !inside; if (inside) { nx = -nx; nz = -nz; } }
        // a street within 9 m in front, running along the wall
        let st = null;
        for (const d of [2, 3.5, 5, 7, 9]) { const q = nearStreet(mx + nx * d, mz + nz * d); if (q.s && q.d < 2.2) { const sx = q.s.b[0] - q.s.a[0], sz = q.s.b[1] - q.s.a[1], sl = Math.hypot(sx, sz) || 1; if (Math.abs((sx * nx + sz * nz) / sl) < 0.6) { st = { d, s: q.s }; break; } } }
        // text on the wall reads left to right for someone facing it
        const flip = ux * nz - uz * nx < 0;
        frames.push({ F: { ox: a[0], oz: a[1], ux, uz, nx, nz }, len, flip });
        if (!st) continue;
        counts.walls++;
        const F = { ox: a[0], oz: a[1], ux, uz, nx, nz };
        const yS = H(mx + nx * 1.5, mz + nz * 1.5);          // street level in front of the wall
        const y0 = Math.max(yS, yG - 2.2) + 0.03;
        // shop fronts at street level
        const n = Math.max(1, Math.min(4, Math.floor(len / 3.3))), uw = len / n;
        if (y0 + 2.7 < yt + 0.2) for (let j = 0; j < n; j++) {
          const u0 = j * uw + 0.3, u1 = (j + 1) * uw - 0.3, um = (u0 + u1) / 2, wx = F.ox + ux * um, wz = F.oz + uz * um;
          if (avoidNear(wx + nx * 0.5, wz + nz * 0.5, 2.6)) continue;   // a cafe's own storefront is already here
          counts.shops++;
          // the sign: a real name where the place is in this building, else the kind of shop
          let title, sub, pal;
          const near = named.length ? named.reduce((bi2, p, k) => { const d = (p.e - wx) ** 2 + (-p.n - wz) ** 2; return d < bi2.d ? { d, k } : bi2; }, { d: Infinity, k: -1 }) : { d: Infinity, k: -1 };
          const pi = near.d < 22 * 22 ? near.k : -1;
          if (pi >= 0) { const p = named.splice(pi, 1)[0]; title = p.name; sub = [SUB[p.t] || '', p.cu ? p.cu.charAt(0).toUpperCase() + p.cu.slice(1) : ''].filter(Boolean).join(' · '); pal = (p.name.length * 7) % PALETTE.length; counts.named++; }
          else { const g = GENERIC[(r() * GENERIC.length) | 0]; title = g[0]; sub = g[1]; pal = (r() * PALETTE.length) | 0; }
          const closed = r() < 0.18, oh = 2.45;
          // the opening: the shop inside (painted shelves of what it sells, goods.js) or a shutter pulled down
          facade.box(F, u0, u1, y0, y0 + oh, 0.0, 0.04, closed ? metal : dark);
          if (!closed) {
            const cat = GD ? GD.catOf(title, sub) : 'kiryana', A = (u, y, nn) => [F.ox + ux * u + nx * nn, y, F.oz + uz * u + nz * nn];
            const UVF = q => flip ? { u0: q.u1, u1: q.u0, v0: q.v0, v1: q.v1 } : q;   // reads left to right from the street
            if (GD) goods.quad(A(u0 + 0.04, y0 + 0.02, 0.05), A(u1 - 0.04, y0 + 0.02, 0.05), A(u1 - 0.04, y0 + oh - 0.1, 0.05), A(u0 + 0.04, y0 + oh - 0.1, 0.05), UVF(GD.shelf(cat, r() * 2)));
            if (!['momos', 'fruit', 'service', 'lodge'].includes(cat)) for (const sy of [0.55, 1.15, 1.75]) facade.box(F, u0 + 0.12, u1 - 0.12, y0 + sy - 0.05, y0 + sy - 0.01, 0.05, 0.36, shelf);   // shelf edges in front of the picture
            facade.box(F, u0 + 0.2, u1 - 0.2, y0, y0 + 0.85, 0.3, 0.75, C(0x6e4b2e));   // the counter at the front
            if (GD) {
              const W = u1 - u0;
              if (cat === 'kiryana' || cat === 'momos' && r() < 0.5) for (const uu of [u0 + 0.06, u1 - 0.3]) { const s2 = GD.strip(r() * 4); goods.quad(A(uu, y0 + oh - 1.25, 0.42), A(uu + 0.24, y0 + oh - 1.25, 0.42), A(uu + 0.24, y0 + oh - 0.05, 0.42), A(uu, y0 + oh - 0.05, 0.42), UVF(s2)); }   // chips strips at the front
              if (cat === 'woollen' || cat === 'gear') for (let k = 0; k < Math.min(3, Math.floor(W / 0.7)); k++) { const uu = u0 + 0.08 + k * 0.62, hh = cat === 'gear' ? 0.92 : 1.05, ww = cat === 'gear' ? 0.6 : 0.55;
                goods.quad(A(uu, y0 + oh - 0.1 - hh, 0.55 + k * 0.02), A(uu + ww, y0 + oh - 0.1 - hh, 0.55 + k * 0.02), A(uu + ww, y0 + oh - 0.1, 0.55 + k * 0.02), A(uu, y0 + oh - 0.1, 0.55 + k * 0.02), UVF(GD.hang(cat, r() * 6))); }   // jackets / shawls on a rail outside
              if (cat === 'crafts') goods.quad(A(u0, y0 + oh - 0.42, 0.4), A(u1, y0 + oh - 0.42, 0.4), A(u1, y0 + oh, 0.4), A(u0, y0 + oh, 0.4), UVF(GD.hang('crafts', r() * 2)));   // prayer flags across the top
              if (cat === 'fruit') for (let k = 0; k < Math.floor((W - 0.4) / 0.62); k++) { const uu = u0 + 0.2 + k * 0.62; goods.quad(A(uu, y0 + 0.86, 0.75), A(uu + 0.58, y0 + 0.86, 0.75), A(uu + 0.58, y0 + 1.2, 0.4), A(uu, y0 + 1.2, 0.4), UVF(GD.crate(r() * 4))); }   // crates tilted on the counter
            }
            if (GD && GD.SELLS[cat]) shops.push({ x: wx + nx * 1.3, z: wz + nz * 1.3, nx, nz, title, cat });
          } else for (let y = y0 + 0.12; y < y0 + oh; y += 0.12) facade.box(F, u0, u1, y, y + 0.03, 0.04, 0.06, metalD);   // shutter ribs
          facade.box(F, u0 - 0.06, u1 + 0.06, y0 + oh, y0 + oh + 0.3, 0.0, 0.3, metal);                   // rolled shutter box
          for (const uu of [u0 - 0.06, u1]) facade.box(F, uu, uu + 0.06, y0, y0 + oh, 0.0, 0.1, metal);  // shutter rails
          const uv = cell(title, sub, pal), sy0 = y0 + oh + 0.32, sy1 = sy0 + Math.min(0.78, (u1 - u0 + 0.1) * 0.19);
          const SP = (u, y) => [F.ox + ux * u + nx * 0.33, y, F.oz + uz * u + nz * 0.33];
          const ua = flip ? uv.u1 : uv.u0, ub = flip ? uv.u0 : uv.u1;
          signs.quad(SP(u0 - 0.05, sy0), SP(u1 + 0.05, sy0), SP(u1 + 0.05, sy1), SP(u0 - 0.05, sy1), C(0xffffff), [[ua, uv.v0], [ub, uv.v0], [ub, uv.v1], [ua, uv.v1]]);
          facade.box(F, u0 - 0.1, u1 + 0.1, sy0 - 0.05, sy1 + 0.05, 0.02, 0.31, C(0x2a2a2a));          // sign frame
          // an awning over half of them
          if (r() < 0.5) {
            const ac = C(AWN[(r() * AWN.length) | 0]), ya = y0 + oh + 0.25, out = 1.0 + r() * 0.4;
            const A = (u, y, nn) => [F.ox + ux * u + nx * nn, y, F.oz + uz * u + nz * nn];
            facade.quad(A(u0 - 0.1, ya, 0.05), A(u1 + 0.1, ya, 0.05), A(u1 + 0.1, ya - 0.45, out), A(u0 - 0.1, ya - 0.45, out), ac);
            facade.quad(A(u1 + 0.1, ya, 0.05), A(u0 - 0.1, ya, 0.05), A(u0 - 0.1, ya - 0.45, out), A(u1 + 0.1, ya - 0.45, out), ac);
          }
          // a scooter or motorbike parked in front
          if (r() < 0.32 && st.d > 3) { const bu = u0 + r() * (u1 - u0); bikes.push({ x: F.ox + ux * bu + nx * 1.7, z: F.oz + uz * bu + nz * 1.7, ry: Math.atan2(nx, nz) + (r() < 0.5 ? 0 : Math.PI) + (r() - 0.5) * 0.4, c: [0xb3261e, 0x1f1f1f, 0xf2f2ee, 0x1f4e8c, 0x6a6a6a][(r() * 5) | 0] }); }
        }
        // balconies on the upper floors of street walls (st is set: this wall faces a street)
        if (lv >= 2 && len >= 4) {
          const rc = C(RAIL[(r() * RAIL.length) | 0]), slab = C(wallW[(r() * wallW.length) | 0], 0.8), bu0 = len * 0.2, bu1 = len * 0.8;
          for (let f = 1; f < lv; f++) {
            const yf = yG + f * 2.9; if (yf < y0 + 2.9) continue;
            facade.box(F, bu0, bu1, yf - 0.12, yf, 0.0, 0.85, slab);
            facade.box(F, bu0, bu1, yf + 0.95, yf + 1.0, 0.78, 0.85, rc);                        // hand rail
            for (let u = bu0; u <= bu1 + 0.01; u += 0.22) facade.box(F, u, u + 0.03, yf, yf + 0.95, 0.8, 0.83, rc);   // balusters
            for (const uu of [bu0, bu1 - 0.05]) facade.box(F, uu, uu + 0.05, yf, yf + 0.95, 0.0, 0.85, rc);
            counts.balconies++;
          }
        }
      }
      // a named place whose building has no shop front on a street still has its board: on the wall nearest to it
      for (const p of named) {
        const px = p.e, pz = -p.n; let best = null, bd = Infinity;
        for (const w of frames) { const F = w.F, t = Math.max(0.8, Math.min(w.len - 0.8, (px - F.ox) * F.ux + (pz - F.oz) * F.uz)), qx = F.ox + F.ux * t, qz = F.oz + F.uz * t, d = (qx - px) ** 2 + (qz - pz) ** 2; if (d < bd) { bd = d; best = { w, t }; } }
        if (!best || best.w.len < 2) continue;
        const { F, flip } = best.w, half = Math.min(1.4, best.w.len / 2 - 0.2), u0 = best.t - half, u1 = best.t + half;
        if (avoidNear(F.ox + F.ux * best.t + F.nx * 0.5, F.oz + F.uz * best.t + F.nz * 0.5, 2.6)) continue;
        const uv = cell(p.name, [SUB[p.t] || '', p.cu ? p.cu.charAt(0).toUpperCase() + p.cu.slice(1) : ''].filter(Boolean).join(' · '), (p.name.length * 7) % PALETTE.length);
        const sy0 = yG + 2.5, sy1 = sy0 + Math.min(0.62, half * 2 * 0.19), SP = (u, y) => [F.ox + F.ux * u + F.nx * 0.08, y, F.oz + F.uz * u + F.nz * 0.08];
        const ua = flip ? uv.u1 : uv.u0, ub = flip ? uv.u0 : uv.u1;
        signs.quad(SP(u0, sy0), SP(u1, sy0), SP(u1, sy1), SP(u0, sy1), C(0xffffff), [[ua, uv.v0], [ub, uv.v0], [ub, uv.v1], [ua, uv.v1]]);
        facade.box(F, u0 - 0.05, u1 + 0.05, sy0 - 0.05, sy1 + 0.05, 0.0, 0.06, C(0x2a2a2a));
        counts.named++;
      }
    });

    /* ---------- prayer flags across the streets, electric poles and wires along the roads ---------- */
    const FLAG = [0x2a63c8, 0xf4f4f0, 0xd8262a, 0x2f9a4a, 0xf2c230];
    const wires = [];
    for (const st of streets || []) {
      if (st.k === 'steps') continue;
      const pts = st.e.map((e, i) => [e, -st.n[i]]); if (!pts.some(p => p[1] > TOWN_Z)) continue;
      const road = ['tertiary', 'unclassified', 'residential', 'living_street', 'service', 'track', 'primary'].includes(st.k);
      let acc = 0, nextF = 12 + R() * 10, nextP = 8 + R() * 10, prevPole = null;
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1], b = pts[i], L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < 0.01) continue;
        const dx = (b[0] - a[0]) / L, dz = (b[1] - a[1]) / L;
        for (let t = 0; t < L; t += 1) {
          const x = a[0] + dx * t, z = a[1] + dz * t; acc += 1; if (z < TOWN_Z) continue;
          if (acc >= nextF) { flags = chunk(x, z).flags;   // a string of flags from one side of the street to the other, sagging in the middle
            nextF = acc + 22 + R() * 16; const half = road ? 3.6 : 2.6;
            const x1 = x - dz * half, z1 = z + dx * half, x2 = x + dz * half, z2 = z - dx * half, y1 = H(x1, z1) + 5.2 + R() * 0.8, y2 = H(x2, z2) + 5.2 + R() * 0.8;
            const nF = Math.round(half * 2 / 0.42);
            for (let k = 0; k < nF; k++) {
              const s0 = (k + 0.1) / nF, s1 = (k + 0.9) / nF, sag = s => 0.9 * 4 * s * (1 - s);
              const p0 = [x1 + (x2 - x1) * s0, y1 + (y2 - y1) * s0 - sag(s0), z1 + (z2 - z1) * s0], p1 = [x1 + (x2 - x1) * s1, y1 + (y2 - y1) * s1 - sag(s1), z1 + (z2 - z1) * s1];
              const col = C(FLAG[k % 5]), drop = 0.38;
              flags.quad(p0, p1, [p1[0] + dx * 0.04, p1[1] - drop, p1[2] + dz * 0.04], [p0[0] + dx * 0.04, p0[1] - drop, p0[2] + dz * 0.04], col);
              wires.push(p0[0], p0[1], p0[2], p1[0], p1[1], p1[2]);
            }
            counts.flags++;
          }
          if (road && acc >= nextP) {   // a pole at the roadside, wires to the last one
            nextP = acc + 30 + R() * 8;
            const px = x + dz * 3.2, pz = z - dx * 3.2, py = H(px, pz), F = { ox: px, oz: pz, ux: dx, uz: dz, nx: -dz, nz: dx }, poles = chunk(px, pz).poles;
            poles.box(F, -0.09, 0.09, py - 0.3, py + 7.5, -0.09, 0.09, C(0x8a8780));
            poles.box(F, -0.7, 0.7, py + 7.1, py + 7.22, -0.06, 0.06, C(0x4a4a4a));
            const tops = [-0.6, 0, 0.6].map(u => [px + dx * u, py + 7.25, pz + dz * u]);
            if (prevPole && Math.hypot(prevPole[1][0] - tops[1][0], prevPole[1][2] - tops[1][2]) < 60)
              for (let w = 0; w < 3; w++) { const A = prevPole[w], B = tops[w]; let q = A; for (let k = 1; k <= 6; k++) { const s = k / 6, np = [A[0] + (B[0] - A[0]) * s, A[1] + (B[1] - A[1]) * s - 0.7 * 4 * s * (1 - s), A[2] + (B[2] - A[2]) * s]; wires.push(q[0], q[1], q[2], np[0], np[1], np[2]); q = np; } }
            prevPole = tops; counts.poles++;
            if (collide) collide.circle(px, pz, 0.14, false);
          }
        }
      }
    }

    /* ---------- parked two-wheelers ---------- */
    for (const b of bikes) {
      const bk = chunk(b.x, b.z).bikes, y = H(b.x, b.z), F = { ox: b.x, oz: b.z, ux: Math.sin(b.ry), uz: Math.cos(b.ry), nx: Math.cos(b.ry), nz: -Math.sin(b.ry) }, c = C(b.c), blk = C(0x161616);
      bk.box(F, -0.62, 0.55, y + 0.25, y + 0.62, -0.17, 0.17, c);        // body
      bk.box(F, -0.55, 0.05, y + 0.62, y + 0.74, -0.15, 0.15, blk);      // seat
      bk.box(F, 0.48, 0.56, y + 0.6, y + 1.05, -0.05, 0.05, metal);      // steering column
      bk.box(F, 0.5, 0.56, y + 1.02, y + 1.07, -0.34, 0.34, blk);        // handlebar
      for (const u of [-0.55, 0.62]) bk.box(F, u - 0.25, u + 0.25, y, y + 0.5, -0.06, 0.06, blk);   // wheels (side view)
      if (collide) collide.circle(b.x, b.z, 0.45, true);
      counts.bikes++;
    }

    /* ---------- meshes ---------- */
    const vc = (o2) => Object.assign(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, side: THREE.DoubleSide }), o2 || {});
    const tex = new THREE.CanvasTexture(atlas); tex.encoding = THREE.sRGBEncoding; tex.anisotropy = 8;
    const M = { facade: vc(), poles: vc(), bikes: vc({ roughness: 0.5, metalness: 0.2 }), flags: new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }),
      signs: new THREE.MeshLambertMaterial({ map: tex, vertexColors: true, emissive: lin(0x222222), emissiveMap: tex, side: THREE.DoubleSide }) };
    for (const c of chunks.values()) { if (c.goods) { const m = c.goods.mesh(scene); if (m) c.meshes.push(m); } c.goods = null; }
    for (const c of chunks.values()) for (const k of ['facade', 'poles', 'bikes', 'flags', 'signs']) { const m = c[k].mesh(M[k]); if (m) { if (k === 'flags' || k === 'signs' || k === 'bikes') m.castShadow = false; c.meshes.push(m); } c[k] = null; }
    if (wires.length) { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(wires, 3)); scene.add(new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: lin(0x222222) }))); }
    counts.signCells = nextCell; counts.chunks = chunks.size;
    let lastX = 1e9, lastZ = 1e9;
    // the open shop whose counter you are standing at (within r metres in front of it)
    const SG = new Map(); for (const sh of shops) { const k = Math.floor(sh.x / 8) + ',' + Math.floor(sh.z / 8); let l = SG.get(k); if (!l) SG.set(k, l = []); l.push(sh); }
    counts.buyShops = shops.length;
    return {
      counts, shops,
      shopNear(x, z, r) {
        let best = null, bd = r || 2.2; const i0 = Math.floor(x / 8), j0 = Math.floor(z / 8);
        for (let i = i0 - 1; i <= i0 + 1; i++) for (let j = j0 - 1; j <= j0 + 1; j++) for (const sh of SG.get(i + ',' + j) || []) { const d = Math.hypot(sh.x - x, sh.z - z); if (d < bd) { bd = d; best = sh; } }
        return best;
      },
      update(cam) {
        if ((cam.x - lastX) ** 2 + (cam.z - lastZ) ** 2 < 100) return; lastX = cam.x; lastZ = cam.z;
        for (const c of chunks.values()) { const v = (c.x - cam.x) ** 2 + (c.z - cam.z) ** 2 < 450 * 450; for (const m of c.meshes) m.visible = v; }
      }
    };
  }
};
