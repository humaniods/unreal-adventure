'use strict';
/* The Bhagsu side of Triund as it is, from walk-video frames (see docs: scratchpad bhagsu_ref) and OSM:
   - Bhagsu Nag temple (OSM 513003894): whitewashed Nagara spire with red bands and red pennants, sanctum faced in
     white tiles; a dark dry-stone retaining wall topped by a white lattice (jali) parapet with teal coping; a
     courtyard of grey stone setts; the red-and-green "1st GORKHA RIFLES" arch with granite steps; an open pavilion
     with red/green banded pillars and a red roof sheltering an orange Hanuman; the spring tank (dark dressed stone,
     three pipe spouts, red tubular railing); a white balustrade along the turquoise pool
   - the Bhagsu Naag Waterfall Pathway (OSM way 41695722): dark slate square tiles with lighter grout, a barbed-wire
     fence on wooden posts, a black water pipe along the verge, and ramshackle stalls (slate dry-stone walls, blue
     tarps, plastic chairs, bottles cooling in a trough of running water)
   - at the falls: the right-bank terrace (slate dry-stone wall) with tea stalls under blue tarps and prayer flags,
     beach umbrellas and a white signboard on the left
   - the slate steps up to Shiva Cafe under strings of prayer flags across the gorge
   - Shiva Cafe: psychedelic Shiva murals, painted boulders by the stream, cushions and low tables on flat rocks
   - Triund top: the orange, cloth-draped Hanuman on a black plinth on a granite boulder at the edge, a yellow
     triangular flag, an iron trishul, a framed picture, prayer flags between two trishuls
   Static parts are merged per material (a few draw calls per place).
   Interface: build(o) -> { counts, temple, hanuman } */
