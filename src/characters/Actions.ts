import type { Pose } from './Pose';
import type { ExpressionId } from './types';
import type { EmoteKind } from './Emotes';
import type { StringKey } from '../i18n/I18n';

export type ActionId =
  | 'wave'
  | 'hop'
  | 'cheer'
  | 'bow'
  | 'sit'
  | 'doze'
  | 'eat'
  | 'talk'
  | 'look'
  | 'startled'
  | 'cry'
  | 'hula'
  | 'ukulele'
  | 'sword'
  | 'menace';

/** The actions the Test panel offers the cast. The Siren's own ('menace') is not one of them, nor 'ukulele' and
 * 'sword', offered only to those who play it (CharacterDef.plays) or carry one (CharacterDef.own). */
export const ACTION_IDS: readonly ActionId[] = [
  'wave',
  'hop',
  'cheer',
  'bow',
  'sit',
  'doze',
  'eat',
  'talk',
  'look',
  'startled',
  'cry',
  'hula',
];

/** What you do yourself, from the HUD's きもち button (see Hud), in its order: 1 to 9 on the keyboard. */
export const EMOTES: readonly ActionId[] = ['wave', 'bow', 'cheer', 'hop', 'hula', 'talk', 'look', 'startled', 'cry'];

export interface ActionContext {
  emote(kind: EmoteKind, side?: number): void;
  say(key: StringKey): void;
}

export interface ActionDef {
  /** Seconds; Infinity loops until cancelled. */
  duration: number;
  fadeIn: number;
  fadeOut: number;
  allowMove?: boolean;
  talking?: boolean;
  chewing?: boolean;
  /** What they hold while it plays: what they play (CharacterOptions.instrument), or the sword they carry on
   * their back (CharacterOptions.own). */
  prop?: 'ukulele' | 'sword';
  /** The action's own face, shown over any expression chosen in the Test panel. */
  expression: (t: number) => ExpressionId;
  /** Shuts the eyes (bowing), whatever the expression. */
  eyesClosed?: (t: number) => boolean;
  /** Asleep: the face's sleeping eyes (`eyes sleep`), or its closed eyes if it has none. */
  asleep?: boolean;
  /** Receives the locomotion pose and overrides what the action controls. */
  pose: (t: number, p: Pose) => void;
  /** Fires effects; `prev` is last frame's time so events trigger exactly once. */
  tick?: (t: number, prev: number, ctx: ActionContext) => void;
}

const TAU = Math.PI * 2;
const smooth = (x: number) => {
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
};
const bump = (t: number, a: number, b: number, c: number, d: number) =>
  smooth((t - a) / (b - a)) * (1 - smooth((t - c) / (d - c)));
const crossed = (prev: number, t: number, at: number) => prev < at && t >= at;
const every = (prev: number, t: number, period: number, offset: number) =>
  t >= offset && Math.floor((t - offset) / period) > Math.floor((prev - offset) / period);

type Point = readonly [number, number, number];

/**
 * Where paws reach (see Pose.reachL and Arms.ts), in face radii (Arms.ts MOUTH_AHEAD: Chiikawa's head radius, and
 * as much on everyone's face, Momonga's wide head or not): out from the middle on the paw's own side, up from the
 * eyes, forward from the body's middle. The arms are as short as the models' stubs (the user), reaching about a
 * quarter of a face radius from their root, the root going round the body and up its front as they reach in; each
 * point measured to be within reach on every cast member (a straight arm flung toward the wave's and the cheer's).
 * As the drawings, the official figures and the film have them: both paws up on the face under the mouth (the
 * user's drawing of Hachiware), or a little lower under the chin; together before the chest, under the head's
 * edge, where a thing is held; resting on the tummy sitting (no lower: reaching down to the legs, the arms stood
 * like pillars); up at the side for a wave; and flung up and out round the head's sides for a cheer (the head too
 * big for paws over it).
 */
export const REACH: Record<'mouth' | 'chin' | 'chest' | 'lap' | 'wave' | 'cheer', Point> = {
  mouth: [0.2, -0.42, 0.92],
  chin: [0.18, -0.55, 0.88],
  chest: [0.12, -0.9, 0.72],
  lap: [0.34, -1.0, 0.6],
  wave: [0.8, -0.56, 0.32],
  cheer: [1.1, -0.45, 0.2],
};

