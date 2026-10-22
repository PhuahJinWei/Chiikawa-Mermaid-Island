import * as THREE from 'three';
import type { StringKey } from '../i18n/I18n';
import type { Character, FrameContext } from '../characters/Character';
import type { EmoteSystem } from '../characters/Emotes';
import { clampToWalkable } from '../world/Island';
import { Nav } from './Nav';
import { Places, type Home, type Spot, type Stall } from './Places';
import { HOMES, ISLANDER_HOMES, PROFILES, hash, islanderProfile, seeded, type Profile } from './profiles';

/** The name an islander lives under (see Life.create): islander01 lives with you. */
const islanderId = (i: number) => `islander${String(i + 1).padStart(2, '0')}`;
import { Resident, type Answer, type Block, type Brain } from './Resident';
import type { ActionId } from '../characters/Actions';
import type { ItemCopy, ItemId } from './Items';
import type { Things } from './Things';
import { t } from '../i18n/I18n';
import { CAST_LINES, EVENING_LINES, FEAST_LINES, FIELD_LINES, ISLANDER_LINES, MORNING_LINES, NIGHT_LINES, WORK_LINES } from './lines';

/**
 * Life on the island (the user's rules, 2026-10-22): everyone who lives on it goes about their own day, you
 * among them, not its middle. They sleep at home from midnight to morning (the islanders in the villagers'
 * houses, two to a house; the guests in the guest houses), stroll to the places they like, eat at the
 * festival's stalls, five of which are kept open each day by islanders who go to work at them while others
 * line up before them, and gather at the night beach's feast before bed. They look at one another (and at
 * you as at anyone), keep out of one another's way and give way, slowly, to someone who keeps pushing into
 * them. Far from the camera they are moved without being drawn or worked out in full.
 */

/** Out of sight past this far from the camera, and moved without being worked out in full past FAR; worked
 * out every other frame past MID. */
const HIDE = 85;
const FAR = 70;
const MID = 32;
/** How many stalls are kept open each day (the user: 5), and the hours their keepers keep them. */
const OPEN_STALLS = 5;
/** How near two people come before one gives way, between their middles, as a share of their widths (as
 * Game's APART). */
const APART = 0.6;
/** Pushing into someone: how long before they give way (seconds), how fast they are pushed at most
 * (metres a second, for someone of weight 1), and how long before they are startled by it again. */
const PRESS = 0.4;
const PUSH_SPEED = 0.75;
const STARTLE_AGAIN = 4;
/** Who looks at whom: how far they notice others and what goes on; how long they keep looking. */
const NOTICE = 6.5;
const LOOK_FOR: [number, number] = [1.6, 4.2];
/** How long something that goes on is worth looking at (seconds). */
const EVENT_LIFE = 2.2;
/** Keepers take this long to serve someone at the counter (seconds, from, to). */
const SERVE: [number, number] = [2.5, 4.5];
/** Served at a counter, you join its line again only once you have been this far from it (metres). */
const SERVED_AWAY = 2.5;
/** You hopping: who sees it within this far hops or waves back, as many as this, each as likely as this. */
const GREET_FROM = 6;
const GREETERS = 3;
const GREET_CHANCE = 0.6;
/** What some give back for what you give them, a moment after (seconds): Kurimanju one of his cans, the
 * crab who keeps the book shop a shell from her beach. */
const GIFT_BACK: Record<string, ItemId> = { kurimanju: 'can', furuhonya: 'seashell' };
const GIFT_BACK_AFTER = 2.2;
/** How long what someone says to you stays over their head (seconds). */
const SAID_FOR = 3.4;
/** How those near answer what you do (the user, 2026-10-22: reacting gets a response, as hopping did): who
 * sees it within REACT_FROM, as many as `most`, each as likely as `chance`. */
const REACT_FROM = 6;
const REACTIONS: Partial<Record<ActionId, Answer & { chance: number; most: number }>> = {
  wave: { actions: ['wave'], seconds: 1.8, chance: 0.75, most: 4 },
  hop: { actions: ['hop', 'wave'], seconds: 1.8, chance: 0.6, most: 3 },
  cheer: { actions: ['cheer', 'hop'], seconds: 1.6, chance: 0.6, most: 4 },
  bow: { actions: ['bow'], seconds: 1.6, chance: 0.8, most: 4 },
  hula: { actions: ['hula'], seconds: 6, chance: 0.5, most: 4 },
  look: { actions: ['look'], seconds: 2.2, chance: 0.5, most: 3 },
  cry: { actions: ['look'], line: 'react.cry', seconds: 2.4, chance: 0.85, most: 2, come: true },
  startled: { actions: ['look'], line: 'react.startled', seconds: 2.2, chance: 0.6, most: 2 },
  talk: { actions: ['talk'], seconds: 2.2, chance: 0.4, most: 2 },
};
/** The cast, whose thanks are their own (see thanks); the islanders share theirs. */
const OWN_THANKS = new Set(['chiikawa', 'hachiware', 'usagi', 'momonga', 'kurimanju', 'rakko', 'shisa', 'furuhonya', 'hitoha', 'futaba']);

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _from = new THREE.Vector3();
const _to = new THREE.Vector3();
const _eyes = new THREE.Vector3();
const flat = (a: THREE.Vector3, b: THREE.Vector3) => Math.hypot(a.x - b.x, a.z - b.z);

