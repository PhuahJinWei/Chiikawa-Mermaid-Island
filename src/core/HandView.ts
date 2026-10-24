import * as THREE from 'three';
import type { Character } from '../characters/Character';
import type { ActionId } from '../characters/Actions';
import { showOpen } from '../characters/Props';
import { ITEMS, type ItemCopy, type ItemId, type ItemModels } from '../life/Items';
import { stepLength } from './FirstPersonCamera';

/**
 * What you hold, seen out of your own eyes (the user, 2026-10-22: in the right paw, at the bottom right of
 * the screen, as Minecraft shows it): your paw, the islanders' round grey-mauve stub, coming up from the
 * screen's corner round what it holds, swaying with your steps and lagging a little as you turn; lowered
 * out of sight and up again with the next thing; up to your mouth as you eat or drink, a bite at a time;
 * strummed, a ukulele; a book brought up before your eyes and opened, your other paw coming up to hold it
 * too, the spread filling most of your view (see read). As you wave, cheer or dance (the きもち button), it
 * does so too, up into view even when empty (GESTURES). Otherwise nothing shows while your paw is empty.
 *
 * It is drawn by the game's camera alone (HAND_LAYER), in the scene's own pass, so the island's lights light
 * it as your paw is lit (Character.lightHeld); always in front of the world, never in it (VIEW_DEPTH),
 * however near a wall you stand; and marked as the cast are, so the film look's passes leave it as drawn
 * (see createHeld). It keeps its size on the screen whatever the lens.
 */

/** The layer only the game's camera draws. */
export const HAND_LAYER = 5;
/** Drawn in this front share of the depth range, before anything in the world (whose nearest, at the
 * camera's near plane, is 0 and grows fast): so it never goes into a wall you stand against. */
const VIEW_DEPTH = 0.02;
/** How far before the eyes it is held (metres). */
const AHEAD = 0.45;
/** Its size, as a share of the screen's shorter side for a thing's own metre; and where its grip is, in from
 * the screen's right edge and up from its bottom, as far as so many metres of a thing at that size: so the
 * paw under it always reaches up from the corner, whatever the screen's shape. */
const SIZE = 2.6;
const GRIP_IN = 0.24;
const GRIP_UP = 0.2;
/** On a screen held upright, the boxes' bar along the foot and the jump button over it take the bottom right
 * corner (see styles.css): the grip is lifted this much more (a share of the view's half height), so what you
 * hold shows over them (the user, 2026-10-24: the jump button had hidden it). */
const UPRIGHT_LIFT = 0.24;
/** Seconds to lower it out of sight, or to raise it. */
const LOWER = 0.22;
/** A step's sway (metres, at its own size). Its strides are your eyes' (two steps: see
 * FirstPersonCamera.stepLength), longer as you run and sprint, so it sways in step with them. */
const BOB = 0.012;
/** How far it lags as you turn (metres, at its own size, for a radian a second) and how quickly it catches
 * up. */
const LAG = 0.02;
const LAG_EASE = 10;
/** How long a bite takes, up to the mouth and back, and reaching out to take or put something (seconds). */
export const BITE = 2.4;
const REACH = 0.45;

/** What it is doing (see play). */
export type HandMotion = 'eat' | 'drink' | 'play' | 'reach' | null;

/** How your paw moves as you do something (see Character.play), after the action's own right arm
 * (Actions.ts): raised by `raise` (1, up as in a wave; below 0, lowered), in toward the middle of the screen
 * by `across`, and turned by `roll` (radians, its top toward the middle). */
