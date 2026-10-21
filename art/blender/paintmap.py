"""Painted texture maps for houses, after the film's painted wood and weathered signs.

Every painted piece of a house (a plank, a post, a sign's board, a sheet of tin) gets a patch of
one texture to itself, laid out from its own shape, and is painted texel by texel in numpy from
where on it each texel lies: its grain, its knots and nail heads, the weather on it, the damp at
its foot, paint peeling off a sign, rust running down from a rivet. The game draws the texture over
the house in the film look (`paint` in src/world/Props.ts); what is too small to paint (a shell, a
knob, a bottle) keeps its own colour, as the whole house does seen from afar and in the old look.

A piece is painted by its kind (see PAINTERS) from its colour, a seed of its own and its shape:

- a box (`box`): a plank, a post, a board. Its faces unfold round its length into one patch, the
  front, one side, the back and the other side one after another and its two ends beside them, so
  the grain runs on unbroken round it. Faces never seen (a plank's back against the wall, ends
  butted into posts) can be left out.
- a sheet (`sheet`): every face laid flat on one plane: a sheet of corrugated tin, a gable.

Coordinates are Blender's (Z up). The texture's rows run from the top, as the glTF's UVs do once the
exporter has flipped them (see Painter.finish).
"""

import math
import os

import bmesh
import bpy
import numpy as np
from mathutils import Matrix, Vector

import build_props as P

# ---------------------------------------------------------------------------- noise
_MASK = np.int64(0xFFFFFFFF)


def _hash(ix, iy, iz, seed):
    """A value in [0, 1) for each integer lattice point (int64 arrays), fixed by `seed`."""
    h = (ix * 374761393 + iy * 668265263 + iz * 1440670441 + np.int64(seed) * 2246822519) & _MASK
    h = ((h ^ (h >> 13)) * 3266489917) & _MASK
    h = h ^ (h >> 16)
    return (h & 0xFFFFFF).astype(np.float32) / np.float32(0x1000000)


def _fade(t):
    return t * t * (3.0 - 2.0 * t)


def noise(x, y, z=None, seed=0):
    """Smooth value noise in [0, 1] at (x, y[, z]) (arrays), one lattice cell a unit across."""
    if z is None:
        z = np.zeros_like(x)
    xi, yi, zi = np.floor(x), np.floor(y), np.floor(z)
    fx, fy, fz = _fade(x - xi), _fade(y - yi), _fade(z - zi)
    xi, yi, zi = xi.astype(np.int64), yi.astype(np.int64), zi.astype(np.int64)
    out = 0.0
    for dz in (0, 1):
        wz = fz if dz else 1.0 - fz
        for dy in (0, 1):
            wy = fy if dy else 1.0 - fy
            for dx in (0, 1):
                wx = fx if dx else 1.0 - fx
                out = out + wx * wy * wz * _hash(xi + dx, yi + dy, zi + dz, seed)
    return out


def fbm(x, y, z=None, seed=0, octaves=4, gain=0.5):
    """Noise of several octaves, each twice as fine and `gain` as strong as the last, in [0, 1]."""
    total, amp, norm = 0.0, 1.0, 0.0
    for k in range(octaves):
        f = 2.0 ** k
        total = total + amp * noise(x * f, y * f, None if z is None else z * f, seed + 17 * k)
        norm += amp
        amp *= gain
    return total / norm


def smoothstep(a, b, x):
    t = np.clip((x - a) / (b - a), 0.0, 1.0)
    return t * t * (3.0 - 2.0 * t)


def mix(a, b, t):
    """a to b by t, colours (..., 3) by weights (...)."""
    t = np.asarray(t)[..., None]
    return a * (1.0 - t) + b * t


def rand(seed, k=0):
    """A fixed number in [0, 1) for a seed."""
    v = math.sin(seed * 12.9898 + k * 78.233 + 0.5) * 43758.5453
    return v - math.floor(v)


def hexc(h):
    """A colour from hex, linear, as an array."""
    h = h.lstrip("#")
    c = [int(h[i:i + 2], 16) / 255.0 for i in (0, 2, 4)]
    return np.array([x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c], dtype=np.float32)


# ---------------------------------------------------------------------------- patches
class Patch:
    """One painted piece's patch of the map: its size (metres), the kind and look it is painted in,
    and how to find, for any point of the patch, where on the piece it lies."""

    def __init__(self, kind, colour, seed, params):
        params = dict(params)
        # How much more or less finely than the map's own density it is painted (the roof, seen from
        # afar, more coarsely; a sign's peeling paint more finely).
        self.scale = params.pop("texel", 1.0)
        self.kind, self.colour, self.seed, self.params = kind, np.asarray(colour, dtype=np.float32), seed, params
        self.w = self.h = 0.0
        self.at = (0, 0)  # its corner in the map, in texels, once packed
        self.size_px = (0, 0)


