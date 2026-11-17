"""Build web-ready hiker character GLBs for the Triund walk test from Quaternius CC0 packs.

Inputs (download from quaternius.itch.io, CC0, extract anywhere):
  Universal Base Characters [Standard]   (Superhero_Male/Female_FullBody.gltf + textures, hairstyles)
  Universal Animation Library [Standard] (UAL1_Standard.glb, same skeleton bone names)

Outputs (../walk-test/chars/):
  hiker_m.gltf.json, hiker_f.gltf.json  body mesh + skeleton + the clips the game uses, textures as small JPEGs,
                            unused vertex attributes dropped
  hair.gltf.json            static hair meshes in bind-pose space (attached to the Head bone at runtime)

Usage: python3 build_chars.py <UBC dir> <UAL dir>
"""
import io, json, os, struct, sys
import numpy as np
from PIL import Image

UBC, UAL = (sys.argv[1], sys.argv[2]) if len(sys.argv) > 2 and __name__ == "__main__" else (None, None)
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "walk-test", "chars")
os.makedirs(OUT, exist_ok=True)
CLIPS = ["Idle_Loop", "Walk_Loop", "Jog_Fwd_Loop", "Sitting_Idle_Loop", "Sitting_Talking_Loop", "Idle_Talking_Loop", "Interact", "PickUp_Table"]
KEEP_ATTR = {"POSITION", "NORMAL", "TEXCOORD_0", "JOINTS_0", "WEIGHTS_0"}
CT = {5120: "b", 5121: "B", 5122: "h", 5123: "H", 5125: "I", 5126: "f"}
NC = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4, "MAT4": 16}


def read_gltf(path):
    d = json.load(open(path)); base = os.path.dirname(path)
    bins = [open(os.path.join(base, b["uri"]), "rb").read() for b in d["buffers"]]
    return d, bins, base


def read_glb(path):
    f = open(path, "rb").read(); l = struct.unpack("<I", f[12:16])[0]
    d = json.loads(f[20:20 + l]); o = 20 + l; bl = struct.unpack("<I", f[o:o + 4])[0]
    return d, [f[o + 8:o + 8 + bl]], None


def acc_bytes(d, bins, i):
    """Tightly packed bytes of accessor i."""
    a = d["accessors"][i]; bv = d["bufferViews"][a["bufferView"]]
    comp = np.dtype("<" + CT[a["componentType"]]); n = NC[a["type"]]
    stride = bv.get("byteStride", comp.itemsize * n); off = bv.get("byteOffset", 0) + a.get("byteOffset", 0)
    raw = bins[bv["buffer"]]
    if stride == comp.itemsize * n:
        return raw[off:off + a["count"] * stride]
    arr = np.frombuffer(raw, np.uint8)[off:off + a["count"] * stride].reshape(a["count"], stride)[:, :comp.itemsize * n]
    return arr.tobytes()


