"""Build the things one carries (the user, 2026-10-22: hold, grab, store in the pouch of six, put down, give)
and export them for the game, with their icons for the pouch.

Run (from the project root):
    blender --background --factory-startup --python art/blender/build_items.py -- [--only ringoame,torch] [--no-icons]

(With --only, only those things are built, and their icons drawn into the sheet as it is.)

Outputs:
    public/models/props/item_<id>.glb   each thing, as the game loads it (vertex colours, no materials; the book
                                        UV mapped to its pictures instead: books.py, built by build_books.py)
    public/models/props/item_icons.webp its icons in a row-by-row sheet, in ICONS' order, ICON pixels each
    public/models/props/item_icons.json that order
    art/previews/items.png              the sheet, for looking over

What the festival's stalls hand over, as their goods show it (stall_goods.py, whose pieces these are made
with): a candied apple on its stick, a boat of takoyaki, a crepe, a cup of shaved ice...; the beach's shells
and starfish; a torch to carry, its flame a part of its own (`_flame`), lit at night; the one book; the three
weapons of the user's icons (Chiikawa's pink forked staff, Hachiware's blue one, the islanders' spring
weapon with a face); and the paw you see them in from your own eyes, the islanders' grey-mauve. Kurimanju's can and Rakko's
ukulele are build_props.py's, and only drawn here for their icons.

Each stands upright (Blender's Z), its front -Y, at the cast's size (a can 0.17 m tall); its origin is where
a paw holds it: low on its stick, round its cup, under its tray. As everything the props are made of, every
piece stands a few millimetres into what it stands on, so no two faces lie in one plane (check with
art/blender/check_flicker.py item_<id>).
"""

import json
import math
import os
import re
import sys

import bmesh
import bpy
import numpy as np
from mathutils import Matrix, Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import books as B  # noqa: E402
import build_props as P  # noqa: E402
import charlib as L  # noqa: E402
import houses as H  # noqa: E402
import stall_goods as SG  # noqa: E402

ROOT = P.ROOT
OUT = P.OUT_MODELS
PREVIEW = os.path.join(P.OUT_PREVIEWS, "items.png")
BLEND = os.path.join(ROOT, "art", "blender", "items.blend")
ICON = 128
ICON_COLUMNS = 8

C = dict(SG.COLOURS)
C.update({k: L.hex_color(v) for k, v in {
    "sausage": "#B9543A",
    "torchWood": "#7A5236",
    "torchWrap": "#C9A16E",
    "torchBand": "#6B4A33",
    "shellPink": "#F5CDBF",
    "shellRib": "#E8A797",
    "shellHinge": "#D99383",
    "starCoral": "#F0956A",
    "starDot": "#F8C9A6",
    # The islanders' own grey-mauve (import_characters.py ISLANDER["body"]).
    "paw": "#988584",
    # The weapons, as the user's icons paint them (art/icons/icon_thing_weapon01 to 03): the forked staffs' pink and
    # blue, their white teeth and grips; the spring weapon's cream head and spring, and its handle's wood.
    "forkPink": "#F8B2D0",
    "forkBlue": "#7AAADA",
    "forkWhite": "#F8F6F1",
    # The candy floss, white as the user's icon draws it (2026-10-24; the stalls' bags keep their colours).
    "flossWhite": "#FAF8F6",
    "baneHead": "#ECE7D3",
    "baneWood": "#DEBD92",
}.items()})
# The pen's colour, for the spring weapon's face painted onto its head (build_props' lines painted onto props).
C["ink"] = P.C["ink"]


def at(x, y, z):
    return Vector((x, y, z))


class Kit(SG.Kit):
    """stall_goods' kit of pieces, its colours ours (SG's and a few more)."""

    def __init__(self):
        super().__init__(None, None)

    def add(self, bm, colour):
        self.pieces.append((bm, C[colour] if isinstance(colour, str) else colour))


# ---------------------------------------------------------------------------- the stalls' food and drink
def ringoame(k):
    """A candied apple on its stick (the ringoame stall's)."""
    k.stick(at(0, 0, -0.08), at(0, 0, 0.13))
    SG.candy_apple(k, at(0, 0, 0.12))


def chocobanana(k):
    """A chocolate banana on its stick, sprinkled."""
    k.stick(at(0, 0, -0.08), at(0, 0, 0.09))
    SG.choco_banana(k, at(0, 0, 0.06))


def pine(k):
    """A spear of chilled pineapple on its stick."""
    k.stick(at(0, 0, -0.08), at(0, 0, 0.08))
    k.box(at(0, 0, 0.05), (0.044, 0.044, 0.16), "pineapple")


def wataame(k):
    """Candy floss on its stick: a white cloud of it, as the user's icon has it."""
    k.stick(at(0, 0, -0.08), at(0, 0, 0.14))
    for x, y, z, r in ((0.0, 0.0, 0.2, (0.085, 0.08, 0.075)), (0.045, -0.012, 0.235, (0.055, 0.05, 0.05)),
                       (-0.042, 0.01, 0.24, (0.052, 0.05, 0.046)), (0.004, 0.004, 0.272, (0.05, 0.048, 0.04))):
        k.ball(at(x, y, z), r, "flossWhite", u=14, v=9)


def tornado(k):
    """A tornado potato spiralled up its stick."""
    k.stick(at(0, 0, -0.08), at(0, 0, 0.3), 0.005)
    SG.tornado(k, at(0, 0, -0.03))


def churros(k):
    """A churro in its pink paper sleeve."""
    SG.churro(k, at(0, 0, -0.1))


