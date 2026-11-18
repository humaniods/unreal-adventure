'use strict';
/* A night at Triund top.
   A rental stand on the meadow rents a 2-person tent with sleeping bags (600 coins) or a sleeping bag alone
   (150 coins), per 2025-26 rates at the top. Hikers who carried their own tent pitch it free.
   "Sleep" plays the night as a time-lapse: sunset over the Kangra valley, stars and a campfire, dawn on the
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
      <div class="foot"><span class="coins">🪙 <span id="campCoins">0</span> coins</span><span><button type="button" class="btn ghost" id="campClose">Not now</button> <button type="button" class="btn primary" id="campSleep">Pitch the tent and sleep</button></span></div></div>`;
    document.body.appendChild(panel);
    const has = id => { const b = ctx.trek.bag; return !!b && (b.gear.includes(id) || b.rented.includes(id)); };
    function render() {
      $('campCoins').textContent = ECON.wallet.coins;
      $('campSub').textContent = 'The forest department allows a limited number of tents on the meadow. The night drops close to freezing in autumn.';
      const rows = $('campRows'); rows.innerHTML = '';
      const add = (ic, nm, sub, label, fn, dis) => {
        const r = document.createElement('div'); r.className = 'row';
        r.innerHTML = `<span class="ic">${ic}</span><span><div class="nm">${nm}</div><div class="fx">${sub}</div></span>${label ? `<button type="button" class="buy">${label}</button>` : '<span>✓</span>'}`;
        if (label) { const b = r.querySelector('button'); b.disabled = !!dis; b.addEventListener('click', fn); }
        rows.appendChild(r);
      };
      if (has('tent')) add('⛺', 'Tent', has('sbag') ? 'You have a tent and a sleeping bag.' : 'You have a tent.', '', null);
      else add('⛺', 'Rent a 2-person tent with sleeping bags', 'For one night, pitched for you', `🪙 ${RENT.tent}`, () => rent('tent'));
      if (!has('sbag') && has('tent')) add('🛏', 'Rent a sleeping bag', 'Rated to about 0 °C', `🪙 ${RENT.sbag}`, () => rent('sbag'));
      if (!has('sbag') && !has('tent')) add('🛏', 'Sleeping bag', 'Comes with the rented tent', '', null);
      $('campSleep').disabled = !has('tent');
    }
    function rent(what) {
      const price = RENT[what];
      if (!ECON.wallet.spend(price, what === 'tent' ? 'Tent hire at Triund' : 'Sleeping bag hire at Triund')) { ctx.toast('Not enough coins.'); close(); ctx.openTopUp(); return; }
      const b = ctx.trek.bag; if (what === 'tent') { b.rented.push('tent'); if (!b.gear.includes('sbag')) b.rented.push('sbag'); } else b.rented.push('sbag');
      ctx.buzz(1); render(); ctx.trek.syncCoins();
    }
    function open() { render(); panel.hidden = false; ctx.setState('panel'); if (document.pointerLockElement) document.exitPointerLock(); }
    function close() { panel.hidden = true; if (ctx.getState() === 'panel') ctx.setState('play'); }
    $('campClose').addEventListener('click', () => { close(); ctx.lock(); });
    panel.addEventListener('click', e => { if (e.target === panel) close(); });
    window.addEventListener('keydown', e => { if (!panel.hidden && e.code === 'Escape') { close(); e.stopImmediatePropagation(); } }, true);
    $('campSleep').addEventListener('click', () => { close(); startNight(); });

    /* ---------- night: tent, campfire, stars, time-lapse ---------- */
    const stars = (() => {
      const N = 1800, p = new Float32Array(N * 3);
      for (let i = 0; i < N; i++) { const u = Math.random(), v = Math.random() * 0.95, th = u * Math.PI * 2, ph = Math.acos(1 - v); p.set([Math.sin(ph) * Math.cos(th) * 40000, Math.cos(ph) * 40000, Math.sin(ph) * Math.sin(th) * 40000], i * 3); }
      const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(p, 3));
      const m = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xdfe8ff, size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false, fog: false }));
      m.frustumCulled = false; m.renderOrder = -0.5; m.visible = false; scene.add(m); return m;
    })();
    let tent = null, fire = null, night = null;
    function glowTex() {
      const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d');
      const gr = x.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,220,150,1)'); gr.addColorStop(0.3, 'rgba(255,140,40,0.7)'); gr.addColorStop(1, 'rgba(255,90,10,0)');
      x.fillStyle = gr; x.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c);
    }
    function pitch() {
      const P = ctx.P, a = P.yaw + Math.PI * 0.75, tx = P.x - Math.sin(a) * 4, tz = P.z - Math.cos(a) * 4, ty = H(tx, tz);
      if (!tent) {
        const t = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: new THREE.Color(0xf2a93b).convertSRGBToLinear(), roughness: 0.6, side: THREE.DoubleSide }));
        t.scale.set(1.3, 1.1, 1.7); t.castShadow = true; scene.add(t); tent = t;
        const f = new THREE.Group();
        for (let i = 0; i < 5; i++) { const l = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.8, 6), mat(0x4a3324)); l.rotation.set(Math.PI / 2 - 0.5, i * 1.26, 0); l.position.y = 0.15; f.add(l); }
        for (let i = 0; i < 8; i++) { const s = new THREE.Mesh(new THREE.DodecahedronGeometry(0.12, 0), mat(0x6f6a62)); s.position.set(Math.cos(i * 0.785) * 0.55, 0.05, Math.sin(i * 0.785) * 0.55); f.add(s); }
        const gl = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false })); gl.scale.set(1.3, 1.3, 1); gl.position.y = 0.45; f.add(gl); f.userData.glow = gl;
        scene.add(f); fire = f;
      }
      tent.position.set(tx, ty - 0.05, tz); tent.rotation.y = a;
      const fx = P.x - Math.sin(a - 1.1) * 2.6, fz = P.z - Math.cos(a - 1.1) * 2.6; fire.position.set(fx, H(fx, fz), fz); fire.visible = true;
      return { tx, tz, fx, fz };
    }
    function startNight() {
      const P = ctx.P, at = pitch();
      night = { t: 0, at, warm: has('sbag'), start: { gt: Math.max(P.gt, 10.5 * 3600) } };   // the clock shows 17:30 at sunset
      ctx.setState('night'); document.body.classList.add('cinema');
      stars.visible = true;
      ctx.say(night.warm ? 'You pitch the tent, crawl into the sleeping bag, and watch the light go.' : 'You pitch the tent. No sleeping bag: it will be a cold night.', 5);
    }
    // 24 s: sunset (0-8 s), night with stars and the fire (8-17 s), dawn (17-24 s)
    function nightTick(dt, camera) {
      if (!night) return;
      const n = night; n.t += dt; const t = n.t, P = ctx.P;
      let az, el;
      if (t < 8) { az = 115 + t / 8 * 140; el = 12 - t / 8 * 30; }                       // the sun swings west and sets
      else if (t < 17) { az = 255; el = -18 - Math.sin((t - 8) / 9 * Math.PI) * 10; }    // night
      else { const k = (t - 17) / 7; az = 75 + k * 40; el = -18 + k * 30; }                // dawn in the east
      const day = SKY.setSun(az, el); if (ctx.atmos && ctx.atmos.setDaylight) ctx.atmos.setDaylight(day);
      stars.material.opacity = Math.max(0, 1 - day * 1.6) * 0.95;
      if (fire) { const gl = fire.userData.glow, f = 0.85 + 0.15 * Math.sin(t * 17) * Math.sin(t * 7.3); gl.scale.setScalar(1.3 * f); gl.material.opacity = (1 - day) * 0.85 + 0.1; }
      // camera: sitting outside the tent, looking south over the valley at sunset, then up the Dhauladhar at dawn
      const look = t < 12 ? Math.PI : 0, eye = new THREE.Vector3(n.at.fx + 2.6, H(n.at.fx + 2.6, n.at.fz + 2.6) + 1.1, n.at.fz + 2.6);
      camera.position.copy(eye); camera.rotation.set(0.05, look + Math.sin(t * 0.1) * 0.2, 0);
      // game clock: 17:30 sunset to 06:30 next morning
      P.gt = n.start.gt + (t / 24) * 13 * 3600;
      if (t >= 24) endNight();
    }
    function endNight() {
      const P = ctx.P, warm = night.warm; night = null;
      SKY.setSun(115, 12); if (ctx.atmos && ctx.atmos.setDaylight) ctx.atmos.setDaylight(1); stars.visible = false; if (fire) fire.visible = false;
      document.body.classList.remove('cinema');
      P.energy = warm ? 100 : 60; P.stamina = warm ? 100 : 70; P.hyd = Math.max(P.hyd, 70); P.hr = 72;
      ctx.setState('play'); ctx.camped();
      ctx.say(warm ? 'Morning on Triund. The Dhauladhar is lit gold. You slept well: energy and stamina are full.' : 'Morning. You shivered most of the night: energy 60 %. A sleeping bag would have made the difference.', 6);
      ctx.buzz(2);
    }
    const css = document.createElement('style');
    css.textContent = 'body.cinema #watch,body.cinema #prompt,body.cinema #res,body.cinema #cross,body.cinema #sitHud,body.cinema #touch{display:none!important}';
    document.head.appendChild(css);
    return {
      desk,
      prompt(P) { return Math.hypot(P.x - desk.x, P.z - desk.z) < 3.5 ? '<kbd>E</kbd> Tent hire and camping' : ''; },
      interact(P) { if (Math.hypot(P.x - desk.x, P.z - desk.z) < 3.5) { open(); return true; } return false; },
      nightTick, get active() { return !!night; }
    };
  }
};
