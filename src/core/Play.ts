import * as THREE from 'three';
import type { Character } from '../characters/Character';
import { EMOTES, type ActionId } from '../characters/Actions';
import { has, t, type StringKey } from '../i18n/I18n';
import type { Input } from './Input';
import type { Hud, IconSpot, PouchThing } from '../ui/Hud';
import { BITE, type HandView } from './HandView';
import type { Focus } from './Focus';
import { ITEMS, itemName, type Carried, type ItemId } from '../life/Items';
import { Hands, SLOTS, type SavedHands } from '../life/Hands';
import { Things, type Thing } from '../life/Things';
import type { Life } from '../life/Life';
import type { Resident } from '../life/Resident';
import type { SirenTalk } from '../life/SirenTalk';
import type { ShimajiroTalk } from '../life/ShimajiroTalk';
import type { Seat, Stall } from '../life/Places';
import { groundHeight, waterLevelAt } from '../world/Island';
import type { Sound } from './Sound';

/**
 * What you do on the island with your paws (the user, 2026-10-22): pick up what lies about, hold it in
 * your right paw (seen out of your own eyes at the bottom right of the screen: see HandView), keep it in one
 * of seven boxes (each a stack of one kind, up to 99), the one in your paw chosen as in Minecraft (the user,
 * 2026-10-24: see Hands), put it down where you look, give it to whoever you look at, eat or drink it, play the
 * ukulele, read the book (よむ: up before your eyes and open, till you press again or walk off); sit on whatever one sits on, and in your own bed at night sleep through to the morning (the
 * user: the bed skips the night). What you look at, near the middle of your view and within reach, is what
 * the action button does something with. From the きもち button you wave, bow, cheer, dance and the rest
 * (EMOTES), which those near answer.
 *
 * Your paws are Hands, as everyone's who lives here are: what is someone else's you borrow (かりる), and it
 * goes back where it lay by the morning; what you put down is yours, which they may borrow in turn. And what
 * they do you may: behind a stall's counter no one keeps today you keep it (みせばん), handing its goods to
 * whoever lines up at it (わたす), till you walk off.
 *
 * What you look at is what is nearest the middle of your view within reach, kept while it is still before you
 * (see aim), and shown (see Focus): the pen draws it bolder in a warmer ink, a seat gets a ring, and where you
 * would put down what you hold lies a sketch of it.
 */

/** How far you reach from your eyes for what you look at (metres), and for a seat from your feet; a brand
 * burning in its stand, on top of a torch's stake, a little further. A stake is looked at anywhere from its foot
 * to the top of its flame, this far above where its brand sits (see stakePoint). */
const REACH = 2.1;
const STAND_REACH = 2.4;
/** A stall's counter (see Life.order) is looked at this far off at most, at this height over the ground in front
 * of it (about a counter's, VILLAGER_SCALE's 0.58). */
const BUY_REACH = 3.2;
const COUNTER_UP = 0.6;
const STAKE_FLAME = 0.3;
const SEAT_REACH = 1.9;
/** How near the middle of your view something must be to be what you look at (the angle's cosine), and how
 * far from the middle what you look at may drift before you have looked away from it (the user, 2026-10-23:
 * what you look at should be what is in the middle of your view, and stay so). */
const AIM = Math.cos(0.26);
const AIM_KEEP = Math.cos(0.34);
/** Of two things as near the middle of your view, the nearer: how much a metre further off counts against a
 * thing (radians off the middle). */
const NEAR = 0.012;
/** What you look at changes only for something this much nearer the middle of your view (radians). */
const SWITCH = 0.05;
/** Where you put something down: where your view meets the ground, between these from your feet. */
const PUT_FAR = 1.9;
const PUT_NEAR = 0.35;
/** From this hour to this, your bed is for sleeping through the night. */
const SLEEP_FROM = 19.5;
const SLEEP_TO = 5;

/** What you look at, that the action button would do something with. */
export type Target =
  | { kind: 'stall'; stall: Stall; serve: boolean }
  /** A stall's counter, its keeper behind it: to ask for what it sells (かう: see Life.order). */
  | { kind: 'buy'; stall: Stall }
  | { kind: 'thing'; thing: Thing }
  | { kind: 'seat'; seat: Seat; bed: boolean }
  | { kind: 'resident'; r: Resident }
  /** The Siren, on her ledge in the cave (see SirenTalk): her character. */
  | { kind: 'siren'; ch: Character }
  /** 島二郎, in his shop (see ShimajiroTalk): his character. */
  | { kind: 'shimajiro'; ch: Character }
  | { kind: 'place'; at: THREE.Vector3 }
  /** An empty stand (a village torch's pole) for the brand you hold (see Things' stands). */
  | { kind: 'stand'; home: string; at: THREE.Vector3; yaw: number };