interface Event {
  at: THREE.Vector3;
  who: Resident | 'player';
  until: number;
}

/** What Life needs from the game each frame. */
export interface LifeFrame {
  dt: number;
  /** The island's clock, hours past midnight. */
  hours: number;
  camera: THREE.Camera;
  ctx: FrameContext;
  /** You: whose eyes the camera is at or behind, your eyes, and the way you push (your stick's walk). */
  me: Character;
  myEyes: THREE.Vector3;
  myWant: THREE.Vector3;
}

export class Life {
  readonly residents: Resident[] = [];
  private readonly byId = new Map<string, Resident>();
  private readonly byCharacter = new Map<Character, Resident>();
  /** Your house, where you sleep (see Game's bed). */
  readonly playerHome: Home | null;
  /** Seconds since life began, and the hour and day as it goes. */
  now = 0;
  hours = 0;
  day = 0;
  private lastHours = NaN;
  /** Today's open stalls and who keeps each, the lines before them (you as 'player'), and who is being
   * served. */
  private readonly keepers = new Map<Stall, string>();
  private readonly open = new Set<Stall>();
  private readonly lines = new Map<Stall, (Resident | 'player')[]>();
  /** Who has the counter of each open stall now (at its front, being served or about to be). */
  private readonly events: Event[] = [];
  private rng = seeded(1);
  private chatNext = 0;
  /** You at a stall's counter: served (what you got), or waiting; read by the game. */
  playerServed: Stall | null = null;
  private playerLine: Stall | null = null;
  /** The stall you were last served at, till you have walked away from it (see SERVED_AWAY). */
  private playerDone: Stall | null = null;
  /** The things lying about, whose copies the stalls' food and your gifts are (the game gives it). */
  things: Things | null = null;
  /** Something given back to you for what you gave (see GIFT_BACK): read by the game. */
  onGiftBack: (item: ItemId, from: Resident) => void = () => {};
  private giftsBack: { item: ItemId; from: Resident; at: number }[] = [];

  private constructor(
    readonly nav: Nav,
    readonly places: Places,
    private readonly emotes: EmoteSystem,
  ) {
    this.playerHome = this.findHome(HOMES.player);
    // Yours is the house's first bed; whoever lives with you, the next.
    this.playerHome?.people.push('player');
  }

  /**
   * Life for `cast` (the named characters, by id, you among them) and `islanders` (everyone else who
   * lives on the island), on the island once it has loaded.
   */
  static async create(cast: ReadonlyMap<string, Character>, islanders: Character[], emotes: EmoteSystem): Promise<Life> {
    const nav = new Nav();
    const places = await Places.load(nav);
    const life = new Life(nav, places, emotes);
    for (const [id, ch] of cast) {
      if (id === 'player') continue;
      const profile = PROFILES[id];
      const home = life.findHome(HOMES[id]);
      if (!profile || !home) continue;
      life.add(id, ch, home, profile);
    }
    // The first lives with you (the user: two to a house, you among the islanders); the rest two to a house,
    // some going about with whoever they live with.
    islanders.forEach((ch, i) => {
      const home = i === 0 ? life.playerHome : life.findHome(ISLANDER_HOMES[Math.floor((i - 1) / 2) % ISLANDER_HOMES.length]);
      const mate = i > 0 && i % 2 === 0 ? islanderId(i - 1) : null;
      if (home) life.add(islanderId(i), ch, home, islanderProfile(i, mate));
    });
    return life;
  }

  private add(id: string, ch: Character, home: Home, profile: Profile): void {
    home.people.push(id);
    const bed = home.beds[home.people.length - 1] ?? null;
    const r = new Resident(id, ch, home, bed, profile, this);
    this.residents.push(r);
    this.byId.set(id, r);
    this.byCharacter.set(ch, r);
  }

  /** A house by its name in profiles (kind@x,z). */
  private findHome(name: string | undefined): Home | null {
    if (!name) return null;
    const [kind, where] = name.split('@');
    const [x, z] = where.split(',').map(Number);
    return this.places.homes.find((h) => h.prop === kind && Math.abs(h.at.x - x) < 0.3 && Math.abs(h.at.z - z) < 0.3) ?? null;
  }

  resident(id: string): Resident | null {
    return this.byId.get(id) ?? null;
  }

  residentOf(ch: Character): Resident | null {
    return this.byCharacter.get(ch) ?? null;
  }

  /** A number from 0 to 1 (life's own, so a day replays the same from a save). */
  random(): number {
    return this.rng();
  }

  /** Whether something with a `chance` of happening on any one day happens today (the same all day). */
  today(key: string, chance: number): boolean {
    return seeded(this.day * 7919 + hash(key))() < chance;
  }

  // ---------------------------------------------------------------- the day
  /** Each morning (and on starting): which stalls open and who keeps them, and everyone's day. */
  private planDay(): void {
    const rng = seeded(this.day * 104729 + 17);
    this.rng = seeded(this.day * 2654435761);
    this.keepers.clear();
    // Five stalls a day, a different five each day, kept by islanders (not Hitoha and Futaba, who show
    // guests round): as many as there are islanders to spare.
    const stalls = [...this.places.stalls];
    const islanders = this.residents.filter((r) => r.id.startsWith('islander'));
    const count = Math.min(OPEN_STALLS, Math.max(1, Math.floor(islanders.length / 2)), stalls.length);
    const pool = [...islanders];
    for (let k = 0; k < count && pool.length > 0; k++) {
      const s = stalls.splice(Math.floor(rng() * stalls.length), 1)[0];
      const keeper = pool.splice(Math.floor(rng() * pool.length), 1)[0];
      this.keepers.set(s, keeper.id);
    }
    for (const r of this.residents) r.plan = this.planFor(r);
    // Whoever goes about with someone keeps their hours too (PLAN.md: Hitoha and Futaba share a day).
    for (const r of this.residents) {
      const lead = r.profile.with ? this.byId.get(r.profile.with) : null;
      if (lead && !this.keeps(r) && !this.keeps(lead)) r.plan = lead.plan.map((b) => ({ ...b }));
    }
  }

