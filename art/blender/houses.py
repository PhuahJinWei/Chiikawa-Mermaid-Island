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
    "basket": "#C9A06A",
    "flame": "#FFB347",
    "flameCore": "#FFE58A",
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

    def window(self, opening, glow):
        """A window in one of the wall's openings: a frame and sill outside, a green pane that lights
        up at night, a white zigzag lattice over it outside and a cross frame inside."""
        u0, u1, v0, v1 = opening
        w, h = u1 - u0, v1 - v0
        uc, vc = (u0 + u1) / 2, (v0 + v1) / 2
        out = []
        bar = 0.07
        for c, size in ((self.point(uc, v1 + bar / 2, -0.02), (w + 2 * bar, 0.06, bar)),
                        (self.point(uc, v0 - bar / 2, -0.03), (w + 2 * bar + 0.1, 0.1, bar)),
                        (self.point(u0 - bar / 2, vc, -0.02), (bar, 0.06, h)),
                        (self.point(u1 + bar / 2, vc, -0.02), (bar, 0.06, h))):
            out.append((oriented_box(c, self.d, self.inward, size), C["frame"]))
        glow.append((oriented_box(self.point(uc, vc, self.t / 2), self.d, self.inward, (w, 0.02, h)), C["glass"]))
        # The zigzag: a W across the pane, outside.
        pts = [(u0 + w * f, v0 + h * (0.25 if i % 2 else 0.78)) for i, f in enumerate((0.08, 0.3, 0.5, 0.7, 0.92))]
        for (pu, pv), (qu, qv) in zip(pts, pts[1:]):
            p, q = self.point(pu, pv, self.t / 2 - 0.02), self.point(qu, qv, self.t / 2 - 0.02)
            out.append((oriented_box((p + q) / 2, q - p, -self.inward, ((q - p).length + 0.03, 0.035, 0.012)),
                        C["lattice"]))
        for c, size in ((self.point(uc, vc, self.t / 2 + 0.02), (0.04, 0.02, h)),
                        (self.point(uc, vc, self.t / 2 + 0.02), (w, 0.02, 0.04))):
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
def log_stairs(x_half, y_top, y_bottom, z_top, rungs=3):
    """Log stairs as in the film: two log rails down from a porch, log rungs across them."""
    out = []
    for x in (-x_half, x_half):
        out.append((log(V(x, y_top + 0.05, z_top + 0.02), V(x, y_bottom, -0.05), 0.1), C["log"]))
    for i in range(1, rungs + 1):
        t = i / (rungs + 1)
        y = y_top + (y_bottom - y_top) * t
        z = z_top * (1 - t) - 0.05
        out.append((log(V(-x_half - 0.06, y, z), V(x_half + 0.06, y, z), 0.08), C["logDark"] if i % 2 else C["log"]))
    return out


def interior(room, floor):
    """A room's furnishing: a straw mat with a pillow, a low table, a potted plant, a rug."""
    (x0, x1), (y0, y1) = room
    out = []
    # A straw mat bed along the back wall, at the left.
    out.append((P.box_bm(V(x0 + 0.75, y1 - 0.62, floor + 0.06), (1.3, 1.05, 0.12), bevel=0.03), C["mat"]))
    for k in range(4):
        out.append((quad(V(x0 + 0.75, y1 - 0.25 - 0.25 * k, floor + 0.122), V(1, 0, 0), UP, 1.28, 0.02), C["matLine"]))
    out.append((L.ellipsoid_bm(V(x0 + 0.75, y1 - 0.28, floor + 0.2), (0.32, 0.16, 0.09), u=10, v=6), C["cream"]))
    # A low table to the right, and a rug in front of it.
    tx, ty = x1 - 1.2, y0 + 1.6
    out.append((P.box_bm(V(tx, ty, floor + 0.42), (0.9, 0.6, 0.06), bevel=0.02), C["log"]))
    for sx in (-0.38, 0.38):
        for sy in (-0.24, 0.24):
            out.append((P.box_bm(V(tx + sx, ty + sy, floor + 0.2), (0.06, 0.06, 0.4)), C["logDark"]))
    out.append((P.segment_bm(V(tx + 0.2, ty, floor + 0.45), V(tx + 0.2, ty, floor + 0.58), 0.06, 0.07, 8), C["cream"]))
    out.append((P.box_bm(V(tx - 0.9, ty - 0.1, floor + 0.01), (1.2, 0.9, 0.02)), C["cloth"]))
    # A potted plant in the front right corner.
    px, py = x1 - 0.35, y0 + 0.4
    out.append((P.segment_bm(V(px, py, floor), V(px, py, floor + 0.3), 0.14, 0.18, 10), C["pot"]))
    out.append((L.ellipsoid_bm(V(px, py, floor + 0.48), (0.22, 0.22, 0.25), u=10, v=6), C["leaf"]))
    return out


