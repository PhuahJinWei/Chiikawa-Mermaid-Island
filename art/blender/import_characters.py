"""Convert the downloaded Chiikawa models into game models, each with its island outfit.

Run (from the project root):
    "C:/Program Files/Blender Foundation/Blender 5.2/blender.exe" --background --factory-startup
        --disable-autoexec --python art/blender/import_characters.py -- [--only chiikawa] [--no-previews]
        [--source <folder with Chiikawa/, Hachiware/, Usagi/, Momonga/>]

Inputs: the four rigged .blend files from the downloaded "Chiikawa Models" folder. They are
opened with scripts disabled and never modified.

Outputs:
    public/models/<id>.glb                 the character in the game's vertex format, with rig data
    public/models/faces/<id>.webp          the character's painted face layers (art/faces/<id>/), packed
    public/models/outfits/island_<id>.glb  its island outfit (flower crown + grass skirt), a separate asset
    art/previews/cast_*.png                turnaround renders with and without the outfit
    art/blender/cast.blend                 the exported models side by side, for opening in Blender

The islanders, Hitoha and Futaba, are converted from Chiikawa's model too: without the ears
and tail, grey all over, with a leaf sprout and a grass skirt of their own and no outfit. Their
faces are only cheek marks, which the game draws, so they have no painted face. The generic
islanders in the crowd have ears instead of leaves: round from Chiikawa's model, cat from
Hachiware's and bunny from Usagi's. Their island outfit is only a grey flower crown, since the
skirt is their own. Hitoha and Futaba are the only islanders with leaves, and there is one
of each. The background crowd is generic islanders only, as light copies (CROWD_DETAIL), so a
beach full of islanders stays cheap on a phone.

What the conversion does:
- Poses the T-pose arms down to a relaxed rest, then bakes subdivision and the armature.
- Turns the model to face -Y, scales it so Chiikawa stands 1.0 m to the tips of her ears,
  and stands it on z = 0.
- Repaints the body in the film's flat colours. Two-colour areas painted in the model's
  texture (Hachiware's cap, Usagi's and Momonga's inner ears) become a per-vertex mask,
  which the game draws with a crisp edge and an outline.
- Packs the character's hand-painted face (art/faces/<id>/: layers plus expressions.txt,
  which says which layers make up each expression) into one image. A character without a
  painted face starts from the model's own face decals, rendered from the front in the
  film's dark brown and written there for painting.
"""

import math
import os
import sys
import tempfile

import bmesh
import bpy
import numpy as np
from mathutils import Matrix, Vector, geometry
from mathutils.bvhtree import BVHTree

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import charlib as L  # noqa: E402
import face_art as FA  # noqa: E402
import outfits as O  # noqa: E402

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
DEFAULT_SOURCE = os.path.join(ROOT, "Chiikawa Models-20261016T095113Z-1-001", "Chiikawa Models")
OUT_MODELS = os.path.join(ROOT, "public", "models")
OUT_FACES = os.path.join(OUT_MODELS, "faces")
FACES_SRC = os.path.join(ROOT, "art", "faces")  # hand-paintable face layers, one folder per character
OUT_OUTFITS = os.path.join(OUT_MODELS, "outfits")
OUT_MASKS = os.path.join(OUT_MODELS, "masks")
MASK_SIZE = 512
CAP_SOFT = 0.03                 # how soft a drawn cap's mask edge is, in head radii either side of it
OUT_PREVIEWS = os.path.join(ROOT, "art", "previews")
OUT_BLEND = os.path.join(ROOT, "art", "blender", "cast.blend")

SCALE = 1.0 / 3.551            # Chiikawa is 3.551 units tall in the source files
FACE_SIZE = 768                 # face canvas size in the game, in pixels, for 2 head radii
INK = np.array([0x3B, 0x26, 0x20], dtype=np.float32) / 255.0  # film's dark brown for face art
LINE = "#66432F"                # outline brown sampled from the film
ARM_DOWN = math.radians(30.0)  # the character cards hold the arms out almost level
ARM_FORWARD = math.radians(15.0)

BODY_KINDS = ("Head", "Body", "Arm", "Leg", "Ear", "Tail")
DECAL_LAYERS = {
    "eyes": ("Eye",),
    "brows": ("Brow",),
    "cheeks": ("Cheek",),
    "mouth": ("Mouth", "Lip", "Chin"),
    "tears": ("Tears",),
}
DEFAULT_LEVELS = {"Head": 1, "Body": 2, "Arm": 1, "Leg": 1, "Ear": 1, "Tail": 1}
# The film ties the grass skirt just below the hands and lets it hang to the ground, about as
# wide as the lower body. "hem" is the hem's radius in head radii (per character with
# "skirt_hem"); the skirt is snug where it is tied and flares out to it.
SKIRT = {"gap": 0.012, "hem": 0.78, "bell": 0.85, "below_hands": 0.006,
         "count": 22, "wave": 0.006, "bottom": 0.015}

# Colours are sampled from the film's frames and character cards (see STYLE_GUIDE.md).
CHARACTERS = [
    {
        "id": "chiikawa",
        "file": "Chiikawa/Chiikawa.blend",
        "body": "#F9F7EE",
        # Metres taken out of the body below the head: the film's characters are squatter.
        "shorten": 0.09,
        "crown": {"mode": "level", "frac": 0.72, "count": 18, "size": 0.28, "colors": ["#F9DCE1", "#FFF1F3"]},
    },
    {
        "id": "hachiware",
        "file": "Hachiware/Hachiware.blend",
        "body": "#F9F7EE",
        "shorten": 0.09,
        "parts_color": {"Ear": "#7DAABD", "Tail": "#7DAABD"},
        # The film's cap sits higher than the model paints it, leaving the brows on white forehead:
        # raise its lower edge on the face by this many head radii.
        "mask": {"color": "#7DAABD", "detect": "#86B3C8", "background": "#FFFFFF", "kinds": ["Head"],
                 "raise_edge": 0.08},
        "levels": {"Ear": 0},
        "crown": {"mode": "mask_edge", "count": 18, "size": 0.28, "colors": ["#D3F2EE", "#EAFBF7"]},
    },
    {
        "id": "usagi",
        "file": "Usagi/Usagi.blend",
        "body": "#FBEFCC",
        "shorten": 0.06,  # Usagi is a little taller than the others in the film
        "mask": {"color": "#F5BFCB", "detect": "#FECBD7", "background": "#FDEDC8", "kinds": ["Ear"]},
        "levels": {"Ear": 2},
        "long_ears": True,
        "crown": {"mode": "ear_base", "arc": 0.8, "count": 5, "size": 0.28, "push": 0.6,
                  "colors": ["#FBF5A8", "#FFFBD2"]},
    },
    {
        "id": "momonga",
        "file": "Momonga/Momonga.blend",
        "body": "#FCFCF9",
        "shorten": 0.03,
        "skirt_hem": 0.64,  # Momonga's head radius counts the cheek tufts
        "parts_color": {"Tail": "#C4E9F4"},
        "mask": {"color": "#C4E9F4", "detect": "#D4EAF7", "background": "#FFFFFF", "kinds": ["Ear"]},
        "levels": {"Head": 0, "Arm": 0, "Leg": 0},
        "skin_layer": True,
        # Momonga's head radius counts the cheek tufts, so its flowers are smaller in head radii.
        "crown": {"mode": "level", "frac": 0.72, "count": 18, "size": 0.23, "colors": ["#D4CEF4", "#E9E5FB"]},
    },
    {
        # Kurimanju, a visiting guest, after the official plush (`[3d model] kurimanju`): Chiikawa's model (the
        # user, 2026-10-22: "use chiikawa's model as base, and just change the minor differences"), in peach,
        # with a brown chestnut cap over the top of the head (its edge lowest in front and behind, rising to
        # the sides), the tiny round ears low on the head's sides, and a pale green crown sitting on the cap.
        "id": "kurimanju",
        "file": "Chiikawa/Chiikawa.blend",
        "body": "#F6D8B8",
        "shorten": 0.09,
        "cap": {"color": "#7A4B2E", "front": 0.23, "side": 0.67},
        "ears": {"turn": 40.0, "scale": 0.8},
        "crown": {"mode": "level", "frac": 0.6, "count": 18, "size": 0.28, "colors": ["#CDEBB0", "#E6F6DA"]},
    },
    {
        # Rakko-sensei, a visiting guest, after the official plush (`[3d model] rakko`) and the film
        # (`[anime] rakko 1`): Chiikawa's model, as Kurimanju's, a tenth taller (STYLE_GUIDE.md), in cream, with
        # small dark brown ears low on the head's sides and dark brown paws and feet. His star scar is the
        # user's own painting, a layer of his face (art/faces/rakko/scar.png, 2026-10-22).
        # The film draws no line round his head and body, only short strokes of fur in from their edge: `fur`
        # (the game draws them; see CharacterMaterial's FUR), in strokes round the head, their length and their
        # gap from the edge in head radii, leaning up to `slant` (radians) off square to it.
        # He wears his own clothes, never the island outfit (the user, 2026-10-22): his cape (`cape`, see
        # outfits.cape_pieces), its roll's thickness and the sheet's hem radius in head radii and its front
        # opening either side in degrees. The island outfit is his only from the Test panel (the user).
        "id": "rakko",
        "file": "Chiikawa/Chiikawa.blend",
        "body": "#F1E3C4",
        "scale": 1.1,
        "shorten": 0.1,
        "parts_color": {"Ear": "#3E2A23", "Arm": "#3E2A23", "Leg": "#3E2A23"},
        # Tiny ears, as the official drawing and plush have them (the user, 2026-10-22: "much smaller").
        "ears": {"turn": 48.0, "scale": 0.45},
        "fur": {"count": 24, "length": 0.075, "gap": 0.02, "slant": 0.3},
        # A flat band round his neck, not a thick roll hiding his lower body (the user, 2026-10-22): `roll` its half
        # height and `roll_out` how far it stands out, in head radii.
        "cape": {"roll": 0.055, "roll_out": 0.09, "hem": 0.9, "opening": 95.0},
        "crown": {"mode": "level", "frac": 0.66, "count": 18, "size": 0.28, "colors": ["#FFFFFF", "#F2EFEA"]},
    },
    {
        # Furuhonya (古本屋), the crab, a visiting guest seen at the night beach (PLAN.md), after the official plush
        # (`[3d model] furuhonya`, front and back) and the user's close picture of her face (2026-10-22): Chiikawa's
        # model (the user: "also using Chiikawa's model as base"), in a pale pink, with no round ears and no tail.
        # - A soft coral-pink cap over the top of her head, as the user's picture has it: its edge half a head
        #   radius over the eyes in front, a little lower at the sides, under the crown, with no line along it.
        # - Two coral-pink claws standing up from her head's upper sides where the ears were (`claws`): plush, in
        #   the shape the user drew them (CLAW_OUTLINE: round as a lily pad, a notch for the pincer's gap at the top
        #   on the outer side, a wide foot), as big beside her head as the picture has them: so many head radii
        #   across and thick, their middles this far out from the head's middle and up from the eyes and `back`
        #   behind its middle, so that the head's outline runs in front of their feet as the user's drawing has it,
        #   their lower part sunk in the head, leaning out this many degrees.
        # - Two tiny dark antennae on its top (`antennae`): little lobes this far either side of the middle,
        #   their half sizes, leaning out (radians), sunk this far in (head radii).
        # - A white and pale blue crown sitting on the cap's edge.
        "id": "furuhonya",
        "file": "Chiikawa/Chiikawa.blend",
        "body": "#FBE5E1",
        "shorten": 0.09,
        "drop": ("Ear", "Tail"),
        "cap": {"color": "#F2B0B3", "front": 0.5, "side": 0.44, "line": False},
        "claws": {"color": "#F2B0B3", "width": 0.62, "thick": 0.32, "x": 0.66, "z": 0.8, "back": 0.12, "tilt": 10.0},
        # Thin as a pen's strokes (the user, 2026-10-22: "much thinner").
        "antennae": {"color": "#4A3026", "x": 0.07, "size": (0.011, 0.011, 0.055), "lean": 0.35, "sink": 0.015},
        "crown": {"mode": "cap", "count": 18, "size": 0.28, "colors": ["#FFFFFF", "#DDEFF5"]},
    },
    {
        # Shisa, a visiting guest, cheerful (PLAN.md), after the official plush (`[3d model] shisa`, front and back)
        # and the official drawing the user gave: Hachiware's model, the set's cat, in cream, a peach crown high on
        # the head.
        # - A mane of petals on each side of the head, as the official drawing has it (2026-10-22: "It should look
        #   like soft flower petals"), three a side from under the ears down past the cheeks, each in the shape the
        #   user drew ("the mane should shape like this", PETAL_OUTLINE) (`mane`): its straight edge along the
        #   head's outline (seen from the front, the body's below the head) from its top down to its foot, [top,
        #   foot] head radii up from the eyes, `out` head radii outside it, under the head's ink line, with a root
        #   `sink` head radii into the head that holds it on out of sight; its dome, hooked tip and full curve
        #   outside, as the user's close-up of the drawing has them, one below another down the head's side.
        #   `thick` head radii, flat as felt, smoothed only `smooth` times to keep the tip
        #   pointed, set `back` behind the head's middle, the lower ones `layer` head radii further back, behind
        #   the upper ones as the drawing tucks them: further than a petal is thick, less its line's pull toward
        #   the camera, so that each one's whole line shows over the one below, as drawn. In the drawing's soft salmon orange. The thick brows are the
        #   face's to paint.
        # - Ears the same petal, longer (the user: "her ears are petal shaped too (but longer)"), standing on the
        #   head's top corners where the drawing's are, higher than Hachiware's (`petal_ears`, the model's own
        #   dropped): each along the outline between the heights `base` [outer, inner], its tip at `tip`, the
        #   drawing's, `thick` head radii, cream.
        # - The drawing's little curl of a tail in the same colour: Hachiware's tail.
        "id": "shisa",
        "file": "Hachiware/Hachiware.blend",
        "body": "#F7EDCB",
        "shorten": 0.09,
        "drop": ("Ear",),
        "parts_color": {"Tail": "#F4AD82"},
        "petal_ears": {"base": (0.6, 0.75), "tip": (0.67, 0.93), "thick": 0.12, "sink": 0.12},
        "mane": {"color": "#F4AD82", "thick": 0.05, "back": 0.06, "smooth": 3, "layer": 0.045, "sink": 0.12,
                 "out": 0.045, "petals": [(0.56, 0.22), (0.19, -0.2), (-0.17, -0.52)]},
        "crown": {"mode": "level", "frac": 0.6, "count": 18, "size": 0.28, "colors": ["#F6B99A", "#FBD3BF"]},
    },
]

