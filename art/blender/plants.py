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
    "trunk": "#94845A",
    "trunkLight": "#B39F70",
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
    "cycadDark": "#3D8540",
    "cycadTrunkLight": "#8E7C5C",
    "cycadTrunkDark": "#5E5038",
    "cycadWool": "#6B5A40",
    "ti": "#B63A4E",
    "tiDark": "#7E2A48",
    "tiGreen": "#6E8F3E",
    "brom": "#7BB84E",
    "bromRed": "#E0483C",
    "bromOrange": "#F28A3A",
    "bromPink": "#EE6F95",
    "bromYellow": "#F5C842",
    "bigTrunk": "#AC8C62",
    "bigTrunkDark": "#8A6D4A",
    "vine": "#5E9E3E",
    "root": "#8C6A48",
    "rootLight": "#A8865E",
    "purple": "#9C6BD6",
    "white": "#FFFFFF",
    "yellow": "#F7D046",
    "red": "#EE5A4E",
    "pink": "#F7A1C4",
    "centre": "#F9E27A",
    "grassDark": "#3F8F3A",
    "clover": "#4FA94A",
    "cloverLight": "#86CF66",
}.items()}

UP = Vector((0.0, 0.0, 1.0))
# Each vertex of a leaf knows where on the leaf it is, for the game to paint its veins: how far
# along it from the stalk (0) to the tip (1), plus 2 for a monstera's split leaf or 4 for a frond's
# row of leaflets, and how far across it from the middle (-1 to 1). Anything not a leaf is across 9.
NOT_LEAF = (0.0, 9.0)
SPLIT, FROND = 2.0, 4.0


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
    """Join (bmesh, colours, sway) pieces, each with or without leaf coordinates (see NOT_LEAF),
    into one."""
    out, cols, sway, leaf = bmesh.new(), [], [], []
    for piece in pieces:
        bm, c, w = piece[:3]
        L.append_bm(out, bm)
        cols.extend(c)
        sway.extend(w)
        leaf.extend(piece[3] if len(piece) > 3 else [NOT_LEAF] * len(bm.verts))
        bm.free()
    return out, cols, sway, leaf


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


def blade_leaf(rows):
    """Leaf coordinates for blade_bm's vertices, in the order it makes them: a frond's."""
    return [(FROND + 0.04 + 0.96 * i / rows, across) for i in range(rows + 1) for across in (1.0, 0.0, -1.0)]


