import * as THREE from 'three';
import type { Character } from '../characters/Character';
import { EMOTES, type ActionId } from '../characters/Actions';
import { t, type StringKey } from '../i18n/I18n';
import type { Input } from './Input';
import type { Hud, IconSpot, PouchView } from '../ui/Hud';
import { BITE, type HandView } from './HandView';
import { ITEMS, isItem, itemName, type ItemCopy, type ItemId } from '../life/Items';
import type { Thing, Things } from '../life/Things';
import type { Life } from '../life/Life';
import type { Resident } from '../life/Resident';
import type { Seat } from '../life/Places';
import { groundHeight, waterLevelAt } from '../world/Island';
import { glowUniforms } from '../world/Glow';
import type { Sound } from './Sound';

/**
 * What you do on the island with your paws (the user, 2026-10-22): pick up what lies about, hold it in
 * your right paw (seen out of your own eyes at the bottom right of the screen: see HandView), keep it in
 * your pouch of six, put it down where you look, give it to whoever you look at, eat or drink it, play the
 * ukulele; sit on whatever one sits on, and in your own bed at night sleep through to the morning (the
 * user: the bed skips the night). What you look at, near the middle of your view and within reach, is what
 * the action button does something with. From the きもち button you wave, bow, cheer, dance and the rest
 * (EMOTES), which those near answer.
 */

export const POUCH_SIZE = 6;
/** How far you reach from your eyes for what you look at (metres), and for a seat from your feet. */
const REACH = 2.1;
const SEAT_REACH = 1.9;
/** How near the middle of your view something must be to be what you look at (the angle's cosine). */
const AIM = Math.cos(0.38);
/** Where you put something down: where your view meets the ground, between these from your feet. */
const PUT_FAR = 1.9;
const PUT_NEAR = 0.35;
/** Bites to eat what you hold (or sips to drink it), one each BITE seconds. */
const BITES = 4;
/** From this hour to this, your bed is for sleeping through the night. */
const SLEEP_FROM = 19.5;
const SLEEP_TO = 5;

/** What you look at, that the action button would do something with. */
export type Target =
  | { kind: 'thing'; thing: Thing }
  | { kind: 'seat'; seat: Seat; bed: boolean }
  | { kind: 'resident'; r: Resident }
  | { kind: 'place'; at: THREE.Vector3 };

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
  /** In the forbidden cave, its torch in your paw. */
  inCave: boolean;
  /** The action button is the cave boat's this frame. */
  buttonTaken: boolean;
  /** How fast you walk (metres a second). */
  speed: number;
}

/** What a save keeps of your paws and pouch. */
export interface SavedPlay {
  hand: ItemId | null;
  pouch: (ItemId | null)[];
  bites: number;
}

const _fwd = new THREE.Vector3();
const _to = new THREE.Vector3();
const _p = new THREE.Vector3();
const _eyes = new THREE.Vector3();
const _flame = new THREE.Vector3(0, 0.3, 0);
const flat = (a: THREE.Vector3, b: THREE.Vector3) => Math.hypot(a.x - b.x, a.z - b.z);

export class Play {
  /** What is in your right paw, and in your pouch. */
  hand: ItemId | null = null;
  readonly pouch: (ItemId | null)[] = new Array<ItemId | null>(POUCH_SIZE).fill(null);
  /** Bites taken of what you hold (see BITES). */
  private bites = 0;
  /** Its copy in your paw, as others see it and the water mirrors it. */
  private handCopy: ItemCopy | null = null;
  /** Eating, drinking or playing what you hold, and for how long. */
  private using: { kind: 'eat' | 'drink' | 'play'; t: number } | null = null;
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
  /** Something changed that a save should keep. */
  changed = false;
  private label: string | null = null;
  /** In the forbidden cave, where your paw holds its torch instead (see Game.updateCave). */
  private inCave = false;
  /** Picked from the きもち panel, to do on the next frame (see emote). */
  private emoteQueued: ActionId | null = null;

  constructor(
    private readonly things: Things,
    private readonly life: Life,
    private readonly hud: Hud,
    private readonly view: HandView,
    private readonly input: Input,
    private readonly sound: Sound | null = null,
  ) {
    const places = life.places;
    this.seats = [...places.seats, ...places.feast.seats, ...places.homes.flatMap((h) => [...h.beds, ...h.seats])];
    this.bed = life.playerHome?.beds[0] ?? null;
    hud.onSlot = (slot) => this.swap(slot);
    hud.onEmote = (id) => (this.emoteQueued = id);
    life.onGiftBack = (item) => {
      this.receive(item);
      this.hud.toast(t('toast.given').replace('{0}', t(itemName(item))));
    };
    this.showPouch();
  }

  /** Whether you are playing what you hold (the ukulele). */
  get strumming(): boolean {
    return this.using?.kind === 'play';
  }

  /** Your paw before your eyes shown or not (not in a photo). */
  set viewShown(on: boolean) {
    this.view.group.visible = on && this.view.group.visible;
  }

