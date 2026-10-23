import * as THREE from 'three';
import { loadGltf } from '../core/gltf';
import { sharedUniforms } from '../characters/CharacterMaterial';
import type { SkyLook } from './DayNight';
import { inkOutlineMaterialLit, windUniforms } from './Ink';
import { FILM, FLAME_BRIGHT, PEN_MARK } from './Look';
import { addCircle } from './Obstacles';
import { WadeRings, wadeGlsl } from './Ripples';

/**
 * The forbidden cave's inside (built with the island by art/blender/cave.py), after the film's frames of
 * it: from its mouth on the west beach a passage on foot under the outcrop, a cavern where the cave's
 * sea comes in onto a little beach and a rowboat waits, the sea running on under the spur to the domed
 * chamber under the skylight, its water glowing, and a ledge of stone with crystals and a small fire
 * on its far side.
 *
 * It lies under the island's ground, so it has a ground of its own: a grid of its floor's and ceiling's
 * heights (CaveGrid) that characters and the camera keep to while they are in it (see Island.ts), its
 * walls wherever there is no floor. It is lit by its own light, not the sun's: deep blue in the dark,
 * the outside's light coming in through the skylight and the mouth, the glowing water's cyan, and the
 * torch carried through it and the fire on the ledge, warm (caveLight; each vertex of its rock carries
 * how open it is, how much of the openings and of the water it sees, `aLight`).
 */

/** What the island's build knows of the cave (cave.py's `info`). */
export interface CaveInfo {
  water: number;
  /** The walk grid: its north-west corner (x, z), its cells' size, how many across and down, the
   * heights its values span and whether they are stored predicted (as height.bin is). */
  grid: { url: string; origin: [number, number]; cell: number; size: [number, number]; range: [number, number]; predicted?: boolean };
  mouth: { centre: [number, number]; facing: number };
  /** The domed chamber under the skylight: its middle (x, z), how far its water reaches, and the
   * height of the ground round the skylight's well. */
  dome: { centre: [number, number]; radius: number; top: number };
  /** Where the fire on the ledge burns. */
  fire: [number, number, number];
  /** Rubble, stones, crystals and the fire's ring: walkers go round them. */
  blocks: { circle: [number, number, number]; y: [number, number] }[];
  /** The ledge's front edge, the landed ground beyond the water: (x, z) points. */
  ledge: [number, number][];
  /** The openings the sun and the moon shine in by: the skylight's well, its rim at the ground and its
   * foot over the dome (x, y, z and radius each); and the mouth's arch, the middle of its sill (x, y, z),
   * the way it faces out of the cave (x, z), how far back it leans for each metre it rises (as its face
   * does: what stands before that leaning plane is out of the cave), its half width and its height. */
  well?: { top: [number, number, number, number]; foot: [number, number, number, number] };
  arch?: { foot: [number, number, number]; facing: [number, number]; lean?: number; half: number; height: number };
  /** The chamber past the dome, where the ledge is: its middle (x, z) and how far its wall stands. */
  chamber?: { centre: [number, number]; radius: number };
  /** The cavern's beach: where the boat lies drawn up on it (x, z). */
  beach?: { boat: [number, number] };
}

/** Deepest water a character wades into, the steepest floor they walk up (rise per metre) and the
 * highest step up, as on the island's ground (Island.ts). */
const WADE = 0.25;
const STEEPEST = 1.0;
const STEP_UP = 0.35;
/** How many of those wading in the cave's water it rings round at once (see Cave.waders). */
const CAVE_WADERS = 6;
/**
 * The boat's rings in the cave's water (see Cave.ripples and Boat.update), each left where it was made:
 * how many points along its bow's way its wake is drawn from, and how far the wave its bow made at each
 * spreads for each metre the bow goes on (so the V they open together is 0.36 wide for each metre back);
 * how many rings trail its stern at once, and how many its oars' blades leave where they go in and come
 * out; how long each of those spreads before it is gone (seconds) and how far out (metres).
 */
export const WAKE_POINTS = 18;
export const WAKE_OPEN = 0.339;
export const STERN_RINGS = 3;
export const STERN_LIFE = 2.2;
export const STERN_SPREAD = 1.4;
export const OAR_RINGS = 8;
export const OAR_LIFE = 1.1;
export const OAR_SPREAD = 0.55;
/** How close a walker's middle comes to the cave's walls. */
const MARGIN = 0.3;
/** The least room over a floor for walking under. */
const HEAD = 0.9;
/** The cave's walls hold whoever is lower than this; the spur's top over them is far higher. */
const WALL_TOP = 6.5;
/** A ceiling this high is the open sky: the skylight's well, and before the mouth. */
const OPEN = 25;
/** How far in from the mouth the beach can still be seen out of it (round the passage's bend it
 * cannot), and how far round the skylight the jungle shows up its well from the water below. */
const LOOK_OUT = 12;
const SKYLIGHT_VIEW = 30;

/**
 * The cave's floor and ceiling on a grid, NaN where there is no cave; from them where a walker may go
 * (`walk`), where the cave's walls are (`wall`: the cells beside its floor that no one outside could
 * stand on at the floor's level, so not the beach before the mouth) and where is inside it (`inside`:
 * under its rock, or in the dome).
 */
export class CaveGrid {
  readonly nx: number;
  readonly nz: number;
  readonly x0: number;
  readonly z0: number;
  readonly cell: number;
  readonly floor: Float32Array;
  readonly ceiling: Float32Array;
  readonly walk: Uint8Array;
  readonly wall: Uint8Array;
  readonly inside: Uint8Array;

  constructor(
    readonly info: CaveInfo,
    buffer: ArrayBuffer,
    outsideWalkable: (x: number, z: number, y: number) => boolean,
  ) {
    const g = info.grid;
    [this.nx, this.nz] = g.size;
    [this.x0, this.z0] = g.origin;
    this.cell = g.cell;
    const n = this.nx * this.nz;
    const q = new Uint16Array(buffer);
    if (q.length !== 2 * n) throw new Error('cave_grid.bin does not match its grid');
    const [lo, hi] = g.range;
    const read = (offset: number): Float32Array => {
      const part = q.slice(offset, offset + n);
      if (g.predicted) unpredictGrid(part, this.nx, this.nz);
      const out = new Float32Array(n);
      for (let i = 0; i < n; i++) out[i] = part[i] === 0xffff ? NaN : lo + (part[i] / 65534) * (hi - lo);
      return out;
    };
    this.floor = read(0);
    this.ceiling = read(n);
    this.walk = new Uint8Array(n);
    this.wall = new Uint8Array(n);
    this.inside = new Uint8Array(n);
    const [dx, dz] = info.dome.centre;
    for (let k = 0; k < n; k++) {
      const f = this.floor[k];
      if (Number.isNaN(f)) continue;
      const x = this.x0 + ((k % this.nx) + 0.5) * this.cell;
      const z = this.z0 + (Math.floor(k / this.nx) + 0.5) * this.cell;
      this.inside[k] = this.ceiling[k] < OPEN || Math.hypot(x - dx, z - dz) < info.dome.radius + 1.5 ? 1 : 0;
    }
    // The walls: cells by the floor with none of their own, unless someone outside stands there at the
    // floor's level (the beach before the mouth).
    const reach = Math.ceil(1.5 / this.cell);
    for (let j = 0; j < this.nz; j++) {
      for (let i = 0; i < this.nx; i++) {
        const k = j * this.nx + i;
        if (!Number.isNaN(this.floor[k])) continue;
        let near = NaN;
        for (let b = -reach; b <= reach && Number.isNaN(near); b++) {
          for (let a = -reach; a <= reach; a++) {
            const kk = this.index(i + a, j + b);
            if (kk >= 0 && !Number.isNaN(this.floor[kk])) {
              near = this.floor[kk];
              break;
            }
          }
        }
        if (Number.isNaN(near)) continue;
        const x = this.x0 + (i + 0.5) * this.cell;
        const z = this.z0 + (j + 0.5) * this.cell;
        if (!outsideWalkable(x, z, near)) this.wall[k] = 1;
      }
    }
    // Where a walker may go: floor not under deep water, with room over it, not too steep, not within
    // MARGIN of a wall or the foot of a drop, and not on the brink of a drop into water too deep to wade:
    // the floor's height blends from each cell into the eight round it, so by such a drop, even across a
    // corner, their feet would sink into the water (off the ledge's low lip).
    const ok = new Uint8Array(n);
    for (let j = 0; j < this.nz; j++) {
      for (let i = 0; i < this.nx; i++) {
        const k = j * this.nx + i;
        const f = this.floor[k];
        if (Number.isNaN(f) || f < info.water - WADE || this.ceiling[k] - f < HEAD) continue;
        let steep = false;
        for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const kk = this.index(i + a, j + b);
          if (kk < 0) continue;
          const ff = this.floor[kk];
          if (!Number.isNaN(ff) && Math.abs(ff - f) > STEEPEST * this.cell + 0.02 && ff > info.water - WADE) steep = true;
        }
        ok[k] = steep ? 0 : 1;
      }
    }
    const r = Math.max(1, Math.ceil(MARGIN / this.cell));
    for (let j = 0; j < this.nz; j++) {
      for (let i = 0; i < this.nx; i++) {
        const k = j * this.nx + i;
        if (!ok[k]) continue;
        const f = this.floor[k];
        let clear = true;
        for (let b = -r; b <= r && clear; b++) {
          for (let a = -r; a <= r; a++) {
            const kk = this.index(i + a, j + b);
            if (kk < 0) continue;
            const ff = this.floor[kk];
            const near = (a * a + b * b) * this.cell * this.cell <= MARGIN * MARGIN + 1e-6;
            const brink = Math.abs(a) <= 1 && Math.abs(b) <= 1 && f - ff > STEP_UP && ff < info.water - WADE;
            if ((near && (this.wall[kk] || (!Number.isNaN(ff) && ff - f > STEP_UP))) || brink) {
              clear = false;
              break;
            }
          }
        }
        this.walk[k] = clear ? 1 : 0;
      }
    }
  }

  /** The cell at column i, row j, or -1 off the grid. */
  index(i: number, j: number): number {
    return i < 0 || j < 0 || i >= this.nx || j >= this.nz ? -1 : j * this.nx + i;
  }

  /** The cell over (x, z), or -1 off the grid. */
  at(x: number, z: number): number {
    return this.index(Math.floor((x - this.x0) / this.cell), Math.floor((z - this.z0) / this.cell));
  }

  /** The floor's height at (x, z), between the cells' middles where all four have one; NaN where there is none. */
  floorAt(x: number, z: number): number {
    const k = this.at(x, z);
    if (k < 0 || Number.isNaN(this.floor[k])) return NaN;
    const gx = (x - this.x0) / this.cell - 0.5;
    const gz = (z - this.z0) / this.cell - 0.5;
    const i = Math.floor(gx);
    const j = Math.floor(gz);
    const a = this.index(i, j);
    const b = this.index(i + 1, j);
    const c = this.index(i, j + 1);
    const d = this.index(i + 1, j + 1);
    if (a < 0 || b < 0 || c < 0 || d < 0) return this.floor[k];
    const fa = this.floor[a];
    const fb = this.floor[b];
    const fc = this.floor[c];
    const fd = this.floor[d];
    if (Number.isNaN(fa) || Number.isNaN(fb) || Number.isNaN(fc) || Number.isNaN(fd)) return this.floor[k];
    const u = gx - i;
    const v = gz - j;
    return (fa + (fb - fa) * u) * (1 - v) + (fc + (fd - fc) * u) * v;
  }

  /** Whether someone whose feet are at `feet` over (x, z) is in the cave: over its floor, below its ceiling. */
  holds(x: number, z: number, feet: number): boolean {
    const k = this.at(x, z);
    return k >= 0 && !Number.isNaN(this.floor[k]) && feet < this.ceiling[k] - 0.4 && feet > this.floor[k] - 2;
  }

  /** Whether (x, z) at `feet` is against the cave's walls, for someone in it. */
  walled(x: number, z: number, feet: number): boolean {
    const k = this.at(x, z);
    return k >= 0 && this.wall[k] === 1 && feet < WALL_TOP;
  }
}

