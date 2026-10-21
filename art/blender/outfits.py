"""The island outfit: a flower crown and a grass skirt, as an asset of its own.

Character models never include the outfit. Each wearer gets a copy fitted to their
head and body, exported to public/models/outfits/island_<wearer>.glb, and the game
puts it on at runtime (and can take it off again). The outfit uses the same vertex
format as the characters, so it squashes, leans and sways with its wearer.

Coordinates are Blender's: Z up, the wearer faces -Y, stands on z = 0 and is centred
on the Z axis.
"""

import math

from mathutils import Matrix, Vector

import charlib as L

SKIRT_GREEN = "#C6EE86"  # sampled from the film


def surface_at(bvh, theta, z, reach=4.0):
    """Point and normal on a surface at azimuth theta (0 = front, -Y) and height z,
    found by casting a ray horizontally in toward the Z axis."""
    d = Vector((math.sin(theta), -math.cos(theta), 0.0))
    hit, nrm, _, _ = bvh.ray_cast(Vector((0.0, 0.0, z)) + d * reach, -d)
    return hit, nrm


def crown_pieces(bvh, height_at, count, size, thickness, colors, arc=None, push=1.4, offset=0.1,
                 outline=1.0, steps=28):
    """Clover flowers around a head, drawn face-on like the film's flower crowns.

    height_at(theta) gives the height of the flowers' centres at each azimuth, so the crown
    can follow a cap edge or sit level. With `arc`, flowers spread over [-arc, arc] around
    the front instead of a full ring.

    The film draws every flower of a crown face-on, even at the sides of the head, as a
    garland of Y and upside-down-Y clovers. So each flower is modelled facing the front and
    carries its centre: the game turns it to face the camera about that centre, and pulls it
    `push` flower-sizes toward the camera so it is drawn over the curve of the head instead
    of sinking into it. Neighbours sit on two layers so their outlines overlap cleanly.
    """
    cols = [L.hex_color(c) for c in colors]
    pieces = []
    to_front = L.basis_matrix(Vector((1.0, 0.0, 0.0)), Vector((0.0, 0.0, 1.0)), Vector((0.0, -1.0, 0.0)),
                              Vector((0.0, 0.0, 0.0)))
    for k in range(count):
        if arc is None:
            theta = 2.0 * math.pi * (k + 0.5) / count
        else:
            theta = -arc + 2.0 * arc * (k / (count - 1) if count > 1 else 0.5)
        zc = height_at(theta)
        hit, _ = surface_at(bvh, theta, zc)
        if hit is None:
            continue
        outward = Vector((math.sin(theta), -math.cos(theta), 0.0))
        center = hit + outward * (size * offset)
        # Alternate Y and upside-down Y, each a little askew, as if picked and tied by hand.
        rotation = (math.pi / 2 if k % 2 == 0 else -math.pi / 2) + 0.15 * math.sin(k * 2.3)
        flower = L.clover_bm(size / 2, thickness, rotation=rotation, steps=steps)
        flower = L.transformed(flower, Matrix.Translation(center) @ to_front)
        col = cols[k % len(cols)]
        bill = size * push + (1.5 * thickness if k % 2 == 0 else 0.0)
        c3 = L.to_three(center)
        # On the head, which turns on its own (charlib.HEAD).
        pieces.append(L.Piece(flower, lambda co, col=col, c3=c3, bill=bill:
                              L.attrs(col, L.HEAD, outline=outline, center=c3, bill=bill)))
    return pieces


def skirt_piece(envelope, top, bottom, r_top, r_hem, gap, bell=0.85, count=22, wave=0.005,
                color=SKIRT_GREEN, rows=10, segments=88, thickness=0.012):
    """A short grass skirt tied snugly at `top` that flares out to radius r_hem at `bottom`.

    The film ties the skirt just below the hands and draws it as a band about as wide as the
    lower body. The models' bodies are narrower there, so the skirt starts snug (radius r_top,
    no ledge to see from above) and flares like a lampshade; `bell` below 1 rounds the flare
    out near the top. envelope(z) is the body's radius at height z (body plus legs), which the
    skirt always clears by `gap`. Returns the piece and the pattern data the game's shader
    needs for the fringe strokes and hem line.
    """
    radii = []
    for i in range(rows + 1):
        u = i / rows  # 0 at the hem, 1 at the tie
        z = bottom + (top - bottom) * u
        r = r_hem + (r_top - r_hem) * u ** bell
        radii.append([max(r, envelope(z) + gap), z])
    radii[-1][0] = max(radii[-1][0], r_top)
    # Never narrower lower down: the skirt hangs, it does not tuck in.
    for i in range(rows - 1, -1, -1):
        radii[i][0] = max(radii[i][0], radii[i + 1][0])
    outer = [(r, z) for r, z in radii]
    rt, rb = outer[-1][0], outer[0][0]
    loop = [(rt - thickness, top), (rb - thickness * 0.6, bottom)] + outer
    bm = L.lathe_bm(loop, segments, 1.0, closed_loop=True)
    # Scallop the hem between fringe strokes.
    for v in bm.verts:
        if v.co.z < bottom + 0.004:
            ang = math.atan2(v.co.x, -v.co.y)
            v.co.z += wave * (0.5 + 0.5 * math.cos(count * ang))
    col = L.hex_color(color)
    hem = bottom + wave + 0.001

    # No outline along the hem, as in the film: the grass just ends there. The side outlines
    # taper off over the last row instead of turning the corner.
    def attr(co):
        return L.attrs(col, L.SKIRT, paint=L.PAINT_SKIRT, outline=0.0 if co.z < hem else 1.0)
    piece = L.Piece(bm, attr)
    info = {"bottom": round(bottom, 5), "top": round(top, 5), "count": count, "wave": round(wave, 5)}
    return piece, info


def export_outfit(name, pieces, path, wearer, skirt_info, collection):
    """Join the outfit pieces into one mesh and export it with its pattern data."""
    obj = L.assemble(name, pieces, collection)
    data = {"version": 1, "outfit": "island", "wearer": wearer, "skirt": skirt_info}
    L.export_glb(obj, path, data, key="outfit")
    return obj