class BoxPatch(Patch):
    """A box's faces unfolded round its length (`a`, `size` along it L): the front (+n), the +b side,
    the back (-n) and the -b side stacked up the patch one after another, each as long as the box;
    its ends (+a, -a) side by side past its far end, each W high and T wide. `faces` names those
    painted (all six if not given); the rest are never seen and keep the box's colour."""

    def __init__(self, kind, colour, seed, params, centre, a, b, n, size, faces=None):
        super().__init__(kind, colour, seed, params)
        self.c, self.a, self.b, self.n = Vector(centre), a.normalized(), b.normalized(), n.normalized()
        self.L, self.W, self.T = size
        self.faces = set(faces) if faces is not None else set(FACES)
        self.ends = [f for f in ("+a", "-a") if f in self.faces]
        bands = self._bands()
        self.w = self.L + self.T * len(self.ends)
        self.h = max(bands[-1][2] if bands else 0.0, self.W if self.ends else 0.0)

    def point(self, along, across):
        """The world point on the box's front (+n) `along` and `across` it from its middle."""
        return np.array(self.c + self.a * along + self.b * across + self.n * (self.T / 2), dtype=np.float32)

    def _bands(self):
        """Where each painted long face lies up the patch: (face, t0, t1)."""
        out, t = [], 0.0
        for f, size in (("+n", self.W), ("+b", self.T), ("-n", self.W), ("-b", self.T)):
            if f in self.faces:
                out.append((f, t, t + size))
                t += size
        return out

    def set_faces(self, faces):
        """Paints only these faces (see FACES), the patch laid out afresh for them."""
        self.faces = set(faces)
        self.ends = [f for f in ("+a", "-a") if f in self.faces]
        bands = self._bands()
        self.w = self.L + self.T * len(self.ends)
        self.h = max(bands[-1][2] if bands else 0.0, self.W if self.ends else 0.0)

    def side_of(self, nrm):
        """Which of the box's faces (see FACES) a face of this normal is."""
        side = max((("a", nrm.dot(self.a)), ("b", nrm.dot(self.b)), ("n", nrm.dot(self.n))), key=lambda x: abs(x[1]))
        return ("+" if side[1] > 0 else "-") + side[0]

    def loop_coords(self, face):
        """The patch coordinates (s, t) of each corner of one of the box's faces; None for a face
        not painted."""
        return self.coords(face.normal, [loop.vert.co for loop in face.loops])

    def coords(self, nrm, corners):
        """As loop_coords, for a face given as its normal and its corners (world points)."""
        local = [((v - self.c).dot(self.a), (v - self.c).dot(self.b), (v - self.c).dot(self.n)) for v in corners]
        name = self.side_of(nrm)
        L, W, T = self.L, self.W, self.T
        if name not in self.faces:
            return None
        bands = {f: (t0, t1) for f, t0, t1 in self._bands()}
        out = []
        for xa, xb, xn in local:
            if name == "+n":
                st = (xa + L / 2, bands["+n"][0] + xb + W / 2)
            elif name == "+b":
                st = (xa + L / 2, bands["+b"][0] + (T / 2 - xn))
            elif name == "-n":
                st = (xa + L / 2, bands["-n"][0] + (W / 2 - xb))
            elif name == "-b":
                st = (xa + L / 2, bands["-b"][0] + (xn + T / 2))
            else:
                s0 = L + T * self.ends.index(name)
                st = (s0 + (T / 2 - xn), xb + W / 2)
            out.append(st)
        return out

    def surface(self, s, t):
        """Where on the box each patch point (s, t) lies: the face (index into FACES), the point in
        the world, along and across the face (metres from its middle) and the face's normal."""
        L, W, T = self.L, self.W, self.T
        face = np.full(s.shape, -1, dtype=np.int8)
        xa = np.zeros_like(s)
        xb = np.zeros_like(s)
        xn = np.zeros_like(s)
        across = np.zeros_like(s)
        long_part = s <= L
        for f, t0, t1 in self._bands():
            m = long_part & (t >= t0) & (t <= t1 + 1e-9)
            u = t - t0
            xa[m] = s[m] - L / 2
            if f == "+n":
                xb[m], xn[m], across[m] = u[m] - W / 2, T / 2, u[m] - W / 2
            elif f == "+b":
                xb[m], xn[m], across[m] = W / 2, T / 2 - u[m], T / 2 - u[m]
            elif f == "-n":
                xb[m], xn[m], across[m] = W / 2 - u[m], -T / 2, W / 2 - u[m]
            else:
                xb[m], xn[m], across[m] = -W / 2, u[m] - T / 2, u[m] - T / 2
            face[m] = FACES.index(f)
        for j, f in enumerate(self.ends):
            s0 = L + T * j
            if True:
                m = (s > s0) & (s <= s0 + T + 1e-9) & (t <= W)
                xa[m] = L / 2 if f == "+a" else -L / 2
                xn[m] = T / 2 - (s[m] - s0)
                xb[m] = t[m] - W / 2
                across[m] = xb[m]
                face[m] = FACES.index(f)
        a, b, n, c = (np.array(v, dtype=np.float32) for v in (self.a, self.b, self.n, self.c))
        world = c + xa[..., None] * a + xb[..., None] * b + xn[..., None] * n
        normal = np.zeros(s.shape + (3,), dtype=np.float32)
        for k, f in enumerate(FACES):
            m = face == k
            axis = {"a": a, "b": b, "n": n}[f[1]]
            normal[m] = axis if f[0] == "+" else -axis
        return {"face": face, "world": world, "along": xa, "across": across, "xb": xb, "xn": xn, "normal": normal,
                "length": L, "width": W, "thick": T}


FACES = ("+n", "+b", "-n", "-b", "+a", "-a")


class SheetPatch(Patch):
    """Every face of a piece laid flat on one plane (origin, u, v): a sheet of tin, a gable."""

    def __init__(self, kind, colour, seed, params, bm, origin, u, v):
        super().__init__(kind, colour, seed, params)
        self.o, self.u, self.v = Vector(origin), u.normalized(), v.normalized()
        self.normal = self.u.cross(self.v).normalized()
        pts = [((p.co - self.o).dot(self.u), (p.co - self.o).dot(self.v)) for p in bm.verts]
        self.s0 = min(p[0] for p in pts)
        self.t0 = min(p[1] for p in pts)
        self.w = max(p[0] for p in pts) - self.s0
        self.h = max(p[1] for p in pts) - self.t0

    def loop_coords(self, face):
        return self.coords(face.normal, [loop.vert.co for loop in face.loops])

    def coords(self, nrm, corners):
        return [((c - self.o).dot(self.u) - self.s0, (c - self.o).dot(self.v) - self.t0) for c in corners]

    def surface(self, s, t):
        o, u, v = (np.array(x, dtype=np.float32) for x in (self.o, self.u, self.v))
        world = o + (s + self.s0)[..., None] * u + (t + self.t0)[..., None] * v
        normal = np.broadcast_to(np.array(self.normal, dtype=np.float32), s.shape + (3,))
        return {"face": np.zeros(s.shape, dtype=np.int8), "world": world, "along": s - self.w / 2,
                "across": t - self.h / 2, "xb": t, "xn": np.zeros_like(s), "normal": normal,
                "length": self.w, "width": self.h, "thick": 0.0}