/** Puts back a grid stored as each sample less what its neighbours west, north and north-west predict,
 * round 65536 (predicted in art/blender/build_island.py), in place; nx across, nz down. */
function unpredictGrid(q: Uint16Array, nx: number, nz: number): void {
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const k = j * nx + i;
      const guess = i > 0 && j > 0 ? q[k - 1] + q[k - nx] - q[k - nx - 1] : i > 0 ? q[k - 1] : j > 0 ? q[k - nx] : 0;
      q[k] = (q[k] + guess) & 0xffff;
    }
  }
}

// ---------------------------------------------------------------------------- the light
/** How many lights move or burn in the cave at once: the carried torch, the ledge's fire, the boat's. */
export const CAVE_LIGHTS = 3;

/**
 * The cave's light: every source of it. Nothing else may light anything in the cave (no colour of its
 * own in a shader, no glow put on for looks, no light of the island's outside): see Cave.darkTest, which
 * puts all of these out, and the dev tools' caveDark, which then finds nothing in the cave lit.
 *
 * The sources: the dark's own deep blue, the film's painted night, on the walls and a little brighter on
 * what faces up (uCaveAmbient, uCaveFloor; it also gives the water its dark and the cast their pale
 * glow, as the film paints them); the outside's light as it comes in by the skylight and the mouth
 * (uCaveSky, by day bright, by night the moon's); the lake's glowing water (uLakeGlow, the one light the
 * cave makes of itself, as the film's does) and its light on the rock round it (uCaveGlow); the sun or
 * the moon shining in (uSunWay, uSunLight); and the torches and the fire (xyz where, w how far they
 * reach; 0 when out). Measured on the film's frames: walls a near-black navy, floors a dark blue, the
 * rock round the lake a little lighter (`cave interior 1`, `2`, `4`).
 */
export const caveLight = {
  uCaveAmbient: { value: new THREE.Color(0.003, 0.016, 0.11) },
  uCaveFloor: { value: new THREE.Color(0.003, 0.022, 0.16) },
  uCaveSky: { value: new THREE.Color(0.3, 0.4, 0.7) },
  uCaveGlow: { value: new THREE.Color(0.003, 0.03, 0.26) },
  uLakeGlow: { value: new THREE.Color('#2FA6FF') },
  /** The glowing water's middle, at its surface (x, y, z), which its light on the rock comes from. */
  uLakeAt: { value: new THREE.Vector3(0, -100, 0) },
  /** The way to the sun, or to the moon once the sun is down, and its light (black while neither is up). */
  uSunWay: { value: new THREE.Vector3(0, 1, 0) },
  uSunLight: { value: new THREE.Color(0, 0, 0) },
  /** The openings it shines in by (see CaveInfo): the well's rim and foot (x, y, z, radius), how far
   * from the dome's middle its light can reach, and the mouth's arch: its foot (x, y, z, half width) and
   * the way it faces (x, z), its height and how far in its light can reach before the passage bends, and
   * how far back it leans as it rises. */
  uWellTop: { value: new THREE.Vector4(0, -100, 0, 0) },
  uWellFoot: { value: new THREE.Vector4(0, -100, 0, 0) },
  uDomeReach: { value: 0 },
  uArchFoot: { value: new THREE.Vector4(0, -100, 0, 0) },
  uArchWay: { value: new THREE.Vector4(0, 1, 1, 0) },
  uArchLean: { value: 0 },
  uTorch: { value: Array.from({ length: CAVE_LIGHTS }, () => new THREE.Vector4()) },
  uTorchColour: { value: Array.from({ length: CAVE_LIGHTS }, () => new THREE.Color()) },
  uTime: windUniforms.uTime,
};

/** The torches' and the fire's warmth: a flame's light, as the film paints it on the cave's rock, a pale
 * warm cream (`cave interior 1`'s vault, `2`'s sand). */
export const TORCH_COLOUR = new THREE.Color(0.8, 0.72, 0.56);
/** How far a torch's light reaches, and the fire's: a small bright pool round it, the dark beyond. */
export const TORCH_REACH = 3.2;
/** Where the cave torch's flame burns in its own frame: this far up the stick from the hand (art/blender/
 * cave.py's torch, 0.66 at its TORCH_SIZE 0.75). */
export const TORCH_FLAME_UP = 0.5;
export const FIRE_REACH = 2.6;
/** The fire's light: redder than a torch's, low on the cobbles round it, which it turns the film's warm
 * magenta against the cave's blue (`cave interior 7`). */
export const FIRE_COLOUR = new THREE.Color(0.95, 0.42, 0.2);

