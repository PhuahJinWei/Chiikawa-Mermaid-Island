import * as THREE from 'three';
import type { CharacterDef, ExpressionId } from './types';
import { MAX_PARTS, PART, type AnchorName, type CharacterModel, type OutfitModel } from './Model';
import { ArmRig, type ArmPose, type ArmTurns } from './Arms';
import {
  createCharacterMaterials,
  FOG_FRAGMENT,
  makeCharacterUniforms,
  makeOutfitUniforms,
  sharedUniforms,
  type CharacterUniforms,
} from './CharacterMaterial';
import { Face } from './Face';
import { Spring } from './Springs';
import { copyPose, lerpPose, resetPose, restPose } from './Pose';
import { ACTIONS, type ActionContext, type ActionId } from './Actions';
import type { EmoteHost, EmoteSystem } from './Emotes';
import { t } from '../i18n/I18n';
import { penAt } from '../world/Ink';
import type { HeldLight } from './Props';
import { CANOPY_SHADE, FILM, MIRROR_LAYER } from '../world/Look';

export interface CharacterOptions {
  /** Background extra: flat tint, and a drawn face on a small canvas (the islanders' cheek marks). */
  crowd?: { color: THREE.ColorRepresentation };
  /** An outfit asset fitted to this character (the island outfit). Worn until taken off, unless they have
   * clothes of their own. */
  outfit?: OutfitModel;
  /** Their own clothes, fitted to them as the island outfit is and worn instead of it (Rakko's cape: see
   * CharacterDef.own), and what they carry with them (his sword), made by createHeld. */
  own?: { outfit: OutfitModel; carry?: THREE.Object3D };
  /** What they always have in their left hand (Kurimanju's can: see CharacterDef.carries), made by
   * createHeld. */
  carry?: THREE.Object3D;
  /** What they play in its action (Rakko's ukulele: see CharacterDef.plays), made by createHeld. */
  instrument?: THREE.Object3D;
}

export interface FrameContext {
  camera: THREE.Camera;
  viewHeight: number;
  pixelRatio: number;
  /** Height of what someone stands on at (x, z), within a step of where their feet were. */
  groundHeight: (x: number, z: number, feet?: number) => number;
  /** Keeps a character who moved from `from` (from.y: their feet) to `p` on ground they can stand on. */
  clamp: (p: THREE.Vector3, from: THREE.Vector3) => void;
  /** In the air, their feet at `y`: keeps a character who moved from `from` to `p` from passing into
   * anything standing higher than their feet. Without it, jumps go straight up and down and no one
   * falls off an edge. */
  air?: (p: THREE.Vector3, from: THREE.Vector3, y: number) => void;
  /** Whether someone whose feet came down to `y` at p fell into water too deep to stand in; if so,
   * p is moved to the nearest place they can climb out. */
  splash?: (p: THREE.Vector3, y: number) => boolean;
  /** How deep in the trees' shade a point is, 0 in the sun to 1: in the film look only. */
  shade?: (x: number, y: number, z: number) => number;
  /** The firelight on someone at a point after dark: the strongest lights' ways from them and how
   * much each warms them, into `out`, and where the strongest is, into `from`; `seen` is their own
   * memory of how clearly each light reaches them, eased over `dt`. Returns how much a lit room they
   * stand in warms them all round (see Firelight.lightsAt). In the film look only. */
  firelight?: (
    x: number,
    y: number,
    z: number,
    seen: Map<number, number>,
    dt: number,
    out: THREE.Vector4[],
    from: THREE.Vector3,
  ) => number;
  /** In the forbidden cave, its own light on someone at a point, into `out`; false outside it. In the
   * film look only. */
  caveLight?: (x: number, y: number, z: number, out: THREE.Color) => boolean;
}

/** Where someone riding in something sits (feet, x, y, z) and which way they face. */
export interface Ride {
  x: number;
  y: number;
  z: number;
  yaw: number;
}

const GRAVITY = -24;
const JUMP_SPEED = 5.8;
const ACCEL = 16;
/** Walking off an edge deeper than this is a fall, not a step down. */
const DROP = 0.6;
/** How dark the firelight's shadow is for how much the light warms them: full where a light warms
 * them a third of the way (see FrameContext.firelight). */
const FIRE_SHADOW = 3;

/**
 * How someone's head turns to keep their eyes on what they watch (see Character.watch), in radians: up to
 * `yaw` to either side, `up` and `down`, looking up or down only `share` of the way there (a gentle nod:
 * all the way looked weird to the user, 2026-10-22), easing to it at `rate` a second. Past `turn` to one
 * side their body turns to face it too, until it nearly does (the user: the head first, the body only once
 * the head has turned past a point). With `turn` null the body never turns, and the head gives up on what
 * is too far round to one side.
 */
export interface HeadLook {
  yaw: number;
  up: number;
  down: number;
  share: number;
  rate: number;
  turn: number | null;
}
export const HEAD_LOOK: HeadLook = { yaw: 0.5, up: 0.25, down: 0.25, share: 0.5, rate: 5, turn: 0.5 };
/** Faster than this (metres a second) they are walking: their body faces the way they go, and their head turns
 * only this share of its reach to what they watch (see updateHead). */
const WALKING = 0.35;
const WALKING_LOOK = 0.35;
/** How much a lean tips the head (see actionTilt): the body bends as the square of its height (the material's
 * lean), so its slope near the head's height is about this many times the lean. */
const HEAD_BEND = 1.7;
/** What they hold in their right paw (see Character.hold): upright, this far ahead of the paw's tip, leaning this
 * far forward (radians); flat, this far ahead and up; eaten, this far out from the mouth and down from it. */
const HAND_AHEAD = 0.03;
const HAND_LEAN = 0.15;
const HAND_FLAT_AHEAD = 0.07;
const HAND_FLAT_UP = 0.03;
const HAND_MOUTH_OUT = 0.08;
const HAND_MOUTH_DOWN = 0.08;
/** What they always carry sits this far out of their left hand's tip (to their left, metres) and ahead of it. */
const CARRY_OUT = 0.02;
const CARRY_AHEAD = 0.03;
/** Rakko's sword is on his back, as he usually carries it (the user, 2026-10-22), in the middle of it (the user: not
 * out over his right shoulder): its hilt up behind the foot of his head, its blade down his back over his cape,
 * leaning a little to his left (the model's +x), clear of his head's round back and his cape. Its guard's top, in
 * his body's own frame at rest (metres), and the way its blade runs from there; its flat faces out from his back. */
const SWORD_BACK_GUARD = new THREE.Vector3(-0.035, 0.46, -0.425);
const SWORD_BACK_WAY = new THREE.Vector3(0.07, -0.28, 0.045).normalize();
/** From the sword's origin, the middle of its grip, to its guard's top (art/blender/build_props.py SWORD). */
const SWORD_GRIP_TO_GUARD = 0.0575;
/** Where its grip's middle is, and how it is turned, on his back. */
const SWORD_BACK_AT = SWORD_BACK_GUARD.clone().addScaledVector(SWORD_BACK_WAY, -SWORD_GRIP_TO_GUARD);
const SWORD_BACK_TURN = (() => {
  const middle = SWORD_BACK_GUARD.clone().addScaledVector(SWORD_BACK_WAY, 0.14);
  const out = new THREE.Vector3(middle.x, 0, middle.z).normalize();
  out.addScaledVector(SWORD_BACK_WAY, -out.dot(SWORD_BACK_WAY)).normalize();
  const across = new THREE.Vector3().crossVectors(SWORD_BACK_WAY, out);
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(across, SWORD_BACK_WAY, out));
})();
/** Only now and then he holds it (the 'sword' action): up point first, as the film has it (`[anime] rakko 1`), in
 * both paws before him (REACH_SWORD in Actions.ts). Its grip's middle there, in his body's own frame at rest
 * (metres), under his chin; its point leaning this far forward and this far out to his left (radians), clear of
 * his head. Held in one paw, as before arms bent, by a model whose arms do not: its grip this far ahead of the
 * paw's tip and in toward his middle (metres). */
const SWORD_HOLD = new THREE.Vector3(0, 0.235, 0.32);
const SWORD_FORWARD = 0.6;
const SWORD_OUT = 0.35;
const SWORD_AHEAD = 0.03;
const SWORD_INWARD = 0.02;
/** Where his ukulele is held while he plays it, in his body's own frame at rest (metres): across his tummy, out in
 * front of his cape's roll, in his paws (REACH_UKULELE in Actions.ts), its body to his right; tipped this far back
 * (radians) and its neck this far up to his left. */
const UKULELE_AT = new THREE.Vector3(-0.03, 0.27, 0.34);
const UKULELE_BACK = -0.25;
const UKULELE_UP = 0.45;
/** How much wider a grass skirt's hem spreads as they sit (a share of its radius standing), as the film's skirts
 * pool on the ground round them by the bonfire (`[anime] chiikawa 5`): shorter only, the skirt read as their
 * sinking into the ground (the user, 2026-10-23). */
