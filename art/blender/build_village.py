"""Build the village, the pier and the ferry in Blender and export them for the game.

Run (from the project root):
    blender --background --factory-startup --python art/blender/build_village.py -- [--only hut_green,stage] [--no-previews]

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
from mathutils.bvhtree import BVHTree

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
    "duck": "#F6F9FC",
    "duckShade": "#CBD9E8",
    "beakLight": "#F8DA6A",
    "beakDark": "#E9A93A",
    "glass": "#8DB3DD",
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
# Each stall's colours, after the film's: its header board, the scalloped trim under the board, the
# stripes of the wall at the back of the booth, its counter, and the colour of the words on its
# board.
STALL_STYLES = {
    "pink": {"trim": "#FFFFFF", "inside": ("#E9768A", "#D85C72"), "counter": "#F29A8E", "words": "#C8325A"},
    "purple": {"trim": "#FFFFFF", "inside": ("#E07050", "#CF5B3F"), "counter": "#EF8A50", "words": "#FFFFFF"},
    "orange": {"trim": "#F2D04E", "inside": ("#E5703F", "#D45B33"), "counter": "#F2A055", "words": "#FFFFFF"},
    "blue": {"trim": "#FFFFFF", "inside": ("#E8834B", "#D86C3C"), "counter": "#EF8A50", "words": "#FFFFFF"},
    "red": {"trim": "#F2D04E", "inside": ("#E0603E", "#CC4E33"), "counter": "#F2A055", "words": "#FFFFFF"},
    "white": {"trim": "#4E8FCF", "inside": ("#E9845A", "#D96E47"), "counter": "#F4F1E8", "words": "#2F6FB5"},
}
# A stall's size, after the film's, where the islander who keeps it stands behind its counter with
# their upper half above it and the header board just over their head: how wide and how deep the
# booth is, the counter's top, and the header board's bottom and top (its roof). About a metre clear
# between the counter and the back wall for its keeper, and a metre between neighbouring booths
# (2.92 m apart along their rows) for them to come in by.
STALL = {"width": 1.9, "depth": 1.5, "counter": 0.52, "board": (1.3, 1.95)}
# The stall's name across its header board: how wide and how high.
STALL_LABEL = (1.75, 0.5)
LANTERN_COLOURS = ("#F7D046", "#9CCB7A", "#F7A1C4", "#7EC3EA", "#F29E6B")


def make_stall(colour):
    def build(collection):
        """A festival stall as the film's: a booth on four thin posts under a flat roof, with a deep
        header board across its front for the game to paint its name on, a scalloped trim along
        the board's bottom and paper lanterns hanging under it; a wall of stripes at the back, and
        a low counter across the front behind which the islander who keeps it stands, white menu
        tags hanging off its front. It is open at its sides behind the counter, where its keeper
        comes in from the alley behind the row. Light, as forty of them stand along the festival;
        it faces -Y, its middle at the origin."""
        style = {k: (tuple(L.hex_color(c) for c in v) if isinstance(v, tuple) else L.hex_color(v))
                 for k, v in STALL_STYLES[colour].items() if k != "words"}
        s = STALL
        w, d = s["width"] / 2, s["depth"] / 2
        top = s["counter"]
        b0, b1 = s["board"]
        pieces = []
        # Posts at the corners, up to the roof.
        for x in (-w + 0.04, w - 0.04):
            for y in (-d + 0.04, d - 0.04):
                pieces.append((P.segment_bm(V(x, y, 0.0), V(x, y, b1), 0.04, 0.04, segments=6), C["plankLight"]))
        # The roof, a flat board over it all.
        pieces.append((P.box_bm(V(0.0, 0.0, b1 - 0.02), (s["width"], s["depth"], 0.04)), C["plank"]))
        # The wall across the back, in upright stripes of two shades.
        stripes = 6
        for k in range(stripes):
            x = -w + s["width"] * (k + 0.5) / stripes
            pieces.append((P.box_bm(V(x, d - 0.03, b1 / 2), (s["width"] / stripes + 0.002, 0.04, b1 - 0.04)),
                           style["inside"][k % 2]))
        # The counter across the front: its painted face, a pale grey frame round it and across it,
        # and a board on top.
        cy = -d + 0.22
        pieces.append((P.box_bm(V(0.0, cy, top / 2), (s["width"] - 0.1, 0.4, top)), style["counter"]))
        frame = L.hex_color("#D9DBD6")
        face = cy - 0.2
        pieces.append((P.box_bm(V(0.0, face - 0.012, top - 0.02), (s["width"] - 0.08, 0.03, 0.04)), frame))
        pieces.append((P.box_bm(V(0.0, face - 0.012, 0.03), (s["width"] - 0.08, 0.03, 0.04)), frame))
        for x in (-w + 0.06, -w / 3, w / 3, w - 0.06):
            pieces.append((P.box_bm(V(x, face - 0.012, top / 2), (0.035, 0.03, top - 0.02)), frame))
        pieces.append((P.box_bm(V(0.0, cy + 0.02, top + 0.02), (s["width"] - 0.04, 0.46, 0.04)), C["plankLight"]))
        # White menu tags hanging off the counter's front, each with a few lines of writing.
        ink = L.hex_color("#4A3A33")
        for k, x in enumerate(f * w for f in (-0.69, -0.4, 0.36, 0.63)):
            h = 0.2 + 0.03 * (k % 2)
            pieces.append((P.box_bm(V(x, face - 0.03, top - 0.03 - h / 2), (0.11, 0.008, h)), C["white"]))
            for j in (-0.025, 0.02):
                pieces.append((P.box_bm(V(x + j, face - 0.035, top - 0.05 - h * 0.45), (0.012, 0.004, h * 0.6)), ink))
        # Things on the counter: cups and a jar.
        for f, c in ((-0.57, C["yellow"]), (-0.4, C["pink"]), (0.52, C["blue"])):
            x = f * w
            pieces.append((P.segment_bm(V(x, cy + 0.06, top + 0.04), V(x, cy + 0.06, top + 0.17), 0.055, 0.07, segments=6), c))
        pieces.append((L.ellipsoid_bm(V(0.14 * w, cy + 0.1, top + 0.15), (0.12, 0.12, 0.11), u=8, v=5), C["cream"]))
        # The header board: a deep box across the top of the front, a little wider than the booth.
        hy = -d + 0.15
        pieces.append((P.box_bm(V(0.0, hy, (b0 + b1) / 2), (s["width"] + 0.1, 0.38, b1 - b0)), C[colour]))
        # The scalloped trim along its bottom edge, at the front and down its sides.
        def scallop(cx, cy_, cz, r, normal_x):
            bm = bmesh.new()
            hub = bm.verts.new((cx, cy_, cz))
            arc = []
            for i in range(5):
                a = math.pi * i / 4
                if normal_x:
                    arc.append(bm.verts.new((cx, cy_ + r * math.cos(a), cz - r * math.sin(a))))
                else:
                    arc.append(bm.verts.new((cx + r * math.cos(a), cy_, cz - r * math.sin(a))))
            for a, b in zip(arc, arc[1:]):
                bm.faces.new((hub, b, a) if not normal_x else (hub, a, b))
            return bm
        count = 11
        r = (s["width"] + 0.1) / count / 2
        for k in range(count):
            x = -(s["width"] + 0.1) / 2 + r * (2 * k + 1)
            pieces.append((scallop(x, hy - 0.195, b0, r, False), style["trim"]))
        for side in (-1, 1):
            for k in range(2):
                y = hy - 0.19 + r * (2 * k + 1)
                pieces.append((scallop(side * (w + 0.055), y, b0, r, True), style["trim"]))
        # Paper lanterns hanging under the board, inside the front of the booth.
        for k, x in enumerate(f * w for f in (-0.71, -0.36, 0.0, 0.36, 0.71)):
            z = b0 - 0.16 - 0.03 * (k % 2)
            pieces.append((P.segment_bm(V(x, -d + 0.3, b0), V(x, -d + 0.3, z + 0.07), 0.006, 0.006, segments=4), C["post"]))
            pieces.append((L.ellipsoid_bm(V(x, -d + 0.3, z), (0.075, 0.075, 0.07), u=8, v=5),
                           L.hex_color(LANTERN_COLOURS[k % len(LANTERN_COLOURS)])))
        body = join(f"stall_{colour}", pieces, collection)
        face_bm, uvs = P.label_bm(V(0.0, hy - 0.19, (b0 + b1) / 2 + 0.02), STALL_LABEL[0], STALL_LABEL[1])
        label = P.object_with_uv(f"stall_{colour}_label", face_bm, uvs, collection)
        # What blocks walkers: the counter and the back wall, so its keeper can walk in at either
        # side and stand between them; the camera keeps out of the booth's top (in the game's frame,
        # z = -y).
        blocks = [{"box": [0.0, -cy, w, 0.22], "y": [0.0, top + 0.1]},
                  {"box": [0.0, -(d - 0.03), w, 0.05], "y": [0.0, b1]},
                  {"box": [0.0, 0.0, w + 0.05, d + 0.05], "y": [b0 - 0.05, b1], "walk": False}]
        info = {"blocks": blocks, "height": b1,
                "label": {"size": list(STALL_LABEL), "colour": STALL_STYLES[colour]["words"]}}
        return [body, label], info
    return build


# ---------------------------------------------------------------------------- pier
# As in the film's aerial shot, the pier reaches only a little way out into the bay.
PIER_LENGTH, PIER_WIDTH = 14.0, 3.2


def build_pier(collection):
    """A wooden pier: rough wide planks on two beams, round log posts along its edges standing up
    past the deck. Its origin is the deck's top at the beach end; it runs along -Y."""
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
# The duck ferry, after the film's (`boat`) and the sketches of it: front, both sides and top.
# Heights are the side sketches'; the top sketch gives its outline from above, and the front
# sketches its cross-section.
#
# The body is lofted through cross-sections along the boat: (y, half width, bottom, top, deck),
# each a bell from `bottom` to `top`, sliced flat at `deck` where the open-air deck is. From above
# it is an egg, widest at the cabin's front wall, its narrow end round the head at the bow. The
# bow rises under the neck; the deck runs from the neck to the cabin's front wall; behind it the
# cabin's round roof curves down to the stern.
FERRY_BODY = [
    (-6.75, 0.4, 1.9, 3.0, 99.0), (-6.55, 1.4, 1.3, 3.5, 99.0), (-6.2, 2.2, 0.75, 3.9, 99.0),
    (-5.6, 2.8, 0.25, 4.1, 99.0), (-4.8, 3.34, -0.3, 4.2, 99.0), (-4.0, 3.7, -0.55, 4.25, 99.0),
    (-3.4, 3.9, -0.6, 8.25, 4.28), (-2.0, 4.23, -0.6, 8.25, 4.28), (-0.5, 4.58, -0.6, 8.25, 4.28),
    (0.8, 4.73, -0.6, 8.25, 4.28), (1.5, 4.78, -0.6, 8.25, 4.28),
    (1.62, 4.79, -0.6, 8.25, 99.0), (2.5, 4.79, -0.6, 8.2, 99.0), (3.4, 4.74, -0.6, 8.14, 99.0),
    (4.5, 4.57, -0.6, 7.99, 99.0), (5.6, 4.18, -0.6, 7.6, 99.0), (6.6, 3.62, -0.55, 7.07, 99.0),
    (7.3, 2.88, -0.4, 6.5, 99.0), (7.8, 2.0, -0.1, 5.7, 99.0), (8.1, 1.35, 0.25, 4.6, 99.0),
    (8.3, 0.8, 0.55, 3.4, 99.0), (8.42, 0.3, 0.8, 2.4, 99.0),
]
FERRY_DECK = {"floor": 4.28, "front": -3.4, "wall": 1.55, "rail": 0.7}
# The neck and head, ring by ring up the side sketches' outline: (height, middle along the boat,
# half width, half length). Broad where it rises from the bow, its back curving in to a slim waist,
# then out into the head, round from above as the top sketch draws it.
FERRY_NECK = [
    (1.0, -4.6, 1.85, 1.9), (2.0, -4.6, 1.85, 1.9), (3.1, -4.63, 1.8, 1.8), (3.95, -4.55, 1.7, 1.7),
    (4.8, -4.55, 1.55, 1.55), (5.25, -4.52, 1.5, 1.52), (5.7, -4.64, 1.32, 1.32), (6.0, -4.72, 1.22, 1.21),
    (6.5, -4.74, 1.18, 1.16), (7.2, -4.69, 1.2, 1.2), (7.9, -4.63, 1.3, 1.31), (8.45, -4.66, 1.45, 1.45),
    (8.8, -4.68, 1.6, 1.57), (9.1, -4.73, 1.71, 1.71), (9.55, -4.84, 1.79, 1.84), (10.15, -4.9, 1.8, 1.86),
    (10.8, -4.82, 1.6, 1.61), (11.25, -4.77, 1.13, 1.13), (11.45, -4.6, 0.65, 0.65),
]
FERRY_TOP = 11.52   # the top of the head


