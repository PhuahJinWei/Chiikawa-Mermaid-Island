import * as THREE from 'three';
import { Character, type FrameContext, type Ride } from './Character';
import { loadCharacterModel } from './Model';
import { MERMAID } from './definitions';
import type { EmoteSystem } from './Emotes';
import type { Cave } from '../world/Cave';
import { waterLevelAt } from '../world/Island';
import { addMovingCircle } from '../world/Obstacles';

/** Where the Siren's two little mermaids are: before her on the ledge, or up on her head. */
export type MermaidPlace = 'ledge' | 'head';
export const MERMAID_PLACES: readonly MermaidPlace[] = ['ledge', 'head'];

/** Where each sits before the Siren, in her resting frame (x across, z ahead of her, metres): side by side
 * before her tail's bowl, facing the water as she does (`cave interior 7`, `8`). */
const LEDGE: [number, number][] = [
  [-0.5, 1.35],
  [0.5, 1.35],
];
/** Where each sits on her head, in her model's own frame (x across, z ahead, metres): on its top between her
 * bun-ears (`[anime] siren 1`), this far down from her head's top. */
const SEAT: [number, number][] = [
  [-0.28, 0.05],
  [0.28, 0.05],
];
const SEAT_DOWN = 0.06;
/** How long they stay before her and on her head, in seconds (from, to): now and then they hang out on her
 * head (the user, 2026-10-22). Let go of on her head, they come down this soon. */
const STAY: Record<MermaidPlace, [number, number]> = { ledge: [25, 45], head: [12, 25] };
const LET_GO: [number, number] = [2, 5];
/** A hop from one place to the other: how long it takes (seconds), how high it rises over the higher of its
 * two ends (metres), and how long the second waits after the first. */
const HOP = { time: 1.3, rise: 0.45, after: 0.35 };
/** They keep their eyes on you within this many metres, as everyone does (see Character.watch). Walkers keep
 * this far round each while it sits on the ledge. */
const WATCH_FROM = 4;
const BLOCK = 0.3;
/** Out at sea with the Siren: how far round her they swim and how fast (radians a second), how deep their
 * feet are, and how high a leap clears the water. */
const SEA_ROUND = 2.4;
const SEA_SWIM = 0.45;
const SEA_AFLOAT = 0.36;
const SEA_LEAP = 0.75;

const ZERO = new THREE.Vector3();
const _seat = new THREE.Vector3();

interface Mermaid {
  readonly character: Character;
  /** Where it sits on the ledge: its feet. */
  readonly ledge: THREE.Vector3;
  /** Where it sits on the Siren's head, in her model's own frame. */
  readonly seat: THREE.Vector3;
  /** Where it is, or last was; and how far along its hop to the other place it is (0 to 1, and below 0 while
   * it waits to go), or null. */
  at: MermaidPlace;
  hop: number | null;
  /** Where it is carried, hopping or on her head (see Character.ride). */
  readonly ride: Ride;
  /** What walkers keep clear of. */
  readonly block: { x: number; z: number };
}

const between = ([a, b]: [number, number]) => a + Math.random() * (b - a);
const other = (p: MermaidPlace): MermaidPlace => (p === 'ledge' ? 'head' : 'ledge');
const wrapAngle = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

/**
 * The Siren's two little mermaids (art/blender/build_mermaid.py), exactly alike: they sit before her on the
 * ledge, and now and then hop up onto her head together to sit there a while, the film showing them in both
 * places (the user, 2026-10-22). Roused, she has them up on her head (`[anime] siren 1`). On her head they ride
 * it as it turns and bows. Drawn with the cave, as she is.
 */
export class LittleMermaids {
  /** Where they are going, and how long until they go to the other place. */
  private place: MermaidPlace = 'ledge';
  private next = between(STAY.ledge);
  /** Where they are kept (the Siren, roused, keeps them on her head), or null to come and go. */
  private kept: MermaidPlace | null = null;

