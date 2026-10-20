"""The forbidden cave's inside, after the film's frames of it (`cave interior 1` to `8`) and the plan's
(PLAN.md, section 5): from its one mouth on the west beach a passage on foot under the terraced
outcrop, its vault draped in wavy flowstone and long drips, rubble along its walls; then a cavern
where the cave's sea comes in onto a little beach, a rowboat drawn up on it, heavy rounded rock
hanging overhead; the cave's sea, dark, running on under the spur to the domed chamber under the
skylight, where the water glows; and on its far side a ledge of stone, crystals standing at its back,
a small fire on it. No other way in or out.

Built with the island (build_island.py builds the rock it runs through and the skylight's dome, and
calls build()). The cave's walls are one tube of rock from the mouth's arch (karst.Rock's tunnel) to
the doorway in the dome's wall (karst.skylight's door), its outline across changing along the way;
the ground and rock it runs through are cut away inside it (inside()). Everything inside is lit by
the game, not the sun: each vertex carries how open it is (`ao`), how much of the skylight's opening
it sees (`sky`) and how much of the glowing water (`glow`), as the attribute `_light`, and the game
adds the torch and the fire (src/world/Cave.ts). Characters walk the cave on its own grid of floor and
ceiling heights, not the island's (grid()).

Game coordinates throughout (x east, z south, y up), turned into Blender's (x, -z, y) only as the
vertices are made.
"""

import math

import bmesh
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree

import charlib as L

WATER = -0.32          # the cave's sea, the sea's own level: it comes in under the rock

# The way through, from the mouth to the dome: points along its middle (x, z), the floor's height
# there, how wide it is at the floor, and how high its vault rises over its floor (or its water,
# where the floor is under it). The mouth's arch opens 3 m wide and 2.8 high; the passage behind it
# runs north-east under the outcrop's tiers, a tunnel little wider or higher than the mouth, its vault
# close over the torch as the film's (`cave interior 1`); the cavern with the beach opens under the
# high tiers; the sea runs on east under the spur to the doorway in the dome's wall.
ROUTE = [
    ((-193.1, -111.9), 0.35, 3.1, 2.9),
    ((-193.2, -114.2), 0.38, 3.2, 2.8),
    ((-192.6, -117.0), 0.42, 3.3, 2.7),
    ((-190.5, -120.0), 0.46, 3.3, 2.6),
    ((-187.0, -121.7), 0.50, 3.5, 2.8),
    ((-183.2, -122.1), 0.48, 5.6, 3.7),
    ((-179.6, -122.5), 0.12, 9.0, 4.9),
    ((-176.0, -123.1), -0.80, 9.0, 5.0),
    ((-171.5, -124.1), -1.70, 7.6, 4.8),
    ((-167.0, -125.6), -2.10, 7.0, 4.6),
    ((-162.5, -128.2), -2.30, 7.5, 4.5),
    ((-158.9, -131.4), -2.40, 8.0, 4.1),
    ((-155.8, -134.6), -2.30, 8.4, 3.8),
    ((-152.8, -136.8), -2.20, 8.4, 3.6),
]
STEP = 0.4             # metres between the tube's rings
CLEAR = 1.9            # nothing hangs lower than this over the water or a floor: the boat's rower needs 1.4
# The cavern's beach: where the boat lies drawn up on its sand (x, z), as the film's (`cave interior 2`).
BEACH = {"boat": (-179.0, -125.0)}
FLOOR_POINTS = 14      # points across a ring's floor, and round its walls and vault
ARCH_POINTS = 38
# The dome's doorway, where the sea comes in: its middle's angle round the dome (from east toward
# south), its half width at the wall, and the height of its top.
DOOR = (math.radians(152.0), 4.2, 3.2)
# The doorway in the dome's far wall, where the sea runs on, east under the high ground, to the chamber
# with the ledge; as DOOR.
DOOR_ON = (math.radians(-8.3), 3.4, 2.9)
# That chamber, deeper in past the dome, dark but for the fire and the torch, as the film's ledge
# (`cave interior 7`, `8`): its middle (x, z), how far its wall stands from it at the water, how high
# its vault rises over the water, its floor's height under the water, its doorway toward the dome
# (angle, half width, top) and its seed. Under the high ground, four metres and more of rock over it
# (the ground over it is 10.3 m high at its lowest). Big enough that the Siren, giant as she is, rests
# on its ledge by the cast, as in the film (the user, 2026-10-20); its middle east of where it was, so
# its doorway is where it was, where the sea's way from the dome comes to it.
CHAMBER = {"centre": (-116.63, -145.85), "radius": 10.0, "rise": 6.6, "floor": -2.6,
           "door": (math.radians(171.7), 3.4, 2.9), "seed": 9}
# The sea's way on from the dome's far doorway to the chamber's, as ROUTE.
ROUTE_ON = [
    ((-132.6, -143.5), -2.2, 6.6, 3.3),
    ((-129.5, -144.0), -2.3, 6.4, 3.4),
    ((-126.5, -144.4), -2.2, 6.6, 3.3),
]

# The stone's own colours: pale, as the film's cave rock shows where the torch lights it; the game's
# light turns it the film's deep blue away from the torch.
STONE = {"rock": "#CFCBC2", "rockDark": "#A9A69F", "rockPale": "#E2DED4", "floor": "#BDB9B0", "sand": "#E4DAC0",
         "wet": "#8E8F8E", "deep": "#7D8488"}


def palette(hexes):
    return {k: np.array(L.hex_color(v)[:3]) for k, v in hexes.items()}


C = palette(STONE)


# ---------------------------------------------------------------------------- noise
def _hash(ix, iy, iz, seed):
    """A fixed hash of integer lattice points, 0 to 1."""
    h = (ix * 374761393 + iy * 668265263 + iz * 1442695041 + seed * 2246822519) & 0xFFFFFFFF
    h = ((h ^ (h >> 13)) * 1274126177) & 0xFFFFFFFF
    return ((h ^ (h >> 16)) & 0xFFFF) / 65535.0


def noise3(p, seed=0):
    """Smooth value noise, -1 to 1, at points p (N, 3)."""
    p = np.asarray(p, dtype=float).reshape(-1, 3)
    i = np.floor(p).astype(np.int64)
    f = p - i
    u = f * f * (3.0 - 2.0 * f)
    total = np.zeros(len(p))
    for dx in (0, 1):
        wx = u[:, 0] if dx else 1.0 - u[:, 0]
        for dy in (0, 1):
            wy = u[:, 1] if dy else 1.0 - u[:, 1]
            for dz in (0, 1):
                wz = u[:, 2] if dz else 1.0 - u[:, 2]
                total += wx * wy * wz * _hash(i[:, 0] + dx, i[:, 1] + dy, i[:, 2] + dz, seed)
    return total * 2.0 - 1.0


def smoothstep(a, b, x):
    t = np.clip((np.asarray(x, dtype=float) - a) / (b - a), 0.0, 1.0)
    return t * t * (3.0 - 2.0 * t)


def mix_scalar(a, b, t):
    """a to b by t, element by element."""
    return a + (b - a) * t


def mix(a, b, t):
    t = np.asarray(t, dtype=float)
    return a + (b - a) * t[..., None]


def bl(p):
    """A game point as Blender's."""
    return Vector((float(p[0]), -float(p[2]), float(p[1])))


# ---------------------------------------------------------------------------- the way through
def centreline(route=ROUTE, step=STEP):
    """Points every `step` metres along the cave's middle, through `route`'s points (Catmull-Rom), each
    with its floor's height, width and vault's height eased between theirs: rows of (x, z, floor,
    width, tall) and the way on there (x, z)."""
    pts = np.array([[x, z, f, w, t] for (x, z), f, w, t in route], dtype=float)
    n = len(pts)
    dense = []
    for i in range(n - 1):
        p0, p1, p2, p3 = pts[max(i - 1, 0)], pts[i], pts[i + 1], pts[min(i + 2, n - 1)]
        for s in np.linspace(0.0, 1.0, 60, endpoint=False):
            s2, s3 = s * s, s * s * s
            dense.append(0.5 * (2 * p1 + (p2 - p0) * s + (2 * p0 - 5 * p1 + 4 * p2 - p3) * s2 + (3 * p1 - p0 - 3 * p2 + p3) * s3))
    dense.append(pts[-1])
    dense = np.array(dense)
    seg = np.hypot(np.diff(dense[:, 0]), np.diff(dense[:, 1]))
    along = np.concatenate([[0.0], np.cumsum(seg)])
    marks = np.linspace(0.0, along[-1], int(round(along[-1] / step)) + 1)
    rows = np.stack([np.interp(marks, along, dense[:, k]) for k in range(5)], axis=1)
    way = np.gradient(rows[:, :2], axis=0)
    way /= np.linalg.norm(way, axis=1)[:, None]
    return rows, way


def section(row, way, floor_at=None, arch_at=None):
    """The cave's outline across it at one of centreline's points: its floor from the right wall's foot
    to the left's (a little dished, deeper where it is under water), then up the left wall, over the
    vault and down the right one; the floor's points at `floor_at` (1 at the right foot to -1 at the
    left) and the arch's at `arch_at` (pi at the left foot to 0 at the right), FLOOR_POINTS and
    ARCH_POINTS of them evenly if left out. Returns the points (M, 3), what each is (0 floor, 1 wall,
    2 vault) and the way out from the cave's middle at each (M, 3)."""
    x, z, floor, width, tall = row
    right = np.array([-way[1], way[0]])
    base = max(floor, WATER)
    rise = base + tall - floor
    half = width / 2.0
    dish = 0.06 + 0.5 * smoothstep(WATER, WATER - 1.5, floor)
    if floor_at is None:
        floor_at = np.linspace(1.0, -1.0, FLOOR_POINTS, endpoint=False)
    if arch_at is None:
        arch_at = np.linspace(math.pi, 0.0, ARCH_POINTS, endpoint=False)
    pts, kind, out = [], [], []
    for q in floor_at:
        a = q * half
        pts.append((x + right[0] * a, floor - dish * (1.0 - q * q), z + right[1] * a))
        kind.append(0)
        out.append((0.0, -1.0, 0.0))
    for a in arch_at:
        across = half * math.cos(a)
        s = max(math.sin(a), 0.0) ** 0.75
        pts.append((x + right[0] * across, floor + rise * s, z + right[1] * across))
        kind.append(1 if s < 0.62 else 2)
        o = np.array([right[0] * math.cos(a), math.sin(a), right[1] * math.cos(a)])
        out.append(tuple(o / np.linalg.norm(o)))
    return np.array(pts), np.array(kind), np.array(out)


def loop_params(loop, floor_y):
    """Where each point of an opening's edge (starting at its right foot and running along its floor
    first, see orient_loop) falls on a ring's outline: (floor_at, arch_at) for section(). Its floor is
    the run of points from the start at `floor_y` (within a few centimetres); the rest is its arch, back
    round to the start."""
    loop = np.asarray(loop, dtype=float)
    k = 1
    while k < len(loop) and abs(loop[k, 1] - floor_y) < 0.05:
        k += 1
    fl, ar = loop[:k], np.vstack([loop[k - 1:], loop[:1]])

    def fractions(p):
        seg = np.linalg.norm(np.diff(p, axis=0), axis=1)
        total = max(seg.sum(), 1e-9)
        return np.concatenate([[0.0], np.cumsum(seg)]) / total

    floor_at = 1.0 - 2.0 * fractions(fl)
    arch_at = math.pi * (1.0 - fractions(ar)[1:-1])
    return floor_at, arch_at


