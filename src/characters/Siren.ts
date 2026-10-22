import * as THREE from 'three';
import { Character, HEAD_LOOK, type FrameContext, type HeadLook } from './Character';
import { loadCharacterModel } from './Model';
import { SIREN } from './definitions';
import type { EmoteSystem } from './Emotes';
import type { Cave } from '../world/Cave';
import { waterLevelAt } from '../world/Island';
import { addCircle, addMovingCircle } from '../world/Obstacles';
import { LittleMermaids } from './LittleMermaids';

/**
 * The Siren's moods: calm, resting on the ledge as the film shows her by the cast (`cave interior 7`,
 * `8`); or angry, roused, her fin-hands spread out wide, her eyes red and her mouth open on its teeth
 * (`[anime] siren 3`, the angry plush).
 */
export type SirenMood = 'calm' | 'angry';
export const SIREN_MOODS: readonly SirenMood[] = ['calm', 'angry'];

/**
 * Where she rests: on the ledge of the chamber past the skylight's dome, round its middle from east toward
 * south (radians) and out from it; south of the fire, so that from the water, where the film's camera sees
 * her from, she sits to the fire's right and the cast to its left (`cave interior 7`, `8`). She faces the
 * water.
 */
const REST = { angle: 0.42, distance: 6.6 };
/** Walkers keep clear of her: her tail's bowl round her middle (0.86 m round), then her fin-hands spread
 * either side and her tail's heart-shaped fin behind her, which go round with her as she turns: each where it
 * is in her own frame (x to her left, z ahead of her) and how far round it. */
const BOWL = 0.95;
const TURNING_BLOCKS: [number, number, number][] = [
  [1.15, 0.26, 0.38],
  [-1.15, 0.26, 0.38],
  [0, -1.2, 0.62],
];
/** She keeps her eyes on you as you come within this many metres of her, as everyone does (see
 * Character.watch), easing slowly: her head bows to you in a gentle nod (the user, 2026-10-22: she is so tall
 * that up close you saw only her chin) or turns to you, and her body turns after it, as everyone's does
 * (the user); when you go, she turns back to the water. */
const WATCH_FROM = 6;
const LOOK: HeadLook = { ...HEAD_LOOK, rate: 2.5 };
const ZERO = new THREE.Vector3();
const _you = new THREE.Vector3();
const _eye = new THREE.Vector3();
const _sea = new THREE.Vector3();
const _ball = new THREE.Sphere();
const _frustum = new THREE.Frustum();
const _view = new THREE.Matrix4();

/**
 * Where she is (the user, 2026-10-22): hiding in the cave, resting on its ledge; out in the open sea by day,
 * swimming and playing with her two little mermaids; or lurking there by night, only the top of her head
 * and her red eyes over the water (her angry face, its mouth under the water), as the promo art has her
 * peeking over the waves behind the night feast. Never a light source (the user): her eyes are painted red,
 * not lit.
 */
export type SirenPlace = 'ledge' | 'play' | 'lurk';
/** Out at sea: where she plays (deep water south-west of the pier, seen from the beach and the pier's end,
 * clear of the ferry) and where she lurks (out past the night beach's feast fire, beyond the party). */
const SEA = { play: { x: -30, z: 68 }, lurk: { x: 106, z: 24 } };
/** How far under the water her feet are there: playing, the water at her band; lurking, at her nose. */
const AFLOAT = { play: 1.3, lurk: 2.0 };
/** Her hours: out to play in the afternoon on most days, lurking through the night. */
const PLAY: [number, number] = [13, 15.6];
const PLAY_CHANCE = 0.7;
const LURK: [number, number] = [20.5, 4.5];
/** Playing, she swims slowly round this far from her spot; lurking, coming nearer than SINK, you see her
 * sink out of sight, and only once you are past RISE does she come up again. */
const SWIM_ROUND = 3.5;
const SWIM_SPEED = 0.07;
const SINK = 22;
const RISE = 40;
/** She goes from one place to another only when neither can be seen: neither within this far of the
 * camera and before it. */
const UNSEEN_PAST = 70;
/** Lurking, she looks at the night beach, where its feast's fire burns. */
const LURK_LOOK = { x: 75, z: -21 };

/**
 * The Siren, the giant mermaid of the forbidden cave (art/blender/build_siren.py): one of the characters,
 * drawn and lit as the cast are, but not one you can play. She rests on the cave's ledge and stays there,
 * her two little mermaids with her (see LittleMermaids), drawn with the cave: in its group, which shows only
 * while the cave can be seen.
 */
export class Siren {
  private mood: SirenMood = 'calm';
  /** Where she is now (see SirenPlace); where she is drawn out of the cave (the scene), once given; how
   * far she has sunk out of sight, lurking (0 to 1); and her clock out at sea. */
  private place: SirenPlace = 'ledge';
  private outside: THREE.Object3D | null = null;
  private sunk = 0;
  private swim = 0;

