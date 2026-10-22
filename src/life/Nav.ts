import * as THREE from 'three';
import { deckUnder } from '../world/Obstacles';
import { islandSquare, standAt, terrainHeight, waterLevelAt } from '../world/Island';

/**
 * Finding the way about the island, for everyone who lives on it (see Life). The island is cut into a
 * grid of half-metre cells, worked out a chunk at a time as the way is first sought through it, each cell
 * holding every height one can stand at in it (the ground, a porch or a hut's floor over it, a stall's
 * floor), by the same rules as walking (Island.ts standAt). From a cell one walks to the next if the
 * step between them is one a walker takes (STEP_UP up, STEP_DOWN down); a doorway or a stall's side,
 * narrower than a cell, is crossed by a portal: two points either side of it, joined, each joined to the
 * cells round it it can be walked to in a straight line. The way found is then pulled straight wherever a
 * walker can go straight. Searches run a little each frame (see work), so a long way never holds a frame
 * up.
 */

/** A cell's width, in metres. */
const CELL = 0.5;
/** Cells along a chunk's side: the grid is worked out a chunk at a time. */
const CHUNK = 32;
/** The most heights one can stand at in one cell: the ground, a floor over it, and one more. */
const LEVELS = 3;
const PER_CHUNK = CHUNK * CHUNK * LEVELS;
/** The highest step up a walker takes (Island.ts STEP_UP), and the furthest step down taken on purpose:
 * further is a fall, which no one takes on their way. */
const STEP_UP = 0.35;
const STEP_DOWN = 0.5;
/** Two heights this close are one. */
const SAME = 0.06;
/** The grid keeps this much further from rocks and props than walkers do (Island.ts standAt), so nothing
 * thinner than a cell (a rail, a post) lies unseen between two cells' middles. */
const PAD = 0.15;
/** How much more each metre through water costs than over dry ground, so walkers keep out of the sea
 * where they can (they can wade it). */
const WET = 3;
/** Portals' nodes are numbered from here, past every cell's. */
const PORTAL_BASE = 1 << 28;
/** Searching costs about this many cells' expansion to work out a chunk. */
const CHUNK_COST = 400;
/** How far a portal reaches for the cells round it to join, and a way's ends for the cell they start or
 * end at, in metres. A portal none of whose cells are that near (steps up to a door can leave the nearest
 * outside it just out of reach) reaches as far as PORTAL_REACH_MOST. */
const PORTAL_REACH = 1.1;
const PORTAL_REACH_MOST = 1.8;
const END_REACH = 1.6;
/** Steps a straight way is checked at, in metres. */
const LINE_STEP = 0.2;
/** A way is pulled straight over at most this many of its cells at a time (40 m). */
const PULL = 80;
const DIAGONAL = Math.SQRT2;
/** What a step costs within reach of someone a way keeps clear of (see seek), as metres walked: dear
 * enough to go a good way round, not so dear a narrow way they stand in is never taken (they are squeezed
 * past there, see Life.part). */
const AVOID_COST = 6;

const NEIGHBOURS: [number, number, number][] = [
  [1, 0, 1],
  [-1, 0, 1],
  [0, 1, 1],
  [0, -1, 1],
  [1, 1, DIAGONAL],
  [1, -1, DIAGONAL],
  [-1, 1, DIAGONAL],
  [-1, -1, DIAGONAL],
];

interface Chunk {
  /** The heights one can stand at in each cell, lowest first (NaN past the last). */
  readonly h: Float32Array;
  /** Whether standing at that height is wading. */
  readonly wet: Uint8Array;
  /** The search's own, for whichever search last touched the chunk (stamp). */
  g: Float32Array | null;
  from: Int32Array | null;
  state: Uint8Array | null;
  stamp: number;
}

interface Link {
  to: number;
  cost: number;
}

interface Portal {
  readonly p: THREE.Vector3;
  readonly links: Link[];
  g: number;
  from: number;
  state: number;
  stamp: number;
  /** Whether it has been joined to the cells round it yet. */
  joined: boolean;
}

/** Someone a way keeps clear of (see Nav.seek): where they stand, and how near it stays clear of them. */
export interface Avoid {
  x: number;
  z: number;
  r: number;
}

