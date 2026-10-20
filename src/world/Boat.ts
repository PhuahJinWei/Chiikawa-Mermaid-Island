import * as THREE from 'three';
import { caveFlameMaterial, caveThingMaterial, type Cave } from './Cave';
import { addOutline } from './Ink';
import { addSwitchedBox } from './Obstacles';

/**
 * The rowboat waiting in the forbidden cave, drawn up on the sand of its beach as the film's (`cave
 * interior 2`; afloat in `3` to `5`), and the plan's (PLAN.md 6.2: row at 3 m/s, the joystick steers and
 * the boat turns gently, the action button gets you in at its shore and out at any shore or ledge).
 * Getting in at the beach pushes it off into the water; landing there draws it up again. Whoever rows
 * sits in it, the torch set up at its bow; its oars swing as it goes. It keeps to water deep enough
 * to float in.
 */

/** Where the boat lies: its middle (at the water when afloat, its keel's line on the sand when drawn
 * up), which way its bow points (as an object's rotation.y), how far its bow is raised and how far it
 * leans to its right (radians). */
export interface Pose {
  x: number;
  y: number;
  z: number;
  heading: number;
  pitch: number;
  roll: number;
}

/** Rowing: its top speed, how fast it gathers way and loses it, and how fast it turns (radians a second). */
const SPEED = 3;
const PULL = 1.6;
const DRAG = 1.1;
const TURN = 1.1;
/** Its draft: the water under its keel must be at least this deep. */
const DRAFT = 0.3;
/** From its middle to its bow and its stern, and from its middle to its side. */
const HALF_LENGTH = 1.2;
const HALF_BEAM = 0.55;
/** How close to it someone must stand to get in, and how far over the water a shore may be to get out onto. */
const BOARD_REACH = 1.9;
const SHORE_REACH = 2.1;
/** Where the rower sits, from the boat's middle along it, and how high over the water. */
const SEAT = -0.05;
const SEAT_UP = 0.22;
/** How far its keel is under its middle's height (the water's, afloat). */
const KEEL = 0.12;
/** How long pushing it off the beach, or drawing it up, takes (seconds); and how near its beached place
 * it must be landed for it to be drawn up. */
const SLIDE = 1.3;
const DRAW_UP_REACH = 4;

export class Boat {
  readonly group = new THREE.Group();
  /** Where it floats (its middle at the water) and which way its bow points (as an object's rotation.y). */
  readonly position = new THREE.Vector3();
  heading = 0;
  /** Whether someone is in it. */
  manned = false;
  /** Whether it lies drawn up on the beach. */
  ashore = false;
  /** How it lies drawn up on the beach, and afloat by it, ready to row (null: it is never drawn up). */
  private beach: Pose | null = null;
  private launch: Pose | null = null;
  /** Its slide off the beach or up it: from where, to where, how far along (0 to 1). */
  private slideFrom: Pose | null = null;
  private slideTo: Pose | null = null;
  private slideT = 0;
  private pitch = 0;
  private roll = 0;
  private lastTime = NaN;
  /** Walkers keep out of it while it lies on the beach. */
  private block: { walk: boolean } | null = null;
  private speed = 0;
  private stroke = 0;
  private readonly hull: THREE.Mesh;
  private readonly oars: THREE.Group[] = [];
  private readonly torch: THREE.Group;
  private readonly materials: THREE.ShaderMaterial[] = [];
  private readonly water: number;