  private constructor(
    private readonly cave: Cave,
    readonly character: Character,
    /** Where she rests: her middle, the way she faces and her feet's height. */
    readonly spot: { x: number; z: number; yaw: number; feet: number },
    /** What walkers keep clear of that goes round with her (see TURNING_BLOCKS). */
    private readonly turning: { x: number; z: number }[],
    /** Her two little mermaids, before her on the ledge or up on her head. */
    readonly mermaids: LittleMermaids,
  ) {}

  /** Loads her and seats her on the cave's ledge; null if the cave has no chamber for her. */
  static async load(cave: Cave, emotes: EmoteSystem): Promise<Siren | null> {
    const chamber = cave.info.chamber;
    if (!chamber) return null;
    const model = await loadCharacterModel(SIREN.model);
    const character = new Character(SIREN, model);
    const [cx, cz] = chamber.centre;
    const x = cx + REST.distance * Math.cos(REST.angle);
    const z = cz + REST.distance * Math.sin(REST.angle);
    const yaw = Math.atan2(cx - x, cz - z);
    const feet = cave.grid.floorAt(x, z);
    character.teleport(x, z, yaw, feet);
    character.attach(cave.group, emotes);
    // Walkers go round her, her fin-hands and her tail's fin.
    const top = feet + character.height;
    addCircle(x, z, BOWL, feet - 0.2, top);
    const turning = TURNING_BLOCKS.map(([lx, lz, r]) => addMovingCircle(x, z, Math.hypot(lx, lz), r, feet - 0.2, top));
    const spot = { x, z, yaw, feet };
    const mermaids = await LittleMermaids.load(cave, character, spot, model.anchors.head.y, emotes);
    const siren = new Siren(cave, character, spot, turning, mermaids);
    siren.placeBlocks();
    return siren;
  }

  get currentMood(): SirenMood {
    return this.mood;
  }

  /** Calms her or rouses her: roused, she spreads her fin-hands and holds them out (the 'menace' action,
   * whose face is her angry one) until she calms, her little mermaids up on her head (`[anime] siren 1`). */
  setMood(mood: SirenMood): void {
    if (mood === this.mood) return;
    this.mood = mood;
    if (mood === 'angry') this.character.play('menace');
    else this.character.stopAction();
    this.mermaids.keep(mood === 'angry' ? 'head' : null);
  }

  /** Lets her leave the cave for the sea: `outside` is where she is drawn out there (the scene). */
  setOutside(outside: THREE.Object3D): void {
    this.outside = outside;
  }

  /** Where she is now. */
  get where(): SirenPlace {
    return this.place;
  }

  /** Where she would be at `hours` on day `day`: lurking through the night, out to play some afternoons,
   * on the ledge otherwise. */
  private wanted(hours: number, day: number): SirenPlace {
    if (hours >= LURK[0] || hours < LURK[1]) return 'lurk';
    const chance = (((Math.sin(day * 12.9898 + 78.233) * 43758.5453) % 1) + 1) % 1;
    if (hours >= PLAY[0] && hours < PLAY[1] && chance < PLAY_CHANCE) return 'play';
    return 'ledge';
  }