/** A way being sought (see Nav.seek): its ends, then the way, or that there is none. */
export interface Way {
  readonly from: THREE.Vector3;
  readonly to: THREE.Vector3;
  status: 'seeking' | 'found' | 'none';
  /** The points to walk to in turn, the first where it starts. */
  points: THREE.Vector3[];
}

interface Search {
  way: Way;
  stamp: number;
  start: number;
  goal: number;
  goalAt: THREE.Vector3;
  started: boolean;
  avoid: readonly Avoid[];
}

/** A small binary heap of nodes by cost. */
class Heap {
  private ids = new Int32Array(1024);
  private keys = new Float32Array(1024);
  size = 0;

  push(id: number, key: number): void {
    if (this.size === this.ids.length) {
      const ids = new Int32Array(this.size * 2);
      const keys = new Float32Array(this.size * 2);
      ids.set(this.ids);
      keys.set(this.keys);
      this.ids = ids;
      this.keys = keys;
    }
    let i = this.size++;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.keys[parent] <= key) break;
      this.ids[i] = this.ids[parent];
      this.keys[i] = this.keys[parent];
      i = parent;
    }
    this.ids[i] = id;
    this.keys[i] = key;
  }

  pop(): number {
    const top = this.ids[0];
    const id = this.ids[--this.size];
    const key = this.keys[this.size];
    let i = 0;
    for (;;) {
      let child = 2 * i + 1;
      if (child >= this.size) break;
      if (child + 1 < this.size && this.keys[child + 1] < this.keys[child]) child++;
      if (this.keys[child] >= key) break;
      this.ids[i] = this.ids[child];
      this.keys[i] = this.keys[child];
      i = child;
    }
    this.ids[i] = id;
    this.keys[i] = key;
    return top;
  }
}

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();

export class Nav {
  private readonly x0: number;
  private readonly z0: number;
  /** Cells and chunks along the map's side. */
  private readonly cells: number;
  private readonly chunks: number;
  private readonly grid: (Chunk | undefined)[];
  private readonly portals: Portal[] = [];
  /** Which portals lie in each chunk, to be joined to its cells once it is worked out. */
  private readonly portalsIn = new Map<number, number[]>();
  /** The cells joined to portals, and the portals each is joined to. */
  private readonly gridLinks = new Map<number, Link[]>();
  private readonly queue: Search[] = [];
  private readonly heap = new Heap();
  private stamp = 0;
  /** Cells expanded and chunks worked out, all told (for the dev tools). */
  expanded = 0;
  built = 0;

  constructor() {
    const square = islandSquare();
    if (!square) throw new Error('Nav needs the island loaded');
    this.x0 = square.x;
    this.z0 = square.z;
    this.cells = Math.ceil(square.size / CELL);
    this.chunks = Math.ceil(this.cells / CHUNK);
    this.grid = new Array(this.chunks * this.chunks);
  }

  // ---------------------------------------------------------------- portals
  /**
   * A way through a narrow place (a doorway, a stall's open side) the grid's cells are too coarse to find:
   * from `a` to `b`, which a walker can walk straight between, each joined to the cells round it. Returns
   * the two ends' nodes.
   */
  addPortal(a: THREE.Vector3, b: THREE.Vector3): [number, number] {
    const ia = this.portalAt(a);
    const ib = this.portalAt(b);
    const cost = a.distanceTo(b);
    this.portals[ia - PORTAL_BASE].links.push({ to: ib, cost });
    this.portals[ib - PORTAL_BASE].links.push({ to: ia, cost });
    return [ia, ib];
  }

  /** A portal's end at `p`, or an existing one there. */
  private portalAt(p: THREE.Vector3): number {
    const found = this.portals.findIndex((q) => q.p.distanceToSquared(p) < 0.01);
    if (found >= 0) return PORTAL_BASE + found;
    const index = this.portals.length;
    this.portals.push({ p: p.clone(), links: [], g: 0, from: -1, state: 0, stamp: 0, joined: false });
    const chunk = this.chunkOf(p.x, p.z);
    if (chunk >= 0) {
      const list = this.portalsIn.get(chunk) ?? [];
      list.push(index);
      this.portalsIn.set(chunk, list);
      // Joined at once if its chunk is worked out already.
      if (this.grid[chunk]) this.joinPortal(index);
    }
    return PORTAL_BASE + index;
  }