  private keeps(r: Resident): boolean {
    return [...this.keepers.values()].includes(r.id);
  }

  private planFor(r: Resident): Block[] {
    const rng = seeded(this.day * 1013 + hash(r.id));
    const blocks: Block[] = [{ at: 0, kind: 'sleep' }];
    const wake = 6 + rng() * 0.7;
    blocks.push({ at: wake, kind: 'wake' });
    const stall = [...this.keepers].find(([, id]) => id === r.id)?.[0];
    if (stall) {
      blocks.push({ at: wake + 0.25, kind: 'work', stall });
      blocks.push({ at: 21.5 + rng() * 0.4, kind: 'feast' });
    } else {
      blocks.push({ at: wake + 0.2, kind: 'about' });
      // Breakfast, lunch and supper at the stalls, if they feel like it.
      for (const [from, to] of [
        [7.3, 8.6],
        [11.9, 13.0],
        [17.2, 18.3],
      ]) {
        if (rng() >= r.profile.hungry) continue;
        // An hour and a quarter for it, then out and about again.
        const at = from + rng() * (to - from);
        blocks.push({ at, kind: 'meal' }, { at: at + 1.25, kind: 'about' });
      }
      // The feast from dusk into the night (the user: it can start in the night too).
      blocks.push({ at: 19 + rng() * 1.6, kind: 'feast' });
    }
    // Home before midnight, to bed at midnight (the user, 2026-10-22).
    blocks.push({ at: 22.9 + rng() * 0.45, kind: 'home' });
    return blocks.sort((a, b) => a.at - b.at);
  }

  /** The block of `r`'s day the hour falls in. */
  private blockAt(r: Resident, hours: number): Block {
    let found = r.plan[0];
    for (const b of r.plan) if (b.at <= hours) found = b;
    return found;
  }

  /**
   * Puts everyone where the hour has them (on starting, after a staged shot, after a night's sleep): in
   * bed, at their stall, round the feast's fire, at one of their places, and begins their day from there.
   */
  settle(hours: number, me: Character | null): void {
    this.hours = hours;
    this.lastHours = hours;
    this.planDay();
    for (const lane of this.lines.values()) lane.length = 0;
    this.open.clear();
    for (const r of this.residents) r.stop();
    for (const s of this.places.feast.seats) s.taken = null;
    for (const h of this.places.homes) for (const s of [...h.beds, ...h.seats]) s.taken = null;
    for (const s of this.places.seats) s.taken = null;
    for (const r of this.residents) {
      r.stop();
      r.chat = null;
      r.served = false;
      r.line = null;
      r.ch.setShown(true);
      if (r.ch === me) continue;
      const block = this.blockAt(r, hours);
      const at = this.settlePoint(r, block);
      if (at) r.place(at, this.random() * Math.PI * 2);
      r.far = false;
      r.begin(block);
    }
  }

  private settlePoint(r: Resident, block: Block): THREE.Vector3 | null {
    switch (block.kind) {
      case 'sleep':
      case 'home':
        return r.bed?.up ?? r.home.door;
      case 'wake':
        return r.home.door;
      case 'work':
        return block.stall?.keeper ?? null;
      case 'feast': {
        const seat = this.places.feast.seats[Math.floor(this.random() * this.places.feast.seats.length)];
        return seat ? seat.at : null;
      }
      case 'meal': {
        // Somewhere along the festival's street, on their way to a stall.
        const street = this.places.spots.get('street');
        return street ? this.spotPoint(street) : null;
      }
      default: {
        const ids = Object.keys(r.profile.spots);
        const spot = this.places.spots.get(ids[Math.floor(this.random() * ids.length)] as never);
        return spot ? this.spotPoint(spot) : null;
      }
    }
  }

  // ---------------------------------------------------------------- things
  /** A copy of a thing to hold (see Things), or an empty paw's worth if there are none. */
  copyOf(item: ItemId): ItemCopy {
    if (!this.things) throw new Error('No things yet');
    return this.things.copyOf(item);
  }

  /** Done with a held copy. */
  release(copy: ItemCopy): void {
    this.things?.release(copy);
  }

  /** You give `r` the thing in your paw, standing at `from`: they take it (see Resident.receive), and some
   * give you something back a moment later (see GIFT_BACK). */
  give(r: Resident, item: ItemId, from: THREE.Vector3): void {
    if (!this.things) return;
    // (Where you are as you go, so they keep turned to you if you walk off.)
    r.interrupt(r.receive(this.copyOf(item), item, from));
    const back = GIFT_BACK[r.id];
    if (back && back !== item) this.giftsBack.push({ item: back, from: r, at: this.now + GIFT_BACK_AFTER });
  }

