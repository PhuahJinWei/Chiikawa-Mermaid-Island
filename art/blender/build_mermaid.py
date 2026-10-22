"""The little mermaids, the Siren's two small companions in the forbidden cave, as a game character.

The user, 2026-10-22: the two are "exactly similar, and they are actually just a mini version of siren, same
3d model shape (with some minor differences). They only have 1 facial expression". So her shape is the
Siren's, built with art/blender/build_siren.py's own helpers, and what differs follows the user's drawings of
her from the front, the back and the side, and the official plush (`[3d model] mermaid`):

- no bun-ears and no black hair cap: a rust-red patch over the top of her head, rounding down to just above
  her eyes in front and a little higher behind, and two tiny black antennae standing on it;
- a face of two dot eyes and a round open mouth, her one expression, whose first layers are templates for
  the user to paint over (art/faces/mermaid/); no whiskers;
- a rust tail.

She is 0.7 of Chiikawa's height to her antennae's tips, as `cave interior 7` and `8` measure the two beside
the cast and the Siren. One model for both: the game shows it twice.

Run (from the project root; it opens the downloaded Chiikawa model, so with scripts disabled):
    "C:/Program Files/Blender Foundation/Blender 5.2/blender.exe" --background --factory-startup
        --disable-autoexec --python art/blender/build_mermaid.py -- [--no-previews] [--source <models folder>]

Outputs:
    public/models/mermaid.glb          her model in the game's vertex format, with rig data
    public/models/faces/mermaid.webp   her face's painted layers (art/faces/mermaid/), packed
    public/models/masks/mermaid.webp   her crown's patch, which the game samples per pixel
    art/faces/mermaid/_guide.png       her bare head from the front, to paint her face over
    art/faces/mermaid/*.png            first face layers, written only where none exist
    art/previews/mermaid_*.png         front, three-quarter, side and back renders
    art/blender/mermaid.blend          the model, for opening in Blender

Coordinates are Blender's, as build_siren.py's: Z up, she faces -Y, sits on z = 0 and is centred on the Z
axis. Her shapes are built in head radii and scaled to her height at the end.
"""

import math
import os
import sys

import bmesh
import bpy
import numpy as np
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import build_siren as S  # noqa: E402
import charlib as L  # noqa: E402
import face_art as FA  # noqa: E402
import import_characters as IC  # noqa: E402

ID = "mermaid"
FACE_DIR = os.path.join(IC.FACES_SRC, ID)
OUT_BLEND = os.path.join(IC.ROOT, "art", "blender", "mermaid.blend")

# 0.7 of Chiikawa's height (0.91 m, public/models/chiikawa.glb) to her antennae's tips: `cave interior 7` and
# `8` measure the two at 0.67 and 0.75 of Chiikawa beside her, and 0.2 of the Siren.
HEIGHT = 0.7 * 0.90997

# Colours (STYLE_GUIDE.md): the cast's white, her crown's rust-red patch, the black of her antennae, the
# band's pink (the Siren's) and her rust tail.
WHITE = S.WHITE
PATCH = "#C8462E"
ANTENNA = S.CAP
BAND = S.BAND
TAIL = "#C2553E"

# As finely made as the cast, being about their size, not the Siren: her head as smooth as theirs (the
# downloaded head at this level of smoothing), her body this many sides round and its rows this far apart
# (head radii).
HEAD_LEVEL = 1
SEGMENTS = 40
ROW = 0.07
# Her scales bigger than the Siren's for her size, so the pen does not crowd them: rows this far apart down
# her tail (head radii), and this many round its bowl and round its curl, as the plush rows them.
SCALE_ROW = 0.32
SCALES_ROUND = 10
SCALES_CURL = 6

# ---------------------------------------------------------------------------- what differs from the Siren
# Her crown's patch, as the user's drawings of her draw it (head radii; the head 245 px round in each): a band
# over the top of her head between two edges about 0.32 either side of her middle, its ends rounding down over
# her forehead to just above her eyes and behind her a little higher. Each end as the front and the back view
# see it: its half width at heights over the eye line, from its tip up to where its edges run straight.
PATCH_FRONT = [(0.09, 0.0), (0.104, 0.105), (0.12, 0.139), (0.136, 0.164), (0.153, 0.184), (0.185, 0.214),
               (0.218, 0.237), (0.251, 0.258), (0.283, 0.276), (0.316, 0.288), (0.349, 0.298), (0.381, 0.306),
               (0.414, 0.312), (0.447, 0.318), (0.5, 0.32)]
