'use strict';
/* The hiker's day on the Triund trail: game time, food energy, the bag, tea stalls, benches and eating.
   - Game time runs 6x real time, so the 3-4 hour climb plays in about 35 minutes; rest and meals are in game minutes.
   - Energy (food fuel) drains with effort and the pack; low energy slows you, at zero you crawl and must sit and rest
     (2 %/game minute back, i.e. 10 minutes of rest = 20 %).
   - The bag starts with the free kit for its size (economy.js). Open it with I; eat from it anywhere.
   - At a stall, E opens the menu. The shopkeeper hands the order over; packed items go into the bag, cooked food is
     eaten sitting down (C on a bench or anywhere on the ground).
   Player-facing text is English. */
window.TriundTrek = {
  create(ctx) {
    const { ECON } = ctx, TIME = 6;
    const $ = id => document.getElementById(id);
    const css = document.createElement('style');
    css.textContent = `
#res{position:fixed;left:calc(14px + env(safe-area-inset-left,0px));top:calc(12px + env(safe-area-inset-top,0px));z-index:7;display:flex;gap:8px;align-items:center;font:600 13px/1 var(--f-body,system-ui);color:var(--mist)}
#res .chip{background:rgba(8,12,10,.62);border:1px solid var(--line);border-radius:999px;padding:6px 10px;display:flex;gap:7px;align-items:center}
#res .bar{width:70px;height:7px;border-radius:4px;background:rgba(255,255,255,.14);overflow:hidden}
#res .bar i{display:block;height:100%;background:var(--marigold);transition:width .3s}
#res .bar.low i{background:#e0533d}
#sitHud{position:fixed;left:50%;top:calc(56px + env(safe-area-inset-top,0px));transform:translateX(-50%);z-index:7;background:rgba(8,12,10,.7);border:1px solid var(--line);border-radius:10px;padding:8px 14px;font-size:14px;color:var(--mist);text-align:center}
.tpanel{position:fixed;inset:0;z-index:30;display:flex;align-items:center;justify-content:center;background:rgba(4,8,6,.55);padding:16px}
.tpanel .box{background:var(--panel);border:1px solid var(--line);border-radius:14px;max-width:520px;width:100%;max-height:min(86vh,720px);overflow-y:auto;padding:18px 18px 14px;display:grid;gap:12px;color:var(--mist)}
.tpanel h3{margin:0;font-family:var(--f-display);font-size:26px;text-transform:uppercase;letter-spacing:.03em}
.tpanel .sub{font-size:13px;color:var(--muted);margin-top:-6px}
.tpanel .row{display:grid;grid-template-columns:28px 1fr auto;gap:10px;align-items:center;padding:8px 0;border-top:1px solid var(--line)}
.tpanel .row .ic{font-size:20px;text-align:center}
.tpanel .row .nm{font-weight:600}
.tpanel .row .fx{font-size:12px;color:var(--muted)}
.tpanel .row button{border:1px solid var(--line);background:transparent;color:var(--mist);border-radius:8px;padding:7px 12px;font-weight:700;min-width:84px}
.tpanel .row button.buy{background:var(--marigold);color:var(--marigold-ink,#1a1204);border-color:var(--marigold)}
.tpanel .row button:disabled{opacity:.45}
.tpanel .foot{display:flex;gap:10px;justify-content:space-between;align-items:center;flex-wrap:wrap}
.tpanel .coins{font-weight:700}
#kitList{font-size:13px;color:var(--muted);line-height:1.45;margin:10px 0 0;border:1px solid var(--line);border-radius:10px;padding:10px 12px;display:grid;gap:8px}
#kitList b{color:var(--mist);font-weight:600}
#kitList .chips{display:flex;flex-wrap:wrap;gap:6px}
#kitList .chips span{background:rgba(255,255,255,.07);border:1px solid var(--line);border-radius:999px;padding:3px 9px;color:var(--mist);font-size:12.5px}
body:has(#start:not([hidden])) #res,body:has(#end:not([hidden])) #res{display:none}
#res .chip.btn{cursor:pointer}
#res .chip.btn:hover{border-color:var(--mist)}`;
    document.head.appendChild(css);
    const div = (html, id, cls) => { const d = document.createElement('div'); if (id) d.id = id; if (cls) d.className = cls; d.innerHTML = html; document.body.appendChild(d); return d; };
    div(`<div class="chip" title="Food energy"><span>Energy</span><span class="bar" id="resBar"><i id="resFill"></i></span><b id="resEn">80%</b></div>
         <div class="chip" title="Coins"><span>🪙</span><b id="resCoins">0</b></div>
         <div class="chip btn" id="resBag" role="button" tabindex="0" title="Open your bag (I)"><span>🎒</span><b>Bag</b><small id="resBagN" style="color:var(--muted)"></small></div>`, 'res').hidden = true;
    div('', 'sitHud').hidden = true;
    const shop = div(`<div class="box" role="dialog" aria-labelledby="shopTitle"><h3 id="shopTitle">Menu</h3><div class="sub" id="shopSub"></div><div id="shopRows"></div>
      <div class="foot"><span class="coins">🪙 <span id="shopCoins">0</span> coins</span><span><button type="button" class="btn ghost" id="shopTop">Add coins</button> <button type="button" class="btn primary" id="shopClose">Back to the trail</button></span></div></div>`, 'shop', 'tpanel');
    shop.hidden = true;
    const bagP = div(`<div class="box" role="dialog" aria-labelledby="bagTitle"><h3 id="bagTitle">Your bag</h3><div class="sub" id="bagSub"></div><div id="bagRows"></div>
      <div class="foot"><span class="coins">🪙 <span id="bagCoins">0</span> coins</span><button type="button" class="btn primary" id="bagClose">Close</button></div></div>`, 'bagPanel', 'tpanel');
    bagP.hidden = true;
    const topP = div(`<div class="box" role="dialog" aria-labelledby="topTitle"><h3 id="topTitle">Add coins</h3><div class="sub">Coins pay for food, water and a tent at the top. Test mode: the checkout is a mock and no real money is charged.</div><div id="topRows"></div>
      <div class="sub" id="topHist"></div><div class="foot"><span class="coins">🪙 <span id="topCoins">0</span> coins</span><button type="button" class="btn primary" id="topClose">Close</button></div></div>`, 'topPanel', 'tpanel');
    topP.hidden = true;

    let P = null, bag = null, sit = null, eating = null, panelOpen = null, warn = {}, lastStop = null;
    const orders = [], pending = [], inflight = [];   // cooked orders waiting for their shopkeeper; dishes left on a counter

    /* ---------- what a served order looks like: a steel glass of tea, or a plate of food ---------- */
    const COOK = { chai: 4, lemontea: 4, maggi: 8, eggmaggi: 9, omelette: 8, paratha: 10, rajma: 6 };   // seconds at the stove
    function dishMesh(id) {
      const { THREE } = ctx, g = new THREE.Group(), M = (c, r, m) => new THREE.MeshStandardMaterial({ color: new THREE.Color(c).convertSRGBToLinear(), roughness: r == null ? 0.6 : r, metalness: m || 0 });
      let food;
      if (id === 'chai' || id === 'lemontea') {
        const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.028, 0.09, 12, 1, true), M(0xc9ccd0, 0.3, 0.8)); glass.position.y = 0.045; g.add(glass);
        food = new THREE.Mesh(new THREE.CircleGeometry(0.033, 12), M(id === 'chai' ? 0x9a6a3a : 0xd8b04a, 0.3)); food.rotation.x = -Math.PI / 2; food.position.y = 0.08; g.add(food);
      } else {
        const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.11, 0.025, 20), M(0xd8dade, 0.25, 0.85)); plate.position.y = 0.012; g.add(plate);
        const col = { maggi: 0xe8c04a, eggmaggi: 0xe8c04a, omelette: 0xf0d060, paratha: 0xc8904a, rajma: 0x7a2e1e }[id] || 0xc8904a;
        const fm = M(id.includes('maggi') ? 0xffffff : col, 0.7);
        if (id.includes('maggi')) fm.map = noodleTex(id === 'eggmaggi');
        food = new THREE.Mesh(id === 'paratha' || id === 'omelette' ? new THREE.CylinderGeometry(0.1, 0.1, 0.012, 16) : new THREE.SphereGeometry(0.085, 14, 6, 0, Math.PI * 2, 0, Math.PI / 2), fm);
        food.scale.y = id === 'paratha' || id === 'omelette' ? 1 : 0.45; food.position.y = 0.026; g.add(food);
        if (id === 'rajma') { const rice = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), M(0xf2efe6, 0.8)); rice.scale.y = 0.5; rice.position.set(0.05, 0.026, 0); g.add(rice); }
        if (id === 'paratha') { const curd = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2), M(0xf4f1ea, 0.5)); curd.position.set(0.07, 0.03, 0.05); g.add(curd); }
      }
      g.userData.food = food; g.visible = false; g.scale.setScalar(1.6);   // a little larger than life so it reads on screen
      ctx.scene.add(g); return g;
    }
    // curly noodles (and egg bits) drawn on a canvas, shared by every Maggi plate
    let noodles = {};
    function noodleTex(egg) {
      if (noodles[egg]) return noodles[egg];
      const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d');
      g.fillStyle = '#d9a63a'; g.fillRect(0, 0, 256, 256);
      for (let i = 0; i < 260; i++) {
        g.strokeStyle = ['#f2cf62', '#e8bb48', '#c99230', '#f7de86'][i % 4]; g.lineWidth = 3 + Math.random() * 2; g.beginPath();
        let x = Math.random() * 256, y = Math.random() * 256; g.moveTo(x, y);
        for (let k = 0; k < 6; k++) { x += (Math.random() - 0.5) * 50; y += (Math.random() - 0.5) * 50; g.quadraticCurveTo(x + (Math.random() - 0.5) * 30, y + (Math.random() - 0.5) * 30, x, y); }
        g.stroke();
      }
      for (let i = 0; i < 40; i++) { g.fillStyle = i % 3 ? '#3f7a2a' : '#c0392b'; g.fillRect(Math.random() * 256, Math.random() * 256, 6, 4); }   // peas, carrot
      if (egg) for (let i = 0; i < 18; i++) { g.fillStyle = i % 2 ? '#fff6dc' : '#f2b72e'; g.beginPath(); g.arc(Math.random() * 256, Math.random() * 256, 9, 0, 6.3); g.fill(); }
      const t = new ctx.THREE.CanvasTexture(c); t.encoding = ctx.THREE.sRGBEncoding; return (noodles[egg] = t);
    }
    // where the shopkeeper hands it over: in front of your seat, or in front of you
    function serveTarget() {
      if (!P) return null;
      if (sit && sit.ry != null) return { x: P.x + Math.sin(sit.ry) * 0.9, z: P.z + Math.cos(sit.ry) * 0.9 };
      return { x: P.x, z: P.z };
    }
    function placeDish(dish, empty) {
      if (!dish) return;
      const H = ctx.H; let x, z, y;
      if (sit && sit.bench) {   // on the bench beside you; turn to it
        const r = sit.ry; x = P.x + Math.cos(r) * 0.45; z = P.z - Math.sin(r) * 0.45; y = (sit.y != null ? sit.y : H(P.x, P.z) + 0.47) + 0.01;
        if (!empty) { P.yaw = Math.atan2(-(x - P.x), -(z - P.z)) * 0.35 + P.yaw * 0.65; P.pitch = -0.55; }
      } else {                  // on the ground in front of you; look down at it
        const fx = -Math.sin(P.yaw), fz = -Math.cos(P.yaw); x = P.x + fx * 0.6; z = P.z + fz * 0.6; y = H(x, z) + 0.02; if (!empty) P.pitch = -0.7;
      }
      dish.position.set(x, y, z); dish.rotation.y = P.yaw; dish.visible = true;
    }
    function receive(o, how) {
      if (!sit) sitDown(findSeat(P));
      placeDish(o.dish); P.tray.push(o);
      ctx.say(how === 'counter' ? `You pick up your ${o.it.name.toLowerCase()} from the counter.` : `"Here you go, ${o.it.name.toLowerCase()}, nice and hot." The shopkeeper sets it down for you.`, 3.5);
      ctx.buzz(1);
    }
    function tickOrders() {
      const cr = ctx.crowd;
      while (orders.length) {
        const o = orders[0];
        if (!cr || !cr.deliver) { o.wait = (o.wait == null ? o.cook : o.wait) - 1 / 60; if (o.wait > 0) return; orders.shift(); receive(o, 'hand'); continue; }
        const ok = cr.deliver(o.stop, { mesh: o.dish, cookSec: o.cook, target: serveTarget,
          onGive: how => { const j = inflight.indexOf(o); if (j >= 0) inflight.splice(j, 1); if (how === 'hand') receive(o, 'hand'); else { const st = o.stop, H = ctx.H, c = st.counter; if (c) o.dish.position.set(c.x, c.y, c.z); else o.dish.position.set(st.spot.x - st.tx * 0.9, H(st.spot.x, st.spot.z) + 1.02, st.spot.z - st.tz * 0.9); o.dish.visible = true; pending.push(o); ctx.toast(`Your ${o.it.name} is ready on the counter at ${st.label}.`); } } });
        if (!ok) return; orders.shift(); o.sent = performance.now(); inflight.push(o);
      }
    }
    function tickPending() {
      for (let i = pending.length - 1; i >= 0; i--) { const o = pending[i]; if (Math.hypot(P.x - o.stop.spot.x, P.z - o.stop.spot.z) < 3) { pending.splice(i, 1); receive(o, 'counter'); } }
    }
    const I = ECON.ITEMS;
    const fx = it => [it.en ? `${it.en > 0 ? '+' : ''}${it.en} energy` : '', it.hyd ? `${it.hyd > 0 ? '+' : ''}${it.hyd} water` : '', it.sips ? `${it.sips} sips` : '', it.warm ? 'warming' : '',
      it.eat >= 4 ? `${it.eat} min, sitting` : ''].filter(Boolean).join(' · ');
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

    /* ---------- start screen: what the chosen bag holds ---------- */
    function renderKit(kg) {
      let el = $('kitList');
      if (!el) { const seg = $('packSeg'); if (!seg) return; el = document.createElement('p'); el.id = 'kitList'; seg.parentNode.appendChild(el); }
      const k = ECON.KITS[kg] || ECON.KITS[12], b = ECON.newBag(kg);
      const food = Object.entries(k.food).map(([id, n]) => `<span>${I[id].icon} ${n} × ${id === 'water' ? '1 L water' : I[id].name}</span>`).join('');
      const gear = k.gear.map(g => `<span>${ECON.GEAR[g].icon} ${ECON.GEAR[g].name}</span>`).join('');
      const en = Object.entries(k.food).reduce((a, [id, n]) => a + (I[id].en || 0) * n, 0);
      el.innerHTML = `<div><b>Free in your ${kg} kg bag (${k.label.toLowerCase()})</b></div>
        <div>Food and water</div><div class="chips">${food}</div>
        <div>Gear</div><div class="chips">${gear}</div>
        <div>About ${ECON.bagWeight(b).toFixed(1)} kg of kit. The food in it gives about +${en} energy; the climb burns well over 100 %, so plan on a meal or snacks at the tea stalls. ${k.note}</div>`;
    }

    const bagList = () => { const ids = Object.keys(bag ? bag.food : {}).filter(id => bag.food[id] > 0); return ids.map(id => `${I[id].name}${bag.food[id] > 1 ? ' ×' + bag.food[id] : ''}`); };

    /* ---------- energy, time, resting, eating ---------- */
    function reset(p, kg) {
      P = p; bag = ECON.newBag(kg); P.water = (bag.food.water || 0) * 5; delete bag.food.water;
      if (ctx.hands) ctx.hands.finish(true);
      for (const o of orders.concat(pending, P.tray || [])) doneDish(o.dish); if (eating) doneDish(eating.dish);
      orders.length = 0; pending.length = 0; inflight.length = 0;
      P.energy = 80; P.gt = 0; P.tray = []; sit = null; eating = null; warn = {}; closePanels();
      $('res').hidden = false;
    }
    const sitting = () => !!sit;
    function speedFactor() {
      if (!P) return 1;
      if (P.energy <= 0.5) return 0.35;
      return P.energy < 25 ? 0.6 + 0.4 * P.energy / 25 : 1;
    }
    function applyFood(it, k) {      // k: share of the item's effect to apply now
      P.energy = clamp(P.energy + (it.en || 0) * k, 0, 100);
      P.hyd = clamp(P.hyd + (it.hyd || 0) * k, 0, 100);
      if (it.warm) P.chaiWarm = Math.max(P.chaiWarm || 0, it.warm);
    }
    // Nothing is eaten without the hands (hands.js): the plate is picked up and eaten forkful by forkful, tea is
    // sipped, snacks come out of the bag. Energy and water arrive bite by bite, as each one reaches the mouth.
    function startEating(it, src, dish) {
      const HN = ctx.hands;
      if (!HN) { applyFood(it, 1); doneDish(dish); return true; }
      if (HN.busy) { ctx.toast('Finish what you are eating first.'); return false; }
      const tea = dish && (it === I.chai || it === I.lemontea);
      const kind = dish ? (tea ? 'sip' : 'eat') : it.icon === '🧃' ? 'drink' : 'snack';
      if (dish && !sit) sitDown(findSeat(P));
      const need = kind === 'eat' ? Math.min(16, Math.max(6, Math.round(it.eat * 2))) : kind === 'sip' ? Math.max(4, Math.round(it.eat * 2)) : kind === 'snack' ? (it.eat > 2 ? 4 : 2) : 1;   // Maggi: 12 forkfuls, chai: 6 sips
      const e = eating = { it, src, dish, need, done: 0, kind };
      HN.start(kind, {
        dish, icon: it.icon, need,
        onBite: n => {
          applyFood(it, 1 / need); e.done = n;
          const f = dish && dish.userData.food;
          if (f) { if (tea) f.position.y = 0.08 - 0.07 * (n / need); else { const k = Math.max(0.06, 1 - n / need); f.scale.x = f.scale.z = k; if (f.scale.y > 0.5) f.scale.y = k; } }
        },
        onDone: () => { if (eating === e) eating = null; ctx.say(`Finished the ${it.name.toLowerCase()}. ${fx({ en: it.en, hyd: it.hyd })}.`, 3); },
        onPutDown: d => { if (d.userData.food) d.userData.food.visible = false; d.scale.setScalar(1.3); placeDish(d, true); setTimeout(() => doneDish(d), 25000); }
      });
      return true;
    }
    function doneDish(d) { if (d) { d.visible = false; if (d.parent) d.parent.remove(d); } }
    function update(dt, keys, load) {
      if (!P) return;
      // seated, holding Shift lets time pass 5x faster (rest and meals in a few seconds)
      const fast = sit && (keys.ShiftLeft || keys.ShiftRight), gdt = dt * TIME * (fast ? 5 : 1); P.gt += gdt;
      tickOrders(); tickPending();
      if (ctx.hands) ctx.hands.update(dt, fast ? 4 : 1);
      if (sit && (keys.KeyW || keys.KeyS || keys.KeyA || keys.KeyD || keys.ArrowUp || keys.ArrowDown)) { if (!eating) standUp(); }
      if (sit) {
        P.energy = clamp(P.energy + ECON.REST.energyPerMin / 60 * gdt, 0, 100);
        P.stamina = clamp(P.stamina + ECON.REST.staminaPerMin / 60 * gdt, 0, 100);
        if (!eating && P.tray.length && !(ctx.hands && ctx.hands.busy)) { const o = P.tray.shift(); setTimeout(() => startEating(o.it, 'tray', o.dish), 900); eating = { it: o.it, pending: true, need: 1, done: 0 }; }
      } else {
        P.energy = clamp(P.energy - ECON.burnPerHour(P.v, P.grade, load) / 3600 * gdt, 0, 100);
        if (P.energy <= 0.5 && P.v > 0.2) P.stamina = Math.max(0, P.stamina - 1.2 * dt);   // running on empty: the body stops you
      }
      const e = P.energy;
      if (e < 25 && !warn.low) { warn.low = true; ctx.buzz(1); const l = bagList();
        ctx.say(l.length ? `Energy is low. In your bag: ${l.join(', ')}. Press I (or tap Bag) to eat.` : 'Energy is low and your bag has no food left. Stop at the next tea stall.', 5.5); }
      if (e < 10 && !warn.vlow) { warn.vlow = true; ctx.buzz(2); ctx.say('You are running on empty. Your legs feel heavy.', 4); }
      if (e <= 0.5 && !warn.zero) { warn.zero = true; ctx.buzz(2); ctx.say('No energy left. Sit and rest (C): ten minutes of rest gives back a fifth of your energy.', 5); }
      if (e > 30) warn.low = warn.vlow = warn.zero = false;
      hudSit();
    }

    /* ---------- seats ---------- */
    function seats() {
      const out = [], cr = ctx.crowd, pl = ctx.places;
      if (cr && cr.seatSpots) for (const s of cr.seatSpots) out.push({ x: s.x, z: s.z, ry: s.ry, h: s.h || 0.45, y: s.y, ref: s });
      if (pl && pl.benches) for (const b of pl.benches) out.push({ x: b.x, z: b.z, ry: b.ry, h: 0.45, y: b.y });
      return out;
    }
    function nearSeat(p, r, takeOver) {
      let best = null, bd = r, busy = null, bb = r;
      for (const s of seats()) {
        const d = Math.hypot(s.x - p.x, s.z - p.z);
        if (s.ref && s.ref.used) { if (d < bb) { bb = d; busy = s; } continue; }
        if (d < bd) { bd = d; best = s; }
      }
      // every seat taken: a hiker sitting there gets up for you (only bots; never the player's own seat)
      if (!best && takeOver && busy && ctx.crowd && ctx.crowd.freeSeat) { ctx.crowd.freeSeat(busy.ref); best = busy; }
      return best;
    }
    const nearShop = p => ctx.stops.some(st => Math.hypot(p.x - st.spot.x, p.z - st.spot.z) < 12);
    // at a stall you sit on its benches or chairs; out on the trail you can sit on the grass
    function findSeat(p) { return nearShop(p) ? nearSeat(p, 9, true) : nearSeat(p, 2.4, false); }
    function sitDown(seat) {
      sit = seat ? { ...seat, bench: true } : { x: P.x, z: P.z, bench: false };
      if (seat) { if (seat.ref) seat.ref.used = true; P.x = seat.x; P.z = seat.z; P.yaw = seat.ry + Math.PI; }
      P.vx = P.vz = 0; P.v = 0;
    }
    // getting up from a bench or chair you step off it: in front of the seat if that is clear (a chair at a table:
    // beside it), never left standing inside the furniture
    function standUp() {
      const s = sit; if (s && s.ref) s.ref.used = false; sit = null;
      if (!s || !s.bench) return;
      const C = ctx.collide, fx = Math.sin(s.ry), fz = Math.cos(s.ry), R = 0.3;
      for (const [a, b] of [[1, 0], [0, 1], [0, -1], [-1, 0]]) {
        const x = s.x + (fx * a + fz * b) * 0.7, z = s.z + (fz * a - fx * b) * 0.7;
        const r = C ? C.resolve(x, z, R) : { x, z };
        if (Math.hypot(r.x - x, r.z - z) < 0.02) { P.x = x; P.z = z; return; }
      }
      if (C) { const r = C.resolve(s.x + fx * 0.7, s.z + fz * 0.7, R); P.x = r.x; P.z = r.z; }
    }
    function toggleSit() {
      if (!P) return;
      if (sit) { if (eating) { ctx.say('Finish eating first.', 2); return; } standUp(); return; }
      const s = findSeat(P);
      if (!s && nearShop(P)) { ctx.say('No free seat at this stall right now.', 2.5); return; }
      sitDown(s);
      ctx.say(s ? (s.h ? 'You take a seat at the stall and catch your breath.' : 'You sit on the bench and catch your breath.') : 'You sit down on the grass by the trail.', 2.5);
    }
    const eyeHeight = () => sit ? (sit.bench ? (sit.y != null ? sit.y - ctx.H(P.x, P.z) + 0.78 : 1.2) : 0.82) : 1.65;
    function hudSit() {
      const h = $('sitHud'), show = !!sit;
      if (h.hidden === show) h.hidden = !show;
      if (!show) return;
      const m = eating ? (eating.pending ? `Picking up the ${eating.it.name.toLowerCase()}` : `${eating.kind === 'sip' ? 'Sipping' : 'Eating'} ${eating.it.name.toLowerCase()} · ${eating.kind === 'sip' ? 'sip' : 'bite'} ${eating.done} of ${eating.need}`) : P.tray.length ? 'About to eat' : inflight.length ? `Your ${inflight[0].it.name.toLowerCase()} is ${performance.now() - inflight[0].sent < inflight[0].cook * 1000 ? 'being made' : 'on its way'}` : orders.length ? `Waiting for your ${orders[0].it.name.toLowerCase()}` : 'Resting: energy and stamina coming back';
      h.textContent = m + ' · hold Shift to let time pass faster' + (eating ? '' : ' · move or C to get up');
    }

    /* ---------- shops ---------- */
    function nearStop(p, r) { let best = null, bd = r; for (const st of ctx.stops) { const d = Math.hypot(p.x - st.spot.x, p.z - st.spot.z); if (d < bd) { bd = d; best = st; } } return best; }
    function prompt(p) {
      if (!P || sit) return '';
      const st = nearStop(p, 3.6); if (st) return '<kbd>E</kbd> Menu · <kbd>C</kbd> Sit';
      if (nearSeat(p, 2.4)) return '<kbd>C</kbd> Sit down';
      return '';
    }
    function openPanel(el) {
      panelOpen = el; el.hidden = false; ctx.setState('panel');
      if (document.pointerLockElement) document.exitPointerLock();
    }
    function closePanels() {
      if (!panelOpen) return; shop.hidden = true; bagP.hidden = true; topP.hidden = true; panelOpen = null;
      if (ctx.getState() === 'panel') ctx.setState('play');
    }
    function openShop(st) {
      lastStop = st;
      const top = st.h > 2780;
      const menu = ECON.menuFor({ top }, st.h);
      $('shopTitle').textContent = st.label;
      const pf = ECON.priceFactor(st.h);
      $('shopSub').textContent = `${Math.round(st.h).toLocaleString('en-IN')} m. ` + (pf > 1.05 ? `Everything is carried up on foot or by mule, so prices here are ${Math.round((pf - 1) * 100)} % above the trailhead.` : 'Trailhead prices.');
      const rows = $('shopRows'); rows.innerHTML = '';
      for (const it of menu) {
        const r = document.createElement('div'); r.className = 'row';
        r.innerHTML = `<span class="ic">${it.icon}</span><span><div class="nm">${it.name}</div><div class="fx">${fx(it)}${it.bag ? ' · goes in your bag' : ''}</div></span><button type="button" class="buy">🪙 ${it.price}</button>`;
        r.querySelector('button').addEventListener('click', () => buy(st, it, r.querySelector('button')));
        rows.appendChild(r);
      }
      syncCoins(); openPanel(shop);
    }
    function buy(st, it, btn) {
      if (!ECON.wallet.spend(it.price, `${it.name} at ${st.label}`)) {
        ctx.toast(`Not enough coins for ${it.name}.`); openTopUp(); return;
      }
      if (ctx.crowd && ctx.crowd.serve) ctx.crowd.serve(st);
      if (it.id === 'water') { P.water += it.sips; ctx.toast('The shopkeeper hands you a 1 L bottle. Into the bag.'); }
      else if (it.bag) { bag.food[it.id] = (bag.food[it.id] || 0) + 1; ctx.toast(`${it.name}: into the bag. Eat it any time (I).`); }
      else {
        orders.push({ stop: st, it: I[it.id], dish: dishMesh(it.id), cook: COOK[it.id] || 10 });
        ctx.toast(`Order placed: ${it.name}. Take a seat (C); the shopkeeper will bring it to you.`);
      }
      btn.textContent = '✓'; setTimeout(() => { btn.textContent = `🪙 ${it.price}`; }, 900);
      syncCoins();
    }

    /* ---------- the bag ---------- */
    function openBag() {
      if (!P) return;
      const rows = $('bagRows'); rows.innerHTML = '';
      const w = ECON.bagWeight({ food: { ...bag.food, water: P.water / 5 }, gear: bag.gear });
      $('bagSub').textContent = `${ECON.KITS[bag.kg] ? ECON.KITS[bag.kg].label : ''} · about ${w.toFixed(1)} kg of kit · energy ${Math.round(P.energy)} % · water ${P.water} sips`;
      const add = (ic, nm, sub, label, fn, dis) => {
        const r = document.createElement('div'); r.className = 'row';
        r.innerHTML = `<span class="ic">${ic}</span><span><div class="nm">${nm}</div><div class="fx">${sub}</div></span>${label ? `<button type="button">${label}</button>` : '<span></span>'}`;
        if (label) { const b = r.querySelector('button'); b.disabled = !!dis; b.addEventListener('click', fn); }
        rows.appendChild(r);
      };
      add('💧', 'Water', `${P.water} sips left · R to drink while walking`, 'Drink', () => { ctx.drink(); openBag(); }, P.water <= 0);
      const ids = Object.keys(bag.food).filter(id => bag.food[id] > 0);
      if (!ids.length) add('🎒', 'No food left', 'Buy something at the next tea stall.', '', null);
      for (const id of ids) {
        const it = I[id];
        add(it.icon, `${it.name} × ${bag.food[id]}`, fx(it), 'Eat', () => {
          if (eating) { ctx.toast('Finish what you are eating first.'); return; }
          bag.food[id]--; closePanels(); if (!startEating(it, 'bag')) bag.food[id]++;
        });
      }
      for (const g of bag.gear) add(ECON.GEAR[g].icon, ECON.GEAR[g].name, `${ECON.GEAR[g].kg} kg`, '', null);
      for (const g of bag.rented) add(ECON.GEAR[g].icon, ECON.GEAR[g].name + ' (rented)', 'for tonight', '', null);
      syncCoins(); openPanel(bagP);
    }
    function syncCoins() { const c = ECON.wallet.coins; $('shopCoins').textContent = c; $('bagCoins').textContent = c; $('resCoins').textContent = c; $('topCoins').textContent = c; }

    /* ---------- coin top-up through the (mock) payment gateway, payments.js ---------- */
    let topFrom = null;
    function openTopUp() {
      const Pay = window.TriundPay;
      topFrom = panelOpen === shop ? lastStop : null;
      shop.hidden = true; bagP.hidden = true;
      const rows = $('topRows'); rows.innerHTML = '';
      for (const pk of ECON.PACKS) {
        const r = document.createElement('div'); r.className = 'row';
        r.innerHTML = `<span class="ic">🪙</span><span><div class="nm">${pk.coins} coins${pk.tag ? ' · ' + pk.tag : ''}</div><div class="fx">₹${pk.inr}</div></span><button type="button" class="buy">Pay ₹${pk.inr}</button>`;
        const btn = r.querySelector('button');
        btn.addEventListener('click', async () => {
          if (!Pay) { ctx.toast('The payment module did not load.'); return; }
          btn.disabled = true; btn.textContent = 'Opening…';
          try {
            const order = await Pay.server.createOrder({ amount: pk.inr * 100, currency: 'INR', receipt: 'coins_' + pk.id + '_' + Date.now(), notes: { pack: pk.id, coins: pk.coins } });
            const co = new Pay.Checkout({
              key: Pay.key, amount: order.amount, currency: order.currency, order_id: order.id,
              name: 'Triund Walk Test', description: `${pk.coins} coins`, theme: { color: '#2f6f5a' },
              prefill: { name: '', email: '', contact: '' },
              handler: async resp => {
                const ok = await Pay.server.verify(resp);
                if (!ok) { ctx.toast('Payment could not be verified. No coins were added.'); return; }
                ECON.wallet.add(pk.coins, `Top-up ₹${pk.inr}`, resp.razorpay_payment_id);
                ctx.buzz(1); ctx.toast(`Payment received: +${pk.coins} coins (${resp.razorpay_payment_id}).`);
                syncCoins(); renderHist();
                if (topFrom) { const st = topFrom; topFrom = null; closePanels(); openShop(st); }
              },
              modal: { ondismiss: () => ctx.toast('Payment cancelled.') }
            });
            co.on('payment.failed', r => ctx.toast('Payment failed: ' + r.error.description));
            co.open();
          } finally { btn.disabled = false; btn.textContent = `Pay ₹${pk.inr}`; }
        });
        rows.appendChild(r);
      }
      renderHist(); syncCoins(); openPanel(topP);
    }
    function renderHist() {
      const h = ECON.wallet.history.slice(0, 5);
      $('topHist').innerHTML = h.length ? 'Recent: ' + h.map(x => `${x.n > 0 ? '+' : ''}${x.n} ${x.why}`).join(' · ') : '';
    }
    $('topClose').addEventListener('click', () => { const st = topFrom; topFrom = null; closePanels(); if (st) openShop(st); else ctx.lock(); });
    topP.addEventListener('click', e => { if (e.target === topP) closePanels(); });
    $('shopClose').addEventListener('click', () => { closePanels(); ctx.lock(); });
    $('bagClose').addEventListener('click', () => { closePanels(); ctx.lock(); });
    $('shopTop').addEventListener('click', () => openTopUp());
    for (const el of [shop, bagP]) el.addEventListener('click', e => { if (e.target === el) closePanels(); });
    window.addEventListener('keydown', e => { if (panelOpen && (e.code === 'Escape' || (e.code === 'KeyI' && panelOpen === bagP))) { closePanels(); e.stopImmediatePropagation(); } }, true);

    function hud() {
      if (!P) return;
      const e = Math.round(P.energy);
      $('resEn').textContent = e + '%'; $('resFill').style.width = e + '%'; $('resBar').classList.toggle('low', e < 25);
      $('resCoins').textContent = ECON.wallet.coins;
      const n = bag ? Object.values(bag.food).reduce((a, b) => a + b, 0) : 0; $('resBagN').textContent = n ? `${n} food` : 'no food';
    }
    $('resBag').addEventListener('click', () => { if (ctx.getState() === 'play' || panelOpen === bagP) { if (panelOpen === bagP) closePanels(); else openBag(); } });
    return {
      TIME, reset, update, openTopUp, onBench: () => !!(sit && sit.bench), seat: () => sit,
      drinkAnim() { if (ctx.hands && !ctx.hands.busy) ctx.hands.start('drink', { icon: '💧', need: 1 }); }, speedFactor, sitting, toggleSit, eyeHeight, prompt, hud, renderKit, syncCoins,
      interact(p) { const st = nearStop(p, 3.6); if (st) { openShop(st); return true; } return false; },
      toggleBag() { if (panelOpen === bagP) closePanels(); else openBag(); },
      qaEat(id) { const d = dishMesh(id); placeDish(d); return startEating(I[id], 'qa', d); },   // QA: eat or sip a served dish here
      closePanels, get panelOpen() { return !!panelOpen; }, get bag() { return bag; }, get lastStop() { return lastStop; }
    };
  }
};