  // ---------------------------------------------------------------- the notebook
  /**
   * Where each of the cast is (`placeAt` names the place a point is in) and what they are doing, for your
   * notebook's page of everyone (the user: where is everyone); and the islanders, counted by what they do.
   */
  whereabouts(placeAt: (p: THREE.Vector3) => string): { cast: { name: string; place: string; doing: string }[]; islanders: string } {
    const cast = this.residents
      .filter((r) => !r.id.startsWith('islander'))
      .map((r) => ({
        name: t(`char.${r.id}` as StringKey),
        place: this.atHome(r) ? t('where.home') : placeAt(r.pos),
        doing: t(this.doing(r)),
      }));
    const counts = new Map<StringKey, number>();
    const islanders = this.residents.filter((r) => r.id.startsWith('islander'));
    for (const r of islanders) {
      const kind = r.block?.kind;
      const what: StringKey =
        kind === 'sleep' || kind === 'home' ? 'where.count.home'
        : kind === 'work' ? 'where.count.work'
        : kind === 'meal' ? 'where.count.meal'
        : kind === 'feast' ? 'where.count.feast'
        : 'where.count.about';
      counts.set(what, (counts.get(what) ?? 0) + 1);
    }
    const parts = [...counts].map(([key, n]) => t(key).replace('{0}', String(n)));
    return { cast, islanders: t('where.islanders').replace('{0}', String(islanders.length)).replace('{1}', parts.join('・')) };
  }

  /** Whether `r` is in their own house. */
  private atHome(r: Resident): boolean {
    const room = r.home.room;
    return r.indoors || (!!room && flat(r.pos, room) < 3.4 && Math.abs(r.pos.y - room.y) < 0.3);
  }

  /** What `r` is doing, in the game's words. */
  private doing(r: Resident): StringKey {
    if (r.busy) return 'doing.withYou';
    if (r.chat) return 'doing.chatting';
    const action = r.ch.actionId;
    switch (r.block?.kind) {
      case 'sleep':
        return r.seat || r.indoors ? 'doing.sleeping' : 'doing.goingHome';
      case 'home':
        return this.atHome(r) ? 'doing.atHome' : 'doing.goingHome';
      case 'wake':
        return 'doing.waking';
      case 'work':
        return r.block.stall && this.isOpen(r.block.stall) ? 'doing.working' : 'doing.goingToWork';
      case 'meal':
        return r.line ? 'doing.queuing' : r.ch.holding ? 'doing.eating' : 'doing.goingToEat';
      case 'feast':
        return action === 'ukulele' ? 'doing.playing' : action === 'hula' ? 'doing.dancing' : 'doing.feast';
      default:
        if (action === 'sword') return 'doing.sword';
        if (r.ch.holding && action === 'eat') return 'doing.eating';
        if (r.profile.habits?.some((b) => b.spot === 'fields' && this.hours >= b.from && this.hours < b.to)) return 'doing.farming';
        if (r.seat) return 'doing.resting';
        return r.want.lengthSq() > 0.05 ? 'doing.strolling' : 'doing.idle';
    }
  }

  /** You talk with `r`, standing at `from`: they stop and say something like them, for the hour and what
   * they are doing (see lines.ts); asleep, they only sleep on. */
  talk(r: Resident, from: THREE.Vector3): void {
    if (r.block?.kind === 'sleep' && r.seat) {
      this.emotes.spawn('zzz', r.ch);
      return;
    }
    r.interrupt(r.talk(from, t(this.lineFor(r))));
  }

  /** What `r` says thanking you: for what you gave them (`got`), after eating it (`ate`), for keeping it. */
  thanks(r: Resident, kind: 'got' | 'ate' | 'kept'): string {
    return t(`thanks.${kind}.${OWN_THANKS.has(r.id) ? r.id : 'islander'}` as StringKey);
  }

  /**
   * You did something (an action: a wave, a bow, a cheer, a dance, crying) standing at `at`: some of those
   * near who see it answer it (see REACTIONS): wave back, bow back, dance along, come over and ask if you are
   * all right.
   */
  reacted(action: ActionId, at: THREE.Vector3): void {
    this.notice(at, 'player');
    const answer = REACTIONS[action];
    if (!answer) return;
    let answered = 0;
    for (const r of this.nearYou(at, REACT_FROM)) {
      if (answered >= answer.most) break;
      if (this.random() > answer.chance) continue;
      r.interrupt(r.react(at, answer));
      answered++;
    }
  }

  /** Those within `reach` of you at `at` who are free to answer you, the nearest first (see reacted, hopped). */
  private nearYou(at: THREE.Vector3, reach: number): Resident[] {
    return this.residents
      .filter((r) => !r.far && r.ch.shown && !r.busy && !r.line && !r.chat && r.block?.kind !== 'sleep' && flat(r.pos, at) <= reach)
      .sort((a, b) => flat(a.pos, at) - flat(b.pos, at));
  }

  /** Words over `r`'s head (see Resident.talk). */
  say(r: Resident, text: string): void {
    this.emotes.say(r.ch, text, SAID_FOR);
  }

