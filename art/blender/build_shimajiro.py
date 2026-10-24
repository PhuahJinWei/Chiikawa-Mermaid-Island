"""島二郎 himself, the owner of the restaurant at the end of the riverside path, as a game character (his shop is
art/blender/shimajiro.py).

Shaped after the user's drawings of him from the front and three-quarters and the film's frames of him in his shop
(reference images `shimajiro himself front`, `shimajiro himself three quarter`, `[anime] shimajiro 1`, `shimajiro
interior 1` and `3`), 2026-10-25. He is modelled here in the cast's own form: the vertex format and rig every
character shares (charlib), a face painted by hand in layers (face_art, art/faces/shimajiro/) and the cast
converter's helpers (import_characters):

- his bald round head, round its middle as the front drawing's outline is (wider than tall, widest low, at his
  mustache, a dome over his eyes), a small onion-shaped topknot on its crown, a lightning bolt of grey hair on each side (its
  two prongs toward his face, as the film's) and a big handlebar mustache standing off his face, so that it shows
  in profile as the film's does; his eyes, brows, teeth and chin painted;
- a broad, heavy body: round shoulders, a chest, a big round belly and a round bottom, fused into one soft shape;
- strong arms that bend at the elbow and the wrist, ending in big fists, built hanging at his sides;
- short, sturdy legs with knees and bare feet with toes, turned a little out;
- a dark grey apron over the front of his hips, 味自慢 on it in white (a painting, art/faces/shimajiro/apron/,
  drawn into the model's mask texture), hung from a band round his waist that is knotted at his back, his back and
  bottom bare (the user's choice, 2026-10-25: no picture shows his back).

About 1.8 m tall to the topknot's tip (the user's choice, 2026-10-25): his own shop's size, as the film's frames set
him against his stool, table and door; twice Chiikawa's height.

Run (from the project root):
    "C:/Program Files/Blender Foundation/Blender 5.2/blender.exe" --background --factory-startup
        --disable-autoexec --python art/blender/build_shimajiro.py -- [--no-previews]

Outputs:
    public/models/shimajiro.glb            his model in the game's vertex format, with rig data
    public/models/faces/shimajiro.webp     his face's painted layers (art/faces/shimajiro/), packed
    public/models/masks/shimajiro.webp     his apron's lettering, which the game samples per pixel
    art/faces/shimajiro/_guide.png         his head from the front, mustache and all, to paint his face over
    art/faces/shimajiro/*.png              first face layers drawn here from the drawings, written only where none exist
    art/faces/shimajiro/apron/_guide.png   his apron's front, to letter over
    art/previews/shimajiro_*.png           front, three-quarter, side and back renders
    art/blender/shimajiro_himself.blend    the model, for opening in Blender

Coordinates are Blender's: Z up, he faces -Y, stands on z = 0 and is centred on the Z axis. Sizes in metres.
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
import build_siren as S  # noqa: E402  (the face drawing helpers)
import charlib as L  # noqa: E402
import face_art as FA  # noqa: E402
import import_characters as IC  # noqa: E402

ID = "shimajiro"
FACE_DIR = os.path.join(IC.FACES_SRC, ID)
APRON_DIR = os.path.join(FACE_DIR, "apron")
OUT_BLEND = os.path.join(IC.ROOT, "art", "blender", "shimajiro_himself.blend")

# His colours, the drawings': cream skin, grey-brown hair, the apron's dark grey and its white letters.
SKIN = "#FAE8C8"
HAIR = "#BAA290"
APRON = "#5A5454"
LETTERS = "#F6F3EA"

# His size, measured on the front drawing (849 pixels from the topknot's tip to his soles, 1.8 m).
EYE_Z = 1.463  # his eye line
R = 0.40  # his head's radius, half its width: as wide as Chiikawa's
NECK = Vector((0.0, 0.02, 1.2))  # what his head turns about
# His head round its middle, the front drawing's outline (radius, height; its foot, under his chin, hidden in his
# body), and how deep it is for its width.
HEAD_PROFILE = [(0.0, 1.107), (0.14, 1.117), (0.23, 1.138), (0.29, 1.164), (0.33, 1.189), (0.355, 1.215),
                (0.373, 1.24), (0.385, 1.266), (0.392, 1.291), (0.395, 1.317), (0.399, 1.342), (0.399, 1.367),
                (0.396, 1.393), (0.393, 1.418), (0.387, 1.444), (0.378, 1.469), (0.368, 1.495), (0.355, 1.52),
                (0.341, 1.545), (0.324, 1.571), (0.302, 1.596), (0.272, 1.622), (0.241, 1.647), (0.195, 1.673),
                (0.131, 1.698), (0.06, 1.709), (0.0, 1.713)]
HEAD_DEPTH = 0.92

# His body, fused from these (centre, radii): his trunk, his big belly before it (rounding into his chest, its top
# sloping in), his hips and his neck under his head; then, either side, the slope of his shoulders and the two
# rounds of his bottom. His chest is smooth, as the front drawing's.
TORSO = [
    ((0.0, 0.0, 0.83), (0.45, 0.34, 0.42)),
    ((0.0, -0.06, 0.70), (0.42, 0.34, 0.32)),
    ((0.0, 0.02, 0.50), (0.42, 0.30, 0.16)),
    ((0.0, 0.03, 1.2), (0.27, 0.22, 0.10)),
]
PAIRED = [
    ((0.25, 0.04, 1.07), (0.23, 0.19, 0.12)),
    ((0.14, 0.17, 0.47), (0.17, 0.15, 0.15)),
]

# His left arm (the model's +x side; the right is its mirror), as built: from the shoulder joint, inside the round
# of his shoulder, hanging down a little out and forward to the tip of his fist, which comes to his apron's top as
# the front drawing's do (it hangs at his side, as the user would have it). It bends at the elbow and the wrist,
# this far down it.
SHOULDER = Vector((0.41, 0.02, 1.08))
FIST_TIP = Vector((0.52, -0.04, 0.47))
ELBOW_AT, WRIST_AT = 0.275, 0.47
# Its shapes along it, in its own frame (x out from his side, y back, z up the arm, from the shoulder joint): the
# round of the shoulder, no wider than the front drawing's and under the slope from his neck (the user, 2026-10-25:
# "his shoulders are a little too big"), the upper arm with its biceps and triceps, the elbow, the forearm thick
# under the elbow, the wrist and a big fist, its knuckles forward.
ARM_BLOBS = [
    ((0.015, 0.0, -0.06), (0.125, 0.125, 0.13)),
    ((0.0, -0.03, -0.15), (0.09, 0.095, 0.11)),
    ((0.015, 0.03, -0.125), (0.085, 0.085, 0.11)),
    ((0.0, 0.012, -0.275), (0.084, 0.084, 0.084)),
    ((0.0, 0.0, -0.335), (0.096, 0.09, 0.08)),
    ((0.0, 0.0, -0.47), (0.066, 0.066, 0.066)),
    ((0.0, -0.008, -0.54), (0.088, 0.08, 0.085)),
    ((0.005, -0.045, -0.555), (0.08, 0.045, 0.05)),
]
ARM_BONES = [((0.0, 0.0, -0.02), (0.0, 0.0, -0.26), 0.1), ((0.0, 0.0, -0.285), (0.0, 0.0, -0.46), 0.076)]
ARM_BANDS = {"elbow": 0.05, "wrist": 0.035}  # how far either side of each joint the arm bends, along it

# His left leg (+x; the right its mirror): from the hip, inside his body, down a thick thigh under the apron to the
# knee, a short shin with its calf to the ankle, and a bare foot turned out, its toes along its front.
HIP = Vector((0.19, 0.03, 0.44))
KNEE = Vector((0.27, -0.02, 0.215))
ANKLE = Vector((0.275, 0.0, 0.085))
FOOT = {"centre": (0.29, -0.065, 0.045), "radii": (0.085, 0.13, 0.048), "out": 15.0, "toe": 0.022}

# The apron: a panel over the front of his hips from the band round his waist to over his knees, round his front as
# far as the front drawing's is wide (this far either side of his middle, in degrees), standing off him and hanging
# straight down from the band; the band round him (its bottom and top, how far off him and how thick: under the
# apron's top); the knot at his back.
APRON_TOP, APRON_BOTTOM = 0.585, 0.285
APRON_SPAN = 72.0
APRON_GAP = 0.012
APRON_THICK = 0.012
BAND = (0.555, 0.59, 0.002, 0.008)
# The lettering's place in the mask texture: the apron's front across its whole width, this high in the middle.
MASK_W, MASK_H = 1024, 512

# His topknot, an onion-shaped bun with a little point (r, z over his crown); the mustache's outline in head radii
# (across, up from the eye line), the front drawing's mirrored about its middle, from the top of its peak along its
# top edge to its tip and back along its bottom to the notch over his mouth, for his left half (+x); how thick it is
# and how far off his face. His side tufts are the user's drawing of one (`side tuft.png` in his face folder; the user,
# 2026-10-25: "replace the current side tuft's lightning shape with this, flipped horizontally on each side"), its right
# end toward his face on either side, as the film's prongs are; where it goes round his head (degrees from the front, its
# front end and its back), how high its middle is over the eye line and how long it is (head radii). The drawing's
# dark line is a piece of its own, the whole of the drawing, TUFT_THICK thick and TUFT_OFF off his head, and its grey
# fill a piece over it a little proud of it (TUFT_FILL, off the line's back), with no pen line round either: the line
# is the drawing's own, its tips drawn solid. Without the drawing, the film's (`[anime] shimajiro 1`, TUFT_FILM: along
# it from its prongs back to its tip, up, in its length) with the pen round it.
TOPKNOT = [(0.0, -0.012), (0.074, -0.012), (0.079, 0.006), (0.077, 0.024), (0.066, 0.042), (0.046, 0.056),
           (0.022, 0.064), (0.01, 0.07), (0.008, 0.082), (0.005, 0.091), (0.0, 0.094)]
MUSTACHE = [(0.0, -0.096), (0.1, -0.105), (0.217, -0.126), (0.32, -0.16), (0.39, -0.197), (0.46, -0.225),
            (0.52, -0.245), (0.46, -0.262), (0.39, -0.282), (0.28, -0.29), (0.17, -0.285), (0.1, -0.272),
            (0.075, -0.24), (0.035, -0.215), (0.0, -0.205)]
MUSTACHE_THICK, MUSTACHE_OFF = 0.026, 0.02
TUFT_PAINTING = os.path.join(FACE_DIR, "side tuft.png")
TUFT_FILM = [(1.003, 0.015), (0.663, 0.092), (0.238, 0.194), (0.247, 0.151), (0.374, 0.032), (0.0, 0.105),
             (0.034, 0.066), (0.357, -0.112), (0.663, -0.194), (0.706, -0.172), (0.612, -0.061), (0.969, -0.014)]
TUFT_SPAN = (66.0, 112.0)
TUFT_V = 0.02
TUFT_LEN = 0.67
TUFT_THICK, TUFT_OFF = 0.01, 0.003
TUFT_FILL = (0.003, 0.011)


def log(*a):
    print("SHIMAJIRO", *a)
    sys.stdout.flush()


# ---------------------------------------------------------------------------- shapes
def segment_bm(a, b, r, u=20, v=12):
    """A capsule from a to b, r round."""
    a, b = Vector(a), Vector(b)
    way = b - a
    return L.capsule_bm(a - way.normalized() * r, way, way.length, r, u=u, v=v)


def mirrored(bm):
    """A copy of a shape turned over left for right (x for -x), each face's winding turned back."""
    out = bm.copy()
    out.transform(Matrix.Scale(-1.0, 4, Vector((1.0, 0.0, 0.0))))
    bmesh.ops.reverse_faces(out, faces=out.faces[:])
    out.normal_update()
    return out


