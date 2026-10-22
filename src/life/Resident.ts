import * as THREE from 'three';
import type { Character } from '../characters/Character';
import type { ActionId } from '../characters/Actions';
import type { Home, Seat, Spot, SpotId, Stall } from './Places';
import type { Habit, Profile } from './profiles';
import type { Life } from './Life';
import { ITEMS, STALL_ITEM, type ItemCopy, type ItemId } from './Items';
import { t as words, type StringKey } from '../i18n/I18n';

/**
 * Someone who lives on the island (see Life): their day, planned each morning as blocks of hours, each
 * carried out by a brain of its own, a generator stepped once a frame (yield gives it the frame's seconds)
 * that walks them about, sits them down, lines them up at a stall or keeps one. A brain stopped early (the
 * hour has moved on) tidies up after itself as it goes (their finally blocks): they stand up, leave the
 * line, come out of a round hut.
 */

/** What a block of their day is for. */
export type ActKind = 'sleep' | 'wake' | 'about' | 'meal' | 'work' | 'feast' | 'home';

export interface Block {
  /** When it starts, in hours past midnight. */
  at: number;
  kind: ActKind;
  /** The stall they keep (work). */
  stall?: Stall;
}

/** A brain: stepped with the frame's seconds; returns when what it was doing is done. */
export type Brain<T = void> = Generator<void, T, number>;

/** Walking speeds: arriving, they slow over the last metre. */
const ARRIVE = 0.22;
const PASS = 0.4;
const SLOW_FROM = 1.0;
/** Seconds without getting nearer before they seek the way again, and how many times. */
const STUCK = 2.2;
const RETRIES = 2;
/** How far one keeps behind and beside whoever they go about with, and how far they let them get. */
const FOLLOW_BEHIND = 1.25;
const FOLLOW_SIDE = 0.6;
const FOLLOW_SLACK = 2.4;
/** How near a stall's line they come before joining it. */
const LINE_NEAR = 3.5;
/** Eating what they hold: how long (seconds, from, to), and how much of it is left at the end (it shrinks
 * as it goes, then is gone). */
const EAT: [number, number] = [16, 30];
const EATEN = 0.3;
/** How long they stop to talk with you (seconds). */
const TALK = 3.6;

/** How someone answers what you do (see Life.reacted): with one of these, saying `line` if there is one, for
 * `seconds`; walking over to you first if `come` and they are more than a couple of metres off. */
export interface Answer {
  actions: (ActionId | 'hop')[];
  line?: StringKey;
  seconds: number;
  come?: boolean;
}

const _v = new THREE.Vector3();
const flat = (a: THREE.Vector3, b: THREE.Vector3) => Math.hypot(a.x - b.x, a.z - b.z);

export class Resident {
  /** Their plan for the day, its blocks in order, and the one they are in. */
  plan: Block[] = [];
  block: Block | null = null;
  /** What they are doing now. */
  private brain: Brain | null = null;
  /** Something they stop to do (take a gift, wave back), run instead of their day's brain, which waits where
   * it was till this is done (see interrupt). */
  private aside: Brain | null = null;
  /** The way they want to go this frame (metres a second, flat): the brain's, then kept clear of others. */
  readonly want = new THREE.Vector3();
  /** Who they are talking with, and until when (Life's clock), or null. */
  chat: { with: Resident; until: number } | null = null;
  /** Where they are in a stall's line (see Life.lines), or null. */
  line: Stall | null = null;
  /** Whether they have been served at the counter they wait at. */
  served = false;
  /** Out of sight in a round hut. */
  indoors = false;
  /** Seated somewhere (on a seat, see Seat). */
  seat: Seat | null = null;
  /** What they look at, worked out now and then (see Life.attend): a point, until when, and who it is. */
  readonly focus = new THREE.Vector3();
  focusing = false;
  focusUntil = 0;
  focusOn: Resident | 'player' | 'fire' | null = null;
  /** With you this moment (talking with you, thanking you, answering you): their eyes stay on you as you go
   * (see Life.attend). */
  withPlayer = false;
  /** How long you have been pushing into them (see Life.push), and since when they were last pushed. */
  pressed = 0;
  pushedAt = -Infinity;
  /** Kept far from the camera: moved without being drawn or worked out in full (see Life.detail). */
  far = false;
  /** Frames left before their next full update, and the seconds saved up for it. */
  skip = 0;
  saved = 0;