  constructor(
    private readonly cave: Cave,
    dock: { x: number; z: number; heading: number },
  ) {
    this.water = cave.info.water;
    const material = caveThingMaterial();
    this.materials.push(material);
    this.hull = new THREE.Mesh(cave.boatGeometry, material);
    // The boat's own frame has its length along x, the bow toward +x; turned so it points along +z,
    // the way an object's rotation.y = 0 faces.
    this.hull.rotation.y = -Math.PI / 2;
    this.hull.position.y = -0.12;
    const body = new THREE.Group();
    body.add(this.hull);
    addOutline(this.hull);
    for (const side of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.position.set(side * (HALF_BEAM + 0.04), 0.36, 0);
      const oar = new THREE.Mesh(cave.oarGeometry, material);
      // The oar's own frame runs from its grip along +x; out over the side from the oarlock.
      oar.position.set(-side * 0.55, 0, 0);
      oar.rotation.y = side > 0 ? 0 : Math.PI;
      pivot.add(oar);
      addOutline(oar);
      body.add(pivot);
      this.oars.push(pivot);
    }
    this.torch = new THREE.Group();
    const stick = new THREE.Mesh(cave.torchGeometry, material);
    const flame = new THREE.Mesh(cave.torchFlameGeometry, caveFlameMaterial());
    this.torch.add(stick, flame);
    addOutline(stick);
    // At the bow, lighting the way, its flame mirrored ahead; out of the line from the camera behind
    // to the rower.
    this.torch.position.set(0.22, 0.25, HALF_LENGTH - 0.3);
    this.torch.rotation.z = -0.08;
    this.torch.visible = false;
    body.add(this.torch);
    this.group.add(body);
    this.dockAt(dock);
  }

  /**
   * A mooring near `near` (x, z): of the places within 4 m where the boat floats with floor someone can
   * stand on within reach of its side, the nearest, the boat lying along that shore with its bow toward
   * `toward` (x, z) where it can.
   */
  static mooring(cave: Cave, near: [number, number], toward: [number, number] = near): { x: number; z: number; heading: number } {
    const g = cave.grid;
    let best: { x: number; z: number; heading: number } | null = null;
    let bestD = Infinity;
    for (let dz = -4; dz <= 4; dz += 0.25) {
      for (let dx = -4; dx <= 4; dx += 0.25) {
        const d = Math.hypot(dx, dz);
        if (d > 4 || d >= bestD) continue;
        const x = near[0] + dx;
        const z = near[1] + dz;
        // The nearest floor to stand on, round it, within reach of the boat's side.
        let shore: [number, number] | null = null;
        for (let r = HALF_BEAM + 0.3; r <= BOARD_REACH - 0.2 && !shore; r += 0.2) {
          for (let a = 0; a < 2 * Math.PI; a += 0.2) {
            const k = g.at(x + r * Math.cos(a), z + r * Math.sin(a));
            if (k >= 0 && g.walk[k] === 1) {
              shore = [x + r * Math.cos(a), z + r * Math.sin(a)];
              break;
            }
          }
        }
        if (!shore) continue;
        const across = Math.atan2(shore[0] - x, shore[1] - z);
        const ways = [across + Math.PI / 2, across - Math.PI / 2];
        const goal = Math.atan2(toward[0] - x, toward[1] - z);
        ways.sort((a, b) => Math.abs(Math.atan2(Math.sin(a - goal), Math.cos(a - goal))) - Math.abs(Math.atan2(Math.sin(b - goal), Math.cos(b - goal))));
        const heading = ways.find((h) => floats(cave, x, z, h));
        if (heading === undefined) continue;
        best = { x, z, heading };
        bestD = d;
      }
    }
    if (!best) throw new Error(`No mooring for the cave's boat near ${near}`);
    return best;
  }