/** What Play needs from the game each frame. */
export interface PlayFrame {
  dt: number;
  me: Character;
  camera: THREE.PerspectiveCamera;
  /** Out of your own eyes (else the follow camera, testing). */
  lookingOut: boolean;
  hours: number;
  /** Whether you can do anything now: not in a staged shot, the lineup or the free camera, not rowing. */
  free: boolean;
  /** Your camera held up (see CameraView): nothing looked at or done with your paws, the ▽ gone, what you were
   * using put by; a torch you hold still burns. */
  framing: boolean;
  /** In the forbidden cave, its torch in your paw. */
  inCave: boolean;
  /** The action button is the cave boat's this frame. */
  buttonTaken: boolean;
  /** How fast you walk (metres a second). */
  speed: number;
}

/** What a save keeps of your paws and pouch (a save from before your paws were Hands kept the things' names
 * only: see Hands.restore). */
export type SavedPlay = SavedHands;

const _fwd = new THREE.Vector3();
const _to = new THREE.Vector3();
const _p = new THREE.Vector3();
const _eyes = new THREE.Vector3();
const _stake = new THREE.Vector3();
const _flame = new THREE.Vector3(0, 0.3, 0);
const flat = (a: THREE.Vector3, b: THREE.Vector3) => Math.hypot(a.x - b.x, a.z - b.z);

export class Play {
  /** Your paw and pouch (see Hands). */
  readonly hands: Hands;
  /** Eating, drinking, playing, reading or holding up ready what you hold, and for how long. */
  private using: { kind: 'eat' | 'drink' | 'play' | 'read' | 'ready'; t: number } | null = null;
  /** The seat you sit on, if you do. */
  seat: Seat | null = null;
  private target: Target | null = null;
  /** Every seat there is (outside, at the feast, in the houses). */
  private readonly seats: Seat[];
  /** Your own bed. */
  private readonly bed: Seat | null;
  /** Asleep (the night going by: see onSleep). */
  sleeping = false;
  /** To sleep through the night: the game takes you to the morning. */
  onSleep: () => void = () => {};
  /** Talking with the Siren, once the game has her (see SirenTalk). */
  siren: SirenTalk | null = null;
  /** Talking with 島二郎, once the game has him (see ShimajiroTalk). */
  shimajiro: ShimajiroTalk | null = null;
  private label: string | null = null;
  /** Picked from the きもち panel, to do on the next frame (see emote). */
  private emoteQueued: ActionId | null = null;
  /** What your paw and pouch showed last (to show them again when they change). */
  private shownPouch = '';

  constructor(
    private readonly things: Things,
    private readonly life: Life,
    private readonly hud: Hud,
    private readonly view: HandView,
    private readonly focus: Focus,
    private readonly input: Input,
    me: Character,
    private readonly sound: Sound | null = null,
  ) {
    this.hands = new Hands('player', me, things);
    life.playerHands = this.hands;
    // あげる, chosen in a talk (see Resident.talk).
    life.giveTo = (r) => this.give(r, me);
    const places = life.places;
    this.seats = [...places.seats, ...places.feast.seats, ...places.homes.flatMap((h) => [...h.beds, ...h.seats])];
    this.bed = life.playerHome?.beds[0] ?? null;
    hud.onSlot = (slot) => this.choose(slot);
    hud.onStow = () => this.stow();
    hud.onMoveSlot = (from, to) => this.moveSlot(from, to);
    hud.onEmote = (id) => (this.emoteQueued = id);
    life.onGiftBack = (c) => {
      this.receive(c);
      this.hud.toast(t('toast.given').replace('{0}', t(itemName(c.item))));
    };
    life.onGivenBack = (c) => this.hud.toast(t('toast.givenBack').replace('{0}', t(itemName(c.item))));
    life.onGivenYou = (c, from) =>
      this.hud.toast(t('toast.givenYou').replace('{0}', life.nameOf(from.id)).replace('{1}', t(itemName(c.item))));
    life.onKeeping = (stall, keeping) => this.hud.toast(t(keeping ? 'toast.keeping' : 'toast.closed').replace('{0}', t(stall.label)));
    this.showPouch();
  }

