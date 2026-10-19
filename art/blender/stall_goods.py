"""What each festival stall sells, and the tools it is made with, standing on its counter and on the
work table along its back wall, as in the film's festival: a kebab stall's two meat spits turning
upright, a candy floss stall's spinning tub and its bags hanging at the back, a griddle stall's
bottles, trays of chopped things and foam boxes, a grill of skewers, a fryer, a tub of bottles on
ice. Each kit is a prop of its own (goods_<kit>), placed with its stall wherever the layout file
names it (a stall's `goods`), in the stall's own frame: it faces -Y, its middle at the origin, its
counter's top and its table's as STALL_COUNTER and STALL_TABLE in build_village.py give them. Its
keeper stands in the middle of the booth, so only low things stand in the middle of the counter,
and the tall ones to the sides of it, or at the back, where they show beside the keeper's head.

Everything stands a few millimetres into what it stands on, so no two faces lie in one plane, and
what fills a pot heaps a few millimetres over its rim (a pot is shut at its top, as a cylinder is);
a tub to be seen into is an open bowl.
"""

import math

import bmesh
from mathutils import Matrix, Vector

import build_props as P
import charlib as L

COLOURS = {k: L.hex_color(v) for k, v in {
    "steel": "#C3CBD0", "steelDark": "#87939A", "iron": "#3E3936", "ironTop": "#5A524D",
    "coal": "#2E2A28", "ember": "#E2643C", "wood": "#C99A62", "woodDark": "#9C6E42", "card": "#D6B07A",
    "foam": "#F6F5F0", "paper": "#F2EBDD", "paperPink": "#F4B8C8", "white": "#FFFFFF",
    "sauce": "#5A2F1E", "soy": "#3B2318", "mayo": "#F7EDCB", "ketchup": "#D8362E", "mustard": "#E8B630",
    "oil": "#F2CE58", "water": "#D9EEF2", "glass": "#BFE3E6", "ice": "#E3F4F6", "cyanWater": "#8FD3DA",
    "batter": "#F1DCA4", "golden": "#D99A45", "brown": "#9A5A2E", "dark": "#5E3420",
    "chicken": "#C98A4E", "beef": "#6E3B27", "leek": "#7DB55E", "onion": "#8CC56B", "ginger": "#E5636B",
    "cabbage": "#B8D98C", "octopus": "#D9534F", "squid": "#EAC7A1", "squidDark": "#C9875A",
    "shell": "#EBCB9E", "shellDark": "#C99B6A", "prawn": "#F07B4B",
    "potato": "#D8B068", "potatoSkin": "#B98848", "butter": "#F8E27A", "foil": "#DCDFE0",
    "apple": "#D7302C", "candy": "#E8473F", "choco": "#5B3423", "sprinkleA": "#F7A1C4", "sprinkleB": "#7EC3EA",
    "sprinkleC": "#F7D046", "banana": "#F3DC8A", "pineapple": "#F2C94C", "pineLeaf": "#5BAA45",
    "orange": "#F29A3A", "juiceA": "#F59A3C", "juiceB": "#F5D04A", "juiceC": "#E8577A",
    "ramune": "#9AD7D2", "marble": "#EAF6F6", "beer": "#E9A93A", "froth": "#FFF8E8",
    "flossPink": "#F7B5CF", "flossBlue": "#A8D4F2", "flossYellow": "#F7E28C", "flossPurple": "#C9A8E8",
    "cone": "#D9A35E", "cream": "#FFF6E6", "strawberry": "#E8424A", "kiwi": "#8CC152",
    "syrupRed": "#E23B3B", "syrupBlue": "#3F8FE0", "syrupGreen": "#47B55A", "syrupYellow": "#F2C63A",
    "redBean": "#6B2A2A", "custard": "#F3D27A", "sugar": "#F8F3E4", "plate": "#F4F1E8",
}.items()}

STICK = L.hex_color("#E4C795")


