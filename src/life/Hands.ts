import type * as THREE from 'three';
import type { Character } from '../characters/Character';
import { ITEMS, restoreCarried, type Carried, type ItemCopy, type ItemId, type SavedCarried } from './Items';
import { Things, type Thing } from './Things';

/**
 * What someone has in their paws (the user, 2026-10-22: whatever you can do, those who live here can do
 * too): a thing in their right paw, six slots of their pouch, each a stack of things of one kind (the user,
 * 2026-10-23: up to 99), and how much of what they hold is eaten. You and everyone who lives here take things
 * up, put them down, give them and eat them by the same verbs here, under the same rules of whose a thing is
 * (see Carried):
 * - what lies about as no one's (the sea's shells, what a morning leaves) is whoever takes it up;
 * - what someone put down is theirs: anyone else taking it up borrows it, and it goes back where it lay
 *   (put down there, or given back to them), by the next morning at the latest (Things.morning);
 * - what is given is its taker's, unless it was lent, when it stays its owner's;
 * - what has a place of its own (the stage's ukulele) is no one's and goes back to its place each morning.
 * Each thing in a stack keeps its own owner and place. What is half eaten (the user, 2026-10-23) goes into no
 * pouch, down nowhere and to no one: put away, put down or given, it is gone, eaten up (see nibbled).
 * Whoever moves someone keeps the copy in their paw as their paw has it (see keep).
 */

export const POUCH_SIZE = 6;
/** How many things of one kind a slot of the pouch holds. */
export const STACK = 99;
/** Bites to eat what one holds (or sips to drink it); each leaves less of it (see left). */
export const BITES = 4;
const EATEN = 0.7;

/** What a save keeps of someone's paws: each slot's things (a save from before stacks kept one a slot). */
export interface SavedHands {
  hand: SavedCarried | null;
  pouch: (SavedCarried[] | SavedCarried | null)[];
  bites: number;
}

export class Hands {
  /** What is in their paw, and in each slot of their pouch (its things, of one kind, the last on top). */
  hand: Carried | null = null;
  readonly pouch: (Carried[] | null)[] = new Array<Carried[] | null>(POUCH_SIZE).fill(null);
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

  /** Onto `ch`'s body, what is in the paw with it (yours, as you look out of someone else's eyes). */
  attach(ch: Character): void {
    if (ch === this.ch) return;
    if (this.copy && this.ch.holding === this.copy) this.ch.hold(null);
    this.ch = ch;
    if (this.copy && this.hand) ch.hold(this.copy, !!ITEMS[this.hand.item].flat);
  }

  /** Everything they have: what is in their paw, then their pouch's, slot by slot. */
  get all(): Carried[] {
    const out: Carried[] = [];
    if (this.hand) out.push(this.hand);
    for (const stack of this.pouch) if (stack) out.push(...stack);
    return out;
  }

  /** Room for one more thing of `item`: their paw empty, a stack of it in their pouch not full, or a slot
   * empty. */
  fits(item: ItemId): boolean {
    return !this.hand || this.slotFor(item) >= 0;
  }

  /** Whether what is in their paw is half eaten: it goes into no pouch, nor down, nor to anyone. */
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

  /** Something handed to them: into their paw if it is empty, else their pouch (see stash); false if they
   * have no room for it (and it is not theirs). */
  receive(c: Carried): boolean {
    if (!this.hand) this.setHand(c);
    else if (!this.stash(c)) return false;
    this.changed = true;
    return true;
  }