/** Rakko's paws on what he holds, as REACH: on his ukulele, where Character.ts holds it (UKULELE_AT), his right
 * paw (the model's -x side) strumming over its body and his left up its neck; and both on his sword's grip
 * (SWORD_HOLD), his right paw below his left. */
export const REACH_UKULELE: Record<'strum' | 'neck', Point> = {
  strum: [0.02, -0.75, 0.88],
  neck: [0.31, -0.6, 0.87],
};
export const REACH_SWORD: Record<'lower' | 'upper', Point> = {
  lower: [0.06, -0.91, 0.81],
  upper: [0.06, -0.81, 0.87],
};

/** Reaches the left paw (the model's -x side) `w` of the way to `at`, moved by (dx, dy, dz). */
function reachL(p: Pose, w: number, at: Point, dx = 0, dy = 0, dz = 0): void {
  p.reachL = w;
  p.reachLX = at[0] + dx;
  p.reachLY = at[1] + dy;
  p.reachLZ = at[2] + dz;
}

/** Reaches the right paw (the model's +x side) `w` of the way to `at`, moved by (dx, dy, dz). */
function reachR(p: Pose, w: number, at: Point, dx = 0, dy = 0, dz = 0): void {
  p.reachR = w;
  p.reachRX = at[0] + dx;
  p.reachRY = at[1] + dy;
  p.reachRZ = at[2] + dz;
}

/**
 * Sitting on the ground with the legs stretched out in front, as the film's characters sit:
 * the body settles onto its bottom with a little bounce, leaning back slightly, and keeps its
 * shape. The paws rest on the lap.
 */
function sitPose(t: number, p: Pose): void {
  const s = smooth(t / 0.35);
  p.sit = s;
  p.squash = 1 - 0.04 * bump(t, 0.2, 0.32, 0.36, 0.65) + 0.006 * Math.sin(t * 2.4) * s;
  p.rootPitch = -0.06 * s;
  p.leanZ = -0.015 * s;
  p.armLRaise = p.armRRaise = -0.05;
  p.armLSwing = p.armRSwing = 0.9;
  reachL(p, s, REACH.lap);
  reachR(p, s, REACH.lap);
}