class Kit:
    """The pieces of one stall's goods, with a few ways of making the things stalls are full of."""

    def __init__(self, counter, table):
        self.pieces = []
        self.c, self.t = counter, table

    # Where things stand: on the counter, `u` across it from its middle (metres) and `v` from the
    # front (0) to the back (1) of its top; on the table likewise.
    def on_counter(self, u, v=0.5, sink=0.005):
        c = self.c
        return Vector((u, c["y"] + c["half"][1] * (2.0 * v - 1.0), c["z"] - sink))

    def on_table(self, u, v=0.5, sink=0.005):
        t = self.t
        return Vector((u, t["y"] + t["half"][1] * (2.0 * v - 1.0), t["z"] - sink))

    def add(self, bm, colour):
        self.pieces.append((bm, COLOURS[colour] if isinstance(colour, str) else colour))

    def box(self, at, size, colour, lift=0.0):
        """A box standing on `at` (the middle of its foot), `size` across, deep and high."""
        self.add(P.box_bm(at + Vector((0.0, 0.0, size[2] / 2 + lift)), size), colour)

    def cylinder(self, at, radius, height, colour, top_radius=None, segments=12):
        """A cylinder, or a cone to `top_radius`, standing on `at` (a fiftieth longer at each end, as
        a segment is drawn)."""
        self.add(P.segment_bm(at, at + Vector((0.0, 0.0, height)), radius, radius if top_radius is None else top_radius,
                              segments=segments), colour)

    def filled(self, at, radius, height, colour, fill, top_radius=None, segments=12):
        """A pot full of something, heaped a little over its rim."""
        self.cylinder(at, radius, height, colour, top_radius, segments)
        rim = 0.9 * (radius if top_radius is None else top_radius)
        self.cylinder(at + Vector((0.0, 0.0, 1.02 * height - 0.012)), rim, 0.018, fill, segments=segments)

    def bowl(self, at, radius, height, colour, inside, top_radius=None, depth=None, wall=0.012, segments=20):
        """A bowl open at its top: its outer wall from `radius` at its foot to `top_radius` at its
        rim, the rim `wall` thick, and inside it, in its own colour (a liquid's, or the shade of
        its inside), its inner wall and its floor `depth` under the rim."""
        r1 = radius if top_radius is None else top_radius
        depth = 0.75 * height if depth is None else depth
        bm = bmesh.new()

        def ring(r, z):
            return [bm.verts.new(at + Vector((r * math.cos(2 * math.pi * i / segments), r * math.sin(2 * math.pi * i / segments), z)))
                    for i in range(segments)]
        foot, rim_out = ring(radius, 0.0), ring(r1, height)
        rim_in = ring(r1 - wall, height)
        floor = ring(radius + (r1 - radius) * (height - depth) / height - wall, height - depth)
        for i in range(segments):
            j = (i + 1) % segments
            bm.faces.new((foot[i], foot[j], rim_out[j], rim_out[i]))
            bm.faces.new((rim_out[i], rim_out[j], rim_in[j], rim_in[i]))
            bm.faces.new((rim_in[i], rim_in[j], floor[j], floor[i]))
        bm.faces.new(list(reversed(foot)))
        bm.faces.new(floor)
        outer, inner = COLOURS[colour], COLOURS[inside]
        self.add(bm, [outer] * (2 * segments) + [inner] * (2 * segments))

    def ball(self, at, radii, colour, rot=None, u=8, v=6):
        r = radii if isinstance(radii, tuple) else (radii, radii, radii)
        self.add(L.ellipsoid_bm(at, r, rot=rot, u=u, v=v), colour)

    def stick(self, a, b, radius=0.006, colour=None):
        self.add(P.segment_bm(a, b, radius, radius, segments=5), STICK if colour is None else colour)

    def bottle(self, at, colour, height=0.24, radius=0.04, cap="white", neck=0.35):
        """A bottle: its body, its shoulders narrowing to a neck, and its cap."""
        body = height * (1.0 - neck)
        self.cylinder(at, radius, body, colour)
        self.cylinder(at + Vector((0, 0, body)), radius, height * neck * 0.6, colour, top_radius=radius * 0.35)
        self.cylinder(at + Vector((0, 0, body + height * neck * 0.55)), radius * 0.38, height * neck * 0.45, cap, segments=8)

    def squeeze(self, at, colour, cap):
        """A squeeze bottle of sauce, its pointed nozzle up."""
        self.cylinder(at, 0.035, 0.15, colour, segments=10)
        self.cylinder(at + Vector((0, 0, 0.15)), 0.03, 0.025, cap, segments=10)
        self.cylinder(at + Vector((0, 0, 0.17)), 0.012, 0.05, cap, top_radius=0.003, segments=6)

    def cups(self, at, colour, count=6, radius=0.045):
        """A stack of cups, upside down, each a little proud of the one under it."""
        self.cylinder(at, radius * 0.75, 0.1, colour, top_radius=radius, segments=10)
        for k in range(1, count):
            self.cylinder(at + Vector((0, 0, 0.1 + 0.018 * (k - 1))), radius, 0.02, colour, top_radius=radius * 1.02, segments=10)

    def foam_boxes(self, at, count=4):
        """Takeaway boxes of white foam, stacked shut."""
        for k in range(count):
            self.box(at + Vector((0, 0, 0.055 * k)), (0.2, 0.15, 0.05), "foam")

    def tray(self, at, size, colour, fill):
        """A shallow tray of something chopped: its rim and what is in it."""
        self.box(at, (size[0], size[1], 0.035), colour)
        self.box(at + Vector((0, 0, 0.01)), (size[0] - 0.02, size[1] - 0.02, 0.032), fill)

    def skewer(self, a, b, chunks, colour, size, leek=False):
        """A bamboo skewer from a to b with `chunks` pieces on its far part, leek between if asked."""
        self.stick(a, b, 0.005)
        for k in range(chunks):
            p = a.lerp(b, 0.42 + 0.55 * (k + 0.5) / chunks)
            if leek and k % 2:
                self.ball(p, (size * 0.75, size * 0.75, size * 0.75), "leek", u=6, v=4)
            else:
                self.ball(p, (size, size * 0.95, size * 0.85), colour, u=6, v=4)

    def grill(self, at, length, depth, height=0.16):
        """A charcoal grill: an iron trough on short legs, glowing coals under a grate of bars."""
        self.box(at, (length, depth, height), "iron")
        self.box(at + Vector((0, 0, height - 0.035)), (length - 0.05, depth - 0.05, 0.03), "ember")
        for k in range(9):
            y = at.y - depth / 2 + depth * (k + 0.5) / 9
            self.add(P.segment_bm(Vector((at.x - length / 2 + 0.02, y, at.z + height + 0.004)),
                                  Vector((at.x + length / 2 - 0.02, y, at.z + height + 0.004)), 0.004, 0.004, segments=4),
                     "steelDark")
        return at.z + height + 0.01

    def griddle(self, at, length, depth):
        """A flat iron griddle on its gas box."""
        self.box(at, (length, depth, 0.1), "steelDark")
        self.box(at + Vector((0, 0, 0.095)), (length + 0.02, depth + 0.02, 0.03), "iron")
        return at.z + 0.125

    def fryer(self, at, length=0.42, depth=0.32):
        """A steel deep fryer: its tank of hot oil and a wire basket hung on its edge."""
        self.box(at, (length, depth, 0.22), "steel")
        self.box(at + Vector((0, 0, 0.2)), (length - 0.05, depth - 0.05, 0.025), "oil")
        self.box(at + Vector((length * 0.18, 0, 0.19)), (length * 0.4, depth * 0.6, 0.06), "steelDark")
        self.stick(at + Vector((length * 0.18, -depth * 0.3, 0.24)), at + Vector((length * 0.18, -depth * 0.62, 0.33)), 0.01, COLOURS["coal"])
        return at.z + 0.22

    def foam_block(self, at, length, depth, height=0.09):
        self.box(at, (length, depth, height), "foam")
        return at.z + height



