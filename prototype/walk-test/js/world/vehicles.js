'use strict';
/* Cars for the Triund walk test: the taxis of McLeod Ganj (white MPVs with yellow commercial number plates, the
   kind that run Main Square - Gallu Devi), a few private cars, and the road they drive on.
   - makeCar(opts): a car built from a real side profile (hood, raked windscreen, long roof, near-vertical tailgate)
     with tinted glass you can see the driver through, pillars, bumpers, lights, mirrors, wheels in dark wheel
     arches, number plates, and a rear door that opens on its hinge
   - roadMesh(line): the road surface draped on the ground along a polyline (asphalt or dirt by OSM surface)
   - Follower: moves a car along a polyline at a speed, wheels turning, front wheels steering, body pitched and
     rolled to the ground under its four wheels
   Interface: window.TriundVehicles.create({THREE, scene, H}) -> { makeCar, roadMesh, follower, line } */
window.TriundVehicles = {
  create(o) {
    const { THREE, scene, H } = o;
    const lin = c => new THREE.Color(c).convertSRGBToLinear();
    const std = (c, r, m) => new THREE.MeshStandardMaterial({ color: lin(c), roughness: r == null ? 0.5 : r, metalness: m || 0 });
    const MAT = {
      glass: new THREE.MeshStandardMaterial({ color: lin(0x1b2228), roughness: 0.08, metalness: 0.6, transparent: true, opacity: 0.62, depthWrite: false }),
      black: std(0x161718, 0.8), trim: std(0x24272a, 0.6), chrome: std(0xc8ccd0, 0.25, 0.9), tyre: std(0x141414, 0.95),
      rim: std(0x9aa0a6, 0.35, 0.8), head: new THREE.MeshStandardMaterial({ color: lin(0xf4f6f8), emissive: lin(0x6b6b5a), roughness: 0.2 }),
      tail: new THREE.MeshStandardMaterial({ color: lin(0xa3121a), emissive: lin(0x3a0204), roughness: 0.3 }), amber: std(0xe08a1a, 0.3),
      inside: std(0x2b2a28, 0.9), seat: std(0x4a4038, 0.85), skin: std(0xa8724e, 0.7)
    };
    const BODY = {};
    const bodyMat = c => { if (!BODY[c]) { BODY[c] = std(c, 0.32, 0.25); BODY[c].side = THREE.DoubleSide; } return BODY[c]; };   // double-sided: from the back seat the doors and roof are there

    // side profile of an MPV (z forward, y up), metres; wheelbase 2.74 m, length 4.4 m, height 1.68 m
    const PROFILE = [[-2.2, 0.3], [2.17, 0.3], [2.24, 0.48], [2.24, 0.66], [2.16, 0.86], [1.32, 1.0], [0.42, 1.6], [0.25, 1.65],
      [-1.86, 1.67], [-2.1, 1.6], [-2.2, 1.05], [-2.25, 0.62], [-2.22, 0.36]];
    const BELT = 1.02;           // window line
    function extrude(pts, width, bevel) {
      const sh = new THREE.Shape(); pts.forEach(([z, y], i) => i ? sh.lineTo(z, y) : sh.moveTo(z, y));
      const g = new THREE.ExtrudeGeometry(sh, { depth: width, bevelEnabled: !!bevel, bevelThickness: bevel || 0, bevelSize: bevel || 0, bevelSegments: 2, curveSegments: 4 });
      g.translate(0, 0, -width / 2); g.rotateY(-Math.PI / 2);   // shape x (length) -> world z (forward)
      g.computeVertexNormals(); return g;
    }
    // the body below the windows, and the glasshouse above it (profile cut at the belt line)
    function cutAt(pts, y0, keepAbove) {
      const out = [];
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i], b = pts[(i + 1) % pts.length], ia = keepAbove ? a[1] >= y0 : a[1] <= y0, ib = keepAbove ? b[1] >= y0 : b[1] <= y0;
        if (ia) out.push(a);
        if (ia !== ib) { const t = (y0 - a[1]) / (b[1] - a[1]); out.push([a[0] + (b[0] - a[0]) * t, y0]); }
      }
      return out;
    }
    const GEO = {
      lower: extrude(cutAt(PROFILE, BELT, false), 1.74, 0.04),
      upper: extrude(cutAt(PROFILE, BELT - 0.02, true), 1.56, 0.03),
      tyre: new THREE.CylinderGeometry(0.33, 0.33, 0.22, 20).rotateZ(Math.PI / 2),
      rim: new THREE.CylinderGeometry(0.2, 0.2, 0.235, 12).rotateZ(Math.PI / 2),
      hub: new THREE.CylinderGeometry(0.06, 0.06, 0.25, 8).rotateZ(Math.PI / 2),
      arch: (() => { const g = new THREE.CircleGeometry(0.42, 16, 0, Math.PI); return g; })()
    };
    const box = (w, h, d, m) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    function plateTex(text, yellow) {
      const c = document.createElement('canvas'); c.width = 256; c.height = 64; const x = c.getContext('2d');
      x.fillStyle = yellow ? '#f2c230' : '#f4f4f0'; x.fillRect(0, 0, 256, 64); x.strokeStyle = '#111'; x.lineWidth = 5; x.strokeRect(3, 3, 250, 58);
      x.fillStyle = '#111'; x.font = '700 40px Rajdhani, Arial, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(text, 128, 34);
      const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; return t;
    }
    function person(shirt) {
      const g = new THREE.Group();
      const torso = box(0.42, 0.5, 0.26, std(shirt, 0.9)); torso.position.y = 0.25; g.add(torso);
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 8), MAT.skin); head.position.y = 0.64; g.add(head);
      const hair = new THREE.Mesh(new THREE.SphereGeometry(0.115, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), MAT.black); hair.position.y = 0.66; g.add(hair);
      return g;
    }
    let plateN = 1200;
    function mergeGroup(grp, keep) {
      grp.updateMatrixWorld(true);
      const inv = new THREE.Matrix4().copy(grp.matrixWorld).invert(), byMat = new Map(), drop = [];
      grp.traverse(m => {
        if (!m.isMesh || m === grp) return;
        for (let q = m; q && q !== grp; q = q.parent) if (keep.has(q)) return;
        let list = byMat.get(m.material); if (!list) byMat.set(m.material, list = []);
        const geo = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
        geo.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld)); list.push(geo); drop.push(m);
      });
      for (const m of drop) m.parent.remove(m);
      for (const [mat, list] of byMat) {
        let n = 0; for (const gg of list) n += gg.attributes.position.count;
        const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2); let o = 0;
        for (const gg of list) {
          pos.set(gg.attributes.position.array, o * 3); if (gg.attributes.normal) nor.set(gg.attributes.normal.array, o * 3);
          if (gg.attributes.uv) uv.set(gg.attributes.uv.array, o * 2); o += gg.attributes.position.count; gg.dispose();
        }
        const mg = new THREE.BufferGeometry(); mg.setAttribute('position', new THREE.BufferAttribute(pos, 3)); mg.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); mg.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
        const mm = new THREE.Mesh(mg, mat); grp.add(mm);
      }
    }
    /* a car: opts { color, taxi (yellow plates, roof sign), driver (a person at the wheel) } */
    function makeCar(opts) {
      opts = opts || {};
      const g = new THREE.Group(), col = opts.color || 0xf2f2ee, bm = bodyMat(col);
      const body = new THREE.Group(); g.add(body);        // pitched and rolled on the slope; the wheels stay on the ground
      const lowerM = new THREE.Mesh(GEO.lower, bm); lowerM.castShadow = true; lowerM.receiveShadow = true; body.add(lowerM);
      const glass = new THREE.Mesh(GEO.upper, MAT.glass); body.add(glass);
      // roof skin and pillars in body colour over the glass
      const roof = box(1.68, 0.06, 2.26, bm); roof.position.set(0, 1.715, -0.8); roof.castShadow = true; body.add(roof);   // over the glass top (1.70 m)
      const roofIn = box(1.5, 0.02, 2.1, MAT.inside); roofIn.position.set(0, 1.64, -0.8); body.add(roofIn);   // headliner, seen from the back seat
      for (const sx of [-1, 1]) {
        const a = box(0.06, 1.08, 0.08, bm); a.position.set(sx * 0.78, 1.3, 0.87); a.rotation.x = -0.983; body.add(a);   // A pillar along the windscreen
        const bp = box(0.05, 0.64, 0.12, MAT.trim); bp.position.set(sx * 0.785, 1.33, -0.25); body.add(bp);              // B pillar (black, as on most)
        const c = box(0.05, 0.64, 0.1, MAT.trim); c.position.set(sx * 0.785, 1.33, -1.22); body.add(c);
        const d = box(0.06, 0.62, 0.22, bm); d.position.set(sx * 0.775, 1.33, -1.98); d.rotation.x = -0.12; body.add(d);    // D pillar
        const sill = box(0.02, 0.03, 3.4, MAT.chrome); sill.position.set(sx * 0.905, BELT - 0.03, -0.25); body.add(sill);  // window line
        const rub = box(0.02, 0.06, 3.6, MAT.trim); rub.position.set(sx * 0.915, 0.6, 0); body.add(rub);               // door rubbing strip
        const mir = box(0.2, 0.12, 0.1, bm); mir.position.set(sx * 0.98, 1.08, 1.0); body.add(mir);
        const mirG = box(0.16, 0.09, 0.012, MAT.black); mirG.position.set(sx * 0.99, 1.08, 0.945); body.add(mirG);
        if (sx < 0) for (const z of [0.6, -0.55]) { const h = box(0.02, 0.03, 0.16, MAT.chrome); h.position.set(sx * 0.915, 0.9, z); body.add(h); }   // door handles
        else { const h = box(0.02, 0.03, 0.16, MAT.chrome); h.position.set(0.915, 0.9, 0.6); body.add(h); }
        // door shut lines
        for (const z of [1.1, 0.0, -1.18]) { const l = box(0.012, 0.62, 0.012, MAT.black); l.position.set(sx * 0.912, 0.66, z); body.add(l); }
      }
      // front: grille, badge, headlamps, bumper, fog lamps; back: tail lamps, bumper, wiper
      const grille = box(1.0, 0.2, 0.04, MAT.trim); grille.position.set(0, 0.74, 2.215); body.add(grille);
      const chromeBar = box(1.02, 0.03, 0.045, MAT.chrome); chromeBar.position.set(0, 0.85, 2.2); body.add(chromeBar);
      for (const sx of [-1, 1]) {
        const hl = box(0.34, 0.14, 0.06, MAT.head); hl.position.set(sx * 0.62, 0.8, 2.18); hl.rotation.y = sx * 0.18; body.add(hl);
        const ind = box(0.1, 0.06, 0.05, MAT.amber); ind.position.set(sx * 0.8, 0.74, 2.14); body.add(ind);
        const tl = box(0.2, 0.32, 0.06, MAT.tail); tl.position.set(sx * 0.7, 1.15, -2.205); body.add(tl);
        const fog = box(0.12, 0.06, 0.04, MAT.head); fog.position.set(sx * 0.62, 0.45, 2.25); body.add(fog);
      }
      const bumpF = box(1.8, 0.2, 0.16, opts.taxi ? bm : MAT.trim); bumpF.position.set(0, 0.42, 2.2); body.add(bumpF);
      const bumpR = box(1.8, 0.2, 0.14, opts.taxi ? bm : MAT.trim); bumpR.position.set(0, 0.48, -2.22); body.add(bumpR);
      const lip = box(1.7, 0.05, 0.1, MAT.black); lip.position.set(0, 0.31, 2.22); body.add(lip);
      const wiper = box(0.05, 0.02, 0.55, MAT.black); wiper.position.set(0, 1.33, -2.15); wiper.rotation.x = -0.12; body.add(wiper);
      // number plates: yellow for taxis (commercial), white for private cars; HP is Himachal
      const pt = plateTex((opts.taxi ? 'HP 68 T ' : 'HP 39 C ') + (plateN++ % 9000 + 1000), !!opts.taxi);
      const plM = new THREE.MeshBasicMaterial({ map: pt });
      const pf = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.125), plM); pf.position.set(0, 0.45, 2.285); body.add(pf);
      const pr = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.125), plM); pr.position.set(0, 0.72, -2.255); pr.rotation.y = Math.PI; body.add(pr);
      if (opts.taxi) {
        const sc = document.createElement('canvas'); sc.width = 256; sc.height = 64; const sx = sc.getContext('2d');
        sx.fillStyle = '#f2c230'; sx.fillRect(0, 0, 256, 64); sx.fillStyle = '#111'; sx.font = '700 46px Rajdhani, Arial, sans-serif'; sx.textAlign = 'center'; sx.textBaseline = 'middle'; sx.fillText('TAXI', 128, 34);
        const st = new THREE.CanvasTexture(sc); st.encoding = THREE.sRGBEncoding;
        const sign = new THREE.Group(); sign.position.set(0, 1.84, -0.3); body.add(sign);
        const sb = box(0.62, 0.17, 0.2, std(0xf2c230, 0.5)); sign.add(sb);
        for (const sz of [1, -1]) { const f = new THREE.Mesh(new THREE.PlaneGeometry(0.58, 0.14), new THREE.MeshBasicMaterial({ map: st })); f.position.z = sz * 0.101; if (sz < 0) f.rotation.y = Math.PI; sign.add(f); }
        // the roof carrier every hill taxi has
        for (const sx2 of [-0.66, 0.66]) { const r = box(0.04, 0.05, 1.8, MAT.black); r.position.set(sx2, 1.775, -0.85); body.add(r); }
      }
      // inside: dashboard, seats; the driver and (when riding) you in the back
      const dash = box(1.5, 0.18, 0.4, MAT.inside); dash.position.set(0, 1.0, 1.05); body.add(dash);
      for (const [x, z] of [[0.38, 0.2], [-0.38, 0.2], [0, -0.75], [0, -1.6]]) { const s = box(x ? 0.55 : 1.45, 0.55, 0.12, MAT.seat); s.position.set(x, 0.95, z - 0.3); body.add(s); const c = box(x ? 0.55 : 1.45, 0.12, 0.5, MAT.seat); c.position.set(x, 0.66, z); body.add(c); }
      const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.025, 6, 16), MAT.black); wheel.position.set(0.38, 1.1, 0.82); wheel.rotation.x = -1.1; body.add(wheel);
      let driver = null;
      if (opts.driver !== false) { driver = person(opts.shirt || 0x3a4a6a); driver.position.set(0.38, 0.7, 0.2); body.add(driver); }
      const rider = person(0x2f5fa8); rider.position.set(-0.4, 0.7, -0.75); rider.visible = false; body.add(rider);
      // the rear left door (the kerb side in India: you get in on the left) opens on its front hinge
      const door = new THREE.Group(); door.position.set(0.925, 0, -0.01); g.userData.doorSide = 1;
      const dPanel = box(0.05, 0.66, 1.16, bm); dPanel.position.set(0.005, 0.66, -0.58); door.add(dPanel);
      const dWin = box(0.03, 0.56, 0.94, MAT.glass); dWin.position.set(-0.01, 1.32, -0.54); door.add(dWin);
      const dFrame = box(0.04, 0.05, 1.0, MAT.trim); dFrame.position.set(0, 1.62, -0.55); door.add(dFrame);
      const dh = box(0.02, 0.03, 0.16, MAT.chrome); dh.position.set(0.03, 0.9, -0.95); door.add(dh);
      const hole = box(0.01, 0.64, 1.12, MAT.inside); hole.position.set(0.915, 0.66, -0.58); body.add(hole);   // the opening behind the door
      body.add(door);
      // wheels in their arches
      const wheels = [];
      for (const [sx, z] of [[-1, 1.37], [1, 1.37], [-1, -1.37], [1, -1.37]]) {
        const piv = new THREE.Group(); piv.position.set(sx * 0.8, 0.33, z); g.add(piv);
        const spin = new THREE.Group(); piv.add(spin);
        const t = new THREE.Mesh(GEO.tyre, MAT.tyre); t.castShadow = true; spin.add(t);
        const r = new THREE.Mesh(GEO.rim, MAT.rim); spin.add(r);
        for (let k = 0; k < 5; k++) { const h2 = new THREE.Group(); h2.rotation.x = k * Math.PI * 2 / 5; const sp = box(0.03, 0.17, 0.045, MAT.chrome); sp.position.set(sx * 0.12, 0.09, 0); h2.add(sp); spin.add(h2); }   // five spokes
        const arch = new THREE.Mesh(GEO.arch, MAT.black); arch.position.set(sx * 0.916, 0.33, z); arch.rotation.y = sx * Math.PI / 2; body.add(arch);
        wheels.push({ piv, spin, front: z > 0 });
      }
      // one draw call per material: merge the fixed parts of the body (not the door, the people or the sign) and of
      // each wheel (a car was ~80 meshes, now ~14)
      mergeGroup(body, new Set([door, driver, rider]));
      for (const w of wheels) mergeGroup(w.spin, new Set());
      body.children.forEach(m => { if (m.isMesh) { m.castShadow = m.material === bm; m.receiveShadow = true; } });   // only the body shell casts the sun shadow
      scene.add(g);
      const car = {
        g, body, wheels, door, driver, rider, doorOpen: 0, taxi: !!opts.taxi,
        // place on the ground at (x, z) heading yaw; body pitched/rolled to the four wheel contact points
        place(x, z, yaw, steer) {
          g.position.set(x, 0, z); g.rotation.y = yaw;
          const c = Math.cos(yaw), s = Math.sin(yaw);
          const at = (lx, lz) => H(x + lx * c + lz * s, z - lx * s + lz * c);
          const fl = at(-0.8, 1.37), fr = at(0.8, 1.37), rl = at(-0.8, -1.37), rr = at(0.8, -1.37);
          const y = (fl + fr + rl + rr) / 4;
          g.position.y = y;
          const pitch = Math.atan2((fl + fr) / 2 - (rl + rr) / 2, 2.74), roll = Math.atan2((fl + rl) / 2 - (fr + rr) / 2, 1.6);
          body.rotation.set(-pitch, 0, -roll);
          for (const w of wheels) { w.piv.position.y = 0.33 + (w.front ? 1 : -1) * Math.sin(pitch) * 1.37 + (w.piv.position.x < 0 ? 1 : -1) * Math.sin(roll) * 0.8; if (w.front) w.piv.rotation.y = steer || 0; }
        },
        roll(dist) { for (const w of wheels) w.spin.rotation.x += dist / 0.33; },
        setDoor(k) { car.doorOpen = k; door.rotation.y = -k * 1.05; }   // the back edge swings out
      };
      return car;
    }

    /* a polyline (local e/n from the data) as a drivable line: point and heading at a distance along it */
    function line(L) {
      const xs = L.e, zs = L.n.map(v => -v), n = xs.length, s = new Float32Array(n);
      for (let i = 1; i < n; i++) s[i] = s[i - 1] + Math.hypot(xs[i] - xs[i - 1], zs[i] - zs[i - 1]);
      const total = s[n - 1];
      function at(d) {
        d = Math.max(0, Math.min(total, d)); let lo = 0, hi = n - 1;
        while (hi - lo > 1) { const m = (lo + hi) >> 1; if (s[m] <= d) lo = m; else hi = m; }
        const t = (d - s[lo]) / Math.max(1e-6, s[hi] - s[lo]);
        return { x: xs[lo] + (xs[hi] - xs[lo]) * t, z: zs[lo] + (zs[hi] - zs[lo]) * t };
      }
      function dir(d, k) { const a = at(d - (k || 3)), b = at(d + (k || 3)), l = Math.hypot(b.x - a.x, b.z - a.z) || 1; return { dx: (b.x - a.x) / l, dz: (b.z - a.z) / l }; }
      function surfAt(d) { let sf = 'asphalt'; for (const [s0, v] of L.surf || []) if (d >= s0) sf = v; return sf; }
      return { total, at, dir, surfAt, xs, zs };
    }

    /* the road surface along a line: a strip draped on the ground, asphalt or dirt by surface */
    function roadTex(kind) {
      const c = document.createElement('canvas'); c.width = 128; c.height = 256; const x = c.getContext('2d');
      const base = kind === 'dirt' ? [120, 100, 78] : kind === 'paving' ? [128, 124, 118] : [74, 74, 76];
      const img = x.createImageData(128, 256);
      for (let i = 0; i < img.data.length; i += 4) {
        const n = (Math.random() - 0.5) * (kind === 'dirt' ? 46 : 26);
        img.data[i] = base[0] + n; img.data[i + 1] = base[1] + n; img.data[i + 2] = base[2] + n; img.data[i + 3] = 255;
      }
      x.putImageData(img, 0, 0);
      if (kind === 'asphalt') {   // worn edges, patches, a faded centre line
        x.fillStyle = 'rgba(40,40,40,0.14)'; for (let k = 0; k < 3; k++) { x.beginPath(); x.ellipse(20 + Math.random() * 88, Math.random() * 256, 8 + Math.random() * 14, 6 + Math.random() * 20, Math.random() * 3, 0, 7); x.fill(); }   // soft patches
        x.fillStyle = 'rgba(230,230,210,0.35)'; for (let y = 0; y < 256; y += 64) x.fillRect(62, y, 4, 32);
        const gr = x.createLinearGradient(0, 0, 128, 0); gr.addColorStop(0, 'rgba(110,96,74,0.85)'); gr.addColorStop(0.1, 'rgba(110,96,74,0)'); gr.addColorStop(0.9, 'rgba(110,96,74,0)'); gr.addColorStop(1, 'rgba(110,96,74,0.85)');
        x.fillStyle = gr; x.fillRect(0, 0, 128, 256);
      } else if (kind === 'dirt') {   // two wheel ruts and loose stones
        x.fillStyle = 'rgba(80,64,48,0.35)'; x.fillRect(24, 0, 18, 256); x.fillRect(86, 0, 18, 256);
        for (let k = 0; k < 120; k++) { const v = 120 + Math.random() * 60; x.fillStyle = `rgb(${v},${v - 8},${v - 18})`; x.beginPath(); x.arc(Math.random() * 128, Math.random() * 256, 1 + Math.random() * 2.5, 0, 7); x.fill(); }
      }
      const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.encoding = THREE.sRGBEncoding; t.anisotropy = 8; return t;
    }
    const RMAT = {};
    const roadMat = k => RMAT[k] || (RMAT[k] = new THREE.MeshStandardMaterial({ map: roadTex(k), roughness: 0.95, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
    function roadMesh(Ln, width, skip) {
      const parts = {};
      const W = width || 4.2, step = 2;
      for (let d = 0; d < Ln.total; d += step) {
        if (skip && skip(Ln.at(d))) continue;
        const sf = Ln.surfAt(d), k = /dirt|gravel|compacted|ground|unpaved/.test(sf) ? 'dirt' : /paving|concrete|sett/.test(sf) ? 'paving' : 'asphalt';
        const P = parts[k] || (parts[k] = { pos: [], uv: [], idx: [] });
        const d2 = Math.min(Ln.total, d + step), a = Ln.at(d), b = Ln.at(d2), da = Ln.dir(d), db = Ln.dir(d2);
        const base = P.pos.length / 3;
        for (const [p, dd, v] of [[a, da, d / 8], [b, db, d2 / 8]])
          for (const side of [-1, 1]) {
            const x = p.x - dd.dz * side * W / 2, z = p.z + dd.dx * side * W / 2;
            P.pos.push(x, H(x, z) + 0.07, z); P.uv.push(side < 0 ? 0 : 1, v);
          }
        P.idx.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);   // facing up
      }
      const out = [];
      for (const k in parts) {
        const P = parts[k], geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(P.pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(P.uv, 2)); geo.setIndex(P.idx); geo.computeVertexNormals();
        const m = new THREE.Mesh(geo, roadMat(k)); m.receiveShadow = true; scene.add(m); out.push(m);
      }
      return out;
    }

    /* drive a car along a line: speed in m/s with gentle acceleration and slowing for bends. off: metres to the
       left of the line (India drives on the left; a parked car stands at the kerb); it eases toward offT as the car
       rolls, so a parked taxi pulls out into the road and pulls in again at the end */
    function follower(car, Ln, opts) {
      opts = opts || {};
      const F = { car, Ln, d: opts.from || 0, v: 0, vmax: opts.vmax || 9, dirSign: opts.reverse ? -1 : 1, end: opts.reverse ? 0 : Ln.total, done: false, yaw: 0, steer: 0,
        off: opts.off || 0, offT: opts.offT == null ? (opts.off || 0) : opts.offT, offEnd: opts.offEnd == null ? null : opts.offEnd };
      const kerb = (p, dd) => ({ x: p.x + dd.dz * F.dirSign * F.off, z: p.z - dd.dx * F.dirSign * F.off });
      F.step = function (dt) {
        const left = Math.abs(F.end - F.d);
        // slow for bends: look 12 m ahead at how much the road turns
        const a = Ln.dir(F.d, 3), b = Ln.dir(F.d + F.dirSign * 12, 3), turn = Math.acos(Math.max(-1, Math.min(1, a.dx * b.dx + a.dz * b.dz)));
        const vBend = Math.max(3.2, F.vmax * (1 - turn * 1.1)), vStop = Math.sqrt(Math.max(0, 2 * 1.6 * (left - 1)));
        const vt = Math.min(F.vmax, vBend, vStop);
        F.v += Math.max(-3.5 * dt, Math.min(1.8 * dt, vt - F.v));
        const mv = F.v * dt; F.d += F.dirSign * mv;
        if (left < 0.4 || (F.v < 0.05 && left < 1.5)) { F.d = F.end; F.v = 0; F.done = true; }
        const want = F.offEnd != null && left < 30 ? F.offEnd : F.offT;
        F.off += (want - F.off) * Math.min(1, mv * 0.18);
        const dd = Ln.dir(F.d, 2.5), p = kerb(Ln.at(F.d), dd), yaw = Math.atan2(dd.dx * F.dirSign, dd.dz * F.dirSign);
        let dy = yaw - F.yaw; while (dy > Math.PI) dy -= 2 * Math.PI; while (dy < -Math.PI) dy += 2 * Math.PI;
        F.yaw = F.yaw + dy * Math.min(1, dt * 8);
        const ah = Ln.dir(F.d + F.dirSign * 4, 2.5), ay = Math.atan2(ah.dx * F.dirSign, ah.dz * F.dirSign); let st = ay - F.yaw; while (st > Math.PI) st -= 2 * Math.PI; while (st < -Math.PI) st += 2 * Math.PI;
        F.steer += (Math.max(-0.55, Math.min(0.55, st * 2.2)) - F.steer) * Math.min(1, dt * 6);
        car.place(p.x, p.z, F.yaw, F.steer); car.roll(mv);
        return F;
      };
      const d0 = Ln.dir(F.d, 2.5), p0 = kerb(Ln.at(F.d), d0); F.yaw = Math.atan2(d0.dx * F.dirSign, d0.dz * F.dirSign);
      car.place(p0.x, p0.z, F.yaw, 0);
      return F;
    }
    // cars more than 300 m from the camera are not drawn
    const ALL = [];
    const _mk = makeCar;
    function makeCarTracked(o2) { const c = _mk(o2); ALL.push(c); return c; }
    function cull(cam) { for (const c of ALL) c.g.visible = (c.g.position.x - cam.x) ** 2 + (c.g.position.z - cam.z) ** 2 < 300 * 300; }
    return { makeCar: makeCarTracked, roadMesh, follower, line, MAT, cull };
  }
};
