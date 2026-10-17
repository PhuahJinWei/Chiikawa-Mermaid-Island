"""The jungle's plants, after the film's jungle frames (`chiikawa 2`, `11`, `13`, `15` and the
October screenshots) and the dense rounded canopy of its aerial shot.

Every builder returns (bmesh, colours, sway): one colour and one sway weight per vertex. Sway is 0
where a plant is rooted and 1 at its tips; the game moves vertices in the wind by it. Plants are
built at the origin in Blender's coordinates (Z up) and are light enough to stand by the hundred:
the canopy comes in clumps of trees whose crowns are fused into one soft mass. Canopy clumps and
palms also come as a light far version, for patches of jungle far from the camera.
"""

import math

import bmesh
import numpy as np
from mathutils import Matrix, Vector

import build_props as P
import charlib as L

C = {k: np.array(L.hex_color(v)[:3]) for k, v in {
    "leaf": "#4DB35A",
    "leafLight": "#7CCB5E",
    "leafDark": "#2F7F3E",
    "canopy": "#55AE4E",
    "canopyLight": "#86CC5F",
    "canopyDark": "#2E7A3B",
    "trunk": "#8A6440",
    "trunkLight": "#A47B52",
    "palmTrunkA": "#A47B52",
    "palmTrunkB": "#7E5A3A",
    "fern": "#5DBB54",
    "fernDark": "#3E9645",
    "monstera": "#3E9B4C",
    "monsteraLight": "#5DB75A",
    "crop": "#7DBE4C",
    "cropDark": "#5A9E3A",
    "cycad": "#4F9E45",
    "cycadLight": "#6EB85A",
    "cycadTrunk": "#7A6A4E",
    "ti": "#B63A4E",
    "tiDark": "#7E2A48",
    "tiGreen": "#6E8F3E",
    "brom": "#7BB84E",
    "bromRed": "#E0483C",
    "bromOrange": "#F28A3A",
    "bigTrunk": "#9C744A",
    "bigTrunkDark": "#7A5636",
    "vine": "#5E9E3E",
    "purple": "#9C6BD6",
    "white": "#FFFFFF",
    "yellow": "#F7D046",
    "red": "#EE5A4E",
    "pink": "#F7A1C4",
    "centre": "#F9E27A",
}.items()}

UP = Vector((0.0, 0.0, 1.0))


def lerp(a, b, t):
    return a + (b - a) * t


def smoothstep(a, b, x):
    t = min(max((x - a) / (b - a), 0.0), 1.0)
    return t * t * (3.0 - 2.0 * t)


def leafy(bm, base, top, light, mid, dark, seed=0.0):
    """Colours for a mass of leaves: light on top, dark underneath, in soft patches."""
    bm.normal_update()
    cols = []
    for v in bm.verts:
        up = v.normal.z
        n = 0.5 + 0.5 * math.sin(v.co.x * 0.7 + seed) * math.sin(v.co.y * 0.6 - seed * 0.7)
        c = lerp(mid, light, smoothstep(0.35, 0.95, up))
        c = lerp(c, dark, max(smoothstep(0.1, -0.55, up), 0.4 * smoothstep(0.6, 0.9, n)))
        cols.append(c)
    return cols


def merge(pieces):
    """Join (bmesh, colours, sway) pieces into one."""
    out, cols, sway = bmesh.new(), [], []
    for bm, c, s in pieces:
        L.append_bm(out, bm)
        cols.extend(c)
        sway.extend(s)
        bm.free()
    return out, cols, sway


def trunk_bm(base, top, r0, r1, segments=6, rings=2, bend=(0.0, 0.0)):
    """A tapering trunk from base to top, bending a little sideways in the middle."""
    bm = bmesh.new()
    rows = []
    for i in range(rings + 1):
        t = i / rings
        c = base.lerp(top, t) + Vector((bend[0], bend[1], 0.0)) * math.sin(math.pi * t)
        r = lerp(r0, r1, t)
        rows.append([bm.verts.new(c + Vector((r * math.cos(2 * math.pi * k / segments),
                                              r * math.sin(2 * math.pi * k / segments), 0.0)))
                     for k in range(segments)])
    for a, b in zip(rows, rows[1:]):
        for k in range(segments):
            j = (k + 1) % segments
            bm.faces.new((a[k], a[j], b[j], b[k]))
    # No caps: the foot is under the ground and the top inside the crown.
    bm.normal_update()
    if bm.faces[:][0].normal.dot(bm.faces[:][0].calc_center_median() - (base + top) * 0.5) < 0:
        bmesh.ops.reverse_faces(bm, faces=bm.faces[:])
    return bm