  /** What is in your paw. */
  get hand(): ItemId | null {
    return this.hands.hand?.item ?? null;
  }

  /** Something changed that a save should keep. */
  get changed(): boolean {
    return this.hands.changed;
  }

  set changed(on: boolean) {
    this.hands.changed = on;
  }

  /** Whether you are playing what you hold (the ukulele). */
  get strumming(): boolean {
    return this.using?.kind === 'play';
  }

  /** Your paw before your eyes shown or not (not in a photo). */
  set viewShown(on: boolean) {
    this.view.group.visible = on && this.view.group.visible;
  }

  /** The label the action button would have (null: none), worked out by update. */
  get action(): string | null {
    return this.label;
  }

  /**
   * One frame: what you hold, in your paw and before your eyes; eating, drinking or playing it; getting up
   * when you walk off; what you look at, and the buttons for it.
   */
  update(f: PlayFrame): void {
    const me = f.me;
    this.keepHand(me);
    // A torch burns whenever it is held, day and night (the user, 2026-10-23); its light reaches what is round
    // it after dark and in the forbidden cave (see Firelight.setHeld, Game.updateCave). (Put out while a staged
    // shot or the lineup has you elsewhere.)
    const lit = this.hand === 'torch' && f.free;
    this.view.lit = lit;
    const flame = this.hands.copy?.userData.flame;
    if (flame) flame.visible = lit;

    const walking = this.input.move.lengthSq() > 0.04;
    if (this.using) this.useOn(f, walking);
    if (this.seat && walking && f.free) this.standUp(me);

    const able = f.free && !f.framing && !this.sleeping;
    this.target = able ? this.aim(f) : null;
    this.label = able ? this.labelFor(this.target) : null;
    // What you look at, shown: the ▽ over it, and the sketch of what you would put down (see Focus); through
    // your camera, nothing (not in the photo).
    const held = this.hands.hand ? { item: this.hands.hand.item, nibbled: this.hands.nibbled } : null;
    if (f.framing) this.focus.hide();
    else this.focus.update(f.dt, this.target, held, me);
    // (Not held up ready sitting down.)
    const use = this.hand && !(this.seat && ITEMS[this.hand].use === 'ready') ? ITEMS[this.hand].use : null;
    // (A book read is shut: とじる; a weapon held up ready, lowered: おろす.)
    const stop = this.using?.kind === 'read' ? 'hud.close' : this.using?.kind === 'ready' ? 'hud.lower' : 'hud.stop';
    const useLabel = able && use ? t(this.using ? stop : (`hud.${use}` as StringKey)) : null;
    this.hud.setUse(useLabel);
    if (!f.buttonTaken && this.input.consumeAction() && this.label) this.act(me);
    if (this.input.consumeUse() && useLabel) this.toggleUse(me);
    if (this.input.consumeEmotes()) this.hud.toggleEmotes();
    const slot = this.input.consumeSlot();
    // (With the きもち panel open, the keyboard's numbers pick from it.)
    if (slot >= 0 && this.hud.emotesOpen) {
      this.hud.closeEmotes();
      if (slot < EMOTES.length) this.emoteQueued = EMOTES[slot];
    } else if (slot >= 0) {
      this.choose(slot);
    }
    if (this.input.consumePouch()) this.hud.togglePouch();
    const emote = this.emoteQueued;
    this.emoteQueued = null;
    if (emote) this.emote(emote, f);
  }

  /**
   * Something you do yourself (see EMOTES), picked from the きもち panel: up off your seat or done eating
   * first, as no one waves sitting down here; those near see it and may answer (see Life.reacted). Nothing,
   * asleep or while you can do nothing else.
   */
  private emote(id: ActionId, f: PlayFrame): void {
    if (!f.free || this.sleeping) return;
    const me = f.me;
    if (this.using) this.stopUsing(me);
    if (this.seat) this.standUp(me);
    me.play(id);
    this.sound?.emote();
    this.life.reacted(id, me.position);
  }

  /** Where the torch you carry has its flame, while it burns (for its light: see Firelight.setHeld); else
   * null. */
  torchFlame(out: THREE.Vector3): THREE.Vector3 | null {
    const copy = this.hands.copy;
    if (!copy || this.hand !== 'torch' || !copy.userData.flame?.visible) return null;
    copy.updateMatrixWorld(true);
    return out.copy(_flame).applyMatrix4(copy.matrixWorld);
  }