# Furuhonya's claw as the user drew it (2026-10-22): its outline traced off the drawing round its middle, as
# wide as 1, from its foot (0) up; the claw on her right (the model's -x side), its notch, the pincer's gap, at
# its top on the outer side (-x), between a small outer lobe and the big round rest. The notch is cut a little
# deeper than the trace finds it, as the drawing's line draws it. Mirrored for the claw on her left.
CLAW_OUTLINE = [
    (-0.499, 0.498), (-0.497, 0.447), (-0.489, 0.396), (-0.475, 0.346), (-0.457, 0.298), (-0.437, 0.249),
    (-0.409, 0.204), (-0.378, 0.161), (-0.336, 0.128), (-0.294, 0.096), (-0.251, 0.064), (-0.206, 0.036),
    (-0.156, 0.013), (-0.103, 0.000), (-0.048, 0.014), (0.004, 0.050), (0.049, 0.074), (0.091, 0.098),
    (0.131, 0.119), (0.169, 0.139), (0.206, 0.161), (0.242, 0.185), (0.286, 0.201), (0.330, 0.222),
    (0.379, 0.245), (0.431, 0.273), (0.466, 0.315), (0.487, 0.365), (0.497, 0.418), (0.500, 0.471),
    (0.489, 0.524), (0.485, 0.576), (0.472, 0.627), (0.455, 0.675), (0.440, 0.725), (0.419, 0.773),
    (0.389, 0.816), (0.355, 0.856), (0.317, 0.892), (0.275, 0.923), (0.232, 0.954), (0.186, 0.982),
    (0.138, 1.006), (0.087, 1.025), (0.032, 1.025), (-0.021, 1.004), (-0.055, 0.880), (-0.085, 0.820),
    (-0.105, 0.800), (-0.130, 0.820), (-0.180, 0.860), (-0.240, 0.900), (-0.300, 0.920), (-0.356, 0.878),
    (-0.387, 0.834), (-0.410, 0.787), (-0.432, 0.741), (-0.456, 0.697), (-0.475, 0.650), (-0.489, 0.600),
    (-0.500, 0.550),
]

# One petal of Shisa's mane as the user drew it (2026-10-22), the centre line of their stroke traced, as it stands
# on the left of the head as you face Shisa (Shisa's right, the model's -x side), the head to its right: its
# straight edge from its foot (0, 0) up to PETAL_TOP lies along the head's outline (the user's line runs on past
# the foot as the head's outline does); from there a gently domed top runs out to its tip, the little hooked step
# at its outer top corner (-x), and a full curve comes back from the tip down to the foot, as the official
# drawing's petals have it. Mirrored for the other side.
PETAL_OUTLINE = [
    (0.000, 0.000), (-0.100, 0.110), (-0.180, 0.235), (-0.235, 0.370), (-0.268, 0.510), (-0.281, 0.650),
    (-0.278, 0.780), (-0.270, 0.899), (-0.190, 0.905), (-0.113, 0.918), (-0.045, 0.952), (0.040, 1.008),
    (0.128, 1.042), (0.230, 1.055), (0.340, 1.056), (0.447, 1.047), (0.540, 1.022), (0.630, 0.985),
    (0.719, 0.942), (0.530, 0.745), (0.339, 0.548), (0.200, 0.360), (0.090, 0.180),
]
PETAL_TOP = (0.719, 0.942)  # where its straight edge meets its top, against the head
PETAL_TIP = (-0.270, 0.899)  # its hooked tip
# The little curl the official drawing draws in each, traced off the user's close-ups (2026-10-22) and brought into
# the petal's own frame through each one's foot, top and tip: in a mane petal, a short stroke out from the head's
# line a third of the way across, rising a little; in an ear, an arch over its middle, as an inner ear's crease.
PETAL_CURL = [(0.42, 0.51), (0.33, 0.53), (0.21, 0.568), (0.07, 0.59)]
EAR_CURL = [(0.02, 0.57), (0.12, 0.61), (0.22, 0.62), (0.31, 0.57), (0.37, 0.47)]
PEN = 0.02 * 0.9  # the world's pen in metres (src/world/Ink.ts PEN_METRES), the width a line inside a piece is drawn

# The film's islanders are shaped like Chiikawa: a round head on a short body, stubby arms, a
# fringed grass skirt in their own grey and leaves growing from the top of the head (Hitoha
# one, Futaba two). They have no ears or tail, and no face but cheek marks.
ISLANDER = {
    "file": "Chiikawa/Chiikawa.blend",
    "body": "#988584",
    # Not shortened like the cast: the islanders' heads sit higher, on a taller skirt (the
    # official plush stands about 2.5 head radii tall).
    "shorten": 0.0,
    "drop": ("Ear", "Tail"),
    "painted_face": False,
    "own_skirt": True,
    # Leaf length and width in head radii, and each leaf's lean out to the side (radians).
    "sprout": {"length": 0.5, "width": 0.32, "leans": [0.3]},
}
GREY_CROWN = {"mode": "level", "frac": 0.72, "count": 18, "size": 0.28, "colors": ["#B8ADB0", "#C9BFC2"]}

# The background crowd is never seen up close, so its islanders are light copies: each piece
# collapsed to this fraction of its triangles, no feet (always under the skirt, and the crowd
# never sits), and a coarser skirt and crown.
CROWD_DETAIL = {"Head": 0.25, "Body": 0.25, "Arm": 0.5, "Ear": 0.5}
CROWD_SKIRT = {"rows": 5, "segments": 40}
CROWD_STEPS = 16  # outline points per crown flower


def generic_islander(cid, cast_id):
    """A generic islander built from a cast member's model: its head, body and ears, without
    the tail, in the islanders' grey with a grey flower crown. Only the model's shape settings
    (subdivision, two-part ears) come from the cast member, not its colours, masks or crown."""
    cast = next(c for c in CHARACTERS if c["id"] == cast_id)
    cfg = dict(ISLANDER, id=cid, file=cast["file"], drop=("Tail",), sprout=None, crown=GREY_CROWN, crowd=True)
    cfg.update({k: cast[k] for k in ("levels", "long_ears") if k in cast})
    return cfg


CHARACTERS += [
    # The island's two named islanders, the only ones with leaves: Hitoha (one) and Futaba (two).
    dict(ISLANDER, id="islander_hitoha"),
    dict(ISLANDER, id="islander_futaba", sprout=dict(ISLANDER["sprout"], leans=[-0.6, 0.6])),
    # The background crowd: generic islanders with ears instead of leaves, as in the film's
    # crowds, as light copies.
    generic_islander("islander_round_crowd", "chiikawa"),
    generic_islander("islander_cat_crowd", "hachiware"),
    generic_islander("islander_bunny_crowd", "usagi"),
]


# ---------------------------------------------------------------------------- small helpers
def log(*a):
    print("IMPORT", *a)
    sys.stdout.flush()


def srgb(hexstr):
    h = hexstr.lstrip("#")
    return np.array([int(h[i:i + 2], 16) / 255.0 for i in (0, 2, 4)], dtype=np.float32)


def kind_of(name):
    for k in BODY_KINDS:
        if name.startswith(k):
            return k
    for layer, prefixes in DECAL_LAYERS.items():
        if name.startswith(prefixes):
            return "decal:" + layer
    return None


