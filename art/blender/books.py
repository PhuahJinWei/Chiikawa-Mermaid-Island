"""The island's one book to read (the user, 2026-10-23): 伝説の生物図鑑, the film's big clothbound picture
encyclopedia, after its frames (the spread with the mermaid on it, the book standing, its spine on Hitoha and
Futaba's shelf, Hachiware reading it held open under the chin). Shut, a thick hardcover: rust boards standing a
little past its pale pages, its spine rounded out. Open, its pages arch up out of the gutter and down to their
edges, over boards tipped up a little either side of the spine.

Its cover (back, spine and front: one picture wrapped round it) and its spread (both pages: one picture) are the
user's paintings, over templates this draws into art/books/_guides/, as the signs' are (build_signs.py): a
painting is copied into the game's pictures, the cover's (book_cover.webp) and the spread's (book_pages.webp, and a
quarter its size, book_pages_far.webp, for a book read by someone else). Until there is a painting, the cover is plain
cloth and the pages carry faint lines of writing. How to paint them: art/books/README.md.

Blender's frame, as every thing one carries (build_items.py): shut, it lies on its back cover, its front up
(+Z), its head away (+Y) and its spine on its left (-X: bound on the left, as a picture encyclopedia written
across is), its origin under its middle. Open (the parts the game shows while it is read: `_open0` and `_page0`
its right half, staying put, `_open1` and `_page1` its left, which swings shut over the right about HINGE), it
lies open, pages up, its spine along Y at x 0 under the gutter, the middle of its tail at the origin. Every face
takes its colour from one of the two pictures (UV mapped; vertex colours white): the cover's, the wrap over its
top and, under that, a strip of page edges and a patch of the cloth (COVER_SIZE); or the spread's (the pages'
tops, PAGES_SIZE), which the game loads only while someone reads.
"""

import hashlib
import json
import math
import os
import sys

import bmesh
import bpy
import numpy as np
from mathutils import Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import build_signs as S  # noqa: E402  (lettering the templates, resizing the paintings)
import charlib as L  # noqa: E402
import face_art as F  # noqa: E402

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
ART = os.path.join(ROOT, "art", "books")
GUIDES = os.path.join(ART, "_guides")
# What this script last drew in GUIDES, each template's SHA-1, so it redraws only templates no one has changed.
DRAWN = os.path.join(GUIDES, "_drawn.json")
PROPS = os.path.join(ROOT, "public", "models", "props")
COVER_FILE = os.path.join(PROPS, "book_cover.webp")
PAGES_FILE = os.path.join(PROPS, "book_pages.webp")
# The spread FAR times smaller, for a book someone else reads (or yours in the water), never read close.
PAGES_FAR_FILE = os.path.join(PROPS, "book_pages_far.webp")
FAR = 4

# ---------------------------------------------------------------------------- its size (metres)
# A page, shut: across (spine to fore-edge) and tall; the pages' block, thick; a board, thick; how far the
# boards stand past the pages at the head, the tail and the fore-edge (the squares); how far the spine rounds
# out past the boards' backs. As big for the cast (a metre tall) as the film's is for Hachiware, held open
# under his chin, wider than half his face.
PAGE_W = 0.24
PAGE_H = 0.32
BLOCK = 0.06
BOARD = 0.0055
SQUARE = 0.007
BULGE = 0.01
THICK = BLOCK + 2 * BOARD
BOARD_W = PAGE_W + SQUARE
BOARD_H = PAGE_H + 2 * SQUARE
# Every piece stands this far into what it stands on, so no two faces lie in one plane.
INTO = 0.001
# Open: each half tipped up this far either side of the spine (radians); the halves' pages this far apart at the
# gutter, and their cloth this far into the other half's (no seam between them); how far the pages' fore-edges
# stand in from the boards' edges more than shut.
TILT = math.radians(7)
SEP = 0.00015
SLAB_IN = 0.0008
FORE_IN = 0.004
# How far short of lying on the right half the left one swings shut (radians), so they never meet in one plane.
SHUT_GAP = 0.05
SHARP = math.radians(70)

# The film's colours: the cloth (the frames' rust, between the standing book's and the shelf's under its pink
# light), the pages (a cool pale paper) and the lines of the page edges.
CLOTH = "#A65A3F"
PAPER = "#F2F2EA"
PAGE_LINES = "#A39A8C"


