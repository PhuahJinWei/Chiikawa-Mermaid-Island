import * as THREE from 'three';
import type { Character } from '../characters/Character';
import { SLACK_ON_TOP, type EmoteSystem } from '../characters/Emotes';
import { sharedUniforms } from '../characters/CharacterMaterial';
import { ITEMS, restingTurn, type ItemId, type ItemModels } from '../life/Items';
import { PEN_METRES } from '../world/Ink';
import { CANOPY_SHADE, FILM } from '../world/Look';
import type { Target } from './Play';

/**
 * What you look at, shown (the user, 2026-10-23: what the action button would act on, and where おく would
 * put a thing, were anyone's guess): a small cream ▽ with the pen's line, made as the marks over heads are
 * (see Emotes), floats over the thing, the person or the seat you look at, bobbing a little, and glides over
 * to the next thing you look at rather than popping up on it; holding something, where it would be put down
 * shows a ghost of it, as it would lie there (on its foot, on its side, or flat), the ▽ over that: see-through,
 * pale, its rim glowing, breathing a little, so it never reads as the thing put down (the user, 2026-10-23: a
 * flat paper copy with the pen's full line "look like a real thing placed"). One mark, the same for
 * everything, apart from what it marks: a bolder line round
 * the thing itself was tried first, and the user found it "overkill", a thing "suddenly wrapped by an orange
 * thick outline". Nothing here changes what the button does: Play chooses, this only shows its choice.
 */

/** The ▽: how tall (metres); how far it floats over the top of a head, over a thing (or its ghost) and over
 * a seat; how it bobs (metres, over so many seconds); how quickly it glides to the next thing looked at (a
 * second); and how long it takes to come up, or to go (seconds). */
const SIZE = 0.11;
const OVER_HEAD = 0.04;
const OVER_THING = 0.06;
const OVER_SEAT = 0.3;
/** Over a stall's keeper (see Play's buy), this far up from their feet: over the head of the islanders who keep them. */
const OVER_KEEPER = 1.35;
/** A brand burning in its stand (a village torch's): its flame's height over where it sits, which the ▽ floats
 * over (over where the brand lies as a thing lies, it was lost in the flame). */
const STAND_FLAME = 0.3;
const BOB = 0.012;
const BOB_EVERY = 1.1;
const GLIDE = 16;
const SHOW = 0.12;
/** Its paper and its ink: the HUD's cream, the marks' ink (see Emotes). */
const CREAM = '#FFF7E8';
const INK = '#5A3A2E';
/** A ghost lies as far over the ground as a thing put down does (see Things.put). */
const GHOST_OVER = 0.004;
/** A ghost: its pale colour, how much of it is seen (from, to, as it breathes, over so many seconds), and how
 * much brighter its rim glows, where its surface turns away from you (its edge, in place of the pen's line,
 * which, drawn faint, showed through its own creases as dark streaks). */
const GHOST = '#F4FAFF';
const GHOST_SEEN: [number, number] = [0.28, 0.42];
const GHOST_BREATH = 1.6;
const GHOST_RIM = 0.55;

/** A ghost's look, shared by every kind's: its colour, how much of it is seen, and its light. */
const ghostLook = {
  uGhost: { value: new THREE.Color(GHOST) },
  uSeen: { value: GHOST_SEEN[0] },
  uRim: { value: GHOST_RIM },
  uShade: { value: new THREE.Color(1, 1, 1) },
};

/** The ghost's materials, made once: its depth alone first (so it is one sheet, its own far side never
 * showing through its near side), then its pale body, a glow at its rim.
 *
 * It is laid over the picture as much as it is seen (the blend's constant, `blendAlpha`, set each frame), its
 * colour premultiplied, and in the film look it marks itself as the cast do (alpha a half: see
 * CharacterMaterial), so the finishing passes leave it as drawn: as scenery, the paint and the depth of field
 * smeared it into blotches (the user, 2026-10-23: "looks like it is glitching"). */
let ghostMaterials: { depth: THREE.Material; body: THREE.ShaderMaterial } | null = null;
function ghostMaterialsOf(): NonNullable<typeof ghostMaterials> {
  if (ghostMaterials) return ghostMaterials;
  const depth = new THREE.MeshBasicMaterial({ colorWrite: false });
  const body = new THREE.ShaderMaterial({
    uniforms: { ...ghostLook, uAmbient: sharedUniforms.uAmbient },
    defines: FILM ? { FILM_MASK: '' } : {},
    vertexShader: /* glsl */ `
      varying vec3 vNormal;
      varying vec3 vView;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vNormal = normalize(normalMatrix * normal);
        vView = -mv.xyz;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uGhost;
      uniform vec3 uAmbient;
      uniform vec3 uShade;
      uniform float uSeen;
      uniform float uRim;
      varying vec3 vNormal;
      varying vec3 vView;
      void main() {
        float facing = abs(dot(normalize(vNormal), normalize(vView)));
        float rim = pow(1.0 - facing, 2.0) * uRim;
        // Premultiplied by how much of it is seen; the rim glows over that.
        vec3 colour = uGhost * uAmbient * uShade * min(1.0, uSeen * (1.0 + rim * 2.5));
        gl_FragColor = vec4(colour, 1.0);
        #include <colorspace_fragment>
        #ifdef FILM_MASK
        gl_FragColor.a = 0.5;
        #endif
      }`,
  });
  body.transparent = true;
  body.depthWrite = false;
  // (Drawn where the depth alone was, not behind it.)
  body.depthFunc = THREE.LessEqualDepth;
  body.blending = THREE.CustomBlending;
  body.blendSrc = THREE.OneFactor;
  body.blendDst = THREE.OneMinusConstantAlphaFactor;
  body.blendSrcAlpha = THREE.OneFactor;
  body.blendDstAlpha = THREE.ZeroFactor;
  body.blendAlpha = GHOST_SEEN[0];
  ghostMaterials = { depth, body };
  return ghostMaterials;
}

