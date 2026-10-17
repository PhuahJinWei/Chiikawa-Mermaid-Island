"""Build the island's ground in Blender and export it for the game.

Run (from the project root):
    blender --background --factory-startup --python art/blender/build_island.py

Outputs:
    public/models/island/terrain.glb    the ground: land, beaches and the sea floor near the island
    public/models/island/terrain.png    its painted colours, mapped from above
    public/models/island/height.bin     ground heights on a grid, for walking and the sea's colours
    public/models/island/landmarks.glb  the rocks (karst pillars and mesas, the rocks behind the
                                        night beach, sea spires), the cave's skylight and the
                                        jungle waterfall with its spray
    public/models/island/plants.glb     the jungle, the fields' crops and the village's flowers,
                                        joined into a mesh for each patch of the map
    art/previews/island_map.png          the colour map with the zones' outlines, for checking the layout

The island is laid out after the film's aerial shot (`mermaid island 1`), seen through a camera
matched to it (PLAN.md section 5 has the map). Game coordinates throughout, in metres: x east,
z south (north is -z), y up. The main beach in front of the village is at the origin. The water's
surface is at WATER.
"""

import json
import math
import os
import struct
import sys
import zlib

import bmesh
import bpy
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import charlib as L  # noqa: E402
import karst as K  # noqa: E402
import plants as PL  # noqa: E402

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
OUT_DIR = os.path.join(ROOT, "public", "models", "island")
OUT_PREVIEW = os.path.join(ROOT, "art", "previews", "island_map.png")
LAYOUT = os.path.join(ROOT, "public", "data", "layout.json")

WATER = -0.32          # the sea's surface (game y)
SIZE = 430.0           # the map is a square this many metres across: the island and its reef
CENTRE = (0.0, -97.0)  # its centre (x, z)
STEP = 1.0             # metres between the samples the ground is built from
TRIANGLES = 30000      # the ground's triangle budget after simplifying
HEIGHT_GRID = 385      # samples per side of the height grid the game walks on
COLOUR_SIZE = 2048     # texels per side of the painted colour map

# The coast as the film's aerial shot draws it: its distance from `centre` by direction (the angle
# of (x, z) from east toward south) as a short Fourier series, [a0, [a1, b1], [a2, b2], ...], with a
# gentle `wobble` of a metre or two. About 290 metres across and 215 from north to south; the north
# coast, hidden behind the pillars in the shot, follows an ellipse.
COAST = {"centre": (-8.0, -100.0), "wobble": 1.5,
         "series": [123.45, [0.43, -5.73], [16.47, 2.21], [-0.59, -2.86], [1.45, 1.25], [-1.21, -2.02],
                    [1.04, -0.33], [-0.25, -0.86]]}
# How wide the beach is, by direction from the coast's centre, after the shot: narrow where the
# jungle runs down to the water in the west and north, wider along the main beach, widest on the
# night beach to the south-east. Each widening: direction (degrees), metres, how far round (degrees).
BEACH = {"base": 3.0, "wider": [(88.0, 9.0, 50.0), (135.0, 6.0, 30.0), (42.0, 18.0, 22.0), (-5.0, 5.0, 20.0)]}
# Features, in game coordinates.
# The festival at the bay, after the film: the beach in front of two long rows of stalls along its
# back, facing the bay, and through the welcome arch in the opening between them, a street of
# stalls running inland. PLAZA and STREET are where the sand is, between the stalls.
PLAZA = {"centre": (0.0, -5.5), "half": (31.0, 8.5), "feather": 3.0}
STREET = {"centre": (0.0, -29.4), "half": (4.6, 15.6), "feather": 1.5}
# Its ground is level, as in the film: a band along the front rows (which follow the back of the
# beach, z = row[0] + row[1] x^2), from `behind` them to `front` of them, and the street box (centre,
# half sizes); it eases into the ground round them over `feather` metres, and past the street's far
# end over `ramp` metres, where the path climbs on into the jungle.
FESTIVAL = {"level": 0.5, "row": (-13.6, 0.0022), "rows_half": 30.0, "behind": 5.5, "front": 2.0, "feather": 3.0,
            "street": ((0.0, -29.6), (8.8, 16.4)), "ramp": 22.0}
# The village: a round clearing deep in the jungle, its huts round the watchtower stage. Its level
# ground eases into the jungle's over `slope` metres, gently enough to walk up from the festival.
VILLAGE = {"centre": (0.0, -84.0), "radius": 22.0, "feather": 6.0, "slope": 12.0}
FIELDS = {"centre": (-45.0, -38.0), "half": (14.0, 12.0), "feather": 6.0, "height": 1.2}
# The cave's skylight in the middle of the island, as in the film's aerial shot: a round opening
# (radius) over the cave's water, the sea come in under the island, with the cave's floor below
# it. Its sides flare out by `bell` under the edge into the cave, and a lip of mossy rock `width`
# wide runs round it at `rim`, in a hollow whose sides rise to the jungle's ground over `slope`
# metres: low enough that the water shows from above, as in the shot. The cave beyond the opening
# is still to be planned.
SKYLIGHT = {"centre": (2.0, -159.0), "radius": 12.0, "floor": -3.0, "bell": 2.5, "width": 5.5, "rim": 7.0,
            "slope": 14.0, "seed": 31}
# The jungle waterfall, after the film's frame of it, where the aerial shot shows its spray rising
# out of the trees in the west: it pours from a notch in the south rim of the mesa listed at `rock`
# (angle from east toward south, half width, depth) down a face hung with `vines` into a round pool
# at its foot. That mesa is reshaped for it into a long, low wall of rock, wide across the frame as
# in the film: `centre`, `radii`, `turn` and `top`. The pool's water stands at `level` over a floor
# at `floor`; round it the ground is a bank at least `bank` high out to `clearing` metres from its
# middle, easing into the land over `feather`, open to the sky above the water.
FALL = {"rock": (-90.0, -70.0), "centre": (-92.0, -70.0), "radii": (16.0, 10.5), "turn": 0.05, "top": 10.2,
        "notch": (math.pi / 2, 1.0, 1.4), "vines": 84, "seed": 41}
POOL = {"centre": (-92.0, -51.5), "radius": 8.0, "floor": 0.1, "level": 1.3, "bank": 1.8, "clearing": 13.0,
        "feather": 8.0}
# Round the pool as in the film's frame, seen from its south bank, where the plants close in on the
# view: a big tree with buttress roots at the bank's east end (dx, dz from the pool's middle);
# plants (kind, which of its shapes, dx, dz, scale): monstera and a red ti plant at its west end,
# white flowers to the east, ferns at the water; a mossy slab of rock on the west bank and a mossy
# stump of it at the water's edge on the east with bromeliads on top (dx, dz, radii, turn, height,
# seed).
POOL_TREE = (5.9, 7.6)
POOL_PLANTS = [("ti", 1, -3.9, 9.2, 1.05), ("monstera", 0, -4.2, 7.4, 1.3), ("monstera", 2, -6.0, 6.6, 1.45),
               ("monstera", 1, -8.4, 3.6, 1.3), ("ti", 3, -6.8, 9.6, 1.2), ("fern", 2, -5.4, 10.2, 1.3),
               ("fern", 0, 6.6, 2.4, 1.3), ("fern", 3, -7.0, 2.2, 1.25), ("fern", 1, 7.4, 4.8, 1.2),
               ("bush", 1, 4.4, 11.4, 1.25), ("bush", 1, 6.2, 10.4, 1.05), ("fern", 4, 3.6, 12.6, 1.2)]
POOL_ROCKS = [(-6.6, 4.6, (2.4, 1.4), 0.9, 1.7, 62), (4.6, 7.4, (1.3, 1.1), 0.2, 1.3, 63)]
# The sea cliffs on the north-east coast, after the film's frame of them, hidden behind the pillars
# in its aerial shot: tall bedded sandstone with grass on top, the coast running away along them
# and a sea stack standing off it. Along the coast between `start` and `end` (directions from the
# coast's centre, degrees from east toward south) the land rises sheer out of deep water to a grassy
# top `height` high, out to `depth` metres inland, then eases down into the jungle over `ease`. At
# the west end a lower headland juts `reach` metres out to sea at `headland` (over `spread`
# degrees), `low` high, where the cliffs are seen from: east of it the coast turns into a cove
# (`cove`: where it starts, its back, where it rejoins the coast, degrees, and how deep in it cuts,
# metres), so from the headland the cliffs along the cove's far side face you across the water as
# they run away to the open sea. The top rises from the beach west of the headland by `west`, up to
# the cliffs' full height across the back of the cove over `rise`, and falls back to the beach at
# the east end over `fall`. The sea floor drops `deep` metres at the cliffs' foot.
CLIFFS = {"start": -80.0, "west": -74.0, "headland": -70.0, "reach": 10.0, "spread": 4.0, "low": 6.5,
          "cove": (-68.0, -64.0, -47.0, 26.0), "rise": (-66.0, -61.0), "height": 18.0, "fall": (-35.0, -26.0),
          "end": -24.0, "depth": 18.0, "ease": 24.0, "deep": 3.6, "seed": 51}
# The sea stack off the mouth of the cove and a smaller rock beside it: centre, radii, turn, height
# above the water, seed.
STACKS = [((76.0, -203.5), (2.9, 2.3), 0.4, 10.6, 71), ((74.0, -208.0), (1.5, 1.2), 1.1, 3.6, 72)]