def blade_bm(centre, side, width, rows, thickness=0.03):
    """A light frond: a solid blade three vertices across, drooping at its edges, with a sawtooth
    edge every other row."""
    bm = bmesh.new()
    rings = []
    for i in range(rows + 1):
        s = 0.04 + 0.96 * i / rows
        c = centre(s)
        tangent = (centre(min(1.0, s + 0.01)) - centre(max(0.0, s - 0.01))).normalized()
        normal = tangent.cross(side).normalized()
        if normal.z < 0:
            normal = -normal
        half = width * math.sin(math.pi * s) ** 0.7 * (1.0 if i % 2 == 0 else 0.6)
        droop = -UP * (0.3 * half)
        rings.append([bm.verts.new(c + side * half + droop), bm.verts.new(c + normal * (thickness * (1.0 - 0.8 * s))),
                      bm.verts.new(c - side * half + droop)])
    for a, b in zip(rings, rings[1:]):
        for k in range(3):
            bm.faces.new((a[k], a[(k + 1) % 3], b[(k + 1) % 3], b[k]))
    bm.faces.new(rings[0])
    bm.faces.new(list(reversed(rings[-1])))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    return bm


# ---------------------------------------------------------------------------- placing
def to_arrays(built):
    """A built plant as arrays: vertices, faces, colours (RGB) and sway weights."""
    bm, cols, sway = built
    bm.verts.index_update()
    verts = np.array([v.co[:] for v in bm.verts], dtype=float)
    faces = [tuple(v.index for v in f.verts) for f in bm.faces]
    out = (verts, faces, np.array([c[:3] for c in cols], dtype=float), np.array(sway, dtype=float))
    bm.free()
    return out


class Patchwork:
    """Plants gathered into meshes, one for each square patch of the map, so the game can leave
    out patches it is not looking at."""

    def __init__(self, x0, z0, size, patches):
        self.x0, self.z0, self.size, self.patches = x0, z0, size, patches
        self.parts = {}

    def add(self, arrays, x, z, y, turn=0.0, scale=1.0):
        """Plant a copy at game (x, z) on ground height y, turned about the vertical and scaled."""
        verts, faces, cols, sway = arrays
        c, s = math.cos(turn), math.sin(turn)
        rot = np.array([[c, -s, 0.0], [s, c, 0.0], [0.0, 0.0, 1.0]])
        moved = verts @ rot.T * scale + np.array([x, -z, y])
        i = min(max(int((x - self.x0) / self.size * self.patches), 0), self.patches - 1)
        j = min(max(int((z - self.z0) / self.size * self.patches), 0), self.patches - 1)
        part = self.parts.setdefault((i, j), {"verts": [], "faces": [], "cols": [], "sway": [], "count": 0})
        offset = part["count"]
        part["verts"].append(moved)
        part["faces"].extend(tuple(k + offset for k in f) for f in faces)
        part["cols"].append(cols)
        part["sway"].append(sway)
        part["count"] += len(verts)

    def objects(self, name, collection):
        """One object per patch with plants in it, with its colours and sway weights."""
        import bpy  # noqa: PLC0415
        out = []
        for (i, j), part in sorted(self.parts.items()):
            verts = np.concatenate(part["verts"])
            mesh = bpy.data.meshes.new(f"{name}_{i}_{j}")
            mesh.from_pydata(verts.tolist(), [], part["faces"])
            cols = np.concatenate(part["cols"])
            rgba = np.concatenate([cols, np.ones((len(cols), 1))], axis=1).ravel()
            col = mesh.color_attributes.new("Col", "FLOAT_COLOR", "POINT")
            col.data.foreach_set("color", rgba)
            mesh.color_attributes.active_color = col
            try:
                mesh.color_attributes.render_color_index = mesh.color_attributes.active_color_index
            except AttributeError:
                pass
            mesh.attributes.new("_sway", "FLOAT", "POINT").data.foreach_set("value", np.concatenate(part["sway"]))
            mesh.shade_smooth()
            obj = bpy.data.objects.new(f"{name}_{i}_{j}", mesh)
            collection.objects.link(obj)
            out.append(obj)
        return out


