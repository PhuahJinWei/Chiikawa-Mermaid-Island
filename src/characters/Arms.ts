import * as THREE from 'three';
import { PART, type CharacterModel } from './Model';

/**
 * Arms that bend (the user, 2026-10-22: the downloaded models' rigid stubs, too short and with no joints, could
 * not wave, hold a thing in both paws or come up under the mouth): an upper arm from the shoulder, a forearm from
 * the elbow and a fingerless mitten paw from the wrist, built straight by art/blender/import_characters.py
 * (jointed_arm), a little longer than the stubs. Posed two ways, blended: by angles, the shoulder's raise and
 * swing as the stubs were, and the elbow and the wrist folding forward and in toward the middle; and by reaching,
 * the paw's tip put on a point, the elbow bending to get it there and pointing out and down, as a short arm's does.
 *
 * A short arm is not fixed to the body's side (the user: it can "come out from the front, near the mouth", as
 * Chiikawa's characters are drawn, their paws on the face under the mouth): as a paw reaches in front, the arm's
 * root goes round the body toward the front and up it, under the head's edge, along the way the converter measured
 * on the model (Rig.armRoots), only as far as it must for the point to be within the arm's reach; so both paws
 * meet before the chest and come up under the mouth. The points by the face, and a root on the head, go with the
 * head as it turns to watch (see Character.watch).
 */

/** Where an elbow points as an arm reaches (in the model's frame, the arm's side out): out, down and back. */
const POLE_OUT = 1;
const POLE_DOWN = 0.6;
const POLE_BACK = 0.25;
/** How near its root comes to the point it reaches for: this share of the arm's length (not quite straight). */
const REACH_SHARE = 0.9;
/** Points this far below and above the neck (head radii) go with the head as it turns: none below, all above. */
const FOLLOW_BELOW = 0.1;
const FOLLOW_ABOVE = 0.2;
/** A face's size, which the points paws reach for are measured in (see Pose.reachL): how far ahead of the body's
 * middle the mouth is, by Chiikawa's mouth, this many of her head radii ahead (art/blender/import_characters.py
 * MOUTH_AHEAD). Not the head's width: Momonga's is wide with her fluffy cheeks, her face as far forward as
 * Chiikawa's. */
const MOUTH_AHEAD = 0.91;
const FORWARD = new THREE.Vector3(0, 0, 1);

interface ArmRest {
  /** The model's x side the arm is on. */
  side: -1 | 1;
  upper: number;
  fore: number;
  paw: number;
  shoulder: THREE.Vector3;
  /** The way the arm runs at rest, out from the shoulder (it is straight). */
  way: THREE.Vector3;
  /** Shoulder to elbow, and elbow to the paw's tip with the paw straight on. */
  upperLength: number;
  foreLength: number;
  /** What an elbow or a wrist folds about, at rest: the forearm forward and in. */
  bendAxis: THREE.Vector3;
  /** Where its root can go (from its shoulder; see Rig.armRoots), and how much each is on the head. */
  roots: THREE.Vector3[];
  rootsHead: number[];
}

/** How one arm is turned this frame: its upper arm about the shoulder, its forearm about the elbow and its
 * paw about the wrist, each in the model's frame at rest (see Character.setPartTurn); and where its shoulder
 * now is, gone round the body as it reaches in front. */
export interface ArmTurns {
  upper: THREE.Quaternion;
  fore: THREE.Quaternion;
  paw: THREE.Quaternion;
  shoulder: THREE.Vector3;
}

/** A pose's numbers for one arm (see Pose). */
export interface ArmPose {
  raise: number;
  swing: number;
  bend: number;
  pawBend: number;
  reach: number;
  x: number;
  y: number;
  z: number;
}