  constructor(
    readonly id: string,
    readonly ch: Character,
    readonly home: Home,
    /** Where they sleep in it (none in a round hut). */
    readonly bed: Seat | null,
    readonly profile: Profile,
    private readonly life: Life,
  ) {}

  get pos(): THREE.Vector3 {
    return this.ch.position;
  }

  /** Their feet: where they stand (no one who lives here jumps; far off, only where they are is kept up). */
  feet(out: THREE.Vector3): THREE.Vector3 {
    return out.set(this.pos.x, this.ch.ride ? this.ch.ride.y : this.pos.y, this.pos.z);
  }

  /** Starts on a block of their day, stopping whatever they were doing first. */
  begin(block: Block): void {
    this.stop();
    this.block = block;
    this.brain = this.think(block);
    this.brain.next(0);
  }

  /** Stops what they are doing, tidying up after it. */
  stop(): void {
    const aside = this.aside;
    this.aside = null;
    aside?.return();
    const brain = this.brain;
    this.brain = null;
    brain?.return();
    this.want.set(0, 0, 0);
  }

  /** Stops for a moment to do `brain` (see aside), then carries on with what they were doing. */
  interrupt(brain: Brain): void {
    this.aside?.return();
    this.aside = brain;
    if (brain.next(0).done) this.aside = null;
  }

  /** Whether they have stopped for something (see interrupt). */
  get busy(): boolean {
    return this.aside !== null;
  }

  /** One frame of whatever they are doing. */
  step(dt: number): void {
    this.want.set(0, 0, 0);
    if (this.aside) {
      if (!this.aside.next(dt).done) return;
      this.aside = null;
    }
    if (!this.brain) return;
    const r = this.brain.next(dt);
    // Done with it before the hour moved on: out and about for the rest of the block.
    if (r.done && this.block) {
      this.brain = this.kind('about');
      this.brain.next(0);
    }
  }

  // ---------------------------------------------------------------- moving
  /** Stands still. */
  halt(): void {
    this.want.set(0, 0, 0);
  }

  /** Heads for `to` this frame at `speed`, slowing over the last metre if `arriving`. */
  steer(to: THREE.Vector3, speed: number, arriving = true): number {
    const dx = to.x - this.pos.x;
    const dz = to.z - this.pos.z;
    const d = Math.hypot(dx, dz);
    if (d < 1e-4) {
      this.want.set(0, 0, 0);
      return d;
    }
    const v = arriving ? speed * Math.min(1, 0.35 + d / SLOW_FROM) : speed;
    this.want.set((dx / d) * v, 0, (dz / d) * v);
    return d;
  }

  /** Puts them straight at `at` facing `yaw` (out of sight, or settling them where the hour has them). */
  place(at: THREE.Vector3, yaw = this.ch.facing): void {
    this.ch.ride = null;
    this.ch.teleport(at.x, at.z, yaw, at.y);
  }

  private speed(): number {
    return this.profile.runs ? this.ch.def.runSpeed * 0.85 : this.ch.def.walkSpeed;
  }

  /** Walks to `to` the way the island lets them, seeking it first; true once there. If no way is found or
   * they keep getting stuck, out of sight they are put there, in sight they give up. */
  *walk(to: THREE.Vector3, speed = this.speed()): Brain<boolean> {
    if (flat(this.pos, to) < ARRIVE && Math.abs(this.pos.y - to.y) < 0.4) return true;
    for (let attempt = 0; attempt <= RETRIES; attempt++) {
      const way = this.life.nav.seek(this.feet(_v), to);
      try {
        while (way.status === 'seeking') {
          this.halt();
          yield;
        }
      } finally {
        if (way.status === 'seeking') this.life.nav.drop(way);
      }
      if (way.status === 'none') break;
      const points = way.points;
      let i = 1;
      let best = Infinity;
      let still = 0;
      while (i < points.length) {
        const p = points[i];
        const last = i === points.length - 1;
        const d = flat(this.pos, p);
        if (d < (last ? ARRIVE : PASS)) {
          i++;
          best = Infinity;
          still = 0;
          continue;
        }
        this.steer(p, speed, last);
        const dt = yield;
        if (d < best - 0.04) {
          best = d;
          still = 0;
        } else {
          still += dt;
        }
        if (still > STUCK) break;
      }
      this.halt();
      if (i >= points.length) return true;
    }
    if (!this.life.seen(this)) {
      this.place(to);
      return true;
    }
    return false;
  }