# ---------------------------------------------------------------------------- the stilt hut
def build_stilt_hut(name, pattern, collection):
    """A hut on log stilts you can walk into, as in the film's village: log stairs up to a plank
    porch, a doorway wide enough for three, lattice windows over a band of coloured scales, a
    log-cabin room inside with a straw mat, a table and a plant, and a big mushroom-shaped thatched
    roof sheltering the porch. Returns the parts and the info for the game."""
    floor, wall_h, t = 0.6, 2.45, 0.16
    xi, yi = 2.3, 1.8                     # the room inside
    xo, yo = xi + t, yi + t               # the walls' outer faces
    porch, stairs_end = -3.3, -4.6
    door = 0.68                           # half the doorway's width
    pieces, glow, inside = [], [], []

    front = Wall((-xo, -yo + t / 2), (xo, -yo + t / 2), floor, wall_h, t,
                 [(xo - door, xo + door, 0.0, 2.05), (xo - 2.0, xo - 1.1, 0.9, 1.75), (xo + 1.1, xo + 2.0, 0.9, 1.75)])
    back = Wall((xo, yo - t / 2), (-xo, yo - t / 2), floor, wall_h, t, [(xo - 0.45, xo + 0.45, 0.9, 1.75)])
    left = Wall((-xo + t / 2, yi), (-xo + t / 2, -yi), floor, wall_h, t, [(yi - 0.45, yi + 0.45, 0.9, 1.75)])
    right = Wall((xo - t / 2, -yi), (xo - t / 2, yi), floor, wall_h, t, [(yi - 0.45, yi + 0.45, 0.9, 1.75)])
    for wall in (front, back, left, right):
        pieces.extend(wall.skins(C["plank"], C["inside"]))
        pieces.extend(wall.courses(C["plankLine"], -1, start=0.95, step=0.3, until=wall_h - 0.1))
        inside.extend(wall.courses(C["insideLine"], 1))
        for o in wall.openings:
            if o[2] > 0.1:
                pieces.extend(wall.window(o, glow))
    for wall in (front, left, right):
        pieces.extend(wall.scales(pattern, 0.08, 0.86, size=0.34))

    # Log posts at the corners and either side of the door, from the ground to the roof.
    for x, y in ((-xo, -yo), (xo, -yo), (-xo, yo), (xo, yo)):
        pieces.append((log(V(x, y, -0.4), V(x, y, floor + wall_h + 0.02), 0.14), C["log"]))
    for x in (-door - 0.1, door + 0.1):
        pieces.append((log(V(x, -yo - 0.02, floor), V(x, -yo - 0.02, floor + wall_h), 0.11), C["log"]))
    pieces.append((oriented_box(V(0.0, -yo - 0.03, floor + 2.12), V(1, 0, 0), V(0, 1, 0), (2 * door + 0.3, 0.12, 0.14)),
                   C["logDark"]))

    # The floor, the porch and its railing, the stilts under them, and the log stairs.
    pieces.append((P.box_bm(V(0.0, (porch + yo) / 2, floor - 0.07), (2 * xo, yo - porch, 0.14)), C["floor"]))
    for k in range(1, 5):
        y = porch + (-yo - porch) * k / 5
        pieces.append((P.box_bm(V(0.0, y, floor + 0.002), (2 * xo - 0.02, PEN, 0.01)), C["floorLine"]))
    for x in (-xo + 0.1, 0.0, xo - 0.1):
        for y in (porch + 0.12, -yo, 0.0, yo - 0.1):
            pieces.append((log(V(x, y, -0.4), V(x, y, floor - 0.13), 0.11), C["logDark"]))
    rail = floor + 0.55
    for x0, x1, y0, y1 in ((-xo + 0.06, -xo + 0.06, -yo, porch + 0.05), (xo - 0.06, xo - 0.06, -yo, porch + 0.05),
                           (-xo, -0.62, porch + 0.05, porch + 0.05), (0.62, xo, porch + 0.05, porch + 0.05)):
        pieces.append((log(V(x0, y0, rail), V(x1, y1, rail), 0.06), C["log"]))
    for x in (-xo + 0.06, -0.62, 0.62, xo - 0.06):
        pieces.append((log(V(x, porch + 0.05, floor), V(x, porch + 0.05, rail + 0.08), 0.08), C["log"]))
    pieces.extend(log_stairs(0.62, porch, stairs_end, floor))

    inside.extend(interior(((-xi, xi), (-yi, yi)), floor))

    # The mushroom roof, sheltering the porch too.
    roof_y = -0.65
    roof = [(0.0, 3.0), (3.2, 3.0), (3.75, 2.92), (4.0, 2.86), (4.05, 3.0), (3.85, 3.45), (3.3, 4.2), (2.4, 4.9),
            (1.3, 5.35), (0.0, 5.5)]
    pieces.append(lathe_roof(roof, V(0.0, roof_y, 0.0)))
    # From afar: the roof, the walls as boxes, the porch and the stilts' shadow under them.
    far = [lathe_roof(roof, V(0.0, roof_y, 0.0), samples=8, segments=12)]
    far += [w.far(C["plank"]) for w in (front, back, left, right)]
    far.append((P.box_bm(V(0.0, (porch + yo) / 2, floor / 2 - 0.1), (2 * xo, yo - porch, floor + 0.2)), C["logDark"]))

    body = P.join(name, pieces, collection)
    lights = P.join(f"{name}_glow", glow, collection)
    room = P.join(f"{name}_inside", inside, collection)
    distant = P.join(f"{name}_far", far, collection)
    under = floor - 0.25
    blocks = [
        block_box(-xo, xo, yi, yo, -10, 3.0), block_box(-xo, -door, -yo, -yi, -10, 3.0),
        block_box(door, xo, -yo, -yi, -10, 3.0), block_box(-xo, -xi, -yo, yo, -10, 3.0),
        block_box(xi, xo, -yo, yo, -10, 3.0),
        block_box(-xo, xo, porch, yo, -10, under, camera=False),
        block_box(-xo, -xo + 0.12, porch, -yo, floor - 0.3, floor + 0.7, camera=False),
        block_box(xo - 0.12, xo, porch, -yo, floor - 0.3, floor + 0.7, camera=False),
        block_box(-xo, -0.62, porch, porch + 0.1, floor - 0.3, floor + 0.7, camera=False),
        block_box(0.62, xo, porch, porch + 0.1, floor - 0.3, floor + 0.7, camera=False),
        {"circle": [*g(0.0, roof_y), 4.05], "y": [2.95, 5.6], "walk": False, "camera": True},
    ]
    decks = [deck_box(-xo + 0.1, xo - 0.1, porch, yi, floor), deck_box(-0.62, 0.62, stairs_end, porch, floor, 0.02)]
    return [body, lights, room, distant], {"blocks": blocks, "decks": decks, "height": 5.6}


