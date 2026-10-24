import { ITEMS, type Carried, type ItemId } from './Items';
import { t } from '../i18n/I18n';
import type { Life } from './Life';
import { edible, playable, readable, readyable, type Brain, type Resident } from './Resident';
import { FRIENDS, type Taste } from './profiles';
import type { Thing } from './Things';

/**
 * What someone who lives here does next out and about (the user, 2026-10-23: they live their own lives, and
 * can do whatever you can). Each time they are done with something they weigh what they could do now:
 * - go to one of their places, and stand or sit there a while;
 * - eat or drink what they have, as hungry as they are;
 * - play what they have (the ukulele), as much as they want some fun: at the stage if it is near;
 * - read what they have (the book), a while where they are, held open before their face as you read it;
 * - hold up ready what they have (a weapon: かまえる), a while where they are, as you do; and now and then take
 *   their own weapon out from where it lies (Chiikawa's, Hachiware's: things.json) to carry it and hold it up so;
 * - give one of their keepsakes to a friend about, as much as they want company (at most once a day);
 * - go over to a friend about for a word;
 * - put a keepsake down in their own room;
 * - give back what they borrowed, more surely the longer they have had it; put what has a place of its own
 *   back there;
 * - come over to greet you, if they are fond of you (once a day), sometimes bringing you a keepsake; or,
 *   hungry, come and ask for what you have to eat;
 * - have a look at something lying about, or (rarely: the user, "will not be a common behavior") take it up,
 *   borrowing it if it is someone else's: at most once a day each, and not soon after anyone else did.
 * One of them is picked by weight. What they need grows as the hours go (see feel) and is met by eating,
 * company and fun.
 *
 * Nothing here asks what a thing is by its name: only what it is for (ItemDef.use: eaten, drunk, played, read,
 * or kept), whether it burns (ItemDef.light: never taken up), whose it is and where it lies. So whatever the
 * island gains (a new thing in public/data/things.json, a new kind of thing from the build, something you put
 * down) is part of their choosing as soon as it lies there.
 */

/** How fast what they need grows, a share each hour. */
const GROWS = { hunger: 0.16, company: 0.12, fun: 0.08 };
/** How far they look about them for things lying about and for friends (metres). */
const SEE = 18;
const FRIEND_NEAR = 30;
/** Taking things up: how much they like to at most (a thing at their feet, as curious as can be), and how
 * long after anyone took something up before anyone does again (seconds of the island's life). */
const TAKE = 0.06;
const TAKE_GAP = 90;
/** Borrowing what is someone else's: so much less likely than taking up what is no one's. */
const BORROW = 0.25;
/** Having a look at something lying about: how much they like to at most. */
const ADMIRE = 0.14;
/** At most so many things in their paws before they take up no more. */
const CARRY = 4;
/** Out of others' rooms: things lying this near the middle of someone's room are left to them (metres). */
const ROOM = 3.5;
/** You: how near you must be for them to come over to greet you, or ask for what you hold (metres); how fond
 * of you they must be for each, and to bring you a keepsake. */
const GREET_NEAR = 14;
const ASK_NEAR = 10;
const FOND_GREET = 0.5;
const FOND_ASK = 0.3;
const FOND_GIFT = 0.75;
/** Playing: how long (seconds, from, to), and how near the stage must be for them to go up on it (metres). */
const PLAY: [number, number] = [30, 55];
const STAGE_NEAR = 45;
/** Reading: how long (seconds, from, to). */
const READ: [number, number] = [25, 50];
/** Holding a weapon up ready: how long (seconds, from, to); and taking their own out from where it lies: how much they
 * like to at most (as TAKE, a little more: it is theirs). */
const READY: [number, number] = [6, 14];
const OWN_WEAPON = 0.08;

const flat = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z);

/** What a thing is for, as tastes have it: eaten, drunk, played, or kept. */
function useOf(item: ItemId): keyof Taste {
  return ITEMS[item].use ?? 'keep';
}

export class Choices {
  /** No one takes anything up again before this (Life.now). */
  private nextTake = 0;

  constructor(private readonly life: Life) {}

  /** Someone took something up: no one again for a while. */
  took(): void {
    this.nextTake = this.life.now + TAKE_GAP;
  }

  /** How much `r` likes a thing for what it is for (their profile's tastes; 1 if they have none for it). */
  private likes(r: Resident, item: ItemId): number {
    return r.profile.likes?.[useOf(item)] ?? 1;
  }