const LIGHT_GLSL = /* glsl */ `
uniform vec3 uCaveAmbient;
uniform vec3 uCaveFloor;
uniform vec3 uCaveSky;
uniform vec3 uCaveGlow;
uniform vec3 uLakeGlow;
uniform vec3 uLakeAt;
uniform vec3 uSunWay;
uniform vec3 uSunLight;
uniform vec4 uWellTop;
uniform vec4 uWellFoot;
uniform float uDomeReach;
uniform vec4 uArchFoot;
uniform vec4 uArchWay;
uniform float uArchLean;
/* How much of the sun (or the moon) reaches p, soft at the edges: in the dome, through the skylight's
   well, its foot and its rim (the dome's vault is round, so nothing else stands in the way); in the
   passage's first metres, through the mouth's arch. Nowhere else: the rest is under rock. */
float caveSunShare(vec3 p) {
  vec3 l = uSunWay;
  float well = 0.0;
  if (l.y > 0.02 && p.y < uWellTop.y && distance(p.xz, uWellTop.xz) < uDomeReach) {
    vec2 top = p.xz + l.xz * ((uWellTop.y - p.y) / l.y);
    vec2 foot = p.xz + l.xz * ((uWellFoot.y - p.y) / l.y);
    well = smoothstep(uWellTop.w, uWellTop.w - 0.5, distance(top, uWellTop.xz));
    if (p.y < uWellFoot.y) well *= smoothstep(uWellFoot.w, uWellFoot.w - 0.5, distance(foot, uWellFoot.xz));
  }
  float mouth = 0.0;
  vec2 f = uArchWay.xy;
  // Across the arch's plane, which leans back as it rises.
  float outward = dot(l.xz, f) + uArchLean * l.y;
  float inward = dot(uArchFoot.xz - p.xz, f) - uArchLean * (p.y - uArchFoot.y);
  if (outward > 0.02 && inward > -0.3 && inward < uArchWay.w) {
    vec3 q = p + l * (inward / outward);
    float across = abs(dot(q.xz - uArchFoot.xz, vec2(-f.y, f.x))) / uArchFoot.w;
    float up = (q.y - uArchFoot.y) / uArchWay.z;
    // The arch: upright sides to its springing, a rounded top over them.
    float room = up < 0.45 ? 1.0 - across : 1.0 - length(vec2(across, (up - 0.45) / 0.55));
    mouth = smoothstep(0.0, 0.06, room) * step(0.0, up) * smoothstep(uArchWay.w, uArchWay.w - 2.0, inward);
  }
  return max(well, mouth);
}
/* The sun's (or the moon's) light on a point facing n. */
vec3 caveSun(vec3 p, vec3 n) {
  float facing = max(dot(n, uSunWay), 0.0);
  return facing > 0.0 ? uSunLight * facing * caveSunShare(p) : vec3(0.0);
}
uniform vec4 uTorch[${CAVE_LIGHTS}];
uniform vec3 uTorchColour[${CAVE_LIGHTS}];
uniform float uTime;
/* The dark's own light on a point facing n: the walls' navy, darker under the vault, the floors' royal
   blue. */
vec3 caveDark(vec3 n) {
  vec3 dark = mix(uCaveAmbient * 0.6, uCaveAmbient, smoothstep(-0.9, 0.1, n.y));
  return mix(dark, uCaveFloor, smoothstep(0.25, 0.95, n.y));
}
/* The torches' and the fire's light on a point facing n: warm, a pool bright out to two fifths of their
   reach and soon falling off to nothing at it, as the film paints a torch's light (cave interior 1,
   2), flickering a little; a little even on what faces away, as round a flame. */
vec3 caveTorches(vec3 p, vec3 n) {
  vec3 sum = vec3(0.0);
  for (int i = 0; i < ${CAVE_LIGHTS}; i++) {
    if (uTorch[i].w <= 0.0) continue;
    vec3 d = uTorch[i].xyz - p;
    float dist = length(d);
    float fall = smoothstep(uTorch[i].w, uTorch[i].w * 0.4, dist);
    float facing = 0.3 + 0.7 * max(dot(n, d / max(dist, 1e-3)), 0.0);
    sum += uTorchColour[i] * fall * fall * facing;
  }
  return sum;
}
`;

/**
 * The cave's rock (and crystals and vines): its own colour times the cave's light at each vertex (how
 * open it is to the dark round it, how much of the openings and of the glowing water it sees) and the
 * torches'. No sun, no fog: nothing of the outside's reaches in but by the openings.
 */
function rockMaterial(shine = 0): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { ...caveLight, uShine: { value: shine } },
    vertexColors: true,
    vertexShader: /* glsl */ `
      attribute vec3 aLight;
      varying vec3 vColour;
      varying vec3 vLight;
      varying vec3 vWorld;
      varying vec3 vNormal;
      void main() {
        vColour = color.rgb;
        vLight = aLight;
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorld = wp.xyz;
        vNormal = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */ `
      #include <common>
      ${LIGHT_GLSL}
      uniform float uShine;
      varying vec3 vColour;
      varying vec3 vLight;
      varying vec3 vWorld;
      varying vec3 vNormal;
      void main() {
        vec3 n = normalize(vNormal) * (gl_FrontFacing ? 1.0 : -1.0);
        vec3 lit = clamp(vLight, vec3(0.0), vec3(2.0));
        float open = 0.3 + 0.7 * lit.x;
        // The lake's light comes off its water, before and below the rock: what of the rock's folds and
        // lumps turns toward it takes more of it, what turns away less, pixel by pixel; and along the
        // rock's edges, where it turns from the eye, it catches the film's cyan rim of it.
        vec3 eye = normalize(cameraPosition - vWorld);
        float toward = max(dot(n, normalize(uLakeAt - vWorld)), 0.0);
        float edge = 1.0 - max(dot(n, eye), 0.0);
        float rim = edge * edge * edge * (0.2 + 0.8 * toward);
        // The film paints the rock in the dark by its forms: where it turns from the eye it holds a little
        // more of the painted dark's blue, so its lumps and masses read in it (cave interior 1, 2, 3); not
        // the floors, which stay as dark as they are.
        float forms = 1.6 * edge * edge * (1.0 - smoothstep(0.45, 0.85, n.y));
        vec3 light = caveDark(n) * open * (1.0 + forms) + uCaveSky * lit.y
          + uCaveGlow * lit.z * ((0.55 + 0.45 * open) * (0.3 + 0.7 * toward) + 0.9 * rim);
        // Where the torch lights it, the rock shows its flowstone: drips running down over the vault and
        // the walls in rounded runs, as the film's arch (cave interior 1).
        float along = dot(vWorld.xz, vec2(0.8, 0.6));
        float across = dot(vWorld.xz, vec2(-0.6, 0.8));
        float drip = sin(along * 17.0 + 2.2 * sin(vWorld.y * 4.1 + along * 1.3) + 1.4 * sin(across * 6.0 + vWorld.y * 2.0))
                   + 0.6 * sin(along * 7.0 - vWorld.y * 3.3 + 1.1 * sin(across * 3.1));
        // Broken into runs, not stripes: some stand out, some fade into the rock.
        float runs = 0.5 + 0.5 * sin(across * 2.3 + vWorld.y * 1.7 + 1.3 * sin(along * 1.1)) * sin(along * 1.9 - vWorld.y * 2.2);
        float flow = 0.62 + 0.38 * mix(0.55, smoothstep(-0.6, 0.9, drip), smoothstep(0.15, 0.75, runs));
        light += caveTorches(vWorld, n) * flow;
        light += caveSun(vWorld, n);
        vec3 col = clamp(vColour, 0.0, 1.0) * light;
        // Crystals catch the light that reaches them and glint with it: dark but for that, as the
        // film's are (cave interior 7, 8), no light of their own.
        col += uShine * clamp(vColour, 0.0, 1.0) * light * 0.5;
        // The air over the glowing water holds a little of its light: the rock far off across it, low
        // down, shows through a faint haze of it, as the film's far walls do (cave interior 4).
        float far = 1.0 - exp(-0.05 * distance(cameraPosition, vWorld));
        float low = 1.0 - smoothstep(0.5, 4.5, vWorld.y - uLakeAt.y);
        float over = 1.0 - smoothstep(uDomeReach + 2.0, uDomeReach + 7.0, distance(vWorld.xz, uLakeAt.xz));
        col = mix(col, uCaveGlow * 0.5, far * low * over * 0.55);
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
}

/**
 * The cave's sea: dark and still under the rock, glowing cyan under the dome, more the nearer the
 * skylight, with sparkles winking on it as in the film's frames (`cave interior 4`, `5`), and each torch
 * mirrored in its ripples as a column of short warm strokes under the flame, toward whoever looks
 * (`cave interior 3`). Each vertex carries how much it glows, how much of the skylight's light falls on
 * it and how deep it is. Foam and rings in it round whoever wades in it and round the boat, its wake and
 * its oars' (`ripples`, see Cave.ripples), as in the island's sea, each ring left where it was made.
 */