# ---------------------------------------------------------------------------- the plank hut
def build_plank_hut(name, collection):
    """A plank hut on the ground with a wide thatched hip roof, as in the film's clearing: a tall
    plank door, a window each side and at the back, a log-cabin room inside. Returns the parts and
    the info for the game."""
    floor, wall_h, t = 0.22, 2.3, 0.16
    xi, yi = 2.1, 1.7
    xo, yo = xi + t, yi + t
    step, ramp_end = -2.5, -3.1
    door = 0.65
    pieces, glow, inside = [], [], []
    front = Wall((-xo, -yo + t / 2), (xo, -yo + t / 2), floor, wall_h, t, [(xo - door, xo + door, 0.0, 1.95)])
    back = Wall((xo, yo - t / 2), (-xo, yo - t / 2), floor, wall_h, t, [(xo - 0.45, xo + 0.45, 0.85, 1.65)])
    left = Wall((-xo + t / 2, yi), (-xo + t / 2, -yi), floor, wall_h, t, [(yi - 0.45, yi + 0.45, 0.85, 1.65)])
    right = Wall((xo - t / 2, -yi), (xo - t / 2, yi), floor, wall_h, t, [(yi - 0.45, yi + 0.45, 0.85, 1.65)])
    for wall in (front, back, left, right):
        pieces.extend(wall.skins(C["plank"], C["inside"]))
        pieces.extend(wall.courses(C["plankLine"], -1, start=0.3, step=0.3))
        inside.extend(wall.courses(C["insideLine"], 1))
        for o in wall.openings:
            if o[2] > 0.1:
                pieces.extend(wall.window(o, glow))
    for x, y in ((-xo, -yo), (xo, -yo), (-xo, yo), (xo, yo)):
        pieces.append((log(V(x, y, -0.2), V(x, y, floor + wall_h), 0.12), C["log"]))
    # The tall plank door, open against the inside of the front wall.
    pieces.append((oriented_box(V(door + 0.62, -yi + 0.06, floor + 0.98), V(1, 0, 0), V(0, 1, 0), (1.25, 0.06, 1.9)),
                   C["plank"]))
    for k in (-1, 0, 1):
        pieces.append((oriented_box(V(door + 0.62 + 0.38 * k, -yi + 0.025, floor + 0.98), V(1, 0, 0), V(0, 1, 0),
                                    (PEN, 0.012, 1.86)), C["plankLine"]))
    pieces.append((P.box_bm(V(0.0, (step + yo) / 2, floor - 0.06), (2 * xo, yo - step, 0.12)), C["floor"]))
    pieces.append((P.box_bm(V(0.0, (step + ramp_end) / 2, 0.06), (1.6, step - ramp_end, 0.14)), C["log"]))
    inside.extend(interior(((-xi, xi), (-yi, yi)), floor))
    pieces.append(hip_roof(-3.1, 3.1, -2.95, 2.7, 2.45, 2.72, 5.0, 0.9))
    far = [hip_roof(-3.1, 3.1, -2.95, 2.7, 2.45, 2.72, 5.0, 0.9, subdivide=False)]
    far += [w.far(C["plank"]) for w in (front, back, left, right)]
    body = P.join(name, pieces, collection)
    lights = P.join(f"{name}_glow", glow, collection)
    room = P.join(f"{name}_inside", inside, collection)
    distant = P.join(f"{name}_far", far, collection)
    top = 2.45
    blocks = [
        block_box(-xo, xo, yi, yo, -10, top), block_box(-xo, -door, -yo, -yi, -10, top),
        block_box(door, xo, -yo, -yi, -10, top), block_box(-xo, -xi, -yo, yo, -10, top),
        block_box(xi, xo, -yo, yo, -10, top),
        block_box(-3.1, 3.1, -2.95, 2.7, 2.4, 5.0, walk=False),
    ]
    decks = [deck_box(-xo + 0.1, xo - 0.1, step, yi, floor), deck_box(-0.8, 0.8, ramp_end, step, floor, 0.02)]
    return [body, lights, room, distant], {"blocks": blocks, "decks": decks, "height": 5.0}


