"""島二郎, the restaurant at the end of the riverside path, after the film's frames of it (reference
images `shimajiro exterior 1`, `2`, `shimajiro interior 1` to `3`) and the user's sketches of it
(`shimajiro sketch front`, `shimajiro sketch three quarter`).

Outside, a tall box of a shop clad in weathered planks, grey brown, between dark square posts that
part its front into three bays: on the left a bench of potted plants against the planks, in the
middle the plank door with a small square window and a thick board over it, on the right two
riveted iron plates over boards running up and down. Over the front a wide sign board stands up off
the cornice, painted a pale cream and peeling, 島二郎 on it, a lamp on a curved arm over it; behind
it a roof of dark boards. Down the left side a lean-to of corrugated tin over stacked beer crates,
bottles and a bucket of sticks, a window under it. Beside the shop the tall standing sign, 貝汁, its
paint stained with rust, lit by a lamp on a pole wound with vines.

Inside, the film's room: warm planks laid across the walls over boards running up and down below a
dark rail, wide planks underfoot and a boarded ceiling on beams; by the door the kitchen, a pale
blue stove with big steel pots on it, ladles on a rail and pans on a shelf over it, jars on the
floor beside it; across the room a table under the window, a chair with a navy cushion and a stool,
the menu's three plaques on the wall, strings of shells hanging in the corner, a lamp hanging in
the room's middle, lit at night.

Every plank, post and board is painted in its own patch of the house's texture (paintmap.py), the
weather on it as the film paints it. Coordinates are Blender's: Z up, the shop faces -Y and stands
on its origin, the middle of its floor.
"""

import math

import bmesh
import numpy as np
from mathutils import Matrix, Vector

import build_props as P
import charlib as L
import houses as H
import paintmap as PM

V, UP, g = H.V, H.UP, H.g

C = {k: L.hex_color(v) for k, v in {
    # Outside: weathered planks, grey brown, each a little lighter or darker; the dark square posts,
    # the cornice and the sill; the roof's dark boards and battens.
    "plank": "#8E7A63", "plankLight": "#A08B71", "plankDark": "#7A6852",
    "post": "#5A4535", "cornice": "#5E4A39", "sill": "#4B3B2E", "slab": "#2C231C",
    "roof": "#5C5249", "batten": "#4A413A", "fascia": "#55473B",
    # The sign board's frame and its paint, the wood under the paint; the door's planks and frame.
    "frame": "#4A3426", "signPaint": "#EAE5D3", "door": "#8A7259", "doorFrame": "#57432F",
    # Iron: the riveted plates, the brackets, the lamps' arms and their green enamel shades, lit inside.
    "plate": "#8F979B", "iron": "#3E3733", "shade": "#3F5E4E", "shadeIn": "#FBE7B5", "bulb": "#FFF1C9",
    "glass": "#3B6B6A",
    # The lean-to's tin and its timbers; the beer crates, bottles and the bucket of sticks.
    "tin": "#9A9E9C", "crateBlue": "#3C78C2", "crateRed": "#9A4A36", "bottleBrown": "#5C3A1E",
    "bottleGreen": "#3F6D3E", "bottleClear": "#CFE3DA", "bottleLabel": "#E9DFC2", "cap": "#C9B37A",
    "bucket": "#E6E2D8", "stick": "#B9A27A",
    # The bench and its pots: a terracotta pot of purple flowers, a gourd of a vase with a sprout in it.
    "bench": "#7E6247", "pot": "#C7714E", "flower": "#A87ACB", "flowerHeart": "#F4E3A1", "leaf": "#4F8F4A",
    "leafLight": "#6FAE5C", "gourd": "#D9D38C", "gourdBase": "#4E9A8E", "step": "#9C8B74",
    # The vines up the lamp's pole.
    "vine": "#5DB64F", "vineDark": "#3F8F45",
    # Inside: warm golden planks, darker boards below the rail, the rail, skirting and posts dark; the
    # floor's planks; the ceiling and its beams.
    "inPlank": "#C28A50", "inBoard": "#B07A44", "rail": "#7A5636", "inPost": "#85603D", "inFrame": "#7E5A3A",
    "floor": "#CC8846", "ceiling": "#A07650", "beam": "#8A6038",
    # The kitchen: the pale blue stove, its steel top and dark knobs; steel and brass pots, a green pan;
    # the shelf; a brown jar glazed cream at its rim and a pale celadon one.
    "range": "#BFE0E3", "rangeTop": "#9BA7AA", "knob": "#3E4A52", "steel": "#B9BEC2", "steelDark": "#8D9398",
    "brass": "#C9A43C", "greenPan": "#9DA34E", "shelf": "#B98352", "jar": "#6E4A2E", "jarDrip": "#E8DFC9",
    "celadon": "#CFE2D9", "bowl": "#F2EEE6", "bowlRim": "#6F8FB8",
    # The table, the chair and the stool, the chair's navy cushion, a glass of water; the menu's
    # plaques; the shells, starfish and beads on their strings; a navy floor cushion with white fish.
    "table": "#D7A464", "chair": "#D29C5C", "cushion": "#2E3F66", "fish": "#E9EEF2", "glassCup": "#CFE7EF",
    "water": "#BFDDEA", "paper": "#EFE6CF", "shell": "#CFE6EE", "shellWhite": "#F4F1E6", "starfish": "#EADFC0",
    "bead": "#7EC8D6", "string": "#8A7A66", "branch": "#7B6248",
}.items()}

# ---------------------------------------------------------------------------- sizes
FLOOR = 0.25            # the floor's top over the ground
XO, YO = 2.3, 2.7       # half the walls' width (x) and depth (y), to their outer faces
T = 0.16                # the walls' thickness: the planks outside and in, on a dark frame
WALL = 3.1              # the walls' height over the floor
TOP = FLOOR + WALL      # the walls' top
CORNICE = 0.24          # the band round the walls' top
EAVE = TOP + CORNICE    # where the roof sits on it
PITCH = math.radians(27.0)
OVER = 0.38             # the roof's overhang past the side walls, and past the back
RIDGE = EAVE + XO * math.tan(PITCH) + 0.02  # the roof resting on the side walls' cornice
POST = 0.24             # the front's square posts
# The front's bays, from the left (-x) as one faces the shop: the bench's, the door's and the plates',
# each between two posts (widths after the film's frame of it).
BAYS = (1.26, 1.31, 1.07)
DOOR_W, DOOR_H = 1.15, 2.15
RAIL = 0.95             # the inside's rail, over the floor
SIGN = {"w": 3.0, "h": 1.45, "frame": 0.1}  # the board over the front
# The standing sign beside the shop, as tall as the film's: its top up by the board over the front.
KAIJIRU = {"x": 3.5, "y": -3.05, "w": 1.4, "h": 3.8, "legs": 0.62, "frame": 0.1}
LEAN = {"out": 1.65, "y0": -0.55, "y1": 2.45, "high": 2.7, "low": 2.12}  # the lean-to down the left side

# What the weather does to each kind of wood outside, for the painter (see paintmap.wood).
OUTSIDE = dict(weather=0.85, damp=0.55, edge=0.25, tone=0.12, grey=None)
TIMBER = dict(weather=0.5, damp=0.45, edge=0.12, tone=0.08, grain_lines=16.0, grain_dark=0.3, checks=0.7, nails=False,
              knots=1, texel=0.8)
# The roof, seen from below and afar, is painted more coarsely than the walls.
ROOFING = dict(weather=1.0, damp=0.0, edge=0.3, tone=0.1, grain_lines=22.0, knots=1, texel=0.55)
INSIDE = dict(weather=0.0, damp=0.0, edge=0.2, tone=0.1, grain_dark=0.22, light=0.14)
FURNITURE = dict(weather=0.0, damp=0.0, edge=0.12, tone=0.06, nails=False, knots=1, grain_dark=0.2)


def piece(pieces, centre, x_axis, y_axis, size, colour, kind=None, grain=0.35, seed=0, front=None, back=True,
          ends=True, along=None, **params):
    """A box (see paintmap.box) painted `kind` (or plain), its grain painted by the game too along
    its length that strongly; appended to `pieces`."""
    bm, patch = PM.box(V(*centre) if not isinstance(centre, Vector) else centre, x_axis, y_axis, size, kind,
                       colour, seed, back=back, ends=ends, along=along, front=front, **params)
    axis = patch.a if patch is not None else [x_axis, y_axis, x_axis.cross(y_axis)][max(range(3), key=lambda i: size[i])]
    pieces.append((bm, colour, axis.normalized() * grain if grain and kind in (None, "wood") else None, patch))
    return patch


def solid(pieces, bm, colour, grain=None):
    pieces.append((bm, colour, grain, None))


X, Y, Z = V(1, 0, 0), V(0, 1, 0), V(0, 0, 1)


# ---------------------------------------------------------------------------- walls
def planks_across(wall, u0, u1, v0, v1, colour, pieces, seed, outside=True, course=(0.19, 0.25), kind_params=OUTSIDE,
                  split=0.3, thick=0.022, tones=None, gap=0.006):
    """Planks laid across a wall's face (outside, or in), from u0 to u1 along it and v0 up to v1,
    stopping at its openings: courses of uneven height, a few broken by a butt joint, each a little
    lighter or darker, `gap` between them where the wall's dark frame shows (none in the room, whose
    joins are painted, so the lamp's light lies on them at night)."""
    v = v0
    k = 0
    clear = [(a - 0.004, b + 0.004, c - 0.004, d + 0.004) for a, b, c, d in wall.openings]
    while v < v1 - 0.04:
        h = course[0] + (course[1] - course[0]) * PM.rand(seed, k)
        top = min(v + h, v1)
        if v1 - top < 0.08:
            top = v1
        mid = (v + top) / 2
        spans = [(max(a0, b0, u0), min(a1, b1, u1)) for a0, a1 in H.solid_spans(wall.length, v + 0.002, clear)
                 for b0, b1 in H.solid_spans(wall.length, top - 0.002, clear) if min(a1, b1, u1) > max(a0, b0, u0)]
        for j, (s0, s1) in enumerate(spans):
            cuts = [s0, s1]
            if s1 - s0 > 1.2 and PM.rand(seed, 100 + k * 7 + j) < split:
                cut = s0 + (s1 - s0) * (0.3 + 0.4 * PM.rand(seed, 200 + k))
                cuts = [s0, cut, s1]
            for i, (a, b) in enumerate(zip(cuts, cuts[1:])):
                if b - a < 0.06:
                    continue
                depth = -thick / 2 - 0.002 if outside else wall.t + thick / 2 + 0.002
                tone_c = tones[int(PM.rand(seed, 300 + k * 5 + i) * len(tones))] if tones else colour
                c = wall.point((a + b) / 2 + (0.0015 if i % 2 and gap else 0.0), mid, depth)
                piece(pieces, c, wall.d, -wall.inward if outside else wall.inward, (b - a - (0.004 if gap else 0.0), thick, top - v - gap), tone_c,
                      "wood", seed=seed * 31 + k * 7 + i, front=-wall.inward if outside else wall.inward, back=False,
                      ends=False, along=0, **kind_params)
        v = top
        k += 1