# ---------------------------------------------------------------------------- the kits
def kit_takoyaki(k):
    """Takoyaki: the iron plate of round wells, every well a ball browning, picks in a cup, sauce
    and mayonnaise, boat trays stacked; batter, octopus and cabbage on the table behind."""
    plate = k.on_counter(-0.2, 0.5)
    top = k.griddle(plate, 0.86, 0.3)
    for i in range(8):
        for j in range(3):
            k.ball(Vector((plate.x - 0.37 + 0.106 * i, plate.y - 0.09 + 0.09 * j, top - 0.005)), (0.036, 0.036, 0.03),
                   "golden" if (i + j) % 3 else "brown")
    k.cylinder(k.on_counter(0.42, 0.35), 0.035, 0.09, "wood")
    for dx in (-0.01, 0.012):
        k.stick(k.on_counter(0.42 + dx, 0.35) + Vector((0, 0, 0.05)), k.on_counter(0.42 + dx * 2, 0.35) + Vector((0, 0, 0.2)), 0.004)
    k.squeeze(k.on_counter(0.62, 0.3), "sauce", "sauce")
    k.squeeze(k.on_counter(0.72, 0.42), "mayo", "ketchup")
    for n in range(5):
        k.box(k.on_counter(0.9, 0.5) + Vector((0, 0, 0.02 * n)), (0.18, 0.09, 0.018), "wood")
    k.filled(k.on_table(-0.45), 0.08, 0.2, "steel", "batter", top_radius=0.09)
    k.tray(k.on_table(0.0), (0.3, 0.2), "steel", "octopus")
    k.tray(k.on_table(0.4), (0.3, 0.2), "steel", "cabbage")


def kit_steamer(k):
    """Jaga-butter: two tall steamer pots with their lids, a tray of steamed potatoes split open
    with butter melting in them, a block of butter; a crate of potatoes behind."""
    for u in (-0.75, -0.3):
        at = k.on_counter(u, 0.5)
        k.cylinder(at, 0.18, 0.26, "steel")
        k.cylinder(at + Vector((0, 0, 0.26)), 0.19, 0.04, "steelDark", top_radius=0.12)
        k.cylinder(at + Vector((0, 0, 0.3)), 0.03, 0.04, "coal", segments=8)
    tray = k.on_counter(0.4, 0.5)
    k.box(tray, (0.5, 0.26, 0.03), "foil")
    for i in range(4):
        for j in range(2):
            p = tray + Vector((-0.18 + 0.12 * i, -0.06 + 0.12 * j, 0.06))
            k.ball(p, (0.055, 0.05, 0.045), "potato")
            k.box(p + Vector((0, 0, 0.035)), (0.035, 0.035, 0.02), "butter")
    k.box(k.on_counter(0.88, 0.45), (0.14, 0.08, 0.06), "butter")
    crate = k.on_table(0.2)
    k.box(crate, (0.6, 0.38, 0.18), "wood")
    for i in range(5):
        for j in range(3):
            k.ball(crate + Vector((-0.24 + 0.12 * i, -0.12 + 0.12 * j, 0.19)), (0.055, 0.05, 0.045), "potatoSkin")
    k.cylinder(k.on_table(-0.55), 0.05, 0.13, "white")


def kit_sticks(k, item, rows=3, cols=5):
    """Sweets on sticks standing in rows in a block of foam on the counter, to one side of its
    keeper: `item(k, tip)` makes one at the top of its stick."""
    block = k.on_counter(0.55, 0.5)
    top = k.foam_block(block, 0.15 * cols + 0.08, 0.13 * rows + 0.06)
    for i in range(cols):
        for j in range(rows):
            base = Vector((block.x - 0.075 * (cols - 1) + 0.15 * i, block.y - 0.065 * (rows - 1) + 0.13 * j, top - 0.02))
            tip = base + Vector((0, 0, 0.2))
            k.stick(base, tip)
            item(k, tip)


def candy_apple(k, tip):
    k.ball(tip + Vector((0, 0, 0.045)), (0.055, 0.055, 0.05), "candy", u=10, v=7)
    k.stick(tip + Vector((0, 0, 0.09)), tip + Vector((0.004, 0, 0.11)), 0.004, COLOURS["woodDark"])


def choco_banana(k, tip):
    k.ball(tip + Vector((0, 0, 0.07)), (0.03, 0.03, 0.11), "choco", u=8, v=6)
    for n, c in enumerate(("sprinkleA", "sprinkleB", "sprinkleC", "sprinkleA")):
        a = n * 1.7
        k.ball(tip + Vector((0.028 * math.cos(a), 0.028 * math.sin(a), 0.1 + 0.025 * n)), (0.008, 0.008, 0.006), c, u=4, v=3)


def kit_ringoame(k):
    """Candied apples on sticks, glossy red, in rows, and a tray of them lying ready; a box of apples
    and the pot of candy behind."""
    kit_sticks(k, candy_apple)
    tray = k.on_counter(-0.55, 0.5)
    k.box(tray, (0.5, 0.26, 0.03), "steel")
    for i in range(4):
        for j in range(2):
            at = tray + Vector((-0.18 + 0.12 * i, -0.06 + 0.12 * j, 0.06))
            k.ball(at, (0.05, 0.05, 0.045), "candy", u=10, v=7)
            k.stick(at + Vector((0, 0, 0.03)), at + Vector((0.03, -0.1, 0.05)), 0.005)
    crate = k.on_table(-0.1)
    k.box(crate, (0.6, 0.38, 0.15), "wood")
    for i in range(5):
        for j in range(3):
            k.ball(crate + Vector((-0.24 + 0.12 * i, -0.12 + 0.12 * j, 0.17)), (0.05, 0.05, 0.045), "apple")
    k.filled(k.on_table(0.5), 0.12, 0.12, "steel", "candy")


def kit_chocobanana(k):
    """Chocolate bananas on sticks, sprinkled, in rows; dishes of sprinkles; a bunch of bananas and
    the chocolate pot behind."""
    kit_sticks(k, choco_banana)
    for n, c in enumerate(("sprinkleA", "sprinkleB", "sprinkleC")):
        at = k.on_counter(-0.75 + 0.2 * n, 0.5)
        k.filled(at, 0.06, 0.04, "white", c, top_radius=0.08)
    for n in range(5):
        a = -0.5 + 0.25 * n
        k.ball(k.on_table(-0.2) + Vector((0.05 * n, 0, 0.05)), (0.03, 0.12, 0.03), "banana",
               rot=Matrix.Rotation(a, 3, "Z"), u=8, v=5)
    k.filled(k.on_table(0.45), 0.13, 0.16, "steel", "choco")