export const ACTIONS: Record<ActionId, ActionDef> = {
  wave: {
    duration: 2.4,
    fadeIn: 0.2,
    fadeOut: 0.3,
    expression: () => 'happy',
    pose(t, p) {
      const up = smooth(t / 0.25) * (1 - smooth((t - 2.05) / 0.3));
      const wag = Math.sin(t * 13);
      // A stub's wave, for a model whose arms do not bend; a paw up beside the head, wagged side to side from the
      // elbow and the wrist, for one whose do (the short arm reaching no higher than the head's lower side).
      p.armRRaise = up * (2.1 + 0.32 * wag);
      p.armRSwing = up * 0.35;
      reachR(p, up, REACH.wave, 0.15 * wag, 0.04 * Math.abs(wag));
      p.pawRBend = up * 0.6 * wag;
      p.leanX = -0.025 * up;
      p.squash = 1 + 0.02 * Math.sin(t * 6.5);
      p.rootY = 0.012 * Math.abs(Math.sin(t * 6.5));
      p.earLRoll = p.earRRoll = 0.08 * Math.sin(t * 6.5);
    },
  },

  hop: {
    duration: 2.6,
    fadeIn: 0.15,
    fadeOut: 0.3,
    expression: () => 'happy',
    pose(t, p) {
      const ph = (t * 2.3) % 1;
      const h = Math.sin(ph * Math.PI);
      const env = 1 - smooth((t - 2.25) / 0.3);
      p.rootY = 0.16 * h * env;
      p.squash = 1 + (0.03 * h - 0.05 * (1 - h) * (1 - h)) * env;
      p.armLRaise = p.armRRaise = (0.4 + 0.8 * h) * env;
      // The elbows giving with each landing.
      p.armLBend = p.armRBend = (0.5 - 0.35 * h) * env;
      p.footLY = p.footRY = 0.03 * h * env;
    },
  },

  cheer: {
    duration: 1.9,
    fadeIn: 0.12,
    fadeOut: 0.35,
    expression: () => 'happy',
    pose(t, p) {
      const h = Math.max(0, Math.sin(Math.min(1, t / 0.5) * Math.PI));
      const up = smooth(t / 0.15) * (1 - smooth((t - 1.55) / 0.3));
      p.rootY = 0.15 * h;
      p.squash = 1 + 0.1 * h - 0.06 * (1 - up);
      p.armLRaise = p.armRRaise = up * (2.5 + 0.12 * Math.sin(t * 16));
      // Both paws flung up and out round the head's sides, shaking.
      const shake = 0.05 * Math.sin(t * 16);
      reachL(p, up, REACH.cheer, 0, shake);
      reachR(p, up, REACH.cheer, 0, -shake);
      p.pawLBend = p.pawRBend = -0.3 * up;
      p.leanZ = -0.02 * up;
      p.earLRoll = p.earRRoll = 0.15 * up;
    },
    tick(t, prev, ctx) {
      if (crossed(prev, t, 0.02)) ctx.say('bubble.cheer');
    },
  },

  bow: {
    duration: 1.9,
    fadeIn: 0.15,
    fadeOut: 0.3,
    expression: () => 'neutral',
    eyesClosed: (t) => t > 0.3 && t < 1.35,
    pose(t, p) {
      const b = bump(t, 0.15, 0.5, 1.2, 1.6);
      p.leanZ = 0.16 * b;
      p.rootPitch = 0.22 * b;
      p.squash = 1 - 0.05 * b;
      p.armLRaise = p.armRRaise = -0.25 * b;
      p.armLSwing = p.armRSwing = -0.35 * b;
      // The paws together before the chest as they bow.
      reachL(p, b, REACH.chest, -0.02, -0.06);
      reachR(p, b, REACH.chest, -0.02, -0.06);
      p.earLPitch = p.earRPitch = 0.25 * b;
    },
  },

  sit: {
    duration: Infinity,
    fadeIn: 0.25,
    fadeOut: 0.3,
    expression: () => 'neutral',
    pose: sitPose,
  },

  doze: {
    duration: Infinity,
    fadeIn: 0.3,
    fadeOut: 0.35,
    expression: () => 'neutral',
    asleep: true,
    pose(t, p) {
      sitPose(t, p);
      // Nodding off: the head sinks forward and sways with slow breaths.
      p.leanZ = 0.05 + 0.015 * Math.sin(t * 1.3);
      p.leanX = 0.03 * Math.sin(t * 0.6);
      p.squash += 0.008 * Math.sin(t * 1.6);
      p.rootRoll = 0.05 * Math.sin(t * 0.6);
      p.earLPitch = p.earRPitch = 0.2;
      p.earBend = 0.4;
    },
    tick(t, prev, ctx) {
      if (every(prev, t, 1.6, 0.4)) ctx.emote('zzz');
    },
  },

  eat: {
    duration: Infinity,
    fadeIn: 0.25,
    fadeOut: 0.3,
    chewing: true,
    expression: () => 'happy',
    pose(t, p) {
      p.armLRaise = p.armRRaise = 0.7;
      p.armLSwing = p.armRSwing = 1.3;
      // Both paws up under the chin round what they eat, held up at the mouth (see Character.placeHand), bobbing
      // with each bite.
      const bite = 0.025 * Math.sin(t * 8.6);
      const up = smooth(t / 0.3);
      reachL(p, up, REACH.mouth, -0.04, bite);
      reachR(p, up, REACH.mouth, -0.04, bite);
      p.squash = 1 + 0.015 * Math.sin(t * 8.6);
      p.leanZ = 0.02 + 0.01 * Math.sin(t * 8.6);
    },
    tick(t, prev, ctx) {
      if (every(prev, t, 2.2, 0.8)) ctx.emote('heart');
    },
  },

  talk: {
    duration: Infinity,
    fadeIn: 0.2,
    fadeOut: 0.3,
    talking: true,
    expression: () => 'neutral',
    pose(t, p) {
      p.leanZ = 0.015 * Math.sin(t * 3.1);
      p.leanX = 0.02 * Math.sin(t * 1.7);
      p.squash = 1 + 0.012 * Math.sin(t * 6.3);
      const g = Math.max(0, Math.sin(t * 1.9));
      p.armRRaise = 0.25 + 0.6 * g * g;
      p.armRSwing = 0.3 * g;
      // A paw talking with them before the chest, the other resting there.
      reachR(p, 0.85, REACH.chest, 0.28 + 0.1 * Math.sin(t * 2.3), 0.12 * g * g, 0.04 * g);
      p.pawRBend = 0.3 * g;
      reachL(p, 0.5, REACH.chest, 0.18, -0.08);
      p.rootY = 0.006 * Math.abs(Math.sin(t * 6.3));
    },
    tick(t, prev, ctx) {
      if (every(prev, t, 4, 0.1)) ctx.say('bubble.talk');
    },
  },

  look: {
    duration: 3.2,
    fadeIn: 0.2,
    fadeOut: 0.3,
    expression: () => 'neutral',
    pose(t, p) {
      const k = Math.sin((t * TAU) / 1.6) * (1 - smooth((t - 2.7) / 0.4));
      p.rootYaw = 0.45 * k;
      p.leanX = -0.03 * k;
      p.gazeX = 0.04 * k;
    },
    tick(t, prev, ctx) {
      if (crossed(prev, t, 0.3)) ctx.emote('question');
    },
  },

  startled: {
    duration: 1.8,
    fadeIn: 0.04,
    fadeOut: 0.35,
    expression: (t) => (t < 1.2 ? 'shocked' : 'worried'),
    pose(t, p) {
      const jt = t / 0.32;
      const h = jt < 1 ? Math.sin(jt * Math.PI) : 0;
      p.rootY = 0.18 * h;
      p.squash = t < 0.05 ? 0.86 : jt < 1 ? 1.12 : 1 - 0.04 * Math.exp(-(t - 0.32) * 8);
      p.leanZ = -0.06 * smooth(t * 6);
      p.armLRaise = p.armRRaise = 0.35 + 1.1 * h;
      // Flung out with the jump, then held up close before the chest, elbows in, as a startled paw is.
      p.armLBend = p.armRBend = 0.2 + 0.5 * (1 - h);
      const held = smooth((t - 0.3) / 0.25) * (1 - smooth((t - 1.45) / 0.3));
      reachL(p, held, REACH.chin, 0.1, -0.06, 0.06);
      reachR(p, held, REACH.chin, 0.1, -0.06, 0.06);
      if (t > 0.35) p.leanX = Math.sin(t * 40) * 0.006;
      p.earLRoll = p.earRRoll = 0.3 * h;
      p.earBend = -0.3 * h;
    },
    tick(t, prev, ctx) {
      if (crossed(prev, t, 0.01)) ctx.emote('exclaim');
    },
  },

  cry: {
    duration: Infinity,
    fadeIn: 0.2,
    fadeOut: 0.35,
    expression: () => 'sobbing',
    pose(t, p) {
      const tremble = Math.sin(t * 38) * 0.006 + Math.sin(t * 23) * 0.004;
      p.leanX = tremble;
      p.leanZ = 0.012 + tremble * 0.5;
      p.squash = 0.96 + 0.015 * Math.sin(t * 9);
      p.armLRaise = 0.4 + 0.05 * Math.sin(t * 30);
      p.armRRaise = 0.4 + 0.05 * Math.sin(t * 31);
      p.armLSwing = p.armRSwing = 0.55;
      // Both paws up on the face under the mouth, trembling, as the drawings' sobbing characters hold them.
      const up = smooth(t / 0.3);
      reachL(p, up, REACH.mouth, 0.02, 0.02 * Math.sin(t * 30));
      reachR(p, up, REACH.mouth, 0.02, 0.02 * Math.sin(t * 31));
      p.earLPitch = p.earRPitch = 0.15;
      p.earBend = 0.5;
    },
    tick(t, prev, ctx) {
      if (every(prev, t, 2.6, 0.2)) ctx.say('bubble.cry');
    },
  },

  hula: {
    duration: Infinity,
    fadeIn: 0.3,
    fadeOut: 0.35,
    expression: () => 'neutral',
    pose(t, p) {
      const w = TAU * 0.9;
      const s = Math.sin(w * t);
      const c = Math.cos(w * t);
      p.leanX = 0.05 * s;
      p.rootYaw = 0.12 * Math.sin(w * t * 0.5);
      p.squash = 1 + 0.025 * Math.sin(2 * w * t);
      p.rootY = 0.012 * Math.abs(s);
      p.skirtZ = -0.12 * s;
      p.skirtY = 0.25 * s;
      p.skirtX = 0.04 * c;
      p.armLRaise = 1.0 + 0.6 * s;
      p.armRRaise = 1.0 - 0.6 * s;
      p.armLSwing = 0.4 * c;
      p.armRSwing = -0.4 * c;
      // The arms flowing as the hula's do: each elbow and wrist bending as its arm goes down and giving as it
      // rises.
      p.armLBend = 0.45 - 0.35 * s;
      p.armRBend = 0.45 + 0.35 * s;
      p.pawLBend = 0.3 * c;
      p.pawRBend = -0.3 * c;
      p.earLRoll = 0.1 * s;
      p.earRRoll = -0.1 * s;
      p.sprout = 0.2 * s;
    },
    tick(t, prev, ctx) {
      if (every(prev, t, 0.75, 0.2)) ctx.emote('note', Math.random() < 0.5 ? -1 : 1);
    },
  },

  // Rakko's ukulele (PLAN.md: he plays it at the bonfire), calm as he is: held across his tummy, its neck up to
  // his left, his right paw (the model's -x side) strumming its body, his left paw up at its neck; swaying a
  // little to its beat.
  ukulele: {
    duration: Infinity,
    fadeIn: 0.3,
    fadeOut: 0.35,
    prop: 'ukulele',
    expression: () => 'neutral',
    pose(t, p) {
      const strum = Math.sin(TAU * 2.2 * t);
      const sway = Math.sin(TAU * 0.55 * t);
      p.armLRaise = 0.1 + 0.16 * strum;
      p.armLSwing = 0.85;
      p.armRRaise = 0.45;
      p.armRSwing = 1.15;
      // His right paw strumming at its body, his left on its neck (see UKULELE_AT in Character.ts).
      reachL(p, 1, REACH_UKULELE.strum, 0, 0.06 * strum);
      reachR(p, 1, REACH_UKULELE.neck, 0, 0.015 * Math.sin(TAU * 1.1 * t));
      p.pawLBend = 0.25 * strum;
      p.leanX = 0.02 * sway;
      p.rootYaw = 0.04 * sway;
      p.squash = 1 + 0.008 * Math.sin(TAU * 1.1 * t);
      p.rootY = 0.004 * Math.abs(sway);
    },
  },

  // Rakko's sword, which he holds only now and then (the user, 2026-10-22), off his back and up in his right paw
  // (the model's -x side), that arm raised and forward to hold it; serious, as he is with it in hand.
  sword: {
    duration: Infinity,
    fadeIn: 0.25,
    fadeOut: 0.3,
    prop: 'sword',
    expression: () => 'determined',
    pose(t, p) {
      p.armLRaise = 0.3;
      p.armLSwing = 0.6;
      // Both paws on its grip before him, one above the other (see SWORD_HOLD in Character.ts).
      reachL(p, 1, REACH_SWORD.lower);
      reachR(p, 1, REACH_SWORD.upper);
      p.squash = 1 + 0.008 * Math.sin(t * 2.0);
    },
  },

  // The Siren roused (`[anime] siren 3`, the angry plush): her fin-hands, spread a little down at rest,
  // raised out level either side and held there, her red eyes and toothy mouth, until she calms (see
  // Siren.ts).
  menace: {
    duration: Infinity,
    fadeIn: 0.4,
    fadeOut: 0.7,
    expression: () => 'angry',
    pose(t, p) {
      const up = smooth(t / 0.45);
      const breath = Math.sin(t * 2.1);
      p.armLRaise = p.armRRaise = up * (0.42 + 0.04 * breath);
      p.squash = 1 + up * (0.015 + 0.008 * breath);
      p.leanZ = 0.012 * up;
    },
  },
};