def bounds(bms):
    lo = Vector((1e9, 1e9, 1e9))
    hi = Vector((-1e9, -1e9, -1e9))
    for bm in bms:
        for v in bm.verts:
            lo = Vector(map(min, lo, v.co))
            hi = Vector(map(max, hi, v.co))
    return lo, hi


def evaluated_bmesh(obj, depsgraph):
    """World-space copy of an object's evaluated mesh (modifiers and pose applied), UVs kept."""
    ev = obj.evaluated_get(depsgraph)
    me = ev.to_mesh()
    bm = bmesh.new()
    bm.from_mesh(me)
    bm.transform(ev.matrix_world)
    ev.to_mesh_clear()
    orient_outward(bm)
    bm.verts.ensure_lookup_table()
    bm.verts.index_update()
    return bm


def orient_outward(bm):
    """Turn every connected piece of a mesh to face outward.

    Mirrored copies (one of each pair of ears, arms or legs) come out inside-out from a
    negative scale, and some objects hold mirrored pieces of their own: Momonga's head carries
    its cheek tufts, half of them inside-out, and each foot has an inside-out toe. The game
    draws front faces for the body and back faces for the outline, so an inside-out piece
    shows as a dark patch. A piece faces outward when its signed volume is positive.
    """
    seen = set()
    for face in bm.faces:
        if face in seen:
            continue
        piece, stack = [], [face]
        seen.add(face)
        while stack:
            f = stack.pop()
            piece.append(f)
            for e in f.edges:
                for g in e.link_faces:
                    if g not in seen:
                        seen.add(g)
                        stack.append(g)
        verts = {v for f in piece for v in f.verts}
        center = sum((v.co for v in verts), Vector()) / len(verts)
        volume = 0.0
        for f in piece:
            vs = [v.co - center for v in f.verts]
            for i in range(1, len(vs) - 1):
                volume += vs[0].dot(vs[i].cross(vs[i + 1]))
        if volume < 0:
            bmesh.ops.reverse_faces(bm, faces=piece)


def limb_lift(lo, hi, rf):
    """Outline lift for an arm or leg (bounds in final space).

    The game pulls a limb's outline hull toward the camera by 0.045 * headR / 0.45 metres
    times the lift, so the outline shows where the limb crosses the body. A hull pulled
    further than the limb is thick would cover the limb itself, as on Momonga's thin arms
    and feet, so the pull stays under about half the limb's thickness.
    """
    half = min(hi.x - lo.x, hi.y - lo.y, hi.z - lo.z) / 2.0
    pull = 0.045 * rf / 0.45
    return max(0.2, min(1.0, 0.55 * half / pull))


def outline_x(bms, z):
    """How far out from the middle the meshes reach at height z, seen from the front: their widest there."""
    out = 0.0
    for bm in bms:
        for e in bm.edges:
            a, b = e.verts[0].co, e.verts[1].co
            if a.z != b.z and (a.z - z) * (b.z - z) <= 0.0:
                out = max(out, abs(a.x + (b.x - a.x) * (z - a.z) / (b.z - a.z)))
    return out


def pen_stroke_bm(points, y, width=PEN):
    """A line drawn with the pen through `points` [(x, z)] on a face in the XZ plane at `y`, facing the front (-y):
    bent smoothly through them (Chaikin) as a hand's line, `width` wide with round ends. One-sided, as only its
    front is ever seen, pressed to the face it is drawn on."""
    pts = [Vector(p) for p in points]
    for _ in range(2):
        bent = [pts[0]]
        for a, b in zip(pts, pts[1:]):
            bent += [a.lerp(b, 0.25), a.lerp(b, 0.75)]
        pts = bent + [pts[-1]]
    r = width / 2.0
    ways = [(pts[min(i + 1, len(pts) - 1)] - pts[max(i - 1, 0)]).normalized() for i in range(len(pts))]
    sides = [Vector((-d.y, d.x)) for d in ways]
    ends = 6
    # Up its left, round its far end, back down its right and round its near end.
    outline = [p + n * r for p, n in zip(pts, sides)]
    outline += [pts[-1] + (sides[-1] * math.cos(a) + ways[-1] * math.sin(a)) * r
                for a in (math.pi * k / ends for k in range(1, ends))]
    outline += [p - n * r for p, n in reversed(list(zip(pts, sides)))]
    outline += [pts[0] - (sides[0] * math.cos(a) + ways[0] * math.sin(a)) * r
                for a in (math.pi * k / ends for k in range(1, ends))]
    bm = bmesh.new()
    face = bm.faces.new([bm.verts.new((p.x, y, p.y)) for p in outline])
    face.normal_update()
    if face.normal.y > 0.0:
        face.normal_flip()
    bmesh.ops.triangulate(bm, faces=bm.faces[:])
    return bm


def petal_piece(foot, top, side, y, thick, sink, smooth, tip=None, curl=None):
    """PETAL_OUTLINE as a plush piece standing on a head `y` deep: its straight edge from `foot` to `top` (x + iz as
    complex numbers), as drawn on the -x side (side -1) and mirrored on the +x side. With `tip`, the drawing's tip
    drawn out to it and the rest following (an ear, longer than a petal), else only turned and sized. Its straight
    edge moved `sink` into the head, a root out of sight that holds it on; `thick` thick, flat as felt (a face that
    bends folds its ink over itself, which shows as hairlines), smoothed only `smooth` times to keep the tip
    pointed. With `curl` (points in the drawing), that line drawn on its face with the pen, laid as the piece is:
    returned as a piece of its own, (piece, line)."""
    edge = PETAL_OUTLINE.index(PETAL_TOP)
    p1, p2 = complex(-side * PETAL_TOP[0], PETAL_TOP[1]), complex(-side * PETAL_TIP[0], PETAL_TIP[1])
    det = p1.real * p2.imag - p1.imag * p2.real

    def lay(x, z):
        q = complex(-side * x, z)
        if tip is None:
            return foot + (top - foot) * q / p1
        # A point q = s p1 + t p2 of the drawing goes to foot + s (top - foot) + t (tip - foot).
        return foot + ((q.real * p2.imag - q.imag * p2.real) * (top - foot)
                       + (p1.real * q.imag - p1.imag * q.real) * (tip - foot)) / det

    points = [lay(x, z) for x, z in PETAL_OUTLINE[: edge + 1]]
    along = (top - foot) / abs(top - foot)
    inward = along * complex(0.0, side) * sink
    points += [top + inward, foot + inward]
    slab = L.outline_slab_bm([(p.real, p.imag) for p in points], thick)
    piece = L.fuse([slab], voxel=0.0025, smooth_iterations=smooth, smooth_lambda=0.5, target_tris=700)
    slab.free()
    for v in piece.verts:
        v.co.y += y
    if curl is None:
        return piece
    # On its front face, 3 mm off it (check_flicker.py), the pen's line where its hull draws none.
    line = pen_stroke_bm([(p.real, p.imag) for p in (lay(x, z) for x, z in curl)], y - thick / 2.0 - 0.003)
    return piece, line


# ---------------------------------------------------------------------------- textures and masks
_TEXTURES = {}


def texture_of(obj):
    """The object's texture as a float array (H, W, 3), bottom row first, sRGB 0..1."""
    for slot in obj.material_slots:
        mat = slot.material
        if not mat or not mat.node_tree:
            continue
        for node in mat.node_tree.nodes:
            if node.type == "TEX_IMAGE" and node.image:
                img = node.image
                key = bpy.path.abspath(img.filepath)
                if key not in _TEXTURES:
                    w, h = img.size
                    px = np.empty(w * h * 4, dtype=np.float32)
                    img.pixels.foreach_get(px)
                    _TEXTURES[key] = px.reshape(h, w, 4)[..., :3]
                return _TEXTURES[key]
    return None


def sample_bilinear(tex, u, v):
    h, w = tex.shape[:2]
    x = np.mod(u, 1.0) * (w - 1)
    y = np.mod(v, 1.0) * (h - 1)
    x0 = np.floor(x).astype(int)
    y0 = np.floor(y).astype(int)
    x1 = np.minimum(x0 + 1, w - 1)
    y1 = np.minimum(y0 + 1, h - 1)
    fx = (x - x0)[:, None]
    fy = (y - y0)[:, None]
    return (tex[y0, x0] * (1 - fx) * (1 - fy) + tex[y0, x1] * fx * (1 - fy)
            + tex[y1, x0] * (1 - fx) * fy + tex[y1, x1] * fx * fy)


def vertex_mask(bm, tex, mcfg):
    """0..1 per vertex: how close the texture under it is to the mask's detect colour."""
    uv_layer = bm.loops.layers.uv.active
    n = len(bm.verts)
    if tex is None or uv_layer is None:
        return np.zeros(n)
    us, vs, idx = [], [], []
    for f in bm.faces:
        for loop in f.loops:
            uv = loop[uv_layer].uv
            us.append(uv.x)
            vs.append(uv.y)
            idx.append(loop.vert.index)
    cols = sample_bilinear(tex, np.array(us), np.array(vs))
    bg = srgb(mcfg["background"])
    d = srgb(mcfg["detect"]) - bg
    m = np.clip(((cols - bg) @ d) / float(d @ d), 0.0, 1.0)
    sums = np.zeros(n)
    counts = np.zeros(n)
    np.add.at(sums, idx, m)
    np.add.at(counts, idx, 1.0)
    return sums / np.maximum(counts, 1.0)


def mask_image(tex, mcfg):
    """The mask the game samples per pixel, in the model's UV space (MASK_SIZE square, bottom
    row first): 1 where the second colour is painted. Lightly blurred so the painted edge
    becomes a smooth curve."""
    ys = (np.arange(MASK_SIZE) + 0.5) / MASK_SIZE
    xs = (np.arange(MASK_SIZE) + 0.5) / MASK_SIZE
    uu, vv = np.meshgrid(xs, ys)
    cols = sample_bilinear(tex, uu.ravel(), vv.ravel()).reshape(MASK_SIZE, MASK_SIZE, 3)
    bg = srgb(mcfg["background"])
    d = srgb(mcfg["detect"]) - bg
    m = np.clip(((cols - bg) @ d) / float(d @ d), 0.0, 1.0)
    for _ in range(2):  # 3x3 box blur, twice
        p = np.pad(m, 1, mode="edge")
        m = sum(p[1 + dy:1 + dy + MASK_SIZE, 1 + dx:1 + dx + MASK_SIZE]
                for dy in (-1, 0, 1) for dx in (-1, 0, 1)) / 9.0
    return m


def write_mask(m, path):
    """Write a mask image (bottom row first) as the grey lossless WebP the game loads."""
    img = (np.clip(m[::-1], 0.0, 1.0) * 255.0 + 0.5).astype(np.uint8)  # top row first, like the source
    rgba = np.stack([img, img, img, np.full_like(img, 255)], axis=-1)
    L.write_webp(path, rgba)
    log("mask texture", path)
    return path


def drawn_mask(p, eye_z, rf, cfg):
    """How far inside a character's drawn mask points of its head are, in metres ((n, 3) array; negative
    outside it): its `cap` (see over_cap_edge) or its `mark` (see in_mark)."""
    return over_cap_edge(p, eye_z, rf, cfg["cap"]) if cfg.get("cap") else in_mark(p, eye_z, rf, cfg["mark"])