  private lineFor(r: Resident): StringKey {
    const pick = (keys: StringKey[]) => keys[Math.floor(this.random() * keys.length)];
    const kind = r.block?.kind;
    if (kind === 'work') return pick(WORK_LINES);
    if (kind === 'feast' && this.random() < 0.5) return pick(FEAST_LINES);
    const h = this.hours;
    const own = CAST_LINES[r.id];
    // The cast mostly say what is like them; the islanders what the hour and the place bring to mind.
    if (!own || this.random() < 0.45) {
      if (h < 10 && h >= 5) return pick(MORNING_LINES);
      if (h >= 17 && h < 20) return pick(EVENING_LINES);
      if (h >= 20 || h < 5) return pick(NIGHT_LINES);
      if (r.profile.habits?.some((b) => b.spot === 'fields' && h >= b.from && h < b.to)) return pick(FIELD_LINES);
    }
    return pick(own ?? ISLANDER_LINES);
  }

  /** You hopped where you stand: some of those near who see it hop or wave back (the user: jumping as a
   * greeting others answer). */
  hopped(at: THREE.Vector3): void {
    this.notice(at, 'player');
    let greeted = 0;
    for (const r of this.nearYou(at, GREET_FROM)) {
      if (greeted >= GREETERS) break;
      if (r.seat || r.block?.kind === 'work' || this.random() > GREET_CHANCE) continue;
      r.interrupt(r.greet(at));
      greeted++;
    }
  }

  // ---------------------------------------------------------------- each frame
  update(f: LifeFrame): void {
    const dt = f.dt;
    this.now += dt;
    for (let i = this.giftsBack.length - 1; i >= 0; i--) {
      const g = this.giftsBack[i];
      if (this.now < g.at) continue;
      this.giftsBack.splice(i, 1);
      this.onGiftBack(g.item, g.from);
    }
    this.hours = f.hours;
    if (!Number.isNaN(this.lastHours) && f.hours < this.lastHours - 12) {
      // Past midnight: a new day, planned as it begins.
      this.day++;
      this.planDay();
    }
    this.lastHours = f.hours;
    const camera = f.camera.position;

    // Each into the block of their day the hour is in, and a frame of it.
    for (const r of this.residents) {
      if (r.ch === f.me) continue;
      const block = this.blockAt(r, f.hours);
      if (block !== r.block) r.begin(block);
    }
    for (const r of this.residents) if (r.ch !== f.me) r.step(dt);
    this.nav.work(2500);
    this.chats();
    this.attend(f);
    this.avoid(f.me);

    // Everyone drawn and moved, as near the camera as they are.
    for (const r of this.residents) {
      const ch = r.ch;
      if (ch === f.me) continue;
      const d = flat(camera, r.pos);
      const shown = !r.indoors && d < HIDE;
      ch.setShown(shown);
      if (!shown || d > FAR) {
        this.moveFar(r, dt);
        continue;
      }
      if (r.far) {
        // Back from far off: carried on from where they were moved to.
        r.far = false;
        if (!ch.ride) ch.teleport(r.pos.x, r.pos.z, ch.facing, r.pos.y);
        r.skip = 0;
        r.saved = 0;
      }
      ch.setDesiredVelocity(r.want);
      if (d > MID) {
        r.saved += dt;
        if (--r.skip > 0) continue;
        r.skip = 2;
        ch.update(r.saved, f.ctx);
        r.saved = 0;
      } else {
        ch.update(dt, f.ctx);
      }
    }
  }

  /** After you have moved too: no one stands in anyone, and you push whoever you keep walking into (see
   * push); you join or leave a stall's line. */
  resolve(f: LifeFrame): void {
    this.lineUp(f.me);
    this.push(f);
  }

  /** Everyone shown and still where they are (a staged shot, the lineup), their days on hold. */
  hold(): void {
    for (const r of this.residents) {
      r.ch.setShown(true);
      r.far = false;
      r.halt();
    }
  }

  /** Someone far off, moved along the way they want without being worked out in full (nor drawn, past HIDE). */
  private moveFar(r: Resident, dt: number): void {
    r.far = true;
    const ch = r.ch;
    const p = r.pos;
    if (ch.ride) {
      p.set(ch.ride.x, ch.ride.y, ch.ride.z);
      ch.facing = ch.ride.yaw;
    } else if (r.want.lengthSq() > 1e-6) {
      const x = p.x + r.want.x * dt;
      const z = p.z + r.want.z * dt;
      const h = this.nav.standHeight(x, z, p.y);
      p.x = x;
      p.z = z;
      if (!Number.isNaN(h)) p.y = h;
      ch.facing = Math.atan2(r.want.x, r.want.z);
    }
    ch.root.rotation.y = ch.facing;
  }

  /** Whether you could be looking at `r`: drawn, not far, and before the camera. */
  seen(r: Resident): boolean {
    return r.ch.shown && !r.far;
  }

  // ---------------------------------------------------------------- places
  /** A spot one can stand at near `p` (within a metre and a half), or null. */
  nearestStanding(p: THREE.Vector3): THREE.Vector3 | null {
    for (let r = 0; r <= 1.5; r += 0.5) {
      for (let k = 0; k < (r === 0 ? 1 : 8); k++) {
        const a = (k / 8) * Math.PI * 2;
        const x = p.x + Math.cos(a) * r;
        const z = p.z + Math.sin(a) * r;
        const h = this.nav.standHeight(x, z, p.y);
        if (!Number.isNaN(h)) return new THREE.Vector3(x, h, z);
      }
    }
    return null;
  }

