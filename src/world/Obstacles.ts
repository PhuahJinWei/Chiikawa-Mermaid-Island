/**
 * What stands on the island for characters to walk round, under or on, and for the camera to keep
 * out of: blocks (a prop's foot, a hut's walls, a roof, a stepping stone's body, each over a range
 * of heights), decks to walk on (porches, floors, stairs, the pier, the stepping stones' tops),
 * and tree crowns, which only the camera minds. Kept in a coarse grid, so a test looks only at
 * what is near.
 */

const CELL = 8;
/** A character's height, for what their body bumps into. */
const BODY = 0.9;

export interface BlockOptions {
  /** Stops characters walking into it. */
  walk?: boolean;
  /** Keeps the camera out of it. */
  camera?: boolean;
}

interface Shape {
  x: number;
  z: number;
  cos: number;
  sin: number;
}

interface Block extends Shape {
  /** A circle's radius, or 0 for a box. */
  r: number;
  hx: number;
  hz: number;
  y0: number;
  y1: number;
  walk: boolean;
  camera: boolean;
}

interface Deck extends Shape {
  hx: number;
  hz: number;
  /** Height at the deck's back edge, and at its front edge (the same, unless it is a ramp). */
  back: number;
  front: number;
}

/** A flat deck within an outline round its middle: a stepping stone's top, a ledge on a cliff's top. */
interface Pad {
  x: number;
  z: number;
  /** Its edge, as an outline (see `outlineAt`). */
  outline: number[];
  reach: number;
  top: number;
}

interface Crown {
  x: number;
  y: number;
  z: number;
  r: number;
}

class Grid<T> {
  private readonly cells = new Map<number, T[]>();

  add(item: T, x: number, z: number, radius: number): void {
    for (let i = Math.floor((x - radius) / CELL); i <= Math.floor((x + radius) / CELL); i++) {
      for (let j = Math.floor((z - radius) / CELL); j <= Math.floor((z + radius) / CELL); j++) {
        const key = i * 100003 + j;
        let list = this.cells.get(key);
        if (!list) this.cells.set(key, (list = []));
        list.push(item);
      }
    }
  }

  at(x: number, z: number): T[] {
    return this.cells.get(Math.floor(x / CELL) * 100003 + Math.floor(z / CELL)) ?? EMPTY;
  }
}

const EMPTY: never[] = [];
const blocks = new Grid<Block>();
const decks = new Grid<Deck>();
const pads = new Grid<Pad>();
const crowns = new Grid<Crown>();

/**
 * How far an outline reaches from its middle toward (dx, dz). An outline is its distances from
 * the middle at even angles round it, from east toward south; between them it runs straight.
 */
export function outlineAt(outline: number[], dx: number, dz: number): number {
  const n = outline.length;
  const f = ((((Math.atan2(dz, dx) / (2 * Math.PI)) * n) % n) + n) % n;
  const i = Math.floor(f);
  return outline[i] + (outline[(i + 1) % n] - outline[i]) * (f - i);
}

/** (x, z) in the frame of something at (s.x, s.z) turned by its angle (as an object's rotation.y). */
function local(s: Shape, x: number, z: number): [number, number] {
  const dx = x - s.x;
  const dz = z - s.z;
  return [dx * s.cos - dz * s.sin, dx * s.sin + dz * s.cos];
}

function addBlock(b: Block): void {
  blocks.add(b, b.x, b.z, b.r > 0 ? b.r : Math.hypot(b.hx, b.hz));
}

/** A round block of radius r at (x, z), standing from y0 to y1. */
export function addCircle(x: number, z: number, r: number, y0: number, y1: number, o: BlockOptions = {}): void {
  addBlock({ x, z, cos: 1, sin: 0, r, hx: 0, hz: 0, y0, y1, walk: o.walk ?? true, camera: o.camera ?? true });
}

/** A rectangular block, half sizes hx and hz, turned by `angle`, standing from y0 to y1. */
export function addBox(
  x: number,
  z: number,
  hx: number,
  hz: number,
  angle: number,
  y0: number,
  y1: number,
  o: BlockOptions = {},
): void {
  addBlock({
    x,
    z,
    cos: Math.cos(angle),
    sin: Math.sin(angle),
    r: 0,
    hx,
    hz,
    y0,
    y1,
    walk: o.walk ?? true,
    camera: o.camera ?? true,
  });
}

