"""Houses you can walk into, the village's watchtower stage, and the festival street's arch and
banners, after the film's village and festival frames (reference images `Screenshot 2026-10-17
103834`, `103927`, `104000`, `104329`, `104338`, `103743`, `103757`, `104155`).

Walls are solid slabs round their openings (doorways and windows), each with an outer skin of
planks and an inner skin of logs, so the pen's outline (an inverted hull) works from inside a room
as from outside it: a closed box would turn to ink all round anyone standing in it.

Each house comes in parts: its body, the windows that light up at night (`_glow`), its room's
inside (`_inside`, drawn only near), and a light version of its roof and walls for seeing from
afar (`_far`). Coordinates are Blender's: Z up, each building faces -Y and stands on its origin.
What each tells the game is in the game's frame (x across, z toward the front, y up), which is
Blender's (x, -y, z): `blocks` (what stops walkers and the camera, each over a range of heights),
`decks` (floors, porches and stairs to walk on; a deck with `front` rises or falls to that height at
its front edge, like a ramp) and `labels` (faces for painted words).
"""

import math

import bmesh
from mathutils import Matrix, Vector

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
    "mat": "#D9BE84",
    "matLine": "#B7965E",
    "cloth": "#E07B6E",
    "clothDark": "#C2615A",
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
    # 島二郎's ramen: bean sprouts and cabbage heaped high, slices of pork, garlic; its stockpots, the
    # cloth curtain over its front and the red paper lanterns either side.
    "sprouts": "#F1E9C4",
    "cabbage": "#A6CC6E",
    "pork": "#B9784E",
    "porkDark": "#8E5536",
    "soup": "#D9A65A",
    "steel": "#B9BEC2",
    "steelDark": "#8D9398",
    "noren": "#34507A",
    "norenLight": "#F3EAD6",
    "chochin": "#E0503E",
    "chochinBand": "#3A2A22",
    # The guest houses: pale logs, the doors' light planks and diamond windows, and a red hammock.
    "guestLog": "#E3C28B",
    "guestLogDark": "#B08A55",
    "guestLogEnd": "#F4DFB5",
    "guestDoor": "#D7AD74",
    "guestDoorLine": "#A97B47",
    "doorGlass": "#9FD3E6",
    "hammock": "#D9566B",
    "hammockDark": "#B4425A",
    # The rooms' furnishing: stone and clay, bamboo, rattan, cloth and the books' bindings.
    "stone": "#A8A196",
    "stoneDark": "#6F6A63",
    "clayDark": "#8C4A33",
    "bamboo": "#A9BE62",
    "bambooDark": "#7E9445",
    "iron": "#3E3733",
    "water": "#86BFD8",
    "rattan": "#CDA36B",
    "rattanLine": "#9C7A47",
    "blanket": "#4F86B0",
    "blanketStripe": "#F3E7CF",
    "cushion": "#E5A13B",
    "paperLantern": "#FFD9A0",
    "book1": "#C8553D",
    "book2": "#4E7FB5",
    "book3": "#6FA35A",
    "book4": "#D9A441",
    "book5": "#E9E1CF",
    "book6": "#8E5A9E",
    # The porches' potted plants, and the doors' handles.
    "succulent": "#B7A88E",
    "rosette": "#7FB069",
    "thistle": "#B04BA8",
    "handle": "#4A3426",
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

    def window(self, opening, glow):
        """A window in one of the wall's openings, as the film's: a heavy board frame with a deep
        sill outside, green panes that light up at night with two thin bars down them, a double
        white zigzag over them outside and a cross frame inside."""
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
        glow.append((oriented_box(self.point(uc, vc, self.t / 2), self.d, self.inward, (w + 2 * e, 0.02, h + 2 * e)),
                     C["glass"]))
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
def lathe_roof(ctrl, centre, samples=14, segments=20, seed=0.0):
    """A thatched roof turned round its middle from (radius, height) points: dark underneath,
    straw above in soft radial streaks, lighter toward its crown."""
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
        c = C["thatch"] if streak < 0.62 else C["thatchDark"]
        cols.append(C["thatchLight"] if v.co.z > top - 0.6 and streak < 0.45 else c)
    return bm, cols


def hip_roof(x0, x1, y0, y1, eave, edge, ridge_z, ridge_half, subdivide=True):
    """A thatched hip roof over Blender x0..x1, y0..y1: a flat underside at `eave`, a thick eave
    edge up to `edge`, sloping up to a ridge along x at `ridge_z`. A closed solid, for the pen."""
    bm = bmesh.new()
    cy = (y0 + y1) / 2
    low = [bm.verts.new((x, y, eave)) for x, y in ((x0, y0), (x1, y0), (x1, y1), (x0, y1))]
    high = [bm.verts.new((x, y, edge)) for x, y in ((x0, y0), (x1, y0), (x1, y1), (x0, y1))]
    r0, r1 = bm.verts.new((-ridge_half, cy, ridge_z)), bm.verts.new((ridge_half, cy, ridge_z))
    bm.faces.new(list(reversed(low)))
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