  /** What `r` needs, grown with the hours since last looked to (the island's own hours, day after day). */
  private feel(r: Resident): void {
    const now = this.life.day * 24 + this.life.hours;
    if (!Number.isNaN(r.neededAt)) {
      const hours = Math.max(0, Math.min(6, now - r.neededAt));
      for (const k of ['hunger', 'company', 'fun'] as const) r.needs[k] = Math.min(1, r.needs[k] + GROWS[k] * hours);
    }
    r.neededAt = now;
  }

  /** Who `r` counts as friends: their own (FRIENDS), whoever they go about with or live with. */
  friendsOf(r: Resident): Resident[] {
    const ids = new Set<string>(FRIENDS[r.id] ?? []);
    if (r.profile.with) ids.add(r.profile.with);
    for (const id of r.home.people) if (id !== r.id && id !== 'player') ids.add(id);
    for (const o of this.life.residents) if (o.profile.with === r.id) ids.add(o.id);
    return [...ids].map((id) => this.life.resident(id)).filter((o): o is Resident => !!o);
  }

  /** Whether a thing lying about is one `r` might go to: not burning, not on its way to someone else, not left
   * in someone else's room. */
  private open(r: Resident, t: Thing): boolean {
    if (t.sought || ITEMS[t.item].light) return false;
    if (t.owner && t.owner !== r.id) {
      for (const h of this.life.places.homes) if (h.room && flat(h.room, t.at) < ROOM && Math.abs(h.room.y - t.at.y) < 1) return false;
    }
    return true;
  }

  /** What `r` does next (see Resident.about). */
  next(r: Resident): Brain {
    this.feel(r);
    const life = this.life;
    const options: [number, () => Brain][] = [];
    const add = (w: number, run: () => Brain) => {
      if (w > 0.001) options.push([w, run]);
    };
    const all = r.hands.all;
    const curious = r.profile.curious ?? 0.5;
    const hoursNow = life.day * 24 + life.hours;

    // Off to one of their places.
    add(1, () => r.stroll());

    // What they have: to eat, to play, given back, put back.
    const food = all.find((c) => edible(c) && !c.lent);
    if (food) add(2.5 * r.needs.hunger * this.likes(r, food.item), () => this.eatNow(r, food));
    const tune = all.find((c) => playable(c));
    if (tune) add((0.6 + 1.6 * r.needs.fun) * this.likes(r, tune.item), () => this.play(r, tune));
    const book = all.find((c) => readable(c));
    if (book) add((0.4 + 1.0 * r.needs.fun) * this.likes(r, book.item), () => this.read(r, book));
    const weapon = all.find((c) => readyable(c));
    if (weapon && !r.seat) add((0.1 + 0.35 * r.needs.fun) * this.likes(r, weapon.item), () => this.ready(r, weapon));
    for (const c of all) {
      if (c.lent) add(0.25 + 0.5 * Math.max(0, hoursNow - (r.borrowed.get(c) ?? hoursNow)), () => r.giveBack(c));
      else if (c.home && !playable(c) && !readable(c) && !readyable(c)) add(0.8, () => r.putBack(c));
      else if (c.home) add(0.25 + (1 - r.needs.fun) * 0.6, () => r.putBack(c));
    }

    // Friends: one of their keepsakes for one of them, or a word with them.
    const keeps = all.filter((c) => !edible(c) && !c.lent && !c.home && c.owner === r.id);
    const friends = this.friendsOf(r).filter(
      (o) => !o.far && o.block?.kind === 'about' && !o.busy && !o.line && !o.seat && flat(o.pos, r.pos) < FRIEND_NEAR,
    );
    if (friends.length > 0) {
      const friend = friends[Math.floor(life.random() * friends.length)];
      if (keeps.length > 0 && r.gaveOn !== life.day) {
        const gift = keeps[Math.floor(life.random() * keeps.length)];
        if (friend.hands.fits(gift.item)) add(0.2 * (0.5 + r.needs.company), () => this.give(r, friend, gift));
      }
      if (!friend.chat) add(0.7 * r.needs.company, () => r.visit(friend));
    }

    // You: over to greet you, or to ask for what you hold.
    const you = life.playerAt;
    if (you && Math.abs(you.y - r.pos.y) < 3) {
      const d = flat(you, r.pos);
      const fond = life.fondness(r, 'player');
      if (d < GREET_NEAR && r.greetedOn !== life.day && fond >= FOND_GREET) {
        const gift = fond >= FOND_GIFT && life.random() < 0.35 ? (keeps[0] ?? null) : null;
        add(0.8 * fond, () => r.greetYou(life.greeting(r), gift));
      }
      const yours = life.playerHands?.hand ?? null;
      // (Not what you have bitten into, which you cannot give.)
      if (d < ASK_NEAR && edible(yours) && !yours?.lent && !life.playerHands?.nibbled && r.needs.hunger > 0.55 && fond >= FOND_ASK && r.askedOn !== life.day) {
        add(1.2 * r.needs.hunger, () => r.askYou(life.line(r, 'ask.food')));
      }
    }

    // A keepsake down in their own room, if home is near.
    const room = r.home.room;
    if (keeps.length >= 2 && room && flat(room, r.pos) < 40) add(0.45, () => r.keepAtHome(keeps[0]));

    // Things lying about near them: a look, or (rarely) taken up.
    const mayTake = r.tookOn !== life.day && life.now >= this.nextTake && all.length < CARRY;
    for (const t of life.things.list) {
      const d = flat(t.at, r.pos);
      if (d > SEE || Math.abs(t.at.y - r.pos.y) > 3 || !this.open(r, t)) continue;
      const near = 1 / (1 + d / 6);
      const theirs = !!t.owner && t.owner !== r.id;
      // (Their own, lying about: left where they put it; their own weapon, now and then taken out to carry.)
      if (t.owner === r.id) {
        if (mayTake && readyable(t) && r.hands.fits(t.item)) add(OWN_WEAPON * near * this.likes(r, t.item), () => this.takeUp(r, t));
        continue;
      }
      add(ADMIRE * curious * near, () => r.admire(t));
      if (!mayTake || (theirs && edible(t)) || !r.hands.fits(t.item)) continue;
      add(TAKE * curious * near * this.likes(r, t.item) * (theirs ? BORROW : 1), () => this.takeUp(r, t));
    }

    let total = 0;
    for (const [w] of options) total += w;
    let pick = life.random() * total;
    for (const [w, run] of options) {
      pick -= w;
      if (pick <= 0) return run();
    }
    return r.stroll();
  }