def rough(pts, kind, out, calm=1.0, width=3.3):
    """The rock's own unevenness, pushed out of the cave (more than 0: a hollow) or into it (less: a
    lump) from its smooth outline: broad lumps, bigger and broader where the cave is wider (`width`), and
    smaller ones; where it is wide, as in the cavern and the sea's ways, heavy rounded masses standing out,
    as the film's (`cave interior 2`, `3`); over the vault wavy ridges of flowstone, and flowstone hanging
    in runs down the walls and from the vault, drawn out up and down, as over the film's passage (`cave
    interior 1`); the floor only a little uneven. `calm` (0 to 1) of it, by the mouth, where the face
    leans over the passage close above."""
    # Low down, by the water and the floors, where the boat turns and walkers go, the rock is as it always
    # was; the bigger rock (`high`) is above that, over the rower's head (the boat needs 1.4 m over the
    # water) and the walkers'.
    high = smoothstep(WATER + 1.9, WATER + 3.0, pts[:, 1])
    big = (width / 3.3) ** 0.6
    lumps = mix_scalar(0.24 * noise3(pts * 0.42, 1), 0.24 * big * noise3(pts * 0.42 / big ** 0.5, 1), high)
    lumps = lumps + 0.1 * noise3(pts * 1.1, 2) + 0.035 * noise3(pts * 3.1, 3)
    # Flowstone: ridges running round the vault, wavering along it.
    wave = np.sin(pts[:, 1] * 9.0 + 2.4 * noise3(pts * 0.7, 4) + 1.6 * noise3(pts * 0.25, 5))
    crest = (1.0 - np.abs(wave)) ** 3
    ridges = 0.075 * crest * (kind == 2) + 0.035 * crest * (kind == 1)
    # And in runs down the walls and from the vault, standing out a little.
    runs = 0.09 * np.clip(noise3(pts * np.array([1.4, 0.22, 1.4]), 7), 0.0, None) ** 0.8 * (kind > 0)
    runs = runs * smoothstep(WATER + 1.5, WATER + 2.2, pts[:, 1])
    # Heavy rounded masses, where the cave is wide.
    masses = 0.6 * smoothstep(4.5, 8.5, width) * np.clip(noise3(pts * 0.3, 8), 0.0, None) ** 1.4 * (kind > 0) * high
    d = np.where(kind == 0, 0.02 * noise3(pts * 0.9, 6), lumps + ridges - runs - masses) * calm
    return pts + out * d[:, None], d


def zip_rings(a, b):
    """Triangles joining two loops of points (indices into each) that run the same way round, from
    their first points: each step goes on along whichever loop is behind, by how far round it is."""
    def fractions(p):
        seg = np.linalg.norm(np.diff(np.vstack([p, p[:1]]), axis=0), axis=1)
        return np.concatenate([[0.0], np.cumsum(seg)[:-1]]) / max(seg.sum(), 1e-9)
    fa, fb = fractions(a), fractions(b)
    na, nb = len(a), len(b)
    i = j = 0
    tris = []
    while i < na or j < nb:
        ta = fa[i + 1] if i + 1 < na else 1.0
        tb = fb[j + 1] if j + 1 < nb else 1.0
        # Wound as the quads between rings of the same size are, (a_i, b_i, b_i+1, a_i+1).
        if (ta <= tb and i < na) or j >= nb:
            tris.append((("a", i % na), ("b", j % nb), ("a", (i + 1) % na)))
            i += 1
        else:
            tris.append((("a", i % na), ("b", j % nb), ("b", (j + 1) % nb)))
            j += 1
    return tris


def orient_loop(loop, start_near, along_toward):
    """A loop of points (an opening's edge) turned to start at its point nearest `start_near` (its right
    foot) and to run on along its floor toward `along_toward` first: the way whose next point (not the
    same one again) stays level and comes nearer."""
    loop = np.asarray(loop, dtype=float)
    # Its foot: of the points along its floor (its lowest), the one nearest across.
    level = np.abs(loop[:, 1] - loop[:, 1].min()) < 0.05
    gap = np.hypot(loop[:, 0] - start_near[0], loop[:, 2] - start_near[2])
    k = int(np.argmin(np.where(level, gap, np.inf)))
    loop = np.roll(loop, -k, axis=0)

    def next_distinct(seq):
        return next((p for p in seq if np.linalg.norm(p - loop[0]) > 1e-3), seq[0])

    def score(p):
        return 10.0 * abs(p[1] - loop[0][1]) + float(np.linalg.norm(p - along_toward))

    if score(next_distinct(loop[::-1][:-1])) < score(next_distinct(loop[1:])):
        loop = np.vstack([loop[:1], loop[1:][::-1]])
    return loop


THROAT = 5             # rings over which the mouth's arch, and the doorway, turn into the cave's outline