def kit_pine(k):
    """Chilled pineapple: spears of pineapple on sticks standing in a box of ice; whole pineapples
    on the table behind."""
    box = k.on_counter(0.55, 0.5)
    k.box(box, (0.7, 0.32, 0.12), "glass")
    k.box(box + Vector((0, 0, 0.11)), (0.66, 0.28, 0.02), "ice")
    for i in range(5):
        for j in range(2):
            base = box + Vector((-0.26 + 0.13 * i, -0.07 + 0.14 * j, 0.11))
            k.stick(base, base + Vector((0, 0, 0.2)))
            k.box(base + Vector((0, 0, 0.14)), (0.035, 0.035, 0.13), "pineapple")
    board = k.on_counter(-0.6, 0.5)
    k.box(board, (0.42, 0.26, 0.03), "wood")
    k.ball(board + Vector((-0.06, 0, 0.1)), (0.07, 0.07, 0.075), "pineapple")
    for n in range(3):
        k.box(board + Vector((0.08 + 0.05 * n, -0.02, 0.03)), (0.03, 0.03, 0.12), "pineapple")
    k.box(board + Vector((0.1, 0.08, 0.028)), (0.2, 0.035, 0.006), "steel")
    for u in (-0.5, -0.1, 0.3):
        at = k.on_table(u)
        k.ball(at + Vector((0, 0, 0.11)), (0.08, 0.08, 0.11), "pineapple")
        for n in range(5):
            a = n * 2 * math.pi / 5
            k.ball(at + Vector((0.025 * math.cos(a), 0.025 * math.sin(a), 0.25)), (0.015, 0.015, 0.07), "pineLeaf",
                   rot=Matrix.Rotation(0.4, 3, Vector((-math.sin(a), math.cos(a), 0))), u=5, v=3)


def kit_wataame(k):
    """Candy floss: the steel spinning tub on its machine on the counter, a cloud of floss on a
    stick waiting in it; bags of floss in bright colours hanging along the back, as in the film."""
    machine = k.on_counter(-0.58, 0.5)
    k.box(machine, (0.5, 0.36, 0.14), "steelDark")
    k.bowl(machine + Vector((0, 0, 0.135)), 0.27, 0.16, "steel", "steelDark", top_radius=0.3, depth=0.13)
    k.cylinder(machine + Vector((0, 0, 0.16)), 0.04, 0.07, "coal", segments=10)
    k.stick(machine + Vector((0.08, 0.0, 0.2)), machine + Vector((0.14, 0.0, 0.38)), 0.005)
    k.ball(machine + Vector((0.16, 0.0, 0.45)), (0.12, 0.11, 0.1), "flossPink")
    stand = k.on_counter(0.6, 0.5)
    k.box(stand, (0.3, 0.12, 0.07), "foam")
    for n, c in enumerate(("flossPink", "flossBlue", "flossYellow")):
        base = stand + Vector((-0.1 + 0.1 * n, 0, 0.06))
        k.stick(base, base + Vector((0, 0, 0.22)))
        k.ball(base + Vector((0, 0, 0.3)), (0.08, 0.075, 0.08), c)
    # The bags, hung from a rail across the back of the booth, its ends in the side boards.
    y, rail = k.t["y"] + 0.12, 1.96
    k.add(P.segment_bm(Vector((-0.9, y, rail)), Vector((0.9, y, rail)), 0.012, 0.012, segments=6), "steelDark")
    for n, c in enumerate(("flossPink", "flossBlue", "flossPurple", "flossYellow", "flossPink", "flossBlue")):
        x = -0.7 + 0.28 * n
        k.stick(Vector((x, y, rail)), Vector((x, y, rail - 0.16)), 0.003, COLOURS["white"])
        k.ball(Vector((x, y, rail - 0.3)), (0.1, 0.065, 0.15), c)
        k.ball(Vector((x, y - 0.055, rail - 0.26)), (0.045, 0.02, 0.045), "white", u=6, v=4)
    k.cylinder(k.on_table(-0.4), 0.12, 0.24, "white")