const SKIRT_FLARE = 0.5;
/** A seat this much higher than the floor under it (metres) is raised: a stool, a log, a bed (see seatedHigh). */
const RAISED_SEAT = 0.06;
/** For a model without feet of its own, how far out each foot stands from their middle and how big it is, for
 * their width: as the cast's are (see sole). */
const FOOT_APART = 0.1;
const FOOT_SIZE = 0.104;
/** How arms that bend hang at rest (see locomotionPose): this much lower than built (radians), bent this much at
 * the elbow and the wrist. */
const REST_ARM = { raise: -0.3, swing: 0.2, bend: 0.5, paw: 0.25 };
/** An arm whose paw holds a thing: swung forward and bent so the thing is before them; the cave's torch raised
 * this high. */
const HOLD_ARM = { swing: 0.55, bend: 0.75, paw: 0.25, torchRaise: 0.55 };
/** Turning to face what they watch, the body stops this near it (radians) and turns this fast (a second). */
const TURN_DONE = 0.08;
const TURN_RATE = 4;
/** Bent over the water to look into it (see setBow), how much of their face's turn down is their head's own, bowing
 * about its neck, the rest their body's leaning: their head with their body under it, as one leaning over a pond
 * shows in it, rather than all of them turned over flat (a flat picture of them, seen from below) or their head
 * alone (a head with nothing under it), both of which the user found wrong (2026-10-22, 2026-10-23). */
const BOW_HEAD_SHARE = 0.52;

const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _m = new THREE.Matrix4();
const _from = new THREE.Vector3();
const _cave = new THREE.Color();
const _tint = new THREE.Color();
const _s = new THREE.Vector3();
const _eyes = new THREE.Vector3();
const _way = new THREE.Vector3();
const _toLocal = new THREE.Matrix4();
const UP = new THREE.Vector3(0, 1, 0);

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const smoothstep = (a: number, b: number, x: number) => {
  const k = clamp((x - a) / (b - a), 0, 1);
  return k * k * (3 - 2 * k);
};
const wrapAngle = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

let shadowTexture: THREE.Texture | null = null;
const shadowGeometry = new THREE.PlaneGeometry(1, 1);

function makeShadow(): THREE.Mesh {
  if (!shadowTexture) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 64;
    const c = canvas.getContext('2d');
    if (c) {
      const g = c.createRadialGradient(32, 32, 0, 32, 32, 32);
      g.addColorStop(0, 'rgba(60, 40, 30, 0.42)');
      g.addColorStop(0.6, 'rgba(60, 40, 30, 0.26)');
      g.addColorStop(1, 'rgba(60, 40, 30, 0)');
      c.fillStyle = g;
      c.fillRect(0, 0, 64, 64);
    }
    shadowTexture = new THREE.CanvasTexture(canvas);
    shadowTexture.colorSpace = THREE.SRGBColorSpace;
  }
  const mesh = new THREE.Mesh(
    shadowGeometry,
    new THREE.MeshBasicMaterial({ map: shadowTexture, transparent: true, depthWrite: false }),
  );
  mesh.rotation.x = -Math.PI / 2;
  mesh.renderOrder = 1;
  return mesh;
}

let castTexture: THREE.Texture | null = null;

/** A shadow cast along the ground: darkest at its foot (the bottom of its picture, toward the
 * character), fading toward its far end and its sides. */
function makeCastShadow(): THREE.Mesh {
  if (!castTexture) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 64;
    const c = canvas.getContext('2d');
    if (c) {
      const g = c.createRadialGradient(32, 54, 0, 32, 50, 58);
      g.addColorStop(0, 'rgba(60, 40, 30, 0.55)');
      g.addColorStop(0.5, 'rgba(60, 40, 30, 0.32)');
      g.addColorStop(1, 'rgba(60, 40, 30, 0)');
      c.fillStyle = g;
      c.fillRect(0, 0, 64, 64);
      // Soft at its sides.
      const sides = c.createLinearGradient(0, 0, 64, 0);
      sides.addColorStop(0, 'rgba(0, 0, 0, 0)');
      sides.addColorStop(0.3, 'rgba(0, 0, 0, 1)');
      sides.addColorStop(0.7, 'rgba(0, 0, 0, 1)');
      sides.addColorStop(1, 'rgba(0, 0, 0, 0)');
      c.globalCompositeOperation = 'destination-in';
      c.fillStyle = sides;
      c.fillRect(0, 0, 64, 64);
    }
    castTexture = new THREE.CanvasTexture(canvas);
    castTexture.colorSpace = THREE.SRGBColorSpace;
  }
  const mesh = new THREE.Mesh(
    shadowGeometry,
    new THREE.MeshBasicMaterial({ map: castTexture, transparent: true, depthWrite: false }),
  );
  mesh.renderOrder = 1;
  mesh.visible = false;
  return mesh;
}

/**
 * A character's shadow takes the scene's fog only where the open air's light reaches them (`openAir`, their
 * uOpenAir), as their own body does: none in the forbidden cave, which has its own light. With the island's
 * fog, a shadow far off in the cave glowed faintly with its colour (found by the cave's dark test from the
 * lake, looking at the Siren on the ledge 30 m away, 2026-10-21).
 */
function fogInOpenAir(mesh: THREE.Mesh, openAir: THREE.IUniform<number>): void {
  (mesh.material as THREE.Material).onBeforeCompile = (shader) => {
    shader.uniforms.uOpenAir = openAir;
    shader.fragmentShader = `uniform float uOpenAir;\n${shader.fragmentShader.replace('#include <fog_fragment>', FOG_FRAGMENT)}`;
  };
}

/**
 * One character: the Blender model, a soft-body shader, springs for
 * follow-through, procedural actions and a drawn face.
 */
export class Character implements EmoteHost {
  readonly def: CharacterDef;
  readonly root = new THREE.Group();
  readonly face: Face;
  readonly height: number;
  readonly width: number;
  readonly velocity = new THREE.Vector3();
  readonly pose = restPose();
  facing = 0;
  /** The face shown when no action is playing (the Test panel's choice); null for neutral. */
  expressionOverride: ExpressionId | null = null;
  /** The way they face whichever way they walk: where you look, out of their eyes (see
   * FirstPersonCamera); null to face the way they walk. */
  look: number | null = null;
  /** How far they are bent over to look into the water, 0 to 1, and where their eyes are carried to
   * then (see setBow). */
  bowAmount = 0;
  readonly bowAt = new THREE.Vector3();
  /** How far the head is bowed forward about its neck (radians, up negative) and turned to their right
   * (the model's +x side), as they watch something (see watch). Models built before the head was a part
   * of its own keep it still. */
  headPitch = 0;
  headYaw = 0;

  private readonly model: CharacterModel;
  /** Everything of them in the scene: their body (root), their shadows and what they hold (see setShown). */
  private readonly all = new THREE.Group();
  private readonly poseGroup = new THREE.Group();
  private readonly mesh: THREE.Mesh;
  /** The pen's hull round the body. */
  private readonly outline: THREE.Mesh;
  /** Whether the camera looks out of their eyes, so that they show only in the calm water's mirror
   * (see setUnseen). */
  private unseen = false;
  private readonly uniforms: CharacterUniforms;
  private readonly parts: THREE.Matrix4[];
  /** Their arms, if they bend (see Arms.ts), and how each is turned this frame. */
  private readonly armRig: ArmRig | null;
  private readonly armTurns: [ArmTurns, ArmTurns] = [0, 1].map(() => ({
    upper: new THREE.Quaternion(),
    fore: new THREE.Quaternion(),
    paw: new THREE.Quaternion(),
    shoulder: new THREE.Vector3(),
  })) as [ArmTurns, ArmTurns];
  private readonly armPose: ArmPose = { raise: 0, swing: 0, bend: 0, pawBend: 0, reach: 0, x: 0, y: 0, z: 0 };
  private readonly shadow: THREE.Mesh;
  /** The shadow the strongest firelight casts after dark, leaning away from it along the ground. */
  private readonly fireShadow: THREE.Mesh;
  /** How clearly each firelight reaches them (see FrameContext.firelight), and where the strongest
   * one burns. */
  private readonly fireSeen = new Map<number, number>();
  private readonly fireFrom = new THREE.Vector3();
  /** A torch held up in the right hand (in the cave), or none. */
  private torch: THREE.Object3D | null = null;
  /** What they hold in their right paw (one of the things one carries: see life/Items.ts), held flat on it
   * or upright in it; or none. Put away while they hold the cave's torch. */
  private hand: THREE.Object3D | null = null;
  private handFlat = false;
  /** What they always have in their left hand (see CharacterOptions.carry), or none. */
  private readonly carried: THREE.Object3D | null;
  /** What they carry with their own clothes (Rakko's sword: see CharacterOptions.own), or none. */
  private readonly ownCarried: THREE.Object3D | null;
  /** What they play (see CharacterOptions.instrument), shown while they play it; or none. */
  private readonly instrument: THREE.Object3D | null;
  /** Where they sit while riding in the boat, or null on their own feet. */
  ride: Ride | null = null;
  /** Whether what they sit on is raised off the floor under it (see RAISED_SEAT). */
  private seatedHigh = false;
  private readonly outfit: THREE.Group | null = null;
  /** Their own clothes, worn instead of the island outfit (see CharacterOptions.own), or none. */
  private readonly ownOutfit: THREE.Group | null = null;
  /** Whether outfits are on at all (the Test panel's 島の衣装), and whether someone with clothes of their own
   * wears the island outfit instead (only ever from the Test panel). */
  private outfitsOn = true;
  private islandInstead = false;
  /** The skirt's height when seated, as a fraction of standing, so its hem settles on the ground. */
  private readonly skirtSeat: number = 1;
  /** Wears a grass skirt that is part of the model (the islanders), not an outfit. */
  private readonly ownSkirt: boolean;
  private emotes: EmoteSystem | null = null;

