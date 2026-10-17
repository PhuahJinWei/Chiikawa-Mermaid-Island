"""Build the village, the pier and the ferry in Blender and export them for the game.

Run (from the project root):
    blender --background --factory-startup --python art/blender/build_village.py -- [--only hut_green] [--no-previews]

Outputs:
    public/models/props/<id>.glb   each prop, in parts: the body, parts that glow at night
                                   (windows, lanterns), flames lit at night, and faces for
                                   painted words
    art/blender/village.blend      all of them, for opening in Blender
    art/previews/village_<id>.png  one three-quarter render each

After the film's village frames (`islanders 1`, `chiikawa 3`, `chiikawa 7` and the October
screenshots), its festival street, the pier (`chiikawa 8`) and the ferry (`boat`). The houses you
can walk into, the stage and the festival street's arch and banners are in houses.py.
Coordinates are Blender's: Z up, each prop faces -Y and stands on its origin. Each prop's info
tells the game what it blocks (in the game's x and z), its height, and any deck to walk on or
face for painted words.
"""

import math
import os
import sys

import bmesh
import bpy
import numpy as np
from mathutils import Matrix, Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import build_props as P  # noqa: E402
import charlib as L  # noqa: E402
import houses as H  # noqa: E402

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
OUT_BLEND = os.path.join(ROOT, "art", "blender", "village.blend")

C = {k: L.hex_color(v) for k, v in {
    "post": "#8A5A3B",
    "postTop": "#C49A6C",
    "plank": "#BE8F5C",
    "plankDark": "#9C6E45",
    "plankLight": "#CFA474",
    "floor": "#A47B52",
    "thatch": "#B98D57",
    "thatchLight": "#CFA86C",
    "thatchDark": "#8E6A3E",
    "thatchUnder": "#5E4632",
    "straw": "#D8B577",
    "mud": "#DCC39A",
    "door": "#3E2C22",
    "pane": "#3B6B6A",
    "bar": "#4A3426",
    "teal": "#3FB5A3",
    "green": "#7CC36A",
    "orange": "#F2A65A",
    "red": "#E0674F",
    "yellow": "#F2D04E",
    "cream": "#FFF6E4",
    "white": "#F7F4EC",
    "pink": "#F4A3B5",
    "purple": "#B68FD6",
    "blue": "#7EC3EA",
    "ink": "#66432F",
    "duck": "#FBFAF6",
    "duckShade": "#DCE6EE",
    "beak": "#F2C14E",
    "glass": "#35507A",
    "deck": "#E6E2D8",
    "lantern": "#F2734E",
    "basket": "#C9A06A",
    "basketDark": "#A07A48",
    "pot": "#C7714E",
    "potRim": "#D98A64",
    "leaf": "#4DB35A",
    "leafDark": "#3F8F45",
    "wood": "#A88B6A",
    "woodDark": "#8B6F52",
}.items()}

UP = Vector((0.0, 0.0, 1.0))
PEN = P.PEN


def V(x, y, z):
    return Vector((x, y, z))


def cylinder_bm(a, b, radius, segments=8):
    return P.segment_bm(a, b, radius, radius, segments=segments)


def profile_bm(ctrl, samples, segments, colour_fn):
    """A smooth surface of revolution from (radius, height) control points, bottom to top, with a
    colour per vertex from colour_fn(angle, z, outward)."""
    prof = L.Profile(ctrl, samples=samples)
    bm = L.lathe_bm(prof.samples, segments=segments)
    bm.normal_update()
    cols = []
    for v in bm.verts:
        cols.append(colour_fn(math.atan2(v.co.x, -v.co.y), v.co.z, v.normal))
    return bm, cols


join = P.join


def flat_panel_bm(centre, normal, up, width, height, thickness=0.02):
    """A thin box `width` x `height` facing `normal`, its height along `up`: a painted panel."""
    n = normal.normalized()
    u = up - n * up.dot(n)
    u.normalize()
    side = n.cross(u)
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    basis = L.basis_matrix(side, n, u, centre)
    return L.transformed(bm, basis @ L.scale4(width, thickness, height))


