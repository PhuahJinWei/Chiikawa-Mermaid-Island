"""Hand-lettered signboards: a template to paint each one over, and the paintings for the game.

The game paints words on each signboard's label face (a festival stall's header boards, the one
across its front and the two down its sides showing the same sign, the arch's board and its
banner, the street's banners) in the phone's rounded font. Any of them can be
hand-lettered instead, as the film's are: a transparent PNG in art/signs/, painted over that
sign's template in art/signs/_guides/. Both are named by the key of the sign's words in
src/locales/ja.json, the template with the words after it ("stall.takoyaki たこやき.png"); a
painting may keep that name or drop the words.

This script draws every sign's template, PAINT_PIXELS a metre of its face (more for a small face
the game paints sharper): the board's colour with
the game's words faint on it and a dashed margin. It redraws a template only while it is still as
it drew it, so a painting saved over one by mistake is kept. It copies each painting into the
game at the game's own sharpness (public/signs/, lossless WebP, listed in signs.json), with black paint turned to
the film's dark brown as on the faces. The game shows a painting in place of the typed words
wherever there is one (src/world/Props.ts). It never changes the paintings. How to paint them:
art/signs/README.md.

    blender --background --factory-startup --disable-autoexec --python art/blender/build_signs.py
"""

import hashlib
import json
import os
import struct
import sys

import bpy
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import charlib as L  # noqa: E402  (WebP writing)
import face_art as F  # noqa: E402  (PNG reading and writing, the film's dark brown)

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
LAYOUT = os.path.join(ROOT, "public", "data", "layout.json")
WORDS = os.path.join(ROOT, "src", "locales", "ja.json")
PROPS = os.path.join(ROOT, "public", "models", "props")
PAINTINGS = os.path.join(ROOT, "art", "signs")
GUIDES = os.path.join(PAINTINGS, "_guides")
# What this script last drew in GUIDES: each template's file name and its SHA-1, so it redraws
# only templates no one has changed since.
DRAWN = os.path.join(GUIDES, "_drawn.json")
OUT = os.path.join(ROOT, "public", "signs")
# Pixels a metre of a sign's face: on its template, for painting, and in the game, where a
# painting is copied at the sharpness the game paints words (LABEL_PIXELS in src/world/Props.ts).
PAINT_PIXELS = 800
GAME_PIXELS = 220
# The board each prop's label faces are painted on, a colour a face, as its build script colours
# it (build_village.py the stalls, houses.py the arch and the banners, build_props.py the signs).
BOARDS = {
    "stall_pink": ["#F4A3B5"], "stall_purple": ["#B68FD6"], "stall_orange": ["#F2A65A"],
    "stall_blue": ["#7EC3EA"], "stall_red": ["#E0674F"], "stall_white": ["#F7F4EC"],
    "arch": ["#E2BE86", "#FFFFFF"], "banner": ["#FFFFFF"],
    "sign": ["#E2E8CF"], "sign_hanging": ["#D9B483"],
    # 島二郎's board over its front and its standing sign, painted a pale cream; its menu's plaques.
    "restaurant": ["#EAE5D3", "#EAE5D3", "#EFE6CF", "#EFE6CF", "#EFE6CF"],
}
# The words on the templates: in the game's own font where there is one (--font-ja in
# src/styles.css), this strong, laid out as the game lays them out (paintLabels in Props.ts).
FONTS = ("C:/Windows/Fonts/BIZ-UDGothicB.ttc", "C:/Windows/Fonts/YuGothB.ttc", "C:/Windows/Fonts/meiryo.ttc")
GUIDE_WORDS = 0.3
# The dashed margin on the templates, in from each edge by this much of the face's height.
GUIDE_MARGIN = 0.06
# A painting further than this from its template's proportions is shown at its own, centred on the
# face, with a warning.
STRETCH = 0.03
# A painting painted solid to its edges (a stall's board painted with its words) gives its board
# its own colour, the middling colour of its edge, so the board round it matches: its edge is this
# far in from each side, of its width and height, and this much of it must be solid paint.
EDGE = 0.03
SOLID = 0.9
INK = "#3B2620"  # the words' colour where a face names none, as the game's
# Paintings the user named in their own words, by the sign each is for.
NAMED = {"cave warning signboard": "sign.noEntry"}


