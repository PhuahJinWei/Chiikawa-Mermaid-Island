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
  // You: a nameless islander living on the island, the generic islander with round ears and a grey
  // flower crown, in the islanders' own grey-mauve (the crowd's light copy: seen only faintly, in the
  // water, from your own eyes). Choosing your head and your crown's colour is still to come.
  player: {
    id: 'player',
    nameKey: 'char.player',
    model: 'models/islander_round_crowd.glb',
    outfit: 'models/outfits/island_islander_round_crowd.glb',
    face: islanderFace,
    walkSpeed: 1.7,
    runSpeed: 3.0,
  },
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
  // A visiting guest, relaxed (PLAN.md), built from Chiikawa's model with a chestnut cap of its own.
  kurimanju: {
    id: 'kurimanju',
    nameKey: 'char.kurimanju',
    model: 'models/kurimanju.glb',
    outfit: 'models/outfits/island_kurimanju.glb',
    face: { ...roundFace },
    walkSpeed: 1.8,
    runSpeed: 3.2,
    // Always with a drink (PLAN.md): a can of it (the user, 2026-10-22).
    carries: 'can',
  },
  // Rakko-sensei, a visiting guest, calm and watchful (PLAN.md), built from Chiikawa's model a tenth taller,
  // his star scar painted on his face. He wears his own clothes, his cape, and carries his sword, never the
  // island outfit, which is his only from the Test panel (the user, 2026-10-22). He plays the ukulele.
  rakko: {
    id: 'rakko',
    nameKey: 'char.rakko',
    model: 'models/rakko.glb',
    outfit: 'models/outfits/island_rakko.glb',
    own: { outfit: 'models/outfits/cape_rakko.glb', carries: 'sword' },
    face: { ...roundFace },
    walkSpeed: 1.8,
    runSpeed: 3.3,
    plays: 'ukulele',
  },
  // Furuhonya the crab, a visiting guest seen at the night beach (PLAN.md), built from Chiikawa's model with a
  // coral-pink cap, two claws on her head and two tiny antennae.
  furuhonya: {
    id: 'furuhonya',
    nameKey: 'char.furuhonya',
    model: 'models/furuhonya.glb',
    outfit: 'models/outfits/island_furuhonya.glb',
    face: { ...roundFace },
    walkSpeed: 1.8,
    runSpeed: 3.2,
  },
  // Shisa, a visiting guest, cheerful (PLAN.md), built from Hachiware's model for its cat ears, with a mane of
  // orange flames either side of the head.
  shisa: {
    id: 'shisa',
    nameKey: 'char.shisa',
    model: 'models/shisa.glb',
    outfit: 'models/outfits/island_shisa.glb',
    face: { ...roundFace },
    walkSpeed: 2.0,
    runSpeed: 3.6,
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

/**
 * The Siren, the giant mermaid of the forbidden cave, modelled by art/blender/build_siren.py: 3.6 times
 * Chiikawa's height, as the film shows her on the cave's ledge. Her face is painted (art/faces/siren/), so
 * its style here is only a fallback. She rests where she is (see Siren.ts); her pace is never used.
 */
export const SIREN: CharacterDef = {
  id: 'siren',
  nameKey: 'char.siren',
  model: 'models/siren.glb',
  face: { ...roundFace },
  walkSpeed: 1.0,
  runSpeed: 2.0,
};

/**
 * The Siren's two little mermaids, exactly alike (art/blender/build_mermaid.py): the Siren's own shape made
 * smaller, 0.7 of Chiikawa's height. Their one face is painted (art/faces/mermaid/), so its style here is only
 * a fallback. They keep to the Siren (see LittleMermaids.ts); their pace is never used.
 */
export const MERMAID: CharacterDef = {
  id: 'mermaid',
  nameKey: 'char.mermaid',
  model: 'models/mermaid.glb',
  face: { ...roundFace },
  walkSpeed: 1.0,
  runSpeed: 2.0,
};

/** An islander in the background crowd: its model, and the outfit it wears, if any. */
export interface CrowdKind {
  model: string;
  outfit?: string;
}

/** A generic islander: ears (or what grows in their place) instead of leaves, and a grey flower crown. */
const generic = (head: string): CrowdKind => ({
  model: `models/islander_${head}_crowd.glb`,
  outfit: `models/outfits/island_islander_${head}_crowd.glb`,
});

/**
 * The background crowd, in turn (the user, 2026-10-23: more variety, now there are twenty-one), each head as the
 * film's crowds have them (the welcome crowd, the festival's): none, the most common; cat ears; a knob on top;
 * round ears; two little horns; long bunny ears; a spike on top; short bunny ears; one horn to the side. In this
 * order no two next to each other share one, so neither do housemates (Life fills houses two at a time). Never
 * leaves: those are Hitoha's and Futaba's alone. All are light copies, built for being seen from a distance.
 */
export const CROWD_KINDS: CrowdKind[] = [
  generic('plain'),
  generic('cat'),
  generic('knob'),
  generic('round'),
  generic('horns'),
  generic('bunny'),
  generic('spike'),
  generic('stubby'),
  generic('horn'),
];
