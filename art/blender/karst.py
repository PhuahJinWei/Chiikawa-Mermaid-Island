"""The island's rock landmarks, after the film's limestone karst.

Every rock here is built the same way: rings of vertices stacked up a wobbly outline. The outline
is an irregular polygon with softened corners, so the stone splits into flat slabs; rain flutes it
with vertical grooves; it steps in or out at a ledge or two, leans a little and rounds off at the
shoulders, its top rim uneven. Pillars and the waterfall's wall wear a crown of jungle; sea spires
are angular shards; the headland is layered rock with the cave mouth at its foot. Colours are
painted per vertex: pale stone, darker in the grooves, with streaks running down and moss hanging
from the top.

Rocks are described in game coordinates (x east, z south, y up) and turned into Blender's
(x, -z, y) only as their vertices are made. Angles are measured in the game's x-z plane, from east
toward south.
"""

import math

import bmesh
import numpy as np
from mathutils import Vector

import charlib as L


def palette(hexes):
    return {k: np.array(L.hex_color(v)[:3]) for k, v in hexes.items()}


SHARED = palette({
    "moss": "#86BC5C",
    "mossDark": "#5E9C46",
    "foot": "#BDB8A8",
    "wet": "#8A9A9E",
    "cave": "#0D1625",
    "leaves": "#8FCB5F",
    "leavesMid": "#5EAD4A",
    "leavesDark": "#3F8A3C",
})
# Stone by kind: the karst pillars pale and cool like the film's, the headland a warmer grey.
STONES = {
    "karst": palette({"stone": "#E3E9EA", "stoneMid": "#CAD3D6", "groove": "#93A7B3", "streak": "#B7C3C8"}),
    "headland": palette({"stone": "#D4D1C6", "stoneMid": "#B9B6AB", "groove": "#8C8F8B", "streak": "#A8A9A2"}),
}

DEFAULTS = {
    "turn": 0.0,          # the outline's first axis, as an angle
    "segments": 44,       # vertices round each ring
    "step": 2.0,          # metres between rings up the body
    "facets": 0,          # flat faces round the outline (0: a smooth oval)
    "facet_w": 0.65,      # how strongly the facets flatten it
    "flutes": 11,         # vertical grooves round the rock
    "flute_depth": 0.07,  # how deep they are, as a fraction of the radius
    "lumps": 0.10,        # broad unevenness of the outline
    "taper": 0.12,        # how much narrower the top is than the foot (below 0: wider)
    "bulge": 0.04,        # swelling at mid-height
    "ledges": 0,          # heights where the rock steps in or out
    "lean": 0.0,          # how far the top leans over, as a fraction of the height
    "rim": 0.0,           # how unevenly the top's rim dips, as a fraction of the radius
    "shoulder": 0.12,     # the part of the height over which the top rounds off
    "tip": 0.75,          # how far the shoulder draws in: 1 comes to a point
    "strata": 0.0,        # horizontal bands of colour, for layered rock
    "stone": "karst",     # which stone colours
    "flat": False,        # flat faces, for a shard of rock, instead of smooth ones
    "crown": True,        # jungle on top
    "moss": True,         # moss hanging down from the top
    "wet": None,          # the level of the water its foot stands in, for a dark wet band
    "notch": None,        # (angle, half width, depth): a dip in the top's rim for a waterfall
    "cave": None,         # (angle, half width, height, depth): an arched cave mouth at `wet`
}


def smoothstep(a, b, x):
    t = np.clip((np.asarray(x, dtype=float) - a) / (b - a), 0.0, 1.0)
    return t * t * (3.0 - 2.0 * t)


def mix(a, b, t):
    t = np.asarray(t, dtype=float)
    return a + (b - a) * t[..., None]


def angle_diff(a, b):
    return np.arctan2(np.sin(a - b), np.cos(a - b))