def srgb(hex_colour):
    return np.array([int(hex_colour[i:i + 2], 16) for i in (1, 3, 5)], dtype=np.float32) / 255.0


# ---------------------------------------------------------------------------- shapes
def ellipse_arc(a, b, n=256):
    """The length of half an ellipse round from one end of its `b` axis to the other, `a` out."""
    pts = [(a * math.cos(t), b * math.sin(t)) for t in np.linspace(-math.pi / 2, math.pi / 2, n + 1)]
    return sum(math.dist(p, q) for p, q in zip(pts, pts[1:]))


# The spine, shut: half an ellipse round from the back board to the front (a little past both, as a hinge's
# ridge), its flat side inside the boards and the pages.
SPINE_A = BULGE + 0.002
SPINE_B = THICK / 2 + 0.0005
SPINE_ARC = ellipse_arc(SPINE_A, SPINE_B)
# The cover's picture, wrapped round it shut: the back cover, the spine, the front cover, side by side.
WRAP_W = 2 * BOARD_W + SPINE_ARC
U_BACK = BOARD_W / WRAP_W
U_FRONT = 1.0 - U_BACK


def catmull(points, per=8):
    """A smooth line through `points` (x, z), `per` steps between each two."""
    out = []
    p = [points[0]] + list(points) + [points[-1]]
    for i in range(1, len(p) - 2):
        p0, p1, p2, p3 = (np.array(q, dtype=np.float64) for q in p[i - 1:i + 3])
        for k in range(per):
            t = k / per
            out.append(0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t
                              + (-p0 + 3 * p1 - 3 * p2 + p3) * t ** 3))
    out.append(np.array(points[-1], dtype=np.float64))
    return [(float(x), float(z)) for x, z in out]


def page_profile():
    """An open page's top, from the gutter out to its fore-edge, (x out from the spine's middle, z up from the
    board's inside): down in the gutter, up steeply and over, easing down to the edge, as the film's arch."""
    fore = THICK / 2 + PAGE_W - FORE_IN
    keys = [(SEP, 0.004), (0.004, 0.017), (0.011, 0.029), (0.022, 0.0365), (0.04, 0.0395), (0.08, 0.0395),
            (0.14, 0.037), (0.2, 0.0335), (fore, 0.031)]
    return catmull(keys)


PROFILE = page_profile()
PROFILE_S = np.concatenate([[0.0], np.cumsum([math.dist(p, q) for p, q in zip(PROFILE, PROFILE[1:])])])
# A page's width on the spread's picture: its top's length, gutter to edge.
PAGE_ARC = float(PROFILE_S[-1])

# ---------------------------------------------------------------------------- the pictures
# The cover's: the wrap over the top WRAP_ROWS rows; under it, the page edges' strip (EDGE_COLS wide) and
# beside it a patch of plain cloth, for the boards' edges and insides. The spread's: both pages side by side,
# as tall as a phone held sideways shows it, read close (1024 rows).
COVER_SIZE = (1024, 640)
WRAP_ROWS = round(COVER_SIZE[0] * BOARD_H / WRAP_W)
BAND = (WRAP_ROWS + 4, COVER_SIZE[1])
EDGE_COLS = (0, 700)
CLOTH_COLS = (716, COVER_SIZE[0])
PAGES_SIZE = (int(round(1024 * 2 * PAGE_ARC / PAGE_H / 32) * 32), 1024)
# The templates, this many times the game's pictures, to paint on.
PAINT_SCALE = 2


def v_of(row, size=COVER_SIZE):
    """A picture's row (from its top) as Blender's v (up from its bottom; the glTF export turns it over)."""
    return 1.0 - row / size[1]


V_WRAP = (v_of(WRAP_ROWS), 1.0)
V_EDGE = (v_of(BAND[1] - 2), v_of(BAND[0] + 2))
U_EDGE = ((EDGE_COLS[0] + 4) / COVER_SIZE[0], (EDGE_COLS[1] - 4) / COVER_SIZE[0])
UV_CLOTH = ((CLOTH_COLS[0] + CLOTH_COLS[1]) / 2 / COVER_SIZE[0], v_of((BAND[0] + BAND[1]) / 2))


def wrap_v(y):
    """Up the wrap, from the boards' tail (y -BOARD_H/2) to their head."""
    return V_WRAP[0] + (y + BOARD_H / 2) / BOARD_H * (V_WRAP[1] - V_WRAP[0])


