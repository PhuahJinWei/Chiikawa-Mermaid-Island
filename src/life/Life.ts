import * as THREE from 'three';
import type { StringKey } from '../i18n/I18n';
import type { Character, FrameContext } from '../characters/Character';
import type { EmoteSystem } from '../characters/Emotes';
import type { Choice, DialogueBox, Spoken } from '../ui/DialogueBox';
import { faceOf } from '../ui/Faces';
import { clampToWalkable, standAt, terrainHeight, waterLevelAt } from '../world/Island';
import { Nav, type Avoid } from './Nav';
import { Places, type Home, type Seat, type Spot, type Stall } from './Places';
import { FRIENDS, HOMES, ISLANDER_HOMES, PROFILES, hash, islanderProfile, seeded, type Profile } from './profiles';
import { Resident, edible, type Answer, type Block, type Brain, type Memory } from './Resident';
import { ACTIONS, type ActionId } from '../characters/Actions';
import type { ExpressionId } from '../characters/types';
import { ITEMS, STALL_ITEM, carried, isItem, itemName, type Carried, type ItemId } from './Items';
import type { Hands, SavedHands } from './Hands';
import type { Things } from './Things';
import { Choices } from './Choices';
import { t } from '../i18n/I18n';
import { cueOf, linesOf } from './lines';

/** The name an islander lives under (see Life.create): islander01 lives with you. */
const islanderId = (i: number) => `islander${String(i + 1).padStart(2, '0')}`;

/**
 * Life on the island (the user's rules, 2026-10-22): everyone who lives on it goes about their own day, you
 * among them, not its middle. They sleep at home from midnight to morning (the islanders in the villagers'
 * houses, two to a house; the guests in the guest houses), go about the places they like doing what they
 * choose (see Choices), eat at the festival's stalls, five of which are kept open each day by islanders who
 * go to work at them while others line up before them, and gather at the night beach's feast before bed.
 * They look at one another (and at you as at anyone), keep out of one another's way and give way, slowly, to
 * someone who keeps pushing into them. Far from the camera they are moved without being drawn or worked out
 * in full.
 *
 * Whatever you can do they can (the user, 2026-10-23): everyone's paws are Hands (yours too), and the
 * things lying about (Things) are there for anyone to take up, put down, give, eat or play, borrowing what
 * is someone else's and giving it back.
 */

/** Out of sight past this far from the camera, and moved without being worked out in full past FAR; worked
 * out every other frame past MID. */
const HIDE = 85;
const FAR = 70;
const MID = 32;
/** How much of the ways being sought is worked out a frame (cells expanded; see Nav.work). */
const NAV_WORK = 700;
/** How many stalls are kept open each day (the user: 5), and the hour their keepers stop work and close them (the
 * user, 2026-10-24: 18:00; they had kept them till the feast, after 21:30): then out and about, to the feast with
 * everyone. Supper at the stalls is before then (see planFor). */
const OPEN_STALLS = 5;
const CLOSE_AT = 18;
/** How near two people come before one gives way, between their middles, as a share of their widths (as
 * Game's APART). */
const APART = 0.6;
/** Pushing into someone: how long before they give way (seconds), how fast they are pushed at most
 * (metres a second, for someone of weight 1), and how long before they are startled by it again. */
const PRESS = 0.4;
const PUSH_SPEED = 0.75;
const STARTLE_AGAIN = 4;
/**
 * Making way (see part): someone standing about steps aside once a walker has walked into them this long
 * (seconds), at most this fast (metres a second, for weight 1). Of two face to face, the one who gives way
 * steps aside for GIVE_WAY_STEP of GIVE_WAY_FOR (seconds), then stands aside. Held up this long, a walker
 * squeezes past (for at most SQUEEZE_FOR); held up by you, they ask you after ASK_AFTER (not again before
 * ASK_AGAIN) and seek a way round you.
 */
const MAKE_WAY = 0.4;
const STEP_ASIDE = 0.9;
const GIVE_WAY_FOR = 1.2;
const GIVE_WAY_STEP = 0.5;
const SQUEEZE_AFTER = 1.8;
const SQUEEZE_FOR = 4;
const ASK_AFTER = 0.6;
const ASK_AGAIN = 8;
/** Held up: walking at someone within this of straight at them (its cosine), going no faster than this share
 * of the pace they walk at. */
const HELD_UP = 0.2;
const GETTING_ON = 0.35;
/** A keeper within this of where they stand behind their counter stays put (metres). */
const KEEPER_POST = 0.6;
/** Seeking a way round those in it, those within this far count (metres). */
const AROUND = 6;
/** Standing about, out of the way: this far from either end of a doorway, and not walled in close on both
 * sides, this far out to each side, along any of these ways through; else a step out of it first, to the
 * nearest spot out of the way this far off (metres). */
const DOOR_CLEAR = 1.0;
const NARROW = 0.75;
const ACROSS: [number, number][] = [
  [1, 0],
  [0, 1],
  [Math.SQRT1_2, Math.SQRT1_2],
  [Math.SQRT1_2, -Math.SQRT1_2],
];
const OUT_OF_THE_WAY = [1.0, 1.6, 2.2];
/** Stepping round someone: within this of straight ahead (metres to either side), they pass them on the right,
 * and they keep to the side they chose this long (seconds). */
const DEAD_AHEAD = 0.25;
const PASS_KEEP = 1.2;
/** Who looks at whom: how far they notice others and what goes on; how long they keep looking. */
const NOTICE = 6.5;
const LOOK_FOR: [number, number] = [1.6, 4.2];
/** How long something that goes on is worth looking at (seconds). */
const EVENT_LIFE = 2.2;
/** Keepers take this long to serve someone at the counter (seconds, from, to). */
const SERVE: [number, number] = [2.5, 4.5];
/** Served at a counter, you join its line again only once you have been this far from it (metres). */
const SERVED_AWAY = 2.5;
/**
 * Asking for a stall's goods (the user, 2026-10-24: talking to its keeper had done nothing): かう on the action
 * button looking at its counter from within ORDER_FROM, or ちょうだい talking with its keeper at their place
 * (within KEEPER_AT of it), puts you in its line where you stand. So in it, you keep your place while within
 * ORDER_STAY of its counter, and are served there once first in it within ORDER_REACH of the counter (walking up
 * the line, you must stand at your place in it).
 */
const ORDER_FROM = 3;
const KEEPER_AT = 0.8;
const ORDER_STAY = 4.5;
const ORDER_REACH = 3;
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
/** What someone says to you goes into the text box (see boxed) if you are this near them (metres); further
 * off, over their head. In the box, it goes from it once you are this far from them (the user, 2026-10-24: walking
 * off ends a talk; you talk from about 2 m, and parting counts you gone past Resident's PART_AWAY, 3.5 m), which
 * is as good as またね: they part from you as you go (see Resident.partFrom). */
const BOX_NEAR = 3.5;
const BOX_AWAY = 4;
/** Whom you may ask after (the user, 2026-10-23, after the notebook's list of everyone went: anyone, the cast
 * too, says where they are), in this order. Someone this near you (metres) is just there. */
const SOUGHT = ['chiikawa', 'hachiware', 'usagi', 'momonga', 'kurimanju', 'rakko', 'shisa', 'furuhonya', 'hitoha', 'futaba'];
const SOUGHT_NEAR = 10;
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
/** Someone playing music: who hears it within this far may come to listen (and dance), as many as this
 * each time, each as likely as this. */
const LISTEN_FROM = 14;
const LISTENERS = 2;
const LISTEN_CHANCE = 0.35;
/** How fond someone grows of you (see befriend): for a gift (more for what they like), for something of
 * theirs given back, for being served at your stall, for a word (at most once an hour of the island's), for
 * answering what you do; less fond for being pushed. Two who live here: for a gift, and for a word together. */
const FOND = { gift: 0.12, back: 0.05, served: 0.04, talk: 0.02, answer: 0.01, pushed: -0.03, theirGift: 0.08, chat: 0.01, takenBack: -0.05 };
/** How fond one is to begin with: of you (whoever lives with you, more), of their friends (FRIENDS, whoever
 * they go about with), of whoever they live with, of anyone else. */
const FOND_START = { you: 0.2, youHome: 0.45, friend: 0.6, home: 0.5, anyone: 0.15 };
/** What they remember: so many things at most, the oldest forgotten first; a gift is spoken of for so many
 * days after. */
const MEMORIES = 6;
/** A heart over someone grown fonder of you (see heartFor): only within this far of you (metres), and not again
 * for this long (seconds) unless it is a whole heart more. */
const HEART_NEAR = 14;
const HEART_AGAIN = 8;
const REMEMBER_DAYS = 3;
/** Behind a stall's counter: you keep it within so far of its keeper's place, and leave it beyond so far. */
const KEEP_NEAR = 0.6;
const KEEP_LEAVE = 1.4;
/** Placed by the clock (see settle), no two stand nearer than this (metres). */
const SPACING = 1.5;
/**
 * The welcome on a new island, your first day (the film's arrival, `bay 5`): the islanders line the way up
 * the beach from the pier's foot toward the welcome arch, either side of it, in two rows, turned to it and
 * toward the pier: the rows' distances out from the way's middle (x, metres), from and to how far up the
 * beach (z), and how far apart along a row. The cast stand as the game has them (see Game's HOMES); any of
 * them further than WELCOME_FROM from the pier's foot (Furuhonya on the night beach) are not at it.
 */
const WELCOME_ROWS = { front: 4.3, back: 5.8, from: -1, to: -11, gap: 1.8 };
const PIER_FOOT = new THREE.Vector3(0, 0, 1);
const WELCOME_FROM = 20;
/** The welcome lasts till you come this far up the beach (z), or go this far from the pier's foot, or this
 * long (seconds of the island's life); then each goes off into their day within so long of the others. */