  private readonly desired = new THREE.Vector3();
  private readonly accel = new THREE.Vector3();
  /** What they keep their eyes on (see watch), and how. */
  private watching = false;
  private readonly watchAt = new THREE.Vector3();
  private watchLook: HeadLook = HEAD_LOOK;
  /** Turning their body to face what they watch, their head having turned past where it turns. */
  private turningToWatch = false;
  private targetFacing = 0;
  private phase = 0;
  private time = Math.random() * 10;
  private jumpY = 0;
  private vy = 0;
  private airborne = false;
  /** Where the character's feet are when not jumping: the ground, or the deck they stand on. */
  private feet = NaN;
  /** How deep in the trees' shade they stand (see FrameContext.shade); NaN until first measured. */
  private shaded = NaN;
  /** Whether they are in the forbidden cave, lit by its own light (see updateShade). */
  private inCave = false;
  private crouch = -1;

  private readonly squash = new Spring(3.0, 0.2, 1);
  private readonly leanX = new Spring(2.4, 0.32);
  private readonly leanZ = new Spring(2.4, 0.32);
  private readonly earPitch = [new Spring(4.5, 0.16), new Spring(4.5, 0.16)];
  private readonly earRoll = [new Spring(4.5, 0.16), new Spring(4.5, 0.16)];
  private readonly earBend = [new Spring(3.2, 0.14), new Spring(3.2, 0.14)];
  private readonly skirtX = new Spring(3.2, 0.25);
  private readonly skirtY = new Spring(2.5, 0.3);
  private readonly skirtZ = new Spring(3.2, 0.25);
  private readonly sprout = new Spring(3.6, 0.15);

  private action: { id: ActionId; t: number } | null = null;
  private blending = false;
  private blendT = 0;
  private blendDur = 0.2;
  private readonly blendFrom = restPose();
  private readonly base = restPose();
  private readonly target = restPose();

  // Out of their own eyes no one sees the marks and words over their own head: they show on the screen.
  private readonly actionCtx: ActionContext = {
    emote: (kind, side) => {
      if (this.unseen) this.emotes?.own?.mark(kind);
      else this.emotes?.spawn(kind, this, side ?? 1);
    },
    say: (key) => {
      if (this.unseen) this.emotes?.own?.words(t(key));
      else this.emotes?.say(this, t(key));
    },
  };

  constructor(def: CharacterDef, model: CharacterModel, options: CharacterOptions = {}) {
    this.def = def;
    this.model = model;
    this.height = model.rig.height;
    this.width = model.rig.width;
    const layers = options.crowd ? null : model.faceLayers;
    this.face = new Face(def.face, options.crowd ? 256 : 768, layers);
    this.parts = Array.from({ length: MAX_PARTS }, () => new THREE.Matrix4());
    this.armRig = ArmRig.of(model);
    this.uniforms = makeCharacterUniforms(model.rig, this.parts, this.face.texture, model.maskTexture);
    this.uniforms.uLineBias.value = 0.045 * model.rig.headR / 0.45;
    // Which parts are their head (see uHeadParts): the head and all that hangs from it; none for a model whose
    // head is not a part of its own (it bows with its body).
    let head = 0;
    for (let i = 0; i < MAX_PARTS; i++) {
      for (let p = i, depth = 0; p >= 0 && depth < MAX_PARTS; p = model.parents[p] ?? -1, depth++) {
        if (p === PART.HEAD) head |= 1 << i;
      }
    }
    this.uniforms.uHeadParts.value = model.hasHead ? head : 0;
    if (options.crowd) {
      const c = new THREE.Color(options.crowd.color);
      this.uniforms.uColorOverride.value.set(c.r, c.g, c.b, 0.86);
    }
    const { body, outline } = createCharacterMaterials(this.uniforms, { fur: !!model.rig.fur && !options.crowd });
    this.mesh = new THREE.Mesh(model.geometry, body);
    this.outline = new THREE.Mesh(model.geometry, outline);
    this.poseGroup.add(this.mesh, this.outline);
    // An outfit is a separate asset, drawn with the wearer's own deformation so it moves with them.
    const wear = (o: OutfitModel): THREE.Group => {
      const mats = createCharacterMaterials(makeOutfitUniforms(this.uniforms, o.info), { billboard: o.billboard });
      const group = new THREE.Group();
      group.add(new THREE.Mesh(o.geometry, mats.body), new THREE.Mesh(o.geometry, mats.outline));
      this.poseGroup.add(group);
      return group;
    };
    if (options.outfit) this.outfit = wear(options.outfit);
    if (options.own) this.ownOutfit = wear(options.own.outfit);
    this.ownCarried = options.own?.carry ?? null;
    this.instrument = options.instrument ?? null;
    if (this.instrument) this.instrument.visible = false;
    this.showOutfits();
    const ownSkirt = model.rig.patterns?.skirt ?? null;
    this.ownSkirt = ownSkirt !== null;
    const skirt = ownSkirt ?? options.outfit?.info.skirt ?? null;
    const waist = model.pivots[PART.SKIRT].y;
    if (skirt && waist > skirt.bottom) {
      this.skirtSeat = clamp((waist - model.seat.drop) / (waist - skirt.bottom), 0.4, 1);
    }
    this.root.add(this.poseGroup);
    this.shadow = makeShadow();
    this.fireShadow = makeCastShadow();
    fogInOpenAir(this.shadow, this.uniforms.uOpenAir);
    fogInOpenAir(this.fireShadow, this.uniforms.uOpenAir);
    this.carried = options.carry ?? null;
    // What they hold is lit as their hand is.
    for (const thing of [this.carried, this.ownCarried, this.instrument]) {
      const held = thing?.userData.light as HeldLight | undefined;
      if (held) {
        held.uShade = this.uniforms.uShade;
        held.uOpenAir = this.uniforms.uOpenAir;
      }
    }
    this.updateParts();
  }

  get position(): THREE.Vector3 {
    return this.root.position;
  }

  get actionId(): ActionId | null {
    return this.action?.id ?? null;
  }

  /** How long the action they play has played (seconds), or 0. */
  get actionTime(): number {
    return this.action?.t ?? 0;
  }

  /**
   * How what they do turns their head off the way they stand, for the eyes that look out of it
   * (FirstPersonCamera): x forward (a bow), y round to their left (a look about), z over to their left (a
   * dance's sway), in radians; eased in and out as the action is. A body's lean bends it most at the head.
   */
  actionTilt(out: THREE.Vector3): THREE.Vector3 {
    const p = this.pose;
    const b = this.base;
    return out.set(
      p.rootPitch - b.rootPitch + (p.leanZ - b.leanZ) * HEAD_BEND,
      p.rootYaw - b.rootYaw,
      (p.leanX - b.leanX) * HEAD_BEND - (p.rootRoll - b.rootRoll),
    );
  }

  get hasOutfit(): boolean {
    return this.outfit !== null || this.ownOutfit !== null;
  }

  /** Whether the camera looks out of their eyes (see setUnseen). */
  get lookedOutOf(): boolean {
    return this.unseen;
  }

  /** Put their outfit on or take it off: the island outfit, or their own clothes if they have them. Characters
   * without one ignore this. */
  setOutfitVisible(on: boolean): void {
    this.outfitsOn = on;
    this.showOutfits();
  }

  /** For someone with clothes of their own (Rakko), whether they wear the island outfit instead: only ever from
   * the Test panel. Others ignore this. */
  wearIsland(on: boolean): void {
    this.islandInstead = on;
    this.showOutfits();
  }

  private showOutfits(): void {
    const own = this.ownOutfit !== null && !this.islandInstead;
    if (this.outfit) this.outfit.visible = this.outfitsOn && !own;
    if (this.ownOutfit) this.ownOutfit.visible = this.outfitsOn && own;
  }

