'use strict';
/* Things you pass on the real Triund trail, from trek videos of the route (2024-25) and OpenStreetMap:
   - Forest Department "Triund Eco Trail" boards on steel frames in the forest (birds, trees, wildlife, leave no trace)
   - chain-link fencing on steel posts where the path runs along a drop (the upper switchbacks, the open ridge)
   - the saffron flag on its pole at the Shiva shrine near the top (OSM "Shiva Shrine")
   - blue tarpaulin shelters, plastic tables under a patio umbrella and blue water drums at the tea stalls on top
   - big pale granite boulders round the edge of the top meadow
   - a wall mural near the Gallu Devi start: a Himalayan black bear and "Bring back your waste with you!"
   Interface: build(ctx) -> { update(cam, time), counts } */
window.TriundTrailProps = {
  build(o) {
    const { THREE, scene, H, trails, collide, blocked, top, pois, isStep, avoid } = o;
    const lin = c => new THREE.Color(c).convertSRGBToLinear();
    const rng = (s => () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; })(777);
    const counts = { eco: 0, fenceM: 0, boulders: 0, tarps: 0 };
    const nearAvoid = (x, z, r) => (blocked && blocked(x, z)) || (avoid || []).some(a => Math.hypot(a.x - x, a.z - z) < (a.r || 0) + r);

    /* ---------- Eco Trail boards (drawn when near, like signs.js) ---------- */
    const ECO = [
      { title: 'Who flutters by in the forest?', sub: 'Listen for them as you walk. Keep your voice low and you will hear more.',
        items: [['Himalayan bulbul', '#3b3b3b', '#f2d13a'], ['Red-billed blue magpie', '#2d5fa8', '#d8332a'], ['Great barbet', '#3f6b2a', '#f2c230'], ['Whistling thrush', '#1d2a6a', '#e8c43a'], ['Laughingthrush', '#8a6a4a', '#d9cfbf'], ['Griffon vulture', '#6b5236', '#d9c4a0']] },
      { title: 'Trees of the Triund forest', sub: 'Deodar and oak hold the slope together. Please do not break branches.',
        items: [['Deodar cedar', '#2c4436', '#56735f'], ['Banj oak', '#3f5a36', '#95a487'], ['Rhododendron', '#22361f', '#cf3038'], ['Kail pine', '#2f4a2a', '#7c9a68'], ['Horse chestnut', '#3a5a2e', '#b7c0a0'], ['Moru oak', '#2c3f26', '#8a9a70']] },
      { title: 'Wildlife of the Dhauladhar', sub: 'Do not feed the monkeys or the dogs. Keep food packed away.',
        items: [['Himalayan black bear', '#1a1816', '#d9cfbf'], ['Grey langur', '#9a948a', '#2a2420'], ['Rhesus macaque', '#8a6a48', '#d8a080'], ['Common leopard', '#c8902a', '#2a2420'], ['Himalayan goral', '#7a6a58', '#d9cfbf'], ['Barking deer', '#a0603a', '#e8d8c0']] },
      { title: 'Leave no trace', sub: 'Carry back every wrapper and bottle. The bins at the stalls are emptied by porters who walk them down.',
        items: [['Carry your waste back', '#2f6fd6', '#ffffff'], ['Stay on the trail', '#6b5236', '#f2c230'], ['No loud music', '#7a3418', '#ffd9b0'], ['No campfires in the forest', '#b8322b', '#ffffff'], ['Use the toilets at the top', '#2f9a52', '#ffffff'], ['Respect other hikers', '#1f5a8a', '#ffffff']] }
    ];
    const boards = [], frameParts = [];
    function drawEco(e) {
      const W = 1024, Hc = 460, c = document.createElement('canvas'); c.width = W; c.height = Hc; const g = c.getContext('2d');
      g.fillStyle = '#123c45'; g.fillRect(0, 0, W, Hc);
      g.fillStyle = '#0c2a31'; g.fillRect(0, 0, W, 54); g.fillStyle = '#f2c230'; g.fillRect(0, 54, W, 4);
      g.font = '700 28px Rajdhani, Hind, sans-serif'; g.fillStyle = '#ffffff'; g.textBaseline = 'middle'; g.fillText('#TriundEcoTrail', 22, 28);
      g.textAlign = 'right'; g.fillText('Forest Department · Himachal Pradesh', W - 22, 28); g.textAlign = 'left';
      g.font = '700 50px Rajdhani, Hind, sans-serif'; g.fillStyle = '#f2c230'; g.fillText(e.title, 30, 100);
      g.font = '500 24px Hind, sans-serif'; g.fillStyle = '#d8ecef'; g.fillText(e.sub, 30, 142);
      e.items.forEach((it, i) => {
        const x = 30 + (i % 6) * 162, y = 180, w = 150, h = 240;
        g.fillStyle = '#e9e4d8'; g.fillRect(x, y, w, h);
        // a simple picture: body and accent colours of the bird / tree / animal
        g.fillStyle = '#c9d8c0'; g.fillRect(x + 8, y + 8, w - 16, 150);
        g.fillStyle = it[1]; g.beginPath(); g.ellipse(x + w / 2, y + 90, 46, 32, 0, 0, Math.PI * 2); g.fill();
        g.beginPath(); g.ellipse(x + w / 2 + 36, y + 64, 18, 16, 0, 0, Math.PI * 2); g.fill();
        g.fillStyle = it[2]; g.beginPath(); g.ellipse(x + w / 2 - 6, y + 98, 24, 14, 0.3, 0, Math.PI * 2); g.fill();
        g.font = '600 21px Hind, sans-serif'; g.fillStyle = '#16323a';
        const words = it[0].split(' '); let line = '', ly = y + 184;
        for (const wd of words) { const t = line ? line + ' ' + wd : wd; if (g.measureText(t).width > w - 14) { g.fillText(line, x + 8, ly); ly += 24; line = wd; } else line = t; }
        g.fillText(line, x + 8, ly);
      });
      const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; t.anisotropy = 8;
      return new THREE.MeshLambertMaterial({ map: t });
    }
    const ecoBlank = new THREE.MeshLambertMaterial({ color: lin(0x123c45) });
    const ecoGeo = new THREE.PlaneGeometry(2.2, 1.0);
    function ecoBoard(tr, s, e) {
      const p = tr.pointAtS(s), d = tr.dirAtS(s, 8);
      for (const sd of [1, -1]) {
        const x = p.x - d.dz * 2.4 * sd, z = p.z + d.dx * 2.4 * sd, y = H(x, z);
        if (Math.abs(y - p.h) > 1.2 || nearAvoid(x, z, 2)) continue;
        const ry = Math.atan2(-d.dx, -d.dz) + sd * 0.5;    // angled toward walkers coming up
        const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = ry; g.updateMatrix();
        const part = (geo, px, py, pz, col) => frameParts.push({ geo, m: new THREE.Matrix4().multiplyMatrices(g.matrix, new THREE.Matrix4().makeTranslation(px, py, pz)), col });
        for (const sx of [-1.12, 1.12]) part(new THREE.CylinderGeometry(0.03, 0.03, 2.2, 8), sx, 0.9, -0.03, 0x8a8f94);
        part(new THREE.BoxGeometry(2.3, 1.1, 0.04), 0, 1.25, -0.03, 0x6f757a);
        const fm = new THREE.Mesh(ecoGeo, ecoBlank); fm.position.set(0, 1.25, 0.0); g.add(fm); scene.add(g);
        if (collide) { collide.circle(x + Math.cos(ry) * 1.12, z - Math.sin(ry) * 1.12, 0.08, true); collide.circle(x - Math.cos(ry) * 1.12, z + Math.sin(ry) * 1.12, 0.08, true); }
        boards.push({ g, fm, e, x, z, drawn: false }); counts.eco++; return true;
      }
      return false;
    }
    // in the forest stretches of both routes
    const ecoAt = { galu: [700, 1500, 2300, 3100], shiva: [900, 1700, 2500, 3300] };
    for (const id of Object.keys(ecoAt)) { const tr = trails[id]; if (!tr) continue; ecoAt[id].forEach((s0, i) => { for (const ds of [0, 15, -15, 30, -30]) if (ecoBoard(tr, Math.min(tr.total - 50, s0 + ds), ECO[(i + (id === 'shiva' ? 2 : 0)) % ECO.length])) break; }); }

    /* ---------- chain-link fencing along drops ---------- */
    const meshTex = (() => {
      const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
      g.clearRect(0, 0, 64, 64); g.strokeStyle = 'rgba(190,196,200,1)'; g.lineWidth = 6;
      g.beginPath(); g.moveTo(0, 32); g.lineTo(32, 0); g.lineTo(64, 32); g.lineTo(32, 64); g.closePath(); g.stroke();
      g.beginPath(); g.moveTo(-32, 32); g.lineTo(0, 0); g.moveTo(64, 0); g.lineTo(96, 32); g.stroke();
      const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; return t;
    })();
    const fencePos = [], fenceUv = [], fenceIdx = [], postParts = [], fenceAt = [];
    for (const tr of Object.values(trails)) {
      let run = null;
      const flush = () => { if (run && run.pts.length >= 3) emitFence(run.pts); run = null; };
      for (let s = 30; s < tr.total - 30; s += 2.5) {
        if (isStep && isStep(tr.id, s)) { flush(); continue; }
        const p = tr.pointAtS(s), d = tr.dirAtS(s, 6); let side = 0;
        for (const sd of [1, -1]) { const nx = -d.dz * sd, nz = d.dx * sd, near = H(p.x + nx * 1.5, p.z + nz * 1.5), far = H(p.x + nx * 7, p.z + nz * 7);
          if (p.h - far > 5.5 && Math.abs(near - p.h) < 0.6) side = sd; }
        const x = p.x - d.dz * 1.45 * side, z = p.z + d.dx * 1.45 * side;
        if (!side || nearAvoid(x, z, 3) || (run && run.side !== side)) { flush(); if (!side) continue; }
        if (!run) run = { side, pts: [] };
        run.pts.push([x, H(x, z), z]);
      }
      flush();
    }
    function emitFence(pts) {
      let u = 0; fenceAt.push(pts[0]);
      for (let i = 0; i < pts.length; i++) {
        const [x, y, z] = pts[i]; if (i) u += Math.hypot(x - pts[i - 1][0], z - pts[i - 1][2]);
        const b = fencePos.length / 3;
        fencePos.push(x, y + 0.05, z, x, y + 1.2, z); fenceUv.push(u * 14, 0, u * 14, 16);   // ~7 cm diamonds, like real chain-link
        if (i) fenceIdx.push(b - 2, b, b - 1, b - 1, b, b + 1);
        { const g = new THREE.CylinderGeometry(0.03, 0.03, 1.3, 6); g.translate(x, y + 0.6, z); postParts.push(g); }
        if (i) for (const ry of [1.2, 0.08]) {   // top and bottom rails (pipes) between the posts
          const [px, py, pz] = pts[i - 1], dx = x - px, dy = y - py, dz = z - pz, l = Math.hypot(dx, dy, dz);
          const g = new THREE.CylinderGeometry(0.02, 0.02, l, 5); g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3((x + px) / 2, (y + py) / 2 + ry, (z + pz) / 2), new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(dx, dy, dz).normalize()), new THREE.Vector3(1, 1, 1))); postParts.push(g); }
        if (i && collide) { const [px, , pz] = pts[i - 1], dx = x - px, dz = z - pz, l = Math.hypot(dx, dz) || 1, nx = -dz / l * 0.05, nz = dx / l * 0.05;
          collide.add([[px - nx, pz - nz], [x - nx, z - nz], [x + nx, z + nz], [px + nx, pz + nz]], true); }
        if (i) counts.fenceM += Math.hypot(x - pts[i - 1][0], z - pts[i - 1][2]);
      }
    }
    if (fencePos.length) {
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(fencePos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(fenceUv, 2)); g.setIndex(fenceIdx); g.computeVertexNormals();
      const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: meshTex, alphaTest: 0.16, transparent: false, side: THREE.DoubleSide, metalness: 0.6, roughness: 0.5, color: lin(0xb8bec2) }));
      scene.add(m);
      const pm = new THREE.Mesh(mergeG(postParts), new THREE.MeshStandardMaterial({ color: lin(0x5e6863), metalness: 0.5, roughness: 0.55 })); pm.castShadow = true; scene.add(pm);
    }
    counts.fenceM = Math.round(counts.fenceM);

    /* ---------- the top: shrine flag, tarps, umbrellas, drums, boulders ---------- */
    const flags = [];
    const shrine = (pois || []).find(q => q.kind === 'temple' && /shiva/i.test(q.name || '') && q.ele > 2700);
    if (shrine) {
      const x = shrine.e + 3, z = -shrine.n + 2, y = H(x, z);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 5, 8), new THREE.MeshStandardMaterial({ color: lin(0x6a6a66), metalness: 0.4, roughness: 0.6 })); pole.position.set(x, y + 2.5, z); pole.castShadow = true; scene.add(pole);
      const fg = new THREE.PlaneGeometry(1.0, 0.7, 10, 1); fg.translate(0.5, 0, 0);
      const pos = fg.attributes.position; for (let i = 0; i < pos.count; i++) { const px = pos.getX(i), py = pos.getY(i); pos.setY(i, py * (1 - px * 0.9)); }   // a pennant: tapers to the tip
      const flag = new THREE.Mesh(fg, new THREE.MeshStandardMaterial({ color: lin(0xe0560a), side: THREE.DoubleSide, roughness: 0.8 })); flag.position.set(x, y + 4.6, z); scene.add(flag);
      flag.userData.base = Float32Array.from(pos.array); flags.push(flag);
      if (collide) collide.circle(x, z, 0.1, true);
      // a small whitewashed shrine platform with a trident
      const plat = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.5, 1.4), new THREE.MeshStandardMaterial({ color: lin(0xe8e2d4), roughness: 0.9 })); plat.position.set(x - 1.6, y + 0.25, z - 0.5); plat.castShadow = plat.receiveShadow = true; scene.add(plat);
      const tri = new THREE.Group(); const tm = new THREE.MeshStandardMaterial({ color: lin(0x8a8a86), metalness: 0.7, roughness: 0.4 });
      const sh = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 1.2, 6), tm); sh.position.y = 0.6; tri.add(sh);
      for (const k of [-1, 0, 1]) { const t = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.004, 0.3, 5), tm); t.position.set(k * 0.09, 1.3 - Math.abs(k) * 0.05, 0); t.rotation.z = -k * 0.25; tri.add(t); }
      tri.position.set(x - 1.6, y + 0.5, z - 0.5); scene.add(tri);
      if (collide) collide.rect(x - 1.6, z - 0.5, 0, 1.4, 1.4, true);
    }
    const tarpMat = new THREE.MeshStandardMaterial({ color: lin(0x2f5fb8), roughness: 0.6, side: THREE.DoubleSide });
    const poleMat = new THREE.MeshStandardMaterial({ color: lin(0x5a4330), roughness: 0.9 });
    const cafes = (pois || []).filter(q => q.kind === 'cafe' && q.ele > 2740);
    for (const cf of cafes) {
      // a free flat spot 5-8 m from the stall for the shelter, toward the meadow
      for (let k = 0; k < 20; k++) {
        const a = rng() * 6.28, r = 5 + rng() * 3, x = cf.e + Math.cos(a) * r, z = -cf.n + Math.sin(a) * r, y = H(x, z);
        if (Math.abs(H(x + 2, z) - y) > 0.5 || Math.abs(H(x, z + 2) - y) > 0.5 || nearAvoid(x, z, 2.2)) continue;
        const ry = rng() * 6.28, g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = ry;
        for (const [px, pz, ph] of [[-1.5, -1.2, 2.3], [1.5, -1.2, 2.3], [-1.5, 1.2, 1.9], [1.5, 1.2, 1.9]]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, ph, 6), poleMat); p.position.set(px, ph / 2, pz); p.castShadow = true; g.add(p); }
        const tg = new THREE.PlaneGeometry(3.4, 2.8, 8, 6); const tp = tg.attributes.position;
        for (let i = 0; i < tp.count; i++) { const px = tp.getX(i), py = tp.getY(i); tp.setZ(i, -0.18 * (1 - (px / 1.7) ** 2) * (1 - (py / 1.4) ** 2)); }   // it sags between the poles
        tg.computeVertexNormals();
        const tarp = new THREE.Mesh(tg, tarpMat); tarp.rotation.x = -Math.PI / 2 + 0.14; tarp.position.y = 2.12; tarp.castShadow = true; g.add(tarp);
        // a plastic table and chairs underneath, a blue water drum by the post
        const tab = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.04, 16), new THREE.MeshStandardMaterial({ color: lin(0xe8e4dc), roughness: 0.5 })); tab.position.y = 0.72; g.add(tab);
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.12, 0.7, 8), tab.material); leg.position.y = 0.36; g.add(leg);
        for (const a2 of [0, 2.1, 4.2]) { const ch = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.42, 0.42), new THREE.MeshStandardMaterial({ color: lin(a2 ? 0xd8432e : 0x2f6fd6), roughness: 0.5 })); ch.scale.set(1, 0.1, 1); ch.position.set(Math.cos(a2) * 0.8, 0.44, Math.sin(a2) * 0.8); g.add(ch); }
        const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.29, 0.29, 0.88, 16), new THREE.MeshStandardMaterial({ color: lin(0x1f4fbf), roughness: 0.45 })); drum.position.set(1.85, 0.44, -1.2); drum.castShadow = true; g.add(drum);
        scene.add(g); counts.tarps++;
        if (collide) { for (const [px, pz] of [[-1.5, -1.2], [1.5, -1.2], [-1.5, 1.2], [1.5, 1.2], [1.85, -1.2]]) collide.circle(x + px * Math.cos(ry) + pz * Math.sin(ry), z - px * Math.sin(ry) + pz * Math.cos(ry), 0.12, true); collide.circle(x, z, 0.5, true); }
        break;
      }
    }
    // granite boulders on the meadow's edge (pale, lichen-spotted, half sunk)
    const bparts = [];
    for (let k = 0, n = 0; k < 300 && n < 16; k++) {
      const a = rng() * 6.28, r = 40 + rng() * 140, x = top.x + Math.cos(a) * r, z = top.z + Math.sin(a) * r, y = H(x, z);
      const sl = Math.hypot(H(x + 3, z) - y, H(x, z + 3) - y) / 3; if (sl < 0.25 || sl > 0.9 || nearAvoid(x, z, 4)) continue;   // where the meadow starts to fall away
      const sz = 1.0 + rng() * 1.8, g = new THREE.DodecahedronGeometry(1, 1), pp = g.attributes.position;
      for (let i = 0; i < pp.count; i++) { const f = 0.8 + 0.4 * Math.sin(pp.getX(i) * 3.1 + k) * Math.cos(pp.getZ(i) * 2.7 - k); pp.setXYZ(i, pp.getX(i) * f, pp.getY(i) * f * 0.7, pp.getZ(i) * f); }
      g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(x, y + sz * 0.25, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rng() * 0.4, rng() * 6, rng() * 0.4)), new THREE.Vector3(sz * (1 + rng() * 0.5), sz, sz)));
      g.computeVertexNormals(); bparts.push(g); n++; counts.boulders++;
      if (collide) collide.circle(x, z, sz * 0.95, sz < 1.4);
    }
    if (bparts.length) { const m = new THREE.Mesh(mergeG(bparts), new THREE.MeshStandardMaterial({ color: lin(0xa8a196), roughness: 0.95 })); m.castShadow = m.receiveShadow = true; scene.add(m); }

    /* ---------- the bear mural near the Gallu Devi start ---------- */
    {
      const tr = trails.galu; const s = 60, p = tr.pointAtS(s), d = tr.dirAtS(s, 6);
      for (const sd of [1, -1]) {
        const x = p.x - d.dz * 3 * sd, z = p.z + d.dx * 3 * sd; if (nearAvoid(x, z, 1.5)) continue;
        const c = document.createElement('canvas'); c.width = 1024; c.height = 512; const g = c.getContext('2d');
        g.fillStyle = '#f1ead8'; g.fillRect(0, 0, 1024, 512);
        g.fillStyle = '#7fb3d9'; g.fillRect(0, 0, 1024, 300); g.fillStyle = '#5a8a3a'; g.beginPath(); g.moveTo(0, 300); for (let i = 0; i <= 10; i++) g.lineTo(i * 102, 230 + Math.sin(i * 1.7) * 40); g.lineTo(1024, 512); g.lineTo(0, 512); g.fill();
        g.fillStyle = '#141210'; g.beginPath(); g.ellipse(560, 300, 190, 140, 0, 0, Math.PI * 2); g.fill(); g.beginPath(); g.ellipse(760, 220, 90, 80, 0, 0, Math.PI * 2); g.fill();
        g.beginPath(); g.ellipse(720, 145, 26, 26, 0, 0, Math.PI * 2); g.ellipse(810, 150, 26, 26, 0, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#e8e2d4'; g.beginPath(); g.moveTo(500, 230); g.lineTo(620, 230); g.lineTo(560, 290); g.closePath(); g.fill();   // the V on its chest
        g.fillStyle = '#8a6a48'; g.beginPath(); g.ellipse(820, 238, 34, 24, 0, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#f2c230'; g.fillRect(0, 430, 1024, 82); g.fillStyle = '#2a1a04'; g.font = '700 54px Rajdhani, sans-serif'; g.textAlign = 'center'; g.fillText('Bring back your waste with you!', 512, 488);
        const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding;
        const wall = new THREE.Mesh(new THREE.BoxGeometry(4.2, 2.2, 0.3), new THREE.MeshStandardMaterial({ color: lin(0xd8d0c0), roughness: 0.9 }));
        const y = H(x, z), ry = Math.atan2(-d.dz * sd * -1, d.dx * sd * -1); wall.position.set(x, y + 1.0, z); wall.rotation.y = Math.atan2(p.x - x, p.z - z); wall.castShadow = wall.receiveShadow = true; scene.add(wall);
        const art = new THREE.Mesh(new THREE.PlaneGeometry(4.0, 2.0), new THREE.MeshLambertMaterial({ map: t })); art.position.set(0, 0, 0.152); wall.add(art);
        if (collide) collide.rect(x, z, wall.rotation.y, 4.2, 0.3, false);
        break;
      }
    }

    /* ---------- merged frames ---------- */
    if (frameParts.length) {
      const parts = frameParts.map(f => { const g = f.geo.clone().applyMatrix4(f.m); const n = g.attributes.position.count, c = new THREE.Color(lin(f.col)), cs = new Float32Array(n * 3); for (let i = 0; i < n; i++) cs.set([c.r, c.g, c.b], i * 3); g.setAttribute('color', new THREE.BufferAttribute(cs, 3)); return g; });
      const m = new THREE.Mesh(mergeG(parts, true), new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.4, roughness: 0.6 })); m.castShadow = true; scene.add(m);
    }
    function mergeG(list, col) {
      let n = 0, ni = 0; for (const g of list) { n += g.attributes.position.count; ni += g.index ? g.index.count : g.attributes.position.count; }
      const P = new Float32Array(n * 3), N = new Float32Array(n * 3), C = col ? new Float32Array(n * 3) : null, I = new Uint32Array(ni); let o = 0, oi = 0;
      for (const g of list) { if (!g.attributes.normal) g.computeVertexNormals(); const c = g.attributes.position.count; P.set(g.attributes.position.array, o * 3); N.set(g.attributes.normal.array, o * 3); if (C) C.set(g.attributes.color.array, o * 3);
        if (g.index) { for (let i = 0; i < g.index.count; i++) I[oi + i] = g.index.array[i] + o; oi += g.index.count; } else { for (let i = 0; i < c; i++) I[oi + i] = o + i; oi += c; } o += c; }
      const out = new THREE.BufferGeometry(); out.setAttribute('position', new THREE.BufferAttribute(P, 3)); out.setAttribute('normal', new THREE.BufferAttribute(N, 3)); if (C) out.setAttribute('color', new THREE.BufferAttribute(C, 3)); out.setIndex(new THREE.BufferAttribute(I, 1)); return out;
    }
    return {
      counts, fenceAt,
      update(cam, time) {
        for (const b of boards) {
          const d2 = (b.x - cam.x) ** 2 + (b.z - cam.z) ** 2; b.g.visible = d2 < 300 * 300;
          if (d2 < 60 * 60 && !b.drawn) { b.drawn = true; b.fm.material = drawEco(b.e); }
          else if (d2 > 100 * 100 && b.drawn) { b.drawn = false; b.fm.material.map.dispose(); b.fm.material.dispose(); b.fm.material = ecoBlank; }
        }
        for (const f of flags) {   // the flag ripples in the ridge wind
          if ((f.position.x - cam.x) ** 2 + (f.position.z - cam.z) ** 2 > 200 * 200) continue;
          const p = f.geometry.attributes.position, b = f.userData.base;
          for (let i = 0; i < p.count; i++) { const x = b[i * 3]; p.setZ(i, Math.sin(time * 6 - x * 6) * 0.12 * x); }
          p.needsUpdate = true; f.rotation.y = 0.6 + Math.sin(time * 0.3) * 0.3;
        }
      }
    };
  }
};
