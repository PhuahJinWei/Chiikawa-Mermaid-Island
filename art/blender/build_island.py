"""Build the island's ground in Blender and export it for the game.

Run (from the project root):
    blender --background --factory-startup --python art/blender/build_island.py

Outputs:
    public/models/island/terrain.glb    the ground: land, beaches and the sea floor near the island
    public/models/island/terrain.webp   its painted colours, mapped from above
    public/models/island/terrain_kinds.webp  where grass, bare earth and sand lie, mapped the same way,
                                        for the film look's painting of grass and earth
    public/models/island/terrain_scree.webp  how thickly stones fallen from the rocks lie, mapped the
                                        same way, for the film look to paint them
    public/models/island/height.bin     ground heights on a grid, for walking and the sea's colours, each
                                        stored less what its neighbours predict
    public/models/island/landmarks.glb  the rocks (karst pillars and mesas, the rocks behind the
                                        night beach, sea spires, the sea cliffs, the tableland's
                                        white cliffs, the gorge's walls and the spur with the
                                        forbidden cave's mouth and skylight) and the jungle
                                        waterfall with its spray
    public/models/island/plants.glb     the jungle, the fields' crops and the village's flowers,
                                        joined into a mesh for each patch of the map
    public/models/island/cave.glb       the forbidden cave's inside (cave.py): its rock, the skylight's
                                        well and dome, the water, the ledge, the boat and the torch
    public/models/island/cave_grid.bin  the cave's floor and ceiling on a grid, for walking in it
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
import cave as CV  # noqa: E402
import plants as PL  # noqa: E402

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
OUT_DIR = os.path.join(ROOT, "public", "models", "island")
OUT_PREVIEW = os.path.join(ROOT, "art", "previews", "island_map.png")
LAYOUT = os.path.join(ROOT, "public", "data", "layout.json")

WATER = -0.32          # the sea's surface (game y)
SIZE = 520.0           # the map is a square this many metres across: the island and its reef
CENTRE = (-35.0, -140.0)  # its centre (x, z)
STEP = 1.0             # metres between the samples the ground is built from
TRIANGLES = 46000      # the ground's triangle budget after simplifying
HEIGHT_GRID = 465      # samples per side of the height grid the game walks on (a sample every 1.12 m)
COLOUR_SIZE = 2048     # texels per side of the painted colour map
KINDS_SIZE = 1024      # texels per side of the map of where grass, bare earth and sand lie

# The coast: its distance from `centre` by direction (the angle of (x, z) from east toward south)
# as a Fourier series, [a0, [a1, b1], [a2, b2], ...], with a gentle `wobble` of a metre or two. It
# was first fitted to the film's aerial shot, about 290 metres across and 215 from north to south;
# the island has since grown to the north and west (2026-10-19) to hold the places the film's other
# frames show there, its coast stretched out 45% beyond x = -40 and z = -70 and fitted again, so the
# south and east coasts, the bay and the night beach, lie where they were (within 0.35 m). About 340
# metres across and 285 from north to south.
COAST = {"centre": (-28.8, -134.2), "wobble": 1.5,
         "series": [153.2, [0.55, -0.18], [14.83, 2.04], [-6.01, 1.52], [1.16, 0.81], [-1.74, -0.37], [0.73, -0.9],
                    [0.18, -0.51], [-0.23, -0.11], [0.04, 0.18], [-0.18, 0.23], [0.03, -0.16], [0.04, -0.02],
                    [-0.0, -0.13], [0.05, 0.04], [-0.04, -0.01], [0.09, -0.0]]}
# How wide the beach is, by direction from the coast's centre, after the shot: narrow where the
# jungle runs down to the water in the west and north, wider along the main beach, widest on the
# night beach to the south-east, and wide again on the west coast where the forbidden cave looks out
# over its beach. Each widening: direction (degrees), metres, how far round (degrees).
BEACH = {"base": 3.0, "wider": [(79.9, 9.0, 37.0), (125.4, 6.0, 24.3), (46.1, 18.0, 16.7), (1.0, 5.0, 17.5),
                                (168.0, 15.0, 12.0)]}
# Features, in game coordinates.
# The festival at the bay, after the film: the beach in front of two long rows of stalls along its
# back, facing the bay, and through the welcome arch in the opening between them, a street of
# stalls running inland. PLAZA and STREET are where the sand is, between the stalls; the street's
# runs under its stalls to their backs (x = ±6.9), where its back alleys begin (see BACKS), or a
# strip of grass shows under the stalls and through the gaps between them.
PLAZA = {"centre": (0.0, -5.5), "half": (31.0, 8.5), "feather": 3.0}
STREET = {"centre": (0.0, -29.4), "half": (6.9, 15.6), "feather": 1.5}
# Its ground is level, as in the film: a band along the front rows (which follow the back of the
# beach, z = row[0] + row[1] x^2), from `behind` them to `front` of them, and the street box (centre,
# half sizes); it eases into the ground round them over `feather` metres, and past the street's far
# end over `ramp` metres, where the path climbs on into the jungle.
FESTIVAL = {"level": 0.5, "row": (-13.6, 0.0022), "rows_half": 30.0, "behind": 5.5, "front": 2.0, "feather": 3.0,
            "street": ((0.0, -29.6), (8.8, 16.4)), "ramp": 22.0}
# The festival's back alleys: a strip of packed sand behind each row of its stalls, clear of plants,
# for the islanders who keep the stalls to come and go and step in behind their counters. Boxes
# (centre, half sizes) behind the street's two rows and behind the row across its far end; and a
# band behind the front rows, from `rows` (near, far) metres behind the line they follow, out to
# `rows_half` either side; easing into the ground round them over `feather`. Plants keep `room`
# metres further off. The stalls are square now, as deep as they are wide, their fronts where they
# were, so the alleys begin further back.
BACKS = {"boxes": [((-7.45, -29.6), (0.6, 15.5)), ((7.45, -29.6), (0.6, 15.5)), ((0.0, -45.95), (7.7, 0.95))],
         "rows": (0.65, 3.4), "rows_half": 13.6, "feather": 0.6, "room": 0.8}
# The festival's stalls, banners, bunting, lantern poles and baskets as they stood when the jungle was
# planted (kind, x, z, turn): its front rows of eight narrower stalls a side, a street of ten a side
# with a row of four across its far end, and the banners, bunting, lantern poles and baskets among
# them; and the village's lantern poles, baskets and the stage's torches. The jungle is planted round
# these wherever the layout has them now, so it grows as it did; the alleys keep their ground clear.
# The layout's own props of these kinds (PLANTED_KINDS) are left out: torches added since stand on
# open ground, where nothing grows.
PLANTED_ROUND = [("stall_pink", -6.5, -13.51, 1.6), ("stall_blue", 6.5, -13.51, -1.6),
                 ("stall_blue", -9.42, -13.4, 2.4), ("stall_pink", 9.42, -13.4, -2.4),
                 ("stall_red", -12.34, -13.26, 3.1), ("stall_orange", 12.34, -13.26, -3.1),
                 ("stall_white", -15.26, -13.09, 3.8), ("stall_white", 15.26, -13.09, -3.8),
                 ("stall_orange", -18.18, -12.87, 4.6), ("stall_blue", 18.18, -12.87, -4.6),
                 ("stall_purple", -21.1, -12.62, 5.3), ("stall_red", 21.1, -12.62, -5.3),
                 ("stall_pink", -24.02, -12.33, 6.0), ("stall_purple", 24.02, -12.33, -6.0),
                 ("stall_blue", -26.94, -12, 6.8), ("stall_orange", 26.94, -12, -6.8),
                 ("stall_pink", -5.2, -15.8, 90.0), ("stall_purple", 5.2, -15.8, -90.0),
                 ("stall_red", -5.2, -18.72, 90.0), ("stall_red", 5.2, -18.72, -90.0),
                 ("stall_white", -5.2, -21.64, 90.0), ("stall_blue", 5.2, -21.64, -90.0),
                 ("stall_orange", -5.2, -24.56, 90.0), ("stall_orange", 5.2, -24.56, -90.0),
                 ("stall_purple", -5.2, -27.48, 90.0), ("stall_pink", 5.2, -27.48, -90.0),
                 ("stall_blue", -5.2, -30.4, 90.0), ("stall_white", 5.2, -30.4, -90.0),
                 ("banner", 0, -20.18, 0.0), ("banner", 0, -23.1, 0.0),
                 ("bunting_row", -10.88, -12.31, -177.3), ("bunting_row", -22.56, -11.46, -174.3),
                 ("bunting_row", 10.88, -12.31, -2.7), ("bunting_row", 22.56, -11.46, -5.7),
                 ("bunting_street", 0, -28.94, 0.0), ("lanterns", -29.2, -11.52, 0.0),
                 ("lanterns", 29.2, -11.52, 0.0), ("lanterns", -3, -60.5, 0.0), ("lanterns", 3, -60.5, 0.0),
                 ("stall_orange", -6.28, -44.35, 0.0), ("stall_purple", 6.28, -44.35, 0.0),
                 ("stall_red", -5.2, -33.32, 90.0), ("stall_purple", 5.2, -33.32, -90.0),
                 ("stall_white", -5.2, -36.24, 90.0), ("stall_orange", 5.2, -36.24, -90.0),
                 ("stall_orange", -5.2, -39.16, 90.0), ("stall_blue", 5.2, -39.16, -90.0),
                 ("stall_pink", -5.2, -42.08, 90.0), ("stall_red", 5.2, -42.08, -90.0),
                 ("stall_white", -3.36, -44.35, 0.0), ("stall_pink", 3.36, -44.35, 0.0),
                 ("lanterns", -2.15, -43.3, 0.0), ("lanterns", 2.15, -43.3, 0.0),
                 ("bunting_street", 0, -37.7, 0.0), ("basket", -9.42, -12.15, 11.5),
                 ("basket", 15.26, -11.84, 204.6), ("basket", -21.1, -11.37, 299.3),
                 ("basket", 24.02, -11.08, 168.7), ("basket", -4.25, -24.56, 141.0),
                 ("basket", 4.25, -30.4, 235.0), ("basket", -4.25, -36.24, 329.0),
                 ("basket", 4.25, -39.16, 16.0), ("basket", 5.55, -88.91, 40.0), ("basket", 10.44, -84.61, 300.0),
                 ("torch", 3.05, -88.39, 0.0), ("torch", 5.05, -86.73, 0.0), ("torch", 8.59, -83.8, 0.0),
                 ("torch", 10.6, -82.14, 0.0)]
PLANTED_KINDS = ("stall_", "banner", "bunting_", "lanterns", "basket", "torch")
# The village, as the film's: its houses in groups of their own, not round a ring. A sandy plaza
# where the islanders gather, the watchtower stage at its north-east corner; the local houses' lane
# to the fields, its stilt huts facing each other across it, and a yard to the north-west with the
# plank and beehive huts (each a polyline, or a point, and how far its sand reaches round it). The
# guest houses stand in a glade of their own to the north-east, in the jungle's greenery (see
# GUEST_GREENS). All on the lowland's level ground.
VILLAGE = {"plaza": ((0.0, -78.0), 14.0), "lanes": [([(-11.0, -71.0), (-24.0, -63.5), (-36.0, -56.5), (-44.0, -50.0)], 4.6)],
           "yards": [((-19.0, -97.0), 9.0)], "feather": 5.0}
# Round each guest house, as in the film's frames of them: a crowd of flowering bushes, banana
# plants, monstera, ferns, red ti and cycads all round it but in front of its steps, this far out
# from its eaves (a range; its half width, depth behind and reach in front, steps and all, `half`), and
# a few palms over it. The big-leaved kinds stand further out (`clear`: the least room for each), so
# their leaves stop short of the walls rather than reaching through them into the room.
GUEST_GREENS = {"count": 16, "room": (0.5, 2.6), "front": 40.0, "palms": 3, "half": (2.6, 3.0, 4.1),
                "mix": ("bush", "banana", "bush", "monstera", "bush", "ti", "fern", "banana", "cycad", "bush"),
                "clear": {"banana": 1.9, "monstera": 1.3, "cycad": 1.0, "fern": 0.8}}
FIELDS = {"centre": (-45.0, -38.0), "half": (14.0, 12.0), "feather": 6.0, "height": 1.2}
# The jungle waterfall, after the film's frame of it, in the middle of the island: the round water
# the aerial shot shows through the trees in the middle of the ring of pillars is its pool. The
# pool's water stands at `level` over a floor at `floor`; round it the ground lies in a gentle
# hollow at `bank` out to `clearing` metres from its middle, easing into the land over `feather`,
# open to the sky above the water; the jungle's trees stand back to `trees` metres from its middle,
# so its water shows through the canopy from the aerial shot's camera. It is seen as in the film
# from its bank on the side `view` looks from (the way the view across the pool faces, degrees from
# east toward south), out of the shade of dense trees.
# The pool and everything round it (its wall, plants, rocks and the four pillars nearest) moved 40 m
# north as one piece when the island grew, and 9.6 m down onto the lowland, so its frame is as it was.
POOL = {"centre": (2.0, -199.0), "radius": 11.0, "floor": -0.3, "level": 0.9, "bank": 1.7, "clearing": 19.0,
        "feather": 8.0, "trees": 30.0, "view": -25.0}
# The waterfall pours from a notch (angle, half width, depth) in a long, low wall of damp, mossy
# limestone across the pool from that bank, hung with `vines`: wide across the frame as in the film,
# running from the north pillar's foot to a way through beside the south-east pillar, and with
# `curtains` of hanging moss. Centre, radii, turn and the top's height. The notch is where the view across the pool meets the wall's face, and
# the water pours from it toward the bank (`pour`, an angle as the notch's).
FALL = {"centre": (15.91, -210.03), "radii": (16.0, 6.5), "turn": math.radians(65.0), "top": 12.4,
        "notch": (math.radians(121.8), 1.6, 1.4), "pour": math.radians(POOL["view"] + 180.0), "vines": 110,
        "curtains": 14, "seed": 41}
# Ferns and small plants growing out of the waterfall's wall, on its ledges and in its cracks, as down
# the film's cliff: how many.
WALL_PLANTS = 90
# Round the pool as in the film's frame, seen from its bank, where the plants close in on the view.
# Places are (across, toward): metres to the right of the view from the pool's middle, and back
# toward the viewer. A big tree with buttress roots at the water's edge on the right; plants (kind,
# which of its shapes, across, toward, scale): monstera, red ti plants and cycads at the left, cycad
# fronds, white flowers and ferns to the right, more along the far corners against the rock (big
# ones at the far left, under a low tree, hiding the pale foot of the pillar there); a leaning mossy
# slab of rock at the water on the left and a pale stump of it at the water's edge on the right, by
# the tree, mossy only on top and crowded with the film's showy bromeliads, a cycad's fronds arching
# over it from behind (across, toward, radii, turn, height, seed).
POOL_TREE = (4.2, 11.6)
POOL_PLANTS = [("monstera", 0, -3.4, 13.4, 1.5), ("monstera", 2, -4.4, 11.6, 1.35), ("monstera", 1, -6.2, 10.4, 1.3),
               ("ti", 1, -1.9, 16.4, 0.85), ("ti", 3, -2.4, 14.6, 1.1), ("fern", 2, -5.6, 13.9, 1.3),
               ("fern", 1, 4.3, 13.0, 1.2), ("bush", 1, 3.6, 15.4, 1.2), ("bush", 1, 4.6, 12.9, 1.0),
               ("fern", 4, 2.6, 16.2, 1.2), ("fern", 0, 6.2, 9.8, 1.3), ("fern", 3, -7.0, 8.4, 1.25),
               # Closer in at the left: big monstera leaves and red ti, cycad fronds standing over them.
               ("monstera", 3, -3.4, 15.6, 1.3), ("monstera", 0, -4.6, 12.8, 1.5), ("fern", 5, -2.8, 12.6, 1.3),
               ("ti", 0, -2.4, 17.0, 0.9), ("cycad", 0, -6.4, 12.4, 1.2),
               # At the right: big arching cycad fronds, more white flowers, ferns at the water.
               ("cycad", 1, 3.8, 14.2, 1.5), ("fern", 2, 4.6, 11.2, 1.25), ("bush", 1, 2.8, 15.6, 1.2),
               # Along the far corners of the pool, against the rock.
               ("fern", 0, -10.5, -5.5, 1.4), ("monstera", 1, -11.6, -1.0, 1.5), ("ti", 2, -9.6, -7.5, 1.2),
               ("fern", 3, 10.4, -5.8, 1.4), ("monstera", 2, 11.7, -1.5, 1.5), ("cycad", 2, 10.5, -8.0, 1.3),
               ("monstera", 2, -12.4, -6.6, 2.0), ("cycad", 3, -13.0, -4.0, 1.8), ("fern", 5, -11.0, -8.6, 1.8),
               ("monstera", 0, -10.2, -3.2, 1.7),
               # Behind the stump, its fronds arching over the bromeliads.
               ("cycad", 1, 4.4, 8.4, 2.1)]
POOL_ROCKS = [(-4.5, 10.5, (2.4, 1.4), 0.9, 1.7, 62), (3.0, 9.8, (1.0, 0.85), 0.2, 3.0, 63)]
# A leafy bough hanging down out of the bank's trees over the cast, close to where the film's frame
# is seen from, framing its top left as the film's does: its foot (across, toward), how high over
# the ground, and which way it reaches (a turn, as the plants').
POOL_BRANCHES = [(-3.0, 16.0, 3.9, -1.13)]
# Clumps of canopy trees framing the view as in the film, each tree's (across, toward, height): over
# the bank, closing in overhead, so the bank lies in their shade, deepest over the plants at the
# left, while the pool and the waterfall are in the sun (their trunks off to the sides of the view
# and behind it); and either side of the pool, hiding the pillars beyond and the ends of the
# waterfall's wall. Other trees keep off the bank out to `BANK_ROOM` metres past the water.
POOL_GROVE = [
    [(-8.6, 15.0, 14.5), (-5.0, 24.5, 14.5), (1.0, 25.5, 13.5), (-4.6, 17.6, 13.5), (-12.5, 21.0, 12.0),
     (-2.0, 22.8, 13.5), (4.5, 25.5, 14.0)],
    [(-14.5, -3.5, 14.5), (-16.5, 3.0, 13.0), (-13.5, -8.5, 13.5)],
    [(14.0, -5.0, 13.5), (12.5, -11.0, 14.0)],
]
BANK_ROOM = 22.0
# A low tree at the pool's far left, its crown filling the view across the water where the pillar's
# pale foot would show between the trunks there (across, toward, height).
POOL_LOW_TREE = [(-11.8, -6.2, 9.5)]


def pool_spot(across, toward):
    """A place round the pool, given as metres to the right of the view across it from its middle and
    back toward the viewer (see POOL_PLANTS), in the game's x and z."""
    a = math.radians(POOL["view"])
    vx, vz = math.cos(a), math.sin(a)
    return POOL["centre"][0] - vz * across - vx * toward, POOL["centre"][1] + vx * across - vz * toward


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
# (They moved 62.4 m north with the coast when the island grew; their directions are from its new
# centre.)
CLIFFS = {"start": -73.8, "west": -69.3, "headland": -66.2, "reach": 10.0, "spread": 3.09, "low": 6.5,
          "cove": (-64.7, -61.6, -48.4, 26.0), "rise": (-63.1, -59.3), "height": 18.0, "fall": (-38.9, -31.5),
          "end": -29.8, "depth": 18.0, "ease": 24.0, "deep": 3.6, "seed": 51}