# ---------------------------------------------------------------------------- the stage
def build_stage(collection):
    """The village's watchtower stage, where announcements are made: four log legs braced with
    crossed boards, a plank platform three metres up with a railing, stairs up its back, and a
    conical thatched roof on the legs. Its front faces the plaza (-Y)."""
    top, half, post = 3.0, 1.5, 0.15
    pieces = []
    for x in (-half, half):
        for y in (-half, half):
            pieces.append((log(V(x, y, -0.3), V(x, y, 5.35), post), C["log"]))
    # Crossed boards between the legs on every side, and boards across top and bottom.
    for a, b in (((-half, -half), (half, -half)), ((half, -half), (half, half)),
                 ((half, half), (-half, half)), ((-half, half), (-half, -half))):
        pa, pb = V(a[0], a[1], 0.0), V(b[0], b[1], 0.0)
        out = Vector((pa.x + pb.x, pa.y + pb.y, 0.0)).normalized() * 0.08
        for z0, z1 in ((0.4, 2.75), (2.75, 0.4)):
            p, q = pa + V(0, 0, z0) + out, pb + V(0, 0, z1) + out
            pieces.append((oriented_box((p + q) / 2, q - p, out, ((q - p).length, 0.06, 0.2)), C["plank"]))
        for z in (0.4, 2.75):
            p, q = pa + V(0, 0, z) + out * 1.6, pb + V(0, 0, z) + out * 1.6
            pieces.append((oriented_box((p + q) / 2, q - p, out, ((q - p).length + 0.2, 0.06, 0.22)), C["logDark"]))
    pieces.append((P.box_bm(V(0.0, 0.0, top - 0.08), (3.6, 3.6, 0.16)), C["floor"]))
    for k in range(1, 6):
        pieces.append((P.box_bm(V(-1.8 + 0.6 * k, 0.0, top + 0.002), (PEN, 3.56, 0.01)), C["floorLine"]))
    # The railing round the platform, open at the top of the stairs.
    for z in (top + 0.45, top + 0.85):
        for a, b in (((-1.75, -1.75), (1.75, -1.75)), ((1.75, -1.75), (1.75, 1.75)), ((-1.75, 1.75), (-1.75, -1.75)),
                     ((-1.75, 1.75), (0.3, 1.75)), ((1.3, 1.75), (1.75, 1.75))):
            pieces.append((log(V(a[0], a[1], z), V(b[0], b[1], z), 0.06), C["log"]))
    for x in (0.3, 1.3):
        pieces.append((log(V(x, 1.75, top), V(x, 1.75, top + 0.9), 0.07), C["log"]))
    # Stairs down the back: two stringers and treads.
    y0, y1 = 1.8, 6.0
    for x in (0.3, 1.3):
        pieces.append((log(V(x, y0, top + 0.05), V(x, y1, -0.1), 0.08), C["logDark"]))
    steps = 10
    for i in range(1, steps):
        f = i / steps
        pieces.append((P.box_bm(V(0.8, y0 + (y1 - y0) * f, top * (1 - f) - 0.04), (1.0, 0.32, 0.07)), C["plank"]))
    pieces.append(lathe_roof([(0.0, 5.2), (2.6, 5.2), (3.0, 5.12), (3.1, 5.22), (2.7, 5.7), (1.6, 6.6), (0.6, 7.3),
                              (0.0, 7.5)], V(0.0, 0.0, 0.0), samples=12, seed=1.3))
    body = P.join("stage", pieces, collection)
    rail = (top - 0.3, top + 1.0)
    blocks = [{"circle": [*g(x, y), 0.2], "y": [-10, 7.5], "walk": True, "camera": True}
              for x in (-half, half) for y in (-half, half)]
    blocks += [
        block_box(-1.8, 1.8, -1.8, 1.8, -10, top - 0.4),
        block_box(-1.8, 1.8, -1.8, -1.7, *rail, camera=False), block_box(-1.8, -1.7, -1.8, 1.8, *rail, camera=False),
        block_box(1.7, 1.8, -1.8, 1.8, *rail, camera=False), block_box(-1.8, 0.3, 1.7, 1.8, *rail, camera=False),
        block_box(1.3, 1.8, 1.7, 1.8, *rail, camera=False),
        block_box(0.25, 0.35, 1.8, 6.0, 0.35, top + 0.2, camera=False),
        block_box(1.25, 1.35, 1.8, 6.0, 0.35, top + 0.2, camera=False),
        {"circle": [0.0, 0.0, 3.1], "y": [5.1, 7.5], "walk": False, "camera": True},
    ]
    # The stairs rise toward the tower: from the ground at Blender y1 (the deck's back edge in the
    # game's frame) to the platform at y0 (its front edge), reaching a little onto the platform so
    # there is no gap between them.
    stairs = deck_box(0.35, 1.25, y0 - 0.15, y1, 0.02, top)
    decks = [deck_box(-1.75, 1.75, -1.75, 1.75, top), stairs]
    return [body], {"blocks": blocks, "decks": decks, "height": 7.5}


