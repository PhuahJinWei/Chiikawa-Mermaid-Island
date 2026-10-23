import * as THREE from 'three';
import type { Character } from '../characters/Character';
import type { ActionId } from '../characters/Actions';
import type { Home, Seat, Spot, SpotId, Stall } from './Places';
import type { Habit, Profile } from './profiles';
import type { Life } from './Life';
import { ITEMS, STALL_ITEM, carried, type Carried, type ItemId } from './Items';
import { Hands } from './Hands';
import type { Thing } from './Things';
import { t as words, type StringKey } from '../i18n/I18n';

/**
 * Someone who lives on the island (see Life): their day, planned each morning as blocks of hours, each
 * carried out by a brain of its own, a generator stepped once a frame (yield gives it the frame's seconds)
 * that walks them about, sits them down, lines them up at a stall or keeps one. A brain stopped early (the
 * hour has moved on) tidies up after itself as it goes (their finally blocks): they stand up, leave the
 * line, come out of a round hut.
 *
 * Their paws are Hands, as yours are, and they do with them what you do (the user, 2026-10-23: the same
 * authority as the player): take things up (rarely), put them down, give them, eat and drink them, play
 * them, keep them in their pouch, borrow what is someone else's and give it back. Out and about, what they
 * do next is chosen as they go (see Choices), by what they need, what they like and what is about them.
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
/**
 * Keeping to their way (see walk): they head for a point this far on along the leg of it they are on (metres),
 * so as to keep to the line it was found clear along, not cut across from wherever they are. A corner where the
 * way goes on up (a stair, a porch's steps: rising more than CLIMB after it) they come right up to (PASS_CLIMB)
 * before they go on, as only the line was found to climb (the user's screenshot, 2026-10-23: an islander had
 * cut the corner onto a hut's stairs and stood stuck against their side).
 */
const AHEAD = 0.5;
const CLIMB = 0.15;
const PASS_CLIMB = 0.12;
/** Seconds without getting nearer before they seek the way again, and how many times. */
const STUCK = 2.2;
const RETRIES = 2;
/** How far one keeps behind and beside whoever they go about with, and how far they let them get before going
 * after them (or this much further, if they are standing about). Going after them, they keep going while they
 * do, straight after them while they can, and look again for a way straight every so often (seconds). */
const FOLLOW_BEHIND = 1.25;
const FOLLOW_SIDE = 0.6;
const FOLLOW_SLACK = 2.4;
const FOLLOW_IDLE_SLACK = 1.6;
const FOLLOW_LOOK = 0.4;
/** Further behind them than this (metres), they hurry after them this much faster than they walk (up to their
 * run), till they are right behind them. */
const FOLLOW_CLOSE = 0.5;
const FOLLOW_HURRY = 1.5;
/** They go about with their housemate only when they are within this far (metres): not off across the island
 * after them. */
const FOLLOW_FROM = 18;
/** Done with something they went to do, having just walked: a moment where they are before what comes next
 * (seconds, at least, and up to this much more for the most curious, who look about longer), not straight off
 * somewhere else. Just walked: within this of having been on their feet (seconds). */
const SETTLE = 2;
const SETTLE_MORE = [2, 4];
const JUST_WALKED = 1.5;
/** How near a stall's line they come before joining it. */
const LINE_NEAR = 3.5;
/** Eating what they hold: a bite each so many seconds, from, to (a meal from a stall), and a gift's quicker. */
const EAT_PACE: [number, number] = [4, 7];
const GIFT_PACE = 3;
/** How long they stop to talk with you (seconds). */
const TALK = 3.6;
/**
 * Parting from you, after anything with you (see partFrom): somewhere to be, a moment more turned to you, then
 * their leave-taking (a wave and a word) this long (seconds); seated or behind their counter, only the moment.
 * With nowhere to be, they stay with you this long (seconds, from, to), and up to STAY_FOND longer the fonder
 * of you they are, till you go further off than PART_AWAY (metres); then a wave, if you are within WAVE_OFF.
 */
const PART_MOMENT = 1.2;
const PART_LEAVE = 1.6;
const STAY: [number, number] = [5, 8];
const STAY_FOND = 4;
const PART_AWAY = 3.5;
const WAVE_OFF = 10;
/** What has them somewhere to be, saying so as they leave you (see partFrom); and how hungry, a meal still to
 * come. */
const PART_LINES: Partial<Record<ActKind, StringKey>> = {
  sleep: 'part.sleep',
  home: 'part.home',
  meal: 'part.meal',
  feast: 'part.feast',
  work: 'part.work',
};
const STILL_HUNGRY = 0.3;
/** Taking something up or putting it down: how far off it they stand (metres), and how long they bend down
 * to it, to their paw meeting it and back up (seconds). */
const REACH_OFF = 0.42;
const STOOP: [number, number] = [0.55, 0.45];
/** Handing something to someone: how near they come (metres), and for how long they go after someone
 * walking off (seconds). */
const GIVE_NEAR = 1.1;
const GIVE_CHASE = 10;
/** Things they keep in their own room: at most so many, about so far from its middle (metres). */
const ROOM_KEEPS = 8;
const ROOM_SPREAD = 1.1;
/** At the welcome: you coming this near, they cheer you (metres). */
const WELCOME_PASS = 3;

/** How someone answers what you do (see Life.reacted): with one of these, saying `line` if there is one, for
 * `seconds`; walking over to you first if `come` and they are more than a couple of metres off. */
export interface Answer {
  actions: (ActionId | 'hop')[];
  line?: StringKey;
  seconds: number;
  come?: boolean;
}

/** Something someone remembers (see Life.remember): what was done for them (a gift, being served at your
 * stall, something of theirs given back), by whom, with what, on which day. */
export interface Memory {
  kind: 'gift' | 'served' | 'back';
  who: string;
  item: ItemId;
  day: number;
}

