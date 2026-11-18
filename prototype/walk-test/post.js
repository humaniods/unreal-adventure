'use strict';
/* Post-processing and dynamic resolution for the Triund walk test.
   The scene renders into one fixed-size render target. Dynamic resolution only shrinks the viewport inside that
   target, so a change never reallocates GPU memory (on a 1 GB integrated GPU a reallocation stalls for 100-500 ms).
   One full-screen pass then upscales the used part and applies, in order: FXAA (edge smoothing, replaces MSAA),
   contrast-adaptive sharpening (so a lowered resolution still reads crisp), a filmic grade (contrast, saturation,
   warm highlights / cool shadows), a soft vignette and fine grain.
   The target stores sRGB (the scene shaders already tone map and encode), so the pass works in display space. */
window.TriundPost = {
  create({ THREE, renderer }) {
    const rt = new THREE.WebGLRenderTarget(4, 4, { depthBuffer: true, stencilBuffer: false });
    rt.texture.encoding = THREE.sRGBEncoding;
    rt.texture.minFilter = rt.texture.magFilter = THREE.LinearFilter;
    rt.texture.generateMipmaps = false;
    const size = new THREE.Vector2(4, 4);
    let scale = 1;

    const U = {
      tScene: { value: rt.texture },
      uUv: { value: new THREE.Vector2(1, 1) },        // part of the target in use (viewport / size)
      uTexel: { value: new THREE.Vector2(0.25, 0.25) },
      uSharp: { value: 0.35 },
      uGrade: { value: 1 },
      uVig: { value: 0.14 },
      uTime: { value: 0 }
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: U, depthTest: false, depthWrite: false, toneMapped: false,
      vertexShader: 'varying vec2 vUv; void main(){ vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: `
precision highp float;
uniform sampler2D tScene; uniform vec2 uUv, uTexel; uniform float uSharp, uGrade, uVig, uTime;
varying vec2 vUv;
vec3 tap(vec2 uv) { return texture2D(tScene, clamp(uv, vec2(0.0), uUv - uTexel * 0.5)).rgb; }
float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
void main() {
  vec2 uv = vUv * uUv, t = uTexel;
  vec3 c = tap(uv);
  vec3 n = tap(uv + vec2(0.0, -t.y)), s = tap(uv + vec2(0.0, t.y)), e = tap(uv + vec2(t.x, 0.0)), w = tap(uv + vec2(-t.x, 0.0));
  float lc = luma(c), ln = luma(n), ls = luma(s), le = luma(e), lw = luma(w);
  float lmin = min(lc, min(min(ln, ls), min(le, lw))), lmax = max(lc, max(max(ln, ls), max(le, lw))), range = lmax - lmin;
  // FXAA (reduced): blend along the edge where local contrast is high
  if (range > max(0.04, lmax * 0.12)) {
    vec2 grad = vec2(le - lw, ls - ln), dir = normalize(vec2(-grad.y, grad.x) + 1e-5);   // along the edge
    vec3 a = 0.5 * (tap(uv + dir * t * 0.5) + tap(uv - dir * t * 0.5));
    vec3 b = 0.5 * a + 0.25 * (tap(uv + dir * t * 1.5) + tap(uv - dir * t * 1.5));
    float lb = luma(b);
    c = (lb < lmin || lb > lmax) ? a : b;
  } else {
    // contrast-adaptive sharpening on flat-ish areas (CAS-style weight: less where contrast is already high)
    float amp = clamp(min(lmin, 1.0 - lmax) / max(lmax, 1e-3), 0.0, 1.0);
    float wgt = -sqrt(amp) * uSharp * 0.2;
    c = clamp((c + (n + s + e + w) * wgt) / (1.0 + 4.0 * wgt), 0.0, 1.0);
  }
  // filmic grade: gentle S-curve, a touch more saturation, warm highlights and cool shadows (Himalayan morning)
  vec3 g = c;
  g = mix(g, g * g * (3.0 - 2.0 * g), 0.12);
  g += 0.018 * (1.0 - g) * (1.0 - smoothstep(0.0, 0.3, luma(g)));   // lift the deepest shadows a touch (forest floor)
  float l = luma(g);
  g = mix(vec3(l), g, 1.08);
  g += vec3(0.018, 0.008, -0.012) * smoothstep(0.45, 1.0, l) + vec3(-0.008, 0.0, 0.014) * (1.0 - smoothstep(0.0, 0.35, l));
  c = mix(c, clamp(g, 0.0, 1.0), uGrade);
  // vignette and grain
  vec2 q = vUv - 0.5;
  c *= 1.0 - uVig * smoothstep(0.25, 0.85, dot(q, q) * 2.2);
  c += (fract(sin(dot(vUv * 913.7 + uTime, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) * 0.012;
  gl_FragColor = vec4(c, 1.0);
}`
    });
    const tri = new THREE.BufferGeometry();
    tri.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
    const quad = new THREE.Mesh(tri, mat); quad.frustumCulled = false;
    const pscene = new THREE.Scene(); pscene.add(quad);
    const pcam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    function applyViewport() {
      const w = Math.max(1, Math.round(size.x * scale)), h = Math.max(1, Math.round(size.y * scale));
      rt.viewport.set(0, 0, w, h); rt.scissor.set(0, 0, w, h); rt.scissorTest = scale < 1;
      U.uUv.value.set(w / size.x, h / size.y); U.uTexel.value.set(1 / size.x, 1 / size.y);
      U.uSharp.value = 0.3 + 0.9 * (1 - scale);
    }
    return {
      rt, uniforms: U,
      get scale() { return scale; },
      // full drawing-buffer size; reallocates (only on window resize or a quality change)
      setSize(w, h) { w = Math.max(1, Math.round(w)); h = Math.max(1, Math.round(h)); if (w === size.x && h === size.y) return; size.set(w, h); rt.setSize(w, h); applyViewport(); },
      setScale(s) { s = Math.min(1, Math.max(0.5, s)); if (Math.abs(s - scale) < 0.005) return; scale = s; applyViewport(); },
      render(scene, camera, time) {
        U.uTime.value = (time || 0) % 100;
        renderer.setRenderTarget(rt); renderer.render(scene, camera);
        renderer.setRenderTarget(null); renderer.render(pscene, pcam);
      }
    };
  }
};