def build_torch(collection):
    """A tiki torch: a pole with a woven cup on top, its cartoon flame lit only at night."""
    pieces = [(log(V(0.0, 0.0, -0.2), V(0.0, 0.0, 1.85), 0.05, segments=6), C["torch"])]
    cup = L.Profile([(0.0, 1.78), (0.1, 1.8), (0.16, 2.0), (0.15, 2.05), (0.0, 2.0)], samples=6)
    pieces.append((L.lathe_bm(cup.samples, segments=8), C["basket"]))
    flame = L.Profile([(0.0, 1.98), (0.15, 2.08), (0.16, 2.24), (0.09, 2.44), (0.0, 2.62)], samples=8)
    outer = L.lathe_bm(flame.samples, segments=8)
    core = L.Profile([(0.0, 2.0), (0.08, 2.08), (0.08, 2.2), (0.0, 2.36)], samples=5)
    inner = L.lathe_bm(core.samples, segments=6)
    L.transformed(inner, Matrix.Translation(V(0.0, -0.06, 0.0)))
    body = P.join("torch", pieces, collection)
    fire = P.join("torch_flame", [(outer, C["flame"]), (inner, C["flameCore"])], collection)  # lit at night
    return [body, fire], {"footprint": {"circle": 0.15}, "height": 2.6}