def edge_uv(along, across):
    """On the page edges' strip: `along` an edge and `across` the pages' thickness, each 0 to 1."""
    return (U_EDGE[0] + along * (U_EDGE[1] - U_EDGE[0]), V_EDGE[0] + across * (V_EDGE[1] - V_EDGE[0]))


class Mesher:
    """Faces with their corners' UVs, joined where they meet (a curve smooth, a box's corners sharp: see obj),
    each turned to face the way it is told."""

    def __init__(self):
        self.bm = bmesh.new()
        self.uv = self.bm.loops.layers.uv.new("UVMap")
        self.verts = {}

    def vert(self, co):
        key = tuple(round(c * 1e6) for c in co)
        v = self.verts.get(key)
        if v is None:
            v = self.verts[key] = self.bm.verts.new(co)
        return v

    def face(self, cos, uvs, out):
        """A face through `cos` (points), its corners at `uvs`, facing `out` (a direction)."""
        n = Vector((0.0, 0.0, 0.0))
        for a, b in zip(cos, cos[1:] + cos[:1]):
            n.x += (a[1] - b[1]) * (a[2] + b[2])
            n.y += (a[2] - b[2]) * (a[0] + b[0])
            n.z += (a[0] - b[0]) * (a[1] + b[1])
        if n.dot(Vector(out)) < 0:
            cos, uvs = cos[::-1], uvs[::-1]
        f = self.bm.faces.new([self.vert(c) for c in cos])
        for loop, uv in zip(f.loops, uvs):
            loop[self.uv].uv = uv
        return f


def obj(name, mesher, collection):
    """The faces as an object: white vertex colours (its pictures colour it), smooth where its faces meet gently."""
    mesh = bpy.data.meshes.new(name)
    mesher.bm.to_mesh(mesh)
    mesher.bm.free()
    col = mesh.color_attributes.new("Col", "FLOAT_COLOR", "POINT")
    col.data.foreach_set("color", [1.0] * (4 * len(mesh.vertices)))
    mesh.color_attributes.active_color = col
    try:
        mesh.color_attributes.render_color_index = mesh.color_attributes.active_color_index
    except AttributeError:
        pass
    mesh.shade_smooth()
    mesh.set_sharp_from_angle(angle=SHARP)
    o = bpy.data.objects.new(name, mesh)
    collection.objects.link(o)
    return o


def box(m, lo, hi, uv_of):
    """A box from `lo` to `hi`, each face's corners mapped by `uv_of(face, corner)`: face one of '-x', '+x', '-y',
    '+y', '-z', '+z'."""
    (x0, y0, z0), (x1, y1, z1) = lo, hi
    faces = {
        "-z": ([(x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0)], (0, 0, -1)),
        "+z": ([(x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1)], (0, 0, 1)),
        "-x": ([(x0, y0, z0), (x0, y1, z0), (x0, y1, z1), (x0, y0, z1)], (-1, 0, 0)),
        "+x": ([(x1, y0, z0), (x1, y1, z0), (x1, y1, z1), (x1, y0, z1)], (1, 0, 0)),
        "-y": ([(x0, y0, z0), (x1, y0, z0), (x1, y0, z1), (x0, y0, z1)], (0, -1, 0)),
        "+y": ([(x0, y1, z0), (x1, y1, z0), (x1, y1, z1), (x0, y1, z1)], (0, 1, 0)),
    }
    for key, (cos, out) in faces.items():
        m.face(cos, [uv_of(key, c) for c in cos], out)


def cloth(face, c):
    return UV_CLOTH