def furnish(room, floor, ceiling, glow):
    """A room furnished as an islander's home, in the village's own style: wood, woven straw and
    rattan, clay, stone and bamboo, nothing modern. Along the left wall a wooden bed on legs with a
    woven base, a straw mattress, a pillow, a striped blanket and a headboard, and a chest at its
    foot; on the back wall, beside the window, a plank bookshelf of books, scrolls and a jar; along
    the right wall the kitchen: a clay stove with a pot in the back corner, a plank counter with a
    stone basin for a sink, fed by a bamboo spout from the wall, a shelf of bowls above it and a
    clay water jar at its end; in the front a low round table with a teapot and cups and cushions
    round it on a woven rug, a paper lantern hanging over it that lights up at night, and a potted
    plant by the door. Returns its pieces and the blocks that keep walkers out of it (not the
    camera, which may look over it)."""
    (x0, x1), (y0, y1) = room
    out, blocks = [], []

    def box(c, size, colour, bevel=0.0):
        out.append((P.box_bm(c, size, bevel=bevel), colour))

    def keep_out(bx0, bx1, by0, by1, high):
        blocks.append(block_box(bx0, bx1, by0, by1, floor - 0.1, floor + high, camera=False))

    def keep_out_round(x, y, r, high):
        blocks.append({"circle": [*g(x, y), r], "y": [floor - 0.1, floor + high], "walk": True, "camera": False})

    # The bed, its head to the back wall: a log frame as the island's builders make one, corner
    # posts with round knobs (the head posts tall), rails all round, a headboard of woven rattan
    # framed in logs and a footboard of spindles; on it a thick futon under a patchwork quilt with a
    # sheet turned down over its top edge, two plump pillows and a folded blanket at its foot.
    bx0, bx1, by1 = x0 + 0.06, x0 + 1.06, y1 - 0.06
    by0 = by1 - 1.72
    bx, by = (bx0 + bx1) / 2, (by0 + by1) / 2
    r_post, rail_z = 0.055, floor + 0.24
    head = [(bx0 + r_post, by1 - r_post), (bx1 - r_post, by1 - r_post)]
    foot = [(bx0 + r_post, by0 + r_post), (bx1 - r_post, by0 + r_post)]
    for (px, py), top_z in [(c, floor + 0.88) for c in head] + [(c, floor + 0.6) for c in foot]:
        out.append((log(V(px, py, floor), V(px, py, top_z), r_post, segments=8), C["log"]))
        out.append((L.ellipsoid_bm(V(px, py, top_z + 0.035), (0.072, 0.072, 0.06), u=8, v=5), C["logDark"]))
    for (ax, ay), (cx_, cy_) in ((head[0], head[1]), (foot[0], foot[1]), (head[0], foot[0]), (head[1], foot[1])):
        out.append((log(V(ax, ay, rail_z), V(cx_, cy_, rail_z), 0.045, segments=6), C["log"]))
    box(V(bx, by, rail_z + 0.03), (bx1 - bx0 - 0.1, by1 - by0 - 0.1, 0.03), C["rattan"])
    # The headboard: two log rails with a woven rattan panel between them, its weave crossing.
    hy = by1 - r_post
    for z in (floor + 0.46, floor + 0.82):
        out.append((log(V(bx0 + r_post, hy, z), V(bx1 - r_post, hy, z), 0.042, segments=6), C["log"]))
    box(V(bx, hy, floor + 0.64), (bx1 - bx0 - 0.12, 0.024, 0.34), C["rattan"])
    for k in range(4):
        u0 = bx0 + 0.1 + k * 0.2
        for (ua, za), (ub, zb) in (((u0, floor + 0.48), (u0 + 0.2, floor + 0.8)), ((u0 + 0.2, floor + 0.48), (u0, floor + 0.8))):
            if ub > bx1 - 0.08 or ua > bx1 - 0.08:
                continue
            p, q = V(ua, hy - 0.015, za), V(ub, hy - 0.015, zb)
            out.append((oriented_box((p + q) / 2, q - p, V(0, 1, 0), ((q - p).length, 0.008, 0.022)), C["rattanLine"]))
    # The footboard: a log rail over spindles.
    fy = by0 + r_post
    out.append((log(V(bx0 + r_post, fy, floor + 0.55), V(bx1 - r_post, fy, floor + 0.55), 0.042, segments=6), C["log"]))
    for k in range(1, 6):
        sxk = bx0 + r_post + (bx1 - bx0 - 2 * r_post) * k / 6
        out.append((log(V(sxk, fy, rail_z), V(sxk, fy, floor + 0.55), 0.02, segments=5), C["logDark"]))
    # The futon, the sheet at its head, the quilt, the turned-down sheet, the pillows, the blanket.
    width = bx1 - bx0
    futon = rail_z + 0.22
    box(V(bx, by, rail_z + 0.13), (width - 0.14, by1 - by0 - 0.2, 0.18), C["mat"], bevel=0.07)
    box(V(bx, by1 - 0.45, futon - 0.001), (width - 0.2, 0.62, 0.012), C["cream"])
    qy0, qy1 = by0 + 0.12, by1 - 0.66
    quilt = futon + 0.03
    box(V(bx, (qy0 + qy1) / 2, futon - 0.02), (width - 0.06, qy1 - qy0, 0.1), C["blanket"], bevel=0.035)
    cols, rows = 3, 4
    pw, ph = (width - 0.14) / cols, (qy1 - qy0 - 0.08) / rows
    for r in range(rows):
        for c in range(cols):
            if (r + c) % 2:
                continue
            colour = C["blanketStripe"] if (r // 2 + c) % 2 else C["cushion"]
            box(V(bx0 + 0.07 + pw * (c + 0.5), qy0 + 0.04 + ph * (r + 0.5), quilt + 0.003), (pw - 0.025, ph - 0.025, 0.008),
                colour)
    box(V(bx, qy1 - 0.05, quilt + 0.01), (width - 0.05, 0.13, 0.025), C["cream"], bevel=0.01)
    for sxp, colour in ((-0.22, C["cream"]), (0.22, C["blanketStripe"])):
        out.append((L.ellipsoid_bm(V(bx + sxp, by1 - 0.32, futon + 0.07), (0.2, 0.14, 0.085), u=12, v=7), colour))
    box(V(bx, by0 + 0.34, quilt + 0.045), (width - 0.18, 0.32, 0.08), C["cloth"], bevel=0.03)
    for dy in (-0.08, 0.08):
        box(V(bx, by0 + 0.34 + dy, quilt + 0.087), (width - 0.17, 0.04, 0.006), C["cream"])
    keep_out(bx0, bx1, by0, by1, 0.6)

    # A chest at the bed's foot, its lid's planks drawn on its front.
    cx0, cx1, cy0, cy1 = x0 + 0.14, x0 + 0.94, by0 - 0.52, by0 - 0.07
    cx, cy = (cx0 + cx1) / 2, (cy0 + cy1) / 2
    box(V(cx, cy, floor + 0.2), (cx1 - cx0, cy1 - cy0, 0.4), C["plank"], bevel=0.02)
    box(V(cx, cy, floor + 0.42), (cx1 - cx0 + 0.04, cy1 - cy0 + 0.04, 0.05), C["log"], bevel=0.015)
    for z in (floor + 0.14, floor + 0.28):
        box(V(cx, cy0 - 0.003, z), (cx1 - cx0 - 0.06, 0.006, PEN), C["plankLine"])
    for sx in (cx0 + 0.02, cx1 - 0.02):
        out.append((log(V(sx, cy - 0.08, floor + 0.32), V(sx, cy + 0.08, floor + 0.32), 0.022, segments=5), C["rope"]))
    keep_out(cx0, cx1, cy0, cy1, 0.5)

    # The bookshelf on the back wall, beside the window: three shelves of books, scrolls and a jar.
    sx0, sx1, sy0, sy1 = 0.6, 1.7, y1 - 0.36, y1 - 0.02
    sh = min(1.45, ceiling - floor - 0.35)
    sx, sy = (sx0 + sx1) / 2, (sy0 + sy1) / 2
    for side in (sx0 + 0.03, sx1 - 0.03):
        box(V(side, sy, floor + sh / 2), (0.06, sy1 - sy0, sh), C["plank"])
    box(V(sx, sy1 - 0.015, floor + sh / 2 - 0.005), (sx1 - sx0 - 0.01, 0.03, sh - 0.01), C["logDark"])
    shelves = [floor + 0.04 + (sh - 0.08) * k / 3 for k in range(4)]
    for z in shelves:
        box(V(sx, sy - 0.005, z), (sx1 - sx0 - 0.12, sy1 - sy0 - 0.01, 0.04), C["plank"])
    books = [C[f"book{k}"] for k in range(1, 7)]
    for level, z in enumerate(shelves[:3]):
        x, k = sx0 + 0.1, level * 2
        room_up = shelves[level + 1] - z - 0.06
        end = sx1 - 0.1 if level != 1 else sx - 0.05
        while x < end - 0.06:
            w = 0.045 + 0.02 * ((k * 7) % 3) / 2
            h = min(room_up, 0.2 + 0.08 * ((k * 5) % 4) / 3)
            box(V(x + w / 2, sy - 0.02, z + 0.02 + h / 2), (w, 0.22, h), books[k % len(books)])
            x += w + (0.012 if k % 5 else 0.05)
            k += 1
        if level == 1:
            # Rolled scrolls lying on the middle shelf's other half, and a little clay jar.
            for j in range(3):
                zz = z + 0.06 + 0.075 * (j % 2) + (0.075 if j == 2 else 0.0)
                yy = sy - 0.06 + 0.1 * (j % 2)
                out.append((log(V(sx + 0.05, yy, zz), V(sx1 - 0.2, yy, zz), 0.035, segments=6), C["book5"]))
            out.append((turned([(0.0, 0.0), (0.06, 0.01), (0.075, 0.07), (0.05, 0.13), (0.055, 0.15), (0.0, 0.15)],
                               V(sx1 - 0.11, sy, z + 0.02)), C["pot"]))
    keep_out(sx0, sx1, sy0, y1, sh)

    # The kitchen along the right wall. A clay stove in the back corner with a pot on it.
    kx0 = x1 - 0.7
    box(V((kx0 + x1 - 0.06) / 2, y1 - 0.38, floor + 0.25), (x1 - 0.06 - kx0, 0.64, 0.5), C["pot"], bevel=0.08)
    box(V(kx0 - 0.002, y1 - 0.38, floor + 0.2), (0.01, 0.24, 0.2), C["iron"])
    out.append((P.segment_bm(V(kx0 + 0.32, y1 - 0.38, floor + 0.5), V(kx0 + 0.32, y1 - 0.38, floor + 0.68), 0.17, 0.15, 12),
                C["iron"]))
    out.append((L.ellipsoid_bm(V(kx0 + 0.32, y1 - 0.38, floor + 0.68), (0.15, 0.15, 0.04), u=12, v=4), C["log"]))
    keep_out(kx0, x1, y1 - 0.7, y1, 0.75)
    # The counter: a plank cabinet with a board on top, a stone basin set in it for a sink, and a
    # bamboo spout from the wall over the basin.
    ky0, ky1 = y1 - 2.45, y1 - 0.78
    kx = x1 - 0.32
    box(V(kx, (ky0 + ky1) / 2, floor + 0.25), (0.6, ky1 - ky0, 0.5), C["plank"])
    for y in (ky0 + (ky1 - ky0) * f for f in (0.33, 0.66)):
        box(V(x1 - 0.623, y, floor + 0.25), (0.006, PEN, 0.44), C["plankLine"])
    for y in (ky0 + (ky1 - ky0) * f for f in (0.16, 0.5, 0.84)):
        box(V(x1 - 0.625, y, floor + 0.34), (0.012, 0.05, 0.03), C["logDark"])
    top = floor + 0.55
    box(V(kx, (ky0 + ky1) / 2, top - 0.025), (0.64, ky1 - ky0 + 0.04, 0.05), C["log"])
    basin = (ky0 + ky1) / 2 + 0.28
    box(V(kx, basin, top + 0.02), (0.44, 0.54, 0.1), C["stone"], bevel=0.03)
    box(V(kx, basin, top + 0.055), (0.32, 0.42, 0.04), C["stoneDark"])
    box(V(kx, basin, top + 0.076), (0.3, 0.4, 0.012), C["water"])
    # The water comes down a bamboo pipe on the wall from under the roof and out of a spout over it.
    pipe_x = x1 - 0.06
    pipe = [V(pipe_x, basin + 0.1, ceiling - 0.05), V(pipe_x, basin + 0.1, top + 0.44)]
    spout = [V(pipe_x, basin + 0.1, top + 0.44), V(kx + 0.02, basin + 0.1, top + 0.32)]
    out.append((log(pipe[0], pipe[1], 0.042, segments=6), C["bamboo"]))
    out.append((log(spout[0], spout[1], 0.04, segments=6), C["bamboo"]))
    for z in (top + 0.75, top + 1.15, top + 1.55):
        if z < ceiling - 0.2:
            out.append((P.segment_bm(V(pipe_x, basin + 0.1, z - 0.012), V(pipe_x, basin + 0.1, z + 0.012), 0.048, 0.048, 6),
                        C["bambooDark"]))
    out.append((P.segment_bm(V(pipe_x, basin + 0.1, top + 0.4), V(pipe_x, basin + 0.1, top + 0.48), 0.05, 0.05, 6),
                C["bambooDark"]))
    out.append((log(V(x1 - 0.005, basin + 0.1, top + 0.95), V(pipe_x, basin + 0.1, top + 0.95), 0.012, segments=4),
                C["rope"]))
    # A cutting board and a bowl by the basin.
    box(V(kx, basin - 0.55, top + 0.012), (0.36, 0.26, 0.025), C["logEnd"])
    out.append((turned([(0.0, 0.0), (0.05, 0.0), (0.09, 0.04), (0.1, 0.07), (0.0, 0.07)], V(kx + 0.05, basin - 0.95, top)),
                C["cream"]))
    keep_out(x1 - 0.62, x1, ky0, ky1, 0.62)
    # A shelf of bowls and plates on the wall above the counter, beside the window.
    wy0, wy1 = 0.55, ky1
    box(V(x1 - 0.15, (wy0 + wy1) / 2, floor + 1.32), (0.3, wy1 - wy0, 0.04), C["plank"])
    for y in (wy0 + 0.05, wy1 - 0.05):
        box(V(x1 - 0.14, y, floor + 1.2), (0.26, 0.04, 0.2), C["logDark"])
    n = max(2, int((wy1 - wy0 - 0.1) / 0.22))
    for k in range(n):
        y = wy0 + 0.12 + (wy1 - wy0 - 0.24) * k / max(n - 1, 1)
        if k % 2:
            out.append((P.segment_bm(V(x1 - 0.17, y, floor + 1.34), V(x1 - 0.17, y, floor + 1.36), 0.1, 0.1, 10),
                        C["cream"]))
            out.append((P.segment_bm(V(x1 - 0.17, y, floor + 1.36), V(x1 - 0.17, y, floor + 1.38), 0.1, 0.1, 10),
                        C["blanket"]))
        else:
            out.append((turned([(0.0, 0.0), (0.04, 0.0), (0.08, 0.04), (0.09, 0.07), (0.0, 0.07)],
                               V(x1 - 0.17, y, floor + 1.34)), C["pot"]))
    # A clay water jar with a wooden lid at the counter's end, a ladle on it.
    jy = ky0 - 0.32
    out.append((turned([(0.0, 0.0), (0.15, 0.02), (0.22, 0.18), (0.21, 0.34), (0.13, 0.46), (0.14, 0.5), (0.0, 0.5)],
                       V(x1 - 0.3, jy, floor)), C["pot"]))
    out.append((P.segment_bm(V(x1 - 0.3, jy, floor + 0.5), V(x1 - 0.3, jy, floor + 0.53), 0.16, 0.16, 12), C["log"]))
    out.append((log(V(x1 - 0.42, jy - 0.05, floor + 0.54), V(x1 - 0.14, jy + 0.08, floor + 0.6), 0.015, segments=4),
                C["logDark"]))
    keep_out_round(x1 - 0.3, jy, 0.24, 0.55)

    # In the front: a woven rug, a low round table with a teapot and cups, cushions round it.
    tx, ty = x0 + 1.45, y0 + 1.15
    box(V(tx, ty, floor + 0.008), (1.9, 1.5, 0.016), C["mat"])
    for k in range(-3, 4):
        box(V(tx, ty + 0.2 * k, floor + 0.017), (1.88, 0.04 if k % 3 else 0.08, 0.003),
            C["clothDark"] if k % 3 == 0 else C["matLine"])
    out.append((P.segment_bm(V(tx, ty, floor + 0.3), V(tx, ty, floor + 0.35), 0.44, 0.44, 16), C["log"]))
    for a in range(4):
        ang = math.pi / 4 + a * math.pi / 2
        lx, ly = tx + math.cos(ang) * 0.28, ty + math.sin(ang) * 0.28
        box(V(lx, ly, floor + 0.15), (0.07, 0.07, 0.3), C["logDark"])
    out.append((turned([(0.0, 0.0), (0.08, 0.01), (0.11, 0.07), (0.09, 0.13), (0.03, 0.16), (0.04, 0.19), (0.0, 0.19)],
                       V(tx - 0.1, ty + 0.05, floor + 0.35)), C["pot"]))
    out.append((log(V(tx - 0.02, ty + 0.05, floor + 0.43), V(tx + 0.06, ty + 0.05, floor + 0.49), 0.018, segments=5),
                C["pot"]))
    for cxp, cyp in ((tx + 0.18, ty - 0.12), (tx + 0.2, ty + 0.16)):
        out.append((turned([(0.0, 0.0), (0.03, 0.0), (0.04, 0.06), (0.0, 0.06)], V(cxp, cyp, floor + 0.35)), C["cream"]))
    for (ox, oy), colour in (((0.0, -0.66), C["cushion"]), ((0.66, 0.05), C["cloth"]), ((-0.6, 0.1), C["blanket"])):
        out.append((L.ellipsoid_bm(V(tx + ox, ty + oy, floor + 0.05), (0.24, 0.24, 0.05), u=12, v=5), colour))
    keep_out_round(tx, ty, 0.46, 0.4)
    # A paper lantern hanging over the table, lit at night.
    lz = ceiling - 0.62
    out.append((log(V(tx, ty, ceiling), V(tx, ty, lz + 0.2), 0.01, segments=4), C["rope"]))
    for dz in (0.19, -0.19):
        out.append((P.segment_bm(V(tx, ty, lz + dz - 0.02), V(tx, ty, lz + dz + 0.02), 0.08, 0.08, 10), C["frame"]))
    glow.append((L.ellipsoid_bm(V(tx, ty, lz), (0.17, 0.17, 0.2), u=10, v=6), C["paperLantern"]))
    # A potted plant by the door.
    px, py = x1 - 0.35, y0 + 0.38
    out.append((P.segment_bm(V(px, py, floor), V(px, py, floor + 0.3), 0.14, 0.18, 10), C["pot"]))
    out.append((L.ellipsoid_bm(V(px, py, floor + 0.48), (0.22, 0.22, 0.25), u=10, v=6), C["leaf"]))
    keep_out_round(px, py, 0.2, 0.7)
    return out, blocks


# ---------------------------------------------------------------------------- the stilt hut
def build_stilt_hut(name, pattern, collection):
    """A hut on log stilts you can walk into, as in the film's village: log stairs up to a plank
    porch, a doorway wide enough for three, lattice windows over a band of coloured scales, a
    roomy log-cabin room inside furnished as an islander's home (see furnish), and a big
    mushroom-shaped thatched roof sheltering the porch. Returns the parts and the info for the
    game."""
    floor, wall_h, t = 0.6, 2.6, 0.16
    xi, yi = 2.8, 2.2                     # the room inside
    xo, yo = xi + t, yi + t               # the walls' outer faces
    porch = -yo - 1.2
    stairs_end = porch - 1.3
    door = 0.68                           # half the doorway's width
    pieces, glow, inside = [], [], []

    sill, head = 0.92, 2.3                # the windows' bottom and top, above the floor, up to the top rail
    front = Wall((-xo, -yo + t / 2), (xo, -yo + t / 2), floor, wall_h, t,
                 [(xo - door, xo + door, 0.0, 2.05), (xo - 2.3, xo - 1.3, sill, head), (xo + 1.3, xo + 2.3, sill, head)])
    back = Wall((xo, yo - t / 2), (-xo, yo - t / 2), floor, wall_h, t, [(xo - 0.45, xo + 0.45, sill, head)])
    left = Wall((-xo + t / 2, yi), (-xo + t / 2, -yi), floor, wall_h, t, [(yi - 0.45, yi + 0.45, sill, head)])
    right = Wall((xo - t / 2, -yi), (xo - t / 2, yi), floor, wall_h, t, [(yi - 0.45, yi + 0.45, sill, head)])
    for wall in (front, back, left, right):
        pieces.extend(wall.skins(C["plank"], C["inside"]))
        inside.extend(wall.courses(C["insideLine"], 1))
        # Outside, as the film's: shingled all over in round scales, framed by log rails along the
        # wall's foot, under its windows and along its top.
        pieces.extend(wall.shingles(pattern, 0.17, wall_h - 0.17, size=0.34))
        for v, r in ((0.08, 0.085), (sill - 0.09, 0.075), (wall_h - 0.08, 0.09)):
            pieces.extend(wall.rail(v, r, C["log"]))
        for o in wall.openings:
            if o[2] > 0.1:
                pieces.extend(wall.window(o, glow))

    # Thick log posts at the corners and either side of the door, from the ground to the roof.
    for x, y in ((-xo, -yo), (xo, -yo), (-xo, yo), (xo, yo)):
        pieces.append((log(V(x, y, -0.4), V(x, y, floor + wall_h + 0.02), 0.2, segments=10), C["log"]))
    for x in (-door - 0.14, door + 0.14):
        pieces.append((log(V(x, -yo - 0.03, floor), V(x, -yo - 0.03, floor + wall_h), 0.16, segments=10), C["log"]))
    pieces.append((oriented_box(V(0.0, -yo - 0.04, floor + 2.13), V(1, 0, 0), V(0, 1, 0), (2 * door + 0.4, 0.16, 0.17)),
                   C["logDark"]))
    # The double plank door, both leaves open into the room against the doorway's sides, each with
    # a dark handle.
    for s in (-1.0, 1.0):
        x = s * (door - 0.03)
        pieces.append((oriented_box(V(x, -yi + 0.33, floor + 1.0), V(0, 1, 0), V(1, 0, 0), (0.64, 0.05, 1.96)), C["plank"]))
        for k in (-1, 1):
            pieces.append((oriented_box(V(x - s * 0.027, -yi + 0.33 + 0.16 * k, floor + 1.0), V(0, 1, 0), V(1, 0, 0),
                                        (PEN, 0.006, 1.9)), C["plankLine"]))
        door_handle(V(x - s * 0.027, -yi + 0.56, floor + 1.0), V(-s, 0, 0), pieces)

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

    furniture, kept_out = furnish(((-xi, xi), (-yi, yi)), floor, floor + wall_h, glow)
    inside.extend(furniture)

    # The mushroom roof, sheltering the porch too.
    roof_y = -0.85
    eave = floor + wall_h
    roof = [(0.0, eave), (3.65, eave), (4.25, eave - 0.1), (4.55, eave - 0.16), (4.6, eave), (4.38, eave + 0.48),
            (3.75, eave + 1.3), (2.75, eave + 2.05), (1.5, eave + 2.55), (0.0, eave + 2.72)]
    pieces.append(lathe_roof(roof, V(0.0, roof_y, 0.0)))
    # From afar: the roof, the walls as boxes, the porch and the stilts' shadow under them.
    far = [lathe_roof(roof, V(0.0, roof_y, 0.0), samples=8, segments=12)]
    far += [w.far(pattern[0]) for w in (front, back, left, right)]
    far.append((P.box_bm(V(0.0, (porch + yo) / 2, floor / 2 - 0.1), (2 * xo, yo - porch, floor + 0.2)), C["logDark"]))

    body = P.join(name, pieces, collection, sharp=P.SHARP)
    lights = P.join(f"{name}_glow", glow, collection)
    room = P.join(f"{name}_inside", inside, collection, sharp=P.SHARP)
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
        {"circle": [*g(0.0, roof_y), 4.6], "y": [eave - 0.05, eave + 2.8], "walk": False, "camera": True},
    ] + kept_out
    # The door's open leaves, and the porch's pots.
    blocks += [block_box(s * (door - 0.03) - 0.04, s * (door - 0.03) + 0.04, -yi, -yi + 0.66, floor - 0.1, floor + 2.0,
                         camera=False) for s in (-1.0, 1.0)]
    blocks += [{"circle": [*g(at.x, at.y), 0.2], "y": [floor - 0.1, floor + 0.6], "walk": True, "camera": False}
               for at, _ in pots]
    decks = [deck_box(-xo + 0.1, xo - 0.1, porch, yi, floor), deck_box(-0.62, 0.62, stairs_end, porch, floor, 0.02)]
    return [body, lights, room, distant], {"blocks": blocks, "decks": decks, "height": eave + 2.8}