def tube(mouth_loop, door_loop, seed=0, route=ROUTE, by_mouth=True):
    """The cave's walls: rings of its outline along `route`, joined into one tube, from the mouth's
    arch to the dome's doorway (or from one doorway to another). At either end the opening's own edge
    (from the rock or the dome) turns over THROAT rings into the cave's outline. Returns (bmesh,
    colours, each vertex's game position, the rings with what their points are, for placing things
    along the walls)."""
    rows, way = centreline(route)
    n = len(rows)
    rings = []
    # Calm by the mouth, where the face leans over the passage close above.
    calm = smoothstep(1.2, 3.5, np.arange(n) * STEP) if by_mouth else np.ones(n)
    for k, (row, w) in enumerate(zip(rows, way)):
        pts, kind, out = section(row, w)
        pts, d = rough(pts, kind, out, float(calm[k]), row[3])
        rings.append((pts, kind, out, d, row))
    # The openings' edges, each turned to start at the right wall's foot and run along its floor first,
    # as the rings do.
    probe = rings[THROAT][0]
    mouth = orient_loop(mouth_loop, probe[0], probe[FLOOR_POINTS - 1])
    probe = rings[n - 1 - THROAT][0]
    door = orient_loop(door_loop, probe[0], probe[FLOOR_POINTS - 1])

    def throat(loop, k, t):
        """Ring k of a throat, `t` of the way from the opening's edge to the cave's own outline."""
        floor_at, arch_at = loop_params(loop, loop[0, 1])
        pts, kind, out = section(rows[k], way[k], floor_at, arch_at)
        pts, d = rough(pts, kind, out, float(calm[k]), rows[k][3])
        e = t * t * (3.0 - 2.0 * t)
        return loop + (pts - loop) * e, kind, out, d * e, rows[k]

    body = []
    for k in range(n):
        if k <= THROAT:
            body.append(throat(mouth, k, k / THROAT))
        elif k >= n - 1 - THROAT:
            body.append(throat(door, k, (n - 1 - k) / THROAT))
        else:
            body.append(rings[k])

    bm = bmesh.new()
    verts, positions, colours = [], [], []
    for pts, kind, out, d, row in body:
        vs = [bm.verts.new(bl(p)) for p in pts]
        verts.append(vs)
        positions.extend(pts)
        colours.extend(list(paint_loop(pts, kind, d, row)))

    def face(vs):
        try:
            bm.faces.new(vs)
        except ValueError:
            pass

    for ra, rb in zip(verts, verts[1:]):
        if len(ra) == len(rb):
            n = len(ra)
            for i in range(n):
                j = (i + 1) % n
                face((ra[i], rb[i], rb[j], ra[j]))
        else:
            pa = np.array([[v.co.x, v.co.y, v.co.z] for v in ra])
            pb = np.array([[v.co.x, v.co.y, v.co.z] for v in rb])
            for tri in zip_rings(pa, pb):
                face([ra[k] if w == "a" else rb[k] for w, k in tri])
    # Every face is wound the same way round the tube, so all of them look into the cave once one of the
    # floor's faces halfway along looks up.
    bm.normal_update()
    probe = verts[len(verts) // 2][FLOOR_POINTS // 2]
    if max(probe.link_faces, key=lambda f: abs(f.normal.z)).normal.z < 0.0:
        bmesh.ops.reverse_faces(bm, faces=bm.faces[:])
    return bm, colours, positions, body


class Air:
    """The cave's air: what lies inside its walls (the tube and the dome under the skylight, whose faces
    all look into it), for cutting away the rock and ground the cave runs through. A point is in it if
    the first wall straight over it looks down at it."""

    def __init__(self, *bms):
        combined = bmesh.new()
        for bm in bms:
            L.append_bm(combined, bm)
        combined.normal_update()
        self.bvh = BVHTree.FromBMesh(combined)
        combined.free()

    def inside(self, p, grow=0.0):
        """Whether the game point p is in the cave's air, or within `grow` metres under or beside its
        walls (tested at p and `grow` either way)."""
        tests = [p] if grow <= 0.0 else [p, (p[0] + grow, p[1], p[2]), (p[0] - grow, p[1], p[2]),
                                        (p[0], p[1], p[2] + grow), (p[0], p[1], p[2] - grow), (p[0], p[1] + grow, p[2])]
        for q in tests:
            hit, normal, _, _ = self.bvh.ray_cast(bl(q), Vector((0.0, 0.0, 1.0)))
            if hit is not None and normal.z < 0.0:
                return True
        return False

    def cut(self, bm, grow=0.1, corners=True, bounds=None, plain=None):
        """Deletes the faces of `bm` (Blender coordinates) that reach into the cave's air: any of their
        corners (or only their middle) in it, or within `grow` of it; only those whose middle is within
        `bounds` (x0, z0, x1, z1), if given; and where `plain(x, z)` holds for a face's middle (game x, z),
        only if its middle is in the air. Their vertices are kept, unused, so the mesh's colours still
        match them. Returns how many went."""
        doomed = []
        for f in bm.faces:
            c = f.calc_center_median()
            if bounds is not None and not (bounds[0] <= c.x <= bounds[2] and bounds[1] <= -c.y <= bounds[3]):
                continue
            if plain is not None and plain(c.x, -c.y):
                if self.inside((c.x, c.z, -c.y)):
                    doomed.append(f)
                continue
            pts = [(v.co.x, v.co.z, -v.co.y) for v in f.verts] if corners else []
            pts.append((c.x, c.z, -c.y))
            if any(self.inside(p, grow) for p in pts):
                doomed.append(f)
        bmesh.ops.delete(bm, geom=doomed, context="FACES_ONLY")
        return len(doomed)


def paint_loop(pts, kind, d, row):
    """The stone's colours round one ring: pale rock, darker in its hollows and paler on its lumps and
    ridges, a floor of worn stone, sand where the beach is, dark and wet at the water's edge and under
    it."""
    n = len(pts)
    v = noise3(pts * 0.6, 11)
    col = mix(np.broadcast_to(C["rock"], (n, 3)), C["rockDark"], smoothstep(-0.02, 0.2, d) * 0.9)
    col = mix(col, C["rockPale"], smoothstep(-0.08, -0.25, d) * 0.6 + smoothstep(0.3, 0.8, v) * 0.25)
    floor = kind == 0
    sand = smoothstep(WATER + 1.0, WATER + 0.55, row[2]) * smoothstep(WATER - 1.2, WATER - 0.2, row[2])
    fcol = mix(np.broadcast_to(C["floor"], (n, 3)), C["sand"], np.full(n, sand))
    col = np.where(floor[:, None], fcol, col)
    y = pts[:, 1]
    col = mix(col, C["wet"], smoothstep(WATER + 0.35, WATER, y) * 0.8)
    col = mix(col, C["deep"], smoothstep(WATER - 0.2, WATER - 1.2, y))
    return col


# ---------------------------------------------------------------------------- what stands in it
def positions(bm):
    """A bmesh's vertices in game coordinates (N, 3)."""
    return np.array([(v.co.x, v.co.z, -v.co.y) for v in bm.verts])


def cavity(bm):
    """How far each vertex of a mesh lies in a hollow (more than 0) or on a ridge (less than 0), in
    metres: where its neighbours lie, on average, along its normal. For painting the rock darker in its
    hollows and paler on its ridges, as the film paints it."""
    bm.normal_update()
    out = np.zeros(len(bm.verts))
    for i, v in enumerate(bm.verts):
        near = [e.other_vert(v).co for e in v.link_edges]
        if near and v.link_faces:
            out[i] = (sum(near, Vector()) / len(near) - v.co).dot(v.normal)
    return out


def shade(bm, cols):
    """Rock colours `cols` for a mesh's vertices painted darker in its hollows and paler on its ridges
    (see cavity), as the film paints its rock."""
    hollow = cavity(bm)
    col = mix(np.asarray(cols, dtype=float), C["rockDark"] * 0.7, smoothstep(0.01, 0.09, hollow) * 0.85)
    return mix(col, C["rockPale"], smoothstep(-0.01, -0.09, hollow) * 0.7)


def stone(pts, seed=0, base="rock"):
    """Stone colours for loose rock: its own, paler and darker in soft patches."""
    pts = np.asarray(pts, dtype=float)
    v = noise3(pts * 1.3, seed)
    col = mix(np.broadcast_to(C[base], (len(pts), 3)), C["rockPale"], smoothstep(0.1, 0.7, v) * 0.5)
    return mix(col, C["rockDark"], smoothstep(-0.1, -0.7, v) * 0.6)


def lump(centre, radii, seed, u=10, v=7, rough=0.16, spin=0.0):
    """A lumpy rock: an ellipsoid (game centre; radii across, up and along) pushed in and out by noise,
    turned `spin` about the upright. Returns its bmesh."""
    bm = L.sphere_bm(u, v)
    cs, sn = math.cos(spin), math.sin(spin)
    dirs = positions(bm)
    k = 1.0 + rough * noise3(dirs * 1.6 + seed * 3.7, seed)
    for vert, d, kk in zip(bm.verts, dirs, k):
        x, y, z = d[0] * radii[0] * kk, d[1] * radii[1] * kk, d[2] * radii[2] * kk
        vert.co = bl((centre[0] + x * cs - z * sn, centre[1] + y, centre[2] + x * sn + z * cs))
    return bm


def cone(top, tip, r0, r1, segments=7):
    """A tapering rod from `top` to `tip` (game points)."""
    import build_props as P
    return P.segment_bm(bl(top), bl(tip), r0, r1, segments)


def drips(body, rng):
    """Drips hanging from the passage's vault, long and pale, as over the film's passage (`cave interior
    1`), and fewer, heavier ones over the cavern: (bmesh, colours) pieces."""
    pieces = []
    for k, (pts, kind, out, d, row) in enumerate(body):
        s = k * STEP
        if s < 2.5 or s > 34.0:
            continue
        dense = s < 17.0
        for _ in range(int(rng.poisson(1.1 if dense else 0.35))):
            j = int(rng.choice(np.nonzero(kind == 2)[0]))
            top = pts[j] + out[j] * 0.08
            long = rng.uniform(0.18, 0.5) * (1.8 if rng.random() < 0.18 else 1.0) * (1.0 if dense else 1.6)
            r = rng.uniform(0.035, 0.075) * (1.0 if dense else 1.5)
            tip = top + np.array([rng.uniform(-0.04, 0.04), -long, rng.uniform(-0.04, 0.04)])
            bm = cone(top, tip, r, r * 0.12)
            pieces.append((bm, stone(positions(bm), k, "rockPale")))
    return pieces


def rubble(body, rng, blocks):
    """Heaps of broken stone along the passage's walls, as in the film's (`cave interior 1`), and a few
    flat slabs on its floor: (bmesh, colours) pieces for each; each heap a block for walkers."""
    pieces, slabs = [], []
    side = 1.0
    for k in range(int(3.0 / STEP), int(17.5 / STEP), int(1.7 / STEP)):
        if rng.random() < 0.25:
            continue
        pts, kind, out, d, row = body[k]
        floor_pts = pts[kind == 0]
        q = 0.72 + 0.12 * rng.random()
        i = int(round((1.0 - side * q) / 2.0 * (FLOOR_POINTS - 1)))
        base = floor_pts[min(max(i, 0), FLOOR_POINTS - 1)]
        for n in range(int(rng.integers(7, 13))):
            r = rng.uniform(0.05, 0.17) * (1.5 if n < 2 else 1.0)
            off = rng.normal(0.0, 0.2, 2)
            c = (base[0] + off[0], base[1] + r * 0.4, base[2] + off[1])
            bm = lump(c, (r * rng.uniform(0.9, 1.4), r * rng.uniform(0.55, 0.85), r), int(rng.integers(0, 10000)),
                      u=5, v=3, rough=0.38, spin=rng.uniform(0.0, math.pi))
            pieces.append((bm, stone(positions(bm), n, "rockPale")))
        blocks.append({"circle": [round(float(base[0]), 2), round(float(base[2]), 2), 0.5],
                       "y": [round(float(base[1]) - 0.2, 2), round(float(base[1]) + 0.55, 2)]})
        side = -side
    for k in range(int(5.0 / STEP), int(16.0 / STEP), int(3.4 / STEP)):
        x, z, floor, width, tall = body[k][4]
        c = (x + rng.uniform(-0.7, 0.7), floor - 0.025, z + rng.uniform(-0.7, 0.7))
        bm = lump(c, (rng.uniform(0.5, 0.9), 0.05, rng.uniform(0.35, 0.6)), int(rng.integers(0, 10000)), u=12, v=4,
                  rough=0.3, spin=rng.uniform(0.0, math.pi))
        slabs.append((bm, stone(positions(bm), k, "floor")))
    return pieces, slabs


def hanging(body, rng):
    """Rounded knobs of rock hanging from the cavern's roof and over the cave's sea, as in the film's
    (`cave interior 2`): (bmesh, colours) pieces."""
    pieces = []
    for k, (pts, kind, out, d, row) in enumerate(body):
        s = k * STEP
        if s < 18.0 or s > 47.0 or rng.random() > 0.11:
            continue
        x, z, floor, width, tall = row
        up = np.nonzero((kind == 2) | ((kind == 1) & (pts[:, 1] > max(floor, WATER) + 0.6 * tall)))[0]
        j = int(rng.choice(up))
        # Knobs of rock, not boulders: 0.6 to 1.1 m across and 0.7 to 1.3 m long, half as wide and under
        # half as long as they were (the user found those too big). The same draws as ever, so all
        # after them stays where it was.
        h = rng.uniform(1.2, 2.4) * 0.45
        r = rng.uniform(0.6, 1.1) * 0.5
        c = pts[j] + out[j] * (r * 0.45) + np.array([0.0, -h * 0.3, 0.0])
        # Never lower than CLEAR over the water or the floor under it: the rower and walkers pass under.
        c[1] += max(0.0, max(floor, WATER) + CLEAR - (c[1] - h * 0.62 * 1.2))
        bm = lump(c, (r, h * 0.62, r * rng.uniform(0.75, 1.1)), int(rng.integers(0, 10000)), u=14, v=10, rough=0.2,
                  spin=rng.uniform(0.0, math.pi))
        pieces.append((bm, stone(positions(bm), k)))
    return pieces


def beach_stones(body, rng, blocks):
    """A few rounded stones on the cavern's beach: (bmesh, colours) pieces, each a block for walkers. Not
    in the passage, whose floor by the mouth stands as low over the water: a stone there would stand in
    the way in."""
    pieces = []
    for k, (pts, kind, out, d, row) in enumerate(body):
        floor = row[2]
        if k * STEP < 12.0 or not (WATER + 0.1 < floor < WATER + 0.75) or rng.random() > 0.35:
            continue
        floor_pts = pts[kind == 0]
        p = floor_pts[int(rng.choice([1, 2, FLOOR_POINTS - 3, FLOOR_POINTS - 2]))]
        r = rng.uniform(0.16, 0.38)
        bm = lump((p[0], p[1] + r * 0.4, p[2]), (r * 1.2, r * 0.75, r), int(rng.integers(0, 10000)), u=9, v=6, rough=0.18)
        pieces.append((bm, stone(positions(bm), k)))
        blocks.append({"circle": [round(float(p[0]), 2), round(float(p[2]), 2), round(r * 1.1, 2)],
                       "y": [round(float(p[1]) - 0.2, 2), round(float(p[1]) + r * 1.2, 2)]})
    return pieces


# ---------------------------------------------------------------------------- the dome's far side
# The ledge: from which angle to which round the chamber's middle (from east toward south), how far out
# its front edge runs (before it wanders) and its back (in the wall), its top's height and its foot's. Its
# top lies just over the water, as the film's does (`cave interior 7`, `8`: its lip about a sixth of the
# cast's height).
SHELF = {"angles": (-1.2, 1.2), "front": 3.4, "back": 11.2, "top": WATER + 0.13, "bottom": -2.9}
CRYSTAL = {"stone": "#C9C4EC", "pale": "#E6E3FA", "deep": "#9C97D8"}


def shelf(centre):
    """The landed ground beyond the water, at the back of the chamber past the dome (`centre` its middle),
    as the film's (`cave interior 7`, `8`): a ledge of stone lying just over the water, cobbled (see
    cobbles), its front edge wandering and dropping into the water, its back under the chamber's wall. Returns (bmesh, colours,
    its top's front edge as (x, z) points)."""
    cx, cz = centre
    a0, a1 = SHELF["angles"]
    angles = np.linspace(a0, a1, 48)
    probe = np.stack([np.cos(angles) * 3.0, np.sin(angles) * 3.0, np.zeros_like(angles)], axis=1)
    front = SHELF["front"] + 0.55 * noise3(probe, 41) + 0.14 * noise3(probe * 4.0, 45) + 1.6 * (angles / a1) ** 2
    # Its ends narrow away into the chamber's wall, as a shelf of the rock does, rather than stop square.
    front = front + (CHAMBER["radius"] - 0.6 - front) * smoothstep(0.62, 1.0, np.abs(angles / a1))
    top = SHELF["top"]
    m = len(angles)
    # Columns round the angles, each from the bottom under the front, up the front over its lip, across
    # the top to the back, and down the back to the bottom: one sheet, its two ends and its foot closed.
    # Its lip rounds over and drops sheer into the water, too deep at once to wade in off it.
    profile = [(1.1, SHELF["bottom"] - top), (0.7, WATER - 1.6 - top), (0.3, WATER - 0.9 - top),
               (0.08, WATER - 0.45 - top), (0.04, -0.06), (0.0, 0.0)]
    profile += [(-(SHELF["back"] - SHELF["front"]) * t, 0.0) for t in np.linspace(0.12, 1.0, 8)]
    profile.append((-(SHELF["back"] - SHELF["front"]), SHELF["bottom"] - top))
    bm = bmesh.new()
    cols_v = []
    for a, f in zip(angles, front):
        col = []
        for out, dy in profile:
            r = f - out if out >= 0.0 else f + (SHELF["back"] - f) * (-out / (SHELF["back"] - SHELF["front"]))
            y = top + dy + (0.015 * float(noise3(np.array([[r * 2.0, 0.0, a * 9.0]]), 42)[0]) if dy == 0.0 else 0.0)
            col.append(bm.verts.new(bl((cx + r * math.cos(a), y, cz + r * math.sin(a)))))
        cols_v.append(col)
    k = len(profile)
    for j in range(m - 1):
        for i in range(k - 1):
            bm.faces.new((cols_v[j][i], cols_v[j][i + 1], cols_v[j + 1][i + 1], cols_v[j + 1][i]))
        bm.faces.new((cols_v[j][k - 1], cols_v[j][0], cols_v[j + 1][0], cols_v[j + 1][k - 1]))
    for j in (0, m - 1):
        bm.faces.new(cols_v[j] if j == 0 else list(reversed(cols_v[j])))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    pts = positions(bm)
    # Ripples worn into its top round a few hollows; its front and sides plain stone.
    col = stone(pts, 43)
    ripple = np.zeros(len(pts))
    for a, r in ((-0.25, 8.4), (0.3, 9.2), (0.05, 7.6)):
        rx, rz = cx + r * math.cos(a), cz + r * math.sin(a)
        dist = np.hypot(pts[:, 0] - rx, pts[:, 2] - rz)
        wave = 0.5 + 0.5 * np.sin(dist * 11.0 + 2.5 * noise3(pts * 0.8, 44))
        ripple = np.maximum(ripple, wave * smoothstep(2.4, 0.4, dist))
    on_top = pts[:, 1] > top - 0.05
    # Under the cobbles (see cobbles), dark where it shows between them.
    worn = mix(np.broadcast_to(C["rockDark"] * 0.7, (len(pts), 3)), C["floor"] * 0.6, ripple * 0.3)
    col = np.where(on_top[:, None], worn, col)
    # Wet down its lip to the water, but not over its top, near the water as that lies.
    col = mix(col, C["wet"], np.where(on_top, 0.0, smoothstep(WATER + 0.3, WATER, pts[:, 1]) * 0.8))
    edge = [(cx + f * math.cos(a), cz + f * math.sin(a)) for a, f in zip(angles, front)]
    return bm, col, edge


def cobbles(centre, edge, rng, blocks, wall):
    """The ledge's top laid with rounded stones as a beach of them is, as the film's (`cave interior 7`,
    `8`): packed close but unevenly, of every size, bigger toward the back, some sunk and some standing
    proud, a few bare patches of the rock between; from a little back from its front edge to the rock
    behind it (`wall(a)`: how far the wall stands from the middle toward the angle a), round the fire and
    the crystals (`blocks`): (bmesh, colours) pieces."""
    cx, cz = centre
    a0, a1 = SHELF["angles"]
    fronts = [(math.atan2(z - cz, x - cx), math.hypot(x - cx, z - cz)) for x, z in edge]
    placed = []
    for _ in range(20000):
        if len(placed) >= 460:
            break
        a = rng.uniform(a0 + 0.02, a1 - 0.02)
        front = float(np.interp(a, [f[0] for f in fronts], [f[1] for f in fronts])) + 0.25
        back = wall(a) - 0.35
        if back <= front:
            continue
        r = rng.uniform(front, back)
        x, z = cx + r * math.cos(a), cz + r * math.sin(a)
        # Bare rock here and there, in patches.
        if noise3(np.array([[x * 0.55, 0.0, z * 0.55]]), 46)[0] < -0.5:
            continue
        size = rng.uniform(0.13, 0.26) * (1.0 + 0.5 * (r - front) / max(back - front, 0.1))
        if any(math.hypot(x - b["circle"][0], z - b["circle"][1]) < b["circle"][2] + size for b in blocks):
            continue
        if any(math.hypot(x - px, z - pz) < (size + ps) * 0.82 for px, pz, ps in placed):
            continue
        placed.append((x, z, size))
    pieces = []
    for k, (x, z, size) in enumerate(placed):
        # Flattish and bedded in the ledge, as the film's, so that it still lies low by the water.
        h = size * rng.uniform(0.22, 0.4)
        sunk = rng.uniform(-0.4, 0.15)
        bm = lump((x, SHELF["top"] + h * sunk, z), (size * rng.uniform(0.85, 1.2), h, size * rng.uniform(0.75, 1.0)),
                  int(rng.integers(0, 10000)), u=9, v=4, rough=0.22, spin=rng.uniform(0.0, math.pi))
        base = ("floor", "floor", "rock", "rockPale", "rockDark")[int(rng.integers(0, 5))]
        pieces.append((bm, stone(positions(bm), k, base)))
    return pieces


def pebbles(floor, rng):
    """Pebbles and small stones over the passage's floor and the beach's sand, thicker toward the walls,
    as the film's (`cave interior 1`, `2`): (bmesh, colours) pieces. `floor` is the walk grid's."""
    x0, z0 = BOUNDS[0], BOUNDS[1]
    dry = np.nan_to_num(floor, nan=-99.0) > WATER + 0.04
    wall = np.isnan(floor)
    near = np.zeros_like(dry, dtype=float)
    for dj in range(-4, 5):
        for di in range(-4, 5):
            near += np.roll(np.roll(wall, dj, 0), di, 1)
    near /= 81.0
    pieces = []
    for j in range(2, floor.shape[0] - 2, 2):
        for i in range(2, floor.shape[1] - 2, 2):
            if not dry[j, i] or floor[j, i] > FLOOR_TOP:
                continue
            x, z = x0 + (i + 0.5) * GRID, z0 + (j + 0.5) * GRID
            # Only in the passage and on the beach, not out on the beach before the mouth or the ledge.
            if x > -177.0 or (x < -191.5 and z > -113.5):
                continue
            if rng.random() > 0.05 + 0.9 * min(1.0, near[j, i] * 3.0):
                continue
            for _ in range(int(rng.integers(1, 4))):
                px, pz = x + rng.uniform(-0.25, 0.25), z + rng.uniform(-0.25, 0.25)
                ii, jj = int((px - x0) / GRID), int((pz - z0) / GRID)
                f = floor[jj, ii]
                if np.isnan(f) or f <= WATER + 0.02:
                    continue
                s = rng.uniform(0.035, 0.11) * (1.8 if rng.random() < 0.08 else 1.0)
                bm = lump((px, f + s * 0.25, pz), (s * rng.uniform(1.0, 1.4), s * 0.6, s), int(rng.integers(0, 10000)),
                          u=5, v=3, rough=0.3, spin=rng.uniform(0.0, math.pi))
                pieces.append((bm, stone(positions(bm), int(rng.integers(0, 99)), "rockPale")))
    return pieces


def spire(foot, tall, girth, lean, seed, flutes=5, rings=10, around=16):
    """A column of rock standing up out of the water, as the film's round its glowing lake (`cave interior
    4`): thick at its foot (`foot`, game, the middle of it), swelling and narrowing as it rises, fluted
    down its sides where water ran down it, ending in a blunt rounded point; leaning `lean` (x, z for each
    metre up). Returns (bmesh, colours): pale, darker down its flutes."""
    rng = np.random.default_rng(seed)
    ph = rng.uniform(0.0, 2.0 * math.pi, 3)
    a = np.linspace(0.0, 2.0 * math.pi, around, endpoint=False)
    bm = bmesh.new()
    rings_v, grooves = [], []
    for i in range(rings + 1):
        t = i / rings
        g = girth * (1.0 - 0.8 * t ** 1.5) * (1.0 + 0.1 * math.sin(2.3 * math.pi * t + ph[0]))
        groove = (0.5 + 0.5 * np.cos(flutes * a + ph[1] + 1.4 * t)) ** 2
        r = g * (1.0 - 0.18 * groove) * (1.0 + 0.07 * np.sin(3.0 * a + ph[2]))
        x0, z0, y = foot[0] + lean[0] * tall * t, foot[2] + lean[1] * tall * t, foot[1] + tall * t
        rings_v.append([bm.verts.new(bl((x0 + r[k] * math.cos(a[k]), y, z0 + r[k] * math.sin(a[k])))) for k in range(around)])
        grooves.append(groove)
    tip = bm.verts.new(bl((foot[0] + lean[0] * tall, foot[1] + tall + 0.35 * girth * 0.2, foot[2] + lean[1] * tall)))
    under = bm.verts.new(bl(foot))
    for lo, hi in zip(rings_v, rings_v[1:]):
        for k in range(around):
            bm.faces.new((lo[k], lo[(k + 1) % around], hi[(k + 1) % around], hi[k]))
    for k in range(around):
        bm.faces.new((rings_v[-1][k], rings_v[-1][(k + 1) % around], tip))
        bm.faces.new((rings_v[0][(k + 1) % around], rings_v[0][k], under))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    pts = positions(bm)
    shade = np.concatenate(grooves + [np.zeros(2)])
    col = mix(stone(pts, seed), C["rockDark"] * 0.75, shade * 0.65)
    return bm, mix(col, C["wet"], smoothstep(WATER + 0.35, WATER, pts[:, 1]) * 0.8)


def vault_drips(centre, wall, rng):
    """Stalactites hanging from the dome's vault round its edge in clusters, long and pale, as the film's
    dome is hung with them (`cave interior 4`); none over its doorways. `wall(a, y)`: how far the dome's
    wall stands from its middle toward the angle a at the height y. Returns (bmesh, colours) pieces."""
    cx, cz = centre
    pieces = []
    for k in range(8):
        a = 2.0 * math.pi * (k + rng.uniform(-0.3, 0.3)) / 8
        if any(abs(math.remainder(a - d, 2.0 * math.pi)) < 0.55 for d in (DOOR[0], DOOR_ON[0])):
            continue
        for _ in range(int(rng.integers(2, 5))):
            b = a + rng.uniform(-0.1, 0.1)
            y = WATER + rng.uniform(3.0, 4.8)
            # Its root a hand's breadth into the rock, where the vault leans in over it.
            r = wall(b, y) + 0.12
            top = np.array([cx + r * math.cos(b), y + 0.1, cz + r * math.sin(b)])
            # Its tip never lower than CLEAR over the water.
            long = min(rng.uniform(0.6, 1.5) * (1.6 if rng.random() < 0.2 else 1.0), y + 0.1 - WATER - CLEAR)
            girth = rng.uniform(0.09, 0.18)
            bm = cone(top, top - np.array([0.0, long, 0.0]), girth, girth * 0.1, segments=8)
            pieces.append((bm, stone(positions(bm), k, "rockPale")))
    return pieces


def formations(centre, inner, rng, blocks, wall):
    """What the film's frames show round the glowing water under the dome (`cave interior 4`, `5`, `7`,
    `8`): pale columns of rock standing out of the water in clusters before its wall (`centre` its middle;
    `wall(a, y)` how far its wall stands from it toward the angle a at the height y), leaning a little;
    low shelves of rock along its shore, the water lapping at them; a few boulders breaking its surface.
    (Behind the chamber's ledge, `inner` its middle, the rock is the chamber wall's own: see chamber.)
    Returns (bmesh, colours) pieces; those walkers could reach are blocks for them."""
    cx, cz = centre
    pieces = []
    doors = [math.degrees(DOOR[0]), math.degrees(DOOR_ON[0])]
    a0, a1 = (math.degrees(a) for a in SHELF["angles"])
    rd = np.random.default_rng(1207)
    # Columns before the dome's wall, out of its doorways: a tall one and smaller ones round it.
    for k in range(10):
        deg = 36.0 * k + rd.uniform(-12.0, 12.0)
        if any(abs((deg - door + 180.0) % 360.0 - 180.0) < 30.0 for door in doors):
            continue
        a = math.radians(deg)
        r = wall(a, WATER + 0.3) - rd.uniform(0.7, 1.2)
        for n in range(int(rd.integers(1, 4))):
            b = a + (rd.uniform(-0.07, 0.07) if n else 0.0)
            rr = r + (rd.uniform(-0.5, 0.25) if n else 0.0)
            tall = rd.uniform(2.0, 4.2) if n == 0 else rd.uniform(0.6, 1.6)
            girth = (rd.uniform(0.4, 0.62) if n == 0 else rd.uniform(0.16, 0.3))
            # Its foot under the water, each at its own depth (no two feet in one plane).
            under = rd.uniform(0.5, 0.9)
            foot = (cx + rr * math.cos(b), WATER - under, cz + rr * math.sin(b))
            lean = (rd.uniform(-0.06, 0.06), rd.uniform(-0.06, 0.06))
            pieces.append(spire(foot, tall + under, girth, lean, int(rd.integers(0, 10000)), flutes=int(rd.integers(4, 8))))
    # Low shelves of rock along the shore, at the wall's foot.
    for k in range(8):
        deg = 45.0 * k + rd.uniform(-15.0, 15.0)
        if any(abs((deg - door + 180.0) % 360.0 - 180.0) < 28.0 for door in doors):
            continue
        a = math.radians(deg)
        w = rd.uniform(0.7, 1.4)
        r = wall(a, WATER + 0.1) - w * 0.45
        c = (cx + r * math.cos(a), WATER - 0.02, cz + r * math.sin(a))
        bm = lump(c, (w * 0.55, 0.16, w), int(rd.integers(0, 10000)), u=12, v=5, rough=0.28, spin=a)
        pieces.append((bm, stone(positions(bm), k + 30, "rockDark") * 0.8))
    # Boulders breaking the water, here and there (not in the boat's way under the skylight).
    for k, (deg, r) in enumerate(((205.0, 7.2), (95.0, 6.8), (300.0, 7.6), (60.0, 8.0))):
        a = math.radians(deg + rd.uniform(-6.0, 6.0))
        s = rd.uniform(0.35, 0.6)
        c = (cx + r * math.cos(a), WATER - 0.05, cz + r * math.sin(a))
        bm = lump(c, (s * 1.2, s * 0.7, s), int(rd.integers(0, 10000)), u=10, v=7, rough=0.2, spin=rd.uniform(0.0, math.pi))
        # Dark against the glowing water, but for its rim of light, as the film's boulders are.
        pieces.append((bm, stone(positions(bm), k + 50, "rockDark") * 0.7))
    return pieces


def chamber(spec):
    """The chamber deeper in, past the dome, where the ledge is (the film's `cave interior 7`, `8`): a
    shell of rock looking into it, its floor under the water, its wall rising from the water steep and
    uneven, pocketed, rounding over into a low vault, and a doorway cut in it toward the dome (as
    karst.skylight cuts the dome's). Returns (bmesh, colours, the doorway's edge in order round it)."""
    import karst as K
    rng = np.random.default_rng(spec["seed"])
    cx, cz = spec["centre"]
    segments = 144
    theta = np.linspace(0.0, 2.0 * math.pi, segments, endpoint=False)
    cos, sin = np.cos(theta), np.sin(theta)
    p = rng.uniform(0.0, 2.0 * math.pi, 4)
    reach = spec["radius"] * (1.0 + 0.06 * np.sin(2.0 * theta + p[0]) + 0.04 * np.sin(5.0 * theta + p[1]))
    floor = spec["floor"]
    # Its rock in big rounded masses, as the film draws the chamber (`cave interior 7`, `8`): lumps
    # standing out from its wall, one over another, hollows between them; plain round its doorway; over
    # the ledge only high up, and below them, behind the ledge, tall rounded lobes of the rock standing
    # down to it side by side, as behind the film's (`stretch`: how much taller than wide).
    a0, a1 = SHELF["angles"]
    lumps = []
    for _ in range(36):
        a = float(rng.uniform(0.0, 2.0 * math.pi))
        over = a0 - 0.2 < float(K.angle_diff(a, 0.0)) < a1 + 0.2
        lumps.append((a, rng.uniform(3.2, 5.4) if over else rng.uniform(-0.2, 4.8), rng.uniform(0.9, 1.9), rng.uniform(0.35, 0.85), 0.8))
    for k in range(13):
        a = a0 + 0.08 + (a1 - a0 - 0.16) * (k + float(rng.uniform(0.25, 0.75))) / 13
        lumps.append((a, rng.uniform(1.7, 3.1), rng.uniform(0.75, 1.25), rng.uniform(0.5, 1.0), 2.4))
    door_a, door_half, door_tall = spec["door"]
    plain = smoothstep(door_half + 0.3, door_half + 1.5, np.abs(K.angle_diff(theta, door_a)) * spec["radius"])

    def relief(y):
        """How far the wall stands in (less than 0) from its round at the height `y`, at each angle."""
        out = np.zeros(segments)
        for a, h, size, deep, stretch in lumps:
            r2 = (K.angle_diff(theta, a) * spec["radius"] / size) ** 2 + ((y - WATER - h) / (stretch * size)) ** 2
            out = np.maximum(out, deep * np.clip(1.0 - r2, 0.0, 1.0) ** 1.5)
        return -out * plain

    # Rings round the middle: the floor under the water out to the wall's foot, then the wall and the
    # vault from the water up toward its top, steep low down, in rows close enough for its masses.
    rows = [(k * reach, np.full(segments, y)) for k, y in ((0.22, floor), (0.45, floor + 0.05), (0.7, floor + 0.35),
                                                          (0.92, WATER - 1.8))]
    rows.append((reach + 0.05 + relief(WATER - 0.8), np.full(segments, WATER - 0.8)))
    for v in np.linspace(1.0, 0.05, 18):
        phi = 0.5 * math.pi * v
        y = WATER + spec["rise"] * math.cos(phi)
        pocket = 0.35 * np.sin(5.0 * theta + 4.0 * v + p[2]) * np.sin(3.0 * theta - 2.0 * v + p[3]) * math.sin(math.pi * v)
        rows.append((reach * math.sin(phi) ** 0.6 + pocket + relief(y), np.full(segments, y)))
    bm = bmesh.new()
    rings = [[bm.verts.new(bl((cx + r[j] * cos[j], y[j], cz + r[j] * sin[j]))) for j in range(segments)] for r, y in rows]
    faces = {}
    for i, (lo, hi) in enumerate(zip(rings, rings[1:])):
        for j in range(segments):
            k = (j + 1) % segments
            faces[i, j] = bm.faces.new((lo[j], lo[k], hi[k], hi[j]))
    bm.faces.new(rings[0])
    bm.faces.new(rings[-1])
    # The shell closes round the chamber's air: its faces, turned out of that, are turned in to it.
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    bmesh.ops.reverse_faces(bm, faces=bm.faces[:])
    # Its doorway an arch worn by the sea, as the dome's (see karst.skylight): the faces within it cut,
    # from under the water up, and the hole's edge laid on the arch.
    a, half, tall = door_a, door_half, door_tall
    spring = tall - 0.45 * half
    top_row = next(i for i, (_, ys) in enumerate(rows) if i > 4 and float(np.mean(ys)) >= tall + 0.4)
    cut = []
    for i in range(3, top_row):
        for j in range(segments):
            c = faces[i, j].calc_center_median()
            u = float(K.angle_diff(math.atan2(-c.y - cz, c.x - cx), a)) * spec["radius"]
            if abs(u) < half and (c.z <= spring or (u / half) ** 2 + ((c.z - spring) / (tall - spring)) ** 2 < 1.0):
                cut.append(faces[i, j])
    bmesh.ops.delete(bm, geom=cut, context="FACES_ONLY")
    for vert in {v for e in bm.edges if e.is_boundary for v in e.verts}:
        x, z, y = vert.co.x, -vert.co.y, vert.co.z
        u = float(K.angle_diff(math.atan2(z - cz, x - cx), a)) * spec["radius"]
        if abs(u) > half + 1.0 or y < WATER - 1.0:
            continue
        if y <= spring:
            u, h = math.copysign(half, u), y
        else:
            eu, ev = u / half, (y - spring) / (tall - spring)
            n = math.hypot(eu, ev) or 1.0
            u, h = half * eu / n, spring + (tall - spring) * ev / n
        rr, b = math.hypot(x - cx, z - cz), a + u / spec["radius"]
        vert.co = (cx + rr * math.cos(b), -(cz + rr * math.sin(b)), h)
    loop = K.boundary_loop(bm)
    pts = positions(bm)
    col = shade(bm, stone(pts, 61, "rockDark"))
    # Wet at the water's edge, but not where it stands on the ledge, over the water as that lies.
    on_ledge = smoothstep(a1 + 0.12, a1, np.abs(K.angle_diff(np.arctan2(pts[:, 2] - cz, pts[:, 0] - cx), 0.0)))
    col = mix(col, C["wet"], smoothstep(WATER + 0.35, WATER, pts[:, 1]) * 0.8 * (1.0 - on_ledge))
    col = mix(col, C["deep"], smoothstep(WATER - 0.2, WATER - 1.2, pts[:, 1]))
    return bm, col, loop


def crystal(base, axis, length, radius, spin):
    """A six-sided crystal coming to a point, from `base` (game) along `axis`: its bmesh."""
    axis = np.asarray(axis, dtype=float) / np.linalg.norm(axis)
    side = np.cross(axis, [0.0, 1.0, 0.0] if abs(axis[1]) < 0.9 else [1.0, 0.0, 0.0])
    side /= np.linalg.norm(side)
    other = np.cross(axis, side)
    base = np.asarray(base, dtype=float)
    bm = bmesh.new()
    low = base - axis * 0.2
    rings = []
    for c, r in ((low, radius), (base + axis * length * 0.74, radius * 0.96)):
        ring = []
        for k in range(6):
            a = spin + k * math.pi / 3.0
            ring.append(bm.verts.new(bl(c + (side * math.cos(a) + other * math.sin(a)) * r)))
        rings.append(ring)
    tip = bm.verts.new(bl(base + axis * length))
    foot = bm.verts.new(bl(low))
    for k in range(6):
        j = (k + 1) % 6
        bm.faces.new((rings[0][k], rings[0][j], rings[1][j], rings[1][k]))
        bm.faces.new((rings[1][k], rings[1][j], tip))
        bm.faces.new((rings[0][j], rings[0][k], foot))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    return bm


def crystals(centre, rng, blocks):
    """Crystals standing in clusters at the back of the ledge, as the film's (`cave interior 7`, `8`):
    pale lavender, long and leaning: (bmesh, colours) pieces, each cluster a block for walkers."""
    cx, cz = centre
    cols = palette(CRYSTAL)
    pieces = []
    for a, r in ((-1.0, 8.2), (-0.55, 8.9), (0.5, 8.8), (0.95, 8.1)):
        bx, bz = cx + r * math.cos(a), cz + r * math.sin(a)
        inward = np.array([-math.cos(a), 0.0, -math.sin(a)])
        for n in range(int(rng.integers(5, 8))):
            off = rng.normal(0.0, 0.3, 2)
            base = (bx + off[0], SHELF["top"], bz + off[1])
            lean = inward * rng.uniform(0.1, 0.5) + np.array([rng.normal(0, 0.25), 1.0, rng.normal(0, 0.25)])
            length = rng.uniform(0.45, 1.5) * (1.2 if n == 0 else 1.0)
            bm = crystal(base, lean, length, rng.uniform(0.08, 0.19) * (1.3 if n == 0 else 1.0), rng.uniform(0, math.pi))
            p = positions(bm)
            h = smoothstep(SHELF["top"], SHELF["top"] + length, p[:, 1])
            col = mix(mix(np.broadcast_to(cols["deep"], (len(p), 3)), cols["stone"], h), cols["pale"], smoothstep(0.7, 1.0, h))
            pieces.append((bm, col))
        blocks.append({"circle": [round(bx, 2), round(bz, 2), 0.75], "y": [SHELF["top"] - 0.2, SHELF["top"] + 1.6]})
    return pieces


def fire(at, rng, blocks):
    """The small fire on the ledge (PLAN.md): a ring of stones, a few sticks crossed in it, and its flame.
    Returns ((bmesh, colours) pieces of stone and wood, the flame's pieces, where its light is)."""
    import houses as H
    pieces = []
    x, y, z = at
    for k in range(9):
        a = 2.0 * math.pi * k / 9 + rng.uniform(-0.15, 0.15)
        r = rng.uniform(0.11, 0.15)
        bm = lump((x + 0.36 * math.cos(a), y + r * 0.4, z + 0.36 * math.sin(a)), (r * 1.2, r * 0.8, r), k + 700, u=8, v=5,
                  rough=0.2, spin=a)
        pieces.append((bm, stone(positions(bm), k, "rockDark")))
    wood = np.array(L.hex_color("#7A4E2E")[:3])
    for k in range(3):
        a = k * math.pi / 3 + 0.3
        d = np.array([math.cos(a), 0.0, math.sin(a)]) * 0.28
        bm = cone((x - d[0], y + 0.06, z - d[2]), (x + d[0], y + 0.12, z + d[2]), 0.045, 0.04, 7)
        pieces.append((bm, np.broadcast_to(wood, (len(bm.verts), 3))))
    embers = lump((x, y + 0.03, z), (0.26, 0.04, 0.26), 799, u=10, v=4, rough=0.1)
    pieces.append((embers, np.broadcast_to(np.array(L.hex_color("#3A2A26")[:3]), (len(embers.verts), 3))))
    flame = list(H.flame_pieces(bl((x, y + 0.06, z)), 0.62, 0.42))
    blocks.append({"circle": [round(x, 2), round(z, 2), 0.6], "y": [round(y - 0.2, 2), round(y + 1.2, 2)]})
    return pieces, flame, (x, y + 0.4, z)


# ---------------------------------------------------------------------------- the boat and the torch
WOOD = {"hull": "#D9A878", "hullDark": "#B9875A", "inside": "#C79566", "plank": "#8E6142", "seat": "#C8955F",
        "oar": "#CFA06B", "blade": "#BE8D5C", "stick": "#7A5133", "wrap": "#A07040", "wrapDark": "#6E4A2E"}


def boat():
    """The rowboat waiting in the cave, as the film's (`cave interior 2` to `5`): a small wooden boat for
    three, pale planks with their seams drawn along the hull, a pointed bow, a square stern, two seats
    across and an oarlock either side. In its own frame: its length along x (the bow toward +x), y up,
    its keel's lowest at 0. Returns (bmesh, colours)."""
    import build_props as P
    W = palette(WOOD)
    length, beam, depth, t = 2.5, 1.12, 0.42, 0.035

    def half(s):
        if s >= -0.2:
            return beam / 2 * max(1.0 - ((s + 0.2) / 1.2) ** 2.2, 0.0)
        return beam / 2 * (1.0 - 0.22 * ((-0.2 - s) / 0.8) ** 1.5)

    def gunwale(s):
        return depth + 0.13 * max(s, 0.0) ** 2 + 0.05 * max(-s, 0.0) ** 2

    def keel(s):
        return 0.16 * max(s, 0.0) ** 2.5

    across = np.linspace(-1.0, 1.0, 15)

    def station(s, inner):
        h = max(half(s) - (t if inner else 0.0), 0.004)
        k = keel(s) + (t if inner else 0.0)
        g = gunwale(s)
        return [(s * length / 2, k + (g - k) * abs(a) ** 2.4, h * a) for a in across]

    def local(p):
        return Vector((p[0], -p[2], p[1]))

    bm = bmesh.new()
    cols = []

    def verts(points, colour):
        vs = [bm.verts.new(local(p)) for p in points]
        cols.extend([colour] * len(vs))
        return vs

    out_s = np.linspace(-1.0, 1.0, 27)
    in_s = np.linspace(-1.0 + 2 * t / length, 1.0 - 0.16 / length, 27)
    outer = [verts(station(s, False), W["hull"]) for s in out_s]
    inner = [verts(station(s, True), W["inside"]) for s in in_s]
    m = len(across)
    for shell in (outer, inner):
        for i in range(len(shell) - 1):
            for j in range(m - 1):
                bm.faces.new((shell[i][j], shell[i + 1][j], shell[i + 1][j + 1], shell[i][j + 1]))
    # The gunwales, the stern's top and the bow's stem: the planks' edges, from outer to inner.
    for j in (0, m - 1):
        for i in range(len(outer) - 1):
            bm.faces.new((outer[i][j], outer[i + 1][j], inner[i + 1][j], inner[i][j]))
    bm.faces.new((outer[0][0], inner[0][0], inner[0][m - 1], outer[0][m - 1]))
    for j in range(m - 1):
        bm.faces.new((outer[-1][j], outer[-1][j + 1], inner[-1][j + 1], inner[-1][j]))
    bm.faces.new(outer[0])
    bm.faces.new(inner[0])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    pieces = [(bm, cols)]
    # The planks' seams, drawn along the hull outside and in, a few millimetres off it and across it.
    for a in (0.62, 0.8, 0.93):
        for sign in (-1.0, 1.0):
            for inner_side in (False, True):
                ss = in_s if inner_side else out_s
                top, low = [], []
                strip = bmesh.new()
                for s in ss[1:-1]:
                    h = max(half(s) - (t if inner_side else 0.0), 0.004)
                    k = keel(s) + (t if inner_side else 0.0)
                    g = gunwale(s)
                    y = k + (g - k) * a ** 2.4
                    z = h * a * sign
                    tz, ty = h * sign, 2.4 * (g - k) * a ** 1.4
                    norm = math.hypot(tz, ty)
                    tz, ty = tz / norm, ty / norm
                    nz, ny = ty * sign, -tz * sign
                    off = -0.006 if inner_side else 0.006
                    x = s * length / 2
                    c = (z + nz * off, y + ny * off)
                    top.append(strip.verts.new(local((x, c[1] + ty * 0.009, c[0] + tz * 0.009))))
                    low.append(strip.verts.new(local((x, c[1] - ty * 0.009, c[0] - tz * 0.009))))
                for i in range(len(top) - 1):
                    f = strip.faces.new((top[i], top[i + 1], low[i + 1], low[i]))
                    f.normal_update()
                    # Facing out of the hull's planks, as they are seen.
                    centre = f.calc_center_median()
                    if (f.normal.dot(Vector((0.0, -centre.y, 0.0))) > 0.0) != inner_side:
                        f.normal_flip()
                pieces.append((strip, [W["plank"]] * len(strip.verts)))
    # Two seats across, and an oarlock either side.
    for s, wide in ((-0.45, 0.2), (0.15, 0.22)):
        h = half(s) - t - 0.01
        box = P.box_bm(local((s * length / 2, 0.29, 0.0)), (wide, 2 * h, 0.045))
        pieces.append((box, [W["seat"]] * len(box.verts)))
    for sign in (-1.0, 1.0):
        z = (half(0.0) + 0.01) * sign
        post = P.segment_bm(local((0.0, gunwale(0.0) - 0.02, z)), local((0.0, gunwale(0.0) + 0.09, z)), 0.022, 0.018, 6)
        pieces.append((post, [W["plank"]] * len(post.verts)))
    joined = bmesh.new()
    flat = []
    for b, c in pieces:
        L.append_bm(joined, b)
        flat.extend(c)
        b.free()
    return joined, np.array(flat)


def oar():
    """One oar, in its own frame: its grip at the origin, the shaft along +x to the blade, 1.8 m long.
    Returns (bmesh, colours)."""
    import build_props as P
    W = palette(WOOD)
    shaft = P.segment_bm(Vector((0.0, 0.0, 0.0)), Vector((1.32, 0.0, 0.0)), 0.026, 0.024, 8)
    blade = P.box_bm(Vector((1.56, 0.0, 0.0)), (0.5, 0.025, 0.14))
    grip = P.segment_bm(Vector((-0.02, 0.0, 0.0)), Vector((0.16, 0.0, 0.0)), 0.032, 0.03, 8)
    bm = bmesh.new()
    cols = []
    for b, c in ((shaft, W["oar"]), (blade, W["blade"]), (grip, W["hullDark"])):
        cols.extend([c] * len(b.verts))
        L.append_bm(bm, b)
        b.free()
    return bm, np.array(cols)


def torch():
    """The torch carried through the cave, as the film's (`cave interior 1`, `2`): a stick with a head of
    bound straw, and its flame. In its own frame: the stick along +y from the hand (the origin). Returns
    ((bmesh, colours) of the stick, the flame's pieces)."""
    import build_props as P
    import houses as H
    W = palette(WOOD)
    bm = bmesh.new()
    cols = []
    parts = [(P.segment_bm(Vector((0.0, 0.0, -0.12)), Vector((0.0, 0.0, 0.5)), 0.024, 0.03, 7), W["stick"]),
             (P.segment_bm(Vector((0.0, 0.0, 0.46)), Vector((0.0, 0.0, 0.64)), 0.055, 0.05, 9), W["wrap"])]
    for z in (0.5, 0.57):
        parts.append((P.segment_bm(Vector((0.0, 0.0, z)), Vector((0.0, 0.0, z + 0.022)), 0.058, 0.058, 9), W["wrapDark"]))
    for b, c in parts:
        cols.extend([c] * len(b.verts))
        L.append_bm(bm, b)
        b.free()
    flame = list(H.flame_pieces(Vector((0.0, 0.0, 0.6)), 0.38, 0.22))
    return (bm, np.array(cols)), flame


# ---------------------------------------------------------------------------- walking, the water, the light
GRID = 0.25            # the walk grid's cells (m)
BOUNDS = (-197.0, -158.5, -103.5, -107.0)   # x0, z0, x1, z1 over everything inside the cave
OPEN = 30.0            # a ceiling's height where there is none (under the skylight, out of the mouth)
FLOOR_TOP = 2.0        # no floor in the cave is higher


def walk_grid(floors, ceilings):
    """The cave's floor and ceiling at every cell of a GRID-metre grid over BOUNDS, for the game to walk
    and frame the camera on: the floor, the first surface looking up under the cave's roof (from
    `floors`: the tube, the dome, the ledge, the slabs), and the ceiling, the first surface over it (from
    `ceilings`: those and the rock hanging from the roof). NaN where there is no cave. Returns (floor,
    ceiling), each rows of z by columns of x, and the grid's origin."""
    def tree(bms):
        combined = bmesh.new()
        for bm in bms:
            L.append_bm(combined, bm)
        combined.normal_update()
        t = BVHTree.FromBMesh(combined)
        combined.free()
        return t

    down, up = tree(floors), tree(ceilings)
    x0, z0, x1, z1 = BOUNDS
    nx, nz = int(round((x1 - x0) / GRID)), int(round((z1 - z0) / GRID))
    floor = np.full((nz, nx), np.nan)
    ceiling = np.full((nz, nx), np.nan)
    below = Vector((0.0, 0.0, -1.0))
    above = Vector((0.0, 0.0, 1.0))
    for j in range(nz):
        z = z0 + (j + 0.5) * GRID
        for i in range(nx):
            x = x0 + (i + 0.5) * GRID
            # Down from high over it to the first surface looking up that is low enough to be the cave's
            # floor; passing on through the roof (seen from behind) and the skylight's rock buried in the
            # ground round its well (its top looks up, but stands far over the cave).
            y, f = 16.0, None
            for _ in range(8):
                hit, n, _, _ = down.ray_cast(Vector((x, -z, y)), below)
                if hit is None:
                    break
                if n.z > 0.0 and hit.z < FLOOR_TOP:
                    f = hit.z
                    break
                y = hit.z - 0.01
            if f is None:
                continue
            hit3, _, _, _ = up.ray_cast(Vector((x, -z, f + 0.05)), above)
            c = hit3.z if hit3 is not None else OPEN
            if c - f > 0.4:
                floor[j, i] = f
                ceiling[j, i] = c
    return floor, ceiling


def light_terms(pieces, everything, glow_disc, openings):
    """How each vertex of `pieces` ((bmesh, ...) tuples) is lit, as the game lights the cave: how open it
    is to the cave round it (ao), how much of the outside it sees by the cave's openings (`openings`:
    the mouth's arch and the skylight's well, as the game's info gives them): of rays out over it, as a
    diffuse light falls, the share that leaves the cave by them, 0 deep in to 1 out under the open sky
    (a ray that gets out another way has gone through rock that is not the cave's: from a part buried
    in the rock, which sees nothing); and how much of the glowing water under the dome (`glow_disc`:
    centre, radius) it sees: (N, 3) arrays, one a piece. `everything` is every bmesh that casts shadow
    in the cave."""
    combined = bmesh.new()
    for bm in everything:
        L.append_bm(combined, bm)
    combined.normal_update()
    tree = BVHTree.FromBMesh(combined)
    combined.free()
    rng = np.random.default_rng(5)
    # Cosine-weighted directions for the openness, round +z; turned to each normal.
    k = 14
    u1, u2 = rng.random(k), rng.random(k)
    hemi = np.stack([np.sqrt(u1) * np.cos(2 * math.pi * u2), np.sqrt(u1) * np.sin(2 * math.pi * u2), np.sqrt(1 - u1)], 1)

    def disc_samples(centre, normal, radius, count):
        normal = np.asarray(normal, dtype=float) / np.linalg.norm(normal)
        a = np.cross(normal, [0.0, 1.0, 0.0] if abs(normal[1]) < 0.9 else [1.0, 0.0, 0.0])
        a /= np.linalg.norm(a)
        b = np.cross(normal, a)
        pts = []
        for n in range(count):
            r = radius * math.sqrt((n + 0.5) / count)
            th = n * 2.39996
            pts.append(np.asarray(centre) + (a * math.cos(th) + b * math.sin(th)) * r)
        return np.array(pts), normal, math.pi * radius * radius / count

    # Rays out over each vertex for the daylight: cosine-weighted, as a diffuse light falls, many of
    # them, since few find the way out.
    m = 40
    w1, w2 = (np.arange(m) + 0.5) / m, (np.arange(m) * 0.618034) % 1.0
    escape = np.stack([np.sqrt(w1) * np.cos(2 * math.pi * w2), np.sqrt(w1) * np.sin(2 * math.pi * w2), np.sqrt(1 - w1)], 1)
    glow = disc_samples((glow_disc[0][0], WATER + 0.02, glow_disc[0][1]), (0.0, 1.0, 0.0), glow_disc[1], 16)
    arch, top = openings["arch"], openings["well"]["top"]
    # The arch's plane, leaning back as it rises (see build): what lies before it is out.
    a_foot, a_way = np.array(arch["foot"]), np.array([arch["facing"][0], arch.get("lean", 0.0), arch["facing"][1]])
    a_side = np.array([-a_way[2], 0.0, a_way[0]])

    def leaves(s, d):
        """Whether a ray from s along d, meeting nothing of the cave's, leaves by one of its openings."""
        if d[1] > 1e-6:
            t = (top[1] - s[1]) / d[1]
            if t >= 0.0 and math.hypot(s[0] + d[0] * t - top[0], s[2] + d[2] * t - top[2]) < top[3] + 0.4:
                return True
        out = float(d @ a_way)
        if out > 1e-6:
            t = float((a_foot - s) @ a_way) / out
            if t >= -0.3:
                q = s + d * t
                if abs(float((q - a_foot) @ a_side)) < arch["half"] + 0.4 and a_foot[1] - 0.4 < q[1] < a_foot[1] + arch["height"] + 0.4:
                    return True
        return False
    out = []
    for piece in pieces:
        bm = piece[0]
        bm.normal_update()
        res = np.zeros((len(bm.verts), 3))
        for vi, v in enumerate(bm.verts):
            p = np.array([v.co.x, v.co.z, -v.co.y])
            nrm = np.array([v.normal.x, v.normal.z, -v.normal.y])
            if not np.isfinite(nrm).all() or np.linalg.norm(nrm) < 1e-6:
                nrm = np.array([0.0, 1.0, 0.0])
            start = p + nrm * 0.02
            # Openness.
            t1 = np.cross(nrm, [0.0, 1.0, 0.0] if abs(nrm[1]) < 0.9 else [1.0, 0.0, 0.0])
            t1 /= np.linalg.norm(t1)
            t2 = np.cross(nrm, t1)
            free = 0
            for h in hemi:
                d = t1 * h[0] + t2 * h[1] + nrm * h[2]
                if tree.ray_cast(bl(start), Vector((d[0], -d[2], d[1])), 2.5)[0] is None:
                    free += 1
            res[vi, 0] = free / k

            def received(samples, src_n, area):
                total = 0.0
                for q in samples:
                    w = q - start
                    dist = float(np.linalg.norm(w))
                    if dist < 1e-3:
                        continue
                    w /= dist
                    cos_r = float(np.dot(nrm, w))
                    cos_s = float(-np.dot(src_n, w))
                    if cos_r <= 0.0 or cos_s <= 0.0:
                        continue
                    if tree.ray_cast(bl(start), Vector((w[0], -w[2], w[1])), dist - 0.05)[0] is not None:
                        continue
                    total += cos_r * cos_s * area / (math.pi * dist * dist)
                return total

            out_ = 0
            for h in escape:
                d = t1 * h[0] + t2 * h[1] + nrm * h[2]
                if tree.ray_cast(bl(start), Vector((d[0], -d[2], d[1])))[0] is None and leaves(start, d):
                    out_ += 1
            res[vi, 1] = out_ / m
            res[vi, 2] = min(received(*glow), 2.0)
        out.append(res)
    return out


def water_mesh(floor, glow_centre, glow_radius):
    """The cave's sea: a sheet at the sea's level over every cell of the walk grid that is under it, and
    a few past (under the walls and the beach, which hide it). Each vertex carries in its colour how much
    it glows (strongest under the skylight, out to the dome's wall, a little on into the sea's passage),
    and how deep the water under it is (as a share of 3 m). Returns (bmesh, colours)."""
    x0, z0, x1, z1 = BOUNDS
    nz, nx = floor.shape
    wet = np.nan_to_num(floor, nan=99.0) < WATER + 0.02
    grown = wet.copy()
    for _ in range(3):
        g = grown.copy()
        g[1:, :] |= grown[:-1, :]
        g[:-1, :] |= grown[1:, :]
        g[:, 1:] |= grown[:, :-1]
        g[:, :-1] |= grown[:, 1:]
        grown = g
    # Corners of cells: a vertex for every corner any wet cell touches.
    bm = bmesh.new()
    index = {}
    cols = []
    deep = np.nan_to_num(WATER - floor, nan=0.0)

    def corner(i, j):
        key = (i, j)
        if key not in index:
            x, z = x0 + i * GRID, z0 + j * GRID
            index[key] = bm.verts.new(bl((x, WATER, z)))
            r = math.hypot(x - glow_centre[0], z - glow_centre[1])
            glow = float(smoothstep(glow_radius + 3.5, glow_radius * 0.45, r))
            ii, jj = min(max(i, 0), nx - 1), min(max(j, 0), nz - 1)
            cols.append((glow, 0.0, float(np.clip(deep[jj, ii] / 3.0, 0.0, 1.0))))
        return index[key]

    for j in range(nz):
        for i in range(nx):
            if grown[j, i]:
                bm.faces.new((corner(i, j), corner(i, j + 1), corner(i + 1, j + 1), corner(i + 1, j)))
    bm.normal_update()
    for f in bm.faces:
        if f.normal.z < 0.0:
            f.normal_flip()
    return bm, np.array(cols)


def join_lit(name, pieces, collection, smooth=True):
    """Joins (bmesh, colours, light) pieces into one object, a colour and a light (ao, sky, glow) for every
    vertex, the light as the attribute `_light` (see the module's note)."""
    import bpy
    combined = bmesh.new()
    flat, lights = [], []
    for bm, cols, light in pieces:
        L.append_bm(combined, bm)
        for c in cols:
            flat.extend((float(c[0]), float(c[1]), float(c[2]), 1.0))
        lights.extend(np.asarray(light, dtype=float).reshape(-1, 3).ravel().tolist())
        bm.free()
    mesh = bpy.data.meshes.new(name)
    combined.to_mesh(mesh)
    combined.free()
    assert len(flat) == 4 * len(mesh.vertices) and len(lights) == 3 * len(mesh.vertices), name
    col = mesh.color_attributes.new("Col", "FLOAT_COLOR", "POINT")
    col.data.foreach_set("color", flat)
    mesh.color_attributes.active_color = col
    mesh.attributes.new("_light", "FLOAT_VECTOR", "POINT").data.foreach_set("vector", lights)
    mesh.polygons.foreach_set("use_smooth", [smooth] * len(mesh.polygons))
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)
    return obj