# Rock landmarks, after the film's aerial shot (each placed through a camera matched to it); karst.py
# builds them. Tall limestone pillars stand in a ring round the cave's skylight, with white rock
# standing out of the jungle on their tops: centre (x, z), radii, turn, the top's height (y), seed,
# and the white tips (offset x, z from the middle, radius, height above the top).
TOWERS = [
    ((-34.0, -170.0), (12.5, 12.0), 0.3, 59.0, 1, [(-3.5, -1.5, 2.6, 6.0), (3.5, 2.0, 2.2, 4.5), (0.5, 5.0, 1.8, 3.5)]),
    ((2.0, -190.0), (13.0, 12.5), -0.4, 53.0, 2, [(-4.0, 1.0, 2.8, 6.5), (2.5, -2.0, 2.4, 5.0), (5.0, 3.5, 1.8, 3.5)]),
    ((30.0, -137.0), (12.0, 11.0), 0.2, 74.0, 13, [(1.0, 0.5, 3.6, 14.0), (-4.5, 3.0, 1.8, 4.0)]),
    ((46.0, -128.0), (10.0, 9.0), 0.8, 60.0, 3, [(0.5, -1.0, 2.4, 7.0)]),
    ((69.0, -103.0), (14.0, 13.0), -0.2, 70.0, 5, [(1.5, 0.0, 3.0, 10.0), (-4.0, 3.0, 1.6, 3.5)]),
    ((40.0, -70.0), (12.2, 11.5), 1.1, 62.0, 7, [(-2.0, -2.0, 1.8, 3.5)]),
    ((-59.0, -72.0), (11.5, 11.0), 0.5, 44.0, 6, []),
]
# How high the ground rises round a tall pillar's foot, and how far out the slope runs.
TALUS = {"height": 9.0, "spread": 26.0}
# Short, wide pillars the jungle all but hides, as in the shot: mesas thick with trees on top,
# swelling into a mound of them (`mound`, 1 for a gentle one). Centre, radii, turn, the top's
# height, seed, mound.
MESAS = [
    ((-57.0, -142.0), (17.0, 15.5), 0.4, 28.0, 4, 3.4),    # under the great dome of trees west of the skylight
    ((-38.0, -102.0), (14.5, 13.0), 0.9, 24.0, 15, 1.2),
    ((-105.0, -132.0), (18.0, 15.0), 0.2, 21.0, 16, 2.2),  # the dark mound in the north-west
    ((105.0, -100.0), (16.0, 14.0), -0.5, 20.0, 17, 1.9),  # the bright mound in the east
    ((-75.0, -176.0), (12.0, 11.0), 0.6, 20.0, 18, 1.0),
    ((75.0, -160.0), (13.0, 11.5), 0.1, 22.0, 19, 1.2),
    ((88.0, -72.0), (10.0, 9.0), 1.3, 18.0, 20, 1.0),
    ((-90.0, -70.0), (11.0, 10.0), 0.3, 17.0, 21, 1.0),
    ((-20.0, -135.0), (9.0, 8.0), 0.7, 16.0, 22, 0.8),
]
# Two little white spires poking out of the jungle in the west: centre, radius, top, seed.
NEEDLES = [((-92.0, -103.0), 3.5, 20.0, 23), ((-85.0, -100.0), 3.0, 18.0, 24)]
# Low layered rocks behind the night beach, at the east end of the main beach.
LAYERED = {"stone": "headland", "facet_w": 0.45, "strata": 0.6, "rim": 0.1, "lumps": 0.12, "tip": 0.8}
HEADLAND_ROCKS = [
    dict(LAYERED, centre=(72.0, -38.0), radii=(11.0, 8.0), turn=0.5, top=7.0, seed=9, segments=64, flutes=14,
         facets=7, ledges=2, step=1.2, taper=0.15, shoulder=0.2),
    dict(LAYERED, centre=(55.0, -33.0), radii=(8.0, 7.0), turn=0.2, top=6.0, seed=10, segments=36, flutes=10,
         facets=6, ledges=1, step=1.2, taper=0.2, shoulder=0.22),
    dict(LAYERED, centre=(98.0, -47.0), radii=(11.0, 9.0), turn=0.9, top=8.0, seed=11, segments=48, flutes=10,
         facets=6, ledges=2, step=1.2, taper=0.2, shoulder=0.2),
]
# Sea spires in clusters off the coast, where the shot has them: the cluster's middle (x, z), seed,
# how many.
SPIRES = [((-174.0, -118.0), 21, 4), ((-138.0, -174.0), 22, 2), ((-126.0, -56.0), 23, 4), ((112.0, -40.0), 24, 2),
          ((153.0, -88.0), 25, 3), ((148.0, -159.0), 26, 3)]

# The plants (plants.py shapes them): canopy trees grow in clumps, spaced in metres; palms line
# the jungle's edge by the beach; ferns, bushes and monstera grow closer together along paths and
# edges than deep under the trees; the canopy opens into clearings where a noise rises past
# `clearings`.
JUNGLE = {"clump_spacing": 9.5, "trees": (5, 8), "tree_height": (9.0, 15.0), "palm_spacing": 6.0, "palms": 190,
          "understory": (2.3, 3.0), "clearings": 0.8, "big_trees": 12, "big_spacing": 36.0}
FIELD_ROW = 2.4         # metres between the fields' rows
BUTTERFLIES = 16        # blue butterflies, each fluttering round a flowering bush
CANOPY_PATCHES = 6      # the canopy and palms are joined into a mesh for each of 6 x 6 patches, near and far
UNDERSTORY_PATCHES = 8  # what grows under them into 8 x 8, which the game draws only nearby
# How much room each kind of placed prop keeps clear of trees, in metres from its middle.
PROP_ROOM = {"hut_green": 7.0, "hut_warm": 7.0, "hut_plank": 5.5, "beehive": 3.8, "stage": 6.5, "torch": 1.0,
             "stall_pink": 3.2, "stall_purple": 3.2, "stall_orange": 3.2, "stall_blue": 3.2, "stall_red": 3.2,
             "stall_white": 3.2, "arch": 2.5, "banner": 2.0, "bunting_row": 2.0, "bunting_street": 2.0,
             "lanterns": 1.2, "palm": 2.0, "sign": 2.0}
# Flowering bushes grow round the backs of the village's houses, this far from their middles.
HUT_ROOM = {"hut_green": (5.6, 6.6), "hut_warm": (5.6, 6.6), "hut_plank": (4.4, 5.2), "beehive": (3.0, 3.6)}


def layout_props():
    """The props placed on the island by the game's layout file: kind, x, z and turn of each."""
    if not os.path.exists(LAYOUT):
        return []
    with open(LAYOUT, encoding="utf-8") as f:
        return [(p["kind"], p["x"], p["z"], p.get("turn", 0.0)) for p in json.load(f).get("props", [])]
# Packed-earth paths: polylines (x, z) and their width in metres.
PATHS = [
    ([(0.0, -45.0), (0.5, -54.0), (0.0, -62.0)], 3.4),                                  # the street up to the village
    ([(1.0, -105.0), (3.0, -122.0), (2.0, -140.0)], 3.0),                               # the village to the skylight
    ([(-22.0, -90.0), (-32.0, -72.0), (-40.0, -57.0), (-44.0, -50.0)], 2.6),            # the village to the fields
    ([(14.0, -1.0), (38.0, -8.0), (58.0, -16.0), (74.0, -24.0)], 2.6),                  # the plaza to the night beach
    ([(15.0, -74.0), (22.0, -56.0), (34.0, -34.0), (40.0, -14.0)], 2.4),                # the village down to the beach
    ([(-59.0, -43.0), (-68.0, -45.5), (-76.0, -43.5), (-86.0, -40.5)], 2.2),           # the fields to the waterfall
    ([(16.0, -172.0), (20.0, -184.0), (24.0, -195.0), (27.0, -204.0)], 2.2),           # the skylight to the sea cliffs
]

COLOURS = {k: np.array(L.hex_color(v)[:3]) for k, v in {
    "sand": "#F0C28B",
    "sandPatch": "#E3A770",
    "wetSand": "#D9A774",
    "seaFloor": "#E2C08F",
    "grass": "#84C557",
    "grassDark": "#6CB048",
    "clover": "#A5D873",
    "path": "#E8C08C",
    "plaza": "#ECC795",
    "earth": "#DDB27C",
    "soil": "#A9744E",
    "crop": "#7DBE4C",
    "rock": "#ADA69B",
    "rockDark": "#8F887D",
    "rubble": "#D8D9D0",
    "rubbleDark": "#BABDB5",
    "bankEarth": "#86643F",
    "bankMoss": "#5F9B43",
}.items()}


# ---------------------------------------------------------------------------- shapes
def smoothstep(a, b, x):
    t = np.clip((x - a) / (b - a), 0.0, 1.0)
    return t * t * (3.0 - 2.0 * t)


def noise(x, z, scale, seed):
    """Smooth value-like noise in [-1, 1] from a few rotated sine waves: soft, never busy."""
    out = np.zeros_like(x)
    for i in range(4):
        a = seed * 1.7 + i * 2.39996
        k = (1.9 ** i) / scale
        u = (x * math.cos(a) + z * math.sin(a)) * k
        v = (-x * math.sin(a) + z * math.cos(a)) * k
        out += np.sin(u + seed * 3.1 + i) * np.cos(v * 1.3 - seed + i * 0.7) / (1.6 ** i)
    return out / 1.9


def box_mask(x, z, centre, half, feather):
    """1 inside a rounded rectangle, easing to 0 over `feather` metres outside it."""
    dx = np.maximum(np.abs(x - centre[0]) - half[0], 0.0)
    dz = np.maximum(np.abs(z - centre[1]) - half[1], 0.0)
    return 1.0 - smoothstep(0.0, feather, np.hypot(dx, dz))


def polyline_distance(x, z, points):
    best = np.full_like(x, 1e9)
    for (ax, az), (bx, bz) in zip(points, points[1:]):
        vx, vz = bx - ax, bz - az
        t = np.clip(((x - ax) * vx + (z - az) * vz) / (vx * vx + vz * vz), 0.0, 1.0)
        best = np.minimum(best, np.hypot(x - (ax + t * vx), z - (az + t * vz)))
    return best


def coast_radius(phi):
    """How far the coast is from its centre in the direction phi (see COAST), with the cliffs'
    headland jutting out and their cove cut in (see CLIFFS)."""
    series = COAST["series"]
    radius = series[0] + sum(a * np.cos(k * phi) + b * np.sin(k * phi) for k, (a, b) in enumerate(series[1:], 1))
    radius = radius + COAST["wobble"] * noise(60.0 * np.cos(phi), 60.0 * np.sin(phi), 25.0, 5.0)
    c = CLIFFS
    radius = radius + c["reach"] * np.exp(-(angle_diff(phi, math.radians(c["headland"])) / math.radians(c["spread"])) ** 2)
    start, back, rejoin, depth = c["cove"]
    deg = np.degrees(phi)
    return radius - depth * smoothstep(start, back, deg) * (1.0 - smoothstep(back + 1.0, rejoin, deg))


