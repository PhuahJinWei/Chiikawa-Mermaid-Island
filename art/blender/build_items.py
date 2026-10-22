"""Build the things one carries (the user, 2026-10-22: hold, grab, store in the pouch of six, put down, give)
and export them for the game, with their icons for the pouch.

Run (from the project root):
    blender --background --factory-startup --python art/blender/build_items.py -- [--only ringoame,torch] [--no-icons]

Outputs:
    public/models/props/item_<id>.glb   each thing, as the game loads it (vertex colours, no materials)
    public/models/props/item_icons.webp its icons in a row-by-row sheet, in ICONS' order, ICON pixels each
    public/models/props/item_icons.json that order
    art/previews/items.png              the sheet, for looking over

What the festival's stalls hand over, as their goods show it (stall_goods.py, whose pieces these are made
with): a candied apple on its stick, a boat of takoyaki, a crepe, a cup of shaved ice...; the beach's shells
and starfish; a torch to carry, its flame a part of its own (`_flame`), lit at night; and the paw you see
them in from your own eyes, the islanders' grey-mauve. Kurimanju's can, the rice ball and Rakko's ukulele
are build_props.py's, and only drawn here for their icons.

Each stands upright (Blender's Z), its front -Y, at the cast's size (a can 0.17 m tall); its origin is where
a paw holds it: low on its stick, round its cup, under its tray. As everything the props are made of, every
piece stands a few millimetres into what it stands on, so no two faces lie in one plane (check with
art/blender/check_flicker.py item_<id>).
"""

import json
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
}.items()})


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
    """Candy floss on its stick: a pink cloud of it."""
    k.stick(at(0, 0, -0.08), at(0, 0, 0.14))
    for x, y, z, r in ((0.0, 0.0, 0.2, (0.085, 0.08, 0.075)), (0.045, -0.012, 0.235, (0.055, 0.05, 0.05)),
                       (-0.042, 0.01, 0.24, (0.052, 0.05, 0.046)), (0.004, 0.004, 0.272, (0.05, 0.048, 0.04))):
        k.ball(at(x, y, z), r, "flossPink", u=14, v=9)


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
    "torch": torch, "seashell": seashell, "starfish": starfish, "paw": paw,
}
# build_props' hand-held things, drawn here only for their icons.
BORROWED = {"onigiri": P.build_onigiri, "can": P.build_can, "ukulele": P.build_ukulele}
# The icons' order in the sheet (src/life/Items.ts reads it from item_icons.json): every item but the paw.
ICONS = [i for i in ITEMS if i != "paw"] + list(BORROWED)


def build(item_id, collection):
    k = Kit()
    ITEMS[item_id](k)
    objs = [P.join(f"item_{item_id}", k.pieces, collection, sharp=P.SHARP)]
    if item_id == "torch":
        objs.append(P.join("item_torch_flame", torch_flame(), collection))
    return objs


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
    scene.render.resolution_x = ICON
    scene.render.resolution_y = ICON
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)


def icon_sheet(scene, collection, built):
    """Renders every icon in ICONS' order into one sheet, ICON_COLUMNS across, and writes it and its order."""
    cam = L.setup_preview(scene)
    scene.render.film_transparent = True
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    shading = scene.display.shading
    shading.light = "STUDIO"
    tmp = os.path.join(ROOT, "art", "previews", "_item_icon.png")
    rows = (len(ICONS) + ICON_COLUMNS - 1) // ICON_COLUMNS
    sheet = np.zeros((rows * ICON, ICON_COLUMNS * ICON, 4), dtype=np.float32)
    for n, item_id in enumerate(ICONS):
        objs = built.get(item_id) or [BORROWED[item_id](collection)]
        objs = [o for o in (objs if isinstance(objs, list) else [objs])]
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
    icons = "--no-icons" not in argv and not only

    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    collection = bpy.data.collections.new("items")
    scene.collection.children.link(collection)

    built = {}
    for item_id in ITEMS:
        if only and item_id not in only:
            continue
        objs = build(item_id, collection)
        path = os.path.join(OUT, f"item_{item_id}.glb")
        P.export_parts(objs, path, {"version": 1, "id": f"item_{item_id}"})
        tris = sum(len(p.vertices) - 2 for o in objs for p in o.data.polygons)
        verts = sum(len(o.data.vertices) for o in objs)
        print(f"BUILT item_{item_id}: {verts} verts, {tris} tris -> {path}")
        built[item_id] = objs

    if icons:
        icon_sheet(scene, collection, built)
    if not only:
        bpy.ops.wm.save_as_mainfile(filepath=BLEND, compress=True)
        print("SAVED", BLEND)


if __name__ == "__main__":
    main()
