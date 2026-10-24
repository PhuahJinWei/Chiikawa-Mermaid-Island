import * as THREE from 'three';
import { Character, HEAD_LOOK, type FrameContext, type HeadLook } from './Character';
import { loadCharacterModel } from './Model';
import { SHIMAJIRO } from './definitions';
import type { EmoteSystem } from './Emotes';
import { groundHeight } from '../world/Island';
import { addCircle } from '../world/Obstacles';

/**
 * Where he stands in his shop, in its own frame as art/blender/shimajiro.py builds it (x across its front, from its
 * left as one faces it; y back from its front; metres from its middle): in his kitchen by the door, a step before
 * his stove, out of the doorway's way; and the way he faces there, toward the inside of the door, so that whoever
 * comes in sees him (the user, 2026-10-25: standing by his stove, his hands down at his sides).
 */
const SPOT = { x: -0.9, y: -1.55 };
const FACING = { x: 1, y: -0.5 };
/** Walkers keep this far from his middle (his belly and his arms at his sides). */
const ROUND = 0.6;
/** He keeps his eyes on you as you come within this many metres of him, as everyone does (see Character.watch), and
 * being so much taller he looks down at you, as the Siren does (the user, 2026-10-25), bowing his head further than
 * everyone's gentle nod: most of the way down to your eyes, up to 0.5 radians. At its 0.25 his mustache hid his eyes
 * from you below a step away, so that he seemed to look over your head. */
const WATCH_FROM = 6;
const LOOK: HeadLook = { ...HEAD_LOOK, rate: 2.5, down: 0.5, share: 0.8 };
const ZERO = new THREE.Vector3();
const _you = new THREE.Vector3();
const _eye = new THREE.Vector3();

/** A prop as public/data/layout.json places it: what it is, where, turned how far (degrees, as seen from above). */
interface Placed {
  kind: string;
  x: number;
  z: number;
  turn?: number;
}

/**
 * 島二郎 himself (art/blender/build_shimajiro.py): one of the characters, drawn and lit as the cast are, but not one
 * you can play. He stands in his shop, the restaurant at the end of the riverside path, his arms at his sides as
 * the user's drawing has them, and stays there.
 */
export class Shimajiro {
  private constructor(
    readonly character: Character,
    /** Where he stands: his middle, the way he faces and his feet's height. */
    readonly spot: { x: number; z: number; yaw: number; feet: number },
  ) {}

  /** Loads him and stands him in his shop, wherever the layout has put it; null if it has no shop. */
  static async load(scene: THREE.Object3D, emotes: EmoteSystem): Promise<Shimajiro | null> {
    const response = await fetch('data/layout.json');
    if (!response.ok) return null;
    const layout = (await response.json()) as { props: Placed[] };
    const shop = layout.props.find((p) => p.kind === 'restaurant');
    if (!shop) return null;
    // The shop's frame to the island's: its model faces -y in Blender, which is +z once on the island, turned there
    // as the layout turns it (see Props.load).
    const a = THREE.MathUtils.degToRad(shop.turn ?? 0);
    const c = Math.cos(a);
    const s = Math.sin(a);
    const onIsland = (x: number, y: number): [number, number] => [shop.x + x * c - y * s, shop.z - x * s - y * c];
    const [x, z] = onIsland(SPOT.x, SPOT.y);
    const [fx, fz] = onIsland(SPOT.x + FACING.x, SPOT.y + FACING.y);
    const yaw = Math.atan2(fx - x, fz - z);
    const feet = groundHeight(x, z);
    const model = await loadCharacterModel(SHIMAJIRO.model);
    const character = new Character(SHIMAJIRO, model);
    character.teleport(x, z, yaw, feet);
    character.attach(scene, emotes);
    addCircle(x, z, ROUND, feet - 0.2, feet + character.height);
    return new Shimajiro(character, { x, z, yaw, feet });
  }

  /** `you`: whoever you are, whom he keeps his eyes on as they come near (see WATCH_FROM); null for no one (a staged
   * shot, the lineup, the free camera). */
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
  }

  updateOutline(ctx: FrameContext): void {
    this.character.updateOutline(ctx);
  }
}
