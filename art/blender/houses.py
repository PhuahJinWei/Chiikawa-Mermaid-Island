"""Houses you can walk into, the village's watchtower stage, and the festival street's arch and
banners, after the film's village and festival frames (reference images `Screenshot 2026-10-17
103834`, `103927`, `104000`, `104329`, `104338`, `103743`, `103757`, `104155`).

Walls are solid slabs round their openings (doorways and windows), each with an outer skin of
planks and an inner skin of logs, so the pen's outline (an inverted hull) works from inside a room
as from outside it: a closed box would turn to ink all round anyone standing in it.

Each house comes in parts: its body, its room's lantern that lights up at night and lights the room
(`_lamp`), the window panes that glow at night seen from outside and are clear from inside
(`_pane`), its room's inside (`_inside`, drawn only near), and a light version of its roof and walls
for seeing from afar (`_far`). Coordinates are Blender's: Z up, each building faces -Y and stands on
its origin. What each tells the game is in the game's frame (x across, z toward the front, y up), which is
Blender's (x, -y, z): `blocks` (what stops walkers and the camera, each over a range of heights),
`decks` (floors, porches and stairs to walk on; a deck with `front` rises or falls to that height at
its front edge, like a ramp) and `labels` (faces for painted words).

A house with a lantern also has its night (see bake_night): the lantern's light on its body and room,
baked with Cycles into `public/models/props/<id>_night.webp` on the parts' UVs, and its doorways and
windows (`openings`), where that light spills out onto the ground.
"""

import base64
import math
import os

import bmesh
import bpy
import numpy as np
from mathutils import Matrix, Vector, geometry
from mathutils.bvhtree import BVHTree

import build_props as P
import charlib as L

C = {k: L.hex_color(v) for k, v in {
    "log": "#9A6A42",
    "logDark": "#7C5232",
    "logEnd": "#D6B282",
    "plank": "#BC8C58",
    "plankLine": "#8E623D",
    "inside": "#93653F",
    "insideLine": "#6E4A2E",
    "floor": "#A9794B",
    "floorLine": "#7F5634",
    "glass": "#4E8F73",
    "lattice": "#F4F1DE",
    "frame": "#7A5133",
    "thatch": "#B98D57",
    "thatchLight": "#CFA86C",
    "thatchDark": "#8E6A3E",
    "thatchUnder": "#5E4632",
    "straw": "#D8B577",
    "pot": "#C7714E",
    "leaf": "#4DB35A",
    "leafDark": "#3F8F45",
    "board": "#E2BE86",
    "boardEdge": "#C49A62",
    "flower": "#F8CB2E",
    "flowerCentre": "#F08A24",
    "vine": "#5DB64F",
    "gold": "#E9B949",
    "red": "#E2533F",
    "pink": "#F4A3B5",
    "white": "#FFFFFF",
    "cream": "#FFF6E4",
    "lantern": "#F6A2BD",
    "lanternBand": "#FFFFFF",
    "torch": "#8A5A3B",
    "rope": "#54473D",
    "basket": "#C9A06A",
    "flame": "#FFB347",
    "flameCore": "#FFE58A",
    # The guest houses: pale logs, their cut ends paler round a darker heart; the doors' planks, the
    # brown of their frames, and diamond windows; the orange one's grey-green boarded sides; inside,
    # dark logs with pale cut ends, a floor of light planks and the roof's dark boards on rafters; a
    # red hammock.
    "guestLog": "#E8D0A4",
    "guestLogDark": "#B7976B",
    "guestLogEnd": "#F7EACF",
    "guestLogRing": "#E1CBA3",
    "guestDoor": "#B98D5A",
    "guestDoorLine": "#8A6238",
    "guestDoorFrame": "#B98D5A",
    "guestBoard": "#9CAE95",
    "guestInLog": "#7A5234",
    "guestInLogEnd": "#D3AF80",
    "guestInSkin": "#4A3222",
    "guestFloor": "#E6A465",
    "guestFloorLine": "#9A6F45",
    "guestRoofIn": "#6E4C30",
    "guestRafter": "#563A23",
    "doorGlass": "#9FD3E6",
    "hammock": "#D9566B",
    "hammockDark": "#B4425A",
    # The rooms' furnishing: stone and clay, bamboo, iron, water, rattan and the paper lanterns.
    "stone": "#A8A196",
    "clayDark": "#8C4A33",
    "bamboo": "#A9BE62",
    "iron": "#3E3733",
    "water": "#86BFD8",
    "rattan": "#CDA36B",
    # The huts' grey sink and its curved tap.
    "steel": "#B9BEC2",
    "steelDark": "#8D9398",
    "paperLantern": "#FFD9A0",
    # The porches' potted plants, and the doors' handles.
    "succulent": "#B7A88E",
    "rosette": "#7FB069",
    "thistle": "#B04BA8",
    "handle": "#4A3426",
    # The stilt huts, after the film's frames of a villager's hut: the rope tying the roof's straw at
    # its top, the straw's pale gold and its dark strokes; inside, teal walls patterned in scales over a
    # darker skin, framed by grey-brown logs with pale cut ends, dark plank shutters, light planks
    # underfoot and a straw ceiling on rafters.
    "tie": "#9A6838",
    "hutThatch": "#D9B676",
    "hutThatchLight": "#E6C68A",
    "hutThatchDark": "#B38C55",
    "hutStraw": "#9A6A3A",
    "hutLog": "#8C7556",
    "hutLogEnd": "#D2BE98",
    "hutSkin": "#5E8573",
    "hutScale1": "#6F9A86",
    "hutScale2": "#7AA591",
    "hutScale3": "#678F7D",
    "hutScale4": "#82AC98",
    "shutter": "#86603F",
    "hutDoor": "#9A6A42",
    "hutDoorLine": "#62402A",
    "shutterLine": "#5C3F28",
    "hutFloor": "#C48A55",
    "hutFloorLine": "#8C5E37",
    "hutCeiling": "#685739",
    "hutRafter": "#7A6448",
    # Their furnishing: the bed's dark frame, pale blue mattress and white pillow; the stump stool; the
    # cream kitchen counter, its doors' panels and pale post, wooden top, black pans, cloth and wooden
    # spoons; the orange bookshelf and its books; the little tables; the brown woven vases; the rug's
    # cream and blues; the straw cushions; the fruit and the potted monstera.
    "bedFrame": "#5E4330",
    "mattress": "#D3E2EA",
    "pillow": "#F4F2EC",
    "stump": "#8A5E3E",
    "stumpEnd": "#D8B98E",
    "stumpRing": "#B48A5E",
    "cabinet": "#E9DCB9",
    "cabinetPanel": "#E2D1AA",
    "cabinetLight": "#F2E9D3",
    "cabinetLine": "#B49E78",
    "lace": "#FBF6EA",
    "counterTop": "#B98352",
    "cuttingBoard": "#D3A56E",
    "pan": "#2F2B2A",
    "towel": "#EDE6D3",
    "spoon": "#A87148",
    "shelf": "#C8743E",
    "shelfDark": "#8F4E28",
    "hutBook1": "#9E3F31",
    "hutBook2": "#7B3B2E",
    "hutBook3": "#C9B48F",
    "hutBook4": "#C76A48",
    "hutBook5": "#4E5C4A",
    "hutBook6": "#D9C7A2",
    "chest": "#9B6B44",
    "chestTop": "#B07D50",
    "basketLine": "#8F6A3F",
    "basketIn": "#5A4128",
    "soil": "#4A3A2C",
    "rugCream": "#F1E8D2",
    "rugBlue": "#4E6B8C",
    "rugGrey": "#6E8297",
    "strawCushion": "#E2C27F",
    "strawStripe": "#BF9B5B",
    "apple": "#D2483A",
    "peach": "#F0A27A",
    "pear": "#B9BE4E",
    "orange": "#EE9A3A",
    "melon": "#9CC26B",
    "vase": "#9C6B42",
    "vaseLine": "#7A5130",
    "vaseIn": "#4A3020",
}.items()}

UP = Vector((0.0, 0.0, 1.0))
PEN = P.PEN
COURSE = 0.36  # height of a log course inside


def V(x, y, z):
    return Vector((x, y, z))


def g(x, y):
    """A Blender point's place in the game's frame (x, z)."""
    return [round(x, 3), round(-y, 3)]


def block_box(x0, x1, y0, y1, low, high, walk=True, camera=True):
    """A box over Blender x0..x1, y0..y1, standing from height `low` to `high`, in the game's frame."""
    cx, cz = g((x0 + x1) / 2, (y0 + y1) / 2)
    return {"box": [cx, cz, round(abs(x1 - x0) / 2, 3), round(abs(y1 - y0) / 2, 3)], "y": [low, high],
            "walk": walk, "camera": camera}


def deck_box(x0, x1, y0, y1, top, front=None):
    """A floor over Blender x0..x1, y0..y1 at `top`; with `front`, a ramp to that height at its
    front edge (the end toward Blender -y)."""
    cx, cz = g((x0 + x1) / 2, (y0 + y1) / 2)
    deck = {"box": [cx, cz, round(abs(x1 - x0) / 2, 3), round(abs(y1 - y0) / 2, 3)], "top": top}
    if front is not None:
        deck["front"] = front
    return deck


def oriented_box(centre, x_axis, y_axis, size):
    """A box `size` (along x_axis, y_axis, and their cross) centred on `centre`."""
    x = x_axis.normalized()
    y = (y_axis - x * y_axis.dot(x)).normalized()
    z = x.cross(y)
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    return L.transformed(bm, L.basis_matrix(x, y, z, centre) @ L.scale4(*size))


def log(a, b, radius, segments=7):
    return P.segment_bm(a, b, radius, radius * 0.94, segments=segments)


