"""Build the props in Blender and export them for the game.

Run (from the project root):
    blender --background --factory-startup --python art/blender/build_props.py -- [--only palm] [--no-previews]

Outputs:
    public/models/props/<id>.glb   props the game loads (vertex colours, no materials)
    art/blender/props.blend         all props, for opening in Blender
    art/previews/prop_<id>.png      one three-quarter render per prop

Coordinates are Blender's: Z up, props face -Y. Each prop's origin is where it
touches the ground, except the hand-held ones (the onigiri, Kurimanju's can,
Rakko's sword and ukulele), whose origin is their centre or where they are held.
"""

import json
import math
import os
import sys

import bmesh
import bpy
from mathutils import Matrix, Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import charlib as L  # noqa: E402

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
OUT_MODELS = os.path.join(ROOT, "public", "models", "props")
OUT_PREVIEWS = os.path.join(ROOT, "art", "previews")
OUT_BLEND = os.path.join(ROOT, "art", "blender", "props.blend")

C = {k: L.hex_color(v) for k, v in {
    "trunkA": "#A47B52",
    "trunkB": "#8A6440",
    "leafA": "#3FA34D",
    "leafB": "#4DB35A",
    "coconut": "#6B4A2E",
    "ink": "#66432F",  # the world's pen colour, for lines painted onto props
    "bark": "#9C6B43",
    "board": "#D9B483",
    "rope": "#54473D",
    "logEnd": "#D9B98C",
    "logRing": "#C49A6C",
    "white": "#FFFFFF",
    "rice": "#FFFDF8",
    "nori": "#22302A",
    "wing": "#3E8EE8",
    "wingLight": "#8CC4F7",
    "canMetal": "#D3D8DE",
    "canLabel": "#E6B23E",
    # Rakko's sword, from the user's drawing of it: a grey blade, its guard, grip and pommel white. The blade is
    # a cool grey so that it reads grey in the game, where the sun's warm light on what is held turned the
    # drawing's own grey (#CFD0CD) beige (the user, 2026-10-22: "should be grey").
    "swordBlade": "#C6D0E6",
    "swordGuard": "#F7F7F4",
    # Rakko's ukulele: no frame of it yet, so a plain one, of honey wood with a darker neck.
    "ukeBody": "#D9A066",
    "ukeNeck": "#6E4428",
    "ukeHole": "#3B2620",
    "ukeBridge": "#5A3A22",
    "ukePeg": "#F2EAD8",
}.items()}
UP = Vector((0.0, 0.0, 1.0))
PEN = 0.018  # the world's pen in metres (2% of a cast member's height), for painted lines


def segment_bm(a, b, r0, r1, segments=10):
    """Truncated cone from point a to point b."""
    length = (b - a).length
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=segments,
                          radius1=r0, radius2=r1, depth=length * 1.04)
    rot = UP.rotation_difference((b - a).normalized()).to_matrix().to_4x4()
    return L.transformed(bm, Matrix.Translation((a + b) * 0.5) @ rot)


def strip_bm(left, right):
    """Quad strip between two matching point lists."""
    bm = bmesh.new()
    lv = [bm.verts.new(p) for p in left]
    rv = [bm.verts.new(p) for p in right]
    for i in range(len(left) - 1):
        bm.faces.new((lv[i], rv[i], rv[i + 1], lv[i + 1]))
    return bm


def frond_bm(center, side, width, thickness=0.05, rows=28):
    """A palm frond as one solid blade with a sawtooth edge, drooping at the sides.

    center(s) is the midrib for s from base (0) to tip (1); side is the horizontal direction
    across the blade. A solid blade, unlike single-sided leaflets, can carry the world's
    outline, and its zigzag edge reads as a frond at a glance.
    """
    bm = bmesh.new()
    ring = []
    for i in range(rows + 1):
        s = 0.03 + 0.97 * i / rows
        c = center(s)
        tangent = (center(min(1.0, s + 0.01)) - center(max(0.0, s - 0.01))).normalized()
        normal = tangent.cross(side).normalized()
        if normal.z < 0:
            normal = -normal
        half = width * math.sin(math.pi * s) ** 0.7 * (1.0 if i % 2 == 0 else 0.6)
        t = thickness * (1.0 - 0.8 * s)
        droop = -UP * (0.3 * half)
        ring.append([bm.verts.new(c + side * half + droop), bm.verts.new(c + normal * (t / 2)),
                     bm.verts.new(c - side * half + droop), bm.verts.new(c - normal * (t / 2))])
    for a, b in zip(ring, ring[1:]):
        for k in range(4):
            bm.faces.new((a[k], a[(k + 1) % 4], b[(k + 1) % 4], b[k]))
    bm.faces.new(ring[0])
    bm.faces.new(list(reversed(ring[-1])))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    return bm


def midrib_bm(center, side, width, lift, s0=0.06, s1=0.9, rows=20):
    """A thin strip along a frond's midrib, just above its top: an ink line painted on."""
    left, right, up = [], [], None
    for i in range(rows + 1):
        s = s0 + (s1 - s0) * i / rows
        c = center(s)
        tangent = (center(min(1.0, s + 0.01)) - center(max(0.0, s - 0.01))).normalized()
        normal = tangent.cross(side).normalized()
        if normal.z < 0:
            normal = -normal
        up = up or normal
        lift_s = lift * (1.0 - 0.8 * s)
        left.append(c + normal * lift_s + side * (width / 2))
        right.append(c + normal * lift_s - side * (width / 2))
    bm = strip_bm(left, right)
    # Single-sided: make sure it faces up, where the camera sees it.
    bm.normal_update()
    bm.faces.ensure_lookup_table()
    if bm.faces[0].normal.dot(up) < 0:
        bmesh.ops.reverse_faces(bm, faces=bm.faces[:])
    return bm


def disc_bm(center, normal, radius, segments=16):
    bm = bmesh.new()
    bmesh.ops.create_circle(bm, cap_ends=True, cap_tris=True, segments=segments, radius=radius)
    rot = UP.rotation_difference(normal.normalized()).to_matrix().to_4x4()
    return L.transformed(bm, Matrix.Translation(center) @ rot)


def band_bm(outer, inner, normal):
    """A flat band between a ring of points and a matching ring inside it, or, when `inner` is
    one point, the disc out to the ring; its faces turned to `normal`."""
    bm = bmesh.new()
    rim = [bm.verts.new(p) for p in outer]
    count = len(rim)
    if isinstance(inner, Vector):
        hub = bm.verts.new(inner)
        for i in range(count):
            bm.faces.new((hub, rim[i], rim[(i + 1) % count]))
    else:
        hole = [bm.verts.new(p) for p in inner]
        for i in range(count):
            j = (i + 1) % count
            bm.faces.new((rim[i], rim[j], hole[j], hole[i]))
    bm.normal_update()
    if bm.faces[:][0].normal.dot(normal) < 0:
        bmesh.ops.reverse_faces(bm, faces=bm.faces[:])
    return bm