  /** Walks to `to` for as long as `keep` holds (a line moving up, someone they follow moving off); true once
   * there, false if they stop short. */
  *walkWhile(to: THREE.Vector3, keep: () => boolean): Brain<boolean> {
    const walking = this.walk(to);
    try {
      let r = walking.next(0);
      while (!r.done) {
        if (!keep()) return false;
        r = walking.next(yield);
      }
      return r.value;
    } finally {
      walking.return(false);
    }
  }

  /** Stands still for `seconds`, facing `yaw` if given (NaN: as they are), doing `action` if given: once they
   * have stopped (still walking, an action stops at once), and again after anything else stops it (a word
   * with someone, a push). */
  *wait(seconds: number, yaw = NaN, action: ActionId | null = null): Brain {
    if (!Number.isNaN(yaw)) this.ch.setFacing(yaw);
    try {
      for (let t = 0; t < seconds; t += yield) {
        this.halt();
        if (!Number.isNaN(yaw)) this.ch.setFacing(yaw);
        const other = this.ch.actionId;
        if (action && other !== action && other !== 'startled' && (this.far || this.moving() < 0.25)) this.ch.play(action);
        yield* this.chatting();
      }
    } finally {
      if (action && this.ch.actionId === action) this.ch.stopAction();
    }
  }

  /** How fast they are still going, metres a second. */
  private moving(): number {
    return Math.hypot(this.ch.velocity.x, this.ch.velocity.z);
  }

  /** While someone talks with them (see Life.chat): facing them, talking, until it ends. */
  private *chatting(): Brain {
    if (!this.chat || this.seat) return;
    this.ch.play('talk');
    try {
      while (this.chat && this.life.now < this.chat.until) {
        this.halt();
        this.ch.faceToward(this.chat.with.pos.x, this.chat.with.pos.z);
        yield;
      }
    } finally {
      this.chat = null;
      this.ch.stopAction();
    }
  }

  /** Sits on `seat` (walking to it first) until `until` says so, sitting or dozing; up again after. If you sit
   * there, they wait for you to get up. */
  *sitOn(seat: Seat, until: () => boolean, action: 'sit' | 'doze' = 'sit'): Brain {
    while (seat.taken === 'player') {
      if (until()) return;
      yield* this.wait(3);
    }
    seat.taken = this;
    try {
      if (!(yield* this.walk(seat.up))) return;
      this.seat = seat;
      this.ch.ride = { x: seat.at.x, y: seat.at.y, z: seat.at.z, yaw: seat.yaw };
      this.ch.play(action);
      while (!until()) {
        this.halt();
        yield;
      }
    } finally {
      if (this.seat === seat) {
        this.seat = null;
        this.ch.stopAction();
        this.place(seat.up, seat.yaw);
      }
      if (seat.taken === this) seat.taken = null;
    }
  }

  // ---------------------------------------------------------------- their day
  private think(block: Block): Brain {
    return this.kind(block.kind, block);
  }

  private kind(kind: ActKind, block?: Block): Brain {
    switch (kind) {
      case 'sleep':
        return this.sleep();
      case 'wake':
        return this.wake();
      case 'about':
        return this.about();
      case 'meal':
        return this.meal();
      case 'work':
        return this.work(block?.stall ?? null);
      case 'feast':
        return this.feast();
      case 'home':
        return this.goHome(false);
    }
  }

  /** Home, and into bed (in a round hut, out of sight), dozing till morning. */
  private *sleep(): Brain {
    yield* this.goHome(true);
  }

  /** Whether they are in their own house's room already. */
  private inHouse(): boolean {
    const room = this.home.room;
    return !!room && flat(this.pos, room) < 3.4 && Math.abs(this.pos.y - room.y) < 0.3;
  }