def blade_bm(centre, side, width, rows, thickness=0.03):
    """A light frond: a solid blade three vertices across, drooping at its edges, with a sawtooth
    edge every other row (blade_leaf gives its vertices' leaf coordinates)."""
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
    """A built plant as arrays: vertices, faces, colours (RGB), sway weights and leaf coordinates."""
    bm, cols, sway = built[:3]
    leaf = built[3] if len(built) > 3 else [NOT_LEAF] * len(bm.verts)
    bm.verts.index_update()
    verts = np.array([v.co[:] for v in bm.verts], dtype=float)
    faces = [tuple(v.index for v in f.verts) for f in bm.faces]
    out = (verts, faces, np.array([c[:3] for c in cols], dtype=float), np.array(sway, dtype=float),
           np.array(leaf, dtype=float).reshape(-1, 2))
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
        verts, faces, cols, sway, leaf = arrays
        c, s = math.cos(turn), math.sin(turn)
        rot = np.array([[c, -s, 0.0], [s, c, 0.0], [0.0, 0.0, 1.0]])
        moved = verts @ rot.T * scale + np.array([x, -z, y])
        i = min(max(int((x - self.x0) / self.size * self.patches), 0), self.patches - 1)
        j = min(max(int((z - self.z0) / self.size * self.patches), 0), self.patches - 1)
        part = self.parts.setdefault((i, j), {"verts": [], "faces": [], "cols": [], "sway": [], "leaf": [], "count": 0})
        offset = part["count"]
        part["verts"].append(moved)
        part["faces"].extend(tuple(k + offset for k in f) for f in faces)
        part["cols"].append(cols)
        part["sway"].append(sway)
        part["leaf"].append(leaf)
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
            # Leaf coordinates only where there are leaves to paint veins on (the canopy has none;
            # the game reads a missing one as off the leaves).
            leaf = np.concatenate(part["leaf"])
            if np.any(leaf[:, 1] != NOT_LEAF[1]):
                mesh.attributes.new("_leaf", "FLOAT2", "POINT").data.foreach_set("vector", leaf.ravel())
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
        # Where plants are kept out (a test of game x and z), and how many were kept out there.
        self.keep_out = None
        self.kept_out = 0

    def shape(self, name, arrays):
        self.shapes.append((name, arrays))
        return len(self.shapes) - 1

    def plant(self, layer, index, x, y, z, turn, scale, far=None):
        """Plant shape `index` at game (x, z) on height y, turned about the vertical and scaled; a
        palm also names its far shape. Nothing is planted where `keep_out` keeps plants out; says
        whether it was planted."""
        if self.keep_out is not None and self.keep_out(x, z):
            self.kept_out += 1
            return False
        entry = [index, round(x, 2), round(y, 3), round(z, 2), round(turn, 3), round(scale, 3)]
        if far is not None:
            entry.append(far)
        self.placed.setdefault(layer, []).append(entry)
        return True

    def objects(self, collection):
        """An object for each shape, named v<index>, with its colours and sway weights."""
        import bpy  # noqa: PLC0415
        out = []
        for i, (name, (verts, faces, cols, sway, leaf)) in enumerate(self.shapes):
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
            mesh.attributes.new("_leaf", "FLOAT2", "POINT").data.foreach_set("vector", leaf.ravel())
            mesh.shade_smooth()
            obj = bpy.data.objects.new(f"v{i}", mesh)
            collection.objects.link(obj)
            out.append(obj)
        return out


# ---------------------------------------------------------------------------- canopy
def lobes(rng, heart, r, count):
    """A tree's head as the film paints it, heaped of rounded leafy lobes like a cauliflower's: a
    heart (`heart`, radius `r`) and `count` lobes round it, most over its top and round its sides,
    a few hanging lower, so its outline is bumpy all round. Returns the shapes, to be fused."""
    out = [L.ellipsoid_bm(heart, (0.7 * r, 0.7 * r, 0.55 * r), u=10, v=7)]
    for k in range(count):
        a = 2.0 * math.pi * k / count + rng.uniform(-0.45, 0.45)
        up = rng.uniform(-0.35, 0.9)
        out_by = math.sqrt(max(1.0 - up * up, 0.0))
        d = r * rng.uniform(0.45, 0.68)
        rr = r * rng.uniform(0.36, 0.52)
        c = heart + Vector((math.cos(a) * out_by, math.sin(a) * out_by, up * 0.8)) * d
        out.append(L.ellipsoid_bm(c, (rr, rr, rr * 0.85), u=9, v=6))
    return out


def limbs(rng, fork, heart, r, thickness, count):
    """Limbs from a trunk's fork up and out into its head, glimpsed between the lobes."""
    pieces = []
    for _ in range(count):
        a = rng.uniform(0.0, 2.0 * math.pi)
        end = heart + Vector((math.cos(a) * 0.55 * r, math.sin(a) * 0.55 * r, rng.uniform(-0.1, 0.35) * r))
        limb = P.segment_bm(fork, end, thickness, thickness * 0.45, segments=5)
        pieces.append((limb, [C["trunk"]] * len(limb.verts), [0.25] * len(limb.verts)))
    return pieces