  private constructor(
    private readonly two: Mermaid[],
    private readonly siren: Character,
    /** Where she rests: her middle, the way she faces and her feet's height. */
    private readonly spot: { x: number; z: number; yaw: number; feet: number },
  ) {}

  /** Loads them and seats them before the Siren, who rests at `spot`; `top` is her head's top, in her
   * model's own frame (metres up). */
  static async load(
    cave: Cave,
    siren: Character,
    spot: { x: number; z: number; yaw: number; feet: number },
    top: number,
    emotes: EmoteSystem,
  ): Promise<LittleMermaids> {
    const model = await loadCharacterModel(MERMAID.model);
    const c = Math.cos(spot.yaw);
    const s = Math.sin(spot.yaw);
    const two = LEDGE.map(([lx, lz], i): Mermaid => {
      const character = new Character(MERMAID, model, new THREE.Group());
      character.attach(cave.group, emotes);
      const x = spot.x + lx * c + lz * s;
      const z = spot.z - lx * s + lz * c;
      const ledge = new THREE.Vector3(x, cave.grid.floorAt(x, z), z);
      return {
        character,
        ledge,
        seat: new THREE.Vector3(SEAT[i][0], top - SEAT_DOWN, SEAT[i][1]),
        at: 'ledge',
        hop: null,
        ride: { x, y: ledge.y, z, yaw: spot.yaw },
        block: addMovingCircle(spot.x, spot.z, Math.hypot(lx, lz), BLOCK, ledge.y - 0.2, ledge.y + character.height),
      };
    });
    const mermaids = new LittleMermaids(two, siren, spot);
    mermaids.rest();
    return mermaids;
  }

  /** Where they are, or are going. */
  get where(): MermaidPlace {
    return this.place;
  }

  /** Both before her on the ledge at once, to come and go from there anew, unless she keeps them on her head
   * (after a staged shot). */
  rest(): void {
    this.put('ledge');
  }

  /** Both at `place` at once, without a hop (a staged shot). */
  put(place: MermaidPlace): void {
    this.place = place;
    this.next = between(STAY[place]);
    for (const m of this.two) {
      m.character.setShown(true);
      m.at = place;
      m.hop = null;
      if (place === 'ledge') {
        m.character.ride = null;
        m.character.teleport(m.ledge.x, m.ledge.z, this.spot.yaw, m.ledge.y);
      } else {
        this.carry(m);
        m.character.teleport(m.ride.x, m.ride.z, m.ride.yaw, m.ride.y);
        m.character.ride = m.ride;
      }
    }
    this.placeBlocks();
  }

  /** Sends them to `place` (the Test panel), to stay there a while as they do, coming and going from there. */
  choose(place: MermaidPlace): void {
    this.kept = null;
    this.goTo(place);
  }

  /** Keeps them at `place` (roused, the Siren has them up on her head), or lets them come and go again: let go
   * of on her head, they come down soon. */
  keep(place: MermaidPlace | null): void {
    this.kept = place;
    if (place) this.goTo(place);
    else if (this.place === 'head') this.next = between(LET_GO);
  }

  /** `eyes`: yours, which they keep theirs on as you come near (see WATCH_FROM); null for no one. Call after
   * the Siren has moved. */
  update(dt: number, ctx: FrameContext, eyes: THREE.Vector3 | null): void {
    if (this.kept === null) {
      this.next -= dt;
      if (this.next <= 0) this.goTo(other(this.place));
    }
    this.two.forEach((m, i) => {
      const ch = m.character;
      ch.setDesiredVelocity(ZERO);
      // Off they go, the second a moment after the first; a hop runs to its end before another begins.
      if (m.hop === null && m.at !== this.place) m.hop = (-i * HOP.after) / HOP.time;
      if (m.hop !== null) m.hop = Math.min(1, m.hop + dt / HOP.time);
      const near = !!eyes && Math.hypot(eyes.x - ch.position.x, eyes.z - ch.position.z) < WATCH_FROM;
      ch.watch(near ? eyes : null);
      if (m.hop !== null || m.at === 'head') {
        this.carry(m);
        ch.ride = m.ride;
      } else {
        ch.ride = null;
        if (!near) ch.setFacing(this.spot.yaw);
      }
      ch.update(dt, ctx);
      if (m.hop === 1) {
        m.at = other(m.at);
        m.hop = null;
      }
    });
    this.placeBlocks();
  }