  /** Takes `thing` up off the ground, into their paw or pouch (see receive): borrowed if it is someone
   * else's. Null if they have no room for it, or someone took it up first. */
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
    this.setHand(null);
    if (Things.backWhereItLay(c, at)) c.lent = null;
    else if (!c.owner && !c.home) c.owner = this.who;
    this.changed = true;
    return this.things.put(c, at, yaw);
  }

  /** Hands what is in their paw to `to`, into their paw or pouch: theirs now, or back with its owner if it
   * was lent and they are its owner. Null if they have nothing whole in their paw or `to` no room for it. */
  give(to: Hands): Carried | null {
    const c = this.hand;
    if (!c || this.nibbled || !to.fits(c.item)) return null;
    this.setHand(null);
    if (c.lent && c.owner === to.who) c.lent = null;
    else if (!c.lent && !c.home) c.owner = to.who;
    to.receive(c);
    this.changed = true;
    return c;
  }

  /**
   * Pouch slot `slot`: what is in their paw goes into the pouch (onto a stack of its kind, else into this
   * slot if it is empty, else another empty one), and one thing of the slot comes into their paw. Holding a
   * thing of the slot's kind, it only goes onto the slot's stack. What is half eaten is gone instead (see
   * nibbled). False, and nothing changed, if there is no room in the pouch for what is in their paw.
   */
  swap(slot: number): boolean {
    if (slot < 0 || slot >= POUCH_SIZE) return true;
    const stack = this.pouch[slot];
    const held = this.nibbled ? null : this.hand;
    if (held && stack && stack[0].item === held.item) {
      if (stack.length >= STACK) return false;
      stack.push(held);
      this.setHand(null);
      this.changed = true;
      return true;
    }
    const out = stack?.pop() ?? null;
    if (stack && stack.length === 0) this.pouch[slot] = null;
    if (held && !this.stash(held, slot)) {
      if (stack && out) {
        stack.push(out);
        this.pouch[slot] = stack;
      }
      return false;
    }
    this.setHand(out);
    this.changed = true;
    return true;
  }

  /** What is in their paw into their pouch (half eaten, gone); false if the pouch has no room for it. */
  stow(): boolean {
    if (!this.hand) return true;
    if (this.nibbled) {
      this.drop();
      return true;
    }
    if (!this.stash(this.hand)) return false;
    this.setHand(null);
    this.changed = true;
    return true;
  }

  /** Into their paw, out of the pouch, the first thing `want` takes (what was in the paw into the pouch: see
   * swap); false if they have none, or no room for what is in their paw. */
  takeOut(want: (c: Carried) => boolean): boolean {
    if (this.hand && want(this.hand)) return true;
    for (let i = 0; i < POUCH_SIZE; i++) {
      const stack = this.pouch[i];
      const k = stack ? stack.findIndex(want) : -1;
      if (!stack || k < 0) continue;
      const [c] = stack.splice(k, 1);
      if (stack.length === 0) this.pouch[i] = null;
      const held = this.nibbled ? null : this.hand;
      if (held && !this.stash(held, i)) {
        stack.splice(k, 0, c);
        this.pouch[i] = stack;
        return false;
      }
      this.setHand(c);
      this.changed = true;
      return true;
    }
    return false;
  }

  /** A bite of what is in their paw (or a sip): true once it is all gone, their paw empty again. */
  bite(): boolean {
    if (!this.hand) return true;
    this.bites++;
    this.changed = true;
    if (this.bites < BITES) return false;
    this.setHand(null);
    return true;
  }

  /** What is in their paw, gone (eaten up). */
  drop(): void {
    this.setHand(null);
    this.changed = true;
  }

  /** `c`, wherever they have it, gone from them. */
  remove(c: Carried): void {
    if (this.hand === c) {
      this.drop();
      return;
    }
    for (let i = 0; i < POUCH_SIZE; i++) {
      const stack = this.pouch[i];
      const k = stack ? stack.indexOf(c) : -1;
      if (!stack || k < 0) continue;
      stack.splice(k, 1);
      if (stack.length === 0) this.pouch[i] = null;
      this.changed = true;
      return;
    }
  }

  /** The slot a thing of `item` would go into: a stack of it with room, else `prefer` if it is empty, else the
   * first empty one; -1 if none. */
  private slotFor(item: ItemId, prefer = -1): number {
    const i = this.pouch.findIndex((s) => !!s && s[0].item === item && s.length < STACK);
    if (i >= 0) return i;
    if (prefer >= 0 && !this.pouch[prefer]) return prefer;
    return this.pouch.indexOf(null);
  }

  /** `c` into their pouch (see slotFor); false if there is no room for it. */
  private stash(c: Carried, prefer = -1): boolean {
    const i = this.slotFor(c.item, prefer);
    if (i < 0) return false;
    const stack = this.pouch[i];
    if (stack) stack.push(c);
    else this.pouch[i] = [c];
    return true;
  }

  private setHand(c: Carried | null): void {
    this.hand = c;
    this.bites = 0;
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
    return { hand: this.hand, pouch: this.pouch.map((s) => (s ? [...s] : null)), bites: this.bites };
  }

  restore(saved: Partial<SavedHands> | undefined): void {
    if (!saved) return;
    this.hand = restoreCarried(saved.hand);
    this.bites = this.hand ? Math.max(0, Math.min(BITES - 1, (saved.bites ?? 0) | 0)) : 0;
    for (let i = 0; i < POUCH_SIZE; i++) {
      const slot = saved.pouch?.[i];
      const stack = (Array.isArray(slot) ? slot : [slot]).map(restoreCarried).filter((c): c is Carried => !!c);
      // (One kind a slot, at most a stack of it.)
      const kept = stack.filter((c) => c.item === stack[0]?.item).slice(0, STACK);
      this.pouch[i] = kept.length > 0 ? kept : null;
    }
  }
}