def blend(a, b, t):
    """Colour a blended toward b by t."""
    return tuple(a[i] + (b[i] - a[i]) * t for i in range(3))


def bell(h):
    """The ferry's cross-section after the front sketch: its half width at height fraction h (0 at
    the bottom, 1 at the top), round over the top, widest low down, rounded under the bottom."""
    h = min(max(h, 0.0), 1.0)
    under = min(h / 0.14, 1.0)
    return math.sqrt(max(1.0 - h ** 3, 0.0)) * math.sqrt(max(1.0 - (1.0 - under) ** 2, 0.0))


def section_ring(w, bottom, top, deck, count):
    """`count` points (x, z) round a cross-section, at even angles about a point inside it, starting
    at the bottom and going up the +x side: the bell, sliced flat at `deck` if that is below its top."""
    lid = min(top, deck)
    half = [(w * bell((z - bottom) / (top - bottom)), z) for z in np.linspace(bottom, lid, 48)]
    half[0] = (0.0, bottom)
    if deck < top:
        half.append((0.0, lid))
    else:
        half[-1] = (0.0, lid)
    mid = bottom + 0.45 * (lid - bottom)
    angles = [math.atan2(x, mid - z) for x, z in half]   # 0 straight down, pi straight up
    ring = []
    for k in range(count):
        a = 2.0 * math.pi * k / count
        side = 1.0 if a <= math.pi else -1.0
        a = a if a <= math.pi else 2.0 * math.pi - a
        x = float(np.interp(a, angles, [p[0] for p in half]))
        z = float(np.interp(a, angles, [p[1] for p in half]))
        ring.append((side * x, z))
    return ring


