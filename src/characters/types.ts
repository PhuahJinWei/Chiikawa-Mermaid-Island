import type { StringKey } from '../i18n/I18n';

export type CharacterId = 'chiikawa' | 'hachiware' | 'usagi' | 'momonga' | 'hitoha' | 'futaba';
export const CHARACTER_IDS: readonly CharacterId[] = ['chiikawa', 'hachiware', 'usagi', 'momonga', 'hitoha', 'futaba'];

export type EyeKind = 'open' | 'happy' | 'closed' | 'squeeze' | 'teary';
export type BrowKind = 'none' | 'default' | 'worried' | 'angry';
export type MouthKind = 'none' | 'cat' | 'catOpen' | 'grin' | 'o' | 'wail';

/** The cast's faces for these are painted by hand: art/faces/<id>/expressions.txt. */
export type ExpressionId =
  | 'neutral'
  | 'smile'
  | 'happy'
  | 'determined'
  | 'worried'
  | 'teary'
  | 'sobbing'
  | 'shocked';

export const EXPRESSION_IDS: readonly ExpressionId[] = [
  'neutral',
  'smile',
  'happy',
  'determined',
  'worried',
  'teary',
  'sobbing',
  'shocked',
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

export interface CharacterDef {
  id: CharacterId;
  nameKey: StringKey;
  /** Path under public/, produced by art/blender/import_characters.py. */
  model: string;
  /** The island outfit asset fitted to this character, if it wears one. */
  outfit?: string;
  face: FaceStyle;
  walkSpeed: number;
  runSpeed: number;
}