PATCH_BACK = [(0.188, 0.0), (0.202, 0.115), (0.218, 0.147), (0.234, 0.169), (0.251, 0.188), (0.283, 0.218),
              (0.316, 0.24), (0.349, 0.261), (0.381, 0.278), (0.414, 0.289), (0.447, 0.301), (0.479, 0.306),
              (0.55, 0.32)]
MASK_SOFT = 0.03  # how soft the mask's edge is, in head radii either side of it (see build_siren.cap_mask)
MASK_SIZE = IC.MASK_SIZE  # her head is about half the cast's, so their mask's size is plenty
# Her two antennae: little rounded lobes standing on the top of her head this far either side of her middle,
# leaning out this much (radians), sunk this far into it; their half sizes across, front to back and up (the
# drawings' loops, 0.12 high).
ANTENNAE = {"x": 0.122, "lean": 0.25, "sink": 0.02, "size": (0.032, 0.027, 0.07)}

# ---------------------------------------------------------------------------- her face's first layers
# Drawn after the user's drawings of her into art/faces/mermaid/ when that folder has no layers yet, for
# painting over: her one face, two dot eyes and a round open mouth (the plush's startled "O"), and the dots
# closed to dashes for her blinks. Lines in black (the game turns them to the film's brown), as thick as the
# drawings draw them: 0.045 head radii, 34 px on her canvas.
PEN_PX = 34.0
EYES = (-0.194, 0.194)
EYE_DOT = 0.041
MOUTH = (0.0, -0.388, 0.099, 0.216)  # its middle (across, up) and half width and height, to its line's middle
BLACK = (0.0, 0.0, 0.0)
EXPRESSIONS_TXT = """# The little mermaids: which layers make up each expression (see ../README.md).
# They have one face, which every expression shows (the user, 2026-10-22). The first layers were drawn by
# art/blender/build_mermaid.py as templates to paint over, after the user's drawings of them; it never
# overwrites them. eyes closed is for her blinks.
Neutral: eyes open + mouth open
"""


def log(*a):
    print("MERMAID", *a)
    sys.stdout.flush()


# ---------------------------------------------------------------------------- her crown's patch
def patch_sdf(p):
    """How far inside her crown's patch points of her head are ((n, 3) array, head radii; negative off it):
    within its two edges over the top of her head and down to its ends, in front as the front view sees it
    (PATCH_FRONT) and behind as the back view does (PATCH_BACK), the same either side of her middle. The
    distance is to its edge as those views see it, which on her forehead and over her crown is the distance
    along the head."""
    out = np.empty(len(p))
    ax = np.abs(p[:, 0])
    z = p[:, 2] - S.EYE
    front = p[:, 1] < 0.0
    for sel, profile in ((front, PATCH_FRONT), (~front, PATCH_BACK)):
        zs = np.array([a for a, _ in profile] + [3.0])
        ws = np.array([b for _, b in profile] + [profile[-1][1]])
        edge = np.stack([ws, zs], 1)
        q = np.stack([ax[sel], z[sel]], 1)
        start, run = edge[:-1], edge[1:] - edge[:-1]
        t = np.clip(((q[:, None, :] - start[None]) * run[None]).sum(2) / (run * run).sum(1)[None], 0.0, 1.0)
        dist = np.sqrt(((q[:, None, :] - start[None] - t[..., None] * run[None]) ** 2).sum(2)).min(1)
        inside = (q[:, 1] >= zs[0]) & (q[:, 0] < np.interp(q[:, 1], zs, ws))
        out[sel] = np.where(inside, dist, -dist)
    return out


def patch_mask(head):
    """The patch's mask image in her head's own coordinates (see build_siren.head_bm), bottom row first: 1
    where it is rust-red, its edge soft over a few centimetres (MASK_SOFT) for the game's shader to ink along
    its middle."""
    pos = IC.surface_map(head, MASK_SIZE)
    found = ~np.isnan(pos[..., 0])
    d = np.zeros(pos.shape[:2])
    d[found] = 0.5 + 0.5 * patch_sdf(pos[found]) / MASK_SOFT
    return np.clip(d, 0.0, 1.0)