def karaage(k):
    """A paper cone of fried chicken, a pick in it."""
    k.cylinder(at(0, 0, -0.07), 0.024, 0.14, "paper", top_radius=0.052, segments=12)
    for x, y, z in ((-0.02, -0.012, 0.082), (0.022, -0.008, 0.084), (0.0, 0.016, 0.086), (0.002, -0.002, 0.108)):
        k.ball(at(x, y, z), (0.03, 0.028, 0.025), "golden", u=8, v=5)
    k.stick(at(0.004, -0.002, 0.1), at(0.03, -0.01, 0.16), 0.003)


def frank(k):
    """A frankfurter on its stick, ketchup and mustard zigzagged down its front."""
    k.stick(at(0, 0, -0.08), at(0, 0, 0.12))
    k.add(L.ellipsoid_bm(at(0, 0, 0.17), (0.024, 0.024, 0.1), u=12, v=8), "sausage")
    for n in range(4):
        z = 0.12 + 0.032 * n
        for dy, colour, lift in ((-0.02, "ketchup", 0.0), (-0.019, "mustard", 0.012)):
            turn = Matrix.Rotation(0.55 * (-1) ** n, 3, "Y")
            k.add(L.ellipsoid_bm(at(0, dy, z + lift), (0.017, 0.006, 0.0035), rot=turn, u=8, v=4), colour)


def skewer(colour, size, leek=False):
    def build(k):
        k.skewer(at(0, 0, -0.08), at(0, 0, 0.22), 4, colour, size, leek)
    return build


def ikayaki(k):
    """A whole squid on its stick, upright: its long body, its fins at the top, its legs below."""
    k.stick(at(0, 0, -0.08), at(0, 0, 0.32), 0.005)
    k.ball(at(0, 0, 0.2), (0.036, 0.02, 0.1), "squid", u=10, v=8)
    k.ball(at(0, 0.0, 0.285), (0.062, 0.01, 0.028), "squidDark", u=8, v=5)
    for n in range(4):
        x0 = -0.022 + 0.015 * n
        k.add(P.segment_bm(at(x0, 0.0, 0.11), at(x0 * 1.6, -0.002, 0.03), 0.007, 0.0035, segments=5), "squidDark")


def hamayaki(k):
    """A grilled scallop in its shell, held flat on the paw: the shell ribbed out from its hinge at the back,
    the scallop in it glazed with soy, a dab of mayonnaise on it."""
    rx, ry, hinge = 0.07, 0.064, 0.052
    k.ball(at(0, 0, 0.016), (rx, ry, 0.016), "shell", u=18, v=6)
    for n in range(9):
        a = math.radians(-64 + 16 * n)
        dx, dy = math.sin(a), -math.cos(a)
        # As far as the shell's rim along this way from the hinge.
        qa = dx * dx / (rx * rx) + dy * dy / (ry * ry)
        qb = 2 * hinge * dy / (ry * ry)
        qc = hinge * hinge / (ry * ry) - 1
        reach = (-qb + math.sqrt(qb * qb - 4 * qa * qc)) / (2 * qa)
        # Over the shell's dome, a little proud of it all the way out.
        rib = []
        for s in range(7):
            t = reach * (0.1 + 0.84 * s / 6)
            x, y = dx * t, hinge + dy * t
            rib.append(at(x, y, 0.0175 + 0.016 * math.sqrt(max(0.0, 1 - (x / rx) ** 2 - (y / ry) ** 2))))
        for p, q in zip(rib, rib[1:]):
            k.add(P.segment_bm(p, q, 0.0048, 0.0048, segments=5), "shellDark")
    k.box(at(0, 0.064, 0.004), (0.05, 0.022, 0.016), "shellDark")
    k.ball(at(0, -0.004, 0.03), (0.036, 0.034, 0.016), "custard", u=12, v=6)
    k.ball(at(0, -0.004, 0.038), (0.03, 0.028, 0.011), "soy", u=12, v=5)
    k.ball(at(0.008, -0.01, 0.048), (0.011, 0.009, 0.004), "mayo", u=6, v=3)


def takoyaki(k):
    """A boat of takoyaki: six balls in their wooden tray, sauce on each and a dab of mayonnaise, a pick in
    one; held flat on the paw."""
    k.box(at(0, 0, 0), (0.17, 0.095, 0.022), "wood")
    for i in range(3):
        for j in range(2):
            c = at(-0.052 + 0.052 * i, -0.024 + 0.048 * j, 0.036)
            k.ball(c, (0.027, 0.027, 0.023), "golden", u=10, v=6)
            k.ball(c + at(0, 0, 0.012), (0.022, 0.022, 0.014), "sauce", u=10, v=5)
            k.ball(c + at(0.004, -0.003, 0.024), (0.009, 0.009, 0.004), "mayo", u=6, v=3)
    k.stick(at(0.052, -0.024, 0.05), at(0.07, -0.032, 0.115), 0.003)


def okonomiyaki(k):
    """Okonomiyaki in a foam tray, glazed with sauce, mayonnaise across it; held flat on the paw."""
    k.box(at(0, 0, 0), (0.15, 0.13, 0.024), "foam")
    k.ball(at(0, 0, 0.032), (0.064, 0.056, 0.02), "golden", u=16, v=6)
    k.ball(at(0, 0, 0.04), (0.058, 0.05, 0.014), "sauce", u=16, v=6)
    for n in range(3):
        k.ball(at(-0.03 + 0.03 * n, 0, 0.053), (0.006, 0.045, 0.003), "mayo", rot=Matrix.Rotation(0.5, 3, "Z"), u=6, v=3)


def crepe(k):
    """A crepe rolled into a cone round cream and a strawberry."""
    SG.crepe_cone(k, at(0, 0, -0.09))


def icecream(k):
    """Rainbow ice cream: four scoops up its cone."""
    k.cylinder(at(0, 0, -0.08), 0.008, 0.15, "cone", top_radius=0.036, segments=10)
    for m, colour in enumerate(("syrupRed", "custard", "syrupGreen", "flossBlue")):
        k.ball(at(0, 0, 0.084 + 0.042 * m), (0.037, 0.037, 0.028), colour, u=12, v=7)