  /** Somewhere within a spot to stand at, a little different each time. */
  spotPoint(spot: Spot): THREE.Vector3 {
    for (let k = 0; k < 6; k++) {
      const a = this.random() * Math.PI * 2;
      const d = Math.sqrt(this.random()) * spot.radius;
      _a.set(spot.at.x + Math.cos(a) * d, spot.at.y, spot.at.z + Math.sin(a) * d);
      const h = this.nav.standHeight(_a.x, _a.z, spot.at.y);
      if (!Number.isNaN(h)) return new THREE.Vector3(_a.x, h, _a.z);
    }
    return spot.at.clone();
  }

  // ---------------------------------------------------------------- the stalls
  /** Whether a stall has its keeper behind its counter now. */
  isOpen(stall: Stall): boolean {
    return this.open.has(stall);
  }

  get openStalls(): Stall[] {
    return [...this.open];
  }

  openStall(stall: Stall, keeper: Resident): void {
    if (this.keepers.get(stall) === keeper.id) this.open.add(stall);
  }

  closeStall(stall: Stall, keeper: Resident): void {
    if (this.keepers.get(stall) !== keeper.id) return;
    this.open.delete(stall);
    // Whoever was waiting there goes elsewhere.
    const lane = this.lines.get(stall);
    if (lane) for (const w of lane) if (w !== 'player') w.line = null;
    this.lines.set(stall, []);
  }

  /** An open stall for `r` to eat at: the nearest with room in its line. */
  pickStall(r: Resident): Stall | null {
    const free = [...this.open].filter((s) => (this.lines.get(s)?.length ?? 0) < s.line.length);
    return this.places.nearestStall(r.pos, free);
  }

  joinLine(stall: Stall, who: Resident | 'player'): void {
    const lane = this.lines.get(stall) ?? [];
    if (!lane.includes(who)) lane.push(who);
    this.lines.set(stall, lane);
    if (who !== 'player') who.line = stall;
  }

  leaveLine(stall: Stall, who: Resident | 'player'): void {
    const lane = this.lines.get(stall);
    if (!lane) return;
    const i = lane.indexOf(who);
    if (i >= 0) lane.splice(i, 1);
    if (who !== 'player' && who.line === stall) who.line = null;
  }

  /** How many stand in a stall's line. */
  lineLength(stall: Stall): number {
    return this.lines.get(stall)?.length ?? 0;
  }

  /** Where in a stall's line someone is (0 at the counter), or -1 if not in it or there is no room. */
  linePlace(stall: Stall, who: Resident | 'player'): number {
    const i = this.lines.get(stall)?.indexOf(who) ?? -1;
    return i < stall.line.length ? i : -1;
  }

  /** The keeper's turn at the counter: waits for someone at its front, serves them after a moment. */
  *serve(stall: Stall, keeper: Resident): Brain {
    const lane = this.lines.get(stall);
    const first = lane?.[0];
    if (!first) {
      yield;
      return;
    }
    // Once they are at the counter.
    const at = first === 'player' ? this.playerAt : first.pos;
    if (!at || flat(at, stall.line[0]) > 0.7) {
      yield;
      return;
    }
    const wait = SERVE[0] + this.random() * (SERVE[1] - SERVE[0]);
    keeper.ch.play('bow');
    for (let t = 0; t < wait; t += yield) {
      if (this.lines.get(stall)?.[0] !== first) return;
    }
    if (first === 'player') {
      this.playerServed = stall;
      this.playerDone = stall;
    } else first.served = true;
    this.leaveLine(stall, first);
  }

  /** You in a stall's line: as you walk up to the end of an open one you join it; walking off, you leave it. */
  private playerAt: THREE.Vector3 | null = null;
  private lineUp(me: Character): void {
    this.playerAt = me.position;
    const p = me.position;
    // Served, you walk away before you line up there again.
    if (this.playerDone && flat(p, this.playerDone.line[0]) > SERVED_AWAY) this.playerDone = null;
    if (this.playerLine) {
      const place = this.linePlace(this.playerLine, 'player');
      const spot = place >= 0 ? this.playerLine.line[place] : null;
      if (!spot || flat(p, spot) > 1.4 || !this.open.has(this.playerLine)) {
        this.leaveLine(this.playerLine, 'player');
        this.playerLine = null;
      }
      return;
    }
    for (const stall of this.open) {
      if (stall === this.playerDone) continue;
      const lane = this.lines.get(stall) ?? [];
      const next = stall.line[lane.length];
      if (next && flat(p, next) < 0.6) {
        this.joinLine(stall, 'player');
        this.playerLine = stall;
        return;
      }
    }
  }

  /** Whether you stand in a line, and where you should stand in it (for the dev tools and the HUD). */
  get playerQueue(): { stall: Stall; place: number } | null {
    return this.playerLine ? { stall: this.playerLine, place: this.linePlace(this.playerLine, 'player') } : null;
  }

  // ---------------------------------------------------------------- one another
  /** Something going on that those near look at (a hop, a splash, someone pushed). */
  notice(at: THREE.Vector3, who: Resident | 'player'): void {
    this.events.push({ at: at.clone(), who, until: this.now + EVENT_LIFE });
  }