interface Gesture {
  raise: number;
  across: number;
  roll: number;
}
const TAU = Math.PI * 2;
const smooth = (x: number) => {
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
};
const GESTURES: Partial<Record<ActionId, (t: number, g: Gesture) => void>> = {
  wave(t, g) {
    const up = smooth(t / 0.25) * (1 - smooth((t - 2.05) / 0.3));
    g.raise = up;
    g.across = 0.15 * up;
    // Stood up straighter, wagged from side to side.
    g.roll = up * (-0.25 + 0.45 * Math.sin(t * 13));
  },
  cheer(t, g) {
    const up = smooth(t / 0.15) * (1 - smooth((t - 1.55) / 0.3));
    g.raise = 1.2 * up;
    g.across = 0.2 * up;
    g.roll = up * 0.12 * Math.sin(t * 16);
  },
  hop(t, g) {
    const h = Math.sin(((t * 2.3) % 1) * Math.PI);
    const on = smooth(t / 0.15) * (1 - smooth((t - 2.25) / 0.3));
    g.raise = (0.3 + 0.3 * h) * on;
    g.across = 0.1 * on;
    g.roll = 0;
  },
  hula(t, g) {
    const s = Math.sin(TAU * 0.9 * t);
    const on = smooth(t / 0.4);
    g.raise = (0.5 - 0.3 * s) * on;
    g.across = (0.25 + 0.2 * Math.cos(TAU * 0.9 * t)) * on;
    g.roll = 0.3 * s * on;
  },
  talk(t, g) {
    const k = Math.max(0, Math.sin(t * 1.9));
    const on = smooth(t / 0.3);
    g.raise = (0.25 + 0.3 * k * k) * on;
    g.across = 0.3 * on;
    g.roll = 0.15 * k * on;
  },
  startled(t, g) {
    const jt = t / 0.32;
    const h = jt < 1 ? Math.sin(jt * Math.PI) : 0;
    const on = 1 - smooth((t - 1.3) / 0.4);
    g.raise = (0.3 + 0.5 * h) * on;
    g.across = 0.1 * on;
    g.roll = -0.2 * h;
  },
  cry(t, g) {
    // Up to the eyes, trembling.
    const on = smooth(t / 0.4);
    g.raise = 0.6 * on;
    g.across = 0.8 * on;
    g.roll = (0.5 + 0.05 * Math.sin(t * 30)) * on;
  },
  bow(t, g) {
    const b = smooth((t - 0.15) / 0.35) * (1 - smooth((t - 1.2) / 0.4));
    g.raise = -0.7 * b;
    g.across = 0;
    g.roll = 0;
  },
};
/** How far a raise lifts it (at its own size: a little, so it stays by the corner), and how quickly it eases
 * to what the gesture asks (a second). */
const RAISE = 0.12;
const GESTURE_EASE = 14;
/** The paw's length, tip to foot (at its own size): it swings from its foot, as a paw waves from the wrist. */
const PAW_LENGTH = 0.15;
/** Reading a book (see read): seconds to bring it up and open it (and to shut it and put it down again); the share of
 * that it takes to come up before your eyes, turning to face you, and how far up it is shut still, this much smaller
 * than it is read; then it opens. Open, its spread fills this much of your view's width and height at most, tipped back
 * this far (radians, its top away from you), its middle this far below your view's (a share of its half height). */
const READ_TIME = 0.85;
const READ_RISE = 0.45;
const READ_SWAP = 0.8;
const READ_SHUT = 0.62;
const READ_FILL: [number, number] = [0.92, 0.8];
const READ_TILT = 0.32;
const READ_LOW = 0.06;
/** Where your paws hold it open, in the book's own frame, as shares of its half width out from its spine and of its
 * length up from its near edge; how far in front of its pages (metres, at its own size); and how they are turned
 * (radians: tipped toward you, and leaning in). */
const READ_PAW_OUT = 0.8;
const READ_PAW_UP = 0.06;
const READ_PAW_FRONT = 0.012;
const READ_PAW_TURN: [number, number] = [-0.25, 0.55];
/** Holding a weapon up ready (かまえる, see ready): seconds to raise it and to bring it back down; how far in from the
 * corner it comes (a share of the way to the screen's middle) and up (at its own size); how it is turned there
 * (radians: its top away from you, pointing ahead and up; turned a little; leaning in across the view), held by its
 * foot (ItemDef.ready), and this much bigger, nearer you; and how far up its staff from the first your other paw holds
 * it (at its own size), reaching in from your left. */
const READY_TIME = 0.3;
const READY_IN = 0.3;
const READY_UP = 0.02;
const READY_TURN: [number, number, number] = [-0.42, -0.3, 0.55];
const READY_GROW = 1.12;
const READY_PAW_ALONG = 0.24;