  attach(scene: THREE.Object3D, emotes: EmoteSystem): void {
    this.all.add(this.root, this.shadow, this.fireShadow);
    for (const thing of [this.carried, this.ownCarried, this.instrument]) if (thing) this.all.add(thing);
    scene.add(this.all);
    this.emotes = emotes;
    if (FILM) {
      // The calm water mirrors them (see MIRROR_LAYER): their body, their outfit and what they hold,
      // not their lines (the pen's hulls, drawn by their back faces) nor their shadows.
      this.mesh.layers.enable(MIRROR_LAYER);
      this.outfit?.children[0].layers.enable(MIRROR_LAYER);
      this.ownOutfit?.children[0].layers.enable(MIRROR_LAYER);
      for (const thing of [this.carried, this.ownCarried, this.instrument]) {
        thing?.traverse((o) => {
          const m = o as THREE.Mesh;
          if (m.isMesh && (m.material as THREE.Material).side !== THREE.BackSide) m.layers.enable(MIRROR_LAYER);
        });
      }
    }
  }

  /** Whether they are drawn at all, with their shadows and what they hold: not while they are out of sight
   * indoors, nor far off (see life/Life.ts). */
  setShown(on: boolean): void {
    this.all.visible = on;
  }

  get shown(): boolean {
    return this.all.visible;
  }

  /** Moves them, their shadows and what they hold, into `parent` (the Siren out of the cave to the sea). */
  reattach(parent: THREE.Object3D): void {
    parent.add(this.all);
  }

  /**
   * Whether the camera looks out of their eyes. Then it draws none of them (layer 0 is the camera's):
   * not their body, their lines nor their outfit, which only the calm water's mirror shows
   * (MIRROR_LAYER), marked so the water knows them for your own reflection (uMark) and shows it
   * clearly; nor the marks and words over their head; nor what they hold in their right paw or play,
   * which you see in your paw before your eyes instead (HandView). Their shadows stay on the ground under
   * them, and the cave's torch held up, in view.
   */
  setUnseen(on: boolean): void {
    if (on === this.unseen) return;
    this.unseen = on;
    for (const o of [this.mesh, this.outline, ...(this.outfit?.children ?? []), ...(this.ownOutfit?.children ?? [])]) {
      if (on) o.layers.disable(0);
      else o.layers.enable(0);
    }
    // What they hold and play too: out of their own eyes, you see it in your paw before you (HandView), not
    // here, where it would show again under the camera.
    for (const thing of [this.hand, this.instrument]) {
      thing?.traverse((o) => {
        if (!(o as THREE.Mesh).isMesh) return;
        if (on) o.layers.disable(0);
        else o.layers.enable(0);
      });
    }
    this.uniforms.uMark.value = on ? 2 : 0.5;
    if (!on) this.setBow(null);
  }

  /**
   * Out of their own eyes, bent over to look into the water (see Game.lookIntoWater): the middle of
   * their eyes carried to `at` and their face turned the way `toward` points (both in the world), `amount`
   * of the way (0 or null: standing as they are). Only the body is bent, in its shader, and only the
   * water's mirror shows it: their anchors, what they hold and the camera at their eyes stay where they
   * are.
   */
  setBow(at: THREE.Vector3 | null, toward: THREE.Vector3 | null = null, amount = 0): void {
    const bow = this.uniforms.uBow.value;
    const nod = this.uniforms.uBowHead.value;
    const standing = !at || !toward || amount <= 1e-3;
    // Bent, the body is carried out past the bounds it is culled by (which the shader cannot move).
    this.mesh.frustumCulled = standing;
    for (const o of [...(this.outfit?.children ?? []), ...(this.ownOutfit?.children ?? [])]) o.frustumCulled = standing;
    if (standing) {
      bow.set(0, 1, 0, 0);
      nod.set(0, 1, 0, 0);
      this.bowAmount = 0;
      return;
    }
    this.bowAt.copy(at);
    this.bowAmount = amount;
    // In the body's own frame (as its shader bends it): its front +z, up +y.
    this.mesh.updateWorldMatrix(true, false);
    _toLocal.copy(this.mesh.matrixWorld).invert();
    const eyes = this.anchorLocal('eyeL', _eyes).add(this.anchorLocal('eyeR', _v)).multiplyScalar(0.5);
    const to = _v.copy(at).applyMatrix4(_toLocal);
    const way = _way.copy(toward).transformDirection(_toLocal);
    // Their face turned that way, as far as `amount` goes: their head bowing its share about its neck, their body
    // leaning the rest (a model whose head is no part of its own turns as one).
    const turn = Math.atan2(-way.y, way.z) * amount;
    const neck = this.model.pivots[PART.HEAD];
    const headTurn = this.model.hasHead && neck ? turn * BOW_HEAD_SHARE : 0;
    const sn = Math.sin(headTurn);
    const cn = Math.cos(headTurn);
    const ny = neck?.y ?? 0;
    const nz = neck?.z ?? 0;
    nod.set(sn, cn, ny, nz);
    // Where the bowed head puts their eyes.
    const ey = ny + (eyes.y - ny) * cn - (eyes.z - nz) * sn;
    const ez = nz + (eyes.y - ny) * sn + (eyes.z - nz) * cn;
    const lean = turn - headTurn;
    const s = Math.sin(lean);
    const c = Math.cos(lean);
    // Their eyes carried along the straight way to `at` as they bend.
    const y = eyes.y + (to.y - eyes.y) * amount;
    const z = eyes.z + (to.z - eyes.z) * amount;
    bow.set(s, c, y - (ey * c - ez * s), z - (ey * s + ez * c));
  }

  setDesiredVelocity(v: THREE.Vector3): void {
    this.desired.set(v.x, 0, v.z);
  }

  faceToward(x: number, z: number): void {
    const dx = x - this.root.position.x;
    const dz = z - this.root.position.z;
    if (dx * dx + dz * dz > 1e-4) this.targetFacing = Math.atan2(dx, dz);
  }

  setFacing(yaw: number): void {
    this.targetFacing = yaw;
  }

  /** Keeps their eyes on `at` (a point, as someone's eyes), as `look` says: their head turns to it and,
   * past where it turns, their body. Null: they look ahead again. Call before update. */
  watch(at: THREE.Vector3 | null, look: HeadLook = HEAD_LOOK): void {
    this.watching = at !== null;
    if (at) this.watchAt.copy(at);
    this.watchLook = look;
  }

  /** Puts them at (x, z) facing `yaw`, on the ground there; or, given `feet`, on whatever is within a
   * step of that height (the cave's floor under the island's ground). */
  teleport(x: number, z: number, yaw: number, feet = NaN): void {
    this.root.position.set(x, Number.isNaN(feet) ? 0 : feet, z);
    this.feet = feet;
    this.shaded = NaN;
    this.airborne = false;
    this.jumpY = 0;
    this.vy = 0;
    this.crouch = -1;
    this.velocity.set(0, 0, 0);
    this.desired.set(0, 0, 0);
    this.facing = this.targetFacing = yaw;
    this.headPitch = this.headYaw = 0;
    this.turningToWatch = false;
  }

  jump(): void {
    if (this.airborne || this.crouch >= 0) return;
    if (this.action && !ACTIONS[this.action.id].allowMove) this.stopAction();
    this.crouch = 0.07;
  }

  play(id: ActionId): void {
    const prop = ACTIONS[id].prop;
    // Only someone with an instrument plays it, and someone with a sword holds it.
    if ((prop === 'ukulele' && !this.instrument) || (prop === 'sword' && !this.ownCarried)) return;
    this.startBlend(ACTIONS[id].fadeIn);
    this.action = { id, t: 0 };
    // (Eating what they hold, it goes to their mouth: see placeHand.)
    if (this.instrument) this.instrument.visible = prop === 'ukulele';
  }

  /** Holds a torch up in the right hand, or puts it away (null). The torch is the caller's to add to
   * the scene; it is moved with the hand each frame. */
  holdTorch(torch: THREE.Object3D | null): void {
    if (this.torch && this.torch !== torch) this.torch.visible = false;
    this.torch = torch;
    if (torch) torch.visible = true;
  }

  get holdsTorch(): boolean {
    return this.torch !== null;
  }

