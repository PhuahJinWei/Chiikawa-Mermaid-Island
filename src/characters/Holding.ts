import * as THREE from 'three';
import { PART, type CharacterModel, type OutfitModel, type SkirtPattern } from './Model';

/**
 * What someone holds kept out of their own body (the user, 2026-10-23: a torch's tip "visibly clipped into their
 * head"; "make sure none are clipped into character body"). Chiikawa's characters are mostly head, a ball as wide
 * as they are tall over a small body, their short arms under its rim: anything held upright in a paw rises into
 * it, and anything held through its middle sinks into the belly beside it.
 *
 * So a thing is held as a paw holds it: by its side, its middle as far out from the paw as it is thick (a cup by
 * its wall, a stick at its stick); and tipped out and forward, away from them, only as far as it must be to clear
 * them where they are now (see fitHeld): their head turned or not, walking, talking, sitting, eating. What it must
 * clear is their shape (see BodyShape), their head and their body with what they wear, a grass skirt spread on the
 * ground round them as they sit, and what is cleared is the whole of the thing as held (see HeldShape), a torch's
 * flame with it.
 */

/** A body's shape is kept as how far out it reaches round its middle (its vertical axis), so many rows a metre up
 * and so many ways round: as round as Chiikawa's characters are, this is their shape. */
const ROW = 0.02;
const WAYS = 32;
/** The parts their head is (with what hangs from it: ears, a leaf, a crown), their body (a tail, a cape) and their
 * skirt: an arm, a paw or a foot is none of it (a paw holds the thing; feet stand under them). */
const HEAD_PARTS = new Set<number>([PART.HEAD, PART.EAR_L, PART.EAR_R, PART.EAR_L2, PART.EAR_R2, PART.SPROUT]);
const BODY_PARTS = new Set<number>([PART.BODY, PART.TAIL]);

/** How far clear of them what they hold is kept (metres): the pen's line round each, and a little air. Eaten, it
 * comes up to the mouth and may touch it. */
const CLEAR = 0.015;
/** How far a thing held upright is tipped out at most (radians), and how much further out than its own thickness its
 * middle may go (metres), each looked at in so many steps; a centimetre further out is taken as as much of a change as
 * a tenth of a radian's tip (see TRIES). A thing held flat, how far out it may go at most; eaten, how far it is tipped
 * forward at most; each in so many steps. */
const MOST_TILT = 0.75;
const TILT_STEPS = 20;
const MOST_EXTRA = 0.04;
const EXTRA_STEPS = 8;
const EXTRA_COST = 10;
const MOST_PUSH = 0.14;
const MOST_EAT_TILT = 0.8;
const ONE_WAY_STEPS = 20;
/** How fast a thing comes back in once it may: its tip (radians a second) and its push (metres a second); out it goes
 * at once, as far as it must, and back gently. Where it may not come back, it tries again so often (seconds); kept
 * where it is so (a long torch's head clear of theirs, its foot only just clear of their skirt), now and then it looks
 * for a way of holding it that changes it less (seconds); where nothing clears them, it stays where it goes into them
 * least so long before it looks again. */
const TILT_BACK = 1.1;
const EXTRA_BACK = 0.06;
const RETRY = 0.1;
const RESCAN = 1;
const STUCK = 0.3;
/** Clear of them by more than it must be, a thing is left as it is while it could not have come nearer them than that
 * (at most this fast, metres a second, as a paw moves), and at most so long (seconds). */
const CALM_SPEED = 0.3;
const CALM_MOST = 0.1;

/** How a thing is held (see fitHeld): upright in the paw, flat on it, or up at the mouth. */
export type HoldWay = 'upright' | 'flat' | 'eat';

/** A way of holding a thing (see fitHeld): tipped out `tilt`, and pushed out `extra` further (flat, its whole push);
 * how much of a change that is. */
interface Try {
  tilt: number;
  extra: number;
  cost: number;
}

