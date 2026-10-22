import type { ActionId } from '../characters/Actions';
import type { SpotId } from './Places';

/**
 * Who lives on the island and how they spend their days (see Life): their house, the places they like to go,
 * what they do at set hours, whom they go about with, how hard they are to push, their part at the feast.
 */

/** Something done at set hours of the day, at a place: standing, sitting there, or with an action. */
export interface Habit {
  from: number;
  to: number;
  spot: SpotId;
  /** Sitting on a seat there (a log, the pier's edge), or doing this while standing there. */
  sit?: boolean;
  action?: ActionId;
  /** Only on some days: the chance of it on any one. */
  chance?: number;
}

export interface Profile {
  /** The places they stroll to, and how much they like each. */
  spots: Partial<Record<SpotId, number>>;
  habits?: Habit[];
  /** Whom they go about with: they keep near them while both are out and about. */
  with?: string;
  /** How hard they are to push, an islander's being 1. */
  weight: number;
  /** The chance they go to the stalls for each meal. */
  hungry: number;
  /** Their part at the feast: playing for it, or dancing at it now and then. */
  feast?: 'ukulele' | 'dance';
  /** They run rather than walk when going somewhere. */
  runs?: boolean;
}

/**
 * Where everyone sleeps (the user, 2026-10-22): Hitoha and Futaba in the raised villager's hut nearest the
 * main road; you in a villager's hut of your own; Chiikawa, Hachiware and Usagi together in one guest house,
 * Shisa with Kurimanju, Momonga with Furuhonya, Rakko on his own; the islanders two to a hut. Houses are
 * named by their kind and the middle (x, z) the layout puts them at.
 */
export const HOMES: Record<string, string> = {
  player: 'hut_green@-20,-74.6',
  hitoha: 'hut_warm@-17.6,-58.4',
  futaba: 'hut_warm@-17.6,-58.4',
  chiikawa: 'guest_tan@21,-100.5',
  hachiware: 'guest_tan@21,-100.5',
  usagi: 'guest_tan@21,-100.5',
  shisa: 'guest_orange@12,-110.5',
  kurimanju: 'guest_orange@12,-110.5',
  momonga: 'guest_tan@20,-119.5',
  furuhonya: 'guest_tan@20,-119.5',
  rakko: 'guest_orange@33,-112',
};

/** How many islanders live on the island besides Hitoha and Futaba (the user: about 20): one shares your house
 * with you, the rest two to a house (ISLANDER_HOMES). */
export const ISLANDERS = 21;

/** The islanders' houses, filled two at a time in this order (the user: two to a house), after the one who
 * lives with you: the stilt huts along the lane to the fields, the yard's plank and beehive huts, and the four
 * built for them since (see LATE_HOUSES in art/blender/build_island.py): a stilt pair where the lane meets the
 * fields, a plank hut on the grass west of the yard, a beehive hut by it. */
export const ISLANDER_HOMES = [
  'hut_warm@-31.3,-68.1',
  'hut_green@-28.9,-51.9',
  'hut_plank@-21,-95',
  'hut_plank@-14.5,-101.5',
  'beehive@-30,-91.5',
  'beehive@-6.5,-104.5',
  'hut_green@-42.5,-61.6',
  'hut_warm@-40.1,-45.4',
  'hut_plank@-35.5,-84',
  'beehive@-25,-85.5',
];

/** The islanders' ways, one each in turn: out in the fields of a morning; down on the beaches; round the
 * plaza and its stage; up the paths to the waterfall; along the festival's street. */
const ISLANDER_WAYS: Profile[] = [
  {
    spots: { fields: 4, lane: 2, plaza: 2, yard: 1, street: 1 },
    habits: [{ from: 7, to: 10.5, spot: 'fields', action: 'look', chance: 0.8 }],
    weight: 1,
    hungry: 0.8,
  },
  { spots: { beachWest: 3, beachEast: 3, arch: 2, pierEnd: 1, street: 1 }, weight: 1, hungry: 0.8 },
  { spots: { plaza: 4, stage: 2, lane: 1, yard: 1, street: 1 }, weight: 1, hungry: 0.8 },
  { spots: { northPath: 2, waterfall: 2, glade: 1, plaza: 1, yard: 1, fields: 1 }, weight: 1, hungry: 0.7 },
  { spots: { street: 4, arch: 2, plaza: 1, beachEast: 1, stage: 1 }, weight: 1, hungry: 0.95 },
];