class LogPatch(Patch):
    """A round piece's side unrolled: along its middle (s, metres) and round it (t, metres round at
    its mean radius), for a straight log (its middle a line) or a bent one (its middle through its
    rings' middles, each ring's way round carried along it so it does not twist). Only the stretch
    round it that shows is painted (see crop); where the whole of it shows, a strip past its seam
    as wide as its widest face is painted on round, so the faces across the seam lie whole."""

    def __init__(self, kind, colour, seed, params, middle, radius):
        super().__init__(kind, colour, seed, params)
        self.r = max(radius, 1e-3)
        self.C = np.array([p[:] for p, _ in middle], dtype=np.float64)
        T = np.array([t.normalized()[:] for _, t in middle], dtype=np.float64)
        N = np.zeros_like(T)
        ref = np.array([0.0, 0.0, 1.0]) if abs(T[0][2]) < 0.9 else np.array([1.0, 0.0, 0.0])
        n = ref - T[0] * ref.dot(T[0])
        N[0] = n / np.linalg.norm(n)
        for k in range(1, len(T)):
            n = N[k - 1] - T[k] * N[k - 1].dot(T[k])
            N[k] = n / max(np.linalg.norm(n), 1e-9)
        self.T, self.N, self.B = T, N, np.cross(T, N)
        steps = np.linalg.norm(np.diff(self.C, axis=0), axis=1)
        self.S = np.concatenate([[0.0], np.cumsum(steps)])
        self.L = float(self.S[-1])
        self.start, self.span = 0.0, 2.0 * math.pi
        self.w, self.h = self.L, 2.0 * math.pi * self.r

    def _frame(self, s):
        """The middle, its way round (N, B) at each s along it (arrays)."""
        s = np.clip(s, 0.0, self.L)
        k = np.clip(np.searchsorted(self.S, s, side="right") - 1, 0, len(self.S) - 2)
        seg = np.maximum(self.S[k + 1] - self.S[k], 1e-9)
        f = ((s - self.S[k]) / seg)[..., None]
        c = self.C[k] * (1.0 - f) + self.C[k + 1] * f
        n = self.N[k] * (1.0 - f) + self.N[k + 1] * f
        b = self.B[k] * (1.0 - f) + self.B[k + 1] * f
        return c, n / np.linalg.norm(n, axis=-1, keepdims=True), b / np.linalg.norm(b, axis=-1, keepdims=True)

    def place(self, p):
        """How far along the middle a world point lies (s) and its angle round it (0 to 2 pi)."""
        p = np.array(p[:], dtype=np.float64)
        best = None
        for k in range(len(self.C) - 1):
            seg = self.C[k + 1] - self.C[k]
            length = np.linalg.norm(seg)
            f = float(np.clip((p - self.C[k]).dot(seg) / max(length * length, 1e-12), 0.0, 1.0))
            q = self.C[k] + seg * f
            d = np.linalg.norm(p - q)
            if best is None or d < best[0]:
                best = (d, self.S[k] + f * length)
        s = best[1]
        c, n, b = self._frame(np.array([s]))
        v = p - c[0]
        theta = math.atan2(v.dot(b[0]), v.dot(n[0])) % (2.0 * math.pi)
        return s, theta

    def angles(self, corners):
        """The face's corners' (s, angle), the angles unwound round its first corner."""
        out = [self.place(c) for c in corners]
        a0 = out[0][1]
        return [(s, a0 + ((a - a0 + math.pi) % (2.0 * math.pi)) - math.pi) for s, a in out]

    def crop(self, faces):
        """Paints only the stretch round it that these faces (each its corners' (s, angle)) cover:
        the circle less its widest gap; all round, with a strip past the seam, if there is none."""
        spans = []
        widest = 0.0
        for corners in faces:
            a = [x for _, x in corners]
            lo, hi = min(a) % (2.0 * math.pi), None
            hi = lo + (max(a) - min(a))
            widest = max(widest, hi - lo)
            spans.append((lo, hi))
        if not spans:
            return
        spans.sort()
        # The gaps between what is covered, round the circle.
        covered = [list(spans[0])]
        for lo, hi in spans[1:]:
            if lo <= covered[-1][1] + 1e-6:
                covered[-1][1] = max(covered[-1][1], hi)
            else:
                covered.append([lo, hi])
        gaps = [(covered[(i + 1) % len(covered)][0] + (2.0 * math.pi if i == len(covered) - 1 else 0.0) - covered[i][1],
                 covered[i][1]) for i in range(len(covered))]
        gap, gap_start = max(gaps)
        if gap > 0.15:
            self.start = (gap_start + gap) % (2.0 * math.pi)
            self.span = 2.0 * math.pi - gap
        else:
            self.start, self.span = 0.0, 2.0 * math.pi + widest
        self.h = self.span * self.r

    def coords(self, nrm, corners):
        out = []
        for s, a in self.angles(corners):
            d = (a - self.start) % (2.0 * math.pi)
            out.append((s, d))
        # Keep the face whole: its corners within half a turn of its first.
        d0 = out[0][1]
        fixed = []
        for s, d in out:
            if d - d0 > math.pi:
                d -= 2.0 * math.pi
            elif d0 - d > math.pi:
                d += 2.0 * math.pi
            fixed.append((s, d))
        if min(d for _, d in fixed) < -1e-6:
            fixed = [(s, d + 2.0 * math.pi) for s, d in fixed]
        return [(s, d * self.r) for s, d in fixed]

    def surface(self, s, t):
        c, n, b = self._frame(s.astype(np.float64))
        theta = (self.start + t / self.r)[..., None]
        normal = np.cos(theta) * n + np.sin(theta) * b
        world = c + normal * self.r
        return {"face": np.zeros(s.shape, dtype=np.int8), "world": world.astype(np.float32), "along": s - self.L / 2,
                "across": t - self.h / 2, "xb": t, "xn": np.zeros_like(s), "normal": normal.astype(np.float32),
                "length": self.L, "width": self.h, "thick": 0.0}


def _grains(bm, grain):
    """The grain at each of a piece's vertices (a vector or None), from one for all or a list."""
    if isinstance(grain, list):
        return grain
    return [grain] * len(bm.verts)


def fit(bm, colours, grain, kind, seed, params):
    """A patch fitted to a piece made otherwise (houses.cut_log, a box, a post), painted `kind`, and
    which of its faces it paints (those whose every corner has a grain, where the grain is given a
    vertex at a time: a log's sides, not its pale cut ends): a log patch for one that is round (its
    sides many narrow faces round its length), a box patch for one with four broad sides (a plank, a
    post, a board, bevelled or not). Its grain runs along `grain` (one way for all its vertices, a
    vertex at a time, or None: its longest way). None if nothing of it is to be painted."""
    bm.verts.ensure_lookup_table()
    bm.verts.index_update()
    bm.normal_update()
    per = _grains(bm, grain)
    has = [g is not None and g.length > 1e-6 for g in per]
    if grain is not None and not any(has):
        return None, None
    painted = [all(has[v.index] for v in f.verts) if grain is not None else True for f in bm.faces]
    verts = [v for v in bm.verts if has[v.index]] if grain is not None else list(bm.verts)
    if not verts:
        return None, None
    pts = np.array([v.co[:] for v in verts], dtype=np.float64)
    if isinstance(colours, list):
        colour = np.mean([colours[v.index] for v in verts], axis=0)
    else:
        colour = np.asarray(colours, dtype=np.float32)
    ways = [per[v.index] for v in verts] if grain is not None else []
    if ways:
        a = Vector(np.mean([w.normalized()[:] for w in ways], axis=0))
        if a.length < 0.5:
            a = ways[0].normalized()
        a.normalize()
        bent = any(w.normalized().dot(a) < 0.985 for w in ways)
    else:
        centred = pts - pts.mean(axis=0)
        _, _, vt = np.linalg.svd(centred, full_matrices=False)
        a, bent = Vector(vt[0]), False
    # Its sides: the faces lying along its grain.
    sides = [(f.normal.copy(), f.calc_area()) for f, p in zip(bm.faces, painted) if p and abs(f.normal.dot(a)) < 0.5]
    total = sum(area for _, area in sides) or 1.0
    big = sorted(sides, key=lambda x: -x[1])
    clusters = []
    for nrm, area in big:
        for c in clusters:
            if nrm.dot(c[0]) > 0.97:
                c[1] += area
                break
        else:
            clusters.append([nrm, area])
    four = sum(area for _, area in sorted(clusters, key=lambda c: -c[1])[:4])
    round_ = bent or (len(clusters) > 4 and four < 0.8 * total)
    if round_:
        if bent:
            # Its rings: runs of vertices with one grain, in the order they were made, each run split
            # where its vertices step on along that grain (a straight stretch of rings shares one).
            runs, run, last = [], [], None
            for v in verts:
                w = per[v.index]
                if last is not None and (w - last).length > 1e-6:
                    runs.append(run)
                    run = []
                run.append(v)
                last = w
            runs.append(run)
            rings = []
            for run in runs:
                if not run:
                    continue
                w = per[run[0].index].normalized()
                levels = sorted(run, key=lambda v: v.co.dot(w))
                ring = [levels[0]]
                for v in levels[1:]:
                    if v.co.dot(w) - ring[-1].co.dot(w) > 0.01:
                        rings.append(ring)
                        ring = []
                    ring.append(v)
                rings.append(ring)
            middle = [(Vector(np.mean([v.co[:] for v in ring], axis=0)), per[ring[0].index]) for ring in rings]
            radius = float(np.mean([np.linalg.norm(np.array(v.co[:]) - np.array(m[:]))
                                    for ring, (m, _) in zip(rings, middle) for v in ring]))
        else:
            centre = pts.mean(axis=0)
            along = (pts - centre) @ np.array(a[:])
            c = Vector(centre)
            middle = [(c + a * float(along.min()), a), (c + a * float(along.max()), a)]
            off = (pts - centre) - np.outer(along, np.array(a[:]))
            radius = float(np.linalg.norm(off, axis=1).mean())
        if len(middle) < 2:
            return None, None
        # A log has no nails nor long edges to darken; its grain runs long and wide and shows strongly,
        # knots here and there, cracks along it where it dried.
        params = {"nails": False, "edge": 0.0, "knots": 4, "grain_lines": 20.0, "grain_dark": 0.36, "checks": 0.5,
                  **params} if kind == "wood" else params
        return LogPatch(kind, colour, seed, params, middle, radius), painted
    # A box: its broadest side's way out is its front.
    front = max(clusters, key=lambda c: c[1])[0] if clusters else (a.orthogonal())
    n = (front - a * front.dot(a)).normalized()
    b = n.cross(a).normalized()
    xa, xb, xn = (pts @ np.array(v[:]) for v in (a, b, n))
    mid = Vector(np.array(a[:]) * (xa.min() + xa.max()) / 2 + np.array(b[:]) * (xb.min() + xb.max()) / 2
                 + np.array(n[:]) * (xn.min() + xn.max()) / 2)
    size = (float(xa.max() - xa.min()), float(xb.max() - xb.min()), float(xn.max() - xn.min()))
    if size[0] < 1e-4 or size[1] < 1e-4:
        return None, None
    # Running up a face is up its patch (a board's stains run down it).
    if a.z < -0.5:
        a, b = -a, -b
    if abs(a.z) < 0.5 and b.z < -0.5:
        b, n = -b, -n
    return BoxPatch(kind, colour, seed, params, mid, a, b, n, size), painted


