import * as THREE from 'three';
import { Character, HEAD_LOOK, type FrameContext, type HeadLook } from './Character';
import { loadCharacterModel } from './Model';
import { SIREN } from './definitions';
import type { EmoteSystem } from './Emotes';
import type { Cave } from '../world/Cave';
import { addCircle, addMovingCircle } from '../world/Obstacles';

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

/**
 * The Siren, the giant mermaid of the forbidden cave (art/blender/build_siren.py): one of the characters,
 * drawn and lit as the cast are, but not one you can play. She rests on the cave's ledge and stays there,
 * drawn with the cave: she is in its group, which shows only while the cave can be seen.
 */
export class Siren {
  private mood: SirenMood = 'calm';

  private constructor(
    readonly character: Character,
    /** Where she rests: her middle, the way she faces and her feet's height. */
    readonly spot: { x: number; z: number; yaw: number; feet: number },
    /** What walkers keep clear of that goes round with her (see TURNING_BLOCKS). */
    private readonly turning: { x: number; z: number }[],
  ) {}

  /** Loads her and seats her on the cave's ledge; null if the cave has no chamber for her. */
  static async load(cave: Cave, emotes: EmoteSystem): Promise<Siren | null> {
    const chamber = cave.info.chamber;
    if (!chamber) return null;
    const model = await loadCharacterModel(SIREN.model);
    const character = new Character(SIREN, model, new THREE.Group());
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
    const siren = new Siren(character, { x, z, yaw, feet }, turning);
    siren.placeBlocks();
    return siren;
  }

  get currentMood(): SirenMood {
    return this.mood;
  }

  /** Calms her or rouses her: roused, she spreads her fin-hands and holds them out (the 'menace' action,
   * whose face is her angry one) until she calms. */
  setMood(mood: SirenMood): void {
    if (mood === this.mood) return;
    this.mood = mood;
    if (mood === 'angry') this.character.play('menace');
    else this.character.stopAction();
  }

  /** Puts her back where she rests, facing the water (after a staged shot has had her elsewhere). */
  rest(): void {
    const { x, z, yaw, feet } = this.spot;
    this.character.teleport(x, z, yaw, feet);
  }

  /** `you`: whoever you are, whom she keeps her eyes on as they come near (see WATCH_FROM); null for no one (a
   * staged shot, the lineup, the free camera). */
  update(dt: number, ctx: FrameContext, you: Character | null = null): void {
    const ch = this.character;
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
  }
}