# ---------------------------------------------------------------------------- all of it
def build(mouth_loop, dome, sky, ground, seed=85):
    """Everything inside the cave. `mouth_loop` is the mouth's arch (karst.Rock's tunnel); `dome` is
    karst.skylight's (rock, colours, vines, vine colours, doorway) with its door at DOOR; `sky` the
    island's SKYLIGHT; `ground(x, z)` the island's ground. Returns (parts: name to (bmesh, colours, light)
    pieces; extra objects' pieces with no light: the flames, the boat, its oar and the torch; the game's
    info; the cave's Air, for cutting the rock and ground it runs through)."""
    rng = np.random.default_rng(seed)
    dome_bm, dome_cols, vine_bm, vine_cols, (door_loop, door_on_loop) = dome
    tube_bm, tube_cols, _, body = tube(mouth_loop, door_loop)
    chamber_bm, chamber_cols, chamber_loop = chamber(CHAMBER)
    on_bm, on_cols, _, _ = tube(door_on_loop, chamber_loop, route=ROUTE_ON, by_mouth=False)
    tube_cols, on_cols = shade(tube_bm, tube_cols), shade(on_bm, on_cols)
    air = Air(tube_bm, dome_bm, on_bm, chamber_bm)
    centre = sky["centre"]
    inner = CHAMBER["centre"]
    dome_cols = recolour_dome(dome_bm, sky, ground)
    blocks = []
    hung = hanging(body, rng)
    loose = drips(body, rng)
    heaps, slabs = rubble(body, rng, blocks)
    loose += heaps + beach_stones(body, rng, blocks)
    shelf_bm, shelf_cols, edge = shelf(inner)
    fire_at = (inner[0] + 5.2 * math.cos(-0.05), SHELF["top"] + 0.01, inner[1] + 5.2 * math.sin(-0.05))
    fire_stones, flame, fire_light = fire(fire_at, rng, blocks)
    crystal_pieces = crystals(inner, rng, blocks)
    dome_bvh = BVHTree.FromBMesh(dome_bm)

    def wall(a, y):
        """How far the dome's wall stands from its middle toward the angle `a` (from east toward south)
        at the height `y`."""
        hit = dome_bvh.ray_cast(bl((centre[0], y, centre[1])), Vector((math.cos(a), -math.sin(a), 0.0)))[0]
        return math.hypot(hit.x - centre[0], -hit.y - centre[1]) if hit is not None else sky["dome"]

    formed = formations(centre, inner, rng, blocks, wall)
    hung += vault_drips(centre, wall, np.random.default_rng(seed + 9))
    chamber_bvh = BVHTree.FromBMesh(chamber_bm)

    def chamber_wall(a):
        """How far the chamber's wall stands from its middle toward the angle `a`, just over the ledge."""
        hit = chamber_bvh.ray_cast(bl((inner[0], SHELF["top"] + 0.3, inner[1])), Vector((math.cos(a), -math.sin(a), 0.0)))[0]
        return math.hypot(hit.x - inner[0], -hit.y - inner[1]) if hit is not None else CHAMBER["radius"]

    laid = cobbles(inner, edge, np.random.default_rng(seed + 7), blocks, chamber_wall)

    walls = [tube_bm, dome_bm, on_bm, chamber_bm, shelf_bm]
    floor, ceiling = walk_grid(walls + [b for b, _ in slabs + formed + laid], walls + [b for b, _ in slabs + hung + formed])
    loose += pebbles(floor, np.random.default_rng(seed + 8))
    # The apron before the mouth: the beach's own ground, a metre or two out across the arch's width, so
    # walkers step in and out without the rock's foot in the way.
    mouth = np.asarray(mouth_loop)
    mouth_c = mouth.mean(axis=0)
    face = np.array([math.cos(math.radians(85.0)), 0.0, math.sin(math.radians(85.0))])
    side = np.array([-face[2], 0.0, face[0]])
    x0, z0 = BOUNDS[0], BOUNDS[1]
    for j in range(floor.shape[0]):
        for i in range(floor.shape[1]):
            if not np.isnan(floor[j, i]):
                continue
            x, z = x0 + (i + 0.5) * GRID, z0 + (j + 0.5) * GRID
            d = np.array([x - mouth_c[0], 0.0, z - mouth_c[2]])
            if abs(float(d @ side)) < 1.35 and 0.0 < float(d @ face) < 2.6:
                floor[j, i] = float(ground(np.array([x]), np.array([z]))[0])
                ceiling[j, i] = OPEN
    # The light: the outside's through the skylight's well and the mouth, the water's glow under the dome.
    well_top = float(np.mean(ground(centre[0] + sky["radius"] * np.cos(np.linspace(0, 6.28, 24)),
                                    centre[1] + sky["radius"] * np.sin(np.linspace(0, 6.28, 24)))))
    # The arch the light comes in by: its foot's middle on the sill, facing out square to it, leaning back
    # as it rises as the face does (`lean`, metres back for each metre up, fitted to its outline). Upright
    # through the sill it would put the face over it, and what hangs there, inside; upright through the
    # middle of its outline, the floor before that, lit by neither the sun nor the sky.
    sill = mouth[mouth[:, 1] < mouth[:, 1].min() + 0.01]
    ends = sill[np.argsort(sill @ side)][[0, -1]]
    run = (ends[1] - ends[0]) / np.linalg.norm(ends[1] - ends[0])
    way = np.array([run[2], 0.0, -run[0]])
    way = way if way @ face > 0.0 else -way
    sill_c = ends.mean(axis=0)
    across = np.array([-way[2], 0.0, way[0]])
    rise = mouth[:, 1] - mouth[:, 1].min()
    lean = float(-((mouth - sill_c) @ way) @ rise / max(float(rise @ rise), 1e-6))
    arch = {"foot": [float(sill_c[0]), float(mouth[:, 1].min()), float(sill_c[2])], "facing": [float(way[0]), float(way[2])],
            "lean": lean, "half": float(np.max(np.abs((mouth - sill_c) @ across))),
            "height": float(mouth[:, 1].max() - mouth[:, 1].min())}
    water = water_mesh(floor, centre, sky["dome"])
    stony = [(tube_bm, tube_cols), (dome_bm, dome_cols), (on_bm, on_cols), (chamber_bm, chamber_cols),
             (shelf_bm, shelf_cols)] + hung + loose + slabs + fire_stones + formed + laid
    glass = crystal_pieces
    vines = [(vine_bm, vine_cols)]
    everything = [b for b, _ in stony + glass]
    openings = {"arch": arch, "well": {"top": [centre[0], well_top, centre[1], sky["radius"] - 0.15]}}
    lights = light_terms(stony + glass + vines + [water], everything, (centre, sky["dome"] * 0.9), openings)
    # The water takes the skylight's light where it falls on it, in its colour's second channel.
    water = (water[0], np.column_stack([water[1][:, 0], np.clip(lights[-1][:, 1], 0.0, 2.0), water[1][:, 2]]))
    lights = lights[:-1]
    parts = {
        "cave_rock": [(b, c, l) for (b, c), l in zip(stony, lights[:len(stony)])],
        "cave_crystals": [(b, c, l) for (b, c), l in zip(glass, lights[len(stony):len(stony) + len(glass)])],
        "cave_vines": [(vine_bm, vine_cols, lights[-1])],
    }
    extras = {"cave_water": [water], "cave_fire_flame": flame, "cave_boat": [boat()], "cave_oar": [oar()]}
    stick, torch_flame = torch()
    extras["cave_torch"] = [stick]
    extras["cave_torch_flame"] = torch_flame
    info = {
        "water": WATER,
        "grid": {"origin": [BOUNDS[0], BOUNDS[1]], "cell": GRID, "size": [int(floor.shape[1]), int(floor.shape[0])]},
        "mouth": {"centre": [round(float(mouth_c[0]), 2), round(float(mouth_c[2]), 2)], "facing": 85.0},
        "dome": {"centre": list(centre), "radius": sky["dome"], "top": round(well_top, 2)},
        # The openings the sun and the moon shine in by: the skylight's well, its rim at the ground and
        # its foot over the dome (x, y, z, radius each), and the mouth's arch (the middle of its sill, the
        # way the sill faces out, how far back it leans as it rises, how wide and how high).
        "well": {"top": [centre[0], round(well_top, 2), centre[1], round(sky["radius"] - 0.15, 2)],
                 "foot": [centre[0], round(well_top - sky["shaft"], 2), centre[1], round(sky["radius"] - 0.55, 2)]},
        "arch": {"foot": [round(v, 2) for v in arch["foot"]], "facing": [round(v, 3) for v in arch["facing"]],
                 "lean": round(arch["lean"], 3), "half": round(arch["half"], 2), "height": round(arch["height"], 2)},
        "chamber": {"centre": list(inner), "radius": CHAMBER["radius"]},
        "fire": [round(v, 2) for v in fire_light],
        "blocks": blocks,
        "ledge": [[round(x, 2), round(z, 2)] for x, z in edge],
        "beach": {"boat": list(BEACH["boat"])},
    }
    return parts, extras, info, air, (floor, ceiling)