def quad(centre, along, normal, length, width):
    """A single flat strip facing `normal`: a painted line on a face."""
    a = along.normalized()
    n = normal.normalized()
    up = n.cross(a)
    bm = bmesh.new()
    corners = [centre + a * (sa * length / 2) + up * (su * width / 2) for sa, su in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
    verts = [bm.verts.new(c) for c in corners]
    face = bm.faces.new(verts)
    face.normal_update()
    if face.normal.dot(n) < 0:
        face.normal_flip()
    return bm


# How far out of the wall's middle a window pane stands: clear of where the wall's two skins meet,
# which its edges reach into.
PANE_OUT = 0.005


def pane(centre, along, out, length, height):
    """A window pane: one sheet near the wall's middle facing `out`, so it glows seen from outside
    while from inside, where it is turned away and not drawn, the window shows what is beyond."""
    return quad(centre, along, out, length, height)


def paper_lantern(x, y, top, lz, pieces, glow):
    """A paper lantern hanging on a rope from `top` with its middle at `lz`, banded top and bottom,
    lit at night."""
    pieces.append((log(V(x, y, top), V(x, y, lz + 0.2), 0.01, segments=4), C["rope"]))
    for dz in (0.19, -0.19):
        pieces.append((P.segment_bm(V(x, y, lz + dz - 0.02), V(x, y, lz + dz + 0.02), 0.08, 0.08, 10), C["frame"]))
    glow.append((L.ellipsoid_bm(V(x, y, lz), (0.17, 0.17, 0.2), u=10, v=6), C["paperLantern"]))


# ---------------------------------------------------------------------------- walls
def solid_rects(length, height, openings):
    """The solid parts of a wall `length` long and `height` high with rectangular openings
    (u0, u1, v0, v1), as rectangles (u0, u1, v0, v1): vertical bands split at every opening's
    edge, each band's solid stretches between the openings that cross it."""
    cuts = sorted({0.0, length, *[c for o in openings for c in o[:2] if 0.0 < c < length]})
    rects = []
    for a, b in zip(cuts, cuts[1:]):
        mid = (a + b) / 2
        holes = sorted((o[2], o[3]) for o in openings if o[0] < mid < o[1])
        v = 0.0
        for h0, h1 in holes:
            if h0 > v:
                rects.append((a, b, v, h0))
            v = max(v, h1)
        if v < height:
            rects.append((a, b, v, height))
    return rects


def solid_spans(length, v, openings):
    """The stretches along a wall that are solid at height v."""
    spans, u = [], 0.0
    for o in sorted(openings):
        if o[2] <= v <= o[3]:
            if o[0] > u:
                spans.append((u, o[0]))
            u = max(u, o[1])
    if u < length:
        spans.append((u, length))
    return spans


class Wall:
    """A straight wall from a to b (plan points, Blender x and y) standing from z0 up `height`,
    `thickness` thick, with its room on the left of a to b."""

    def __init__(self, a, b, z0, height, thickness, openings=()):
        self.a, self.b = Vector((a[0], a[1], 0.0)), Vector((b[0], b[1], 0.0))
        self.d = (self.b - self.a).normalized()
        self.inward = Vector((-self.d.y, self.d.x, 0.0))
        self.length = (self.b - self.a).length
        self.z0, self.height, self.t = z0, height, thickness
        self.openings = list(openings)

    def point(self, u, v, depth):
        """A point u along the wall, v up it, `depth` in from its outer face."""
        return self.a + self.d * u + self.inward * (depth - self.t / 2) + UP * (self.z0 + v)

    def skins(self, outer, inner):
        """The wall's solid parts, each as an outer skin of `outer` and an inner skin of `inner`."""
        out = []
        for u0, u1, v0, v1 in solid_rects(self.length, self.height, self.openings):
            for depth, colour in ((self.t * 0.25, outer), (self.t * 0.75, inner)):
                c = self.point((u0 + u1) / 2, (v0 + v1) / 2, depth)
                out.append((oriented_box(c, self.d, self.inward, (u1 - u0, self.t / 2, v1 - v0)), colour))
        return out

    def courses(self, colour, side, start=COURSE, step=COURSE, until=None):
        """Thin dark lines along the wall every `step` up it, on the outer (side -1) or inner (+1)
        face, broken at the openings: planks outside, logs inside."""
        out, v = [], start
        top = self.height if until is None else until
        normal = -self.inward if side < 0 else self.inward
        while v < top - 0.05:
            for u0, u1 in solid_spans(self.length, v, self.openings):
                depth = -0.004 if side < 0 else self.t + 0.004
                out.append((quad(self.point((u0 + u1) / 2, v, depth), self.d, normal, u1 - u0, PEN), colour))
            v += step
        return out

    def far(self, colour):
        """The wall as one plain box, for seeing from afar."""
        c = self.point(self.length / 2, self.height / 2, self.t / 2)
        return (oriented_box(c, self.d, self.inward, (self.length, self.t, self.height)), colour)

    def scales(self, colours, v0, v1, size=0.3):
        """Rows of round scales hanging down the outer face between v1 and v0, in turn colours: the
        film's patterned walls. Each scale is a little fan facing out."""
        out, out_n = [], -self.inward
        rows = int((v1 - v0) / (size * 0.62))
        for r in range(rows):
            v = v1 - r * size * 0.62
            shift = size * 0.5 if r % 2 else 0.0
            for u0, u1 in solid_spans(self.length, v - size * 0.3, self.openings):
                k = 0
                u = u0 + size * 0.5 + shift
                while u < u1 - size * 0.45:
                    top = self.point(u, v, -0.008 - 0.003 * r)
                    bm = bmesh.new()
                    hub = bm.verts.new(top)
                    arc = [bm.verts.new(top + self.d * (math.cos(math.pi * i / 4) * size * 0.5)
                                        - UP * (math.sin(math.pi * i / 4) * size * 0.56)) for i in range(5)]
                    for p, q in zip(arc, arc[1:]):
                        bm.faces.new((hub, p, q))
                    bm.normal_update()
                    if bm.faces[:][0].normal.dot(out_n) < 0:
                        bmesh.ops.reverse_faces(bm, faces=bm.faces[:])
                    out.append((bm, colours[(k + r) % len(colours)]))
                    u += size
                    k += 1
        return out

    def shingles(self, colours, v0, v1, size=0.34):
        """Overlapping round scales covering the outer face from v1 down to v0, row on row, clear of
        its openings and their frames: the film's shingled walls, in turn colours."""
        out, out_n = [], -self.inward
        # The scales run right up to the openings, under their frames, which hide their edges.
        clear = [(a - 0.01, b + 0.01, c - 0.01, d + 0.01) for a, b, c, d in self.openings]
        # Each scale hangs well below the next row's tops, each row lies over the one below it, its
        # round bottoms showing, and the scales of a row overlap a little, so no wall shows
        # between them. Each stretch of wall is filled from end to end.
        drop, step = size * 0.95, size * 0.6
        # Each scale leans out toward its round bottom by `lean`, so where a row hangs over the one
        # below it lies clear of it (by 0.6 of the lean at least, less the stagger), and its
        # neighbours in the row stand `stagger` apart: no two scales lie in one plane.
        lean, stagger = 0.012, 0.004
        rows = int((v1 - v0 - drop) / step) + 1
        for r in range(rows):
            v = v1 - r * step
            spans = [(max(a0, b0), min(a1, b1)) for a0, a1 in solid_spans(self.length, v, clear)
                     for b0, b1 in solid_spans(self.length, v - drop, clear) if min(a1, b1) > max(a0, b0)]
            k = 0
            for u0, u1 in spans:
                n = max(1, round((u1 - u0) / size))
                width = (u1 - u0) / n
                # Every other row sits half a scale over, its ends cut short to its stretch.
                offsets = [(j + 0.5) * width for j in range(n)] if r % 2 == 0 else \
                    [0.25 * width] + [(j + 1.0) * width for j in range(n - 1)] + [(u1 - u0) - 0.25 * width]
                for j, du in enumerate(offsets):
                    half = width * (0.3 if r % 2 and j in (0, len(offsets) - 1) else 0.56)
                    top = self.point(u0 + du, v, -0.008 - stagger * (k % 2))
                    bm = bmesh.new()
                    hub = bm.verts.new(top)
                    arc = []
                    for i in range(7):
                        down = math.sin(math.pi * i / 6) ** 0.8
                        arc.append(bm.verts.new(top + self.d * (math.cos(math.pi * i / 6) * half) - UP * (down * drop)
                                                - self.inward * (lean * down)))
                    for p, q in zip(arc, arc[1:]):
                        bm.faces.new((hub, p, q))
                    bm.normal_update()
                    if bm.faces[:][0].normal.dot(out_n) < 0:
                        bmesh.ops.reverse_faces(bm, faces=bm.faces[:])
                    out.append((bm, colours[(k * 2 + r * 3 + k // 3) % len(colours)]))
                    k += 1
        return out

    def rail(self, v, radius, colour):
        """A log along the outer face at height v, broken at the openings."""
        out = []
        around = [(a - radius, b + radius, c - radius, d + radius) for a, b, c, d in self.openings]
        for u0, u1 in solid_spans(self.length, v, around):
            if u1 - u0 > 0.15:
                out.append((log(self.point(u0, v, -radius * 0.7), self.point(u1, v, -radius * 0.7), radius, segments=8),
                            colour))
        return out

    def window(self, opening, panes):
        """A window in one of the wall's openings, as the film's: a heavy board frame with a deep
        sill outside, green panes that light up at night with two thin bars down them, a double
        white zigzag over them outside and a cross frame inside. The panes go into `panes`."""
        u0, u1, v0, v1 = opening
        w, h = u1 - u0, v1 - v0
        uc, vc = (u0 + u1) / 2, (v0 + v1) / 2
        out = []
        bar = 0.1
        # The frame reaches `e` into the opening, and the panes, their bars and the cross inside
        # reach `e` into the wall round it, so none of their faces lies in the opening's own.
        e = 0.004
        for c, size in ((self.point(uc, v1 + (bar - e) / 2, -0.035), (w + 2 * bar, 0.09, bar + e)),
                        (self.point(uc, v0 - (bar - e) / 2, -0.05), (w + 2 * bar + 0.14, 0.14, bar + e)),
                        (self.point(u0 - (bar - e) / 2, vc, -0.035), (bar + e, 0.09, h)),
                        (self.point(u1 + (bar - e) / 2, vc, -0.035), (bar + e, 0.09, h))):
            out.append((oriented_box(c, self.d, self.inward, size), C["frame"]))
        panes.append((pane(self.point(uc, vc, self.t / 2 - PANE_OUT), self.d, -self.inward, w + 2 * e, h + 2 * e), C["glass"]))
        for f in (1 / 3, 2 / 3):
            out.append((oriented_box(self.point(u0 + w * f, vc, self.t / 2 - 0.014), self.d, self.inward,
                                     (0.025, 0.012, h + e)), C["frame"]))
        # The zigzags: two Ws across the panes, one above the other, outside.
        for lo, hi in ((0.1, 0.42), (0.56, 0.88)):
            pts = [(u0 + w * f, v0 + h * (lo if i % 2 else hi)) for i, f in enumerate((0.06, 0.28, 0.5, 0.72, 0.94))]
            for (pu, pv), (qu, qv) in zip(pts, pts[1:]):
                p, q = self.point(pu, pv, self.t / 2 - 0.024), self.point(qu, qv, self.t / 2 - 0.024)
                out.append((oriented_box((p + q) / 2, q - p, -self.inward, ((q - p).length + 0.03, 0.035, 0.012)),
                            C["lattice"]))
        for c, size in ((self.point(uc, vc, self.t / 2 + 0.02), (0.04, 0.02, h + 2 * e)),
                        (self.point(uc, vc, self.t / 2 + 0.02), (w + 2 * e, 0.02, 0.04))):
            out.append((oriented_box(c, self.d, self.inward, size), C["frame"]))
        return out


# ---------------------------------------------------------------------------- roofs
def lathe_roof(ctrl, centre, samples=14, segments=20, seed=0.0,
               straw=("thatch", "thatchLight", "thatchDark")):
    """A thatched roof turned round its middle from (radius, height) points: dark underneath,
    straw above in soft radial streaks, lighter toward its crown; `straw` names its straw's colours
    (its own, lighter and darker)."""
    prof = L.Profile(ctrl, samples=samples)
    bm = L.lathe_bm(prof.samples, segments=segments)
    L.transformed(bm, Matrix.Translation(centre))
    bm.normal_update()
    top = max(z for _, z in ctrl)
    cols = []
    for v in bm.verts:
        if v.normal.z < -0.3:
            cols.append(C["thatchUnder"])
            continue
        a = math.atan2(v.co.x - centre.x, v.co.y - centre.y)
        streak = 0.5 + 0.5 * math.sin(a * 14.0 + seed) * math.sin(a * 5.0 + 1.3 + seed)
        c = C[straw[0]] if streak < 0.62 else C[straw[2]]
        cols.append(C[straw[1]] if v.co.z > top - 0.6 and streak < 0.45 else c)
    return bm, cols


def hip_roof(x0, x1, y0, y1, eave, edge, ridge_z, ridge_half, subdivide=True, hole=None):
    """A thatched hip roof over Blender x0..x1, y0..y1: a flat underside at `eave`, a thick eave
    edge up to `edge`, sloping up to a ridge along x at `ridge_z`. A closed solid, for the pen; or,
    given `hole` ((x0, x1), (y0, y1)), the rectangle over the walls' middles, its underside a ring
    round it, open over a room that has its own ceiling."""
    bm = bmesh.new()
    cy = (y0 + y1) / 2
    low = [bm.verts.new((x, y, eave)) for x, y in ((x0, y0), (x1, y0), (x1, y1), (x0, y1))]
    high = [bm.verts.new((x, y, edge)) for x, y in ((x0, y0), (x1, y0), (x1, y1), (x0, y1))]
    r0, r1 = bm.verts.new((-ridge_half, cy, ridge_z)), bm.verts.new((ridge_half, cy, ridge_z))
    if hole is None:
        bm.faces.new(list(reversed(low)))
    else:
        (hx0, hx1), (hy0, hy1) = hole
        inner = [bm.verts.new((x, y, eave)) for x, y in ((hx0, hy0), (hx1, hy0), (hx1, hy1), (hx0, hy1))]
        for i in range(4):
            j = (i + 1) % 4
            bm.faces.new((low[j], low[i], inner[i], inner[j]))
    for i in range(4):
        j = (i + 1) % 4
        bm.faces.new((low[i], low[j], high[j], high[i]))
    bm.faces.new((high[0], high[1], r1, r0))       # front slope
    bm.faces.new((high[2], high[3], r0, r1))       # back slope
    bm.faces.new((high[1], high[2], r1))           # right end
    bm.faces.new((high[3], high[0], r0))           # left end
    if subdivide:
        bmesh.ops.subdivide_edges(bm, edges=[e for e in bm.edges if e.calc_length() > 2.0], cuts=2, use_grid_fill=True)
    bmesh.ops.triangulate(bm, faces=bm.faces[:])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    bm.normal_update()
    cols = []
    for v in bm.verts:
        if v.normal.z < -0.3:
            cols.append(C["thatchUnder"])
        else:
            streak = 0.5 + 0.5 * math.sin(v.co.x * 4.1) * math.sin(v.co.y * 3.3 + 1.0)
            cols.append(C["thatchLight"] if v.co.z > ridge_z - 0.4 else C["thatch"] if streak < 0.6 else C["thatchDark"])
    return bm, cols


# ---------------------------------------------------------------------------- furnishing
def log_stairs(x_half, y_top, y_bottom, z_top, rungs=3, rail=0.1, rung=0.08):
    """Log stairs as in the film: two log rails down from a porch, log rungs across them, `rail`
    and `rung` thick."""
    out = []
    for x in (-x_half, x_half):
        out.append((log(V(x, y_top + 0.05, z_top + 0.02 - rail * 0.4), V(x, y_bottom, -0.05), rail, segments=10), C["log"]))
    for i in range(1, rungs + 1):
        t = i / (rungs + 1)
        y = y_top + (y_bottom - y_top) * t
        z = z_top * (1 - t) - 0.05
        out.append((log(V(-x_half - rail * 0.6, y, z), V(x_half + rail * 0.6, y, z), rung, segments=10),
                    C["logDark"] if i % 2 else C["log"]))
    return out


def door_handle(at, out, pieces):
    """A dark C-shaped door handle on a door's face at `at`, standing out toward `out`."""
    o = out.normalized()
    side = UP.cross(o).normalized()
    for dz in (0.075, -0.075):
        pieces.append((oriented_box(at + o * 0.03 + UP * dz, o, side, (0.06, 0.03, 0.028)), C["handle"]))
    pieces.append((oriented_box(at + o * 0.06, UP, o, (0.18, 0.032, 0.032)), C["handle"]))


def potted_succulent(at, pieces):
    """A terracotta pot with a gnarled succulent in it, its fat trunk branching into green
    rosettes, as on the film's hut porches."""
    pieces.append((turned([(0.0, 0.0), (0.13, 0.0), (0.16, 0.25), (0.19, 0.27), (0.19, 0.32), (0.0, 0.32)], at), C["pot"]))
    pieces.append((L.ellipsoid_bm(at + V(0.0, 0.0, 0.42), (0.1, 0.09, 0.14), u=8, v=6), C["succulent"]))
    for k, (dx, dy, dz) in enumerate(((-0.13, 0.02, 0.18), (0.12, -0.03, 0.22), (0.02, 0.1, 0.26))):
        a, b = at + V(0.0, 0.0, 0.46), at + V(dx, dy, 0.46 + dz)
        pieces.append((P.segment_bm(a, b, 0.045, 0.03, 6), C["succulent"]))
        for j in range(6):
            ang = j * math.pi / 3 + k
            leaf = b + V(math.cos(ang) * 0.055, math.sin(ang) * 0.055, 0.015)
            pieces.append((L.ellipsoid_bm(leaf, (0.055, 0.028, 0.018), rot=Matrix.Rotation(ang, 3, "Z"), u=6, v=3),
                           C["rosette"]))


def potted_thistles(at, pieces):
    """A round clay pot of purple thistles: spiky heads on stems among jagged leaves."""
    pieces.append((turned([(0.0, 0.0), (0.1, 0.01), (0.15, 0.08), (0.14, 0.16), (0.07, 0.21), (0.08, 0.24), (0.0, 0.24)],
                          at), C["pot"]))
    for k in range(7):
        ang = k * 2 * math.pi / 7
        c = at + V(math.cos(ang) * 0.1, math.sin(ang) * 0.1, 0.31)
        pieces.append((L.ellipsoid_bm(c, (0.12, 0.035, 0.02), rot=Matrix.Rotation(ang, 3, "Z") @ Matrix.Rotation(-0.5, 3, "Y"),
                                      u=6, v=3), C["leafDark"]))
    for k in range(5):
        ang = k * 2 * math.pi / 5 + 0.3
        r = 0.05 + 0.03 * (k % 2)
        top = at + V(math.cos(ang) * r, math.sin(ang) * r, 0.48 + 0.05 * (k % 3))
        pieces.append((P.segment_bm(at + V(0.0, 0.0, 0.24), top, 0.01, 0.008, 4), C["leafDark"]))
        pieces.append((L.ellipsoid_bm(top, (0.038, 0.038, 0.03), u=6, v=4), C["leaf"]))
        pieces.append((L.ellipsoid_bm(top + V(0.0, 0.0, 0.035), (0.046, 0.046, 0.03), u=6, v=4), C["thistle"]))


def turned(ctrl, centre, segments=12, samples=10):
    """A small turned thing (a jar, a pot, a cup) from (radius, height) points, bottom to top, at
    `centre`."""
    bm = L.lathe_bm(L.Profile(ctrl, samples=samples).samples, segments=segments)
    return L.transformed(bm, Matrix.Translation(centre))


# ---------------------------------------------------------------------------- the night
NIGHT_SIZE = 512          # each house's night map, texels across
NIGHT_SAMPLES = 160       # Cycles' samples a texel
NIGHT_PROBE_SAMPLES = 16  # the first, rough bake's, which finds the faces the light reaches
NIGHT_DARK = 0.004        # a face whose light stays under this share of the brightest is left black
NIGHT_GAP = 2             # texels between the map's patches, each keeping a ring of its own light
NIGHT_CORNER = 6          # texels across the black corner every face left black points at
NIGHT_MASK = 32           # texels across a doorway's or window's mask of where the light passes
NIGHT_MASK_RAYS = 12      # points on the lantern's globe each texel of a mask looks at, and its middle
NIGHT_SMALL = 0.01        # square metres: a smaller patch of faces (a knob, a peg) is laid out as if this big
NIGHT_DECAL = 0.01        # a flat piece lying this close over a face looking its way is painted on it
NIGHT_HIDE = 0.015        # how far behind what it is painted on a decal waits while the light is baked
NIGHT_GROW = 4.0          # but at most this many times its size across
LANTERN_POWER = 100.0     # the lantern's power in the bake, in watts; the game sets its own
LANTERN_RADIUS = 0.17     # its paper globe, which softens the shadows' edges


def openings_of(walls):
    """The walls' doorways and windows, for the game: each one's middle on the wall's outer face
    and the way out of it, in the house's frame (the game's), its width and height, and whether it
    is a doorway."""
    out = []
    for wall in walls:
        n = -wall.inward
        for u0, u1, v0, v1 in wall.openings:
            c = wall.point((u0 + u1) / 2, (v0 + v1) / 2, 0.0)
            out.append({"at": [round(c.x, 3), round(c.z, 3), round(-c.y, 3)],
                        "out": [round(n.x, 3), round(n.z, 3), round(-n.y, 3)],
                        "size": [round(u1 - u0, 3), round(v1 - v0, 3)], "door": v0 < 0.1})
    return out


def opening_masks(openings, targets, lantern):
    """Where the lantern at `lantern` lights through each of `openings` (see openings_of), for the
    game's light out of them: over the opening's outer face, NIGHT_MASK points from its right to
    its left as one looks out through it, and as many from its foot up, each how much of the
    lantern's globe it sees past the house (an open door leaf, a window's lattice, the wall's
    thickness at a slant), 0 to 255, row by row from the foot, as base64. Returns the openings with
    their masks."""
    bm = bmesh.new()
    for o in targets:
        mesh = o.data.copy()
        mesh.transform(o.matrix_world)
        bm.from_mesh(mesh)
        bpy.data.meshes.remove(mesh)
    bvh = BVHTree.FromBMesh(bm)
    bm.free()
    # The lantern's middle and points round its globe, on a spiral.
    points = [lantern]
    for k in range(NIGHT_MASK_RAYS):
        z = 1.0 - 2.0 * (k + 0.5) / NIGHT_MASK_RAYS
        r = math.sqrt(1.0 - z * z)
        a = k * math.pi * (3.0 - math.sqrt(5.0))
        points.append(lantern + Vector((math.cos(a) * r, math.sin(a) * r, z)) * LANTERN_RADIUS)
    out = []
    for opening in openings:
        # Back into Blender's frame from the game's (x, z, -y).
        at = Vector((opening["at"][0], -opening["at"][2], opening["at"][1]))
        n = Vector((opening["out"][0], -opening["out"][2], opening["out"][1]))
        side = Vector((-n.y, n.x, 0.0)).normalized()
        width, height = opening["size"]
        mask = bytearray()
        for j in range(NIGHT_MASK):
            for i in range(NIGHT_MASK):
                q = (at + side * (i / (NIGHT_MASK - 1) - 0.5) * width
                     + Vector((0.0, 0.0, 1.0)) * (j / (NIGHT_MASK - 1) - 0.5) * height)
                seen = 0
                for p in points:
                    way = q - p
                    hit = bvh.ray_cast(p, way.normalized(), way.length - 1e-3)
                    seen += hit[0] is None
                mask.append(round(255 * seen / len(points)))
        out.append(dict(opening, mask=base64.b64encode(bytes(mask)).decode("ascii")))
    return out


def grow_small_islands(mesh):
    """Makes each small island of the edit-mode `mesh`'s UV map `night` (faces joined edge to edge in
    it) as big in the map as NIGHT_SMALL square metres would be, up to NIGHT_GROW times across: a
    knob, a peg or an apple, left as small as it is, would fall between the bake's texels and stay
    dark however the lantern lit it."""
    bm = bmesh.from_edit_mesh(mesh)
    uv = bm.loops.layers.uv["night"]
    done = set()
    for seed in bm.faces:
        if seed.hide or seed in done:
            continue
        island, todo = [], [seed]
        done.add(seed)
        while todo:
            face = todo.pop()
            island.append(face)
            for loop in face.loops:
                a0, a1 = loop[uv].uv, loop.link_loop_next[uv].uv
                for other in loop.edge.link_loops:
                    near = other.face
                    if near in done or near.hide:
                        continue
                    b0, b1 = other[uv].uv, other.link_loop_next[uv].uv
                    if ((a0 - b1).length < 1e-5 and (a1 - b0).length < 1e-5) or \
                            ((a0 - b0).length < 1e-5 and (a1 - b1).length < 1e-5):
                        done.add(near)
                        todo.append(near)
        area = sum(face.calc_area() for face in island)
        if area >= NIGHT_SMALL:
            continue
        grow = min(NIGHT_GROW, math.sqrt(NIGHT_SMALL / max(area, 1e-8)))
        loops = [loop for face in island for loop in face.loops]
        mid = sum((loop[uv].uv for loop in loops), Vector((0.0, 0.0))) / len(loops)
        for loop in loops:
            loop[uv].uv = mid + (loop[uv].uv - mid) * grow
    bmesh.update_edit_mesh(mesh)


def night_layout(unwrap, keep):
    """Lays out the UV map `night` of the mesh object `unwrap`: the faces flagged in `keep`
    unwrapped and packed tight into the map, short of its far corner (the small ones a little bigger,
    see grow_small_islands), and every other face at one texel in that corner, which the map keeps
    black."""
    mesh = unwrap.data
    faces = len(mesh.polygons)
    mesh.polygons.foreach_set("hide", ~keep)
    view_layer = bpy.context.view_layer
    for o in view_layer.objects:
        o.select_set(o is unwrap)
    view_layer.objects.active = unwrap
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    margin = NIGHT_GAP / NIGHT_SIZE
    bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=margin)
    grow_small_islands(mesh)
    bpy.ops.uv.select_all(action="SELECT")
    bpy.ops.uv.pack_islands(rotate=True, margin_method="FRACTION", margin=margin, shape_method="CONCAVE")
    bpy.ops.object.mode_set(mode="OBJECT")
    mesh.polygons.foreach_set("hide", np.zeros(faces, dtype=bool))
    totals = np.empty(faces, dtype=np.int32)
    mesh.polygons.foreach_get("loop_total", totals)
    kept = np.repeat(keep, totals)
    uvs = np.empty(len(mesh.loops) * 2, dtype=np.float32)
    mesh.uv_layers["night"].data.foreach_get("uv", uvs)
    uvs = uvs.reshape(-1, 2)
    uvs[kept] *= 1.0 - NIGHT_CORNER / NIGHT_SIZE
    uvs[~kept] = 1.0 - NIGHT_CORNER / 2 / NIGHT_SIZE
    mesh.uv_layers["night"].data.foreach_set("uv", uvs.ravel())


def night_lit(mesh, light, dark=NIGHT_DARK):
    """Which faces of `mesh` a bake's `light` (texel by texel, rows from the bottom, laid out on the
    mesh's map `night`) finds lit: brighter than `dark` of its brightest at any of their corners,
    their middle, or halfway between."""
    n = NIGHT_SIZE
    lit = light[light > 1e-6]
    top = float(np.percentile(lit, 99.5)) if lit.size else 1.0
    faces = len(mesh.polygons)
    starts = np.empty(faces, dtype=np.int32)
    totals = np.empty(faces, dtype=np.int32)
    mesh.polygons.foreach_get("loop_start", starts)
    mesh.polygons.foreach_get("loop_total", totals)
    uvs = np.empty(len(mesh.loops) * 2, dtype=np.float32)
    mesh.uv_layers["night"].data.foreach_get("uv", uvs)
    uvs = uvs.reshape(-1, 2)
    middles = np.add.reduceat(uvs, starts, axis=0) / totals[:, None]
    owner = np.repeat(np.arange(faces), totals)
    samples = np.concatenate([uvs, middles, (uvs + middles[owner]) / 2])
    sample_face = np.concatenate([owner, np.arange(faces), owner])
    x = np.clip((samples[:, 0] * n).astype(int), 0, n - 1)
    y = np.clip((samples[:, 1] * n).astype(int), 0, n - 1)
    brightest = np.zeros(faces, dtype=np.float32)
    np.maximum.at(brightest, sample_face, light.reshape(n, n)[y, x])
    return brightest > dark * top


def night_seen(mesh, lantern):
    """Which faces of `mesh` see the lantern at `lantern` with nothing between: lit by it however
    small they are, an apple or a knob, whose few texels the rough bake (see night_lit) may miss
    when a house has many faces."""
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bm.normal_update()
    bvh = BVHTree.FromBMesh(bm)
    seen = np.zeros(len(bm.faces), dtype=bool)
    for i, f in enumerate(bm.faces):
        c = f.calc_center_median()
        way = lantern - c
        if way.length < 1e-6 or f.normal.dot(way) <= 0.0:
            continue
        seen[i] = bvh.ray_cast(c + f.normal * 0.002, way.normalized(), way.length - LANTERN_RADIUS)[0] is None
    bm.free()
    return seen


def night_open(mesh, faces):
    """Which of `mesh`'s faces numbered in `faces` (a range) lie open to the room, nothing pressed
    against them within a centimetre and a half: the room's faces the lantern's light reaches however
    it bounces there (a table's legs in its shadow, a rail under a window's sill), which the rough bake
    may read as dark where they are thin (see night_lit)."""
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bm.normal_update()
    bm.faces.ensure_lookup_table()
    bvh = BVHTree.FromBMesh(bm)
    out = np.zeros(len(bm.faces), dtype=bool)
    for i in faces:
        f = bm.faces[i]
        if f.calc_area() < 1e-8:
            continue
        c = f.calc_center_median()
        out[i] = bvh.ray_cast(c + f.normal * 0.002, f.normal, 0.015)[0] is None
    bm.free()
    return out


def night_decals(mesh):
    """Which of `mesh`'s faces are painted on others (a rug's pattern, a cupboard's wavy line, a floor's
    seams): runs of faces joined at their corners, each lying flat within NIGHT_DECAL in front of a
    face of the house that looks the same way. A box lying on a floor is no decal, though its top
    lies just over the floor: its sides lie over nothing. Decals take the light of the face under them
    (see decal_layout), where texels of their own, a thin line's or a small dot's, would miss them."""
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bm.normal_update()
    bm.faces.ensure_lookup_table()
    bvh = BVHTree.FromBMesh(bm)
    over = np.zeros(len(bm.faces), dtype=bool)
    for f in bm.faces:
        hit = bvh.ray_cast(f.calc_center_median() - f.normal * 1e-4, -f.normal, NIGHT_DECAL)
        over[f.index] = hit[0] is not None and hit[2] != f.index and bm.faces[hit[2]].normal.dot(f.normal) > 0.95
    decal = np.zeros(len(bm.faces), dtype=bool)
    done = set()
    for seed in bm.faces:
        if seed.index in done:
            continue
        run, todo = [], [seed]
        done.add(seed.index)
        while todo:
            face = todo.pop()
            run.append(face.index)
            for vert in face.verts:
                for near in vert.link_faces:
                    if near.index not in done:
                        done.add(near.index)
                        todo.append(near)
        if over[run].all():
            decal[run] = True
    bm.free()
    return decal


def decal_layout(mesh, decal):
    """Points the corners of `mesh`'s decal faces (see night_decals) in its UV map `night` at the light
    of what they are painted on: straight back through each onto the house's other faces, or the
    nearest point of them where a decal runs over an edge."""
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bm.normal_update()
    uv = bm.loops.layers.uv["night"]
    corners, tris = [], []
    for face in bm.faces:
        if not decal[face.index]:
            loops = list(face.loops)
            for i in range(1, len(loops) - 1):
                corners.append((loops[0], loops[i], loops[i + 1]))
                tris.append((loops[0].vert.index, loops[i].vert.index, loops[i + 1].vert.index))
    bvh = BVHTree.FromPolygons([v.co.copy() for v in bm.verts], tris)
    for face in bm.faces:
        if not decal[face.index]:
            continue
        for loop in face.loops:
            at = loop.vert.co
            hit = bvh.ray_cast(at - face.normal * 1e-4, -face.normal, 0.05)
            if hit[0] is None:
                hit = bvh.find_nearest(at)
            if hit[0] is None:
                continue
            a, b, c = corners[hit[2]]
            w = geometry.barycentric_transform(hit[0], a.vert.co, b.vert.co, c.vert.co, a[uv].uv.to_3d(),
                                               b[uv].uv.to_3d(), c[uv].uv.to_3d())
            loop[uv].uv = (w.x, w.y)
    bm.to_mesh(mesh)
    bm.free()


def bake_night(name, targets, lamp, openings, dark=NIGHT_DARK, rooms=()):
    """The room's lantern's light on the house, baked with Cycles: lit by the lantern alone, the
    sky and every other prop left out, its light falling on the walls, the floor and the furniture,
    shadowed under the bed and the table, coming back off the wood into the corners and out through
    the windows and the doorway onto the porch. Each of `targets` (the body and the room) gets a UV
    map `night` into one shared map, saved to <id>_night.webp with each texel's light as the square
    root of its share of `scale` (the light at the brightest texels, less a few hottest ones),
    so the darks keep their steps. A first, rough bake of every face finds those the light reaches,
    and those and every face that sees the lantern (see night_seen) are laid out in the map, so its
    texels go to the light, not to the outside's shingles, which point at its one black corner (a face
    lit under `dark` of the brightest is left black; and every face of the targets numbered in `rooms`
    that lies open, see night_open, however the rough bake read it). What
    is painted on other faces (see night_decals) has no texels of its own: it waits out of the light,
    behind what it is painted on, while the light is baked, then takes that face's light. Returns what
    the game needs to read it, and the house's `openings` with where the light passes through each
    (see opening_masks)."""
    scene = bpy.context.scene
    view_layer = bpy.context.view_layer
    hidden = {o: o.hide_render for o in scene.objects}
    for o in scene.objects:
        o.hide_render = o not in targets
    corners = [lamp.matrix_world @ Vector(c) for c in lamp.bound_box]
    light_data = bpy.data.lights.new(f"{name}_night_light", type="POINT")
    light_data.energy = LANTERN_POWER
    light_data.shadow_soft_size = LANTERN_RADIUS
    light = bpy.data.objects.new(f"{name}_night_light", light_data)
    light.location = sum(corners, Vector()) / len(corners)
    scene.collection.objects.link(light)
    # A black sky: a new world's sky is a dim grey, which would light the house's whole outside.
    world = scene.world
    scene.world = bpy.data.worlds.new(f"{name}_night_sky")
    scene.world.color = (0.0, 0.0, 0.0)
    if scene.world.node_tree:
        for node in scene.world.node_tree.nodes:
            if node.type == "BACKGROUND":
                node.inputs["Strength"].default_value = 0.0

    # The parts' UVs are laid out together in one map: as one mesh of them all, in order (in the
    # background Blender edits only one object at a time), then handed back to each part.
    bm = bmesh.new()
    for o in targets:
        bm.from_mesh(o.data)
    joined = bpy.data.meshes.new(f"{name}_night_uv")
    bm.to_mesh(joined)
    bm.free()
    joined.uv_layers.new(name="night")
    unwrap = bpy.data.objects.new(f"{name}_night_uv", joined)
    # Out of the bakes: lying on the house, it would shadow it all.
    unwrap.hide_render = True
    scene.collection.objects.link(unwrap)
    for o in targets:
        o.data.uv_layers.active = o.data.uv_layers.new(name="night")

    def hand_out():
        uvs = np.empty(len(joined.loops) * 2, dtype=np.float32)
        joined.uv_layers["night"].data.foreach_get("uv", uvs)
        start = 0
        for o in targets:
            n = len(o.data.loops)
            o.data.uv_layers["night"].data.foreach_set("uv", uvs[start * 2:(start + n) * 2])
            start += n

    # The wood's own colours, for the light coming back off it, and the map to bake into.
    image = bpy.data.images.new(f"{name}_night", NIGHT_SIZE, NIGHT_SIZE, alpha=False, float_buffer=True)
    material = bpy.data.materials.new(f"{name}_night")
    material.use_nodes = True
    nodes, links = material.node_tree.nodes, material.node_tree.links
    bsdf = next(n for n in nodes if n.type == "BSDF_PRINCIPLED")
    colour = nodes.new("ShaderNodeAttribute")
    colour.attribute_name = "Col"
    links.new(colour.outputs["Color"], bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = 1.0
    if "Specular IOR Level" in bsdf.inputs:
        bsdf.inputs["Specular IOR Level"].default_value = 0.0
    target = nodes.new("ShaderNodeTexImage")
    target.image = image
    nodes.active = target
    for o in targets:
        o.data.materials.clear()
        o.data.materials.append(material)

    engine = scene.render.engine
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"

    def bake(samples):
        scene.cycles.samples = samples
        for o in view_layer.objects:
            o.select_set(o in targets)
        view_layer.objects.active = targets[0]
        with bpy.context.temp_override(active_object=targets[0], object=targets[0], selected_objects=targets,
                                       selected_editable_objects=targets):
            bpy.ops.object.bake(type="DIFFUSE", pass_filter={"DIRECT", "INDIRECT"}, margin=NIGHT_GAP // 2,
                                use_clear=True)
        px = np.empty(NIGHT_SIZE * NIGHT_SIZE * 4, dtype=np.float32)
        image.pixels.foreach_get(px)
        return px.reshape(-1, 4)[:, :3].copy()

    faces = len(joined.polygons)
    decal = night_decals(joined)
    # Each decal's corners, moved back behind what it is painted on while the light is baked, so it
    # neither shadows that face nor takes texels of its own (the parts' vertices are the joined
    # mesh's, in order).
    away = np.zeros((len(joined.vertices), 3), dtype=np.float32)
    for poly in joined.polygons:
        if decal[poly.index]:
            away[list(poly.vertices)] = -np.array(poly.normal, dtype=np.float32) * NIGHT_HIDE

    def hide_decals(sign):
        start = 0
        for o in targets:
            n = len(o.data.vertices)
            co = np.empty(n * 3, dtype=np.float32)
            o.data.vertices.foreach_get("co", co)
            o.data.vertices.foreach_set("co", co + sign * away[start:start + n].ravel())
            o.data.update()
            start += n

    night_layout(unwrap, np.ones(faces, dtype=bool))
    hand_out()
    keep = night_lit(joined, bake(NIGHT_PROBE_SAMPLES).max(axis=1), dark) | night_seen(joined, light.location)
    start = 0
    for k, o in enumerate(targets):
        n = len(o.data.polygons)
        if k in rooms:
            keep |= night_open(joined, range(start, start + n))
        start += n
    keep &= ~decal
    night_layout(unwrap, keep)
    hand_out()
    hide_decals(1.0)
    rgb = bake(NIGHT_SAMPLES)
    hide_decals(-1.0)
    decal_layout(joined, decal)
    hand_out()
    scene.render.engine = engine
    corner = NIGHT_SIZE - NIGHT_CORNER
    rgb.reshape(NIGHT_SIZE, NIGHT_SIZE, 3)[corner:, corner:] = 0.0
    print(f"NIGHT {name}: {int(keep.sum())} of {faces} faces lit, {int(decal.sum())} painted on others")

    lit = rgb.max(axis=1)
    scale = float(np.percentile(lit[lit > 1e-6], 99.5)) if (lit > 1e-6).any() else 1.0
    encoded = np.sqrt(np.clip(rgb / scale, 0.0, 1.0))
    out = bpy.data.images.new(f"{name}_night_png", NIGHT_SIZE, NIGHT_SIZE, alpha=False)
    out.pixels.foreach_set(np.concatenate([encoded, np.ones((len(encoded), 1), np.float32)], axis=1).ravel())
    # Lossless WebP, each texel as baked, about a third smaller than PNG; the PNG it was before goes.
    path = os.path.join(P.OUT_MODELS, f"{name}_night.webp")
    os.makedirs(os.path.dirname(path), exist_ok=True)
    out.filepath_raw = path
    out.file_format = "WEBP"
    out.save(quality=100)  # 100: lossless
    if os.path.exists(path[:-5] + ".png"):
        os.remove(path[:-5] + ".png")
    print(f"NIGHT {name}: scale {scale:.5f} -> {path}")

    for o in targets:
        o.data.materials.clear()
    bpy.data.objects.remove(unwrap)
    bpy.data.meshes.remove(joined)
    bpy.data.materials.remove(material)
    bpy.data.images.remove(image)
    bpy.data.images.remove(out)
    bpy.data.objects.remove(light)
    bpy.data.lights.remove(light_data)
    bpy.data.worlds.remove(scene.world)
    scene.world = world
    for o, h in hidden.items():
        o.hide_render = h
    return {"night": {"map": f"{name}_night.webp", "scale": round(scale, 6), "power": LANTERN_POWER},
            "openings": opening_masks(openings, targets, sum(corners, Vector()) / len(corners))}


# ---------------------------------------------------------------------------- the stilt hut
# The roof of the film's villager's hut (reference image `villager hut exterior 1`), as (radius across
# the hut, height over the eaves) from the edge of its flat underside: round its thick rim, up its
# sides, which bulge a little and round over to a neck where the straw is tied (3.95 to 4.2 up), and
# over the knot of straw above the tie. As the film's, it stands about twice as high over the eaves as
# the walls are tall. Front to back it is HUT_ROOF_DEPTH as deep as it is wide, so it hangs out about
# as far over every wall.
HUT_ROOF = ((4.05, 0.03), (4.15, -0.08), (4.25, 0.0), (4.27, 0.3), (4.2, 0.9), (4.0, 1.5), (3.65, 2.1), (3.1, 2.65),
            (2.45, 3.1), (1.8, 3.45), (1.3, 3.7), (1.02, 3.86), (0.95, 3.95), (0.94, 4.08), (0.97, 4.2), (1.06, 4.32),
            (1.16, 4.55), (1.14, 4.8), (0.98, 4.98), (0.66, 5.1), (0.3, 5.16), (0.0, 5.18))
HUT_ROOF_DEPTH = 0.88
HUT_TIES = (3.99, 4.08, 4.17)   # the rope's turns round the neck, over the eaves
HUT_SCALES = ("hutScale1", "hutScale2", "hutScale3", "hutScale4")


def curve_points(ctrl, step):
    """Points on a smooth curve through the (radius, height) points `ctrl` (Catmull-Rom, as charlib's
    Profile draws one), through each of them and about `step` apart between them, so a sharp rim or a
    tie keeps its shape on a long outline."""
    ext = [ctrl[0]] + list(ctrl) + [ctrl[-1]]
    out = []
    for i in range(1, len(ext) - 2):
        n = max(1, math.ceil(math.dist(ext[i], ext[i + 1]) / step))
        out += [L._catmull_rom(ext[i - 1], ext[i], ext[i + 1], ext[i + 2], s / n) for s in range(n)]
    return [(max(0.0, r), z) for r, z in out + [tuple(ctrl[-1])]]


def radius_at(points, z):
    """How far out a turned outline (points from curve_points) is at height z, on its way up."""
    for (r0, z0), (r1, z1) in zip(points, points[1:]):
        if z0 <= z <= z1 and z1 > z0:
            return r0 + (r1 - r0) * (z - z0) / (z1 - z0)
    return 0.0


def hashed(*keys):
    """A fixed hash of `keys`, 0 to 1: the same straw lies the same way every build."""
    k = math.sin(sum(key * f for key, f in zip(keys, (12.9898, 78.233, 37.719, 4.581)))) * 43758.5453
    return k - math.floor(k)


def straw_bump(a, h):
    """How far a hut roof's straw stands out of its turned shape at angle a (round its axis) and h (over
    its eaves), as a share of its radius: broad soft lumps, as straw laid by hand lies, gentle (the user
    found stronger ones too irregular), none at its rim or its neck, so the underside and the tie still
    meet it."""
    weight = L.smoothstep(0.2, 0.6, h) * (1.0 - L.smoothstep(3.45, 3.85, h))
    return weight * (0.026 * math.sin(3.0 * a + 1.1 + 0.9 * h) + 0.018 * math.sin(5.0 * a - 0.7 * h + 2.3)
                     + 0.012 * math.sin(8.0 * a + 1.9 * h + 0.4))


def squash(bm, centre, depth):
    """`bm` squashed front to back about `centre` to `depth` of its depth: a hut roof's oval."""
    return L.transformed(bm, Matrix.Translation(centre) @ L.scale4(1.0, depth, 1.0) @ Matrix.Translation(-centre))


def bell_roof(ctrl, centre, eave, hole, depth, knot, step=0.35, segments=36):
    """A thatched roof as the film's villager's hut has (see HUT_ROOF), turned round `centre` from
    (radius, height over `eave`) points and squashed front to back to `depth`, coloured as lathe_roof
    colours its roofs in the film's paler straw, dark underneath. It is straw, not turned wood: its
    sides lumpy (see straw_bump), its hem hanging uneven, and over the height `knot` (the knot above
    the tie) its straw gathered into bunches and its top ragged. Its underside is flat, from its first
    point's ring in to `hole` ((x0, x1), (y0, y1)), the rectangle over the walls' middles, and open
    over the room, which has its own ceiling. Returns the roof and its colours, and its outline's
    points (as turned, before its straw's roughness and its squashing)."""
    points = curve_points([(r, eave + h) for r, h in ctrl], step)
    bm = L.transformed(L.lathe_bm(points, segments=segments), Matrix.Translation(centre))
    bm.normal_update()
    if max(bm.faces, key=lambda f: f.calc_center_median().z).normal.z < 0:
        bmesh.ops.reverse_faces(bm, faces=bm.faces[:])
    bm.verts.ensure_lookup_table()
    rim = [bm.verts[j] for j in range(segments)]
    z = rim[0].co.z
    for v in bm.verts:
        dx, dy = v.co.x - centre.x, v.co.y - centre.y
        if math.hypot(dx, dy) < 1e-6:
            continue
        a = math.atan2(dx, -dy)
        k = hashed(a, v.co.z)
        if v.co.z < z - 0.05:
            v.co.z -= 0.1 * k                   # the hem's straw ends hanging unevenly
            continue
        if v.co.z > knot:
            # The knot: straw gathered into bunches round it, its ends ragged at the top.
            bunch = L.smoothstep(knot, knot + 0.2, v.co.z)
            grow = 1.0 + bunch * (0.08 * math.sin(11.0 * a + 0.5) + 0.05 * (2.0 * k - 1.0))
            v.co.z += 0.07 * (2.0 * k - 1.0) * L.smoothstep(knot + 0.4, knot + 0.8, v.co.z)
        else:
            grow = 1.0 + straw_bump(a, v.co.z - eave)
        v.co.x, v.co.y = centre.x + dx * grow, centre.y + dy * grow
    squash(bm, centre, depth)
    bm.normal_update()
    (x0, x1), (y0, y1) = hole

    def to_hole(dx, dy):
        ts = [(x1 - centre.x) / dx if dx > 1e-9 else None, (x0 - centre.x) / dx if dx < -1e-9 else None,
              (y1 - centre.y) / dy if dy > 1e-9 else None, (y0 - centre.y) / dy if dy < -1e-9 else None]
        t = min(t for t in ts if t is not None)
        return bm.verts.new((centre.x + dx * t, centre.y + dy * t, z))

    def angle(x, y):
        return math.atan2(x - centre.x, centre.y - y) % (2 * math.pi)

    # The underside: from the rim's ring in to the rectangle, along the rim's own spokes, the
    # rectangle's corners where they fall between two spokes.
    spokes = [angle(v.co.x, v.co.y) for v in rim]
    inner = [to_hole(math.sin(a), -math.cos(a)) for a in spokes]
    corners = [(angle(x, y), bm.verts.new((x, y, z))) for x in (x0, x1) for y in (y0, y1)]
    for j in range(segments):
        k = (j + 1) % segments
        a0, a1 = spokes[j], spokes[k] if k else 2 * math.pi
        corner = next((v for a, v in corners if a0 < a < a1), None)
        if corner is None:
            faces = [(rim[j], rim[k], inner[k], inner[j])]
        else:
            faces = [(rim[j], rim[k], corner), (rim[k], inner[k], corner), (rim[j], corner, inner[j])]
        for verts in faces:
            face = bm.faces.new(verts)
            face.normal_update()
            if face.normal.z > 0:
                face.normal_flip()
    bm.normal_update()
    top = max(h for _, h in ctrl) + eave
    cols = []
    for v in bm.verts:
        if (v.normal.z < -0.3 and v.co.z < z + 1.0) or v.co.z < z + 1e-4:
            cols.append(C["thatchUnder"])
            continue
        a = math.atan2(v.co.x - centre.x, v.co.y - centre.y)
        streak = 0.5 + 0.5 * math.sin(a * 14.0) * math.sin(a * 5.0 + 1.3)
        c = C["hutThatch"] if streak < 0.62 else C["hutThatchDark"]
        cols.append(C["hutThatchLight"] if v.co.z > top - 0.6 and streak < 0.45 else c)
    return (bm, cols), points


def straw_strokes(points, centre, eave, depth, pieces, count, low, high, length, width, seed=0.0):
    """Short dark strokes of straw scattered over a hut roof (see bell_roof; `points` its outline) from
    `low` to `high` over its eaves, as the film draws its thatch: each a sliver lying just off the
    straw down its slope, a little askew, broad at its foot and pointed at its tip, `length` and
    `width` (each a range) long and wide, more of them where the roof is wider."""
    widest = max(r for r, _ in points)
    made = 0
    for i in range(count * 6):
        if made >= count:
            break
        a = 2 * math.pi * hashed(i, seed, 1.0)
        h = low + (high - low) * hashed(i, seed, 2.0)
        r = radius_at(points, eave + h)
        if r <= 0.0 or hashed(i, seed, 3.0) > r / widest:
            continue
        made += 1
        slope = (radius_at(points, eave + h + 0.05) - radius_at(points, eave + h - 0.05)) / 0.1
        out = V(math.sin(a), -math.cos(a), 0.0)
        up = (out * slope + UP).normalized()          # up the slope, in the plane through the axis
        normal = (out - UP * slope).normalized()
        side = normal.cross(up)
        turn = 0.35 * (2.0 * hashed(i, seed, 4.0) - 1.0)
        along, across = up * math.cos(turn) + side * math.sin(turn), side * math.cos(turn) - up * math.sin(turn)
        at = centre + out * (r * (1.0 + straw_bump(a, h))) + UP * (eave + h) + normal * 0.02
        size = length[0] + (length[1] - length[0]) * hashed(i, seed, 5.0)
        wide = width[0] + (width[1] - width[0]) * hashed(i, seed, 6.0)
        bm = bmesh.new()
        corners = [at - along * (size / 2) - across * (wide / 2), at - along * (size / 2) + across * (wide / 2),
                   at + along * (size / 2) + across * (wide * 0.12)]
        f = bm.faces.new([bm.verts.new(p) for p in corners])
        f.normal_update()
        if f.normal.dot(normal) < 0:
            f.normal_flip()
        pieces.append((squash(bm, centre, depth), C["hutStraw"]))


def straw_fringe(points, centre, eave, depth, pieces, teeth=64, seed=0.0):
    """The straw's ends hanging ragged below a hut roof's rim (see bell_roof; `points` its outline), as
    the film draws its eaves: a ring of thin pointed bunches round its outer face, each its own
    length."""
    r_top = max(r for r, z in points if z < eave + 0.35)
    for k in range(teeth):
        a0, a1 = 2 * math.pi * k / teeth, 2 * math.pi * (k + 1.15) / teeth
        am = (a0 + a1) / 2 + 0.3 * (hashed(k, seed, 7.0) - 0.5) * (a1 - a0)
        drop = 0.1 + 0.14 * hashed(k, seed, 8.0)
        hang = eave + 0.05 + 0.006 * (k % 2)  # by turns a little higher, so no two tops lie in one plane
        bm = bmesh.new()
        layers = []
        for inset in (0.0, 0.014):
            r = r_top - 0.02 - inset - 0.004 * (k % 2)
            layers.append([bm.verts.new(centre + V(math.sin(a) * rr, -math.cos(a) * rr, zz))
                           for a, rr, zz in ((a0, r, hang), (a1, r, hang), (am, r + 0.03, hang - drop))])
        front, back = layers
        bm.faces.new(front)
        bm.faces.new(list(reversed(back)))
        for i in range(3):
            j = (i + 1) % 3
            bm.faces.new((front[i], back[i], back[j], front[j]))
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
        pieces.append((squash(bm, centre, depth), tone(C["hutThatch"], k * 3.7 + seed, 0.1)))


def rope_ring(centre, radius, thick, colour, pieces, segments=24, sides=6):
    """A turn of rope `thick` thick round a roof's neck, `radius` out from `centre`."""
    ring = [(radius + thick * math.cos(2 * math.pi * k / sides), thick * math.sin(2 * math.pi * k / sides))
            for k in range(sides)]
    pieces.append((L.transformed(L.lathe_bm(ring, segments=segments, closed_loop=True), Matrix.Translation(centre)), colour))


def hull_bm(points):
    """The convex solid round `points`: a tapering board."""
    bm = bmesh.new()
    bmesh.ops.convex_hull(bm, input=[bm.verts.new(p) for p in points])
    loose = [v for v in bm.verts if not v.link_faces]
    if loose:
        bmesh.ops.delete(bm, geom=loose, context="VERTS")
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    return bm


def bent_log(points, r, colour, end_colour, pieces, normal=None, sides=8, ends=(False, False), grain=0.0):
    """A log bent along `points`, as a branch grows: a ring round each point square to the way the log
    runs there (`normal`, that of the plane it bends in, keeps the rings from twisting), its ends
    closed, pale where they are cut (`ends`); with `grain`, its wood painted with grain along it that
    strongly."""
    bm, cols, grains, rings = bmesh.new(), [], [], []
    for i, p in enumerate(points):
        d = (points[min(i + 1, len(points) - 1)] - points[max(i - 1, 0)]).normalized()
        side = (normal.cross(d) if normal is not None else d.orthogonal()).normalized()
        up = d.cross(side)
        rings.append([bm.verts.new(p + (side * math.cos(2 * math.pi * k / sides) + up * math.sin(2 * math.pi * k / sides)) * r)
                      for k in range(sides)])
        cols.extend([colour] * sides)
        grains.extend([d * grain] * sides)

    def face(verts, towards):
        f = bm.faces.new(verts)
        f.normal_update()
        if f.normal.dot(towards) < 0:
            f.normal_flip()

    for i in range(len(rings) - 1):
        lo, hi = rings[i], rings[i + 1]
        axis = (points[i] + points[i + 1]) / 2
        for k in range(sides):
            j = (k + 1) % sides
            face((lo[k], lo[j], hi[j], hi[k]), (lo[k].co + lo[j].co + hi[j].co + hi[k].co) / 4 - axis)
    # The ends' faces have vertices of their own, so their colours stop sharp at the rim.
    for ring, out, cut in ((rings[0], points[0] - points[1], ends[0]), (rings[-1], points[-1] - points[-2], ends[1])):
        face([bm.verts.new(v.co) for v in ring], out)
        cols.extend([end_colour if cut else colour] * sides)
        grains.extend([None] * sides)
    pieces.append((bm, cols, grains) if grain > 0.0 else (bm, cols))


def flat_poly(points, z, colour, pieces, centre=None):
    """A flat shape lying face up at height `z`, as a pattern woven into a rug: a fan round `centre`
    (the points' middle if none) out to `points` ((x, y), in turn round it)."""
    if centre is None:
        centre = (sum(x for x, _ in points) / len(points), sum(y for _, y in points) / len(points))
    bm = bmesh.new()
    hub = bm.verts.new((centre[0], centre[1], z))
    ring = [bm.verts.new((x, y, z)) for x, y in points]
    for i in range(len(ring)):
        f = bm.faces.new((hub, ring[i], ring[(i + 1) % len(ring)]))
        f.normal_update()
        if f.normal.z < 0:
            f.normal_flip()
    pieces.append((bm, colour))


def front_poly(points, y, colour, pieces, centre=None, closed=True):
    """A flat shape painted on a face looking toward -y at `y`, as on a cupboard's front: a fan round
    `centre` (the points' middle if none) out to `points` ((x, z), in turn round it); not `closed`, the
    fan stops at the last point (a half disc, its centre on its straight edge)."""
    if centre is None:
        centre = (sum(x for x, _ in points) / len(points), sum(z for _, z in points) / len(points))
    bm = bmesh.new()
    hub = bm.verts.new((centre[0], y, centre[1]))
    ring = [bm.verts.new((x, y, z)) for x, z in points]
    for i in range(len(ring) if closed else len(ring) - 1):
        f = bm.faces.new((hub, ring[i], ring[(i + 1) % len(ring)]))
        f.normal_update()
        if f.normal.y > 0:
            f.normal_flip()
    pieces.append((bm, colour))


def front_wave(x0, x1, z, amp, wave, width, y, colour, pieces):
    """A wavy line painted on a face looking toward -y at `y`, from x0 to x1 about the height z: rising
    `amp` above it and falling as far below, each wave `wave` long, the line `width` thick."""
    n = max(8, round((x1 - x0) / wave * 10))
    line = [(x0 + (x1 - x0) * k / n, z + amp * math.sin(2 * math.pi * (x1 - x0) * k / n / wave)) for k in range(n + 1)]
    bm = bmesh.new()
    edges = []
    for k, (x, zz) in enumerate(line):
        (xa, za), (xb, zb) = line[max(k - 1, 0)], line[min(k + 1, n)]
        run = math.hypot(xb - xa, zb - za)
        nx, nz = -(zb - za) / run * width / 2, (xb - xa) / run * width / 2
        edges.append((bm.verts.new((x + nx, y, zz + nz)), bm.verts.new((x - nx, y, zz - nz))))
    for (a, b), (c, d) in zip(edges, edges[1:]):
        f = bm.faces.new((a, b, d, c))
        f.normal_update()
        if f.normal.y > 0:
            f.normal_flip()
    pieces.append((bm, colour))


def woven(ctrl, at, pieces, inner, top, segments=14, samples=16, band=0.055,
          colours=("basket", "basketLine", "basketIn")):
    """A woven basket or vase turned from (radius, height) points, bottom to top, standing at `at`: its
    weave in bands round it, light and dark by turns, and dark inside its mouth (its top within `inner`
    of its middle, `top` its height there); `colours` names the weave's two and the inside's."""
    bm = L.transformed(L.lathe_bm(L.Profile(ctrl, samples=samples).samples, segments=segments), Matrix.Translation(at))
    cols = []
    for v in bm.verts:
        h = v.co.z - at.z
        if math.hypot(v.co.x - at.x, v.co.y - at.y) < inner and h > top - 0.06:
            cols.append(C[colours[2]])
        else:
            cols.append(C[colours[0]] if int(h / band) % 2 == 0 else C[colours[1]])
    pieces.append((bm, cols))


def lobed_leaf(base, direction, normal, length, width, pieces, thick=0.01):
    """A monstera's leaf from `base` out along `direction`, its face to `normal`, drooping toward its
    tip: an oval split into fingers by deep notches down both sides, heart-shaped at its stalk, a thin
    solid so the pen draws its edge."""
    d = direction.normalized()
    n = (normal - d * normal.dot(d)).normalized()
    s = n.cross(d)
    steps, notches = 22, {3, 6, 9, 13, 16, 19}
    rim = []
    for i in range(steps):
        a = 2 * math.pi * i / steps
        u = 0.1 if i == steps // 2 else 0.5 + 0.5 * math.cos(a)  # 1 at the tip, 0 at the stalk
        w = math.sin(a) * (0.45 if i in notches else 1.0)
        rim.append(base + d * (u * length) + s * (w * width / 2) - n * (0.35 * length * u * u))
    mid = base + d * (0.5 * length) - n * (0.35 * length * 0.25)
    bm = bmesh.new()
    top = [bm.verts.new(p + n * (thick / 2)) for p in rim]
    bottom = [bm.verts.new(p - n * (thick / 2)) for p in rim]
    hub_top, hub_bottom = bm.verts.new(mid + n * (thick / 2)), bm.verts.new(mid - n * (thick / 2))
    for i in range(steps):
        j = (i + 1) % steps
        for verts, towards in (((hub_top, top[i], top[j]), n), ((hub_bottom, bottom[j], bottom[i]), -n),
                               ((top[i], bottom[i], bottom[j], top[j]), (rim[i] + rim[j]) / 2 - mid)):
            f = bm.faces.new(verts)
            f.normal_update()
            if f.normal.dot(towards) < 0:
                f.normal_flip()
    pieces.append((bm, C["leaf"]))


def straw_cushion(at, r, h, pieces, segments=24):
    """A domed cushion of woven straw, as the film's, sitting at `at`: striped from its top down its
    sides."""
    ctrl = [(0.0, 0.0), (r * 0.92, 0.0), (r, h * 0.3), (r * 0.9, h * 0.65), (r * 0.55, h * 0.92), (0.0, h)]
    bm = L.transformed(L.lathe_bm(L.Profile(ctrl, samples=10).samples, segments=segments), Matrix.Translation(at))
    cols = []
    for v in bm.verts:
        k = round(math.atan2(v.co.y - at.y, v.co.x - at.x) / (2 * math.pi / segments))
        cols.append(C["strawStripe"] if k % 2 else C["strawCushion"])
    pieces.append((bm, cols))


def fruit(kind, at, pieces):
    """A piece of fruit sitting at `at`: an apple, a peach, a pear or an orange."""
    if kind == "pear":
        pieces.append((turned([(0.0, 0.0), (0.04, 0.005), (0.055, 0.04), (0.045, 0.08), (0.028, 0.115), (0.02, 0.14),
                               (0.0, 0.145)], at, segments=10), C["pear"]))
        pieces.append((log(at + V(0.0, 0.0, 0.14), at + V(0.012, 0.0, 0.175), 0.007, segments=4), C["logDark"]))
        return
    radii = {"apple": (0.058, 0.058, 0.052), "peach": (0.052, 0.052, 0.05), "orange": (0.05, 0.05, 0.046)}[kind]
    pieces.append((L.ellipsoid_bm(at + V(0.0, 0.0, radii[2] - 0.003), radii, u=10, v=6), C[kind]))
    if kind == "apple":
        pieces.append((log(at + V(0.0, 0.0, 0.095), at + V(0.01, 0.0, 0.125), 0.006, segments=4), C["logDark"]))


def inner_face(wall, keep_clear):
    """The wall as seen from its room, for patterning its inner face: the same wall turned about, so its
    inner face is outermost and the scales Wall.shingles hangs on an outer face hang there; clear of
    its openings and of `keep_clear` ((u0, u1, v0, v1) along the wall as it was)."""
    flip = [(wall.length - o[1], wall.length - o[0], o[2], o[3]) for o in list(wall.openings) + list(keep_clear)]
    return Wall((wall.b.x, wall.b.y), (wall.a.x, wall.a.y), wall.z0, wall.height, wall.t, flip)


def inner_rail(wall, v, r, reach, skip, pieces, seed=0.0):
    """A log along a wall's inner face at height v, standing clear of its scales: broken at the wall's
    doorways (it passes under its windows, their sill inside) and at `skip` (stretches along the wall
    where furniture or a door leaf stands against it), its cut ends pale; it runs from `reach`'s first
    to its second (u along the wall), into the posts in the corners."""
    around = [(a - r, b + r, c, d) for a, b, c, d in wall.openings] + [(a, b, -1.0, wall.height + 1.0) for a, b in skip]
    depth = wall.t + 0.025 + r
    for u0, u1 in solid_spans(wall.length, v, around):
        first, last = u0 < 1e-6, u1 > wall.length - 1e-6
        u0, u1 = max(u0, reach[0]), min(u1, reach[1])
        if u1 - u0 < 0.15:
            continue
        cut_log(wall.point(u0, v, depth), wall.point(u1, v, depth), r, tone(C["hutLog"], seed + v * 7.1 + u0, 0.06),
                C["hutLogEnd"], pieces, ends=(not first, not last), segments=10, grain=1.0)


def shutters(wall, opening, pieces):
    """A window's inside as the film's frames show one: a casing of boards round it, and its two plank
    shutters swung right back flat against the wall either side, battened across, so the window stays
    clear (and its light at night gets out). They lie where the wall's scales are kept clear (see
    shutter_clear)."""
    u0, u1, v0, v1 = opening
    w = u1 - u0
    face = wall.t + 0.015
    # The casing: the jambs up to just over the window's head, the head board across them a little
    # deeper and wider, so no two of their faces lie in one plane; the log under it is its sill.
    for u in (u0 - 0.045, u1 + 0.045):
        pieces.append((oriented_box(wall.point(u, (v0 + v1 + 0.01) / 2, face), wall.d, wall.inward,
                                    (0.08, 0.03, v1 - v0 + 0.01)), C["hutLog"], UP * 0.7))
    pieces.append((oriented_box(wall.point((u0 + u1) / 2, v1 + 0.045, face + 0.006), wall.d, wall.inward,
                                (w + 0.17, 0.036, 0.08)), C["hutLog"], wall.d * 0.7))
    leaf = w / 2 + 0.03
    low, high = v0 + 0.012, v1 + 0.05
    for a in (u0 - 0.09 - leaf, u1 + 0.09):
        uc, vc = a + leaf / 2, (low + high) / 2
        pieces.append((oriented_box(wall.point(uc, vc, wall.t + 0.025), wall.d, wall.inward, (leaf, 0.04, high - low)),
                       tone(C["shutter"], uc * 3.1, 0.05), UP * 0.7))
        for f in (1 / 3, 2 / 3):
            pieces.append((oriented_box(wall.point(a + leaf * f, vc, wall.t + 0.047), wall.d, wall.inward,
                                        (PEN, 0.006, high - low - 0.04)), C["shutterLine"]))
        for vb in (low + 0.16, high - 0.16):
            pieces.append((oriented_box(wall.point(uc, vb, wall.t + 0.055), wall.d, wall.inward, (leaf - 0.06, 0.03, 0.09)),
                           tone(C["shutter"], uc + vb, 0.08), wall.d * 0.7))


def shutter_clear(opening):
    """Where a window's casing and swung-back shutters lie on the wall's inner face (see shutters)."""
    u0, u1, v0, v1 = opening
    leaf = (u1 - u0) / 2 + 0.03
    return (u0 - 0.11 - leaf, u1 + 0.11 + leaf, v0 - 0.02, v1 + 0.1)


def hut_ceiling(xi, yi, eave, peak, inside):
    """The ceiling of a villager's hut, as the film's frames show one inside: the straw roof's
    dark underside rising from the walls' tops to a peak over the middle of the room, on rafters
    running up to it from the walls (four along its hips), two rings of battens across under the
    straw, and a hub where the rafters meet. Returns where its lantern hangs from."""
    corners = [V(-xi, -yi, eave), V(xi, -yi, eave), V(xi, yi, eave), V(-xi, yi, eave)]
    apex = V(0.0, 0.0, peak)
    # The straw underside: a thin closed shell over the room, so the pen works from inside it.
    bm = bmesh.new()
    under = [bm.verts.new(c) for c in corners]
    over = [bm.verts.new(c + V(math.copysign(0.04, c.x), math.copysign(0.04, c.y), 0.03)) for c in corners]
    tip, tip_over = bm.verts.new(apex), bm.verts.new(apex + V(0.0, 0.0, 0.05))
    for i in range(4):
        j = (i + 1) % 4
        bm.faces.new((under[i], under[j], tip))
        bm.faces.new((over[j], over[i], tip_over))
        bm.faces.new((under[j], under[i], over[i], over[j]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    inside.append((bm, C["hutCeiling"]))
    # Each slope's way down into the room.
    normals = []
    for i in range(4):
        n = (corners[(i + 1) % 4] - corners[i]).cross(apex - corners[i]).normalized()
        normals.append(-n if n.z > 0 else n)
    # The battens, just under the straw, each slope's own, meeting at the hips.
    for s in (0.42, 0.74):
        ring = [apex + (c - apex) * s for c in corners]
        for i in range(4):
            a, b = ring[i], ring[(i + 1) % 4]
            d = (b - a).normalized()
            cut_log(a + d * 0.02 + normals[i] * 0.03, b - d * 0.02 + normals[i] * 0.03, 0.025, C["hutRafter"],
                    C["hutLogEnd"], inside, ends=(False, False), segments=6, grain=0.6)
    # The rafters under the battens, from the hub down to the wall plates (the logs along the walls'
    # tops), their lower ends cut.
    rafters = []
    for i in range(4):
        rafters.append((corners[i], (normals[i - 1] + normals[i]).normalized()))
        rafters += [(corners[i].lerp(corners[(i + 1) % 4], f), normals[i]) for f in (0.25, 0.5, 0.75)]
    for k, (end, n) in enumerate(rafters):
        cut_log(apex + (end - apex) * 0.06 + n * 0.1, apex + (end - apex) * 0.975 + n * 0.1, 0.045,
                tone(C["hutRafter"], k * 1.7, 0.08), C["hutLogEnd"], inside, ends=(False, True), segments=8, grain=0.8)
    cut_log(apex - V(0.0, 0.0, 0.32), apex - V(0.0, 0.0, 0.12), 0.14, C["hutRafter"], C["hutLogEnd"], inside,
            ends=(True, False), segments=12, grain=0.6)
    return apex - V(0.0, 0.0, 0.32)


def hut_rug(yi):
    """Where a villager's room's round rug lies, its middle (x, y) and its radius: before the door, as
    in the film's top view, its front edge a hand's breadth inside the front wall (`yi` from the room's
    middle to its back and front walls)."""
    return -0.1, -yi + 1.28, 1.12


# The villagers' furniture, this much smaller than first drawn: to their size (about a metre tall,
# their eyes 0.6 m up), a counter's top about half as high as they are, as the film's (reference images
# `villager hut interior 2` and `4`), a stool, a bed, shelves and tables with it. It had been drawn to a
# person's: the counter 0.72 m, over the eyes of a villager seeing out of their own. Each piece is made
# smaller about where it stands against its wall or in its corner; the rooms, the rug and its cushions,
# the doors and the windows keep their size.
FURNITURE = 0.68
# How high a villager's windows' sills stand over their floor: at about their eyes (0.6 m up), as the
# film's (reference image `villager hut exterior 2`, where the scales under a window reach the cast's
# eyes), so a villager sees out of them. They had stood at 0.92 m (the stilt huts) and 0.85 m (the plank
# huts), over a villager's head.
WINDOW_SILL = 0.6


def furnish_hut(floor, xi, yi, wall_h, window):
    """A villager's room furnished as the film's villager's hut (reference images `villager hut
    interior 1` to `10`), laid out as its top view (`6`) has it, the door at the front of a room `xi`
    and `yi` across from its middle, `wall_h` high, its left wall's window's middle `window` (y): along
    the back wall from the left a cream kitchen counter, two drawers at its end and a pair of doors
    painted with a white wavy line and dots and white clouds, a round iron stove on it at its left end
    and a grey sink with a curved tap beside it, a cutting board standing behind the fruit, and a rail
    of black pans, a cloth and wooden spoons over it; then a tree-stump stool, then the head of the
    bed. The bed, for one, runs from the back wall along the right wall to the room's middle: dark
    wood on short legs under a thick pale blue mattress and a long white pillow, no quilt. In the
    front right corner a small table set askew with fruit on it. On the left wall, before its window,
    a tall orange bookshelf tapering as it rises, white pegs down its sides, on round feet and full of
    books; toward the door a potted monstera on a little table, and two brown woven vases in the front
    left corner. In the room's front half, before the door, a round cream rug patterned in blue round
    a white flower, two domed straw cushions on it. Returns its pieces, the blocks that keep walkers
    out of it (not the camera, which may look over it), and where it stands against each wall (x or y
    from, to, and whether it reaches the window sill's height), for the logs along the walls' feet
    (see inner_rail)."""
    f = floor
    out, blocks = [], []
    against = {"front": [], "back": [], "left": [], "right": []}

    def box(c, size, colour, bevel=0.0, grain=None):
        bm = P.box_bm(c, size, bevel=bevel)
        out.append((bm, colour) if grain is None else (bm, colour, grain))

    def keep_out(x0, x1, y0, y1, high):
        blocks.append(block_box(x0, x1, y0, y1, f - 0.1, f + high, camera=False))

    def keep_out_round(x, y, r, high):
        blocks.append({"circle": [*g(x, y), r], "y": [f - 0.1, f + high], "walk": True, "camera": False})

    def shrink(start, kept, anchor, to=None):
        """What has been made since `start` (of the pieces) and `kept` (of the blocks) made FURNITURE the
        size about `anchor`, moved to stand at `to` (where it stands, if that is left out)."""
        m = Matrix.Translation(anchor if to is None else to) @ Matrix.Scale(FURNITURE, 4) @ Matrix.Translation(-anchor)
        for item in out[start:]:
            bmesh.ops.transform(item[0], matrix=m, verts=item[0].verts[:])
        for block in blocks[kept:]:
            if "box" in block:
                cx, cz, hx, hz = block["box"]
                c = m @ V(cx, -cz, 0.0)
                block["box"] = [*g(c.x, c.y), round(hx * FURNITURE, 3), round(hz * FURNITURE, 3)]
            else:
                cx, cz, r = block["circle"]
                c = m @ V(cx, -cz, 0.0)
                block["circle"] = [*g(c.x, c.y), round(r * FURNITURE, 3)]
            block["y"] = [round((m @ V(0.0, 0.0, z)).z, 3) for z in block["y"]]

    def along(v, a):
        """Where `v` comes to, along a wall, once what stands there is made smaller about `a`."""
        return a + FURNITURE * (v - a)

    # The bed, for one: dark wood on short legs, a thick puffy mattress, pale blue as the film's, and a
    # long pillow across its head. It stands clear of the corner post, smaller toward it.
    bx1, by1 = xi - 0.18, yi - 0.04
    bx0, by0 = bx1 - 1.1, by1 - 2.16
    bx, by = (bx0 + bx1) / 2, (by0 + by1) / 2
    start, kept = len(out), len(blocks)
    for lx in (bx0 + 0.09, bx1 - 0.09):
        for ly in (by0 + 0.09, by1 - 0.09):
            box(V(lx, ly, f + 0.045), (0.11, 0.11, 0.09), C["bedFrame"])
    box(V(bx, by, f + 0.185), (bx1 - bx0, by1 - by0, 0.2), C["bedFrame"], bevel=0.015, grain=V(0.0, 0.7, 0.0))
    box(V(bx, by, f + 0.4), (bx1 - bx0 + 0.03, by1 - by0 - 0.01, 0.26), C["mattress"], bevel=0.11)
    box(V(bx, by1 - 0.3, f + 0.56), (bx1 - bx0 - 0.24, 0.4, 0.13), C["pillow"], bevel=0.06)
    keep_out(bx0, bx1, by0, by1, 0.6)
    shrink(start, kept, V(bx1, by1, f))
    drawn = bx0
    bx0 = along(bx0, bx1)
    against["back"].append((bx0 - 0.02, bx1 + 0.02, False))
    # A stool by the bed's head, between it and the counter: a stump, its top cut to show its rings, on
    # three stubby legs.
    sx, sy = drawn - 0.32, yi - 0.35
    start, kept = len(out), len(blocks)
    cut_log(V(sx, sy, f + 0.14), V(sx, sy, f + 0.42), 0.18, C["stump"], C["stumpEnd"], out, ends=(False, True),
            segments=12, ring=C["stumpRing"], rings=(False, True), grain=1.0)
    for k in range(3):
        a = 2 * math.pi * k / 3 + 0.5
        out.append((log(V(sx + math.cos(a) * 0.08, sy + math.sin(a) * 0.08, f + 0.17),
                        V(sx + math.cos(a) * 0.13, sy + math.sin(a) * 0.13, f + 0.005), 0.05, segments=7), C["stump"]))
    keep_out_round(sx, sy, 0.22, 0.42)
    shrink(start, kept, V(sx, sy, f), V(bx0 - 0.32 * FURNITURE, yi - 0.35 * FURNITURE, f))

    # The kitchen counter, from the corner post along the back wall to short of its window: a cream
    # cabinet, its front as the film's (reference images `villager hut interior 2` and `4`): at its left
    # end two drawers one over the other beside a pale post, then a pair of wide doors, each panel
    # standing a little proud, dark knobs where the doors meet, a white wavy line across each door near
    # its top with white dots in its dips, and white clouds along its foot; a wooden top round a grey
    # sink, a round iron stove at its left end.
    kx0, kx1, ky0, ky1 = -xi + 0.18, -0.47, yi - 0.6, yi - 0.03
    kx, ky, span = (kx0 + kx1) / 2, (ky0 + ky1) / 2, kx1 - kx0
    start, kept = len(out), len(blocks)
    top = f + 0.72
    # (its back a little short of the top's, so no two of their faces lie in one plane)
    box(V(kx, ky - 0.003, f + 0.34), (span, ky1 - ky0 - 0.006, 0.68), C["cabinet"])
    lift = 0.006                                    # how far the panels stand out of the cabinet's face
    paint = ky0 - lift - 0.004                      # where their white patterns lie, just off them
    low, high = f + 0.07, f + 0.64                  # the panels' foot and top
    xa, xb, xc, xd = kx0 + 0.02, kx0 + 0.44, kx0 + 0.5, kx1 - 0.02  # the drawers, the post, the doors
    mid = (xc + xd) / 2

    def panel(x0, x1, z0, z1):
        box(V((x0 + x1) / 2, ky0 - lift / 2 + 0.001, (z0 + z1) / 2), (x1 - x0, lift + 0.002, z1 - z0), C["cabinetPanel"])

    def clouds(x0, x1, count, base, r):
        """White clouds along a panel's foot, each three round lobes, the middle one `r` high."""
        for k in range(count):
            cx = x0 + (x1 - x0) * (k + 0.5) / count
            for dx, rr in ((-0.95 * r, 0.75 * r), (0.0, r), (0.95 * r, 0.75 * r)):
                arc = [(cx + dx + rr * math.cos(math.pi * i / 6), base + rr * math.sin(math.pi * i / 6)) for i in range(7)]
                front_poly(arc, paint, C["lace"], out, centre=(cx + dx, base), closed=False)

    # The drawers, a short wavy line on the upper, a little cloud on the lower, a knob on each; the
    # pale post beside them, up to the cabinet's top.
    panel(xa, xb, f + 0.365, high)
    panel(xa, xb, low, f + 0.355)
    for z in ((f + 0.365 + high) / 2, (low + f + 0.355) / 2):
        out.append((L.ellipsoid_bm(V((xa + xb) / 2, ky0 - lift - 0.01, z), (0.02, 0.014, 0.02), u=6, v=4), C["handle"]))
    front_wave(xa + 0.05, xb - 0.05, high - 0.055, 0.012, 0.106, 0.012, paint, C["lace"], out)
    clouds(xa + 0.03, xb - 0.03, 1, low + 0.02, 0.06)
    post_low, post_high = low - 0.02, f + 0.675
    box(V((xb + xc) / 2, ky0 - 0.005, (post_low + post_high) / 2), (xc - xb, 0.012, post_high - post_low),
        C["cabinetLight"])
    # The doors: the wavy line and its dots near the top, the clouds along the foot, the knobs where
    # they meet.
    for x0, x1, knob in ((xc, mid - 0.005, mid - 0.06), (mid + 0.005, xd, mid + 0.06)):
        panel(x0, x1, low, high)
        out.append((L.ellipsoid_bm(V(knob, ky0 - lift - 0.012, (low + high) / 2 - 0.03), (0.026, 0.018, 0.026), u=8, v=5),
                    C["handle"]))
        waves, zw, amp = 6, high - 0.12, 0.02
        wave = (x1 - x0 - 0.08) / waves
        front_wave(x0 + 0.04, x1 - 0.04, zw, amp, wave, 0.016, paint, C["lace"], out)
        for k in range(waves):
            dx, dz = x0 + 0.04 + wave * (k + 0.75), zw - amp + 0.04
            front_poly([(dx + 0.014 * math.cos(2 * math.pi * i / 8), dz + 0.014 * math.sin(2 * math.pi * i / 8))
                        for i in range(8)], paint, C["lace"], out)
        clouds(x0 + 0.05, x1 - 0.05, 2, low + 0.02, 0.07)
    s0, t0, t1 = kx0 + 0.82, yi - 0.48, yi - 0.2   # the sink's hole in the top
    s1 = s0 + 0.5
    for x0, x1, y0, y1 in ((kx0 - 0.03, s0, ky0 - 0.03, ky1), (s1, kx1 + 0.03, ky0 - 0.03, ky1), (s0, s1, ky0 - 0.03, t0),
                           (s0, s1, t1, ky1)):
        box(V((x0 + x1) / 2, (y0 + y1) / 2, top - 0.025), (x1 - x0, y1 - y0, 0.05), C["counterTop"], grain=V(0.7, 0.0, 0.0))
    # The sink: a shallow grey basin, its rim standing a little proud of the top, set a few millimetres
    # in from the hole's sides.
    e = 0.003
    for c, size in ((V(s0 + e + 0.0125, (t0 + t1) / 2, top - 0.013), (0.025, t1 - t0 - 2 * e, 0.05)),
                    (V(s1 - e - 0.0125, (t0 + t1) / 2, top - 0.013), (0.025, t1 - t0 - 2 * e, 0.05)),
                    (V((s0 + s1) / 2, t0 + e + 0.0125, top - 0.013), (s1 - s0 - 2 * e - 0.05, 0.025, 0.05)),
                    (V((s0 + s1) / 2, t1 - e - 0.0125, top - 0.013), (s1 - s0 - 2 * e - 0.05, 0.025, 0.05))):
        box(c, size, C["steel"])
    box(V((s0 + s1) / 2, (t0 + t1) / 2, top - 0.03), (s1 - s0 - 0.04, t1 - t0 - 0.04, 0.008), C["steelDark"])
    # The tap behind it, curving over it, clear of the sill's log on the wall.
    tx, stem, arc, bend = (s0 + s1) / 2, yi - 0.16, yi - 0.22, 0.06
    tap = [V(tx, stem, top - 0.005), V(tx, stem, top + 0.12), V(tx, stem, top + 0.24)]
    tap += [V(tx, arc + bend * math.cos(a), top + 0.24 + bend * math.sin(a)) for a in (math.pi * k / 6 for k in range(1, 7))]
    tap.append(V(tx, arc - bend, top + 0.19))
    bent_log(tap, 0.02, C["steel"], C["steelDark"], out, normal=V(1.0, 0.0, 0.0), ends=(False, True))
    out.append((P.segment_bm(V(tx, stem, top), V(tx, stem, top + 0.03), 0.034, 0.03, 10), C["steel"]))
    # The stove: a round iron plate standing on the top, a darker ring inside it, and a cross of bars
    # over it for a pot to stand on.
    ox, oy = kx0 + 0.37, (ky0 + ky1) / 2
    out.append((P.segment_bm(V(ox, oy, top - 0.005), V(ox, oy, top + 0.03), 0.17, 0.17, 16), C["iron"]))
    out.append((P.segment_bm(V(ox, oy, top + 0.02), V(ox, oy, top + 0.036), 0.12, 0.12, 16), C["pan"]))
    for k in range(4):
        a = math.pi / 4 + k * math.pi / 2
        d = V(math.cos(a), math.sin(a), 0.0)
        out.append((oriented_box(V(ox, oy, top + 0.046) + d * 0.095, d, UP.cross(d), (0.11, 0.026, 0.022)), C["iron"]))
    # A cutting board standing at the back beside the sink, an apple, a peach and a pear before it.
    box(V(s1 + 0.17, yi - 0.17, top + 0.215), (0.3, 0.028, 0.43), C["cuttingBoard"], bevel=0.012, grain=UP * 0.7)
    for kind, x, y in (("apple", kx1 - 0.51, yi - 0.38), ("peach", kx1 - 0.33, yi - 0.44), ("pear", kx1 - 0.39, yi - 0.27)):
        fruit(kind, V(x, y, top), out)
    # Over the counter, a rail on the wall, below the corner's brace: two black pans over the stove, a
    # cloth, a wooden spoon and a fork.
    rail_z = f + min(1.78, wall_h - 0.82)
    rail_y = yi - 0.06
    out.append((log(V(kx0 + 0.2, rail_y, rail_z), V(kx1 - 0.65, rail_y, rail_z), 0.022, segments=8), C["spoon"],
                V(0.6, 0.0, 0.0)))
    for x in (kx0 + 0.25, kx1 - 0.7):
        box(V(x, yi - 0.032, rail_z), (0.035, 0.045, 0.055), C["spoon"])
    for x, r, z in ((kx0 + 0.29, 0.125, rail_z - 0.34), (kx0 + 0.58, 0.105, rail_z - 0.31)):
        out.append((P.segment_bm(V(x, yi - 0.085, z), V(x, yi - 0.115, z), r, r - 0.012, 16), C["pan"]))
        out.append((log(V(x, yi - 0.095, z + r - 0.01), V(x, yi - 0.07, rail_z - 0.01), 0.016, segments=6), C["pan"]))
    cloth, spoon, fork = kx0 + 0.84, kx0 + 1.06, kx0 + 1.26
    box(V(cloth, yi - 0.07, rail_z - 0.17), (0.15, 0.022, 0.32), C["towel"], bevel=0.008)
    box(V(cloth, yi - 0.082, rail_z - 0.06), (0.152, 0.006, PEN), C["cabinetLine"])
    out.append((log(V(spoon, yi - 0.075, rail_z), V(spoon, yi - 0.085, rail_z - 0.35), 0.012, segments=6), C["spoon"],
                UP * 0.5))
    out.append((L.ellipsoid_bm(V(spoon, yi - 0.095, rail_z - 0.41), (0.048, 0.02, 0.065), u=8, v=5), C["spoon"]))
    out.append((log(V(fork, yi - 0.075, rail_z), V(fork, yi - 0.082, rail_z - 0.32), 0.011, segments=6), C["spoon"],
                UP * 0.5))
    box(V(fork, yi - 0.082, rail_z - 0.34), (0.075, 0.012, 0.05), C["spoon"])
    for dx in (-0.025, 0.0, 0.025):
        box(V(fork + dx, yi - 0.082, rail_z - 0.395), (0.014, 0.01, 0.065), C["spoon"])
    keep_out(kx0 - 0.03, kx1 + 0.03, ky0 - 0.03, yi, 0.75)
    # All of it, the rail of pans over it too, smaller toward the corner it starts from. Its tap and its
    # cutting board stand up past the windows' sill, so the logs along the wall at its height stop at it.
    shrink(start, kept, V(kx0, ky1, f))
    against["back"].append((-xi, along(kx1 + 0.03, kx0), True))

    # The bookshelf, on the left wall before its window: orange wood, its sides tapering from deep at
    # its foot to shallow at its top, white pegs down them, a dark back, on four round feet; three
    # shelves and its foot full of books. In a shallower room it is narrower, leaving the monstera's
    # table its room before it.
    mx, my = -xi + 0.4, -yi + 0.88                   # the monstera's table
    ex, ey1 = -xi + 0.03, window - 1.06              # the shelf's back, against the wall, and its far end
    ey0 = ey1 - min(0.9, ey1 - (my + 0.32))
    z0, z1 = f + 0.07, f + 1.78
    deep0, deep1 = 0.44, 0.22
    start, kept = len(out), len(blocks)

    def depth_at(z):
        return deep0 + (deep1 - deep0) * (z - z0) / (z1 - z0)

    for ya, yb in ((ey0, ey0 + 0.04), (ey1 - 0.04, ey1)):
        side = [(ex, z0), (ex + deep0, z0), (ex + deep1, z1), (ex, z1)]
        out.append((hull_bm([V(x, y, z) for y in (ya, yb) for x, z in side]), C["shelf"], UP * 0.7))
    box(V(ex + 0.016, (ey0 + ey1) / 2, (z0 + 0.05 + z1 - 0.005) / 2), (0.024, ey1 - ey0 - 0.07, z1 - z0 - 0.055),
        C["shelfDark"])
    box(V(ex + (deep0 - 0.01) / 2, (ey0 + ey1) / 2, z0 + 0.025), (deep0 - 0.01, ey1 - ey0 - 0.07, 0.05), C["shelf"],
        grain=V(0.0, 0.6, 0.0))
    shelves = [z0 + 0.43, z0 + 0.84, z0 + 1.25]
    for z in shelves:
        d = depth_at(z) - 0.015
        box(V(ex + d / 2, (ey0 + ey1) / 2, z), (d, ey1 - ey0 - 0.07, 0.035), C["shelf"], grain=V(0.0, 0.6, 0.0))
    box(V(ex + 0.005 + (deep1 + 0.03) / 2, (ey0 + ey1) / 2, z1 + 0.018), (deep1 + 0.03, ey1 - ey0 + 0.04, 0.036), C["shelf"],
        grain=V(0.0, 0.6, 0.0))
    for x in (ex + 0.06, ex + deep0 - 0.06):
        for y in (ey0 + 0.04, ey1 - 0.04):
            out.append((L.ellipsoid_bm(V(x, y, f + 0.042), (0.048, 0.048, 0.045), u=10, v=6), C["bedFrame"]))
    for y, way in ((ey0, -1.0), (ey1, 1.0)):
        for k in range(4):
            z = z0 + 0.2 + (z1 - z0 - 0.4) * k / 3
            for x in (ex + 0.05, ex + depth_at(z) - 0.05):
                out.append((P.segment_bm(V(x, y, z), V(x, y + way * 0.008, z), 0.022, 0.022, 8), C["lace"]))
    books = [C[f"hutBook{k}"] for k in range(1, 7)]
    k = 0
    for floor_z in [z0 + 0.05] + [z + 0.0175 for z in shelves]:
        y = ey0 + 0.06
        while y < ey1 - 0.095:
            w = 0.038 + 0.022 * ((k * 7) % 4) / 3
            h = 0.22 + 0.09 * ((k * 5) % 4) / 3
            d = min(0.2, depth_at(floor_z + h) - 0.05)
            box(V(ex + 0.032 + d / 2, y + w / 2, floor_z + 0.002 + h / 2), (d, w, h), books[(k * 5) % len(books)])
            y += w + (0.006 if k % 6 else 0.04)
            k += 1
    keep_out(-xi, ex + deep0 + 0.02, ey0 - 0.02, ey1 + 0.02, 1.8)
    # Smaller toward its end by the window, still a little taller than a villager.
    shrink(start, kept, V(ex, ey1, f))
    against["left"].append((along(ey0 - 0.02, ey1), along(ey1 + 0.02, ey1), True))

    # Toward the door, a potted monstera on a little table, its split leaves held out over the room,
    # clear of the bookshelf and the wall.
    start, kept = len(out), len(blocks)
    table = f + 0.45
    for x in (mx - 0.21, mx + 0.21):
        for y in (my - 0.21, my + 0.21):
            box(V(x, y, f + 0.215), (0.045, 0.045, 0.43), C["chest"], grain=UP * 0.6)
    box(V(mx, my, table - 0.02), (0.5, 0.5, 0.04), C["chestTop"], grain=V(0.0, 0.7, 0.0))
    out.append((turned([(0.0, 0.0), (0.1, 0.0), (0.125, 0.15), (0.135, 0.19), (0.115, 0.195), (0.0, 0.175)],
                       V(mx, my, table)), C["pot"]))
    out.append((P.segment_bm(V(mx, my, table + 0.18), V(mx, my, table + 0.189), 0.112, 0.112, 12), C["soil"]))
    for ang, reach, h, size, tilt in ((-0.9, 0.18, 0.5, 0.22, 0.5), (-0.3, 0.24, 0.62, 0.26, 0.45),
                                      (0.25, 0.26, 0.56, 0.25, 0.45), (0.85, 0.16, 0.66, 0.2, 0.4),
                                      (-1.6, 0.14, 0.44, 0.2, 0.55), (-2.3, 0.1, 0.58, 0.18, 0.5)):
        d = V(math.cos(ang), math.sin(ang), 0.0)
        tip = V(mx, my, table + h) + d * reach
        out.append((P.segment_bm(V(mx, my, table + 0.18), tip, 0.011, 0.008, 5), C["leafDark"]))
        lobed_leaf(tip, d + UP * 0.25, UP + d * tilt, size, size * 0.85, out)
    keep_out(mx - 0.27, mx + 0.27, my - 0.27, my + 0.27, 1.1)
    shrink(start, kept, V(mx, my, f))
    # Two brown woven vases in the front left corner, a big one and a small one.
    for (vx, vy), ctrl, inner, high in (((-xi + 0.38, -yi + 0.36), [(0.0, 0.0), (0.15, 0.0), (0.21, 0.12), (0.22, 0.3),
                                                                   (0.17, 0.48), (0.12, 0.6), (0.12, 0.66), (0.165, 0.75),
                                                                   (0.17, 0.77), (0.13, 0.765), (0.0, 0.71)], 0.135, 0.71),
                                        ((-xi + 0.83, -yi + 0.32), [(0.0, 0.0), (0.12, 0.0), (0.16, 0.09), (0.17, 0.22),
                                                                   (0.14, 0.34), (0.1, 0.4), (0.12, 0.45), (0.1, 0.45),
                                                                   (0.0, 0.41)], 0.09, 0.41)):
        start, kept = len(out), len(blocks)
        woven(ctrl, V(vx, vy, f), out, inner=inner, top=high, colours=("vase", "vaseLine", "vaseIn"))
        keep_out_round(vx, vy, max(r for r, _ in ctrl) + 0.02, high + 0.05)
        shrink(start, kept, V(vx, vy, f))

    # In the front right corner, a small table set askew, a melon and a peach on it.
    tx, ty, tt = xi - 0.52, -yi + 0.52, f + 0.5
    d = V(1.0, 1.0, 0.0).normalized()
    across = UP.cross(d)
    start, kept = len(out), len(blocks)
    for sa in (-1.0, 1.0):
        for sb in (-1.0, 1.0):
            box_at = V(tx, ty, f + 0.24) + d * (sa * 0.19) + across * (sb * 0.19)
            out.append((oriented_box(box_at, d, across, (0.045, 0.045, 0.48)), C["chest"], UP * 0.6))
    out.append((oriented_box(V(tx, ty, tt - 0.02), d, across, (0.5, 0.5, 0.04)), C["chestTop"], d * 0.7))
    out.append((L.ellipsoid_bm(V(tx - 0.06, ty + 0.05, tt + 0.085), (0.095, 0.095, 0.088), u=12, v=8), C["melon"]))
    fruit("peach", V(tx + 0.1, ty - 0.08, tt), out)
    keep_out_round(tx, ty, 0.36, 0.55)
    shrink(start, kept, V(tx, ty, f))

    # The rug, before the door: cream, ringed by a zigzag, a ring of diamonds and one of little
    # triangles, a circle, and in the middle a blue medallion with a white flower and a blue star at
    # its heart; each pattern a few millimetres over the one under it.
    rx, ry, rr = hut_rug(yi)
    out.append((P.segment_bm(V(rx, ry, f + 0.002), V(rx, ry, f + 0.016), rr, rr, 40), C["rugCream"]))
    z1, z2, z3 = f + 0.0195, f + 0.0225, f + 0.0255
    scale = rr / 1.15

    def at_r(r, a):
        return (rx + r * scale * math.cos(a), ry + r * scale * math.sin(a))

    def circle(r_out, r_in, z, colour, n=40):
        out.append((P.band_bm([V(*at_r(r_out, 2 * math.pi * k / n), z) for k in range(n)],
                              [V(*at_r(r_in, 2 * math.pi * k / n), z) for k in range(n)], UP), colour))

    teeth = 22
    zig = [V(*at_r(1.07 if k % 2 else 0.98, math.pi * k / teeth), z1) for k in range(2 * teeth + 1)]
    for p, q in zip(zig, zig[1:]):
        out.append((quad((p + q) / 2, q - p, UP, (q - p).length + 0.02, 0.026), C["rugGrey"]))
    circle(1.115, 1.1, z1, C["rugGrey"])
    for k in range(14):
        a = 2 * math.pi * (k + 0.5) / 14
        cx, cy = at_r(0.86, a)
        flat_poly([(cx + 0.06 * math.cos(a + m * math.pi / 2), cy + 0.06 * math.sin(a + m * math.pi / 2)) for m in range(4)],
                  z1, C["rugBlue"], out)
    for k in range(18):
        a = 2 * math.pi * k / 18
        flat_poly([at_r(0.62, a - 0.09), at_r(0.62, a + 0.09), at_r(0.72, a)], z1, C["rugGrey"], out)
    circle(0.575, 0.555, z1, C["rugGrey"])
    flat_poly([at_r(0.45, 2 * math.pi * k / 32) for k in range(32)], z1, C["rugBlue"], out, centre=(rx, ry))
    flat_poly([at_r(0.17 + 0.17 * abs(math.cos(4 * (2 * math.pi * k / 48))) ** 0.7, 2 * math.pi * k / 48) for k in range(48)],
              z2, C["lace"], out, centre=(rx, ry))
    flat_poly([at_r(0.09 if k % 2 == 0 else 0.035, math.pi * k / 4) for k in range(8)], z3, C["rugBlue"], out, centre=(rx, ry))
    # Two domed straw cushions on it, one toward the bed, one toward the door.
    for x, y in ((rx + 0.39, ry + 0.6), (rx - 0.4, ry - 0.6)):
        straw_cushion(V(x, y, f + 0.017), 0.32, 0.17, out)
        keep_out_round(x, y, 0.28, 0.17)
    return out, blocks, against


def villager_door(door, yo, floor, tall, pieces):
    """A villager's hut's one door of planks the brown of its posts, no window in it, as the film's
    (reference images `villager hut exterior 2` and `interior 1`): hung on the right-hand post as one
    looks in (the doorway `door` either side of the middle, in the front wall's outer face at -`yo`)
    and swung out (to the left, as one looks out from inside), standing open clear of the post,
    `tall` high: the lantern's light has the whole doorway. Its planks' joins and a few dark marks of
    their grain are painted on both its faces, and each has a dark handle. Returns the blocks that
    keep walkers out of it, as a row of posts along it."""
    hinge = V(door - 0.08, -yo - 0.05, 0.0)
    door_w, door_t = 2 * door - 0.1, 0.05
    swing = math.radians(120.0)
    along = V(-math.cos(swing), -math.sin(swing), 0.0)      # from the hinge to the door's free edge
    shut_out = V(math.sin(swing), -math.cos(swing), 0.0)    # the face that looks out when it is shut
    middle = hinge + along * (door_w / 2) + UP * (floor + 0.02 + tall / 2)
    pieces.append((oriented_box(middle, along, shut_out, (door_w, door_t, tall)), C["hutDoor"], UP * 0.7))
    for face in (shut_out, -shut_out):
        lift = face * (door_t / 2 + 0.003)
        for k in range(1, 5):
            pieces.append((quad(middle + along * (door_w * (k / 5 - 0.5)) + lift, UP, face, tall - 0.04, PEN),
                           C["hutDoorLine"]))
        for k in range(9):
            mark = middle + along * ((hashed(k, 21.0) - 0.5) * (door_w - 0.14)) + UP * ((hashed(k, 22.0) - 0.5) * (tall - 0.3))
            pieces.append((quad(mark + lift, UP, face, 0.05 + 0.08 * hashed(k, 23.0), 0.012), C["hutDoorLine"]))
        door_handle(middle + along * (door_w / 2 - 0.13) + face * (door_t / 2), face, pieces)
    return [{"circle": [*g(*(hinge + along * u).xy), 0.07], "y": [floor - 0.1, floor + tall], "walk": True,
             "camera": False} for u in (0.08 + 0.15 * k for k in range(int((door_w - 0.08) / 0.15) + 1))]


def villager_room(walls, xi, yi, t, floor, wall_h, sill, pieces, inside, glow):
    """The room of a villager's hut, as the film's frames show one inside (reference images `villager hut
    interior 1` to `10`), `xi` and `yi` across from its middle, inside `walls` (its front, back, left
    and right, `t` thick, `wall_h` high, their windows' sills `sill` up): light planks underfoot, their
    seams painted on them; teal walls patterned in big round scales over a darker skin, logs along
    their feet, at the windows' sills (where they are the sills) and along their tops (the plates the
    rafters rest on), each broken where furniture stands against it; posts in the corners, curved
    branches bracing them to the plates; at the back and side windows a casing and plank shutters
    swung back flat against the wall either side (the front windows stand too near the corners for
    them); overhead the straw's underside rising to a peak on rafters, the paper lantern hanging from
    their hub over the middle of the room, lit at night; and furnished as a villager's home (see
    furnish_hut). The floor's planks go into `pieces`, the rest into `inside` and the lantern's glow
    into `glow`. Returns the blocks that keep walkers out of the furniture."""
    front, back, left, right = walls
    xo = xi + t
    eave = floor + wall_h
    # The floor: light planks running from the door to the back wall, a few millimetres over the floor's
    # frame, their seams lines painted on them, stopping at the rug's edge.
    pieces.append((P.box_bm(V(0.0, 0.0, floor - 0.003), (2 * xi, 2 * yi, 0.014)), C["hutFloor"], V(0.0, 0.8, 0.0)))
    planks = 20
    rx, ry, rr = hut_rug(yi)
    seam = floor + 0.007
    for k in range(1, planks):
        x = -xi + 2 * xi * k / planks
        spans = [(-yi + 0.01, yi - 0.01)]
        if abs(x - rx) < rr + 0.02:
            half = math.sqrt((rr + 0.02) ** 2 - (x - rx) ** 2)
            spans = [(-yi + 0.01, ry - half), (ry + half, yi - 0.01)]
        for y0, y1 in spans:
            if y1 - y0 > 0.05:
                inside.append((quad(V(x, (y0 + y1) / 2, seam), V(0, 1, 0), UP, y1 - y0, PEN), C["hutFloorLine"]))
    for k in range(planks):
        x = -xi + 2 * xi * (k + 0.5) / planks
        y = -yi + 0.4 + (2 * yi - 0.8) * ((0.23 + 0.41 * k) % 1.0)
        if math.hypot(x - rx, y - ry) < rr + 0.2:
            continue
        inside.append((quad(V(x, y, seam), V(1, 0, 0), UP, 2 * xi / planks - 0.02, PEN), C["hutFloorLine"]))

    window = left.openings[0]
    furniture, kept_out, against = furnish_hut(floor, xi, yi, wall_h, yi - (window[0] + window[1]) / 2)
    inside.extend(furniture)

    side = {front: ("front", lambda p: xo + p), back: ("back", lambda p: xo - p),
            left: ("left", lambda p: yi - p), right: ("right", lambda p: yi + p)}
    scales = tuple(C[k] for k in HUT_SCALES)
    for w_index, wall in enumerate(walls):
        key, u_of = side[wall]
        stands = [tuple(sorted((u_of(a), u_of(b)))) + (tall,) for a, b, tall in against[key]]
        ends_out = wall in (front, back)
        reach = (t + 0.08, wall.length - t - 0.08) if ends_out else (0.08, wall.length - 0.08)
        corner = reach[0] + 0.09
        clear = [(0.0, corner, -1.0, wall_h + 1.0), (wall.length - corner, wall.length, -1.0, wall_h + 1.0)]
        if wall is not front:
            for o in wall.openings:
                clear.append(shutter_clear(o))
                shutters(wall, o, inside)
        inside.extend(inner_face(wall, clear).shingles(scales, 0.03, wall_h - 0.03, size=0.4))
        feet = [(a, b) for a, b, _ in stands]
        sills = [(a, b) for a, b, tall in stands if tall]
        for v, skip in ((0.06, feet), (sill - 0.05, sills), (wall_h - 0.08, [])):
            inner_rail(wall, v, 0.055, reach, skip, inside, seed=10.0 * w_index)
    for sx in (-1.0, 1.0):
        for sy in (-1.0, 1.0):
            x, y = sx * (xi - 0.08), sy * (yi - 0.08)
            cut_log(V(x, y, floor - 0.01), V(x, y, eave + 0.01), 0.08, tone(C["hutLog"], 3 * sx + sy, 0.06), C["hutLogEnd"],
                    inside, ends=(False, False), segments=10, grain=1.0)
    # The braces: from each back corner along both walls, from each front corner along the side walls,
    # each a quarter circle from its post to the plate, bowing out of the corner, a little further out
    # from the wall than the logs, clear of a shutter swung back under it.
    bend = 0.72
    for (px, py), (ux, uy) in (((xi - 0.08, yi - 0.08), (-1.0, 0.0)), ((xi - 0.08, yi - 0.08), (0.0, -1.0)),
                               ((-xi + 0.08, yi - 0.08), (1.0, 0.0)), ((-xi + 0.08, yi - 0.08), (0.0, -1.0)),
                               ((xi - 0.08, -yi + 0.08), (0.0, 1.0)), ((-xi + 0.08, -yi + 0.08), (0.0, 1.0))):
        plate = eave - 0.08
        out = V(-math.copysign(0.02, px), 0.0, 0.0) if ux == 0.0 else V(0.0, -math.copysign(0.02, py), 0.0)
        arc = [V(px + ux * bend * math.sin(a), py + uy * bend * math.sin(a), plate - bend * math.cos(a)) + out
               for a in (-0.06 + (math.pi / 2 + 0.12) * k / 6 for k in range(7))]
        bent_log(arc, 0.045, tone(C["hutLog"], px + 2 * ux + 3 * uy, 0.06), C["hutLogEnd"], inside,
                 normal=V(ux, uy, 0.0).cross(UP), grain=1.0)
    # Overhead, the straw's underside on rafters up to a peak, and the paper lantern hanging from their
    # hub over the middle of the room, lit at night.
    hub = hut_ceiling(xi, yi, eave, eave + 1.45, inside)
    paper_lantern(hub.x, hub.y, hub.z, floor + wall_h - 0.3, inside, glow)
    return kept_out


def build_stilt_hut(name, pattern, collection):
    """A hut on log stilts you can walk into, as in the film's village: log stairs up to a plank
    porch, a doorway wide enough for three, its one plank door swung out onto the porch (see
    villager_door), lattice windows over a band of coloured scales, and over it all a beehive of
    straw, tied in a knot at its top, as the film's villager's hut (reference image `villager hut
    exterior 1`). Inside, a villager's room (see villager_room). Returns the parts and the info for the
    game."""
    floor, wall_h, t = 0.6, 2.6, 0.16
    xi, yi = 2.8, 2.2                     # the room inside
    xo, yo = xi + t, yi + t               # the walls' outer faces
    porch = -yo - 1.2
    stairs_end = porch - 1.3
    door = 0.68                           # half the doorway's width
    eave = floor + wall_h
    pieces, glow, panes, inside = [], [], [], []

    sill, head = WINDOW_SILL, 2.05        # the windows' bottom and top, above the floor, the top level with the door's
    front = Wall((-xo, -yo + t / 2), (xo, -yo + t / 2), floor, wall_h, t,
                 [(xo - door, xo + door, 0.0, 2.05), (xo - 2.3, xo - 1.3, sill, head), (xo + 1.3, xo + 2.3, sill, head)])
    back = Wall((xo, yo - t / 2), (-xo, yo - t / 2), floor, wall_h, t, [(xo - 0.45, xo + 0.45, sill, head)])
    # The left wall's window toward the back, where it leaves the middle of the wall to the bookshelf,
    # as in the film's room.
    left = Wall((-xo + t / 2, yi), (-xo + t / 2, -yi), floor, wall_h, t, [(1.2 - 0.45, 1.2 + 0.45, sill, head)])
    right = Wall((xo - t / 2, -yi), (xo - t / 2, yi), floor, wall_h, t, [(yi - 0.45, yi + 0.45, sill, head)])
    walls = (front, back, left, right)
    for wall in walls:
        pieces.extend(wall.skins(C["plank"], C["hutSkin"]))
        # Outside, as the film's: shingled all over in round scales, framed by log rails along the
        # wall's foot, under its windows and along its top.
        pieces.extend(wall.shingles(pattern, 0.17, wall_h - 0.17, size=0.34))
        for v, r in ((0.08, 0.085), (sill - 0.09, 0.075), (wall_h - 0.08, 0.09)):
            pieces.extend(wall.rail(v, r, C["log"]))
        for o in wall.openings:
            if o[2] > 0.1:
                pieces.extend(wall.window(o, panes))

    # Thick log posts at the corners and either side of the door, from the ground to the roof.
    for x, y in ((-xo, -yo), (xo, -yo), (-xo, yo), (xo, yo)):
        pieces.append((log(V(x, y, -0.4), V(x, y, floor + wall_h + 0.02), 0.2, segments=10), C["log"]))
    for x in (-door - 0.14, door + 0.14):
        pieces.append((log(V(x, -yo - 0.03, floor), V(x, -yo - 0.03, floor + wall_h), 0.16, segments=10), C["log"]))
    pieces.append((oriented_box(V(0.0, -yo - 0.04, floor + 2.13), V(1, 0, 0), V(0, 1, 0), (2 * door + 0.4, 0.16, 0.17)),
                   C["logDark"]))
    door_blocks = villager_door(door, yo, floor, 1.98, pieces)

    # The floor, the porch and its railing, the stilts under them, and the log stairs.
    pieces.append((P.box_bm(V(0.0, (porch + yo) / 2, floor - 0.07), (2 * xo, yo - porch, 0.14)), C["floor"]))
    for k in range(1, 5):
        y = porch + (-yo - porch) * k / 5
        pieces.append((P.box_bm(V(0.0, y, floor + 0.002), (2 * xo - 0.02, PEN, 0.01)), C["floorLine"]))
    for x in (-xo + 0.1, 0.0, xo - 0.1):
        for y in (porch + 0.12, -yo, 0.0, yo - 0.1):
            pieces.append((log(V(x, y, -0.4), V(x, y, floor - 0.13), 0.11), C["logDark"]))
    # The porch's thick edge logs under its planks; no railing, as the film's porches.
    pieces.append((log(V(-xo - 0.12, porch + 0.1, floor - 0.13), V(xo + 0.12, porch + 0.1, floor - 0.13), 0.13, segments=10),
                   C["log"]))
    for x in (-xo + 0.04, xo - 0.04):
        pieces.append((log(V(x, porch + 0.1, floor - 0.13), V(x, -yo, floor - 0.13), 0.11, segments=8), C["log"]))
    pieces.extend(log_stairs(0.62, porch, stairs_end, floor, rungs=3, rail=0.16, rung=0.13))
    # Potted plants on the porch under the windows, as in the film's: a gnarled succulent in a
    # terracotta pot and a round pot of purple thistles, and another succulent on the other side.
    pots = [(V(1.55, -yo - 0.3, floor), potted_succulent), (V(2.2, -yo - 0.28, floor), potted_thistles),
            (V(-1.8, -yo - 0.3, floor), potted_thistles)]
    for at, make in pots:
        make(at, pieces)

    kept_out = villager_room(walls, xi, yi, t, floor, wall_h, sill, pieces, inside, glow)

    # The roof: the film's beehive of straw, centred over the walls, oval to hang out about as far over
    # each, its underside flat from the walls' middles out to its rim; rough as straw is (see
    # bell_roof), dark strokes of straw scattered over it and its ends hanging ragged from its rim, as
    # the film draws them; the rope tying its knot wound three times round the neck, its end hanging
    # down the shoulder.
    centre = V(0.0, 0.0, 0.0)
    hole = ((-xo + t / 2, xo - t / 2), (-yo + t / 2, yo - t / 2))
    bell, outline = bell_roof(HUT_ROOF, centre, eave, hole, HUT_ROOF_DEPTH, eave + HUT_TIES[-1] + 0.1)
    pieces.append(bell)
    straw_strokes(outline, centre, eave, HUT_ROOF_DEPTH, pieces, 190, 0.35, 3.6, (0.22, 0.5), (0.035, 0.06))
    straw_strokes(outline, centre, eave, HUT_ROOF_DEPTH, pieces, 36, HUT_TIES[-1] + 0.15, HUT_ROOF[-1][1] - 0.25,
                  (0.1, 0.2), (0.022, 0.035), seed=5.0)
    straw_fringe(outline, centre, eave, HUT_ROOF_DEPTH, pieces)
    for k, h in enumerate(HUT_TIES):
        ring = []
        rope_ring(V(0.0, 0.0, eave + h), radius_at(outline, eave + h) + 0.035, 0.09, tone(C["tie"], k, 0.08), ring)
        pieces.extend((squash(bm, centre, HUT_ROOF_DEPTH), colour) for bm, colour in ring)
    a = 0.35
    rope_end = [(radius_at(outline, eave + h) * (1.0 + straw_bump(a, h)) + 0.06, eave + h) for h in (4.12, 3.98, 3.84, 3.68)]
    rope_end = [V(math.sin(a) * r, -math.cos(a) * r * HUT_ROOF_DEPTH, z) for r, z in rope_end]
    bent_log(rope_end, 0.05, C["tie"], C["tie"], pieces, normal=V(math.cos(a), math.sin(a) / HUT_ROOF_DEPTH, 0.0).normalized())
    # From afar: the roof (its underside flat across), the walls as boxes, the porch and the stilts'
    # shadow under them.
    roof_far = lathe_roof([(0.0, eave + 0.03)] + [(r, eave + h) for r, h in HUT_ROOF], centre, samples=20, segments=12,
                          straw=("hutThatch", "hutThatchLight", "hutThatchDark"))
    far = [(squash(roof_far[0], centre, HUT_ROOF_DEPTH), roof_far[1])]
    far += [w.far(pattern[0]) for w in walls]
    far.append((P.box_bm(V(0.0, (porch + yo) / 2, floor / 2 - 0.1), (2 * xo, yo - porch, floor + 0.2)), C["logDark"]))

    # Its wood painted as 島二郎's is (see wood_auto); the stilt huts' wood is all alike, whatever their
    # walls' colours, so they share one painted map.
    import paintmap as PM
    painter = PM.Painter("hut_stilt")
    body = painter.join(name, pieces, collection, sharp=P.SHARP, auto=wood_auto(True))
    lights = P.join(f"{name}_lamp", glow, collection)
    glass = P.join(f"{name}_pane", panes, collection)
    room = painter.join(f"{name}_inside", inside, collection, sharp=P.SHARP, auto=wood_auto(False))
    distant = P.join(f"{name}_far", far, collection, sharp=P.SHARP)
    under = floor - 0.25
    blocks = [
        block_box(-xo, xo, yi, yo, -10, eave), block_box(-xo, -door, -yo, -yi, -10, eave),
        block_box(door, xo, -yo, -yi, -10, eave), block_box(-xo, -xi, -yo, yo, -10, eave),
        block_box(xi, xo, -yo, yo, -10, eave),
        block_box(-xo, xo, porch, yo, -10, under, camera=False),
        block_box(-xo, -xo + 0.12, porch, -yo, floor - 0.3, floor + 0.7, camera=False),
        block_box(xo - 0.12, xo, porch, -yo, floor - 0.3, floor + 0.7, camera=False),
        block_box(-xo, -0.62, porch, porch + 0.1, floor - 0.3, floor + 0.7, camera=False),
        block_box(0.62, xo, porch, porch + 0.1, floor - 0.3, floor + 0.7, camera=False),
    ] + kept_out + door_blocks
    # The roof, for the camera, in bands up its sides, each as wide across as the roof at its foot.
    for low, high, r in ((-0.2, 1.5, 4.5), (1.5, 2.65, 4.25), (2.65, 3.45, 3.3), (3.45, 5.3, 1.95)):
        blocks.append({"circle": [0.0, 0.0, r], "y": [round(eave + low, 3), round(eave + high, 3)], "walk": False,
                       "camera": True})
    # The porch's pots.
    blocks += [{"circle": [*g(at.x, at.y), 0.2], "y": [floor - 0.1, floor + 0.6], "walk": True, "camera": False}
               for at, _ in pots]
    decks = [deck_box(-xo + 0.1, xo - 0.1, porch, yi, floor), deck_box(-0.62, 0.62, stairs_end, porch, floor, 0.02)]
    info = {"blocks": blocks, "decks": decks, "height": round(eave + 5.3, 3), "openings": openings_of(walls)}
    info.update(bake_night(name, [body, room], lights, info["openings"]))
    info.update(painter.finish(P.OUT_MODELS))
    return [body, lights, glass, room, distant], info


# ---------------------------------------------------------------------------- the plank hut
def build_plank_hut(name, collection):
    """A plank hut on the ground with a wide thatched hip roof, as in the film's clearing: a window each
    side and at the back, its one plank door swung out onto a landing of planks before it (see
    villager_door), and inside a villager's room as the stilt huts' (see villager_room), the roof open
    over it for its ceiling. Returns the parts and the info for the game."""
    floor, wall_h, t = 0.22, 2.45, 0.16
    xi, yi = 2.6, 2.1
    xo, yo = xi + t, yi + t
    step = -yo - 1.2                      # the landing's front edge: room for the door to stand open on it
    ramp_end = step - 0.6
    door = 0.65
    pieces, glow, panes, inside = [], [], [], []
    sill, head = WINDOW_SILL, 1.85
    front = Wall((-xo, -yo + t / 2), (xo, -yo + t / 2), floor, wall_h, t, [(xo - door, xo + door, 0.0, 1.95)])
    back = Wall((xo, yo - t / 2), (-xo, yo - t / 2), floor, wall_h, t, [(xo - 0.45, xo + 0.45, sill, head)])
    # The left wall's window toward the back, where it leaves the middle of the wall to the bookshelf.
    left = Wall((-xo + t / 2, yi), (-xo + t / 2, -yi), floor, wall_h, t, [(1.2 - 0.45, 1.2 + 0.45, sill, head)])
    right = Wall((xo - t / 2, -yi), (xo - t / 2, yi), floor, wall_h, t, [(yi - 0.45, yi + 0.45, sill, head)])
    walls = (front, back, left, right)
    for wall in walls:
        pieces.extend(wall.skins(C["plank"], C["hutSkin"]))
        pieces.extend(wall.courses(C["plankLine"], -1, start=0.3, step=0.3))
        # Log rails along the wall's foot, under its windows and along its top.
        for v, r in ((0.07, 0.08), (sill - 0.09, 0.07), (wall_h - 0.07, 0.085)):
            pieces.extend(wall.rail(v, r, C["log"]))
        for o in wall.openings:
            if o[2] > 0.1:
                pieces.extend(wall.window(o, panes))
    for x, y in ((-xo, -yo), (xo, -yo), (-xo, yo), (xo, yo)):
        pieces.append((log(V(x, y, -0.2), V(x, y, floor + wall_h), 0.18, segments=10), C["log"]))
    for x in (-door - 0.12, door + 0.12):
        pieces.append((log(V(x, -yo - 0.03, floor), V(x, -yo - 0.03, floor + 2.0), 0.13, segments=10), C["log"]))
    door_blocks = villager_door(door, yo, floor, 1.9, pieces)
    # Potted plants either side of the door, as by the film's doors.
    pots = [(V(1.25, -yo - 0.32, floor), potted_succulent), (V(-1.25, -yo - 0.3, floor), potted_thistles)]
    for at, make in pots:
        make(at, pieces)
    pieces.append((P.box_bm(V(0.0, (step + yo) / 2, floor - 0.06), (2 * xo, yo - step, 0.12)), C["floor"]))
    pieces.append((P.box_bm(V(0.0, (step + ramp_end) / 2, 0.06), (1.6, step - ramp_end, 0.14)), C["log"]))
    kept_out = villager_room(walls, xi, yi, t, floor, wall_h, sill, pieces, inside, glow)
    eave = floor + wall_h
    roof = (-xo - 0.84, xo + 0.84, -yo - 1.14, yo + 0.84, eave, eave + 0.28, eave + 2.73, 1.1)
    pieces.append(hip_roof(*roof, hole=((-xo + t / 2, xo - t / 2), (-yo + t / 2, yo - t / 2))))
    far = [hip_roof(*roof, subdivide=False)]
    far += [w.far(C["plank"]) for w in walls]
    # Its wood painted as 島二郎's is (see wood_auto).
    import paintmap as PM
    painter = PM.Painter(name)
    body = painter.join(name, pieces, collection, sharp=P.SHARP, auto=wood_auto(True))
    lights = P.join(f"{name}_lamp", glow, collection)
    glass = P.join(f"{name}_pane", panes, collection)
    room = painter.join(f"{name}_inside", inside, collection, sharp=P.SHARP, auto=wood_auto(False))
    distant = P.join(f"{name}_far", far, collection, sharp=P.SHARP)
    blocks = [
        block_box(-xo, xo, yi, yo, -10, eave), block_box(-xo, -door, -yo, -yi, -10, eave),
        block_box(door, xo, -yo, -yi, -10, eave), block_box(-xo, -xi, -yo, yo, -10, eave),
        block_box(xi, xo, -yo, yo, -10, eave),
        block_box(roof[0], roof[1], roof[2], roof[3], eave - 0.05, roof[6], walk=False),
    ] + kept_out + door_blocks
    blocks += [{"circle": [*g(at.x, at.y), 0.2], "y": [floor - 0.1, floor + 0.6], "walk": True, "camera": False}
               for at, _ in pots]
    decks = [deck_box(-xo + 0.1, xo - 0.1, step, yi, floor), deck_box(-0.8, 0.8, ramp_end, step, floor, 0.02)]
    info = {"blocks": blocks, "decks": decks, "height": roof[6], "openings": openings_of(walls)}
    info.update(bake_night(name, [body, room], lights, info["openings"]))
    info.update(painter.finish(P.OUT_MODELS))
    return [body, lights, glass, room, distant], info


# ---------------------------------------------------------------------------- the guest houses
# Each guest house's colours and sides: the film's two, an orange-shingled one with a cream gable,
# its long sides boarded and painted a grey green, and a tan-shingled one with a pale green gable and
# log sides; each gable patterned with chevrons.
GUEST_STYLES = {
    "orange": {"roof": "#D98A4B", "gable": "#F4E4B4", "chevron": "#FFF8E2", "sides": "boards", "roof_paint": True},
    "tan": {"roof": "#B39469", "gable": "#DCEBC0", "chevron": "#F2F8E2", "sides": "logs"},
}


def tone(colour, seed, amount=0.06):
    """`colour` a little lighter or darker, by a fixed hash of `seed`: each log or board its own."""
    k = math.sin(seed * 12.9898 + 78.233) * 43758.5453
    k = 2.0 * (k - math.floor(k)) - 1.0
    return tuple(c * (1.0 + amount * k) for c in colour)


def gltf_axis(v):
    """A direction in Blender's frame as the glTF file holds it, y up: the exporter turns positions and
    normals into that frame but writes custom attributes as they are."""
    return (float(v.x), float(v.z), -float(v.y))


# The palette's wood, for the painted textures (see paintmap.Painter and wood_auto), as the film paints
# 島二郎's: bare wood with its grain, knots, nails and weather; painted wood with its paint worn
# through to the wood. Not the pen's lines drawn along the planks, nor the logs' pale cut ends, which
# keep their own colours.
BARE_WOOD = ("log", "logDark", "plank", "inside", "floor", "frame", "torch", "guestLog", "guestLogDark", "guestDoor",
             "guestDoorFrame", "guestInLog", "guestFloor", "guestRoofIn", "guestRafter", "shutter", "hutDoor", "hutLog",
             "hutFloor", "hutCeiling", "hutRafter", "bedFrame", "stump", "counterTop", "cuttingBoard", "spoon", "shelf",
             "shelfDark", "chest", "chestTop")
PAINTED_WOOD = ("board", "boardEdge", "guestBoard", "cabinet", "cabinetPanel", "cabinetLight")
# How wood out in the weather is painted, and in a room.
OUT_WOOD = {"weather": 0.45, "damp": 0.5, "checks": 0.25}
IN_WOOD = {"knots": 2}


def wood_auto(outside, bare=(), painted=(), coarse=(), palette=True):
    """What a Painter's join paints (see paintmap.Painter): a piece of the palette's painted wood
    (PAINTED_WOOD, and `painted`, colours of a house's own) as painted wood; any other grained piece,
    and one of its bare wood (BARE_WOOD, `bare`), as wood; each a little lighter or darker as `tone`
    makes each log and board; out in the weather if `outside`. What is of the `coarse` colours (a
    roof, seen from below and afar) is painted at 0.6 of the map's density. Without `palette`, only
    the colours given (for a prop of another palette, whose colours may happen to be like these)."""
    params = OUT_WOOD if outside else IN_WOOD
    bare_c = [np.array(C[n]) for n in BARE_WOOD if palette] + [np.array(c) for c in bare]
    paint_c = [np.array(C[n]) for n in PAINTED_WOOD if palette] + [np.array(c) for c in painted]
    coarse_c = [np.array(c) for c in coarse]

    def like(colour, palette):
        x = np.asarray(colour, dtype=float)
        for c in palette:
            f = float(x.dot(c) / max(c.dot(c), 1e-9))
            if 0.85 <= f <= 1.15 and np.abs(x / f - c).max() < 0.008:
                return True
        return False

    def auto(piece):
        colour = piece[1]
        grained = len(piece) > 2 and piece[2] is not None
        if isinstance(colour, list):
            return ("wood", dict(params)) if grained else None
        texel = {"texel": 0.6} if coarse_c and like(colour, coarse_c) else {}
        if like(colour, paint_c):
            return ("painted", {"weather": 0.3 if outside else 0.0, "stain": 0.3 if outside else 0.0, **texel})
        if grained or like(colour, bare_c):
            return ("wood", {**params, **texel})
        return None
    return auto


def join_grained(name, pieces, collection, sharp=None):
    """P.join, keeping each piece's wood grain as the mesh's `_grain` attribute, for the film look's
    wood painter (paintWood in src/world/Look.ts): a piece's third item, if it has one, is the way its
    grain runs, its length how strongly it is painted (one vector for the whole piece, or a list, one
    a vertex); a piece without one has none."""
    grains, plain = [], []
    for piece in pieces:
        bm, colour = piece[0], piece[1]
        grain = piece[2] if len(piece) > 2 else None
        grains.extend(grain if isinstance(grain, list) else [grain] * len(bm.verts))
        plain.append((bm, colour))
    obj = P.join(name, plain, collection, sharp=sharp)
    assert len(grains) == len(obj.data.vertices), (name, len(grains), len(obj.data.vertices))
    flat = []
    for grain in grains:
        flat.extend(gltf_axis(grain) if grain is not None else (0.0, 0.0, 0.0))
    obj.data.attributes.new("_grain", "FLOAT_VECTOR", "POINT").data.foreach_set("vector", flat)
    return obj


def cut_log(a, b, radius, colour, end_colour, pieces, ends=(True, True), segments=12, ring=None, rings=(True, True),
            grain=0.0):
    """A log from exactly a to b as one solid: each end of `ends` cut to show its pale grain
    (`end_colour`), with `ring` (a colour) the grain's darker heart in the middle of each end of
    `rings`; an end not cut (buried in a wall) is closed in the log's own colour. The ends' faces have
    vertices of their own, so their colours stop sharp at the rim (the pen's hull joins them up). With
    `grain`, the film look paints grain along its length that strongly, not on its ends."""
    d = (b - a).normalized()
    side = d.orthogonal().normalized()
    up = d.cross(side)
    bm, cols = bmesh.new(), []

    def ring_at(c, r, colour_):
        cols.extend([colour_] * segments)
        return [bm.verts.new(c + (side * math.cos(2 * math.pi * i / segments) + up * math.sin(2 * math.pi * i / segments)) * r)
                for i in range(segments)]

    def face(verts, towards):
        f = bm.faces.new(verts)
        f.normal_update()
        if f.normal.dot(towards) < 0:
            f.normal_flip()

    s0, s1 = ring_at(a, radius, colour), ring_at(b, radius, colour)
    for i in range(segments):
        j = (i + 1) % segments
        mid = (s0[i].co + s0[j].co) / 2 - a
        face((s0[i], s0[j], s1[j], s1[i]), mid - d * mid.dot(d))
    for at, out, cut, heart in ((a, -d, ends[0], rings[0]), (b, d, ends[1], rings[1])):
        rim = ring_at(at, radius, end_colour if cut else colour)
        if cut and ring is not None and heart:
            inner = ring_at(at, radius * 0.48, end_colour)
            for i in range(segments):
                j = (i + 1) % segments
                face((rim[i], rim[j], inner[j], inner[i]), out)
            face(ring_at(at, radius * 0.48, ring), out)
        else:
            face(rim, out)
    if grain > 0.0:
        side_verts = 2 * segments
        pieces.append((bm, cols, [d * grain] * side_verts + [None] * (len(cols) - side_verts)))
    else:
        pieces.append((bm, cols))


def half_log(a, b, radius, colour, end_colour, pieces, segments=8, grain=0.0):
    """A log split down its length from a to b (level), lying flat face up, its ends cut to show
    their pale grain: a step's tread; with `grain`, its wood painted with grain along it that
    strongly."""
    d = (b - a).normalized()
    side = UP.cross(d).normalized()

    def body(p, q, r):
        bm = bmesh.new()
        lo, hi = ([bm.verts.new(c + side * (r * math.cos(math.pi * i / segments)) - UP * (r * math.sin(math.pi * i / segments)))
                   for i in range(segments + 1)] for c in (p, q))
        for i in range(segments):
            bm.faces.new((lo[i], lo[i + 1], hi[i + 1], hi[i]))
        bm.faces.new((lo[segments], lo[0], hi[0], hi[segments]))
        bm.faces.new(lo)
        bm.faces.new(hi)
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
        return bm

    cut = 0.03
    pieces.append((body(a + d * cut, b - d * cut, radius), colour, d * grain if grain > 0.0 else None))
    pieces.append((body(a, a + d * cut, radius * 0.94), end_colour))
    pieces.append((body(b - d * cut, b, radius * 0.94), end_colour))


def gable_bm(y, half, z0, z1, thickness, hole=None):
    """A gable: a triangle over x -half..half from z0 up to z1 at its middle, `thickness` deep from y
    toward +y, with a square `hole` (its middle's height, half its width) through it for a window."""
    bm = bmesh.new()

    def rim(points):
        front = [bm.verts.new((x, y, z)) for x, z in points]
        return front, [bm.verts.new((v.co.x, y + thickness, v.co.z)) for v in front]

    if hole is None:
        (front, back) = rim([(-half, z0), (half, z0), (0.0, z1)])
        faces = [[0, 1, 2]]
        holes = []
    else:
        hz, hw = hole
        lo, hi = hz - hw, hz + hw
        edge = lambda z: half * (z1 - z) / (z1 - z0)  # noqa: E731
        # The outline, met by the hole's top and bottom, then the hole: shared corners, so no face
        # lies between the pieces round the hole.
        (front, back) = rim([(-half, z0), (half, z0), (edge(lo), lo), (edge(hi), hi), (0.0, z1), (-edge(hi), hi),
                             (-edge(lo), lo), (-hw, lo), (hw, lo), (hw, hi), (-hw, hi)])
        faces = [[0, 1, 2, 8, 7, 6], [2, 3, 9, 8], [3, 4, 5, 10, 9], [6, 7, 10, 5]]
        holes = [7, 8, 9, 10]
    outline = list(range(len(front) - len(holes)))
    for face in faces:
        bm.faces.new([front[i] for i in face])
        bm.faces.new([back[i] for i in reversed(face)])
    for ring in (outline, holes):
        for i, a in enumerate(ring):
            b = ring[(i + 1) % len(ring)]
            bm.faces.new((front[a], back[a], back[b], front[b]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    return bm


def grid_window(wall, opening, panes, cols, rows, pieces, inside):
    """A window in one of a log wall's openings, as the guest houses' are: a dark board frame with a
    deep sill outside, panes that light up at night (into `panes`), a grid of bars across them, and
    inside a deep sill and a head board standing out past the room's logs."""
    u0, u1, v0, v1 = opening
    w, h = u1 - u0, v1 - v0
    uc, vc = (u0 + u1) / 2, (v0 + v1) / 2
    bar, e = 0.09, 0.004
    for c, size in ((wall.point(uc, v1 + (bar - e) / 2, -0.06), (w + 2 * bar, 0.12, bar + e)),
                    (wall.point(uc, v0 - (bar - e) / 2, -0.08), (w + 2 * bar + 0.12, 0.16, bar + e)),
                    (wall.point(u0 - (bar - e) / 2, vc, -0.06), (bar + e, 0.12, h)),
                    (wall.point(u1 + (bar - e) / 2, vc, -0.06), (bar + e, 0.12, h))):
        pieces.append((oriented_box(c, wall.d, wall.inward, size), C["frame"]))
    panes.append((pane(wall.point(uc, vc, wall.t / 2 - PANE_OUT), wall.d, -wall.inward, w + 2 * e, h + 2 * e), C["glass"]))
    for k in range(1, cols):
        pieces.append((oriented_box(wall.point(u0 + w * k / cols, vc, wall.t / 2 - 0.02), wall.d, wall.inward,
                                    (0.035, 0.016, h + e)), C["frame"]))
    for k in range(1, rows):
        pieces.append((oriented_box(wall.point(uc, v0 + h * k / rows, wall.t / 2 - 0.035), wall.d, wall.inward,
                                    (w + e, 0.016, 0.035)), C["frame"]))
    # Inside, the sill's top and the head's underside stand a little into the opening, so neither
    # lies in the plane of the wall's own faces round it.
    for v, size in ((v0 - 0.018, (w + 0.28, 0.2, 0.06)), (v1 + 0.018, (w + 0.2, 0.14, 0.06))):
        inside.append((oriented_box(wall.point(uc, v, wall.t + 0.04), wall.d, wall.inward, size), C["frame"]))


def inner_logs(wall, r, colour, end_colour, pieces, reach, seed=0.0):
    """Round logs along a wall's inner face, course on course, standing out of it into the room: the
    film's log rooms. They run from `reach`'s first to its second (u along the wall), on into the
    walls at the corners, and are cut at the wall's openings, their cut ends pale."""
    courses = int(wall.height / (2 * r))
    # Cut a centimetre further back from the openings than the logs outside, so the two never end in
    # one plane where they meet inside the wall.
    around = [(a - 0.03, b + 0.03, c - r, d + r) for a, b, c, d in wall.openings]
    for k in range(courses):
        v = r + 2 * r * k
        for u0, u1 in solid_spans(wall.length, v, around):
            first, last = u0 < 1e-6, u1 > wall.length - 1e-6
            u0, u1 = (reach[0] if first else u0), (reach[1] if last else u1)
            if u1 - u0 < 0.12:
                continue
            cut_log(wall.point(u0, v, wall.t + 0.08 - r), wall.point(u1, v, wall.t + 0.08 - r), r,
                    tone(colour, seed + k * 5.3 + u0, 0.08), end_colour, pieces, ends=(not first, not last), segments=10,
                    grain=1.0)


def board_siding(wall, colour, pieces, reach=0.15, seed=0.0):
    """Horizontal boards along a wall's outer face from its foot to its top, every other one standing
    a little prouder, stopping at its openings (whose frames cover their ends) and running `reach` on
    past its ends, in under the logs at the corners: the orange guest house's boarded sides."""
    n = max(1, round(wall.height / 0.2))
    h = wall.height / n
    clear = [(a - 0.01, b + 0.01, c - 0.01, d + 0.01) for a, b, c, d in wall.openings]
    for k in range(n):
        v = h * (k + 0.5)
        spans = [(max(a0, b0), min(a1, b1)) for a0, a1 in solid_spans(wall.length, v - h / 2 + 0.01, clear)
                 for b0, b1 in solid_spans(wall.length, v + h / 2 - 0.01, clear) if min(a1, b1) > max(a0, b0)]
        for u0, u1 in spans:
            u0 = u0 - reach if u0 < 1e-6 else u0
            u1 = u1 + reach if u1 > wall.length - 1e-6 else u1
            if u1 - u0 < 0.05:
                continue
            depth = -0.02 if k % 2 == 0 else -0.042
            pieces.append((oriented_box(wall.point((u0 + u1) / 2, v, depth), wall.d, wall.inward, (u1 - u0, 0.012, h)),
                           tone(colour, seed + k * 3.1 + u0, 0.05), wall.d * 0.25))


def shingle_rows(top_edge, down, normal, length, depth, thick, colour, pieces, hole=None, seed=0.0):
    """Rows of wooden shingles on a roof slab (its top edge, the way down it, its normal, how long down
    it and deep along it, how thick), from its top edge down: each row a board resting on the slab
    under the row above and standing off it at its lower edge, so the rows step down the roof as the
    film's do. `hole` ((s0, s1) down the slope, (y0, y1) along it) is a window the rows stop round."""
    row, overlap, lift, board, rest = 0.26, 0.07, 0.035, 0.018, 0.003
    rows = max(1, round(length / row))
    step = length / rows
    for k in range(rows):
        s1 = step * (k + 1)
        s0 = max(0.0, s1 - step - overlap)
        span = s1 - s0
        along = (down * span + normal * lift).normalized()
        spans = [(-depth / 2, depth / 2)]
        if hole is not None:
            (h0, h1), (y0, y1) = hole
            if s1 > h0 - 0.02 and s0 < h1 + 0.02:
                spans = [(-depth / 2, y0 - 0.02), (y1 + 0.02, depth / 2)]
        for a, b in spans:
            if b - a < 0.05:
                continue
            mid = top_edge + down * ((s0 + s1) / 2) + normal * (thick + rest + lift / 2 + board / 2) + V(0.0, (a + b) / 2, 0.0)
            pieces.append((oriented_box(mid, along, V(0, 1, 0), (math.hypot(span, lift), b - a, board)),
                           tone(colour, seed + k * 7.0 + a, 0.05), V(0.0, 0.6, 0.0)))


def hammock(x0, x1, y, hook_z, low_z, width, pieces):
    """A red cloth hammock slung across a room from hooks on its walls at x0 and x1: ropes from the
    hooks to the cloth's gathered ends, the cloth sagging between them, its sides curling up a little
    like a cradle. A thin solid, so the pen draws its edge."""
    end0, end1 = x0 + 0.35, x1 - 0.35
    for hx, ex in ((x0, end0), (x1, end1)):
        pieces.append((P.segment_bm(V(hx, y, hook_z + 0.05), V(hx, y, hook_z - 0.05), 0.03, 0.03, 6), C["iron"]))
        for dy in (-width * 0.3, width * 0.3):
            pieces.append((P.segment_bm(V(hx, y, hook_z), V(ex, y + dy * 0.4, hook_z - 0.12), 0.012, 0.012, 4), C["rope"]))
    cols, rows = 14, 5
    top, bottom, colours = [], [], []
    bm = bmesh.new()
    for i in range(cols + 1):
        u = i / cols
        x = end0 + (end1 - end0) * u
        sag = 4.0 * u * (1.0 - u)
        gather = math.sin(math.pi * u) ** 0.6
        for j in range(rows + 1):
            v = j / rows * 2.0 - 1.0
            z = hook_z - 0.12 - (hook_z - 0.12 - low_z) * sag + 0.1 * v * v * gather
            yy = y + v * width / 2 * gather
            top.append(bm.verts.new((x, yy, z + 0.012)))
            bottom.append(bm.verts.new((x, yy, z - 0.012)))
            colours += [C["hammockDark"] if i % 3 == 0 else C["hammock"]] * 2
    n = rows + 1
    for i in range(cols):
        for j in range(rows):
            a, b, c, d = i * n + j, (i + 1) * n + j, (i + 1) * n + j + 1, i * n + j + 1
            bm.faces.new((top[a], top[b], top[c], top[d]))
            bm.faces.new((bottom[d], bottom[c], bottom[b], bottom[a]))
    for i in range(cols):
        for j in (0, rows):
            a, b = i * n + j, (i + 1) * n + j
            bm.faces.new((top[a], bottom[a], bottom[b], top[b]))
    for i in (0, cols):
        for j in range(rows):
            a, b = i * n + j, i * n + j + 1
            bm.faces.new((top[a], top[b], bottom[b], bottom[a]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    pieces.append((bm, colours))


def build_guest_house(name, style, collection):
    """A guest house, as in the film's, where the visitors sleep: a small log cabin of pale round
    logs, their cut ends pale and ringed at the corners, on short stilts, under a steep gable roof of
    wooden shingles stepping down it in rows, with a window in its slope and bargeboards along its
    gable ends, crossing at the top. Its door is in the front gable end, a plank door with a diamond
    window, up three half-log steps; the gable above it is boarded in a pale colour patterned with
    chevrons round a small window. The orange one's long sides are boarded and painted a grey green,
    as in the film's frame of it. Inside, an empty room of dark round logs, as in the film's frames
    inside, their cut ends pale at the windows and the doorway, on a floor of light planks under the
    roof's dark boards and rafters, but for a red hammock slung across it before the window opposite
    the door. Faces -Y."""
    s = GUEST_STYLES[style]
    roof_colour = L.hex_color(s["roof"])
    boarded = s["sides"] == "boards"
    floor, wall_h, t = 0.55, 2.0, 0.2
    xi, yi = 1.95, 2.4
    xo, yo = xi + t, yi + t
    eave = floor + wall_h
    pitch = math.radians(52.0)
    ridge = eave + xo * math.tan(pitch)
    over, gable_over = 0.45, 0.4
    door = 0.45
    pieces, glow, panes, inside = [], [], [], []
    sill, head = 0.85, 1.6
    front = Wall((-xo, -yo + t / 2), (xo, -yo + t / 2), floor, wall_h, t, [(xo - door, xo + door, 0.0, 1.85)])
    back = Wall((xo, yo - t / 2), (-xo, yo - t / 2), floor, wall_h, t, [(xo - 0.5, xo + 0.5, sill, head)])
    left = Wall((-xo + t / 2, yi), (-xo + t / 2, -yi), floor, wall_h, t, [(yi - 0.5, yi + 0.5, sill, head)])
    right = Wall((xo - t / 2, -yi), (xo - t / 2, yi), floor, wall_h, t, [(yi - 0.5, yi + 0.5, sill, head)])
    walls = (front, back, left, right)
    r = 0.12
    courses = int(wall_h / (2 * r))
    for w_index, wall in enumerate(walls):
        ends_out = wall in (front, back)
        seed = 50.0 * w_index
        pieces.extend(wall.skins(C["guestLogDark"], C["guestInSkin"]))
        # Inside, round logs on into the walls at the corners (past the side walls' inner faces from
        # the front and back walls, into the front and back walls from the sides).
        inner_logs(wall, r, C["guestInLog"], C["guestInLogEnd"], inside,
                   (t - 0.05, wall.length - t + 0.05) if ends_out else (-0.05, wall.length + 0.05), seed)
        for o in wall.openings:
            if o[2] > 0.1:
                grid_window(wall, o, panes, 3, 3, pieces, inside)
        if boarded and not ends_out:
            board_siding(wall, C["guestBoard"], pieces, seed=seed)
            continue
        # Round logs along the wall's outer face, course on course, cut at its openings; at the corners
        # every other course runs on past the corner (every course of the boarded house's ends), so the
        # logs' ends stack there as the film draws, pale and ringed.
        for k in range(courses):
            v = r + 2 * r * k
            if boarded:
                past = 0.24
            else:
                past = (0.24 if ends_out else 0.24 + t) if (k % 2 == 0) == ends_out else (-0.05 if ends_out else 0.15)
            spans = solid_spans(wall.length, v, [(a - 0.02, b + 0.02, c - r, d + r) for a, b, c, d in wall.openings])
            for u0, u1 in spans:
                if u1 - u0 < 0.12:
                    continue
                first, last = u0 < 1e-6, u1 > wall.length - 1e-6
                start = u0 - (past if first else 0.0)
                end = u1 + (past if last else 0.0)
                if end - start < 0.12:
                    continue
                # A cut end shows where it meets an opening or runs on past a corner; one buried in the
                # next wall is closed plain.
                shows = past > 0.2
                cut = (shows or not first, shows or not last)
                cut_log(wall.point(start, v, -0.03), wall.point(end, v, -0.03), r, tone(C["guestLog"], seed + k * 5.3 + u0),
                        C["guestLogEnd"], pieces, ends=cut, ring=C["guestLogRing"], rings=cut, grain=0.45)
    # The door's frame, and the plank door open into the room against the logs beside it, a diamond
    # window and a long handle on it.
    e = 0.004
    for c, size in ((V(0.0, -yo - 0.04, floor + 1.85 + 0.05 - e), (2 * door + 0.2, 0.14, 0.1)),
                    (V(-door - 0.05 + e, -yo - 0.04, floor + 0.9), (0.1, 0.14, 1.9)),
                    (V(door + 0.05 - e, -yo - 0.04, floor + 0.9), (0.1, 0.14, 1.9))):
        pieces.append((P.box_bm(c, size), C["guestDoorFrame"], V(0.6, 0.0, 0.0) if size[0] > size[2] else UP * 0.6))
    leaf_x, leaf_y = -door + 0.03, -yi + 0.54
    pieces.append((oriented_box(V(leaf_x, leaf_y, floor + 0.92), V(0, 1, 0), V(1, 0, 0), (0.88, 0.05, 1.8)),
                   C["guestDoor"], UP * 0.8))
    for k in (-1, 0, 1):
        pieces.append((oriented_box(V(leaf_x + 0.027, leaf_y + 0.22 * k, floor + 0.92), V(0, 1, 0), V(1, 0, 0),
                                    (PEN, 0.006, 1.74)), C["guestDoorLine"]))
    diamond = Matrix.Rotation(math.pi / 4, 3, "X")
    for side in (-1.0, 1.0):
        at = V(leaf_x + side * 0.028, leaf_y, floor + 1.32)
        bm = P.box_bm(V(0.0, 0.0, 0.0), (0.012, 0.16, 0.16))
        L.transformed(bm, Matrix.Translation(at) @ diamond.to_4x4())
        pieces.append((bm, C["doorGlass"]))
    pieces.append((oriented_box(V(leaf_x + 0.042, leaf_y + 0.34, floor + 0.95), UP, V(1, 0, 0), (0.34, 0.035, 0.035)),
                   C["handle"]))
    # The floor on its stilts, its light planks drawn inside (their joins staggered), and the steps
    # up to the door: logs split down their length lying flat face up, their cut ends pale, as the
    # film's, the upper two on short posts.
    # The floor's frame is dark wood like the stilts, seen from outside as a band under the logs; the
    # light planks lie over it in the room, their top a hair above the frame's.
    pieces.append((P.box_bm(V(0.0, 0.0, floor - 0.08), (2 * xo + 0.1, 2 * yo + 0.1, 0.16)), C["logDark"]))
    pieces.append((P.box_bm(V(0.0, 0.0, floor - 0.003), (2 * xi, 2 * yi, 0.014)), C["guestFloor"], V(0.0, 0.9, 0.0)))
    for k in range(1, 9):
        x = -xi + 2 * xi * k / 9
        inside.append((P.box_bm(V(x, 0.0, floor + 0.002), (PEN, 2 * yi - 0.02, 0.01)), C["guestFloorLine"]))
    for k in range(9):
        x = -xi + 2 * xi * (k + 0.5) / 9
        y = -yi + 0.3 + (2 * yi - 0.6) * ((0.31 + 0.37 * k) % 1.0)
        inside.append((P.box_bm(V(x, y, floor + 0.002), (2 * xi / 9 - 0.02, PEN, 0.01)), C["guestFloorLine"]))
    for x in (-xo + 0.15, xo - 0.15):
        for y in (-yo + 0.15, 0.0, yo - 0.15):
            pieces.append((P.box_bm(V(x, y, (floor - 0.16 - 0.3) / 2), (0.24, 0.24, floor - 0.16 + 0.3)), C["logDark"],
                           UP * 0.6))
    treads, run = 3, 0.3
    step_rise = floor / (treads + 1)
    for k in range(treads):
        top = floor - step_rise * (k + 1)
        y = -yo - 0.02 - run / 2 - run * k
        half_log(V(-0.65, y, top), V(0.65, y, top), run / 2, tone(C["guestLog"], 40.0 + k), C["guestLogEnd"], pieces,
                 grain=0.7)
        if top - run / 2 > 0.05:
            for x in (-0.48, 0.48):
                pieces.append((log(V(x, y, -0.1), V(x, y, top - run / 2 + 0.03), 0.06, segments=8), C["logDark"], UP * 0.6))
    steps_end = -yo - 0.02 - run * treads
    # The gables over the front and back walls, boarded pale and patterned with chevrons, a small
    # window in each.
    gable_colour, chevron = L.hex_color(s["gable"]), L.hex_color(s["chevron"])
    rise = ridge - eave
    wz = eave + rise * 0.42
    for sign in (-1.0, 1.0):
        # Its face as far out as the logs' middles, reaching back into the wall.
        y_face = sign * (yo + 0.1)
        # A real window through it, its frame lapping over the hole's edges, so from inside the room
        # (open up to the roof) it shows the night as the walls' windows do.
        pieces.append((gable_bm(y_face if sign < 0 else y_face - 0.18, xo, eave - 0.02, ridge - 0.04, 0.18,
                                hole=(wz, 0.27)), gable_colour))
        out = V(0.0, sign, 0.0)
        face_y = y_face + sign * 0.012
        for k in range(5):
            inset = 0.26 + 0.22 * k
            top_z = ridge - 0.04 - inset / math.cos(pitch) - 0.1
            half = (top_z - eave) / math.tan(pitch)
            if half < 0.25:
                continue
            for sx in (-1.0, 1.0):
                p, q = V(0.0, face_y, top_z), V(sx * half, face_y, eave + 0.06)
                pieces.append((oriented_box((p + q) / 2, q - p, out, ((q - p).length, 0.012, 0.045)), chevron))
        for c, size in ((V(0.0, y_face + sign * 0.03, wz + 0.29), (0.68, 0.05, 0.08)),
                        (V(0.0, y_face + sign * 0.03, wz - 0.29), (0.68, 0.05, 0.08)),
                        (V(-0.3, y_face + sign * 0.03, wz), (0.08, 0.05, 0.5)),
                        (V(0.3, y_face + sign * 0.03, wz), (0.08, 0.05, 0.5))):
            pieces.append((P.box_bm(c, size), C["frame"]))
        panes.append((pane(V(0.0, y_face + sign * 0.022, wz), V(1, 0, 0), out, 0.54, 0.54), C["glass"]))
        for c, size in ((V(0.0, y_face + sign * 0.03, wz), (0.03, 0.03, 0.5)), (V(0.0, y_face + sign * 0.03, wz), (0.5, 0.03, 0.03))):
            pieces.append((P.box_bm(c, size), C["frame"]))
    # The roof: two slabs under rows of wooden shingles stepping down them, a window lying in the right
    # slope, a log along the ridge, and bargeboards along its gable ends crossing at the top.
    length = (xo + over) / math.cos(pitch) + 0.06
    depth = 2 * (yo + gable_over)
    thick = 0.12
    far = []
    for sx in (-1.0, 1.0):
        down = V(sx * math.cos(pitch), 0.0, -math.sin(pitch))
        normal = V(sx * math.sin(pitch), 0.0, math.cos(pitch))
        top_edge = V(0.0, 0.0, ridge) - down * 0.06
        centre = top_edge + down * (length / 2) + normal * (thick / 2)
        far.append((oriented_box(centre, down, V(0, 1, 0), (length, depth, thick)), roof_colour))
        # The window in the right slope goes through it: a hole `hole_s` down the slope and `hole_y`
        # along it (each from, to), under a frame round it.
        hole_s = (length * 0.5 - 0.3, length * 0.5 + 0.3) if sx > 0 else None
        hole_y = (0.45, 0.95)

        def slab_piece(s0, s1, y0, y1):
            mid = top_edge + down * ((s0 + s1) / 2) + V(0.0, (y0 + y1) / 2, 0.0) + normal * (thick / 2)
            pieces.append((oriented_box(mid, down, V(0, 1, 0), (s1 - s0, y1 - y0, thick)), roof_colour))

        if hole_s:
            slab_piece(0.0, hole_s[0], -depth / 2, depth / 2)
            slab_piece(hole_s[1], length, -depth / 2, depth / 2)
            slab_piece(hole_s[0], hole_s[1], -depth / 2, hole_y[0])
            slab_piece(hole_s[0], hole_s[1], hole_y[1], depth / 2)
        else:
            slab_piece(0.0, length, -depth / 2, depth / 2)
        shingle_rows(top_edge, down, normal, length, depth, thick, roof_colour, pieces,
                     hole=(hole_s, hole_y) if hole_s else None, seed=sx * 100.0)
        # Its underside boarded dark wood all over, under the eaves as well as over the room, a
        # centimetre clear of the slab; the window's hole goes through it too.
        def lining_piece(s0, s1, y0, y1):
            mid = top_edge + down * ((s0 + s1) / 2) + V(0.0, (y0 + y1) / 2, 0.0) - normal * 0.02
            pieces.append((oriented_box(mid, down, V(0, 1, 0), (s1 - s0, y1 - y0, 0.02)), C["guestRoofIn"], V(0.0, 0.8, 0.0)))

        under = length - 0.01
        if hole_s:
            lining_piece(0.0, hole_s[0], -depth / 2, depth / 2)
            lining_piece(hole_s[1], under, -depth / 2, depth / 2)
            lining_piece(hole_s[0], hole_s[1], -depth / 2, hole_y[0])
            lining_piece(hole_s[0], hole_s[1], hole_y[1], depth / 2)
        else:
            lining_piece(0.0, under, -depth / 2, depth / 2)
        if hole_s:
            # The frame stands over the shingles round the hole, lapping 1 cm in over it.
            c = top_edge + down * (length * 0.5) + V(0.0, 0.7, 0.0) + normal * (thick + 0.075)
            for at, size in ((down * 0.35, (0.12, 0.72, 0.1)), (down * -0.35, (0.12, 0.72, 0.1)),
                             (V(0.0, 0.3, 0.0), (0.58, 0.12, 0.1)), (V(0.0, -0.3, 0.0), (0.58, 0.12, 0.1))):
                pieces.append((oriented_box(c + at, down, V(0, 1, 0), size), C["frame"]))
            panes.append((pane(c + normal * 0.04, down, normal, 0.66, 0.56), C["glass"]))
            for k in (-1, 1):
                pieces.append((oriented_box(c + normal * 0.06 + down * (0.11 * k), V(0, 1, 0), normal, (0.62, 0.03, 0.02)),
                               C["frame"]))
                pieces.append((oriented_box(c + normal * 0.06 + V(0.0, 0.093 * k, 0.0), down, normal, (0.72, 0.03, 0.02)),
                               C["frame"]))
        # The bargeboards, a little way out from the slab's ends, covering them and the shingles' ends;
        # each runs on past the ridge to cross the other, the right one a centimetre further out so the
        # two never share a face.
        ext = 0.22
        for sy in (-1.0, 1.0):
            c = top_edge + down * ((length + 0.02 - ext) / 2) + normal * ((thick + 0.06 - 0.07) / 2) \
                + V(0.0, sy * (depth / 2 + 0.03 + (0.012 if sx > 0 else 0.0)), 0.0)
            pieces.append((oriented_box(c, down, V(0, 1, 0), (length + 0.02 + ext, 0.05, thick + 0.13)),
                           tone(C["guestLog"], 70.0 + sx + 3.0 * sy), down * 0.6))
    pieces.append((log(V(0.0, -yo - gable_over - 0.05, ridge + 0.05), V(0.0, yo + gable_over + 0.05, ridge + 0.05), 0.09,
                       segments=10), C["logDark"], V(0.0, 0.6, 0.0)))
    # Overhead inside, the roof's dark boards (their rows drawn across them) on rafters, a beam along
    # the ridge, and the gables' insides boarded dark round their windows, shutting the room in up to
    # the roof.
    in_y = yo - 0.08 - 0.012
    s_end = xo / math.cos(pitch) + 0.06
    for sx in (-1.0, 1.0):
        down = V(sx * math.cos(pitch), 0.0, -math.sin(pitch))
        normal = V(sx * math.sin(pitch), 0.0, math.cos(pitch))
        top_edge = V(0.0, 0.0, ridge) - down * 0.06
        boards = int(s_end / 0.3)
        for k in range(1, boards):
            inside.append((quad(top_edge + down * (s_end * k / boards) - normal * 0.032, V(0, 1, 0), -normal,
                                2 * in_y - 0.02, PEN), C["guestRafter"]))
        for y in (-1.8, -0.6, 0.6, 1.8):
            c = top_edge + down * (s_end / 2 + 0.03) - normal * 0.085 + V(0.0, y, 0.0)
            inside.append((oriented_box(c, down, V(0, 1, 0), (s_end - 0.06, 0.08, 0.1)), C["guestRafter"], down * 0.8))
    inside.append((log(V(0.0, -in_y, ridge - 0.13), V(0.0, in_y, ridge - 0.13), 0.08, segments=10), C["guestRafter"],
                   V(0.0, 0.8, 0.0)))
    apex = ridge - 0.02 / math.cos(pitch)
    for sign in (-1.0, 1.0):
        inside.append((gable_bm(-in_y if sign < 0 else in_y - 0.02, (apex - eave + 0.02) / math.tan(pitch), eave - 0.02, apex,
                                0.02, hole=(wz, 0.27)), C["guestRoofIn"], V(0.8, 0.0, 0.0)))
    # Inside, nothing but a red hammock slung from wall to wall before the window opposite the door,
    # its hooks in the logs, and a paper lantern hanging from the ridge's beam over the middle of the
    # room, lit at night.
    hammock(-xi + 0.08, xi - 0.08, yi - 0.6, floor + 1.75, floor + 1.15, 0.75, inside)
    paper_lantern(0.0, -0.4, ridge - 0.2, floor + 2.25, pieces, glow)
    far += [wall.far(C["guestBoard"] if boarded and wall in (left, right) else C["guestLog"]) for wall in walls]
    for sign in (-1.0, 1.0):
        far.append((gable_bm(sign * (yo + 0.1) - (0.2 if sign > 0 else 0.0), xo, eave - 0.02, ridge - 0.04, 0.2), gable_colour))
    far.append((P.box_bm(V(0.0, 0.0, (floor - 0.3) / 2), (2 * xo, 2 * yo, floor + 0.3)), C["logDark"]))

    # Its wood painted as 島二郎's is: the logs, the boards, the shingles (painted where the roof is a
    # colour of its own), the gables' paint and their chevrons.
    import paintmap as PM
    painter = PM.Painter(name)
    roofed = {"painted": (roof_colour, gable_colour, chevron)} if s.get("roof_paint") else \
        {"bare": (roof_colour,), "painted": (gable_colour, chevron)}
    body = painter.join(name, pieces, collection, sharp=P.SHARP, auto=wood_auto(True, coarse=(roof_colour,), **roofed))
    lights = P.join(f"{name}_lamp", glow, collection)
    glass = P.join(f"{name}_pane", panes, collection)
    room = painter.join(f"{name}_inside", inside, collection, sharp=P.SHARP, auto=wood_auto(False))
    distant = P.join(f"{name}_far", far, collection, sharp=P.SHARP)
    blocks = [
        block_box(-xo, xo, yi, yo, -10, eave), block_box(-xo, -door, -yo, -yi, -10, eave),
        block_box(door, xo, -yo, -yi, -10, eave), block_box(-xo, -xi, -yo, yo, -10, eave),
        block_box(xi, xo, -yo, yo, -10, eave),
        block_box(-xo, xo, -yo, yo, -10, floor - 0.16, camera=False),
        block_box(-xo - over, xo + over, -yo - gable_over, yo + gable_over, eave - 0.05, ridge + 0.1, walk=False),
        block_box(leaf_x - 0.05, leaf_x + 0.05, leaf_y - 0.46, leaf_y + 0.46, floor - 0.1, floor + 1.85, camera=False),
        block_box(-0.75, -0.62, steps_end, -yo, -0.2, floor, camera=False),
        block_box(0.62, 0.75, steps_end, -yo, -0.2, floor, camera=False),
    ]
    decks = [deck_box(-xi, xi, -yo - 0.02, yi, floor), deck_box(-0.6, 0.6, steps_end, -yo - 0.02, floor, 0.02)]
    info = {"blocks": blocks, "decks": decks, "height": ridge + 0.2, "openings": openings_of(walls)}
    info.update(bake_night(name, [body, room], lights, info["openings"]))
    info.update(painter.finish(P.OUT_MODELS))
    return [body, lights, glass, room, distant], info


# ---------------------------------------------------------------------------- the stage
def build_stage(collection):
    """The village's watchtower stage, where announcements are made, after the film's: four
    squared timber legs splaying out to the ground, each side braced with two tiers of crossed
    planks over cross beams; a plank platform on a thick rim of two boards, open all round (the
    film's has no railing); four posts leaning out from its corners to a tall conical thatched roof
    twice as wide as the tower; and stairs up its back. Its front faces the plaza (-Y)."""
    top = 3.6                       # the platform's floor
    deck = 1.6                      # its half width
    leg_top, leg_foot = 1.45, 1.8   # the legs' half spread under the platform, and at the ground
    post_top = 1.9                  # the roof posts' half spread under the roof
    eave = 5.15                     # the roof's underside
    beams = (0.3, 1.75, top - 0.34)  # the cross beams' heights; the crossed planks between them
    pieces = []

    def timber(a, b, across, size, colour):
        """A squared beam from a to b, `size` (thick, wide), its thickness along `across`."""
        pieces.append((oriented_box((a + b) / 2, b - a, across, ((b - a).length, *size)), colour))

    def leg(sx, sy, z):
        """Where the leg at corner (sx, sy) stands at height z."""
        f = (z + 0.3) / (top + 0.25)
        spread = leg_foot + (leg_top - leg_foot) * f
        return V(sx * spread, sy * spread, z)

    corners = [(-1, -1), (1, -1), (1, 1), (-1, 1)]
    for sx, sy in corners:
        timber(leg(sx, sy, -0.3), leg(sx, sy, top - 0.05), V(1, 0, 0), (0.22, 0.22), C["log"])
    for (ax, ay), (bx, by) in zip(corners, corners[1:] + corners[:1]):
        out = V((ax + bx) / 2, (ay + by) / 2, 0.0).normalized()
        for z in beams:
            p, q = leg(ax, ay, z) + out * 0.14, leg(bx, by, z) + out * 0.14
            along = (q - p).normalized()
            timber(p - along * 0.12, q + along * 0.12, out, (0.07, 0.24), C["logDark"])
        for z0, z1 in zip(beams, beams[1:]):
            for (pa, za), (pb, zb) in (((ax, ay), z0), ((bx, by), z1)), (((bx, by), z0), ((ax, ay), z1)):
                timber(leg(*pa, za) + out * 0.11, leg(*pb, zb) + out * 0.11, out, (0.06, 0.26), C["plank"])
    # The platform: its floor of planks on a thick rim of two boards.
    pieces.append((P.box_bm(V(0.0, 0.0, top - 0.08), (2 * deck, 2 * deck, 0.16)), C["floor"]))
    for k in range(1, 6):
        x = -deck + 2 * deck * k / 6
        pieces.append((P.box_bm(V(x, 0.0, top + 0.002), (PEN, 2 * deck - 0.04, 0.01)), C["floorLine"]))
    for z, colour in ((top - 0.2, C["plank"]), (top - 0.4, C["log"])):
        for s in (-1.0, 1.0):
            pieces.append((P.box_bm(V(0.0, s * (deck + 0.03), z), (2 * deck + 0.14, 0.08, 0.19)), colour))
            pieces.append((P.box_bm(V(s * (deck + 0.03), 0.0, z), (0.08, 2 * deck + 0.14, 0.19)), colour))
    # The roof's posts, leaning out from the platform's corners, and beams across under the roof.
    def post(sx, sy, z):
        f = (z - top) / (eave + 0.05 - top)
        spread = leg_top + (post_top - leg_top) * f
        return V(sx * spread, sy * spread, z)

    for sx, sy in corners:
        timber(post(sx, sy, top), post(sx, sy, eave + 0.05), V(1, 0, 0), (0.18, 0.18), C["log"])
    for (ax, ay), (bx, by) in zip(corners, corners[1:] + corners[:1]):
        out = V((ax + bx) / 2, (ay + by) / 2, 0.0).normalized()
        timber(post(ax, ay, eave - 0.15), post(bx, by, eave - 0.15), out, (0.14, 0.2), C["logDark"])
    # Stairs down the back: two stringers and treads.
    y0, y1 = deck, 6.6
    for x in (0.3, 1.3):
        pieces.append((log(V(x, y0, top + 0.05), V(x, y1, -0.1), 0.08), C["logDark"]))
    steps = 12
    for i in range(1, steps):
        f = i / steps
        pieces.append((P.box_bm(V(0.8, y0 + (y1 - y0) * f, top * (1 - f) - 0.04), (1.0, 0.32, 0.07)), C["plank"]))
    # The roof: a tall straw cone, its brim twice as wide as the tower.
    pieces.append(lathe_roof([(0.0, eave), (2.8, eave), (3.25, eave - 0.1), (3.4, eave + 0.08), (3.25, eave + 0.28),
                              (2.4, eave + 1.1), (1.5, eave + 1.95), (0.6, eave + 2.65), (0.0, eave + 2.95)],
                             V(0.0, 0.0, 0.0), samples=14, seed=1.3))
    # Its wood painted as 島二郎's is (see wood_auto).
    import paintmap as PM
    painter = PM.Painter("stage")
    body = painter.join("stage", pieces, collection, sharp=P.SHARP, grained=False, auto=wood_auto(True))
    blocks = [{"circle": [*g(sx * leg_foot, sy * leg_foot), 0.22], "y": [-10, top], "walk": True, "camera": True}
              for sx, sy in corners]
    blocks += [{"circle": [*g(sx * 1.55, sy * 1.55), 0.15], "y": [top, eave], "walk": True, "camera": True}
               for sx, sy in corners]
    # The platform keeps whoever stands on it from stepping off its edge, open at the top of the
    # stairs, though it has no railing to see.
    edge = (top - 0.3, top + 1.0)
    blocks += [
        block_box(-1.85, 1.85, -1.85, 1.85, -10, top - 0.4),
        block_box(-deck, deck, -deck, -deck + 0.1, *edge, camera=False),
        block_box(-deck, -deck + 0.1, -deck, deck, *edge, camera=False),
        block_box(deck - 0.1, deck, -deck, deck, *edge, camera=False),
        block_box(-deck, 0.3, deck - 0.1, deck, *edge, camera=False),
        block_box(1.3, deck, deck - 0.1, deck, *edge, camera=False),
        block_box(0.25, 0.35, deck, y1, 0.35, top + 0.2, camera=False),
        block_box(1.25, 1.35, deck, y1, 0.35, top + 0.2, camera=False),
        {"circle": [0.0, 0.0, 3.4], "y": [eave - 0.1, eave + 3.0], "walk": False, "camera": True},
    ]
    # The stairs rise toward the tower: from the ground at Blender y1 (the deck's back edge in the
    # game's frame) to the platform at y0 (its front edge), reaching a little onto the platform so
    # there is no gap between them.
    stairs = deck_box(0.35, 1.25, y0 - 0.15, y1, 0.02, top)
    decks = [deck_box(-deck, deck, -deck, deck, top), stairs]
    return [body], {"blocks": blocks, "decks": decks, "height": eave + 2.95, **painter.finish(P.OUT_MODELS)}


def flame_pieces(foot, height, width, tongues=4):
    """A big cartoon flame as the film draws its torches' fire: a pale yellow heart at `foot` and
    tongues of fire rising from it, the middle one the tallest, the others leaning out round it, each
    deepening to orange toward its tip. Returns (bmesh, colours) pieces, coloured vertex by vertex by
    how high up the flame each vertex is; the game reads that from the colours, to make the tips
    flicker."""
    stops = [(0.0, L.hex_color("#FFF3B8")), (0.4, L.hex_color("#FFD45A")), (0.7, L.hex_color("#FF9A3C")),
             (1.0, L.hex_color("#FF6A22"))]

    def colour(z):
        t = min(max((z - foot.z) / height, 0.0), 1.0)
        for (t0, c0), (t1, c1) in zip(stops, stops[1:]):
            if t <= t1:
                k = (t - t0) / (t1 - t0)
                return tuple(c0[i] + (c1[i] - c0[i]) * k for i in range(3))
        return stops[-1][1]

    def coloured(bm):
        return bm, [colour(v.co.z) for v in bm.verts]

    pieces = []
    heart = L.Profile([(0.0, 0.0), (width * 0.46, 0.1), (width * 0.5, 0.26), (width * 0.38, 0.46), (0.0, 0.58)], samples=6)
    bm = L.lathe_bm(heart.samples, segments=10)
    L.transformed(bm, Matrix.Translation(foot))
    pieces.append(coloured(bm))
    for k in range(tongues):
        middle = k == 0
        h = height * (1.0 if middle else 0.7 + 0.1 * (k % 2))
        r = width * (0.42 if middle else 0.3)
        tongue = L.Profile([(0.0, 0.0), (r * 0.75, h * 0.14), (r, h * 0.36), (r * 0.8, h * 0.58), (r * 0.36, h * 0.82),
                            (0.0, h)], samples=6)
        bm = L.lathe_bm(tongue.samples, segments=8)
        if not middle:
            a = 2.0 * math.pi * (k - 1) / (tongues - 1) + 0.4
            lean = Matrix.Rotation(0.3, 4, V(math.cos(a + math.pi / 2), math.sin(a + math.pi / 2), 0.0))
            L.transformed(bm, Matrix.Translation(V(math.cos(a) * width * 0.14, math.sin(a) * width * 0.14, 0.04)) @ lean)
        L.transformed(bm, Matrix.Translation(foot))
        pieces.append(coloured(bm))
    return pieces


def build_torch(collection):
    """A tiki torch: a pole with a woven cup on top, its big cartoon flame lit only at night."""
    pieces = [(log(V(0.0, 0.0, -0.2), V(0.0, 0.0, 1.85), 0.05, segments=6), C["torch"])]
    cup = L.Profile([(0.0, 1.78), (0.1, 1.8), (0.16, 2.0), (0.15, 2.05), (0.0, 2.0)], samples=6)
    pieces.append((L.lathe_bm(cup.samples, segments=8), C["basket"]))
    import paintmap as PM
    painter = PM.Painter("torch")
    body = painter.join("torch", pieces, collection, sharp=P.SHARP, grained=False, auto=wood_auto(True))
    fire = P.join("torch_flame", flame_pieces(V(0.0, 0.0, 1.98), 1.0, 0.56), collection)  # lit at night
    return [body, fire], {"footprint": {"circle": 0.15}, "height": 3.0, **painter.finish(P.OUT_MODELS)}


# ---------------------------------------------------------------------------- the festival street
def flower_bm(centre, normal, radius):
    """A yellow flower of five broad, round petals facing `normal`, with an orange middle, as the
    film's arch is wreathed in."""
    n = normal.normalized()
    side = n.cross(UP if abs(n.z) < 0.9 else Vector((1.0, 0.0, 0.0))).normalized()
    other = n.cross(side)
    petals = bmesh.new()
    hub = petals.verts.new(centre)
    ring, count = [], 30
    for i in range(count):
        a = 2.0 * math.pi * i / count
        r = radius * (0.68 + 0.32 * math.cos(2.5 * a) ** 2)
        ring.append(petals.verts.new(centre + side * (math.cos(a) * r) + other * (math.sin(a) * r)))
    for i in range(count):
        petals.faces.new((hub, ring[i], ring[(i + 1) % count]))
    petals.normal_update()
    if petals.faces[:][0].normal.dot(n) < 0:
        bmesh.ops.reverse_faces(petals, faces=petals.faces[:])
    middle = L.ellipsoid_bm(centre + n * 0.02, (radius * 0.28,) * 3, u=5, v=3)
    return [(petals, C["flower"]), (middle, C["flowerCentre"])]


def arc_strip(x_half, z_mid, z_end, height, y, thickness, segments=16):
    """A long board (or cloth) bending through x from -x_half to x_half, its middle at z_mid and its
    ends at z_end: arching when the middle is higher, sagging when lower. Returns the solid strip
    and a function giving its centre line's height at x."""
    def mid_z(x):
        return z_end + (z_mid - z_end) * (1.0 - (x / x_half) ** 2)

    bm = bmesh.new()
    rows = []
    for i in range(segments + 1):
        x = -x_half + 2 * x_half * i / segments
        z = mid_z(x)
        rows.append([bm.verts.new((x, y + dy, z + dz)) for dy, dz in
                     ((-thickness / 2, height / 2), (thickness / 2, height / 2),
                      (thickness / 2, -height / 2), (-thickness / 2, -height / 2))])
    for a, b in zip(rows, rows[1:]):
        for k in range(4):
            bm.faces.new((a[k], a[(k + 1) % 4], b[(k + 1) % 4], b[k]))
    bm.faces.new(list(reversed(rows[0])))
    bm.faces.new(rows[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    return bm, mid_z


def arc_label(x_half, mid_z, height, y, name, collection, segments=16, inset=0.92):
    """A face for painted words following a bent board, facing -Y, its UVs across and down it."""
    bm = bmesh.new()
    uvs, top, bottom = [], [], []
    for row, (rows, v) in enumerate(((top, 0.0), (bottom, 1.0))):
        for i in range(segments + 1):
            f = i / segments
            x = (-x_half + 2 * x_half * f) * inset
            z = mid_z(x / inset) + (height / 2 if row == 0 else -height / 2)
            rows.append(bm.verts.new((x, y, z)))
            uvs.append((f, v))
    for i in range(segments):
        bm.faces.new((top[i], bottom[i], bottom[i + 1], top[i + 1]))
    bm.normal_update()
    if bm.faces[:][0].normal.y > 0:
        bmesh.ops.reverse_faces(bm, faces=bm.faces[:])
    return P.object_with_uv(name, bm, uvs, collection)


def tie_rope(end, pole, pole_radius, pieces):
    """A rope from `end` (a banner's corner) to the pole whose middle is at `pole` (at the height
    the rope is tied), wound round the pole there."""
    out = Vector((end.x - pole.x, end.y - pole.y, 0.0))
    out = out.normalized() if out.length > 1e-6 else Vector((1.0, 0.0, 0.0))
    pieces.append((log(end, pole + out * pole_radius, 0.02, segments=5), C["rope"]))
    wound = pole_radius + 0.018
    pieces.append((P.segment_bm(pole - V(0, 0, 0.04), pole + V(0, 0, 0.04), wound, wound, segments=8), C["rope"]))


def lantern_stack(x, y, z0, count, glow, pieces):
    """Paper lanterns stacked on a pole, pink, lit at night."""
    for k in range(count):
        c = V(x, y, z0 + k * 0.36)
        glow.append((L.ellipsoid_bm(c, (0.17, 0.17, 0.16), u=10, v=6), C["lantern"]))
        pieces.append((P.segment_bm(c - V(0, 0, 0.17), c - V(0, 0, 0.13), 0.09, 0.09, 8), C["frame"]))


def build_arch(collection):
    """The welcome arch over the festival street, after the film's: two tall poles with gold balls
    and ribbons, a deep arching wooden board for 島へようこそ!! across their tops (a fifth as deep as
    it is long, its top level with the poles' at its middle), wreathed in big yellow flowers that
    climb down the poles, a white banner hung below it, narrower than the arch and tied to the poles
    by ropes at its corners, and pink paper lanterns stacked on the poles below the flowers."""
    half, pole_h = 4.4, 6.41
    pieces, glow = [], []
    for s in (-1.0, 1.0):
        x = s * half
        pieces.append((log(V(x, 0.0, -0.3), V(x, 0.0, pole_h), 0.1, segments=8), C["torch"]))
        pieces.append((L.ellipsoid_bm(V(x, 0.0, pole_h + 0.12), (0.16, 0.16, 0.16), u=10, v=7), C["gold"]))
        for k, colour in enumerate((C["red"], C["pink"], C["white"], C["red"])):
            a = s * (0.25 + 0.18 * k)
            tip = V(x + math.sin(a) * 0.5, -0.05 - 0.02 * k, pole_h - 0.15 - math.cos(a) * 1.1)
            base = V(x, -0.08, pole_h - 0.05)
            pieces.append((oriented_box((base + tip) / 2, tip - base, V(0, 1, 0), ((tip - base).length, 0.015, 0.09)),
                           colour))
        lantern_stack(s * (half + 0.24), 0.0, 2.21, 5, glow, pieces)
    board_half, board_h = 4.25, 1.7
    board_mid, board_end = pole_h - board_h / 2 + 0.1, pole_h - board_h / 2 - 0.28
    board, board_z = arc_strip(board_half, board_mid, board_end, board_h, 0.0, 0.1)
    pieces.append((board, C["board"]))
    for dz in (board_h / 2, -board_h / 2):
        edge, _ = arc_strip(board_half, board_mid + dz, board_end + dz, 0.04, -0.06, 0.02)
        pieces.append((edge, C["boardEdge"]))
    # Garlands of big yellow flowers packed along the board's edges, two deep along its top, with
    # leaves among them; clustered over the board's ends and trailing down the poles.
    front = V(0.0, -1.0, 0.0)
    k = 0

    def flower(at, r, tilt):
        nonlocal k
        pieces.extend(flower_bm(at, front + tilt, r))
        side = 1.0 if k % 2 else -1.0
        leaf = at + V(0.17 * side, 0.04, -0.1)
        pieces.append((L.ellipsoid_bm(leaf, (0.17, 0.03, 0.08), u=5, v=3), C["vine"]))
        k += 1

    for dz, shift in ((board_h / 2 - 0.05, 0.0), (board_h / 2 + 0.15, 0.15), (-board_h / 2 + 0.02, 0.07)):
        x = -board_half + shift
        while x <= board_half:
            z = board_z(x) + dz + 0.05 * math.sin(k * 2.3)
            flower(V(x, -0.12 - 0.03 * (k % 2), z), 0.24 + 0.05 * math.sin(k * 1.7),
                   V(0.15 * math.sin(k), 0.0, 0.25 * math.cos(k * 1.3)))
            x += 0.3
    ends = board_end - board_h / 2
    for s in (-1.0, 1.0):
        for i in range(6):
            flower(V(s * (board_half - 0.08 * (i % 2)), -0.16, board_end + board_h / 2 - 0.15 - i * 0.28),
                   0.22 + 0.03 * math.sin(i), V(-s * 0.3, 0.0, 0.1))
        for i in range(5):
            flower(V(s * (half - 0.16 + 0.1 * (i % 2)), -0.16, ends - 0.12 - i * 0.24),
                   0.19 + 0.03 * math.sin(i), V(-s * 0.4, 0.0, 0.1))
    # The banner, a fifth as deep as it is long, hung below the board and tied to the poles.
    banner_half, banner_h, banner_mid, banner_end = 3.2, 1.3, 3.41, 3.51
    banner, banner_z = arc_strip(banner_half, banner_mid, banner_end, banner_h, 0.05, 0.03)
    pieces.append((banner, C["white"]))
    for s in (-1.0, 1.0):
        for corner, tied in ((banner_end + banner_h / 2 - 0.05, banner_end + banner_h / 2 + 0.2),
                             (banner_end - banner_h / 2 + 0.05, banner_end - banner_h / 2 - 0.15)):
            tie_rope(V(s * banner_half, 0.05, corner), V(s * half, 0.0, tied), 0.1, pieces)
    # Its poles bare wood, its board painted, as 島二郎's are (see wood_auto).
    import paintmap as PM
    painter = PM.Painter("arch")
    body = painter.join("arch", pieces, collection, sharp=P.SHARP, grained=False, auto=wood_auto(True))
    lights = P.join("arch_glow", glow, collection)
    board_label = arc_label(board_half, board_z, 1.1, -0.06, "arch_label", collection)
    banner_label = arc_label(banner_half, banner_z, 0.95, 0.03, "arch_label1", collection)
    labels = [{"size": [round(2 * board_half * 0.92, 2), 1.1], "colour": "#5A3A2E"},
              {"size": [round(2 * banner_half * 0.92, 2), 0.95], "colour": "#E8679A"}]
    blocks = [{"circle": [*g(s * half, 0.0), 0.2], "y": [-10, pole_h], "walk": True, "camera": True} for s in (-1, 1)]
    return [body, lights, board_label, banner_label], {"blocks": blocks, "labels": labels, "height": pole_h + 0.3,
                                                       **painter.finish(P.OUT_MODELS)}


def build_banner(collection):
    """A white cloth banner across the festival street for words in pink, after the film's:
    narrower than the street and deeper than a strip, its middle sagging a little, tied by ropes at
    its corners to the tall poles at the stalls' fronts on either side (the bunting's along the
    street, build_village.py)."""
    poles, pole_r = 4.3, 0.06
    half, height, mid, end = 3.3, 1.0, 3.51, 3.61
    pieces = []
    cloth, cloth_z = arc_strip(half, mid, end, height, 0.0, 0.03)
    pieces.append((cloth, C["white"]))
    for s in (-1.0, 1.0):
        for corner, tied in ((end + height / 2 - 0.05, 4.41), (end - height / 2 + 0.05, 3.01)):
            tie_rope(V(s * half, 0.0, corner), V(s * poles, 0.0, tied), pole_r, pieces)
    body = P.join("banner", pieces, collection, sharp=P.SHARP)
    label = arc_label(half, cloth_z, 0.75, -0.02, "banner_label", collection)
    return [body, label], {"labels": [{"size": [round(2 * half * 0.92, 2), 0.75], "colour": "#E8679A"}],
                           "height": 4.46}


def build_lantern_pole(collection):
    """A pole with pink paper lanterns stacked on it, lit at night."""
    pieces, glow = [(log(V(0.0, 0.0, -0.3), V(0.0, 0.0, 2.7), 0.06, segments=6), C["torch"])], []
    lantern_stack(0.0, -0.15, 1.35, 3, glow, pieces)
    body = P.join("lanterns", pieces, collection, sharp=P.SHARP)
    lights = P.join("lanterns_glow", glow, collection)
    return [body, lights], {"footprint": {"circle": 0.15}, "height": 2.8}