def in_mark(p, eye_z, rf, mark):
    """How far inside a four-pointed star on the face (Rakko's scar) points of a head are, in metres
    ((n, 3) array; negative outside it): seen from the front, its middle `at` (head radii across and
    over the eye line), its points `size` from it and its waist `waist` of that between them, turned
    `turn` radians; only on the head's front."""
    u0, v0 = mark["at"]
    a = mark.get("turn", 0.0)
    outer, inner = mark["size"], mark["size"] * mark.get("waist", 0.36)
    star = np.array([((outer if i % 2 == 0 else inner) * math.cos(a + i * math.pi / 4),
                      (outer if i % 2 == 0 else inner) * math.sin(a + i * math.pi / 4)) for i in range(8)])
    q = np.stack([p[:, 0] / rf - u0, (p[:, 2] - eye_z) / rf - v0], 1)
    start, run = star, np.roll(star, -1, 0) - star
    t = np.clip(((q[:, None, :] - start[None]) * run[None]).sum(2) / (run * run).sum(1)[None], 0.0, 1.0)
    dist = np.sqrt(((q[:, None, :] - start[None] - t[..., None] * run[None]) ** 2).sum(2)).min(1)
    inside = np.zeros(len(q), dtype=bool)
    for (ax, ay), (bx, by) in zip(star, np.roll(star, -1, 0)):
        crosses = (ay > q[:, 1]) != (by > q[:, 1])
        xi = ax + (q[:, 1] - ay) * (bx - ax) / ((by - ay) if abs(by - ay) > 1e-12 else 1e-12)
        inside ^= crosses & (q[:, 0] < xi)
    signed = np.where(inside, dist, -dist) * rf
    return np.where(p[:, 1] < 0.0, signed, -rf)


def over_cap_edge(p, eye_z, rf, cap):
    """How far over a drawn cap's edge (see the `cap` option) points of a head are, in metres ((n, 3)
    array; negative under it): its edge `front` head radii over the eye line in front and behind and
    `side` at the sides, rising between them as the square of the sine of the angle round the head."""
    round_head = np.sin(np.arctan2(p[:, 0], -p[:, 1])) ** 2
    return p[:, 2] - (eye_z + rf * (cap["front"] + (cap["side"] - cap["front"]) * round_head))


def round_uv(bm, name="MaskUV", pad=0.02):
    """Gives a head coordinates for a mask drawn on it evenly all round: round the head (its back at the
    image's edges) and up it, each face unwrapped about its own angle so none spans the seam. The
    downloaded models' own UVs crowd and stretch the head unevenly, which leaves a drawn mask's edge
    ragged. Returns the heights the coordinates span."""
    z0 = min(v.co.z for v in bm.verts) - pad
    z1 = max(v.co.z for v in bm.verts) + pad
    uv = bm.loops.layers.uv.new(name)
    for f in bm.faces:
        c = f.calc_center_median()
        ac = math.atan2(c.x, -c.y)
        for loop in f.loops:
            co = loop.vert.co
            a = math.atan2(co.x, -co.y) if math.hypot(co.x, co.y) > 1e-6 else ac
            a += 2.0 * math.pi * round((ac - a) / (2.0 * math.pi))
            loop[uv].uv = (a / (2.0 * math.pi) + 0.5, (co.z - z0) / (z1 - z0))
    return z0, z1


def front_view(bvhs, colour, rf, eye_z, size=512):
    """Shapes (BVH trees of a character facing -Y, centred on the Z axis) seen from the front over the
    face's canvas (two head radii, centred on the eye line), flat coloured, as the guide to paint a face
    over: (FA.PAINT_SIZE square RGBA, top row first). colour(which, points) gives the colours (sRGB) where
    the view meets the which-th of bvhs, at those points. For a head the downloaded models do not paint
    as the game shows it (the Siren's, the little mermaids', Kurimanju's drawn cap)."""
    which = np.full((size, size), -1, dtype=np.int32)
    where = np.zeros((size, size, 3), dtype=np.float64)
    for row in range(size):
        z = eye_z + rf * (1.0 - 2.0 * (row + 0.5) / size)
        for col in range(size):
            x = rf * (2.0 * (col + 0.5) / size - 1.0)
            best = None
            for k, bvh in enumerate(bvhs):
                hit = bvh.ray_cast(Vector((x, -10.0, z)), Vector((0.0, 1.0, 0.0)))
                if hit[0] is not None and (best is None or hit[3] < best):
                    best = hit[3]
                    which[row, col] = k
                    where[row, col] = hit[0][:]
    img = np.zeros((size, size, 4), dtype=np.float32)
    for k in range(len(bvhs)):
        sel = which == k
        if sel.any():
            img[sel, :3] = colour(k, where[sel])
            img[sel, 3] = 1.0
    return FA.resample(img, FA.PAINT_SIZE)


def surface_map(bm, size, dilate=4, uv=None):
    """For each texel of a size x size image in the mesh's UV space (its `uv` layer, or its active
    one; bottom row first), the mesh's 3D point there, NaN where no face covers it. Texels just
    outside the faces take their neighbours' points, so a texture sampled across a UV seam stays
    consistent."""
    uv_layer = bm.loops.layers.uv[uv] if uv else bm.loops.layers.uv.active
    pos = np.full((size, size, 3), np.nan)
    for f in bm.faces:
        loops = f.loops
        for i in range(1, len(loops) - 1):
            tri = (loops[0], loops[i], loops[i + 1])
            uv = np.array([[lp[uv_layer].uv.x * size - 0.5, lp[uv_layer].uv.y * size - 0.5] for lp in tri])
            pts = np.array([lp.vert.co[:] for lp in tri])
            x0, y0 = np.maximum(np.floor(uv.min(axis=0)).astype(int), 0)
            x1, y1 = np.minimum(np.ceil(uv.max(axis=0)).astype(int), size - 1)
            if x1 < x0 or y1 < y0:
                continue
            (ua, va), (ub, vb), (uc, vc) = uv
            det = (vb - vc) * (ua - uc) + (uc - ub) * (va - vc)
            if abs(det) < 1e-12:
                continue
            xs, ys = np.meshgrid(np.arange(x0, x1 + 1), np.arange(y0, y1 + 1))
            la = ((vb - vc) * (xs - uc) + (uc - ub) * (ys - vc)) / det
            lb = ((vc - va) * (xs - uc) + (ua - uc) * (ys - vc)) / det
            lc = 1.0 - la - lb
            inside = (la >= -1e-6) & (lb >= -1e-6) & (lc >= -1e-6)
            if inside.any():
                p = la[..., None] * pts[0] + lb[..., None] * pts[1] + lc[..., None] * pts[2]
                pos[ys[inside], xs[inside]] = p[inside]
    for _ in range(dilate):
        empty = np.isnan(pos[..., 0])
        padded = np.pad(pos, ((1, 1), (1, 1), (0, 0)), constant_values=np.nan)
        near = np.stack([padded[1 + dy:1 + dy + size, 1 + dx:1 + dx + size]
                         for dy, dx in ((-1, 0), (1, 0), (0, -1), (0, 1))])
        found = ~np.isnan(near[..., 0])
        count = found.sum(axis=0)
        total = np.where(found[..., None], near, 0.0).sum(axis=0)
        take = empty & (count > 0)
        pos[take] = total[take] / count[take][:, None]
    return pos


def raise_mask_edge(image, bm, vertex_values, lift):
    """Raise the lower edge of a mask's painted area by `lift` metres up the head, keeping its
    shape: a point stays painted only if the point `lift` below it on the head is painted too.
    The rise eases off to nothing at the back of the head. Returns the new mask image and the
    new per-vertex values, which place the crown.
    """
    size = image.shape[0]
    pos = surface_map(bm, size)
    uv_layer = bm.loops.layers.uv.active
    tris = bm.calc_loop_triangles()
    bvh = BVHTree.FromPolygons([v.co for v in bm.verts], [[lp.vert.index for lp in t] for t in tris])
    corners = [[lp.vert.co for lp in t] for t in tris]
    uvs = [[lp[uv_layer].uv.to_3d() for lp in t] for t in tris]

    def sample(u, v):
        x = min(max(u * size - 0.5, 0.0), size - 1.0)
        y = min(max(v * size - 0.5, 0.0), size - 1.0)
        x0, y0 = int(x), int(y)
        x1, y1 = min(x0 + 1, size - 1), min(y0 + 1, size - 1)
        fx, fy = x - x0, y - y0
        return ((image[y0, x0] * (1 - fx) + image[y0, x1] * fx) * (1 - fy)
                + (image[y1, x0] * (1 - fx) + image[y1, x1] * fx) * fy)

    def rise_at(x, y):
        t = min(1.0, max(0.0, (abs(math.atan2(x, -y)) - 1.2) / (2.3 - 1.2)))
        return lift * (1.0 - t * t * (3.0 - 2.0 * t))

    def below(p, rise):
        hit, _, index, _ = bvh.find_nearest(Vector((p[0], p[1], p[2] - rise)))
        if hit is None:
            return 1.0
        uv = geometry.barycentric_transform(hit, *corners[index], *uvs[index])
        return sample(uv.x, uv.y)

    out = image.copy()
    for row, col in zip(*np.nonzero(~np.isnan(pos[..., 0]) & (image > 0.02))):
        p = pos[row, col]
        rise = rise_at(p[0], p[1])
        if rise > 1e-4:
            out[row, col] = min(image[row, col], below(p, rise))
    values = vertex_values.copy()
    for v in bm.verts:
        rise = rise_at(v.co.x, v.co.y)
        if rise > 1e-4 and values[v.index] > 0.02:
            values[v.index] = min(values[v.index], below(v.co, rise))
    return out, values


def raise_guide_edge(head, mcfg, lift_px):
    """The painting guide's front view of the head, with the painted area's lower edge raised
    lift_px rows above the eye line, to match the game."""
    size = head.shape[0]
    eye_row = size // 2
    bg = srgb(mcfg["background"])
    d = srgb(mcfg["detect"]) - bg
    m = np.clip(((head[..., :3] - bg) @ d) / float(d @ d), 0.0, 1.0) * (head[..., 3] > 0.5)
    out = head.copy()
    for x in range(head.shape[1]):
        rows = np.nonzero(m[:eye_row, x] > 0.5)[0]
        if len(rows) == 0:
            continue
        lo = max(0, rows.max() - lift_px + 1)
        # Everything from the raised edge down to the eye line is bare face, soft fringe included.
        strip = out[lo:eye_row, x, :3]
        strip[m[lo:eye_row, x] > 0.02] = bg
    return out