class Variants:
    """Plants planted many times (palms, the understory, crops): each shape kept once, and a list of
    where each copy stands, for the game to join at load."""

    def __init__(self):
        self.shapes = []      # (name, arrays)
        self.placed = {}      # layer -> [[shape, x, y, z, turn, scale], ...] in game coordinates

    def shape(self, name, arrays):
        self.shapes.append((name, arrays))
        return len(self.shapes) - 1

    def plant(self, layer, index, x, y, z, turn, scale, far=None):
        """Plant shape `index` at game (x, z) on height y, turned about the vertical and scaled; a
        palm also names its far shape."""
        entry = [index, round(x, 2), round(y, 3), round(z, 2), round(turn, 3), round(scale, 3)]
        if far is not None:
            entry.append(far)
        self.placed.setdefault(layer, []).append(entry)

    def objects(self, collection):
        """An object for each shape, named v<index>, with its colours and sway weights."""
        import bpy  # noqa: PLC0415
        out = []
        for i, (name, (verts, faces, cols, sway)) in enumerate(self.shapes):
            mesh = bpy.data.meshes.new(f"v{i}")
            mesh.from_pydata(verts.tolist(), [], faces)
            rgba = np.concatenate([cols, np.ones((len(cols), 1))], axis=1).ravel()
            col = mesh.color_attributes.new("Col", "FLOAT_COLOR", "POINT")
            col.data.foreach_set("color", rgba)
            mesh.color_attributes.active_color = col
            try:
                mesh.color_attributes.render_color_index = mesh.color_attributes.active_color_index
            except AttributeError:
                pass
            mesh.attributes.new("_sway", "FLOAT", "POINT").data.foreach_set("value", sway)
            mesh.shade_smooth()
            obj = bpy.data.objects.new(f"v{i}", mesh)
            collection.objects.link(obj)
            out.append(obj)
        return out


# ---------------------------------------------------------------------------- canopy
def clump(rng, trees, target=None):
    """A clump of canopy trees: `trees` is a list of (x, y, height, base) for each, relative to
    the clump's middle and the ground there. Their round crowns are fused into one soft mass over
    bare trunks. Returns the plant, and each crown as (x, y, z, radius)."""
    blobs, pieces, crowns = [], [], []
    for x, y, height, base in trees:
        crown_z = base + height * 0.62
        r = height * 0.4
        lean = (rng.uniform(-0.4, 0.4), rng.uniform(-0.4, 0.4))
        trunk = trunk_bm(Vector((x, y, base - 0.4)), Vector((x + lean[0], y + lean[1], crown_z + r * 0.2)),
                         0.32 * height / 8.0 + 0.1, 0.18 * height / 8.0 + 0.06,
                         bend=(rng.uniform(-0.3, 0.3), rng.uniform(-0.3, 0.3)))
        pieces.append((trunk, [lerp(C["trunk"], C["trunkLight"], 0.5 + 0.5 * math.sin(v.co.z * 2.0))
                               for v in trunk.verts], [smoothstep(base, crown_z * 1.4, v.co.z) * 0.3 for v in trunk.verts]))
        cx, cy, cz = x + lean[0], y + lean[1], crown_z + r * 0.55
        crowns.append((cx, cy, cz, r * 1.05))
        blobs.append(L.ellipsoid_bm(Vector((cx, cy, cz)), (r, r, r * 0.8), u=12, v=8))
        for _ in range(int(rng.integers(2, 4))):
            a = rng.uniform(0.0, 2.0 * math.pi)
            d = r * rng.uniform(0.45, 0.75)
            rr = r * rng.uniform(0.55, 0.75)
            blobs.append(L.ellipsoid_bm(Vector((cx + d * math.cos(a), cy + d * math.sin(a),
                                                cz + rng.uniform(-0.25, 0.35) * r)), (rr, rr, rr * 0.8), u=10, v=7))
    size = max(max(abs(x), abs(y)) for x, y, _, _ in trees) + max(h for _, _, h, _ in trees) * 0.4
    mass = L.fuse(blobs, voxel=max(0.22, size * 0.03), smooth_iterations=6, smooth_lambda=0.8,
                  target_tris=target or (50 + 45 * len(trees)))
    seed = rng.uniform(0, 6)
    cols = leafy(mass, 0.0, 0.0, C["canopyLight"], C["canopy"], C["canopyDark"], seed=seed)
    low = min(c[2] for c in crowns)
    sway = [0.55 + 0.45 * smoothstep(0.0, 1.0, (v.co.z - low + 2.0) / 6.0) for v in mass.verts]
    # The far version: the crowns as one coarse soft mass, without trunks.
    far = L.fuse([L.ellipsoid_bm(Vector((cx, cy, cz)), (r * 1.05, r * 1.05, r * 0.85), u=8, v=5) for cx, cy, cz, r in crowns],
                 voxel=max(0.4, size * 0.06), smooth_iterations=4, smooth_lambda=0.8, target_tris=18 + 8 * len(trees))
    far_cols = leafy(far, 0.0, 0.0, C["canopyLight"], C["canopy"], C["canopyDark"], seed=seed)
    pieces.append((mass, cols, sway))
    return merge(pieces), crowns, (far, far_cols, [0.6] * len(far.verts))


