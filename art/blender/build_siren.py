"""The Siren, the giant mermaid of the forbidden cave, as a game character.

Shaped after the user's own drawings of her from the front, the back and the side (2026-10-21), her head the
cast's: Chiikawa's head from the downloaded models, as round as every other Chiikawa model's (the user: "the
head follows other chiikawa models"), at her size. The rest is modelled here in the cast's own form: the
vertex format and rig every character shares (charlib), a face painted by hand in layers (face_art,
art/faces/siren/) and the cast converter's helpers (import_characters). Her colours and details are the
film's (`cave interior 7`, `8`, `[anime] siren 1` to `3`, the official plush):

- Chiikawa's round head, her eyes 1.95 head radii over her base, on a short white torso that shows under it;
- a black hair cap (a mask, sampled per pixel like Hachiware's cap) over the top and the back of the head, her
  face's two white lobes either side of a round-footed widow's peak that hangs just under her eyes;
- two black fluffy bun-ears at the head's top corners, a red fan in front of each;
- broad white fin-hands spread out and a little down from her sides, their ends scalloped, two lines on each;
- her body running on under the torso into her coral fish's tail, one smooth shape (her tail part of her,
  never a layer she wears), a pink band flush round her waist; the tail's round bowl rowed with scales and
  leaning back under her into its curl, round under her and up behind her to a heart-shaped fin.

Run (from the project root; it opens the downloaded Chiikawa model, so with scripts disabled):
    "C:/Program Files/Blender Foundation/Blender 5.2/blender.exe" --background --factory-startup
        --disable-autoexec --python art/blender/build_siren.py -- [--no-previews] [--source <models folder>]

Outputs:
    public/models/siren.glb           her model in the game's vertex format, with rig data
    public/models/faces/siren.webp    her face's painted layers (art/faces/siren/), packed
    public/models/masks/siren.webp    her hair cap, which the game samples per pixel
    art/faces/siren/_guide.png        her bare head from the front, to paint her face over
    art/faces/siren/*.png             first face layers drawn here from the film, written only where none exist
    art/previews/siren_*.png          front, three-quarter, side and back renders
    art/blender/siren.blend           the model, for opening in Blender

Coordinates are Blender's: Z up, she faces -Y, sits on z = 0 and is centred on the Z axis. Her shapes are
built in head radii and scaled to her height at the end.
"""

import math
import os
import sys

import bmesh
import bpy
import numpy as np
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import charlib as L  # noqa: E402
import face_art as FA  # noqa: E402
import import_characters as IC  # noqa: E402

ID = "siren"
FACE_DIR = os.path.join(IC.FACES_SRC, ID)
OUT_BLEND = os.path.join(IC.ROOT, "art", "blender", "siren.blend")
MASK_SIZE = 1024  # her cap's mask: her head is nearly three times the cast's, so twice their mask's size

# Her height to the tops of her bun-ears: 3.6 times Chiikawa's (0.91 m, public/models/chiikawa.glb), as
# `cave interior 7` and `8` both measure her beside the cast on the ledge (the user's choice).
HEIGHT = 3.6 * 0.90997

# Colours (STYLE_GUIDE.md): the cast's white (Chiikawa's), the black that is the Siren's hair alone, the
# red of her bun-ears' fans, the small mermaids' pink band, her coral tail.
WHITE = "#F9F7EE"
CAP = "#141214"
FAN = "#C8361F"
BAND = "#F5B3BE"
TAIL = "#C8584A"

# ---------------------------------------------------------------------------- her shape, in head radii
# Measured from the user's drawings of her (head radius 247 px in each), up from her base.
# Her head is Chiikawa's: from the downloaded model, at this level of smoothing (she is nearly three times
# the cast's size, so twice as smooth), its eye line at EYE. Its top then comes 2.79 over her base and its
# outline meets her torso's sides at 1.33, as the drawings have them (2.78 and 1.33); it is as deep as
# Chiikawa's, 0.92 of its width.
HEAD_SOURCE = "Chiikawa/Chiikawa.blend"
HEAD_LEVEL = 2
EYE = 1.95
SEGMENTS = 72
# Her head is a part of its own, which bows about her neck to look down at you (the user, 2026-10-22: she
# is so tall); her bun-ears go with it. Where her neck is: in her middle, where the head meets the torso.
NECK = (0.0, 0.0, 1.35)
# Her body: one smooth shape from the tail's round foot up to inside her head, her tail part of her body
# and never a second layer she wears (the user, 2026-10-22). Its outline as the drawing from the front
# draws it, (radius, height) from the foot up: the tail's round bowl, flaring a little up through the band
# into the short white torso under her head.
BODY_PROFILE = [(0.0, 0.0), (0.2, 0.012), (0.38, 0.08), (0.52, 0.162), (0.607, 0.243), (0.668, 0.324),
                (0.717, 0.405), (0.749, 0.486), (0.771, 0.567), (0.783, 0.648), (0.789, 0.729), (0.785, 0.81),
                (0.775, 0.89), (0.762, 0.97), (0.755, 1.05), (0.755, 1.15), (0.75, 1.25), (0.72, 1.42),
                (0.55, 1.56), (0.0, 1.64)]
# The band round her waist, flush with her body (its bottom edge and its top), inked along both edges.
BAND_EDGES = (0.785, 0.95)
# The tail's bowl leans back under her into its curl, as the drawing from the side has it: its middle this
# far back at its foot, easing in from the band as the depth under the band to this power.
TAIL_LEAN = (0.3, 1.3)
# Her tail: from inside the bowl it curls round under her and up behind her, down her middle, to a
# heart-shaped fin that stands behind the bowl just under the band (the drawings from the side and the
# back): points of its curl and the tail's radius at each; the heart's two lobes (their middles across,
# back and up, and their half sizes across, front to back and up), how far they lean back at their tops
# (so that the side view shows the heart as a round lobe behind her), and the round root it grows from.
CURL = [((0.0, 0.35, 0.3), 0.3), ((0.0, 0.75, 0.28), 0.25), ((0.0, 1.0, 0.34), 0.2), ((0.0, 1.12, 0.47), 0.15)]
HEART = {"lobes": ((0.31, 1.13, 0.66), (0.36, 0.12, 0.27)), "lean": 0.5, "root": 0.15}
# Scales: rows down the tail this far apart, and how many scales round the bowl and round the curl.
SCALE_ROW = 0.2
SCALES_ROUND = 18
SCALES_CURL = 8
# Her bun-ears: their middles (across, front to back, and over the eye line), as the drawings place them at
# the head's top corners, rising a quarter of a head radius over it; how far they lean out and turn their
# faces out; their oval middle and the round lobes round it (angle from the outside, through the top,
# distance out and radius), and how thick the lobes are (the side view's nub).
BUN = {"at": (0.71, -0.03, 0.8), "lean": 0.15, "turn": 0.2, "core": (0.2, 0.16, 0.18),
       "lobes": [(-15, 0.19, 0.1), (25, 0.2, 0.11), (65, 0.2, 0.115), (105, 0.2, 0.115), (145, 0.2, 0.11),
                 (185, 0.19, 0.1)], "thick": 0.16}