# ---------------------------------------------------------------------------- face bake
def bake_face(scene, groups, center_src, rf_src, skin_bg=None):
    """Render each group of face decals from the front into a full-canvas layer.

    The camera frame matches the game's face canvas: 2 head radii wide, centred on the eye
    line, image x along the character's +x (after the turn to face -Y), image up along +z.
    Layers are FA.PAINT_SIZE square. A group named "_guide" is rendered as it is (the bare
    head, as a painting guide) without the ink treatment.
    """
    tmpdir = tempfile.mkdtemp(prefix="face_bake_")
    cam_data = bpy.data.cameras.new("face_cam")
    cam_data.type = "ORTHO"
    cam_data.ortho_scale = 2.0 * rf_src
    cam_data.clip_start = 0.01
    cam_data.clip_end = 200.0
    cam = bpy.data.objects.new("face_cam", cam_data)
    scene.collection.objects.link(cam)
    # The source models face +Y; look back along -Y so +x of the image is the model's -x,
    # which becomes +x once the model is turned to face -Y.
    cam.location = (center_src.x, center_src.y + 50.0, center_src.z)
    cam.rotation_euler = (math.pi / 2, 0.0, math.pi)
    scene.camera = cam

    scene.render.engine = "BLENDER_WORKBENCH"
    sh = scene.display.shading
    sh.light = "FLAT"
    sh.color_type = "TEXTURE"
    sh.show_object_outline = False
    sh.show_specular_highlight = False
    sh.show_cavity = False
    sh.show_shadows = False
    sh.show_backface_culling = False
    scene.display.render_aa = "16"
    scene.render.film_transparent = True
    scene.view_settings.view_transform = "Standard"
    scene.view_settings.look = "None"
    scene.render.resolution_x = FA.PAINT_SIZE
    scene.render.resolution_y = FA.PAINT_SIZE
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"

    everything = list(scene.objects)
    layers = {}
    for name, objs in groups.items():
        if not objs:
            continue
        for o in everything:
            o.hide_render = o not in objs
        for o in objs:
            for slot in o.material_slots:
                if slot.material and slot.material.node_tree:
                    for node in slot.material.node_tree.nodes:
                        if node.type == "TEX_IMAGE":
                            slot.material.node_tree.nodes.active = node
        scene.render.filepath = os.path.join(tmpdir, f"{name}.png")
        bpy.ops.render.render(write_still=True)
        img = bpy.data.images.load(scene.render.filepath)
        w, h = img.size
        px = np.empty(w * h * 4, dtype=np.float32)
        img.pixels.foreach_get(px)
        bpy.data.images.remove(img)
        arr = px.reshape(h, w, 4)[::-1].copy()  # top row first, like a canvas
        if name == "_guide":
            layers[name] = arr
            continue
        if name == "skin" and skin_bg is not None:
            # Keep only what is painted on the head; the plain skin colour drops out.
            # Painted features are coloured; the skin and its anti-aliased edge are not.
            dist = np.linalg.norm(arr[..., :3] - skin_bg, axis=-1)
            chroma = arr[..., :3].max(axis=-1) - arr[..., :3].min(axis=-1)
            arr[..., 3] *= np.clip((dist - 0.04) / 0.10, 0.0, 1.0) * np.clip((chroma - 0.04) / 0.06, 0.0, 1.0)
        # Film ink: screen the art with dark brown, so black becomes brown and light colours stay.
        arr[..., :3] = 1.0 - (1.0 - INK) * (1.0 - arr[..., :3])
        layers[name] = arr
    for o in everything:
        o.hide_render = False
    bpy.data.objects.remove(cam)
    return layers


def pack_layers(layers, margin=2, max_width=1024):
    """Crop each layer to its paint and pack the crops into one atlas, in rows, tallest first.

    Returns the atlas and, per layer, its place on the face canvas (x, y, w, h) and in the
    atlas (ax, ay).
    """
    crops = []
    for name, arr in layers.items():
        ys, xs = np.nonzero(arr[..., 3] > 0.004)
        if len(xs) == 0:
            continue
        x0, x1 = max(0, xs.min() - margin), min(arr.shape[1], xs.max() + margin + 1)
        y0, y1 = max(0, ys.min() - margin), min(arr.shape[0], ys.max() + margin + 1)
        crops.append((name, x0, y0, arr[y0:y1, x0:x1]))
    limit = max([max_width] + [crop.shape[1] for *_, crop in crops])
    rects, placed, x, y, row, width = {}, [], 0, 0, 0, 1
    for name, x0, y0, crop in sorted(crops, key=lambda c: -c[3].shape[0]):
        h, w = crop.shape[:2]
        if x and x + w > limit:
            x, y, row = 0, y + row + margin, 0
        rects[name] = {"x": int(x0), "y": int(y0), "w": int(w), "h": int(h), "ax": int(x), "ay": int(y)}
        placed.append((x, y, crop))
        x += w + margin
        row = max(row, h)
        width = max(width, x - margin)
    atlas = np.zeros((max(1, y + row), width, 4), dtype=np.float32)
    for ax, ay, crop in placed:
        atlas[ay:ay + crop.shape[0], ax:ax + crop.shape[1]] = crop
    return (np.clip(atlas, 0.0, 1.0) * 255.0 + 0.5).astype(np.uint8), rects


# ---------------------------------------------------------------------------- posing
def pose_arms(arm_obj):
    """Lower the T-pose arms to a relaxed rest: down and a little forward."""
    for pb in arm_obj.pose.bones:
        if not pb.name.startswith("Arm"):
            continue
        rest = pb.bone.matrix_local.copy()
        head = rest.to_translation()
        side = 1.0 if pb.bone.tail_local.x > head.x else -1.0
        # The source faces +Y: rotating about Y lowers the arm, about Z swings it forward.
        rot = Matrix.Rotation(side * ARM_FORWARD, 4, "Z") @ Matrix.Rotation(side * ARM_DOWN, 4, "Y")
        pb.matrix = Matrix.Translation(head) @ rot @ Matrix.Translation(-head) @ rest
    bpy.context.view_layer.update()


def head_join(head_bm, body_bms, eye_z, dz=0.01, gap=0.012):
    """Height where the head grows wider than the body below it: the visible join."""
    head_prof = radial_profile([head_bm], dz)
    body_prof = radial_profile(body_bms, dz)
    z = min(v.co.z for v in head_bm.verts)
    while z < eye_z and radius_at(head_prof, z, dz) < radius_at(body_prof, z, dz) + gap:
        z += dz * 0.5
    return z


def vertical_squeeze(join, drop):
    """Height map that lowers everything above `join` by `drop` and squeezes what is below
    to fit, keeping the ground at 0 and the map continuous at the join."""
    k = (join - drop) / join

    def squeeze(z):
        return z - drop if z >= join else z * k
    return squeeze


def part_pivot(parts, kind, bm):
    """The pivot a rigid part (arm, ear, tail) hangs from, by kind and side."""
    if kind == "Tail":
        return parts[L.TAIL]["pivot"]
    lo, hi = bounds([bm])
    left = (lo.x + hi.x) / 2 < 0
    if kind == "Arm":
        return parts[L.ARM_L if left else L.ARM_R]["pivot"]
    return parts[L.EAR_L if left else L.EAR_R]["pivot"]


def bone_heads(arm_obj, prefix, G):
    """Final-space heads of the bones whose names start with prefix, keyed by side (-1 / +1)."""
    out = {}
    for b in arm_obj.data.bones:
        if b.name.startswith(prefix) and b.parent and not b.parent.name.startswith(prefix):
            p = G @ (arm_obj.matrix_world @ b.head_local)
            out[-1 if p.x < 0 else 1] = p
    return out


# ---------------------------------------------------------------------------- radial profiles
def radial_profile(bms, dz):
    """Largest distance from the Z axis per height bin, with empty bins (between the
    mesh's vertex rings) filled by interpolating the rings above and below."""
    prof = {}
    for bm in bms:
        for v in bm.verts:
            b = int(math.floor(v.co.z / dz))
            r = math.hypot(v.co.x, v.co.y)
            if r > prof.get(b, 0.0):
                prof[b] = r
    if not prof:
        return prof
    keys = sorted(prof)
    filled = dict(prof)
    for a, b in zip(keys, keys[1:]):
        for k in range(a + 1, b):
            t = (k - a) / (b - a)
            filled[k] = prof[a] + (prof[b] - prof[a]) * t
    return filled


def radius_at(prof, z, dz, window=1):
    b = int(math.floor(z / dz))
    return max(prof.get(b + k, 0.0) for k in range(-window, window + 1))