def rgb(hex_colour):
    return np.array([int(hex_colour[i:i + 2], 16) for i in (1, 3, 5)], dtype=np.float32) / 255.0


def sha1_of(path):
    with open(path, "rb") as f:
        return hashlib.sha1(f.read()).hexdigest()


def prop_info(kind):
    """A built prop's info for the game, from its .glb: the sizes and colours of its label faces."""
    path = os.path.join(PROPS, f"{kind}.glb")
    if not os.path.exists(path):
        return {}
    with open(path, "rb") as f:
        data = f.read()
    length = struct.unpack_from("<I", data, 12)[0]
    gltf = json.loads(data[20:20 + length])
    for node in gltf.get("nodes", []):
        prop = node.get("extras", {}).get("prop")
        if isinstance(prop, str):
            return json.loads(prop)
    return {}


def signs():
    """Every sign the game paints words on, by the key of its words, in the layout's order: its
    words, the prop it stands on, its face's size in metres and its words' colour, and the colour
    of its board."""
    with open(LAYOUT, encoding="utf-8") as f:
        layout = json.load(f)
    with open(WORDS, encoding="utf-8") as f:
        words = json.load(f)
    infos, out = {}, {}
    for p in layout.get("props", []):
        keys = p.get("labels") or ([p["label"]] if p.get("label") else [])
        if not keys:
            continue
        if p["kind"] not in infos:
            infos[p["kind"]] = prop_info(p["kind"])
        info = infos[p["kind"]]
        faces = info.get("labels") or ([info["label"]] if info.get("label") else [])
        boards = BOARDS.get(p["kind"], ["#FFFFFF"])
        for i, key in enumerate(keys):
            if i < len(faces) and key not in out:
                out[key] = {"words": words.get(key, key), "kind": p["kind"], "size": faces[i]["size"],
                            "colour": faces[i].get("colour", INK), "board": boards[min(i, len(boards) - 1)],
                            "vertical": bool(faces[i].get("vertical")), "sharp": faces[i].get("sharp", 1)}
    return out


def guide_font():
    for path in FONTS:
        if os.path.exists(path):
            return bpy.data.fonts.load(path)
    return None


