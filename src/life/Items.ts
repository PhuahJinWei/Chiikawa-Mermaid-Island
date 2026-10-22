import * as THREE from 'three';
import { createHeld, type HeldLight } from '../characters/Props';
import { loadPropModel } from '../world/PropModels';
import { flameMaterial } from '../world/Props';
import { FILM } from '../world/Look';
import type { StringKey } from '../i18n/I18n';

/**
 * The things one carries on the island (the user, 2026-10-22: hold, grab, store in the pouch, put down):
 * what the festival's stalls hand over, the beach's shells and starfish, a torch, the stage's ukulele,
 * Kurimanju's cans. Each is a prop built in Blender (art/blender/build_items.py, the can and the ukulele
 * build_props.py's), made into as many copies as are held; what lies about is drawn a kind at once (see
 * Things).
 */

export type ItemId =
  | 'ringoame'
  | 'chocobanana'
  | 'pine'
  | 'wataame'
  | 'tornado'
  | 'churros'
  | 'karaage'
  | 'frank'
  | 'yakitori'
  | 'kushiyaki'
  | 'gyukushi'
  | 'ikayaki'
  | 'hamayaki'
  | 'takoyaki'
  | 'okonomiyaki'
  | 'crepe'
  | 'icecream'
  | 'shavedIce'
  | 'kebab'
  | 'castella'
  | 'obanyaki'
  | 'steamer'
  | 'juice'
  | 'ramune'
  | 'beer'
  | 'can'
  | 'torch'
  | 'ukulele'
  | 'seashell'
  | 'starfish';

/** What one does with a thing from the hand: eats it, drinks it, plays it; or keeps it. */
export type ItemUse = 'eat' | 'drink' | 'play' | null;

/** How a thing lies once put down: standing on its foot, lying on its side, or flat as it is held. */
export type ItemRest = 'stand' | 'lie' | 'flat';

export interface ItemDef {
  use: ItemUse;
  rest: ItemRest;
  /** Held flat on the paw (a tray, a shell), not upright in it. */
  flat?: boolean;
  /** Its prop, if not item_<id>. */
  model?: string;
  /** Held turned this way in the paw (radians about x, y and z, in that order) with this point of it (in the
   * prop's frame) in the paw's grip, as a ukulele is held by its neck, upright. */
  turn?: [number, number, number];
  grip?: [number, number, number];
  /** Burns in the paw by night (the torch): only you carry one, its light being the one carried light (see
   * Firelight.setHeld), so no one else takes it up. */
  light?: boolean;
}

/** A thing as someone has it (see Hands), or as it lies (see Things): what it is, and where it belongs. */
export interface Carried {
  readonly item: ItemId;
  /** Its own place (things.json's `kept`), which it goes back to each morning from wherever it lies. */
  home: string | null;
  /** Whose it is: 'player' or someone's id, from putting it down or being given it; null for anyone's (the
   * sea's shells, what a stall hands over, a thing with a place of its own). */
  owner: string | null;
  /** Taken up by someone not its owner: where it lay (x, y, z and its turn), to go back there before the
   * night (or to its owner); null if not lent. */
  lent: [number, number, number, number] | null;
}

/** A thing just come by: no one's, from nowhere in particular (or `owner`'s). */
export function carried(item: ItemId, owner: string | null = null): Carried {
  return { item, home: null, owner, lent: null };
}

/** A carried thing as a save keeps it; a save from before things were kept with where they belong has the
 * thing's name only. */
export type SavedCarried = Carried | ItemId;

export function restoreCarried(saved: unknown): Carried | null {
  if (isItem(saved)) return carried(saved);
  if (!saved || typeof saved !== 'object') return null;
  const s = saved as Partial<Carried>;
  if (!isItem(s.item)) return null;
  const lent = Array.isArray(s.lent) && s.lent.length === 4 && s.lent.every(Number.isFinite) ? (s.lent as Carried['lent']) : null;
  return { item: s.item, home: typeof s.home === 'string' ? s.home : null, owner: typeof s.owner === 'string' ? s.owner : null, lent };
}

const food = (rest: ItemRest, flat = false): ItemDef => ({ use: 'eat', rest, flat });
const drink = (): ItemDef => ({ use: 'drink', rest: 'stand' });

