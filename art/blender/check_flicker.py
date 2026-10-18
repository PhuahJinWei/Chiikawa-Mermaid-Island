"""Where a built prop's faces would flicker in the game: pairs of triangles lying in one plane (within
PLANE), facing the same way and overlapping, that differ in colour or belong to meshes drawn together
(its body, glow, inside and board), and that can be seen. The depth buffer cannot tell such faces
apart, so the nearer flickers from one to the other, the more so the further off. A pair counts as
seen unless a ray out from just in front of it first leaves a solid it lies inside, or meets a face
right over it (within COVERED). Reads public/models/props/<kind>.glb; plain Python with numpy, no
Blender. Each place found is given in Blender's frame (x, y = -z of the glTF, z up) with the palette
names of its two colours.

    python art/blender/check_flicker.py [kind ...]      (all props when none is named)
"""

import ast
import glob
import json
import os
import struct
import sys
from collections import defaultdict

import numpy as np

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
PROPS = os.path.join(ROOT, "public", "models", "props")
PLANE = 0.002      # faces this close to one plane count as in it (m)
SHRINK = 0.003     # each triangle shrunk this much before testing, so faces only touching do not count
COLOUR = 0.03      # a difference in any colour channel above this shows
AHEAD, COVERED = 0.003, 0.02
ROLES = ("_glow", "_flame", "_inside", "_far", "_board", "_label")


def load(path):
    b = open(path, "rb").read()
    n = struct.unpack_from("<I", b, 12)[0]
    j = json.loads(b[20:20 + n])
    binary = b[20 + n + 8:]

    def accessor(i):
        a = j["accessors"][i]
        v = j["bufferViews"][a["bufferView"]]
        start = v.get("byteOffset", 0) + a.get("byteOffset", 0)
        comps = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4}[a["type"]]
        dtype = {5126: "<f4", 5125: "<u4", 5123: "<u2", 5121: "u1"}[a["componentType"]]
        size = np.dtype(dtype).itemsize * comps
        stride = v.get("byteStride")
        if stride and stride != size:
            raw = np.frombuffer(binary, dtype="u1", count=a["count"] * stride, offset=start).reshape(-1, stride)[:, :size]
            arr = np.frombuffer(raw.tobytes(), dtype=dtype).reshape(-1, comps)
        else:
            arr = np.frombuffer(binary, dtype=dtype, count=a["count"] * comps, offset=start).reshape(-1, comps)
        if a.get("normalized") and dtype in ("<u2", "u1"):
            arr = arr / (65535.0 if dtype == "<u2" else 255.0)
        return arr.astype(np.float64)

    meshes = []
    for node in j["nodes"]:
        if "mesh" not in node:
            continue
        t = np.array(node.get("translation", [0, 0, 0]), dtype=np.float64)
        for p in j["meshes"][node["mesh"]]["primitives"]:
            pos = accessor(p["attributes"]["POSITION"]) + t
            col = accessor(p["attributes"]["COLOR_0"])[:, :3] if "COLOR_0" in p["attributes"] else np.ones((len(pos), 3))
            idx = accessor(p["indices"]).astype(np.int64).reshape(-1, 3) if "indices" in p else \
                np.arange(len(pos)).reshape(-1, 3)
            meshes.append((node.get("name", "?"), pos, col, idx))
    return meshes


def role(name):
    return next((r[1:] for r in ROLES if r in name), "body")


def palette():
    """Every named colour of the props' build scripts, linear, by name."""
    names = {}
    here = os.path.dirname(os.path.abspath(__file__))
    for script in ("houses.py", "build_village.py", "build_props.py"):
        tree = ast.parse(open(os.path.join(here, script), encoding="utf-8").read())
        for node in tree.body:
            if isinstance(node, ast.Assign) and getattr(node.targets[0], "id", "") == "C":
                for k, v in ast.literal_eval(node.value.generators[0].iter.func.value).items():
                    h = v.lstrip("#")
                    srgb = [int(h[i:i + 2], 16) / 255.0 for i in (0, 2, 4)]
                    names.setdefault(k, np.array([c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
                                                  for c in srgb]))
    return names


NAMES = palette()


def name_of(colour):
    k, v = min(NAMES.items(), key=lambda kv: np.abs(kv[1] - colour).max())
    if np.abs(v - colour).max() < 0.02:
        return k
    srgb = [x * 12.92 if x <= 0.0031308 else 1.055 * x ** (1 / 2.4) - 0.055 for x in colour]
    return "#" + "".join(f"{int(round(min(max(x, 0.0), 1.0) * 255)):02X}" for x in srgb)


def overlap(a, b):
    """Whether two 2D triangles overlap with area (separating axes)."""
    for tri in (a, b):
        for i in range(3):
            e = tri[(i + 1) % 3] - tri[i]
            axis = np.array([-e[1], e[0]])
            pa, pb = a @ axis, b @ axis
            if pa.max() <= pb.min() or pb.max() <= pa.min():
                return False
    return True


def shrink(tri, by):
    c = tri.mean(axis=0)
    return np.array([c + (p - c) * max(0.0, (np.linalg.norm(p - c) - by) / np.linalg.norm(p - c))
                     if np.linalg.norm(p - c) > 0 else c for p in tri])


