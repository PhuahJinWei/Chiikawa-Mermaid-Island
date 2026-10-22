import * as THREE from 'three';
import { CANOPY_SHADE } from '../world/Look';
import { groundHeight, waterLevelAt } from '../world/Island';
import { ITEMS, restingTurn, type ItemCopy, type ItemId, type ItemModels } from './Items';
import { seeded } from './profiles';

/**
 * Things lying about the island (see Items): what you put down, where you put it, for good; the shells and
 * starfish the sea leaves on the beaches each morning, gone the next if no one picks them up; and the few
 * that have a place of their own (the stage's ukulele, the torch by your door), back there each morning if
 * they have been given away or lost.
 */

export interface Thing {
  readonly item: ItemId;
  /** Where it lies: its origin, on the ground. */
  readonly at: THREE.Vector3;
  readonly yaw: number;
  readonly copy: ItemCopy;
  /** The day the sea left it on the beach (gone the next), or null for kept where it lies. */
  readonly day: number | null;
  /** Its place of its own (a key of Things.homes), if it has one. */
  readonly home: string | null;
}

/** A thing as kept in a save. */
export interface SavedThing {
  item: ItemId;
  x: number;
  y: number;
  z: number;
  yaw: number;
  day: number | null;
  home: string | null;
}

/** Things are drawn only this near the camera (metres). */
const SHOWN_WITHIN = 55;
/** The beaches the sea leaves shells and starfish on (x from, to; z from, to: the main beach south of the
 * festival's stalls, along its quay, and the night beach sloping into the sea), how high over the water
 * (metres: the main beach stands 0.82 over it behind its timber wall), the pier's way up the beach they keep
 * clear of (half its width, from z on), how many it leaves each morning (shells, starfish), and how far apart. */
const BEACH = { x: [-46, 82], z: [-26, 10], over: [0.03, 0.9] };
const STALLS_SOUTH = -11;
const PIER_WAY = { half: 3.5, from: -9 };
const SHELLS = 6;
const STARFISH = 3;
const APART = 3;

const _q = new THREE.Quaternion();
const _turn = new THREE.Quaternion();
const _up = new THREE.Vector3(0, 1, 0);

export class Things {
  readonly list: Thing[] = [];
  readonly group = new THREE.Group();
  /** The places some things have of their own (see Thing.home): where each lies and which way. */
  readonly homes = new Map<string, { item: ItemId; at: THREE.Vector3; yaw: number }>();
  /** The last morning the sea left things on the beaches. */
  beachDay = -1;
  /** Copies no longer lying about, kept to be used again. */
  private readonly spare = new Map<ItemId, ItemCopy[]>();

  constructor(
    readonly models: ItemModels,
    scene: THREE.Object3D,
    private readonly shade: ((x: number, y: number, z: number) => number) | null,
  ) {
    this.group.name = 'things';
    scene.add(this.group);
  }

  /** A copy of a thing, fresh or used again. */
  copyOf(item: ItemId): ItemCopy {
    const copy = this.spare.get(item)?.pop() ?? this.models.make(item);
    copy.scale.setScalar(1);
    copy.visible = true;
    return copy;
  }

  /** Done with a copy: kept to be used again. */
  release(copy: ItemCopy): void {
    copy.removeFromParent();
    const item = copy.userData.item;
    if (item === 'paw') return;
    const list = this.spare.get(item) ?? [];
    list.push(copy);
    this.spare.set(item, list);
  }