  /**
   * Where it could lie drawn up on the beach near `near` (x, z): its keel on the sand just above the
   * water's edge, along the shore (as level along its length as the sand allows), its bow toward
   * `toward` (x, z), leaning a little toward the water; or null if nowhere near will do.
   */
  static beached(cave: Cave, near: [number, number], toward: [number, number]): Pose | null {
    const g = cave.grid;
    const water = cave.info.water;
    const floor = (x: number, z: number) => g.floorAt(x, z);
    let best: Pose | null = null;
    let bestScore = Infinity;
    for (let dz = -3; dz <= 3; dz += 0.25) {
      for (let dx = -3; dx <= 3; dx += 0.25) {
        const x = near[0] + dx;
        const z = near[1] + dz;
        const mid = floor(x, z);
        if (!(mid > water + 0.05 && mid < water + 0.35)) continue;
        for (let a = 0; a < 16; a++) {
          const heading = (a / 16) * 2 * Math.PI;
          const fx = Math.sin(heading);
          const fz = Math.cos(heading);
          const bow = floor(x + fx * HALF_LENGTH, z + fz * HALF_LENGTH);
          const stern = floor(x - fx * HALF_LENGTH, z - fz * HALF_LENGTH);
          // Its right side (its bow along +z, its right toward -x): see the box's frame in place().
          const right = floor(x - fz * HALF_BEAM, z + fx * HALF_BEAM);
          const left = floor(x + fz * HALF_BEAM, z - fx * HALF_BEAM);
          if ([bow, stern, right, left].some((f) => Number.isNaN(f))) continue;
          const k = g.at(x, z);
          if (k < 0 || g.ceiling[k] - mid < 1.8) continue;
          const level = Math.abs(bow - stern);
          if (level > 0.25) continue;
          const goal = Math.atan2(toward[0] - x, toward[1] - z);
          const off = Math.abs(Math.atan2(Math.sin(heading - goal), Math.cos(heading - goal)));
          const score = Math.hypot(dx, dz) + 3 * level + 2 * off;
          if (score >= bestScore) continue;
          bestScore = score;
          // Its keel on the sand, leaning half as much as the sand slopes across it.
          const pitch = Math.atan2(bow - stern, 2 * HALF_LENGTH);
          const roll = 0.5 * Math.atan2(left - right, 2 * HALF_BEAM);
          best = { x, y: mid + KEEL, z, heading, pitch, roll };
        }
      }
    }
    return best;
  }

  /**
   * Where it comes to rest pushed off the beach from `beach`: the nearest place out from the sand where
   * it floats whichever way it is turned (so it can be rowed off any way), its bow still along the
   * shore; or null if there is none within 5 m.
   */
  static launch(cave: Cave, beach: Pose): { x: number; z: number; heading: number } | null {
    const g = cave.grid;
    const fx = Math.sin(beach.heading);
    const fz = Math.cos(beach.heading);
    // Out toward the water: whichever side the floor falls away to.
    const lx = beach.x + fz * 1.5;
    const lz = beach.z - fx * 1.5;
    const rx = beach.x - fz * 1.5;
    const rz = beach.z + fx * 1.5;
    const out = (g.floorAt(lx, lz) || 0) < (g.floorAt(rx, rz) || 0) ? 1 : -1;
    for (let d = 1.5; d <= 5; d += 0.25) {
      for (const side of [0, 0.5, -0.5, 1, -1]) {
        const x = beach.x + fz * out * d + fx * side;
        const z = beach.z - fx * out * d + fz * side;
        let free = true;
        for (let a = 0; a < 8 && free; a++) free = floats(cave, x, z, (a / 8) * 2 * Math.PI);
        if (free) return { x, z, heading: beach.heading };
      }
    }
    return null;
  }

  /** Sets it afloat at a mooring. */
  dockAt(dock: { x: number; z: number; heading: number }): void {
    this.slideFrom = this.slideTo = null;
    this.setAshore(false);
    this.position.set(dock.x, this.water, dock.z);
    this.heading = dock.heading;
    this.pitch = this.roll = 0;
    this.speed = 0;
    this.place();
  }

  /** Lays it up on the beach (`beach`), from where it is pushed off to `launch`, afloat beside it, and
   * drawn up again when it is landed near there. */
  drawnUp(beach: Pose, launch: { x: number; z: number; heading: number }): void {
    this.beach = beach;
    this.launch = { x: launch.x, y: this.water, z: launch.z, heading: launch.heading, pitch: 0, roll: 0 };
    this.block ??= addSwitchedBox(beach.x, beach.z, HALF_BEAM + 0.05, HALF_LENGTH + 0.05, beach.heading, beach.y - 1, beach.y + 0.6);
    this.layAt(beach);
    this.setAshore(true);
  }

