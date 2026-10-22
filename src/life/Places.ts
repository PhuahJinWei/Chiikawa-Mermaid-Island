import * as THREE from 'three';
import { loadPropModel, type PropInfo } from '../world/PropModels';
import type { Placed } from '../world/Props';
import { groundHeight, standAt, terrainHeight } from '../world/Island';
import type { Nav } from './Nav';
import type { StringKey } from '../i18n/I18n';

/**
 * Where life on the island happens (see Life): the houses people sleep in, the festival's stalls and their
 * queues, seats, the places people stroll to, and the night beach's feast. Worked out at load from the
 * layout (public/data/layout.json) and what each prop's build script says of it (PropModels' info), with
 * what is in each kind of room (ROOMS) read off the build scripts (art/blender/houses.py).
 */

/** Something one sits on: where (their feet, ride.y), which way they face, and where they stand to sit
 * down and when they get up. */
export interface Seat {
  readonly at: THREE.Vector3;
  readonly yaw: number;
  readonly up: THREE.Vector3;
  readonly kind: SeatKind;
  /** Whoever sits there (or is on their way to), or null. */
  taken: unknown;
}
export type SeatKind = 'bed' | 'hammock' | 'cushion' | 'stool' | 'log' | 'edge' | 'floor' | 'sand';

/** A house: the villagers' huts (with their room), their round huts (no room: whoever goes in is out of
 * sight), and the guest houses (their room has the hammock). */
export interface Home {
  readonly index: number;
  readonly prop: string;
  readonly kind: 'villager' | 'round' | 'guest';
  /** Its origin on the ground and the way it faces (its door's way out). */
  readonly at: THREE.Vector3;
  readonly yaw: number;
  /** Where one stands outside its door (on its porch or steps, or before a round hut's door). */
  readonly door: THREE.Vector3;
  /** Just inside its door, and a free spot in its room's middle; null for a round hut. */
  readonly inside: THREE.Vector3 | null;
  readonly room: THREE.Vector3 | null;
  /** Where its people sleep, the first the best (the bed, the hammock), and other seats in it. */
  readonly beds: Seat[];
  readonly seats: Seat[];
  /** Who lives there (see Life). */
  readonly people: string[];
}

/** A festival stall: where its keeper stands behind the counter, where its customers stand in line before
 * it, and the open sides the keeper comes in by. */
export interface Stall {
  readonly index: number;
  /** Its sign (a key into the game's text) and what it sells (its goods' kit). */
  readonly label: StringKey;
  readonly goods: string;
  readonly at: THREE.Vector3;
  readonly yaw: number;
  readonly keeper: THREE.Vector3;
  /** At the counter first, then each one behind. */
  readonly line: THREE.Vector3[];
  /** Outside its open sides. */
  readonly sides: THREE.Vector3[];
}

/** Somewhere people go to: its middle (on the ground), how far round it they spread, and which way one
 * looks there (radians, the way one faces; NaN for anywhere). */
export interface Spot {
  readonly id: SpotId;
  readonly at: THREE.Vector3;
  readonly radius: number;
  readonly look: number;
  /** Seats there (logs, the pier's edge). */
  readonly seats: Seat[];
}

export type SpotId =
  | 'plaza'
  | 'stage'
  | 'lane'
  | 'fields'
  | 'yard'
  | 'glade'
  | 'street'
  | 'arch'
  | 'pierEnd'
  | 'beachWest'
  | 'beachEast'
  | 'nightBeach'
  | 'northPath'
  | 'waterfall'
  | 'headland';

/** The places people stroll to: middle (x, z), reach, and the way one looks there (degrees: 0 south, 90 east;
 * null anywhere). Checked at load: a spot one cannot stand at is left out. */
const SPOTS: [SpotId, number, number, number, number | null][] = [
  ['plaza', 0, -78, 7, null],
  ['stage', 4.5, -83, 2.5, 140],
  ['lane', -22.5, -66.5, 2.5, null],
  // Among the fields' rows (made smaller from their east end, the user, 2026-10-22).
  ['fields', -53, -40, 4.5, null],
  ['yard', -17, -98, 3, null],
  ['glade', 17, -106, 3, null],
  ['street', 0, -26, 3, null],
  ['arch', 0, -8, 3, 0],
  ['pierEnd', 0, 13.2, 0.8, 0],
  ['beachWest', -32, -3, 4, 0],
  ['beachEast', 36, -4, 4, 0],
  ['nightBeach', 68, -18, 4, 125],
  ['northPath', -1, -118, 2, null],
  ['waterfall', 4, -178, 3, 180],
  ['headland', 26, -258, 3, 160],
];