def coast_distance(x, z):
    """Signed distance to the coast in metres, roughly: positive inland. Also the direction angle
    from the coast's centre."""
    cx, cz = COAST["centre"]
    dx, dz = x - cx, z - cz
    d = np.hypot(dx, dz) + 1e-6
    phi = np.arctan2(dz, dx)
    return coast_radius(phi) - d, phi


def cliff_profile(phi):
    """How much sea cliff the coast has in the direction phi (0 to 1), and the height of the land on
    top of it (see CLIFFS)."""
    c = CLIFFS
    deg = np.degrees(phi)
    mask = smoothstep(c["start"] - 3.0, c["start"] + 3.0, deg) * (1.0 - smoothstep(c["end"] - 3.0, c["end"] + 3.0, deg))
    top = (c["low"] * smoothstep(c["start"], c["west"], deg) + (c["height"] - c["low"]) * smoothstep(*c["rise"], deg)
           - c["height"] * smoothstep(*c["fall"], deg))
    return mask, top


_CLIFF_COAST = []


def cliff_coast():
    """The coast along the sea cliffs, as a fine polyline (x, z) from west to east."""
    if not _CLIFF_COAST:
        c = CLIFFS
        cx, cz = COAST["centre"]
        phi = np.radians(np.arange(c["start"] - 4.0, c["end"] + 4.0 + 1e-6, 0.1))
        r = coast_radius(phi)
        _CLIFF_COAST.extend(zip((cx + r * np.cos(phi)).tolist(), (cz + r * np.sin(phi)).tolist()))
    return _CLIFF_COAST


def cliff_distance(x, z, reach=48.0):
    """How far (x, z) is from the shore along the sea cliffs, in metres (1e9 when far off): the true
    distance, where the shore turns into the cove as much as anywhere."""
    line = cliff_coast()
    xs, zs = [p[0] for p in line], [p[1] for p in line]
    out = np.full(np.shape(x), 1e9)
    near = (x > min(xs) - reach) & (x < max(xs) + reach) & (z > min(zs) - reach) & (z < max(zs) + reach)
    if near.any():
        out[near] = polyline_distance(x[near], z[near], line)
    return out


def cliff_line(step=0.15):
    """Points along the foot of the sea cliffs at the water, from west to east, with their outward
    normals and the height of the land on top: where the cliffs stand more than a metre high."""
    c = CLIFFS
    cx, cz = COAST["centre"]
    phi = np.radians(np.arange(c["start"], c["end"] + 1e-6, step))
    r = coast_radius(phi)
    pts = np.stack([cx + r * np.cos(phi), cz + r * np.sin(phi)], axis=1)
    tangent = np.gradient(pts, axis=0)
    normals = np.stack([tangent[:, 1], -tangent[:, 0]], axis=1)
    normals /= np.linalg.norm(normals, axis=1, keepdims=True)
    inland = pts - normals * 3.2
    tops = ground(inland[:, 0], inland[:, 1])[0]
    keep = np.nonzero(tops > WATER + 1.0)[0]
    span = slice(keep.min(), keep.max() + 1)
    return pts[span], normals[span], tops[span]


def beach_width(phi):
    """How wide the beach is in a direction from the coast's centre (see BEACH)."""
    width = np.full_like(phi, BEACH["base"])
    for deg, metres, spread in BEACH["wider"]:
        width = width + metres * np.exp(-(angle_diff(phi, math.radians(deg)) / math.radians(spread)) ** 2)
    return width


def offshore(x, z, margin):
    """(x, z) moved straight out from the island, if need be, until it is `margin` metres off the coast."""
    cx, cz = COAST["centre"]
    for _ in range(60):
        if coast_distance(np.array([x]), np.array([z]))[0][0] <= -margin:
            break
        d = math.hypot(x - cx, z - cz)
        x, z = x + (x - cx) / d, z + (z - cz) / d
    return x, z


def angle_diff(a, b):
    return np.arctan2(np.sin(a - b), np.cos(a - b))


def festival_level(x, z):
    """1 where the festival's ground is level, easing to 0 round it (see FESTIVAL)."""
    f = FESTIVAL
    # The band under the front rows, following the back of the beach.
    dz = z - (f["row"][0] + f["row"][1] * x * x)
    out_x = np.maximum(np.abs(x) - f["rows_half"], 0.0)
    out_z = np.maximum(np.maximum(-f["behind"] - dz, dz - f["front"]), 0.0)
    rows = 1.0 - smoothstep(0.0, f["feather"], np.hypot(out_x, out_z))
    # The street: easing off over the feather at its sides and front, over the ramp past its far end.
    (cx, cz), (hx, hz) = f["street"]
    side = np.maximum(np.abs(x - cx) - hx, 0.0)
    south = np.maximum(z - (cz + hz), 0.0)
    north = np.maximum((cz - hz) - z, 0.0) * (f["feather"] / f["ramp"])
    street = 1.0 - smoothstep(0.0, f["feather"], np.hypot(side, south + north))
    return np.maximum(rows, street)


def land_height(x, z):
    """The ground's natural height at points (x, z) on land, before any feature shapes it."""
    x, z = np.asarray(x, dtype=float), np.asarray(z, dtype=float)
    return ground(x, z, natural=True)[0]


def ground(x, z, natural=False):
    """Height of the ground (y) and the masks the painting needs. `natural` leaves out what the
    festival street and the village do to it."""
    s, phi = coast_distance(x, z)
    m_cliff, cliff_top = cliff_profile(phi)
    beach_w = (beach_width(phi) + 2.0 * noise(x, z, 30.0, 2.0)) * (1.0 - m_cliff)
    # Along the sea cliffs, the true distance to the shore, signed like s (positive inland).
    s_cliff = np.array(s, dtype=float, copy=True)
    by_cliffs = m_cliff > 0.0
    if by_cliffs.any():
        s_cliff[by_cliffs] = np.sign(s[by_cliffs]) * cliff_distance(x[by_cliffs], z[by_cliffs])

    # The sea floor: a gently shelving lagoon, then the reef edge dropping into the deep; deeper at
    # the foot of the sea cliffs.
    t = np.maximum(-s, 0.0)
    lagoon_w = 66.0 + 10.0 * np.sin(2.0 * phi + 0.7)
    sea = WATER - (0.02 * t + 2.0 * smoothstep(0.0, lagoon_w, t)) - 15.0 * smoothstep(lagoon_w, lagoon_w + 18.0, t)
    sea = sea - CLIFFS["deep"] * m_cliff * (1.0 - smoothstep(0.0, 26.0, np.maximum(-s_cliff, 0.0)))

    # The land: a beach rising from the waterline, then soft hills, higher toward the north.
    b = np.clip(s / np.maximum(beach_w, 1.0), 0.0, 1.0)
    beach = WATER + 0.8 * (1.0 - (1.0 - b) ** 2)
    u = np.maximum(s - beach_w, 0.0)
    north = smoothstep(-52.0, -140.0, z)
    hills = (8.0 + 4.0 * north) * smoothstep(0.0, 80.0, u) * (0.55 + 0.45 * (0.5 + 0.5 * noise(x, z, 75.0, 1.0)))
    hills += 1.1 * noise(x, z, 27.0, 3.0) * smoothstep(0.0, 31.0, u)
    # The ground rises round the foot of each tall pillar, so the jungle on the slope hides it, as
    # in the shot; not into the village's clearing or the fields.
    vx, vz = VILLAGE["centre"]
    clear = smoothstep(VILLAGE["radius"] + 4.0, VILLAGE["radius"] + 16.0, np.hypot(x - vx, z - vz))
    clear = clear * (1.0 - box_mask(x, z, FIELDS["centre"], FIELDS["half"], FIELDS["feather"] + 12.0))
    for (tx, tz), (rx, rz), _, _, _, _ in TOWERS:
        d = np.hypot(x - tx, z - tz) - 0.5 * (rx + rz)
        hills = hills + TALUS["height"] * (1.0 - smoothstep(0.0, TALUS["spread"], d)) * clear
    land = beach + hills
    # The sea cliffs: the land rises sheer out of the water to a grassy top a couple of metres in,
    # behind the face the cliffs' rock is built over, then eases down into the jungle inland.
    plateau = cliff_top + 0.5 * noise(x, z, 9.0, 26.0) * smoothstep(3.0, 9.0, s_cliff)
    cliff_land = WATER + (plateau - WATER) * smoothstep(1.3, 2.4, s_cliff)
    hold = 1.0 - smoothstep(CLIFFS["depth"], CLIFFS["depth"] + CLIFFS["ease"], s_cliff)
    land = land + (cliff_land - land) * m_cliff * hold
    h = np.where(s >= 0.0, land, sea)

    # The festival's ground is level; so is the village's clearing; the fields are flat.
    inland = smoothstep(0.0, 6.0, s)
    m_plaza = box_mask(x, z, PLAZA["centre"], PLAZA["half"], PLAZA["feather"]) * inland
    m_street = box_mask(x, z, STREET["centre"], STREET["half"], STREET["feather"]) * inland
    m_village = (1.0 - smoothstep(VILLAGE["radius"], VILLAGE["radius"] + VILLAGE["feather"], np.hypot(x - vx, z - vz)))
    if not natural:
        h = h + (FESTIVAL["level"] - h) * festival_level(x, z) * inland
        h_village = float(land_height(np.array([vx]), np.array([vz]))[0])
        level = 1.0 - smoothstep(VILLAGE["radius"], VILLAGE["radius"] + VILLAGE["slope"], np.hypot(x - vx, z - vz))
        h = h + (h_village + 0.04 * noise(x, z, 9.0, 4.0) - h) * level
    m_fields = box_mask(x, z, FIELDS["centre"], FIELDS["half"], FIELDS["feather"]) * inland
    h = h + (FIELDS["height"] - h) * m_fields

    # Paths are worn a little into the ground.
    d_path = np.full_like(x, 1e9)
    path_w = np.zeros_like(x)
    for points, width in PATHS:
        d = polyline_distance(x, z, points)
        closer = d < d_path
        d_path = np.where(closer, d, d_path)
        path_w = np.where(closer, width, path_w)
    m_path = (1.0 - smoothstep(path_w * 0.35, path_w * 0.5 + 0.6, d_path)) * inland

    # The cave's skylight: the ground round it is level with its lip, in a hollow; well inside the
    # ring of rock round the opening (which karst.sinkhole builds) it falls away to the cave's floor.
    if not natural:
        sky = SKYLIGHT
        r = np.hypot(x - sky["centre"][0], z - sky["centre"][1])
        lip = sky["radius"] + sky["width"]
        h = h + (sky["rim"] - h) * (1.0 - smoothstep(lip, lip + sky["slope"], r))
        h = h + (sky["floor"] - h) * (1.0 - smoothstep(sky["radius"] + sky["bell"] + 0.8, lip - 1.0, r))

    # The waterfall's pool: a round basin at the mesa's foot, in a bank high enough to hold its
    # water, which eases into the land round it.
    m_pool = np.zeros_like(x)
    m_bank = np.zeros_like(x)
    if not natural:
        r = np.hypot(x - POOL["centre"][0], z - POOL["centre"][1])
        m_bank = 1.0 - smoothstep(POOL["clearing"], POOL["clearing"] + POOL["feather"], r)
        h = h + (np.maximum(h, POOL["bank"] + 0.05 * noise(x, z, 4.0, 24.0)) - h) * m_bank
        m_pool = 1.0 - smoothstep(POOL["radius"] - 2.5, POOL["radius"] + 0.6, r)
        h = h + (POOL["floor"] - h) * m_pool

    masks = {"s": s, "beach_w": beach_w, "village": m_village, "plaza": m_plaza, "street": m_street,
             "festival": np.maximum(m_plaza, m_street), "fields": m_fields, "path": m_path, "pool": m_pool,
             "bank": m_bank, "cliff": m_cliff, "s_cliff": s_cliff, "phi": phi}
    return h, masks


