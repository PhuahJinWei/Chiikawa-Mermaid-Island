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
  | 'menace';

/** The actions the Test panel offers the cast. The Siren's own ('menace') is not one of them. */
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
  prop?: 'onigiri';
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

/**
 * Sitting on the ground with the legs stretched out in front, as the film's characters sit:
 * the body settles onto its bottom with a little bounce, leaning back slightly, and keeps its
 * shape. The paws rest in front of the tummy.
 */
function sitPose(t: number, p: Pose): void {
  const s = smooth(t / 0.35);
  p.sit = s;
  p.squash = 1 - 0.04 * bump(t, 0.2, 0.32, 0.36, 0.65) + 0.006 * Math.sin(t * 2.4) * s;
  p.rootPitch = -0.06 * s;
  p.leanZ = -0.015 * s;
  p.armLRaise = p.armRRaise = -0.05;
  p.armLSwing = p.armRSwing = 0.9;
}

export const ACTIONS: Record<ActionId, ActionDef> = {
  wave: {
    duration: 2.4,
    fadeIn: 0.2,
    fadeOut: 0.3,
    expression: () => 'happy',
    pose(t, p) {
      const up = smooth(t / 0.25) * (1 - smooth((t - 2.05) / 0.3));
      p.armRRaise = up * (2.1 + 0.32 * Math.sin(t * 13));
      p.armRSwing = up * 0.35;
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
    prop: 'onigiri',
    expression: () => 'happy',
    pose(t, p) {
      p.armLRaise = p.armRRaise = 0.7;
      p.armLSwing = p.armRSwing = 1.3;
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
      p.earLRoll = 0.1 * s;
      p.earRRoll = -0.1 * s;
      p.sprout = 0.2 * s;
    },
    tick(t, prev, ctx) {
      if (every(prev, t, 0.75, 0.2)) ctx.emote('note', Math.random() < 0.5 ? -1 : 1);
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