def words_cover(text, width, height, font, ss=2):
    """How much of each pixel of a face `width` x `height` the words cover, 0 to 1, laid out as the
    game lays them out: across the face, centred, as large as fits (no taller than 0.74 of the
    face, no wider than 0.9 of it). Drawn `ss` times as fine and averaged down, for soft edges."""
    curve = bpy.data.curves.new("words", type="FONT")
    curve.body = text
    curve.font = font
    curve.fill_mode = "BOTH"
    obj = bpy.data.objects.new("words", curve)
    bpy.context.scene.collection.objects.link(obj)
    try:
        evaluated = obj.evaluated_get(bpy.context.evaluated_depsgraph_get())
        mesh = evaluated.to_mesh()
        mesh.calc_loop_triangles()
        co = np.array([v.co[:2] for v in mesh.vertices], dtype=np.float64).reshape(-1, 2)
        tris = np.array([t.vertices[:] for t in mesh.loop_triangles], dtype=np.int64).reshape(-1, 3)
        evaluated.to_mesh_clear()
    finally:
        bpy.data.objects.remove(obj)
        bpy.data.curves.remove(curve)
    if len(tris) == 0:
        return np.zeros((height, width), dtype=np.float32)
    lo, hi = co.min(axis=0), co.max(axis=0)
    size = min(height * 0.74, width * 0.9 / max(hi[0] - lo[0], 1e-6))
    px = np.empty_like(co)
    px[:, 0] = (width / 2 + (co[:, 0] - (lo[0] + hi[0]) / 2) * size) * ss
    px[:, 1] = (height / 2 - (co[:, 1] - (lo[1] + hi[1]) / 2) * size) * ss
    cover = np.zeros((height * ss, width * ss), dtype=bool)
    for a, b, c in px[tris]:
        if abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])) < 1e-9:
            continue
        x0 = max(int(np.floor(min(a[0], b[0], c[0]))), 0)
        x1 = min(int(np.ceil(max(a[0], b[0], c[0]))), width * ss)
        y0 = max(int(np.floor(min(a[1], b[1], c[1]))), 0)
        y1 = min(int(np.ceil(max(a[1], b[1], c[1]))), height * ss)
        if x0 >= x1 or y0 >= y1:
            continue
        gx, gy = np.meshgrid(np.arange(x0, x1) + 0.5, np.arange(y0, y1) + 0.5)
        sides = [(q[0] - p[0]) * (gy - p[1]) - (q[1] - p[1]) * (gx - p[0]) for p, q in ((a, b), (b, c), (c, a))]
        inside = ((sides[0] >= 0) & (sides[1] >= 0) & (sides[2] >= 0)) | \
                 ((sides[0] <= 0) & (sides[1] <= 0) & (sides[2] <= 0))
        cover[y0:y1, x0:x1] |= inside
    return cover.reshape(height, ss, width, ss).mean(axis=(1, 3)).astype(np.float32)


def guide_png(sign, font):
    """A sign's template, as a PNG file's bytes, and its size: its face, PAINT_PIXELS a metre (times
    its `sharp`, as the game paints a small face seen close sharper, so the same brush reads the same
    on every sign), in its board's colour, with the game's words faint on it and a dashed margin a
    little darker than the board."""
    width = max(1, round(sign["size"][0] * PAINT_PIXELS * sign["sharp"]))
    height = max(1, round(sign["size"][1] * PAINT_PIXELS * sign["sharp"]))
    board = rgb(sign["board"])
    img = np.ones((height, width, 4), dtype=np.float32)
    img[..., :3] = board
    if font is not None:
        if sign.get("vertical"):
            # Down the face, a character a row, each as large as fits, as the game types them.
            chars = list(sign["words"])
            row = max(1, min(round(width * 0.8), round(height * 0.94 / max(len(chars), 1))))
            cover = np.zeros((height, width), dtype=np.float32)
            top = (height - row * len(chars)) // 2
            for k, char in enumerate(chars):
                cover[top + k * row:top + (k + 1) * row] = words_cover(char, width, row, font)
            cover = cover[..., None] * GUIDE_WORDS
        else:
            cover = words_cover(sign["words"], width, height, font)[..., None] * GUIDE_WORDS
        img[..., :3] = img[..., :3] * (1.0 - cover) + rgb(sign["colour"]) * cover
    m, thick = max(2, round(GUIDE_MARGIN * height)), 3
    xs, ys = np.arange(width), np.arange(height)
    along_x = ((xs % 36) < 24) & (xs >= m) & (xs < width - m)
    along_y = ((ys % 36) < 24) & (ys >= m) & (ys < height - m)
    dashes = np.zeros((height, width), dtype=bool)
    dashes[m:m + thick, :] |= along_x[None, :]
    dashes[height - m - thick:height - m, :] |= along_x[None, :]
    dashes[:, m:m + thick] |= along_y[:, None]
    dashes[:, width - m - thick:width - m] |= along_y[:, None]
    img[dashes, :3] = board * 0.8
    return F.png_bytes(F.to_uint8(img)), (width, height)


