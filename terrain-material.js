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
      uSatOK: { value: 0 }, uSatGain: { value: 1.25 }, uSatSat: { value: 1.18 }, uTexOK: { value: 0 }
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
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.96, metalness: 0 });
    mat.onBeforeCompile = sh => {
      Object.assign(sh.uniforms, uniforms);
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nattribute vec4 tdat;\nvarying vec4 vT;\nvarying vec3 vW;\nvarying vec3 vWN;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvT = tdat;\nvW = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvWN = normalize(mat3(modelMatrix) * objectNormal);');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', `#include <common>
uniform sampler2D uSatN; uniform sampler2D uSatF; uniform vec4 uBoxN; uniform vec4 uBoxF;
uniform float uSatOK; uniform float uSatGain; uniform float uSatSat; uniform float uTexOK;
uniform sampler2D tGrass; uniform sampler2D tMeadow; uniform sampler2D tLitter; uniform sampler2D tRock; uniform sampler2D tTrail;
uniform sampler2D tDirt; uniform sampler2D tPave; uniform sampler2D nLitter; uniform sampler2D nRock; uniform sampler2D nTrail;
varying vec4 vT; varying vec3 vW; varying vec3 vWN;
float th(vec2 p){ p = fract(p * vec2(0.1031, 0.1030)); p += dot(p, p.yx + 33.33); return fract((p.x + p.y) * p.x); }
float tn(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(th(i), th(i + vec2(1.0, 0.0)), u.x), mix(th(i + vec2(0.0, 1.0)), th(i + vec2(1.0, 1.0)), u.x), u.y); }
float tf(vec2 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { s += a * tn(p); p = p * 2.03 + 17.1; a *= 0.5; } return s / 0.9375; }
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
        .replace('#include <aomap_fragment>', '#include <aomap_fragment>\nreflectedLight.indirectDiffuse *= 1.0 - 0.8 * vT.w;\nreflectedLight.directSpecular *= 0.0;\nreflectedLight.indirectSpecular *= 0.0;');
    };
    mat.userData.uniforms = uniforms;
    return mat;
  }
};