  /** Now and then two strolling near each other stop for a word. */
  private chats(): void {
    if (this.now < this.chatNext) return;
    this.chatNext = this.now + 1.2;
    const idle = this.residents.filter(
      (r) => !r.chat && !r.seat && !r.line && !r.far && !r.busy && r.want.lengthSq() < 1e-4 && r.block?.kind === 'about',
    );
    for (let i = 0; i < idle.length; i++) {
      for (let j = i + 1; j < idle.length; j++) {
        const a = idle[i];
        const b = idle[j];
        if (a.chat || b.chat || flat(a.pos, b.pos) > 2.6 || this.random() > 0.12) continue;
        const until = this.now + 6 + this.random() * 7;
        a.chat = { with: b, until };
        b.chat = { with: a, until };
      }
    }
  }

  /**
   * What each looks at (the user: at one another, not only at you): whoever they talk with, the keeper or
   * the customer at their counter, the feast's fire or its player, whatever goes on near them, whoever comes
   * up to them (you among them), and now and then whoever is near; or ahead of them.
   */
  private attend(f: LifeFrame): void {
    const players = f.myEyes;
    for (const r of this.residents) {
      if (r.ch === f.me) continue;
      if (r.far) {
        r.ch.watch(null);
        continue;
      }
      // Still on what they look at: follow it as it moves.
      if (this.now < r.focusUntil && r.focusing) {
        this.focusPoint(r, r.focusOn, f);
        r.ch.watch(r.focus);
        continue;
      }
      r.focusUntil = this.now + LOOK_FOR[0] + this.random() * (LOOK_FOR[1] - LOOK_FOR[0]);
      const pick = this.choose(r, f, players);
      r.focusOn = pick;
      r.focusing = pick !== null;
      if (pick !== null) this.focusPoint(r, pick, f);
      r.ch.watch(r.focusing ? r.focus : null);
    }
  }

  private choose(r: Resident, f: LifeFrame, players: THREE.Vector3): Resident | 'player' | 'fire' | null {
    // With you (talking, thanking you, answering you): on you, wherever you go.
    if (r.withPlayer) return 'player';
    if (r.chat) return r.chat.with;
    // At a counter: the keeper looks at whoever is at it, the customer at the keeper.
    if (r.block?.kind === 'work' && r.block.stall) {
      const first = this.lines.get(r.block.stall)?.[0];
      if (first) return first;
    }
    if (r.line) {
      const keeper = this.keepers.get(r.line);
      const k = keeper ? this.byId.get(keeper) : null;
      if (k && this.random() < 0.7) return k;
    }
    if (r.block?.kind === 'feast' && this.random() < 0.5) {
      const player = this.residents.find((o) => o.profile.feast === 'ukulele' && o.block?.kind === 'feast');
      return player && player !== r && this.random() < 0.6 ? player : 'fire';
    }
    // Whatever goes on near them.
    for (let i = this.events.length - 1; i >= 0; i--) {
      const e = this.events[i];
      if (e.until < this.now) {
        this.events.splice(i, 1);
        continue;
      }
      if (e.who !== r && flat(e.at, r.pos) < NOTICE * 1.3) return e.who;
    }
    // Whoever is near: you as anyone, more if you come up to them.
    const options: [Resident | 'player' | null, number][] = [[null, r.want.lengthSq() > 0.01 ? 4 : 1.6]];
    const toYou = flat(players, r.pos);
    if (toYou < NOTICE) {
      const coming = f.myWant.lengthSq() > 0.05 && f.myWant.x * (r.pos.x - f.me.position.x) + f.myWant.z * (r.pos.z - f.me.position.z) > 0;
      options.push(['player', (toYou < 3 ? 2.5 : 1) + (coming ? 2 : 0)]);
    }
    for (const o of this.residents) {
      if (o === r || o.far || !o.ch.shown) continue;
      const d = flat(o.pos, r.pos);
      if (d > NOTICE) continue;
      const pal = r.profile.with === o.id || o.profile.with === r.id;
      options.push([o, (pal ? 2 : 0.6) * (1 - d / (NOTICE * 1.2))]);
    }
    let total = 0;
    for (const [, w] of options) total += w;
    let pick = this.random() * total;
    for (const [who, w] of options) {
      pick -= w;
      if (pick <= 0) return who;
    }
    return null;
  }

  private focusPoint(r: Resident, on: Resident | 'player' | 'fire' | null, f: LifeFrame): void {
    if (on === 'player') r.focus.copy(f.myEyes);
    else if (on === 'fire') r.focus.copy(this.places.feast.fire).setY(this.places.feast.fire.y + 0.6);
    else if (on) {
      on.ch.getAnchor('eyeL', _eyes);
      on.ch.getAnchor('eyeR', _b);
      r.focus.copy(_eyes).add(_b).multiplyScalar(0.5);
    } else r.focusing = false;
  }

  /** Walkers step round whoever stands in their way, passing them on the right. */
  private avoid(me: Character): void {
    for (const r of this.residents) {
      const w = r.want;
      const speed = Math.hypot(w.x, w.z);
      // (In a stall's line they walk up behind whoever is ahead, not round them.)
      if (speed < 0.05 || r.far || r.ch === me || r.line) continue;
      const dx = w.x / speed;
      const dz = w.z / speed;
      let side = 0;
      const look = (p: THREE.Vector3, width: number) => {
        const ox = p.x - r.pos.x;
        const oz = p.z - r.pos.z;
        const d = Math.hypot(ox, oz);
        const reach = 0.9 + width;
        if (d < 1e-3 || d > reach) return;
        const ahead = (ox * dx + oz * dz) / d;
        if (ahead < 0.35) return;
        // To their right of whoever is ahead (their right being (-dz, dx)'s other side).
        const across = ox * -dz + oz * dx;
        side += (across >= 0 ? -1 : 1) * ahead * (1 - d / reach);
      };
      for (const o of this.residents) if (o !== r && !o.far && o.ch.shown) look(o.pos, o.ch.width * 0.5);
      look(me.position, me.width * 0.5);
      if (side === 0) continue;
      const s = Math.max(-1, Math.min(1, side));
      w.x += -dz * s * speed * 0.9;
      w.z += dx * s * speed * 0.9;
      const k = speed / Math.max(Math.hypot(w.x, w.z), 1e-6);
      w.x *= k;
      w.z *= k;
    }
  }

