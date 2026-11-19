'use strict';
/* Ground material for the Triund walk test.
   Colour: Sentinel-2 cloudless 2016 (near box + far box), graded, with procedural near detail
   (grass/soil/litter, rock on steep ground) and the trail surface from OSM tags.
   Light: standard PBR with the real-time sun shadow map, plus baked mountain cast shadow (sun) and
   ambient occlusion (ao) from the DEM.
   Mesh attribute `tdat` (vec4): x = trail weight, y = surface id / 4 (0 gravel, 1 dirt/ground, 2 rock,
   3 concrete), z = baked sun visibility, w = baked ambient occlusion. */
window.TriundTerrain = {
  // tex: optional { dir, renderer } -> CC0 photo ground textures (Poly Haven) for the near ground; loaded in the
  // background, the procedural detail is used until they arrive
  material({ THREE, satNear, satFar, nearBox, farBox, tex }) {
    const uniforms = {
      uSatN: { value: satNear }, uSatF: { value: satFar },
      uBoxN: { value: new THREE.Vector4(nearBox.e0, nearBox.e1, nearBox.n0, nearBox.n1) },
      uBoxF: { value: new THREE.Vector4(farBox.e0, farBox.e1, farBox.n0, farBox.n1) },
      uSatOK: { value: 0 }, uSatGain: { value: 1.25 }, uSatSat: { value: 1.18 }, uTexOK: { value: 0 },
      uAutumn: { value: 1 },   // late-autumn grass: the high meadows dry to gold and brown (season.js)
      uWet: { value: 0 }    // monsoon: wet, darker, greener ground and puddles on the trail (season.js)
    };
    // ground photo textures (CC0, polyhaven.com): uniform -> file
    const TEX = { tGrass: 'grass_d', tMeadow: 'meadow_d', tLitter: 'litter_d', tRock: 'rock_d', tTrail: 'trail_d', tDirt: 'dirt_d', tPave: 'pave_d',
                  nLitter: 'litter_n', nRock: 'rock_n', nTrail: 'trail_n' };
    const blank = new THREE.DataTexture(new Uint8Array([128, 128, 255, 255]), 1, 1, THREE.RGBAFormat); blank.needsUpdate = true;
    for (const k in TEX) uniforms[k] = { value: blank };
    if (tex) {
      const loader = new THREE.TextureLoader(), maxAniso = tex.renderer ? tex.renderer.capabilities.getMaxAnisotropy() : 4;
      Promise.all(Object.keys(TEX).map(k => new Promise(res => loader.load(tex.dir + TEX[k] + '.jpg', t => {
        t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = Math.min(8, maxAniso); uniforms[k].value = t; res(true);
      }, undefined, () => res(false))))).then(ok => { if (ok.every(Boolean)) uniforms.uTexOK.value = 1; });
    }
    // Pre-baked tileable noise (256 px = 32 lattice cells): R = 4-octave fbm, G = one octave, B/A = shifted copies.
    // One mipmapped fetch replaces ~16 hash evaluations per fbm call (the ground covers most of the screen, so this
    // is the biggest per-pixel saving), and the mipmaps stop distant ground from shimmering.
    uniforms.tNoise = { value: noiseTexture(THREE) };
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.96, metalness: 0 });
    mat.onBeforeCompile = sh => {
      Object.assign(sh.uniforms, uniforms);
      if (window.TriundAtmos) window.TriundAtmos.optIn(sh);   // cloud shadows
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nattribute vec4 tdat;\nvarying vec4 vT;\nvarying vec3 vW;\nvarying vec3 vWN;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvT = tdat;\nvW = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvWN = normalize(mat3(modelMatrix) * objectNormal);');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', `#include <common>
uniform sampler2D uSatN; uniform sampler2D uSatF; uniform vec4 uBoxN; uniform vec4 uBoxF;
uniform float uSatOK; uniform float uSatGain; uniform float uSatSat; uniform float uTexOK; uniform float uWet; uniform float uAutumn;
uniform sampler2D tGrass; uniform sampler2D tMeadow; uniform sampler2D tLitter; uniform sampler2D tRock; uniform sampler2D tTrail;
uniform sampler2D tDirt; uniform sampler2D tPave; uniform sampler2D nLitter; uniform sampler2D nRock; uniform sampler2D nTrail;
uniform sampler2D tNoise;
varying vec4 vT; varying vec3 vW; varying vec3 vWN;
float tn(vec2 p){ return texture2D(tNoise, p * 0.03125).g; }        // one octave, lattice cell = 1 unit
float tf(vec2 p){ return texture2D(tNoise, p * 0.03125).r; }        // 4-octave fbm
// photo texture in linear colour; two samplings (different scale + rotation) blended by noise hide the tiling
vec3 ptex(sampler2D t, vec2 q, float m, float n){
  vec3 a = texture2D(t, q / m).rgb, b = texture2D(t, vec2(q.y, -q.x) / (m * 2.37) + 0.31).rgb;
  return pow(mix(a, b, smoothstep(0.3, 0.7, n)), vec3(2.2));
}
float lum(vec3 c){ return dot(c, vec3(0.2126, 0.7152, 0.0722)); }`)
        .replace('#include <color_fragment>', `
vec3 base = vColor;
vec2 p = vW.xz;
float dist = length(vW - cameraPosition);
if (uSatOK > 0.5) {
  vec2 en = vec2(vW.x, -vW.z);
  vec2 uvN = (en - uBoxN.xz) / (uBoxN.yw - uBoxN.xz);
  vec2 uvF = (en - uBoxF.xz) / (uBoxF.yw - uBoxF.xz);
  vec2 eN = min(uvN, 1.0 - uvN);
  float inN = smoothstep(0.0, 0.025, min(eN.x, eN.y));
  vec3 sat = mix(texture2D(uSatF, clamp(uvF, 0.0, 1.0)).rgb, texture2D(uSatN, clamp(uvN, 0.0, 1.0)).rgb, inN);
  sat = pow(sat, vec3(2.2));
  float l = dot(sat, vec3(0.2126, 0.7152, 0.0722));
  sat = max(vec3(0.0), mix(vec3(l), sat, uSatSat)) * uSatGain;
  base = mix(sat, base, smoothstep(3900.0, 4300.0, vW.y));   // the procedural palette keeps the snow on the high range
}
// dark canopy in the imagery = forest: the floor under it is leaf litter, not dark green
float canopy = (1.0 - smoothstep(0.03, 0.075, dot(base, vec3(0.2126, 0.7152, 0.0722)))) * uSatOK;
// macro breakup at every distance hides the 10 m pixels of the imagery
float n1 = tf(p * 0.11);
base *= 0.8 + 0.4 * n1;
float slope = 1.0 - clamp(vWN.y, 0.0, 1.0);
float near = 1.0 - smoothstep(45.0, 170.0, dist);
vec2 q = vec2(p.x, -p.y);                       // texture space: u east, v north
float nb = tf(p * 0.045);                       // breaks up texture tiling
float soil = smoothstep(0.58, 0.78, tf(p * 0.23 + 7.3));
float rock = smoothstep(0.42, 0.62, slope + (n1 - 0.5) * 0.25);
float wTrail = 0.0;
if (near > 0.001) {
  float n2 = tf(p * 1.7), n3 = tn(p * 7.0);
  vec3 d;
  if (uTexOK > 0.5) {
    vec3 g = mix(ptex(tGrass, q, 2.0, nb), ptex(tMeadow, q, 2.0, 1.0 - nb), smoothstep(0.45, 0.75, tf(p * 0.07 + 3.1)) * 0.6);
    // keep the satellite's large-scale tone: brightness follows the imagery, hue mostly the photo's own
    g *= clamp(lum(base) / max(lum(g), 1e-3), 0.55, 1.6);
    g = mix(g, base * (g / max(vec3(lum(g)), 1e-3)) * 0.6 + g * 0.4, 0.3);
    vec3 l = ptex(tLitter, q, 1.5, nb) * 0.62;  // shaded forest floor: needles and oak leaves
    vec3 so = ptex(tDirt, q, 2.2, nb);
    d = mix(g, l, canopy * (0.55 + 0.4 * n2));
    d = mix(d, so, soil * 0.55 * (1.0 - canopy));
  } else {
    vec3 grassC = base * vec3(0.95, 1.1, 0.82);
    vec3 litter = vec3(0.16, 0.11, 0.065) * (0.8 + 0.5 * n3);
    d = mix(grassC, litter, max(soil * 0.75, canopy * (0.55 + 0.35 * n2)));
    d *= (0.8 + 0.4 * n2) * (0.9 + 0.2 * n3);
  }
  base = mix(base, d, near);
}
// bare rock on steep ground; pattern runs along height on steep faces so it does not smear down cliffs
vec2 rq = vec2(vW.x + vW.z * 0.7, vW.y);
vec3 rockC = vec3(0.19, 0.18, 0.165) * (0.65 + 0.6 * tf(rq * 0.5)) * (0.85 + 0.3 * tn(vec2(vW.x - vW.z, vW.y) * 3.0));
if (uTexOK > 0.5 && near > 0.001) {
  vec3 rt = ptex(tRock, rq, 2.7, nb);
  rt = mix(vec3(lum(rt)), rt, 0.35) * 0.95;      // Dhauladhar granite and slate are greyer than this sandstone photo
  rockC = mix(rockC, rt, near);
}
base = mix(base, rockC, rock);
// late autumn: the open meadows above the forest have dried to gold and brown (the imagery is a green summer)
{
  float hA = vW.y + (tf(p * 0.006) - 0.5) * 160.0;
  float dry = uAutumn * (1.0 - rock) * (1.0 - canopy) * (0.35 * smoothstep(2650.0, 2900.0, hA) + 0.3 * smoothstep(3000.0, 3300.0, hA));
  vec3 gold = vec3(0.30, 0.25, 0.13) * (0.8 + 0.4 * tf(p * 0.08));
  base = mix(base, gold * (0.7 + 0.6 * lum(base) / max(lum(gold), 1e-3) * 0.5), clamp(dry, 0.0, 0.7));
}
// the high Dhauladhar in late November: above ~3,300 m the grass gives way to grey rock and scree, and above
// ~3,850 m snow lies on every gentler slope, with streaks of it down the gullies of the steep faces. The line
// wanders with the terrain (noise) so it never looks like a contour.
{
  float hAlt = vW.y + (tf(p * 0.0035) - 0.5) * 300.0 + (tf(p * 0.02) - 0.5) * 80.0;
  float alpine = smoothstep(3250.0, 3650.0, hAlt);
  vec3 scree = vec3(0.25, 0.24, 0.225) * (0.75 + 0.5 * tf(p * 0.045)) * (0.85 + 0.3 * tf(vec2(vW.x - vW.z, vW.y) * 0.08));
  base = mix(base, scree, alpine * 0.9);
  float gully = smoothstep(0.55, 0.85, tf(vec2((vW.x + vW.z) * 0.035, vW.y * 0.006)));
  float snow = smoothstep(3780.0, 4020.0, hAlt) * (1.0 - smoothstep(0.5, 0.82, slope));
  snow = max(snow, smoothstep(3950.0, 4350.0, hAlt) * gully * 0.85);
  snow *= 0.85 + 0.15 * tf(p * 0.3);
  base = mix(base, vec3(0.86, 0.89, 0.93), clamp(snow, 0.0, 1.0));
}
// trail surface (OSM surface tag)
float tw = vT.x;
if (tw > 0.002) {
  float id = floor(vT.y * 4.0 + 0.5);
  float e = smoothstep(0.3, 0.75, tw + (tn(p * 1.4) - 0.5) * 0.55);
  vec3 tc;
  if (id < 0.5) {            // gravel
    tc = vec3(0.24, 0.2, 0.15) * (0.7 + 0.5 * tn(p * 16.0)) * (0.85 + 0.3 * tn(p * 2.3));
    tc = mix(tc, vec3(0.26, 0.23, 0.19), smoothstep(0.82, 0.9, tn(p * 11.0 + 3.0)) * 0.6);
  } else if (id < 1.5) {     // dirt / ground: packed soil with roots and pebbles
    tc = vec3(0.2, 0.135, 0.08) * (0.75 + 0.45 * tf(p * 2.2));
    tc = mix(tc, vec3(0.2, 0.17, 0.13), smoothstep(0.84, 0.92, tn(p * 8.0)) * 0.7);
  } else if (id < 2.5) {     // rock slabs
    float c = tn(p * 1.6);
    tc = vec3(0.27, 0.26, 0.24) * (0.6 + 0.6 * c) * (0.85 + 0.3 * tn(p * 9.0));
  } else {                   // paved path with joints (Bhagsu waterfall pathway)
    vec2 q = fract(p * vec2(0.9, 0.45));
    float j = smoothstep(0.0, 0.05, q.x) * smoothstep(1.0, 0.95, q.x) * smoothstep(0.0, 0.05, q.y) * smoothstep(1.0, 0.95, q.y);
    tc = vec3(0.15, 0.145, 0.135) * (0.85 + 0.2 * tn(p * 3.0)) * (0.7 + 0.3 * j);
  }
  if (uTexOK > 0.5 && near > 0.001) {
    vec3 tt;
    if (id < 0.5) tt = ptex(tTrail, q, 2.0, nb) * 0.82;
    else if (id < 1.5) tt = mix(ptex(tDirt, q, 2.2, nb), ptex(tTrail, q, 2.0, nb), 0.35) * 1.1;
    else if (id < 2.5) tt = mix(ptex(tTrail, q, 2.0, nb), ptex(tRock, rq, 2.7, nb) * 0.8, 0.5);
    else tt = ptex(tPave, q, 1.8, nb) * 1.15;
    tc = mix(tc, tt, near);
  }
  base = mix(base, tc, e);
  wTrail = e;
}
// monsoon: soaked soil and rock are darker, the meadows go lush green, the trail holds puddles
float pud = 0.0;
if (uWet > 0.001) {
  float veg = (1.0 - rock) * (1.0 - wTrail);
  base = mix(base, base * vec3(0.8, 1.12, 0.7) + vec3(0.0, 0.008, 0.0), uWet * 0.55 * veg);
  base *= 1.0 - 0.3 * uWet * (1.0 - 0.5 * veg);
  pud = uWet * wTrail * (1.0 - smoothstep(0.33, 0.4, tf(p * 0.35 + 5.1))) * near;
  base = mix(base, vec3(0.13, 0.14, 0.15), pud * 0.85);           // standing water mirrors the grey sky
}
diffuseColor.rgb = base;`)
        // baked mountain shadow cuts direct sun only; AO cuts sky light and a little of the sun
        // (#includes are not expanded yet, so patch the chunk text itself)
        .replace('#include <lights_fragment_begin>', THREE.ShaderChunk.lights_fragment_begin.replace(
          /RE_Direct\( directLight, geometry, material, reflectedLight \);/g,
          'directLight.color *= vT.z * (1.0 - 0.35 * vT.w);\n\t\tRE_Direct( directLight, geometry, material, reflectedLight );'))
        // photo normal maps on the near ground (planar for ground and trail, vertical projection on rock)
        .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