export const ITEMS: Record<ItemId, ItemDef> = {
  ringoame: food('lie'),
  chocobanana: food('lie'),
  pine: food('lie'),
  wataame: food('lie'),
  tornado: food('lie'),
  churros: food('lie'),
  karaage: food('stand'),
  frank: food('lie'),
  yakitori: food('lie'),
  kushiyaki: food('lie'),
  gyukushi: food('lie'),
  ikayaki: food('lie'),
  hamayaki: food('flat', true),
  takoyaki: food('flat', true),
  okonomiyaki: food('flat', true),
  crepe: food('lie'),
  icecream: food('lie'),
  shavedIce: food('stand'),
  kebab: food('stand'),
  castella: food('stand'),
  obanyaki: food('stand'),
  steamer: food('stand'),
  juice: drink(),
  ramune: drink(),
  beer: drink(),
  can: { use: 'drink', rest: 'stand', model: 'can' },
  torch: { use: null, rest: 'lie', light: true },
  // By its neck, upright, its body below (the prop's neck runs out along +x).
  ukulele: { use: 'play', rest: 'lie', model: 'ukulele', turn: [0, 0, Math.PI / 2], grip: [0.2, 0, 0] },
  seashell: { use: null, rest: 'lie' },
  starfish: { use: null, rest: 'flat', flat: true },
};

/** Every thing there is: those above, and any other the things' build makes (art/blender/build_items.py, its
 * icon sheet's order), taken in at load as a keepsake lying on its side (see registerItems). */
export const ITEM_IDS = Object.keys(ITEMS) as ItemId[];

/** Takes in a thing the build made that has no entry above: kept, not eaten, lying on its side, held upright.
 * Everyone who lives here takes it up, keeps it and gives it as they would a shell (see Life's chooser), as
 * nothing they do asks what a thing is by its name. */
function registerItem(id: string): void {
  if (id in ITEMS || id === 'paw') return;
  (ITEMS as Record<string, ItemDef>)[id] = { use: null, rest: 'lie' };
  ITEM_IDS.push(id as ItemId);
}

export function isItem(id: unknown): id is ItemId {
  return typeof id === 'string' && id in ITEMS;
}

/** Its name, in the game's words. */
export function itemName(id: ItemId): StringKey {
  return `item.${id}` as StringKey;
}

/** What each stall hands over, by its goods (Stall.goods, the kit on its counter). */
export const STALL_ITEM: Record<string, ItemId> = {
  takoyaki: 'takoyaki',
  steamer: 'steamer',
  ringoame: 'ringoame',
  chocobanana: 'chocobanana',
  pine: 'pine',
  wataame: 'wataame',
  juice: 'juice',
  ramune: 'ramune',
  beer: 'beer',
  tornado: 'tornado',
  churros: 'churros',
  karaage: 'karaage',
  frank: 'frank',
  yakitori: 'yakitori',
  kushiyaki: 'kushiyaki',
  gyukushi: 'gyukushi',
  ikayaki: 'ikayaki',
  hamayaki: 'hamayaki',
  okonomiyaki: 'okonomiyaki',
  crepe: 'crepe',
  icecream: 'icecream',
  shavedIce: 'shavedIce',
  kebab: 'kebab',
  castella: 'castella',
  obanyaki: 'obanyaki',
};

/** A torch's flame carried in the paw beside the village torches' (see flameMaterial), and how much brighter
 * than white it burns. */
const FLAME_SIZE = 0.15;
const FLAME_BRIGHT = 2.2;

/** Where a thing's icon is in the sheet of them (public/models/props/item_icons.webp). */
export interface IconSheet {
  size: number;
  columns: number;
  rows: number;
  order: string[];
}

/** A copy of a thing (see ItemModels.make): its body and pen, its flame if it has one, lit as `light` says. */
export interface ItemCopy extends THREE.Group {
  userData: { item: ItemId | 'paw'; light: HeldLight; flame?: THREE.Mesh };
}

/**
 * The things' shapes, loaded once, and copies of them made as they are needed: lit as whoever holds them
 * is (see createHeld), and, for what you hold seen out of your own eyes, marked as the cast are so the film
 * look's passes leave them as drawn (`mark`). A torch's copy has its flame, shown while it burns.
 */
export class ItemModels {
  private constructor(
    private readonly bodies: Map<string, THREE.BufferGeometry>,
    private readonly flames: Map<string, THREE.BufferGeometry>,
    /** How far each thing's foot is under its origin, standing, lying on its side and flat (metres). */
    private readonly feet: Map<string, Record<ItemRest, number>>,
    readonly icons: IconSheet,
  ) {}

