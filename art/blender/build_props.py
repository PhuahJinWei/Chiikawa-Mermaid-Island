"""Build the props in Blender and export them for the game.

Run (from the project root):
    blender --background --factory-startup --python art/blender/build_props.py -- [--only palm] [--no-previews]

Outputs:
    public/models/props/<id>.glb   props the game loads (vertex colours, no materials)
    art/blender/props.blend         all props, for opening in Blender
    art/previews/prop_<id>.png      one three-quarter render per prop

Coordinates are Blender's: Z up, props face -Y. Each prop's origin is where it
touches the ground, except the onigiri, whose origin is its centre.
"""

import json
import math
import os
import sys

import bmesh
import bpy
from mathutils import Matrix, Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import charlib as L  # noqa: E402

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
OUT_MODELS = os.path.join(ROOT, "public", "models", "props")
OUT_PREVIEWS = os.path.join(ROOT, "art", "previews")
OUT_BLEND = os.path.join(ROOT, "art", "blender", "props.blend")

C = {k: L.hex_color(v) for k, v in {
    "trunkA": "#A47B52",
    "trunkB": "#8A6440",
    "leafA": "#3FA34D",
    "leafB": "#4DB35A",
    "coconut": "#6B4A2E",
    "ink": "#66432F",  # the world's pen colour, for lines painted onto props
    "bark": "#9C6B43",
    "board": "#D9B483",
    "logEnd": "#D9B98C",
    "logRing": "#C49A6C",
    "white": "#FFFFFF",
    "rice": "#FFFDF8",
    "nori": "#22302A",
    "wing": "#3E8EE8",
    "wingLight": "#8CC4F7",
}.items()}
UP = Vector((0.0, 0.0, 1.0))
PEN = 0.018  # the world's pen in metres (2% of a cast member's height), for painted lines


def segment_bm(a, b, r0, r1, segments=10):
    """Truncated cone from point a to point b."""
    length = (b - a).length
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=segments,
                          radius1=r0, radius2=r1, depth=length * 1.04)
    rot = UP.rotation_difference((b - a).normalized()).to_matrix().to_4x4()
    return L.transformed(bm, Matrix.Translation((a + b) * 0.5) @ rot)


def strip_bm(left, right):
    """Quad strip between two matching point lists."""
    bm = bmesh.new()
    lv = [bm.verts.new(p) for p in left]
    rv = [bm.verts.new(p) for p in right]
    for i in range(len(left) - 1):
        bm.faces.new((lv[i], rv[i], rv[i + 1], lv[i + 1]))
    return bm


def frond_bm(center, side, width, thickness=0.05, rows=28):
    """A palm frond as one solid blade with a sawtooth edge, drooping at the sides.

    center(s) is the midrib for s from base (0) to tip (1); side is the horizontal direction
    across the blade. A solid blade, unlike single-sided leaflets, can carry the world's
    outline, and its zigzag edge reads as a frond at a glance.
    """
    bm = bmesh.new()
    ring = []
    for i in range(rows + 1):
        s = 0.03 + 0.97 * i / rows
        c = center(s)
        tangent = (center(min(1.0, s + 0.01)) - center(max(0.0, s - 0.01))).normalized()
        normal = tangent.cross(side).normalized()
        if normal.z < 0:
            normal = -normal
        half = width * math.sin(math.pi * s) ** 0.7 * (1.0 if i % 2 == 0 else 0.6)
        t = thickness * (1.0 - 0.8 * s)
        droop = -UP * (0.3 * half)
        ring.append([bm.verts.new(c + side * half + droop), bm.verts.new(c + normal * (t / 2)),
                     bm.verts.new(c - side * half + droop), bm.verts.new(c - normal * (t / 2))])
    for a, b in zip(ring, ring[1:]):
        for k in range(4):
            bm.faces.new((a[k], a[(k + 1) % 4], b[(k + 1) % 4], b[k]))
    bm.faces.new(ring[0])
    bm.faces.new(list(reversed(ring[-1])))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    return bm


