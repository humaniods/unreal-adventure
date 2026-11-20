'use strict';
/* A night at Triund top.
   A rental stand on the meadow rents a 2-person tent with sleeping bags (600 coins) or a sleeping bag alone
   (150 coins), per 2025-26 rates at the top. Hikers who carried their own tent pitch it free.
   Your tent is pitched on the meadow (night.js builds it); walk in and press E to sleep: the night passes as a
   time-lapse seen from the door (the real sun, stars and camp fires of night.js), dawn on the
   Dhauladhar. A sleeping bag means a full night's recovery; without one the cold leaves you at 60 %.
   Player-facing text is English. */
window.TriundCamp = {
  create(ctx) {
    const { THREE, scene, H, SKY, ECON, top } = ctx;
    const $ = id => document.getElementById(id);
    const RENT = { tent: 600, sbag: 150 };

    /* ---------- the rental stand: canvas awning on poles, a table, a sign ---------- */
    // put it on flat ground 30-50 m from the trail end, away from the top's buildings
    let sx = top.x, sz = top.z;
    for (let k = 0; k < 60; k++) {
      const a = k * 2.399, r = 30 + (k % 5) * 5, x = top.x + Math.cos(a) * r, z = top.z + Math.sin(a) * r, y = H(x, z);
      if (Math.abs(H(x + 3, z) - y) > 0.5 || Math.abs(H(x, z + 3) - y) > 0.5) continue;
      if (ctx.blocked && ctx.blocked(x, z)) continue;
      sx = x; sz = z; break;
    }
    const sy = H(sx, sz), face = Math.atan2(top.x - sx, top.z - sz);
    const g = new THREE.Group(); g.position.set(sx, sy, sz); g.rotation.y = face;
    const mat = c => new THREE.MeshStandardMaterial({ color: new THREE.Color(c).convertSRGBToLinear(), roughness: 0.85 });
    const box = (w, h, d, c, x, y, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(c)); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; g.add(m); return m; };
    box(1.8, 0.06, 0.8, 0x7a5a3a, 0, 0.75, 0.6); for (const x of [-0.8, 0.8]) for (const z of [0.3, 0.9]) box(0.06, 0.75, 0.06, 0x5a4330, x, 0.37, z);
    for (const x of [-1.4, 1.4]) for (const z of [-0.4, 1.4]) box(0.07, 2.3, 0.07, 0x6b5236, x, 1.15, z);
    const aw = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 2.2), new THREE.MeshStandardMaterial({ color: new THREE.Color(0xd8732e).convertSRGBToLinear(), roughness: 0.7, side: THREE.DoubleSide }));
    aw.rotation.set(-Math.PI / 2 + 0.12, 0, 0); aw.position.set(0, 2.32, 0.5); aw.castShadow = true; g.add(aw);
    // folded tents and rolled sleeping bags for hire
    for (let i = 0; i < 4; i++) box(0.5, 0.25, 0.3, [0x2f6fd6, 0xf2a93b, 0x2f9a52, 0xd83b30][i], -0.6 + i * 0.4, 0.92, 0.6);
    if (ctx.textPlane) { const s = ctx.textPlane([{ t: 'TENT HIRE', size: 58, w: 700 }, { t: 'Tent + sleeping bags  600', size: 34 }, { t: 'Sleeping bag  150', size: 34 }], 1.8, 0.8, '#1f3b2e', '#f1ead8'); s.position.set(0, 2.85, -0.38); g.add(s); }
    scene.add(g);
    if (ctx.collide) ctx.collide.rect(sx + Math.sin(face) * 0.6, sz + Math.cos(face) * 0.6, face, 2.0, 1.0);
    const desk = { x: sx + Math.sin(face) * 3.2, z: sz + Math.cos(face) * 3.2 };

    /* ---------- panel ---------- */
    const panel = document.createElement('div'); panel.className = 'tpanel'; panel.hidden = true; panel.id = 'campPanel';
    panel.innerHTML = `<div class="box" role="dialog" aria-labelledby="campTitle"><h3 id="campTitle">Triund camp site</h3><div class="sub" id="campSub"></div><div id="campRows"></div>
      <div class="foot"><span class="coins">📱 <span id="campCoins">0</span></span><span><button type="button" class="btn ghost" id="campClose">Not now</button> <button type="button" class="btn primary" id="campSleep">Pitch my tent</button></span></div></div>`;
    document.body.appendChild(panel);
    const has = id => { const b = ctx.trek.bag; return !!b && (b.gear.includes(id) || b.rented.includes(id)); };
    function render() {
      $('campCoins').textContent = `${ECON.wallet.coins} coins`;
      $('campSub').textContent = 'The forest department allows a limited number of tents on the meadow. The night drops close to freezing in autumn.';
      const rows = $('campRows'); rows.innerHTML = '';
      const add = (ic, nm, sub, label, fn, dis) => {
        const r = document.createElement('div'); r.className = 'row';
        r.innerHTML = `<span class="ic">${ic}</span><span><div class="nm">${nm}</div><div class="fx">${sub}</div></span>${label ? `<button type="button" class="buy">${label}</button>` : '<span>✓</span>'}`;
        if (label) { const b = r.querySelector('button'); b.disabled = !!dis; b.addEventListener('click', fn); }
        rows.appendChild(r);
      };
      if (has('tent')) add('⛺', 'Tent', has('sbag') ? 'You have a tent and a sleeping bag.' : 'You have a tent.', '', null);
      else add('⛺', 'Rent a 2-person tent with sleeping bags', 'For one night, pitched for you', `${RENT.tent} coins`, () => rent('tent'));
      if (!has('sbag') && has('tent')) add('🛏', 'Rent a sleeping bag', 'Rated to about 0 °C', `${RENT.sbag} coins`, () => rent('sbag'));
      if (!has('sbag') && !has('tent')) add('🛏', 'Sleeping bag', 'Comes with the rented tent', '', null);
      $('campSleep').disabled = !has('tent'); $('campSleep').textContent = myTent ? 'Your tent is up' : 'Pitch my tent'; if (myTent) $('campSleep').disabled = true;
    }
    function rent(what) {
      const price = RENT[what];
      const why = what === 'tent' ? 'Tent hire at Triund' : 'Sleeping bag hire at Triund';
      const r = ctx.pay ? ctx.pay(price, why) : (ECON.wallet.spend(price, why) ? { ok: true } : { ok: false, msg: 'Not enough coins.', topUp: true });
      if (!r.ok) { ctx.toast(r.msg); close(); if (r.topUp) ctx.openTopUp(); return; }
      const b = ctx.trek.bag; if (what === 'tent') { b.rented.push('tent'); if (!b.gear.includes('sbag')) b.rented.push('sbag'); } else b.rented.push('sbag');
      ctx.buzz(1); render(); ctx.trek.syncCoins();
    }
    function open() { render(); panel.hidden = false; ctx.setState('panel'); if (document.pointerLockElement) document.exitPointerLock(); }
    function close() { panel.hidden = true; if (ctx.getState() === 'panel') ctx.setState('play'); }
    $('campClose').addEventListener('click', () => { close(); ctx.lock(); });
    panel.addEventListener('click', e => { if (e.target === panel) close(); });
    window.addEventListener('keydown', e => { if (!panel.hidden && e.code === 'Escape') { close(); e.stopImmediatePropagation(); } }, true);
    $('campSleep').addEventListener('click', () => { close(); pitchMine(); ctx.lock(); });

    /* ---------- your tent: pitched on the meadow, you walk in, sleep inside ---------- */
    let myTent = null, night = null, wasIn = false;
    // the lantern's light inside your tent (made now at zero, so it never recompiles shaders when it comes on)
    const lanternLight = new THREE.PointLight(new THREE.Color(0xffc27a).convertSRGBToLinear(), 0, 4.5, 1.8); lanternLight.castShadow = false; scene.add(lanternLight);
    const COLS = [0x2f9a52, 0x2f6fd6, 0xf2a93b];
    function pitchMine() {
      if (myTent) return;
      const N = window.TriundNight; if (!N) return;
      // a flat free spot 9-18 m from the stand, clear of other tents, fires and buildings
      let at = null;
      for (let k = 0; k < 80 && !at; k++) {
        const a = k * 2.399 + 0.7, r = 9 + (k % 6) * 1.8, x = desk.x + Math.sin(face + a) * r, z = desk.z + Math.cos(face + a) * r, y = H(x, z);
        if (Math.abs(H(x + 1.3, z) - y) > 0.35 || Math.abs(H(x, z + 1.3) - y) > 0.35 || Math.abs(H(x - 1.3, z) - y) > 0.35 || Math.abs(H(x, z - 1.3) - y) > 0.35) continue;
        if ((ctx.blocked && ctx.blocked(x, z)) || (ctx.night && (ctx.night.tentAt(x, z) || ctx.night.fires.some(f => Math.hypot(f.x - x, f.z - z) < 3)))) continue;
        if (ctx.collide && ctx.collide.inside(x, z)) continue;
        at = { x, z };
      }
      if (!at) at = { x: desk.x + Math.sin(face) * 9, z: desk.z + Math.cos(face) * 9 };
      const ry = Math.atan2(sx - at.x, sz - at.z);           // the door looks toward the stand and the trail
      const t = N.tent(THREE, { color: COLS[(Math.random() * 3) | 0], open: true }); t.position.set(at.x, H(at.x, at.z) - 0.02, at.z); t.rotation.y = ry; scene.add(t);
      const D = t.userData.dims;
      // walls: short segments round the edge, except where the door is (a body can walk in through it)
      if (ctx.collide) for (let i = 0; i < 16; i++) {
        const a0 = i / 16 * Math.PI * 2, a1 = (i + 1) / 16 * Math.PI * 2, am = (a0 + a1) / 2;
        if (Math.sin(am) > 0.8) continue;                    // the door (local +z)
        const pt = a => { const lx = Math.cos(a) * D.A, lz = Math.sin(a) * D.B; return [at.x + lx * Math.cos(ry) + lz * Math.sin(ry), at.z - lx * Math.sin(ry) + lz * Math.cos(ry)]; };
        const p0 = pt(a0), p1 = pt(a1), nx = (p0[0] + p1[0]) / 2 - at.x, nz = (p0[1] + p1[1]) / 2 - at.z, nl = Math.hypot(nx, nz) || 1, w = 0.06;
        ctx.collide.add([[p0[0] - nx / nl * w, p0[1] - nz / nl * w], [p1[0] - nx / nl * w, p1[1] - nz / nl * w], [p1[0] + nx / nl * w, p1[1] + nz / nl * w], [p0[0] + nx / nl * w, p0[1] + nz / nl * w]], true);
      }
      if (ctx.flora && ctx.flora.setHole) ctx.flora.setHole(at.x, at.z, 1.25);
      myTent = { g: t, x: at.x, z: at.z, ry, D }; lanternLight.position.set(at.x, H(at.x, at.z) + D.HH - 0.3, at.z);
      const dir = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'][Math.round(((Math.atan2(at.x - ctx.P.x, -(at.z - ctx.P.z)) * 180 / Math.PI + 360) % 360) / 45) % 8];
      ctx.say(`Your tent is up, ${Math.round(Math.hypot(at.x - ctx.P.x, at.z - ctx.P.z))} m to the ${dir}. Walk in through the door and press E to sleep.`, 6);
    }
    // inside your tent (a little inside the walls)
    function inTent(P) {
      if (!myTent) return false;
      const dx = P.x - myTent.x, dz = P.z - myTent.z, c = Math.cos(myTent.ry), s2 = Math.sin(myTent.ry), lx = dx * c - dz * s2, lz = dx * s2 + dz * c;
      return (lx / (myTent.D.A * 0.95)) ** 2 + (lz / (myTent.D.B * 0.95)) ** 2 < 1;
    }
    const hourOf = gt => { const h = (window.TRIUND_DAY0 || 9) + gt / 3600; return h - Math.floor(h / 24) * 24; };
    function startNight() {
      const P = ctx.P, h = hourOf(P.gt);
      if (h >= 6 && h < 16) { ctx.say('It is the middle of the day. Come back to your tent after sunset to sleep.', 4); return; }
      // sleep until 06:30 tomorrow; the night passes in about 22 seconds, seen from the tent's door
      const toMorning = ((7.2 - h + 24) % 24) * 3600;          // you wake a little after sunrise (06:55)
      night = { t: 0, dur: 22, gt0: P.gt, span: toMorning, warm: has('sbag') };
      ctx.setState('night'); document.body.classList.add('cinema');
      ctx.say(night.warm ? 'You zip up the door, crawl into the sleeping bag and lie looking out at the sky.' : 'No sleeping bag: you lie down in your clothes. It will be a cold night.', 5);
    }
    function nightTick(dt, camera) {
      if (!night) return;
      const n = night, P = ctx.P; n.t += dt;
      if (camera.near !== 0.05) { camera.near = 0.05; camera.updateProjectionMatrix(); }
      const k = Math.min(1, n.t / n.dur), e = k * k * (3 - 2 * k);
      P.gt = n.gt0 + n.span * e;
      const h = hourOf(P.gt), s = ctx.sunAt ? ctx.sunAt(h) : { az: 255, el: -20 };
      const day = SKY.setSun(s.az, s.el); if (ctx.atmos && ctx.atmos.setDaylight) ctx.atmos.setDaylight(day);
      if (myTent && myTent.g.userData.lantern) myTent.g.userData.lantern.material.emissiveIntensity = 0;
      // lying in the tent, looking out of the door and up at the sky
      const t = myTent || { x: P.x, z: P.z, ry: P.yaw };
      const fx = Math.sin(t.ry), fz = Math.cos(t.ry);
      // lying on the mat with your head out of the door, looking up at the sky turning over the camp
      camera.position.set(t.x + fx * 0.95, H(t.x, t.z) + 0.32, t.z + fz * 0.95);
      camera.rotation.set(0, 0, 0); camera.lookAt(t.x + fx * 7, H(t.x, t.z) + 4.2 + Math.sin(n.t * 0.12) * 0.4, t.z + fz * 7);
      if (n.t >= n.dur) endNight();
    }
    function endNight() {
      const P = ctx.P, warm = night.warm; night = null;
      document.body.classList.remove('cinema');
      P.energy = warm ? 100 : 60; P.stamina = warm ? 100 : 70; P.hyd = Math.max(P.hyd, 70); P.hr = 72;
      if (myTent) { P.x = myTent.x + Math.sin(myTent.ry) * 1.6; P.z = myTent.z + Math.cos(myTent.ry) * 1.6; P.y = H(P.x, P.z); P.yaw = Math.atan2(-Math.sin(myTent.ry), -Math.cos(myTent.ry)); P.pitch = 0.05; }   // you crawl out of the door into the morning
      ctx.setState('play'); ctx.camped();
      ctx.say(warm ? 'Morning on Triund. The Dhauladhar is lit gold. You slept well: energy and stamina are full.' : 'Morning. You shivered most of the night: energy 60 %. A sleeping bag would have made the difference.', 6);
      ctx.buzz(2);
    }
    const css = document.createElement('style');
    css.textContent = 'body.cinema #watch,body.cinema #prompt,body.cinema #res,body.cinema #cross,body.cinema #sitHud,body.cinema #touch{display:none!important}';
    document.head.appendChild(css);
    return {
      desk,
      prompt(P) { return inTent(P) ? '<kbd>E</kbd> Sleep until morning' : Math.hypot(P.x - desk.x, P.z - desk.z) < 3.5 ? '<kbd>E</kbd> Tent hire and camping' : ''; },
      interact(P) { if (inTent(P)) { startNight(); return true; } if (Math.hypot(P.x - desk.x, P.z - desk.z) < 3.5) { open(); return true; } return false; },
      inTent, get tent() { return myTent; },
      // the lantern in your tent glows after dark
      tick(dark) { const on = !!myTent && !night && dark > 0.35; if (myTent && myTent.g.userData.lantern) myTent.g.userData.lantern.material.emissiveIntensity = on ? 0.9 : 0; lanternLight.intensity = on ? 0.35 : 0;
        // crawling in, you turn round and sit on your sleeping bag, looking out of the door
        const P = ctx.P, inn = !!P && inTent(P); if (inn && !wasIn && myTent) { P.x = myTent.x - Math.sin(myTent.ry) * 0.25; P.z = myTent.z - Math.cos(myTent.ry) * 0.25; P.yaw = Math.atan2(-Math.sin(myTent.ry), -Math.cos(myTent.ry)); P.pitch = -0.05; P.vx = P.vz = 0; P.moveLock = true; ctx.say('Inside your tent. E to sleep, W to crawl out.', 3.5); } wasIn = inn; },
      nightTick, get active() { return !!night; }, pitchMine
    };
  }
};