# ---------------------------------------------------------------------------- the plank hut
def build_plank_hut(name, collection):
    """A plank hut on the ground with a wide thatched hip roof, as in the film's clearing: a tall
    plank door, a window each side and at the back, a roomy log-cabin room inside furnished as an
    islander's home (see furnish). Returns the parts and the info for the game."""
    floor, wall_h, t = 0.22, 2.45, 0.16
    xi, yi = 2.6, 2.1
    xo, yo = xi + t, yi + t
    step = -yo - 0.6
    ramp_end = step - 0.6
    door = 0.65
    pieces, glow, inside = [], [], []
    sill, head = 0.85, 1.85
    front = Wall((-xo, -yo + t / 2), (xo, -yo + t / 2), floor, wall_h, t, [(xo - door, xo + door, 0.0, 1.95)])
    back = Wall((xo, yo - t / 2), (-xo, yo - t / 2), floor, wall_h, t, [(xo - 0.45, xo + 0.45, sill, head)])
    left = Wall((-xo + t / 2, yi), (-xo + t / 2, -yi), floor, wall_h, t, [(yi - 0.45, yi + 0.45, sill, head)])
    right = Wall((xo - t / 2, -yi), (xo - t / 2, yi), floor, wall_h, t, [(yi - 0.45, yi + 0.45, sill, head)])
    for wall in (front, back, left, right):
        pieces.extend(wall.skins(C["plank"], C["inside"]))
        pieces.extend(wall.courses(C["plankLine"], -1, start=0.3, step=0.3))
        inside.extend(wall.courses(C["insideLine"], 1))
        # Log rails along the wall's foot, under its windows and along its top.
        for v, r in ((0.07, 0.08), (sill - 0.09, 0.07), (wall_h - 0.07, 0.085)):
            pieces.extend(wall.rail(v, r, C["log"]))
        for o in wall.openings:
            if o[2] > 0.1:
                pieces.extend(wall.window(o, glow))
    for x, y in ((-xo, -yo), (xo, -yo), (-xo, yo), (xo, yo)):
        pieces.append((log(V(x, y, -0.2), V(x, y, floor + wall_h), 0.18, segments=10), C["log"]))
    for x in (-door - 0.12, door + 0.12):
        pieces.append((log(V(x, -yo - 0.03, floor), V(x, -yo - 0.03, floor + 2.0), 0.13, segments=10), C["log"]))
    # The tall plank door, open against the inside of the front wall.
    pieces.append((oriented_box(V(door + 0.62, -yi + 0.06, floor + 0.98), V(1, 0, 0), V(0, 1, 0), (1.25, 0.06, 1.9)),
                   C["plank"]))
    for k in (-1, 0, 1):
        pieces.append((oriented_box(V(door + 0.62 + 0.38 * k, -yi + 0.025, floor + 0.98), V(1, 0, 0), V(0, 1, 0),
                                    (PEN, 0.012, 1.86)), C["plankLine"]))
    door_handle(V(door + 1.12, -yi + 0.02, floor + 0.98), V(0, 1, 0), pieces)
    # Potted plants either side of the step, as by the film's doors.
    pots = [(V(1.25, -yo - 0.32, floor), potted_succulent), (V(-1.25, -yo - 0.3, floor), potted_thistles)]
    for at, make in pots:
        make(at, pieces)
    pieces.append((P.box_bm(V(0.0, (step + yo) / 2, floor - 0.06), (2 * xo, yo - step, 0.12)), C["floor"]))
    pieces.append((P.box_bm(V(0.0, (step + ramp_end) / 2, 0.06), (1.6, step - ramp_end, 0.14)), C["log"]))
    furniture, kept_out = furnish(((-xi, xi), (-yi, yi)), floor, floor + wall_h, glow)
    inside.extend(furniture)
    eave = floor + wall_h
    roof = (-xo - 0.84, xo + 0.84, -yo - 1.14, yo + 0.84, eave, eave + 0.28, eave + 2.73, 1.1)
    pieces.append(hip_roof(*roof))
    far = [hip_roof(*roof, subdivide=False)]
    far += [w.far(C["plank"]) for w in (front, back, left, right)]
    body = P.join(name, pieces, collection, sharp=P.SHARP)
    lights = P.join(f"{name}_glow", glow, collection)
    room = P.join(f"{name}_inside", inside, collection, sharp=P.SHARP)
    distant = P.join(f"{name}_far", far, collection, sharp=P.SHARP)
    blocks = [
        block_box(-xo, xo, yi, yo, -10, eave), block_box(-xo, -door, -yo, -yi, -10, eave),
        block_box(door, xo, -yo, -yi, -10, eave), block_box(-xo, -xi, -yo, yo, -10, eave),
        block_box(xi, xo, -yo, yo, -10, eave),
        block_box(roof[0], roof[1], roof[2], roof[3], eave - 0.05, roof[6], walk=False),
    ] + kept_out
    blocks += [{"circle": [*g(at.x, at.y), 0.2], "y": [floor - 0.1, floor + 0.6], "walk": True, "camera": False}
               for at, _ in pots]
    decks = [deck_box(-xo + 0.1, xo - 0.1, step, yi, floor), deck_box(-0.8, 0.8, ramp_end, step, floor, 0.02)]
    return [body, lights, room, distant], {"blocks": blocks, "decks": decks, "height": roof[6]}


