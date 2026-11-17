'use strict';
/* Clouds and mist for the Triund walk test (default: clear October/November morning).
   - Cumulus over the Dhauladhar (north) and a few fair-weather clouds elsewhere, drifting east.
   - Their shadows: a coverage texture built from the same clouds, projected along the sun ray onto the ground
     (terrain and vegetation materials opt in with #define CLOUD_SHADOW).
   - Morning cloud sea in the Kangra valley (south), below the trail, broken up by noise.
   - Thin mist in the forest gullies along the streams below 2,300 m.
   World axes: x = east, y = up, z = south. Reference: research notes in docs (Oct/Nov is the clearest season;
   valley mist at dawn, cloud building over the peaks later). */
window.TriundAtmos = {
  // shared uniforms for cloud shadows (filled by build)
  U: null,

  // must run before any material compiles
  patchChunks(THREE) {
    const SC = THREE.ShaderChunk;
    SC.common = SC.common + `
#ifdef CLOUD_SHADOW
uniform sampler2D uCloudTex; uniform vec4 uCloud; uniform vec3 uCloudSun; uniform vec2 uCloudOff;
float cloudShadow(vec3 vp) {
  vec3 wp = (vec4(vp, 0.0) * viewMatrix).xyz + cameraPosition;            // view -> world
  vec2 c = wp.xz + uCloudSun.xz / max(uCloudSun.y, 0.08) * (uCloud.w - wp.y); // follow the sun ray up to the clouds
  vec2 uv = (c - uCloudOff - uCloud.xy) / uCloud.z;
  return 1.0 - 0.62 * texture2D(uCloudTex, uv).r;
}
#endif`;
    const key = 'getDirectionalDirectLightIrradiance( directionalLight, geometry, directLight );';
    if (SC.lights_fragment_begin.indexOf(key) < 0) { console.warn('cloud shadow patch: chunk text changed'); return; }
    SC.lights_fragment_begin = SC.lights_fragment_begin.replace(key, key + '\n\t\t#ifdef CLOUD_SHADOW\n\t\tdirectLight.color *= cloudShadow( geometry.position );\n\t\t#endif');
  },
  // for onBeforeCompile hooks: opt a material into cloud shadows
  optIn(sh) {
    const U = window.TriundAtmos.U; if (!U) return;
    Object.assign(sh.uniforms, U);
    sh.fragmentShader = '#define CLOUD_SHADOW\n' + sh.fragmentShader;
  },

  build({ THREE, scene, H, sunDir, rng, quality, streams, box }) {
    const R = rng(777);
    /* ---------- cloud field (shared by billboards and shadows) ---------- */
    const SIZE = 48000, X0 = (box.e0 + box.e1) / 2 - SIZE / 2, Z0 = -(box.n0 + box.n1) / 2 - SIZE / 2;
    const clouds = [];
    // most cumulus sits over the high Dhauladhar to the north (z < -2 km from the trail), a few elsewhere
    for (let i = 0; i < 46; i++) {
      const north = i < 32;
      const x = X0 + R() * SIZE, z = north ? -(2500 + R() * 14000) : Z0 + R() * SIZE;
      const r = north ? 700 + R() * 1300 : 450 + R() * 800;
      const alt = north ? 4700 + R() * 900 : 3300 + R() * 700;
      clouds.push({ x, z, r, alt });
    }
    const CT = 128, cdata = new Uint8Array(CT * CT * 4);
    for (let j = 0; j < CT; j++) for (let i = 0; i < CT; i++) {
      const wx = X0 + (i + 0.5) / CT * SIZE, wz = Z0 + (j + 0.5) / CT * SIZE; let v = 0;
      for (const c of clouds) {
        // wrapped distance (the field tiles as it drifts)
        let dx = Math.abs(wx - c.x), dz = Math.abs(wz - c.z); dx = Math.min(dx, SIZE - dx); dz = Math.min(dz, SIZE - dz);
        v = Math.max(v, Math.exp(-(dx * dx + dz * dz) / (2 * (c.r * 0.75) ** 2)));
      }
      const k = (j * CT + i) * 4; cdata[k] = cdata[k + 1] = cdata[k + 2] = Math.round(Math.min(1, v * 1.3) * 255); cdata[k + 3] = 255;
    }
    const cloudTex = new THREE.DataTexture(cdata, CT, CT, THREE.RGBAFormat);
    cloudTex.wrapS = cloudTex.wrapT = THREE.RepeatWrapping; cloudTex.magFilter = THREE.LinearFilter; cloudTex.minFilter = THREE.LinearFilter; cloudTex.needsUpdate = true;
    const U = window.TriundAtmos.U = {
      uCloudTex: { value: cloudTex }, uCloud: { value: new THREE.Vector4(X0, Z0, SIZE, 5000) },
      uCloudSun: { value: sunDir.clone() }, uCloudOff: { value: new THREE.Vector2(0, 0) }
    };
    const WIND = new THREE.Vector2(3.2, 0.6);   // m/s, westerly

    /* ---------- puff texture: soft cumulus lobe, red = how sunlit (top bright, base grey), alpha = density ---------- */
    function puffTex() {
      const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
      const img = g.createImageData(128, 128), d = img.data;
      const blobs = []; for (let i = 0; i < 9; i++) blobs.push([40 + R() * 48, 46 + R() * 40, 18 + R() * 22]);
      for (let y = 0; y < 128; y++) for (let x = 0; x < 128; x++) {
        let a = 0; for (const b of blobs) { const dd = Math.hypot(x - b[0], y - b[1]) / b[2]; a = Math.max(a, 1 - dd * dd); }
        a = Math.max(0, a) * (0.85 + 0.15 * Math.sin(x * 0.4 + y * 0.31));
        const base = Math.min(1, Math.max(0, (y - 70) / 40));                // flat-ish base
        const lit = Math.max(0, Math.min(1, 1.05 - y / 128 * 0.9));
        const k = (y * 128 + x) * 4; d[k] = Math.round(lit * 255); d[k + 1] = 0; d[k + 2] = 0; d[k + 3] = Math.round(Math.min(1, a * 1.6) * (1 - base * 0.9) * 255);
      }
      g.putImageData(img, 0, 0);
      const t = new THREE.CanvasTexture(c); t.minFilter = THREE.LinearMipmapLinearFilter; return t;
    }
    const PUFF = puffTex();
    const fogU = THREE.UniformsUtils.clone(THREE.UniformsLib.fog);
    const sunCol = new THREE.Color(1.0, 0.94, 0.84).multiplyScalar(1.55), shadeCol = new THREE.Color(0.52, 0.57, 0.66).multiplyScalar(1.05);

    // camera-facing instanced puffs; wrap = drift and wrap around the cloud field
    function puffMaterial(wrap, nearFade) {
      return new THREE.ShaderMaterial({
        uniforms: Object.assign({}, fogU, { map: { value: PUFF }, uOff: U.uCloudOff, uWrap: { value: new THREE.Vector4(X0, Z0, SIZE, wrap ? 1 : 0) },
          uSun: { value: sunCol }, uShade: { value: shadeCol }, uSunDir: { value: sunDir }, uNear: { value: new THREE.Vector4(nearFade[0], nearFade[1], nearFade[2] || 1e9, nearFade[3] || 2e9) }, uTime: { value: 0 } }),
        vertexShader: `#include <common>
#include <fog_pars_vertex>
#include <logdepthbuf_pars_vertex>
attribute vec3 aPuff;           // x: random, y: opacity, z: rotation
uniform vec2 uOff; uniform vec4 uWrap; uniform vec4 uNear; uniform float uTime;
varying vec2 vUv; varying float vA; varying float vR;
void main() {
  vec3 c = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
  float s = length(vec3(instanceMatrix[0][0], instanceMatrix[0][1], instanceMatrix[0][2]));
  float sy = length(vec3(instanceMatrix[1][0], instanceMatrix[1][1], instanceMatrix[1][2]));
  if (uWrap.w > 0.5) { c.xz = uWrap.xy + mod(c.xz + uOff - uWrap.xy, uWrap.z); }
  else { c.x += sin(uTime * 0.05 + aPuff.x * 20.0) * 6.0; c.y += sin(uTime * 0.07 + aPuff.x * 13.0) * 1.5; }
  vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]), up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
  float cr = cos(aPuff.z), sr = sin(aPuff.z);
  vec2 p = vec2(position.x * cr - position.y * sr, position.x * sr + position.y * cr) * 0.15 + position.xy * 0.85;
  vec3 wp = c + right * p.x * s + up * p.y * sy;
  vec4 mvPosition = viewMatrix * vec4(wp, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  vUv = uv; vR = aPuff.x;
  float d = distance(wp, cameraPosition);
  vA = aPuff.y * smoothstep(uNear.x, uNear.y, d) * (1.0 - smoothstep(uNear.z, uNear.w, d));
  #include <logdepthbuf_vertex>
  #include <fog_vertex>
}`,
        fragmentShader: `#include <common>
#include <fog_pars_fragment>
#include <logdepthbuf_pars_fragment>
uniform sampler2D map; uniform vec3 uSun; uniform vec3 uShade;
varying vec2 vUv; varying float vA; varying float vR;
void main() {
  #include <logdepthbuf_fragment>
  vec4 t = texture2D(map, vUv);
  float a = t.a * vA; if (a < 0.004) discard;
  vec3 col = mix(uShade, uSun, t.r * (0.75 + 0.25 * vR));
  gl_FragColor = vec4(col, a);
  #include <tonemapping_fragment>
  #include <encodings_fragment>
  #include <fog_fragment>
}`,
        transparent: true, depthWrite: false, fog: true
      });
    }
    function puffMesh(list, wrap, nearFade, order) {
      const g = new THREE.PlaneGeometry(1, 1);
      const ap = new Float32Array(list.length * 3);
      list.forEach((p, i) => { ap[i * 3] = R(); ap[i * 3 + 1] = p.a; ap[i * 3 + 2] = R() * 6.28; });
      g.setAttribute('aPuff', new THREE.InstancedBufferAttribute(ap, 3));
      const mat = puffMaterial(wrap, nearFade);
      const m = new THREE.InstancedMesh(g, mat, list.length), M = new THREE.Matrix4();
      list.forEach((p, i) => { M.makeScale(p.s, p.s * (p.flat || 0.62), 1); M.setPosition(p.x, p.y, p.z); m.setMatrixAt(i, M); });
      m.frustumCulled = false; m.renderOrder = order; scene.add(m); return m;
    }

    // cumulus: each cloud = a cluster of puffs, larger and brighter on top, flat grey base
    const puffs = [];
    for (const c of clouds) {
      const n = Math.round(6 + c.r / 160);
      for (let k = 0; k < n; k++) {
        const a = R() * 6.28, rr = Math.sqrt(R()) * c.r * 0.8;
        const h = R() ** 1.5;
        puffs.push({ x: c.x + Math.cos(a) * rr, z: c.z + Math.sin(a) * rr * 0.7, y: c.alt + h * c.r * 0.55, s: c.r * (0.7 + R() * 0.6) * (1.1 - h * 0.4), a: 0.75 + R() * 0.2, flat: 0.6 });
      }
    }
    const cumulus = puffMesh(puffs, true, [400, 1200], -0.5);

    /* ---------- Kangra valley cloud sea (three soft layers; the hills poke through) ---------- */
    const seaMat = new THREE.ShaderMaterial({
      uniforms: Object.assign({}, fogU, { uOff: U.uCloudOff, uSun: { value: sunCol }, uShade: { value: shadeCol }, uC: { value: new THREE.Vector2((box.e0 + box.e1) / 2, -(box.n0 + box.n1) / 2) } }),
      vertexShader: `#include <common>
#include <fog_pars_vertex>
#include <logdepthbuf_pars_vertex>
varying vec3 vW;
void main() { vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; vec4 mvPosition = viewMatrix * w; gl_Position = projectionMatrix * mvPosition;
  #include <logdepthbuf_vertex>
  #include <fog_vertex>
}`,
      fragmentShader: `#include <common>
#include <fog_pars_fragment>
#include <logdepthbuf_pars_fragment>
uniform vec2 uOff; uniform vec3 uSun; uniform vec3 uShade; uniform vec2 uC;
varying vec3 vW;
float h2(vec2 p){ p = fract(p * vec2(0.1031, 0.1030)); p += dot(p, p.yx + 33.33); return fract((p.x + p.y) * p.x); }
float n2(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(h2(i), h2(i + vec2(1.0, 0.0)), u.x), mix(h2(i + vec2(0.0, 1.0)), h2(i + vec2(1.0, 1.0)), u.x), u.y); }
float fb(vec2 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { s += a * n2(p); p = p * 2.07 + 11.3; a *= 0.5; } return s; }
void main() {
  #include <logdepthbuf_fragment>
  vec2 p = (vW.xz - uOff * 0.35) / 2600.0;
  float d = fb(p) ;
  // more cloud to the south (the plains), thinning toward the mountains
  float south = smoothstep(-2000.0, 6000.0, vW.z - uC.y);
  float edge = 1.0 - smoothstep(16000.0, 22000.0, length(vW.xz - uC));
  float a = smoothstep(0.42 - 0.18 * south, 0.72, d) * edge * 0.55;
  if (a < 0.004) discard;
  vec3 col = mix(uShade, uSun, 0.55 + 0.45 * smoothstep(0.4, 0.8, d));
  gl_FragColor = vec4(col, a);
  #include <tonemapping_fragment>
  #include <encodings_fragment>
  #include <fog_fragment>
}`,
      transparent: true, depthWrite: false, fog: true
    });
    const sea = new THREE.Group();
    for (const [y, s] of [[1230, 1], [1275, 0.97], [1320, 0.94]]) {
      const pl = new THREE.Mesh(new THREE.PlaneGeometry(46000 * s, 46000 * s), seaMat);
      pl.rotation.x = -Math.PI / 2; pl.position.set((box.e0 + box.e1) / 2, y, -(box.n0 + box.n1) / 2); pl.renderOrder = -0.4; pl.frustumCulled = false; sea.add(pl);
    }
    scene.add(sea);

    /* ---------- gully mist along the forest streams ---------- */
    let mist = null;
    if (quality.grassDensity > 0.7 && streams) {
      const mp = [];
      for (const st of streams) for (let k = 0; k < st.p.length; k += 2) {
        if (R() > 0.06) continue;
        const x = st.p[k], z = -st.p[k + 1], y = H(x, z);
        if (y > 2300 || y < 1500) continue;
        for (let j = 0; j < 2; j++) mp.push({ x: x + (R() - 0.5) * 30, z: z + (R() - 0.5) * 30, y: y + 4 + R() * 6, s: 20 + R() * 22, a: 0.08 + R() * 0.07, flat: 0.4 });
      }
      if (mp.length) mist = puffMesh(mp, false, [14, 45, 160, 420], 1);
    }

    const off = U.uCloudOff.value;
    return {
      counts: { clouds: clouds.length, puffs: puffs.length, mist: mist ? mist.count : 0 },
      update(dt, cam, time) {
        off.x = (time * WIND.x) % SIZE; off.y = (time * WIND.y) % SIZE;
        U.uCloudSun.value.copy(sunDir);
        cumulus.material.uniforms.uTime.value = time;
        if (mist) mist.material.uniforms.uTime.value = time;
      }
    };
  }
};