/** Whether a thing is eaten or drunk. */
export const edible = (c: Carried | null): boolean => !!c && (ITEMS[c.item].use === 'eat' || ITEMS[c.item].use === 'drink');
/** Whether a thing is played. */
export const playable = (c: Carried | null): boolean => !!c && ITEMS[c.item].use === 'play';
/** Whether a thing is read. */
export const readable = (c: Carried | null): boolean => !!c && ITEMS[c.item].use === 'read';

const _v = new THREE.Vector3();
const _along = new THREE.Vector3();
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
  /**
   * Making way (see Life.part): who they walked into this frame and could not get past (you: 'player'), and
   * for how long they have been held up, going no faster than `going` (metres a second, their way over the
   * last moments, `drift`, from where they were each frame before, `lastAt`); whom they squeeze past (till
   * when), having been held up too long;
   * how long someone has been walking into them as they stand about (they step aside); till when they give
   * way to someone walking at them face to face, stepping aside (`wayAside`, metres a second) first; when
   * they last asked you to let them by; and that they are to seek their way again, round whoever is in it.
   */
  blocker: Resident | 'player' | null = null;
  blockedFor = 0;
  going = 0;
  readonly drift = new THREE.Vector3();
  readonly lastAt = new THREE.Vector3();
  readonly squeezing = new Set<Resident>();
  squeezeUntil = 0;
  crowded = 0;
  crowdedAt = -Infinity;
  givingWay = -Infinity;
  readonly wayAside = new THREE.Vector3();
  askedPassAt = -Infinity;
  reroute = false;
  /** Parting from you (see partFrom): busy with you, yet free to answer what you do next. */
  parting = false;
  /** When they were last on their way somewhere, walking (Life.now): see settle. */
  walkedAt = -Infinity;
  /** Stepping round someone in their way: on which side (see Life.avoid), and till when they keep to it. */
  passing = 0;
  passingUntil = -Infinity;
  /** Kept far from the camera: moved without being drawn or worked out in full (see Life.detail). */
  far = false;
  /** Frames left before their next full update, and the seconds saved up for it. */
  skip = 0;
  saved = 0;
  /** Their paw and pouch (see Hands). */
  readonly hands: Hands;
  /** What they want, each from 0 (not at all) to 1 (badly), growing with the hours (see Choices): something to
   * eat, someone's company, some fun. */
  readonly needs = { hunger: 0.3, company: 0.3, fun: 0.3 };
  /** The island's hour (Life.clock) they last saw to their needs at. */
  neededAt = NaN;
  /** The day they last took something up (rarely: see Choices), and the last they gave something. */
  tookOn = -1;
  gaveOn = -1;
  /** When each thing they borrowed was borrowed (Life.clock), to give it back in time. */
  readonly borrowed = new Map<Carried, number>();
  /** How fond they are of whoever they know ('player' for you), 0 to 1, where it has changed from how fond
   * they were to begin with (see Life.fondness). */
  readonly fond = new Map<string, number>();
  /** What they remember, the newest last (see Life.remember). */
  readonly memories: Memory[] = [];
  /** The day they last came over to greet you, and asked you for something; when you last talked with them
   * (Life.now). */
  greetedOn = -1;
  askedOn = -1;
  talkedAt = -Infinity;
  /** Where their day takes up again on loading a save (see Life.settle): on the seat they sat on, or inside
   * their round hut; null to begin it afresh. */
  resume: { seat: Seat | null; indoors: boolean } | null = null;
  /** At the welcome on your first day (see Life.settle), and when they leave it for their day (Life.now). */
  welcoming = false;
  leavesWelcome = Infinity;

  constructor(
    readonly id: string,
    readonly ch: Character,
    readonly home: Home,
    /** Where they sleep in it (none in a round hut). */
    readonly bed: Seat | null,
    readonly profile: Profile,
    private readonly life: Life,
  ) {
    this.hands = new Hands(id, ch, life.things);
  }

  get pos(): THREE.Vector3 {
    return this.ch.position;
  }

  /** Their feet: where they stand (no one who lives here jumps; far off, only where they are is kept up). */
  feet(out: THREE.Vector3): THREE.Vector3 {
    return out.set(this.pos.x, this.ch.ride ? this.ch.ride.y : this.pos.y, this.pos.z);
  }

  /** Starts on a block of their day, stopping whatever they were doing first: taking it up from where a save
   * had them, if it did (see resume). */
  begin(block: Block): void {
    this.stop();
    this.block = block;
    const resume = this.resume;
    this.resume = null;
    this.brain = resume ? this.resumeDay(block, resume) : this.think(block);
    this.brain.next(0);
  }

  /** At the welcome (see Life.settle): their day held, standing as it has them, `yaw` the way they face, till
   * Life lets them go into it (see Life.update). */
  beginWelcome(block: Block, yaw: number): void {
    this.stop();
    this.block = block;
    this.welcoming = true;
    this.leavesWelcome = Infinity;
    this.brain = this.welcome(yaw);
    this.brain.next(0);
  }

  /** Out of the welcome into their day, from where they stand. */
  endWelcome(block: Block): void {
    this.welcoming = false;
    this.leavesWelcome = Infinity;
    this.begin(block);
  }

  /**
   * Their day taken up again from where a save had them: on the seat they sat on (their bed, a seat in their
   * room, by the feast's fire, a log a while), or inside their round hut; then on with the block as it goes.
   */
  private *resumeDay(block: Block, at: { seat: Seat | null; indoors: boolean }): Brain {
    const kind = block.kind;
    const homeTime = kind === 'sleep' || kind === 'home';
    if (at.indoors && homeTime && this.home.kind === 'round') {
      yield* this.inside(() => false);
      return;
    }
    // (Their seat kept for them as everyone was put back: see Life.settle.)
    const seat = at.seat;
    if (seat && (!seat.taken || seat.taken === this)) {
      if (this.life.places.feast.seats.includes(seat)) {
        if (kind === 'feast') {
          yield* this.feast(seat);
          return;
        }
      } else if (homeTime) {
        yield* this.sitOn(seat, () => false, kind === 'sleep' && seat === this.bed ? 'doze' : 'sit');
        return;
      } else {
        const until = this.life.now + 20 + this.life.random() * 40;
        yield* this.sitOn(seat, () => this.life.now >= until);
      }
    }
    yield* this.think(block);
  }

  /**
   * At the welcome on your first day (the film's arrival, `bay 5`): standing where it has them, turned toward
   * the pier, their eyes on you (see Life.attend); waving and cheering now and then, and cheering you as you
   * come past them; a word of welcome now and then (see Life.welcomeWord).
   */
  private *welcome(yaw: number): Brain {
    this.ch.setFacing(yaw);
    let next = 0.5 + this.life.random() * 4;
    let cheered = false;
    try {
      for (let t = 0; ; t += yield) {
        this.halt();
        const you = this.life.playerAt;
        if (you && !cheered && flat(you, this.pos) < WELCOME_PASS) {
          cheered = true;
          this.ch.play('cheer');
          this.life.welcomeWord(this, true);
          next = t + 3 + this.life.random() * 3;
        } else if (t >= next) {
          if (!this.ch.actionId) this.ch.play(this.life.random() < 0.6 ? 'wave' : 'cheer');
          this.life.welcomeWord(this, false);
          next = t + 4 + this.life.random() * 6;
        }
      }
    } finally {
      if (this.ch.actionId === 'wave' || this.ch.actionId === 'cheer') this.ch.stopAction();
    }
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
    if (this.moving() > 0.3) this.walkedAt = this.life.now;
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

  /** The point AHEAD along the leg of their way from `a` to `b`, on from where they are level with on it (or `b`,
   * that near it): what they head for, keeping to the leg's line (see walk). */
  private along(a: THREE.Vector3, b: THREE.Vector3): THREE.Vector3 {
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const length = Math.hypot(dx, dz);
    if (length < 1e-4 || flat(this.pos, b) <= AHEAD) return b;
    const at = ((this.pos.x - a.x) * dx + (this.pos.z - a.z) * dz) / length;
    const t = Math.min(1, Math.max(0, at + AHEAD) / length);
    return _along.set(a.x + dx * t, a.y + (b.y - a.y) * t, a.z + dz * t);
  }

  /** Puts them straight at `at` facing `yaw` (out of sight, or settling them where the hour has them). */
  place(at: THREE.Vector3, yaw = this.ch.facing): void {
    this.ch.ride = null;
    this.ch.teleport(at.x, at.z, yaw, at.y);
  }

  private speed(): number {
    return this.profile.runs ? this.ch.runSpeed * 0.85 : this.ch.walkSpeed;
  }

  /** Walks to `to` the way the island lets them, seeking it first; true once there. If no way is found or
   * they keep getting stuck, out of sight they are put there, in sight they give up. */
  *walk(to: THREE.Vector3, speed = this.speed()): Brain<boolean> {
    if (flat(this.pos, to) < ARRIVE && Math.abs(this.pos.y - to.y) < 0.4) return true;
    for (let attempt = 0; attempt <= RETRIES; attempt++) {
      // Sought again after getting stuck: round whoever stands in the way.
      const way = this.life.nav.seek(this.feet(_v), to, attempt > 0 ? this.life.inTheWayOf(this) : []);
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
        const climbs = !last && points[i + 1].y - p.y > CLIMB;
        if (d < (last ? ARRIVE : climbs ? PASS_CLIMB : PASS)) {
          i++;
          best = Infinity;
          still = 0;
          continue;
        }
        this.steer(this.along(points[i - 1], p), speed, last);
        const dt = yield;
        if (d < best - 0.04) {
          best = d;
          still = 0;
        } else if (this.life.now >= this.givingWay) {
          // (Not while they stand aside to let someone by.)
          still += dt;
        }
        if (still > STUCK || this.reroute) {
          this.reroute = false;
          break;
        }
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
      if (r.done) {
        // There already: a frame where they are all the same. Those who walk again and again for a while, after
        // someone (follow) or over to them (handTo, toYou), till their clock runs out, would otherwise go round
        // and round within one frame, the clock never moving on, and the game would freeze (found 2026-10-23).
        this.halt();
        yield;
        return r.value;
      }
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
   * with someone, a push). Out of a doorway or a narrow way first, where they would be in anyone's way. */
  *wait(seconds: number, yaw = NaN, action: ActionId | null = null): Brain {
    // Not standing about in a doorway or a narrow way: a step out of it first.
    const out = !this.seat && !this.line && !this.indoors && this.block?.kind !== 'work' ? this.life.outOfTheWay(this) : null;
    if (out) yield* this.walk(out);
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
      this.needs.company = Math.max(0, this.needs.company - 0.35);
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

  // ---------------------------------------------------------------- with their paws
  /** Comes to a stop where they are (an action begun still on the move stops at once: Character.update), for a
   * moment at most. */
  private *stand(): Brain {
    for (let t = 0; t < 0.6 && !this.far && this.moving() > 0.2; t += yield) this.halt();
  }

  /** Bends down to the ground before them a moment, `then` as their paw meets it (taking something up,
   * putting it down). */
  private *stoop(then: () => void): Brain {
    yield* this.stand();
    this.ch.play('bow');
    try {
      for (let t = 0; t < STOOP[0]; t += yield) this.halt();
      then();
      for (let t = 0; t < STOOP[1]; t += yield) this.halt();
    } finally {
      if (this.ch.actionId === 'bow') this.ch.stopAction();
    }
  }

  /** Where to stand to reach something at `at`: `off` from it on their side of it, where one can stand. */
  private standBy(at: THREE.Vector3, off = REACH_OFF): THREE.Vector3 | null {
    const d = flat(this.pos, at);
    const ux = d > 1e-3 ? (this.pos.x - at.x) / d : 1;
    const uz = d > 1e-3 ? (this.pos.z - at.z) / d : 0;
    return this.life.nearestStanding(_v.set(at.x + ux * off, at.y, at.z + uz * off));
  }

  /** Over to `thing` and takes it up, then has a look at it: what they took up, or null if someone took it up
   * first, it is out of reach, or they have no room. What is in their paw goes into their pouch first. */
  *takeUp(thing: Thing): Brain<Carried | null> {
    if (!this.hands.fits(thing.item) || thing.sought) return null;
    thing.sought = this;
    try {
      const stand = this.standBy(thing.at);
      if (!stand || !(yield* this.walk(stand)) || !this.life.things.lies(thing)) return null;
      if (!this.hands.stow()) return null;
      this.ch.faceToward(thing.at.x, thing.at.z);
      const got = { c: null as Carried | null };
      yield* this.stoop(() => (got.c = this.hands.pickUp(thing)));
      if (!got.c) return null;
      this.tookOn = this.life.day;
      this.life.took(this, got.c);
      yield* this.wait(1.4 + this.life.random() * 1.2, NaN, 'look');
      return got.c;
    } finally {
      if (thing.sought === this) thing.sought = null;
    }
  }

  /** Over to `thing` for a good look at it, and leaves it where it lies. */
  *admire(thing: Thing): Brain {
    const stand = this.standBy(thing.at, 0.7);
    if (!stand || !(yield* this.walk(stand)) || !this.life.things.lies(thing)) return;
    this.ch.faceToward(thing.at.x, thing.at.z);
    this.life.notice(thing.at, this);
    yield* this.wait(2.5 + this.life.random() * 3, NaN, 'look');
  }

  /** Puts what is in their paw (`c`, if given: in it again first, should they have been given something on the
   * way and hold that now) down at `at` (on the ground), turned `yaw`, walking there first; false if they could
   * not get there, or no longer have `c`. */
  *setDown(at: THREE.Vector3, yaw: number, c?: Carried): Brain<boolean> {
    if (c ? !this.hands.all.includes(c) : !this.hands.hand) return true;
    const stand = this.standBy(at);
    if (!stand || !(yield* this.walk(stand))) return false;
    if (c && !this.hands.takeOut((x) => x === c)) return false;
    this.ch.faceToward(at.x, at.z);
    yield* this.stoop(() => this.hands.putDown(at, yaw));
    return true;
  }

  /** Room in their paw for what is handed to them: what is in it into their pouch, or, the pouch full, down
   * at their feet (theirs, there). */
  *clearPaw(): Brain {
    if (!this.hands.hand || this.hands.stow()) return;
    const at = this.life.nearestStanding(_v.set(this.pos.x + Math.sin(this.ch.facing) * 0.5, this.pos.y, this.pos.z + Math.cos(this.ch.facing) * 0.5));
    if (at) yield* this.stoop(() => this.hands.putDown(at, this.ch.facing));
  }

  /**
   * Hands `c` (out of their pouch into their paw first) to `to`, you or someone who lives here, going over to
   * them, after them a while if they walk off; they take it and thank them (see Life.gave). False if they
   * could not reach them or `to` has no room.
   */
  *handTo(to: Resident | 'player', c: Carried): Brain<boolean> {
    const toHands = to === 'player' ? this.life.playerHands : to.hands;
    if (!toHands || !this.hands.takeOut((x) => x === c)) return false;
    const where = (): THREE.Vector3 | null => (to === 'player' ? this.life.playerAt : to.pos);
    const start = this.life.now;
    while (this.life.now - start < GIVE_CHASE) {
      const at = where();
      if (!at) return false;
      if (flat(this.pos, at) < GIVE_NEAR) break;
      const stand = this.standBy(at, GIVE_NEAR * 0.8);
      if (!stand) return false;
      const from = this.life.now;
      // A short walk toward where they are, then look again.
      yield* this.walkWhile(stand, () => this.life.now - from < 2.5 && flat(where() ?? stand, stand) < 1.2);
    }
    const at = where();
    if (!at || flat(this.pos, at) > GIVE_NEAR + 0.5 || !toHands.fits(c.item)) return false;
    // (In their paw still: given something on the way, they hold that now.)
    if (!this.hands.takeOut((x) => x === c)) return false;
    this.ch.faceToward(at.x, at.z);
    const back = !!c.lent && c.owner === toHands.who;
    const given = this.hands.give(toHands);
    if (!given) return false;
    this.borrowed.delete(given);
    this.gaveOn = this.life.day;
    this.life.gave(to, given, this.pos, this.id, back);
    yield* this.wait(1.2, NaN, 'bow');
    return true;
  }

  /** What they borrowed goes back: to its owner, if they are about and near enough to take it, else back
   * where it lay. */
  *giveBack(c: Carried): Brain {
    if (!c.lent) return;
    const owner = c.owner === 'player' ? 'player' : c.owner ? this.life.resident(c.owner) : null;
    const ownerAt = owner === 'player' ? this.life.playerAt : owner?.pos;
    const near = !!ownerAt && flat(this.pos, ownerAt) < 14 && (owner === 'player' || (owner && !owner.far && owner.block?.kind !== 'sleep'));
    if (owner && near && (yield* this.handTo(owner, c))) return;
    if (!c.lent || !this.hands.takeOut((x) => x === c)) return;
    const [x, y, z, yaw] = c.lent;
    if (yield* this.setDown(new THREE.Vector3(x, y, z), yaw, c)) {
      this.borrowed.delete(c);
      this.life.say(this, words('borrow.back'));
    }
  }

  /** What has a place of its own (the stage's ukulele) back there, put down where it lies. */
  *putBack(c: Carried): Brain {
    const home = c.home ? this.life.things.homes.get(c.home) : null;
    if (!home || !this.hands.takeOut((x) => x === c)) return;
    yield* this.setDown(home.at.clone(), home.yaw, c);
  }

  /** Eats (or drinks) what is in their paw, a bite every `pace` seconds, where they stand (or sit). */
  *eat(pace = EAT_PACE[0] + this.life.random() * (EAT_PACE[1] - EAT_PACE[0])): Brain {
    try {
      while (edible(this.hands.hand)) {
        for (let t = 0; t < pace; t += yield) {
          this.halt();
          const other = this.ch.actionId;
          // (Seated, they eat as they sit.)
          if (!this.seat && other !== 'eat' && other !== 'startled' && (this.far || this.moving() < 0.25)) this.ch.play('eat');
          yield* this.chatting();
        }
        if (this.hands.bite()) this.needs.hunger = Math.max(0, this.needs.hunger - 0.65);
      }
    } finally {
      if (this.ch.actionId === 'eat') this.ch.stopAction();
    }
  }

  /** Plays what is in their paw (the ukulele) for `seconds`, facing `yaw` (NaN: as they are): those near may
   * come to listen and dance (see Life.performing). */
  *playHeld(seconds: number, yaw = NaN): Brain {
    if (!playable(this.hands.hand)) return;
    if (!Number.isNaN(yaw)) this.ch.setFacing(yaw);
    this.ch.play('ukulele');
    try {
      for (let t = 0, next = 0; t < seconds && playable(this.hands.hand); t += yield) {
        this.halt();
        if (this.ch.actionId !== 'ukulele' && this.moving() < 0.25) this.ch.play('ukulele');
        if (t >= next) {
          this.life.performing(this.pos, this);
          next = t + 9;
        }
      }
    } finally {
      if (this.ch.actionId === 'ukulele') this.ch.stopAction();
      this.needs.fun = Math.max(0, this.needs.fun - 0.6);
    }
  }

  /** Reads what is in their paw (the book) for `seconds` where they are, held open before their face as you read it
   * (see Character.placeHand), facing `yaw` (NaN: as they are); a word with someone breaks off and goes back to it. */
  *readHeld(seconds: number, yaw = NaN): Brain {
    if (!readable(this.hands.hand)) return;
    if (!Number.isNaN(yaw)) this.ch.setFacing(yaw);
    const action: ActionId = this.seat ? 'readSeated' : 'read';
    this.ch.play(action);
    try {
      for (let t = 0; t < seconds && readable(this.hands.hand); t += yield) {
        this.halt();
        const other = this.ch.actionId;
        if (other !== action && other !== 'startled' && (this.far || this.moving() < 0.25)) this.ch.play(action);
        yield* this.chatting();
      }
    } finally {
      if (this.ch.actionId === action) this.ch.stopAction();
      this.needs.fun = Math.max(0, this.needs.fun - 0.4);
    }
  }

  /** Into their own room, one of their keepsakes put down in it (at most ROOM_KEEPS of theirs there). */
  *keepAtHome(c: Carried): Brain {
    const room = this.home.room;
    if (!room) return;
    const there = this.life.things.list.filter((t) => t.owner === this.id && flat(t.at, room) < 3).length;
    if (there >= ROOM_KEEPS || !this.hands.takeOut((x) => x === c)) return;
    // A spot round the room's middle one can stand on, at its floor's height: a few tries, as much of the
    // circle is furniture (and the nearest standing place to a spot in the bed can be out on the porch).
    let spot: THREE.Vector3 | null = null;
    for (let tries = 0; tries < 6 && !spot; tries++) {
      const a = this.life.random() * Math.PI * 2;
      const s = this.life.nearestStanding(_v.set(room.x + Math.cos(a) * ROOM_SPREAD, room.y, room.z + Math.sin(a) * ROOM_SPREAD));
      if (s && Math.abs(s.y - room.y) <= 0.3) spot = s.clone();
    }
    if (!spot) {
      this.hands.stow();
      return;
    }
    if (!(yield* this.walk(this.home.door))) return;
    yield* this.setDown(spot, this.life.random() * Math.PI * 2, c);
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

  /**
   * Home and inside; to bed if `bed`, else sitting or standing in the room till bedtime. On the way, what they
   * borrowed goes back and what has a place of its own goes back to it; at home, now and then, a keepsake is
   * put down in their room, and at bedtime every keepsake they still have (the user, 2026-10-23: nothing
   * sleeps in a pouch, where no one can see it).
   */
  private *goHome(bed: boolean): Brain {
    const home = this.home;
    if (!bed) {
      for (const c of this.hands.all.filter((x) => x.lent)) yield* this.giveBack(c);
      for (const c of this.hands.all.filter((x) => x.home && !x.lent)) yield* this.putBack(c);
    }
    if (!this.inHouse() && !(yield* this.walk(home.door))) {
      yield* this.wait(5);
      return;
    }
    if (home.kind === 'round') {
      yield* this.inside(() => false);
      return;
    }
    const keeps = () => this.hands.all.filter((x) => x.owner === this.id && !edible(x) && !x.home && !x.lent);
    if (bed) {
      for (const keep of keeps()) yield* this.keepAtHome(keep);
    } else if (this.life.random() < 0.5) {
      const keep = keeps()[0];
      if (keep) yield* this.keepAtHome(keep);
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

  /** Out and about: their habits at their hours, keeping by whoever they go about with, or whatever they
   * choose to do next (see Choices). */
  private *about(): Brain {
    for (;;) {
      const habit = this.habitNow();
      if (habit) {
        yield* this.doHabit(habit);
        continue;
      }
      const lead = this.profile.with ? this.life.resident(this.profile.with) : null;
      if (lead && lead.block?.kind === 'about' && flat(lead.pos, this.pos) < FOLLOW_FROM && this.life.random() < 0.85) {
        yield* this.follow(lead, 40 + this.life.random() * 60);
      } else {
        yield* this.life.choices.next(this);
      }
      yield* this.settle();
    }
  }

  /**
   * Done with something they went to do just as they got there (something put back or down, a friend gone off
   * before they came up, a short way after whoever they go about with): a moment where they are, looking about
   * or at what they did, before what comes next (the user, 2026-10-23: never straight off somewhere else). Not
   * after what they stayed a while at already (a place of theirs, eating).
   */
  private *settle(): Brain {
    if (this.life.now - this.walkedAt > JUST_WALKED) return;
    const curious = this.profile.curious ?? 0.5;
    const more = SETTLE_MORE[0] + (SETTLE_MORE[1] - SETTLE_MORE[0]) * curious;
    yield* this.wait(SETTLE + this.life.random() * more, NaN, this.life.random() < 0.3 + 0.4 * curious ? 'look' : null);
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

  /** To `spot` (one of their places if none given), a while there (seated, if there is a seat and they feel
   * like it). */
  *stroll(spot: Spot | null = this.pickSpot()): Brain {
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
  pickSpot(): Spot | null {
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

  /** Over to `friend`, wherever they are about, for a word with them. */
  *visit(friend: Resident): Brain {
    const stand = this.standBy(friend.pos, 1.2);
    if (!stand) return;
    const start = this.life.now;
    yield* this.walkWhile(stand, () => this.life.now - start < 40 && flat(friend.pos, stand) < 2.5);
    if (flat(this.pos, friend.pos) > 2.4 || friend.chat || this.chat || friend.busy || friend.line) return;
    this.life.chatWith(this, friend);
    yield* this.wait(1, NaN);
  }

  /**
   * Keeps behind `lead` for `seconds`, or while they stay out and about: after them once they are off (or have
   * got well away), going on as long as they go, straight after them while nothing stands between, else a short
   * way round at a time; stopping only once they have stopped and they have caught up.
   */
  private *follow(lead: Resident, seconds: number): Brain {
    const end = this.life.now + seconds;
    const behind = new THREE.Vector3();
    let going = false;
    let straight = false;
    let looked = -Infinity;
    while (this.life.now < end && lead.block?.kind === 'about') {
      // Behind them and a little to the side, where they are going.
      const yaw = lead.ch.facing;
      behind.set(
        lead.pos.x - Math.sin(yaw) * FOLLOW_BEHIND + Math.cos(yaw) * FOLLOW_SIDE,
        lead.pos.y,
        lead.pos.z - Math.cos(yaw) * FOLLOW_BEHIND - Math.sin(yaw) * FOLLOW_SIDE,
      );
      const d = flat(this.pos, behind);
      const leadGoing = lead.moving() > 0.3;
      if (!going) going = d > (leadGoing ? FOLLOW_SLACK : FOLLOW_SLACK + FOLLOW_IDLE_SLACK);
      else if (!leadGoing && d < FOLLOW_SLACK * 0.5) going = false;
      if (!going) {
        this.halt();
        this.ch.setFacing(lead.ch.facing);
        yield* this.chatting();
        yield;
        continue;
      }
      if (this.life.now - looked > FOLLOW_LOOK) {
        looked = this.life.now;
        straight = this.life.nav.straight(this.feet(_v), behind);
      }
      if (straight) {
        // Straight after them, hurrying to catch up when they have fallen behind, slowing as they come up behind
        // them, so as to fall into step with them.
        this.steer(behind, d > FOLLOW_CLOSE ? Math.min(this.ch.runSpeed, this.speed() * FOLLOW_HURRY) : this.speed());
        yield;
        continue;
      }
      const to = this.life.nearestStanding(behind) ?? lead.feet(new THREE.Vector3());
      // A short way round after them, then look again where they are.
      const start = this.life.now;
      yield* this.walkWhile(to, () => this.life.now - start < 2.5 && flat(lead.pos, to) < FOLLOW_SLACK * 1.5);
      looked = -Infinity;
    }
  }

  /** To the stalls: over to an open one, in its line once there (behind whoever got there first), served,
   * then eating it standing by. Something to eat in their paws already, they eat that instead. */
  private *meal(): Brain {
    if (this.hands.takeOut(edible)) {
      yield* this.eat();
      return;
    }
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
    yield* this.clearPaw();
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
    // What the stall hands over, theirs, carried a few steps away from the counter and eaten there.
    const item = STALL_ITEM[stall.goods];
    if (item) this.hands.receive(carried(item, this.id));
    const away = stall.line[Math.min(stall.line.length - 1, 1)];
    const side = this.life.random() < 0.5 ? 1 : -1;
    _v.set(away.x + Math.cos(stall.yaw) * 1.4 * side, away.y, away.z - Math.sin(stall.yaw) * 1.4 * side);
    const spot = this.life.nearestStanding(_v);
    if (spot) yield* this.walk(spot);
    yield* this.eat();
  }

  /** Free to turn to you: not seated, nor behind a counter. */
  private get free(): boolean {
    return !this.seat && this.block?.kind !== 'work';
  }

  /** Turned to `at` (where you are as you go, or whoever gave them something), if free to. */
  private faceTo(at: THREE.Vector3): void {
    if (this.free) this.ch.faceToward(at.x, at.z);
  }

  /** With you from now till `brain` is done, and then parting from you if `part` (see partFrom): their eyes on
   * you (see Life.attend) the whole while, and their day's next part waiting till they have (see Life.update). */
  private *withYou(brain: Brain, part = false): Brain {
    this.withPlayer = true;
    this.focusUntil = 0;
    try {
      yield* brain;
      if (part) yield* this.partFrom();
    } finally {
      this.withPlayer = false;
    }
  }

  /**
   * After anything you began with them, or they with you (talking, answering you, thanking you, greeting you):
   * never straight off (the user, 2026-10-23: rude after you came to them). Somewhere to be (bed, home, a meal,
   * the feast, their stall), a moment more turned to you, then a wave and a word of where (もうねむいから、またね)
   * and off. With nowhere to be, they stay with you a while, the fonder of you the longer, till you go off, then
   * wave you goodbye. Seated, or behind their counter, only the moment; in a stall's line, none (the line moves).
   */
  private *partFrom(): Brain {
    if (this.line) return;
    const you = this.life.playerAt;
    if (!you) return;
    this.parting = true;
    try {
      const turned = (seconds: number): Brain<boolean> => this.turnedTo(you, seconds);
      const where = this.somewhereToBe();
      if (this.seat || !this.free) {
        yield* turned(PART_MOMENT);
        return;
      }
      if (where) {
        if (!(yield* turned(PART_MOMENT))) return;
        yield* this.leaveTaking(you, words(where), PART_LEAVE);
        return;
      }
      const fond = this.life.fondness(this, 'player');
      const stay = STAY[0] + this.life.random() * (STAY[1] - STAY[0]) + STAY_FOND * fond;
      yield* turned(stay);
      if (flat(this.pos, you) < WAVE_OFF) yield* this.leaveTaking(you, this.life.random() < 0.5 ? words('part.bye') : null, PART_LEAVE);
    } finally {
      this.parting = false;
    }
  }

  /** Stands turned to you at `you` for `seconds`, while you are near (PART_AWAY); false if you went off. */
  private *turnedTo(you: THREE.Vector3, seconds: number): Brain<boolean> {
    for (let t = 0; t < seconds; t += yield) {
      if (flat(this.pos, you) > PART_AWAY) return false;
      this.halt();
      this.faceTo(you);
    }
    return true;
  }

  /** A wave to you at `you`, saying `line` if given, for `seconds`. */
  private *leaveTaking(you: THREE.Vector3, line: string | null, seconds: number): Brain {
    this.faceTo(you);
    this.ch.play('wave');
    if (line) this.life.say(this, line);
    try {
      for (let t = 0; t < seconds; t += yield) {
        this.halt();
        this.faceTo(you);
      }
    } finally {
      if (this.ch.actionId === 'wave') this.ch.stopAction();
    }
  }

  /** What they have to be off to, by the part of their day the hour has them in (or is about to: see
   * Life.dayPart), as a word of it; null if nowhere (out and about, a meal they have had). A keeper at their
   * stall is there. */
  private somewhereToBe(): StringKey | null {
    const next = this.life.dayPart(this);
    const kind = next.kind;
    if (kind === 'meal' && this.needs.hunger < STILL_HUNGRY && next === this.block) return null;
    if (kind === 'work' && next.stall && flat(this.pos, next.stall.keeper) < 2) return null;
    return PART_LINES[kind] ?? null;
  }

  /** Says `line` to whoever is at `at` (you, as you go), talking a moment (seated, as they sit), turned to
   * them. */
  private *sayTo(at: THREE.Vector3, line: string, seconds = TALK): Brain {
    if (!this.seat) this.ch.play('talk');
    let said = false;
    try {
      for (let t = 0; t < seconds; t += yield) {
        this.halt();
        this.faceTo(at);
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
   * Given `c` (in their paws already: see Hands.give) by `giver` (you, or someone who lives here), standing at
   * `from` (where they are as they go): turned to them, glad of it, they thank them (the user, 2026-10-22: they
   * stop and talk to you, thanking you); food and drink they eat or drink there and then and thank them for
   * after; anything else they look at a moment and keep holding, in their paw, till they need it for something
   * else (a stall's line, eating, playing, taking something up, handing something over: each puts what is in
   * it into their pouch first), and at bedtime it goes down in their room with their other keepsakes (the
   * user, 2026-10-23: put away at once, a gift was seen no more). A torch they put away at once: only yours
   * lights the night (see ItemDef.light). Something of theirs they had lent, given `back`, they are glad to
   * have again, and put away. What it put away out of their paw, they hold again once their paw is empty.
   */
  *thank(c: Carried, from: THREE.Vector3, giver: string, back: boolean): Brain {
    const thanked = function* (this: Resident): Brain {
      const held = this.hands.hand !== c ? this.hands.hand : null;
      this.hands.takeOut((x) => x === c);
      this.faceTo(from);
      try {
        if (back) {
          yield* this.sayTo(from, words('thanks.back'), 2.4);
          this.hands.stow();
          return;
        }
        if (this.free) this.ch.play('cheer');
        this.life.say(this, this.life.thanks(this, 'got'));
        for (let t = 0; t < 1.8; t += yield) {
          this.halt();
          this.faceTo(from);
        }
        if (this.ch.actionId === 'cheer') this.ch.stopAction();
        this.needs.company = Math.max(0, this.needs.company - 0.3);
        if (edible(c)) {
          yield* this.eat(GIFT_PACE);
          yield* this.sayTo(from, this.life.thanks(this, 'ate'));
        } else {
          if (this.free) {
            this.ch.play('look');
            for (let t = 0; t < 2; t += yield) this.halt();
            this.ch.stopAction();
          }
          // Held on to, but for a torch, which burns in a paw and would light nothing round them.
          if (ITEMS[c.item].light) this.hands.stow();
          yield* this.sayTo(from, this.life.thanks(this, 'kept'));
        }
      } finally {
        if (this.ch.actionId === 'cheer' || this.ch.actionId === 'look') this.ch.stopAction();
        if (this.seat) this.ch.play('sit');
        if (!this.hands.hand && held && this.hands.all.includes(held)) this.hands.takeOut((x) => x === held);
      }
    };
    yield* giver === 'player' ? this.withYou(thanked.call(this), true) : thanked.call(this);
  }

  /** Over to you, `near` from you, chasing you a while if you walk off; false if they could not reach you. */
  private *toYou(near: number): Brain<boolean> {
    const start = this.life.now;
    while (this.life.now - start < GIVE_CHASE) {
      const you = this.life.playerAt;
      if (!you) return false;
      if (flat(this.pos, you) < near + 0.4) return true;
      const stand = this.standBy(you, near);
      if (!stand) return false;
      const from = this.life.now;
      yield* this.walkWhile(stand, () => this.life.now - from < 2.5);
    }
    const you = this.life.playerAt;
    return !!you && flat(this.pos, you) < near + 0.6;
  }

  /** Fond of you, over to greet you: a wave and `line`, their eyes on you; and if they bring `gift` (one of
   * their keepsakes), it for you (see Choices). */
  *greetYou(line: string, gift: Carried | null): Brain {
    this.greetedOn = this.life.day;
    if (!(yield* this.toYou(1.3))) return;
    const you = this.life.playerAt;
    if (!you) return;
    const greeting = function* (this: Resident): Brain {
      this.faceTo(you);
      yield* this.stand();
      this.ch.play('wave');
      try {
        this.life.say(this, line);
        for (let t = 0; t < 2.2; t += yield) {
          this.halt();
          this.faceTo(you);
        }
      } finally {
        if (this.ch.actionId === 'wave') this.ch.stopAction();
      }
      if (gift && this.life.playerHands?.fits(gift.item)) {
        this.life.say(this, words('greet.gift'));
        yield* this.handTo('player', gift);
      }
    };
    yield* this.withYou(greeting.call(this), true);
  }

  /** Hungry, over to you as you hold something to eat, looking at it, asking for it (`line`): a moment to give
   * it them (see Life.gave). */
  *askYou(line: string): Brain {
    this.askedOn = this.life.day;
    if (!(yield* this.toYou(1.2))) return;
    const you = this.life.playerAt;
    if (!you) return;
    const asking = function* (this: Resident): Brain {
      this.life.say(this, line);
      for (let t = 0; t < 4.5; t += yield) {
        this.halt();
        this.faceTo(you);
      }
    };
    yield* this.withYou(asking.call(this));
  }

  /** You talk with them, standing at `you` (where you are as you go): they turn to you (if not seated or at a
   * counter) and say `line`, talking a moment, their eyes following you if you walk off; then part from you (see
   * partFrom), not straight back to what they were doing. */
  *talk(you: THREE.Vector3, line: string): Brain {
    this.faceTo(you);
    yield* this.withYou(this.sayTo(you, line), true);
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
        yield* this.stand();
      }
      this.faceTo(you);
      const action = answer.actions[Math.floor(this.life.random() * answer.actions.length)];
      if (action === 'hop') this.ch.jump();
      else this.ch.play(action);
      if (answer.line) this.life.say(this, words(answer.line));
      try {
        for (let t = 0; t < (action === 'hop' ? 0.9 : answer.seconds); t += yield) {
          this.halt();
          this.faceTo(you);
        }
      } finally {
        if (this.ch.actionId === action) this.ch.stopAction();
      }
    };
    yield* this.withYou(answering.call(this), true);
  }

  /** Someone plays music at `at` (you, or someone who lives here): over a little way off them, to listen a
   * while, dancing along if they like to dance (see Life.performing). */
  *listen(at: THREE.Vector3, playing: () => boolean): Brain {
    const d = flat(this.pos, at);
    const off = 2.2 + this.life.random() * 1.2;
    _v.set(at.x + ((this.pos.x - at.x) / Math.max(d, 1e-3)) * off, at.y, at.z + ((this.pos.z - at.z) / Math.max(d, 1e-3)) * off);
    const spot = this.life.nearestStanding(_v);
    if (spot && d > off + 0.6) yield* this.walkWhile(spot, playing);
    const face = Math.atan2(at.x - this.pos.x, at.z - this.pos.z);
    const dance = this.profile.feast === 'dance' || this.life.random() < 0.3;
    const until = this.life.now + 20 + this.life.random() * 25;
    try {
      while (this.life.now < until && playing()) yield* this.wait(1, face, dance ? 'hula' : null);
    } finally {
      this.needs.fun = Math.max(0, this.needs.fun - 0.3);
    }
  }

  /** Keeping a stall: in by its side, behind its counter, serving whoever is at it, till the feast. */
  private *work(stall: Stall | null): Brain {
    if (!stall) return;
    const side = stall.sides.reduce((a, b) => (flat(a, this.pos) < flat(b, this.pos) ? a : b));
    if (flat(this.pos, stall.keeper) > 0.5) {
      if (!(yield* this.walk(side))) return;
      if (!(yield* this.walk(stall.keeper, this.ch.walkSpeed * 0.6))) return;
    }
    this.life.openStall(stall, this.id);
    try {
      for (;;) {
        this.halt();
        this.ch.setFacing(stall.yaw);
        yield* this.life.serve(stall, this);
      }
    } finally {
      this.life.closeStall(stall, this.id);
      // Out by the side again, if they are still in the stall.
      if (flat(this.pos, stall.keeper) < 0.8) this.place(side, stall.yaw);
    }
  }

  /** To the night beach's feast: playing for it, dancing at it now and then, or sitting round its fire; with
   * something to play in their paws, playing it by the fire a while first. Taken up again on `first` (a seat
   * by the fire a save had them on), they sit there first. */
  private *feast(first: Seat | null = null): Brain {
    const feast = this.life.places.feast;
    if (first) {
      first.taken = this;
      try {
        this.ch.setFacing(first.yaw);
        const stay = this.profile.feast === 'dance' ? 30 + this.life.random() * 40 : 1e9;
        yield* this.wait(stay, first.yaw, 'sit');
      } finally {
        if (first.taken === this) first.taken = null;
      }
    }
    if (this.profile.feast === 'ukulele') {
      if (yield* this.walk(feast.player)) {
        const face = Math.atan2(feast.fire.x - feast.player.x, feast.fire.z - feast.player.z) + Math.PI * 0.6;
        for (;;) yield* this.wait(30, face, 'ukulele');
      }
      return;
    }
    if (this.hands.takeOut(playable)) {
      const tune = this.hands.hand;
      const spot = feast.dancers[Math.floor(this.life.random() * feast.dancers.length)];
      if (yield* this.walk(spot)) yield* this.playHeld(40 + this.life.random() * 30, Math.atan2(feast.fire.x - spot.x, feast.fire.z - spot.z));
      // (Only what they played: given something meanwhile, they hold that.)
      if (this.hands.hand === tune) this.hands.stow();
    }
    for (;;) {
      if (this.profile.feast === 'dance' && this.life.random() < 0.5) {
        const spot = feast.dancers[Math.floor(this.life.random() * feast.dancers.length)];
        if (yield* this.walk(spot)) {
          const face = Math.atan2(feast.fire.x - spot.x, feast.fire.z - spot.z);
          yield* this.wait(25 + this.life.random() * 25, face, 'hula');
          this.needs.fun = Math.max(0, this.needs.fun - 0.4);
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