def arch_panel_bm(width, height, spring, y, thickness):
    """A thin solid arch facing -Y at depth y: upright sides up to `spring`, then a round top, its
    foot on the ground."""
    half = width / 2
    outline = [(-half, 0.0), (-half, spring)]
    for i in range(1, 8):
        a = math.pi - math.pi * i / 8
        outline.append((half * math.cos(a), spring + (height - spring) * math.sin(a)))
    outline += [(half, spring), (half, 0.0)]
    bm = bmesh.new()
    front = [bm.verts.new((x, y - thickness / 2, z)) for x, z in outline]
    back = [bm.verts.new((x, y + thickness / 2, z)) for x, z in outline]
    bm.faces.new(front)
    bm.faces.new(list(reversed(back)))
    for i in range(len(outline)):
        j = (i + 1) % len(outline)
        bm.faces.new((front[i], back[i], back[j], front[j]))
    bmesh.ops.triangulate(bm, faces=bm.faces[:])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    return bm


def ring_strip_bm(z, half_x, half_y, thickness=PEN):
    """A thin band round a box-shaped wall at height z: a painted line between planks."""
    return P.box_bm(V(0.0, 0.0, z), (2 * half_x + 0.03, 2 * half_y + 0.03, thickness))


def window_parts(centre, normal, width, height):
    """A window: a wooden frame, a pane (which glows at night) and a diamond lattice over it."""
    n = normal.normalized()
    side = UP.cross(n).normalized()
    frame = flat_panel_bm(centre - n * 0.005, n, UP, width + 0.12, height + 0.12, thickness=0.05)
    pane = flat_panel_bm(centre + n * 0.02, n, UP, width, height, thickness=0.02)
    bars = []
    for sign in (-1.0, 1.0):
        for off in (-0.5, 0.0, 0.5):
            c = centre + n * 0.035 + side * (off * width * 0.6)
            d = (side * sign * width * 0.5 + UP * height * 0.5).normalized()
            length = math.hypot(width * 0.55, height)
            bm = flat_panel_bm(c, n, d, 0.035, length, thickness=0.012)
            bars.append(bm)
    return frame, pane, bars


def scales_bm(centre, normal, width, rows, colours, size=0.26):
    """Rows of round scales hanging down a wall, alternating colours: the film's patterned walls.
    Returns (bmesh, colour) pieces."""
    n = normal.normalized()
    side = UP.cross(n).normalized()
    pieces = []
    count = max(1, int(width / size))
    for r in range(rows):
        shift = 0.5 * size if r % 2 else 0.0
        for k in range(count):
            u = -width / 2 + size * (k + 0.5) + shift
            if abs(u) > width / 2 - size * 0.4:
                continue
            top = centre + side * u + UP * (-r * size * 0.62) + n * (0.012 + 0.004 * r)
            bm = bmesh.new()
            hub = bm.verts.new(top)
            arc = []
            for i in range(7):
                a = math.pi * i / 6
                arc.append(bm.verts.new(top + side * (math.cos(a) * size * 0.5) - UP * (math.sin(a) * size * 0.55)))
            for a, b in zip(arc, arc[1:]):
                bm.faces.new((hub, a, b))
            bm.normal_update()
            if bm.faces[:][0].normal.dot(n) < 0:
                bmesh.ops.reverse_faces(bm, faces=bm.faces[:])
            pieces.append((bm, colours[(k + r) % len(colours)]))
    return pieces