def shut(name, collection, cover=None):
    """The book shut, lying on its back: its back board, its pages' block, its front board and its rounded spine
    (see the module's notes). `cover`: an image for its material, which only the build's icon shows."""
    m = Mesher()
    xh = (BULGE - BOARD_W) / 2          # the boards' backs: the book centred across, its spine out past them
    xf = xh + BOARD_W                   # the boards' fore-edges

    def back(face, c):
        if face == "-z":
            return (U_BACK * (xf - c[0]) / BOARD_W, wrap_v(c[1]))
        return UV_CLOTH

    def front(face, c):
        if face == "+z":
            return (U_FRONT + (1.0 - U_FRONT) * (c[0] - xh) / BOARD_W, wrap_v(c[1]))
        return UV_CLOTH

    box(m, (xh, -BOARD_H / 2, 0.0), (xf, BOARD_H / 2, BOARD), back)
    box(m, (xh, -BOARD_H / 2, THICK - BOARD), (xf, BOARD_H / 2, THICK), front)
    z0, z1 = BOARD - INTO, THICK - BOARD + INTO

    def block(face, c):
        across = (c[2] - z0) / (z1 - z0)
        if face == "+x":
            return edge_uv((c[1] + PAGE_H / 2) / PAGE_H, across)
        if face in ("-y", "+y"):
            return edge_uv((c[0] - xh) / PAGE_W, across)
        return UV_CLOTH

    box(m, (xh, -PAGE_H / 2, z0), (xh + PAGE_W, PAGE_H / 2, z1), block)
    # The spine: round from the back board to the front, its flat side into the boards and the pages.
    xc = xh + 0.002
    n = 16
    ring = [(xc - SPINE_A * math.cos(t), THICK / 2 + SPINE_B * math.sin(t)) for t in np.linspace(-math.pi / 2, math.pi / 2, n + 1)]
    s = np.concatenate([[0.0], np.cumsum([math.dist(p, q) for p, q in zip(ring, ring[1:])])])
    s /= s[-1]
    y0, y1 = -BOARD_H / 2, BOARD_H / 2
    for i in range(n):
        (xa, za), (xb, zb) = ring[i], ring[i + 1]
        ua, ub = U_BACK + s[i] * (U_FRONT - U_BACK), U_BACK + s[i + 1] * (U_FRONT - U_BACK)
        mid = ((xa + xb) / 2 - xc, 0.0, (za + zb) / 2 - THICK / 2)
        m.face([(xa, y0, za), (xb, y0, zb), (xb, y1, zb), (xa, y1, za)],
               [(ua, wrap_v(y0)), (ub, wrap_v(y0)), (ub, wrap_v(y1)), (ua, wrap_v(y1))], mid)
    for y, way in ((y0, -1), (y1, 1)):
        m.face([(x, y, z) for x, z in ring], [UV_CLOTH] * len(ring), (0, way, 0))
    m.face([(xc, y0, ring[0][1]), (xc, y1, ring[0][1]), (xc, y1, ring[-1][1]), (xc, y0, ring[-1][1])],
           [UV_CLOTH] * 4, (1, 0, 0))
    o = obj(name, m, collection)
    if cover is not None:
        o.data.materials.append(icon_material(cover))
    return o


def turned(p, side):
    """A point of the right half as it lies open (tipped up TILT about the spine), or its mirror on the left."""
    x, y, z = p
    c, s = math.cos(TILT), math.sin(TILT)
    return (side * (x * c - z * s), y + BOARD_H / 2, x * s + z * c)


def turned_way(w, side):
    x, y, z = w
    c, s = math.cos(TILT), math.sin(TILT)
    return (side * (x * c - z * s), y, x * s + z * c)