  /** Joins a portal's end to the cells round it it can walk to straight (further off if none near do). */
  private joinPortal(index: number): void {
    const portal = this.portals[index];
    if (portal.joined) return;
    portal.joined = true;
    const id = PORTAL_BASE + index;
    for (const reach of [PORTAL_REACH, PORTAL_REACH_MOST]) {
      for (const node of this.nodesNear(portal.p, reach, 0.45)) {
        if (portal.links.some((l) => l.to === node)) continue;
        this.nodePoint(node, _a);
        if (!this.straight(portal.p, _a)) continue;
        const cost = portal.p.distanceTo(_a);
        portal.links.push({ to: node, cost });
        const list = this.gridLinks.get(node) ?? [];
        list.push({ to: id, cost });
        this.gridLinks.set(node, list);
      }
      if (portal.links.some((l) => l.to < PORTAL_BASE)) return;
    }
  }

  // ---------------------------------------------------------------- the grid
  private chunkOf(x: number, z: number): number {
    const gi = Math.floor((x - this.x0) / CELL);
    const gj = Math.floor((z - this.z0) / CELL);
    if (gi < 0 || gj < 0 || gi >= this.cells || gj >= this.cells) return -1;
    return Math.floor(gj / CHUNK) * this.chunks + Math.floor(gi / CHUNK);
  }

  /** The chunk, worked out if it has not been yet. */
  private chunk(index: number): Chunk {
    let c = this.grid[index];
    if (c) return c;
    c = this.build(index);
    this.grid[index] = c;
    for (const p of this.portalsIn.get(index) ?? []) this.joinPortal(p);
    return c;
  }

  /** Works out every cell of a chunk: each height one can stand at in it. */
  private build(index: number): Chunk {
    this.built++;
    const h = new Float32Array(PER_CHUNK).fill(NaN);
    const wet = new Uint8Array(PER_CHUNK);
    const ci = index % this.chunks;
    const cj = Math.floor(index / this.chunks);
    const found: number[] = [];
    for (let lj = 0; lj < CHUNK; lj++) {
      for (let li = 0; li < CHUNK; li++) {
        const gi = ci * CHUNK + li;
        const gj = cj * CHUNK + lj;
        if (gi >= this.cells || gj >= this.cells) continue;
        const x = this.x0 + (gi + 0.5) * CELL;
        const z = this.z0 + (gj + 0.5) * CELL;
        // Where one might stand: the ground, and every deck over it, from the highest down.
        found.length = 0;
        const candidates = [terrainHeight(x, z)];
        let reach = Infinity;
        for (let k = 0; k < 4; k++) {
          const deck = deckUnder(x, z, reach);
          if (deck === null) break;
          candidates.push(deck);
          reach = deck - 0.01;
        }
        for (const c of candidates) {
          const s = standAt(x, z, c, PAD);
          if (Number.isNaN(s) || Math.abs(s - c) > SAME) continue;
          if (found.some((f) => Math.abs(f - s) < SAME)) continue;
          found.push(s);
        }
        found.sort((a, b) => a - b);
        const base = (lj * CHUNK + li) * LEVELS;
        const water = waterLevelAt(x, z);
        for (let l = 0; l < Math.min(found.length, LEVELS); l++) {
          h[base + l] = found[l];
          if (found[l] < water - 0.02) wet[base + l] = 1;
        }
      }
    }
    return { h, wet, g: null, from: null, state: null, stamp: -1 };
  }

  /** The node for cell (gi, gj) at level l. */
  private node(gi: number, gj: number, l: number): number {
    const ci = Math.floor(gi / CHUNK);
    const cj = Math.floor(gj / CHUNK);
    return (cj * this.chunks + ci) * PER_CHUNK + ((gj - cj * CHUNK) * CHUNK + (gi - ci * CHUNK)) * LEVELS + l;
  }

