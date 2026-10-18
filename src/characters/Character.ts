import * as THREE from 'three';
import type { CharacterDef, ExpressionId } from './types';
import { MAX_PARTS, PART, type AnchorName, type CharacterModel, type OutfitModel } from './Model';
import {
  createCharacterMaterials,
  makeCharacterUniforms,
  makeOutfitUniforms,
  type CharacterUniforms,
} from './CharacterMaterial';
import { Face } from './Face';
import { Spring } from './Springs';
import { copyPose, lerpPose, resetPose, restPose } from './Pose';
import { ACTIONS, type ActionContext, type ActionId } from './Actions';
import type { EmoteHost, EmoteSystem } from './Emotes';
import { t } from '../i18n/I18n';
import { penAt } from '../world/Ink';
import { CANOPY_SHADE } from '../world/Look';

export interface CharacterOptions {
  /** Background extra: flat tint, and a drawn face on a small canvas (the islanders' cheek marks). */
  crowd?: { color: THREE.ColorRepresentation };
  /** An outfit asset fitted to this character (the island outfit). Worn until taken off. */
  outfit?: OutfitModel;
}

export interface FrameContext {
  camera: THREE.Camera;
  viewHeight: number;
  pixelRatio: number;
  /** Height of what someone stands on at (x, z), within a step of where their feet were. */
  groundHeight: (x: number, z: number, feet?: number) => number;
  /** Keeps a character who moved from `from` (from.y: their feet) to `p` on ground they can stand on. */
  clamp: (p: THREE.Vector3, from: THREE.Vector3) => void;
  /** How deep in the trees' shade a point is, 0 in the sun to 1: in the film look only. */
  shade?: (x: number, y: number, z: number) => number;
  /** The firelight's warmth at a point after dark, as a tint (white where none reaches): in the
   * film look only. */
  firelight?: (x: number, y: number, z: number, out: THREE.Color) => THREE.Color;
}

const GRAVITY = -24;
const JUMP_SPEED = 5.8;
const ACCEL = 16;