FAN_SIZE = (0.34, 0.27)  # each red fan, across and up, and how far under the bun's middle it sits
FAN_DROP = 0.02
# Her fin-hands (her left one, at +x; the right mirrors it), built pointing out from their roots: a simple
# round paddle as the user drew it (2026-10-21), widening from its root out and down to a round end, its
# top edge running straight from the root to the end and its inner edge straight from the end back up to
# the root (never curling under it), its face to the front, as plump front to back as the drawings' side
# view: shapes stepping from its root, sunk in the torso's side from the head down to the band, to its
# round end (middles across and up; half sizes across, front to back and up), how many. Where the root
# is. The two lines on each run in from the tip about the end's middle (across it, up), this far apart.
FIN_CHAIN = {"root": ((0.03, 0.0), (0.1, 0.13, 0.2)), "end": ((0.36, -0.29), (0.25, 0.12, 0.25)), "steps": 7}
FIN_ROOT = (0.64, -0.24, 1.18)
FIN_LINES = (-0.29, 0.08)
# The hair cap's edge over her face (see cap_edge), one smooth curve as the user drew it over her (2026-10-21,
# from the front and from the side): how high it is over the eye line (head radii) at each angle round the
# head from the front (degrees), the face white under it and the cap black over it. From the middle out:
# the widow's peak's round foot just under the eyes, its sides rising steeply about 0.17 either side of the
# middle and flaring into the face's two round humps, which top out half way round to the sides; then down
# behind the eyes, past the eye line just behind them, to the head's underside at its sides.
CAP_EDGE = [(0.0, -0.06), (4.0, -0.055), (7.0, -0.04), (8.8, -0.015), (9.8, 0.03), (10.4, 0.1), (10.6, 0.2),
            (10.8, 0.3), (11.4, 0.36), (12.5, 0.395), (14.5, 0.425), (17.0, 0.445), (20.0, 0.47), (24.0, 0.485),
            (29.0, 0.49), (34.0, 0.5), (38.0, 0.51), (42.0, 0.52), (47.0, 0.525), (50.0, 0.525), (54.0, 0.518),
            (58.0, 0.5), (62.0, 0.47), (66.0, 0.433), (69.0, 0.39), (72.0, 0.34), (75.0, 0.28), (78.0, 0.18),
            (80.4, 0.083), (82.6, -0.01), (84.7, -0.134), (86.4, -0.27), (88.0, -0.42), (89.2, -0.55),
            (90.0, -0.7)]
MASK_SOFT = 0.03  # how soft the mask's edge is, in head radii either side of it (see cap_mask)

# ---------------------------------------------------------------------------- her face's first layers
# Drawn from the film's frames into art/faces/siren/ when that folder has no layers yet, for painting over:
# her calm face (`[anime] siren 2`, the plush), her singing face (`cave interior 7`), her tearful face
# (`cave interior 8`) and her angry red eyes and toothy mouth (`[anime] siren 3`, the angry plush). Lines
# in black (the game turns them to the film's brown), the world's pen wide: 1.8 cm on her face, which spans
# 2 head radii across the 1536-pixel canvas.
EXPRESSIONS_TXT = """# The Siren: which layers make up each expression (see ../README.md).
# cheeks.png (her whiskers) shows on every face. The first layers were drawn by art/blender/build_siren.py
# as templates to paint over: from the film where it shows her face (Neutral, Happy, Teary, Angry), the
# rest after the cast's own sets. It never overwrites them.
Neutral: brows 1 + eyes open + mouth closed  # [anime] siren 2, the plush
Smile: brows 1 + eyes open + mouth half-open
Happy: brows 1 + eyes happy + mouth open  # cave interior 7: singing
Determined: brows 2 + eyes open + mouth closed
Worried: brows 3 + eyes open + mouth half-open + sweat
Teary: brows 3 + eyes sad + mouth closed + tears  # cave interior 8
Sobbing: brows 4 + eyes open + mouth half-open 2 + tears
Shocked: brows 4 + eyes open + mouth half-open 2
Angry: brows 1 + eyes red + mouth teeth  # roused: [anime] siren 3, the angry plush
"""
RED = (0.80, 0.16, 0.13)
MOUTH_IN = (0.42, 0.16, 0.15)
TONGUE = (0.93, 0.58, 0.62)
TOOTH = (0.93, 0.92, 0.93)
GUMS = (0.70, 0.58, 0.64)
TEAR = (0.75, 0.89, 0.96)


def log(*a):
    print("SIREN", *a)
    sys.stdout.flush()


# ---------------------------------------------------------------------------- the head and its cap
def chiikawa_head(source, level=HEAD_LEVEL):
    """Chiikawa's head from the downloaded model (opened with its scripts off and never changed), in head
    radii: its eye line (the eye decals' middle) at z = 0, centred on the Z axis, facing -Y; no UV layers,
    and none of the model's bone weights (her own model has no bones for them, so the exporter would warn
    that it is not valid)."""
    path = os.path.join(source, HEAD_SOURCE)
    log("head from", path)
    bpy.ops.wm.open_mainfile(filepath=path, load_ui=False, use_scripts=False)
    head, eyes = None, []
    for o in bpy.context.scene.objects:
        if o.type != "MESH":
            continue
        kind = IC.kind_of(o.name)
        if kind == "Head":
            head = o
        elif kind == "decal:eyes":
            eyes.append(o)
    for m in head.modifiers:
        if m.type == "SUBSURF":
            m.levels = m.render_levels = level
        elif m.type == "NODES":
            m.show_viewport = m.show_render = False
    dg = bpy.context.evaluated_depsgraph_get()
    bm = IC.evaluated_bmesh(head, dg)
    lo, hi = IC.bounds([bm])
    heights = []
    for e in eyes:
        eb = IC.evaluated_bmesh(e, dg)
        elo, ehi = IC.bounds([eb])
        heights.append((elo.z + ehi.z) / 2.0)
        eb.free()
    eye = sum(heights) / len(heights)
    r = (hi.x - lo.x) / 2.0
    # The source models face +Y: turned to face -Y.
    bm.transform(Matrix.Scale(1.0 / r, 4) @ Matrix.Rotation(math.pi, 4, "Z")
                 @ Matrix.Translation(Vector((-(lo.x + hi.x) / 2.0, -(lo.y + hi.y) / 2.0, -eye))))
    for layer in list(bm.loops.layers.uv.values()):
        bm.loops.layers.uv.remove(layer)
    for layer in list(bm.verts.layers.deform.values()):
        bm.verts.layers.deform.remove(layer)
    bm.normal_update()
    return bm