def clump(rng, trees, target=None):
    """A clump of canopy trees after the film's: tall trunks forking into limbs, each tree's head
    heaped of rounded leafy lobes (see lobes), the clump's heads run together into one mass with a
    bumpy, broken outline. `trees` is a list of (x, y, height, base) for each, relative to the
    clump's middle and the ground there. Returns the plant, each crown as (x, y, z, radius) and the
    far version."""
    blobs, pieces, crowns, far_blobs = [], [], [], []
    for x, y, height, base in trees:
        crown_z = base + height * 0.66
        r = height * 0.34
        lean = (rng.uniform(-0.4, 0.4), rng.uniform(-0.4, 0.4))
        fork = Vector((x + lean[0], y + lean[1], crown_z))
        trunk = trunk_bm(Vector((x, y, base - 0.4)), fork + UP * (r * 0.15),
                         0.32 * height / 8.0 + 0.1, 0.17 * height / 8.0 + 0.06,
                         bend=(rng.uniform(-0.3, 0.3), rng.uniform(-0.3, 0.3)))
        pieces.append((trunk, [lerp(C["trunk"], C["trunkLight"], 0.5 + 0.5 * math.sin(v.co.z * 2.0))
                               for v in trunk.verts], [smoothstep(base, crown_z * 1.4, v.co.z) * 0.3 for v in trunk.verts]))
        heart = fork + UP * (r * 0.5)
        crowns.append((heart.x, heart.y, heart.z, r * 1.15))
        blobs.extend(lobes(rng, heart, r, int(rng.integers(7, 11))))
        pieces.extend(limbs(rng, fork, heart, r, 0.13 * height / 8.0 + 0.04, int(rng.integers(2, 4))))
        far_blobs.append(L.ellipsoid_bm(heart, (r, r, r * 0.8), u=8, v=5))
        for k in range(3):
            a = 2.0 * math.pi * k / 3 + rng.uniform(-0.5, 0.5)
            far_blobs.append(L.ellipsoid_bm(heart + Vector((math.cos(a) * 0.6 * r, math.sin(a) * 0.6 * r, 0.2 * r)),
                                            (0.55 * r, 0.55 * r, 0.47 * r), u=7, v=5))
    size = max(max(abs(x), abs(y)) for x, y, _, _ in trees) + max(h for _, _, h, _ in trees) * 0.4
    mass = L.fuse(blobs, voxel=max(0.2, size * 0.024), smooth_iterations=3, smooth_lambda=0.7,
                  target_tris=target or (90 + 120 * len(trees)))
    seed = rng.uniform(0, 6)
    cols = leafy(mass, 0.0, 0.0, C["canopyLight"], C["canopy"], C["canopyDark"], seed=seed)
    low = min(c[2] for c in crowns)
    sway = [0.55 + 0.45 * smoothstep(0.0, 1.0, (v.co.z - low + 2.0) / 6.0) for v in mass.verts]
    # The far version: the heads as one coarse mass, still bumpy, without trunks.
    far = L.fuse(far_blobs, voxel=max(0.4, size * 0.05), smooth_iterations=2, smooth_lambda=0.7,
                 target_tris=24 + 14 * len(trees))
    far_cols = leafy(far, 0.0, 0.0, C["canopyLight"], C["canopy"], C["canopyDark"], seed=seed)
    pieces.append((mass, cols, sway))
    return merge(pieces), crowns, (far, far_cols, [0.6] * len(far.verts))


# ---------------------------------------------------------------------------- palms
def jungle_palm(rng, height):
    """A slim jungle palm with a ringed trunk, as the film's jungle is full of: a full head of long
    fronds drooping all round, two young ones standing up in the middle; light enough to plant by
    the hundred."""
    lean = rng.uniform(0.08, 0.2)
    n = 5
    pts = [Vector((math.sin(t * math.pi * 0.5) * lean * height, 0.0, t * height)) for t in (i / n for i in range(n + 1))]
    pieces = []
    for i in range(n):
        seg = P.segment_bm(pts[i], pts[i + 1], 0.2 - 0.07 * i / n, 0.19 - 0.07 * i / n, segments=6)
        colour = C["palmTrunkA"] if i % 2 else C["palmTrunkB"]
        pieces.append((seg, [colour] * len(seg.verts), [0.15 * i / n] * len(seg.verts)))
    top = pts[-1]
    fronds = 9
    for k in range(fronds):
        young = k >= 7
        theta = (k / 7) * 2 * math.pi + rng.uniform(-0.2, 0.2) if not young else rng.uniform(0, 2 * math.pi)
        d = Vector((math.cos(theta), math.sin(theta), 0.0))
        side = Vector((-math.sin(theta), math.cos(theta), 0.0))
        length = rng.uniform(2.4, 3.0) if not young else rng.uniform(1.5, 1.9)
        reach, rise, droop = (1.0, 0.45, 1.6) if not young else (0.45, 1.2, 0.3)

        def centre(s, d=d, length=length, reach=reach, rise=rise, droop=droop):
            return top + d * (s * length * reach) + UP * (rise * math.sin(s * math.pi * 0.6) - droop * s * s)

        frond = blade_bm(centre, side, 0.45, rows=5, thickness=0.05)
        cols = [C["leafLight"] if young else (C["leaf"] if k % 2 else C["leafLight"])] * len(frond.verts)
        sway = [0.4 + 0.6 * min(1.0, (v.co - top).length / length) for v in frond.verts]
        pieces.append((frond, cols, sway, blade_leaf(5)))
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
        pieces.append((frond, [colour] * len(frond.verts), [min(1.0, v.co.length / length) for v in frond.verts],
                       blade_leaf(3)))
    return merge(pieces)