def open_half(side, cover_mesher, page_mesher):
    """Half the book lying open (side 1 its right, the back's; -1 its left, the front's), in the half's own
    frame and then tipped up and placed (see turned): its cloth (half the spine and its board, one slab), its
    pages' block, and the top of its pages, the spread's picture over them."""

    def face(m, cos, uvs, out):
        m.face([turned(c, side) for c in cos], uvs, turned_way(out, side))

    def wrap_u(x):
        # Out from the spine's middle: across half the spine, then the board out to its edge; on the left the
        # front's, mirrored.
        if x <= THICK / 2:
            u = 0.5 - (x / (THICK / 2)) * (0.5 - U_BACK)
        else:
            u = U_BACK * (1.0 - (x - THICK / 2) / BOARD_W)
        return u if side > 0 else 1.0 - u

    x0, xm, x1 = -SLAB_IN, THICK / 2, THICK / 2 + BOARD_W
    y0, y1 = -BOARD_H / 2, BOARD_H / 2
    # The slab: its outside the wrap's (split where the spine meets the board), the rest plain cloth; a little past
    # the spine's middle into the other half's, so no seam shows between them.
    for a, b in ((x0, xm), (xm, x1)):
        face(cover_mesher, [(a, y0, 0.0), (b, y0, 0.0), (b, y1, 0.0), (a, y1, 0.0)],
             [(wrap_u(a), wrap_v(y0)), (wrap_u(b), wrap_v(y0)), (wrap_u(b), wrap_v(y1)), (wrap_u(a), wrap_v(y1))],
             (0, 0, -1))
    face(cover_mesher, [(x0, y0, BOARD), (x1, y0, BOARD), (x1, y1, BOARD), (x0, y1, BOARD)], [UV_CLOTH] * 4, (0, 0, 1))
    for x, way in ((x0, -1), (x1, 1)):
        face(cover_mesher, [(x, y0, 0.0), (x, y1, 0.0), (x, y1, BOARD), (x, y0, BOARD)], [UV_CLOTH] * 4, (way, 0, 0))
    for y, way in ((y0, -1), (y1, 1)):
        face(cover_mesher, [(x0, y, 0.0), (x1, y, 0.0), (x1, y, BOARD), (x0, y, BOARD)], [UV_CLOTH] * 4, (0, way, 0))
    # The pages' block, under the top of its pages (page_mesher's): its edges the page edges' strip.
    zb = BOARD - INTO
    top = [(x, BOARD + z) for x, z in PROFILE]
    fore = top[-1][0]
    high = max(z for _, z in top) - zb
    section = [(top[0][0], zb), (fore, zb)] + top[::-1]
    for y, way in ((-PAGE_H / 2, -1), (PAGE_H / 2, 1)):
        face(cover_mesher, [(x, y, z) for x, z in section],
             [edge_uv(x / fore, (z - zb) / high) for x, z in section], (0, way, 0))
    face(cover_mesher, [(fore, -PAGE_H / 2, zb), (fore, PAGE_H / 2, zb), (fore, PAGE_H / 2, top[-1][1]),
                        (fore, -PAGE_H / 2, top[-1][1])],
         [edge_uv(0.0, 0.0), edge_uv(1.0, 0.0), edge_uv(1.0, (top[-1][1] - zb) / high),
          edge_uv(0.0, (top[-1][1] - zb) / high)], (1, 0, 0))
    g = top[0][0]
    face(cover_mesher, [(g, -PAGE_H / 2, zb), (fore, -PAGE_H / 2, zb), (fore, PAGE_H / 2, zb), (g, PAGE_H / 2, zb)],
         [UV_CLOTH] * 4, (0, 0, -1))
    face(cover_mesher, [(g, -PAGE_H / 2, zb), (g, PAGE_H / 2, zb), (g, PAGE_H / 2, top[0][1]),
                        (g, -PAGE_H / 2, top[0][1])], [UV_CLOTH] * 4, (-1, 0, 0))
    # The top of its pages: the spread's picture, by the length along it from the gutter (its middle).
    for i in range(len(top) - 1):
        (xa, za), (xb, zb2) = top[i], top[i + 1]
        ua = 0.5 + side * 0.5 * PROFILE_S[i] / PAGE_ARC
        ub = 0.5 + side * 0.5 * PROFILE_S[i + 1] / PAGE_ARC
        up = (-(zb2 - za), 0.0, xb - xa)
        face(page_mesher, [(xa, -PAGE_H / 2, za), (xb, -PAGE_H / 2, zb2), (xb, PAGE_H / 2, zb2), (xa, PAGE_H / 2, za)],
             [(ua, 0.0), (ub, 0.0), (ub, 1.0), (ua, 1.0)], up)


def hinge():
    """Where the left half swings shut about (in the game's frame, y up: a line along z through this point): the
    pages' crest by the gutter, where the two halves' pages meet shut."""
    crest = max((turned((x, 0.0, BOARD + z), 1) for x, z in PROFILE if x < 0.06), key=lambda p: p[2])
    return [0.0, round(crest[2], 5), 0.0]


def open_parts(name, collection):
    """The book lying open, as the game shows it while it is read: `{name}_open0`, `{name}_page0` (its right half's
    cloth and block, and the top of its pages) and `{name}_open1`, `{name}_page1` (its left's)."""
    out = []
    for i, side in enumerate((1, -1)):
        cover, page = Mesher(), Mesher()
        open_half(side, cover, page)
        out += [obj(f"{name}_open{i}", cover, collection), obj(f"{name}_page{i}", page, collection)]
    return out