  /** Where someone landing at the beach steps onto the sand, beside the boat drawn up there (or null
   * when it is not near enough to be drawn up). */
  landingBeside(out: THREE.Vector3): THREE.Vector3 | null {
    const b = this.beach;
    if (!b || !this.launch || Math.hypot(this.position.x - this.launch.x, this.position.z - this.launch.z) > DRAW_UP_REACH) return null;
    // Out on its landward side, over the sand, a step from its side.
    const fx = Math.sin(b.heading);
    const fz = Math.cos(b.heading);
    const toLand = Math.sign((b.x - this.launch.x) * fz - (b.z - this.launch.z) * fx) || 1;
    return out.set(b.x + fz * toLand * (HALF_BEAM + 0.75), 0, b.z - fx * toLand * (HALF_BEAM + 0.75));
  }

  /** Back on the beach at once, if it has one (for a staged shot without it, and after one). */
  toBeach(): void {
    if (!this.beach) return;
    this.slideFrom = this.slideTo = null;
    this.layAt(this.beach);
    this.setAshore(true);
  }

  private setAshore(on: boolean): void {
    this.ashore = on;
    if (this.block) this.block.walk = on;
  }

  private layAt(p: Pose): void {
    this.position.set(p.x, p.y, p.z);
    this.heading = p.heading;
    this.pitch = p.pitch;
    this.roll = p.roll;
    this.place();
  }

  private here(): Pose {
    return { x: this.position.x, y: this.position.y, z: this.position.z, heading: this.heading, pitch: this.pitch, roll: this.roll };
  }

  /** Whether it is being pushed off the beach or drawn up it. */
  get sliding(): boolean {
    return this.slideTo !== null;
  }

  /** The way its bow points, flat. */
  forward(out: THREE.Vector3): THREE.Vector3 {
    return out.set(Math.sin(this.heading), 0, Math.cos(this.heading));
  }

  /** Where its rower sits (or, for a staged shot, whoever sits at seat 0 the stern, 1 the middle, 2
   * the bow), as it lies and rocks; and the torch's flame when it is set up at the bow (or null). */
  seat(out: THREE.Vector3, at = -1): THREE.Vector3 {
    const along = at < 0 ? SEAT : [-0.62, -0.05, 0.5][at] ?? SEAT;
    return out.set(0, SEAT_UP, along).applyMatrix4(this.group.matrixWorld);
  }

  /** Shows the torch at its bow, or not (when someone in it holds one up). */
  showTorch(on: boolean): void {
    this.torch.visible = on;
  }

  torchFlame(out: THREE.Vector3): THREE.Vector3 | null {
    if (!this.torch.visible) return null;
    return out.set(0, 0.66, 0).applyMatrix4(this.torch.matrixWorld);
  }

  /** Whether someone on foot at p is near enough to get in. */
  canBoard(p: THREE.Vector3): boolean {
    return !this.manned && Math.hypot(p.x - this.position.x, p.z - this.position.z) < BOARD_REACH;
  }

  /** Someone gets in: the torch goes up at the bow; drawn up on the beach, it is pushed off. */
  board(): void {
    this.manned = true;
    this.torch.visible = true;
    if (this.ashore && this.launch) this.slide(this.launch);
  }

  private slide(to: Pose): void {
    this.slideFrom = this.here();
    this.slideTo = to;
    this.slideT = 0;
    this.speed = 0;
    this.setAshore(false);
  }