# ---------------------------------------------------------------------------- palms
def jungle_palm(rng, height):
    """A slim jungle palm with a ringed trunk, light enough to plant by the dozen."""
    lean = rng.uniform(0.08, 0.2)
    n = 5
    pts = [Vector((math.sin(t * math.pi * 0.5) * lean * height, 0.0, t * height)) for t in (i / n for i in range(n + 1))]
    pieces = []
    for i in range(n):
        seg = P.segment_bm(pts[i], pts[i + 1], 0.2 - 0.07 * i / n, 0.19 - 0.07 * i / n, segments=6)
        colour = C["palmTrunkA"] if i % 2 else C["palmTrunkB"]
        pieces.append((seg, [colour] * len(seg.verts), [0.15 * i / n] * len(seg.verts)))
    top = pts[-1]
    fronds = 6
    for k in range(fronds):
        theta = (k / fronds) * 2 * math.pi + rng.uniform(-0.2, 0.2)
        d = Vector((math.cos(theta), math.sin(theta), 0.0))
        side = Vector((-math.sin(theta), math.cos(theta), 0.0))
        length = rng.uniform(2.0, 2.6)

        def centre(s, d=d, length=length):
            return top + d * (s * length) + UP * (0.45 * math.sin(s * math.pi * 0.6) - 1.3 * s * s)

        frond = blade_bm(centre, side, 0.55, rows=5, thickness=0.05)
        cols = [C["leaf"] if k % 2 else C["leafLight"]] * len(frond.verts)
        sway = [0.4 + 0.6 * min(1.0, (v.co - top).length / length) for v in frond.verts]
        pieces.append((frond, cols, sway))
    # The far version: a plain trunk and five short fronds.
    far = [(P.segment_bm(pts[0], top, 0.19, 0.13, segments=4), C["palmTrunkB"])]
    for k in range(5):
        theta = 2 * math.pi * k / 5
        d = Vector((math.cos(theta), math.sin(theta), 0.0))
        side = Vector((-math.sin(theta), math.cos(theta), 0.0))

        def centre(s, d=d):
            return top + d * (s * 2.3) + UP * (0.4 * math.sin(s * math.pi * 0.6) - 1.2 * s * s)

        far.append((blade_bm(centre, side, 0.6, rows=3, thickness=0.06), C["leaf"]))
    far_bm = bmesh.new()
    far_cols = []
    for bm, colour in far:
        L.append_bm(far_bm, bm)
        far_cols.extend([colour] * len(bm.verts))
        bm.free()
    return merge(pieces), (far_bm, far_cols, [0.5] * len(far_cols))