def antenna_bm(side, head_bvh):
    """An antenna (side -1 her right, +1 her left): a little rounded lobe standing on the top of her head,
    leaning out. Returns (bmesh, the point it stands on)."""
    x = side * ANTENNAE["x"]
    foot = head_bvh.ray_cast(Vector((x, 0.0, 10.0)), Vector((0.0, 0.0, -1.0)))[0]
    hx, hy, hz = ANTENNAE["size"]
    lean = Matrix.Rotation(side * ANTENNAE["lean"], 3, "Y")
    middle = foot + lean @ Vector((0.0, 0.0, hz - ANTENNAE["sink"]))
    return L.ellipsoid_bm(middle, (hx, hy, hz), lean, u=14, v=10), foot


# ---------------------------------------------------------------------------- her face's first layers
def draw_eyes(closed=False):
    sh = S.Sheet()
    for ex in EYES:
        if closed:
            sh.put(S.polyline_sdf(sh, [(ex - 0.055, -0.01), (ex + 0.055, -0.01)], PEN_PX), BLACK)
        else:
            sh.put(S.ellipse_sdf(sh, ex, 0.0, EYE_DOT, EYE_DOT), BLACK)
    return sh.rgba


def draw_mouth():
    sh = S.Sheet()
    u, v, ru, rv = MOUTH
    sh.put(S.polyline_sdf(sh, S.arc(u, v, ru, rv, 0.0, 2.0 * math.pi, n=96), PEN_PX), BLACK)
    return sh.rgba


def write_first_layers():
    """Her face's first layers and expressions.txt, written only where there are none yet: the user paints
    over them, and nothing here ever overwrites a layer that is there."""
    os.makedirs(FACE_DIR, exist_ok=True)
    layers = {"eyes open": draw_eyes, "eyes closed": lambda: draw_eyes(closed=True), "mouth open": draw_mouth}
    written = []
    for name, draw in layers.items():
        path = os.path.join(FACE_DIR, f"{name}.png")
        if not os.path.exists(path):
            FA.write_png(path, FA.to_uint8(draw()))
            written.append(name)
    recipe = os.path.join(FACE_DIR, FA.RECIPE_FILE)
    if not os.path.exists(recipe):
        with open(recipe, "w", encoding="utf-8") as f:
            f.write(EXPRESSIONS_TXT)
        written.append(FA.RECIPE_FILE)
    if written:
        log("face: first layers written:", ", ".join(written))