  /**
   * No one stands in anyone: two who come too near part, the one walking giving way; someone you keep
   * pushing into gives way to you slowly (not at once: the user, "not too easily pushed"), by their weight,
   * startled the first time; someone seated, at a counter, or in a round hut does not.
   */
  private push(f: LifeFrame): void {
    const me = f.me;
    const all = this.residents.filter((r) => !r.far && r.ch.shown && r.ch !== me);
    for (let i = 0; i < all.length; i++) {
      for (let j = i + 1; j < all.length; j++) this.part(all[i], all[j]);
    }
    const want = f.myWant;
    const pushing = Math.hypot(want.x, want.z);
    for (const r of all) {
      const reach = (me.width + r.ch.width) * APART;
      const d = flat(me.position, r.pos);
      if (d > reach + 0.15) {
        r.pressed = Math.max(0, r.pressed - f.dt * 2);
        continue;
      }
      const ox = (r.pos.x - me.position.x) / Math.max(d, 1e-4);
      const oz = (r.pos.z - me.position.z) / Math.max(d, 1e-4);
      const into = pushing > 0.3 ? (want.x * ox + want.z * oz) / pushing : 0;
      const firm = !!r.seat || !!r.ch.ride || r.block?.kind === 'work' || r.indoors;
      if (into > 0.5 && !firm) r.pressed += f.dt;
      else r.pressed = Math.max(0, r.pressed - f.dt * 2);
      if (r.pressed > PRESS) {
        // Pushed along the way you push, as fast as their weight lets.
        const step = (Math.min(pushing, 2) / 2) * (PUSH_SPEED / r.profile.weight) * f.dt;
        _from.set(r.pos.x, r.pos.y, r.pos.z);
        _to.set(r.pos.x + ox * step, r.pos.y, r.pos.z + oz * step);
        clampToWalkable(_to, _from);
        r.pos.x = _to.x;
        r.pos.z = _to.z;
        if (this.now - r.pushedAt > STARTLE_AGAIN) {
          this.notice(r.pos, r);
          r.ch.play('startled');
          this.emotes.spawn('exclaim', r.ch);
          r.focusOn = 'player';
          r.focusing = true;
          r.focusUntil = this.now + 2.5;
        }
        r.pushedAt = this.now;
      }
      // You never stand in them, pushing or not.
      this.keepOff(me, r.pos, reach);
    }
  }

  /** Two too near part: whoever walks gives way, or both a little. */
  private part(a: Resident, b: Resident): void {
    const reach = (a.ch.width + b.ch.width) * APART;
    const d = flat(a.pos, b.pos);
    if (d >= reach || Math.abs(a.pos.y - b.pos.y) > 0.8) return;
    const firmA = !!a.ch.ride || a.block?.kind === 'work';
    const firmB = !!b.ch.ride || b.block?.kind === 'work';
    if (firmA && firmB) return;
    const movingA = a.want.lengthSq() > 0.01;
    const movingB = b.want.lengthSq() > 0.01;
    // Who gives way: the one not firm; of two, the one walking; of two alike, both.
    let shareA = firmA ? 0 : firmB ? 1 : movingA && !movingB ? 1 : movingB && !movingA ? 0 : 0.5;
    const gap = reach - d;
    const ux = d > 1e-4 ? (a.pos.x - b.pos.x) / d : 1;
    const uz = d > 1e-4 ? (a.pos.z - b.pos.z) / d : 0;
    if (shareA > 0) this.shove(a, ux * gap * shareA, uz * gap * shareA);
    shareA = 1 - shareA;
    if (shareA > 0) this.shove(b, -ux * gap * shareA, -uz * gap * shareA);
  }

  private shove(r: Resident, dx: number, dz: number): void {
    _from.set(r.pos.x, r.pos.y, r.pos.z);
    _to.set(r.pos.x + dx, r.pos.y, r.pos.z + dz);
    clampToWalkable(_to, _from);
    r.pos.x = _to.x;
    r.pos.z = _to.z;
  }

  /** Keeps `ch` out of whoever stands at `at`: just short of touching, as far as the ground lets them. */
  private keepOff(ch: Character, at: THREE.Vector3, reach: number): void {
    const p = ch.position;
    const d = flat(p, at);
    if (d >= reach) return;
    const ux = d > 1e-4 ? (p.x - at.x) / d : -Math.sin(ch.facing);
    const uz = d > 1e-4 ? (p.z - at.z) / d : -Math.cos(ch.facing);
    _from.set(p.x, ch.feetY, p.z);
    _to.set(at.x + ux * reach, ch.feetY, at.z + uz * reach);
    clampToWalkable(_to, _from);
    p.x = _to.x;
    p.z = _to.z;
  }
}