# ---------------------------------------------------------------------------- the guest houses
# Each guest house's roof and gable colours: the film's two, an orange-shingled one with a cream
# gable and a tan one with a pale green gable, each patterned with chevrons.
GUEST_STYLES = {
    "orange": {"roof": "#D98A4B", "roofLine": "#A6602E", "gable": "#F4E4B4", "chevron": "#FFF8E2"},
    "tan": {"roof": "#B39469", "roofLine": "#7F6544", "gable": "#DCEBC0", "chevron": "#F2F8E2"},
}


def exact_log(a, b, radius, segments=8):
    """A log from exactly a to b (segment_bm lengthens what it makes by 4%)."""
    mid = (a + b) / 2
    half = (b - a) / 2 / 1.04
    return P.segment_bm(mid - half, mid + half, radius, radius, segments)


def cut_log(a, b, radius, colour, end_colour, pieces, ends=(True, True)):
    """A log from a to b, each end cut to show its pale grain."""
    d = (b - a).normalized()
    cut = 0.03
    a2 = a + d * cut if ends[0] else a
    b2 = b - d * cut if ends[1] else b
    pieces.append((exact_log(a2, b2, radius), colour))
    if ends[0]:
        pieces.append((exact_log(a, a2, radius * 0.94), end_colour))
    if ends[1]:
        pieces.append((exact_log(b2, b, radius * 0.94), end_colour))