def ring_levels(base, top, spans):
    """Heights of the rings from `base` to `top`. `spans` lists (y0, y1, step), the spacing between
    y0 and y1; where spans overlap the closest spacing wins, and every span's ends get a ring."""
    cuts = sorted({base, top, *[c for y0, y1, _ in spans for c in (y0, y1) if base < c < top]})
    levels = []
    for a, b in zip(cuts, cuts[1:]):
        mid = (a + b) / 2
        step = min(st for y0, y1, st in spans if y0 <= mid <= y1)
        n = max(1, math.ceil((b - a) / step - 1e-6))
        levels.extend(a + (b - a) * i / n for i in range(n))
    levels.append(top)
    return np.array(levels)


def ring_angles(n, focus=None, squeeze=0.75):
    """Angles round a ring, evenly spaced, or packed `1 / (1 - squeeze)` times closer at `focus`."""
    s = np.linspace(-math.pi, math.pi, n, endpoint=False)
    if focus is None:
        return s
    return focus + s - squeeze * np.sin(s)


def arch(u, v, half, height):
    """Signed distance (roughly, in metres; negative inside) to an arch with upright sides `half`
    from its middle and a rounded top `height` up, across a face at u along it and v up it."""
    spring = height * 0.45
    k = half / (height - spring)
    side = np.abs(u) - half
    top = np.hypot(u, np.maximum(v - spring, 0.0) * k) - half
    return np.where(v <= spring, side, top), spring, k