def bush(rng, flower):
    """A round flowering bush: two or three soft blobs thick with flowers over the top and sides; a
    plain green shrub when `flower` is None."""
    blobs = []
    for _ in range(int(rng.integers(2, 4))):
        a, d = rng.uniform(0, 2 * math.pi), rng.uniform(0.0, 0.35)
        r = rng.uniform(0.45, 0.62)
        blobs.append(L.ellipsoid_bm(Vector((d * math.cos(a), d * math.sin(a), r * 0.7)), (r, r, r * 0.85), u=10, v=7))
    mass = L.fuse(blobs, voxel=0.08, smooth_iterations=5, smooth_lambda=0.8, target_tris=64)
    cols = leafy(mass, 0.0, 0.0, C["leafLight"], C["leaf"], C["leafDark"], seed=rng.uniform(0, 6))
    sway = [smoothstep(0.0, 1.0, v.co.z) * 0.6 for v in mass.verts]
    pieces = [(mass, cols, sway)]
    # Flowers: five-pointed stars facing out all over its top and sides, thick as on the film's
    # flowering bushes.
    bvh_pts = [v.co.copy() for v in mass.verts if v.normal.z > -0.15]
    for k in range(14 if flower else 0):
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
            r = 0.12 if i % 2 == 0 else 0.055
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
        top, bot, where = [], [], []
        for u, w in outline:
            off = tilt @ (side * u + d * w)
            top.append(leaf.verts.new(stem_top + off + UP * 0.012))
            bot.append(leaf.verts.new(stem_top + off - UP * 0.012))
            where += [(SPLIT + w / (1.1 * size), u / size)] * 2
        hub_t = leaf.verts.new(stem_top + UP * 0.012)
        hub_b = leaf.verts.new(stem_top - UP * 0.012)
        where += [(SPLIT, 0.0)] * 2
        for i in range(len(outline) - 1):
            leaf.faces.new((hub_t, top[i], top[i + 1]))
            leaf.faces.new((hub_b, bot[i + 1], bot[i]))
            leaf.faces.new((top[i], bot[i], bot[i + 1], top[i + 1]))
        leaf.faces.new((hub_t, top[-1], bot[-1], hub_b))
        leaf.faces.new((hub_b, bot[0], top[0], hub_t))
        bmesh.ops.recalc_face_normals(leaf, faces=leaf.faces[:])
        colour = C["monstera"] if k % 2 else C["monsteraLight"]
        pieces.append((leaf, [colour] * len(leaf.verts), [0.8] * len(leaf.verts), where))
    return merge(pieces)