  /** Home and inside; to bed if `bed`, else sitting or standing in the room till bedtime. */
  private *goHome(bed: boolean): Brain {
    const home = this.home;
    if (!this.inHouse() && !(yield* this.walk(home.door))) {
      yield* this.wait(5);
      return;
    }
    if (home.kind === 'round') {
      yield* this.inside(() => false);
      return;
    }
    if (bed && this.bed) {
      yield* this.sitOn(this.bed, () => false, 'doze');
      return;
    }
    // In the room till bedtime: on one of its seats if one is free, or standing in its middle.
    const seat = [...home.seats, ...(this.bed ? [this.bed] : [])].find((s) => !s.taken);
    if (seat) yield* this.sitOn(seat, () => false);
    else if (home.room) {
      yield* this.walk(home.room);
      for (;;) yield* this.wait(10);
    }
  }

  /** In a round hut: out of sight at its door until `until` says so, then out again. */
  private *inside(until: () => boolean): Brain {
    this.indoors = true;
    this.place(this.home.door, this.home.yaw + Math.PI);
    try {
      while (!until()) {
        this.halt();
        yield;
      }
    } finally {
      this.indoors = false;
    }
  }

  /** Up and out of the house, a moment outside its door before the day. */
  private *wake(): Brain {
    const home = this.home;
    yield* this.walk(home.door);
    // A few steps out, then looking about.
    const out = home.yaw;
    _v.set(home.door.x + Math.sin(out) * 2, home.door.y, home.door.z + Math.cos(out) * 2);
    const step = this.life.nearestStanding(_v);
    if (step) yield* this.walk(step);
    yield* this.wait(4 + this.life.random() * 8, NaN, this.life.random() < 0.5 ? 'look' : null);
  }

  /** Out and about: their habits at their hours, keeping by whoever they go about with, or strolling. */
  private *about(): Brain {
    for (;;) {
      const habit = this.habitNow();
      if (habit) {
        yield* this.doHabit(habit);
        continue;
      }
      const lead = this.profile.with ? this.life.resident(this.profile.with) : null;
      if (lead && lead.block?.kind === 'about' && this.life.random() < 0.85) {
        yield* this.follow(lead, 40 + this.life.random() * 60);
        continue;
      }
      yield* this.stroll();
    }
  }

  private habitNow(): Habit | null {
    const h = this.life.hours;
    for (const habit of this.profile.habits ?? []) {
      if (h < habit.from || h >= habit.to) continue;
      if (habit.chance !== undefined && !this.life.today(this.id + habit.spot, habit.chance)) continue;
      return habit;
    }
    return null;
  }

  private *doHabit(habit: Habit): Brain {
    const spot = this.life.places.spots.get(habit.spot);
    if (!spot) {
      yield* this.wait(10);
      return;
    }
    const over = () => this.life.hours >= habit.to || this.life.hours < habit.from;
    if (habit.sit) {
      const seat = spot.seats.find((s) => !s.taken);
      if (seat) {
        yield* this.sitOn(seat, over);
        return;
      }
    }
    const at = this.life.spotPoint(spot);
    if (!(yield* this.walk(at))) return;
    while (!over()) yield* this.wait(8, spot.look, habit.action ?? null);
  }

  /** To one of their places, a while there (seated, if there is a seat and they feel like it). */
  private *stroll(): Brain {
    const spot = this.pickSpot();
    if (!spot) {
      yield* this.wait(10);
      return;
    }
    const at = this.life.spotPoint(spot);
    if (!(yield* this.walk(at))) {
      yield* this.wait(3);
      return;
    }
    const stay = 25 + this.life.random() * 50;
    const seat = this.life.random() < 0.35 ? spot.seats.find((s) => !s.taken) : undefined;
    if (seat) {
      const until = this.life.now + stay;
      yield* this.sitOn(seat, () => this.life.now >= until);
      return;
    }
    // Standing about: looking the way the place looks out, or round them.
    const look = Number.isNaN(spot.look) ? this.life.random() * Math.PI * 2 : spot.look + (this.life.random() - 0.5);
    yield* this.wait(stay * 0.5, look);
    yield* this.wait(stay * 0.5, NaN, this.life.random() < 0.3 ? 'look' : null);
  }

