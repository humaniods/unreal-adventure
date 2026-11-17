"""Trim Quaternius "Animated Animal Pack" GLBs (CC0, poly.pizza) to the clips the game uses.

Usage: python3 build_animals.py <dir with Husky.glb Shiba.glb Donkey.glb Horse.glb Cow.glb Bull.glb>
Output: ../walk-test/chars/<name>.gltf.json
"""
import os, sys
from build_chars import GLB, read_glb, OUT

KEEP = {"Idle", "Idle_2", "Walk", "Gallop", "Eating", "Idle_2_HeadLow", "Idle_Headlow"}

def trim(src, dst):
    d, bins, _ = read_glb(src)
    g = GLB(); j = g.j
    for k in ("scenes", "scene", "nodes", "materials", "samplers"):
        if k in d: j[k] = d[k]
    j["skins"] = [dict(s, inverseBindMatrices=g.copy_acc(d, bins, s["inverseBindMatrices"])) for s in d.get("skins", [])]
    j["meshes"] = []
    for m in d["meshes"]:
        prims = []
        for p in m["primitives"]:
            p2 = {"attributes": {k: g.copy_acc(d, bins, v, 34962) for k, v in p["attributes"].items() if k in ("POSITION", "NORMAL", "JOINTS_0", "WEIGHTS_0")}}
            if "material" in p: p2["material"] = p["material"]
            if "indices" in p: p2["indices"] = g.copy_acc(d, bins, p["indices"], 34963)
            prims.append(p2)
        j["meshes"].append({"name": m.get("name", ""), "primitives": prims})
    j["animations"] = []
    for a in d.get("animations", []):
        name = a["name"].split("|")[-1]
        if name not in KEEP or any(x["name"] == name for x in j["animations"]): continue
        smp = [{"input": g.copy_acc(d, bins, s["input"]), "output": g.copy_acc(d, bins, s["output"]), "interpolation": s.get("interpolation", "LINEAR")} for s in a["samplers"]]
        j["animations"].append({"name": name, "samplers": smp, "channels": a["channels"]})
    print(os.path.basename(dst), [a["name"] for a in j["animations"]], [m.get("name") for m in j.get("materials", [])])
    g.write(dst)

src = sys.argv[1]
for n in ("Husky", "Shiba", "Donkey", "Horse", "Cow", "Bull"):
    trim(os.path.join(src, n + ".glb"), os.path.join(OUT, n.lower() + ".glb"))
txt = open(os.path.join(OUT, "SOURCES.txt")).read()
if "Animated Animal Pack" not in txt: open(os.path.join(OUT, "SOURCES.txt"), "a").write("Animals (husky, shiba, donkey, horse, cow, bull): Quaternius Animated Animal Pack via poly.pizza, CC0; trimmed by prototype/geo/build_animals.py\n")