# ---------------------------------------------------------------------------- painting
def paint(x, z, h, masks, normal_y, shade):
    """The ground's colours: sand, wet sand, grass with clover and dark patches, packed-earth
    paths and village plaza, field rows, rock. Soft painted edges, as the film's backgrounds."""
    shape = x.shape + (3,)
    c = lambda name: np.broadcast_to(COLOURS[name], shape)  # noqa: E731
    s = masks["s"]
    blob = noise(x, z, 9.0, 11.0)
    col = c("sand") * (1.0 - 0.55 * smoothstep(0.35, 1.1, blob))[..., None] \
        + c("sandPatch") * (0.55 * smoothstep(0.35, 1.1, blob))[..., None]
    col = mix(col, c("wetSand"), smoothstep(1.8, 0.4, s) * (s > -0.5))
    col = mix(col, c("seaFloor"), smoothstep(-0.2, -2.0, s))

    # Grass beyond the beach, with a hand-painted wavy edge.
    edge = masks["beach_w"] + 1.5 + 2.0 * noise(x, z, 6.0, 12.0)
    m_grass = smoothstep(edge - 0.8, edge + 0.8, s)
    grass = mix(c("grass"), c("grassDark"), smoothstep(0.2, 0.9, noise(x, z, 14.0, 13.0)))
    grass = mix(grass, c("clover"), smoothstep(0.45, 0.95, noise(x, z, 11.0, 14.0)))
    col = mix(col, grass, m_grass)

    # The festival's plaza and street: sand, then packed sand; the village's clearing and the paths:
    # packed earth, with clover creeping in round the clearing's edge.
    col = mix(col, c("sand"), smoothstep(0.45, 0.8, masks["plaza"]))
    col = mix(col, c("plaza"), smoothstep(0.45, 0.8, masks["street"]))
    patches = smoothstep(-0.15, 0.3, noise(x, z, 6.0, 21.0) + 0.8 * smoothstep(0.98, 0.55, masks["village"]))
    earth = mix(c("earth"), mix(c("grass"), c("clover"), smoothstep(0.3, 0.9, noise(x, z, 3.0, 22.0))), patches)
    col = mix(col, earth, smoothstep(0.3, 0.75, masks["village"]))
    col = mix(col, c("path"), masks["path"])

    # Fields: rows of crops on dark soil.
    rows = 0.5 + 0.5 * np.cos((x - FIELDS["centre"][0]) * (2.0 * math.pi / FIELD_ROW))
    field = mix(c("soil"), c("crop"), smoothstep(0.45, 0.65, rows))
    col = mix(col, field, smoothstep(0.6, 0.9, masks["fields"]))

    # The waterfall pool's bank: dark earth and moss down to the water, as in the film's frame.
    bank = mix(c("bankEarth"), c("bankMoss"), smoothstep(-0.25, 0.45, noise(x, z, 2.2, 23.0)))
    bank = mix(bank, c("grassDark"), smoothstep(POOL["level"] + 1.2, POOL["level"] + 2.6, h) * 0.6)
    near = 1.0 - smoothstep(POOL["radius"] + 3.5, POOL["clearing"] + 1.0,
                            np.hypot(x - POOL["centre"][0], z - POOL["centre"][1]) + 1.5 * noise(x, z, 3.0, 25.0))
    col = mix(col, bank, near * smoothstep(0.2, 0.7, masks["bank"]))

    # Shade under the jungle's trees: darker grass, with the clover gone.
    if "shade" in masks:
        col = mix(col, c("grassDark") * 0.82, 0.75 * masks["shade"] * m_grass)

    # Fallen limestone round the rocks' feet, and bare rock on any steep slope.
    above = h > WATER + 0.1
    rubble = mix(c("rubble"), c("rubbleDark"), smoothstep(0.1, 0.8, noise(x, z, 3.0, 16.0)))
    col = mix(col, rubble, smoothstep(0.0, 0.5, masks["rubble"]) * above)
    rock = mix(c("rock"), c("rockDark"), smoothstep(0.1, 0.8, noise(x, z, 4.0, 15.0)))
    col = mix(col, rock, smoothstep(0.8, 0.62, normal_y) * (s > -1.0) * above)

    return np.clip(col * shade[..., None], 0.0, 1.0)


def mix(a, b, t):
    t = np.asarray(t, dtype=np.float64)
    return a + (b - a) * t[..., None]


def hillshade(h, step):
    """Soft light from the south-west, high in the sky: shape for hills without busy shading."""
    gz, gx = np.gradient(h, step)
    n = np.stack([-gx, np.ones_like(h), -gz], axis=-1)
    n /= np.linalg.norm(n, axis=-1, keepdims=True)
    light = np.array([-0.45, 0.8, 0.4])
    light /= np.linalg.norm(light)
    lit = np.clip(n @ light, 0.0, 1.0)
    return 0.86 + 0.2 * lit, n[..., 1]


# ---------------------------------------------------------------------------- output
def grid(n, size):
    """n x n sample positions over the map (game x, z), row by row from the north-west corner."""
    xs = CENTRE[0] - size / 2 + np.arange(n) * (size / (n - 1))
    zs = CENTRE[1] - size / 2 + np.arange(n) * (size / (n - 1))
    return np.meshgrid(xs, zs)


def write_png(path, rgb):
    """8-bit RGB PNG, without needing an imaging library."""
    img = (np.clip(rgb, 0.0, 1.0) * 255.0 + 0.5).astype(np.uint8)
    hgt, wid = img.shape[:2]
    raw = b"".join(b"\x00" + img[y].tobytes() for y in range(hgt))

    def chunk(tag, data):
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)

    png = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", wid, hgt, 8, 2, 0, 0, 0))
    png += chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b"")
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "wb") as f:
        f.write(png)


def build_mesh(collection):
    """The ground as one mesh: a 1 m grid, simplified to the triangle budget, mapped from above."""
    n = int(SIZE / STEP) + 1
    gx, gz = grid(n, SIZE)
    h, _ = ground(gx, gz)
    bm = bmesh.new()
    verts = [bm.verts.new((float(gx[j, i]), float(-gz[j, i]), float(h[j, i]))) for j in range(n) for i in range(n)]
    for j in range(n - 1):
        for i in range(n - 1):
            a, b = j * n + i, j * n + i + 1
            c, d = (j + 1) * n + i + 1, (j + 1) * n + i
            bm.faces.new((verts[a], verts[d], verts[c], verts[b]))
    tris = 2 * (n - 1) ** 2
    # Ground right at the water's edge, the sea's or the pool's, keeps its detail, so the pen's
    # waterline runs smooth.
    near_sea = 1.0 - smoothstep(0.1, 0.35, np.abs(h - WATER))
    pool_r = np.hypot(gx - POOL["centre"][0], gz - POOL["centre"][1])
    near_pool = (1.0 - smoothstep(0.1, 0.35, np.abs(h - POOL["level"]))) * (pool_r < POOL["radius"] + 4.0)
    keep = np.maximum(near_sea, near_pool).ravel().tolist()
    simplified = L.decimate_bm(bm, TRIANGLES / tris, symmetric=False, keep=keep)
    bm.free()
    bmesh.ops.triangulate(simplified, faces=simplified.faces[:])
    # Every face looks up at the sky. (Recalculating them as for a closed shape would turn whole
    # flat stretches upside down on an open surface like this.)
    simplified.normal_update()
    for f in simplified.faces:
        if f.normal.z < 0.0:
            f.normal_flip()
    mesh = bpy.data.meshes.new("terrain")
    simplified.to_mesh(mesh)
    simplified.free()
    mesh.shade_smooth()  # shared normals let the export share vertices too
    # Map the colour texture straight down: u east, v south, over the whole square.
    x0, z0 = CENTRE[0] - SIZE / 2, CENTRE[1] - SIZE / 2
    uv = mesh.uv_layers.new(name="UVMap")
    flat = []
    for poly in mesh.polygons:
        for li in poly.loop_indices:
            co = mesh.vertices[mesh.loops[li].vertex_index].co
            flat.extend(((co.x - x0) / SIZE, 1.0 - (-co.y - z0) / SIZE))
    uv.data.foreach_set("uv", flat)
    obj = bpy.data.objects.new("terrain", mesh)
    collection.objects.link(obj)
    return obj


def sample_heights(obj, n):
    """The finished ground's height under each point of an n x n grid, by casting rays down."""
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bvh = BVHTree.FromBMesh(bm)
    gx, gz = grid(n, SIZE)
    out = np.zeros((n, n))
    for j in range(n):
        for i in range(n):
            hit, _, _, _ = bvh.ray_cast(Vector((float(gx[j, i]), float(-gz[j, i]), 500.0)), Vector((0, 0, -1)))
            out[j, i] = hit.z if hit is not None else WATER - 20.0
    bm.free()
    return out