/**
 * What is in each kind of room, in the house's own frame (x across, z toward its door; metres), heights over
 * its floor: where its people sleep ([x, up, z, yaw], yaw 0 toward the door) and its other seats; and a free
 * spot of its floor. The villagers' huts (furnish_hut in houses.py, every piece at FURNITURE 0.68): the bed
 * along the right wall from the back (mattress 0.36 up), the two straw cushions on the rug (0.17 up), the
 * stump stool by the bed's head (0.29); a second sleeper takes the first cushion. The plank huts have the
 * same room, fitted smaller. The guest houses (build_guest_house): only the red hammock slung across the
 * room before the back window, its middle 1.15 m up; the rest sleep on the floor.
 */
interface RoomKind {
  beds: [number, number, number, number][];
  seats: [number, number, number, number][];
  middle: [number, number];
}
const STILT_ROOM: RoomKind = {
  beds: [
    [2.2, 0.36, -1.3, -Math.PI / 2],
    [0.29, 0.17, 0.32, -0.58],
  ],
  seats: [
    [-0.5, 0.17, 1.52, 2.56],
    [1.654, 0.29, -1.962, -1.2],
  ],
  middle: [0.9, -0.9],
};
const PLANK_ROOM: RoomKind = {
  beds: [
    [2.0, 0.36, -1.2, -Math.PI / 2],
    [0.29, 0.17, 0.22, -0.58],
  ],
  seats: [
    [-0.5, 0.17, 1.42, 2.56],
    [1.454, 0.29, -1.862, -1.2],
  ],
  middle: [0.8, -0.8],
};
const GUEST_ROOM: RoomKind = {
  beds: [
    [0, 1.17, -1.8, 0],
    [-1.3, 0, 0.3, Math.PI / 2],
    [1.3, 0, 0.3, -Math.PI / 2],
  ],
  seats: [],
  middle: [0, 0.4],
};
const ROOMS: Record<string, RoomKind> = {
  hut_green: STILT_ROOM,
  hut_warm: STILT_ROOM,
  hut_plank: PLANK_ROOM,
  guest_orange: GUEST_ROOM,
  guest_tan: GUEST_ROOM,
};
const VILLAGER = new Set(['hut_green', 'hut_warm', 'hut_plank']);
const GUEST = new Set(['guest_orange', 'guest_tan']);
/** A round hut's door, in its own frame (beehive in build_village.py: its step stone before the door). */
const ROUND_DOOR: [number, number] = [0, 2.15];

/** A stall's keeper stands here in its own frame (on its floor, walk-in-stalls), its customers from here on
 * out before its counter, this far apart, at most this many; its open sides' outsides lie this far out. */
const KEEPER: [number, number] = [0, 0.07];
const COUNTER_FRONT = 1.5;
const LINE_GAP = 1.0;
const LINE_LENGTH = 4;
const SIDE_OUT = 1.71;

/** A log seats two, one either end, on either side; the pier's end two, on its edge over the water. */
const LOG_SEATS: [number, number][] = [
  [-0.45, 0.42],
  [0.45, -0.42],
];
const LOG_TOP = 0.46;

/** The night beach's feast (PLAN.md): round its fire, which stands here, the sea that way (degrees: 0
 * south, 90 east); rows of seats on the sand on the land side, facing it; where the one who plays stands. */
export const FEAST_FIRE: [number, number] = [75, -21];
const FEAST_SEA = 35;
const FEAST_ROWS = [3.0, 4.1, 5.2];
const FEAST_SPREAD = 75;
const FEAST_GAP = 1.05;

const _v = new THREE.Vector3();

/** (x, z) in a prop's own frame, out into the world. */
function toWorld(p: Placed, x: number, z: number, angle: number, scale: number): [number, number] {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return [p.x + (x * c + z * s) * scale, p.z + (-x * s + z * c) * scale];
}