# ---------------------------------------------------------------------------- painters
def _tone(seed, amount):
    return 1.0 + amount * (2.0 * rand(seed, 3) - 1.0)


def _knots(along, across, seed, length, width, count):
    """Dark knots in wood and the grain's swirl round them: (darkness 0..1, swirl) per texel."""
    dark = np.zeros_like(along)
    swirl = np.zeros_like(along)
    for k in range(count):
        if rand(seed, 40 + k) > 0.55:
            continue
        ka = (rand(seed, 50 + k) - 0.5) * max(length - 0.15, 0.0)
        kc = (rand(seed, 60 + k) - 0.5) * width * 0.7
        r = 0.009 + 0.016 * rand(seed, 70 + k)
        d = np.sqrt(((along - ka) / (r * 1.7)) ** 2 + ((across - kc) / r) ** 2)
        dark = np.maximum(dark, 1.0 - smoothstep(0.55, 1.0, d))
        dark = np.maximum(dark, 0.45 * (1.0 - smoothstep(0.0, 0.25, np.abs(d - 1.45))))
        swirl = swirl + np.exp(-d * d * 0.35) * np.sign(across - kc) * r * 1.4
    return dark, swirl


def wood(d, p, *, grain_lines=30.0, grain_dark=0.26, light=0.12, knots=2, weather=0.0, grey=None, damp=0.0,
         edge=0.22, nails=True, end_dark=0.3, tone=0.1, checks=0.0):
    """Wood as the film paints it: broad darker streaks along the grain, finer lines among them, a
    few lighter ones, knots with the grain swirling round them; then the weather (greyer, paler
    patches), the damp at its foot, darker long edges and ends, nail heads with rust under them."""
    along, across = d["along"], d["across"]
    seed = p.seed
    base = p.colour * _tone(seed, tone)
    kd, swirl = _knots(along, across, seed, d["length"], d["width"], knots)
    wander = (fbm(along * 0.6, across * 3.0, seed=seed + 5, octaves=3) - 0.5) * 0.05
    g = (across + wander + swirl) * grain_lines
    broad = fbm(along * 0.8, g, seed=seed + 1, octaves=3)
    fine = noise(along * 2.5, g * 3.0, seed=seed + 2)
    dark = np.maximum(smoothstep(0.56, 0.74, broad), 0.55 * smoothstep(0.66, 0.84, fine))
    lit = smoothstep(0.62, 0.8, 1.0 - fbm(along * 0.7, g * 0.7, seed=seed + 3, octaves=2))
    col = base * ((1.0 - grain_dark * dark) * (1.0 + light * lit))[..., None]
    col = col * (1.0 - 0.5 * kd)[..., None]
    world = d["world"]
    if weather > 0.0:
        w = fbm(world[..., 0] * 1.6, world[..., 1] * 1.6, world[..., 2] * 1.6, seed=91, octaves=4)
        patch = smoothstep(0.42, 0.72, w) * weather
        g_col = grey if grey is not None else col.mean(axis=-1, keepdims=True) * 1.15
        col = mix(col, np.broadcast_to(g_col, col.shape), patch * 0.55)
    if damp > 0.0:
        foot = 1.0 - smoothstep(0.05, 0.75, world[..., 2])
        streak = fbm(world[..., 0] * 9.0 + world[..., 1] * 9.0, world[..., 2] * 2.0, seed=93, octaves=3)
        col = col * (1.0 - damp * foot * (0.55 + 0.45 * streak))[..., None]
        col = mix(col, np.broadcast_to(hexc("#4F5A3A"), col.shape), damp * 0.25 * foot)
    if checks > 0.0:
        crack = smoothstep(0.88, 0.97, noise(along * 1.4, g * 1.6, seed=seed + 8)) * checks
        col = col * (1.0 - 0.45 * crack)[..., None]
    face = d["face"]
    front = (face == 0) | (face == 2)
    half_w = d["width"] / 2
    if edge > 0.0:
        e = smoothstep(half_w - 0.012, half_w, np.abs(across)) * front
        col = col * (1.0 - edge * e)[..., None]
    ends = face >= 4
    col = col * (1.0 - end_dark * ends)[..., None]
    if nails and d["length"] > 0.3:
        # Two nails at each end of the front, a little in from them, rust bleeding down under each.
        for ea in (-1.0, 1.0):
            na = ea * (d["length"] / 2 - 0.045)
            for nc in (-half_w * 0.45, half_w * 0.45):
                r = np.sqrt((along - na) ** 2 + (across - nc) ** 2)
                head = (1.0 - smoothstep(0.004, 0.007, r)) * front
                halo = (1.0 - smoothstep(0.006, 0.02, r)) * front
                col = mix(col, np.broadcast_to(hexc("#7A4A2A"), col.shape), halo * 0.35)
                col = mix(col, np.broadcast_to(hexc("#2E2620"), col.shape), head)
                # Rust runs down from it, the world's down.
                nail = p.point(na, nc) if hasattr(p, "point") else None
                if nail is not None:
                    below = nail[2] - world[..., 2]
                    side = np.linalg.norm((world - nail)[..., :2], axis=-1)
                    run = smoothstep(0.0, 0.01, below) * (1.0 - smoothstep(0.0, 0.06, below)) \
                        * (1.0 - smoothstep(0.002, 0.006, side)) * front
                    col = mix(col, np.broadcast_to(hexc("#8A4E2C"), col.shape), run * 0.4)
    return col