  /** Where a node is: its cell's middle at its height, or a portal's end. */
  private nodePoint(id: number, out: THREE.Vector3): THREE.Vector3 {
    if (id >= PORTAL_BASE) return out.copy(this.portals[id - PORTAL_BASE].p);
    const chunk = Math.floor(id / PER_CHUNK);
    const rest = id - chunk * PER_CHUNK;
    const cell = Math.floor(rest / LEVELS);
    const ci = chunk % this.chunks;
    const cj = Math.floor(chunk / this.chunks);
    const gi = ci * CHUNK + (cell % CHUNK);
    const gj = cj * CHUNK + Math.floor(cell / CHUNK);
    return out.set(this.x0 + (gi + 0.5) * CELL, this.chunk(chunk).h[rest], this.z0 + (gj + 0.5) * CELL);
  }

  /** The height one stands at in cell (gi, gj) at level l (NaN for none, or off the map). */
  private heightAt(gi: number, gj: number, l: number): number {
    if (gi < 0 || gj < 0 || gi >= this.cells || gj >= this.cells) return NaN;
    const ci = Math.floor(gi / CHUNK);
    const cj = Math.floor(gj / CHUNK);
    return this.chunk(cj * this.chunks + ci).h[((gj - cj * CHUNK) * CHUNK + (gi - ci * CHUNK)) * LEVELS + l];
  }

  /** The level of cell (gi, gj) someone at height `from` walks onto: the nearest within a step, or -1. */
  private stepTo(gi: number, gj: number, from: number): number {
    let best = -1;
    let bestD = Infinity;
    for (let l = 0; l < LEVELS; l++) {
      const h = this.heightAt(gi, gj, l);
      if (Number.isNaN(h)) break;
      if (h - from > STEP_UP + SAME || from - h > STEP_DOWN) continue;
      const d = Math.abs(h - from);
      if (d < bestD) {
        bestD = d;
        best = l;
      }
    }
    return best;
  }

  /** The nodes within `reach` metres of p (flat) whose height is within `rise` of p's, nearest first. */
  private nodesNear(p: THREE.Vector3, reach: number, rise: number): number[] {
    const gi0 = Math.floor((p.x - this.x0) / CELL);
    const gj0 = Math.floor((p.z - this.z0) / CELL);
    const r = Math.ceil(reach / CELL);
    const found: [number, number][] = [];
    for (let dj = -r; dj <= r; dj++) {
      for (let di = -r; di <= r; di++) {
        const gi = gi0 + di;
        const gj = gj0 + dj;
        const x = this.x0 + (gi + 0.5) * CELL;
        const z = this.z0 + (gj + 0.5) * CELL;
        const d = Math.hypot(x - p.x, z - p.z);
        if (d > reach) continue;
        for (let l = 0; l < LEVELS; l++) {
          const h = this.heightAt(gi, gj, l);
          if (Number.isNaN(h)) break;
          if (Math.abs(h - p.y) <= rise) found.push([this.node(gi, gj, l), d + Math.abs(h - p.y)]);
        }
      }
    }
    found.sort((a, b) => a[1] - b[1]);
    return found.map((f) => f[0]);
  }

  // ---------------------------------------------------------------- walking straight
  /**
   * Whether a walker can go straight from `a` to `b` (their feet at a.y), every step of the way one they
   * take, and arrive within a step of b's height.
   */
  straight(a: THREE.Vector3, b: THREE.Vector3): boolean {
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const length = Math.hypot(dx, dz);
    const steps = Math.max(1, Math.ceil(length / LINE_STEP));
    let feet = a.y;
    for (let k = 1; k <= steps; k++) {
      const t = k / steps;
      const h = standAt(a.x + dx * t, a.z + dz * t, feet);
      if (Number.isNaN(h) || h - feet > STEP_UP + 0.02 || feet - h > STEP_DOWN) return false;
      feet = h;
    }
    return Math.abs(feet - b.y) < STEP_UP;
  }

  /** The node nearest `p` that p can be walked to (or from) straight, within END_REACH; -1 if none. */
  private endNode(p: THREE.Vector3): number {
    for (const node of this.nodesNear(p, END_REACH, 0.6)) {
      this.nodePoint(node, _b);
      if (this.straight(p, _b) || this.straight(_b, p)) return node;
    }
    return -1;
  }

  // ---------------------------------------------------------------- seeking
  /** Starts seeking the way from `from` (someone's feet) to `to`, round those in `avoid` (people standing in
   * the way) if it can; worked a little each frame (see work). */
  seek(from: THREE.Vector3, to: THREE.Vector3, avoid: readonly Avoid[] = []): Way {
    const way: Way = { from: from.clone(), to: to.clone(), status: 'seeking', points: [] };
    this.queue.push({ way, stamp: 0, start: -1, goal: -1, goalAt: to.clone(), started: false, avoid });
    return way;
  }