function waterMaterial(ripples: Cave['ripples']): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      ...caveLight,
      ...ripples,
      uSparkle: { value: new THREE.Color(0.85, 0.97, 1.0) },
    },
    vertexColors: true,
    vertexShader: /* glsl */ `
      varying vec3 vInfo;
      varying vec3 vWorld;
      void main() {
        vInfo = color.rgb;
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorld = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */ `
      #include <common>
      ${LIGHT_GLSL}
      uniform vec3 uSparkle;
      ${wadeGlsl(CAVE_WADERS)}
      uniform vec4 uBoat;
      uniform vec4 uBoatWay;
      uniform vec4 uOars[2];
      uniform vec4 uWake[${WAKE_POINTS}];
      uniform vec4 uWakeReach;
      uniform vec4 uSternRings[${STERN_RINGS}];
      uniform vec4 uOarRings[${OAR_RINGS}];
      uniform vec4 uBoatReach;
      uniform mat4 uBoatFrame;
      varying vec3 vInfo;
      varying vec3 vWorld;
      float hash2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      // Whether a point of the water is inside the boat's hull, over its floor, which lies below the water
      // (its keel 0.12 under it): uBoatFrame takes it into the hull's own frame, as art/blender/cave.py's
      // boat() builds it (its length, 2.5, along x with the bow toward +x; its keel's lowest at y 0; its
      // beam 1.12, its sides 0.42 high, its planks 0.035 thick), however it rocks, pitches and bobs; and
      // its inside's shape there is boat()'s, from the inner shell's stations.
      bool inBoat(vec3 w) {
        vec3 q = (uBoatFrame * vec4(w, 1.0)).xyz;
        float s = q.x / 1.25;
        if (s < -0.972 || s > 0.936) return false;
        float half_ = s >= -0.2 ? 0.56 * max(1.0 - pow((s + 0.2) / 1.2, 2.2), 0.0) : 0.56 * (1.0 - 0.22 * pow((-0.2 - s) / 0.8, 1.5));
        float h = max(half_ - 0.035, 0.004);
        float k = 0.16 * pow(max(s, 0.0), 2.5) + 0.035;
        float g = 0.42 + 0.13 * max(s, 0.0) * max(s, 0.0) + 0.05 * max(-s, 0.0) * max(-s, 0.0);
        if (q.y < k || q.y > g) return false;
        return abs(q.z) < h * pow((q.y - k) / (g - k), 1.0 / 2.4);
      }
      void main() {
        // None in the boat: from in it, or looking into it, its floor and not the water over it.
        if (uBoat.w > 0.0 && inBoat(vWorld)) discard;
        // The lake's glow, a disc bright out to about half its way to the wall, faded toward its shore.
        float glow = smoothstep(0.62, 0.98, clamp(vInfo.x, 0.0, 1.0));
        float sky = clamp(vInfo.y, 0.0, 2.0);
        float deep = clamp(vInfo.z, 0.0, 1.0);
        vec2 p = vWorld.xz;
        float t = uTime;
        // Slow ripples from three ways, wandering, so they never line up.
        vec2 q = p + 0.6 * vec2(sin(p.y * 0.37 + t * 0.21), sin(p.x * 0.41 - t * 0.17));
        float rip = (sin(dot(q, vec2(1.7, 0.9)) * 2.1 + t * 1.1) + sin(dot(q, vec2(-0.8, 1.6)) * 2.7 - t * 0.9)
                     + sin(dot(q, vec2(1.3, -1.4)) * 1.6 + t * 0.7)) / 3.0;
        // Its dark is the cave's own seen in it: the shallows the floor under them, no brighter than the
        // floor is lit, the deep darker.
        vec3 col = mix(uCaveFloor * 0.6, uCaveAmbient * 0.4, smoothstep(0.01, 0.12, deep));
        float swell = sin(dot(p, vec2(0.21, 0.13)) + t * 0.15) * sin(dot(p, vec2(-0.11, 0.19)) - t * 0.11);
        col = mix(col, uLakeGlow * (0.9 + 0.05 * rip + 0.08 * swell), glow * glow * (3.0 - 2.0 * glow));
        col += uCaveSky * sky * 0.35;
        // Where the sun (or the moon) falls on it down the skylight's well, it shines, and sparkles more.
        float sunlit = caveSunShare(vWorld);
        col = min(col + uSunLight * sunlit * (0.16 + 0.04 * rip), vec3(0.98));
        // The torches' light on the water, a little; and each flame mirrored in the small ripples, the
        // mirror broken into short strokes in a column under it toward the eye.
        vec3 warm = caveTorches(vWorld, vec3(0.0, 1.0, 0.0));
        col += warm * 0.05;
        vec2 k1 = vec2(2.3, 8.1);
        vec2 k2 = vec2(-6.4, 5.2);
        vec2 k3 = vec2(7.9, -1.7);
        vec2 slope = 0.03 * (k1 * cos(dot(q, k1) + t * 2.1) + k2 * cos(dot(q, k2) - t * 1.7) + k3 * cos(dot(q, k3) + t * 2.6));
        vec3 bent = normalize(vec3(-slope.x, 1.0, -slope.y));
        vec3 seen = reflect(normalize(vWorld - cameraPosition), bent);
        for (int i = 0; i < ${CAVE_LIGHTS}; i++) {
          if (uTorch[i].w <= 0.0) continue;
          vec3 d = uTorch[i].xyz - vWorld;
          float dist = length(d);
          float mirror = pow(max(dot(seen, d / dist), 0.0), 50.0);
          col += uTorchColour[i] * vec3(1.0, 0.82, 0.42) * mirror * 4.5 * smoothstep(uTorch[i].w * 3.5, uTorch[i].w * 0.6, dist);
        }
        // Rings in it, catching the light that falls on them there (the glow, the torches', the sun's or
        // the moon's, the openings' sky, the cave's own dark) over the water's own, so they show paler
        // than the water even on the glow, and only as bright as the light there; each ring left where it
        // was made, spreading there as whoever made it goes on and turns. Round whoever wades in it: foam
        // hugging them where it meets them, and the rings they leave as they walk on.
        float ring = wadeFoam(p, t);
        // Round the boat afloat (uBoat: its middle, its heading, how much of it is afloat; uBoatWay: its
        // speed, half its length and half its beam): foam along its sides, heaped at its bow as it goes
        // ahead.
        if (uBoat.w > 0.0) {
          vec2 rel = p - uBoat.xy;
          if (dot(rel, rel) < 4.0) {
            vec2 ahead = vec2(sin(uBoat.z), cos(uBoat.z));
            vec2 hull = uBoatWay.zy;
            vec2 local = vec2(dot(rel, vec2(ahead.y, -ahead.x)), dot(rel, ahead));
            float outside = (length(local / hull) - 1.0) * min(hull.x, hull.y);
            if (outside >= -0.05 && outside < 0.11) {
              float a = atan(local.x, local.y);
              float collar = 1.0 - smoothstep(0.02, 0.07 + 0.03 * sin(a * 6.0 + t * 2.5), outside);
              float bow = smoothstep(0.2, 1.0, local.y / hull.y) * smoothstep(0.2, 2.0, uBoatWay.x);
              ring = max(ring, collar * (0.5 + 0.5 * bow) * uBoat.w);
            }
          }
        }
        // Its wake as it goes: the wave its bow made at each point of its way spreading out from there
        // (uWake: the way its bow has come, oldest first, ending at its bow now, each with how far its
        // wave has spread, WAKE_OPEN for each metre the bow has gone on since), so that together they
        // open in a V behind it, wavering, that bends after it as it turns; fading by how far back along
        // its way the waves making each piece of it were made, and toward the oldest kept; within
        // uWakeReach, as much of it as that shows (w). Well inside any of the waves there is no edge,
        // and a wave well away makes none here: nothing to work out for either.
        vec2 toWake = p - uWakeReach.xy;
        if (dot(toWake, toWake) < uWakeReach.z) {
          float edge = 1e3;
          float next = 1e3;
          float spread = 0.0;
          float spreadNext = 0.0;
          float oldest = uWake[0].z;
          for (int i = 0; i < ${WAKE_POINTS}; i++) {
            vec4 w = uWake[i];
            if (w.z < 0.0) break;
            vec2 rel = p - w.xy;
            float d2 = dot(rel, rel);
            if (w.z > 0.25 && d2 < (w.z - 0.25) * (w.z - 0.25)) {
              edge = -1.0;
              break;
            }
            if (d2 > (w.z + 0.4) * (w.z + 0.4)) continue;
            float d = sqrt(d2) - w.z;
            if (d < edge) {
              next = edge;
              spreadNext = spread;
              edge = d;
              spread = w.z;
            } else if (d < next) {
              next = d;
              spreadNext = w.z;
            }
          }
          // How far back along its way the edge here was made: that of the wave it is the edge of, eased
          // toward the next one's where two meet, so nothing steps along it.
          float back = mix(spread, spreadNext, 0.5 - 0.5 * smoothstep(0.0, 0.15, next - edge)) / ${WAKE_OPEN};
          float arm = abs(edge - 0.05 * sin(back * 5.0 - t * 4.0));
          float v = (1.0 - smoothstep(0.0, 0.04 + 0.015 * back, arm)) * smoothstep(0.96, 1.44, back) * (1.0 - smoothstep(2.0, 9.0, back))
            * smoothstep(0.0, 2.0, oldest / ${WAKE_OPEN} - back);
          ring = max(ring, v * 0.65 * uWakeReach.w);
        }
        // The rings it leaves astern, fewer as it slows (uSternRings), and each oar's blade where it goes
        // in and where it comes out (uOarRings), each where it was made (x, z), when, and how much of it
        // there is; and a splash where a blade dips (uOars: where, how far in). All within uBoatReach.
        vec2 toBoat = p - uBoatReach.xy;
        if (dot(toBoat, toBoat) < uBoatReach.z) {
          for (int k = 0; k < ${STERN_RINGS}; k++) {
            vec4 r = uSternRings[k];
            float age = (t - r.z) / ${STERN_LIFE.toFixed(1)};
            if (age < 0.0 || age >= 1.0) continue;
            ring = max(ring, ringOfFoam(p, r.xy, 0.5 + age * ${STERN_SPREAD.toFixed(1)}, age, float(k), fract(r.z * 0.618)) * r.w);
          }
          for (int k = 0; k < ${OAR_RINGS}; k++) {
            vec4 r = uOarRings[k];
            float age = (t - r.z) / ${OAR_LIFE.toFixed(1)};
            if (age < 0.0 || age >= 1.0) continue;
            ring = max(ring, (1.0 - smoothstep(0.0, 0.025, abs(length(p - r.xy) - (0.08 + age * ${OAR_SPREAD.toFixed(2)})))) * (1.0 - age) * (1.0 - age) * r.w);
          }
          for (int i = 0; i < 2; i++) {
            vec4 o = uOars[i];
            if (o.z > 0.0) ring = max(ring, (1.0 - smoothstep(0.03, 0.12, length(p - o.xy))) * 0.8 * o.z);
          }
        }
        if (ring > 0.0) {
          vec3 lit = uCaveFloor * 1.6 + uLakeGlow * glow * 0.75 + warm * 0.9 + uSunLight * sunlit * 0.7 + uCaveSky * sky * 0.5;
          col += vec3(0.78, 0.92, 1.0) * lit * ring * 0.6;
        }
        // Sparkles: in each cell of a fine grid one point, winking in its own time; seen from far off
        // (down the skylight) fewer of them, but each bigger, so they still show as the film's do.
        float far = smoothstep(8.0, 30.0, distance(cameraPosition, vWorld));
        vec2 cell = floor(p * 2.2);
        vec2 at = cell + vec2(hash2(cell), hash2(cell + 7.3));
        float d = length(p * 2.2 - at);
        float wink = pow(max(sin(t * (1.2 + hash2(cell + 3.1)) + hash2(cell + 1.7) * 6.28), 0.0), 12.0);
        float star = smoothstep(0.09 + 0.3 * far, 0.0, d) * wink * step(hash2(cell + 9.1), 1.0 - 0.7 * far);
        // Only where there is light to wink: the glow, a torch's, the sun's or the moon's, the sky's.
        col += uSparkle * star * (1.6 * glow * uLakeGlow.b + 0.5 * length(warm) + 2.0 * sunlit * length(uSunLight) + 0.4 * sky * length(uCaveSky));
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
}