# ---------------------------------------------------------------------------- conversion
def convert(cfg, source):
    cid = cfg["id"]
    path = os.path.join(source, cfg["file"])
    log("opening", path)
    bpy.ops.wm.open_mainfile(filepath=path, load_ui=False, use_scripts=False)
    scene = bpy.context.scene
    arm = next(o for o in scene.objects if o.type == "ARMATURE")
    levels = dict(DEFAULT_LEVELS, **cfg.get("levels", {}))

    body_objs, decals = {}, {}
    for o in scene.objects:
        if o.type != "MESH":
            continue
        k = kind_of(o.name)
        if k is None:
            continue
        if k.startswith("decal:"):
            decals.setdefault(k[6:], []).append(o)
        elif k not in cfg.get("drop", ()):
            body_objs[o] = k
    for o, k in body_objs.items():
        for m in o.modifiers:
            if m.type == "SUBSURF":
                m.levels = levels[k]
                m.render_levels = levels[k]
            elif m.type == "NODES":
                m.show_viewport = False  # fur from a node library that is not shipped
                m.show_render = False

    pose_arms(arm)
    dg = bpy.context.evaluated_depsgraph_get()
    src = {o: evaluated_bmesh(o, dg) for o in body_objs}

    head_obj = next(o for o, k in body_objs.items() if k == "Head")
    hlo, hhi = bounds([src[head_obj]])
    alo, _ = bounds(src.values())
    c = Vector(((hlo.x + hhi.x) / 2, (hlo.y + hhi.y) / 2, alo.z))
    # Metres a source unit; `scale` makes one taller than the model it is built from (Rakko).
    metres = SCALE * cfg.get("scale", 1.0)
    G = Matrix.Scale(metres, 4) @ Matrix.Rotation(math.pi, 4, "Z") @ Matrix.Translation(-c)

    # Face decal boxes in final space give the face layout.
    boxes = {}
    for layer, objs in decals.items():
        for o in objs:
            bm = evaluated_bmesh(o, dg)
            bm.transform(G)
            boxes.setdefault(layer, []).append(bounds([bm]))
            bm.free()
    rf = metres * (hhi.x - hlo.x) / 2.0
    eye_z = sum((lo.z + hi.z) / 2 for lo, hi in boxes["eyes"]) / len(boxes["eyes"])

    def face_boxes(layer):
        out = []
        for lo, hi in sorted(boxes.get(layer, []), key=lambda b: (b[0].x + b[1].x) / 2):
            out.append([round((lo.x + hi.x) / 2 / rf, 4), round(((lo.z + hi.z) / 2 - eye_z) / rf, 4),
                        round((hi.x - lo.x) / 2 / rf, 4), round((hi.z - lo.z) / 2 / rf, 4)])
        return out

    face = {name: face_boxes(name) for name in DECAL_LAYERS if boxes.get(name)}
    if "mouth" in decals:
        # The mouth layout uses the inner mouth only; the lip line and chin are drawn with it.
        inner = [b for o, b in zip(decals["mouth"], boxes["mouth"]) if o.name.startswith("Mouth")]
        if inner:
            lo, hi = inner[0]
            face["mouth"] = [round((lo.x + hi.x) / 2 / rf, 4), round(((lo.z + hi.z) / 2 - eye_z) / rf, 4),
                             round((hi.x - lo.x) / 2 / rf, 4), round((hi.z - lo.z) / 2 / rf, 4)]

    face_atlas = None
    if cfg.get("painted_face", True):
        # Bake the face art (and Momonga's painted nose) before anything is changed.
        groups = {name: decals.get(name, []) for name in DECAL_LAYERS}
        if cfg.get("skin_layer"):
            groups = {"skin": [head_obj], **groups}
        groups["_guide"] = list(body_objs)
        center_src = Vector((c.x, c.y, eye_z / metres + c.z))
        baked = bake_face(scene, groups, center_src, rf / metres,
                          skin_bg=srgb(cfg.get("mask", {}).get("background", "#FFFFFF")))
        # The face is painted by hand in art/faces/<id>/: layers, and an expressions.txt saying
        # which layers make up each expression. A folder without them starts from the model's own
        # art. The neutral face's paint says where the eyes and mouth are, for the anchors.
        paint_dir = os.path.join(FACES_SRC, cid)
        guide = baked.pop("_guide")
        raise_edge = (cfg.get("mask") or {}).get("raise_edge", 0.0)
        if raise_edge:
            guide = raise_guide_edge(guide, cfg["mask"], int(round(raise_edge * FA.PAINT_SIZE / 2)))
        FA.write_guide(os.path.join(paint_dir, "_guide.png"), guide)
        layers, expressions = FA.load_face(baked, paint_dir, log=log)
        face.update(FA.face_layout(layers, expressions))
        small = {name: FA.downsample(arr, FA.PAINT_SIZE // FACE_SIZE) for name, arr in layers.items()}
        atlas, rects = pack_layers(small)
        L.write_webp(os.path.join(OUT_FACES, f"{cid}.webp"), atlas)
        face_atlas = {"url": f"models/faces/{cid}.webp", "size": FACE_SIZE, "layers": rects,
                      "expressions": expressions}
        log(f"face: {len(expressions)} expressions from {len(rects)} layers, atlas {atlas.shape[1]} x {atlas.shape[0]}")

    # Masks need the source UVs, so read them before the geometry moves. The game samples a
    # mask texture with those UVs, so the cap edge is as smooth as the painting; the
    # per-vertex values here only help place the crown.
    mcfg = cfg.get("mask")
    masks = {}
    mask_tex = None
    for o, k in body_objs.items():
        if mcfg and k in mcfg["kinds"]:
            tex = texture_of(o)
            masks[o] = vertex_mask(src[o], tex, mcfg)
            log("mask", o.name, "vertices over 0.5:", int((masks[o] > 0.5).sum()), "of", len(masks[o]))
            if mask_tex is None and tex is not None:
                mask_tex = tex
    for bm in src.values():
        bm.transform(G)

    # ------------------------------------------------------------------ parts and pivots
    parts = [{"pivot": Vector((0.0, 0.0, 0.0)), "parent": -1} for _ in range(L.MAX_PARTS)]
    arms = bone_heads(arm, "Arm", G)
    legs = bone_heads(arm, "Leg", G)
    ears = bone_heads(arm, "Ear", G)
    tails = [G @ (arm.matrix_world @ b.head_local) for b in arm.data.bones if b.name == "Tail"]
    for side, idx in ((-1, L.ARM_L), (1, L.ARM_R)):
        if side in arms:
            parts[idx]["pivot"] = arms[side]
    for side, idx in ((-1, L.FOOT_L), (1, L.FOOT_R)):
        if side in legs:
            parts[idx]["pivot"] = legs[side]
    for side, idx in ((-1, L.EAR_L), (1, L.EAR_R)):
        if side in ears:
            parts[idx]["pivot"] = ears[side]
            parts[idx]["parent"] = L.HEAD
    if tails:
        parts[L.TAIL]["pivot"] = tails[0]
    # The head turns on its own about its neck, in its middle where it grows wider than the body under it,
    # to keep the eyes on you (the user, 2026-10-22); the ears and leaves go with it.
    body_src = [src[o] for o, k in body_objs.items() if k == "Body"]
    join = head_join(src[head_obj], body_src, eye_z)
    parts[L.HEAD]["pivot"] = Vector((0.0, 0.0, join))

    # ------------------------------------------------------------------ film proportions
    # The downloaded models stand taller than the film's characters: a round head on a long
    # body. Lower everything above the head's join with the body and squeeze the body below
    # the join to fit, so the face, ears and arms keep their shapes and the feet stay put.
    drop = cfg.get("shorten", 0.0)
    if drop > 0.0:
        squeeze = vertical_squeeze(join, drop)
        shifts = {}
        for o, k in body_objs.items():
            if k in ("Arm", "Ear", "Tail"):
                pivot = part_pivot(parts, k, src[o])
                shifts[o] = squeeze(pivot.z) - pivot.z
        for o, k in body_objs.items():
            if k in ("Head", "Body"):
                for v in src[o].verts:
                    v.co.z = squeeze(v.co.z)
            elif o in shifts:  # rigid parts move with the point they hang from
                for v in src[o].verts:
                    v.co.z += shifts[o]
            # Legs stay on the ground; the body settles onto them.
        for idx, p in enumerate(parts):
            if idx not in (L.FOOT_L, L.FOOT_R):
                p["pivot"].z = squeeze(p["pivot"].z)
        eye_z = squeeze(eye_z)
        for layer in boxes:
            boxes[layer] = [(Vector((lo.x, lo.y, squeeze(lo.z))), Vector((hi.x, hi.y, squeeze(hi.z))))
                            for lo, hi in boxes[layer]]
        log(f"SHORTEN {cid}: head joins the body at {join:.3f} m, lowered {drop:.3f} m")

    head_bm = src[head_obj]

    # The mask image the game samples, now that the head is in its final shape, with the
    # painted area's lower edge raised where the character asks for it.
    mask_texture = None
    if mask_tex is not None:
        image = mask_image(mask_tex, mcfg)
        lift = mcfg.get("raise_edge", 0.0) * rf
        if lift and head_obj in masks:
            image, masks[head_obj] = raise_mask_edge(image, head_bm, masks[head_obj], lift)
            log(f"mask: edge raised {lift:.3f} m on the face")
        mask_texture = write_mask(image, os.path.join(OUT_MASKS, f"{cid}.webp"))
    cap = cfg.get("cap") or cfg.get("mark")
    if cap:
        # A cap or a mark the model it is built from does not paint (Kurimanju's chestnut cap, Rakko's star
        # scar), drawn here as its mask (see drawn_mask), in coordinates of its own all round the head
        # (round_uv), finer than a painted mask's for a mark's points.
        round_uv(head_bm)
        pos = surface_map(head_bm, 2 * MASK_SIZE, uv="MaskUV")
        found = ~np.isnan(pos[..., 0])
        image = np.zeros(pos.shape[:2])
        image[found] = 0.5 + 0.5 * drawn_mask(pos[found], eye_z, rf, cfg) / (cap.get("soft", CAP_SOFT) * rf)
        mask_texture = write_mask(np.clip(image, 0.0, 1.0), os.path.join(OUT_MASKS, f"{cid}.webp"))
        masks[head_obj] = np.ones(len(head_bm.verts))

    ear_cfg = cfg.get("ears")
    if ear_cfg:
        # Ears that sit elsewhere than on the model it is built from (Kurimanju's tiny ears, low on the head's
        # sides): each turned about the head's middle, down its side, by `turn` degrees, as deep in the head as
        # it was, and made `scale` as big about its root.
        hlo, hhi = bounds([head_bm])
        middle = (hlo + hhi) / 2.0
        head_bvh = BVHTree.FromBMesh(head_bm)

        def to_surface(way):
            hit = head_bvh.ray_cast(middle, way)[0]
            return (hit - middle).length if hit is not None else 0.0

        for o, k in body_objs.items():
            if k != "Ear":
                continue
            lo, hi = bounds([src[o]])
            side = -1 if (lo.x + hi.x) / 2 < 0 else 1
            idx = L.EAR_L if side < 0 else L.EAR_R
            root = parts[idx]["pivot"].copy()
            turn = Matrix.Rotation(math.radians(side * ear_cfg["turn"]), 4, "Y")
            way0 = (root - middle).normalized()
            way1 = turn.to_3x3() @ way0
            sunk = (root - middle).length - to_surface(way0)
            moved = middle + way1 * (to_surface(way1) + sunk)
            src[o].transform(Matrix.Translation(moved) @ turn @ Matrix.Scale(ear_cfg.get("scale", 1.0), 4)
                             @ Matrix.Translation(-root))
            parts[idx]["pivot"] = moved
    # Claws standing up from the head's upper sides where its ears were (Furuhonya's), on the ears' parts so they
    # bob as ears do, and antennae on its top, on the ears' second parts: pieces of their own, on the head.
    extra = []  # (bmesh, colour, part, whether its line is pulled toward the camera to show over what is behind)
    claw_cfg, ant_cfg = cfg.get("claws"), cfg.get("antennae")
    if claw_cfg or ant_cfg:
        crest = BVHTree.FromBMesh(head_bm)
    if claw_cfg:
        cw, ct = claw_cfg["width"] * rf, claw_cfg["thick"] * rf
        ch = cw * max(z for _, z in CLAW_OUTLINE)
        for side, idx in ((-1, L.EAR_L), (1, L.EAR_R)):
            # Its middle at the origin, the notch on the outer side.
            outline = [(-side * x * cw, z * cw - ch / 2) for x, z in CLAW_OUTLINE]
            flat = L.outline_slab_bm(outline if side < 0 else list(reversed(outline)), ct)
            claw = L.fuse([flat], voxel=0.006, smooth_iterations=8, smooth_lambda=0.8, target_tris=900)
            flat.free()
            # Puffed like a pillow, thinner toward its edges, so that from the side it is round, not a slab.
            for v in claw.verts:
                d = min(1.0, math.hypot(v.co.x / (cw / 2), v.co.z / (ch / 2)))
                v.co.y *= 0.45 + 0.55 * math.sqrt(1.0 - d * d)
            at = Vector((side * claw_cfg["x"] * rf, claw_cfg.get("back", 0.0) * rf, eye_z + claw_cfg["z"] * rf))
            lean = Matrix.Rotation(math.radians(side * claw_cfg["tilt"]), 4, "Y")
            L.transformed(claw, Matrix.Translation(at) @ lean)
            # It turns where it meets the head, under its middle.
            foot = crest.ray_cast(at, lean.to_3x3() @ Vector((0.0, 0.0, -1.0)))[0]
            parts[idx]["pivot"] = foot if foot is not None else at
            parts[idx]["parent"] = L.HEAD
            extra.append((claw, claw_cfg["color"], idx, True))
    # Where the outline is, seen from the front (the body's below the head), for pieces laid along it.
    seen = [head_bm] + [src[o] for o, k in body_objs.items() if k == "Body"]
    mane_cfg = cfg.get("mane")
    if mane_cfg:
        # A mane either side of the head (Shisa's), on the head: petals in the shape the user drew (PETAL_OUTLINE),
        # each laid with its straight edge along the outline between the heights [top, foot] in `petals` (see the
        # config), `out` outside it: the drawing turned and sized to fit there. Each a piece of its own, outlined,
        # the upper ones a little in front of the lower as the official drawing overlaps them, `layer` apart.
        out = mane_cfg.get("out", 0.0) * rf
        for side in (-1, 1):
            for k, heights in enumerate(mane_cfg["petals"]):
                top, foot = (complex(side * (outline_x(seen, eye_z + h * rf) + out), eye_z + h * rf) for h in heights)
                y = (mane_cfg["back"] + k * mane_cfg.get("layer", 0.0)) * rf
                petal, curl = petal_piece(foot, top, side, y, mane_cfg["thick"] * rf, mane_cfg["sink"] * rf,
                                          mane_cfg.get("smooth", 3), curl=PETAL_CURL)
                extra.append((petal, mane_cfg["color"], L.HEAD, True))
                extra.append((curl, LINE, L.HEAD, False, 0.0))
    petal_ears = cfg.get("petal_ears")
    if petal_ears:
        # Ears in the mane's petal shape, only longer (Shisa's), in place of the model's own: each the drawing's
        # straight edge along the outline at the head's top corner between the heights `base` [outer, inner], its
        # tip drawn up to `tip` (x out from the head's middle, z up from the eyes), as deep as the model's ears
        # stood; on the ears' parts so that they twitch as ears do, turning where they stand on the head.
        for side, idx in ((-1, L.EAR_L), (1, L.EAR_R)):
            foot, top = (complex(side * outline_x(seen, eye_z + h * rf), eye_z + h * rf) for h in petal_ears["base"])
            tip = complex(side * petal_ears["tip"][0] * rf, eye_z + petal_ears["tip"][1] * rf)
            y = parts[idx]["pivot"].y
            ear, curl = petal_piece(foot, top, side, y, petal_ears["thick"] * rf, petal_ears["sink"] * rf,
                                    petal_ears.get("smooth", 3), tip, curl=EAR_CURL)
            middle = (foot + top) / 2.0
            parts[idx]["pivot"] = Vector((middle.real, y, middle.imag))
            parts[idx]["parent"] = L.HEAD
            extra.append((ear, cfg["body"], idx, True))
            extra.append((curl, LINE, idx, False, 0.0))
    if ant_cfg:
        hx, hy, hz = (s * rf for s in ant_cfg["size"])
        for side, idx in ((-1, L.EAR_L2), (1, L.EAR_R2)):
            x = side * ant_cfg["x"] * rf
            foot = crest.ray_cast(Vector((x, 0.0, 10.0)), Vector((0.0, 0.0, -1.0)))[0]
            lean = Matrix.Rotation(side * ant_cfg["lean"], 3, "Y")
            middle = foot + lean @ Vector((0.0, 0.0, hz - ant_cfg["sink"] * rf))
            extra.append((L.ellipsoid_bm(middle, (hx, hy, hz), lean, u=12, v=8), ant_cfg["color"], idx, False))
            parts[idx]["pivot"] = foot
            parts[idx]["parent"] = L.HEAD

    if (cap or ear_cfg or extra) and cfg.get("painted_face", True):
        # The guide baked from the model it is built from shows that model's head: draw this one's as the
        # game shows it, flat in its colours, the cap on it, the ears where they now are and the pieces added
        # (claws, a mane, petal ears and their lines).
        head_rgb, cap_rgb = srgb(cfg["body"]), srgb(cap["color"]) if cap else None
        tints = cfg.get("parts_color", {})
        groups = {}
        for o, k in body_objs.items():
            if k != "Head":
                L.append_bm(groups.setdefault(tints.get(k, cfg["body"]), bmesh.new()), src[o])
        shapes = [BVHTree.FromBMesh(head_bm)] + [BVHTree.FromBMesh(g) for g in groups.values()]
        rgbs = [head_rgb] + [srgb(hexed) for hexed in groups]
        for bm, hexed, *_ in extra:
            shapes.append(BVHTree.FromBMesh(bm))
            rgbs.append(srgb(hexed))
        for g in groups.values():
            g.free()

        def guide_colour(k, pts):
            if k == 0 and cap:
                return np.where((drawn_mask(pts, eye_z, rf, cfg) > 0.0)[:, None], cap_rgb, head_rgb)
            return np.broadcast_to(rgbs[k], (len(pts), 3))

        FA.write_guide(os.path.join(FACES_SRC, cid, "_guide.png"), front_view(shapes, guide_colour, rf, eye_z))
        log("face: guide drawn from its own head")
    lo_all, hi_all = bounds(list(src.values()) + [piece[0] for piece in extra])
    hlo_f, hhi_f = bounds([head_bm])
    head_top = hhi_f.z
    body_col = L.hex_color(cfg["body"])
    colors = {k: L.hex_color(v) for k, v in cfg.get("parts_color", {}).items()}

    crowd = cfg.get("crowd", False)
    # Furred (Rakko): no pen's line round the head and body, where the game draws strokes of fur instead.
    line = 0.0 if cfg.get("fur") else 1.0
    pieces, anchors = [], {}
    ear_axes = {}
    for o, k in body_objs.items():
        if crowd and k == "Leg":
            continue  # always under the skirt
        bm = src[o]
        lo, hi = bounds([bm])
        side = -1 if (lo.x + hi.x) / 2 < 0 else 1
        col = colors.get(k, body_col)
        # 1 where the mask texture applies; the texture decides the colour per pixel.
        flag = 1.0 if o in masks else 0.0

        def get_mask(i, flag=flag):
            return flag

        if k == "Head":
            def attr(co, i, col=col, get_mask=get_mask):
                uv = (0.5 + co.x / (2.0 * rf), 0.5 + (co.z - eye_z) / (2.0 * rf))
                return L.attrs(col, L.HEAD, paint=L.PAINT_BODY, uv=uv, mask=get_mask(i), outline=line)
        elif k == "Body":
            def attr(co, i, col=col):
                return L.attrs(col, L.BODY, outline=line)
        elif k == "Arm":
            idx = L.ARM_L if side < 0 else L.ARM_R
            shoulder = parts[idx]["pivot"]
            tip = max(bm.verts, key=lambda v: (v.co - shoulder).length).co.copy()
            anchors["handL" if side < 0 else "handR"] = tip
            lift = limb_lift(lo, hi, rf)
            log(f"outline lift {o.name}: {lift:.2f}")

            def attr(co, i, col=col, idx=idx, lift=lift):
                return L.attrs(col, idx, lift=lift)
        elif k == "Leg":
            idx = L.FOOT_L if side < 0 else L.FOOT_R
            lift = limb_lift(lo, hi, rf)
            log(f"outline lift {o.name}: {lift:.2f}")

            def attr(co, i, col=col, idx=idx, lift=lift):
                return L.attrs(col, idx, lift=lift)
        elif k == "Ear":
            lo_idx, hi_idx = (L.EAR_L, L.EAR_L2) if side < 0 else (L.EAR_R, L.EAR_R2)
            base = parts[lo_idx]["pivot"]
            if cfg.get("long_ears"):
                tip = max(bm.verts, key=lambda v: v.co.z).co.copy()
                axis = tip - base
                length = axis.length
                axis.normalize()
                parts[hi_idx]["pivot"] = base + axis * (length * 0.5)
                parts[hi_idx]["parent"] = lo_idx
                ear_axes[side] = (base, axis, length)

                def attr(co, i, col=col, lo_idx=lo_idx, hi_idx=hi_idx, base=base, axis=axis, length=length,
                         get_mask=get_mask):
                    t = (co - base).dot(axis) / length
                    return L.attrs(col, lo_idx, hi_idx, L.smoothstep(0.42, 0.58, t), mask=get_mask(i))
            else:
                def attr(co, i, col=col, lo_idx=lo_idx, get_mask=get_mask):
                    return L.attrs(col, lo_idx, mask=get_mask(i))
        else:  # Tail
            def attr(co, i, col=col):
                return L.attrs(col, L.TAIL)
        detail = CROWD_DETAIL.get(k, 1.0) if crowd else 1.0
        pieces.append(L.Piece(L.decimate_bm(bm, detail) if detail < 1.0 else bm.copy(), attr, indexed=True))

    # The claws and antennae (Furuhonya's) and the mane's petals (Shisa's), the claws' and petals' lines pulled toward
    # the camera as a limb's are, so that they show where they stand over the head or over one another.
    # A fifth field 0 gives a piece no hull: a line drawn with the pen (Shisa's curls), the pen itself.
    for bm, hexed, idx, lifted, *hull in extra:
        lo, hi = bounds([bm])
        lift = limb_lift(lo, hi, rf) if lifted else 0.0

        def extra_attr(co, col=L.hex_color(hexed), idx=idx, lift=lift, outline=hull[0] if hull else 1.0):
            return L.attrs(col, idx, lift=lift, outline=outline)

        pieces.append(L.Piece(bm, extra_attr))

    # ------------------------------------------------------------------ leaf sprout
    # Islanders' leaves grow from the top of the head, each turned out to the side by its lean.
    top = hi_all.z
    sprout = cfg.get("sprout")
    if sprout:
        length, width = sprout["length"] * rf, sprout["width"] * rf
        for lean in sprout["leans"]:
            m = (Matrix.Translation(Vector((0.08 * rf * math.sin(lean), 0.0, head_top - 0.04 * rf)))
                 @ Matrix.Rotation(lean, 4, "Y") @ Matrix.Rotation(-0.12, 4, "X"))

            def leaf_attr(co, inv=m.inverted()):
                local = inv @ co
                return L.attrs(body_col, L.SPROUT, paint=L.PAINT_LEAF, uv=(local.x / (width * 0.5), local.z / length))

            pieces.append(L.Piece(L.transformed(L.leaf_bm(length, width, 0.05 * rf), m), leaf_attr))
            top = max(top, (m @ Vector((0.0, 0.0, length))).z)
        parts[L.SPROUT]["pivot"] = Vector((0.0, 0.0, head_top - 0.03 * rf))
        parts[L.SPROUT]["parent"] = L.HEAD

    # ------------------------------------------------------------------ anchors
    head_bvh = BVHTree.FromBMesh(head_bm)

    def hit_front(x, z):
        loc, _, _, _ = head_bvh.ray_cast(Vector((x, -5.0, z)), Vector((0.0, 1.0, 0.0)))
        return loc if loc is not None else Vector((x, hlo_f.y, z))

    for name, b in zip(("eyeL", "eyeR"), sorted(face["eyes"], key=lambda b: b[0])):
        anchors[name] = hit_front(b[0] * rf, eye_z + b[1] * rf)
    mx, my = face["mouth"][0] * rf, face["mouth"][1] * rf + eye_z
    anchors["mouth"] = hit_front(mx, my)
    anchors["head"] = Vector((0.0, 0.0, head_top + 0.02))
    anchors["top"] = Vector((0.0, 0.0, top + 0.02))
    head_prof = radial_profile([head_bm], 0.01)
    side_z = eye_z + 0.3 * rf
    side_r = radius_at(head_prof, side_z, 0.01)
    anchors["sideL"] = Vector((-side_r, -0.05, side_z))
    anchors["sideR"] = Vector((side_r, -0.05, side_z))

    # ------------------------------------------------------------------ outfit fit
    body_bms = [src[o] for o, k in body_objs.items() if k == "Body"]
    leg_bms = [src[o] for o, k in body_objs.items() if k == "Leg"]
    dz = 0.01
    body_prof = radial_profile(body_bms, dz)
    leg_prof = radial_profile(leg_bms, dz)
    gap = SKIRT["gap"]
    if "--debug" in sys.argv:
        for i in range(0, 40):
            zz = hlo_f.z - 0.05 + i * 0.01
            log(f"  z {zz:.3f}  head r {radius_at(head_prof, zz, dz, 0):.3f}  body r {radius_at(body_prof, zz, dz, 0):.3f}"
                f"  legs r {radius_at(leg_prof, zz, dz, 0):.3f}")
    # The skirt is tied just below the hands, as in the film.
    hands = min(min(v.co.z for v in src[o].verts) for o, k in body_objs.items() if k == "Arm")
    waist = hands - SKIRT["below_hands"]
    parts[L.SKIRT]["pivot"] = Vector((0.0, 0.0, waist))

    def envelope(zz):
        return max(radius_at(body_prof, zz, dz), radius_at(leg_prof, zz, dz))

    r_top = max(envelope(waist), radius_at(head_prof, waist, dz)) + gap
    r_hem = max(r_top, cfg.get("skirt_hem", SKIRT["hem"]) * rf)

    def grass_skirt(color):
        return O.skirt_piece(envelope, waist, SKIRT["bottom"], r_top, r_hem, gap, bell=SKIRT["bell"],
                             count=SKIRT["count"], wave=SKIRT["wave"], color=color,
                             **(CROWD_SKIRT if crowd else {}))

    # Islanders wear a grass skirt of their own, in their own grey.
    own_skirt = None
    if cfg.get("own_skirt"):
        piece, own_skirt = grass_skirt(cfg["body"])
        pieces.append(piece)

    collection = bpy.data.collections.new("export")
    scene.collection.children.link(collection)
    obj = L.assemble(cid, pieces, collection, keep_uv="MaskUV" if cap else "UVMap" if masks else None)
    tris = sum(len(p.vertices) - 2 for p in obj.data.polygons)

    # Where the head's underside meets the body's side: the neck, under the head's edge.
    blo, _ = bounds(body_bms)
    neck = blo.z
    while neck < hlo_f.z + rf and radius_at(head_prof, neck, 0.01, 0) < radius_at(body_prof, neck, dz, 0):
        neck += dz
    fur = None
    if cfg.get("fur"):
        # The fur's strokes are laid round the middle of the head and of the body below it, measured in from
        # their edges as on balls of their radii (see CharacterMaterial's FUR).
        body_z = (blo.z + neck) / 2.0
        fur = dict(cfg["fur"])
        fur["head"] = L.to_three((hlo_f + hhi_f) / 2.0) + [round(rf, 5)]
        fur["body"] = L.to_three(Vector((0.0, 0.0, body_z))) + [round(radius_at(body_prof, body_z, dz), 5)]

    mask_color = mcfg["color"] if mcfg else cap["color"] if cap else None
    rig = {
        "version": 3,
        "id": cid,
        "source": "downloaded Chiikawa Models (" + cfg["file"] + ")",
        "height": round(hi_all.z, 5),
        "width": round(2.0 * rf, 5),
        "headR": round(rf, 5),
        "eyeY": round(eye_z, 5),
        "outline": LINE,
        # The arms hang under the curve of the head, so raised higher than about 25 degrees above
        # level they would sink into it: the game stops them here and brings them forward instead.
        "armReach": round(ARM_DOWN + math.radians(25.0), 4),
        "maskColor": mask_color,
        # A drawn cap with no line along its edge (Furuhonya's, as the user's picture of her has it).
        **({"maskLine": False} if cap and cap.get("line") is False else {}),
        "maskTexture": f"models/masks/{cid}.webp" if mask_texture else None,
        "parts": [{"pivot": L.to_three(p["pivot"]), "parent": p["parent"]} for p in parts],
        "anchors": {k: L.to_three(v) for k, v in anchors.items()},
        "patterns": {"skirt": own_skirt},
        **({"fur": fur} if fur else {}),
        "face": face,
        "faceAtlas": face_atlas,
    }
    model_path = os.path.join(OUT_MODELS, f"{cid}.glb")
    L.export_glb(obj, model_path, rig)
    log(f"BUILT {cid}: {len(obj.data.vertices)} verts, {tris} tris, height {hi_all.z:.3f} m,"
        f" head radius {rf:.3f} m -> {model_path}")

    # ------------------------------------------------------------------ the island outfit
    cr = cfg.get("crown")
    if not cr:
        for bm in src.values():
            bm.free()
        return {"id": cid, "model": model_path, "outfit": None}
    size = cr["size"] * rf
    thickness = 0.06 * rf
    if cr["mode"] == "level":
        zc = eye_z + cr["frac"] * (head_top - eye_z)

        def height_at(theta, zc=zc):
            return zc
    elif cr["mode"] == "cap":
        # Sitting on a drawn cap's level edge (Furuhonya's), its lower petals over it.
        zc = eye_z + cfg["cap"]["front"] * rf + 0.4 * size

        def height_at(theta, zc=zc):
            return zc
    elif cr["mode"] == "ear_base":
        ear_bottom = min(min(v.co.z for v in src[o].verts) for o, k in body_objs.items() if k == "Ear")
        zc = ear_bottom + 0.04

        def height_at(theta, zc=zc):
            return zc
    else:  # sit level along the lower edge of the painted cap, as in the film
        hm = masks[head_obj]
        edge = []
        for v in head_bm.verts:
            a = math.atan2(v.co.x, -v.co.y)
            if v.co.z > eye_z and hm[v.index] > 0.5 and abs(a) < 1.2:
                edge.append(v.co.z)
        edge.sort()
        # The garland sits on the cap, its lower petals along the cap's edge.
        zc = (edge[len(edge) // 10] if edge else eye_z + 0.6 * (head_top - eye_z)) + 0.4 * size

        def height_at(theta, zc=zc):
            return zc
    outfit_pieces = O.crown_pieces(head_bvh, height_at, cr["count"], size, thickness, cr["colors"],
                                   arc=cr.get("arc"), push=cr.get("push", 1.4),
                                   **({"steps": CROWD_STEPS} if crowd else {}))
    # A character with a skirt of its own wears only the crown.
    skirt_info = None
    if own_skirt is None:
        skirt, skirt_info = grass_skirt(O.SKIRT_GREEN)
        outfit_pieces.append(skirt)
    outfit_path = os.path.join(OUT_OUTFITS, f"island_{cid}.glb")
    outfit = O.export_outfit(f"island_{cid}", outfit_pieces, outfit_path, cid, skirt_info, collection)
    otris = sum(len(p.vertices) - 2 for p in outfit.data.polygons)
    skirt_note = (f"skirt {waist:.3f}->{skirt_info['bottom']} m (tied at r {r_top:.3f}, hem r {r_hem:.3f})"
                  if skirt_info else "no skirt")
    log(f"OUTFIT {cid}: crown {cr['count']} flowers, {skirt_note}, {otris} tris -> {outfit_path}")

    # ------------------------------------------------------------------ their own clothes
    # What they wear instead of the island outfit (Rakko's cape), an asset of its own like it.
    own_path = None
    cape = cfg.get("cape")
    if cape:
        roll = cape["roll"] * rf
        roll_out = cape.get("roll_out", cape["roll"]) * rf
        # The band round the neck, its top tucked under the head's edge, snug round the body.
        z_roll = neck - 0.4 * roll
        ring = envelope(z_roll) + gap + 0.8 * roll_out
        cape_parts = O.cape_pieces(envelope, z_roll, roll, ring, SKIRT["bottom"] + 0.005, waist,
                                   max(cape["hem"] * rf, ring), gap, math.radians(cape["opening"]), roll_out=roll_out)
        own_path = os.path.join(OUT_OUTFITS, f"cape_{cid}.glb")
        own = O.export_outfit(f"cape_{cid}", cape_parts, own_path, cid, None, collection, kind="cape")
        ctris = sum(len(p.vertices) - 2 for p in own.data.polygons)
        log(f"OWN {cid}: cape, roll at {z_roll:.3f} m round r {ring:.3f}, {ctris} tris -> {own_path}")

    for bm in src.values():
        bm.free()
    return {"id": cid, "model": model_path, "outfit": outfit_path, "own": own_path}


# ---------------------------------------------------------------------------- previews
def render_previews(results):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    spacing = 1.3
    chars, outfits = [], []
    for i, r in enumerate(results):
        x = (i - (len(results) - 1) / 2) * spacing
        # In what they wear: their own clothes if they have them (Rakko's cape), else the island outfit.
        for path, bucket in ((r["model"], chars), (r.get("own") or r["outfit"], outfits)):
            if not path:
                continue
            before = set(bpy.data.objects)
            bpy.ops.import_scene.gltf(filepath=path)
            for o in bpy.data.objects:
                if o not in before and o.type == "MESH":
                    # Bake the importer's axis conversion into the mesh so turning works.
                    o.data.transform(o.matrix_basis)
                    o.matrix_basis = Matrix.Identity(4)
                    o.rotation_mode = "XYZ"
                    o.location.x = x
                    bucket.append(o)
    cam = L.setup_preview(scene)
    width = max(1, len(results)) * 340
    for o in chars + outfits:
        o.hide_render = False
    for p in L.render_turnaround(scene, cam, chars + outfits, OUT_PREVIEWS, "cast", width, 560,
                                 ortho_scale=spacing * len(results) * 1.02, target_z=0.62):
        log("PREVIEW", p)
    for o in outfits:
        o.hide_render = True
    for p in L.render_turnaround(scene, cam, chars, OUT_PREVIEWS, "cast_plain", width, 560,
                                 ortho_scale=spacing * len(results) * 1.02, target_z=0.62):
        log("PREVIEW", p)
    for o in outfits:
        o.hide_render = False
    os.makedirs(os.path.dirname(OUT_BLEND), exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=OUT_BLEND, compress=True)
    log("SAVED", OUT_BLEND)


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    only = argv[argv.index("--only") + 1] if "--only" in argv else None
    previews = "--no-previews" not in argv
    source = argv[argv.index("--source") + 1] if "--source" in argv else DEFAULT_SOURCE
    results = []
    for cfg in CHARACTERS:
        if only and cfg["id"] != only:
            continue
        results.append(convert(cfg, source))
    if previews and results:
        render_previews(results)


# Run by Blender; build_siren.py imports its helpers without converting anything.
if __name__ == "__main__":
    main()