def resize(arr, width, height):
    """Straight-alpha RGBA resized to `width` x `height`: each new pixel the average of the area it
    covers when shrinking, bilinear when growing; with premultiplied alpha, so edges stay clean."""
    def weights(n_in, n_out):
        if n_out >= n_in:
            t = (np.arange(n_out) + 0.5) * n_in / n_out - 0.5
            i0 = np.floor(t).astype(int)
            f = (t - i0).astype(np.float32)
            w = np.zeros((n_out, n_in), dtype=np.float32)
            np.add.at(w, (np.arange(n_out), np.clip(i0, 0, n_in - 1)), 1.0 - f)
            np.add.at(w, (np.arange(n_out), np.clip(i0 + 1, 0, n_in - 1)), f)
            return w
        edges = np.arange(n_out + 1) * (n_in / n_out)
        i = np.arange(n_in)
        w = np.clip(np.minimum(edges[1:, None], i[None, :] + 1) - np.maximum(edges[:-1, None], i[None, :]), 0.0, None)
        return (w / w.sum(axis=1, keepdims=True)).astype(np.float32)

    alpha = arr[..., 3:4]
    pre = np.concatenate([arr[..., :3] * alpha, alpha], axis=-1)
    rows = np.tensordot(weights(arr.shape[0], height), pre, axes=(1, 0))
    out = np.moveaxis(np.tensordot(rows, weights(arr.shape[1], width), axes=(1, 1)), 2, 1)
    a = out[..., 3:4]
    out[..., :3] = np.where(a > 1e-6, out[..., :3] / np.maximum(a, 1e-6), 0.0)
    return np.clip(out, 0.0, 1.0)


def board_colour(arr):
    """The colour a painting gives its board: the median of its edge, if its edge is solid paint;
    None for a painting with see-through edges, whose board keeps its own colour."""
    h, w = arr.shape[:2]
    ex, ey = max(1, round(w * EDGE)), max(1, round(h * EDGE))
    edge = np.concatenate([arr[:ey].reshape(-1, 4), arr[-ey:].reshape(-1, 4),
                           arr[:, :ex].reshape(-1, 4), arr[:, -ex:].reshape(-1, 4)])
    solid = edge[edge[:, 3] > 0.9]
    if len(solid) < SOLID * len(edge):
        return None
    r, g, b = (np.clip(np.median(solid[:, :3], axis=0), 0.0, 1.0) * 255.0 + 0.5).astype(int)
    return f"#{r:02X}{g:02X}{b:02X}"


def painting_files():
    """The paintings in art/signs/, by the sign each is for: the key its file name starts with
    ("stall.takoyaki.png" or "stall.takoyaki たこやき.png"), or the one NAMED gives for its name.
    Subfolders are ignored."""
    out = {}
    if not os.path.isdir(PAINTINGS):
        return out
    for entry in sorted(os.listdir(PAINTINGS)):
        path = os.path.join(PAINTINGS, entry)
        stem, ext = os.path.splitext(entry)
        if ext.lower() == ".png" and os.path.isfile(path) and stem.strip() and not stem.startswith("_"):
            out.setdefault(NAMED.get(stem.strip(), stem.split()[0]), []).append(path)
    return out


