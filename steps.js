'use strict';
/* Stone and concrete steps on the steep parts of the Triund trails.
   Where the OSM surface is ground/dirt/rock and the trail climbs more than ~16 %, the slope becomes a staircase of
   rough flat stones laid across the trail (the switchbacks above Magic View); where it is paved and steeper than
   ~11 %, regular concrete steps (the Bhagsu waterfall pathway). Gravel stays a ramp.
   A step's tread is level at the ground height of its back edge, so its riser stands out of the slope at the front.
   topAt(trailId, s) gives the tread height there, so the player and the hikers walk on the steps rather than
   through them; together with the camera's eye spring every riser reads as a step up.
   World axes: x = east, y = up, z = south. */
window.TriundSteps = {
  build({ THREE, scene, H, trails, rng, tex, sunAt }) {
    const R = rng(9137);
    const gAt = (tr, s) => { const p = tr.pointAtS(s); return H(p.x, p.z); };
    const runsOut = {};          // trail id -> sorted [{s0, s1, top}]
    const slabs = [];            // instances: {x, y, z, rot, w, d, t, kind}
    for (const tr of trails) {
      const list = [];
      for (const run of tr.runs) {
        const paved = run.surf === 3, stone = run.surf === 1 || run.surf === 2;
        if (!paved && !stone) continue;
        const minGrade = paved ? 0.11 : 0.16;
        let s = run.s0 + 0.5;
        while (s < run.s1 - 0.5) {
          // heights from the terrain the player walks on (H), not the trail's own profile: near the temples the
          // ground is levelled and elsewhere the two differ by metres, which left treads floating in the air
          const a = gAt(tr, s - 2), b = gAt(tr, s + 2), grade = (b - a) / 4;
          if (Math.abs(grade) < minGrade) { s += 0.5; continue; }
          // one step: rise 0.15-0.21 m (concrete: a steady 0.17), the tread runs until the ground has climbed that much
          const rise = paved ? 0.17 : 0.15 + R() * 0.06, h0 = gAt(tr, s);
          let e = s + 0.25;
          while (e < run.s1 - 0.25 && Math.abs(gAt(tr, e) - h0) < rise && e - s < 1.6) e += 0.05;
          const he = gAt(tr, e), up = he > h0;            // trail climbing along +s
          const top = up ? he : h0;                        // level tread at the higher end
          list.push({ s0: s, s1: e, top });
          // the slab(s): across the trail, centred on the tread
          const sm = (s + e) / 2, p = tr.pointAtS(sm), d = tr.dirAtS(sm, 3), rot = Math.atan2(d.dx, d.dz);
          const depth = e - s + 0.12, width = paved ? 2.1 : 1.85 + R() * 0.3;   // a full trail width: feet never stand half off a tread
          if (paved) slabs.push({ x: p.x, z: p.z, top, rot, w: width, d: depth, t: 0.5, kind: 1 });
          else {
            // as on the real trail: two to four rough slabs of different sizes laid across, none square to the path,
            // tilted, some sitting proud, some sunk; now and then one has gone; loose rubble in the gaps and along the
            // edges. Dark grey-blue slate lower down, paler weathered granite toward the top.
            const q = R(), n = q < 0.15 ? 1 : q < 0.5 ? 2 : q < 0.85 ? 3 : 4; let off = -width / 2 + (R() - 0.5) * 0.35;
            const pale = Math.max(0, Math.min(1, (top - 2450) / 300));
            for (let k = 0; k < n; k++) {
              const w = width / n * (0.65 + R() * 0.7), cx = off + w / 2; off += w * (0.85 + R() * 0.25);
              if (n > 1 && R() < 0.14) continue;
              const fw = (R() - 0.5) * 0.25, lx = Math.cos(rot) * cx + Math.sin(rot) * fw, lz = -Math.sin(rot) * cx + Math.cos(rot) * fw;
              slabs.push({ x: p.x + lx, z: p.z + lz, top: top + (R() - 0.6) * 0.08, rot: rot + (R() - 0.5) * 0.55, w: w * (0.8 + R() * 0.2), d: depth * (0.85 + R() * 0.45), t: 0.32 + R() * 0.25, kind: 0, tilt: (R() - 0.5) * 0.22, pale });
            }
            for (let k = 0, m = 2 + (R() * 4 | 0); k < m; k++) {   // rubble
              const cx = (R() - 0.5) * (width + 0.6), fw = (R() - 0.5) * depth * 1.3, sz = 0.07 + R() * 0.16;
              slabs.push({ x: p.x + Math.cos(rot) * cx + Math.sin(rot) * fw, z: p.z - Math.sin(rot) * cx + Math.cos(rot) * fw, top: top - 0.06 + sz * 0.35 + (R() - 0.5) * 0.05, rot: R() * 6.28, w: sz * (1 + R() * 0.6), d: sz, t: sz * 0.7, kind: 2, tilt: (R() - 0.5) * 0.8, pale });
            }
          }
          s = e;
        }
      }
      runsOut[tr.id] = list;
    }

    /* ---------- meshes: rough stone slabs and concrete blocks, instanced ---------- */
    function slabGeo(rough) {
      const g = new THREE.BoxGeometry(1, 1, 1, rough ? 6 : 1, rough ? 2 : 1, rough ? 6 : 1), p = g.attributes.position;
      // a value only of the position, so shared corners move together and the stone stays closed
      const nz = (x, y, z) => Math.sin(x * 9.1 + z * 4.3) * Math.cos(z * 7.7 - y * 5.1) + 0.5 * Math.sin(x * 23.0 - z * 19.0 + y * 13.0);
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
        if (!rough) continue;
        // rounded worn edges, a lumpy top and bulging, chipped sides
        const ex = Math.abs(x) * 2, ez = Math.abs(z) * 2, edge = Math.max(ex, ez);
        const top = y > 0 ? 1 : 0;
        const dy = top * (-0.1 * Math.pow(edge, 3) + 0.035 * nz(x, y, z));
        const bulge = 1 + 0.07 * nz(z, x, y) - 0.08 * top * edge;
        p.setXYZ(i, x * bulge, y + dy, z * (1 + 0.06 * nz(y, z, x) - 0.08 * top * edge));
      }
      g.translate(0, -0.5, 0);            // origin at the top face
      g.computeVertexNormals();
      return g;
    }
    function stepMat(map, nmap, color, rough) {
      const m = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0 });
      m.onBeforeCompile = sh => {
        sh.uniforms.tRock = { value: map }; sh.uniforms.nRock = { value: nmap };
        sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vSp; varying vec3 vSn;')
          .replace('#include <begin_vertex>', `#include <begin_vertex>
  #ifdef USE_INSTANCING
    vSp = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz; vSn = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * objectNormal);
  #else
    vSp = (modelMatrix * vec4(transformed, 1.0)).xyz; vSn = normalize(mat3(modelMatrix) * objectNormal);
  #endif`);
        sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform sampler2D tRock; varying vec3 vSp; varying vec3 vSn;')
          .replace('#include <map_fragment>', `
  vec3 an = abs(vSn); an /= (an.x + an.y + an.z);
  vec3 rc = texture2D(tRock, vSp.zy * 0.7).rgb * an.x + texture2D(tRock, vSp.xz * 0.7).rgb * an.y + texture2D(tRock, vSp.xy * 0.7).rgb * an.z;
  rc = pow(rc, vec3(2.2));
  float l = dot(rc, vec3(0.2126, 0.7152, 0.0722));
  vec3 rd = pow(texture2D(tRock, (vSp.xz + vSp.y) * 2.3).rgb, vec3(2.2));   // finer grain on top
  float ld = dot(rd, vec3(0.2126, 0.7152, 0.0722));
  float k = clamp(0.35 + (l - 0.12) * 3.5 + (ld - 0.12) * 1.5, 0.15, 1.6);   // the photo's light and dark, stretched
  diffuseColor.rgb *= vec3(0.3, 0.285, 0.26) * k;               // grey Dhauladhar stone (the photo is a warm sandstone)
  // trodden tops are smoother and a shade lighter; the gaps and the foot of each riser collect dark soil
  diffuseColor.rgb *= mix(0.62, 1.0, smoothstep(0.2, 0.9, an.y)) * (1.0 + 0.12 * smoothstep(0.85, 1.0, an.y));`);
      };
      m.customProgramCacheKey = () => 'triund-steps';
      return m;
    }
    const stoneMat = tex ? stepMat(tex.rock, tex.rockN, new THREE.Color(1, 1, 1), 0.9) : new THREE.MeshLambertMaterial({ color: 0x55524c });
    const concMat = tex ? stepMat(tex.rock, tex.rockN, new THREE.Color(2.0, 1.98, 1.9), 0.8) : new THREE.MeshLambertMaterial({ color: 0x8a867e });
    const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), S = new THREE.Vector3(), T = new THREE.Vector3(), E = new THREE.Euler();
    const meshes = [];
    for (const [kind, geo, mat] of [[0, slabGeo(true), stoneMat], [1, slabGeo(false), concMat], [2, slabGeo(true), stoneMat]]) {
      const list = slabs.filter(b => b.kind === kind); if (!list.length) continue;
      const im = new THREE.InstancedMesh(geo, mat, list.length), C = new THREE.Color();
      list.forEach((b, i) => {
        M.compose(T.set(b.x, b.top, b.z), Q.setFromEuler(E.set(b.tilt || 0, b.rot, (b.tilt || 0) * 0.7, 'YXZ')), S.set(b.w, b.t, b.d));
        im.setMatrixAt(i, M);
        const v = (kind === 1 ? 0.8 + R() * 0.2 : 0.5 + R() * 0.6) * (sunAt ? 0.7 + 0.3 * sunAt(b.x, b.z) : 1), g = kind === 1 ? 1 : 0.96 + R() * 0.08;
        if (kind === 1) im.setColorAt(i, C.setRGB(v, v * g, v * g * 0.95));
        else { const pl = (b.pale || 0) * 0.55; im.setColorAt(i, C.setRGB(v * (0.86 + 0.45 * pl), v * g * (0.92 + 0.36 * pl), v * g * (1.04 + 0.12 * pl))); }   // slate: a touch blue; granite: pale buff
      });
      im.castShadow = true; im.receiveShadow = true; im.frustumCulled = false;
      // 16 000 stones over 10 km of trail: keep every matrix, draw only the ones within VIEW m (rebuilt as you walk)
      const allM = im.instanceMatrix.array.slice(), allC = im.instanceColor.array.slice(), pos = new Float32Array(list.length * 2);
      list.forEach((b, i) => { pos[i * 2] = b.x; pos[i * 2 + 1] = b.z; });
      scene.add(im); meshes.push({ im, allM, allC, pos });
    }
    const VIEW = 140, last = new THREE.Vector3(1e9, 0, 0);
    function refresh(cam) {
      last.copy(cam);
      for (const m of meshes) {
        const M = m.im.instanceMatrix.array, Cc = m.im.instanceColor.array; let n = 0;
        for (let i = 0; i < m.pos.length / 2; i++) {
          const dx = m.pos[i * 2] - cam.x, dz = m.pos[i * 2 + 1] - cam.z; if (dx * dx + dz * dz > VIEW * VIEW) continue;
          M.set(m.allM.subarray(i * 16, i * 16 + 16), n * 16); Cc.set(m.allC.subarray(i * 3, i * 3 + 3), n * 3); n++;
        }
        m.im.count = n; m.im.instanceMatrix.needsUpdate = true; m.im.instanceColor.needsUpdate = true;
      }
    }

    function topAt(id, s) {
      const L = runsOut[id]; if (!L || !L.length) return null;
      let lo = 0, hi = L.length - 1;
      while (lo < hi) { const m = (lo + hi + 1) >> 1; if (L[m].s0 <= s) lo = m; else hi = m - 1; }
      const st = L[lo]; return s >= st.s0 && s <= st.s1 ? st.top : null;
    }
    return {
      counts: { steps: Object.values(runsOut).reduce((a, l) => a + l.length, 0), slabs: slabs.length },
      topAt,
      update(cam) { const dx = cam.x - last.x, dz = cam.z - last.z; if (dx * dx + dz * dz > 64) refresh(cam); },
      // ground under a walker: the tread when on a staircase (within the trail width), else the terrain
      ground(x, z, id, s, lat) { const h = H(x, z); if (Math.abs(lat || 0) > 1.05) return h; const t = topAt(id, s); return t === null ? h : Math.max(h, t); },
      halfWidth: 1.05
    };
  }
};