  updateOutline(ctx: FrameContext): void {
    for (const m of this.two) m.character.updateOutline(ctx);
  }

  /** Moves them into `parent` with the Siren (out of the cave to the sea, and back). */
  reattach(parent: THREE.Object3D): void {
    for (const m of this.two) m.character.reattach(parent);
  }

  /**
   * Out at sea with the Siren (see Siren): playing, they swim round her, half in the water, now and then
   * leaping clear of it; while she lurks they are under the water, out of sight. `time` is her clock at sea.
   */
  atSea(dt: number, ctx: FrameContext, siren: Character, place: 'play' | 'lurk', time: number): void {
    this.two.forEach((m, i) => {
      const ch = m.character;
      if (place === 'lurk') {
        ch.setShown(false);
        return;
      }
      ch.setShown(true);
      const a = time * SEA_SWIM + i * Math.PI;
      const leap = Math.max(0, Math.sin(time * 1.1 + i * 2.3)) ** 8 * SEA_LEAP;
      const x = siren.position.x + Math.cos(a) * SEA_ROUND;
      const z = siren.position.z + Math.sin(a) * SEA_ROUND;
      m.ride.x = x;
      m.ride.z = z;
      m.ride.y = waterLevelAt(x, z) - SEA_AFLOAT + leap + Math.sin(time * 2 + i) * 0.04;
      m.ride.yaw = Math.atan2(-Math.sin(a), Math.cos(a));
      ch.ride = m.ride;
      ch.setDesiredVelocity(ZERO);
      ch.watch(null);
      ch.update(dt, ctx);
    });
  }

  private goTo(place: MermaidPlace): void {
    this.place = place;
    this.next = between(STAY[place]);
  }

  /** Where a mermaid is carried: on the Siren's head as it turns and bows, or along its hop between her head
   * and its place on the ledge, a smooth arc rising over both. */
  private carry(m: Mermaid): void {
    const siren = this.siren;
    siren.headPoint(m.seat, _seat);
    const yaw = siren.facing + siren.headYaw;
    const r = m.ride;
    if (m.hop === null) {
      r.x = _seat.x;
      r.y = _seat.y;
      r.z = _seat.z;
      r.yaw = yaw;
      return;
    }
    const up = m.at === 'ledge';
    const a = up ? m.ledge : _seat;
    const b = up ? _seat : m.ledge;
    const t = Math.max(0, m.hop);
    const across = t * t * (3 - 2 * t);
    const rise = Math.max(a.y, b.y) + HOP.rise - (a.y + b.y) / 2;
    r.x = a.x + (b.x - a.x) * across;
    r.z = a.z + (b.z - a.z) * across;
    r.y = a.y + (b.y - a.y) * t + rise * 4 * t * (1 - t);
    // Turning between the way the ledge faces and the way her head does, the short way round.
    const turn = wrapAngle(yaw - this.spot.yaw);
    r.yaw = this.spot.yaw + turn * (up ? across : 1 - across);
  }

  /** What walkers keep clear of: each where it sits on the ledge, or, when it is not there, out of the way
   * within the Siren's own. */
  private placeBlocks(): void {
    for (const m of this.two) {
      const there = m.at === 'ledge' && m.hop === null;
      m.block.x = there ? m.ledge.x : this.spot.x;
      m.block.z = there ? m.ledge.z : this.spot.z;
    }
  }
}
