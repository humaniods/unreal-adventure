"""Build Triund game data from OSM trails, AWS Terrain Tiles (SRTM) and Sentinel-2 cloudless 2016.

Outputs (in ../walk-test/):
  triund-data.js   heights (near 8 m, far 100 m), both trails, landmarks, baked terrain light
  sat-near.jpg     satellite colour of the play box (row 0 = north edge)
  sat-far.jpg      satellite colour of the 44 km surroundings

Usage: python3 build.py [--overlay]
"""
import base64, heapq, io, json, math, os, sys, time, urllib.parse, urllib.request
import numpy as np
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "walk-test")
TILES = os.path.join(HERE, "tiles")
SAT = os.path.join(HERE, "sat")
UA = {"User-Agent": "trek-prototype/0.2"}
LAT0, LON0 = 32.2545856, 76.3259043          # Galu Devi Mandir (OSM node 539994189)
KX = math.cos(math.radians(LAT0)) * 111320.0  # metres per degree lon
KY = 110574.0                                 # metres per degree lat
SUN = dict(az=115.0, el=12.0)                 # fixed low morning sun (spec)

def to_local(lat, lon):
    return (lon - LON0) * KX, (lat - LAT0) * KY   # east, north

def to_ll(e, n):
    return LAT0 + n / KY, LON0 + e / KX

def fetch(url, path, tries=4):
    if os.path.exists(path):
        return open(path, "rb").read()
    for k in range(tries):
        try:
            b = urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60).read()
            open(path, "wb").write(b)
            return b
        except Exception as ex:  # transient network errors: back off and retry
            if k == tries - 1:
                raise
            time.sleep(2 ** k)

# ---------------- DEM (terrarium PNG tiles) ----------------
_cache = {}
def dem_tile(z, x, y):
    k = (z, x, y)
    if k not in _cache:
        b = fetch(f"https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png", os.path.join(TILES, f"{z}_{x}_{y}.png"))
        a = np.asarray(Image.open(io.BytesIO(b)).convert("RGB")).astype(np.float64)
        _cache[k] = a[..., 0] * 256 + a[..., 1] + a[..., 2] / 256 - 32768
    return _cache[k]

def merc_px(lat, lon, z):
    n = 2 ** z
    fx = (np.asarray(lon) + 180) / 360 * n * 256
    fy = (1 - np.arcsinh(np.tan(np.radians(np.asarray(lat)))) / np.pi) / 2 * n * 256
    return fx, fy