# ---------------------------------------------------------------------------- props
def build_palm(collection):
    """Leaning coconut palm, about 5.8 m tall, with solid jagged fronds that take an outline."""
    height, lean, n = 5.8, 0.22, 7
    pts = [Vector((math.sin(t * math.pi * 0.5) * lean * height, 0.0, t * height))
           for t in (i / n for i in range(n + 1))]
    pieces = []
    for i in range(n):
        r0 = 0.24 - 0.09 * (i / n)
        pieces.append((segment_bm(pts[i], pts[i + 1], r0, r0 - 0.014, segments=8), C["trunkA"] if i % 2 else C["trunkB"]))
    top = pts[-1]

    fronds = 9
    far = [(segment_bm(pts[0], top, 0.24, 0.15, segments=5), C["trunkB"])]
    for k in range(fronds):
        theta = (k / fronds) * 2 * math.pi + math.sin(k * 7.3) * 0.2
        d = Vector((math.cos(theta), math.sin(theta), 0.0))
        side = Vector((-math.sin(theta), math.cos(theta), 0.0))
        length = 2.5 + 0.4 * math.sin(k * 3.1)

        def center(s):
            return top + d * (s * length) + UP * (0.55 * math.sin(s * math.pi * 0.6) - 1.5 * s * s)

        pieces.append((frond_bm(center, side, 0.62, rows=12), C["leafA"] if k % 2 else C["leafB"]))
        pieces.append((midrib_bm(center, side, PEN, 0.03, rows=6), C["ink"]))
        if k % 2 == 0:
            far.append((frond_bm(center, side, 0.66, rows=4), C["leafA"]))

    for i in range(3):
        a = i / 3 * 2 * math.pi
        pos = top + Vector((math.cos(a) * 0.2, math.sin(a) * 0.2, -0.22))
        pieces.append((L.ellipsoid_bm(pos, (0.15, 0.15, 0.16), u=8, v=5), C["coconut"]))
    palm = L.assemble_colored("palm", pieces, collection)
    distant = L.assemble_colored("palm_far", far, collection)
    return [palm, distant], {"footprint": {"circle": 0.28}, "height": 6.0, "sink": 0.05}


def paint_auto(bare=(), barks=()):
    """What a prop's Painter paints (see paintmap.Painter), as 島二郎's wood is painted: a piece of the
    `barks` colours as bark, one of the `bare` colours (or grained) as wood out in the weather (see
    houses.wood_auto); the rest (a log's pale cut ends, ropes, leaves) keeps its own colours."""
    import houses as H
    wood = H.wood_auto(True, bare=bare, palette=False)
    bark_c = [tuple(c) for c in barks]

    def auto(piece):
        colour = piece[1]
        if not isinstance(colour, list) and any(max(abs(a - b) for a, b in zip(colour, c)) < 0.004 for c in bark_c):
            return ("bark", {})
        return wood(piece)
    return auto


def build_log(collection):
    """A fallen log to sit on, lying along X."""
    radius, length = 0.24, 1.8
    side = bmesh.new()
    bmesh.ops.create_cone(side, cap_ends=False, segments=18, radius1=radius, radius2=radius, depth=length)
    rot = Matrix.Rotation(math.pi / 2, 4, "Y")
    lift = Matrix.Translation((0.0, 0.0, radius))
    side = L.transformed(side, lift @ rot)
    pieces = [(side, C["bark"])]
    # Each cut end: an inked rim (the outline cannot draw an edge inside a face), the pale
    # wood, and one inked growth ring, all with the world's pen: bands side by side in the one
    # flat face of the end, none over another, so no two lie in one plane to flicker. The rim is
    # built on the side's own end ring, so the game can join their outlines without a crack at
    # the corner; the bands inside it are that ring drawn smaller.
    for sign in (-1.0, 1.0):
        n = Vector((sign, 0.0, 0.0))
        c = Vector((sign * length / 2, 0.0, radius))
        ring = sorted((v.co.copy() for v in side.verts if v.co.x * sign > 0),
                      key=lambda p: math.atan2(p.z - radius, p.y))
        # From the rim in: each band's colour and how far in its inner edge lies (metres from
        # the middle); the last band is the middle itself.
        bands = [("ink", radius - PEN), ("logEnd", radius * 0.5), ("ink", radius * 0.5 - PEN),
                 ("logRing", radius * 0.18), ("logEnd", 0.0)]
        outer = ring
        for colour, r in bands:
            inner = [c + (p - c) * (r / radius) for p in ring] if r > 0.0 else c
            pieces.append((band_bm(outer, inner, n), C[colour]))
            outer = inner
    # Its bark painted as 島二郎's wood is, its cut ends left as drawn.
    import paintmap as PM
    painter = PM.Painter("log")
    log = painter.join("log", pieces, collection, auto=paint_auto(barks=(C["bark"],)), joiner=L.assemble_colored)
    return [log], {"footprint": {"box": [0.95, 0.26]}, "height": 0.5, **painter.finish(OUT_MODELS)}