# ---------------------------------------------------------------------------- understory
def fern(rng):
    """A fern: five arching fronds from the ground."""
    pieces = []
    count = 5
    for k in range(count):
        theta = 2 * math.pi * k / count + rng.uniform(-0.3, 0.3)
        d = Vector((math.cos(theta), math.sin(theta), 0.0))
        side = Vector((-math.sin(theta), math.cos(theta), 0.0))
        length = rng.uniform(0.8, 1.15)

        def centre(s, d=d, length=length):
            return d * (s * length) + UP * (0.75 * math.sin(s * math.pi * 0.75) * length - 0.1)

        frond = blade_bm(centre, side, 0.24, rows=3)
        colour = C["fern"] if k % 2 else C["fernDark"]
        pieces.append((frond, [colour] * len(frond.verts), [min(1.0, v.co.length / length) for v in frond.verts]))
    return merge(pieces)


def bush(rng, flower):
    """A round flowering bush: two or three soft blobs with flowers dotted over the top; a plain
    green shrub when `flower` is None."""
    blobs = []
    for _ in range(int(rng.integers(2, 4))):
        a, d = rng.uniform(0, 2 * math.pi), rng.uniform(0.0, 0.35)
        r = rng.uniform(0.45, 0.62)
        blobs.append(L.ellipsoid_bm(Vector((d * math.cos(a), d * math.sin(a), r * 0.7)), (r, r, r * 0.85), u=10, v=7))
    mass = L.fuse(blobs, voxel=0.08, smooth_iterations=5, smooth_lambda=0.8, target_tris=64)
    cols = leafy(mass, 0.0, 0.0, C["leafLight"], C["leaf"], C["leafDark"], seed=rng.uniform(0, 6))
    sway = [smoothstep(0.0, 1.0, v.co.z) * 0.6 for v in mass.verts]
    pieces = [(mass, cols, sway)]
    # Flowers: little five-pointed stars facing out from the top half.
    bvh_pts = [v.co.copy() for v in mass.verts if v.normal.z > 0.2]
    for k in range(4 if flower else 0):
        if not bvh_pts:
            break
        p = bvh_pts[int(rng.integers(0, len(bvh_pts)))]
        n = (p - Vector((0.0, 0.0, 0.35))).normalized()
        star = bmesh.new()
        side = n.cross(UP if abs(n.z) < 0.95 else Vector((1.0, 0.0, 0.0))).normalized()
        other = n.cross(side)
        hub = star.verts.new(p + n * 0.035)
        ring = []
        for i in range(10):
            a = math.pi * i / 5
            r = 0.11 if i % 2 == 0 else 0.05
            ring.append(star.verts.new(p + n * 0.02 + side * (math.cos(a) * r) + other * (math.sin(a) * r)))
        for i in range(10):
            star.faces.new((hub, ring[i], ring[(i + 1) % 10]))
        star.normal_update()
        if star.faces[:][0].normal.dot(n) < 0:
            bmesh.ops.reverse_faces(star, faces=star.faces[:])
        cols_s = [C["centre"]] + [C[flower]] * 10
        pieces.append((star, cols_s, [0.6] * 11))
    return merge(pieces)