def shaved_ice(k):
    """Shaved ice in its cup, its top red with syrup, a spoon-straw in it."""
    k.cylinder(at(0, 0, -0.045), 0.036, 0.09, "white", top_radius=0.05, segments=14)
    k.ball(at(0, 0, 0.04), (0.054, 0.054, 0.068), "ice", u=14, v=9)
    k.ball(at(0, 0, 0.074), (0.047, 0.047, 0.044), "syrupRed", u=14, v=8)
    k.stick(at(0.018, -0.006, 0.07), at(0.034, -0.014, 0.15), 0.0045, C["paperPink"])


def kebab(k):
    """A kebab: bread stuffed with meat, cabbage and tomato, wrapped in paper below."""
    k.cylinder(at(0, 0, -0.07), 0.032, 0.09, "paper", top_radius=0.038, segments=12)
    k.ball(at(0, 0, 0.032), (0.042, 0.03, 0.085), "batter", u=12, v=8)
    k.ball(at(0, 0, 0.104), (0.032, 0.021, 0.03), "brown", u=8, v=5)
    k.ball(at(0.013, -0.008, 0.118), (0.02, 0.014, 0.02), "cabbage", u=8, v=5)
    k.ball(at(-0.014, -0.006, 0.114), (0.016, 0.012, 0.016), "ketchup", u=8, v=5)


def castella(k):
    """A paper bag of baby castella, a red band round it, the little cakes heaped out of its top."""
    k.box(at(0, 0, -0.07), (0.1, 0.06, 0.13), "paper")
    k.box(at(0, 0, -0.025), (0.108, 0.068, 0.022), "ketchup")
    for x, y, z in ((-0.024, 0.0, 0.07), (0.024, 0.006, 0.073), (0.0, -0.01, 0.088)):
        k.ball(at(x, y, z), (0.026, 0.026, 0.022), "golden", u=10, v=6)


def obanyaki(k):
    """An obanyaki, its round cake turned to show its face, its lower half in a paper sleeve."""
    k.add(P.segment_bm(at(0, -0.016, 0.03), at(0, 0.016, 0.03), 0.05, 0.05, segments=20), "golden")
    k.add(P.segment_bm(at(0, -0.0185, 0.03), at(0, 0.0185, 0.03), 0.042, 0.042, segments=20), "brown")
    k.box(at(0, 0, -0.035), (0.108, 0.044, 0.06), "paper")


def steamer(k):
    """Jaga-butter: a steamed potato in its foil cup, butter melting on it."""
    k.cylinder(at(0, 0, -0.04), 0.05, 0.06, "foil", top_radius=0.062, segments=14)
    k.ball(at(0, 0, 0.03), (0.058, 0.052, 0.046), "potato", u=12, v=8)
    k.box(at(0, 0, 0.064), (0.032, 0.032, 0.02), "butter")


def juice(k):
    """A cup of orange juice, its lid on, a straw in it."""
    k.cylinder(at(0, 0, -0.06), 0.034, 0.12, "juiceA", top_radius=0.042, segments=14)
    k.cylinder(at(0, 0, 0.058), 0.045, 0.012, "white", segments=14)
    k.stick(at(0.012, 0, 0.06), at(0.02, -0.005, 0.14), 0.005, C["paperPink"])


def ramune(k):
    """A bottle of ramune, its marble in its neck."""
    k.bottle(at(0, 0, -0.1), "ramune", height=0.22, radius=0.032, cap="syrupBlue")
    k.ball(at(0, 0, 0.054), 0.012, "marble", u=6, v=4)


def beer(k):
    """A cup of beer, its froth over the brim."""
    k.cylinder(at(0, 0, -0.06), 0.036, 0.11, "beer", top_radius=0.044, segments=14)
    k.cylinder(at(0, 0, 0.048), 0.045, 0.028, "froth", segments=14)


# ---------------------------------------------------------------------------- the rest
def torch(k):
    """A torch to carry: a dark stick, its head wrapped in pale cloth bound twice round. Its flame is
    TORCH_FLAME's."""
    k.stick(at(0, 0, -0.13), at(0, 0, 0.2), 0.016, C["torchWood"])
    k.cylinder(at(0, 0, 0.15), 0.027, 0.1, "torchWrap", top_radius=0.031, segments=12)
    for z in (0.165, 0.225):
        k.cylinder(at(0, 0, z), 0.0305, 0.012, "torchBand", top_radius=0.0315, segments=12)


def torch_flame():
    """The torch's flame, as the village torches' (houses.flame_pieces, whose heart is drawn for a flame a metre or
    so tall), made at that size and brought down to its head's."""
    pieces = H.flame_pieces(at(0, 0, 0), 1.0, 0.6, tongues=4)
    for bm, _ in pieces:
        L.transformed(bm, Matrix.Translation(at(0, 0, 0.235)) @ Matrix.Scale(0.21, 4))
    return pieces


def seashell(k):
    """A fan shell from the beach, held up by its hinge: its pale pink fan, ribbed from the hinge."""
    k.ball(at(0, 0, 0.045), (0.058, 0.014, 0.05), "shellPink", u=16, v=10)
    for n in range(7):
        a = math.radians(-54 + 18 * n)
        d = Vector((math.sin(a), 0.0, math.cos(a)))
        k.add(L.ellipsoid_bm(at(0, -0.009, 0.0) + d * 0.046, (0.006, 0.0065, 0.046), rot=Matrix.Rotation(a, 3, "Y"), u=6, v=6),
              "shellRib")
    k.box(at(0, 0, -0.008), (0.042, 0.02, 0.014), "shellHinge")