# ---------------------------------------------------------------------------- the festival street
def flower_bm(centre, normal, radius):
    """A five-petalled yellow flower facing `normal`, with an orange middle."""
    n = normal.normalized()
    side = n.cross(UP if abs(n.z) < 0.9 else Vector((1.0, 0.0, 0.0))).normalized()
    other = n.cross(side)
    petals = bmesh.new()
    hub = petals.verts.new(centre)
    ring = []
    for i in range(10):
        a = 2.0 * math.pi * i / 10
        r = radius * (1.0 if i % 2 == 0 else 0.62)
        ring.append(petals.verts.new(centre + side * (math.cos(a) * r) + other * (math.sin(a) * r)))
    for i in range(10):
        petals.faces.new((hub, ring[i], ring[(i + 1) % 10]))
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


def lantern_stack(x, y, z0, count, glow, pieces):
    """Paper lanterns stacked on a pole, pink, lit at night."""
    for k in range(count):
        c = V(x, y, z0 + k * 0.36)
        glow.append((L.ellipsoid_bm(c, (0.17, 0.17, 0.16), u=10, v=6), C["lantern"]))
        pieces.append((P.segment_bm(c - V(0, 0, 0.17), c - V(0, 0, 0.13), 0.09, 0.09, 8), C["frame"]))