/** Where one stands at (x, z), near the height `near`: the deck or ground there within a step of it. */
function stand(x: number, z: number, near: number): number {
  for (const feet of [near, near + 0.3, near - 0.3, near + 0.6]) {
    const h = standAt(x, z, feet);
    if (!Number.isNaN(h) && Math.abs(h - near) < 0.7) return h;
  }
  return NaN;
}

export class Places {
  readonly homes: Home[] = [];
  readonly stalls: Stall[] = [];
  readonly spots = new Map<SpotId, Spot>();
  /** Every seat outside the houses (logs, the pier's edge). */
  readonly seats: Seat[] = [];
  /** The feast: its fire, the way to the sea, the seats round it (nearest rows first), and where the
   * player of the ukulele and the dancers stand. */
  readonly feast: { fire: THREE.Vector3; sea: number; seats: Seat[]; player: THREE.Vector3; dancers: THREE.Vector3[] };

  private constructor(feast: Places['feast']) {
    this.feast = feast;
  }

  static async load(nav: Nav): Promise<Places> {
    const response = await fetch('data/layout.json');
    if (!response.ok) throw new Error('Could not load data/layout.json');
    const layout = (await response.json()) as { props: Placed[] };
    const kinds = [...new Set(layout.props.map((p) => p.kind))];
    const infos = new Map<string, PropInfo>();
    await Promise.all(
      kinds.map(async (k) => {
        try {
          infos.set(k, (await loadPropModel(k)).info);
        } catch {
          // A prop the layout names but no file holds: nothing lives in it.
        }
      }),
    );
    const places = new Places(Places.makeFeast());
    for (const p of layout.props) {
      const info = infos.get(p.kind);
      if (!info) continue;
      if (VILLAGER.has(p.kind) || GUEST.has(p.kind) || p.kind === 'beehive') places.addHome(p, info, nav);
      else if (p.kind.startsWith('stall_')) places.addStall(p, info, nav);
      else if (p.kind === 'log') places.addLog(p);
      else if (p.kind === 'pier') places.addPierEdge(p);
    }
    for (const [id, x, z, radius, look] of SPOTS) {
      // On a deck where there is one (the pier).
      const h = stand(x, z, groundHeight(x, z));
      if (Number.isNaN(h)) continue;
      const at = new THREE.Vector3(x, h, z);
      const seats = places.seats.filter((s) => s.at.distanceTo(at) < radius + 2);
      places.spots.set(id, { id, at, radius, look: look === null ? NaN : THREE.MathUtils.degToRad(look), seats });
    }
    return places;
  }

  /** The feast's seats round its fire, on the sand on the land side, each facing the fire. */
  private static makeFeast(): Places['feast'] {
    const [fx, fz] = FEAST_FIRE;
    const fire = new THREE.Vector3(fx, terrainHeight(fx, fz), fz);
    const sea = THREE.MathUtils.degToRad(FEAST_SEA);
    const seats: Seat[] = [];
    const land = sea + Math.PI;
    for (const r of FEAST_ROWS) {
      const spread = THREE.MathUtils.degToRad(FEAST_SPREAD);
      const n = Math.max(1, Math.floor((2 * spread * r) / FEAST_GAP));
      for (let i = 0; i <= n; i++) {
        const a = land - spread + (2 * spread * i) / n;
        const x = fx + Math.sin(a) * r;
        const z = fz + Math.cos(a) * r;
        const h = stand(x, z, terrainHeight(x, z));
        if (Number.isNaN(h)) continue;
        const at = new THREE.Vector3(x, h, z);
        seats.push({ at, yaw: Math.atan2(fx - x, fz - z), up: at.clone(), kind: 'sand', taken: null });
      }
    }
    // The nearest the fire first, and in each row its middle first.
    const order = (s: Seat) => {
      const a = Math.atan2(s.at.x - fx, s.at.z - fz) - land;
      return s.at.distanceTo(fire) + 0.6 * Math.abs(Math.atan2(Math.sin(a), Math.cos(a)));
    };
    seats.sort((a, b) => order(a) - order(b));
    const side = sea + Math.PI / 2;
    const at = (d: number, a: number) => {
      const x = fx + Math.sin(a) * d;
      const z = fz + Math.cos(a) * d;
      return new THREE.Vector3(x, terrainHeight(x, z), z);
    };
    return {
      fire,
      sea,
      seats,
      player: at(1.9, side),
      dancers: [at(1.8, land - 0.6), at(1.8, land + 0.6)],
    };
  }