const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _m = new THREE.Matrix4();
const _from = new THREE.Vector3();
const _s = new THREE.Vector3();
const _warmth = new THREE.Color();

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

  private readonly model: CharacterModel;
  private readonly poseGroup = new THREE.Group();
  private readonly mesh: THREE.Mesh;
  private readonly uniforms: CharacterUniforms;
  private readonly parts: THREE.Matrix4[];
  private readonly shadow: THREE.Mesh;
  private readonly prop: THREE.Object3D;
  private readonly outfit: THREE.Group | null = null;
  /** The skirt's height when seated, as a fraction of standing, so its hem settles on the ground. */
  private readonly skirtSeat: number = 1;
  /** Wears a grass skirt that is part of the model (the islanders), not an outfit. */
  private readonly ownSkirt: boolean;
  private emotes: EmoteSystem | null = null;

  private readonly desired = new THREE.Vector3();
  private readonly accel = new THREE.Vector3();
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

  private readonly actionCtx: ActionContext = {
    emote: (kind, side) => this.emotes?.spawn(kind, this, side ?? 1),
    say: (key) => this.emotes?.say(this, t(key)),
  };

  /** `prop` is the hand-held item shown by actions that use one (the onigiri). */
  constructor(def: CharacterDef, model: CharacterModel, prop: THREE.Object3D, options: CharacterOptions = {}) {
    this.def = def;
    this.model = model;
    this.height = model.rig.height;
    this.width = model.rig.width;
    const layers = options.crowd ? null : model.faceLayers;
    this.face = new Face(def.face, options.crowd ? 256 : 768, layers);
    this.parts = Array.from({ length: MAX_PARTS }, () => new THREE.Matrix4());
    this.uniforms = makeCharacterUniforms(model.rig, this.parts, this.face.texture, model.maskTexture);
    this.uniforms.uLineBias.value = 0.045 * model.rig.headR / 0.45;
    if (options.crowd) {
      const c = new THREE.Color(options.crowd.color);
      this.uniforms.uColorOverride.value.set(c.r, c.g, c.b, 0.86);
    }
    const { body, outline } = createCharacterMaterials(this.uniforms);
    this.mesh = new THREE.Mesh(model.geometry, body);
    const outlineMesh = new THREE.Mesh(model.geometry, outline);
    this.poseGroup.add(this.mesh, outlineMesh);
    if (options.outfit) {
      // A separate asset, drawn with the wearer's own deformation so it moves with them.
      const mats = createCharacterMaterials(makeOutfitUniforms(this.uniforms, options.outfit.info), {
        billboard: options.outfit.billboard,
      });
      this.outfit = new THREE.Group();
      this.outfit.add(
        new THREE.Mesh(options.outfit.geometry, mats.body),
        new THREE.Mesh(options.outfit.geometry, mats.outline),
      );
      this.poseGroup.add(this.outfit);
    }
    const ownSkirt = model.rig.patterns?.skirt ?? null;
    this.ownSkirt = ownSkirt !== null;
    const skirt = ownSkirt ?? options.outfit?.info.skirt ?? null;
    const waist = model.pivots[PART.SKIRT].y;
    if (skirt && waist > skirt.bottom) {
      this.skirtSeat = clamp((waist - model.seat.drop) / (waist - skirt.bottom), 0.4, 1);
    }
    this.root.add(this.poseGroup);
    this.shadow = makeShadow();
    this.prop = prop;
    this.prop.visible = false;
    this.updateParts();
  }

  get position(): THREE.Vector3 {
    return this.root.position;
  }

  get actionId(): ActionId | null {
    return this.action?.id ?? null;
  }

  get hasOutfit(): boolean {
    return this.outfit !== null;
  }

  /** Put the outfit on or take it off. Characters without one ignore this. */
  setOutfitVisible(on: boolean): void {
    if (this.outfit) this.outfit.visible = on;
  }

  attach(scene: THREE.Scene, emotes: EmoteSystem): void {
    scene.add(this.root, this.shadow, this.prop);
    this.emotes = emotes;
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

  teleport(x: number, z: number, yaw: number): void {
    this.root.position.set(x, 0, z);
    this.feet = NaN;
    this.shaded = NaN;
    this.velocity.set(0, 0, 0);
    this.desired.set(0, 0, 0);
    this.facing = this.targetFacing = yaw;
  }

  jump(): void {
    if (this.airborne || this.crouch >= 0) return;
    if (this.action && !ACTIONS[this.action.id].allowMove) this.stopAction();
    this.crouch = 0.07;
  }

  play(id: ActionId): void {
    this.startBlend(ACTIONS[id].fadeIn);
    this.action = { id, t: 0 };
    this.prop.visible = ACTIONS[id].prop === 'onigiri';
  }

  stopAction(): void {
    if (!this.action) return;
    this.startBlend(ACTIONS[this.action.id].fadeOut);
    this.action = null;
    this.prop.visible = false;
  }

  update(dt: number, ctx: FrameContext): void {
    this.time += dt;
    this.updateLocomotion(dt, ctx);
    this.updatePose(dt);
    this.updateSprings(dt);
    this.updateParts();
    this.root.updateMatrixWorld(true);
    this.updateFace(dt, ctx);
    this.updateShadowAndProp(ctx);
    this.updateShade(dt, ctx);
  }

  /** World position of a rig anchor, following the current pose and squash. */
  getAnchor(name: AnchorName, out: THREE.Vector3): THREE.Vector3 {
    const part = name === 'handL' ? PART.ARM_L : name === 'handR' ? PART.ARM_R : PART.BODY;
    out.copy(this.model.anchors[name]).applyMatrix4(this.parts[part]);
    const s = this.uniforms.uSquash.value;
    const k = 1 / Math.sqrt(s);
    const lean = this.uniforms.uLean.value;
    const h = Math.max(out.y, 0) / this.height;
    out.y *= s;
    out.x = out.x * k + lean.x * h * h * this.height;
    out.z = out.z * k + lean.y * h * h * this.height;
    return this.mesh.localToWorld(out);
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
    if (Number.isNaN(this.feet)) this.feet = ctx.groundHeight(pos.x, pos.z);
    _from.copy(pos);
    _from.y = this.feet;
    pos.x += this.velocity.x * dt;
    pos.z += this.velocity.z * dt;
    ctx.clamp(pos, _from);

    const inv = 1 / Math.max(dt, 1e-4);
    const k = Math.min(1, dt * 12);
    this.accel.x += ((this.velocity.x - prevX) * inv - this.accel.x) * k;
    this.accel.z += ((this.velocity.z - prevZ) * inv - this.accel.z) * k;

    const speed = this.speed();
    if (speed > 0.15) this.targetFacing = Math.atan2(this.velocity.x, this.velocity.z);
    this.facing += wrapAngle(this.targetFacing - this.facing) * Math.min(1, dt * 10);

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
    if (this.airborne) {
      this.vy += GRAVITY * dt;
      this.jumpY += this.vy * dt;
      if (this.jumpY <= 0) {
        const impact = Math.min(1.4, -this.vy / JUMP_SPEED);
        this.jumpY = 0;
        this.vy = 0;
        this.airborne = false;
        this.squash.velocity -= 3.2 * impact;
        for (const s of this.earBend) s.velocity += 7 * impact;
        for (const s of this.earPitch) s.velocity += 2.5 * impact;
      }
    }
    this.feet = ctx.groundHeight(pos.x, pos.z, this.feet);
    pos.y = this.feet + this.jumpY;
    this.root.rotation.y = this.facing;
  }

  /** Height of the character's feet when not jumping: what they stand on. */
  get feetY(): number {
    return Number.isNaN(this.feet) ? this.root.position.y : this.feet;
  }

  private locomotionPose(): void {
    const p = resetPose(this.base);
    const tm = this.time;
    p.squash = 1 + 0.014 * Math.sin(tm * 2.3);
    p.armLRaise = p.armRRaise = 0.04 * Math.sin(tm * 2.3 + 0.8);
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

    const air = this.airborne ? this.vy * 0.025 : 0;
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
    // Left is the model's -x side. Raise lifts the arm sideways, swing moves it forward.
    const [raiseL, swingL] = this.armAngles(p.armLRaise, p.armLSwing);
    const [raiseR, swingR] = this.armAngles(p.armRRaise, p.armRSwing);
    this.setPart(PART.ARM_L, 0, swingL, -raiseL);
    this.setPart(PART.ARM_R, 0, -swingR, raiseR);
    this.setFoot(PART.FOOT_L, 0, p.footLX, p.footLY, p.footLZ);
    this.setFoot(PART.FOOT_R, 1, p.footRX, p.footRY, p.footRZ);
    this.setPart(PART.EAR_L, this.earPitch[0].value, 0, this.earRoll[0].value);
    this.setPart(PART.EAR_R, this.earPitch[1].value, 0, -this.earRoll[1].value);
    this.setPart(PART.EAR_L2, this.earBend[0].value, 0, 0);
    this.setPart(PART.EAR_R2, this.earBend[1].value, 0, 0);
    const skirtHeight = 1 - (1 - this.skirtSeat) * p.sit;
    this.setPart(PART.SKIRT, this.skirtX.value, this.skirtY.value, this.skirtZ.value, 0, 0, 0, skirtHeight);
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

    // Glance at the camera when it is in front.
    this.root.worldToLocal(_v.copy(ctx.camera.position));
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
   * dark, warmed by the firelight near them. */
  private updateShade(dt: number, ctx: FrameContext): void {
    if (!ctx.shade) return;
    const pos = this.root.position;
    const y = this.feetY + this.height * 0.55;
    const shade = ctx.shade(pos.x, y, pos.z);
    this.shaded = Number.isNaN(this.shaded) ? shade : this.shaded + (shade - this.shaded) * Math.min(1, dt * 5);
    this.uniforms.uShade.value.setRGB(1, 1, 1).lerp(CANOPY_SHADE, this.shaded);
    if (ctx.firelight) this.uniforms.uShade.value.multiply(ctx.firelight(pos.x, y, pos.z, _warmth));
  }

  private updateShadowAndProp(ctx: FrameContext): void {
    const pos = this.root.position;
    const ground = Number.isNaN(this.feet) ? ctx.groundHeight(pos.x, pos.z) : this.feet;
    const lift = this.jumpY + Math.max(0, this.pose.rootY);
    const k = 1 - Math.min(0.55, lift * 0.9);
    this.shadow.position.set(pos.x, ground + 0.025, pos.z);
    this.shadow.scale.setScalar(this.width * 1.15 * k);
    (this.shadow.material as THREE.MeshBasicMaterial).opacity = k;

    if (this.prop.visible) {
      // Held up just under the mouth, in front of the face.
      this.getAnchor('mouth', _v);
      const out = 0.075;
      this.prop.position.set(
        _v.x + Math.sin(this.facing) * out,
        _v.y - 0.11,
        _v.z + Math.cos(this.facing) * out,
      );
      this.prop.rotation.set(-0.15, this.facing, 0);
    }
  }
}