  /** Eats `c` where they are (out of the pouch into their paw first). */
  private *eatNow(r: Resident, c: Carried): Brain {
    if (r.hands.takeOut((x) => x === c)) yield* r.eat();
  }

  /** Plays `c`: up on the stage if it is near, else where they are; done, back in the pouch. */
  private *play(r: Resident, c: Carried): Brain {
    if (!r.hands.takeOut((x) => x === c)) return;
    const stage = this.life.places.spots.get('stage');
    let face = NaN;
    if (stage && flat(stage.at, r.pos) < STAGE_NEAR) {
      if (yield* r.walk(this.life.spotPoint(stage))) face = stage.look;
    }
    yield* r.playHeld(PLAY[0] + this.life.random() * (PLAY[1] - PLAY[0]), face);
    // (Only what they played: given something meanwhile, they hold that.)
    if (r.hands.hand === c) r.hands.stow();
  }

  /** Reads `c` a while where they are; done, back in the pouch. */
  private *read(r: Resident, c: Carried): Brain {
    if (!r.hands.takeOut((x) => x === c)) return;
    yield* r.readHeld(READ[0] + this.life.random() * (READ[1] - READ[0]));
    // (Only what they read: given something meanwhile, they hold that.)
    if (r.hands.hand === c) r.hands.stow();
  }

  /** Holds `c` up ready a while where they are (a weapon: かまえる); done, still in their paw, carried. */
  private *ready(r: Resident, c: Carried): Brain {
    if (!r.hands.takeOut((x) => x === c)) return;
    yield* r.readyHeld(READY[0] + this.life.random() * (READY[1] - READY[0]));
  }

  /** Over to `friend` with `gift`. */
  private *give(r: Resident, friend: Resident, gift: Carried): Brain {
    yield* r.handTo(friend, gift);
  }

  /** Takes `t` up, then perhaps eats it or plays it there and then; else it is kept. (Given something while they
   * looked at it, they hold that, the thing taken up in their pouch.) */
  private *takeUp(r: Resident, t: Thing): Brain {
    const c = yield* r.takeUp(t);
    if (!c || r.hands.hand !== c) return;
    if (edible(c) && !c.lent && r.needs.hunger > 0.3) yield* r.eat();
    else if (playable(c) && this.life.random() < 0.7) yield* this.play(r, c);
    else if (readable(c) && this.life.random() < 0.7) yield* this.read(r, c);
    else if (readyable(c) && this.life.random() < 0.8) yield* this.ready(r, c);
    else r.hands.stow();
  }
}
