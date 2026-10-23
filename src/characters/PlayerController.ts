import * as THREE from 'three';
import type { Input } from '../core/Input';
import type { Character } from './Character';

const _f = new THREE.Vector3();
const _r = new THREE.Vector3();
const _d = new THREE.Vector3();

/** The way a camera looks, flattened onto the ground, for walking the way it looks. */
export interface Heading {
  forward(out: THREE.Vector3): THREE.Vector3;
  right(out: THREE.Vector3): THREE.Vector3;
}

/** Turns the joystick into camera-relative movement for the character you control. */
export class PlayerController {
  /** The way the stick walks you this frame (metres a second): how you push into whoever you walk into. */
  readonly want = new THREE.Vector3();

  constructor(private readonly input: Input) {}

  /** Returns whether you jumped. */
  update(ch: Character, view: Heading): boolean {
    const m = this.input.move;
    const mag = Math.min(1, m.length());
    const walk = ch.walkSpeed;
    const run = ch.runSpeed;
    // Most of the stick walks; the outer edge breaks into a run, and held there (or with Shift) a sprint.
    const speed = this.input.sprint
      ? ch.sprintSpeed
      : mag < 0.8
        ? (mag / 0.8) * walk
        : walk + (run - walk) * ((mag - 0.8) / 0.2);
    view.forward(_f);
    view.right(_r);
    _d.set(0, 0, 0).addScaledVector(_r, m.x).addScaledVector(_f, m.y);
    if (_d.lengthSq() > 1e-6) _d.normalize().multiplyScalar(speed);
    ch.setDesiredVelocity(_d);
    this.want.copy(_d);
    // Held as you rise, the jump goes higher.
    ch.jumpHeld = this.input.jumpHeld;
    if (!this.input.consumeJump()) return false;
    ch.jump();
    return true;
  }
}