# ---------------------------------------------------------------------------- build
def build(collection, head):
    head_bvh = BVHTree.FromBMesh(head)
    parts = [{"pivot": Vector((0.0, 0.0, 0.0)), "parent": -1} for _ in range(L.MAX_PARTS)]
    anchors = {}
    white, patch_col, antenna_col = L.hex_color(WHITE), L.hex_color(PATCH), L.hex_color(ANTENNA)
    band_col, tail_col = L.hex_color(BAND), L.hex_color(TAIL)
    pieces = []

    def head_attr(co):
        uv = (0.5 + co.x / 2.0, 0.5 + (co.z - S.EYE) / 2.0)
        return L.attrs(white, L.HEAD, paint=L.PAINT_BODY, uv=uv, mask=1.0)

    parts[L.HEAD]["pivot"] = Vector(S.NECK)
    pieces.append(L.Piece(head.copy(), head_attr))

    # Her body, the Siren's: the tail, scaled in rows down from the band and leaning back into its curl;
    # the band, inked along its edges; the white torso.
    tail_rows, band_rows, torso_rows = S.body_rings(ROW)
    zs, down = [z for _, z in tail_rows], S.lathe_rows(tail_rows)
    band_lo, band_hi = S.BAND_EDGES
    tail = L.lathe_bm(tail_rows, SEGMENTS, 1.0)
    S.lean_tail(tail)
    pieces.append(L.Piece(tail, lambda co: L.attrs(tail_col, L.BODY, paint=L.PAINT_SCALES, uv=(
        -float(SCALES_ROUND), float(np.interp(co.z, zs, down)) / SCALE_ROW))))
    pieces.append(L.Piece(L.lathe_bm(band_rows, SEGMENTS, 1.0), lambda co: L.attrs(
        band_col, L.BODY, paint=L.PAINT_BAND, uv=(0.0, (co.z - band_lo) / (band_hi - band_lo)))))
    pieces.append(L.Piece(L.lathe_bm(torso_rows, SEGMENTS, 1.0), lambda co: L.attrs(white, L.BODY)))

    # Her antennae, going with her head.
    antennae = []
    for side, idx in ((-1, L.EAR_L), (1, L.EAR_R)):
        bm, foot = antenna_bm(side, head_bvh)
        parts[idx]["pivot"] = foot
        parts[idx]["parent"] = L.HEAD
        antennae.append(bm.copy())
        pieces.append(L.Piece(bm, lambda co, idx=idx: L.attrs(antenna_col, idx)))

    # Fin-hands, the Siren's, spread out from her sides; the two lines near each tip on both its faces.
    for side, idx, name in ((-1, L.ARM_L, "handL"), (1, L.ARM_R, "handR")):
        fin = S.fin_bm()
        if side < 0:
            fin.transform(Matrix.Scale(-1.0, 4, Vector((1.0, 0.0, 0.0))))
            bmesh.ops.reverse_faces(fin, faces=fin.faces[:])
        tip = max(abs(v.co.x) for v in fin.verts)
        lo, hi = IC.bounds([fin])
        lift = IC.limb_lift(lo, hi, 1.0)
        fin.normal_update()
        fin.verts.index_update()
        mid, gap = S.FIN_LINES
        lines = {}
        for v in fin.verts:
            along = (tip - abs(v.co.x)) / tip
            lines[v.index] = ((v.co.z - mid) / gap, along if abs(v.normal.y) > 0.35 else 5.0)
        frame = S.fin_frame(side)
        tip_point = max(fin.verts, key=lambda v: abs(v.co.x)).co.copy()
        L.transformed(fin, frame)
        parts[idx]["pivot"] = frame @ Vector((0.0, 0.0, 0.0))
        anchors[name] = frame @ tip_point
        pieces.append(L.Piece(fin, lambda co, i, idx=idx, lines=lines, lift=lift:
                              L.attrs(white, idx, paint=L.PAINT_FIN, uv=lines[i], lift=lift), indexed=True))

    # The tail's curl round under her and up behind her, and its heart-shaped fin, the Siren's.
    curl, curl_data, path = S.curl_bm(SCALE_ROW, SCALES_CURL)
    parts[L.TAIL]["pivot"] = path[len(path) // 5][0]

    def curl_attr(co, i):
        around, along, k = curl_data[i]
        return L.attrs(tail_col, L.BODY, L.TAIL, L.smoothstep(0.1, 0.7, k), paint=L.PAINT_SCALES, uv=(around, along))

    pieces.append(L.Piece(curl, curl_attr, indexed=True))
    pieces.append(L.Piece(S.heart_bm(path), lambda co: L.attrs(tail_col, L.BODY, L.TAIL, 1.0)))

    # Anchors and the face, in head radii; everything is scaled to her height after.
    top = max(max(v.co.z for v in a.verts) for a in antennae)
    head_top = max(v.co.z for v in head.verts)

    def hit_front(x, z):
        loc = head_bvh.ray_cast(Vector((x, -5.0, z)), Vector((0.0, 1.0, 0.0)))[0]
        return loc if loc is not None else Vector((x, -1.0, z))

    write_first_layers()
    layers, expressions = FA.load_face(None, FACE_DIR, log=log)
    face = FA.face_layout(layers, expressions)
    for name, b in zip(("eyeL", "eyeR"), sorted(face.get("eyes", [[EYES[0], 0, 0, 0], [EYES[1], 0, 0, 0]]),
                                                 key=lambda b: b[0])):
        anchors[name] = hit_front(b[0], S.EYE + b[1])
    mouth = face.get("mouth", [MOUTH[0], MOUTH[1], MOUTH[2], MOUTH[3]])
    anchors["mouth"] = hit_front(mouth[0], S.EYE + mouth[1])
    anchors["head"] = Vector((0.0, 0.0, head_top + 0.02))
    anchors["top"] = Vector((0.0, 0.0, top + 0.02))
    side_z = S.EYE + 0.3
    side_r = max(abs(v.co.x) for v in head.verts if abs(v.co.z - side_z) < 0.04)
    anchors["sideL"] = Vector((-side_r, -0.05, side_z))
    anchors["sideR"] = Vector((side_r, -0.05, side_z))

    # The guide to paint her face over: her head from the front, flat coloured, the patch rust-red.
    bvhs = [head_bvh] + [BVHTree.FromBMesh(a) for a in antennae]
    srgb = {name: np.array(c) ** (1 / 2.2) for name, c in (("white", white), ("patch", patch_col),
                                                           ("antenna", antenna_col))}

    def guide_colour(k, pts):
        if k == 0:
            return np.where((patch_sdf(pts) > 0.0)[:, None], srgb["patch"], srgb["white"])
        return np.broadcast_to(srgb["antenna"], (len(pts), 3))

    FA.write_guide(os.path.join(FACE_DIR, "_guide.png"), IC.front_view(bvhs, guide_colour, 1.0, S.EYE))
    for a in antennae:
        a.free()

    small = {name: FA.downsample(arr, FA.PAINT_SIZE // IC.FACE_SIZE) for name, arr in layers.items()}
    atlas, rects = IC.pack_layers(small)
    L.write_webp(os.path.join(IC.OUT_FACES, f"{ID}.webp"), atlas)
    log(f"face: {len(expressions)} expressions from {len(rects)} layers, atlas {atlas.shape[1]} x {atlas.shape[0]}")
    IC.write_mask(patch_mask(head), os.path.join(IC.OUT_MASKS, f"{ID}.webp"))

    obj = L.assemble(ID, pieces, collection, keep_uv="MaskUV")
    scale = HEIGHT / top
    obj.data.transform(Matrix.Scale(scale, 4))
    obj.data.update()
    R = scale
    for p in parts:
        p["pivot"] = p["pivot"] * scale
    anchors = {k: v * scale for k, v in anchors.items()}
    rig = {
        "version": 3,
        "id": ID,
        "source": "art/blender/build_mermaid.py, the Siren's shape (build_siren.py), her head the downloaded"
                  " models' Chiikawa's (" + S.HEAD_SOURCE + ")",
        "height": round(HEIGHT, 5),
        "width": round(2.0 * R, 5),
        "headR": round(R, 5),
        "eyeY": round(S.EYE * R, 5),
        "outline": IC.LINE,
        # Her fin-hands spread from her sides under her head; raised, they stay clear of it.
        "armReach": None,
        "maskColor": PATCH,
        "maskTexture": f"models/masks/{ID}.webp",
        "parts": [{"pivot": L.to_three(p["pivot"]), "parent": p["parent"]} for p in parts],
        "anchors": {k: L.to_three(v) for k, v in anchors.items()},
        "patterns": {"skirt": None},
        "face": face,
        "faceAtlas": {"url": f"models/faces/{ID}.webp", "size": IC.FACE_SIZE, "layers": rects,
                      "expressions": expressions},
    }
    return obj, rig


def preview_copy(obj, scale):
    """A copy of her for the preview renders, her patch painted into its colours (the game draws it from its
    mask texture)."""
    copy = obj.copy()
    copy.data = obj.data.copy()
    obj.users_collection[0].objects.link(copy)
    mesh = copy.data
    col = mesh.color_attributes["Col"]
    paint = mesh.attributes["_paint"]
    patch = L.hex_color(PATCH)
    head = [i for i in range(len(mesh.vertices)) if round(paint.data[i].value) == round(L.PAINT_BODY)]
    pts = np.array([mesh.vertices[i].co[:] for i in head]) / scale
    for i, on in zip(head, patch_sdf(pts) > 0.0):
        if on:
            col.data[i].color = (patch[0], patch[1], patch[2], 1.0)
    return copy


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    previews = "--no-previews" not in argv
    source = argv[argv.index("--source") + 1] if "--source" in argv else IC.DEFAULT_SOURCE
    head, _ = S.head_bm(source, HEAD_LEVEL)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    collection = bpy.data.collections.new(ID)
    scene.collection.children.link(collection)

    obj, rig = build(collection, head)
    head.free()
    path = os.path.join(IC.OUT_MODELS, f"{ID}.glb")
    L.export_glb(obj, path, rig)
    tris = sum(len(p.vertices) - 2 for p in obj.data.polygons)
    log(f"BUILT {ID}: {len(obj.data.vertices)} verts, {tris} tris, height {rig['height']:.3f} m,"
        f" head radius {rig['headR']:.3f} m, eyes at {rig['eyeY']:.3f} m -> {path}")

    if previews:
        shown = preview_copy(obj, rig["headR"])
        obj.hide_render = True
        cam = L.setup_preview(scene)
        for p in L.render_turnaround(scene, cam, [shown], IC.OUT_PREVIEWS, ID, 720, 760,
                                     ortho_scale=HEIGHT * 1.25, target_z=HEIGHT * 0.5):
            log("PREVIEW", p)
        bpy.data.objects.remove(shown)
        obj.hide_render = False
    os.makedirs(os.path.dirname(OUT_BLEND), exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=OUT_BLEND, compress=True)
    log("SAVED", OUT_BLEND)


if __name__ == "__main__":
    main()