def recolour_dome(bm, sky, ground):
    """The skylight's rock in the cave's stone: pale, as the cave's own (the game lights it), moss on the
    lip and hanging down the well from it in tongues, as before."""
    pts = positions(bm)
    cx, cz = sky["centre"]
    r = np.hypot(pts[:, 0] - cx, pts[:, 2] - cz)
    g = ground(pts[:, 0], pts[:, 2])
    col = stone(pts, 51)
    # Darker in its hollows and between its folds, paler along their ridges, as the film paints it.
    col = shade(bm, col)
    # The well's rock dark and wet, as the film's shaft is from below (`cave interior 6`), so its foot
    # does not ring the vault in pale stone.
    shaft = (r < sky["radius"] + 1.2) & (pts[:, 1] > g - sky["shaft"] - 1.2)
    col = col * np.where(shaft, 0.5, 1.0)[:, None]
    moss = np.array(L.hex_color("#6E9E52")[:3])
    theta = np.arctan2(pts[:, 2] - cz, pts[:, 0] - cx)
    drape = 0.35 + 1.3 * (0.5 + 0.5 * np.sin(9.0 * theta + 1.7)) ** 2
    col = mix(col, moss, smoothstep(-drape - 0.1, -drape + 0.1, pts[:, 1] - g) * (r < sky["radius"] + 1.5))
    col = mix(col, C["wet"], smoothstep(WATER + 0.35, WATER, pts[:, 1]) * 0.8)
    return mix(col, C["deep"], smoothstep(WATER - 0.2, WATER - 1.2, pts[:, 1]))
