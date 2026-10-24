import type * as THREE from 'three';
import type { Character } from '../characters/Character';
import { ITEMS, restoreCarried, type Carried, type ItemCopy, type ItemId, type SavedCarried } from './Items';
import { Things, type Thing } from './Things';

/**
 * What someone has in their paws (the user, 2026-10-22: whatever you can do, those who live here can do
 * too): seven boxes, each a stack of things of one kind (the user, 2026-10-23: up to 99), one of them in their
 * right paw, as Minecraft has it (the user, 2026-10-24, "the Minecraft way with 7 boxes"): what they hold is the
 * top of that box's stack, and giving it, putting it down or eating it up leaves the next of its kind in their
 * paw. Choosing another box changes what they hold and nothing moves; the boxes' things change places only as
 * they are dragged. And how much of what they hold is eaten. You and everyone who lives here take things up,
 * put them down, give them and eat them by the same verbs here, under the same rules of whose a thing is (see
 * Carried):
 * - what lies about as no one's (the sea's shells, what a morning leaves) is whoever takes it up;
 * - what someone put down is theirs: anyone else taking it up borrows it, and it goes back where it lay
 *   (put down there, or given back to them), by the next morning at the latest (Things.morning);
 * - what is given is its taker's, unless it was lent, when it stays its owner's;
 * - what has a place of its own (the stage's ukulele) is no one's and goes back to its place each morning.
 * Each thing in a stack keeps its own owner and place. What is half eaten (the user, 2026-10-23) goes into no
 * box but the one in their paw, down nowhere and to no one: put away (another box chosen, their paw emptied, or
 * dragged off), put down or given, it is gone, eaten up (see nibbled).
 * Whoever moves someone keeps the copy in their paw as their paw has it (see keep).
 */

/** How many boxes everyone has, one of them in their paw. */
export const SLOTS = 7;
/** How many things of one kind a box holds. */
export const STACK = 99;
/** Bites to eat what one holds (or sips to drink it); each leaves less of it (see left). */
export const BITES = 4;
const EATEN = 0.7;

/** What a save keeps of someone's paws: each box's things and the one in their paw (-1: none); or, from a save
 * made before the boxes (2026-10-24), what was in their paw and in each of the six slots of their pouch (from
 * before stacks, one a slot). */
export interface SavedHands {
  slots?: (SavedCarried[] | null)[];
  paw?: number;
  hand?: SavedCarried | null;
  pouch?: (SavedCarried[] | SavedCarried | null)[];
  bites: number;
}

export class Hands {
  /** The boxes' things: of one kind a box, the last on top. */
  readonly slots: (Carried[] | null)[] = new Array<Carried[] | null>(SLOTS).fill(null);
  /** The box in their paw (what they hold is the top of its stack), or -1: their paw empty, the box put away. */
  paw = -1;
  /** Bites taken of what is in their paw. */
  bites = 0;
  /** Its copy in their paw, as the world sees it (see keep). */
  copy: ItemCopy | null = null;
  /** Something changed that a save should keep. */
  changed = false;

  constructor(
    /** Whose paws: 'player', or the id of whoever lives here. */
    readonly who: string,
    /** Whose body they are on (yours change as you look out of someone else's eyes: see attach). */
    public ch: Character,
    private readonly things: Things,
  ) {}

  /** What is in their paw: the top of the box in it, or null. */
  get hand(): Carried | null {
    const stack = this.paw >= 0 ? this.slots[this.paw] : null;
    return stack ? stack[stack.length - 1] : null;
  }

  /** Onto `ch`'s body, what is in the paw with it (yours, as you look out of someone else's eyes). */
  attach(ch: Character): void {
    if (ch === this.ch) return;
    if (this.copy && this.ch.holding === this.copy) this.ch.hold(null);
    this.ch = ch;
    const hand = this.hand;
    if (this.copy && hand) ch.hold(this.copy, !!ITEMS[hand.item].flat);
  }

  /** Everything they have: what is in their paw, then the boxes' things, box by box. */
  get all(): Carried[] {
    const hand = this.hand;
    const out: Carried[] = hand ? [hand] : [];
    for (const stack of this.slots) if (stack) for (const c of stack) if (c !== hand) out.push(c);
    return out;
  }

  /** Room for one more thing of `item`: a stack of it not full, or a box empty. */
  fits(item: ItemId): boolean {
    return this.slotFor(item) >= 0;
  }

  /** Whether what is in their paw is half eaten: it goes into no other box, nor down, nor to anyone. */
  get nibbled(): boolean {
    return !!this.hand && this.bites > 0;
  }

  /** Whether they have a thing of this kind. */
  has(item: ItemId): boolean {
    return this.all.some((c) => c.item === item);
  }

