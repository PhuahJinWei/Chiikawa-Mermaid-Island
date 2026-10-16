"""The parts kit: build characters that have no downloaded model, and export them for the game.

Chiikawa, Hachiware, Usagi and Momonga are not built here: they come from the downloaded
models, converted by import_characters.py, and so do the islanders, Hitoha and Futaba, who are
shaped like Chiikawa. This script is for everyone else (Shisa, Rakko and the rest), none of
whom is in the game yet, so SPECS is empty for now.

Run (from the project root):
    blender --background --factory-startup --python art/blender/build_characters.py -- [--only <id>] [--no-previews]

Outputs:
    public/models/<id>.glb                      models the game loads
    public/models/outfits/island_<id>.glb       a flower crown, when a spec asks for one (a separate asset)
    art/blender/characters.blend                the characters side by side, for opening in Blender
    art/previews/characters_*.png               front, three-quarter, side and back renders

Every measurement below is in units of R, half the width of the character's head, and was
measured from the film frames (see STYLE_GUIDE.md).

Construction rules that keep the anime look:
- The head and body are one smooth shape; ears are fused into it so the outline runs
  around them without a seam.
- Arms and the leaf sprout are separate pieces, so each one gets its own brown outline
  where it overlaps the body, as in the drawings.
- Colours are flat; the game shader adds no lighting to characters.
- The island outfit is never part of a character model; see outfits.py.

Coordinates are Blender's: Z up, characters face -Y.
"""

import math
import os
import sys

import bpy
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import charlib as L  # noqa: E402
import outfits as O  # noqa: E402

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
OUT_MODELS = os.path.join(ROOT, "public", "models")
OUT_OUTFITS = os.path.join(OUT_MODELS, "outfits")
OUT_PREVIEWS = os.path.join(ROOT, "art", "previews")
OUT_BLEND = os.path.join(ROOT, "art", "blender", "characters.blend")

LINE = "#66432F"  # outline brown sampled from the film

# Characters with no downloaded model go here, as specs for build() below: a profile measured
# in head radii, ears or leaves, arms and an optional flower crown. None yet: the islanders
# (Hitoha and Futaba) are converted from Chiikawa's model by import_characters.py, and Shisa,
# Rakko and the others are still to come.
SPECS = []