class GLB:
    def __init__(self):
        self.j = {"asset": {"version": "2.0", "generator": "triund build_chars.py"}, "buffers": [{"byteLength": 0}], "bufferViews": [], "accessors": []}
        self.bin = bytearray()

    def view(self, data, target=None):
        while len(self.bin) % 4: self.bin.append(0)
        v = {"buffer": 0, "byteOffset": len(self.bin), "byteLength": len(data)}
        if target: v["target"] = target
        self.bin += data; self.j["bufferViews"].append(v); return len(self.j["bufferViews"]) - 1

    def copy_acc(self, d, bins, i, target=None):
        a = dict(d["accessors"][i]); a.pop("byteOffset", None); a.pop("sparse", None)
        a["bufferView"] = self.view(acc_bytes(d, bins, i), target); self.j["accessors"].append(a)
        return len(self.j["accessors"]) - 1

    def image(self, path, size, quality=82, name=None):
        im = Image.open(path).convert("RGB")
        if size: im = im.resize((size, size), Image.LANCZOS)
        b = io.BytesIO(); im.save(b, "JPEG", quality=quality, optimize=True)
        self.j.setdefault("images", []).append({"bufferView": self.view(b.getvalue()), "mimeType": "image/jpeg", "name": name or os.path.basename(path)})
        self.j.setdefault("samplers", [{"magFilter": 9729, "minFilter": 9987, "wrapS": 10497, "wrapT": 10497}])
        self.j.setdefault("textures", []).append({"sampler": 0, "source": len(self.j["images"]) - 1})
        return len(self.j["textures"]) - 1

    def write(self, path):
        while len(self.bin) % 4: self.bin.append(0)
        self.j["buffers"][0]["byteLength"] = len(self.bin)
        js = json.dumps(self.j, separators=(",", ":")).encode()
        while len(js) % 4: js += b" "
        # the artifact host does not serve .glb, so write glTF JSON with the buffer embedded (<name>.gltf.json)
        import base64
        j = dict(self.j); j["buffers"] = [{"byteLength": len(self.bin), "uri": "data:application/octet-stream;base64," + base64.b64encode(bytes(self.bin)).decode()}]
        path = path[:-4] + ".gltf.json" if path.endswith(".glb") else path
        out = json.dumps(j, separators=(",", ":"))
        open(path, "w").write(out); print(f"  {os.path.basename(path)}: {len(out) / 1e6:.2f} MB")


def tex_path(base, uri):
    p = os.path.join(base, uri)
    if not os.path.exists(p): p = os.path.join(base, uri.replace("_png.png", ".png"))
    return p


def build_char(gltf_path, skin_tex, out_name, ual):
    d, bins, base = read_gltf(gltf_path)
    g = GLB(); j = g.j
    j["nodes"] = [{k: v for k, v in n.items()} for n in d["nodes"]]
    j["scenes"] = d["scenes"]; j["scene"] = d.get("scene", 0)
    # skins
    j["skins"] = []
    for s in d["skins"]:
        s2 = dict(s); s2["inverseBindMatrices"] = g.copy_acc(d, bins, s["inverseBindMatrices"]); j["skins"].append(s2)
    # materials: body / eyes / brows; textures as small JPEGs, no roughness map
    tex_cache = {}
    def tex(idx, size, q=82):
        src = d["images"][d["textures"][idx]["source"]]
        p = tex_path(base, src["uri"])
        if "Superhero" in p and "BaseColor" not in p and "Normal" not in p and "Roughness" not in p: p = os.path.join(base, skin_tex)
        if (p, size) not in tex_cache: tex_cache[(p, size)] = g.image(p, size, q)
        return tex_cache[(p, size)]
    j["materials"] = []
    for m in d["materials"]:
        pb = m["pbrMetallicRoughness"]; body = "Superhero" in m["name"]
        m2 = {"name": m["name"], "doubleSided": m.get("doubleSided", False),
              "pbrMetallicRoughness": {"baseColorTexture": {"index": tex(pb["baseColorTexture"]["index"], 1024 if body else 256)},
                                       "metallicFactor": 0, "roughnessFactor": 0.78 if body else pb.get("roughnessFactor", 0.6)}}
        if body and "normalTexture" in m: m2["normalTexture"] = {"index": tex(m["normalTexture"]["index"], 1024, 88)}
        if "Hair" in m["name"]: m2["alphaMode"] = "MASK"; m2["alphaCutoff"] = 0.4
        j["materials"].append(m2)
    # meshes (drop unused attributes)
    j["meshes"] = []
    for m in d["meshes"]:
        prims = []
        for p in m["primitives"]:
            at = {k: g.copy_acc(d, bins, v, 34962) for k, v in p["attributes"].items() if k in KEEP_ATTR}
            p2 = {"attributes": at, "material": p.get("material", 0)}
            if "indices" in p: p2["indices"] = g.copy_acc(d, bins, p["indices"], 34963)
            prims.append(p2)
        j["meshes"].append({"name": m["name"], "primitives": prims})
    # animations from the library, retargeted by bone name
    ud, ubins, _ = ual
    name2idx = {n["name"]: i for i, n in enumerate(j["nodes"])}
    j["animations"] = []
    for a in ud["animations"]:
        if a["name"] not in CLIPS: continue
        samplers, chans = [], []
        for c in a["channels"]:
            nm = ud["nodes"][c["target"]["node"]]["name"]
            if nm not in name2idx or nm in ("Armature",): continue
            s = a["samplers"][c["sampler"]]
            samplers.append({"input": g.copy_acc(ud, ubins, s["input"]), "output": g.copy_acc(ud, ubins, s["output"]), "interpolation": s.get("interpolation", "LINEAR")})
            chans.append({"sampler": len(samplers) - 1, "target": {"node": name2idx[nm], "path": c["target"]["path"]}})
        j["animations"].append({"name": a["name"].replace("_Loop", ""), "samplers": samplers, "channels": chans})
    print(f"{out_name}: {len(j['animations'])} clips {[a['name'] for a in j['animations']]}")
    g.write(os.path.join(OUT, out_name))


