import * as THREE from 'three';
import { sharedUniforms } from '../characters/CharacterMaterial';
import { lyingMaterials } from '../characters/Props';
import { outlineGeometry } from '../world/Ink';
import { CANOPY_SHADE } from '../world/Look';
import { groundHeight, standAt, waterLevelAt } from '../world/Island';
import { ITEMS, carried, isItem, restingTurn, restoreCarried, type Carried, type ItemCopy, type ItemId, type ItemModels } from './Items';
import { seeded } from './profiles';

/**
 * Things lying about the island (see Items), as public/data/things.json lays them out and as everyone moves
 * them about:
 * - those with places of their own (its `kept`: the stage's ukulele, the torch by your door), back there
 *   each morning from wherever they lie, or made anew if no one has them;
 * - what each morning leaves about (its `daily`: the shells and starfish the sea leaves on the beaches),
 *   gone the next morning if no one has taken it up;
 * - whatever anyone puts down, where they put it: theirs, for good.
 *
 * Each keeps where it belongs and whose it is (see Carried), so what is lent goes back where it lay, each
 * morning at the latest (see morning). Whoever lives here sees what lies about as it lies (Life's chooser
 * looks over `list` each time it chooses), so a thing laid down by the data, by you or by anyone else is
 * there for anyone to take up at once, whatever it is.
 *
 * What lies near the camera is drawn a kind at once, however many of it lie there (see draw); what anyone
 * holds is a copy of its own (see copyOf).
 */

export interface Thing extends Carried {
  /** Where it lies (its origin, on the ground) and its turn. */
  readonly at: THREE.Vector3;
  readonly yaw: number;
  /** Where a paw takes it up as it lies (its prop's origin): what you reach for (see Play). */
  readonly grip: THREE.Vector3;
  /** The trees' shade it lies in as the light falls now (white in the sun), following the sun and the moon
   * over the day (see reshade); in the forbidden cave, the cave's own light on it, as it is on someone there. */
  readonly shade: THREE.Color;
  /** Lies in the forbidden cave, out of the open air: lit by the cave's light only (see Things.shadeOf). */
  readonly inCave: boolean;
  /** Drawn now, near enough the camera (see update). */
  shown: boolean;
  /** In its stand (a village torch's brand, burning on its pole: see ThingsPlan.stands), drawn by the stand's
   * own prop, not here; still there to take up. */
  hidden: boolean;
  /** The morning that left it about (gone the next if no one takes it up), or null for kept where it lies. */
  readonly day: number | null;
  /** Whoever is on their way to take it up (see Life's chooser), so two do not go for one; or null. */
  sought: unknown;
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
  owner?: string | null;
  lent?: [number, number, number, number] | null;
}

/**
 * What public/data/things.json lays about the island:
 * - `kept`: things with a place of their own, each by a name of its own (`id`): what it is, where it lies
 *   (x, z, and `y`, the height of what it lies on if not the ground's top: the stage's deck, a porch; or
 *   `height`, just how high it lies, on a shelf, on the forbidden cave's floor), and its turn (radians).
 * - `stands`: props that hold a thing each at their flame (the village's torches, each its brand): the
 *   prop's kind and the thing. The game finds every such prop placed (see Game, Props.brands).
 * - `daily`: what each morning leaves about an area: how many of each thing (`items`), within a box (`box`:
 *   x from, to, z from, to), out of any of the boxes in `avoid`, only where the ground stands so high over
 *   the water (`shore`, metres, from, to: a beach's sand) if given (else anywhere one stands on dry ground),
 *   and so far apart (`apart`, metres).
 * A thing named there that the game has no model for is left out.
 */
export interface ThingsPlan {
  kept: { id: string; item: ItemId; x: number; z: number; y?: number; height?: number; yaw: number }[];
  stands: { prop: string; item: ItemId }[];
  daily: { items: Record<string, number>; box: [number, number, number, number]; avoid?: [number, number, number, number][]; shore?: [number, number]; apart?: number }[];
}

export async function loadThingsPlan(): Promise<ThingsPlan> {
  const response = await fetch('data/things.json');
  if (!response.ok) throw new Error('Could not load data/things.json');
  const plan = (await response.json()) as Partial<ThingsPlan>;
  return { kept: plan.kept ?? [], stands: plan.stands ?? [], daily: plan.daily ?? [] };
}