  /** A place on the shore beside it to get out onto, or null if there is none near: the nearest floor
   * someone can stand on, round it, no further than SHORE_REACH from its side or ends. */
  shore(standable: (x: number, z: number) => boolean, out: THREE.Vector3): THREE.Vector3 | null {
    const f = this.forward(_f);
    let best: THREE.Vector3 | null = null;
    let bestD = Infinity;
    for (let along = -HALF_LENGTH; along <= HALF_LENGTH + 0.01; along += 0.3) {
      for (const side of [-1, 1]) {
        for (let out_ = HALF_BEAM + 0.2; out_ <= HALF_BEAM + SHORE_REACH; out_ += 0.15) {
          const x = this.position.x + f.x * along + f.z * side * out_;
          const z = this.position.z + f.z * along - f.x * side * out_;
          if (!standable(x, z)) continue;
          const d = out_ + Math.abs(along) * 0.3;
          if (d < bestD) {
            bestD = d;
            best = (best ?? out).set(x, 0, z);
          }
          break;
        }
      }
    }
    for (const end of [-1, 1]) {
      for (let out_ = HALF_LENGTH + 0.2; out_ <= HALF_LENGTH + SHORE_REACH; out_ += 0.15) {
        const x = this.position.x + f.x * end * out_;
        const z = this.position.z + f.z * end * out_;
        if (!standable(x, z)) continue;
        const d = out_ - HALF_LENGTH + HALF_BEAM;
        if (d < bestD) {
          bestD = d;
          best = (best ?? out).set(x, 0, z);
        }
        break;
      }
    }
    return best;
  }

  /** Whoever rowed gets out; the torch comes down with them. Landed near the beach, it is drawn up. */
  leave(): void {
    this.manned = false;
    this.torch.visible = false;
    this.speed = 0;
    if (this.beach && !this.ashore && this.landingBeside(_f)) this.slide(this.beach);
  }

  /**
   * Rows for dt seconds toward `want` (the way the joystick points, flat, its length 0 to 1): turning
   * gently toward it and pulling ahead, the harder the further the stick is pushed; it stops short of
   * rock and shallows, sliding along them. It turns only where it has room to swing its bow and stern;
   * where it has not, it eases ahead to find room, and steered behind it, it backs water as it turns.
   * The oars swing as it moves.
   */
  row(dt: number, want: THREE.Vector3): void {
    // Not while it is pushed off the beach.
    if (this.sliding || this.ashore) return;
    const push = Math.min(1, want.length());
    if (push > 0.05) {
      const goal = Math.atan2(want.x, want.z);
      const turn = Math.atan2(Math.sin(goal - this.heading), Math.cos(goal - this.heading));
      const step = Math.max(-TURN * dt, Math.min(TURN * dt, turn));
      const turned = this.afloat(this.position.x, this.position.z, this.heading + step) || !this.afloat(this.position.x, this.position.z, this.heading);
      if (turned) this.heading += step;
      // Pulling ahead the more, the more the bow already points the way wanted; easing ahead where it
      // cannot turn; backing water, slowly, when the way wanted is behind it.
      const c = Math.cos(turn);
      const way = c > -0.3 ? SPEED * push * Math.max(c, turned ? 0 : 0.35) : -0.4 * SPEED * push * -c;
      this.speed += (way - this.speed) * Math.min(1, PULL * dt);
    } else {
      this.speed -= this.speed * Math.min(1, DRAG * dt);
    }
    const f = this.forward(_f);
    const step = this.speed * dt;
    const nx = this.position.x + f.x * step;
    const nz = this.position.z + f.z * step;
    if (this.afloat(nx, nz, this.heading)) {
      this.position.x = nx;
      this.position.z = nz;
    } else if (this.afloat(nx, this.position.z, this.heading)) {
      this.position.x = nx;
      this.speed *= 0.7;
    } else if (this.afloat(this.position.x, nz, this.heading)) {
      this.position.z = nz;
      this.speed *= 0.7;
    } else {
      this.speed *= 0.3;
    }
    this.stroke += Math.abs(this.speed) * dt * 2.4 + (push > 0.05 ? dt * 1.5 : 0);
    this.place();
  }

