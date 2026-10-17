"""Build the island's ground in Blender and export it for the game.

Run (from the project root):
    blender --background --factory-startup --python art/blender/build_island.py

Outputs:
    public/models/island/terrain.glb    the ground: land, beaches and the sea floor near the island
    public/models/island/terrain.png    its painted colours, mapped from above
    public/models/island/height.bin     ground heights on a grid, for walking and the sea's colours
    public/models/island/landmarks.glb  the rocks (karst pillars, the waterfall's wall, the headland
                                        with its cave mouth, sea spires) and the waterfall
    public/models/island/plants.glb     the jungle, the fields' crops and the village's flowers,
                                        joined into a mesh for each patch of the map
    art/previews/island_map.png          the colour map with the zones' outlines, for checking the layout

The island is laid out after the film's aerial shot (`mermaid island 1`) and the map in PLAN.md
section 5. Game coordinates throughout, in metres: x east, z south (north is -z), y up. The main
beach in front of the village is at the origin. The water's surface is at WATER.
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
CENTRE = (0.0, -97.0)  # its centre (x, z); the island is centred here too
STEP = 1.0             # metres between the samples the ground is built from
TRIANGLES = 30000      # the ground's triangle budget after simplifying
HEIGHT_GRID = 385      # samples per side of the height grid the game walks on
COLOUR_SIZE = 2048     # texels per side of the painted colour map

# The coast: an ellipse with gentle wobbles, its radii in metres (x, z). About 280 x 225 metres.
COAST = {"radii": (140.0, 112.5), "wobble": [(3, 0.045, 0.6), (5, 0.03, 2.1), (7, 0.02, 0.3)]}
# Features, in game coordinates. Directions are angles of (x, z) from the island's centre.
# The coast swells out round the rocky headland at the east end of the main beach.
HEADLAND = {"centre": (122.5, -19.5), "bulge": 19.0}
# The festival street at the bay, after the film: a sandy plaza at the head of the pier lined with
# stalls, then, through the welcome arch, a street of stalls running inland, rising gently.
PLAZA = {"centre": (0.0, -7.0), "half": (14.0, 9.5), "feather": 4.0}
STREET = {"centre": (0.0, -31.5), "half": (8.5, 15.5), "feather": 4.0}
# The village: a round clearing deep in the jungle, its huts round the watchtower stage.
VILLAGE = {"centre": (0.0, -84.0), "radius": 22.0, "feather": 6.0}
FIELDS = {"centre": (-72.5, -39.5), "half": (27.5, 17.5), "feather": 10.0, "height": 0.85}
POOL = {"centre": (7.5, -134.5), "radius": 15.0, "floor": 3.1, "level": 4.6}

# Rock landmarks, after the film's aerial shot; karst.py builds them. Limestone pillars rise from
# the jungle round the waterfall pool, and the waterfall pours from a notch in the wall between two
# of them. Each pillar: centre (x, z), radii, turn, height above the ground, seed.
PILLARS = [
    ((-24.0, -166.0), (11.0, 10.0), 0.3, 50.0, 1),
    ((40.0, -170.0), (12.5, 11.0), -0.4, 60.0, 2),
    ((50.0, -158.0), (6.5, 6.0), 0.2, 38.0, 13),  # a lower twin against the tallest
    ((-62.0, -150.0), (10.0, 9.0), 0.8, 44.0, 3),
    ((-71.0, -141.0), (5.5, 5.0), 0.6, 26.0, 14),  # and one against the west pillar
    ((-50.0, -178.0), (9.5, 8.5), 0.1, 40.0, 4),
    ((75.0, -140.0), (10.0, 9.0), -0.2, 46.0, 5),
    ((-85.0, -95.0), (9.0, 8.0), 0.5, 36.0, 6),
    ((52.0, -88.0), (8.5, 7.5), 1.1, 34.0, 7),
]
WALL = {"centre": (7.5, -157.0), "radii": (21.0, 9.0), "top": 28.0, "seed": 8, "segments": 56, "flutes": 15,
        "lumps": 0.06, "taper": 0.05, "shoulder": 0.1, "rim": 0.06, "notch": (math.pi / 2, 2.6, 3.2)}
# The headland's blocks at the east end of the main beach. The cave mouth opens at the water from
# the foot of the biggest, facing the beach across the water: (angle, half width, height, depth).
LAYERED = {"stone": "headland", "facet_w": 0.45, "strata": 0.6, "rim": 0.1, "lumps": 0.12, "tip": 0.8}
HEADLAND_ROCKS = [
    dict(LAYERED, centre=(124.0, -21.0), radii=(24.0, 18.0), turn=0.5, top=21.0, seed=9, segments=96, flutes=18,
         facets=7, ledges=3, step=1.4, taper=0.18, shoulder=0.18, wet=WATER, cave=(2.05, 3.4, 5.6, 7.0)),
    dict(LAYERED, centre=(103.0, -27.0), radii=(13.0, 11.0), turn=0.2, top=12.0, seed=10, segments=36, flutes=10,
         facets=6, ledges=2, step=1.4, taper=0.2, shoulder=0.22),
    dict(LAYERED, centre=(139.0, -41.0), radii=(13.0, 10.5), turn=0.9, top=16.0, seed=11, segments=36, flutes=10,
         facets=6, ledges=2, step=1.4, taper=0.2, shoulder=0.2, wet=WATER),
    dict(LAYERED, centre=(147.0, -4.0), radii=(6.5, 5.5), turn=0.3, top=9.0, seed=12, segments=24, flutes=6,
         facets=5, step=1.2, ledges=1, taper=0.3, shoulder=0.3, tip=0.85, wet=WATER),
]
# Sea spires in clusters round the lagoon, clear of the main beach's view out to sea: the
# direction from the island's centre, metres out past the coast, seed, how many.
SPIRES = [
    (2.75, 30.0, 21, 3), (3.30, 26.0, 22, 2), (3.80, 33.0, 23, 3),
    (-0.25, 30.0, 24, 3), (-0.80, 27.0, 25, 2), (-2.05, 28.0, 26, 2),
]

# The plants (plants.py shapes them): canopy trees grow in clumps, spaced in metres; palms line
# the jungle's edge by the beach; ferns, bushes and monstera grow closer together along paths and
# edges than deep under the trees; the canopy opens into clearings where a noise rises past
# `clearings`.
JUNGLE = {"clump_spacing": 11.0, "trees": (4, 7), "tree_height": (7.0, 12.0), "palm_spacing": 6.0, "palms": 190,
          "understory": (2.3, 3.0), "clearings": 0.8, "big_trees": 12, "big_spacing": 36.0}
FIELD_ROW = 2.4         # metres between the fields' rows
BUTTERFLIES = 16        # blue butterflies, each fluttering round a flowering bush
CANOPY_PATCHES = 6      # the canopy and palms are joined into a mesh for each of 6 x 6 patches, near and far
UNDERSTORY_PATCHES = 8  # what grows under them into 8 x 8, which the game draws only nearby
# How much room each kind of placed prop keeps clear of trees, in metres from its middle.
PROP_ROOM = {"hut_green": 7.0, "hut_warm": 7.0, "hut_plank": 5.5, "beehive": 3.8, "stage": 6.5, "torch": 1.0,
             "stall_pink": 3.2, "stall_purple": 3.2, "stall_orange": 3.2, "stall_blue": 3.2, "stall_red": 3.2,
             "stall_white": 3.2, "arch": 2.5, "banner": 2.0, "bunting": 2.0, "bunting_long": 2.0, "lanterns": 1.2,
             "palm": 2.0, "sign": 2.0}
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
    ([(1.0, -105.0), (4.0, -112.0), (7.5, -118.0)], 3.0),                               # the village to the waterfall
    ([(-22.0, -90.0), (-38.0, -74.0), (-48.0, -58.0), (-52.0, -46.0)], 2.6),            # the village to the fields
    ([(14.0, -1.0), (40.0, -7.0), (65.0, -12.0), (80.0, -4.5)], 2.6),                   # the plaza to the night beach
    ([(22.0, -96.0), (40.0, -80.0), (62.0, -55.0), (78.0, -30.0), (84.0, -16.0)], 2.4),  # the village to the night beach
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


def coast_distance(x, z):
    """Signed distance to the coast in metres, roughly: positive inland. Also the direction angle."""
    dx, dz = x - CENTRE[0], z - CENTRE[1]
    d = np.hypot(dx, dz) + 1e-6
    ux, uz = dx / d, dz / d
    ax, az = COAST["radii"]
    radius = 1.0 / np.sqrt((ux / ax) ** 2 + (uz / az) ** 2)
    phi = np.arctan2(uz, ux)
    wobble = sum(amp * np.sin(k * phi + ph) for k, amp, ph in COAST["wobble"])
    radius = radius * (1.0 + wobble)
    # The rocky headland pushes the coast out to the east-south-east.
    hx, hz = HEADLAND["centre"]
    phi_h = math.atan2(hz - CENTRE[1], hx - CENTRE[0])
    radius += HEADLAND["bulge"] * np.exp(-(angle_diff(phi, phi_h) / 0.2) ** 2)
    return radius - d, phi


def angle_diff(a, b):
    return np.arctan2(np.sin(a - b), np.cos(a - b))


def cave_basin(x, z):
    """1 under the cave mouth and the passage just inside it, easing to 0 round it: the sea floor
    there is dug below the water, so the mouth opens onto water."""
    rock = next(r for r in HEADLAND_ROCKS if r.get("cave"))
    angle, half, _, depth = rock["cave"]
    rx, rz = rock["radii"]
    a = angle - rock["turn"]
    face = 1.0 / math.hypot(math.cos(a) / rx, math.sin(a) / rz)
    cx = rock["centre"][0] + (face - depth * 0.5) * math.cos(angle)
    cz = rock["centre"][1] + (face - depth * 0.5) * math.sin(angle)
    reach = max(half, depth * 0.5) + 3.0
    return 1.0 - smoothstep(reach - 2.5, reach, np.hypot(x - cx, z - cz))


def land_height(x, z):
    """The ground's natural height at points (x, z) on land, before any feature shapes it."""
    x, z = np.asarray(x, dtype=float), np.asarray(z, dtype=float)
    return ground(x, z, natural=True)[0]