def kit_juice(k):
    """Juice: two big jars of juice with their taps, orange and pink, cups stacked, oranges; a
    cooler box and a basket of oranges behind."""
    for u, c in ((-0.8, "juiceA"), (-0.45, "juiceC")):
        at = k.on_counter(u, 0.55)
        k.box(at, (0.3, 0.24, 0.05), "white")
        k.cylinder(at + Vector((0, 0, 0.05)), 0.13, 0.25, c, segments=16)
        k.cylinder(at + Vector((0, 0, 0.29)), 0.134, 0.08, "glass", segments=16)
        k.cylinder(at + Vector((0, 0, 0.37)), 0.138, 0.03, "white", segments=16)
        k.add(P.segment_bm(at + Vector((0, -0.11, 0.1)), at + Vector((0, -0.19, 0.1)), 0.015, 0.012, segments=6), "white")
    k.cups(k.on_counter(0.45, 0.5), "juiceB")
    k.cups(k.on_counter(0.6, 0.5), "white")
    for n in range(3):
        k.ball(k.on_counter(0.85 + 0.09 * (n % 2), 0.35 + 0.3 * (n // 2)) + Vector((0, 0, 0.045)), 0.05, "orange")
    k.box(k.on_table(-0.35), (0.6, 0.38, 0.3), "syrupBlue")
    k.box(k.on_table(-0.35) + Vector((0, 0, 0.298)), (0.62, 0.4, 0.04), "white")
    basket = k.on_table(0.4)
    k.cylinder(basket, 0.17, 0.1, "wood", top_radius=0.2)
    for n in range(6):
        a = n * 2 * math.pi / 6
        k.ball(basket + Vector((0.09 * math.cos(a), 0.09 * math.sin(a), 0.12)), 0.05, "orange")


def kit_ramune(k):
    """Ramune: a tub of ice water with the marble bottles cooling in it on the counter; crates of
    bottles on the table behind."""
    tub = k.on_counter(-0.62, 0.5)
    k.bowl(tub, 0.32, 0.22, "syrupBlue", "cyanWater", top_radius=0.36, depth=0.03)
    for n in range(9):
        a = n * 2.4
        r = 0.08 + 0.18 * ((n * 37) % 10) / 10
        at = tub + Vector((r * math.cos(a), r * math.sin(a), 0.1))
        k.bottle(at, "ramune", height=0.22, radius=0.032, cap="syrupBlue")
        k.ball(at + Vector((0, 0, 0.15)), 0.012, "marble", u=6, v=4)
    k.cups(k.on_counter(0.6, 0.5), "white")
    for u in (-0.4, 0.3):
        crate = k.on_table(u)
        k.box(crate, (0.46, 0.34, 0.16), "syrupBlue")
        for i in range(4):
            for j in range(3):
                k.bottle(crate + Vector((-0.15 + 0.1 * i, -0.1 + 0.1 * j, 0.1)), "ramune", height=0.2, radius=0.03, cap="syrupBlue")


def kit_beer(k):
    """Beer: the steel beer server with its two taps and a cup filling, cups stacked; kegs on the
    table behind."""
    server = k.on_counter(-0.62, 0.55)
    k.box(server, (0.42, 0.3, 0.32), "steel")
    for dx in (-0.09, 0.09):
        k.add(P.segment_bm(server + Vector((dx, -0.15, 0.28)), server + Vector((dx, -0.24, 0.28)), 0.015, 0.012, segments=6), "steelDark")
        k.stick(server + Vector((dx, -0.22, 0.29)), server + Vector((dx, -0.22, 0.4)), 0.012, COLOURS["coal"])
    k.cylinder(server + Vector((-0.09, -0.22, 0.0)), 0.04, 0.12, "beer", top_radius=0.045)
    k.cylinder(server + Vector((-0.09, -0.22, 0.12)), 0.046, 0.03, "froth")
    k.cups(k.on_counter(0.3, 0.5), "white", count=7)
    k.cups(k.on_counter(0.45, 0.5), "white", count=5)
    for u in (-0.42, 0.0):
        at = k.on_table(u)
        k.cylinder(at, 0.17, 0.42, "steel", segments=16)
        for z in (0.06, 0.36):
            k.cylinder(at + Vector((0, 0, z)), 0.175, 0.025, "steelDark", segments=16)
    k.box(k.on_table(0.45), (0.4, 0.32, 0.25), "syrupBlue")


def kit_fry_on_sticks(k, item, count):
    """A fryer, and what comes out of it on sticks standing in a holder."""
    k.fryer(k.on_counter(-0.62, 0.5))
    holder = k.on_counter(0.55, 0.5)
    top = k.foam_block(holder, 0.12 * count + 0.08, 0.16)
    for n in range(count):
        base = Vector((holder.x - 0.06 * (count - 1) + 0.12 * n, holder.y, top - 0.02))
        k.stick(base, base + Vector((0, 0, 0.36)), 0.006)
        item(k, base)


def tornado(k, base):
    for n in range(10):
        a = n * 0.9
        k.add(L.ellipsoid_bm(base + Vector((0, 0, 0.1 + 0.022 * n)), (0.045, 0.045, 0.008),
                             rot=Matrix.Rotation(0.35, 3, Vector((math.cos(a), math.sin(a), 0))), u=10, v=3), COLOURS["golden"])


def churro(k, base):
    k.add(P.segment_bm(base + Vector((0, 0, 0.08)), base + Vector((0, 0, 0.4)), 0.022, 0.02, segments=7), COLOURS["golden"])
    k.cylinder(base + Vector((0, 0, 0.06)), 0.03, 0.11, "paperPink", segments=8)


def kit_tornado(k):
    """Tornado potato: the fryer, potatoes spiralled up their sticks standing ready, salt; a
    sack of potatoes behind."""
    kit_fry_on_sticks(k, tornado, 5)
    k.cylinder(k.on_counter(-0.18, 0.4), 0.03, 0.1, "white")
    k.ball(k.on_table(-0.3) + Vector((0, 0, 0.15)), (0.24, 0.17, 0.16), "card")
    k.box(k.on_table(0.35), (0.42, 0.3, 0.12), "steel")


def kit_churros(k):
    """Churros: the fryer, churros in paper sleeves standing ready, a sugar shaker; the dough
    press and a bag of sugar behind."""
    kit_fry_on_sticks(k, churro, 5)
    k.cylinder(k.on_counter(-0.18, 0.4), 0.035, 0.12, "sugar")
    k.cylinder(k.on_table(-0.3), 0.07, 0.34, "steel")
    k.box(k.on_table(0.3), (0.28, 0.2, 0.26), "paper")


def kit_karaage(k):
    """Karaage: the fryer, a tray of fried chicken and paper cones of it ready to hand over; a tub
    of marinating chicken behind."""
    k.fryer(k.on_counter(-0.62, 0.5))
    tray = k.on_counter(0.05, 0.5)
    k.box(tray, (0.44, 0.28, 0.03), "steel")
    for i in range(5):
        for j in range(3):
            k.ball(tray + Vector((-0.17 + 0.085 * i, -0.08 + 0.08 * j, 0.05)), (0.04, 0.035, 0.03), "golden", u=6, v=4)
    for u in (0.48, 0.62, 0.76):
        at = k.on_counter(u, 0.45)
        k.cylinder(at, 0.025, 0.14, "paper", top_radius=0.055)
        for n in range(3):
            k.ball(at + Vector((0.02 * math.cos(n * 2.1), 0.02 * math.sin(n * 2.1), 0.16)), (0.03, 0.028, 0.025), "golden", u=6, v=4)
    k.filled(k.on_table(-0.3), 0.16, 0.16, "white", "chicken")
    k.box(k.on_table(0.35), (0.36, 0.26, 0.18), "card")


def kit_frank(k):
    """Frankfurters: sausages on sticks turning on the grill, ketchup and mustard; a box of
    sausages behind."""
    grill = k.on_counter(-0.25, 0.5)
    top = k.grill(grill, 1.0, 0.3)
    for n in range(7):
        x = grill.x - 0.39 + 0.13 * n
        k.add(L.ellipsoid_bm(Vector((x, grill.y - 0.02, top + 0.02)), (0.022, 0.1, 0.022), u=8, v=5), COLOURS["ketchup"])
        k.stick(Vector((x, grill.y - 0.1, top + 0.02)), Vector((x, grill.y - 0.26, top + 0.02)), 0.004)
    k.squeeze(k.on_counter(0.55, 0.35), "ketchup", "ketchup")
    k.squeeze(k.on_counter(0.66, 0.45), "mustard", "mustard")
    k.box(k.on_table(-0.2), (0.5, 0.32, 0.14), "card")
    k.cylinder(k.on_table(0.4), 0.13, 0.14, "steel")


def kit_skewers(k, colour, size, leek=False, count=9):
    """Skewers on the charcoal grill, more waiting in a tray, a pot of sauce with its brush; a
    tub of meat and a box of charcoal behind."""
    grill = k.on_counter(-0.15, 0.5)
    top = k.grill(grill, 1.15, 0.3)
    for n in range(count):
        x = grill.x - 0.5 + 1.0 * n / (count - 1)
        k.skewer(Vector((x, grill.y - 0.26, top + 0.015)), Vector((x, grill.y + 0.13, top + 0.015)), 4, colour, size, leek)
    pot = k.on_counter(0.75, 0.45)
    k.filled(pot, 0.07, 0.12, "iron", "sauce")
    k.stick(pot + Vector((0.02, 0, 0.05)), pot + Vector((0.06, 0, 0.26)), 0.008, COLOURS["woodDark"])
    tray = k.on_table(-0.3)
    k.box(tray, (0.5, 0.3, 0.03), "steel")
    for n in range(6):
        y0 = tray.y - 0.12 + 0.048 * n
        k.skewer(Vector((tray.x - 0.22, y0, tray.z + 0.04)), Vector((tray.x + 0.22, y0, tray.z + 0.04)), 4, colour, size * 0.9, leek)
    k.box(k.on_table(0.4), (0.36, 0.28, 0.2), "coal")


def kit_yakitori(k):
    kit_skewers(k, "chicken", 0.022, leek=True)


def kit_kushiyaki(k):
    kit_skewers(k, "chicken", 0.032, count=7)


def kit_gyukushi(k):
    kit_skewers(k, "beef", 0.034, count=7)


def squid(k, centre, along):
    """A whole squid on its stick, grilling: its long body, its fins at the head, its legs."""
    turn = Matrix.Rotation(math.atan2(along.y, along.x) - math.pi / 2, 3, "Z")
    k.add(L.ellipsoid_bm(centre, (0.045, 0.13, 0.025), rot=turn, u=8, v=5), COLOURS["squid"])
    k.add(L.ellipsoid_bm(centre + turn @ Vector((0, 0.11, 0)), (0.08, 0.035, 0.012), rot=turn, u=6, v=4), COLOURS["squidDark"])
    for n in range(4):
        k.add(P.segment_bm(centre + turn @ Vector((-0.03 + 0.02 * n, -0.12, 0)), centre + turn @ Vector((-0.05 + 0.033 * n, -0.22, 0)),
                           0.008, 0.004, segments=4), COLOURS["squidDark"])
    k.stick(centre + turn @ Vector((0, -0.25, 0)), centre + turn @ Vector((0, 0.18, 0)), 0.005)


def kit_ikayaki(k):
    """Ika-yaki: whole squid on sticks grilling, the sauce pot and its brush; a tub of squid behind."""
    grill = k.on_counter(-0.15, 0.5)
    top = k.grill(grill, 1.15, 0.32)
    for n in range(5):
        squid(k, Vector((grill.x - 0.44 + 0.22 * n, grill.y, top + 0.02)), Vector((0, 1, 0)))
    pot = k.on_counter(0.75, 0.45)
    k.filled(pot, 0.07, 0.12, "iron", "sauce")
    k.stick(pot + Vector((0.02, 0, 0.05)), pot + Vector((0.06, 0, 0.26)), 0.008, COLOURS["woodDark"])
    tub = k.on_table(-0.3)
    k.cylinder(tub, 0.18, 0.15, "white")
    for n in range(3):
        squid(k, tub + Vector((-0.06 + 0.06 * n, 0, 0.16)), Vector((0.3, 1, 0)))
    k.box(k.on_table(0.4), (0.36, 0.28, 0.2), "coal")


def scallop_shell(k, at, turn):
    k.add(L.ellipsoid_bm(at, (0.07, 0.065, 0.018), rot=Matrix.Rotation(turn, 3, "Z"), u=10, v=4), COLOURS["shell"])
    k.add(L.ellipsoid_bm(at + Vector((0, 0, 0.012)), (0.045, 0.042, 0.01), u=8, v=3), COLOURS["mayo"])


def prawn(k, at, turn):
    rot = Matrix.Rotation(turn, 3, "Z")
    for n in range(4):
        a = n * 0.5
        k.add(L.ellipsoid_bm(at + rot @ Vector((0.05 * math.cos(a), 0.05 * math.sin(a), 0.01)), (0.022, 0.018, 0.016), u=6, v=4),
              COLOURS["prawn"])


def kit_hamayaki(k):
    """Hama-yaki: scallops in their shells and prawns grilling on the beach grill, soy sauce; a
    bucket of shellfish and a box of charcoal behind."""
    grill = k.on_counter(-0.1, 0.5)
    top = k.grill(grill, 1.2, 0.32)
    for n in range(5):
        scallop_shell(k, Vector((grill.x - 0.48 + 0.24 * n, grill.y - 0.06, top + 0.015)), n * 0.7)
    for n in range(4):
        prawn(k, Vector((grill.x - 0.38 + 0.25 * n, grill.y + 0.08, top + 0.01)), n * 1.1)
    k.bottle(k.on_counter(0.8, 0.4), "soy", height=0.2, radius=0.035, cap="ketchup")
    bucket = k.on_table(-0.35)
    k.cylinder(bucket, 0.15, 0.2, "steel", top_radius=0.17)
    for n in range(4):
        scallop_shell(k, bucket + Vector((0.06 * math.cos(n * 1.6), 0.06 * math.sin(n * 1.6), 0.2)), n)
    k.box(k.on_table(0.4), (0.36, 0.28, 0.2), "coal")


def kit_okonomiyaki(k):
    """Okonomiyaki, as the film's griddle stall: pancakes on the griddle, glazed with sauce and
    mayonnaise, two spatulas; bottles of water, oil and soy sauce, a box of chopsticks, trays of
    spring onion and red ginger, takeaway foam boxes stacked; a cardboard box behind."""
    plate = k.on_counter(-0.3, 0.5)
    top = k.griddle(plate, 0.9, 0.32)
    for n in range(3):
        at = Vector((plate.x - 0.28 + 0.28 * n, plate.y, top))
        k.cylinder(at, 0.11, 0.035, "golden", segments=16)
        k.cylinder(at + Vector((0, 0, 0.034)), 0.1, 0.006, "sauce", segments=16)
        for m in (-0.04, 0.0, 0.04):
            k.box(at + Vector((0, m, 0.04)), (0.16, 0.008, 0.006), "mayo")
    for dx in (0.2, 0.32):
        k.box(Vector((plate.x + dx, plate.y - 0.1, top + 0.004)), (0.07, 0.1, 0.006), "steel")
        k.stick(Vector((plate.x + dx, plate.y - 0.15, top + 0.01)), Vector((plate.x + dx, plate.y - 0.3, top + 0.06)), 0.009, COLOURS["woodDark"])
    k.bottle(k.on_table(-0.65, 0.4), "water", height=0.3, radius=0.045, cap="syrupBlue")
    k.bottle(k.on_table(-0.53, 0.45), "oil", height=0.28, radius=0.045, cap="ketchup")
    k.bottle(k.on_table(-0.41, 0.4), "soy", height=0.26, radius=0.04, cap="ketchup")
    box = k.on_counter(0.42, 0.5)
    k.box(box, (0.14, 0.1, 0.14), "wood")
    for n in range(8):
        k.stick(box + Vector((-0.04 + 0.012 * n, 0.0, 0.08)), box + Vector((-0.04 + 0.012 * n, 0.0, 0.22)), 0.003)
    k.tray(k.on_counter(0.62, 0.5), (0.16, 0.14), "glass", "onion")
    k.tray(k.on_counter(0.8, 0.5), (0.16, 0.14), "glass", "ginger")
    k.foam_boxes(k.on_counter(0.98, 0.5), 3)
    k.box(k.on_table(0.35), (0.45, 0.34, 0.3), "card")
    k.squeeze(k.on_table(-0.1, 0.4), "sauce", "sauce")
    k.squeeze(k.on_table(0.0, 0.45), "mayo", "ketchup")


def crepe_cone(k, base):
    k.cylinder(base, 0.012, 0.16, "cone", top_radius=0.05, segments=10)
    k.ball(base + Vector((0, 0, 0.18)), (0.05, 0.05, 0.035), "cream")
    k.ball(base + Vector((0.025, 0, 0.21)), 0.02, "strawberry", u=6, v=4)


def kit_crepe(k):
    """Crêpes: two round crêpe griddles, the spreader stick, a stand of crêpes rolled with cream
    and strawberries; bowls of batter and cream behind."""
    for u in (-0.75, -0.3):
        at = k.on_counter(u, 0.5)
        k.box(at, (0.36, 0.32, 0.08), "steelDark")
        k.cylinder(at + Vector((0, 0, 0.075)), 0.17, 0.02, "iron", segments=20)
        k.cylinder(at + Vector((0, 0, 0.092)), 0.15, 0.01, "batter", segments=20)
    k.stick(k.on_counter(-0.5, 0.3) + Vector((0, 0, 0.01)), k.on_counter(-0.5, 0.3) + Vector((0.18, -0.02, 0.01)), 0.006)
    stand = k.on_counter(0.45, 0.5)
    k.box(stand, (0.46, 0.14, 0.08), "white")
    for n in range(4):
        crepe_cone(k, stand + Vector((-0.17 + 0.115 * n, 0, 0.06)))
    for u, c in ((-0.35, "batter"), (0.1, "cream")):
        k.filled(k.on_table(u), 0.1, 0.1, "steel", c, top_radius=0.14)
    k.box(k.on_table(0.5), (0.24, 0.2, 0.12), "strawberry")


def kit_icecream(k):
    """Rainbow ice cream: the freezer of colourful tubs on the counter, cones stacked, a stand of
    rainbow cones; a box of cones behind."""
    freezer = k.on_counter(-0.35, 0.5)
    k.box(freezer, (0.8, 0.34, 0.12), "white")
    for n, c in enumerate(("syrupRed", "custard", "syrupGreen", "flossBlue", "flossPurple", "sprinkleA")):
        k.cylinder(freezer + Vector((-0.32 + 0.128 * n, 0, 0.1)), 0.05, 0.03, c, segments=10)
    stand = k.on_counter(0.42, 0.5)
    k.box(stand, (0.36, 0.14, 0.08), "white")
    for n in range(3):
        base = stand + Vector((-0.11 + 0.11 * n, 0, 0.06))
        k.cylinder(base, 0.01, 0.13, "cone", top_radius=0.035, segments=8)
        for m, c in enumerate(("syrupRed", "custard", "syrupGreen", "flossBlue")):
            k.ball(base + Vector((0, 0, 0.15 + 0.045 * m)), (0.036, 0.036, 0.028), c, u=8, v=5)
    for n in range(2):
        k.cylinder(k.on_counter(0.78 + 0.08 * n, 0.5), 0.012, 0.16, "cone", top_radius=0.035, segments=8)
    k.box(k.on_table(-0.3), (0.42, 0.3, 0.2), "card")
    k.box(k.on_table(0.3), (0.5, 0.36, 0.28), "white")


def kit_shaved_ice(k):
    """Shaved ice: the ice-shaving machine with its crank wheel, a row of syrup bottles in their
    colours, cups heaped with ice and syrup; a block of ice and a cooler behind."""
    machine = k.on_counter(-0.75, 0.5)
    k.box(machine, (0.3, 0.3, 0.06), "syrupRed")
    for dx in (-0.12, 0.12):
        k.box(machine + Vector((dx, 0, 0.06)), (0.04, 0.2, 0.38), "syrupRed")
    k.box(machine + Vector((0, 0, 0.42)), (0.3, 0.26, 0.08), "syrupRed")
    k.cylinder(machine + Vector((0, 0, 0.3)), 0.08, 0.1, "ice")
    k.add(P.segment_bm(machine + Vector((0.15, 0, 0.47)), machine + Vector((0.2, 0, 0.47)), 0.02, 0.02, segments=8), COLOURS["steelDark"])
    k.add(L.ellipsoid_bm(machine + Vector((0.22, 0, 0.47)), (0.012, 0.11, 0.11), u=10, v=6), COLOURS["steel"])
    for n, c in enumerate(("syrupRed", "syrupBlue", "syrupGreen", "syrupYellow", "sprinkleA")):
        k.bottle(k.on_counter(0.45 + 0.11 * n, 0.55), c, height=0.25, radius=0.035, cap="white")
    for n, c in enumerate(("syrupRed", "syrupBlue", "syrupYellow")):
        at = k.on_counter(-0.3 + 0.17 * n, 0.45)
        k.cylinder(at, 0.035, 0.08, "white", top_radius=0.05, segments=10)
        k.cylinder(at + Vector((0, 0, 0.08)), 0.055, 0.1, c, top_radius=0.01, segments=10)
    k.box(k.on_table(-0.3), (0.32, 0.26, 0.22), "ice")
    k.box(k.on_table(0.35), (0.5, 0.34, 0.28), "syrupBlue")


def doner(k, at):
    """A doner kebab spit: a tall cone of meat on its upright rod over a drip tray, its heater
    glowing behind it."""
    k.box(at, (0.36, 0.36, 0.04), "steel")
    k.stick(at + Vector((0, 0, 0.03)), at + Vector((0, 0, 0.82)), 0.012, COLOURS["steelDark"])
    k.add(P.segment_bm(at + Vector((0, 0, 0.12)), at + Vector((0, 0, 0.66)), 0.11, 0.155, segments=14), COLOURS["golden"])
    for n in range(5):
        k.cylinder(at + Vector((0, 0, 0.16 + 0.1 * n)), 0.12 + 0.008 * n, 0.012, "brown", segments=14)
    k.box(at + Vector((0, 0.2, 0.04)), (0.34, 0.04, 0.7), "steelDark")
    k.box(at + Vector((0, 0.18, 0.12)), (0.26, 0.012, 0.54), "ember")


def kit_kebab(k):
    """Kebab, as the film's: two big doner spits standing on the table behind the counter; the
    cutting board with its knife, bread waiting, sauces and a bowl of salad on the counter."""
    for u in (-0.45, 0.42):
        doner(k, k.on_table(u, 0.42))
    board = k.on_counter(-0.4, 0.5)
    k.box(board, (0.42, 0.26, 0.03), "wood")
    k.box(board + Vector((0.05, -0.03, 0.028)), (0.24, 0.035, 0.006), "steel")
    k.box(board + Vector((-0.12, -0.03, 0.028)), (0.08, 0.03, 0.02), "coal")
    for n in range(5):
        k.ball(k.on_counter(0.1, 0.5) + Vector((0, 0, 0.012 + 0.018 * n)), (0.1, 0.09, 0.012), "batter", u=10, v=3)
    k.squeeze(k.on_counter(0.42, 0.35), "mayo", "white")
    k.squeeze(k.on_counter(0.52, 0.45), "ketchup", "ketchup")
    bowl = k.on_counter(0.82, 0.5)
    k.cylinder(bowl, 0.07, 0.07, "white", top_radius=0.11)
    k.ball(bowl + Vector((0, 0, 0.07)), (0.095, 0.095, 0.03), "cabbage")


def kit_castella(k):
    """Baby castella: the iron mould plate of little round cups, its lid swung open, cakes baking
    in it; paper bags of cakes and a tray of them; batter behind."""
    plate = k.on_counter(-0.5, 0.5)
    top = k.griddle(plate, 0.7, 0.3)
    k.box(Vector((plate.x, plate.y + 0.19, top - 0.01)), (0.72, 0.04, 0.28), "iron")
    for i in range(6):
        for j in range(2):
            k.ball(Vector((plate.x - 0.275 + 0.11 * i, plate.y - 0.05 + 0.1 * j, top - 0.002)), (0.035, 0.035, 0.022), "golden", u=8, v=4)
    for n in range(3):
        at = k.on_counter(0.45 + 0.14 * n, 0.45)
        k.box(at, (0.11, 0.07, 0.17), "paper" if n % 2 else "paperPink")
    tray = k.on_counter(0.95, 0.5)
    k.box(tray, (0.18, 0.2, 0.02), "wood")
    for n in range(6):
        k.ball(tray + Vector((-0.04 + 0.04 * (n % 3), -0.04 + 0.08 * (n // 3), 0.03)), 0.022, "golden", u=6, v=4)
    k.cylinder(k.on_table(-0.3), 0.08, 0.2, "steel", top_radius=0.09)
    k.box(k.on_table(0.35), (0.42, 0.3, 0.2), "card")


def kit_obanyaki(k):
    """Obanyaki: the iron plate of round moulds, cakes in them and turned out in a stack, the pots
    of red bean and custard to fill them; batter behind."""
    plate = k.on_counter(-0.3, 0.5)
    top = k.griddle(plate, 0.82, 0.3)
    for i in range(4):
        for j in range(2):
            at = Vector((plate.x - 0.3 + 0.2 * i, plate.y - 0.07 + 0.14 * j, top - 0.004))
            k.cylinder(at, 0.065, 0.018, "golden" if (i + j) % 2 else "batter", segments=14)
    for n in range(4):
        k.cylinder(k.on_counter(0.45, 0.5) + Vector((0, 0, 0.022 * n)), 0.065 - 0.004 * (n % 2), 0.022, "golden", segments=14)
    for u, c in ((0.7, "redBean"), (0.88, "custard")):
        k.filled(k.on_counter(u, 0.5), 0.065, 0.09, "steel", c)
    k.cylinder(k.on_table(-0.3), 0.09, 0.2, "steel", top_radius=0.1)
    k.box(k.on_table(0.35), (0.42, 0.3, 0.2), "card")


KITS = {
    "takoyaki": kit_takoyaki, "steamer": kit_steamer, "ringoame": kit_ringoame, "chocobanana": kit_chocobanana,
    "pine": kit_pine, "wataame": kit_wataame, "juice": kit_juice, "ramune": kit_ramune, "beer": kit_beer,
    "tornado": kit_tornado, "churros": kit_churros, "karaage": kit_karaage, "frank": kit_frank,
    "yakitori": kit_yakitori, "kushiyaki": kit_kushiyaki, "gyukushi": kit_gyukushi, "ikayaki": kit_ikayaki,
    "hamayaki": kit_hamayaki, "okonomiyaki": kit_okonomiyaki, "crepe": kit_crepe, "icecream": kit_icecream,
    "shavedIce": kit_shaved_ice, "kebab": kit_kebab, "castella": kit_castella, "obanyaki": kit_obanyaki,
}


def make_goods(name, counter, table):
    """A builder for the goods kit `name`, as build_village.py's builders are, given where the
    stall's counter and table are (STALL_COUNTER, STALL_TABLE)."""
    def build(collection):
        kit = Kit(counter, table)
        KITS[name](kit)
        body = P.join(f"goods_{name}", kit.pieces, collection, sharp=P.SHARP)
        return [body], {"height": 2.0}
    return build
