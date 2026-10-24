import type { StringKey } from '../i18n/I18n';

/** 'player' is you: a nameless islander, seen out of their own eyes. */
export type CharacterId =
  | 'player'
  | 'chiikawa'
  | 'hachiware'
  | 'usagi'
  | 'momonga'
  | 'kurimanju'
  | 'rakko'
  | 'furuhonya'
  | 'shisa'
  | 'hitoha'
  | 'futaba';
export const CHARACTER_IDS: readonly CharacterId[] = [
  'player',
  'chiikawa',
  'hachiware',
  'usagi',
  'momonga',
  'kurimanju',
  'rakko',
  'furuhonya',
  'shisa',
  'hitoha',
  'futaba',
];

export type EyeKind = 'open' | 'happy' | 'closed' | 'squeeze' | 'teary';
export type BrowKind = 'none' | 'default' | 'worried' | 'angry';
export type MouthKind = 'none' | 'cat' | 'catOpen' | 'grin' | 'o' | 'wail';

/** The cast's faces for these are painted by hand: art/faces/<id>/expressions.txt. 'angry' is the
 * Siren's roused face (the user, 2026-10-21); the rest show their neutral face for it until it is painted. */
export type ExpressionId =
  | 'neutral'
  | 'smile'
  | 'happy'
  | 'determined'
  | 'worried'
  | 'teary'
  | 'sobbing'
  | 'shocked'
  | 'angry';

export const EXPRESSION_IDS: readonly ExpressionId[] = [
  'neutral',
  'smile',
  'happy',
  'determined',
  'worried',
  'teary',
  'sobbing',
  'shocked',
  'angry',
];

/** How to draw a face in code, for characters without a painted face. Head radii, from the eye line. */
export interface FaceStyle {
  /** Only the cheek marks, with no eyes, brows or mouth: the islanders, as in the film. */
  cheeksOnly: boolean;
  eyeX: number;
  eyeRx: number;
  eyeRy: number;
  brows: 'small' | 'usagi' | 'none';
  browY: number;
  blushX: number;
  blushY: number;
  blushRx: number;
  blushRy: number;
  blushPink: boolean;
  /** Hatch strokes on each cheek, and their line width in head radii. */
  hatch: number;
  hatchWidth: number;
  mouthY: number;
  mouthScale: number;
  neutralMouth: MouthKind;
}

/** Who lives on the island apart from the cast the Test panel lets you play: the Siren, resting in the
 * forbidden cave (see Siren.ts). */
export type ResidentId = 'siren' | 'mermaid' | 'shimajiro';

/**
 * How someone walks, each as a share of the plain way of walking, which you and the islanders have (1; see
 * Character.locomotionPose): how fast they go (their walk and their run, `pace`); how long their steps are
 * for that (shorter, the quicker they step); how much they bob up and down, sway from side to side, swing
 * their arms, lift their feet and lean into their pace; and how quickly they get going, stop and turn
 * (`quick`). Each of the cast walks in their own way, and each islander a little differently (the user,
 * 2026-10-23).
 */
export interface Gait {
  pace: number;
  stride: number;
  bounce: number;
  sway: number;
  arms: number;
  lift: number;
  lean: number;
  quick: number;
}

export interface CharacterDef {
  id: CharacterId | ResidentId;
  nameKey: StringKey;
  /** Path under public/, produced by art/blender/import_characters.py. */
  model: string;
  /** The island outfit asset fitted to this character, if it wears one. */
  outfit?: string;
  /** Their own clothes, worn instead of the island outfit, which is then theirs only from the Test panel: Rakko's
   * cape (the user, 2026-10-22), an asset fitted to them as the island outfit is. And what they carry with them
   * (his sword), from its Blender prop (art/blender/build_props.py). */
  own?: { outfit: string; carries?: 'sword' };
  face: FaceStyle;
  walkSpeed: number;
  runSpeed: number;
  /** Their own way of walking, where it is not the plain one (see Gait). */
  gait?: Partial<Gait>;
  /** What they always have in their left hand, from its Blender prop (art/blender/build_props.py): Kurimanju's
   * can of drink. */
  carries?: 'can';
  /** What they play, from its Blender prop, in its action: Rakko's ukulele ('ukulele'). */
  plays?: 'ukulele';
  /** Their arms hang at rest as they were built, not as the cast's do (see Character.locomotionPose): 島二郎's, built
   * hanging at his sides as the user's drawing has them (the user, 2026-10-25). */
  armsAsBuilt?: boolean;
}