/** A ghost of a thing's shape (see ghostMaterialsOf). */
function createGhost(geometry: THREE.BufferGeometry): THREE.Group {
  const { depth, body } = ghostMaterialsOf();
  const group = new THREE.Group();
  const meshes = [new THREE.Mesh(geometry, depth), new THREE.Mesh(geometry, body)];
  meshes.forEach((m, i) => (m.renderOrder = 30 + i));
  group.add(...meshes);
  return group;
}

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
  /** A ghost for each kind of thing held so far. */
  private readonly ghosts = new Map<ItemId, THREE.Group>();
  /** How far over its origin a thing of each kind reaches, lying as it rests. */
  private readonly tops = new Map<ItemId, number>();
  /** Where the ▽'s tip floats now (it glides from there to the next thing looked at), how far it is up (0
   * gone, 1 up), and its clock. */
  private readonly at = new THREE.Vector3();
  private shown = 0;
  private t = 0;
  /** The ghost shown last frame, to be put away. */
  private ghost: THREE.Group | null = null;

  constructor(
    private readonly models: ItemModels,
    scene: THREE.Object3D,
    /** The trees' shade at a point, 0 (sun) to 1 (see Stage.shadeAt), or null for none. */
    private readonly shadeAt: ((x: number, y: number, z: number) => number) | null,
    /** The marks over heads, whose pass over the finished picture the ▽ is drawn in. */
    marks: EmoteSystem,
  ) {
    this.group.name = 'focus';
    scene.add(this.group);
    // Drawn as the marks over heads are (see EmoteSystem.overlay; the user, 2026-10-24: not hazed with what lies
    // behind it, nor seen through walls), in the world: its tip is where it is put.
    this.pointer = new THREE.Sprite(marks.overlayMaterial(pointerTexture(), SLACK_ON_TOP));
    this.pointer.center.set(0.5, 0);
    this.pointer.renderOrder = 10;
    this.pointer.visible = false;
    marks.overlay.add(this.pointer);
  }

  /**
   * One frame: the ▽ over what you look at (`target`, see Play.aim), and holding `held`, its ghost where it
   * would be put down; `me` for the way you face, which a thing put down takes.
   */
  update(dt: number, target: Target | null, held: { item: ItemId; nibbled: boolean } | null, me: Character): void {
    this.t += dt;
    if (this.ghost) {
      this.ghost.visible = false;
      this.ghost = null;
    }
    // The ghost breathes a little.
    const breath = 0.5 + 0.5 * Math.sin((this.t * Math.PI * 2) / GHOST_BREATH);
    ghostLook.uSeen.value = GHOST_SEEN[0] + (GHOST_SEEN[1] - GHOST_SEEN[0]) * breath;
    if (ghostMaterials) ghostMaterials.body.blendAlpha = ghostLook.uSeen.value;
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

  /** The ▽ and the ghost gone at once, not shrinking away (your camera held up: see Play). */
  hide(): void {
    this.shown = 0;
    this.pointer.visible = false;
    if (this.ghost) {
      this.ghost.visible = false;
      this.ghost = null;
    }
  }

  /** Where the ▽'s tip floats for `target` (into `out`), the ghost shown if there is one; null for nothing to
   * mark. */
  private goalOf(target: Target, held: { item: ItemId; nibbled: boolean } | null, me: Character, out: THREE.Vector3): THREE.Vector3 | null {
    switch (target.kind) {
      case 'thing': {
        const thing = target.thing;
        return out.copy(thing.grip).setY(thing.grip.y + (thing.hidden ? STAND_FLAME : this.topOf(thing.item)) + OVER_THING);
      }
      case 'resident':
        // Over the very top of them (tall ears, a crown), where their marks go.
        target.r.ch.getAnchor('top', out);
        out.y += OVER_HEAD;
        return out;
      case 'seat':
        return out.copy(target.seat.at).setY(target.seat.at.y + OVER_SEAT);
      case 'stand':
        return out.copy(target.at).setY(target.at.y + OVER_THING);
      case 'siren':
        // Over the top of her head, as over anyone's.
        target.ch.getAnchor('top', out);
        out.y += OVER_HEAD;
        return out;
      case 'place': {
        // (Bitten into, it is not put down but eaten up: nothing to show.)
        if (!held || held.nibbled) return null;
        const item = held.item;
        const rest = ITEMS[item].rest;
        const ghost = this.ghostOf(item);
        const at = target.at;
        ghost.position.set(at.x, at.y + this.models.footOf(item, rest) + GHOST_OVER, at.z);
        ghost.quaternion.setFromAxisAngle(_up, me.facing).multiply(restingTurn(rest, _turn));
        ghostLook.uShade.value.setRGB(1, 1, 1).lerp(CANOPY_SHADE, this.shadeAt?.(at.x, ghost.position.y, at.z) ?? 0);
        ghost.visible = true;
        this.ghost = ghost;
        return out.set(at.x, ghost.position.y + this.topOf(item) + OVER_THING, at.z);
      }
      case 'stall':
        return null;
      case 'buy':
        // Over its keeper's head, behind the counter.
        return out.copy(target.stall.keeper).setY(target.stall.keeper.y + OVER_KEEPER);
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

  /** The ghost of a thing of `item`'s kind (one, kept). */
  private ghostOf(item: ItemId): THREE.Group {
    let ghost = this.ghosts.get(item);
    if (!ghost) {
      ghost = createGhost(this.models.shape(item));
      ghost.name = `ghost:${item}`;
      this.group.add(ghost);
      this.ghosts.set(item, ghost);
    }
    return ghost;
  }
}
