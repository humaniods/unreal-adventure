'use strict';
/* What the shops of McLeod Ganj and the trail stalls sell, painted once into one texture atlas (no image files):
   shelves seen through a shop's open shutter, strips of chips packets hanging at the front, jackets and shawls on a
   rail, fruit crates, a momo steamer stack. Generic packaging (no brand names); the kinds of goods follow what the
   town's shops are: woollens and Kullu shawls, Tibetan handicrafts (singing bowls, prayer wheels, thangkas, malas,
   prayer flags), trek gear for rent or sale, general stores, momos and thukpa, bakeries, fruit, chemists, books.
   Interface: window.TriundGoods.create(THREE) -> { tex, mat, shelf(cat, v), strip(v), hang(cat, v), crate(v), catOf(title, kind),
   Quads } ; uv rects are { u0, u1, v0, v1 }. */
window.TriundGoods = {
  create(THREE) {
    const AW = 2048, AH = 2048, cv = document.createElement('canvas'); cv.width = AW; cv.height = AH;
    const g = cv.getContext('2d');
    let seed = 1234567; const R = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
    const pick = a => a[(R() * a.length) | 0];
    const rect = (x, y, w, h, c) => { g.fillStyle = c; g.fillRect(x, y, w, h); };
    const rr = (x, y, w, h, r, c) => { g.fillStyle = c; g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.fill(); };
    const ell = (x, y, rx, ry, c) => { g.fillStyle = c; g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, 7); g.fill(); };
    const text = (t, x, y, px, c, w) => { g.fillStyle = c; g.font = `700 ${px}px Rajdhani, 'Arial Narrow', sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(t, x, y, w); };
    const shade = (x, y, w, h, a) => { const gr = g.createLinearGradient(x, y, x, y + h); gr.addColorStop(0, `rgba(255,255,255,${a})`); gr.addColorStop(0.5, 'rgba(255,255,255,0)'); gr.addColorStop(1, `rgba(0,0,0,${a})`); g.fillStyle = gr; g.fillRect(x, y, w, h); };
    const UV = (x, y, w, h) => ({ u0: x / AW, u1: (x + w) / AW, v0: 1 - (y + h) / AH, v1: 1 - y / AH });

    /* ---------- single goods ---------- */
    const FOIL = ['#e8302a', '#f2c230', '#2f6fd6', '#2f9a52', '#f08a24', '#7a3fa0', '#d04a8a', '#19a3a3', '#c8102e'];
    function packet(x, y, w, h, c) {   // a pillow-shaped chips/namkeen packet, crimped top and bottom, a window and a label
      rr(x, y + 3, w, h - 6, 5, c); shade(x, y + 3, w, h - 6, 0.25);
      for (let i = 0; i < w; i += 4) { rect(x + i, y, 2, 4, c); rect(x + i, y + h - 4, 2, 4, c); }
      ell(x + w / 2, y + h * 0.58, w * 0.28, h * 0.17, '#f4d88a'); text(pick(['CHIPS', 'NAMKEEN', 'CRISPS', 'MASALA', 'SALTED']), x + w / 2, y + h * 0.27, Math.max(8, w * 0.2), '#fff', w - 4);
    }
    function bottle(x, y, w, h, c, cap) {
      rr(x + w * 0.32, y, w * 0.36, h * 0.16, 3, cap); rr(x + w * 0.22, y + h * 0.12, w * 0.56, h * 0.14, 4, c); rr(x, y + h * 0.22, w, h * 0.78, 6, c);
      rect(x + 2, y + h * 0.45, w - 4, h * 0.22, 'rgba(255,255,255,0.85)'); rect(x + 4, y + h * 0.5, w - 8, h * 0.12, pick(FOIL));
      g.fillStyle = 'rgba(255,255,255,0.25)'; g.fillRect(x + w * 0.15, y + h * 0.25, w * 0.12, h * 0.7);
    }
    function box(x, y, w, h, c, band) { rect(x, y, w, h, c); rect(x, y + h * 0.35, w, h * 0.22, band); shade(x, y, w, h, 0.18); g.strokeStyle = 'rgba(0,0,0,0.25)'; g.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1); }
    function noodles(x, y, w, h) { rect(x, y, w, h, '#f6c51b'); rect(x, y + h * 0.62, w, h * 0.38, '#d8261c'); ell(x + w / 2, y + h * 0.4, w * 0.3, h * 0.18, '#fff3c4'); text('NOODLES', x + w / 2, y + h * 0.8, Math.max(8, w * 0.17), '#fff', w); }
    function folded(x, y, w, h, c) {   // a folded shawl or blanket: a stack layer with a woven border
      rr(x, y, w, h, 3, c); shade(x, y, w, h, 0.2);
      const b = pick(['#f2c230', '#e8302a', '#2f6fd6', '#2f9a52', '#ffffff']); for (let i = 0; i < w; i += 8) { rect(x + i, y + h * 0.15, 5, h * 0.18, b); rect(x + i + 3, y + h * 0.62, 4, h * 0.16, b); }
    }
    function cap(x, y, w, h, c) { g.fillStyle = c; g.beginPath(); g.ellipse(x + w / 2, y + h, w / 2, h, 0, Math.PI, 0); g.fill(); const b = pick(['#e8302a', '#2f6fd6', '#f2c230']); for (let i = 0; i < w; i += 6) rect(x + i, y + h * 0.7, 4, h * 0.25, i % 12 ? b : '#fff'); }
    function jacket(x, y, w, h, c) {   // on a hanger: shoulders, sleeves, a zip, a hood line
      g.strokeStyle = '#333'; g.lineWidth = 2; g.beginPath(); g.moveTo(x + w / 2, y); g.lineTo(x + w * 0.2, y + h * 0.1); g.lineTo(x + w * 0.8, y + h * 0.1); g.closePath(); g.stroke();
      g.fillStyle = c; g.beginPath(); g.moveTo(x + w * 0.22, y + h * 0.1); g.lineTo(x + w * 0.78, y + h * 0.1); g.lineTo(x + w, y + h * 0.62); g.lineTo(x + w * 0.84, y + h * 0.66); g.lineTo(x + w * 0.8, y + h); g.lineTo(x + w * 0.2, y + h); g.lineTo(x + w * 0.16, y + h * 0.66); g.lineTo(x, y + h * 0.62); g.closePath(); g.fill();
      shade(x, y + h * 0.1, w, h * 0.9, 0.15); rect(x + w / 2 - 1, y + h * 0.12, 2, h * 0.86, '#ddd');
      for (let k = 1; k < 4; k++) rect(x + w * 0.2, y + h * (0.12 + k * 0.2), w * 0.6, 2, 'rgba(0,0,0,0.2)');   // quilting of a down jacket
    }
    function bowl(x, y, w, h) { const gr = g.createLinearGradient(x, y, x, y + h); gr.addColorStop(0, '#f2d27a'); gr.addColorStop(1, '#8a5a1c'); g.fillStyle = gr; g.beginPath(); g.ellipse(x + w / 2, y + h * 0.25, w / 2, h * 0.25, 0, 0, Math.PI); g.lineTo(x + w * 0.2, y + h); g.lineTo(x + w * 0.8, y + h); g.closePath(); g.fill(); ell(x + w / 2, y + h * 0.25, w / 2, h * 0.18, '#5a3a12'); }
    function wheel(x, y, w, h) { rr(x + w * 0.45, y, w * 0.1, h, 2, '#5a4a3a'); rr(x + w * 0.15, y + h * 0.2, w * 0.7, h * 0.55, 4, '#d9a62a'); rect(x + w * 0.15, y + h * 0.4, w * 0.7, h * 0.12, '#b3261e'); ell(x + w / 2, y + h * 0.3, w * 0.12, h * 0.07, '#5a1a0a'); }
    function thangka(x, y, w, h) {
      rect(x, y, w, h, '#7a1f1f'); rect(x + w * 0.1, y + h * 0.1, w * 0.8, h * 0.75, '#1f3a6a');
      for (let k = 3; k > 0; k--) ell(x + w / 2, y + h * 0.45, w * 0.1 * k, w * 0.1 * k, ['#f2c230', '#e8302a', '#2f9a52'][k - 1]);
      ell(x + w / 2, y + h * 0.43, w * 0.08, w * 0.1, '#f4c08a');
    }
    function mala(x, y, w) { g.strokeStyle = pick(['#8a3a1c', '#2a1a12', '#b3261e', '#1f6b8a']); g.lineWidth = 3; g.setLineDash([3, 2]); g.beginPath(); g.ellipse(x + w / 2, y + w * 0.6, w * 0.35, w * 0.55, 0, 0, 7); g.stroke(); g.setLineDash([]); }
    function fruit(x, y, w, h, kind) {
      rect(x, y + h * 0.45, w, h * 0.55, '#a07040'); for (let i = 0; i < 3; i++) rect(x, y + h * (0.5 + i * 0.17), w, 2, '#6a4a2a');
      const c = { apple: ['#c8102e', '#e8302a', '#a01020'], orange: ['#f08a24', '#f2a030', '#e07a1a'], banana: ['#f2d230', '#e8c820'], guava: ['#9ac83a', '#b8d84a'] }[kind];
      for (let k = 0; k < 18; k++) { const px = x + 6 + R() * (w - 12), py = y + h * 0.18 + R() * h * 0.32; if (kind === 'banana') { g.strokeStyle = pick(c); g.lineWidth = 5; g.beginPath(); g.arc(px, py - 6, 10, 0.3, 2.2); g.stroke(); } else ell(px, py, 7, 7, pick(c)); }
    }
    function steamer(x, y, w, h) { for (let k = 0; k < 3; k++) { rr(x, y + h * (0.3 + k * 0.22), w, h * 0.2, 4, '#c8a060'); for (let i = 0; i < w; i += 5) rect(x + i, y + h * (0.3 + k * 0.22), 1, h * 0.2, '#a07a40'); } ell(x + w / 2, y + h * 0.3, w / 2, h * 0.08, '#d8b070'); g.fillStyle = 'rgba(255,255,255,0.35)'; for (let k = 0; k < 3; k++) { g.beginPath(); g.ellipse(x + w * (0.3 + k * 0.2), y + h * 0.15 - k * 4, 6, 14, 0.3, 0, 7); g.fill(); } }
    function book(x, y, w, h) { rect(x, y, w, h, pick(['#7a1f1f', '#1f3a6a', '#2f6f4f', '#c9a23a', '#3a3a3a', '#8a5a3c', '#e07a1f'])); rect(x, y + h * 0.15, w, 2, '#e8d8a8'); rect(x, y + h * 0.8, w, 2, '#e8d8a8'); }
    function cake(x, y, w, h) { rr(x, y + h * 0.35, w, h * 0.65, 4, pick(['#f4e0c8', '#6a3a1c', '#f2b8c8'])); for (let i = 0; i < w; i += 10) ell(x + 5 + i, y + h * 0.35, 5, 4, '#fff'); ell(x + w / 2, y + h * 0.25, 4, 4, '#c8102e'); }
    function medbox(x, y, w, h) { box(x, y, w, h, '#f4f4f2', pick(['#2f6fd6', '#2f9a52', '#e8302a', '#f08a24', '#7a3fa0'])); }
    function phonebox(x, y, w, h) { box(x, y, w, h, pick(['#1f1f1f', '#f4f4f2', '#2a4a8a']), '#555'); rr(x + w * 0.3, y + h * 0.15, w * 0.4, h * 0.6, 3, '#111'); }

    /* ---------- a shop interior: back wall, three shelves at 0.55 / 1.15 / 1.75 m of a 2.3 m opening ---------- */
    const SW = 512, SH = 288, COLS = AW / SW;
    let nextShelf = 0; const shelves = {};
    const SHELF_Y = [0.55, 1.15, 1.75].map(v => 1 - v / 2.3);   // fractions from the top of the cell
    function shelfCell(cat, v, paint) {
      const i = nextShelf++, x0 = (i % COLS) * SW, y0 = Math.floor(i / COLS) * SH;
      const wall = { kiryana: '#d8c8a8', woollen: '#e8dccc', crafts: '#6a1f1f', gear: '#dfe4e8', momos: '#e8d8b0', bakery: '#f4e8d0', fruit: '#c8b898', chemist: '#f4f4f2', books: '#d8c8a8', mobile: '#e8e8ee', service: '#e2dcd0', lodge: '#d8c8a8' }[cat] || '#d8c8a8';
      rect(x0, y0, SW, SH, wall); shade(x0, y0, SW, SH, 0.3);
      const rows = SHELF_Y.map(f => y0 + f * SH);
      if (paint.shelves !== false) for (const ry of rows) { rect(x0 + 8, ry, SW - 16, 7, '#7a5a3a'); rect(x0 + 8, ry + 7, SW - 16, 3, '#4a3420'); }
      paint(x0, y0, rows);
      // dim the top corners: it is darker inside a shop than in the street
      const gr = g.createRadialGradient(x0 + SW / 2, y0 + SH * 0.6, SH * 0.3, x0 + SW / 2, y0 + SH * 0.6, SW * 0.7); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,0.45)'); g.fillStyle = gr; g.fillRect(x0, y0, SW, SH);
      (shelves[cat] || (shelves[cat] = [])).push(UV(x0, y0, SW, SH));
    }
    const fillRow = (x0, ry, h, draw, gap) => { for (let x = x0 + 14; x < x0 + SW - 30;) { const w = draw(x, ry - h, h); x += w + (gap || 3); } };
    const PAINT = {
      kiryana: (x0, y0, rows) => {
        fillRow(x0, rows[0], 46, (x, y, h) => { const w = 26 + R() * 10; packet(x, y, w, h, pick(FOIL)); return w; });
        fillRow(x0, rows[1], 40, (x, y, h) => { const t = R(); if (t < 0.4) { noodles(x, y + 8, 30, h - 8); return 30; } const w = 40; box(x, y + 10, w, h - 10, pick(['#c8102e', '#1f4e8c', '#f2c230', '#2f9a52']), '#f4e8c8'); text('BISCUIT', x + w / 2, y + 10 + (h - 10) * 0.46, 8, '#3a1a0a', w); return w; });
        fillRow(x0, rows[2], 52, (x, y, h) => { const t = R(), w = 20; bottle(x, y, w, h, t < 0.35 ? 'rgba(160,200,230,0.9)' : pick(['#3a1a0a', '#f08a24', '#2f9a52', '#d8261c']), t < 0.35 ? '#2f6fd6' : '#c8102e'); return w; }, 4);
        fillRow(x0, y0 + 272, 50, (x, y, h) => { const w = 44; box(x, y, w, h, pick(['#c0392b', '#2f6fd6', '#f2c230']), '#fff'); return w; }, 8);   // crates on the floor
      },
      woollen: (x0, y0, rows) => {
        for (const ry of rows) { let x = x0 + 14; while (x < x0 + SW - 70) { const w = 56 + R() * 14; for (let k = 0; k < 4; k++) folded(x, ry - 12 - k * 12, w, 11, pick(['#7a1f2a', '#1f3a6a', '#2f6f4f', '#c8a060', '#5a3a2a', '#e8e0d0', '#8a2a5a', '#3a3a3a'])); x += w + 8; } }
        for (let x = x0 + 20; x < x0 + SW - 40; x += 46) cap(x, y0 + 16, 34, 22, pick(['#3a3a3a', '#7a1f2a', '#1f3a6a', '#e8e0d0']));
      },
      crafts: (x0, y0, rows) => {
        for (let k = 0; k < 4; k++) thangka(x0 + 20 + k * 120, y0 + 8, 70, 62);
        fillRow(x0, rows[0], 40, (x, y, h) => { bowl(x, y + 8, 44, h - 8); return 44; }, 10);
        fillRow(x0, rows[1], 46, (x, y, h) => { wheel(x, y, 30, h); return 30; }, 12);
        fillRow(x0, rows[2], 40, (x, y, h) => { mala(x, y + 2, 26); return 26; }, 6);
        const F = ['#2a63c8', '#f4f4f0', '#d8262a', '#2f9a52', '#f2c230']; for (let i = 0; i < 28; i++) rect(x0 + 6 + i * 18, y0 + 76 + Math.sin(i * 0.4) * 4, 14, 16, F[i % 5]);
      },
      gear: (x0, y0, rows) => {
        for (let k = 0; k < 7; k++) jacket(x0 + 10 + k * 70, y0 + 10, 62, 96, pick(['#c8102e', '#1f4e8c', '#f2c230', '#2f9a52', '#f08a24', '#3a3a3a', '#7a3fa0']));
        fillRow(x0, rows[1], 30, (x, y, h) => { rr(x, y + 10, 44, h - 10, 6, pick(['#3a3a3a', '#5a3a2a', '#1f3a6a'])); rect(x, y + h - 6, 44, 6, '#222'); for (let i = 6; i < 40; i += 8) rect(x + i, y + 14, 4, 2, '#ddd'); return 44; }, 8);   // trekking shoes
        fillRow(x0, rows[2], 44, (x, y, h) => { if (R() < 0.5) { rect(x + 4, y, 4, h, '#9aa0a6'); rect(x + 2, y, 8, 8, '#222'); return 12; } rr(x, y + h * 0.4, 30, h * 0.6, 4, pick(['#2f6fd6', '#f2c230', '#c8102e'])); text('PONCHO', x + 15, y + h * 0.7, 7, '#fff', 28); return 30; }, 6);
      },
      momos: (x0, y0, rows) => {
        rect(x0 + 300, y0 + 18, 190, 150, '#2a3a2a'); g.strokeStyle = '#c8a060'; g.lineWidth = 4; g.strokeRect(x0 + 300, y0 + 18, 190, 150);
        ['MENU', 'Veg momos   80', 'Chicken momos 120', 'Thukpa   100', 'Chowmein   90', 'Chai   20'].forEach((t, i) => text(t, x0 + 395, y0 + 38 + i * 24, i ? 15 : 20, i ? '#f4f0e0' : '#f2c230', 180));
        steamer(x0 + 30, y0 + 120, 90, 110); steamer(x0 + 140, y0 + 135, 80, 95);
        for (let k = 0; k < 5; k++) ell(x0 + 50 + k * 50, y0 + 255, 18, 8, '#c0c4c8');   // steel plates
      },
      bakery: (x0, y0, rows) => {
        fillRow(x0, rows[0], 34, (x, y, h) => { cake(x, y, 50, h); return 50; }, 10);
        fillRow(x0, rows[1], 46, (x, y, h) => { rr(x, y, 34, h, 6, 'rgba(220,230,240,0.6)'); for (let k = 0; k < 6; k++) ell(x + 9 + (k % 2) * 16, y + 10 + (k >> 1) * 13, 7, 6, '#c8863a'); return 34; }, 8);
        fillRow(x0, rows[2], 30, (x, y, h) => { ell(x + 26, y + h * 0.6, 26, h * 0.4, '#c8863a'); rect(x + 8, y + h * 0.45, 36, 2, '#8a5a2a'); return 52; }, 6);
      },
      fruit: (x0, y0, rows) => {
        const K = ['apple', 'orange', 'banana', 'guava'];
        for (let k = 0; k < 4; k++) fruit(x0 + 12 + k * 124, y0 + 150, 112, 120, K[k]);
        for (let k = 0; k < 4; k++) fruit(x0 + 12 + k * 124, y0 + 40, 112, 100, K[(k + 2) % 4]);
      },
      chemist: (x0, y0, rows) => {
        for (const ry of rows) fillRow(x0, ry, 30, (x, y, h) => { const w = 18 + R() * 20; medbox(x, y + R() * 6, w, h - 6); return w; }, 2);
        rect(x0 + 230, y0 + 8, 52, 52, '#2f9a52'); rect(x0 + 248, y0 + 14, 16, 40, '#fff'); rect(x0 + 236, y0 + 26, 40, 16, '#fff');
      },
      books: (x0, y0, rows) => { for (const ry of rows) fillRow(x0, ry, 52, (x, y, h) => { const w = 8 + R() * 8, hh = h - R() * 14; book(x, y + (h - hh), w, hh); return w; }, 1); },
      mobile: (x0, y0, rows) => {
        for (const ry of rows) fillRow(x0, ry, 40, (x, y, h) => { phonebox(x, y + 6, 30, h - 6); return 30; }, 8);
        rect(x0 + 160, y0 + 8, 190, 46, '#1f4e8c'); text('RECHARGE · SIM', x0 + 255, y0 + 31, 22, '#fff', 180);
      },
      service: (x0, y0, rows) => {
        rect(x0 + 40, y0 + 30, 160, 110, '#f4f4f0'); for (let k = 0; k < 5; k++) { rect(x0 + 52, y0 + 46 + k * 18, 90, 6, '#555'); rect(x0 + 160, y0 + 46 + k * 18, 30, 6, '#1f4e8c'); }
        rect(x0 + 260, y0 + 40, 90, 120, '#2a6a8a'); ell(x0 + 420, y0 + 200, 34, 40, '#2f6f4f'); rect(x0 + 410, y0 + 230, 20, 40, '#6a4a2a');
      },
      lodge: (x0, y0, rows) => {
        rect(x0 + 60, y0 + 30, 170, 110, '#6a4a2a'); for (let k = 0; k < 12; k++) { ell(x0 + 80 + (k % 6) * 26, y0 + 60 + ((k / 6) | 0) * 40, 4, 4, '#c9a23a'); rect(x0 + 78 + (k % 6) * 26, y0 + 64 + ((k / 6) | 0) * 40, 4, 14, '#c9a23a'); }
        thangka(x0 + 300, y0 + 30, 90, 90); ell(x0 + 440, y0 + 210, 30, 36, '#2f6f4f');
      }
    };
    for (const cat in PAINT) for (let v = 0; v < 2; v++) { const p = PAINT[cat]; if (cat === 'momos' || cat === 'fruit' || cat === 'service' || cat === 'lodge') p.shelves = false; shelfCell(cat, v, p); }

    /* ---------- the hanging things and crates (below the shelf cells) ---------- */
    let sx = 0, sy = Math.ceil(nextShelf / COLS) * SH; const strips = [], hangs = { gear: [], woollen: [], crafts: [] }, crates = [];
    const slot = (w, h) => { if (sx + w > AW) { sx = 0; sy += 330; } const p = { x: sx, y: sy }; sx += w + 4; return p; };
    for (let v = 0; v < 4; v++) {   // a strip of chips packets on a string, 6 packets, 64 x 320
      const p = slot(64, 320); rect(p.x + 30, p.y, 4, 320, '#333');
      for (let k = 0; k < 6; k++) packet(p.x + 4, p.y + 6 + k * 52, 56, 50, FOIL[(v * 3 + k) % FOIL.length]);
      strips.push(UV(p.x, p.y, 64, 320));
    }
    for (let v = 0; v < 6; v++) { const p = slot(128, 200); jacket(p.x + 4, p.y + 2, 120, 196, ['#c8102e', '#1f4e8c', '#f2c230', '#2f9a52', '#f08a24', '#7a3fa0'][v]); hangs.gear.push(UV(p.x, p.y, 128, 200)); }
    for (let v = 0; v < 6; v++) {   // a shawl over a rail: hanging cloth with a woven border and fringe
      const p = slot(128, 240), c = ['#7a1f2a', '#1f3a6a', '#2f6f4f', '#c8a060', '#8a2a5a', '#e8e0d0'][v], b = pick(['#f2c230', '#e8302a', '#ffffff', '#2f9a52']);
      rect(p.x + 4, p.y + 4, 120, 220, c); shade(p.x + 4, p.y + 4, 120, 220, 0.2);
      for (let i = 0; i < 120; i += 10) { rect(p.x + 4 + i, p.y + 180, 6, 28, b); rect(p.x + 8 + i, p.y + 186, 3, 14, c); }
      for (let i = 0; i < 120; i += 4) rect(p.x + 5 + i, p.y + 224, 2, 14, c);
      hangs.woollen.push(UV(p.x, p.y, 128, 240));
    }
    for (let v = 0; v < 2; v++) { const p = slot(256, 96); const F = ['#2a63c8', '#f4f4f0', '#d8262a', '#2f9a52', '#f2c230']; rect(p.x, p.y + 4, 256, 3, '#555'); for (let i = 0; i < 14; i++) { rect(p.x + 4 + i * 18, p.y + 8, 15, 80, F[(i + v) % 5]); } hangs.crafts.push(UV(p.x, p.y, 256, 96)); }
    for (const k of ['apple', 'orange', 'banana', 'guava']) { const p = slot(160, 110); fruit(p.x, p.y, 160, 110, k); crates.push(UV(p.x, p.y, 160, 110)); }

    const tex = new THREE.CanvasTexture(cv); tex.encoding = THREE.sRGBEncoding; tex.anisotropy = 8;
    const mat = new THREE.MeshLambertMaterial({ map: tex, side: THREE.DoubleSide, alphaTest: 0.35, transparent: false });
    // every cell has a filled background except the hanging pieces: those read their outline from the alpha
    // what kind of shop a sign says it is
    function catOf(title, kind) {
      const t = (title + ' ' + (kind || '')).toLowerCase();
      if (/hotel|guest|hostel|homestay|lodge|residency|inn\b/.test(t)) return 'lodge';
      if (/ticket|bus|transport|travel|bank|atm|exchange|office|tailor|cyber|laundry|tattoo|salon|parlour|xerox/.test(t)) return 'service';
      if (/woollen|wool|shawl|pashmina|clothes|garment|boutique|fashion/.test(t)) return 'woollen';
      if (/handicraft|tibetan|gift|souvenir|jewel|silver|thangka|art|craft|antique/.test(t)) return 'crafts';
      if (/\btrek|\bgear\b|adventure|\bsports?\b|outdoor|camping/.test(t)) return 'gear';
      if (/momo|thukpa|restaurant|fast.?food|dhaba|kitchen|food|cafe|café|chinese|tibetan food/.test(t)) return 'momos';
      if (/bakery|cake|cookie|sweet|confection/.test(t)) return 'bakery';
      if (/fruit|vegetable|greengrocer|juice|lassi/.test(t)) return 'fruit';
      if (/chemist|medical|pharma|medicine/.test(t)) return 'chemist';
      if (/book|map|library|stationery/.test(t)) return 'books';
      if (/mobile|recharge|sim|electronic|phone/.test(t)) return 'mobile';
      if (/store|kiryana|kirana|general|kiosk|convenience|provision|grocery|mart|supermarket/.test(t)) return 'kiryana';
      return 'service';
    }
    // a collector of textured quads that ends in one mesh
    function Quads() { this.p = []; this.n = []; this.uv = []; }
    Quads.prototype.quad = function (a, b, c, d, r) {
      const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = d[0] - a[0], vy = d[1] - a[1], vz = d[2] - a[2];
      let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
      const U = [[r.u0, r.v0], [r.u1, r.v0], [r.u1, r.v1], [r.u0, r.v1]];
      for (const [p, t] of [[a, U[0]], [b, U[1]], [c, U[2]], [a, U[0]], [c, U[2]], [d, U[3]]]) { this.p.push(p[0], p[1], p[2]); this.n.push(nx, ny, nz); this.uv.push(t[0], t[1]); }
    };
    Quads.prototype.mesh = function (scene) {
      if (!this.p.length) return null;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3)); geo.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
      const m = new THREE.Mesh(geo, mat); m.receiveShadow = true; scene.add(m); return m;
    };
    // goods the player can buy, by kind of shop (town prices; items are in economy.js)
    const SELLS = {
      kiryana: [['water', 20], ['parleg', 10], ['chips', 20], ['snickers', 40], ['glucon', 30], ['chocolate', 50], ['dryfruit', 120]],
      woollen: [['cap', 200], ['gloves', 150], ['shawl', 600], ['fleece', 900]],
      crafts: [['flags', 100], ['mala', 150], ['bowl', 1200]],
      gear: [['poncho', 150], ['rain', 900], ['headlamp', 250], ['pole', 350], ['gloves', 150], ['cap', 200], ['fleece', 900], ['water', 20]],
      momos: [['momos', 80], ['water', 20]],
      bakery: [['cookies', 60], ['bun', 30], ['water', 20]],
      fruit: [['banana', 10], ['apple', 30], ['orange', 20]],
      chemist: [['glucon', 30], ['balm', 60], ['water', 20]],
      books: [['map', 100]],
      mobile: [['powerbank', 700]]
    };
    return {
      tex, mat, Quads, catOf, SELLS,
      shelf: (cat, v) => { const l = shelves[cat] || shelves.service; return l[(v | 0) % l.length]; },
      strip: v => strips[(v | 0) % strips.length],
      hang: (cat, v) => { const l = hangs[cat] || hangs.gear; return l[(v | 0) % l.length]; },
      crate: v => crates[(v | 0) % crates.length]
    };
  }
};
