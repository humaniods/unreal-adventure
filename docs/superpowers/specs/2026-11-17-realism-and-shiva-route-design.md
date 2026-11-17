# Triund walk test: realism upgrade + Shiva Cafe route

Date: 2026-11-17
Status: approved in chat, pending spec review
Target: browser walk test (`prototype/walk-test/`, Three.js r128), published at
https://claude.ai/artifact/RKuzC8diN16oc8niT6Cdy7

## Goal

Make the existing real-geography walk test look and feel like the real Triund trek, and add the
second real route (Bhagsu via Shiva Cafe). Hardware budget: normal laptops with integrated GPUs
(Intel Iris, AMD APU, Apple M1), 30+ fps on the High preset is the target, Low preset as fallback.

## Hard rules

1. **Map first.** Every route's horizontal line comes from OpenStreetMap only. Satellite imagery
   colours the ground; it never moves a trail. Landmarks sit on their OSM node positions.
2. **Elevation from DEM** (AWS Terrain Tiles / SRTM), as today.
3. **Player-facing text in English.** Chat with the user stays Hinglish.
4. **Attribution visible on the start screen:** OSM (ODbL), AWS Terrain Tiles (SRTM), and
   "Sentinel-2 cloudless 2016 by EOX IT Services GmbH (contains modified Copernicus Sentinel data 2016), CC BY 4.0".
   Only the 2016 s2cloudless layer is used (CC BY 4.0). Later layers are CC BY-NC-SA and are not shipped.

## Scope

In:
- Lighting and atmosphere (sky, sun, shadows, tone mapping, baked terrain shading)
- Ground material (satellite colour + procedural near detail)
- Trail surface driven by OSM tags (surface, sac_scale), stone steps on steep sections
- New vegetation (deodar, banj oak, rhododendron, grass, ferns, meadow flowers), wind sway
- Second route: Bhagsunag -> Shiva Cafe -> Karthani -> Triund
- Low/High quality preset
- Code split of new systems into separate files

Out (later): weather, clouds, day/night cycle, human/NPC model upgrade, new audio, UE5 port.

## Routes

| id | Name on start screen | OSM source | Length | Elevation |
|---|---|---|---|---|
| `galu` | Gallu Devi | relation 15522720, ways 43100894, 1196379185, 56688112, 537044551 | 5.03 km | 2096 -> 2838 m, +962 m |
| `magic` | Magic View (final climb) | same as `galu`, starts at Magic View Cafe | 2.4 km | |
| `shiva` | Bhagsu via Shiva Cafe | ways 41695722, 1148793516, 1148793515, 537044555, 53257292, 702080139, 819840765, 53257291, 56688109, 537044551 | 4.84 km | 1755 -> 2838 m, +1260 m |

The `shiva` way list is the result of shortest-path routing on the OSM path network through the
waypoints Bhagsu Naag Waterfall Pathway start (32.2442429, 76.3347216), Shiva Cafe
(node 2386629020), Karthani (node 673873810), Triund (node 539994204). `build.py` stores the
ordered way list and checks that consecutive ways share an end node (same check it does for `galu`).
Way 702080139 has no name in OSM; it is kept because it is part of the mapped network.

New landmarks for `shiva` (OSM nodes): Bhagsu Naag Temple 513003894, Bhagsunag Waterfall 513003866,
Shiva Cafe 2386629020, Karthani shelter 673873811 / camp site 673873810.

## Data pipeline (`prototype/geo/build.py`)

Changes:
- Cache the fresh Overpass result for both routes in `route.json` (adds the `shiva` ways) and keep
  the path network query used for routing in `paths.json`.
- Output `trails: {galu: {...}, shiva: {...}}` instead of a single `trail`. Each trail keeps
  `step, len, e[], n[], h[]` plus `seg: [{s0, s1, surface, sac}]` from the OSM way tags.
  Both trails reuse the existing height smoothing and grade relaxation.
- Near DEM box extends south and east so the whole `shiva` route is inside:
  n0 -1300 -> -1600 (the Leta dip reaches about n = -1330 m). Near grid stays 8 m.
- Satellite: download s2cloudless 2016 tiles (EOX WMTS, `s2cloudless_3857`), reproject into the
  local east/north grid, write two JPEGs:
  - `sat-near.jpg`: the near box at about 4 m/pixel (about 1300 x 1150 px; the source is 10 m)
  - `sat-far.jpg`: the far 44 km box at 40 m/pixel (about 1100 x 1100 px)
  Tiles are cached in `geo/sat/`. Requests use a generic User-Agent, no personal data.
- `triund-data.js` stays the single data file for heights and trails; images are separate files
  published next to it via the artifact `files` map.

## Runtime architecture

`index.html` (71 KB) keeps game logic, HUD and screens. New code goes into focused files:

| File | Purpose | Interface |
|---|---|---|
| `sky.js` | Sky dome shader, sun direction, fog colour, tone mapping setup | `Sky.init(scene, renderer)`, `Sky.sunDir`, `Sky.update(camera)` |
| `terrain-material.js` | Ground shader: satellite colour + procedural detail + trail surface | `makeTerrainMaterial({satNear, satFar, box, trailMask})` returns a `MeshStandardMaterial` patched via `onBeforeCompile` |
| `flora.js` | Tree, bush, grass and flower generation, LOD, wind | `Flora.build(scene, H, placementRules, quality)`, `Flora.update(dt, camera)` |
| `quality.js` | Low/High presets, persisted per viewer in localStorage (try/catch) | `Q.get()`, `Q.set(level)` |