class Rock:
    """One rock: its shape at any angle and height, and the mesh built from it."""

    def __init__(self, spec, ground):
        s = {**DEFAULTS, **spec}
        self.s = s
        rng = np.random.default_rng(s["seed"])
        self.seed = s["seed"]
        self.cx, self.cz = s["centre"]
        self.rx, self.rz = s["radii"]
        self.ground = ground
        # The ground round its foot: where it stands, and how deep its base has to go.
        a = np.linspace(0.0, 2.0 * math.pi, 64, endpoint=False)
        c, sn = math.cos(s["turn"]), math.sin(s["turn"])
        lx, lz = 1.15 * self.rx * np.cos(a), 1.15 * self.rz * np.sin(a)
        g = ground(self.cx + lx * c - lz * sn, self.cz + lx * sn + lz * c)
        self.foot = float(np.median(g))
        self.base = float(min(g.min(), ground(np.array([self.cx]), np.array([self.cz]))[0])) - 1.5
        if s["wet"] is not None:
            self.foot = max(self.foot, s["wet"])
        self.top = s["top"] if "top" in s else self.foot + s["height"]

        self.lump_a = rng.uniform(0.5, 1.0, 4) * s["lumps"] / np.array([1.0, 1.3, 1.7, 2.2]) * rng.choice([-1.0, 1.0], 4)
        self.lump_p = rng.uniform(0.0, 2.0 * math.pi, 4)
        self.lump_d = rng.uniform(-1.2, 1.2, 4)
        self.flute_p = rng.uniform(0.0, 2.0 * math.pi, 3)
        self.paint_p = rng.uniform(0.0, 2.0 * math.pi, 10)
        m = s["facets"]
        if m:
            gaps = rng.uniform(0.6, 1.4, m)
            self.corners = rng.uniform(0.0, 2.0 * math.pi) + np.cumsum(gaps / gaps.sum() * 2.0 * math.pi)
            self.corner_r = rng.uniform(0.93, 1.07, m)
            self.corner_turn = rng.uniform(-0.12, 0.12, m)
            self.corner_p = rng.uniform(0.0, 2.0 * math.pi, m)
            probe = np.linspace(0.0, 2.0 * math.pi, 256, endpoint=False)
            self.facet_mean = float(np.mean(self.facets(probe, np.zeros_like(probe))))
        else:
            self.corners = None
        # Ledges step in going up, so each catches the light along its top.
        self.ledges = [(rng.uniform(0.25, 0.75), rng.uniform(0.04, 0.09)) for _ in range(s["ledges"])]
        lean_dir = rng.uniform(0.0, 2.0 * math.pi)
        self.lean = (s["lean"] * (self.top - self.foot) * math.cos(lean_dir),
                     s["lean"] * (self.top - self.foot) * math.sin(lean_dir))

    def h(self, y):
        return np.clip((np.asarray(y, dtype=float) - self.foot) / (self.top - self.foot), 0.0, 1.0)

    def middle(self, y):
        """The rock's middle (x, z) at height y: it leans a little more the higher it goes."""
        h2 = self.h(y) ** 2
        return self.cx + self.lean[0] * h2, self.cz + self.lean[1] * h2

    def facets(self, theta, h):
        """The outline as an irregular polygon of flat faces, about 1 across, its corners turning and
        swelling a little with height: limestone splits into slabs like this."""
        m = len(self.corners)
        corners = self.corners[None, :] + self.corner_turn[None, :] * h[:, None]
        reach = self.corner_r[None, :] * (1.0 + 0.05 * np.sin(6.0 * h[:, None] + self.corner_p[None, :]))
        after = np.mod(theta[:, None] - corners, 2.0 * math.pi)
        i = np.argmin(after, axis=1)
        j = (i + 1) % m
        rows = np.arange(len(theta))
        a0, a1 = corners[rows, i], corners[rows, j]
        r0, r1 = reach[rows, i], reach[rows, j]
        p0x, p0z = r0 * np.cos(a0), r0 * np.sin(a0)
        dx, dz = r1 * np.cos(a1) - p0x, r1 * np.sin(a1) - p0z
        ux, uz = np.cos(theta), np.sin(theta)
        t = (p0x * dz - p0z * dx) / (ux * dz - uz * dx)
        # Faces bow out a little, so they are not quite flat.
        span = np.mod(a1 - a0, 2.0 * math.pi)
        return t * (1.0 + 0.05 * np.sin(math.pi * np.clip(after[rows, i] / span, 0.0, 1.0)))

    def radius(self, theta, y):
        """Distance from the rock's middle to its face at angles `theta`, height `y`, and how deep
        in a groove (0 to 1) each point is."""
        s = self.s
        theta = np.asarray(theta, dtype=float)
        h = np.broadcast_to(self.h(y), theta.shape)
        a = theta - s["turn"]
        shape = 1.0 / np.sqrt((np.cos(a) / self.rx) ** 2 + (np.sin(a) / self.rz) ** 2)
        if self.corners is not None:
            flat = self.facets(theta.ravel(), h.ravel()).reshape(theta.shape) / self.facet_mean
            shape = shape * (1.0 + s["facet_w"] * (flat - 1.0))
        lump = sum(self.lump_a[i] * np.sin((i + 2) * theta + self.lump_p[i] + self.lump_d[i] * h * math.pi)
                   for i in range(4))
        f = self.flute_p
        warp = theta + 0.3 * np.sin(2.0 * theta + f[0]) + 0.15 * np.sin(3.0 * theta + f[1])
        groove = (0.5 + 0.5 * np.cos(s["flutes"] * warp + f[2])) ** 6 * (0.55 + 0.45 * np.sin(4.0 * h + f[0]))
        calm = np.ones_like(theta)
        if s["notch"]:
            # Under a waterfall the face is smooth, so the water falls clear of it.
            an, half, _ = s["notch"]
            arc = np.abs(angle_diff(theta, an)) * shape
            calm = 1.0 - 0.85 * np.exp(-(arc / (2.5 * half)) ** 2)
        prof = (1.0 - s["taper"] * h) * (1.0 + s["bulge"] * np.sin(math.pi * h))
        for at, amount in self.ledges:
            prof = prof * (1.0 - amount * smoothstep(at - 0.012, at + 0.012, h))
        t = np.clip((h - (1.0 - s["shoulder"])) / s["shoulder"], 0.0, 1.0)
        prof = prof * np.sqrt(np.clip(1.0 - (s["tip"] * t) ** 2, 0.0, 1.0))
        r = shape * prof * (1.0 + lump * calm) * (1.0 - s["flute_depth"] * groove * calm)
        return r, groove * calm

    def outline(self, count=32):
        """The rock's widest reach at `count` angles round it, from the ground to head height, for
        the game to keep walkers and the camera out of it."""
        theta = np.linspace(0.0, 2.0 * math.pi, count, endpoint=False)
        reach = np.zeros(count)
        for y in np.linspace(self.foot - 0.5, self.foot + 2.5, 7):
            reach = np.maximum(reach, self.radius(theta, np.full(count, y))[0])
        return [round(float(r), 2) for r in reach]

    def build(self):
        """The rock's mesh in Blender coordinates, a colour per vertex, and its top rim."""
        s = self.s
        cave = s["cave"]
        height = self.top - self.foot
        spans = [(self.base, self.top, s["step"]),
                 (self.top - s["shoulder"] * height, self.top, s["shoulder"] * height / 6.0)]
        for at, _ in self.ledges:
            y_at = self.foot + at * height
            spans.append((y_at - 1.0, y_at + 1.0, 0.5))
        if cave:
            water = s["wet"]
            spans.append((water - 1.5, water + cave[2] + 1.2, 0.45))
        levels = ring_levels(self.base, self.top, spans)
        theta = ring_angles(s["segments"], cave[0] if cave else None, squeeze=0.85)
        rings, n = len(levels), len(theta)
        TH = np.tile(theta, (rings, 1))
        Y = np.tile(levels[:, None], (1, n)).astype(float)

        # The top's rim dips here and there.
        if s["rim"]:
            p = self.paint_p
            dip = 0.5 + 0.5 * (0.67 * np.sin(3.0 * theta + p[8]) + 0.33 * np.sin(5.0 * theta + p[9]))
            t = np.clip((self.h(levels) - (1.0 - s["shoulder"])) / s["shoulder"], 0.0, 1.0)
            Y = Y - s["rim"] * min(self.rx, self.rz) * dip[None, :] * (t ** 2)[:, None]

        rim = np.zeros((rings, n), dtype=bool)
        inside = np.zeros((rings, n), dtype=bool)
        if cave:
            ac, half, tall, depth = cave
            face = float(self.radius(np.array([ac]), np.array([water]))[0][0])
            U = angle_diff(TH, ac) * face
            V = Y - water
            D, spring, k = arch(U, V, half, tall)
            inside = D < 0.0

            def vault(u):
                return water + spring + math.sqrt(max(half * half - u * u, 0.0)) / k

            # The arch's edge runs through points moved onto it, on the face and again at the back
            # of the passage, so the mouth's outline and its vault are clean. Over its rounded top,
            # in each column: the first point above the opening, and the last one inside it...
            for j in range(n):
                col = np.nonzero(inside[:, j])[0]
                if len(col) == 0 or col.max() + 1 >= rings:
                    continue
                i = col.max() + 1
                if V[i, j] > spring and abs(U[i, j]) < half * 0.95:
                    Y[i, j] = vault(U[i, j])
                    Y[i - 1, j] = vault(U[i - 1, j])
                    rim[i, j] = True
            # ...and up its sides, in each ring: the points either side of the opening, and the
            # outermost ones inside it.
            for i in range(rings):
                cols = np.nonzero(inside[i])[0]
                v = levels[i] - water
                if len(cols) == 0 or v > spring + 0.5 * (tall - spring):
                    continue
                w = half if v <= spring else half * math.sqrt(max(1.0 - ((v - spring) * k / half) ** 2, 0.0))
                for j_out, j_in, sign in ((cols.min() - 1, cols.min(), -1.0), (cols.max() + 1, cols.max(), 1.0)):
                    if 0 <= j_out < n and not rim[i, j_out]:
                        TH[i, j_out] = ac + sign * w / face
                        rim[i, j_out] = True
                    TH[i, j_in] = ac + sign * w / face

        R, groove = self.radius(TH, Y)
        if cave:
            # Inside the arch the face is pushed back into the dark, deepest in the middle.
            R = np.where(inside, R - depth * (1.0 - 0.35 * np.clip(U / half, -1.0, 1.0) ** 2), R)
        if s["notch"]:
            an, half, depth = s["notch"]
            arc = np.abs(angle_diff(TH, an)) * R
            Y = Y - depth * np.exp(-(arc / half) ** 4) * smoothstep(self.top - 2.0 * depth, self.top, Y)
        MX, MZ = self.middle(Y)
        X = MX + R * np.cos(TH)
        Z = MZ + R * np.sin(TH)
        colours = self.paint(TH, Y, groove, self.ground(X.ravel(), Z.ravel()).reshape(X.shape), rim, inside)

        bm = bmesh.new()
        grid = [[bm.verts.new((float(X[i, j]), float(-Z[i, j]), float(Y[i, j]))) for j in range(n)]
                for i in range(rings)]
        for lo, hi in zip(grid, grid[1:]):
            for i in range(n):
                j = (i + 1) % n
                bm.faces.new((lo[i], lo[j], hi[j], hi[i]))
        tx, tz = self.middle(self.top)
        top = bm.verts.new((float(tx), float(-tz), self.top + 0.04 * min(self.rx, self.rz)))
        bottom = bm.verts.new((self.cx, -self.cz, self.base))
        for i in range(n):
            j = (i + 1) % n
            bm.faces.new((grid[-1][i], grid[-1][j], top))
            bm.faces.new((grid[0][j], grid[0][i], bottom))
        cols = list(colours.reshape(-1, 3))
        cols.append(SHARED["moss"] if s["moss"] else STONES[s["stone"]]["stone"])
        cols.append(SHARED["foot"])
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])

        if cave:
            # Dark water inside the mouth, over the sea's bright surface, facing up.
            i = int(np.argmin(np.abs(levels - water)))
            idx = np.nonzero(inside[i] | rim[i])[0]
            pts = [(float(X[i, j]), float(Z[i, j])) for j in idx]
            mx = sum(p[0] for p in pts) / len(pts)
            mz = sum(p[1] for p in pts) / len(pts)
            y = water + 0.03
            hub = bm.verts.new((mx, -mz, y))
            ring = [bm.verts.new((px, -pz, y)) for px, pz in pts]
            fan = [bm.faces.new((hub, a, b)) for a, b in zip(ring, ring[1:])]
            fan.append(bm.faces.new((hub, ring[-1], ring[0])))
            for f in fan:
                f.normal_update()
                if f.normal.z < 0.0:
                    f.normal_flip()
            cols.extend([SHARED["cave"]] * (len(ring) + 1))

        return bm, cols, (X[-1], Y[-1], Z[-1])

    def paint(self, theta, y, groove, ground_y, rim, inside):
        """Colours down the rock: stone in soft bands, darker in the grooves, streaked from the
        top, layered where it is bedded rock, moss hanging in tongues, earthy at the foot and dark
        where the water laps; the cave's mouth dark."""
        s, p = self.s, self.paint_p
        C = {**SHARED, **STONES[s["stone"]]}
        h = self.h(y)
        band = (0.5 + 0.5 * np.sin(3.0 * theta + p[0] + 2.0 * h)) * (0.5 + 0.5 * np.sin(5.0 * theta + p[1]))
        col = mix(np.broadcast_to(C["stone"], theta.shape + (3,)), C["stoneMid"], smoothstep(0.3, 0.7, band))
        col = mix(col, C["groove"], smoothstep(0.15, 0.7, groove))
        streak = (0.5 + 0.5 * np.sin(23.0 * theta + p[2])) * (0.5 + 0.5 * np.sin(37.0 * theta + p[3]))
        col = mix(col, C["streak"], smoothstep(0.5, 0.8, streak) * (0.35 + 0.65 * h))
        if s["strata"]:
            beds = 0.5 + 0.5 * np.sin(y * 0.85 + 0.8 * np.sin(2.0 * theta + p[7]))
            col = mix(col, C["stoneMid"], s["strata"] * smoothstep(0.5, 0.85, beds))
        if s["moss"]:
            drape = 0.07 + 0.16 * (0.5 + 0.5 * np.sin(7.0 * theta + p[4])) ** 3 + 0.04 * np.sin(13.0 * theta + p[5])
            m = smoothstep(1.0 - drape - 0.03, 1.0 - drape + 0.03, h)
            moss = mix(np.broadcast_to(C["moss"], theta.shape + (3,)), C["mossDark"],
                       smoothstep(0.3, 0.7, 0.5 + 0.5 * np.sin(11.0 * theta + p[6])))
            col = col + (moss - col) * m[..., None]
        col = mix(col, C["foot"], smoothstep(1.4, 0.0, y - ground_y))
        if s["wet"] is not None:
            col = mix(col, C["wet"], smoothstep(1.0, 0.25, y - s["wet"]))
        # The cave mouth's edge stays the face's own colour; the dark starts inside.
        return np.where(inside[..., None], C["cave"], col)


