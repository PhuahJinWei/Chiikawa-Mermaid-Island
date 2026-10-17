"""The island's rock landmarks, after the film's limestone karst.

Every rock here is built the same way: rings of vertices stacked up a wobbly outline. The outline
is an irregular polygon with softened corners, so the stone splits into flat slabs; rain flutes it
with vertical grooves; it steps in or out at a ledge or two, leans a little and rounds off at the
shoulders, its top rim uneven. Pillars and mesas wear a crown of jungle, a mesa's sometimes swelling
into a great mound of trees; sea spires are angular shards; the rocks behind the night beach are
layered. A rock can open an arched cave mouth at its foot, or a notch in its rim for a waterfall.
Colours are painted per vertex: pale stone, darker in the grooves, with streaks running down and
moss hanging from the top.

The cave's skylight is built here too: a round opening in the ground, ringed with the same stone.


Rocks are described in game coordinates (x east, z south, y up) and turned into Blender's
(x, -z, y) only as their vertices are made. Angles are measured in the game's x-z plane, from east
toward south.
"""

import math

import bmesh
import numpy as np
from mathutils import Vector

import build_props as P
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
# Stone by kind: the karst pillars pale and cool like the film's, the headland a warmer grey, the
# sea cliffs' bedded sandstone cream and tan.
STONES = {
    "karst": palette({"stone": "#D5DFE2", "stoneMid": "#BECACF", "groove": "#8B9FAC", "streak": "#AFBDC3"}),
    "headland": palette({"stone": "#D4D1C6", "stoneMid": "#B9B6AB", "groove": "#8C8F8B", "streak": "#A8A9A2"}),
    "sandstone": palette({"stone": "#E6D6B0", "stoneMid": "#CDB287", "groove": "#9A8260", "streak": "#BDA27A"}),
    # Damp limestone in the jungle's shade, as behind the film's waterfall: grey with green in it.
    "mossy": palette({"stone": "#B8C1AE", "stoneMid": "#A0AA95", "groove": "#6B7B6D", "streak": "#929E88"}),
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
    "drape": 1.0,         # how far down the moss hangs: more for a rock the jungle covers
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
            drape = (0.07 + 0.16 * (0.5 + 0.5 * np.sin(7.0 * theta + p[4])) ** 3
                     + 0.04 * np.sin(13.0 * theta + p[5])) * s["drape"]
            m = smoothstep(1.0 - drape - 0.03, 1.0 - drape + 0.03, h)
            moss = mix(np.broadcast_to(C["moss"], theta.shape + (3,)), C["mossDark"],
                       smoothstep(0.3, 0.7, 0.5 + 0.5 * np.sin(11.0 * theta + p[6])))
            col = col + (moss - col) * m[..., None]
            if s["stone"] == "mossy":
                # Damp rock: moss in patches all down the face too, thickest in the hollows.
                patch = (0.5 + 0.5 * np.sin(5.0 * theta + 1.3 * y + p[2])) * (0.5 + 0.5 * np.sin(9.0 * theta - 0.7 * y + p[3]))
                col = col + (moss - col) * smoothstep(0.42, 0.62, patch + 0.35 * groove)[..., None]
        col = mix(col, C["foot"], smoothstep(1.4, 0.0, y - ground_y))
        if s["wet"] is not None:
            col = mix(col, C["wet"], smoothstep(1.0, 0.25, y - s["wet"]))
        # The cave mouth's edge stays the face's own colour; the dark starts inside.
        return np.where(inside[..., None], C["cave"], col)


def crown(rock, rim, gap=None, size=None, target=1200, mound=1.0, hang=0.35):
    """Jungle on a rock's top: blobs along the rim, leaning out over it, mounded over the middle
    and spilling a little down the sides, fused into one soft mass. `gap` (angle, half width)
    leaves the rim bare where a waterfall pours; `size` overrides the top's radius, for a tuft on
    a pointed spire; `mound` swells the middle into a great dome of trees (1: a gentle mound);
    `hang` is how often a clump hangs over the edge."""
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
        if rng.random() < hang:
            # A clump hanging over the edge.
            rh = r * rng.uniform(0.45, 0.6)
            blobs.append(L.ellipsoid_bm(c + out * (r * 0.45) - Vector((0, 0, r * 0.9)), (rh, rh, rh * 1.1), u=12, v=8))
    # Mounded over the middle; a big mound is a wide, lumpy dome of many trees.
    for _ in range(int(rng.integers(2, 5)) + int(round(3.0 * (mound - 1.0)))):
        a, d = rng.uniform(0, 2 * math.pi), size * rng.uniform(0.0, 0.5 + 0.12 * (mound - 1.0))
        r = size * rng.uniform(0.38, 0.5) * (1.0 + 0.45 * (mound - 1.0))
        if gap and abs(float(angle_diff(a, gap[0]))) * d < gap[1] + 2.0 and d > size * 0.3:
            continue
        c = Vector((cx + d * math.cos(a), -(cz + d * math.sin(a)), top + r * 0.35 * math.sqrt(mound)))
        blobs.append(L.ellipsoid_bm(c, (r, r, r * 0.75 * mound ** 0.25), u=16, v=10))
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


def waterfall(rock, level, rows=20, thickness=0.45):
    """The waterfall: a band of water pouring over the notch in a rock's rim and falling clear of
    its face into the water at `level`, thick enough to carry the pen's outline. UVs run across (u)
    and down (v), for the game's flowing streaks."""
    an, half, depth = rock.s["notch"]
    lip = rock.top - depth
    face_lip = float(rock.radius(np.array([an]), np.array([lip]))[0][0])
    reach = face_lip
    for y in np.linspace(level - 0.6, lip, 24):
        angles = np.array([an + d / face_lip for d in (-half, 0.0, half)])
        reach = max(reach, float(rock.radius(angles, np.full(3, y))[0].max()))
    out_dir = np.array([math.cos(an), math.sin(an)])
    side = np.array([-out_dir[1], out_dir[0]])
    bottom_y = level - 0.6
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


def vines(rock, around, count, seed, avoid=None):
    """Vines hanging from a rock's rim down its face, as in the film's jungle waterfall: strands
    lying a hand's breadth out from the stone, with leaves along them, some reaching most of the way
    down. `around` is (angle, half arc in metres) of the face they hang on; `avoid` (angle, half
    width) keeps them clear of a waterfall. Returns (bmesh, colours)."""
    rng = np.random.default_rng(seed)
    an, arc = around
    face = float(rock.radius(np.array([an]), np.array([rock.top - 1.0]))[0][0])
    bm = bmesh.new()
    cols = []
    stem, leaf_light, leaf_dark = np.array(L.hex_color("#55693A")[:3]), SHARED["moss"], SHARED["mossDark"]
    height = rock.top - rock.foot
    made = 0
    for _ in range(count * 3):
        if made >= count:
            break
        a = an + rng.uniform(-arc, arc) / face
        if avoid and abs(float(angle_diff(a, avoid[0]))) * face < avoid[1] + 1.0:
            continue
        made += 1
        top = rock.top - rock.s["rim"] * min(rock.rx, rock.rz) * 0.5 - 0.3
        length = height * rng.uniform(0.2, 0.85) ** 0.7
        ys = np.linspace(top, top - length, max(4, int(length / 1.2) + 1))
        r = rock.radius(np.full(len(ys), a), ys)[0] + 0.12
        mx, mz = rock.middle(ys)
        sway = rng.uniform(-0.15, 0.15) * np.linspace(0.0, 1.0, len(ys)) ** 2
        pts = [Vector((float(mx[i] + r[i] * math.cos(a + sway[i] / face)), float(-(mz[i] + r[i] * math.sin(a + sway[i] / face))),
                       float(ys[i]))) for i in range(len(ys))]
        thick = rng.uniform(0.025, 0.045)
        for p, q in zip(pts, pts[1:]):
            seg = P.segment_bm(p, q, thick, thick * 0.9, segments=4)
            L.append_bm(bm, seg)
            cols.extend([stem] * len(seg.verts))
            seg.free()
        # Leaves in pairs down the strand, thinning out toward its end.
        out = Vector((math.cos(a), -math.sin(a), 0.0))
        side = Vector((math.sin(a), math.cos(a), 0.0))
        for t in np.arange(rng.uniform(0.02, 0.12), 1.0, rng.uniform(0.07, 0.12)):
            if rng.random() < t * 0.6:
                continue
            k = t * (len(pts) - 1)
            i = min(int(k), len(pts) - 2)
            c = pts[i].lerp(pts[i + 1], k - i) + out * 0.04 + side * rng.uniform(-0.1, 0.1)
            s = rng.uniform(0.09, 0.15)
            leaf = L.ellipsoid_bm(c, (s, s * 0.3, s * 0.6), u=5, v=3)
            L.append_bm(bm, leaf)
            cols.extend([leaf_light if rng.random() < 0.55 else leaf_dark] * len(leaf.verts))
            leaf.free()
    return bm, cols


def spray(level, seed=7):
    """White water thrown up where a waterfall lands: puffs fused into one cloud round its foot,
    built round its own origin (the foot, at the water) so the game can make it heave."""
    rng = np.random.default_rng(seed)
    blobs = []
    for k in range(7):
        a, d = 2.0 * math.pi * k / 7 + rng.uniform(-0.3, 0.3), rng.uniform(0.55, 1.1)
        r = rng.uniform(0.38, 0.62)
        blobs.append(L.ellipsoid_bm(Vector((d * math.cos(a), -d * math.sin(a), r * 0.1)), (r, r, r * 0.8), u=12, v=8))
    bm = L.fuse(blobs, voxel=0.06, smooth_iterations=6, smooth_lambda=0.8, target_tris=500)
    bm.normal_update()
    white, under = np.array(L.hex_color("#FFFFFF")[:3]), np.array(L.hex_color("#BDEFF7")[:3])
    cols = [under + (white - under) * float(smoothstep(-0.4, 0.3, v.normal.z)) for v in bm.verts]
    return bm, cols


def cliff(points, normals, tops, water, seed, base=-4.5, lip=2.6, column=1.2):
    """Sea cliffs of bedded sandstone along a stretch of coast, after the film's frame of them:
    `points` (x, z) along the foot of the face at the water, each with its outward normal (x, z) and
    the height of the land on top. The face rises from below the water at `base`, stepped in and
    out by level beds of stone and split into blocks by upright joints, leaning back a little; it
    rounds over at the top into a lip of turf `lip` metres inland, then goes back down into the
    ground. A closed solid, for the pen. Painted in bands bed by bed, darker in the joints and the
    hollows, streaked from the top, greenery hanging over the edge in tongues, wet where the sea
    laps. Returns (bmesh, colours)."""
    rng = np.random.default_rng(seed)
    C = {**SHARED, **STONES["sandstone"]}
    grass, grass_dark = np.array(L.hex_color("#84C557")[:3]), np.array(L.hex_color("#5E9E44")[:3])
    pts = np.asarray(points, dtype=float)
    nrm = np.asarray(normals, dtype=float)
    tops = np.asarray(tops, dtype=float)
    # Resample the coast every `column` metres.
    seg = np.hypot(*np.diff(pts, axis=0).T)
    along = np.concatenate([[0.0], np.cumsum(seg)])
    u = np.arange(0.0, along[-1] + 1e-6, column)
    P = np.stack([np.interp(u, along, pts[:, 0]), np.interp(u, along, pts[:, 1])], axis=1)
    N = np.stack([np.interp(u, along, nrm[:, 0]), np.interp(u, along, nrm[:, 1])], axis=1)
    N /= np.linalg.norm(N, axis=1, keepdims=True)
    T = np.interp(u, along, tops)
    # Level beds of stone from below the water to the highest top: each sticks out or sits back.
    beds, y = [], base
    while y < T.max() + 1.0:
        beds.append(y)
        y += rng.uniform(0.7, 2.0)
    beds.append(y)
    jut = rng.uniform(-0.6, 0.6, len(beds))
    shade = rng.choice([0.0, 0.0, 0.45, 0.8, 1.0], len(beds))
    # Upright joints split the face into blocks, each standing in or out.
    joints = [0.0]
    while joints[-1] < u[-1]:
        joints.append(joints[-1] + rng.uniform(3.5, 9.0))
    block_jut = rng.uniform(-0.9, 0.7, len(joints) + 1)
    streak_p = rng.uniform(0.0, 2.0 * math.pi, 3)
    hang = 0.6 + 2.6 * rng.uniform(0.0, 1.0, len(u)) ** 2
    hang = np.convolve(hang, np.ones(3) / 3.0, mode="same")
    # Rows at fixed heights, with a pair at every bed's edge so the steps stay crisp; any row above a
    # column's top folds down onto it.
    levels = sorted({base, water - 0.9, water - 0.25, water + 0.3, *np.arange(base, T.max() + 0.7, 0.7),
                     *[b + d for b in beds for d in (-0.05, 0.05)]})
    levels = np.array([v for v in levels if base <= v <= T.max() - 0.6])

    def face_offset(i, y):
        """How far the face stands out to sea from the coast's point at column i, height y."""
        k = np.clip(np.searchsorted(beds, y) - 1, 0, len(beds) - 1)
        j = int(np.searchsorted(joints, u[i]))
        d_joint = min(abs(u[i] - joints[max(j - 1, 0)]), abs(u[i] - joints[min(j, len(joints) - 1)]))
        crack = -1.1 * (1.0 - smoothstep(0.25, 0.75, d_joint))
        return 1.6 + jut[k] + block_jut[j] + crack - 0.02 * (np.asarray(y) - water), k, d_joint

    bm = bmesh.new()
    grid, cols = [], []
    for i in range(len(u)):
        top = T[i]
        ys = list(np.minimum(levels, top - 0.6)) + [top - 0.3, top - 0.1, top]
        pull = [0.0] * len(levels) + [0.15, 0.45, 0.9]
        ring, ring_cols = [], []
        for y, back in zip(ys, pull):
            off, k, d_joint = face_offset(i, y)
            p = P[i] + N[i] * (off - back)
            ring.append(bm.verts.new((float(p[0]), float(-p[1]), float(y))))
            # Paint: the bed's own tone, darker in a joint or a block set back, in shadow under a
            # bed that juts out over it, streaked downward.
            c = mix(C["stone"], C["stoneMid"], shade[k])
            c = mix(c, C["groove"], 0.75 * (1.0 - smoothstep(0.15, 0.6, d_joint)) + 0.4 * max(-block_jut[min(
                int(np.searchsorted(joints, u[i])), len(block_jut) - 1)], 0.0))
            if k + 1 < len(beds):
                over = min(max(jut[k + 1] - jut[k], 0.0) / 0.5, 1.0)
                c = mix(c, C["groove"] * 0.9, 0.65 * over * smoothstep(beds[k + 1] - 0.7, beds[k + 1] - 0.08, y))
            streak = (0.5 + 0.5 * math.sin(u[i] * 1.7 + streak_p[0])) * (0.5 + 0.5 * math.sin(u[i] * 0.53 + streak_p[1]))
            c = mix(c, C["streak"], smoothstep(0.55, 0.85, streak) * smoothstep(water, top, y) * 0.8)
            c = mix(c, mix(grass, grass_dark, 0.5 + 0.5 * math.sin(u[i] * 2.3 + y)), smoothstep(top - hang[i] - 0.1,
                                                                                               top - hang[i] + 0.1, y))
            c = mix(c, C["wet"], smoothstep(water + 0.9, water + 0.2, y))
            ring_cols.append(c)
        # The turf lip on top, running inland, then back down into the ground behind.
        for inland, dy in ((0.5, 0.06), (1.4, 0.08), (lip, 0.05)):
            p = P[i] - N[i] * inland
            ring.append(bm.verts.new((float(p[0]), float(-p[1]), float(top + dy))))
            ring_cols.append(mix(grass, grass_dark, 0.35))
        p = P[i] - N[i] * lip
        ring.append(bm.verts.new((float(p[0]), float(-p[1]), float(base))))
        ring_cols.append(C["foot"])
        grid.append(ring)
        cols.extend(ring_cols)
    rows = len(grid[0])
    for a, b in zip(grid, grid[1:]):
        for k in range(rows):
            m = (k + 1) % rows
            bm.faces.new((a[k], b[k], b[m], a[m]))
    for ring in (grid[0], grid[-1]):
        mid = bm.verts.new(sum((v.co for v in ring), Vector()) / rows)
        cols.append(C["foot"])
        for k in range(rows):
            bm.faces.new((ring[k], ring[(k + 1) % rows], mid))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    # Shrubs along the top of the tall cliffs, spilling over the edge here and there (low cliffs
    # keep a clear grassy edge): soft clumps fused a stretch at a time, leafy green, darker
    # underneath.
    leaves, mid_leaf, dark = SHARED["leaves"], SHARED["leavesMid"], SHARED["leavesDark"]
    stretch = 12.0
    for s0 in np.arange(0.0, u[-1], stretch):
        blobs = []
        for d in np.arange(s0 + rng.uniform(0.0, 1.0), min(s0 + stretch, u[-1]), rng.uniform(1.1, 1.7)):
            i = min(int(round(d / column)), len(u) - 1)
            if T[i] < water + 11.0:
                continue
            r = rng.uniform(0.55, 1.15)
            over = rng.random() < 0.4
            off = face_offset(i, T[i] - 0.6)[0] - (0.2 if over else 0.9)
            p = P[i] + N[i] * off
            y = T[i] + r * 0.15 - (rng.uniform(0.5, 1.4) if over else 0.0)
            blobs.append(L.ellipsoid_bm(Vector((float(p[0]), float(-p[1]), float(y))), (r, r, r * 0.8), u=12, v=8))
        if not blobs:
            continue
        lump = L.fuse(blobs, voxel=0.12, smooth_iterations=5, smooth_lambda=0.8, target_tris=700)
        lump.normal_update()
        for v in lump.verts:
            up = v.normal.z
            c = mid_leaf + (leaves - mid_leaf) * float(smoothstep(0.2, 0.9, up))
            cols.append(c + (dark - c) * float(smoothstep(0.05, -0.6, up)))
        L.append_bm(bm, lump)
        lump.free()
    return bm, cols


# How far the skylight's lip stands above the ground round it.
SINKHOLE_LIP = 0.16


def sinkhole(centre, radius, rim, water, floor, seed, bell=2.5, width=5.5, sheer=None, segments=72):
    """The cave's skylight: a round opening in the ground over the cave's water, as in the film's
    aerial shot. Its sides are sheer fluted limestone that flare out under the edge into the cave
    below and drop past the water; a mossy lip runs round the edge out to `radius + width`, a step
    above the ground at `rim`; vines hang down inside. Toward the angle `sheer` (where a rock stands
    close) the side drops sheer instead, so the rock stays clear of the cave. A closed solid ring,
    for the pen: the inner face, the lip on top, the outer face down into the ground. Returns
    (bmesh, colours, edge): the edge is the opening's radius at `segments` even angles round it from
    east toward south, for the game to keep walkers back from."""
    rng = np.random.default_rng(seed)
    C = {**SHARED, **STONES["karst"]}
    cx, cz = centre
    theta = np.linspace(0.0, 2.0 * math.pi, segments, endpoint=False)
    p = rng.uniform(0.0, 2.0 * math.pi, 8)
    # Nearly round, as in the film: the edge wanders at most 5% either way.
    lump = 0.025 * np.sin(2 * theta + p[0]) + 0.015 * np.sin(3 * theta + p[1]) + 0.01 * np.sin(5 * theta + p[2])
    warp = theta + 0.25 * np.sin(3 * theta + p[3])
    groove = (0.5 + 0.5 * np.cos(14.0 * warp + p[4])) ** 4
    edge = radius * (1.0 + lump)
    top = rim + SINKHOLE_LIP - 0.04
    bottom = floor - 0.5
    drape = 0.5 + 0.9 * (0.5 + 0.5 * np.sin(7.0 * theta + p[5])) ** 2
    opening = np.ones(segments) if sheer is None else 1.0 - 0.9 * np.exp(-(angle_diff(theta, sheer) / 0.45) ** 2)

    def inner(y):
        """The inner face's distance from the middle at height y: at the edge just under the lip,
        flaring out by `bell` a few metres down (less toward `sheer`), fluted all the way."""
        flare = smoothstep(rim - 0.3, rim - 3.5, y) * opening
        return edge + bell * flare + 0.35 * groove * flare

    # The profile round each angle: up the inner face, across the lip, down the outer face.
    profile = []   # (radii by angle, height, kind)
    for y in [bottom, water - 1.0, water - 0.25, water + 0.35, water + 1.4, *np.linspace(water + 2.6, rim - 1.0, 4),
              rim - 0.5, rim - 0.18]:
        profile.append((inner(float(y)), float(y), "face"))
    profile.append((edge + 0.16, top - 0.02, "edge"))
    # The lip follows the edge's wobble across to its round outer rim.
    for out in (0.45, 1.6, 3.0, 4.3):
        profile.append((edge + out, top + 0.04, "lip"))
    profile.append((np.full(segments, radius + width), top, "lip"))
    profile.append((np.full(segments, radius + width), bottom, "outer"))

    bm = bmesh.new()
    rows, cols = [], []
    for radii, y, kind in profile:
        xs, zs = cx + radii * np.cos(theta), cz + radii * np.sin(theta)
        rows.append([bm.verts.new((float(xs[j]), -float(zs[j]), y)) for j in range(segments)])
        if kind in ("face", "edge"):
            f = (y - water) / max(rim - water, 0.1)
            band = 0.5 + 0.5 * np.sin(3.0 * theta + p[6] + 2.0 * f)
            c = mix(np.broadcast_to(C["stone"], (segments, 3)), C["stoneMid"], smoothstep(0.3, 0.7, band))
            c = mix(c, C["groove"], smoothstep(0.15, 0.7, groove))
            # Darker down in the cave, under the overhang; wet where the water laps; moss hanging
            # from the edge in tongues.
            c = mix(c, C["groove"] * 0.72, smoothstep(0.85, 0.25, f))
            c = mix(c, C["wet"], smoothstep(0.9, 0.2, abs(y - water)) if abs(y - water) < 0.9 else 0.0)
            c = mix(c, mix(np.broadcast_to(C["moss"], (segments, 3)), C["mossDark"], 0.5 + 0.5 * np.sin(11.0 * theta)),
                    smoothstep(rim - drape - 0.1, rim - drape + 0.1, y))
        elif kind == "lip":
            c = mix(np.broadcast_to(C["moss"], (segments, 3)), C["mossDark"],
                    smoothstep(0.2, 0.8, 0.5 + 0.5 * np.sin(5.0 * theta + p[7]) * np.sin(radius + y)))
        else:
            c = np.broadcast_to(C["foot"], (segments, 3))
        cols.extend(list(c))
    for lo, hi in zip(rows, rows[1:] + rows[:1]):
        for j in range(segments):
            k = (j + 1) % segments
            bm.faces.new((lo[j], lo[k], hi[k], hi[j]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])

    # Vines hanging from the edge down into the cave, with leaves along them.
    vine_cols = []
    for _ in range(40):
        a = rng.uniform(0.0, 2.0 * math.pi)
        j = int(round(a / (2.0 * math.pi) * segments)) % segments
        r = float(edge[j]) + 0.12
        x0, z0 = cx + r * math.cos(a), cz + r * math.sin(a)
        length = rng.uniform(1.5, 6.0)
        sway = rng.uniform(-0.25, 0.25)
        a3 = Vector((x0, -z0, top - 0.05))
        b3 = Vector((x0 - math.cos(a) * 0.3 + sway, -(z0 - math.sin(a) * 0.3), top - 0.05 - length))
        vine = P.segment_bm(a3, b3, 0.04, 0.03, segments=4)
        L.append_bm(bm, vine)
        vine_cols.extend([C["mossDark"]] * len(vine.verts))
        vine.free()
        for t in np.arange(0.25, 1.0, 0.3):
            leaf = L.ellipsoid_bm(a3.lerp(b3, float(t)) + Vector((0.08, 0.0, 0.0)), (0.13, 0.05, 0.09), u=5, v=3)
            L.append_bm(bm, leaf)
            vine_cols.extend([C["moss"]] * len(leaf.verts))
            leaf.free()
    return bm, cols + vine_cols, [round(float(r), 2) for r in edge]
