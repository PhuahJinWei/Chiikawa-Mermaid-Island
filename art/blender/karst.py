"""The island's rock landmarks, after the film's limestone karst.

Every rock here is built the same way: rings of vertices stacked up a wobbly outline. The outline
is an irregular polygon with softened corners, so the stone splits into flat slabs; rain flutes it
with vertical grooves; it steps in or out at a ledge or two, leans a little and rounds off at the
shoulders, its top rim uneven. Pillars and mesas wear a crown of jungle, a mesa's sometimes swelling
into a great mound of trees; sea spires are angular shards; the rocks behind the night beach are
layered. A rock can open an arched cave mouth at its foot, or a notch in its rim for a waterfall.
Colours are painted per vertex: pale stone, darker in the grooves, with streaks running down and
moss hanging from the top.

The cave's skylight is built here too: a round opening in the ground like a well's mouth, its
sides dropping sheer before opening out into a dome over the cave's water.


Rocks are described in game coordinates (x east, z south, y up) and turned into Blender's
(x, -z, y) only as their vertices are made. Angles are measured in the game's x-z plane, from east
toward south.
"""

import math

import bmesh
import numpy as np
from mathutils import Matrix, Vector

import build_props as P
import charlib as L

P_segment = P.segment_bm  # for where `P` names a cliff's points


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
# sea cliffs' bedded sandstone a pale, quiet cream with tan beds, as the film paints them.
STONES = {
    "karst": palette({"stone": "#D5DFE2", "stoneMid": "#BECACF", "groove": "#8B9FAC", "streak": "#AFBDC3"}),
    "headland": palette({"stone": "#D4D1C6", "stoneMid": "#B9B6AB", "groove": "#8C8F8B", "streak": "#A8A9A2"}),
    "sandstone": palette({"stone": "#F0ECDB", "stoneMid": "#DCD2B6", "groove": "#A49E8A", "streak": "#CEC7AB"}),
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
    "groove_paint": 1.0,  # how dark its grooves are painted, and its streaks (less for a stone the
    "streak_paint": 1.0,  # river has worn smooth)
    "wet": None,          # the level of the water its foot stands in, for a dark wet band
    "notch": None,        # (angle, half width, depth): a dip in the top's rim for a waterfall
    "cave": None,         # (angle, half width, height, depth): an arched cave mouth at `wet`
    "tunnel": False,      # the cave mouth opens right through, into a passage built on from its arch
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


def arch_nearest(u, v, half, height):
    """The point of an arch (see arch()) nearest (u, v): on one of its upright sides, or on its rounded
    top."""
    spring = height * 0.45
    k = half / (height - spring)
    side = (math.copysign(half, u), min(max(v, 0.0), spring))
    t = np.linspace(0.0, math.pi, 181)
    tu, tv = half * np.cos(t), spring + (half / k) * np.sin(t)
    i = int(np.argmin((tu - u) ** 2 + (tv - v) ** 2))
    top = (float(tu[i]), float(tv[i]))
    return side if math.hypot(side[0] - u, side[1] - v) <= math.hypot(top[0] - u, top[1] - v) else top


def boundary_loops(bm):
    """The edges of a mesh's holes, each as its points in order round it, in game coordinates (x, y, z)."""
    edges = [e for e in bm.edges if e.is_boundary]
    after = {}
    for e in edges:
        a, b = e.verts
        after.setdefault(a, []).append(b)
        after.setdefault(b, []).append(a)
    loops, seen = [], set()
    for e in edges:
        start = e.verts[0]
        if start in seen:
            continue
        loop, prev, cur = [start], None, start
        seen.add(start)
        while True:
            nxt = next(v for v in after[cur] if v is not prev)
            if nxt is start:
                break
            loop.append(nxt)
            seen.add(nxt)
            prev, cur = cur, nxt
        loops.append([(v.co.x, v.co.z, -v.co.y) for v in loop])
    return loops


def boundary_loop(bm):
    """The edge of a mesh's one hole, as its points in order round it, in game coordinates (x, y, z)."""
    loops = boundary_loops(bm)
    assert len(loops) == 1, f"{len(loops)} holes"
    return loops[0]


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
            if s["tunnel"]:
                # A ring at the floor's level, for the opening's sill.
                spans.append((water, water + cave[2] + 1.2, 0.45))
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
        if cave and s["tunnel"]:
            # The opening goes right through: what was inside the arch over its sill is cut away (below),
            # its edge left on the face for the passage beyond to be built on.
            inside = inside & (Y - water > 1e-4)
        elif cave:
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

        self.mouth_loop = None
        if cave and s["tunnel"]:
            # Cut the opening out (its vertices are kept, unused, so the colours still match them),
            # and keep the edge it leaves, in order round it, in game coordinates.
            bm.verts.index_update()
            cut = [f for f in bm.faces if any(inside.ravel()[v.index] for v in f.verts if v.index < rings * n)]
            bmesh.ops.delete(bm, geom=cut, context="FACES_ONLY")
            # The grid leaves the opening's edge ragged where the arch rounds over; every point of it over
            # the sill goes onto the arch, still on the face.
            for v in {v for e in bm.edges if e.is_boundary for v in e.verts}:
                x, y, z = v.co.x, v.co.z, -v.co.y
                if y - water < 0.01:
                    continue
                mx, mz = self.middle(y)
                u = float(angle_diff(math.atan2(z - mz, x - mx), ac)) * face
                u, h = arch_nearest(u, y - water, half, tall)
                th, yy = ac + u / face, water + h
                r = float(self.radius(np.array([th]), np.array([yy]))[0][0])
                mx, mz = self.middle(yy)
                v.co = (float(mx + r * math.cos(th)), float(-(mz + r * math.sin(th))), float(yy))
            self.mouth_loop = boundary_loop(bm)
        elif cave:
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
        col = mix(col, C["groove"], smoothstep(0.15, 0.7, groove) * s["groove_paint"])
        streak = (0.5 + 0.5 * np.sin(23.0 * theta + p[2])) * (0.5 + 0.5 * np.sin(37.0 * theta + p[3]))
        col = mix(col, C["streak"], smoothstep(0.5, 0.8, streak) * (0.35 + 0.65 * h) * s["streak_paint"])
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


class Block:
    """A block of rock fallen from a cliff, as it lies in a rockfall (see fallen_block): its middle
    (x, z), how high it and whatever lies on it reach (`top`), and, if it lies on the ground, its
    foot's reach round its middle at even angles from east toward south (as Rock.outline), for the
    game to keep walkers out; `s` as a Rock's spec, for what asks one."""

    def __init__(self, cx, cz, top, reach, spec):
        self.cx, self.cz, self.top, self.reach, self.s = cx, cz, top, reach, spec


def fallen_block(rng, centre, radii, ground, stone="karst", facets=(6, 10), lumps=0.08, tilt=0.4, moss=0.35,
                 wet=None, subdivisions=3, cut=(0.62, 0.86), upright=0.6, worn=0, keel=None, patchy=1.0, foot=1.2,
                 damp=(1.0, 0.25)):
    """A block of limestone fallen from a cliff, as it lies in a rockfall: a lumpy egg of `radii`
    (along, across, up) cut flat by a few planes (each `cut` of the way out to its side, a range), as
    limestone splits into slabs, more of them upright than level (`upright`: how little they lean
    from upright, 1 none), then tipped over by up to `tilt` radians and turned; its middle at
    `centre` (game x, y, z). The cuts' edges smoothed off `worn` times, for one the river has worn
    round; below `keel`'s first height (out of sight under water) carried on down to its second, for
    a stone whose foot is in a river's bed. Painted as the rocks are: pale stone in soft bands,
    streaked, darker underneath, moss in patches on what faces up (about `moss` of it, the patches
    `patchy` times as close as on a rockfall's blocks), earthy up to `foot` metres over the ground
    (`ground`: its height at game x, z) and dark where the water at `wet` laps it (from `damp` metres
    over it, fully at the second). Returns (bmesh, colours) in Blender's coordinates, and its
    vertices in the game's as an (n, 3) array."""
    ra, rb, rc = radii
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=subdivisions, radius=1.0)
    p = np.array([v.co[:] for v in bm.verts])
    ph = rng.uniform(0.0, 2.0 * math.pi, 3)
    k = rng.uniform(1.5, 3.0, 3)
    swell = np.sin(k[0] * p[:, 0] + ph[0]) * np.sin(k[1] * p[:, 1] + ph[1]) + 0.6 * np.sin(k[2] * p[:, 2] + ph[2])
    p = p * (1.0 + lumps * swell)[:, None] * np.array([ra, rb, rc])
    for _ in range(int(rng.integers(*facets))):
        n = rng.normal(size=3)
        n[2] *= upright
        n /= np.linalg.norm(n)
        d = math.sqrt((ra * n[0]) ** 2 + (rb * n[1]) ** 2 + (rc * n[2]) ** 2) * rng.uniform(*cut)
        p = p - np.maximum(p @ n - d, 0.0)[:, None] * n[None, :]
    if worn:
        for v, co in zip(bm.verts, p):
            v.co = (float(co[0]), float(co[1]), float(co[2]))
        for _ in range(worn):
            bmesh.ops.smooth_vert(bm, verts=bm.verts[:], factor=0.5, use_axis_x=True, use_axis_y=True, use_axis_z=True)
        p = np.array([v.co[:] for v in bm.verts])
    axis = rng.uniform(0.0, 2.0 * math.pi)
    turn = (Matrix.Rotation(rng.uniform(0.0, 2.0 * math.pi), 3, "Z")
            @ Matrix.Rotation(rng.uniform(0.0, tilt), 3, Vector((math.cos(axis), math.sin(axis), 0.0))))
    p = p @ np.array(turn).T
    cx, cy, cz = centre
    game = np.stack([cx + p[:, 0], cy + p[:, 2], cz - p[:, 1]], axis=1)
    if keel is not None:
        hidden, bottom = keel
        low = float(game[:, 1].min())
        if bottom < low < hidden - 0.02:
            # Under the water it goes on down to the bed as wide as it is just over the keel's top, its
            # sides easing out to that over the first half of what lies under it, not narrowing to a
            # point.
            off = game[:, [0, 2]] - np.array([cx, cz])
            dist = np.hypot(off[:, 0], off[:, 1])
            sector = ((np.arctan2(off[:, 1], off[:, 0]) + math.pi) / (2.0 * math.pi) * 24).astype(int) % 24
            ring = (game[:, 1] >= hidden) & (game[:, 1] < hidden + 0.2)
            wide = np.zeros(24)
            np.maximum.at(wide, sector[ring], dist[ring])
            for _ in range(3):
                wide = np.maximum(wide, 0.97 * np.maximum(np.roll(wide, 1), np.roll(wide, -1)))
            below = game[:, 1] < hidden
            t = smoothstep(0.0, 0.5, (hidden - game[below, 1]) / (hidden - low))
            reach = dist[below] + (np.maximum(wide[sector[below]], dist[below]) - dist[below]) * t
            scale = reach / np.maximum(dist[below], 1e-6)
            game[below, 0] = cx + off[below, 0] * scale
            game[below, 2] = cz + off[below, 1] * scale
            game[below, 1] = hidden - (hidden - game[below, 1]) * (hidden - bottom) / (hidden - low)
    for v, (x, y, z) in zip(bm.verts, game):
        v.co = (float(x), float(-z), float(y))
    bm.normal_update()
    C = {**SHARED, **STONES[stone]}
    q = rng.uniform(0.0, 2.0 * math.pi, 4)
    x, y, z = game.T
    up = np.array([v.normal.z for v in bm.verts])
    band = (0.5 + 0.5 * np.sin(1.1 * x + 0.7 * y + q[0])) * (0.5 + 0.5 * np.sin(0.9 * z - 1.3 * y + q[1]))
    col = mix(np.broadcast_to(C["stone"], (len(x), 3)), C["stoneMid"], smoothstep(0.3, 0.75, band))
    streak = (0.5 + 0.5 * np.sin(5.0 * x + 3.0 * z + q[2])) * (0.5 + 0.5 * np.sin(7.0 * z - 4.0 * x + q[3]))
    col = mix(col, C["streak"], 0.6 * smoothstep(0.55, 0.85, streak))
    col = mix(col, C["groove"], 0.35 * smoothstep(-0.3, -0.8, up))
    # Moss in small patches on its tops, not a cap over each.
    if moss > 0.0:
        patch = 0.5 + 0.5 * np.sin(patchy * (4.1 * x + 1.3 * y) + q[1]) * np.sin(patchy * (3.4 * z - 0.9 * y) + q[2])
        green = mix(np.broadcast_to(C["moss"], (len(x), 3)), C["mossDark"], 0.35 + 0.5 * smoothstep(0.3, 0.7, band))
        col = col + (green - col) * (smoothstep(0.5, 0.85, up) * smoothstep(1.0 - moss - 0.1, 1.0 - moss + 0.1, patch))[:, None]
    col = mix(col, C["foot"], smoothstep(foot, 0.0, y - ground(x, z)))
    if wet is not None:
        col = mix(col, C["wet"], smoothstep(damp[0], damp[1], y - wet))
    return bm, list(col), game


