import * as THREE from 'three';
import type { Character } from '../characters/Character';
import type { ActionId } from '../characters/Actions';
import { ITEMS, type ItemCopy, type ItemId, type ItemModels } from '../life/Items';

/**
 * What you hold, seen out of your own eyes (the user, 2026-10-22: in the right paw, at the bottom right of
 * the screen, as Minecraft shows it): your paw, the islanders' round grey-mauve stub, coming up from the
 * screen's corner round what it holds, swaying with your steps and lagging a little as you turn; lowered
 * out of sight and up again with the next thing; up to your mouth as you eat or drink, a bite at a time;
 * strummed, a ukulele. As you wave, cheer or dance (the きもち button), it does so too, up into view even
 * when empty (GESTURES). Otherwise nothing shows while your paw is empty.
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
/** Seconds to lower it out of sight, or to raise it. */
const LOWER = 0.22;
/** A step's sway (metres, at its own size) and a stride (metres walked). */
const BOB = 0.012;
const STRIDE = 1.05;
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

const _grip = new THREE.Vector3();
const _off = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _turn = new THREE.Quaternion();
const _scale = new THREE.Vector3();
const _e = new THREE.Euler();
const _wanted: Gesture = { raise: 0, across: 0, roll: 0 };

/** Drawn only by the game's camera, before everything in the world. */
function forTheEyes(copy: THREE.Object3D): void {
  copy.traverse((o) => {
    o.layers.set(HAND_LAYER);
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.frustumCulled = false;
    mesh.renderOrder = 10;
    mesh.onBeforeRender = (renderer) => renderer.getContext().depthRange(0, VIEW_DEPTH);
    mesh.onAfterRender = (renderer) => renderer.getContext().depthRange(0, 1);
  });
}

export class HandView {
  readonly group = new THREE.Group();
  private readonly paw: ItemCopy;
  private item: ItemCopy | null = null;
  private itemId: ItemId | null = null;
  /** What should be in it: once what is there is lowered out of sight, this comes up. */
  private wanted: ItemId | null = null;
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
    forTheEyes(this.paw);
    this.group.add(this.paw);
    this.group.visible = false;
    scene.add(this.group);
  }

  /** Puts `id` in your paw (null: empties it): what was there is lowered first. */
  set(id: ItemId | null): void {
    this.wanted = id;
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
    // Lowered, then the next thing raised; empty, raised only to gesture.
    const going = this.wanted !== this.itemId;
    const shown = !going && (!!this.itemId || g.raise > 0.05);
    this.up = THREE.MathUtils.clamp(this.up + (shown ? dt : -dt) / LOWER, 0, 1);
    if (going && this.up === 0) {
      this.item?.removeFromParent();
      this.itemId = this.wanted;
      this.item = this.itemId ? this.copyOf(this.itemId) : null;
      if (this.item) this.group.add(this.item);
      this.left = 1;
      this.motion = null;
    }
    this.group.visible = on && (!!this.item || this.up > 0);
    if (!this.group.visible) return;
    const item = this.item;
    const def = this.itemId ? ITEMS[this.itemId] : null;

    // The view's half height and half width where it is held, and the size that keeps it as big on the
    // screen whatever the lens.
    const high = AHEAD * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
    const wide = high * camera.aspect;
    const size = Math.min(high, wide) * SIZE;
    // Your steps, and your turning.
    this.stride += (speed * dt) / STRIDE;
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
      -high + (GRIP_UP - Math.abs(Math.cos(phase)) * BOB * walk - down * 0.6) * size,
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
    // The gesture: up from the corner, in toward the middle, swung from its foot (what it holds with it).
    const lever = PAW_LENGTH * size;
    _grip.x -= g.across * gripX * 0.6 + Math.sin(g.roll) * lever;
    _grip.y += g.raise * RAISE * size + (Math.cos(g.roll) - 1) * lever;
    _e.z += g.roll;

    // Into the world, from the camera's own frame.
    camera.matrixWorld.decompose(_off, _q, _scale);
    if (item) {
      item.position.copy(_grip).applyMatrix4(camera.matrixWorld);
      item.quaternion.copy(_q).multiply(_turn.setFromEuler(_e));
      item.scale.setScalar(size * this.left);
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
    paw.position.copy(_grip).addScaledVector(_off, size).applyMatrix4(camera.matrixWorld);
    paw.quaternion.copy(_q).multiply(_turn.setFromEuler(_e));
    paw.scale.setScalar(size);
    me.lightHeld(paw.userData.light);
    if (item) {
      me.lightHeld(item.userData.light);
      const flame = item.userData.flame;
      if (flame) flame.visible = this.lit;
    }
  }
}