  static async load(): Promise<ItemModels> {
    // Every thing the build made, those this file has no entry for among them (see registerItem).
    const icons = await fetch('models/props/item_icons.json').then((r) => r.json() as Promise<{ size: number; columns: number; order: string[] }>);
    for (const id of icons.order) registerItem(id);
    const ids: (ItemId | 'paw')[] = [...ITEM_IDS, 'paw'];
    const models = await Promise.all(ids.map((id) => loadPropModel(id === 'paw' ? 'item_paw' : (ITEMS[id].model ?? `item_${id}`))));
    const bodies = new Map<string, THREE.BufferGeometry>();
    const flames = new Map<string, THREE.BufferGeometry>();
    const feet = new Map<string, Record<ItemRest, number>>();
    ids.forEach((id, i) => {
      const held = id === 'paw' ? null : heldMatrix(ITEMS[id]);
      const body = models[i].parts.find((p) => p.role === 'body') ?? models[i].parts[0];
      bodies.set(id, held ? body.geometry.clone().applyMatrix4(held) : body.geometry);
      const flame = models[i].parts.find((p) => p.role === 'flame');
      if (flame) flames.set(id, held ? flame.geometry.clone().applyMatrix4(held) : flame.geometry);
      feet.set(id, restingFeet(bodies.get(id) as THREE.BufferGeometry));
    });
    return new ItemModels(bodies, flames, feet, { ...icons, rows: Math.ceil(icons.order.length / icons.columns) });
  }

  /** A thing's shape, as it is held (see heldMatrix): what every copy of it is made of. */
  shape(id: ItemId | 'paw'): THREE.BufferGeometry {
    const body = this.bodies.get(id);
    if (!body) throw new Error(`No thing ${id}`);
    return body;
  }

  /** A copy of a thing, lit as `light` gives (fresh, white and in the open air, if not given); `mark` for
   * what you see in your own paw (see createHeld). */
  make(id: ItemId | 'paw', mark = false): ItemCopy {
    const copy = createHeld(this.shape(id), { mark }) as ItemCopy;
    copy.userData.item = id;
    const flame = this.flames.get(id);
    if (flame) {
      const material = flameMaterial(FLAME_SIZE, FLAME_BRIGHT);
      if (FILM && mark) {
        // As the rest of it, left as drawn by the film look's passes (see createHeld).
        material.defines = { FILM_MASK: '' };
        const compile = material.onBeforeCompile;
        material.onBeforeCompile = (shader, renderer) => {
          compile.call(material, shader, renderer);
          shader.fragmentShader = shader.fragmentShader.replace(
            '#include <opaque_fragment>',
            '#include <opaque_fragment>\n#ifdef FILM_MASK\ngl_FragColor.a = 0.5;\n#endif',
          );
        };
      }
      const mesh = new THREE.Mesh(flame, material);
      mesh.visible = false;
      copy.add(mesh);
      copy.userData.flame = mesh;
    }
    return copy;
  }

  /** How far under a thing's origin its foot is, lying as `rest` says (see restingTurn). */
  footOf(id: ItemId, rest: ItemRest): number {
    return this.feet.get(id)?.[rest] ?? 0;
  }

  /** Where a thing's icon is in the sheet: its column and row. */
  iconAt(id: ItemId): [number, number] {
    const i = Math.max(0, this.icons.order.indexOf(id));
    return [i % this.icons.columns, Math.floor(i / this.icons.columns)];
  }
}

const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();

/** How a thing's prop is moved to be held as ItemDef.turn and grip say (its grip at the origin), or null. */
function heldMatrix(def: ItemDef): THREE.Matrix4 | null {
  if (!def.turn && !def.grip) return null;
  const [gx, gy, gz] = def.grip ?? [0, 0, 0];
  const [tx, ty, tz] = def.turn ?? [0, 0, 0];
  return new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(tx, ty, tz, 'XYZ')).multiply(new THREE.Matrix4().makeTranslation(-gx, -gy, -gz));
}

/** How a thing is turned lying as `rest` says, about its own origin: lying on its side, its front up. */
export function restingTurn(rest: ItemRest, out: THREE.Quaternion): THREE.Quaternion {
  return rest === 'lie' ? out.setFromAxisAngle(_p.set(1, 0, 0), -Math.PI / 2) : out.identity();
}

/** How far under its origin each way of lying puts a thing's lowest point. */
function restingFeet(geometry: THREE.BufferGeometry): Record<ItemRest, number> {
  const position = geometry.getAttribute('position');
  const out: Record<ItemRest, number> = { stand: 0, lie: 0, flat: 0 };
  for (const rest of ['stand', 'lie', 'flat'] as const) {
    restingTurn(rest, _q);
    let low = Infinity;
    for (let i = 0; i < position.count; i++) {
      _p.fromBufferAttribute(position, i).applyQuaternion(_q);
      low = Math.min(low, _p.y);
    }
    out[rest] = -low;
  }
  return out;
}