def footprint(game, cx, cz, y0, y1, count=32):
    """How far a block (its vertices in game coordinates) reaches from (cx, cz) between heights y0
    and y1, at `count` even angles from east toward south: the radius of the hull of its vertices in
    that band, or None if none are."""
    band = game[(game[:, 1] >= y0) & (game[:, 1] <= y1)][:, [0, 2]] - np.array([cx, cz])
    if len(band) < 3:
        return None
    pts = sorted(map(tuple, band))
    def half(points):
        out = []
        for pt in points:
            while len(out) >= 2 and ((out[-1][0] - out[-2][0]) * (pt[1] - out[-2][1])
                                     - (out[-1][1] - out[-2][1]) * (pt[0] - out[-2][0])) <= 0.0:
                out.pop()
            out.append(pt)
        return out
    hull = np.array(half(pts)[:-1] + half(pts[::-1])[:-1])
    a, b = hull, np.roll(hull, -1, axis=0)
    reach = []
    for t in np.linspace(0.0, 2.0 * math.pi, count, endpoint=False):
        d = np.array([math.cos(t), math.sin(t)])
        e = b - a
        den = d[0] * e[:, 1] - d[1] * e[:, 0]
        ok = np.abs(den) > 1e-9
        s = np.where(ok, (a[:, 0] * e[:, 1] - a[:, 1] * e[:, 0]) / np.where(ok, den, 1.0), -1.0)
        w = np.where(ok, (a[:, 0] * d[1] - a[:, 1] * d[0]) / np.where(ok, den, 1.0), -1.0)
        hit = ok & (s > 0.0) & (w >= -1e-6) & (w <= 1.0 + 1e-6)
        reach.append(round(float(s[hit].max()) if hit.any() else float(np.max(band @ d)), 2))
    return reach