def crown(rock, rim, gap=None, size=None, target=1200):
    """Jungle on a rock's top: blobs along the rim, leaning out over it, mounded over the middle
    and spilling a little down the sides, fused into one soft mass. `gap` (angle, half width)
    leaves the rim bare where a waterfall pours; `size` overrides the top's radius, for a tuft on
    a pointed spire."""
    rng = np.random.default_rng(rock.seed + 100)
    x, y, z = rim
    cx, cz = (float(v) for v in rock.middle(rock.top))
    top = rock.top
    size = size or float(np.mean(np.hypot(x - cx, z - cz)))
    voxel = max(0.08, size * 0.035)
    blobs = []
    # Along the rim, every few metres.
    seg = np.hypot(np.diff(x, append=x[:1]), np.diff(z, append=z[:1]))
    along = np.concatenate([[0.0], np.cumsum(seg)[:-1]])
    spacing = max(2.2, size * 0.42)
    for d in np.arange(rng.uniform(0, spacing), along[-1] + seg[-1], spacing):
        i = int(np.searchsorted(along, d, side="right") - 1)
        px, pz, py = float(x[i]), float(z[i]), float(y[i])
        ang = math.atan2(pz - cz, px - cx)
        if gap and abs(float(angle_diff(ang, gap[0]))) * size < gap[1] + 2.0:
            continue
        r = size * rng.uniform(0.26, 0.36)
        out = Vector((px - cx, -(pz - cz), 0.0)).normalized()
        c = Vector((px, -pz, py + r * 0.2)) + out * (r * 0.2)
        blobs.append(L.ellipsoid_bm(c, (r, r, r * 0.8), u=14, v=9))
        if rng.random() < 0.35:
            # A clump hanging over the edge.
            rh = r * rng.uniform(0.45, 0.6)
            blobs.append(L.ellipsoid_bm(c + out * (r * 0.45) - Vector((0, 0, r * 0.9)), (rh, rh, rh * 1.1), u=12, v=8))
    # Mounded over the middle.
    for _ in range(int(rng.integers(2, 5))):
        a, d = rng.uniform(0, 2 * math.pi), size * rng.uniform(0.0, 0.5)
        r = size * rng.uniform(0.38, 0.5)
        if gap and abs(float(angle_diff(a, gap[0]))) * d < gap[1] + 2.0 and d > size * 0.3:
            continue
        c = Vector((cx + d * math.cos(a), -(cz + d * math.sin(a)), top + r * 0.35))
        blobs.append(L.ellipsoid_bm(c, (r, r, r * 0.75), u=16, v=10))
    bm = L.fuse(blobs, voxel=voxel, smooth_iterations=6, smooth_lambda=0.8, target_tris=target)
    bm.normal_update()
    cols = []
    for v in bm.verts:
        up = v.normal.z
        n = 0.5 + 0.5 * math.sin(v.co.x * 0.45 + rock.seed) * math.sin(v.co.y * 0.38 - rock.seed)
        c = SHARED["leavesMid"] + (SHARED["leaves"] - SHARED["leavesMid"]) * float(smoothstep(0.3, 0.9, up))
        c = c + (SHARED["leavesDark"] - c) * float(max(smoothstep(0.1, -0.6, up), 0.45 * smoothstep(0.55, 0.85, n)))
        cols.append(c)
    return bm, cols


