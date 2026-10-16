import * as THREE from 'three';
import type { Input } from './Input';

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const wrapAngle = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

/** Orbit camera that follows a focus point. Yaw 0 looks along -Z from the +Z side. */
export class CameraRig {
  yaw = 0;
  pitch = 0.16;
  distance = 7;
  readonly minDistance = 3;
  readonly maxDistance = 24;

  private readonly target = new THREE.Vector3(0, 0.6, 0);
  private readonly lookDelta = new THREE.Vector2();
  private goal: { yaw: number; pitch: number; distance: number } | null = null;

  constructor(readonly camera: THREE.PerspectiveCamera) {}

  /** Glide to a framing; any drag or zoom by the player cancels it. */
  frame(yaw: number, pitch: number, distance: number): void {
    this.goal = { yaw, pitch, distance };
  }

  /** The point the camera looks at. */
  get focus(): THREE.Vector3 {
    return this.target;
  }

  snapTo(focus: THREE.Vector3): void {
    this.target.copy(focus);
  }

  update(dt: number, input: Input, focus: THREE.Vector3): void {
    input.consumeLook(this.lookDelta);
    const zoom = input.consumeZoom();
    if (this.lookDelta.lengthSq() > 0 || zoom !== 0) this.goal = null;
    this.yaw -= this.lookDelta.x * 0.0065;
    this.pitch = clamp(this.pitch + this.lookDelta.y * 0.0045, -0.02, 1.2);
    this.distance = clamp(this.distance * Math.exp(zoom * 0.0012), this.minDistance, this.maxDistance);

    if (this.goal) {
      const k = 1 - Math.exp(-dt * 5);
      this.yaw += wrapAngle(this.goal.yaw - this.yaw) * k;
      this.pitch += (this.goal.pitch - this.pitch) * k;
      this.distance += (this.goal.distance - this.distance) * k;
      const done =
        Math.abs(wrapAngle(this.goal.yaw - this.yaw)) < 1e-3 &&
        Math.abs(this.goal.pitch - this.pitch) < 1e-3 &&
        Math.abs(this.goal.distance - this.distance) < 1e-3;
      if (done) this.goal = null;
    }

    this.target.lerp(focus, 1 - Math.exp(-dt * 10));
    const cp = Math.cos(this.pitch);
    this.camera.position.set(
      this.target.x + Math.sin(this.yaw) * cp * this.distance,
      this.target.y + Math.sin(this.pitch) * this.distance,
      this.target.z + Math.cos(this.yaw) * cp * this.distance,
    );
    this.camera.lookAt(this.target);
  }

  /** Direction the camera faces, flattened onto the ground. */
  forward(out: THREE.Vector3): THREE.Vector3 {
    return out.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
  }

  right(out: THREE.Vector3): THREE.Vector3 {
    return out.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
  }
}