def scaly_trunk_bm(height, r0, r1, rings=6, segments=8):
    """A cycad's trunk: rings of scales, each ring turned half a scale from the one below so they
    overlap like the old leaf bases do, ridged out and grooved in between, standing from just under
    the ground to `height`, where it is closed over by a low woolly crown. Returns it with its
    colours."""
    bm = bmesh.new()
    rows, cols = [], []
    for i in range(rings + 1):
        t = i / rings
        r = lerp(r0, r1, t) * (1.08 if i % 2 else 0.95)
        turn = math.pi / segments * (i % 2)
        z = -0.1 + (height + 0.1) * t
        rows.append([bm.verts.new((r * math.cos(2 * math.pi * k / segments + turn),
                                   r * math.sin(2 * math.pi * k / segments + turn), z)) for k in range(segments)])
        cols.extend([C["cycadTrunkLight"] if i % 2 else C["cycadTrunkDark"]] * segments)
    for a, b in zip(rows, rows[1:]):
        for k in range(segments):
            bm.faces.new((a[k], a[(k + 1) % segments], b[(k + 1) % segments], b[k]))
    crown = bm.verts.new((0.0, 0.0, height + 0.08))
    cols.append(C["cycadWool"])
    for k in range(segments):
        bm.faces.new((rows[-1][k], rows[-1][(k + 1) % segments], crown))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    return bm, cols


def cycad(rng):
    """A cycad, as in the film's jungle and round its village: a short, thick trunk of overlapping
    scales, closed over on top, and a fountain of many stiff feathery fronds springing from it, the
    inner ones standing up, the outer arching out and down at their tips."""
    height = rng.uniform(0.5, 1.3)
    pieces = []
    trunk, trunk_cols = scaly_trunk_bm(height, 0.32, 0.26)
    pieces.append((trunk, trunk_cols, [0.0] * len(trunk.verts)))
    top = Vector((0.0, 0.0, height + 0.04))
    count = 12
    for k in range(count):
        inner = k % 2 == 0
        theta = 2 * math.pi * k / count + rng.uniform(-0.15, 0.15)
        d = Vector((math.cos(theta), math.sin(theta), 0.0))
        side = Vector((-math.sin(theta), math.cos(theta), 0.0))
        length = rng.uniform(1.0, 1.35) * (0.85 if inner else 1.0)
        reach, rise, droop = (0.55, 0.95, 0.1) if inner else (1.0, 0.5, 0.35)

        def centre(s, d=d, length=length, reach=reach, rise=rise, droop=droop):
            return top + d * (s * length * reach) + UP * ((rise * math.sin(s * math.pi * 0.6) - droop * s * s) * length)

        frond = blade_bm(centre, side, 0.2, rows=5)
        colour = C["cycadLight"] if inner else (C["cycad"] if k % 4 == 1 else C["cycadDark"])
        pieces.append((frond, [colour] * len(frond.verts), [min(1.0, 0.3 + (v.co - top).length / length) for v in frond.verts],
                       blade_leaf(5)))
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
    where = [(0.0, 0.0), (0.45, 1.0), (1.0, 0.0), (0.45, -1.0), (0.45, 0.0), (0.45, 0.0)]
    return bm, [colour] * len(bm.verts), sway, where


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


def bromeliad(rng, heart=None):
    """A bromeliad: a rosette of stiff pointed leaves round a bright red and orange heart; or, given
    `heart` (two colours of C), the film's showier kind, a star of long upright bracts in those
    colours standing out of the green."""
    pieces = []
    for i in range(7):
        a = 2 * math.pi * i / 7 + rng.uniform(-0.2, 0.2)
        direction = Vector((math.cos(a), math.sin(a), rng.uniform(0.5, 1.1)))
        pieces.append(leaf_blade(Vector((0.0, 0.0, 0.02)), direction, rng.uniform(0.35, 0.5), 0.12, C["brom"], 0.3))
    if heart:
        for i in range(8):
            a = 2 * math.pi * i / 8 + rng.uniform(-0.15, 0.15)
            direction = Vector((math.cos(a) * 0.55, math.sin(a) * 0.55, rng.uniform(1.0, 1.5)))
            pieces.append(leaf_blade(Vector((0.0, 0.0, 0.05)), direction, rng.uniform(0.4, 0.55), 0.1, C[heart[i % 2]], 0.4))
        return merge(pieces)
    for i in range(3):
        a = 2 * math.pi * i / 3 + 0.4
        direction = Vector((math.cos(a) * 0.5, math.sin(a) * 0.5, 1.0))
        colour = C["bromRed"] if i % 2 else C["bromOrange"]
        pieces.append(leaf_blade(Vector((0.0, 0.0, 0.05)), direction, rng.uniform(0.25, 0.35), 0.09, colour, 0.4))
    return merge(pieces)