def boards_up(wall, u0, u1, v0, v1, colour, pieces, seed, outside=True, width=(0.17, 0.23), kind_params=OUTSIDE,
              thick=0.022, tones=None, gap=0.006):
    """Boards standing up a wall's face from v0 to v1, side by side from u0 to u1, stopping at its
    openings, `gap` apart."""
    u = u0
    k = 0
    clear = [(a - 0.004, b + 0.004, c - 0.004, d + 0.004) for a, b, c, d in wall.openings]
    while u < u1 - 0.04:
        w = width[0] + (width[1] - width[0]) * PM.rand(seed, k)
        right = min(u + w, u1)
        if u1 - right < 0.06:
            right = u1
        for s0, s1 in H.solid_spans(wall.length, v0 + 0.01, clear):
            if s1 <= u or s0 >= right:
                continue
            a, b = max(u, s0), min(right, s1)
            if b - a < 0.05:
                continue
            depth = -thick / 2 - 0.002 if outside else wall.t + thick / 2 + 0.002
            tone_c = tones[int(PM.rand(seed, 300 + k) * len(tones))] if tones else colour
            c = wall.point((a + b) / 2, (v0 + v1) / 2, depth)
            piece(pieces, c, wall.d, -wall.inward if outside else wall.inward, (b - a - gap, thick, v1 - v0), tone_c,
                  "wood", seed=seed * 37 + k, front=-wall.inward if outside else wall.inward, back=False, ends=False,
                  along=2, **kind_params)
        u = right
        k += 1


def window(wall, opening, panes, pieces, inside, seed):
    """A window as the film's: a dark board frame, four panes (lit at night seen from outside) between
    a cross of bars, a sill under it outside, and its frame and sill inside too."""
    u0, u1, v0, v1 = opening
    w, h = u1 - u0, v1 - v0
    uc, vc = (u0 + u1) / 2, (v0 + v1) / 2
    bar, e = 0.08, 0.004
    out_n, in_n = -wall.inward, wall.inward
    for depth, n, target in ((-0.03, out_n, pieces), (wall.t + 0.03, in_n, inside)):
        for k, (c, size) in enumerate(((wall.point(uc, v1 + (bar - e) / 2, depth), (w + 2 * bar, 0.08, bar + e)),
                                       (wall.point(u0 - (bar - e) / 2, vc, depth), (bar + e, 0.08, h)),
                                       (wall.point(u1 + (bar - e) / 2, vc, depth), (bar + e, 0.08, h)))):
            piece(target, c, wall.d, wall.inward, size, C["doorFrame" if target is pieces else "inFrame"], "wood",
                  seed=seed + 11 * k + (0 if target is pieces else 5),
                  front=n, along=0 if size[0] > size[2] else 2, **TIMBER)
        sill_depth = -0.06 if target is pieces else wall.t + 0.05
        piece(target, wall.point(uc, v0 - bar / 2 + e, sill_depth), wall.d, wall.inward, (w + 2 * bar + 0.1, 0.13, bar + e),
              C["doorFrame" if target is pieces else "inFrame"], "wood", seed=seed + 40 + (0 if target is pieces else 3), front=UP, along=0, **TIMBER)
    panes.append((H.pane(wall.point(uc, vc, wall.t / 2 - H.PANE_OUT), wall.d, out_n, w + 2 * e, h + 2 * e), C["glass"]))
    # Boards lining the opening through the wall, its sides, head and sill.
    for k, (c, size) in enumerate(((wall.point(u0 + 0.011, vc, wall.t / 2), (0.022, wall.t + 0.004, h)),
                                   (wall.point(u1 - 0.011, vc, wall.t / 2), (0.022, wall.t + 0.004, h)),
                                   (wall.point(uc, v1 - 0.011, wall.t / 2), (w - 0.044, wall.t + 0.004, 0.022)),
                                   (wall.point(uc, v0 + 0.011, wall.t / 2), (w - 0.044, wall.t + 0.004, 0.022)))):
        piece(pieces, c, wall.d, wall.inward, size, C["doorFrame"], "wood", seed=seed + 60 + k,
              along=0 if size[0] > size[2] else 2, **TIMBER)
    for depth, target in ((wall.t / 2 - 0.02, pieces), (wall.t / 2 + 0.02, inside)):
        solid(target, H.oriented_box(wall.point(uc, vc, depth), wall.d, wall.inward, (0.035, 0.022, h - 0.03)), C["doorFrame"])
        solid(target, H.oriented_box(wall.point(uc, vc, depth), wall.d, wall.inward, (w - 0.03, 0.022, 0.035)), C["doorFrame"])


def build_walls(pieces, inside, panes, seed=7):
    """The four walls: a dark frame of slabs round their openings, planks across it outside (the
    front's bays as the film's), the room's planks and boards inside; the front's posts, the corner
    posts, the cornice round the top and the sill along the foot."""
    t = T
    x_posts = []
    x = -XO
    for k, bay in enumerate(BAYS):
        x_posts.append((x, x + POST))
        x += POST
        x += bay
    x_posts.append((x, x + POST))
    assert abs(x + POST - XO) < 1e-6, x + POST
    door_bay = (x_posts[1][1], x_posts[2][0])
    door_mid = (door_bay[0] + door_bay[1]) / 2
    door = (door_mid - DOOR_W / 2, door_mid + DOOR_W / 2)
    sill, head = 1.0, 1.85
    front = H.Wall((-XO, -YO + t / 2), (XO, -YO + t / 2), FLOOR, WALL, t,
                   [(door[0] + XO, door[1] + XO, 0.0, DOOR_H)])
    back = H.Wall((XO, YO - t / 2), (-XO, YO - t / 2), FLOOR, WALL, t, [(XO - 0.45, XO + 0.45, sill, head + 0.05)])
    left = H.Wall((-XO + t / 2, YO), (-XO + t / 2, -YO), FLOOR, WALL, t, [(YO - 1.55, YO - 0.8, sill, head - 0.05)])
    right = H.Wall((XO - t / 2, -YO), (XO - t / 2, YO), FLOOR, WALL, t)
    walls = (front, back, left, right)
    for w in walls:
        for bm, colour in w.skins(C["slab"], C["slab"]):
            solid(pieces, bm, colour)
    tones = (C["plank"], C["plankLight"], C["plankDark"], C["plank"])
    # The front: across the bench's bay all the way up; over the door; across the plates' bay over a rail,
    # boards standing up under it, and the two plates riveted on at the rail.
    for k, ((a0, a1), (b0, b1)) in enumerate(zip(x_posts, x_posts[1:])):
        u0, u1 = a1 + XO - 0.01, b0 + XO + 0.01
        if k == 0:
            planks_across(front, u0, u1, -FLOOR + 0.02, WALL, C["plank"], pieces, seed + k, tones=tones)
        elif k == 1:
            planks_across(front, u0, u1, DOOR_H, WALL, C["plank"], pieces, seed + k, tones=tones)
        else:
            rail_v = 1.25
            boards_up(front, u0, u1, -FLOOR + 0.02, rail_v, C["plank"], pieces, seed + k, tones=tones)
            planks_across(front, u0, u1, rail_v + 0.1, WALL, C["plank"], pieces, seed + k + 10, tones=tones)
            piece(pieces, front.point((u0 + u1) / 2, rail_v + 0.05, -0.03), front.d, -front.inward, (u1 - u0, 0.05, 0.1),
                  C["post"], "wood", seed=seed + 60, front=-front.inward, back=False, along=0, **TIMBER)
            for j, (p0, p1) in enumerate(((u0 + 0.06, (u0 + u1) / 2 - 0.01), ((u0 + u1) / 2 + 0.01, u1 - 0.06))):
                pw, ph = p1 - p0, 0.34
                pc = front.point((p0 + p1) / 2, rail_v + 0.12 + ph / 2, -0.03)
                rivets = [(sx * (pw / 2 - 0.035), sy * (ph / 2 - 0.035)) for sx in (-1, 1) for sy in (-1, 1)]
                piece(pieces, pc, front.d, -front.inward, (pw, 0.006, ph), C["plate"], "metal", seed=seed + 70 + j,
                      front=-front.inward, back=False, along=0, rust=0.65, rivets=rivets, texel=1.5)
                for rs, rt in rivets:
                    at = pc + front.d * rs + UP * rt - front.inward * 0.004
                    solid(pieces, L.ellipsoid_bm(at, (0.011, 0.011, 0.011), u=8, v=5), C["iron"])
    # The sides and the back: planks across, in two panels either side of a middle post; the door's
    # side of the left wall under the lean-to has its window.
    for w, s in ((left, 20), (right, 30), (back, 40)):
        planks_across(w, -0.01, w.length + 0.01, -FLOOR + 0.02, WALL, C["plank"], pieces, seed + s, tones=tones,
                      course=(0.2, 0.27))
    # The posts: four up the front, standing proud of its planks (the corner ones wide enough to cover
    # the side walls' plank ends), and the back corners' and the sides' middle ones.
    for k, (a0, a1) in enumerate(x_posts):
        a0, a1 = (a0 - 0.035, a1) if k == 0 else (a0, a1 + 0.035) if k == len(x_posts) - 1 else (a0, a1)
        # Its back stops inside the wall, short of the room's planks.
        c = V((a0 + a1) / 2, -YO + 0.03, (TOP - 0.01) / 2)
        piece(pieces, c, X, Y, (a1 - a0, POST - 0.06, TOP + 0.11), C["post"], "wood", seed=seed + 80 + k, front=-Y, along=2,
              back=False, ends=False, **TIMBER)
    for k, (px, py) in enumerate(((-XO + 0.05, YO - 0.05), (XO - 0.05, YO - 0.05), (-XO + 0.05, 0.0), (XO - 0.05, 0.0))):
        piece(pieces, V(px, py, (TOP - 0.01) / 2), X, Y, (0.2, 0.2, TOP + 0.11) if k < 2 else (0.18, 0.18, TOP + 0.11),
              C["post"], "wood", seed=seed + 90 + k, along=2, ends=False, **TIMBER)
    # The sill along the foot (the front's either side of the door, the step covering it there), and the
    # cornice round the top: a deep band standing out over the front. Where two meet at a corner, their
    # tops and feet are a centimetre apart, so none lies in another's plane.
    d0, d1 = door
    for k, (c, size) in enumerate(((V((-XO - 0.03 + d0 - 0.1) / 2, -YO - 0.02, 0.05), (d0 - 0.1 + XO + 0.03, 0.12, 0.3)),
                                   (V((d1 + 0.1 + XO + 0.03) / 2, -YO - 0.02, 0.05), (XO + 0.03 - d1 - 0.1, 0.12, 0.3)),
                                   (V(0.0, YO + 0.02, 0.06), (2 * XO + 0.06, 0.12, 0.32)),
                                   (V(-XO - 0.02, 0.0, 0.055), (0.12, 2 * YO + 0.02, 0.33)),
                                   (V(XO + 0.02, 0.0, 0.055), (0.12, 2 * YO + 0.02, 0.33)))):
        piece(pieces, c, X, Y, size, C["sill"], "wood", seed=seed + 100 + k, along=0 if size[0] > size[1] else 1,
              ends=False, **TIMBER)
    for k, (c, size, n) in enumerate(((V(0.0, -YO - 0.07, TOP + (CORNICE + 0.012) / 2), (2 * XO + 0.3, 0.2, CORNICE + 0.012), -Y),
                                      (V(-XO - 0.06, 0.0, TOP + 0.01 + (CORNICE - 0.01) / 2), (0.16, 2 * YO + 0.1, CORNICE - 0.01), -X),
                                      (V(XO + 0.06, 0.0, TOP + 0.01 + (CORNICE - 0.01) / 2), (0.16, 2 * YO + 0.1, CORNICE - 0.01), X),
                                      (V(0.0, YO + 0.05, TOP + 0.02 + (CORNICE - 0.03) / 2), (2 * XO + 0.1, 0.14, CORNICE - 0.03), Y))):
        piece(pieces, c, X, Y, size, C["cornice"], "wood", seed=seed + 110 + k, front=n, along=0 if size[0] > size[1] else 1,
              faces=["+n", "+b", "-b", "+a", "-a"], **TIMBER)
    # A drip board along the cornice's top edge at the front, a little prouder.
    piece(pieces, V(0.0, -YO - 0.13, EAVE - 0.02), X, Y, (2 * XO + 0.4, 0.12, 0.05), C["post"], "wood", seed=seed + 120,
          along=0, **TIMBER)
    # Inside: planks across above the rail, boards standing up under it, the rail, the skirting and the
    # corner posts; the walls' inner frame between them, dark.
    for k, w in enumerate(walls):
        # The side walls' planks run on into the corners; the front's and the back's stop short of them,
        # behind the corner posts, so the two never lie over one another there.
        reach = (t + 0.025, w.length - t - 0.025) if k < 2 else (t - 0.01, w.length - t + 0.01)
        planks_across(w, reach[0], reach[1], RAIL + 0.08, WALL, C["inPlank"], inside, seed + 200 + k, outside=False,
                      course=(0.17, 0.22), kind_params=INSIDE, thick=0.018, gap=0.0,
                      tones=(C["inPlank"], tuple(c * 1.06 for c in C["inPlank"]), tuple(c * 0.93 for c in C["inPlank"])))
        boards_up(w, reach[0], reach[1], 0.1, RAIL, C["inBoard"], inside, seed + 210 + k, outside=False, kind_params=INSIDE,
                  thick=0.018, gap=0.0, tones=(C["inBoard"], tuple(c * 1.05 for c in C["inBoard"]), tuple(c * 0.94 for c in C["inBoard"])))
        for v, hgt, depth, name in ((RAIL + 0.04, 0.08, 0.035, "rail"), (0.05, 0.1, 0.03, "skirt")):
            for s0, s1 in H.solid_spans(w.length, v, [(a - 0.01, b + 0.01, c, d) for a, b, c, d in w.openings]):
                s0, s1 = max(s0, reach[0]), min(s1, reach[1])
                if s1 - s0 < 0.05:
                    continue
                c = w.point((s0 + s1) / 2, v, w.t + depth / 2 + 0.002)
                piece(inside, c, w.d, w.inward, (s1 - s0, depth, hgt), C["rail"], "wood", seed=seed + 230 + k * 3 + len(name),
                      front=w.inward, back=False, along=0, **dict(INSIDE, tone=0.05, grain_dark=0.3))
    for k, (px, py) in enumerate(((-XO + t + 0.049, -YO + t + 0.049), (XO - t - 0.049, -YO + t + 0.049),
                                  (-XO + t + 0.049, YO - t - 0.049), (XO - t - 0.049, YO - t - 0.049))):
        piece(inside, V(px, py, FLOOR + WALL / 2), X, Y, (0.13, 0.13, WALL), C["inPost"], "wood", seed=seed + 250 + k,
              along=2, **dict(INSIDE, tone=0.05, grain_dark=0.3))
    window(back, back.openings[0], panes, pieces, inside, seed + 300)
    window(left, left.openings[0], panes, pieces, inside, seed + 320)
    return walls, door, x_posts