def build_beehive(collection):
    """A round thatched hut: a low pale wall under a deep straw dome with an overhanging eave,
    streaked with thatch, a straw topknot tied at the top, and a dark doorway."""
    def thatch(angle, z, n):
        if n.z < -0.3:
            return C["thatchUnder"]
        streak = 0.5 + 0.5 * math.sin(angle * 22.0) * math.sin(angle * 7.0 + 2.0)
        return C["straw"] if streak < 0.6 else C["thatch"]

    def mud(angle, z, n):
        return C["thatchDark"] if z < 0.06 else C["mud"]

    wall = [(0.0, 0.0), (1.62, 0.0), (1.61, 0.4), (1.59, 0.8), (1.57, 1.15), (0.0, 1.15)]
    roof = [(0.0, 1.0), (1.3, 1.0), (1.98, 0.98), (2.04, 1.1), (1.85, 1.6), (1.45, 2.25), (0.85, 2.75),
            (0.3, 2.95), (0.0, 2.98)]
    pieces = [profile_bm(wall, 8, 20, mud), profile_bm(roof, 18, 20, thatch)]
    pieces.append((L.ellipsoid_bm(V(0.0, 0.0, 3.08), (0.24, 0.24, 0.3), u=10, v=7), C["straw"]))
    pieces.append((P.segment_bm(V(0.0, 0.0, 2.98), V(0.0, 0.0, 3.06), 0.2, 0.2, segments=10), C["thatchDark"]))
    # The doorway: a dark arch standing just proud of the wall's front.
    pieces.append((arch_panel_bm(0.8, 0.95, 0.6, -1.67, 0.03), C["door"]))
    body = join("beehive", pieces, collection)
    return [body], {"footprint": {"circle": 1.7}, "height": 3.4}


# ---------------------------------------------------------------------------- stalls
# Each stall's colour, and the colour of the words on its signboard.
STALL_WORDS = {"pink": "#C8325A", "purple": "#FFFFFF", "orange": "#FFFFFF", "blue": "#FFFFFF", "red": "#FFFFFF",
               "white": "#2F6FB5"}


def make_stall(colour):
    def build(collection):
        """A festival stall: a counter painted in its colour, a striped awning, a signboard for
        the game to paint its name on, and a scalloped yellow fringe under the board."""
        col, pieces = C[colour], []
        pieces.append((P.box_bm(V(0.0, 0.0, 0.5), (2.6, 1.0, 1.0), bevel=0.03), C["plank"]))
        pieces.append((P.box_bm(V(0.0, -0.51, 0.5), (2.5, 0.03, 0.85)), col))
        pieces.append((P.box_bm(V(0.0, -0.53, 0.5), (2.5, 0.03, 0.12)), C["white"]))
        pieces.append((P.box_bm(V(0.0, 0.0, 1.03), (2.75, 1.15, 0.07), bevel=0.02), C["plankLight"]))
        for x in (-1.25, 1.25):
            for y, top in ((-0.48, 2.45), (0.48, 2.7)):
                pieces.append((P.segment_bm(V(x, y, 0.0), V(x, y, top), 0.06, 0.055, segments=8), C["post"]))
        # The awning slopes down to the front in stripes.
        stripes = 7
        for k in range(stripes):
            x = -1.45 + 2.9 * (k + 0.5) / stripes
            bm = P.box_bm(V(x, 0.0, 2.6), (2.9 / stripes + 0.002, 1.5, 0.06))
            L.transformed(bm, Matrix.Translation(V(0.0, 0.0, 2.6)) @ Matrix.Rotation(0.2, 4, "X")
                          @ Matrix.Translation(V(0.0, 0.0, -2.6)))
            pieces.append((bm, col if k % 2 == 0 else C["white"]))
        # The signboard over the front.
        pieces.append((P.box_bm(V(0.0, -0.62, 2.95), (2.4, 0.08, 0.7), bevel=0.03), col))
        for x in (-0.9, 0.9):
            pieces.append((P.segment_bm(V(x, -0.62, 2.45), V(x, -0.62, 2.62), 0.035, 0.035, 6), C["post"]))
        for k in range(12):
            x = -1.1 + 0.2 * k
            fringe = bmesh.new()
            hub = fringe.verts.new((x, -0.67, 2.6))
            arc = [fringe.verts.new((x + 0.1 * math.cos(math.pi * i / 4), -0.67, 2.6 - 0.11 * math.sin(math.pi * i / 4)))
                   for i in range(5)]
            for a, b in zip(arc, arc[1:]):
                fringe.faces.new((hub, b, a))
            pieces.append((fringe, C["yellow"]))
        # Things on the counter: cups and a jar.
        for x, c in ((-0.8, C["yellow"]), (-0.55, C["pink"]), (0.7, C["blue"])):
            pieces.append((P.segment_bm(V(x, -0.1, 1.06), V(x, -0.1, 1.2), 0.07, 0.085, segments=8), c))
        pieces.append((L.ellipsoid_bm(V(0.2, 0.05, 1.18), (0.14, 0.14, 0.13), u=10, v=7), C["cream"]))
        body = join(f"stall_{colour}", pieces, collection)
        face, uvs = P.label_bm(V(0.0, -0.66, 2.95), 2.2, 0.56)
        label = P.object_with_uv(f"stall_{colour}_label", face, uvs, collection)
        info = {"footprint": {"box": [1.4, 0.6]}, "height": 3.3,
                "label": {"size": [2.2, 0.56], "colour": STALL_WORDS[colour]}}
        return [body, label], info
    return build