  /** Your paw before your eyes, after the camera has moved. */
  updateView(dt: number, camera: THREE.PerspectiveCamera, me: Character, on: boolean, speed: number): void {
    this.view.update(dt, camera, me, on && !this.sleeping, speed);
  }

  // ---------------------------------------------------------------- what you hold
  /** Its copy in your paw as the world sees it (in whoever's paws you are), and before your eyes; the pouch
   * on the screen as it is. */
  private keepHand(me: Character): void {
    const hands = this.hands;
    hands.attach(me);
    hands.keep();
    // (The next of its kind lowered out of sight and raised as one is: see HandView.set.)
    this.view.set(this.hand, hands.hand);
    this.view.left = hands.left;
    // (Bitten into too, which its card says.)
    const shown = [`${hands.paw}:${hands.bites}`, ...hands.slots.map((s) => (s ? `${s[0].item}×${s.length}` : ''))].join(',');
    if (shown !== this.shownPouch) {
      this.shownPouch = shown;
      this.showPouch();
      // (What you were using gone from your paw, or something else in it now.)
      if (this.using && (!hands.hand || ITEMS[hands.hand.item].use !== this.using.kind)) this.stopUsing(me);
    }
  }

  /** Something handed to you (by a stall, given back for a gift): into a box, in your paw if it is empty (see
   * Hands.receive); with no room for it, it is put down at your feet, yours. */
  receive(c: Carried, me: Character | null = null): void {
    if (this.hands.receive(c)) return;
    if (!me) return;
    const at = me.position;
    c.owner ??= 'player';
    this.things.put(c, _p.set(at.x + Math.sin(me.facing) * 0.6, groundHeight(at.x, at.z, me.feetY), at.z + Math.cos(me.facing) * 0.6), me.facing);
  }

  /** Box `slot` tapped (or its number pressed): into your paw, as in Minecraft (the user, 2026-10-24); in your
   * paw already, your paw emptied (see stow). Nothing in the boxes moves. What you have bitten into goes into no
   * other box: it is gone, eaten up (the user, 2026-10-23). */
  choose(slot: number): void {
    if (this.sleeping || slot < 0 || slot >= SLOTS) return;
    if (slot === this.hands.paw) {
      this.stow();
      return;
    }
    if (this.using) this.stopUsing(this.hands.ch);
    const eaten = this.hands.nibbled ? this.hands.hand : null;
    this.hands.choose(slot);
    if (eaten) this.eatenUp(eaten);
    this.sound?.pouch();
  }

  /** Your paw emptied, its box put away (the box in your paw tapped again, or しまう); bitten into, what you held is
   * gone, eaten up, as when another box is chosen. */
  stow(): void {
    if (this.sleeping || this.hands.paw < 0) return;
    if (this.using) this.stopUsing(this.hands.ch);
    const eaten = this.hands.nibbled ? this.hands.hand : null;
    this.hands.stow();
    if (eaten) this.eatenUp(eaten);
    this.sound?.pouch();
  }

  /** Box `from`'s things dragged onto box `to` (see Hands.move): what is in your paw is whatever is in its box
   * now; bitten into and moved off, it is gone, eaten up. */
  moveSlot(from: number, to: number): void {
    if (this.sleeping) return;
    const paw = this.hands.paw;
    if (this.using && (from === paw || to === paw)) this.stopUsing(this.hands.ch);
    const eaten = this.hands.nibbled && (from === paw || to === paw) ? this.hands.hand : null;
    this.hands.move(from, to);
    if (eaten) this.eatenUp(eaten);
    this.sound?.pouch();
  }

  /** The boxes on the screen as they are: each one's things by name, icon and how many, and the one in your paw;
   * for their cards, what each is for, a line about it, and a word of its own on the one that is or would be in your
   * paw, its top (see noteOn). */
  private showPouch(): void {
    const models = this.things.models;
    const shown = (stack: Carried[] | null, nibbled = false): PouchThing | null => {
      const c = stack?.[stack.length - 1];
      if (!stack || !c) return null;
      const [column, row] = models.iconAt(c.item);
      const icon: IconSpot = { src: models.iconOf(c.item), column, row, columns: models.icons.columns, rows: models.icons.rows };
      const def = ITEMS[c.item];
      const kind = def.use ?? (def.light ? 'light' : 'keep');
      const about = `about.${c.item}`;
      return {
        name: t(itemName(c.item)),
        icon,
        count: stack.length,
        kind: t(`pouch.kind.${kind}` as StringKey),
        about: has(about) ? t(about) : null,
        note: this.noteOn(c, nibbled),
      };
    };
    const hands = this.hands;
    this.hud.setPouch({ slots: hands.slots.map((s, i) => shown(s, i === hands.paw && hands.nibbled)), paw: hands.paw });
  }

