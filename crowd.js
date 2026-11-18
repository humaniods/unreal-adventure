'use strict';
/* Crowd of hikers for the Triund walk test.
   100 bot trekkers walk up and down both trails, rest, sit at tea stalls and hang around the top; every tea stall
   has a shopkeeper. Bots are plain data agents (id, trail, s, lateral, state) so a network layer can later drive
   the same agents from real players instead of the bot brain.
   Rendering: the nearest agents get full skinned characters (Quaternius CC0 base body, clothes painted in a shader
   from the bone weights, backpack, hair or cap) from a fixed pool; everyone else is a light instanced proxy.
   World axes: x = east, y = up, z = south. */
window.TriundCrowd = {
  async build(o) {
    const { THREE, scene, H, trails, stops, top, rng, blocked, base, talkers, quality } = o;
    const R = rng(2468);
    const lin = c => new THREE.Color(c).convertSRGBToLinear();
    const loader = new THREE.GLTFLoader();
    const load = url => new Promise((res, rej) => loader.load(url, res, undefined, rej));
    window.__crowdStage = 'loading';
    const [gm, gf, gh] = await Promise.all([load(base + 'hiker_m.gltf.json'), load(base + 'hiker_f.gltf.json'), load(base + 'hair.gltf.json')]);
    window.__crowdStage = 'loaded';
    const HAIR = {}; gh.scene.traverse(n => { if (n.isMesh) HAIR[n.name.replace(/_\d+$/, '')] = n; });
    // ground speed each locomotion clip was authored for (m/s at scale 1): playback is scaled to the real speed so
    // planted feet do not slide. [measured, fallback, min, max playback rate]
    const LOCO = {};
    // [clip, fallback, plausible range, playback min, max]. The jog's stance is too short to measure reliably,
    // so a reading outside a real jogging pace falls back to 3.4 m/s.
    for (const [name, fb, vmin, vmax, lo, hi] of [['Walk', 1.0, 0.6, 1.8, 0.45, 2.2], ['Jog_Fwd', 3.4, 2.2, 4.5, 0.6, 1.4]]) {
      const c = gm.animations.find(a => a.name === name);
      const v = window.TriundAnim && c ? window.TriundAnim.clipSpeed(THREE, gm.scene, c) : 0;
      LOCO[name] = { v: v >= vmin && v <= vmax ? v : fb, lo, hi };
    }
    window.__loco = LOCO;

    /* ---------- clothes from bone weights: cloth = (skin, top, bottom, shoes) ---------- */
    function clothAttr(mesh) {
      const g = mesh.geometry; if (g.attributes.cloth) return;
      const si = g.attributes.skinIndex, sw = g.attributes.skinWeight, bones = mesh.skeleton.bones;
      const cls = bones.map(b => {
        const n = b.name;
        if (/^(spine|clavicle|upperarm|lowerarm)/.test(n)) return 1;
        if (/^(pelvis|thigh|calf|root)/.test(n)) return 2;
        if (/^(foot|ball)/.test(n)) return 3;
        return 0;    // head, neck, hands, fingers
      });
      const a = new Float32Array(si.count * 4);
      const SA = si.array, WA = sw.array, ss = si.itemSize, ws = sw.itemSize;   // (r128 has no getComponent)
      const wn = sw.normalized ? (WA instanceof Uint8Array ? 255 : WA instanceof Uint16Array ? 65535 : 1) : 1;
      for (let i = 0; i < si.count; i++) for (let k = 0; k < 4; k++) { const w = WA[i * ws + k] / wn; if (w > 0) a[i * 4 + cls[SA[i * ss + k]]] += w; }
      g.setAttribute('cloth', new THREE.BufferAttribute(a, 4));
    }
    function clothMaterial(src, U) {
      const m = src.clone();
      m.onBeforeCompile = sh => {
        Object.assign(sh.uniforms, U);
        // clothes have volume: push them out along the normal (puffer / fleece jacket, track pants, boots), which
        // also hides the base body's muscle shapes
        sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec4 cloth; varying vec4 vCloth; varying vec3 vOP; uniform vec3 uPuff;')
          .replace('#include <begin_vertex>', '#include <begin_vertex>\nvCloth = cloth; vOP = position;\ntransformed += objectNormal * dot(cloth.yzw, uPuff);');
        sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform vec3 uTop; uniform vec3 uBottom; uniform vec3 uShoe; uniform float uQuilt; varying vec4 vCloth; varying vec3 vOP;')
          .replace('#include <map_fragment>', `#include <map_fragment>
  {
    float cw = vCloth.y + vCloth.z + vCloth.w;
    vec3 cc = (uTop * vCloth.y + uBottom * vCloth.z + uShoe * vCloth.w) / max(cw, 1e-3);
    // fabric: fine weave + soft folds so it does not read as paint
    float weave = 0.93 + 0.07 * sin(vUv.x * 1400.0) * sin(vUv.y * 1400.0);
    float fold = 0.9 + 0.1 * sin(vUv.y * 90.0 + sin(vUv.x * 60.0) * 2.0);
    // puffer jacket quilting: horizontal baffles on the jacket only
    float q = abs(fract(vOP.y * 8.5) - 0.5) * 2.0;
    float quilt = mix(1.0, 0.72 + 0.28 * smoothstep(0.0, 0.35, q), uQuilt * smoothstep(0.4, 0.7, vCloth.y));
    diffuseColor.rgb = mix(diffuseColor.rgb, cc * weave * fold * quilt, smoothstep(0.3, 0.6, cw));
  }`)
          // fabric hides the muscle detail of the base body's normal map
          .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\nnormal = normalize(mix(normal, geometryNormal, 0.9 * smoothstep(0.3, 0.6, vCloth.y + vCloth.z + vCloth.w)));')
          .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.92, smoothstep(0.3, 0.6, vCloth.y + vCloth.z + vCloth.w));');
      };
      m.customProgramCacheKey = () => 'hikercloth';
      return m;
    }

    /* ---------- palettes (what people wear on the trail in Oct/Nov: puffer and fleece jackets, track pants) ---------- */
    const TOPS = [0x2f4f7f, 0xb8432f, 0x2e2e33, 0x3f6b3a, 0xd9a321, 0x6a2c5a, 0x1f6f78, 0xe0e0dc, 0x8a2f2f, 0x4a5a6a, 0xf08a24, 0x274060];
    const BOTTOMS = [0x1f2228, 0x2b2f38, 0x3a3f4a, 0x23282e, 0x4b4a3e, 0x2d3540, 0x5a4a3a];
    const SHOES = [0x2a2420, 0x3a3a3a, 0x5a3d26, 0x6a6a6a, 0x1c1c1c];
    const PACKS = [0x9a3b2a, 0x2f4f7f, 0x3a3a3a, 0x3f6b3a, 0xd9a321, 0x5a4a3a];
    const pick = a => a[(R() * a.length) | 0];
    function look(sex) {
      return { sex, top: pick(TOPS), bottom: pick(BOTTOMS), shoe: pick(SHOES), pack: R() < 0.75 ? pick(PACKS) : null,
               head: sex === 'f' ? (R() < 0.5 ? 'hair' : 'beanie') : (R() < 0.4 ? 'cap' : R() < 0.7 ? 'beanie' : 'hair'),
               hairStyle: sex === 'f' ? 'Hair_Long' : (R() < 0.6 ? 'Hair_SimpleParted' : 'Hair_Buzzed'), beard: sex === 'm' && R() < 0.35,
               capCol: pick([0xb8432f, 0x2e2e33, 0x2f4f7f, 0xd9a321, 0xe0e0dc, 0x3f6b3a]), puffer: R() < 0.6, scale: sex === 'f' ? 0.93 + R() * 0.05 : 0.9 + R() * 0.07 };
    }

    /* ---------- full character (skinned, animated) ---------- */
    const SRC = { m: gm, f: gf };
    const tmpM = new THREE.Matrix4();
    function attach(bone, obj, worldMatrix) {
      // place obj at worldMatrix (character in bind pose at the origin), then parent it to the bone
      bone.updateWorldMatrix(true, false);
      obj.matrixAutoUpdate = false; obj.matrix.copy(tmpM.copy(bone.matrixWorld).invert().multiply(worldMatrix)); bone.add(obj);
    }
    const accMat = c => new THREE.MeshStandardMaterial({ color: lin(c), roughness: 0.85, metalness: 0 });
    function makeChar(sex) {
      const g = SRC[sex], root = THREE.SkeletonUtils.clone(g.scene);
      const U = { uTop: { value: new THREE.Color() }, uBottom: { value: new THREE.Color() }, uShoe: { value: new THREE.Color() }, uPuff: { value: new THREE.Vector3(0.04, 0.018, 0.012) }, uQuilt: { value: 1 } };
      let body = null, head = null, spine = null;
      root.traverse(n => {
        if (n.isSkinnedMesh) {
          // animations play in place, so the bind-pose bounds (padded for swinging arms) are safe to cull with
          if (!n.geometry.boundingSphere) n.geometry.computeBoundingSphere();
          if (!n.geometry.userData.padded) { n.geometry.boundingSphere.radius *= 1.35; n.geometry.userData.padded = true; }
          n.frustumCulled = true; n.castShadow = true; n.receiveShadow = true;
          if (/Superhero/i.test(n.material.name)) { clothAttr(n); n.material = clothMaterial(n.material, U); body = n; }
        }
        if (n.isBone && n.name === 'Head') head = n;
        if (n.isBone && n.name === 'spine_03') spine = n;
      });
      root.updateMatrixWorld(true);
      const hp = new THREE.Vector3().setFromMatrixPosition(head.matrixWorld), sp = new THREE.Vector3().setFromMatrixPosition(spine.matrixWorld);
      // accessories (rebuilt per look)
      const acc = { pack: null, cap: null, beanie: null, hair: {} };
      const pack = new THREE.Group();
      const pb = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.46, 0.2), accMat(0x9a3b2a)); pb.castShadow = true; pack.add(pb);
      const roll = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.34, 10), accMat(0x3c6b45)); roll.rotation.z = Math.PI / 2; roll.position.set(0, -0.28, 0.02); pack.add(roll);
      const bottle = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.2, 8), accMat(0x8fb3c8)); bottle.position.set(0.2, -0.1, 0); pack.add(bottle);
      attach(spine, pack, new THREE.Matrix4().makeTranslation(sp.x, sp.y - 0.05, sp.z - 0.2)); acc.pack = pack; acc.packMat = pb.material;
      const beanie = new THREE.Mesh(new THREE.SphereGeometry(0.112, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.55), accMat(0xb8432f)); beanie.castShadow = true;
      attach(head, beanie, new THREE.Matrix4().makeTranslation(hp.x, hp.y + 0.075, hp.z + 0.0)); acc.beanie = beanie;
      const cap = new THREE.Group(); const cc = new THREE.Mesh(new THREE.SphereGeometry(0.108, 14, 6, 0, Math.PI * 2, 0, Math.PI * 0.5), accMat(0x2f4f7f));
      const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.012, 12, 1, false, -Math.PI / 2, Math.PI), cc.material); brim.position.set(0, 0.0, 0.07); cap.add(cc, brim);
      attach(head, cap, new THREE.Matrix4().makeTranslation(hp.x, hp.y + 0.08, hp.z)); acc.cap = cap; acc.capMat = cc.material;
      for (const k in HAIR) { const hm = HAIR[k].clone(); hm.castShadow = true; attach(head, hm, new THREE.Matrix4()); acc.hair[k] = hm; }
      const mixer = new THREE.AnimationMixer(root), actions = {};
      for (const c of g.animations) actions[c.name] = mixer.clipAction(c);
      root.visible = false; scene.add(root);
      const casters = []; root.traverse(n => { if (n.isMesh && n.castShadow) casters.push(n); });
      return { root, U, acc, mixer, actions, cur: null, sex, agent: null, casters, shadow: true, animAcc: 0 };
    }
    function dress(ch, lk) {
      ch.U.uTop.value.copy(lin(lk.top)); ch.U.uBottom.value.copy(lin(lk.bottom)); ch.U.uShoe.value.copy(lin(lk.shoe));
      ch.U.uQuilt.value = lk.puffer ? 1 : 0; ch.U.uPuff.value.set(lk.puffer ? 0.045 : 0.026, 0.018, 0.014);
      ch.acc.pack.visible = !!lk.pack; if (lk.pack) ch.acc.packMat.color.copy(lin(lk.pack));
      ch.acc.beanie.visible = lk.head === 'beanie'; ch.acc.cap.visible = lk.head === 'cap';
      if (lk.head === 'beanie') ch.acc.beanie.material.color.copy(lin(lk.capCol));
      if (lk.head === 'cap') ch.acc.capMat.color.copy(lin(lk.capCol));
      for (const k in ch.acc.hair) ch.acc.hair[k].visible = (lk.head === 'hair' && k === lk.hairStyle) || (k === 'Hair_Beard' && lk.beard) ||
        (lk.head !== 'hair' && k === 'Hair_Long' && lk.sex === 'f');          // long hair shows under a beanie
      ch.root.scale.setScalar(lk.scale);
    }
    // speed: ground speed in m/s for locomotion clips (Walk, Jog_Fwd), playback rate for everything else
    function play(ch, name, speed) {
      const a = ch.actions[name] || ch.actions.Idle;
      if (ch.cur !== a) { a.reset().play(); if (ch.cur) a.crossFadeFrom(ch.cur, 0.35, false); ch.cur = a; }
      const L = LOCO[name];
      a.timeScale = L ? Math.min(L.hi, Math.max(L.lo, (speed || 0) / (L.v * ch.root.scale.x))) : (speed || 1);
    }

    /* ---------- trail helpers ---------- */
    function trailAt(tr, s, lat) { const p = tr.pointAtS(s), d = tr.dirAtS(s, 6); return { x: p.x - d.dz * lat, z: p.z + d.dx * lat, dx: d.dx, dz: d.dz }; }
    const yawOf = (dx, dz) => Math.atan2(dx, dz);          // characters face +z
    const TRS = [trails.galu, trails.shiva];

    /* ---------- agents ---------- */
    const agents = [];
    const seatSpots = [];
    // stall layouts (see places.js stall() and index.html stall()): 'stall' stops sit 2.4 m in front of the stall
    // centre with benches either side; the three big hand-built stalls have benches 4.6 m out; 'building' cafes have none
    for (const st of stops) {
      const sx = -st.tz, sz = st.tx, kind = st.kind || 'big';
      if (kind === 'building') continue;
      const out = kind === 'stall' ? -0.1 : 4.6, side = kind === 'stall' ? 2.6 : 1.7;
      for (const sd of [-1, 1]) seatSpots.push({ x: st.x + sx * sd * side + st.tx * out, z: st.z + sz * sd * side + st.tz * out, ry: Math.atan2(st.tx, st.tz), used: false, stop: st });
    }
    function newAgent(i) {
      const tr = R() < 0.6 ? trails.galu : trails.shiva, up = R() < 0.55;
      const a = { id: 'bot' + i, kind: 'hiker', tr, s: 15 + R() * (tr.total - 30), dir: up ? 1 : -1, lat: 0, latT: 0.9 + R() * 0.5, v: 0,
        vWalk: up ? 0.55 + R() * 0.45 : 0.85 + R() * 0.45, state: 'walk', t: 20 + R() * 120, x: 0, y: 0, z: 0, yaw: 0, look: look(R() < 0.38 ? 'f' : 'm'),
        seat: null, anim: 'Walk', animSpeed: 1 };
      return a;
    }
    const N = quality && quality.grassDensity < 0.7 ? 60 : 100;
    for (let i = 0; i < N; i++) agents.push(newAgent(i));
    // some start sitting at stalls, some on the top meadow
    for (const a of agents.slice(0, 14)) { const sp = seatSpots[(R() * seatSpots.length) | 0]; if (sp && !sp.used) { sp.used = true; a.seat = sp; a.state = 'sit'; a.t = 20 + R() * 120; a.s = sp.stop.s; a.tr = trails[sp.stop.trail] || a.tr; } }
    // a free spot on the top meadow, away from tents, buildings and other people already standing there
    const topSpots = [];
    function topSpot(a) {
      for (let k = 0; k < 30; k++) {
        const an = R() * 6.28, r = 12 + R() * 90, x = top.x + Math.cos(an) * r, z = top.z + Math.sin(an) * r;
        if (blocked && blocked(x, z)) continue;
        if (topSpots.some(p => Math.hypot(p.x - x, p.z - z) < 2.2 && p.a !== a)) continue;
        topSpots.push({ x, z, a }); a.tx = x; a.tz = z; return;
      }
      a.tx = top.x + (R() - 0.5) * 40; a.tz = top.z + (R() - 0.5) * 40;
    }
    for (const a of agents.slice(14, 26)) { a.tr = trails.galu; a.s = a.tr.total - 5; a.state = 'top'; a.t = 30 + R() * 200; topSpot(a); const p = trailAt(a.tr, a.s, 0); a.x = a.tx + (R() - 0.5) * 2; a.z = a.tz + (R() - 0.5) * 2; }
    // shopkeepers (one per stall) and the trail talkers
    const kOff = st => ({ stall: -1.9, building: 0.6 }[st.kind] != null ? { stall: -1.9, building: 0.6 }[st.kind] : 2.35);
    const keepers = stops.map((st, i) => ({ id: 'keeper' + i, kind: 'keeper', x: st.x + st.tx * kOff(st), z: st.z + st.tz * kOff(st), yaw: Math.atan2(st.tx, st.tz), state: 'keeper',
      look: Object.assign(look(R() < 0.8 ? 'm' : 'f'), { pack: null, head: R() < 0.5 ? 'cap' : 'hair' }), anim: 'Idle', animSpeed: 1, t: R() * 10 }));
    const fixed = keepers.concat((talkers || []).map((t, i) => ({ id: 'talker' + i, kind: 'talker', x: t.x, z: t.z, yaw: t.yaw, state: 'talker', look: look(i % 2 ? 'f' : 'm'), anim: 'Idle_Talking', animSpeed: 1 })));
    for (const k of fixed) k.y = H(k.x, k.z);

    function think(a, dt, P) {
      a.t -= dt;
      if (a.state === 'walk') {
        // keep left (Indian trails) relative to the walking direction; step aside around the hiker
        let latT = -a.dir * a.latT;
        const dpx = P.x - a.x, dpz = P.z - a.z, dp = Math.hypot(dpx, dpz);
        if (dp < 2.5) latT += (latT >= 0 ? 1 : -1) * (2.5 - dp);
        a.lat += (latT - a.lat) * Math.min(1, dt * 1.5);
        const slope = Math.abs(a.tr.pointAtS(a.s + 3).h - a.tr.pointAtS(a.s - 3).h) / 6;
        const vt = a.vWalk * (a.dir > 0 ? 1 - Math.min(0.5, slope * 0.9) : 1 - Math.min(0.3, slope * 0.4));
        a.v += (vt - a.v) * Math.min(1, dt * 2);
        a.s += a.dir * a.v * dt;
        a.anim = 'Walk'; a.animSpeed = a.v;
        // tea stall on the way?
        if (a.t < 0) {
          const sp = seatSpots.find(q => !q.used && q.stop.trail === a.tr.id && Math.abs(q.stop.s - a.s) < 12);
          if (sp && R() < 0.5) { sp.used = true; a.seat = sp; a.state = 'toSeat'; a.t = 40 + R() * 120; }
          else { a.state = 'rest'; a.t = 6 + R() * 20; }
        }
        if (a.s >= a.tr.total - 4 && a.dir > 0) {
          if (a.tr === trails.galu) { a.state = 'top'; a.t = 60 + R() * 240; topSpot(a); }
          else { a.dir = -1; }
        }
        if (a.s <= 3 && a.dir < 0) { a.dir = 1; a.vWalk = 0.55 + R() * 0.45; a.look = look(a.look.sex); }   // a new hiker arrives at the trailhead
      } else if (a.state === 'rest') {
        a.v = 0; a.anim = 'Idle'; a.animSpeed = 1;    // (the walk crossfade covers the stop)
        if (a.t < 0) { a.state = 'walk'; a.t = 60 + R() * 200; }
      } else if (a.state === 'toSeat') {
        const ex = a.seat.x - a.x, ez = a.seat.z - a.z, el = Math.hypot(ex, ez);
        if (el < 0.25) { a.state = 'sit'; a.yaw = a.seat.ry; }
        else { a.x += ex / el * 0.9 * dt; a.z += ez / el * 0.9 * dt; a.yaw = yawOf(ex, ez); a.anim = 'Walk'; a.animSpeed = 0.9; }
      } else if (a.state === 'sit') {
        a.x = a.seat.x; a.z = a.seat.z; a.yaw = a.seat.ry; a.anim = R() < 0.002 ? (a.anim === 'Sitting_Idle' ? 'Sitting_Talking' : 'Sitting_Idle') : (a.anim.startsWith('Sitting') ? a.anim : 'Sitting_Idle'); a.animSpeed = 1;
        if (a.t < 0) { a.seat.used = false; a.seat = null; a.state = 'walk'; a.t = 80 + R() * 200; const p = trailAt(a.tr, a.s, 0); a.x = p.x; a.z = p.z; }
      } else if (a.state === 'top') {
        const ex = a.tx - a.x, ez = a.tz - a.z, el = Math.hypot(ex, ez);
        if (el > 0.4) { a.x += ex / el * 0.8 * dt; a.z += ez / el * 0.8 * dt; a.yaw = yawOf(ex, ez); a.anim = 'Walk'; a.animSpeed = 0.8; }
        else { a.anim = a.idleAnim || (a.idleAnim = R() < 0.4 ? 'Idle_Talking' : 'Idle'); a.animSpeed = 1; if (R() < dt * 0.02) a.yaw += (R() - 0.5) * 2; }
        if (a.t < 0) { a.state = 'walk'; a.dir = -1; a.s = a.tr.total - 6; a.vWalk = 0.85 + R() * 0.45; a.idleAnim = null; const i = topSpots.findIndex(p => p.a === a); if (i >= 0) topSpots.splice(i, 1); }
      }
      if (a.state === 'walk' || a.state === 'rest') {
        a.s = Math.max(0, Math.min(a.tr.total, a.s));
        const p = trailAt(a.tr, a.s, a.lat); a.x = p.x; a.z = p.z;
        if (a.state === 'walk') a.yaw = yawOf(p.dx * a.dir, p.dz * a.dir);
      }
      a.y = H(a.x, a.z) + (a.state === 'sit' ? 0.0 : 0);
    }

    /* ---------- far proxies: one instanced low-poly figure (torso, legs, head, pack) ---------- */
    function proxyGeo() {
      const parts = [], add = (g, c, x, y, z) => { g.translate(x, y, z); const n = g.attributes.position.count, col = new Float32Array(n * 3); for (let i = 0; i < n; i++) { col[i * 3] = c[0]; col[i * 3 + 1] = c[1]; col[i * 3 + 2] = c[2]; } g.setAttribute('pc', new THREE.BufferAttribute(col, 3)); parts.push(g.index ? g.toNonIndexed() : g); };
      add(new THREE.CylinderGeometry(0.2, 0.17, 0.62, 8), [1, 0, 0], 0, 1.18, 0);        // jacket (instance colour)
      add(new THREE.CylinderGeometry(0.09, 0.07, 0.86, 6), [0, 1, 0], -0.1, 0.45, 0);    // legs (dark)
      add(new THREE.CylinderGeometry(0.09, 0.07, 0.86, 6), [0, 1, 0], 0.1, 0.45, 0);
      add(new THREE.SphereGeometry(0.12, 8, 6), [0, 0, 1], 0, 1.66, 0);                 // head (skin)
      add(new THREE.BoxGeometry(0.32, 0.42, 0.18), [0, 1, 0], 0, 1.2, -0.2);             // pack
      const g = new THREE.BufferGeometry(); let n = 0; parts.forEach(p => n += p.attributes.position.count);
      const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), pc = new Float32Array(n * 3); let o = 0;
      for (const p of parts) { pos.set(p.attributes.position.array, o * 3); nor.set(p.attributes.normal.array, o * 3); pc.set(p.attributes.pc.array, o * 3); o += p.attributes.position.count; }
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); g.setAttribute('pc', new THREE.BufferAttribute(pc, 3));
      return g;
    }
    const pmat = new THREE.MeshStandardMaterial({ roughness: 0.9, metalness: 0 });
    pmat.onBeforeCompile = sh => {
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec3 pc; varying vec3 vPc;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvPc = pc;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vPc;')
        .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb = vColor.rgb * vPc.x + vec3(0.03, 0.035, 0.04) * vPc.y + vec3(0.32, 0.2, 0.13) * vPc.z;');
    };
    pmat.vertexColors = false;
    const total = agents.length + fixed.length;
    const proxy = new THREE.InstancedMesh(proxyGeo(), pmat, total); proxy.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(total * 3), 3);
    proxy.frustumCulled = false; proxy.castShadow = false; scene.add(proxy);
    // vColor comes from instanceColor (three defines USE_COLOR when instanceColor is set)

    /* ---------- pool of full characters for the nearest people ---------- */
    window.__crowdStage = 'agents';
    const POOL = quality && quality.grassDensity < 0.7 ? 10 : 18;
    const pool = []; for (let i = 0; i < POOL; i++) { window.__crowdStage = 'char' + i; try { pool.push(makeChar(i % 3 === 2 ? 'f' : 'm')); } catch (e) { window.__crowdStage = 'charErr ' + (e && e.stack || e); throw e; } }
    window.__crowdStage = 'pool';
    const everyone = agents.concat(fixed);
    let assignT = 0;
    const M4 = new THREE.Matrix4(), Q = new THREE.Quaternion(), V = new THREE.Vector3(), S1 = new THREE.Vector3(1, 1, 1), UP = new THREE.Vector3(0, 1, 0), C = new THREE.Color();
    function assign(cam) {
      for (const p of everyone) p.d2 = (p.x - cam.x) ** 2 + (p.z - cam.z) ** 2;
      const near = everyone.filter(p => p.d2 < 90 * 90).sort((a, b) => a.d2 - b.d2);
      const want = new Set(near.slice(0, POOL * 2).filter(p => near.indexOf(p) < POOL || true).slice(0, POOL));
      // release characters whose person left the set
      for (const ch of pool) if (ch.agent && !want.has(ch.agent)) { ch.agent.ch = null; ch.agent = null; ch.root.visible = false; }
      for (const p of want) {
        if (p.ch) continue;
        let ch = pool.find(c => !c.agent && c.sex === p.look.sex) || pool.find(c => !c.agent);
        if (!ch) break;
        if (ch.sex !== p.look.sex) p.look.sex = ch.sex;
        ch.agent = p; p.ch = ch; dress(ch, p.look); ch.cur = null; ch.root.visible = true;
      }
      // only the nearest few cast shadows: every caster is drawn again into the sun's shadow map
      const byDist = pool.filter(c => c.agent).sort((a, b) => a.agent.d2 - b.agent.d2);
      byDist.forEach((c, i) => { const on = i < SHADOW_CASTERS; if (on !== c.shadow) { c.shadow = on; c.casters.forEach(m => { m.castShadow = on; }); } });
    }
    const SHADOW_CASTERS = 4;
    const FR = new THREE.Frustum(), PM = new THREE.Matrix4(), SPH = new THREE.Sphere();

    let simT = 0;
    return {
      agents, keepers, counts: { bots: agents.length, keepers: keepers.length, pool: POOL },
      update(dt, cam, P, camera) {
        if (camera) FR.setFromProjectionMatrix(PM.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
        for (const a of agents) think(a, dt, P);
        for (const k of keepers) { const dp = Math.hypot(P.x - k.x, P.z - k.z); k.anim = dp < 7 ? 'Idle_Talking' : (k.t = (k.t || 0) - dt) < 0 ? (k.t = 8 + R() * 10, R() < 0.3 ? 'Interact' : 'Idle') : k.anim; if (dp < 7) k.yaw = Math.atan2(P.x - k.x, P.z - k.z); }
        assignT -= dt; if (assignT <= 0) { assignT = 0.4; assign(cam); }
        let n = 0;
        // people turn through switchbacks instead of snapping to the new heading (about 0.25 s)
        const turnK = 1 - Math.exp(-dt * 7);
        for (const p of everyone) {
          if (p.ryaw === undefined) p.ryaw = p.yaw; else p.ryaw += window.TriundAnim.angDiff(p.ryaw, p.yaw) * turnK;
          if (p.ch) {
            const ch = p.ch; ch.root.position.set(p.x, p.y, p.z); ch.root.rotation.y = p.ryaw;
            play(ch, p.anim, p.animSpeed);
            // skin animation is CPU work per bone: skip people out of view, and step distant ones at a lower rate
            ch.animAcc += dt;
            const seen = !camera || FR.intersectsSphere(SPH.set(ch.root.position, 1.6));
            const step = !seen ? 0.25 : p.d2 > 35 * 35 ? 1 / 20 : 0;
            if (ch.animAcc >= step) { ch.mixer.update(ch.animAcc); ch.animAcc = 0; }
            continue;
          }
          const d2 = (p.x - cam.x) ** 2 + (p.z - cam.z) ** 2; if (d2 > 700 * 700) continue;
          const bob = p.anim === 'Walk' ? Math.abs(Math.sin((p.s || 0) * 2.6)) * 0.04 : 0;
          const sit = p.anim && p.anim.startsWith('Sitting') ? 0.45 : 1;
          M4.compose(V.set(p.x, p.y + bob - (1 - sit) * 0.5, p.z), Q.setFromAxisAngle(UP, p.ryaw), S1.set(p.look.scale, p.look.scale * sit, p.look.scale));
          proxy.setMatrixAt(n, M4); proxy.setColorAt(n, C.copy(lin(p.look.top))); n++;
        }
        proxy.count = n; proxy.instanceMatrix.needsUpdate = true; if (proxy.instanceColor) proxy.instanceColor.needsUpdate = true;
      },
      // the player's own third-person body
      playerChar() { const ch = makeChar('m'); dress(ch, { sex: 'm', top: 0x2f6e8f, bottom: 0x2a3140, shoe: 0x4a3524, pack: 0x9a3b2a, head: 'beanie', capCol: 0xf2a93b, puffer: true, scale: 0.95, hairStyle: 'Hair_SimpleParted', beard: false }); return { ch, play: (n, s) => play(ch, n, s) }; }
    };
  }
};