  /** Whether `item` is in your paw or your pouch. */
  holds(item: ItemId): boolean {
    return this.hand === item || this.pouch.includes(item);
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
    const night = glowUniforms.uGlow.value > 0;
    // (Put out while a staged shot or the lineup has you elsewhere.)
    const lit = this.hand === 'torch' && night && !f.inCave && f.free;
    this.view.lit = lit;
    const flame = this.handCopy?.userData.flame;
    if (flame) flame.visible = lit;

    this.inCave = f.inCave;
    const walking = this.input.move.lengthSq() > 0.04;
    if (this.using) this.useOn(f, walking);
    if (this.seat && walking && f.free) this.standUp(me);

    // (In the cave your paw holds its torch: what you hold waits till you are out.)
    this.target = f.free && !this.sleeping && !f.inCave ? this.aim(f) : null;
    this.label = this.sleeping || !f.free ? null : this.labelFor(this.target);
    const use = this.hand ? ITEMS[this.hand].use : null;
    const useLabel = f.free && !this.sleeping && !f.inCave && use ? t(this.using ? 'hud.stop' : (`hud.${use}` as StringKey)) : null;
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
      this.swap(slot);
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
    const copy = this.handCopy;
    if (!copy || this.hand !== 'torch' || !copy.userData.flame?.visible) return null;
    copy.updateMatrixWorld(true);
    return out.copy(_flame).applyMatrix4(copy.matrixWorld);
  }

  /** Your paw before your eyes, after the camera has moved. */
  updateView(dt: number, camera: THREE.PerspectiveCamera, me: Character, on: boolean, speed: number): void {
    this.view.update(dt, camera, me, on && !this.sleeping && !this.inCave, speed);
  }

  // ---------------------------------------------------------------- what you hold
  /** Its copy in your paw as the world sees it, and before your eyes, as `hand` says. */
  private keepHand(me: Character): void {
    const id = this.hand;
    const has = this.handCopy?.userData.item ?? null;
    if (has !== id) {
      if (this.handCopy) {
        me.hold(null);
        this.things.release(this.handCopy);
        this.handCopy = null;
      }
      if (id) {
        this.handCopy = this.things.copyOf(id);
        me.hold(this.handCopy, !!ITEMS[id].flat);
      }
      this.view.set(id);
      this.showPouch();
    }
    const left = 1 - (this.bites / BITES) * 0.7;
    this.view.left = left;
    if (this.handCopy) this.handCopy.scale.setScalar(left);
  }

  /** Puts `id` in your paw, a fresh one (no bites taken). */
  private setHand(id: ItemId | null): void {
    if (this.using) this.using = null;
    this.hand = id;
    this.bites = 0;
    this.changed = true;
  }

  /** Something handed to you (by a stall, given back for a gift): into your paw if it is empty, else your
   * pouch; with both full, it is put down at your feet. */
  receive(item: ItemId, me: Character | null = null): void {
    if (!this.hand) this.setHand(item);
    else if (this.pouch.includes(null)) this.pouch[this.pouch.indexOf(null)] = item;
    else if (me) {
      const at = me.position;
      this.things.put(item, _p.set(at.x + Math.sin(me.facing) * 0.6, groundHeight(at.x, at.z, me.feetY), at.z + Math.cos(me.facing) * 0.6), me.facing);
    }
    this.changed = true;
    this.showPouch();
  }

  /** What is in pouch slot `slot` and what is in your paw change places. */
  swap(slot: number): void {
    if (slot < 0 || slot >= POUCH_SIZE || this.sleeping) return;
    const held = this.hand;
    // (What is half eaten goes into the pouch as it is, and comes out whole: the pouch keeps no bites.)
    this.setHand(this.pouch[slot]);
    this.pouch[slot] = held;
    this.sound?.pouch();
    this.showPouch();
  }