  /** A word of its own on a thing in your paws, for its card: bitten into; borrowed (whose it is); back to its place
   * each morning; or none. */
  private noteOn(c: Carried, nibbled: boolean): string | null {
    if (nibbled) return t('pouch.nibbled');
    if (c.lent && c.owner && c.owner !== 'player') return t('pouch.lent').replace('{0}', this.life.nameOf(c.owner));
    if (c.home) return t('pouch.home');
    return null;
  }

  /** Says that `c`, bitten into, is gone: eaten (or drunk) up. */
  private eatenUp(c: Carried): void {
    const drunk = ITEMS[c.item].use === 'drink';
    this.hud.toast(t(drunk ? 'toast.drankUp' : 'toast.ateUp').replace('{0}', t(itemName(c.item))));
  }

  // ---------------------------------------------------------------- eating, drinking, playing
  private toggleUse(me: Character): void {
    if (this.using) {
      this.stopUsing(me);
      return;
    }
    const use = this.hand ? ITEMS[this.hand].use : null;
    if (!use) return;
    this.using = { kind: use, t: 0 };
    if (use === 'play') {
      me.play('ukulele');
      this.view.play('play');
      this.life.performing(me.position, 'player');
    } else if (use === 'read') {
      // Up before your eyes and open (see HandView.read); seated, read sitting.
      me.play(this.seat ? 'readSeated' : 'read');
      this.view.read(true);
    } else if (use === 'ready') {
      // Up before you in both paws, pointing ahead (see HandView.ready); you may walk so.
      me.play('ready');
      this.view.ready(true);
    } else {
      me.play('eat');
      this.view.play(use);
    }
  }

  private stopUsing(me: Character): void {
    this.using = null;
    const act = me.actionId;
    if (act === 'eat' || act === 'ukulele' || act === 'read' || act === 'readSeated' || act === 'ready') me.stopAction();
    if (this.seat) me.play('sit');
    this.view.play(null);
    this.view.read(false);
    this.view.ready(false);
  }

  /** A frame of eating, drinking or playing: walking off stops it (not holding a weapon up ready, which you may walk
   * with); the last bite finishes what you eat. */
  private useOn(f: PlayFrame, walking: boolean): void {
    const using = this.using;
    if (!using) return;
    if ((walking && using.kind !== 'ready') || !f.free || f.framing) {
      this.stopUsing(f.me);
      return;
    }
    // (Held up ready: lowered as you sit or sleep; once anything else you did is over, up again.)
    if (using.kind === 'ready') {
      if (this.seat || this.sleeping) this.stopUsing(f.me);
      else if (!f.me.actionId) f.me.play('ready');
      return;
    }
    const before = Math.floor(using.t / BITE);
    using.t += f.dt;
    if (using.kind === 'play') {
      // Those near come to listen, now and then (see Life.performing).
      if (Math.floor(using.t / 8) > Math.floor((using.t - f.dt) / 8)) this.life.performing(f.me.position, 'player');
      return;
    }
    if (using.kind === 'read') return;
    // A bite as each comes back from the mouth.
    if (Math.floor(using.t / BITE) > before) {
      if (using.kind === 'drink') this.sound?.sip();
      else this.sound?.bite();
      if (this.hands.bite()) this.stopUsing(f.me);
    }
  }