def starfish(k):
    """A puffy starfish from the beach, coral pink, lying flat on the paw (build_props' starfish, smaller and
    coloured)."""
    bm = bmesh.new()
    outer_top, outer_bot, mid = [], [], []
    for i in range(10):
        a = i / 10 * 2 * math.pi + math.pi / 2
        r = 0.085 if i % 2 == 0 else 0.037
        outer_top.append(bm.verts.new((math.cos(a) * r, math.sin(a) * r, 0.008)))
        outer_bot.append(bm.verts.new((math.cos(a) * r, math.sin(a) * r, 0.0)))
        mid.append(bm.verts.new((math.cos(a) * r * 0.5, math.sin(a) * r * 0.5, 0.019)))
    top = bm.verts.new((0.0, 0.0, 0.025))
    bottom = bm.verts.new((0.0, 0.0, 0.0))
    for i in range(10):
        j = (i + 1) % 10
        bm.faces.new((top, mid[i], mid[j]))
        bm.faces.new((mid[i], outer_top[i], outer_top[j], mid[j]))
        bm.faces.new((outer_top[i], outer_bot[i], outer_bot[j], outer_top[j]))
        bm.faces.new((bottom, outer_bot[j], outer_bot[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    k.add(bm, "starCoral")
    # A pale dot down each arm.
    for i in range(5):
        a = i / 5 * 2 * math.pi + math.pi / 2
        for t in (0.35, 0.6):
            k.ball(at(math.cos(a) * 0.085 * t, math.sin(a) * 0.085 * t, 0.017 - 0.006 * t), (0.006, 0.006, 0.004), "starDot",
                   u=6, v=3)


# ---------------------------------------------------------------------------- the weapons
# The user's three (2026-10-24), after their icons (art/icons/icon_thing_weapon01 to 03) and the film's frames:
# Chiikawa's pink forked staff and Hachiware's blue one in the jungle (`Screenshot 2026-10-23 171236`, the pink one
# close in `171246`, the blue one in Furuhonya's paw in `171202`), and the spring weapon with a face Hitoha and
# Futaba carry (`171359`, `171411`), and Momonga (`171118`).

# A forked staff, in metres: its foot and the bottom of its fork's U, from the origin where a paw holds it (two fifths
# up from its foot, as Chiikawa holds hers in `171236`); its staff's and its grip's radius and the grip's length; its
# fork's right half from the bottom of the U up to its prong's tip (x, height over the U's bottom): a U, its tips
# bending out (the user, 2026-10-24: "U-shaped but the tip bends outward", as the film's `171236`, `171246` and the
# user's icon have them), and how thick it is along there (across, in the fork's plane), and out of the plane (a share
# of that: the prongs are flat bands); where along the prong its teeth stand (shares of its length) on both its edges,
# as the icon has them (the film's on the inner), how far each sticks out, how long its foot is and how thick it is.
# Measured against Chiikawa (0.91 m) in `171236`, where hers stands by her, and Hachiware's by him: three quarters of
# their height long (0.71 m), its U as wide as three tenths of it (0.27 m) and a quarter of it tall, its white grip a
# sixth of its length. As thick as the user's icon draws it (the user: the first was "too thin"): its staff a
# twenty-fifth of its length round, its prongs half as thick again.
FORK_FOOT = -0.31
FORK_BASE = 0.17
FORK_STAFF = 0.0165
FORK_GRIP = (0.0185, 0.12)
FORK_PRONG = ((0.0, 0.0), (0.032, 0.006), (0.057, 0.025), (0.07, 0.052), (0.074, 0.085), (0.074, 0.116),
              (0.078, 0.145), (0.089, 0.169), (0.105, 0.187), (0.124, 0.198))
# (The fork's bottom round, the prongs flatter up to their tips: where the staff joins it, it is deeper than the staff
# is round all across it, so the staff never shows through.)
FORK_THICK = (0.026, 0.021)
FORK_FLAT = (1.0, 0.6)
FORK_TEETH = (0.42, 0.56, 0.7)
TOOTH = (0.024, 0.028, 0.008)

# The spring weapon, バネのぶき (the user, 2026-10-24: not a club; held in one paw, its head shot out on the spring
# in its middle; here it only does what anything held does), remodelled at the user's word ("the head is oval, with
# the face more towards the tip", the handle and the spring shorter, all of it thicker), measured in the user's two
# drawings of it (the icon, lying; one standing, its face on its side) and the film's frames: Futaba's standing in
# her paw and Hitoha's across both of hers in `171411`, the two hanging by their handles in `171359`.
# - Its length: three fifths of the islanders' height in `171411`, half of it in `171359`; so 0.54 m, on theirs of
#   0.95 m to the top of the head. Of that, as the drawings and the film agree, the head a third, the spring an eighth
#   and the handle a half.
# - Its head: an oval a fifth longer than it is wide (half its width and half its length), as wide as a third of the
#   weapon is long. Its bottom sits over the spring's top.
# - The spring: how many turns, how far of it shows between the handle and the head, how far out it reaches by the
#   head and by the handle (narrowing down to the handle, as the drawings have it), and how thick its wire is. Wound
#   close, a turn barely more than its wire apart, so it reads as the drawings' stacked rings. In the head's cream.
# - The handle: how long, from its collar under the spring to its end; and its shape, turned as on a lathe, as the
#   drawings have it (how far down it, its radius there): a collar, a waist, a swell, then tapering to a round end.
#   It is held two fifths down it (BANE_GRIP), at the swell, which keeps its end clear of the ground in a seated paw.
# - Its face, on the head's side to the front, as the user draws it: two dot eyes beside a zigzag mouth, nearer the
#   tip than the spring, the face's up across the weapon, not along it (standing, its face lies on its side, its top
#   to the right as you look at it). Where each eye and each of the mouth's corners is: along toward the tip from the
#   head's middle, and up the face, in the head's half length and half width, as the drawings place them seen from
#   the side. The eyes' radius and the mouth's width, painted a hair off the head (PAINT_LIFT).
BANE_HEAD = (0.084, 0.1)
BANE_SPRING = (3.25, 0.074, 0.046, 0.03, 0.0103)
BANE_HANDLE = 0.285
BANE_PROFILE = ((-0.012, 0.0), (-0.008, 0.022), (0.0, 0.0335), (0.03, 0.0383), (0.06, 0.0395), (0.1, 0.0381),
                (0.14, 0.0335), (0.2, 0.0309), (0.26, 0.0326), (0.33, 0.0372), (0.42, 0.0363), (0.52, 0.034),
                (0.62, 0.0309), (0.72, 0.0281), (0.82, 0.0254), (0.89, 0.0222), (0.93, 0.0194), (0.96, 0.0157),
                (0.985, 0.0095), (1.0, 0.0))
BANE_GRIP = 0.4
BANE_EYES = ((0.512, 0.135), (-0.031, 0.213))
BANE_MOUTH = ((0.579, -0.257), (0.419, -0.426), (0.193, -0.198), (-0.016, -0.363), (-0.221, -0.176))
BANE_LINE = (0.0095, 0.0091)
# Paint on a round thing lies this far off it: one-sided and facing out, so the pen draws no outline round it (the
# pen outlines closed shapes; a dot or a line made as a little solid of its own came out a blot), and far enough off
# never to flicker into it within the distance things are drawn at.
PAINT_LIFT = 0.0009


def sweep_bm(path, radii, flats, segments=12, cap=4):
    """A tube along `path` (points in the XZ plane), `radii` across it there (one per point) in that plane and `flats`
    of that out of it (along Y; one per point), both its ends rounded off: a prong, a horn."""
    bm = bmesh.new()
    across = Vector((0.0, 1.0, 0.0))
    n = len(path)

    def tangent(i):
        return (path[min(i + 1, n - 1)] - path[max(i - 1, 0)]).normalized()

    def ring(c, t, r, flat):
        side = t.cross(across).normalized()
        return [bm.verts.new(c + side * (r * math.cos(a)) + across * (r * flat * math.sin(a)))
                for a in (2 * math.pi * j / segments for j in range(segments))]

    def rounded(c, way, t, r, flat):
        """Its rounded end past `c`, `way` out (along or against its tangent `t`): rings from its tip in."""
        out = [[bm.verts.new(c + way * r)]]
        for k in range(1, cap):
            phi = math.pi / 2 * k / cap
            out.append(ring(c + way * (r * math.cos(phi)), t, r * math.sin(phi), flat))
        return out

    t0, t1 = tangent(0), tangent(n - 1)
    rings = rounded(path[0], -t0, t0, radii[0], flats[0])
    rings += [ring(path[i], tangent(i), radii[i], flats[i]) for i in range(n)]
    rings += list(reversed(rounded(path[-1], t1, t1, radii[-1], flats[-1])))
    for lo, hi in zip(rings, rings[1:]):
        for j in range(segments):
            j2 = (j + 1) % segments
            if len(lo) == 1:
                bm.faces.new((lo[0], hi[j2], hi[j]))
            elif len(hi) == 1:
                bm.faces.new((lo[j], lo[j2], hi[0]))
            else:
                bm.faces.new((lo[j], lo[j2], hi[j2], hi[j]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    return bm


def along(path, share):
    """The point `share` of the way along `path` (by its length), and the way it runs there."""
    lengths = [(b - a).length for a, b in zip(path, path[1:])]
    left = share * sum(lengths)
    for (a, b), d in zip(zip(path, path[1:]), lengths):
        if left <= d or b is path[-1]:
            t = (b - a).normalized()
            return a + t * min(left, d), t
        left -= d
    return path[-1], (path[-1] - path[-2]).normalized()


def tooth_bm(a, b, tip, thick):
    """A flat tooth in the XZ plane, `thick` deep: its foot from a to b, its point at `tip`."""
    bm = bmesh.new()
    half = Vector((0.0, thick / 2, 0.0))
    front = [bm.verts.new(p - half) for p in (a, b, tip)]
    back = [bm.verts.new(p + half) for p in (a, b, tip)]
    bm.faces.new(front)
    bm.faces.new(back)
    for i in range(3):
        j = (i + 1) % 3
        bm.faces.new((front[i], back[i], back[j], front[j]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    return bm


def helix_bm(base, turns, height, radius, wire, steps=18, segments=8, top=None):
    """A spring: a wire `wire` round (its radius) wound `turns` times round Z, from `base` up `height`, `radius` round to
    the wire's middle (widening or narrowing evenly to `top` at its top, if given); its ends closed."""
    bm = bmesh.new()
    n = int(turns * steps)
    top = radius if top is None else top
    rings = []
    for i in range(n + 1):
        a = 2 * math.pi * turns * i / n
        out = Vector((math.cos(a), math.sin(a), 0.0))
        r = radius + (top - radius) * i / n
        middle = base + out * r + Vector((0.0, 0.0, height * i / n))
        way = (Vector((-math.sin(a), math.cos(a), 0.0)) * (r * 2 * math.pi * turns) + out * (top - radius)
               + Vector((0.0, 0.0, height))).normalized()
        side = way.cross(out).normalized()
        rings.append([bm.verts.new(middle + out * (wire * math.cos(s)) + side * (wire * math.sin(s)))
                      for s in (2 * math.pi * j / segments for j in range(segments))])
    for lo, hi in zip(rings, rings[1:]):
        for j in range(segments):
            j2 = (j + 1) % segments
            bm.faces.new((lo[j], lo[j2], hi[j2], hi[j]))
    for end in (rings[0], rings[-1]):
        bm.faces.new(end)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    return bm


def facing_out(bm, centre):
    """Turns each of `bm`'s faces to face away from `centre` (paint on a round thing: one-sided, facing out)."""
    for f in bm.faces:
        f.normal_update()
        if f.normal.dot(f.calc_center_median() - centre) < 0:
            f.normal_flip()
    return bm


def on_oval(centre, axes, way):
    """Where an oval (its middle `centre`, reaching `axes` out along X, Y and Z: a ball stretched so) is met `way` out
    from its middle (a way out of the ball it is stretched from, a unit vector), lifted a hair off it (PAINT_LIFT)."""
    n = Vector((way.x / axes.x, way.y / axes.y, way.z / axes.z)).normalized()
    return centre + Vector((way.x * axes.x, way.y * axes.y, way.z * axes.z)) + n * PAINT_LIFT, n


def oval_way(centre, axes, p):
    """The way out from an oval's middle (as on_oval takes it) to its point nearest about `p`, a point off it a
    little."""
    q = p - centre
    return Vector((q.x / axes.x, q.y / axes.y, q.z / axes.z)).normalized()


def painted_dot_bm(centre, axes, way, size, segments=14):
    """A dot painted on an oval (see on_oval) round where it is met `way` out, `size` its radius on it (see
    PAINT_LIFT)."""
    mid, n = on_oval(centre, axes, way)
    t1 = n.cross(Vector((0.0, 0.0, 1.0)))
    t1 = (t1 if t1.length > 1e-6 else n.cross(Vector((1.0, 0.0, 0.0)))).normalized()
    t2 = n.cross(t1)
    bm = bmesh.new()
    middle = bm.verts.new(mid)
    rim = []
    for j in range(segments):
        a = 2 * math.pi * j / segments
        edge = mid + (t1 * math.cos(a) + t2 * math.sin(a)) * size
        rim.append(bm.verts.new(on_oval(centre, axes, oval_way(centre, axes, edge))[0]))
    for j in range(segments):
        bm.faces.new((middle, rim[j], rim[(j + 1) % segments]))
    return facing_out(bm, centre)


def painted_line_bm(centre, axes, ways, width, steps=4):
    """A line painted on an oval (see on_oval) through where it is met `ways` out, `width` wide, following its round
    between them, its corners mitred so it keeps its width round them, its ends rounded."""
    path = []
    for a, b in zip(ways, ways[1:]):
        path += [a.slerp(b, s / steps) for s in range(steps)]
    path.append(ways[-1])
    points = [on_oval(centre, axes, d) for d in path]
    bm = bmesh.new()
    left, right = [], []
    for i, (p, n) in enumerate(points):
        before, after = points[max(i - 1, 0)][0], points[min(i + 1, len(points) - 1)][0]
        side = n.cross((after - before).normalized()).normalized()
        # (At a corner, out as far as keeps the line its width along both its sides.)
        miter = 1.0
        if 0 < i < len(points) - 1:
            t0, t1 = (p - before).normalized(), (after - p).normalized()
            miter = 1.0 / max(math.cos(0.5 * t0.angle(t1, 0.0)), 0.5)
        for out, edge in ((side, left), (-side, right)):
            edge.append(bm.verts.new(on_oval(centre, axes, oval_way(centre, axes, p + out * (width / 2 * miter)))[0]))
    for i in range(len(points) - 1):
        bm.faces.new((left[i], right[i], right[i + 1], left[i + 1]))
    facing_out(bm, centre)
    for end in (ways[0], ways[-1]):
        dot = painted_dot_bm(centre, axes, end, width / 2, segments=10)
        L.append_bm(bm, dot)
        dot.free()
    return bm


def fork(colour):
    """A forked staff (Chiikawa's pink one, Hachiware's blue one): a long thin staff, a white grip round its foot, and
    at its head a U of two prongs curling up and in at their tips, small white teeth along their outer edges; the fork
    across (X), its face to the front (-Y), as the user's icons draw it. Upright, its fork up; origin where a paw holds
    it (see FORK_FOOT)."""
    def build(k):
        # (The staff ends low in the bottom of the U, deep enough under its top that its pen never shows through.)
        k.add(P.segment_bm(at(0, 0, FORK_FOOT + FORK_GRIP[1] - 0.01), at(0, 0, FORK_BASE - 0.004),
                           FORK_STAFF, FORK_STAFF, segments=10), colour)
        r, length = FORK_GRIP
        k.add(L.capsule_bm(at(0, 0, FORK_FOOT), (0, 0, 1), length - 2 * r, r, u=12, v=8), "forkWhite")
        # Its fork: one curve from its left prong's tip down round the bottom of the U and up to its right one's, thick
        # at the bottom, thinner up to the tips.
        right = [at(x, 0, FORK_BASE + z) for x, z in FORK_PRONG]
        path = [at(-p.x, 0, p.z) for p in reversed(right[1:])] + right
        n = len(FORK_PRONG)

        def both(ends):
            half = [ends[0] + (ends[1] - ends[0]) * (i / (n - 1)) for i in range(n)]
            return list(reversed(half[1:])) + half
        k.add(sweep_bm(path, both(FORK_THICK), both(FORK_FLAT), segments=14), colour)
        # The teeth along both of each prong's edges, their feet a little into it, pointing out of it and a little up.
        out_len, foot, thick_t = TOOTH
        for share in FORK_TEETH:
            p, t = along(right, share)
            r = FORK_THICK[0] + (FORK_THICK[1] - FORK_THICK[0]) * share
            outward = Vector((0.0, 1.0, 0.0)).cross(t).normalized()
            for out in (outward, -outward):
                base = p + out * (r - 0.004)
                a, b, tip = base - t * (foot / 2), base + t * (foot / 2), base + out * out_len + t * (foot * 0.3)
                for sx in (1, -1):
                    mirror = (lambda q, s=sx: at(q.x * s, q.y, q.z))
                    k.add(tooth_bm(mirror(a), mirror(b), mirror(tip), thick_t), "forkWhite")
    return build


def spring_weapon(k):
    """The spring weapon (Hitoha's, Futaba's, Momonga's in the film), held in one paw: a wooden handle turned with a
    collar, a waist and a swell, tapering to its round end; a spring wound close on its top, narrowing down to it; and
    on that an oval head with a face on its side toward its tip, two dot eyes beside a zigzag mouth in the pen's colour,
    the face's up across the weapon (see BANE_EYES). Upright, its head up, its face to the front (-Y) and its top to
    the right (+X); origin where a paw holds it, on the handle's swell (BANE_GRIP)."""
    across, length = BANE_HEAD
    turns, shows, by_head, by_handle, wire = BANE_SPRING
    collar = BANE_HANDLE * BANE_GRIP
    k.add(L.lathe_bm([(r, collar - s * BANE_HANDLE) for s, r in BANE_PROFILE], segments=18), "baneWood")
    # The spring, from a little into the collar's top up into the head, round a stem up its middle that keeps you from
    # seeing through it between its turns.
    join = collar + shows
    k.add(helix_bm(at(0, 0, collar + 0.004), turns, shows + 0.002, by_handle - wire, wire, steps=24, segments=10,
                   top=by_head - wire), "baneHead")
    k.add(P.segment_bm(at(0, 0, collar - 0.01), at(0, 0, join + 0.02), 0.006, 0.02, segments=10), "baneHead")
    # The head, its bottom over the spring's top: where it is as wide as the spring there.
    centre = at(0, 0, join + length * math.sqrt(1.0 - (by_head / across) ** 2))
    axes = Vector((across, across, length))
    k.ball(centre, tuple(axes), "baneHead", u=24, v=16)

    def face(along, up):
        """The way out from the head's middle to the point of its front `along` toward its tip and `up` the face (see
        BANE_EYES), seen from before it."""
        return Vector((up, -math.sqrt(max(1.0 - along * along - up * up, 0.0)), along))

    eye, line = BANE_LINE
    for along, up in BANE_EYES:
        k.add(painted_dot_bm(centre, axes, face(along, up), eye), "ink")
    k.add(painted_line_bm(centre, axes, [face(along, up) for along, up in BANE_MOUTH], line), "ink")


def book(name, collection):
    """The island's one book to read, 伝説の生物図鑑 (books.py): shut, lying flat and held flat on the paw as a tray
    is; and its two halves open, which the game shows while it is read. Its cover's picture, if built
    (build_books.py), on it for its icon."""
    cover = B.COVER_FILE if os.path.exists(B.COVER_FILE) else None
    return [B.shut(name, collection, cover)] + B.open_parts(name, collection), B.info()


def paw(k):
    """Your right paw as you see it from your own eyes, holding what you hold: the islanders' round stub of an
    arm, its tip at the origin, reaching up along +Z."""
    k.add(L.capsule_bm(at(0, 0, -0.15), (0, 0, 1), 0.07, 0.047, u=20, v=12), "paw")


ITEMS = {
    "ringoame": ringoame, "chocobanana": chocobanana, "pine": pine, "wataame": wataame, "tornado": tornado,
    "churros": churros, "karaage": karaage, "frank": frank,
    "yakitori": skewer("chicken", 0.022, leek=True), "kushiyaki": skewer("chicken", 0.032),
    "gyukushi": skewer("beef", 0.034), "ikayaki": ikayaki, "hamayaki": hamayaki, "takoyaki": takoyaki,
    "okonomiyaki": okonomiyaki, "crepe": crepe, "icecream": icecream, "shavedIce": shaved_ice, "kebab": kebab,
    "castella": castella, "obanyaki": obanyaki, "steamer": steamer, "juice": juice, "ramune": ramune, "beer": beer,
    "torch": torch, "seashell": seashell, "starfish": starfish,
    "book": book,
    # Named as the user's icons are (art/icons/icon_thing_<id>.png).
    "weapon01": spring_weapon, "weapon02": fork("forkPink"), "weapon03": fork("forkBlue"),
    "paw": paw,
}
# Things made whole, of parts with UV maps and pictures (books.py), not of the kit's pieces: each returns its parts
# and what the game needs to know of them.
WHOLE = {"book"}
# build_props' hand-held things, drawn here only for their icons.
BORROWED = {"can": P.build_can, "ukulele": P.build_ukulele, "sword": P.build_sword}
# The icons' order in the sheet (src/life/Items.ts reads it from item_icons.json): every item but the paw.
ICONS = [i for i in ITEMS if i != "paw"] + list(BORROWED)


def build(item_id, collection):
    """A thing's parts, and what the game needs to know of them beyond its parts (its prop info)."""
    if item_id in WHOLE:
        return ITEMS[item_id](f"item_{item_id}", collection)
    k = Kit()
    ITEMS[item_id](k)
    objs = [P.join(f"item_{item_id}", k.pieces, collection, sharp=P.SHARP)]
    if item_id == "torch":
        objs.append(P.join("item_torch_flame", torch_flame(), collection))
    return objs, {}


def shown_shut(objs):
    """What of a thing's parts its icon shows: all but a book's open halves (shown only as it is read)."""
    return [o for o in objs if not re.search(r"_(open|page)\d$", o.name)]


# ---------------------------------------------------------------------------- icons
def render_icon(scene, cam, objs, path):
    """One icon: what `objs` make, three-quarters on from the front and a little above, filling the frame,
    on a clear ground."""
    for other in scene.objects:
        if other.type == "MESH":
            other.hide_render = other not in objs
    corners = [o.matrix_world @ Vector(c) for o in objs for c in o.bound_box]
    lo = Vector((min(c.x for c in corners), min(c.y for c in corners), min(c.z for c in corners)))
    hi = Vector((max(c.x for c in corners), max(c.y for c in corners), max(c.z for c in corners)))
    centre = (lo + hi) * 0.5
    size = max((hi - lo).length, 0.05)
    way = Vector((0.45, -1.0, 0.5)).normalized()
    cam.location = centre + way * (size * 4.0)
    cam.rotation_euler = (centre - cam.location).to_track_quat("-Z", "Y").to_euler()
    cam.data.ortho_scale = size * 0.95
    # (A thing coloured by a picture, the book, shows its picture; the rest their vertex colours.)
    textured = any(o.data.materials for o in objs)
    scene.display.shading.color_type = "TEXTURE" if textured else "VERTEX"
    scene.render.resolution_x = ICON
    scene.render.resolution_y = ICON
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)


def icon_sheet(scene, collection, built, only=None):
    """Renders every icon in ICONS' order into one sheet, ICON_COLUMNS across, and writes it and its order; with
    `only` (some things built alone), only theirs, the rest as the sheet has them, each moved to where ICONS' order
    puts it now (a thing added before others moves them along)."""
    cam = L.setup_preview(scene)
    scene.render.film_transparent = True
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    shading = scene.display.shading
    shading.light = "STUDIO"
    tmp = os.path.join(ROOT, "art", "previews", "_item_icon.png")
    rows = (len(ICONS) + ICON_COLUMNS - 1) // ICON_COLUMNS
    sheet = np.zeros((rows * ICON, ICON_COLUMNS * ICON, 4), dtype=np.float32)
    if only:
        try:
            with open(os.path.join(OUT, "item_icons.json"), encoding="utf-8") as f:
                old = json.load(f)
            order, columns = old["order"], old["columns"]
        except (OSError, ValueError, KeyError):
            old, order, columns = None, [], ICON_COLUMNS
        missing = [i for i in ICONS if i not in only and i not in order]
        if old is None or old.get("size") != ICON or missing:
            print("WARNING the icons' sheet lacks " + (", ".join(missing) or "its icons")
                  + ": build every thing (or those too) to draw it afresh")
            return
        image = bpy.data.images.load(os.path.join(OUT, "item_icons.webp"))
        width, height = image.size
        was = np.array(image.pixels[:], dtype=np.float32).reshape(height, width, 4)[::-1]
        bpy.data.images.remove(image)
        for n, item_id in enumerate(ICONS):
            if item_id in only:
                continue
            r0, c0 = divmod(order.index(item_id), columns)
            r, c = divmod(n, ICON_COLUMNS)
            sheet[r * ICON:(r + 1) * ICON, c * ICON:(c + 1) * ICON] = was[r0 * ICON:(r0 + 1) * ICON, c0 * ICON:(c0 + 1) * ICON]
    for n, item_id in enumerate(ICONS):
        if only and item_id not in only:
            continue
        objs = built.get(item_id) or [BORROWED[item_id](collection)]
        objs = shown_shut(objs)
        render_icon(scene, cam, objs, tmp)
        image = bpy.data.images.load(tmp)
        pixels = np.array(image.pixels[:], dtype=np.float32).reshape(ICON, ICON, 4)[::-1]
        bpy.data.images.remove(image)
        r, c = divmod(n, ICON_COLUMNS)
        sheet[r * ICON:(r + 1) * ICON, c * ICON:(c + 1) * ICON] = pixels
    os.remove(tmp)
    L.write_webp(os.path.join(OUT, "item_icons.webp"), sheet)
    with open(os.path.join(OUT, "item_icons.json"), "w", encoding="utf-8") as f:
        json.dump({"size": ICON, "columns": ICON_COLUMNS, "order": ICONS}, f)
    # The same sheet over a pale ground, to look over.
    flat = sheet[..., :3] * sheet[..., 3:] + np.array([0.93, 0.95, 0.97]) * (1.0 - sheet[..., 3:])
    image = bpy.data.images.new("items_sheet", flat.shape[1], flat.shape[0], alpha=False)
    rgba = np.ones((flat.shape[0], flat.shape[1], 4), dtype=np.float32)
    rgba[..., :3] = flat[::-1]
    image.pixels.foreach_set(rgba.ravel())
    image.filepath_raw = PREVIEW
    image.file_format = "PNG"
    image.save()
    bpy.data.images.remove(image)
    print("ICONS", os.path.join(OUT, "item_icons.webp"), "PREVIEW", PREVIEW)


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    only = set(argv[argv.index("--only") + 1].split(",")) if "--only" in argv else None
    run(only, "--no-icons" not in argv)


def run(only=None, icons=True):
    """Builds every thing (or only those in `only`), and their icons into the sheet (with `only`, just theirs)."""
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    collection = bpy.data.collections.new("items")
    scene.collection.children.link(collection)

    built = {}
    for item_id in ITEMS:
        if only and item_id not in only:
            continue
        objs, info = build(item_id, collection)
        path = os.path.join(OUT, f"item_{item_id}.glb")
        P.export_parts(objs, path, {"version": 1, "id": f"item_{item_id}", **info})
        tris = sum(len(p.vertices) - 2 for o in objs for p in o.data.polygons)
        verts = sum(len(o.data.vertices) for o in objs)
        print(f"BUILT item_{item_id}: {verts} verts, {tris} tris -> {path}")
        built[item_id] = objs

    if icons:
        icon_sheet(scene, collection, built, only)
    if not only:
        bpy.ops.wm.save_as_mainfile(filepath=BLEND, compress=True)
        print("SAVED", BLEND)


if __name__ == "__main__":
    main()