def gable_bm(y, half, z0, z1, thickness):
    """A gable: a triangle over x -half..half from z0 up to z1 at its middle, `thickness` deep from y
    toward +y."""
    bm = bmesh.new()
    front = [bm.verts.new((-half, y, z0)), bm.verts.new((half, y, z0)), bm.verts.new((0.0, y, z1))]
    back = [bm.verts.new((v.co.x, y + thickness, v.co.z)) for v in front]
    bm.faces.new(front)
    bm.faces.new(list(reversed(back)))
    for i in range(3):
        j = (i + 1) % 3
        bm.faces.new((front[i], back[i], back[j], front[j]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    return bm


def grid_window(wall, opening, glow, cols, rows, pieces, inside):
    """A window in one of a log wall's openings, as the guest houses' are: a dark board frame with a
    deep sill outside, panes that light up at night, a grid of bars across them, a frame inside."""
    u0, u1, v0, v1 = opening
    w, h = u1 - u0, v1 - v0
    uc, vc = (u0 + u1) / 2, (v0 + v1) / 2
    bar, e = 0.09, 0.004
    for c, size in ((wall.point(uc, v1 + (bar - e) / 2, -0.06), (w + 2 * bar, 0.12, bar + e)),
                    (wall.point(uc, v0 - (bar - e) / 2, -0.08), (w + 2 * bar + 0.12, 0.16, bar + e)),
                    (wall.point(u0 - (bar - e) / 2, vc, -0.06), (bar + e, 0.12, h)),
                    (wall.point(u1 + (bar - e) / 2, vc, -0.06), (bar + e, 0.12, h))):
        pieces.append((oriented_box(c, wall.d, wall.inward, size), C["frame"]))
    glow.append((oriented_box(wall.point(uc, vc, wall.t / 2), wall.d, wall.inward, (w + 2 * e, 0.02, h + 2 * e)), C["glass"]))
    for k in range(1, cols):
        pieces.append((oriented_box(wall.point(u0 + w * k / cols, vc, wall.t / 2 - 0.02), wall.d, wall.inward,
                                    (0.035, 0.016, h + e)), C["frame"]))
    for k in range(1, rows):
        pieces.append((oriented_box(wall.point(uc, v0 + h * k / rows, wall.t / 2 - 0.035), wall.d, wall.inward,
                                    (w + e, 0.016, 0.035)), C["frame"]))
    for k in range(0, 2):
        inside.append((oriented_box(wall.point(uc, v0 + h * k, wall.t + 0.03), wall.d, wall.inward,
                                    (w + 0.16, 0.06, 0.07)), C["frame"]))


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
    logs, their cut ends showing at the corners, on short stilts, under a steep gable roof of wooden
    shingles with a window in its slope. Its door is in the front gable end, a plank door with a
    diamond window, up three half-log steps; the gable above it is boarded in a pale colour patterned
    with chevrons round a small window. Inside, an empty room of bare log walls and a plank floor, but
    for a red hammock slung across it before the window opposite the door. Faces -Y."""
    s = GUEST_STYLES[style]
    roof_colour, roof_line = L.hex_color(s["roof"]), L.hex_color(s["roofLine"])
    floor, wall_h, t = 0.55, 2.0, 0.2
    xi, yi = 1.95, 2.4
    xo, yo = xi + t, yi + t
    eave = floor + wall_h
    pitch = math.radians(52.0)
    ridge = eave + xo * math.tan(pitch)
    over, gable_over = 0.45, 0.4
    door = 0.45
    pieces, glow, inside = [], [], []
    sill, head = 0.85, 1.6
    front = Wall((-xo, -yo + t / 2), (xo, -yo + t / 2), floor, wall_h, t, [(xo - door, xo + door, 0.0, 1.85)])
    back = Wall((xo, yo - t / 2), (-xo, yo - t / 2), floor, wall_h, t, [(xo - 0.5, xo + 0.5, sill, head)])
    left = Wall((-xo + t / 2, yi), (-xo + t / 2, -yi), floor, wall_h, t, [(yi - 0.5, yi + 0.5, sill, head)])
    right = Wall((xo - t / 2, -yi), (xo - t / 2, yi), floor, wall_h, t, [(yi - 0.5, yi + 0.5, sill, head)])
    walls = (front, back, left, right)
    r = 0.12
    courses = int(wall_h / (2 * r))
    for wall in walls:
        pieces.extend(wall.skins(C["guestLogDark"], C["guestLog"]))
        inside.extend(wall.courses(C["insideLine"], 1, start=2 * r, step=2 * r))
        # Round logs along the wall's outer face, course on course, cut at its openings; at the corners
        # every other course runs on past the corner, so the logs' ends stack there as the film draws.
        ends_out = wall in (front, back)
        for k in range(courses):
            v = r + 2 * r * k
            past = (0.24 if ends_out else 0.24 + t) if (k % 2 == 0) == ends_out else (-0.05 if ends_out else 0.15)
            spans = solid_spans(wall.length, v, [(a - 0.02, b + 0.02, c - r, d + r) for a, b, c, d in wall.openings])
            for u0, u1 in spans:
                if u1 - u0 < 0.12:
                    continue
                start = u0 - (past if u0 < 1e-6 else 0.0)
                end = u1 + (past if u1 > wall.length - 1e-6 else 0.0)
                if end - start < 0.12:
                    continue
                cut_log(wall.point(start, v, -0.03), wall.point(end, v, -0.03), r, C["guestLog"], C["guestLogEnd"], pieces)
        for o in wall.openings:
            if o[2] > 0.1:
                grid_window(wall, o, glow, 3, 3, pieces, inside)
    # The door's frame, and the plank door open into the room against the wall beside it, a diamond
    # window and a long handle on it.
    e = 0.004
    for c, size in ((V(0.0, -yo - 0.04, floor + 1.85 + 0.05 - e), (2 * door + 0.2, 0.14, 0.1)),
                    (V(-door - 0.05 + e, -yo - 0.04, floor + 0.9), (0.1, 0.14, 1.9)),
                    (V(door + 0.05 - e, -yo - 0.04, floor + 0.9), (0.1, 0.14, 1.9))):
        pieces.append((P.box_bm(c, size), C["frame"]))
    leaf_x = -door + 0.03
    pieces.append((oriented_box(V(leaf_x, -yi + 0.46, floor + 0.92), V(0, 1, 0), V(1, 0, 0), (0.88, 0.05, 1.8)),
                   C["guestDoor"]))
    for k in (-1, 0, 1):
        pieces.append((oriented_box(V(leaf_x + 0.027, -yi + 0.46 + 0.22 * k, floor + 0.92), V(0, 1, 0), V(1, 0, 0),
                                    (PEN, 0.006, 1.74)), C["guestDoorLine"]))
    diamond = Matrix.Rotation(math.pi / 4, 3, "X")
    for side in (-1.0, 1.0):
        at = V(leaf_x + side * 0.028, -yi + 0.46, floor + 1.32)
        bm = P.box_bm(V(0.0, 0.0, 0.0), (0.012, 0.16, 0.16))
        L.transformed(bm, Matrix.Translation(at) @ diamond.to_4x4())
        pieces.append((bm, C["doorGlass"]))
    pieces.append((oriented_box(V(leaf_x + 0.042, -yi + 0.8, floor + 0.95), UP, V(1, 0, 0), (0.34, 0.035, 0.035)),
                   C["handle"]))
    # The floor on its stilts, its planks drawn inside, and the half-log steps up to the door.
    pieces.append((P.box_bm(V(0.0, 0.0, floor - 0.08), (2 * xo + 0.1, 2 * yo + 0.1, 0.16)), C["floor"]))
    for k in range(1, 9):
        x = -xi + 2 * xi * k / 9
        inside.append((P.box_bm(V(x, 0.0, floor + 0.002), (PEN, 2 * yi - 0.02, 0.01)), C["floorLine"]))
    for x in (-xo + 0.15, xo - 0.15):
        for y in (-yo + 0.15, 0.0, yo - 0.15):
            pieces.append((P.box_bm(V(x, y, (floor - 0.16 - 0.3) / 2), (0.24, 0.24, floor - 0.16 + 0.3)), C["logDark"]))
    steps_end = -yo - 1.05
    for x in (-0.62, 0.62):
        pieces.append((log(V(x, -yo - 0.02, floor - 0.08), V(x, steps_end, -0.08), 0.08, segments=8), C["logDark"]))
    for k in range(3):
        f = (k + 1) / 4
        y = -yo + (steps_end + yo) * f
        z = floor * (1 - f)
        pieces.append((P.box_bm(V(0.0, y + 0.02, z - 0.05), (1.36, 0.3, 0.1)), C["guestLog"]))
        cut_log(V(-0.7, y - 0.13, z - 0.06), V(0.7, y - 0.13, z - 0.06), 0.07, C["guestLog"], C["guestLogEnd"], pieces)
    # The gables over the front and back walls, boarded pale and patterned with chevrons, a small
    # window in each.
    gable_colour, chevron = L.hex_color(s["gable"]), L.hex_color(s["chevron"])
    rise = ridge - eave
    for sign in (-1.0, 1.0):
        # Its face as far out as the logs' middles, reaching back into the wall.
        y_face = sign * (yo + 0.1)
        pieces.append((gable_bm(y_face if sign < 0 else y_face - 0.18, xo, eave - 0.02, ridge - 0.04, 0.18), gable_colour))
        out = V(0.0, sign, 0.0)
        face_y = y_face + sign * 0.012
        for k in range(3):
            inset = 0.32 + 0.34 * k
            top_z = ridge - 0.04 - inset / math.cos(pitch) - 0.1
            half = (top_z - eave) / math.tan(pitch)
            if half < 0.25:
                continue
            for sx in (-1.0, 1.0):
                p, q = V(0.0, face_y, top_z), V(sx * half, face_y, eave + 0.06)
                pieces.append((oriented_box((p + q) / 2, q - p, out, ((q - p).length, 0.012, 0.07)), chevron))
        wz = eave + rise * 0.42
        for c, size in ((V(0.0, y_face + sign * 0.03, wz + 0.29), (0.68, 0.05, 0.08)),
                        (V(0.0, y_face + sign * 0.03, wz - 0.29), (0.68, 0.05, 0.08)),
                        (V(-0.3, y_face + sign * 0.03, wz), (0.08, 0.05, 0.5)),
                        (V(0.3, y_face + sign * 0.03, wz), (0.08, 0.05, 0.5))):
            pieces.append((P.box_bm(c, size), C["frame"]))
        glow.append((P.box_bm(V(0.0, y_face + sign * 0.022, wz), (0.52, 0.012, 0.52)), C["glass"]))
        for c, size in ((V(0.0, y_face + sign * 0.03, wz), (0.03, 0.03, 0.5)), (V(0.0, y_face + sign * 0.03, wz), (0.5, 0.03, 0.03))):
            pieces.append((P.box_bm(c, size), C["frame"]))
    # The roof: two slabs of wooden shingles, their rows drawn along them, over a log at the ridge,
    # and a window lying in the right slope.
    length = (xo + over) / math.cos(pitch) + 0.06
    depth = 2 * (yo + gable_over)
    thick = 0.12
    far = []
    for sx in (-1.0, 1.0):
        down = V(sx * math.cos(pitch), 0.0, -math.sin(pitch))
        normal = V(sx * math.sin(pitch), 0.0, math.cos(pitch))
        top_edge = V(0.0, 0.0, ridge) - down * 0.06
        centre = top_edge + down * (length / 2) + normal * (thick / 2)
        slab = oriented_box(centre, down, V(0, 1, 0), (length, depth, thick))
        pieces.append((slab, roof_colour))
        far.append((oriented_box(centre, down, V(0, 1, 0), (length, depth, thick)), roof_colour))
        rows = int(length / 0.24)
        for k in range(1, rows):
            c = top_edge + down * (length * k / rows) + normal * (thick + 0.012)
            pieces.append((oriented_box(c, V(0, 1, 0), normal, (depth - 0.02, 0.012, PEN)), roof_line))
        if sx > 0:
            c = top_edge + down * (length * 0.5) + V(0.0, 0.7, 0.0) + normal * (thick + 0.045)
            pieces.append((oriented_box(c, down, V(0, 1, 0), (0.82, 0.72, 0.1)), C["frame"]))
            glow.append((oriented_box(c + normal * 0.04, down, V(0, 1, 0), (0.66, 0.56, 0.03)), C["glass"]))
            for k in (-1, 1):
                pieces.append((oriented_box(c + normal * 0.06 + down * (0.11 * k), V(0, 1, 0), normal, (0.62, 0.03, 0.02)),
                               C["frame"]))
                pieces.append((oriented_box(c + normal * 0.06 + V(0.0, 0.093 * k, 0.0), down, normal, (0.72, 0.03, 0.02)),
                               C["frame"]))
    pieces.append((log(V(0.0, -yo - gable_over - 0.05, ridge + 0.05), V(0.0, yo + gable_over + 0.05, ridge + 0.05), 0.09,
                       segments=10), C["logDark"]))
    # Inside, nothing but a red hammock slung from wall to wall before the window opposite the door.
    hammock(-xi, xi, yi - 0.6, floor + 1.75, floor + 1.15, 0.75, inside)
    far += [wall.far(C["guestLog"]) for wall in walls]
    for sign in (-1.0, 1.0):
        far.append((gable_bm(sign * (yo + 0.1) - (0.2 if sign > 0 else 0.0), xo, eave - 0.02, ridge - 0.04, 0.2), gable_colour))
    far.append((P.box_bm(V(0.0, 0.0, (floor - 0.3) / 2), (2 * xo, 2 * yo, floor + 0.3)), C["logDark"]))

    body = P.join(name, pieces, collection, sharp=P.SHARP)
    lights = P.join(f"{name}_glow", glow, collection)
    room = P.join(f"{name}_inside", inside, collection, sharp=P.SHARP)
    distant = P.join(f"{name}_far", far, collection, sharp=P.SHARP)
    blocks = [
        block_box(-xo, xo, yi, yo, -10, eave), block_box(-xo, -door, -yo, -yi, -10, eave),
        block_box(door, xo, -yo, -yi, -10, eave), block_box(-xo, -xi, -yo, yo, -10, eave),
        block_box(xi, xo, -yo, yo, -10, eave),
        block_box(-xo, xo, -yo, yo, -10, floor - 0.16, camera=False),
        block_box(-xo - over, xo + over, -yo - gable_over, yo + gable_over, eave - 0.05, ridge + 0.1, walk=False),
        block_box(leaf_x - 0.05, leaf_x + 0.05, -yi, -yi + 0.92, floor - 0.1, floor + 1.85, camera=False),
        block_box(-0.75, -0.62, steps_end, -yo, -0.2, floor, camera=False),
        block_box(0.62, 0.75, steps_end, -yo, -0.2, floor, camera=False),
    ]
    decks = [deck_box(-xi, xi, -yo - 0.02, yi, floor), deck_box(-0.6, 0.6, steps_end, -yo - 0.02, floor, 0.02)]
    return [body, lights, room, distant], {"blocks": blocks, "decks": decks, "height": ridge + 0.2}


# ---------------------------------------------------------------------------- 島二郎
def ramen_bowl(at, pieces):
    """A bowl of 島二郎's ramen, after the shop it is named for: a deep cream bowl heaped high with
    bean sprouts and cabbage, thick slices of pork leaning on the heap, a dab of garlic on top."""
    pieces.append((turned([(0.0, 0.0), (0.06, 0.0), (0.08, 0.02), (0.15, 0.08), (0.165, 0.125), (0.15, 0.125),
                           (0.0, 0.105)], at, segments=14), C["cream"]))
    pieces.append((P.segment_bm(at + V(0.0, 0.0, 0.1), at + V(0.0, 0.0, 0.112), 0.145, 0.145, 14), C["soup"]))
    pieces.append((L.ellipsoid_bm(at + V(0.0, 0.0, 0.17), (0.115, 0.11, 0.13), u=12, v=8), C["sprouts"]))
    for k, (dx, dy) in enumerate(((0.06, 0.04), (-0.05, 0.06), (0.02, -0.07))):
        pieces.append((L.ellipsoid_bm(at + V(dx, dy, 0.21 + 0.02 * k), (0.045, 0.035, 0.02), u=6, v=4), C["cabbage"]))
    for ang in (0.4, 2.4):
        c = at + V(math.cos(ang) * 0.1, math.sin(ang) * 0.1, 0.16)
        rot = Matrix.Rotation(ang, 3, "Z") @ Matrix.Rotation(0.9, 3, "Y")
        pieces.append((L.ellipsoid_bm(c, (0.075, 0.055, 0.016), rot=rot, u=8, v=4), C["pork"]))
    pieces.append((L.ellipsoid_bm(at + V(0.0, -0.02, 0.305), (0.03, 0.03, 0.015), u=6, v=4), C["cream"]))


def build_restaurant(collection):
    """島二郎, the restaurant at the end of the riverside path: a ramen shop after the one it is named
    for, built as the village builds. A plank floor on short log stilts under a big thatched hip roof
    on log posts, open at the front, where a navy cloth curtain hangs over the way in between red
    paper lanterns that light up at night. Inside, a long plank counter with stools along it and
    bowls of ramen heaped with bean sprouts on it; behind it the kitchen, walled in planks at the
    back and sides: a clay stove with two tall steel stockpots, a prep table with a cutting board, a
    tray of noodles and stacked bowls, and a shelf of jars by the window. Faces -Y."""
    floor, t = 0.3, 0.15
    xo, yo = 3.6, 2.6
    eave = 2.8
    kitchen = 0.55                      # where the kitchen's side walls begin
    counter_y, counter_d, counter_h = 0.45, 0.55, 0.85
    counter_x = (-3.0, 2.0)
    pieces, glow, inside = [], [], []
    # The floor: planks on a thick log edge, on short stilts, a log step at the front.
    pieces.append((P.box_bm(V(0.0, 0.0, floor - 0.09), (2 * xo, 2 * yo, 0.18)), C["floor"]))
    for k in range(1, 18):
        x = -xo + 2 * xo * k / 18
        pieces.append((P.box_bm(V(x, -0.125, floor + 0.002), (PEN, 2 * yo - 0.35, 0.01)), C["floorLine"]))
    pieces.append((log(V(-xo - 0.05, -yo - 0.02, floor - 0.12), V(xo + 0.05, -yo - 0.02, floor - 0.12), 0.11, segments=10),
                   C["log"]))
    for x in (-xo + 0.3, -1.2, 1.2, xo - 0.3):
        for y in (-yo + 0.3, 0.0, yo - 0.3):
            pieces.append((log(V(x, y, -0.3), V(x, y, floor - 0.17), 0.1, segments=8), C["logDark"]))
    pieces.append((P.box_bm(V(0.0, -yo - 0.3, 0.075), (2.6, 0.5, 0.15)), C["log"]))
    # The posts, and beams along the eave between them.
    posts = [(-xo + 0.15, -yo + 0.15), (xo - 0.15, -yo + 0.15), (-1.25, -yo + 0.15), (1.25, -yo + 0.15),
             (-xo + 0.15, kitchen), (xo - 0.15, kitchen), (-xo + 0.15, yo - 0.15), (xo - 0.15, yo - 0.15)]
    for x, y in posts:
        pieces.append((log(V(x, y, -0.2), V(x, y, eave + 0.05), 0.14, segments=10), C["log"]))
    for a, b in (((-xo + 0.15, -yo + 0.15), (xo - 0.15, -yo + 0.15)), ((-xo + 0.15, yo - 0.15), (xo - 0.15, yo - 0.15)),
                 ((-xo + 0.15, -yo + 0.15), (-xo + 0.15, yo - 0.15)), ((xo - 0.15, -yo + 0.15), (xo - 0.15, yo - 0.15))):
        pieces.append((log(V(*a, eave - 0.12), V(*b, eave - 0.12), 0.11, segments=8), C["logDark"]))
    # The kitchen's walls: the back, with a window, and both sides from the counter back.
    sill, head = floor + 1.0, floor + 1.7
    walls = [Wall((xo - 0.15, yo - t / 2), (-xo + 0.15, yo - t / 2), floor, eave - floor - 0.12, t,
                  [(4.25, 5.45, sill - floor, head - floor)]),
             Wall((-xo + t / 2, yo - 0.15), (-xo + t / 2, kitchen), floor, eave - floor - 0.12, t),
             Wall((xo - t / 2, kitchen), (xo - t / 2, yo - 0.15), floor, eave - floor - 0.12, t)]
    for wall in walls:
        pieces.extend(wall.skins(C["plank"], C["inside"]))
        pieces.extend(wall.courses(C["plankLine"], -1, start=0.3, step=0.3))
        inside.extend(wall.courses(C["insideLine"], 1))
        for v, r in ((0.1, 0.08), (eave - floor - 0.2, 0.08)):
            pieces.extend(wall.rail(v, r, C["log"]))
        for u0, u1, v0, v1 in wall.openings:
            # An open window for the kitchen's steam: a board frame, a bamboo blind rolled up under
            # its head.
            uc, w = (u0 + u1) / 2, u1 - u0
            # Each board reaches a little into the opening, so none of its faces lies in the wall's.
            e = 0.004
            for c, size in ((wall.point(uc, v1 + 0.05 - e, -0.03), (w + 0.2, 0.08, 0.1)),
                            (wall.point(uc, v0 - 0.05 + e, -0.05), (w + 0.34, 0.14, 0.1)),
                            (wall.point(u0 - 0.05 + e, (v0 + v1) / 2, -0.03), (0.1, 0.08, v1 - v0)),
                            (wall.point(u1 + 0.05 - e, (v0 + v1) / 2, -0.03), (0.1, 0.08, v1 - v0))):
                pieces.append((oriented_box(c, wall.d, wall.inward, size), C["frame"]))
            pieces.append((log(wall.point(u0 + 0.02, v1 - 0.06, -0.09), wall.point(u1 - 0.02, v1 - 0.06, -0.09), 0.055,
                               segments=8), C["bamboo"]))
    # The counter: a plank front, a log top, stools along it.
    cx0, cx1 = counter_x
    cy = counter_y + counter_d / 2
    top = floor + counter_h
    pieces.append((P.box_bm(V((cx0 + cx1) / 2, cy, floor + counter_h / 2 - 0.03), (cx1 - cx0, counter_d, counter_h - 0.06)),
                   C["plank"]))
    for k in range(1, 9):
        x = cx0 + (cx1 - cx0) * k / 9
        pieces.append((P.box_bm(V(x, counter_y - 0.002, floor + counter_h / 2 - 0.03), (PEN, 0.01, counter_h - 0.12)),
                       C["plankLine"]))
    pieces.append((P.box_bm(V((cx0 + cx1) / 2, cy - 0.04, top - 0.03), (cx1 - cx0 + 0.16, counter_d + 0.16, 0.06)), C["log"]))
    stools = [(-2.55 + 1.05 * k, counter_y - 0.42) for k in range(5)]
    for sx, sy in stools:
        pieces.append((log(V(sx, sy, floor), V(sx, sy, floor + 0.38), 0.05, segments=8), C["logDark"]))
        pieces.append((P.segment_bm(V(sx, sy, floor + 0.38), V(sx, sy, floor + 0.44), 0.19, 0.19, 14), C["log"]))
    # Bowls of ramen on the counter, a pot of chopsticks, a stack of clean bowls at its end.
    for x in (-2.0, -0.45, 1.1):
        ramen_bowl(V(x, counter_y + 0.18, top), inside)
    inside.append((turned([(0.0, 0.0), (0.05, 0.0), (0.055, 0.14), (0.0, 0.14)], V(-1.2, counter_y + 0.22, top)), C["pot"]))
    for k in range(7):
        a = k * 0.9
        p = V(-1.2 + math.cos(a) * 0.025, counter_y + 0.22 + math.sin(a) * 0.025, top + 0.06)
        inside.append((P.segment_bm(p, p + V(math.cos(a) * 0.02, math.sin(a) * 0.02, 0.2), 0.006, 0.005, 4), C["logEnd"]))
    for k in range(4):
        inside.append((turned([(0.0, 0.0), (0.06, 0.0), (0.15, 0.07), (0.16, 0.09), (0.0, 0.03)],
                              V(1.75, counter_y + 0.3, top + 0.075 * k)), C["cream"]))
    # The stove: a clay hearth in the kitchen's back corner, two tall steel stockpots on it.
    sx0, sx1, sy0, sy1 = 0.8, 2.75, 1.6, yo - 0.2
    pieces.append((P.box_bm(V((sx0 + sx1) / 2, (sy0 + sy1) / 2, floor + 0.38), (sx1 - sx0, sy1 - sy0, 0.76), bevel=0.06),
                   C["pot"]))
    for x in (1.25, 2.3):
        pieces.append((P.box_bm(V(x, sy0 - 0.004, floor + 0.28), (0.34, 0.01, 0.24)), C["iron"]))
        pieces.append((P.segment_bm(V(x, (sy0 + sy1) / 2, floor + 0.76), V(x, (sy0 + sy1) / 2, floor + 1.28), 0.27, 0.27, 16),
                       C["steel"]))
        pieces.append((P.segment_bm(V(x, (sy0 + sy1) / 2, floor + 1.28), V(x, (sy0 + sy1) / 2, floor + 1.3), 0.285, 0.285, 16),
                       C["steelDark"]))
        pieces.append((P.segment_bm(V(x, (sy0 + sy1) / 2, floor + 1.3), V(x, (sy0 + sy1) / 2, floor + 1.31), 0.25, 0.25, 16),
                       C["soup"]))
    inside.append((log(V(1.25, 1.95, floor + 1.25), V(1.55, 1.5, floor + 1.75), 0.018, segments=5), C["logDark"]))
    # The prep table along the back, by the window: a cutting board, a tray of noodles, a stack of
    # bowls; a shelf of jars over it.
    px0, px1, py0, py1 = -3.3, -0.3, 1.75, yo - 0.2
    pieces.append((P.box_bm(V((px0 + px1) / 2, (py0 + py1) / 2, floor + 0.78), (px1 - px0, py1 - py0, 0.06)), C["log"]))
    for x in (px0 + 0.1, px1 - 0.1):
        for y in (py0 + 0.1, py1 - 0.1):
            pieces.append((P.box_bm(V(x, y, floor + 0.375), (0.08, 0.08, 0.75)), C["logDark"]))
    inside.append((P.box_bm(V(-2.5, 2.05, floor + 0.825), (0.6, 0.38, 0.03)), C["logEnd"]))
    inside.append((P.box_bm(V(-1.6, 2.05, floor + 0.83), (0.55, 0.38, 0.04)), C["rattan"]))
    for k in range(6):
        inside.append((log(V(-1.85, 1.92 + 0.05 * k, floor + 0.87), V(-1.35, 1.92 + 0.05 * k, floor + 0.87), 0.018,
                           segments=4), C["sprouts"]))
    for k in range(3):
        inside.append((turned([(0.0, 0.0), (0.06, 0.0), (0.15, 0.07), (0.16, 0.09), (0.0, 0.03)],
                              V(-0.75, 2.05, floor + 0.81 + 0.075 * k)), C["cream"]))
    inside.append((P.box_bm(V(-2.7, yo - 0.33, floor + 1.45), (1.0, 0.25, 0.04)), C["plank"]))
    for k, x in enumerate((-3.1, -2.85, -2.6, -2.35)):
        inside.append((turned([(0.0, 0.0), (0.06, 0.01), (0.08, 0.08), (0.05, 0.16), (0.055, 0.18), (0.0, 0.18)],
                              V(x, yo - 0.33, floor + 1.47)), C["pot"] if k % 2 else C["clayDark"]))
    # The curtain over the way in: three panels on a bamboo pole under the front beam, a pale band
    # along their top.
    pole_z = eave - 0.22
    pieces.append((log(V(-1.3, -yo + 0.02, pole_z), V(1.3, -yo + 0.02, pole_z), 0.03, segments=6), C["bamboo"]))
    for k in range(3):
        x = -0.82 + 0.82 * k
        pieces.append((oriented_box(V(x, -yo + 0.03, pole_z - 0.33), V(1, 0, 0), V(0, 1, 0), (0.78, 0.025, 0.62)),
                       C["noren"]))
        pieces.append((oriented_box(V(x, -yo + 0.0095, pole_z - 0.1), V(1, 0, 0), V(0, 1, 0), (0.78, 0.008, 0.07)),
                       C["norenLight"]))
    # Red paper lanterns hanging at the front corners, lit at night.
    for x in (-xo + 0.15, xo - 0.15):
        lz = eave - 0.75
        pieces.append((log(V(x, -yo - 0.12, eave - 0.18), V(x, -yo - 0.12, lz + 0.22), 0.012, segments=4), C["rope"]))
        for dz in (0.2, -0.2):
            pieces.append((P.segment_bm(V(x, -yo - 0.12, lz + dz - 0.025), V(x, -yo - 0.12, lz + dz + 0.025), 0.1, 0.1, 10),
                           C["chochinBand"]))
        glow.append((L.ellipsoid_bm(V(x, -yo - 0.12, lz), (0.17, 0.17, 0.21), u=12, v=8), C["chochin"]))
    # Potted plants either side of the step.
    potted_succulent(V(-1.7, -yo - 0.35, 0.0), pieces)
    potted_thistles(V(1.7, -yo - 0.35, 0.0), pieces)
    # The roof: a big thatched hip roof reaching well out over the front.
    roof = (-xo - 0.9, xo + 0.9, -yo - 1.1, yo + 0.9, eave, eave + 0.3, eave + 2.3, 2.0)
    pieces.append(hip_roof(*roof))
    far = [hip_roof(*roof, subdivide=False), (P.box_bm(V(0.0, 0.0, floor - 0.09), (2 * xo, 2 * yo, 0.18)), C["floor"])]
    far += [wall.far(C["plank"]) for wall in walls]
    body = P.join("restaurant", pieces, collection, sharp=P.SHARP)
    lights = P.join("restaurant_glow", glow, collection)
    room = P.join("restaurant_inside", inside, collection, sharp=P.SHARP)
    distant = P.join("restaurant_far", far, collection, sharp=P.SHARP)
    blocks = [
        block_box(-xo, xo, yo - t, yo, -10, eave), block_box(-xo, -xo + t, kitchen, yo, -10, eave),
        block_box(xo - t, xo, kitchen, yo, -10, eave),
        block_box(cx0, cx1, counter_y, counter_y + counter_d, floor - 0.1, top, camera=False),
        block_box(sx0, sx1, sy0, sy1, floor - 0.1, floor + 1.3, camera=False),
        block_box(px0, px1, py0, py1, floor - 0.1, floor + 0.9, camera=False),
        block_box(roof[0], roof[1], roof[2], roof[3], eave - 0.05, roof[6], walk=False),
    ]
    blocks += [{"circle": [*g(x, y), 0.17], "y": [-10, eave], "walk": True, "camera": True} for x, y in posts]
    blocks += [{"circle": [*g(x, y), 0.2], "y": [floor - 0.1, floor + 0.44], "walk": True, "camera": False}
               for x, y in stools]
    blocks += [{"circle": [*g(x, -yo - 0.35), 0.22], "y": [-0.1, 0.6], "walk": True, "camera": False} for x in (-1.7, 1.7)]
    decks = [deck_box(-xo, xo, -yo, yo, floor), deck_box(-1.3, 1.3, -yo - 0.55, -yo, 0.15)]
    return [body, lights, room, distant], {"blocks": blocks, "decks": decks, "height": roof[6]}


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
    body = P.join("stage", pieces, collection, sharp=P.SHARP)
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
    return [body], {"blocks": blocks, "decks": decks, "height": eave + 2.95}


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
    body = P.join("torch", pieces, collection, sharp=P.SHARP)
    fire = P.join("torch_flame", flame_pieces(V(0.0, 0.0, 1.98), 1.0, 0.56), collection)  # lit at night
    return [body, fire], {"footprint": {"circle": 0.15}, "height": 3.0}


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
    body = P.join("arch", pieces, collection, sharp=P.SHARP)
    lights = P.join("arch_glow", glow, collection)
    board_label = arc_label(board_half, board_z, 1.1, -0.06, "arch_label", collection)
    banner_label = arc_label(banner_half, banner_z, 0.95, 0.03, "arch_label1", collection)
    labels = [{"size": [round(2 * board_half * 0.92, 2), 1.1], "colour": "#5A3A2E"},
              {"size": [round(2 * banner_half * 0.92, 2), 0.95], "colour": "#E8679A"}]
    blocks = [{"circle": [*g(s * half, 0.0), 0.2], "y": [-10, pole_h], "walk": True, "camera": True} for s in (-1, 1)]
    return [body, lights, board_label, banner_label], {"blocks": blocks, "labels": labels, "height": pole_h + 0.3}


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
