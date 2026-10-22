import * as THREE from 'three';
import type { Input } from './Input';
import type { Character } from '../characters/Character';

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const halfTan = (degrees: number) => Math.tan(THREE.MathUtils.degToRad(degrees) / 2);

/** How far up and down the eyes turn, in radians: nearly straight up, to the sun and the moon (and the
 * moon over the forbidden cave's skylight), and nearly straight down, to your feet and your reflection
 * in the water. */
const PITCH = 1.4;
/** The eyes' own lens, as tall a view as this, in degrees: on an upright phone about as much as its own
 * camera shows (78° tall, 41° across), on a wide screen about as much as eyes see (60° tall, 85°
 * across); in between, by the screen's shape. */
const UPRIGHT_FOV = 78;
const WIDE_FOV = 60;
/** The film's lens, the follow camera's: pinching (or the wheel) narrows the view toward it. */
const FILM_FOV = 30;
/** How far a drag turns the view, in radians a pixel, through the eyes' own lens; a narrowed lens turns
 * as much slower as it shows less. */
const TURN = 0.006;
/** How much of the way from the eyes' own lens to the film's each unit of wheel or pinch goes. */
const ZOOM = 0.0012;
/** How quickly the eyes follow, per second: their feet's height over steps and stairs, and their eyes'
 * height over their feet as the body bobs, squashes and sits. */
const FEET_EASE = 14;
const BOB_EASE = 9;
/** The eyes turn with the head as what you do turns it (Character.actionTilt: a bow, a dance, a look about):
 * this share of its turn round, and of the rest; never past looking straight up or down. */
const TILT_ROUND = 0.6;
const TILT = 1;
const MOST_PITCH = 1.55;

const _l = new THREE.Vector3();
const _r = new THREE.Vector3();
const _tilt = new THREE.Vector3();

/**
 * The game's camera: out of the eyes of the character you control, who is seen only in the calm water
 * (see Character.setUnseen). Drag to look round (a drag right looks right, a drag down looks down);
 * pinch or scroll to narrow the view toward the film's lens and back. Yaw 0 looks along -Z, as the
 * follow camera's does, so the stick walks the way you look.
 */
export class FirstPersonCamera {
  yaw = 0;
  pitch = 0;
  /** How far the view is narrowed: 0, the eyes' own lens, to 1, the film's. */
  zoom = 0;

  private readonly look = new THREE.Vector2();
  /** The height of their feet (or their seat) and of their eyes over them, as the eyes follow them
   * (NaN: to be taken as they are). */
  private feet = NaN;
  private over = NaN;

  constructor(
    readonly camera: THREE.PerspectiveCamera,
    /** Keeps the eyes, of someone whose feet are at `feet`, out of what is over their head. */
    private readonly limit: (p: THREE.Vector3, feet: number) => void = () => {},
  ) {}

  /** Looks out of `ch`'s eyes the way they face, level: after they are put somewhere, or chosen. */
  lookFrom(ch: Character): void {
    this.yaw = ch.facing + Math.PI;
    this.pitch = 0;
    this.snap();
  }

  /** Takes their height as it is on the next update, without easing to it. */
  snap(): void {
    this.feet = this.over = NaN;
  }

  /** The way their body faces: the way you look (see Character.look). */
  get facing(): number {
    return this.yaw + Math.PI;
  }

  /** Levels the gaze and opens the view again. */
  reset(): void {
    this.pitch = 0;
    this.zoom = 0;
  }

  update(dt: number, input: Input, ch: Character): void {
    const camera = this.camera;
    const wide = THREE.MathUtils.lerp(UPRIGHT_FOV, WIDE_FOV, THREE.MathUtils.smoothstep(camera.aspect, 0.6, 1.4));
    this.zoom = clamp(this.zoom - input.consumeZoom() * ZOOM, 0, 1);
    // Narrowed as a lens is, evenly in how much it shows.
    const t = Math.pow(halfTan(wide), 1 - this.zoom) * Math.pow(halfTan(FILM_FOV), this.zoom);
    const fov = THREE.MathUtils.radToDeg(2 * Math.atan(t));
    if (Math.abs(camera.fov - fov) > 1e-3) {
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }
    input.consumeLook(this.look);
    const turn = TURN * (t / halfTan(wide));
    this.yaw -= this.look.x * turn;
    this.pitch = clamp(this.pitch - this.look.y * turn, -PITCH, PITCH);

    this.follow(dt, ch);
    ch.actionTilt(_tilt);
    camera.rotation.set(
      clamp(this.pitch - _tilt.x * TILT, -MOST_PITCH, MOST_PITCH),
      this.yaw + _tilt.y * TILT_ROUND,
      _tilt.z * TILT,
      'YXZ',
    );
  }

  /**
   * Puts the camera at `ch`'s eyes: as high as their two eyes are, over the middle of their body (their
   * eyes are at the front of their head, but out there the camera would pass into whatever their body
   * only touches: a wall, someone they bump into). In the air it goes exactly with them, in a jump or a
   * fall; on the ground it eases up and down steps, and over the body's bob as they walk.
   */
  private follow(dt: number, ch: Character): void {
    const p = ch.position;
    const eyes = (ch.getAnchor('eyeL', _l).y + ch.getAnchor('eyeR', _r).y) / 2 - p.y;
    const flying = p.y - ch.feetY > 1e-3;
    if (Number.isNaN(this.feet) || flying || Math.abs(p.y - this.feet) > 1) this.feet = p.y;
    else this.feet += (p.y - this.feet) * (1 - Math.exp(-dt * FEET_EASE));
    if (Number.isNaN(this.over)) this.over = eyes;
    else this.over += (eyes - this.over) * (1 - Math.exp(-dt * BOB_EASE));
    this.camera.position.set(p.x, this.feet + this.over, p.z);
    this.limit(this.camera.position, ch.feetY);
  }

  /** Direction the eyes face, flattened onto the ground. */
  forward(out: THREE.Vector3): THREE.Vector3 {
    return out.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
  }

  right(out: THREE.Vector3): THREE.Vector3 {
    return out.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
  }
}