# ---------------------------------------------------------------------------- the door
def build_door(door, pieces, inside, panes, seed=400):
    """The door's frame, outside and in, and the plank door standing open into the room, hung on the
    frame's right as one faces the shop: five planks, two battens across their back, a small square
    window lit at night in its middle plank, a long iron handle; the thick board over the doorway, on
    two brackets; the step up to it."""
    d0, d1 = door
    for k, (target, y, n) in enumerate(((pieces, -YO - 0.02, -Y), (inside, -YO + T + 0.02, Y))):
        frame = C["doorFrame"] if target is pieces else C["inFrame"]
        piece(target, V((d0 + d1) / 2, y, FLOOR + DOOR_H + 0.043), X, Y, (DOOR_W + 0.2, 0.06, 0.094), frame, "wood",
              seed=seed + k, front=n, along=0, **TIMBER)
        for j, x in enumerate((d0 - 0.045, d1 + 0.045)):
            piece(target, V(x, y, FLOOR + DOOR_H / 2), X, Y, (0.09, 0.06, DOOR_H), frame, "wood",
                  seed=seed + 2 + k * 2 + j, front=n, along=2, **TIMBER)
    # The jambs lining the opening through the wall, and the threshold.
    for j, x in enumerate((d0 + 0.012, d1 - 0.012)):
        piece(pieces, V(x, -YO + T / 2, FLOOR + DOOR_H / 2), X, Y, (0.024, T + 0.004, DOOR_H), C["doorFrame"], "wood",
              seed=seed + 10 + j, along=2, **TIMBER)
    piece(pieces, V((d0 + d1) / 2, -YO + T / 2, FLOOR - 0.015), X, Y, (DOOR_W - 0.05, T + 0.06, 0.04), C["step"], "wood",
          seed=seed + 12, along=0, **dict(TIMBER, weather=0.3))
    # The leaf, open a little past a right angle into the room on its hinge.
    hinge = V(d1 - 0.03, -YO + T + 0.03, 0.0)
    angle = math.radians(-98.0)
    along = V(math.cos(math.pi + angle), math.sin(math.pi + angle), 0.0)  # from the hinge toward the free edge
    out = V(-along.y, along.x, 0.0)  # the leaf's outer face, toward -Y when shut
    leaf_w, leaf_h, leaf_t = DOOR_W - 0.06, DOOR_H - 0.04, 0.045
    foot = FLOOR + 0.01
    centre = hinge + along * (leaf_w / 2) + UP * (foot + leaf_h / 2)
    planks = 5
    pw = leaf_w / planks
    hole_z0, hole_z1 = 1.36, 1.62  # the window's hole up the leaf, through its middle plank
    for k in range(planks):
        c = centre + along * ((k + 0.5) * pw - leaf_w / 2)
        spans = ((0.0, hole_z0), (hole_z1, leaf_h)) if k == planks // 2 else ((0.0, leaf_h),)
        for j, (z0, z1) in enumerate(spans):
            piece(pieces, c + UP * ((z0 + z1) / 2 - leaf_h / 2), along, out, (pw - 0.006, leaf_t, z1 - z0), C["door"], "wood",
                  seed=seed + 20 + k * 2 + j, front=out, along=2, **dict(OUTSIDE, damp=0.25, weather=0.5))
    for z in (0.35, leaf_h - 0.35):
        piece(pieces, centre - out * (leaf_t / 2 + 0.012) + UP * (z - leaf_h / 2), along, out, (leaf_w - 0.08, 0.024, 0.12),
              C["door"], "wood", seed=seed + 30 + int(z * 10), front=-out, along=0, **dict(OUTSIDE, damp=0.0, weather=0.3))
    # Its window: a frame on both faces round the hole, and a pane facing each way in it.
    wc = centre + UP * ((hole_z0 + hole_z1) / 2 - leaf_h / 2)
    hw, hh = pw - 0.006, hole_z1 - hole_z0
    for side in (1.0, -1.0):
        for c, size in ((wc + UP * (hh / 2 + 0.02), (hw + 0.1, 0.03, 0.05)), (wc - UP * (hh / 2 + 0.02), (hw + 0.1, 0.03, 0.05)),
                        (wc + along * (hw / 2 + 0.02), (0.05, 0.03, hh + 0.01)), (wc - along * (hw / 2 + 0.02), (0.05, 0.03, hh + 0.01))):
            solid(pieces, H.oriented_box(c + out * side * (leaf_t / 2 + 0.014), along, out, size), C["doorFrame"])
    panes.append((H.pane(wc + out * 0.004, along, out, hw + 0.01, hh + 0.01), C["glass"]))
    panes.append((H.pane(wc - out * 0.004, along, -out, hw + 0.01, hh + 0.01), C["glass"]))
    # The long iron handle near its free edge, outside, and a small pull inside.
    hx = centre + along * (leaf_w / 2 - 0.1) + UP * (1.05 - leaf_h / 2)
    for dz in (0.2, -0.2):
        solid(pieces, H.oriented_box(hx + out * (leaf_t / 2 + 0.03) + UP * dz, out, along, (0.06, 0.03, 0.03)), C["iron"])
    solid(pieces, H.oriented_box(hx + out * (leaf_t / 2 + 0.06), UP, out, (0.46, 0.035, 0.035)), C["iron"])
    solid(pieces, H.oriented_box(hx - out * (leaf_t / 2 + 0.03), UP, out, (0.14, 0.03, 0.03)), C["iron"])
    # The thick board over the doorway, its front edge rounded, on two iron brackets.
    bz = FLOOR + DOOR_H + 0.22
    piece(pieces, V((d0 + d1) / 2, -YO - 0.2, bz), X, Y, (DOOR_W + 0.38, 0.4, 0.09), C["plank"], "wood", seed=seed + 40,
          front=UP, along=0, **dict(OUTSIDE, damp=0.0, weather=1.0))
    solid(pieces, P.segment_bm(V(d0 - 0.185, -YO - 0.405, bz), V(d1 + 0.185, -YO - 0.405, bz), 0.053, 0.053, 10), C["plankDark"])
    for x in (d0 + 0.05, d1 - 0.05):
        solid(pieces, H.oriented_box(V(x, -YO - 0.14, bz - 0.12), V(0, 1, 1), X, (0.34, 0.025, 0.03)), C["iron"])
    # The step: a pale plank on a block, from the ground up halfway to the floor.
    piece(pieces, V((d0 + d1) / 2, -YO - 0.21, FLOOR / 2 - 0.02), X, Y, (DOOR_W + 0.24, 0.42, 0.06), C["step"], "wood",
          seed=seed + 50, front=UP, along=0, **dict(OUTSIDE, damp=0.3, weather=0.6))
    solid(pieces, P.box_bm(V((d0 + d1) / 2, -YO - 0.2, -0.06), (DOOR_W + 0.1, 0.36, 0.28)), C["sill"])
    return hinge, along, leaf_w