def waterfall(rock, pool_level, rows=20, thickness=0.45):
    """The waterfall: a band of water pouring over the notch in a rock's rim and falling clear of
    its face into the pool, thick enough to carry the pen's outline. UVs run across (u) and down
    (v), for the game's flowing streaks."""
    an, half, depth = rock.s["notch"]
    lip = rock.top - depth
    face_lip = float(rock.radius(np.array([an]), np.array([lip]))[0][0])
    reach = face_lip
    for y in np.linspace(pool_level - 0.6, lip, 24):
        angles = np.array([an + d / face_lip for d in (-half, 0.0, half)])
        reach = max(reach, float(rock.radius(angles, np.full(3, y))[0].max()))
    out_dir = np.array([math.cos(an), math.sin(an)])
    side = np.array([-out_dir[1], out_dir[0]])
    bottom_y = pool_level - 0.6
    # Water leaving the lip falls in an arc: out from the face as the root of how far it has
    # dropped, quickly enough to clear the face below.
    throw = max(2.0, (reach - face_lip + 0.5) / math.sqrt(0.15))
    path = [(face_lip - 1.2, lip + 0.3, 0.0)]
    for i in range(rows + 1):
        s = i / rows
        path.append((face_lip + 0.25 + throw * math.sqrt(s), lip + 0.15 - (lip + 0.15 - bottom_y) * s, s))
    bm = bmesh.new()
    uv = []
    grid = []
    for out, y, s in path:
        w = 2.0 * half * 0.75 * (1.0 + 0.3 * s)
        c = np.array([rock.cx, rock.cz]) + out_dir * out
        ring = []
        for across, depth_off in ((-0.5, 1.0), (0.5, 1.0), (0.5, -1.0), (-0.5, -1.0)):
            p = c + side * (across * w) + out_dir * (depth_off * thickness / 2)
            ring.append(bm.verts.new((float(p[0]), float(-p[1]), float(y))))
            uv.append((across + 0.5, s))
        grid.append(ring)
    for a, b in zip(grid, grid[1:]):
        for k in range(4):
            bm.faces.new((a[k], a[(k + 1) % 4], b[(k + 1) % 4], b[k]))
    bm.faces.new(grid[0])
    bm.faces.new(list(reversed(grid[-1])))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    foot = np.array([rock.cx, rock.cz]) + out_dir * (face_lip + 0.25 + throw)
    return bm, uv, (float(foot[0]), float(foot[1]))


def spray(level, seed=7):
    """White water thrown up where a waterfall lands: puffs fused into one cloud round its foot,
    built round its own origin (the foot, at the water) so the game can make it heave."""
    rng = np.random.default_rng(seed)
    blobs = []
    for k in range(8):
        a, d = 2.0 * math.pi * k / 8 + rng.uniform(-0.3, 0.3), rng.uniform(1.4, 2.6)
        r = rng.uniform(0.75, 1.25)
        blobs.append(L.ellipsoid_bm(Vector((d * math.cos(a), -d * math.sin(a), r * 0.2)), (r, r, r * 0.9), u=12, v=8))
    bm = L.fuse(blobs, voxel=0.1, smooth_iterations=6, smooth_lambda=0.8, target_tris=600)
    bm.normal_update()
    white, under = np.array(L.hex_color("#FFFFFF")[:3]), np.array(L.hex_color("#BDEFF7")[:3])
    cols = [under + (white - under) * float(smoothstep(-0.4, 0.3, v.normal.z)) for v in bm.verts]
    return bm, cols