def ground(x, z, natural=False):
    """Height of the ground (y) and the masks the painting needs. `natural` leaves out what the
    festival street and the village do to it."""
    s, phi = coast_distance(x, z)
    south = np.exp(-(angle_diff(phi, math.pi / 2) / 0.75) ** 2)
    hx, hz = HEADLAND["centre"]
    phi_h = math.atan2(hz - CENTRE[1], hx - CENTRE[0])
    near_headland = np.exp(-(angle_diff(phi, phi_h) / 0.22) ** 2)
    beach_w = (14.0 + 10.0 * south) * (1.0 - 0.85 * near_headland) + 2.0 * noise(x, z, 30.0, 2.0)

    # The sea floor: a gently shelving lagoon, then the reef edge dropping into the deep.
    t = np.maximum(-s, 0.0)
    lagoon_w = 36.0 + 8.0 * np.sin(2.0 * phi + 0.7)
    sea = WATER - (0.035 * t + 2.4 * smoothstep(0.0, lagoon_w, t)) - 15.0 * smoothstep(lagoon_w, lagoon_w + 16.0, t)

    # The land: a beach rising from the waterline, then soft hills, higher toward the north.
    b = np.clip(s / np.maximum(beach_w, 1.0), 0.0, 1.0)
    beach = WATER + 0.8 * (1.0 - (1.0 - b) ** 2)
    u = np.maximum(s - beach_w, 0.0)
    north = smoothstep(-52.0, -140.0, z)
    hills = (6.25 + 3.75 * north) * smoothstep(0.0, 94.0, u) * (0.55 + 0.45 * (0.5 + 0.5 * noise(x, z, 75.0, 1.0)))
    hills += 1.1 * noise(x, z, 27.0, 3.0) * smoothstep(0.0, 31.0, u)
    land = beach + hills
    h = np.where(s >= 0.0, land, sea)

    # The festival street rises gently and evenly from the plaza to the jungle; the village's
    # clearing is level; the fields are flat.
    inland = smoothstep(0.0, 6.0, s)
    m_plaza = box_mask(x, z, PLAZA["centre"], PLAZA["half"], PLAZA["feather"]) * inland
    m_street = box_mask(x, z, STREET["centre"], STREET["half"], STREET["feather"]) * inland
    vx, vz = VILLAGE["centre"]
    m_village = (1.0 - smoothstep(VILLAGE["radius"], VILLAGE["radius"] + VILLAGE["feather"], np.hypot(x - vx, z - vz)))
    if not natural:
        z_south = STREET["centre"][1] + STREET["half"][1]
        z_north = STREET["centre"][1] - STREET["half"][1]
        h_south, h_north = land_height(np.array([0.0, 0.0]), np.array([z_south, z_north - 4.0]))
        along = np.clip((z - z_south) / (z_north - z_south), 0.0, 1.0)
        h = h + (h_south + (h_north - h_south) * along - h) * m_street
        h_village = float(land_height(np.array([vx]), np.array([vz]))[0])
        h = h + (h_village + 0.04 * noise(x, z, 9.0, 4.0) - h) * m_village
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

    # Water under the cave mouth in the headland's foot.
    h = h + (np.minimum(h, WATER - 1.4) - h) * cave_basin(x, z)

    # The waterfall pool in the middle, under the rock wall the waterfall pours from.
    px, pz = POOL["centre"]
    r = np.hypot(x - px, z - pz)
    m_pool = 1.0 - smoothstep(POOL["radius"] - 2.0, POOL["radius"] + 2.5, r)
    h = h + (POOL["floor"] - h) * m_pool
    # A gentle sandy bank on the south side, where the path arrives, so the water can be reached.
    toward_south = np.exp(-(angle_diff(np.arctan2(z - pz, x - px), math.pi / 2) / 0.8) ** 2)
    m_bank = toward_south * (1.0 - smoothstep(POOL["radius"] + 12.0, POOL["radius"] + 22.0, r))
    ramp = POOL["level"] + 0.13 * (r - POOL["radius"])
    h = h + (np.minimum(h, np.maximum(ramp, POOL["floor"])) - h) * m_bank

    masks = {"s": s, "beach_w": beach_w, "village": m_village, "plaza": m_plaza, "street": m_street,
             "festival": np.maximum(m_plaza, m_street), "fields": m_fields, "path": m_path, "pool": m_pool,
             "bank": m_bank}
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

    # The pool's south bank: a little sandy beach down to the water.
    near_water = smoothstep(POOL["level"] + 1.4, POOL["level"] + 0.4, h)
    col = mix(col, c("sand"), smoothstep(0.3, 0.7, masks["bank"]) * near_water)

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
    # Ground right at the water's edge keeps its detail, so the pen's waterline runs smooth.
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