def hanging_branch(rng):
    """A leafy bough hanging down out of a tree overhead, as the film frames its shots with one: it
    curves down and out from its foot (at the origin) along +x, twigs off it, and broad leaves all
    along them, dark against the light."""
    pieces = []
    bough = [Vector((0.0, 0.0, 0.0)), Vector((0.7, 0.1, -0.3)), Vector((1.4, 0.15, -0.75)), Vector((2.0, 0.1, -1.3)),
             Vector((2.5, 0.0, -1.9))]
    for i, (a, b) in enumerate(zip(bough, bough[1:])):
        seg = P.segment_bm(a, b, 0.07 - 0.012 * i, 0.058 - 0.012 * i, segments=5)
        pieces.append((seg, [C["trunk"]] * len(seg.verts), [0.2 + 0.15 * i] * len(seg.verts)))

    def along(t):
        f = min(max(t, 0.0), 0.999) * (len(bough) - 1)
        i = int(f)
        return bough[i].lerp(bough[i + 1], f - i)

    for _ in range(60):
        t = 1.0 - 0.85 * rng.random() ** 1.6
        a = rng.uniform(0.0, 2.0 * math.pi)
        out = Vector((rng.uniform(-0.2, 0.4), math.cos(a), math.sin(a) * 0.6 - 0.45)).normalized()
        length = rng.uniform(0.22, 0.34)
        colour = C["leafDark"] if rng.random() < 0.6 else C["leaf"]
        pieces.append(leaf_blade(along(t), out, length, length * 0.75, colour, 0.6))
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
    # The crown: three or four heads round the top and one over it, each heaped of leafy lobes
    # (see lobes), limbs reaching up into them.
    crowns, blobs = [], []
    top = Vector((0.0, 0.0, height * 0.72))
    for k in range(int(rng.integers(3, 5))):
        a = 2 * math.pi * k / 4 + rng.uniform(-0.4, 0.4)
        r = rng.uniform(3.0, 4.0)
        c = top + Vector((math.cos(a) * 2.6, math.sin(a) * 2.6, rng.uniform(0.5, 2.5)))
        crowns.append((c.x, c.y, c.z, r))
        blobs.extend(lobes(rng, c, r, 7))
        pieces.extend(limbs(rng, top, c, r, 0.28, 1))
    blobs.extend(lobes(rng, top + UP * 3.0, 3.6, 8))
    crowns.append((top.x, top.y, top.z + 3.0, 3.6))
    mass = L.fuse(blobs, voxel=0.3, smooth_iterations=3, smooth_lambda=0.7, target_tris=700)
    cols = leafy(mass, 0.0, 0.0, C["canopyLight"], C["canopy"], C["canopyDark"], seed=rng.uniform(0, 6))
    pieces.append((mass, cols, [0.4] * len(mass.verts)))
    # Aerial roots hanging from under the crown, as round the film's big tree, a few green vines
    # among them; more roots from a generator of their own, so the jungle round the tree is grown
    # just as before they were added.
    strands = []
    for k in range(6):
        a = rng.uniform(0, 2 * math.pi)
        d = rng.uniform(1.5, 4.5)
        z0 = top.z + rng.uniform(-0.5, 1.0)
        strands.append((a, d, z0, z0 - rng.uniform(3.5, 6.5), rng.uniform(-0.3, 0.3), rng.uniform(-0.3, 0.3), k < 2))
    more = np.random.default_rng(int(height * 1000.0) % 100000)
    for k in range(10):
        a, d = more.uniform(0, 2 * math.pi), more.uniform(1.2, 4.2)
        z0 = top.z + more.uniform(-0.8, 0.8)
        strands.append((a, d, z0, max(0.8, z0 - more.uniform(4.0, 9.0)), more.uniform(-0.4, 0.4), more.uniform(-0.4, 0.4), False))
    for a, d, z0, z1, dx, dy, green in strands:
        x, y = math.cos(a) * d, math.sin(a) * d
        ends = [Vector((x, y, z0)), Vector((x + dx * 0.4, y + dy * 0.4, (z0 + z1) / 2)), Vector((x + dx, y + dy, z1))]
        thick = 0.03 if green else 0.05 + 0.04 * ((z0 - z1) / 9.0)
        for (p0, p1), (r0, r1) in zip(zip(ends, ends[1:]), ((thick, thick * 0.8), (thick * 0.8, thick * 0.55))):
            strand = P.segment_bm(p0, p1, r0, r1, segments=4)
            colour = C["vine"] if green else lerp(C["root"], C["rootLight"], 0.5 + 0.5 * math.sin(a * 3.0))
            pieces.append((strand, [colour] * len(strand.verts), [0.3 + 0.7 * smoothstep(z0, z1, v.co.z) for v in strand.verts]))
    return merge(pieces), crowns