def bilinear(lat, lon, z, getter):
    """Bilinear sample of a 256 px slippy-map tile set; getter(z, tx, ty) -> 2D or 3D array."""
    lat = np.asarray(lat, float); lon = np.asarray(lon, float)
    fx, fy = merc_px(lat, lon, z); fx = fx - 0.5; fy = fy - 0.5
    x0 = np.floor(fx).astype(int); y0 = np.floor(fy).astype(int)
    tx = fx - x0; ty = fy - y0
    def px(X, Y):
        first = getter(z, int(X.flat[0]) // 256, int(Y.flat[0]) // 256)
        out = np.empty(X.shape + first.shape[2:])
        tX, tY = X // 256, Y // 256
        for key in set(zip(tX.ravel().tolist(), tY.ravel().tolist())):
            m = (tX == key[0]) & (tY == key[1])
            out[m] = getter(z, *key)[Y[m] % 256, X[m] % 256]
        return out
    a = px(x0, y0); b = px(x0 + 1, y0); c = px(x0, y0 + 1); d = px(x0 + 1, y0 + 1)
    if a.ndim > tx.ndim:
        tx = tx[..., None]; ty = ty[..., None]
    return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty

def sample(lat, lon, z):
    return bilinear(lat, lon, z, dem_tile)

def grid(e0, e1, n0, n1, step, z):
    es = np.arange(e0, e1 + 1e-6, step); ns = np.arange(n0, n1 + 1e-6, step)
    E, N = np.meshgrid(es, ns)
    lat, lon = to_ll(E, N)
    return sample(lat, lon, z), len(es), len(ns)

def b64(a, dtype):
    return base64.b64encode(np.ascontiguousarray(a.astype(dtype)).tobytes()).decode()

# ---------------- OSM ways ----------------
WAYS = {}
for fn in ("route.json", "paths.json"):
    for e in json.load(open(os.path.join(HERE, fn)))["elements"]:
        if e["type"] == "way" and "geometry" in e:
            WAYS[e["id"]] = e
KEY = lambda g: (round(g["lat"], 7), round(g["lon"], 7))

def chain_ways(order):
    """Join whole ways end to end (galu relation). Returns [(lat,lon)], [way id per edge]."""
    pts, wid = [], []
    for w in order:
        g = [KEY(p) for p in WAYS[w]["geometry"]]
        if pts:
            if g[0] != pts[-1]:
                if g[-1] == pts[-1]: g = g[::-1]
                else: sys.exit(f"gap before way {w}: {pts[-1]} vs {g[0]}/{g[-1]}")
            g = g[1:]
        elif len(order) > 1:
            nxt = [KEY(p) for p in WAYS[order[1]]["geometry"]]
            if g[0] in (nxt[0], nxt[-1]): g = g[::-1]
        wid += [w] * (len(g) - (0 if pts else 1))
        pts += g
    return pts, wid

def route_waypoints(wps):
    """Shortest path on the cached OSM path network through the given (lat, lon) waypoints."""
    adj, pos = {}, {}
    for w in WAYS.values():
        if w.get("tags", {}).get("highway") not in ("path", "footway", "track", "steps"): continue
        g = [KEY(p) for p in w["geometry"]]
        for p in g: pos[p] = to_local(*p)
        for a, b in zip(g, g[1:]):
            d = math.dist(pos[a], pos[b])
            adj.setdefault(a, []).append((b, d, w["id"])); adj.setdefault(b, []).append((a, d, w["id"]))
    def nearest(ll):
        p = to_local(*ll); n = min(adj, key=lambda k: math.dist(pos[k], p))
        if math.dist(pos[n], p) > 25: sys.exit(f"waypoint {ll} is {math.dist(pos[n], p):.0f} m from the path network")
        return n
    stops = [nearest(w) for w in wps]
    pts, wid = [stops[0]], []
    for s, t in zip(stops, stops[1:]):
        dist, prev, pq = {s: 0.0}, {}, [(0.0, s)]
        while pq:
            d, u = heapq.heappop(pq)
            if u == t: break
            if d > dist[u]: continue
            for v, l, w in adj[u]:
                if d + l < dist.get(v, 1e18): dist[v] = d + l; prev[v] = (u, w); heapq.heappush(pq, (d + l, v))
        if t not in prev: sys.exit(f"no path between waypoints {s} and {t}")
        path, ws = [t], []
        while path[-1] != s: u, w = prev[path[-1]]; ws.append(w); path.append(u)
        pts += path[::-1][1:]; wid += ws[::-1]
    return pts, wid

STEP = 3.0
def build_trail(pts, wid, name, gmax=0.45):
    loc = np.array([to_local(a, b) for a, b in pts])
    seg = np.hypot(*np.diff(loc, axis=0).T); s = np.concatenate([[0], np.cumsum(seg)])
    L = s[-1]
    ss = np.append(np.arange(0, L, STEP), L)
    te = np.interp(ss, s, loc[:, 0]); tn = np.interp(ss, s, loc[:, 1])
    th_raw = sample(*to_ll(te, tn), 15)
    sig = 12 / STEP; k = np.arange(-int(4 * sig), int(4 * sig) + 1); w = np.exp(-k * k / (2 * sig * sig)); w /= w.sum()
    th = np.convolve(np.pad(th_raw, len(k) // 2, mode="edge"), w, mode="valid")
    # DEM is ~30 m; tight switchbacks cross DEM bumps. Relax grades above GMAX by spreading the excess.
    GMAX = gmax
    for _ in range(6000):
        d = np.diff(th) / STEP; bad = np.abs(d) > GMAX
        if not bad.any(): break
        ex = (np.abs(d) - GMAX) * STEP * np.sign(d) * 0.5 * bad
        th[:-1] += ex * 0.5; th[1:] -= ex * 0.5
        th[0] = th_raw[0]; th[-1] = th_raw[-1]
    # OSM surface / difficulty per run of ways
    runs = []
    for i in range(len(wid)):
        t = WAYS[wid[i]].get("tags", {})
        surf = t.get("surface") or ("concrete" if t.get("highway") in ("footway", "steps") else "ground")
        sac = (t.get("sac_scale") or "hiking").split(";")[0]
        if runs and runs[-1]["surface"] == surf and runs[-1]["sac"] == sac: runs[-1]["s1"] = round(float(s[i + 1]), 1)
        else: runs.append(dict(s0=round(float(s[i]), 1), s1=round(float(s[i + 1]), 1), surface=surf, sac=sac))
    # checks: game line vs OSM line
    A, B = loc[:-1], loc[1:]; AB = B - A; l2 = np.maximum((AB * AB).sum(1), 1e-9)
    dev = max(np.hypot(*(A + AB * np.clip(((p - A) * AB).sum(1) / l2, 0, 1)[:, None] - p).T).min() for p in np.stack([te, tn], 1))
    g = np.diff(th) / STEP
    print(f"[{name}] {L:.0f} m, {len(ss)} pts, elev {th[0]:.0f} -> {th[-1]:.0f} m, gain {np.clip(np.diff(th), 0, None).sum():.0f} m, "
          f"grade p50 {np.percentile(g, 50):.2f} p90 {np.percentile(g, 90):.2f} max {g.max():.2f}, max dev from OSM {dev:.2f} m, "
          f"max trail-DEM {np.abs(th - th_raw).max():.1f} m at s {np.abs(th - th_raw).argmax() * STEP:.0f}")
    for r in runs: print(f"    s {r['s0']:7.1f}-{r['s1']:7.1f}  {r['surface']:9s} {r['sac']}")
    assert dev < 0.5, "game trail drifted from the OSM line"
    return dict(step=STEP, len=round(float(L), 1), e=[round(float(v), 1) for v in te], n=[round(float(v), 1) for v in tn],
                h=[round(float(v), 2) for v in th], seg=runs), te, tn

GALU_WAYS = [43100894, 1196379185, 56688112, 537044551]   # OSM relation 15522720 "Galu Devi - Triund"
SHIVA_WPS = [(32.2442429, 76.3347216),   # start of Bhagsu Naag Waterfall Pathway (way 41695722)
             (32.24825, 76.33937),        # Shiva Cafe (node 2386629020)
             (32.24773, 76.35137),        # Karthani (node 673873810)
             (32.2621757, 76.3542851)]    # Triund (node 539994204)
trails, tline = {}, {}
trails["galu"], *tline["galu"] = build_trail(*chain_ways(GALU_WAYS), "galu")
# the Bhagsu side is much steeper (rock steps above the waterfall); a 0.45 cap pulled it 48 m off the DEM
trails["shiva"], *tline["shiva"] = build_trail(*route_waypoints(SHIVA_WPS), "shiva", gmax=0.62)

# ---------------- terrain grids ----------------
NEAR = dict(e0=-900, e1=3700, n0=-1800, n1=2300, step=8)
FAR = dict(e0=-20600, e1=23400, n0=-21500, n1=22500, step=100)
for k, (te, tn) in tline.items():
    out = ((te < NEAR["e0"] + 200) | (te > NEAR["e1"] - 200) | (tn < NEAR["n0"] + 200) | (tn > NEAR["n1"] - 200)).sum()
    assert out == 0, f"{k}: {out} trail samples within 200 m of the near box edge"
near, nnx, nnz = grid(NEAR["e0"], NEAR["e1"], NEAR["n0"], NEAR["n1"], NEAR["step"], 15)
far, fnx, fnz = grid(FAR["e0"], FAR["e1"], FAR["n0"], FAR["n1"], FAR["step"], 12)

def height(e, n):
    """Vectorised height: near grid inside the box, far grid outside."""
    e = np.asarray(e, float); n = np.asarray(n, float)
    def g(G, A, nx, nz):
        fx = np.clip((e - G["e0"]) / G["step"], 0, nx - 1.001); fy = np.clip((n - G["n0"]) / G["step"], 0, nz - 1.001)
        i = fx.astype(int); j = fy.astype(int); tx = fx - i; ty = fy - j
        return (A[j, i] * (1 - tx) + A[j, i + 1] * tx) * (1 - ty) + (A[j + 1, i] * (1 - tx) + A[j + 1, i + 1] * tx) * ty
    inside = (e > NEAR["e0"]) & (e < NEAR["e1"]) & (n > NEAR["n0"]) & (n < NEAR["n1"])
    return np.where(inside, g(NEAR, near, nnx, nnz), g(FAR, far, fnx, fnz))

# ---------------- baked light: cast sun shadow + ambient occlusion ----------------
az, el = math.radians(SUN["az"]), math.radians(SUN["el"])
SD = np.array([math.sin(az), math.cos(az)])      # sun direction on the ground (east, north)
def bake(e0, e1, n0, n1, step, ao_reach):
    es = np.arange(e0, e1 + 1e-6, step); ns = np.arange(n0, n1 + 1e-6, step)
    E, N = np.meshgrid(es, ns); h0 = height(E, N) + 1.5
    tan_el = math.tan(el); best = np.full(E.shape, -9.0)
    d = 12.0
    while d < 9000:
        best = np.maximum(best, (height(E + SD[0] * d, N + SD[1] * d) - h0) / d)
        d *= 1.07
    sun = np.clip((tan_el - best) / 0.06 + 0.5, 0, 1)          # soft penumbra
    hz = np.zeros(E.shape)
    for k in range(8):
        a = k * math.pi / 4; dx, dy = math.sin(a), math.cos(a); m = np.full(E.shape, 0.0)
        d = step
        while d <= ao_reach:
            m = np.maximum(m, (height(E + dx * d, N + dy * d) - h0) / d); d *= 1.6
        hz += np.sin(np.arctan(m))
    ao = np.clip(hz / 8, 0, 1)
    return sun, ao, len(es), len(ns)
t0 = time.time()
sn, an, lnx, lnz = bake(NEAR["e0"], NEAR["e1"], NEAR["n0"], NEAR["n1"], 16, 400)
sf, af, lfx, lfz = bake(FAR["e0"], FAR["e1"], FAR["n0"], FAR["n1"], 100, 2500)
print(f"baked light in {time.time() - t0:.1f}s; near {lnx}x{lnz} sunlit {np.mean(sn > 0.5) * 100:.0f}%, ao mean {an.mean():.2f}; "
      f"far {lfx}x{lfz} sunlit {np.mean(sf > 0.5) * 100:.0f}%, ao mean {af.mean():.2f}")

# ---------------- Sentinel-2 cloudless 2016 (EOX, CC BY 4.0) ----------------
os.makedirs(SAT, exist_ok=True)
_sat = {}
def sat_tile(z, x, y):
    k = (z, x, y)
    if k not in _sat:
        b = fetch(f"https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless_3857/default/g/{z}/{y}/{x}.jpg", os.path.join(SAT, f"{z}_{x}_{y}.jpg"))
        _sat[k] = np.asarray(Image.open(io.BytesIO(b)).convert("RGB")).astype(np.float64)
    return _sat[k]
def sat_image(e0, e1, n0, n1, size, z, path):
    i = (np.arange(size) + 0.5) / size
    E, N = np.meshgrid(e0 + i * (e1 - e0), n1 - i * (n1 - n0))       # row 0 = north edge
    rgb = bilinear(*to_ll(E, N), z, sat_tile)
    img = Image.fromarray(np.clip(rgb, 0, 255).astype(np.uint8))
    img.save(path, quality=86, optimize=True)
    return img
t0 = time.time()
sat_near = sat_image(NEAR["e0"], NEAR["e1"], NEAR["n0"], NEAR["n1"], 1024, 15, os.path.join(OUT, "sat-near.jpg"))
sat_image(FAR["e0"], FAR["e1"], FAR["n0"], FAR["n1"], 1024, 12, os.path.join(OUT, "sat-far.jpg"))
print(f"satellite images in {time.time() - t0:.1f}s ({len(_sat)} tiles)")

# ---------------- landmarks (OSM nodes), projected onto the trail they belong to ----------------
def mark(lat, lon, name, trail):
    e, n = to_local(lat, lon); te, tn = tline[trail]
    d = np.hypot(te - e, tn - n); i = int(d.argmin())
    return dict(name=name, e=round(e, 1), n=round(n, 1), trail=trail, s=round(i * STEP, 1), off=round(float(d[i]), 1),
                ele=round(float(sample(lat, lon, 15)), 1))
marks = {
    "galu": mark(32.2545856, 76.3259043, "Galu Devi Mandir", "galu"),
    "cafeGalu": mark(32.2548298, 76.3260949, "Cafe Galu", "galu"),
    "magic": mark(32.2558247, 76.3427529, "Magic View Cafe", "galu"),
    "triund": mark(32.2621757, 76.3542851, "Triund", "galu"),
    "moolraj": mark(32.2594258, 76.3553301, "Mool Raj Camp", "galu"),
    "lodge": mark(32.2551667, 76.3550393, "Triund Mountain Lodge", "galu"),
    "snowline": mark(32.2741416, 76.361572, "Snowline Cafe", "galu"),
    "hill": mark(32.2702302, 76.3528743, "Triund Hill", "galu"),
    "dharamkot": mark(32.2455318, 76.3259971, "Dharamkot", "galu"),
    "bhagsuTemple": mark(32.24428, 76.33456, "Bhagsu Naag Temple", "shiva"),
    "bhagsuFall": mark(32.24747, 76.33835, "Bhagsunag Waterfall", "shiva"),
    "shivaCafe": mark(32.24825, 76.33937, "Shiva Cafe", "shiva"),
    "karthani": mark(32.24773, 76.35137, "Karthani", "shiva"),
}
for k_, v in marks.items(): print(f"  {k_:13s} {v}")

# ---------------- places: buildings, POIs, streams, waterfalls ----------------
# OSM (ODbL) for named places, building outlines and streams; Microsoft Global ML Building Footprints (ODbL)
# fill in the buildings OSM has not traced. Raw downloads are cached in osm/.
OSMD = os.path.join(HERE, "osm")
LA0, LO0 = to_ll(NEAR["e0"], NEAR["n0"]); LA1, LO1 = to_ll(NEAR["e1"], NEAR["n1"])
BB = f"({LA0:.4f},{LO0:.4f},{LA1:.4f},{LO1:.4f})"
OVERPASS = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter",
            "https://maps.mail.ru/osm/tools/overpass/api/interpreter"]
def osm_json(name, body):
    p = os.path.join(OSMD, name)
    if not os.path.exists(p):
        q = f"[out:json][timeout:120];({body});out geom tags;"
        for rnd in range(4):
            for ep in OVERPASS:
                try:
                    b = urllib.request.urlopen(urllib.request.Request(ep, data=urllib.parse.urlencode({"data": q}).encode(), headers=UA), timeout=180).read()
                    json.loads(b); open(p, "wb").write(b); break
                except Exception as ex:
                    print("  overpass", ep, ex)
            else:
                time.sleep(20 * (rnd + 1)); continue
            break
        else:
            sys.exit(f"could not download {name}")
    return json.load(open(p))["elements"]
os.makedirs(OSMD, exist_ok=True)
POI_EL = osm_json("osm_poi.json", "".join(f'nwr["{k}"]{BB};' for k in ("amenity", "shop", "tourism", "historic", "religion", "leisure"))
                  + f'nwr["natural"="waterfall"]{BB};nwr["waterway"="waterfall"]{BB};')
BLD_EL = osm_json("osm_bld.json", f'way["building"]{BB};relation["building"]{BB};')
WAT_EL = osm_json("osm_water.json", f'way["waterway"]{BB};nwr["natural"="water"]{BB};')
msp = os.path.join(OSMD, "ms_buildings.json")
if not os.path.exists(msp):
    sys.exit("osm/ms_buildings.json missing: filter the Microsoft footprints file for quadkey 123103322 "
             "(https://minedbuildings.z5.web.core.windows.net/global-buildings/dataset-links.csv) to the near box")
MS = json.load(open(msp))

from scipy.spatial import cKDTree
TP = np.concatenate([np.stack(tline[k], 1) for k in tline]); TK = np.concatenate([[k] * len(tline[k][0]) for k in tline])
TT = cKDTree(TP)
def trail_near(e, n):
    d, i = TT.query([e, n]); k = TK[i]; te, tn = tline[k]
    j = int(np.hypot(te - e, tn - n).argmin())
    return float(d), k, j * STEP
def loc_poly(ll):
    P = np.array([to_local(a, b) for a, b in ll])
    if len(P) > 2 and np.allclose(P[0], P[-1]): P = P[:-1]
    return P
def area(P): return 0.5 * abs(np.dot(P[:, 0], np.roll(P[:, 1], 1)) - np.dot(P[:, 1], np.roll(P[:, 0], 1)))
def inside(P, x, y):
    c = False; j = len(P) - 1
    for i in range(len(P)):
        if (P[i, 1] > y) != (P[j, 1] > y) and x < (P[j, 0] - P[i, 0]) * (y - P[i, 1]) / (P[j, 1] - P[i, 1] + 1e-12) + P[i, 0]: c = not c
        j = i
    return c
def seg_dist(P, x, y):
    A = P; B = np.roll(P, -1, 0); AB = B - A; l2 = np.maximum((AB * AB).sum(1), 1e-9)
    t = np.clip(((np.array([x, y]) - A) * AB).sum(1) / l2, 0, 1)
    return float(np.hypot(*(A + AB * t[:, None] - [x, y]).T).min())

# buildings: OSM first, then Microsoft footprints that OSM does not already cover
blds = []
for el in BLD_EL:
    if el["type"] != "way" or "geometry" not in el: continue
    P = loc_poly([(g["lat"], g["lon"]) for g in el["geometry"]]); t = el.get("tags", {})
    blds.append(dict(P=P, src="osm", tag=t.get("building", "yes"), lv=t.get("building:levels"), name=t.get("name", "")))
osm_c = cKDTree([b["P"].mean(0) for b in blds])
n_ms = 0
for poly in MS["polygons"]:
    P = loc_poly(poly); c = P.mean(0)
    if osm_c.query(c)[0] < 6 or any(inside(blds[i]["P"], *c) for i in osm_c.query_ball_point(c, 40)): continue
    blds.append(dict(P=P, src="ms", tag="yes", lv=None, name="")); n_ms += 1
KEEP_R = 260
keep = []
for b in blds:
    P = b["P"]; a = area(P); c = P.mean(0)
    if a < 10 or a > 4000: continue
    d, k, s = trail_near(*c)
    if d > KEEP_R + 30: continue
    # never on the trail itself: drop footprints that cover or touch the walking line
    near_t = TT.query_ball_point(c, float(np.hypot(*(P - c).T).max()) + 2.5)
    if any(inside(P, *TP[i]) or seg_dist(P, *TP[i]) < 2.0 for i in near_t): continue
    b.update(area=a, c=c, d=d); keep.append(b)
print(f"buildings: {len(blds)} candidates ({n_ms} from Microsoft), kept {len(keep)} within {KEEP_R} m of the trails")

def poi_kind(t):
    a, sh, tr = t.get("amenity"), t.get("shop"), t.get("tourism")
    if a == "place_of_worship": return {"buddhist": "monastery", "christian": "church"}.get(t.get("religion"), "temple")
    if t.get("waterway") == "waterfall" or t.get("natural") == "waterfall": return "waterfall"
    if a in ("cafe", "restaurant", "fast_food", "bar") or sh in ("kiosk", "convenience", "tea", "greengrocer", "bakery", "variety_store", "general"): return "cafe"
    if sh: return "shop"
    if tr in ("guest_house", "hotel", "hostel", "apartment", "chalet", "motel"): return "lodge"
    if tr in ("camp_site", "caravan_site"): return "camp"
    if a == "shelter" or tr == "wilderness_hut": return "shelter"
    if a in ("bench", "toilets", "drinking_water"): return a
    if tr == "viewpoint": return "viewpoint"
    if a == "public_bath" or t.get("leisure") == "swimming_pool": return "pool"
    if a in ("waste_disposal", "waste_basket"): return "bin"
    if tr == "information": return "info"
    return None
pois, seen = [], []
for el in POI_EL:
    t = el.get("tags", {}); kd = poi_kind(t)
    if not kd: continue
    if el["type"] == "node": la, lo = el["lat"], el["lon"]
    elif "geometry" in el: la = np.mean([g["lat"] for g in el["geometry"]]); lo = np.mean([g["lon"] for g in el["geometry"]])
    elif "bounds" in el: bb = el["bounds"]; la = (bb["minlat"] + bb["maxlat"]) / 2; lo = (bb["minlon"] + bb["maxlon"]) / 2
    else: continue
    e, n = to_local(la, lo); d, k, s = trail_near(e, n)
    lim = 400 if kd in ("temple", "monastery", "church", "waterfall", "pool") else 120
    if d > lim: continue
    nm = t.get("name:en") or t.get("name") or ""
    if nm and any(nm == q[0] and math.hypot(e - q[1], n - q[2]) < 40 for q in seen): continue
    seen.append((nm, e, n))
    bi = -1
    for i, b in enumerate(keep):
        if math.hypot(*(b["c"] - [e, n])) < 60 and (inside(b["P"], e, n) or seg_dist(b["P"], e, n) < 3):
            bi = i; break
    if bi >= 0 and kd not in ("bench", "bin", "viewpoint", "waterfall"):
        b = keep[bi]
        if not b.get("kind") or kd in ("temple", "monastery", "church"): b["kind"] = kd; b["name"] = b["name"] or nm
    pois.append(dict(name=nm, kind=kd, e=round(e, 1), n=round(n, 1), trail=k, s=round(s, 1), off=round(d, 1), b=bi,
                     ele=round(float(sample(la, lo, 15)), 1), id=f"{el['type'][0]}{el['id']}"))
print(f"POIs: {len(pois)} within reach of the trails; " + ", ".join(f"{k} {sum(p['kind'] == k for p in pois)}" for k in sorted({p['kind'] for p in pois})))

def levels(b, i):
    if b["lv"]:
        try: return max(1, min(6, int(float(b["lv"]))))
        except ValueError: pass
    if b["tag"] in ("hut", "shed", "roof", "temple", "church"): return 1
    a = b["area"]; r = (i * 2654435761 % 1000) / 1000
    if b.get("kind") in ("temple", "monastery", "church"): return 1
    if a < 30: return 1
    if a < 90: return 1 if r < 0.45 else 2
    if a < 220: return 2 if r < 0.55 else 3
    return 3 if r < 0.6 else 4
buildings = []
for i, b in enumerate(keep):
    P = b["P"]
    if len(P) > 24: P = P[::int(math.ceil(len(P) / 24))]
    buildings.append(dict(p=[round(float(v), 1) for v in P.ravel()], lv=levels(b, i), k=b.get("kind") or b["tag"], nm=b.get("name") or "", src=b["src"]))

# streams near the trails (OSM waterway=stream/river), resampled every 5 m
streams = []
for el in WAT_EL:
    t = el.get("tags", {}); w = t.get("waterway")
    if el["type"] != "way" or w not in ("stream", "river") or "geometry" not in el: continue
    P = loc_poly([(g["lat"], g["lon"]) for g in el["geometry"]])
    seg = np.hypot(*np.diff(P, axis=0).T); s = np.concatenate([[0], np.cumsum(seg)])
    if s[-1] < 20: continue
    ss = np.append(np.arange(0, s[-1], 5.0), s[-1]); E = np.interp(ss, s, P[:, 0]); N = np.interp(ss, s, P[:, 1])
    dd = TT.query(np.stack([E, N], 1))[0]
    if dd.min() > 500: continue
    streams.append(dict(name=t.get("name", ""), w=5 if w == "river" else 2.6, p=[round(float(v), 1) for v in np.stack([E, N], 1).ravel()]))
pools = []
for el in POI_EL:
    if el.get("tags", {}).get("leisure") == "swimming_pool" and el["type"] == "way" and "geometry" in el:
        P = loc_poly([(g["lat"], g["lon"]) for g in el["geometry"]]); pools.append(dict(name=el["tags"].get("name", ""), p=[round(float(v), 1) for v in P.ravel()]))
print(f"streams: {len(streams)} ({sum(len(s['p']) // 2 for s in streams)} pts), pools: {len(pools)}")
places = dict(buildings=buildings, pois=pois, streams=streams, pools=pools)

out = dict(
    origin=dict(lat=LAT0, lon=LON0), sun=SUN,
    near=dict(**NEAR, nx=nnx, nz=nnz, scale=0.1, data=b64(np.round(near * 10), "<u2")),
    far=dict(**FAR, nx=fnx, nz=fnz, scale=1, data=b64(np.round(far), "<u2")),
    # sun: 1 = lit by the fixed morning sun, 0 = in a mountain's cast shadow; ao: 0 open sky .. 1 enclosed
    shade=dict(near=dict(e0=NEAR["e0"], n0=NEAR["n0"], step=16, nx=lnx, nz=lnz, sun=b64(np.round(sn * 255), "u1"), ao=b64(np.round(an * 255), "u1")),
               far=dict(e0=FAR["e0"], n0=FAR["n0"], step=100, nx=lfx, nz=lfz, sun=b64(np.round(sf * 255), "u1"), ao=b64(np.round(af * 255), "u1"))),
    sat=dict(near=dict(e0=NEAR["e0"], e1=NEAR["e1"], n0=NEAR["n0"], n1=NEAR["n1"], src="sat-near.jpg"),
             far=dict(e0=FAR["e0"], e1=FAR["e1"], n0=FAR["n0"], n1=FAR["n1"], src="sat-far.jpg")),
    trails=trails, marks=marks, places=places,
    attribution="Map data © OpenStreetMap contributors (ODbL). Building footprints: Microsoft Global ML Building Footprints (ODbL). Elevation: AWS Terrain Tiles (SRTM, NASA; Mapzen). "
                "Imagery: Sentinel-2 cloudless 2016 by EOX IT Services GmbH (contains modified Copernicus Sentinel data 2016), CC BY 4.0.",
)
js = "window.TRIUND_DATA=" + json.dumps(out, separators=(",", ":")) + ";"
open(os.path.join(OUT, "triund-data.js"), "w").write(js)
print(f"near {nnx}x{nnz} range {near.min():.0f}-{near.max():.0f}; far {fnx}x{fnz} range {far.min():.0f}-{far.max():.0f}")
print(f"data.js {len(js) / 1e6:.2f} MB; sat-near {os.path.getsize(os.path.join(OUT, 'sat-near.jpg')) / 1e3:.0f} KB; "
      f"sat-far {os.path.getsize(os.path.join(OUT, 'sat-far.jpg')) / 1e3:.0f} KB")

if "--overlay" in sys.argv:
    im = sat_near.convert("RGB").resize((2048, 2048)); dr = ImageDraw.Draw(im)
    W, Hh = NEAR["e1"] - NEAR["e0"], NEAR["n1"] - NEAR["n0"]
    P = lambda e, n: ((e - NEAR["e0"]) / W * 2048, (NEAR["n1"] - n) / Hh * 2048)
    for k, col in (("galu", (255, 220, 0)), ("shiva", (0, 220, 255))):
        te, tn = tline[k]; dr.line([P(a, b) for a, b in zip(te, tn)], fill=col, width=3)
    for v in marks.values():
        x, y = P(v["e"], v["n"]); dr.ellipse([x - 6, y - 6, x + 6, y + 6], outline=(255, 60, 60), width=2); dr.text((x + 8, y - 6), v["name"], fill=(255, 255, 255))
    im.save(os.path.join(HERE, "overlay.png")); print("overlay.png written")