const costOf = (tilt: number, extra: number) => tilt + EXTRA_COST * extra;
const tryOf = (tilt: number, extra: number): Try => ({ tilt, extra, cost: costOf(tilt, extra) });

/** Each way a thing may be held, from the least change to the most; and a few of them, for which goes into them
 * least where none clears them. */
const TRIES: Record<HoldWay, Try[]> = {
  upright: Array.from({ length: (TILT_STEPS + 1) * (EXTRA_STEPS + 1) }, (_, k) =>
    tryOf((MOST_TILT * Math.floor(k / (EXTRA_STEPS + 1))) / TILT_STEPS, (MOST_EXTRA * (k % (EXTRA_STEPS + 1))) / EXTRA_STEPS),
  ).sort((a, b) => a.cost - b.cost),
  flat: Array.from({ length: ONE_WAY_STEPS + 1 }, (_, k) => tryOf(0, (MOST_PUSH * k) / ONE_WAY_STEPS)),
  eat: Array.from({ length: ONE_WAY_STEPS + 1 }, (_, k) => tryOf((MOST_EAT_TILT * k) / ONE_WAY_STEPS, 0)),
};
const ROUGH: Record<HoldWay, Try[]> = {
  upright: [0, 0.25, 0.5, 0.75].flatMap((tilt) => [0, 0.02, 0.04].map((extra) => tryOf(tilt, extra))),
  flat: [0, 0.035, 0.07, 0.105, 0.14].map((push) => tryOf(0, push)),
  eat: [0, 0.2, 0.4, 0.6, 0.8].map((tilt) => tryOf(tilt, 0)),
};

/** How a thing sits in the paw this moment (see fitHeld): its middle `push` out from where the paw holds it
 * (metres), `extra` of it further than its own thickness, along `out` (away from their middle, along the ground), and
 * tipped out by `tilt` (radians) about `axis` (NaN until it is first fitted: see refit); how long it is left as it is,
 * well clear of them (`calm`), until it tries again to come back in (`retry`), looks for a way of holding it that
 * changes it less (`rescan`), and while nothing clears them, for any that does (`stuck`). */
export interface HeldFit {
  tilt: number;
  extra: number;
  push: number;
  out: THREE.Vector3;
  axis: THREE.Vector3;
  calm: number;
  retry: number;
  rescan: number;
  stuck: number;
}

/** A fit of nothing yet: upright, held where the paw is, to be fitted afresh. */
export function heldFit(): HeldFit {
  return {
    tilt: NaN,
    extra: 0,
    push: 0,
    out: new THREE.Vector3(0, 0, 1),
    axis: new THREE.Vector3(1, 0, 0),
    calm: 0,
    retry: 0,
    rescan: 0,
    stuck: 0,
  };
}

/** `fit` to be fitted afresh (another thing in the paw, or held another way). */
export function refit(fit: HeldFit): void {
  fit.tilt = NaN;
  fit.calm = 0;
}

/** Whether `fit` has been fitted (see refit). */
export function fitted(fit: HeldFit): boolean {
  return fit.tilt >= 0;
}

/** Where the middle of a thing held at `grip` sits, as `fit` has it, into `out`. */
export function heldAt(grip: THREE.Vector3, fit: HeldFit, out: THREE.Vector3): THREE.Vector3 {
  return out.copy(grip).addScaledVector(fit.out, fit.push);
}

/** How a thing turned `base` is turned, as `fit` tips it, into `out`. */
export function heldTurn(base: THREE.Quaternion, fit: HeldFit, out: THREE.Quaternion): THREE.Quaternion {
  return out.setFromAxisAngle(fit.axis, fit.tilt).multiply(base);
}

/** A body's faces are looked at this far apart (metres): a skirt is a few long faces from its tie to its hem, and
 * its corners alone would leave nothing of it between them. */
const SAMPLE = 0.015;