/** Things are drawn only this near the camera (metres). */
const SHOWN_WITHIN = 55;
/** Put down within this of where it lay when lent, it is back (metres). */
const BACK_WITHIN = 0.6;
/** A morning's tries at laying out each area's things. */
const TRIES = 600;
/** Room in a kind's drawing for so many things near the camera at first (see Kind), twice as many each time
 * more lie there. */
const ROOM = 16;
/** The trees' shade on what lies near the camera is looked at again for so many things a frame, in turn (see
 * reshade); a change in it smaller than this (over its colour's three parts) is not drawn. */
const RESHADE = 24;
const SHADE_STEP = 1 / 512;

/** A kind of thing lying about near the camera, drawn at once (see Things.draw): its things' bodies and their
 * pen, each thing a copy (an instance) of the kind's shape, where it lies and in its shade. */
interface Kind {
  item: ItemId;
  /** Its things in the forbidden cave (drawn out of the open air), or out on the island. */
  cave: boolean;
  body: THREE.InstancedMesh;
  hull: THREE.InstancedMesh;
  /** Its things drawn, in their copies' order. */
  near: Thing[];
  /** What of it lies near the camera has changed (put down, taken up, come near or gone far): drawn anew. */
  changed: boolean;
  /** The shade on some of them has changed (see reshade): their colours drawn anew. */
  shaded: boolean;
}

const _q = new THREE.Quaternion();
const _turn = new THREE.Quaternion();
const _up = new THREE.Vector3(0, 1, 0);
const _v = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _one = new THREE.Vector3(1, 1, 1);
const _shade = new THREE.Color();
const _cave = new THREE.Color();

export class Things {
  readonly list: Thing[] = [];
  readonly group = new THREE.Group();
  /** The places some things have of their own (see Thing.home): where each lies and which way; a stand's
   * (see ThingsPlan.stands) which stand it is (see Props.brands). */
  readonly homes = new Map<string, { item: ItemId; at: THREE.Vector3; yaw: number; stand?: number }>();
  /** A thing has gone into its stand (`filled`) or been taken out of it: the stand's prop shows it or not
   * (see Stage.setBrand). Set by the game. */
  onStand: (stand: number, filled: boolean) => void = () => {};
  /** The last morning that left things about. */
  beachDay = -1;
  /** Copies no longer held, kept to be used again. */
  private readonly spare = new Map<string, ItemCopy[]>();
  /** Each kind lying about, drawn at once (see draw), out on the island and in the forbidden cave, and what it
   * is drawn with there. */
  private readonly kinds = new Map<string, Kind>();
  private readonly materials = lyingMaterials();
  private readonly caveMaterials = lyingMaterials(false);
  /** The materials of kinds coloured by a picture (the book: see ItemDef.paint), out on the island and in the cave. */
  private readonly painted = new Map<string, ReturnType<typeof lyingMaterials>>();
  /** Where in `list` the shade was last looked at again (see reshade). */
  private reshaded = 0;

  /** `shade`, the trees' shade at a point (in the film look); `caveLight`, the forbidden cave's own light at a
   * point inside it, into `out` (false outside it). */
  constructor(
    readonly models: ItemModels,
    scene: THREE.Object3D,
    private readonly plan: ThingsPlan,
    private readonly shade: ((x: number, y: number, z: number) => number) | null,
    private readonly caveLight: ((x: number, y: number, z: number, out: THREE.Color) => boolean) | null = null,
  ) {
    this.group.name = 'things';
    scene.add(this.group);
    for (const k of plan.kept) {
      if (!isItem(k.item)) continue;
      const at = new THREE.Vector3(k.x, k.height ?? groundHeight(k.x, k.z, k.y ?? Infinity), k.z);
      this.homes.set(k.id, { item: k.item, at, yaw: k.yaw });
    }
  }