  /** Whether it can float with its middle at (x, z), its bow along `heading`: water deep enough under
   * its bow, its middle and its stern, and either side. */
  afloat(x: number, z: number, heading: number): boolean {
    return floats(this.cave, x, z, heading);
  }

  /** Moves it to where it is, sliding off the beach or up it, rocking a little on the water, its oars
   * at their stroke, lit as the cave is there. */
  update(time: number): void {
    const dt = Number.isNaN(this.lastTime) ? 0 : Math.min(0.1, Math.max(0, time - this.lastTime));
    this.lastTime = time;
    if (this.slideFrom && this.slideTo) {
      this.slideT = Math.min(1, this.slideT + dt / SLIDE);
      const a = this.slideFrom;
      const b = this.slideTo;
      const t = this.slideT * this.slideT * (3 - 2 * this.slideT);
      const turn = Math.atan2(Math.sin(b.heading - a.heading), Math.cos(b.heading - a.heading));
      this.layAt({
        x: a.x + (b.x - a.x) * t,
        y: a.y + (b.y - a.y) * t,
        z: a.z + (b.z - a.z) * t,
        heading: a.heading + turn * t,
        pitch: a.pitch + (b.pitch - a.pitch) * t,
        roll: a.roll + (b.roll - a.roll) * t,
      });
      if (this.slideT >= 1) {
        this.slideFrom = this.slideTo = null;
        this.setAshore(b === this.beach);
      }
    }
    // On the water it rocks; on the sand it lies still.
    const afloat = this.ashore ? 0 : this.sliding ? this.slideTo === this.beach ? 1 - this.slideT : this.slideT : 1;
    this.group.position.y = this.position.y + afloat * 0.025 * Math.sin(time * 1.3);
    this.group.rotation.set(-this.pitch, this.heading, this.roll + afloat * 0.02 * Math.sin(time * 0.9), 'YXZ');
    this.group.updateMatrixWorld(true);
    this.oars.forEach((pivot, i) => {
      const side = i === 0 ? -1 : 1;
      if (this.manned) {
        // Rowing: swung fore and aft, the blades dipping as they pull.
        const swing = Math.sin(this.stroke);
        pivot.rotation.set(0, side * (0.25 + 0.45 * swing), -side * (0.32 + 0.12 * Math.cos(this.stroke)));
      } else {
        // Moored: shipped, lying along the gunwales, their blades over the bow.
        pivot.rotation.set(0, side * 1.35, -side * 0.06);
      }
    });
    this.cave.termsAt(this.position.x, this.water + 0.5, this.position.z, this.materials[0].uniforms.uHere.value as THREE.Vector3);
  }

  private place(): void {
    this.group.position.copy(this.position);
    this.group.rotation.set(-this.pitch, this.heading, this.roll, 'YXZ');
    this.group.updateMatrixWorld(true);
  }
}

const _f = new THREE.Vector3();

/** Whether the boat floats with its middle at (x, z), its bow along `heading`: water deep enough under
 * its bow, its middle and its stern, and either side, with room over it for its rower. */
function floats(cave: Cave, x: number, z: number, heading: number): boolean {
  const g = cave.grid;
  const water = cave.info.water;
  const fx = Math.sin(heading);
  const fz = Math.cos(heading);
  for (const [along, side] of [[HALF_LENGTH, 0], [0, 0], [-HALF_LENGTH, 0], [0, HALF_BEAM], [0, -HALF_BEAM], [0.6, 0], [-0.6, 0]]) {
    const px = x + fx * along + fz * side;
    const pz = z + fz * along - fx * side;
    const k = g.at(px, pz);
    if (k < 0) return false;
    const floor = g.floor[k];
    if (Number.isNaN(floor) || floor > water - DRAFT || g.ceiling[k] - water < 1.4) return false;
  }
  return true;
}