def midrib_bm(center, side, width, lift, s0=0.06, s1=0.9, rows=20):
    """A thin strip along a frond's midrib, just above its top: an ink line painted on."""
    left, right, up = [], [], None
    for i in range(rows + 1):
        s = s0 + (s1 - s0) * i / rows
        c = center(s)
        tangent = (center(min(1.0, s + 0.01)) - center(max(0.0, s - 0.01))).normalized()
        normal = tangent.cross(side).normalized()
        if normal.z < 0:
            normal = -normal
        up = up or normal
        lift_s = lift * (1.0 - 0.8 * s)
        left.append(c + normal * lift_s + side * (width / 2))
        right.append(c + normal * lift_s - side * (width / 2))
    bm = strip_bm(left, right)
    # Single-sided: make sure it faces up, where the camera sees it.
    bm.normal_update()
    bm.faces.ensure_lookup_table()
    if bm.faces[0].normal.dot(up) < 0:
        bmesh.ops.reverse_faces(bm, faces=bm.faces[:])
    return bm


def disc_bm(center, normal, radius, segments=16):
    bm = bmesh.new()
    bmesh.ops.create_circle(bm, cap_ends=True, cap_tris=True, segments=segments, radius=radius)
    rot = UP.rotation_difference(normal.normalized()).to_matrix().to_4x4()
    return L.transformed(bm, Matrix.Translation(center) @ rot)


# ---------------------------------------------------------------------------- props
def build_palm(collection):
    """Leaning coconut palm, about 5.8 m tall, with solid jagged fronds that take an outline."""
    height, lean, n = 5.8, 0.22, 7
    pts = [Vector((math.sin(t * math.pi * 0.5) * lean * height, 0.0, t * height))
           for t in (i / n for i in range(n + 1))]
    pieces = []
    for i in range(n):
        r0 = 0.24 - 0.09 * (i / n)
        pieces.append((segment_bm(pts[i], pts[i + 1], r0, r0 - 0.014, segments=8), C["trunkA"] if i % 2 else C["trunkB"]))
    top = pts[-1]

    fronds = 9
    far = [(segment_bm(pts[0], top, 0.24, 0.15, segments=5), C["trunkB"])]
    for k in range(fronds):
        theta = (k / fronds) * 2 * math.pi + math.sin(k * 7.3) * 0.2
        d = Vector((math.cos(theta), math.sin(theta), 0.0))
        side = Vector((-math.sin(theta), math.cos(theta), 0.0))
        length = 2.5 + 0.4 * math.sin(k * 3.1)

        def center(s):
            return top + d * (s * length) + UP * (0.55 * math.sin(s * math.pi * 0.6) - 1.5 * s * s)

        pieces.append((frond_bm(center, side, 0.62, rows=12), C["leafA"] if k % 2 else C["leafB"]))
        pieces.append((midrib_bm(center, side, PEN, 0.03, rows=6), C["ink"]))
        if k % 2 == 0:
            far.append((frond_bm(center, side, 0.66, rows=4), C["leafA"]))

    for i in range(3):
        a = i / 3 * 2 * math.pi
        pos = top + Vector((math.cos(a) * 0.2, math.sin(a) * 0.2, -0.22))
        pieces.append((L.ellipsoid_bm(pos, (0.15, 0.15, 0.16), u=8, v=5), C["coconut"]))
    palm = L.assemble_colored("palm", pieces, collection)
    distant = L.assemble_colored("palm_far", far, collection)
    return [palm, distant], {"footprint": {"circle": 0.28}, "height": 6.0, "sink": 0.05}


def build_log(collection):
    """A fallen log to sit on, lying along X."""
    radius, length = 0.24, 1.8
    side = bmesh.new()
    bmesh.ops.create_cone(side, cap_ends=False, segments=18, radius1=radius, radius2=radius, depth=length)
    rot = Matrix.Rotation(math.pi / 2, 4, "Y")
    lift = Matrix.Translation((0.0, 0.0, radius))
    side = L.transformed(side, lift @ rot)
    pieces = [(side, C["bark"])]
    # Each cut end: an inked rim (the outline cannot draw an edge inside a face), the pale
    # wood, and one inked growth ring, all with the world's pen. The rim disc is built on the
    # side's own end ring, so the game can join their outlines without a crack at the corner.
    for sign in (-1.0, 1.0):
        n = Vector((sign, 0.0, 0.0))
        c = Vector((sign * length / 2, 0.0, radius))
        ring = sorted((v.co.copy() for v in side.verts if v.co.x * sign > 0),
                      key=lambda p: math.atan2(p.z - radius, p.y))
        rim = bmesh.new()
        hub = rim.verts.new(c)
        verts = [rim.verts.new(p) for p in ring]
        for i in range(len(verts)):
            rim.faces.new((hub, verts[i], verts[(i + 1) % len(verts)]))
        rim.normal_update()
        if rim.faces[:][0].normal.dot(n) < 0:
            bmesh.ops.reverse_faces(rim, faces=rim.faces[:])
        pieces.append((rim, C["ink"]))
        layers = [(radius - PEN, "logEnd"), (radius * 0.5, "ink"),
                  (radius * 0.5 - PEN, "logRing"), (radius * 0.18, "logEnd")]
        for depth, (r, colour) in enumerate(layers, start=1):
            pieces.append((disc_bm(c + n * (0.002 * depth), n, r, 24), C[colour]))
    log = L.assemble_colored("log", pieces, collection)
    return [log], {"footprint": {"box": [0.95, 0.26]}, "height": 0.5}