  /** A stand (see ThingsPlan.stands): the place of its own of a thing of `item`'s kind, at `at`, in stand
   * `stand` (see Props.brands). */
  addStand(id: string, item: ItemId, at: THREE.Vector3, stand: number): void {
    if (isItem(item)) this.homes.set(id, { item, at: at.clone(), yaw: 0, stand });
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

  /** Lays `c` on the ground at `at` (x, z; y the ground under it), turned `yaw`, as it rests (see
   * ItemDef.rest); left by the morning `day` if it is one of the day's. */
  put(c: Carried, at: THREE.Vector3, yaw: number, day: number | null = null): Thing {
    const item = c.item;
    const y = at.y + this.models.footOf(item, ITEMS[item].rest) + 0.004;
    // In its stand, if it has one and lies at it: the stand's prop shows it.
    const home = c.home ? this.homes.get(c.home) : undefined;
    const hidden = home?.stand !== undefined && home.at.distanceTo(at) < 0.3;
    const thing: Thing = {
      item,
      home: c.home,
      owner: c.owner,
      lent: c.lent,
      at: new THREE.Vector3(at.x, at.y, at.z),
      yaw,
      grip: new THREE.Vector3(at.x, y, at.z),
      shade: new THREE.Color(1, 1, 1),
      inCave: !!this.caveLight?.(at.x, y, at.z, _cave),
      shown: false,
      hidden,
      day,
      sought: null,
    };
    // Lit as the ground under it: in the trees' shade if it is, in the cave by its light; never burning (drawn
    // without its flame).
    this.shadeOf(thing);
    this.list.push(thing);
    // Drawn from the next frame on, if it lies near the camera (see update); its kind's drawing made now if
    // it is the first of its kind, so the game's shaders are made with the rest as it starts.
    this.kindOf(item, thing.inCave);
    if (hidden && home?.stand !== undefined) this.onStand(home.stand, true);
    return thing;
  }

  /** Takes `thing` up: off the ground (or out of its stand); what it is and where it belongs. */
  take(thing: Thing): Carried {
    const i = this.list.indexOf(thing);
    if (i >= 0) this.list.splice(i, 1);
    if (thing.shown) this.kindOf(thing.item, thing.inCave).changed = true;
    const stand = thing.hidden && thing.home ? this.homes.get(thing.home)?.stand : undefined;
    if (stand !== undefined) this.onStand(stand, false);
    return { item: thing.item, home: thing.home, owner: thing.owner, lent: thing.lent };
  }

  /** Whether `thing` still lies about (not taken up since it was seen). */
  lies(thing: Thing): boolean {
    return this.list.includes(thing);
  }

  /** Whether `c`, put down at `at`, is back where it lay when it was lent (see Carried.lent). */
  static backWhereItLay(c: Carried, at: THREE.Vector3): boolean {
    return !!c.lent && Math.hypot(c.lent[0] - at.x, c.lent[2] - at.z) < BACK_WITHIN && Math.abs(c.lent[1] - at.y) < 0.5;
  }

  /** Only what is near the camera is drawn: each kind's things there at once (see draw), in the trees' shade
   * as the light falls now (see reshade). */
  update(camera: THREE.Vector3): void {
    for (const t of this.list) {
      const shown = Math.hypot(t.at.x - camera.x, t.at.z - camera.z) < SHOWN_WITHIN;
      if (shown === t.shown) continue;
      t.shown = shown;
      // (Out of sight its shade was let be.)
      if (shown) this.shadeOf(t);
      this.kindOf(t.item, t.inCave).changed = true;
    }
    this.reshade();
    this.models.update();
    for (const kind of this.kinds.values()) {
      if (kind.changed) this.draw(kind);
      else if (kind.shaded) this.colour(kind);
      kind.changed = kind.shaded = false;
    }
  }

  /** The trees' shade on `t` as the light falls now, from the sun or the moon (see Thing.shade); in the cave, its
   * own light there, as a share of the hour's (which its drawing then takes out: see lyingMaterials), as someone
   * there is lit (see Character.updateShade); whether it changed enough to be drawn. */
  private shadeOf(t: Thing): boolean {
    if (t.inCave && this.caveLight?.(t.grip.x, t.grip.y, t.grip.z, _cave)) {
      const a = sharedUniforms.uAmbient.value;
      _shade.setRGB(_cave.r / Math.max(a.r, 0.05), _cave.g / Math.max(a.g, 0.05), _cave.b / Math.max(a.b, 0.05));
    } else {
      _shade.setRGB(1, 1, 1).lerp(CANOPY_SHADE, this.shade?.(t.grip.x, t.grip.y, t.grip.z) ?? 0);
    }
    const was = t.shade;
    if (Math.abs(_shade.r - was.r) + Math.abs(_shade.g - was.g) + Math.abs(_shade.b - was.b) < SHADE_STEP) return false;
    was.copy(_shade);
    return true;
  }

  /** The trees' shade on what lies near the camera looked at again as the sun (and by night the moon) moves
   * over, so many things a frame, in turn (RESHADE): a pile of them in a few frames, a thing here and there
   * every frame. */
  private reshade(): void {
    if (!this.shade && !this.caveLight) return;
    const n = this.list.length;
    let looked = 0;
    for (let k = 0; k < n && looked < RESHADE; k++) {
      this.reshaded = (this.reshaded + 1) % n;
      const t = this.list[this.reshaded];
      if (!t.shown) continue;
      looked++;
      if (this.shadeOf(t)) this.kindOf(t.item, t.inCave).shaded = true;
    }
  }

  /** The drawing of what lies about of `item`'s kind (see Kind), out on the island or in the cave, made the first
   * time one lies about there. */
  private kindOf(item: ItemId, cave: boolean): Kind {
    const key = cave ? `${item}:cave` : item;
    let kind = this.kinds.get(key);
    if (!kind) {
      kind = { item, cave, ...this.drawing(item, cave, ROOM), near: [], changed: false, shaded: false };
      this.kinds.set(key, kind);
    }
    return kind;
  }

  /** Bodies and pen for so many (`room`) things of `item`'s kind drawn at once, none yet, out on the island or in
   * the cave. */
  private drawing(item: ItemId, cave: boolean, room: number): { body: THREE.InstancedMesh; hull: THREE.InstancedMesh } {
    const shape = this.models.shape(item);
    const materials = this.materialsOf(item, cave);
    const body = new THREE.InstancedMesh(shape, materials.body, room);
    body.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    body.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(room * 3), 3).setUsage(THREE.DynamicDrawUsage);
    // The pen's hull shares where the bodies lie, their shades and their bounds (see addOutline).
    const hull = new THREE.InstancedMesh(outlineGeometry(shape), materials.ink, room);
    hull.instanceMatrix = body.instanceMatrix;
    hull.instanceColor = body.instanceColor;
    hull.boundingSphere = body.boundingSphere = new THREE.Sphere();
    body.count = hull.count = 0;
    body.visible = hull.visible = false;
    body.name = hull.name = cave ? `things:${item}:cave` : `things:${item}`;
    this.group.add(body, hull);
    return { body, hull };
  }

