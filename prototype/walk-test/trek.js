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
#sitHud{position:fixed;left:50%;bottom:calc(120px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);z-index:7;background:rgba(8,12,10,.7);border:1px solid var(--line);border-radius:10px;padding:8px 14px;font-size:14px;color:var(--mist);text-align:center}
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
#kitList{font-size:13px;color:var(--muted);line-height:1.5;margin:8px 0 0}
#kitList b{color:var(--mist);font-weight:600}`;
    document.head.appendChild(css);
    const div = (html, id, cls) => { const d = document.createElement('div'); if (id) d.id = id; if (cls) d.className = cls; d.innerHTML = html; document.body.appendChild(d); return d; };
    div(`<div class="chip" title="Food energy"><span>Energy</span><span class="bar" id="resBar"><i id="resFill"></i></span><b id="resEn">80%</b></div>
         <div class="chip" title="Coins"><span>🪙</span><b id="resCoins">0</b></div>`, 'res').hidden = true;
    div('', 'sitHud').hidden = true;
    const shop = div(`<div class="box" role="dialog" aria-labelledby="shopTitle"><h3 id="shopTitle">Menu</h3><div class="sub" id="shopSub"></div><div id="shopRows"></div>
      <div class="foot"><span class="coins">🪙 <span id="shopCoins">0</span> coins</span><span><button type="button" class="btn ghost" id="shopTop">Add coins</button> <button type="button" class="btn primary" id="shopClose">Back to the trail</button></span></div></div>`, 'shop', 'tpanel');
    shop.hidden = true;
    const bagP = div(`<div class="box" role="dialog" aria-labelledby="bagTitle"><h3 id="bagTitle">Your bag</h3><div class="sub" id="bagSub"></div><div id="bagRows"></div>
      <div class="foot"><span class="coins">🪙 <span id="bagCoins">0</span> coins</span><button type="button" class="btn primary" id="bagClose">Close</button></div></div>`, 'bagPanel', 'tpanel');
    bagP.hidden = true;

    let P = null, bag = null, sit = null, eating = null, panelOpen = null, warn = {}, lastStop = null;
    const I = ECON.ITEMS;
    const fx = it => [it.en ? `${it.en > 0 ? '+' : ''}${it.en} energy` : '', it.hyd ? `${it.hyd > 0 ? '+' : ''}${it.hyd} water` : '', it.sips ? `${it.sips} sips` : '', it.warm ? 'warming' : '',
      it.eat >= 4 ? `${it.eat} min, sitting` : ''].filter(Boolean).join(' · ');
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

    /* ---------- start screen: what the chosen bag holds ---------- */
    function renderKit(kg) {
      let el = $('kitList');
      if (!el) { const seg = $('packSeg'); if (!seg) return; el = document.createElement('p'); el.id = 'kitList'; seg.parentNode.appendChild(el); }
      const k = ECON.KITS[kg] || ECON.KITS[12], b = ECON.newBag(kg);
      const food = Object.entries(k.food).map(([id, n]) => `${n} × ${id === 'water' ? '1 L water' : I[id].name}`).join(', ');
      const gear = k.gear.map(g => ECON.GEAR[g].name).join(', ');
      el.innerHTML = `<b>${k.label}, free kit:</b> ${food}. <b>Gear:</b> ${gear}. Kit weighs ${ECON.bagWeight(b).toFixed(1)} kg. ${k.note} The food will not last the whole climb: the tea stalls on the way sell more.`;
    }

    /* ---------- energy, time, resting, eating ---------- */
    function reset(p, kg) {
      P = p; bag = ECON.newBag(kg); P.water = (bag.food.water || 0) * 5; delete bag.food.water;
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
    function startEating(it, src) {
      if ((it.eat || 0) <= 2) { applyFood(it, 1); ctx.say(`${it.name}. ${fx(it)}.`, 3); return; }
      if (!sit) sitDown(null);
      eating = { it, left: it.eat * 60, total: it.eat * 60, src };
    }
    function update(dt, keys, load) {
      if (!P) return;
      // seated, holding Shift lets time pass 5x faster (rest and meals in a few seconds)
      const fast = sit && (keys.ShiftLeft || keys.ShiftRight), gdt = dt * TIME * (fast ? 5 : 1); P.gt += gdt;
      if (sit && (keys.KeyW || keys.KeyS || keys.KeyA || keys.KeyD || keys.ArrowUp || keys.ArrowDown)) { if (!eating) standUp(); }
      if (sit) {
        P.energy = clamp(P.energy + ECON.REST.energyPerMin / 60 * gdt, 0, 100);
        P.stamina = clamp(P.stamina + ECON.REST.staminaPerMin / 60 * gdt, 0, 100);
        if (eating) {
          const k = Math.min(gdt, eating.left) / eating.total; applyFood(eating.it, k); eating.left -= gdt;
          if (eating.left <= 0) { ctx.say(`Finished the ${eating.it.name.toLowerCase()}. ${fx({ en: eating.it.en, hyd: eating.it.hyd })}.`, 3); eating = null; }
        } else if (P.tray.length) startEating(P.tray.shift(), 'tray');
      } else {
        P.energy = clamp(P.energy - ECON.burnPerHour(P.v, P.grade, load) / 3600 * gdt, 0, 100);
        if (P.energy <= 0.5 && P.v > 0.2) P.stamina = Math.max(0, P.stamina - 1.2 * dt);   // running on empty: the body stops you
      }
      const e = P.energy;
      if (e < 25 && !warn.low) { warn.low = true; ctx.buzz(1); ctx.say('Energy is low. Eat something from your bag (I) or stop at a tea stall.', 4.5); }
      if (e < 10 && !warn.vlow) { warn.vlow = true; ctx.buzz(2); ctx.say('You are running on empty. Your legs feel heavy.', 4); }
      if (e <= 0.5 && !warn.zero) { warn.zero = true; ctx.buzz(2); ctx.say('No energy left. Sit and rest (C): ten minutes of rest gives back a fifth of your energy.', 5); }
      if (e > 30) warn.low = warn.vlow = warn.zero = false;
      hudSit();
    }

    /* ---------- seats ---------- */
    function seats() {
      const out = [], cr = ctx.crowd, pl = ctx.places;
      if (cr && cr.seatSpots) for (const s of cr.seatSpots) out.push({ x: s.x, z: s.z, ry: s.ry, h: 0.45, ref: s });
      if (pl && pl.benches) for (const b of pl.benches) out.push({ x: b.x, z: b.z, ry: b.ry, h: 0.45 });
      return out;
    }
    function nearSeat(p, r) {
      let best = null, bd = r;
      for (const s of seats()) { if (s.ref && s.ref.used) continue; const d = Math.hypot(s.x - p.x, s.z - p.z); if (d < bd) { bd = d; best = s; } }
      return best;
    }
    function sitDown(seat) {
      sit = seat ? { ...seat, bench: true } : { x: P.x, z: P.z, bench: false };
      if (seat) { if (seat.ref) seat.ref.used = true; P.x = seat.x; P.z = seat.z; P.yaw = seat.ry + Math.PI; }
      P.vx = P.vz = 0; P.v = 0;
    }
    function standUp() { if (sit && sit.ref) sit.ref.used = false; sit = null; }
    function toggleSit() {
      if (!P) return;
      if (sit) { if (eating) { ctx.say('Finish eating first.', 2); return; } standUp(); return; }
      const s = nearSeat(P, 2.4); sitDown(s);
      ctx.say(s ? 'You sit on the bench and catch your breath.' : 'You sit down on a rock by the trail.', 2.5);
    }
    const eyeHeight = () => sit ? (sit.bench ? 1.15 : 0.85) : 1.65;
    function hudSit() {
      const h = $('sitHud'), show = !!sit;
      if (h.hidden === show) h.hidden = !show;
      if (!show) return;
      const m = eating ? `Eating ${eating.it.name.toLowerCase()} · ${Math.ceil(eating.left / 60)} min left` : P.tray.length ? 'About to eat' : 'Resting: energy and stamina coming back';
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
      if (!panelOpen) return; shop.hidden = true; bagP.hidden = true; panelOpen = null;
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
        ctx.toast(`Not enough coins for ${it.name}.`); if (ctx.onTopUp) ctx.onTopUp(); return;
      }
      if (ctx.crowd && ctx.crowd.serve) ctx.crowd.serve(st);
      if (it.id === 'water') { P.water += it.sips; ctx.toast('The shopkeeper hands you a 1 L bottle. Into the bag.'); }
      else if (it.bag) { bag.food[it.id] = (bag.food[it.id] || 0) + 1; ctx.toast(`${it.name}: into the bag. Eat it any time (I).`); }
      else { P.tray.push(I[it.id]); ctx.toast(`${it.name} is coming. Sit down to eat (C on a bench).`); }
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
          bag.food[id]--; closePanels(); startEating(it, 'bag');
        });
      }
      for (const g of bag.gear) add(ECON.GEAR[g].icon, ECON.GEAR[g].name, `${ECON.GEAR[g].kg} kg`, '', null);
      for (const g of bag.rented) add(ECON.GEAR[g].icon, ECON.GEAR[g].name + ' (rented)', 'for tonight', '', null);
      syncCoins(); openPanel(bagP);
    }
    function syncCoins() { const c = ECON.wallet.coins; $('shopCoins').textContent = c; $('bagCoins').textContent = c; $('resCoins').textContent = c; }
    $('shopClose').addEventListener('click', () => { closePanels(); ctx.lock(); });
    $('bagClose').addEventListener('click', () => { closePanels(); ctx.lock(); });
    $('shopTop').addEventListener('click', () => { if (ctx.onTopUp) ctx.onTopUp(); });
    for (const el of [shop, bagP]) el.addEventListener('click', e => { if (e.target === el) closePanels(); });
    window.addEventListener('keydown', e => { if (panelOpen && (e.code === 'Escape' || (e.code === 'KeyI' && panelOpen === bagP))) { closePanels(); e.stopImmediatePropagation(); } }, true);

    function hud() {
      if (!P) return;
      const e = Math.round(P.energy);
      $('resEn').textContent = e + '%'; $('resFill').style.width = e + '%'; $('resBar').classList.toggle('low', e < 25);
      $('resCoins').textContent = ECON.wallet.coins;
    }
    return {
      TIME, reset, update, speedFactor, sitting, toggleSit, eyeHeight, prompt, hud, renderKit, syncCoins,
      interact(p) { const st = nearStop(p, 3.6); if (st) { openShop(st); return true; } return false; },
      toggleBag() { if (panelOpen === bagP) closePanels(); else openBag(); },
      closePanels, get panelOpen() { return !!panelOpen; }, get bag() { return bag; }, get lastStop() { return lastStop; }
    };
  }
};
