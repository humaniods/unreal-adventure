'use strict';
/* Real places along the Triund trails, from TD.places (build.py):
   buildings (OSM outlines + Microsoft Global ML Building Footprints), temples, tea stalls and shops, camps,
   shelters, benches, toilets, taps, viewpoints, the waterfalls, the streams and the Bhagsu Nag pool.
   World axes: x = east, z = south (z = -north), y = altitude.
   Everything static is merged into a handful of meshes; only the name boards are separate (and hidden when far). */
window.TriundPlaces = {
  build(o) {
    const { THREE, scene, H, data, trails, textPlane, lin, rng, skip, prayerFlags } = o;
    const R = rng(4242);
    const counts = {};
    const bump = k => { counts[k] = (counts[k] || 0) + 1; };

    /* ---------- trail lookup (direction to the trail, distance) ---------- */
    const TS = [];
    for (const tr of trails) for (let s = 0; s <= tr.total; s += 4) { const p = tr.pointAtS(s); TS.push({ x: p.x, z: p.z, s, tr }); }
    function nearestTrail(x, z) {
      let b = TS[0], bd = Infinity;
      for (const t of TS) { const d = (t.x - x) * (t.x - x) + (t.z - z) * (t.z - z); if (d < bd) { bd = d; b = t; } }
      return { x: b.x, z: b.z, s: b.s, tr: b.tr, d: Math.sqrt(bd) };
    }
    const skipped = (x, z) => skip.some(k => Math.hypot(k.x - x, k.z - z) < k.r);

    /* ---------- occupancy grid: keeps trees out of buildings and stalls ---------- */
    const OCC = new Set(), OC = 2;
    const okey = (i, j) => i * 100003 + j;
    function occupyPoly(pts, margin) {
      let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
      for (const p of pts) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); z0 = Math.min(z0, p[1]); z1 = Math.max(z1, p[1]); }
      for (let i = Math.floor((x0 - margin) / OC); i <= Math.floor((x1 + margin) / OC); i++)
        for (let j = Math.floor((z0 - margin) / OC); j <= Math.floor((z1 + margin) / OC); j++) {
          const cx = (i + 0.5) * OC, cz = (j + 0.5) * OC;
          if (inPoly(pts, cx, cz) || edgeDist(pts, cx, cz) < margin) OCC.add(okey(i, j));
        }
    }
    function occupyDisc(x, z, r) {
      for (let i = Math.floor((x - r) / OC); i <= Math.floor((x + r) / OC); i++)
        for (let j = Math.floor((z - r) / OC); j <= Math.floor((z + r) / OC); j++)
          if (Math.hypot((i + 0.5) * OC - x, (j + 0.5) * OC - z) < r) OCC.add(okey(i, j));
    }
    function inPoly(P, x, z) {
      let c = false;
      for (let i = 0, j = P.length - 1; i < P.length; j = i++)
        if ((P[i][1] > z) !== (P[j][1] > z) && x < (P[j][0] - P[i][0]) * (z - P[i][1]) / (P[j][1] - P[i][1] + 1e-12) + P[i][0]) c = !c;
      return c;
    }
    function edgeDist(P, x, z) {
      let m = Infinity;
      for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
        const ax = P[j][0], az = P[j][1], dx = P[i][0] - ax, dz = P[i][1] - az, l2 = dx * dx + dz * dz || 1e-9;
        const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2));
        m = Math.min(m, Math.hypot(ax + dx * t - x, az + dz * t - z));
      }
      return m;
    }

    /* ---------- canvas textures ---------- */
    function canvasTex(w, h, draw, rep) {
      const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
      const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; t.anisotropy = 4;
      if (rep) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
      return t;
    }
    // one wall module = 3 m wide x 2.9 m tall (one floor): plaster with a window. Vertex colour tints the plaster.
    let wallTex = null;
    function drawWall() { if (wallTex) drawWallTo(wallTex.image.getContext('2d'), wallTex.image.width, wallTex.image.height); }
    function drawWallTo(g, w, h) {
      g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h);
      if (plasterImg.img) {
        // plaster photo, lifted toward white so the vertex colour reads as the paint colour
        g.drawImage(plasterImg.img, 0, 0, w, h); g.globalCompositeOperation = 'screen'; g.fillStyle = 'rgba(150,150,150,1)'; g.fillRect(0, 0, w, h); g.globalCompositeOperation = 'source-over';
      } else for (let i = 0; i < 1400; i++) { g.fillStyle = `rgba(0,0,0,${Math.random() * 0.05})`; g.fillRect(Math.random() * w, Math.random() * h, 2 + Math.random() * 5, 2 + Math.random() * 5); }
      const k = w / 256; g.save(); g.scale(k, k); w = 256; h = 256;
      g.fillStyle = 'rgba(70,60,50,0.18)'; g.fillRect(0, h - 10, w, 10);                    // floor band / slab edge
      const wx = w * 0.3, ww = w * 0.4, wy = h * 0.22, wh = h * 0.45;
      g.fillStyle = '#5a4030'; g.fillRect(wx - 7, wy - 7, ww + 14, wh + 14);                 // wooden frame
      g.fillStyle = '#1c2328'; g.fillRect(wx, wy, ww, wh);                                    // glass
      g.fillStyle = 'rgba(160,190,210,0.25)'; g.fillRect(wx, wy, ww, wh * 0.35);
      g.fillStyle = '#5a4030'; g.fillRect(wx + ww / 2 - 3, wy, 6, wh); g.fillRect(wx, wy + wh / 2 - 3, ww, 6);
      g.fillStyle = 'rgba(40,30,20,0.35)'; g.fillRect(wx - 10, wy + wh + 7, ww + 20, 8);   // sill shadow
      const grd = g.createLinearGradient(0, h * 0.75, 0, h); grd.addColorStop(0, 'rgba(60,50,40,0)'); grd.addColorStop(1, 'rgba(60,50,40,0.12)');
      g.fillStyle = grd; g.fillRect(0, h * 0.75, w, h * 0.25);                                // rain stains near the slab
      // streaks running down from the sill corners
      for (const sx of [wx - 6, wx + ww + 2]) { const sg = g.createLinearGradient(0, wy + wh + 12, 0, h * 0.95); sg.addColorStop(0, 'rgba(50,42,34,0.22)'); sg.addColorStop(1, 'rgba(50,42,34,0)'); g.fillStyle = sg; g.fillRect(sx, wy + wh + 12, 5, h * 0.95 - wy - wh - 12); }
      g.restore();
    }
    wallTex = canvasTex(512, 512, drawWallTo, true);

    /* ---------- photo surfaces (Poly Haven, CC0; see tex/SOURCES.txt) ----------
       Walls: the plaster photo under the painted window module (the canvas is redrawn once the photo arrives).
       Roofs: corrugated iron with its normal map, greyed so the vertex colour paints it.
       Props (stalls, benches, crates...): world-space triplanar wood grain as surface detail under the vertex
       colour, so no UVs are needed. Every surface darkens toward the ground it stands on (contact occlusion,
       from the per-vertex height above ground) and is a little desaturated and grimy, like things up a mountain. */
    const texLoader = new THREE.TextureLoader(), blankN = new THREE.DataTexture(new Uint8Array([128, 128, 255, 255]), 1, 1, THREE.RGBAFormat); blankN.needsUpdate = true;
    function photo(name, srgb, onImg) {
      const t = texLoader.load('tex/' + name + '.jpg', tt => { if (onImg) onImg(tt.image); });
      t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; if (srgb) t.encoding = THREE.sRGBEncoding; return t;
    }
    // greyed, brightened copy of a photo (so a vertex colour tints it like paint)
    function greyed(name, gain, rep) {
      const ct = canvasTex(512, 512, (g, w, h) => { g.fillStyle = '#c8c8c8'; g.fillRect(0, 0, w, h); }, rep);
      texLoader.load('tex/' + name + '.jpg', t => {
        const c = ct.image, g = c.getContext('2d'); g.drawImage(t.image, 0, 0, c.width, c.height);
        const d = g.getImageData(0, 0, c.width, c.height), a = d.data;
        let m = 0; for (let i = 0; i < a.length; i += 4) m += a[i] * 0.3 + a[i + 1] * 0.59 + a[i + 2] * 0.11; m /= a.length / 4;
        const k = 255 * gain / Math.max(m, 1);
        for (let i = 0; i < a.length; i += 4) { const l = (a[i] * 0.3 + a[i + 1] * 0.59 + a[i + 2] * 0.11) * k; a[i] = Math.min(255, l * 0.97 + a[i] * 0.03 * k); a[i + 1] = Math.min(255, l); a[i + 2] = Math.min(255, l * 0.98); }
        g.putImageData(d, 0, 0); ct.needsUpdate = true;
      });
      return ct;
    }
    const plasterImg = { img: null };
    const tinMap = greyed('tin_d', 0.82, true), tinN = photo('tin_n', false);
    const woodDetail = photo('wood_d', true), woodN = photo('wood_n', false), plasterN = photo('plaster_n', false);
    photo('plaster_d', false, img => { plasterImg.img = img; drawWall(); wallTex.needsUpdate = true; });
    // kind: 'wall' | 'roof' | 'prop'
    function surfaceMat(kind, opts) {
      const m = new THREE.MeshStandardMaterial(Object.assign({ vertexColors: true, roughness: 0.92, metalness: 0 }, opts));
      m.onBeforeCompile = sh => {
        sh.uniforms.tWood = { value: woodDetail };
        sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float gh; varying float vGh; varying vec3 vWp; varying vec3 vWn;')
          .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGh = gh; vWp = (modelMatrix * vec4(transformed, 1.0)).xyz; vWn = normalize(mat3(modelMatrix) * objectNormal);');
        sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform sampler2D tWood; varying float vGh; varying vec3 vWp; varying vec3 vWn;')
          .replace('#include <color_fragment>', `#include <color_fragment>
  {
    vec3 c = diffuseColor.rgb;
    float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
    c = mix(vec3(l), c, 0.86);                                       // sun and dust fade paint
    ${kind === 'prop' ? `
    vec3 an = abs(normalize(vWn)); an /= (an.x + an.y + an.z);
    vec3 tw = texture2D(tWood, vWp.zy * 0.45).rgb * an.x + texture2D(tWood, vWp.xz * 0.45).rgb * an.y + texture2D(tWood, vWp.xy * 0.45).rgb * an.z;
    float g = dot(tw, vec3(0.333));
    c *= mix(1.0, 0.55 + g * 1.5, 0.55);                             // grain and wear under the paint` : ''}
    float grime = texture2D(tWood, vWp.xz * 0.031 + vWp.y * 0.07).g;
    c *= 0.84 + 0.3 * grime;
    ${kind === 'prop' || kind.indexOf('wood') >= 0 ? '' : `
    // rain streaks on walls: the wood photo stretched vertically gives irregular dark runs
    float vert = 1.0 - abs(normalize(vWn).y);
    float streak = texture2D(tWood, vec2((vWp.x + vWp.z) * 0.9, vWp.y * 0.035)).r;
    c *= 1.0 - 0.22 * vert * smoothstep(0.42, 0.75, streak);`}
    c *= mix(0.5, 1.0, smoothstep(0.0, 1.1, vGh));                   // contact occlusion and splash dirt at the foot
    diffuseColor.rgb = c;
  }`);
      };
      m.customProgramCacheKey = () => 'triund-surface-' + kind;
      return m;
    }

    /* ---------- geometry batches (merged by material) ---------- */
    function Batch() { this.p = []; this.n = []; this.c = []; this.uv = []; }
    Batch.prototype.tri = function (a, b, c, col, ua, ub, uc) {
      const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
      let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
      for (const [v, u] of [[a, ua], [b, ub], [c, uc]]) { this.p.push(v[0], v[1], v[2]); this.n.push(nx, ny, nz); this.c.push(col.r, col.g, col.b); this.uv.push(u ? u[0] : 0.02, u ? u[1] : 0.02); }
    };
    Batch.prototype.quad = function (a, b, c, d, col, uvs) { this.tri(a, b, c, col, uvs && uvs[0], uvs && uvs[1], uvs && uvs[2]); this.tri(a, c, d, col, uvs && uvs[0], uvs && uvs[2], uvs && uvs[3]); };
    // add a three.js geometry with a matrix and one colour
    const _v = new THREE.Vector3(), _n = new THREE.Vector3(), _m3 = new THREE.Matrix3();
    Batch.prototype.geo = function (g, m, col) {
      const ng = g.index ? g.toNonIndexed() : g; const P = ng.attributes.position, N = ng.attributes.normal; _m3.getNormalMatrix(m);
      for (let i = 0; i < P.count; i++) {
        _v.fromBufferAttribute(P, i).applyMatrix4(m); _n.fromBufferAttribute(N, i).applyMatrix3(_m3).normalize();
        this.p.push(_v.x, _v.y, _v.z); this.n.push(_n.x, _n.y, _n.z); this.c.push(col.r, col.g, col.b); this.uv.push(0.02, 0.02);
      }
    };
    Batch.prototype.mesh = function (mat) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
      const gh = new Float32Array(this.p.length / 3);
      for (let i = 0; i < gh.length; i++) gh[i] = this.p[i * 3 + 1] - H(this.p[i * 3], this.p[i * 3 + 2]);
      g.setAttribute('gh', new THREE.BufferAttribute(gh, 1));
      g.computeBoundingSphere();
      const m = new THREE.Mesh(g, mat); m.castShadow = true; m.receiveShadow = true; scene.add(m); return m;
    };
    const walls = new Batch(), roofs = new Batch(), props = new Batch();
    const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), S = new THREE.Vector3(), T = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0);
    const mtx = (x, y, z, ry, sx, sy, sz) => M.compose(T.set(x, y, z), Q.setFromAxisAngle(UP, ry || 0), S.set(sx || 1, sy || 1, sz || 1));
    const BOX = new THREE.BoxGeometry(1, 1, 1);
    const CYL = new THREE.CylinderGeometry(0.5, 0.5, 1, 8);
    const CONE4 = new THREE.ConeGeometry(0.7071, 1, 4); CONE4.rotateY(Math.PI / 4);
    const DOME = new THREE.SphereGeometry(1, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2);
    const ROCK = new THREE.DodecahedronGeometry(1, 0);
    // local box inside a rotated frame (origin x,y,z, yaw ry): centre (lx, ly, lz), size (w, h, d)
    const lbox = (B, x, y, z, ry, lx, ly, lz, w, h, d, col) => {
      const c = Math.cos(ry), s = Math.sin(ry);
      B.geo(BOX, mtx(x + lx * c + lz * s, y + ly, z - lx * s + lz * c, ry, w, h, d), col);
    };
    const C = hex => lin(hex);

    /* ---------- buildings ---------- */
    const WALL = [0xeeeae2, 0xeeeae2, 0xe8dcc0, 0xe9d48f, 0xe4b9b0, 0xbcd3df, 0xc5dcc0, 0xb7b3aa, 0xc98a6a, 0xd9d4c7];
    const TIN = [0x3f8a86, 0x3f8a86, 0x3c5f95, 0x9a3b2c, 0x4d7a45, 0x56595e, 0x7a4a33, 0x2f6f8f];
    const FLAT = [0xa09d96, 0x8f8b84, 0xb1ada5];
    const tanks = [];
    function hull(P) {
      const pts = P.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
      const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
      const lo = [], up = [];
      for (const p of pts) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
      for (let i = pts.length - 1; i >= 0; i--) { const p = pts[i]; while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop(); up.push(p); }
      return lo.slice(0, -1).concat(up.slice(0, -1));
    }
    function obb(P) {
      const h = hull(P); let best = null;
      for (let i = 0; i < h.length; i++) {
        const a = h[i], b = h[(i + 1) % h.length]; let ux = b[0] - a[0], uz = b[1] - a[1]; const l = Math.hypot(ux, uz); if (l < 1e-6) continue; ux /= l; uz /= l;
        const vx = -uz, vz = ux; let u0 = 1e9, u1 = -1e9, v0 = 1e9, v1 = -1e9;
        for (const p of h) { const u = p[0] * ux + p[1] * uz, v = p[0] * vx + p[1] * vz; u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v); }
        const ar = (u1 - u0) * (v1 - v0); if (!best || ar < best.ar) best = { ar, ux, uz, vx, vz, u0, u1, v0, v1 };
      }
      let { ux, uz, vx, vz, u0, u1, v0, v1 } = best;
      const cu = (u0 + u1) / 2, cv = (v0 + v1) / 2;
      let a = (u1 - u0) / 2, b = (v1 - v0) / 2;
      if (b > a) { [ux, uz, vx, vz] = [vx, vz, -ux, -uz]; [a, b] = [b, a]; }
      return { cx: cu * best.ux + cv * best.vx, cz: cu * best.uz + cv * best.vz, ux, uz, vx, vz, a, b, ar: best.ar };
    }
    const polyArea = P => { let s = 0; for (let i = 0, j = P.length - 1; i < P.length; j = i++) s += (P[j][0] + P[i][0]) * (P[j][1] - P[i][1]); return Math.abs(s) / 2; };

    function building(P, lv, kind, name, seed) {
      const r = rng(seed);
      let gMin = Infinity, gMax = -Infinity;
      for (const p of P) { const h = H(p[0], p[1]); gMin = Math.min(gMin, h); gMax = Math.max(gMax, h); }
      const base = gMin - 0.6, yG = gMax + 0.15, yt = yG + lv * 2.9;
      const holy = kind === 'temple' || kind === 'monastery' || kind === 'church';
      const wc = C(holy ? (kind === 'monastery' ? 0xefe9dc : 0xf1ece2) : WALL[(r() * WALL.length) | 0]).multiplyScalar(0.85 + r() * 0.2);
      const fc = C(0x7d7a73).multiplyScalar(0.85 + r() * 0.25);
      // walls: foundation (stone) up to the highest ground point, then floors with windows
      let cx = 0, cz = 0; for (const p of P) { cx += p[0]; cz += p[1]; } cx /= P.length; cz /= P.length;
      let run = 0;
      for (let i = 0; i < P.length; i++) {
        const a = P[i], b = P[(i + 1) % P.length], len = Math.hypot(b[0] - a[0], b[1] - a[1]); if (len < 0.05) continue;
        const u0 = run / 3, u1 = (run + len) / 3; run += len;
        const A0 = [a[0], base, a[1]], B0 = [b[0], base, b[1]], A1 = [a[0], yG, a[1]], B1 = [b[0], yG, b[1]], A2 = [a[0], yt, a[1]], B2 = [b[0], yt, b[1]];
        walls.quad(A0, B0, B1, A1, fc, null);
        const vt = lv;   // one texture row per floor
        walls.quad(A1, B1, B2, A2, wc, [[u0, 0], [u1, 0], [u1, vt], [u0, vt]]);
      }
      const area = polyArea(P), box = obb(P), rect = area / Math.max(box.ar, 1e-6);
      const pitched = holy ? kind !== 'temple' : (rect > 0.8 && area < 260 && r() < 0.72) || kind === 'hut' || kind === 'shed';
      if (pitched) {
        const e = 0.5, a = box.a + e, b = box.b + e, hr = Math.min(3.2, Math.max(0.9, box.b * (kind === 'church' ? 1.1 : 0.5)));
        const rc = C(kind === 'monastery' ? 0xc9a23a : TIN[(r() * TIN.length) | 0]).multiplyScalar(0.8 + r() * 0.3);
        const W = (u, v, y) => [box.cx + box.ux * u + box.vx * v, y, box.cz + box.uz * u + box.vz * v];
        const y0 = yt - 0.15, y1 = yt + hr;
        const su = a * 2 / 1.2, sv = Math.hypot(b, hr) / 1.2;
        roofs.quad(W(-a, -b, y0), W(a, -b, y0), W(a, 0, y1), W(-a, 0, y1), rc, [[0, 0], [su, 0], [su, sv], [0, sv]]);
        roofs.quad(W(a, b, y0), W(-a, b, y0), W(-a, 0, y1), W(a, 0, y1), rc, [[0, 0], [su, 0], [su, sv], [0, sv]]);
        const ga = box.a, gb = box.b;   // gable ends (plaster)
        walls.tri(W(ga, -gb, yt), W(ga, gb, yt), W(ga, 0, y1 - 0.1), wc, null, null, null);
        walls.tri(W(-ga, gb, yt), W(-ga, -gb, yt), W(-ga, 0, y1 - 0.1), wc, null, null, null);
      } else {
        const rc = C(FLAT[(r() * FLAT.length) | 0]);
        const contour = P.map(p => new THREE.Vector2(p[0], p[1]));
        const tris = THREE.ShapeUtils.triangulateShape(contour, []);
        for (const t of tris) { const [i, j, k] = t; roofs.tri([P[i][0], yt, P[i][1]], [P[j][0], yt, P[j][1]], [P[k][0], yt, P[k][1]], rc, null, null, null); }
        // parapet
        for (let i = 0; i < P.length; i++) {
          const a = P[i], b = P[(i + 1) % P.length];
          walls.quad([a[0], yt, a[1]], [b[0], yt, b[1]], [b[0], yt + 0.6, b[1]], [a[0], yt + 0.6, a[1]], wc, null);
        }
        // black plastic water tanks on most flat roofs (a Himachal roofline)
        if (!holy && r() < 0.65) tanks.push([box.cx + box.ux * box.a * 0.4, yt, box.cz + box.uz * box.a * 0.4, 0.55 + r() * 0.25]);
      }
      if (kind === 'temple') shikhara(cx, yt, cz, Math.min(box.b, 3.2), Math.atan2(box.ux, box.uz));
      if (kind === 'monastery' && prayerFlags) { const fx = cx + box.vx * (box.b + 3), fz = cz + box.vz * (box.b + 3); flagsLater.push([fx - box.ux * 6, fz - box.uz * 6, fx + box.ux * 6, fz + box.uz * 6]); }
      occupyPoly(P, 2.5);
      bump('building');
    }
    const flagsLater = [];
    function shikhara(x, y, z, r, ry) {
      const col = C(0xd9773a), white = C(0xf1ece2);
      props.geo(BOX, mtx(x, y + 0.3, z, ry, r * 1.6, 0.6, r * 1.6), white);
      props.geo(CONE4, mtx(x, y + 0.6 + r * 1.1, z, ry, r * 1.5, r * 2.2, r * 1.5), col);
      props.geo(CYL, mtx(x, y + 0.6 + r * 2.2 + 0.25, z, 0, 0.35, 0.5, 0.35), C(0xc9a23a));
      props.geo(CYL, mtx(x + r * 0.5, y + 0.6 + r * 1.2 + 1.5, z, 0, 0.06, 3, 0.06), C(0x5a4632));
      props.tri([x + r * 0.5, y + r * 1.8 + 2.9, z], [x + r * 0.5 + 1.2, y + r * 1.8 + 2.6, z], [x + r * 0.5, y + r * 1.8 + 2.2, z], C(0xf08a24), null, null, null);
    }

    for (let i = 0; i < data.buildings.length; i++) {
      const b = data.buildings[i], P = [];
      for (let k = 0; k < b.p.length; k += 2) P.push([b.p[k], -b.p[k + 1]]);
      if (P.length < 3) continue;
      let cx = 0, cz = 0; for (const p of P) { cx += p[0]; cz += p[1]; } cx /= P.length; cz /= P.length;
      if (skipped(cx, cz)) continue;
      building(P, b.lv, b.k, b.nm, 1000 + i);
    }

    /* ---------- name boards (separate meshes, hidden when far) ---------- */
    const boards = [];
    function nameBoard(x, y, z, ry, title, sub, bg, fg, w) {
      const lines = [{ t: title.length > 22 ? title.slice(0, 21) + '…' : title, size: title.length > 14 ? 40 : 52, w: 700 }];
      if (sub) lines.push({ t: sub, size: 30, w: 500 });
      const m = textPlane(lines, w || 2.6, sub ? 1.2 : 0.8, bg || '#f2c230', fg || '#2a1a04');
      m.position.set(x, y, z); m.rotation.y = ry; m.castShadow = false; m.visible = false; scene.add(m); boards.push(m); return m;
    }

    /* ---------- water materials (used by waterfalls below) ---------- */
    const flowTex = canvasTex(64, 256, (g, w, h) => {
      g.fillStyle = '#9fb7c0'; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 260; i++) { const x = Math.random() * w, y = Math.random() * h, l = 10 + Math.random() * 50;
        g.fillStyle = `rgba(255,255,255,${0.25 + Math.random() * 0.6})`; g.fillRect(x, y, 1 + Math.random() * 2.5, l); }
    }, true);
    // falling water: translucent sheet, white streaks, soft ragged sides
    const fallTex = canvasTex(128, 256, (g, w, h) => {
      g.fillStyle = 'rgba(205,222,228,0.5)'; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 420; i++) { const x = Math.random() * w, y = Math.random() * h, l = 14 + Math.random() * 70;
        g.fillStyle = `rgba(255,255,255,${0.3 + Math.random() * 0.6})`; g.fillRect(x, y, 1 + Math.random() * 3, l); if (y + l > h) g.fillRect(x, y - h, 1 + Math.random() * 3, l); }
      g.globalCompositeOperation = 'destination-in';
      const gr = g.createLinearGradient(0, 0, w, 0); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(0.18, 'rgba(0,0,0,1)'); gr.addColorStop(0.82, 'rgba(0,0,0,1)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
    }, true);
    const fallMat = new THREE.MeshBasicMaterial({ map: fallTex, transparent: true, opacity: 0.88, depthWrite: false, side: THREE.DoubleSide, color: lin(0xdfe8ea) });
    const streamTex = flowTex.clone(); streamTex.needsUpdate = true; streamTex.wrapS = streamTex.wrapT = THREE.RepeatWrapping;
    const streamMat = new THREE.MeshLambertMaterial({ map: streamTex, color: lin(0x7f989c), transparent: true, opacity: 0.85, depthWrite: false });
    const mists = [];
    let menuMat = null;
    const SNACK = [0xd8322b, 0xf2c230, 0x2f6fd6, 0x2f9a52, 0xf08a24, 0x7a2fa0, 0x1fa0a0];
    /* ---------- POIs ---------- */
    const stops = [];
    const KIND_SUB = { cafe: 'chai · maggi', shop: '', lodge: 'rooms', camp: 'camp', temple: '', monastery: '', shelter: '', toilets: '', info: '' };
    for (const poi of data.pois) {
      let x = poi.e, z = -poi.n;
      if (skipped(x, z)) continue;
      const nt = nearestTrail(x, z);
      let tx = (nt.x - x) / (nt.d || 1), tz = (nt.z - z) / (nt.d || 1);    // unit vector toward the trail
      if (nt.d < 1e-3) { const d = nt.tr.dirAtS(nt.s, 10); tx = -d.dz; tz = d.dx; }
      const face = Math.atan2(tx, tz);                                       // local +z faces the trail
      if (poi.b >= 0) {
        // place lives in a building: board on the trail side of it
        const b = data.buildings[poi.b]; if (!b || !poi.name || (poi.kind !== 'cafe' && poi.kind !== 'shop' && poi.kind !== 'lodge' && poi.kind !== 'temple' && poi.kind !== 'monastery')) continue;
        const P = []; for (let k = 0; k < b.p.length; k += 2) P.push([b.p[k], -b.p[k + 1]]);
        // walk from the building centre toward the trail until outside the footprint
        let bx = x, bz = z; for (let k = 0; k < 40 && inPoly(P, bx, bz); k++) { bx += tx * 0.5; bz += tz * 0.5; }
        bx += tx * 0.3; bz += tz * 0.3;
        nameBoard(bx, H(bx, bz) + 3.1, bz, face, poi.name, KIND_SUB[poi.kind], poi.kind === 'lodge' ? '#1f3b2e' : '#f2c230', poi.kind === 'lodge' ? '#f1ead8' : '#2a1a04', 2.8);
        bump('board');
        if (poi.kind === 'cafe' && nt.d < 30) stops.push(stopAt(poi, bx, bz, tx, tz, nt, 'building'));
        continue;
      }
      // keep standalone props off the walking line
      const clear = { cafe: 6, shop: 5, lodge: 9, camp: 10, temple: 5, monastery: 6, church: 6, shelter: 5, toilets: 4, info: 3, viewpoint: 3.5, bench: 2.2, bin: 2, drinking_water: 2 }[poi.kind] || 4;
      if (nt.d < clear) { x = nt.x - tx * clear; z = nt.z - tz * clear; }
      const y = H(x, z);
      switch (poi.kind) {
        case 'cafe': case 'shop': stall(x, y, z, face, poi); if (poi.kind === 'cafe' && nt.d < 30) stops.push(stopAt(poi, x + tx * 2.4, z + tz * 2.4, tx, tz, nt, 'stall')); break;
        case 'lodge': building(rectPoly(x, z, face, 7, 9), 2, 'lodge', poi.name, 7 + boards.length);
          if (poi.name) nameBoard(x + tx * 3.9, y + 3.1, z + tz * 3.9, face, poi.name, 'rooms', '#1f3b2e', '#f1ead8', 2.8); break;
        case 'temple': shrine(x, y, z, face, poi); break;
        case 'monastery': case 'church': building(rectPoly(x, z, face, 6, 8), 1, poi.kind, poi.name, 9 + boards.length);
          if (poi.name) nameBoard(x + tx * 3.4, y + 2.2, z + tz * 3.4, face, poi.name, '', '#7a1f1f', '#f2d27a', 3); break;
        case 'camp': camp(x, y, z, face, poi); break;
        case 'shelter': shelter(x, y, z, face, poi); break;
        case 'bench': bench(x, y, z, face); break;
        case 'toilets': toilet(x, y, z, face); break;
        case 'drinking_water': tap(x, y, z); break;
        case 'bin': props.geo(CYL, mtx(x, y + 0.45, z, 0, 0.55, 1, 0.55), C(0x2f7a3a)); bump('bin'); break;
        case 'info': infoBoard(x, y, z, face, poi); break;
        case 'viewpoint': viewpoint(x, y, z, face, poi); break;
        case 'waterfall': waterfall(poi); break;
        case 'pool': break;   // drawn from its outline below
      }
    }
    function stopAt(poi, x, z, tx, tz, nt, kind) {
      const label = poi.name || 'Tea stall';
      return { key: 'poi:' + poi.id, label, short: label.length > 14 ? label.slice(0, 13) + '…' : label, trail: nt.tr.id, s: nt.s, x, z, h: H(x, z), tx, tz,
               spot: { x: x + tx * 2.2, z: z + tz * 2.2 }, taken: false, seen: false, kind };
    }
    function rectPoly(x, z, ry, w, d) {
      const c = Math.cos(ry), s = Math.sin(ry), P = [];
      for (const [lx, lz] of [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]]) P.push([x + lx * c + lz * s, z - lx * s + lz * c]);
      return P;
    }
    // one shared chalkboard menu (prices: trip reports say 50-100% above town because supplies come up by mule)
    function menuBoard(x, y, z, ry) {
      if (!menuMat) { const mm = textPlane([{ t: 'MENU', size: 56, w: 700 }, { t: 'Chai  30', size: 40 }, { t: 'Lemon tea  40', size: 40 }, { t: 'Maggi  80', size: 40 }, { t: 'Omelette  70', size: 40 }, { t: 'Paratha  90', size: 40 }], 0.8, 1.05, '#20302a', '#efe9da'); menuMat = mm.material; mm.geometry.dispose(); }
      const m = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 1.05), menuMat); m.position.set(x, y, z); m.rotation.y = ry; m.visible = false; scene.add(m); boards.push(m);
    }
    // what a Triund chai stall actually holds: snack packets, Maggi, bottles on shelves, chips strips hanging at the
    // front, a gas stove with a big kettle and steel glasses, an LPG cylinder, plastic chairs, a menu board
    function goods(x, y, z, ry, w, d, hh, r, inside) {
      const wood = C(0x6e4b2e), steel = C(0xb9bcbf);
      if (inside) {
        for (const sy of [1.0, 1.5]) {
          lbox(props, x, y, z, ry, 0, sy, -d / 2 + 0.22, w * 0.82, 0.04, 0.32, wood);
          const n = Math.floor(w * 0.82 / 0.15);
          for (let i = 0; i < n; i++) {
            const lx = -w * 0.41 + 0.08 + i * 0.15, t = r();
            if (t < 0.45) lbox(props, x, y, z, ry, lx, sy + 0.11, -d / 2 + 0.22, 0.12, 0.2, 0.06, C(SNACK[(r() * SNACK.length) | 0]));            // chips packet
            else if (t < 0.65) for (let k = 0; k < 3; k++) lbox(props, x, y, z, ry, lx, sy + 0.04 + k * 0.045, -d / 2 + 0.22, 0.11, 0.04, 0.08, C(0xf2c230)); // Maggi stack
            else { const c = [0x9fc3d6, 0x9fc3d6, 0x2a1a12, 0xe07a1a][(r() * 4) | 0]; const cc = Math.cos(ry), ss = Math.sin(ry), lz = -d / 2 + 0.22;
              props.geo(CYL, mtx(x + lx * cc + lz * ss, y + sy + 0.14, z - lx * ss + lz * cc, 0, 0.07, 0.24, 0.07), C(c)); }                    // bottles
          }
        }
        // crates of soft drinks and a water tank in the corner
        lbox(props, x, y, z, ry, w / 2 - 0.45, 0.2, -d / 2 + 0.4, 0.45, 0.32, 0.32, C(0xc0392b));
        lbox(props, x, y, z, ry, w / 2 - 0.45, 0.52, -d / 2 + 0.4, 0.45, 0.32, 0.32, C(0x2f6fd6));
      }
      // counter: stove, kettle, glasses, biscuit jars
      const cz = d / 2 - 0.4, cy = 1.0;
      lbox(props, x, y, z, ry, -w * 0.18, cy + 0.04, cz, 0.42, 0.07, 0.3, C(0x2a2a2a));
      { const cc = Math.cos(ry), ss = Math.sin(ry), at = (lx, lz) => [x + lx * cc + lz * ss, z - lx * ss + lz * cc];
        let [px, pz] = at(-w * 0.18, cz); props.geo(CYL, mtx(px, y + cy + 0.19, pz, 0, 0.26, 0.22, 0.26), steel);                                   // kettle
        for (let i = 0; i < 4; i++) { [px, pz] = at(w * 0.05 + i * 0.09, cz + 0.1); props.geo(CYL, mtx(px, y + cy + 0.05, pz, 0, 0.06, 0.1, 0.06), steel); }   // steel glasses
        for (let i = 0; i < 2; i++) { [px, pz] = at(w * 0.25 + i * 0.2, cz - 0.05); props.geo(CYL, mtx(px, y + cy + 0.12, pz, 0, 0.15, 0.24, 0.15), C([0xd9b36a, 0xc8662a][i])); }  // biscuit jars
        [px, pz] = at(-w / 2 - 0.35, d / 2 - 0.5); props.geo(CYL, mtx(px, y + 0.3, pz, 0, 0.3, 0.6, 0.3), C(0xb8261f));                            // LPG cylinder
      }
      // chips strips hanging from the roof edge at the front
      for (let k = 0; k < 3; k++) {
        const lx = -w * 0.3 + k * w * 0.3;
        lbox(props, x, y, z, ry, lx, hh + 0.05, d / 2 + 0.05, 0.02, 0.1, 0.02, C(0x333333));
        for (let i = 0; i < 6; i++) lbox(props, x, y, z, ry, lx, hh - 0.12 - i * 0.2, d / 2 + 0.06, 0.14, 0.18, 0.012, C(SNACK[(k * 3 + i) % SNACK.length]));
      }
      // plastic table and chairs in front
      if (inside) {
      const tx = w * 0.15, tz = d / 2 + 1.7, plast = C(r() < 0.5 ? 0xf2f2ee : 0xc0392b);
      lbox(props, x, y, z, ry, tx, 0.7, tz, 0.7, 0.04, 0.7, C(0xf2f2ee));
      for (const [ax, az] of [[-0.3, -0.3], [0.3, -0.3], [-0.3, 0.3], [0.3, 0.3]]) lbox(props, x, y, z, ry, tx + ax, 0.35, tz + az, 0.04, 0.7, 0.04, C(0xe0e0dc));
      for (const [ax, az, back] of [[-0.6, 0, -1], [0.6, 0, 1]]) {
        lbox(props, x, y, z, ry, tx + ax, 0.43, tz + az, 0.42, 0.04, 0.42, plast);
        lbox(props, x, y, z, ry, tx + ax + back * 0.2, 0.68, tz + az, 0.04, 0.46, 0.42, plast);
        for (const [bx, bz] of [[-0.18, -0.18], [0.18, -0.18], [-0.18, 0.18], [0.18, 0.18]]) lbox(props, x, y, z, ry, tx + ax + bx, 0.21, tz + az + bz, 0.03, 0.42, 0.03, plast);
      }
      }
      // menu board on the side wall, blue tarp awning on some stalls
      { const cc = Math.cos(ry), ss = Math.sin(ry), lx = w / 2 + 0.08, lz = d / 2 - 0.3; menuBoard(x + lx * cc + lz * ss, y + 1.5, z - lx * ss + lz * cc, ry); }
      if (r() < 0.45) { const m = new THREE.Matrix4().compose(T.set(0, 0, 0), new THREE.Quaternion().setFromEuler(new THREE.Euler(0.22, ry, 0, 'YXZ')), S.set(w + 0.6, 0.02, 1.8));
        const cc = Math.cos(ry), ss = Math.sin(ry), lz = d / 2 + 0.9; m.setPosition(x + lz * ss, y + hh - 0.15, z + lz * cc); props.geo(BOX, m, C(0x2a5fae)); }
    }
    // tea stall / shop: tin roof on posts, back wall, counter facing the trail, benches, name board
    function stall(x, y, z, ry, poi) {
      const r = rng(poi.id.length * 97 + (poi.e | 0)), small = poi.kind === 'shop' || r() < 0.35;
      const w = small ? 3.2 : 4.6, d = small ? 2.6 : 3.4, hh = 2.5;
      const wall = C([0x3f72a8, 0xb5523b, 0x3b4f9a, 0x2f7a5a, 0xc9a23a, 0x8a5a3c][(r() * 6) | 0]);
      const wood = C(0x6e4b2e), tin = C(TIN[(r() * TIN.length) | 0]);
      lbox(props, x, y, z, ry, 0, -0.5, 0, w + 0.4, 1.1, d + 0.4, C(0x8f8b84));                    // stone platform
      lbox(props, x, y, z, ry, 0, hh / 2 + 0.05, -d / 2, w, hh, 0.12, wall);                          // back wall
      lbox(props, x, y, z, ry, -w / 2, hh / 2 + 0.05, 0, 0.12, hh, d, wall);                           // side walls
      lbox(props, x, y, z, ry, w / 2, hh / 2 + 0.05, 0, 0.12, hh, d, wall);
      for (const sx of [-1, 1]) lbox(props, x, y, z, ry, sx * (w / 2 - 0.1), (hh + 0.3) / 2, d / 2 - 0.1, 0.12, hh + 0.3, 0.12, wood);   // front posts
      const roofM = new THREE.Matrix4().compose(T.set(0, 0, 0), new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.14, ry, 0, 'YXZ')), S.set(w + 0.8, 0.08, d + 1.2));
      roofM.setPosition(x + Math.sin(ry) * 0.3, y + hh + 0.45, z + Math.cos(ry) * 0.3); props.geo(BOX, roofM, tin);
      lbox(props, x, y, z, ry, 0, 0.5, d / 2 - 0.4, w * 0.7, 1.0, 0.6, wood);                          // counter
      lbox(props, x, y, z, ry, -w * 0.15, 1.1, d / 2 - 0.4, 0.35, 0.3, 0.35, C(0xb8b8b4));            // kettle / stove
      for (const sx of [-1, 1]) { const bx = sx * (w / 2 + 0.9), bz = d / 2 + 0.6; lbox(props, x, y, z, ry, bx, 0.22, bz, 1.8, 0.1, 0.45, wood); lbox(props, x, y, z, ry, bx, 0.1, bz, 1.6, 0.25, 0.3, C(0x5b4330)); }
      if (r() < 0.6) for (let i = 0; i < 4; i++) lbox(props, x, y, z, ry, (i - 1.5) * 0.7, 1.6, -d / 2 + 0.15, 0.5, 0.7, 0.05, C([0xe0402a, 0xf2c230, 0x2f6fd6, 0x2f9a52][i]));   // snack packets on the back wall
      goods(x, y, z, ry, w, d, hh, r, true);
      const c = Math.cos(ry), s = Math.sin(ry), fx = x + (d / 2 + 0.05) * s, fz = z + (d / 2 + 0.05) * c;
      nameBoard(fx, y + hh + 0.1, fz, ry, poi.name || (poi.kind === 'cafe' ? 'Tea Stall' : 'General Store'), poi.kind === 'cafe' ? 'chai · maggi · omelette' : '', '#f2c230', '#2a1a04', Math.min(w, 3.2));
      occupyDisc(x, z, Math.max(w, d) / 2 + 2.5);
      bump(poi.kind);
    }
    function shrine(x, y, z, ry, poi) {
      lbox(props, x, y, z, ry, 0, -0.3, 0, 3.2, 1.2, 3.2, C(0x8f8b84));
      lbox(props, x, y, z, ry, 0, 1.2, 0, 2.2, 2.4, 2.2, C(0xf1ece2));
      lbox(props, x, y, z, ry, 0, 0.95, 1.11, 0.8, 1.4, 0.05, C(0x8a2f1f));
      shikhara(x, y + 2.4, z, 1.1, ry);
      for (let i = 0; i < 3; i++) lbox(props, x, y, z, ry, -0.9 + i * 0.9, 0.1, 2.0, 0.5, 0.3, 0.4, C(0xd83b30));   // red cloth offerings
      if (poi.name) nameBoard(x + Math.sin(ry) * 2.3, y + 3.0, z + Math.cos(ry) * 2.3, ry, poi.name, '', '#7a1f1f', '#f2d27a', 2.6);
      occupyDisc(x, z, 4); bump('temple');
    }
    function camp(x, y, z, ry, poi) {
      const r = rng((poi.e * 13) | 0), cols = [0xf2a93b, 0xd83b30, 0x2f6fd6, 0x2f9a52, 0xf2c230, 0x7a4fa0];
      let n = 0;
      for (let i = 0; i < 40 && n < 6; i++) {
        const a = r() * Math.PI * 2, rr = 3 + r() * 11, tx = x + Math.cos(a) * rr, tz = z + Math.sin(a) * rr, ty = H(tx, tz);
        if (nearestTrail(tx, tz).d < 4) continue;
        if (Math.abs(H(tx + 1.5, tz) - ty) > 0.6 || Math.abs(H(tx, tz + 1.5) - ty) > 0.6) continue;
        props.geo(DOME, mtx(tx, ty - 0.05, tz, r() * 6, 1.3, 1.1, 1.6), C(cols[(r() * cols.length) | 0]));
        occupyDisc(tx, tz, 2.4); n++;
      }
      if (poi.name) nameBoard(x, y + 1.8, z, ry, poi.name, 'camping', '#1f3b2e', '#f1ead8', 2.6);
      bump('camp');
    }
    function shelter(x, y, z, ry, poi) {
      const stone = C(0x8a857c), slate = C(0x55595e);
      lbox(props, x, y, z, ry, 0, 0.9, -1.8, 4.4, 2.6, 0.4, stone);
      lbox(props, x, y, z, ry, -2.0, 0.9, 0, 0.4, 2.6, 4, stone); lbox(props, x, y, z, ry, 2.0, 0.9, 0, 0.4, 2.6, 4, stone);
      const roofM = new THREE.Matrix4().compose(T.set(0, 0, 0), new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.2, ry, 0, 'YXZ')), S.set(5.2, 0.15, 5));
      roofM.setPosition(x, y + 2.4, z); props.geo(BOX, roofM, slate);
      if (poi.name) nameBoard(x + Math.sin(ry) * 2.6, y + 1.9, z + Math.cos(ry) * 2.6, ry, poi.name, 'shelter', '#1f3b2e', '#f1ead8', 2.4);
      occupyDisc(x, z, 4.5); bump('shelter');
    }
    function bench(x, y, z, ry) {
      const wood = C(0x6e4b2e);
      lbox(props, x, y, z, ry, 0, 0.45, 0, 1.8, 0.08, 0.45, wood); lbox(props, x, y, z, ry, 0, 0.8, -0.22, 1.8, 0.3, 0.06, wood);
      for (const sx of [-0.75, 0.75]) lbox(props, x, y, z, ry, sx, 0.15, 0, 0.1, 0.7, 0.4, C(0x55595e));
      bump('bench');
    }
    function toilet(x, y, z, ry) {
      lbox(props, x, y, z, ry, 0, 0.9, 0, 2.2, 2.4, 2, C(0xdcd6c8)); lbox(props, x, y, z, ry, 0, 2.2, 0, 2.6, 0.12, 2.4, C(0x3c5f95));
      lbox(props, x, y, z, ry, -0.5, 0.9, 1.01, 0.7, 1.7, 0.04, C(0x3c5f95)); lbox(props, x, y, z, ry, 0.5, 0.9, 1.01, 0.7, 1.7, 0.04, C(0x3c5f95));
      nameBoard(x + Math.sin(ry) * 1.05, y + 1.95, z + Math.cos(ry) * 1.05, ry, 'Toilets', '', '#1f3b2e', '#f1ead8', 1.4);
      occupyDisc(x, z, 2.5); bump('toilets');
    }
    function tap(x, y, z) { props.geo(CYL, mtx(x, y + 0.5, z, 0, 0.12, 1.2, 0.12), C(0x8f8b84)); props.geo(BOX, mtx(x, y + 0.2, z, 0, 0.8, 0.15, 0.8), C(0x9a958c)); bump('tap'); }
    function infoBoard(x, y, z, ry, poi) {
      for (const sx of [-1, 1]) lbox(props, x, y, z, ry, sx * 1.2, 1.1, 0, 0.12, 2.4, 0.12, C(0x5a4632));
      const m = nameBoard(x, y + 1.6, z, ry, poi.name || 'Information', 'Forest Department · Dharamshala', '#1f3b2e', '#f1ead8', 2.6); m.scale.set(1, 1.3, 1);
      bump('info');
    }
    function viewpoint(x, y, z, ry, poi) {
      const wood = C(0x6e4b2e);
      for (let i = -2; i <= 2; i++) lbox(props, x, y, z, ry, i * 1.2, 0.5, 0.6, 0.1, 1.1, 0.1, wood);
      lbox(props, x, y, z, ry, 0, 0.95, 0.6, 5, 0.08, 0.08, wood); lbox(props, x, y, z, ry, 0, 0.55, 0.6, 5, 0.06, 0.06, wood);
      bench(x - Math.sin(ry) * 1.2, y, z - Math.cos(ry) * 1.2, ry + Math.PI);
      bump('viewpoint');
    }

    /* ---------- water: waterfalls, streams, pool ---------- */
    function waterfall(poi) {
      let x0 = poi.e, z0 = -poi.n;
      // sit the fall on the OSM stream it belongs to; the water drops toward downstream (OSM ways run downstream)
      let fx = 0, fz = 0, best = 60;
      for (const st of data.streams) for (let k = 2; k < st.p.length - 2; k += 2) {
        const px = st.p[k], pz = -st.p[k + 1], d = Math.hypot(px - x0, pz - z0);
        if (d < best) { best = d; const nx2 = st.p[k + 2], nz2 = -st.p[k + 3], qx = st.p[k - 2], qz = -st.p[k - 1]; fx = nx2 - qx; fz = nz2 - qz; x0 = px; z0 = pz; }
      }
      if (!fx && !fz) { fx = -(H(x0 + 8, z0) - H(x0 - 8, z0)); fz = -(H(x0, z0 + 8) - H(x0, z0 - 8)); }
      { const l = Math.hypot(fx, fz) || 1; fx /= l; fz /= l; }
      const nt = nearestTrail(x0, z0);
      const big = /bhagsu/i.test(poi.name), tall = big ? 20 : 9, wdt = big ? 4.5 : 2.5;
      const yb = H(x0, z0) - 0.4;
      const rx = -fz, rz = fx;
      // rock step across the gully: the water pours over its downstream face
      const rock = C(0x6d6a64);
      const nRock = big ? 46 : 22;
      for (let i = 0; i < nRock; i++) {
        const u = (R() * 2 - 1) * wdt * (1.2 + R() * 1.4), v = R() * tall * (1 - Math.abs(u) / (wdt * 3.4)), s = (big ? 2.2 : 1.4) + R() * (big ? 2.6 : 1.4);
        const back = 1.0 + s * 1.15 + R() * 1.2;
        props.geo(ROCK, new THREE.Matrix4().compose(T.set(x0 + rx * u - fx * back, yb + v, z0 + rz * u - fz * back), new THREE.Quaternion().setFromEuler(new THREE.Euler(R() * 3, R() * 3, R() * 3)), S.set(s * 1.2, s * 0.8, s)), rock.clone().multiplyScalar(0.75 + R() * 0.45));
      }
      for (let i = 0; i < 8; i++) { const u = (R() * 2 - 1) * wdt * 1.6, w2 = 0.8 + R() * 1.4;      // boulders in the plunge pool
        props.geo(ROCK, new THREE.Matrix4().compose(T.set(x0 + rx * u + fx * (wdt * 1.2 + R() * 3), yb + 0.2, z0 + rz * u + fz * (wdt * 1.2 + R() * 3)), new THREE.Quaternion().setFromEuler(new THREE.Euler(R() * 3, R() * 3, R() * 3)), S.set(w2, w2 * 0.6, w2)), rock.clone().multiplyScalar(0.7 + R() * 0.3)); }
      const g = new THREE.PlaneGeometry(wdt, tall, 1, 8); g.translate(0, tall / 2, 0);
      const p = g.attributes.position; for (let i = 0; i < p.count; i++) { const v = p.getY(i) / tall; p.setZ(i, (1 - v) * 1.4 + Math.sin(v * Math.PI) * 0.3); p.setX(i, p.getX(i) * (1 + (1 - v) * 0.6)); }
      g.computeVertexNormals();
      const m = new THREE.Mesh(g, fallMat); m.position.set(x0, yb, z0); m.rotation.y = Math.atan2(fx, fz); m.renderOrder = 3; scene.add(m);
      // plunge pool + mist
      const pool = new THREE.Mesh(new THREE.CircleGeometry(wdt * 1.4, 20), new THREE.MeshLambertMaterial({ color: lin(0x3d5a5e), transparent: true, opacity: 0.9 }));
      pool.rotation.x = -Math.PI / 2; pool.position.set(x0 + fx * wdt, yb + 0.6, z0 + fz * wdt); scene.add(pool);
      const mtex = canvasTex(64, 64, (g2, w, h) => { const gr = g2.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,0.7)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g2.fillStyle = gr; g2.fillRect(0, 0, w, h); });
      for (let i = 0; i < 5; i++) {
        const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: mtex, transparent: true, depthWrite: false, opacity: 0.35 }));
        sp.position.set(x0 + fx * (1 + R() * 2) + rx * (R() - 0.5) * wdt, yb + 1 + R() * 2, z0 + fz * (1 + R() * 2) + rz * (R() - 0.5) * wdt); sp.scale.setScalar(3 + R() * 3);
        scene.add(sp); mists.push({ sp, ph: R() * 6 });
      }
      if (poi.name) { let bx = x0 - nt.x, bz = z0 - nt.z; const bl = Math.hypot(bx, bz) || 1; bx /= bl; bz /= bl;
        const px = nt.x + bx * 2.6, pz = nt.z + bz * 2.6; nameBoard(px, H(px, pz) + 2.0, pz, Math.atan2(-bx, -bz), poi.name, 'waterfall', '#1f3b2e', '#f1ead8', 2.8); }
      occupyDisc(x0, z0, wdt * 2.5); bump('waterfall');
    }
    // streams: ribbon sitting in the gully (lowest of three samples across), flowing texture
    const sp = [], si = [], su = [];
    let sv = 0;
    for (const st of data.streams) {
      const pts = []; for (let k = 0; k < st.p.length; k += 2) pts.push([st.p[k], -st.p[k + 1]]);
      let acc = 0;
      for (let i = 0; i < pts.length; i++) {
        const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)]; let dx = b[0] - a[0], dz = b[1] - a[1]; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
        const nx = -dz, nz = dx, x = pts[i][0], z = pts[i][1];
        const y = Math.min(H(x, z), H(x + nx * 2.5, z + nz * 2.5), H(x - nx * 2.5, z - nz * 2.5)) + 0.18;
        if (i) acc += Math.hypot(x - pts[i - 1][0], z - pts[i - 1][1]);
        const w = st.w / 2 * (0.8 + 0.4 * Math.sin(acc * 0.13));
        sp.push(x + nx * w, y, z + nz * w, x - nx * w, y, z - nz * w); su.push(0, acc / 6, 1, acc / 6);
        if (i) si.push(sv - 2, sv - 1, sv, sv - 1, sv + 1, sv);
        sv += 2;
      }
    }
    if (sp.length) {
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(su, 2)); g.setIndex(si); g.computeVertexNormals();
      const m = new THREE.Mesh(g, streamMat); m.receiveShadow = true; m.renderOrder = 2; scene.add(m); counts.streamPts = sv / 2;
    }
    for (const pl of data.pools) {
      const P = []; for (let k = 0; k < pl.p.length; k += 2) P.push([pl.p[k], -pl.p[k + 1]]);
      if (P.length > 2 && P[0][0] === P[P.length - 1][0] && P[0][1] === P[P.length - 1][1]) P.pop();
      let y = Infinity; for (const p of P) y = Math.min(y, H(p[0], p[1]));
      const shape = new THREE.Shape(P.map(p => new THREE.Vector2(p[0], -p[1])));
      const g = new THREE.ShapeGeometry(shape); g.rotateX(-Math.PI / 2);
      const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color: lin(0x3f6a70), transparent: true, opacity: 0.92 })); m.position.y = y + 0.2; scene.add(m);
      for (let i = 0; i < P.length; i++) { const a = P[i], b = P[(i + 1) % P.length]; walls.quad([a[0], y - 0.5, a[1]], [b[0], y - 0.5, b[1]], [b[0], y + 0.6, b[1]], [a[0], y + 0.6, a[1]], C(0xb1ada5), null); }
      occupyPoly(P, 2); bump('pool');
    }

    /* ---------- finish the merged meshes ---------- */
    const wallMesh = walls.mesh(surfaceMat('wall', { map: wallTex, normalMap: plasterN, normalScale: new THREE.Vector2(0.6, 0.6), side: THREE.DoubleSide }));
    const roofMesh = roofs.mesh(surfaceMat('roof', { map: tinMap, normalMap: tinN, roughness: 0.55, metalness: 0.35, side: THREE.DoubleSide }));
    const propMat = surfaceMat('prop', { roughness: 0.85 });
    const propMesh = props.mesh(propMat);
    if (tanks.length) {
      const g = new THREE.CylinderGeometry(1, 1, 1, 10); g.translate(0, 0.5, 0);
      const im = new THREE.InstancedMesh(g, new THREE.MeshLambertMaterial({ color: lin(0x1d1f22) }), tanks.length);
      tanks.forEach((t, i) => im.setMatrixAt(i, mtx(t[0], t[1], t[2], 0, t[3], t[3] * 1.9, t[3])));
      im.castShadow = true; im.receiveShadow = true; scene.add(im); counts.tanks = tanks.length;
    }
    if (prayerFlags) for (const f of flagsLater) prayerFlags(f[0], f[1], f[2], f[3], 3.4);
    counts.tris = Math.round((walls.p.length + roofs.p.length + props.p.length) / 9);

    /* ---------- per frame ---------- */
    let bt = 0;
    function update(dt, cam, time) {
      fallTex.offset.y = (time * 0.9) % 1;               // waterfall: water falls (texture v up = top)
      streamTex.offset.y = -(time * 0.35) % 1;
      for (const m of mists) m.sp.material.opacity = 0.22 + 0.15 * Math.sin(time * 1.3 + m.ph);
      bt -= dt; if (bt > 0) return; bt = 0.4;
      for (const b of boards) { const dx = b.position.x - cam.x, dz = b.position.z - cam.z; b.visible = dx * dx + dz * dz < 160 * 160; }
    }
    // dress the hand-built stalls in index.html (they are closed boxes: counter-side goods only)
    function dress(list) {
      const before = props.p.length;
      for (const q of list) goods(q.x, q.y, q.z, q.ry, q.w, q.d, q.hh, rng(q.seed || 5), false);
      const B = new Batch(); B.p = props.p.slice(before); B.n = props.n.slice(before); B.c = props.c.slice(before); B.uv = props.uv.slice(before);
      B.mesh(propMat);
    }
    return {
      counts, stops, update, dress, meshes: { wallMesh, roofMesh, propMesh },
      surfaceMat,
      tex: { tinMap, tinN, plasterN, wood: woodDetail, woodN, plaster: photo('plaster_d', true), rock: photo('rock_d', true), rockN: photo('rock_n', false) },
      blocked: (x, z) => OCC.has(okey(Math.floor(x / OC), Math.floor(z / OC)))
    };
  }
};