# ---------------------------------------------------------------------------- pier
PIER_LENGTH, PIER_WIDTH = 30.0, 3.2


def build_pier(collection):
    """A long wooden pier: rough wide planks on two beams, round log posts along its edges
    standing up past the deck. Its origin is the deck's top at the beach end; it runs along -Y."""
    rng = np.random.default_rng(4)
    pieces = []
    step = 0.47
    n = int(PIER_LENGTH / step)
    shades = (C["plank"], C["plankDark"], C["plankLight"])
    for i in range(n):
        y = -(i + 0.5) * step
        width = PIER_WIDTH + rng.uniform(-0.12, 0.12)
        bm = P.box_bm(V(rng.uniform(-0.05, 0.05), y, -0.05), (width, 0.42, 0.1))
        L.transformed(bm, Matrix.Translation(V(0.0, y, 0.0)) @ Matrix.Rotation(rng.uniform(-0.025, 0.025), 4, "Z")
                      @ Matrix.Translation(V(0.0, -y, 0.0)))
        pieces.append((bm, shades[int(rng.integers(0, 3))]))
    for x in (-1.1, 1.1):
        pieces.append((P.box_bm(V(x, -PIER_LENGTH / 2, -0.24), (0.22, PIER_LENGTH, 0.22)), C["post"]))
    posts = int(PIER_LENGTH / 3.0) + 1
    for k in range(posts):
        y = -min(k * 3.0, PIER_LENGTH - 0.25)
        for x in (-PIER_WIDTH / 2 - 0.1, PIER_WIDTH / 2 + 0.1):
            top = 0.42 + rng.uniform(-0.06, 0.06)
            pieces.append((P.segment_bm(V(x, y, -4.0), V(x, y, top), 0.17, 0.16, segments=10), C["post"]))
            # segment_bm overshoots each end by 2% of its length; the cut top sits on its end.
            pieces.append((P.disc_bm(V(x, y, top + 0.02 * (top + 4.0) + 0.003), UP, 0.13, 12), C["postTop"]))
        pieces.append((P.box_bm(V(0.0, y, -0.4), (PIER_WIDTH + 0.2, 0.18, 0.18)), C["plankDark"]))
    body = join("pier", pieces, collection)
    # The deck to walk on stops a little short of the planks' edges, so no one stands half off them.
    info = {"decks": [{"box": [0.0, PIER_LENGTH / 2, PIER_WIDTH / 2 - 0.35, PIER_LENGTH / 2], "top": 0.0}],
            "height": 0.5}
    return [body], info