def monstera(rng):
    """A monstera: big split heart-shaped leaves on arching stems."""
    pieces = []
    count = 3
    for k in range(count):
        theta = 2 * math.pi * k / count + rng.uniform(-0.3, 0.3)
        d = Vector((math.cos(theta), math.sin(theta), 0.0))
        side = Vector((-math.sin(theta), math.cos(theta), 0.0))
        reach = rng.uniform(0.6, 0.95)
        lift = rng.uniform(0.7, 1.1)
        stem_top = d * reach + UP * lift
        stem = P.segment_bm(Vector((0.0, 0.0, 0.0)), stem_top, 0.025, 0.02, segments=4)
        pieces.append((stem, [C["monstera"]] * len(stem.verts), [0.4] * len(stem.verts)))
        # The leaf: a heart outline with two notches each side, tipped down and outward.
        size = rng.uniform(0.45, 0.6)
        outline = []
        for i in range(11):
            a = math.pi * i / 10
            r = size * (0.62 + 0.38 * math.sin(a)) * (0.74 if i in (3, 7) else 1.0)
            outline.append((math.cos(a) * r, math.sin(a) * r * 1.1))
        tilt = Matrix.Rotation(-0.6, 3, side)
        leaf = bmesh.new()
        top, bot = [], []
        for u, w in outline:
            off = tilt @ (side * u + d * w)
            top.append(leaf.verts.new(stem_top + off + UP * 0.012))
            bot.append(leaf.verts.new(stem_top + off - UP * 0.012))
        hub_t = leaf.verts.new(stem_top + UP * 0.012)
        hub_b = leaf.verts.new(stem_top - UP * 0.012)
        for i in range(len(outline) - 1):
            leaf.faces.new((hub_t, top[i], top[i + 1]))
            leaf.faces.new((hub_b, bot[i + 1], bot[i]))
            leaf.faces.new((top[i], bot[i], bot[i + 1], top[i + 1]))
        leaf.faces.new((hub_t, top[-1], bot[-1], hub_b))
        leaf.faces.new((hub_b, bot[0], top[0], hub_t))
        bmesh.ops.recalc_face_normals(leaf, faces=leaf.faces[:])
        colour = C["monstera"] if k % 2 else C["monsteraLight"]
        pieces.append((leaf, [colour] * len(leaf.verts), [0.8] * len(leaf.verts)))
    return merge(pieces)


def cycad(rng):
    """A cycad: a short scaly trunk with a crown of stiff feathery fronds, as in the film's jungle."""
    height = rng.uniform(0.5, 1.3)
    pieces = []
    trunk = trunk_bm(Vector((0.0, 0.0, -0.1)), Vector((0.0, 0.0, height)), 0.22, 0.18, segments=6, rings=2)
    pieces.append((trunk, [C["cycadTrunk"]] * len(trunk.verts), [0.0] * len(trunk.verts)))
    top = Vector((0.0, 0.0, height))
    count = 7
    for k in range(count):
        theta = 2 * math.pi * k / count + rng.uniform(-0.2, 0.2)
        d = Vector((math.cos(theta), math.sin(theta), 0.0))
        side = Vector((-math.sin(theta), math.cos(theta), 0.0))
        length = rng.uniform(1.0, 1.4)

        def centre(s, d=d, length=length):
            return top + d * (s * length) + UP * (0.55 * math.sin(s * math.pi * 0.7) * length - 0.25 * s * s)

        frond = blade_bm(centre, side, 0.28, rows=4)
        colour = C["cycad"] if k % 2 else C["cycadLight"]
        pieces.append((frond, [colour] * len(frond.verts), [min(1.0, 0.3 + (v.co - top).length / length) for v in frond.verts]))
    return merge(pieces)


def leaf_blade(base, direction, length, width, colour, sway_base=0.4):
    """A long thin solid leaf from `base` along `direction`, bending down toward its tip."""
    d = direction.normalized()
    side = d.cross(UP).normalized() if abs(d.z) < 0.98 else Vector((1.0, 0.0, 0.0))
    normal = side.cross(d).normalized()
    pts = [base, base + d * (length * 0.45) + side * (width / 2), base + d * length - UP * (length * 0.15),
           base + d * (length * 0.45) - side * (width / 2)]
    # A thin diamond with a ridge along its middle: a solid with only six faces.
    bm = bmesh.new()
    a, l, tip, r = (bm.verts.new(p) for p in pts)
    up_mid = bm.verts.new((pts[1] + pts[3]) / 2 + normal * 0.02)
    down_mid = bm.verts.new((pts[1] + pts[3]) / 2 - normal * 0.02)
    for p, q in ((a, l), (l, tip), (tip, r), (r, a)):
        bm.faces.new((p, q, up_mid))
        bm.faces.new((q, p, down_mid))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    sway = [sway_base + (1 - sway_base) * min(1.0, (v.co - base).length / length) for v in bm.verts]
    return bm, [colour] * len(bm.verts), sway


