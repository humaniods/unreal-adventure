'use strict';
/* The real-life trip around the Triund climb (build 2.3):
   - packing chosen at the start: your name, start time, shoes, original ID card
   - McLeod Ganj Main Square start: walk up the lanes through Dharamkot, or take a taxi to Gallu Devi
   - the Forest Department check post at Gallu (Dharamshala Forest Circle, Rs 100 entry per person per day, collected
     at Gallu since the Ecotourism Society started the fee): register, show the original ID, plastic count, no
     alcohol, entry closes 11:30. Coming back down, the guard checks the plastic out again
   - everything is paid in coins from the phone (1 coin = Rs 1)
   - shoes: flat soles slip on steep, wet or snowy rock, worst going down
   - after the top: on to Snowline Cafe (3,166 m) and back, or down by either route (the loop), and the trip end
   Interface: create(ctx) -> { reset, build, update, prompt, interact, pay, bagRows, speedK, dip,
     startHour, legEnd, go, opts, state } */
window.TriundTrip = {
  create(ctx) {
    const { THREE, scene, H, ECON } = ctx;
    const $ = id => document.getElementById(id);
    const CLOSE_H = 11.5;               // Gallu check post: no new entries after 11:30
    const FEE = 100;                    // entry fee per person per day
    const CP_S = 45;                    // check post: 45 m up the Galu Devi trail, past Cafe Galu
    const TAXI = { mcleod: 500, dharamkot: 300, gallu: 500 };

    /* ---------- packing options (start screen) ---------- */
    const store = { get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
      set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage blocked */ } } };
    const opts = Object.assign({ hour: 7.5, shoes: 'trek', id: true, name: '' }, store.get('triund-trip', {}));
    if (![7.5, 9, 11].includes(opts.hour)) opts.hour = 7.5;
    const save = () => store.set('triund-trip', opts);
    function syncSeg(id, key, attr, num) {
      const el = $(id); if (!el) return;
      el.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String((num ? +b.dataset[attr] : b.dataset[attr]) === opts[key])));
    }
    function wireSeg(id, key, attr, num) {
      const el = $(id); if (!el) return;
      el.addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; opts[key] = num ? +b.dataset[attr] : b.dataset[attr]; save(); syncSeg(id, key, attr, num); });
      syncSeg(id, key, attr, num);
    }
    wireSeg('timeSeg', 'hour', 'h', true); wireSeg('shoeSeg', 'shoes', 'shoe');
    const idBox = $('idBox'); if (idBox) { idBox.checked = !!opts.id; idBox.addEventListener('change', () => { opts.id = idBox.checked; save(); }); }
    // the name you type on the start screen is the name written in the forest register
    const nameBox = $('nameBox');
    const cleanName = v => String(v || '').replace(/[<>&"]/g, '').replace(/\s+/g, ' ').trim().slice(0, 32);
    if (nameBox) { nameBox.value = opts.name || ''; nameBox.addEventListener('input', () => { opts.name = cleanName(nameBox.value); save(); }); }
    const playerName = () => opts.name || '';
    function setName(n) { n = cleanName(n); if (!n) return; opts.name = n; save(); if (nameBox) nameBox.value = n; }

    /* ---------- state of this trip ---------- */
    let P = null, S = null;
    function reset(p, startFrom) {
      P = p;
      ECON.wallet.depositCash();   // cash from older builds goes back to the phone: everything is coins now
      S = { startFrom, reg: startFrom === 'magic' ? { auto: true, plastic: 0 } : null, out: false, slipCd: 20, ankle: 0, dip: 0,
        walked: 0, legs: 0, warned: {}, panel: null };
      const b = ctx.trek && ctx.trek.bag;
      if (b && opts.id && !b.gear.includes('idcard')) b.gear.unshift('idcard');
      if (ctx.trek) ctx.trek.syncCoins();
      closePanel();
      if (CARS.length) parkAll();
    }
    const startHour = () => opts.hour;
    const shoe = () => ECON.SHOES[opts.shoes] || ECON.SHOES.trek;

    // paying: coins from the phone, everywhere
    function pay(n, why) {
      const W = ECON.wallet;
      if (W.spend(n, why)) return { ok: true };
      return { ok: false, msg: `Not enough coins: ${n} needed, you have ${W.coins}.`, topUp: true };
    }

    /* ---------- panels: check post, taxi, end of a leg ---------- */
    const css = document.createElement('style');
    css.textContent = `#tripPanel .reg{font:14px/1.5 'Courier New',monospace;background:#f4efe2;color:#2a2418;border-radius:8px;padding:12px 14px;margin:10px 0;
      background-image:repeating-linear-gradient(#f4efe2 0 23px,#c9c1ad 23px 24px)}
#tripPanel .reg b{color:#7a2a18}#tripPanel .ok{color:#2f7a4a}#tripPanel .no{color:#b3261e;font-weight:700}
#tripPanel .btns{display:flex;flex-wrap:wrap;gap:8px;justify-content:flex-end;margin-top:12px}
#tripFade{position:fixed;inset:0;background:#000;opacity:0;pointer-events:none;transition:opacity .6s;z-index:60}
#tripFade.on{opacity:1}`;
    document.head.appendChild(css);
    const panel = document.createElement('div'); panel.id = 'tripPanel'; panel.className = 'tpanel'; panel.hidden = true;
    panel.innerHTML = '<div class="box" role="dialog" aria-labelledby="tripTitle"><h3 id="tripTitle"></h3><div class="sub" id="tripSub"></div><div id="tripBody"></div><div class="btns" id="tripBtns"></div></div>';
    document.body.appendChild(panel);
    const fadeEl = document.createElement('div'); fadeEl.id = 'tripFade'; document.body.appendChild(fadeEl);
    function openPanel(kind, title, sub, body, btns) {
      S.panel = kind; $('tripTitle').textContent = title; $('tripSub').textContent = sub || ''; $('tripBody').innerHTML = body || '';
      const bx = $('tripBtns'); bx.innerHTML = '';
      for (const [label, fn, primary, dis] of btns) {
        const b = document.createElement('button'); b.type = 'button'; b.className = 'btn ' + (primary ? 'primary' : 'ghost'); b.textContent = label; b.disabled = !!dis;
        b.addEventListener('click', fn); bx.appendChild(b);
      }
      panel.hidden = false; ctx.setState('panel'); if (document.pointerLockElement) document.exitPointerLock();
    }
    function closePanel(back) {
      if (!S || !S.panel) { panel.hidden = true; return; }
      S.panel = null; panel.hidden = true;
      if (back !== false) { ctx.setState('play'); ctx.resume(); }
    }
    window.addEventListener('keydown', e => { if (S && S.panel && e.code === 'Escape') { closePanel(); e.stopImmediatePropagation(); } }, true);
    const fade = (ms, mid) => { fadeEl.classList.add('on'); setTimeout(() => { mid(); setTimeout(() => fadeEl.classList.remove('on'), 250); }, ms); };
    const clock = h => { h = ((h % 24) + 24) % 24; return String(Math.floor(h)).padStart(2, '0') + ':' + String(Math.floor((h % 1) * 60)).padStart(2, '0'); };

    /* ---------- the world: check post, taxis, boards, Snowline and beyond ---------- */
    let CP = null; const TAXIS = [], CARS = [], TRAFFIC = [], LINES = {};
    const nearLine = (Ln, p, r) => { for (let i = 0; i < Ln.xs.length; i += 2) if ((Ln.xs[i] - p.x) ** 2 + (Ln.zs[i] - p.z) ** 2 < r * r) return true; return false; };
    function build(hp) {
      const { textPlane, box, mbox, lam, post, board, besideTrail, makeNPC } = hp;
      const { galu: GT, mcleod: MT, snow: SN } = ctx.TRAILS, MK = ctx.MK;
      const at = (tr, s, side, off) => { const p = tr.pointAtS(s), d = tr.dirAtS(s, 8); return { x: p.x - d.dz * off * side, z: p.z + d.dx * off * side, h: p.h, dx: d.dx, dz: d.dz }; };
      // which side of the path is flatter at s (so huts and cars do not hang over a drop)
      const flatSide = (tr, s, off) => { const a = at(tr, s, 1, off), b = at(tr, s, -1, off); return Math.abs(H(a.x, a.z) - a.h) <= Math.abs(H(b.x, b.z) - b.h) ? 1 : -1; };

      // --- Forest check post, Gallu: a green hut with a window on the path, a table with the register, the guard
      {
        const side = flatSide(GT, CP_S, 5.2), c = at(GT, CP_S, side, 5.2);
        const face = Math.atan2(-(c.x - GT.pointAtS(CP_S).x), -(c.z - GT.pointAtS(CP_S).z));   // the hut's front (+z) looks at the path
        const g = new THREE.Group(); const gy = Math.min(H(c.x, c.z), c.h + 0.2); g.position.set(c.x, gy, c.z); g.rotation.y = face;
        const plinth = mbox(3.2, 1.2, 2.8, 'stone', 0x9a958c, 1.4); plinth.position.y = -0.45; g.add(plinth);
        const walls = mbox(3.0, 2.4, 2.6, 'plaster', 0x4f7a4a, 2.2); walls.position.y = 1.35; g.add(walls);
        const trim = mbox(3.1, 0.18, 2.7, 'plaster', 0xe9e2cf); trim.position.y = 2.6; g.add(trim);
        const roof = mbox(3.8, 0.1, 3.4, 'tin', 0x9a3b2c, 1.2); roof.position.set(0, 2.9, 0.15); roof.rotation.x = 0.14; g.add(roof);
        const win = box(1.3, 0.8, 0.05, 0x1c2328); win.position.set(-0.5, 1.6, 1.31); g.add(win);
        const door = box(0.9, 1.9, 0.05, 0x3d2c1f); door.position.set(0.95, 1.1, 1.31); g.add(door);
        const sign = textPlane([{ t: 'FOREST CHECK POST', size: 50, w: 700, font: 'Rajdhani, sans-serif' }, { t: 'GALLU · Dharamshala Forest Circle', size: 30 },
          { t: 'Register here · original ID', size: 32 }, { t: `Entry ₹${FEE} per person per day`, size: 32 }], 2.7, 1.3, '#1f4a2e', '#f1ead8');
        sign.position.set(0, 3.55, 1.0); g.add(sign);
        const rules = textPlane([{ t: 'NO PLASTIC · NO ALCOHOL', size: 40, w: 700 }, { t: 'Packets and bottles are counted', size: 30 }, { t: 'in and out. Entry closes 11:30', size: 30 }], 1.5, 0.95, '#f2efe6', '#7a2a18');
        rules.position.set(-1.53, 1.5, 0.2); rules.rotation.y = -Math.PI / 2; g.add(rules);
        // the table under the window: register book, pen, a steel tray for receipts
        const tbl = mbox(1.4, 0.06, 0.7, 'wood', 0x8a6a4a, 1); tbl.position.set(-0.5, 0.8, 1.75); g.add(tbl);
        for (const [lx, lz] of [[-1.1, 1.45], [0.1, 1.45], [-1.1, 2.05], [0.1, 2.05]]) { const l = box(0.05, 0.8, 0.05, 0x5a4632); l.position.set(lx, 0.4, lz); g.add(l); }
        const book = box(0.5, 0.05, 0.36, 0xf4efe2); book.position.set(-0.6, 0.86, 1.75); book.rotation.y = 0.1; g.add(book);
        const cover = box(0.52, 0.03, 0.38, 0x7a2a18); cover.position.set(-0.6, 0.835, 1.75); cover.rotation.y = 0.1; g.add(cover);
        const pen = box(0.14, 0.012, 0.012, 0x1f3b8a); pen.position.set(-0.3, 0.875, 1.7); pen.rotation.y = 0.6; g.add(pen);
        scene.add(g);
        if (ctx.collide) { ctx.collide.rect(c.x, c.z, face, 3.2, 2.8); const t = { x: c.x + Math.sin(face) * 1.75 - Math.cos(face) * 0.5, z: c.z + Math.cos(face) * 1.75 + Math.sin(face) * 0.5 }; ctx.collide.rect(t.x, t.z, face, 1.4, 0.7, true); }
        // where the hiker stands to sign: between the table and the path
        const tx = c.x + Math.sin(face) * 2.55 - Math.cos(face) * 0.5, tz = c.z + Math.cos(face) * 2.55 + Math.sin(face) * 0.5;
        CP = { x: tx, z: tz, s: CP_S, face };
        makeNPC(GT, CP_S + 3, side, 0x5a6a3a, 'Namaste. Forest check post: register here before you go up. Original ID, please.', { keeper: true });
      }
      // --- 22 curves: the board where the last tight zig-zags begin (OSM shows them from about 1 km below the top)
      board(GT, GT.total - 1070, GT.pointAtS(GT.total - 1070), 3.0, [{ t: '22 CURVES', size: 66, font: 'Rajdhani, sans-serif', w: 700 }, { t: 'The last 1 km to Triund top', size: 38 }, { t: 'Short steps, steady breath', size: 34 }], 2.6, 1.4);

      // --- McLeod Ganj and Dharamkot: boards and taxis
      const msq = MK.mainSquare, dk = MK.dharamkot, tdk = MK.taxiDharamkot, tmc = MK.taxiMcleod;
      board(MT, 14, { x: msq.e, z: -msq.n }, 3.4, [{ t: 'McLEOD GANJ', size: 62, font: 'Rajdhani, sans-serif', w: 700 }, { t: 'Main Square · ' + Math.round(msq.ele).toLocaleString('en-IN') + ' m', size: 38 },
        { t: 'Triund ' + ((MT.total + GT.total) / 1000).toFixed(1) + ' km via Dharamkot', size: 34 }], 2.7, 1.4);
      board(MT, dk.s, { x: dk.e, z: -dk.n }, 3.2, [{ t: 'DHARAMKOT', size: 62, font: 'Rajdhani, sans-serif', w: 700 }, { t: Math.round(dk.ele).toLocaleString('en-IN') + ' m', size: 40 },
        { t: 'Gallu Devi ' + ((MT.total - dk.s) / 1000).toFixed(1) + ' km · Triund ' + ((MT.total - dk.s + GT.total) / 1000).toFixed(1) + ' km', size: 30 }], 2.6, 1.3);
      for (let s = 500; s < MT.total - 150; s += 500) if (Math.abs(s - dk.s) > 120)
        board(MT, s, MT.pointAtS(s), 2.6, [{ t: 'GALLU DEVI ' + ((MT.total - s) / 1000).toFixed(1) + ' km', size: 46, w: 700 }, { t: 'Triund ' + ((MT.total - s + GT.total) / 1000).toFixed(1) + ' km', size: 38 }], 1.9, 0.9);
      // --- the motor road (Tushita Road and Gallu Devi Temple Road, from OSM) and the taxis on it
      const V = hp.veh, RD = ctx.roads;
      if (V && RD && RD.drive) {
        LINES.mcleod = V.line(RD.drive.mcleod); LINES.dharamkot = V.line(RD.drive.dharamkot);
        V.roadMesh(LINES.mcleod, 4.4); V.roadMesh(LINES.dharamkot, 4.0, p => LINES.mcleod && nearLine(LINES.mcleod, p, 3));
        // taxi stands: the first car waits on the road with its door to the kerb, the next ones parked behind it.
        // At Gallu the cars wait at the top of the road, turned round for the drive down
        const stand = (key, Ln, d0, down, n) => {
          for (let i = 0; i < n; i++) {
            const car = V.makeCar({ taxi: true, color: [0xf2f2ee, 0xeae7de, 0xf4f4f2][i % 3], shirt: [0x3a4a6a, 0x6a3a2a, 0x2a5a4a][i % 3] });
            const d = down ? d0 + i * 6.5 : d0 - i * 6.5, F = V.follower(car, Ln, { from: d, reverse: down, off: PARK_OFF });
            const park = { x: car.g.position.x, z: car.g.position.z, yaw: F.yaw, d };
            const t = { key, car, Ln, down, park, i, F };
            CARS.push(t); if (i === 0) TAXIS.push(t);
            if (ctx.collide) t.cid = ctx.collide.rect(park.x, park.z, park.yaw, 1.9, 4.5);
          }
        };
        stand('mcleod', LINES.mcleod, 16, false, 3);
        stand('dharamkot', LINES.dharamkot, 10, false, 2);
        stand('gallu', LINES.mcleod, LINES.mcleod.total - 34, true, 2);
        // two private cars going up and down the road all day, stopping for people on it
        for (let i = 0; i < 2; i++) {
          const car = V.makeCar({ color: [0x9a1f24, 0x3c4a5a][i], shirt: 0x444444 });
          TRAFFIC.push({ car, F: trafficF(car, LINES.mcleod, i ? LINES.mcleod.total - 60 : 60, !!i), wait: 0 });
        }
      }
      const taxiBoard = (tr, s, key) => board(tr, s, tr.pointAtS(s), 3.0, [{ t: 'TAXI STAND', size: 58, w: 700 }, { t: key === 'gallu' ? 'to McLeod Ganj ₹' + TAXI.gallu : 'to Gallu Devi ₹' + TAXI[key], size: 38 }], 1.9, 0.9);
      taxiBoard(MT, Math.max(24, tmc.s + 10), 'mcleod'); taxiBoard(MT, tdk.s + 8, 'dharamkot'); taxiBoard(GT, 20, 'gallu');
      for (const t of TAXIS) {
        // the driver waits outside his car on the kerb side, by his front door, facing the people walking past; when
        // you take the taxi he walks round the bonnet and gets in at the driver's door (right-hand drive)
        const home = carPt(t.car, DRV_PATH[0][0], DRV_PATH[0][1]); home.yaw = t.car.g.rotation.y + Math.PI / 2;
        const i = makeNPC(t.key === 'gallu' ? GT : MT, 0, 1, 0x3a4a6a, t.key === 'gallu' ? 'Taxi to McLeod? Five hundred, the road is bad.' : 'Taxi to Gallu Devi temple? Saves you the walk up the lanes.', { keeper: true, at: home });
        if (i != null) { t.drv = { i, home }; if (t.car.driver) t.car.driver.visible = false; }
      }

      // --- on past the top: Snowline Cafe, the Laka Got / Lahesh Cave signpost, boards on the way
      board(SN, 25, SN.pointAtS(25), 2.8, [{ t: 'SNOWLINE CAFE', size: 58, font: 'Rajdhani, sans-serif', w: 700 }, { t: (SN.total / 1000).toFixed(1) + ' km · +' + Math.round(SN.topAlt - SN.pointAtS(0).h) + ' m', size: 40 }, { t: 'Steep and rocky. Not after dark.', size: 32 }], 2.6, 1.3);
      for (let s = 500; s < SN.total - 150; s += 500) board(SN, s, SN.pointAtS(s), 2.4, [{ t: 'SNOWLINE ' + ((SN.total - s) / 1000).toFixed(1) + ' km', size: 48, w: 700 }, { t: 'Triund ' + (s / 1000).toFixed(1) + ' km back', size: 36 }], 1.9, 0.9);
      const lh = MK.lahesh;
      board(SN, lh.s, { x: lh.e, z: -lh.n }, 2.6, [{ t: 'LAKA GOT · LAHESH CAVE', size: 44, w: 700 }, { t: 'Indrahar Pass 4,342 m', size: 38 }, { t: 'Extra day · go with a guide', size: 34 }], 2.6, 1.3);
      CP.ready = true;
    }

    /* ---------- the check post ---------- */
    const plasticIn = () => { const b = ctx.trek && ctx.trek.bag; if (!b) return 0; let n = b.plasticBottles || 0; for (const id in b.food) if (ECON.ITEMS[id].plastic) n += b.food[id]; return n; };
    const plasticNow = () => plasticIn() + ((ctx.trek && ctx.trek.bag && ctx.trek.bag.wrappers) || 0);
    const hasID = () => { const b = ctx.trek && ctx.trek.bag; return !!(b && b.gear.includes('idcard')); };
    function openCheckpost() {
      const hr = ctx.hour(), W = ECON.wallet, late = hr >= CLOSE_H || hr < 6, id = hasID(), pl = plasticIn(), cash = W.coins >= FEE, who = playerName() || 'Trekker';
      const day = new Date(); const date = day.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
      const row = (k, v, ok) => `<div>${k}: ${ok === false ? `<span class="no">${v}</span>` : ok ? `<span class="ok">${v}</span>` : v}</div>`;
      const body = `<div class="reg"><div><b>FOREST CHECK POST GALLU · ENTRY REGISTER</b></div>${row('Date', date)}${row('Time in', clock(hr), !late)}${row('Name', who + ' (1 person)')}${row('Route', 'Gallu → Triund, return same day or camp')}
        ${row('ID proof', id ? 'Original ID card seen' : 'No original ID', id)}${row('Plastic', pl ? pl + ' packets/bottles, written down: bring them back' : 'None', true)}${row('Alcohol', 'None', true)}
        ${row('Entry fee', cash ? `${FEE} coins (₹${FEE})` : `${FEE} coins needed, you have ${W.coins}`, cash)}</div>`;
      let sub = 'The forest guard turns the register round for you to sign.', why = '';
      if (late) why = 'Entry is closed after 11:30. "Too late to go up and come down in daylight. Start between 7 and 9 tomorrow."';
      else if (!id) why = '"Original ID only, sorry. No ID, no entry." Your ID card is at home.';
      else if (!cash) why = `"Entry is ₹${FEE}." You have ${W.coins} coins: top up the phone first.`;
      if (why) sub = why;
      openPanel('cp', 'Forest check post, Gallu', sub, body, [
        ['Go back', () => closePanel(), false],
        [`Sign and pay ${FEE} coins`, () => {
          if (!W.spend(FEE, 'Triund entry fee, Gallu')) return;
          S.reg = { t: hr, plastic: pl }; const b = ctx.trek && ctx.trek.bag; if (b && !b.gear.includes('receipt')) b.gear.push('receipt');
          if (ctx.trek) ctx.trek.syncCoins(); closePanel(); ctx.buzz(1);
          ctx.say(pl ? `Registered. The guard writes down ${pl} plastic item${pl > 1 ? 's' : ''}: "Show me the same number, empty, on the way down. Have a good trek."` : 'Registered. "No plastic? Very good. Have a good trek, stay on the path."', 5);
        }, true, !!why]]);
    }
    function checkOut() {
      if (S.out || !S.reg || S.reg.auto) return;
      S.out = true; const n = plasticNow();
      ctx.say(n >= S.reg.plastic ? `Check post: ${S.reg.plastic} plastic item${S.reg.plastic === 1 ? '' : 's'} went up, ${n} came back down. "Thank you for keeping Triund clean."` : `Check post: ${S.reg.plastic} plastic items went up, only ${n} came down. The guard shakes his head.`, 5);
    }

    /* ---------- taxis: pay, get in, ride the real road, get out ---------- */
    function openTaxi(t) {
      const down = t.key === 'gallu', price = TAXI[t.key], km = (t.Ln.total / 1000).toFixed(1);
      openPanel('taxi', down ? 'Taxi down to McLeod Ganj' : 'Taxi to Gallu Devi temple', `${km} km on the narrow road: ${down ? 'Gallu Devi Temple Road down to Tushita Road and the Main Square' : t.key === 'mcleod' ? 'up Tushita Road, then Gallu Devi Temple Road; the last part is a dirt track' : 'round by TIPA Road, then up Gallu Devi Temple Road'}. About ${down ? 20 : t.key === 'mcleod' ? 25 : 15} minutes.`,
        `<div class="sub">Fare ${price} coins (₹${price}). You have ${ECON.wallet.coins} coins.</div>`,
        [['Walk instead', () => closePanel(), false], [`Pay ${price} coins and get in`, () => {
          const r = pay(price, down ? 'Taxi Gallu to McLeod Ganj' : 'Taxi to Gallu Devi');
          if (!r.ok) { ctx.toast(r.msg); return; }
          closePanel(false); if (ctx.trek) ctx.trek.syncCoins();
          startRide(t);
        }, true]]);
    }
    /* ---------- cars on the road: lanes, the car in front, the waiting driver ---------- */
    const PARK_OFF = 1.25;  // a parked taxi: at the kerb, its wheels on the road (further out it stood tilted on the verge)
    // a point beside a car, in its own frame (lx: metres to its left, the kerb side; lz: metres forward)
    function carPt(car, lx, lz) { const g = car.g, c = Math.cos(g.rotation.y), s = Math.sin(g.rotation.y); return { x: g.position.x + lx * c + lz * s, z: g.position.z - lx * s + lz * c }; }
    function carLocal(car, x, z) { const g = car.g, c = Math.cos(g.rotation.y), s = Math.sin(g.rotation.y), dx = x - g.position.x, dz = z - g.position.z; return { lx: dx * c - dz * s, lz: dx * s + dz * c }; }
    const carV = o => RIDE && RIDE.car === o.car && RIDE.F ? RIDE.F.v : o.F ? o.F.v : 0;
    // the nearest car in front, in this car's lane (|lx| < half): bumper-to-bumper gap, its speed and which it is
    function carAhead(car, look, half, skip) {
      let best = { gap: Infinity, v: 0, o: null };
      for (const o of CARS.concat(TRAFFIC)) {
        if (o.car === car || o.car === skip) continue;
        const q = carLocal(car, o.car.g.position.x, o.car.g.position.z);
        if (q.lz > 0.5 && q.lz < look && Math.abs(q.lx) < half && q.lz - 4.6 < best.gap) best = { gap: q.lz - 4.6, v: carV(o), o };
      }
      return best;
    }
    // people on the road in front of a car (you, hikers, shopkeepers, the waiting drivers): distance from the front
    // bumper to the nearest one in its path; hikers who are in the way step to the side of the road
    function personAhead(car, look, half) {
      let gap = Infinity; const C = ctx.crowd && ctx.crowd();
      const test = (x, z, a) => {
        const q = carLocal(car, x, z);
        // a hiker walking into the side or the back of the car steps round it instead of through it
        if (a && a.tr && Math.abs(q.lx) < 1.5 && Math.abs(q.lz) < 2.9 && (a.state === 'walk' || a.state === 'rest')) makeWay(car, a, q);
        if (q.lz < 1.2 || q.lz > look || Math.abs(q.lx) > half) return;
        gap = Math.min(gap, q.lz - 2.3 - 0.4);
        if (a && a.tr && (a.state === 'walk' || a.state === 'rest') && q.lz < 16) makeWay(car, a, q);
      };
      if (P && !(RIDE && RIDE.phase === 'drive')) test(P.x, P.z, null);
      if (C) {
        for (const a of C.agents) if (a.state !== 'sit' && a.state !== 'fire') test(a.x, a.z, a);
        for (const k of C.keepers) test(k.x, k.z, null);
        for (const k of C.talkers || []) test(k.x, k.z, null);
      }
      return gap;
    }
    function makeWay(car, a, q) {   // the hiker moves sideways until he is clear of the car (1.7 m from its middle)
      const yaw = car.g.rotation.y, lx = Math.cos(yaw), lz = -Math.sin(yaw), nx = -(a.tdz || 0), nz = a.tdx || 0, k = lx * nx + lz * nz;
      if (Math.abs(k) < 0.35) return;   // walking across the road: he is past in a moment anyway
      a.dodgeLat = Math.max(-3, Math.min(3, a.lat + ((q.lx >= 0 ? 1.7 : -1.7) - q.lx) / k)); a.dodgeT = 2.5;
    }
    // how fast you may go with that car in front: stop 2 m behind it, otherwise close up gently to its speed
    const followV = a => a.gap === Infinity ? Infinity : a.gap < 2 ? 0 : Math.min(Math.sqrt(2 * 2.5 * (a.gap - 2)), a.v + (a.gap - 2) * 0.6);
    // the two private cars shuttle between just above the McLeod taxi stand and just below the one at Gallu
    function trafficF(car, Ln, from, reverse) { const F = ctx.veh.follower(car, Ln, { from, reverse, vmax: 8, off: 1.1 }); F.end = reverse ? 40 : Ln.total - 60; return F; }
    // the waiting taxi driver: a crowd character (or the plain figure before the crowd has loaded); x null: in his car
    const DRV_PATH = [[1.45, 2.0], [1.15, 3.1], [-1.15, 3.1], [-1.35, 0.5]];   // round the bonnet to the driver's door
    function driverAt(t, x, z, yaw, anim) {
      const N = t.drv && ctx.npc && ctx.npc(t.drv.i); if (!N || !N.n) return;
      const gone = x == null; N.n.x = gone ? 1e7 : x; N.n.z = gone ? 1e7 : z;
      if (N.a) { if (gone) { N.a.x = N.a.z = 1e7; N.a.y = -1e4; } else { N.a.x = x; N.a.z = z; N.a.y = ctx.meshH(x, z); N.a.yaw = yaw; N.a.anim = anim || 'Idle'; N.a.animSpeed = 1; } }
      else if (N.n.g) { N.n.g.visible = !gone; if (!gone) { N.n.g.position.set(x, ctx.meshH(x, z), z); N.n.g.rotation.y = yaw + Math.PI; } }
    }
    function driverWalk(t, d) {   // d metres along the path: where he is, or true once he is at his door
      let k = d;
      for (let i = 1; i < DRV_PATH.length; i++) {
        const a = carPt(t.car, DRV_PATH[i - 1][0], DRV_PATH[i - 1][1]), b = carPt(t.car, DRV_PATH[i][0], DRV_PATH[i][1]), L = Math.hypot(b.x - a.x, b.z - a.z);
        if (k <= L) { const u = k / L; driverAt(t, a.x + (b.x - a.x) * u, a.z + (b.z - a.z) * u, Math.atan2(b.x - a.x, b.z - a.z), 'Walk'); return false; }
        k -= L;
      }
      return true;
    }

    // the ride: board (door opens, you walk to it and get in, door shuts), drive (chase camera or the view from the
    // back seat), alight (door opens, you step out). The game clock runs the real ride time.
    let RIDE = null;
    const hudEl = document.createElement('div'); hudEl.id = 'rideHud'; hudEl.hidden = true;
    hudEl.style.cssText = 'position:fixed;left:50%;bottom:calc(18px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);z-index:7;background:rgba(8,12,10,.72);color:#e7ede9;font:600 15px/1.35 system-ui,sans-serif;padding:8px 14px;border-radius:10px;text-align:center;pointer-events:none;max-width:calc(100vw - 32px)';
    document.body.appendChild(hudEl);
    function doorPoint(car, out) {   // beside the rear left door, out metres from the car side
      const g = car.g, c = Math.cos(g.rotation.y), s = Math.sin(g.rotation.y), lx = 0.95 + out, lz = -0.6;
      return { x: g.position.x + lx * c + lz * s, z: g.position.z - lx * s + lz * c };
    }
    function startRide(t) {
      const car = t.car, mins = t.key === 'gallu' ? 20 : t.key === 'mcleod' ? 25 : 15;
      if (t.cid != null && ctx.collide) ctx.collide.disable(t.cid);
      RIDE = { t, car, phase: 'board', time: 0, drvIn: t.drv ? null : 0, cam: 'chase', from: { x: P.x, z: P.z }, F: null, gtRate: mins * 60 / Math.max(60, t.Ln.total / 7.5), camPos: null, wasFP: P.firstPerson };
      ctx.setState('ride'); if (document.pointerLockElement) document.exitPointerLock();
      hudEl.hidden = false; hudEl.textContent = 'Getting in…';
      for (const id of ['prompt', 'cross']) { const e = document.getElementById(id); if (e) e.style.visibility = 'hidden'; }
      engine(true);
    }
    function endRide() {
      const t = RIDE.t, car = RIDE.car, down = t.key === 'gallu';
      car.setDoor(0); car.rider.visible = false; hudEl.hidden = true; engine(false);
      for (const id of ['prompt', 'cross']) { const e = document.getElementById(id); if (e) e.style.visibility = ''; }
      if (ctx.collide) { const g = car.g; t.cid2 = ctx.collide.rect(g.position.x, g.position.z, g.rotation.y, 1.9, 4.5); }
      const R = ctx.route(), target = down ? R.total - 2 : R.sOf('galu', 2);
      ctx.teleport(target); S.rode = true; RIDE = null; P.firstPerson = true;
      const pc = ctx.pch; if (pc) pc.ch.root.visible = false;
      ctx.setState('play'); ctx.resume();
      ctx.say(down ? 'The taxi drops you at the Main Square in McLeod Ganj.' : 'The taxi drops you below Gallu Devi temple. The forest check post is just up the path.', 4);
    }
    function skipRide() {
      if (!RIDE || RIDE.phase !== 'drive') return;
      fade(500, () => { const F = RIDE.F; while (!F.done) F.step(0.25); P.gt = RIDE.gtEnd; RIDE.phase = 'alight'; RIDE.time = 0; RIDE.camPos = null; });
    }
    window.addEventListener('keydown', e => {
      if (!RIDE) return;
      if (e.code === 'KeyE' || e.code === 'Space' || e.code === 'Enter') { skipRide(); e.preventDefault(); e.stopImmediatePropagation(); }
      else if (e.code === 'KeyV' || e.code === 'KeyC') { RIDE.cam = RIDE.cam === 'chase' ? 'seat' : 'chase'; RIDE.camPos = null; e.preventDefault(); e.stopImmediatePropagation(); }
    }, true);
    // engine: a low rumble whose pitch follows the speed
    let ENG = null;
    function engine(on) {
      const A = ctx.audio && ctx.audio(); if (!A || !A.AC) return;
      if (on && !ENG) {
        const o = A.AC.createOscillator(), o2 = A.AC.createOscillator(), f = A.AC.createBiquadFilter(), g = A.AC.createGain();
        o.type = 'sawtooth'; o2.type = 'square'; o.frequency.value = 38; o2.frequency.value = 19; f.type = 'lowpass'; f.frequency.value = 260; g.gain.value = 0;
        o.connect(f); o2.connect(f); f.connect(g); g.connect(A.master); o.start(); o2.start(); ENG = { o, o2, g, AC: A.AC };
      } else if (!on && ENG) { const t0 = ENG.AC.currentTime; ENG.g.gain.setTargetAtTime(0, t0, 0.2); const E = ENG; setTimeout(() => { E.o.stop(); E.o2.stop(); }, 900); ENG = null; }
    }
    function rideTick(dt, camera) {
      if (!RIDE) return;
      if (TRAFFIC.length) traffic(dt);
      const R0 = RIDE, car = R0.car, g = car.g, pc = ctx.pch; R0.time += dt;
      const fwd = { x: Math.sin(g.rotation.y), z: Math.cos(g.rotation.y) }, side = { x: Math.cos(g.rotation.y), z: -Math.sin(g.rotation.y) };
      let camT = null, look = null;
      const walk = (a, b, k) => {   // the player's character walking from a to b (k 0..1), facing the way it goes
        if (!pc) return; const x = a.x + (b.x - a.x) * k, z = a.z + (b.z - a.z) * k;
        pc.ch.root.visible = true; pc.ch.root.position.set(x, ctx.meshH(x, z), z); pc.ch.root.rotation.y = Math.atan2(b.x - a.x, b.z - a.z);
        pc.play(k > 0 && k < 1 ? 'Walk' : 'Idle', 1); pc.ch.mixer.update(dt);
        P.x = x; P.z = z; P.y = ctx.meshH(x, z);
      };
      if (R0.phase === 'board') {
        const T = R0.time, dp = doorPoint(car, 0.45);
        car.setDoor(Math.min(1, T / 0.7) * (T < 1.9 ? 1 : Math.max(0, 1 - (T - 1.9) / 0.6)));
        if (T < 1.7) walk(R0.from, dp, Math.max(0, Math.min(1, (T - 0.3) / 1.3)));
        else { if (pc) pc.ch.root.visible = false; car.rider.visible = true; }
        camT = { x: g.position.x + side.x * 6.5 - fwd.x * 4, y: g.position.y + 2.6, z: g.position.z + side.z * 6.5 - fwd.z * 4 };
        look = { x: dp.x, y: g.position.y + 1.0, z: dp.z };
        if (R0.drvIn == null && driverWalk(R0.t, T * 1.7)) { R0.drvIn = T; driverAt(R0.t, null); if (car.driver) car.driver.visible = true; }
        if (T > 2.6 && R0.drvIn != null && T > R0.drvIn + 0.5) {
          R0.phase = 'drive'; R0.time = 0; const t = R0.t;
          R0.F = ctx.veh.follower(car, t.Ln, { from: t.park.d, reverse: t.down, vmax: 12, off: PARK_OFF, offT: 1.0, offEnd: 2.4, offRate: 0.35 });
          R0.gt0 = P.gt || 0; R0.gtEnd = R0.gt0 + (t.key === 'gallu' ? 20 : t.key === 'mcleod' ? 25 : 15) * 60;
        }
      } else if (R0.phase === 'drive') {
        const F = R0.F, sdt = Math.min(dt, 0.05) * 1.6, left0 = Math.abs(F.end - F.d);   // a little faster than life, so the ride takes about two minutes
        if (!R0.pass) {
          const a = carAhead(car, 26, 1.7);
          if (a.o && a.gap < 16 && a.v < F.vmax - 2 && left0 > 140) {
            const d0 = F.Ln.dir(F.d, 3), d1 = F.Ln.dir(F.d + F.dirSign * 45, 3), straight = d0.dx * d1.dx + d0.dz * d1.dz > 0.93;
            const oncoming = CARS.concat(TRAFFIC).some(o => { if (o.car === car) return false; const q = carLocal(car, o.car.g.position.x, o.car.g.position.z); return q.lz > -2 && q.lz < 80 && q.lx < -0.6 && q.lx > -3.6; });
            if (straight && !oncoming) { R0.pass = a.o.car; F.offT = -1.25; }
          }
        } else {
          const q = carLocal(car, R0.pass.g.position.x, R0.pass.g.position.z);
          if (q.lz < -7 || left0 < 110) { R0.pass = null; F.offT = 1.0; }   // past it (or the end is near): back into the left lane
        }
        const ah = carAhead(car, 26, 1.7, R0.pass || null), allowC = followV(ah), allowP = followV({ gap: personAhead(car, 14, 1.3), v: 0 }), vm = F.vmax;
        R0.stuck = F.v < 0.1 && allowC < 0.5 ? (R0.stuck || 0) + dt : 0;
        R0.waitP = F.v < 0.1 && allowP < 0.5 ? (R0.waitP || 0) + dt : 0; if (R0.waitP > 1.5 && !R0.honked) { R0.honked = true; honk(); } if (!R0.waitP) R0.honked = false;
        // (stuck behind a car for 5 s, it goes on; for people it always waits: they step aside)
        F.vmax = Math.min(vm, allowP, R0.stuck < 5 ? allowC : Infinity);
        F.step(sdt); F.vmax = vm;
        P.gt = Math.min(R0.gtEnd, (P.gt || 0) + dt * 1.6 * R0.gtRate);
        P.x = g.position.x; P.z = g.position.z; P.y = g.position.y;
        if (ENG) { ENG.o.frequency.setTargetAtTime(34 + F.v * 5.5, ENG.AC.currentTime, 0.2); ENG.o2.frequency.setTargetAtTime(17 + F.v * 2.75, ENG.AC.currentTime, 0.2); ENG.g.gain.setTargetAtTime(0.045 + 0.02 * Math.min(1, F.v / 10), ENG.AC.currentTime, 0.2); }
        const left = Math.abs(F.end - F.d);
        hudEl.textContent = `${R0.t.down ? 'Taxi to McLeod Ganj' : 'Taxi to Gallu Devi'} · ${left > 950 ? (left / 1000).toFixed(1) + ' km' : Math.round(left / 10) * 10 + ' m'} to go · ${Math.round(F.v * 3.6)} km/h · V: view · E: skip`;
        if (R0.cam === 'seat') {
          // on the back seat behind the front passenger: the front seats, the driver's shoulder, the dashboard and the
          // road through the windscreen; the head sways a little with the road
          const sv = R0.sv || (R0.sv = { e: new THREE.Vector3(), l: new THREE.Vector3() });
          if (car.seatView) car.seatView(sv.e, sv.l);
          else { car.rider.getWorldPosition(sv.e); sv.e.y += 0.7; sv.l.set(fwd.x * 10, -0.6, fwd.z * 10).add(sv.e); }
          const sw = Math.sin(R0.time * 7.3) * 0.006 * Math.min(1, F.v / 6), sw2 = Math.sin(R0.time * 3.1) * 0.01 * Math.min(1, F.v / 6);
          camera.position.set(sv.e.x + side.x * sw2, sv.e.y + sw, sv.e.z + side.z * sw2); camera.lookAt(sv.l);
          // the cabin is within arm's reach: a near clip plane of 0.4 m would cut it away (put back when you leave this view)
          if (!R0.near0) {
            R0.near0 = camera.near; R0.fov0 = camera.fov; camera.near = 0.06; camera.fov = Math.min(camera.fov, 58); camera.updateProjectionMatrix();   // and a little narrower, as your eyes see a cabin
            const back = () => { if (RIDE === R0 && R0.cam === 'seat' && R0.phase === 'drive') requestAnimationFrame(back); else { camera.near = R0.near0; camera.fov = R0.fov0; camera.updateProjectionMatrix(); R0.near0 = 0; } };
            requestAnimationFrame(back);
          }
          R0.camPos = null; return;
        }
        camT = { x: g.position.x - fwd.x * 9 + side.x * 1.2, y: g.position.y + 3.8, z: g.position.z - fwd.z * 9 + side.z * 1.2 };
        look = { x: g.position.x + fwd.x * 5, y: g.position.y + 1.1, z: g.position.z + fwd.z * 5 };
        if (F.done) { R0.phase = 'alight'; R0.time = 0; }
      } else if (R0.phase === 'alight') {
        const T = R0.time, dp = doorPoint(car, 0.45), away = doorPoint(car, 2.2);
        car.setDoor(T < 1.8 ? Math.min(1, T / 0.6) : Math.max(0, 1 - (T - 1.8) / 0.6));
        if (T > 0.6) { car.rider.visible = false; walk(dp, away, Math.min(1, (T - 0.7) / 1.1)); }
        camT = { x: g.position.x + side.x * 6.5 + fwd.x * 3, y: g.position.y + 2.5, z: g.position.z + side.z * 6.5 + fwd.z * 3 };
        look = { x: dp.x, y: g.position.y + 1.0, z: dp.z };
        hudEl.textContent = 'Getting out…'; engine(false);
        if (T > 2.5) { endRide(); return; }
      }
      if (camT) {
        camT.y = Math.max(camT.y, H(camT.x, camT.z) + 1.6);
        if (!R0.camPos) R0.camPos = new THREE.Vector3(camT.x, camT.y, camT.z);
        else R0.camPos.lerp(new THREE.Vector3(camT.x, camT.y, camT.z), 1 - Math.exp(-dt * 3));
        camera.position.copy(R0.camPos); camera.lookAt(look.x, look.y, look.z);
      }
    }
    // the taxis go back to their stands for the next trek; the private cars keep driving
    function parkAll() {
      for (const t of CARS) {
        if (RIDE && RIDE.car === t.car) continue;
        const F = ctx.veh.follower(t.car, t.Ln, { from: t.park.d, reverse: t.down, off: PARK_OFF }); t.F = F; t.car.setDoor(0); t.car.rider.visible = false;
        if (t.drv) { if (t.car.driver) t.car.driver.visible = false; driverAt(t, t.drv.home.x, t.drv.home.z, t.drv.home.yaw, 'Idle'); }
        if (ctx.collide) { if (t.cid2 != null) ctx.collide.disable(t.cid2); t.cid2 = null; if (t.cid != null) ctx.collide.enable(t.cid); }
      }
    }
    function traffic(dt) {
      for (const c of TRAFFIC) {
        const F = c.F, g = c.car.g;
        // stop for anyone on the road ahead (you, hikers, shopkeepers, a waiting driver), then go on
        const allowP = followV({ gap: personAhead(c.car, 14, 1.3), v: 0 }), person = allowP < 0.5;
        const allow = Math.min(allowP, followV(carAhead(c.car, 22, 1.7)));
        if (allow < 0.5 && F.v < 0.5) { c.wait += dt; if (c.wait > 2.5 && person && !c.honked) { c.honked = true; honk(); } }
        else { c.wait = 0; c.honked = false; }
        { const vm = F.vmax; if (c.wait < 8 || person) F.vmax = Math.min(vm, allow); F.step(dt); F.vmax = vm; }
        // at the end of its run it turns round, but only out of your sight (a car does not spin on the spot)
        if (F.done && (!P || Math.hypot(P.x - g.position.x, P.z - g.position.z) > 70)) c.F = trafficF(c.car, F.Ln, F.d, F.dirSign > 0);
        // you cannot walk through a car
        if (P) {
          const c2 = Math.cos(g.rotation.y), s2 = Math.sin(g.rotation.y), dx = P.x - g.position.x, dz = P.z - g.position.z;
          const lx = dx * c2 - dz * s2, lz = dx * s2 + dz * c2;
          if (Math.abs(lx) < 1.25 && Math.abs(lz) < 2.6) { const px = Math.sign(lx || 1) * 1.25; P.x = g.position.x + px * c2 + lz * s2; P.z = g.position.z - px * s2 + lz * c2; }
        }
      }
    }
    function honk() {
      const A = ctx.audio && ctx.audio(); if (!A || !A.AC) return; const t0 = A.AC.currentTime;
      for (const f of [392, 494]) { const o = A.AC.createOscillator(), gg = A.AC.createGain(); o.type = 'square'; o.frequency.value = f; gg.gain.setValueAtTime(0, t0); gg.gain.linearRampToValueAtTime(0.04, t0 + 0.02); gg.gain.setValueAtTime(0.04, t0 + 0.35); gg.gain.linearRampToValueAtTime(0, t0 + 0.4); o.connect(gg); gg.connect(A.master); o.start(t0); o.stop(t0 + 0.45); }
    }

    /* ---------- the end of a leg ---------- */
    const DONE = { mcleod: 'McLeod Ganj Main Square', bhagsu: 'Bhagsu Naag temple' };
    function legEnd(kind) {
      S.legs++;
      const alt = Math.round(P.y).toLocaleString('en-IN') + ' m', hr = clock(ctx.hour());
      const keep = ['Keep exploring', () => closePanel(), false];
      if (kind === 'snowline') {
        ctx.buzz(2);
        openPanel('leg', 'Snowline Cafe · ' + alt, `${hr}. The snow line of the Dhauladhar is right above you.`,
          '<div class="sub">From here the path climbs on to Laka Got and the Lahesh Cave (about 3,350 m), and over Indrahar Pass (4,342 m) to the Chamba side. That is a long extra day with a guide and lies outside this map, so this trek turns back here.</div>',
          [keep, ['Walk back to Triund', () => go('snow_down'), true]]);
      } else if (kind === 'triund2') {
        openPanel('leg', 'Back on Triund · ' + alt, `${hr}. Stay the night, or walk down by either path.`, '',
          [keep, ['Stay the night', () => { closePanel(); ctx.stayNight(); }, false], ['Down via Bhagsu', () => go('down_shiva'), false], ['Down via Gallu Devi', () => go('down_galu'), true]]);
      } else {
        ctx.buzz(2);
        const km = (S.walked / 1000).toFixed(1), rode = S.rode ? ' (plus a taxi ride)' : '';
        const loop = S.startFrom === 'shiva' && kind === 'mcleod' || S.startFrom !== 'shiva' && kind === 'bhagsu';
        openPanel('leg', 'Trek complete', `${DONE[kind]} · ${hr}`,
          `<div class="sub">You walked ${km} km${rode}${loop ? ', up one path and down the other: the full Triund loop' : ''}. ${S.reg && !S.reg.auto ? 'Your entry receipt and every plastic item came back down with you.' : ''}</div>`,
          [keep, ['Walk again', () => { closePanel(false); ctx.restart(); }, true]]);
      }
    }
    function go(id) { closePanel(false); ctx.startRoute(id); ctx.setState('play'); ctx.resume(); const R = ctx.route(); ctx.say(R.name + ' · ' + (R.total / 1000).toFixed(1) + ' km', 3.5); }

    /* ---------- every frame ---------- */
    function update(dt, q) {
      if (!P || !S) return;
      if (TRAFFIC.length) traffic(dt);
      // the drivers waiting by their taxis stand quietly (the crowd starts every talker off talking with his hands)
      for (const t of TAXIS) if (t.drv && !(RIDE && RIDE.t === t)) { const N = ctx.npc && ctx.npc(t.drv.i); if (N && N.a && N.a.anim === 'Idle_Talking') N.a.anim = 'Idle'; }
      const R = ctx.route();
      S.walked += Math.max(0, P.v) * dt;
      // the check post: nobody walks past it without signing the register (it applies on the way up the Galu path)
      if (CP && CP.ready && R.ids.galu && !R.down) {
        const L = R.local(P.s);
        if (!S.reg && L.id === 'galu' && L.s > CP_S + 6 && L.s < 600 && q.d < 40) {
          const back = R.sOf('galu', CP_S - 3); ctx.teleport(back, true);
          ctx.say('The forest guard whistles: "Ruko! Register first, please." (E at the check post table)', 4);
        }
        if (!S.reg && !S.warned.cp && Math.hypot(P.x - CP.x, P.z - CP.z) < 14) { S.warned.cp = true; ctx.buzz(1); }
      }
      if (CP && R.down && R.ids.galu && !S.out) { const L = R.local(P.s); if (L.id === 'galu' && L.s < CP_S - 4) checkOut(); }
      // shoes: slips on steep, loose, wet or snowy ground, mostly going down
      S.slipCd -= dt; S.ankle = Math.max(0, S.ankle - dt); S.dip = Math.max(0, S.dip - dt * 1.6);
      if (P.v > 0.5 && S.slipCd <= 0 && !(ctx.trek && ctx.trek.sitting())) {
        const g = P.grade || 0, wx = ctx.wx, wet = wx ? (wx.wetness || 0) + (wx.snowHere || 0) * 1.5 + (wx.dust || 0) : 0;
        const steep = g < -0.18 ? 1.6 : g < -0.08 ? 0.7 : g > 0.25 ? 0.25 : 0.08;
        const rough = q.surf === 2 || q.onSteps ? 1.4 : q.surf === 3 ? 0.6 : 1;
        const p = 0.003 * shoe().slip * steep * rough * (1 + 2.5 * wet) * Math.min(2, (P.v / 1.2) ** 2);
        if (Math.random() < p * dt) {
          S.slipCd = 25; S.dip = 0.7; P.v = 0; P.vx = 0; P.vz = 0; P.stamina = Math.max(0, P.stamina - 10); ctx.buzz(1);
          if (opts.shoes === 'trek') ctx.say('Your foot skids on the loose stones, but the lugs catch. Easy going down.', 3.5);
          else {
            const hurt = Math.random() < (opts.shoes === 'canvas' ? 0.45 : 0.2);
            if (hurt) S.ankle = 150;
            ctx.say(`You slip ${wet > 0.3 ? 'on the wet rock' : 'on loose stones'} and land on your hand.` + (hurt ? ' Your ankle twinges: slower for a while.' : '') + ' Grip shoes would hold here.', 4.5);
          }
        }
      }
      // past Snowline Cafe the map ends: the watch says so once
      if (R.id === 'snow_up' || R.id === 'snow_down') { const sc = ctx.TRAILS.snow.pointAtS(ctx.TRAILS.snow.total); if (P.z < sc.z - 150 && !S.warned.beyond) { S.warned.beyond = true; ctx.say('Beyond Snowline the path goes on to Laka Got: an extra day with a guide. This trek turns back at Snowline Cafe.', 5); } }
    }
    function speedK() {
      if (!S) return 1;
      const g = P && P.grade || 0;
      return (g < -0.12 ? shoe().speed : 1) * (S.ankle > 0 ? 0.8 : 1);
    }
    function prompt(p) {
      if (!S || S.panel) return '';
      const R = ctx.route();
      if (CP && !S.reg && R.ids.galu && !R.down && Math.hypot(p.x - CP.x, p.z - CP.z) < 4.5) return '<kbd>E</kbd> Register at the forest check post';
      const t = nearTaxi(p); if (t) return `<kbd>E</kbd> ${t.key === 'gallu' ? 'Taxi down to McLeod Ganj' : 'Taxi to Gallu Devi'} · ${TAXI[t.key]} coins`;
      return '';
    }
    function nearTaxi(p) {
      const R = ctx.route(), L = R.local(P.s);
      for (const t of TAXIS) {
        const dp = doorPoint(t.car, 0.6); if (Math.hypot(p.x - dp.x, p.z - dp.z) > 3.2 && Math.hypot(p.x - t.car.g.position.x, p.z - t.car.g.position.z) > 3.4) continue;
        if (t.key === 'gallu' ? (R.id === 'down_galu') : (R.id === 'up_mcleod' && L.id === 'mcleod')) return t;
      }
      return null;
    }
    function interact(p) {
      if (!S || S.panel) return false;
      const R = ctx.route();
      if (CP && !S.reg && R.ids.galu && !R.down && Math.hypot(p.x - CP.x, p.z - CP.z) < 4.5) { openCheckpost(); return true; }
      const t = nearTaxi(p); if (t) { openTaxi(t); return true; }
      return false;
    }
    function bagRows() {
      const W = ECON.wallet, b = ctx.trek && ctx.trek.bag, rows = [];
      rows.push(['📱', `${W.coins} coins on the phone`, '1 coin = ₹1 · entry fee, taxis, stalls and the camp']);
      const sh = shoe(); rows.push(['👟', sh.name + ' (wearing)', sh.note]);
      if (b && b.wrappers) rows.push(['🗑', `Empty wrappers × ${b.wrappers}`, 'Carry them down: the check post counts plastic out']);
      if (b && b.plasticBottles) rows.push(['🧴', `Plastic bottles × ${b.plasticBottles}`, 'Bought on the trail: bring the empties back down']);
      return rows;
    }
    return {
      opts, reset, build, update, rideTick, get riding() { return !!RIDE; }, get ride() { return RIDE; }, get cars() { return CARS; }, get traffic() { return TRAFFIC; }, skipRide, prompt, interact, pay, bagRows, speedK, startHour, legEnd, go, playerName, setName,
      dip: () => S ? S.dip : 0, get state() { return S; }, get checkpost() { return CP; }, get taxis() { return TAXIS; },
      qaRegister() { if (S) S.reg = { t: ctx.hour(), plastic: plasticIn() }; }, closePanel
    };
  }
};
