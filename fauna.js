'use strict';
/* Animals of the Triund trail (from trip reports; see docs research notes):
   - trail dogs that adopt hikers, run ahead and wait, and hand over at the edge of their territory
   - mule strings with a herder carrying gas cylinders and sacks up to the cafes
   - grey langurs in the forest above Bhagsu falls (and one troop in the lower oak forest)
   - cows and a buffalo grazing on the meadows (Triund top, Karthani)
   - griffon vultures soaring over the ridge, crows around the top
   Simple low-poly rigs with procedural walk cycles; everything beyond ~260 m is hidden.
   World axes: x = east, y = up, z = south. */
window.TriundFauna = {
  build(o) {
    const { THREE, scene, H, trails, player, top, rng, blocked } = o;
    const R = rng(31337);
    const lin = c => new THREE.Color(c).convertSRGBToLinear();
    const matCache = {};
    const mat = c => matCache[c] || (matCache[c] = new THREE.MeshStandardMaterial({ color: lin(c), roughness: 0.95, metalness: 0 }));
    const SPH = new THREE.SphereGeometry(1, 10, 8), CYL = new THREE.CylinderGeometry(1, 1, 1, 7), BOX = new THREE.BoxGeometry(1, 1, 1), CONE = new THREE.ConeGeometry(1, 1, 7);
    const mesh = (g, c, sx, sy, sz, x, y, z) => { const m = new THREE.Mesh(g, mat(c)); m.scale.set(sx, sy, sz); m.position.set(x || 0, y || 0, z || 0); m.castShadow = true; return m; };
    const lerpAng = (a, b, t) => { let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI; if (d < -Math.PI) d += Math.PI * 2; return a + d * t; };

    /* ---------- quadruped rig: body along -z (forward), legs on pivots at the hips/shoulders ---------- */
    function quadruped(p) {
      const g = new THREE.Group(), body = new THREE.Group(); g.add(body);
      const L = p.len, Hh = p.leg, W = p.wid;
      body.add(mesh(SPH, p.col, W / 2, p.depth / 2, L / 2, 0, Hh + p.depth * 0.42, 0));
      if (p.fluff) body.add(mesh(SPH, p.col2 || p.col, W / 2 * 1.12, p.depth / 2 * 0.8, L / 2 * 0.62, 0, Hh + p.depth * 0.6, -L * 0.2));   // ruff
      const neck = new THREE.Group(); neck.position.set(0, Hh + p.depth * 0.62, -L * 0.42); body.add(neck);
      neck.add(mesh(CYL, p.col, p.neckR, p.neckLen, p.neckR, 0, p.neckLen * 0.45, -p.neckLen * 0.25)); neck.children[0].rotation.x = -p.neckTilt;
      const head = new THREE.Group(); head.position.set(0, p.neckLen * 0.85, -p.neckLen * 0.5); neck.add(head);
      head.add(mesh(SPH, p.headCol || p.col, p.head * 0.55, p.head * 0.5, p.head * 0.6));
      head.add(mesh(SPH, p.snoutCol || p.headCol || p.col, p.head * 0.3, p.head * 0.28, p.snout / 2, 0, -p.head * 0.12, -p.head * 0.45 - p.snout * 0.35));
      for (const s of [-1, 1]) {
        const ear = mesh(CONE, p.earCol || p.col, p.ear * 0.35, p.ear, p.ear * 0.15, s * p.head * 0.32, p.head * 0.45, 0.02);
        ear.rotation.z = -s * (p.earDroop || 0.25); head.add(ear);
        if (p.horn) { const h = mesh(CONE, 0xd8cfb8, 0.04, p.horn, 0.04, s * p.head * 0.35, p.head * 0.42, -0.05); h.rotation.z = -s * 1.1; head.add(h); }
      }
      const legs = [];
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        const piv = new THREE.Group(); piv.position.set(sx * W * 0.32, Hh + p.depth * 0.15, sz * L * 0.36); body.add(piv);
        piv.add(mesh(CYL, p.legCol || p.col, p.legR, Hh + p.depth * 0.15, p.legR, 0, -(Hh + p.depth * 0.15) / 2, 0));
        if (p.hoof) piv.add(mesh(CYL, 0x2a2420, p.legR * 1.15, 0.08, p.legR * 1.15, 0, -(Hh + p.depth * 0.15) + 0.04, 0));
        legs.push(piv);
      }
      const tail = new THREE.Group(); tail.position.set(0, Hh + p.depth * 0.7, L * 0.48); body.add(tail);
      const tm = mesh(CYL, p.tailCol || p.col, p.tailR, p.tail, p.tailR * 0.6, 0, p.tail / 2, 0); tail.add(tm);
      tail.rotation.x = p.tailUp != null ? p.tailUp : 0.6;
      scene.add(g);
      return { g, body, legs, neck, head, tail, ph: R() * 6, p };
    }
    // walk cycle (diagonal pairs), sit pose, tail wag, head look
    function animQuad(a, dt, speed, opt) {
      if (a.model) { animModel(a, dt, speed, opt); return; }
      a.ph += dt * (2.2 + speed * 2.4) * (speed > 0.05 ? 1 : 0);
      const sw = Math.min(0.7, speed * 0.32 + (speed > 0.05 ? 0.12 : 0));
      const sit = opt.sit || 0;
      a.legs[0].rotation.x = Math.sin(a.ph) * sw - sit * 0.15; a.legs[3].rotation.x = Math.sin(a.ph) * sw + sit * 1.4;
      a.legs[1].rotation.x = -Math.sin(a.ph) * sw - sit * 0.15; a.legs[2].rotation.x = -Math.sin(a.ph) * sw + sit * 1.4;
      a.body.rotation.x = -sit * 0.42; a.body.position.y = -sit * a.p.leg * 0.45 + Math.abs(Math.sin(a.ph)) * sw * 0.03;
      a.tail.rotation.z = Math.sin(opt.t * (opt.wag || 0)) * 0.5 * (opt.wag ? 1 : 0);
      a.neck.rotation.x = opt.graze ? 0.9 + Math.sin(opt.t * 0.7) * 0.1 : -0.05 + sit * 0.35;
      a.neck.rotation.y = opt.look || 0;
    }

    /* ---------- human (herder) ---------- */
    function human(shirt, cap) {
      const g = new THREE.Group(), limbs = [];
      const limb = (len, r, c, x, y) => { const piv = new THREE.Group(); piv.position.set(x, y, 0); piv.add(mesh(CYL, c, r, len, r, 0, -len / 2, 0)); g.add(piv); limbs.push(piv); return piv; };
      limb(0.86, 0.075, 0x3a3328, -0.1, 0.88); limb(0.86, 0.075, 0x3a3328, 0.1, 0.88);
      g.add(mesh(CYL, shirt, 0.21, 0.66, 0.17, 0, 1.2, 0));
      g.add(mesh(SPH, 0x8a5a3c, 0.12, 0.14, 0.12, 0, 1.68, 0));
      g.add(mesh(CYL, cap, 0.13, 0.1, 0.13, 0, 1.8, 0));
      limb(0.62, 0.055, shirt, -0.26, 1.5); limb(0.62, 0.055, shirt, 0.26, 1.5);
      const stick = mesh(CYL, 0x6b5236, 0.018, 1.4, 0.018, 0.34, 0.75, -0.1); stick.rotation.x = -0.2; g.add(stick);
      scene.add(g); return { g, limbs, ph: 0 };
    }
    function animHuman(h, dt, speed) {
      h.ph += dt * speed * 3.6; const s = Math.sin(h.ph) * Math.min(0.55, speed * 0.5);
      h.limbs[0].rotation.x = s; h.limbs[1].rotation.x = -s; h.limbs[2].rotation.x = -s * 0.8; h.limbs[3].rotation.x = s * 0.8;
    }

    /* ---------- placement helpers ---------- */
    const place = (obj, x, z, yaw) => { obj.position.set(x, H(x, z), z); obj.rotation.y = yaw; };
    // trail point with a lateral offset (right of the walking direction)
    function trailAt(tr, s, lat) { const p = tr.pointAtS(s), d = tr.dirAtS(s, 6); return { x: p.x - d.dz * lat, z: p.z + d.dx * lat, dx: d.dx, dz: d.dz }; }
    const yawOf = (dx, dz) => Math.atan2(-dx, -dz);    // rig faces -z
    const all = [], events = [];   // events: {type:'bark', x, z} for the sound module

    /* ---------- dogs ---------- */
    const DOGCOL = [[0x2b231d, 0x4a3a2c], [0x5a3d26, 0x7a5636], [0x1c1a19, 0x3a3532], [0x6b4a2e, 0x8c6a48], [0x3a2e25, 0x6b5a48]];
    const dogDefs = [['galu', 25, 0, 1900], ['galu', 2640, 1700, 5100], ['shiva', 790, 0, 2300], ['shiva', 3030, 2200, 5000], ['galu', 4990, 4600, 5100]];
    const dogs = dogDefs.map(([tid, s, s0, s1], i) => {
      const tr = trails[tid], c = DOGCOL[i % DOGCOL.length];
      const a = quadruped({ len: 0.78, leg: 0.36, wid: 0.3, depth: 0.32, col: c[0], col2: c[1], fluff: true, neckR: 0.09, neckLen: 0.24, neckTilt: 0.5,
        head: 0.26, snout: 0.16, ear: 0.11, earDroop: i % 2 ? 0.9 : 0.2, legR: 0.045, tail: 0.32, tailR: 0.05, tailUp: 1.0 });
      const h = trailAt(tr, s, 2.2 + i % 2);
      place(a.g, h.x, h.z, R() * 6.28);
      const d = { kind: 'dog', a, tr, home: { s, x: h.x, z: h.z }, s0, s1, state: 'home', s: s, lat: 1.2, v: 0, yaw: a.g.rotation.y, sit: 1, t: R() * 10, wait: 0, lead: 9, patted: 0, bark: 0 };
      all.push(d); return d;
    });
    function dogUpdate(d, dt, P, ACT, time) {
      const a = d.a, g = a.g; d.t += dt; d.bark = Math.max(0, d.bark - dt);
      const dpx = P.x - g.position.x, dpz = P.z - g.position.z, dp = Math.hypot(dpx, dpz);
      let tx = d.home.x, tz = d.home.z, run = 1.4, sitWant = 1;
      const following = dogs.filter(o => o.state === 'follow').length;
      if (d.state === 'home') {
        if (dp < 9 && ACT === d.tr && P.s > d.s0 - 20 && P.s < d.s1 && following < 2) { d.state = 'follow'; d.lead = 7 + R() * 6; events.push({ type: 'bark', x: g.position.x, z: g.position.z }); }
        else if (dp < 35 && R() < dt * 0.04) events.push({ type: 'bark', x: g.position.x, z: g.position.z });
        else { const r = Math.hypot(g.position.x - d.home.x, g.position.z - d.home.z); sitWant = r < 2 ? 1 : 0; if (r < 2) { tx = g.position.x; tz = g.position.z; } }
      }
      if (d.state === 'follow') {
        if (ACT !== d.tr || dp > 70) { d.state = 'home'; }
        else if (P.s > d.s1 || P.s < d.s0 - 40) { d.state = 'edge'; d.edgeS = Math.max(d.s0, Math.min(d.s1, P.s)); events.push({ type: 'bark', x: g.position.x, z: g.position.z }); }
        else {
          // run ahead, sit and wait, run ahead again (the classic Triund dog)
          const dir = sdir;
          const want = Math.max(d.s0, Math.min(d.s1, P.s + d.lead * dir));
          if (d.wait > 0) { d.wait -= dt; sitWant = 1; tx = g.position.x; tz = g.position.z; if (dp < 3.5) d.wait = 0; }
          else {
            const p = trailAt(d.tr, want, d.lat); tx = p.x; tz = p.z; run = 3.4; sitWant = 0;
            if (Math.hypot(tx - g.position.x, tz - g.position.z) < 0.8) { d.wait = 2 + R() * 5; d.lead = 7 + R() * 9; d.lat = (R() < 0.5 ? -1 : 1) * (0.8 + R() * 0.9); }
          }
          if (P.trailD > 12) { tx = P.x + 2; tz = P.z + 2; run = 3.4; sitWant = dp < 3 ? 1 : 0; }
        }
      }
      if (d.state === 'edge') {
        const p = trailAt(d.tr, d.edgeS, d.lat); tx = p.x; tz = p.z; sitWant = 1; run = 2.5;
        if (Math.hypot(tx - g.position.x, tz - g.position.z) > 1) sitWant = 0;
        if (dp > 80) d.state = 'home';
        else if (ACT === d.tr && P.s > d.s0 && P.s < d.s1 && dp < 9) d.state = 'follow';
      }
      // move
      const ex = tx - g.position.x, ez = tz - g.position.z, el = Math.hypot(ex, ez);
      const target = el > 0.3 ? Math.min(run, el * 1.5) : 0;
      d.v += (target - d.v) * Math.min(1, dt * 4);
      if (d.v > 0.05 && el > 0.05) {
        g.position.x += ex / el * d.v * dt; g.position.z += ez / el * d.v * dt;
        d.yaw = lerpAng(d.yaw, yawOf(ex, ez), Math.min(1, dt * 6));
      } else if (dp < 12) d.yaw = lerpAng(d.yaw, yawOf(dpx, dpz), Math.min(1, dt * 2));
      g.rotation.y = d.yaw; g.position.y = H(g.position.x, g.position.z);
      d.sit += ((d.v < 0.15 ? sitWant : 0) - d.sit) * Math.min(1, dt * 3);
      const wag = d.state === 'follow' || d.patted > 0 ? 9 : 3;
      d.patted = Math.max(0, d.patted - dt);
      const look = dp < 8 && d.v < 0.2 ? Math.max(-0.8, Math.min(0.8, lerpAng(0, yawOf(dpx, dpz) - d.yaw, 1))) : 0;
      animQuad(a, dt, d.v, { sit: d.sit, t: time, wag, look });
    }

    /* ---------- mule strings ---------- */
    const mules = [];
    function muleString(tid, s, dir, n) {
      const tr = trails[tid], members = [];
      for (let i = 0; i < n; i++) {
        const c = [0x5b4636, 0x6e5845, 0x4a3b30, 0x7a6a5a][i % 4];
        const a = quadruped({ len: 1.25, leg: 0.72, wid: 0.46, depth: 0.55, col: c, neckR: 0.13, neckLen: 0.55, neckTilt: 0.75, head: 0.36, snout: 0.34,
          ear: 0.24, earDroop: 0.15, legR: 0.06, hoof: true, tail: 0.5, tailR: 0.05, tailUp: 0.2, tailCol: 0x2a2420 });
        // pack saddle + load: sacks, a red LPG cylinder on some
        a.loads = [];
        const addLoad = m => { a.body.add(m); a.loads.push(m); };
        addLoad(mesh(BOX, 0x7a2a22, 0.62, 0.1, 0.7, 0, a.p.leg + 0.62, 0));
        for (const sx of [-1, 1]) {
          if (i % 2 === 0 && sx > 0) { const cyl = mesh(CYL, 0xb8261f, 0.16, 0.7, 0.16, sx * 0.38, a.p.leg + 0.46, 0); addLoad(cyl); }
          else addLoad(mesh(SPH, [0xd9cfb4, 0xc8b88f, 0x8a9a6a][i % 3], 0.2, 0.26, 0.34, sx * 0.4, a.p.leg + 0.48, 0));
        }
        addLoad(mesh(SPH, 0xc9a23a, 0.05, 0.06, 0.05, 0, a.p.leg + 0.3, -0.62));   // bell under the neck
        members.push(a);
      }
      const herder = human(0x6f5a46, 0xb8432f);
      const m = { kind: 'mules', tr, s, dir, members, herder, v: 0.95, pause: 0, bellPh: R() };
      mules.push(m); all.push(m); return m;
    }
    muleString('galu', 900, 1, 4);
    muleString('shiva', 3500, -1, 3);
    function mulesUpdate(m, dt, P, time) {
      // pause when the hiker stands right in front of the lead mule
      const lead = trailAt(m.tr, m.s, 0.9), dp = Math.hypot(P.x - lead.x, P.z - lead.z);
      const blockedBy = dp < 2.2;
      const v = blockedBy ? 0 : m.v;
      m.s += m.dir * v * dt;
      if (m.s > m.tr.total - 25) { m.s = m.tr.total - 25; m.dir = -1; }
      if (m.s < 20) { m.s = 20; m.dir = 1; }
      m.members.forEach((a, i) => {
        const s = m.s - m.dir * (i * 3.0), p = trailAt(m.tr, s, 0.9 * m.dir);
        a.g.position.set(p.x, H(p.x, p.z), p.z); a.g.rotation.y = lerpAng(a.g.rotation.y, yawOf(p.dx * m.dir, p.dz * m.dir), Math.min(1, dt * 4));
        animQuad(a, dt, v, { t: time + i, wag: 1.5, look: Math.sin(time * 0.3 + i) * 0.15 });
      });
      const hs = m.s - m.dir * (m.members.length * 3.0 + 1.0), hp = trailAt(m.tr, hs, 0.6 * m.dir);
      m.herder.g.position.set(hp.x, H(hp.x, hp.z), hp.z); m.herder.g.rotation.y = lerpAng(m.herder.g.rotation.y, yawOf(hp.dx * m.dir, hp.dz * m.dir) + Math.PI, Math.min(1, dt * 4));
      animHuman(m.herder, dt, v);
      m.moving = v > 0.1;
    }

    /* ---------- langurs ---------- */
    function langur() {
      const g = new THREE.Group(), body = new THREE.Group(); g.add(body);
      body.add(mesh(SPH, 0x9d988e, 0.17, 0.27, 0.15, 0, 0.42, 0));          // sitting torso
      body.add(mesh(SPH, 0xc4bfb4, 0.16, 0.14, 0.15, 0, 0.72, -0.02));       // pale head fur
      body.add(mesh(SPH, 0x1a1715, 0.09, 0.1, 0.06, 0, 0.71, -0.13));        // black face
      for (const s of [-1, 1]) {
        const arm = mesh(CYL, 0x8f8a80, 0.035, 0.42, 0.035, s * 0.16, 0.38, -0.08); arm.rotation.x = 0.4; body.add(arm);
        const leg = mesh(CYL, 0x8f8a80, 0.045, 0.34, 0.045, s * 0.12, 0.2, -0.14); leg.rotation.x = 1.3; body.add(leg);
      }
      // long tail hanging down behind the rock / branch it sits on, tip curled forward
      const tail = mesh(CYL, 0x8a857b, 0.022, 0.8, 0.02, 0, -0.05, 0.2); tail.rotation.x = 0.35; body.add(tail);
      const tip = mesh(CYL, 0x8a857b, 0.02, 0.35, 0.018, 0, -0.42, 0.1); tip.rotation.x = -0.6; body.add(tip);
      scene.add(g); return { g, body, ph: R() * 6 };
    }
    const troops = [];
    function troop(tid, s, n) {
      const tr = trails[tid], members = [];
      for (let i = 0; i < n; i++) {
        let x, z, ok = false;
        for (let k = 0; k < 20 && !ok; k++) {
          const side = R() < 0.5 ? -1 : 1, p = trailAt(tr, s + (R() - 0.5) * 50, side * (5 + R() * 16)); x = p.x; z = p.z; ok = !(blocked && blocked(x, z));
        }
        const l = langur(); const sc = i === 0 ? 1.15 : 0.75 + R() * 0.3; l.g.scale.setScalar(sc);
        place(l.g, x, z, R() * 6.28);
        members.push({ l, home: { x, z }, tx: x, tz: z, yaw: l.g.rotation.y, t: R() * 5, v: 0 });
      }
      const t = { kind: 'langurs', members, x: members[0].home.x, z: members[0].home.z }; troops.push(t); all.push(t); return t;
    }
    troop('shiva', 1050, 7);    // forest above Bhagsu falls
    troop('galu', 1350, 5);     // lower oak-deodar forest (less certain)
    function troopUpdate(t, dt, P, time) {
      for (const m of t.members) {
        const g = m.l.g; m.t -= dt;
        const dp = Math.hypot(P.x - g.position.x, P.z - g.position.z);
        if (dp < 5 && m.v === 0) {                         // too close: lope away from the hiker
          const ax = g.position.x - P.x, az = g.position.z - P.z, al = Math.hypot(ax, az) || 1;
          m.tx = g.position.x + ax / al * 7; m.tz = g.position.z + az / al * 7; m.v = 3.2;
        } else if (m.t < 0 && m.v === 0) {
          m.t = 6 + R() * 14;
          if (R() < 0.35) { m.tx = m.home.x + (R() - 0.5) * 10; m.tz = m.home.z + (R() - 0.5) * 10; m.v = 1.2; }
        }
        if (m.v > 0) {
          const ex = m.tx - g.position.x, ez = m.tz - g.position.z, el = Math.hypot(ex, ez);
          if (el < 0.3) m.v = 0;
          else { g.position.x += ex / el * m.v * dt; g.position.z += ez / el * m.v * dt; m.yaw = lerpAng(m.yaw, yawOf(ex, ez), Math.min(1, dt * 8)); }
        }
        g.rotation.y = m.yaw; g.position.y = H(g.position.x, g.position.z) + (m.v > 0 ? Math.abs(Math.sin(time * 9 + m.t)) * 0.12 : 0);
        m.l.body.rotation.x = m.v > 0 ? -0.9 : Math.sin(time * 0.6 + m.t) * 0.05;    // on all fours when moving, upright when sitting
      }
    }

    /* ---------- cattle on the meadows ---------- */
    const herd = [];
    function cow(x, z, buffalo) {
      const a = quadruped({ len: buffalo ? 1.7 : 1.5, leg: 0.62, wid: buffalo ? 0.62 : 0.52, depth: 0.62, col: buffalo ? 0x262422 : [0x8a6a4a, 0xd9cfbf, 0x5b4636][herd.length % 3],
        neckR: 0.16, neckLen: 0.35, neckTilt: 1.0, head: 0.42, snout: 0.22, ear: 0.14, earDroop: 1.2, legR: 0.07, hoof: true, tail: 0.6, tailR: 0.03, tailUp: 0.1, horn: buffalo ? 0.35 : 0.14 });
      place(a.g, x, z, R() * 6.28);
      const c = { a, home: { x, z }, tx: x, tz: z, yaw: a.g.rotation.y, t: R() * 8, v: 0 }; herd.push(c); return c;
    }
    for (let i = 0; i < 4; i++) { const ang = R() * 6.28, r = 50 + R() * 90; const x = top.x + Math.cos(ang) * r, z = top.z + Math.sin(ang) * r; if (!(blocked && blocked(x, z))) cow(x, z, i === 3); }
    { const k = trailAt(trails.shiva, 3060, 18); cow(k.x, k.z, false); const k2 = trailAt(trails.shiva, 3100, -22); cow(k2.x, k2.z, false); }
    all.push({ kind: 'herd' });
    function herdUpdate(dt, P, time) {
      for (const c of herd) {
        const g = c.a.g; c.t -= dt;
        if (c.t < 0) { c.t = 8 + R() * 16; if (R() < 0.5) { c.tx = c.home.x + (R() - 0.5) * 24; c.tz = c.home.z + (R() - 0.5) * 24; } }
        const ex = c.tx - g.position.x, ez = c.tz - g.position.z, el = Math.hypot(ex, ez);
        c.v = el > 0.5 ? 0.45 : 0;
        if (c.v > 0) { g.position.x += ex / el * c.v * dt; g.position.z += ez / el * c.v * dt; c.yaw = lerpAng(c.yaw, yawOf(ex, ez), Math.min(1, dt * 1.5)); }
        g.rotation.y = c.yaw; g.position.y = H(g.position.x, g.position.z);
        animQuad(c.a, dt, c.v, { t: time + c.t, wag: 1.2, graze: c.v === 0 && Math.sin(time * 0.1 + c.t) > -0.3 });
      }
    }

    /* ---------- birds: griffons soaring, crows at the top ---------- */
    function birdGeo(span, chord) {
      const h = span / 2, p = [0, 0, -chord * 0.6, -h, 0, 0, -h * 0.5, 0, chord * 0.35, 0, 0, chord * 0.5, h * 0.5, 0, chord * 0.35, h, 0, 0];
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
      g.setIndex([0, 1, 2, 0, 2, 3, 0, 3, 4, 0, 4, 5]); g.computeVertexNormals(); return g;
    }
    const birds = [];
    const griffonG = birdGeo(2.6, 0.75), crowG = birdGeo(0.9, 0.28);
    const birdMat = c => new THREE.MeshStandardMaterial({ color: lin(c), roughness: 1, side: THREE.DoubleSide });
    function bird(geo, col, cx, cy, cz, rad, speed, flap) {
      const m = new THREE.Mesh(geo, birdMat(col)); m.castShadow = false; scene.add(m);
      const b = { m, cx, cy, cz, rad, w: speed / rad * (R() < 0.5 ? 1 : -1), a: R() * 6.28, flap, ph: R() * 6 }; birds.push(b); return b;
    }
    for (let i = 0; i < 5; i++) bird(griffonG, 0x5a4634, top.x + (R() - 0.5) * 900, H(top.x, top.z) + 260 + R() * 260, top.z - 300 - R() * 900, 120 + R() * 220, 11, false);
    for (let i = 0; i < 4; i++) bird(crowG, 0x141414, top.x + (R() - 0.5) * 60, H(top.x, top.z) + 12 + R() * 15, top.z + (R() - 0.5) * 60, 15 + R() * 20, 8, true);
    function birdsUpdate(dt, time) {
      for (const b of birds) {
        b.a += b.w * dt; const x = b.cx + Math.cos(b.a) * b.rad, z = b.cz + Math.sin(b.a) * b.rad;
        b.m.position.set(x, b.cy + Math.sin(b.a * 0.7) * 6, z);
        b.m.rotation.set(0, -b.a - (b.w > 0 ? 0 : Math.PI), (b.w > 0 ? 1 : -1) * 0.35, 'YXZ');
        if (b.flap) { b.ph += dt * 9; b.m.scale.set(1, 1 + Math.sin(b.ph) * 2.5, 1); b.m.position.y += Math.sin(b.ph) * 0.1; }
      }
    }

    /* ---------- animated models (Quaternius CC0 animal pack) replace the primitive rigs ---------- */
    function modelRig(gltf, targetH, recolor) {
      const root = THREE.SkeletonUtils.clone(gltf.scene);
      root.traverse(n => { if (n.isMesh) { n.castShadow = true; n.receiveShadow = true; if (!n.geometry.boundingSphere) n.geometry.computeBoundingSphere(); if (!n.geometry.userData.padded) { n.geometry.boundingSphere.radius *= 1.4; n.geometry.userData.padded = true; } n.frustumCulled = true; n.material = n.material.clone(); n.material.metalness = 0; n.material.roughness = 0.95; if (recolor) recolor(n.material); } });
      root.updateMatrixWorld(true);
      const bb = new THREE.Box3().setFromObject(root), c = bb.getCenter(new THREE.Vector3());
      let head = null; root.traverse(n => { if (!head && n.isBone && /head/i.test(n.name)) head = n; });
      const hp = head ? new THREE.Vector3().setFromMatrixPosition(head.matrixWorld) : new THREE.Vector3(c.x, c.y, bb.min.z);
      const yaw0 = Math.atan2(hp.x - c.x, hp.z - c.z);
      const sc = targetH / Math.max(1e-6, bb.max.y - bb.min.y);
      const holder = new THREE.Group(), spin = new THREE.Group(); spin.rotation.y = Math.PI - yaw0; spin.add(root);
      root.scale.multiplyScalar(sc); root.position.set(-c.x * sc, -bb.min.y * sc, -c.z * sc);
      holder.add(spin);
      const mixer = new THREE.AnimationMixer(root), actions = {};
      for (const cl of gltf.animations) actions[cl.name] = mixer.clipAction(cl);
      // measured stride speeds (m/s at this size) so hooves and paws do not slide; cached per model and clip
      const nat = name => {
        const c = gltf.animations.find(a => a.name === name); if (!c || !window.TriundAnim) return 0;
        const C = gltf.userData.nat || (gltf.userData.nat = {});
        if (C[name] === undefined) C[name] = window.TriundAnim.clipSpeed(THREE, gltf.scene, c);
        return C[name] * sc;
      };
      return { holder, mixer, actions, cur: null, natWalk: nat('Walk'), natRun: nat('Gallop') };
    }
    function animModel(a, dt, speed, opt) {
      const M = a.model, A = M.actions;
      let n = speed > M.runAt ? 'Gallop' : speed > 0.08 ? 'Walk' : opt.graze && A.Eating ? 'Eating' : opt.sit > 0.5 ? (A.Idle_2_HeadLow ? 'Idle_2_HeadLow' : A.Idle_Headlow ? 'Idle_Headlow' : 'Idle_2') : 'Idle';
      const act = A[n] || A.Idle;
      if (M.cur !== act) { act.reset().play(); if (M.cur) act.crossFadeFrom(M.cur, 0.3, false); M.cur = act; }
      act.timeScale = n === 'Walk' ? Math.min(2.4, Math.max(0.4, speed / M.walkRef)) : n === 'Gallop' ? Math.min(1.8, Math.max(0.6, speed / M.runRef)) : 1;
      if (a.g.visible) M.mixer.update(dt);
    }
    const tint = (m, map) => { const k = Object.keys(map).find(k => m.name === k || m.name.startsWith(k + '.')); if (k) m.color.copy(lin(map[k])); };
    const DOGMODEL = [['husky', { 'Material': 0x1c1a19, 'Material.001': 0x8a6a48, 'Material.006': 0x141210 }], ['shiba', { Main: 0x5a3d26, Main_Light: 0xb08a60 }],
                      ['husky', { 'Material': 0x2b2724, 'Material.001': 0x6b6560 }], ['shiba', { Main: 0x9a7a52, Main_Light: 0xd9c4a0 }], ['husky', { 'Material': 0x3a2e25, 'Material.001': 0xa08060 }]];
    function upgrade(G) {
      dogs.forEach((d, i) => {
        const [kind, cols] = DOGMODEL[i % DOGMODEL.length]; if (!G[kind]) return;
        const r = modelRig(G[kind], 0.62, m => tint(m, cols));
        Object.assign(r, { walkRef: r.natWalk || 1.3, runRef: r.natRun || 4.2, runAt: 2.4 });
        d.a.body.visible = false; d.a.g.add(r.holder); d.a.model = r;
      });
      mules.forEach((ms, j) => ms.members.forEach((a, i) => {
        const kind = j === 0 ? 'donkey' : 'horse'; if (!G[kind]) return;
        const r = modelRig(G[kind], kind === 'donkey' ? 1.45 : 1.6, m => { if (kind === 'donkey' && /^Main$/.test(m.name)) m.color.copy(lin([0x4a3b30, 0x5b4636, 0x6e5845][i % 3])); });
        Object.assign(r, { walkRef: r.natWalk || 1.0, runRef: r.natRun || 3.5, runAt: 3 });
        // loads were placed for the old rig (back at ~1.3 m); the donkey's back is ~0.95 m, the pony's ~1.1 m
        for (const l of a.loads || []) { l.position.y -= kind === 'donkey' ? 0.36 : 0.2; l.scale.multiplyScalar(0.85); r.holder.add(l); }
        a.body.visible = false; a.g.add(r.holder); a.model = r;
      }));
      herd.forEach((c, i) => {
        const buffalo = c.a.p.col === 0x262422, kind = buffalo ? 'bull' : 'cow'; if (!G[kind]) return;
        const r = modelRig(G[kind], buffalo ? 1.55 : 1.5, buffalo ? m => tint(m, { Main: 0x1e1d1c, Main_Light: 0x2a2928 }) : m => tint(m, { Main: [0x8a6a4a, 0xd9cfbf, 0x5b4636, 0x6a5a4a][i % 4] }));
        Object.assign(r, { walkRef: r.natWalk || 0.9, runRef: r.natRun || 3, runAt: 3 });
        c.a.body.visible = false; c.a.g.add(r.holder); c.a.model = r;
      });
    }

    /* ---------- per frame ---------- */
    // which way the hiker is going along the trail (dogs run ahead in that direction)
    let sdir = 1, sdirF = 1, lastS = null;
    const FAR2 = 260 * 260;
    const visible = (g, cam) => { const dx = g.position.x - cam.x, dz = g.position.z - cam.z, v = dx * dx + dz * dz < FAR2; g.visible = v; return v; };
    return {
      counts: { dogs: dogs.length, mules: mules.reduce((n, m) => n + m.members.length, 0), langurs: troops.reduce((n, t) => n + t.members.length, 0), cattle: herd.length, birds: birds.length },
      dogs, mules, troops, birds, events, upgrade,
      update(dt, cam, time, P, ACT) {
        if (lastS !== null && Math.abs(P.s - lastS) > 0.005 && Math.abs(P.s - lastS) < 5) sdirF += (Math.sign(P.s - lastS) - sdirF) * Math.min(1, dt * 0.6);
        lastS = P.s; sdir = sdirF >= 0 ? 1 : -1;
        for (const d of dogs) { dogUpdate(d, dt, P, ACT, time); visible(d.a.g, cam); }
        for (const m of mules) { mulesUpdate(m, dt, P, time); let any = false; for (const a of m.members) any = visible(a.g, cam) || any; visible(m.herder.g, cam); }
        for (const t of troops) for (const m of t.members) if (visible(m.l.g, cam) || Math.hypot(P.x - m.l.g.position.x, P.z - m.l.g.position.z) < 30) troopUpdate({ members: [m] }, dt, P, time);
        for (const c of herd) visible(c.a.g, cam);
        herdUpdate(dt, P, time);
        birdsUpdate(dt, time);
      },
      // E near a dog: give it a scratch
      pat(P) {
        for (const d of dogs) if (Math.hypot(P.x - d.a.g.position.x, P.z - d.a.g.position.z) < 2.6) { d.patted = 3; d.wait = Math.max(d.wait, 2); return true; }
        return false;
      },
      nearDog(P) { return dogs.some(d => Math.hypot(P.x - d.a.g.position.x, P.z - d.a.g.position.z) < 2.6); }
    };
  }
};