  /** What things of `item`'s kind lying about are drawn with, out on the island or in the cave: the plain materials,
   * or a kind coloured by a picture its own with it. */
  private materialsOf(item: ItemId, cave: boolean): ReturnType<typeof lyingMaterials> {
    const map = this.models.paintOf(item);
    if (!map) return cave ? this.caveMaterials : this.materials;
    const key = cave ? `${item}:cave` : item;
    let materials = this.painted.get(key);
    if (!materials) this.painted.set(key, (materials = lyingMaterials(!cave, map)));
    return materials;
  }

  /** Draws `kind`'s things lying near the camera, each where it lies, turned as it rests, in its shade: made room
   * for if there are more than its drawing has (twice as many, the old drawing let go). */
  private draw(kind: Kind): void {
    const item = kind.item;
    const near = this.list.filter((t) => t.item === item && t.inCave === kind.cave && t.shown && !t.hidden);
    const room = kind.body.instanceMatrix.count;
    if (near.length > room) {
      for (const mesh of [kind.body, kind.hull]) {
        mesh.removeFromParent();
        mesh.dispose();
      }
      Object.assign(kind, this.drawing(item, kind.cave, Math.max(near.length, room * 2)));
    }
    const { body, hull } = kind;
    const rest = ITEMS[item].rest;
    near.forEach((t, i) => {
      _q.setFromAxisAngle(_up, t.yaw).multiply(restingTurn(rest, _turn));
      body.setMatrixAt(i, _m.compose(t.grip, _q, _one));
    });
    kind.near = near;
    this.colour(kind);
    body.count = hull.count = near.length;
    body.visible = hull.visible = near.length > 0;
    body.instanceMatrix.needsUpdate = true;
    body.computeBoundingSphere();
  }