def ti_plant(rng):
    """A ti plant (cordyline): a few slim stems topped with tufts of long red and purple leaves."""
    pieces = []
    for k in range(int(rng.integers(2, 4))):
        a = 2 * math.pi * k / 3 + rng.uniform(-0.4, 0.4)
        h = rng.uniform(0.7, 1.3)  # noqa: E501
        foot = Vector((math.cos(a) * 0.1, math.sin(a) * 0.1, -0.05))
        tip = foot + Vector((math.cos(a) * 0.15, math.sin(a) * 0.15, h))
        stem = P.segment_bm(foot, tip, 0.03, 0.025, segments=4)
        pieces.append((stem, [C["tiGreen"]] * len(stem.verts), [0.2] * len(stem.verts)))
        for i in range(5):
            b = 2 * math.pi * i / 5 + rng.uniform(-0.3, 0.3)
            up = rng.uniform(0.3, 0.9)
            direction = Vector((math.cos(b), math.sin(b), up))
            colour = C["ti"] if (i + k) % 3 else C["tiDark"]
            pieces.append(leaf_blade(tip, direction, rng.uniform(0.45, 0.65), 0.13, colour, 0.5))
    return merge(pieces)


def bromeliad(rng):
    """A bromeliad: a rosette of stiff pointed leaves round a bright red and orange heart."""
    pieces = []
    for i in range(7):
        a = 2 * math.pi * i / 7 + rng.uniform(-0.2, 0.2)
        direction = Vector((math.cos(a), math.sin(a), rng.uniform(0.5, 1.1)))
        pieces.append(leaf_blade(Vector((0.0, 0.0, 0.02)), direction, rng.uniform(0.35, 0.5), 0.12, C["brom"], 0.3))
    for i in range(3):
        a = 2 * math.pi * i / 3 + 0.4
        direction = Vector((math.cos(a) * 0.5, math.sin(a) * 0.5, 1.0))
        colour = C["bromRed"] if i % 2 else C["bromOrange"]
        pieces.append(leaf_blade(Vector((0.0, 0.0, 0.05)), direction, rng.uniform(0.25, 0.35), 0.09, colour, 0.4))
    return merge(pieces)