  private addHome(p: Placed, info: PropInfo, nav: Nav): void {
    const angle = THREE.MathUtils.degToRad(p.turn ?? 0);
    const scale = p.scale ?? 1;
    const base = p.y ?? terrainHeight(p.x, p.z) - (info.sink ?? 0);
    const at = new THREE.Vector3(p.x, base, p.z);
    const kind: Home['kind'] = GUEST.has(p.kind) ? 'guest' : VILLAGER.has(p.kind) ? 'villager' : 'round';
    const w = (x: number, z: number) => toWorld(p, x, z, angle, scale);
    if (kind === 'round') {
      const [dx, dz] = w(...ROUND_DOOR);
      const h = stand(dx, dz, terrainHeight(dx, dz));
      if (Number.isNaN(h)) return;
      this.homes.push({
        index: this.homes.length,
        prop: p.kind,
        kind,
        at,
        yaw: angle,
        door: new THREE.Vector3(dx, h, dz),
        inside: null,
        room: null,
        beds: [],
        seats: [],
        people: [],
      });
      return;
    }
    const door = info.openings?.find((o) => o.door);
    const room = ROOMS[p.kind];
    if (!door || !room) return;
    const sill = base + (door.at[1] - door.size[1] / 2) * scale;
    // Through its doorway: from out on its porch to just inside, the narrow place between joined by a
    // portal (see Nav) as the grid's cells are too coarse for some doorways. Each end the first free spot
    // straight out from the doorway's middle (clear of the open door's leaf, the rug's cushions), the two
    // walkable between in a straight line.
    const across = [door.out[2], -door.out[0]];
    const end = (out: number): THREE.Vector3[] => {
      const found: THREE.Vector3[] = [];
      for (const depth of [0.7, 0.55, 0.9, 1.1]) {
        for (const side of [0, 0.2, -0.2, 0.35, -0.35]) {
          const [x, z] = w(
            door.at[0] + door.out[0] * depth * out + across[0] * side,
            door.at[2] + door.out[2] * depth * out + across[1] * side,
          );
          const h = stand(x, z, sill);
          if (!Number.isNaN(h) && Math.abs(h - sill) < 0.4) found.push(new THREE.Vector3(x, h, z));
        }
      }
      return found;
    };
    let outside: THREE.Vector3 | null = null;
    let inside: THREE.Vector3 | null = null;
    const outs = end(1);
    const ins = end(-1);
    for (const o of outs) {
      inside = ins.find((i) => nav.straight(o, i) && nav.straight(i, o)) ?? null;
      if (inside) {
        outside = o;
        break;
      }
    }
    if (!outside || !inside) return;
    nav.addPortal(outside, inside);
    const ih = inside.y;
    const [mx, mz] = w(...room.middle);
    const middle = new THREE.Vector3(mx, stand(mx, mz, ih), mz);
    if (Number.isNaN(middle.y)) middle.copy(inside);
    const floor = middle.y;
    const seat = ([x, up, z, yaw]: [number, number, number, number], kind: SeatKind): Seat => {
      const [sx, sz] = w(x, z);
      const at = new THREE.Vector3(sx, floor + up * scale, sz);
      return { at, yaw: yaw + angle, up: freeBeside(at, yaw + angle, floor, middle, nav), kind, taken: null };
    };
    const beds = room.beds.map((b, i) =>
      seat(b, i === 0 ? (kind === 'guest' ? 'hammock' : 'bed') : kind === 'guest' ? 'floor' : 'cushion'),
    );
    const seats = room.seats.map((s, i) => seat(s, i === 0 ? 'cushion' : 'stool'));
    this.homes.push({
      index: this.homes.length,
      prop: p.kind,
      kind,
      at,
      yaw: angle,
      door: outside,
      inside,
      room: middle,
      beds,
      seats,
      people: [],
    });
  }