# The sea stack off the mouth of the cove and a smaller rock beside it: centre, radii, turn, height
# above the water, seed.
STACKS = [((76.0, -265.9), (4.6, 3.6), 0.4, 10.6, 71), ((70.5, -272.4), (1.9, 1.5), 1.1, 3.6, 72)]

# Rock landmarks, after the film's aerial shot (each placed through a camera matched to it); karst.py
# builds them. Tall limestone pillars stand in a ring round the waterfall's pool, with white rock
# standing out of the jungle on their tops: centre (x, z), radii, turn, the top's height (y), seed,
# and the white tips (offset x, z from the middle, radius, height above the top). When the island
# grew, the four round the pool moved with it (the west one 8 m further off, to let the gorge by),
# the rest with the coast; each top moved with the ground round its foot, now the flat lowland, so
# each stands as tall above it as before.
TOWERS = [
    ((-28.0, -216.0), (12.5, 12.0), 0.3, 45.8, 1, [(-3.5, -1.5, 2.6, 6.0), (3.5, 2.0, 2.2, 4.5), (0.5, 5.0, 1.8, 3.5)]),
    ((2.0, -230.0), (13.0, 12.5), -0.4, 45.0, 2, [(-4.0, 1.0, 2.8, 6.5), (2.5, -2.0, 2.4, 5.0), (5.0, 3.5, 1.8, 3.5)]),
    ((30.0, -177.0), (12.0, 11.0), 0.2, 58.25, 13, [(1.0, 0.5, 3.6, 14.0), (-4.5, 3.0, 1.8, 4.0)]),
    ((46.0, -168.0), (10.0, 9.0), 0.8, 45.25, 3, [(0.5, -1.0, 2.4, 7.0)]),
    ((69.0, -117.8), (14.0, 13.0), -0.2, 62.1, 5, [(1.5, 0.0, 3.0, 10.0), (-4.0, 3.0, 1.6, 3.5)]),
    ((40.0, -70.0), (12.2, 11.5), 1.1, 57.55, 7, [(-2.0, -2.0, 1.8, 3.5)]),
    ((-67.5, -72.9), (11.5, 11.0), 0.5, 40.1, 6, []),
]
# The island's ground, as the film's frames show it (its third shape, 2026-10-19): flat and low
# almost everywhere, the village, the festival and the jungle paths on level ground `height` metres
# over the sea, climbing to it from the beach's top over `rise` metres; the karst stands up out of it
# sheer. Its gentle unevenness, `noise` metres either way.
LOWLAND = {"height": 1.4, "rise": 12.0, "noise": 0.25}
# In the west the land stands up as a high, flat tableland of white limestone, `top` metres up, ringed
# with sheer cliffs: inside `outline` (x, z), and `coast` metres back from the sea, so a strip of
# beach and jungle runs along its foot. The ground climbs from below to its top between `edge` metres
# inside its outline (negative: outside it), from the foot of the cliff faces built over it (they
# stand out from the outline; see karst.cliff), so no one walks into them.
TABLELAND = {"outline": [(-260.0, -210.0), (-150.0, -193.0), (-142.0, -183.0), (-128.0, -170.0), (-95.0, -158.0),
                         (-75.0, -165.0), (-58.0, -178.0), (-52.0, -192.0), (-55.0, -215.0), (-62.0, -252.0),
                         (-75.0, -330.0), (-260.0, -330.0)],
             "top": 11.0, "noise": 0.6, "coast": 8.0, "edge": (-1.2, 1.0), "seed": 81}
# A gorge runs through the tableland from the waterfall's lowland to the west coast, after the
# film's frames of the stepping-stone pillars: its walls `half` metres either side of `line` (x, z,
# east to west). West of `from` the sea fills it, a wide river `water` metres either side of the line,
# over a bed `bed` deep; a narrow ledge (height, width) runs along the foot of its south wall, the
# path from the stones down to the restaurant, its rounded pebbles and boulders as in the film's
# frames of it. East of there its floor is a dry ravine climbing to the lowland's level by `head`.
GORGE = {"line": [(-25.0, -200.0), (-52.0, -201.0), (-80.0, -199.0), (-110.0, -193.0), (-140.0, -186.0),
                  (-165.0, -181.0), (-240.0, -177.0)],
         "half": 13.5, "water": 10.0, "from": -75.0, "head": -52.0, "ledge": (0.6, 3.0), "bed": -2.8}
# The stepping-stone pillars across the gorge's river, after the film's frames of them: tall thin
# pillars of the gorge's white rock standing in the water, each topped with a flat round mat of grass
# a short jump from the next, from a pillar standing against the north rim's cliff, its top level
# with the rim, to a shelf of rock jutting from the south rim's cliff over the riverside path (its
# underside `shelf` metres over the path). Where they cross (x on the gorge's line); each river
# pillar's place across the river (metres south of the line) and along it, how far its top stands
# above or below the line between the two rims, and its radii; the rim pillar's and the shelf's
# places across and radii; and the ledges walked on from each rim onto its pillar's or shelf's top
# (from, to: metres from the gorge's line; half width), level with the rim.
STONES = {"x": -100.0, "across": [-8.9, -5.34, -1.78, 1.78, 5.34, 8.9], "along": [0.5, -0.45, 0.55, -0.5, 0.45, -0.3],
          "rise": [-0.22, -0.05, -0.28, -0.06, -0.3, -0.1], "radii": (1.6, 1.45), "seed": 101,
          "rim": (12.6, 13.1), "rim_radii": (2.0, 1.8), "shelf": 3.8, "ledge": (13.2, 15.4), "ledge_half": 1.3}
# Plants at the foot of the gorge's south wall along the riverside path: from x, to x, every so
# many metres (a range), this far in from the wall's line, of these kinds.
GORGE_FOOT = {"from": -77.0, "to": -142.0, "gap": (1.4, 2.6), "in": 1.45, "kinds": ("fern", "fern", "monstera", "ti"),
              "seed": 121}
# Boulders along the river's edge below the riverside path, every so many metres (a range), their
# radii and heights over the path (ranges), clear of the stones' crossing by `clear` metres.
BOULDERS = {"from": -78.0, "to": -146.0, "gap": (4.5, 9.0), "radius": (0.55, 0.95), "height": (0.5, 1.2),
            "across": 9.7, "clear": 7.0, "seed": 111}
# From the tableland's south-west corner a spur of it runs out toward the west coast: inside `outline`
# (x, z; its root reaches into the tableland), its top falling from `top` (at `root`) to `top`'s
# second (at `tip`, its west end), where the cave's heap of rock stands against it.
SPUR = {"outline": [(-132.0, -180.0), (-92.0, -168.0), (-100.7, -134.9), (-141.8, -120.6), (-156.0, -116.2),
                    (-168.6, -144.7)],
        "root": (-112.0, -165.0), "tip": (-162.0, -130.0), "top": (11.0, 8.5), "noise": 0.4}
# The forbidden cave, after the film's frames of its entrance and the user's sketch of it: a terraced
# outcrop of bare rock on the west coast, rising out of the sea in flat-topped tiers, each stepping up
# and a little back from the last, to the spur's end, with nowhere to walk on it. The mouth opens at
# the foot of its south face close to the sea, over the open beach, facing `facing` (degrees from east
# toward south): an arched opening (half width, height) into the dark, `depth` metres back, at the
# beach's height `floor`, in the tier (radii, top) whose middle is `back` metres behind it. Nothing
# grows within `clear` metres before it (trees and palms, then the plants under them). The mouth opens
# right through into the cave's inside (cave.py), which runs on under the outcrop and the spur to the
# dome under the skylight; the rock and ground it runs through are cut away inside it. Before it the
# sand lies level with its sill (`apron`: how far out, how far past the sill's ends, then over how many
# metres it eases into the beach), and the ground's edge runs along the sill (see mouth_rows), so the
# beach meets the cave's floor with no step and the rock's face under the sill stays buried.
CAVE = {"mouth": (-193.0, -111.0), "facing": 85.0, "half": 1.5, "height": 2.8, "depth": 4.0, "floor": 0.35,
        "rock": ((9.5, 7.0), 6.2), "back": 6.5, "clear": (15.0, 12.0), "seed": 85, "apron": (1.0, 1.0, 3.0)}
# The outcrop's other tiers, from the sea up to the spur's end, with two lower ones along its back:
# centre (x, z), radii, turn, top, seed, whether its foot stands in the sea, and whether greenery
# grows along its top (as along the high tiers' tops in the sketch; the mouth's tier has it too).
CAVE_ROCKS = [((-211.0, -120.5), (7.0, 5.5), 0.35, 1.6, 86, True, False),
              ((-206.5, -116.5), (6.5, 5.0), 0.2, 2.8, 87, True, False),
              ((-201.0, -116.0), (6.5, 5.5), 0.1, 4.2, 88, True, False),
              ((-182.5, -120.5), (9.0, 7.5), -0.1, 7.6, 89, False, True),
              ((-171.5, -123.0), (9.5, 8.5), 0.15, 8.8, 90, False, True),
              ((-162.0, -131.0), (9.0, 10.0), 0.3, 9.8, 91, False, True),
              ((-199.0, -128.0), (8.0, 6.0), -0.25, 3.4, 92, True, False),
              ((-185.0, -131.5), (9.0, 7.0), -0.2, 6.0, 93, False, False)]
# How the outcrop's tiers are built: flat-topped, their faces nearly upright, stepping in at a ledge or
# two, lumpy and split into slabs, bedded, bare stone (the game paints it in beds and joints); the
# greenery along a tier's top in bush-sized clumps, some hanging over its edge.
CAVE_STONE = {"stone": "headland", "segments": 48, "step": 0.7, "facets": 7, "facet_w": 0.45, "flutes": 12,
              "flute_depth": 0.05, "lumps": 0.14, "taper": 0.08, "bulge": 0.05, "ledges": 2, "shoulder": 0.1,
              "tip": 0.45, "rim": 0.06, "strata": 0.5, "crown": False, "moss": False, "group": "cave"}
CAVE_GREENS = {"crown": True, "crown_size": 3.0, "crown_target": 1100, "mound": 0.8, "hang": 0.4}
# The cave's skylight, as in the film's frames looking down into it and up out of it and the user's
# sketch of it: a round opening in the spur's top like a well's mouth, `radius` metres from its middle
# to its edge, wandering a little from round (`lumps`: waves of how many times round, how far as a
# share of the radius, where each starts), the ground running right to its edge, cut out of the ground
# at `segments` points round it; its sides drop sheer `shaft` metres, then open out into the cave, a
# dome over its sea reaching about `dome` metres from the middle at the water, its floor at `floor`
# (see karst.skylight). The cave is a hidden place: the opening lies deep in the spur's jungle, far
# from the stepping stones, no path to it, trees crowding round its edge (`trees`: how many clumps,
# from how far out of the edge, and their seed), their crowns over it, and ferns and bushes along the
# edge (`plants`: how many, and their seed); so it shows neither from the ground nor, but straight
# down, from the air.
SKYLIGHT = {"centre": (-143.0, -142.0), "radius": 6.5, "lumps": ((2, 0.025, 4.1), (3, 0.015, 0.9), (5, 0.01, 2.6)),
            "segments": 96, "shaft": 3.8, "dome": 10.5, "floor": -3.0, "seed": 31, "trees": (9, (1.0, 2.5), 141),
            "plants": (28, 151)}
# Ramps up onto the high ground, each from its foot to its top (x, z) and how wide: onto the
# tableland's north side from the waterfall's lowland. The high ground south of the gorge, the spur
# with the cave's skylight, has none: only the stepping stones reach it.
RAMPS = [((-30.0, -238.0), (-68.0, -244.0), 6.0)]
# The bay is a quay, as in the film's frames of it: along its timber wall (the `quay` props, between
# `x`, their planks' sea face 0.9 m past the coast and 7 cm thick) the festival's sand runs level at
# `top` out to `out` metres past the coast, then drops within `drop`, inside the planks, into water
# `foot` deep, the sea floor shelving back to its own over `reach`. Past the timber's ends the drop
# gives way over `ease` metres to a beach, sloping down to the water's surface where the wall's
# middle would be from up to `bank` metres in, and on under it to the wall's foot over up to `under`
# metres, as the raised sand eases into the beach round it over `feather` metres; the water before
# the timber shallows toward the beach's over its last `shoal` metres and on past its ends, so the
# depth, and the surf the game draws from it, change gently along the coast. Two rows of the
# ground's grid bend to run along the drop, the rows round them less over `bend` metres (see
# quay_rows), and the game draws the water's edge along the wall's middle (see quay_info), so sand,
# timber and water meet in clean lines rather than stepping from one sample of a grid to the next.
QUAY = {"x": (-45.85, 45.65), "out": 0.85, "drop": 0.03, "top": 0.5, "foot": -1.6, "reach": 9.0, "ease": 3.0,
        "bank": 3.0, "under": 2.0, "feather": 6.0, "shoal": 12.0, "bend": 12.0}
# Short, wide pillars the jungle all but hides, as in the shot: mesas thick with trees on top,
# swelling into a mound of them (`mound`, 1 for a gentle one). Centre, radii, turn, the top's
# height, seed, mound, and anything of its build to change. The great dome west of the waterfall is,
# as in the shot, a cap of greenery on a tall block of pale stone that shows clear below it. Moved
# with the island as it grew (the dome out of the gorge's way), each as tall over the ground round it
# as before; the dark mound, up onto the tableland, a little smaller and turned along its north side
# so it stands clear of its cliffs.
MESAS = [
    ((-55.0, -150.0), (17.0, 15.5), 0.4, 33.1, 4, 2.6, {"drape": 1.2, "hang": 0.25}),
    ((-38.0, -116.4), (14.5, 13.0), 0.9, 18.2, 15, 1.2),
    ((-127.0, -218.0), (11.0, 9.0), -0.5, 38.0, 16, 2.2),  # the dark mound in the north-west
    ((105.0, -113.5), (16.0, 14.0), -0.5, 19.3, 17, 1.9),  # the bright mound in the east
    ((-90.8, -229.7), (12.0, 11.0), 0.6, 29.4, 18, 1.0),
    ((75.0, -200.5), (13.0, 11.5), 0.1, 11.2, 19, 1.2),
    ((88.0, -72.9), (10.0, 9.0), 1.3, 15.5, 20, 1.0),
    ((-112.5, -70.0), (11.0, 10.0), 0.3, 13.9, 21, 1.0),
    ((-20.0, -175.0), (9.0, 8.0), 0.7, 5.25, 22, 0.8),
]
# Two little white spires poking out of the jungle in the west: centre, radius, top, seed.
NEEDLES = [((-115.4, -117.8), 3.5, 18.8, 23), ((-105.2, -113.5), 3.0, 14.8, 24)]
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
SPIRES = [((-234.3, -139.6), 21, 4), ((-182.1, -220.8), 22, 2), ((-164.7, -56.0), 23, 4), ((112.0, -40.0), 24, 2),
          ((153.0, -96.1), 25, 3), ((148.0, -199.0), 26, 3)]

# The plants (plants.py shapes them): canopy trees grow in clumps, spaced in metres; palms line
# the jungle's edge by the beach and stand here and there among the trees; under them ferns,
# monstera, cycads and the rest crowd the floor as thickly as in the film's jungle, a little closer
# together along paths and edges; the canopy opens into clearings where a noise rises past
# `clearings`.
JUNGLE = {"clump_spacing": 9.5, "trees": (5, 8), "tree_height": (9.0, 15.0), "palm_spacing": 4.5, "palms": 560,
          "understory": (1.25, 1.4), "clearings": 0.8, "big_trees": 12, "big_spacing": 36.0}
# The jungle's outermost metres by the beaches, and those round the village's huts and the
# festival's stalls, are left to palms, as the film's jungle meets its beaches and its village; the
# canopy still runs almost down to the sand, as its aerial shot has it.
EDGE_PALMS = 3.5
PROP_PALMS = 6.0
FIELD_ROW = 2.4         # metres between the fields' rows
BUTTERFLIES = 16        # blue butterflies, each fluttering round a flowering bush
CANOPY_PATCHES = 6      # the canopy and palms are joined into a mesh for each of 6 x 6 patches, near and far
UNDERSTORY_PATCHES = 20  # what grows under them into 20 x 20, small, so the game draws only what is near and in view
# Tufts of grass along the paths' edges, this far apart, and patches of clover beside them, this far
# apart (closer at the feet of trees); their generator's seed.
EDGES = {"tufts": 0.9, "clover": 6.0, "seed": 61}
# How much room each kind of placed prop keeps clear of trees, in metres from its middle.
PROP_ROOM = {"hut_green": 7.0, "hut_warm": 7.0, "hut_plank": 5.5, "beehive": 3.8, "stage": 6.5, "torch": 1.0,
             "stall_pink": 3.2, "stall_purple": 3.2, "stall_orange": 3.2, "stall_blue": 3.2, "stall_red": 3.2,
             "stall_white": 3.2, "arch": 2.5, "banner": 2.0, "bunting_row": 2.0, "bunting_street": 2.0,
             "lanterns": 1.2, "palm": 2.0, "sign": 2.0, "bunting_row_short": 2.0,
             # Under the room the street's stalls keep, so the jungle was planted just as it was
             # before these poles stood along the street.
             "bunting_side": 1.0,
             # 島二郎, the restaurant at the end of the riverside path, and its sign hung over the path.
             "restaurant": 7.5, "sign_hanging": 1.6,
             # The guest houses keep the trees off their roofs; the plants crowd in closer (see
             # GUEST_GREENS). The palisade by the stage.
             "guest_orange": 6.5, "guest_tan": 6.5, "fence": 1.2}
# Plants crowd round the backs of the village's houses, this far from their middles.
HUT_ROOM = {"hut_green": (5.6, 6.6), "hut_warm": (5.6, 6.6), "hut_plank": (4.4, 5.2), "beehive": (3.0, 3.6),
            "stage": (7.0, 8.4)}
# Nothing is planted nearer a beehive hut's middle than this: its eave reaches 2.2 m, a bush 0.7 m
# more, and a palm's trunk leans.
BEEHIVE_CLEAR = 3.0
# A stall's square, as its header boards run round it (half of it), and how far round that nothing
# is planted: the stalls are deeper than when the jungle was planted round them.
STALL_HALF, STALL_CLEAR = 1.25, 0.6