/** A round block of radius r that moves about within `reach` of (cx, cz) (the Siren's fin-hands and tail
 * fin, as she turns): as addCircle's, put where it is by setting its x and z. */
export function addMovingCircle(cx: number, cz: number, reach: number, r: number, y0: number, y1: number): { x: number; z: number } {
  const block: Block = { x: cx, z: cz, cos: 1, sin: 0, r, hx: 0, hz: 0, y0, y1, walk: true, camera: true };
  blocks.add(block, cx, cz, reach + r);
  return block;
}

/** A rectangular block that comes and goes (the cave's boat, drawn up on its beach): as addBox's, for
 * walkers only, standing while its `walk` is set. */
export function addSwitchedBox(x: number, z: number, hx: number, hz: number, angle: number, y0: number, y1: number): { walk: boolean } {
  const block: Block = { x, z, cos: Math.cos(angle), sin: Math.sin(angle), r: 0, hx, hz, y0, y1, walk: false, camera: false };
  addBlock(block);
  return block;
}

/** A walkable rectangle turned by `angle`: flat at `back`, or a ramp from `back` at its back edge to
 * `front` at its front edge (its local +z side). */
export function addDeck(x: number, z: number, hx: number, hz: number, angle: number, back: number, front = back): void {
  decks.add({ x, z, cos: Math.cos(angle), sin: Math.sin(angle), hx, hz, back, front }, x, z, Math.hypot(hx, hz));
}

/** A flat walkable pad at `top` within an outline round (x, z). */
export function addPad(x: number, z: number, outline: number[], top: number): void {
  const reach = Math.max(...outline);
  pads.add({ x, z, outline, reach, top }, x, z, reach);
}

/** A tree's crown: a ball the camera keeps out of. */
export function addCrown(x: number, y: number, z: number, r: number): void {
  crowns.add({ x, y, z, r }, x, z, r);
}

/** How far above a point the trees' crowns can reach, for following the light up through them. */
const CANOPY_HEIGHT = 26;

/**
 * How deep in the shade of the trees' crowns the point (x, y, z) is from light coming from `dir`
 * (toward the light, of length 1): 1 where the light would pass through a crown's middle on its
 * way down to it, easing to 0 toward the crown's edge.
 */
export function canopyShade(x: number, y: number, z: number, dir: { x: number; y: number; z: number }): number {
  if (dir.y <= 0.05) return 0;
  const flat = Math.hypot(dir.x, dir.z);
  const ux = flat > 1e-6 ? dir.x / flat : 0;
  const uz = flat > 1e-6 ? dir.z / flat : 0;
  // The light's way across the ground below it, until it is above the tallest crowns, cell by cell.
  const reach = Math.min((CANOPY_HEIGHT * flat) / dir.y, 64);
  let shade = 0;
  for (let along = 0; along <= reach + CELL * 0.5; along += CELL * 0.5) {
    for (const c of crowns.at(x + ux * along, z + uz * along)) {
      const cx = c.x - x;
      const cy = c.y - y;
      const cz = c.z - z;
      const t = cx * dir.x + cy * dir.y + cz * dir.z;
      if (t <= 0) continue;
      const miss = Math.sqrt(Math.max(cx * cx + cy * cy + cz * cz - t * t, 0));
      const k = Math.min(Math.max((c.r - miss) / (c.r * 0.45), 0), 1);
      shade = Math.max(shade, k * k * (3 - 2 * k));
      if (shade >= 1) return 1;
    }
  }
  return shade;
}

function inside(b: Block, x: number, z: number, margin: number): boolean {
  if (b.r > 0) return Math.hypot(x - b.x, z - b.z) < b.r + margin;
  const [lx, lz] = local(b, x, z);
  return Math.abs(lx) < b.hx + margin && Math.abs(lz) < b.hz + margin;
}

/** Whether a character standing at (x, z) with their feet at `feet` bumps into something. */
export function blocked(x: number, z: number, margin: number, feet: number): boolean {
  for (const b of blocks.at(x, z)) {
    if (!b.walk || b.y1 <= feet + 0.1 || b.y0 >= feet + BODY) continue;
    if (inside(b, x, z, margin)) return true;
  }
  return false;
}

/**
 * The highest deck under (x, z) that someone with their feet at `reach` or above could stand on,
 * or null: a deck higher than `reach` is over their head.
 */