def fused(shapes, voxel, smooth=4, lam=0.6, tris=4000):
    out = L.fuse(shapes, voxel=voxel, smooth_iterations=smooth, smooth_lambda=lam, target_tris=tris)
    for s in shapes:
        s.free()
    return out


def head_bm():
    """His head, round its middle after the front drawing's outline (HEAD_PROFILE)."""
    bm = L.lathe_bm(L.Profile(HEAD_PROFILE, 44).samples, 64, HEAD_DEPTH)
    for f in bm.faces:
        f.smooth = True
    return bm


def torso_bm():
    shapes = [L.ellipsoid_bm(Vector(c), r, u=28, v=16) for c, r in TORSO]
    for (x, y, z), r in PAIRED:
        for side in (-1, 1):
            shapes.append(L.ellipsoid_bm(Vector((side * x, y, z)), r, u=24, v=14))
    return fused(shapes, 0.012, smooth=6, lam=0.8, tris=7000)


def arm_frame():
    """His left arm's frame: its origin the shoulder joint, z up the arm (from the fist), x out from his side."""
    way = (FIST_TIP - SHOULDER).normalized()
    z = -way
    x = Vector((1.0, 0.0, 0.0))
    x = (x - z * x.dot(z)).normalized()
    y = z.cross(x)
    return L.basis_matrix(x, y, z, SHOULDER), way