/**
 * Someone's shape: how far their head, their body and their skirt reach out round their middle at each height and
 * each way round (from their model as built, and what they wear: the island outfit's crown and skirt, Rakko's cape),
 * each in its own part's frame, so a head turned to watch something turns its shape with it; and their skirt as it
 * spreads out on the ground round them as they sit (`flare`, as far as it spreads: see CharacterMaterial's VERT),
 * each of its corners pushed out and its faces straight between them, as it is drawn. Made once a model (and what it
 * wears).
 */
export class BodyShape {
  private static readonly made = new WeakMap<THREE.BufferGeometry, Map<string, BodyShape>>();

  /** The rows each part reaches out in at all (as far down and up as there is anything of it), to look only there. */
  private readonly headRows: [number, number];
  private readonly bodyRows: [number, number];
  private readonly skirtRows: [number, number];

  private constructor(
    private readonly head: Float32Array,
    private readonly body: Float32Array,
    private readonly skirt: Float32Array,
    private readonly spread: Float32Array,
    rows: number,
  ) {
    this.headRows = rowsOf(head, rows);
    this.bodyRows = rowsOf(body, rows);
    this.skirtRows = rowsOf(spread, rows);
  }

  static of(model: CharacterModel, worn: (OutfitModel | undefined)[], flare: number): BodyShape {
    const key = `${worn.map((o) => o?.geometry.uuid ?? '-').join(',')}:${flare}`;
    let byWorn = BodyShape.made.get(model.geometry);
    if (!byWorn) BodyShape.made.set(model.geometry, (byWorn = new Map()));
    let shape = byWorn.get(key);
    if (!shape) {
      // Each piece with its skirt's tie and hem, as its material has them (its own skirt, the outfit's).
      const pieces: [THREE.BufferGeometry, SkirtPattern | null][] = [
        [model.geometry, model.rig.patterns?.skirt ?? null],
        ...worn.filter((o): o is OutfitModel => !!o).map((o): [THREE.BufferGeometry, SkirtPattern | null] => [o.geometry, o.info.skirt]),
      ];
      let top = 0;
      for (const [g] of pieces) {
        const position = g.getAttribute('position');
        for (let i = 0; i < position.count; i++) top = Math.max(top, position.getY(i));
      }
      const rows = Math.ceil(top / ROW) + 2;
      const tables = [0, 1, 2, 3].map(() => new Float32Array(rows * WAYS));
      for (const [g, pattern] of pieces) sampleFaces(g, pattern, flare, rows, tables);
      shape = new BodyShape(...(tables.map((t) => closed(t, rows)) as [Float32Array, Float32Array, Float32Array, Float32Array]), rows);
      byWorn.set(key, shape);
    }
    return shape;
  }

  /**
   * How deep (x, y, z), a point in their body's own frame as drawn, is in them as they are now (`pose`): below 0, how
   * far clear of them it is (far below or above them, -Infinity). Its squash and lean are undone, as the shader does
   * them; their head and skirt are each taken back to as built. Many a frame, so in plain numbers.
   */
  depthAt(x: number, y: number, z: number, pose: BodyPose): number {
    const s = pose.squash;
    const height = pose.height;
    const py = y / s;
    const h = Math.max(py, 0) / height;
    const px = (x - pose.leanX * h * h * height) * pose.root;
    const pz = (z - pose.leanZ * h * h * height) * pose.root;
    let deep = -Infinity;
    // Their body (its frame is the body's own) and their skirt (turned a little as it sways: the body's way round).
    const row = Math.floor(py / ROW);
    let way = -1;
    if (row >= this.bodyRows[0] && row <= this.bodyRows[1]) {
      way = wayOf(px, pz);
      deep = this.body[row * WAYS + way] - Math.sqrt(px * px + pz * pz);
    }
    const k = pose.skirtBack;
    const sy = k[1] * px + k[5] * py + k[9] * pz + k[13];
    const skirtRow = Math.floor(sy / ROW);
    if (skirtRow >= this.skirtRows[0] && skirtRow <= this.skirtRows[1]) {
      const sx = k[0] * px + k[4] * py + k[8] * pz + k[12];
      const sz = k[2] * px + k[6] * py + k[10] * pz + k[14];
      if (way < 0) way = wayOf(px, pz);
      const cell = skirtRow * WAYS + way;
      const reach = this.skirt[cell] + (this.spread[cell] - this.skirt[cell]) * pose.spread;
      deep = Math.max(deep, reach - Math.sqrt(sx * sx + sz * sz));
    }
    // Their head, turned as it is.
    const e = pose.headBack;
    const hy = e[1] * px + e[5] * py + e[9] * pz + e[13];
    const headRow = Math.floor(hy / ROW);
    if (headRow >= this.headRows[0] && headRow <= this.headRows[1]) {
      const hx = e[0] * px + e[4] * py + e[8] * pz + e[12];
      const hz = e[2] * px + e[6] * py + e[10] * pz + e[14];
      deep = Math.max(deep, this.head[headRow * WAYS + wayOf(hx, hz)] - Math.sqrt(hx * hx + hz * hz));
    }
    return deep;
  }
}