def main():
    every = signs()
    font = guide_font()
    if font is None:
        print("WARNING no Japanese font found: the templates have no words on them")
    # The templates, redrawn every time, and those of signs no longer in the game taken away: but
    # only those still as this script drew them. Anything else there (a painting saved over a
    # template) is left as it is.
    os.makedirs(GUIDES, exist_ok=True)
    try:
        with open(DRAWN, encoding="utf-8") as f:
            drawn = json.load(f)
    except (OSError, ValueError):
        drawn = {}
    names = {key: f"{key} {sign['words']}.png" for key, sign in every.items()}
    sizes, problems, now = {}, [], {}
    for key, sign in every.items():
        png, sizes[key] = guide_png(sign, font)
        path = os.path.join(GUIDES, names[key])
        if os.path.exists(path):
            old = sha1_of(path)
            if old != hashlib.sha1(png).hexdigest() and old != drawn.get(names[key]):
                problems.append(f"_guides/{names[key]} was changed after it was drawn, so it is left as it is: "
                                "a painting belongs in art/signs/ itself")
                continue
        with open(path, "wb") as f:
            f.write(png)
        now[names[key]] = hashlib.sha1(png).hexdigest()
    for entry in os.listdir(GUIDES):
        path = os.path.join(GUIDES, entry)
        if entry.lower().endswith(".png") and os.path.isfile(path) and entry not in names.values():
            if sha1_of(path) == drawn.get(entry):
                os.remove(path)
            else:
                problems.append(f"_guides/{entry} is no sign's template, so it is left as it is: "
                                "a painting belongs in art/signs/ itself")
    with open(DRAWN, "w", encoding="utf-8", newline="\n") as f:
        json.dump(now, f, ensure_ascii=False, indent=1, sort_keys=True)
        f.write("\n")
    # The paintings, copied into the game; the game's copies of paintings since taken away go.
    os.makedirs(OUT, exist_ok=True)
    painted, boards = [], {}
    for key, paths in painting_files().items():
        if key not in every:
            problems.extend(f"{os.path.basename(p)}: no sign is called {key} (the templates' names start with "
                            "each sign's)" for p in paths)
            continue
        path = max(paths, key=os.path.getmtime)
        if len(paths) > 1:
            problems.append(f"{key} has {len(paths)} paintings: using the newest, {os.path.basename(path)}")
        arr = F.ink_blacks(F.load_png(path))
        h, w = arr.shape[:2]
        tw, th = sizes[key]
        board = board_colour(arr)
        if board:
            boards[key] = board
        # At the game's sharpness for its face (a small face seen close painted sharper, as the game
        # paints it: `sharp` in its label's info).
        fw, fh = every[key]["size"]
        sharp = every[key]["sharp"]
        gw, gh = max(1, round(fw * GAME_PIXELS * sharp)), max(1, round(fh * GAME_PIXELS * sharp))
        if abs((w / h) / (tw / th) - 1.0) > STRETCH:
            # Not its template's proportions (painted for a board since reshaped): shown as it was
            # painted, as large as fits and centred, never stretched.
            problems.append(f"{os.path.basename(path)} is {w} x {h} and its template {tw} x {th}: shown at its "
                            "own proportions, centred; repaint it on the template to fill the board")
            scale = min(gw / w, gh / h)
            pw, ph = max(1, round(w * scale)), max(1, round(h * scale))
            out = np.zeros((gh, gw, 4), dtype=np.float32)
            top, left = (gh - ph) // 2, (gw - pw) // 2
            out[top:top + ph, left:left + pw] = resize(arr, pw, ph)
        else:
            out = resize(arr, gw, gh)
        L.write_webp(os.path.join(OUT, f"{key}.webp"), F.to_uint8(out))
        painted.append(key)
    # Copies of paintings since taken away go, and the PNG copies from before the game took WebP.
    for entry in os.listdir(OUT):
        stem, ext = os.path.splitext(entry)
        if ext.lower() == ".png" or (ext.lower() == ".webp" and stem not in painted):
            os.remove(os.path.join(OUT, entry))
    with open(os.path.join(OUT, "signs.json"), "w", encoding="utf-8", newline="\n") as f:
        json.dump({"about": "The hand-lettered signs, by the key of their words, and the colours of the "
                            "boards under those painted solid to their edges; written by "
                            "art/blender/build_signs.py from the paintings in art/signs/.",
                   "format": "webp", "signs": painted, "boards": boards}, f, ensure_ascii=False, indent=2)
        f.write("\n")
    for problem in problems:
        print("WARNING", problem)
    print(f"SIGNS: {len(every)} templates in art/signs/_guides; {len(painted)} painted: "
          + (", ".join(painted) if painted else "none yet")
          + "".join(f"; {key}'s board {colour}" for key, colour in boards.items()))


main()