  /** Draws the shade on each of `kind`'s things as it is now (see Thing.shade). */
  private colour(kind: Kind): void {
    const { body, near } = kind;
    near.forEach((t, i) => body.setColorAt(i, t.shade));
    if (body.instanceColor) body.instanceColor.needsUpdate = true;
  }

  /**
   * Each morning (`day`): what the last morning left about and no one took up goes; what was lent and lies
   * elsewhere goes back where it lay; what has a place of its own goes back to it from wherever it lies, or
   * is made anew there if no one has it (`held`: whether anyone carries the thing with that place); and the
   * morning leaves its things about (see ThingsPlan.daily).
   */
  morning(day: number, held: (home: string) => boolean): void {
    if (day === this.beachDay) return;
    this.beachDay = day;
    for (const t of [...this.list]) if (t.day !== null && t.day !== day) this.take(t);
    for (const t of [...this.list]) {
      if (!t.lent) continue;
      const c = this.take(t);
      const [x, y, z, yaw] = c.lent as [number, number, number, number];
      c.lent = null;
      this.put(c, _v.set(x, y, z), yaw);
    }
    for (const [key, home] of this.homes) {
      const lying = this.list.find((t) => t.home === key);
      if (lying) {
        if (lying.at.distanceTo(home.at) > 0.3) this.put(this.take(lying), home.at, home.yaw);
        continue;
      }
      if (held(key)) continue;
      this.put({ ...carried(home.item), home: key }, home.at, home.yaw);
    }
    const rng = seeded(day * 7349 + 11);
    for (const area of this.plan.daily) this.scatter(area, day, rng);
  }

  /** Lays a morning's things about an area (see ThingsPlan.daily). */
  private scatter(area: ThingsPlan['daily'][number], day: number, rng: () => number): void {
    const want: ItemId[] = [];
    for (const [item, n] of Object.entries(area.items)) if (isItem(item)) for (let k = 0; k < n; k++) want.push(item);
    const [x0, x1, z0, z1] = area.box;
    const apart = area.apart ?? 2;
    const placed: THREE.Vector3[] = [];
    for (let tries = 0; tries < TRIES && placed.length < want.length; tries++) {
      const x = x0 + rng() * (x1 - x0);
      const z = z0 + rng() * (z1 - z0);
      if (area.avoid?.some(([ax0, ax1, az0, az1]) => x > ax0 && x < ax1 && z > az0 && z < az1)) continue;
      const ground = groundHeight(x, z);
      const over = ground - waterLevelAt(x, z);
      if (area.shore ? !(over > area.shore[0] && over < area.shore[1]) : over < 0.05 || Number.isNaN(standAt(x, z, ground))) continue;
      if (placed.some((p) => Math.hypot(p.x - x, p.z - z) < apart)) continue;
      const at = new THREE.Vector3(x, ground, z);
      placed.push(at);
      this.put(carried(want[placed.length - 1]), at, rng() * Math.PI * 2, day);
    }
  }

  /** What lies about, for a save. */
  save(): SavedThing[] {
    return this.list.map((t) => ({
      item: t.item,
      x: t.at.x,
      y: t.at.y,
      z: t.at.z,
      yaw: t.yaw,
      day: t.day,
      home: t.home,
      owner: t.owner,
      lent: t.lent,
    }));
  }

  /** Everything as a save had it (what lay about before is taken away). */
  /** Whether `c` still belongs on the island: it has no place of its own, or one things.json still lays out. One
   * whose place is gone from it (the user, 2026-10-23: one book, not three) is gone from a save with it. */
  belongs(c: Carried): boolean {
    return !c.home || this.homes.has(c.home);
  }

  restore(saved: SavedThing[], beachDay: number): void {
    for (const t of [...this.list]) this.take(t);
    for (const s of saved) {
      const c = restoreCarried(s);
      if (!c || !this.belongs(c)) continue;
      this.put(c, new THREE.Vector3(s.x, s.y, s.z), s.yaw, s.day);
    }
    this.beachDay = beachDay;
  }
}