# ---------------------------------------------------------------------------- builder
def build(spec, collection):
    R = spec["R"]
    pr = L.Profile([(r * R, z * R) for r, z in spec["profile"]], samples=72)
    H = pr.height
    depth = spec["depth"]
    eye_z = spec["eye_z"] * R
    body_col = L.hex_color(spec["body"])
    parts = [{"pivot": Vector((0.0, 0.0, 0.0)), "parent": -1} for _ in range(L.MAX_PARTS)]
    regions = []
    anchors = {}
    pieces = []

    # Head and body, with ears fused in so the outline runs around them.
    fuse_list = [L.lathe_bm(pr.samples, 72, depth)]
    e = spec["ears"]
    if e["kind"] == "round":
        sx, sy, sz = (v * R for v in e["size"])
        for side, idx in ((-1, L.EAR_L), (1, L.EAR_R)):
            x = side * e["x"] * R
            z = max(z for r, z in pr.dense if r >= abs(x)) if any(r >= abs(x) for r, _ in pr.dense) else H
            phi = math.asin(min(1.0, abs(x) / max(pr.radius_at(z), 1e-4))) * side
            base = pr.surface_point(phi, z, depth)
            n = pr.surface_normal(phi, z, depth)
            center = base + n * (sz * 0.35)
            rot = Matrix.Rotation(side * -0.35, 3, "Y")
            fuse_list.append(L.ellipsoid_bm(center, (sx, sy, sz), rot, 20, 14))
            regions.append((idx, center, max(sx, sz) * 1.1))
            parts[idx]["pivot"] = base
    body_bm = L.fuse(fuse_list, voxel=0.010, smooth_iterations=3, smooth_lambda=0.5,
                     target_tris=spec.get("tris", 5200))
    bvh = BVHTree.FromBMesh(body_bm)

    def body_attr(co):
        part0, part1, w = L.BODY, L.BODY, 0.0
        for idx, c, rad in regions:
            ww = 1.0 - L.smoothstep(rad * 0.7, rad * 1.4, (co - c).length)
            if ww > w:
                part0, part1, w = L.BODY, idx, ww
        uv = (0.5 + co.x / (2.0 * R), 0.5 + (co.z - eye_z) / (2.0 * R))
        return L.attrs(body_col, part0, part1, w, L.PAINT_BODY, 1.0, uv)

    pieces.append(L.Piece(body_bm, body_attr))

    # Arms: separate stubby nubs, rigid to their part, half sunk into the body.
    a = spec["arms"]
    for side, idx, name in ((-1, L.ARM_L, "handL"), (1, L.ARM_R, "handR")):
        z = a["z"] * R
        r = pr.radius_at(z)
        shoulder = Vector((side * r * 0.9, -0.06 * R, z))
        d = Vector((side * a["dir"][0], a["dir"][1], a["dir"][2])).normalized()
        rad = a["radius"] * R
        arm = L.capsule_bm(shoulder, d, a["length"] * R, rad, flatten=0.85, u=20, v=14, sink=rad * 0.9)
        pieces.append(L.Piece(arm, lambda co, idx=idx: L.attrs(body_col, idx, idx, 0.0, L.PAINT_PLAIN, 1.0, lift=1.0)))
        parts[idx]["pivot"] = shoulder
        anchors[name] = shoulder + d * (a["length"] * R + rad)

    # Leaf sprout: Hitoha has one leaf, Futaba two.
    sp = spec.get("sprout")
    top = H
    if sp:
        leaf_col = L.hex_color(sp["color"])
        length, width, thick = sp["length"] * R, sp["width"] * R, 0.05 * R
        leaves = [(0.0, 0.0)] if sp["leaves"] == 1 else [(-0.6, -0.03 * R), (0.6, 0.03 * R)]
        for tilt, xoff in leaves:
            m = (Matrix.Translation(Vector((xoff, 0.0, H - 0.04 * R))) @ Matrix.Rotation(tilt, 4, "Y")
                 @ Matrix.Rotation(-0.12, 4, "X"))
            inv = m.inverted()

            def leaf_attr(co, inv=inv):
                local = inv @ co
                return L.attrs(leaf_col, L.SPROUT, paint=L.PAINT_LEAF, outline=1.0,
                               uv=(local.x / (width * 0.5), local.z / length))

            pieces.append(L.Piece(L.transformed(L.leaf_bm(length, width, thick), m), leaf_attr))
        parts[L.SPROUT]["pivot"] = Vector((0.0, 0.0, H - 0.03 * R))
        top = H - 0.04 * R + length

    # Anchors for effects, props and gaze.
    def hit_front(x, z):
        loc, _, _, _ = bvh.ray_cast(Vector((x, -3.0, z)), Vector((0.0, 1.0, 0.0)))
        return loc if loc is not None else Vector((x, -pr.radius_at(z) * depth, z))

    anchors["eyeL"] = hit_front(-spec["eye_x"] * R, eye_z)
    anchors["eyeR"] = hit_front(spec["eye_x"] * R, eye_z)
    anchors["mouth"] = hit_front(0.0, eye_z + spec["mouth_y"] * R)
    anchors["head"] = Vector((0.0, 0.0, H + 0.05))
    anchors["top"] = Vector((0.0, 0.0, top + 0.03))
    side_z = eye_z + 0.3 * R
    anchors["sideL"] = Vector((-pr.radius_at(side_z), -0.05, side_z))
    anchors["sideR"] = Vector((pr.radius_at(side_z), -0.05, side_z))

    obj = L.assemble(spec["id"], pieces, collection)

    rig = {
        "version": 3,
        "id": spec["id"],
        "height": round(H, 5),
        "width": round(2 * pr.max_radius(), 5),
        "headR": R,
        "eyeY": round(eye_z, 5),
        "outline": LINE,
        "maskColor": None,
        "parts": [{"pivot": L.to_three(p["pivot"]), "parent": p["parent"]} for p in parts],
        "anchors": {k: L.to_three(v) for k, v in anchors.items()},
        "patterns": {},
        "face": None,
        "faceAtlas": None,
    }

    outfit = None
    cr = spec.get("outfit_crown")
    if cr:
        # The crowd's flower crown: the island outfit, fitted to this head, exported on its own.
        z = cr["z"] * R
        crown = O.crown_pieces(bvh, lambda theta, z=z: z, cr["count"], cr["size"] * R, cr["thickness"] * R,
                               cr["colors"], steps=24)
        outfit = (crown, os.path.join(OUT_OUTFITS, f"island_{spec['id']}.glb"))
    return obj, rig, outfit


# ---------------------------------------------------------------------------- main
def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    only = argv[argv.index("--only") + 1] if "--only" in argv else None
    previews = "--no-previews" not in argv

    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    collection = bpy.data.collections.new("characters")
    scene.collection.children.link(collection)

    if not SPECS:
        print("Nothing to build: no character specs yet.")
        return

    built = []
    for spec in SPECS:
        if only and spec["id"] != only:
            continue
        obj, rig, outfit = build(spec, collection)
        path = os.path.join(OUT_MODELS, f"{spec['id']}.glb")
        L.export_glb(obj, path, rig)
        tris = sum(len(p.vertices) - 2 for p in obj.data.polygons)
        print(f"BUILT {spec['id']}: {len(obj.data.vertices)} verts, {tris} tris, height {rig['height']:.3f} -> {path}")
        built.append([obj])
        if outfit:
            pieces, opath = outfit
            oobj = O.export_outfit(f"island_{spec['id']}", pieces, opath, spec["id"], None, collection)
            print(f"OUTFIT {spec['id']}: crown only -> {opath}")
            built[-1].append(oobj)

    spacing = 1.25
    for i, objs in enumerate(built):
        for obj in objs:
            obj.location.x = (i - (len(built) - 1) / 2) * spacing

    if previews and built:
        cam = L.setup_preview(scene)
        width = max(1, len(built)) * 360
        everything = [o for objs in built for o in objs]
        paths = L.render_turnaround(scene, cam, everything, OUT_PREVIEWS, "characters", width, 520,
                                    ortho_scale=spacing * len(built) * 1.02, target_z=0.62)
        for p in paths:
            print("PREVIEW", p)

    os.makedirs(os.path.dirname(OUT_BLEND), exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=OUT_BLEND, compress=True)
    print("SAVED", OUT_BLEND)


main()
