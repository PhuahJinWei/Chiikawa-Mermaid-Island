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

    def loop_coords(self, face):
        """The patch coordinates (s, t) of each corner of one of the box's faces; None for a face
        not painted."""
        local = [((v.co - self.c).dot(self.a), (v.co - self.c).dot(self.b), (v.co - self.c).dot(self.n))
                 for v in (loop.vert for loop in face.loops)]
        nrm = face.normal
        side = max((("a", nrm.dot(self.a)), ("b", nrm.dot(self.b)), ("n", nrm.dot(self.n))), key=lambda x: abs(x[1]))
        name = ("+" if side[1] > 0 else "-") + side[0]
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
        return [((loop.vert.co - self.o).dot(self.u) - self.s0, (loop.vert.co - self.o).dot(self.v) - self.t0)
                for loop in face.loops]

    def surface(self, s, t):
        o, u, v = (np.array(x, dtype=np.float32) for x in (self.o, self.u, self.v))
        world = o + (s + self.s0)[..., None] * u + (t + self.t0)[..., None] * v
        normal = np.broadcast_to(np.array(self.normal, dtype=np.float32), s.shape + (3,))
        return {"face": np.zeros(s.shape, dtype=np.int8), "world": world, "along": s - self.w / 2,
                "across": t - self.h / 2, "xb": t, "xn": np.zeros_like(s), "normal": normal,
                "length": self.w, "width": self.h, "thick": 0.0}


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


PAINTERS = {"wood": wood, "board": painted_board, "metal": metal, "tin": tin, "enamel": enamel, "plastic": plastic,
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
    """Collects a house's painted pieces as they are joined (see join), packs their patches into one
    map, gives the joined objects their `paint` UVs, paints the map and saves it (see finish)."""

    def __init__(self, name, size=2048, margin=4, density=(170, 50)):
        self.name, self.size, self.margin, self.density = name, size, margin, density
        self.patches = []
        self.objects = []  # (object, [(patch or None, [(s, t)...] per loop or None)...])

    def join(self, name, pieces, collection, sharp=P.SHARP, grained=True):
        """Join (bmesh, colour[, grain[, paint]]) pieces as houses.join_grained does, noting each
        painted piece's patch and the patch coordinates of every corner of its faces first."""
        import houses as H
        loops = []
        for piece in pieces:
            bm = piece[0]
            spec = piece[3] if len(piece) > 3 else None
            patch = spec(bm) if callable(spec) else spec
            if patch is not None:
                self.patches.append(patch)
                bm.normal_update()
                coords = []
                for face in bm.faces:
                    c = patch.loop_coords(face)
                    coords.extend(c if c is not None else [None] * len(face.loops))
                loops.append((patch, coords))
            else:
                loops.append((None, [None] * sum(len(f.loops) for f in bm.faces)))
        plain = [p[:3] if len(p) > 3 else p for p in pieces]
        obj = H.join_grained(name, plain, collection, sharp=sharp) if grained else P.join(name, [p[:2] for p in plain],
                                                                                           collection, sharp=sharp)
        assert sum(len(c) for _, c in loops) == len(obj.data.loops), (name, sum(len(c) for _, c in loops), len(obj.data.loops))
        self.objects.append((obj, loops))
        return obj

    def pack(self):
        """Patches into the map, as densely as they fit (texels a metre): tallest first, each laid
        where it rests lowest on those already in (a skyline), so short patches fill in beside the
        tall ones."""
        hi, lo = self.density
        m = self.margin
        for density in range(hi, lo - 1, -5):
            sizes = [(max(2, math.ceil(p.w * density * p.scale)), max(2, math.ceil(p.h * density * p.scale)))
                     for p in self.patches]
            order = sorted(range(len(sizes)), key=lambda i: (-sizes[i][1], -sizes[i][0]))
            sky = np.zeros(self.size, dtype=np.int64)
            places = [None] * len(sizes)
            fits = True
            for i in order:
                w, h = sizes[i][0] + 2 * m, sizes[i][1] + 2 * m
                if w > self.size:
                    fits = False
                    break
                rest = _sliding_max(sky, w)
                x = int(np.argmin(rest))
                y = int(rest[x])
                if y + h > self.size:
                    fits = False
                    break
                sky[x:x + w] = y + h
                places[i] = (x + m, y + m)
            if fits:
                break
        else:
            raise RuntimeError(f"{self.name}: the painted patches do not fit a {self.size} map")
        y, shelf = int(sky.max()), 0
        self.texels = density
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
            content = sum(w * h for w, h in sizes)
            print(f"PAINT content {content} px, with margins {used} px")
        print(f"PAINT {self.name}: {len(self.patches)} patches at {density} texels a metre, "
              f"{100.0 * used / self.size ** 2:.0f}% of the map, {y + shelf} rows")

    def finish(self, out_dir, quality=88):
        """Pack, give every joined object its `paint` UVs (after its other maps, so the night map stays
        first), paint the map and save it as WebP; returns what the game needs to read it."""
        self.pack()
        n = self.size
        for obj, loops in self.objects:
            uvs = []
            for patch, coords in loops:
                for c in coords:
                    if patch is None or c is None:
                        uvs.extend((-1.0, -1.0))
                        continue
                    k = self.texels * patch.scale
                    sx = (patch.at[0] + c[0] * k) / n
                    ty = (patch.at[1] + (patch.h - c[1]) * k) / n
                    # Blender's V runs up from the map's foot; the exporter flips it back.
                    uvs.extend((sx, 1.0 - ty))
            layer = obj.data.uv_layers.new(name="paint")
            layer.data.foreach_set("uv", uvs)
            if "night" in obj.data.uv_layers:
                obj.data.uv_layers.active = obj.data.uv_layers["night"]
        image = np.zeros((n, n, 3), dtype=np.float32)
        image[:] = hexc("#7F6A55")
        for p in self.patches:
            self._paint_patch(p, image)
        srgb = np.where(image <= 0.0031308, image * 12.92, 1.055 * np.power(np.clip(image, 0.0, None), 1.0 / 2.4) - 0.055)
        path = os.path.join(out_dir, f"{self.name}_paint.webp")
        _write_webp(path, np.clip(srgb, 0.0, 1.0), quality)
        print(f"PAINT {self.name} -> {path} ({os.path.getsize(path) // 1024} KB)")
        return {"paint": {"map": f"{self.name}_paint.webp"}}

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