  /** Lays `item` on the ground at `at` (x, z; y the ground under it), turned `yaw`, as it rests (see
   * ItemDef.rest). */
  put(item: ItemId, at: THREE.Vector3, yaw: number, day: number | null = null, home: string | null = null): Thing {
    const copy = this.copyOf(item);
    const rest = ITEMS[item].rest;
    const y = at.y + this.models.footOf(item, rest) + 0.004;
    copy.position.set(at.x, y, at.z);
    copy.quaternion.copy(_q.setFromAxisAngle(_up, yaw)).multiply(restingTurn(rest, _turn));
    copy.updateMatrixWorld(true);
    // Lit as the ground under it: in the trees' shade if it is; never burning.
    const light = copy.userData.light;
    const shade = this.shade?.(at.x, y, at.z) ?? 0;
    light.uShade.value.setRGB(1, 1, 1).lerp(CANOPY_SHADE, shade);
    light.uOpenAir.value = 1;
    if (copy.userData.flame) copy.userData.flame.visible = false;
    copy.traverse((o) => o.layers.set(0));
    this.group.add(copy);
    const thing: Thing = { item, at: new THREE.Vector3(at.x, at.y, at.z), yaw, copy, day, home };
    this.list.push(thing);
    return thing;
  }

  /** Picks `thing` up: off the ground, its copy let go. */
  take(thing: Thing): ItemId {
    const i = this.list.indexOf(thing);
    if (i >= 0) this.list.splice(i, 1);
    this.release(thing.copy);
    return thing.item;
  }

  /** Only what is near the camera is drawn. */
  update(camera: THREE.Vector3): void {
    for (const t of this.list) {
      t.copy.visible = Math.hypot(t.at.x - camera.x, t.at.z - camera.z) < SHOWN_WITHIN;
    }
  }

  /**
   * Each morning (`day`): the sea takes back what it left on the beaches yesterday and no one picked up, and
   * leaves new shells and starfish along the water's edge; what has a place of its own and is nowhere
   * (`elsewhere`: in your paw or pouch) goes back to it.
   */
  morning(day: number, elsewhere: (item: ItemId) => boolean): void {
    if (day === this.beachDay) return;
    this.beachDay = day;
    for (const t of [...this.list]) if (t.day !== null && t.day !== day) this.take(t);
    const rng = seeded(day * 7349 + 11);
    const placed: THREE.Vector3[] = [];
    const want = SHELLS + STARFISH;
    for (let tries = 0; tries < 600 && placed.length < want; tries++) {
      const x = BEACH.x[0] + rng() * (BEACH.x[1] - BEACH.x[0]);
      const z = BEACH.z[0] + rng() * (BEACH.z[1] - BEACH.z[0]);
      // On the sand up from the water's edge, south of the stalls (except on the night beach, out east), off
      // the pier's way up the beach, apart from the others.
      if (z < STALLS_SOUTH && x < 40) continue;
      if (Math.abs(x) < PIER_WAY.half && z > PIER_WAY.from) continue;
      const ground = groundHeight(x, z);
      const over = ground - waterLevelAt(x, z);
      if (!(over > BEACH.over[0] && over < BEACH.over[1])) continue;
      if (placed.some((p) => Math.hypot(p.x - x, p.z - z) < APART)) continue;
      const at = new THREE.Vector3(x, ground, z);
      placed.push(at);
      this.put(placed.length <= SHELLS ? 'seashell' : 'starfish', at, rng() * Math.PI * 2, day);
    }
    for (const [key, home] of this.homes) {
      if (this.list.some((t) => t.home === key) || elsewhere(home.item)) continue;
      this.put(home.item, home.at, home.yaw, null, key);
    }
  }

  /** What lies about, for a save. */
  save(): SavedThing[] {
    return this.list.map((t) => ({ item: t.item, x: t.at.x, y: t.at.y, z: t.at.z, yaw: t.yaw, day: t.day, home: t.home }));
  }

  /** Everything as a save had it (what lay about before is taken away). */
  restore(saved: SavedThing[], beachDay: number): void {
    for (const t of [...this.list]) this.take(t);
    for (const s of saved) {
      if (!(s.item in ITEMS)) continue;
      this.put(s.item, new THREE.Vector3(s.x, s.y, s.z), s.yaw, s.day, s.home);
    }
    this.beachDay = beachDay;
  }
}