def grass_cap(rock, rim, seed, overhang=0.22, fringe=(0.16, 0.4), inset=0.15):
    """A mat of grass on a stepping stone's flat top, as the film draws them: lying a little over
    the top's rim and reaching `overhang` past it all round, its edge hanging down in a ragged fringe
    (`fringe`: its tongues' shortest and longest). Returns (bmesh, colours), the mat's height, and
    where to stand on it: radii from the top's middle at 32 even angles from east toward south,
    `inset` in from its edge."""
    rng = np.random.default_rng(seed)
    x, y, z = (np.asarray(v, dtype=float) for v in rim)
    cx, cz = (float(v) for v in rock.middle(rock.top))
    top = float(y.max()) + 0.05
    theta = np.arctan2(z - cz, x - cx)
    reach = np.hypot(x - cx, z - cz) + overhang
    n = len(x)
    bm = bmesh.new()
    hub = bm.verts.new((cx, -cz, top + 0.03))
    edge = [bm.verts.new((float(cx + r * math.cos(a)), float(-(cz + r * math.sin(a))), top)) for r, a in zip(reach, theta)]
    hang = []
    for i, (r, a) in enumerate(zip(reach, theta)):
        # Long and short tongues in turn, each a little different.
        drop = rng.uniform(*fringe) * (1.0 if i % 2 == 0 else 0.5)
        out = r + 0.05
        hang.append(bm.verts.new((float(cx + out * math.cos(a)), float(-(cz + out * math.sin(a))), top - drop)))
    middle = Vector((cx, -cz, top))
    for i in range(n):
        j = (i + 1) % n
        face = bm.faces.new((hub, edge[i], edge[j]))
        face.normal_update()
        if face.normal.z < 0.0:
            face.normal_flip()
        face = bm.faces.new((edge[i], hang[i], hang[j], edge[j]))
        face.normal_update()
        out = face.calc_center_median() - middle
        out.z = 0.0
        if face.normal.dot(out) < 0.0:
            face.normal_flip()
    cols = [SHARED["leaves"]] + [SHARED["leaves"] + (SHARED["leavesMid"] - SHARED["leaves"]) * 0.4] * n
    cols += [SHARED["leavesDark"]] * n
    angles = np.linspace(0.0, 2.0 * math.pi, 32, endpoint=False)
    stand = np.interp(np.where(angles > math.pi, angles - 2.0 * math.pi, angles), theta[np.argsort(theta)],
                      reach[np.argsort(theta)], period=2.0 * math.pi) - inset
    return bm, cols, top, [round(float(r), 3) for r in stand]


def crown(rock, rim, gap=None, size=None, target=1200, mound=1.0, hang=0.35):
    """Jungle on a rock's top: blobs along the rim, leaning out over it, mounded over the middle
    and spilling a little down the sides, each heaped of rounded leafy lobes as the film paints
    the jungle on its rocks (never one smooth dome), fused into one mass. `gap` (angle, half width)
    leaves the rim bare where a waterfall pours; `size` overrides the top's radius, for a tuft on
    a pointed spire; `mound` swells the middle into a great dome of trees (1: a gentle mound);
    `hang` is how often a clump hangs over the edge."""
    rng = np.random.default_rng(rock.seed + 100)
    x, y, z = rim
    cx, cz = (float(v) for v in rock.middle(rock.top))
    top = rock.top
    size = size or float(np.mean(np.hypot(x - cx, z - cz)))
    voxel = max(0.08, size * 0.035)
    blobs, heads = [], []
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
        heads.append((c, r, r * 0.8, 7))
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
        heads.append((c, r, r * 0.75 * mound ** 0.25, 13))
    if mound >= 2.0:
        # A great mound is a broad cap of greenery over the whole top, overhanging its edge all round,
        # as the film's dome sits on its block of stone.
        c = Vector((cx, -cz, top + size * 0.22))
        blobs.append(L.ellipsoid_bm(c, (size * 1.12, size * 1.12, size * 0.55), u=20, v=12))
        heads.append((c, size * 1.12, size * 0.55, 18))
    # Each clump heaped of lobes standing out of its surface over its top and round its sides, from
    # a generator of their own so the clumps stand where they did.
    lob = np.random.default_rng(rock.seed + 300)
    for c, r, rz, count in heads:
        for k in range(count):
            a = 2.0 * math.pi * k / count + lob.uniform(-0.4, 0.4)
            up = lob.uniform(0.0, 0.95)
            out_by = math.sqrt(max(1.0 - up * up, 0.0))
            rr = r * lob.uniform(0.24, 0.36)
            p = c + Vector((math.cos(a) * out_by * r, math.sin(a) * out_by * r, up * rz)) * lob.uniform(0.82, 0.95)
            blobs.append(L.ellipsoid_bm(p, (rr, rr, rr * 0.85), u=9, v=6))
    bm = L.fuse(blobs, voxel=voxel, smooth_iterations=3, smooth_lambda=0.7, target_tris=int(target * 1.6))
    bm.normal_update()
    cols = []
    for v in bm.verts:
        up = v.normal.z
        n = 0.5 + 0.5 * math.sin(v.co.x * 0.45 + rock.seed) * math.sin(v.co.y * 0.38 - rock.seed)
        c = SHARED["leavesMid"] + (SHARED["leaves"] - SHARED["leavesMid"]) * float(smoothstep(0.3, 0.9, up))
        c = c + (SHARED["leavesDark"] - c) * float(max(smoothstep(0.1, -0.6, up), 0.45 * smoothstep(0.55, 0.85, n)))
        cols.append(c)
    return bm, cols


def waterfall(rock, level, rows=20, thickness=0.45, out=None):
    """The waterfall: a band of water pouring over the notch in a rock's rim and falling clear of
    its face into the water at `level`, thick enough to carry the pen's outline: straight out from
    the rock's middle, or the way `out` (an angle, as the notch's). UVs run across (u) and down (v),
    for the game's flowing streaks."""
    an, half, depth = rock.s["notch"]
    lip = rock.top - depth
    face_lip = float(rock.radius(np.array([an]), np.array([lip]))[0][0])
    reach = face_lip
    for y in np.linspace(level - 0.6, lip, 24):
        angles = np.array([an + d / face_lip for d in (-half, 0.0, half)])
        reach = max(reach, float(rock.radius(angles, np.full(3, y))[0].max()))
    lip_at = np.array([rock.cx, rock.cz]) + np.array([math.cos(an), math.sin(an)]) * face_lip
    out_dir = np.array([math.cos(an if out is None else out), math.sin(an if out is None else out)])
    side = np.array([-out_dir[1], out_dir[0]])
    bottom_y = level - 0.6
    # Water leaving the lip falls in an arc: out from the face as the root of how far it has
    # dropped, quickly enough to clear the face below.
    throw = max(2.0, (reach - face_lip + 0.5) / math.sqrt(0.15))
    path = [(-1.2, lip + 0.3, 0.0)]
    for i in range(rows + 1):
        s = i / rows
        path.append((0.25 + throw * math.sqrt(s), lip + 0.15 - (lip + 0.15 - bottom_y) * s, s))
    bm = bmesh.new()
    uv = []
    grid = []
    for ahead, y, s in path:
        w = 2.0 * half * 0.75 * (1.0 + 0.3 * s)
        c = lip_at + out_dir * ahead
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
    foot = lip_at + out_dir * (0.25 + throw)
    return bm, uv, (float(foot[0]), float(foot[1]))


def ribbon_bm(points, side, out, width, thick):
    """A thin blade hanging down `points`, `width` across (along `side`) and `thick` deep (along
    `out`), narrowing toward its end: a closed solid, so it can carry the pen's outline."""
    bm = bmesh.new()
    rows = []
    for k, p in enumerate(points):
        w = width * (1.0 - 0.6 * (k / (len(points) - 1)) ** 2)
        rows.append([bm.verts.new(p + side * (sx * w / 2) + out * (sz * thick / 2))
                     for sx, sz in ((-1, 1), (1, 1), (1, -1), (-1, -1))])
    for a, b in zip(rows, rows[1:]):
        for k in range(4):
            bm.faces.new((a[k], a[(k + 1) % 4], b[(k + 1) % 4], b[k]))
    bm.faces.new(rows[0])
    bm.faces.new(list(reversed(rows[-1])))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    return bm


VINE = palette({"stem": "#5E7A3A", "leaf": "#8CC24E", "leafMid": "#6FAE3F", "leafDark": "#4F8A3A",
                "curtain": "#7DB847", "curtainDark": "#4E8B38"})