window.TriundBhagsu = {
  build(o) {
    const { THREE, scene, H, trail, marks, collide, textPlane, lin, rng, fall, isStep } = o;
    const R = rng ? rng(7177) : Math.random;
    const counts = {};
    const MAT = {};
    const mat = (c, r) => MAT[c + ':' + (r || 0)] || (MAT[c + ':' + (r || 0)] = new THREE.MeshStandardMaterial({ color: lin(c), roughness: r == null ? 0.85 : r }));
    function canvasTex(w, h, draw, rep) {
      const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
      const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; t.anisotropy = 8; if (rep) { t.wrapS = t.wrapT = THREE.RepeatWrapping; } return t;
    }
    // a frame: origin (ox, oz) at ground y, yaw rot; local +z is "front"
    const frame = (ox, oz, rot, oy) => {
      const c = Math.cos(rot), s = Math.sin(rot), g = new THREE.Group(); g.position.set(ox, oy == null ? H(ox, oz) : oy, oz); g.rotation.y = rot;
      return { g, w: (lx, lz) => ({ x: ox + lx * c + lz * s, z: oz - lx * s + lz * c }) };
    };
    const B = (grp, w, h, d, m, x, y, z, ry) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); if (ry) b.rotation.y = ry; grp.add(b); return b; };
    const Cy = (grp, r0, r1, h, m, x, y, z, seg) => { const c = new THREE.Mesh(new THREE.CylinderGeometry(r0, r1, h, seg || 10), m); c.position.set(x, y, z); grp.add(c); return c; };
    // merge every mesh of a group by material (keeps transparent / textured ones as they are)
    function merge(grp) {
      grp.updateMatrixWorld(true);
      const inv = new THREE.Matrix4().copy(grp.matrixWorld).invert(), by = new Map(), drop = [];
      grp.traverse(m => { if (!m.isMesh || m.userData.keep || m.material.transparent || m.material.map) return; let l = by.get(m.material); if (!l) by.set(m.material, l = []);
        const gg = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone(); gg.deleteAttribute('uv'); gg.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld)); l.push(gg); drop.push(m); });
      for (const m of drop) m.parent.remove(m);
      for (const [mm, l] of by) {
        let n = 0; for (const g of l) n += g.attributes.position.count;
        const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3); let off = 0;
        for (const g of l) { pos.set(g.attributes.position.array, off * 3); nor.set(g.attributes.normal.array, off * 3); off += g.attributes.position.count; g.dispose(); }
        const mg = new THREE.BufferGeometry(); mg.setAttribute('position', new THREE.BufferAttribute(pos, 3)); mg.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
        const me = new THREE.Mesh(mg, mm); me.castShadow = true; me.receiveShadow = true; grp.add(me);
      }
      scene.add(grp); parts.push(grp); return grp;
    }
    const parts = [];   // everything built here, hidden when the camera is more than 500 m away
    // Tibetan prayer flags on a sagging string (blue, white, red, green, yellow)
    const FLAGC = [0x2a63c8, 0xf4f4f0, 0xd8262a, 0x2f9a4a, 0xf2c230].map(c => new THREE.MeshLambertMaterial({ color: lin(c), side: THREE.DoubleSide }));
    const flagGeo = new THREE.PlaneGeometry(0.34, 0.42); flagGeo.translate(0, -0.21, 0);
    const flagGroup = new THREE.Group(); scene.add(flagGroup);
    const wires = [], pipeLines = [];
    function flags(a, b, sag) {
      const L = Math.hypot(b.x - a.x, b.z - a.z), n = Math.max(4, Math.round(L / 0.45)), yaw = Math.atan2(b.x - a.x, b.z - a.z) + Math.PI / 2;
      let prev = null;
      for (let i = 0; i <= n; i++) {
        const t = i / n, x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t, y = a.y + (b.y - a.y) * t - (sag || 1.2) * 4 * t * (1 - t);
        if (prev) wires.push(prev[0], prev[1], prev[2], x, y, z); prev = [x, y, z];
        if (i % 1 === 0 && i < n) { const f = new THREE.Mesh(flagGeo, FLAGC[i % 5]); f.position.set(x, y, z); f.rotation.y = yaw; f.rotation.x = (R() - 0.5) * 0.3; flagGroup.add(f); }
      }
    }
    // a signboard on two posts
    function board(x, z, ry, lines, w, h, bg, fg, y0) {
      const p = textPlane(lines, w, h, bg, fg), y = (y0 == null ? H(x, z) : y0) + 1.2 + h / 2; p.position.set(x, y, z); p.rotation.y = ry; p.userData.keep = true; scene.add(p);
      const pm = mat(0x6b5a44);
      for (const sd of [-1, 1]) { const q = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, y - H(x, z) + h / 2, 8), pm); q.position.set(x + Math.cos(ry) * sd * (w / 2 - 0.1), H(x, z) + (y - H(x, z) + h / 2) / 2, z - Math.sin(ry) * sd * (w / 2 - 0.1)); scene.add(q); }
      if (collide) collide.rect(x, z, ry, w + 0.1, 0.16, false);
      return p;
    }

    /* ---------- textures ---------- */
    const jali = canvasTex(256, 128, (g, w, h) => {   // white lattice with diamond holes and a fan motif
      g.clearRect(0, 0, w, h); g.fillStyle = '#f2f0ea'; g.fillRect(0, 0, w, h);
      g.globalCompositeOperation = 'destination-out';
      for (let y = 8; y < h; y += 16) for (let x = (y / 16 % 2) * 8 + 4; x < w; x += 16) { g.beginPath(); g.moveTo(x, y - 5); g.lineTo(x + 5, y); g.lineTo(x, y + 5); g.lineTo(x - 5, y); g.closePath(); g.fill(); }
      g.globalCompositeOperation = 'source-over'; g.strokeStyle = '#d8d4ca'; g.lineWidth = 3; g.strokeRect(1, 1, w - 2, h - 2);
    }, true);
    const slate = canvasTex(256, 256, (g, w, h) => {   // dark slate squares, light grout
      g.fillStyle = '#6a675f'; g.fillRect(0, 0, w, h);
      for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) { const v = 46 + Math.random() * 22; g.fillStyle = `rgb(${v + 2},${v + 2},${v})`; g.fillRect(x * 64 + 3, y * 64 + 3, 58, 58);
        g.fillStyle = 'rgba(255,255,255,0.05)'; g.fillRect(x * 64 + 6, y * 64 + 6, 20 + Math.random() * 20, 8); }
    }, true);
    const setts = canvasTex(256, 256, (g, w, h) => {   // grey stone setts of a temple courtyard
      g.fillStyle = '#6e6c66'; g.fillRect(0, 0, w, h);
      for (let y = 0; y < 8; y++) for (let x = 0; x < 6; x++) { const v = 120 + Math.random() * 40; g.fillStyle = `rgb(${v},${v},${v - 6})`; g.fillRect(x * 43 + (y % 2) * 21 + 2, y * 32 + 2, 39, 28); }
    }, true);
    const murals = [0, 1, 2].map(k => canvasTex(512, 256, (g, w, h) => {   // Shiva Cafe walls: psychedelic Shiva and swirls
      const gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, ['#2a0e5a', '#08305a', '#3a0a2a'][k]); gr.addColorStop(0.5, ['#0d6e8a', '#5a1a8a', '#0a5a3a'][k]); gr.addColorStop(1, ['#e0602a', '#f2c230', '#d8262a'][k]); g.fillStyle = gr; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 14; i++) { g.strokeStyle = ['#f2c230', '#ff5ab0', '#5af0ff', '#9aff5a'][i % 4]; g.lineWidth = 4; g.beginPath(); const cx = Math.random() * w, cy = Math.random() * h; for (let a = 0; a < 18; a += 0.3) g.lineTo(cx + Math.cos(a) * a * 3, cy + Math.sin(a) * a * 3); g.stroke(); }
      // Shiva: blue face, matted hair with the crescent moon, third eye, trishul and damaru
      const x = w * (k === 1 ? 0.3 : 0.62), y = h * 0.52;
      g.fillStyle = '#2b2a3a'; g.beginPath(); g.ellipse(x, y - 52, 46, 34, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#4a8ad8'; g.beginPath(); g.ellipse(x, y, 40, 52, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#f4f4f0'; g.beginPath(); g.arc(x - 30, y - 70, 10, 0.5, 4); g.fill();
      g.fillStyle = '#111'; for (const sx of [-14, 14]) { g.beginPath(); g.ellipse(x + sx, y - 4, 9, 4, 0, 0, Math.PI * 2); g.fill(); }
      g.strokeStyle = '#f2f0ea'; g.lineWidth = 3; for (const dy of [-26, -20, -14]) { g.beginPath(); g.moveTo(x - 20, y + dy); g.lineTo(x + 20, y + dy); g.stroke(); }
      g.fillStyle = '#d8262a'; g.beginPath(); g.ellipse(x, y - 20, 3, 7, 0, 0, Math.PI * 2); g.fill();
      g.strokeStyle = '#c9c9c9'; g.lineWidth = 5; g.beginPath(); g.moveTo(x + 70, y + 110); g.lineTo(x + 70, y - 70); g.stroke();
      g.beginPath(); g.moveTo(x + 52, y - 50); g.quadraticCurveTo(x + 52, y - 80, x + 70, y - 90); g.quadraticCurveTo(x + 88, y - 80, x + 88, y - 50); g.stroke();
      g.fillStyle = '#f2c230'; g.font = '700 28px Rajdhani, sans-serif'; g.textAlign = 'center'; g.fillText(['OM NAMAH SHIVAYA', 'BOM BHOLE', 'HAR HAR MAHADEV'][k], w * (k === 1 ? 0.72 : 0.25), h - 24);
    }));
    const deityRock = [0, 1, 2, 3].map(k => canvasTex(256, 256, (g, w, h) => {   // painted portraits on the stream boulders
      g.clearRect(0, 0, w, h); const bg = ['#f2c230', '#e0602a', '#2a63c8', '#2f9a4a'][k];
      g.fillStyle = bg; g.beginPath(); g.ellipse(128, 128, 110, 118, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = ['#e0602a', '#f2c230', '#f4d7b0', '#4a8ad8'][k]; g.beginPath(); g.ellipse(128, 120, 46, 56, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#111'; for (const sx of [-16, 16]) { g.beginPath(); g.arc(128 + sx, 112, 5, 0, Math.PI * 2); g.fill(); }
      g.fillStyle = '#d8262a'; g.fillRect(124, 88, 8, 14);
      g.fillStyle = '#fff'; g.font = '700 22px Rajdhani, sans-serif'; g.textAlign = 'center'; g.fillText(['SHREE GANESH', 'JAI MATA DI', 'OM SAI RAM', 'HAR HAR MAHADEV'][k], 128, 222);
    }));

    function hanumanIdol(sc) {   // standing, orange with sindoor, draped in saffron cloth; a mace in the right hand
      const g = new THREE.Group(), sind = new THREE.MeshStandardMaterial({ color: lin(0xe0662a), roughness: 0.55 }), cloth = new THREE.MeshStandardMaterial({ color: lin(0xf08a1a), roughness: 0.9, side: THREE.DoubleSide });
      const leg = new THREE.CylinderGeometry(0.09, 0.08, 0.5, 8);
      for (const sx of [-0.1, 0.1]) { const l = new THREE.Mesh(leg, sind); l.position.set(sx, 0.25, 0); g.add(l); }
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.17, 0.5, 10), sind); body.position.y = 0.75; g.add(body);
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 10), sind); head.position.y = 1.12; g.add(head);
      const muzzle = new THREE.Mesh(new THREE.SphereGeometry(0.08, 10, 8), sind); muzzle.position.set(0, 1.07, 0.1); g.add(muzzle);
      const crown = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.18, 8), new THREE.MeshStandardMaterial({ color: lin(0xc9a23a), roughness: 0.3, metalness: 0.6 })); crown.position.y = 1.3; g.add(crown);
      const drape = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.34, 0.8, 12, 1, true, -2.2, 4.4), cloth); drape.position.y = 0.72; drape.rotation.y = Math.PI; g.add(drape);
      const mace = new THREE.Group(), gold = new THREE.MeshStandardMaterial({ color: lin(0xc9a23a), roughness: 0.35, metalness: 0.6 });
      const h1 = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.6, 6), gold); h1.position.y = 0.3; mace.add(h1);
      const h2 = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), gold); h2.position.y = 0.62; mace.add(h2);
      mace.position.set(0.26, 0.6, 0.05); mace.rotation.z = -0.25; g.add(mace);
      g.scale.setScalar(sc || 1); g.traverse(m => { if (m.isMesh) { m.castShadow = true; m.userData.keep = true; } });
      return g;
    }
    /* ---------- Bhagsu Nag temple ---------- */
    const T0 = marks.bhagsuTemple, tx = T0.e, tz = -T0.n;
    const s0 = trail.pointAtS(0), tRot = Math.atan2(s0.x - tx, s0.z - tz);   // the complex faces the start of the pathway
    let temple = null;
    {
      // the courtyard is level, cut into the slope: at the highest ground under it
      let gy = -Infinity; for (let a = 0; a < 8; a++) gy = Math.max(gy, H(tx + Math.cos(a * 0.785) * 7, tz + Math.sin(a * 0.785) * 7));
      const F = frame(tx, tz, tRot, gy), g = F.g;
      const white = mat(0xf1efe8, 0.6), red = mat(0xb3261e, 0.6), stone = mat(0x55524c), teal = mat(0x2f8a86, 0.6), green = mat(0x2f7a4a, 0.6), orange = mat(0xe0602a, 0.6), granite = mat(0x8f8b84);
      // courtyard slab of stone setts (textured: not merged), deep so it meets the falling ground
      const yard = new THREE.Mesh(new THREE.BoxGeometry(16, 3, 13), new THREE.MeshStandardMaterial({ map: setts, roughness: 0.9 }));
      setts.repeat.set(4, 3); yard.position.set(0, -1.45, 0); yard.receiveShadow = true; g.add(yard);
      // sanctum: white tiles, red bands; Nagara spire above (curving square tower) with a gilt kalash; red pennants
      B(g, 4.4, 3.2, 4.4, white, 0, 1.6, -2.5); B(g, 4.6, 0.25, 4.6, red, 0, 3.25, -2.5); B(g, 4.5, 0.18, 4.5, red, 0, 1.0, -2.5);
      B(g, 1.3, 2.1, 0.08, mat(0x5a2a1a), 0, 1.05, -0.28);
      const prof = []; for (let i = 0; i <= 12; i++) { const t = i / 12; prof.push(new THREE.Vector2(2.6 * Math.pow(1 - t, 0.55) * (1 - 0.06 * Math.sin(t * Math.PI * 6)), 3.35 + t * 8.2)); }
      const spire = new THREE.Mesh(new THREE.LatheGeometry(prof, 4), white); spire.rotation.y = Math.PI / 4; spire.position.set(0, 0, -2.5); g.add(spire);
      for (const yb of [5.0, 7.4]) { const r = 2.6 * Math.pow(1 - (yb - 3.35) / 8.2, 0.55); const ring = new THREE.Mesh(new THREE.CylinderGeometry(r + 0.06, r + 0.08, 0.22, 4), red); ring.rotation.y = Math.PI / 4; ring.position.set(0, yb, -2.5); g.add(ring); }
      Cy(g, 0.32, 0.38, 0.4, mat(0xc9a23a, 0.3), 0, 11.7, -2.5); Cy(g, 0.05, 0.2, 0.6, mat(0xc9a23a, 0.3), 0, 12.2, -2.5);
      for (const [px, pz] of [[-2.8, -0.2], [2.9, -4.6]]) {
        Cy(g, 0.04, 0.05, 5, mat(0x8a8a8a, 0.4), px, 2.5, pz);
        const fg = new THREE.BufferGeometry(); fg.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0.9, -0.25, 0, 0, -0.55, 0], 3)); fg.computeVertexNormals();
        const fl = new THREE.Mesh(fg, new THREE.MeshLambertMaterial({ color: lin(0xc0281e), side: THREE.DoubleSide })); fl.position.set(px, 5, pz); fl.userData.keep = true; g.add(fl);
      }
      // retaining wall along the front with the white jali parapet and teal coping
      B(g, 16, 1.4, 0.6, stone, 0, -0.7 + 0.7, 6.5);
      const jm = new THREE.MeshStandardMaterial({ map: jali, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.7 }); jali.repeat.set(6, 1);
      const jp = new THREE.Mesh(new THREE.PlaneGeometry(16, 1.0), jm); jp.position.set(0, 1.9, 6.5); g.add(jp);
      B(g, 16.2, 0.12, 0.5, teal, 0, 2.46, 6.5);
      for (let x = -8; x <= 8; x += 4) B(g, 0.35, 1.1, 0.4, white, x, 1.95, 6.5);
      // the Gorkha arch at the entrance (red piers with white khukri marks, green lintel) and granite steps down
      const ax = 5.5;
      for (const sd of [-1, 1]) { B(g, 0.7, 3.4, 0.7, red, ax + sd * 1.7, 1.7, 7.2); B(g, 0.5, 0.06, 0.02, white, ax + sd * 1.7, 2.4, 7.56); }
      B(g, 4.2, 0.7, 0.8, green, ax, 3.6, 7.2);
      const arch = textPlane([{ t: '1st GORKHA RIFLES', size: 64, w: 700 }], 3.6, 0.5, '#2f7a4a', '#f2f0ea'); arch.position.set(ax, 3.6, 7.62); arch.userData.keep = true; g.add(arch);
      for (let k = 0; k < 5; k++) B(g, 2.8, 0.22, 0.45, granite, ax, -0.11 - k * 0.22, 7.0 + 0.45 * (k + 1));
      const shoes = textPlane([{ t: 'PLEASE TAKE OFF', size: 44, w: 700 }, { t: 'YOUR SHOES HERE', size: 44, w: 700 }], 1.2, 0.5, '#f2f0ea', '#7a1f1f'); shoes.position.set(ax - 2.4, 1.6, 6.84); shoes.userData.keep = true; g.add(shoes);
      const name = textPlane([{ t: 'BHAGSU NAG TEMPLE', size: 56, w: 700 }, { t: 'Shiva · Nag Devta', size: 34 }], 2.6, 0.8, '#7a1f1f', '#f2d27a'); name.position.set(-3.5, 2.95, 6.8); name.userData.keep = true; g.add(name);
      // the Hanuman pavilion: four banded pillars, red pyramid roof, the orange idol on a plinth with a bench
      const hp = { x: -5.2, z: 1.2 };
      for (const [dx, dz] of [[-1.4, -1.4], [1.4, -1.4], [-1.4, 1.4], [1.4, 1.4]]) for (let k = 0; k < 6; k++) B(g, 0.28, 0.45, 0.28, k % 2 ? green : red, hp.x + dx, 0.225 + k * 0.45, hp.z + dz);
      const roof = new THREE.Mesh(new THREE.ConeGeometry(2.6, 1.3, 4), red); roof.rotation.y = Math.PI / 4; roof.position.set(hp.x, 3.4, hp.z); g.add(roof);
      B(g, 0.9, 0.6, 0.7, white, hp.x, 0.3, hp.z - 0.6);
      const idol = hanumanIdol(0.9); idol.position.set(hp.x, 0.6, hp.z - 0.6); g.add(idol);
      B(g, 2.0, 0.08, 0.4, mat(0x7a5a3a), hp.x, 0.45, hp.z + 1.0);
      // the spring tank: dark dressed stone, three pipe spouts in the back wall, red tubular railing
      const kd = { x: 4.6, z: 1.2 };
      for (const [w, d, x, z] of [[5, 0.4, 0, -1.8], [5, 0.4, 0, 1.8], [0.4, 3.6, -2.5, 0], [0.4, 3.6, 2.5, 0]]) B(g, w, 0.8, d, mat(0x3a3936), kd.x + x, 0.4, kd.z + z);
      B(g, 5, 1.8, 0.5, mat(0x3a3936), kd.x, 0.9, kd.z - 2.2);
      const water = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 3.2), new THREE.MeshLambertMaterial({ color: lin(0x5fa8a0), transparent: true, opacity: 0.85 })); water.rotation.x = -Math.PI / 2; water.position.set(kd.x, 0.55, kd.z); water.userData.keep = true; g.add(water);
      for (const px of [-1.2, 0, 1.2]) {
        const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.6, 8), mat(0x8a8a8a, 0.4)); pipe.rotation.x = Math.PI / 2; pipe.position.set(kd.x + px, 1.3, kd.z - 1.75); g.add(pipe);
        const jet = new THREE.Mesh(new THREE.PlaneGeometry(0.14, 0.8), new THREE.MeshBasicMaterial({ color: lin(0xe8f2f2), transparent: true, opacity: 0.7, side: THREE.DoubleSide })); jet.position.set(kd.x + px, 0.95, kd.z - 1.42); jet.rotation.x = 0.25; jet.userData.keep = true; g.add(jet);
      }
      for (const [x1, z1, x2, z2] of [[-2.6, 1.95, 2.6, 1.95], [-2.6, -1.6, -2.6, 1.95], [2.6, -1.6, 2.6, 1.95]]) {
        const L = Math.hypot(x2 - x1, z2 - z1), rail = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, L, 8), red); rail.rotation.z = Math.PI / 2; rail.rotation.y = Math.atan2(-(z2 - z1), x2 - x1);
        rail.position.set(kd.x + (x1 + x2) / 2, 1.75, kd.z + (z1 + z2) / 2); g.add(rail);
        for (let t = 0; t <= 1.001; t += 0.25) Cy(g, 0.03, 0.03, 1.0, red, kd.x + x1 + (x2 - x1) * t, 1.25, kd.z + z1 + (z2 - z1) * t, 6);
      }
      merge(g); temple = { x: tx, z: tz, rot: tRot };
      if (collide) { const c = F.w(0, -2.5); collide.rect(c.x, c.z, tRot, 4.6, 4.6, false); const h2 = F.w(hp.x, hp.z); collide.rect(h2.x, h2.z, tRot, 3.2, 3.2, true); const k2 = F.w(kd.x, kd.z); collide.rect(k2.x, k2.z, tRot, 5.2, 4.2, true); }
      counts.temple = 1;
      flags({ ...F.w(-7.5, 5.5), y: gy + 4.5 }, { ...F.w(-1.5, -2.5), y: gy + 7.5 }, 0.8); flags({ ...F.w(7.5, 5.5), y: gy + 4.5 }, { ...F.w(1.5, -2.5), y: gy + 7.5 }, 0.8);
    }
    // white balustrade along the long side of the Bhagsu Nag pool
    if (o.pools) for (const pl of o.pools) {
      if (!/bhagsu/i.test(pl.name || '')) continue;
      const P = []; for (let k = 0; k < pl.p.length; k += 2) P.push([pl.p[k], -pl.p[k + 1]]);
      let bi = 0, bl = 0; for (let i = 0; i < P.length; i++) { const a = P[i], b = P[(i + 1) % P.length], l = Math.hypot(b[0] - a[0], b[1] - a[1]); if (l > bl) { bl = l; bi = i; } }
      const a = P[bi], b = P[(bi + 1) % P.length], g = new THREE.Group(), y = Math.min(H(a[0], a[1]), H(b[0], b[1])) + 0.6, wm = mat(0xf1efe8, 0.6);
      for (let t = 0; t <= 1.001; t += 1 / Math.round(bl / 0.35)) { const x = a[0] + (b[0] - a[0]) * t, z = a[1] + (b[1] - a[1]) * t; const q = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 0.8, 8), wm); q.position.set(x, y + 0.4, z); g.add(q); }
      const top = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.1, bl), wm); top.position.set((a[0] + b[0]) / 2, y + 0.85, (a[1] + b[1]) / 2); top.rotation.y = Math.atan2(b[0] - a[0], b[1] - a[1]); g.add(top);
      merge(g); if (collide) collide.rect((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, Math.atan2(b[0] - a[0], b[1] - a[1]), 0.3, bl, true);
    }

    /* ---------- the pathway: slate tiles, fence, pipe, stalls ---------- */
    {
      const runs = (trail.runs || []).filter(r => r.surf === 3 && r.s0 < 560);   // the paved (concrete) part from the temple to the falls
      const pos = [], uv = [], idx = []; let vbase = 0;
      for (const r of runs) for (let s = r.s0; s < Math.min(r.s1, 560); s += 1.5) {
        if (isStep && isStep(s)) continue;
        const s2 = Math.min(r.s1, s + 1.5), a = trail.pointAtS(s), b = trail.pointAtS(s2), da = trail.dirAtS(s, 4), db = trail.dirAtS(s2, 4), W = 0.95;
        for (const [p, d, v] of [[a, da, s / 1.8], [b, db, s2 / 1.8]]) for (const sd of [-1, 1]) { const x = p.x - d.dz * sd * W, z = p.z + d.dx * sd * W; pos.push(x, H(x, z) + 0.05, z); uv.push(sd < 0 ? 0 : 1, v); }
        idx.push(vbase, vbase + 1, vbase + 2, vbase + 1, vbase + 3, vbase + 2); vbase += 4;
      }
      if (pos.length) {
        const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
        const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: slate, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 })); m.receiveShadow = true; scene.add(m); counts.slateM = Math.round(vbase / 4 * 1.5);
      }
      // barbed-wire fence on wooden posts along the downhill side, and a black water pipe along the uphill verge
      const fg = new THREE.Group(), post = mat(0x6b5236);
      const side = s => { const p = trail.pointAtS(s), d = trail.dirAtS(s, 8), l = { x: p.x - d.dz * 1.6, z: p.z + d.dx * 1.6 }, r = { x: p.x + d.dz * 1.6, z: p.z - d.dx * 1.6 }; return H(l.x, l.z) < H(r.x, r.z) ? [l, r] : [r, l]; };
      let prevF = null, prevP = null;
      for (let s = 20; s < 540; s += 3) {
        const [lo, hi] = side(s), fy = H(lo.x, lo.z), py = H(hi.x, hi.z);
        if ((s / 3 | 0) % 7 < 5) { const q = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 1.3, 6), post); q.position.set(lo.x, fy + 0.6, lo.z); q.rotation.z = (R() - 0.5) * 0.1; fg.add(q);
          if (prevF) for (const hh of [0.6, 1.0]) wires.push(prevF.x, prevF.y + hh, prevF.z, lo.x, fy + hh, lo.z);
          prevF = { x: lo.x, y: fy, z: lo.z }; if (collide) collide.circle(lo.x, lo.z, 0.08, true); } else prevF = null;
        if (prevP) pipeLines.push(prevP.x, prevP.y, prevP.z, hi.x, py + 0.06, hi.z); prevP = { x: hi.x, y: py + 0.06, z: hi.z };
      }
      merge(fg);
      // stalls along the path: slate dry-stone walls, timber posts, blue tarp roofs, a board, plastic chairs,
      // bottles cooling in a trough of running water
      const ST = [[110, 'FUSION CAFE', 'Coffee · Maggi · Omelette'], [190, 'MAGGI POINT', 'Chai · Cold drinks'], [270, 'TREKKING GEAR', 'Raincoats · Sticks · Caps'], [360, 'MOMOS & CHAI', 'Veg · Paneer'], [450, 'COLD DRINKS', 'Water · Juice · Chips']];
      const tarp = new THREE.MeshStandardMaterial({ color: lin(0x1f5fa8), roughness: 0.7, side: THREE.DoubleSide }), wall = mat(0x4a4844), wood = mat(0x6b5236);
      ST.forEach(([s, nm, sub], i) => {
        const p = trail.pointAtS(s), d = trail.dirAtS(s, 8), sd = i % 2 ? 1 : -1, nx = -d.dz * sd, nz = d.dx * sd, cx = p.x + nx * 4.3, cz = p.z + nz * 4.3;
        if (isStep && isStep(s)) return;
        const rot = Math.atan2(-nx, -nz), F = frame(cx, cz, rot, Math.min(H(cx, cz), p.h + 0.3)), g = F.g;   // front (+z) faces the path
        for (let y = 0; y < 1.1; y += 0.18) for (let x = -1.6; x < 1.6; x += 0.5 + R() * 0.2) B(g, 0.5, 0.16, 0.5, mat(0x3e3c38 + ((R() * 3) | 0) * 0x040404), x + (y * 5 % 2) * 0.2, y + 0.08, -1.2);   // slate courses at the back
        B(g, 0.5, 1.1, 2.4, wall, -1.75, 0.55, 0); B(g, 0.5, 1.1, 2.4, wall, 1.75, 0.55, 0);
        for (const [x, z] of [[-1.9, -1.3], [1.9, -1.3], [-1.9, 1.2], [1.9, 1.2]]) Cy(g, 0.05, 0.06, z > 0 ? 2.3 : 2.7, wood, x, z > 0 ? 1.15 : 1.35, z, 6);
        const tp = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 3.0), tarp); tp.rotation.x = -Math.PI / 2 + 0.16; tp.position.set(0, 2.5, 0); tp.userData.keep = true; g.add(tp);
        B(g, 2.4, 0.9, 0.5, mat(0x7a5a3a), 0, 0.45, 0.9);
        for (let k = 0; k < 8; k++) B(g, 0.12, 0.25, 0.12, mat([0xe0402a, 0xf2c230, 0x2f6fd6, 0x2f9a52][k % 4]), -0.9 + k * 0.25, 1.03, 0.9);
        // the trough of running water with bottles
        B(g, 1.0, 0.4, 0.5, mat(0x8a8a86), 1.2, 0.2, 1.6);
        for (let k = 0; k < 5; k++) Cy(g, 0.04, 0.04, 0.28, mat(0x9ad0e8, 0.2), 0.85 + k * 0.17, 0.42, 1.6, 6);
        for (const [x, c] of [[-1.3, 0xc0392b], [-0.6, 0xf2f2ee]]) { B(g, 0.45, 0.05, 0.45, mat(c, 0.5), x, 0.45, 2.1); B(g, 0.45, 0.5, 0.05, mat(c, 0.5), x, 0.7, 1.9); }   // plastic chairs
        const bd = textPlane([{ t: nm, size: 54, w: 700 }, { t: sub, size: 30 }], 2.4, 0.7, ['#f2c230', '#f4f1ea', '#1f4e8c', '#b3261e', '#2f9a4a'][i], ['#2a1a04', '#7a1f1f', '#ffffff', '#ffffff', '#ffffff'][i]);
        bd.position.set(0, 2.15, 1.3); bd.userData.keep = true; g.add(bd);
        merge(g); if (collide) { collide.rect(cx, cz, rot, 4.0, 2.8, false); }
        o.taken && o.taken.push({ x: cx + Math.sin(rot) * 1.3, z: cz + Math.cos(rot) * 1.3, r: 4 });
      });
      counts.pathStalls = ST.length;
    }

    /* ---------- at the falls: the right-bank stall terrace, umbrellas, the signboard ---------- */
    if (fall) {
      const { x, z, y, fx, fz, rx, rz } = fall;
      // the terrace: a slate dry-stone wall standing in the stream bed, tea stalls on top under a blue tarp
      // on the bank: the terrace top just above the ground there (and above the pool), its wall going down deep
      // the flattest spot on either bank near the pool (the ground under a 9 x 5 m terrace varies least)
      let best = null;
      for (const sd of [1, -1]) for (const d of [5, 7, 9, 11, 13]) for (const off of [6, 8, 10, 12]) {
        const px = x + fx * d + rx * sd * off, pz = z + fz * d + rz * sd * off; let lo = Infinity, hi = -Infinity;
        for (const [a, b] of [[-4, -2], [4, -2], [-4, 2], [4, 2], [0, 0]]) { const h = H(px + rx * a + fx * b, pz + rz * a + fz * b); lo = Math.min(lo, h); hi = Math.max(hi, h); }
        if (!best || hi - lo < best.sp) best = { cx: px, cz: pz, sp: hi - lo, lo, hi, sd };
      }
      const { cx, cz } = best, top = best.hi + 0.3, rot = Math.atan2(-rx * best.sd, -rz * best.sd), F = frame(cx, cz, rot, top), g = F.g, deep = top - best.lo + 0.6;
      const dry = setts.clone(); dry.needsUpdate = true; dry.repeat.set(3, Math.max(0.5, deep / 2.5));   // dry-stone courses
      const ter = new THREE.Mesh(new THREE.BoxGeometry(9, deep, 5), new THREE.MeshStandardMaterial({ map: dry, color: lin(0x77746c), roughness: 0.95 })); ter.position.set(0, -deep / 2, 0); g.add(ter);
      const tarp = new THREE.MeshStandardMaterial({ color: lin(0x1f5fa8), roughness: 0.7, side: THREE.DoubleSide });
      for (const sx of [-2.4, 2.4]) {
        B(g, 3.4, 2.4, 0.15, mat(0x5a4a3a), sx, 1.2, -2.2); B(g, 2.6, 0.9, 0.6, mat(0x7a5a3a), sx, 0.45, -1.2);
        for (let k = 0; k < 10; k++) B(g, 0.12, 0.25, 0.12, mat([0xe0402a, 0xf2c230, 0x2f6fd6, 0x2f9a52, 0xf08a24][k % 5]), sx - 1.1 + k * 0.24, 1.03, -1.2);
        const tp = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 3.4), tarp); tp.rotation.x = -Math.PI / 2 - 0.12; tp.position.set(sx, 2.7, -0.8); tp.userData.keep = true; g.add(tp);
        for (const [px, pz] of [[-1.9, 0.8], [1.9, 0.8]]) Cy(g, 0.05, 0.06, 2.6, mat(0x6b5236), sx + px, 1.3, pz, 6);
      }
      const bd = textPlane([{ t: 'TRINETRA CAFE', size: 58, w: 700 }, { t: 'Chai · Maggi · Cold drinks', size: 30 }], 2.6, 0.8, '#f2c230', '#7a1f1f'); bd.position.set(2.4, 2.1, 0.75); bd.userData.keep = true; g.add(bd);
      for (let k = 0; k < 6; k++) B(g, 0.9, 0.06, 0.35, mat(0x8a8780), -3.5 + k * 1.4, 0.03, 2.1);   // people sit along the wall edge
      merge(g);
      flags({ x: cx - Math.cos(rot) * 4.4, z: cz + Math.sin(rot) * 4.4, y: top + 3 }, { x: cx + Math.cos(rot) * 4.4, z: cz - Math.sin(rot) * 4.4, y: top + 3 }, 0.6);
      if (collide) collide.rect(cx, cz, rot, 9, 5, false);
      // left bank: beach umbrellas on the flat rocks and a white signboard on a pole
      const ug = new THREE.Group();
      for (let k = 0; k < 3; k++) {
        const ux = x + fx * (7 + k * 2.4) - rx * (7 + R() * 2), uz = z + fz * (7 + k * 2.4) - rz * (7 + R() * 2), uy = H(ux, uz);
        Cy(ug, 0.03, 0.03, 2.2, mat(0xdddddd, 0.4), ux, uy + 1.1, uz, 6);
        const um = new THREE.Mesh(new THREE.ConeGeometry(1.2, 0.45, 8, 1, true), new THREE.MeshStandardMaterial({ color: lin([0xd8262a, 0x2f6fd6, 0xf2c230][k]), side: THREE.DoubleSide })); um.position.set(ux, uy + 2.3, uz); ug.add(um);
      }
      merge(ug);
      const sx2 = x + fx * 6 - rx * 5.5, sz2 = z + fz * 6 - rz * 5.5;
      board(sx2, sz2, Math.atan2(fx, fz), [{ t: 'BHAGSU WATERFALL', size: 52, w: 700 }, { t: 'Slippery rocks. Do not climb the falls.', size: 26 }, { t: 'Keep the water clean', size: 26 }], 2.2, 0.9, '#f4f4f0', '#1f3b8a');
      counts.fallTerrace = 1;
    }

    /* ---------- the steps up to Shiva Cafe: prayer flags across the gorge ---------- */
    {
      const sA = (marks.bhagsuFall && marks.bhagsuFall.s) || 612, sB = (marks.shivaCafe && marks.shivaCafe.s) || 777;
      for (let s = sA - 20; s < sB; s += 26) {
        const p = trail.pointAtS(s), d = trail.dirAtS(s, 8);
        // the far end over the stream: the lower side of the path
        const l = { x: p.x - d.dz * 14, z: p.z + d.dx * 14 }, r = { x: p.x + d.dz * 14, z: p.z - d.dx * 14 }, far = H(l.x, l.z) < H(r.x, r.z) ? l : r;
        flags({ x: p.x - (far.x - p.x) * 0.15, z: p.z - (far.z - p.z) * 0.15, y: p.h + 5 }, { x: far.x, z: far.z, y: H(far.x, far.z) + 6 }, 1.6);
      }
      counts.flagStrings = (counts.flagStrings || 0) + Math.ceil((sB - sA + 20) / 26);
    }

    /* ---------- Hanuman ji at Triund top ---------- */
    // As filmed (4EhrrU7yyGY 13:31, xciETpiojPs 12:53, on the way down from the top): an orange Hanuman on a small dark
    // plinth on a flat grey granite slab at the rim of the southern part of the meadow, where the Gallu and Bhagsu
    // paths top out, 2-3 m beside the footpath, a wire-mesh bin on a post next to it. Behind it the slope drops into the
    // deep valley (east, toward the Dhauladhar); he faces the path. Search that stretch of rim for the point with the
    // steepest drop behind it that is 2.2-4.5 m from a path.
    let hanuman = null;
    const pray = [];   // where E folds your hands (index.html)
    const toPath = (x, z) => { let best = 0, bd = Infinity; for (let k = 0; k < 16; k++) { const a = k * Math.PI / 8, d = o.trailD ? o.trailD(x + Math.sin(a) * 2.5, z + Math.cos(a) * 2.5) : 0; if (d < bd) { bd = d; best = a; } } return best; };
    {
      let bx = marks.triund.e + 45, bz = -marks.triund.n + 60, bestSc = -Infinity;
      for (let e = 2690; e <= 2752; e += 2) for (let n = 715; n <= 820; n += 2) {
        const x = e, z = -n, d = o.trailD ? o.trailD(x, z) : 3; if (d < 2.2 || d > 4.5) continue;
        const h = H(x, z); let low = Infinity; for (const a of [0.6, 1.0, 1.57, 2.1, 2.5]) low = Math.min(low, H(x + Math.sin(a) * 14, z - Math.cos(a) * 14));   // north-east to south-east
        const sc = (h - low) - Math.abs(d - 3) * 0.8; if (sc > bestSc) { bestSc = sc; bx = x; bz = z; }
      }
      const face = toPath(bx, bz), fx = Math.sin(face), fz = Math.cos(face), gy = H(bx, bz), g = new THREE.Group();
      // a flat, cracked granite slab: a faceted rock with its top cut flat (where he stands) and its edges broken
      const sg = new THREE.IcosahedronGeometry(1.6, 1), sp = sg.attributes.position, R2 = rng ? rng(7177) : Math.random;
      // the same jitter for a corner shared by several faces (the geometry is not indexed), so the rock stays closed
      const jit = (x, y, z, k) => { const v = Math.sin(Math.round(x * 100) * 12.9898 + Math.round(y * 100) * 78.233 + Math.round(z * 100) * 37.719 + k * 11.3) * 43758.5453; return v - Math.floor(v); };
      for (let k = 0; k < sp.count; k++) { const x0 = sp.getX(k), y0 = sp.getY(k), z0 = sp.getZ(k), j = 0.82 + jit(x0, y0, z0, 1) * 0.3; sp.setXYZ(k, x0 * j, Math.min(y0 * j, 0.55), z0 * (0.85 + jit(x0, y0, z0, 2) * 0.3)); }
      sg.computeVertexNormals();
      const slab = new THREE.Mesh(sg, new THREE.MeshStandardMaterial({ color: lin(0x8c8a84), roughness: 0.95, flatShading: true })); slab.scale.set(1.3, 0.75, 1.05); slab.rotation.y = face + 0.4; slab.position.set(bx, gy + 0.2, bz); slab.castShadow = slab.receiveShadow = true; g.add(slab);
      for (let k = 0; k < 3; k++) { const a = face + Math.PI + (k - 1) * 0.9, r = 2.1 + k * 0.3, rx = bx + Math.sin(a) * r, rz = bz + Math.cos(a) * r, rk = new THREE.Mesh(new THREE.DodecahedronGeometry(0.45 + k * 0.12, 0), slab.material); rk.position.set(rx, H(rx, rz) + 0.15, rz); rk.rotation.set(k, k * 2, 0); rk.castShadow = true; g.add(rk); }
      const top = gy + 0.2 + 0.55 * 0.75;
      const plinth = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.22, 0.45), mat(0x1c1c1c, 0.6)); plinth.position.set(bx, top + 0.11, bz); plinth.rotation.y = face; g.add(plinth);
      const idol = hanumanIdol(0.85); idol.position.set(bx, top + 0.22, bz); idol.rotation.y = face; g.add(idol);
      // a small saffron flag tied above him
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 1.5, 6), mat(0x6b5236)); pole.position.set(bx - fx * 0.3 + fz * 0.3, top + 0.95, bz - fz * 0.3 - fx * 0.3); g.add(pole);
      const fgeo = new THREE.BufferGeometry(); fgeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, -0.45, 0, 0.42, -0.15, 0], 3)); fgeo.computeVertexNormals();
      const yflag = new THREE.Mesh(fgeo, new THREE.MeshLambertMaterial({ color: lin(0xf08a1a), side: THREE.DoubleSide })); yflag.position.set(pole.position.x, top + 1.68, pole.position.z); yflag.rotation.y = face + Math.PI / 2; g.add(yflag);
      // the wire-mesh bin on its post, beside the slab on the path side
      const bxn = bx + fx * 1.9 + fz * 1.6, bzn = bz + fz * 1.9 - fx * 1.6, by = H(bxn, bzn);
      const bin = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.26, 0.75, 12, 5, true), new THREE.MeshBasicMaterial({ color: lin(0x262626), wireframe: true }));
      bin.position.set(bxn, by + 0.5, bzn); g.add(bin);
      const binBase = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.03, 12), mat(0x262626, 0.6)); binBase.position.set(bxn, by + 0.13, bzn); g.add(binBase);
      for (const sd of [-1, 1]) { const ps = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.2, 6), mat(0x262626, 0.5)); ps.position.set(bxn + fz * 0.3 * sd, by + 0.6, bzn - fx * 0.3 * sd); g.add(ps); }
      g.traverse(m => { if (m.isMesh && !m.userData.keep) m.userData.keep = true; });
      scene.add(g);
      if (collide) { collide.circle(bx, bz, 1.9, false); collide.circle(bxn, bzn, 0.35, false); }
      hanuman = { x: bx, z: bz, y: top + 0.22 };
      pray.push({ x: bx, z: bz, r: 4, say: 'Hanuman ji on his rock at the edge of Triund, the valley falling away behind him and the snows beyond. You fold your hands for a safe walk down.' });
      counts.hanuman = 1;
    }

    /* ---------- the small temples on the way (places.js builds them from OpenStreetMap; dressed as filmed) ---------- */
    // shrines: [{ x, y, z, ry, poi }]; trailPt(x, z) -> nearest point on any path { x, z }
    function dressShrines(shrines, trailPt, extra) {
      shrines = (shrines || []).slice();
      for (const poi of extra || []) {
        if (shrines.some(q => q.poi.id === poi.id)) continue;
        // a free spot near its OSM point: off the path (5 m+) and clear of the stall and its benches
        let x = poi.e, z = -poi.n, ok = false;
        for (let r = 0; r <= 14 && !ok; r += 1.5) for (let k = 0; k < 12 && !ok; k++) {
          const cx = poi.e + Math.sin(k * 0.52) * r, cz = -poi.n + Math.cos(k * 0.52) * r;
          if (o.trailD && o.trailD(cx, cz) < 5) continue;
          if (collide && [[0, 0], [1.8, 0], [-1.8, 0], [0, 1.8], [0, -1.8]].some(([a, b]) => collide.inside(cx + a, cz + b))) continue;
          x = cx; z = cz; ok = true;
        }
        const ry = toPath(x, z), y = H(x, z), g = new THREE.Group(), fx = Math.sin(ry), fz = Math.cos(ry), white = mat(0xf1ede4, 0.85);
        const box = (w, h, d, m, lx, ly, lz) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x + fx * lz + fz * lx, y + ly, z + fz * lz - fx * lx); b.rotation.y = ry; b.castShadow = b.receiveShadow = true; g.add(b); };
        box(2.8, 0.6, 2.8, mat(0x9a968e, 0.95), 0, 0.1, 0);            // stone plinth
        box(2.0, 2.0, 2.0, white, 0, 1.4, 0);                          // whitewashed cell
        box(2.4, 0.15, 2.6, white, 0, 2.45, 0.2);                      // flat roof slab, a little porch in front
        box(0.75, 1.3, 0.04, mat(0x2a1a12, 0.9), 0, 1.05, 1.01);       // dark doorway
        for (const lx of [-0.62, 0.62]) box(0.28, 0.32, 0.03, mat(0xc9452e, 0.8), lx, 1.75, 1.01);   // red swastik / om marks either side
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.6, 6), mat(0x9c8452)); pole.position.set(x - fx * 0.6, y + 3.3, z - fz * 0.6); g.add(pole);
        const fg = new THREE.BufferGeometry(); fg.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, -0.45, 0, 0.7, -0.18, 0], 3)); fg.computeVertexNormals();
        const fl = new THREE.Mesh(fg, new THREE.MeshLambertMaterial({ color: lin(0xd8262a), side: THREE.DoubleSide })); fl.position.set(x - fx * 0.6, y + 4.1, z - fz * 0.6); fl.rotation.y = ry + 1.2; g.add(fl);
        for (let k = 0; k < 3; k++) box(0.08, 0.5, 0.02, mat([0xd8262a, 0xf08a1a, 0xf2c230][k], 0.9), -0.5 + k * 0.5, 2.15, 1.28);   // chunri hanging from the porch
        merge(g);
        if (collide) collide.rect(x, z, ry, 2.8, 2.8, false);
        shrines.push({ x, y: y + 0.4, z, ry, poi });
      }
      for (const sh of shrines) {
        const { x, y, z, ry, poi } = sh, fx = Math.sin(ry), fz = Math.cos(ry);
        // Jhande Wali Mata on the Snowline path (OSM tags it a Hanuman shrine): Hanuman ji at the door, and the jhande
        // (red and saffron flags on bamboo poles) that give it its name, all round it
        if (poi.id === 'n539994860' || /jhande/i.test(poi.name || '')) {
          const g = new THREE.Group();
          const pl = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.35, 0.55), mat(0xf1ece2, 0.8)); pl.position.set(x + fx * 1.75, y + 0.18, z + fz * 1.75); pl.rotation.y = ry; g.add(pl);
          const idol = hanumanIdol(0.75); idol.position.set(x + fx * 1.75, y + 0.35, z + fz * 1.75); idol.rotation.y = ry; g.add(idol);
          const cols = [0xd8262a, 0xf08a1a, 0xd8262a, 0xf2c230, 0xf08a1a, 0xd8262a, 0xf08a1a, 0xd8262a, 0xf2c230];
          for (let k = 0; k < cols.length; k++) {
            const a = ry + Math.PI * 0.35 + k * (Math.PI * 1.3 / (cols.length - 1)), r = 2.9 + (k % 2) * 0.6, px = x + Math.sin(a) * r, pz = z + Math.cos(a) * r, ph = 3.2 + ((k * 7) % 5) * 0.35, py = H(px, pz);
            const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, ph, 6), mat(0x9c8452)); pole.position.set(px, py + ph / 2, pz); g.add(pole);
            const fg = new THREE.BufferGeometry(); fg.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, -0.55, 0, 0.85, -0.22, 0], 3)); fg.computeVertexNormals();
            const fl = new THREE.Mesh(fg, new THREE.MeshLambertMaterial({ color: lin(cols[k]), side: THREE.DoubleSide })); fl.position.set(px, py + ph, pz); fl.rotation.y = a + 1.2; g.add(fl);
            if (collide) collide.circle(px, pz, 0.12, false);
          }
          merge(g); counts.jhande = 1;
          pray.push({ x: x + fx * 2.6, z: z + fz * 2.6, r: 3.5, say: 'Jhande Wali Mata: Hanuman ji at the door, red and saffron flags snapping in the wind over the ridge. You fold your hands and ring on toward Snowline.' });
        }
        // the little white mandir above Magic View: stone steps up from the path, every riser painted red (4EhrrU7yyGY 10:55)
        if (poi.id === 'n13823403963' && trailPt) {
          const p = trailPt(x, z), dx = x + fx * 1.9 - p.x, dz = z + fz * 1.9 - p.z, L = Math.hypot(dx, dz);   // from the path up to the door (+f is the front)
          // steps only where the mandir really stands above the path (on level ground you just walk over)
          if (L > 2 && y - H(p.x, p.z) > 0.6) {
            const g = new THREE.Group(), ux = dx / L, uz = dz / L, a = Math.atan2(ux, uz), n = Math.max(3, Math.round(L / 0.5)), stone = mat(0x8a8882, 0.95), red = mat(0xc9452e, 0.85);
            const y0 = H(p.x + ux * 1.2, p.z + uz * 1.2), y1 = y;
            for (let k = 0; k < n; k++) {
              const t = (k + 0.5) / n, sx = p.x + ux * (1.2 + (L - 1.2) * t), sz = p.z + uz * (1.2 + (L - 1.2) * t), ty = Math.max(H(sx, sz), y0 + (y1 - y0) * (k + 1) / n), gy = H(sx, sz);
              const hgt = Math.max(0.12, ty - gy + 0.12), tread = new THREE.Mesh(new THREE.BoxGeometry(1.3, hgt, (L - 1.2) / n + 0.05), stone);
              tread.position.set(sx, gy + hgt / 2 - 0.1, sz); tread.rotation.y = a; g.add(tread);
              const riser = new THREE.Mesh(new THREE.BoxGeometry(1.32, Math.min(0.2, hgt), 0.02), red); const back = (L - 1.2) / n / 2;
              riser.position.set(sx - ux * back, gy + hgt - 0.1 - Math.min(0.2, hgt) / 2, sz - uz * back); riser.rotation.y = a; g.add(riser);
            }
            merge(g); counts.magicSteps = n;
          }
          pray.push({ x: x + fx * 2, z: z + fz * 2, r: 3.8, say: 'A small white mandir above Magic View, red cloth tied at its door. You fold your hands before the last climb.' });
        }
      }
    }

    /* ---------- wires (flag strings, fence) and the water pipe ---------- */
    if (wires.length) { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(wires, 3)); scene.add(new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: lin(0x3a3a3a) }))); }
    if (pipeLines.length) { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pipeLines, 3)); scene.add(new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: lin(0x111111) }))); }
    counts.flags = flagGroup.children.length;
    scene.remove(flagGroup); merge(flagGroup); flagGroup.traverse(m => { if (m.isMesh) m.castShadow = false; });   // one mesh per flag colour

    /* ---------- Shiva Cafe: murals, painted boulders, cushions on flat rocks (call with its stop) ---------- */
    function dressShiva(st, toWorld) {
      const rot = Math.atan2(st.tz, -st.tx), g = new THREE.Group();
      // murals on the stall's side and back walls (stall: 4.5 x 6 m, counter side at local -x)
      const add = (lx, lz, ry, w, h, k) => { const p = toWorld(st.x, st.z, rot, lx, lz), m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshLambertMaterial({ map: murals[k] })); m.position.set(p.x, st.h + 1.55, p.z); m.rotation.y = rot + ry; scene.add(m); };
      add(0, 3.03, 0, 4.2, 2.3, 0); add(0, -3.03, Math.PI, 4.2, 2.3, 1); add(2.27, 0, Math.PI / 2, 5.6, 2.4, 2);
      // the sitting place on the stream side, away from the path: flat rocks, low tables and cushions; painted boulders
      const away = { x: -st.tx, z: -st.tz };
      for (let k = 0; k < 4; k++) {
        const along = (k - 1.5) * 3.2, x = st.x + away.x * (7 + (k % 2) * 1.5) + away.z * along, z = st.z + away.z * (7 + (k % 2) * 1.5) - away.x * along, y = H(x, z);
        const slab = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.6, 0.5, 9), mat(0x6e6c66)); slab.position.set(x, y + 0.1, z); g.add(slab);
        B(g, 0.9, 0.3, 0.6, mat(0x6b4a2a), x, y + 0.5, z);
        for (let c = 0; c < 3; c++) { const a = c * 2.1 + k; B(g, 0.5, 0.14, 0.5, mat([0xd8262a, 0xf2c230, 0x7a3fa0, 0x2f9a4a, 0xe0602a][(c + k) % 5], 0.95), x + Math.cos(a) * 0.95, y + 0.42, z + Math.sin(a) * 0.95, a); }
        if (collide) collide.circle(x, z, 1.5, true);
      }
      for (let k = 0; k < 4; k++) {
        const along = (k - 1.5) * 4.5, x = st.x + away.x * 12 + away.z * along, z = st.z + away.z * 12 - away.x * along, y = H(x, z);
        const r = new THREE.Mesh(new THREE.DodecahedronGeometry(1.3, 1), mat(0x6e6c66)); r.scale.set(1.2, 0.9, 1); r.position.set(x, y + 0.7, z); g.add(r);
        const face = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.5), new THREE.MeshLambertMaterial({ map: deityRock[k], transparent: true, alphaTest: 0.2 })); const fa = Math.atan2(st.x - x, st.z - z);
        face.position.set(x + Math.sin(fa) * 1.35, y + 0.95, z + Math.cos(fa) * 1.35); face.rotation.y = fa; face.userData.keep = true; scene.add(face);
        if (collide) collide.circle(x, z, 1.4, false);
      }
      merge(g);
      const a = toWorld(st.x, st.z, rot, -2.5, -3.5), b = toWorld(st.x, st.z, rot, -2.5, 3.5);
      flags({ x: a.x, z: a.z, y: st.h + 4.2 }, { x: b.x, z: b.z, y: st.h + 4.2 }, 0.4);
      flags({ x: st.x, z: st.z, y: st.h + 4 }, { x: st.x + away.x * 13, z: st.z + away.z * 13, y: H(st.x + away.x * 13, st.z + away.z * 13) + 4 }, 0.8);
      counts.shiva = 1;
    }
    let lx = 1e9, lz = 1e9;
    function update(cam) {
      if ((cam.x - lx) ** 2 + (cam.z - lz) ** 2 < 400) return; lx = cam.x; lz = cam.z;
      for (const g of parts) { if (!g.userData.c) { const b = new THREE.Box3().setFromObject(g), c = new THREE.Vector3(); b.getCenter(c); g.userData.c = c; }
        const c = g.userData.c; g.visible = (c.x - cam.x) ** 2 + (c.z - cam.z) ** 2 < 500 * 500; }
    }
    return { counts, temple, hanuman, pray, dressShiva, dressShrines, hanumanIdol, update };
  }
};