def grass(rng, dark=False):
    """A tuft of grass: a few long thin blades leaning out from one spot; `dark` for the deeper green
    tufts along the paths' edges, more of them and shorter."""
    pieces = []
    count = 6 if dark else 4
    for i in range(count):
        a = 2 * math.pi * i / count + rng.uniform(-0.5, 0.5)
        direction = Vector((math.cos(a) * 0.35, math.sin(a) * 0.35, 1.0))
        if dark:
            colour = C["grassDark"] if i % 2 else C["leaf"]
            length = rng.uniform(0.2, 0.34)
        else:
            colour = C["leafLight"] if i % 2 else C["leaf"]
            length = rng.uniform(0.3, 0.45)
        pieces.append(leaf_blade(Vector((0.0, 0.0, -0.02)), direction, length, 0.06, colour, 0.2))
    return merge(pieces)


def clover(rng):
    """A patch of clover, as at the feet of the film's trees: a low mound of three-leaved clovers,
    each leaflet a rounded heart notched at its tip, lighter toward the middle of the clover."""
    pieces = []
    for _ in range(int(rng.integers(7, 11))):
        a, d = rng.uniform(0, 2 * math.pi), 0.3 * math.sqrt(rng.random())
        top = Vector((d * math.cos(a), d * math.sin(a), rng.uniform(0.07, 0.16) * (1.0 - 0.45 * d / 0.3)))
        size = rng.uniform(0.07, 0.1)
        turn = rng.uniform(0, 2 * math.pi)
        light = rng.random() < 0.5
        for j in range(3):
            theta = turn + 2 * math.pi * j / 3
            out = Vector((math.cos(theta), math.sin(theta), 0.18)).normalized()
            side = Vector((-math.sin(theta), math.cos(theta), 0.0))
            # The leaflet's outline round from one side of its stalk to the other, notched at its tip;
            # its top and underside meet at the outline, swelling a little toward the middle.
            leaf = bmesh.new()
            rim, where = [], []
            for i in range(7):
                phi = math.pi * (i / 6.0 - 0.5)
                r = size * (0.62 + 0.38 * math.cos(phi)) * (1.0 - 0.32 * math.exp(-(phi / 0.3) ** 2))
                u, w = math.sin(phi) * r * 1.05, (0.12 + math.cos(phi)) * r
                rim.append(leaf.verts.new(top + side * u + out * w))
                where.append((w / (1.12 * size), u / size))
            mid = top + out * (0.55 * size)
            up = leaf.verts.new(mid + UP * 0.006)
            down = leaf.verts.new(mid - UP * 0.006)
            where += [(0.5, 0.0), (0.5, 0.0)]
            for i in range(6):
                leaf.faces.new((up, rim[i], rim[i + 1]))
                leaf.faces.new((down, rim[i + 1], rim[i]))
            leaf.faces.new((up, rim[6], rim[0]))
            leaf.faces.new((down, rim[0], rim[6]))
            bmesh.ops.recalc_face_normals(leaf, faces=leaf.faces[:])
            cols = [C["clover"]] * 7 + [C["cloverLight"] if light else C["clover"]] * 2
            pieces.append((leaf, cols, [0.25] * len(leaf.verts), where))
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
