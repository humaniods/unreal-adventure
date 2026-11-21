'use strict';
/* Seasons for the Triund walk test.
   autumn  (default): the clear October/November morning the rest of the game is tuned for.
   One season only (the user asked for it): the day's weather changes on top of it (weather.js), including light
   snow up high on some afternoons. Snowflakes are one Points mesh round the camera, moved in the vertex shader. */
window.TriundSeason = (function () {
  const KEY = 'triund-season';
  let current = 'autumn';
  // one season now: late November (the monsoon option was dropped); the day's weather changes on top of it

  const WEATHER = {
    // late November is the clearest month: a deep blue sky, the plains visible far below
    autumn: { turbidity: 2.6, rayleigh: 1.5, mie: 0.0035, haze: 0x94b2d4, hazeSun: 0xd8cfbf, fog: 0.00003, sun: 3.1, hemi: 1.45, sky: 0xbcd3ff, exposure: 0.8,
              wet: 0, tint: [1, 1, 1], rain: 0, grade: 1, speed: 1 },
    monsoon: { turbidity: 12, rayleigh: 0.5, mie: 0.02, haze: 0x8d989e, hazeSun: 0x9ea6a8, fog: 0.0024, sun: 0.75, hemi: 2.1, sky: 0xc9d2d8, exposure: 0.95,
               wet: 1, tint: [0.86, 1.0, 0.8], rain: 1, grade: 0.55, speed: 0.92 }
  };

  function rainMesh(THREE) {
    const N = 6000, pos = new Float32Array(N * 2 * 3), seed = new Float32Array(N * 2 * 4);
    for (let i = 0; i < N; i++) {
      const a = Math.random(), b = Math.random(), c = Math.random(), sp = 0.8 + Math.random() * 0.4;
      for (let k = 0; k < 2; k++) { seed.set([a, b, c, sp], (i * 2 + k) * 4); pos[(i * 2 + k) * 3 + 1] = k; }   // y: 0 = drop head, 1 = tail
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('seed', new THREE.BufferAttribute(seed, 4));
    const U = { uTime: { value: 0 }, uCam: { value: new THREE.Vector3() }, uAmt: { value: 1 }, uWind: { value: new THREE.Vector2(0.7, 0.25) } };
    const m = new THREE.ShaderMaterial({
      uniforms: U, transparent: true, depthWrite: false,
      vertexShader: `
uniform float uTime; uniform vec3 uCam; uniform vec2 uWind; attribute vec4 seed; varying float vA;
void main(){
  const vec3 BOX = vec3(36.0, 22.0, 36.0);
  float fall = 8.5 * seed.w;                                         // m/s
  vec3 p = vec3(seed.x, fract(seed.y - uTime * fall / BOX.y), seed.z) * BOX;
  p.xz += uWind * (p.y / fall);                                      // slant with the wind
  // wrap the box around the camera so the rain never runs out
  p.xz = mod(p.xz - uCam.xz + BOX.xz * 0.5, BOX.xz) + uCam.xz - BOX.xz * 0.5;
  p.y += uCam.y - BOX.y * 0.35;
  p += position.y * vec3(uWind * 0.07, fall * 0.07);                 // the streak a drop draws in a frame or two
  vA = (1.0 - position.y) * 0.85 + 0.15;
  vA *= 1.0 - smoothstep(6.0, 36.0, distance(p, uCam));
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}`,
      fragmentShader: `
uniform float uAmt; varying float vA;
void main(){ gl_FragColor = vec4(vec3(0.85, 0.88, 0.92), 0.55 * vA * uAmt); }`
    });
    const mesh = new THREE.LineSegments(g, m); mesh.frustumCulled = false; mesh.renderOrder = 8;
    return { mesh, U };
  }

  // snow: soft flakes drifting down and sideways round the camera, all moved in the vertex shader
  function snowMesh(THREE) {
    const N = 5000, seed = new Float32Array(N * 4), pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) seed.set([Math.random(), Math.random(), Math.random(), 0.6 + Math.random() * 0.8], i * 4);
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('seed', new THREE.BufferAttribute(seed, 4));
    const U = { uTime: { value: 0 }, uCam: { value: new THREE.Vector3() }, uAmt: { value: 0 }, uPR: { value: Math.min(2, window.devicePixelRatio || 1) }, uLight: { value: 1 } };
    const m = new THREE.ShaderMaterial({
      uniforms: U, transparent: true, depthWrite: false,
      vertexShader: `
uniform float uTime; uniform vec3 uCam; uniform float uAmt; uniform float uPR; attribute vec4 seed; varying float vA;
void main(){
  const vec3 BOX = vec3(30.0, 18.0, 30.0);
  float fall = 0.9 * seed.w;                                          // flakes fall about 1 m/s
  vec3 p = vec3(seed.x, fract(seed.y - uTime * fall / BOX.y), seed.z) * BOX;
  float t = uTime * (0.6 + seed.w * 0.5) + seed.x * 40.0;
  p.x += sin(t) * 0.5 + uTime * 0.35; p.z += cos(t * 0.8) * 0.5 + uTime * 0.12;   // drift and tumble
  p.xz = mod(p.xz - uCam.xz + BOX.xz * 0.5, BOX.xz) + uCam.xz - BOX.xz * 0.5;
  p.y += uCam.y - BOX.y * 0.4;
  float d = distance(p, uCam);
  vA = (1.0 - smoothstep(8.0, 15.0, d)) * step(fract(seed.z * 13.7), uAmt);   // the amount thins the flakes out
  vec4 mv = viewMatrix * vec4(p, 1.0);
  gl_PointSize = uPR * (0.05 + 0.035 * seed.w) * 420.0 / max(0.5, -mv.z);
  gl_Position = projectionMatrix * mv;
}`,
      fragmentShader: `
uniform float uLight; varying float vA;
void main(){ vec2 q = gl_PointCoord - 0.5; float a = smoothstep(0.5, 0.1, length(q)) * vA; if (a < 0.01) discard; gl_FragColor = vec4(vec3(0.95, 0.97, 1.0) * uLight, a * 0.9); }`
    });
    const mesh = new THREE.Points(g, m); mesh.frustumCulled = false; mesh.renderOrder = 8; mesh.visible = false;
    return { mesh, U };
  }
  // rain hiss (filtered noise) and now and then a far thunder roll
  function rainAudio(AC, master, noise) {
    const src = AC.createBufferSource(); src.buffer = noise; src.loop = true;
    const hp = AC.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 900;
    const lp = AC.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 7000;
    const g = AC.createGain(); g.gain.value = 0; src.connect(hp); hp.connect(lp); lp.connect(g); g.connect(master); src.start();
    let next = 25 + Math.random() * 40;
    return {
      set(v) { g.gain.setTargetAtTime(v * 0.11, AC.currentTime, 1.2); },
      tick(dt, on) {
        if (!on) return; next -= dt; if (next > 0) return; next = 45 + Math.random() * 70;
        const t = AC.currentTime, s = AC.createBufferSource(); s.buffer = noise;
        const f = AC.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(260, t); f.frequency.exponentialRampToValueAtTime(70, t + 5);
        const tg = AC.createGain(); tg.gain.setValueAtTime(0, t); tg.gain.linearRampToValueAtTime(0.5, t + 0.4); tg.gain.exponentialRampToValueAtTime(0.001, t + 6);
        s.connect(f); f.connect(tg); tg.connect(master); s.start(t); s.stop(t + 6.2);
      }
    };
  }

  return {
    get: () => current,
    set(v) { /* one season only */ },
    weather: () => WEATHER[current],
    // apply the current season to everything that has a hook; safe to call again after a change
    create({ THREE, scene, SKY, terrainMat, post }) {
      const rain = rainMesh(THREE), rainObj = rain; rain.mesh.visible = false; scene.add(rain.mesh);
      const snow = snowMesh(THREE); scene.add(snow.mesh);
      let audio = null, flora = null;
      function apply() {
        const w = WEATHER[current];
        if (SKY.setWeather) SKY.setWeather(w);
        const tu = terrainMat && terrainMat.userData.uniforms; if (tu && tu.uWet) tu.uWet.value = w.wet;
        if (tu && tu.uAutumn) tu.uAutumn.value = current === 'autumn' ? 1 : 0;
        if (flora && flora.tint) flora.tint(new THREE.Color(w.tint[0], w.tint[1], w.tint[2]));
        if (post) post.uniforms.uGrade.value = w.grade;
        rain.mesh.visible = w.rain > 0;
        if (audio) audio.set(w.rain);
      }
      apply();
      let dyn = null;   // weather.js: the day's changing weather on top of the season (rain amount, wet ground)
      return {
        apply,
        // snow 0..1 falling where the camera is, dust 0..1 (snow lying on the ground up high), light 0..1, wet 0..1
        setDynamic(d) {
          dyn = d; const w = WEATHER[current];
          rainObj.mesh.visible = false;
          snow.mesh.visible = (d.snow || 0) > 0.02; snow.U.uAmt.value = Math.min(1, (d.snow || 0) * 1.2); snow.U.uLight.value = 0.25 + 0.75 * (d.light == null ? 1 : d.light);
          const tu = terrainMat && terrainMat.userData.uniforms; if (tu && tu.uWet) tu.uWet.value = Math.max(w.wet, d.wet || 0); if (tu && tu.uSnow) tu.uSnow.value = d.dust || 0;
          if (audio) audio.set(0);
        },
        get raining() { return false; },
        get snowing() { return !!dyn && (dyn.snow || 0) > 0.1; },
        get speed() { return WEATHER[current].speed * (dyn && dyn.wet > 0.4 ? 0.95 : 1); },
        setFlora(f) { flora = f; apply(); },
        setAudio(AC, master, noise) { if (!audio && AC) { audio = rainAudio(AC, master, noise); audio.set(WEATHER[current].rain); } },
        update(dt, cam, time) {
          if (snow.mesh.visible) { snow.U.uTime.value = time % 1000; snow.U.uCam.value.copy(cam); }
        }
      };
    }
  };
})();
