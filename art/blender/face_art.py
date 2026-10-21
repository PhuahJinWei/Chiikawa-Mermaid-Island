"""Hand-painted faces for the converted cast.

Each character's face lives in art/faces/<id>/ as layers: full-size transparent PNGs, painted
in place on a canvas that covers the game's face area (two head radii wide, centred on the eye
line, PAINT_SIZE pixels square). Every PNG there is a layer, named by its file name. The
folder's expressions.txt says which layers make up each expression, one line each:

    Worried: brows 3 + eyes open + mouth half-open + sweat

import_characters.py packs the layers into the game's face atlas and stores the expressions
with it. The game stacks each expression's layers, and swaps in "eyes closed" to blink and
another mouth to talk (src/characters/Face.ts; the rules are in art/faces/README.md). A folder
without expressions.txt starts from the model's own face art, written there for painting.
"""

import os
import struct
import zlib

import bpy
import numpy as np

PAINT_SIZE = 1536  # twice the game's face canvas, for comfortable painting
RECIPE_FILE = "expressions.txt"
# The expressions, in the order the game lists them; keep in step with ExpressionId in
# src/characters/types.ts.
EXPRESSIONS = ("neutral", "smile", "happy", "determined", "worried", "teary", "sobbing", "shocked", "angry")
# Layers that show on every expression, when a folder has them.
ALWAYS = ("skin", "cheeks")
# Layers the game swaps in by itself: blinking, dozing, talking, chewing.
SWAPS = ("eyes closed", "eyes sleep", "tears eyes closed", "mouth closed", "mouth half-open", "mouth open",
         "mouth half-open 2")
# File names for the model's own face art, written into a folder that has no expressions yet.
STARTER = {"skin": "skin", "cheeks": "cheeks", "tears": "tears eyes open", "eyes": "eyes open",
           "brows": "brows 1", "mouth": "mouth closed"}
INK = np.array([0x3B, 0x26, 0x20], dtype=np.float32) / 255.0  # the film's dark brown for face lines


def png_bytes(rgba):
    """A minimal RGBA PNG file's bytes; rgba is uint8 (H, W, 4), top row first."""
    h, w = rgba.shape[:2]
    raw = b"".join(b"\x00" + rgba[y].tobytes() for y in range(h))

    def chunk(tag, data):
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)

    return (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 0))
            + chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b""))


def write_png(path, rgba):
    """Minimal RGBA PNG writer; rgba is uint8 (H, W, 4), top row first."""
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "wb") as f:
        f.write(png_bytes(rgba))


def to_uint8(arr):
    return (np.clip(arr, 0.0, 1.0) * 255.0 + 0.5).astype(np.uint8)


def load_png(path):
    """An image as float RGBA (H, W, 4), top row first, straight alpha."""
    img = bpy.data.images.load(path, check_existing=False)
    try:
        w, h = img.size
        px = np.empty(w * h * 4, dtype=np.float32)
        img.pixels.foreach_get(px)
    finally:
        bpy.data.images.remove(img)
    return px.reshape(h, w, 4)[::-1].copy()


def resample(arr, size):
    """Bilinear resize of a square image to size x size."""
    n = arr.shape[0]
    t = (np.arange(size) + 0.5) * n / size - 0.5
    i0 = np.clip(np.floor(t).astype(int), 0, n - 1)
    i1 = np.clip(i0 + 1, 0, n - 1)
    f = np.clip(t - i0, 0.0, 1.0)
    rows = arr[i0] * (1 - f)[:, None, None] + arr[i1] * f[:, None, None]
    return rows[:, i0] * (1 - f)[None, :, None] + rows[:, i1] * f[None, :, None]


def ink_blacks(arr):
    """Paint drawn in black or dark grey becomes the film's dark brown; other colours stay."""
    rgb = arr[..., :3]
    luma = rgb @ np.array([0.299, 0.587, 0.114], dtype=np.float32)
    chroma = rgb.max(axis=-1) - rgb.min(axis=-1)
    dark = (luma < 0.2) & (chroma < 0.06)
    arr[dark, :3] = INK
    return arr