  /** Stops seeking a way no one wants any more. */
  drop(way: Way): void {
    const i = this.queue.findIndex((s) => s.way === way);
    if (i >= 0) this.queue.splice(i, 1);
    if (way.status === 'seeking') way.status = 'none';
  }

  /** Whether any way is still being sought. */
  get busy(): boolean {
    return this.queue.length > 0;
  }

  /** Works on the ways being sought, about `budget` cells' worth; call once a frame. */
  work(budget: number): void {
    while (budget > 0 && this.queue.length > 0) {
      const search = this.queue[0];
      budget = this.advance(search, budget);
      if (search.way.status !== 'seeking') this.queue.shift();
    }
  }

  /** Seeks the whole way at once (for settling everyone where they belong, and the dev tools). */
  seekNow(from: THREE.Vector3, to: THREE.Vector3): Way {
    const way = this.seek(from, to);
    const search = this.queue.pop() as Search;
    while (way.status === 'seeking') this.advance(search, 1e6);
    return way;
  }

  private advance(search: Search, budget: number): number {
    const way = search.way;
    if (!search.started) {
      search.started = true;
      const builtBefore = this.built;
      search.start = this.endNode(way.from);
      search.goal = this.endNode(way.to);
      budget -= (this.built - builtBefore) * CHUNK_COST;
      if (search.start < 0 || search.goal < 0) {
        way.status = 'none';
        return budget;
      }
      if (search.start === search.goal) {
        way.points = [way.from.clone(), way.to.clone()];
        way.status = 'found';
        return budget;
      }
      this.stamp++;
      search.stamp = this.stamp;
      this.nodePoint(search.goal, search.goalAt);
      this.heap.size = 0;
      this.setG(search.start, 0, -1, search.stamp);
      this.heap.push(search.start, this.guess(search.start, search.goalAt));
    } else if (this.stamp !== search.stamp) {
      // Another search ran since (seekNow): start this one over.
      search.started = false;
      return budget;
    }
    while (budget > 0) {
      if (this.heap.size === 0) {
        way.status = 'none';
        return budget;
      }
      const id = this.heap.pop();
      if (this.state(id, search.stamp) === 2) continue;
      if (id === search.goal) {
        way.points = this.pull(this.trace(search.goal, search.stamp), way.from, way.to, search.avoid);
        way.status = 'found';
        return budget;
      }
      this.setState(id, 2, search.stamp);
      const builtBefore = this.built;
      this.expand(id, search);
      budget -= 1 + (this.built - builtBefore) * CHUNK_COST;
      this.expanded++;
    }
    return budget;
  }

  /** The straight-line cost from a node to the goal, under the true one. */
  private guess(id: number, goal: THREE.Vector3): number {
    this.nodePoint(id, _a);
    const dx = Math.abs(_a.x - goal.x);
    const dz = Math.abs(_a.z - goal.z);
    return Math.max(dx, dz) + (DIAGONAL - 1) * Math.min(dx, dz);
  }

  private expand(id: number, search: Search): void {
    const g = this.g(id, search.stamp);
    const links = id >= PORTAL_BASE ? this.portals[id - PORTAL_BASE].links : this.gridLinks.get(id);
    if (links) for (const link of links) this.relax(link.to, g + link.cost, id, search);
    if (id >= PORTAL_BASE) return;
    const chunk = Math.floor(id / PER_CHUNK);
    const rest = id - chunk * PER_CHUNK;
    const cell = Math.floor(rest / LEVELS);
    const gi = (chunk % this.chunks) * CHUNK + (cell % CHUNK);
    const gj = Math.floor(chunk / this.chunks) * CHUNK + Math.floor(cell / CHUNK);
    const c = this.chunk(chunk);
    const h = c.h[rest];
    const wet = c.wet[rest];
    for (const [di, dj, step] of NEIGHBOURS) {
      const l = this.stepTo(gi + di, gj + dj, h);
      if (l < 0) continue;
      // Not across the corner of what stands between.
      if (di !== 0 && dj !== 0 && (this.stepTo(gi + di, gj, h) < 0 || this.stepTo(gi, gj + dj, h) < 0)) continue;
      const to = this.node(gi + di, gj + dj, l);
      const toChunk = this.chunk(Math.floor(to / PER_CHUNK));
      const toRest = to - Math.floor(to / PER_CHUNK) * PER_CHUNK;
      const rise = Math.abs(toChunk.h[toRest] - h);
      const water = wet || toChunk.wet[toRest] ? 1 + WET : 1;
      this.relax(to, g + step * CELL * water + rise * 0.5, id, search);
    }
  }