def build_starfish(collection):
    """Puffy five-armed starfish, white so the game can tint each one."""
    bm = bmesh.new()
    outer_top, outer_bot, mid = [], [], []
    for i in range(10):
        a = i / 10 * 2 * math.pi + math.pi / 2
        r = 0.15 if i % 2 == 0 else 0.065
        outer_top.append(bm.verts.new((math.cos(a) * r, math.sin(a) * r, 0.012)))
        outer_bot.append(bm.verts.new((math.cos(a) * r, math.sin(a) * r, 0.0)))
        mid.append(bm.verts.new((math.cos(a) * r * 0.5, math.sin(a) * r * 0.5, 0.03)))
    top = bm.verts.new((0.0, 0.0, 0.038))
    bottom = bm.verts.new((0.0, 0.0, 0.0))
    for i in range(10):
        j = (i + 1) % 10
        bm.faces.new((top, mid[i], mid[j]))
        bm.faces.new((mid[i], outer_top[i], outer_top[j], mid[j]))
        bm.faces.new((outer_top[i], outer_bot[i], outer_bot[j], outer_top[j]))
        bm.faces.new((bottom, outer_bot[j], outer_bot[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    starfish = L.assemble_colored("starfish", [(bm, C["white"])], collection)
    return [starfish], {"sink": -0.005}


def rounded_triangle_slab(corner_radius, round_radius, depth, arc_steps=8):
    """Equilateral triangle with rounded corners in the XZ plane, extruded along Y."""
    outline = []
    for k in range(3):
        a = math.pi / 2 + k * 2 * math.pi / 3
        px, pz = math.cos(a) * corner_radius, math.sin(a) * corner_radius
        for i in range(arc_steps + 1):
            t = a - math.pi / 3 + (2 * math.pi / 3) * i / arc_steps
            outline.append((px + math.cos(t) * round_radius, pz + math.sin(t) * round_radius))
    bm = bmesh.new()
    front = [bm.verts.new((x, -depth / 2, z)) for x, z in outline]
    back = [bm.verts.new((x, depth / 2, z)) for x, z in outline]
    bm.faces.new(front)
    bm.faces.new(list(reversed(back)))
    n = len(outline)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((front[i], front[j], back[j], back[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    return bm


def build_onigiri(collection):
    """Rice ball with a strip of nori. Faces -Y; origin at its centre."""
    slab = rounded_triangle_slab(0.045, 0.03, 0.058)
    rice = L.fuse([slab], voxel=0.003, smooth_iterations=10, smooth_lambda=0.9, target_tris=900)

    nori = bmesh.new()
    bmesh.ops.create_cube(nori, size=1.0)
    bmesh.ops.bevel(nori, geom=nori.edges[:], offset=0.12, segments=2, affect="EDGES", profile=0.5)
    L.transformed(nori, Matrix.Translation((0.0, 0.0, -0.038)) @ L.scale4(0.05, 0.064, 0.042))
    return L.assemble_colored("onigiri", [(rice, C["rice"]), (nori, C["nori"])], collection)


def box_bm(centre, size, bevel=0.0):
    """A box `size` (x, y, z) across around `centre`, its edges rounded by `bevel` metres."""
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    L.transformed(bm, L.scale4(*size))
    if bevel > 0.0:
        bmesh.ops.bevel(bm, geom=bm.edges[:], offset=min(bevel, 0.45 * min(size)), segments=2,
                        affect="EDGES", profile=0.5)
    return L.transformed(bm, Matrix.Translation(centre))


def label_bm(centre, width, height, lift=0.004):
    """A flat face for painted words, facing -Y, `lift` metres in front of `centre`. UVs run across
    it from its top-left, for the game's painted text; returns the bmesh and its UVs by vertex."""
    bm = bmesh.new()
    x0, x1 = centre.x - width / 2, centre.x + width / 2
    z0, z1 = centre.z - height / 2, centre.z + height / 2
    y = centre.y - lift
    vs = [bm.verts.new((x0, y, z1)), bm.verts.new((x1, y, z1)), bm.verts.new((x1, y, z0)), bm.verts.new((x0, y, z0))]
    bm.faces.new((vs[0], vs[3], vs[2], vs[1]))
    return bm, [(0.0, 0.0), (1.0, 0.0), (1.0, 1.0), (0.0, 1.0)]


def join(name, pieces, collection):
    """Join (bmesh, colour or a list of colours, one per vertex) pieces into one smooth-shaded
    object with a vertex colour layer."""
    flat = []
    combined = bmesh.new()
    for bm, colour in pieces:
        n = len(bm.verts)
        L.append_bm(combined, bm)
        flat.extend(colour if isinstance(colour, list) else [colour] * n)
        bm.free()
    mesh = bpy.data.meshes.new(name)
    combined.to_mesh(mesh)
    combined.free()
    data = []
    for c in flat:
        data.extend((float(c[0]), float(c[1]), float(c[2]), 1.0))
    col = mesh.color_attributes.new("Col", "FLOAT_COLOR", "POINT")
    col.data.foreach_set("color", data)
    mesh.color_attributes.active_color = col
    try:
        mesh.color_attributes.render_color_index = mesh.color_attributes.active_color_index
    except AttributeError:
        pass
    mesh.shade_smooth()
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)
    return obj


def object_with_uv(name, bm, uvs, collection):
    """An object from a bmesh with one UV per vertex (U across, V down from the top)."""
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
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)
    return obj


def build_sign(collection):
    """The No Entry sign before the cave: a weathered board on two posts, facing -Y, with a face
    for the game to paint its words on."""
    pieces = []
    for x in (-0.42, 0.42):
        pieces.append((segment_bm(Vector((x, 0.0, -0.3)), Vector((x, 0.0, 1.3)), 0.05, 0.045, segments=8), C["bark"]))
        pieces.append((L.ellipsoid_bm(Vector((x, 0.0, 1.3)), (0.048, 0.048, 0.03), u=10, v=6), C["bark"]))
    pieces.append((box_bm(Vector((0.0, -0.05, 0.98)), (1.1, 0.06, 0.44), bevel=0.015), C["board"]))
    sign = L.assemble_colored("sign", pieces, collection)
    face, uvs = label_bm(Vector((0.0, -0.08, 0.98)), 1.0, 0.36)
    label = object_with_uv("sign_label", face, uvs, collection)
    info = {"footprint": {"box": [0.55, 0.12]}, "height": 1.3,
            "label": {"size": [1.0, 0.36], "colour": "#C63A2C"}}
    return [sign, label], info


def wing_bm(outline, thickness):
    """A thin solid wing from an outline of (x, y) points round its edge, flat in the XY plane."""
    bm = bmesh.new()
    top = [bm.verts.new((x, y, thickness / 2)) for x, y in outline]
    bot = [bm.verts.new((x, y, -thickness / 2)) for x, y in outline]
    bm.faces.new(top)
    bm.faces.new(list(reversed(bot)))
    for i in range(len(outline)):
        j = (i + 1) % len(outline)
        bm.faces.new((top[i], bot[i], bot[j], top[j]))
    bmesh.ops.triangulate(bm, faces=bm.faces[:])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    return bm


def build_butterfly(collection):
    """A small blue butterfly, wings spread flat along X and its body along Y, facing -Y; the game
    flaps every vertex further than 6 mm from the middle as wing."""
    pieces = [(L.ellipsoid_bm(Vector((0.0, 0.0, 0.0)), (0.005, 0.03, 0.005), u=6, v=4), C["nori"])]
    for s in (-1.0, 1.0):
        upper = [(s * x, y) for x, y in ((0.007, -0.012), (0.04, -0.034), (0.068, -0.03), (0.075, -0.012),
                                         (0.06, 0.004), (0.007, 0.004))]
        lower = [(s * x, y) for x, y in ((0.007, 0.004), (0.048, 0.008), (0.054, 0.024), (0.036, 0.036),
                                         (0.007, 0.018))]
        for outline, colour in ((upper, C["wing"]), (lower, C["wingLight"])):
            if s < 0:
                outline = list(reversed(outline))
            pieces.append((wing_bm(outline, 0.003), colour))
    return [L.assemble_colored("butterfly", pieces, collection)], {}


BUILDERS = {
    "palm": build_palm,
    "log": build_log,
    "starfish": build_starfish,
    "onigiri": build_onigiri,
    "sign": build_sign,
    "butterfly": build_butterfly,
}


def render_prop(scene, cam, objs, path):
    for other in scene.objects:
        if other.type == "MESH":
            other.hide_render = other not in objs
    corners = [o.matrix_world @ Vector(c) for o in objs for c in o.bound_box]
    lo = Vector((min(c.x for c in corners), min(c.y for c in corners), min(c.z for c in corners)))
    hi = Vector((max(c.x for c in corners), max(c.y for c in corners), max(c.z for c in corners)))
    center = (lo + hi) * 0.5
    size = max((hi - lo).length, 0.05)
    direction = Vector((0.55, -1.0, 0.45)).normalized()
    cam.location = center + direction * (size * 4.0)
    cam.rotation_euler = (center - cam.location).to_track_quat("-Z", "Y").to_euler()
    cam.data.ortho_scale = size * 1.15
    scene.render.resolution_x = 420
    scene.render.resolution_y = 420
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)


def export_parts(objs, path, info):
    """Export a prop made of several parts into one .glb, its info as JSON on the first part."""
    objs[0]["prop"] = json.dumps(info, separators=(",", ":"))
    view_layer = bpy.context.view_layer
    view_layer.update()
    for o in bpy.data.objects:
        if o.name in view_layer.objects:
            o.select_set(False)
    for o in objs:
        o.select_set(True)
    view_layer.objects.active = objs[0]
    os.makedirs(os.path.dirname(path), exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=path, export_format="GLB", use_selection=True, export_extras=True, export_attributes=True,
        export_yup=True, export_normals=True, export_texcoords=True, export_vertex_color="ACTIVE",
        export_materials="NONE", export_animations=False, export_skins=False, export_morph=False,
        export_cameras=False, export_lights=False, export_apply=False,
    )


def build_all(builders, blend_path, prefix="prop"):
    """Build every prop in `builders` (or only the one named after --only), export each, render
    its preview and save them all to `blend_path`. A builder returns one object, or a list of
    parts and the prop's info for the game: its footprint, height, deck and label."""
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    only = argv[argv.index("--only") + 1] if "--only" in argv else None
    previews = "--no-previews" not in argv

    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    collection = bpy.data.collections.new("props")
    scene.collection.children.link(collection)

    built = []
    for prop_id, builder in builders.items():
        if only and prop_id != only:
            continue
        made = builder(collection)
        path = os.path.join(OUT_MODELS, f"{prop_id}.glb")
        if isinstance(made, tuple):
            objs, info = made
            export_parts(objs, path, {"version": 1, "id": prop_id, **info})
        else:
            objs = [made]
            L.export_glb(made, path, {"version": 1, "id": prop_id})
        tris = sum(len(p.vertices) - 2 for o in objs for p in o.data.polygons)
        verts = sum(len(o.data.vertices) for o in objs)
        print(f"BUILT {prop_id}: {verts} verts, {tris} tris -> {path}")
        built.append((prop_id, objs))

    x = 0.0
    for _, objs in built:
        width = max(max(o.dimensions.x for o in objs), 0.5)
        for o in objs:
            o.location.x = x + width / 2
        x += width + 1.0
    bpy.context.view_layer.update()

    if previews and built:
        cam = L.setup_preview(scene)
        for prop_id, objs in built:
            path = os.path.join(OUT_PREVIEWS, f"{prefix}_{prop_id}.png")
            render_prop(scene, cam, objs, path)
            print("PREVIEW", path)
        for _, objs in built:
            for o in objs:
                o.hide_render = False

    # Building only one prop leaves the others out, so the .blend keeps its full set.
    if not only:
        os.makedirs(os.path.dirname(blend_path), exist_ok=True)
        bpy.ops.wm.save_as_mainfile(filepath=blend_path, compress=True)
        print("SAVED", blend_path)


if __name__ == "__main__":
    build_all(BUILDERS, OUT_BLEND)