  /** The place they go to next: one of theirs, by how much they like it, not where they just were. */
  private last: SpotId | null = null;
  private pickSpot(): Spot | null {
    const spots = Object.entries(this.profile.spots) as [SpotId, number][];
    let total = 0;
    for (const [id, w] of spots) if (id !== this.last && this.life.places.spots.has(id)) total += w;
    let pick = this.life.random() * total;
    for (const [id, w] of spots) {
      if (id === this.last || !this.life.places.spots.has(id)) continue;
      pick -= w;
      if (pick <= 0) {
        this.last = id;
        return this.life.places.spots.get(id) ?? null;
      }
    }
    return null;
  }

  /** Keeps behind `lead` for `seconds`, or while they stay out and about. */
  private *follow(lead: Resident, seconds: number): Brain {
    const end = this.life.now + seconds;
    while (this.life.now < end && lead.block?.kind === 'about') {
      // Behind them and a little to the side, where they are going.
      const yaw = lead.ch.facing;
      _v.set(
        lead.pos.x - Math.sin(yaw) * FOLLOW_BEHIND + Math.cos(yaw) * FOLLOW_SIDE,
        lead.pos.y,
        lead.pos.z - Math.cos(yaw) * FOLLOW_BEHIND - Math.sin(yaw) * FOLLOW_SIDE,
      );
      const d = flat(this.pos, _v);
      if (d > FOLLOW_SLACK) {
        const to = this.life.nearestStanding(_v) ?? lead.feet(new THREE.Vector3());
        // A short walk after them, then look again where they are.
        const start = this.life.now;
        yield* this.walkWhile(to, () => this.life.now - start < 2.5 && flat(lead.pos, to) < FOLLOW_SLACK * 1.5);
      } else {
        this.halt();
        this.ch.setFacing(lead.ch.facing);
        yield* this.chatting();
        yield;
      }
    }
  }

  /** To the stalls: over to an open one, in its line once there (behind whoever got there first), served,
   * then eating it standing by. */
  private *meal(): Brain {
    let stall: Stall | null = null;
    for (let tries = 0; tries < 3 && !stall; tries++) {
      const pick = this.life.pickStall(this);
      if (!pick) break;
      const end = pick.line[pick.line.length - 1];
      yield* this.walkWhile(end, () => flat(this.pos, end) > LINE_NEAR && this.life.isOpen(pick));
      if (!this.life.isOpen(pick)) continue;
      if (this.life.lineLength(pick) >= pick.line.length) {
        // Full: a moment, then another (or the same).
        yield* this.wait(4 + this.life.random() * 4);
        continue;
      }
      stall = pick;
    }
    if (!stall) {
      yield* this.stroll();
      return;
    }
    try {
      this.life.joinLine(stall, this);
      while (!this.served) {
        const place = this.life.linePlace(stall, this);
        if (place < 0) return;
        const at = stall.line[place];
        if (flat(this.pos, at) > 0.35) {
          // Up to their place in the line, or after it as it moves up.
          yield* this.walkWhile(at, () => this.life.linePlace(stall, this) === place && !this.served);
          continue;
        }
        this.halt();
        this.ch.faceToward(stall.keeper.x, stall.keeper.z);
        yield;
      }
    } finally {
      this.life.leaveLine(stall, this);
      this.served = false;
    }
    // What the stall hands over, carried a few steps away from the counter and eaten there.
    const item = STALL_ITEM[stall.goods];
    if (item) this.ch.hold(this.life.copyOf(item), !!ITEMS[item].flat);
    try {
      const away = stall.line[Math.min(stall.line.length - 1, 1)];
      const side = this.life.random() < 0.5 ? 1 : -1;
      _v.set(away.x + Math.cos(stall.yaw) * 1.4 * side, away.y, away.z - Math.sin(stall.yaw) * 1.4 * side);
      const spot = this.life.nearestStanding(_v);
      if (spot) yield* this.walk(spot);
      yield* this.eatHeld(EAT[0] + this.life.random() * (EAT[1] - EAT[0]));
    } finally {
      this.letGo();
    }
  }