const _grip = new THREE.Vector3();
const _off = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _turn = new THREE.Quaternion();
const _scale = new THREE.Vector3();
const _e = new THREE.Euler();
const _wanted: Gesture = { raise: 0, across: 0, roll: 0 };
const _held = new THREE.Quaternion();
const _at = new THREE.Vector3();
const _target = new THREE.Vector3();
const _mid = new THREE.Vector3();
const _v = new THREE.Vector3();
const _size = new THREE.Vector3();
const _x = new THREE.Vector3(1, 0, 0);

/** Drawn only by the game's camera, before everything in the world (and doing anything else it does as it is drawn:
 * a book's pages fetching their picture). */
function forTheEyes(copy: THREE.Object3D): void {
  copy.traverse((o) => {
    o.layers.set(HAND_LAYER);
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.frustumCulled = false;
    mesh.renderOrder = 10;
    const before = mesh.onBeforeRender;
    mesh.onBeforeRender = (renderer, ...rest) => {
      renderer.getContext().depthRange(0, VIEW_DEPTH);
      before.call(mesh, renderer, ...rest);
    };
    mesh.onAfterRender = (renderer) => renderer.getContext().depthRange(0, 1);
  });
}

export class HandView {
  readonly group = new THREE.Group();
  private readonly paw: ItemCopy;
  /** Your other paw, up only to hold a book open (see read) or a weapon ready (see ready). */
  private readonly pawL: ItemCopy;
  /** Reading what is in your paw (see read), and how far through bringing it up and opening it, 0 to 1. */
  private reading = false;
  private readT = 0;
  /** Holding what is in your paw up ready (see ready), and how far up it is, 0 to 1. */
  private readying = false;
  private readyT = 0;
  private item: ItemCopy | null = null;
  private itemId: ItemId | null = null;
  /** What should be in it: once what is there is lowered out of sight, this comes up. (Which one it is, too: the
   * next of the same kind, after one is eaten up or given, comes up as a thing of its own: see set.) */
  private wanted: ItemId | null = null;
  private wantedOne: object | null = null;
  private heldOne: object | null = null;
  /** How much of what shows is left, kept as it is lowered (`left` being the next one's by then). */
  private shownLeft = 1;
  /** 0 lowered out of sight, 1 held up. */
  private up = 0;
  private readonly copies = new Map<ItemId, ItemCopy>();
  /** Its motion, and how far through it (seconds). */
  private motion: HandMotion = null;
  private motionT = 0;
  /** How much of what is eaten is left, 1 to 0 (it shrinks as it goes). */
  left = 1;
  /** The way your steps sway it, and how far behind it lags as you turn. */
  private stride = 0;
  private lag = 0;
  private lastYaw = NaN;
  /** Whether a torch in it burns. */
  lit = false;
  /** The gesture it makes as you do something, eased (see GESTURES). */
  private readonly gesture: Gesture = { raise: 0, across: 0, roll: 0 };

  constructor(
    private readonly models: ItemModels,
    scene: THREE.Object3D,
  ) {
    this.group.name = 'hand';
    this.paw = models.make('paw', true);
    this.pawL = models.make('paw', true);
    forTheEyes(this.paw);
    forTheEyes(this.pawL);
    this.pawL.visible = false;
    this.group.add(this.paw, this.pawL);
    this.group.visible = false;
    scene.add(this.group);
  }

  /** Puts `id` in your paw (null: empties it): what was there is lowered first, as it is if `one` (which of its
   * kind) is another than the one there, though of the same kind. */
  set(id: ItemId | null, one: object | null = null): void {
    this.wanted = id;
    this.wantedOne = one;
  }

  /** Reads what is in your paw, if it is a book (on), or shuts it and puts it back down by the corner: brought up before
   * your eyes, turning to face you, and opened there, its left half swinging over (see showOpen), your other paw coming
   * up to hold it; the spread as big as fits in your view (READ_FILL). */
  read(on: boolean): void {
    this.reading = on;
  }

  /** Holds what is in your paw up ready, if it is a weapon (on: かまえる), or lowers it back to the corner: in toward the
   * middle and up, by its foot, pointing ahead and up, your other paw coming up to hold it further up its staff. */
  ready(on: boolean): void {
    this.readying = on;
  }