  /**
   * Puts `thing` (made by createHeld: one of the things one carries) in their right paw, upright in it or
   * `flat` on it, or empties it (null). It goes with them as they go (shown, hidden and moved with the rest
   * of them), lit as their paw is; while they eat, it is held up to their mouth instead (see play). The
   * calm water mirrors it as it does them; out of their own eyes, only the water shows it (see setUnseen).
   * The thing it held before is taken out of the scene.
   */
  hold(thing: THREE.Object3D | null, flat = false): void {
    if (this.hand && this.hand !== thing) this.hand.removeFromParent();
    this.hand = thing;
    this.handFlat = flat;
    if (!thing) return;
    this.all.add(thing);
    thing.visible = true;
    thing.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      if (FILM && (m.material as THREE.Material).side !== THREE.BackSide) m.layers.enable(MIRROR_LAYER);
      if (this.unseen) m.layers.disable(0);
      else m.layers.enable(0);
    });
  }

  /** What they hold in their right paw (see hold), or null. */
  get holding(): THREE.Object3D | null {
    return this.hand;
  }

  /** Lights a held thing's `light` (see createHeld) as their paw is lit. */
  lightHeld(light: HeldLight): void {
    light.uShade.value.copy(this.uniforms.uShade.value);
    light.uOpenAir.value = this.uniforms.uOpenAir.value;
  }

  stopAction(): void {
    if (!this.action) return;
    this.startBlend(ACTIONS[this.action.id].fadeOut);
    this.action = null;
    if (this.instrument) this.instrument.visible = false;
  }

  update(dt: number, ctx: FrameContext): void {
    this.time += dt;
    this.updateLocomotion(dt, ctx);
    this.updateHead(dt);
    this.updatePose(dt);
    this.updateSprings(dt);
    this.updateParts();
    this.root.updateMatrixWorld(true);
    this.updateFace(dt, ctx);
    this.updateShade(dt, ctx);
    this.updateShadowAndProp(ctx);
  }

  /** World position of a rig anchor, following the current pose and squash. */
  getAnchor(name: AnchorName, out: THREE.Vector3): THREE.Vector3 {
    return this.mesh.localToWorld(this.anchorLocal(name, out));
  }

  /** Where a point of their head (in their model's own frame, at rest) is now in the world: as their head
   * turns and bows (see watch), squashed and leaning as their shader draws it. Where something riding on it
   * sits: the Siren's little mermaids (see LittleMermaids). */
  headPoint(local: THREE.Vector3, out: THREE.Vector3): THREE.Vector3 {
    return this.mesh.localToWorld(this.partPoint(out.copy(local), PART.HEAD));
  }

  /** Where a point of their body (in their model's own frame, at rest) is now in the world, squashed and leaning
   * as their shader draws it: where what they play is held (see UKULELE_AT). */
  private bodyPoint(local: THREE.Vector3, out: THREE.Vector3): THREE.Vector3 {
    return this.mesh.localToWorld(this.partPoint(out.copy(local), PART.BODY));
  }

  /** A rig anchor in the body's own frame (its mesh's), following the current pose and squash as its
   * shader does, but not its bow (see setBow). */
  private anchorLocal(name: AnchorName, out: THREE.Vector3): THREE.Vector3 {
    // The hands' are the tips of their paws (or of the arm, where it does not bend); the rest are on the head,
    // which is the body but for a head of its own (see headPitch).
    const bends = !!this.armRig;
    const part =
      name === 'handL' ? (bends ? PART.PAW_L : PART.ARM_L) : name === 'handR' ? (bends ? PART.PAW_R : PART.ARM_R) : PART.HEAD;
    return this.partPoint(out.copy(this.model.anchors[name]), part);
  }

  /** A point of a part, given in the model's own frame at rest (`out`), moved to where the part, the squash
   * and the lean now put it in the body's own frame, as the shader moves it. */
  private partPoint(out: THREE.Vector3, part: number): THREE.Vector3 {
    out.applyMatrix4(this.parts[part]);
    const s = this.uniforms.uSquash.value;
    const k = 1 / Math.sqrt(s);
    const lean = this.uniforms.uLean.value;
    const h = Math.max(out.y, 0) / this.height;
    out.y *= s;
    out.x = out.x * k + lean.x * h * h * this.height;
    out.z = out.z * k + lean.y * h * h * this.height;
    return out;
  }

  // ------------------------------------------------------------------ internals
  private startBlend(duration: number): void {
    copyPose(this.pose, this.blendFrom);
    this.blending = true;
    this.blendT = 0;
    this.blendDur = Math.max(0.01, duration);
  }

  private speed(): number {
    return Math.hypot(this.velocity.x, this.velocity.z);
  }

  private updateLocomotion(dt: number, ctx: FrameContext): void {
    const prevX = this.velocity.x;
    const prevZ = this.velocity.z;
    _v.copy(this.desired).sub(this.velocity);
    _v.y = 0;
    const maxDv = ACCEL * dt;
    if (_v.lengthSq() > maxDv * maxDv) _v.setLength(maxDv);
    this.velocity.add(_v);

    const pos = this.root.position;
    // A seat raised off the floor under it (a stool, a log, a bed, the pier's edge, the boat), not the ground.
    this.seatedHigh =
      !!this.ride && this.ride.y - ctx.groundHeight(this.ride.x, this.ride.z, this.ride.y) > RAISED_SEAT;
    if (this.ride) {
      // Riding: they sit where the boat carries them.
      pos.set(this.ride.x, this.ride.y, this.ride.z);
      this.feet = this.ride.y;
      this.jumpY = 0;
      this.vy = 0;
      this.airborne = false;
      this.crouch = -1;
      this.velocity.set(0, 0, 0);
      this.facing = this.targetFacing = this.ride.yaw;
      this.root.rotation.y = this.facing;
      return;
    }
    if (Number.isNaN(this.feet)) this.feet = ctx.groundHeight(pos.x, pos.z);
    _from.copy(pos);
    _from.y = this.feet;
    pos.x += this.velocity.x * dt;
    pos.z += this.velocity.z * dt;
    // In the air they carry on over gaps, drops and water, stopped only by what stands higher than
    // their feet; on their feet they keep to what they can walk on.
    if (this.airborne && ctx.air) ctx.air(pos, _from, this.feet + this.jumpY);
    else ctx.clamp(pos, _from);

    const inv = 1 / Math.max(dt, 1e-4);
    const k = Math.min(1, dt * 12);
    this.accel.x += ((this.velocity.x - prevX) * inv - this.accel.x) * k;
    this.accel.z += ((this.velocity.z - prevZ) * inv - this.accel.z) * k;

    const speed = this.speed();
    if (this.look !== null) this.targetFacing = this.look;
    else if (speed > 0.15) this.targetFacing = Math.atan2(this.velocity.x, this.velocity.z);
    // Turning after their head to what they watch, unhurried.
    this.facing += wrapAngle(this.targetFacing - this.facing) * Math.min(1, dt * (this.turningToWatch ? TURN_RATE : 10));

    const run = smoothstep(this.def.walkSpeed * 0.95, this.def.runSpeed * 0.9, speed);
    this.phase += (speed / (0.62 + 0.43 * run)) * Math.PI * 2 * dt;
    if (this.action && speed > 0.3 && !ACTIONS[this.action.id].allowMove) this.stopAction();

    if (this.crouch >= 0) {
      this.crouch -= dt;
      if (this.crouch < 0) {
        this.vy = JUMP_SPEED;
        this.airborne = true;
        this.squash.velocity += 2.5;
      }
    }
    if (this.airborne && ctx.air) {
      // Their feet's height in the air against what is under them where they are now: a deck or
      // ground they come down on (or one a step above them, which they land on all the same), water
      // too deep to stand in (they climb out at the nearest shore), or nothing yet.
      this.vy += GRAVITY * dt;
      const was = this.feet + this.jumpY;
      const y = was + this.vy * dt;
      const under = ctx.groundHeight(pos.x, pos.z, Math.max(y, was));
      if (y <= under) {
        this.feet = under;
        this.jumpY = 0;
        this.land();
      } else if (ctx.splash?.(pos, y)) {
        this.feet = ctx.groundHeight(pos.x, pos.z);
        this.jumpY = 0;
        this.vy = 0;
        this.airborne = false;
        this.velocity.set(0, 0, 0);
      } else {
        this.feet = under;
        this.jumpY = y - under;
      }
    } else {
      if (this.airborne) {
        this.vy += GRAVITY * dt;
        this.jumpY += this.vy * dt;
        if (this.jumpY <= 0) {
          this.jumpY = 0;
          this.land();
        }
      }
      const below = ctx.groundHeight(pos.x, pos.z, this.feet);
      if (!this.airborne && ctx.air && below < this.feet - DROP) {
        // Walked off an edge: they fall from where their feet were.
        this.airborne = true;
        this.vy = 0;
        this.jumpY = this.feet - below;
      }
      this.feet = below;
    }
    pos.y = this.feet + this.jumpY;
    this.root.rotation.y = this.facing;
  }

  /** Squeezed past by someone, or squeezing past them (see life/Life.ts): a little squash, soft as they are. */
  jostle(): void {
    this.squash.velocity -= 1.4;
  }

  /** Coming down on their feet: a squash and a bounce of the ears, as hard as they came down. */
  private land(): void {
    const impact = Math.min(1.4, -this.vy / JUMP_SPEED);
    this.vy = 0;
    this.airborne = false;
    this.squash.velocity -= 3.2 * impact;
    for (const s of this.earBend) s.velocity += 7 * impact;
    for (const s of this.earPitch) s.velocity += 2.5 * impact;
  }

  /** Whether they are off the ground: jumping, falling, or crouched to jump. In the air, feetY is the
   * ground under them, not where they will land (falling off the pier, the sea's floor). */
  get inAir(): boolean {
    return this.airborne || this.jumpY > 1e-3;
  }

  /** Height of the character's feet when not jumping: what they stand on. */
  get feetY(): number {
    return Number.isNaN(this.feet) ? this.root.position.y : this.feet;
  }

  /** Steps taken so far as they walk: one more each time a foot comes down (see locomotionPose), the left
   * foot's on odd counts. For the prints they leave (see world/Footprints.ts). */
  get steps(): number {
    return Math.floor(this.phase / Math.PI + 0.5);
  }

  /** Where their left (side 0) or right (1) foot stands now, in the world (`at`, its y their feet's height),
   * and how wide and long it is (`size`). A model without feet of its own (the crowd's, yours) stands on feet
   * as far apart and as big for its width as the cast's. */
  sole(side: 0 | 1, at: THREE.Vector3, size: THREE.Vector2): void {
    const foot = this.model.seat.feet[side];
    const x = foot ? foot.hip.x : (side === 0 ? -FOOT_APART : FOOT_APART) * this.width;
    const z = (foot ? foot.hip.z : 0) + (side === 0 ? this.pose.footLZ : this.pose.footRZ);
    const c = Math.cos(this.facing);
    const s = Math.sin(this.facing);
    const p = this.root.position;
    at.set(p.x + x * c + z * s, this.feetY, p.z - x * s + z * c);
    if (foot) size.copy(foot.sole);
    else size.setScalar(FOOT_SIZE * this.width);
  }

  private locomotionPose(): void {
    const p = resetPose(this.base);
    const tm = this.time;
    p.squash = 1 + 0.014 * Math.sin(tm * 2.3);
    p.armLRaise = p.armRRaise = 0.04 * Math.sin(tm * 2.3 + 0.8);
    if (this.armRig) {
      // Arms that bend hang a little lower than the stubs did, soft at the elbow and the wrist, their paws in by
      // their sides as the plush's are.
      p.armLRaise = p.armRRaise = REST_ARM.raise + 0.04 * Math.sin(tm * 2.3 + 0.8);
      p.armLSwing = p.armRSwing = REST_ARM.swing;
      p.armLBend = p.armRBend = REST_ARM.bend;
      p.pawLBend = p.pawRBend = REST_ARM.paw;
      // A paw that holds a thing brings it up before them (see placeHand), and the cave's torch higher.
      if (this.torch) {
        p.armRRaise = HOLD_ARM.torchRaise;
        p.armRSwing = HOLD_ARM.swing;
        p.armRBend = HOLD_ARM.bend;
      } else if (this.hand && !this.instrument?.visible) {
        p.armRSwing = HOLD_ARM.swing;
        p.armRBend = HOLD_ARM.bend;
        p.pawRBend = HOLD_ARM.paw;
      }
      if (this.carried) {
        // Kurimanju's can, in the other paw.
        p.armLSwing = HOLD_ARM.swing;
        p.armLBend = HOLD_ARM.bend;
        p.pawLBend = HOLD_ARM.paw;
      }
    }
    const speed = this.speed();
    const walk = smoothstep(0.05, 0.5, speed);
    if (walk <= 0) return;
    const run = smoothstep(this.def.walkSpeed * 0.95, this.def.runSpeed * 0.9, speed);
    const s = Math.sin(this.phase);
    const c = Math.cos(this.phase);
    const amp = 1 + 0.6 * run;
    p.rootY += walk * Math.abs(s) * 0.035 * amp;
    p.squash += walk * (Math.abs(s) - 0.5) * 0.05 * amp;
    p.leanX += walk * s * 0.03 * (1 - 0.5 * run);
    p.rootYaw += walk * s * 0.07;
    p.rootRoll += walk * s * 0.035;
    p.footLZ += walk * s * 0.07 * amp;
    p.footRZ -= walk * s * 0.07 * amp;
    p.footLY += walk * Math.max(0, c) * 0.035 * amp;
    p.footRY += walk * Math.max(0, -c) * 0.035 * amp;
    p.armLSwing -= walk * s * 0.45 * amp;
    p.armRSwing += walk * s * 0.45 * amp;
    p.armLRaise += walk * (0.12 + 0.25 * run);
    p.armRRaise += walk * (0.12 + 0.25 * run);
    p.skirtY += walk * s * 0.05;
    p.earBend -= walk * run * 0.25;
  }

  /** Whether they hold up what they carry with their own clothes (Rakko's sword), in its action ('sword'); it is
   * on their back otherwise. */
  private get holdsOwn(): boolean {
    return !!this.ownCarried && !!this.ownOutfit?.visible && !!this.action && ACTIONS[this.action.id].prop === 'sword';
  }

  private updatePose(dt: number): void {
    this.locomotionPose();
    copyPose(this.base, this.target);
    const a = this.action;
    if (a) {
      const def = ACTIONS[a.id];
      const prev = a.t;
      a.t += dt;
      def.pose(a.t, this.target);
      def.tick?.(a.t, prev, this.actionCtx);
      if (a.t >= def.duration) this.stopAction();
    }
    if (this.blending) {
      this.blendT += dt;
      lerpPose(this.blendFrom, this.target, smoothstep(0, 1, this.blendT / this.blendDur), this.pose);
      if (this.blendT >= this.blendDur) this.blending = false;
    } else {
      copyPose(this.target, this.pose);
    }
  }

  private updateSprings(dt: number): void {
    const p = this.pose;
    const cf = Math.cos(this.facing);
    const sf = Math.sin(this.facing);
    const ax = clamp(this.accel.x * cf - this.accel.z * sf, -20, 20);
    const az = clamp(this.accel.x * sf + this.accel.z * cf, -20, 20);

    let squashTarget = p.squash;
    if (this.crouch >= 0) squashTarget -= 0.12;
    if (this.airborne) squashTarget += this.vy > 0 ? 0.07 : -0.02;
    const sq = this.squash.update(squashTarget, dt);
    const lx = this.leanX.update(p.leanX - ax * 0.004, dt);
    const lz = this.leanZ.update(p.leanZ + this.speed() * 0.014 - az * 0.004, dt);

    const air = this.airborne ? clamp(this.vy * 0.025, -0.3, 0.3) : 0;
    this.earPitch[0].update(p.earLPitch - lz * 1.5 - air, dt);
    this.earPitch[1].update(p.earRPitch - lz * 1.5 - air, dt);
    this.earRoll[0].update(p.earLRoll + (1 - sq) * 1.2 + lx * 1.2, dt);
    this.earRoll[1].update(p.earRRoll + (1 - sq) * 1.2 - lx * 1.2, dt);
    this.earBend[0].update(p.earBend - this.earPitch[0].velocity * 0.06 + (1 - sq) * 1.5, dt);
    this.earBend[1].update(p.earBend - this.earPitch[1].velocity * 0.06 + (1 - sq) * 1.5, dt);
    this.skirtX.update(p.skirtX + az * 0.008, dt);
    this.skirtY.update(p.skirtY, dt);
    this.skirtZ.update(p.skirtZ - ax * 0.008, dt);
    this.sprout.update(p.sprout - lx * 2.5 - this.leanX.velocity * 0.3, dt);

    this.uniforms.uSquash.value = clamp(sq, 0.6, 1.4);
    this.uniforms.uLean.value.set(lx, lz);
  }

  /** Their head toward what they watch (see watch), and their body after it once the head has turned past
   * where it turns; their head back to looking ahead when they watch nothing. */
  private updateHead(dt: number): void {
    const look = this.watchLook;
    let yaw = 0;
    let pitch = 0;
    if (this.watching) {
      const pos = this.root.position;
      const at = this.watchAt;
      const way = Math.atan2(at.x - pos.x, at.z - pos.z);
      const off = wrapAngle(way - this.facing);
      // Walking, they face the way they go (the user: turned to what they watch, they walked sideways) and
      // only glance with their head (see WALKING_LOOK).
      const walking = this.speed() > WALKING;
      if (walking) this.turningToWatch = false;
      if (look.turn !== null && !walking) {
        // Only once the head has turned that far itself.
        if (Math.abs(off) > look.turn && Math.abs(this.headYaw) > 0.9 * Math.min(look.turn, look.yaw)) this.turningToWatch = true;
        if (this.turningToWatch) {
          this.targetFacing = way;
          if (Math.abs(off) < TURN_DONE) this.turningToWatch = false;
        }
      }
      // Up or down from their eyes, by how far off it is from them.
      const ahead = this.model.anchors.eyeL.z;
      const flat = Math.hypot(at.x - pos.x - Math.sin(this.facing) * ahead, at.z - pos.z - Math.cos(this.facing) * ahead);
      const rise = this.feetY + this.model.rig.eyeY - at.y;
      // A head whose body never turns, or a walker's, gives up on what is too far round to one side.
      const reach = walking ? look.yaw * WALKING_LOOK : look.yaw;
      const keep = look.turn === null || walking ? 1 - smoothstep(reach, reach + 0.7, Math.abs(off)) : 1;
      yaw = clamp(off, -reach, reach) * keep;
      pitch = clamp(Math.atan2(rise, Math.max(flat, 0.1)) * look.share, -look.up, look.down) * keep;
    } else {
      this.turningToWatch = false;
    }
    // A model built before its head turned on its own turns only its body.
    if (!this.model.hasHead) yaw = pitch = 0;
    const k = 1 - Math.exp(-look.rate * dt);
    this.headYaw += (yaw - this.headYaw) * k;
    this.headPitch += (pitch - this.headPitch) * k;
  }

  /** Arm i (0 left, 1 right) of an arm that bends, posed by its angles and reach (see ArmRig.solve). */
  private poseArm(
    i: 0 | 1,
    raise: number,
    swing: number,
    bend: number,
    pawBend: number,
    reach: number,
    x: number,
    y: number,
    z: number,
  ): void {
    const rig = this.armRig as ArmRig;
    const a = this.armPose;
    a.raise = raise;
    a.swing = swing;
    a.bend = bend;
    a.pawBend = pawBend;
    a.reach = reach;
    a.x = x;
    a.y = y;
    a.z = z;
    // The head is turned before the arms (see updateParts), so points by the face can go with it.
    const turns = rig.solve(i, a, this.armTurns[i], this.model.hasHead ? this.parts[PART.HEAD] : null);
    const [upper, fore, paw] = rig.parts(i);
    this.setPartTurn(upper, turns.upper, turns.shoulder);
    this.setPartTurn(fore, turns.fore);
    this.setPartTurn(paw, turns.paw);
  }

  /** Turns part i by `q` about its pivot (as setPart, given a turn instead of angles), its pivot moved to `at` if
   * given (an arm's shoulder, slid round the body). */
  private setPartTurn(i: number, q: THREE.Quaternion, at?: THREE.Vector3): void {
    const pivot = this.model.pivots[i];
    const m = this.parts[i];
    m.compose(at ?? pivot, q, _s.set(1, 1, 1));
    m.multiply(_m.makeTranslation(-pivot.x, -pivot.y, -pivot.z));
    const parent = this.model.parents[i];
    if (parent >= 0) m.premultiply(this.parts[parent]);
  }

  /** Turns part i about its pivot, moves it by (ox, oy, oz) and scales its height by sy. */
  private setPart(i: number, rx: number, ry: number, rz: number, ox = 0, oy = 0, oz = 0, sy = 1): void {
    const pivot = this.model.pivots[i];
    const m = this.parts[i];
    _q.setFromEuler(_e.set(rx, ry, rz, 'YXZ'));
    _p.set(pivot.x + ox, pivot.y + oy, pivot.z + oz);
    m.compose(_p, _q, _s.set(1, sy, 1));
    m.multiply(_m.makeTranslation(-pivot.x, -pivot.y, -pivot.z));
    const parent = this.model.parents[i];
    if (parent >= 0) m.premultiply(this.parts[parent]);
  }

  /**
   * Arms hung under the curve of the head (the downloaded models) would sink into it when
   * raised high, so they stop at the rig's reach and come forward instead: a wave or a cheer
   * then happens in front of the face, where it stays in view.
   */
  private armAngles(raise: number, swing: number): [number, number] {
    const reach = this.model.rig.armReach;
    if (reach == null || raise <= reach) return [raise, swing];
    return [reach, swing + (raise - reach) * 0.6];
  }

  /**
   * A foot, moved by the pose. As the character sits, the leg turns about its hip to stretch
   * out in front, and the hip moves to where the model sits.
   */
  private setFoot(i: number, side: 0 | 1, ox: number, oy: number, oz: number): void {
    const foot = this.model.seat.feet[side];
    const sit = this.pose.sit;
    if (!foot || sit <= 0) {
      this.setPart(i, 0, 0, 0, ox, oy, oz);
      return;
    }
    // A skirt covers seated feet, so they tuck in under it.
    const tuck = this.ownSkirt || this.outfit?.visible ? foot.tuck : 0;
    const pitch = foot.pitch * sit;
    const yaw = foot.yaw * sit;
    // setPart turns a part about its pivot: offset it so the leg turns about its hip instead.
    _q.setFromEuler(_e.set(pitch, yaw, 0, 'YXZ'));
    _v.subVectors(foot.hip, this.model.pivots[i]);
    _w.copy(_v).applyQuaternion(_q);
    ox += _v.x - _w.x + (foot.seat.x - foot.hip.x) * sit;
    oy += _v.y - _w.y + (foot.seat.y - foot.hip.y) * sit;
    oz += _v.z - _w.z + (foot.seat.z - tuck - foot.hip.z) * sit;
    this.setPart(i, pitch, yaw, 0, ox, oy, oz);
  }

  private updateParts(): void {
    const p = this.pose;
    this.parts[PART.BODY].identity();
    // Before the parts that hang from it (the ears, the leaves).
    this.setPart(PART.HEAD, this.headPitch, this.headYaw, 0);
    // Left is the model's -x side. Raise lifts the arm sideways, swing moves it forward; an arm that bends
    // also folds at its elbow and wrist, and reaches its paw to a point (see Arms.ts).
    const [raiseL, swingL] = this.armAngles(p.armLRaise, p.armLSwing);
    const [raiseR, swingR] = this.armAngles(p.armRRaise, p.armRSwing);
    if (this.armRig) {
      this.poseArm(0, raiseL, swingL, p.armLBend, p.pawLBend, p.reachL, p.reachLX, p.reachLY, p.reachLZ);
      this.poseArm(1, raiseR, swingR, p.armRBend, p.pawRBend, p.reachR, p.reachRX, p.reachRY, p.reachRZ);
    } else {
      this.setPart(PART.ARM_L, 0, swingL, -raiseL);
      this.setPart(PART.ARM_R, 0, -swingR, raiseR);
    }
    this.setFoot(PART.FOOT_L, 0, p.footLX, p.footLY, p.footLZ);
    this.setFoot(PART.FOOT_R, 1, p.footRX, p.footRY, p.footRZ);
    this.setPart(PART.EAR_L, this.earPitch[0].value, 0, this.earRoll[0].value);
    this.setPart(PART.EAR_R, this.earPitch[1].value, 0, -this.earRoll[1].value);
    this.setPart(PART.EAR_L2, this.earBend[0].value, 0, 0);
    this.setPart(PART.EAR_R2, this.earBend[1].value, 0, 0);
    const skirtHeight = 1 - (1 - this.skirtSeat) * p.sit;
    this.setPart(PART.SKIRT, this.skirtX.value, this.skirtY.value, this.skirtZ.value, 0, 0, 0, skirtHeight);
    // Sitting on the ground, the skirt's hem also spreads out round them on it (see CharacterMaterial's VERT); not
    // on a raised seat, where there is no ground round them for it to lie on.
    this.uniforms.uSkirtFlare.value = this.seatedHigh ? 0 : SKIRT_FLARE * p.sit;
    this.setPart(PART.TAIL, 0, 0, 0, p.tailX, 0, 0);
    this.setPart(PART.SPROUT, 0, 0, this.sprout.value);
    // Sitting lowers the body until its bottom rests on the ground.
    this.poseGroup.position.set(0, p.rootY - this.model.seat.drop * p.sit, 0);
    this.poseGroup.rotation.set(p.rootPitch, p.rootYaw, p.rootRoll, 'YXZ');
  }

  private updateFace(dt: number, ctx: FrameContext): void {
    const a = this.action;
    const def = a ? ACTIONS[a.id] : null;
    // Every action (and a jump) has its own face; the chosen expression shows between them.
    const actionExpression = a && def ? def.expression(a.t) : this.airborne ? 'happy' : null;
    this.face.expression = actionExpression ?? this.expressionOverride ?? 'neutral';
    this.face.talking = !!def?.talking;
    this.face.chewing = !!def?.chewing;
    this.face.eyesClosed = !!(a && def?.eyesClosed?.(a.t));
    this.face.asleep = !!def?.asleep;

    // Glance at the camera when it is in front of the face, wherever their head has turned.
    this.root.worldToLocal(_v.copy(ctx.camera.position));
    _v.applyAxisAngle(UP, -this.headYaw);
    _v.y -= this.height * 0.6;
    let gx = 0;
    let gy = 0;
    if (_v.z > 0.2) {
      gx = clamp(_v.x / _v.z, -1, 1) * 0.035;
      gy = clamp(_v.y / _v.z, -1, 1) * 0.025;
    }
    this.face.gaze.set(gx + this.pose.gazeX, gy + this.pose.gazeY);
    this.face.update(dt);
  }

  /**
   * Outline width for this frame: the world's pen at this character's distance, so every
   * character (and its outfit, painted lines and skirt strokes) is drawn with the same pen as
   * the rest of the world. Call after the camera has moved.
   */
  updateOutline(ctx: FrameContext): void {
    _w.set(0, this.height * 0.5, 0).applyMatrix4(this.root.matrixWorld).applyMatrix4(ctx.camera.matrixWorldInverse);
    this.uniforms.uOutlineWidth.value = penAt(-_w.z);
  }

  /** The trees' shade on the character, easing as they walk into it and out into the sun; after
   * dark, the firelight near them, each light from its own side (see FrameContext.firelight). */
  private updateShade(dt: number, ctx: FrameContext): void {
    if (!ctx.shade) return;
    const pos = this.root.position;
    const y = this.feetY + this.height * 0.55;
    this.inCave = !!ctx.caveLight?.(pos.x, y, pos.z, _cave);
    if (this.inCave) {
      // In the cave its own light lights them, whatever the hour outside: shade is the share of the
      // hour's light (uAmbient) that it is.
      const a = sharedUniforms.uAmbient.value;
      this.uniforms.uShade.value.setRGB(_cave.r / Math.max(a.r, 0.05), _cave.g / Math.max(a.g, 0.05), _cave.b / Math.max(a.b, 0.05));
      // Nor does the open air's light, the sky's in the air (the fog) and the island's lights, reach in.
      this.uniforms.uOpenAir.value = 0;
      this.shaded = NaN;
    } else {
      this.uniforms.uOpenAir.value = 1;
      const shade = ctx.shade(pos.x, y, pos.z);
      this.shaded = Number.isNaN(this.shaded) ? shade : this.shaded + (shade - this.shaded) * Math.min(1, dt * 5);
      this.uniforms.uShade.value.setRGB(1, 1, 1).lerp(CANOPY_SHADE, this.shaded);
    }
    if (ctx.firelight) {
      this.uniforms.uFireFill.value = ctx.firelight(pos.x, y, pos.z, this.fireSeen, dt, this.uniforms.uFire.value, this.fireFrom);
    }
  }

  private updateShadowAndProp(ctx: FrameContext): void {
    const pos = this.root.position;
    const ground = Number.isNaN(this.feet) ? ctx.groundHeight(pos.x, pos.z) : this.feet;
    const lift = this.jumpY + Math.max(0, this.pose.rootY);
    const k = 1 - Math.min(0.55, lift * 0.9);
    this.shadow.position.set(pos.x, ground + 0.025, pos.z);
    this.shadow.scale.setScalar(this.width * 1.15 * k);
    (this.shadow.material as THREE.MeshBasicMaterial).opacity = k;
    // A shadow only takes light away. Its warm brown is the hour's light on the ground where they stand
    // (white by day, so as painted; dimmer by night, and in the trees' shade), and none in the forbidden
    // cave, whose floor's light is its own and dim: never lighter than the ground it lies on.
    if (this.inCave) _tint.setRGB(0, 0, 0);
    else _tint.copy(sharedUniforms.uAmbient.value).multiply(this.uniforms.uShade.value);
    (this.shadow.material as THREE.MeshBasicMaterial).color.copy(_tint);
    (this.fireShadow.material as THREE.MeshBasicMaterial).color.copy(_tint);
    this.updateFireShadow(ground, k);

    if (this.torch) {
      // Held up in the right hand, leaning a little forward and out, its flame over their head.
      this.getAnchor('handR', _v);
      this.torch.position.copy(_v);
      this.torch.rotation.set(0.25, this.facing, -0.18, 'YXZ');
    }
    const s = Math.sin(this.facing);
    const c = Math.cos(this.facing);
    if (this.hand) this.placeHand(s, c);
    if (this.carried) {
      // Upright in the left hand, its side against the hand's tip, a little out and forward of it.
      this.getAnchor('handL', _v);
      this.carried.position.set(_v.x - c * CARRY_OUT + s * CARRY_AHEAD, _v.y, _v.z + s * CARRY_OUT + c * CARRY_AHEAD);
      this.carried.rotation.set(0, this.facing, 0);
    }
    const playing = !!this.instrument?.visible;
    if (this.ownCarried) {
      // With their own clothes (Rakko's sword): on their back, or held up by its grip in the same hand as the
      // can is, its point leaning forward and out.
      this.ownCarried.visible = !!this.ownOutfit?.visible;
      if (this.holdsOwn && this.armRig) {
        // In both paws before him (see REACH_SWORD).
        this.ownCarried.position.copy(this.bodyPoint(SWORD_HOLD, _v));
        this.ownCarried.rotation.set(SWORD_FORWARD, this.facing, -SWORD_OUT, 'YXZ');
      } else if (this.holdsOwn) {
        this.getAnchor('handL', _v);
        this.ownCarried.position.set(_v.x + s * SWORD_AHEAD + c * SWORD_INWARD, _v.y, _v.z + c * SWORD_AHEAD - s * SWORD_INWARD);
        this.ownCarried.rotation.set(SWORD_FORWARD, this.facing, SWORD_OUT, 'YXZ');
      } else {
        this.ownCarried.position.copy(this.bodyPoint(SWORD_BACK_AT, _v));
        this.ownCarried.quaternion.setFromAxisAngle(UP, this.facing).multiply(SWORD_BACK_TURN);
      }
    }
    if (this.instrument && playing) {
      // Across the tummy, its neck up to their left (the model's +x), tipped back a little.
      this.bodyPoint(UKULELE_AT, _v);
      this.instrument.position.copy(_v);
      this.instrument.rotation.set(UKULELE_BACK, this.facing, UKULELE_UP, 'YXZ');
    }
  }

  /** What they hold in their right paw (see hold): up at their mouth while they eat, as the rice ball is; else
   * upright in the paw, leaning a little forward, or flat on it; lit as the paw is. */
  private placeHand(s: number, c: number): void {
    const hand = this.hand as THREE.Object3D;
    // Put away while the cave's torch is in that paw, or they play what they play.
    hand.visible = !this.torch && !this.instrument?.visible;
    const light = hand.userData.light as HeldLight | undefined;
    if (light) this.lightHeld(light);
    if (this.action?.id === 'eat') {
      this.getAnchor('mouth', _v);
      hand.position.set(_v.x + s * HAND_MOUTH_OUT, _v.y - HAND_MOUTH_DOWN, _v.z + c * HAND_MOUTH_OUT);
      hand.rotation.set(-0.35, this.facing, 0, 'YXZ');
      return;
    }
    this.getAnchor('handR', _v);
    if (this.handFlat) {
      hand.position.set(_v.x + s * HAND_FLAT_AHEAD, _v.y + HAND_FLAT_UP, _v.z + c * HAND_FLAT_AHEAD);
      hand.rotation.set(0, this.facing, 0, 'YXZ');
    } else {
      hand.position.set(_v.x + s * HAND_AHEAD, _v.y, _v.z + c * HAND_AHEAD);
      hand.rotation.set(HAND_LEAN, this.facing, 0, 'YXZ');
    }
  }

  /**
   * The strongest firelight's shadow on the ground at `ground`: from their feet away from the light,
   * as long as their height throws it from the light's height and distance (a lantern overhead
   * throws a short one, a torch off to the side a longer one), as dark as the light on them is
   * strong. `k` thins it as they leave the ground.
   */
  private updateFireShadow(ground: number, k: number): void {
    const light = this.uniforms.uFire.value[0];
    const pos = this.root.position;
    let ax = pos.x - this.fireFrom.x;
    let az = pos.z - this.fireFrom.z;
    const flat = Math.hypot(ax, az);
    const strength = Math.min(light.w * FIRE_SHADOW, 1);
    if (strength < 0.03 || flat < 0.05) {
      this.fireShadow.visible = false;
      return;
    }
    ax /= flat;
    az /= flat;
    const tall = this.height * 0.9;
    const above = this.fireFrom.y - ground;
    const length = clamp((flat * tall) / Math.max(above - tall, 0.25), 0.3, 2.5);
    // From a little behind their feet (under them) out to the shadow's end.
    const back = this.width * 0.25;
    const middle = (length - back) / 2;
    this.fireShadow.visible = true;
    this.fireShadow.position.set(pos.x + ax * middle, ground + 0.03, pos.z + az * middle);
    this.fireShadow.rotation.set(-Math.PI / 2, 0, Math.atan2(-ax, -az));
    this.fireShadow.scale.set(this.width * 0.95 * k, length + back, 1);
    (this.fireShadow.material as THREE.MeshBasicMaterial).opacity = strength * k;
  }
}