# ---------------------------------------------------------------------------- ferry
def build_ferry(collection):
    """The white duck ferry the guests arrive on: a round body with cabin windows and a door, a
    long neck, a yellow beak, an open deck on its back with a railing. Its origin is at the
    waterline; it faces -Y."""
    blobs = [L.ellipsoid_bm(V(0.0, 0.8, 1.2), (3.0, 7.0, 2.8), u=28, v=16),
             L.ellipsoid_bm(V(0.0, 2.6, 2.3), (2.75, 4.2, 2.3), u=24, v=14),
             L.ellipsoid_bm(V(0.0, -4.3, 1.7), (2.7, 3.2, 2.6), u=24, v=14),
             L.ellipsoid_bm(V(0.0, 8.0, 2.4), (1.0, 1.6, 0.9), u=14, v=9)]
    # The neck: a smooth curve of overlapping balls from the chest up to the head.
    p0, p1, p2 = V(0.0, -4.7, 3.0), V(0.0, -6.4, 5.4), V(0.0, -6.75, 8.7)
    steps = 14
    for i in range(steps + 1):
        t = i / steps
        c = p0 * (1 - t) ** 2 + p1 * (2 * (1 - t) * t) + p2 * t * t
        r = 1.6 + (1.12 - 1.6) * t
        blobs.append(L.ellipsoid_bm(c, (r, r, r), u=16, v=10))
    blobs.append(L.ellipsoid_bm(V(0.0, -6.85, 9.25), (1.62, 1.62, 1.6), u=18, v=12))
    body = L.fuse(blobs, voxel=0.14, smooth_iterations=8, smooth_lambda=0.8, target_tris=3200)
    body.normal_update()
    cols = [C["duckShade"] if v.co.z < 0.35 else C["duck"] for v in body.verts]
    pieces = [(body, cols)]
    pieces.append((L.ellipsoid_bm(V(0.0, -8.55, 9.05), (0.78, 1.25, 0.44), u=14, v=9), C["beak"]))
    for s in (-1.0, 1.0):
        pieces.append((L.ellipsoid_bm(V(s * 1.42, -7.45, 9.85), (0.1, 0.18, 0.2), u=8, v=6), C["ink"]))

    def side_point(y, z):
        """A point on the body's side (x > 0) at y, z, and the outward normal there."""
        a, b, c, cy, cz = 3.0, 7.0, 2.8, 0.8, 1.2
        k = 1.0 - ((y - cy) / b) ** 2 - ((z - cz) / c) ** 2
        x = a * math.sqrt(max(k, 0.05))
        n = Vector((x / a ** 2, (y - cy) / b ** 2, (z - cz) / c ** 2)).normalized()
        return Vector((x, y, z)), n

    glow = []
    for s in (-1.0, 1.0):
        flip = Vector((s, 1.0, 1.0))
        for y in (0.9, 2.6, 4.3):
            p, n = side_point(y, 2.35)
            p, n = p * flip, n * flip
            p = p + n * 0.03
            pieces.append((flat_panel_bm(p - n * 0.01, n, UP, 1.35, 0.82, 0.05), C["ink"]))
            glow.append((flat_panel_bm(p + n * 0.02, n, UP, 1.2, 0.68, 0.03), C["glass"]))
            for k in (-1, 0, 1):
                side = UP.cross(n).normalized()
                pieces.append((flat_panel_bm(p + n * 0.04 + side * (k * 0.3), n, UP, 0.05, 0.68, 0.02), C["white"]))
        p, n = side_point(-1.2, 1.0)
        p, n = p * flip, n * flip
        pieces.append((flat_panel_bm(p + n * 0.02, n, UP, 0.82, 1.32, 0.04), C["ink"]))
        pieces.append((flat_panel_bm(p + n * 0.045, n, UP, 0.7, 1.2, 0.03), C["white"]))
        side = UP.cross(n).normalized()
        pieces.append((L.ellipsoid_bm(p + n * 0.09 + side * (0.22 * s), (0.05, 0.05, 0.05), u=6, v=4), C["ink"]))

    # The open deck on its back: a low deckhouse rising out of the body, ringed by a railing.
    deck = bmesh.new()
    bmesh.ops.create_cone(deck, cap_ends=True, cap_tris=False, segments=24, radius1=1.0, radius2=1.0, depth=1.0)
    L.transformed(deck, Matrix.Translation(V(0.0, 3.3, 3.55)) @ L.scale4(1.7, 2.6, 1.0))
    pieces.append((deck, [C["deck"] if v.co.z > 4.0 else C["duck"] for v in deck.verts]))
    ring = []
    for k in range(20):
        a = 2.0 * math.pi * k / 20
        p = V(1.55 * math.sin(a), 3.3 - 2.45 * math.cos(a), 4.05)
        ring.append(p)
        pieces.append((cylinder_bm(p, p + V(0.0, 0.0, 0.7), 0.04, 6), C["white"]))
    for a, b in zip(ring, ring[1:] + ring[:1]):
        pieces.append((cylinder_bm(a + V(0.0, 0.0, 0.7), b + V(0.0, 0.0, 0.7), 0.045, 6), C["white"]))
    duck = join("ferry", pieces, collection)
    lights = join("ferry_glow", glow, collection)
    return [duck, lights], {"height": 11.0}