  private showPouch(): void {
    const models = this.things.models;
    const shown = (id: ItemId | null): PouchView['hand'] => {
      if (!id) return null;
      const [column, row] = models.iconAt(id);
      const icon: IconSpot = { column, row, columns: models.icons.columns, rows: models.icons.rows };
      return { name: t(itemName(id)), icon };
    };
    this.hud.setPouch({ hand: shown(this.hand), slots: this.pouch.map(shown) });
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
    } else {
      me.play('eat');
      this.view.play(use);
    }
  }

  private stopUsing(me: Character): void {
    this.using = null;
    if (me.actionId === 'eat' || me.actionId === 'ukulele') me.stopAction();
    if (this.seat) me.play('sit');
    this.view.play(null);
  }

  /** A frame of eating, drinking or playing: walking off stops it; the last bite finishes what you eat. */
  private useOn(f: PlayFrame, walking: boolean): void {
    const using = this.using;
    if (!using) return;
    if (walking || !f.free || f.inCave) {
      this.stopUsing(f.me);
      return;
    }
    const before = Math.floor(using.t / BITE);
    using.t += f.dt;
    if (using.kind === 'play') return;
    // A bite as each comes back from the mouth.
    if (Math.floor(using.t / BITE) > before) {
      this.bites++;
      if (using.kind === 'drink') this.sound?.sip();
      else this.sound?.bite();
      if (this.bites >= BITES) {
        this.stopUsing(f.me);
        this.setHand(null);
      }
      this.changed = true;
    }
  }

  // ---------------------------------------------------------------- what you look at
  private aim(f: PlayFrame): Target | null {
    const eye = f.camera.position;
    f.camera.getWorldDirection(_fwd);
    const me = f.me;
    let best: Target | null = null;
    let bestScore = Infinity;
    const consider = (p: THREE.Vector3, reach: number, target: Target, bias = 0, far = 0.12) => {
      _to.subVectors(p, eye);
      const d = _to.length();
      if (d > reach || d < 0.05) return;
      const cos = _to.dot(_fwd) / d;
      if (cos < AIM) return;
      const score = (1 - cos) * 10 + d * far + bias;
      if (score < bestScore) {
        bestScore = score;
        best = target;
      }
    };
    // Someone: the point of them nearest where you look, from their feet to the top of their head; of two
    // you look at, the nearer, who stands before the other.
    const level = _fwd.x * _fwd.x + _fwd.z * _fwd.z;
    for (const r of this.life.residents) {
      if (r.far || !r.ch.shown || r.ch === me) continue;
      const p = r.pos;
      const along = level > 1e-6 ? ((p.x - eye.x) * _fwd.x + (p.z - eye.z) * _fwd.z) / level : 0;
      const feet = r.ch.feetY;
      _eyes.set(p.x, THREE.MathUtils.clamp(eye.y + along * _fwd.y, feet + 0.1, feet + r.ch.height), p.z);
      consider(_eyes, REACH + 0.3, { kind: 'resident', r }, -0.15, 0.25);
    }
    for (const thing of this.things.list) {
      if (!thing.copy.visible) continue;
      consider(thing.copy.position, REACH, { kind: 'thing', thing });
    }
    if (!this.seat && !f.inCave) {
      for (const seat of this.seats) {
        if (seat.taken || flat(me.position, seat.at) > SEAT_REACH || Math.abs(seat.at.y - me.feetY) > 1.2) continue;
        consider(_p.copy(seat.at).setY(seat.at.y + 0.2), REACH + 0.6, { kind: 'seat', seat, bed: seat === this.bed }, 0.1);
      }
    }
    if (best) return best;
    if (this.hand && !this.seat && !f.inCave && !this.using) {
      const at = this.groundAhead(f);
      if (at) return { kind: 'place', at };
    }
    return null;
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
      case 'thing':
        return t('hud.pickUp');
      case 'resident':
        return this.hand ? t('hud.give') : t('hud.talk');
      case 'seat':
        return target.bed && this.night() ? t('hud.sleep') : t('hud.sit');
      case 'place':
        return t('hud.put');
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
      case 'thing':
        this.pickUp(target.thing);
        break;
      case 'resident':
        if (this.hand) this.give(target.r, me);
        else this.life.talk(target.r, me.position);
        break;
      case 'seat':
        if (target.bed && this.night()) this.sleep(target.seat, me);
        else this.sit(target.seat, me);
        break;
      case 'place':
        this.putDown(target.at, me);
        break;
    }
  }

  private pickUp(thing: Thing): void {
    if (this.hand && !this.pouch.includes(null)) {
      this.hud.toast(t('toast.full'));
      return;
    }
    const item = this.things.take(thing);
    if (!this.hand) this.setHand(item);
    else this.pouch[this.pouch.indexOf(null)] = item;
    this.view.play('reach');
    this.sound?.pickUp();
    this.hud.toast(t('toast.picked').replace('{0}', t(itemName(item))));
    this.changed = true;
    this.showPouch();
  }

  private putDown(at: THREE.Vector3, me: Character): void {
    const item = this.hand;
    if (!item) return;
    this.setHand(null);
    this.things.put(item, at, me.facing);
    this.sound?.putDown();
    this.changed = true;
  }

  private give(r: Resident, me: Character): void {
    const item = this.hand;
    if (!item) return;
    this.setHand(null);
    this.life.give(r, item, me.position);
    this.sound?.give();
    this.changed = true;
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
    return { hand: this.hand, pouch: [...this.pouch], bites: this.bites };
  }

  restore(saved: SavedPlay | undefined): void {
    if (!saved) return;
    this.hand = isItem(saved.hand) ? saved.hand : null;
    this.bites = this.hand ? Math.max(0, Math.min(BITES - 1, saved.bites | 0)) : 0;
    for (let i = 0; i < POUCH_SIZE; i++) this.pouch[i] = isItem(saved.pouch?.[i]) ? (saved.pouch[i] as ItemId) : null;
    this.showPouch();
  }
}