const WELCOME_PAST = -4.5;
const WELCOME_AWAY = 12;
const WELCOME_LAST = 100;
const WELCOME_SPREAD = 6;
/** At the welcome, a word over someone's head at most every so long (seconds), from someone this near you. */
const WELCOME_WORD_EVERY = 1.6;
const WELCOME_WORD_NEAR = 14;
/** No one says the same thing twice running: the last so many lines of a group are passed over (fewer for a
 * small group: see line). Talked with again within so long (seconds) is "again". */
const RECENT = 3;
const AGAIN_WITHIN = 150;

/** What `stall` hands over (see STALL_ITEM), or null. */
const STALL_GOODS = (stall: Stall): ItemId | null => STALL_ITEM[stall.goods] ?? null;

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
  /** Whether the Siren is out at sea in view (those near you speak of it). */
  sirenSeen: boolean;
}

/** What a save keeps of everyone who lives here: their paws and pouches, and how they are. */
export interface SavedResident {
  hands: SavedHands;
  needs?: { hunger: number; company: number; fun: number };
  tookOn?: number;
  gaveOn?: number;
  fond?: Record<string, number>;
  memories?: Memory[];
  greetedOn?: number;
  askedOn?: number;
  /** Where they stood (their feet: x, y, z) and which way they faced; the seat they sat on (by its place in
   * Life.allSeats, -1 none); whether they were inside their round hut. */
  at?: [number, number, number, number];
  seat?: number;
  indoors?: boolean;
}

/** How settle puts everyone: by the clock, where a save had them, or at the welcome. */
export type SettleFrom = 'clock' | 'saved' | 'welcome';

export class Life {
  readonly residents: Resident[] = [];
  private readonly byId = new Map<string, Resident>();
  /** When a heart last floated up over each (see heartFor). */
  private readonly heartAt = new Map<Resident, number>();
  private readonly byCharacter = new Map<Character, Resident>();
  /** Your house, where you sleep (see Game's bed). */
  readonly playerHome: Home | null;
  /** Your paws (see Play), once the game has made them. */
  playerHands: Hands | null = null;
  /** What each who lives here does next out and about (see Choices). */
  readonly choices: Choices;
  /** Seconds since life began, and the hour and day as it goes. */
  now = 0;
  hours = 0;
  day = 0;
  private lastHours = NaN;
  /** Today's open stalls and who keeps each (an id, or 'player'), the lines before them (you as 'player'). */
  private readonly keepers = new Map<Stall, string>();
  private readonly open = new Set<Stall>();
  private readonly lines = new Map<Stall, (Resident | 'player')[]>();
  /** What goes on that those near look at. */
  private readonly events: Event[] = [];
  private rng = seeded(1);
  private chatNext = 0;
  /** You at a stall's counter: served (what you got), or waiting; read by the game. */
  playerServed: Stall | null = null;
  private playerLine: Stall | null = null;
  /** Whether you are in that line because you asked for its goods (see ORDER_FROM), not by walking up it. */
  private playerOrdered = false;
  /** The stall you were last served at, till you have walked away from it (see SERVED_AWAY). */
  private playerDone: Stall | null = null;
  /** Something given back to you for what you gave (see GIFT_BACK), and something of yours given back to
   * you: read by the game. */
  onGiftBack: (c: Carried, from: Resident) => void = () => {};
  onGivenBack: (c: Carried, from: Resident) => void = () => {};
  /** Something given to you by someone who lives here: read by the game. */
  onGivenYou: (c: Carried, from: Resident) => void = () => {};
  private giftsBack: { item: ItemId; from: Resident; at: number }[] = [];
  /** Whoever plays music now (you or someone), where, till when: those near come to listen. */
  private readonly music = new Map<Resident | 'player', { at: THREE.Vector3; until: number }>();
  /** The stall you keep now (see keepStall), or null. */
  playerKeeps: Stall | null = null;
  /** Where a save had each of them (see restore), till settle puts them back there. */
  private readonly kept = new Map<Resident, Required<Pick<SavedResident, 'at' | 'seat' | 'indoors'>>>();
  /** Every seat there is, in the same order each time (the save's seats are their places in it). */
  private seatList: Seat[] | null = null;
  /** The welcome lasts till then (Life.now; -Infinity: none), and the next word of welcome may come then. */
  private welcomeUntil = -Infinity;
  private welcomeWordAt = 0;
  /** You took up keeping a stall, or left it: read by the game. */
  onKeeping: (stall: Stall, keeping: boolean) => void = () => {};
  /** The name of the place a point is in (the island's places, the cave), once the game gives it. */
  placeAt: (p: THREE.Vector3) => string = () => '';
  /** You were told where someone is: read by the game (a marker toward them a while). */
  onSought: (who: Character, name: string, face: string | null) => void = () => {};
  /** The text box what is said to you goes into, once the game gives it (see useBox). */
  private box: DialogueBox | null = null;
  /** Whether the Siren is out at sea in view this frame (see situation). */
  private sirenSeen = false;
  /** You hand what you hold to `r` (あげる in a talk: see Resident.talk), once the game gives it (Play.give). */
  giveTo: (r: Resident) => void = () => {};
  /** What is to be done at the start of the next frame, outside anyone's brain (see soon). */
  private readonly next: (() => void)[] = [];
  /** When Rakko's sword was last looked for (see swordOut). */
  private swordAt = 0;

  private constructor(
    readonly nav: Nav,
    readonly places: Places,
    private readonly emotes: EmoteSystem,
    /** The things lying about (see Things), for anyone to take up. */
    readonly things: Things,
  ) {
    this.playerHome = this.findHome(HOMES.player);
    // Yours is the house's first bed; whoever lives with you, the next.
    this.playerHome?.people.push('player');
    this.choices = new Choices(this);
  }