# ---------------------------------------------------------------------------- festival
def make_bunting(span, top, sag, flags, name):
    """Festival bunting between two poles `span` apart along X, `top` high: triangle flags in
    bright colours along a sagging string, with paper lanterns that glow at night."""
    def build(collection):
        return build_bunting(collection, span, top, sag, flags, name)
    return build


def build_bunting(collection, span, top, sag, flags, name):
    half = span / 2
    pieces, glow = [], []
    for x in (-half, half):
        pieces.append((P.segment_bm(V(x, 0.0, -0.3), V(x, 0.0, top + 0.12), 0.06, 0.05, segments=8), C["post"]))
        pieces.append((L.ellipsoid_bm(V(x, 0.0, top + 0.14), (0.07, 0.07, 0.05), u=8, v=5), C["postTop"]))

    def string(t):
        x = -half + 2.0 * half * t
        return V(x, 0.0, top - sag * (1.0 - (2.0 * t - 1.0) ** 2))

    pts = [string(i / 8) for i in range(9)]
    for a, b in zip(pts, pts[1:]):
        pieces.append((cylinder_bm(a, b, 0.014, 4), C["ink"]))
    colours = (C["pink"], C["yellow"], C["teal"], C["orange"], C["white"], C["purple"])
    for k in range(flags):
        t = (k + 0.5) / flags
        if abs(t - 0.25) < 0.03 or abs(t - 0.5) < 0.03 or abs(t - 0.75) < 0.03:
            continue
        c = string(t)
        bm = bmesh.new()
        pts3 = [(-0.17, 0.0), (0.17, 0.0), (0.0, -0.38)]
        front = [bm.verts.new(c + V(px, -0.008, pz)) for px, pz in pts3]
        back = [bm.verts.new(c + V(px, 0.008, pz)) for px, pz in pts3]
        bm.faces.new(front)
        bm.faces.new(list(reversed(back)))
        for i in range(3):
            j = (i + 1) % 3
            bm.faces.new((front[i], back[i], back[j], front[j]))
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
        pieces.append((bm, colours[k % len(colours)]))
    for t in (0.25, 0.5, 0.75):
        c = string(t) - V(0.0, 0.0, 0.32)
        pieces.append((cylinder_bm(c + V(0.0, 0.0, 0.2), c + V(0.0, 0.0, 0.3), 0.012, 4), C["ink"]))
        pieces.append((P.segment_bm(c + V(0.0, 0.0, 0.17), c + V(0.0, 0.0, 0.22), 0.08, 0.08, 8), C["ink"]))
        pieces.append((P.segment_bm(c - V(0.0, 0.0, 0.22), c - V(0.0, 0.0, 0.17), 0.08, 0.08, 8), C["ink"]))
        glow.append((L.ellipsoid_bm(c, (0.17, 0.17, 0.21), u=10, v=6), C["lantern"]))
    body = join(name, pieces, collection)
    lights = join(f"{name}_glow", glow, collection)
    info = {"footprint": {"circles": [[-half, 0.0, 0.12], [half, 0.0, 0.12]]}, "height": top + 0.3}
    return [body, lights], info