  /** Eats (or drinks) what they hold for `seconds`, standing where they are; it shrinks as it goes, then is
   * gone. With nothing in hand, the rice ball. */
  *eatHeld(seconds: number): Brain {
    const copy = this.ch.holding;
    try {
      for (let t = 0; t < seconds; t += yield) {
        this.halt();
        const other = this.ch.actionId;
        // (Seated, they eat as they sit.)
        if (!this.seat && other !== 'eat' && other !== 'startled' && (this.far || this.moving() < 0.25)) this.ch.play('eat');
        if (copy) copy.scale.setScalar(1 - (1 - EATEN) * Math.min(1, t / seconds));
        yield* this.chatting();
      }
    } finally {
      if (this.ch.actionId === 'eat') this.ch.stopAction();
    }
    this.letGo();
  }

  /** Whatever they hold, gone (eaten, kept away). */
  letGo(): void {
    const copy = this.ch.holding as ItemCopy | null;
    if (!copy) return;
    this.ch.hold(null);
    this.life.release(copy);
  }

  /** Free to turn to you: not seated, nor behind a counter. */
  private get free(): boolean {
    return !this.seat && this.block?.kind !== 'work';
  }

  /** Turned to you where you are now (`you`: where you stand, as you go), if free to. */
  private faceYou(you: THREE.Vector3): void {
    if (this.free) this.ch.faceToward(you.x, you.z);
  }

  /** With you from now till `brain` is done: their eyes on you (see Life.attend) the whole while. */
  private *withYou(brain: Brain): Brain {
    this.withPlayer = true;
    this.focusUntil = 0;
    try {
      yield* brain;
    } finally {
      this.withPlayer = false;
    }
  }

  /** Says `line` to you, talking a moment (seated, as they sit), turned to you as you go. */
  private *sayToYou(you: THREE.Vector3, line: string, seconds = TALK): Brain {
    if (!this.seat) this.ch.play('talk');
    let said = false;
    try {
      for (let t = 0; t < seconds; t += yield) {
        this.halt();
        this.faceYou(you);
        // Their own words, over the talking's own bubble.
        if (!said && t > 0.15) {
          this.life.say(this, line);
          said = true;
        }
      }
    } finally {
      if (this.ch.actionId === 'talk') this.ch.stopAction();
    }
  }

  /**
   * Given `item` (its copy) by you, standing at `you` (where you are as you go): turned to you, glad of it,
   * they take it and thank you; food and drink they eat or drink there and then and thank you for after;
   * anything else they look at a moment and tell you they will keep it (the user, 2026-10-22: they stop and
   * talk to you, thanking you).
   */
  *receive(copy: ItemCopy, item: ItemId, you: THREE.Vector3): Brain {
    this.letGo();
    this.faceYou(you);
    this.ch.hold(copy, !!ITEMS[item].flat);
    const thanked = function* (this: Resident): Brain {
      try {
        if (this.free) this.ch.play('cheer');
        this.life.say(this, this.life.thanks(this, 'got'));
        for (let t = 0; t < 1.8; t += yield) {
          this.halt();
          this.faceYou(you);
        }
        if (this.ch.actionId === 'cheer') this.ch.stopAction();
        const use = ITEMS[item].use;
        if (use === 'eat' || use === 'drink') {
          yield* this.eatHeld(9 + this.life.random() * 5);
          yield* this.sayToYou(you, this.life.thanks(this, 'ate'));
        } else {
          if (this.free) {
            this.ch.play('look');
            for (let t = 0; t < 2; t += yield) this.halt();
            this.ch.stopAction();
          }
          this.letGo();
          yield* this.sayToYou(you, this.life.thanks(this, 'kept'));
        }
      } finally {
        if (this.ch.actionId === 'cheer' || this.ch.actionId === 'look') this.ch.stopAction();
        if (this.seat) this.ch.play('sit');
        this.letGo();
      }
    };
    yield* this.withYou(thanked.call(this));
  }

  /** You talk with them, standing at `you` (where you are as you go): they turn to you (if not seated or at a
   * counter) and say `line`, talking a moment, their eyes following you if you walk off. */
  *talk(you: THREE.Vector3, line: string): Brain {
    this.faceYou(you);
    yield* this.withYou(this.sayToYou(you, line));
  }