  /**
   * Life for `cast` (the named characters, by id, you among them) and `islanders` (everyone else who
   * lives on the island), on the island once it has loaded, with the `things` lying about it.
   */
  static async create(cast: ReadonlyMap<string, Character>, islanders: Character[], emotes: EmoteSystem, things: Things): Promise<Life> {
    const nav = new Nav();
    const places = await Places.load(nav);
    const life = new Life(nav, places, emotes, things);
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

  /** The name someone goes by in the game's words (you, an islander, one of the cast). */
  nameOf(id: string): string {
    if (id === 'player') return t('char.player');
    if (id.startsWith('islander')) return t('char.islander');
    return t(`char.${id}` as StringKey);
  }

  // ---------------------------------------------------------------- fondness and memories
  /** How fond `r` is of `of` (someone's id, or 'player' for you), 0 to 1: as they were to begin with (see
   * FOND_START) until something changed it. */
  fondness(r: Resident, of: string): number {
    const fond = r.fond.get(of);
    if (fond !== undefined) return fond;
    if (of === 'player') return r.home === this.playerHome ? FOND_START.youHome : FOND_START.you;
    const other = this.byId.get(of);
    if (FRIENDS[r.id]?.includes(of) || r.profile.with === of || other?.profile.with === r.id) return FOND_START.friend;
    if (r.home.people.includes(of)) return FOND_START.home;
    return FOND_START.anyone;
  }

  /** `r` grows fonder of `of` by `by` (or less fond, below 0); fonder of you, a heart floats up over them (see
   * heartFor). */
  befriend(r: Resident, of: string, by: number): void {
    const before = of === 'player' ? this.hearts(r) : 0;
    r.fond.set(of, Math.min(1, Math.max(0, this.fondness(r, of) + by)));
    if (of === 'player' && by > 0) this.heartFor(r, this.hearts(r) > before);
  }

  /**
   * `r` grown fonder of you: a heart floats up over them, there and then (the user, 2026-10-23: no notebook's
   * meter of hearts), and two, one each side, on reaching a whole heart more (`more`, see hearts). Not again
   * for a moment (HEART_AGAIN) unless it is a whole heart more; only near you, where you would see it.
   */
  private heartFor(r: Resident, more: boolean): void {
    const you = this.playerAt;
    if (!you || r.far || !r.ch.shown || flat(you, r.pos) > HEART_NEAR) return;
    if (!more && this.now - (this.heartAt.get(r) ?? -Infinity) < HEART_AGAIN) return;
    this.heartAt.set(r, this.now);
    this.emotes.spawn('heart', r.ch);
    if (more) this.emotes.spawn('heart', r.ch, -1);
  }

  /** `r` remembers `m` (the oldest forgotten past MEMORIES). */
  remember(r: Resident, m: Memory): void {
    r.memories.push(m);
    while (r.memories.length > MEMORIES) r.memories.shift();
  }

  /** How many hearts `r` has for you, 0 to 5: a whole heart more is two hearts floating up (see heartFor). */
  hearts(r: Resident): number {
    return Math.round(this.fondness(r, 'player') * 5);
  }

  /** What `r` says coming over to greet you (see Resident.greetYou). */
  greeting(r: Resident): string {
    return this.line(r, 'greet');
  }

  /**
   * What `r` says now from the lines of `group` (see lines.ts: in their own voice where they have one), never
   * one of the last RECENT they said from it (as many as the group has but one), so no one repeats
   * themselves; '' if the group has no lines.
   */
  line(r: Resident, group: string): string {
    const pool = linesOf(group, r.voices);
    if (pool.length === 0) return '';
    const recent = r.said.get(group) ?? [];
    const avoid = Math.min(RECENT, pool.length - 1);
    const lately = avoid > 0 ? recent.slice(-avoid) : [];
    // Nothing they have said already while talking with you (see talk), while there is anything else to say.
    let fresh = pool.filter((key) => !lately.includes(key) && !r.convo.has(key));
    if (fresh.length === 0) fresh = pool.filter((key) => !lately.includes(key));
    const key = fresh[Math.floor(this.random() * fresh.length)];
    recent.push(key);
    while (recent.length > RECENT) recent.shift();
    r.said.set(group, recent);
    r.convo.add(key);
    return t(key);
  }

  /** Whether `r` has anything in `group` they have not said yet while talking with you (see line). */
  private fresh(r: Resident, group: string): boolean {
    return linesOf(group, r.voices).some((key) => !r.convo.has(key));
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
    if (this.playerKeeps) this.leaveStall();
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
      blocks.push({ at: CLOSE_AT, kind: 'about' });
      blocks.push({ at: 19 + rng() * 1.6, kind: 'feast' });
    } else {
      blocks.push({ at: wake + 0.2, kind: 'about' });
      // Breakfast, lunch and supper at the stalls, if they feel like it (supper before they close at CLOSE_AT).
      for (const [from, to] of [
        [7.3, 8.6],
        [11.9, 13.0],
        [16.4, 17.2],
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

  /** The part of `r`'s day the hour has them in now (begun, or waiting on them parting from you). */
  dayPart(r: Resident): Block {
    return this.blockAt(r, this.hours);
  }

  /** The block of `r`'s day the hour falls in. */
  private blockAt(r: Resident, hours: number): Block {
    let found = r.plan[0];
    for (const b of r.plan) if (b.at <= hours) found = b;
    return found;
  }

  /**
   * Puts everyone where they belong and begins their day from there, `from`:
   * - `clock` (after a night's sleep, a staged shot): where the hour has them (see placeFor): in bed, at
   *   their stall, round the feast's fire, at one of their places, no two on top of each other;
   * - `saved` (loading a save, the island's clock as it was): where the save had them, sitting where they sat,
   *   in their round hut, their day taken up from there (see Resident.resume); anyone it has no place for, or
   *   whose place one cannot stand at now (the island since rebuilt), as the clock has them;
   * - `welcome` (a new island, your first day): the film's welcome (see WELCOME_ROWS), the cast where `cast`
   *   has them (x, z, facing), all turned to you, till you come up the beach (see update).
   */
  settle(hours: number, me: Character | null, from: SettleFrom = 'clock', cast: Record<string, [number, number, number]> = {}): void {
    this.hours = hours;
    this.lastHours = hours;
    this.planDay();
    for (const lane of this.lines.values()) lane.length = 0;
    this.open.clear();
    this.music.clear();
    for (const r of this.residents) r.stop();
    for (const s of this.places.feast.seats) s.taken = null;
    for (const h of this.places.homes) for (const s of [...h.beds, ...h.seats]) s.taken = null;
    for (const s of this.places.seats) s.taken = null;
    for (const thing of this.things.list) thing.sought = null;
    this.welcomeUntil = from === 'welcome' ? this.now + WELCOME_LAST : -Infinity;
    const placed: THREE.Vector3[] = [];
    const usedSeats = new Set<Seat>();
    const line = from === 'welcome' ? this.welcomeLine() : [];
    // Everyone placed first, the seats they are put on kept for them (see Resident.resume), so that no one's
    // day, begun, goes off to a seat someone after them is to be put on.
    const starts: { r: Resident; block: Block; welcome: number | null }[] = [];
    for (const r of this.residents) {
      r.stop();
      r.chat = null;
      r.served = false;
      r.line = null;
      r.neededAt = NaN;
      r.resume = null;
      r.welcoming = false;
      r.ch.setShown(true);
      if (r.ch === me) {
        this.kept.delete(r);
        continue;
      }
      const block = this.blockAt(r, hours);
      r.far = false;
      if (from === 'saved' && this.backWhereKept(r, placed)) {
        // (Set by backWhereKept.)
        const resume = r.resume as Resident['resume'];
        if (resume?.seat) resume.seat.taken = r;
        starts.push({ r, block, welcome: null });
        continue;
      }
      this.kept.delete(r);
      if (from === 'welcome') {
        const own = cast[r.id];
        let spot: { at: THREE.Vector3; yaw: number } | null = null;
        if (own) {
          const at = this.nearestStanding(_a.set(own[0], terrainHeight(own[0], own[1]), own[1]));
          if (at && flat(at, PIER_FOOT) < WELCOME_FROM) spot = { at, yaw: own[2] };
        } else if (r.id.startsWith('islander')) spot = line.shift() ?? null;
        if (spot) {
          r.place(spot.at, spot.yaw);
          placed.push(spot.at.clone());
          starts.push({ r, block, welcome: spot.yaw });
          continue;
        }
      }
      const { at, yaw, seat } = this.placeFor(r, block, placed, usedSeats);
      if (at) {
        r.place(at, yaw);
        placed.push(at.clone());
      }
      // Put by the feast's fire: sitting there, on that seat.
      if (seat) {
        seat.taken = r;
        r.resume = { seat, indoors: false };
      }
      starts.push({ r, block, welcome: null });
    }
    for (const { r, block, welcome } of starts) {
      if (welcome !== null) r.beginWelcome(block, welcome);
      else r.begin(block);
    }
  }

  /** Where the hour has `r` (see settle): beside their bed, at their door, behind their stall's counter, on a
   * seat by the feast's fire no one else was put on, on the festival's street, at one of their places looking
   * the way it looks out; no nearer anyone placed before them than SPACING where there is room. */
  private placeFor(
    r: Resident,
    block: Block,
    placed: THREE.Vector3[],
    usedSeats: Set<Seat>,
  ): { at: THREE.Vector3 | null; yaw: number; seat?: Seat } {
    const any = this.random() * Math.PI * 2;
    switch (block.kind) {
      case 'sleep':
      case 'home':
        return { at: r.bed?.up ?? r.home.door, yaw: r.bed?.yaw ?? any };
      case 'wake':
        return { at: this.spaced(r.home.door, placed), yaw: r.home.yaw };
      case 'work':
        return { at: block.stall?.keeper ?? null, yaw: block.stall?.yaw ?? any };
      case 'feast': {
        const free = this.places.feast.seats.filter((s) => !usedSeats.has(s));
        const seat = free[Math.floor(this.random() * free.length)];
        if (!seat) return { at: null, yaw: any };
        usedSeats.add(seat);
        return { at: seat.at, yaw: seat.yaw, seat };
      }
      case 'meal': {
        // Somewhere along the festival's street, on their way to a stall.
        const street = this.places.spots.get('street');
        return { at: street ? this.spaced(this.spotPoint(street), placed) : null, yaw: any };
      }
      default: {
        const ids = Object.keys(r.profile.spots);
        const spot = this.places.spots.get(ids[Math.floor(this.random() * ids.length)] as never);
        if (!spot) return { at: null, yaw: any };
        const yaw = Number.isNaN(spot.look) ? any : spot.look + (this.random() - 0.5) * 0.8;
        return { at: this.spaced(this.spotPoint(spot), placed), yaw };
      }
    }
  }

  /** `at`, or the nearest spot round it one can stand at, no nearer anyone in `placed` than SPACING. */
  private spaced(at: THREE.Vector3, placed: THREE.Vector3[]): THREE.Vector3 {
    const clear = (p: THREE.Vector3) => placed.every((q) => flat(p, q) >= SPACING || Math.abs(p.y - q.y) > 1.5);
    if (clear(at)) return at;
    for (const d of [0.9, 1.4, 2.0, 2.6]) {
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2 + d;
        const x = at.x + Math.cos(a) * d;
        const z = at.z + Math.sin(a) * d;
        const h = this.nav.standHeight(x, z, at.y);
        if (Number.isNaN(h) || Math.abs(h - at.y) > 0.5) continue;
        _b.set(x, h, z);
        if (clear(_b)) return _b.clone();
      }
    }
    return at;
  }

  /** Every seat there is (see seatList). */
  allSeats(): Seat[] {
    this.seatList ??= [...this.places.seats, ...this.places.feast.seats, ...this.places.homes.flatMap((h) => [...h.beds, ...h.seats])];
    return this.seatList;
  }

  /** `r` back where the save had them (see kept): on their seat, if it is still where it was; inside their
   * round hut; or where they stood, if one can stand there now (as walkers stand: the way-finding grid keeps
   * further from things than they do), or else just by it. False if none of these. */
  private backWhereKept(r: Resident, placed: THREE.Vector3[]): boolean {
    const k = this.kept.get(r);
    this.kept.delete(r);
    if (!k) return false;
    const [x, y, z, yaw] = k.at;
    const seat = k.seat >= 0 ? this.allSeats()[k.seat] : undefined;
    // Not a bed or seat in a house no longer theirs (who lives where can change: 2026-10-24): then where the
    // hour has them.
    if (seat && this.places.homes.some((h) => h !== r.home && (h.beds.includes(seat) || h.seats.includes(seat)))) return false;
    if (seat && Math.hypot(seat.at.x - x, seat.at.z - z) < 0.6 && Math.abs(seat.at.y - y) < 0.6) {
      r.place(seat.up, seat.yaw);
      r.resume = { seat, indoors: false };
      placed.push(seat.up.clone());
      return true;
    }
    if (k.indoors && r.home.kind === 'round') {
      r.place(r.home.door, r.home.yaw + Math.PI);
      r.resume = { seat: null, indoors: true };
      return true;
    }
    const h = standAt(x, z, y);
    const at = !Number.isNaN(h) && Math.abs(h - y) < 0.5 ? new THREE.Vector3(x, h, z) : this.nearestStanding(_b.set(x, y, z));
    if (!at || Math.abs(at.y - y) > 0.5) return false;
    r.place(at, yaw);
    placed.push(at);
    return true;
  }

  /** Where the islanders stand at the welcome (see WELCOME_ROWS): the front rows first, nearest the pier
   * first, each turned to the way up the beach and toward the pier; as many as there is ground for. */
  private welcomeLine(): { at: THREE.Vector3; yaw: number }[] {
    const { front, back, from, to, gap } = WELCOME_ROWS;
    const rows: { at: THREE.Vector3; yaw: number; order: number }[] = [];
    for (const [out, off] of [
      [front, 0],
      [back, gap / 2],
    ] as const) {
      for (let z = from - off, k = 0; z >= to; z -= gap, k++) {
        for (const side of [-1, 1]) {
          const x = side * out;
          const at = this.nearestStanding(_a.set(x, terrainHeight(x, z), z));
          if (!at) continue;
          rows.push({ at, yaw: Math.atan2(-at.x, 3), order: k * 2 + (out === back ? 1 : 0) });
        }
      }
    }
    return rows.sort((a, b) => a.order - b.order);
  }

  /** At the welcome, a word of welcome over `r`'s head (their own, or an islander's): when you have just come
   * up to them (`close`), or now and then if no one has said one just now; only near you. */
  welcomeWord(r: Resident, close: boolean): void {
    const you = this.playerAt;
    if (!you || flat(you, r.pos) > WELCOME_WORD_NEAR) return;
    if (!close && (this.now < this.welcomeWordAt || this.random() > 0.35)) return;
    this.welcomeWordAt = this.now + WELCOME_WORD_EVERY;
    this.say(r, this.line(r, 'welcome'));
  }

  // ---------------------------------------------------------------- things
  /** Everyone's paws: yours, then theirs. */
  allHands(): Hands[] {
    const all = this.residents.map((r) => r.hands);
    if (this.playerHands) all.unshift(this.playerHands);
    return all;
  }

  /**
   * Each morning (`day`, see Game.keepUp): what anyone borrowed and still has goes back where it lay (theirs
   * to its owner, in the night), and what has a place of its own (the stage's ukulele, a village torch, a
   * book) goes back to it from anyone's paws, yours too (the user, 2026-10-23: the island tidies up overnight;
   * what is yours to keep is what has no place of its own); then what lies about is seen to (see
   * Things.morning).
   */
  morning(day: number): void {
    // Rakko's sword back on his back from wherever it is (see lend).
    for (const thing of this.things.list.filter((x) => x.item === 'sword')) this.things.take(thing);
    for (const hands of this.allHands()) {
      for (const c of hands.all) {
        if (c.item === 'sword') {
          hands.remove(c);
          continue;
        }
        const home = c.home ? this.things.homes.get(c.home) : null;
        if (!c.lent && !home) continue;
        hands.remove(c);
        if (c.lent) {
          const [x, y, z, yaw] = c.lent;
          c.lent = null;
          this.things.put(c, _a.set(x, y, z), yaw);
        } else if (home) this.things.put(c, home.at, home.yaw);
      }
    }
    for (const r of this.residents) r.borrowed.clear();
    this.things.morning(day, (home) => this.allHands().some((h) => h.hasHome(home)));
  }

  /** After loading a save from before things kept where they belong: a thing of a kind that has a place of its
   * own (the torch by your door), nowhere else, held by someone as no one's, is that one again (else the
   * morning would make another at its place). Any place still empty, new since the save, gets its thing at once
   * (see Things.layHomes); and whatever anyone carries that things.json gives an owner is that owner's (see
   * Things.ownerOf). */
  adoptHomes(): void {
    const held = (key: string) => this.allHands().some((h) => h.hasHome(key));
    for (const hands of this.allHands()) for (const c of hands.all) c.owner = this.things.ownerOf(c);
    for (const [key, home] of this.things.homes) {
      if (this.things.list.some((t) => t.home === key) || held(key)) continue;
      for (const hands of this.allHands()) {
        const c = hands.all.find((x) => x.item === home.item && !x.home && !x.owner);
        if (c) {
          c.home = key;
          break;
        }
      }
    }
    this.things.layHomes(held);
  }

  /**
   * `c` is given to `to` (you, or someone who lives here) by `giver` standing at `from` (where they are as they
   * go): already in their paws (see Hands.give). Someone who lives here takes it and thanks them (see
   * Resident.thank); some give you something back for it (see GIFT_BACK). `back`: it was theirs, lent, and is
   * given back to them.
   */
  gave(to: Resident | 'player', c: Carried, from: THREE.Vector3, giver: string, back = false): void {
    const by = giver === 'player' ? null : this.byId.get(giver) ?? null;
    if (to === 'player') {
      if (!by) return;
      if (back) this.onGivenBack(c, by);
      else this.onGivenYou(c, by);
      return;
    }
    // Rakko's sword, lent (see lend) and given back: onto his back.
    if (back && c.item === 'sword') {
      to.hands.remove(c);
      this.swordAt = -Infinity;
    }
    to.interrupt(to.thank(c, from, giver, back));
    this.notice(to.pos, to);
    // Fonder of whoever gave it them, more for what they like; remembered.
    const liked = to.profile.likes?.[ITEMS[c.item].use ?? 'keep'] ?? 1;
    if (giver === 'player') this.befriend(to, 'player', back ? FOND.back : FOND.gift * Math.min(1.6, liked));
    else if (by) {
      this.befriend(to, giver, FOND.theirGift);
      this.befriend(by, to.id, FOND.theirGift * 0.5);
    }
    this.remember(to, { kind: back ? 'back' : 'gift', who: giver, item: c.item, day: this.day });
    const back4 = GIFT_BACK[to.id];
    if (giver === 'player' && !back && back4 && back4 !== c.item) this.giftsBack.push({ item: back4, from: to, at: this.now + GIFT_BACK_AFTER });
  }

  /** `r` took `c` up: something of someone else's they say they borrow (かりるね), and keep to give back. */
  took(r: Resident, c: Carried): void {
    this.notice(r.pos, r);
    this.choices.took();
    if (c.lent && c.owner) {
      r.borrowed.set(c, this.hours + this.day * 24);
      this.say(r, this.line(r, 'borrow.say'));
    }
  }

  /** You borrowed `c` (someone's who lives here): if they are near enough to see, they notice. */
  borrowedFrom(c: Carried, borrower: string): void {
    const owner = c.owner ? this.byId.get(c.owner) : null;
    const at = borrower === 'player' ? this.playerAt : this.byId.get(borrower)?.pos;
    if (!owner || !at || owner.far || flat(owner.pos, at) > NOTICE || owner.busy || owner.block?.kind === 'sleep') return;
    this.notice(at, borrower === 'player' ? 'player' : (this.byId.get(borrower) as Resident));
    if (borrower === 'player') this.tell(owner, this.line(owner, 'borrow.ok'));
    else this.say(owner, this.line(owner, 'borrow.ok'));
  }

  // ---------------------------------------------------------------- with you
  /** You talk with `r`, standing at `from`: they stop and say something like them, for the hour and what
   * they are doing (see lines.ts); asleep, they only sleep on. */
  talk(r: Resident, from: THREE.Vector3): void {
    if (r.block?.kind === 'sleep' && r.seat) {
      this.emotes.spawn('zzz', r.ch);
      return;
    }
    const again = this.now - r.talkedAt < AGAIN_WITHIN;
    if (this.now - r.talkedAt > 60) this.befriend(r, 'player', FOND.talk);
    r.talkedAt = this.now;
    r.convo.clear();
    r.interrupt(r.talk(from, this.lineText(r, again), this.sought(r)));
  }

  /** Whom you may ask `r` after (see SOUGHT): the cast, but them. */
  private sought(r: Resident): string[] {
    return SOUGHT.filter((id) => id !== r.id && this.byId.has(id));
  }

  /** Where `id` is, in words, as `asker` says it (asked by you: see Resident.talk; the user: where they are
   * now), and a marker toward them a while (see onSought): just there, at home (asleep), or in some place. */
  whereIs(id: string, asker: Resident): string {
    const r = this.byId.get(id);
    const name = this.nameOf(id);
    const say = (group: string, place = '') => this.line(asker, group).replace('{0}', name).replace('{1}', place);
    const place = r ? this.placeAt(r.pos) : '';
    if (!r || (!place && !this.atHome(r))) return say('talk.seek.unknown');
    this.onSought(r.ch, name, faceOf(id));
    const you = this.playerAt;
    if (r.block?.kind === 'sleep' && r.seat) return say('talk.seek.asleep');
    if (this.atHome(r)) return say('talk.seek.home');
    if (you && flat(r.pos, you) < SOUGHT_NEAR) return say('talk.seek.near');
    return say('talk.seek.at', place);
  }

  /** Whether `r` is in their own room (or anywhere indoors; a bed may be up off the room's floor). */
  private atHome(r: Resident): boolean {
    const room = r.home.room;
    return r.indoors || (!!room && flat(r.pos, room) < 3.4 && Math.abs(r.pos.y - room.y) < 1.5);
  }

  /**
   * What `r` says to you, talking (in their own voice: see line): now and then what they remember of you (a
   * gift lately), that you talked just now (`again`), or how fond of you they are; else, mostly, what is going
   * on (see situation: the Siren in view, you in the water, in their house, what you hold, what they are
   * doing), or the hour and your first day; else something of their own.
   */
  private lineText(r: Resident, again: boolean): string {
    const gift = this.lastGift(r);
    if (gift && this.random() < 0.4) return this.line(r, gift.group).replace('{0}', gift.name);
    if (again && this.random() < 0.6) return this.line(r, 'talk.again');
    if (this.fondness(r, 'player') >= 0.7 && this.random() < 0.3) return this.line(r, 'talk.fond');
    const going = this.situation(r);
    if (going && this.random() < 0.6) return this.line(r, going);
    const hour = this.hourGroup();
    const cast = !r.id.startsWith('islander');
    if (this.random() < (cast ? 0.4 : 0.5)) {
      if (this.day === 0 && this.random() < 0.5) return this.line(r, 'talk.firstDay');
      if (hour) return this.line(r, hour);
    }
    return this.line(r, 'talk.own');
  }

  /**
   * What `r` says next when you ask them to talk more (もっとはなす, the `turn`th time, from 1: see Resident.talk; the
   * user, 2026-10-24: more to hear without parting and talking again): never anything they have said yet in
   * this talk (see line), drifting from what goes on round them to their own talk, and warming to you (a gift
   * remembered, how fond of you they are) the longer you talk; null once they have nothing left to say.
   */
  moreLine(r: Resident, turn: number): string | null {
    const options: { weight: number; say: () => string }[] = [];
    const offer = (group: string, weight: number, fill: (s: string) => string = (s) => s) => {
      if (weight > 0 && this.fresh(r, group)) options.push({ weight, say: () => fill(this.line(r, group)) });
    };
    const gift = this.lastGift(r);
    if (gift) offer(gift.group, 2, (s) => s.replace('{0}', gift.name));
    offer('talk.fond', this.fondness(r, 'player') >= 0.45 ? 1 + 0.3 * turn : 0);
    const going = this.situation(r);
    if (going) offer(going, turn <= 2 ? 1 : 0.3);
    const hour = this.hourGroup();
    if (hour) offer(hour, 0.6);
    if (this.day === 0) offer('talk.firstDay', 0.6);
    offer('talk.own', 3);
    if (options.length === 0) return null;
    let roll = this.random() * options.reduce((sum, o) => sum + o.weight, 0);
    for (const o of options) if ((roll -= o.weight) <= 0) return o.say();
    return options[options.length - 1].say();
  }

  /** What `r` was last given by you within REMEMBER_DAYS, as the group of lines to speak of it with and its
   * name; null if nothing. */
  private lastGift(r: Resident): { group: string; name: string } | null {
    const gift = [...r.memories].reverse().find((m) => m.who === 'player' && m.kind === 'gift' && this.day - m.day <= REMEMBER_DAYS);
    if (!gift || !isItem(gift.item)) return null;
    const ate = edible({ item: gift.item, home: null, owner: null, lent: null });
    return { group: ate ? 'talk.remember.ate' : 'talk.remember.kept', name: t(itemName(gift.item)) };
  }

  /** The hour's group of lines (morning, evening, night), or null in the day. */
  private hourGroup(): string | null {
    const h = this.hours;
    return h >= 5 && h < 10 ? 'talk.morning' : h >= 17 && h < 20 ? 'talk.evening' : h >= 20 || h < 5 ? 'talk.night' : null;
  }

  /** What is going on that `r` might speak of to you, as a group of lines (the first that holds), or null:
   * the Siren in view out at sea, you standing in the water, you in their house, what you hold, what they
   * are doing (keeping a stall, in its line, holding something to eat or a torch, at the feast, farming). */
  private situation(r: Resident): string | null {
    const you = this.playerAt;
    if (this.sirenSeen) return 'talk.siren';
    if (you && terrainHeight(you.x, you.z) < waterLevelAt(you.x, you.z) - 0.05) return 'talk.wading';
    if (this.atHome(r)) return 'talk.indoors';
    const yours = this.playerHands?.hand ?? null;
    if (yours) {
      const def = ITEMS[yours.item];
      if (def.light) return 'talk.yours.torch';
      if (def.use === 'eat') return 'talk.yours.food';
      if (def.use === 'drink') return 'talk.yours.drink';
      if (def.use === 'read') return 'talk.yours.book';
      if (def.use === 'play') return 'talk.yours.ukulele';
      if (def.use === 'ready') return 'talk.yours.weapon';
      return 'talk.yours.keep';
    }
    const kind = r.block?.kind;
    if (kind === 'work') return 'talk.work';
    if (r.line) return 'talk.inLine';
    const theirs = r.hands.hand;
    if (theirs && ITEMS[theirs.item].light) return 'talk.holding.torch';
    if (theirs && edible(theirs)) return 'talk.holding.food';
    if (kind === 'feast') return 'talk.feast';
    const h = this.hours;
    if (r.profile.habits?.some((b) => b.spot === 'fields' && h >= b.from && h < b.to)) return 'talk.fields';
    return null;
  }

  /** What `r` says thanking you: for what you gave them (`got`), after eating it (`ate`), for keeping it. */
  thanks(r: Resident, kind: 'got' | 'ate' | 'kept'): string {
    return this.line(r, `thanks.${kind}`);
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
      this.befriend(r, 'player', FOND.answer);
      answered++;
    }
  }

  /** Those within `reach` of you at `at` who are free to answer you, the nearest first (see reacted, hopped). */
  private nearYou(at: THREE.Vector3, reach: number, but: Resident | null = null): Resident[] {
    return this.residents
      .filter(
        (r) =>
          r !== but &&
          !r.far &&
          r.ch.shown &&
          (!r.busy || r.parting) &&
          !r.line &&
          !r.chat &&
          r.block?.kind !== 'sleep' &&
          flat(r.pos, at) <= reach,
      )
      .sort((a, b) => flat(a.pos, at) - flat(b.pos, at));
  }

  /** Words over `r`'s head (see Resident.talk). */
  say(r: Resident, text: string): void {
    // (Not while they say something to you in the text box: their words over their head are hushed then, and the
    // box's line has the face.)
    if (this.box?.speaking(r)) return;
    const cue = cueOf(text);
    this.express(r, cue.face, SAID_FOR);
    this.emotes.say(r.ch, cue.text, SAID_FOR);
  }

  /** `r` makes `face` (a line's: see lines.ts cues) for `seconds`; nothing if none. */
  private express(r: Resident, face: ExpressionId | null, seconds: number): void {
    if (!face) return;
    r.ch.lineFace = face;
    r.faceUntil = this.now + seconds;
  }

  /** What is said to you goes into `box` (the HUD's text box), and whoever has words in it says nothing over
   * their head meanwhile (not the talking's own えっとね either). */
  useBox(box: DialogueBox): void {
    this.box = box;
    this.emotes.hush = (host) => box.speaking(this.residentOf(host as Character));
  }

  /** `r` says `text` to you (for you to answer with one of `choices`, if any): into the text box, their name
   * and face on it, if you are near them (BOX_NEAR), and the box's line returned, to wait on till read or answered (see
   * Resident.speak); else null, nothing said. */
  boxed(r: Resident, text: string, choices: readonly Choice[] = []): Spoken | null {
    const you = this.playerAt;
    if (!this.box || !you || r.far || flat(r.pos, you) > BOX_NEAR) return null;
    this.emotes.unsay(r.ch);
    return this.box.add(this.nameOf(r.id), cueOf(text).text, r, choices, faceOf(r.id));
  }

  // ---------------------------------------------------------------- lending, and taking back (the user, 2026-10-24)
  /** Does `then` at the start of the next frame: from inside someone's brain, what would stop it and give them a new
   * one (handing them something, which they thank you for: see gave), which a brain cannot do to itself. */
  soon(then: () => void): void {
    this.next.push(then);
  }

  /** Whether you hold something you could hand to someone (あげる: not what you have bitten into). */
  canGive(): boolean {
    return !!this.playerHands?.hand && !this.playerHands.nibbled;
  }

  /** Whether Rakko's sword is out of his keeping (in anyone's paws or pouch, or lying about: see lend). */
  private swordOut(): boolean {
    return this.allHands().some((h) => h.has('sword')) || this.things.list.some((x) => x.item === 'sword');
  }

  /**
   * What `r` would lend you if you asked (かして), if you have room for it; null if nothing: Kurimanju one of his
   * cans (he always has one more: his to give, not to lend); Rakko his sword, while it is on his back; anyone else
   * what is in their paw, or their own in their pouch, but what they eat or have bitten into, or have borrowed
   * themselves.
   */
  lendable(r: Resident): Carried | null {
    const room = (item: ItemId) => !!this.playerHands?.fits(item);
    if (r.id === 'kurimanju') return room('can') ? carried('can') : null;
    if (r.id === 'rakko' && !this.swordOut()) return room('sword') ? carried('sword', 'rakko') : null;
    const theirs = (c: Carried) => !edible(c) && !(c.lent && c.owner !== r.id) && room(c.item);
    const hand = r.hands.hand;
    if (hand && !r.hands.nibbled && theirs(hand)) return hand;
    return r.hands.all.find((c) => c !== hand && c.owner === r.id && theirs(c)) ?? null;
  }

  /** `r` lends you what they would (see lendable): into your paws, theirs still, back to their room overnight (a
   * thing with a place of its own, to that); false if nothing. */
  lend(r: Resident): boolean {
    const c = this.lendable(r);
    if (!c || !this.playerHands) return false;
    if (r.hands.all.includes(c)) r.hands.remove(c);
    if (c.item !== 'can') {
      c.owner = r.id;
      const room = r.home.room ?? r.pos;
      if (!c.home && c.item !== 'sword') c.lent = [room.x, room.y, room.z, 0];
    }
    if (!this.playerHands.receive(c)) return false;
    this.notice(r.pos, r);
    if (c.item === 'sword') this.swordAt = -Infinity;
    return true;
  }

  /** Something you gave `r` they still have (in their paw or pouch, not bitten into), the latest first; null if
   * nothing, or no room for it. */
  yourGift(r: Resident): Carried | null {
    if (!this.playerHands) return null;
    for (const m of [...r.memories].reverse()) {
      if (m.who !== 'player' || m.kind !== 'gift') continue;
      const c = r.hands.all.find((x) => x.item === m.item && !(x === r.hands.hand && r.hands.nibbled));
      if (c && this.playerHands.fits(c.item)) return c;
    }
    return null;
  }

  /** You take back what you gave `r` (かえして: see yourGift): yours again, and they a little less fond of you and
   * no longer thinking of it as your gift; false if nothing. */
  takeBack(r: Resident): boolean {
    const c = this.yourGift(r);
    if (!c || !this.playerHands) return false;
    r.hands.remove(c);
    c.owner = 'player';
    c.lent = null;
    if (!this.playerHands.receive(c)) {
      r.hands.receive(c);
      return false;
    }
    const i = r.memories.findIndex((m) => m.who === 'player' && m.kind === 'gift' && m.item === c.item);
    if (i >= 0) r.memories.splice(i, 1);
    this.befriend(r, 'player', FOND.takenBack);
    this.notice(r.pos, r);
    return true;
  }

  /** `id` as a choice in the text box: by their face if they have one (see Faces), else their name. */
  asChoice(id: string): Choice {
    return { text: this.nameOf(id), face: faceOf(id) };
  }

  /** `r` says `text` to you: in the text box if you are near them, else over their head (see boxed). */
  tell(r: Resident, text: string): void {
    const cue = cueOf(text);
    this.express(r, cue.face, SAID_FOR);
    if (!this.boxed(r, cue.text)) this.say(r, cue.text);
  }

  /** `s` (see boxed) out of the text box, read or not. */
  unbox(s: Spoken): void {
    this.box?.drop(s);
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

  /**
   * `who` (you, or someone who lives here) plays music at `at`, for a while yet (called every few seconds as
   * they play): those near who hear it and are free may come over to listen, dancing along if they like to.
   */
  performing(at: THREE.Vector3, who: Resident | 'player'): void {
    const fresh = !this.music.has(who);
    this.music.set(who, { at: at.clone(), until: this.now + 12 });
    if (who !== 'player') this.notice(at, who);
    if (!fresh && this.random() > 0.5) return;
    const playing = () => (this.music.get(who)?.until ?? 0) > this.now;
    let came = 0;
    for (const r of this.nearYou(at, LISTEN_FROM, who === 'player' ? null : who)) {
      if (came >= LISTENERS) break;
      if (r.seat || r.block?.kind === 'work' || r.block?.kind === 'meal' || r.hands.hand?.lent) continue;
      if (this.random() > LISTEN_CHANCE * (0.5 + r.needs.fun)) continue;
      r.interrupt(r.listen(at, playing));
      came++;
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
      this.onGiftBack(carried(g.item, 'player'), g.from);
    }
    for (const [who, m] of this.music) if (m.until < this.now) this.music.delete(who);
    this.hours = f.hours;
    this.sirenSeen = f.sirenSeen;
    for (const later of this.next.splice(0)) later();
    if (this.now - this.swordAt > 0.5) {
      this.swordAt = this.now;
      this.byId.get('rakko')?.ch.lendOwn(this.swordOut());
    }
    // A line's face, once the line is gone (see express).
    for (const r of this.residents) if (r.ch.lineFace && this.now > r.faceUntil) r.ch.lineFace = null;
    if (!Number.isNaN(this.lastHours) && f.hours < this.lastHours - 12) {
      // Past midnight: a new day, planned as it begins.
      this.day++;
      this.planDay();
    }
    this.lastHours = f.hours;
    const camera = f.camera.position;
    this.playerAt = f.me.position;
    // What is said to you by someone you have gone off from (or who went off), out of the text box.
    const you = this.playerAt;
    // (Only those who live here: the Siren's talk keeps its own distance, see SirenTalk.)
    this.box?.dropIf((who) => who instanceof Resident && (who.far || flat(who.pos, you) > BOX_AWAY));

    // The welcome over once you come up the beach (or go off elsewhere, or after a while): each goes off into
    // their day, one after another.
    if (this.welcomeUntil > -Infinity) {
      const p = f.me.position;
      if (this.now > this.welcomeUntil || p.z < WELCOME_PAST || flat(p, PIER_FOOT) > WELCOME_AWAY) {
        this.welcomeUntil = -Infinity;
        for (const r of this.residents) if (r.welcoming) r.leavesWelcome = this.now + this.random() * WELCOME_SPREAD;
      }
    }

    // Each into the block of their day the hour is in (once off from the welcome), and a frame of it.
    for (const r of this.residents) {
      if (r.ch === f.me) continue;
      const block = this.blockAt(r, f.hours);
      if (r.welcoming) {
        // (Not while they are with you, talking or asked something: they go once they have parted from you.)
        if (this.now >= r.leavesWelcome && !r.withPlayer) r.endWelcome(block);
        continue;
      }
      // (Not while they are with you: the hour's next part of their day waits till they have parted from you.)
      if (block !== r.block && !r.withPlayer) r.begin(block);
    }
    for (const r of this.residents) if (r.ch !== f.me) r.step(dt);
    // (About 1 to 4 ms on the dev PC: 2500 took up to 14, a dropped frame on a phone; a long way takes a few frames.)
    this.nav.work(NAV_WORK);
    this.chats();
    this.attend(f);
    this.avoid(f.me);

    // Everyone drawn and moved, as near the camera as they are, what they hold in their paws.
    for (const r of this.residents) {
      const ch = r.ch;
      if (ch === f.me) continue;
      r.hands.keep();
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

  /** `keeper` (someone's id, or 'player') behind `stall`'s counter: open, if it is theirs to keep today. */
  openStall(stall: Stall, keeper: string): void {
    if (this.keepers.get(stall) === keeper) this.open.add(stall);
  }

  closeStall(stall: Stall, keeper: string): void {
    if (this.keepers.get(stall) !== keeper) return;
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

  /** Whoever is at `stall`'s counter (first in its line, there), or null. */
  atCounter(stall: Stall): Resident | 'player' | null {
    const first = this.lines.get(stall)?.[0];
    if (!first) return null;
    const at = first === 'player' ? this.playerAt : first.pos;
    const near = first === 'player' && this.playerOrdered ? ORDER_REACH : 0.7;
    return at && flat(at, stall.line[0]) <= near ? first : null;
  }

  /** `stall`'s keeper hands its goods to whoever is at its counter, who leaves the line with them. Served by
   * you (see keepStall), they thank you, fonder of you, and remember it. You with no room in your paws for
   * them, the keeper says so (the user, 2026-10-23) and you step out of the line with nothing. */
  handOver(stall: Stall): void {
    const first = this.atCounter(stall);
    if (!first) return;
    const item = STALL_GOODS(stall);
    if (first === 'player' && item && this.playerHands && !this.playerHands.fits(item)) {
      const keeper = this.byId.get(this.keepers.get(stall) ?? '');
      if (keeper) this.tell(keeper, this.line(keeper, 'stall.handsFull'));
      this.playerDone = stall;
    } else if (first === 'player') {
      this.playerServed = stall;
      this.playerDone = stall;
    } else {
      first.served = true;
      if (this.keepers.get(stall) === 'player') {
        this.befriend(first, 'player', FOND.served);
        this.tell(first, this.thanks(first, 'got'));
        if (item) this.remember(first, { kind: 'served', who: 'player', item, day: this.day });
      }
    }
    this.leaveLine(stall, first);
  }

  /** The stall whose keeper's place you stand in, behind its counter, if no one else keeps it today. */
  stallBehind(at: THREE.Vector3): Stall | null {
    for (const s of this.places.stalls) {
      if (flat(at, s.keeper) > KEEP_NEAR || Math.abs(at.y - s.keeper.y) > 0.5) continue;
      const keeper = this.keepers.get(s);
      return keeper && keeper !== 'player' ? null : s;
    }
    return null;
  }

  /** You keep `stall` (no one else keeping it today): it opens, and whoever comes to eat may line up at it,
   * for you to hand them its goods (see handOver), till you walk off. */
  keepStall(stall: Stall): void {
    if (this.playerKeeps || (this.keepers.get(stall) ?? 'player') !== 'player') return;
    this.keepers.set(stall, 'player');
    this.open.add(stall);
    this.playerKeeps = stall;
    this.onKeeping(stall, true);
  }

  /** You walk off from the stall you keep: it closes. */
  private leaveStall(): void {
    const stall = this.playerKeeps;
    if (!stall) return;
    this.closeStall(stall, 'player');
    this.keepers.delete(stall);
    this.playerKeeps = null;
    this.onKeeping(stall, false);
  }

  /** The keeper's turn at the counter: waits for someone at its front, serves them after a moment. */
  *serve(stall: Stall, keeper: Resident): Brain {
    const first = this.atCounter(stall);
    if (!first) {
      yield;
      return;
    }
    const wait = SERVE[0] + this.random() * (SERVE[1] - SERVE[0]);
    keeper.ch.play('bow');
    for (let t = 0; t < wait; t += yield) {
      if (this.lines.get(stall)?.[0] !== first) return;
    }
    this.handOver(stall);
  }

  /** Where you stand (your feet), as the frame began. */
  playerAt: THREE.Vector3 | null = null;

  /** You in a stall's line: as you walk up to the end of an open one you join it; walking off, you leave it. */
  private lineUp(me: Character): void {
    this.playerAt = me.position;
    const p = me.position;
    if (this.playerKeeps && (flat(p, this.playerKeeps.keeper) > KEEP_LEAVE || Math.abs(p.y - this.playerKeeps.keeper.y) > 0.6)) this.leaveStall();
    // Served, you walk away before you line up there again.
    if (this.playerDone && flat(p, this.playerDone.line[0]) > SERVED_AWAY) this.playerDone = null;
    if (this.playerLine) {
      const place = this.linePlace(this.playerLine, 'player');
      const spot = place >= 0 ? this.playerLine.line[place] : null;
      // (Asked for, your place is kept near the counter; walked up to, at your place in the line.)
      const away = this.playerOrdered ? flat(p, this.playerLine.line[0]) > ORDER_STAY : !!spot && flat(p, spot) > 1.4;
      if (!spot || away || !this.open.has(this.playerLine)) {
        this.leaveLine(this.playerLine, 'player');
        this.playerLine = null;
        this.playerOrdered = false;
      }
      return;
    }
    for (const stall of this.open) {
      if (stall === this.playerDone || this.keepers.get(stall) === 'player') continue;
      const lane = this.lines.get(stall) ?? [];
      const next = stall.line[lane.length];
      if (next && flat(p, next) < 0.6) {
        this.joinLine(stall, 'player');
        this.playerLine = stall;
        return;
      }
    }
  }

  /** Who keeps `stall` today (not you), or null. */
  keeperOf(stall: Stall): Resident | null {
    return this.byId.get(this.keepers.get(stall) ?? '') ?? null;
  }

  /** The open stall `r` keeps today, if they stand at its keeper's place now (for ちょうだい: see Resident.talk). */
  keptBy(r: Resident): Stall | null {
    for (const [stall, id] of this.keepers) {
      if (id === r.id && this.open.has(stall) && flat(r.pos, stall.keeper) < KEEPER_AT) return stall;
    }
    return null;
  }

  /** The open stall whose counter you could ask at from `at` (かう: see ORDER_FROM): its keeper at their place,
   * you in no line of it already; the nearest, or null. */
  stallToOrder(at: THREE.Vector3): Stall | null {
    let best: Stall | null = null;
    let bestD = ORDER_FROM;
    for (const stall of this.open) {
      const keeper = this.byId.get(this.keepers.get(stall) ?? '');
      if (!keeper || this.keptBy(keeper) !== stall || this.playerLine === stall) continue;
      const d = flat(at, stall.line[0]);
      if (d < bestD) {
        bestD = d;
        best = stall;
      }
    }
    return best;
  }

  /**
   * You ask for `stall`'s goods (see ORDER_FROM): into its line where you stand, its keeper answering you, to be
   * served once you are first in it. With its line full, its keeper says so. Returns whether you are in it.
   */
  order(stall: Stall): boolean {
    const keeper = this.byId.get(this.keepers.get(stall) ?? '');
    if (!keeper || !this.open.has(stall)) return false;
    if (this.lineLength(stall) >= stall.line.length) {
      this.tell(keeper, this.line(keeper, 'order.full'));
      return false;
    }
    if (this.playerLine && this.playerLine !== stall) this.leaveLine(this.playerLine, 'player');
    this.joinLine(stall, 'player');
    this.playerLine = stall;
    this.playerOrdered = true;
    this.playerDone = null;
    return true;
  }

  /** Whether you stand in a line, and where you should stand in it (for the dev tools and the HUD). */
  get playerQueue(): { stall: Stall; place: number } | null {
    return this.playerLine ? { stall: this.playerLine, place: this.linePlace(this.playerLine, 'player') } : null;
  }

  // ---------------------------------------------------------------- one another
  /** Something going on that those near look at (a hop, a splash, someone pushed, something taken up). */
  notice(at: THREE.Vector3, who: Resident | 'player'): void {
    this.events.push({ at: at.clone(), who, until: this.now + EVENT_LIFE });
  }

  /** `a` and `b` stop for a word together (see Resident.visit). */
  chatWith(a: Resident, b: Resident): void {
    const until = this.now + 6 + this.random() * 7;
    a.chat = { with: b, until };
    b.chat = { with: a, until };
    this.befriend(a, b.id, FOND.chat);
    this.befriend(b, a.id, FOND.chat);
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
        this.chatWith(a, b);
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
      // Far off, or asleep (dozing in bed: the user, 2026-10-24): their eyes on nothing, their head at rest.
      const action = r.ch.actionId;
      if (r.far || (action !== null && ACTIONS[action].asleep)) {
        r.ch.watch(null);
        r.focusing = false;
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
    // With you (talking, thanking you, answering you), or welcoming you: on you, wherever you go.
    if (r.withPlayer || r.welcoming) return 'player';
    if (r.chat) return r.chat.with;
    // At a counter: the keeper looks at whoever is at it, the customer at the keeper.
    if (r.block?.kind === 'work' && r.block.stall) {
      const first = this.lines.get(r.block.stall)?.[0];
      if (first) return first;
    }
    if (r.line) {
      const keeper = this.keepers.get(r.line);
      const k = keeper === 'player' ? 'player' : keeper ? this.byId.get(keeper) : null;
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

  /** Walkers step round whoever stands in their way, passing them on the right; one giving way to someone
   * face to face steps aside and stands aside a moment instead (see faceToFace). */
  private avoid(me: Character): void {
    for (const r of this.residents) {
      const w = r.want;
      if (this.now < r.givingWay && r.ch !== me) {
        // Giving way to someone face to face: a step aside off their line, then standing aside (see faceToFace).
        if (r.givingWay - this.now > GIVE_WAY_FOR - GIVE_WAY_STEP) w.copy(r.wayAside);
        else w.set(0, 0, 0);
        continue;
      }
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
        // To their right of whoever is ahead (their right being (-dz, dx)'s other side); of someone straight
        // ahead (within DEAD_AHEAD to either side), on the right.
        const across = ox * -dz + oz * dx;
        side += (across >= DEAD_AHEAD || Math.abs(across) < DEAD_AHEAD ? -1 : 1) * ahead * (1 - d / reach);
      };
      for (const o of this.residents) if (o !== r && !o.far && o.ch.shown) look(o.pos, o.ch.width * 0.5);
      look(me.position, me.width * 0.5);
      if (side === 0) continue;
      // Keeping to the side they chose a moment (PASS_KEEP), not swaying from one to the other.
      if (this.now >= r.passingUntil) {
        r.passing = Math.sign(side);
        r.passingUntil = this.now + PASS_KEEP;
      }
      const s = r.passing * Math.min(1, Math.abs(side));
      w.x += -dz * s * speed * 0.9;
      w.z += dx * s * speed * 0.9;
      const k = speed / Math.max(Math.hypot(w.x, w.z), 1e-6);
      w.x *= k;
      w.z *= k;
    }
  }

  /**
   * No one stands in anyone, and no one is held up by anyone for long (the user, 2026-10-23: they push one
   * another too). Two who come too near part, the one walking giving way. Someone standing about whom a
   * walker keeps walking into makes way, stepping aside off their line as slowly as their weight lets, as when
   * you push them; of two walking into each other face to face, one gives way (see part). Held up all the same
   * (by someone seated or keeping their stall, in a crowd), a walker squeezes past (see heldUp).
   *
   * You never stand in them, and they never move you: someone you hold up asks you to let them by and seeks a
   * way round you. Someone you keep pushing into gives way to you slowly (not at once: the user, "not too
   * easily pushed"), by their weight, startled the first time; someone seated, keeping their stall at its
   * counter, or in a round hut does not.
   */
  private push(f: LifeFrame): void {
    const me = f.me;
    const all = this.residents.filter((r) => !r.far && r.ch.shown && r.ch !== me);
    for (const r of all) r.blocker = null;
    for (let i = 0; i < all.length; i++) {
      for (let j = i + 1; j < all.length; j++) this.part(all[i], all[j], f.dt);
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
      // (Not while they talk with you, thank or answer you: walking into them then only stops you.)
      if (into > 0.5 && !this.firm(r) && !r.withPlayer) r.pressed += f.dt;
      else r.pressed = Math.max(0, r.pressed - f.dt * 2);
      if (r.pressed > PRESS) {
        // Pushed along the way you push, as fast as their weight lets.
        const step = (Math.min(pushing, 2) / 2) * (PUSH_SPEED / r.profile.weight) * f.dt;
        this.shove(r, ox * step, oz * step);
        if (this.now - r.pushedAt > STARTLE_AGAIN) {
          this.befriend(r, 'player', FOND.pushed);
          this.notice(r.pos, r);
          r.ch.play('startled');
          this.emotes.spawn('exclaim', r.ch);
          r.focusOn = 'player';
          r.focusing = true;
          r.focusUntil = this.now + 2.5;
        }
        r.pushedAt = this.now;
      }
      const intoYou = into <= 0.5 && this.walksInto(r, me.position);
      if (!this.firm(r) && (intoYou || pushing < 0.3)) {
        // Walking into you, not you into them, or you standing still: they keep off you, held up by you if
        // they walk into you.
        if (intoYou && d < reach + 0.05) r.blocker = 'player';
        this.keepOff(r.ch, me.position, reach);
      } else {
        // You never stand in them, pushing or not.
        this.keepOff(me, r.pos, reach);
      }
    }
    for (const r of all) this.heldUp(r, f.dt);
  }

  /**
   * Two too near part: whoever walks gives way, or both a little; but not someone squeezing past the other.
   * Walking into someone standing about, they make way; walking into each other face to face, one gives way.
   * Whoever walks into someone is held up by them (see heldUp) till they are past.
   */
  private part(a: Resident, b: Resident, dt: number): void {
    const reach = (a.ch.width + b.ch.width) * APART;
    const d = flat(a.pos, b.pos);
    if (d >= reach + 0.05 || Math.abs(a.pos.y - b.pos.y) > 0.8) return;
    if (a.squeezing.has(b) || b.squeezing.has(a)) return;
    const intoB = this.walksInto(a, b.pos);
    const intoA = this.walksInto(b, a.pos);
    if (intoB && intoA) this.faceToFace(a, b);
    else if (intoB) this.makeWay(b, a, dt);
    else if (intoA) this.makeWay(a, b, dt);
    // (Held up by whoever they head for at all, as when wedged between two.)
    if (intoB || this.walksInto(a, b.pos, HELD_UP)) a.blocker = b;
    if (intoA || this.walksInto(b, a.pos, HELD_UP)) b.blocker = a;
    if (d >= reach) return;
    const firmA = this.firm(a);
    const firmB = this.firm(b);
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

  /** Whether `r` stays put for anyone: seated, in their round hut, or keeping their stall at its counter. */
  private firm(r: Resident): boolean {
    const stall = r.block?.kind === 'work' ? r.block.stall : undefined;
    return !!r.seat || !!r.ch.ride || r.indoors || (!!stall && flat(r.pos, stall.keeper) < KEEPER_POST);
  }

  /** Whether `r` walks toward `at`, more into it than past it (or within `cos` of straight at it). */
  private walksInto(r: Resident, at: THREE.Vector3, cos = 0.5): boolean {
    const w = r.want;
    const speed = Math.hypot(w.x, w.z);
    if (speed < 0.1) return false;
    const dx = at.x - r.pos.x;
    const dz = at.z - r.pos.z;
    const d = Math.hypot(dx, dz);
    return d > 1e-4 && (w.x * dx + w.z * dz) / (speed * d) > cos;
  }

  /**
   * `r`, standing about, walked into by `by`: after a moment (MAKE_WAY), a step aside off their line, as fast as
   * their weight lets (STEP_ASIDE), to whichever side there is room on, with a look round at who it is. Not
   * someone who stays put (see firm), in a stall's line or on their way somewhere themselves.
   */
  private makeWay(r: Resident, by: Resident, dt: number): void {
    if (this.firm(r) || r.line || r.want.lengthSq() > 0.01) return;
    if (this.now - r.crowdedAt > 0.1) r.crowded = 0;
    r.crowdedAt = this.now;
    r.crowded += dt;
    if (r.crowded < MAKE_WAY) return;
    const speed = Math.hypot(by.want.x, by.want.z);
    const nx = -by.want.z / speed;
    const nz = by.want.x / speed;
    const side = nx * (r.pos.x - by.pos.x) + nz * (r.pos.z - by.pos.z) >= 0 ? 1 : -1;
    const step = (STEP_ASIDE / r.profile.weight) * dt;
    if (this.shove(r, nx * side * step, nz * side * step) < step * 0.3) this.shove(r, -nx * side * step, -nz * side * step);
    if (r.focusOn !== by) {
      r.focusOn = by;
      r.focusing = true;
      r.focusUntil = this.now + 1.5;
    }
  }

  /** Two walking into each other face to face: one gives way, stepping aside off the other's line and
   * standing there a moment (GIVE_WAY_FOR, see avoid): the lighter, or of two alike the one whose name comes
   * first. */
  private faceToFace(a: Resident, b: Resident): void {
    if (this.now < a.givingWay || this.now < b.givingWay || this.firm(a) || this.firm(b)) return;
    const r = a.profile.weight !== b.profile.weight ? (a.profile.weight < b.profile.weight ? a : b) : a.id < b.id ? a : b;
    const other = r === a ? b : a;
    const speed = Math.hypot(r.want.x, r.want.z);
    let nx = -r.want.z / speed;
    let nz = r.want.x / speed;
    if (nx * (r.pos.x - other.pos.x) + nz * (r.pos.z - other.pos.z) < 0) {
      nx = -nx;
      nz = -nz;
    }
    r.wayAside.set(nx * speed * 0.7, 0, nz * speed * 0.7);
    r.givingWay = this.now + GIVE_WAY_FOR;
  }

  /**
   * How long `r` has been held up by whoever they walk into (see push) without getting anywhere, and what
   * comes of it: past SQUEEZE_AFTER they squeeze past them, the two of them a little squashed, the way kept open
   * between them till they are past (wedged in, past one after another); held up by you, they ask you to let
   * them by (ASK_AFTER) and seek a way round you.
   */
  private heldUp(r: Resident, dt: number): void {
    // How fast they get anywhere, back and forth cancelling out (as when they slide along someone and back).
    const k = 1 / Math.max(dt, 1e-4);
    r.drift.lerp(_b.set((r.pos.x - r.lastAt.x) * k, 0, (r.pos.z - r.lastAt.z) * k), 0.06);
    r.going = Math.hypot(r.drift.x, r.drift.z);
    r.lastAt.copy(r.pos);
    if (this.now > r.squeezeUntil) r.squeezing.clear();
    for (const past of r.squeezing) {
      if (flat(past.pos, r.pos) > (past.ch.width + r.ch.width) * APART + 0.15) r.squeezing.delete(past);
    }
    const by = r.blocker;
    if (!by || r.going > GETTING_ON * Math.hypot(r.want.x, r.want.z)) {
      r.blockedFor = 0;
      return;
    }
    r.blockedFor += dt;
    if (by === 'player') {
      if (r.blockedFor > ASK_AFTER && this.now - r.askedPassAt > ASK_AGAIN) {
        r.askedPassAt = this.now;
        this.say(r, this.line(r, 'pass'));
        r.focusOn = 'player';
        r.focusing = true;
        r.focusUntil = this.now + 2;
      }
      if (r.blockedFor > SQUEEZE_AFTER) {
        r.blockedFor = 0;
        r.reroute = true;
      }
      return;
    }
    if (r.blockedFor > SQUEEZE_AFTER && !r.squeezing.has(by)) {
      r.blockedFor = 0;
      r.squeezing.add(by);
      r.squeezeUntil = this.now + SQUEEZE_FOR;
      r.ch.jostle();
      by.ch.jostle();
    }
  }

  /** Moves `r` by (dx, dz) as far as the ground lets them; how far they went. */
  private shove(r: Resident, dx: number, dz: number): number {
    _from.set(r.pos.x, r.pos.y, r.pos.z);
    _to.set(r.pos.x + dx, r.pos.y, r.pos.z + dz);
    clampToWalkable(_to, _from);
    const moved = Math.hypot(_to.x - r.pos.x, _to.z - r.pos.z);
    r.pos.x = _to.x;
    r.pos.z = _to.z;
    return moved;
  }

  /** Those standing still in `r`'s way about them (or staying put, see firm), you among them, for seeking a
   * way round them (see Resident.walk). */
  inTheWayOf(r: Resident): Avoid[] {
    const out: Avoid[] = [];
    for (const o of this.residents) {
      if (o === r || o.far || !o.ch.shown || flat(o.pos, r.pos) > AROUND) continue;
      if (o.want.lengthSq() < 0.01 || this.firm(o)) out.push({ x: o.pos.x, z: o.pos.z, r: (o.ch.width + r.ch.width) * APART });
    }
    const you = this.playerAt;
    if (you && flat(you, r.pos) < AROUND) out.push({ x: you.x, z: you.z, r: 2 * r.ch.width * APART });
    return out;
  }

  /**
   * Where `r`, about to stand a while, steps to first if where they stand is in the way (see inTheWay): the
   * nearest spot round them that is not, which they can walk to straight and no one stands on; null if they
   * are out of the way already, or nowhere near is.
   */
  outOfTheWay(r: Resident): THREE.Vector3 | null {
    const p = r.pos;
    const feet = r.ch.feetY;
    if (!this.inTheWay(p.x, p.z, feet)) return null;
    const turn = this.random() * Math.PI * 2;
    _from.set(p.x, feet, p.z);
    for (const out of OUT_OF_THE_WAY) {
      for (let k = 0; k < 12; k++) {
        const a = turn + (k / 12) * Math.PI * 2;
        const x = p.x + Math.cos(a) * out;
        const z = p.z + Math.sin(a) * out;
        const y = standAt(x, z, feet, 0.1);
        if (Number.isNaN(y) || Math.abs(y - feet) > 0.3 || this.inTheWay(x, z, y)) continue;
        _to.set(x, y, z);
        if (this.residents.some((o) => o !== r && flat(o.pos, _to) < 0.9) || !this.nav.straight(_from, _to)) continue;
        return _to.clone();
      }
    }
    return null;
  }

  /** Whether standing at (x, z), feet at `feet`, is in the way: by a doorway or a stall's open side (see
   * Nav.addPortal), or walled in close on both sides along any way through (NARROW). */
  private inTheWay(x: number, z: number, feet: number): boolean {
    if (this.nav.nearDoor(_a.set(x, feet, z), DOOR_CLEAR)) return true;
    for (const [dx, dz] of ACROSS) {
      if (Number.isNaN(standAt(x + dx * NARROW, z + dz * NARROW, feet)) && Number.isNaN(standAt(x - dx * NARROW, z - dz * NARROW, feet))) {
        return true;
      }
    }
    return false;
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

  // ---------------------------------------------------------------- saving
  /** Everyone who lives here as a save keeps them: their paws, how they are. */
  save(): Record<string, SavedResident> {
    const out: Record<string, SavedResident> = {};
    for (const r of this.residents) {
      out[r.id] = {
        hands: r.hands.save(),
        needs: { ...r.needs },
        tookOn: r.tookOn,
        gaveOn: r.gaveOn,
        fond: Object.fromEntries(r.fond),
        memories: [...r.memories],
        greetedOn: r.greetedOn,
        askedOn: r.askedOn,
        ...this.whereNow(r),
      };
    }
    return out;
  }

  /** Where `r` is, for a save: their feet and facing, the seat they sit on (a seat by the feast's fire they
   * sit at too), whether they are inside their round hut. */
  private whereNow(r: Resident): Required<Pick<SavedResident, 'at' | 'seat' | 'indoors'>> {
    const feet = r.feet(_a);
    const seat = r.seat ?? this.places.feast.seats.find((s) => s.taken === r && flat(s.at, r.pos) < 0.3) ?? null;
    return {
      at: [feet.x, feet.y, feet.z, r.ch.facing],
      seat: seat ? this.allSeats().indexOf(seat) : -1,
      indoors: r.indoors,
    };
  }

  restore(saved: Record<string, SavedResident> | undefined): void {
    if (!saved) return;
    for (const r of this.residents) {
      const s = saved[r.id];
      if (!s) continue;
      // Where they were, for settle to put them back (see backWhereKept).
      if (Array.isArray(s.at) && s.at.length === 4 && s.at.every(Number.isFinite)) {
        this.kept.set(r, { at: s.at, seat: Number.isInteger(s.seat) ? (s.seat as number) : -1, indoors: !!s.indoors });
      }
      r.hands.restore(s.hands);
      if (s.needs) for (const k of ['hunger', 'company', 'fun'] as const) if (Number.isFinite(s.needs[k])) r.needs[k] = Math.min(1, Math.max(0, s.needs[k]));
      r.tookOn = s.tookOn ?? -1;
      r.gaveOn = s.gaveOn ?? -1;
      r.greetedOn = s.greetedOn ?? -1;
      r.askedOn = s.askedOn ?? -1;
      r.fond.clear();
      for (const [of, v] of Object.entries(s.fond ?? {})) if (Number.isFinite(v)) r.fond.set(of, Math.min(1, Math.max(0, v)));
      r.memories.length = 0;
      for (const m of s.memories ?? []) if (m && isItem(m.item) && typeof m.who === 'string') r.memories.push({ ...m });
      // What they borrowed, as borrowed now (to give back in time).
      for (const c of r.hands.all) if (c.lent) r.borrowed.set(c, this.hours + this.day * 24);
    }
  }
}