/**
 * Someone as they are this moment, for their shape to be tested against (see BodyShape.depthAt): their squash and
 * lean (CharacterMaterial's softBody), their height, their head's and skirt's matrices taken back to as built, and how
 * far their skirt is spread on the ground (0 to 1). Set each frame by whoever holds something.
 */
export class BodyPose {
  squash = 1;
  /** The square root of the squash: what undoes its widening. */
  root = 1;
  leanX = 0;
  leanZ = 0;
  height = 1;
  spread = 0;
  readonly headBack: number[] = new THREE.Matrix4().elements;
  readonly skirtBack: number[] = new THREE.Matrix4().elements;

  set(squash: number, lean: THREE.Vector2, height: number, head: THREE.Matrix4, skirt: THREE.Matrix4, spread: number): void {
    this.squash = squash;
    this.root = Math.sqrt(squash);
    this.leanX = lean.x;
    this.leanZ = lean.y;
    this.height = height;
    this.spread = spread;
    _m.copy(head).invert();
    for (let i = 0; i < 16; i++) this.headBack[i] = _m.elements[i];
    _m.copy(skirt).invert();
    for (let i = 0; i < 16; i++) this.skirtBack[i] = _m.elements[i];
  }
}

/** The lowest and highest rows `table` (of `rows` rows) has anything in ([1, 0]: none). */
function rowsOf(table: Float32Array, rows: number): [number, number] {
  let lo = rows;
  let hi = -1;
  for (let row = 0; row < rows; row++) {
    for (let way = 0; way < WAYS; way++) {
      if (table[row * WAYS + way] > 0) {
        lo = Math.min(lo, row);
        hi = Math.max(hi, row);
        break;
      }
    }
  }
  return lo <= hi ? [lo, hi] : [1, 0];
}

/** Which of a shape's ways round (x, z) is. */
function wayOf(x: number, z: number): number {
  const a = Math.atan2(x, z) / (2 * Math.PI);
  return Math.floor((a < 0 ? a + 1 : a) * WAYS) % WAYS;
}

/**
 * `g`'s faces, a point every SAMPLE across each, into `tables` (their head's, their body's, their skirt's, and their
 * skirt's spread out as far as `flare` spreads it: see BodyShape), as far out round their middle as each reaches.
 * `pattern`, its skirt's tie and hem (none: as the shader takes it, from 1 m down to the ground).
 */