def painted_board(d, p, *, paint="#EAE5D3", under="#8C6A48", peel=0.45, stain=0.6, stain_colour="#8F5A33"):
    """A board painted a pale cream, as the film's signs: the paint worn and peeling at its edges and
    here and there, the wood showing where it has gone, a dark rim round each bare patch; rust and
    grime run down from its top edge and its corners."""
    s, t = d["along"], d["across"]
    seed = p.seed
    L, W = d["length"], d["width"]
    paint_c = hexc(paint) * (0.96 + 0.06 * fbm(s * 3.0, t * 3.0, seed=seed, octaves=3))[..., None]
    bare = wood(d, Patch("w", hexc(under), seed + 7, {}), grain_lines=24.0, knots=1, nails=False, edge=0.0)
    # How near the board's edge each texel is (0 at the edge): the paint goes first along some
    # stretches of it and at its corners, in ragged patches, and here and there out on its face.
    edge = np.minimum(L / 2 - np.abs(s), W / 2 - np.abs(t))
    near = 1.0 - smoothstep(0.0, 0.16, edge)
    stretch = smoothstep(0.42, 0.68, fbm(s * 2.2 + 3.1, t * 2.2 + 7.7, seed=seed + 9, octaves=3))
    corner = np.exp(-np.hypot(L / 2 - np.abs(s), W / 2 - np.abs(t)) / 0.12)
    worn = fbm(s * 4.5, t * 4.5, seed=seed + 3, octaves=5) + near * (0.12 + 0.55 * stretch) + 0.5 * corner
    spots = smoothstep(0.7, 0.76, fbm(s * 7.0 + 11.0, t * 7.0, seed=seed + 4, octaves=4)) * peel
    worn = np.maximum(worn, 0.95 * spots + 0.3)
    thresh = 1.0 - peel * 0.22
    gone = smoothstep(thresh, thresh + 0.035, worn)
    rim = smoothstep(thresh - 0.05, thresh, worn) * (1.0 - gone)
    col = mix(paint_c, bare, gone)
    col = col * (1.0 - 0.35 * rim)[..., None]
    # Stains running down from the top edge (t up the board) and from the top corners.
    down = W / 2 - t
    col_seed = fbm(s * 22.0, np.zeros_like(s), seed=seed + 11, octaves=2)
    runs = smoothstep(0.45, 0.8, col_seed) * np.exp(-down / (0.12 + 0.25 * col_seed))
    corners = np.exp(-((L / 2 - np.abs(s)) / 0.12)) * np.exp(-down / 0.5)
    stain_amt = np.clip(runs + corners, 0.0, 1.0) * stain * (0.6 + 0.4 * fbm(s * 9.0, t * 2.0, seed=seed + 13))
    col = mix(col, np.broadcast_to(hexc(stain_colour), col.shape), stain_amt * 0.55)
    # Grime along its foot.
    grime = np.exp(-(t + W / 2) / 0.1) * 0.35
    col = col * (1.0 - grime)[..., None]
    face = d["face"]
    side = face != 0
    col[side] = (bare[side] * 0.85)
    return col


def painted(d, p, *, under="#8C6A48", peel=0.3, stain=0.3, stain_colour="#7E5A3A", weather=0.3):
    """Wood painted a colour of its own (the piece's): its brushwork a little uneven, the paint worn
    through along stretches of its edges and at its corners and here and there on a face, the wood
    showing where it has gone and a darker rim round each bare patch; stains running down from its top
    and grime at its foot, paler where the weather has had it. Every face of it (where a sign's board
    paints only its front)."""
    s, t = d["along"], d["across"]
    seed = p.seed
    L, W, T = d["length"], d["width"], max(d["thick"], 1e-3)
    face = d["face"]
    half = np.where((face == 1) | (face == 3), T / 2, W / 2)
    paint_c = p.colour * (0.95 + 0.08 * fbm(s * 3.0, t * 3.0, seed=seed, octaves=3))[..., None]
    paint_c = paint_c * (1.0 - 0.06 * smoothstep(0.55, 0.8, fbm(s * 0.6, t * 9.0, seed=seed + 2, octaves=2)))[..., None]
    bare = wood(d, Patch("w", hexc(under), seed + 7, {}), grain_lines=24.0, knots=1, nails=False, edge=0.0)
    edge = np.minimum(L / 2 - np.abs(s), half - np.abs(t))
    near = 1.0 - smoothstep(0.0, 0.05 + 0.08 * min(W, 0.6), edge)
    stretch = smoothstep(0.45, 0.7, fbm(s * 2.4 + 3.1, t * 2.4 + 7.7, seed=seed + 9, octaves=3))
    corner = np.exp(-np.hypot(L / 2 - np.abs(s), half - np.abs(t)) / 0.05)
    worn = fbm(s * 5.0, t * 5.0, seed=seed + 3, octaves=5) + near * (0.1 + 0.5 * stretch) + 0.45 * corner
    spots = smoothstep(0.72, 0.78, fbm(s * 8.0 + 11.0, t * 8.0, seed=seed + 4, octaves=4)) * peel
    worn = np.maximum(worn, 0.95 * spots + 0.3)
    thresh = 1.0 - peel * 0.22
    gone = smoothstep(thresh, thresh + 0.035, worn)
    rim = smoothstep(thresh - 0.05, thresh, worn) * (1.0 - gone)
    col = mix(paint_c, bare, gone)
    col = col * (1.0 - 0.3 * rim)[..., None]
    world = d["world"]
    if weather > 0.0:
        w = fbm(world[..., 0] * 1.4, world[..., 1] * 1.4, world[..., 2] * 1.4, seed=95, octaves=4)
        col = mix(col, col * 1.08 + 0.02, smoothstep(0.45, 0.75, w) * weather * 0.6)
    if stain > 0.0:
        top = float(world[..., 2].max()) if world.size else 0.0
        down = top - world[..., 2]
        runs = smoothstep(0.5, 0.8, fbm(s * 20.0, np.zeros_like(s), seed=seed + 11, octaves=2)) * np.exp(-down / 0.25)
        col = mix(col, np.broadcast_to(hexc(stain_colour), col.shape), np.clip(runs, 0.0, 1.0) * stain * 0.5)
    foot = 1.0 - smoothstep(0.05, 0.6, world[..., 2])
    col = col * (1.0 - 0.25 * foot)[..., None]
    return col


