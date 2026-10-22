"""Shared helpers for building the characters in Blender.

Coordinates here are Blender's: Z up, the character faces -Y.
The glTF exporter converts to three.js space (Y up, facing +Z); rig data is
converted with to_three() so the game can use it directly.
"""

import json
import math
import os

import bmesh
import bpy
import numpy as np
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree

# Part indices, shared with src/characters/Model.ts. HEAD is a head that turns on its own about its neck
# (the Siren's); the cast's heads are their bodies.
BODY, ARM_L, ARM_R, FOOT_L, FOOT_R, EAR_L, EAR_R, EAR_L2, EAR_R2, SKIRT, TAIL, SPROUT, HEAD = range(13)
MAX_PARTS = 13

# Paint codes, shared with src/characters/CharacterMaterial.ts
PAINT_PLAIN, PAINT_BODY, PAINT_LEAF, PAINT_SKIRT = 0.0, 1.0, 2.0, 3.0
# A mermaid's scaled tail, the lines on her fin-hands and her band, inked along its edges (build_siren.py).
PAINT_SCALES, PAINT_FIN, PAINT_BAND = 4.0, 5.0, 6.0

UP = Vector((0.0, 0.0, 1.0))


# ------------------------------------------------------------------ maths
def srgb_to_linear(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def hex_color(h):
    h = h.lstrip("#")
    return tuple(srgb_to_linear(int(h[i:i + 2], 16) / 255.0) for i in (0, 2, 4))


def smoothstep(a, b, x):
    if b == a:
        return 1.0 if x >= b else 0.0
    t = max(0.0, min(1.0, (x - a) / (b - a)))
    return t * t * (3.0 - 2.0 * t)


def lerp(a, b, t):
    return a + (b - a) * t


def to_three(v):
    return [round(v[0], 5), round(v[2], 5), round(-v[1], 5)]


# ------------------------------------------------------------------ profiles
def _catmull_rom(p0, p1, p2, p3, t):
    t2, t3 = t * t, t * t * t
    return tuple(
        0.5 * ((2 * p1[i]) + (-p0[i] + p2[i]) * t
               + (2 * p0[i] - 5 * p1[i] + 4 * p2[i] - p3[i]) * t2
               + (-p0[i] + 3 * p1[i] - 3 * p2[i] + p3[i]) * t3)
        for i in range(2)
    )


class Profile:
    """Smooth (radius, height) outline, bottom to top, for a surface of revolution."""

    def __init__(self, ctrl, samples=48):
        pts = [tuple(p) for p in ctrl]
        ext = [pts[0]] + pts + [pts[-1]]
        dense = []
        for i in range(1, len(ext) - 2):
            for s in range(32):
                dense.append(_catmull_rom(ext[i - 1], ext[i], ext[i + 1], ext[i + 2], s / 32.0))
        dense.append(pts[-1])
        self.dense = [(max(0.0, r), z) for r, z in dense]
        self.height = pts[-1][1]

        lengths = [0.0]
        for a, b in zip(self.dense, self.dense[1:]):
            lengths.append(lengths[-1] + math.dist(a, b))
        total = lengths[-1]
        out, j = [], 0
        for k in range(samples + 1):
            target = total * k / samples
            while j < len(lengths) - 2 and lengths[j + 1] < target:
                j += 1
            seg = lengths[j + 1] - lengths[j]
            t = 0.0 if seg <= 0 else (target - lengths[j]) / seg
            a, b = self.dense[j], self.dense[j + 1]
            out.append((a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t))
        out[0] = (0.0, pts[0][1])
        out[-1] = (0.0, self.height)
        self.samples = out

    def radius_at(self, z):
        d = self.dense
        if z <= d[0][1]:
            return d[0][0]
        for a, b in zip(d, d[1:]):
            if a[1] <= z <= b[1] and b[1] > a[1]:
                return a[0] + (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1])
        return 0.0

    def max_radius(self):
        return max(r for r, _ in self.dense)

    def surface_point(self, phi, z, depth):
        r = self.radius_at(z)
        return Vector((r * math.sin(phi), -r * math.cos(phi) * depth, z))

    def surface_normal(self, phi, z, depth):
        e = 0.004
        dr = (self.radius_at(z + e) - self.radius_at(z - e)) / (2 * e)
        return Vector((math.sin(phi), -math.cos(phi) / depth, -dr)).normalized()