def head_bm(source, level=HEAD_LEVEL):
    """Her head (Chiikawa's, see chiikawa_head, smoothed this far) on her body, its eye line at EYE, with the
    coordinates her cap's mask is drawn in: round the head (its back at the image's edges, where it is all
    cap) and up it. Returns the head and the heights its mask spans."""
    bm = chiikawa_head(source, level)
    bm.transform(Matrix.Translation(Vector((0.0, 0.0, EYE))))
    return bm, IC.round_uv(bm)


_EDGE = {}  # the cap's edge laid on her head (see cap_edge): its angles, heights and points on the head


def cap_edge(head_bvh, per=8):
    """Lays the cap's edge (CAP_EDGE) onto her head for cap_sdf: smoothed between its points (Catmull-Rom),
    each point found on the head's surface at its angle round it and its height."""
    pts = list(CAP_EDGE)
    ext = [pts[0]] + pts + [pts[-1]]
    dense = [L._catmull_rom(ext[i - 1], ext[i], ext[i + 1], ext[i + 2], k / per)
             for i in range(1, len(ext) - 2) for k in range(per)] + [pts[-1]]
    angles, heights, points = [], [], []
    for a, v in dense:
        if angles and a <= angles[-1]:
            continue  # the curve keeps going round
        r = math.radians(a)
        hit = head_bvh.ray_cast(Vector((0.0, 0.0, EYE + v)), Vector((math.sin(r), -math.cos(r), 0.0)))[0]
        if hit is not None:
            angles.append(a)
            heights.append(v)
            points.append(hit[:])
    _EDGE.update(a=np.array(angles), v=np.array(heights), p=np.array(points))


def cap_sdf(p):
    """How far inside her hair cap points of her head are ((n, 3) array, head radii; negative on her white
    face): the face white under the cap's edge (cap_edge) and the cap black over it and behind the head's
    sides, the same either side of her middle. The distance is to the edge laid on the head, so that the
    mask's soft edge is as wide all along it."""
    a_e, v_e, p_e = _EDGE["a"], _EDGE["v"], _EDGE["p"]
    q = np.column_stack([np.abs(p[:, 0]), p[:, 1], p[:, 2]])
    a = np.degrees(np.arctan2(q[:, 0], -q[:, 1]))
    face = (a < a_e[-1]) & (q[:, 2] - EYE < np.interp(a, a_e, v_e))
    start, run = p_e[:-1], p_e[1:] - p_e[:-1]
    run2 = np.maximum((run * run).sum(1), 1e-12)
    dist = np.empty(len(q))
    for s in range(0, len(q), 4000):
        c = q[s:s + 4000, None, :] - start[None]
        t = np.clip((c * run[None]).sum(2) / run2[None], 0.0, 1.0)
        dist[s:s + 4000] = np.sqrt(((c - t[..., None] * run[None]) ** 2).sum(2).min(1))
    return np.where(face, -dist, dist)


def cap_mask(head):
    """The cap's mask image in its coordinates (see head_bm), bottom row first: 1 where it is black. Its edge
    is soft over a few centimetres (MASK_SOFT), which the game's shader turns into a crisp edge inked along
    its middle: the ink takes its width from the soft edge's, so a hard edge would leave it thin and
    stepped, texel by texel (as Hachiware's cap's mask is blurred for)."""
    pos = IC.surface_map(head, MASK_SIZE)
    found = ~np.isnan(pos[..., 0])
    d = np.ones(pos.shape[:2])
    d[found] = 0.5 + 0.5 * cap_sdf(pos[found]) / MASK_SOFT
    return np.clip(d, 0.0, 1.0)


# ---------------------------------------------------------------------------- bun-ears and their fans
def bun_bm():
    """A bun-ear in its own frame (its face toward -Y, up +Z): an oval middle with round lobes about its
    top and sides, fused into one soft, fluffy shape."""
    cx, cy, cz = BUN["core"]
    parts = [L.ellipsoid_bm(Vector((0.0, 0.0, 0.0)), (cx, cy, cz), u=20, v=12)]
    for deg, dist, rad in BUN["lobes"]:
        t = math.radians(deg)
        parts.append(L.ellipsoid_bm(Vector((math.cos(t) * dist, 0.0, math.sin(t) * dist)), (rad, BUN["thick"], rad),
                                    u=16, v=10))
    bm = L.fuse(parts, voxel=0.016, smooth_iterations=4, smooth_lambda=0.6, target_tris=1300)
    for p in parts:
        p.free()
    return bm


def fan_outline(width, height, steps=72):
    """A fan like the film's red inserts in her bun-ears: three round scallops along its top, narrowing to a
    rounded point below. Star-shaped about the origin: (x, z) points round it."""
    w, h = width, height
    circles = [((-0.3 * w, 0.17 * h), 0.21 * w), ((0.0, 0.25 * h), 0.22 * w), ((0.3 * w, 0.17 * h), 0.21 * w)]
    tri = [(-0.47 * w, 0.12 * h), (0.47 * w, 0.12 * h), (0.0, -0.5 * h)]
    out = []
    for i in range(steps):
        t = 2.0 * math.pi * i / steps
        dx, dz = math.cos(t), math.sin(t)
        far = 0.0
        for (px, pz), rho in circles:
            along = dx * px + dz * pz
            disc = rho * rho - (px * px + pz * pz - along * along)
            if disc >= 0.0:
                far = max(far, along + math.sqrt(disc))
        for (ax, az), (bx, bz) in zip(tri, tri[1:] + tri[:1]):
            ex, ez = bx - ax, bz - az
            den = dx * ez - dz * ex
            if abs(den) < 1e-9:
                continue
            tt = (ax * ez - az * ex) / den
            ss = (ax * dz - az * dx) / den
            if tt > 0.0 and 0.0 <= ss <= 1.0:
                far = max(far, tt)
        out.append((far * dx, far * dz))
    return out


