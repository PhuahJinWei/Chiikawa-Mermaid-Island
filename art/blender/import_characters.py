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
]

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


def surface_map(bm, size, dilate=4):
    """For each texel of a size x size image in the mesh's UV space (bottom row first), the
    mesh's 3D point there, NaN where no face covers it. Texels just outside the faces take
    their neighbours' points, so a texture sampled across a UV seam stays consistent."""
    uv_layer = bm.loops.layers.uv.active
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
    G = Matrix.Scale(SCALE, 4) @ Matrix.Rotation(math.pi, 4, "Z") @ Matrix.Translation(-c)

    # Face decal boxes in final space give the face layout.
    boxes = {}
    for layer, objs in decals.items():
        for o in objs:
            bm = evaluated_bmesh(o, dg)
            bm.transform(G)
            boxes.setdefault(layer, []).append(bounds([bm]))
            bm.free()
    rf = SCALE * (hhi.x - hlo.x) / 2.0
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
        center_src = Vector((c.x, c.y, eye_z / SCALE + c.z))
        baked = bake_face(scene, groups, center_src, rf / SCALE,
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
    if tails:
        parts[L.TAIL]["pivot"] = tails[0]

    # ------------------------------------------------------------------ film proportions
    # The downloaded models stand taller than the film's characters: a round head on a long
    # body. Lower everything above the head's join with the body and squeeze the body below
    # the join to fit, so the face, ears and arms keep their shapes and the feet stay put.
    drop = cfg.get("shorten", 0.0)
    if drop > 0.0:
        body_src = [src[o] for o, k in body_objs.items() if k == "Body"]
        join = head_join(src[head_obj], body_src, eye_z)
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
    lo_all, hi_all = bounds(src.values())
    hlo_f, hhi_f = bounds([head_bm])
    head_top = hhi_f.z
    body_col = L.hex_color(cfg["body"])
    colors = {k: L.hex_color(v) for k, v in cfg.get("parts_color", {}).items()}

    crowd = cfg.get("crowd", False)
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
                return L.attrs(col, L.BODY, paint=L.PAINT_BODY, uv=uv, mask=get_mask(i))
        elif k == "Body":
            def attr(co, i, col=col):
                return L.attrs(col, L.BODY)
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
    obj = L.assemble(cid, pieces, collection, keep_uv="UVMap" if masks else None)
    tris = sum(len(p.vertices) - 2 for p in obj.data.polygons)

    mask_color = mcfg["color"] if mcfg else None
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
        "maskTexture": f"models/masks/{cid}.webp" if mask_texture else None,
        "parts": [{"pivot": L.to_three(p["pivot"]), "parent": p["parent"]} for p in parts],
        "anchors": {k: L.to_three(v) for k, v in anchors.items()},
        "patterns": {"skirt": own_skirt},
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

    for bm in src.values():
        bm.free()
    return {"id": cid, "model": model_path, "outfit": outfit_path}


# ---------------------------------------------------------------------------- previews
def render_previews(results):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    spacing = 1.3
    chars, outfits = [], []
    for i, r in enumerate(results):
        x = (i - (len(results) - 1) / 2) * spacing
        for path, bucket in ((r["model"], chars), (r["outfit"], outfits)):
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


main()