def preview(rgb, outlines):
    """The colour map with the village, fields and every rock's foot outlined, for checking."""
    img = rgb.copy()
    n = img.shape[0]
    px = lambda x: int(round((x - (CENTRE[0] - SIZE / 2)) / SIZE * (n - 1)))  # noqa: E731
    pz = lambda z: int(round((z - (CENTRE[1] - SIZE / 2)) / SIZE * (n - 1)))  # noqa: E731
    mark = np.array([0.4, 0.26, 0.18])
    for c, half in ((PLAZA["centre"], PLAZA["half"]), (STREET["centre"], STREET["half"]),
                    (FIELDS["centre"], FIELDS["half"])):
        x0, x1 = px(c[0] - half[0]), px(c[0] + half[0])
        z0, z1 = pz(c[1] - half[1]), pz(c[1] + half[1])
        img[z0:z1 + 1, [x0, x1]] = mark
        img[[z0, z1], x0:x1 + 1] = mark
    for rock, reach in outlines:
        for a in np.linspace(0.0, 2.0 * math.pi, 400, endpoint=False):
            r = outline_radius(reach, a)
            X, Z = px(rock.cx + r * math.cos(a)), pz(rock.cz + r * math.sin(a))
            img[Z - 1:Z + 2, X - 1:X + 2] = mark
    for _, x, z, _ in layout_props():
        img[pz(z) - 2:pz(z) + 3, px(x) - 2:px(x) + 3] = np.array([0.85, 0.3, 0.1])
    o = (px(0.0), pz(0.0))  # the origin: where the cast stands
    img[o[1] - 3:o[1] + 4, o[0] - 3:o[0] + 4] = np.array([0.9, 0.2, 0.2])
    write_png(OUT_PREVIEW, img)


# ---------------------------------------------------------------------------- landmarks
def ground_height(x, z):
    return ground(np.asarray(x, dtype=float), np.asarray(z, dtype=float))[0]


def rock_specs():
    """Every rock to build, as karst.py specs. A spec with `stand` stands on top of another rock
    (its foot at that height), and one with `mound` or `hang` shapes its crown."""
    specs = []

    def group(x):
        return "west" if x < -40 else "east" if x > 40 else "middle"

    for centre, radii, turn, top, seed, tips in TOWERS:
        rng = np.random.default_rng(seed + 500)
        specs.append({
            "centre": centre, "radii": radii, "turn": turn, "top": top, "seed": seed, "segments": 32,
            "step": 3.0, "facets": int(rng.integers(5, 8)), "facet_w": 0.95, "flutes": int(rng.integers(8, 12)),
            "lumps": 0.07, "taper": rng.uniform(0.0, 0.1), "bulge": rng.uniform(0.02, 0.07),
            "ledges": int(rng.integers(0, 2)), "lean": rng.uniform(0.01, 0.04), "rim": 0.12, "group": group(centre[0]),
        })
        # The white tips: short spires rising out of the top, through its jungle.
        for k, (dx, dz, r, above) in enumerate(tips):
            specs.append({
                "centre": (centre[0] + dx, centre[1] + dz), "radii": (r, r * 0.85), "turn": rng.uniform(0.0, math.pi),
                "top": top + above, "stand": top - 3.0, "seed": seed * 10 + k, "segments": 12, "step": 1.5,
                "facets": 4, "facet_w": 0.6, "flutes": 4, "lumps": 0.12, "taper": 0.3, "bulge": 0.0, "shoulder": 0.4,
                "tip": 0.85, "crown": False, "moss": False, "group": group(centre[0]),
            })
    for centre, radii, turn, top, seed, mound in MESAS:
        rng = np.random.default_rng(seed + 500)
        spec = {
            "centre": centre, "radii": radii, "turn": turn, "top": top, "seed": seed, "segments": 32,
            "step": 2.5, "facets": int(rng.integers(5, 8)), "flutes": int(rng.integers(7, 10)), "lumps": 0.09,
            "taper": rng.uniform(0.04, 0.12), "bulge": rng.uniform(0.0, 0.05), "ledges": 1, "shoulder": 0.16,
            "rim": 0.1, "drape": 3.2, "mound": mound, "hang": 0.75, "group": group(centre[0]),
        }
        if centre == FALL["rock"]:
            # The waterfall's wall of rock: finer rings round its notch, its foot dark where the
            # pool laps.
            spec.update(centre=FALL["centre"], radii=FALL["radii"], turn=FALL["turn"], top=FALL["top"],
                        notch=FALL["notch"], wet=POOL["level"], segments=64, step=1.2, stone="mossy", drape=4.2)
        specs.append(spec)
    for centre, r, top, seed in NEEDLES:
        specs.append({
            "centre": centre, "radii": (r, r * 0.85), "turn": 0.4, "top": top, "seed": seed, "segments": 14,
            "step": 1.5, "facets": 5, "facet_w": 0.7, "flutes": 5, "lumps": 0.1, "taper": 0.4, "bulge": 0.0,
            "shoulder": 0.35, "tip": 0.85, "crown": False, "moss": False, "group": group(centre[0]),
        })
    specs.extend(dict(r, group="headland") for r in HEADLAND_ROCKS)
    # The sea stack off the cliffs' headland and the smaller rock beside it: bedded sandstone like the
    # cliffs, stepping in as it rises, bare of plants.
    for k, (centre, radii, turn, height, seed) in enumerate(STACKS):
        big = k == 0
        specs.append({
            "centre": centre, "radii": radii, "turn": turn, "top": WATER + height, "seed": seed, "segments": 24,
            "step": 0.7, "facets": 5, "facet_w": 0.85, "flutes": 4, "flute_depth": 0.05, "lumps": 0.12,
            "taper": 0.38 if big else 0.25, "bulge": 0.0, "lean": 0.07, "ledges": 2 if big else 0, "shoulder": 0.22,
            "tip": 0.5, "rim": 0.22, "strata": 0.9, "stone": "sandstone", "crown": False, "moss": False, "wet": WATER,
            "group": "cliffs",
        })
    # Mossy rocks on the waterfall pool's banks: a leaning slab and a squat stump.
    px, pz = POOL["centre"]
    for k, (dx, dz, radii, turn, height, seed) in enumerate(POOL_ROCKS):
        slab = k == 0
        specs.append({
            "centre": (px + dx, pz + dz), "radii": radii, "turn": turn, "height": height, "seed": seed,
            "segments": 14, "step": 0.4, "facets": 5 if slab else 6, "facet_w": 0.9 if slab else 0.7, "flutes": 3,
            "flute_depth": 0.05, "lumps": 0.12, "taper": 0.2, "bulge": 0.0, "lean": 0.25 if slab else 0.05,
            "shoulder": 0.4, "tip": 0.55, "rim": 0.25, "flat": slab, "crown": False, "drape": 4.5, "group": "west",
        })
    for cluster, ((mx, mz), seed, count) in enumerate(SPIRES):
        rng = np.random.default_rng(seed)
        for k in range(count):
            first = k == 0
            a, d = rng.uniform(0.0, 2.0 * math.pi), (0.0 if first else rng.uniform(5.0, 9.0))
            x, z = offshore(mx + d * math.cos(a), mz + d * math.sin(a), 3.0)
            r = rng.uniform(1.3, 3.0) * (1.0 if first else 0.75)
            specs.append({
                "centre": (x, z), "radii": (r, r * rng.uniform(0.75, 0.95)),
                "turn": rng.uniform(0.0, math.pi), "top": WATER + rng.uniform(4.0, 12.0) * (1.0 if first else 0.7),
                "seed": seed * 10 + k, "segments": 14, "step": 1.2, "facets": int(rng.integers(4, 6)), "facet_w": 0.85,
                "flutes": 5, "flute_depth": 0.08, "lumps": 0.1, "taper": 0.45, "bulge": 0.0, "lean": rng.uniform(0.0, 0.08),
                "shoulder": rng.uniform(0.3, 0.5), "tip": rng.uniform(0.75, 0.92), "rim": 0.3, "flat": True,
                "crown": rng.random() < 0.35, "moss": False, "wet": WATER, "group": f"spires{cluster}",
            })
    return specs


def outline_radius(reach, angle):
    """A rock's foot outline (radii at even angles round it) at any angle."""
    n = len(reach)
    f = (angle / (2.0 * math.pi) * n) % n
    i = int(f)
    return reach[i] + (reach[(i + 1) % n] - reach[i]) * (f - i)


def rubble(x, z, outlines):
    """1 against a rock's foot, easing raggedly to 0 a couple of metres out: fallen stone."""
    out = np.zeros_like(x)
    for rock, reach in outlines:
        dx, dz = x - rock.cx, z - rock.cz
        d = np.hypot(dx, dz)
        near = d < max(reach) + 4.0
        if not near.any():
            continue
        n = len(reach)
        f = (np.arctan2(dz[near], dx[near]) / (2.0 * math.pi) * n) % n
        i = np.floor(f).astype(int)
        r_arr = np.array(reach)
        r = r_arr[i % n] + (r_arr[(i + 1) % n] - r_arr[i % n]) * (f - i)
        width = 2.2 + 1.2 * noise(x[near], z[near], 2.5, 17.0)
        out[near] = np.maximum(out[near], 1.0 - smoothstep(0.0, width, d[near] - r))
    return out


def join_painted(name, pieces, collection):
    """Join (bmesh, colours, smooth) pieces, a colour for every vertex, into one object, each
    piece shaded smooth or with flat faces."""
    combined = bmesh.new()
    flat = []
    smooth = []
    for bm, cols, soft in pieces:
        smooth.extend([soft] * len(bm.faces))
        L.append_bm(combined, bm)
        for c in cols:
            flat.extend((float(c[0]), float(c[1]), float(c[2]), 1.0))
        bm.free()
    mesh = bpy.data.meshes.new(name)
    combined.to_mesh(mesh)
    combined.free()
    assert len(flat) == 4 * len(mesh.vertices), (len(flat) // 4, len(mesh.vertices))
    col = mesh.color_attributes.new("Col", "FLOAT_COLOR", "POINT")
    col.data.foreach_set("color", flat)
    mesh.color_attributes.active_color = col
    try:
        mesh.color_attributes.render_color_index = mesh.color_attributes.active_color_index
    except AttributeError:
        pass
    mesh.polygons.foreach_set("use_smooth", smooth)
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)
    return obj