/** Flames that make their own light, drawn as every fire is (FLAME_BRIGHT), wavering the more the
 * higher up the flame (which the colours tell), as Props.ts draws the torches' but lit at any hour. */
export function caveFlameMaterial(): THREE.MeshBasicMaterial {
  const material = new THREE.MeshBasicMaterial({ vertexColors: true });
  flames.add(material);
  if (FILM) material.color.setRGB(FLAME_BRIGHT, FLAME_BRIGHT, FLAME_BRIGHT);
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, windUniforms);
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime;').replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
      {
        float up = clamp((0.9 - color.g) / 0.76, 0.0, 1.0);
        transformed.x += up * up * 0.05 * sin(uTime * 8.0 + position.y * 9.0);
        transformed.z += up * up * 0.04 * cos(uTime * 6.5 + position.y * 7.0);
        transformed.y += up * 0.05 * sin(uTime * 11.0);
      }`,
    );
  };
  return material;
}

/**
 * Something made, moving in the cave (the boat, its oars, the torch's stick): its own colours in the
 * light the cast have where it is (`uLit`, Cave.lightOn, set as it moves), as the film keeps them and the
 * boat clear in the dark, darker on what faces down; and the torches', and the sun's where it shines.
 */
export function caveThingMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { ...caveLight, uLit: { value: new THREE.Color(0, 0, 0) } },
    vertexColors: true,
    vertexShader: /* glsl */ `
      varying vec3 vColour;
      varying vec3 vWorld;
      varying vec3 vNormal;
      void main() {
        vColour = color.rgb;
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorld = wp.xyz;
        vNormal = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */ `
      #include <common>
      ${LIGHT_GLSL}
      uniform vec3 uLit;
      varying vec3 vColour;
      varying vec3 vWorld;
      varying vec3 vNormal;
      void main() {
        vec3 n = normalize(vNormal) * (gl_FrontFacing ? 1.0 : -1.0);
        vec3 light = uLit * (0.6 + 0.4 * n.y);
        light += caveTorches(vWorld, n) * 0.8;
        light += caveSun(vWorld, n);
        gl_FragColor = vec4(min(clamp(vColour, 0.0, 1.0) * light, vec3(1.1)), 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
}

/**
 * The pen's line round something made in the cave (the boat, its oars, a torch's stick): in the light
 * that falls on it there (`lit`, its material's uLit) and the torches' and the sun's, no brighter than
 * what it outlines, as the cast's lines are lit as the cast are; not in the hour's light outside, which
 * does not reach in.
 */
export function caveInkMaterial(lit: THREE.IUniform<THREE.Color>): THREE.ShaderMaterial {
  return inkOutlineMaterialLit(
    { ...caveLight, uLit: lit },
    /* glsl */ `
      #include <common>
      ${LIGHT_GLSL}
      uniform vec3 uInk;
      uniform vec3 uLit;
      varying vec3 vWorld;
      void main() {
        vec3 eye = normalize(cameraPosition - vWorld);
        vec3 light = uLit + caveTorches(vWorld, eye) * 0.8 + caveSun(vWorld, eye);
        gl_FragColor = vec4(uInk * light, 1.0);
        #ifdef FILM_MASK
        gl_FragColor.a = ${PEN_MARK.toFixed(2)};
        #endif
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  );
}

// ---------------------------------------------------------------------------- what drifts in the dome
/** Motes drifting over the glowing water under the dome, winking in its light, as the film's (`cave
 * interior 2`, `4`, `5`). */