  /** Whether a place of hers could be seen from `camera`: the ledge from near the cave with its inside drawn
   * (far off, its skylight or mouth may be in view, the ledge deep in it never is), a spot at sea when near
   * enough and before the camera. */
  private visible(place: SirenPlace, camera: THREE.Camera): boolean {
    if (place === 'ledge') return this.cave.group.visible && Math.hypot(camera.position.x - this.spot.x, camera.position.z - this.spot.z) < UNSEEN_PAST;
    const s = SEA[place];
    _sea.set(s.x, waterLevelAt(s.x, s.z) + 1, s.z);
    if (camera.position.distanceTo(_sea) > UNSEEN_PAST) return false;
    camera.updateMatrixWorld();
    _frustum.setFromProjectionMatrix(_view.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
    _ball.set(_sea, 5);
    return _frustum.intersectsSphere(_ball);
  }

  /** Off to `place`: out of the cave's group into the open air for the sea, back into it for the ledge. */
  private goTo(place: SirenPlace): void {
    if (place === this.place) return;
    if (place === 'ledge') {
      this.rest();
      return;
    }
    const ch = this.character;
    if (this.place === 'ledge' && this.outside) {
      ch.reattach(this.outside);
      this.mermaids.reattach(this.outside);
    }
    if (this.mood === 'angry') this.setMood('calm');
    ch.stopAction();
    ch.expressionOverride = place === 'lurk' ? 'angry' : null;
    this.sunk = 0;
    this.place = place;
  }

  /** Puts her back where she rests, facing the water, her little mermaids before her (after a staged shot
   * has had her elsewhere, or back from the sea). */
  rest(): void {
    if (this.place !== 'ledge') {
      this.character.reattach(this.cave.group);
      this.mermaids.reattach(this.cave.group);
      this.character.ride = null;
      this.character.expressionOverride = null;
      this.character.setShown(true);
      this.place = 'ledge';
    }
    const { x, z, yaw, feet } = this.spot;
    this.character.teleport(x, z, yaw, feet);
    this.placeBlocks();
    this.mermaids.rest();
  }

  /** `you`: whoever you are, whom she keeps her eyes on as they come near (see WATCH_FROM); null for no one (a
   * staged shot, the lineup, the free camera). `day`: the hour, the day and the camera, for her going out to
   * sea and back when no one sees (null: she stays where she is). */
  update(
    dt: number,
    ctx: FrameContext,
    you: Character | null = null,
    day: { hours: number; day: number; camera: THREE.Camera } | null = null,
  ): void {
    const ch = this.character;
    if (day && this.outside) {
      const want = this.wanted(day.hours, day.day);
      if (want !== this.place && !this.visible(this.place, day.camera) && !this.visible(want, day.camera)) this.goTo(want);
    }
    if (this.place !== 'ledge') {
      this.atSea(dt, ctx, you, day?.camera ?? null);
      return;
    }
    ch.setDesiredVelocity(ZERO);
    let eyes: THREE.Vector3 | null = null;
    if (you) {
      you.getAnchor('eyeL', _you);
      you.getAnchor('eyeR', _eye);
      _you.add(_eye).multiplyScalar(0.5);
      if (Math.hypot(_you.x - this.spot.x, _you.z - this.spot.z) < WATCH_FROM) eyes = _you;
    }
    ch.watch(eyes, LOOK);
    if (!eyes) ch.setFacing(this.spot.yaw);
    ch.update(dt, ctx);
    this.placeBlocks();
    this.mermaids.update(dt, ctx, you ? _you : null);
  }

  /** Out at sea: playing, swimming slowly round her spot, her little mermaids round her; lurking, still,
   * facing the island, sinking out of sight as you come near and up again once you are far. */
  private atSea(dt: number, ctx: FrameContext, you: Character | null, camera: THREE.Camera | null): void {
    const ch = this.character;
    const place = this.place === 'play' ? 'play' : 'lurk';
    const s = SEA[place];
    this.swim += dt;
    let x = s.x;
    let z = s.z;
    let yaw: number;
    if (place === 'play') {
      const a = this.swim * SWIM_SPEED;
      x += Math.cos(a) * SWIM_ROUND;
      z += Math.sin(a) * SWIM_ROUND;
      yaw = Math.atan2(-Math.sin(a), Math.cos(a));
      this.sunk = 0;
    } else {
      // Looking at the night beach, where the feast's fire burns.
      yaw = Math.atan2(LURK_LOOK.x - x, LURK_LOOK.z - z);
      const d = camera ? Math.hypot(camera.position.x - x, camera.position.z - z) : Infinity;
      const down = d < SINK || (this.sunk > 0 && d < RISE);
      this.sunk = Math.min(1, Math.max(0, this.sunk + (down ? dt / 3 : -dt / 5)));
    }
    const y = waterLevelAt(x, z) - AFLOAT[place] + Math.sin(this.swim * 0.9) * 0.06 - this.sunk * 2.6;
    ch.ride = { x, y, z, yaw };
    ch.setDesiredVelocity(ZERO);
    let eyes: THREE.Vector3 | null = null;
    if (you && place === 'play') {
      you.getAnchor('eyeL', _you);
      you.getAnchor('eyeR', _eye);
      _you.add(_eye).multiplyScalar(0.5);
      if (Math.hypot(_you.x - x, _you.z - z) < WATCH_FROM * 2) eyes = _you;
    }
    ch.watch(eyes, LOOK);
    ch.setShown(this.sunk < 0.99);
    ch.update(dt, ctx);
    this.mermaids.atSea(dt, ctx, ch, place, this.swim);
  }

  /** Puts what goes round with her where she now faces (see TURNING_BLOCKS). */
  private placeBlocks(): void {
    const { x, z } = this.spot;
    const c = Math.cos(this.character.facing);
    const s = Math.sin(this.character.facing);
    TURNING_BLOCKS.forEach(([lx, lz], i) => {
      this.turning[i].x = x + lx * c + lz * s;
      this.turning[i].z = z - lx * s + lz * c;
    });
  }

  updateOutline(ctx: FrameContext): void {
    this.character.updateOutline(ctx);
    this.mermaids.updateOutline(ctx);
  }
}