# ---------------------------------------------------------------------------- the roof
def build_roof(pieces, far):
    """A gable roof over the walls, its ridge running back from the front: two slopes of dark boards
    laid down them under battens over their joins, a fascia board along the eaves, the gables boarded
    up and down; the front's hidden behind the sign board. A stovepipe through its left slope."""
    half = XO + OVER
    y0, y1 = -YO - 0.12, YO + OVER
    length = half / math.cos(PITCH)
    thick = 0.08
    for sx in (-1.0, 1.0):
        down = V(sx * math.cos(PITCH), 0.0, -math.sin(PITCH))
        normal = V(sx * math.sin(PITCH), 0.0, math.cos(PITCH))
        top = V(0.0, 0.0, RIDGE)
        c = top + down * (length / 2) + normal * (thick / 2) + V(0.0, (y0 + y1) / 2, 0.0)
        solid(pieces, H.oriented_box(c, down, Y, (length, y1 - y0, thick)), C["slab"])
        far.append((H.oriented_box(c, down, Y, (length, y1 - y0, thick + 0.04)), C["roof"]))
        n = round((y1 - y0) / 0.24)
        w = (y1 - y0) / n
        for k in range(n):
            yc = y0 + (k + 0.5) * w
            bc = top + down * (length / 2 + 0.01) + normal * (thick + 0.012) + V(0.0, yc, 0.0)
            piece(pieces, bc, down, Y, (length + 0.03, w - 0.008, 0.022), C["roof"], "wood", seed=500 + int(sx * 50) + k,
                  front=normal, back=False, along=0, **ROOFING)
            if k > 0:
                piece(pieces, top + down * (length / 2 + 0.01) + normal * (thick + 0.035) + V(0.0, y0 + k * w, 0.0), down, Y,
                      (length + 0.03, 0.06, 0.026), C["batten"], "wood", seed=600 + int(sx * 50) + k, front=normal,
                      back=False, along=0, **dict(ROOFING, edge=0.1, knots=0))
        # The fascia along the eave, and the soffit under the overhang.
        eave_pt = top + down * length + normal * (thick / 2)
        piece(pieces, eave_pt + V(0.0, (y0 + y1) / 2, -0.06), Y, X, (y1 - y0 + 0.02, 0.04, 0.2), C["fascia"], "wood",
              seed=650 + int(sx), front=V(sx, 0, 0), along=0, **TIMBER)
    # The ridge's cap.
    piece(pieces, V(0.0, (y0 + y1) / 2, RIDGE + 0.1), Y, X, (y1 - y0 + 0.04, 0.2, 0.06), C["batten"], "wood", seed=660,
          front=UP, along=0, **ROOFING)
    # The gables: boards standing up from the walls' top to the roof, the back's seen, the front's behind
    # the sign. Each board's top follows the slope under the roof.
    for k, (y, n, slab_y) in enumerate(((YO + 0.013, Y, YO - T), (-YO - 0.013, -Y, -YO))):
        bx = -XO
        j = 0
        while bx < XO - 0.02:
            w = 0.2
            mid = bx + w / 2
            top_z = RIDGE - abs(mid) * math.tan(PITCH) - 0.06
            if top_z > EAVE + 0.04:
                piece(pieces, V(mid, y, (EAVE + top_z) / 2 + 0.006), X, Y, (w - 0.006, 0.022, top_z - EAVE - 0.012), C["plank"],
                      "wood", seed=700 + k * 40 + j, front=n, back=False, ends=False, along=2, **dict(OUTSIDE, texel=0.7))
            bx += w
            j += 1
        solid(pieces, H.gable_bm(slab_y, XO, EAVE - 0.01, RIDGE - 0.08, T), C["slab"])
        # The bargeboards down the gable's edges under the roof, over the boards' tops; the right one a
        # centimetre further out, so the two never share a face where they cross at the top.
        for sx in (-1.0, 1.0):
            down = V(sx * math.cos(PITCH), 0.0, -math.sin(PITCH))
            run = (XO + OVER) / math.cos(PITCH) + 0.05
            c = V(0.0, y + n.y * (0.03 + (0.01 if sx > 0 else 0.0)), RIDGE - 0.14) + down * (run / 2)
            piece(pieces, c, down, Y, (run, 0.03, 0.22), C["fascia"], "wood", seed=760 + k * 2 + int(sx > 0), front=n,
                  back=False, along=0, **TIMBER)
    # The stovepipe, near the back of the left slope, a cap on it.
    px, py = -1.2, YO - 0.9
    pz = RIDGE - abs(px) * math.tan(PITCH)
    solid(pieces, P.segment_bm(V(px, py, pz - 0.3), V(px, py, RIDGE + 0.9), 0.09, 0.09, 12), C["iron"])
    solid(pieces, L.cone_bm(V(px, py, RIDGE + 0.9), UP, 0.17, 0.14, segments=12), C["iron"])
    return length


# ---------------------------------------------------------------------------- the sign board
def gooseneck(base, reach, rise, pieces, glow, aim, seed=0, radius=0.016):
    """A lamp on a curved iron arm from `base`: up `rise`, then out along `reach`, at its end a green
    enamel shade turned to light the way `aim` points, its bulb and the shade's inside lit at night
    (into `glow`)."""
    pts = []
    out = reach.normalized()
    for k in range(13):
        a = k / 12 * math.pi / 2
        pts.append(base + UP * (rise * math.sin(a)) + reach * (1.0 - math.cos(a)))
    for p, q in zip(pts, pts[1:]):
        solid(pieces, P.segment_bm(p, q, radius, radius, 8), C["iron"])
    tip = pts[-1]
    axis = aim.normalized()
    mouth = tip + axis * 0.16
    rot = UP.rotation_difference(-axis).to_matrix().to_4x4()
    # The shade: a shallow cone open toward `axis`, a thin solid (outside and inside), its rim rolled.
    prof = L.Profile([(0.025, 0.16), (0.07, 0.12), (0.14, 0.04), (0.17, 0.0)], samples=8)
    outer = L.lathe_bm(prof.samples, segments=16)
    L.transformed(outer, Matrix.Translation(mouth) @ rot)
    solid(pieces, outer, C["shade"])
    inner = L.lathe_bm([(r * 0.92, z + 0.008) for r, z in prof.samples], segments=16)
    L.transformed(inner, Matrix.Translation(mouth) @ rot)
    for f in inner.faces:
        f.normal_flip()
    glow.append((inner, C["shadeIn"]))
    glow.append((L.ellipsoid_bm(mouth - axis * 0.06, (0.05, 0.05, 0.05), u=8, v=6), C["bulb"]))
    return mouth


def build_sign_board(pieces, glow, labels, collection, far):
    """The board standing up off the cornice over the front: a dark frame round a painted face, two
    struts behind it into the roof, the lamp on a curved arm over its top; its face for 島二郎."""
    w, h, f = SIGN["w"], SIGN["h"], SIGN["frame"]
    y = -YO - 0.12
    z0 = EAVE + 0.02
    zc = z0 + h / 2
    piece(pieces, V(0.0, y + 0.01, zc), X, Y, (w - 2 * f + 0.01, 0.04, h - 2 * f + 0.01), C["signPaint"], "board",
          seed=800, front=-Y, along=0, back=False, ends=False, peel=0.5, stain=0.55, texel=1.4)
    piece(pieces, V(0.0, y + 0.045, zc), X, Y, (w - 2 * f + 0.01, 0.03, h - 2 * f + 0.01), C["plankDark"], "wood",
          seed=801, front=Y, along=0, back=False, **OUTSIDE)
    for k, (c, size) in enumerate(((V(0.0, y - 0.005, z0 + h - f / 2), (w, 0.08, f)), (V(0.0, y - 0.005, z0 + f / 2), (w, 0.08, f)),
                                   (V(-w / 2 + f / 2, y - 0.005, zc), (f, 0.08, h - 2 * f)),
                                   (V(w / 2 - f / 2, y - 0.005, zc), (f, 0.08, h - 2 * f)))):
        piece(pieces, c, X, Y, size, C["frame"], "wood", seed=810 + k, front=-Y, along=0 if size[0] > size[2] else 2,
              **dict(TIMBER, weather=0.6))
    for x in (-w / 2 + 0.35, w / 2 - 0.35):
        solid(pieces, H.oriented_box(V(x, y + 0.45, z0 + 0.45), V(0, 1, -0.9), X, (0.95, 0.06, 0.06)), C["post"])
    far.append((P.box_bm(V(0.0, y, zc), (w, 0.1, h)), C["signPaint"]))
    face, uvs = P.label_bm(V(0.0, y + 0.01 - 0.02, zc), w - 2 * f - 0.12, h - 2 * f - 0.12)
    labels.append(P.object_with_uv("restaurant_label", face, uvs, collection))
    gooseneck(V(0.0, y + 0.02, z0 + h), V(0.0, -0.78, 0.0), 0.3, pieces, glow, V(0.0, 0.62, -0.78), seed=820)
    return {"size": [round(w - 2 * f - 0.12, 3), round(h - 2 * f - 0.12, 3)], "colour": "#3B2620"}


def heart_vine(foot, top, pieces, turns=3.0, leaves=26, seed=0):
    """A vine wound up a pole from `foot` to `top`, heart-shaped leaves along it."""
    span = top - foot
    for k in range(leaves):
        f = (k + 0.5) / leaves
        a = turns * 2 * math.pi * f + seed
        at = foot + span * f + V(math.cos(a), math.sin(a), 0.0) * 0.07
        out = V(math.cos(a), math.sin(a), 0.2 * math.sin(a * 1.7))
        solid(pieces, P.heart_leaf_bm(at, out, 0.035 + 0.012 * ((k * 7) % 3) / 2), C["vine"] if k % 2 else C["vineDark"])
    for k in range(int(turns * 10)):
        f0, f1 = k / (turns * 10), (k + 1) / (turns * 10)
        a0, a1 = turns * 2 * math.pi * f0 + seed, turns * 2 * math.pi * f1 + seed
        p = foot + span * f0 + V(math.cos(a0), math.sin(a0), 0.0) * 0.05
        q = foot + span * f1 + V(math.cos(a1), math.sin(a1), 0.0) * 0.05
        solid(pieces, P.segment_bm(p, q, 0.009, 0.009, 4), C["vineDark"])


