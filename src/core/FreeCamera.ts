import * as THREE from 'three';
import type { Input } from './Input';

/** Flying speed in metres a second, and how much faster with Shift held. */
const SPEED = 14;
const FAST = 3;
/** Metres the camera rises for each unit of wheel or pinch. */
const CLIMB = 0.012;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * A camera that flies anywhere, for looking round the island while building it. Push the stick
 * (or WASD) to fly the way the camera looks, drag to look round, pinch or scroll (or E and Q) to
 * rise and sink. Yaw 0 looks along -Z, as the follow camera's does.
 */
export class FreeCamera {
  private yaw = 0;
  private pitch = 0;
  private readonly position = new THREE.Vector3();
  private readonly velocity = new THREE.Vector3();
  private readonly look = new THREE.Vector2();
  private readonly forward = new THREE.Vector3();
  private readonly right = new THREE.Vector3();
  private readonly goal = new THREE.Vector3();

  constructor(
    readonly camera: THREE.PerspectiveCamera,
    private readonly ground: (x: number, z: number, feet?: number) => number,
  ) {}

  /** Takes over from wherever the camera is, looking the same way. */
  begin(): void {
    this.position.copy(this.camera.position);
    this.camera.getWorldDirection(this.forward);
    this.yaw = Math.atan2(-this.forward.x, -this.forward.z);
    this.pitch = Math.asin(clamp(this.forward.y, -1, 1));
    this.velocity.set(0, 0, 0);
  }

  update(dt: number, input: Input): void {
    input.consumeLook(this.look);
    this.yaw -= this.look.x * 0.0045;
    this.pitch = clamp(this.pitch - this.look.y * 0.0035, -1.45, 1.45);
    // Space jumps on foot; here it climbs, so a jump must not wait for the walk back.
    input.consumeJump();

    const cp = Math.cos(this.pitch);
    this.forward.set(-Math.sin(this.yaw) * cp, Math.sin(this.pitch), -Math.cos(this.yaw) * cp);
    this.right.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const fast = input.held('ShiftLeft') || input.held('ShiftRight') ? FAST : 1;
    const climb = (input.held('KeyE') || input.held('Space') ? 1 : 0) - (input.held('KeyQ') ? 1 : 0);
    // On foot Shift sprints; flying, it goes faster, however far the stick is pushed.
    const m = input.move;
    const stick = m.lengthSq() > 0 ? 1 / Math.max(m.length(), 1e-6) : 0;
    const mx = fast > 1 ? m.x * stick : m.x;
    const my = fast > 1 ? m.y * stick : m.y;
    this.goal
      .set(0, 0, 0)
      .addScaledVector(this.forward, my)
      .addScaledVector(this.right, mx)
      .multiplyScalar(SPEED * fast);
    this.goal.y += climb * SPEED * fast * 0.6;
    this.velocity.lerp(this.goal, 1 - Math.exp(-dt * 8));
    this.position.addScaledVector(this.velocity, dt);
    this.position.y -= input.consumeZoom() * CLIMB;
    this.position.y = Math.max(this.position.y, this.ground(this.position.x, this.position.z, this.position.y) + 0.3);

    this.camera.position.copy(this.position);
    this.camera.lookAt(this.goal.copy(this.position).add(this.forward));
  }
}
