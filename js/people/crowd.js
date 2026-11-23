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
    const { THREE, scene, H, trails, stops, top, rng, blocked, base, talkers, quality, ground, collide, night } = o, HM = o.meshH || H;
    const R = rng(2468);
    const lin = c => new THREE.Color(c).convertSRGBToLinear();
    const loader = new THREE.GLTFLoader();
    const load = url => new Promise((res, rej) => loader.load(url, res, undefined, rej));
    window.__crowdStage = 'loading';
    const [gm, gf, gh] = await Promise.all([load(base + 'hiker_m.gltf.json'), load(base + 'hiker_f.gltf.json'), load(base + 'hair.gltf.json')]);
    window.__crowdStage = 'loaded';
    const HAIR = {}; gh.scene.traverse(n => { if (n.isMesh) HAIR[n.name.replace(/_\d+$/, '')] = n; });
    // the hair model is light grey: Indian hikers' hair is near black, dark brown in the sun
    { const dark = new THREE.Color(0x2a1d15).convertSRGBToLinear(); for (const k in HAIR) { const m = HAIR[k].material; if (m && m.color) { HAIR[k].material = m.clone(); HAIR[k].material.color.copy(dark); } } }
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

    /* ---------- an ordinary body from the base mesh ----------
       The free Quaternius base body is a superhero (huge shoulders, arms and chest, every muscle sculpted). Once per
       body, in its bind pose: each vertex is pulled toward the bone it hangs on (shoulders, arms, chest and legs
       slimmer, by the bone weights so nothing tears), then the clothed parts are smoothed (Taubin smoothing, which
       does not shrink) so the jacket and trousers hang as cloth instead of showing the muscles under them. Seam
       copies of a vertex (UV seams) are welded for this, so they move together and the normals stay smooth. */
    const SLIM = {
      m: { clavicle: [1, 0.8], upperarm: [1, 0.78], lowerarm: [1, 0.85], spine_03: [0.85, 0.88], spine_02: [0.89, 0.9], spine_01: [0.94, 0.94], neck_01: [0.84, 0.86], thigh: [0.9, 0.9], calf: [0.92, 0.92] },
      f: { clavicle: [1, 0.9], upperarm: [1, 0.87], lowerarm: [1, 0.9], spine_03: [0.93, 0.94], spine_02: [0.94, 0.95], spine_01: [0.96, 0.96], neck_01: [0.9, 0.9], thigh: [0.95, 0.95], calf: [0.95, 0.95] }
    };
    const CHAIN = { clavicle: 'upperarm', upperarm: 'lowerarm', lowerarm: 'hand', thigh: 'calf', calf: 'foot', spine_01: 'spine_02', spine_02: 'spine_03', spine_03: 'neck_01', neck_01: 'Head' };
    function reshape(mesh, sex) {
      const g = mesh.geometry; if (g.userData.reshaped) return; g.userData.reshaped = true;
      const sk = mesh.skeleton, bones = sk.bones, idx = {}; bones.forEach((b, i) => { idx[b.name] = i; });
      const bp = sk.boneInverses.map(m => new THREE.Vector3().setFromMatrixPosition(new THREE.Matrix4().copy(m).invert()));
      const F = SLIM[sex] || SLIM.m;
      const seg = bones.map(b => {
        const base = b.name.replace(/_[lr]$/, ''), f = F[base] || F[b.name]; if (!f) return null;
        const sfx = /_[lr]$/.test(b.name) ? b.name.slice(-2) : '', ch = idx[CHAIN[base] + (CHAIN[base] === 'Head' || /^(spine|neck)/.test(CHAIN[base]) ? '' : sfx)];
        if (ch == null) return null;
        const A = bp[bones.indexOf(b)], B = bp[ch], u = B.clone().sub(A), L = u.length(); u.normalize();
        return { A, u, L, kx: f[0], kz: f[1] };
      });
      const P = g.attributes.position, n = P.count, bm = mesh.bindMatrix, bmi = mesh.bindMatrixInverse;
      const si = g.attributes.skinIndex.array, sw = g.attributes.skinWeight.array, cl = g.attributes.cloth.array;
      const ss = g.attributes.skinIndex.itemSize, ws = g.attributes.skinWeight.itemSize;
      const wn = g.attributes.skinWeight.normalized ? (sw instanceof Uint8Array ? 255 : sw instanceof Uint16Array ? 65535 : 1) : 1;
      const X = new Float32Array(n * 3), v = new THREE.Vector3();
      for (let i = 0; i < n; i++) { v.fromBufferAttribute(P, i).applyMatrix4(bm); X[i * 3] = v.x; X[i * 3 + 1] = v.y; X[i * 3 + 2] = v.z; }
      // 1. slim: scale the offset across each bone (x across the body by kx, y and z by kz), weighted
      for (let i = 0; i < n; i++) {
        const x = X[i * 3], y = X[i * 3 + 1], z = X[i * 3 + 2]; let dx = 0, dy = 0, dz = 0;
        for (let k = 0; k < 4; k++) {
          const w = sw[i * ws + k] / wn; if (w <= 0) continue; const s = seg[si[i * ss + k]]; if (!s) continue;
          const ox = x - s.A.x, oy = y - s.A.y, oz = z - s.A.z; let t = ox * s.u.x + oy * s.u.y + oz * s.u.z; t = Math.max(0, Math.min(s.L, t));
          const px = ox - s.u.x * t, py = oy - s.u.y * t, pz = oz - s.u.z * t;     // offset from the bone line
          dx += w * px * (s.kx - 1); dy += w * py * (s.kz - 1); dz += w * pz * (s.kz - 1);
        }
        X[i * 3] += dx; X[i * 3 + 1] += dy; X[i * 3 + 2] += dz;
      }
      // 2. weld seam copies, find neighbours from the triangles
      const key = new Map(), gid = new Int32Array(n); let ng = 0;
      for (let i = 0; i < n; i++) { const k = Math.round(X[i * 3] * 2e4) + ',' + Math.round(X[i * 3 + 1] * 2e4) + ',' + Math.round(X[i * 3 + 2] * 2e4); let id = key.get(k); if (id === undefined) { id = ng++; key.set(k, id); } gid[i] = id; }
      const G = new Float32Array(ng * 3), cnt = new Float32Array(ng), mask = new Float32Array(ng);
      for (let i = 0; i < n; i++) { const a = gid[i]; G[a * 3] += X[i * 3]; G[a * 3 + 1] += X[i * 3 + 1]; G[a * 3 + 2] += X[i * 3 + 2]; cnt[a]++;
        const c = cl[i * 4 + 1] + cl[i * 4 + 2] + cl[i * 4 + 3]; mask[a] = Math.max(mask[a], Math.min(1, Math.max(0, (c - 0.55) / 0.35))); }
      for (let a = 0; a < ng; a++) { G[a * 3] /= cnt[a]; G[a * 3 + 1] /= cnt[a]; G[a * 3 + 2] /= cnt[a]; }
      const ix = g.index.array, nbs = Array.from({ length: ng }, () => new Set());
      for (let t = 0; t < ix.length; t += 3) { const a = gid[ix[t]], b = gid[ix[t + 1]], c = gid[ix[t + 2]]; nbs[a].add(b).add(c); nbs[b].add(a).add(c); nbs[c].add(a).add(b); }
      const NB = nbs.map(s => Int32Array.from(s));
      // 3. Taubin smoothing of the clothed parts (shrink step, then inflate step)
      const T = new Float32Array(ng * 3);
      for (let it = 0; it < 16; it++) {
        const lam = it % 2 ? -0.53 : 0.5;
        for (let a = 0; a < ng; a++) {
          const nb = NB[a], m = mask[a]; if (!m || !nb.length) { T[a * 3] = G[a * 3]; T[a * 3 + 1] = G[a * 3 + 1]; T[a * 3 + 2] = G[a * 3 + 2]; continue; }
          let sx = 0, sy = 0, sz = 0; for (const b of nb) { sx += G[b * 3]; sy += G[b * 3 + 1]; sz += G[b * 3 + 2]; }
          const k = lam * m / nb.length;
          T[a * 3] = G[a * 3] + (sx - G[a * 3] * nb.length) * k; T[a * 3 + 1] = G[a * 3 + 1] + (sy - G[a * 3 + 1] * nb.length) * k; T[a * 3 + 2] = G[a * 3 + 2] + (sz - G[a * 3 + 2] * nb.length) * k;
        }
        G.set(T);
      }
      // 4. write back, normals averaged over the welded groups
      const N = new Float32Array(ng * 3), e1 = new THREE.Vector3(), e2 = new THREE.Vector3(), fn = new THREE.Vector3();
      for (let t = 0; t < ix.length; t += 3) {
        const a = gid[ix[t]], b = gid[ix[t + 1]], c = gid[ix[t + 2]];
        e1.set(G[b * 3] - G[a * 3], G[b * 3 + 1] - G[a * 3 + 1], G[b * 3 + 2] - G[a * 3 + 2]); e2.set(G[c * 3] - G[a * 3], G[c * 3 + 1] - G[a * 3 + 1], G[c * 3 + 2] - G[a * 3 + 2]);
        fn.crossVectors(e1, e2); for (const q of [a, b, c]) { N[q * 3] += fn.x; N[q * 3 + 1] += fn.y; N[q * 3 + 2] += fn.z; }
      }
      const NA = g.attributes.normal, nmat = new THREE.Matrix3().getNormalMatrix(bmi);
      for (let i = 0; i < n; i++) {
        const a = gid[i]; v.set(G[a * 3], G[a * 3 + 1], G[a * 3 + 2]).applyMatrix4(bmi); P.setXYZ(i, v.x, v.y, v.z);
        if (NA && mask[a] > 0) {   // keep the authored normals on skin (face, hands); new ones where the shape changed
          v.set(N[a * 3], N[a * 3 + 1], N[a * 3 + 2]).applyMatrix3(nmat).normalize(); NA.setXYZ(i, v.x, v.y, v.z);
        }
      }
      P.needsUpdate = true; if (NA) NA.needsUpdate = true;
      g.computeBoundingSphere(); g.computeBoundingBox();
      // measurements for clothes and accessories (bind pose, metres): kept with the geometry
      const W = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) { const a = gid[i]; W[i * 3] = G[a * 3]; W[i * 3 + 1] = G[a * 3 + 1]; W[i * 3 + 2] = G[a * 3 + 2]; }
      g.userData.bindPts = W;
    }
    // body measurements in the bind pose: the crown, a horizontal section, a surface point
    function bodyInfo(mesh) {
      const g = mesh.geometry; if (g.userData.info) return g.userData.info;
      const W = g.userData.bindPts, n = W.length / 3;
      let top = -1e9; for (let i = 0; i < n; i++) top = Math.max(top, W[i * 3 + 1]);
      const section = (y, dy, xmax) => {   // centre and half-widths of the body around height y
        let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
        for (let i = 0; i < n; i++) { const x = W[i * 3], yy = W[i * 3 + 1], z = W[i * 3 + 2]; if (Math.abs(yy - y) > dy || Math.abs(x) > xmax) continue; x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
        return { cx: (x0 + x1) / 2, cz: (z0 + z1) / 2, rx: (x1 - x0) / 2, rz: (z1 - z0) / 2, z0, z1 };
      };
      const surf = (x, y, front, r) => {    // the body's front (or back) surface z near (x, y)
        r = r || 0.03; let best = front ? -1e9 : 1e9;
        for (let i = 0; i < n; i++) { if (Math.abs(W[i * 3] - x) > r || Math.abs(W[i * 3 + 1] - y) > r) continue; const z = W[i * 3 + 2]; best = front ? Math.max(best, z) : Math.min(best, z); }
        return best;
      };
      const ridge = (x, zr) => {            // highest point at lateral x (the top of the shoulder), below the head
        let best = -1e9; for (let i = 0; i < n; i++) { if (Math.abs(W[i * 3] - x) > 0.025 || Math.abs(W[i * 3 + 2]) > zr || W[i * 3 + 1] > top - 0.28) continue; best = Math.max(best, W[i * 3 + 1]); }
        return best;
      };
      return (g.userData.info = { top, section, surf, ridge });
    }

    function mouthInfo(body) {
      const g = body.geometry; if (g.userData.mouth) return g.userData.mouth;
      const P = g.attributes.position, SI = g.attributes.skinIndex.array, SW = g.attributes.skinWeight.array, hi = body.skeleton.bones.findIndex(b => b.name === 'Head');
      let nz = -1e9, ny = 0; const front = [];
      for (let i = 0; i < P.count; i++) {
        let w = 0; for (let k = 0; k < 4; k++) if (SI[i * 4 + k] === hi) w += SW[i * 4 + k];
        if (w < 0.5 || Math.abs(P.getX(i)) > 0.02) continue;
        const y = P.getY(i), z = P.getZ(i); front.push([y, z]); if (z > nz) { nz = z; ny = y; }
      }
      let cy = ny; for (const [y, z] of front) if (z > nz - 0.04 && y < cy) cy = y;
      return (g.userData.mouth = { chinY: cy, noseY: ny, noseZ: nz, mouthY: cy + 0.55 * (ny - cy), hingeY: ny - 0.004, hingeZ: nz - 0.11 });
    }
    function clothMaterial(src, U) {
      const m = src.clone();
      m.onBeforeCompile = sh => {
        Object.assign(sh.uniforms, U);
        // clothes have volume: push them out along the normal (puffer / fleece jacket or sweater, trousers, boots);
        // a shawl over the shoulders adds its own thickness
        sh.vertexShader = sh.vertexShader.replace('#include <common>', `#include <common>
attribute vec4 cloth; varying vec4 vCloth; varying vec3 vOP; varying float vShawl; uniform vec3 uPuff; uniform float uShawlOn, uH; uniform float uJaw; uniform vec4 uMouth;
float shawlMask(vec3 p, vec4 c) {
  float y = p.y / uH, edge = (p.z > 0.0 ? 0.705 : 0.63) + abs(p.x) * 0.22;
  return uShawlOn * smoothstep(0.4, 0.7, c.y) * (1.0 - smoothstep(0.28, 0.32, abs(p.x))) * smoothstep(edge, edge + 0.006, y);
}`)
          .replace('#include <begin_vertex>', '#include <begin_vertex>\nvCloth = cloth; vOP = position; vShawl = shawlMask(position, cloth);\ntransformed += objectNormal * (dot(cloth.yzw, uPuff) + vShawl * 0.012);\n' +
            // the jaw: the face below the mouth line turns down about a hinge under the ears (there is no jaw bone in the rig)
            'if (uJaw > 0.001) { float jw = smoothstep(uMouth.x + 0.004, uMouth.x - 0.004, position.y) * smoothstep(uMouth.y - 0.045, uMouth.y - 0.004, position.y) * smoothstep(uMouth.w - 0.02, uMouth.w + 0.05, position.z) * (1.0 - smoothstep(0.045, 0.08, abs(position.x)));\n' +
            '  float ja = uJaw * 0.26 * jw, jc = cos(ja), js = sin(ja); vec2 jr = vec2(transformed.y - uMouth.z, transformed.z - uMouth.w);\n' +
            '  transformed.y = uMouth.z + jr.x * jc - jr.y * js; transformed.z = uMouth.w + jr.x * js + jr.y * jc; }');
        sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform vec3 uTop; uniform vec3 uBottom; uniform vec3 uShoe; uniform vec3 uShawl; uniform float uQuilt, uKnit, uZip, uH; varying vec4 vCloth; varying vec3 vOP; varying float vShawl;')
          .replace('#include <map_fragment>', `#include <map_fragment>
  {
    float cw = vCloth.y + vCloth.z + vCloth.w, top = smoothstep(0.4, 0.7, vCloth.y), leg = smoothstep(0.4, 0.7, vCloth.z), yy = vOP.y / uH;
    vec3 cc = (uTop * vCloth.y + uBottom * vCloth.z + uShoe * vCloth.w) / max(cw, 1e-3);
    // fabric: fine weave + soft folds so it does not read as paint
    float weave = 0.93 + 0.07 * sin(vUv.x * 1400.0) * sin(vUv.y * 1400.0);
    float fold = 0.9 + 0.1 * sin(vUv.y * 90.0 + sin(vUv.x * 60.0) * 2.0);
    // puffer jacket quilting: horizontal baffles on the jacket only
    float q = abs(fract(vOP.y * 8.5) - 0.5) * 2.0;
    float quilt = mix(1.0, 0.72 + 0.28 * smoothstep(0.0, 0.35, q), uQuilt * top);
    // hand-knitted wool sweater: vertical ribs and a fine stitch
    float rib = 0.84 + 0.16 * smoothstep(0.15, 0.85, abs(fract((vOP.x + vOP.z * 0.6) * 95.0) - 0.5) * 2.0);
    float knit = mix(1.0, rib * (0.94 + 0.06 * sin(vOP.y * 1100.0)), uKnit * top);
    // jacket zip down the front; side pockets on trekking trousers; boot soles
    float zip = uZip * top * step(0.035, vOP.z) * (1.0 - smoothstep(0.004, 0.007, abs(vOP.x))) * step(yy, 0.81);
    float ax = abs(vOP.x), py = yy - 0.3;
    float pocket = uZip * leg * step(-0.03, vOP.z) * step(0.0, py) * step(py, 0.085) * step(0.12, ax) * step(ax, 0.2);
    float pedge = pocket * (1.0 - step(0.006, min(min(ax - 0.12, 0.2 - ax), min(py, 0.085 - py) * 1.8)));
    float sole = smoothstep(0.4, 0.7, vCloth.w) * (1.0 - step(0.035, vOP.y));
    vec3 col = cc * weave * fold * quilt * knit * (1.0 - 0.6 * zip) * (1.0 - 0.35 * pedge) * (1.0 - 0.6 * sole);
    // a woollen shawl round the shoulders (Kullu weave: fine check, a coloured border along its edge)
    if (vShawl > 0.0) {
      float edge = (vOP.z > 0.0 ? 0.705 : 0.63) + abs(vOP.x) * 0.22, d = yy - edge;
      float chk = 0.9 + 0.1 * step(0.5, fract(vOP.x * 60.0)) * step(0.5, fract(vOP.y * 60.0));
      float border = step(d, 0.03) * step(0.008, d);
      vec3 sc = uShawl * chk * weave;
      sc = mix(sc, vec3(0.42, 0.06, 0.05) * (0.8 + 0.2 * step(0.5, fract(vOP.x * 40.0 + vOP.z * 40.0))), border);
      col = mix(col, sc, vShawl);
    }
    diffuseColor.rgb = mix(diffuseColor.rgb, col, smoothstep(0.3, 0.6, cw));
  }`)
          // fabric hides the muscle detail of the base body's normal map
          .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\nnormal = normalize(mix(normal, geometryNormal, 0.97 * smoothstep(0.3, 0.6, vCloth.y + vCloth.z + vCloth.w)));')
          .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.92, smoothstep(0.3, 0.6, vCloth.y + vCloth.z + vCloth.w));');
      };
      m.customProgramCacheKey = () => 'hikercloth2';
      return m;
    }

    /* ---------- palettes ----------
       Hikers (Oct/Nov on the trail): puffer and fleece jackets, trekking trousers, boots, a rucksack.
       Shopkeepers (Himachali chai-stall owners at 2,000-2,800 m): a Himachali topi, a thick hand-knitted sweater,
       often a woollen shawl over it and a muffler, a kurta hanging below the sweater, loose pyjama trousers. */
    const TOPS = [0x2f4f7f, 0xb8432f, 0x2e2e33, 0x3f6b3a, 0xd9a321, 0x6a2c5a, 0x1f6f78, 0xe0e0dc, 0x8a2f2f, 0x4a5a6a, 0xf08a24, 0x274060];
    const BOTTOMS = [0x1f2228, 0x2b2f38, 0x3a3f4a, 0x23282e, 0x4b4a3e, 0x2d3540, 0x5a4a3a];
    const SHOES = [0x2a2420, 0x3a3a3a, 0x5a3d26, 0x6a6a6a, 0x1c1c1c];
    const PACKS = [0x9a3b2a, 0x2f4f7f, 0x3a3a3a, 0x3f6b3a, 0xd9a321, 0x5a4a3a];
    const SWEATERS = [0x6b4a3a, 0x5a5f66, 0x7a2f35, 0x4a5240, 0x8a7a64, 0x3d3a44, 0x9a8f80];
    const SHAWLS = [0xb8a88a, 0x6a5040, 0x8f8676, 0x5a4a3c, 0xcfc6b2];
    const MUFFLERS = [0x7a2f35, 0x3f4a6a, 0x5a5a52, 0x8a6a2a, 0x2e3a2e];
    const pick = a => a[(R() * a.length) | 0];
    function look(sex) {
      return { sex, top: pick(TOPS), bottom: pick(BOTTOMS), shoe: pick(SHOES), pack: R() < 0.75 ? pick(PACKS) : null,
               head: sex === 'f' ? (R() < 0.5 ? 'hair' : 'beanie') : (R() < 0.4 ? 'cap' : R() < 0.7 ? 'beanie' : 'hair'),
               hairStyle: sex === 'f' ? 'Hair_Long' : (R() < 0.6 ? 'Hair_SimpleParted' : 'Hair_Buzzed'), beard: sex === 'm' && R() < 0.35,
               capCol: pick([0xb8432f, 0x2e2e33, 0x2f4f7f, 0xd9a321, 0xe0e0dc, 0x3f6b3a, 0x8a2f2f]), puffer: R() < 0.6, hiker: true,
               scale: sex === 'f' ? 0.93 + R() * 0.05 : 0.9 + R() * 0.07 };
    }
    // a real player's kit (theirs and everyone else's view of them): trekking jacket, bag and cap by player id
    const P_TOPS = [0x2a5d86, 0x7a2e4a, 0x3f6b3a, 0xb8432f, 0x2e2e33, 0xd9a321, 0x4a3f7a, 0x1f7a7a];
    const P_PACKS = [0xa8452c, 0x2f6f8a, 0xe0b021, 0x3a5a2a, 0x6b2f6b, 0x222428];
    function playerLook(sex, seed) {
      const f = sex === 'f', h = (seed >>> 0) || (f ? 1 : 0);
      return { sex: f ? 'f' : 'm', top: P_TOPS[h % P_TOPS.length], bottom: f ? 0x2f3440 : 0x3b4036, shoe: 0x5a3d26, pack: P_PACKS[(h >>> 4) % P_PACKS.length],
               head: 'beanie', capCol: [0x8a2f2f, 0xd9a321, 0x2e2e33, 0xe0e0dc, 0x3f6b3a][(h >>> 8) % 5], puffer: true, hiker: true,
               scale: f ? 0.92 : 0.95, hairStyle: f ? 'Hair_Long' : 'Hair_SimpleParted', beard: false };
    }
    function keeperLook() {
      return { sex: 'm', top: pick(SWEATERS), bottom: pick([0xd9d2c3, 0xcfc8b8, 0x8a8478, 0x5a5650]), shoe: pick([0x3a2a20, 0x2a2420, 0x4a4038]), pack: null,
               head: 'topi', topi: (R() * 3) | 0, topiBody: pick([0x3a3a3a, 0x4a4540, 0xd8d2c4]), hairStyle: 'Hair_Buzzed', beard: R() < 0.5,
               knit: true, puffer: false, hiker: false, shawl: R() < 0.55 ? pick(SHAWLS) : null, muffler: R() < 0.6 ? pick(MUFFLERS) : null,
               kurta: R() < 0.7 ? pick([0xe8e2d4, 0xdcd4c0, 0xc8c0ae]) : null, scale: 0.9 + R() * 0.06 };
    }

    /* ---------- full character (skinned, animated) ---------- */
    const SRC = { m: gm, f: gf };
    const tmpM = new THREE.Matrix4();
    function attach(bone, obj, worldMatrix) {
      // place obj at worldMatrix (character in bind pose at the origin), then parent it to the bone
      bone.updateWorldMatrix(true, false);
      obj.matrixAutoUpdate = false; obj.matrix.copy(tmpM.copy(bone.matrixWorld).invert().multiply(worldMatrix)); bone.add(obj);
    }
    const accMat = (c, rough) => new THREE.MeshStandardMaterial({ color: lin(c), roughness: rough == null ? 0.85 : rough, metalness: 0 });
    const T4 = (x, y, z) => new THREE.Matrix4().makeTranslation(x, y, z);
    // a box with rounded edges (rucksack panels, pockets)
    function roundedBox(w, h, d, r) {
      const g = new THREE.BoxGeometry(w, h, d, 5, 6, 4), p = g.attributes.position, v = new THREE.Vector3(), c = new THREE.Vector3();
      const hx = w / 2 - r, hy = h / 2 - r, hz = d / 2 - r;
      for (let i = 0; i < p.count; i++) {
        v.fromBufferAttribute(p, i); c.set(Math.max(-hx, Math.min(hx, v.x)), Math.max(-hy, Math.min(hy, v.y)), Math.max(-hz, Math.min(hz, v.z)));
        v.sub(c); if (v.lengthSq() > 1e-12) v.setLength(r); v.add(c); p.setXYZ(i, v.x, v.y, v.z);
      }
      g.computeVertexNormals(); return g;
    }
    // merge parts into one geometry (one draw call): [{ g, m: Matrix4, c: colour (optional, vertex colours) }]
    function mergeParts(parts, uv) {
      const pos = [], nor = [], col = [], uvs = [], idx = []; let base = 0; const nm = new THREE.Matrix3(), v = new THREE.Vector3(), cc = new THREE.Color();
      for (const { g: g0, m, c } of parts) {
        const g = g0.index ? g0 : g0.toNonIndexed(); const P = g.attributes.position, N = g.attributes.normal, UV = g.attributes.uv;
        nm.getNormalMatrix(m); if (c != null) cc.copy(lin(c));
        for (let i = 0; i < P.count; i++) {
          v.fromBufferAttribute(P, i).applyMatrix4(m); pos.push(v.x, v.y, v.z);
          v.fromBufferAttribute(N, i).applyMatrix3(nm).normalize(); nor.push(v.x, v.y, v.z);
          if (c != null) col.push(cc.r, cc.g, cc.b); if (uv) uvs.push(UV ? UV.getX(i) : 0, UV ? UV.getY(i) : 0);
        }
        if (g.index) for (const i of g.index.array) idx.push(i + base); else for (let i = 0; i < P.count; i++) idx.push(i + base);
        base += P.count;
      }
      const out = new THREE.BufferGeometry();
      out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
      if (col.length) out.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); if (uv) out.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      out.setIndex(idx); out.computeBoundingSphere(); return out;
    }
    const M4c = (x, y, z, rx, rz) => new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx || 0, 0, rz || 0)).setPosition(x, y, z);
    // a flat padded strap along a curve, lying against the body (its broad side faces out from the spine's axis)
    function ribbon(curve, w, t, axis) {
      const N = 28, pos = [], idx = [], o = new THREE.Vector3(), tg = new THREE.Vector3(), side = new THREE.Vector3(), p = new THREE.Vector3();
      for (let i = 0; i <= N; i++) {
        curve.getPointAt(i / N, p); curve.getTangentAt(i / N, tg);
        const k = Math.max(0, Math.min(1, (p.y - axis.y - 0.1) / 0.08));        // over the shoulder the strap faces up
        o.set(p.x * (1 - k), k, (p.z - axis.z) * (1 - k)).normalize(); o.addScaledVector(tg, -o.dot(tg)).normalize();
        side.crossVectors(tg, o).normalize().multiplyScalar(w / 2);
        for (const [a, b] of [[1, 0], [-1, 0], [-1, 1], [1, 1]]) pos.push(p.x + side.x * a + o.x * t * b, p.y + side.y * a + o.y * t * b, p.z + side.z * a + o.z * t * b);
      }
      for (let i = 0; i < N; i++) for (let f = 0; f < 4; f++) {
        const a = i * 4 + f, b = i * 4 + (f + 1) % 4, c = a + 4, d = b + 4; idx.push(a, c, b, b, c, d);
      }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals(); return g;
    }
    // canvas textures: knitted rib (beanies), the patterned front band of a Himachali topi
    const ribTex = (() => { const c = document.createElement('canvas'); c.width = 128; c.height = 32; const x = c.getContext('2d');
      x.fillStyle = '#fff'; x.fillRect(0, 0, 128, 32); for (let i = 0; i < 128; i += 4) { x.fillStyle = 'rgba(0,0,0,0.22)'; x.fillRect(i, 0, 1.5, 32); }
      for (let j = 0; j < 32; j += 3) { x.fillStyle = 'rgba(0,0,0,0.06)'; x.fillRect(0, j, 128, 1); }
      const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(6, 1); return t; })();
    const TOPI_BANDS = [['#1f5a3a', '#e8c040', '#c0302a'], ['#7a1f2a', '#e8c040', '#2a7a4a'], ['#1f3a7a', '#e8a030', '#e8e0d0']].map(([bg, a, b]) => {
      const c = document.createElement('canvas'); c.width = 256; c.height = 32; const x = c.getContext('2d');
      x.fillStyle = bg; x.fillRect(0, 0, 256, 32); x.fillStyle = a; x.fillRect(0, 2, 256, 3); x.fillRect(0, 27, 256, 3);
      for (let i = 0; i < 256; i += 16) { x.fillStyle = b; x.beginPath(); x.moveTo(i + 8, 8); x.lineTo(i + 14, 16); x.lineTo(i + 8, 24); x.lineTo(i + 2, 16); x.closePath(); x.fill();
        x.fillStyle = a; x.fillRect(i + 7, 14, 2, 4); }
      const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; t.wrapS = THREE.RepeatWrapping; t.repeat.set(3, 1);
      return new THREE.MeshStandardMaterial({ map: t, roughness: 0.75 });
    });
    // head-hugging shell from the band at height y0 up to the crown (beanie, cap crown)
    function headShell(rx, rz, h, bulge) {
      const pts = []; for (let i = 0; i <= 10; i++) { const t = i / 10, a = t * Math.PI / 2; pts.push(new THREE.Vector2(Math.max(0.001, Math.pow(Math.cos(a), 0.7) * (1 + bulge * Math.sin(a * 2))), Math.sin(a) * h)); }
      const g = new THREE.LatheGeometry(pts, 24); g.scale(rx, 1, rz); return g;
    }
    function makeChar(sex) {
      const g = SRC[sex], root = THREE.SkeletonUtils.clone(g.scene);
      const U = { uTop: { value: new THREE.Color() }, uBottom: { value: new THREE.Color() }, uShoe: { value: new THREE.Color() }, uShawl: { value: new THREE.Color() },
                  uPuff: { value: new THREE.Vector3(0.04, 0.018, 0.012) }, uQuilt: { value: 1 }, uKnit: { value: 0 }, uZip: { value: 1 }, uShawlOn: { value: 0 }, uH: { value: 1.8 },
                  uJaw: { value: 0 }, uMouth: { value: new THREE.Vector4(1.616, 1.578, 1.642, 0.0) } };
      let body = null, head = null, spine = null, neck = null, pelvis = null;
      root.traverse(n => {
        if (n.isSkinnedMesh) {
          if (/Superhero/i.test(n.material.name)) { clothAttr(n); reshape(n, sex); n.material = clothMaterial(n.material, U); body = n; }
          // animations play in place, so the bind-pose bounds (padded for swinging arms) are safe to cull with
          if (!n.geometry.boundingSphere) n.geometry.computeBoundingSphere();
          if (!n.geometry.userData.padded) { n.geometry.boundingSphere.radius *= 1.35; n.geometry.userData.padded = true; }
          n.frustumCulled = true; n.castShadow = true; n.receiveShadow = true;
        }
        if (n.isBone && n.name === 'Head') head = n;
        if (n.isBone && n.name === 'spine_03') spine = n;
        if (n.isBone && n.name === 'neck_01') neck = n;
        if (n.isBone && n.name === 'pelvis') pelvis = n;
      });
      root.updateMatrixWorld(true);
      const B = bodyInfo(body); U.uH.value = B.top;
      // the mouth, from the face itself: chin (lowest front point), nose (most forward), the lips between them;
      // the jaw hinges under the ears. A dark mouth inside shows when the jaw opens.
      const M = mouthInfo(body); U.uMouth.value.set(M.mouthY, M.chinY, M.hingeY, M.hingeZ);
      const hp = new THREE.Vector3().setFromMatrixPosition(head.matrixWorld), sp = new THREE.Vector3().setFromMatrixPosition(spine.matrixWorld);
      const np = new THREE.Vector3().setFromMatrixPosition(neck.matrixWorld);
      const acc = { pack: null, cap: null, beanie: null, topi: null, muffler: null, kurta: null, collar: null, hair: {} };
      { const cav = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 6), new THREE.MeshBasicMaterial({ color: 0x2a0d0b })); cav.castShadow = false;
        attach(head, cav, T4(0, M.mouthY - 0.006, M.noseZ - 0.052).multiply(new THREE.Matrix4().makeScale(0.022, 0.012, 0.018))); acc.mouth = cav; }
      const puffT = 0.045;   // the jacket's thickness over the body (uPuff.x for a puffer)

      // rucksack: rounded main bag against the back, a lid, a front pocket, side bottles, a sleeping mat under it,
      // shoulder straps over the shoulders and down the chest, a chest strap, trekking poles strapped on the side
      // (two draw calls: the bag in its colour, everything else merged with vertex colours; only the bag casts a shadow)
      const pack = new THREE.Group(), packMat = accMat(0x9a3b2a, 0.8), strapMatU = accMat(0x34373c, 0.9); acc.straps = [];
      const backZ = B.surf(0, sp.y - 0.08, false, 0.05) - puffT, py = sp.y - 0.1;
      const bagG = mergeParts([{ g: roundedBox(0.31, 0.5, 0.2, 0.06), m: M4c(0, py, backZ - 0.105) }, { g: roundedBox(0.29, 0.09, 0.2, 0.035), m: M4c(0, py + 0.27, backZ - 0.115) }]);
      const bag = new THREE.Mesh(bagG, packMat); bag.castShadow = true; pack.add(bag);
      const STRAP = 0x34373c, rest = [
        { g: roundedBox(0.2, 0.18, 0.05, 0.02), m: M4c(0, py - 0.1, backZ - 0.215), c: STRAP },
        { g: new THREE.CylinderGeometry(0.032, 0.032, 0.2, 10), m: M4c(0.175, py - 0.1, backZ - 0.11), c: 0x8fb3c8 },
        { g: new THREE.CylinderGeometry(0.032, 0.032, 0.2, 10), m: M4c(-0.175, py - 0.1, backZ - 0.11), c: 0x3a6a4a },
        { g: new THREE.CylinderGeometry(0.07, 0.07, 0.36, 12), m: M4c(0, py - 0.31, backZ - 0.1, 0, Math.PI / 2), c: 0x3c6b45 }];
      for (const s of [-1, 1]) rest.push({ g: new THREE.CylinderGeometry(0.009, 0.007, 0.62, 6), m: M4c(s * 0.18, py + 0.02, backZ - 0.16, 0, s * 0.12), c: 0x4a4f56 });
      for (const s of [-1, 1]) {
        const x = s * 0.105, sh = B.ridge(x, 0.08) + puffT + 0.012;
        const f1 = B.surf(x, sp.y - 0.02, true) + puffT + 0.012, f2 = B.surf(s * 0.12, sp.y - 0.2, true) + puffT + 0.01;
        // the shoulder part rides on the collarbone (it moves with the shoulder when the arm comes up); the part
        // down the chest and round to the bag's bottom stays with the chest
        const upper = new THREE.CatmullRomCurve3([
          new THREE.Vector3(s * 0.09, py + 0.2, backZ - 0.02), new THREE.Vector3(x, sh - 0.01, (backZ + f1) * 0.5 - 0.03), new THREE.Vector3(x, sh - 0.06, f1 - 0.01), new THREE.Vector3(x, sp.y - 0.04, f1)]);
        const lower = new THREE.CatmullRomCurve3([
          new THREE.Vector3(x, sp.y - 0.04, f1), new THREE.Vector3(s * 0.12, sp.y - 0.2, f2), new THREE.Vector3(s * 0.19, sp.y - 0.27, (f2 + backZ) * 0.5), new THREE.Vector3(s * 0.13, py - 0.22, backZ - 0.03)]);
        rest.push({ g: ribbon(lower, 0.05, 0.008, sp), m: new THREE.Matrix4(), c: STRAP });
        const cl = root.getObjectByName(s > 0 ? 'clavicle_l' : 'clavicle_r');
        if (cl) { const us = new THREE.Mesh(ribbon(upper, 0.05, 0.008, sp), strapMatU); attach(cl, us, new THREE.Matrix4()); acc.straps.push(us); }
        else rest.push({ g: ribbon(upper, 0.05, 0.008, sp), m: new THREE.Matrix4(), c: STRAP });
        if (s > 0) rest.push({ g: new THREE.BoxGeometry(0.22, 0.015, 0.01), m: M4c(0, sp.y - 0.07, f1 + 0.004), c: STRAP });
      }
      pack.add(new THREE.Mesh(mergeParts(rest), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 })));
      attach(spine, pack, new THREE.Matrix4()); acc.pack = pack; acc.packMat = packMat;

      // head wear sits on a band just above the eyebrows and follows the real head shape
      const bandY = B.top - 0.075, hs = B.section(bandY + 0.01, 0.012, 0.2);
      const beanie = new THREE.Group(), beanieMat = new THREE.MeshStandardMaterial({ color: lin(0x8a2f2f), roughness: 1, map: ribTex });
      beanie.add(new THREE.Mesh(mergeParts([{ g: headShell(hs.rx + 0.012, hs.rz + 0.012, B.top - bandY + 0.03, 0.05), m: M4c(0, 0.02, 0) },
        { g: new THREE.CylinderGeometry(1, 1, 0.045, 24, 1, true), m: M4c(0, 0.022, 0).scale(new THREE.Vector3(hs.rx + 0.019, 1, hs.rz + 0.019)) }], true), beanieMat));
      beanie.traverse(n => { if (n.isMesh) n.castShadow = true; });
      attach(head, beanie, T4(hs.cx, bandY - 0.005, hs.cz)); acc.beanie = beanie; acc.beanieMat = beanieMat;
      const cap = new THREE.Group(), capMat = accMat(0x2f4f7f, 0.8);
      cap.add(new THREE.Mesh(mergeParts([{ g: headShell(hs.rx + 0.01, hs.rz + 0.01, B.top - bandY + 0.015, 0.02), m: new THREE.Matrix4() },
        { g: new THREE.CylinderGeometry(0.085, 0.085, 0.008, 16, 1, false, -Math.PI / 2, Math.PI), m: M4c(0, 0.008, hs.rz * 0.85, 0.12).scale(new THREE.Vector3(1, 1, 0.8)) }]), capMat));
      cap.traverse(n => { if (n.isMesh) n.castShadow = true; });
      attach(head, cap, T4(hs.cx, bandY + 0.005, hs.cz)); acc.cap = cap; acc.capMat = capMat;
      // Himachali topi: a round felt cap with a flat top, its patterned band showing all round
      const topi = new THREE.Group(), topiMat = accMat(0x3a3a3a, 0.9);
      const tb = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 0.09, 24), topiMat); tb.scale.set(hs.rx + 0.016, 1, hs.rz + 0.016); tb.position.y = 0.05; topi.add(tb);
      const band = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 0.042, 24, 1, true), TOPI_BANDS[0]); band.scale.set(hs.rx + 0.019, 1, hs.rz + 0.019); band.position.y = 0.026; topi.add(band);
      topi.traverse(n => { if (n.isMesh) n.castShadow = true; });
      attach(head, topi, T4(hs.cx, bandY - 0.004, hs.cz).multiply(new THREE.Matrix4().makeRotationX(-0.06))); acc.topi = topi; acc.topiMat = topiMat; acc.topiBand = band;
      // muffler round the neck, one end hanging down the chest
      const ns = B.section(np.y + 0.035, 0.012, 0.085), mufMat = new THREE.MeshStandardMaterial({ color: lin(0x7a2f35), roughness: 1, map: ribTex });
      const muffler = new THREE.Group();
      const ring = new THREE.Mesh(new THREE.TorusGeometry(1, 0.42, 8, 20), mufMat); ring.rotation.x = Math.PI / 2; ring.scale.set(ns.rx + 0.03, ns.rz + 0.03, 0.075); muffler.add(ring);
      attach(neck, muffler, T4(ns.cx, np.y + 0.005, ns.cz)); acc.muffler = muffler; acc.mufMat = mufMat;
      const tz = B.surf(0.06, sp.y - 0.02, true, 0.04) + 0.032 + 0.012;
      const tail = new THREE.Mesh(roundedBox(0.075, 0.3, 0.018, 0.008), mufMat);
      attach(spine, tail, T4(0.06, sp.y + 0.02, tz).multiply(new THREE.Matrix4().makeRotationX(-0.12))); acc.mufTail = tail;
      // the kurta's skirt below the sweater, hanging from the hips to above the knee
      const hipY = B.top * 0.53, hip = B.section(hipY, 0.03, 0.3), kurMat = new THREE.MeshStandardMaterial({ color: lin(0xe8e2d4), roughness: 0.9, side: THREE.DoubleSide });
      const kg = new THREE.CylinderGeometry(1, 1.16, 0.34, 20, 1, true);
      const kurta = new THREE.Mesh(kg, kurMat); kurta.castShadow = true;
      // (attach() sets the matrix directly, so the size goes into it, not into .scale)
      attach(pelvis, kurta, T4(hip.cx, hipY - 0.15, hip.cz).multiply(new THREE.Matrix4().makeScale(hip.rx + 0.035, 1, hip.rz + 0.035))); acc.kurta = kurta; acc.kurMat = kurMat;
      // a jacket's stand-up collar and the folded hood behind it
      const collar = new THREE.Group(), colMat = accMat(0x2f4f7f, 0.85);
      colMat.side = THREE.DoubleSide;
      collar.add(new THREE.Mesh(mergeParts([{ g: new THREE.CylinderGeometry(1, 1.08, 0.06, 20, 1, true), m: new THREE.Matrix4().makeScale(ns.rx + 0.03, 1, ns.rz + 0.03) },
        { g: new THREE.TorusGeometry(1, 0.38, 8, 14, Math.PI), m: M4c(0, -0.03, -0.01, -Math.PI / 2 - 0.35).scale(new THREE.Vector3(ns.rx + 0.05, ns.rz + 0.06, 0.09)) }]), colMat));   // the hood lies folded round the back of the neck
      attach(neck, collar, T4(ns.cx, np.y - 0.02, ns.cz)); acc.collar = collar; acc.colMat = colMat;
      for (const k in HAIR) { const hm = HAIR[k].clone(); hm.castShadow = true; attach(head, hm, new THREE.Matrix4()); acc.hair[k] = hm; }
      const mixer = new THREE.AnimationMixer(root), actions = {};
      for (const c of g.animations) actions[c.name] = mixer.clipAction(c);
      root.visible = false; scene.add(root);
      const casters = []; root.traverse(n => { if (n.isMesh && n.castShadow) casters.push(n); });
      return { root, U, acc, mixer, actions, cur: null, sex, agent: null, casters, shadow: true, animAcc: 0 };
    }
    function dress(ch, lk) {
      const A = ch.acc, U = ch.U;
      U.uTop.value.copy(lin(lk.top)); U.uBottom.value.copy(lin(lk.bottom)); U.uShoe.value.copy(lin(lk.shoe));
      U.uQuilt.value = lk.puffer ? 1 : 0; U.uKnit.value = lk.knit ? 1 : 0; U.uZip.value = lk.hiker === false ? 0 : 1;
      U.uPuff.value.set(lk.puffer ? 0.045 : lk.knit ? 0.032 : 0.026, lk.knit ? 0.03 : 0.027, 0.014);   // a thick sweater; loose pyjamas; trekking trousers, not tights
      U.uShawlOn.value = lk.shawl ? 1 : 0; if (lk.shawl) U.uShawl.value.copy(lin(lk.shawl));
      A.pack.visible = !!lk.pack; for (const st of A.straps) st.visible = !!lk.pack; if (lk.pack) A.packMat.color.copy(lin(lk.pack));
      A.beanie.visible = lk.head === 'beanie'; A.cap.visible = lk.head === 'cap'; A.topi.visible = lk.head === 'topi';
      if (lk.head === 'beanie') A.beanieMat.color.copy(lin(lk.capCol));
      if (lk.head === 'cap') A.capMat.color.copy(lin(lk.capCol));
      if (lk.head === 'topi') { A.topiMat.color.copy(lin(lk.topiBody)); A.topiBand.material = TOPI_BANDS[lk.topi || 0]; }
      A.muffler.visible = A.mufTail.visible = !!lk.muffler; if (lk.muffler) A.mufMat.color.copy(lin(lk.muffler));
      A.kurta.visible = !!lk.kurta; if (lk.kurta) A.kurMat.color.copy(lin(lk.kurta));
      A.collar.visible = lk.hiker !== false && !lk.muffler; A.colMat.color.copy(lin(lk.top));
      for (const k in A.hair) A.hair[k].visible = (lk.head === 'hair' && k === lk.hairStyle) || (k === 'Hair_Beard' && lk.beard) ||
        (lk.head === 'topi' && k === 'Hair_Buzzed') || (lk.head !== 'hair' && k === 'Hair_Long' && lk.sex === 'f');          // long hair shows under a beanie
      ch.root.scale.setScalar(lk.scale);
    }
    // speed: ground speed in m/s for locomotion clips (Walk, Jog_Fwd), playback rate for everything else
    function play(ch, name, speed) {
      const a = ch.actions[name] || ch.actions.Idle;
      if (ch.cur !== a) {
        // a character handed to a new person starts clean: whatever the last person was doing (walking, sitting)
        // must not keep playing underneath, or the two poses blend into a half-sitting, knees-in-the-ground body
        if (!ch.cur) ch.mixer.stopAllAction();
        a.reset().play(); if (ch.cur) a.crossFadeFrom(ch.cur, 0.35, false); ch.cur = a;
      }
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
    // centre with benches either side; the three big hand-built stalls have benches 4.9 m out; 'building' cafes have none
    for (const st of stops) {
      const sx = -st.tz, sz = st.tx, kind = st.kind || 'big';
      // stalls built by places.js list their real benches and chairs
      if (st.seats) { for (const q of st.seats) seatSpots.push({ x: q.x, z: q.z, ry: q.ry, h: q.h, y: q.y, used: false, stop: st }); continue; }
      if (kind === 'building') continue;
      const out = kind === 'stall' ? -0.1 : 4.6, side = kind === 'stall' ? 2.6 : 1.7;
      for (const sd of [-1, 1]) seatSpots.push({ x: st.x + sx * sd * side + st.tx * out, z: st.z + sz * sd * side + st.tz * out, ry: Math.atan2(st.tx, st.tz), used: false, stop: st });
    }
    function newAgent(i) {
      // most hikers are on the two Triund paths; some walk up the McLeod Ganj lanes, a few go on to Snowline
      const r0 = R(), tr = r0 < 0.52 ? trails.galu : r0 < 0.8 || !trails.mcleod ? trails.shiva : r0 < 0.92 || !trails.snow ? trails.mcleod : trails.snow, up = R() < 0.55;
      const a = { id: 'bot' + i, kind: 'hiker', tr, s: 15 + R() * (tr.total - 30), dir: up ? 1 : -1, lat: 0, latT: 0.9 + R() * 0.5, v: 0,
        vWalk: up ? 0.55 + R() * 0.45 : 0.85 + R() * 0.45, state: 'walk', t: 20 + R() * 120, x: 0, y: 0, z: 0, yaw: 0, look: look(R() < 0.38 ? 'f' : 'm'),
        seat: null, anim: 'Walk', animSpeed: 1 };
      return a;
    }
    const N = quality && quality.grassDensity < 0.7 ? 60 : 100;
    for (let i = 0; i < N; i++) agents.push(newAgent(i));
    // some start sitting at stalls, some on the top meadow
    for (const a of agents.slice(0, 14)) { const sp = seatSpots[(R() * seatSpots.length) | 0]; if (sp && !sp.used) { sp.used = true; a.seat = sp; a.state = 'sit'; a.t = 20 + R() * 120; a.s = sp.stop.s; a.tr = trails[sp.stop.trail] || a.tr; const r = sitRoot(sp, a.look.scale); a.x = r.x; a.z = r.z; } }
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
    // campers: they have tents up here and stay the night (at dusk they gather round the camp fires)
    for (const a of agents.slice(26, 46)) { a.tr = trails.galu; a.s = a.tr.total - 5; a.state = 'top'; a.camper = true; a.t = 1e9; topSpot(a); a.x = a.tx; a.z = a.tz; }
    const hourNow = P => { const h = (window.TRIUND_DAY0 || 9) + (P && P.gt || 0) / 3600; return h - Math.floor(h / 24) * 24; };
    const isNight = h => h >= 17.9 || h < 5.6;
    const fireSeats = night && night.fireSeats ? night.fireSeats : [];
    // sitting cross-legged on the grass: the hips over the spot, the root 0.3 m in front (sitting clip) and 0.44 m down
    const groundSit = (seat, k) => ({ x: seat.x + Math.sin(seat.ry) * 0.3 * k, z: seat.z + Math.cos(seat.ry) * 0.3 * k, y: seat.y - 0.44 * k });
    // shopkeepers (one per stall) and the trail talkers
    const kOff = st => ({ stall: -1.9, building: 0.6 }[st.kind] != null ? { stall: -1.9, building: 0.6 }[st.kind] : 2.35);
    const keepers = stops.map((st, i) => ({ id: 'keeper' + i, kind: 'keeper', x: st.keeper ? st.keeper.x : st.x + st.tx * kOff(st), z: st.keeper ? st.keeper.z : st.z + st.tz * kOff(st), yaw: Math.atan2(st.tx, st.tz), state: 'keeper',
      look: keeperLook(), anim: 'Idle', animSpeed: 1, t: R() * 10 }));
    const fixed = keepers.concat((talkers || []).map((t, i) => ({ id: 'talker' + i, kind: 'talker', x: t.x, z: t.z, yaw: t.yaw, state: 'talker', look: t.keeper ? keeperLook() : look(i % 2 ? 'f' : 'm'), anim: 'Idle_Talking', animSpeed: 1 })));
    for (const k of fixed) k.y = H(k.x, k.z);

    // The sitting clips (Quaternius) put the hips 0.33 m behind the character's origin and the underside of the
    // thighs 0.46 m above it, feet flat at 0. So a sitter's origin goes 0.3 m in front of the seat centre and
    // 0.46 m below the seat top: then the seat is under them and their feet are on the ground in front of it.
    // (plain function with literals: it is hoisted and also used for the hikers who start the day seated)
    function sitRoot(seat, scale) {
      const SIT_FWD = 0.3, SIT_UP = 0.46, k = scale || 1, y = seat.y != null ? seat.y : H(seat.x, seat.z) + (seat.h || 0.45);
      return { x: seat.x + Math.sin(seat.ry) * SIT_FWD * k, z: seat.z + Math.cos(seat.ry) * SIT_FWD * k, y: y - SIT_UP * k };
    }
    // get up and walk back to the trail (nobody teleports)
    function leaveSeat(a) {
      if (a.seat) a.seat.used = false; a.seat = null; a.state = 'leave'; a.t = 80 + R() * 200;
    }
    function think(a, dt, P) {
      a.t -= dt;
      // in a conversation with you (talk.js): standing people stop, turn to you and talk with their hands; seated ones stay seated
      if (a.chatT > 0) {
        a.chatT -= dt; if (a.talkT > 0) a.talkT -= dt;
        if (a.state !== 'sit' && a.state !== 'fire') { a.v = 0; a.yaw = Math.atan2(P.x - a.x, P.z - a.z); a.anim = a.talkT > 0 ? 'Idle_Talking' : 'Idle'; a.animSpeed = 1; return; }
      }
      if (a.state === 'walk') {
        // keep left (Indian trails) relative to the walking direction; step aside around the hiker
        let latT = -a.dir * a.latT;
        if (o.onSteps && o.onSteps(a.tr.id, a.s)) latT *= 0.45;   // on a staircase everyone keeps to the treads
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
        // walk up to the front of the seat, then turn and sit down on it
        const sr = sitRoot(a.seat, a.look.scale), ex = sr.x - a.x, ez = sr.z - a.z, el = Math.hypot(ex, ez);
        if (el < 0.12) { a.state = 'sit'; a.yaw = a.seat.ry; }
        else { const m = Math.min(el, 0.9 * dt); a.x += ex / el * m; a.z += ez / el * m; a.yaw = yawOf(ex, ez); a.anim = 'Walk'; a.animSpeed = 0.9; }
      } else if (a.state === 'sit') {
        const sr = sitRoot(a.seat, a.look.scale); a.x = sr.x; a.z = sr.z; a.yaw = a.seat.ry;
        a.anim = R() < 0.002 ? (a.anim === 'Sitting_Idle' ? 'Sitting_Talking' : 'Sitting_Idle') : (a.anim.startsWith('Sitting') ? a.anim : 'Sitting_Idle'); a.animSpeed = 1;
        if (a.t < 0) leaveSeat(a);
      } else if (a.state === 'leave') {
        const p = trailAt(a.tr, a.s, a.lat), ex = p.x - a.x, ez = p.z - a.z, el = Math.hypot(ex, ez);
        if (el < 0.4 || (a.leaveT = (a.leaveT || 0) + dt) > 25) { a.state = 'walk'; a.leaveT = 0; }
        else { a.x += ex / el * 0.9 * dt; a.z += ez / el * 0.9 * dt; a.yaw = yawOf(ex, ez); a.anim = 'Walk'; a.animSpeed = 0.9; }
      } else if (a.state === 'top' && isNight(hourNow(P)) && !a.fseat && fireSeats.some(q => !q.used) && R() < dt * 0.5) {
        const free = fireSeats.filter(q => !q.used); let best = free[0], bd = Infinity;
        for (const q of free) { const d = (q.x - a.x) ** 2 + (q.z - a.z) ** 2 + R() * 400; if (d < bd) { bd = d; best = q; } }
        best.used = true; a.fseat = best; a.state = 'toFire'; a.warm = R() < 0.5;
      } else if (a.state === 'toFire') {
        const sr = groundSit(a.fseat, a.look.scale), ex = sr.x - a.x, ez = sr.z - a.z, el = Math.hypot(ex, ez);
        // far from the player (out of sight up on the meadow) they are simply there already
        if (el < 0.25 || (P && Math.hypot(a.x - P.x, a.z - P.z) > 45 && Math.hypot(sr.x - P.x, sr.z - P.z) > 45)) { a.state = 'fire'; a.x = sr.x; a.z = sr.z; }
        else { const sp = Math.min(0.9, el * 2); a.x += ex / el * sp * dt; a.z += ez / el * sp * dt; a.yaw = yawOf(ex, ez); a.anim = 'Walk'; a.animSpeed = sp; }
      } else if (a.state === 'fire') {
        const sr = groundSit(a.fseat, a.look.scale); a.x = sr.x; a.z = sr.z; a.yaw = a.fseat.ry;
        a.anim = 'Sitting_Idle'; a.animSpeed = 1;
        if (R() < dt * 0.04) a.warm = !a.warm;              // now hands to the fire, now resting on the knees
        if (!isNight(hourNow(P))) { a.fseat.used = false; a.fseat = null; a.state = 'top'; topSpot(a); }
      } else if (a.state === 'top') {
        const ex = a.tx - a.x, ez = a.tz - a.z, el = Math.hypot(ex, ez);
        if (el > 0.4) { a.x += ex / el * 0.8 * dt; a.z += ez / el * 0.8 * dt; a.yaw = yawOf(ex, ez); a.anim = 'Walk'; a.animSpeed = 0.8; }
        else { a.anim = a.idleAnim || (a.idleAnim = R() < 0.4 ? 'Idle_Talking' : 'Idle'); a.animSpeed = 1; if (R() < dt * 0.02) a.yaw += (R() - 0.5) * 2; }
        if (a.t < 0 && !a.camper && !isNight(hourNow(P))) { a.state = 'walk'; a.dir = -1; a.s = a.tr.total - 6; a.vWalk = 0.85 + R() * 0.45; a.idleAnim = null; const i = topSpots.findIndex(p => p.a === a); if (i >= 0) topSpots.splice(i, 1); }
      }
      if (a.state === 'walk' || a.state === 'rest') {
        // a car wants to pass (trip.js): step to the side of the road for a moment
        if (a.dodgeT > 0) { a.dodgeT -= dt; a.lat += (a.dodgeLat - a.lat) * Math.min(1, dt * 4); }
        a.s = Math.max(0, Math.min(a.tr.total, a.s));
        const p = trailAt(a.tr, a.s, a.lat); a.x = p.x; a.z = p.z; a.tdx = p.dx; a.tdz = p.dz;
        if (a.state === 'walk') a.yaw = yawOf(p.dx * a.dir, p.dz * a.dir);
      }
      // solid world: hikers slide round stalls, benches, tables, tents and houses like the player does
      // (the last metre to a seat is free, the seat itself sits inside its bench's footprint)
      if (collide && a.state !== 'sit' && a.state !== 'fire' && !(a.state === 'toFire' && Math.hypot(a.fseat.x - a.x, a.fseat.z - a.z) < 1.5) && !(a.state === 'toSeat' && a.seat && Math.hypot(a.seat.x - a.x, a.seat.z - a.z) < 1.2)) {
        const r = collide.resolve(a.x, a.z, 0.3); a.x = r.x; a.z = r.z;
      }
      if (a.state === 'sit') a.y = sitRoot(a.seat, a.look.scale).y;   // on the seat, not on the ground under it
      else if (a.state === 'fire') a.y = groundSit(a.fseat, a.look.scale).y;
      else a.y = ground && (a.state === 'walk' || a.state === 'rest') ? ground(a.x, a.z, a.tr.id, a.s, a.lat) : HM(a.x, a.z);   // on the steps where there are steps
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
    // real players from the network (net.js): same bodies as the bots, driven by their snapshots. Fixed slots so
    // the instanced proxy never has to grow; an unused slot sits far away and is never drawn
    const REMOTE_MAX = 32, FAR = 1e7;
    const remotes = []; for (let i = 0; i < REMOTE_MAX; i++) remotes.push({ id: 'remote' + i, kind: 'player', active: false, x: FAR, y: -1e4, z: FAR, yaw: 0, state: 'remote', look: look(i % 2 ? 'f' : 'm'), anim: 'Idle', animSpeed: 1, lamp: false });
    const total = agents.length + fixed.length + remotes.length;
    const proxy = new THREE.InstancedMesh(proxyGeo(), pmat, total); proxy.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(total * 3), 3);
    proxy.frustumCulled = false; proxy.castShadow = false; scene.add(proxy);
    // vColor comes from instanceColor (three defines USE_COLOR when instanceColor is set)

    /* ---------- pool of full characters for the nearest people ---------- */
    window.__crowdStage = 'agents';
    const POOL = quality && quality.grassDensity < 0.4 ? 7 : quality && quality.grassDensity < 0.7 ? 10 : 18;
    const pool = []; for (let i = 0; i < POOL; i++) { window.__crowdStage = 'char' + i; try { pool.push(makeChar(i % 3 === 2 ? 'f' : 'm')); } catch (e) { window.__crowdStage = 'charErr ' + (e && e.stack || e); throw e; } }
    window.__crowdStage = 'pool';
    const everyone = agents.concat(fixed, remotes);
    let assignT = 0;
    const M4 = new THREE.Matrix4(), Q = new THREE.Quaternion(), V = new THREE.Vector3(), S1 = new THREE.Vector3(1, 1, 1), UP = new THREE.Vector3(0, 1, 0), C = new THREE.Color();
    function assign(cam) {
      for (const p of everyone) p.d2 = (p.x - cam.x) ** 2 + (p.z - cam.z) ** 2;
      const near = everyone.filter(p => p.d2 < 90 * 90).sort((a, b) => (a.kind === 'player' ? a.d2 * 0.1 : a.d2) - (b.kind === 'player' ? b.d2 * 0.1 : b.d2));
      const want = new Set(near.slice(0, POOL * 2).filter(p => near.indexOf(p) < POOL || true).slice(0, POOL));
      // release characters whose person left the set
      for (const ch of pool) if (ch.agent && !want.has(ch.agent)) { ch.agent.ch = null; ch.agent = null; ch.root.visible = false; if (ch.torch) { ch.torch.g.visible = false; ch.torch.spot.visible = false; } }
      for (const p of want) {
        if (p.ch) continue;
        let ch = pool.find(c => !c.agent && c.sex === p.look.sex);
        // a real player always gets a body of their own sex: borrow it from the farthest bot if none is free
        if (!ch && p.kind === 'player') {
          ch = pool.filter(c => c.agent && c.agent.kind !== 'player' && c.sex === p.look.sex).sort((x, y) => y.agent.d2 - x.agent.d2)[0] || null;
          if (ch) { ch.agent.ch = null; ch.agent = null; }
        }
        ch = ch || pool.find(c => !c.agent);
        if (!ch) break;
        if (ch.sex !== p.look.sex) p.look.sex = ch.sex;
        ch.agent = p; p.ch = ch; dress(ch, p.look); ch.cur = null; ch.root.visible = true;
      }
      // only the nearest few cast shadows: every caster is drawn again into the sun's shadow map
      const byDist = pool.filter(c => c.agent).sort((a, b) => a.agent.d2 - b.agent.d2);
      byDist.forEach((c, i) => { const on = i < SHADOW_CASTERS; if (on !== c.shadow) { c.shadow = on; c.casters.forEach(m => { m.castShadow = on; }); } });
    }
    const SHADOW_CASTERS = 4;
    /* ---------- torches at night: hikers on the move carry one in the right hand ---------- */
    // not real lights (a 1 GB GPU cannot afford dozens): a glowing lens, a faint cone of light in the air and a
    // bright patch on the ground ahead of them
    let DARK = 0;
    const glowTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,240,200,0.55)'); gr.addColorStop(1, 'rgba(255,230,180,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c); })();
    const TM = {
      body: new THREE.MeshStandardMaterial({ color: 0x1f2123, roughness: 0.5, metalness: 0.4 }),
      glow: new THREE.SpriteMaterial({ map: glowTex, color: 0xfff1cf, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }),
      // the beam in the air: bright at the lens, fading to nothing a few metres out (alpha gradient along the cone)
      beam: new THREE.MeshBasicMaterial({ color: 0xfff0c8, transparent: true, opacity: 0.035, alphaMap: (()=>{const c=document.createElement('canvas');c.width=4;c.height=64;const g=c.getContext('2d'),gr=g.createLinearGradient(0,0,0,64);gr.addColorStop(0,'#fff');gr.addColorStop(0.35,'#777');gr.addColorStop(1,'#000');g.fillStyle=gr;g.fillRect(0,0,4,64);return new THREE.CanvasTexture(c);})(), blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
      spot: new THREE.MeshBasicMaterial({ map: glowTex, color: 0xfff0c8, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 })
    };
    const beamGeo = new THREE.ConeGeometry(1.0, 6, 14, 1, true); beamGeo.translate(0, -3, 0); beamGeo.rotateX(-Math.PI / 2);   // apex at the lens, opening along +z
    const bodyGeo = new THREE.CylinderGeometry(0.022, 0.03, 0.2, 8); bodyGeo.rotateX(Math.PI / 2);
    const spotGeo = new THREE.PlaneGeometry(1, 1); spotGeo.rotateX(-Math.PI / 2);
    const TV3 = new THREE.Vector3(), TQ3 = new THREE.Quaternion(), ZF = new THREE.Vector3(0, 0, 1);
    function torchOf(ch) {
      if (ch.torch) return ch.torch;
      const g = new THREE.Group(), body = new THREE.Mesh(bodyGeo, TM.body), glow = new THREE.Sprite(TM.glow), beam = new THREE.Mesh(beamGeo, TM.beam), spot = new THREE.Mesh(spotGeo, TM.spot);
      glow.scale.setScalar(0.35); glow.position.z = 0.11; beam.position.z = 0.1; g.add(body, glow, beam); g.visible = false; spot.visible = false; spot.renderOrder = 2;
      scene.add(g); scene.add(spot);
      let hand = null; ch.root.traverse(o => { if (!hand && /^hand_r$/i.test(o.name)) hand = o; });
      return (ch.torch = { g, spot, hand });
    }
    function torchTick(ch, p) {
      const on = DARK > 0.35 && (p.kind === 'player' ? p.lamp : (p.state === 'walk' || p.state === 'top' || p.state === 'leave' || p.state === 'rest')) && p.d2 < 70 * 70;
      if (!on) { if (ch.torch) { ch.torch.g.visible = false; ch.torch.spot.visible = false; } return; }
      const t = torchOf(ch), fx = Math.sin(p.ryaw), fz = Math.cos(p.ryaw);
      if (t.hand) t.hand.getWorldPosition(TV3); else TV3.set(p.x + Math.cos(p.ryaw) * -0.25, p.y + 1.0, p.z - Math.sin(p.ryaw) * -0.25);
      t.g.position.copy(TV3); t.g.quaternion.setFromUnitVectors(ZF, TV3.set(fx, -0.32, fz).normalize()); t.g.visible = true;
      const k = Math.min(1, (DARK - 0.35) * 3), d = 4.5, sx = p.x + fx * d, sz = p.z + fz * d;
      t.spot.position.set(sx, HM(sx, sz) + 0.06, sz); t.spot.scale.set(3.2, 1, 4.2); t.spot.rotation.y = p.ryaw; t.spot.visible = true;
      TM.spot.opacity = 0.5 * k; TM.beam.opacity = 0.035 * k;
    }
    const FR = new THREE.Frustum(), PM = new THREE.Matrix4(), SPH = new THREE.Sphere();

    // a round steel serving tray with a rolled rim (what every chai stall uses)
    const trayMesh = (() => {
      const g = new THREE.Group(), m = new THREE.MeshStandardMaterial({ color: 0xc9ccd0, roughness: 0.32, metalness: 0.85 });
      const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.19, 0.008, 28), m); g.add(plate);
      const rim = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.007, 6, 32), m); rim.rotation.x = Math.PI / 2; rim.position.y = 0.006; g.add(rim);
      g.traverse(n => { if (n.isMesh) n.castShadow = true; });
      return g;
    })();
    /* ---------- a shopkeeper cooks an order and walks it out to the customer ---------- */
    // phases: cook (at the stove) -> walk (out round the side of the stall, then to the customer) -> give -> back
    function keeperTask(k, dt) {
      const T = k.task, st = T.stop;
      // the order rides on a round steel tray held in both hands at the waist; when handing it over the tray moves
      // to the left hand and the right hand takes the glass or plate off it and sets it down at the drop point
      const carry = (reach) => {
        const tr = k.tray; if (!tr) return;
        tr.visible = true;
        const fx = Math.sin(k.yaw), fz = Math.cos(k.yaw), lx = Math.cos(k.yaw), lz = -Math.sin(k.yaw), sc = (k.look && k.look.scale) || 0.93;
        const y = (k.y || H(k.x, k.z)) + 0.97 * sc;
        const C = T.trayC || (T.trayC = new THREE.Vector3()), hl = T.hl || (T.hl = new THREE.Vector3()), hr = T.hr || (T.hr = new THREE.Vector3());
        if (reach == null) {
          C.set(k.x + fx * 0.33, y, k.z + fz * 0.33);
          hl.set(C.x + lx * 0.15, y - 0.03, C.z + lz * 0.15); hr.set(C.x - lx * 0.15, y - 0.03, C.z - lz * 0.15);
        } else {
          hl.set(k.x + fx * 0.3 + lx * 0.14, y + 0.02, k.z + fz * 0.3 + lz * 0.14); C.set(hl.x, hl.y + 0.03, hl.z);
          const home = { x: C.x - lx * 0.1, y: C.y + 0.05, z: C.z - lz * 0.1 }, d = T.dropAt || home;
          hr.set(home.x + (d.x - home.x) * reach, home.y + (d.y + 0.06 - home.y) * reach, home.z + (d.z - home.z) * reach);
        }
        tr.position.copy(C); tr.rotation.y = k.yaw;
        if (T.mesh && T.mesh.visible) {
          if (reach == null) T.mesh.position.set(C.x, C.y + 0.012, C.z); else T.mesh.position.set(hr.x, hr.y - 0.06, hr.z);
          T.mesh.rotation.set(0, k.yaw, 0);
        }
      };
      const stepTo = (x, z, v) => {
        const dx = x - k.x, dz = z - k.z, d = Math.hypot(dx, dz); if (d < 1e-3) return 0;
        const m = Math.min(d, v * dt); k.x += dx / d * m; k.z += dz / d * m;
        // walk round benches, tables and walls instead of through them (the stall itself is left by its side)
        // (not near the counter: the shopkeeper's own place is inside the stall footprint)
        const ox = k.x - dx / d * m, oz = k.z - dz / d * m;
        if (collide && Math.hypot(k.x - T.home.x, k.z - T.home.z) > (st.aside || 3.3) + 0.2) { const r = collide.resolve(k.x, k.z, 0.3); k.x = r.x; k.z = r.z; }
        // stuck against something: count it, so the caller can skip ahead
        T.stuck = Math.hypot(k.x - ox, k.z - oz) < m * 0.25 ? (T.stuck || 0) + dt : 0;
        k.y = H(k.x, k.z); k.yaw = Math.atan2(dx, dz);
        k.anim = 'Walk'; k.animSpeed = v; return d - m;
      };
      if (T.phase === 'cook') {
        k.anim = 'Interact'; k.animSpeed = 1; T.t -= dt;
        if (T.t <= 0) {
          // out of the stall round its side (the counter is in front), then into the open toward the customer
          const px = -st.tz, pz = st.tx, tg = T.target(), side = tg && ((tg.x - k.x) * px + (tg.z - k.z) * pz) < 0 ? -1 : 1;
          const as = st.aside || 3.3, w1 = { x: T.home.x + px * as * side, z: T.home.z + pz * as * side }, w2 = { x: w1.x + st.tx * 3.2, z: w1.z + st.tz * 3.2 };
          T.path = [w1, w2]; T.phase = 'walk'; if (T.mesh) T.mesh.visible = true;
          T.dropAt = T.drop ? T.drop() : null;
        }
      } else if (T.phase === 'walk') {
        const tg = T.target();
        if (!tg || Math.hypot(tg.x - T.home.x, tg.z - T.home.z) > 28) { if (T.mesh) T.mesh.visible = false; T.mesh = null; T.onGive('counter'); T.phase = 'back'; T.path.reverse(); return; }
        if (T.drop) T.dropAt = T.drop();
        if (T.path.length) { if (stepTo(T.path[0].x, T.path[0].z, 1.25) < 0.2 || T.stuck > 1.2) { T.path.shift(); T.stuck = 0; } }
        else {
          const dx = tg.x - k.x, dz = tg.z - k.z, d = Math.hypot(dx, dz);
          // within arm's reach of where it goes: in front of the seat when there is one (never over the bench)
          const ax = tg.sx != null ? tg.sx : tg.x - dx / d * 0.55, az = tg.sz != null ? tg.sz : tg.z - dz / d * 0.55;
          if (Math.hypot(ax - k.x, az - k.z) > 0.06 && !(T.stuck > 1.5 && d < 2.2)) stepTo(ax, az, 1.25);
          else { T.phase = 'give'; T.t = 1.4; T.done = [T.path[1] || T.home]; }
        }
        carry();
      } else if (T.phase === 'give') {
        const tg = T.target(); if (tg) k.yaw = Math.atan2(tg.x - k.x, tg.z - k.z);
        k.anim = 'Idle'; k.animSpeed = 1; T.t -= dt;
        const u = 1 - T.t / 1.4;                                        // right hand: off the tray (0) to the drop point (1) and back
        carry(u < 0.5 ? Math.min(1, u / 0.4) : Math.max(0, 1 - (u - 0.5) / 0.4));
        if (u >= 0.5 && !T.given) { T.given = true; T.mesh = null; T.onGive('hand'); }   // set down: the dish is the customer's now
        if (T.t <= 0) { T.phase = 'back'; const px = -st.tz, pz = st.tx, sd = ((k.x - T.home.x) * px + (k.z - T.home.z) * pz) < 0 ? -1 : 1;
          const as = st.aside || 3.3, w1 = { x: T.home.x + px * as * sd, z: T.home.z + pz * as * sd }; T.path = [{ x: w1.x + st.tx * 3.2, z: w1.z + st.tz * 3.2 }, w1]; }
      } else {   // back to the counter
        if (T.path.length) { if (stepTo(T.path[0].x, T.path[0].z, 1.15) < 0.2 || T.stuck > 1.2) { T.path.shift(); T.stuck = 0; } }
        else if (stepTo(T.home.x, T.home.z, 1.0) < 0.05 || T.stuck > 3) { k.x = T.home.x; k.z = T.home.z; k.y = H(k.x, k.z); k.yaw = T.home.yaw; k.anim = 'Idle'; k.animSpeed = 1; k.task = null; if (k.tray) k.tray.visible = false; return; }
        carry();
      }
    }

    // hikers near the camera keep a body's width apart: trail walkers step aside (their lateral offset),
    // everyone else is nudged apart directly
    const near = [];
    const TV = { f: new THREE.Vector3(), l: new THREE.Vector3(), r: new THREE.Vector3(), u: new THREE.Vector3(0, 1, 0) };
    function separate(cam, dt) {
      near.length = 0;
      for (const a of agents) if ((a.x - cam.x) ** 2 + (a.z - cam.z) ** 2 < 70 * 70 && a.state !== 'sit' && a.state !== 'fire') near.push(a);
      for (let i = 0; i < near.length; i++) for (let j = i + 1; j < near.length; j++) {
        const a = near[i], b = near[j], dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz);
        if (d > 0.7 || d < 1e-4) continue;
        const push = (0.7 - d) * 0.5;
        if (a.state === 'walk' && b.state === 'walk' && a.tr === b.tr) {
          const sgn = a.lat >= b.lat ? 1 : -1; a.lat = Math.max(-1.6, Math.min(1.6, a.lat + sgn * push)); b.lat = Math.max(-1.6, Math.min(1.6, b.lat - sgn * push));
        } else { a.x -= dx / d * push; a.z -= dz / d * push; b.x += dx / d * push; b.z += dz / d * push; }
      }
    }
    // the player cannot walk through people either: push a circle out of every hiker and shopkeeper nearby
    function pushOut(x, z, r) {
      for (const list of [agents, keepers]) for (const a of list) {
        const dx = x - a.x, dz = z - a.z, d = Math.hypot(dx, dz), m = r + 0.28;
        if (d < m && d > 1e-4) { x = a.x + dx / d * m; z = a.z + dz / d * m; }
      }
      return { x, z };
    }

    // the ground under a person's foot: on the trail that includes the step treads (the foot's own place along it)
    const groundFn = p => (x, z) => {
      if (ground && p.tr && (p.state === 'walk' || p.state === 'rest')) return ground(x, z, p.tr.id, p.s + (x - p.x) * (p.tdx || 0) + (z - p.z) * (p.tdz || 0), p.lat);
      return H(x, z);
    };
    const IK_D2 = 90 * 90;      // every full character in view (the pool is small)
    let simT = 0;
    return {
      setDark(d) { DARK = d || 0; },
      // the nearest bot or shopkeeper within r metres you could talk to (not real players, not campers asleep in tents)
      nearestPerson(P, r) {
        let best = null, bd = r || 3.2;
        for (const list of [agents, keepers]) for (const a of list) {
          if (a.kind === 'player' || (a.camper && a.state !== 'fire')) continue;
          const d = Math.hypot(a.x - P.x, a.z - P.z); if (d < bd) { bd = d; best = a; }
        }
        return best;
      },
      // keep them with you for `secs` (they stop and face you); `talk` seconds of talking with their hands
      chat(a, secs, talk) { if (!a) return; a.chatT = Math.max(a.chatT || 0, secs); if (talk) a.talkT = talk; },
      // a real player joins your view: a body for them (sex 'm' or 'f'); free it when they leave
      addRemote(sex, seed) {
        const r = remotes.find(q => !q.active); if (!r) return null;
        r.active = true; r.look = playerLook(sex, seed); r.ryaw = undefined; return r;
      },
      freeRemote(r) {
        if (!r) return; r.active = false; r.x = r.z = FAR; r.y = -1e4; r.lamp = false;
        if (r.ch) { const ch = r.ch; ch.agent = null; r.ch = null; ch.root.visible = false; if (ch.torch) { ch.torch.g.visible = false; ch.torch.spot.visible = false; } }
      },
      agents, keepers, seatSpots, pushOut, talkers: fixed.filter(k => k.kind === 'talker'),   // in the order of the game's NPC list (taxi drivers, the check post guard…)
      counts: { bots: agents.length, keepers: keepers.length, pool: POOL },
      // the shopkeeper of this stop turns to the player and hands the order over (Interact clip)
      serve(stop) { const i = stops.indexOf(stop); if (i >= 0 && !keepers[i].task) keepers[i].serveT = 2.2; },
      // cook an order for cookSec seconds, then carry `mesh` to target() and call onGive('hand' | 'counter').
      // Returns false while this shopkeeper is still busy with an earlier order.
      deliver(stop, { mesh, cookSec, target, drop, onGive }) {
        const i = stops.indexOf(stop); if (i < 0) return false; const k = keepers[i]; if (k.task) return false;
        if (!k.tray) { k.tray = trayMesh.clone(); k.tray.visible = false; scene.add(k.tray); }
        k.serveT = 0; k.task = { stop, mesh, target, drop, onGive, phase: 'cook', t: cookSec, home: { x: k.x, z: k.z, yaw: k.yaw }, path: [] };
        if (mesh) mesh.visible = false; return true;
      },
      // the player needs this seat: whoever sits there gets up and walks on
      freeSeat(spot) { for (const a of agents) if (a.seat === spot) leaveSeat(a); spot.used = false; },
      sitRoot, groundFn,
      busy(stop) { const i = stops.indexOf(stop); return i >= 0 && !!keepers[i].task; },
      update(dt, cam, P, camera) {
        if (camera) FR.setFromProjectionMatrix(PM.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
        for (const a of agents) think(a, dt, P);
        separate(cam, dt);
        for (const k of keepers) { if (k.task) { keeperTask(k, dt); continue; }
          // a shopkeeper stands quietly behind his counter: he looks up and greets you when you come close (a few
          // seconds of talking), now and then works at the stove for a moment, otherwise just stands; he turns to
          // you only while you are at the counter, slowly, and back to the front when you leave
          const dp = Math.hypot(P.x - k.x, P.z - k.z), home = k.homeYaw != null ? k.homeYaw : (k.homeYaw = k.yaw);
          if (k.serveT > 0) { k.serveT -= dt; k.anim = 'Interact'; k.yaw = Math.atan2(P.x - k.x, P.z - k.z); continue; }   // handing over an order
          if (k.chatT > 0) { k.chatT -= dt; if (k.talkT > 0) k.talkT -= dt; k.anim = k.talkT > 0 ? 'Idle_Talking' : 'Idle'; k.yaw += window.TriundAnim.angDiff(k.yaw, Math.atan2(P.x - k.x, P.z - k.z)) * Math.min(1, dt * 4); continue; }   // talking with you
          if (dp < 5 && !k.greeted) { k.greeted = true; k.talkT = 2.6; } else if (dp > 9) k.greeted = false;
          k.t = (k.t || 8 + R() * 10) - dt;
          if (k.talkT > 0) { k.talkT -= dt; k.anim = 'Idle_Talking'; }
          else if (k.workT > 0) { k.workT -= dt; k.anim = 'Interact'; }
          else { k.anim = 'Idle'; if (k.t < 0) { k.t = 25 + R() * 30; if (dp > 3) k.workT = 2.2; } }
          const want = dp < 4.5 ? Math.atan2(P.x - k.x, P.z - k.z) : home;
          k.yaw += window.TriundAnim.angDiff(k.yaw, want) * Math.min(1, dt * 2.5); }
        assignT -= dt; if (assignT <= 0) { assignT = 0.4; assign(cam); }
        let n = 0;
        // people turn through switchbacks instead of snapping to the new heading (about 0.25 s)
        const turnK = 1 - Math.exp(-dt * 7);
        for (const p of everyone) {
          if (p.ryaw === undefined) p.ryaw = p.yaw; else p.ryaw += window.TriundAnim.angDiff(p.ryaw, p.yaw) * turnK;
          if (p.ch) {
            const ch = p.ch; ch.root.position.set(p.x, p.y, p.z); ch.root.rotation.y = p.ryaw;
            play(ch, p.anim, p.animSpeed);
            if (!p.keeper) torchTick(ch, p);
            // skin animation is CPU work per bone: skip people out of view, and step distant ones at a lower rate
            ch.animAcc += dt;
            const seen = !camera || FR.intersectsSphere(SPH.set(ch.root.position, 1.6));
            const step = !seen ? 0.25 : p.d2 > 35 * 35 ? 1 / 20 : 0;
            if (ch.animAcc >= step) {
              ch.mixer.update(ch.animAcc); ch.animAcc = 0;
              // feet on the slope and on the steps instead of through them (near people in view only)
              if (seen && p.d2 < IK_D2 && !(p.anim && p.anim.startsWith('Sitting'))) window.TriundAnim.legIK(THREE, ch.root, p.gfn || (p.gfn = groundFn(p)), p.y);
              if (p.state === 'fire' && seen && p.d2 < IK_D2) {
                window.TriundAnim.pose(THREE, ch.root, 'cross', { hands: !p.warm });
                if (p.warm && p.fseat) {   // palms to the fire
                  const f = p.fseat.fire, fx = Math.sin(p.ryaw), fz = Math.cos(p.ryaw), lx = Math.cos(p.ryaw), lz = -Math.sin(p.ryaw), k = p.look.scale, hy = p.y + 0.44 * k + 0.5 * k;
                  const tgt = sd => { const s2 = sd === 'l' ? 1 : -1; return { p: TV.f.clone().set(p.x - fx * 0.3 * k + fx * 0.5 * k + lx * s2 * 0.12, hy, p.z - fz * 0.3 * k + fz * 0.5 * k + lz * s2 * 0.12), dir: TV.u.clone().set(fx * 0.3, 0.95, fz * 0.3).normalize(), thumb: TV.l.clone().set(-lx * s2, 0, -lz * s2) }; };
                  window.TriundAnim.armIK(THREE, ch.root, { l: tgt('l'), r: tgt('r') }, p.ryaw);
                }
              }
              // a shopkeeper with a tray holds it: palms up under its rim (and the right hand taking the dish off it)
              if (p.kind === 'keeper' && p.task && p.tray && p.tray.visible && p.task.hl && window.TriundAnim.armIK) {
                const T = p.task, fx = Math.sin(p.ryaw), fz = Math.cos(p.ryaw), lx = Math.cos(p.ryaw), lz = -Math.sin(p.ryaw);
                const fwd = TV.f.set(fx, 0, fz), lft = TV.l.set(lx, 0, lz), rgt = TV.r.set(-lx, 0, -lz);
                window.TriundAnim.armIK(THREE, ch.root, { l: { p: T.hl, dir: fwd, thumb: lft }, r: { p: T.hr, dir: fwd, thumb: T.phase === 'give' ? TV.u : rgt } }, p.ryaw);
              }
            }
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
      // the player's own third-person body, and a copy of their rucksack that stands on the ground beside them
      // while they sit (people take the bag off at a chai stall)
      playerChar(sex, seed) {
        // you: a man or a woman, as chosen on the start screen; your jacket, bag and cap come from your player id, so
        // your friends see you in the same clothes you see yourself in
        const base = playerLook(sex, seed);
        const ch = makeChar(base.sex); dress(ch, base);
        // what the player has on: a rain jacket (red, hood up) or a poncho (yellow, over the bag too), a fleece
        const wear = ({ coat, fleece }) => {
          const lk = Object.assign({}, base);
          if (fleece) Object.assign(lk, { top: 0x4a5a3a, puffer: false });
          if (coat === 'rain') Object.assign(lk, { top: 0xb8322b, puffer: false, head: 'beanie', capCol: 0xb8322b });
          if (coat === 'poncho') Object.assign(lk, { top: 0xe8b81e, puffer: false, head: 'beanie', capCol: 0xe8b81e, pack: 0xe8b81e });
          dress(ch, lk); if (ground) ground.children[0].children.forEach(m => { if (m.material === ch.acc.packMat) m.material = ch.acc.packMat; });
        };
        var ground = new THREE.Group(); const inner = new THREE.Group(), bb = new THREE.Box3();
        for (const c of ch.acc.pack.children) { const m = c.clone(); m.castShadow = c.castShadow; inner.add(m); bb.expandByObject(m); }
        const ctr = bb.getCenter(new THREE.Vector3()); inner.position.set(-ctr.x, -bb.min.y, -ctr.z); ground.add(inner);
        ground.scale.setScalar(0.95); ground.visible = false; scene.add(ground);
        return { ch, ground, wear, sex: base.sex, play: (n, s) => play(ch, n, s),
          dispose() { scene.remove(ch.root); scene.remove(ground); } };
      }
    };
  }
};