def info():
    """What the game needs to know of it beyond its parts: the hinge the left half swings shut about, and how far it
    swings to lie shut over the right (both halves tipped up TILT, and short of meeting by SHUT_GAP)."""
    return {"hinge": hinge(), "swing": round(math.pi - 2 * TILT - SHUT_GAP, 5)}


def icon_material(image_path):
    """A material showing the cover's picture, for the icon's render (the game's export takes no materials)."""
    mat = bpy.data.materials.new("book_cover")
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    tex = nodes.new("ShaderNodeTexImage")
    tex.image = bpy.data.images.load(image_path, check_existing=True)
    bsdf = nodes.get("Principled BSDF")
    if bsdf is not None:
        mat.node_tree.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    return mat


# ---------------------------------------------------------------------------- the pictures
def dashes(img, rows, cols, row_ys, thick, colour, alpha, rng, lengths, gaps):
    """Rows of short rounded strokes across `img` within `rows` x `cols` (pixels): at each of `row_ys` (shares down
    the area), strokes `lengths` long with `gaps` between (pixels, from, to)."""
    r0, r1 = rows
    c0, c1 = cols
    h, w = img.shape[:2]
    yy, xx = np.mgrid[0:h, 0:w]
    for share in row_ys:
        y = r0 + share * (r1 - r0)
        x = c0 + rng.uniform(*gaps)
        while x < c1:
            length = rng.uniform(*lengths)
            end = min(x + length, c1)
            if end - x > thick:
                # A stroke with round ends: within `thick`/2 of its line.
                ys, ye = max(0, int(y - thick)), min(h, int(y + thick) + 1)
                xs, xe = max(0, int(x - thick)), min(w, int(end + thick) + 1)
                px = np.clip(xx[ys:ye, xs:xe], x, end)
                d = np.hypot(xx[ys:ye, xs:xe] - px, yy[ys:ye, xs:xe] - y)
                cover = np.clip(thick / 2 + 0.5 - d, 0.0, 1.0) * alpha
                patch = img[ys:ye, xs:xe, :3]
                img[ys:ye, xs:xe, :3] = patch * (1.0 - cover[..., None]) + colour * cover[..., None]
            x = end + rng.uniform(*gaps)


def page_edges(width, height, rng):
    """The page edges' strip: pale paper with lines of the pages along it, as the film's book's edge shows them."""
    img = np.ones((height, width, 4), dtype=np.float32)
    img[..., :3] = srgb(PAPER) * 0.94
    dashes(img, (0, height), (0, width), (0.2, 0.4, 0.6, 0.8), max(2.0, height * 0.07), srgb(PAGE_LINES), 0.85, rng,
           (20, 110), (8, 40))
    return img


def writing(img, cols, rows, rng, scale):
    """Faint lines of writing on a page (within `cols` x `rows`), till the spread is painted."""
    dashes(img, rows, cols, list(np.arange(0.06, 0.97, 0.075)), 7 * scale, ink(), 0.35, rng,
           (40 * scale, 220 * scale), (14 * scale, 60 * scale))


def ink():
    """The film's dark brown, which black paint becomes (face_art's)."""
    return np.clip(F.INK, 0.0, 1.0).astype(np.float32)


def gutter_cols(width):
    """How far either side of the spread's middle the pages curve down into the gutter (pixels, out of `width`):
    what is painted there is seen edge on, if at all."""
    steep = next(i for i, (x, z) in enumerate(PROFILE) if x > 0.012)
    return int(round(PROFILE_S[steep] / PAGE_ARC * width / 2))


def cover_picture(painting):
    """The cover's picture for the game (COVER_SIZE): the wrap, plain cloth with the painting over it; the page
    edges' strip; the patch of cloth."""
    w, h = COVER_SIZE
    img = np.ones((h, w, 4), dtype=np.float32)
    img[..., :3] = srgb(CLOTH)
    if painting is not None:
        over(img[:WRAP_ROWS], S.resize(painting, w, WRAP_ROWS))
    img[BAND[0]:, EDGE_COLS[0]:EDGE_COLS[1]] = page_edges(EDGE_COLS[1] - EDGE_COLS[0], h - BAND[0],
                                                          np.random.default_rng(7))
    return img