def big_tree(rng, base_heights):
    """A big jungle tree: a thick trunk standing on buttress roots, a broad crown of several soft
    masses, and vines hanging from its branches, as in the film's waterfall clearing.
    `base_heights` gives the ground's height at (x, y) near its foot, relative to its middle.
    Returns the plant and its crowns as (x, y, z, radius)."""
    height = rng.uniform(13.0, 17.0)
    pieces = []
    trunk = trunk_bm(Vector((0.0, 0.0, -0.5)), Vector((rng.uniform(-0.5, 0.5), rng.uniform(-0.5, 0.5), height * 0.7)),
                     0.75, 0.45, segments=8, rings=4, bend=(rng.uniform(-0.6, 0.6), rng.uniform(-0.6, 0.6)))
    pieces.append((trunk, [C["bigTrunk"] if int(v.co.z * 1.4) % 3 else C["bigTrunkDark"] for v in trunk.verts],
                   [smoothstep(2.0, height, v.co.z) * 0.25 for v in trunk.verts]))
    # Buttress roots: flat fins running out from the trunk's foot to the ground.
    for k in range(5):
        a = 2 * math.pi * k / 5 + rng.uniform(-0.3, 0.3)
        d = Vector((math.cos(a), math.sin(a), 0.0))
        side = Vector((-math.sin(a), math.cos(a), 0.0))
        reach = rng.uniform(1.6, 2.4)
        ground = base_heights(d.x * reach, d.y * reach)
        fin = bmesh.new()
        outline = [d * 0.4 + UP * 2.2, d * 0.5 + UP * (-0.4), d * reach + UP * (ground - 0.3), d * (reach * 0.8) + UP * (ground + 0.25)]
        front = [fin.verts.new(p + side * 0.09) for p in outline]
        back = [fin.verts.new(p - side * 0.09) for p in outline]
        fin.faces.new(front)
        fin.faces.new(list(reversed(back)))
        for i in range(4):
            j = (i + 1) % 4
            fin.faces.new((front[i], back[i], back[j], front[j]))
        bmesh.ops.recalc_face_normals(fin, faces=fin.faces[:])
        pieces.append((fin, [C["bigTrunk"]] * len(fin.verts), [0.0] * len(fin.verts)))
    # The crown: three or four big soft masses round the top.
    crowns, blobs = [], []
    top = Vector((0.0, 0.0, height * 0.72))
    for k in range(int(rng.integers(3, 5))):
        a = 2 * math.pi * k / 4 + rng.uniform(-0.4, 0.4)
        r = rng.uniform(3.0, 4.0)
        c = top + Vector((math.cos(a) * 2.6, math.sin(a) * 2.6, rng.uniform(0.5, 2.5)))
        crowns.append((c.x, c.y, c.z, r))
        blobs.append(L.ellipsoid_bm(c, (r, r, r * 0.75), u=12, v=8))
    blobs.append(L.ellipsoid_bm(top + UP * 3.0, (3.6, 3.6, 2.6), u=12, v=8))
    crowns.append((top.x, top.y, top.z + 3.0, 3.6))
    mass = L.fuse(blobs, voxel=0.45, smooth_iterations=6, smooth_lambda=0.8, target_tris=260)
    cols = leafy(mass, 0.0, 0.0, C["canopyLight"], C["canopy"], C["canopyDark"], seed=rng.uniform(0, 6))
    pieces.append((mass, cols, [0.4] * len(mass.verts)))
    # Vines: thin strands hanging from under the crown.
    for k in range(6):
        a = rng.uniform(0, 2 * math.pi)
        d = rng.uniform(1.5, 4.5)
        x, y = math.cos(a) * d, math.sin(a) * d
        z0 = top.z + rng.uniform(-0.5, 1.0)
        z1 = z0 - rng.uniform(3.5, 6.5)
        vine = P.segment_bm(Vector((x, y, z0)), Vector((x + rng.uniform(-0.3, 0.3), y + rng.uniform(-0.3, 0.3), z1)),
                            0.045, 0.03, segments=4)
        pieces.append((vine, [C["vine"]] * len(vine.verts), [0.3 + 0.7 * smoothstep(z0, z1, v.co.z) for v in vine.verts]))
    return merge(pieces), crowns


def grass(rng):
    """A tuft of grass: a few long thin blades leaning out from one spot."""
    pieces = []
    for i in range(4):
        a = 2 * math.pi * i / 4 + rng.uniform(-0.5, 0.5)
        direction = Vector((math.cos(a) * 0.35, math.sin(a) * 0.35, 1.0))
        colour = C["leafLight"] if i % 2 else C["leaf"]
        pieces.append(leaf_blade(Vector((0.0, 0.0, -0.02)), direction, rng.uniform(0.3, 0.45), 0.06, colour, 0.2))
    return merge(pieces)


def crop(rng):
    """A young crop plant for the fields: a rosette of three broad leaves."""
    pieces = []
    for k in range(3):
        theta = 2 * math.pi * k / 3 + rng.uniform(-0.4, 0.4)
        d = Vector((math.cos(theta), math.sin(theta), 0.0))
        side = Vector((-math.sin(theta), math.cos(theta), 0.0))
        length = rng.uniform(0.32, 0.45)
        bm = bmesh.new()
        pts = [Vector((0.0, 0.0, 0.02)), d * (length * 0.5) + side * 0.1 + UP * 0.22,
               d * length + UP * 0.2, d * (length * 0.5) - side * 0.1 + UP * 0.22]
        top = [bm.verts.new(p + UP * 0.01) for p in pts]
        bot = [bm.verts.new(p - UP * 0.01) for p in pts]
        bm.faces.new(top)
        bm.faces.new(list(reversed(bot)))
        for i in range(4):
            j = (i + 1) % 4
            bm.faces.new((top[i], bot[i], bot[j], top[j]))
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
        colour = C["crop"] if k % 2 else C["cropDark"]
        pieces.append((bm, [colour] * len(bm.verts), [min(1.0, v.co.length / length) for v in bm.verts]))
    return merge(pieces)