  private relax(to: number, g: number, from: number, search: Search): void {
    const state = this.state(to, search.stamp);
    if (state === 2) return;
    if (search.avoid.length > 0 && this.near(this.nodePoint(to, _a), search.avoid)) g += AVOID_COST;
    if (state === 1 && this.g(to, search.stamp) <= g) return;
    this.setG(to, g, from, search.stamp);
    this.heap.push(to, g + this.guess(to, search.goalAt));
  }

  // The search's own numbers, kept with each chunk (or portal), set afresh for each search.
  private scratch(id: number, stamp: number): [Chunk | Portal, number] {
    if (id >= PORTAL_BASE) {
      const p = this.portals[id - PORTAL_BASE];
      if (p.stamp !== stamp) {
        p.stamp = stamp;
        p.state = 0;
        p.g = Infinity;
        p.from = -1;
      }
      return [p, 0];
    }
    const index = Math.floor(id / PER_CHUNK);
    const c = this.chunk(index);
    if (c.stamp !== stamp) {
      c.stamp = stamp;
      c.g ??= new Float32Array(PER_CHUNK);
      c.from ??= new Int32Array(PER_CHUNK);
      c.state ??= new Uint8Array(PER_CHUNK);
      c.state.fill(0);
    }
    return [c, id - index * PER_CHUNK];
  }

  private state(id: number, stamp: number): number {
    const [s, k] = this.scratch(id, stamp);
    return 'p' in s ? s.state : (s.state as Uint8Array)[k];
  }

  private setState(id: number, state: number, stamp: number): void {
    const [s, k] = this.scratch(id, stamp);
    if ('p' in s) s.state = state;
    else (s.state as Uint8Array)[k] = state;
  }

  private g(id: number, stamp: number): number {
    const [s, k] = this.scratch(id, stamp);
    return 'p' in s ? s.g : (s.g as Float32Array)[k];
  }

  private setG(id: number, g: number, from: number, stamp: number): void {
    const [s, k] = this.scratch(id, stamp);
    if ('p' in s) {
      s.g = g;
      s.from = from;
      s.state = 1;
    } else {
      (s.g as Float32Array)[k] = g;
      (s.from as Int32Array)[k] = from;
      (s.state as Uint8Array)[k] = 1;
    }
  }

  private from(id: number, stamp: number): number {
    const [s, k] = this.scratch(id, stamp);
    return 'p' in s ? s.from : (s.from as Int32Array)[k];
  }

  /** The nodes from the start to `goal`, as points. */
  private trace(goal: number, stamp: number): { at: THREE.Vector3; portal: boolean }[] {
    const out: { at: THREE.Vector3; portal: boolean }[] = [];
    for (let id = goal; id >= 0; id = this.from(id, stamp)) {
      out.push({ at: this.nodePoint(id, new THREE.Vector3()), portal: id >= PORTAL_BASE });
      if (out.length > 20000) break;
    }
    return out.reverse();
  }

  /**
   * The way pulled straight: from `from`, on to the furthest point walkable to in a straight line over the
   * grid's cells (at most PULL nodes on), and so on to `to`; a portal's two ends are kept, the narrow place
   * between them crossed as it is.
   */
  private pull(
    nodes: { at: THREE.Vector3; portal: boolean }[],
    from: THREE.Vector3,
    to: THREE.Vector3,
    avoid: readonly Avoid[] = [],
  ): THREE.Vector3[] {
    const all = [{ at: from.clone(), portal: false }, ...nodes, { at: to.clone(), portal: false }];
    const out = [all[0].at];
    let i = 0;
    while (i < all.length - 1) {
      let j = i + 1;
      if (!(all[i].portal && all[j].portal)) {
        for (let k = i + 2; k < all.length && k - i <= PULL; k++) {
          // Never across a portal's end: the way goes through it as it is.
          if (all[k - 1].portal || !this.gridStraight(all[i].at, all[k].at)) break;
          if (avoid.length > 0 && this.passes(all[i].at, all[k].at, avoid)) break;
          j = k;
        }
      }
      out.push(all[j].at);
      i = j;
    }
    return out;
  }