def build_kaijiru(pieces, glow, labels, collection, far):
    """The tall standing sign beside the shop: a dark frame round a board painted a pale cream, rust
    and grime run down it, on two legs; 貝汁 down its face. Beside it the lamp on its pole, a curved arm
    over the sign's top, vines wound up the pole."""
    k = KAIJIRU
    x, y, w, h, legs, f = k["x"], k["y"], k["w"], k["h"], k["legs"], k["frame"]
    z0 = legs
    zc = z0 + h / 2
    for s, n in ((0.0, -Y), (0.03, Y)):
        piece(pieces, V(x, y + 0.015 + s, zc), X, Y, (w - 2 * f + 0.01, 0.03, h - 2 * f + 0.01), C["signPaint"], "board",
              seed=900 + int(s * 100), front=n, along=0, back=False, ends=False, peel=0.3, stain=0.95, stain_colour="#8A4E2C",
              texel=1.2)
    for j, (c, size) in enumerate(((V(x, y + 0.03, z0 + h - f / 2), (w, 0.1, f)), (V(x, y + 0.03, z0 + f / 2), (w, 0.1, f)),
                                   (V(x - w / 2 + f / 2, y + 0.03, zc), (f, 0.1, h - 2 * f)),
                                   (V(x + w / 2 - f / 2, y + 0.03, zc), (f, 0.1, h - 2 * f)))):
        piece(pieces, c, X, Y, size, C["frame"], "wood", seed=910 + j, along=0 if size[0] > size[2] else 2,
              **dict(TIMBER, weather=0.6))
    for j, lx in enumerate((x - w / 2 + 0.16, x + w / 2 - 0.16)):
        piece(pieces, V(lx, y + 0.03, (z0 + 0.12) / 2 - 0.1), X, Y, (0.09, 0.09, z0 + 0.32), C["frame"], "wood", seed=920 + j,
              along=2, **TIMBER)
    far.append((P.box_bm(V(x, y + 0.03, zc), (w, 0.1, h)), C["signPaint"]))
    face, uvs = P.label_bm(V(x, y + 0.015 - 0.015, zc), w - 2 * f - 0.14, h - 2 * f - 0.2)
    labels.append(P.object_with_uv("restaurant_label1", face, uvs, collection))
    # The lamp's pole, the vine wound up it, the arm curving over the sign's top.
    px = x + w / 2 + 0.38
    top = z0 + h + 0.55
    solid(pieces, P.segment_bm(V(px, y + 0.03, -0.2), V(px, y + 0.03, top), 0.045, 0.04, 10), C["iron"])
    heart_vine(V(px, y + 0.03, 0.15), V(px, y + 0.03, top - 0.5), pieces, turns=6.0, leaves=80, seed=1.3)
    gooseneck(V(px, y + 0.03, top), V(-0.45, -0.7, 0.0), 0.2, pieces, glow, V(-0.25, 0.55, -0.8), seed=930)
    return {"size": [round(w - 2 * f - 0.14, 3), round(h - 2 * f - 0.2, 3)], "vertical": True, "colour": "#3B2620"}, \
        [(x - w / 2 + 0.16, y + 0.03, 0.08), (x + w / 2 - 0.16, y + 0.03, 0.08), (px, y + 0.03, 0.08)]