def bark(d, p, *, furrows=24.0, depth=0.42, moss=0.3, lichen=0.25):
    """Bark, as on the film's fallen logs, posts and branches: long ridged plates split by dark furrows
    running along it, wandering and joining, broken across here and there, each plate a little
    lighter along its ridge; moss in patches over what faces up, pale lichen in spots, darker
    underneath."""
    s, t = d["along"], d["across"]
    seed = p.seed
    base = p.colour * _tone(seed, 0.08)
    wander = (fbm(s * 0.9, t * 2.0, seed=seed + 5, octaves=3) - 0.5) * 0.08
    g = (t + wander) * furrows
    ridge = np.abs(np.sin(math.pi * (g + 0.35 * fbm(s * 2.5, g * 0.5, seed=seed + 6, octaves=2))))
    cross = smoothstep(0.82, 0.95, noise(s * 3.0, g * 0.5, seed=seed + 7))
    furrow = np.maximum(1.0 - smoothstep(0.0, 0.35, ridge), cross * 0.7)
    col = base * (1.0 - depth * furrow)[..., None]
    col = col * (1.0 + 0.12 * smoothstep(0.55, 1.0, ridge) * (1.0 - cross))[..., None]
    col = col * (0.9 + 0.2 * fbm(s * 1.5, t * 1.5, seed=seed + 8, octaves=3))[..., None]
    up = d["normal"][..., 2]
    world = d["world"]
    patch = fbm(world[..., 0] * 2.0, world[..., 1] * 2.0, world[..., 2] * 2.0, seed=97, octaves=4)
    m = smoothstep(0.55, 0.75, patch) * smoothstep(-0.2, 0.6, up) * moss
    col = mix(col, np.broadcast_to(hexc("#6E8A45"), col.shape), m * 0.6)
    spots = smoothstep(0.74, 0.8, fbm(s * 6.0, t * 6.0, seed=seed + 9, octaves=3)) * lichen
    col = mix(col, np.broadcast_to(hexc("#B9B79A"), col.shape), spots * 0.5)
    return col * (1.0 - 0.25 * smoothstep(0.0, -0.8, up))[..., None]


def metal(d, p, *, rust=0.5, rivets=(), rivet_r=0.012):
    """A steel plate, grey, mottled, rusting at its edges and round its rivets, rust running down
    from each."""
    s, t = d["along"], d["across"]
    seed = p.seed
    base = p.colour * (0.9 + 0.2 * fbm(s * 6.0, t * 6.0, seed=seed, octaves=4))[..., None]
    L, W = d["length"], d["width"]
    edge = np.minimum(L / 2 - np.abs(s), W / 2 - np.abs(t))
    r_amt = smoothstep(0.55, 0.8, fbm(s * 7.0, t * 7.0, seed=seed + 4, octaves=4) + 0.4 * (1.0 - smoothstep(0.0, 0.05, edge)))
    rust_c = hexc("#9A5A30") * (0.8 + 0.4 * noise(s * 40.0, t * 40.0, seed=seed + 5))[..., None]
    col = mix(base, rust_c, r_amt * rust)
    for rs, rt in rivets:
        r = np.sqrt((s - rs) ** 2 + (t - rt) ** 2)
        col = mix(col, np.broadcast_to(hexc("#5E6266"), col.shape), 1.0 - smoothstep(rivet_r * 0.7, rivet_r, r))
        col = mix(col, np.broadcast_to(hexc("#B8BDBF"), col.shape),
                  (1.0 - smoothstep(0.0, rivet_r * 0.35, np.sqrt((s - rs + rivet_r * 0.3) ** 2 + (t - rt - rivet_r * 0.3) ** 2))) * 0.8)
        below = rt - t
        streak = smoothstep(0.0, 0.01, below) * (1.0 - smoothstep(0.02, 0.18, below)) * (1.0 - smoothstep(0.003, 0.009, np.abs(s - rs)))
        col = mix(col, np.broadcast_to(hexc("#8A4A26"), col.shape), streak * 0.6 * rust)
    return col


def tin(d, p, *, pitch=0.076, rust=0.5):
    """Corrugated tin: galvanised grey in light and dark bands along its ribs, rust in streaks down
    them and in spots, darker toward its low edge."""
    s, t = d["along"], d["across"]
    seed = p.seed
    band = 0.5 + 0.5 * np.cos(2.0 * math.pi * t / pitch)
    base = p.colour * (0.82 + 0.3 * band)[..., None]
    base = base * (0.92 + 0.16 * fbm(s * 2.0, t * 2.0, seed=seed, octaves=3))[..., None]
    streaks = smoothstep(0.5, 0.85, fbm(s * 1.2, t * 26.0, seed=seed + 3, octaves=3))
    spots = smoothstep(0.62, 0.8, fbm(s * 9.0, t * 9.0, seed=seed + 5, octaves=4))
    low = smoothstep(d["length"] / 2 - 0.5, d["length"] / 2, s)
    amt = np.clip(streaks * 0.8 + spots + 0.5 * low, 0.0, 1.0) * rust
    rust_c = hexc("#94552F") * (0.75 + 0.5 * noise(s * 30.0, t * 30.0, seed=seed + 7))[..., None]
    return mix(base, rust_c, amt * 0.7)


def enamel(d, p, *, chips=0.5, floor=0.0):
    """Enamelled steel, as the film's light blue stove: smooth, a little dirtier toward its foot
    (over `floor`), chipped dark here and there at its edges."""
    s, t = d["along"], d["across"]
    seed = p.seed
    col = p.colour * (0.97 + 0.05 * fbm(s * 4.0, t * 4.0, seed=seed, octaves=3))[..., None]
    L, W = d["length"], d["width"]
    edge = np.minimum(L / 2 - np.abs(s), W / 2 - np.abs(t))
    chip = smoothstep(0.78, 0.86, noise(s * 60.0, t * 60.0, seed=seed + 3)) * (1.0 - smoothstep(0.0, 0.03, edge)) * chips
    col = mix(col, np.broadcast_to(hexc("#2F3438"), col.shape), chip)
    foot = 1.0 - smoothstep(0.0, 0.35, d["world"][..., 2] - floor)
    return col * (1.0 - 0.18 * foot)[..., None]


def plastic(d, p, *, scuffs=0.4):
    """A plastic crate: its own bright colour, scuffed paler and dirtier here and there."""
    s, t = d["along"], d["across"]
    seed = p.seed
    col = p.colour * (0.95 + 0.08 * fbm(s * 5.0, t * 5.0, seed=seed, octaves=3))[..., None]
    sc = smoothstep(0.66, 0.82, fbm(s * 14.0, t * 14.0, seed=seed + 2, octaves=3)) * scuffs
    col = mix(col, col * 1.35 + 0.05, sc * 0.5)
    return col * (1.0 - 0.2 * (1.0 - smoothstep(0.0, 0.08, t + d["width"] / 2)))[..., None]


def paper(d, p):
    """A paper or card plaque: cream, browned and foxed toward its edges."""
    s, t = d["along"], d["across"]
    seed = p.seed
    L, W = d["length"], d["width"]
    edge = np.minimum(L / 2 - np.abs(s), W / 2 - np.abs(t))
    col = p.colour * (0.95 + 0.07 * fbm(s * 8.0, t * 8.0, seed=seed, octaves=3))[..., None]
    brown = (1.0 - smoothstep(0.0, 0.025, edge)) * 0.4 + smoothstep(0.7, 0.85, fbm(s * 20.0, t * 20.0, seed=seed + 1)) * 0.25
    return mix(col, np.broadcast_to(hexc("#B88A55"), col.shape), brown)


def cloth(d, p, *, pattern=None):
    """Cloth: its colour woven a little uneven; `pattern` draws on it (see fish_pattern)."""
    s, t = d["along"], d["across"]
    col = p.colour * (0.93 + 0.1 * fbm(s * 12.0, t * 12.0, seed=p.seed, octaves=2))[..., None]
    if pattern is not None:
        col = pattern(d, col)
    return col