def clip(subject, clipper):
    """The part of convex polygon `subject` inside convex polygon `clipper` (2D)."""
    def side(a, b, p):
        return (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0])
    sign = 1.0 if sum(side(clipper[0], clipper[i], clipper[i + 1]) for i in range(1, len(clipper) - 1)) > 0 else -1.0
    out = list(subject)
    for i in range(len(clipper)):
        a, b = clipper[i], clipper[(i + 1) % len(clipper)]
        inp, out = out, []
        for j in range(len(inp)):
            p, q = inp[j], inp[(j + 1) % len(inp)]
            sp, sq = sign * side(a, b, p), sign * side(a, b, q)
            if sp >= 0:
                out.append(p)
            if (sp >= 0) != (sq >= 0):
                out.append(p + (q - p) * (sp / (sp - sq)))
        if not out:
            break
    return out


def first_hit(origin, direction, tris, nrm):
    """The nearest triangle a ray meets: its distance and its normal's dot with the ray, or None."""
    v0 = tris[:, 0]
    e1, e2 = tris[:, 1] - v0, tris[:, 2] - v0
    pvec = np.cross(direction, e2)
    det = np.einsum("ij,ij->i", e1, pvec)
    good = np.abs(det) > 1e-9
    inv = np.zeros_like(det)
    inv[good] = 1.0 / det[good]
    tvec = origin - v0
    u = np.einsum("ij,ij->i", tvec, pvec) * inv
    qvec = np.cross(tvec, e1)
    v = np.einsum("j,ij->i", direction, qvec) * inv
    t = np.einsum("ij,ij->i", e2, qvec) * inv
    hit = good & (u >= 0) & (v >= 0) & (u + v <= 1) & (t > 1e-6)
    if not hit.any():
        return None
    i = np.nonzero(hit)[0][np.argmin(t[hit])]
    return t[i], float(nrm[i] @ direction)


def seen(points, n, tris, nrm):
    for p in points:
        hit = first_hit(p + n * AHEAD, n, tris, nrm)
        if hit is None or (hit[1] <= 0 and hit[0] >= COVERED):
            return True
    return False


def scan(path):
    tris, cols, owners = [], [], []
    for name, pos, col, idx in load(path):
        r = role(name)
        if r == "label":   # the game draws painted words pulled forward in the depth test
            continue
        for f in idx:
            tris.append(pos[f])
            cols.append(col[f].mean(axis=0))
            owners.append(r)
    tris, cols = np.array(tris), np.array(cols)
    nrm = np.cross(tris[:, 1] - tris[:, 0], tris[:, 2] - tris[:, 0])
    area = np.linalg.norm(nrm, axis=1) / 2
    ok = area > 1e-6
    nrm[ok] /= (2 * area[ok])[:, None]
    d = np.einsum("ij,ij->i", nrm, tris[:, 0])
    groups = defaultdict(list)
    for i in np.nonzero(ok)[0]:
        groups[(tuple(np.round(nrm[i], 2)), int(np.floor(d[i] / PLANE)))].append(i)
    places = defaultdict(list)
    done = set()
    for (n_key, d_bin), members in groups.items():
        cand = members + groups.get((n_key, d_bin + 1), [])
        if len(cand) < 2:
            continue
        n = np.array(n_key) / np.linalg.norm(n_key)
        u = np.cross(n, [0, 0, 1] if abs(n[2]) < 0.9 else [1, 0, 0])
        u /= np.linalg.norm(u)
        v = np.cross(n, u)
        flat = {i: shrink(np.stack([tris[i] @ u, tris[i] @ v], axis=1), SHRINK) for i in cand}
        lo = {i: flat[i].min(axis=0) for i in cand}
        hi = {i: flat[i].max(axis=0) for i in cand}
        order = sorted(cand, key=lambda i: lo[i][0])
        for a, i in enumerate(order):
            for k in order[a + 1:]:
                if lo[k][0] >= hi[i][0]:
                    break
                if lo[k][1] >= hi[i][1] or hi[k][1] <= lo[i][1] or abs(d[i] - d[k]) > PLANE or (i, k) in done:
                    continue
                done.add((i, k))
                if "far" in (owners[i], owners[k]) and owners[i] != owners[k]:
                    continue     # the far version is never drawn with the rest
                if owners[i] == owners[k] and np.abs(cols[i] - cols[k]).max() <= COLOUR:
                    continue     # one colour in one mesh: nothing to see
                if not overlap(flat[i], flat[k]):
                    continue
                poly = clip(list(flat[i]), list(flat[k]))
                if len(poly) < 3:
                    continue
                c = np.mean(poly, axis=0)
                front = max(d[i], d[k])
                points = [p[0] * u + p[1] * v + n * front for p in [c] + [c + (q - c) * 0.7 for q in poly]]
                if seen(points, n, tris, nrm):
                    a_name = f"{owners[i]}:{name_of(cols[i])}"
                    b_name = f"{owners[k]}:{name_of(cols[k])}"
                    places[tuple(sorted((a_name, b_name)))].append(np.vstack([tris[i], tris[k]]))
    return len(tris), places


if __name__ == "__main__":
    kinds = sys.argv[1:] or sorted(os.path.splitext(os.path.basename(p))[0] for p in glob.glob(os.path.join(PROPS, "*.glb")))
    for kind in kinds:
        path = kind if kind.endswith(".glb") else os.path.join(PROPS, f"{kind}.glb")
        count, places = scan(path)
        pairs = sum(len(v) for v in places.values())
        print(f"{kind}: {count} triangles, {pairs} pairs of faces that would flicker")
        for (a, b), found in sorted(places.items(), key=lambda kv: -len(kv[1])):
            p = np.vstack(found)
            lo, hi = p.min(axis=0), p.max(axis=0)
            print(f"  {len(found):4d}  {a}  vs  {b}   x {lo[0]:+.2f}..{hi[0]:+.2f}  y {-hi[2]:+.2f}..{-lo[2]:+.2f}"
                  f"  z {lo[1]:+.2f}..{hi[1]:+.2f}")