def object_with_uv(name, bm, uvs, collection):
    """An object from a bmesh with one UV per vertex."""
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
    mesh.shade_smooth()
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)
    return obj


def build_landmarks(collection):
    """Every rock with its jungle crown, joined into one mesh for each group of rocks (so the game
    can leave out a group it is not looking at), the cave's skylight, and the waterfall with its
    spray. Returns the objects, each rock's foot outline (not the tips standing on top of others),
    the skylight's edge and where the waterfall lands in its pool."""
    groups, outlines = {}, []
    for spec in rock_specs():
        stand = spec.get("stand")
        ground = ground_height if stand is None else (lambda x, z, y=stand: np.full_like(np.asarray(x, dtype=float), y))
        rock = K.Rock(spec, ground)
        bm, cols, rim = rock.build()
        pieces = groups.setdefault(spec["group"], [])
        pieces.append((bm, cols, not rock.s["flat"]))
        if rock.s["crown"]:
            small = rock.rx < 4.0
            gap = rock.s["notch"][:2] if rock.s["notch"] else None
            mound = spec.get("mound", 1.0)
            pieces.append((*K.crown(rock, rim, gap=gap, size=1.1 if small else None,
                                    target=110 if small else int(450 * mound), mound=mound,
                                    hang=spec.get("hang", 0.35)), True))
        if stand is None:
            outlines.append((rock, rock.outline()))
    # The cave's skylight in the middle of the ring of pillars. Its side drops sheer toward a rock
    # standing close enough to break into the cave where it flares out.
    sky = SKYLIGHT
    sx, sz = sky["centre"]
    gap, near = min(((math.hypot(r.cx - sx, r.cz - sz) - outline_radius(o, math.atan2(sz - r.cz, sx - r.cx)), r)
                     for r, o in outlines), key=lambda t: t[0])
    sheer = math.atan2(near.cz - sz, near.cx - sx) if gap < sky["radius"] * 1.05 + sky["bell"] + 1.5 else None
    bm, cols, edge = K.sinkhole(sky["centre"], sky["radius"], sky["rim"], WATER, sky["floor"], sky["seed"],
                                sky["bell"], sky["width"], sheer=sheer)
    groups.setdefault("middle", []).append((bm, cols, True))
    # The waterfall's mesa: vines hanging down its face either side of the water, the water itself
    # and the spray where it lands in the pool.
    wall = next(r for r, _ in outlines if r.s["notch"])
    an, half, _ = wall.s["notch"]
    bm, cols = K.vines(wall, (an, 17.0), FALL["vines"], FALL["seed"], avoid=(an, half))
    groups[wall.s["group"]].append((bm, cols, True))
    # The sea cliffs along the north-east coast.
    pts, normals, tops = cliff_line()
    bm, cols = K.cliff(pts, normals, tops, WATER, CLIFFS["seed"], base=WATER - CLIFFS["deep"] - 1.0)
    groups.setdefault("cliffs", []).append((bm, cols, True))
    rocks = [join_painted(f"rocks_{name}", pieces, collection) for name, pieces in groups.items()]
    bm, uvs, foot = K.waterfall(wall, POOL["level"])
    fall = object_with_uv("waterfall", bm, uvs, collection)
    spray = join_painted("spray", [(*K.spray(POOL["level"]), True)], collection)
    spray.location = (foot[0], -foot[1], POOL["level"])
    return [*rocks, fall, spray], outlines, edge, foot


# ---------------------------------------------------------------------------- plants
def plant_ground(outlines, props):
    """Where plants may grow, on a 1 m grid over the map: the ground's height, how far past the
    beach each point is, how far it is from paths, rocks, props and the skylight's edge, and how
    steep."""
    n = int(SIZE) + 1
    gx, gz = grid(n, SIZE)
    h, masks = ground(gx, gz)
    d_path = np.full_like(gx, 1e9)
    for points, width in PATHS:
        d_path = np.minimum(d_path, polyline_distance(gx, gz, points) - width / 2)
    d_rock = np.full_like(gx, 1e9)
    for rock, reach in outlines:
        dx, dz = gx - rock.cx, gz - rock.cz
        d = np.hypot(dx, dz)
        near = d < max(reach) + 10.0
        k = len(reach)
        f = (np.arctan2(dz[near], dx[near]) / (2.0 * math.pi) * k) % k
        i = np.floor(f).astype(int)
        r = np.array(reach)
        edge = r[i % k] + (r[(i + 1) % k] - r[i % k]) * (f - i)
        d_rock[near] = np.minimum(d_rock[near], d[near] - edge)
    d_prop = np.full_like(gx, 1e9)
    for kind, x, z, _ in props:
        d_prop = np.minimum(d_prop, np.hypot(gx - x, gz - z) - PROP_ROOM.get(kind, 1.2))
    gzr, gxr = np.gradient(h, 1.0)
    return {
        "x": gx, "z": gz, "h": h, "inland": masks["s"] - masks["beach_w"], "village": masks["village"],
        "festival": masks["festival"], "fields": masks["fields"], "path": d_path, "rock": d_rock, "prop": d_prop,
        "skylight": np.hypot(gx - SKYLIGHT["centre"][0], gz - SKYLIGHT["centre"][1]) - SKYLIGHT["radius"],
        "pool": np.hypot(gx - POOL["centre"][0], gz - POOL["centre"][1]) - POOL["radius"],
        "pool_side": angle_diff(np.arctan2(gz - POOL["centre"][1], gx - POOL["centre"][0]), math.pi / 2),
        # The sea cliffs' grassy top near their edge, and their headland, all grass.
        "cliff_top": (masks["cliff"] > 0.25) & (masks["s_cliff"] > 0.0) & (masks["s_cliff"] < 15.0),
        "headland": (masks["cliff"] > 0.25) & (masks["s_cliff"] > 0.0) & (masks["s_cliff"] < 22.0)
                    & (np.abs(np.degrees(angle_diff(masks["phi"], math.radians(CLIFFS["headland"])))) < 6.0),
        "cliff_in": masks["s_cliff"],
        "slope": np.hypot(gxr, gzr),
    }


class Spacing:
    """Points kept apart: a coarse hash of the ones taken so far."""

    def __init__(self, cell):
        self.cell, self.cells = cell, {}

    def free(self, x, z, gap):
        c = self.cell
        reach = int(math.ceil(gap / c))
        ci, cj = int(math.floor(x / c)), int(math.floor(z / c))
        for i in range(ci - reach, ci + reach + 1):
            for j in range(cj - reach, cj + reach + 1):
                for px, pz in self.cells.get((i, j), ()):
                    if (px - x) ** 2 + (pz - z) ** 2 < gap * gap:
                        return False
        return True

    def take(self, x, z):
        self.cells.setdefault((int(math.floor(x / self.cell)), int(math.floor(z / self.cell))), []).append((x, z))


def scatter(rng, G, ok, gap, taken=None, stride=2, limit=None):
    """Points where `ok` holds on the plant grid, in random order, each at least gap (a number, or an
    array over the grid) from the others and from those in `taken`."""
    taken = taken or Spacing(4.0)
    cells = np.argwhere(ok[::stride, ::stride]) * stride
    rng.shuffle(cells)
    out = []
    for j, i in cells:
        x = float(G["x"][j, i]) + rng.uniform(-0.5, 0.5) * stride
        z = float(G["z"][j, i]) + rng.uniform(-0.5, 0.5) * stride
        g = float(gap if np.isscalar(gap) else gap[j, i])
        if taken.free(x, z, g):
            taken.take(x, z)
            out.append((x, z))
            if limit and len(out) >= limit:
                break
    return out


def grid_at(G, name, x, z):
    """A plant-grid value at the nearest sample to (x, z)."""
    n = G["x"].shape[0]
    i = min(max(int(round(x - G["x"][0, 0])), 0), n - 1)
    j = min(max(int(round(z - G["z"][0, 0])), 0), n - 1)
    return float(G[name][j, i])


