import * as THREE from 'three';
import type { Character } from '../characters/Character';
import { createSketch, type HeldLight } from '../characters/Props';
import { ITEMS, restingTurn, type ItemId, type ItemModels } from '../life/Items';
import { PEN_METRES } from '../world/Ink';
import { CANOPY_SHADE } from '../world/Look';
import type { Target } from './Play';

/**
 * What you look at, shown (the user, 2026-10-23: what the action button would act on, and where おく would
 * put a thing, were anyone's guess): a small cream ▽ with the pen's line, made as the marks over heads are
 * (see Emotes), floats over the thing, the person or the seat you look at, bobbing a little, and glides over
 * to the next thing you look at rather than popping up on it; holding something, where it would be put down
 * lies a sketch of it, flat paper with the pen's line, as it would lie there (on its foot, on its side, or
 * flat), the ▽ over that. One mark, the same for everything, apart from what it marks: a bolder line round
 * the thing itself was tried first, and the user found it "overkill", a thing "suddenly wrapped by an orange
 * thick outline". Nothing here changes what the button does: Play chooses, this only shows its choice.
 */

/** The ▽: how tall (metres); how far it floats over the top of a head, over a thing (or its sketch) and over
 * a seat; how it bobs (metres, over so many seconds); how quickly it glides to the next thing looked at (a
 * second); and how long it takes to come up, or to go (seconds). */
const SIZE = 0.11;
const OVER_HEAD = 0.04;
const OVER_THING = 0.06;
const OVER_SEAT = 0.3;
const BOB = 0.012;
const BOB_EVERY = 1.1;
const GLIDE = 16;
const SHOW = 0.12;
/** Its paper and its ink: the HUD's cream, the marks' ink (see Emotes). */
const CREAM = '#FFF7E8';
const INK = '#5A3A2E';
/** A sketch lies as far over the ground as a thing put down does (see Things.put). */
const PAPER_OVER = 0.004;

const _turn = new THREE.Quaternion();
const _up = new THREE.Vector3(0, 1, 0);
const _v = new THREE.Vector3();
const _goal = new THREE.Vector3();
const smooth = (x: number) => {
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
};

/** The ▽, painted: a plump triangle pointing down, cream, the pen's line round it (its stroke half under the
 * fill, as the marks' glyphs are drawn: see Emotes). */
