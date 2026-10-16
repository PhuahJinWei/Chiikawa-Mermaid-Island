/**
 * Everything an action can set on a character in one frame. All numbers, so
 * blending two poses is a plain per-field lerp. Angles in radians, offsets in metres,
 * lean as a fraction of body height at the top of the head.
 */
export interface Pose {
  rootY: number;
  rootPitch: number;
  rootRoll: number;
  rootYaw: number;
  squash: number;
  leanX: number;
  leanZ: number;
  armLRaise: number;
  armLSwing: number;
  armRRaise: number;
  armRSwing: number;
  footLX: number;
  footLY: number;
  footLZ: number;
  footRX: number;
  footRY: number;
  footRZ: number;
  earLPitch: number;
  earLRoll: number;
  earRPitch: number;
  earRRoll: number;
  earBend: number;
  skirtX: number;
  skirtY: number;
  skirtZ: number;
  tailX: number;
  sprout: number;
  gazeX: number;
  gazeY: number;
  /**
   * 0 standing, 1 sitting on the ground: the body rests on its bottom, the legs stretch out in
   * front and the skirt settles on the ground. How far that moves each part is measured from
   * the model.
   */
  sit: number;
}

const REST: Pose = {
  rootY: 0,
  rootPitch: 0,
  rootRoll: 0,
  rootYaw: 0,
  squash: 1,
  leanX: 0,
  leanZ: 0,
  armLRaise: 0,
  armLSwing: 0,
  armRRaise: 0,
  armRSwing: 0,
  footLX: 0,
  footLY: 0,
  footLZ: 0,
  footRX: 0,
  footRY: 0,
  footRZ: 0,
  earLPitch: 0,
  earLRoll: 0,
  earRPitch: 0,
  earRRoll: 0,
  earBend: 0,
  skirtX: 0,
  skirtY: 0,
  skirtZ: 0,
  tailX: 0,
  sprout: 0,
  gazeX: 0,
  gazeY: 0,
  sit: 0,
};

export const POSE_KEYS = Object.keys(REST) as (keyof Pose)[];

export function restPose(): Pose {
  return { ...REST };
}

export function resetPose(p: Pose): Pose {
  for (const k of POSE_KEYS) p[k] = REST[k];
  return p;
}

export function copyPose(src: Pose, dst: Pose): Pose {
  for (const k of POSE_KEYS) dst[k] = src[k];
  return dst;
}

export function lerpPose(a: Pose, b: Pose, t: number, out: Pose): Pose {
  for (const k of POSE_KEYS) out[k] = a[k] + (b[k] - a[k]) * t;
  return out;
}