  // ---------------------------------------------------------------- what you look at
  private aim(f: PlayFrame): Target | null {
    const eye = f.camera.position;
    f.camera.getWorldDirection(_fwd);
    const me = f.me;
    // Behind a stall's counter: keeping it (handing its goods to whoever is at it), or to keep it.
    const keeping = this.life.playerKeeps;
    const stall = keeping ?? (this.hand || this.seat ? null : this.life.stallBehind(me.position));
    if (keeping) return this.life.atCounter(keeping) ? { kind: 'stall', stall: keeping, serve: true } : null;
    if (stall) return { kind: 'stall', stall, serve: false };
    // What is nearest the middle of your view, within reach: by how far off the middle it is, the nearer of two
    // as near. What you looked at last frame is kept while it is still before you (AIM_KEEP), unless something
    // else is clearly nearer the middle (SWITCH), so what you look at does not flicker as you sway.
    let best: Target | null = null;
    let bestScore = Infinity;
    let kept: Target | null = null;
    let keptScore = Infinity;
    const consider = (p: THREE.Vector3, reach: number, target: Target, bias = 0) => {
      _to.subVectors(p, eye);
      const d = _to.length();
      if (d > reach || d < 0.05) return;
      const cos = _to.dot(_fwd) / d;
      const same = this.sameTarget(target);
      if (cos < (same ? AIM_KEEP : AIM)) return;
      const score = Math.acos(Math.min(1, cos)) + d * NEAR + bias;
      if (same) {
        kept = target;
        keptScore = score;
      }
      if (score < bestScore) {
        bestScore = score;
        best = target;
      }
    };
    // Someone: the point of them nearest where you look, from their feet to the top of their head.
    const level = _fwd.x * _fwd.x + _fwd.z * _fwd.z;
    for (const r of this.life.residents) {
      if (r.far || !r.ch.shown || r.ch === me) continue;
      const p = r.pos;
      const along = level > 1e-6 ? ((p.x - eye.x) * _fwd.x + (p.z - eye.z) * _fwd.z) / level : 0;
      const feet = r.ch.feetY;
      _eyes.set(p.x, THREE.MathUtils.clamp(eye.y + along * _fwd.y, feet + 0.1, feet + r.ch.height), p.z);
      consider(_eyes, REACH + 0.3, { kind: 'resident', r });
    }
    // An open stall's counter, its keeper behind it: anywhere between you and them at the counter's height.
    const shop = this.life.stallToOrder(me.position);
    if (shop) {
      _p.addVectors(shop.line[0], shop.keeper).multiplyScalar(0.5);
      _p.y = Math.max(shop.line[0].y, shop.keeper.y) + COUNTER_UP;
      consider(_p, BUY_REACH, { kind: 'buy', stall: shop });
    }
    // The Siren on her ledge, anywhere on her as anyone (calm: roused, she is no one to chat with), her tail's
    // bowl round her (about a metre) beyond your reach of anyone.
    const siren = this.siren?.siren;
    if (siren && siren.where === 'ledge' && siren.currentMood === 'calm' && siren.character.shown) {
      const sc = siren.character;
      const p = sc.position;
      const along = level > 1e-6 ? ((p.x - eye.x) * _fwd.x + (p.z - eye.z) * _fwd.z) / level : 0;
      _eyes.set(p.x, THREE.MathUtils.clamp(eye.y + along * _fwd.y, sc.feetY + 0.1, sc.feetY + sc.height), p.z);
      consider(_eyes, REACH + 1.3, { kind: 'siren', ch: sc });
    }
    // 島二郎 in his shop, anywhere on him as anyone, his belly round him beyond your reach of anyone.
    const owner = this.shimajiro?.shimajiro.character;
    if (owner && owner.shown) {
      const p = owner.position;
      const along = level > 1e-6 ? ((p.x - eye.x) * _fwd.x + (p.z - eye.z) * _fwd.z) / level : 0;
      _eyes.set(p.x, THREE.MathUtils.clamp(eye.y + along * _fwd.y, owner.feetY + 0.1, owner.feetY + owner.height), p.z);
      consider(_eyes, REACH + 0.6, { kind: 'shimajiro', ch: owner });
    }
    // A brand in its stand, and an empty stand for the brand you hold: anywhere on the stake, as someone is
    // anywhere on them (the user, 2026-10-23: looking at the pole found nothing, only its flame did).
    const stakePoint = (at: THREE.Vector3): THREE.Vector3 => {
      const along = level > 1e-6 ? ((at.x - eye.x) * _fwd.x + (at.z - eye.z) * _fwd.z) / level : 0;
      const foot = Math.min(groundHeight(at.x, at.z), at.y);
      return _stake.set(at.x, THREE.MathUtils.clamp(eye.y + along * _fwd.y, foot, at.y + STAKE_FLAME), at.z);
    };
    for (const thing of this.things.list) {
      if (!thing.shown) continue;
      if (thing.hidden) consider(stakePoint(thing.at), STAND_REACH, { kind: 'thing', thing });
      else consider(thing.seen ?? thing.grip, REACH, { kind: 'thing', thing });
    }
    // The brand you hold, back into its stand if it is empty.
    const brand = this.hands.hand;
    const stand = brand?.home ? this.things.homes.get(brand.home) : undefined;
    if (brand?.home && stand?.stand !== undefined && !this.things.list.some((t) => t.home === brand.home)) {
      consider(stakePoint(stand.at), STAND_REACH, { kind: 'stand', home: brand.home, at: stand.at, yaw: stand.yaw });
    }
    if (!this.seat && !f.inCave) {
      for (const seat of this.seats) {
        if (seat.taken || flat(me.position, seat.at) > SEAT_REACH || Math.abs(seat.at.y - me.feetY) > 1.2) continue;
        // (A thing lying on a seat before the seat.)
        consider(_p.copy(seat.at).setY(seat.at.y + 0.2), REACH + 0.6, { kind: 'seat', seat, bed: seat === this.bed }, 0.03);
      }
    }
    if (kept && bestScore > keptScore - SWITCH) return kept;
    if (best) return best;
    if (this.hand && !this.seat && !f.inCave && !this.using) {
      const at = this.groundAhead(f);
      if (at) return { kind: 'place', at };
    }
    return null;
  }