  /** Whether they have the thing with this place of its own (see Carried.home). */
  hasHome(home: string): boolean {
    return this.all.some((c) => c.home === home);
  }

  /** How much is left of what is in their paw: 1 whole, smaller with each bite. */
  get left(): number {
    return 1 - (this.bites / BITES) * EATEN;
  }

  /** Something handed to them, into a box (see slotFor): their paw empty, it is what they hold now (its box in
   * their paw, it on top); else what they hold stays as it is, and another of its kind goes under it. False if
   * they have no room for it. */
  receive(c: Carried): boolean {
    const i = this.slotFor(c.item);
    if (i < 0) return false;
    const empty = !this.hand;
    const stack = this.slots[i];
    if (!stack) this.slots[i] = [c];
    else if (i === this.paw && !empty) stack.splice(stack.length - 1, 0, c);
    else stack.push(c);
    if (empty) {
      this.paw = i;
      this.bites = 0;
    }
    this.changed = true;
    return true;
  }

  /** Takes `thing` up off the ground, into a box (see receive): borrowed if it is someone else's. Null if they
   * have no room for it, or someone took it up first. */
  pickUp(thing: Thing): Carried | null {
    if (!this.fits(thing.item) || !this.things.lies(thing)) return null;
    const c = this.things.take(thing);
    // Their own, back with them; someone else's, lent them from where it lay.
    if (c.owner === this.who) c.lent = null;
    else if (c.owner && !c.lent) c.lent = [thing.at.x, thing.at.y, thing.at.z, thing.yaw];
    this.receive(c);
    return c;
  }

  /** Puts what is in their paw down at `at` (on the ground), turned `yaw`: back where it lay if it was lent
   * and is put down there; theirs where they put it if it was no one's. Half eaten, it is gone instead (null). */
  putDown(at: THREE.Vector3, yaw: number): Thing | null {
    const c = this.hand;
    if (!c) return null;
    if (this.nibbled) {
      this.drop();
      return null;
    }
    this.takeTop();
    if (Things.backWhereItLay(c, at)) c.lent = null;
    else if (!c.owner && !c.home) c.owner = this.who;
    this.changed = true;
    return this.things.put(c, at, yaw);
  }

  /** Hands what is in their paw to `to`, into a box of theirs: theirs now, or back with its owner if it was lent
   * and they are its owner. Null if they have nothing whole in their paw or `to` no room for it. */
  give(to: Hands): Carried | null {
    const c = this.hand;
    if (!c || this.nibbled || !to.fits(c.item)) return null;
    this.takeTop();
    if (c.lent && c.owner === to.who) c.lent = null;
    else if (!c.lent && !c.home) c.owner = to.who;
    to.receive(c);
    this.changed = true;
    return c;
  }

  /** Box `slot` into their paw (-1: their paw emptied, its box put away); what they held, half eaten, gone (see
   * nibbled). */
  choose(slot: number): void {
    if (slot >= SLOTS || slot < -1 || slot === this.paw) return;
    this.letGo();
    this.paw = slot;
    this.bites = 0;
    this.changed = true;
  }

  /** Box `from`'s things into box `to` (you dragging them there: the user, 2026-10-23): onto its stack if it is of
   * their kind, as many as it has room for; else the two change places. Their paw keeps its box (what they hold
   * is whatever is in it now); what they held, half eaten and moved off, is gone. */
  move(from: number, to: number): void {
    if (from === to || from < 0 || to < 0 || from >= SLOTS || to >= SLOTS || !this.slots[from]) return;
    if (from === this.paw || to === this.paw) {
      this.letGo();
      this.bites = 0;
    }
    const a = this.slots[from];
    const b = this.slots[to];
    this.changed = true;
    if (!a) return;
    if (b && b[0].item === a[0].item) {
      const n = Math.min(a.length, STACK - b.length);
      b.push(...a.splice(a.length - n, n));
      if (a.length === 0) this.slots[from] = null;
    } else {
      this.slots[from] = b;
      this.slots[to] = a;
    }
  }

  /** Their paw emptied, its box put away (half eaten, what they held is gone). */
  stow(): boolean {
    this.choose(-1);
    return true;
  }

  /** Into their paw the first thing `want` takes (in the box in their paw first): its box chosen, it on top of
   * its stack; false if they have none. */
  takeOut(want: (c: Carried) => boolean): boolean {
    const hand = this.hand;
    if (hand && want(hand)) return true;
    for (let n = -1; n < SLOTS; n++) {
      const i = n < 0 ? this.paw : n;
      if (i < 0 || (n >= 0 && i === this.paw)) continue;
      const stack = this.slots[i];
      const k = stack ? stack.findIndex(want) : -1;
      if (!stack || k < 0) continue;
      // (What they held, half eaten, is gone first: it is under nothing, so the one wanted stays where it is.)
      this.letGo();
      const [c] = stack.splice(k, 1);
      stack.push(c);
      this.paw = i;
      this.bites = 0;
      this.changed = true;
      return true;
    }
    return false;
  }

