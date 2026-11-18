/* Vegetation and trail stones for the Triund walk test.
   Trees: deodar, banj oak, rhododendron and understorey bushes. Full card meshes near the player,
   crossed-quad impostors beyond the LOD radius. Placement follows the Sentinel-2 forest mask.
   Grass + meadow flowers live in cells around the player. Everything sways in a shared wind. */
window.TriundFlora = {
  build(o) {
    'use strict';
    const { THREE, scene, H, trailD, isMeadow, forest, groundTint, sunAt, aoAt, randomTrailPoint, accept, trails, rng, renderer } = o;
    let Q = o.quality;
    const R = rng(7);
    const lin = hex => new THREE.Color(hex).convertSRGBToLinear();
    const lodTrees = { value: new THREE.Vector2(0, 1) }, lodBush = { value: new THREE.Vector2(0, 1) };   // dissolve band (m)
    const wind = { uTime: { value: 0 }, uWind: { value: 1 }, uCam: { value: new THREE.Vector3() }, uR: { value: Q.grassR } };

    /* ---------------- shader patches ---------------- */
    // foliage/grass: wind sway, optional fade at the grass radius, no back-face normal flip (cards light the same from
    // both sides), no specular (leaves and blades must not mirror the sky), and a little light through the leaves
    // lodU: optional {value: Vector2(start, end)} -> the mesh dissolves out between start and end metres (screen-door),
    // matched by the impostor dissolving in, so the switch never pops
    function windify(mat, bend, fade, trans, lodU) {
      mat.onBeforeCompile = sh => {
        sh.uniforms.uTime = wind.uTime; sh.uniforms.uWind = wind.uWind; sh.uniforms.uCam = wind.uCam; sh.uniforms.uR = wind.uR;
        if (lodU) sh.uniforms.uLod = lodU;
        sh.vertexShader = sh.vertexShader
          .replace('#include <common>', '#include <common>\nuniform float uTime; uniform float uWind; uniform vec3 uCam; uniform float uR;' + (lodU ? '\nuniform vec2 uLod; varying float vLodF;' : ''))
          .replace('#include <begin_vertex>', `#include <begin_vertex>
#ifdef USE_INSTANCING
  vec3 ip = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
#else
  vec3 ip = vec3(0.0);
#endif
  float ph = ip.x * 0.071 + ip.z * 0.053;
  float hh = max(transformed.y, 0.0);
  float sw = (sin(uTime * 1.3 + ph) * 0.6 + sin(uTime * 2.7 + ph * 1.9) * 0.25) * uWind;
  transformed.x += sw * ${bend.toFixed(4)} * hh * hh;
  transformed.z += cos(uTime * 1.05 + ph * 1.3) * 0.45 * uWind * ${bend.toFixed(4)} * hh * hh;
  ${fade ? 'transformed *= 1.0 - smoothstep(uR * 0.62, uR, distance(ip.xz, uCam.xz));' : ''}
  ${lodU ? 'vLodF = 1.0 - smoothstep(uLod.x, uLod.y, distance(ip.xz, uCam.xz));' : ''}`);
        if (lodU) sh.fragmentShader = sh.fragmentShader
          .replace('#include <common>', '#include <common>\nvarying float vLodF;\nfloat ign(vec2 p){ return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }')
          // also dissolve leaves right in front of the camera (third-person camera inside a crown)
          .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\nif (ign(gl_FragCoord.xy) > min(vLodF, smoothstep(0.7, 2.6, length(vViewPosition)))) discard;');
      };
      // three caches programs by onBeforeCompile.toString(), which is the same for every bend value
      const prev = mat.onBeforeCompile;
      mat.onBeforeCompile = sh => {
        prev(sh);
        if (window.TriundAtmos) window.TriundAtmos.optIn(sh);   // cloud shadows
        sh.fragmentShader = sh.fragmentShader
          .replace('#include <normal_fragment_begin>', THREE.ShaderChunk.normal_fragment_begin.replace('normal = normal * faceDirection;', ''))
          .replace('#include <aomap_fragment>', '#include <aomap_fragment>\nreflectedLight.directSpecular *= 0.0;\nreflectedLight.indirectSpecular *= 0.0;\nreflectedLight.indirectDiffuse += diffuseColor.rgb * ' + (trans || 0).toFixed(3) + ';');
      };
      mat.customProgramCacheKey = () => 'wind' + bend + (fade ? 'f' : '') + (trans || 0) + (lodU ? 'L' : '');
      return mat;
    }

    /* ---------------- canvas textures ---------------- */
    function canvasTex(w, h, draw) {
      const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d');
      draw(g, w, h);
      const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; t.anisotropy = 4;
      return t;
    }
    const rr = rng(99);
    const pick = a => a[(rr() * a.length) | 0];
    // deodar branch: twig from the trunk (left) to the drooping tip (right), dense soft needles
    const deodarTex = canvasTex(256, 128, (g, w, h) => {
      const cols = ['#2c4436', '#3a5646', '#4a6857', '#253a2e', '#56735f', '#61806b'];
      for (let pass = 0; pass < 2; pass++) {
        for (let i = 0; i < 44; i++) {           // side twigs
          const x0 = 8 + rr() * (w - 30), y0 = h * 0.5 + (x0 / w) * h * 0.12, len = 30 + rr() * 50 * (1 - x0 / w * 0.6);
          const ang = (rr() < 0.5 ? -1 : 1) * (0.5 + rr() * 0.5) + 0.25;
          const x1 = x0 + Math.cos(ang) * len, y1 = y0 + Math.sin(ang) * len * 0.55;
          if (pass === 0) { g.strokeStyle = '#3b2d22'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke(); continue; }
          for (let k = 0; k < 22; k++) {        // needle tufts
            const t = rr(), cx = x0 + (x1 - x0) * t, cy = y0 + (y1 - y0) * t;
            g.strokeStyle = pick(cols); g.lineWidth = 1.6;
            for (let m = 0; m < 6; m++) { const a = rr() * Math.PI * 2, l = 4 + rr() * 6; g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(a) * l, cy + Math.sin(a) * l * 0.8); g.stroke(); }
          }
        }
      }
      g.strokeStyle = '#4a3828'; g.lineWidth = 3; g.beginPath(); g.moveTo(0, h * 0.5); g.quadraticCurveTo(w * 0.6, h * 0.5, w, h * 0.66); g.stroke();
    });
    function leafTex(leafCols, flowerCols, leafLen) {
      return canvasTex(256, 256, (g, w, h) => {
        for (let i = 0; i < 420; i++) {
          const x = 20 + rr() * (w - 40), y = 20 + rr() * (h - 40);
          const dx = (x - w / 2) / (w / 2), dy = (y - h / 2) / (h / 2);
          if (dx * dx + dy * dy > 0.92 + rr() * 0.1) continue;
          g.save(); g.translate(x, y); g.rotate(rr() * Math.PI * 2); g.fillStyle = pick(leafCols);
          g.beginPath(); g.ellipse(0, 0, leafLen * (0.7 + rr() * 0.5), leafLen * 0.38, 0, 0, Math.PI * 2); g.fill(); g.restore();
        }
        if (flowerCols) for (let i = 0; i < 26; i++) {
          const x = 40 + rr() * (w - 80), y = 40 + rr() * (h - 80);
          for (let k = 0; k < 7; k++) { g.fillStyle = pick(flowerCols); g.beginPath(); g.arc(x + (rr() - 0.5) * 14, y + (rr() - 0.5) * 14, 4 + rr() * 3, 0, Math.PI * 2); g.fill(); }
        }
      });
    }
    const oakTex = leafTex(['#3c5331', '#4b6239', '#5d7448', '#6f7f5e', '#33482b', '#7c8b6c'], null, 9);
    const rhodoTex = leafTex(['#22361f', '#2c4527', '#1c2d1a', '#35512f', '#3f5a36'], ['#b3202a', '#cf3038', '#9e1b26', '#e04a4f'], 12);
    const bushTex = leafTex(['#34482a', '#425a33', '#526b3e', '#2b3d24'], null, 7);
    /* ---------------- geometry helpers (unit height 1) ---------------- */
    function Builder() { this.p = []; this.n = []; this.uv = []; this.i = []; }
    Builder.prototype.quad = function (a, b, c, d, nrm, uvs) {   // a,b,c,d: [x,y,z] in order around the quad
      const base = this.p.length / 3;
      const perVertex = Array.isArray(nrm[0]);   // one normal per corner, or one for the whole quad
      [a, b, c, d].forEach((v, k) => { this.p.push(v[0], v[1], v[2]); const nn = perVertex ? nrm[k] : nrm; this.n.push(nn[0], nn[1], nn[2]); this.uv.push(uvs[k * 2], uvs[k * 2 + 1]); });
      this.i.push(base, base + 1, base + 2, base, base + 2, base + 3);
    };
    Builder.prototype.geo = function () {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
      g.setIndex(this.i); return g;
    };
    const norm = v => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
    const UVQ = [0, 0, 1, 0, 1, 1, 0, 1];

    function deodarGeo() {
      const b = new Builder(), T = 15, gr = rng(3);
      for (let t = 0; t < T; t++) {
        const y = 0.13 + 0.83 * Math.pow(t / (T - 1), 0.95), r = 0.3 * Math.pow(1 - (y - 0.13) / 0.89, 0.8) + 0.025;
        const n = Math.max(5, Math.round(5 + 9 * r / 0.3)), off = gr() * 6.28;
        for (let k = 0; k < n; k++) {
          if (gr() < 0.14) continue;                                // missing branches break up the cone
          const a = off + k / n * Math.PI * 2 + (gr() - 0.5) * 0.5, ca = Math.cos(a), sa = Math.sin(a);
          const rr2 = r * (0.7 + gr() * 0.5), w = 0.75 * rr2 + 0.04, droop = (0.28 + gr() * 0.22) * rr2;
          const tx = -sa, tz = ca;                                  // tangent
          const i0 = [ca * 0.01 + tx * w * 0.2, y, sa * 0.01 + tz * w * 0.2], i1 = [ca * 0.01 - tx * w * 0.2, y, sa * 0.01 - tz * w * 0.2];
          const o1 = [ca * rr2 - tx * w * 0.5, y - droop, sa * rr2 - tz * w * 0.5], o0 = [ca * rr2 + tx * w * 0.5, y - droop, sa * rr2 + tz * w * 0.5];
          const nIn = norm([ca * 0.3, 1, sa * 0.3]), nOut = norm([ca, 0.7, sa]);
          // u runs trunk -> tip, v across the branch
          b.quad(i1, o1, o0, i0, [nIn, nOut, nOut, nIn], [0, 0, 1, 0, 1, 1, 0, 1]);
        }
      }
      for (let k = 0; k < 2; k++) {                                // leader at the top
        const a = k * Math.PI / 2, ca = Math.cos(a) * 0.05, sa = Math.sin(a) * 0.05, up = [0, 1, 0];
        b.quad([-ca, 0.86, -sa], [ca, 0.86, sa], [ca, 1.0, sa], [-ca, 1.0, -sa], up, [0, 0, 0, 1, 1, 1, 1, 0]);
      }
      return b.geo();
    }
    function crownGeo(cards, cy, rx, ry, size, seed) {
      const b = new Builder(), gr = rng(seed), L = [];
      for (let l = 0; l < 6; l++) { const u = gr() * 1.4 - 0.5, a = gr() * Math.PI * 2, s = Math.sqrt(1 - u * u); L.push([s * Math.cos(a) * 0.62, u * 0.62, s * Math.sin(a) * 0.62]); }
      for (let k = 0; k < cards; k++) {
        const lo = L[k % L.length];
        const u = gr() * 2 - 1, a = gr() * Math.PI * 2, s = Math.sqrt(1 - u * u), shell = 0.25 + 0.4 * Math.sqrt(gr());
        const dir = norm([lo[0] + s * Math.cos(a) * shell, lo[1] + u * shell, lo[2] + s * Math.sin(a) * shell]);
        const rad = Math.hypot(lo[0] + s * Math.cos(a) * shell, lo[1] + u * shell, lo[2] + s * Math.sin(a) * shell);
        const c = [dir[0] * rx * rad, cy + dir[1] * ry * rad, dir[2] * rx * rad];
        // card plane: random orientation, normal for lighting = outward from the crown centre (soft, rounded look)
        const ax = norm([gr() - 0.5, gr() - 0.5, gr() - 0.5]); let bx = norm([dir[1] * ax[2] - dir[2] * ax[1], dir[2] * ax[0] - dir[0] * ax[2], dir[0] * ax[1] - dir[1] * ax[0]]);
        const ux = norm([bx[1] * dir[2] - bx[2] * dir[1], bx[2] * dir[0] - bx[0] * dir[2], bx[0] * dir[1] - bx[1] * dir[0]]);
        const h = size * (0.75 + gr() * 0.5) / 2, nn = norm([dir[0], dir[1] + 0.35, dir[2]]);
        const P = (sx, sy) => [c[0] + ux[0] * sx * h + bx[0] * sy * h, c[1] + ux[1] * sx * h + bx[1] * sy * h, c[2] + ux[2] * sx * h + bx[2] * sy * h];
        b.quad(P(-1, -1), P(1, -1), P(1, 1), P(-1, 1), nn, UVQ);
      }
      return b.geo();
    }
    function trunkGeo(r0, r1, h, lean) {
      const g = new THREE.CylinderGeometry(r1, r0, h, 6, 3, true); g.translate(0, h / 2, 0);
      if (lean) { const p = g.attributes.position; for (let i = 0; i < p.count; i++) { const y = p.getY(i); p.setX(i, p.getX(i) + lean * y * y / h); } g.computeVertexNormals(); }
      return g;
    }
    function crossGeo(w) {
      const b = new Builder(), up = [0, 1, 0];
      b.quad([-w / 2, 0, 0], [w / 2, 0, 0], [w / 2, 1, 0], [-w / 2, 1, 0], up, UVQ);
      b.quad([0, 0, -w / 2], [0, 0, w / 2], [0, 1, w / 2], [0, 1, -w / 2], up, UVQ);
      return b.geo();
    }

    /* ---------------- species ---------------- */
    const foliageMat = (map, bend, lodU) => {
      const m = windify(new THREE.MeshStandardMaterial({ map, alphaTest: 0.42, side: THREE.DoubleSide, roughness: 0.92, metalness: 0 }), bend, false, 0.45, lodU);
      return m;
    };
    const depthMat = (map, bend) => windify(new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map, alphaTest: 0.42 }), bend, false);
    const barkMat = windify(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1 }), 0, false, 0.1, lodTrees);
    const SPECIES = {
      deodar: { geo: deodarGeo(), trunk: trunkGeo(0.022, 0.005, 0.96, 0), map: deodarTex, imp: 'deodar', bark: 0x5c4a3b, bend: 0.018 },
      oak: { geo: crownGeo(64, 0.64, 0.36, 0.27, 0.26, 11), trunk: trunkGeo(0.035, 0.016, 0.62, 0.04), map: oakTex, imp: 'broad', bark: 0x6a6357, bend: 0.03 },
      rhodo: { geo: crownGeo(52, 0.68, 0.38, 0.23, 0.28, 13), trunk: trunkGeo(0.04, 0.02, 0.7, 0.14), map: rhodoTex, imp: 'broad', bark: 0x5b4636, bend: 0.03 },
      bush: { geo: crownGeo(16, 0.48, 0.5, 0.4, 0.55, 17), trunk: null, map: bushTex, imp: null, bark: 0, bend: 0.05 }
    };

    /* ---------------- placement ---------------- */
    const trees = { deodar: [], oak: [], rhodo: [], bush: [] };
    const slopeAt = (x, z, y) => Math.hypot(H(x + 2, z) - y, H(x, z + 2) - y) / 2;
    let placed = 0;
    for (let tries = 0; tries < 160000 && placed < 13000; tries++) {
      const p = randomTrailPoint(R), a = R() * Math.PI * 2, r = 4 + Math.pow(R(), 1.5) * 470;
      const x = p.x + Math.cos(a) * r, z = p.z + Math.sin(a) * r;
      if (!accept(x, z)) continue;
      const y = H(x, z); const td = trailD(x, z); if (td < 4.5) continue;
      if (slopeAt(x, z, y) > 1.0) continue;                     // no trees on cliffs
      const f = forest(x, z), meadow = isMeadow(x, z, y);
      if (R() > (meadow ? 0.02 : 0.06 + 0.94 * f)) continue;   // follow the satellite forest mask
      const alt = y, u = R();
      let sp;
      if (alt < 2250) sp = u < 0.38 ? 'deodar' : u < 0.8 ? 'oak' : 'rhodo';
      else if (alt < 2650) sp = u < 0.3 ? 'deodar' : u < 0.62 ? 'oak' : 'rhodo';
      else sp = u < 0.18 ? 'deodar' : u < 0.48 ? 'oak' : 'rhodo';
      const h = sp === 'deodar' ? 15 + R() * 17 : sp === 'oak' ? 9 + R() * 9 : 6 + R() * 6;
      trees[sp].push({ x, y, z, h, w: 0.85 + R() * 0.35, rot: R() * 6.28, lean: (R() - 0.5) * 0.08, c: R(), sun: sunAt(x, z), ao: aoAt(x, z) });
      placed++;
      if (!meadow && f > 0.3 && R() < 0.45) {                  // understorey bush next to forest trees
        const bx = x + (R() - 0.5) * 9, bz = z + (R() - 0.5) * 9;
        if (accept(bx, bz) && trailD(bx, bz) > 2.2) { const by = H(bx, bz); trees.bush.push({ x: bx, y: by, z: bz, h: 1.2 + R() * 1.6, w: 1 + R() * 0.5, rot: R() * 6.28, lean: 0, c: R(), sun: sunAt(bx, bz), ao: aoAt(bx, bz) }); }
      }
    }

    /* ---------------- instanced meshes + LOD ---------------- */
    const dummy = new THREE.Object3D(), col = new THREE.Color();
    const tint = { deodar: [0x7c9a88, 0x93ad99], oak: [0x95a487, 0xb7c0a0], rhodo: [0x7d9673, 0x95a885], bush: [0x8c9b78, 0xa9b48d] };
    function treeColor(sp, t, k) {
      const a = lin(tint[sp][0]), b = lin(tint[sp][1]);
      col.copy(a).lerp(b, t.c);
      const shade = (0.5 + 0.5 * t.sun) * (1 - 0.45 * t.ao);   // baked mountain shadow + occlusion
      return col.multiplyScalar(shade * k);
    }
    /* ---------------- impostors baked from the real tree mesh ---------------- */
    // 8 views around each species -> albedo (sRGB) + tree-local normal atlases. Far trees are camera-facing cards that
    // pick the nearest view and are lit with the baked normals, so they match the near trees in shape and colour.
    const FR = 8, TAU = Math.PI * 2;
    function bakeImpostor(sp, S) {
      const parts = [{ geo: S.geo, map: S.map, col: new THREE.Color(1, 1, 1) }];
      if (S.trunk) parts.push({ geo: S.trunk, map: null, col: lin(S.bark).multiplyScalar(1.6) });
      const bb = new THREE.Box3(); for (const p of parts) { p.geo.computeBoundingBox(); bb.union(p.geo.boundingBox); }
      const W = 2 * Math.max(-bb.min.x, bb.max.x, -bb.min.z, bb.max.z) * 1.04, Hh = bb.max.y * 1.02;
      const TW = 256, TH = 512;
      const mk = enc => {
        const rt = new THREE.WebGLRenderTarget(TW * FR, TH, { format: THREE.RGBAFormat, type: THREE.UnsignedByteType });
        rt.texture.encoding = enc; rt.texture.generateMipmaps = true; rt.texture.minFilter = THREE.LinearMipmapLinearFilter; rt.texture.anisotropy = 4;
        return rt;
      };
      const rtA = mk(THREE.sRGBEncoding), rtN = mk(THREE.LinearEncoding);
      const sc = new THREE.Scene(), cam = new THREE.OrthographicCamera(-W / 2, W / 2, Hh / 2, -Hh / 2, 0.01, 60);
      const albedoM = parts.map(p => new THREE.MeshBasicMaterial({ map: p.map, color: p.col, alphaTest: p.map ? 0.42 : 0, side: THREE.DoubleSide, toneMapped: false, fog: false }));
      const nrmM = parts.map(p => new THREE.ShaderMaterial({
        side: THREE.DoubleSide, uniforms: { map: { value: p.map }, hasMap: { value: p.map ? 1 : 0 } },
        vertexShader: 'varying vec3 vN; varying vec2 vUv; void main(){ vN = normal; vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: 'uniform sampler2D map; uniform float hasMap; varying vec3 vN; varying vec2 vUv;\nvoid main(){ if (hasMap > 0.5 && texture2D(map, vUv).a < 0.42) discard; gl_FragColor = vec4(normalize(vN) * 0.5 + 0.5, 1.0); }'
      }));
      const meshes = parts.map((p, i) => { const m = new THREE.Mesh(p.geo, albedoM[i]); sc.add(m); return m; });
      const prevRT = renderer.getRenderTarget(), prevCol = renderer.getClearColor(new THREE.Color()), prevA = renderer.getClearAlpha(), prevAuto = renderer.autoClear;
      renderer.autoClear = false;
      const fol = lin(tint[sp][0]).convertLinearToSRGB();   // transparent texels carry a foliage colour so mip edges stay green
      for (const [rt, mats, cc] of [[rtA, albedoM, fol], [rtN, nrmM, new THREE.Color(0.5, 1, 0.5)]]) {
        meshes.forEach((m, i) => { m.material = mats[i]; });
        renderer.setRenderTarget(rt); renderer.setClearColor(cc, 0);
        rt.scissorTest = false; rt.viewport.set(0, 0, TW * FR, TH); renderer.setRenderTarget(rt); renderer.clear(true, true, true);
        for (let k = 0; k < FR; k++) {
          const a = k / FR * TAU; cam.position.set(Math.sin(a) * 25, Hh / 2, Math.cos(a) * 25); cam.lookAt(0, Hh / 2, 0); cam.updateMatrixWorld();
          rt.viewport.set(k * TW, 0, TW, TH); rt.scissor.set(k * TW, 0, TW, TH); rt.scissorTest = true; renderer.setRenderTarget(rt);
          renderer.clear(false, true, false); renderer.render(sc, cam);
        }
        rt.scissorTest = false; rt.viewport.set(0, 0, TW * FR, TH);
      }
      renderer.setRenderTarget(prevRT); renderer.setClearColor(prevCol, prevA); renderer.autoClear = prevAuto;
      albedoM.forEach(m => m.dispose()); nrmM.forEach(m => m.dispose());
      const g = new THREE.PlaneGeometry(W, Hh); g.translate(0, Hh / 2, 0);    // card with its origin at the trunk base
      return { geo: g, albedo: rtA.texture, normal: rtN.texture, W, Hh };
    }
    function impostorMat(bk, bend) {
      const m = new THREE.MeshStandardMaterial({ map: bk.albedo, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 1, metalness: 0 });
      m.onBeforeCompile = sh => {
        Object.assign(sh.uniforms, { uNrm: { value: bk.normal }, uCam: wind.uCam, uTime: wind.uTime, uWind: wind.uWind, uLod: lodTrees });
        if (window.TriundAtmos) window.TriundAtmos.optIn(sh);
        sh.vertexShader = sh.vertexShader
          .replace('#include <common>', '#include <common>\nuniform vec3 uCam; uniform float uTime; uniform float uWind; uniform vec2 uLod; varying vec2 vRot; varying float vLodF;')
          .replace('#include <begin_vertex>', `
  vec3 ip = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
  float isx = length(vec3(instanceMatrix[0][0], instanceMatrix[0][1], instanceMatrix[0][2]));
  float isy = length(vec3(instanceMatrix[1][0], instanceMatrix[1][1], instanceMatrix[1][2]));
  float rc = instanceMatrix[0][0] / isx, rs = -instanceMatrix[0][2] / isx;          // tree yaw (cos, sin)
  vec2 tc = normalize(uCam.xz - ip.xz + vec2(1e-4));                                   // tree -> camera, world
  vec2 lc = vec2(rc * tc.x - rs * tc.y, rs * tc.x + rc * tc.y);                        // same, tree-local
  float fr = mod(floor(atan(lc.x, lc.y) / ${(TAU / FR).toFixed(6)} + 0.5), ${FR}.0);
#ifdef USE_UV
  vUv.x = (vUv.x + fr) / ${FR}.0;
#endif
  vRot = vec2(rc, rs);
  float ph = ip.x * 0.071 + ip.z * 0.053, hy = position.y / ${bk.Hh.toFixed(4)};
  float sw = (sin(uTime * 1.3 + ph) * 0.6 + sin(uTime * 2.7 + ph * 1.9) * 0.25) * uWind * ${bend.toFixed(4)} * hy * hy * isy;
  vec3 transformed = ip + vec3(tc.y, 0.0, -tc.x) * (position.x * isx + sw) + vec3(0.0, position.y * isy, 0.0);
  vLodF = 1.0 - smoothstep(uLod.x, uLod.y, distance(ip.xz, uCam.xz));`)
          .replace('#include <project_vertex>', 'vec4 mvPosition = viewMatrix * vec4(transformed, 1.0);\ngl_Position = projectionMatrix * mvPosition;')
          .replace('#include <worldpos_vertex>', '#if defined( USE_ENVMAP ) || defined( DISTANCE ) || defined ( USE_SHADOWMAP )\nvec4 worldPosition = vec4(transformed, 1.0);\n#endif');
        sh.fragmentShader = sh.fragmentShader
          .replace('#include <common>', '#include <common>\nuniform sampler2D uNrm; varying vec2 vRot; varying float vLodF;\nfloat ign(vec2 p){ return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }')
          .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\nif (ign(gl_FragCoord.xy) <= vLodF) discard;')
          .replace('#include <normal_fragment_begin>', `float faceDirection = 1.0;
  vec3 ln = texture2D(uNrm, vUv).xyz * 2.0 - 1.0;
  vec3 wn = vec3(vRot.x * ln.x + vRot.y * ln.z, ln.y, -vRot.y * ln.x + vRot.x * ln.z);
  vec3 normal = normalize((viewMatrix * vec4(wn, 0.0)).xyz);
  vec3 geometryNormal = normal;`)
          .replace('#include <aomap_fragment>', '#include <aomap_fragment>\nreflectedLight.directSpecular *= 0.0;\nreflectedLight.indirectSpecular *= 0.0;\nreflectedLight.indirectDiffuse += diffuseColor.rgb * 0.45;');
      };
      m.customProgramCacheKey = () => 'imp' + bk.W.toFixed(3) + '_' + bend;
      return m;
    }
    const groups = [];
    for (const sp of Object.keys(SPECIES)) {
      const S = SPECIES[sp], list = trees[sp]; if (!list.length) continue;
      const lodU = sp === 'bush' ? lodBush : lodTrees;
      const near = new THREE.InstancedMesh(S.geo, foliageMat(S.map, S.bend, lodU), list.length);
      near.customDepthMaterial = depthMat(S.map, S.bend); near.castShadow = true; near.receiveShadow = true; near.frustumCulled = false;
      const trunk = S.trunk ? new THREE.InstancedMesh(S.trunk, barkMat, list.length) : null;
      if (trunk) { trunk.castShadow = true; trunk.receiveShadow = true; trunk.frustumCulled = false; }
      const nearM = new Float32Array(list.length * 16), nearC = new Float32Array(list.length * 3), barkC = new Float32Array(list.length * 3);
      list.forEach((t, i) => {
        dummy.position.set(t.x, t.y - 0.25, t.z); dummy.rotation.set(t.lean, t.rot, t.lean * 0.5); dummy.scale.set(t.h * t.w, t.h, t.h * t.w);
        dummy.updateMatrix(); dummy.matrix.toArray(nearM, i * 16);
        treeColor(sp, t, 1).toArray(nearC, i * 3);
        col.copy(lin(S.bark || 0x555555)).multiplyScalar((0.75 + 0.5 * t.c) * (0.55 + 0.45 * t.sun)).toArray(barkC, i * 3);
      });
      let imp = null, impM = null, impC = null;
      if (S.imp) {
        impM = new Float32Array(list.length * 16); impC = new Float32Array(list.length * 3);
        list.forEach((t, i) => {
          dummy.position.set(t.x, t.y - 0.25, t.z); dummy.rotation.set(0, t.rot, 0); dummy.scale.set(t.h * t.w, t.h, t.h * t.w);
          dummy.updateMatrix(); dummy.matrix.toArray(impM, i * 16);
          treeColor(sp, t, 1).toArray(impC, i * 3);
        });
        const bk = bakeImpostor(sp, S);
        imp = new THREE.InstancedMesh(bk.geo, impostorMat(bk, S.bend * 0.6), list.length);
        imp.frustumCulled = false;
        // bushes have no impostor: they simply end at the LOD radius
      }
      [near, trunk, imp].forEach(m => { if (m) { m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(list.length * 3), 3); scene.add(m); } });
      groups.push({ sp, list, near, trunk, imp, nearM, nearC, barkC, impM, impC, lodU, lodMul: sp === 'bush' ? 0.45 : 1 });
    }
    const lastLod = new THREE.Vector3(1e9, 0, 0);
    function rebuildLod(cam) {
      lastLod.copy(cam);
      for (const g of groups) {
        // near mesh dissolves out over [a, lod], the impostor dissolves in over the same band; both lists carry a margin
        // because the lists are only rebuilt every 12 m of movement
        const lod = Q.treeLod * g.lodMul, B = Math.max(10, lod * 0.16), a = lod - B, M = 14;
        g.lodU.value.set(a, lod);
        const nearMax2 = (lod + M) * (lod + M), impMin2 = Math.max(0, a - M) ** 2;
        let nn = 0, ni = 0;
        const NM = g.near.instanceMatrix.array, NC = g.near.instanceColor.array;
        const TM = g.trunk && g.trunk.instanceMatrix.array, TC = g.trunk && g.trunk.instanceColor.array;
        const IM = g.imp && g.imp.instanceMatrix.array, IC = g.imp && g.imp.instanceColor.array;
        for (let i = 0; i < g.list.length; i++) {
          const t = g.list[i], dx = t.x - cam.x, dz = t.z - cam.z, d2 = dx * dx + dz * dz;
          if (d2 < nearMax2) {
            NM.set(g.nearM.subarray(i * 16, i * 16 + 16), nn * 16); NC.set(g.nearC.subarray(i * 3, i * 3 + 3), nn * 3);
            if (TM) { TM.set(g.nearM.subarray(i * 16, i * 16 + 16), nn * 16); TC.set(g.barkC.subarray(i * 3, i * 3 + 3), nn * 3); }
            nn++;
          }
          if (IM && d2 > impMin2) {
            IM.set(g.impM.subarray(i * 16, i * 16 + 16), ni * 16); IC.set(g.impC.subarray(i * 3, i * 3 + 3), ni * 3); ni++;
          }
        }
        g.near.count = nn; g.near.instanceMatrix.needsUpdate = true; g.near.instanceColor.needsUpdate = true;
        if (g.trunk) { g.trunk.count = nn; g.trunk.instanceMatrix.needsUpdate = true; g.trunk.instanceColor.needsUpdate = true; }
        if (g.imp) { g.imp.count = ni; g.imp.instanceMatrix.needsUpdate = true; g.imp.instanceColor.needsUpdate = true; }
      }
    }

    /* ---------------- grass + flowers (cells around the player) ---------------- */
    function grassGeo() {
      const p = [], n = [], c = [], idx = [], gr = rng(21);
      for (let k = 0; k < 11; k++) {
        const a = gr() * 6.28, r = Math.sqrt(gr()) * 0.32, bx = Math.cos(a) * r, bz = Math.sin(a) * r;
        const fa = gr() * 6.28, fx = Math.cos(fa), fz = Math.sin(fa), w = 0.025 + gr() * 0.02, hgt = 0.35 + gr() * 0.45, bend = 0.12 + gr() * 0.22;
        const rx = -fz * w, rz = fx * w, base = p.length / 3, nn = norm([fx * 0.4, 1, fz * 0.4]);
        const pts = [[bx - rx, 0, bz - rz], [bx + rx, 0, bz + rz], [bx - rx * 0.6 + fx * bend * 0.35, hgt * 0.55, bz - rz * 0.6 + fz * bend * 0.35],
          [bx + rx * 0.6 + fx * bend * 0.35, hgt * 0.55, bz + rz * 0.6 + fz * bend * 0.35], [bx + fx * bend, hgt, bz + fz * bend]];
        const shade = [0.35, 0.35, 0.75, 0.75, 1.1];
        pts.forEach((q, i) => { p.push(...q); n.push(...nn); c.push(shade[i], shade[i], shade[i]); });
        idx.push(base, base + 1, base + 3, base, base + 3, base + 2, base + 2, base + 3, base + 4);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(n, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(c, 3)); g.setIndex(idx); return g;
    }
    function flowerGeo() {
      const b = new Builder(), up = [0, 1, 0];
      b.quad([-0.035, 0.24, 0], [0.035, 0.24, 0], [0.035, 0.29, 0], [-0.035, 0.29, 0], up, UVQ);
      b.quad([0, 0.24, -0.035], [0, 0.24, 0.035], [0, 0.29, 0.035], [0, 0.29, -0.035], up, UVQ);
      b.quad([-0.04, 0.29, -0.04], [0.04, 0.29, -0.04], [0.04, 0.29, 0.04], [-0.04, 0.29, 0.04], up, UVQ);
      return b.geo();
    }
    const CELL = 6, MAXG = 70, MAXF = 8;
    const maxCells = Math.ceil(Math.PI * Math.pow(36 / CELL + 1.5, 2)) + 8;
    const grassMat = windify(new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 1 }), 0.32, true, 0.35);
    const grass = new THREE.InstancedMesh(grassGeo(), grassMat, maxCells * MAXG);
    grass.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(maxCells * MAXG * 3), 3);
    grass.frustumCulled = false; grass.receiveShadow = true; grass.count = 0; scene.add(grass);
    const flowerMat = windify(new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: 0.8 }), 0.4, true, 0.3);
    const flowers = new THREE.InstancedMesh(flowerGeo(), flowerMat, maxCells * MAXF);
    flowers.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(maxCells * MAXF * 3), 3);
    flowers.frustumCulled = false; flowers.count = 0; scene.add(flowers);
    const FLOWER = [0xd9d6c8, 0xd9b53e, 0x7d62b3, 0xc27a96, 0xd9d6c8].map(c => lin(c).multiplyScalar(0.7));
    const cells = new Map();
    const hash2 = (i, j) => { let h = (Math.imul(i, 374761393) + Math.imul(j, 668265263)) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return (h ^ (h >>> 16)) >>> 0; };
    function makeCell(ci, cj) {
      const r = rng(hash2(ci, cj)), cx = (ci + 0.5) * CELL, cz = (cj + 0.5) * CELL;
      const cell = { gm: new Float32Array(MAXG * 16), gc: new Float32Array(MAXG * 3), gn: 0, fm: new Float32Array(MAXF * 16), fc: new Float32Array(MAXF * 3), fn: 0 };
      if (!accept(cx, cz)) return cell;
      const cy = H(cx, cz), f = forest(cx, cz), meadow = isMeadow(cx, cz, cy);
      const dens = (meadow ? 1.25 : 0.95 - 0.65 * f) * Q.grassDensity;
      const want = Math.min(MAXG, Math.round(MAXG * 0.85 * dens));
      for (let k = 0; k < want; k++) {
        const x = ci * CELL + r() * CELL, z = cj * CELL + r() * CELL, y = H(x, z), td = trailD(x, z);
        if (td < 0.75 || (td < 1.5 && r() < 0.7)) continue;
        if (slopeAt(x, z, y) > 1.1) continue;
        const s = (0.55 + r() * 0.7) * (meadow ? 0.8 : 1) * (td < 2.5 ? 0.6 : 1);
        dummy.position.set(x, y - 0.03, z); dummy.rotation.set(0, r() * 6.28, 0); dummy.scale.set(s, s * (0.8 + r() * 0.5), s); dummy.updateMatrix();
        dummy.matrix.toArray(cell.gm, cell.gn * 16);
        groundTint(x, z, col); col.multiply(meadow ? new THREE.Color(1.15, 1.05, 0.7) : new THREE.Color(0.9, 1.15, 0.75)).multiplyScalar((0.75 + r() * 0.5) * (0.6 + 0.4 * sunAt(x, z)));
        col.toArray(cell.gc, cell.gn * 3); cell.gn++;
        if (cell.fn < MAXF && (meadow ? r() < 0.09 : r() < 0.015 * (1 - f))) {
          dummy.position.set(x + 0.2, y - 0.02, z + 0.1); dummy.scale.setScalar(0.8 + r() * 0.6); dummy.updateMatrix();
          dummy.matrix.toArray(cell.fm, cell.fn * 16); FLOWER[(r() * FLOWER.length) | 0].toArray(cell.fc, cell.fn * 3); cell.fn++;
        }
      }
      return cell;
    }
    const lastGrass = new THREE.Vector3(1e9, 0, 0);
    function rebuildGrass(cam) {
      lastGrass.copy(cam);
      const R2 = Q.grassR, c0 = Math.floor((cam.x - R2) / CELL), c1 = Math.floor((cam.x + R2) / CELL);
      const d0 = Math.floor((cam.z - R2) / CELL), d1 = Math.floor((cam.z + R2) / CELL);
      let gn = 0, fn = 0;
      const GM = grass.instanceMatrix.array, GC = grass.instanceColor.array, FM = flowers.instanceMatrix.array, FC = flowers.instanceColor.array;
      for (let i = c0; i <= c1; i++) for (let j = d0; j <= d1; j++) {
        const cx = (i + 0.5) * CELL - cam.x, cz = (j + 0.5) * CELL - cam.z;
        if (cx * cx + cz * cz > (R2 + CELL) * (R2 + CELL)) continue;
        const k = i + ',' + j; let cell = cells.get(k); if (!cell) { cell = makeCell(i, j); cells.set(k, cell); }
        if (gn + cell.gn > grass.instanceMatrix.count) continue;
        GM.set(cell.gm.subarray(0, cell.gn * 16), gn * 16); GC.set(cell.gc.subarray(0, cell.gn * 3), gn * 3); gn += cell.gn;
        if (fn + cell.fn <= flowers.instanceMatrix.count) { FM.set(cell.fm.subarray(0, cell.fn * 16), fn * 16); FC.set(cell.fc.subarray(0, cell.fn * 3), fn * 3); fn += cell.fn; }
      }
      grass.count = gn; flowers.count = fn;
      grass.instanceMatrix.needsUpdate = grass.instanceColor.needsUpdate = flowers.instanceMatrix.needsUpdate = flowers.instanceColor.needsUpdate = true;
      if (cells.size > 1600) for (const [k] of cells) { const [i, j] = k.split(',').map(Number); if (Math.hypot((i + 0.5) * CELL - cam.x, (j + 0.5) * CELL - cam.z) > 3 * R2) cells.delete(k); }
    }

    /* ---------------- trail stones: loose edge stones, boulders, stone risers on steep sections ---------------- */
    function rockGeo() {
      // displacement and colour depend on the vertex position only, so the (non-indexed) faces stay closed;
      // normals follow a smoothed sphere so the stone reads as weathered, not faceted
      const g = new THREE.IcosahedronGeometry(1, 1), p = g.attributes.position, n = g.attributes.normal, c = [];
      const f = (x, y, z) => 0.8 + 0.18 * Math.sin(x * 3.1 + y * 1.7) * Math.cos(z * 2.7 - x) + 0.08 * Math.sin(x * 9.3 + z * 7.1 + y * 5.3);
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i), y = p.getY(i), z = p.getZ(i), k = f(x, y, z);
        p.setXYZ(i, x * k, Math.max(y * k, -0.3), z * k);
        const l = Math.hypot(x, y * 1.4, z) || 1; n.setXYZ(i, x / l, (y * 1.4) / l, z / l);
        const v = 0.75 + 0.3 * (0.5 + 0.5 * Math.sin(x * 5.0 + z * 3.0 + y * 7.0)); c.push(v, v * 0.97, v * 0.92);
      }
      g.setAttribute('color', new THREE.Float32BufferAttribute(c, 3)); return g;
    }
    const stones = [];
    const rockR = rng(31);
    for (const tr of trails) {
      for (let i = 0; i < tr.total / 2.2; i++) {        // loose stones on the edges, a few boulders further out
        const s = rockR() * tr.total, p = tr.pointAtS(s), d = tr.dirAtS(s, 6), side = rockR() < 0.5 ? -1 : 1;
        const big = rockR() < 0.12, off = big ? 3.5 + rockR() * 22 : 1.3 + rockR() * 2.2;
        const x = p.x - d.dz * off * side, z = p.z + d.dx * off * side;
        if (!accept(x, z) || trailD(x, z) < 1.1) continue;
        const sz = big ? 0.7 + rockR() * 1.6 : 0.12 + rockR() * rockR() * 0.55;
        stones.push({ x, z, y: H(x, z), sx: sz * (1 + rockR() * 0.5), sy: sz * (0.45 + rockR() * 0.35), sz, rot: rockR() * 6.28, tilt: (rockR() - 0.5) * 0.4 });
      }
      if (!o.noRisers) for (const run of tr.runs) {      // stone risers where the trail is steep (unless steps.js lays real steps)
        if (run.surf === 0 || run.surf === 3) continue;
        for (let s = run.s0 + 1; s < run.s1 - 1; s += 1.25 + rockR() * 0.6) {
          const a = tr.pointAtS(s - 1), b = tr.pointAtS(s + 1), grade = (b.h - a.h) / 2;
          if (Math.abs(grade) < 0.24) continue;
          const p = tr.pointAtS(s), d = tr.dirAtS(s, 4), y = H(p.x, p.z);
          stones.push({ x: p.x + (rockR() - 0.5) * 0.3, z: p.z + (rockR() - 0.5) * 0.3, y: y - 0.05, sx: 0.55 + rockR() * 0.3, sy: 0.16 + rockR() * 0.06, sz: 0.2 + rockR() * 0.08,
            rot: Math.atan2(d.dx, d.dz) + Math.PI / 2 + (rockR() - 0.5) * 0.3, tilt: 0, riser: true });
        }
      }
    }
    // ~6000 stones along 10 km of trail: only the ones near the player are drawn (boulders from further away)
    const rocks = new THREE.InstancedMesh(rockGeo(), windify(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 }), 0, false, 0.05), stones.length);
    rocks.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(stones.length * 3), 3);
    const stoneM = new Float32Array(stones.length * 16), stoneC = new Float32Array(stones.length * 3);
    stones.forEach((st, i) => {
      dummy.position.set(st.x, st.y + st.sy * 0.25, st.z); dummy.rotation.set(st.tilt, st.rot, st.tilt * 0.6); dummy.scale.set(st.sx, st.sy, st.sz); dummy.updateMatrix();
      dummy.matrix.toArray(stoneM, i * 16);
      const g = (0.085 + rockR() * 0.06) * (0.6 + 0.4 * sunAt(st.x, st.z)); col.setRGB(g * 1.02, g, g * 0.9).toArray(stoneC, i * 3);
      st.far = st.sx > 0.9;
    });
    rocks.castShadow = true; rocks.receiveShadow = true; rocks.frustumCulled = false; rocks.count = 0;
    scene.add(rocks);
    function rebuildStones(cam) {
      const r1 = Q.treeLod * 0.6, r2 = Q.treeLod * 1.6, M = rocks.instanceMatrix.array, C = rocks.instanceColor.array;
      let n = 0;
      for (let i = 0; i < stones.length; i++) {
        const st = stones[i], dx = st.x - cam.x, dz = st.z - cam.z, d2 = dx * dx + dz * dz, r = st.far ? r2 : r1;
        if (d2 > r * r) continue;
        M.set(stoneM.subarray(i * 16, i * 16 + 16), n * 16); C.set(stoneC.subarray(i * 3, i * 3 + 3), n * 3); n++;
      }
      rocks.count = n; rocks.instanceMatrix.needsUpdate = true; rocks.instanceColor.needsUpdate = true;
    }

    let gust = 0;
    return {
      counts: { deodar: trees.deodar.length, oak: trees.oak.length, rhodo: trees.rhodo.length, bush: trees.bush.length, stones: stones.length },
      update(dt, cam, time) {
        gust += dt;
        wind.uTime.value = time; wind.uCam.value.copy(cam); wind.uR.value = Q.grassR;
        wind.uWind.value = 0.7 + 0.45 * Math.sin(gust * 0.21) * Math.sin(gust * 0.077 + 1.3) + 0.25 * Math.max(0, Math.sin(gust * 0.5));
        const dx = cam.x - lastLod.x, dz = cam.z - lastLod.z;
        if (dx * dx + dz * dz > 144) { rebuildLod(cam); rebuildStones(cam); }
        const gx = cam.x - lastGrass.x, gz = cam.z - lastGrass.z;
        if (gx * gx + gz * gz > 9) rebuildGrass(cam);
      },
      setQuality(q) { Q = q; cells.clear(); lastLod.set(1e9, 0, 0); lastGrass.set(1e9, 0, 0); }
    };
  }
};