def vines(rock, around, count, seed, avoid=None, curtains=0):
    """Vines hanging from a rock's rim down its face, as in the film's jungle waterfall: strands
    lying a hand's breadth out from the stone, thick with leaves, some reaching most of the way
    down; and `curtains` of hanging moss, blades close together falling from the rim in a sheet,
    longest in the middle. `around` is (angle, half arc in metres) of the face they hang on; `avoid`
    (angle, half width) keeps them clear of a waterfall. Returns (bmesh, colours)."""
    rng = np.random.default_rng(seed)
    an, arc = around
    face = float(rock.radius(np.array([an]), np.array([rock.top - 1.0]))[0][0])
    bm = bmesh.new()
    cols = []
    height = rock.top - rock.foot
    top = rock.top - rock.s["rim"] * min(rock.rx, rock.rz) * 0.5 - 0.3

    def clear(a, room):
        return not (avoid and abs(float(angle_diff(a, avoid[0]))) * face < avoid[1] + room)

    def hang(a, length, off=0.12, sway=0.15, step=1.2):
        ys = np.linspace(top, top - length, max(4, int(length / step) + 1))
        r = rock.radius(np.full(len(ys), a), ys)[0] + off * (1.0 + 1.5 * np.linspace(0.0, 1.0, len(ys)) ** 2)
        mx, mz = rock.middle(ys)
        bend = rng.uniform(-sway, sway) * np.linspace(0.0, 1.0, len(ys)) ** 2
        return [Vector((float(mx[i] + r[i] * math.cos(a + bend[i] / face)),
                        float(-(mz[i] + r[i] * math.sin(a + bend[i] / face))), float(ys[i]))) for i in range(len(ys))]

    made = 0
    for _ in range(count * 3):
        if made >= count:
            break
        a = an + rng.uniform(-arc, arc) / face
        if not clear(a, 1.0):
            continue
        made += 1
        pts = hang(a, height * rng.uniform(0.2, 0.85) ** 0.7)
        thick = rng.uniform(0.03, 0.05)
        for p, q in zip(pts, pts[1:]):
            seg = P.segment_bm(p, q, thick, thick * 0.9, segments=4)
            L.append_bm(bm, seg)
            cols.extend([VINE["stem"]] * len(seg.verts))
            seg.free()
        # Leaves down the strand in bunches, thinning out toward its end.
        out = Vector((math.cos(a), -math.sin(a), 0.0))
        side = Vector((math.sin(a), math.cos(a), 0.0))
        for t in np.arange(rng.uniform(0.0, 0.05), 1.0, rng.uniform(0.035, 0.06)):
            if rng.random() < t * 0.5:
                continue
            k = t * (len(pts) - 1)
            i = min(int(k), len(pts) - 2)
            c = pts[i].lerp(pts[i + 1], k - i) + out * 0.05 + side * rng.uniform(-0.14, 0.14)
            size = rng.uniform(0.12, 0.22)
            leaf = L.ellipsoid_bm(c, (size, size * 0.35, size * 0.65), u=4, v=3)
            L.append_bm(bm, leaf)
            cols.extend([VINE[("leaf", "leafMid", "leafDark")[int(rng.integers(0, 3))]]] * len(leaf.verts))
            leaf.free()

    # Curtains of hanging moss. Where blades overlap at their top ends (neighbours in a curtain, and
    # curtains running into one another), each end lies at a depth of its own, 5 mm a step, so no two
    # of them lie in one plane, flickering.
    hung, ends = 0, []
    for _ in range(curtains * 6):
        if hung >= curtains:
            break
        a0 = an + rng.uniform(-arc, arc) / face
        width = rng.uniform(1.2, 2.6)
        if not clear(a0, width / 2 + 1.5):
            continue
        hung += 1
        reach = height * rng.uniform(0.35, 0.7)
        blades = max(5, int(width / 0.17))
        for b in range(blades):
            u = b / (blades - 1) - 0.5
            a = a0 + u * width / face
            length = reach * (0.7 + 0.3 * math.cos(math.pi * u)) * rng.uniform(0.75, 1.1)
            pts = hang(a, length, off=0.16, sway=0.08, step=0.7)
            out = Vector((math.cos(a), -math.sin(a), 0.0))
            side = Vector((math.sin(a), math.cos(a), 0.0))
            w = rng.uniform(0.15, 0.24)
            taken = {s for (x, y, r), s in ends if math.hypot(pts[0].x - x, pts[0].y - y) < r + w / 2 + 0.05}
            level = next(s for s in range(len(ends) + 1) if s not in taken)
            ends.append(((pts[0].x, pts[0].y, w / 2), level))
            pts[0] = pts[0] - Vector((0.0, 0.0, 0.005 * level))
            blade = ribbon_bm(pts, side, out, w, 0.05)
            colour = mix(VINE["curtain"], VINE["curtainDark"], rng.uniform(0.0, 0.7))
            for v in blade.verts:
                below = float(np.clip((top - v.co.z) / max(length, 1e-3), 0.0, 1.0))
                cols.append(colour + (VINE["curtainDark"] - colour) * (0.5 * below))
            L.append_bm(bm, blade)
            blade.free()
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


def cliff(points, normals, tops, water, seed, base=-4.5, lip=2.6, column=1.2, stone="sandstone", stand=1.6,
          jut=1.0, row=0.7, beds=(0.7, 2.0), joints=(3.5, 9.0), strands=None, floor=None):
    """Sea cliffs of bedded sandstone along a stretch of coast, after the film's frame of them:
    `points` (x, z) along the foot of the face at the water, each with its outward normal (x, z) and
    the height of the land on top. The face rises from below the water at `base`, stepped in and
    out by level beds of stone and split into blocks by upright joints, leaning back a little; it
    rounds over at the top into a lip of turf `lip` metres inland, then goes back down into the
    ground. A closed solid, for the pen. Painted in bands bed by bed, darker in the joints and the
    hollows, streaked from the top, greenery hanging over the edge in tongues, wet where the sea
    laps. Returns (bmesh, colours) and, apart, the greenery growing down the face of the tall cliffs
    as on the film's (see below), as (bmesh, colours).

    The same makes the white limestone cliffs round the tableland and down its gorge: another
    `stone`, its face standing `stand` metres out from the points (1.6 for the sea cliffs), its
    beds jutting `jut` times as far, rows every `row` metres up it, beds and joints (upright
    cracks) as far apart as `beds` and `joints` say. Where `strands` (one weight a point, 0 to 1)
    says, vines hang in strands from its lip down toward the ground at its foot (`floor`), with
    the greenery (see cliff_strands)."""
    rng = np.random.default_rng(seed)
    C = {**SHARED, **STONES[stone]}
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
    bed_gap, joint_gap = beds, joints
    beds, y = [], base
    while y < T.max() + 1.0:
        beds.append(y)
        y += rng.uniform(*bed_gap)
    beds.append(y)
    jut_scale = jut
    jut = rng.uniform(-0.6, 0.6, len(beds)) * jut_scale
    shade = rng.choice([0.0, 0.0, 0.45, 0.8, 1.0], len(beds))
    # Upright joints split the face into blocks, each standing in or out.
    joints = [0.0]
    while joints[-1] < u[-1]:
        joints.append(joints[-1] + rng.uniform(*joint_gap))
    block_jut = rng.uniform(-0.9, 0.7, len(joints) + 1) * jut_scale
    streak_p = rng.uniform(0.0, 2.0 * math.pi, 3)
    hang = 0.6 + 2.6 * rng.uniform(0.0, 1.0, len(u)) ** 2
    hang = np.convolve(hang, np.ones(3) / 3.0, mode="same")
    # Rows at fixed heights, with a pair at every bed's edge so the steps stay crisp; any row above a
    # column's top folds down onto it.
    levels = sorted({base, water - 0.9, water - 0.25, water + 0.3, *np.arange(base, T.max() + 0.7, row),
                     *[b + d for b in beds for d in (-0.05, 0.05)]})
    levels = np.array([v for v in levels if base <= v <= T.max() - 0.6])

    def face_offset(i, y):
        """How far the face stands out to sea from the coast's point at column i, height y."""
        k = np.clip(np.searchsorted(beds, y) - 1, 0, len(beds) - 1)
        j = int(np.searchsorted(joints, u[i]))
        d_joint = min(abs(u[i] - joints[max(j - 1, 0)]), abs(u[i] - joints[min(j, len(joints) - 1)]))
        crack = -1.1 * jut_scale * (1.0 - smoothstep(0.25, 0.75, d_joint))
        return stand + jut[k] + block_jut[j] + crack - 0.02 * (np.asarray(y) - water), k, d_joint

    bm = bmesh.new()
    grid, cols = [], []
    for i in range(len(u)):
        top = T[i]
        # Its bottom, deep in the ground, a little lower column by column (5 mm, over again every
        # eight): where the face turns a corner tighter than the lip is deep, the bottom folds over
        # itself, and in one plane its faces there would flicker.
        sink = 0.005 * (i % 8)
        ys = list(np.minimum(levels, top - 0.6)) + [top - 0.3, top - 0.1, top]
        ys[0] -= sink
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
        ring.append(bm.verts.new((float(p[0]), float(-p[1]), float(base - sink))))
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
    # The greenery along the top of the tall cliffs is leafy clumps of its own (see cliff_tufts), for
    # the leaves' painting. The round shrubs that stood there in a row are gone, but their draws are
    # still made, so the greenery down the face grows as it did.
    stretch = 12.0
    for s0 in np.arange(0.0, u[-1], stretch):
        for d in np.arange(s0 + rng.uniform(0.0, 1.0), min(s0 + stretch, u[-1]), rng.uniform(1.1, 1.7)):
            i = min(int(round(d / column)), len(u) - 1)
            if T[i] < water + 11.0:
                continue
            rng.uniform(0.55, 1.15)
            if rng.random() < 0.4:
                rng.uniform(0.5, 1.4)
    tufts, tuft_cols = cliff_tufts(np.random.default_rng(seed + 1000), u, P, N, T, face_offset, water, column)
    greens, ledges = cliff_greens(rng, u, P, N, T, beds, face_offset, water, column, np.random.default_rng(seed + 2000))
    if strands is not None:
        weight = np.interp(u, along, np.asarray(strands, dtype=float))
        sb, sc = cliff_strands(np.random.default_rng(seed + 3000), u, P, N, T, face_offset, weight, floor, column)
        L.append_bm(greens[0], sb)
        greens[1].extend(sc)
        sb.free()
    # The clumps on the ledges come apart from the bushes along the top: painted in puffs as those are,
    # but smaller puffs (see Landmarks.ts), as the crowns' big ones ate these small cushions into tatters.
    return bm, cols, greens, (tufts, tuft_cols), ledges


