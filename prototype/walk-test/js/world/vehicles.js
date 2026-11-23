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
    Object.assign(MAT, { dash: std(0x2a2b2d, 0.85), seat: std(0x8a8172, 0.95), card: std(0x9a9486, 0.9), liner: std(0xcfc8b8, 0.95), floor: std(0x1e1d1b, 0.95),
      dial: new THREE.MeshStandardMaterial({ color: lin(0xd8dde0), emissive: lin(0x2a3236), roughness: 0.4 }), steel: std(0xb8bcc0, 0.45, 0.6),
      pants: std(0x2d3038, 0.9), khaki: std(0xb4a274, 0.9), canvas: std(0x1c1d1c, 0.95), autoG: std(0x1f7a3a, 0.4, 0.15), autoY: std(0xf0c419, 0.45, 0.1),
      idol: std(0xe0681c, 0.5), marigold: std(0xf2a516, 0.7) });
    MAT.glass.opacity = 0.42;
    for (const [k, e] of [['seat', 0x231f19], ['card', 0x24221d], ['liner', 0x5e5a50], ['dash', 0x0d0d0e], ['floor', 0x0a0a09]]) MAT[k].emissive = lin(e);   // you look out through it from the back seat
    const box = (w, h, d, m) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    // a prism from a side outline (z forward, y up), `width` across the car (x), centred on x = 0
    function extrude(pts, width) {
      const sh = new THREE.Shape(); pts.forEach(([z, y], i) => i ? sh.lineTo(z, y) : sh.moveTo(z, y));
      const g = new THREE.ExtrudeGeometry(sh, { depth: width, bevelEnabled: false });
      g.translate(0, 0, -width / 2); g.rotateY(-Math.PI / 2);   // shape x (length) -> world z (forward)
      g.computeVertexNormals(); return g;
    }
    // a limb (cylinder) from a to b
    const _ya = new THREE.Vector3(0, 1, 0);
    function limb(a, b, r, m) {
      const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), d = B.clone().sub(A), L = d.length();
      const c = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.9, L, 7), m);
      c.position.copy(A).add(B).multiplyScalar(0.5); c.quaternion.setFromUnitVectors(_ya, d.normalize()); return c;
    }

    /* ---- the Indian hill taxi: a boxy MUV of the Bolero / Sumo kind. Body frame: +x is the car's LEFT (kerb side,
       where you get in), +z forward, y up from the ground under the wheels. Right-hand drive: the driver sits at -x. ---- */
    const MUV = { W: 0.87, FZ: 1.32, RZ: -1.36, TRK: 0.725, R: 0.36, ARCH: 0.44, SILL: 0.45, BELT: 1.24, ROOF: 1.84, NOSE: 0.95, FRONT: 1.97, BACK: -1.95 };
    // bottom edge of a side panel at z: the sill, cut round the two wheel arches
    const sillAt = z => { for (const c of [MUV.FZ, MUV.RZ]) { const d = z - c; if (Math.abs(d) < MUV.ARCH) return MUV.R + Math.sqrt(MUV.ARCH * MUV.ARCH - d * d); } return MUV.SILL; };
    // a side outline from z0 to z1 with the arches cut out of its bottom and topFn(z) along the top
    function sideOutline(z0, z1, topFn) {
      const pts = [], n = Math.max(2, Math.ceil((z1 - z0) / 0.04));
      for (let i = 0; i <= n; i++) { const z = z0 + (z1 - z0) * i / n; pts.push([z, sillAt(z)]); }
      for (let i = n; i >= 0; i--) { const z = z0 + (z1 - z0) * i / n; pts.push([z, topFn(z)]); }
      return pts;
    }
    const bonnetY = z => 1.15 - (z - MUV.NOSE) * 0.06;
    const GEO = {
      // the nose (engine bay and front wings), solid, arches cut
      nose: extrude(sideOutline(MUV.NOSE, MUV.FRONT, z => z > 1.93 ? 1.08 - (z - 1.93) * 1.5 : bonnetY(z)), 1.74),
      tyre: new THREE.CylinderGeometry(0.36, 0.36, 0.235, 22).rotateZ(Math.PI / 2),
      rim: new THREE.CylinderGeometry(0.22, 0.22, 0.245, 14).rotateZ(Math.PI / 2),
      hub: new THREE.CylinderGeometry(0.075, 0.075, 0.26, 10).rotateZ(Math.PI / 2),
      spare: new THREE.CylinderGeometry(0.37, 0.37, 0.24, 22).rotateX(Math.PI / 2),
      // a black plastic flare round a wheel arch
      flare: (() => { const s = new THREE.Shape(); s.absarc(0, 0, 0.53, 0, Math.PI, false); s.lineTo(-0.45, 0); s.absarc(0, 0, 0.45, Math.PI, 0, true); s.lineTo(0.53, 0);
        const g = new THREE.ExtrudeGeometry(s, { depth: 0.07, bevelEnabled: false }); g.translate(0, 0, -0.035); g.rotateY(-Math.PI / 2); return g; })(),
      aTyre: new THREE.CylinderGeometry(0.2, 0.2, 0.1, 16).rotateZ(Math.PI / 2),
      aRim: new THREE.CylinderGeometry(0.12, 0.12, 0.11, 10).rotateZ(Math.PI / 2)
    };
    // a side panel (door skin) from z0 to z1, x = its centre
    const sidePanel = (z0, z1, top, m) => new THREE.Mesh(extrude(sideOutline(z0, z1, () => top), 0.04), m);
    // side glass from z0 to z1 (its front edge follows the A pillar)
    function sideGlass(z0, z1) {
      const fb = Math.min(z1, 0.92), ft = Math.min(z1, 0.77);
      return new THREE.Mesh(extrude([[z0, MUV.BELT], [fb, MUV.BELT], [ft, MUV.ROOF - 0.04], [z0, MUV.ROOF - 0.04]], 0.016), MAT.glass);
    }
    function plateTex(text, yellow) {
      const c = document.createElement('canvas'); c.width = 256; c.height = 64; const x = c.getContext('2d');
      x.fillStyle = yellow ? '#f2c230' : '#f4f4f0'; x.fillRect(0, 0, 256, 64); x.strokeStyle = '#111'; x.lineWidth = 5; x.strokeRect(3, 3, 250, 58);
      x.fillStyle = '#111'; x.font = '700 40px Rajdhani, Arial, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(text, 128, 34);
      const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; return t;
    }
    // a seated person, origin at the hips on the seat cushion, facing +z. hands: where the hands go (body-relative
    // to the hips) or null for hands in the lap
    const SHIRT = {}; const shirtMat = c => SHIRT[c] || (SHIRT[c] = std(c, 0.9));
    function seated(shirt, hands, pants) {
      const g = new THREE.Group(), sm = shirtMat(shirt), pm = pants || MAT.pants;
      for (const sx of [-1, 1]) {
        g.add(limb([sx * 0.1, 0.06, -0.02], [sx * 0.11, 0.08, 0.42], 0.075, pm));              // thigh
        g.add(limb([sx * 0.11, 0.08, 0.42], [sx * 0.12, -0.26, 0.5], 0.06, pm));               // shin
        const foot = box(0.1, 0.07, 0.24, MAT.black); foot.position.set(sx * 0.12, -0.27, 0.58); g.add(foot);
      }
      const hip = box(0.36, 0.16, 0.26, pm); hip.position.set(0, 0.06, -0.02); g.add(hip);
      const torso = box(0.4, 0.5, 0.24, sm); torso.position.set(0, 0.36, -0.06); torso.rotation.x = -0.08; g.add(torso);
      const neck = limb([0, 0.6, -0.07], [0, 0.68, -0.06], 0.045, MAT.skin); g.add(neck);
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.105, 12, 10), MAT.skin); head.position.set(0, 0.77, -0.05); head.scale.set(1, 1.12, 1.05); g.add(head);
      const hair = new THREE.Mesh(new THREE.SphereGeometry(0.112, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), MAT.black); hair.position.set(0, 0.79, -0.065); hair.scale.set(1, 1.05, 1.08); g.add(hair);
      for (const sx of [-1, 1]) {
        const sh = [sx * 0.21, 0.56, -0.07], hd = hands ? [hands[0] * sx + (hands[3] || 0), hands[1], hands[2]] : [sx * 0.13, 0.14, 0.3];
        const el = [(sh[0] + hd[0]) / 2 + sx * 0.05, Math.min(sh[1], hd[1]) - 0.06, (sh[2] + hd[2]) / 2 - 0.02];
        g.add(limb(sh, el, 0.05, sm)); g.add(limb(el, hd, 0.042, MAT.skin));
        const hand = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), MAT.skin); hand.position.set(...hd); g.add(hand);
      }
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
    // on the ground at (x, z) heading yaw: body pitched and rolled to where its wheels touch (C: axle z, half tracks)
    function placer(g, body, wheels, C) {
      return function place(x, z, yaw, steer) {
        g.position.set(x, 0, z); g.rotation.y = yaw;
        const c = Math.cos(yaw), s = Math.sin(yaw), at = (lx, lz) => H(x + lx * c + lz * s, z - lx * s + lz * c);
        const fl = at(C.fx, C.fz), fr = C.fx ? at(-C.fx, C.fz) : fl, rl = at(C.rx, C.rz), rr = at(-C.rx, C.rz);
        const front = (fl + fr) / 2, rear = (rl + rr) / 2, left = C.fx ? (fl + rl) / 2 : rl, right = C.fx ? (fr + rr) / 2 : rr;
        g.position.y = rear + (front - rear) * (0 - C.rz) / (C.fz - C.rz);
        const pitch = Math.atan2(front - rear, C.fz - C.rz), roll = Math.atan2(right - left, 2 * C.rx);
        body.rotation.set(-pitch, 0, -roll);
        for (const w of wheels) if (w.front) w.piv.rotation.y = steer || 0;
      };
    }
    function wheelAt(body, wheels, x, y, z, front, tyreG, rimG, spokes) {
      const piv = new THREE.Group(); piv.position.set(x, y, z);
      const spin = new THREE.Group(); piv.add(spin);
      const t = new THREE.Mesh(tyreG, MAT.tyre); t.castShadow = true; spin.add(t); spin.add(new THREE.Mesh(rimG, MAT.steel));
      const hub = new THREE.Mesh(GEO.hub, MAT.black); hub.scale.set(rimG === GEO.aRim ? 0.45 : 1, 1, 1); spin.add(hub);
      for (let k = 0; k < (spokes || 0); k++) { const h2 = new THREE.Group(); h2.rotation.x = k * Math.PI * 2 / spokes; const sp = box(0.25, 0.05, 0.03, MAT.black); sp.position.set(0, 0.15, 0); h2.add(sp); spin.add(h2); }   // the holes in a steel wheel
      wheels.push({ piv, spin, front });
    }

    /* the taxi / private car: opts { color, taxi (yellow plates, roof sign and carrier), driver, shirt } */
    function makeCar(opts) {
      opts = opts || {};
      const g = new THREE.Group(), col = opts.color || 0xf2f2ee, bm = bodyMat(col), M = MUV, W = M.W;
      const body = new THREE.Group(); g.add(body);
      const add = (m, x, y, z, rx, ry, rz) => { if (x !== undefined) m.position.set(x, y, z); if (rx || ry || rz) m.rotation.set(rx || 0, ry || 0, rz || 0); body.add(m); return m; };
      // ---- outside: the nose, the sides (open shell: you can see in, and out from the seats), roof, tail
      add(new THREE.Mesh(GEO.nose, bm));
      add(box(1.72, 0.03, 0.12, bm), 0, 1.165, M.NOSE - 0.02);                                         // cowl under the windscreen
      add(sidePanel(M.BACK, M.NOSE, M.BELT, bm), -(W - 0.02), 0, 0);                                    // right side, whole
      add(sidePanel(M.BACK, -0.95, M.BELT, bm), W - 0.02, 0, 0); add(sidePanel(-0.02, M.NOSE, M.BELT, bm), W - 0.02, 0, 0);   // left: round the rear door
      add(sideGlass(M.BACK + 0.05, M.NOSE), -(W - 0.015), 0, 0);
      add(sideGlass(M.BACK + 0.05, -0.95), W - 0.015, 0, 0); add(sideGlass(-0.02, M.NOSE), W - 0.015, 0, 0);
      const wsL = Math.hypot(0.19, 0.64), wsA = -Math.atan2(0.19, 0.64);                                  // windscreen: nearly upright
      add(box(1.62, wsL, 0.016, MAT.glass), 0, 1.155 + 0.32, M.NOSE - 0.095, wsA);
      for (const sx of [-1, 1]) add(box(0.08, wsL + 0.04, 0.08, bm), sx * 0.83, 1.475, M.NOSE - 0.1, wsA);                 // A pillars
      add(box(1.74, 0.08, 0.1, bm), 0, M.ROOF - 0.06, 0.77);                                            // windscreen header
      add(box(1.74, 0.05, 0.76 - M.BACK, bm), 0, M.ROOF, (0.76 + M.BACK) / 2);                          // roof
      for (const sx of [-1, 1]) {
        add(box(0.03, 0.03, 0.76 - M.BACK, MAT.trim), sx * 0.875, M.ROOF - 0.01, (0.76 + M.BACK) / 2);   // rain gutter
        add(box(0.06, M.ROOF - M.BELT, 0.11, MAT.black), sx * (W - 0.01), (M.ROOF + M.BELT) / 2, -0.02);  // B pillar
        add(box(0.06, M.ROOF - M.BELT, 0.14, bm), sx * (W - 0.01), (M.ROOF + M.BELT) / 2, -0.97);         // C pillar
        add(box(0.06, M.ROOF - M.BELT, 0.12, bm), sx * (W - 0.01), (M.ROOF + M.BELT) / 2, M.BACK + 0.05); // D pillar
        add(box(0.02, M.ROOF - M.BELT - 0.04, 0.025, MAT.black), sx * (W + 0.005), (M.ROOF + M.BELT) / 2 - 0.02, 0.42);   // front door window divider
        for (const z of [M.NOSE - 0.03, -0.02, -0.95]) add(box(0.012, M.BELT - 0.5, 0.012, MAT.black), sx * (W + 0.002), (M.BELT + 0.5) / 2, z);   // door shut lines
        add(box(0.02, 0.035, 0.15, MAT.black), sx * (W + 0.01), 1.08, 0.12);                             // front door handle
        add(box(0.03, 0.03, 0.12, MAT.black), sx * 0.93, 1.33, 0.86);                                     // mirror arm
        add(box(0.06, 0.2, 0.15, MAT.black), sx * 1.0, 1.35, 0.84);                                       // mirror
        add(box(0.03, 0.14, 1.72, MAT.black), sx * (W + 0.012), 0.52, -0.04);                             // black cladding along the sill
        add(box(0.16, 0.035, 1.6, MAT.trim), sx * 0.95, 0.4, -0.04);                                      // side step
        for (const z of [M.FZ, M.RZ]) add(new THREE.Mesh(GEO.flare, MAT.black), sx * (W + 0.03), M.R, z); // arch flares
        add(box(0.08, 0.06, 0.06, MAT.amber), sx * (W + 0.02), 1.0, 1.35);                                // side repeater
      }
      // the front: flat face, slatted grille, square headlamps, black bumper with fog lamps
      add(box(0.84, 0.3, 0.03, MAT.black), 0, 0.88, M.FRONT + 0.005);
      for (let i = 0; i < 5; i++) add(box(0.8, 0.022, 0.03, MAT.chrome), 0, 0.77 + i * 0.055, M.FRONT + 0.02);
      for (const sx of [-1, 1]) {
        add(box(0.3, 0.24, 0.03, MAT.chrome), sx * 0.62, 0.88, M.FRONT + 0.005); add(box(0.25, 0.19, 0.03, MAT.head), sx * 0.62, 0.88, M.FRONT + 0.015);
        add(box(0.12, 0.08, 0.03, MAT.amber), sx * 0.62, 0.7, M.FRONT + 0.01);
        add(box(0.1, 0.07, 0.03, MAT.head), sx * 0.6, 0.5, M.FRONT + 0.115);
      }
      add(box(1.8, 0.22, 0.2, MAT.black), 0, 0.52, M.FRONT + 0.01);                                     // front bumper
      add(box(1.2, 0.1, 0.5, MAT.black), 0, 0.42, M.FRONT - 0.3);                                       // sump guard
      // the tail: side-hinged tailgate with its window, the spare wheel on it, lamps up the corners
      add(box(1.74, M.BELT - M.SILL, 0.04, bm), 0, (M.BELT + M.SILL) / 2, M.BACK);
      add(box(1.6, M.ROOF - M.BELT - 0.08, 0.016, MAT.glass), 0, (M.ROOF + M.BELT) / 2 - 0.02, M.BACK - 0.005);
      add(box(1.74, 0.05, 0.05, bm), 0, M.BELT, M.BACK); add(box(0.012, M.ROOF - M.SILL, 0.012, MAT.black), 0.7, (M.ROOF + M.SILL) / 2, M.BACK - 0.025);   // hinge line
      add(box(0.03, 0.15, 0.03, MAT.black), -0.75, 1.0, M.BACK - 0.03);                                // handle
      for (const sx of [-1, 1]) { add(box(0.1, 0.34, 0.05, MAT.tail), sx * 0.82, 1.0, M.BACK - 0.01); add(box(0.1, 0.08, 0.05, MAT.amber), sx * 0.82, 0.78, M.BACK - 0.01); }
      add(new THREE.Mesh(GEO.spare, MAT.tyre), 0, 0.98, M.BACK - 0.15); add(box(0.5, 0.5, 0.25, MAT.black), 0, 0.98, M.BACK - 0.15);   // spare wheel in its cover
      add(box(1.8, 0.2, 0.16, MAT.black), 0, 0.52, M.BACK - 0.06);                                     // rear bumper
      // number plates: yellow for taxis (commercial), white for private cars; HP is Himachal
      const plM = new THREE.MeshBasicMaterial({ map: plateTex((opts.taxi ? 'HP 68 T ' : 'HP 39 C ') + (plateN++ % 9000 + 1000), !!opts.taxi) });
      add(new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.125), plM), 0, 0.53, M.FRONT + 0.115);
      add(new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.125), plM), 0, 0.68, M.BACK - 0.025, 0, Math.PI);
      // roof rails (and on a taxi the luggage carrier every hill taxi has, and the yellow TAXI board)
      for (const sx of [-1, 1]) { add(box(0.05, 0.05, 2.3, MAT.black), sx * 0.74, M.ROOF + 0.08, -0.6); for (const z of [0.45, -1.7]) add(box(0.05, 0.08, 0.05, MAT.black), sx * 0.74, M.ROOF + 0.04, z); }
      let sign = null;
      if (opts.taxi) {
        for (const z of [0.3, -0.3, -0.9, -1.5]) add(box(1.5, 0.03, 0.04, MAT.black), 0, M.ROOF + 0.11, z);
        const sc = document.createElement('canvas'); sc.width = 256; sc.height = 64; const sx = sc.getContext('2d');
        sx.fillStyle = '#f2c230'; sx.fillRect(0, 0, 256, 64); sx.fillStyle = '#111'; sx.font = '700 46px Rajdhani, Arial, sans-serif'; sx.textAlign = 'center'; sx.textBaseline = 'middle'; sx.fillText('TAXI', 128, 34);
        const st = new THREE.CanvasTexture(sc); st.encoding = THREE.sRGBEncoding;
        sign = new THREE.Group(); sign.position.set(0, M.ROOF + 0.22, 0.55); body.add(sign);
        sign.add(box(0.62, 0.17, 0.2, std(0xf2c230, 0.5)));
        for (const sz of [1, -1]) { const f = new THREE.Mesh(new THREE.PlaneGeometry(0.58, 0.14), new THREE.MeshBasicMaterial({ map: st })); f.position.z = sz * 0.101; if (sz < 0) f.rotation.y = Math.PI; sign.add(f); }
      }
      // ---- inside: floor, footwell, dashboard and instruments, steering wheel on the right, seats, headliner, door cards
      add(box(1.66, 0.04, M.NOSE - M.BACK - 0.06, MAT.floor), 0, 0.53, (M.NOSE + M.BACK) / 2);
      add(box(1.66, 0.55, 0.04, MAT.floor), 0, 0.8, M.NOSE - 0.04);                                     // firewall
      add(box(1.66, 0.22, 0.42, MAT.dash), 0, 0.99, 0.74); add(box(1.66, 0.05, 0.3, MAT.dash), 0, 1.115, 0.82, -0.15);   // dashboard and its top
      add(box(0.44, 0.1, 0.18, MAT.dash), -0.4, 1.15, 0.62);                                             // instrument hood
      for (const dx of [-0.08, 0.08]) add(new THREE.Mesh(new THREE.CircleGeometry(0.055, 18), MAT.dial), -0.4 + dx, 1.08, 0.525, 0, Math.PI);   // speedo, rev counter
      add(box(0.32, 0.34, 0.14, MAT.dash), 0, 0.89, 0.58); add(box(0.2, 0.06, 0.02, MAT.dial), 0, 0.95, 0.505);   // centre console, radio
      add(limb([-0.4, 0.93, 0.75], [-0.4, 1.05, 0.6], 0.03, MAT.black));                          // steering column
      add(new THREE.Mesh(new THREE.TorusGeometry(0.19, 0.022, 8, 24), MAT.black), -0.4, 1.08, 0.58, -0.45);
      add(box(0.1, 0.08, 0.05, MAT.black), -0.4, 1.08, 0.585, -0.45);
      add(limb([-0.05, 0.56, 0.4], [-0.08, 0.86, 0.36], 0.012, MAT.black)); add(new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6), MAT.black), -0.08, 0.87, 0.36);   // gear lever
      add(box(0.05, 0.09, 0.05, MAT.idol), 0.1, 1.19, 0.86); add(new THREE.Mesh(new THREE.TorusGeometry(0.04, 0.012, 6, 12), MAT.marigold), 0.1, 1.165, 0.86, Math.PI / 2);   // a little idol with marigolds on the dash
      add(box(0.24, 0.07, 0.03, MAT.dash), 0, 1.7, 0.72); add(box(0.02, 0.08, 0.02, MAT.dash), 0, 1.76, 0.73);   // inside mirror
      for (const sx of [-1, 1]) add(box(0.42, 0.02, 0.17, MAT.liner), sx * 0.42, 1.78, 0.66, 0.2);         // sun visors
      add(box(1.68, 0.02, 0.76 - M.BACK - 0.05, MAT.liner), 0, M.ROOF - 0.04, (0.76 + M.BACK) / 2);   // headliner
      for (const z of [0.35, -0.45, -1.25]) add(box(1.66, 0.025, 0.05, MAT.card), 0, M.ROOF - 0.055, z);          // roof bows under the headliner
      add(box(0.22, 0.03, 0.1, MAT.dial), 0, M.ROOF - 0.065, -0.2);                                            // dome light
      for (const sx of [-1, 1]) for (const z of [0.3, -0.5]) add(box(0.04, 0.04, 0.24, MAT.dash), sx * (W - 0.1), M.ROOF - 0.12, z);   // grab handles
      add(box(0.02, M.BELT - 0.6, M.NOSE - M.BACK - 0.08, MAT.card), -(W - 0.05), (M.BELT + 0.6) / 2, (M.NOSE + M.BACK) / 2);   // door cards
      add(box(0.02, M.BELT - 0.6, M.NOSE + 0.02 - 0.04, MAT.card), W - 0.05, (M.BELT + 0.6) / 2, (M.NOSE - 0.02) / 2);
      add(box(0.02, M.BELT - 0.6, -0.95 - M.BACK - 0.04, MAT.card), W - 0.05, (M.BELT + 0.6) / 2, (-0.95 + M.BACK) / 2);
      add(box(1.66, M.BELT - 0.6, 0.02, MAT.card), 0, (M.BELT + 0.6) / 2, M.BACK + 0.04);
      const seatAt = (x, z, w) => {   // cushion top at 0.82 (0.27 m above the floor), backrest leaning back, headrests
        add(box(w, 0.13, 0.5, MAT.seat), x, 0.755, z); add(box(w, 0.16, 0.4, MAT.floor), x, 0.63, z);
        add(box(w, 0.54, 0.11, MAT.seat), x, 1.1, z - 0.28, -0.12); add(box(w - 0.04, 0.04, 0.12, MAT.seat), x, 1.37, z - 0.31, -0.12);
      };
      seatAt(-0.4, 0.24, 0.52); seatAt(0.4, 0.24, 0.52); seatAt(0, -0.66, 1.56);
      for (const x of [-0.4, 0.4]) { add(box(0.24, 0.16, 0.09, MAT.seat), x, 1.5, 0.24 - 0.36); add(box(0.24, 0.16, 0.09, MAT.seat), x, 1.48, -0.66 - 0.36);
        for (const dx of [-0.07, 0.07]) add(box(0.015, 0.1, 0.015, MAT.chrome), x + dx, 1.39, 0.24 - 0.35); }   // headrests on their stalks
      for (const sx of [-1, 1]) { add(box(0.4, 0.1, 0.8, MAT.seat), sx * 0.58, 0.77, -1.5); add(box(0.08, 0.42, 0.8, MAT.seat), sx * (W - 0.1), 1.05, -1.5); add(box(0.3, 0.3, 0.9, MAT.floor), sx * 0.6, 0.66, M.RZ); }   // the side-facing seats at the back, over the wheel tubs
      add(box(1.2, 0.3, 0.86, MAT.black), 0, 0.62, M.FZ);                                               // front wheel well liner
      // the driver at the wheel (right) and, when you ride, you on the back seat behind the front passenger (left)
      let driver = null;
      if (opts.driver !== false) { driver = seated(opts.shirt || 0x3a4a6a, [0.16, 0.27, 0.47, 0]); driver.position.set(-0.4, 0.82, 0.12); body.add(driver); }
      const rider = seated(0x2f5fa8, null); rider.position.set(0.24, 0.82, -0.72); rider.visible = false; body.add(rider);
      // the rear left door (the kerb side in India: you get in on the left) opens on its front hinge
      const door = new THREE.Group(); door.position.set(W - 0.02, 0, -0.02); g.userData.doorSide = 1;
      { const dp = sidePanel(-0.95, -0.02, M.BELT, bm); dp.position.z = 0.02; door.add(dp);
        const dg = sideGlass(-0.95, -0.02); dg.position.set(0.005, 0, 0.02); door.add(dg);
        const fr = box(0.04, 0.04, 0.93, bm); fr.position.set(0, M.ROOF - 0.05, -0.47); door.add(fr);
        const dc = box(0.02, M.BELT - 0.6, 0.9, MAT.card); dc.position.set(-0.03, (M.BELT + 0.6) / 2, -0.47); door.add(dc);
        const dh = box(0.02, 0.035, 0.15, MAT.black); dh.position.set(0.03, 1.08, -0.8); door.add(dh); }
      body.add(door);
      // wheels in their arches (steel wheels, the taxi kind)
      const wheels = [];
      for (const [sx, z] of [[-1, M.FZ], [1, M.FZ], [-1, M.RZ], [1, M.RZ]]) wheelAt(body, wheels, sx * M.TRK, M.R, z, z > 0, GEO.tyre, GEO.rim, 6);
      // one draw call per material: merge the fixed parts of the body (not the door, the people or the sign)
      mergeGroup(body, new Set([door, driver, rider, sign].filter(Boolean)));
      for (const w of wheels) { mergeGroup(w.spin, new Set()); body.add(w.piv); }   // in the body: tilted with it, never out of the arches
      body.children.forEach(m => { if (m.isMesh) { m.castShadow = m.material === bm; m.receiveShadow = true; } });   // only the body shell casts the sun shadow
      scene.add(g);
      const _e = new THREE.Vector3(), _l = new THREE.Vector3();
      const car = {
        g, body, wheels, door, driver, rider, doorOpen: 0, taxi: !!opts.taxi, kind: 'muv',
        place: placer(g, body, wheels, { fz: M.FZ, rz: M.RZ, fx: M.TRK, rx: M.TRK }),
        roll(dist) { for (const w of wheels) w.spin.rotation.x += dist / M.R; },
        setDoor(k) { car.doorOpen = k; door.rotation.y = -k * 1.05; },   // the back edge swings out
        // from the back seat, behind the front passenger: your eyes, and a point ahead a little toward the middle of the road
        seatView(eye, look) {
          g.updateMatrixWorld(true);   // this frame's place(), not the last frame's (the car moves ~0.3 m a frame)
          (eye || _e).copy(_e.set(0.22, 1.55, -0.69)).applyMatrix4(body.matrixWorld);
          (look || _l).copy(_l.set(-0.4, 1.05, 8)).applyMatrix4(body.matrixWorld);
          return { eye: eye || _e, look: look || _l };
        }
      };
      return car;
    }

    /* an auto-rickshaw: three wheels, green below and yellow above, black canvas hood, the driver in front on the
       centre line with the handlebar, a bench for three behind him. Same interface as a car (no door). */
    function makeAuto(opts) {
      opts = opts || {};
      const g = new THREE.Group(), body = new THREE.Group(); g.add(body);
      const add = (m, x, y, z, rx, ry, rz) => { if (x !== undefined) m.position.set(x, y, z); if (rx || ry || rz) m.rotation.set(rx || 0, ry || 0, rz || 0); body.add(m); return m; };
      const G = MAT.autoG, Y = MAT.autoY, FZ = 0.92, RZ = -0.62, RX = 0.56;
      add(box(1.2, 0.08, 1.85, G), 0, 0.38, -0.12);                                                      // floor pan
      add(new THREE.Mesh(extrude([[0.55, 0.36], [1.02, 0.36], [1.1, 0.52], [1.02, 0.86], [0.7, 0.98], [0.55, 0.98]], 0.62), G));   // nose round the front wheel
      add(box(0.3, 0.06, 0.4, MAT.black), 0, 0.46, FZ);                                                  // front mudguard
      add(new THREE.Mesh(new THREE.CircleGeometry(0.08, 16), MAT.head), 0, 0.72, 1.09, 0, 0, 0); add(box(0.2, 0.05, 0.03, MAT.chrome), 0, 0.84, 1.06);
      add(box(1.0, 0.5, 0.05, G), 0, 0.7, 0.6);                                                          // dash panel
      add(box(0.94, 0.5, 0.015, MAT.glass), 0, 1.2, 0.62, -0.08); add(box(1.0, 0.05, 0.06, MAT.black), 0, 1.46, 0.6);   // windscreen
      add(limb([0, 0.9, 0.62], [0, 1.08, 0.5], 0.025, MAT.black)); add(limb([-0.3, 1.08, 0.48], [0.3, 1.08, 0.48], 0.02, MAT.chrome));   // handlebar
      for (const sx of [-1, 1]) {
        add(box(0.04, 0.4, 1.55, G), sx * 0.6, 0.6, -0.3);                                               // low sides
        add(box(0.05, 0.12, 1.6, Y), sx * 0.61, 1.6, -0.25);                                             // yellow band under the hood
        for (const z of [0.58, -1.05]) add(box(0.04, 0.92, 0.04, MAT.black), sx * 0.58, 1.18, z);       // hood posts
        add(box(0.1, 0.08, 0.05, MAT.tail), sx * 0.45, 0.62, -1.1);
      }
      add(box(1.2, 1.05, 0.05, Y), 0, 1.0, -1.08); add(box(0.6, 0.22, 0.02, MAT.black), 0, 1.28, -1.11);   // yellow back with its little window
      add(box(1.2, 0.3, 0.05, G), 0, 0.55, -1.09);
      { const hood = new THREE.Mesh(new THREE.CylinderGeometry(0.66, 0.66, 1.75, 14, 1, false, -Math.PI / 2, Math.PI), MAT.canvas); hood.scale.set(1, 1, 0.3); add(hood, 0, 1.66, -0.22, -Math.PI / 2, 0, 0); hood.material.side = THREE.DoubleSide; }
      add(box(0.36, 0.1, 0.32, MAT.seat), 0, 0.78, 0.18); add(box(0.36, 0.3, 0.06, MAT.seat), 0, 0.98, 0.0);   // driver's seat
      add(box(1.1, 0.12, 0.45, MAT.seat), 0, 0.72, -0.74); add(box(1.1, 0.42, 0.08, MAT.seat), 0, 1.0, -0.98);   // passenger bench
      add(box(0.9, 0.3, 0.4, MAT.black), 0, 0.5, -0.78);                                                  // engine under the bench
      const plM = new THREE.MeshBasicMaterial({ map: plateTex('HP 01 A ' + (plateN++ % 9000 + 1000), true) });
      add(new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.1), plM), 0, 0.62, -1.115, 0, Math.PI);
      let driver = null;
      if (opts.driver !== false) { driver = seated(opts.shirt || 0xb4a274, [0.27, 0.27, 0.36, 0], MAT.khaki); driver.position.set(0, 0.84, 0.16); driver.scale.setScalar(0.95); body.add(driver); }
      const rider = seated(0x2f5fa8, null); rider.position.set(0.3, 0.78, -0.72); rider.visible = false; body.add(rider);
      const wheels = [];
      wheelAt(body, wheels, 0, 0.2, FZ, true, GEO.aTyre, GEO.aRim, 0);
      for (const sx of [-1, 1]) wheelAt(body, wheels, sx * RX, 0.2, RZ, false, GEO.aTyre, GEO.aRim, 0);
      mergeGroup(body, new Set([driver, rider].filter(Boolean)));
      for (const w of wheels) { mergeGroup(w.spin, new Set()); body.add(w.piv); }
      body.children.forEach(m => { if (m.isMesh) { m.castShadow = m.material === G || m.material === MAT.canvas || m.material === Y; m.receiveShadow = true; } });
      scene.add(g);
      const auto = {
        g, body, wheels, door: null, driver, rider, doorOpen: 0, taxi: true, kind: 'auto',
        place: placer(g, body, wheels, { fz: FZ, rz: RZ, fx: 0, rx: RX }),
        roll(dist) { for (const w of wheels) w.spin.rotation.x += dist / 0.2; },
        setDoor(k) { auto.doorOpen = k; },
        seatView(eye, look) { g.updateMatrixWorld(true); const e = (eye || new THREE.Vector3()).set(0.3, 1.45, -0.62).applyMatrix4(body.matrixWorld), l = (look || new THREE.Vector3()).set(-0.2, 1.1, 8).applyMatrix4(body.matrixWorld); return { eye: e, look: l }; }
      };
      return auto;
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
    const roadMat = k => RMAT[k] || (RMAT[k] = new THREE.MeshStandardMaterial({ map: roadTex(k), roughness: 0.95, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }));
    function roadMesh(Ln, width, skip) {
      const parts = {};
      const W = width || 4.2, step = 2;
      for (let d = 0; d < Ln.total; d += step) {
        if (skip && skip(Ln.at(d))) continue;
        const sf = Ln.surfAt(d), k = /dirt|gravel|compacted|ground|unpaved/.test(sf) ? 'dirt' : /paving|concrete|sett/.test(sf) ? 'paving' : 'asphalt';
        const P = parts[k] || (parts[k] = { pos: [], uv: [], idx: [] });
        const d2 = Math.min(Ln.total, d + step), a = Ln.at(d), b = Ln.at(d2), da = Ln.dir(d), db = Ln.dir(d2);
        const base = P.pos.length / 3;
        // five points across, each just above the ground under it: a strip with only its two edges on the ground
        // bridged hollows and floated above the terrain, and feet on the road sank into it
        const NA = 5;
        for (const [p, dd, v] of [[a, da, d / 8], [b, db, d2 / 8]])
          for (let i = 0; i < NA; i++) {
            const side = -1 + 2 * i / (NA - 1), x = p.x - dd.dz * side * W / 2, z = p.z + dd.dx * side * W / 2;
            P.pos.push(x, H(x, z) + 0.03, z); P.uv.push(i / (NA - 1), v);
          }
        for (let i = 0; i < NA - 1; i++) P.idx.push(base + i, base + i + 1, base + NA + i, base + i + 1, base + NA + i + 1, base + NA + i);   // facing up
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
        offRate: opts.offRate || 0.18, off: opts.off || 0, offT: opts.offT == null ? (opts.off || 0) : opts.offT, offEnd: opts.offEnd == null ? null : opts.offEnd };
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
        F.off += (want - F.off) * Math.min(1, mv * F.offRate);
        const dd = Ln.dir(F.d, 2.5), p = kerb(Ln.at(F.d), dd), yaw = Math.atan2(dd.dx * F.dirSign, dd.dz * F.dirSign);
        let dy = yaw - F.yaw; while (dy > Math.PI) dy -= 2 * Math.PI; while (dy < -Math.PI) dy += 2 * Math.PI;
        F.yaw = F.yaw + dy * Math.min(1, dt * 8);
        const ah = Ln.dir(F.d + F.dirSign * 4, 2.5), ay = Math.atan2(ah.dx * F.dirSign, ah.dz * F.dirSign); let st = ay - F.yaw; while (st > Math.PI) st -= 2 * Math.PI; while (st < -Math.PI) st += 2 * Math.PI;
        const lock = 0.5 - 0.3 * Math.min(1, F.v / 10); F.steer += (Math.max(-lock, Math.min(lock, st * 2.2)) - F.steer) * Math.min(1, dt * 6);
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
    function makeAutoTracked(o2) { const c = makeAuto(o2); ALL.push(c); return c; }
    function cull(cam) { for (const c of ALL) c.g.visible = (c.g.position.x - cam.x) ** 2 + (c.g.position.z - cam.z) ** 2 < 300 * 300; }
    return { makeCar: makeCarTracked, makeAuto: makeAutoTracked, roadMesh, follower, line, MAT, cull };
  }
};
