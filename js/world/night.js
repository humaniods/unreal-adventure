'use strict';
/* Triund top by day and night.
   - The night sky as it is over Triund (32.25 N, 76.33 E) in late November: the bright stars at their real places
     (Orion rising in the east after 20:00, Cassiopeia high in the north, the Plough low in the north before dawn,
     Polaris at 32 degrees), several thousand fainter stars, and the Milky Way as a band along the galactic plane,
     brightest toward Sagittarius (setting in the south-west in the evening), with dark dust lanes. Everything turns
     with the local sidereal time of the game clock. The moon is left out.
   - The lights of the towns below at night: McLeod Ganj, Dharamkot, Bhagsu, Naddi, Dharamshala, Sidhbari, Yol, Gaggal,
     Kangra, Nagrota Bagwan, Shahpur and the villages of the Kangra valley (town positions from their coordinates).
   - Camps on the meadow: dome tents in clusters, doors toward a fire ring; at dusk the fires are lit, lanterns glow
     inside some tents. The tent builder is shared with camp.js (the tent you hire).
   Interface: create(ctx) -> { update(dt, camera, info), fireSeats, fires, tentAt(x, z), counts }, plus
   TriundNight.tent(THREE, opts) -> Group (a single dome tent). */
window.TriundNight = {
  // one dome tent: about 2.1 m long, 1.5 m wide, 1.15 m high, door at local +z. opts.open: door rolled up, inner
  // tent, mat and sleeping bag inside (the tent you hire). Returns a Group; userData.geo is the merged shell
  // geometry (vertex colours) for batching when !open.
  tent(THREE, o) {
    const col = new THREE.Color(o.color || 0xf2a93b).convertSRGBToLinear(), dark = col.clone().multiplyScalar(0.55), pole = new THREE.Color(0x222222);
    const A = 0.76, B = 1.06, HH = 1.15, SEG = 24, RING = 10;
    const pos = [], cols = [], idx = [];
    const door = (x, y, z) => z > 0.62 && Math.abs(x) < 0.42 && y < 0.82;
    for (let j = 0; j <= RING; j++) {
      const ph = j / RING * Math.PI / 2;                       // 0 at the ground, pi/2 at the top
      for (let i = 0; i <= SEG; i++) {
        const th = i / SEG * Math.PI * 2, ux = Math.cos(th) * Math.cos(ph), uz = Math.sin(th) * Math.cos(ph), uy = Math.sin(ph);
        const x = ux * A, z = uz * B, y = Math.pow(uy, 0.85) * HH;   // fuller shoulders than a plain half-ellipsoid
        pos.push(x, y, z);
        const c = door(ux, uy, uz) ? dark : col, sh = 0.88 + 0.12 * uy;
        cols.push(c.r * sh, c.g * sh, c.b * sh);
      }
    }
    for (let j = 0; j < RING; j++) for (let i = 0; i < SEG; i++) {
      const a = j * (SEG + 1) + i, b = a + SEG + 1;
      if (o.open) { const th = (i + 0.5) / SEG * Math.PI * 2, ph = (j + 0.5) / RING * Math.PI / 2; if (door(Math.cos(th) * Math.cos(ph), Math.sin(ph), Math.sin(th) * Math.cos(ph))) continue; }
      idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3)); g.setIndex(idx); g.computeVertexNormals();
    // the two crossing poles over the top
    const parts = [g];
    for (const s of [1, -1]) {
      const pts = []; for (let k = 0; k <= 16; k++) { const t = k / 16 * Math.PI, ux = Math.cos(t) * 0.707 * s, uz = Math.cos(t) * 0.707, uy = Math.sin(t); pts.push(new THREE.Vector3(ux * A * 1.01, Math.pow(Math.max(0, uy), 0.85) * HH * 1.01, uz * B * 1.01)); }
      const tg = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.012, 4, false), n = tg.attributes.position.count, c = [];
      for (let k = 0; k < n; k++) c.push(pole.r, pole.g, pole.b);
      tg.setAttribute('color', new THREE.Float32BufferAttribute(c, 3)); parts.push(tg.index ? tg : tg);
    }
    const merged = mergeGeos(THREE, parts);
    const grp = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, side: THREE.DoubleSide });
    const shell = new THREE.Mesh(merged, mat); shell.castShadow = true; shell.receiveShadow = true; grp.add(shell);
    grp.userData.geo = merged; grp.userData.shell = shell;
    if (o.open) {
      // rolled-up door, groundsheet, foam mat, a sleeping bag, a small lantern hanging from the top
      const m = c => new THREE.MeshStandardMaterial({ color: new THREE.Color(c).convertSRGBToLinear(), roughness: 0.8 });
      const roll = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.8, 8), m(dark.getHex())); roll.rotation.z = Math.PI / 2; roll.position.set(0, 0.86, B * 0.66); grp.add(roll);
      const floor = new THREE.Mesh(new THREE.CircleGeometry(1, 20), m(0x3a3f44)); floor.rotation.x = -Math.PI / 2; floor.scale.set(A * 0.98, B * 0.98, 1); floor.position.y = 0.012; grp.add(floor);
      const mat2 = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.02, 1.8), m(0x2f6fd6)); mat2.position.set(-0.12, 0.025, -0.05); grp.add(mat2);
      const bag = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 1.6, 12), m(0xb8322b)); bag.rotation.x = Math.PI / 2; bag.scale.set(1, 1, 0.55); bag.position.set(-0.12, 0.13, -0.1); grp.add(bag);
      const pillow = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.1, 0.25), m(0x8a8f7a)); pillow.position.set(-0.12, 0.09, -0.85); grp.add(pillow);
      const lan = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.12, 10), new THREE.MeshStandardMaterial({ color: 0xfff1c8, emissive: 0xffb860, emissiveIntensity: 0 }));
      lan.position.set(0, HH - 0.16, -0.5); lan.scale.setScalar(0.8); grp.add(lan);   // hangs from the roof behind your head grp.userData.lantern = lan;
    }
    grp.userData.dims = { A, B, HH };
    return grp;
  },

  create(ctx) {
    const { THREE, scene, H, top, blocked, collide, trails } = ctx;
    const lin = c => new THREE.Color(c).convertSRGBToLinear();
    const rng = (s => () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; })(424242);
    const DEG = Math.PI / 180, LAT = 32.25 * DEG, LON = 76.33;

    /* ================= the sky: stars and the Milky Way ================= */
    // bright stars: [RA hours, Dec degrees, magnitude, colour index (0 blue-white .. 1 orange-red)]
    const BRIGHT = [
      [6.752, -16.72, -1.46, 0.1], [5.278, 46.0, 0.08, 0.6], [5.242, -8.2, 0.13, 0.05], [7.655, 5.22, 0.34, 0.3], [5.919, 7.41, 0.5, 1.0],
      [19.846, 8.87, 0.77, 0.15], [4.599, 16.51, 0.85, 0.95], [18.616, 38.78, 0.03, 0.1], [7.755, 28.03, 1.14, 0.7], [22.961, -29.62, 1.16, 0.12],
      [20.69, 45.28, 1.25, 0.15], [10.139, 11.97, 1.35, 0.1], [7.577, 31.89, 1.58, 0.15], [5.419, 6.35, 1.64, 0.1], [5.438, 28.61, 1.65, 0.1],
      [5.604, -1.2, 1.69, 0.05], [5.679, -1.94, 1.77, 0.05], [5.533, -0.3, 2.23, 0.05], [5.796, -9.67, 2.06, 0.05], [2.53, 89.26, 1.98, 0.5],
      [11.062, 61.75, 1.79, 0.75], [11.031, 56.38, 2.37, 0.1], [11.897, 53.69, 2.44, 0.1], [12.257, 57.03, 3.31, 0.1], [12.9, 55.96, 1.77, 0.1], [13.399, 54.93, 2.23, 0.1], [13.792, 49.31, 1.86, 0.1],
      [0.675, 56.54, 2.24, 0.75], [0.153, 59.15, 2.28, 0.3], [0.945, 60.72, 2.15, 0.05], [1.43, 60.24, 2.68, 0.25], [1.907, 63.67, 3.35, 0.1],
      [3.791, 24.11, 2.87, 0.05], [3.819, 24.05, 3.62, 0.05], [3.749, 24.11, 3.7, 0.05], [3.763, 24.37, 3.87, 0.05], [3.772, 23.95, 4.18, 0.05], [3.753, 24.47, 4.3, 0.05],
      [3.405, 49.86, 1.8, 0.4], [3.136, 40.96, 2.1, 0.05], [2.12, 23.46, 2.0, 0.8], [0.14, 29.09, 2.06, 0.1], [1.162, 35.62, 2.07, 0.9], [2.065, 42.33, 2.1, 0.85],
      [23.079, 15.21, 2.48, 0.1], [23.063, 28.08, 2.42, 0.95], [0.221, 15.18, 2.83, 0.1], [0.727, -17.99, 2.04, 0.8], [21.736, 9.88, 2.38, 0.85],
      [19.512, 27.96, 3.05, 0.8], [20.37, 40.26, 2.23, 0.4], [16.49, -26.43, 1.06, 1.0], [6.383, -17.96, 1.98, 0.1], [7.14, -26.39, 1.83, 0.4], [6.977, -28.97, 1.5, 0.05],
      [2.0, 2.76, 2.0, 0.5], [3.038, 4.09, 2.53, 0.9], [4.476, 15.87, 3.4, 0.9], [5.627, 21.14, 3.0, 0.1], [6.629, 16.4, 1.9, 0.05], [6.383, 22.51, 2.9, 0.9],
      [9.46, -8.66, 1.98, 0.9], [8.159, -47.34, 1.75, 0.05], [21.31, 62.59, 2.45, 0.2], [22.83, 66.2, 3.2, 0.9], [1.858, 20.81, 2.6, 0.1], [17.943, 51.49, 2.24, 0.9]
    ];
    const RAD = 30000;
    const eq = (raH, decD, out) => { const a = raH * 15 * DEG, d = decD * DEG; return out.set(Math.cos(d) * Math.cos(a), Math.cos(d) * Math.sin(a), Math.sin(d)); };
    // galactic -> equatorial (J2000): e = T^T g
    const TG = [[-0.0548755604, -0.8734370902, -0.4838350155], [0.4941094279, -0.4448296300, 0.7469822445], [-0.8676661490, -0.1980763734, 0.4559837762]];
    const galToEq = (l, b, out) => { const g = [Math.cos(b) * Math.cos(l), Math.cos(b) * Math.sin(l), Math.sin(b)]; return out.set(TG[0][0] * g[0] + TG[1][0] * g[1] + TG[2][0] * g[2], TG[0][1] * g[0] + TG[1][1] * g[1] + TG[2][1] * g[2], TG[0][2] * g[0] + TG[1][2] * g[1] + TG[2][2] * g[2]); };
    const sp = [], ss = [], sc = [], sph = [], v = new THREE.Vector3(), c = new THREE.Color();
    const starCol = (ci, out) => out.setRGB(0.78 + 0.22 * ci, 0.85 + 0.05 * (1 - Math.abs(ci - 0.4) * 2), 1.0 - 0.45 * ci);
    function addStar(e, mag, ci) {
      sp.push(e.x * RAD, e.y * RAD, e.z * RAD);
      ss.push(Math.max(1.7, 6.0 - mag * 1.0));
      const k = Math.min(2.4, 1.6 * Math.pow(2.512, (2.6 - mag) * 0.42)); starCol(ci, c); sc.push(c.r * k, c.g * k, c.b * k); sph.push(rng() * 6.28);
    }
    for (const s of BRIGHT) addStar(eq(s[0], s[1], v), s[2], s[3]);
    // faint stars: more of them the fainter, a little crowded toward the galactic plane
    for (let i = 0; i < 6000; i++) {
      const mag = 3.2 + 3.0 * Math.pow(rng(), 0.6);
      if (rng() < 0.42) { const l = rng() * Math.PI * 2, b = (rng() + rng() + rng() - 1.5) * 0.18; galToEq(l, b, v); }
      else { const z = rng() * 2 - 1, t = rng() * Math.PI * 2, r = Math.sqrt(1 - z * z); v.set(r * Math.cos(t), r * Math.sin(t), z); }
      addStar(v, mag, rng() * 0.8);
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3)); sg.setAttribute('size', new THREE.Float32BufferAttribute(ss, 1));
    sg.setAttribute('color', new THREE.Float32BufferAttribute(sc, 3)); sg.setAttribute('phase', new THREE.Float32BufferAttribute(sph, 1));
    const starMat = new THREE.ShaderMaterial({
      uniforms: { uA: { value: 0 }, uT: { value: 0 }, uPR: { value: Math.min(2, window.devicePixelRatio || 1) } },
      vertexShader: `attribute float size; attribute vec3 color; attribute float phase; uniform float uT; uniform float uPR; uniform float uA;
        varying vec3 vC; varying float vA;
        void main(){ vec4 wp = modelMatrix * vec4(position, 1.0); vec3 d = normalize(wp.xyz - cameraPosition);
          float alt = d.y; float ext = smoothstep(-0.02, 0.22, alt);                       // thick air near the horizon dims them
          float tw = 1.0 + (0.28 * (1.0 - smoothstep(0.0, 0.6, alt))) * sin(uT * (3.0 + phase) + phase * 7.0);
          vC = color * tw; vA = uA * ext;
          gl_PointSize = size * uPR * (0.75 + 0.25 * ext);
          gl_Position = projectionMatrix * viewMatrix * wp; gl_Position.z = gl_Position.w * 0.99999; }`,
      fragmentShader: `varying vec3 vC; varying float vA;
        void main(){ vec2 q = gl_PointCoord - 0.5; float r = length(q) * 2.0; float a = smoothstep(1.0, 0.15, r); if (a < 0.01) discard; gl_FragColor = vec4(vC * a * vA, 1.0); }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false
    });
    const stars = new THREE.Points(sg, starMat); stars.frustumCulled = false; stars.renderOrder = -0.6; stars.matrixAutoUpdate = false;
    // the Milky Way: brightness from the galactic latitude and longitude of each pixel's direction, with dust lanes
    const mwMat = new THREE.ShaderMaterial({
      uniforms: { uA: { value: 0 }, uW2E: { value: new THREE.Matrix3() }, uE2G: { value: new THREE.Matrix3().set(TG[0][0], TG[0][1], TG[0][2], TG[1][0], TG[1][1], TG[1][2], TG[2][0], TG[2][1], TG[2][2]) } },
      vertexShader: `varying vec3 vD; void main(){ vec4 wp = modelMatrix * vec4(position, 1.0); vD = wp.xyz - cameraPosition; gl_Position = projectionMatrix * viewMatrix * wp; gl_Position.z = gl_Position.w * 0.99998; }`,
      fragmentShader: `uniform float uA; uniform mat3 uW2E; uniform mat3 uE2G; varying vec3 vD;
        float h(vec3 p){ return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
        float n3(vec3 p){ vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(mix(h(i), h(i + vec3(1,0,0)), f.x), mix(h(i + vec3(0,1,0)), h(i + vec3(1,1,0)), f.x), f.y),
                     mix(mix(h(i + vec3(0,0,1)), h(i + vec3(1,0,1)), f.x), mix(h(i + vec3(0,1,1)), h(i + vec3(1,1,1)), f.x), f.y), f.z); }
        float fbm(vec3 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++){ s += a * n3(p); p *= 2.03; a *= 0.5; } return s; }
        void main(){ vec3 d = normalize(vD); vec3 e = uW2E * d; vec3 g = uE2G * e;
          float b = asin(clamp(g.z, -1.0, 1.0)), l = atan(g.y, g.x);
          float core = 0.5 + 0.5 * cos(l); core = core * core;                            // toward Sagittarius
          float w = 0.10 + 0.07 * core;
          float band = exp(-b * b / (w * w)) * (0.32 + 0.9 * core);
          float clump = 0.55 + 0.9 * fbm(e * 7.0);
          float lane = 1.0 - 0.75 * smoothstep(0.42, 0.68, fbm(e * 11.0 + 3.0)) * exp(-b * b / (0.035 * 0.035 + 0.02 * core));
          float ext = smoothstep(-0.02, 0.3, d.y);
          float I = band * clump * lane * ext * uA;
          gl_FragColor = vec4(vec3(0.9, 0.9, 0.88) * I * 0.24, 1.0); }`,
      side: THREE.BackSide, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false
    });
    const mw = new THREE.Mesh(new THREE.SphereGeometry(RAD * 0.98, 48, 24), mwMat); mw.frustumCulled = false; mw.renderOrder = -0.7;
    // the night itself: the physical sky model never goes fully dark below the horizon, so a deep blue-black dome
    // fades in over it after dusk (the stars and the Milky Way are drawn on top of it); a faint glow stays low over
    // the valley from the towns
    const domeMat = new THREE.ShaderMaterial({
      uniforms: { uA: { value: 0 } },
      vertexShader: `varying vec3 vD; void main(){ vec4 wp = modelMatrix * vec4(position, 1.0); vD = wp.xyz - cameraPosition; gl_Position = projectionMatrix * viewMatrix * wp; gl_Position.z = gl_Position.w * 0.99997; }`,
      fragmentShader: `uniform float uA; varying vec3 vD;
        void main(){ vec3 d = normalize(vD); float up = clamp(d.y, -0.2, 1.0);
          vec3 c = mix(vec3(0.030, 0.034, 0.048), vec3(0.006, 0.009, 0.020), smoothstep(0.0, 0.5, up));
          c += vec3(0.05, 0.032, 0.018) * smoothstep(0.12, -0.05, up) * step(0.0, d.z + 0.3);   // town glow over the valley (south)
          gl_FragColor = vec4(c, uA); }`,
      side: THREE.BackSide, transparent: true, depthWrite: false, fog: false
    });
    const dome = new THREE.Mesh(new THREE.SphereGeometry(RAD * 0.99, 32, 16), domeMat); dome.frustumCulled = false; dome.renderOrder = -0.8; dome.visible = false; scene.add(dome);
    scene.add(mw); scene.add(stars);
    const M3 = new THREE.Matrix3(), M4 = new THREE.Matrix4();
    // world <- equatorial for a given game day and hour (IST)
    function skyMatrix(day, hour) {
      const D = 9818.5 + day + (hour - 5.5) / 24;            // days since J2000.0 (2026-11-19 00:00 UT is 9818.5)
      let gmst = (18.697374558 + 24.06570982441908 * D) % 24; if (gmst < 0) gmst += 24;
      const th = ((gmst + LON / 15) % 24) * 15 * DEG, ct = Math.cos(th), st = Math.sin(th), cp = Math.cos(LAT), spp = Math.sin(LAT);
      // A (world <- local-equatorial) times Rz(-theta)
      const R = [[ct, st, 0], [-st, ct, 0], [0, 0, 1]], A = [[0, 1, 0], [cp, 0, spp], [spp, 0, -cp]];
      const m = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
      for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) m[i][j] = A[i][0] * R[0][j] + A[i][1] * R[1][j] + A[i][2] * R[2][j];
      return m;
    }

    /* ================= town lights in the valley ================= */
    const O = (window.TRIUND_DATA && window.TRIUND_DATA.origin) || { lat: 32.2545856, lon: 76.3259043 };
    const xz = (lat, lon) => [(lon - O.lon) * 111320 * Math.cos(O.lat * DEG), -(lat - O.lat) * 110540];
    const TOWNS = [   // [lat, lon, radius m, lights]
      [32.2427, 76.3213, 330, 300], [32.2500, 76.3300, 200, 70], [32.2445, 76.3330, 240, 120], [32.2550, 76.3060, 260, 60], [32.2380, 76.3155, 260, 70],
      [32.2190, 76.3234, 800, 520], [32.2050, 76.3180, 1200, 380], [32.2000, 76.3600, 700, 140], [32.1800, 76.3920, 900, 200], [32.1650, 76.2630, 900, 170],
      [32.0998, 76.2691, 1500, 460], [32.1070, 76.3800, 1100, 220], [32.2160, 76.1830, 900, 120], [32.1480, 76.3300, 900, 140], [32.1250, 76.2100, 1200, 160]];
    const lp = [], lc = [];
    const warm = [new THREE.Color(1.0, 0.72, 0.38), new THREE.Color(1.0, 0.85, 0.6), new THREE.Color(0.85, 0.9, 1.0), new THREE.Color(1.0, 0.6, 0.3)];
    const putLight = (x, z) => { const y = H(x, z); if (!(y > 0) || y > 2300) return; lp.push(x, y + 4, z); const w = warm[(rng() * (rng() < 0.75 ? 2 : 4)) | 0], k = 0.35 + rng() * 0.45; lc.push(w.r * k, w.g * k, w.b * k); };
    for (const [la, lo, r, n] of TOWNS) { const [cx, cz] = xz(la, lo); for (let i = 0; i < n; i++) { const a = rng() * 6.28, d = r * Math.sqrt(-Math.log(1 - rng() * 0.95)) * 0.6; putLight(cx + Math.cos(a) * d, cz + Math.sin(a) * d); } }
    for (let i = 0; i < 1400; i++) { const x = -16000 + rng() * 32000, z = 2500 + rng() * 19000; if (H(x, z) < 1400) putLight(x, z); }   // villages across the valley floor
    const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(lp, 3)); lg.setAttribute('color', new THREE.Float32BufferAttribute(lc, 3));
    const cityMat = new THREE.PointsMaterial({ size: 1.7, sizeAttenuation: false, vertexColors: true, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: true });
    const city = new THREE.Points(lg, cityMat); city.frustumCulled = false; city.visible = false; scene.add(city);

    /* ================= camps on the meadow ================= */
    // trail points near the top (tents keep off the path)
    const trailPts = []; for (const tr of Object.values(trails)) for (let s = Math.max(0, tr.total - 400); s <= tr.total; s += 6) { const p = tr.pointAtS(s); trailPts.push([p.x, p.z]); }
    const offTrail = (x, z, d) => trailPts.every(p => (p[0] - x) ** 2 + (p[1] - z) ** 2 > d * d);
    const flat = (x, z, r) => { const y = H(x, z); return Math.abs(H(x + r, z) - y) < 0.35 * r && Math.abs(H(x - r, z) - y) < 0.35 * r && Math.abs(H(x, z + r) - y) < 0.35 * r && Math.abs(H(x, z - r) - y) < 0.35 * r; };
    const taken = [];
    const free = (x, z, r) => !(blocked && blocked(x, z)) && taken.every(t => (t[0] - x) ** 2 + (t[1] - z) ** 2 > (t[2] + r) ** 2);
    const TCOL = [0xf2a93b, 0x2f6fd6, 0xe8c43a, 0x2f9a52, 0xd8432e, 0x6b7a8a, 0x1f8a8a, 0xf28a1a];
    const shells = [], litShells = [], fires = [], fireSeats = [];
    let made = 0;
    // the real camp sites on the meadow (OpenStreetMap: Trimund, Mool Raj Camp, Triund camp) get camps first, then
    // the open meadow round the top
    const campPois = ((window.TRIUND_DATA && window.TRIUND_DATA.places && window.TRIUND_DATA.places.pois) || []).filter(q => q.kind === 'camp').map(q => ({ x: q.e, z: -q.n }));
    const anchors = []; for (const q of campPois) anchors.push(q, q); anchors.push(top, top, top, top, top); const doneA = [];
    for (let k = 0; k < 900 && fires.length < 11; k++) {
      const ai = Math.min(anchors.length - 1, Math.floor(k / 60)), an = anchors[ai], near = an !== top;
      if (doneA[ai]) continue;
      const a = rng() * 6.28, r = near ? 6 + rng() * 40 : 25 + rng() * 120, cx = an.x + Math.cos(a) * r, cz = an.z + Math.sin(a) * r;
      if (!flat(cx, cz, 4) || !offTrail(cx, cz, 9) || !free(cx, cz, 7)) continue;
      const fire = { x: cx, z: cz, y: H(cx, cz), lit: 0, music: fires.length === 1 };
      fires.push(fire); taken.push([cx, cz, 2.6]); doneA[ai] = true;
      // fire seats in a ring (people sit cross-legged on the grass, facing the fire)
      for (let i = 0; i < 6; i++) { const t = i / 6 * 6.28 + rng() * 0.3, sx = cx + Math.cos(t) * 1.7, sz = cz + Math.sin(t) * 1.7; fireSeats.push({ x: sx, z: sz, y: H(sx, sz), ry: Math.atan2(cx - sx, cz - sz), fire, used: false }); }
      // tents round it, doors toward the fire
      const n = 4 + (rng() * 4 | 0);
      for (let i = 0; i < n; i++) {
        const t = i / n * 6.28 + rng() * 0.4, d = 4.6 + rng() * 2.2, tx = cx + Math.cos(t) * d, tz = cz + Math.sin(t) * d;
        if (!flat(tx, tz, 1.3) || !offTrail(tx, tz, 4) || !free(tx, tz, 1.25)) continue;
        const ry = Math.atan2(cx - tx, cz - tz) + (rng() - 0.5) * 0.4;
        const T = window.TriundNight.tent(THREE, { color: TCOL[(rng() * TCOL.length) | 0] });
        const m = new THREE.Matrix4().compose(new THREE.Vector3(tx, H(tx, tz) - 0.03, tz), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), ry), new THREE.Vector3(1, 1, 1));
        const geo = T.userData.geo.clone().applyMatrix4(m);
        (rng() < 0.45 ? litShells : shells).push(geo);
        taken.push([tx, tz, 1.25]); made++;
        if (collide) collide.circle(tx, tz, 0.95, true);
      }
    }
    // and tents on their own, scattered over the meadow round the top
    for (let k = 0, n = 0; k < 400 && n < 16; k++) {
      const a = rng() * 6.28, r = 22 + rng() * 140, tx = top.x + Math.cos(a) * r, tz = top.z + Math.sin(a) * r;
      if (!flat(tx, tz, 1.3) || !offTrail(tx, tz, 5) || !free(tx, tz, 1.6)) continue;
      const T = window.TriundNight.tent(THREE, { color: TCOL[(rng() * TCOL.length) | 0] });
      const m = new THREE.Matrix4().compose(new THREE.Vector3(tx, H(tx, tz) - 0.03, tz), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rng() * 6.28), new THREE.Vector3(1, 1, 1));
      (rng() < 0.4 ? litShells : shells).push(T.userData.geo.clone().applyMatrix4(m)); taken.push([tx, tz, 1.25]); made++; n++;
      if (collide) collide.circle(tx, tz, 0.95, true);
    }
    const tentMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, side: THREE.DoubleSide });
    const litMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, side: THREE.DoubleSide, emissive: new THREE.Color(0xffa850), emissiveIntensity: 0 });
    for (const [list, mat] of [[shells, tentMat], [litShells, litMat]]) if (list.length) { const m = new THREE.Mesh(mergeGeos(THREE, list), mat); m.castShadow = true; m.receiveShadow = true; scene.add(m); }

    /* ---------- fires: a ring of stones, logs, flames, embers, one moving light ---------- */
    const stoneParts = [], logParts = [];
    for (const f of fires) {
      for (let i = 0; i < 9; i++) { const t = i / 9 * 6.28, g = new THREE.DodecahedronGeometry(0.13 + rng() * 0.05, 0); g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(f.x + Math.cos(t) * 0.55, f.y + 0.05, f.z + Math.sin(t) * 0.55), new THREE.Quaternion().setFromEuler(new THREE.Euler(rng(), rng(), rng())), new THREE.Vector3(1, 0.7, 1))); stoneParts.push(g); }
      for (let i = 0; i < 4; i++) { const g = new THREE.CylinderGeometry(0.045, 0.055, 0.75, 6); g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(f.x, f.y + 0.16, f.z), new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2 - 0.55, i * 1.57 + 0.3, 0, 'YXZ')), new THREE.Vector3(1, 1, 1))); logParts.push(g); }
      if (collide) collide.circle(f.x, f.z, 0.7, true);
    }
    if (stoneParts.length) { const m = new THREE.Mesh(mergeGeos(THREE, stoneParts), new THREE.MeshStandardMaterial({ color: lin(0x6f6a62), roughness: 0.95 })); m.receiveShadow = m.castShadow = true; scene.add(m); }
    const logMat = new THREE.MeshStandardMaterial({ color: lin(0x3a2a1e), roughness: 0.9, emissive: new THREE.Color(0xff5a10), emissiveIntensity: 0 });
    if (logParts.length) { const m = new THREE.Mesh(mergeGeos(THREE, logParts), logMat); m.castShadow = true; scene.add(m); }
    // flames: three crossed quads per fire with a flickering flame shader
    const flameMat = new THREE.ShaderMaterial({
      uniforms: { uT: { value: 0 }, uA: { value: 0 } },
      vertexShader: `varying vec2 vU; void main(){ vU = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `uniform float uT; uniform float uA; varying vec2 vU;
        float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(h(i), h(i + vec2(1,0)), f.x), mix(h(i + vec2(0,1)), h(i + vec2(1,1)), f.x), f.y); }
        void main(){ vec2 u = vU; float y = u.y; float x = (u.x - 0.5) * 2.0;
          float t = n(vec2(u.x * 5.0, y * 3.0 - uT * 3.2)) * 0.6 + n(vec2(u.x * 11.0, y * 6.0 - uT * 5.0)) * 0.4;
          float w = (1.0 - y) * (0.75 + 0.25 * t);                                         // narrower toward the top
          float shape = smoothstep(w, w * 0.4, abs(x + (t - 0.5) * 0.5 * y)) * smoothstep(1.0, 0.25, y + t * 0.35) * smoothstep(0.0, 0.08, y);
          vec3 col = mix(vec3(1.0, 0.85, 0.45), vec3(1.0, 0.35, 0.05), smoothstep(0.1, 0.7, y + (1.0 - shape) * 0.3));
          if (shape < 0.02) discard; gl_FragColor = vec4(col * shape * uA * 1.6, 1.0); }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false
    });
    const flameGeo = (() => { const parts = []; for (let i = 0; i < 3; i++) { const g = new THREE.PlaneGeometry(0.75, 1.1); g.translate(0, 0.55, 0); g.rotateY(i * Math.PI / 3); parts.push(g); } return mergeGeos(THREE, parts); })();
    const glowTex = (() => { const cv = document.createElement('canvas'); cv.width = cv.height = 64; const x = cv.getContext('2d'); const gr = x.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,200,120,1)'); gr.addColorStop(0.35, 'rgba(255,120,40,0.45)'); gr.addColorStop(1, 'rgba(255,80,10,0)'); x.fillStyle = gr; x.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(cv); })();
    const EMB = 40, embGeo = new THREE.BufferGeometry(), embPos = new Float32Array(EMB * 3);
    embGeo.setAttribute('position', new THREE.BufferAttribute(embPos, 3));
    const embMat = new THREE.PointsMaterial({ color: 0xffa040, size: 0.03, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, map: null });
    embMat.map = glowTex; embMat.alphaTest = 0;
    for (const f of fires) {
      f.flame = new THREE.Mesh(flameGeo, flameMat); f.flame.position.set(f.x, f.y + 0.12, f.z); f.flame.visible = false; scene.add(f.flame);
      f.glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false, opacity: 0 })); f.glow.scale.set(2.6, 2.6, 1); f.glow.position.set(f.x, f.y + 0.5, f.z); f.glow.visible = false; scene.add(f.glow);
      f.emb = new THREE.Points(embGeo, embMat); f.emb.position.set(f.x, f.y, f.z); f.emb.visible = false; f.emb.frustumCulled = false; scene.add(f.emb);
      f.embS = Array.from({ length: EMB }, () => ({ t: rng() * 2, x: 0, z: 0 }));
    }
    // one warm light at the nearest burning fire (made now, at zero, so lighting it never recompiles a shader)
    const fireLight = new THREE.PointLight(lin(0xff9a4a), 0, 14, 1.6); fireLight.castShadow = false; scene.add(fireLight);

    /* ================= per frame ================= */
    let tt = 0;
    return {
      fires, fireSeats, counts: { stars: ss.length, cityLights: lc.length / 3, tents: made, fires: fires.length },
      // tent footprint at (x, z), if any (crowd and the player keep out)
      tentAt(x, z) { return taken.some(t => t[2] < 2 && (t[0] - x) ** 2 + (t[1] - z) ** 2 < t[2] * t[2]); },
      // info: { day, hour, dark 0..1, clear 0..1 }
      update(dt, camera, info) {
        tt += dt;
        const dark = info.dark, clear = info.clear;
        dome.visible = dark > 0.05; if (dome.visible) { dome.position.copy(camera.position); domeMat.uniforms.uA.value = Math.min(0.97, Math.pow(dark, 1.4) * (0.55 + 0.45 * clear)); }
        const vis = dark > 0.25;
        stars.visible = mw.visible = vis && clear > 0.05;
        if (stars.visible) {
          const m = skyMatrix(info.day, info.hour);
          M4.set(m[0][0], m[0][1], m[0][2], camera.position.x, m[1][0], m[1][1], m[1][2], camera.position.y, m[2][0], m[2][1], m[2][2], camera.position.z, 0, 0, 0, 1);
          stars.matrix.copy(M4); stars.matrixWorld.copy(M4);
          mw.position.copy(camera.position);
          M3.set(m[0][0], m[1][0], m[2][0], m[0][1], m[1][1], m[2][1], m[0][2], m[1][2], m[2][2]);   // equatorial <- world (transpose)
          mwMat.uniforms.uW2E.value.copy(M3);
          const k = Math.pow(Math.max(0, (dark - 0.25) / 0.75), 1.5) * clear;
          starMat.uniforms.uA.value = k; starMat.uniforms.uT.value = tt; mwMat.uniforms.uA.value = k * k;
        }
        city.visible = dark > 0.35; if (city.visible) cityMat.opacity = Math.min(1, (dark - 0.35) * 2.5) * (0.35 + 0.65 * clear);
        // fires: lit from dusk to late night (camps put them out around 23:00; a couple burn on)
        const h = info.hour, want = (h > 17.6 || h < 0.5) ? 1 : 0;
        let best = null, bd = 70 * 70;
        fires.forEach((f, i) => {
          const w = i < 2 ? ((h > 17.6 || h < 2) ? 1 : 0) : want;
          f.lit += (w - f.lit) * Math.min(1, dt * 0.5);
          const on = f.lit > 0.02, d2 = (f.x - camera.position.x) ** 2 + (f.z - camera.position.z) ** 2;
          f.flame.visible = f.glow.visible = on && d2 < 900 * 900; f.emb.visible = on && d2 < 60 * 60;
          if (on) { f.glow.material.opacity = f.lit * (0.35 + 0.5 * dark) * (0.85 + 0.15 * Math.sin(tt * 13 + i)); if (d2 < bd) { bd = d2; best = f; } }
        });
        flameMat.uniforms.uT.value = tt; flameMat.uniforms.uA.value = 1;
        logMat.emissiveIntensity = 0.6 * Math.max(...fires.map(f => f.lit), 0);
        litMat.emissiveIntensity = dark > 0.4 && (h > 17.8 || h < 1.5) ? 0.22 * Math.min(1, (dark - 0.4) * 3) : 0;
        if (best) { fireLight.position.set(best.x, best.y + 0.9, best.z); fireLight.intensity = best.lit * (2.2 + 0.6 * Math.sin(tt * 11) * Math.sin(tt * 7.1)) * (0.4 + 0.6 * dark); } else fireLight.intensity = 0;
        // embers of the nearest fire rise and fade
        if (best && best.emb.visible) {
          for (let i = 0; i < EMB; i++) { const e = best.embS[i]; e.t += dt * (0.5 + (i % 5) * 0.12); if (e.t > 2.2) { e.t = 0; e.x = (rng() - 0.5) * 0.4; e.z = (rng() - 0.5) * 0.4; }
            embPos[i * 3] = e.x + Math.sin(tt * 2 + i) * 0.1 * e.t; embPos[i * 3 + 1] = 0.3 + e.t * 1.1; embPos[i * 3 + 2] = e.z + Math.cos(tt * 1.7 + i) * 0.1 * e.t; }
          embGeo.attributes.position.needsUpdate = true; embMat.opacity = best.lit * 0.9;
          for (const f of fires) if (f !== best) f.emb.visible = false;
        }
      },
      // the nearest fire with music (a speaker by the fire), for the sound: { x, z } or null
      musicFire(x, z, hour) { const f = fires.find(q => q.music && q.lit > 0.3); return f && Math.hypot(f.x - x, f.z - z) < 90 ? f : null; }
    };
  }
};
// merge BufferGeometries (position, normal, optional colour) into one
function mergeGeos(THREE, list) {
  let n = 0, ni = 0; const hasC = list.every(g => g.attributes.color);
  const ready = list.map(g => { if (!g.attributes.normal) g.computeVertexNormals(); return g; });
  for (const g of ready) { n += g.attributes.position.count; ni += g.index ? g.index.count : g.attributes.position.count; }
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = hasC ? new Float32Array(n * 3) : null, idx = new Uint32Array(ni);
  let o = 0, oi = 0;
  for (const g of ready) {
    const c = g.attributes.position.count;
    pos.set(g.attributes.position.array.subarray(0, c * 3), o * 3); nor.set(g.attributes.normal.array.subarray(0, c * 3), o * 3);
    if (col) col.set(g.attributes.color.array.subarray(0, c * 3), o * 3);
    if (g.index) { for (let i = 0; i < g.index.count; i++) idx[oi + i] = g.index.array[i] + o; oi += g.index.count; }
    else { for (let i = 0; i < c; i++) idx[oi + i] = o + i; oi += c; }
    o += c;
  }
  const out = new THREE.BufferGeometry(); out.setAttribute('position', new THREE.BufferAttribute(pos, 3)); out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  if (col) out.setAttribute('color', new THREE.BufferAttribute(col, 3)); out.setIndex(new THREE.BufferAttribute(idx, 1));
  return out;
}
