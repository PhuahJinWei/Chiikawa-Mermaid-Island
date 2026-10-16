import * as THREE from 'three';
import type { Input } from '../core/Input';
import type { CameraRig } from '../core/CameraRig';
import type { Character } from './Character';

const _f = new THREE.Vector3();
const _r = new THREE.Vector3();
const _d = new THREE.Vector3();

/** Turns the joystick into camera-relative movement for the character you control. */
export class PlayerController {
  constructor(
    private readonly input: Input,
    private readonly rig: CameraRig,
  ) {}

  update(ch: Character): void {
    const m = this.input.move;
    const mag = Math.min(1, m.length());
    const walk = ch.def.walkSpeed;
    const run = ch.def.runSpeed;
    // Most of the stick walks; the outer edge breaks into a run.
    const speed = mag < 0.8 ? (mag / 0.8) * walk : walk + (run - walk) * ((mag - 0.8) / 0.2);
    this.rig.forward(_f);
    this.rig.right(_r);
    _d.set(0, 0, 0).addScaledVector(_r, m.x).addScaledVector(_f, m.y);
    if (_d.lengthSq() > 1e-6) _d.normalize().multiplyScalar(speed);
    ch.setDesiredVelocity(_d);
    if (this.input.consumeJump()) ch.jump();
  }
}