  private addStall(p: Placed, info: PropInfo, nav: Nav): void {
    const angle = THREE.MathUtils.degToRad(p.turn ?? 0);
    const scale = p.scale ?? 1;
    const w = (x: number, z: number) => toWorld(p, x, z, angle, scale);
    const ground = terrainHeight(p.x, p.z);
    const floorTop = info.decks?.[0]?.top ?? 0.12;
    const [kx, kz] = w(...KEEPER);
    const kh = stand(kx, kz, ground + floorTop);
    if (Number.isNaN(kh)) return;
    const keeper = new THREE.Vector3(kx, kh, kz);
    const line: THREE.Vector3[] = [];
    for (let k = 0; k < LINE_LENGTH; k++) {
      const [lx, lz] = w(0, COUNTER_FRONT + k * LINE_GAP);
      const h = stand(lx, lz, ground);
      if (Number.isNaN(h)) break;
      line.push(new THREE.Vector3(lx, h, lz));
    }
    if (line.length === 0) return;
    // In by either open side, from the gap beside the stall to where the keeper stands.
    const sides: THREE.Vector3[] = [];
    for (const s of [-1, 1]) {
      const [sx, sz] = w(s * SIDE_OUT, KEEPER[1]);
      const h = stand(sx, sz, ground);
      if (Number.isNaN(h)) continue;
      const side = new THREE.Vector3(sx, h, sz);
      if (!nav.straight(side, keeper)) continue;
      nav.addPortal(side, keeper);
      sides.push(side);
    }
    if (sides.length === 0) return;
    this.stalls.push({
      index: this.stalls.length,
      label: (p.label ?? 'stall.crepe') as StringKey,
      goods: p.goods ?? '',
      at: new THREE.Vector3(p.x, ground, p.z),
      yaw: angle,
      keeper,
      line,
      sides,
    });
  }

  private addLog(p: Placed): void {
    const angle = THREE.MathUtils.degToRad(p.turn ?? 0);
    const ground = terrainHeight(p.x, p.z);
    // Its length runs across its frame (x); one sits on it facing out of either side (z).
    for (const [x, z] of LOG_SEATS) {
      const [sx, sz] = toWorld(p, x, 0, angle, p.scale ?? 1);
      const facing = angle + (z > 0 ? 0 : Math.PI);
      const [ux, uz] = toWorld(p, x, z + Math.sign(z) * 0.45, angle, p.scale ?? 1);
      const uh = stand(ux, uz, ground);
      if (Number.isNaN(uh)) continue;
      this.seats.push({
        at: new THREE.Vector3(sx, ground + LOG_TOP, sz),
        yaw: facing,
        up: new THREE.Vector3(ux, uh, uz),
        kind: 'log',
        taken: null,
      });
    }
  }

  private addPierEdge(p: Placed): void {
    const deck = p.y ?? 0.55;
    // Its end, seated on the planks' edge, legs out over the water, looking out to sea.
    for (const x of [-0.5, 0.5]) {
      const at = new THREE.Vector3(p.x + x, deck, p.z + 13.45);
      this.seats.push({ at, yaw: 0, up: new THREE.Vector3(p.x + x, deck, p.z + 12.7), kind: 'edge', taken: null });
    }
  }

  /** The stall nearest `p` among `of`. */
  nearestStall(p: THREE.Vector3, of: Stall[]): Stall | null {
    let best: Stall | null = null;
    let bestD = Infinity;
    for (const s of of) {
      const d = s.line[0].distanceToSquared(p);
      if (d < bestD) {
        bestD = d;
        best = s;
      }
    }
    return best;
  }
}

/** Where one stands up to beside a seat at `at` facing `yaw` on a floor at `floor`: the first spot round it,
 * a step out, where one can stand and walk to the room's middle from; the middle itself if none. */
function freeBeside(at: THREE.Vector3, yaw: number, floor: number, middle: THREE.Vector3, nav: Nav): THREE.Vector3 {
  for (const out of [0.65, 0.85]) {
    for (const turn of [0, 0.6, -0.6, 1.2, -1.2, Math.PI]) {
      const x = at.x + Math.sin(yaw + turn) * out;
      const z = at.z + Math.cos(yaw + turn) * out;
      const h = standAt(x, z, floor);
      if (Number.isNaN(h) || Math.abs(h - floor) > 0.2) continue;
      _v.set(x, h, z);
      if (nav.straight(_v, middle) || nav.straight(middle, _v)) return _v.clone();
    }
  }
  return middle.clone();
}