def pages_picture(painting):
    """The spread's picture for the game (PAGES_SIZE): paper with the painting over it, or lines of writing."""
    w, h = PAGES_SIZE
    img = np.ones((h, w, 4), dtype=np.float32)
    img[..., :3] = srgb(PAPER)
    if painting is not None:
        over(img, S.resize(painting, w, h))
    else:
        rng = np.random.default_rng(3)
        g = gutter_cols(w)
        for c0, c1 in ((int(w * 0.06), w // 2 - g - int(w * 0.03)), (w // 2 + g + int(w * 0.03), int(w * 0.94))):
            writing(img, (c0, c1), (int(h * 0.1), int(h * 0.9)), rng, h / 1024)
    return img


def over(base, top):
    """`top` (straight-alpha RGBA) painted over `base` (opaque), in place."""
    a = top[..., 3:4]
    base[..., :3] = base[..., :3] * (1.0 - a) + top[..., :3] * a


def dashed_box(img, x0, y0, x1, y1, colour, thick=3, dash=36):
    """A dashed rectangle's sides, (x0, y0) to (x1, y1) (pixels), into `img`."""
    h, w = img.shape[:2]
    xs, ys = np.arange(w), np.arange(h)
    along_x = ((xs % dash) < dash * 2 // 3) & (xs >= x0) & (xs < x1)
    along_y = ((ys % dash) < dash * 2 // 3) & (ys >= y0) & (ys < y1)
    mask = np.zeros((h, w), dtype=bool)
    mask[y0:y0 + thick, :] |= along_x[None, :]
    mask[y1 - thick:y1, :] |= along_x[None, :]
    mask[:, x0:x0 + thick] |= along_y[:, None]
    mask[:, x1 - thick:x1] |= along_y[:, None]
    img[mask, :3] = colour


def dashed_column(img, x, colour, thick=3, dash=36):
    h = img.shape[0]
    ys = np.arange(h)
    on = (ys % dash) < dash * 2 // 3
    img[on, x - thick // 2:x - thick // 2 + thick, :3] = colour


def label(img, words, cx, cy, height, colour, font, share=0.3):
    """`words` lettered faint across `img`, centred at (cx, cy), `height` pixels tall at most."""
    if font is None:
        return
    h, w = img.shape[:2]
    width = min(w, int(height * max(1, len(words)) * 0.9))
    x0, y0 = int(cx - width / 2), int(cy - height / 2)
    x0, y0 = max(0, min(w - width, x0)), max(0, min(h - height, y0))
    cover = S.words_cover(words, width, height, font)[..., None] * share
    patch = img[y0:y0 + height, x0:x0 + width, :3]
    img[y0:y0 + height, x0:x0 + width, :3] = patch * (1.0 - cover) + colour * cover


def cover_guide(font):
    """The cover's template: the wrap PAINT_SCALE times the game's, plain cloth, the spine's folds dashed, a dashed
    margin in from its edges (the boards' edges and the pen's line round them eat into it), and what is where."""
    w, h = COVER_SIZE[0] * PAINT_SCALE, WRAP_ROWS * PAINT_SCALE
    img = np.ones((h, w, 4), dtype=np.float32)
    cloth = srgb(CLOTH)
    img[..., :3] = cloth
    light = np.clip(cloth * 1.35, 0, 1)
    for u in (U_BACK, U_FRONT):
        dashed_column(img, int(round(u * w)), light)
    m = int(round(0.03 * h))
    dashed_box(img, m, m, w - m, h - m, light)
    cream = srgb("#FFF4E0")
    for words, u0, u1 in (("back cover", 0.0, U_BACK), ("spine", U_BACK, U_FRONT), ("front cover", U_FRONT, 1.0)):
        size = int(min(h * 0.06, (u1 - u0) * w * 0.9 / max(1, len(words)) * 1.6))
        label(img, words, (u0 + u1) / 2 * w, h * 0.5, size, cream, font, 0.45)
    return img


def pages_guide(font):
    """The spread's template: both pages PAINT_SCALE times the game's, paper, the gutter's curve shaded (what is
    painted there is seen edge on), a dashed margin in from the pages' edges, and which page is which."""
    w, h = PAGES_SIZE[0] * PAINT_SCALE, PAGES_SIZE[1] * PAINT_SCALE
    img = np.ones((h, w, 4), dtype=np.float32)
    paper = srgb(PAPER)
    img[..., :3] = paper
    g = gutter_cols(w)
    img[:, w // 2 - g:w // 2 + g, :3] = paper * 0.9
    grey = paper * 0.72
    dashed_column(img, w // 2, grey)
    m = int(round(0.035 * h))
    dashed_box(img, m, m, w // 2 - g, h - m, grey)
    dashed_box(img, w // 2 + g, m, w - m, h - m, grey)
    for words, cx in (("left page", w * 0.25), ("right page", w * 0.75)):
        label(img, words, cx, h * 0.5, int(h * 0.05), ink(), font, 0.25)
    return img


def png_of(img):
    return F.png_bytes(F.to_uint8(img))


def sha1_of(path):
    with open(path, "rb") as f:
        return hashlib.sha1(f.read()).hexdigest()


def write_webp(path, img, quality=100):
    """A WebP of `img` (H, W, 4 floats, top row first): lossless at 100, else lossy at that quality."""
    h, w = img.shape[:2]
    rgba = np.ones((h, w, 4), dtype=np.float32)
    rgba[..., :3] = np.clip(img[::-1, :, :3], 0.0, 1.0)
    image = bpy.data.images.new("webp", w, h, alpha=False)
    try:
        image.pixels.foreach_set(rgba.ravel())
        image.file_format = "WEBP"
        os.makedirs(os.path.dirname(path), exist_ok=True)
        image.save(filepath=path, quality=quality)
    finally:
        bpy.data.images.remove(image)


def painting(name, template_size, problems):
    """The user's painting `name` (art/books/<name>.png), black paint the film's dark brown, or None; one not of its
    template's proportions shown at its own, centred on paper or cloth (see build_signs' STRETCH)."""
    path = os.path.join(ART, f"{name}.png")
    if not os.path.isfile(path):
        return None
    arr = F.ink_blacks(F.load_png(path))
    h, w = arr.shape[:2]
    tw, th = template_size
    if abs((w / h) / (tw / th) - 1.0) <= S.STRETCH:
        return arr
    problems.append(f"art/books/{name}.png is {w} x {h} and its template {tw} x {th}: shown at its own proportions, "
                    "centred; repaint it on the template to fill it")
    scale = min(tw / w, th / h)
    pw, ph = max(1, round(w * scale)), max(1, round(h * scale))
    out = np.zeros((th, tw, 4), dtype=np.float32)
    top, left = (th - ph) // 2, (tw - pw) // 2
    out[top:top + ph, left:left + pw] = S.resize(arr, pw, ph)
    return out


def pictures():
    """The templates (art/books/_guides/cover.png and pages.png, redrawn only while still as drawn) and the game's
    two pictures from the paintings (art/books/cover.png and pages.png) if there are any. Returns what it found
    wrong and which were painted."""
    font = S.guide_font()
    os.makedirs(GUIDES, exist_ok=True)
    try:
        with open(DRAWN, encoding="utf-8") as f:
            drawn = json.load(f)
    except (OSError, ValueError):
        drawn = {}
    problems, now, sizes = [], {}, {}
    for name, make in (("cover", cover_guide), ("pages", pages_guide)):
        img = make(font)
        sizes[name] = (img.shape[1], img.shape[0])
        png = png_of(img)
        path = os.path.join(GUIDES, f"{name}.png")
        if os.path.exists(path):
            old = sha1_of(path)
            if old != hashlib.sha1(png).hexdigest() and old != drawn.get(f"{name}.png"):
                problems.append(f"_guides/{name}.png was changed after it was drawn, so it is left as it is: a painting "
                                "belongs in art/books/ itself")
                now[f"{name}.png"] = drawn.get(f"{name}.png", "")
                continue
        with open(path, "wb") as f:
            f.write(png)
        now[f"{name}.png"] = hashlib.sha1(png).hexdigest()
    with open(DRAWN, "w", encoding="utf-8", newline="\n") as f:
        json.dump(now, f, ensure_ascii=False, indent=1, sort_keys=True)
        f.write("\n")
    cover = painting("cover", sizes["cover"], problems)
    pages = painting("pages", sizes["pages"], problems)
    write_webp(COVER_FILE, cover_picture(cover))
    spread = pages_picture(pages)
    write_webp(PAGES_FILE, spread, 100 if pages is None else 92)
    write_webp(PAGES_FAR_FILE, S.resize(spread, PAGES_SIZE[0] // FAR, PAGES_SIZE[1] // FAR))
    return problems, [n for n, p in (("cover", cover), ("pages", pages)) if p is not None]