def build_hair(files, out_name):
    g = GLB(); j = g.j; j["nodes"] = []; j["meshes"] = []; j["materials"] = []; tex_cache = {}
    for f in files:
        d, bins, base = read_gltf(f)
        m = d["meshes"][0]; p = m["primitives"][0]; mat = d["materials"][p["material"]]
        bc = tex_path(base, d["images"][d["textures"][mat["pbrMetallicRoughness"]["baseColorTexture"]["index"]]["source"]]["uri"])
        if bc not in tex_cache: tex_cache[bc] = g.image(bc, 512, 85)
        j["materials"].append({"name": os.path.basename(f), "doubleSided": True, "alphaMode": "MASK", "alphaCutoff": 0.35,
                               "pbrMetallicRoughness": {"baseColorTexture": {"index": tex_cache[bc]}, "metallicFactor": 0, "roughnessFactor": 0.75}})
        at = {k: g.copy_acc(d, bins, v, 34962) for k, v in p["attributes"].items() if k in ("POSITION", "NORMAL", "TEXCOORD_0")}
        p2 = {"attributes": at, "material": len(j["materials"]) - 1}
        if "indices" in p: p2["indices"] = g.copy_acc(d, bins, p["indices"], 34963)
        j["meshes"].append({"name": m["name"], "primitives": [p2]})
        j["nodes"].append({"name": os.path.splitext(os.path.basename(f))[0], "mesh": len(j["meshes"]) - 1})
    j["scenes"] = [{"nodes": list(range(len(j["nodes"])))}]; j["scene"] = 0
    g.write(os.path.join(OUT, out_name))


if __name__ == "__main__":
    ual = read_glb(os.path.join(UAL, "Unreal-Godot", "UAL1_Standard.glb"))
    bc = os.path.join(UBC, "Base Characters", "Godot - UE")
    build_char(os.path.join(bc, "Superhero_Male_FullBody.gltf"), "T_Superhero_Male_Dark.png", "hiker_m.glb", ual)
    build_char(os.path.join(bc, "Superhero_Female_FullBody.gltf"), "T_Superhero_Female_Dark_BaseColor.png", "hiker_f.glb", ual)
    hd = os.path.join(UBC, "Hairstyles", "Origin at 0", "glTF (Godot)")
    build_hair([os.path.join(hd, f) for f in ("Hair_SimpleParted.gltf", "Hair_Buzzed.gltf", "Hair_Beard.gltf", "Hair_Long.gltf")], "hair.glb")
    open(os.path.join(OUT, "SOURCES.txt"), "w").write(
        "Characters, hairstyles and animations: Quaternius (quaternius.com), CC0.\n"
        "Universal Base Characters [Standard] + Universal Animation Library [Standard], rebuilt by prototype/geo/build_chars.py\n")