def build_starfish(collection):
    """Puffy five-armed starfish, white so the game can tint each one."""
    bm = bmesh.new()
    outer_top, outer_bot, mid = [], [], []
    for i in range(10):
        a = i / 10 * 2 * math.pi + math.pi / 2
        r = 0.15 if i % 2 == 0 else 0.065
        outer_top.append(bm.verts.new((math.cos(a) * r, math.sin(a) * r, 0.012)))
        outer_bot.append(bm.verts.new((math.cos(a) * r, math.sin(a) * r, 0.0)))
        mid.append(bm.verts.new((math.cos(a) * r * 0.5, math.sin(a) * r * 0.5, 0.03)))
    top = bm.verts.new((0.0, 0.0, 0.038))
    bottom = bm.verts.new((0.0, 0.0, 0.0))
    for i in range(10):
        j = (i + 1) % 10
        bm.faces.new((top, mid[i], mid[j]))
        bm.faces.new((mid[i], outer_top[i], outer_top[j], mid[j]))
        bm.faces.new((outer_top[i], outer_bot[i], outer_bot[j], outer_top[j]))
        bm.faces.new((bottom, outer_bot[j], outer_bot[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    starfish = L.assemble_colored("starfish", [(bm, C["white"])], collection)
    return [starfish], {"sink": -0.005}


def rounded_triangle_slab(corner_radius, round_radius, depth, arc_steps=8):
    """Equilateral triangle with rounded corners in the XZ plane, extruded along Y."""
    outline = []
    for k in range(3):
        a = math.pi / 2 + k * 2 * math.pi / 3
        px, pz = math.cos(a) * corner_radius, math.sin(a) * corner_radius
        for i in range(arc_steps + 1):
            t = a - math.pi / 3 + (2 * math.pi / 3) * i / arc_steps
            outline.append((px + math.cos(t) * round_radius, pz + math.sin(t) * round_radius))
    bm = bmesh.new()
    front = [bm.verts.new((x, -depth / 2, z)) for x, z in outline]
    back = [bm.verts.new((x, depth / 2, z)) for x, z in outline]
    bm.faces.new(front)
    bm.faces.new(list(reversed(back)))
    n = len(outline)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((front[i], front[j], back[j], back[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    return bm


def build_onigiri(collection):
    """Rice ball with a strip of nori. Faces -Y; origin at its centre."""
    slab = rounded_triangle_slab(0.045, 0.03, 0.058)
    rice = L.fuse([slab], voxel=0.003, smooth_iterations=10, smooth_lambda=0.9, target_tris=900)

    nori = bmesh.new()
    bmesh.ops.create_cube(nori, size=1.0)
    bmesh.ops.bevel(nori, geom=nori.edges[:], offset=0.12, segments=2, affect="EDGES", profile=0.5)
    L.transformed(nori, Matrix.Translation((0.0, 0.0, -0.038)) @ L.scale4(0.05, 0.064, 0.042))
    return L.assemble_colored("onigiri", [(rice, C["rice"]), (nori, C["nori"])], collection)


# Kurimanju's can of drink (the user, 2026-10-22), at the cast's size, as a can's shape is to a person's:
# (radius, height) from its foot up, about its middle, as its silver foot, its gold label and its silver top,
# which narrows at its shoulder to a rolled rim round a lid sunk inside it.
CAN = {
    "foot": [(0.0, -0.083), (0.03, -0.085), (0.038, -0.084), (0.043, -0.08), (0.0455, -0.074), (0.046, -0.066),
             (0.046, -0.062)],
    "label": [(0.046, -0.062), (0.046, 0.052)],
    "top": [(0.046, 0.052), (0.046, 0.06), (0.044, 0.068), (0.039, 0.076), (0.036, 0.08), (0.0365, 0.083),
            (0.035, 0.0855), (0.0325, 0.0845), (0.031, 0.081), (0.0, 0.081)],
}


def build_can(collection):
    """Kurimanju's can of drink, which Kurimanju always has in hand (PLAN.md): its body wrapped in a gold label
    between its silver foot and top, the top narrowing to a rolled rim round its sunk lid. Faces -Y; origin at
    its centre."""
    parts = [(L.lathe_bm(CAN[k], 24, 1.0), C["canLabel" if k == "label" else "canMetal"]) for k in ("foot", "label", "top")]
    return L.assemble_colored("can", parts, collection)


def slab_bm(outline, depth, bevel, centre_y=0.0, rims_only=False):
    """A slab of the outline [(x, z)] `depth` thick along Y about centre_y, its edges rounded by `bevel` metres:
    rounded, so that the pen's hull round what is held (createHeld) finds its edges. rims_only rounds only the
    rims of its faces, for a smooth outline of many points whose corners would round into ribs."""
    bm = bmesh.new()
    front = [bm.verts.new((x, centre_y - depth / 2, z)) for x, z in outline]
    back = [bm.verts.new((x, centre_y + depth / 2, z)) for x, z in outline]
    bm.faces.new(front)
    bm.faces.new(list(reversed(back)))
    n = len(outline)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((front[i], front[j], back[j], back[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    if bevel > 0.0:
        edges = [e for e in bm.edges if not rims_only or abs(e.verts[0].co.y - e.verts[1].co.y) < 1e-6]
        bmesh.ops.bevel(bm, geom=edges, offset=bevel, segments=3 if rims_only else 2, affect="EDGES", profile=0.5)
    return bm


# Rakko's sword, after the user's drawing of it (2026-10-22), its proportions measured off it: a broad grey blade
# widening from the guard to its shoulders and coming to a point, drawn with a ridge line up its middle (broken a
# little above the guard) to where two lines from the shoulders meet it, as a cut gem's facets; a white guard, a
# white grip a little narrower at its foot, banded with three dark lines, and a white pommel. All in metres, the
# blade's heights from its foot, at his size: 0.4 m from pommel to point, as on the official plush beside him.
SWORD = {"blade": 0.285, "foot_w": 0.08, "shoulder_w": 0.16, "shoulder": 0.187, "ridge": 0.152, "gap": (0.04, 0.05),
         "blade_t": 0.016, "guard": (0.111, 0.032, 0.026), "grip": 0.063, "grip_w": (0.07, 0.054), "grip_t": 0.036,
         "bands": 3, "pommel": (0.094, 0.034, 0.026), "line": 0.009}


def ink_line_bm(a, b, width, y, depth=0.0012):
    """A painted line on a face in the XZ plane, from a to b (x, z) `width` wide, at y (its middle), `depth` thick:
    the pen's line where the hull draws none (inside an outline)."""
    d = Vector((b[0] - a[0], b[1] - a[1]))
    length = d.length + width  # round past its ends, so lines meeting at a point join
    bm = box_bm(Vector((0.0, 0.0, 0.0)), (length, depth, width))
    turn = Matrix.Rotation(math.atan2(-d.y, d.x), 4, "Y")
    return L.transformed(bm, Matrix.Translation(((a[0] + b[0]) / 2, y, (a[1] + b[1]) / 2)) @ turn)


def build_sword(collection):
    """Rakko's sword, which he carries on his back and only now and then holds (the user). Its blade points up
    +Z, its flat to the front (-Y); origin at the middle of its grip, where his paw holds it."""
    s = SWORD
    g = s["grip"] / 2
    guard_x, guard_y, guard_z = s["guard"]
    z0 = g + guard_z  # the blade's foot
    t = s["blade_t"]
    white, ink = C["swordGuard"], C["ink"]
    parts = [(box_bm(Vector((0.0, 0.0, g + guard_z / 2)), (guard_x, guard_y, guard_z), bevel=0.006), white)]
    # The grip, a little narrower at its foot, with its bands round it (3 mm proud: check_flicker.py).
    top_w, foot_w = s["grip_w"]
    grip = box_bm(Vector((0.0, 0.0, 0.0)), (top_w, s["grip_t"], s["grip"]), bevel=0.005)
    for v in grip.verts:
        v.co.x *= L.lerp(foot_w / top_w, 1.0, (v.co.z + g) / s["grip"])
    parts.append((grip, white))
    for k in range(s["bands"]):
        z = -g + s["grip"] * (k + 1) / (s["bands"] + 1)
        w_here = L.lerp(foot_w, top_w, (z + g) / s["grip"])
        parts.append((box_bm(Vector((0.0, 0.0, z)), (w_here + 0.006, s["grip_t"] + 0.006, 0.005)), ink))
    px, py, pz = s["pommel"]
    parts.append((box_bm(Vector((0.0, 0.0, -g - pz / 2)), (px, py, pz), bevel=0.006), white))
    # The blade, sunk a little into the guard.
    hw, hs = s["foot_w"] / 2, s["shoulder_w"] / 2
    shoulder, tip, ridge = z0 + s["shoulder"], z0 + s["blade"], z0 + s["ridge"]
    outline = [(-hw, z0 - 0.006), (hw, z0 - 0.006), (hs, shoulder), (0.0, tip), (-hs, shoulder)]
    parts.append((slab_bm(outline, t, 0.004), C["swordBlade"]))
    # Its lines on both faces, 3 mm off them: from each shoulder to the ridge's top, and the ridge down to the
    # guard, broken a little above it as the drawing has it.
    lw = s["line"]
    gap0, gap1 = z0 + s["gap"][0], z0 + s["gap"][1]
    inset = lw  # the shoulders' lines start inside the outline the hull draws
    for side in (-1.0, 1.0):
        y = side * (t / 2 + 0.003)
        for sx in (-1.0, 1.0):
            parts.append((ink_line_bm((sx * (hs - inset), shoulder), (0.0, ridge), lw, y), ink))
        parts.append((ink_line_bm((0.0, ridge), (0.0, gap1), lw, y), ink))
        parts.append((ink_line_bm((0.0, gap0), (0.0, z0 + 0.004), lw, y), ink))
    return L.assemble_colored("sword", parts, collection)


# Rakko's ukulele (PLAN.md: he plays it at the bonfire), small for his size as a ukulele is for a person's, a
# plain one until there is a frame of the film's: its body two rounded bouts in honey wood, its sound hole and
# bridge dark, its neck and head darker wood with four pale pegs. Metres; neck along +X, its face to the front.
UKULELE = {"lower": (-0.035, 0.055), "upper": (0.04, 0.045), "depth": 0.045, "neck": (0.075, 0.24),
           "neck_w": 0.03, "head": 0.05}


def uke_outline(steps=56):
    """The body's outline in X (along the neck) and Z (across it): the two bouts' circles, joined at the waist."""
    pts = []
    for k in range(steps):
        a = 2.0 * math.pi * k / steps
        d = Vector((math.cos(a), math.sin(a)))
        best = 0.0
        for cx, r in (UKULELE["lower"], UKULELE["upper"]):
            c = Vector((cx, 0.0))
            b = d.dot(c)
            best = max(best, b + math.sqrt(max(b * b - c.length_squared + r * r, 0.0)))
        pts.append((d.x * best, d.y * best))
    return pts


def build_ukulele(collection):
    """Rakko's ukulele. Its neck along +X, its face to the front (-Y); origin at the middle of its body."""
    u = UKULELE
    depth = u["depth"]
    front = -depth / 2
    n0, n1 = u["neck"]
    parts = [(slab_bm(uke_outline(), depth, 0.007, rims_only=True), C["ukeBody"])]
    # The sound hole in the upper bout and the bridge on the lower, off the face (the hole 3 mm, clear of its
    # plane: art/blender/check_flicker.py).
    hole = bmesh.new()
    bmesh.ops.create_cone(hole, cap_ends=True, cap_tris=False, segments=24, radius1=0.018, radius2=0.018, depth=0.001)
    hole = L.transformed(hole, Matrix.Translation((u["upper"][0] - 0.005, front - 0.003, 0.0))
                         @ Matrix.Rotation(math.pi / 2, 4, "X"))
    parts.append((hole, C["ukeHole"]))
    parts.append((box_bm(Vector((u["lower"][0] - 0.012, front - 0.002, 0.0)), (0.012, 0.004, 0.042), bevel=0.0015),
                  C["ukeBridge"]))
    # The neck, its fretboard a little proud of the face, and the head tipped back off its end with its pegs.
    neck_t = 0.022
    neck_y = front - 0.0015 + neck_t / 2
    parts.append((box_bm(Vector(((n0 + n1) / 2, neck_y, 0.0)), (n1 - n0, neck_t, u["neck_w"]), bevel=0.005), C["ukeNeck"]))
    head = box_bm(Vector((0.0, 0.0, 0.0)), (u["head"], 0.016, u["neck_w"] + 0.012), bevel=0.005)
    lean = Matrix.Translation((n1 + u["head"] / 2 - 0.004, neck_y + 0.006, 0.0)) @ Matrix.Rotation(0.25, 4, "Z")
    parts.append((L.transformed(head, lean), C["ukeNeck"]))
    for px in (-0.012, 0.012):
        for pz in (-1.0, 1.0):
            peg = L.ellipsoid_bm(lean @ Vector((px, 0.0, pz * (u["neck_w"] / 2 + 0.011))), (0.007, 0.007, 0.007), u=12, v=8)
            parts.append((peg, C["ukePeg"]))
    return L.assemble_colored("ukulele", parts, collection)


def box_bm(centre, size, bevel=0.0):
    """A box `size` (x, y, z) across around `centre`, its edges rounded by `bevel` metres."""
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    L.transformed(bm, L.scale4(*size))
    if bevel > 0.0:
        bmesh.ops.bevel(bm, geom=bm.edges[:], offset=min(bevel, 0.45 * min(size)), segments=2,
                        affect="EDGES", profile=0.5)
    return L.transformed(bm, Matrix.Translation(centre))


def label_bm(centre, width, height, lift=0.004):
    """A flat face for painted words, facing -Y, `lift` metres in front of `centre`. UVs run across
    it from its top-left, for the game's painted text; returns the bmesh and its UVs by vertex."""
    bm = bmesh.new()
    x0, x1 = centre.x - width / 2, centre.x + width / 2
    z0, z1 = centre.z - height / 2, centre.z + height / 2
    y = centre.y - lift
    vs = [bm.verts.new((x0, y, z1)), bm.verts.new((x1, y, z1)), bm.verts.new((x1, y, z0)), bm.verts.new((x0, y, z0))]
    bm.faces.new((vs[0], vs[3], vs[2], vs[1]))
    return bm, [(0.0, 0.0), (1.0, 0.0), (1.0, 1.0), (0.0, 1.0)]


# Faces meeting at more than this are lit apart, as the flat faces they are (a box's sides, a log's
# cut ends), where smooth shading would blend them and the film look's lighting draw a band across
# them; rounder things (posts of six sides or more, lanterns, thatch) stay smooth. See join.
SHARP = math.radians(70)


def join(name, pieces, collection, sharp=None):
    """Join (bmesh, colour or a list of colours, one per vertex) pieces into one smooth-shaded
    object with a vertex colour layer. With `sharp` (radians), faces meeting at more than that are
    lit as the flat faces they are, where smooth shading would blend a box's sides into one another
    and the toon ramp draw a band across them."""
    flat = []
    combined = bmesh.new()
    for bm, colour in pieces:
        n = len(bm.verts)
        L.append_bm(combined, bm)
        flat.extend(colour if isinstance(colour, list) else [colour] * n)
        bm.free()
    mesh = bpy.data.meshes.new(name)
    combined.to_mesh(mesh)
    combined.free()
    data = []
    for c in flat:
        data.extend((float(c[0]), float(c[1]), float(c[2]), 1.0))
    col = mesh.color_attributes.new("Col", "FLOAT_COLOR", "POINT")
    col.data.foreach_set("color", data)
    mesh.color_attributes.active_color = col
    try:
        mesh.color_attributes.render_color_index = mesh.color_attributes.active_color_index
    except AttributeError:
        pass
    mesh.shade_smooth()
    if sharp is not None:
        mesh.set_sharp_from_angle(angle=sharp)
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)
    return obj


def object_with_uv(name, bm, uvs, collection):
    """An object from a bmesh with one UV per vertex (U across, V down from the top)."""
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    loop_vertex = [0] * len(mesh.loops)
    mesh.loops.foreach_get("vertex_index", loop_vertex)
    flat = []
    for vi in loop_vertex:
        u, v = uvs[vi]
        flat.extend((u, 1.0 - v))  # the glTF exporter flips V
    mesh.uv_layers.new(name="UVMap").data.foreach_set("uv", flat)
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)
    return obj


# The cave's No Entry sign, after the film's (`cave signboard 1` to `3`): pale weathered wood, its
# grain a little darker, its cut edges and its post darker still.
SIGN = {k: L.hex_color(v) for k, v in {
    "board": "#E2E8CF", "grain": "#CBCDA6", "edge": "#CDB878", "post": "#9A9468"}.items()}
# Its plank: how wide, how tall, how thick, how high its foot stands, and the strips its front is
# drawn in, for its grain. Measured against Momonga beside it in `cave signboard 1`: its top a little
# under a metre up, a quarter of a metre of post showing; in the proportions of the user's painting.
SIGN_PLANK = {"width": 0.44, "height": 0.64, "thick": 0.06, "foot": 0.28, "strips": 14}


def build_sign(collection):
    """The No Entry sign before the cave, as the film's (`cave signboard 1` to `3`): one thick plank
    of pale, weathered wood standing upright on a square post set into its back, a third of the
    plank's height of post showing under it, the grain running up the plank and its outline a little
    uneven, as if cut by hand. Faces -Y; its whole front is a face for the game to paint its words
    on, written top to bottom (the user's painting of 立入禁止!!)."""
    w, h, t = SIGN_PLANK["width"], SIGN_PLANK["height"], SIGN_PLANK["thick"]
    z0, n = SIGN_PLANK["foot"], SIGN_PLANK["strips"]
    xs = [-w / 2 + w * i / n for i in range(n + 1)]
    # Its top and foot cut straight across, but for its top right corner, knocked off a little.
    top = [z0 + h - 0.014 * max(0.0, (i - n + 2) / 2) for i in range(n + 1)]
    foot = [z0] * (n + 1)
    yf, yb = -t / 2, t / 2

    def grain(i):
        """The wood's colour up the line at xs[i]: paler and darker bands, and a few dark grain lines."""
        band = 0.5 + 0.5 * math.sin(i * 2.9 + 0.7) * math.sin(i * 0.8)
        line = 0.5 if i in (3, 8, 11) else 0.0
        return [SIGN["board"][k] + (SIGN["grain"][k] - SIGN["board"][k]) * max(band * 0.22, line) for k in range(3)]

    pieces = []
    # The front, in strips up the plank, each edge of a strip the colour of the grain there.
    front = bmesh.new()
    cols = []
    for i in range(n):
        vs = [front.verts.new((xs[i], yf, foot[i])), front.verts.new((xs[i + 1], yf, foot[i + 1])),
              front.verts.new((xs[i + 1], yf, top[i + 1])), front.verts.new((xs[i], yf, top[i]))]
        front.faces.new(vs)
        cols += [grain(i), grain(i + 1), grain(i + 1), grain(i)]
    pieces.append((front, cols))
    # The back, one face facing +Y; the cut edges round it, darker, each facing out. The outline
    # runs along the foot and back over the top, so round the front the right way.
    outline = [(x, f) for x, f in zip(xs, foot)] + [(x, tp) for x, tp in reversed(list(zip(xs, top)))]
    back = bmesh.new()
    back.faces.new([back.verts.new((x, yb, z)) for x, z in reversed(outline)])
    pieces.append((back, SIGN["board"]))
    edges = bmesh.new()
    ring = outline + [outline[0]]
    for (xa, za), (xb, zb) in zip(ring, ring[1:]):
        edges.faces.new((edges.verts.new((xa, yf, za)), edges.verts.new((xa, yb, za)),
                         edges.verts.new((xb, yb, zb)), edges.verts.new((xb, yf, zb))))
    pieces.append((edges, SIGN["edge"]))
    # The post, set into the plank's back, standing from under the sand to near its top.
    pieces.append((box_bm(Vector((0.0, 0.05, (-0.3 + z0 + h * 0.77) / 2)), (0.075, 0.07, z0 + h * 0.77 + 0.3), bevel=0.006),
                   SIGN["post"]))
    # Its plank's back and edges and its post painted as 島二郎's weathered wood is (its front is the
    # user's painting).
    import paintmap as PM
    painter = PM.Painter("sign")
    sign = painter.join("sign", pieces, collection, sharp=SHARP, grained=False,
                        auto=paint_auto(bare=(SIGN["board"], SIGN["edge"], SIGN["post"])))
    # The words' face: the plank's whole front, a few millimetres in from its uneven edge.
    face, uvs = label_bm(Vector((0.0, yf, z0 + h / 2)), w - 0.012, h - 0.016)
    label = object_with_uv("sign_label", face, uvs, collection)
    info = {"footprint": {"box": [w / 2 + 0.01, 0.06]}, "height": round(z0 + h, 3),
            "label": {"size": [round(w - 0.012, 3), round(h - 0.016, 3)], "vertical": True, "colour": "#3B2620",
                      # The film shows it close, so its words are painted sharper than other signs' (as
                      # sharp as fits without the other signs' words painted any less sharp).
                      "sharp": 3}}
    info.update(painter.finish(OUT_MODELS))
    return [sign, label], info


def heart_leaf_bm(at, out, size):
    """A small heart-shaped leaf on a vine, its face toward `out`, as the film's vines have them."""
    side = UP.cross(out).normalized() if abs(out.dot(UP)) < 0.95 else Vector((1.0, 0.0, 0.0))
    face = out.normalized()
    rot = Matrix((side, face.cross(side), face)).transposed()
    return L.ellipsoid_bm(at, (size, size * 0.85, size * 0.18), rot=rot, u=8, v=4)


# The face 島二郎's hung sign's words are painted on, in metres: the shape of the user's lettering
# (`sign.shimajiro`, 638 x 313 at the templates' 800 a metre, 2026-10-21).
HANGING_FACE = (0.7975, 0.39125)
# The sign hangs from a low branch of a tree beside the path, as in the film's frame of the way to
# 島二郎 (`river below parkour stone landmark 2`; the user, 2026-10-21), not from posts. In the sign's
# own metres (across the path, to the right as one faces the sign; back along the path from its face;
# up from the ground under it): the tree's foot (`trunk`) and its height (the island's build grows it
# with the jungle, see SIGN_TREE in build_island.py, and the branch with it); the branch from inside
# the trunk out over the path through `branch`, rising out of the trunk, sagging over the path and
# lifting at its tip, thinning from `radius` and thicker and thinner by turns (`gnarl`); the board's
# middle `board` up, close under it. Twigs off the branch (how far along it, and their reach), each
# with a tuft of leaves; and the vines: loops draped along the branch (from, to, how far down they
# sag), strands hanging from it (across, how far down) and one wound round the trunk.
HANGING = {"trunk": (-2.8, -0.9), "height": 12.0,
           "branch": [(-2.8, -0.9, 3.3), (-2.1, -0.6, 3.52), (-1.15, -0.2, 3.3), (0.0, 0.02, 3.0), (0.7, 0.22, 2.94),
                      (1.3, 0.48, 3.1)],
           "radius": (0.21, 0.045), "gnarl": 0.14, "board": 2.35,
           "twigs": [(0.55, (0.25, -0.3, 0.42)), (0.8, (0.12, 0.35, 0.48)), (1.0, (0.32, 0.3, 0.28))],
           "garlands": [(0.2, 0.36, 0.3), (0.42, 0.56, 0.36), (0.66, 0.85, 0.28)],
           "strands": [(-1.9, 0.6), (-0.95, 1.1), (0.62, 1.5), (1.12, 0.8)]}
# A heart-shaped leaf of the vines, from the notch where its stalk meets it round to its tip: across
# and down it, in lengths of the leaf.
HEART_CARD = [(0.0, 0.1), (0.16, 0.0), (0.35, 0.05), (0.48, 0.2), (0.5, 0.38), (0.41, 0.6), (0.22, 0.82), (0.0, 1.0)]


def hanging_branch(samples=28):
    """The branch 島二郎's hung sign hangs from (see HANGING), in the sign's own metres: points along
    it, smoothly through its bend points (a Catmull-Rom curve), and its radius at each, from inside
    the trunk out to its tip, a little thicker and thinner by turns as a limb grows."""
    pts = [Vector(p) for p in HANGING["branch"]]
    r0, r1 = HANGING["radius"]
    out = []
    for k in range(samples + 1):
        t = k / samples * (len(pts) - 1)
        i = min(int(t), len(pts) - 2)
        f = t - i
        p0, p1, p2, p3 = pts[max(i - 1, 0)], pts[i], pts[i + 1], pts[min(i + 2, len(pts) - 1)]
        q = 0.5 * (2.0 * p1 + (p2 - p0) * f + (2.0 * p0 - 5.0 * p1 + 4.0 * p2 - p3) * f * f
                   + (3.0 * p1 - p0 - 3.0 * p2 + p3) * f ** 3)
        s = k / samples
        gnarl = 1.0 + HANGING["gnarl"] * (0.6 * math.sin(k * 1.7 + 0.4) + 0.4 * math.sin(k * 4.3))
        out.append((q, (r0 + (r1 - r0) * s ** 0.8) * gnarl))
    return out


def branch_at(s, branch):
    """The point `s` of the way along the branch (0 inside the trunk, 1 its tip), and its radius."""
    f = min(max(s, 0.0), 1.0) * (len(branch) - 1)
    i = min(int(f), len(branch) - 2)
    (p, r), (q, t) = branch[i], branch[i + 1]
    return p.lerp(q, f - i), r + (t - r) * (f - i)


def branch_over(x, branch):
    """The point on the branch over `x` across the path, and the branch's radius there."""
    for (p, r), (q, s) in zip(branch, branch[1:]):
        if (p.x - x) * (q.x - x) <= 0.0 and p.x != q.x:
            f = (x - p.x) / (q.x - p.x)
            return p.lerp(q, f), r + (s - r) * f
    return branch[-1]


def heart_card_bm(stalk, face, size, tilt=0.0):
    """A vine's heart-shaped leaf hanging from its stalk's end at `stalk`, its face toward `face`, its
    tip down (turned `tilt` about its face), cupped a little: a thin solid 1.15 `size` long."""
    n = face.normalized()
    down = -UP + n * n.dot(UP)
    if down.length < 0.2:
        down = Vector((0.0, -1.0, 0.0)) - n * n.y
    down.normalize()
    side = n.cross(down).normalized()
    down, side = down * math.cos(tilt) + side * math.sin(tilt), side * math.cos(tilt) - down * math.sin(tilt)
    outline = HEART_CARD + [(-u, w) for u, w in reversed(HEART_CARD[1:-1])]
    bm = bmesh.new()
    rims = []
    for lift in (0.004, -0.004):
        rims.append([bm.verts.new(stalk + side * (u * size) + down * (w * size * 1.15)
                                  + n * (lift - 0.12 * size * (2.0 * u) ** 2)) for u, w in outline])
    hubs = [bm.verts.new(stalk + down * (0.45 * size * 1.15) + n * lift) for lift in (0.004, -0.004)]
    m = len(outline)
    for i in range(m):
        j = (i + 1) % m
        bm.faces.new((hubs[0], rims[0][i], rims[0][j]))
        bm.faces.new((hubs[1], rims[1][j], rims[1][i]))
        bm.faces.new((rims[0][i], rims[1][i], rims[1][j], rims[0][j]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    return bm


def vine_leaves(points, leaves, size, seed, every=0.11):
    """A vine's leaves along `points` (a line down or along it), about every `every` metres, on
    alternate sides of it, each facing out a little differently."""
    run = 0.0
    k = 0
    for a, b in zip(points, points[1:]):
        length = (b - a).length
        while run <= length:
            at = a.lerp(b, run / max(length, 1e-6))
            turn = seed + k * 2.4
            side = 1.0 if k % 2 else -1.0
            face = Vector((0.55 * side * math.cos(turn), -1.0, 0.25 * math.sin(turn * 1.3)))
            leaves.append((heart_card_bm(at + Vector((0.02 * side, -0.01, 0.0)), face,
                                         size * (0.85 + 0.3 * ((k * 7) % 5) / 4), tilt=0.35 * side),
                           C["leafA"] if k % 2 else C["leafB"]))
            run += every
            k += 1
        run -= length


def build_sign_hanging(collection):
    """島二郎's sign, as in the film's frame of the way to it: a weathered board hung close under a low
    branch of a tree beside the path by two cords (see HANGING), heart-leaved vines draped along the
    branch in loops, hanging from it either side of the board and wound round the trunk under it,
    twigs off the branch with tufts of leaves. The tree and its branch grow with the jungle
    (build_island.py); the board, its cords, the twigs and the vines are this prop. Faces -Y, with a
    face on the board's front for the game to paint its words on."""
    import plants as PL  # noqa: PLC0415 (plants imports this module)

    pieces, leaves = [], []
    branch = hanging_branch()
    fw, fh = HANGING_FACE
    bz = HANGING["board"]
    pieces.append((box_bm(Vector((0.0, 0.0, bz)), (fw + 0.1, 0.06, fh + 0.08), bevel=0.012), C["board"]))
    # Its two cords from its top's ends up round the branch.
    for x in (-(fw / 2 - 0.08), fw / 2 - 0.08):
        at, r = branch_over(x, branch)
        pieces.append((segment_bm(Vector((x, 0.0, bz + fh / 2 + 0.03)), at - Vector((0.0, 0.0, r * 0.4)), 0.012, 0.012,
                                  segments=5), C["rope"]))
        pieces.append((L.ellipsoid_bm(at, (0.026, r + 0.014, r + 0.014), u=8, v=6), C["rope"]))
    # Twigs off the branch, each with a tuft of leaves at its end.
    for n, (s, reach) in enumerate(HANGING["twigs"]):
        foot, r = branch_at(s, branch)
        tip = foot + Vector(reach)
        bend = foot.lerp(tip, 0.5) + Vector((0.0, 0.0, 0.06))
        pieces.append((segment_bm(foot, bend, r * 0.45, 0.022, segments=5), C["bark"]))
        pieces.append((segment_bm(bend, tip, 0.022, 0.012, segments=5), C["bark"]))
        for k in range(10):
            a = n * 1.3 + k * 2.4
            at = tip.lerp(bend, 0.35 * (k % 3) / 2) + Vector((math.cos(a), math.sin(a), 0.25)) * 0.05
            face = Vector((math.cos(a), math.sin(a) - 0.4, 0.5))
            leaves.append((heart_card_bm(at, face, 0.085 + 0.01 * (k % 3), tilt=k * 0.5), C["leafA"] if k % 2 else C["leafB"]))
    # Leaves on the branch itself, in clumps where the vines run along it.
    for k, (p, r) in enumerate(branch[5:-1], start=5):
        if k % 5 in (1, 4):
            continue
        a = k * 2.4
        face = Vector((0.3 * math.sin(a), -0.9 + 0.5 * math.cos(a), 0.7))
        leaves.append((heart_card_bm(p + Vector((0.0, -0.4, 0.85)).normalized() * (r + 0.01), face, 0.065 + 0.01 * (k % 3),
                                     tilt=0.4 * math.sin(a)), C["leafA"] if k % 2 else C["leafB"]))
    # The vines draped along it in loops, as in the film's frame, their leaves down them.
    for n, (s0, s1, sag) in enumerate(HANGING["garlands"]):
        a, ra = branch_at(s0, branch)
        b, rb = branch_at(s1, branch)
        line = [a.lerp(b, t) - Vector((0.0, 0.05 * math.sin(math.pi * t), sag * 4.0 * t * (1.0 - t) + (ra + rb) * 0.3))
                for t in (k / 10 for k in range(11))]
        for p, q in zip(line, line[1:]):
            pieces.append((segment_bm(p, q, 0.007, 0.007, segments=4), C["leafA"]))
        vine_leaves(line, leaves, 0.06, seed=n * 1.9)
    # Strands hanging from it either side of the board, as the film's, leaves all down them.
    for n, (x, length) in enumerate(HANGING["strands"]):
        top, r = branch_over(x, branch)
        top = top - Vector((0.0, 0.0, r * 0.6))
        line = [top + Vector((0.035 * math.sin(n * 1.7 + 3.0 * t), -0.05 * t, -length * t)) for t in (k / 8 for k in range(9))]
        for p, q in zip(line, line[1:]):
            pieces.append((segment_bm(p, q, 0.008, 0.006, segments=4), C["leafA"]))
        vine_leaves(line, leaves, 0.062, seed=n * 2.7)
    # A vine wound round the trunk from head height up to the branch.
    tx, ty = HANGING["trunk"]
    coil = []
    for k in range(40):
        z = 1.2 + k * 0.055
        a = k * 0.42
        rr = PL.trunk_radius(HANGING["height"], z) * 0.93 + 0.02
        coil.append(Vector((tx + math.cos(a) * rr, ty + math.sin(a) * rr, z)))
    for p, q in zip(coil, coil[1:]):
        pieces.append((segment_bm(p, q, 0.009, 0.009, segments=4), C["leafA"]))
    for k, p in enumerate(coil):
        a = k * 0.42 + 0.5 * (k % 2)
        face = Vector((math.cos(a), math.sin(a), 0.15))
        leaves.append((heart_card_bm(p + face.normalized() * 0.02 + Vector((0.0, 0.0, 0.03 * (k % 2))), face,
                                     0.065 + 0.012 * (k % 3), tilt=0.6 * math.sin(k * 1.3)), C["leafA"] if k % 2 else C["leafB"]))
    # Its board painted as 島二郎's weathered wood is (its front is the user's painting), the branch's bark too.
    import paintmap as PM
    painter = PM.Painter("sign_hanging")
    sign = painter.join("sign_hanging", pieces + leaves, collection, auto=paint_auto(bare=(C["board"],), barks=(C["bark"],)),
                        joiner=L.assemble_colored)
    face, uvs = label_bm(Vector((0.0, -0.03, bz)), fw, fh)
    label = object_with_uv("sign_hanging_label", face, uvs, collection)
    info = {"height": 3.8, "label": {"size": [fw, fh], "colour": "#2B211B"}}
    info.update(painter.finish(OUT_MODELS))
    return [sign, label], info


def build_fence(collection):
    """A short length of palisade, as by the film's village stage: thick log posts of uneven heights
    side by side, their sawn tops pale, a rail across their backs. Faces -Y, 2.4 m long."""
    def exact(a, b, r0, r1):
        # segment_bm makes what it is given 4% longer, about its middle.
        mid, half = (a + b) / 2, (b - a) / 2 / 1.04
        return segment_bm(mid - half, mid + half, r0, r1, segments=9)

    pieces = []
    heights = (1.15, 0.95, 1.3, 1.05, 1.22, 0.9)
    for k, h in enumerate(heights):
        x = -1.0 + 0.4 * k
        r = 0.105 + 0.012 * (k % 3)
        pieces.append((exact(Vector((x, 0.0, -0.3)), Vector((x, 0.0, h - 0.03)), r, r * 0.97), C["bark"]))
        pieces.append((exact(Vector((x, 0.0, h - 0.03)), Vector((x, 0.0, h)), r * 0.93, r * 0.9), C["logEnd"]))
    pieces.append((segment_bm(Vector((-1.2, 0.13, 0.6)), Vector((1.2, 0.13, 0.62)), 0.055, 0.05, segments=7), C["bark"]))
    # Its posts' and rail's bark painted as 島二郎's wood is, their sawn tops left as drawn.
    import paintmap as PM
    painter = PM.Painter("fence")
    fence = painter.join("fence", pieces, collection, auto=paint_auto(barks=(C["bark"],)), joiner=L.assemble_colored)
    return [fence], {"footprint": {"box": [1.2, 0.18]}, "height": 1.3, **painter.finish(OUT_MODELS)}


def wing_bm(outline, thickness):
    """A thin solid wing from an outline of (x, y) points round its edge, flat in the XY plane."""
    bm = bmesh.new()
    top = [bm.verts.new((x, y, thickness / 2)) for x, y in outline]
    bot = [bm.verts.new((x, y, -thickness / 2)) for x, y in outline]
    bm.faces.new(top)
    bm.faces.new(list(reversed(bot)))
    for i in range(len(outline)):
        j = (i + 1) % len(outline)
        bm.faces.new((top[i], bot[i], bot[j], top[j]))
    bmesh.ops.triangulate(bm, faces=bm.faces[:])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    return bm


def build_butterfly(collection):
    """A small blue butterfly, wings spread flat along X and its body along Y, facing -Y; the game
    flaps every vertex further than 6 mm from the middle as wing."""
    pieces = [(L.ellipsoid_bm(Vector((0.0, 0.0, 0.0)), (0.005, 0.03, 0.005), u=6, v=4), C["nori"])]
    for s in (-1.0, 1.0):
        upper = [(s * x, y) for x, y in ((0.007, -0.012), (0.04, -0.034), (0.068, -0.03), (0.075, -0.012),
                                         (0.06, 0.004), (0.007, 0.004))]
        lower = [(s * x, y) for x, y in ((0.007, 0.004), (0.048, 0.008), (0.054, 0.024), (0.036, 0.036),
                                         (0.007, 0.018))]
        for outline, colour in ((upper, C["wing"]), (lower, C["wingLight"])):
            if s < 0:
                outline = list(reversed(outline))
            pieces.append((wing_bm(outline, 0.003), colour))
    return [L.assemble_colored("butterfly", pieces, collection)], {}


# The quay's timber, as the pier's: its planks in three close tones, and which tone each takes along
# a length of it.
QUAY_WOOD = {k: L.hex_color(v) for k, v in {"post": "#8A5A3B", "postTop": "#C49A6C", "plank": "#BE8F5C",
                                            "plankMid": "#AE7F51", "plankDark": "#9C6E45"}.items()}
QUAY_TONES = ("plank", "plankMid", "plank", "plankDark", "plankMid", "plank", "plankMid", "plankDark", "plank",
              "plankMid", "plank", "plankDark", "plankMid")


def build_quay(collection):
    """A length of the bay's timber quay, after the film's frames of it: round log posts two metres
    apart, standing a little proud of the sand as weathered stumps, and behind them a wall of upright
    planks side by side, from under the sea floor to just over the sand's edge, holding the sand back
    over the water. Four metres long, along X, its sea side toward -Y; its origin on the sand's level,
    at the planks' sea face, in the middle of its length. Laid end to end along the quay (posts every
    two metres). The planks are 7 cm thick: the ground drops into the water inside them (see QUAY in
    build_island.py)."""
    w = QUAY_WOOD
    pieces = []
    for x, top in ((-1.0, 0.27), (1.0, 0.34)):
        pieces.append((segment_bm(Vector((x, -0.1, -2.6)), Vector((x, -0.1, top)), 0.17, 0.16, segments=10), w["post"]))
        # segment_bm overshoots each end by 2% of its length; the cut top sits on its end.
        pieces.append((disc_bm(Vector((x, -0.1, top + 0.02 * (top + 2.6) + 0.003)), UP, 0.13, 12), w["postTop"]))
    # Upright planks a hair apart, from under the sea floor to a little over the sand, their tops
    # not quite level.
    gap = 0.012
    width = (3.992 - (len(QUAY_TONES) - 1) * gap) / len(QUAY_TONES)
    for k, tone in enumerate(QUAY_TONES):
        x = -1.996 + width / 2 + k * (width + gap)
        top = 0.02 + 0.01 * ((k * 5) % 3 - 1)
        pieces.append((box_bm(Vector((x, 0.035, (top - 2.3) / 2)), (width, 0.07, top + 2.3)), w[tone]))
    # Its planks and posts painted as 島二郎's wood is, the posts' cut tops left pale.
    import paintmap as PM
    painter = PM.Painter("quay")
    quay = painter.join("quay", pieces, collection, sharp=SHARP, grained=False,
                        auto=paint_auto(bare=(w["post"], w["plank"], w["plankMid"], w["plankDark"])))
    return [quay], {"height": 0.4, **painter.finish(OUT_MODELS)}


BUILDERS = {
    "palm": build_palm,
    "log": build_log,
    "starfish": build_starfish,
    "onigiri": build_onigiri,
    "can": build_can,
    "sword": build_sword,
    "ukulele": build_ukulele,
    "sign": build_sign,
    "sign_hanging": build_sign_hanging,
    "fence": build_fence,
    "butterfly": build_butterfly,
    "quay": build_quay,
}


def render_prop(scene, cam, objs, path):
    for other in scene.objects:
        if other.type == "MESH":
            other.hide_render = other not in objs
    corners = [o.matrix_world @ Vector(c) for o in objs for c in o.bound_box]
    lo = Vector((min(c.x for c in corners), min(c.y for c in corners), min(c.z for c in corners)))
    hi = Vector((max(c.x for c in corners), max(c.y for c in corners), max(c.z for c in corners)))
    center = (lo + hi) * 0.5
    size = max((hi - lo).length, 0.05)
    direction = Vector((0.55, -1.0, 0.45)).normalized()
    cam.location = center + direction * (size * 4.0)
    cam.rotation_euler = (center - cam.location).to_track_quat("-Z", "Y").to_euler()
    cam.data.ortho_scale = size * 1.15
    scene.render.resolution_x = 420
    scene.render.resolution_y = 420
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)


def export_parts(objs, path, info):
    """Export a prop made of several parts into one .glb, its info as JSON on the first part."""
    objs[0]["prop"] = json.dumps(info, separators=(",", ":"))
    view_layer = bpy.context.view_layer
    view_layer.update()
    for o in bpy.data.objects:
        if o.name in view_layer.objects:
            o.select_set(False)
    for o in objs:
        o.select_set(True)
    view_layer.objects.active = objs[0]
    os.makedirs(os.path.dirname(path), exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=path, export_format="GLB", use_selection=True, export_extras=True, export_attributes=True,
        export_yup=True, export_normals=True, export_texcoords=True, export_vertex_color="ACTIVE",
        export_materials="NONE", export_animations=False, export_skins=False, export_morph=False,
        export_cameras=False, export_lights=False, export_apply=False, **L.DRACO,
    )


def build_all(builders, blend_path, prefix="prop"):
    """Build every prop in `builders` (or only those named after --only, comma-separated), export
    each, render its preview and save them all to `blend_path`. A builder returns one object, or a
    list of parts and the prop's info for the game: its footprint, height, deck and label."""
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    only = set(argv[argv.index("--only") + 1].split(",")) if "--only" in argv else None
    previews = "--no-previews" not in argv

    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    collection = bpy.data.collections.new("props")
    scene.collection.children.link(collection)

    built = []
    for prop_id, builder in builders.items():
        if only and prop_id not in only:
            continue
        made = builder(collection)
        path = os.path.join(OUT_MODELS, f"{prop_id}.glb")
        if isinstance(made, tuple):
            objs, info = made
            export_parts(objs, path, {"version": 1, "id": prop_id, **info})
        else:
            objs = [made]
            L.export_glb(made, path, {"version": 1, "id": prop_id})
        tris = sum(len(p.vertices) - 2 for o in objs for p in o.data.polygons)
        verts = sum(len(o.data.vertices) for o in objs)
        print(f"BUILT {prop_id}: {verts} verts, {tris} tris -> {path}")
        built.append((prop_id, objs))

    x = 0.0
    for _, objs in built:
        width = max(max(o.dimensions.x for o in objs), 0.5)
        for o in objs:
            o.location.x = x + width / 2
        x += width + 1.0
    bpy.context.view_layer.update()

    if previews and built:
        cam = L.setup_preview(scene)
        for prop_id, objs in built:
            path = os.path.join(OUT_PREVIEWS, f"{prefix}_{prop_id}.png")
            render_prop(scene, cam, objs, path)
            print("PREVIEW", path)
        for _, objs in built:
            for o in objs:
                o.hide_render = False

    # Building only some props leaves the others out, so the .blend keeps its full set.
    if not only:
        os.makedirs(os.path.dirname(blend_path), exist_ok=True)
        bpy.ops.wm.save_as_mainfile(filepath=blend_path, compress=True)
        print("SAVED", blend_path)


if __name__ == "__main__":
    build_all(BUILDERS, OUT_BLEND)