function sampleFaces(g: THREE.BufferGeometry, pattern: SkirtPattern | null, flare: number, rows: number, tables: Float32Array[]): void {
  const position = g.getAttribute('position');
  const part0 = g.getAttribute('aPart0');
  const part1 = g.getAttribute('aPart1');
  const weight = g.getAttribute('aWeight');
  const n = position.count;
  // Each corner's table (0 their head, 1 their body, 2 their skirt, -1 none: as much of which part as it is most),
  // and where it is with the skirt spread out (as much as it is the skirt, as the shader spreads it).
  const which = new Int8Array(n);
  const spreadAt = new Float32Array(n * 3);
  const hem = pattern?.bottom ?? 0;
  const tie = pattern?.top ?? 1;
  for (let i = 0; i < n; i++) {
    const p0 = part0 ? Math.round(part0.getX(i)) : PART.BODY;
    const p1 = part1 ? Math.round(part1.getX(i)) : p0;
    const w = weight ? weight.getX(i) : 0;
    const k = w > 0.5 ? p1 : p0;
    which[i] = HEAD_PARTS.has(k) ? 0 : BODY_PARTS.has(k) ? 1 : k === PART.SKIRT ? 2 : -1;
    const onSkirt = (p0 === PART.SKIRT ? 1 - w : 0) + (p1 === PART.SKIRT ? w : 0);
    const y = position.getY(i);
    const down = Math.min(1, Math.max(0, (tie - y) / Math.max(tie - hem, 1e-3)));
    const grow = 1 + flare * onSkirt * down * down;
    spreadAt[3 * i] = position.getX(i) * grow;
    spreadAt[3 * i + 1] = y;
    spreadAt[3 * i + 2] = position.getZ(i) * grow;
  }
  const index = g.index;
  const count = index ? index.count : n;
  const corner = (k: number) => (index ? index.getX(k) : k);
  for (let k = 0; k + 2 < count; k += 3) {
    const a = corner(k);
    const b = corner(k + 1);
    const c = corner(k + 2);
    // A face is of the table two of its corners are of, at least.
    const t = which[a] === which[b] || which[a] === which[c] ? which[a] : which[b] === which[c] ? which[b] : -1;
    if (t < 0) continue;
    _fa.fromBufferAttribute(position, a);
    _fb.fromBufferAttribute(position, b);
    _fc.fromBufferAttribute(position, c);
    const steps = Math.max(1, Math.ceil(Math.max(_fa.distanceTo(_fb), _fb.distanceTo(_fc), _fc.distanceTo(_fa)) / SAMPLE));
    for (let i = 0; i <= steps; i++) {
      for (let j = 0; j <= steps - i; j++) {
        const u = i / steps;
        const v = j / steps;
        const w = 1 - u - v;
        const y = _fa.y * w + _fb.y * u + _fc.y * v;
        mark(tables[t], rows, _fa.x * w + _fb.x * u + _fc.x * v, y, _fa.z * w + _fb.z * u + _fc.z * v);
        if (t === 2) {
          const x = spreadAt[3 * a] * w + spreadAt[3 * b] * u + spreadAt[3 * c] * v;
          const z = spreadAt[3 * a + 2] * w + spreadAt[3 * b + 2] * u + spreadAt[3 * c + 2] * v;
          mark(tables[3], rows, x, y, z);
        }
      }
    }
  }
}

/** A point of a shape at (x, y, z) into `table` (of `rows` rows), as far out round the middle as it is. */
function mark(table: Float32Array, rows: number, x: number, y: number, z: number): void {
  const cell = cellOf(x, y, z, rows);
  if (cell >= 0) table[cell] = Math.max(table[cell], Math.sqrt(x * x + z * z));
}

/** Where (x, y, z) falls in a shape's table of `rows` rows, or -1. */
function cellOf(x: number, y: number, z: number, rows: number): number {
  const row = Math.floor(y / ROW);
  if (row < 0 || row >= rows) return -1;
  const way = Math.floor((((Math.atan2(x, z) / (2 * Math.PI)) % 1) + 1) % 1 * WAYS) % WAYS;
  return row * WAYS + way;
}

/** A shape's table with each place reaching as far as its farthest neighbour: what lies between a model's
 * vertices is filled in. */
function closed(table: Float32Array, rows: number): Float32Array {
  const out = new Float32Array(table.length);
  for (let row = 0; row < rows; row++) {
    for (let way = 0; way < WAYS; way++) {
      let r = 0;
      for (let dr = -1; dr <= 1; dr++) {
        const rr = row + dr;
        if (rr < 0 || rr >= rows) continue;
        for (let dw = -1; dw <= 1; dw++) r = Math.max(r, table[rr * WAYS + ((way + dw + WAYS) % WAYS)]);
      }
      out[row * WAYS + way] = r;
    }
  }
  return out;
}