if (uTexOK > 0.5 && near > 0.01) {
  vec3 nmL = texture2D(nLitter, q / 1.5).xyz * 2.0 - 1.0;
  vec3 nmT = texture2D(nTrail, q / 2.0).xyz * 2.0 - 1.0;
  vec3 nmR = texture2D(nRock, rq / 2.7).xyz * 2.0 - 1.0;
  vec3 nm = mix(mix(nmL * vec3(0.6, 0.6, 1.0), nmT, wTrail), nmR, rock);
  vec3 N = normalize(vWN), Tw = normalize(vec3(1.0, 0.0, 0.0) - N * N.x), Bw = normalize(cross(N, Tw));
  vec3 wn = normalize(N + (Tw * nm.x + Bw * nm.y) * near);
  normal = normalize((viewMatrix * vec4(wn, 0.0)).xyz);
}`)
        // no specular: dry ground and gravel should not mirror the sky at grazing angles
        // wet ground shines a little, puddles a lot (they need a low roughness too)
        .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(mix(roughnessFactor, 0.55, uWet * 0.6), 0.06, pud);')
        .replace('#include <aomap_fragment>', '#include <aomap_fragment>\nreflectedLight.indirectDiffuse *= 1.0 - 0.8 * vT.w;\nreflectedLight.directSpecular *= uWet * 0.3 + pud * 1.2;\nreflectedLight.indirectSpecular *= uWet * 0.15 + pud * 1.4;');
    };
    mat.userData.uniforms = uniforms;
    return mat;
  }
};

// Tileable value noise, period 256 px. Octave k has 32 * 2^k lattice cells across the tile.
function noiseTexture(THREE) {
  const N = 256, out = new Uint8Array(N * N * 4);
  function lattice(cells, seed) {
    const L = new Float32Array(cells * cells);
    let h = seed >>> 0;
    for (let i = 0; i < L.length; i++) { h = Math.imul(h ^ (h >>> 15), 2246822519) + 0x9e3779b9 >>> 0; h ^= h >>> 13; L[i] = (h >>> 8) / 16777216; }
    return L;
  }
  function octave(cells, seed) {
    const L = lattice(cells, seed), o = new Float32Array(N * N), k = cells / N;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const fx = x * k, fy = y * k, ix = Math.floor(fx), iy = Math.floor(fy), tx = fx - ix, ty = fy - iy;
      const ux = tx * tx * (3 - 2 * tx), uy = ty * ty * (3 - 2 * ty);
      const a = L[(iy % cells) * cells + ix % cells], b = L[(iy % cells) * cells + (ix + 1) % cells];
      const c = L[((iy + 1) % cells) * cells + ix % cells], d = L[((iy + 1) % cells) * cells + (ix + 1) % cells];
      o[y * N + x] = (a + (b - a) * ux) * (1 - uy) + (c + (d - c) * ux) * uy;
    }
    return o;
  }
  const o1 = octave(32, 11), o2 = octave(64, 23), o3 = octave(128, 37), o4 = octave(256, 53), o5 = octave(32, 71);
  for (let i = 0; i < N * N; i++) {
    const f = (o1[i] * 0.5 + o2[i] * 0.25 + o3[i] * 0.125 + o4[i] * 0.0625) / 0.9375;
    out[i * 4] = f * 255; out[i * 4 + 1] = o1[i] * 255; out[i * 4 + 2] = o5[i] * 255; out[i * 4 + 3] = 255;
  }
  const t = new THREE.DataTexture(out, N, N, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true; t.anisotropy = 4; t.needsUpdate = true;
  return t;
}