const _target = new THREE.Vector3();
const _to = new THREE.Vector3();
const _pole = new THREE.Vector3();
const _elbow = new THREE.Vector3();
const _fore = new THREE.Vector3();
const _shoulder = new THREE.Vector3();
const _r0 = new THREE.Vector3();
const _r1 = new THREE.Vector3();
const _h = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _inverse = new THREE.Quaternion();
const _e = new THREE.Euler();

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export class ArmRig {
  private constructor(
    private readonly arms: [ArmRest, ArmRest],
    private readonly headR: number,
    /** The face's size (see MOUTH_AHEAD), in which the points paws reach for are given. */
    private readonly faceR: number,
    private readonly eyeY: number,
    /** The neck's height, about which the head turns; NaN for a model whose head does not turn on its own. */
    private readonly neckY: number,
  ) {}

  /** The arms of a model built with arms that bend, or null (the Siren's, a model built before). */
  static of(model: CharacterModel): ArmRig | null {
    const { parents, pivots, anchors } = model;
    const make = (side: -1 | 1): ArmRest | null => {
      const [upper, fore, paw] = side < 0 ? [PART.ARM_L, PART.ARM_L2, PART.PAW_L] : [PART.ARM_R, PART.ARM_R2, PART.PAW_R];
      const tip = side < 0 ? anchors.handL : anchors.handR;
      if (parents[fore] !== upper || parents[paw] !== fore || !tip) return null;
      const shoulder = pivots[upper].clone();
      const elbow = pivots[fore];
      const way = tip.clone().sub(shoulder).normalize();
      const path = (side < 0 ? model.rig.armRoots?.L : model.rig.armRoots?.R) ?? [];
      return {
        side,
        upper,
        fore,
        paw,
        shoulder,
        way,
        upperLength: elbow.distanceTo(shoulder),
        foreLength: tip.distanceTo(elbow),
        bendAxis: way.clone().cross(FORWARD).normalize(),
        roots: path.length ? path.map(([x, y, z]) => new THREE.Vector3(x, y, z)) : [shoulder.clone()],
        rootsHead: path.length ? path.map((p) => p[3]) : [0],
      };
    };
    const l = make(-1);
    const r = make(1);
    if (!l || !r) return null;
    const neckY = model.hasHead ? pivots[PART.HEAD].y : NaN;
    const faceR = anchors.mouth ? anchors.mouth.z / MOUTH_AHEAD : model.rig.headR;
    return new ArmRig([l, r], model.rig.headR, faceR, model.rig.eyeY, neckY);
  }

  /**
   * How arm `i` (0 its model's -x side, the left; 1 the right) is turned for `pose`: by its angles, then as much
   * toward reaching its paw's tip to the pose's point as `reach` says. `raise` and `swing` turn the shoulder as
   * the stubs were turned (after Character.armAngles), so a pose made for those still reads. `head` is how the
   * head is turned now (the head part's matrix in the model's frame), or null.
   */
  solve(i: 0 | 1, pose: ArmPose, out: ArmTurns, head: THREE.Matrix4 | null): ArmTurns {
    const arm = this.arms[i];
    const s = arm.side;
    // By angles: the shoulder as before (see Character.updateParts), the elbow and wrist folding.
    out.upper.setFromEuler(_e.set(0, -s * pose.swing, s * pose.raise, 'YXZ'));
    out.fore.setFromAxisAngle(arm.bendAxis, pose.bend);
    out.paw.setFromAxisAngle(arm.bendAxis, pose.pawBend);
    out.shoulder.copy(arm.shoulder);
    const w = Math.min(1, Math.max(0, pose.reach));
    if (w <= 0) return out;
    // Reaching: the point, in the model's frame, with the head's turn if it is by the face.
    _target.set(s * pose.x * this.faceR, this.eyeY + pose.y * this.faceR, pose.z * this.faceR);
    this.withHead(_target, this.follows(_target.y), head);
    const a = arm.upperLength;
    const b = arm.foreLength;
    // Its root, gone round the body and up its front as far as it must (see rootFor).
    this.rootFor(arm, _target, REACH_SHARE * (a + b), head, _shoulder);
    _to.subVectors(_target, _shoulder);
    const far = Math.min(Math.max(_to.length(), Math.abs(a - b) + 1e-4), a + b - 1e-4);
    _to.normalize();
    // The elbow out of the line to the point, toward the pole.
    _pole.set(s * POLE_OUT, -POLE_DOWN, -POLE_BACK).normalize();
    _pole.addScaledVector(_to, -_pole.dot(_to));
    if (_pole.lengthSq() < 1e-8) _pole.set(0, -1, 0).addScaledVector(_to, -_to.y);
    _pole.normalize();
    const cos = Math.min(1, Math.max(-1, (a * a + far * far - b * b) / (2 * a * far)));
    _elbow.copy(_to).multiplyScalar(cos).addScaledVector(_pole, Math.sqrt(1 - cos * cos));
    // The forearm from the elbow to where the tip lands.
    _fore.copy(_to).multiplyScalar(far).addScaledVector(_elbow, -a).normalize();
    _q.setFromUnitVectors(arm.way, _elbow);
    out.upper.slerp(_q, w);
    out.shoulder.lerp(_shoulder, w);
    // The forearm in the upper arm's own frame (the child's turn is made at rest, then the parent's applies).
    _inverse.copy(_q).invert();
    _fore.applyQuaternion(_inverse);
    _q.setFromUnitVectors(arm.way, _fore);
    out.fore.slerp(_q, w);
    return out;
  }

  /** The model's part indices of arm `i`: upper arm, forearm, paw. */
  parts(i: 0 | 1): [number, number, number] {
    const arm = this.arms[i];
    return [arm.upper, arm.fore, arm.paw];
  }

  /**
   * Where arm's root goes for its paw to reach `target` (`out`): along its way (Rig.armRoots), from its shoulder,
   * to the first place within `reach` of it; the nearest place on the way if none is. Each place with the head's
   * turn as far as it is on the head.
   */
  private rootFor(arm: ArmRest, target: THREE.Vector3, reach: number, head: THREE.Matrix4 | null, out: THREE.Vector3): void {
    let prev = this.rootAt(arm, 0, head, _r0).distanceTo(target);
    out.copy(_r0);
    if (prev <= reach) return;
    let best = prev;
    for (let k = 1; k < arm.roots.length; k++) {
      const d = this.rootAt(arm, k, head, _r1).distanceTo(target);
      if (d <= reach) {
        out.lerpVectors(_r0, _r1, (prev - reach) / Math.max(prev - d, 1e-6));
        return;
      }
      if (d < best) {
        best = d;
        out.copy(_r1);
      }
      prev = d;
      _r0.copy(_r1);
    }
  }

  /** Arm's k-th root place (`out`), with the head's turn as far as it is on the head. */
  private rootAt(arm: ArmRest, k: number, head: THREE.Matrix4 | null, out: THREE.Vector3): THREE.Vector3 {
    out.copy(arm.roots[k]);
    return this.withHead(out, arm.rootsHead[k], head);
  }

  /** How much a point at height `y` (the model's frame) goes with the head as it turns. */
  private follows(y: number): number {
    if (Number.isNaN(this.neckY)) return 0;
    return smoothstep(this.neckY - FOLLOW_BELOW * this.headR, this.neckY + FOLLOW_ABOVE * this.headR, y);
  }

  /** `p` (the model's frame) moved `share` of the way to where the head's turn puts it. */
  private withHead(p: THREE.Vector3, share: number, head: THREE.Matrix4 | null): THREE.Vector3 {
    if (head && share > 0) p.lerp(_h.copy(p).applyMatrix4(head), share);
    return p;
  }
}