def loft_bm(rings):
    """A closed surface through rings of points, each ring's first point matching the next's;
    its ends closed round their middles."""
    bm = bmesh.new()
    verts = [[bm.verts.new(p) for p in ring] for ring in rings]
    n = len(rings[0])
    for a, b in zip(verts, verts[1:]):
        for k in range(n):
            j = (k + 1) % n
            bm.faces.new((a[k], a[j], b[j], b[k]))
    for ring in (verts[0], verts[-1]):
        middle = bm.verts.new(sum((v.co for v in ring), Vector()) / n)
        for k in range(n):
            bm.faces.new((ring[k], ring[(k + 1) % n], middle))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    return bm


def decal_bm(cast, u, v, lift, thickness, steps=(4, 4)):
    """A thin plate laid on a curved surface, following it like paint: `cast(a, b)` gives the
    surface's point and normal under each point of a grid over a in u = (u0, u1) and b in v; the
    plate stands `lift` off the surface and is `thickness` thick. Its face keeps its own corners,
    so it shades as smoothly as the surface under it."""
    su, sv = steps
    bm = bmesh.new()
    lo, hi = [], []
    for j in range(sv + 1):
        lo.append([])
        hi.append([])
        for i in range(su + 1):
            p, n = cast(u[0] + (u[1] - u[0]) * i / su, v[0] + (v[1] - v[0]) * j / sv)
            lo[j].append(bm.verts.new(p + n * lift))
            hi[j].append(bm.verts.new(p + n * (lift + thickness)))
    for j in range(sv):
        for i in range(su):
            bm.faces.new((hi[j][i], hi[j][i + 1], hi[j + 1][i + 1], hi[j + 1][i]))
            bm.faces.new((lo[j][i], lo[j + 1][i], lo[j + 1][i + 1], lo[j][i + 1]))
    rim = ([(0, i) for i in range(su)] + [(j, su) for j in range(sv)] +
           [(sv, i) for i in range(su, 0, -1)] + [(j, 0) for j in range(sv, 0, -1)])
    for (ja, ia), (jb, ib) in zip(rim, rim[1:] + rim[:1]):
        bm.faces.new((lo[ja][ia], lo[jb][ib], hi[jb][ib], hi[ja][ia]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    bm.normal_update()
    bmesh.ops.split_edges(bm, edges=[e for e in bm.edges if e.calc_face_angle(0.0) > 1.0])
    return bm


def loop_tube_bm(points, radius, normal, segments=6):
    """A round tube through a closed loop of points lying across `normal`: a line painted round."""
    bm = bmesh.new()
    count = len(points)
    rings = []
    for i, p in enumerate(points):
        t = (points[(i + 1) % count] - points[i - 1]).normalized()
        side = t.cross(normal).normalized()
        up = side.cross(t)
        rings.append([bm.verts.new(p + (side * math.cos(a) + up * math.sin(a)) * radius)
                      for a in np.linspace(0.0, 2.0 * math.pi, segments, endpoint=False)])
    for i in range(count):
        a, b = rings[i], rings[(i + 1) % count]
        for k in range(segments):
            bm.faces.new((a[k], a[(k + 1) % segments], b[(k + 1) % segments], b[k]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    return bm


def build_ferry(collection):
    """The white duck ferry the guests arrive on, after the film's and the sketches of it: one round
    body, a bell in section and an egg from above, with a tall bendy neck and round head at its
    front, a long flat yellow bill and dot eyes; an open-air deck behind the neck with a railing
    round its open sides; the cabin behind, its rounded front wall (a door and a small window)
    facing the deck and its round roof curving down to a little flat tail; paned windows along the
    cabin's sides, and a door in the hull's left side under the deck. No hard edges anywhere. Its
    origin is at the waterline; it faces -Y (so its left side is +x)."""
    rings = []
    for y, w, bottom, top, deck in FERRY_BODY:
        rings.append([(x, y, z) for x, z in section_ring(w, bottom, top, deck, 64)])
    body = loft_bm(rings)
    neck_rings = []
    for z, y, rx, ry in FERRY_NECK:
        neck_rings.append([(rx * math.cos(t), y + ry * math.sin(t), z)
                           for t in np.linspace(0.0, 2.0 * math.pi, 40, endpoint=False)])
    neck = loft_bm(neck_rings + [[(0.0, -4.6, FERRY_TOP)] * 40])
    deck = FERRY_DECK
    floor = deck["floor"]
    shapes = [body, neck,
              L.ellipsoid_bm(V(0.0, -2.9, floor), (1.3, 1.0, 0.95), u=18, v=10),   # the neck flaring into the deck
              L.ellipsoid_bm(V(0.0, 8.4, 1.6), (0.9, 0.6, 0.32), u=14, v=8)]       # the flat little tail
    duck = L.fuse(shapes, voxel=0.12, smooth_iterations=8, smooth_lambda=0.8, target_tris=5000)
    duck.normal_update()

    def colour(v):
        if v.normal.z > 0.9 and abs(v.co.z - floor) < 0.08 and deck["front"] < v.co.y < deck["wall"]:
            return C["plankLight"]     # the deck
        # White, with the sea's blue in it toward the water, as in the film.
        return blend(C["duck"], C["duckShade"], L.smoothstep(2.0, -0.3, v.co.z))

    pieces = [(duck, [colour(v) for v in duck.verts])]
    tree = BVHTree.FromBMesh(duck)

    def surface(origin, direction):
        """Where a ray meets the body, and the surface's normal there."""
        hit, normal, _, _ = tree.ray_cast(origin, direction)
        return hit, normal

    def facing(n):
        """A turn taking the -y axis to point along n: for flat things laid on the surface."""
        return Vector((0.0, -1.0, 0.0)).rotation_difference(n).to_matrix()

    # The long, flat bill, yellow on top and deeper orange underneath, and a dot eye either side.
    front, _ = surface(V(0.0, -20.0, 9.69), V(0.0, 1.0, 0.0))
    bill = L.ellipsoid_bm(front + V(0.0, -0.77, 0.0), (0.8, 1.02, 0.37), u=20, v=12)
    bill.normal_update()
    pieces.append((bill, [blend(C["beakDark"], C["beakLight"], L.smoothstep(-0.5, 0.6, v.normal.z))
                          for v in bill.verts]))
    for s in (-1.0, 1.0):
        eye, n = surface(V(s * 1.13, -20.0, 10.32), V(0.0, 1.0, 0.0))
        pieces.append((L.ellipsoid_bm(eye + n * 0.03, (0.13, 0.07, 0.15), rot=facing(n), u=8, v=6), C["ink"]))

    glow = []

    # Windows and doors lie on the body like paint, following its curve, square on from the side
    # (or, on the cabin's front wall, from the front) as the sketches draw them.
    def frame(cast, u, v, steps=(4, 4)):
        """The ink round a window or door over the patch u, v that `cast` lays on the body."""
        pieces.append((decal_bm(cast, (u[0] - 0.07, u[1] + 0.07), (v[0] - 0.07, v[1] + 0.07), 0.02, 0.03, steps),
                       C["ink"]))

    def inside(cast, u, v, glass):
        """The glass that lights at night, or the white door, inside a frame."""
        (glow if glass else pieces).append((decal_bm(cast, u, v, 0.05, 0.02), C["glass"] if glass else C["white"]))

    for s in (-1.0, 1.0):
        def side(y, z):
            return surface(V(s * 20.0, y, z), V(-s, 0.0, 0.0))

        def window(ya, yb, za, zb, panes):
            """Panes side by side in one frame, from ya to yb along the boat and za to zb up it."""
            frame(side, (ya + 0.05, yb - 0.05), (za + 0.05, zb - 0.05), (2 * panes, 4))
            w = (yb - ya) / panes
            for k in range(panes):
                inside(side, (ya + w * k + 0.05, ya + w * (k + 1) - 0.05), (za + 0.05, zb - 0.05), True)

        window(2.96, 6.04, 4.78, 6.32, 4)
        window(2.25, 6.38, 1.29, 3.68, 5)
        if s > 0:
            # The door in the hull's left side under the deck, with its knob.
            u, v = (-0.1, 1.21), (0.76, 2.44)
            frame(side, u, v)
            inside(side, u, v, False)
            p, n = side(0.26, 1.5)
            pieces.append((L.ellipsoid_bm(p + n * 0.12, (0.08, 0.08, 0.08), u=6, v=4), C["ink"]))
        # The railing round the deck's open side: across its front from the neck to the side, then
        # along the side to the cabin. Posts stand on the deck (or the neck's flare) under a level rail.
        edge = []
        for y in np.linspace(deck["front"] + 0.8, deck["wall"] - 0.1, 12):
            p, _ = surface(V(s * 20.0, y, floor - 0.25), V(-s, 0.0, 0.0))
            edge.append(V(p.x - s * 0.3, y, 0.0))
        path = [V(s * 1.75, deck["front"] + 0.1, 0.0)] + edge
        spaced = [path[0]]
        for a, b in zip(path, path[1:]):
            steps = max(1, int((b - a).length / 0.36))
            spaced += [a.lerp(b, (i + 1) / steps) for i in range(steps)]
        top = floor + deck["rail"]
        rail = []
        for q in spaced:
            ground, _ = surface(V(q.x, q.y, 20.0), V(0.0, 0.0, -1.0))
            foot = V(q.x, q.y, ground.z if ground else floor)
            if foot.z < top - 0.06:
                pieces.append((cylinder_bm(foot, V(q.x, q.y, top), 0.04, 6), C["white"]))
            rail.append(V(q.x, q.y, top))
        for a, b in zip(rail, rail[1:]):
            pieces.append((cylinder_bm(a, b, 0.05, 6), C["white"]))
    # The cabin's front wall inked round its arch, as the front sketches draw it: up from the deck
    # on either side a hand's breadth in from its rounded edge, over the top, and along its foot.
    def wall(x, z):
        return surface(V(x, 0.0, z), V(0.0, 1.0, 0.0))

    _, w, bottom, top, _ = next(s for s in FERRY_BODY if s[0] > deck["wall"])    # the front wall's section
    edge = [(w * bell((z - bottom) / (top - bottom)), z)
            for z in (top - (top - floor - 0.08) * (1.0 - t) ** 2 for t in np.linspace(0.0, 1.0, 24))]
    edge = [(-x, z) for x, z in edge] + [(x, z) for x, z in reversed(edge[:-1])]
    arch = []
    for i, (x, z) in enumerate(edge):
        (xa, za), (xb, zb) = edge[max(i - 1, 0)], edge[min(i + 1, len(edge) - 1)]
        n = Vector((zb - za, xa - xb)).normalized()      # along the edge, turned a quarter inward
        arch.append((x + n.x * 0.32, max(z + n.y * 0.32, floor + 0.08)))
    foot = [(x, floor + 0.08) for x in np.linspace(arch[-1][0], arch[0][0], 12)[1:-1]]
    ring = []
    for x, z in arch + foot:
        hit, n = wall(x, z)
        if hit is not None and hit.y > 1.0:
            ring.append(hit + n * 0.03)
    pieces.append((loop_tube_bm(ring, 0.06, V(0.0, -1.0, 0.0)), C["ink"]))
    # On the front wall, the door at the bottom in the middle, and a small window high up to the
    # right as you face it, just showing past the neck from in front.
    for u, v, glass in (((-0.6, 0.6), (floor + 0.12, floor + 1.57), False), ((0.74, 1.42), (6.3, 7.12), True)):
        frame(wall, u, v)
        inside(wall, u, v, glass)
    p, n = wall(-0.3, floor + 0.8)
    pieces.append((L.ellipsoid_bm(p + n * 0.12, (0.07, 0.07, 0.07), u=6, v=4), C["ink"]))
    body_obj = join("ferry", pieces, collection)
    lights = join("ferry_glow", glow, collection)
    return [body_obj, lights], {"height": FERRY_TOP}


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
    # Along the front rows, pole to pole over four stalls; across the street, from behind one row
    # to behind the other.
    "bunting_row": make_bunting(11.68, 4.3, 0.45, 21, "bunting_row"),
    # The street's bunting on poles at the booths' fronts, as its banners, clear of the gaps between
    # the booths that their keepers come in by.
    "bunting_street": make_bunting(8.6, 4.4, 0.45, 15, "bunting_street"),
    "basket": build_basket,
    "pot": build_pot,
}


if __name__ == "__main__":
    P.build_all(BUILDERS, OUT_BLEND, prefix="village")