def arm_bm():
    """His left arm (the right is its mirror), straight as built."""
    frame, _ = arm_frame()
    shapes = [L.ellipsoid_bm(Vector(c), r, u=22, v=12) for c, r in ARM_BLOBS]
    shapes += [segment_bm(a, b, r) for a, b, r in ARM_BONES]
    bm = fused(shapes, 0.008, smooth=6, lam=0.75, tris=2600)
    bm.transform(frame)
    bm.normal_update()
    return bm


def leg_bm():
    """His left leg (the right is its mirror)."""
    shapes = [segment_bm(HIP, KNEE, 0.115), L.ellipsoid_bm(KNEE, (0.088, 0.088, 0.088)),
              segment_bm(KNEE, ANKLE, 0.076), L.ellipsoid_bm(Vector((0.275, 0.035, 0.165)), (0.074, 0.066, 0.075)),
              L.ellipsoid_bm(ANKLE, (0.07, 0.07, 0.07))]
    cx, cy, cz = FOOT["centre"]
    rx, ry, rz = FOOT["radii"]
    turn = Matrix.Rotation(math.radians(FOOT["out"]), 3, "Z")
    shapes.append(L.ellipsoid_bm(Vector((cx, cy, cz)), (rx, ry, rz), rot=turn))
    # Five toes along the foot's front, the big one on its inner side.
    for k in range(5):
        t = (k - 2) / 2.0
        local = Vector((t * rx * 0.72, -ry * 0.86 + abs(t) * 0.035, -rz * 0.25))
        r = FOOT["toe"] * (1.25 if k == 0 else 1.0 - 0.08 * k)
        shapes.append(L.ellipsoid_bm(Vector((cx, cy, cz)) + turn @ local, (r, r * 1.2, r * 0.9), u=12, v=8))
    return fused(shapes, 0.007, smooth=3, lam=0.6, tris=1800)


def topknot_bm(head_bvh):
    hit = head_bvh.ray_cast(Vector((0.0, 0.0, 3.0)), Vector((0.0, 0.0, -1.0)))[0]
    bm = L.lathe_bm(TOPKNOT, 32)
    bm.transform(Matrix.Translation(hit))
    return bm


def slab_bm(outline, thick, voxel, smooth=2):
    """A flat shape of the closed outline [(x, z)] in metres, thick along Y, its edges rounded."""
    slab = L.outline_slab_bm(outline, thick)
    return fused([slab], voxel, smooth=smooth, lam=0.5, tris=3000)


def flat_bm(outline, thick, most=0.04):
    """A flat shape of the closed outline [(x, z)] in metres, thick along Y, its edges as drawn (not fused, which
    would round them to its voxels), cut into triangles no longer than `most` so that it can be laid round his head."""
    bm = L.outline_slab_bm(outline, thick)
    for _ in range(8):
        long = [e for e in bm.edges if e.calc_length() > most]
        if not long:
            break
        bmesh.ops.subdivide_edges(bm, edges=long, cuts=1, use_grid_fill=True)
        bmesh.ops.triangulate(bm, faces=bm.faces[:])
    return bm


def mustache_bm(head_bvh):
    """His mustache, drawn flat and laid over his face, MUSTACHE_OFF off it."""
    right = [(x * R, EYE_Z + v * R) for x, v in MUSTACHE]
    left = [(-x, z) for x, z in reversed(right[1:-1])]
    bm = slab_bm(right + left, MUSTACHE_THICK, 0.003, smooth=1)
    for v in bm.verts:
        # Halfway between following his face round and standing straight across it, so that its ends come off his
        # cheeks and show in profile, as the film's does.
        middle = head_bvh.ray_cast(Vector((0.0, -5.0, v.co.z)), Vector((0.0, 1.0, 0.0)))[0]
        hit = head_bvh.ray_cast(Vector((v.co.x, -5.0, v.co.z)), Vector((0.0, 1.0, 0.0)))[0]
        face_y = hit.y if hit is not None else -R
        if middle is not None:
            face_y = (face_y + middle.y) / 2.0
        v.co.y = face_y - MUSTACHE_OFF - (MUSTACHE_THICK / 2.0 - v.co.y)
    bm.normal_update()
    return bm


# The marching squares' segments in a cell of four pixels, by which of them are in (top left 8, top right 4, bottom
# right 2, bottom left 1), between the middles of its top, right, bottom and left edges; two apart where two opposite
# corners are in alone.
SQUARES = {1: ["LB"], 2: ["BR"], 3: ["LR"], 4: ["TR"], 5: ["TR", "LB"], 6: ["TB"], 7: ["TL"], 8: ["TL"], 9: ["TB"],
           10: ["TL", "BR"], 11: ["TR"], 12: ["LR"], 13: ["BR"], 14: ["LB"]}