def layout_props():
    """The props placed on the island by the game's layout file: kind, x, z and turn of each."""
    if not os.path.exists(LAYOUT):
        return []
    with open(LAYOUT, encoding="utf-8") as f:
        return [(p["kind"], p["x"], p["z"], p.get("turn", 0.0)) for p in json.load(f).get("props", [])]
def offset_line(points, offset, x_from, x_to, step=4.0):
    """Points `offset` metres to the right (looking along it) of a polyline (x, z), between x_from and
    x_to, every `step` metres or so: the gorge's ledge, along the foot of its south wall."""
    out = []
    for (ax, az), (bx, bz) in zip(points, points[1:]):
        length = math.hypot(bx - ax, bz - az)
        nx, nz = -(bz - az) / length, (bx - ax) / length
        for k in range(max(int(length / step), 1) + 1):
            t = k / max(int(length / step), 1)
            x, z = ax + (bx - ax) * t, az + (bz - az) * t
            if min(x_from, x_to) <= x <= max(x_from, x_to):
                point = (round(x + nx * offset, 2), round(z + nz * offset, 2))
                if not out or out[-1] != point:
                    out.append(point)
    return out


# Packed-earth paths: polylines (x, z) and their width in metres.
PATHS = [
    ([(0.0, -45.0), (0.5, -54.0), (0.0, -62.0)], 3.4),                                  # the street up to the village
    ([(0.0, -91.0), (0.5, -105.0), (0.0, -130.0), (-3.0, -158.0), (-2.2, -175.0), (-7.5, -179.1), (-10.9, -184.1),
      (-13.9, -189.4)], 3.0),                                                           # the village to the waterfall's bank
    ([(0.5, -100.0), (9.0, -103.5), (18.0, -106.0), (26.0, -111.0), (28.5, -119.0), (24.0, -126.0)], 2.0),
                                                                                        # through the guest houses' glade
    ([(14.0, -1.0), (38.0, -8.0), (58.0, -16.0), (74.0, -24.0)], 2.6),                  # the plaza to the night beach
    ([(15.0, -74.0), (22.0, -56.0), (34.0, -34.0), (40.0, -14.0)], 2.4),                # the village down to the beach
    ([(-2.2, -175.0), (8.0, -180.0), (17.0, -185.5), (24.7, -190.7), (30.5, -198.0), (27.5, -208.0), (21.0, -219.0),
      (22.0, -232.0), (25.0, -250.0), (27.0, -266.4)], 2.2),                            # past the waterfall to the sea cliffs
    ([(-13.9, -189.4), (-25.0, -199.0), (-52.0, -201.0), (-70.0, -195.0)]
     + offset_line(GORGE["line"], -(GORGE["water"] + GORGE["ledge"][1] / 2), -76.0, -142.0)
     + [(-152.0, -170.5), (-163.0, -165.5), (-171.5, -159.0)], 2.0),                    # down the gorge to the restaurant
    ([(-30.0, -238.0), (-68.0, -244.0), (-72.0, -226.0), (-84.0, -217.5), (-102.6, -210.0)], 2.2),
                                                                                        # up onto the tableland, to the stones
]
# The paths as trodden, not ruled, as the film's jungle paths are (`jungle 6`): each of PATHS rounded
# at its corners and wandering a little from side to side (`wander`: how far, a share of its width, in
# waves about `wander_len` metres long), swelling and narrowing (`swell`: its width's range, over about
# `swell_len` metres), its edges ragged (`ragged` metres, `ragged_len` fine) and narrowing over its last
# `taper` metres where it ends. The planting keeps to PATHS' own lines, so the jungle grows as it did;
# only what would stand on a path as trodden is left out (see keep_out), and the tufts and the clover
# along the paths' edges follow the edges as trodden.
PATH_WALK = {"wander": 0.4, "wander_len": 26.0, "swell": (0.82, 1.1), "swell_len": 11.0, "ragged": 0.22,
             "ragged_len": 1.4, "taper": 5.0, "seed": 66}
PATH_RASTER = 0.25     # metres between the samples of the trodden paths' field (see path_field)

COLOURS = {k: np.array(L.hex_color(v)[:3]) for k, v in {
    "sand": "#F0C28B",
    "sandPatch": "#E3A770",
    "wetSand": "#D9A774",
    "seaFloor": "#E2C08F",
    "grass": "#84C557",
    "grassDark": "#6CB048",
    "clover": "#A5D873",
    "path": "#DEAD72",
    "pathWorn": "#E8C28E",
    "pathEdge": "#C9975F",
    "plaza": "#ECC795",
    "earth": "#DDB27C",
    "soil": "#A9744E",
    "crop": "#7DBE4C",
    "rock": "#ADA69B",
    "rockDark": "#8F887D",
    "bankEarth": "#86643F",
    "bankMoss": "#5F9B43",
    "pebble": "#CBC8BE",
    "pebbleCool": "#B6BCBC",
    "pebbleWarm": "#D3C7B2",
}.items()}


# ---------------------------------------------------------------------------- shapes
def smoothstep(a, b, x):
    t = np.clip((x - a) / (b - a), 0.0, 1.0)
    return t * t * (3.0 - 2.0 * t)


def smooth_min(a, b, k):
    """The lesser of a and b, rounded off where they come within k of each other."""
    m = np.maximum(k - np.abs(a - b), 0.0) / k
    return np.minimum(a, b) - 0.25 * k * m * m


def smooth_max(a, b, k):
    """The greater of a and b, rounded off where they come within k of each other."""
    m = np.maximum(k - np.abs(a - b), 0.0) / k
    return np.maximum(a, b) + 0.25 * k * m * m


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


def path_waves(s, metres, phases):
    """Slow waves along a path (`s`: how many metres along it), -1 to 1, about `metres` long."""
    return sum(a * np.sin(s * (2.0 * math.pi / metres) * (1.0 + 0.73 * k) + phase)
               for k, (a, phase) in enumerate(zip((1.0, 0.55, 0.3), phases))) / 1.85


_WALKED = []


def walked_paths():
    """The paths as trodden (see PATH_WALK): for each of PATHS, the points of its line (x and z arrays),
    rounded at its corners, every half metre along it and moved across it as it wanders, and its half
    width at each."""
    if not _WALKED:
        w = PATH_WALK
        for n, (points, width) in enumerate(PATHS):
            p = np.asarray(points, dtype=float)
            for _ in range(3):
                cut = [p[0]]
                for a, b in zip(p[:-1], p[1:]):
                    cut += [0.75 * a + 0.25 * b, 0.25 * a + 0.75 * b]
                p = np.array(cut + [p[-1]])
            run = np.concatenate([[0.0], np.cumsum(np.hypot(*np.diff(p, axis=0).T))])
            s = np.append(np.arange(0.0, run[-1], 0.5), run[-1])
            x, z = np.interp(s, run, p[:, 0]), np.interp(s, run, p[:, 1])
            tx, tz = np.gradient(x), np.gradient(z)
            length = np.hypot(tx, tz) + 1e-9
            phases = np.random.default_rng(w["seed"] + n).uniform(0.0, 2.0 * math.pi, 6)
            # Where it ends it keeps to its line, so it meets what it leads to.
            ends = np.minimum(s, run[-1] - s)
            across = w["wander"] * width * path_waves(s, w["wander_len"], phases[:3]) * smoothstep(0.0, 8.0, ends)
            lo, hi = w["swell"]
            half = 0.56 * width * (lo + (hi - lo) * (0.5 + 0.5 * path_waves(s, w["swell_len"], phases[3:])))
            half = half * (0.5 + 0.5 * smoothstep(0.0, w["taper"], ends))
            _WALKED.append((x - tz / length * across, z + tx / length * across, half))
    return _WALKED


_PATH_FIELD = []


def path_field(x, z):
    """How far (x, z) lies outside the edge of the nearest path as trodden, in metres (less than 0 on
    it), its edge a little ragged: from the distances worked out once every PATH_RASTER metres over the
    map, near the paths (see walked_paths)."""
    if not _PATH_FIELD:
        n = int(round(SIZE / PATH_RASTER)) + 1
        x0, z0 = CENTRE[0] - SIZE / 2, CENTRE[1] - SIZE / 2
        field = np.full((n, n), 50.0)
        for px, pz, half in walked_paths():
            for k in range(len(px) - 1):
                ax, az, bx, bz, h0, h1 = px[k], pz[k], px[k + 1], pz[k + 1], half[k], half[k + 1]
                reach = max(h0, h1) + 6.0
                i0 = max(int((min(ax, bx) - reach - x0) / PATH_RASTER), 0)
                i1 = min(int((max(ax, bx) + reach - x0) / PATH_RASTER) + 2, n)
                j0 = max(int((min(az, bz) - reach - z0) / PATH_RASTER), 0)
                j1 = min(int((max(az, bz) + reach - z0) / PATH_RASTER) + 2, n)
                if i0 >= i1 or j0 >= j1:
                    continue
                gx, gz = np.meshgrid(x0 + np.arange(i0, i1) * PATH_RASTER, z0 + np.arange(j0, j1) * PATH_RASTER)
                vx, vz = bx - ax, bz - az
                t = np.clip(((gx - ax) * vx + (gz - az) * vz) / max(vx * vx + vz * vz, 1e-9), 0.0, 1.0)
                d = np.hypot(gx - ax - t * vx, gz - az - t * vz) - (h0 + (h1 - h0) * t)
                field[j0:j1, i0:i1] = np.minimum(field[j0:j1, i0:i1], d)
        _PATH_FIELD.append((field, x0, z0, n))
    field, x0, z0, n = _PATH_FIELD[0]
    x, z = np.asarray(x, dtype=float), np.asarray(z, dtype=float)
    fx = np.clip((x - x0) / PATH_RASTER, 0.0, n - 1.001)
    fz = np.clip((z - z0) / PATH_RASTER, 0.0, n - 1.001)
    i, j = np.floor(fx).astype(int), np.floor(fz).astype(int)
    u, v = fx - i, fz - j
    d = ((field[j, i] * (1.0 - u) + field[j, i + 1] * u) * (1.0 - v)
         + (field[j + 1, i] * (1.0 - u) + field[j + 1, i + 1] * u) * v)
    return d + PATH_WALK["ragged"] * noise(x, z, PATH_WALK["ragged_len"], PATH_WALK["seed"] + 0.5)


def coast_radius(phi):
    """How far the coast is from its centre in the direction phi (see COAST), with the cliffs'
    headland jutting out and their cove cut in (see CLIFFS)."""
    series = COAST["series"]
    radius = series[0] + sum(a * np.cos(k * phi) + b * np.sin(k * phi) for k, (a, b) in enumerate(series[1:], 1))
    quay = smoothstep(55.0, 58.0, np.degrees(phi)) * (1.0 - smoothstep(100.0, 103.0, np.degrees(phi)))
    radius = radius + COAST["wobble"] * noise(60.0 * np.cos(phi), 60.0 * np.sin(phi), 25.0, 5.0) * (1.0 - quay)
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