# ------------------------------------------------------------------ primitives (each returns a standalone BMesh)
def lathe_bm(samples, segments=64, depth=1.0, closed_loop=False):
    """Surface of revolution. Angle 0 is the front (-Y)."""
    bm = bmesh.new()
    rings = []
    for r, z in samples:
        if r <= 1e-6 and not closed_loop:
            rings.append([bm.verts.new((0.0, 0.0, z))])
        else:
            ring = []
            for j in range(segments):
                a = 2 * math.pi * j / segments
                ring.append(bm.verts.new((r * math.sin(a), -r * math.cos(a) * depth, z)))
            rings.append(ring)
    count = len(rings) if closed_loop else len(rings) - 1
    for i in range(count):
        lo, hi = rings[i], rings[(i + 1) % len(rings)]
        if len(lo) == 1 and len(hi) == 1:
            continue
        for j in range(segments):
            j2 = (j + 1) % segments
            if len(lo) == 1:
                bm.faces.new((lo[0], hi[j2], hi[j]))
            elif len(hi) == 1:
                bm.faces.new((lo[j], lo[j2], hi[0]))
            else:
                bm.faces.new((lo[j], lo[j2], hi[j2], hi[j]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    return bm


def sphere_bm(u=24, v=14):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=u, v_segments=v, radius=1.0)
    return bm


def transformed(bm, matrix):
    bmesh.ops.transform(bm, matrix=matrix, verts=bm.verts[:])
    return bm


def basis_matrix(x_axis, y_axis, z_axis, origin):
    m = Matrix.Identity(4)
    for row in range(3):
        m[row][0] = x_axis[row]
        m[row][1] = y_axis[row]
        m[row][2] = z_axis[row]
        m[row][3] = origin[row]
    return m


def scale4(x, y, z):
    return Matrix.Diagonal((x, y, z, 1.0))


def ellipsoid_bm(center, radii, rot=None, u=24, v=14):
    r4 = rot.to_4x4() if rot is not None else Matrix.Identity(4)
    return transformed(sphere_bm(u, v), Matrix.Translation(center) @ r4 @ scale4(*radii))


def capsule_bm(base, direction, length, radius, flatten=1.0, u=20, v=14, sink=0.0):
    """Capsule whose rounded base sits at `base` (minus `sink`) and grows along `direction`."""
    bm = sphere_bm(u, v)
    for vert in bm.verts:
        x, y, z = vert.co
        vert.co = Vector((x * radius, y * radius * flatten,
                          z * radius + (length if z > 1e-6 else 0.0) + radius - sink))
    rot = UP.rotation_difference(Vector(direction).normalized()).to_matrix().to_4x4()
    return transformed(bm, Matrix.Translation(base) @ rot)


def cone_bm(base, direction, radius, height, flatten=1.0, segments=18, tip=0.014):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=segments,
                          radius1=radius, radius2=tip, depth=height)
    for vert in bm.verts:
        vert.co = Vector((vert.co.x, vert.co.y * flatten, vert.co.z + height / 2))
    rot = UP.rotation_difference(Vector(direction).normalized()).to_matrix().to_4x4()
    return transformed(bm, Matrix.Translation(base) @ rot)