def build_plants(collection, outlines):
    """The jungle: a dense canopy of tree clumps, palms among them and along the beaches, big trees
    with buttress roots and vines here and there, and under them all a thick understory of ferns,
    cycads, ti plants, bromeliads, monstera and flowering bushes. Then crops in the fields, flowers
    round the village's huts, and butterflies. The canopy and palms come near and far, each a mesh
    per patch of the map; the understory near only. Returns the objects, each trunk (x, z, radius),
    each crown (x, y, z, radius) and each butterfly's bush (x, y, z), in game coordinates."""
    rng = np.random.default_rng(17)
    props = layout_props()
    G = plant_ground(outlines, props)
    x0, z0 = CENTRE[0] - SIZE / 2, CENTRE[1] - SIZE / 2
    canopy = PL.Patchwork(x0, z0, SIZE, CANOPY_PATCHES)
    canopy_far = PL.Patchwork(x0, z0, SIZE, CANOPY_PATCHES)
    trunks, crowns = [], []
    stems = Spacing(4.0)
    variants = PL.Variants()

    def at(x, z):
        return float(ground_height(np.array([x]), np.array([z]))[0])

    clearing = noise(G["x"], G["z"], 32.0, 31.0) > JUNGLE["clearings"]
    # Trees stand back from the skylight, so it shows through the canopy from above as in the shot,
    # and from the waterfall's pool, so it lies open to the sky.
    pool_room = POOL["clearing"] - POOL["radius"] - 1.0
    # No trees on the sea cliffs' top near the edge or on their headland: grass and shrubs, as in
    # the film's frame.
    treeless = G["cliff_top"] | G["headland"]
    G["treeless"] = treeless.astype(float)
    open_ground =((G["village"] < 0.02) & (G["festival"] < 0.02) & (G["fields"] < 0.02)
                   & (G["skylight"] > SKYLIGHT["width"] + 12.5) & (G["pool"] > pool_room) & ~treeless)
    jungle = ((G["inland"] > 3.0) & open_ground & (G["path"] > 2.2) & (G["rock"] > 2.0) & (G["prop"] > 0.0)
              & (G["slope"] < 0.7))

    # A few big trees deep in the jungle, with buttress roots and hanging vines.
    deep = jungle & (G["inland"] > 22.0) & (G["path"] > 5.0)
    for x, z in scatter(rng, G, deep, JUNGLE["big_spacing"], taken=stems, limit=JUNGLE["big_trees"]):
        y = at(x, z)
        built, tops = PL.big_tree(rng, lambda dx, dy, x=x, z=z, y=y: at(x + dx, z - dy) - y)
        canopy.add(PL.to_arrays(built), x, z, y)
        far = L.fuse([L.ellipsoid_bm(Vector((cx, cy, cz)), (r, r, r * 0.8), u=8, v=5) for cx, cy, cz, r in tops],
                     voxel=0.7, smooth_iterations=3, smooth_lambda=0.8, target_tris=40)
        far_cols = PL.leafy(far, 0.0, 0.0, PL.C["canopyLight"], PL.C["canopy"], PL.C["canopyDark"])
        canopy_far.add(PL.to_arrays((far, far_cols, [0.4] * len(far_cols))), x, z, y)
        trunks.append([round(x, 2), round(z, 2), 1.9])
        for lx, ly, lz, r in tops:
            crowns.append([round(x + lx, 2), round(y + lz, 2), round(z - ly, 2), round(r, 2)])
    # And one on the waterfall pool's east bank, as in the film's frame.
    x, z = POOL["centre"][0] + POOL_TREE[0], POOL["centre"][1] + POOL_TREE[1]
    y = at(x, z)
    built, tops = PL.big_tree(rng, lambda dx, dy, x=x, z=z, y=y: at(x + dx, z - dy) - y)
    canopy.add(PL.to_arrays(built), x, z, y)
    far = L.fuse([L.ellipsoid_bm(Vector((cx, cy, cz)), (r, r, r * 0.8), u=8, v=5) for cx, cy, cz, r in tops],
                 voxel=0.7, smooth_iterations=3, smooth_lambda=0.8, target_tris=40)
    far_cols = PL.leafy(far, 0.0, 0.0, PL.C["canopyLight"], PL.C["canopy"], PL.C["canopyDark"])
    canopy_far.add(PL.to_arrays((far, far_cols, [0.4] * len(far_cols))), x, z, y)
    stems.take(x, z)
    trunks.append([round(x, 2), round(z, 2), 1.9])
    for lx, ly, lz, r in tops:
        crowns.append([round(x + lx, 2), round(y + lz, 2), round(z - ly, 2), round(r, 2)])

    # Palms: thick along the jungle's edge by the beaches, and scattered among the trees.
    palms = []
    for k in range(8):
        near, far = PL.jungle_palm(rng, rng.uniform(6.5, 9.0))
        palms.append((variants.shape(f"palm{k}", PL.to_arrays(near)), variants.shape(f"palmfar{k}", PL.to_arrays(far))))
    palm_ok = ((G["inland"] > -4.0) & open_ground & (G["path"] > 1.5) & (G["rock"] > 1.8) & (G["prop"] > 0.0)
               & (G["slope"] < 0.65) & (G["h"] > WATER + 0.45))
    edge = G["inland"] < 16.0
    gap = np.where(edge, JUNGLE["palm_spacing"], JUNGLE["palm_spacing"] * 1.25)
    for x, z in scatter(rng, G, palm_ok, gap, taken=stems, limit=JUNGLE["palms"]):
        near, far = palms[int(rng.integers(0, len(palms)))]
        variants.plant("palms", near, x, at(x, z) - 0.05, z, rng.uniform(0, 2 * math.pi), rng.uniform(0.9, 1.25), far)
        trunks.append([round(x, 2), round(z, 2), 0.3])

    # The canopy: clumps of trees whose crowns run together, opening into a few clearings.
    for cx, cz in scatter(rng, G, jungle & ~clearing, JUNGLE["clump_spacing"]):
        trees = []
        for _ in range(40):
            if len(trees) >= int(rng.integers(*JUNGLE["trees"])) + 1:
                break
            a, d = rng.uniform(0, 2 * math.pi), (0.0 if not trees else rng.uniform(3.0, 6.0))
            tx, tz = cx + d * math.cos(a), cz + d * math.sin(a)
            if grid_at(G, "inland", tx, tz) < 2.5 or grid_at(G, "path", tx, tz) < 1.8 or grid_at(G, "rock", tx, tz) < 1.8 \
                    or grid_at(G, "prop", tx, tz) < 0.0 or grid_at(G, "village", tx, tz) > 0.05 \
                    or grid_at(G, "festival", tx, tz) > 0.05 or grid_at(G, "skylight", tx, tz) < SKYLIGHT["width"] + 12.5 \
                    or grid_at(G, "pool", tx, tz) < pool_room or grid_at(G, "treeless", tx, tz) > 0.5 \
                    or not stems.free(tx, tz, 3.0):
                continue
            stems.take(tx, tz)
            trees.append((tx, tz, rng.uniform(*JUNGLE["tree_height"])))
        if not trees:
            continue
        base = at(cx, cz)
        local = [(tx - cx, -(tz - cz), height, at(tx, tz) - base) for tx, tz, height in trees]
        built, tops, far = PL.clump(rng, local)
        canopy.add(PL.to_arrays(built), cx, cz, base)
        canopy_far.add(PL.to_arrays(far), cx, cz, base)
        for (tx, tz, height) in trees:
            trunks.append([round(tx, 2), round(tz, 2), round(0.32 * height / 8.0 + 0.2, 2)])
        for lx, ly, lz, r in tops:
            crowns.append([round(cx + lx, 2), round(base + lz, 2), round(cz - ly, 2), round(r, 2)])

    # The understory: thick everywhere under the trees, and along the paths and the jungle's edges.
    kinds = {
        "fern": [variants.shape("fern", PL.to_arrays(PL.fern(rng))) for _ in range(6)],
        "monstera": [variants.shape("monstera", PL.to_arrays(PL.monstera(rng))) for _ in range(4)],
        "cycad": [variants.shape("cycad", PL.to_arrays(PL.cycad(rng))) for _ in range(4)],
        "ti": [variants.shape("ti", PL.to_arrays(PL.ti_plant(rng))) for _ in range(4)],
        "brom": [variants.shape("brom", PL.to_arrays(PL.bromeliad(rng))) for _ in range(3)],
        "bush": [variants.shape("bush", PL.to_arrays(PL.bush(rng, colour)))
                 for colour in ("purple", "white", "yellow", "red", "pink", "purple")],
    }
    mix_shade = [("fern", 0.42), ("monstera", 0.18), ("cycad", 0.12), ("ti", 0.12), ("brom", 0.1), ("bush", 0.06)]
    mix_edge = [("bush", 0.3), ("fern", 0.22), ("ti", 0.16), ("cycad", 0.12), ("brom", 0.1), ("monstera", 0.1)]
    near_edge = (G["path"] < 6.0) | (G["inland"] < 9.0) | clearing | (G["village"] > 0.0) | (G["festival"] > 0.0)
    # Round the pool the plants keep to its sides, leaving its south bank open to stand on.
    bank = (G["pool"] < POOL["clearing"] - POOL["radius"] + 0.5) & (np.abs(G["pool_side"]) < 0.8)
    under_ok = ((G["inland"] > 1.0) & (G["village"] < 0.12) & (G["festival"] < 0.12) & (G["fields"] < 0.1)
                & (G["path"] > 0.9) & (G["rock"] > 1.0) & (G["prop"] > -0.6) & (G["skylight"] > SKYLIGHT["width"] + 0.3)
                & (G["pool"] > 1.2) & ~bank & ~G["headland"] & (G["slope"] < 0.85))
    gap = np.where(near_edge, JUNGLE["understory"][0], JUNGLE["understory"][1])
    crown_hash = Spacing(8.0)
    for x, _, z, r in crowns:
        crown_hash.take(x, z)
    count = {k: 0 for k in kinds}
    flowers = []
    for x, z in scatter(rng, G, under_ok, gap, taken=None, stride=2):
        if not stems.free(x, z, 1.0):
            continue
        weights = mix_shade if not crown_hash.free(x, z, 3.0) else mix_edge
        roll, kind = rng.random(), weights[-1][0]
        for name, w in weights:
            if roll < w:
                kind = name
                break
            roll -= w
        y = at(x, z) - 0.04
        variants.plant("under", kinds[kind][int(rng.integers(0, len(kinds[kind])))], x, y, z, rng.uniform(0, 2 * math.pi),
                       rng.uniform(0.85, 1.25))
        count[kind] += 1
        if kind == "bush":
            flowers.append((x, y, z))

    # The waterfall pool's own plants and the bromeliads on its stump (see POOL_PLANTS and POOL_ROCKS).
    px, pz = POOL["centre"]
    for kind, index, dx, dz, scale in POOL_PLANTS:
        x, z = px + dx, pz + dz
        variants.plant("under", kinds[kind][index], x, at(x, z) - 0.04, z, rng.uniform(0, 2 * math.pi), scale)
        if kind == "bush":
            flowers.append((x, at(x, z), z))
    dx, dz, _, _, height, _ = POOL_ROCKS[1]
    for k in range(3):
        a = 2.0 * math.pi * k / 3 + 0.4
        x, z = px + dx + 0.45 * math.cos(a), pz + dz + 0.45 * math.sin(a)
        variants.plant("under", kinds["brom"][k], x, at(px + dx, pz + dz) + height - 0.12, z, rng.uniform(0, 2 * math.pi),
                       rng.uniform(1.0, 1.25))
    # A thicker ring of ferns, monstera and ti plants round the pool's sides, closing in on the water
    # as in the film's frame.
    approach = (G["pool"] < 13.0) & (np.abs(G["pool_side"]) < 0.55)    # the way onto the bank, kept clear
    ring = ((G["pool"] > 1.4) & (G["pool"] < 11.0) & ~bank & ~approach & (G["rock"] > 0.8) & (G["path"] > 0.9)
            & (G["slope"] < 1.3))
    for x, z in scatter(rng, G, ring, 1.7, taken=None, stride=1):
        if not stems.free(x, z, 1.2):
            continue
        kind = ("fern", "fern", "monstera", "monstera", "ti", "brom")[int(rng.integers(0, 6))]
        variants.plant("under", kinds[kind][int(rng.integers(0, len(kinds[kind])))], x, at(x, z) - 0.04, z,
                       rng.uniform(0, 2 * math.pi), rng.uniform(0.9, 1.35))

    # Grass tufts in the village's clearing, thickest toward its edge.
    tufts = [variants.shape("grass", PL.to_arrays(PL.grass(rng))) for _ in range(4)]
    tuft_ok = (G["village"] > 0.05) & (G["path"] > 1.0) & (G["prop"] > 0.5) & (G["slope"] < 0.8)
    tuft_gap = np.where(G["village"] < 0.85, 1.3, 2.6)
    for x, z in scatter(rng, G, tuft_ok, tuft_gap, taken=None, stride=1, limit=260):
        if math.hypot(x - VILLAGE["centre"][0], z - VILLAGE["centre"][1]) < 8.0:
            continue
        variants.plant("under", tufts[int(rng.integers(0, len(tufts)))], x, at(x, z) - 0.02, z,
                       rng.uniform(0, 2 * math.pi), rng.uniform(0.8, 1.3))
    # And here and there over the sea cliffs' headland and along their top; rounded green shrubs
    # line the cliffs' edge, as in the film's frame.
    tuft_top = treeless & (G["slope"] < 0.8) & (G["cliff_in"] > 2.8) & (G["path"] > 1.0)
    for x, z in scatter(rng, G, tuft_top, np.where(G["headland"], 3.0, 2.6), taken=None, stride=1, limit=600):
        variants.plant("under", tufts[int(rng.integers(0, len(tufts)))], x, at(x, z) - 0.02, z,
                       rng.uniform(0, 2 * math.pi), rng.uniform(0.8, 1.3))
    shrubs = [variants.shape("shrub", PL.to_arrays(PL.bush(rng, None))) for _ in range(4)]
    edge_ok = G["cliff_top"] & ~G["headland"] & (G["cliff_in"] > 2.7) & (G["cliff_in"] < 6.5) & (G["slope"] < 0.85)
    for x, z in scatter(rng, G, edge_ok, 1.9, taken=None, stride=1):
        variants.plant("under", shrubs[int(rng.integers(0, len(shrubs)))], x, at(x, z) - 0.06, z,
                       rng.uniform(0, 2 * math.pi), rng.uniform(1.1, 1.8))

    # Crops in the fields, along every other planted row of the painted soil.
    crops = [variants.shape("crop", PL.to_arrays(PL.crop(rng))) for _ in range(6)]
    fx, fz = FIELDS["centre"]
    hx, hz = FIELDS["half"]
    rows = 0
    for k in range(-int(hx / FIELD_ROW), int(hx / FIELD_ROW) + 1, 2):
        x = fx + k * FIELD_ROW
        if abs(x - fx) > hx - 1.0:
            continue
        rows += 1
        for z in np.arange(fz - hz + 1.5, fz + hz - 1.5, 1.4):
            if rng.random() < 0.08:
                continue
            zz = float(z) + rng.uniform(-0.2, 0.2)
            variants.plant("under", crops[int(rng.integers(0, len(crops)))], x, at(x, zz) - 0.02, zz,
                           rng.uniform(0, 2 * math.pi), rng.uniform(0.85, 1.2))

    # Flowering bushes round the backs and sides of the village's huts.
    for kind, hx_, hz_, turn in props:
        room = HUT_ROOM.get(kind)
        if room is None:
            continue
        front = math.radians(turn)
        for _ in range(3):
            a = front + math.radians(rng.uniform(100.0, 260.0))
            d = rng.uniform(*room)
            x, z = hx_ + d * math.sin(a), hz_ + d * math.cos(a)
            if grid_at(G, "path", x, z) < 1.2:
                continue
            y = at(x, z) - 0.04
            shapes = kinds["bush"] if rng.random() < 0.7 else kinds["ti"]
            variants.plant("under", shapes[int(rng.integers(0, len(shapes)))], x, y, z, rng.uniform(0, 2 * math.pi),
                           rng.uniform(0.8, 1.0))
            flowers.append((x, y, z))

    # Blue butterflies flutter round flowering bushes, a few here and there; the nearer to the
    # festival and the village, the likelier.
    rng.shuffle(flowers)
    vx, vz = VILLAGE["centre"]
    flowers.sort(key=lambda p: min(math.hypot(p[0], p[2] + 20.0), math.hypot(p[0] - vx, p[2] - vz)) * rng.uniform(0.6, 1.4))
    homes, spaced = [], Spacing(8.0)
    for x, y, z in flowers:
        if spaced.free(x, z, 14.0):
            spaced.take(x, z)
            homes.append([round(x, 2), round(y, 2), round(z, 2)])
        if len(homes) >= BUTTERFLIES:
            break

    objects = (canopy.objects("canopy", collection) + canopy_far.objects("canopyfar", collection)
               + variants.objects(collection))
    print(f"PLANTS: {len(trunks)} trunks, {len(crowns)} crowns, {rows} crop rows, understory {count}, "
          f"{len(homes)} butterflies, {len(variants.placed.get('palms', []))} palms")
    return objects, trunks, crowns, homes, variants.placed