  /** Whether `target` is what you looked at last frame: the same thing, person or seat. */
  private sameTarget(target: Target): boolean {
    const was = this.target;
    if (!was) return false;
    switch (target.kind) {
      case 'thing':
        return was.kind === 'thing' && was.thing === target.thing;
      case 'resident':
        return was.kind === 'resident' && was.r === target.r;
      case 'siren':
        return was.kind === 'siren';
      case 'shimajiro':
        return was.kind === 'shimajiro';
      case 'seat':
        return was.kind === 'seat' && was.seat === target.seat;
      case 'stand':
        return was.kind === 'stand' && was.home === target.home;
      case 'buy':
        return was.kind === 'buy' && was.stall === target.stall;
      default:
        return false;
    }
  }

  /** Where your view meets the ground before you, within PUT_NEAR to PUT_FAR of your feet (not under water),
   * or null. */
  private groundAhead(f: PlayFrame): THREE.Vector3 | null {
    const eye = f.camera.position;
    const me = f.me;
    const feet = me.feetY;
    for (let d = 0.2; d < 3.2; d += 0.05) {
      _p.copy(eye).addScaledVector(_fwd, d);
      const h = groundHeight(_p.x, _p.z, feet + 0.3);
      if (_p.y > h) continue;
      const away = flat(_p, me.position);
      if (away > PUT_FAR || away < PUT_NEAR || Math.abs(h - feet) > 0.6 || h < waterLevelAt(_p.x, _p.z) + 0.02) return null;
      return new THREE.Vector3(_p.x, h, _p.z);
    }
    return null;
  }

  private labelFor(target: Target | null): string | null {
    if (!target) return this.seat ? t('hud.stand') : null;
    switch (target.kind) {
      case 'stall':
        return t(target.serve ? 'hud.serve' : 'hud.keepStall');
      case 'buy':
        return t('hud.buy');
      case 'thing':
        // Someone else's you borrow; one inside something (the cabinet: see Thing.seen) you take out.
        if (target.thing.owner && target.thing.owner !== 'player') return t('hud.borrow');
        return t(target.thing.seen ? 'hud.takeOut' : 'hud.pickUp');
      case 'resident':
        // Always はなす (the user, 2026-10-24: holding something, you could only give it): あげる is in the talk.
        return t('hud.talk');
      case 'siren':
      case 'shimajiro':
        return t('hud.talk');
      case 'seat':
        return target.bed && this.night() ? t('hud.sleep') : t('hud.sit');
      case 'place':
        // Bitten into, it is not put down but eaten (or drunk) up.
        if (this.hand && this.hands.nibbled) return t(ITEMS[this.hand].use === 'drink' ? 'hud.drinkUp' : 'hud.eatUp');
        return t('hud.put');
      case 'stand':
        return t('hud.putBack');
    }
  }

  private night(): boolean {
    const h = this.life.hours;
    return h >= SLEEP_FROM || h < SLEEP_TO;
  }

