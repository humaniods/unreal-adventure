# Realism upgrade + Shiva Cafe route: implementation plan

> For agentic workers: execute task by task; each task ends with its own check. Spec:
> `docs/superpowers/specs/2026-11-17-realism-and-shiva-route-design.md`.
> No git commits unless the user asks (repo has no commits yet; user has not asked).

**Goal:** Real-looking browser walk test on both real Triund routes (Gallu Devi, Bhagsu via Shiva Cafe).

**Architecture:** `prototype/geo/build.py` turns OSM + DEM + Sentinel-2 into `triund-data.js`
(heights, trails, baked shading) and two satellite JPEGs. `prototype/walk-test/index.html` keeps game
logic; `sky.js`, `terrain-material.js`, `flora.js`, `quality.js` are focused modules exposed as
`window.Triund*` factories that receive their dependencies as arguments.

**Tech stack:** Python 3.10 + numpy + Pillow (build), Three.js r128 from cdnjs, `Sky.js` from
`cdn.jsdelivr.net/npm/three@0.128.0/examples/js/objects/Sky.js`, patchright headless QA.

## Global constraints

- Trail lines only from OSM; satellite never moves a trail.
- Player-facing text in English.
- Attribution on the start screen: OSM (ODbL), AWS Terrain Tiles (SRTM), Sentinel-2 cloudless 2016 by EOX (CC BY 4.0).
- Only the `s2cloudless_3857` (2016) layer.
- Sun fixed: azimuth 115 deg, elevation 12 deg.
- localStorage access wrapped in try/catch.

---

### Task 1: build.py: both trails, OSM surface tags, bigger near box

**Files:** modify `prototype/geo/build.py`; create `prototype/geo/paths.json` (cached Overpass path network).

**Produces (data contract in `window.TRIUND_DATA`):**
- `near`, `far`: as today (`e0,e1,n0,n1,step,nx,nz,scale,data`). Near box becomes e -900..3700, n -1800..2300.
- `trails.galu`, `trails.shiva`: `{step, len, e[], n[], h[], seg:[{s0,s1,surface,sac}]}`.
- `marks.<key>`: `{name, e, n, trail, s, off, ele}`; `trail` is the trail the mark is projected onto.
- `shade`: `{near:{e0,n0,step,nx,nz,data}, far:{...}}`, u8 base64; value = 255 * light factor (sun-shadow and AO combined).
- `sun`: `{az:115, el:12}`.

**Steps:**
- [ ] Generalise trail assembly into `build_trail(way_ids)` with the end-to-end join check.
- [ ] `shiva` way list from the spec; ways come from `paths.json` (fetched with retry if missing).
- [ ] Per-segment `surface` / `sac_scale` from way tags.
- [ ] Assert: every trail sample is inside the near box with 200 m margin; max deviation from OSM line < 0.5 m.
- [ ] Run `python3 prototype/geo/build.py`. Expected: two trail summaries (galu about 5034 m, shiva about 4837 m), zero samples outside the box.

### Task 2: build.py: satellite JPEGs + baked terrain shading

**Files:** modify `prototype/geo/build.py`; output `prototype/walk-test/sat-near.jpg`, `sat-far.jpg`; tile cache `prototype/geo/sat/`.

- [ ] Fetch EOX `s2cloudless_3857` tiles (z15 near, z12 far), bilinear-reproject into local grids,
      1024x1024 each, near box and far box; image row 0 = north edge.
- [ ] Sun-shadow: march from each shade-grid cell toward the sun over the DEM (near 16 m grid,
      far 100 m grid), soft penumbra. AO: mean horizon elevation over 8 directions within 400 m.
      `light = clip(0.35 + 0.65*sun, 0, 1) * (1 - 0.6*ao)`.
- [ ] `--overlay` flag writes `prototype/geo/overlay.png` (both trails on the near satellite image).
- [ ] Check: open overlay.png and confirm trails sit on the ridge spur / Triund meadow as before.

### Task 3: runtime: multiple trails + Shiva route content