# ---------------------------------------------------------------------------- the lean-to and goods
def corrugated(origin, along, down, length, drop, pieces, colour, seed, pitch=0.076, depth=0.018):
    """A sheet of corrugated tin `length` along its ribs' way across (`along`) and `drop` down its
    slope (`down`), its ribs running down it; a thin solid, painted as tin."""
    n_ribs = max(2, round(length / pitch))
    steps = n_ribs * 6
    normal = along.cross(down).normalized()
    if normal.z < 0:
        normal = -normal
    bm = bmesh.new()
    rows = []
    for side in (0.0, -0.004):
        for edge in (0.0, drop):
            row = []
            for i in range(steps + 1):
                a = i / steps * length
                wave = depth * 0.5 * math.cos(2 * math.pi * a / pitch)
                row.append(bm.verts.new(origin + along * a + down * edge + normal * (wave + side)))
            rows.append(row)
    top0, top1, bot0, bot1 = rows
    for i in range(steps):
        bm.faces.new((top0[i], top0[i + 1], top1[i + 1], top1[i]))
        bm.faces.new((bot0[i + 1], bot0[i], bot1[i], bot1[i + 1]))
        bm.faces.new((top0[i + 1], top0[i], bot0[i], bot0[i + 1]))
        bm.faces.new((top1[i], top1[i + 1], bot1[i + 1], bot1[i]))
    bm.faces.new((top0[0], top1[0], bot1[0], bot0[0]))
    bm.faces.new((top1[-1], top0[-1], bot0[-1], bot1[-1]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    patch = PM.SheetPatch("tin", colour, seed, {"rust": 0.55, "texel": 0.7}, bm, origin, down, along)
    pieces.append((bm, colour, None, patch))


def crate(at, colour, pieces, seed, bottles=True, turn=0.0):
    """A plastic beer crate, open on top, its sides slotted, bottles standing in it."""
    a = V(math.cos(turn), math.sin(turn), 0.0)
    b = V(-a.y, a.x, 0.0)
    w, d, h = 0.46, 0.34, 0.3
    for k, (c, size, n) in enumerate(((at + b * (d / 2 - 0.01) + UP * (h / 2), (w, 0.02, h), b),
                                      (at - b * (d / 2 - 0.01) + UP * (h / 2), (w, 0.02, h), -b),
                                      (at + a * (w / 2 - 0.01) + UP * (h / 2), (0.02, d - 0.04, h), a),
                                      (at - a * (w / 2 - 0.01) + UP * (h / 2), (0.02, d - 0.04, h), -a))):
        piece(pieces, c, a, b, size, colour, "plastic", seed=seed + k, front=n, back=False, along=0 if size[0] > size[1] else 1,
              texel=0.8)
    solid(pieces, H.oriented_box(at + UP * 0.02, a, b, (w - 0.03, d - 0.03, 0.03)), colour)
    # Slots in its sides: dark bars.
    for side in (1, -1):
        for j in range(3):
            c = at + b * side * (d / 2 + 0.001) + a * ((j - 1) * 0.13) + UP * (h - 0.07)
            solid(pieces, H.oriented_box(c, a, b, (0.09, 0.004, 0.04)), tuple(x * 0.45 for x in colour))
    if bottles:
        for i in range(4):
            for j in range(3):
                p = at + a * ((i - 1.5) * 0.105) + b * ((j - 1) * 0.1) + UP * 0.03
                solid(pieces, P.segment_bm(p, p + UP * 0.3, 0.032, 0.032, 8), C["bottleBrown"])
                solid(pieces, P.segment_bm(p + UP * 0.3, p + UP * 0.36, 0.014, 0.012, 6), C["bottleBrown"])
                solid(pieces, P.segment_bm(p + UP * 0.36, p + UP * 0.375, 0.016, 0.016, 6), C["cap"])
    return h


def bottle(at, colour, pieces, tall=0.32, label=True):
    """A bottle on the ground: a sake bottle, tall, or a short beer one."""
    solid(pieces, P.segment_bm(at, at + UP * tall, 0.04, 0.04, 10), colour)
    solid(pieces, P.segment_bm(at + UP * tall, at + UP * (tall + 0.08), 0.04, 0.016, 8), colour)
    solid(pieces, P.segment_bm(at + UP * (tall + 0.08), at + UP * (tall + 0.13), 0.016, 0.016, 6), colour)
    if label:
        solid(pieces, P.segment_bm(at + UP * (tall * 0.3), at + UP * (tall * 0.7), 0.045, 0.045, 10), C["bottleLabel"])


def build_lean_to(pieces, far, blocks):
    """The lean-to down the shop's left side: a ledger on the wall, two posts out at its edge and a
    beam along them, rafters across, three sheets of corrugated tin; under it beer crates stacked,
    bottles, and a bucket of sticks by the shop's front corner."""
    k = LEAN
    xw = -XO - 0.04
    xo = -XO - k["out"]
    piece(pieces, V(xw - 0.05, (k["y0"] + k["y1"]) / 2, k["high"] - 0.08), Y, X, (k["y1"] - k["y0"], 0.1, 0.14), C["post"],
          "wood", seed=1000, front=-X, along=0, **TIMBER)
    for j, py in enumerate((k["y0"] + 0.08, k["y1"] - 0.08)):
        piece(pieces, V(xo + 0.05, py, (k["low"] - 0.1) / 2), X, Y, (0.1, 0.1, k["low"] + 0.1), C["post"], "wood", seed=1010 + j,
              along=2, **TIMBER)
        blocks.append({"circle": [*g(xo + 0.05, py), 0.08], "y": [-1, k["low"]], "walk": True, "camera": False})
    piece(pieces, V(xo + 0.05, (k["y0"] + k["y1"]) / 2, k["low"] - 0.04), Y, X, (k["y1"] - k["y0"] + 0.1, 0.1, 0.12),
          C["post"], "wood", seed=1020, along=0, **TIMBER)
    slope = V(xo - xw, 0.0, k["low"] - k["high"])
    run = slope.length
    down = slope.normalized()
    for j, py in enumerate((k["y0"] + 0.1, (k["y0"] + k["y1"]) / 2, k["y1"] - 0.1)):
        a = V(xw, py, k["high"] + 0.0)
        piece(pieces, a + down * (run / 2) + V(0, 0, 0.04), down, Y, (run + 0.2, 0.06, 0.08), C["post"], "wood",
              seed=1030 + j, along=0, **TIMBER)
    sheets = 3
    span = (k["y1"] - k["y0"] + 0.2) / sheets
    for j in range(sheets):
        o = V(xw + 0.04, k["y0"] - 0.1 + j * span - 0.02 * (j % 2), k["high"] + 0.1 + 0.012 * (j % 2))
        corrugated(o, Y, down, span + 0.06, run + 0.25, pieces, C["tin"], seed=1040 + j)
    far.append((H.oriented_box(V((xw + xo) / 2, (k["y0"] + k["y1"]) / 2, (k["high"] + k["low"]) / 2 + 0.1), down, Y,
                               (run + 0.25, k["y1"] - k["y0"] + 0.2, 0.05)), C["tin"]))
    # The crates: blue ones stacked three high by the front, red ones beside them, bottles in each.
    cx = xw - 0.38
    stacks = (((cx, -0.1), (C["crateBlue"], C["crateBlue"], C["crateBlue"])),
              ((cx, 0.42), (C["crateRed"], C["crateRed"], C["crateBlue"])),
              ((cx - 0.52, 0.12), (C["crateRed"], C["crateBlue"])))
    for j, ((sx, sy), colours) in enumerate(stacks):
        z = 0.0
        for i, colour in enumerate(colours):
            h = crate(V(sx, sy, z), colour, pieces, seed=1100 + j * 10 + i, bottles=i == len(colours) - 1,
                      turn=0.04 * ((i + j) % 3 - 1) + math.pi / 2)
            z += h + 0.002
        blocks.append(H.block_box(sx - 0.2, sx + 0.2, sy - 0.25, sy + 0.25, -0.5, z + 0.4, camera=False))
    # Bottles on the ground in front of the crates, and the bucket of sticks by the corner.
    for j, (bx, by, colour, tall) in enumerate(((cx + 0.12, -0.55, C["bottleGreen"], 0.36), (cx + 0.02, -0.62, C["bottleBrown"], 0.38),
                                                (cx - 0.1, -0.5, C["bottleClear"], 0.34), (cx - 0.22, -0.6, C["bottleBrown"], 0.24),
                                                (cx + 0.22, -0.68, C["bottleGreen"], 0.25))):
        bottle(V(bx, by, 0.0), colour, pieces, tall, label=j % 2 == 0)
    bu = V(-XO - 0.3, -YO - 0.1, 0.0)
    solid(pieces, H.turned([(0.0, 0.0), (0.13, 0.0), (0.16, 0.3), (0.165, 0.31), (0.155, 0.31), (0.12, 0.03), (0.0, 0.03)], bu,
                           segments=16), C["bucket"])
    for j, (dx, dy, tx, ty) in enumerate(((0.02, 0.03, 0.18, 0.1), (-0.04, 0.0, 0.1, 0.22), (0.05, -0.04, 0.26, -0.05))):
        solid(pieces, P.segment_bm(bu + V(dx, dy, 0.05), bu + V(dx + tx, dy + ty, 1.35), 0.014, 0.012, 6), C["stick"])
    blocks.append({"circle": [*g(bu.x, bu.y), 0.2], "y": [-0.5, 1.2], "walk": True, "camera": False})
    blocks.append(H.block_box(cx - 0.6, cx + 0.3, -0.75, -0.4, -0.5, 0.6, camera=False))


def build_bench(pieces, blocks):
    """The low bench against the bench's bay, a pot of purple flowers and a gourd of a vase on it."""
    x0 = -XO + POST + 0.06
    x1 = x0 + BAYS[0] - 0.12
    y = -YO - 0.27
    top = 0.36
    piece(pieces, V((x0 + x1) / 2, y, top - 0.025), X, Y, (x1 - x0, 0.32, 0.05), C["bench"], "wood", seed=1200, front=UP,
          along=0, **dict(OUTSIDE, damp=0.0, weather=0.6, nails=True))
    for j, lx in enumerate((x0 + 0.08, x1 - 0.08)):
        piece(pieces, V(lx, y, (top - 0.05) / 2), X, Y, (0.06, 0.26, top - 0.05), C["bench"], "wood", seed=1210 + j, along=2,
              **dict(OUTSIDE, damp=0.5, weather=0.6, nails=False))
    blocks.append(H.block_box(x0, x1, y - 0.18, y + 0.18, -0.5, top + 0.5, camera=False))
    # A terracotta pot of purple flowers among leaves.
    pa = V(x0 + 0.3, y, top)
    solid(pieces, H.turned([(0.0, 0.0), (0.1, 0.0), (0.13, 0.17), (0.15, 0.19), (0.15, 0.22), (0.0, 0.22)], pa), C["pot"])
    for k in range(9):
        ang = k * 2.4
        r = 0.04 + 0.07 * ((k * 5) % 7) / 7
        c = pa + V(math.cos(ang) * r, math.sin(ang) * r, 0.27 + 0.05 * (k % 3))
        rot = Matrix.Rotation(ang, 3, "Z") @ Matrix.Rotation(-0.6, 3, "Y")
        solid(pieces, L.ellipsoid_bm(c, (0.07, 0.04, 0.012), rot=rot, u=6, v=3), C["leaf"] if k % 2 else C["leafLight"])
    for k in range(7):
        ang = k * 0.9 + 0.4
        c = pa + V(math.cos(ang) * 0.06, math.sin(ang) * 0.06, 0.34 + 0.04 * (k % 2))
        for j in range(5):
            pa_ = c + V(math.cos(j * 1.256) * 0.022, math.sin(j * 1.256) * 0.022, 0.0)
            solid(pieces, L.ellipsoid_bm(pa_, (0.022, 0.022, 0.008), u=6, v=3), C["flower"])
        solid(pieces, L.ellipsoid_bm(c + V(0, 0, 0.006), (0.01, 0.01, 0.008), u=5, v=3), C["flowerHeart"])
    # The gourd of a vase on its round blue-green foot, a sprout of leaves out of its neck.
    ga = V(x0 + 0.72, y, top)
    solid(pieces, H.turned([(0.0, 0.0), (0.1, 0.0), (0.11, 0.03), (0.09, 0.06), (0.0, 0.06)], ga, segments=14), C["gourdBase"])
    solid(pieces, H.turned([(0.0, 0.0), (0.08, 0.02), (0.1, 0.09), (0.08, 0.16), (0.045, 0.2), (0.06, 0.25), (0.055, 0.3),
                            (0.03, 0.34), (0.02, 0.37), (0.0, 0.37)], ga + V(0, 0, 0.05), segments=14), C["gourd"])
    for k in range(4):
        ang = k * 1.6 + 0.3
        a = ga + V(0, 0, 0.42)
        b = a + V(math.cos(ang) * 0.08, math.sin(ang) * 0.08, 0.1 + 0.04 * (k % 2))
        solid(pieces, P.segment_bm(a, b, 0.006, 0.005, 4), C["leaf"])
        solid(pieces, L.ellipsoid_bm(b, (0.045, 0.025, 0.008), rot=Matrix.Rotation(ang, 3, "Z") @ Matrix.Rotation(-0.4, 3, "Y"),
                                     u=6, v=3), C["leafLight"])


# ---------------------------------------------------------------------------- inside
def build_floor_and_ceiling(inside, pieces):
    """Wide planks underfoot running to the door on a dark floor, and a boarded ceiling on two beams."""
    xi, yi = XO - T, YO - T
    solid(pieces, P.box_bm(V(0.0, 0.0, FLOOR - 0.13), (2 * XO - 0.02, 2 * YO - 0.02, 0.22)), C["slab"])
    n = round(2 * xi / 0.25)
    w = 2 * xi / n
    for k in range(n):
        x = -xi + (k + 0.5) * w
        cut = -yi + 2 * yi * (0.25 + 0.5 * PM.rand(1300, k))
        for j, (a, b) in enumerate(((-yi, cut), (cut, yi)) if k % 3 == 1 else ((-yi, yi),)):
            piece(inside, V(x, (a + b) / 2, FLOOR - 0.015), X, Y, (w - 0.007, b - a - 0.006, 0.03), C["floor"], "wood",
                  seed=1300 + k * 3 + j, front=UP, back=False, ends=False, along=1,
                  **dict(INSIDE, tone=0.12, grain_dark=0.24))
    cz = TOP - 0.02
    n = round(2 * yi / 0.26)
    w = 2 * yi / n
    for k in range(n):
        y = -yi + (k + 0.5) * w
        piece(inside, V(0.0, y, cz), X, Y, (2 * xi, w - 0.008, 0.025), C["ceiling"], "wood", seed=1400 + k, front=-UP,
              back=False, ends=False, along=0, **dict(INSIDE, tone=0.1, texel=0.7))
    solid(pieces, P.box_bm(V(0.0, 0.0, cz + 0.04), (2 * XO - 0.02, 2 * YO - 0.02, 0.05)), C["slab"])
    for k, y in enumerate((-0.95, 0.95)):
        piece(inside, V(0.0, y, cz - 0.1), X, Y, (2 * xi, 0.14, 0.18), C["beam"], "wood", seed=1450 + k, along=0,
              ends=False, faces=["+n", "-n", "-b"], **dict(INSIDE, grain_dark=0.3, tone=0.05, texel=0.7))


def build_kitchen(inside, blocks):
    """The kitchen in the corner by the door: the pale blue stove against the front wall, its steel
    top with three burners, three knobs and its oven's door; two tall steel stockpots and a brass pot on
    it; a rail of ladles and a shelf of pans over it; two jars on the floor beside it."""
    x0, x1 = -XO + T + 0.14, -0.98
    y0, y1 = -YO + T + 0.02, -YO + T + 0.64
    h = 0.86
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    piece(inside, V(cx, cy, FLOOR + h / 2 - 0.02), X, Y, (x1 - x0, y1 - y0, h - 0.04), C["range"], "enamel", seed=1500,
          front=Y, along=0, faces=["+n", "+a", "-a"], floor=FLOOR)
    piece(inside, V(cx, cy, FLOOR + h - 0.01), X, Y, (x1 - x0 + 0.02, y1 - y0 + 0.02, 0.03), C["rangeTop"], "metal",
          seed=1501, front=UP, along=0, rust=0.05)
    for k in range(3):
        bx = x0 + (x1 - x0) * (k + 0.5) / 3
        solid(inside, P.segment_bm(V(bx, cy - 0.04, FLOOR + h + 0.004), V(bx, cy - 0.04, FLOOR + h + 0.016), 0.11, 0.11, 14),
              C["knob"])
        solid(inside, P.segment_bm(V(bx, y1 + 0.005, FLOOR + h - 0.12), V(bx, y1 + 0.04, FLOOR + h - 0.12), 0.03, 0.028, 10),
              C["knob"])
    # The oven's door: a panel's edge drawn round it, a steel bar of a handle.
    for c, size in ((V(cx, y1 + 0.004, FLOOR + 0.57), (x1 - x0 - 0.14, 0.006, H.PEN)), (V(cx, y1 + 0.004, FLOOR + 0.1), (x1 - x0 - 0.14, 0.006, H.PEN)),
                    (V(x0 + 0.07, y1 + 0.004, FLOOR + 0.335), (H.PEN, 0.006, 0.47)), (V(x1 - 0.07, y1 + 0.004, FLOOR + 0.335), (H.PEN, 0.006, 0.47)),
                    (V(cx, y1 + 0.004, FLOOR + 0.665), (x1 - x0 - 0.04, 0.006, H.PEN))):
        solid(inside, P.box_bm(c, size), C["steelDark"])
    solid(inside, P.segment_bm(V(x0 + 0.15, y1 + 0.05, FLOOR + 0.52), V(x1 - 0.15, y1 + 0.05, FLOOR + 0.52), 0.014, 0.014, 8), C["steel"])
    for k in (0, 1):
        bx = x0 + (x1 - x0) * (0.18 + 0.64 * k)
        for c, size in ((V(bx, y1 + 0.03, FLOOR + 0.52), (0.02, 0.05, 0.02)),):
            solid(inside, P.box_bm(c, size), C["steel"])
    blocks.append(H.block_box(x0, x1, y0, y1, FLOOR - 0.1, FLOOR + h + 0.4, camera=False))
    # The pots on it.
    for k, (px, r, hh, colour) in enumerate(((x0 + 0.24, 0.17, 0.34, C["steel"]), (x0 + 0.62, 0.16, 0.3, C["steel"]),
                                             (x1 - 0.2, 0.15, 0.17, C["brass"]))):
        base = V(px, cy - 0.02, FLOOR + h + 0.016)
        solid(inside, P.segment_bm(base, base + UP * hh, r, r, 18), colour)
        solid(inside, P.segment_bm(base + UP * hh, base + UP * (hh + 0.012), r + 0.01, r + 0.01, 18),
              C["steelDark"] if colour is C["steel"] else colour)
        solid(inside, P.segment_bm(base + UP * (hh + 0.012), base + UP * (hh + 0.03), r * 0.9, r * 0.25, 18),
              C["steelDark"] if colour is C["steel"] else colour)
        for side in (1, -1):
            hp = base + UP * (hh * 0.82) + X * side * (r + 0.02)
            solid(inside, H.oriented_box(hp, X, Y, (0.05, 0.1, 0.02)), C["steelDark"])
    # The rail of ladles on the wall over it, and the shelf of pans over that.
    wy = -YO + T + 0.035
    solid(inside, P.segment_bm(V(x0 + 0.15, wy, FLOOR + 1.62), V(x1 - 0.1, wy, FLOOR + 1.62), 0.012, 0.012, 8), C["steel"])
    for k in range(4):
        lx = x0 + 0.3 + k * 0.22
        solid(inside, P.segment_bm(V(lx, wy + 0.01, FLOOR + 1.62), V(lx, wy + 0.02, FLOOR + 1.22), 0.009, 0.009, 6), C["steel"])
        solid(inside, L.ellipsoid_bm(V(lx, wy + 0.04, FLOOR + 1.18), (0.045, 0.045, 0.03), u=10, v=5), C["steel"])
    sy = -YO + T + 0.18
    piece(inside, V((x0 + x1) / 2 + 0.05, sy, FLOOR + 2.0), X, Y, (x1 - x0 + 0.1, 0.32, 0.04), C["shelf"], "wood", seed=1520,
          front=UP, along=0, **FURNITURE)
    for k in (0, 1):
        bx = x0 + 0.15 + k * (x1 - x0 - 0.2)
        solid(inside, H.oriented_box(V(bx, sy - 0.06, FLOOR + 1.9), V(0, 1, -1), X, (0.26, 0.03, 0.04)), C["shelf"])
    for k, (px, r, hh, colour) in enumerate(((x0 + 0.2, 0.11, 0.1, C["steel"]), (x0 + 0.48, 0.1, 0.12, C["steel"]),
                                             (x0 + 0.76, 0.12, 0.09, C["greenPan"]))):
        base = V(px, sy, FLOOR + 2.02)
        solid(inside, P.segment_bm(base, base + UP * hh, r, r, 14), colour)
        # Its handle out over the shelf's front edge, into the room.
        solid(inside, P.segment_bm(base + UP * (hh * 0.7) + Y * r, base + UP * (hh * 0.8) + Y * (r + 0.18), 0.012, 0.012, 6),
              C["iron"])
    for k in range(4):
        solid(inside, H.turned([(0.0, 0.0), (0.05, 0.0), (0.1, 0.05), (0.11, 0.07), (0.0, 0.02)], V(x1 - 0.12, sy, FLOOR + 2.02 + 0.05 * k)),
              C["bowl"])
    # The jars by the door: a brown one glazed cream round its shoulder, a pale celadon one.
    for k, (jx, jy, r, hh, colour) in enumerate(((x1 + 0.17, -YO + T + 0.22, 0.15, 0.4, C["jar"]),
                                                 (x1 + 0.12, -YO + T + 0.56, 0.12, 0.3, C["celadon"]))):
        base = V(jx, jy, FLOOR)
        prof = [(0.0, 0.0), (r * 0.6, 0.0), (r, hh * 0.35), (r * 0.95, hh * 0.7), (r * 0.55, hh * 0.92), (r * 0.5, hh), (0.0, hh)]
        solid(inside, H.turned(prof, base, segments=16), colour)
        if colour is C["jar"]:
            solid(inside, H.turned([(r * 0.97, hh * 0.68), (r * 0.6, hh * 0.9), (r * 0.52, hh * 1.01), (0.0, hh * 1.01)],
                                   base, segments=16), C["jarDrip"])
        solid(inside, H.turned([(0.0, 0.0), (r * 0.55, 0.0), (r * 0.5, 0.04), (0.04, 0.06), (0.03, 0.09), (0.0, 0.09)],
                               base + UP * hh, segments=14), colour)
        blocks.append({"circle": [*g(jx, jy), r + 0.03], "y": [FLOOR - 0.1, FLOOR + hh + 0.3], "walk": True, "camera": False})


def build_dining(inside, glow, blocks, collection, labels):
    """The table under the back window, the chair with its navy cushion and the stool at its ends, a
    glass of water and a bowl on it; the menu's three plaques beside the window; strings of shells,
    starfish and beads hanging in the corner; a branch hung on strings over the stool; the lamp
    hanging before the table; a floor cushion with white fish on it."""
    ty = YO - T - 0.45
    tz = FLOOR + 0.72
    tw, td = 1.15, 0.7
    piece(inside, V(0.0, ty, tz - 0.022), X, Y, (tw, td, 0.045), C["table"], "wood", seed=1600, front=UP, along=0, **FURNITURE)
    for k, (sx, sy) in enumerate(((-1, -1), (1, -1), (-1, 1), (1, 1))):
        piece(inside, V(sx * (tw / 2 - 0.07), ty + sy * (td / 2 - 0.07), (FLOOR + tz - 0.045) / 2), X, Y,
              (0.055, 0.055, tz - 0.045 - FLOOR), C["table"], "wood", seed=1610 + k, along=2, **FURNITURE)
    for k, (c, size) in enumerate(((V(0.0, ty - td / 2 + 0.06, tz - 0.08), (tw - 0.14, 0.022, 0.08)),
                                   (V(0.0, ty + td / 2 - 0.06, tz - 0.08), (tw - 0.14, 0.022, 0.08)))):
        piece(inside, c, X, Y, size, C["table"], "wood", seed=1620 + k, along=0, **FURNITURE)
    blocks.append(H.block_box(-tw / 2, tw / 2, ty - td / 2, ty + td / 2, FLOOR - 0.1, tz + 0.3, camera=False))
    solid(inside, P.segment_bm(V(-0.15, ty, tz), V(-0.15, ty, tz + 0.12), 0.035, 0.038, 12), C["glassCup"])
    solid(inside, P.segment_bm(V(-0.15, ty, tz + 0.005), V(-0.15, ty, tz + 0.09), 0.031, 0.034, 12), C["water"])
    solid(inside, H.turned([(0.0, 0.0), (0.05, 0.0), (0.12, 0.05), (0.13, 0.065), (0.0, 0.025)], V(0.15, ty - 0.05, tz)), C["bowl"])
    solid(inside, P.segment_bm(V(0.15, ty - 0.05, tz + 0.058), V(0.15, ty - 0.05, tz + 0.066), 0.128, 0.128, 16), C["bowlRim"])
    # The chair at the table's right end, facing it, and the stool at its left.
    cx, cy = tw / 2 + 0.3, ty - 0.05
    seat = FLOOR + 0.45
    piece(inside, V(cx, cy, seat - 0.02), X, Y, (0.44, 0.44, 0.04), C["chair"], "wood", seed=1630, front=UP, along=1, **FURNITURE)
    for k, (sx, sy) in enumerate(((-1, -1), (1, -1), (-1, 1), (1, 1))):
        top = seat + (0.55 if sx > 0 else 0.0) - 0.04
        piece(inside, V(cx + sx * 0.19, cy + sy * 0.19, (FLOOR + top) / 2), X, Y, (0.045, 0.045, top - FLOOR), C["chair"], "wood",
              seed=1640 + k, along=2, **FURNITURE)
    for k, z in enumerate((seat + 0.18, seat + 0.33, seat + 0.48)):
        piece(inside, V(cx + 0.19, cy, z), Y, X, (0.38, 0.03, 0.06), C["chair"], "wood", seed=1650 + k, along=0, **FURNITURE)
    for k, z in enumerate((FLOOR + 0.15,)):
        piece(inside, V(cx, cy - 0.19, z), X, Y, (0.36, 0.03, 0.03), C["chair"], "wood", seed=1660 + k, along=0, **FURNITURE)
    solid(inside, P.box_bm(V(cx - 0.02, cy, seat + 0.035), (0.42, 0.42, 0.07), bevel=0.03), C["cushion"])
    blocks.append({"circle": [*g(cx, cy), 0.28], "y": [FLOOR - 0.1, seat + 0.6], "walk": True, "camera": False})
    sx_, sy_ = -tw / 2 - 0.32, ty - 0.05
    stool = FLOOR + 0.42
    piece(inside, V(sx_, sy_, stool - 0.02), X, Y, (0.36, 0.36, 0.04), C["chair"], "wood", seed=1670, front=UP, along=0,
          **FURNITURE)
    for k, (dx, dy) in enumerate(((-1, -1), (1, -1), (-1, 1), (1, 1))):
        piece(inside, V(sx_ + dx * 0.14, sy_ + dy * 0.14, (FLOOR + stool - 0.04) / 2), X, Y, (0.045, 0.045, stool - 0.04 - FLOOR),
              C["chair"], "wood", seed=1680 + k, along=2, **FURNITURE)
    for k, (c, size) in enumerate(((V(sx_, sy_ - 0.14, FLOOR + 0.14), (0.24, 0.025, 0.03)), (V(sx_, sy_ + 0.14, FLOOR + 0.14), (0.24, 0.025, 0.03)))):
        piece(inside, c, X, Y, size, C["chair"], "wood", seed=1690 + k, along=0, **FURNITURE)
    blocks.append({"circle": [*g(sx_, sy_), 0.24], "y": [FLOOR - 0.1, stool + 0.4], "walk": True, "camera": False})
    # The menu's three plaques on the back wall right of the window.
    wy = YO - T - 0.026  # in front of the wall's planks
    menu = []
    for k, mx in enumerate((0.85, 1.13, 1.41)):
        piece(inside, V(mx, wy - 0.006, FLOOR + 1.75), X, Y, (0.21, 0.012, 0.56), C["paper"], "paper", seed=1700 + k, front=-Y,
              along=2)
        face, uvs = P.label_bm(V(mx, wy - 0.012, FLOOR + 1.75), 0.17, 0.48)
        labels.append(P.object_with_uv(f"restaurant_label{2 + k}", face, uvs, collection))
        menu.append({"size": [0.17, 0.48], "vertical": True, "colour": "#3B2620", "sharp": 2})
        solid(inside, L.ellipsoid_bm(V(mx, wy - 0.014, FLOOR + 2.04), (0.008, 0.008, 0.008), u=6, v=4), C["iron"])
    # The strings of shells in the corner: cone shells, scallops, starfish and pale blue beads.
    for k, (gx, gy, drop) in enumerate(((1.62, YO - T - 0.12, 1.15), (1.82, YO - T - 0.3, 0.95), (2.0, YO - T - 0.12, 1.25),
                                        (1.95, YO - T - 0.55, 0.85))):
        top = TOP - 0.05
        solid(inside, P.segment_bm(V(gx, gy, top), V(gx, gy, top - drop), 0.004, 0.004, 4), C["string"])
        z = top - 0.12
        j = 0
        while z > top - drop + 0.02:
            at = V(gx, gy, z)
            kind = (j + k) % 4
            if kind == 0:
                star(at, 0.07, inside)
            elif kind == 1:
                solid(inside, L.ellipsoid_bm(at, (0.03, 0.022, 0.05), u=8, v=6), C["shell"])
            elif kind == 2:
                scallop(at, 0.05, inside)
            else:
                solid(inside, L.ellipsoid_bm(at, (0.018, 0.018, 0.018), u=8, v=5), C["bead"])
            z -= 0.14 if kind != 3 else 0.08
            j += 1
    # A branch hung on two strings near the ceiling over the stool, two twigs off it.
    bz = TOP - 0.55
    b0, b1 = V(-1.85, YO - T - 0.25, bz), V(-0.75, YO - T - 0.3, bz + 0.06)
    solid(inside, P.segment_bm(b0, b1, 0.028, 0.022, 8), C["branch"])
    for p in (b0 + (b1 - b0) * 0.15, b0 + (b1 - b0) * 0.85):
        solid(inside, P.segment_bm(p, V(p.x, p.y, TOP - 0.04), 0.004, 0.004, 4), C["string"])
    for f, d in ((0.4, V(0.1, -0.05, -0.22)), (0.65, V(-0.08, 0.04, -0.18))):
        p = b0 + (b1 - b0) * f
        solid(inside, P.segment_bm(p, p + d, 0.012, 0.008, 6), C["branch"])
    # The lamp hanging in the middle of the room, before the table, as the film's room is lit from the
    # front: a cord from the ceiling, a shallow green enamel shade, its bulb under it lit at night.
    lz, ly = FLOOR + 2.3, 0.45
    solid(inside, P.segment_bm(V(0.0, ly, TOP - 0.03), V(0.0, ly, lz + 0.09), 0.006, 0.006, 6), C["iron"])
    prof = L.Profile([(0.02, 0.1), (0.07, 0.08), (0.16, 0.02), (0.19, 0.0)], samples=8)
    outer = L.lathe_bm(prof.samples, segments=18)
    L.transformed(outer, Matrix.Translation(V(0.0, ly, lz)))
    solid(inside, outer, C["shade"])
    inner = L.lathe_bm([(r * 0.93, z + 0.008) for r, z in prof.samples], segments=18)
    L.transformed(inner, Matrix.Translation(V(0.0, ly, lz)))
    for f in inner.faces:
        f.normal_flip()
    solid(inside, inner, C["shadeIn"])
    glow.append((L.ellipsoid_bm(V(0.0, ly, lz - 0.04), (0.055, 0.055, 0.065), u=10, v=6), C["bulb"]))
    # The floor cushion by the right wall, white fish on its navy.
    zb, patch = PM.box(V(XO - T - 0.5, 0.3, FLOOR + 0.04), X, Y, (0.62, 0.62, 0.08), "cloth", C["cushion"], 1750, front=UP,
                       pattern=fish_pattern)
    inside.append((zb, C["cushion"], None, patch))
    return menu


def fish_pattern(d, col):
    """White fish swimming across a cloth: a round body and a forked tail, a dot of an eye."""
    s, t = d["along"], d["across"]
    front = d["face"] == 0
    out = col.copy()
    for k, (fs, ft, a, size) in enumerate(((-0.12, 0.1, 0.4, 0.11), (0.12, -0.08, -0.3, 0.09), (0.05, 0.18, 2.6, 0.07),
                                           (-0.16, -0.17, 3.4, 0.08))):
        ca, sa = math.cos(a), math.sin(a)
        u = (s - fs) * ca + (t - ft) * sa
        v = -(s - fs) * sa + (t - ft) * ca
        body = (u / size) ** 2 + (v / (size * 0.5)) ** 2 < 1.0
        tail = (u < -size * 0.8) & (u > -size * 1.4) & (np.abs(v) < (-u - size * 0.8) * 0.9 + 0.01)
        eye = ((u - size * 0.55) ** 2 + (v - size * 0.12) ** 2) < (size * 0.09) ** 2
        m = (body | tail) & front
        out[m] = PM.hexc("#E9EEF2")
        out[eye & front] = PM.hexc("#2E3F66")
    return out


def star(at, size, pieces):
    """A starfish, flat, its five arms pale."""
    bm = bmesh.new()
    pts = []
    for k in range(10):
        a = math.pi / 2 + k * math.pi / 5
        r = size * (1.0 if k % 2 == 0 else 0.42)
        pts.append((math.cos(a) * r, math.sin(a) * r))
    for side in (0.006, -0.006):
        c = bm.verts.new(at + V(0.0, side, 0.0))
        ring = [bm.verts.new(at + V(x, side * 0.3, z)) for x, z in pts]
        for i in range(10):
            tri = (c, ring[i], ring[(i + 1) % 10])
            face = bm.faces.new(tri if side < 0 else tuple(reversed(tri)))
            face.normal_update()
            if face.normal.y * side < 0:
                face.normal_flip()
    solid(pieces, bm, C["starfish"])


def scallop(at, size, pieces):
    """A scallop shell: a fan, its ribs drawn darker."""
    bm = L.ellipsoid_bm(at, (size, size * 0.3, size * 0.85), u=10, v=6)
    solid(pieces, bm, C["shellWhite"])


# ---------------------------------------------------------------------------- the whole
def build_restaurant(collection):
    """島二郎 (see the module's docstring). Its parts: the body, its room's lamp (`_lamp`, baked), the
    outside lamps over its signs (`_spot`), the window panes (`_pane`), the room (`_inside`), a far
    version (`_far`) and the faces for its signs' words (`_label`, `_label1` the standing sign's,
    `_label2` to `_label4` the menu's)."""
    pieces, inside, glow, lamp, panes, far, labels, blocks = [], [], [], [], [], [], [], []
    walls, door, x_posts = build_walls(pieces, inside, panes)
    hinge, along, leaf_w = build_door(door, pieces, inside, panes)
    build_roof(pieces, far)
    board = build_sign_board(pieces, glow, labels, collection, far)
    kaijiru, kaijiru_feet = build_kaijiru(pieces, glow, labels, collection, far)
    build_lean_to(pieces, far, blocks)
    build_bench(pieces, blocks)
    build_floor_and_ceiling(inside, pieces)
    build_kitchen(inside, blocks)
    menu = build_dining(inside, lamp, blocks, collection, labels)
    far.append((P.box_bm(V(0.0, 0.0, EAVE / 2), (2 * XO, 2 * YO, EAVE)), C["plank"]))
    far.append((H.gable_bm(-YO - 0.12, XO + OVER, EAVE - OVER * math.tan(PITCH), RIDGE + 0.05, 2 * YO + OVER + 0.12), C["roof"]))

    painter = PM.Painter("restaurant")
    body = painter.join("restaurant", pieces, collection)
    room = painter.join("restaurant_inside", inside, collection)
    lights = P.join("restaurant_spot", glow, collection)
    bulb = P.join("restaurant_lamp", lamp, collection)
    glass = P.join("restaurant_pane", panes, collection)
    distant = P.join("restaurant_far", far, collection, sharp=P.SHARP)

    t = T
    d0, d1 = door
    blocks += [
        H.block_box(-XO, XO, YO - t, YO, -10, EAVE), H.block_box(-XO, d0, -YO, -YO + t, -10, EAVE),
        H.block_box(d1, XO, -YO, -YO + t, -10, EAVE), H.block_box(d0, d1, -YO, -YO + t, FLOOR + DOOR_H, EAVE),
        H.block_box(-XO, -XO + t, -YO, YO, -10, EAVE), H.block_box(XO - t, XO, -YO, YO, -10, EAVE),
        H.block_box(-XO - OVER, XO + OVER, -YO - 0.15, YO + OVER, EAVE - 0.05, RIDGE + 0.15, walk=False),
        H.block_box(-SIGN["w"] / 2, SIGN["w"] / 2, -YO - 0.18, -YO - 0.06, EAVE, EAVE + SIGN["h"] + 0.1, walk=False),
        H.block_box(KAIJIRU["x"] - KAIJIRU["w"] / 2, KAIJIRU["x"] + KAIJIRU["w"] / 2, KAIJIRU["y"] - 0.03, KAIJIRU["y"] + 0.09,
                    KAIJIRU["legs"] - 0.05, KAIJIRU["legs"] + KAIJIRU["h"], walk=False),
        door_leaf_block(hinge, along, leaf_w),
    ]
    for fx, fy, _ in kaijiru_feet:
        blocks.append({"circle": [*g(fx, fy), 0.09], "y": [-1, KAIJIRU["legs"] + KAIJIRU["h"]], "walk": True, "camera": False})
    decks = [H.deck_box(-XO + t, XO - t, -YO + t, YO - t, FLOOR), H.deck_box(d0, d1, -YO - 0.02, -YO + t, FLOOR),
             H.deck_box(d0 - 0.1, d1 + 0.1, -YO - 0.42, -YO - 0.02, FLOOR / 2 + 0.01)]
    # Set a little into the ground, so what stands on it (the bench, the crates, the bucket) meets the
    # ground's gentle fall before its front.
    info = {"blocks": blocks, "decks": decks, "height": RIDGE + 0.4, "sink": 0.045, "openings": H.openings_of(walls),
            "labels": [board, kaijiru] + menu}
    # Its lamp throws most of its light down onto the table; the rest of the room is lit by what comes
    # back off the wood, so every face open to the room keeps its light, and the body's down to a fifth
    # of the cut-off the huts bake with.
    info.update(H.bake_night("restaurant", [body, room], bulb, info["openings"], dark=0.0008, rooms=(1,)))
    info.update(painter.finish(P.OUT_MODELS))
    return [body, lights, bulb, glass, room, distant] + labels, info


def door_leaf_block(hinge, along, leaf_w):
    c = hinge + along * (leaf_w / 2)
    side = V(-along.y, along.x, 0.0)
    corners = [c + along * (sa * leaf_w / 2) + side * (sb * 0.04) for sa in (-1, 1) for sb in (-1, 1)]
    x0, x1 = min(p.x for p in corners), max(p.x for p in corners)
    y0, y1 = min(p.y for p in corners), max(p.y for p in corners)
    return H.block_box(x0, x1, y0, y1, FLOOR - 0.1, FLOOR + DOOR_H, camera=False)