def outline_of(mask, eps=0.75):
    """The outline round the biggest shape in `mask` (bool, rows down), as points (x, y) in its pixels in order round
    it, straightened where it runs within `eps` pixels of a line: marching squares, chained, the longest loop kept."""
    m = np.pad(mask, 1)
    h, w = m.shape
    links = {}
    for y in range(h - 1):
        top, low = m[y], m[y + 1]
        for x in range(w - 1):
            case = (8 if top[x] else 0) | (4 if top[x + 1] else 0) | (2 if low[x + 1] else 0) | (1 if low[x] else 0)
            if case in (0, 15):
                continue
            mids = {"T": (2 * x + 1, 2 * y), "R": (2 * x + 2, 2 * y + 1), "B": (2 * x + 1, 2 * y + 2), "L": (2 * x, 2 * y + 1)}
            for a, b in SQUARES[case]:
                links.setdefault(mids[a], []).append(mids[b])
                links.setdefault(mids[b], []).append(mids[a])
    seen, loops = set(), []
    for start in links:
        if start in seen:
            continue
        loop, prev, cur = [start], start, links[start][0]
        seen.add(start)
        while cur != start and cur not in seen:
            loop.append(cur)
            seen.add(cur)
            a, b = links[cur]
            prev, cur = cur, (b if a == prev else a)
        loops.append(loop)
    loop = [(x / 2.0 - 1.0, y / 2.0 - 1.0) for x, y in max(loops, key=len)]

    def straightened(pts):
        if len(pts) < 3:
            return pts
        a, b = np.array(pts[0]), np.array(pts[-1])
        ab = b - a
        n = np.linalg.norm(ab)
        d = [abs(ab[0] * (p[1] - a[1]) - ab[1] * (p[0] - a[0])) / n if n > 1e-9 else np.linalg.norm(np.array(p) - a)
             for p in pts[1:-1]]
        i = int(np.argmax(d)) + 1
        if d[i - 1] <= eps:
            return [pts[0], pts[-1]]
        return straightened(pts[:i + 1])[:-1] + straightened(pts[i:])

    far = max(range(len(loop)), key=lambda i: (loop[i][0] - loop[0][0]) ** 2 + (loop[i][1] - loop[0][1]) ** 2)
    return straightened(loop[:far + 1])[:-1] + straightened(loop[far:] + loop[:1])[:-1]