Multiple trails at runtime:
- Terrain carving and trail colouring use **all** trails (both are real paths in the world).
  The spatial hash stores segments from every trail with a trail id.
- Progress, distance stones, watch "Next:" labels and finish detection use the **active** trail
  only. `pointAtS`, `dirAtS`, `nearestTrail` take the active trail.
- Start options: `galu`, `magic`, `shiva`. `localStorage` key `triund-start` accepts the new value.
- Finish: reaching Triund top on either route.

## Visual design

### Light and atmosphere
- Physically based sky (Preetham model, as in three r128 `examples/js/objects/Sky.js`, inlined
  into `sky.js`). Fixed low morning sun: azimuth about 115 deg (ESE), elevation about 12 deg.
  (At the watch's 07:00 IST start the real sun in November is only a few degrees up; 12 deg is
  chosen so the forest is not too dark. The sun does not move during the walk.)
- `renderer.toneMapping = ACESFilmicToneMapping`, `outputEncoding = sRGBEncoding`.
  Light intensities are retuned by eye after the switch. Materials move from Lambert to Standard
  where lit by the sun.
- Fog colour sampled from the sky toward the view direction (warmer toward the sun).
- Real-time shadows from one directional light, shadow camera follows the player:
  High 2048 map over 160 m, Low 1024 over 100 m. Only near trees, rocks, props and player cast.
- Baked terrain shading: horizon-based ambient occlusion and sun-shadow for the far mesh and
  near mesh, computed once at load from the height grids and stored in vertex colours, so distant
  ridges and valleys show depth without real-time shadows.

### Ground
- Base colour = s2cloudless sample (near texture inside the box, far texture outside), with
  saturation and brightness matched to the procedural palette.
- Near detail fades in under 150 m: four procedural layers generated at load into canvas
  textures (grass, soil, rock, leaf litter), blended by slope, altitude, distance to trail and
  fbm noise. Cliffs (slope > 1) use triplanar rock to avoid stretching.
- Meadow rule unchanged (Triund top area and above 2950 m), now with denser grass.

### Trail
- Trail bed sunk 0.15 m into the terrain with soft shoulders.
- Surface per OSM tag:
  - `gravel`: light grey-brown gravel texture, few embedded stones
  - `dirt` / `ground`: darker packed soil, roots and loose stones
  - `rock`: exposed rock slabs
  - `concrete` (Bhagsu pathway): grey paved path with steps
- Stone steps on segments with grade > 0.25 and `sac_scale` of `mountain_hiking` or harder.
- Loose stones scattered along the edges (instanced).

### Vegetation
- Deodar: tall conical tree with drooping layered branch tiers, alpha-tested needle cards.
- Banj oak: lumpy rounded canopy from clustered leaf cards.
- Rhododendron: crooked trunk, dense dark leaves, red flower clusters.
- Per instance: scale, hue, lean and rotation variation.
- LOD: full mesh within 120 m (High) / 70 m (Low); camera-facing impostor billboards beyond.
- Grass: instanced blade clumps within 40 m (High) / 20 m (Low) of the player, regenerated in
  cells as the player moves. Ferns and bushes in forest, wildflowers in the meadow.
- Wind: vertex shader sway on trees and grass, gust strength varying with fbm over time.
- Placement keeps the existing rules (forest below, meadow at top, no trees on cliffs or on trail).

## Performance

- Quality toggle on the start and pause screens: Low / High. Default High; auto-drop to Low if
  the median frame time over the first 10 s of play is above 40 ms (toast tells the player).
- Debug panel (backtick key) shows fps, frame time, draw calls and triangles.
- Load budget: all generation at load under 3 s on a normal laptop; a loading bar shows progress.
- Data budget: `triund-data.js` grows to about 1.6 MB (two trails, bigger near box); two JPEGs about 1 MB total.

## Error handling

- If a satellite JPEG fails to load, the terrain material falls back to the existing procedural
  vertex colours (game stays playable). The debug panel reports the failure.
- If WebGL lacks float textures or the shader fails to compile, force Low preset with
  Lambert materials (current look).
- `build.py` exits with a clear error when route ways do not join end to end, or when any trail
  sample falls outside the near DEM box.

## Testing

- `build.py` prints per trail: length, elevation range, gain, grade p50/p90/max, max deviation of
  the game trail from the OSM line (must be < 0.5 m), samples outside the near box (must be 0).
- Satellite overlay image of both routes is regenerated by `build.py --overlay` for visual checks.
- Headless browser QA (patchright, main-world script injection as before):
  - No JS errors or failed requests on load.
  - Screenshots at fixed points: start Gallu Devi, forest, Magic View, switchbacks, Triund top,
    third person, menu view, plus new `shiva` points: Bhagsu pathway, Shiva Cafe, Karthani.
  - Before/after comparison for the existing points.
  - Finish screen triggers from both routes (teleport near top, walk to finish).
- Headless fps is not representative (software GL); real fps is checked by the user on their
  laptop with the debug panel.

## Delivery

Republish the same artifact URL with `index.html` plus supporting files: `triund-data.js`,
`sat-near.jpg`, `sat-far.jpg`, `sky.js`, `terrain-material.js`, `flora.js`, `quality.js`.