def cliff_strands(rng, u, P, N, T, face_offset, weight, floor, column):
    """Vines hanging from a cliff's lip in strands, as down the wall over the film's riverside path
    (`river below parkour stone landmark 1`): every metre or few where `weight` (one a column) holds,
    each lying a hand's breadth out from the face's outermost stone above it, so it drapes over the
    beds' steps, a little swaying, thick with leaves near the top and thinning out toward its end,
    which comes most of the way down toward the ground at the foot (`floor`). Returns (bmesh,
    colours); their own generator, so the rest of the greenery hangs as it did."""
    bm, cols = bmesh.new(), []
    s = rng.uniform(0.0, 2.0)
    while s < u[-1]:
        i = min(int(round(s / column)), len(u) - 1)
        s += rng.uniform(1.0, 3.2)
        if weight[i] < 0.5 or T[i] < floor + 3.0:
            continue
        top = T[i] - 0.2
        length = (top - floor) * rng.uniform(0.35, 0.92)
        rows = max(5, int(length / 0.4) + 1)
        tangent = np.array([N[i][1], -N[i][0]])
        sway = rng.uniform(-0.35, 0.35)
        pts, reach = [], face_offset(i, top - 0.6)[0] - 0.3
        for r in range(rows):
            f = r / (rows - 1)
            y = top - length * f
            if r > 0:
                reach = max(reach, face_offset(i, y)[0] + 0.14)
            p = P[i] + N[i] * (reach + 0.04 * f) + tangent * (sway * f * f)
            pts.append(Vector((float(p[0]), float(-p[1]), float(y))))
        thick = rng.uniform(0.02, 0.035)
        for a, b in zip(pts, pts[1:]):
            seg = P_segment(a, b, thick, thick * 0.85, segments=4)
            L.append_bm(bm, seg)
            cols.extend([VINE["stem"]] * len(seg.verts))
            seg.free()
        out = Vector((float(N[i][0]), float(-N[i][1]), 0.0))
        side = Vector((float(tangent[0]), float(-tangent[1]), 0.0))
        for t in np.arange(rng.uniform(0.0, 0.04), 1.0, rng.uniform(0.03, 0.05)):
            if rng.random() < t * 0.55:
                continue
            k = t * (len(pts) - 1)
            j = min(int(k), len(pts) - 2)
            c = pts[j].lerp(pts[j + 1], k - j) + out * 0.05 + side * rng.uniform(-0.13, 0.13)
            size = rng.uniform(0.11, 0.2) * (1.0 - 0.3 * t)
            leaf = L.ellipsoid_bm(c, (size, size * 0.35, size * 0.65), u=4, v=3)
            L.append_bm(bm, leaf)
            cols.extend([VINE[("leaf", "leafMid", "leafDark")[int(rng.integers(0, 3))]]] * len(leaf.verts))
            leaf.free()
    return bm, cols


def cliff_tufts(rng, u, P, N, T, face_offset, water, column):
    """Greenery along the top of the tall cliffs, as on the film's (`parkour stone landmark 3`, `sea
    cliffs`): bushes of every size, in clumps of a few to a dozen along the edge with grass between,
    some set back from it, some leaning out to spill over it, an odd big one; each heaped of rounded
    leafy lobes as the jungle on the rocks' tops is (see crown), never a smooth ball, fused a clump at
    a time. Low cliffs keep a clear grassy edge. The cliff's columns (`u` along the coast, P and N
    their foot and outward normal, T the land's height on top) and how far its face stands out
    (`face_offset`) say where. Returns (bmesh, colours), for the rocks' crowns."""
    leaves, mid_leaf, dark = SHARED["leaves"], SHARED["leavesMid"], SHARED["leavesDark"]
    out, cols = bmesh.new(), []
    s = rng.uniform(0.0, 5.0)
    while s < u[-1]:
        run = rng.uniform(3.0, 13.0)
        blobs, bushes = [], 0
        d = s
        while d < min(s + run, u[-1]):
            i = min(int(round(d / column)), len(u) - 1)
            step = rng.uniform(0.7, 1.7)
            if T[i] >= water + 11.0:
                big = rng.random() < 0.12
                r = rng.uniform(1.25, 1.85) if big else rng.uniform(0.4, 1.1)
                spill = not big and rng.random() < 0.3
                edge = face_offset(i, T[i] - 0.6)[0]
                off = edge - (rng.uniform(-0.15, 0.3) if spill else rng.uniform(0.5, 2.8) + 0.4 * r)
                p = P[i] + N[i] * off
                y = T[i] - (rng.uniform(0.25, 0.9) * r if spill else -0.15 * r)
                centre = Vector((float(p[0]), float(-p[1]), float(y)))
                rz = r * rng.uniform(0.7, 0.9)
                blobs.append(L.ellipsoid_bm(centre, (r, r, rz), u=12, v=8))
                # Its lobes over its top and round its sides, the film's way of painting a bush.
                count = 5 + int(round(r * 5.0))
                for k in range(count):
                    a = 2.0 * math.pi * k / count + rng.uniform(-0.45, 0.45)
                    up = rng.uniform(0.0, 0.95)
                    side = math.sqrt(max(1.0 - up * up, 0.0))
                    rr = r * rng.uniform(0.28, 0.42)
                    at = centre + Vector((math.cos(a) * side * r, math.sin(a) * side * r, up * rz)) * rng.uniform(0.8, 0.95)
                    blobs.append(L.ellipsoid_bm(at, (rr, rr, rr * 0.85), u=8, v=6))
                bushes += 1
            d += step
        if blobs:
            clump = L.fuse(blobs, voxel=0.09, smooth_iterations=3, smooth_lambda=0.7, target_tris=140 * bushes)
            clump.normal_update()
            for v in clump.verts:
                up = v.normal.z
                n = 0.5 + 0.5 * math.sin(v.co.x * 0.9 + 1.3) * math.sin(v.co.y * 0.75 - 0.4)
                c = mid_leaf + (leaves - mid_leaf) * float(smoothstep(0.3, 0.9, up))
                cols.append(c + (dark - c) * float(max(smoothstep(0.1, -0.6, up), 0.4 * smoothstep(0.55, 0.85, n))))
            L.append_bm(out, clump)
            clump.free()
        s += run + rng.uniform(2.0, 9.0)
    return out, cols


