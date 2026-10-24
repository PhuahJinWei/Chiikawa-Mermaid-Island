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
/**
 * Your own steps out of your own eyes (the user, 2026-10-24: sprinting felt like sliding along the ground): a step
 * every STEP metres as you walk, longer as you run and sprint (STEP_RUN and STEP_SPRINT times as long); with each
 * one your eyes dip as your foot comes down, and they sway and tilt toward the foot you stand on, a stride (two
 * steps) to and fro: as much as DIP (metres, top to bottom), SWAY (metres, side to side) and ROLL (radians either
 * way) walking, running and sprinting, eased in and out as you get going and stop; none in the air. (Before,
 * only the body's own bob moved them, eased away nearly to nothing: 2 to 2.5 cm running or sprinting.)
 */
const STEP = 0.55;
const STEP_RUN = 1.35;
const STEP_SPRINT = 1.95;
// (Toned down, the user, 2026-10-24: too much, walking too. Had been 1.2, 2.5, 5 cm; 0.8, 1.6, 3 cm; 0.3°, 0.7°,
// 1.5°.)
const DIP = [0.004, 0.01, 0.025];
const SWAY = [0.002, 0.006, 0.014];
const ROLL = [0.001, 0.004, 0.012];

const _l = new THREE.Vector3();
const _r = new THREE.Vector3();
const _tilt = new THREE.Vector3();
const _bob = new THREE.Vector3();

/** How far `ch` is from a walk to a run (0 to 1) and from a run to a sprint, going at `speed`. */
function paces(ch: Character, speed: number): [number, number] {
  return [
    THREE.MathUtils.smoothstep(speed, ch.walkSpeed * 0.95, ch.runSpeed * 0.9),
    THREE.MathUtils.smoothstep(speed, ch.runSpeed * 1.02, ch.sprintSpeed * 0.95),
  ];
}

/** Of the three, walking, running and sprinting, as much as `ch` is of each going at `speed`. */
function byPace(k: number[], run: number, dash: number): number {
  return k[0] + (k[1] - k[0]) * run + (k[2] - k[1]) * dash;
}

/** How far `ch` goes in a step out of their own eyes, going at `speed` (see STEP): for the paw you see swaying
 * with your steps (HandView) as for the eyes. */
export function stepLength(ch: Character, speed: number): number {
  const [run, dash] = paces(ch, speed);
  return STEP * byPace([1, STEP_RUN, STEP_SPRINT], run, dash);
}

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
  /** Your footfalls so far, one each time a foot comes down (see STEP): the footsteps you hear (Game.hearing). */
  footfalls = 0;

  private readonly look = new THREE.Vector2();
  /** The height of their feet (or their seat) and of their eyes over them, as the eyes follow them
   * (NaN: to be taken as they are). */
  private feet = NaN;
  private over = NaN;
  /** How far your steps have gone (a half turn a step, see STEP), and how much you are on your feet, eased (0 in
   * the air, 1 on the ground). */
  private stride = 0;
  private onFeet = 1;

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

  /** How many times nearer the film's lens brings things than the eyes' own, on this screen's shape: as far as
   * the view narrows (see zoom). */
  get mostZoom(): number {
    return halfTan(this.wideFov()) / halfTan(FILM_FOV);
  }

  /** How many times nearer things are brought now than through the eyes' own lens: 1 to mostZoom. */
  get magnified(): number {
    return Math.pow(this.mostZoom, this.zoom);
  }

  /** The zoom (see zoom) that brings things `times` nearer than the eyes' own lens. */
  zoomFor(times: number): number {
    return clamp(Math.log(times) / Math.log(this.mostZoom), 0, 1);
  }

  /** The eyes' own lens on this screen's shape, in degrees tall (see UPRIGHT_FOV). */
  private wideFov(): number {
    return THREE.MathUtils.lerp(UPRIGHT_FOV, WIDE_FOV, THREE.MathUtils.smoothstep(this.camera.aspect, 0.6, 1.4));
  }

  update(dt: number, input: Input, ch: Character): void {
    const camera = this.camera;
    const wide = this.wideFov();
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
    // Your steps: the eyes dip with each, and sway and tilt to the foot you stand on.
    this.steps(dt, ch, _bob);
    camera.position.x += Math.cos(this.yaw) * _bob.x;
    camera.position.z -= Math.sin(this.yaw) * _bob.x;
    camera.position.y += _bob.y;
    this.limit(camera.position, ch.feetY);
    ch.actionTilt(_tilt);
    camera.rotation.set(
      clamp(this.pitch - _tilt.x * TILT, -MOST_PITCH, MOST_PITCH),
      this.yaw + _tilt.y * TILT_ROUND,
      _tilt.z * TILT + _bob.z,
      'YXZ',
    );
  }

  /**
   * Your steps out of your own eyes (see STEP), as they go on as you walk, counting your footfalls: into `out`, how
   * far to your right the eyes sway (x, metres), how far up they bob (y) and how far they tilt (z, radians).
   */
  private steps(dt: number, ch: Character, out: THREE.Vector3): THREE.Vector3 {
    const speed = Math.hypot(ch.velocity.x, ch.velocity.z);
    const feet = !ch.inAir && !ch.ride;
    this.onFeet += ((feet ? 1 : 0) - this.onFeet) * (1 - Math.exp(-dt * 12));
    if (feet) {
      const before = Math.floor(this.stride / Math.PI);
      this.stride += (speed / stepLength(ch, speed)) * Math.PI * dt;
      if (Math.floor(this.stride / Math.PI) > before && speed > 0.3) this.footfalls++;
    }
    const [run, dash] = paces(ch, speed);
    const k = THREE.MathUtils.smoothstep(speed, 0.3, 1.0) * this.onFeet;
    // Lowest as a foot comes down (each half turn), to the side of the foot stood on (a whole turn, two steps).
    const down = Math.abs(Math.sin(this.stride));
    const side = Math.cos(this.stride);
    return out.set(
      (byPace(SWAY, run, dash) / 2) * side * k,
      byPace(DIP, run, dash) * (down - 0.5) * k,
      byPace(ROLL, run, dash) * side * k,
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