def downsample(arr, factor):
    """Area-average by an integer factor, with premultiplied alpha so edges stay clean."""
    if factor == 1:
        return arr
    h, w = arr.shape[:2]
    a = arr[..., 3:4]
    pre = np.concatenate([arr[..., :3] * a, a], axis=-1)
    pre = pre.reshape(h // factor, factor, w // factor, factor, 4).mean(axis=(1, 3))
    alpha = pre[..., 3:4]
    out = pre.copy()
    out[..., :3] = np.where(alpha > 1e-6, pre[..., :3] / np.maximum(alpha, 1e-6), 0.0)
    return out


def load_layer(path):
    """A painted layer at PAINT_SIZE, with black paint turned to the film's brown."""
    arr = load_png(path)
    h, w = arr.shape[:2]
    if h != w:
        raise ValueError(f"{path} is {w} x {h}: export the whole {PAINT_SIZE} x {PAINT_SIZE} canvas, untrimmed")
    if w != PAINT_SIZE:
        arr = resample(arr, PAINT_SIZE)
    return ink_blacks(arr)


# ---------------------------------------------------------------- layers and expressions
def group_of(name):
    """What a layer is, from the first word of its name: eyes, brows, mouth, tears, sweat..."""
    return name.split(" ", 1)[0]


def tidy(name):
    """A layer or expression name as written anywhere: lower case, single spaces."""
    return " ".join(name.lower().split())


def layer_files(folder):
    """Every layer in a folder, by name (the file name without .png). Subfolders are ignored."""
    out = {}
    for entry in sorted(os.listdir(folder)):
        path = os.path.join(folder, entry)
        stem, ext = os.path.splitext(entry)
        if ext.lower() == ".png" and tidy(stem) != "_guide" and os.path.isfile(path):
            out[tidy(stem)] = path
    return out


def parse_expressions(path, names):
    """The expressions in an expressions.txt, as {expression: [layer names]}.

    Each line is "Expression: layer + layer + ..."; blank lines and anything after a # are
    skipped, and names ignore case and extra spaces. "tears" stands for "tears eyes open" when
    there is no tears.png. A mistake raises ValueError saying which line and what is wrong.
    """
    expressions, lines = {}, {}
    with open(path, encoding="utf-8-sig") as f:
        for number, raw in enumerate(f, 1):
            line = raw.split("#", 1)[0].strip()
            if not line:
                continue
            where = f"{path}, line {number}"
            if ":" not in line:
                raise ValueError(f"{where}: expected 'Expression: layer + layer', found '{line}'")
            expression, rest = line.split(":", 1)
            expression = tidy(expression)
            if expression not in EXPRESSIONS:
                raise ValueError(f"{where}: no expression called '{expression}'; the expressions are "
                                 + ", ".join(EXPRESSIONS))
            if expression in expressions:
                raise ValueError(f"{where}: '{expression}' is already on line {lines[expression]}")
            layers = []
            for part in rest.split("+"):
                name = tidy(part)
                if not name:
                    raise ValueError(f"{where}: a layer name is missing (two '+' in a row, or one at the end?)")
                if name == "tears" and "tears" not in names and "tears eyes open" in names:
                    name = "tears eyes open"
                if name not in names:
                    raise ValueError(f"{where}: there is no '{name}.png' in this folder; the layers here are "
                                     + ", ".join(sorted(names)))
                layers.append(name)
            expressions[expression], lines[expression] = layers, number
    if "neutral" not in expressions:
        raise ValueError(f"{path}: there is no Neutral line, and every face needs one")
    return expressions


def write_starter(baked, folder, log):
    """Start a folder from the model's own face art: its layers and an expressions.txt that shows
    them on every expression. Existing files are never overwritten."""
    os.makedirs(folder, exist_ok=True)
    written = []
    for source, name in STARTER.items():
        path = os.path.join(folder, f"{name}.png")
        if source in baked and not os.path.exists(path):
            write_png(path, to_uint8(baked[source]))
            written.append(name)
    names = layer_files(folder)
    base = [n for n in ("brows 1", "eyes open", "mouth closed") if n in names]
    if not base:
        raise ValueError(f"{folder}: no face art to start from")
    lines = ["# Which layers make up each expression (see ../README.md).", ""]
    for expression in EXPRESSIONS:
        tears = ["tears"] if expression in ("teary", "sobbing") and "tears eyes open" in names else []
        lines.append(f"{expression.capitalize()}: {' + '.join(base + tears)}")
    with open(os.path.join(folder, RECIPE_FILE), "w", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")
    log(f"face: started {folder} from the model's own art ({', '.join(written) or 'no new layers'}) "
        f"with a {RECIPE_FILE}")


def load_face(baked, folder, log=print):
    """A character's painted face: (layers, expressions).

    layers holds the full-canvas float arrays of every layer the face can show: the ones its
    expressions list, the ones that always show, and the ones the game swaps in. expressions is
    {expression: [layer names]}. A folder without expressions.txt is started from the model's
    own face art (baked) first.
    """
    path = os.path.join(folder, RECIPE_FILE)
    if not os.path.exists(path):
        write_starter(baked, folder, log)
    names = layer_files(folder)
    expressions = parse_expressions(path, names)
    missing = [e.capitalize() for e in EXPRESSIONS if e not in expressions]
    if missing:
        log(f"face: no line for {', '.join(missing)} in {path}; those show the neutral face")
    used = {n for layers in expressions.values() for n in layers} | set(ALWAYS) | set(SWAPS)
    unused = sorted(n for n in names if n not in used)
    if unused:
        log(f"face: not used by any expression, so left out: {', '.join(unused)}")
    layers = {name: load_layer(p) for name, p in names.items() if name in used}
    return layers, expressions


# ---------------------------------------------------------------- where the features are
def _box(mask, x_offset, size):
    ys, xs = np.nonzero(mask)
    if len(xs) == 0:
        return None
    x0, x1 = xs.min() + x_offset, xs.max() + 1 + x_offset
    y0, y1 = ys.min(), ys.max() + 1
    # Head-radius units around the eye line, like the layout measured from the model.
    return [round(((x0 + x1) / 2 / size - 0.5) * 2, 4), round((0.5 - (y0 + y1) / 2 / size) * 2, 4),
            round((x1 - x0) / size, 4), round((y1 - y0) / size, 4)]


def paired_boxes(arr):
    """Boxes of a feature painted once on each side of the face, left first."""
    size = arr.shape[0]
    mask = arr[..., 3] > 0.5
    half = size // 2
    return [b for b in (_box(mask[:, :half], 0, size), _box(mask[:, half:], half, size)) if b]


def main_box(arr, step=4):
    """Box of the largest painted shape (the mouth, not the chin line under it)."""
    size = arr.shape[0]
    small = arr[::step, ::step, 3] > 0.5
    h, w = small.shape
    labels = np.zeros((h, w), dtype=np.int32)
    best, best_count, label = 0, 0, 0
    for y0, x0 in zip(*np.nonzero(small)):
        if labels[y0, x0]:
            continue
        label += 1
        labels[y0, x0] = label
        stack, count = [(y0, x0)], 0
        while stack:
            y, x = stack.pop()
            count += 1
            for ny, nx in ((y - 1, x), (y + 1, x), (y, x - 1), (y, x + 1)):
                if 0 <= ny < h and 0 <= nx < w and small[ny, nx] and not labels[ny, nx]:
                    labels[ny, nx] = label
                    stack.append((ny, nx))
        if count > best_count:
            best, best_count = label, count
    if not best:
        return None
    mask = np.repeat(np.repeat(labels == best, step, axis=0), step, axis=1)[:size, :size]
    return _box(mask & (arr[..., 3] > 0.5), 0, size)


def face_layout(layers, expressions):
    """Where the features sit on the neutral face, measured from the paint: boxes in head radii
    around the eye line. The converter places the eye and mouth anchors (where tears and
    speech come from) with them."""
    neutral = expressions["neutral"]

    def first(group):
        return next((layers[n] for n in neutral if group_of(n) == group), None)

    layout = {}
    for group in ("eyes", "brows"):
        arr = first(group)
        boxes = paired_boxes(arr) if arr is not None else []
        if len(boxes) == 2:
            layout[group] = boxes
    for group, name in (("cheeks", "cheeks"), ("tears", "tears eyes open")):
        boxes = paired_boxes(layers[name]) if name in layers else []
        if len(boxes) == 2:
            layout[group] = boxes
    mouth = first("mouth")
    box = main_box(mouth) if mouth is not None else None
    if box:
        layout["mouth"] = box
    return layout


def write_guide(path, head):
    """A guide to paint over: the bare head, faded, with its outline and the centre and eye lines.

    head is the front render of the head without its face (float RGBA, top row first).
    """
    size = head.shape[0]
    a = head[..., 3:4]
    col = np.ones((size, size, 3), dtype=np.float32) * (1.0 - 0.5 * a) + head[..., :3] * (0.5 * a)
    # The head's outline, a few pixels wide.
    m = head[..., 3] > 0.5
    inner = m.copy()
    for dy, dx in ((-3, 0), (3, 0), (0, -3), (0, 3), (-2, -2), (2, 2), (-2, 2), (2, -2)):
        inner &= np.roll(np.roll(m, dy, axis=0), dx, axis=1)
    col[m & ~inner] = INK * 0.7 + 0.3
    # Dashed centre line and eye line, light blue.
    guide = np.array([0.55, 0.75, 0.95], dtype=np.float32)
    dash = (np.arange(size) // 24) % 2 == 0
    mid = size // 2
    col[mid - 1:mid + 1, dash] = guide
    col[dash, mid - 1:mid + 1] = guide
    rgba = np.concatenate([col, np.ones((size, size, 1), dtype=np.float32)], axis=-1)
    write_png(path, to_uint8(rgba))