def cliff_greens(rng, u, P, N, T, beds, face_offset, water, column, lobes):
    """Greenery down the face of the tall sea cliffs, as on the film's: leafy clumps sitting on the
    ledges where a bed of stone juts out past the one above it, and curtains of creepers hanging
    over the lip, straight down past the beds' steps, their lower edge ragged. The cliff's columns
    (`u` along the coast, P and N their foot and outward normal, T the land's height on top),
    its beds and how far its face stands out (`face_offset`) say where; `lobes`, a generator of the
    clumps' own, shapes them. Returns the curtains and, apart, the clumps, each as (bmesh, colours),
    the clumps heaped of lobes as the bushes along the top are (see cliff_tufts)."""
    leaves, mid_leaf, dark = SHARED["leaves"], SHARED["leavesMid"], SHARED["leavesDark"]
    out, cols = bmesh.new(), []
    # Clumps on the ledges, along each ledge in runs with bare stone between (a slow wave along it
    # says where), never one tuft after another all along it as they had been: where a ledge holds a
    # run, its tufts fuse into one leafy cushion heaped of rounded lobes, some spilling over its lip.
    # Their places are drawn as the round tufts' were, so the curtains after them hang where they did.
    phase = lobes.uniform(0.0, 2.0 * math.pi, 2)
    ledges = {}
    for i in range(0, len(u), 2):
        top = T[i]
        if top < water + 8.0:
            continue
        for k in range(1, len(beds) - 1):
            y = beds[k]
            if y < water + 1.2 or y > top - 1.2:
                continue
            lower = face_offset(i, y - 0.1)[0]
            upper = face_offset(i, y + 0.1)[0]
            if lower - upper < 0.2 or rng.random() > 0.75:
                continue
            r = rng.uniform(0.5, 1.0)
            wave = math.sin(u[i] * 0.23 + k * 1.7 + phase[0]) * math.sin(u[i] * 0.071 + k * 0.9 + phase[1])
            if wave < -0.4:
                continue
            ledges.setdefault(k, []).append((i, y, r, 0.5 * (lower + upper), lower))
    clumps, clump_cols = bmesh.new(), []
    for k, spots in ledges.items():
        run = []
        for n, spot in enumerate(spots):
            run.append(spot)
            last = n == len(spots) - 1
            if last or u[spots[n + 1][0]] - u[spot[0]] > 4.0:
                blobs = []
                for i, y, r, mid, lower in run:
                    p = P[i] + N[i] * mid
                    centre = Vector((float(p[0]), float(-p[1]), float(y + r * 0.2)))
                    rx, rz = r * lobes.uniform(1.0, 1.35), r * lobes.uniform(0.6, 0.8)
                    blobs.append(L.ellipsoid_bm(centre, (rx, rx, rz), u=10, v=6))
                    for j in range(4 + int(round(r * 4.0))):
                        a = 2.0 * math.pi * j / (4 + int(round(r * 4.0))) + lobes.uniform(-0.5, 0.5)
                        up = lobes.uniform(0.1, 0.9)
                        side = math.sqrt(max(1.0 - up * up, 0.0))
                        rr = r * lobes.uniform(0.3, 0.45)
                        at = centre + Vector((math.cos(a) * side * rx, math.sin(a) * side * rx, up * rz)) * lobes.uniform(0.8, 0.95)
                        blobs.append(L.ellipsoid_bm(at, (rr, rr, rr * 0.8), u=8, v=5))
                    if lobes.random() < 0.35:
                        # Spilling over the ledge's lip a little way down the face.
                        q = P[i] + N[i] * (lower + 0.1)
                        rh = r * lobes.uniform(0.35, 0.5)
                        blobs.append(L.ellipsoid_bm(Vector((float(q[0]), float(-q[1]), float(y - rh * 0.6))),
                                                    (rh, rh, rh * 1.2), u=8, v=5))
                clump = L.fuse(blobs, voxel=0.08, smooth_iterations=3, smooth_lambda=0.7, target_tris=120 * len(run))
                clump.normal_update()
                for v in clump.verts:
                    up_n = v.normal.z
                    shade = 0.5 + 0.5 * math.sin(v.co.x * 1.1 + 0.7) * math.sin(v.co.y * 0.9 - 1.2)
                    c = mid_leaf + (leaves - mid_leaf) * float(smoothstep(0.3, 0.9, up_n))
                    clump_cols.append(c + (dark - c) * float(max(smoothstep(0.1, -0.6, up_n), 0.4 * smoothstep(0.55, 0.85, shade))))
                L.append_bm(clumps, clump)
                clump.free()
                run = []
    # Curtains of creepers over the lip, hanging straight down from the face's outermost point
    # above, so they drape over the beds' steps rather than following them in.
    s0 = rng.uniform(0.0, 3.0)
    while s0 < u[-1] - 1.0:
        i0 = int(s0 / column)
        width = rng.uniform(1.2, 3.4)
        span = [min(i0 + c, len(u) - 1) for c in range(max(2, int(round(width / column)) + 1))]
        if min(T[c] for c in span) >= water + 9.0:
            length = rng.uniform(2.0, 6.5)
            rows = int(length / 0.5) + 1
            grid = []
            for c in span:
                drop = length * (0.5 + 0.5 * rng.random())
                ring, reach = [], -1e9
                for r in range(rows):
                    y = T[c] - 0.15 - drop * r / (rows - 1)
                    reach = max(reach, face_offset(c, y)[0])
                    p = P[c] + N[c] * (reach + 0.12)
                    ring.append(out.verts.new((float(p[0]), float(-p[1]), float(y))))
                    tone = r / (rows - 1)
                    shade = 0.5 + 0.5 * math.sin(u[c] * 2.1 + y * 1.3)
                    cols.append(mix(mix(leaves, mid_leaf, shade * 0.6), dark, 0.15 + 0.55 * tone))
                grid.append(ring)
            outward = Vector((float(N[span[0]][0]), float(-N[span[0]][1]), 0.0))
            for a, b in zip(grid, grid[1:]):
                for r in range(rows - 1):
                    face = out.faces.new((a[r], a[r + 1], b[r + 1], b[r]))
                    face.normal_update()
                    if face.normal.dot(outward) < 0.0:
                        face.normal_flip()
        s0 += rng.uniform(3.0, 7.5)
    return (out, cols), (clumps, clump_cols)


def skylight_edge(radius, lumps, theta):
    """How far the cave skylight's edge lies from its middle toward the angles `theta` (from east
    toward south): round, wandering out and in by a few waves (how many times round, how far as a
    share of the radius, where each starts)."""
    theta = np.asarray(theta, dtype=float)
    return radius * (1.0 + sum(amp * np.sin(k * theta + phase) for k, amp, phase in lumps))