def trefoil_bm(radius, thickness, rotation=0.0, lobes=3, base=0.26, sharp=1.0, steps=72):
    """Flat clover flower like the anime's flower crowns, facing +Z, centred on the origin.

    The outline is a polar curve with `lobes` rounded petals and deep notches between them,
    which gives the film's distinct Y-shaped clovers.
    """
    bm = bmesh.new()
    outline = []
    for i in range(steps):
        t = 2.0 * math.pi * i / steps
        f = (0.5 + 0.5 * math.cos(lobes * (t - rotation))) ** sharp
        r = radius * (base + (1.0 - base) * f)
        outline.append((r * math.cos(t), r * math.sin(t)))
    half = thickness / 2.0
    front_c = bm.verts.new((0.0, 0.0, half))
    back_c = bm.verts.new((0.0, 0.0, -half))
    front = [bm.verts.new((x, y, half)) for x, y in outline]
    back = [bm.verts.new((x, y, -half)) for x, y in outline]
    n = len(outline)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((front_c, front[i], front[j]))
        bm.faces.new((back_c, back[j], back[i]))
        bm.faces.new((front[j], front[i], back[i], back[j]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    return bm


def clover_bm(radius, thickness, rotation=0.0, lobes=3, knob=0.34, core=0.3, steps=40):
    """Flat clover with round knobbed petals, like the Y-shaped flowers of the film's crowns.

    Each petal is a circle of radius `knob` (times `radius`) reaching the rim, joined to a
    centre disc of radius `core`; the deep notches between petals are what make the film's
    Y and upside-down-Y shapes read at a glance. Faces +Z, centred on the origin.
    """
    b = knob * radius
    a = radius - b
    centers = [(a * math.cos(rotation + 2.0 * math.pi * k / lobes), a * math.sin(rotation + 2.0 * math.pi * k / lobes))
               for k in range(lobes)]
    outline = []
    for i in range(steps):
        t = 2.0 * math.pi * i / steps
        dx, dy = math.cos(t), math.sin(t)
        r = core * radius
        for cx, cy in centers:
            along = dx * cx + dy * cy
            disc = b * b - (cx * cx + cy * cy - along * along)
            if disc >= 0.0:
                r = max(r, along + math.sqrt(disc))  # far side of the petal along this ray
        outline.append((r * dx, r * dy))
    bm = bmesh.new()
    half = thickness / 2.0
    front_c = bm.verts.new((0.0, 0.0, half))
    back_c = bm.verts.new((0.0, 0.0, -half))
    front = [bm.verts.new((x, y, half)) for x, y in outline]
    back = [bm.verts.new((x, y, -half)) for x, y in outline]
    n = len(outline)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((front_c, front[i], front[j]))
        bm.faces.new((back_c, back[j], back[i]))
        bm.faces.new((front[j], front[i], back[i], back[j]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    return bm


def leaf_bm(length, width, thickness, u=18, v=14):
    """Pointed leaf (vesica), base at the origin, growing along +Z, blade facing -Y."""
    bm = sphere_bm(u, v)
    for vert in bm.verts:
        x, y, z = vert.co
        k = math.sqrt(max(0.0, 1.0 - z * z))
        vert.co = Vector((x * k * width * 0.5, y * k * thickness * 0.5, (z + 1.0) * 0.5 * length))
    return bm


def outline_slab_bm(outline, thickness):
    """A flat shape of the closed outline [(x, z)], `thickness` thick (along Y): a crab's claw drawn from the
    side. Its edges are sharp; fuse it for a plush one."""
    bm = bmesh.new()
    front = [bm.verts.new((x, -thickness / 2, z)) for x, z in outline]
    back = [bm.verts.new((x, thickness / 2, z)) for x, z in outline]
    bm.faces.new(front)
    bm.faces.new(list(reversed(back)))
    n = len(outline)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((front[i], front[j], back[j], back[i]))
    bmesh.ops.triangulate(bm, faces=bm.faces[:])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    return bm


# ------------------------------------------------------------------ mesh plumbing
def append_bm(dst, src):
    tmp = bpy.data.meshes.new("_tmp")
    src.to_mesh(tmp)
    dst.from_mesh(tmp)
    bpy.data.meshes.remove(tmp)


def decimate_bm(bm, ratio, symmetric=True, keep=None):
    """A copy of a mesh collapsed to about `ratio` of its triangles, keeping its shape, and its
    left-right symmetry when `symmetric`: for background characters never seen up close, and
    for the island's ground. `keep` gives each vertex a weight from 0 to 1: the higher, the
    longer its edges are kept as they are (the ground's waterline keeps its detail this way)."""
    mesh = bpy.data.meshes.new("_dec")
    bm.to_mesh(mesh)
    obj = bpy.data.objects.new("_dec", mesh)
    bpy.context.scene.collection.objects.link(obj)
    dec = obj.modifiers.new("decimate", "DECIMATE")
    dec.decimate_type = "COLLAPSE"
    dec.ratio = ratio
    dec.use_symmetry = symmetric
    dec.symmetry_axis = "X"
    if keep is not None:
        # The modifier collapses the vertices in its group first; inverted, the kept ones last.
        group = obj.vertex_groups.new(name="keep")
        steps = [round(w, 1) for w in keep]
        for w in sorted(set(steps)):
            if w > 0.0:
                group.add([i for i, s in enumerate(steps) if s == w], w, "REPLACE")
        dec.vertex_group = "keep"
        dec.invert_vertex_group = True
        dec.vertex_group_factor = 1.0
    dg = bpy.context.evaluated_depsgraph_get()
    final = bpy.data.meshes.new_from_object(obj.evaluated_get(dg), depsgraph=dg)
    out = bmesh.new()
    out.from_mesh(final)
    bpy.data.objects.remove(obj)
    for m in (mesh, final):
        bpy.data.meshes.remove(m)
    return out


def fuse(bms, voxel=0.012, smooth_iterations=6, smooth_lambda=0.8, target_tris=6000):
    """Union overlapping closed shapes into one soft, plush-like surface.

    Voxel remesh merges the shapes, Laplacian smoothing rounds the seams like
    stuffing, decimation brings the triangle count down for phones.
    """
    combined = bmesh.new()
    for b in bms:
        append_bm(combined, b)
    mesh = bpy.data.meshes.new("_fuse")
    combined.to_mesh(mesh)
    combined.free()
    obj = bpy.data.objects.new("_fuse", mesh)
    bpy.context.scene.collection.objects.link(obj)

    rem = obj.modifiers.new("remesh", "REMESH")
    rem.mode = "VOXEL"
    rem.voxel_size = voxel
    rem.adaptivity = 0.0
    sm = obj.modifiers.new("smooth", "LAPLACIANSMOOTH")
    sm.iterations = smooth_iterations
    sm.lambda_factor = smooth_lambda
    sm.use_volume_preserve = True
    sm.use_normalized = True
    dg = bpy.context.evaluated_depsgraph_get()
    smoothed = bpy.data.meshes.new_from_object(obj.evaluated_get(dg), depsgraph=dg)

    obj2 = bpy.data.objects.new("_dec", smoothed)
    bpy.context.scene.collection.objects.link(obj2)
    tris = sum(len(p.vertices) - 2 for p in smoothed.polygons)
    dec = obj2.modifiers.new("decimate", "DECIMATE")
    dec.decimate_type = "COLLAPSE"
    dec.ratio = min(1.0, target_tris / max(1, tris))
    dg = bpy.context.evaluated_depsgraph_get()
    final = bpy.data.meshes.new_from_object(obj2.evaluated_get(dg), depsgraph=dg)

    out = bmesh.new()
    out.from_mesh(final)
    for o in (obj, obj2):
        bpy.data.objects.remove(o)
    for m in (mesh, smoothed, final):
        bpy.data.meshes.remove(m)
    bmesh.ops.recalc_face_normals(out, faces=out.faces[:])
    return out


class Piece:
    """A chunk of geometry plus a function giving each vertex its game attributes.

    With indexed=True the function receives (co, i), where i is the vertex's index in
    this piece's own bmesh, so per-vertex data computed elsewhere can be looked up.
    """

    __slots__ = ("bm", "attr", "indexed")

    def __init__(self, bm, attr, indexed=False):
        self.bm = bm
        self.attr = attr
        self.indexed = indexed


def attrs(color, part0=BODY, part1=None, weight=0.0, paint=PAINT_PLAIN, outline=1.0, uv=None, lift=0.0,
          mask=0.0, center=None, bill=0.0):
    """Per-vertex game data. `lift` pulls the outline toward the camera so a solid part
    (an arm, a tail) shows its outline where it overlaps the body; keep it 0 on thin parts.
    `mask` above 0.5 paints the character's second colour (Hachiware's cap, inner ears),
    with an outline drawn along the 0.5 boundary.

    `bill` above 0 makes a billboard: the shape was modelled facing the front around
    `center` (in the game's Y-up coordinates), and the game keeps it facing the camera,
    pulled `bill` metres toward it."""
    return {
        "color": color,
        "part0": part0,
        "part1": part0 if part1 is None else part1,
        "weight": weight,
        "paint": paint,
        "outline": outline,
        "uv": uv,
        "lift": lift,
        "mask": mask,
        "center": center,
        "bill": bill,
    }


def assemble(name, pieces, collection, keep_uv=None):
    """Join all pieces into one mesh object carrying the game's vertex attributes.

    keep_uv names a UV layer the pieces brought with them (from a converted model) to export
    as the second UV set, after the face UVs; the game samples the mask texture with it.
    """
    combined = bmesh.new()
    ranges = []
    for piece in pieces:
        start = len(combined.verts)
        append_bm(combined, piece.bm)
        ranges.append((start, len(combined.verts), piece.attr, piece.indexed))
        piece.bm.free()
    mesh = bpy.data.meshes.new(name)
    combined.to_mesh(mesh)
    combined.free()

    n = len(mesh.vertices)
    part0, part1, weight = [0.0] * n, [0.0] * n, [0.0] * n
    paint, outline, lift, mask = [0.0] * n, [1.0] * n, [0.0] * n, [0.0] * n
    center, bill = [0.0] * (3 * n), [0.0] * n
    color = [1.0] * (4 * n)
    vuv = [None] * n
    for start, end, fn, indexed in ranges:
        for i in range(start, end):
            co = mesh.vertices[i].co
            a = fn(co, i - start) if indexed else fn(co)
            part0[i] = float(a["part0"])
            part1[i] = float(a["part1"])
            weight[i] = float(a["weight"])
            paint[i] = float(a["paint"])
            outline[i] = float(a["outline"])
            lift[i] = float(a.get("lift", 0.0))
            mask[i] = float(a.get("mask", 0.0))
            if a.get("bill", 0.0) > 0.0:
                bill[i] = float(a["bill"])
                center[3 * i:3 * i + 3] = a["center"]
            c = a["color"]
            color[4 * i] = c[0]
            color[4 * i + 1] = c[1]
            color[4 * i + 2] = c[2]
            vuv[i] = a["uv"]

    for attr_name, data in (("_part0", part0), ("_part1", part1), ("_weight", weight),
                            ("_paint", paint), ("_outline", outline), ("_lift", lift), ("_mask", mask)):
        at = mesh.attributes.new(attr_name, "FLOAT", "POINT")
        at.data.foreach_set("value", data)
    if any(bill):
        # Custom attributes are exported as they are, without the Z-up to Y-up swap, which is
        # why billboard centres are given in the game's coordinates.
        mesh.attributes.new("_bill", "FLOAT", "POINT").data.foreach_set("value", bill)
        mesh.attributes.new("_center", "FLOAT_VECTOR", "POINT").data.foreach_set("vector", center)
    col = mesh.color_attributes.new("Col", "FLOAT_COLOR", "POINT")
    col.data.foreach_set("color", color)
    mesh.color_attributes.active_color = col
    try:
        mesh.color_attributes.render_color_index = mesh.color_attributes.active_color_index
    except AttributeError:
        pass

    # UVs: the glTF exporter flips V, so store 1 - v to export v unchanged. Pieces copied from
    # other models bring their own UV layers; drop them so ours is the one exported first.
    kept = None
    if keep_uv and keep_uv in mesh.uv_layers:
        kept = [0.0] * (2 * len(mesh.loops))
        mesh.uv_layers[keep_uv].data.foreach_get("uv", kept)
    while mesh.uv_layers:
        mesh.uv_layers.remove(mesh.uv_layers[0])
    uv_layer = mesh.uv_layers.new(name="UVMap")
    loop_vertex = [0] * len(mesh.loops)
    mesh.loops.foreach_get("vertex_index", loop_vertex)
    flat = []
    for vi in loop_vertex:
        uv = vuv[vi]
        if uv is None:
            flat.extend((-1.0, 2.0))
        else:
            flat.extend((uv[0], 1.0 - uv[1]))
    uv_layer.data.foreach_set("uv", flat)
    if kept is not None:
        mesh.uv_layers.new(name="MaskUV").data.foreach_set("uv", kept)
    mesh.uv_layers.active_index = 0
    try:
        mesh.uv_layers[0].active_render = True
    except AttributeError:
        pass

    mesh.shade_smooth()
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)
    return obj


def assemble_colored(name, pieces, collection, smooth=True):
    """Join (bmesh, color) pairs into one object with a single vertex colour layer."""
    combined = bmesh.new()
    colors = []
    for bm, color in pieces:
        before = len(combined.verts)
        append_bm(combined, bm)
        colors.extend([color] * (len(combined.verts) - before))
        bm.free()
    mesh = bpy.data.meshes.new(name)
    combined.to_mesh(mesh)
    combined.free()
    flat = []
    for c in colors:
        flat.extend((c[0], c[1], c[2], 1.0))
    col = mesh.color_attributes.new("Col", "FLOAT_COLOR", "POINT")
    col.data.foreach_set("color", flat)
    mesh.color_attributes.active_color = col
    try:
        mesh.color_attributes.render_color_index = mesh.color_attributes.active_color_index
    except AttributeError:
        pass
    if smooth:
        mesh.shade_smooth()
    else:
        mesh.shade_flat()
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)
    return obj


# ------------------------------------------------------------------ output
# Every model the build scripts export is compressed with Draco, for the game's download (PLAN.md's
# first load): positions to 16 bits of each mesh's size (within 7 mm across the 520 m ground, a
# fraction of a millimetre on a prop or a character), normals to 12 bits, texture coordinates to 16
# (the faces, the houses' night maps), custom attributes to 14; colours stay exact. The game decodes
# them in src/core/gltf.ts.
DRACO = dict(
    export_draco_mesh_compression_enable=True,
    export_draco_mesh_compression_level=6,
    export_draco_position_quantization=16,
    export_draco_normal_quantization=12,
    export_draco_texcoord_quantization=16,
    export_draco_color_quantization=12,
    export_draco_generic_quantization=14,
)


def write_webp(path, img):
    """A lossless WebP of img (H, W, 3 or 4), top row first, uint8 or floats 0..1: every pixel kept,
    except the colour under fully clear ones, which nothing draws."""
    if img.dtype != np.uint8:
        img = (np.clip(img, 0.0, 1.0) * 255.0 + 0.5).astype(np.uint8)
    h, w, channels = img.shape
    rgba = np.ones((h, w, 4), dtype=np.float32)
    rgba[..., :channels] = img[::-1] / 255.0  # Blender's rows run from the bottom up
    image = bpy.data.images.new("webp", w, h, alpha=channels == 4)
    try:
        image.pixels.foreach_set(rgba.ravel())
        image.file_format = "WEBP"
        os.makedirs(os.path.dirname(path), exist_ok=True)
        image.save(filepath=path, quality=100)  # 100: lossless
    finally:
        bpy.data.images.remove(image)


def export_glb(obj, path, data, key="rig"):
    """Export one object as .glb, with `data` as JSON in the node's extras under `key`."""
    obj[key] = json.dumps(data, separators=(",", ":"))
    view_layer = bpy.context.view_layer
    view_layer.update()
    for o in bpy.data.objects:
        if o is not None and o.name in view_layer.objects:
            o.select_set(False)
    obj.select_set(True)
    view_layer.objects.active = obj
    os.makedirs(os.path.dirname(path), exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLB",
        use_selection=True,
        export_extras=True,
        export_attributes=True,
        export_yup=True,
        export_normals=True,
        export_texcoords=True,
        export_vertex_color="ACTIVE",
        export_materials="NONE",
        export_animations=False,
        export_skins=False,
        export_morph=False,
        export_cameras=False,
        export_lights=False,
        export_apply=False,
        **DRACO,
    )


def setup_preview(scene, background=(0.78, 0.9, 0.98)):
    scene.render.engine = "BLENDER_WORKBENCH"
    shading = scene.display.shading
    shading.light = "STUDIO"
    shading.color_type = "VERTEX"
    shading.show_object_outline = True
    shading.object_outline_color = (0.35, 0.23, 0.18)
    shading.show_specular_highlight = False
    world = bpy.data.worlds.new("preview")
    world.color = background
    scene.world = world
    cam_data = bpy.data.cameras.new("preview_cam")
    cam_data.type = "ORTHO"
    cam = bpy.data.objects.new("preview_cam", cam_data)
    scene.collection.objects.link(cam)
    scene.camera = cam
    return cam


def render_turnaround(scene, cam, objects, out_dir, prefix, width, height, ortho_scale, target_z):
    """Render front, three-quarter, side and back views, each character turning in place."""
    os.makedirs(out_dir, exist_ok=True)
    cam.data.ortho_scale = ortho_scale
    cam.location = Vector((0.0, -10.0, target_z + 0.6))
    direction = Vector((0.0, 0.0, target_z)) - cam.location
    cam.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
    scene.render.resolution_x = width
    scene.render.resolution_y = height
    paths = []
    for view, degrees in (("front", 0), ("three_quarter", -35), ("side", -90), ("back", 180)):
        for obj in objects:
            obj.rotation_euler = (0.0, 0.0, math.radians(degrees))
        scene.render.filepath = os.path.join(out_dir, f"{prefix}_{view}.png")
        bpy.ops.render.render(write_still=True)
        paths.append(scene.render.filepath)
    for obj in objects:
        obj.rotation_euler = (0.0, 0.0, 0.0)
    return paths