**Files:** modify `prototype/walk-test/index.html`.

**Interfaces:**
- `TRAILS = {galu: Trail, shiva: Trail}`; `Trail = {id, segs, total, topAlt, pointAtS(s), dirAtS(s,span), nearest(x,z)}`.
- `ACT` = active Trail. `startFrom ∈ {'galu','magic','shiva'}`; `magic` uses `TRAILS.galu`.
- Global terrain query `trailQ(x,z)` covers segments of all trails.
- `STOPS` entries gain `trail` id; HUD "Next:" uses stops on `ACT` only.

- [ ] Replace single-trail code with the Trail factory; derive `BOX` from `TD.near` (36 m inset).
- [ ] Start screen: third option "Bhagsu / via Shiva Cafe · 4.8 km"; new subtitle on start.
- [ ] Props on the Shiva route: Bhagsu temple + trailhead board, Shiva Cafe stall, Karthani shelter,
      distance stones every km, one NPC. Finish works on either trail.
- [ ] QA: teleport along both trails, no JS errors, finish triggers on both.

### Task 4: sky, light, shadows, quality presets

**Files:** create `prototype/walk-test/sky.js`, `prototype/walk-test/quality.js`; modify `index.html`.

**Interfaces:**
- `TriundQuality.get() -> 'high'|'low'`, `.set(level)`, `.params(level) -> {shadowSize, shadowRange, grassR, treeLod, pixelRatio}`.
- `TriundSky.init({THREE, scene, renderer, camera, sun:{az,el}}) -> {sunDir: THREE.Vector3, update(camera)}`.

- [ ] ACES tone mapping, sRGB output, Preetham sky following the camera, fog colour matched to horizon.
- [ ] Directional sun with a shadow camera that follows the player, texel-snapped.
- [ ] Quality toggle (start + pause screens), auto-drop to Low when median frame time over the first 10 s of play > 40 ms.
- [ ] Debug panel adds draw calls + triangles.

### Task 5: terrain material

**Files:** create `prototype/walk-test/terrain-material.js`; modify `index.html` (mesh attributes).

**Interfaces:** `TriundTerrain.material({THREE, satNear, satFar, nearBox, farBox}) -> MeshStandardMaterial`.
Mesh attribute `tdat` (vec4): x = trail weight, y = surface id / 4 (0 gravel, 1 dirt/ground, 2 rock, 3 concrete), z = baked light, w = slope (1 - normal.y).

- [ ] Base colour from satellite (near/far with edge blend), sRGB-decoded and colour-graded; fallback to vertex colour if images failed.
- [ ] Procedural near detail (noise-based grass/soil/rock/litter), fading out by 150 m; rock on slope > 0.45.
- [ ] Trail surface by id with edge breakup noise; baked light multiplies.
- [ ] Trail bed lowered 0.15 m in `H()` with soft shoulders.

### Task 6: vegetation + trail stones

**Files:** create `prototype/walk-test/flora.js`; modify `index.html`.

**Interfaces:** `TriundFlora.build({THREE, scene, H, trailDist, isMeadow, satSample, shade, quality, rng}) -> {update(dt, camPos, time), setQuality(p)}`.

- [ ] Canvas-generated alpha textures: deodar needle branch, oak leaf cluster, rhododendron leaves + flowers, far-tree silhouettes, grass blades.
- [ ] Deodar / oak / rhododendron near meshes (instanced), crossed-quad impostors beyond LOD radius; rebuild split every 20 m of player movement.
- [ ] Tree placement weighted by satellite forest mask (dark green = forest, light/brown = open).
- [ ] Grass + flowers in cells around the player; wind sway shader shared by trees and grass (depth material patched too).
- [ ] Trail edge stones and stone risers on steep dirt/rock segments.

### Task 7: QA + publish

- [ ] Headless screenshots (existing 7 points + Bhagsu pathway, Shiva Cafe, Karthani); no console errors; finish from both routes.
- [ ] Look at every screenshot; fix what looks wrong.
- [ ] Publish artifact (same URL) with all supporting files; read back file list.