def tuft_shapes():
    """The tuft's two outlines from the user's drawing of it (TUFT_PAINTING): the whole of it, its line round its
    fill, and its fill alone, each [(along, up)]: along it from its right end (toward his face) to its left, and up
    from its middle, both in its length. None where there is no drawing."""
    if not os.path.exists(TUFT_PAINTING):
        log("tuft: no drawing at", TUFT_PAINTING, "- the film's shape")
        return None
    art = FA.load_png(TUFT_PAINTING)
    drawn = art[..., 3] > 0.5
    fill = drawn & (art[..., :3].mean(axis=-1) > 0.42)
    ys, xs = np.nonzero(drawn)
    x0, x1, y0, y1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
    step = max(1, (x1 - x0) // 320)

    def smaller(m):
        m = m[y0:y1, x0:x1]
        h, w = (m.shape[0] // step) * step, (m.shape[1] // step) * step
        return m[:h, :w].reshape(h // step, step, w // step, step).mean(axis=(1, 3)) > 0.5

    whole, inner = smaller(drawn), smaller(fill)
    length, middle = float(whole.shape[1]), whole.shape[0] / 2.0
    shapes = [[((length - x) / length, (middle - y) / length) for x, y in outline_of(m)] for m in (whole, inner)]
    log(f"tuft: from {os.path.basename(TUFT_PAINTING)}, {whole.shape[0] / length:.3f} of its length high,"
        f" {len(shapes[0])} points round it and {len(shapes[1])} round its fill")
    return shapes


def tuft_bm(head_bvh, side, outline, back, front):
    """A piece of a tuft, its outline [(along, up)] in its length, laid on the side of his head (side -1 his right,
    1 his left), from `back` to `front` off it (past TUFT_OFF)."""
    length = TUFT_LEN * R
    thick = front - back
    bm = flat_bm([(a * length, w * length) for a, w in outline], thick)
    a0, a1 = TUFT_SPAN
    for v in bm.verts:
        along, up, off = v.co.x / length, v.co.z, back + v.co.y + thick / 2.0
        a = math.radians(a0 + along * (a1 - a0))
        z = EYE_Z + TUFT_V * R + up
        way = Vector((side * math.sin(a), -math.cos(a), 0.0))
        hit, normal, _, _ = head_bvh.ray_cast(Vector((0.0, 0.0, z)), way)
        if hit is None:
            hit, normal = Vector((0.0, 0.0, z)) + way * R, way
        v.co = hit + normal * (TUFT_OFF + off)
    # Laid on his left side it is turned over, as in a mirror (round the head one way, out of it the other): its faces
    # turned back, or the game, which draws them from the front only, would show it from inside.
    if side > 0:
        bmesh.ops.reverse_faces(bm, faces=bm.faces[:])
    bm.normal_update()
    return bm


def round_him(bvh, z, a):
    """Where a ray from his middle at height z, a radians round from his front, leaves the shape, and the way out
    there across (level); None where it does not."""
    way = Vector((math.sin(a), -math.cos(a), 0.0))
    hit, normal, _, _ = bvh.ray_cast(Vector((0.0, 0.02, z)), way)
    if hit is None:
        return None, way
    flat = Vector((normal.x, normal.y, 0.0))
    return hit, (flat.normalized() if flat.length > 1e-6 else way)


def apron_bm(torso_bvh):
    """The apron's panel: a grid round the front of his hips from the band down, APRON_GAP off him at the band and
    hanging straight down from there (out over him only where he is rounder below), APRON_THICK thick; its front's
    vertices (by index) and their places on its face (u across from his right, by the way round; v up), for the
    lettering."""
    nx, nz = 30, 12
    zs = [APRON_TOP - (APRON_TOP - APRON_BOTTOM) * j / nz for j in range(nz + 1)]
    inner, outer = [], []
    for i in range(nx + 1):
        a = math.radians(-APRON_SPAN + 2.0 * APRON_SPAN * i / nx)
        col_in, col_out = [], []
        at, out_way = None, None
        for z in zs:
            hit, way = round_him(torso_bvh, z, a)
            here = hit + way * APRON_GAP if hit is not None else None
            centre = Vector((0.0, 0.02, z))
            if at is None:
                at, out_way = (here, way) if here is not None else (centre + way * 0.45, way)
            elif here is not None and (here - centre).dot(way) > (Vector((at.x, at.y, z)) - centre).dot(way):
                at = here
            p = Vector((at.x, at.y, z))
            col_in.append(p)
            col_out.append(p + out_way * APRON_THICK)
        inner.append(col_in)
        outer.append(col_out)
    bm = bmesh.new()
    front = [[bm.verts.new(outer[i][j]) for i in range(nx + 1)] for j in range(nz + 1)]
    back = [[bm.verts.new(inner[i][j]) for i in range(nx + 1)] for j in range(nz + 1)]
    # Across it by the way round its top, so that the letters keep their shapes where it turns round him.
    run = [0.0]
    for i in range(1, nx + 1):
        run.append(run[-1] + (outer[i][0] - outer[i - 1][0]).length)
    xs = [r / run[-1] for r in run]
    for j in range(nz):
        for i in range(nx):
            bm.faces.new((front[j][i], front[j + 1][i], front[j + 1][i + 1], front[j][i + 1]))
            bm.faces.new((back[j][i], back[j][i + 1], back[j + 1][i + 1], back[j + 1][i]))
    ring = [(0, i) for i in range(nx + 1)] + [(j, nx) for j in range(1, nz + 1)]
    ring += [(nz, i) for i in range(nx - 1, -1, -1)] + [(j, 0) for j in range(nz - 1, 0, -1)]
    for (j0, i0), (j1, i1) in zip(ring, ring[1:] + ring[:1]):
        bm.faces.new((front[j0][i0], back[j0][i0], back[j1][i1], front[j1][i1]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    bm.verts.index_update()
    places = {}
    for j, z in enumerate(zs):
        for i, u in enumerate(xs):
            places[front[j][i].index] = (u, (z - APRON_BOTTOM) / (APRON_TOP - APRON_BOTTOM))
    log(f"apron: {run[-1]:.3f} m across its top, {APRON_TOP - APRON_BOTTOM:.3f} m down")
    uv = bm.loops.layers.uv.new("MaskUV")
    lo, span = mask_band(run[-1])
    for f in bm.faces:
        for loop in f.loops:
            u, v = places.get(loop.vert.index, (0.0, 0.0))
            loop[uv].uv = (u, lo + v * span)
    return bm, places, run[-1]


def mask_band(width):
    """Where the apron's front (`width` across) is in the mask texture's height (Blender's v, from its foot): as
    high as keeps its proportions, in the middle."""
    span = min(1.0, (MASK_W * (APRON_TOP - APRON_BOTTOM) / width) / MASK_H)
    return (1.0 - span) / 2.0, span


def band_bm(torso_bvh):
    """The band round his waist that the apron hangs from, under the apron's top, and its knot at his back."""
    z0, z1, off, thick = BAND
    steps = 48
    rings = []
    for z in (z0, z1):
        outer, inner = [], []
        for k in range(steps):
            a = 2.0 * math.pi * k / steps
            hit, way = round_him(torso_bvh, z, a)
            if hit is None:
                hit = Vector((0.0, 0.02, z)) + way * 0.4
            outer.append(hit + way * (off + thick))
            inner.append(hit + way * off)
        rings.append((outer, inner))
    bm = bmesh.new()
    (o0, i0), (o1, i1) = rings
    vo0, vi0 = [bm.verts.new(p) for p in o0], [bm.verts.new(p) for p in i0]
    vo1, vi1 = [bm.verts.new(p) for p in o1], [bm.verts.new(p) for p in i1]
    for k in range(steps):
        n = (k + 1) % steps
        bm.faces.new((vo0[k], vo0[n], vo1[n], vo1[k]))
        bm.faces.new((vi0[n], vi0[k], vi1[k], vi1[n]))
        bm.faces.new((vo1[k], vo1[n], vi1[n], vi1[k]))
        bm.faces.new((vi0[k], vi0[n], vo0[n], vo0[k]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    # The knot at the middle of his back, and its two ends hanging down from it.
    back = (o0[steps // 2] + o1[steps // 2]) / 2.0
    knot = [L.ellipsoid_bm(back + Vector((0.0, 0.012, 0.0)), (0.05, 0.03, 0.034), u=16, v=10)]
    for side in (-1, 1):
        top = back + Vector((side * 0.02, 0.018, -0.01))
        foot = top + Vector((side * 0.045, 0.02, -0.12))
        knot.append(segment_bm(top, foot, 0.022, u=12, v=8))
    tie = fused(knot, 0.005, smooth=2, lam=0.5, tris=900)
    return bm, tie


# ---------------------------------------------------------------------------- his face's first layers
# Drawn after the front drawing into art/faces/shimajiro/ where there are none yet, for the user to paint over:
# small round eyes ringed in black with a black pupil, short wavy brows (a little frown mark by his right one), his
# mouth under the mustache's notch, dark, one tooth hanging over three, and the curve of his chin. Lines in black
# (the game turns them to the film's brown), as wide as the drawing's: 1.5 cm on his face, whose canvas spans two
# head radii (0.8 m) over 1536 pixels.
PEN_PX = 28.0
EYE_X = 0.2
BLACK = (0.0, 0.0, 0.0)
WHITE = (1.0, 1.0, 1.0)
MOUTH_IN = (0.13, 0.08, 0.07)
EXPRESSIONS_TXT = """# 島二郎: which layers make up each expression (see ../README.md).
# The first layers were drawn by art/blender/build_shimajiro.py after the user's drawings of him, as templates
# to paint over; it never overwrites them. His mustache is part of his model, not a layer: _guide.png shows it.
# His one face so far is his scowl with his teeth showing; expressions without a line show it.
Neutral: brows 1 + eyes open + mouth closed
"""


def smooth_line(pts, rounds=2):
    """A hand's line through points (Chaikin)."""
    for _ in range(rounds):
        bent = [pts[0]]
        for a, b in zip(pts, pts[1:]):
            bent += [(a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25), (a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75)]
        pts = bent + [pts[-1]]
    return pts


def draw_eyes(kind):
    sh = S.Sheet()
    for ex in (-EYE_X, EYE_X):
        if kind == "open":
            sh.put(S.ellipse_sdf(sh, ex, 0.0, 0.088, 0.088), BLACK)
            sh.put(S.ellipse_sdf(sh, ex, 0.0, 0.054, 0.054), WHITE)
            sh.put(S.ellipse_sdf(sh, ex, -0.004, 0.03, 0.03), BLACK)
            sh.put(S.ellipse_sdf(sh, ex - 0.01, 0.008, 0.009, 0.009), WHITE)
        else:
            sh.put(S.polyline_sdf(sh, S.curve((ex - 0.075, 0.005), (ex, -0.05), (ex + 0.075, 0.005)), PEN_PX), BLACK)
    return sh.rgba


def draw_brows():
    sh = S.Sheet()
    right = smooth_line([(-0.3, 0.175), (-0.255, 0.2), (-0.21, 0.168), (-0.155, 0.19)])
    left = smooth_line([(0.09, 0.19), (0.14, 0.168), (0.195, 0.2), (0.235, 0.185), (0.275, 0.176)])
    for pts in (right, left):
        sh.put(S.polyline_sdf(sh, pts, PEN_PX), BLACK)
    sh.put(S.polyline_sdf(sh, [(-0.093, 0.196), (-0.072, 0.142)], PEN_PX * 0.9), BLACK)
    return sh.rgba


def draw_mouth(kind):
    sh = S.Sheet()
    bottom = -0.36 if kind == "closed" else -0.43
    hole = [(-0.066, -0.2), (0.066, -0.2), (0.072, -0.26), (0.06, bottom + 0.025), (0.03, bottom), (-0.03, bottom),
            (-0.06, bottom + 0.025), (-0.072, -0.26)]
    sdf = S.polygon_sdf(sh, hole)
    sh.put(sdf, MOUTH_IN)
    # One tooth hanging from under the mustache's middle, three along the mouth's foot.
    sh.put(np.maximum(S.polygon_sdf(sh, [(-0.022, -0.19), (0.022, -0.19), (0.02, -0.255), (-0.02, -0.255)]), sdf), WHITE)
    for x0, x1 in ((-0.062, -0.026), (-0.018, 0.018), (0.026, 0.062)):
        top = bottom + 0.045
        sh.put(np.maximum(S.polygon_sdf(sh, [(x0, top), (x1, top), (x1, bottom - 0.01), (x0, bottom - 0.01)]), sdf), WHITE)
    sh.put(np.abs(sdf) - PEN_PX * 0.45, BLACK)
    sh.put(S.polyline_sdf(sh, S.curve((-0.09, bottom - 0.07), (0.0, bottom - 0.13), (0.09, bottom - 0.075)), PEN_PX), BLACK)
    return sh.rgba


def write_first_layers():
    """His face's first layers and expressions.txt, written only where there are none yet: the user paints over
    them, and nothing here ever overwrites a layer that is there."""
    os.makedirs(FACE_DIR, exist_ok=True)
    layers = {
        "brows 1": draw_brows,
        "eyes open": lambda: draw_eyes("open"),
        "eyes closed": lambda: draw_eyes("closed"),
        "mouth closed": lambda: draw_mouth("closed"),
        "mouth half-open": lambda: draw_mouth("half-open"),
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


# ---------------------------------------------------------------------------- his apron's lettering
def resize(arr, w, h):
    """An image (float, rows first) resampled to w x h, bilinearly."""
    sh, sw = arr.shape[:2]
    ys = np.clip((np.arange(h) + 0.5) * sh / h - 0.5, 0, sh - 1)
    xs = np.clip((np.arange(w) + 0.5) * sw / w - 0.5, 0, sw - 1)
    y0, x0 = np.floor(ys).astype(int), np.floor(xs).astype(int)
    y1, x1 = np.minimum(y0 + 1, sh - 1), np.minimum(x0 + 1, sw - 1)
    fy, fx = (ys - y0)[:, None, None], (xs - x0)[None, :, None]
    top = arr[y0][:, x0] * (1 - fx) + arr[y0][:, x1] * fx
    low = arr[y1][:, x0] * (1 - fx) + arr[y1][:, x1] * fx
    return top * (1 - fy) + low * fy


def lettering(width):
    """The apron's lettering, the newest painting in art/faces/shimajiro/apron/ (white paint on a clear ground; what
    is painted is lettered), as the mask over the apron's front (`width` across): 1 where there are letters, bottom
    row first."""
    paintings = [os.path.join(APRON_DIR, f) for f in os.listdir(APRON_DIR)
                 if f.lower().endswith(".png") and not f.startswith("_")] if os.path.isdir(APRON_DIR) else []
    mask = np.zeros((MASK_H, MASK_W), dtype=np.float32)
    if not paintings:
        log("apron: no painting in", APRON_DIR, "- left plain")
        return mask, None
    path = max(paintings, key=os.path.getmtime)
    art = FA.load_png(path)
    lo, span = mask_band(width)
    rows = max(1, round(span * MASK_H))
    alpha = resize(art[..., 3:4], MASK_W, rows)[..., 0]
    start = round(lo * MASK_H)
    mask[start:start + rows] = alpha[::-1]
    log(f"apron: lettered from {os.path.basename(path)} ({art.shape[1]} x {art.shape[0]})")
    return mask, art.shape[:2]


def write_apron_guide(shape):
    """The apron's front to letter over: its grey, the size of its painting (or the first one's), a dashed margin."""
    h, w = shape if shape else (540, 1572)
    rgba = np.ones((h, w, 4), dtype=np.float32)
    rgba[..., :3] = np.array(L.hex_color(APRON)) ** (1 / 2.2)
    dash = (np.arange(max(w, h)) // 24) % 2 == 0
    m = max(4, round(0.06 * h))
    edge = np.array([0.55, 0.75, 0.95], dtype=np.float32)
    rgba[m:m + 2, :w][:, dash[:w]] = np.append(edge, 1.0)
    rgba[h - m - 2:h - m, :w][:, dash[:w]] = np.append(edge, 1.0)
    rgba[:h, m:m + 2][dash[:h]] = np.append(edge, 1.0)
    rgba[:h, w - m - 2:w - m][dash[:h]] = np.append(edge, 1.0)
    os.makedirs(APRON_DIR, exist_ok=True)
    FA.write_png(os.path.join(APRON_DIR, "_guide.png"), FA.to_uint8(rgba))


# ---------------------------------------------------------------------------- build
def build(collection, head):
    parts = [{"pivot": Vector((0.0, 0.0, 0.0)), "parent": -1} for _ in range(L.MAX_PARTS)]
    anchors = {}
    skin, hair, cloth = L.hex_color(SKIN), L.hex_color(HAIR), L.hex_color(APRON)
    pieces = []
    head_bvh = BVHTree.FromBMesh(head)

    # His head, his face painted on its front; what grows on it goes with it as it turns.
    parts[L.HEAD]["pivot"] = NECK.copy()

    def head_attr(co):
        uv = (0.5 + co.x / (2.0 * R), 0.5 + (co.z - EYE_Z) / (2.0 * R))
        return L.attrs(skin, L.HEAD, paint=L.PAINT_BODY, uv=uv)

    knot = topknot_bm(head_bvh)
    stache = mustache_bm(head_bvh)
    # His side tufts: the user's drawing, its line and its fill over it with no pen round them; else the film's.
    ink = L.hex_color("#3B2620")
    drawn = tuft_shapes()
    tufts, lines = [], []
    for side in (-1, 1):
        if drawn:
            lines.append(tuft_bm(head_bvh, side, drawn[0], 0.0, TUFT_THICK))
            tufts.append(tuft_bm(head_bvh, side, drawn[1], *TUFT_FILL))
        else:
            tufts.append(tuft_bm(head_bvh, side, TUFT_FILM, 0.0, TUFT_THICK))
    shapes_on_head = [knot, stache] + tufts + lines
    guide_bvhs = [head_bvh] + [BVHTree.FromBMesh(b) for b in shapes_on_head]
    guide_colours = ["skin", "hair", "hair"] + ["hair"] * len(tufts) + ["ink"] * len(lines)
    top = max(v.co.z for v in knot.verts)
    pieces.append(L.Piece(head.copy(), head_attr))
    for b in (knot, stache):
        pieces.append(L.Piece(b, lambda co: L.attrs(hair, L.HEAD)))
    line = 0.0 if drawn else 1.0
    for b in tufts:
        pieces.append(L.Piece(b, lambda co: L.attrs(hair, L.HEAD, outline=line)))
    for b in lines:
        pieces.append(L.Piece(b, lambda co: L.attrs(ink, L.HEAD, outline=0.0)))

    # His body.
    torso = torso_bm()
    torso_bvh = BVHTree.FromBMesh(torso)

    # His legs, each turning about its hip; their lines pulled toward the camera as a limb's.
    left_leg = leg_bm()
    for side, idx in ((-1, L.FOOT_L), (1, L.FOOT_R)):
        bm = left_leg.copy() if side > 0 else mirrored(left_leg)
        parts[idx]["pivot"] = Vector((side * HIP.x, HIP.y, HIP.z))
        lo, hi = IC.bounds([bm])
        lift = IC.limb_lift(lo, hi, R)
        pieces.append(L.Piece(bm, lambda co, idx=idx, lift=lift: L.attrs(skin, idx, lift=lift)))
    left_leg.free()

    # The apron over them, its band and knot.
    apron, places, apron_width = apron_bm(torso_bvh)
    pieces.append(L.Piece(apron, lambda co, i: L.attrs(cloth, L.BODY, mask=1.0 if i in places else 0.0), indexed=True))
    band, tie = band_bm(torso_bvh)
    pieces.append(L.Piece(band, lambda co: L.attrs(cloth, L.BODY)))
    pieces.append(L.Piece(tie, lambda co: L.attrs(cloth, L.BODY)))
    pieces.append(L.Piece(torso, lambda co: L.attrs(skin, L.BODY)))

    # His arms: each point follows the upper arm, the forearm or the fist, or two of them across the elbow and the
    # wrist, by how far down the arm it is; their lines pulled toward the camera as a limb's, so they show over him.
    _, way_left = arm_frame()
    left_arm = arm_bm()
    for side, ids, name in ((-1, (L.ARM_L, L.ARM_L2, L.PAW_L), "handL"), (1, (L.ARM_R, L.ARM_R2, L.PAW_R), "handR")):
        bm = left_arm.copy() if side > 0 else mirrored(left_arm)
        shoulder = Vector((side * SHOULDER.x, SHOULDER.y, SHOULDER.z))
        way = Vector((side * way_left.x, way_left.y, way_left.z))
        upper, fore, paw = ids
        parts[upper]["pivot"] = shoulder
        parts[fore]["pivot"], parts[fore]["parent"] = shoulder + way * ELBOW_AT, upper
        parts[paw]["pivot"], parts[paw]["parent"] = shoulder + way * WRIST_AT, fore
        tip = max(bm.verts, key=lambda v: (v.co - shoulder).dot(way)).co
        anchors[name] = shoulder + way * (tip - shoulder).dot(way)
        e0, e1 = ELBOW_AT - ARM_BANDS["elbow"], ELBOW_AT + ARM_BANDS["elbow"]
        w0, w1 = WRIST_AT - ARM_BANDS["wrist"], WRIST_AT + ARM_BANDS["wrist"]

        def arm_attr(co, ids=ids, shoulder=shoulder, way=way, e0=e0, e1=e1, w0=w0, w1=w1):
            upper, fore, paw = ids
            u = (co - shoulder).dot(way)
            e = L.smoothstep(e0, e1, u)
            if e < 1.0:
                return L.attrs(skin, upper, fore, e, lift=1.0)
            return L.attrs(skin, fore, paw, L.smoothstep(w0, w1, u), lift=1.0)

        pieces.append(L.Piece(bm, arm_attr))
        log(f"ARM {name}: {(anchors[name] - shoulder).length:.3f} m from shoulder to fist tip")
    left_arm.free()

    # Anchors and the face.
    def hit_front(x, z):
        loc = head_bvh.ray_cast(Vector((x, -5.0, z)), Vector((0.0, 1.0, 0.0)))[0]
        return loc if loc is not None else Vector((x, -R, z))

    write_first_layers()
    layers, expressions = FA.load_face(None, FACE_DIR, log=log)
    face = FA.face_layout(layers, expressions)
    for name, b in zip(("eyeL", "eyeR"), sorted(face.get("eyes", [[-EYE_X, 0, 0, 0], [EYE_X, 0, 0, 0]]), key=lambda b: b[0])):
        anchors[name] = hit_front(b[0] * R, EYE_Z + b[1] * R)
    mouth = face.get("mouth", [0.0, -0.27, 0.07, 0.07])
    anchors["mouth"] = hit_front(mouth[0] * R, EYE_Z + mouth[1] * R)
    anchors["head"] = Vector((0.0, 0.0, HEAD_PROFILE[-1][1] + 0.02))
    anchors["top"] = Vector((0.0, 0.0, top + 0.02))
    side_z = EYE_Z + 0.3 * R
    side_r = max(abs(v.co.x) for v in head.verts if abs(v.co.z - side_z) < 0.02)
    anchors["sideL"] = Vector((-side_r, -0.02, side_z))
    anchors["sideR"] = Vector((side_r, -0.02, side_z))

    # The guide to paint his face over: his head from the front, flat coloured, mustache, topknot and tufts on it.
    srgb = {k: np.array(c) ** (1 / 2.2) for k, c in (("skin", skin), ("hair", hair), ("ink", ink))}
    FA.write_guide(os.path.join(FACE_DIR, "_guide.png"),
                   IC.front_view(guide_bvhs, lambda k, pts: np.broadcast_to(srgb[guide_colours[k]], (len(pts), 3)), R, EYE_Z))

    small = {name: FA.downsample(arr, FA.PAINT_SIZE // IC.FACE_SIZE) for name, arr in layers.items()}
    atlas, rects = IC.pack_layers(small)
    L.write_webp(os.path.join(IC.OUT_FACES, f"{ID}.webp"), atlas)
    log(f"face: {len(expressions)} expressions from {len(rects)} layers, atlas {atlas.shape[1]} x {atlas.shape[0]}")
    mask, painted = lettering(apron_width)
    write_apron_guide(painted)
    IC.write_mask(mask, os.path.join(IC.OUT_MASKS, f"{ID}.webp"))

    obj = L.assemble(ID, pieces, collection, keep_uv="MaskUV")
    xs = [abs(v.co.x) for v in obj.data.vertices]
    width = 2.0 * max(xs)
    rig = {
        "version": 3,
        "id": ID,
        "source": "art/blender/build_shimajiro.py",
        "height": round(top, 5),
        "width": round(width, 5),
        "headR": round(R, 5),
        "eyeY": round(EYE_Z, 5),
        "outline": IC.LINE,
        # His arms hang from his shoulders, well clear of his head.
        "armReach": None,
        "maskColor": LETTERS,
        "maskLine": False,
        "maskTexture": f"models/masks/{ID}.webp",
        "parts": [{"pivot": L.to_three(p["pivot"]), "parent": p["parent"]} for p in parts],
        "anchors": {k: L.to_three(v) for k, v in anchors.items()},
        "patterns": {"skirt": None},
        "face": face,
        "faceAtlas": {"url": f"models/faces/{ID}.webp", "size": IC.FACE_SIZE, "layers": rects,
                      "expressions": expressions},
    }
    return obj, rig


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    previews = "--no-previews" not in argv
    head = head_bm()
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    collection = bpy.data.collections.new(ID)
    scene.collection.children.link(collection)

    obj, rig = build(collection, head)
    head.free()
    path = os.path.join(IC.OUT_MODELS, f"{ID}.glb")
    L.export_glb(obj, path, rig)
    tris = sum(len(p.vertices) - 2 for p in obj.data.polygons)
    log(f"BUILT {ID}: {len(obj.data.vertices)} verts, {tris} tris, height {rig['height']:.3f} m, width {rig['width']:.3f} m,"
        f" head radius {rig['headR']:.3f} m, eyes at {rig['eyeY']:.3f} m -> {path}")

    if previews:
        cam = L.setup_preview(scene)
        for p in L.render_turnaround(scene, cam, [obj], IC.OUT_PREVIEWS, ID, 720, 760,
                                     ortho_scale=rig["height"] * 1.25, target_z=rig["height"] * 0.5):
            log("PREVIEW", p)
    os.makedirs(os.path.dirname(OUT_BLEND), exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=OUT_BLEND, compress=True)
    log("SAVED", OUT_BLEND)


if __name__ == "__main__":
    main()