def build_arch(collection):
    """The welcome arch over the festival street: two tall poles with gold balls and ribbons, an
    arching wooden board for 島へようこそ!! wreathed in big yellow flowers, a white banner hung below
    it, and paper lanterns stacked on the poles."""
    half, pole_h = 4.4, 4.9
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
        lantern_stack(x, -0.18, 0.95, 3, glow, pieces)
    board, board_z = arc_strip(4.1, 4.45, 4.05, 0.85, 0.0, 0.1)
    pieces.append((board, C["board"]))
    for dz in (0.43, -0.43):
        edge, _ = arc_strip(4.1, 4.45 + dz, 4.05 + dz, 0.04, -0.06, 0.02)
        pieces.append((edge, C["boardEdge"]))
    # Garlands of yellow flowers along the board's edges and down the poles, with leaves.
    front = V(0.0, -1.0, 0.0)
    k, x = 0, -4.2
    while x <= 4.2:
        for dz in (0.47, -0.47):
            z = board_z(max(-4.1, min(4.1, x))) + dz + 0.06 * math.sin(k * 2.3)
            r = 0.17 + 0.04 * math.sin(k * 1.7)
            pieces += flower_bm(V(x, -0.12, z), front + V(0.15 * math.sin(k), 0.0, 0.25 * math.cos(k * 1.3)), r)
            leaf = V(x + 0.17, -0.09, z - 0.06 * math.copysign(1, dz))
            pieces.append((L.ellipsoid_bm(leaf, (0.13, 0.03, 0.07), u=6, v=4), C["vine"]))
            k += 1
        x += 0.36
    for s in (-1.0, 1.0):
        for i in range(9):
            z = 4.1 - i * 0.33
            pieces += flower_bm(V(s * (half - 0.14), -0.14, z), front + V(-s * 0.4, 0.0, 0.1), 0.15 + 0.03 * math.sin(i))
            pieces.append((L.ellipsoid_bm(V(s * (half + 0.1), -0.1, z - 0.15), (0.06, 0.03, 0.13), u=6, v=4), C["vine"]))
    banner, banner_z = arc_strip(4.3, 3.0, 3.25, 0.62, 0.05, 0.03)
    pieces.append((banner, C["white"]))
    body = P.join("arch", pieces, collection)
    lights = P.join("arch_glow", glow, collection)
    board_label = arc_label(4.1, board_z, 0.62, -0.06, "arch_label", collection)
    banner_label = arc_label(4.3, banner_z, 0.46, 0.03, "arch_label1", collection)
    labels = [{"size": [7.6, 0.62], "colour": "#5A3A2E"}, {"size": [7.9, 0.46], "colour": "#E8679A"}]
    blocks = [{"circle": [*g(s * half, 0.0), 0.2], "y": [-10, pole_h], "walk": True, "camera": True} for s in (-1, 1)]
    return [body, lights, board_label, banner_label], {"blocks": blocks, "labels": labels, "height": 5.1}


def build_banner(collection):
    """A white cloth banner strung across the festival street between two poles standing just in
    front of the stalls on either side, for words in pink."""
    half, pole_h = 4.3, 4.3
    pieces = []
    for s in (-1.0, 1.0):
        pieces.append((log(V(s * half, 0.0, -0.3), V(s * half, 0.0, pole_h), 0.07, segments=6), C["torch"]))
        pieces.append((L.ellipsoid_bm(V(s * half, 0.0, pole_h + 0.08), (0.1, 0.1, 0.1), u=8, v=5), C["gold"]))
    cloth, cloth_z = arc_strip(4.2, 3.45, 3.75, 0.62, 0.0, 0.03)
    pieces.append((cloth, C["white"]))
    body = P.join("banner", pieces, collection)
    label = arc_label(4.2, cloth_z, 0.48, -0.02, "banner_label", collection)
    blocks = [{"circle": [*g(s * half, 0.0), 0.14], "y": [-10, pole_h], "walk": True, "camera": True} for s in (-1, 1)]
    return [body, label], {"blocks": blocks, "labels": [{"size": [7.7, 0.48], "colour": "#E8679A"}], "height": 4.4}


def build_lantern_pole(collection):
    """A pole with pink paper lanterns stacked on it, lit at night."""
    pieces, glow = [(log(V(0.0, 0.0, -0.3), V(0.0, 0.0, 2.7), 0.06, segments=6), C["torch"])], []
    lantern_stack(0.0, -0.15, 1.35, 3, glow, pieces)
    body = P.join("lanterns", pieces, collection)
    lights = P.join("lanterns_glow", glow, collection)
    return [body, lights], {"footprint": {"circle": 0.15}, "height": 2.8}