  /** Starts a motion (eating, drinking, playing, reaching out to take or put something); null stops it. */
  play(motion: HandMotion): void {
    this.motion = motion;
    this.motionT = 0;
  }

  get playing(): HandMotion {
    return this.motion;
  }

  /** A copy of `id` for your paw (one each, kept). */
  private copyOf(id: ItemId): ItemCopy {
    let copy = this.copies.get(id);
    if (!copy) {
      copy = this.models.make(id, true);
      forTheEyes(copy);
      this.copies.set(id, copy);
    }
    return copy;
  }

  /**
   * One frame: your paw before the camera, out of your eyes (`on`; else nothing shows). `me` lights it as
   * their paw is lit; `speed` (metres a second) sways it with their steps.
   */
  update(dt: number, camera: THREE.PerspectiveCamera, me: Character, on: boolean, speed: number): void {
    // The gesture for what you do, eased in and out.
    const act = me.actionId;
    const gesture = act ? GESTURES[act] : undefined;
    _wanted.raise = _wanted.across = _wanted.roll = 0;
    gesture?.(me.actionTime, _wanted);
    const g = this.gesture;
    const ease = 1 - Math.exp(-dt * GESTURE_EASE);
    g.raise += (_wanted.raise - g.raise) * ease;
    g.across += (_wanted.across - g.across) * ease;
    g.roll += (_wanted.roll - g.roll) * ease;
    // Lowered, then the next thing raised (a book read shut and brought down first); empty, raised only to gesture.
    const going = this.wanted !== this.itemId || this.wantedOne !== this.heldOne;
    const shown = (!going || this.readT > 0) && (!!this.itemId || g.raise > 0.05);
    this.up = THREE.MathUtils.clamp(this.up + (shown ? dt : -dt) / LOWER, 0, 1);
    if (going && this.up === 0) {
      this.item?.removeFromParent();
      this.itemId = this.wanted;
      this.heldOne = this.wantedOne;
      this.item = this.itemId ? this.copyOf(this.itemId) : null;
      if (this.item) this.group.add(this.item);
      this.left = 1;
      this.motion = null;
    }
    this.group.visible = on && (!!this.item || this.up > 0);
    const item = this.item;
    const book = item?.userData.book;
    this.readT = THREE.MathUtils.clamp(this.readT + (this.reading && book && !going ? dt : -dt) / READ_TIME, 0, 1);
    if (!this.group.visible) return;
    const def = this.itemId ? ITEMS[this.itemId] : null;
    this.readyT = THREE.MathUtils.clamp(this.readyT + (this.readying && def?.use === 'ready' && !going ? dt : -dt) / READY_TIME, 0, 1);
    const readied = smooth(this.readyT);

    // The view's half height and half width where it is held, and the size that keeps it as big on the
    // screen whatever the lens.
    const high = AHEAD * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
    const wide = high * camera.aspect;
    const size = Math.min(high, wide) * SIZE;
    // Your steps, and your turning.
    this.stride += (speed * dt) / (2 * stepLength(me, speed));
    const e = camera.matrixWorld.elements;
    const yaw = Math.atan2(-e[8], -e[10]);
    if (!Number.isNaN(this.lastYaw) && dt > 0) {
      const turn = Math.atan2(Math.sin(yaw - this.lastYaw), Math.cos(yaw - this.lastYaw));
      this.lag += (THREE.MathUtils.clamp((turn / dt) * LAG, -0.05, 0.05) - this.lag) * Math.min(1, dt * LAG_EASE);
    }
    this.lastYaw = yaw;
    const walk = Math.min(1, speed / 1.7);
    const phase = this.stride * Math.PI * 2;

    // Its grip low on the right, swaying with your steps, lagging as you turn, lowered out of sight by `up`.
    const down = (1 - this.up) ** 2;
    const gripX = wide - GRIP_IN * size;
    _grip.set(
      gripX + (Math.sin(phase) * BOB * walk + this.lag) * size,
      -high + (GRIP_UP - Math.abs(Math.cos(phase)) * BOB * walk - down * 0.6) * size + (camera.aspect < 1 ? UPRIGHT_LIFT * high : 0),
      -AHEAD,
    );
    // Held leaning in toward the middle of the screen, its front turned to you and a little toward the
    // middle; a flat thing tipped up toward you on an open paw.
    if (def?.flat) _e.set(0.7, -0.3, 0.1);
    else _e.set(-0.06, -0.45, 0.24);
    let strum = 0;
    this.motionT += dt;
    const m = this.motion;
    if (m === 'eat' || m === 'drink') {
      // Up to the mouth and back, a bite at a time: nearer, to the middle, tipped toward you.
      const k = Math.sin(Math.min(1, (this.motionT % BITE) / (BITE * 0.55)) * Math.PI);
      _grip.x -= k * gripX * 0.75;
      _grip.y += k * size * 0.22;
      _grip.z += k * 0.12;
      _e.x += k * (m === 'drink' ? 1.0 : 0.45);
    } else if (m === 'play') {
      // Held across you, strummed.
      _e.set(0.15, -0.35, 1.2);
      _grip.x -= gripX * 0.45;
      _grip.y += size * 0.08;
      strum = Math.sin(this.motionT * 10) * 0.025;
    } else if (m === 'reach') {
      // Out before you and back.
      const k = Math.sin(Math.min(1, this.motionT / REACH) * Math.PI);
      _grip.x -= k * gripX * 0.5;
      _grip.z -= k * 0.15;
      if (this.motionT > REACH) this.motion = null;
    }
    // Held up ready (see ready): in from the corner and up, turned to point ahead.
    if (readied > 0) {
      _grip.x -= readied * gripX * READY_IN;
      _grip.y += readied * READY_UP * size;
      _e.x += (READY_TURN[0] - _e.x) * readied;
      _e.y += (READY_TURN[1] - _e.y) * readied;
      _e.z += (READY_TURN[2] - _e.z) * readied;
    }
    // The gesture: up from the corner, in toward the middle, swung from its foot (what it holds with it).
    const lever = PAW_LENGTH * size;
    _grip.x -= g.across * gripX * 0.6 + Math.sin(g.roll) * lever;
    _grip.y += g.raise * RAISE * size + (Math.cos(g.roll) - 1) * lever;
    _e.z += g.roll;

    // Into the world, from the camera's own frame.
    camera.matrixWorld.decompose(_off, _q, _scale);
    // Reading a book (see read): brought up before your eyes as it turns to face you, shut, then opened, its left half
    // swinging over; what shows of it kept in the middle of your view meanwhile (its body shut, then its right half,
    // then its spread), as big as fits.
    const rise = book ? smooth(this.readT / READ_RISE) : 0;
    const opened = smooth((this.readT - READ_RISE) / (1 - READ_RISE));
    let fit = size;
    _held.setFromEuler(_e);
    _at.copy(_grip);
    if (item && book && rise > 0) {
      book.spread.getSize(_size);
      fit = Math.min(
        (2 * wide * READ_FILL[0]) / _size.x,
        (2 * high * READ_FILL[1]) / (_size.z * Math.cos(READ_TILT) + _size.y * Math.sin(READ_TILT)),
      );
      _held.slerp(_turn.setFromAxisAngle(_x, Math.PI / 2 - READ_TILT), rise);
      const shut = rise < READ_SWAP;
      showOpen(item, shut ? null : opened);
      if (shut) this.shutMiddle(_mid);
      else book.half.getCenter(_mid).lerp(book.spread.getCenter(_v), opened);
    }
    // (In the corner as big as it is shown there, ItemDef.hand; shut, it comes up a little smaller than it is read,
    // growing as it opens.)
    if (!going) this.shownLeft = this.left;
    const held = size * this.shownLeft * (def?.hand ?? 1) * (1 + (READY_GROW - 1) * readied);
    const scale = THREE.MathUtils.lerp(held, fit * THREE.MathUtils.lerp(READ_SHUT, 1, opened), rise);
    if (item && book && rise > 0) {
      _mid.multiplyScalar(scale).applyQuaternion(_held);
      // (Its middle, from where your paw holds it in the corner to before your eyes; its origin as far from that.)
      _v.copy(_grip).add(_mid).lerp(_target.set(0, -READ_LOW * high, -AHEAD), rise);
      _at.copy(_v).sub(_mid);
    } else if (item) showOpen(item, null);
    // (Held up ready, by its foot: its origin that far along it from your paw.)
    const foot = item?.userData.ready;
    if (foot && readied > 0) _at.sub(_v.copy(foot).multiplyScalar(scale * readied).applyQuaternion(_held));
    if (item) {
      item.position.copy(_at).applyMatrix4(camera.matrixWorld);
      item.quaternion.copy(_q).multiply(_held);
      item.scale.setScalar(scale);
    }
    // The paw round the grip, up from the corner of the screen: before a stick, under a tray; its base nearer
    // you than its tip, as an arm reaching out from you. Empty, it is held up as round a stick.
    const paw = this.paw;
    if (def?.flat) {
      _off.set(0, -0.035, 0.01);
      _e.set(-1.0, 0, 0.35 + g.roll);
    } else {
      _off.set(0.004, -0.018 + strum, 0.03);
      _e.set(-0.35, 0, 0.42 + g.roll);
    }
    paw.position.copy(_grip).addScaledVector(_off, size);
    paw.quaternion.setFromEuler(_e);
    paw.scale.setScalar(size);
    // Holding a book open: your paws at its near corners, the right coming up with it, the left up from below as it
    // opens.
    const pawL = this.pawL;
    pawL.visible = (!!book && opened > 0) || (!!foot && readied > 0.02);
    if (foot && readied > 0.02) {
      // Your other paw on its staff further up from the first, reaching in from your left, coming up from below as it
      // is raised.
      pawL.position.copy(paw.position).addScaledVector(_v.set(0, 1, 0).applyQuaternion(_held), READY_PAW_ALONG * scale);
      pawL.position.y -= (1 - readied) * high;
      pawL.quaternion.setFromEuler(_e.set(-0.35, 0, -0.42));
      pawL.scale.setScalar(size);
    }
    if (book && rise > 0) {
      this.readingPaw(book, 1, scale, _v);
      paw.position.lerp(_v, rise);
      paw.quaternion.slerp(_turn.setFromEuler(_e.set(READ_PAW_TURN[0], 0, READ_PAW_TURN[1])), rise);
      paw.scale.setScalar(THREE.MathUtils.lerp(size, scale, rise));
      if (pawL.visible) {
        this.readingPaw(book, -1, scale, pawL.position);
        pawL.position.y -= (1 - opened) * high;
        pawL.quaternion.setFromEuler(_e.set(READ_PAW_TURN[0], 0, -READ_PAW_TURN[1]));
        pawL.scale.setScalar(scale);
      }
    }
    for (const p of [paw, pawL]) {
      p.position.applyMatrix4(camera.matrixWorld);
      p.quaternion.premultiply(_q);
      me.lightHeld(p.userData.light);
    }
    if (item) {
      me.lightHeld(item.userData.light);
      const flame = item.userData.flame;
      if (flame) flame.visible = this.lit;
    }
  }

  /** The middle of the shut body of what is in your paw, in its own frame. */
  private shutMiddle(out: THREE.Vector3): THREE.Vector3 {
    const body = this.models.shape(this.itemId as ItemId);
    if (!body.boundingBox) body.computeBoundingBox();
    return (body.boundingBox as THREE.Box3).getCenter(out);
  }

  /** Where a paw holds the book in your paw open (READ_PAW_*), on its `side` (1 right), in the camera's frame: the
   * book's origin at `_at`, turned `_held`, `scale` its size. */
  private readingPaw(book: NonNullable<ItemCopy['userData']['book']>, side: number, scale: number, out: THREE.Vector3): THREE.Vector3 {
    const s = book.spread;
    const half = side > 0 ? s.max.x : -s.min.x;
    out.set(side * READ_PAW_OUT * half, s.max.y + READ_PAW_FRONT, s.max.z - READ_PAW_UP * (s.max.z - s.min.z));
    return out.multiplyScalar(scale).applyQuaternion(_held).add(_at);
  }
}