  /** The action button: does what the target asks. */
  private act(me: Character): void {
    const target = this.target;
    if (!target) {
      if (this.seat) this.standUp(me);
      return;
    }
    switch (target.kind) {
      case 'stall':
        if (target.serve) {
          this.life.handOver(target.stall);
          this.sound?.give();
        } else this.life.keepStall(target.stall);
        break;
      case 'buy':
        // In its line where you stand, its keeper answering you.
        if (this.life.order(target.stall)) {
          const keeper = this.life.keeperOf(target.stall);
          if (keeper) this.life.tell(keeper, this.life.line(keeper, 'order'));
        }
        break;
      case 'thing':
        this.pickUp(target.thing);
        break;
      case 'resident':
        this.life.talk(target.r, me.position);
        break;
      case 'siren':
        this.siren?.begin();
        break;
      case 'shimajiro':
        this.shimajiro?.begin();
        break;
      case 'seat':
        if (target.bed && this.night()) this.sleep(target.seat, me);
        else this.sit(target.seat, me);
        break;
      case 'place':
        this.putDown(target.at, me);
        break;
      case 'stand':
        // The brand back in its stand, burning there again (see Things' stands).
        if (this.using) this.stopUsing(me);
        this.hands.putDown(target.at, target.yaw);
        this.sound?.putDown();
        break;
    }
  }

  private pickUp(thing: Thing): void {
    if (this.using) this.stopUsing(this.hands.ch);
    const c = this.hands.pickUp(thing);
    if (!c) {
      if (!this.hands.fits(thing.item)) this.hud.toast(t('toast.full'));
      return;
    }
    this.view.play('reach');
    this.sound?.pickUp();
    const name = t(itemName(c.item));
    if (c.lent && c.owner && c.owner !== 'player') {
      this.hud.toast(t('toast.borrowed').replace('{0}', this.life.nameOf(c.owner)).replace('{1}', name));
      this.life.borrowedFrom(c, 'player');
    } else this.hud.toast(t(thing.seen ? 'toast.tookOut' : 'toast.picked').replace('{0}', name));
  }

  private putDown(at: THREE.Vector3, me: Character): void {
    const c = this.hands.hand;
    if (!c) return;
    if (this.hands.nibbled) {
      // Bitten into: eaten (or drunk) up, not put down (see Hands.putDown).
      if (this.using) this.stopUsing(me);
      this.hands.drop();
      this.eatenUp(c);
      return;
    }
    const back = Things.backWhereItLay(c, at);
    this.hands.putDown(at, me.facing);
    this.sound?.putDown();
    if (back) this.hud.toast(t('toast.returned').replace('{0}', t(itemName(c.item))));
  }

  private give(r: Resident, me: Character): void {
    // (Theirs, lent you (see Life.lend): given back, which they are glad of.)
    const theirs = this.hands.hand?.owner === r.id;
    const c = this.hands.give(r.hands);
    if (!c) {
      if (this.hands.hand) this.hud.toast(t('toast.noRoom').replace('{0}', this.life.nameOf(r.id)));
      return;
    }
    this.life.gave(r, c, me.position, 'player', theirs);
    this.sound?.give();
  }

  // ---------------------------------------------------------------- sitting and sleeping
  private sit(seat: Seat, me: Character): void {
    if (this.using) this.stopUsing(me);
    seat.taken = 'player';
    this.seat = seat;
    me.ride = { x: seat.at.x, y: seat.at.y, z: seat.at.z, yaw: seat.yaw };
    me.play('sit');
  }

  /** Up off your seat, onto your feet where one gets up from it. */
  standUp(me: Character): void {
    const seat = this.seat;
    if (!seat) return;
    this.seat = null;
    if (seat.taken === 'player') seat.taken = null;
    me.ride = null;
    if (me.actionId === 'sit' || me.actionId === 'doze') me.stopAction();
    // On whatever one stands on there, within a step of the seat's way up.
    me.teleport(seat.up.x, seat.up.z, seat.yaw, groundHeight(seat.up.x, seat.up.z, seat.up.y));
  }

  /** Into your bed, and through the night to the morning (the game does the night: onSleep). */
  private sleep(bed: Seat, me: Character): void {
    this.sit(bed, me);
    me.play('doze');
    this.sleeping = true;
    this.onSleep();
  }

  /** Morning: awake, sitting up in bed. */
  wake(me: Character): void {
    this.sleeping = false;
    if (this.seat) me.play('sit');
  }

  // ---------------------------------------------------------------- saving
  save(): SavedPlay {
    return this.hands.save();
  }

  restore(saved: SavedPlay | undefined): void {
    this.hands.restore(saved);
    this.showPouch();
  }
}