/** The ways a held thing's outermost points are looked for (see HeldShape): every way to a cube's corners, edges'
 * middles and faces' middles from its middle. */
const WAYS_OUT: THREE.Vector3[] = [];
for (const x of [-1, 0, 1]) for (const y of [-1, 0, 1]) for (const z of [-1, 0, 1]) if (x || y || z) WAYS_OUT.push(new THREE.Vector3(x, y, z).normalize());

/** A held thing is looked at in slices this thick (metres) along its length (its y), as it is held. */
const SLICE = 0.02;

/** A slice of a held thing (see HeldShape): its middle, in its own frame, and how far out round it it reaches. */
export interface HeldSlice {
  at: THREE.Vector3;
  r: number;
}

/**
 * A held thing's shape, as it is held (its grip at its origin, up its y): its outermost points every way, and its
 * slices along its length, each as round as it reaches (a stick's side, which no outermost point is on, comes near
 * them first), which are what must clear whoever holds it; and how thick it is where it is held (its stick's, its
 * cup's middle: how far out from the paw its middle is). Made once a shape.
 */
export class HeldShape {
  private static readonly made = new WeakMap<THREE.BufferGeometry, HeldShape>();

  private constructor(
    readonly points: THREE.Vector3[],
    readonly slices: HeldSlice[],
    readonly thick: number,
  ) {}

  /** The shape of `thing` (made by createHeld: its body, its pen, a torch's flame; or the cave's torch). */
  static of(thing: THREE.Object3D): HeldShape {
    const meshes: THREE.Mesh[] = [];
    thing.traverse((o) => {
      const m = o as THREE.Mesh;
      // (Not its pen's hull, nor a book's halves open, held only as it is read: see Items' ItemModels.)
      if (m.isMesh && (m.material as THREE.Material).side !== THREE.BackSide && !m.userData.unheld) meshes.push(m);
    });
    const key = meshes[0]?.geometry;
    const known = key ? HeldShape.made.get(key) : undefined;
    if (known) return known;
    const found = WAYS_OUT.map(() => new THREE.Vector3());
    const best = WAYS_OUT.map(() => -Infinity);
    let low = Infinity;
    let high = -Infinity;
    for (const m of meshes) {
      const position = m.geometry.getAttribute('position');
      for (let i = 0; i < position.count; i++) {
        _p.fromBufferAttribute(position, i);
        low = Math.min(low, _p.y);
        high = Math.max(high, _p.y);
        WAYS_OUT.forEach((w, k) => {
          const d = w.dot(_p);
          if (d > best[k]) {
            best[k] = d;
            found[k].copy(_p);
          }
        });
      }
    }
    // (One point the farthest several ways is looked at once.)
    const points: THREE.Vector3[] = [];
    for (const p of found) if (!points.some((q) => q.distanceToSquared(p) < 1e-6)) points.push(p);
    const slices: HeldSlice[] = [];
    for (let y = low + SLICE / 2; y < high; y += SLICE) {
      const cut = cutAcross(meshes.map((m) => m.geometry), y);
      if (cut) slices.push(cut);
    }
    const shape = new HeldShape(points, slices, key ? (cutAcross([key], 0)?.r ?? 0) : 0);
    if (key) HeldShape.made.set(key, shape);
    return shape;
  }
}

/** `geometries` cut across at height `y` (with what lies within half a slice of it): the middle of what is there and
 * how far out round it it reaches, or null where nothing is. */
