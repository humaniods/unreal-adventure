'use strict';
/* Trail signs and selfie points for the Triund walk test.
   Along both routes, beside the path (never on it, on the flatter side):
   - every 50 m a small marker on a post: how far to Triund top, and a short line (keep going / keep Triund clean)
   - every 500 m a forest-department style board: distance left to Triund top and the height here; its back,
     for hikers coming down, gives the distance back to the start
   - between them, alternately, a motivation board and a "keep Triund clean" board
   - near the top, boards pointing to the camping ground
   - selfie points at the open viewpoints: a sign, a stone slab to stand on and an "I love Triund" board; the game
     takes the photo (P) with the view behind you
   Boards are drawn on a canvas only when you come near and freed when you walk on, so the 1 GB GPU holds a few
   at a time. Text is large and high-contrast so it reads from the trail.
   Interface: build(o) -> { update(cam), selfieAt(x, z), spots, list, counts } */
window.TriundSigns = {
  build(o) {
    const { THREE, scene, H, trails, collide, blocked, camp, isStep } = o;
    const lin = c => new THREE.Color(c).convertSRGBToLinear();
    const boards = [], spots = [], list = [];
    const MOTIVATE = [
      ['Every step', 'takes you higher.'], ['Slow and steady', 'climbs the mountain.'], ['Breathe deep.', 'Mountain air is free.'],
      ['The view from the top', 'is worth every step.'], ['You have come so far.', 'Keep going!'], ['Rest when you need to.', 'The mountain will wait.'],
      ['Look back:', 'see how high you are!'], ['Strong legs, happy heart.', 'Keep climbing.'], ['Almost there.', 'The meadow is waiting.']];
    const CLEAN = [
      ['Keep Triund clean', 'Carry your waste back down.'], ['Leave only footprints', 'Take only photos.'], ['No plastic on the trail', 'Use the bins at the stalls.'],
      ['Protect the forest', 'Do not break branches.'], ['Respect the mountain', 'Keep music low, carry litter back.']];
    const STYLE = {
      km: { bg: '#5b2a1f', fg: '#f6ead2', sub: '#f2d9a8', w: 1.5, h: 0.95 },          // the forest department's maroon wooden boards
      motivate: { bg: '#f2c230', fg: '#2a1a04', sub: '#4a3008', w: 1.7, h: 0.85 },
      clean: { bg: '#1f5a8a', fg: '#ffffff', sub: '#cfe6ff', w: 1.7, h: 0.85 },
      camp: { bg: '#7a3418', fg: '#fff3e0', sub: '#ffd9b0', w: 1.7, h: 0.9 },
      selfie: { bg: '#b8285e', fg: '#ffffff', sub: '#ffd6e6', w: 1.8, h: 0.9 },
      mark: { bg: '#5b2a1f', fg: '#f6ead2', sub: '#f2d9a8', w: 1.05, h: 0.6, y: 1.05, post: 1 }
    };
    const LINES = ['Every step takes you higher', 'Breathe deep, walk slow', 'Keep Triund clean', 'Carry your waste back down', 'You are doing great',
      'Leave only footprints', 'Drink some water', 'Look back at the valley!', 'No plastic on the trail', 'Rest when you need to', 'Stay on the trail',
      'Do not feed the monkeys', 'Small steps, steady breath', 'Respect the mountain', 'Keep music low on the trail', 'The top is worth it'];
    const km2 = m => m >= 1000 ? (m / 1000).toFixed(2) + ' km' : Math.round(m / 10) * 10 + ' m';
    const frameParts = [], miss = [];   // every board's posts and edge, merged into one mesh at the end (one draw call)
    const km = m => m >= 1000 ? (m / 1000).toFixed(1) + ' km' : Math.round(m / 10) * 10 + ' m';
    const BLANK = {}, PLANE = {}, blank = st => BLANK[st.bg] || (BLANK[st.bg] = new THREE.MeshLambertMaterial({ color: lin(st.bg) }));

    // a free spot beside the trail at s: the side whose ground is nearest the path's height, off steps and stalls
    function beside(tr, s, off, shifts, maxDh, onSteps) {
      for (const ds of shifts || [0, 12, -12, 25, -25]) {
        const ss = Math.max(5, Math.min(tr.total - 5, s + ds)), p = tr.pointAtS(ss), d = tr.dirAtS(ss, 8);
        if (!onSteps && isStep && isStep(tr.id, ss)) continue;
        let best = null;
        for (const sd of [1, -1]) {
          const x = p.x - d.dz * off * sd, z = p.z + d.dx * off * sd, dh = Math.abs(H(x, z) - p.h);
          if ((blocked && blocked(x, z)) || dh > (maxDh || 1.0)) continue;
          if (!best || dh < best.dh) best = { x, z, dh, sd, s: ss, p, d };
        }
        if (best && !boards.some(b => (b.x - best.x) ** 2 + (b.z - best.z) ** 2 < 36)) return best;
      }
      return null;
    }
    // a two-post board facing walkers coming up (its back faces those going down)
    function board(at, kind, front, back, extra) {
      const st = STYLE[kind], g = new THREE.Group(), gy = H(at.x, at.z), y = st.post ? Math.max(gy, at.p.h - 0.5) : Math.min(gy, at.p.h), drop = Math.max(0, y - gy);   // a marker on a bank stands on it; below the path its post is longer
      g.position.set(at.x, y, at.z); g.rotation.y = Math.atan2(-at.d.dx, -at.d.dz);   // front faces down the trail
      const by = st.y || 1.35, ph = by + st.h;
      g.updateMatrix();
      const part = (geo, x, yy, z, col) => frameParts.push({ geo, m: new THREE.Matrix4().multiplyMatrices(g.matrix, new THREE.Matrix4().makeTranslation(x, yy, z)), col });
      for (const sx of st.post ? [0] : [-st.w / 2 + 0.08, st.w / 2 - 0.08]) part(new THREE.CylinderGeometry(0.045, 0.055, ph + 0.4 + drop, 8), sx, (ph - 0.4 - drop) / 2, -0.05, 0x5a4330);
      part(new THREE.BoxGeometry(st.w + 0.08, st.h + 0.08, 0.05), 0, by + st.h / 2, 0, 0x2a2420);
      const fm = new THREE.Mesh(PLANE[kind] || (PLANE[kind] = new THREE.PlaneGeometry(st.w, st.h)), blank(st)); fm.position.set(0, by + st.h / 2, 0.027); g.add(fm);
      const bm = new THREE.Mesh(PLANE[kind], blank(st)); bm.position.set(0, by + st.h / 2, -0.027); bm.rotation.y = Math.PI; g.add(bm);
      if (extra) extra(g, st);
      scene.add(g);
      if (collide) for (const sx of st.post ? [0] : [-1, 1]) collide.circle(at.x + Math.cos(g.rotation.y) * sx * st.w / 2, at.z - Math.sin(g.rotation.y) * sx * st.w / 2, 0.1, true);
      const b = { g, fm, bm, kind, front, back, st, x: at.x, z: at.z, drawn: false };
      boards.push(b); list.push({ kind, x: at.x, z: at.z, text: front[0] }); return b;
    }
    function draw(lines, st) {
      const W = 512, Hc = Math.round(512 * st.h / st.w), c = document.createElement('canvas'); c.width = W; c.height = Hc;
      const g = c.getContext('2d'); g.fillStyle = st.bg; g.fillRect(0, 0, W, Hc);
      if (st.bg === '#5b2a1f') {   // painted wood: grain shows through the paint, and the edges are weathered
        for (let i = 0; i < 40; i++) { const y = Math.random() * Hc; g.strokeStyle = `rgba(${Math.random() < 0.5 ? '30,12,8' : '120,70,50'},${0.08 + Math.random() * 0.1})`; g.lineWidth = 1 + Math.random() * 2;
          g.beginPath(); g.moveTo(0, y); for (let x = 0; x <= W; x += 32) g.lineTo(x, y + Math.sin(x * 0.01 + i) * 3); g.stroke(); }
      }
      g.strokeStyle = st.fg; g.lineWidth = 6; g.strokeRect(12, 12, W - 24, Hc - 24);
      g.textAlign = 'center'; g.textBaseline = 'middle';
      const n = lines.length, lh = (Hc - 40) / n;
      lines.forEach((l, i) => {
        const big = i === 0 ? 1 : 0, size = big ? Math.min(78, lh * 0.82) : Math.min(52, lh * 0.66);
        g.font = `${big ? 700 : 600} ${Math.round(size)}px Rajdhani, Hind, sans-serif`;
        let fs = size; while (g.measureText(l).width > W - 60 && fs > 18) { fs -= 2; g.font = `${big ? 700 : 600} ${Math.round(fs)}px Rajdhani, Hind, sans-serif`; }
        g.fillStyle = big ? st.fg : st.sub; g.fillText(l, W / 2, 20 + lh * (i + 0.5));
      });
      const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; t.anisotropy = 8;
      return new THREE.MeshLambertMaterial({ map: t });
    }

    /* ---------- distance boards, motivation and clean-trail boards ---------- */
    let mi = 0, ci = 0;
    for (const id of Object.keys(trails)) {
      const tr = trails[id], start = id === 'shiva' ? 'Bhagsu' : 'Gallu Devi';
      for (let s = 500; s < tr.total - 150; s += 500) {
        const at = beside(tr, s, 2.3); if (!at) continue;
        const left = tr.total - at.s, alt = Math.round(at.p.h);
        board(at, 'km', [km(left).toUpperCase() + ' TO GO', 'to Triund top · ' + alt.toLocaleString('en-IN') + ' m here', 'Walked ' + km(at.s)], ['TO ' + start.toUpperCase() + '  ' + km(at.s), 'Triund top is ' + km(left) + ' up', alt.toLocaleString('en-IN') + ' m']);
      }
      for (let s = 250; s < tr.total - 100; s += 500) {
        const at = beside(tr, s, 2.3); if (!at) continue;
        const k = Math.round(s / 500) % 2;
        if (k === 0) { const q = MOTIVATE[mi++ % MOTIVATE.length]; board(at, 'motivate', q, q); }
        else { const q = CLEAN[ci++ % CLEAN.length]; board(at, 'clean', q, q); }
      }
      // every 50 m between them: a small marker
      let li = id === 'shiva' ? 5 : 0;
      for (let s = 50; s < tr.total - 60; s += 50) {
        if (s % 250 === 0) continue;
        if (Math.abs(s - (tr.total - 420)) < 25 || Math.abs(s - (tr.total - 160)) < 25) continue;
        const at = beside(tr, s, 1.8, [0, 5, -5, 10, -10]) || beside(tr, s, 1.6, [0, 5, -5, 10, -10, 15, -15], 2.4) || beside(tr, s, 1.5, [0, 5, -5, 10, -10, 15, -15], 3.0, true); if (!at) { miss.push([id, s]); continue; }
        const left = tr.total - at.s, line = LINES[li++ % LINES.length];
        board(at, 'mark', ['TRIUND TOP  ' + km2(left), line], [start + '  ' + km2(at.s), line === 'Keep Triund clean' ? line : 'Take it slow going down']);
      }
      // the camping ground at the top
      if (camp) for (const back of [420, 160]) {
        const at = beside(tr, tr.total - back, 2.3); if (!at) continue;
        const dist = Math.hypot(camp.x - at.p.x, camp.z - at.p.z);
        board(at, 'camp', ['CAMPING GROUND  ' + km(dist), 'Tents and sleeping bags for hire', 'at the top of the trail'], ['Camping ground', 'back up the trail, ' + km(dist)]);
      }
    }

    /* ---------- selfie points ---------- */
    // open spots with a long view: where the ground falls away steeply on one side of the path. The slab is on
    // the open side, the view behind whoever stands on it.
    const want = { galu: [0.52, 0.8, 0.97], shiva: [0.2, 0.62, 0.93] };
    const slabMat = new THREE.MeshStandardMaterial({ color: lin(0x8f8b84), roughness: 0.95 });
    for (const id of Object.keys(trails)) {
      const tr = trails[id]; if (!want[id]) continue;
      for (const f of want[id]) {
        // search ±150 m around the wanted place for the biggest drop beside the path
        let best = null;
        for (let s = tr.total * f - 150; s <= tr.total * f + 150; s += 15) {
          if (s < 20 || s > tr.total - 15 || (isStep && isStep(id, s))) continue;
          const p = tr.pointAtS(s), d = tr.dirAtS(s, 8);
          for (const sd of [1, -1]) {
            const nx = -d.dz * sd, nz = d.dx * sd, x = p.x + nx * 2.6, z = p.z + nz * 2.6;
            if ((blocked && blocked(x, z)) || Math.abs(H(x, z) - p.h) > 0.6) continue;
            const drop = p.h - H(p.x + nx * 40, p.z + nz * 40);
            if (!best || drop > best.drop) best = { s, p, d, x, z, nx, nz, drop };
          }
        }
        if (!best || best.drop < 8) continue;
        const sy = H(best.x, best.z);
        const slab = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.6, 0.12, 14), slabMat); slab.position.set(best.x, sy + 0.02, best.z); slab.receiveShadow = true; scene.add(slab);
        const at = beside(tr, best.s + 4, 2.3) || { x: best.x, z: best.z, p: best.p, d: best.d };
        board(at, 'selfie', ['SELFIE POINT', 'Stand on the stone and press P', 'View: ' + (best.drop > 25 ? 'the Kangra valley far below' : 'the valley and the forest')], ['SELFIE POINT', 'Press P on the stone']);
        spots.push({ x: best.x, z: best.z, y: sy + 0.08, vx: best.nx, vz: best.nz, trail: id, s: best.s, drop: best.drop });
        list.push({ kind: 'selfieSpot', x: best.x, z: best.z, text: 'Selfie point' });
      }
    }

    {
      const pos = [], nor = [], col = [], idx = []; let base = 0; const nm = new THREE.Matrix3(), v = new THREE.Vector3(), c = new THREE.Color();
      for (const { geo, m, col: cc } of frameParts) {
        const P = geo.attributes.position, N = geo.attributes.normal; nm.getNormalMatrix(m); c.copy(lin(cc));
        for (let i = 0; i < P.count; i++) { v.fromBufferAttribute(P, i).applyMatrix4(m); pos.push(v.x, v.y, v.z); v.fromBufferAttribute(N, i).applyMatrix3(nm).normalize(); nor.push(v.x, v.y, v.z); col.push(c.r, c.g, c.b); }
        for (const i of geo.index.array) idx.push(i + base); base += P.count; geo.dispose();
      }
      const ge = new THREE.BufferGeometry(); ge.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); ge.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); ge.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); ge.setIndex(idx);
      const fr = new THREE.Mesh(ge, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 })); fr.castShadow = true; fr.receiveShadow = true; scene.add(fr);
    }
    return {
      spots, list, miss, counts: { boards: boards.length, marks: boards.filter(b => b.kind === 'mark').length, selfie: spots.length },
      update(cam) {
        for (const b of boards) {
          const d2 = (b.x - cam.x) ** 2 + (b.z - cam.z) ** 2;
          const mk = b.kind === 'mark';
          b.g.visible = d2 < (mk ? 220 * 220 : 400 * 400);
          if (d2 < (mk ? 55 * 55 : 70 * 70) && !b.drawn) { b.drawn = true; b.fm.material = draw(b.front, b.st); b.bm.material = draw(b.back, b.st); }
          else if (d2 > (mk ? 90 * 90 : 120 * 120) && b.drawn) { b.drawn = false; for (const m of [b.fm, b.bm]) { m.material.map.dispose(); m.material.dispose(); m.material = blank(b.st); } }
        }
      },
      // the selfie point within reach of (x, z), if any
      selfieAt(x, z) { return spots.find(p => Math.hypot(p.x - x, p.z - z) < 2.2) || null; }
    };
  }
};