def fan_bm(bun, thickness=0.02, lift=0.012):
    """The red fan on a bun-ear's front (in the bun's own frame), laid onto its surface like paint with a
    little thickness: each point of the outline carried along the view onto the bun's front."""
    w, h = FAN_SIZE
    outline = fan_outline(w, h)
    bvh = BVHTree.FromBMesh(bun)
    back = Vector((0.0, 1.0, 0.0))  # into the bun

    def onto(x, z):
        hit = bvh.ray_cast(Vector((x, -1.0, z - FAN_DROP)), back)[0]
        return hit if hit is not None else Vector((x, 0.0, z - FAN_DROP))

    bm = bmesh.new()
    centre = onto(0.0, 0.0)
    fc = bm.verts.new(centre - back * lift)
    bc = bm.verts.new(centre + back * (thickness - lift))
    front, rear = [], []
    for x, z in outline:
        p = onto(x, z)
        front.append(bm.verts.new(p - back * lift))
        rear.append(bm.verts.new(p + back * (thickness - lift)))
    n = len(outline)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((fc, front[i], front[j]))
        bm.faces.new((bc, rear[j], rear[i]))
        bm.faces.new((front[j], front[i], rear[i], rear[j]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    return bm


def place_bun(side, head_bvh):
    """Where a bun-ear sits (side -1 her right, +1 her left): at the head's top corner, leaning out and its
    face turned out. Returns its frame and its foot on the head under its middle (its pivot)."""
    x, y, up = BUN["at"]
    centre = Vector((side * x, y, EYE + up))
    foot = head_bvh.ray_cast(centre + Vector((0.0, 0.0, 2.0)), Vector((0.0, 0.0, -1.0)))[0] or centre
    rot = Matrix.Rotation(side * BUN["turn"], 4, "Z") @ Matrix.Rotation(side * BUN["lean"], 4, "Y")
    return Matrix.Translation(centre) @ rot, foot


# ---------------------------------------------------------------------------- fin-hands
def fin_bm():
    """Her left fin-hand pointing out (+X) from its root at the origin, its face toward -Y: a simple round
    paddle, its shapes stepping evenly from the root to the round end so that its edges between them run
    straight, fused into one soft shape."""
    (r0, s0), (r1, s1), n = FIN_CHAIN["root"], FIN_CHAIN["end"], FIN_CHAIN["steps"]
    parts = []
    for i in range(n):
        t = i / (n - 1)
        centre = Vector((L.lerp(r0[0], r1[0], t), 0.0, L.lerp(r0[1], r1[1], t)))
        parts.append(L.ellipsoid_bm(centre, tuple(L.lerp(a, b, t) for a, b in zip(s0, s1)), u=20, v=12))
    bm = L.fuse(parts, voxel=0.012, smooth_iterations=6, smooth_lambda=0.7, target_tris=1000)
    for p in parts:
        p.free()
    return bm


def fin_frame(side):
    """A fin-hand's place (side -1 her right, +1 her left): its root in her side under the head."""
    x, y, z = FIN_ROOT
    return Matrix.Translation(Vector((side * x, y, z)))


# ---------------------------------------------------------------------------- her body and the tail
def body_rings(step=0.04):
    """Her body's outline (BODY_PROFILE) as rows this far apart, cut at the band's edges into the tail's,
    the band's and the torso's, each from the foot up and sharing its edge row with the next, so that the
    three meet with nothing between them and each takes its own colour crisply."""
    prof = L.Profile(BODY_PROFILE)
    d = np.array(prof.dense)
    arc = np.concatenate([[0.0], np.cumsum(np.hypot(*np.diff(d, axis=0).T))])
    cuts = []
    for z in BAND_EDGES:
        k = next(k for k in range(len(d) - 1) if d[k, 1] <= z < d[k + 1, 1])
        cuts.append(arc[k] + (z - d[k, 1]) / (d[k + 1, 1] - d[k, 1]) * (arc[k + 1] - arc[k]))
    parts = []
    for a0, a1 in zip([0.0] + cuts, cuts + [arc[-1]]):
        s = np.linspace(a0, a1, max(2, round((a1 - a0) / step)) + 1)
        parts.append([(float(np.interp(t, arc, d[:, 0])), float(np.interp(t, arc, d[:, 1]))) for t in s])
    parts[0][0], parts[-1][-1] = (0.0, d[0, 1]), (0.0, d[-1, 1])
    return parts


def lean_tail(bm):
    """Leans the tail's bowl back under her into its curl (TAIL_LEAN), from nothing at the band."""
    back, power = TAIL_LEAN
    for v in bm.verts:
        v.co.y += back * max(0.0, (BAND_EDGES[0] - v.co.z) / BAND_EDGES[0]) ** power


def lathe_rows(profile_pts):
    """Arc length down a lathe profile from its top, per sample (for rows of scales)."""
    out = [0.0]
    for (r0, z0), (r1, z1) in zip(profile_pts[::-1], profile_pts[::-1][1:]):
        out.append(out[-1] + math.hypot(r1 - r0, z1 - z0))
    return out[::-1]


def curl_path(samples=40):
    """The tail's curl as points along it: (position, radius) by Catmull-Rom through CURL."""
    pts = [Vector(p) for p, _ in CURL]
    rads = [r for _, r in CURL]
    ext = [pts[0] - (pts[1] - pts[0])] + pts + [pts[-1] + (pts[-1] - pts[-2])]
    rext = [rads[0]] + rads + [rads[-1]]
    out = []
    per = max(1, samples // (len(pts) - 1))
    for i in range(1, len(ext) - 2):
        for s in range(per):
            t = s / per
            t2, t3 = t * t, t * t * t
            p = 0.5 * ((2 * ext[i]) + (-ext[i - 1] + ext[i + 1]) * t + (2 * ext[i - 1] - 5 * ext[i] + 4 * ext[i + 1] - ext[i + 2]) * t2
                       + (-ext[i - 1] + 3 * ext[i] - 3 * ext[i + 1] + ext[i + 2]) * t3)
            r = rext[i] + (rext[i + 1] - rext[i]) * (t * t * (3 - 2 * t))
            out.append((p, r))
    out.append((pts[-1], rads[-1]))
    return out


def curl_bm(row=SCALE_ROW, scales=SCALES_CURL):
    """The tail's curl: a tube swept along curl_path, its scales' coordinates on its vertices (round it,
    this many scales, the seam split along its underside; and along it, in rows this far apart); its ends
    closed (both are buried, in the bowl and in the fin). Returns (bmesh, per-vertex (around, along, how
    far along 0..1), the path)."""
    path = curl_path()
    n = len(path)
    lengths = [0.0]
    for (a, _), (b, _) in zip(path, path[1:]):
        lengths.append(lengths[-1] + (b - a).length)
    total = lengths[-1]
    ring_n = 20
    bm = bmesh.new()
    data = []
    rings = []
    normal = None
    for i, (p, r) in enumerate(path):
        tangent = (path[min(i + 1, n - 1)][0] - path[max(i - 1, 0)][0]).normalized()
        if normal is None:
            # Square to the way along it, in her middle plane: its seam then runs along its inside.
            normal = Vector((1.0, 0.0, 0.0)).cross(tangent).normalized()
        else:
            normal = (normal - tangent * normal.dot(tangent)).normalized()
        binormal = tangent.cross(normal)
        ring = []
        for j in range(ring_n + 1):  # the last a copy of the first, for the seam
            t = math.pi + 2.0 * math.pi * j / ring_n
            ring.append(bm.verts.new(p + (normal * math.cos(t) + binormal * math.sin(t)) * r))
            data.append((scales * (j / ring_n + 0.5), lengths[i] / row, lengths[i] / total))
        rings.append(ring)
    for lo, hi in zip(rings, rings[1:]):
        for j in range(ring_n):
            bm.faces.new((lo[j], lo[j + 1], hi[j + 1], hi[j]))
    for ring, (p, _), k in ((rings[0], path[0], 0), (rings[-1], path[-1], n - 1)):
        c = bm.verts.new(p)
        data.append((0.0, lengths[k] / row, lengths[k] / total))
        for j in range(ring_n):
            bm.faces.new((c, ring[j], ring[j + 1]) if k else (c, ring[j + 1], ring[j]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    bm.verts.ensure_lookup_table()
    return bm, data, path


def heart_bm(path):
    """The tail's fin: a heart of two round, plump lobes side by side, standing behind the bowl with its
    broad face to the back (the drawing from the back), the curl's end in its point; fused into one soft
    shape."""
    (lx, ly, lz), radii = HEART["lobes"]
    end, _ = path[-1]
    parts = [L.ellipsoid_bm(end, (HEART["root"],) * 3, u=16, v=10)]
    lean = Matrix.Rotation(-HEART["lean"], 3, "X")
    for side in (-1.0, 1.0):
        parts.append(L.ellipsoid_bm(Vector((side * lx, ly, lz)), radii, lean, u=20, v=12))
    bm = L.fuse(parts, voxel=0.014, smooth_iterations=4, smooth_lambda=0.6, target_tris=1200)
    for p in parts:
        p.free()
    return bm


# ---------------------------------------------------------------------------- her face's first layers
P = FA.PAINT_SIZE
PEN_PX = 14.0  # the world's pen (1.8 cm) on her canvas


def to_px(u, v):
    return (u + 1.0) * 0.5 * P, (1.0 - v) * 0.5 * P


class Sheet:
    """A face layer being drawn: P x P straight-alpha RGBA, top row first. Shapes are given in face
    coordinates (head radii across from the face's middle, and up from the eye line) and drawn
    anti-aliased from their signed distances in pixels."""

    def __init__(self):
        self.rgba = np.zeros((P, P, 4), dtype=np.float32)
        ys, xs = np.mgrid[0:P, 0:P].astype(np.float32)
        self.x = xs + 0.5
        self.y = ys + 0.5

    def put(self, sdf, colour):
        a = np.clip(0.5 - sdf, 0.0, 1.0)[..., None]
        old = self.rgba[..., 3:4]
        out_a = a + old * (1.0 - a)
        rgb = (np.array(colour, dtype=np.float32) * a + self.rgba[..., :3] * old * (1.0 - a)) / np.maximum(out_a, 1e-6)
        self.rgba = np.concatenate([rgb, out_a], axis=-1)


def ellipse_sdf(sh, u, v, ru, rv):
    cx, cy = to_px(u, v)
    rx, ry = ru * 0.5 * P, rv * 0.5 * P
    return (np.hypot((sh.x - cx) / rx, (sh.y - cy) / ry) - 1.0) * min(rx, ry)


def polyline_sdf(sh, pts, width):
    """Distance in pixels to a polyline of face points, less half the line's width (round ends)."""
    q = [to_px(u, v) for u, v in pts]
    d = np.full(sh.x.shape, 1e9, dtype=np.float32)
    for (ax, ay), (bx, by) in zip(q, q[1:]):
        ex, ey = bx - ax, by - ay
        t = np.clip(((sh.x - ax) * ex + (sh.y - ay) * ey) / max(ex * ex + ey * ey, 1e-9), 0.0, 1.0)
        d = np.minimum(d, np.hypot(sh.x - ax - t * ex, sh.y - ay - t * ey))
    return d - width * 0.5


def polygon_sdf(sh, pts):
    """Signed distance in pixels to a closed polygon of face points (negative inside)."""
    q = [to_px(u, v) for u, v in pts]
    edge = polyline_sdf(sh, pts + pts[:1], 0.0)
    inside = np.zeros(sh.x.shape, dtype=bool)
    for (ax, ay), (bx, by) in zip(q, q[1:] + q[:1]):
        crosses = (ay > sh.y) != (by > sh.y)
        xi = ax + (sh.y - ay) * (bx - ax) / ((by - ay) if abs(by - ay) > 1e-9 else 1e-9)
        inside ^= crosses & (sh.x < xi)
    return np.where(inside, -edge, edge)


def curve(p0, p1, p2, n=28):
    """A quadratic Bezier through face points p0 and p2, pulled toward p1."""
    out = []
    for i in range(n + 1):
        t = i / n
        out.append(((1 - t) ** 2 * p0[0] + 2 * (1 - t) * t * p1[0] + t * t * p2[0],
                    (1 - t) ** 2 * p0[1] + 2 * (1 - t) * t * p1[1] + t * t * p2[1]))
    return out


def arc(u, v, ru, rv, a0, a1, n=48):
    return [(u + ru * math.cos(a0 + (a1 - a0) * i / n), v + rv * math.sin(a0 + (a1 - a0) * i / n)) for i in range(n + 1)]


EYES = (-0.42, 0.42)
EYE_R = (0.2, 0.15)
BLACK = (0.0, 0.0, 0.0)
WHITE_PAINT = (1.0, 1.0, 1.0)


def draw_eyes(kind):
    sh = Sheet()
    W = PEN_PX
    for ex in EYES:
        side = 1.0 if ex > 0 else -1.0
        rx, ry = EYE_R
        if kind in ("open", "red"):
            inside = ellipse_sdf(sh, ex, 0.0, rx - 0.012, ry - 0.012)
            iris = np.maximum(ellipse_sdf(sh, ex - side * 0.01, -0.015, 0.135, 0.14), inside)
            sh.put(iris, BLACK if kind == "open" else RED)
            if kind == "red":
                ring = np.maximum(np.abs(ellipse_sdf(sh, ex - side * 0.01, -0.015, 0.135, 0.14)) - W * 0.4, inside)
                sh.put(ring, BLACK)
            hl = ellipse_sdf(sh, ex - side * 0.005, -0.005, 0.045 if kind == "open" else 0.05,
                             0.07 if kind == "open" else 0.085)
            sh.put(hl, WHITE_PAINT)
            if kind == "red":
                sh.put(np.abs(hl) - W * 0.3, BLACK)
                sh.put(polyline_sdf(sh, curve((ex - 0.17, -0.165), (ex, -0.215), (ex + 0.17, -0.165)), W * 0.8), BLACK)
            sh.put(np.abs(ellipse_sdf(sh, ex, 0.0, rx, ry)) - W * 0.5, BLACK)
            # The heavier upper lid.
            sh.put(polyline_sdf(sh, arc(ex, 0.0, rx, ry, math.radians(15), math.radians(165)), W * 1.6), BLACK)
        elif kind == "happy":
            sh.put(polyline_sdf(sh, curve((ex - 0.19, -0.03), (ex, 0.11), (ex + 0.19, -0.03)), W * 1.2), BLACK)
        elif kind == "closed":
            sh.put(polyline_sdf(sh, curve((ex - 0.19, 0.02), (ex, -0.08), (ex + 0.19, 0.02)), W * 1.2), BLACK)
        elif kind == "sad":
            lid = 0.035
            below = np.maximum(ellipse_sdf(sh, ex, 0.0, rx - 0.012, 0.13 - 0.012), -(sh.y - to_px(0.0, lid)[1]))
            sh.put(np.maximum(ellipse_sdf(sh, ex, -0.02, 0.1, 0.1), below), BLACK)
            sh.put(ellipse_sdf(sh, ex, -0.025, 0.035, 0.05), WHITE_PAINT)
            sh.put(polyline_sdf(sh, arc(ex, 0.0, rx, 0.13, math.radians(185), math.radians(355)), W), BLACK)
            sh.put(polyline_sdf(sh, curve((ex - 0.22, lid), (ex, lid + 0.03), (ex + 0.22, lid)), W * 1.4), BLACK)
    return sh.rgba


def draw_whiskers():
    sh = Sheet()
    for side in (-1.0, 1.0):
        sh.put(polyline_sdf(sh, curve((side * 0.36, -0.2), (side * 0.53, -0.15), (side * 0.72, -0.17)), PEN_PX * 0.85), BLACK)
        sh.put(polyline_sdf(sh, curve((side * 0.38, -0.3), (side * 0.56, -0.29), (side * 0.70, -0.38)), PEN_PX * 0.85), BLACK)
    return sh.rgba


def draw_brows(kind=1):
    """Her brows: small dashes over her eyes' inner ends (1, the film's); after the cast's sets, slanting
    down toward the middle (2, determined), slanting up toward it (3, worried) and raised, wavering (4)."""
    sh = Sheet()
    for side in (-1.0, 1.0):
        if kind == 1:
            pts = curve((side * 0.31, 0.235), (side * 0.27, 0.262), (side * 0.22, 0.27))
        elif kind == 2:
            pts = [(side * 0.33, 0.29), (side * 0.24, 0.235)]
        elif kind == 3:
            pts = curve((side * 0.35, 0.225), (side * 0.3, 0.255), (side * 0.23, 0.295))
        else:
            pts = [(side * (0.22 + 0.13 * t / 24), 0.33 + 0.018 * math.sin(t / 24 * 2.0 * math.pi)) for t in range(25)]
        sh.put(polyline_sdf(sh, pts, PEN_PX), BLACK)
    return sh.rgba


def tear_drop(sh, ex, top=-0.13):
    """A tear hanging from under an eye: a round-bottomed drop, inked, a little blue inside."""
    u = [(ex - 0.04, top)] + curve((ex - 0.04, top - 0.07), (ex, top - 0.17), (ex + 0.04, top - 0.07))[1:-1] + [(ex + 0.04, top)]
    drop = [(ex - 0.04, top), (ex - 0.04, top - 0.07)] + curve((ex - 0.04, top - 0.07), (ex, top - 0.17), (ex + 0.04, top - 0.07)) + [(ex + 0.04, top)]
    sh.put(polygon_sdf(sh, drop), TEAR)
    sh.put(polyline_sdf(sh, u, PEN_PX * 0.9), BLACK)


def draw_tears(closed=False):
    """A tear under her right eye, as `cave interior 8` has it; with her eyes shut, one under each."""
    sh = Sheet()
    for ex in (EYES if closed else EYES[:1]):
        tear_drop(sh, ex, -0.06 if closed else -0.13)
    return sh.rgba


def draw_sweat():
    """A drop of sweat on her face's upper side, as the cast's sets have one."""
    sh = Sheet()
    tear_drop(sh, -0.74, 0.36)
    return sh.rgba


def cat_lip(sh, v, half):
    """The film's small "w" cat mouth over everything else she says."""
    for side in (-1.0, 1.0):
        sh.put(polyline_sdf(sh, curve((side * half, v + 0.01), (side * half * 0.5, v - 0.065), (0.0, v - 0.005)), PEN_PX), BLACK)
    sh.put(polyline_sdf(sh, [(0.0, v - 0.005), (0.0, v + 0.035)], PEN_PX), BLACK)


def chin(sh, v, half=0.035):
    sh.put(polyline_sdf(sh, curve((-half, v), (0.0, v - 0.025), (half, v)), PEN_PX), BLACK)


def draw_mouth(kind):
    sh = Sheet()
    if kind == "closed":
        cat_lip(sh, -0.2, 0.085)
        chin(sh, -0.305)
    elif kind == "half-open 2":
        # Open wide and square, wailing or shocked, as the cast's sets have it.
        hole = [(-0.08, -0.195), (0.08, -0.195), (0.085, -0.26), (0.07, -0.31), (-0.07, -0.31), (-0.085, -0.26)]
        sdf = polygon_sdf(sh, hole)
        sh.put(sdf, MOUTH_IN)
        sh.put(np.maximum(ellipse_sdf(sh, 0.0, -0.29, 0.055, 0.03), sdf), TONGUE)
        sh.put(np.abs(sdf) - PEN_PX * 0.5, BLACK)
        cat_lip(sh, -0.18, 0.09)
        chin(sh, -0.36)
    elif kind in ("open", "half-open"):
        bottom = -0.37 if kind == "open" else -0.29
        hole = [(-0.085, -0.195), (0.085, -0.195), (0.07, bottom + 0.04), (0.035, bottom), (-0.035, bottom),
                (-0.07, bottom + 0.04)]
        sdf = polygon_sdf(sh, hole)
        sh.put(sdf, MOUTH_IN)
        sh.put(np.maximum(ellipse_sdf(sh, 0.0, bottom + 0.025, 0.05, 0.03), sdf), TONGUE)
        sh.put(np.abs(sdf) - PEN_PX * 0.5, BLACK)
        cat_lip(sh, -0.18, 0.09)
        chin(sh, bottom - 0.06)
    elif kind == "teeth":
        hole = [(-0.12, -0.18), (0.12, -0.18), (0.10, -0.33), (0.07, -0.42), (-0.07, -0.42), (-0.10, -0.33)]
        sdf = polygon_sdf(sh, hole)
        sh.put(sdf, (0.16, 0.1, 0.12))
        sh.put(np.maximum(ellipse_sdf(sh, 0.0, -0.39, 0.075, 0.04), sdf), GUMS)
        for i in range(5):
            x = -0.1 + i * 0.04
            sh.put(np.maximum(polygon_sdf(sh, [(x, -0.18), (x + 0.04, -0.18), (x + 0.02, -0.235)]), sdf), TOOTH)
        for i in range(4):
            x = -0.08 + i * 0.04
            sh.put(np.maximum(polygon_sdf(sh, [(x, -0.415), (x + 0.04, -0.415), (x + 0.02, -0.36)]), sdf), TOOTH)
        sh.put(np.abs(sdf) - PEN_PX * 0.5, BLACK)
        cat_lip(sh, -0.17, 0.12)
        chin(sh, -0.5, 0.045)
    return sh.rgba


def write_first_layers():
    """Her face's first layers and expressions.txt, drawn from the film, written only where there are none
    yet: the user paints over them, and nothing here ever overwrites a layer that is there."""
    os.makedirs(FACE_DIR, exist_ok=True)
    layers = {
        "cheeks": draw_whiskers,
        "brows 1": draw_brows,
        "brows 2": lambda: draw_brows(2),
        "brows 3": lambda: draw_brows(3),
        "brows 4": lambda: draw_brows(4),
        "eyes open": lambda: draw_eyes("open"),
        "eyes red": lambda: draw_eyes("red"),
        "eyes happy": lambda: draw_eyes("happy"),
        "eyes closed": lambda: draw_eyes("closed"),
        "eyes sad": lambda: draw_eyes("sad"),
        "tears eyes open": draw_tears,
        "tears eyes closed": lambda: draw_tears(closed=True),
        "sweat": draw_sweat,
        "mouth closed": lambda: draw_mouth("closed"),
        "mouth half-open": lambda: draw_mouth("half-open"),
        "mouth half-open 2": lambda: draw_mouth("half-open 2"),
        "mouth open": lambda: draw_mouth("open"),
        "mouth teeth": lambda: draw_mouth("teeth"),
    }
    written = []
    for name, draw in layers.items():
        path = os.path.join(FACE_DIR, f"{name}.png")
        if not os.path.exists(path):
            FA.write_png(path, FA.to_uint8(draw()))
            written.append(name)
    recipe = os.path.join(FACE_DIR, FA.RECIPE_FILE)
    if not os.path.exists(recipe):
        with open(recipe, "w", encoding="utf-8") as f:
            f.write(EXPRESSIONS_TXT)
        written.append(FA.RECIPE_FILE)
    if written:
        log("face: first layers written:", ", ".join(written))


# ---------------------------------------------------------------------------- build
def build(collection, head):
    head_bvh = BVHTree.FromBMesh(head)
    cap_edge(head_bvh)
    parts = [{"pivot": Vector((0.0, 0.0, 0.0)), "parent": -1} for _ in range(L.MAX_PARTS)]
    anchors = {}
    white, cap, fan_col = L.hex_color(WHITE), L.hex_color(CAP), L.hex_color(FAN)
    band_col, tail_col = L.hex_color(BAND), L.hex_color(TAIL)
    pieces = []

    def head_attr(co):
        uv = (0.5 + co.x / 2.0, 0.5 + (co.z - EYE) / 2.0)
        return L.attrs(white, L.HEAD, paint=L.PAINT_BODY, uv=uv, mask=1.0)

    parts[L.HEAD]["pivot"] = Vector(NECK)
    pieces.append(L.Piece(head.copy(), head_attr))

    # Her body, in one outline from the tail's foot up into her head: the tail, scaled in rows down from
    # the band (round its bowl the game measures by itself, a negative count asking it to; down it by the
    # outline's arc), leaning back into its curl; the band, inked along its edges; the white torso.
    tail_rows, band_rows, torso_rows = body_rings()
    zs, down = [z for _, z in tail_rows], lathe_rows(tail_rows)
    band_lo, band_hi = BAND_EDGES
    tail = L.lathe_bm(tail_rows, SEGMENTS, 1.0)
    lean_tail(tail)
    pieces.append(L.Piece(tail, lambda co: L.attrs(tail_col, L.BODY, paint=L.PAINT_SCALES, uv=(
        -float(SCALES_ROUND), float(np.interp(co.z, zs, down)) / SCALE_ROW))))
    pieces.append(L.Piece(L.lathe_bm(band_rows, SEGMENTS, 1.0), lambda co: L.attrs(
        band_col, L.BODY, paint=L.PAINT_BAND, uv=(0.0, (co.z - band_lo) / (band_hi - band_lo)))))
    pieces.append(L.Piece(L.lathe_bm(torso_rows, SEGMENTS, 1.0), lambda co: L.attrs(white, L.BODY)))

    # Bun-ears, each with its red fan, going with her head.
    bun_shapes = {}
    for side, idx in ((-1, L.EAR_L), (1, L.EAR_R)):
        frame, foot = place_bun(side, head_bvh)
        local = bun_bm()
        fan = fan_bm(local)
        L.transformed(local, frame)
        L.transformed(fan, frame)
        parts[idx]["pivot"] = foot
        parts[idx]["parent"] = L.HEAD
        bun_shapes[side] = (local.copy(), fan.copy())
        pieces.append(L.Piece(local, lambda co, idx=idx: L.attrs(cap, idx)))
        pieces.append(L.Piece(fan, lambda co, idx=idx: L.attrs(fan_col, idx, lift=0.4)))

    # Fin-hands, spread out from her sides; the two lines near each tip on both its faces.
    for side, idx, name in ((-1, L.ARM_L, "handL"), (1, L.ARM_R, "handR")):
        fin = fin_bm()
        if side < 0:
            # Mirrored: every face's winding turns over with it, so each is turned back exactly.
            fin.transform(Matrix.Scale(-1.0, 4, Vector((1.0, 0.0, 0.0))))
            bmesh.ops.reverse_faces(fin, faces=fin.faces[:])
        tip = max(abs(v.co.x) for v in fin.verts)
        lo, hi = IC.bounds([fin])
        lift = IC.limb_lift(lo, hi, 1.0)
        fin.normal_update()
        fin.verts.index_update()
        mid, gap = FIN_LINES
        lines = {}
        for v in fin.verts:
            # Off its faces (round its rim) the lines' coordinates run on out of their range.
            along = (tip - abs(v.co.x)) / tip
            lines[v.index] = ((v.co.z - mid) / gap, along if abs(v.normal.y) > 0.35 else 5.0)
        frame = fin_frame(side)
        tip_point = max(fin.verts, key=lambda v: abs(v.co.x)).co.copy()
        L.transformed(fin, frame)
        parts[idx]["pivot"] = frame @ Vector((0.0, 0.0, 0.0))
        anchors[name] = frame @ tip_point
        pieces.append(L.Piece(fin, lambda co, i, idx=idx, lines=lines, lift=lift:
                              L.attrs(white, idx, paint=L.PAINT_FIN, uv=lines[i], lift=lift), indexed=True))

    # The tail's curl round under her and up behind her, bending from the bowl (TAIL), scaled on along it,
    # and its heart-shaped fin.
    curl, curl_data, path = curl_bm()
    parts[L.TAIL]["pivot"] = path[len(path) // 5][0]

    def curl_attr(co, i):
        around, along, k = curl_data[i]
        return L.attrs(tail_col, L.BODY, L.TAIL, L.smoothstep(0.1, 0.7, k), paint=L.PAINT_SCALES, uv=(around, along))

    pieces.append(L.Piece(curl, curl_attr, indexed=True))
    pieces.append(L.Piece(heart_bm(path), lambda co: L.attrs(tail_col, L.BODY, L.TAIL, 1.0)))

    # Anchors and the face, in head radii; everything is scaled to her height after.
    top = max(max(v.co.z for v in bun_shapes[s][0].verts) for s in (-1, 1))
    head_top = max(v.co.z for v in head.verts)

    def hit_front(x, z):
        loc = head_bvh.ray_cast(Vector((x, -5.0, z)), Vector((0.0, 1.0, 0.0)))[0]
        return loc if loc is not None else Vector((x, -1.0, z))

    write_first_layers()
    layers, expressions = FA.load_face(None, FACE_DIR, log=log)
    face = FA.face_layout(layers, expressions)
    for name, b in zip(("eyeL", "eyeR"), sorted(face.get("eyes", [[-0.42, 0, 0, 0], [0.42, 0, 0, 0]]), key=lambda b: b[0])):
        anchors[name] = hit_front(b[0], EYE + b[1])
    mouth = face.get("mouth", [0.0, -0.22, 0.1, 0.05])
    anchors["mouth"] = hit_front(mouth[0], EYE + mouth[1])
    anchors["head"] = Vector((0.0, 0.0, head_top + 0.02))
    anchors["top"] = Vector((0.0, 0.0, top + 0.02))
    side_z = EYE + 0.3
    side_r = max(abs(v.co.x) for v in head.verts if abs(v.co.z - side_z) < 0.04)
    anchors["sideL"] = Vector((-side_r, -0.05, side_z))
    anchors["sideR"] = Vector((side_r, -0.05, side_z))

    # The guide to paint her face over: her head from the front, flat coloured, the cap black.
    bvhs = [head_bvh]
    for side in (-1, 1):
        bvhs += [BVHTree.FromBMesh(b) for b in bun_shapes[side]]
    srgb = {name: np.array(c) ** (1 / 2.2) for name, c in (("white", white), ("cap", cap), ("fan", fan_col))}

    def guide_colour(k, pts):
        if k == 0:
            return np.where((cap_sdf(pts) > 0.0)[:, None], srgb["cap"], srgb["white"])
        return np.broadcast_to(srgb["cap" if k % 2 else "fan"], (len(pts), 3))

    FA.write_guide(os.path.join(FACE_DIR, "_guide.png"), IC.front_view(bvhs, guide_colour, 1.0, EYE))
    for s in (-1, 1):
        for b in bun_shapes[s]:
            b.free()

    small = {name: FA.downsample(arr, FA.PAINT_SIZE // IC.FACE_SIZE) for name, arr in layers.items()}
    atlas, rects = IC.pack_layers(small)
    L.write_webp(os.path.join(IC.OUT_FACES, f"{ID}.webp"), atlas)
    log(f"face: {len(expressions)} expressions from {len(rects)} layers, atlas {atlas.shape[1]} x {atlas.shape[0]}")
    IC.write_mask(cap_mask(head), os.path.join(IC.OUT_MASKS, f"{ID}.webp"))

    obj = L.assemble(ID, pieces, collection, keep_uv="MaskUV")
    scale = HEIGHT / top
    obj.data.transform(Matrix.Scale(scale, 4))
    obj.data.update()
    R = scale
    for p in parts:
        p["pivot"] = p["pivot"] * scale
    anchors = {k: v * scale for k, v in anchors.items()}
    rig = {
        "version": 3,
        "id": ID,
        "source": "art/blender/build_siren.py, her head the downloaded models' Chiikawa's (" + HEAD_SOURCE + ")",
        "height": round(HEIGHT, 5),
        "width": round(2.0 * R, 5),
        "headR": round(R, 5),
        "eyeY": round(EYE * R, 5),
        "outline": IC.LINE,
        # Her fin-hands spread from her sides under her head; raised, they stay clear of it.
        "armReach": None,
        "maskColor": CAP,
        "maskTexture": f"models/masks/{ID}.webp",
        "parts": [{"pivot": L.to_three(p["pivot"]), "parent": p["parent"]} for p in parts],
        "anchors": {k: L.to_three(v) for k, v in anchors.items()},
        "patterns": {"skirt": None},
        "face": face,
        "faceAtlas": {"url": f"models/faces/{ID}.webp", "size": IC.FACE_SIZE, "layers": rects,
                      "expressions": expressions},
    }
    return obj, rig


def preview_copy(obj, scale):
    """A copy of her for the preview renders, its cap painted into its colours (the game draws the cap
    from its mask texture)."""
    copy = obj.copy()
    copy.data = obj.data.copy()
    obj.users_collection[0].objects.link(copy)
    mesh = copy.data
    col = mesh.color_attributes["Col"]
    paint = mesh.attributes["_paint"]
    cap = L.hex_color(CAP)
    head = [i for i in range(len(mesh.vertices)) if round(paint.data[i].value) == round(L.PAINT_BODY)]
    pts = np.array([mesh.vertices[i].co[:] for i in head]) / scale
    for i, black in zip(head, cap_sdf(pts) > 0.0):
        if black:
            col.data[i].color = (cap[0], cap[1], cap[2], 1.0)
    return copy


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    previews = "--no-previews" not in argv
    source = argv[argv.index("--source") + 1] if "--source" in argv else IC.DEFAULT_SOURCE
    head, _ = head_bm(source)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    collection = bpy.data.collections.new("siren")
    scene.collection.children.link(collection)

    obj, rig = build(collection, head)
    head.free()
    path = os.path.join(IC.OUT_MODELS, f"{ID}.glb")
    L.export_glb(obj, path, rig)
    tris = sum(len(p.vertices) - 2 for p in obj.data.polygons)
    log(f"BUILT {ID}: {len(obj.data.vertices)} verts, {tris} tris, height {rig['height']:.3f} m,"
        f" head radius {rig['headR']:.3f} m, eyes at {rig['eyeY']:.3f} m -> {path}")

    if previews:
        shown = preview_copy(obj, rig["headR"])
        obj.hide_render = True
        cam = L.setup_preview(scene)
        for p in L.render_turnaround(scene, cam, [shown], IC.OUT_PREVIEWS, ID, 720, 760,
                                     ortho_scale=HEIGHT * 1.25, target_z=HEIGHT * 0.5):
            log("PREVIEW", p)
        bpy.data.objects.remove(shown)
        obj.hide_render = False
    os.makedirs(os.path.dirname(OUT_BLEND), exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=OUT_BLEND, compress=True)
    log("SAVED", OUT_BLEND)


if __name__ == "__main__":
    main()