def plain(d, p):
    """Its own colour, a little uneven."""
    s, t = d["along"], d["across"]
    return p.colour * (0.95 + 0.08 * fbm(s * 6.0, t * 6.0, seed=p.seed, octaves=3))[..., None]


PAINTERS = {"wood": wood, "board": painted_board, "painted": painted, "bark": bark, "metal": metal, "tin": tin, "enamel": enamel, "plastic": plastic,
            "paper": paper, "cloth": cloth, "plain": plain}


# ---------------------------------------------------------------------------- the map
def _sliding_max(a, w):
    """The greatest of each run of w neighbours of `a` (one for each start), in one pass: the runs'
    blocks' running maxima from either end (van Herk)."""
    n = len(a)
    pad = (-n) % w
    b = np.concatenate([a, np.full(pad, a.min())]).reshape(-1, w)
    prefix = np.maximum.accumulate(b, axis=1).ravel()
    suffix = np.maximum.accumulate(b[:, ::-1], axis=1)[:, ::-1].ravel()
    i = np.arange(n - w + 1)
    return np.maximum(suffix[i], prefix[i + w - 1])


class Painter:
    """Collects a house's or a prop's painted pieces as they are joined (see join), packs their
    patches into one map, gives the joined objects their `paint` UVs, paints the map and saves it
    (see finish).

    A piece painted by a patch of its own (see box, SheetPatch) is painted as given. Any other piece
    `auto` names a kind for (by default every piece with a wood grain, as wood) is fitted with a
    patch (see fit), and only what of it shows is painted: a face with another piece's face pressed
    to it or lying just before it (a plank's back on the wall, its ends butted into a post, the half
    of a log inside the room's own logs) keeps its own colour and takes no room in the map."""

    def __init__(self, name, size=2048, margin=4, density=(90, 50), sizes=(256, 512, 1024, 2048)):
        self.name, self.size, self.margin, self.density = name, size, margin, density
        self.sizes = [s for s in sizes if s <= size]
        self.patches = []
        self.objects = []  # (object, [(patch or None, [(normal, corners) per face], fitted, painted)...])
        self.seed = 7000

    def join(self, name, pieces, collection, sharp=P.SHARP, grained=True, auto=None, wood=None, joiner=None):
        """Join (bmesh, colour[, grain[, paint]]) pieces as houses.join_grained does (or P.join, not
        `grained`, or `joiner(name, pieces, collection)`), noting each painted piece's patch and its
        faces (their normals and corners) first. `auto(piece)` gives the kind and the painter's params
        for a piece with no patch of its own, or None to leave it its own colours; by default a grained
        piece is wood, painted with `wood`'s params."""
        import houses as H
        records = []
        for piece in pieces:
            bm = piece[0]
            spec = piece[3] if len(piece) > 3 else None
            patch = spec(bm) if callable(spec) else spec
            bm.normal_update()
            faces = [(f.normal.copy(), [loop.vert.co.copy() for loop in f.loops]) for f in bm.faces]
            fitted, painted = False, None
            if patch is None:
                choice = auto(piece) if auto is not None else (
                    ("wood", dict(wood or {})) if len(piece) > 2 and piece[2] is not None else None)
                if choice is not None:
                    kind, params = choice
                    self.seed += 1
                    patch, painted = fit(bm, piece[1], piece[2] if len(piece) > 2 else None, kind, self.seed, params)
                    fitted = patch is not None
            if patch is not None:
                self.patches.append(patch)
            records.append((patch, faces, fitted, painted))
        plain = [p[:3] if len(p) > 3 else p for p in pieces]
        if joiner is not None:
            obj = joiner(name, [p[:2] for p in plain], collection)
        elif grained:
            obj = H.join_grained(name, plain, collection, sharp=sharp)
        else:
            obj = P.join(name, [p[:2] for p in plain], collection, sharp=sharp)
        assert sum(sum(len(c) for _, c in f) for _, f, _, _ in records) == len(obj.data.loops), name
        self.objects.append((obj, records))
        return obj

    def _hide(self):
        """Leaves out of the fitted patches what never shows: faces with another face within 3 cm
        before them (pressed to the wall, butted in, inside the room's own logs)."""
        from mathutils.bvhtree import BVHTree
        verts, polys = [], []
        for obj, _ in self.objects:
            base = len(verts)
            mw = obj.matrix_world
            verts.extend(mw @ v.co for v in obj.data.vertices)
            polys.extend([base + i for i in p.vertices] for p in obj.data.polygons)
        if not polys:
            return
        tree = BVHTree.FromPolygons(verts, polys, all_triangles=False, epsilon=0.0)
        for _, records in self.objects:
            for k, (patch, faces, fitted, painted) in enumerate(records):
                if not fitted:
                    continue
                shown = []
                for j, (nrm, corners) in enumerate(faces):
                    if painted is not None and not painted[j]:
                        shown.append(False)
                        continue
                    centre = sum(corners, Vector()) / len(corners)
                    hit = tree.ray_cast(centre + nrm * 0.002, nrm, 0.03)
                    shown.append(hit[0] is None)
                records[k] = (patch, faces, fitted, shown)
                if isinstance(patch, BoxPatch):
                    sides = {patch.side_of(nrm) for (nrm, _), s in zip(faces, shown) if s}
                    patch.set_faces([f for f in FACES if f in sides])
                elif isinstance(patch, LogPatch):
                    patch.crop([patch.angles(c) for (_, c), s in zip(faces, shown) if s])
        # A patch with nothing of it shown takes no room.
        keep = set()
        for _, records in self.objects:
            for patch, faces, fitted, shown in records:
                if patch is not None and (not fitted or any(shown)):
                    keep.add(id(patch))
        self.patches = [p for p in self.patches if id(p) in keep]

    def _fits(self, shape, density):
        """Where each patch lies in a map `shape` (wide, high) at `density` texels a metre, laid
        tallest first where it rests lowest on those already in (a skyline); None if they do not all
        fit."""
        width, height = shape
        m = self.margin
        sizes = [(max(2, math.ceil(p.w * density * p.scale)), max(2, math.ceil(p.h * density * p.scale)))
                 for p in self.patches]
        order = sorted(range(len(sizes)), key=lambda i: (-sizes[i][1], -sizes[i][0]))
        sky = np.zeros(width, dtype=np.int64)
        places = [None] * len(sizes)
        for i in order:
            w, h = sizes[i][0] + 2 * m, sizes[i][1] + 2 * m
            if w > width:
                return None
            rest = _sliding_max(sky, w)
            x = int(np.argmin(rest))
            y = int(rest[x])
            if y + h > height:
                return None
            sky[x:x + w] = y + h
            places[i] = (x + m, y + m)
        return places, sizes, int(sky.max())

    def pack(self):
        """Patches into the smallest map that holds them at the densest texels a metre (`density`'s
        first), or a hair less dense (5 texels a metre) rather than a map twice the size: square, or
        half as high as it is wide, a power of two across, as the game lays them out in its layers
        (see loadPaintMaps in Props.ts). If even the largest does not hold them, as densely as they
        fit it."""
        hi, lo = self.density
        shapes = []
        for size in self.sizes:
            if size // 2 >= 128:
                shapes.append((size, size // 2))
            shapes.append((size, size))
        found = None
        for shape in shapes:
            for density in ((hi, hi - 5) if shape != shapes[-1] else (hi,)):
                got = self._fits(shape, density)
                if got is not None:
                    found = (shape, density, got)
                    break
            if found is not None:
                break
        else:
            for density in range(hi - 5, lo - 1, -5):
                got = self._fits(shapes[-1], density)
                if got is not None:
                    found = (shapes[-1], density, got)
                    break
        if found is None:
            raise RuntimeError(f"{self.name}: the painted patches do not fit a {shapes[-1]} map")
        self.shape, self.texels, (places, sizes, rows) = found
        for p, at, sz in zip(self.patches, places, sizes):
            p.at, p.size_px = at, sz
        used = sum((w + 2 * self.margin) * (h + 2 * self.margin) for w, h in sizes)
        if os.environ.get("PAINT_REPORT"):
            area = {}
            for patch in self.patches:
                area[patch.kind] = area.get(patch.kind, 0.0) + patch.w * patch.h
            print("PAINT area by kind (m2):", {k: round(v, 1) for k, v in sorted(area.items(), key=lambda x: -x[1])})
            for patch in sorted(self.patches, key=lambda q: -q.w * q.h)[:25]:
                print(f"  {patch.kind} seed {patch.seed}: {patch.w:.2f} x {patch.h:.2f} m")
        w, h = self.shape
        print(f"PAINT {self.name}: {len(self.patches)} patches at {self.texels} texels a metre in a {w} x {h} map, "
              f"{100.0 * used / (w * h):.0f}% of it, {rows} rows")

    def finish(self, out_dir, quality=88):
        """Leave out what never shows, pack, give every joined object its `paint` UVs (after its other
        maps, so a house's night map stays first), paint the map and save it as WebP; returns what the
        game needs to read it."""
        self._hide()
        self.pack()
        mw, mh = self.shape
        kept = {id(p) for p in self.patches}
        for obj, records in self.objects:
            uvs = []
            for patch, faces, fitted, shown in records:
                for j, (nrm, corners) in enumerate(faces):
                    c = None
                    if patch is not None and id(patch) in kept and (shown is None or shown[j]):
                        c = patch.coords(nrm, corners)
                    if c is None:
                        uvs.extend((-1.0, -1.0) * len(corners))
                        continue
                    k = self.texels * patch.scale
                    for s, t in c:
                        sx = (patch.at[0] + s * k) / mw
                        ty = (patch.at[1] + (patch.h - t) * k) / mh
                        # Blender's V runs up from the map's foot; the exporter flips it back.
                        uvs.extend((sx, 1.0 - ty))
            layer = obj.data.uv_layers.new(name="paint")
            layer.data.foreach_set("uv", uvs)
            if "night" in obj.data.uv_layers:
                obj.data.uv_layers.active = obj.data.uv_layers["night"]
        image = np.zeros((mh, mw, 3), dtype=np.float32)
        image[:] = hexc("#7F6A55")
        for p in self.patches:
            self._paint_patch(p, image)
        srgb = np.where(image <= 0.0031308, image * 12.92, 1.055 * np.power(np.clip(image, 0.0, None), 1.0 / 2.4) - 0.055)
        path = os.path.join(out_dir, f"{self.name}_paint.webp")
        _write_webp(path, np.clip(srgb, 0.0, 1.0), quality)
        print(f"PAINT {self.name} -> {path} ({os.path.getsize(path) // 1024} KB)")
        return {"paint": {"map": f"{self.name}_paint.webp", "size": [mw, mh]}}

    def _paint_patch(self, p, image):
        """Paints one patch and the margin round it (its edge carried out, so the map's smaller copies
        do not bleed its neighbours into it)."""
        x0, y0 = p.at
        w, h = p.size_px
        m = self.margin
        xs = np.arange(x0 - m, x0 + w + m)
        ys = np.arange(y0 - m, y0 + h + m)
        X, Y = np.meshgrid(xs, ys)
        k = self.texels * p.scale
        s = np.clip((X + 0.5 - x0) / k, 0.0, p.w)
        t = np.clip(p.h - (Y + 0.5 - y0) / k, 0.0, p.h)
        d = p.surface(s.astype(np.float32), t.astype(np.float32))
        painter = PAINTERS[p.kind]
        col = painter(d, p, **{k: v for k, v in p.params.items() if not k.startswith("_")})
        # Texels on no face (the corners beside a box's ends) take the patch's own colour.
        col[d["face"] < 0] = p.colour
        Xc = np.clip(X, 0, image.shape[1] - 1)
        Yc = np.clip(Y, 0, image.shape[0] - 1)
        image[Yc, Xc] = col


def _write_webp(path, img, quality):
    """A WebP of img (H, W, 3), top row first, floats 0..1 (sRGB), lossy at `quality`."""
    h, w, _ = img.shape
    rgba = np.ones((h, w, 4), dtype=np.float32)
    rgba[..., :3] = img[::-1]
    image = bpy.data.images.new("paint_webp", w, h, alpha=False)
    try:
        image.colorspace_settings.name = "sRGB"
        image.pixels.foreach_set(rgba.ravel())
        image.file_format = "WEBP"
        os.makedirs(os.path.dirname(path), exist_ok=True)
        image.save(filepath=path, quality=quality)
    finally:
        bpy.data.images.remove(image)


# ---------------------------------------------------------------------------- pieces
def box(centre, x_axis, y_axis, size, kind=None, colour=None, seed=0, back=True, ends=True, along=None, front=None,
        faces=None, **params):
    """A box `size` (along x_axis, y_axis and their cross) centred on `centre`, as houses.oriented_box,
    with its paint: returns (bmesh, patch or None). `along` (0, 1 or 2) names the axis its grain and
    patch run along (its longest, if not given); its patch's front is its broad face toward `front`
    (if given), and running up a face is always up the patch."""
    x = x_axis.normalized()
    y = (y_axis - x * y_axis.dot(x)).normalized()
    z = x.cross(y)
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    m = Matrix.Identity(4)
    for row in range(3):
        m[row][0], m[row][1], m[row][2], m[row][3] = x[row] * size[0], y[row] * size[1], z[row] * size[2], centre[row]
    bmesh.ops.transform(bm, matrix=m, verts=bm.verts[:])
    if kind is None:
        return bm, None
    axes = [x, y, z]
    k = along if along is not None else max(range(3), key=lambda i: size[i])
    rest = [i for i in range(3) if i != k]
    wi = max(rest, key=lambda i: size[i])
    ni = [i for i in rest if i != wi][0]
    a, b, n = axes[k].copy(), axes[wi].copy(), axes[ni].copy()
    if a.z < -0.5:
        a = -a
    if b.z < -0.5:
        b = -b
    if front is not None and n.dot(front) < 0.0:
        n = -n
    if faces is None:
        faces = [f for f in FACES if (back or f != "-n") and (ends or f not in ("+a", "-a"))]
    patch = BoxPatch(kind, colour, seed, params, Vector(centre), a, b, n, (size[k], size[wi], size[ni]), faces=faces)
    return bm, patch