function cutAcross(geometries: THREE.BufferGeometry[], y: number): HeldSlice | null {
  const xs: number[] = [];
  const zs: number[] = [];
  for (const geometry of geometries) {
    const position = geometry.getAttribute('position');
    const index = geometry.index;
    const count = index ? index.count : position.count;
    const at = (k: number) => (index ? index.getX(k) : k);
    for (let k = 0; k + 2 < count; k += 3) {
      for (let e = 0; e < 3; e++) {
        const a = at(k + e);
        const b = at(k + ((e + 1) % 3));
        const ya = position.getY(a) - y;
        const yb = position.getY(b) - y;
        if (Math.abs(ya) <= SLICE / 2) {
          xs.push(position.getX(a));
          zs.push(position.getZ(a));
        }
        if (ya <= 0 === yb <= 0) continue;
        const t = ya / (ya - yb);
        xs.push(position.getX(a) + (position.getX(b) - position.getX(a)) * t);
        zs.push(position.getZ(a) + (position.getZ(b) - position.getZ(a)) * t);
      }
    }
  }
  if (!xs.length) return null;
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
  const cz = (Math.min(...zs) + Math.max(...zs)) / 2;
  let r = 0;
  for (let i = 0; i < xs.length; i++) r = Math.max(r, Math.hypot(xs[i] - cx, zs[i] - cz));
  // (Its thickness at the grip is from the grip's own middle.)
  if (y === 0) r = Math.max(...xs.map((x, i) => Math.hypot(x, zs[i])));
  return { at: new THREE.Vector3(cx, y, cz), r };
}

/** How deep a point (in their body's own frame, as drawn) is in whoever holds a thing: below 0, how far clear. */
export type DepthIn = (x: number, y: number, z: number) => number;

/**
 * Fits `held` (`size` times as big as built: a thing half eaten is smaller), held `way` with its grip at `grip` and
 * turned `base` (in their body's own frame, as drawn), clear of whoever holds it (`depth`), into `fit`, from how it
 * sat a moment (`dt`) ago: upright, its middle out from the paw by its own thickness and tipped out and forward, away
 * from their middle, and its middle a little further out, as little as clears them (see TRIES); flat on the paw (a
 * tray), as little further out as clears them, never tipped; at the mouth, tipped forward, away from the face, as
 * little as clears it. Out at once, as far as it must go; back in gently, as far as it may. Where nothing clears them,
 * where it goes into them least.
 *
 * (A long thing may clear them only between two tips: a torch too upright has its head in theirs, tipped too far its
 * foot in their skirt; a little further out, it clears both. So every way of holding it is looked at, from the least
 * change, not only the next one out.)
 */
export function fitHeld(
  held: HeldShape,
  way: HoldWay,
  size: number,
  grip: THREE.Vector3,
  base: THREE.Quaternion,
  depth: DepthIn,
  dt: number,
  fit: HeldFit,
): HeldFit {
  // Away from their middle: out from it to the grip, along the ground.
  fit.out.set(grip.x, 0, grip.z);
  if (fit.out.lengthSq() < 1e-6) fit.out.set(0, 0, 1);
  fit.out.normalize();
  fit.axis.set(0, 1, 0).cross(fit.out).normalize();
  const clear = way === 'eat' ? 0 : CLEAR;
  const sliced = way !== 'flat';
  const deepAt = (tilt: number, extra: number, enough: number) =>
    depthOf(held, size, grip, base, setFit(fit, held, way, size, tilt, extra), depth, enough, sliced);
  const clears = (tilt: number, extra: number) => deepAt(tilt, extra, -clear) <= -clear;
  const tries = TRIES[way];
  let tilt = fit.tilt;
  let extra = fit.extra;
  // Well clear of them a moment ago: as it is, a moment longer (as long as it takes to come as near as it was clear).
  fit.calm -= dt;
  if (tilt >= 0 && fit.calm > 0) return setFit(fit, held, way, size, tilt, extra);
  let clearNow = false;
  if (tilt >= 0) {
    const deep = deepAt(tilt, extra, -clear);
    clearNow = deep <= -clear;
    if (clearNow) fit.calm = Math.min(CALM_MOST, (-clear - deep) / CALM_SPEED);
  }
  if (clearNow) {
    // Clear as it is: back in a little, if that clears them too, its push first; kept where it is, now and then a way
    // of holding it that changes it less (past what keeps it here).
    fit.stuck = 0;
    fit.rescan -= dt;
    fit.retry -= dt;
    if ((tilt > 0 || extra > 0) && fit.retry <= 0) {
      const less = Math.max(0, extra - EXTRA_BACK * dt);
      const upright = Math.max(0, tilt - TILT_BACK * dt);
      if (extra > 0 && clears(tilt, less)) extra = less;
      else if (tilt > 0 && clears(upright, extra)) tilt = upright;
      else if (fit.rescan <= 0) {
        fit.rescan = RESCAN;
        const now = costOf(tilt, extra);
        for (const t of tries) {
          if (t.cost >= now - 1e-9) break;
          if (clears(t.tilt, t.extra)) {
            tilt = t.tilt;
            extra = t.extra;
            break;
          }
        }
      } else fit.retry = RETRY;
    }
  } else if (!(tilt >= 0) || fit.stuck <= 0) {
    // Into them (or fitted afresh): the least change that clears them; if none, where it goes into them least.
    fit.rescan = RESCAN;
    fit.retry = 0;
    const found = tries.find((t) => clears(t.tilt, t.extra));
    if (found) {
      tilt = found.tilt;
      extra = found.extra;
      fit.stuck = 0;
    } else {
      let least = Infinity;
      for (const t of ROUGH[way]) {
        const deep = deepAt(t.tilt, t.extra, Infinity);
        if (deep < least) {
          least = deep;
          tilt = t.tilt;
          extra = t.extra;
        }
      }
      fit.stuck = STUCK;
    }
  } else {
    // Nothing cleared them a moment ago: as it is, until it looks again.
    fit.stuck -= dt;
  }
  return setFit(fit, held, way, size, tilt, extra);
}