def build_basket(collection):
    """A woven basket heaped with fruit."""
    def weave(angle, z, n):
        return C["basketDark"] if int(z / 0.045) % 2 else C["basket"]

    pieces = [profile_bm([(0.0, 0.0), (0.2, 0.0), (0.27, 0.1), (0.3, 0.2), (0.0, 0.22)], 8, 12, weave)]
    fruit = [((0.0, 0.0, 0.28), 0.1, C["orange"]), ((0.12, 0.06, 0.26), 0.085, C["red"]),
             ((-0.11, 0.08, 0.26), 0.09, C["yellow"]), ((0.04, -0.13, 0.25), 0.085, C["orange"]),
             ((-0.08, -0.08, 0.27), 0.08, C["red"])]
    for c, r, colour in fruit:
        pieces.append((L.ellipsoid_bm(V(*c), (r, r, r), u=8, v=5), colour))
    for c in ((0.13, -0.08, 0.3), (0.16, -0.03, 0.31), (0.11, -0.03, 0.34)):
        pieces.append((L.ellipsoid_bm(V(*c), (0.045, 0.045, 0.045), u=6, v=4), C["purple"]))
    return [join("basket", pieces, collection)], {"footprint": {"circle": 0.3}, "height": 0.4}


def build_pot(collection):
    """A terracotta pot of leafy greens."""
    def clay(angle, z, n):
        return C["potRim"] if z > 0.26 else C["pot"]

    pieces = [profile_bm([(0.0, 0.0), (0.16, 0.0), (0.2, 0.25), (0.24, 0.27), (0.24, 0.32), (0.0, 0.3)], 6, 10, clay)]
    for k in range(5):
        a = 2.0 * math.pi * k / 5 + 0.3
        tilt = 0.55 + 0.25 * (k % 2)
        d = V(math.cos(a) * math.sin(tilt), math.sin(a) * math.sin(tilt), math.cos(tilt))
        c = V(0.0, 0.0, 0.3) + d * 0.2
        rot = UP.rotation_difference(d).to_matrix()
        pieces.append((L.ellipsoid_bm(c, (0.07, 0.025, 0.2), rot=rot, u=6, v=3), C["leaf"] if k % 2 else C["leafDark"]))
    pieces.append((L.ellipsoid_bm(V(0.0, 0.0, 0.42), (0.12, 0.12, 0.14), u=6, v=4), C["leaf"]))
    return [join("pot", pieces, collection)], {"footprint": {"circle": 0.28}, "height": 0.7}


GREENS = (L.hex_color("#6FAE6A"), L.hex_color("#9CCB7A"), L.hex_color("#4E9467"), L.hex_color("#C9A35A"))
WARMS = (L.hex_color("#E39A55"), L.hex_color("#D8664E"), L.hex_color("#F0C45C"), L.hex_color("#7FB7A0"))

BUILDERS = {
    "hut_green": lambda collection: H.build_stilt_hut("hut_green", GREENS, collection),
    "hut_warm": lambda collection: H.build_stilt_hut("hut_warm", WARMS, collection),
    "hut_plank": lambda collection: H.build_plank_hut("hut_plank", collection),
    "beehive": build_beehive,
    "stage": H.build_stage,
    "torch": H.build_torch,
    "arch": H.build_arch,
    "banner": H.build_banner,
    "lanterns": H.build_lantern_pole,
    "stall_pink": make_stall("pink"),
    "stall_purple": make_stall("purple"),
    "stall_orange": make_stall("orange"),
    "stall_blue": make_stall("blue"),
    "stall_red": make_stall("red"),
    "stall_white": make_stall("white"),
    "pier": build_pier,
    "ferry": build_ferry,
    "bunting": make_bunting(7.0, 2.75, 0.55, 13, "bunting"),
    "bunting_long": make_bunting(19.0, 4.4, 1.0, 34, "bunting_long"),
    "basket": build_basket,
    "pot": build_pot,
}


if __name__ == "__main__":
    P.build_all(BUILDERS, OUT_BLEND, prefix="village")