export const PROFILES: Record<string, Profile> = {
  // Shy, sticking close to Hachiware.
  chiikawa: {
    spots: { plaza: 2, street: 2, arch: 1, glade: 2, beachEast: 1, pierEnd: 1 },
    with: 'hachiware',
    weight: 0.8,
    hungry: 0.9,
  },
  // Out on the pier's end at dawn, as PLAN.md has Hachiware fishing then.
  hachiware: {
    spots: { street: 2, plaza: 2, pierEnd: 2, beachWest: 1, waterfall: 1, fields: 1, glade: 1 },
    habits: [{ from: 6.4, to: 7.6, spot: 'pierEnd', sit: true, chance: 0.8 }],
    weight: 0.9,
    hungry: 0.9,
  },
  // Wherever there is food, running.
  usagi: {
    spots: { street: 5, arch: 2, beachEast: 1, plaza: 1, pierEnd: 1 },
    weight: 1,
    hungry: 1,
    runs: true,
  },
  // Up where everyone can see her.
  momonga: {
    spots: { stage: 3, plaza: 2, street: 1, glade: 1, arch: 1 },
    weight: 0.7,
    hungry: 0.8,
  },
  // Sitting with a drink in the afternoon.
  kurimanju: {
    spots: { beachWest: 2, glade: 1, street: 1, plaza: 1 },
    habits: [{ from: 14, to: 17.3, spot: 'beachWest', sit: true }],
    weight: 1.1,
    hungry: 0.7,
  },
  // Practising with his sword on the beach in the morning, playing at the feast.
  rakko: {
    spots: { beachEast: 2, nightBeach: 2, headland: 1, waterfall: 1, northPath: 1 },
    habits: [{ from: 6.6, to: 8.1, spot: 'beachEast', action: 'sword', chance: 0.85 }],
    weight: 1.3,
    hungry: 0.6,
    feast: 'ukulele',
  },
  // At home on the night beach (PLAN.md).
  furuhonya: {
    spots: { nightBeach: 6, beachEast: 2, pierEnd: 1 },
    weight: 1,
    hungry: 0.6,
  },
  shisa: {
    spots: { street: 2, plaza: 2, arch: 1, stage: 1, beachEast: 1 },
    with: 'kurimanju',
    weight: 1,
    hungry: 0.9,
    feast: 'dance',
  },
  // Inseparable: Futaba keeps by Hitoha.
  hitoha: {
    spots: { plaza: 2, fields: 2, lane: 2, street: 1, yard: 1, arch: 1 },
    weight: 1,
    hungry: 0.8,
  },
  futaba: {
    spots: { plaza: 2, fields: 2, lane: 2, street: 1, yard: 1 },
    with: 'hitoha',
    weight: 1,
    hungry: 0.8,
  },
};

/** An islander's profile: their ways (ISLANDER_WAYS, in turn); every few dance at the feast; some go about
 * with whoever they live with (`mate`). */
export function islanderProfile(index: number, mate: string | null = null): Profile {
  const way = ISLANDER_WAYS[index % ISLANDER_WAYS.length];
  return { ...way, feast: index % 4 === 1 ? 'dance' : undefined, with: mate && index % 3 === 0 ? mate : undefined };
}

/** A number from 0 to 1 that is the same for the same seed (mulberry32). */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A whole number for a name, to seed with. */
export function hash(name: string): number {
  let h = 2166136261;
  for (let i = 0; i < name.length; i++) h = Math.imul(h ^ name.charCodeAt(i), 16777619);
  return h >>> 0;
}