def skylight(centre, radius, lumps, ground, water, floor, seed, shaft=3.8, dome=10.5, segments=96, doors=()):
    """The cave's skylight, after the film's frames looking down into it and up out of it and the
    user's sketch of it: a round opening in the jungle floor like a well's mouth, the ground running
    right to its edge (build_island cuts the opening out of the ground at the same `segments`
    angles), where a worn lip of stone rounds over a hand's breadth above it. Its sides drop sheer,
    fluted and bedded and leaning in a little, so they show from above as a well's do, `shaft`
    metres below the ground, then open out into the cave: a dome over the water reaching about
    `dome` metres from the middle at the water, its floor at `floor` under it. Moss hangs over the
    edge in tongues and vines down the well, some on past its foot into the cave. The lip follows
    the ground round (`ground(x, z)`: its height). A closed solid: the cave's inside, the rest shut
    away under the ground; but for each of `doors` (angle, half width, top), a doorway cut in the
    dome's wall toward that angle, from under the water up to `top`, for the cave's sea to come in by
    and run on by, and on through the solid's hidden outer wall behind it. Returns (the rock's bmesh,
    its colours, the vines' bmesh, their colours, each doorway's edge in order round it in game
    coordinates)."""
    rng = np.random.default_rng(seed)
    C = {**SHARED, **STONES["karst"]}
    cx, cz = centre
    # Round the solid at twice the angles the ground's opening is cut at (every other one of them the same),
    # so the dome's folds have the vertices to show.
    fine = 2 * segments
    theta = np.linspace(0.0, 2.0 * math.pi, fine, endpoint=False)
    cos, sin = np.cos(theta), np.sin(theta)
    p = rng.uniform(0.0, 2.0 * math.pi, 14)

    def wave(k, phase):
        return 0.5 + 0.5 * np.sin(k * theta + phase)

    def ground_at(r):
        return np.asarray(ground(cx + r * cos, cz + r * sin), dtype=float)

    edge = skylight_edge(radius, lumps, theta)
    # The lip: how high its stone stands above the ground, and how far out it runs on under it.
    bump = 0.1 + 0.14 * wave(4, p[0]) * wave(7, p[1])
    under = 0.45 + 0.6 * wave(3, p[2])
    # The well's sides: rain flutes, broad unevenness and two beds where they step in and out, all
    # coming in from under the lip; a lean in going down.
    warp = theta + 0.25 * np.sin(3.0 * theta + p[3])
    groove = (0.5 + 0.5 * np.cos(17.0 * warp + p[4])) ** 4
    top = ground_at(edge) - 0.18
    foot = float(np.mean(top + 0.18)) - shaft

    # Its two beds wander up and down round it, as the rock's layers do, so that from below they show as
    # its layers, not as rings.
    bed1 = 0.355 + 0.07 * np.sin(2.0 * theta + p[3]) + 0.03 * np.sin(7.0 * theta + p[8])
    bed2 = 0.705 + 0.06 * np.sin(3.0 * theta + p[9]) + 0.03 * np.sin(8.0 * theta + p[11])

    def wall(t):
        """The well's side `t` of the way down it (0 under the lip, 1 at its foot): how far from
        the middle at each angle, and how high."""
        rough = smoothstep(0.0, 0.25, t)
        r = (edge - 0.06 - 0.3 * t
             + rough * ((0.1 + 0.08 * t) * groove
                        + 0.09 * np.sin(2.0 * theta + p[5] + 2.5 * t) * np.sin(5.0 * theta + p[6] - 1.5 * t))
             - 0.08 * smoothstep(bed1 - 0.03, bed1 + 0.03, t) + 0.12 * smoothstep(bed2 - 0.03, bed2 + 0.03, t))
        return r, top + (foot + 0.35 - top) * t

    r_foot = wall(1.0)[0]
    # The dome: an uneven vault from the well's foot down to the water, pocketed.
    reach = dome * (1.0 + 0.05 * np.sin(2.0 * theta + p[7]) + 0.03 * np.sin(5.0 * theta + p[8]))
    r0, y0 = r_foot + 0.75, foot - 0.2
    phi0 = np.arcsin(r0 / reach)
    rise = (y0 - water) / np.cos(phi0)

    # The dome's rock, as the film's (`cave interior 4`): hanging in folds down the vault, ridges of every
    # width side by side, each from high under the vault down to its own end, some on into the water, some
    # stopping short of it in a rounded lobe; a few broad masses standing out from the wall into the water,
    # rounding over at their tops; and dark hollows in it at the water's edge. Plain round each doorway,
    # where the sea has worn it.
    def arc(a):
        """Each angle's way round the dome's wall from the angle `a`, in metres at the water."""
        return angle_diff(theta, a) * dome

    n_folds = 76
    folds = list(zip((np.arange(n_folds) + rng.uniform(-0.35, 0.35, n_folds)) * 2.0 * math.pi / n_folds,
                     rng.uniform(0.35, 1.05, n_folds), rng.uniform(0.25, 0.65, n_folds),
                     np.where(rng.random(n_folds) < 0.4, rng.uniform(-0.8, -0.1, n_folds), rng.uniform(0.5, 3.0, n_folds)),
                     rng.uniform(0.0, 2.0 * math.pi, n_folds)))
    masses = list(zip(rng.uniform(0.0, 2.0 * math.pi, 7), rng.uniform(1.0, 2.1, 7), rng.uniform(0.55, 1.2, 7),
                      rng.uniform(1.6, 4.2, 7)))
    hollows = list(zip(rng.uniform(0.0, 2.0 * math.pi, 6), rng.uniform(0.6, 1.3, 6), rng.uniform(0.4, 0.8, 6),
                       rng.uniform(1.0, 2.2, 6)))
    plain = np.ones(fine)
    for a, half, _ in doors:
        plain = np.minimum(plain, smoothstep(half + 0.3, half + 1.6, np.abs(arc(a))))

    def bell(s, half):
        return np.where(np.abs(s) < half, np.cos(0.5 * math.pi * np.clip(s / half, -1.0, 1.0)) ** 2, 0.0)

    def relief(y):
        """How far the dome's wall stands in from its round (less than 0) or goes back into the rock
        (more) at the heights `y` (one, or one for each angle), at each angle."""
        y = np.broadcast_to(np.asarray(y, dtype=float), (fine,))
        ridge = np.zeros(fine)
        for at, half, deep, end, wander in folds:
            # Each from high under the vault down to its end, rounded there, narrowing to its tip.
            tip = np.clip((y - water - end + 0.3) / 0.9, 0.0, 1.0) ** 0.5
            ridge = np.maximum(ridge, deep * tip * bell(arc(at + 0.035 * np.sin(0.55 * y + wander)), half * np.maximum(tip, 0.08)))
        out = -ridge
        for at, half, deep, top_y in masses:
            out -= deep * np.clip((water + top_y - y) / 1.3, 0.0, 1.0) ** 0.5 * bell(arc(at), half)
        for at, half, deep, tall in hollows:
            h = (y - water + 0.4) / (tall + 0.4)
            out += deep * np.where((h > 0.0) & (h < 1.0), np.sin(math.pi * np.clip(h, 0.0, 1.0)), 0.0) * bell(arc(at), half)
        # None up in the vault's top, where the well's foot rounds over into it.
        return out * plain * (1.0 - smoothstep(foot - 2.6, foot - 0.9, y))

    # Rings round the middle, one after another round the solid's cross-section: (radii, heights,
    # kind, how far down: the well's t, or the vault's).
    rows = []
    # The cave's floor under the water, then its side up to the water.
    for k, y in ((0.22, floor), (0.45, floor + 0.05), (0.7, floor + 0.35), (0.92, water - 1.8)):
        rows.append((k * reach, np.full(fine, y), "cave", 1.0))
    rows.append((reach + 0.05 + relief(water - 0.8), np.full(fine, water - 0.8), "cave", 1.0))
    # The vault, from the water up to the well's foot, in rows close enough for its folds to show.
    for v in np.linspace(1.0, 0.0, 20):
        phi = phi0 + (0.5 * math.pi - phi0) * v
        y = water + rise * np.cos(phi)
        pocket = 0.2 * np.sin(6.0 * theta + 5.0 * v + p[9]) * np.sin(4.0 * theta - 3.0 * v + p[10]) * math.sin(math.pi * v)
        rows.append((reach * np.sin(phi) + pocket + relief(y), y, "cave", float(v)))
    # The well's foot, rounding over into the vault: unevenly, lower and higher round it.
    sag = (0.25 * (0.5 + 0.5 * np.sin(5.0 * theta + p[2]) * np.sin(3.0 * theta - p[5]))
           + 0.08 * (0.5 + 0.5 * np.sin(11.0 * theta + p[7])))
    rows.append((r_foot + 0.35 + 0.12 * np.sin(4.0 * theta + p[12]), foot - 0.08 + sag, "foot", 1.0))
    rows.append((r_foot + 0.1, foot + 0.1 + 0.6 * sag, "foot", 1.0))
    # Up the well, in rows close enough for its beds to wander.
    for t in (1.0, 0.9, 0.79, 0.72, 0.66, 0.56, 0.46, 0.39, 0.32, 0.22, 0.12, 0.0):
        rows.append((*wall(t), "well", t))
    # The lip, rounding over from the well onto the ground and on under it.
    rows.append((edge - 0.03, ground_at(edge) + bump - 0.07, "lip", 0.0))
    rows.append((edge + 0.14, ground_at(edge + 0.14) + bump, "lip", 0.0))
    rows.append((edge + 0.32, ground_at(edge + 0.32) + 0.45 * bump, "lip", 0.0))
    rows.append((edge + under, ground_at(edge + under) - 0.12, "hidden", 0.0))
    rows.append((edge + under + 0.4, ground_at(edge + under + 0.4) - 0.5, "hidden", 0.0))
    # Shut away under the ground: out past the dome, down, and back in under its floor.
    out = np.full(fine, float(reach.max()) + 1.6)
    rows.append((out, np.full(fine, float(ground_at(out).min()) - 2.5), "hidden", 0.0))
    rows.append((out, np.full(fine, floor - 1.2), "hidden", 0.0))
    rows.append((0.22 * reach, np.full(fine, floor - 1.2), "hidden", 0.0))

    def colour(ys, kind, depth):
        if kind == "hidden":
            return np.broadcast_to(C["foot"], (fine, 3))
        band = 0.5 + 0.5 * np.sin(3.0 * theta + p[11] + 0.6 * ys)
        c = mix(np.broadcast_to(C["stone"], (fine, 3)), C["stoneMid"], smoothstep(0.3, 0.7, band))
        moss = mix(np.broadcast_to(C["moss"], (fine, 3)), C["mossDark"], wave(11, p[12]))
        if kind == "lip":
            # Worn stone with moss on it in patches.
            return mix(c, moss, 0.25 + 0.55 * smoothstep(0.3, 0.7, wave(5, p[13]) * wave(2, p[0]) * 1.6))
        if kind == "well":
            # Fluted, darker down the well out of the light; moss hanging from the lip in tongues.
            c = mix(c, C["groove"], 0.8 * smoothstep(0.15, 0.7, groove)) * (1.0 - 0.42 * depth)
            drape = 0.35 + 1.3 * wave(9, p[1]) ** 2
            return mix(c, moss * (1.0 - 0.3 * depth), smoothstep(-drape - 0.1, -drape + 0.1, ys - top))
        if kind == "foot":
            return c * 0.5
        # The cave: dark stone, darker deep under the vault, wet and dark where the water laps.
        c = mix(np.broadcast_to(C["groove"] * 0.55, (fine, 3)), C["cave"], 0.25 + 0.5 * depth)
        return mix(c, C["wet"] * 0.45, 1.0 - smoothstep(0.0, 0.9, np.abs(ys - water)))

    bm = bmesh.new()
    rings, cols = [], []
    for radii, ys, kind, depth in rows:
        xs, zs = cx + radii * cos, cz + radii * sin
        rings.append([bm.verts.new((float(xs[j]), -float(zs[j]), float(ys[j]))) for j in range(fine)])
        cols.extend(list(colour(ys, kind, depth)))
    faces = {}
    for i, (lo, hi) in enumerate(zip(rings, rings[1:])):
        for j in range(fine):
            k = (j + 1) % fine
            faces[i, j] = bm.faces.new((lo[j], lo[k], hi[k], hi[j]))
    bm.faces.new(rings[0])
    bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    loops = []

    def door_columns(a, half):
        cols_in = [j for j in range(fine) if abs(angle_diff(theta[j], a)) * dome <= half]
        return [j for j in cols_in if (j + 1) % fine in cols_in]

    for a, half, tall in doors:
        # A doorway: the wall's faces toward its angle, from the floor's outer edge under the water (the
        # fourth row) up, within an arch worn by the sea: upright sides to its springing, a rounded head
        # up to `tall`; its edge then laid on that arch, and the hole there its edge.
        spring = tall - 0.45 * half

        def within(u, y):
            if abs(u) >= half:
                return False
            return y <= spring or (u / half) ** 2 + ((y - spring) / (tall - spring)) ** 2 < 1.0

        top_row = next(i for i, (_, ys, kind, _) in enumerate(rows)
                       if kind == "cave" and i > 4 and float(np.mean(ys)) >= tall + 0.4)
        cut = []
        for i in range(3, top_row):
            for j in door_columns(a, half + 0.5):
                c = faces[i, j].calc_center_median()
                if within(angle_diff(math.atan2(-c.y - cz, c.x - cx), a) * dome, c.z):
                    cut.append(faces[i, j])
        bmesh.ops.delete(bm, geom=cut, context="FACES_ONLY")
        for vert in {v for e in bm.edges if e.is_boundary for v in e.verts}:
            x, z, y = vert.co.x, -vert.co.y, vert.co.z
            u = angle_diff(math.atan2(z - cz, x - cx), a) * dome
            if abs(u) > half + 1.0 or y < water - 1.0:
                continue
            if y <= spring:
                u, h = math.copysign(half, u), y
            else:
                eu, ev = u / half, (y - spring) / (tall - spring)
                n = math.hypot(eu, ev) or 1.0
                u, h = half * eu / n, spring + (tall - spring) * ev / n
            rr, b = math.hypot(x - cx, z - cz), a + u / dome
            vert.co = (cx + rr * math.cos(b), -(cz + rr * math.sin(b)), h)
        at = (cx + dome * math.cos(a), cz + dome * math.sin(a))
        loops.append(min(boundary_loops(bm), key=lambda lp: min(math.hypot(p[0] - at[0], p[2] - at[1]) for p in lp)))
    # And through the solid's hidden outer wall behind each doorway, where the passage runs on through
    # the rock (else it would stand across the passage, a wall seen from it).
    behind = len(rows) - 3
    bmesh.ops.delete(bm, geom=[faces[behind, j] for a, half, _ in doors for j in door_columns(a, half)],
                     context="FACES_ONLY")

    # Vines hanging from the lip down the well a hand's breadth off its side, none past its foot (from
    # the water below only their leaves show, round its edge), leaves along them in bunches.
    vb, vine_cols = bmesh.new(), []
    # (Each at its own angle, so no two hang one over the other, their leaves in one another.)
    for j in rng.choice(fine, 20, replace=False):
        j = int(j)
        a = float(theta[j])
        length = rng.uniform(1.0, shaft - 0.4)
        y_top = float(top[j]) + 0.18 + float(bump[j]) - 0.1
        ys = np.linspace(y_top, y_top - length, max(4, int(length / 0.5) + 1))
        sway = rng.uniform(-0.3, 0.3)
        pts = []
        for i, y in enumerate(ys):
            if y > foot + 0.35:
                t = float(np.clip((top[j] - y) / (top[j] - foot - 0.35), 0.0, 1.0))
                r = float(wall(t)[0][j]) - 0.08 - 0.06 * t
            else:
                r = float(r_foot[j]) - 0.15
            b = a + sway * (i / (len(ys) - 1)) ** 2 / r
            pts.append(Vector((cx + r * math.cos(b), -(cz + r * math.sin(b)), float(y))))
        thick = rng.uniform(0.03, 0.045)
        for q0, q1 in zip(pts, pts[1:]):
            seg = P.segment_bm(q0, q1, thick, thick * 0.9, segments=4)
            L.append_bm(vb, seg)
            vine_cols.extend([VINE["stem"]] * len(seg.verts))
            seg.free()
        inward = Vector((-math.cos(a), math.sin(a), 0.0))
        side = Vector((math.sin(a), math.cos(a), 0.0))
        for t in np.arange(rng.uniform(0.0, 0.06), 1.0, rng.uniform(0.05, 0.08)):
            if rng.random() < t * 0.5:
                continue
            k = t * (len(pts) - 1)
            i = min(int(k), len(pts) - 2)
            c = pts[i].lerp(pts[i + 1], k - i) + inward * 0.05 + side * rng.uniform(-0.14, 0.14)
            size = rng.uniform(0.12, 0.2)
            leaf = L.ellipsoid_bm(c, (size, size * 0.35, size * 0.65), u=4, v=3)
            L.append_bm(vb, leaf)
            vine_cols.extend([VINE[("leaf", "leafMid", "leafDark")[int(rng.integers(0, 3))]]] * len(leaf.verts))
            leaf.free()
    return bm, cols, vb, vine_cols, loops