def cliff_profile(phi, widen=0.0):
    """How much sea cliff the coast has in the direction phi (0 to 1), and the height of the land on
    top of it (see CLIFFS), its rise from the headland to the cliffs' full height spread `widen`
    degrees wider either way."""
    c = CLIFFS
    deg = np.degrees(phi)
    mask = smoothstep(c["start"] - 3.0, c["start"] + 3.0, deg) * (1.0 - smoothstep(c["end"] - 3.0, c["end"] + 3.0, deg))
    rise = smoothstep(c["rise"][0] - widen, c["rise"][1] + widen, deg)
    top = (c["low"] * smoothstep(c["start"], c["west"], deg) + (c["height"] - c["low"]) * rise
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


def stall_backs(x, z, grow=0.0):
    """1 on the festival's back alleys (see BACKS), easing to 0 round them; `grow` widens them."""
    b = BACKS
    out = np.zeros(np.shape(x))
    for centre, (hx, hz) in b["boxes"]:
        out = np.maximum(out, box_mask(x, z, centre, (hx + grow, hz + grow), b["feather"]))
    behind = (FESTIVAL["row"][0] + FESTIVAL["row"][1] * x * x) - z
    near, far = b["rows"]
    off = np.hypot(np.maximum(np.maximum(near - grow - behind, behind - far - grow), 0.0),
                   np.maximum(np.abs(x) - b["rows_half"] - grow, 0.0))
    return np.maximum(out, 1.0 - smoothstep(0.0, b["feather"], off))


def poly_inside(x, z, poly):
    """Whether points (x, z) lie inside a closed polygon of (x, z) points."""
    x, z = np.asarray(x, dtype=float), np.asarray(z, dtype=float)
    inside = np.zeros(np.shape(x), dtype=bool)
    for i in range(len(poly)):
        (ax, az), (bx, bz) = poly[i], poly[(i + 1) % len(poly)]
        if az == bz:
            continue
        inside ^= ((az > z) != (bz > z)) & (x < ax + (z - az) * (bx - ax) / (bz - az))
    return inside


def poly_sdf(x, z, poly):
    """Signed distance to a closed polygon's edge, in metres: positive inside."""
    d = polyline_distance(x, z, list(poly) + [poly[0]])
    return np.where(poly_inside(x, z, poly), d, -d)


def polyline_side(x, z, points):
    """Distance to a polyline, and the same signed: positive to its left looking along it."""
    best = np.full(np.shape(x), 1e9)
    side = np.zeros(np.shape(x))
    for (ax, az), (bx, bz) in zip(points, points[1:]):
        vx, vz = bx - ax, bz - az
        t = np.clip(((x - ax) * vx + (z - az) * vz) / (vx * vx + vz * vz), 0.0, 1.0)
        d = np.hypot(x - (ax + t * vx), z - (az + t * vz))
        # In the game's x-z plane (z south) a negative cross product is to the left.
        left = -np.sign(vx * (z - az) - vz * (x - ax))
        closer = d < best
        best = np.where(closer, d, best)
        side = np.where(closer, left * d, side)
    return best, side


def gorge_across(x, z):
    """Where (x, z) is across the gorge: metres south of its line (its left, looking west), and how
    far outside its walls (negative between them)."""
    d, u = polyline_side(x, z, GORGE["line"])
    return u, d - GORGE["half"]


def gorge_floor(x, u):
    """The gorge's floor at x and u metres south of its line: west of the water's end the river's
    bed, deepest in its middle, shelving to the ledge along the south wall's foot and to the north
    wall's foot under the water; east of it the dry ravine, climbing to the lowland's level."""
    g = GORGE
    w = g["water"]
    ledge, _ = g["ledge"]
    south = g["bed"] + (WATER - 0.7 - g["bed"]) * smoothstep(0.3 * w, w - 0.6, u)
    south = np.where(u < w - 0.6, south, ledge + (WATER - 0.7 - ledge) * (1.0 - smoothstep(w - 0.6, w + 0.3, u)))
    north = g["bed"] + (WATER - 1.2 - g["bed"]) * smoothstep(0.3 * w, g["half"], -u)
    river = np.where(u >= 0.0, south, north)
    ravine = ledge + (LOWLAND["height"] - ledge) * smoothstep(g["from"], g["head"], x)
    wet = 1.0 - smoothstep(g["from"] - 6.0, g["from"], x)
    return ravine + (river - ravine) * wet


def gorge_point(x):
    """The gorge's line where it passes x: the point (x, z), the way along it (westward) and the way
    across it to the south, as unit (x, z) vectors."""
    for (ax, az), (bx, bz) in zip(GORGE["line"], GORGE["line"][1:]):
        if bx <= x <= ax:
            t = (x - ax) / (bx - ax)
            length = math.hypot(bx - ax, bz - az)
            d = ((bx - ax) / length, (bz - az) / length)
            return (x, az + (bz - az) * t), d, (d[1], -d[0])
    raise ValueError(f"x {x} is off the gorge's line")


def rectangle_outline(along, across, half_along, half_across, count=32):
    """A rectangle's outline from its middle (radii at `count` even angles from east toward south,
    as the game's outlineAt reads them), its sides along the unit (x, z) vectors given."""
    out = []
    for k in range(count):
        a = 2.0 * math.pi * k / count
        ux, uz = math.cos(a), math.sin(a)
        p = abs(ux * along[0] + uz * along[1])
        q = abs(ux * across[0] + uz * across[1])
        out.append(round(min(half_along / max(p, 1e-6), half_across / max(q, 1e-6)), 3))
    return out


def stepping_stones():
    """The stepping-stone pillars as rock specs, from the north rim's to the south rim's, and the two
    ledges walked on from the rims onto the rim pillars' tops (pads for the game: middle, outline,
    top)."""
    s = STONES
    (px, pz), d, n = gorge_point(s["x"])
    at = lambda u, v=0.0: (px + n[0] * u + d[0] * v, pz + n[1] * u + d[1] * v)  # noqa: E731
    # The rims' heights a little back from their edges, and a line between them across the river.
    reach = GORGE["half"] + 2.5
    rims = ground(np.array([at(-reach)[0], at(reach)[0]]), np.array([at(-reach)[1], at(reach)[1]]))[0]
    rim_n, rim_s = float(rims[0]), float(rims[1])
    rng = np.random.default_rng(s["seed"])
    specs = []
    places = [(-s["rim"][0], 0.0, None), *zip(s["across"], s["along"], s["rise"]), (s["rim"][1], 0.0, None)]
    for k, (u, v, rise) in enumerate(places):
        if rise is None:
            # Against the cliff, its top level with the rim's.
            top, radii = (rim_n if u < 0.0 else rim_s), s["rim_radii"]
        else:
            top, radii = rim_n + (rim_s - rim_n) * (u + reach) / (2.0 * reach) + rise, s["radii"]
        specs.append({
            "centre": at(u, v), "radii": radii, "turn": rng.uniform(0.0, math.pi), "top": round(top, 3),
            "seed": s["seed"] + k, "segments": 28, "step": 0.9, "facets": 6, "facet_w": 0.3, "flutes": 7,
            "flute_depth": 0.06, "lumps": 0.07, "taper": -0.05, "bulge": 0.03, "ledges": 1, "lean": 0.025,
            "shoulder": 0.03, "tip": 0.1, "crown": False, "drape": 0.35, "wet": WATER, "group": "stones",
            "pillar": True,
        })
        if rise is None and u > 0.0:
            # The south end juts from the cliff over the riverside path, its foot well over the path.
            del specs[-1]["wet"]
            specs[-1]["stand"] = GORGE["ledge"][0] + s["shelf"] + 1.5
            specs[-1]["taper"] = -0.12
    near, far = s["ledge"]
    ledges = []
    for side, top in ((-1.0, rim_n), (1.0, rim_s)):
        cx, cz = at(side * (near + far) / 2.0)
        ledges.append({"centre": [round(cx, 2), round(cz, 2)],
                       "outline": rectangle_outline(d, n, s["ledge_half"], (far - near) / 2.0), "top": round(top, 3)})
    return specs, ledges


def boulder_specs():
    """Rounded boulders along the river's edge below the riverside path, half in the water."""
    b = BOULDERS
    rng = np.random.default_rng(b["seed"])
    specs = []
    x = b["from"] - rng.uniform(0.0, b["gap"][1])
    while x > b["to"]:
        (px, pz), d, n = gorge_point(x)
        r = rng.uniform(*b["radius"])
        u = b["across"] - rng.uniform(0.0, 0.5)
        # Only by the water, clear of the stones' crossing.
        low = float(ground(np.array([px + n[0] * u]), np.array([pz + n[1] * u]))[0][0]) < GORGE["ledge"][0] + 0.3
        if abs(x - STONES["x"]) > b["clear"] and low:
            specs.append({
                "centre": (px + n[0] * u, pz + n[1] * u), "radii": (r, r * rng.uniform(0.7, 0.9)),
                "turn": rng.uniform(0.0, math.pi), "top": round(GORGE["ledge"][0] + rng.uniform(*b["height"]), 3),
                "seed": b["seed"] + len(specs), "segments": 18, "step": 0.25, "facets": 0, "flutes": 3,
                "flute_depth": 0.04, "lumps": 0.18, "taper": 0.2, "bulge": 0.06, "shoulder": 0.55, "tip": 0.92,
                "crown": False, "drape": 0.5, "wet": WATER, "group": "gorge",
            })
        x -= rng.uniform(*b["gap"])
    return specs


def village_mask(x, z):
    """1 on the village's sand (its plaza, its lane, its yard; see VILLAGE), easing to 0 round it."""
    v = VILLAGE
    (px, pz), r = v["plaza"]
    d = np.hypot(x - px, z - pz) - r
    for points, half in v["lanes"]:
        d = np.minimum(d, polyline_distance(x, z, points) - half)
    for (yx, yz), r in v["yards"]:
        d = np.minimum(d, np.hypot(x - yx, z - yz) - r)
    return 1.0 - smoothstep(0.0, v["feather"], d)


def tableland_sdf(x, z, s):
    """How far inside the tableland (x, z) is, in metres (negative outside it): within its outline,
    back from the sea, outside the gorge."""
    t = TABLELAND
    return np.minimum(np.minimum(poly_sdf(x, z, t["outline"]), s - t["coast"]), gorge_across(x, z)[1])


def spur_sdf(x, z):
    """How far inside the spur (x, z) is (negative outside it): within its outline, outside the
    gorge, whose south wall its root forms for a stretch."""
    return np.minimum(poly_sdf(x, z, SPUR["outline"]), gorge_across(x, z)[1])


def cave_rocks():
    """The cave's outcrop, from the sea to the spur's end, as rock specs: the tier its mouth opens in,
    its long side along the face, and the other tiers."""
    mx, mz = CAVE["mouth"]
    a = math.radians(CAVE["facing"])
    back = CAVE["back"]
    radii, top = CAVE["rock"]
    rocks = [dict(CAVE_STONE, **CAVE_GREENS, centre=(mx - math.cos(a) * back, mz - math.sin(a) * back), radii=radii,
                  turn=a + math.pi / 2, top=top, seed=CAVE["seed"],
                  cave=(a, CAVE["half"], CAVE["height"], CAVE["depth"]), tunnel=True, wet=CAVE["floor"])]
    for centre, radii, turn, top, seed, in_sea, greens in CAVE_ROCKS:
        rocks.append(dict(CAVE_STONE, **(CAVE_GREENS if greens else {}), centre=centre, radii=radii, turn=turn,
                          top=top, seed=seed, wet=WATER if in_sea else None))
    return rocks


def in_cave_rocks(x, z):
    """Where (x, z) is against the cave's heap: 1 on the nearest of its rocks' ellipses (their
    radii), less inside one."""
    out = np.full(np.shape(x), np.inf)
    for spec in cave_rocks():
        (cx, cz), (ra, rb), turn = spec["centre"], spec["radii"], spec["turn"]
        u = (x - cx) * math.cos(turn) + (z - cz) * math.sin(turn)
        v = -(x - cx) * math.sin(turn) + (z - cz) * math.cos(turn)
        out = np.minimum(out, (u / ra) ** 2 + (v / rb) ** 2)
    return out


def spur_top(x, z):
    """The spur's top: falling from its root to its west end."""
    (rx, rz), (tx, tz) = SPUR["root"], SPUR["tip"]
    vx, vz = tx - rx, tz - rz
    t = np.clip(((x - rx) * vx + (z - rz) * vz) / (vx * vx + vz * vz), 0.0, 1.0)
    top0, top1 = SPUR["top"]
    return top0 + (top1 - top0) * smoothstep(0.15, 1.0, t) + SPUR["noise"] * noise(x, z, 7.0, 84.0)


_RAMP_ENDS = []


def ramp_ends():
    """Each ramp's height at its foot (the low ground there) and at its top (the high ground)."""
    if not _RAMP_ENDS:
        for (ax, az), (bx, bz), _ in RAMPS:
            h = ground(np.array([ax, bx]), np.array([az, bz]), ramps=False)[0]
            _RAMP_ENDS.append((float(h[0]), float(h[1])))
    return _RAMP_ENDS


def ramp_height(x, z, h):
    """The ground with the ramps laid over it: each climbs evenly from its foot to its top, blending
    into what is beside it."""
    for ((ax, az), (bx, bz), width), (y0, y1) in zip(RAMPS, ramp_ends()):
        vx, vz = bx - ax, bz - az
        length2 = vx * vx + vz * vz
        t = ((x - ax) * vx + (z - az) * vz) / length2
        across = np.abs(-(x - ax) * vz + (z - az) * vx) / math.sqrt(length2)
        w = (1.0 - smoothstep(width / 2 - 1.2, width / 2 + 0.5, across)) * smoothstep(-0.15, 0.0, t) \
            * (1.0 - smoothstep(1.0, 1.15, t))
        h = h + (y0 + (y1 - y0) * np.clip(t, 0.0, 1.0) - h) * w
    return h


def ground(x, z, natural=False, ramps=True, mouth=True):
    """Height of the ground (y) and the masks the painting needs. `natural` leaves out what the
    festival street and the village do to it, `ramps` the ramps up onto the high ground, `mouth` the
    sand levelled before the cave's mouth (see mouth_apron), which the rocks are not built on."""
    x, z = np.asarray(x, dtype=float), np.asarray(z, dtype=float)
    s, phi = coast_distance(x, z)
    m_cliff = cliff_profile(phi)[0]
    beach_w = (beach_width(phi) + 2.0 * noise(x, z, 30.0, 2.0)) * (1.0 - m_cliff)
    # Along the sea cliffs, the true distance to the shore, signed like s (positive inland).
    s_cliff = np.array(s, dtype=float, copy=True)
    by_cliffs = m_cliff > 0.0
    if by_cliffs.any():
        s_cliff[by_cliffs] = np.sign(s[by_cliffs]) * cliff_distance(x[by_cliffs], z[by_cliffs])
    # The cliffs' top rises from the headland to its full height across the back of the cove, and
    # ever more gently inland, so the way past the waterfall can climb it.
    cliff_top = cliff_profile(phi, 22.0 * smoothstep(3.5, 22.0, s_cliff))[1]

    # The sea floor: a gently shelving lagoon, then the reef edge dropping into the deep; deeper at
    # the foot of the sea cliffs.
    t = np.maximum(-s, 0.0)
    lagoon_w = 66.0 + 10.0 * np.sin(2.0 * phi + 0.7)
    sea = WATER - (0.02 * t + 2.0 * smoothstep(0.0, lagoon_w, t)) - 15.0 * smoothstep(lagoon_w, lagoon_w + 18.0, t)
    sea = sea - CLIFFS["deep"] * m_cliff * (1.0 - smoothstep(0.0, 26.0, np.maximum(-s_cliff, 0.0)))

    # The land: a beach rising from the waterline, then the flat lowland, a little uneven.
    b = np.clip(s / np.maximum(beach_w, 1.0), 0.0, 1.0)
    beach = WATER + 0.8 * (1.0 - (1.0 - b) ** 2)
    u = np.maximum(s - beach_w, 0.0)
    low = LOWLAND
    land = beach + (low["height"] - (WATER + 0.8)) * smoothstep(0.0, low["rise"], u)
    land = land + low["noise"] * noise(x, z, 23.0, 3.0) * smoothstep(0.0, low["rise"], u)
    # The sea cliffs: the land rises sheer out of the water to a grassy top a couple of metres in,
    # behind the face the cliffs' rock is built over, then eases down into the jungle inland.
    plateau = cliff_top + 0.5 * noise(x, z, 9.0, 26.0) * smoothstep(3.0, 9.0, s_cliff)
    cliff_land = WATER + (plateau - WATER) * smoothstep(1.3, 2.4, s_cliff)
    hold = 1.0 - smoothstep(CLIFFS["depth"], CLIFFS["depth"] + CLIFFS["ease"], s_cliff)
    land = land + (cliff_land - land) * m_cliff * hold
    h = np.where(s >= 0.0, land, sea)

    # The bay's quay: the festival's sand level out to the timber wall, deep water at its foot,
    # shallowing toward its ends. Past the timber's ends a beach slopes into the water instead, the
    # slope widening fast so no sheer sand stands bare beside the timber, as the raised sand eases
    # into the beach round it.
    q = QUAY
    along = np.maximum(q["x"][0] - x, x - q["x"][1])  # metres past the timber's nearer end, less than 0 alongside it
    beyond = np.maximum(along, 0.0)
    m_quay = (1.0 - smoothstep(0.0, q["feather"], beyond)) * (np.abs(s) < 40.0)
    m_deep = (1.0 - smoothstep(-q["shoal"], q["feather"], along)) * (np.abs(s) < 40.0)
    slope = 1.0 - (1.0 - np.minimum(beyond / q["ease"], 1.0)) ** 2
    line = -q["out"] - q["drop"] / 2.0
    bank_top = -q["out"] + q["bank"] * slope
    foot_at = -q["out"] - q["drop"] - q["under"] * slope
    wall = q["foot"] + (sea - q["foot"]) * smoothstep(-q["out"] - 1.0, -q["out"] - q["reach"], s)
    above = np.minimum(np.maximum(h, q["top"]), WATER + (q["top"] - WATER) * (s - line) / (bank_top - line))
    below = np.maximum(np.minimum(sea, wall), WATER - (WATER - q["foot"]) * (line - s) / (line - foot_at))
    h = h + (np.where(s >= line, above, below) - h) * np.where(s >= line, m_quay, m_deep)
    if mouth:
        h = mouth_apron(x, z, h)

    # The festival's ground is level; so is the village's clearing; the fields are flat.
    inland = smoothstep(0.0, 6.0, s)
    m_plaza = box_mask(x, z, PLAZA["centre"], PLAZA["half"], PLAZA["feather"]) * inland
    m_street = box_mask(x, z, STREET["centre"], STREET["half"], STREET["feather"]) * inland
    m_village = village_mask(x, z)
    if not natural:
        h = h + (FESTIVAL["level"] - h) * festival_level(x, z) * inland
        h = h + (low["height"] + 0.04 * noise(x, z, 9.0, 4.0) - h) * m_village
    m_fields = box_mask(x, z, FIELDS["centre"], FIELDS["half"], FIELDS["feather"]) * inland
    h = h + (FIELDS["height"] - h) * m_fields

    # The gorge's floor, between its walls: the river and its ledge, the ravine at its head.
    across, outside = gorge_across(x, z)
    in_gorge = (1.0 - smoothstep(-1.5, 0.0, outside)) * smoothstep(-2.0, 0.5, s)
    h = h + (gorge_floor(x, across) - h) * in_gorge

    # The high ground: the tableland and the spur standing sheer out of the low ground, climbing to
    # their tops just inside their edges (under the cliff faces built over them).
    e0, e1 = TABLELAND["edge"]
    d_table = tableland_sdf(x, z, s)
    table_top = TABLELAND["top"] + TABLELAND["noise"] * noise(x, z, 17.0, TABLELAND["seed"])
    h = h + (table_top - h) * smoothstep(e0, e1, d_table)
    d_spur = spur_sdf(x, z)
    h = np.maximum(h, h + (spur_top(x, z) - h) * smoothstep(e0, e1, d_spur))
    if not natural and ramps:
        h = ramp_height(x, z, h)

    # The cave's skylight on the spur: the ground runs right to the edge of its opening, which
    # build_mesh cuts out of it. How far outside that edge each point is, for the planting.
    sky = SKYLIGHT
    sky_x, sky_z = x - sky["centre"][0], z - sky["centre"][1]
    out_sky = np.hypot(sky_x, sky_z) - K.skylight_edge(sky["radius"], sky["lumps"], np.arctan2(sky_z, sky_x))

    # The paths, as trodden (see path_field), their edges soft.
    m_path = (1.0 - smoothstep(-0.45, 0.45, path_field(x, z))) * inland

    # The waterfall's pool: a round basin at the foot of its wall of rock, in a gentle hollow whose
    # bank holds its water, easing into the land round it.
    m_pool = np.zeros_like(x)
    m_bank = np.zeros_like(x)
    if not natural:
        r = np.hypot(x - POOL["centre"][0], z - POOL["centre"][1])
        m_bank = 1.0 - smoothstep(POOL["clearing"], POOL["clearing"] + POOL["feather"], r)
        h = h + (POOL["bank"] + 0.05 * noise(x, z, 4.0, 24.0) - h) * m_bank
        m_pool = 1.0 - smoothstep(POOL["radius"] - 2.5, POOL["radius"] + 0.6, r)
        h = h + (POOL["floor"] - h) * m_pool

    masks = {"s": s, "beach_w": beach_w, "village": m_village, "plaza": m_plaza, "street": m_street,
             "festival": np.maximum(m_plaza, m_street), "fields": m_fields, "path": m_path, "pool": m_pool,
             "bank": m_bank, "cliff": m_cliff, "s_cliff": s_cliff, "phi": phi, "backs": stall_backs(x, z) * inland,
             "high": np.maximum(d_table, d_spur), "gorge": in_gorge, "quay": m_quay, "timber": m_quay * (beyond <= 0.0),
             "skylight": out_sky}
    return h, masks


# ---------------------------------------------------------------------------- painting
def paint(x, z, h, masks, normal_y, shade):
    """The ground's colours: sand, wet sand, grass with clover and dark patches, trodden-earth
    paths and village plaza, field rows, the rocks' damp feet, broken ground on steep slopes. Soft
    painted edges, as the film's backgrounds. Also how much of each kind of ground the colours show at
    each point: grass, bare earth (the paths, the village's clearing, the festival's street, steep
    ground) and sand; the rest is fields, the waterfall pool's bank and the rivers' edges. And how
    thickly stones fallen from the rocks lie at each point. The film look paints grass, earth and the
    stones from these (see Island.ts)."""
    shape = x.shape + (3,)
    c = lambda name: np.broadcast_to(COLOURS[name], shape)  # noqa: E731
    grass_k, earth_k, sand_k = (np.broadcast_to(k, shape) for k in np.eye(3))
    s = masks["s"]
    blob = noise(x, z, 9.0, 11.0)
    col = c("sand") * (1.0 - 0.55 * smoothstep(0.35, 1.1, blob))[..., None] \
        + c("sandPatch") * (0.55 * smoothstep(0.35, 1.1, blob))[..., None]
    kind = sand_k.copy()
    # Wet sand and the sea's floor only down by the water: where the spur steps out into the sea its
    # top stays green. Along the quay and the beaches past its timber, where the water's edge is well
    # off the coast's line, the sand runs out to wherever the water is, and a little under it so the
    # water's edge always lies over it, and the sea floor lies under that.
    low = smoothstep(WATER + 1.2, WATER + 0.4, h)
    on_quay = masks["quay"] > 0.0
    dry = np.where(on_quay, h > WATER - 0.15, s > -0.5)
    col = mix(col, c("wetSand"), smoothstep(1.8, 0.4, s) * dry * low)
    col = mix(col, c("seaFloor"), smoothstep(-0.2, -2.0, s) * low * np.where(on_quay, ~dry, True))
    # Inland water (the river down the gorge) over the same sandy floor.
    inland_water = smoothstep(WATER + 0.05, WATER - 0.6, h) * (s > 0.0)

    # Grass beyond the beach, with a hand-painted wavy edge.
    edge = masks["beach_w"] + 1.5 + 2.0 * noise(x, z, 6.0, 12.0)
    m_grass = smoothstep(edge - 0.8, edge + 0.8, s)
    # The high ground's tops are grass however near the sea they come.
    m_grass = np.maximum(m_grass, smoothstep(*TABLELAND["edge"], masks["high"]))
    grass = mix(c("grass"), c("grassDark"), smoothstep(0.2, 0.9, noise(x, z, 14.0, 13.0)))
    grass = mix(grass, c("clover"), smoothstep(0.45, 0.95, noise(x, z, 11.0, 14.0)))
    col = mix(col, grass, m_grass)
    kind = mix(kind, grass_k, m_grass)

    # The festival's plaza and street: sand, then packed sand; the village's clearing and the paths:
    # packed sandy earth as in the film's village, a few patches of deep green grass in it and more
    # creeping in round the clearing's edge.
    t = smoothstep(0.45, 0.8, masks["plaza"])
    col = mix(col, c("sand"), t)
    kind = mix(kind, sand_k, t)
    t = smoothstep(0.45, 0.8, masks["street"])
    col = mix(col, c("plaza"), t)
    kind = mix(kind, earth_k, t)
    patches = smoothstep(0.6, 0.9, noise(x, z, 6.0, 21.0) + 0.9 * smoothstep(0.85, 0.45, masks["village"]))
    earth = mix(c("earth"), mix(c("grassDark"), c("grass"), smoothstep(0.3, 0.9, noise(x, z, 3.0, 22.0))), patches)
    t = smoothstep(0.3, 0.75, masks["village"])
    col = mix(col, earth, t)
    kind = mix(kind, mix(earth_k, grass_k, patches), t)
    # The gorge's dry floor, the riverside path's and the ravine's, is a bank of rounded pebbles, as
    # in the film's frames of it: pale grey stones, some cooler, some warmer, marked as bare ground
    # for the film look to paint each pebble (see GROUND_PAINT in Island.ts, which tells them from
    # sand by their grey).
    pebbles = smoothstep(0.4, 0.9, masks["gorge"]) * smoothstep(WATER + 0.05, WATER + 0.3, h)
    stones = mix(c("pebble"), c("pebbleCool"), smoothstep(0.3, 0.8, noise(x, z, 3.0, 47.0)))
    stones = mix(stones, c("pebbleWarm"), smoothstep(0.45, 0.85, noise(x, z, 5.0, 48.0)) * 0.7)
    col = mix(col, stones, pebbles)
    kind = mix(kind, sand_k, pebbles)
    # The paths: trodden earth, as the film's jungle paths are (`jungle 6`), worn paler down the middle,
    # darker toward the edges, where the grass creeps in over them in tufts. They are trodden only off
    # the sand and the pebbles: where one crosses the beach, the beach stays plain sand, as the film's
    # beaches are, and the path begins where the grass does.
    on = masks["path"] * m_grass * (1.0 - pebbles)
    worn = smoothstep(0.75, 1.0, masks["path"]) * smoothstep(-0.5, 0.5, noise(x, z, 2.2, 69.0))
    trodden = mix(mix(c("pathEdge"), c("path"), smoothstep(0.15, 0.75, masks["path"])), c("pathWorn"), 0.65 * worn)
    on = on * (1.0 - smoothstep(0.2, 0.75, noise(x, z, 0.9, 70.0)) * (1.0 - smoothstep(0.4, 0.75, masks["path"])))
    col = mix(col, trodden, on)
    kind = mix(kind, earth_k, on)
    # The festival's back alleys behind its stalls: packed sand, as its street.
    backs = smoothstep(0.3, 0.7, masks.get("backs", np.zeros_like(s)))
    col = mix(col, c("plaza"), backs)
    kind = mix(kind, earth_k, backs)

    # The river's floor and the wet sand at its edges, along the gorge.
    wet_edge = smoothstep(WATER + 0.55, WATER + 0.12, h) * (s > 0.0) * (1.0 - inland_water)
    col = mix(col, c("wetSand"), wet_edge)
    col = mix(col, c("seaFloor"), inland_water)
    kind = kind * (1.0 - np.maximum(inland_water, wet_edge))[..., None]

    # Fields: rows of crops on dark soil.
    rows = 0.5 + 0.5 * np.cos((x - FIELDS["centre"][0]) * (2.0 * math.pi / FIELD_ROW))
    field = mix(c("soil"), c("crop"), smoothstep(0.45, 0.65, rows))
    t = smoothstep(0.6, 0.9, masks["fields"])
    col = mix(col, field, t)
    kind = kind * (1.0 - t)[..., None]

    # The waterfall pool's bank: dark earth with patches of moss, down to the water, as in the film's
    # frame.
    bank = mix(c("bankEarth"), c("bankMoss"), smoothstep(0.15, 0.8, noise(x, z, 2.2, 23.0)))
    bank = mix(bank, c("grassDark"), smoothstep(POOL["level"] + 1.2, POOL["level"] + 2.6, h) * 0.6)
    near = 1.0 - smoothstep(POOL["clearing"] - 1.0, POOL["clearing"] + 3.0,
                            np.hypot(x - POOL["centre"][0], z - POOL["centre"][1]) + 1.5 * noise(x, z, 3.0, 25.0))
    t = near * smoothstep(0.2, 0.7, masks["bank"])
    col = mix(col, bank, t)
    kind = kind * (1.0 - t)[..., None]

    # Shade under the jungle's trees: the floor dark olive and earthy, the clover gone. A path through
    # it stays a path, only shaded, as the film's do: painted over with the floor, it had ended in a
    # point wherever the trees' shade crossed it.
    if "shade" in masks:
        floor = mix(c("grassDark") * 0.74, c("bankEarth"), 0.3 + 0.3 * smoothstep(-0.4, 0.6, noise(x, z, 3.5, 41.0)))
        col = mix(col, floor, 0.85 * masks["shade"] * m_grass * (1.0 - backs) * (1.0 - on))
        col = col * (1.0 - 0.22 * masks["shade"] * on)[..., None]

    # The rocks' feet: the ground runs right up to them, as in the film's frames (its grass and ferns to
    # the foot of its cliffs, `parkour stone landmark 3`; its sand to the cave's rock, `cave entrance 3`),
    # darker close in, ragged, damp: moss in the grass, grit in the sand. Stones fallen from them lie
    # about on it, thickest close in and in clusters, a few further out, which the film look paints over
    # it (see screeStones in Island.ts). It had been a flat ring of pale grey round every rock.
    above = h > WATER + 0.1
    foot = masks["rubble"] * above
    near = smoothstep(0.3, 0.95, foot + 0.2 * noise(x, z, 1.7, 62.0))
    moss = mix(c("grassDark") * 0.82, c("bankMoss"), smoothstep(-0.3, 0.6, noise(x, z, 2.3, 63.0)))
    damp = mix(col * np.array([0.74, 0.73, 0.75]), moss, 0.6 * m_grass * (1.0 - on))
    col = mix(col, damp, 0.85 * near)
    clusters = 0.25 + 0.75 * smoothstep(-0.45, 0.55, noise(x, z, 3.2, 64.0))
    scree = smoothstep(0.08, 0.8, foot) * clusters
    # Bare ground on any steep slope, under the high ground's cliffs and down the gorge's walls: broken
    # stone, the rock's own greys, brushed as the paths' earth is rather than a flat grey, stones lying
    # on it. (Not on the quay: its only steep ground is the drop its timber hides, and the sand by its
    # ends.)
    slope = mix(c("rock"), c("rockDark"), 0.35 + 0.65 * smoothstep(-0.3, 0.6, noise(x, z, 2.6, 65.0)))
    t = smoothstep(0.8, 0.62, normal_y) * (s > -1.0) * above * (1.0 - masks["quay"])
    col = mix(col, slope, t)
    kind = mix(kind, earth_k * 0.8, t)
    scree = np.maximum(scree, 0.6 * t * clusters) * (1.0 - masks["quay"])

    return np.clip(col * shade[..., None], 0.0, 1.0), np.clip(kind, 0.0, 1.0), np.clip(scree, 0.0, 1.0)


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


def quay_line(x, at):
    """Where the line `at` metres from the coast (negative past it) crosses each x along the bay (z),
    found by halving: the coast runs across the bay from west to east, the sea to the south."""
    x = np.asarray(x, dtype=float)
    lo, hi = np.full(x.shape, -30.0), np.full(x.shape, 30.0)
    for _ in range(40):
        mid = (lo + hi) / 2.0
        inland = coast_distance(x, mid)[0] > at
        lo, hi = np.where(inland, mid, lo), np.where(inland, hi, mid)
    return (lo + hi) / 2.0


def quay_rows(gx, gz):
    """The ground's grid (see grid) with two of its rows bent along the quay: one along the sand's
    edge, the next along the foot of its drop (see QUAY), so the ground drops from the one to the
    other in one clean line along the timber, instead of in steps from row to row of the grid as the
    coast crosses them. The rows round them bend less the further off they are, over QUAY["bend"]
    metres, and the bend eases out over 6 m beyond the quay's ends."""
    q = QUAY
    xs, zs = gx[0], gz[:, 0]
    reach = (q["x"][0] - q["feather"], q["x"][1] + q["feather"])
    w = smoothstep(reach[0] - 6.0, reach[0], xs) * (1.0 - smoothstep(reach[1], reach[1] + 6.0, xs))
    edge, foot = quay_line(xs, -q["out"]), quay_line(xs, -q["out"] - q["drop"])
    # The row that runs along the edge: the one that needs bending least to reach it.
    k = int(np.argmin(np.abs(zs - (edge[w > 0].min() + edge[w > 0].max()) / 2.0)))
    up, down = (edge - zs[k]) * w, (foot - zs[k + 1]) * w
    inland = 1.0 - smoothstep(0.0, q["bend"], zs[k] - zs)
    seaward = 1.0 - smoothstep(0.0, q["bend"], zs - zs[k + 1])
    bent = gz + np.where((zs <= zs[k])[:, None], inland[:, None] * up, seaward[:, None] * down)
    assert (np.diff(bent, axis=0) > 0.0).all(), "the quay's rows fold over"
    return bent


def quay_info():
    """The quay, for the game: the line its water's edge runs along, the middle of the drop inside
    the timber's planks and on past the timber's ends (points x, z evenly about a metre apart from
    its west end to its east, the feathers included), where the timber stands (`ends`, x), and how
    far beyond them the quay eases into the beach round it.
    The game draws the water's edge and its surf along this line (see quayFloor in Island.ts)."""
    q = QUAY
    west, east = q["x"][0] - q["feather"], q["x"][1] + q["feather"]
    xs = np.linspace(west, east, int(math.ceil(east - west)) + 1)
    zs = quay_line(xs, -q["out"] - q["drop"] / 2.0)
    return {"line": [[round(float(x), 3), round(float(z), 4)] for x, z in zip(xs, zs)],
            "ends": list(q["x"]), "feather": q["feather"]}


def build_mesh(collection, air):
    """The ground as one mesh: a 1 m grid, two of its rows bent along the quay's drop (see
    quay_rows), simplified to the triangle budget, mapped from above; the cave's skylight a hole in
    it, and none of it inside the cave (`air`, see cave.Air), where it runs under the outcrop and
    into the spur."""
    n = int(SIZE / STEP) + 1
    gx, gz = grid(n, SIZE)
    gz = mouth_rows(gx, quay_rows(gx, gz))
    h, masks = ground(gx, gz)
    bm = bmesh.new()
    index = bm.verts.layers.int.new("grid")
    verts = [bm.verts.new((float(gx[j, i]), float(-gz[j, i]), float(h[j, i]))) for j in range(n) for i in range(n)]
    for k, v in enumerate(verts):
        v[index] = k
    for j in range(n - 1):
        for i in range(n - 1):
            a, b = j * n + i, j * n + i + 1
            c, d = (j + 1) * n + i + 1, (j + 1) * n + i
            bm.faces.new((verts[a], verts[d], verts[c], verts[b]))
    # Inside the cave: under the outcrop's rock the ground would show through its floor, and where the
    # spur rises it would cross the passage. Along the mouth's sill only the squares whose middle is
    # inside go, so the ground's edge is the row laid on the sill (see mouth_rows).
    def at_sill(x, z):
        ahead, beside = sill_frame(x, z)
        return abs(float(ahead)) < 1.2 and float(beside) < 0.6

    print(f"CAVE cut {air.cut(bm, 0.15, bounds=CV.BOUNDS, plain=at_sill)} faces of the ground")
    # The cave's skylight: the grid's squares near it give way to a band of ground filled in from
    # their ragged edge to the opening's, a smooth curve at the points round it where the lip of
    # stone round it is built (see karst.skylight), which covers the cut.
    sky = SKYLIGHT
    doomed = {f for k in np.nonzero(masks["skylight"].ravel() < 0.6)[0] for f in verts[k].link_faces}
    near = {v for f in doomed for v in f.verts}
    bmesh.ops.delete(bm, geom=list(doomed), context="FACES")
    ragged = list({e for v in near if v.is_valid for e in v.link_edges if e.is_boundary})
    sx, sz = sky["centre"]
    a = np.linspace(0.0, 2.0 * math.pi, sky["segments"], endpoint=False)
    r = K.skylight_edge(sky["radius"], sky["lumps"], a)
    ex, ez = sx + r * np.cos(a), sz + r * np.sin(a)
    eh = ground(ex, ez)[0]
    ring = [bm.verts.new((float(ex[k]), float(-ez[k]), float(eh[k]))) for k in range(len(a))]
    for v in ring:
        v[index] = -1
    edges = [bm.edges.new((ring[k], ring[(k + 1) % len(ring)])) for k in range(len(ring))]
    bmesh.ops.triangle_fill(bm, use_beauty=True, use_dissolve=False, edges=ragged + edges, normal=Vector((0.0, 0.0, 1.0)))
    tris = sum(len(f.verts) - 2 for f in bm.faces)
    # Ground right at the water's edge, the sea's or the pool's, keeps its detail, so the pen's
    # waterline runs smooth.
    near_sea = 1.0 - smoothstep(0.1, 0.35, np.abs(h - WATER))
    pool_r = np.hypot(gx - POOL["centre"][0], gz - POOL["centre"][1])
    near_pool = (1.0 - smoothstep(0.1, 0.35, np.abs(h - POOL["level"]))) * (pool_r < POOL["radius"] + 4.0)
    # And at the high ground's edge, where it climbs under its cliffs, and round the cave's skylight,
    # where the lip of stone follows the ground.
    near_high = 1.0 - smoothstep(3.0, 4.5, np.abs(masks["high"]))
    near_sky = 1.0 - smoothstep(2.5, 3.5, masks["skylight"])
    # And along the quay, where its two rows drop the sand into the water in one clean line, and before
    # the cave's mouth, where the ground's edge lies along its sill.
    near_quay = (masks["quay"] > 0.0) * (1.0 - smoothstep(1.5, 2.5, np.abs(masks["s"] + QUAY["out"])))
    ahead, beside = sill_frame(gx, gz)
    near_mouth = 1.0 - smoothstep(2.5, 3.5, np.maximum(np.abs(ahead), beside))
    weights = np.maximum.reduce([near_sea, near_pool, near_high, near_sky, near_quay, near_mouth]).ravel()
    keep = [float(weights[v[index]]) if v[index] >= 0 else 1.0 for v in bm.verts]
    bm.verts.layers.int.remove(index)
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


def predicted(q):
    """Each sample of a grid as its neighbours predict it, west plus north less north-west (the first
    row from the west alone, the first column from the north alone, the first sample 0), as the game
    undoes it (unpredict in src/world/Island.ts)."""
    p = np.zeros_like(q)
    p[0, 1:] = q[0, :-1]
    p[1:, 0] = q[:-1, 0]
    p[1:, 1:] = q[1:, :-1] + q[:-1, 1:] - q[:-1, :-1]
    return p


def sample_heights(obj, n):
    """The finished ground's height under each point of an n x n grid, by casting rays down; in the
    cave's skylight, where the ground is cut away, the height it would have there (the game keeps
    walkers out of the opening, and the sea out from under it)."""
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    bvh = BVHTree.FromBMesh(bm)
    gx, gz = grid(n, SIZE)
    out = np.zeros((n, n))
    for j in range(n):
        for i in range(n):
            hit, _, _, _ = bvh.ray_cast(Vector((float(gx[j, i]), float(-gz[j, i]), 500.0)), Vector((0, 0, -1)))
            out[j, i] = hit.z if hit is not None else np.nan
    bm.free()
    miss = np.isnan(out)
    if miss.any():
        out[miss] = ground(gx[miss], gz[miss])[0]
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
    """The ground's height as the rocks stand on it: without the sand levelled before the cave's
    mouth, which is laid to the mouth's rock (see mouth_apron)."""
    return ground(np.asarray(x, dtype=float), np.asarray(z, dtype=float), mouth=False)[0]


_MOUTH = []


def cave_mouth():
    """The rock the cave's mouth opens in (see cave_rocks), built once, and its sill: the foot of the
    arch (x, z points from one side to the other) and its height. None while the rock is being built,
    on the plain ground (see ground_height)."""
    if not _MOUTH:
        _MOUTH.append(None)
        rock = K.Rock(next(s for s in cave_rocks() if s.get("tunnel")), ground_height)
        rock.build()
        loop = np.asarray(rock.mouth_loop, dtype=float)
        foot = loop[loop[:, 1] < loop[:, 1].min() + 0.01]
        a = math.radians(CAVE["facing"])
        order = np.argsort(foot[:, 0] * -math.sin(a) + foot[:, 2] * math.cos(a))
        _MOUTH[0] = (rock, foot[order][:, [0, 2]], float(loop[:, 1].min()))
    return _MOUTH[0]


def sill_frame(x, z):
    """Where (x, z) lies from the cave mouth's sill: how far out from it (less than 0 under the arch)
    and how far past its ends to either side (0 between them)."""
    _, sill, _ = cave_mouth()
    a, b = sill[0], sill[-1]
    span = float(np.hypot(*(b - a)))
    along = (b - a) / span
    out = np.array([along[1], -along[0]])
    if out @ np.array([math.cos(math.radians(CAVE["facing"])), math.sin(math.radians(CAVE["facing"]))]) < 0.0:
        out = -out
    rx, rz = np.asarray(x, dtype=float) - a[0], np.asarray(z, dtype=float) - a[1]
    t = rx * along[0] + rz * along[1]
    return rx * out[0] + rz * out[1], np.maximum(np.maximum(-t, t - span), 0.0)


def mouth_apron(x, z, h):
    """The sand before the cave's mouth, laid level with its sill out to `apron`'s first metres from it
    and its second past the sill's ends, easing into the beach round it over its third (any higher
    ground kept from a little way out); under the arch, where the cave's own floor lies over it, a
    little lower, out of the floor's way (see CAVE)."""
    if cave_mouth() is None:
        return h
    ahead, beside = sill_frame(x, z)
    flat, wide, ease = CAVE["apron"]
    level = cave_mouth()[2] - 0.004
    under = level - 0.06 * smoothstep(0.0, 0.4, -ahead)
    before = level + np.maximum(h - level, 0.0) * smoothstep(0.0, 0.3, ahead)
    m = ((1.0 - smoothstep(flat, flat + ease, ahead)) * (1.0 - smoothstep(wide, wide + ease, beside))
         * smoothstep(-2.0, -1.0, ahead))
    return h + (np.where(ahead < 0.0, under, before) - h) * m


def mouth_rows(gx, gz):
    """The ground's grid with a row bent onto the cave mouth's sill, so the ground's edge, where the
    cave is cut out of it, lies along the sill and meets the cave's floor there (see build_mesh); the
    rows round it bend less the further off they are, over 3 m, and the bend eases out over 2 m past
    the sill's ends."""
    _, sill, _ = cave_mouth()
    order = np.argsort(sill[:, 0])
    sx, sz = sill[order, 0], sill[order, 1]
    xs, zs = gx[0], gz[:, 0]
    w = smoothstep(sx[0] - 2.0, sx[0], xs) * (1.0 - smoothstep(sx[-1], sx[-1] + 2.0, xs))
    k = int(np.argmin(np.abs(zs - sz.mean())))
    shift = (np.interp(xs, sx, sz) - zs[k]) * w
    bent = gz + (1.0 - smoothstep(0.0, 3.0, np.abs(zs - zs[k])))[:, None] * shift[None, :]
    assert (np.diff(bent, axis=0) > 0.0).all(), "the cave mouth's rows fold over"
    return bent


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
    for centre, radii, turn, top, seed, mound, *changes in MESAS:
        rng = np.random.default_rng(seed + 500)
        spec = {
            "centre": centre, "radii": radii, "turn": turn, "top": top, "seed": seed, "segments": 32,
            "step": 2.5, "facets": int(rng.integers(5, 8)), "flutes": int(rng.integers(7, 10)), "lumps": 0.09,
            "taper": rng.uniform(0.04, 0.12), "bulge": rng.uniform(0.0, 0.05), "ledges": 1, "shoulder": 0.16,
            "rim": 0.1, "drape": 3.2, "mound": mound, "hang": 0.75, "group": group(centre[0]),
        }
        spec.update(*changes)
        specs.append(spec)
    # The waterfall's wall of rock: a long, low mesa of mossy stone split into upright slabs, with
    # finer rings round the notch its water pours from and its foot dark where the pool laps.
    specs.append({
        "centre": FALL["centre"], "radii": FALL["radii"], "turn": FALL["turn"], "top": FALL["top"],
        "seed": FALL["seed"], "segments": 96, "step": 1.2, "facets": 16, "facet_w": 0.85, "flutes": 20,
        "flute_depth": 0.05, "lumps": 0.09, "taper": 0.06, "bulge": 0.024, "ledges": 1, "shoulder": 0.16, "rim": 0.1,
        "drape": 4.2, "mound": 1.0, "hang": 0.75, "notch": FALL["notch"], "wet": POOL["level"], "stone": "mossy",
        "group": "middle",
    })
    # The forbidden cave's heap of rock, from the sea to the spur's end, its mouth in the middle.
    specs.extend(cave_rocks())
    # The stepping-stone pillars across the gorge's river, and the boulders along its edge below the
    # riverside path.
    specs.extend(stepping_stones()[0])
    specs.extend(boulder_specs())
    for centre, r, top, seed in NEEDLES:
        specs.append({
            "centre": centre, "radii": (r, r * 0.85), "turn": 0.4, "top": top, "seed": seed, "segments": 14,
            "step": 1.5, "facets": 5, "facet_w": 0.7, "flutes": 5, "lumps": 0.1, "taper": 0.4, "bulge": 0.0,
            "shoulder": 0.35, "tip": 0.85, "crown": False, "moss": False, "group": group(centre[0]),
        })
    specs.extend(dict(r, group="headland") for r in HEADLAND_ROCKS)
    # The sea stack off the cliffs' headland and the smaller rock beside it: bedded sandstone like the
    # cliffs, stepping in as it rises, bare of plants.
    # The sea stacks are rounded and lumpy like the film's, a tooth of pale stone wider at its foot.
    for k, (centre, radii, turn, height, seed) in enumerate(STACKS):
        big = k == 0
        specs.append({
            "centre": centre, "radii": radii, "turn": turn, "top": WATER + height, "seed": seed, "segments": 32,
            "step": 0.7, "facets": 0, "flutes": 3, "flute_depth": 0.09, "lumps": 0.24,
            "taper": 0.42 if big else 0.3, "bulge": 0.08, "lean": 0.1, "ledges": 1 if big else 0, "shoulder": 0.3,
            "tip": 0.62, "rim": 0.3, "strata": 0.7, "stone": "sandstone", "crown": False, "moss": False, "wet": WATER,
            "group": "cliffs",
        })
    # Rocks on the waterfall pool's banks: a leaning mossy slab and a stump, turned with the view.
    for k, (across, toward, radii, turn, height, seed) in enumerate(POOL_ROCKS):
        slab = k == 0
        specs.append({
            "centre": pool_spot(across, toward), "radii": radii, "turn": turn + math.radians(POOL["view"] + 90.0),
            "height": height, "seed": seed, "segments": 14, "step": 0.4, "facets": 5 if slab else 6,
            "facet_w": 0.9 if slab else 0.7, "flutes": 3, "flute_depth": 0.05, "lumps": 0.12, "taper": 0.2, "bulge": 0.0,
            "lean": 0.25 if slab else 0.05, "shoulder": 0.4, "tip": 0.55, "rim": 0.25, "flat": slab, "crown": False,
            "drape": 4.5 if slab else 1.2, "group": "middle",
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
    """How near a rock's foot: 1 against it, easing raggedly to 0 a couple of metres out, where the
    ground is damp and stones fallen from it lie (see paint)."""
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


def zero_lines(xs, zs, f):
    """The lines where a field on a grid (rows by z) crosses zero, as polylines of (x, z) points."""
    above = f > 0.0
    segs = []

    def cross(p, q):
        a, b = f[p], f[q]
        t = a / (a - b)
        return (round(float(xs[p[1]] + (xs[q[1]] - xs[p[1]]) * t), 5), round(float(zs[p[0]] + (zs[q[0]] - zs[p[0]]) * t), 5))

    corner = above[:-1, :-1]
    for j, i in np.argwhere((corner != above[1:, :-1]) | (corner != above[:-1, 1:]) | (corner != above[1:, 1:])):
        c = [(j, i), (j, i + 1), (j + 1, i + 1), (j + 1, i)]
        points = [cross(c[k], c[(k + 1) % 4]) for k in range(4) if above[c[k]] != above[c[(k + 1) % 4]]]
        segs.extend(zip(points[0::2], points[1::2]))
    ends = {}
    for k, (a, b) in enumerate(segs):
        ends.setdefault(a, []).append(k)
        ends.setdefault(b, []).append(k)
    used, lines = set(), []
    for k in range(len(segs)):
        if k in used:
            continue
        used.add(k)
        line = list(segs[k])
        for forward in (True, False):
            while True:
                tip = line[-1] if forward else line[0]
                nxt = [m for m in ends.get(tip, []) if m not in used]
                if not nxt:
                    break
                used.add(nxt[0])
                a, b = segs[nxt[0]]
                other = b if a == tip else a
                if forward:
                    line.append(other)
                else:
                    line.insert(0, other)
        lines.append(line)
    return lines


def high_field(x, z):
    """How far inside the high ground (x, z) is: the tableland or the spur (negative outside)."""
    s = coast_distance(x, z)[0]
    return np.maximum(tableland_sdf(x, z, s), spur_sdf(x, z))


def high_edges(step=0.5, column=1.6):
    """The high ground's edge, where the tableland, its gorge and the spur stand up sheer, as runs of
    points (x, z) every `column` metres with their outward normals, the height of the top behind them
    and of the ground in front: all of it but where a ramp climbs it and where the cave's heap of
    rock stands against the spur's end."""
    xs = np.arange(-250.0, -10.0, step)
    zs = np.arange(-320.0, -60.0, step)
    gx, gz = np.meshgrid(xs, zs)
    runs = []
    for line in zero_lines(xs, zs, high_field(gx, gz)):
        pts = np.array(line)
        seg = np.hypot(*np.diff(pts, axis=0).T)
        along = np.concatenate([[0.0], np.cumsum(seg)])
        if along[-1] < 6.0:
            continue
        u = np.arange(0.0, along[-1], column)
        P = np.stack([np.interp(u, along, pts[:, 0]), np.interp(u, along, pts[:, 1])], axis=1)
        T = np.gradient(P, axis=0)
        N = np.stack([T[:, 1], -T[:, 0]], axis=1)
        N /= np.maximum(np.linalg.norm(N, axis=1, keepdims=True), 1e-9)
        # Outward: toward the low ground.
        if float(np.mean(high_field(P[:, 0] + N[:, 0], P[:, 1] + N[:, 1]))) > 0.0:
            N = -N
        # The spur's cliffs stop a little outside the feet of the cave's heap of rock standing against
        # its end, their last stones overlapping the rocks' sides, so no bare ground shows between them.
        keep = in_cave_rocks(P[:, 0], P[:, 1]) > 1.1
        for (ax, az), (bx, bz), width in RAMPS:
            vx, vz = bx - ax, bz - az
            length2 = vx * vx + vz * vz
            t = ((P[:, 0] - ax) * vx + (P[:, 1] - az) * vz) / length2
            across = np.abs(-(P[:, 0] - ax) * vz + (P[:, 1] - az) * vx) / math.sqrt(length2)
            keep &= ~((across < width / 2 + 0.6) & (t > -0.1) & (t < 1.1))
        # Runs of points kept, each long enough to stand.
        k = 0
        while k < len(P):
            if not keep[k]:
                k += 1
                continue
            j = k
            while j < len(P) and keep[j]:
                j += 1
            if j - k >= 5:
                rp, rn = P[k:j], N[k:j]
                tops = ground(rp[:, 0] - rn[:, 0] * 4.0, rp[:, 1] - rn[:, 1] * 4.0)[0]
                low = ground(rp[:, 0] + rn[:, 0] * 3.0, rp[:, 1] + rn[:, 1] * 3.0)[0]
                runs.append((rp, rn, tops, low))
            k = j
    return runs


def build_landmarks(collection, air):
    """Every rock with its jungle crown, joined into one mesh for each group of rocks (so the game
    can leave out a group it is not looking at), the sea cliffs, the high ground's white cliffs, the
    stepping stones, and the waterfall with its spray; the cave's outcrop and the cliffs by it cut away
    inside the cave (`air`, see cave.Air). Returns the objects,
    each rock's foot outline (not the tips standing on top of others, nor the stepping stones), where
    the waterfall lands in its pool, and the stepping stones' pads and bodies."""
    # The rocks' jungle crowns go in meshes of their own, so the game can paint their leaves.
    groups, crowns, outlines = {}, {}, []
    # The stepping stones for the game: a pad to stand on on each one's top (and on the ledges on the
    # rims), and its body to bump into below.
    stones = {"pads": list(stepping_stones()[1]), "pillars": []}
    for spec in rock_specs():
        stand = spec.get("stand")
        ground = ground_height if stand is None else (lambda x, z, y=stand: np.full_like(np.asarray(x, dtype=float), y))
        rock = K.Rock(spec, ground)
        bm, cols, rim = rock.build()
        if spec["group"] == "cave":
            # The mouth's own opening is exact; the rest goes wherever it reaches into the cave.
            air.cut(bm, 0.0, False) if spec.get("tunnel") else air.cut(bm)
        pieces = groups.setdefault(spec["group"], [])
        pieces.append((bm, cols, not rock.s["flat"]))
        if spec.get("pillar"):
            # A stepping stone: a mat of grass on its flat top. Not a rock's foot for walkers to keep
            # clear of at any height: its top is stood on.
            bm, cols, top, outline = K.grass_cap(rock, rim, spec["seed"] + 500)
            pieces.append((bm, cols, True))
            mx, mz = (float(v) for v in rock.middle(rock.top))
            stones["pads"].append({"centre": [round(mx, 2), round(mz, 2)], "outline": outline, "top": round(top, 3)})
            body = rock.radius(np.linspace(0.0, 2.0 * math.pi, 16, endpoint=False), np.full(16, rock.foot + 2.0))[0]
            stones["pillars"].append({"centre": [round(rock.cx, 2), round(rock.cz, 2)], "radius": round(float(body.mean()), 2),
                                      "bottom": round(rock.base, 3) if stand is not None else -10.0,
                                      "top": round(rock.top - 0.1, 3)})
            continue
        if rock.s["crown"]:
            small = rock.rx < 4.0
            gap = rock.s["notch"][:2] if rock.s["notch"] else None
            mound = spec.get("mound", 1.0)
            # A crown of the given size is a fringe of bush-sized clumps along the top (the cave's
            # outcrop), not a cap of trees.
            size = spec.get("crown_size", 1.1 if small else None)
            target = spec.get("crown_target", 110 if small else int(450 * mound))
            crowns.setdefault(spec["group"], []).append(
                (*K.crown(rock, rim, gap=gap, size=size, target=target, mound=mound, hang=spec.get("hang", 0.35)), True))
        if spec.get("cave"):
            mouth_rock = rock
        if stand is None:
            outlines.append((rock, rock.outline()))
    # The waterfall's wall: vines hanging down its face either side of the water, the water itself
    # and the spray where it lands in the pool.
    wall = next(r for r, _ in outlines if r.s["notch"])
    an, half, _ = wall.s["notch"]
    bm, cols = K.vines(wall, (an, 21.0), FALL["vines"], FALL["seed"], avoid=(an, half), curtains=FALL["curtains"])
    hanging = {wall.s["group"]: [(bm, cols, True)]}
    # The sea cliffs along the north-east coast.
    pts, normals, tops = cliff_line()
    bm, cols, greens = K.cliff(pts, normals, tops, WATER, CLIFFS["seed"], base=WATER - CLIFFS["deep"] - 1.0)
    groups.setdefault("cliffs", []).append((bm, cols, True))
    # The greenery growing down their face, painted as leaves.
    hanging.setdefault("cliffs", []).append((*greens, True))
    # The high ground's white limestone cliffs, round the tableland, down both sides of its gorge and
    # round the spur, as the film's frames of the stepping-stone pillars draw them: sheer, pale, cut
    # by upright cracks more than by beds, with greenery spilling over their tops.
    for k, (rp, rn, tops, low) in enumerate(high_edges()):
        bm, cols, greens = K.cliff(rp, rn, tops, WATER, TABLELAND["seed"] + k, base=float(low.min()) - 1.5,
                                   column=1.6, stone="karst", stand=0.9, jut=0.45, row=1.0, beds=(1.2, 3.0),
                                   joints=(2.0, 5.0))
        air.cut(bm, bounds=CV.BOUNDS)
        groups.setdefault("west", []).append((bm, cols, True))
        hanging.setdefault("west", []).append((*greens, True))
    # A few vines hanging down the outcrop's face over the cave's mouth, beside and over its west side,
    # as in the sketch.
    ac = mouth_rock.s["cave"][0]
    face = float(mouth_rock.radius(np.array([ac]), np.array([mouth_rock.top - 1.0]))[0][0])
    bm, cols = K.vines(mouth_rock, (ac + 1.6 / face, 1.1), 3, CAVE["seed"] + 7)
    hanging.setdefault("cave", []).append((bm, cols, True))
    # (The cave's skylight, its well and the dome it opens into, are the cave's: see build_cave.)
    rocks = [join_painted(f"rocks_{name}", pieces, collection) for name, pieces in groups.items()]
    rocks += [join_painted(f"crowns_{name}", pieces, collection) for name, pieces in crowns.items()]
    rocks += [join_painted(f"vines_{name}", pieces, collection) for name, pieces in hanging.items()]
    bm, uvs, foot = K.waterfall(wall, POOL["level"], out=FALL["pour"])
    fall = object_with_uv("waterfall", bm, uvs, collection)
    spray = join_painted("spray", [(*K.spray(POOL["level"]), True)], collection)
    spray.location = (foot[0], -foot[1], POOL["level"])
    return [*rocks, fall, spray], outlines, foot, stones


def build_cave(collection):
    """The forbidden cave's inside (cave.py), from the mouth's arch (the outcrop's mouth tier, opened
    right through) to the doorway in the skylight's dome, and on from its far doorway to the chamber
    with the ledge. Writes its walk grid, each of the floor's and
    the ceiling's heights stored as a share of CAVE_RANGE (65535 where there is no cave), less what its
    neighbours predict (see predicted). Returns its objects, the game's info about it and its Air."""
    mouth = cave_mouth()[0]
    sky = SKYLIGHT
    dome = K.skylight(sky["centre"], sky["radius"], sky["lumps"], ground_height, WATER, sky["floor"], sky["seed"],
                      sky["shaft"], sky["dome"], sky["segments"], doors=(CV.DOOR, CV.DOOR_ON))
    # (Its walk grid's apron before the mouth lies on the sand as levelled there.)
    parts, extras, info, air, (floor, ceiling) = CV.build(mouth.mouth_loop, dome, sky,
                                                          lambda x, z: ground(np.asarray(x, dtype=float),
                                                                              np.asarray(z, dtype=float))[0])
    objects = [CV.join_lit(name, pieces, collection) for name, pieces in parts.items()]
    objects += [join_painted(name, [(bm, cols, True) for bm, cols in pieces], collection) for name, pieces in extras.items()]
    lo, hi = CAVE_RANGE
    with open(os.path.join(OUT_DIR, "cave_grid.bin"), "wb") as f:
        for h in (floor, ceiling):
            q = np.where(np.isnan(h), 65535, np.round((np.nan_to_num(h) - lo) / (hi - lo) * 65534.0)).astype(np.int64)
            f.write(((q - predicted(q)) % 65536).astype("<u2").tobytes())
    info["grid"].update({"url": "models/island/cave_grid.bin", "range": list(CAVE_RANGE), "predicted": True})
    info["url"] = "models/island/cave.glb"
    print(f"BUILT cave: {sum(len(o.data.polygons) for o in objects)} faces, {int(np.isfinite(floor).sum())} floor cells")
    return objects, info, air


# The heights the cave's walk grid spans, floor to the open ceiling (see cave.OPEN).
CAVE_RANGE = (-5.0, 31.0)


# ---------------------------------------------------------------------------- plants
def plant_ground(outlines, props):
    """Where plants may grow, on a 1 m grid over the map: the ground's height, how far past the
    beach each point is, how far it is from paths, rocks, props, the high ground's edge, the cave's
    skylight and the waterfall's pool, which way round the pool from its bank, and how steep."""
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
        "festival": masks["festival"], "fields": masks["fields"], "path": d_path, "walked": path_field(gx, gz),
        "rock": d_rock, "prop": d_prop,
        "pool": np.hypot(gx - POOL["centre"][0], gz - POOL["centre"][1]) - POOL["radius"],
        "pool_side": angle_diff(np.arctan2(gz - POOL["centre"][1], gx - POOL["centre"][0]),
                                math.radians(POOL["view"] + 180.0)),
        # The sea cliffs' grassy top near their edge, and their headland, all grass.
        "cliff_top": (masks["cliff"] > 0.25) & (masks["s_cliff"] > 0.0) & (masks["s_cliff"] < 15.0),
        "headland": (masks["cliff"] > 0.25) & (masks["s_cliff"] > 0.0) & (masks["s_cliff"] < 22.0)
                    & (np.abs(np.degrees(angle_diff(masks["phi"], math.radians(CLIFFS["headland"])))) < 6.0),
        "cliff_in": masks["s_cliff"],
        "slope": np.hypot(gxr, gzr),
        # How far inside the high ground (negative: outside), across its edge where its cliffs stand.
        "high": masks["high"],
        "skylight": masks["skylight"],
        "wet": (h < WATER + 0.35).astype(float),
        # How far from the sand before the cave's mouth (6 m out), which is kept clear (see CAVE["clear"]).
        "cave": np.hypot(gx - (CAVE["mouth"][0] + 6.0 * math.cos(math.radians(CAVE["facing"]))),
                         gz - (CAVE["mouth"][1] + 6.0 * math.sin(math.radians(CAVE["facing"])))),
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
    props = [p for p in layout_props() if not p[0].startswith(PLANTED_KINDS)] + PLANTED_ROUND
    G = plant_ground(outlines, props)
    x0, z0 = CENTRE[0] - SIZE / 2, CENTRE[1] - SIZE / 2
    canopy = PL.Patchwork(x0, z0, SIZE, CANOPY_PATCHES)
    canopy_far = PL.Patchwork(x0, z0, SIZE, CANOPY_PATCHES)
    trunks, crowns = [], []
    stems = Spacing(4.0)
    variants = PL.Variants()
    # Nothing grows on the festival's back alleys, or so near them its leaves reach over (see BACKS);
    # the jungle is planted just as before round them.
    # Nor under the round beehive huts' eaves: the palms and bushes planted round the big huts
    # nearby had reached into them. Nor in or round the stalls as they stand now (see STALL_HALF).
    # A plant is refused only after its place is drawn, so the jungle is planted just as before
    # round them.
    beehives = [(x, z) for kind, x, z, _ in props if kind == "beehive"]
    stalls = [(x, z, math.radians(turn)) for kind, x, z, turn in layout_props() if kind.startswith("stall_")]

    def keep_out(x, z):
        # Nor on a path as trodden (see PATH_WALK): the jungle was planted round PATHS' own lines.
        if float(path_field(np.array([x]), np.array([z]))[0]) < -0.3:
            return True
        if any(math.hypot(x - bx, z - bz) < BEEHIVE_CLEAR for bx, bz in beehives):
            return True
        reach = STALL_HALF + STALL_CLEAR
        for sx, sz, turn in stalls:
            dx, dz = x - sx, z - sz
            if abs(dx * math.cos(turn) - dz * math.sin(turn)) < reach and abs(dx * math.sin(turn) + dz * math.cos(turn)) < reach:
                return True
        return float(stall_backs(np.array([x]), np.array([z]), BACKS["room"])[0]) > 0.02

    variants.keep_out = keep_out

    def at(x, z):
        return float(ground_height(np.array([x]), np.array([z]))[0])

    clearing = noise(G["x"], G["z"], 32.0, 31.0) > JUNGLE["clearings"]
    # Trees stand back from the waterfall's pool, so it lies open to the sky and shows from above as
    # in the aerial shot, and off its bank, where the trees framing the view stand (see POOL_GROVE).
    pool_room = POOL["trees"] - POOL["radius"]
    G["bank_room"] = ((G["pool"] < BANK_ROOM) & (np.abs(G["pool_side"]) < 0.9)).astype(float)
    # No trees on the sea cliffs' top near the edge or on their headland: grass and shrubs, as in
    # the film's frame.
    treeless = G["cliff_top"] | G["headland"]
    G["treeless"] = treeless.astype(float)
    # Where the high ground's cliffs stand nothing grows; trees stand back from their tops' edge and
    # from their feet, so the white stone shows as in the film's frames; none in the gorge's water,
    # nor round the cave's skylight, nor before the cave's mouth.
    G["cliff_band"] = ((G["high"] > -4.0) & (G["high"] < 3.0)).astype(float)
    G["tree_room"] = ((G["high"] < -5.0) | (G["high"] > 7.0)).astype(float)
    open_ground = ((G["village"] < 0.02) & (G["festival"] < 0.02) & (G["fields"] < 0.02)
                   & (G["pool"] > pool_room) & (G["bank_room"] < 0.5) & ~treeless & (G["tree_room"] > 0.5)
                   & (G["wet"] < 0.5) & (G["skylight"] > 1.0) & (G["cave"] > CAVE["clear"][0]))
    jungle = ((G["inland"] > 3.0) & open_ground & (G["path"] > 2.2) & (G["rock"] > 2.0) & (G["prop"] > 0.0)
              & (G["slope"] < 0.7))

    # A few big trees deep in the jungle, with buttress roots and hanging vines.
    deep = jungle & (G["inland"] > 22.0) & (G["path"] > 5.0)
    for x, z in scatter(rng, G, deep, JUNGLE["big_spacing"], taken=stems, limit=JUNGLE["big_trees"]):
        y = at(x, z)
        built, tops = PL.big_tree(np.random.default_rng(int(rng.integers(1 << 31))), lambda dx, dy, x=x, z=z, y=y: at(x + dx, z - dy) - y)
        canopy.add(PL.to_arrays(built), x, z, y)
        far = L.fuse([L.ellipsoid_bm(Vector((cx, cy, cz)), (r, r, r * 0.8), u=8, v=5) for cx, cy, cz, r in tops],
                     voxel=0.7, smooth_iterations=3, smooth_lambda=0.8, target_tris=40)
        far_cols = PL.leafy(far, 0.0, 0.0, PL.C["canopyLight"], PL.C["canopy"], PL.C["canopyDark"])
        canopy_far.add(PL.to_arrays((far, far_cols, [0.4] * len(far_cols))), x, z, y)
        trunks.append([round(x, 2), round(z, 2), 1.9])
        for lx, ly, lz, r in tops:
            crowns.append([round(x + lx, 2), round(y + lz, 2), round(z - ly, 2), round(r, 2)])
    # And one at the right end of the waterfall pool's bank, as in the film's frame.
    x, z = pool_spot(*POOL_TREE)
    y = at(x, z)
    built, tops = PL.big_tree(np.random.default_rng(int(rng.integers(1 << 31))), lambda dx, dy, x=x, z=z, y=y: at(x + dx, z - dy) - y)
    canopy.add(PL.to_arrays(built), x, z, y)
    far = L.fuse([L.ellipsoid_bm(Vector((cx, cy, cz)), (r, r, r * 0.8), u=8, v=5) for cx, cy, cz, r in tops],
                 voxel=0.7, smooth_iterations=3, smooth_lambda=0.8, target_tris=40)
    far_cols = PL.leafy(far, 0.0, 0.0, PL.C["canopyLight"], PL.C["canopy"], PL.C["canopyDark"])
    canopy_far.add(PL.to_arrays((far, far_cols, [0.4] * len(far_cols))), x, z, y)
    stems.take(x, z)
    trunks.append([round(x, 2), round(z, 2), 1.9])
    for lx, ly, lz, r in tops:
        crowns.append([round(x + lx, 2), round(y + lz, 2), round(z - ly, 2), round(r, 2)])
    # The trees framing the view across it; the low tree from a generator of its own, so the jungle
    # is grown as before.
    for grove, grow in [*((g, rng) for g in POOL_GROVE), (POOL_LOW_TREE, np.random.default_rng(FALL["seed"] + 13))]:
        trees = [(*pool_spot(across, toward), height) for across, toward, height in grove]
        cx, cz = sum(t[0] for t in trees) / len(trees), sum(t[1] for t in trees) / len(trees)
        base = at(cx, cz)
        built, tops, far = PL.clump(np.random.default_rng(int(grow.integers(1 << 31))),
                                    [(tx - cx, -(tz - cz), height, at(tx, tz) - base) for tx, tz, height in trees])
        canopy.add(PL.to_arrays(built), cx, cz, base)
        canopy_far.add(PL.to_arrays(far), cx, cz, base)
        for tx, tz, height in trees:
            stems.take(tx, tz)
            trunks.append([round(tx, 2), round(tz, 2), round(0.32 * height / 8.0 + 0.2, 2)])
        for lx, ly, lz, r in tops:
            crowns.append([round(cx + lx, 2), round(base + lz, 2), round(cz - ly, 2), round(r, 2)])

    # Clumps of trees crowding round the cave's skylight, their crowns over its edge, so it lies
    # hidden under the jungle; from a generator of their own. The nearest the edge are the lowest, so
    # from the water under it the sky shows up through it (`cave interior 6`), ringed by leaves.
    count, (near, far), seed = SKYLIGHT["trees"]
    ring = np.random.default_rng(seed)
    sx, sz = SKYLIGHT["centre"]
    for k in range(count):
        a = 2.0 * math.pi * (k + ring.uniform(-0.25, 0.25)) / count
        trees = []
        for t in range(3):
            ta = a + ring.uniform(-0.18, 0.18)
            d = float(K.skylight_edge(SKYLIGHT["radius"], SKYLIGHT["lumps"], ta)) + ring.uniform(near, far) + 2.2 * t
            tx, tz = sx + d * math.cos(ta), sz + d * math.sin(ta)
            # Nearer the spur's edge than the jungle's trees stand, so they close round it on every side.
            if grid_at(G, "high", tx, tz) < 4.0 or not stems.free(tx, tz, 3.0):
                continue
            stems.take(tx, tz)
            trees.append((tx, tz, ring.uniform(*((6.0, 8.0), (8.0, 11.0), (10.0, 14.0))[t])))
        if not trees:
            continue
        cx, cz = sum(t[0] for t in trees) / len(trees), sum(t[1] for t in trees) / len(trees)
        base = at(cx, cz)
        built, tops, far_shape = PL.clump(np.random.default_rng(int(ring.integers(1 << 31))),
                                          [(tx - cx, -(tz - cz), height, at(tx, tz) - base) for tx, tz, height in trees])
        canopy.add(PL.to_arrays(built), cx, cz, base)
        canopy_far.add(PL.to_arrays(far_shape), cx, cz, base)
        for tx, tz, height in trees:
            trunks.append([round(tx, 2), round(tz, 2), round(0.32 * height / 8.0 + 0.2, 2)])
        for lx, ly, lz, r in tops:
            crowns.append([round(cx + lx, 2), round(base + lz, 2), round(cz - ly, 2), round(r, 2)])

    # The canopy: clumps of trees whose crowns run together, opening into a few clearings.
    for cx, cz in scatter(rng, G, jungle & ~clearing, JUNGLE["clump_spacing"]):
        trees = []
        for _ in range(40):
            if len(trees) >= int(rng.integers(*JUNGLE["trees"])) + 1:
                break
            a, d = rng.uniform(0, 2 * math.pi), (0.0 if not trees else rng.uniform(3.0, 6.0))
            tx, tz = cx + d * math.cos(a), cz + d * math.sin(a)
            if grid_at(G, "inland", tx, tz) < EDGE_PALMS or grid_at(G, "path", tx, tz) < 1.8 or grid_at(G, "rock", tx, tz) < 1.8 \
                    or grid_at(G, "prop", tx, tz) < PROP_PALMS or grid_at(G, "village", tx, tz) > 0.05 \
                    or grid_at(G, "festival", tx, tz) > 0.05 or grid_at(G, "bank_room", tx, tz) > 0.5 \
                    or grid_at(G, "pool", tx, tz) < pool_room or grid_at(G, "treeless", tx, tz) > 0.5 \
                    or grid_at(G, "tree_room", tx, tz) < 0.5 or grid_at(G, "wet", tx, tz) > 0.5 \
                    or grid_at(G, "skylight", tx, tz) < 1.5 or grid_at(G, "cave", tx, tz) < CAVE["clear"][0] \
                    or not stems.free(tx, tz, 3.0):
                continue
            stems.take(tx, tz)
            # A little shorter at a rock's foot, so the stone shows above the jungle as in the shot;
            # not round the waterfall's pool, whose clearing the tall trees shade as in its frame.
            near_rock = 0.72 + 0.28 * float(max(smoothstep(3.0, 16.0, grid_at(G, "rock", tx, tz)),
                                                smoothstep(45.0, 35.0, grid_at(G, "pool", tx, tz))))
            trees.append((tx, tz, rng.uniform(*JUNGLE["tree_height"]) * near_rock))
        if not trees:
            continue
        base = at(cx, cz)
        local = [(tx - cx, -(tz - cz), height, at(tx, tz) - base) for tx, tz, height in trees]
        built, tops, far = PL.clump(np.random.default_rng(int(rng.integers(1 << 31))), local)
        canopy.add(PL.to_arrays(built), cx, cz, base)
        canopy_far.add(PL.to_arrays(far), cx, cz, base)
        for (tx, tz, height) in trees:
            trunks.append([round(tx, 2), round(tz, 2), round(0.32 * height / 8.0 + 0.2, 2)])
        for lx, ly, lz, r in tops:
            crowns.append([round(cx + lx, 2), round(base + lz, 2), round(cz - ly, 2), round(r, 2)])

    # Palms: thick along the jungle's edge by the beaches, and here and there among the trees, in the
    # gaps the canopy leaves (it is planted first), kept apart from each other but standing as near
    # as a few metres to a tree's trunk.
    palms = []
    for k in range(8):
        near, far = PL.jungle_palm(np.random.default_rng(int(rng.integers(1 << 31))), rng.uniform(6.5, 9.0))
        palms.append((variants.shape(f"palm{k}", PL.to_arrays(near)), variants.shape(f"palmfar{k}", PL.to_arrays(far))))
    palm_ok = ((G["inland"] > -4.0) & open_ground & (G["path"] > 1.5) & (G["rock"] > 1.8) & (G["prop"] > 0.0)
               & (G["slope"] < 0.65) & (G["h"] > WATER + 0.45) & (G["cliff_band"] < 0.5))
    edge = G["inland"] < 16.0
    gap = np.where(edge, JUNGLE["palm_spacing"], JUNGLE["palm_spacing"] * 1.25)
    planted = 0
    for x, z in scatter(rng, G, palm_ok, gap, taken=Spacing(4.0)):
        if planted >= JUNGLE["palms"]:
            break
        if not stems.free(x, z, 2.5):
            continue
        stems.take(x, z)
        planted += 1
        near, far = palms[int(rng.integers(0, len(palms)))]
        if variants.plant("palms", near, x, at(x, z) - 0.05, z, rng.uniform(0, 2 * math.pi), rng.uniform(0.9, 1.25), far):
            trunks.append([round(x, 2), round(z, 2), 0.3])

    # The understory: thick everywhere under the trees, and along the paths and the jungle's edges.
    # The understory's shapes grow from a generator of their own, so changing them never moves the
    # jungle round.
    shapes = np.random.default_rng(int(rng.integers(1 << 31)))
    kinds = {
        "fern": [variants.shape("fern", PL.to_arrays(PL.fern(shapes))) for _ in range(6)],
        "monstera": [variants.shape("monstera", PL.to_arrays(PL.monstera(shapes))) for _ in range(4)],
        "cycad": [variants.shape("cycad", PL.to_arrays(PL.cycad(shapes))) for _ in range(4)],
        "ti": [variants.shape("ti", PL.to_arrays(PL.ti_plant(shapes))) for _ in range(4)],
        "brom": [variants.shape("brom", PL.to_arrays(PL.bromeliad(shapes))) for _ in range(3)],
        "bush": [variants.shape("bush", PL.to_arrays(PL.bush(shapes, colour)))
                 for colour in ("purple", "white", "yellow", "red", "pink", "purple")],
    }
    mix_shade = [("fern", 0.36), ("monstera", 0.24), ("cycad", 0.16), ("ti", 0.1), ("brom", 0.08), ("bush", 0.06)]
    mix_edge = [("bush", 0.3), ("fern", 0.22), ("ti", 0.16), ("cycad", 0.12), ("brom", 0.1), ("monstera", 0.1)]
    near_edge = (G["path"] < 6.0) | (G["inland"] < 9.0) | clearing | (G["village"] > 0.0) | (G["festival"] > 0.0)
    # Round the pool the plants keep to its sides, leaving its bank open to stand on and the way onto
    # it clear, with the view across the water.
    bank = (G["pool"] < POOL["clearing"] - POOL["radius"] + 0.5) & (np.abs(G["pool_side"]) < 0.8)
    approach = (G["pool"] < 13.0) & (np.abs(G["pool_side"]) < 0.55)
    under_ok = ((G["inland"] > 1.0) & (G["village"] < 0.12) & (G["festival"] < 0.12) & (G["fields"] < 0.1)
                & (G["path"] > 0.9) & (G["rock"] > 1.0) & (G["prop"] > -0.6) & (G["pool"] > 1.2) & ~bank & ~approach
                & ~G["headland"] & (G["slope"] < 0.85) & (G["cliff_band"] < 0.5) & (G["wet"] < 0.5)
                & (G["skylight"] > 0.3) & (G["cave"] > CAVE["clear"][1]))
    gap = np.where(near_edge, JUNGLE["understory"][0], JUNGLE["understory"][1])
    crown_hash = Spacing(8.0)
    for x, _, z, r in crowns:
        crown_hash.take(x, z)
    count = {k: 0 for k in kinds}
    flowers = []
    for x, z in scatter(rng, G, under_ok, gap, taken=None, stride=1):
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
        grown = variants.plant("under", kinds[kind][int(rng.integers(0, len(kinds[kind])))], x, y, z,
                                 rng.uniform(0, 2 * math.pi), rng.uniform(0.95, 1.5))
        count[kind] += 1
        if kind == "bush" and grown:
            flowers.append((x, y, z))

    # Ferns and bushes crowding the cave skylight's edge, their leaves over it, as round the opening in
    # the film's frame looking up out of the cave; from a generator of their own.
    count, seed = SKYLIGHT["plants"]
    rim = np.random.default_rng(seed)
    sx, sz = SKYLIGHT["centre"]
    for k in range(count):
        a = 2.0 * math.pi * (k + rim.uniform(-0.3, 0.3)) / count
        d = float(K.skylight_edge(SKYLIGHT["radius"], SKYLIGHT["lumps"], a)) + rim.uniform(0.35, 0.9)
        x, z = sx + d * math.cos(a), sz + d * math.sin(a)
        kind = ("fern", "fern", "bush", "monstera", "ti")[int(rim.integers(0, 5))]
        variants.plant("under", kinds[kind][int(rim.integers(0, len(kinds[kind])))], x, at(x, z) - 0.04, z,
                       rim.uniform(0, 2 * math.pi), rim.uniform(1.0, 1.5))

    # Ferns and dark leafy plants at the foot of the gorge's south wall, along the riverside path, as
    # in the film's frames of it: in clumps with gaps, clear of the stones' crossing; from a generator
    # of their own.
    foot = np.random.default_rng(GORGE_FOOT["seed"])
    fx = GORGE_FOOT["from"]
    while fx > GORGE_FOOT["to"]:
        fx -= foot.uniform(*GORGE_FOOT["gap"])
        if abs(fx - STONES["x"]) < 4.0 or foot.random() < 0.3:
            continue
        (px, pz), _, n = gorge_point(fx)
        u = GORGE["half"] - GORGE_FOOT["in"] + foot.uniform(-0.15, 0.15)
        px, pz = px + n[0] * u, pz + n[1] * u
        kind = GORGE_FOOT["kinds"][int(foot.integers(0, len(GORGE_FOOT["kinds"])))]
        variants.plant("under", kinds[kind][int(foot.integers(0, len(kinds[kind])))], px, at(px, pz) - 0.04, pz,
                       foot.uniform(0, 2 * math.pi), foot.uniform(0.75, 1.1))

    # The waterfall pool's own plants and the bromeliads on its stump (see POOL_PLANTS and POOL_ROCKS).
    for kind, index, across, toward, scale in POOL_PLANTS:
        x, z = pool_spot(across, toward)
        variants.plant("under", kinds[kind][index], x, at(x, z) - 0.04, z, rng.uniform(0, 2 * math.pi), scale)
        if kind == "bush":
            flowers.append((x, at(x, z), z))
    across, toward, _, _, height, _ = POOL_ROCKS[1]
    sx, sz = pool_spot(across, toward)
    showy = np.random.default_rng(FALL["seed"] + 11)
    bright = [variants.shape("brom", PL.to_arrays(PL.bromeliad(showy, heart)))
              for heart in (("bromPink", "bromRed"), ("bromOrange", "bromYellow"), ("bromYellow", "bromOrange"))]
    for k in range(5):
        a = 2.0 * math.pi * k / 5 + 0.4
        x, z = sx + 0.42 * math.cos(a), sz + 0.42 * math.sin(a)
        variants.plant("under", bright[k % 3], x, at(sx, sz) + height - 0.12, z, rng.uniform(0, 2 * math.pi),
                       rng.uniform(2.0, 2.6))
    for k in range(2):
        a = 2.0 * math.pi * k / 2 + 1.3
        x, z = sx + 1.3 * math.cos(a), sz + 1.3 * math.sin(a)
        variants.plant("under", kinds["brom"][(k + 1) % 3], x, at(x, z) - 0.04, z, rng.uniform(0, 2 * math.pi), 1.3)
    # The bough hanging over the bank (see POOL_BRANCHES), from a generator of its own.
    bough = variants.shape("bough", PL.to_arrays(PL.hanging_branch(np.random.default_rng(FALL["seed"] + 19))))
    for across, toward, height, turn in POOL_BRANCHES:
        x, z = pool_spot(across, toward)
        variants.plant("under", bough, x, at(x, z) + height, z, turn, 1.0)
    # Ferns and small plants growing out of the waterfall's wall (see WALL_PLANTS), clear of the
    # falling water, from a generator of their own so the jungle is grown as before.
    wall = next(r for r, _ in outlines if r.s["notch"])
    an, half, _ = wall.s["notch"]
    face = float(wall.radius(np.array([an]), np.array([wall.top - 1.0]))[0][0])
    grow = np.random.default_rng(FALL["seed"] + 7)
    made = 0
    for _ in range(WALL_PLANTS * 4):
        if made >= WALL_PLANTS:
            break
        a = an + grow.uniform(-19.0, 19.0) / face
        if abs(float(angle_diff(a, an))) * face < half + 1.8:
            continue
        y = grow.uniform(wall.foot + 1.5, wall.top - 1.2)
        r = float(wall.radius(np.array([a]), np.array([y]))[0][0])
        mx, mz = (float(v) for v in wall.middle(y))
        x, z = mx + (r + 0.05) * math.cos(a), mz + (r + 0.05) * math.sin(a)
        kind = ("fern", "fern", "fern", "brom", "monstera", "ti")[int(grow.integers(0, 6))]
        variants.plant("under", kinds[kind][int(grow.integers(0, len(kinds[kind])))], x, y - 0.1, z,
                       grow.uniform(0, 2 * math.pi), grow.uniform(1.0, 1.6))
        made += 1
    # A thicker ring of ferns, monstera and ti plants round the pool's sides, closing in on the water
    # as in the film's frame.
    ring =((G["pool"] > 1.4) & (G["pool"] < 11.0) & ~bank & ~approach & (G["rock"] > 0.8) & (G["path"] > 0.9)
            & (G["slope"] < 1.3))
    for x, z in scatter(rng, G, ring, 1.2, taken=None, stride=1):
        if not stems.free(x, z, 1.2):
            continue
        kind = ("fern", "fern", "monstera", "monstera", "ti", "brom", "cycad", "fern")[int(rng.integers(0, 8))]
        variants.plant("under", kinds[kind][int(rng.integers(0, len(kinds[kind])))], x, at(x, z) - 0.04, z,
                       rng.uniform(0, 2 * math.pi), rng.uniform(0.9, 1.35))

    # Grass tufts in the village's clearing, thickest toward its edge.
    tufts = [variants.shape("grass", PL.to_arrays(PL.grass(rng))) for _ in range(4)]
    tuft_ok = (G["village"] > 0.05) & (G["path"] > 1.0) & (G["prop"] > 0.5) & (G["slope"] < 0.8)
    tuft_gap = np.where(G["village"] < 0.85, 1.3, 2.6)
    for x, z in scatter(rng, G, tuft_ok, tuft_gap, taken=None, stride=1, limit=260):
        if math.hypot(x - VILLAGE["plaza"][0][0], z - VILLAGE["plaza"][0][1]) < 8.0:
            continue
        variants.plant("under", tufts[int(rng.integers(0, len(tufts)))], x, at(x, z) - 0.02, z,
                       rng.uniform(0, 2 * math.pi), rng.uniform(0.8, 1.3))
    # And here and there over the sea cliffs' headland and along their top; rounded green shrubs
    # line the cliffs' edge, as in the film's frame.
    tuft_top = treeless & (G["slope"] < 0.8) & (G["cliff_in"] > 2.8) & (G["path"] > 1.0)
    for x, z in scatter(rng, G, tuft_top, np.where(G["headland"], 3.0, 2.6), taken=None, stride=1, limit=600):
        variants.plant("under", tufts[int(rng.integers(0, len(tufts)))], x, at(x, z) - 0.02, z,
                       rng.uniform(0, 2 * math.pi), rng.uniform(0.8, 1.3))
    # Tufts of grass along the paths' edges as trodden, breaking the line where grass meets earth as in
    # the film's village, and patches of clover in the grass beside them and at the feet of the trees
    # nearby; each from a generator of its own, so the jungle is planted as before. Not round the
    # waterfall's pool, whose frame stays as it is.
    away = G["pool"] > 30.0
    edging = np.random.default_rng(EDGES["seed"])
    edge_tufts = [variants.shape("grass", PL.to_arrays(PL.grass(edging, dark=True))) for _ in range(4)]
    edge_ok = ((G["walked"] > -0.25) & (G["walked"] < 0.45) & (G["prop"] > 0.6) & (G["rock"] > 0.6) & (G["slope"] < 1.0)
               & (G["inland"] > 1.5) & (G["fields"] < 0.05) & (G["festival"] < 0.05) & away)
    for x, z in scatter(edging, G, edge_ok, EDGES["tufts"], taken=None, stride=1):
        variants.plant("under", edge_tufts[int(edging.integers(0, len(edge_tufts)))], x, at(x, z) - 0.02, z,
                       edging.uniform(0, 2 * math.pi), edging.uniform(0.75, 1.25))
    clovers = [variants.shape("clover", PL.to_arrays(PL.clover(edging))) for _ in range(3)]
    trunk_near = np.zeros_like(G["x"], dtype=bool)
    for tx, tz, tr in trunks:
        i, j = int(round(tx - G["x"][0, 0])), int(round(tz - G["z"][0, 0]))
        trunk_near[max(j - 3, 0):j + 4, max(i - 3, 0):i + 4] = True
    clover_ok = ((((G["walked"] > 0.8) & (G["walked"] < 5.0)) | ((G["village"] > 0.03) & (G["village"] < 0.4)))
                 & (G["prop"] > 1.0) & (G["rock"] > 1.0) & (G["slope"] < 0.8) & (G["inland"] > 3.0)
                 & (G["fields"] < 0.05) & (G["festival"] < 0.05) & away)
    gap = np.where(trunk_near, EDGES["clover"] * 0.6, EDGES["clover"])
    for x, z in scatter(edging, G, clover_ok, gap, taken=None, stride=1):
        variants.plant("under", clovers[int(edging.integers(0, len(clovers)))], x, at(x, z) - 0.03, z,
                       edging.uniform(0, 2 * math.pi), edging.uniform(0.85, 1.3))
    shrubs = [variants.shape("shrub", PL.to_arrays(PL.bush(rng, None))) for _ in range(4)]
    edge_ok = G["cliff_top"] & ~G["headland"] & (G["cliff_in"] > 2.7) & (G["cliff_in"] < 6.5) & (G["slope"] < 0.85)
    for x, z in scatter(rng, G, edge_ok, 1.9, taken=None, stride=1):
        variants.plant("under", shrubs[int(rng.integers(0, len(shrubs)))], x, at(x, z) - 0.06, z,
                       rng.uniform(0, 2 * math.pi), rng.uniform(1.1, 1.8))

    # Leafy shrubs along the high ground's tops, a little back from their edge, as on the film's cliffs
    # round the stepping stones.
    rim_ok = (G["high"] > 3.2) & (G["high"] < 6.5) & (G["slope"] < 0.85) & (G["path"] > 1.0) & (G["skylight"] > 0.3)
    for x, z in scatter(rng, G, rim_ok, 2.2, taken=None, stride=1):
        variants.plant("under", shrubs[int(rng.integers(0, len(shrubs)))], x, at(x, z) - 0.06, z,
                       rng.uniform(0, 2 * math.pi), rng.uniform(1.0, 1.6))

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

    # Round the backs and sides of the village's huts, as lush as the film's village: flowering
    # bushes, cycads, monstera, ferns and red ti, and a palm or two standing over each hut.
    for kind, hx_, hz_, turn in props:
        room = HUT_ROOM.get(kind)
        if room is None:
            continue
        front = math.radians(turn)
        for k, pick in enumerate(("bush", "cycad", "bush", "monstera", "fern", "ti", "bush", "cycad")):
            a = front + math.radians(rng.uniform(95.0, 265.0))
            d = rng.uniform(*room)
            x, z = hx_ + d * math.sin(a), hz_ + d * math.cos(a)
            if grid_at(G, "path", x, z) < 1.2:
                continue
            y = at(x, z) - 0.04
            shapes = kinds[pick]
            grown = variants.plant("under", shapes[int(rng.integers(0, len(shapes)))], x, y, z,
                                   rng.uniform(0, 2 * math.pi), rng.uniform(0.85, 1.25))
            if pick == "bush" and grown:
                flowers.append((x, y, z))
        if kind == "beehive":
            continue
        for k in range(2):
            a = front + math.radians(180.0 + (k - 0.5) * 70.0 + rng.uniform(-15.0, 15.0))
            d = room[1] + rng.uniform(0.6, 1.6)
            x, z = hx_ + d * math.sin(a), hz_ + d * math.cos(a)
            if grid_at(G, "path", x, z) < 1.5:
                continue
            near, far = palms[int(rng.integers(0, len(palms)))]
            if variants.plant("palms", near, x, at(x, z) - 0.05, z, rng.uniform(0, 2 * math.pi), rng.uniform(0.85, 1.1), far):
                trunks.append([round(x, 2), round(z, 2), 0.3])

    # Round the guest houses, as thick as the film's: flowering bushes, banana plants, monstera, ferns,
    # red ti and cycads all round each but before its steps, and palms over it; from a generator of
    # their own.
    greens = np.random.default_rng(131)
    kinds["banana"] = [variants.shape("banana", PL.to_arrays(PL.banana(greens))) for _ in range(3)]
    g = GUEST_GREENS
    for kind, hx_, hz_, turn in props:
        if not kind.startswith("guest_"):
            continue
        front = math.radians(turn)
        hx, hz_back, hz_front = g["half"]
        for k in range(g["count"]):
            rel = math.radians(greens.uniform(g["front"], 360.0 - g["front"]))
            # Out from the eaves: where a line from the middle that way leaves the house's box.
            hz = hz_front if math.cos(rel) > 0.0 else hz_back
            edge = min(hx / max(abs(math.sin(rel)), 1e-6), hz / max(abs(math.cos(rel)), 1e-6))
            pick = g["mix"][k % len(g["mix"])]
            d = edge + greens.uniform(max(g["room"][0], g["clear"].get(pick, 0.0)), g["room"][1])
            a = front + rel
            x, z = hx_ + d * math.sin(a), hz_ + d * math.cos(a)
            if grid_at(G, "path", x, z) < 1.1:
                continue
            y = at(x, z) - 0.04
            shapes = kinds[pick]
            grown = variants.plant("under", shapes[int(greens.integers(0, len(shapes)))], x, y, z,
                                   greens.uniform(0, 2 * math.pi), greens.uniform(0.9, 1.3))
            if pick == "bush" and grown:
                flowers.append((x, y, z))
        for k in range(g["palms"]):
            a = front + math.radians(120.0 + 60.0 * k + greens.uniform(-20.0, 20.0))
            d = g["half"][1] + g["room"][1] + greens.uniform(0.8, 2.0)
            x, z = hx_ + d * math.sin(a), hz_ + d * math.cos(a)
            if grid_at(G, "path", x, z) < 1.5:
                continue
            near, far = palms[int(greens.integers(0, len(palms)))]
            if variants.plant("palms", near, x, at(x, z) - 0.05, z, greens.uniform(0, 2 * math.pi), greens.uniform(0.9, 1.15), far):
                trunks.append([round(x, 2), round(z, 2), 0.3])

    # Blue butterflies flutter round flowering bushes, a few here and there; the nearer to the
    # festival and the village, the likelier.
    rng.shuffle(flowers)
    vx, vz = VILLAGE["plaza"][0]
    flowers.sort(key=lambda p: min(math.hypot(p[0], p[2] + 20.0), math.hypot(p[0] - vx, p[2] - vz),
                                   math.hypot(p[0] - 21.0, p[2] + 112.0)) * rng.uniform(0.6, 1.4))
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
          f"{len(homes)} butterflies, {len(variants.placed.get('palms', []))} palms, "
          f"{variants.kept_out} kept off the festival's stalls and back alleys and the beehive huts")
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


def export_objects(objects, path, extras=False):
    """Export several objects into one .glb, each keeping its name and custom attributes (and its custom
    properties, as extras, if `extras`)."""
    view_layer = bpy.context.view_layer
    view_layer.update()
    for o in bpy.data.objects:
        if o.name in view_layer.objects:
            o.select_set(False)
    for o in objects:
        o.select_set(True)
    view_layer.objects.active = objects[0]
    bpy.ops.export_scene.gltf(
        filepath=path, export_format="GLB", use_selection=True, export_extras=extras, export_yup=True,
        export_normals=True, export_texcoords=True, export_vertex_color="ACTIVE", export_materials="NONE",
        export_attributes=True, export_animations=False, export_skins=False, export_morph=False,
        export_cameras=False, export_lights=False, export_apply=False, **L.DRACO,
    )


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    collection = bpy.data.collections.new("island")
    bpy.context.scene.collection.children.link(collection)
    os.makedirs(OUT_DIR, exist_ok=True)

    # The forbidden cave's inside first: the ground and the rocks it runs through are cut away inside it.
    cave_objects, cave_info, air = build_cave(collection)
    cave_objects[0]["cave"] = json.dumps(cave_info, separators=(",", ":"))
    export_objects(cave_objects, os.path.join(OUT_DIR, "cave.glb"), extras=True)
    if "--cave-only" in sys.argv:
        # What stands inside the cave changed, not the way it runs: the ground and the rock it runs
        # through are cut as they were.
        print("BUILT the cave only")
        return

    obj = build_mesh(collection, air)
    tris = len(obj.data.polygons)

    # Heights the game walks on, sampled from the finished mesh so feet meet the ground. Each is
    # stored less what its neighbours predict (see predicted), which compresses to less than half.
    heights = sample_heights(obj, HEIGHT_GRID)
    lo, hi = float(heights.min()), float(heights.max())
    q = np.round((heights - lo) / (hi - lo) * 65535.0).astype(np.int64)
    with open(os.path.join(OUT_DIR, "height.bin"), "wb") as f:
        f.write(((q - predicted(q)) % 65536).astype("<u2").tobytes())

    # The rocks standing on it, and the waterfall.
    landmarks, outlines, foot, stones = build_landmarks(collection, air)
    export_objects(landmarks, os.path.join(OUT_DIR, "landmarks.glb"))
    rock_tris = sum(len(p.vertices) - 2 for o in landmarks if o.name.startswith(("rocks", "crowns", "vines")) for p in o.data.polygons)

    # The jungle, the crops and the village's flowers.
    plant_objects, trunks, crowns, butterflies, placed = build_plants(collection, outlines)
    export_objects(plant_objects, os.path.join(OUT_DIR, "plants.glb"))
    plant_tris = sum(len(p.vertices) - 2 for o in plant_objects for p in o.data.polygons)

    # The painted colour map, with soft hill shading from the same heights.
    gx, gz = grid(COLOUR_SIZE, SIZE)
    h, masks = ground(gx, gz)
    # The quay's drop is hidden by its timber, and the sea floor at its foot by the water: painted as
    # the sand at the edge for a metre out over them, the drop is not shaded as a rock face and the
    # sea floor's colour never blends into the sand's edge between the map's texels.
    out, drop = QUAY["out"], QUAY["drop"]
    lid = masks["timber"] * ((masks["s"] < -out) & (masks["s"] > -out - drop - 1.0))
    h = h + (np.maximum(h, QUAY["top"]) - h) * lid
    masks["s"] = masks["s"] + (-out - masks["s"]) * lid
    masks["rubble"] = rubble(gx, gz, outlines)
    masks["shade"] = canopy_shade(gx, gz, crowns)
    shade, normal_y = hillshade(h, SIZE / (COLOUR_SIZE - 1))
    rgb, kinds, scree = paint(gx, gz, h, masks, normal_y, shade)
    # Colours are linear here; the PNG holds sRGB. The kinds and the stones stay linear, averaged down
    # to their maps.
    srgb = np.where(rgb <= 0.0031308, rgb * 12.92, 1.055 * np.power(rgb, 1.0 / 2.4) - 0.055)
    # Lossless: lossy WebP smears colour edges, such as the rows of the fields.
    L.write_webp(os.path.join(OUT_DIR, "terrain.webp"), srgb)
    k = COLOUR_SIZE // KINDS_SIZE
    L.write_webp(os.path.join(OUT_DIR, "terrain_kinds.webp"), kinds.reshape(KINDS_SIZE, k, KINDS_SIZE, k, 3).mean(axis=(1, 3)))
    scree = scree.reshape(KINDS_SIZE, k, KINDS_SIZE, k).mean(axis=(1, 3))
    L.write_webp(os.path.join(OUT_DIR, "terrain_scree.webp"), np.repeat(scree[..., None], 3, axis=2))
    preview(srgb, outlines)

    info = {
        "version": 1,
        "size": SIZE,
        "origin": [CENTRE[0] - SIZE / 2, CENTRE[1] - SIZE / 2],
        "water": WATER,
        "height": {"url": "models/island/height.bin", "grid": HEIGHT_GRID, "min": round(lo, 4), "max": round(hi, 4),
                   "predicted": True},
        "colours": "models/island/terrain.webp",
        "kinds": "models/island/terrain_kinds.webp",
        "scree": "models/island/terrain_scree.webp",
        "landmarks": "models/island/landmarks.glb",
        "rocks": [{"centre": [round(r.cx, 2), round(r.cz, 2)], "outline": reach} for r, reach in outlines],
        "pool": {"centre": list(POOL["centre"]), "radius": POOL["radius"], "level": POOL["level"]},
        "quay": quay_info(),
        "cave": {"url": "models/island/cave.glb"},
        "skylight": {"centre": list(SKYLIGHT["centre"]), "radius": SKYLIGHT["radius"],
                     "lumps": [list(w) for w in SKYLIGHT["lumps"]], "dome": SKYLIGHT["dome"], "floor": SKYLIGHT["floor"]},
        "waterfall": {"foot": [round(foot[0], 2), round(foot[1], 2)], "splash": 3.6},
        "stones": stones,
        "plants": {"url": "models/island/plants.glb", "trunks": trunks, "crowns": crowns, "butterflies": butterflies,
                   "patches": {"canopy": CANOPY_PATCHES, "understory": UNDERSTORY_PATCHES}, "placed": placed},
    }
    L.export_glb(obj, os.path.join(OUT_DIR, "terrain.glb"), info, key="terrain")
    print(f"BUILT terrain: {tris} triangles, heights {lo:.2f} to {hi:.2f} m")
    print(f"BUILT landmarks: {len(outlines)} rocks, {rock_tris} triangles, waterfall lands at {foot[0]:.1f}, {foot[1]:.1f}")
    print(f"BUILT plants: {len(plant_objects)} patches, {plant_tris} triangles")


main()