/** `fit` tipped out `tilt` and pushed out `extra` further (flat, its whole push; eaten, none), as `held` (`size` times
 * as big as built) is held `way`. */
function setFit(fit: HeldFit, held: HeldShape, way: HoldWay, size: number, tilt: number, extra: number): HeldFit {
  fit.tilt = tilt;
  fit.extra = extra;
  fit.push = way === 'flat' ? extra : way === 'eat' ? 0 : held.thick * size + extra;
  return fit;
}

/** How deep the deepest of `held` is in them, held at `grip` turned `base` as `fit` has it: its slices (unless it lies
 * flat, all outermost points), each by its edge nearest their middle, and its outermost points. It stops looking once
 * something is deeper than `enough`. */
function depthOf(
  held: HeldShape,
  size: number,
  grip: THREE.Vector3,
  base: THREE.Quaternion,
  fit: HeldFit,
  depth: DepthIn,
  enough: number,
  sliced: boolean,
): number {
  heldTurn(base, fit, _turn);
  heldAt(grip, fit, _at);
  let deepest = -Infinity;
  if (sliced) {
    _up.set(0, 1, 0).applyQuaternion(_turn);
    for (const slice of held.slices) {
      _p.copy(slice.at).multiplyScalar(size).applyQuaternion(_turn).add(_at);
      // Toward their middle along the ground, as the slice lies.
      _in.set(-_p.x, 0, -_p.z);
      _in.addScaledVector(_up, -_in.dot(_up));
      const l = _in.length();
      if (l > 1e-6) _p.addScaledVector(_in, (slice.r * size) / l);
      deepest = Math.max(deepest, depth(_p.x, _p.y, _p.z));
      if (deepest > enough) return deepest;
    }
  }
  for (const point of held.points) {
    _p.copy(point).multiplyScalar(size).applyQuaternion(_turn).add(_at);
    deepest = Math.max(deepest, depth(_p.x, _p.y, _p.z));
    if (deepest > enough) return deepest;
  }
  return deepest;
}

const _p = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _fa = new THREE.Vector3();
const _fb = new THREE.Vector3();
const _fc = new THREE.Vector3();
const _at = new THREE.Vector3();
const _up = new THREE.Vector3();
const _in = new THREE.Vector3();
const _turn = new THREE.Quaternion();
