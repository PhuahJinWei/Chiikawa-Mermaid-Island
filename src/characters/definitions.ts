import type { CharacterDef, CharacterId, FaceStyle } from './types';

/**
 * Runtime settings per character.
 *
 * Chiikawa, Hachiware, Usagi and Momonga come from the downloaded Blender models,
 * converted by art/blender/import_characters.py, and their faces are painted by hand
 * (art/faces/), so the face styles below are only fallbacks for them. The islanders are
 * converted from the cast's models too; their faces are only the cheek marks, drawn from
 * islanderFace below.
 */
const roundFace: FaceStyle = {
  cheeksOnly: false,
  eyeX: 0.31,
  eyeRx: 0.1,
  eyeRy: 0.125,
  brows: 'small',
  browY: 0.24,
  blushX: 0.58,
  blushY: -0.13,
  blushRx: 0.185,
  blushRy: 0.11,
  blushPink: true,
  hatch: 4,
  hatchWidth: 0.0224,
  mouthY: -0.21,
  mouthScale: 1.3,
  neutralMouth: 'cat',
};

/** Every islander's face: four bold hatch strokes on each cheek, where Chiikawa's cheeks are, and nothing else. */
const islanderFace: FaceStyle = {
  ...roundFace,
  cheeksOnly: true,
  blushX: 0.6,
  blushY: -0.15,
  blushPink: false,
  hatchWidth: 0.036,
};

export const DEFINITIONS: Record<CharacterId, CharacterDef> = {
  chiikawa: {
    id: 'chiikawa',
    nameKey: 'char.chiikawa',
    model: 'models/chiikawa.glb',
    outfit: 'models/outfits/island_chiikawa.glb',
    face: { ...roundFace },
    walkSpeed: 1.9,
    runSpeed: 3.4,
  },
  hachiware: {
    id: 'hachiware',
    nameKey: 'char.hachiware',
    model: 'models/hachiware.glb',
    outfit: 'models/outfits/island_hachiware.glb',
    face: { ...roundFace, neutralMouth: 'catOpen' },
    walkSpeed: 2.0,
    runSpeed: 3.6,
  },
  usagi: {
    id: 'usagi',
    nameKey: 'char.usagi',
    model: 'models/usagi.glb',
    outfit: 'models/outfits/island_usagi.glb',
    face: { ...roundFace, brows: 'usagi', browY: 0.4, neutralMouth: 'catOpen' },
    walkSpeed: 2.2,
    runSpeed: 4.0,
  },
  momonga: {
    id: 'momonga',
    nameKey: 'char.momonga',
    model: 'models/momonga.glb',
    outfit: 'models/outfits/island_momonga.glb',
    face: { ...roundFace, neutralMouth: 'catOpen' },
    walkSpeed: 2.0,
    runSpeed: 3.7,
  },
  // The island's two named islanders, always together, and the only ones with leaves:
  // Hitoha has one, Futaba two. There is one of each.
  hitoha: {
    id: 'hitoha',
    nameKey: 'char.hitoha',
    model: 'models/islander_hitoha.glb',
    face: islanderFace,
    walkSpeed: 1.7,
    runSpeed: 3.0,
  },
  futaba: {
    id: 'futaba',
    nameKey: 'char.futaba',
    model: 'models/islander_futaba.glb',
    face: islanderFace,
    walkSpeed: 1.7,
    runSpeed: 3.0,
  },
};

/** An islander in the background crowd: its model, and the outfit it wears, if any. */
export interface CrowdKind {
  model: string;
  outfit?: string;
}

/** A generic islander: ears instead of leaves, and a grey flower crown. */
const generic = (ears: string): CrowdKind => ({
  model: `models/islander_${ears}_crowd.glb`,
  outfit: `models/outfits/island_islander_${ears}_crowd.glb`,
});

/**
 * The background crowd, in turn: generic islanders with round, cat or bunny ears and grey
 * flower crowns, as in the film's crowds. Never leaves: those are Hitoha's and Futaba's alone.
 * All are light copies, built for being seen from a distance.
 */
export const CROWD_KINDS: CrowdKind[] = [generic('round'), generic('cat'), generic('bunny')];