  /**
   * Whether a walker can go straight from `a` to `b` over the grid's cells: every cell the line passes
   * through one they can step onto from the last, and both sides of a corner it cuts. Cheaper than
   * `straight`, for pulling long ways straight.
   */
  private gridStraight(a: THREE.Vector3, b: THREE.Vector3): boolean {
    let gi = Math.floor((a.x - this.x0) / CELL);
    let gj = Math.floor((a.z - this.z0) / CELL);
    const gi1 = Math.floor((b.x - this.x0) / CELL);
    const gj1 = Math.floor((b.z - this.z0) / CELL);
    const first = this.stepTo(gi, gj, a.y);
    if (first < 0) return false;
    let h = this.heightAt(gi, gj, first);
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const si = Math.sign(dx);
    const sj = Math.sign(dz);
    let tx = dx !== 0 ? (this.x0 + (gi + (si > 0 ? 1 : 0)) * CELL - a.x) / dx : Infinity;
    let tz = dz !== 0 ? (this.z0 + (gj + (sj > 0 ? 1 : 0)) * CELL - a.z) / dz : Infinity;
    const stepX = dx !== 0 ? CELL / Math.abs(dx) : Infinity;
    const stepZ = dz !== 0 ? CELL / Math.abs(dz) : Infinity;
    for (let guard = 0; (gi !== gi1 || gj !== gj1) && guard < 4000; guard++) {
      if (Math.abs(tx - tz) < 1e-9) {
        if (this.stepTo(gi + si, gj, h) < 0 || this.stepTo(gi, gj + sj, h) < 0) return false;
        gi += si;
        gj += sj;
        tx += stepX;
        tz += stepZ;
      } else if (tx < tz) {
        gi += si;
        tx += stepX;
      } else {
        gj += sj;
        tz += stepZ;
      }
      const l = this.stepTo(gi, gj, h);
      if (l < 0) return false;
      h = this.heightAt(gi, gj, l);
    }
    return Math.abs(h - b.y) < STEP_UP;
  }

  /** Whether `p` is within reach of anyone in `avoid`. */
  private near(p: THREE.Vector3, avoid: readonly Avoid[]): boolean {
    for (const o of avoid) if ((p.x - o.x) ** 2 + (p.z - o.z) ** 2 < o.r * o.r) return true;
    return false;
  }

  /** Whether going straight from `a` to `b` passes within reach of anyone in `avoid`. */
  private passes(a: THREE.Vector3, b: THREE.Vector3, avoid: readonly Avoid[]): boolean {
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const length2 = dx * dx + dz * dz;
    for (const o of avoid) {
      const t = length2 > 1e-6 ? Math.max(0, Math.min(1, ((o.x - a.x) * dx + (o.z - a.z) * dz) / length2)) : 0;
      if ((a.x + dx * t - o.x) ** 2 + (a.z + dz * t - o.z) ** 2 < o.r * o.r) return true;
    }
    return false;
  }

  /** Whether `p` is within `reach` of either end of a portal (a doorway, a stall's open side). */
  nearDoor(p: THREE.Vector3, reach: number): boolean {
    for (const portal of this.portals) if (portal.p.distanceToSquared(p) < reach * reach && Math.abs(portal.p.y - p.y) < 1) return true;
    return false;
  }

  /** Where the cell under (x, z) lets someone at height `feet` stand: its nearest height within a step, or
   * NaN. For the dev tools and for checking a spot is somewhere one can stand. */
  standHeight(x: number, z: number, feet: number): number {
    const gi = Math.floor((x - this.x0) / CELL);
    const gj = Math.floor((z - this.z0) / CELL);
    const l = this.stepTo(gi, gj, feet);
    return l < 0 ? NaN : this.heightAt(gi, gj, l);
  }
}