def coast_radius(angle):
    """How far the coast is from the island's centre in a direction."""
    d = 100.0
    s, _ = coast_distance(np.array([CENTRE[0] + d * math.cos(angle)]), np.array([CENTRE[1] + d * math.sin(angle)]))
    return float(s[0]) + d


def rock_specs():
    """Every rock to build, as karst.py specs."""
    specs = []
    for centre, radii, turn, height, seed in PILLARS:
        rng = np.random.default_rng(seed + 500)
        specs.append({
            "centre": centre, "radii": radii, "turn": turn, "height": height, "seed": seed, "segments": 28,
            "step": 3.0, "facets": int(rng.integers(5, 8)), "flutes": int(rng.integers(7, 11)), "lumps": 0.07,
            "taper": rng.uniform(-0.06, 0.14), "bulge": rng.uniform(0.02, 0.09), "ledges": int(rng.integers(1, 3)),
            "lean": rng.uniform(0.02, 0.06), "rim": 0.14,
            "group": "west" if centre[0] < -40 else "east" if centre[0] > 40 else "middle",
        })
    specs.append(dict(WALL, wet=POOL["level"], group="middle"))
    specs.extend(dict(r, group="headland") for r in HEADLAND_ROCKS)
    for cluster, (angle, out, seed, count) in enumerate(SPIRES):
        rng = np.random.default_rng(seed)
        r0 = coast_radius(angle) + out
        cx, cz = CENTRE[0] + r0 * math.cos(angle), CENTRE[1] + r0 * math.sin(angle)
        for k in range(count):
            first = k == 0
            a, d = rng.uniform(0.0, 2.0 * math.pi), (0.0 if first else rng.uniform(5.0, 9.0))
            r = rng.uniform(1.3, 3.0) * (1.0 if first else 0.75)
            specs.append({
                "centre": (cx + d * math.cos(a), cz + d * math.sin(a)), "radii": (r, r * rng.uniform(0.75, 0.95)),
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
    can leave out a group it is not looking at), the waterfall and its spray. Returns the objects,
    each rock's foot outline, and where the waterfall lands in the pool."""
    groups, outlines, wall = {}, [], None
    for spec in rock_specs():
        rock = K.Rock(spec, ground_height)
        bm, cols, rim = rock.build()
        pieces = groups.setdefault(spec["group"], [])
        pieces.append((bm, cols, not rock.s["flat"]))
        if rock.s["crown"]:
            small = rock.rx < 4.0
            gap = rock.s["notch"][:2] if rock.s["notch"] else None
            pieces.append((*K.crown(rock, rim, gap=gap, size=1.1 if small else None, target=110 if small else 450), True))
        outlines.append((rock, rock.outline()))
        if rock.s["notch"]:
            wall = rock
    rocks = [join_painted(f"rocks_{name}", pieces, collection) for name, pieces in groups.items()]
    bm, uvs, foot = K.waterfall(wall, POOL["level"])
    fall = object_with_uv("waterfall", bm, uvs, collection)
    spray = join_painted("spray", [(*K.spray(POOL["level"]), True)], collection)
    spray.location = (foot[0], -foot[1], POOL["level"])
    return [*rocks, fall, spray], outlines, foot


# ---------------------------------------------------------------------------- plants
def plant_ground(outlines, props):
    """Where plants may grow, on a 1 m grid over the map: the ground's height, how far past the
    beach each point is, how far it is from paths, rocks, props and the pool, and how steep."""
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
        "pool": np.hypot(gx - POOL["centre"][0], gz - POOL["centre"][1]) - POOL["radius"], "slope": np.hypot(gxr, gzr),
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
    open_ground = (G["village"] < 0.02) & (G["festival"] < 0.02) & (G["fields"] < 0.02) & (G["pool"] > 6.0)
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
                    or grid_at(G, "festival", tx, tz) > 0.05 or not stems.free(tx, tz, 3.0):
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
    under_ok = ((G["inland"] > 1.0) & (G["village"] < 0.12) & (G["festival"] < 0.12) & (G["fields"] < 0.1)
                & (G["path"] > 0.9) & (G["rock"] > 1.0) & (G["prop"] > -0.6) & (G["pool"] > 3.0) & (G["slope"] < 0.85))
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

    # Grass tufts in the village's clearing, thickest toward its edge.
    tufts = [variants.shape("grass", PL.to_arrays(PL.grass(rng))) for _ in range(4)]
    tuft_ok = (G["village"] > 0.05) & (G["path"] > 1.0) & (G["prop"] > 0.5) & (G["slope"] < 0.8)
    tuft_gap = np.where(G["village"] < 0.85, 1.3, 2.6)
    for x, z in scatter(rng, G, tuft_ok, tuft_gap, taken=None, stride=1, limit=260):
        if math.hypot(x - VILLAGE["centre"][0], z - VILLAGE["centre"][1]) < 8.0:
            continue
        variants.plant("under", tufts[int(rng.integers(0, len(tufts)))], x, at(x, z) - 0.02, z,
                       rng.uniform(0, 2 * math.pi), rng.uniform(0.8, 1.3))

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
    landmarks, outlines, foot = build_landmarks(collection)
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
        "pool": {"centre": list(POOL["centre"]), "radius": POOL["radius"], "level": POOL["level"]},
        "landmarks": "models/island/landmarks.glb",
        "rocks": [{"centre": [round(r.cx, 2), round(r.cz, 2)], "outline": reach} for r, reach in outlines],
        "waterfall": {"foot": [round(foot[0], 2), round(foot[1], 2)], "splash": 6.0},
        "plants": {"url": "models/island/plants.glb", "trunks": trunks, "crowns": crowns, "butterflies": butterflies,
                   "patches": {"canopy": CANOPY_PATCHES, "understory": UNDERSTORY_PATCHES}, "placed": placed},
    }
    L.export_glb(obj, os.path.join(OUT_DIR, "terrain.glb"), info, key="terrain")
    print(f"BUILT terrain: {tris} triangles, heights {lo:.2f} to {hi:.2f} m")
    print(f"BUILT landmarks: {len(outlines)} rocks, {rock_tris} triangles, waterfall lands at {foot[0]:.1f}, {foot[1]:.1f}")
    print(f"BUILT plants: {len(plant_objects)} patches, {plant_tris} triangles")


main()
