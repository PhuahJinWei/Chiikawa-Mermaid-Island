"""The cast's faces and the things' icons as the game's screen shows them: the user's drawings, copied into the game.

    blender --background --factory-startup --disable-autoexec --python art/blender/build_icons.py

Faces. The user draws each of the cast's faces (the user, 2026-10-23: a face, not a name, tells you who at a glance)
as a square transparent PNG in art/icons/, named by who it is: chiikawa.png, or as drawn, icon_01chiikawa.png (a
leading icon_ and number are passed over). islander.png, if there is one, is every islander's. This script copies
each into the game at FACE_PIXELS square (public/ui/faces/<id>.webp, lossless WebP, listed in faces.json), with black
paint turned to the film's dark brown as on the faces, the signs and the book. The game shows a face by the speaker's
name in the text box, as a choice of whom to ask after, and on the marker toward whoever you were told of
(src/ui/Faces.ts); anyone without one, by name.

Things. The user draws the things' icons too (the user, 2026-10-24: pictures of their own, in place of the renders of
the things' models), each a square transparent PNG in art/icons/ named icon_thing_<id>.png (icon_thing_book.png),
<id> as the thing is called in the game (art/blender/build_items.py ITEMS). This script copies each into the game at
THING_PIXELS square (public/ui/things/<id>.webp, listed in things.json), its black paint browned as the faces'. The
pouch shows a thing by its drawing (src/life/Items.ts iconOf); a thing without one, by its render in the sheet
build_items.py makes. A drawing of a thing the game does not have yet waits in art/icons/ till it does.

It never changes the drawings. How to draw them: art/icons/README.md.
"""

import json
import os
import re
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import charlib as L  # noqa: E402  (WebP writing)
import face_art as F  # noqa: E402  (PNG reading, the film's dark brown)
import build_signs as S  # noqa: E402  (resizing with clean edges)

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
DRAWINGS = os.path.join(ROOT, "art", "icons")
OUT = os.path.join(ROOT, "public", "ui", "faces")
THINGS_OUT = os.path.join(ROOT, "public", "ui", "things")
# Square, in pixels: the face is shown at most 58 CSS pixels across, three screen pixels to one on a sharp phone.
FACE_PIXELS = 192
# Square, in pixels: a thing is shown at most about 140 CSS pixels across (your paw's slot in the bag), about two
# screen pixels to one on a phone.
THING_PIXELS = 256
# Who may have a face: the cast, and the islanders all as one.
WHO = ("chiikawa", "hachiware", "usagi", "momonga", "kurimanju", "rakko", "shisa", "furuhonya", "hitoha", "futaba",
       "islander")
# Every thing the game has, in the order the sheet of their renders keeps them (art/blender/build_items.py).
SHEET = os.path.join(ROOT, "public", "models", "props", "item_icons.json")


def who_drawn(name):
    """Whose face a drawing's file name says (icon_01chiikawa.png: chiikawa), or None."""
    stem = os.path.splitext(name)[0].lower()
    return re.sub(r"^(icon[_ -]?)?\d*[_ -]?", "", stem) or None


def thing_drawn(name):
    """Which thing a drawing's file name says it is the icon of (icon_thing_book.png: book), or None (a face)."""
    found = re.match(r"^(?:icon[_ -]?)?thing[_ -]+(.+)$", os.path.splitext(name)[0], re.IGNORECASE)
    return found.group(1) if found else None


def squared(arr, name, problems):
    """A drawing as a square: if it is not one, as large as fits and centred, never stretched."""
    h, w = arr.shape[:2]
    if w == h:
        return arr
    problems.append(f"{name} is {w} x {h}: shown centred in a square; draw it square to fill it")
    side = max(w, h)
    square = np.zeros((side, side, 4), dtype=np.float32)
    top, left = (side - h) // 2, (side - w) // 2
    square[top:top + h, left:left + w] = arr
    return square


def copy_in(drawings, out, pixels, problems):
    """Each one's drawing (the newest, if it has more) into `out` as <id>.webp, `pixels` square; any there since
    taken away gone. The ids copied in."""
    os.makedirs(out, exist_ok=True)
    done = []
    for name, paths in drawings.items():
        path = max(paths, key=os.path.getmtime)
        if len(paths) > 1:
            problems.append(f"{name} has {len(paths)} drawings: using the newest, {os.path.basename(path)}")
        arr = squared(F.ink_blacks(F.load_png(path)), os.path.basename(path), problems)
        L.write_webp(os.path.join(out, f"{name}.webp"), F.to_uint8(S.resize(arr, pixels, pixels)))
        done.append(name)
    for entry in os.listdir(out):
        stem, ext = os.path.splitext(entry)
        if ext.lower() == ".webp" and stem not in done:
            os.remove(os.path.join(out, entry))
    return done


def write_list(out, about, key, ids):
    with open(os.path.join(out, f"{key}.json"), "w", encoding="utf-8", newline="\n") as f:
        json.dump({"about": about, key: ids}, f, ensure_ascii=False, indent=2)
        f.write("\n")


def main():
    with open(SHEET, encoding="utf-8") as f:
        order = json.load(f)["order"]
    things = {id.lower(): id for id in order}
    problems, faces_drawn, things_drawn = [], {}, {}
    for entry in sorted(os.listdir(DRAWINGS)):
        path = os.path.join(DRAWINGS, entry)
        if not entry.lower().endswith(".png") or not os.path.isfile(path):
            continue
        thing = thing_drawn(entry)
        if thing is not None:
            what = things.get(thing.lower())
            if what is None:
                problems.append(f"{entry}: no thing is called {thing} yet; the drawing waits here till there is one")
            else:
                things_drawn.setdefault(what, []).append(path)
            continue
        who = who_drawn(entry)
        if who not in WHO:
            problems.append(f"{entry}: no one is called {who} (the names are {', '.join(WHO)})")
            continue
        faces_drawn.setdefault(who, []).append(path)

    faces = sorted(copy_in(faces_drawn, OUT, FACE_PIXELS, problems), key=WHO.index)
    write_list(OUT, "The cast's faces as the screen shows them, by who they are; written by "
                    "art/blender/build_icons.py from the drawings in art/icons/.", "faces", faces)
    icons = sorted(copy_in(things_drawn, THINGS_OUT, THING_PIXELS, problems), key=order.index)
    write_list(THINGS_OUT, "The things drawn by the user, as the pouch shows them (any other by its render in "
                           "models/props/item_icons.webp); written by art/blender/build_icons.py from the drawings "
                           "in art/icons/.", "things", icons)
    for problem in problems:
        print("WARNING", problem)
    print(f"FACES: {len(faces)} at {FACE_PIXELS} px: " + (", ".join(faces) or "none yet"))
    print(f"THINGS: {len(icons)} at {THING_PIXELS} px: " + (", ".join(icons) or "none yet"))


if __name__ == "__main__":
    main()