  /** A bite of what is in their paw (or a sip): true once it is all gone, the next of its kind in their paw, if
   * they have one. */
  bite(): boolean {
    if (!this.hand) return true;
    this.bites++;
    this.changed = true;
    if (this.bites < BITES) return false;
    this.takeTop();
    return true;
  }

  /** What is in their paw, gone (eaten up). */
  drop(): void {
    this.takeTop();
    this.changed = true;
  }

  /** `c`, wherever they have it, gone from them. */
  remove(c: Carried): void {
    if (this.hand === c) {
      this.drop();
      return;
    }
    for (let i = 0; i < SLOTS; i++) {
      const stack = this.slots[i];
      const k = stack ? stack.indexOf(c) : -1;
      if (!stack || k < 0) continue;
      stack.splice(k, 1);
      if (stack.length === 0) this.slots[i] = null;
      this.changed = true;
      return;
    }
  }

  /** The box a thing of `item` would go into: a stack of it with room (the one in their paw first), else the box
   * in their paw if it is empty, else the first empty one; -1 if none. */
  private slotFor(item: ItemId): number {
    const room = (stack: Carried[] | null) => !!stack && stack[0].item === item && stack.length < STACK;
    if (this.paw >= 0 && room(this.slots[this.paw])) return this.paw;
    const i = this.slots.findIndex(room);
    if (i >= 0) return i;
    if (this.paw >= 0 && !this.slots[this.paw]) return this.paw;
    return this.slots.indexOf(null);
  }

  /** What is in their paw off the top of its box (the next of its kind in their paw, or the box empty), or null. */
  private takeTop(): Carried | null {
    const stack = this.paw >= 0 ? this.slots[this.paw] : null;
    const c = stack?.pop() ?? null;
    if (stack && stack.length === 0) this.slots[this.paw] = null;
    this.bites = 0;
    return c;
  }

  /** What is in their paw, half eaten, gone as it is put away (see nibbled). */
  private letGo(): void {
    if (this.nibbled) this.drop();
  }

  /** Their paw's copy in the world (see Character.hold), made or let go as what is in their paw changes,
   * as big as what is left of it. Called each frame by whoever moves them. */
  keep(): ItemCopy | null {
    const id = this.hand?.item ?? null;
    const has = this.copy?.userData.item ?? null;
    if (has !== id) {
      if (this.copy) {
        this.ch.hold(null);
        this.things.release(this.copy);
        this.copy = null;
      }
      if (id) {
        this.copy = this.things.copyOf(id);
        this.ch.hold(this.copy, !!ITEMS[id].flat);
      }
    }
    // (Back in their paw if something else was put there meanwhile: you, looking out of their eyes.)
    if (this.copy && id && this.ch.holding !== this.copy) this.ch.hold(this.copy, !!ITEMS[id].flat);
    if (this.copy) this.copy.scale.setScalar(this.left);
    // A torch burns whenever it is held (the user, 2026-10-23). (Yours is seen to by Play, which puts it out
    // while a staged shot has you elsewhere.)
    const flame = this.copy?.userData.flame;
    if (flame) flame.visible = true;
    return this.copy;
  }

  save(): SavedHands {
    return { slots: this.slots.map((s) => (s ? [...s] : null)), paw: this.paw, bites: this.bites };
  }

  restore(saved: Partial<SavedHands> | undefined): void {
    if (!saved) return;
    // (From before the boxes: what was in their paw in the first box, and in their paw still; the pouch's six
    // slots after it, as the bar showed them.)
    const old = !Array.isArray(saved.slots);
    const boxes: unknown[] = old ? [saved.hand ?? null, ...(saved.pouch ?? [])] : (saved.slots as unknown[]);
    for (let i = 0; i < SLOTS; i++) {
      const slot = boxes[i];
      // (What belongs on the island no more is gone: see Things.belongs.)
      const stack = (Array.isArray(slot) ? slot : [slot])
        .map(restoreCarried)
        .filter((c): c is Carried => !!c && this.things.belongs(c));
      // (One kind a box, at most a stack of it.)
      const kept = stack.filter((c) => c.item === stack[0]?.item).slice(0, STACK);
      this.slots[i] = kept.length > 0 ? kept : null;
    }
    const paw = old ? (this.slots[0] ? 0 : -1) : (saved.paw ?? -1) | 0;
    this.paw = paw >= 0 && paw < SLOTS ? paw : -1;
    this.bites = this.hand ? Math.max(0, Math.min(BITES - 1, (saved.bites ?? 0) | 0)) : 0;
  }
}