  /** You hopped at them, standing at `you`: after a moment they hop back, or wave. */
  *greet(you: THREE.Vector3): Brain {
    yield* this.react(you, { actions: ['hop', 'wave'], seconds: 1.8 });
  }

  /**
   * You did something they answer (see Life.reacted), standing at `you`: after a moment, turned to you, they
   * answer it as `answer` says (a wave for a wave, a bow for a bow, a dance along with yours), walking over to
   * you first if it says so; seated, they only say what they would.
   */
  *react(you: THREE.Vector3, answer: Answer): Brain {
    const answering = function* (this: Resident): Brain {
      for (let t = 0, wait = 0.2 + this.life.random() * 0.5; t < wait; t += yield) this.halt();
      // (Seated, they only say what they would; behind a counter they answer where they stand.)
      if (this.seat) {
        if (answer.line) this.life.say(this, words(answer.line));
        return;
      }
      if (answer.come && this.free && flat(this.pos, you) > 2.4) {
        // Over to you, a little way off you.
        const d = flat(this.pos, you);
        _v.set(you.x + ((this.pos.x - you.x) / d) * 1.3, you.y, you.z + ((this.pos.z - you.z) / d) * 1.3);
        const to = this.life.nearestStanding(_v);
        if (to) yield* this.walkWhile(to, () => flat(this.pos, you) > 1.6);
      }
      this.faceYou(you);
      const action = answer.actions[Math.floor(this.life.random() * answer.actions.length)];
      if (action === 'hop') this.ch.jump();
      else this.ch.play(action);
      if (answer.line) this.life.say(this, words(answer.line));
      try {
        for (let t = 0; t < (action === 'hop' ? 0.9 : answer.seconds); t += yield) {
          this.halt();
          this.faceYou(you);
        }
      } finally {
        if (this.ch.actionId === action) this.ch.stopAction();
      }
    };
    yield* this.withYou(answering.call(this));
  }

  /** Keeping a stall: in by its side, behind its counter, serving whoever is at it, till the feast. */
  private *work(stall: Stall | null): Brain {
    if (!stall) return;
    const side = stall.sides.reduce((a, b) => (flat(a, this.pos) < flat(b, this.pos) ? a : b));
    if (flat(this.pos, stall.keeper) > 0.5) {
      if (!(yield* this.walk(side))) return;
      if (!(yield* this.walk(stall.keeper, this.ch.def.walkSpeed * 0.6))) return;
    }
    this.life.openStall(stall, this);
    try {
      for (;;) {
        this.halt();
        this.ch.setFacing(stall.yaw);
        yield* this.life.serve(stall, this);
      }
    } finally {
      this.life.closeStall(stall, this);
      // Out by the side again, if they are still in the stall.
      if (flat(this.pos, stall.keeper) < 0.8) this.place(side, stall.yaw);
    }
  }

  /** To the night beach's feast: playing for it, dancing at it now and then, or sitting round its fire. */
  private *feast(): Brain {
    const feast = this.life.places.feast;
    if (this.profile.feast === 'ukulele') {
      if (yield* this.walk(feast.player)) {
        const face = Math.atan2(feast.fire.x - feast.player.x, feast.fire.z - feast.player.z) + Math.PI * 0.6;
        for (;;) yield* this.wait(30, face, 'ukulele');
      }
      return;
    }
    for (;;) {
      if (this.profile.feast === 'dance' && this.life.random() < 0.5) {
        const spot = feast.dancers[Math.floor(this.life.random() * feast.dancers.length)];
        if (yield* this.walk(spot)) {
          const face = Math.atan2(feast.fire.x - spot.x, feast.fire.z - spot.z);
          yield* this.wait(25 + this.life.random() * 25, face, 'hula');
        }
      }
      const seat = feast.seats.find((s) => !s.taken);
      if (!seat) {
        yield* this.wait(20, NaN);
        continue;
      }
      seat.taken = this;
      try {
        if (!(yield* this.walk(seat.at))) continue;
        this.ch.setFacing(seat.yaw);
        const stay = this.profile.feast === 'dance' ? 50 + this.life.random() * 40 : 1e9;
        yield* this.wait(stay, seat.yaw, 'sit');
      } finally {
        seat.taken = null;
      }
    }
  }
}