function motes(centre: [number, number], radius: number, water: number): THREE.Points {
  const count = 240;
  const pos = new Float32Array(count * 3);
  const seed = new Float32Array(count);
  let s = 7;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < count; i++) {
    const r = radius * Math.sqrt(rnd()) * 0.95;
    const a = rnd() * Math.PI * 2;
    pos.set([centre[0] + r * Math.cos(a), water + 0.15 + rnd() * rnd() * 4.5, centre[1] + r * Math.sin(a)], i * 3);
    seed[i] = rnd();
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geometry.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
  const material = new THREE.ShaderMaterial({
    uniforms: { uTime: windUniforms.uTime, uColour: { value: new THREE.Color(0.75, 0.95, 1.0) }, uScale: { value: 1 }, uLakeGlow: caveLight.uLakeGlow },
    vertexShader: /* glsl */ `
      attribute float aSeed;
      uniform float uTime;
      uniform float uScale;
      varying float vWink;
      void main() {
        vec3 p = position;
        float t = uTime * (0.15 + 0.1 * aSeed) + aSeed * 40.0;
        p.x += 0.35 * sin(t * 1.3 + aSeed * 9.0);
        p.z += 0.35 * cos(t * 1.1 + aSeed * 5.0);
        p.y += 0.25 * sin(t * 0.7 + aSeed * 3.0);
        vWink = pow(max(sin(uTime * (0.8 + aSeed) + aSeed * 31.0), 0.0), 4.0) * 0.85 + 0.15;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = uScale * (0.05 + 0.04 * aSeed) / max(-mv.z, 0.1);
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColour;
      uniform vec3 uLakeGlow;
      varying float vWink;
      void main() {
        vec2 q = gl_PointCoord - 0.5;
        float r = length(q);
        float star = smoothstep(0.5, 0.0, r) * 0.6 + smoothstep(0.08, 0.0, min(abs(q.x), abs(q.y))) * smoothstep(0.5, 0.1, r) * 0.5;
        // Lit by the glowing water under them.
        gl_FragColor = vec4(uColour * star * vWink * 2.0 * uLakeGlow.b, 1.0);
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  return points;
}

/** The light coming down the skylight's well, slanting as the sun or the moon goes over (`slant`: how
 * far across it goes for each metre down), in its colour: rays of soft, added light, stronger by day.
 * (No mist lies on the water: flat sheets of it, seen along the water, read as a slab of light.) */
function lightShaft(
  centre: [number, number],
  water: number,
  top: number,
): { group: THREE.Group; strength: THREE.IUniform<number>; slant: THREE.IUniform<THREE.Vector2>; colour: THREE.IUniform<THREE.Color> } {
  const strength = { value: 0.1 };
  const slant = { value: new THREE.Vector2() };
  const colour = { value: new THREE.Color(0.8, 0.92, 1.0) };
  const group = new THREE.Group();
  const beam = new THREE.ShaderMaterial({
    uniforms: { uStrength: strength, uColour: colour, uSlant: slant, uTop: { value: top - 3.6 } },
    vertexShader: /* glsl */ `
      uniform vec2 uSlant;
      uniform float uTop;
      varying vec3 vNormal;
      varying vec3 vView;
      varying float vUp;
      varying float vAround;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        wp.xz += uSlant * (uTop - wp.y);
        vNormal = normalize(mat3(modelMatrix) * normal);
        vView = normalize(cameraPosition - wp.xyz);
        vUp = uv.y;
        vAround = uv.x;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uStrength;
      uniform vec3 uColour;
      varying vec3 vNormal;
      varying vec3 vView;
      varying float vUp;
      varying float vAround;
      void main() {
        float edge = pow(abs(dot(normalize(vNormal), vView)), 1.5);
        // In rays: bright bands and dark between them, round the shaft.
        float k = vAround * 6.2832;
        float rays = smoothstep(0.2, 0.9, 0.5 + 0.5 * sin(k * 13.0 + 1.7 * sin(k * 5.0))) * (0.6 + 0.4 * sin(k * 3.0 + 0.8));
        float a = edge * uStrength * rays * smoothstep(0.0, 0.25, vUp) * (0.55 + 0.45 * vUp);
        gl_FragColor = vec4(uColour * a, 1.0);
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
  const tall = top - 3.6 - water;
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(5.6, 6.6, tall, 32, 1, true), beam);
  shaft.position.set(centre[0], water + tall / 2, centre[1]);
  shaft.frustumCulled = false;
  group.add(shaft);
  return { group, strength, slant, colour };
}

// ---------------------------------------------------------------------------- the cave
/** The cave's parts as cave.glb holds them. */
interface CaveParts {
  rock: THREE.Mesh;
  crystals: THREE.Mesh;
  vines: THREE.Mesh;
  water: THREE.Mesh;
  fire: THREE.Mesh;
  boat: THREE.Mesh;
  oar: THREE.Mesh;
  torch: THREE.Mesh;
  torchFlame: THREE.Mesh;
}

export class Cave {
  readonly group = new THREE.Group();
  /** The models that move: the boat, an oar, the torch's stick and its flame, each to be copied and
   * placed by whoever carries or rows them. */
  readonly boatGeometry: THREE.BufferGeometry;
  readonly oarGeometry: THREE.BufferGeometry;
  readonly torchGeometry: THREE.BufferGeometry;
  readonly torchFlameGeometry: THREE.BufferGeometry;
  private readonly beam: THREE.IUniform<number>;
  private readonly beamSlant: THREE.IUniform<THREE.Vector2>;
  private readonly beamColour: THREE.IUniform<THREE.Color>;
  /** Whether it is the sun shining in, or the moon; and how strongly, 0 to 1 (0 while neither is up). */
  private sunUp = true;
  private sunIn = 0;
  /** Whether the dark test is on (see darkTest), and the light it put out, to give back. */
  private dark = false;
  private kept: { ambient: THREE.Color; floor: THREE.Color; lake: THREE.Color } | null = null;
  private readonly motes: THREE.Points;
  private readonly bounds: THREE.Box3;
  /** Where the cave can be seen into from outside, round each of its openings: its mouth's arch and the
   * skylight's well (see seen). */
  private readonly openings: THREE.Sphere[] = [];
  /** Drawn however far off it is and wherever the camera looks: for the dev see-through test (see
   * Stage.drawAll). */
  drawAll = false;
  /** The lights moving or burning in the cave this frame: where each is and how far it reaches. */
  private readonly lights = Array.from({ length: CAVE_LIGHTS }, () => new THREE.Vector4());
  /** The foam whoever wades in the cave's water makes in it, kept by the stage (see Stage.setWaders). */
  readonly waders = new WadeRings(CAVE_WADERS);
  /**
   * The rings in the cave's water (see waterMaterial), kept by what makes them each frame: who wades in
   * it (waders); and the boat (Boat.update): the boat afloat on it (its middle, x and z, its heading and
   * how much of it is afloat, 0 drawn up on the beach; its speed, half its length and half its beam); its
   * oars' blades (x, z, how far into the water each dips, 0 out of it); its wake (the way its bow has
   * come, oldest first, ending at its bow now, x and z, each with how far the wave its bow made there
   * has spread, below 0 past the end of it; and round all of it, x and z, how far, squared, below 0 for
   * no wake, and how much of it shows); the rings it has left astern and its blades have left (each where it was made,
   * x and z, when, and how much of it there is); and round those and the splashes (x and z, how far,
   * squared, below 0 for nothing there).
   */
  readonly ripples = {
    ...this.waders.uniforms,
    uBoat: { value: new THREE.Vector4() },
    uBoatWay: { value: new THREE.Vector4() },
    uOars: { value: [new THREE.Vector4(), new THREE.Vector4()] },
    uWake: { value: Array.from({ length: WAKE_POINTS }, () => new THREE.Vector4(0, 0, -1, 0)) },
    uWakeReach: { value: new THREE.Vector4(0, 0, -1, 0) },
    uSternRings: { value: Array.from({ length: STERN_RINGS }, () => new THREE.Vector4(0, 0, -1e9, 0)) },
    uOarRings: { value: Array.from({ length: OAR_RINGS }, () => new THREE.Vector4(0, 0, -1e9, 0)) },
    uBoatReach: { value: new THREE.Vector4(0, 0, -1, 0) },
    /** From the world into the boat's hull's own frame (see the water's inBoat). */
    uBoatFrame: { value: new THREE.Matrix4() },
  };

  private constructor(
    readonly info: CaveInfo,
    readonly grid: CaveGrid,
    parts: CaveParts,
  ) {
    const rock = rockMaterial();
    for (const mesh of [parts.rock, parts.vines]) {
      mesh.material = rock;
      this.group.add(mesh);
    }
    parts.crystals.material = rockMaterial(1);
    this.group.add(parts.crystals);
    parts.water.material = waterMaterial(this.ripples);
    this.group.add(parts.water);
    parts.fire.material = caveFlameMaterial();
    this.group.add(parts.fire);
    this.boatGeometry = parts.boat.geometry;
    this.oarGeometry = parts.oar.geometry;
    this.torchGeometry = parts.torch.geometry;
    this.torchFlameGeometry = parts.torchFlame.geometry;
    const { group, strength, slant, colour } = lightShaft(info.dome.centre, info.water, info.dome.top);
    this.beam = strength;
    this.beamSlant = slant;
    this.beamColour = colour;
    // The openings the sun and the moon shine in by.
    if (info.well) {
      caveLight.uWellTop.value.fromArray(info.well.top);
      caveLight.uWellFoot.value.fromArray(info.well.foot);
      caveLight.uDomeReach.value = info.dome.radius - 0.3;
    }
    if (info.arch) {
      const [ax, ay, az] = info.arch.foot;
      caveLight.uArchFoot.value.set(ax, ay, az, info.arch.half);
      caveLight.uArchWay.value.set(info.arch.facing[0], info.arch.facing[1], info.arch.height, ARCH_REACH);
      caveLight.uArchLean.value = info.arch.lean ?? 0;
    }
    this.group.add(group);
    this.motes = motes(info.dome.centre, info.dome.radius * 0.9, info.water);
    this.group.add(this.motes);
    // What stands in the cave keeps walkers out, and the camera: it comes round in front of a crystal or
    // a rock rather than looking out from inside it.
    for (const b of info.blocks) addCircle(b.circle[0], b.circle[1], b.circle[2], b.y[0], b.y[1]);
    const { origin, cell, size } = info.grid;
    this.bounds = new THREE.Box3(
      new THREE.Vector3(origin[0], info.water - 4, origin[1]),
      new THREE.Vector3(origin[0] + cell * size[0], info.dome.top + 1, origin[1] + cell * size[1]),
    );
    if (info.arch) {
      const { foot, half, height } = info.arch;
      this.openings.push(new THREE.Sphere(new THREE.Vector3(foot[0], foot[1] + height / 2, foot[2]), Math.hypot(half, height / 2) + 1));
    }
    if (info.well) {
      const [x, top, z, r] = info.well.top;
      const foot = info.well.foot[1];
      this.openings.push(new THREE.Sphere(new THREE.Vector3(x, (top + foot) / 2, z), Math.hypot(r, (top - foot) / 2) + 1));
    }
    caveLight.uTorchColour.value[1].copy(FIRE_COLOUR);
    caveLight.uLakeAt.value.set(info.dome.centre[0], info.water, info.dome.centre[1]);
  }

  /** Loads the cave (`url`, cave.glb) and its walk grid; `outsideWalkable` says where someone outside it
   * could stand, for finding its walls. */
  static async load(url: string, outsideWalkable: (x: number, z: number, y: number) => boolean): Promise<Cave> {
    const gltf = await loadGltf(url);
    const found = new Map<string, THREE.Mesh>();
    gltf.scene.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) found.set(o.name, o as THREE.Mesh);
    });
    const get = (name: string): THREE.Mesh => {
      const mesh = found.get(name);
      if (!mesh) throw new Error(`No ${name} in ${url}`);
      mesh.removeFromParent();
      return mesh;
    };
    const parts: CaveParts = {
      rock: get('cave_rock'),
      crystals: get('cave_crystals'),
      vines: get('cave_vines'),
      water: get('cave_water'),
      fire: get('cave_fire_flame'),
      boat: get('cave_boat'),
      oar: get('cave_oar'),
      torch: get('cave_torch'),
      torchFlame: get('cave_torch_flame'),
    };
    const raw = parts.rock.userData.cave;
    if (typeof raw !== 'string') throw new Error(`No cave data in ${url}`);
    const info = JSON.parse(raw) as CaveInfo;
    for (const mesh of [parts.rock, parts.crystals, parts.vines]) {
      const light = mesh.geometry.getAttribute('_light');
      if (light) mesh.geometry.setAttribute('aLight', light);
      else mesh.geometry.setAttribute('aLight', new THREE.BufferAttribute(new Float32Array(mesh.geometry.getAttribute('position').count * 3), 3));
    }
    const response = await fetch(info.grid.url);
    if (!response.ok) throw new Error(`Could not load ${info.grid.url}`);
    const grid = new CaveGrid(info, await response.arrayBuffer(), outsideWalkable);
    return new Cave(info, grid, parts);
  }

  /**
   * The hour's light coming in (`look`, the island's at the hour): the sky's by the openings, bright by
   * day, a dim blue by night; and the sun's, or the moon's once it has set, shining in where it truly can
   * (caveSunShare), the shaft of it down the skylight's well slanting as it goes over; by day the water
   * it falls on lights the dome's walls a little.
   */
  setLight(look: SkyLook): void {
    const day = 1 - look.night;
    // The sky's light, as it lights the island's ground (its hemisphere light, sky side, as a diffuse
    // surface takes it): blue by day as the sky is, a dim blue by night; the share of it each point of
    // the rock sees by the openings is baked into the rock.
    caveLight.uCaveSky.value.copy(look.hemiSky).multiplyScalar(look.hemiIntensity / Math.PI);
    const sun = look.sunDir.y > 0.02;
    this.sunUp = sun;
    const way = sun ? look.sunDir : look.moonDir;
    caveLight.uSunWay.value.copy(way);
    const up = smooth(0.0, 0.12, way.y);
    this.sunIn = up;
    // The sun's (or the moon's) light, as it lights the island's ground.
    caveLight.uSunLight.value.copy(look.light).multiplyScalar((look.lightIntensity / Math.PI) * up);
    // The shaft: along the light's way, as strong as the light that comes down it.
    const y = Math.max(way.y, 0.25);
    this.beamSlant.value.set(-way.x / y, -way.z / y);
    this.beam.value = (sun ? 0.1 : 0.05) * up;
    this.beamColour.value.copy(look.light).multiplyScalar(0.9 / Math.max(look.light.r, look.light.g, look.light.b, 0.01));
    // The lake's glow on the rock round it; and by day the water the sun falls on, under the well, lights
    // the walls round it.
    caveLight.uCaveGlow.value
      .copy(LAKE_ON_ROCK)
      .multiplyScalar(caveLight.uLakeGlow.value.b / LAKE_GLOW)
      .add(_bounce.copy(caveLight.uSunLight.value).multiply(SUNLIT_WATER).multiplyScalar(day * (sun ? 1 : 0)));
    if (this.dark) this.putOut();
  }

  /**
   * For proving that nothing in the cave gives light of its own: with `on`, every source of its light
   * (caveLight) is put out, and the flames with them, until it is called off; whatever in the cave
   * still shows lit then is light from nowhere (the dev tools' caveDark renders and finds it).
   */
  darkTest(on: boolean): void {
    this.dark = on;
    if (on) {
      this.kept ??= {
        ambient: caveLight.uCaveAmbient.value.clone(),
        floor: caveLight.uCaveFloor.value.clone(),
        lake: caveLight.uLakeGlow.value.clone(),
      };
      this.putOut();
      return;
    }
    if (this.kept) {
      caveLight.uCaveAmbient.value.copy(this.kept.ambient);
      caveLight.uCaveFloor.value.copy(this.kept.floor);
      caveLight.uLakeGlow.value.copy(this.kept.lake);
      this.kept = null;
    }
    for (const m of flames) m.visible = true;
  }

  /** Every source of the cave's light out (see darkTest). */
  private putOut(): void {
    for (const c of [caveLight.uCaveAmbient, caveLight.uCaveFloor, caveLight.uCaveSky, caveLight.uCaveGlow, caveLight.uLakeGlow, caveLight.uSunLight]) {
      c.value.setRGB(0, 0, 0);
    }
    for (const l of caveLight.uTorch.value) l.set(0, 0, 0, 0);
    for (const l of this.lights) l.set(0, 0, 0, 0);
    this.beam.value = 0;
    this.sunIn = 0;
    for (const m of flames) m.visible = false;
  }

  /** Whether what is seen at `to` from `from`, in the cave, is out of it: the line between them passes
   * out through its mouth's arch or up through the top of its skylight's well, or it is at the well's
   * rim (the island's ground and plants round it, out under the sky). */
  seenOut(from: THREE.Vector3, to: THREE.Vector3): boolean {
    const arch = this.info.arch;
    if (arch) {
      const [ax, ay, az] = arch.foot;
      const [fx, fz] = arch.facing;
      const lean = arch.lean ?? 0;
      const a = (from.x - ax) * fx + (from.z - az) * fz + lean * (from.y - ay);
      const b = (to.x - ax) * fx + (to.z - az) * fz + lean * (to.y - ay);
      if (a < 0 && b > 0) {
        const t = a / (a - b);
        const across = Math.abs((from.x + (to.x - from.x) * t - ax) * -fz + (from.z + (to.z - from.z) * t - az) * fx);
        const up = from.y + (to.y - from.y) * t - ay;
        if (across < arch.half + 1 && up > -1 && up < arch.height + 1) return true;
      }
    }
    const well = this.info.well;
    if (well) {
      const [wx, wy, wz, r] = well.top;
      if (to.y > wy - 1.2 && Math.hypot(to.x - wx, to.z - wz) < r + 1.5) return true;
      if (from.y < wy && to.y > wy) {
        const t = (wy - from.y) / (to.y - from.y);
        if (Math.hypot(from.x + (to.x - from.x) * t - wx, from.z + (to.z - from.z) * t - wz) < r + 1) return true;
      }
    }
    return false;
  }

  /** How much of the sun (or the moon) reaches (x, y, z): as caveSunShare does for the rock. */
  sunShare(x: number, y: number, z: number): number {
    const l = caveLight.uSunWay.value;
    const top = caveLight.uWellTop.value;
    const foot = caveLight.uWellFoot.value;
    let well = 0;
    if (l.y > 0.02 && y < top.y && Math.hypot(x - top.x, z - top.z) < caveLight.uDomeReach.value) {
      const tt = (top.y - y) / l.y;
      well = smooth(top.w, top.w - 0.5, Math.hypot(x + l.x * tt - top.x, z + l.z * tt - top.z));
      if (y < foot.y) {
        const tf = (foot.y - y) / l.y;
        well *= smooth(foot.w, foot.w - 0.5, Math.hypot(x + l.x * tf - foot.x, z + l.z * tf - foot.z));
      }
    }
    let mouth = 0;
    const a = caveLight.uArchFoot.value;
    const w = caveLight.uArchWay.value;
    const lean = caveLight.uArchLean.value;
    const outward = l.x * w.x + l.z * w.y + lean * l.y;
    const inward = (a.x - x) * w.x + (a.z - z) * w.y - lean * (y - a.y);
    if (outward > 0.02 && inward > -0.3 && inward < w.w) {
      const t = inward / outward;
      const qx = x + l.x * t;
      const qy = y + l.y * t;
      const qz = z + l.z * t;
      const across = Math.abs((qx - a.x) * -w.y + (qz - a.z) * w.x) / a.w;
      const upFrac = (qy - a.y) / w.z;
      const room = upFrac < 0.45 ? 1 - across : 1 - Math.hypot(across, (upFrac - 0.45) / 0.55);
      mouth = smooth(0, 0.06, room) * (upFrac >= 0 ? 1 : 0) * smooth(w.w, w.w - 2, inward);
    }
    return Math.max(well, mouth);
  }

  /**
   * Each frame: the torch carried through the cave (where its flame is, or null), the boat's (or
   * null), the fire's flicker; and whether the camera can see any of it (see seen).
   */
  update(time: number, camera: THREE.Camera, torch: THREE.Vector3 | null, boatTorch: THREE.Vector3 | null): void {
    this.group.visible = this.seen(camera);
    const flicker = (k: number) => 0.9 + 0.06 * Math.sin(time * 9.1 + k) + 0.04 * Math.sin(time * 23.7 + k * 2.3);
    const lights = caveLight.uTorch.value;
    const colours = caveLight.uTorchColour.value;
    const place = (i: number, at: THREE.Vector3 | null, reach: number) => {
      if (at) lights[i].set(at.x, at.y, at.z, reach * flicker(i * 3.1));
      else lights[i].set(0, 0, 0, 0);
      colours[i].copy(i === 1 ? FIRE_COLOUR : TORCH_COLOUR);
    };
    place(0, torch, TORCH_REACH);
    const [fx, fy, fz] = this.info.fire;
    place(1, _fire.set(fx, fy, fz), FIRE_REACH);
    place(2, boatTorch, TORCH_REACH);
    for (let i = 0; i < CAVE_LIGHTS; i++) this.lights[i].copy(lights[i]);
    if (this.dark) this.putOut();
  }

  /** Whether (x, y, z) is inside the cave (under its rock, or in the dome): for naming the place, the
   * torch and the light on whoever is there. */
  isInside(x: number, y: number, z: number): boolean {
    const k = this.grid.at(x, z);
    if (k < 0 || this.grid.inside[k] !== 1) return false;
    // Under the skylight there is no ceiling: inside is below the well's top, not up on the spur by it.
    const top = this.grid.ceiling[k] >= OPEN ? this.info.dome.top - 1 : this.grid.ceiling[k] - 0.4;
    return y < top && y > this.grid.floor[k] - 2;
  }

  /**
   * What of the outside can be seen from (x, y, z), for the camera: everything (null) from outside the
   * cave or near enough its mouth to see out of it; from deeper in, only what is near the skylight, up
   * whose well the jungle round its edge shows (its middle and how far round it).
   */
  lookout(x: number, y: number, z: number): { x: number; z: number; r: number } | null {
    if (!this.isInside(x, y, z)) return null;
    const [mx, mz] = this.info.mouth.centre;
    if (Math.hypot(x - mx, z - mz) < LOOK_OUT) return null;
    const [cx, cz] = this.info.dome.centre;
    return { x: cx, z: cz, r: SKYLIGHT_VIEW };
  }

  /**
   * Whether the camera can see into the cave: from near it, or through its mouth or the skylight's
   * opening, wherever they are in its view. From outside it shows only through them, but from any way
   * off: drawn only within 45 m of it, it had left them open onto the sky through the rock and the
   * ground beyond that. Drawn from afar it costs little (on the dev PC, 2026-10-21, 0.07 ms from the
   * beach, 0.11 over the skylight, 0.37 over the whole island, all within the timings' noise).
   */
  private seen(camera: THREE.Camera): boolean {
    if (this.drawAll || this.bounds.distanceToPoint(camera.position) < 45) return true;
    camera.updateMatrixWorld();
    _frustum.setFromProjectionMatrix(_view.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
    return this.openings.some((opening) => _frustum.intersectsSphere(opening));
  }

  /** Whether (x, y, z) is in the cave or in the rock round it, under its roof (as the free camera can
   * be): what is seen from there is the cave's, not the jungle's. */
  encloses(x: number, y: number, z: number): boolean {
    if (this.isInside(x, y, z)) return true;
    const k = this.grid.at(x, z);
    if (k < 0 || Number.isNaN(this.grid.floor[k])) return false;
    const c = this.grid.ceiling[k];
    return c < OPEN && y > this.grid.floor[k] - 2 && y < c + 3;
  }

  /** How far into the cave (x, y, z) is, for the camera: 0 outside, rising over the first few steps in
   * from the mouth, 1 beyond (see caveUniform). */
  immersion(x: number, y: number, z: number): number {
    if (!this.encloses(x, y, z)) return 0;
    const [mx, mz] = this.info.mouth.centre;
    return smooth(0.5, 4, Math.hypot(x - mx, z - mz));
  }

  /**
   * The cave's light on someone at (x, y, z), as a colour to light them by (before the torches', which
   * light them from their side): the dark's blue, the outside's under the skylight and by the mouth, the
   * water's cyan under the dome.
   */
  lightOn(x: number, y: number, z: number, out: THREE.Color): THREE.Color {
    const t = this.termsAt(x, y, z, _terms);
    const sky = caveLight.uCaveSky.value;
    let heat = 0;
    for (const l of this.lights) {
      if (l.w <= 0) continue;
      const fall = Math.max(0, 1 - Math.hypot(l.x - x, l.y - y, l.z - z) / l.w);
      heat = Math.max(heat, fall * fall);
    }
    heat = Math.min(1, heat * 1.6);
    // The film paints the cast in the cave a pale glowing cyan, warmer by a torch: the painted dark's
    // light on them, as it is on the rock; and the lake's on them under the dome.
    const dark = caveLight.uCaveAmbient.value.b / PAINTED_DARK;
    const lake = caveLight.uLakeGlow.value.b / LAKE_GLOW;
    out.setRGB(0.36 + 0.08 * heat, 0.66 - 0.15 * heat, 0.95 - 0.3 * heat).multiplyScalar(dark);
    out.r += sky.r * t.y * 0.3;
    out.g += sky.g * t.y * 0.3 + 0.08 * t.z * lake;
    out.b += sky.b * t.y * 0.3 + 0.05 * t.z * lake;
    // Where the sun shines on them down the well or in at the mouth, lit as they would be outside, in
    // the island's own light at the hour; where the moon does, a little brighter.
    const shine = this.sunShare(x, y, z) * this.sunIn;
    if (shine > 0) {
      if (this.sunUp) out.lerp(sharedUniforms.uAmbient.value, shine);
      else out.multiplyScalar(1 + 0.2 * shine);
    }
    return out;
  }

  /** The cave's light terms at a point, as its rock's vertices carry them (see rockMaterial), for what
   * moves in it: how open it is (taken as fairly), how much of the outside's light reaches it (under the
   * skylight's well, by the mouth) and how much of the glowing water's (under the dome). */
  termsAt(x: number, y: number, z: number, out: THREE.Vector3): THREE.Vector3 {
    const [dx, dz] = this.info.dome.centre;
    const r = Math.hypot(x - dx, z - dz);
    const glow = smooth(this.info.dome.radius + 3, 3, r);
    const well = smooth(7.5, 4, r) * smooth(-1, 2, y - this.info.water);
    const [mx, mz] = this.info.mouth.centre;
    const mouth = smooth(7, 0.5, Math.hypot(x - mx, z - mz));
    return out.set(0.85, Math.min(1.2, 0.75 * well + 0.9 * mouth), glow);
  }

  /** The torches and the fire, as lights on someone at (x, y, z) (see FrameContext.firelight): the ways
   * to them and how much each warms them, into `out`, strongest first; where the strongest is into
   * `from`. */
  firelightOn(x: number, y: number, z: number, out: THREE.Vector4[], from: THREE.Vector3): number {
    const found: { w: number; x: number; y: number; z: number }[] = [];
    // In the sun's light a flame's warmth hardly shows.
    const daylit = this.sunUp ? 1 - 0.9 * this.sunShare(x, y, z) * this.sunIn : 1;
    for (const l of this.lights) {
      if (l.w <= 0) continue;
      const ddx = l.x - x;
      const ddy = l.y - y;
      const ddz = l.z - z;
      const d = Math.hypot(ddx, ddy, ddz);
      const fall = Math.max(0, 1 - d / l.w);
      if (fall <= 0) continue;
      found.push({ w: fall * fall * 0.6 * daylit, x: ddx / Math.max(d, 1e-3), y: ddy / Math.max(d, 1e-3), z: ddz / Math.max(d, 1e-3) });
      if (found.length === 1 || found[found.length - 1].w > found[0].w) from.set(l.x, l.y, l.z);
    }
    found.sort((a, b) => b.w - a.w);
    out.forEach((v, i) => {
      const f = found[i];
      if (f) v.set(f.x, f.y, f.z, Math.min(f.w, 1));
      else v.set(0, 0, 0, 0);
    });
    return 0;
  }
}

const _fire = new THREE.Vector3();
const _frustum = new THREE.Frustum();
const _view = new THREE.Matrix4();
const _terms = new THREE.Vector3();
const _bounce = new THREE.Color();
/** The flames burning in the cave (see caveFlameMaterial). */
const flames = new Set<THREE.Material>();
/** The lake's glow on the rock round it, as the film paints that rock (its navy a little lighter), with
 * the lake's glow as it is made (its blue, LAKE_GLOW); and the painted dark's blue as it is made, which
 * the cast's pale glow in the cave goes with. */
const LAKE_ON_ROCK = new THREE.Color(0.003, 0.03, 0.26);
const LAKE_GLOW = caveLight.uLakeGlow.value.b;
const PAINTED_DARK = caveLight.uCaveAmbient.value.b;

/** How strongly the sun's light (the island's, at the hour) shines in where it falls in the cave, and
 * the moon's; and how far in past the mouth's arch its light can reach before the passage bends. */
/** How much of the sun's light the sunlit water under the well gives back onto the dome's walls, in
 * its cyan. */
const SUNLIT_WATER = new THREE.Color(0.17, 0.26, 0.3);
const ARCH_REACH = 9;

function smooth(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}