export function deckUnder(x: number, z: number, reach: number): number | null {
  let top: number | null = null;
  for (const d of decks.at(x, z)) {
    const [lx, lz] = local(d, x, z);
    if (Math.abs(lx) > d.hx || Math.abs(lz) > d.hz) continue;
    const h = d.back + (d.front - d.back) * ((lz + d.hz) / (2 * d.hz));
    if (h <= reach && (top === null || h > top)) top = h;
  }
  for (const p of pads.at(x, z)) {
    if (p.top > reach || (top !== null && p.top <= top)) continue;
    const dx = x - p.x;
    const dz = z - p.z;
    const d = Math.hypot(dx, dz);
    if (d <= p.reach && d <= outlineAt(p.outline, dx, dz)) top = p.top;
  }
  return top;
}

/**
 * Whether the way from a to b passes through block `k`, where it stands: its span along the way,
 * seen from above, and the way's heights over that span against the block's. A block either end
 * stands inside does not count: a torch's flame is on its own pole, a lantern hangs in its own stall.
 */
function crosses(k: Block, ax: number, ay: number, az: number, bx: number, by: number, bz: number): boolean {
  const [px, pz] = local(k, ax, az);
  const [qx, qz] = local(k, bx, bz);
  const dx = qx - px;
  const dz = qz - pz;
  let t0 = 0;
  let t1 = 1;
  if (k.r > 0) {
    const a = dx * dx + dz * dz;
    const c = px * px + pz * pz - k.r * k.r;
    if (a < 1e-9) {
      if (c > 0) return false;
    } else {
      const half = px * dx + pz * dz;
      const disc = half * half - a * c;
      if (disc <= 0) return false;
      const s = Math.sqrt(disc);
      t0 = Math.max(t0, (-half - s) / a);
      t1 = Math.min(t1, (-half + s) / a);
    }
  } else {
    for (const [p, d, h] of [
      [px, dx, k.hx],
      [pz, dz, k.hz],
    ]) {
      if (Math.abs(d) < 1e-9) {
        if (Math.abs(p) > h) return false;
        continue;
      }
      const e0 = (-h - p) / d;
      const e1 = (h - p) / d;
      t0 = Math.max(t0, Math.min(e0, e1));
      t1 = Math.min(t1, Math.max(e0, e1));
    }
  }
  if (t0 >= t1) return false;
  const y0 = ay + (by - ay) * t0;
  const y1 = ay + (by - ay) * t1;
  if ((t0 <= 0 && y0 > k.y0 && y0 < k.y1) || (t1 >= 1 && y1 > k.y0 && y1 < k.y1)) return false;
  return Math.max(y0, y1) > k.y0 && Math.min(y0, y1) < k.y1;
}

/** The blocks already looked at on one way (see lightBlocked), each looked at once. */
const met = new Set<Block>();
/** A block narrower than this at its widest, in metres (a pole, a post, a stage's leg), throws only
 * a stripe of shadow, too narrow to put someone in its shade (see lightBlocked). */
const SLENDER = 0.5;

/**
 * Whether something solid stands between the points a and b, as light from a would find it on its
 * way to b: anything the camera keeps out of (walls, roofs, rocks, stalls), not a stool or a basket,
 * nor anything slender.
 */
export function lightBlocked(ax: number, ay: number, az: number, bx: number, by: number, bz: number): boolean {
  met.clear();
  const steps = Math.max(Math.ceil(Math.hypot(bx - ax, bz - az) / (CELL / 4)), 1);
  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    for (const k of blocks.at(ax + (bx - ax) * t, az + (bz - az) * t)) {
      if (!k.camera || met.has(k) || 2 * (k.r > 0 ? k.r : Math.max(k.hx, k.hz)) < SLENDER) continue;
      met.add(k);
      if (crosses(k, ax, ay, az, bx, by, bz)) return true;
    }
  }
  return false;
}

/** Whether the camera at (x, y, z) would be inside something: a block it minds, or a crown. */
export function cameraBlocked(x: number, y: number, z: number, margin: number): boolean {
  for (const b of blocks.at(x, z)) {
    if (b.camera && y > b.y0 - margin && y < b.y1 + margin && inside(b, x, z, margin)) return true;
  }
  for (const c of crowns.at(x, z)) if (Math.hypot(x - c.x, y - c.y, z - c.z) < c.r + margin) return true;
  return false;
}