function pointerTexture(): THREE.CanvasTexture {
  const px = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = px;
  const c = canvas.getContext('2d');
  if (!c) throw new Error('2D canvas unavailable');
  // Its corners: left and right at the top, its tip at the bottom, each rounded.
  const [left, top, right, tip, round] = [18, 22, 110, 108, 13];
  c.beginPath();
  c.moveTo(px / 2, top);
  c.arcTo(right, top, px / 2, tip, round);
  c.arcTo(px / 2, tip, left, top, round);
  c.arcTo(left, top, right, top, round);
  c.closePath();
  c.lineJoin = 'round';
  c.lineWidth = 2 * Math.min((PEN_METRES / SIZE) * px, 0.12 * px);
  c.strokeStyle = INK;
  c.stroke();
  c.fillStyle = CREAM;
  c.fill();
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export class Focus {
  readonly group = new THREE.Group();
  private readonly pointer: THREE.Sprite;
  /** A sketch for each kind of thing held so far. */
  private readonly sketches = new Map<ItemId, THREE.Group>();
  /** How far over its origin a thing of each kind reaches, lying as it rests. */
  private readonly tops = new Map<ItemId, number>();
  /** Where the ▽'s tip floats now (it glides from there to the next thing looked at), how far it is up (0
   * gone, 1 up), and its clock. */
  private readonly at = new THREE.Vector3();
  private shown = 0;
  private t = 0;
  /** The sketch shown last frame, to be put away. */
  private sketch: THREE.Group | null = null;

  constructor(
    private readonly models: ItemModels,
    scene: THREE.Object3D,
    /** The trees' shade at a point, 0 (sun) to 1 (see Stage.shadeAt), or null for none. */
    private readonly shadeAt: ((x: number, y: number, z: number) => number) | null,
  ) {
    this.group.name = 'focus';
    scene.add(this.group);
    // Drawn as the marks over heads are (see Emotes.take), in the world: its tip is where it is put.
    this.pointer = new THREE.Sprite(new THREE.SpriteMaterial({ map: pointerTexture(), transparent: true, depthWrite: false, fog: false }));
    this.pointer.center.set(0.5, 0);
    this.pointer.renderOrder = 10;
    this.pointer.visible = false;
    this.group.add(this.pointer);
  }

  /**
   * One frame: the ▽ over what you look at (`target`, see Play.aim), and holding `held`, the sketch where it
   * would be put down; `me` for the way you face, which a thing put down takes.
   */
  update(dt: number, target: Target | null, held: { item: ItemId; nibbled: boolean } | null, me: Character): void {
    this.t += dt;
    if (this.sketch) {
      this.sketch.visible = false;
      this.sketch = null;
    }
    const goal = target ? this.goalOf(target, held, me, _goal) : null;
    // Up over what you look at, where it is if it was gone, else gliding over from where it was; shrinking
    // away where it is when nothing is looked at.
    if (goal) {
      if (this.shown <= 0) this.at.copy(goal);
      else this.at.lerp(goal, 1 - Math.exp(-dt * GLIDE));
    }
    this.shown = THREE.MathUtils.clamp(this.shown + (goal ? dt : -dt) / SHOW, 0, 1);
    const pointer = this.pointer;
    pointer.visible = this.shown > 0;
    if (!pointer.visible) return;
    const size = SIZE * smooth(this.shown);
    pointer.scale.set(size, size, 1);
    pointer.position.copy(this.at);
    pointer.position.y += BOB * Math.sin((this.t * Math.PI * 2) / BOB_EVERY);
  }

  /** Where the ▽'s tip floats for `target` (into `out`), the sketch shown if there is one; null for nothing to
   * mark. */
  private goalOf(target: Target, held: { item: ItemId; nibbled: boolean } | null, me: Character, out: THREE.Vector3): THREE.Vector3 | null {
    switch (target.kind) {
      case 'thing': {
        const thing = target.thing;
        return out.copy(thing.grip).setY(thing.grip.y + this.topOf(thing.item) + OVER_THING);
      }
      case 'resident':
        // Over the very top of them (tall ears, a crown), where their marks go.
        target.r.ch.getAnchor('top', out);
        out.y += OVER_HEAD;
        return out;
      case 'seat':
        return out.copy(target.seat.at).setY(target.seat.at.y + OVER_SEAT);
      case 'place': {
        // (Bitten into, it is not put down but eaten up: nothing to show.)
        if (!held || held.nibbled) return null;
        const item = held.item;
        const rest = ITEMS[item].rest;
        const sketch = this.sketchOf(item);
        const at = target.at;
        sketch.position.set(at.x, at.y + this.models.footOf(item, rest) + PAPER_OVER, at.z);
        sketch.quaternion.setFromAxisAngle(_up, me.facing).multiply(restingTurn(rest, _turn));
        const light = sketch.userData.light as HeldLight;
        light.uShade.value.setRGB(1, 1, 1).lerp(CANOPY_SHADE, this.shadeAt?.(at.x, sketch.position.y, at.z) ?? 0);
        sketch.visible = true;
        this.sketch = sketch;
        return out.set(at.x, sketch.position.y + this.topOf(item) + OVER_THING, at.z);
      }
      case 'stall':
        return null;
    }
  }

  /** How far over its origin a thing of `item`'s kind reaches, lying as it rests (see restingTurn). */
  private topOf(item: ItemId): number {
    let top = this.tops.get(item);
    if (top === undefined) {
      restingTurn(ITEMS[item].rest, _turn);
      const position = this.models.shape(item).getAttribute('position');
      top = 0;
      for (let i = 0; i < position.count; i++) top = Math.max(top, _v.fromBufferAttribute(position, i).applyQuaternion(_turn).y);
      this.tops.set(item, top);
    }
    return top;
  }

  /** The sketch of a thing of `item`'s kind (one, kept). */
  private sketchOf(item: ItemId): THREE.Group {
    let sketch = this.sketches.get(item);
    if (!sketch) {
      sketch = createSketch(this.models.shape(item));
      sketch.name = `sketch:${item}`;
      this.group.add(sketch);
      this.sketches.set(item, sketch);
    }
    return sketch;
  }
}
