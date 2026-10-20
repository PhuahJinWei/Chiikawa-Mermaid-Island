import * as THREE from 'three';
import { loadGltf } from '../core/gltf';
import { windUniforms } from './Ink';
import { addCircle } from './Obstacles';

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
  /** The cavern's beach: where the boat lies drawn up on it (x, z), and where its water glows as it laps
   * at it (x, z, how far). */
  beach?: { boat: [number, number]; glow: [number, number, number] };
}

/** Deepest water a character wades into, the steepest floor they walk up (rise per metre) and the
 * highest step up, as on the island's ground (Island.ts). */
const WADE = 0.25;
const STEEPEST = 1.0;
const STEP_UP = 0.35;
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
    // Where a walker may go: floor not under deep water, with room over it, not too steep, and not
    // within MARGIN of a wall or the foot of a drop.
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
    const r = Math.ceil(MARGIN / this.cell);
    for (let j = 0; j < this.nz; j++) {
      for (let i = 0; i < this.nx; i++) {
        const k = j * this.nx + i;
        if (!ok[k]) continue;
        let clear = true;
        for (let b = -r; b <= r && clear; b++) {
          for (let a = -r; a <= r; a++) {
            if ((a * a + b * b) * this.cell * this.cell > MARGIN * MARGIN + 1e-6) continue;
            const kk = this.index(i + a, j + b);
            if (kk < 0) continue;
            const ff = this.floor[kk];
            if (this.wall[kk] || (!Number.isNaN(ff) && ff - this.floor[k] > STEP_UP)) {
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
 * The cave's light, shared by its rock, its water and its boat: the dark's own deep blue (on its walls,
 * and brighter on what faces up), the outside's light as it comes in by the skylight and the mouth (by
 * day bright, by night the moon's), the glowing water's cyan, and the torches and the fire (xyz where, w
 * how far they reach; 0 when out). Measured on the film's frames: walls a near-black navy, floors and
 * the tops of stones a royal blue, the rock round the lake a little lighter (`cave interior 1`, `2`, `4`).
 */
export const caveLight = {
  uCaveAmbient: { value: new THREE.Color(0.003, 0.016, 0.11) },
  uCaveFloor: { value: new THREE.Color(0.006, 0.05, 0.38) },
  uCaveSky: { value: new THREE.Color(0.3, 0.4, 0.7) },
  uCaveGlow: { value: new THREE.Color(0.003, 0.03, 0.26) },
  uTorch: { value: Array.from({ length: CAVE_LIGHTS }, () => new THREE.Vector4()) },
  uTorchColour: { value: Array.from({ length: CAVE_LIGHTS }, () => new THREE.Color()) },
  uTime: windUniforms.uTime,
};

/** The torches' and the fire's warmth: a flame's light, as the film paints it on the cave's rock, a pale
 * warm cream (`cave interior 1`'s vault, `2`'s sand). */
export const TORCH_COLOUR = new THREE.Color(0.8, 0.72, 0.56);
/** How far a torch's light reaches, and the fire's: a small bright pool round it, the dark beyond. */
export const TORCH_REACH = 3.2;
export const FIRE_REACH = 2.6;
/** The fire's light: redder than a torch's, low on the cobbles round it, which it turns the film's warm
 * magenta against the cave's blue (`cave interior 7`). */
export const FIRE_COLOUR = new THREE.Color(0.95, 0.42, 0.2);

const LIGHT_GLSL = /* glsl */ `
uniform vec3 uCaveAmbient;
uniform vec3 uCaveFloor;
uniform vec3 uCaveSky;
uniform vec3 uCaveGlow;
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
        vec3 light = caveDark(n) * open + uCaveSky * lit.y + uCaveGlow * lit.z * (0.55 + 0.45 * open);
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
        vec3 col = clamp(vColour, 0.0, 1.0) * light;
        // Crystals catch the light and give a little of their own.
        col += uShine * vColour * (0.12 + 0.35 * lit.z);
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
 * it and how deep it is.
 */
function waterMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      ...caveLight,
      uDark: { value: new THREE.Color('#04103A') },
      uShallow: { value: new THREE.Color('#0B3C8C') },
      uGlowing: { value: new THREE.Color('#2FA6FF') },
      uSparkle: { value: new THREE.Color(0.85, 0.97, 1.0) },
      uBeach: { value: new THREE.Vector3(0, 0, 0) },
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
      uniform vec3 uDark;
      uniform vec3 uShallow;
      uniform vec3 uGlowing;
      uniform vec3 uSparkle;
      uniform vec3 uBeach;
      varying vec3 vInfo;
      varying vec3 vWorld;
      float hash2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      void main() {
        // The lake's glow, a disc bright out to about half its way to the wall, faded by the ledge; and,
        // half as bright, the water lapping at the cavern's beach (uBeach: where, how far), as the film's.
        float glow = smoothstep(0.62, 0.98, clamp(vInfo.x, 0.0, 1.0));
        glow = max(glow, 0.5 * smoothstep(uBeach.z, uBeach.z * 0.25, distance(vWorld.xz, uBeach.xy)));
        float sky = clamp(vInfo.y, 0.0, 2.0);
        float deep = clamp(vInfo.z, 0.0, 1.0);
        vec2 p = vWorld.xz;
        float t = uTime;
        // Slow ripples from three ways, wandering, so they never line up.
        vec2 q = p + 0.6 * vec2(sin(p.y * 0.37 + t * 0.21), sin(p.x * 0.41 - t * 0.17));
        float rip = (sin(dot(q, vec2(1.7, 0.9)) * 2.1 + t * 1.1) + sin(dot(q, vec2(-0.8, 1.6)) * 2.7 - t * 0.9)
                     + sin(dot(q, vec2(1.3, -1.4)) * 1.6 + t * 0.7)) / 3.0;
        vec3 col = mix(uShallow, uDark, smoothstep(0.01, 0.12, deep));
        float swell = sin(dot(p, vec2(0.21, 0.13)) + t * 0.15) * sin(dot(p, vec2(-0.11, 0.19)) - t * 0.11);
        col = mix(col, uGlowing * (0.9 + 0.05 * rip + 0.08 * swell), glow * glow * (3.0 - 2.0 * glow));
        col += uCaveSky * sky * 0.35;
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
        // Sparkles: in each cell of a fine grid one point, winking in its own time; seen from far off
        // (down the skylight) fewer of them, but each bigger, so they still show as the film's do.
        float far = smoothstep(8.0, 30.0, distance(cameraPosition, vWorld));
        vec2 cell = floor(p * 2.2);
        vec2 at = cell + vec2(hash2(cell), hash2(cell + 7.3));
        float d = length(p * 2.2 - at);
        float wink = pow(max(sin(t * (1.2 + hash2(cell + 3.1)) + hash2(cell + 1.7) * 6.28), 0.0), 12.0);
        float star = smoothstep(0.09 + 0.3 * far, 0.0, d) * wink * step(hash2(cell + 9.1), 1.0 - 0.7 * far);
        col += uSparkle * star * (0.25 + 1.6 * glow + 0.5 * length(warm));
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
}

/** Flames that make their own light, burning bright so the bloom halos them, wavering the more the
 * higher up the flame (which the colours tell), as Props.ts draws the torches' but lit at any hour. */
export function caveFlameMaterial(): THREE.MeshBasicMaterial {
  const material = new THREE.MeshBasicMaterial({ vertexColors: true });
  material.color.setRGB(3, 3, 3);
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
 * cave's light at where it is (`uHere`: how open, how much of the openings and the water it sees, set as
 * it moves) and the torches'.
 */
export function caveThingMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { ...caveLight, uHere: { value: new THREE.Vector3(1, 0, 0) } },
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
      uniform vec3 uHere;
      varying vec3 vColour;
      varying vec3 vWorld;
      varying vec3 vNormal;
      void main() {
        vec3 n = normalize(vNormal) * (gl_FrontFacing ? 1.0 : -1.0);
        float up = 0.6 + 0.4 * n.y;
        vec3 light = (uCaveAmbient * (0.3 + 0.7 * uHere.x) + uCaveSky * uHere.y + uCaveGlow * uHere.z * 0.6) * up;
        light += caveTorches(vWorld, n) * 0.8;
        gl_FragColor = vec4(min(clamp(vColour, 0.0, 1.0) * light, vec3(1.1)), 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
}

// ---------------------------------------------------------------------------- what drifts in the dome
/** Motes of light drifting over the glowing water under the dome, winking, as the film's (`cave interior
 * 2`, `4`, `5`). */
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
    uniforms: { uTime: windUniforms.uTime, uColour: { value: new THREE.Color(0.75, 0.95, 1.0) }, uScale: { value: 1 } },
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
      varying float vWink;
      void main() {
        vec2 q = gl_PointCoord - 0.5;
        float r = length(q);
        float star = smoothstep(0.5, 0.0, r) * 0.6 + smoothstep(0.08, 0.0, min(abs(q.x), abs(q.y))) * smoothstep(0.5, 0.1, r) * 0.5;
        gl_FragColor = vec4(uColour * star * vWink * 2.0, 1.0);
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  return points;
}

/** A thin mist lying on the glowing water under the dome, drifting, and the light coming down the
 * skylight's well onto it: soft, added light, stronger by day. */
function mistAndBeam(centre: [number, number], radius: number, water: number, top: number): { group: THREE.Group; strength: THREE.IUniform<number> } {
  const strength = { value: 0.1 };
  const group = new THREE.Group();
  const mist = new THREE.ShaderMaterial({
    uniforms: { uTime: windUniforms.uTime, uColour: { value: new THREE.Color(0.2, 0.45, 1.0) }, uStrength: { value: 0.12 } },
    vertexShader: /* glsl */ `
      varying vec2 vP;
      varying float vAlong;
      void main() {
        vP = position.xy;
        vec4 wp = modelMatrix * vec4(position, 1.0);
        // How nearly along the sheet it is seen: mist shows where the eye looks through a lot of it.
        vAlong = 1.0 - abs(normalize(cameraPosition - wp.xyz).y);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uColour;
      uniform float uStrength;
      varying vec2 vP;
      varying float vAlong;
      float wisp(vec2 p) { return 0.5 + 0.25 * sin(p.x * 0.9 + uTime * 0.12) * sin(p.y * 1.1 - uTime * 0.09) + 0.25 * sin(p.x * 0.37 - p.y * 0.53 + uTime * 0.05); }
      void main() {
        float r = length(vP) / ${(radius * 1.05).toFixed(2)};
        float a = smoothstep(1.0, 0.45, r) * wisp(vP) * uStrength * pow(vAlong, 6.0);
        gl_FragColor = vec4(uColour * a, 1.0);
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
  for (const [dy, spin] of [[0.12, 0.0], [0.35, 1.3], [0.7, 2.6]]) {
    const sheet = new THREE.Mesh(new THREE.CircleGeometry(radius * 1.05, 48), mist);
    sheet.rotation.set(-Math.PI / 2, 0, spin);
    sheet.position.set(centre[0], water + dy, centre[1]);
    group.add(sheet);
  }
  const beam = new THREE.ShaderMaterial({
    uniforms: { uStrength: strength, uColour: { value: new THREE.Color(0.8, 0.92, 1.0) } },
    vertexShader: /* glsl */ `
      varying vec3 vNormal;
      varying vec3 vView;
      varying float vUp;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vNormal = normalize(mat3(modelMatrix) * normal);
        vView = normalize(cameraPosition - wp.xyz);
        vUp = uv.y;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uStrength;
      uniform vec3 uColour;
      varying vec3 vNormal;
      varying vec3 vView;
      varying float vUp;
      void main() {
        float edge = pow(abs(dot(normalize(vNormal), vView)), 1.5);
        float a = edge * uStrength * smoothstep(0.0, 0.25, vUp) * (0.55 + 0.45 * vUp);
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
  group.add(shaft);
  return { group, strength };
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
  private readonly motes: THREE.Points;
  private readonly bounds: THREE.Box3;
  /** The lights moving or burning in the cave this frame: where each is and how far it reaches. */
  private readonly lights = Array.from({ length: CAVE_LIGHTS }, () => new THREE.Vector4());

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
    const water = waterMaterial();
    // The cavern's beach: its water glows a little where it laps at the sand.
    water.uniforms.uBeach.value.fromArray(info.beach?.glow ?? [-176.8, -123.2, 5.5]);
    parts.water.material = water;
    this.group.add(parts.water);
    parts.fire.material = caveFlameMaterial();
    this.group.add(parts.fire);
    this.boatGeometry = parts.boat.geometry;
    this.oarGeometry = parts.oar.geometry;
    this.torchGeometry = parts.torch.geometry;
    this.torchFlameGeometry = parts.torchFlame.geometry;
    const { group, strength } = mistAndBeam(info.dome.centre, info.dome.radius, info.water, info.dome.top);
    this.beam = strength;
    this.group.add(group);
    this.motes = motes(info.dome.centre, info.dome.radius * 0.9, info.water);
    this.group.add(this.motes);
    for (const b of info.blocks) addCircle(b.circle[0], b.circle[1], b.circle[2], b.y[0], b.y[1], { camera: false });
    const { origin, cell, size } = info.grid;
    this.bounds = new THREE.Box3(
      new THREE.Vector3(origin[0], info.water - 4, origin[1]),
      new THREE.Vector3(origin[0] + cell * size[0], info.dome.top + 1, origin[1] + cell * size[1]),
    );
    caveLight.uTorchColour.value[1].copy(FIRE_COLOUR);
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

  /** The hour's light coming in: by day the sun's, bright; by night the moon's, a dim blue. */
  setHour(night: number): void {
    const day = 1 - night;
    caveLight.uCaveSky.value.setRGB(0.01 + 1.2 * day, 0.03 + 1.1 * day, 0.22 + 0.98 * day);
    this.beam.value = 0.05 + 0.12 * day;
  }

  /**
   * Each frame: the torch carried through the cave (where its flame is, or null), the boat's (or
   * null), the fire's flicker; and whether the camera is near enough to see any of it.
   */
  update(time: number, camera: THREE.Camera, torch: THREE.Vector3 | null, boatTorch: THREE.Vector3 | null): void {
    const near = this.bounds.distanceToPoint(camera.position) < 45;
    this.group.visible = near;
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

  /** How far into the cave (x, y, z) is, for the camera: 0 outside, rising over the first few steps in
   * from the mouth, 1 beyond (see caveUniform). */
  immersion(x: number, y: number, z: number): number {
    if (!this.isInside(x, y, z)) return 0;
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
    out.setRGB(0.36 + 0.08 * heat, 0.66 - 0.15 * heat, 0.95 - 0.3 * heat);
    out.r += sky.r * t.y * 0.3;
    out.g += sky.g * t.y * 0.3 + 0.08 * t.z;
    out.b += sky.b * t.y * 0.3 + 0.05 * t.z;
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
    for (const l of this.lights) {
      if (l.w <= 0) continue;
      const ddx = l.x - x;
      const ddy = l.y - y;
      const ddz = l.z - z;
      const d = Math.hypot(ddx, ddy, ddz);
      const fall = Math.max(0, 1 - d / l.w);
      if (fall <= 0) continue;
      found.push({ w: fall * fall * 0.6, x: ddx / Math.max(d, 1e-3), y: ddy / Math.max(d, 1e-3), z: ddz / Math.max(d, 1e-3) });
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
const _terms = new THREE.Vector3();

function smooth(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}