def canopy_shade(x, z, crowns):
    """1 under the middle of a tree's crown, easing to 0 at its edge: the shade on the ground."""
    out = np.zeros_like(x)
    step = x[0, 1] - x[0, 0]
    x_start, z_start = x[0, 0], z[0, 0]
    n = x.shape[0]
    for cx, _, cz, r in crowns:
        i0 = max(int((cx - r - x_start) / step), 0)
        i1 = min(int((cx + r - x_start) / step) + 2, n)
        j0 = max(int((cz - r - z_start) / step), 0)
        j1 = min(int((cz + r - z_start) / step) + 2, n)
        if i0 >= i1 or j0 >= j1:
            continue
        d = np.hypot(x[j0:j1, i0:i1] - cx, z[j0:j1, i0:i1] - cz)
        out[j0:j1, i0:i1] = np.maximum(out[j0:j1, i0:i1], 1.0 - smoothstep(r * 0.4, r * 0.95, d))
    return out


def export_objects(objects, path):
    """Export several objects into one .glb, each keeping its name and custom attributes."""
    view_layer = bpy.context.view_layer
    view_layer.update()
    for o in bpy.data.objects:
        if o.name in view_layer.objects:
            o.select_set(False)
    for o in objects:
        o.select_set(True)
    view_layer.objects.active = objects[0]
    bpy.ops.export_scene.gltf(
        filepath=path, export_format="GLB", use_selection=True, export_extras=False, export_yup=True,
        export_normals=True, export_texcoords=True, export_vertex_color="ACTIVE", export_materials="NONE",
        export_attributes=True, export_animations=False, export_skins=False, export_morph=False,
        export_cameras=False, export_lights=False, export_apply=False,
    )


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    collection = bpy.data.collections.new("island")
    bpy.context.scene.collection.children.link(collection)
    os.makedirs(OUT_DIR, exist_ok=True)

    obj = build_mesh(collection)
    tris = len(obj.data.polygons)

    # Heights the game walks on, sampled from the finished mesh so feet meet the ground.
    heights = sample_heights(obj, HEIGHT_GRID)
    lo, hi = float(heights.min()), float(heights.max())
    q = np.round((heights - lo) / (hi - lo) * 65535.0).astype("<u2")
    with open(os.path.join(OUT_DIR, "height.bin"), "wb") as f:
        f.write(q.tobytes())

    # The rocks standing on it, and the waterfall.
    landmarks, outlines, edge, foot = build_landmarks(collection)
    export_objects(landmarks, os.path.join(OUT_DIR, "landmarks.glb"))
    rock_tris = sum(len(p.vertices) - 2 for o in landmarks if o.name.startswith("rocks") for p in o.data.polygons)

    # The jungle, the crops and the village's flowers.
    plant_objects, trunks, crowns, butterflies, placed = build_plants(collection, outlines)
    export_objects(plant_objects, os.path.join(OUT_DIR, "plants.glb"))
    plant_tris = sum(len(p.vertices) - 2 for o in plant_objects for p in o.data.polygons)

    # The painted colour map, with soft hill shading from the same heights.
    gx, gz = grid(COLOUR_SIZE, SIZE)
    h, masks = ground(gx, gz)
    masks["rubble"] = rubble(gx, gz, outlines)
    masks["shade"] = canopy_shade(gx, gz, crowns)
    shade, normal_y = hillshade(h, SIZE / (COLOUR_SIZE - 1))
    rgb = paint(gx, gz, h, masks, normal_y, shade)
    # Colours are linear here; the PNG holds sRGB.
    srgb = np.where(rgb <= 0.0031308, rgb * 12.92, 1.055 * np.power(rgb, 1.0 / 2.4) - 0.055)
    write_png(os.path.join(OUT_DIR, "terrain.png"), srgb)
    preview(srgb, outlines)

    info = {
        "version": 1,
        "size": SIZE,
        "origin": [CENTRE[0] - SIZE / 2, CENTRE[1] - SIZE / 2],
        "water": WATER,
        "height": {"url": "models/island/height.bin", "grid": HEIGHT_GRID, "min": round(lo, 4), "max": round(hi, 4)},
        "colours": "models/island/terrain.png",
        "skylight": {"centre": list(SKYLIGHT["centre"]), "edge": edge, "lip": SKYLIGHT["radius"] + SKYLIGHT["width"],
                     "top": round(SKYLIGHT["rim"] + K.SINKHOLE_LIP, 3)},
        "landmarks": "models/island/landmarks.glb",
        "rocks": [{"centre": [round(r.cx, 2), round(r.cz, 2)], "outline": reach} for r, reach in outlines],
        "pool": {"centre": list(POOL["centre"]), "radius": POOL["radius"], "level": POOL["level"]},
        "waterfall": {"foot": [round(foot[0], 2), round(foot[1], 2)], "splash": 3.6},
        "plants": {"url": "models/island/plants.glb", "trunks": trunks, "crowns": crowns, "butterflies": butterflies,
                   "patches": {"canopy": CANOPY_PATCHES, "understory": UNDERSTORY_PATCHES}, "placed": placed},
    }
    L.export_glb(obj, os.path.join(OUT_DIR, "terrain.glb"), info, key="terrain")
    print(f"BUILT terrain: {tris} triangles, heights {lo:.2f} to {hi:.2f} m")
    print(f"BUILT landmarks: {len(outlines)} rocks, {rock_tris} triangles, waterfall lands at {foot[0]:.1f}, {foot[1]:.1f}")
    print(f"BUILT plants: {len(plant_objects)} patches, {plant_tris} triangles")


main()
