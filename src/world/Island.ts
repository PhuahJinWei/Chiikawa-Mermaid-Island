import * as THREE from 'three';
import { loadGltf } from '../core/gltf';
import { sharedUniforms } from '../characters/CharacterMaterial';
import { fireLights } from './Firelight';
import { PEN_GLSL, inkUniforms } from './Ink';
import { FILM, coverTrees, hazeClearing, paintedRamp, shadeUnderTrees } from './Look';
import type { CaveGrid } from './Cave';
import { addCircle, addPad, blocked, blockedInAir, cameraBlocked, deckUnder, deeper, outlineAt } from './Obstacles';

/** What art/blender/build_island.py writes into the ground's glTF extras. */
export interface TerrainInfo {
  version: number;
  /** The map is a square this many metres across, starting at `origin` (x, z: its north-west corner). */
  size: number;
  origin: [number, number];
  /** The sea's surface height. */
  water: number;
  /** Ground heights on a grid x grid square over the map, as 16-bit values between min and max;
   * `predicted`: each stored less what its neighbours predict (see unpredict). */
  height: { url: string; grid: number; min: number; max: number; predicted?: boolean };
  /** The painted colour map, laid over the whole square from above. */
  colours: string;
  /** Where grass (red), bare earth (green: the paths, the village's clearing, the festival's street,
   * steep ground) and sand (blue) lie, mapped as the colours are; the rest is fields, the waterfall
   * pool's bank and the rivers' edges. The film look paints its grass and earth from it. */
  kinds?: string;
  /** How thickly stones fallen from the rocks lie (red, 0 to 1), at their feet and over the steep
   * ground under the cliffs, mapped as the colours are. The film look paints the stones from it. */
  scree?: string;
  /** A cave's skylight, if the island has one: a round opening in the ground like a well's mouth,
   * cut out of the ground's mesh, over a dome with the sea come in under the island at its foot. Its
   * middle (x, z) and radius, its edge wandering from round by a few waves (how many times round, how
   * far as a share of the radius, where each starts; see skylightEdge); about how far the dome
   * reaches from the middle at the water, and its floor under the water. */
  skylight?: { centre: [number, number]; radius: number; lumps: [number, number, number][]; dome: number; floor: number };
  /** The forbidden cave's inside, under the outcrop and the spur (see Cave.ts). */
  cave?: { url: string };
  /** The bay's quay, if the island has one: the line its water's edge runs along, at the timber wall
   * and on past its ends (points x, z evenly about a metre apart from west to east, the sea to the
   * south); where the timber stands (`ends`, x), and how far beyond them the quay eases into the
   * beach round it. See quayFloor. */
  quay?: { line: [number, number][]; ends: [number, number]; feather: number };
  /** The rock landmarks, the sea cliffs and the waterfall, built with the ground. */
  landmarks: string;
  /** Each rock's foot: its middle (x, z), and how far it reaches at even angles round it from east toward south;
   * a bare rock's top too (with whatever lies on it), which the camera may pass over. */
  rocks: { centre: [number, number]; outline: number[]; top?: number }[];
  /** The jungle waterfall's pool: its water stands at `level` within `radius` of `centre` (x, z). */
  pool?: { centre: [number, number]; radius: number; level: number };
  /** Where the waterfall lands in its pool (x, z), and how far its splash spreads. */
  waterfall?: { foot: [number, number]; splash: number };
  /** The stepping stones across the gorge's river: pads to stand on (each pillar's top, and the
   * ledges walked on from the rims onto the end ones: a middle (x, z), an outline as `outlineAt`
   * reads it, a height), and each pillar's body to bump into between its bottom (the south end's
   * shelf juts out over the riverside path) and its top. */
  stones?: {
    pads: { centre: [number, number]; outline: number[]; top: number }[];
    pillars: { centre: [number, number]; radius: number; bottom: number; top: number }[];
  };
  /** The jungle and the crops: the meshes, each trunk (x, z, radius) and each crown (x, y, z,
   * radius), and the flowering bushes butterflies flutter round (x, y, z). */
  plants: {
    url: string;
    trunks: [number, number, number][];
    crowns: [number, number, number, number][];
    butterflies: [number, number, number][];
    /** How many patches across the map the canopy and the understory are joined into. */
    patches: { canopy: number; understory: number };
    /** Where each copy of a plant planted many times stands: its shape, x, y, z, turn, scale, and a
     * palm's far shape. */
    placed: { palms?: number[][]; under?: number[][] };
  };
}

/** The colour of the water at its very edge, where it is shallowest: in the film look pale and clear,
 * as the film paints shallow water over its sand. */
export const WATER_EDGE = FILM ? '#9FDCE6' : '#45DFC8';

/**
 * GLSL: the ground's height at a point (x, z), from the island's height grid, filtered between
 * its samples (which sit on texel centres). Shaders using it set `uFloor` to the grid's texture
 * (see Terrain.texture) and `uMap` to the map's (origin x, origin z, size, samples per side).
 */
export const FLOOR_GLSL = /* glsl */ `
uniform sampler2D uFloor;
uniform vec4 uMap;
float floorAt(vec2 xz) {
  vec2 g = (xz - uMap.xy) / uMap.z * (uMap.w - 1.0);
  return texture2D(uFloor, (g + 0.5) / uMap.w).r;
}
// The same for the waterline, in full precision (the GPU's own filtering blends in steps of 1/256
// of a sample, which would fray a line drawn along it) and smooth: blended between the four samples
// round it, the waterline bends at every sample's edge, which shows along a beach as small corners a
// metre or so apart; a quadratic B-spline over the nine nearest draws it without them. On steep
// ground (a cliff's foot) and where the grid's green marks it (the quay's timber, see quayFloor), the
// four samples' blend is kept, as the line the ground's own edge is drawn to there.
float floorAtSmooth(vec2 xz) {
  vec2 g = clamp((xz - uMap.xy) / uMap.z * (uMap.w - 1.0), vec2(1.0), vec2(max(uMap.w - 2.001, 1.0)));
  ivec2 c = ivec2(floor(g + 0.5));
  vec2 u = g - vec2(c);
  vec3 wx = vec3(0.5 * (0.5 - u.x) * (0.5 - u.x), 0.75 - u.x * u.x, 0.5 * (0.5 + u.x) * (0.5 + u.x));
  vec3 wz = vec3(0.5 * (0.5 - u.y) * (0.5 - u.y), 0.75 - u.y * u.y, 0.5 * (0.5 + u.y) * (0.5 + u.y));
  vec3 r0 = vec3(texelFetch(uFloor, c + ivec2(-1, -1), 0).r, texelFetch(uFloor, c + ivec2(0, -1), 0).r,
                 texelFetch(uFloor, c + ivec2(1, -1), 0).r);
  vec3 r1 = vec3(texelFetch(uFloor, c + ivec2(-1, 0), 0).r, texelFetch(uFloor, c, 0).r,
                 texelFetch(uFloor, c + ivec2(1, 0), 0).r);
  vec3 r2 = vec3(texelFetch(uFloor, c + ivec2(-1, 1), 0).r, texelFetch(uFloor, c + ivec2(0, 1), 0).r,
                 texelFetch(uFloor, c + ivec2(1, 1), 0).r);
  float curved = dot(wz, vec3(dot(wx, r0), dot(wx, r1), dot(wx, r2)));
  // The four samples round it, blended plainly.
  bool east = u.x >= 0.0;
  bool south = u.y >= 0.0;
  vec3 rowA = south ? r1 : r0;
  vec3 rowB = south ? r2 : r1;
  vec2 a = east ? rowA.yz : rowA.xy;
  vec2 b = east ? rowB.yz : rowB.xy;
  vec2 f = vec2(east ? u.x : 1.0 + u.x, south ? u.y : 1.0 + u.y);
  float plain = mix(mix(a.x, a.y, f.x), mix(b.x, b.y, f.x), f.y);
  float steep = length(vec2(r1.z - r1.x, r2.y - r0.y)) / (2.0 * uMap.z / (uMap.w - 1.0));
  float keep = max(texture2D(uFloor, (g + 0.5) / uMap.w).g, smoothstep(0.9, 1.6, steep));
  return mix(curved, plain, keep);
}
`;

/** How far a cave skylight's edge lies from its middle toward (dx, dz). */
export function skylightEdge(sky: NonNullable<TerrainInfo['skylight']>, dx: number, dz: number): number {
  const a = Math.atan2(dz, dx);
  let k = 1;
  for (const [n, amp, phase] of sky.lumps) k += amp * Math.sin(n * a + phase);
  return sky.radius * k;
}

/** Deepest water a character wades into, and the steepest ground they walk up (rise per metre). */
const WADE = 0.25;
const STEEPEST = 1.0;
/** How close a character's middle comes to a rock's face, a prop's foot or the skylight's edge, and the camera's. */
const ROCK_MARGIN = 0.35;
const PROP_MARGIN = 0.25;
const EDGE_MARGIN = 0.3;
const CAMERA_MARGIN = 0.3;
/** The highest step a character walks up, onto a deck or a stair. */
const STEP_UP = 0.35;
/** How steeply the floor the shaders see falls through the water's surface across the quay's line
 * (metres per metre): gently enough that every square of the height grid the line crosses lies on
 * the slope, which then filters into a straight crossing along the line. It meets the sand 1.4 m in
 * from the line and the sea floor at the timber's foot about 2 m out (less toward its ends, where the
 * water shallows), well within QUAY_REACH. */
const QUAY_FALL = 0.6;
const QUAY_REACH = 5;

/**
 * The height grid as the ground's and the water's shaders see it: the same, but along the quay (see
 * TerrainInfo.quay), where the sand drops sheer into the water inside the timber. Filtered between
 * samples a metre apart, a sheer drop crosses the water's surface in steps from sample to sample:
 * the water would stop short of the timber in places, leaving holes along it, and paint the sand by
 * it as water in others, and its surf would zigzag. Here the floor falls through the surface along
 * the quay's line at an even slope instead, so the water meets the timber in a straight line and its
 * surf runs along it. Walking keeps the true heights. Also how far the shaders keep the plain blend
 * between four samples for the waterline there (`plain`, 0 to 1; see floorAtSmooth), which draws the
 * slope's crossing exactly where the smoother filter would round it off where the slope meets the
 * sand and the sea floor.
 */
function quayFloor(heights: Float32Array, info: TerrainInfo): { floor: Float32Array; plain: Float32Array } {
  const floor = Float32Array.from(heights);
  const plain = new Float32Array(heights.length);
  const quay = info.quay;
  if (!quay || quay.line.length < 2) return { floor, plain };
  const { size, origin, water } = info;
  const n = info.height.grid;
  const step = size / (n - 1);
  const { line, ends, feather } = quay;
  const west = line[0][0];
  const spacing = (line[line.length - 1][0] - west) / (line.length - 1);
  const smooth = THREE.MathUtils.smoothstep;
  for (let i = 0; i < n; i++) {
    const x = origin[0] + i * step;
    const at = (x - west) / spacing;
    if (at < 0 || at > line.length - 1) continue;
    const full = smooth(x, ends[0] - feather, ends[0]) * (1 - smooth(x, ends[1], ends[1] + feather));
    if (full <= 0) continue;
    const k = Math.min(Math.floor(at), line.length - 2);
    const [x0, z0] = line[k];
    const [x1, z1] = line[k + 1];
    const zLine = z0 + (z1 - z0) * (at - k);
    // Metres across the line for each metre north of it.
    const across = Math.cos(Math.atan2(z1 - z0, x1 - x0));
    const j0 = Math.max(0, Math.floor((zLine - QUAY_REACH - origin[1]) / step));
    const j1 = Math.min(n - 1, Math.ceil((zLine + QUAY_REACH - origin[1]) / step));
    for (let j = j0; j <= j1; j++) {
      const inland = (zLine - (origin[1] + j * step)) * across;
      const fall = water + QUAY_FALL * inland;
      const k2 = j * n + i;
      const h = heights[k2];
      // Down to the surface at the line from the sand, up to it from the sea floor; the sample on
      // the drop itself, a hair from the line, at the surface.
      const shaded = inland >= 0 ? Math.min(Math.max(h, water), fall) : Math.max(Math.min(h, water), fall);
      floor[k2] = h + (shaded - h) * full;
      plain[k2] = full * (1 - smooth(Math.abs(inland), QUAY_REACH - 2, QUAY_REACH));
    }
  }
  return { floor, plain };
}

/** The island's ground, built in Blender: heights to walk on, and the mesh to draw. */
export class Terrain {
  /** Heights for shaders: the same grid, filtered between samples (red; see quayFloor), and where
   * their waterline keeps the plain filter (green; see floorAtSmooth). */
  readonly texture: THREE.DataTexture;
  /** Each rock's foot, with its furthest reach for a quick first test. */
  private readonly rocks: { x: number; z: number; outline: number[]; reach: number; top: number }[];
  /** Sand's share of the ground on a grid over the map, 0 to 255, and how many samples it has across (see
   * readKinds); null until read. */
  private sand: Uint8Array | null = null;
  private sandSize = 0;

  constructor(
    readonly info: TerrainInfo,
    private readonly heights: Float32Array,
    readonly mesh: THREE.Mesh,
  ) {
    const n = info.height.grid;
    const { floor, plain } = quayFloor(heights, info);
    const half = new Uint16Array(n * n * 2);
    for (let i = 0; i < n * n; i++) {
      half[2 * i] = THREE.DataUtils.toHalfFloat(floor[i]);
      half[2 * i + 1] = THREE.DataUtils.toHalfFloat(plain[i]);
    }
    this.texture = new THREE.DataTexture(half, n, n, THREE.RGFormat, THREE.HalfFloatType);
    this.texture.magFilter = THREE.LinearFilter;
    this.texture.minFilter = THREE.LinearFilter;
    this.texture.needsUpdate = true;
    this.rocks = info.rocks.map((r) => ({
      x: r.centre[0],
      z: r.centre[1],
      outline: r.outline,
      reach: Math.max(...r.outline),
      top: r.top ?? Infinity,
    }));
  }

  /** Ground height under (x, z), between the grid's samples; the deep sea floor off the map. */
  height(x: number, z: number): number {
    const { size, origin } = this.info;
    const n = this.info.height.grid;
    const gx = ((x - origin[0]) / size) * (n - 1);
    const gz = ((z - origin[1]) / size) * (n - 1);
    if (gx < 0 || gz < 0 || gx > n - 1 || gz > n - 1) return this.info.height.min;
    const i = Math.min(Math.floor(gx), n - 2);
    const j = Math.min(Math.floor(gz), n - 2);
    const fx = gx - i;
    const fz = gz - j;
    const h = this.heights;
    const a = h[j * n + i] + (h[j * n + i + 1] - h[j * n + i]) * fx;
    const b = h[(j + 1) * n + i] + (h[(j + 1) * n + i + 1] - h[(j + 1) * n + i]) * fx;
    return a + (b - a) * fz;
  }

  /** How much of the ground at (x, z) is sand, 0 to 1, by the map of kinds the film look paints it by (see
   * readKinds), and down by the water where the map gives out (PRINT_SHORE): where prints show (see
   * Footprints.ts). None off the map, or before the map has been read. */
  sandAt(x: number, z: number): number {
    const sand = this.sand;
    if (!sand) return 0;
    const n = this.sandSize;
    const i = Math.floor(((x - this.info.origin[0]) / this.info.size) * n);
    const j = Math.floor(((z - this.info.origin[1]) / this.info.size) * n);
    if (i < 0 || j < 0 || i >= n || j >= n) return 0;
    const share = sand[j * n + i];
    if (share === KINDLESS) return this.height(x, z) - this.info.water < PRINT_SHORE.to ? 1 : 0;
    return share / (KINDLESS - 1);
  }

  /** Reads where the sand lies from the map of kinds' picture (see TerrainInfo.kinds), as GROUND_PAINT reads
   * it: sand's share of the bare ground, where there is no grass; KINDLESS where the map has none at all. */
  readKinds(image: HTMLImageElement | ImageBitmap): void {
    const n = image.width;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = n;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) return;
    context.drawImage(image, 0, 0, n, n);
    const data = context.getImageData(0, 0, n, n).data;
    const sand = new Uint8Array(n * n);
    for (let k = 0; k < n * n; k++) {
      const grass = data[4 * k];
      const earth = data[4 * k + 1];
      const bare = data[4 * k + 2];
      // (As GROUND_PAINT: none of the kinds is under 5% of them all together.)
      if (grass + earth + bare < 13) sand[k] = KINDLESS;
      else sand[k] = earth + bare > 3 ? Math.round(((255 - grass) * bare * (KINDLESS - 1)) / ((earth + bare) * 255)) : 0;
    }
    this.sand = sand;
    this.sandSize = n;
  }

  /** The surface of whatever water is at (x, z): the waterfall pool's, or the sea's. */
  waterLevel(x: number, z: number): number {
    const pool = this.info.pool;
    if (pool && Math.hypot(x - pool.centre[0], z - pool.centre[1]) < pool.radius + 1) return pool.level;
    return this.info.water;
  }

  /** Whether (x, z) is within `margin` metres of a rock's foot; for the camera at height `y`, of a rock
   * it is not over the top of. */
  nearRock(x: number, z: number, margin: number, y = -Infinity): boolean {
    for (const rock of this.rocks) {
      if (y > rock.top + margin) continue;
      const dx = x - rock.x;
      const dz = z - rock.z;
      const d = Math.hypot(dx, dz);
      if (d > rock.reach + margin) continue;
      if (d < outlineAt(rock.outline, dx, dz) + margin) return true;
    }
    return false;
  }

  /** Whether (x, z) is in the cave skylight's opening, or within `margin` metres of its edge. */
  nearSkylight(x: number, z: number, margin: number): boolean {
    const sky = this.info.skylight;
    if (!sky) return false;
    const dx = x - sky.centre[0];
    const dz = z - sky.centre[1];
    const d = Math.hypot(dx, dz);
    return d < sky.radius * 1.2 + margin && d < skylightEdge(sky, dx, dz) + margin;
  }

  /**
   * Whether a character whose feet were at `feet` can stand at (x, z): not bumping into a rock or
   * a prop, nor at the cave skylight's edge, and either on a deck they can step onto, or on ground
   * that is not under water deeper than a wade nor up a cliff. `pad` keeps them that much further from
   * what they would bump into (for finding the way, see standAt).
   */
  walkable(x: number, z: number, feet: number, pad = 0): boolean {
    if (this.nearRock(x, z, ROCK_MARGIN + pad) || this.nearSkylight(x, z, EDGE_MARGIN + pad)) return false;
    const ground = this.height(x, z);
    const deck = deckUnder(x, z, feet + STEP_UP);
    const stand = deck !== null && deck > ground ? deck : ground;
    if (blocked(x, z, PROP_MARGIN + pad, stand)) return false;
    if (deck !== null && deck > ground) return true;
    const h = ground;
    if (h < this.waterLevel(x, z) - WADE) return false;
    const e = 0.5;
    const gx = (this.height(x + e, z) - this.height(x - e, z)) / (2 * e);
    const gz = (this.height(x, z + e) - this.height(x, z - e)) / (2 * e);
    return Math.hypot(gx, gz) <= STEEPEST;
  }
}

/** The waterfall pool as a shader uniform: middle (x, z), the reach of its water, its level. */
export function poolUniform(info: TerrainInfo): THREE.Vector4 {
  const pool = info.pool;
  return pool
    ? new THREE.Vector4(pool.centre[0], pool.centre[1], pool.radius + 1, pool.level)
    : new THREE.Vector4(0, 0, 0, info.water);
}

/**
 * The ground's look: the painted colour map, flat like the film's backgrounds, and the
 * waterline drawn with the world's pen on the sand and round the waterfall's pool. The waterline
 * follows the height grid, the same smooth edge the water stops at and characters wade to. The
 * ground sits a hair back in the depth test, so outlines where things touch it (feet, a log's
 * underside) are drawn over it.
 */
function groundMaterial(colours: THREE.Texture, info: TerrainInfo, floor: THREE.Texture): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
      ...inkUniforms,
      uAmbient: sharedUniforms.uAmbient,
      uColours: { value: colours },
      uFloor: { value: floor },
      uMap: { value: new THREE.Vector4(info.origin[0], info.origin[1], info.size, info.height.grid) },
      uEdge: { value: new THREE.Color(WATER_EDGE) },
      uSea: { value: info.water },
      uPool: { value: poolUniform(info) },
    },
    vertexShader: /* glsl */ `
      #include <common>
      #include <fog_pars_vertex>
      varying vec2 vUv;
      varying vec3 vWorld;
      varying float vDepth;
      void main() {
        vUv = uv;
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorld = wp.xyz;
        vec4 mvPosition = viewMatrix * wp;
        vDepth = -mvPosition.z;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      #include <common>
      #include <fog_pars_fragment>
      ${PEN_GLSL}
      ${FLOOR_GLSL}
      uniform sampler2D uColours;
      uniform vec3 uEdge;
      uniform vec3 uInk;
      uniform vec3 uAmbient;
      uniform float uSea;
      uniform vec4 uPool;
      varying vec2 vUv;
      varying vec3 vWorld;
      varying float vDepth;
      void main() {
        vec3 col = texture2D(uColours, vUv).rgb;
        float level = distance(vWorld.xz, uPool.xy) < uPool.z ? uPool.w : uSea;
        // Pixels above the waterline, measured across the slope; the pen draws the first few.
        float h = floorAt(vWorld.xz);
        if (abs(h - level) < 0.2) h = floorAtSmooth(vWorld.xz);
        float above = (h - level) / max(fwidth(h), 1e-5);
        // Under the water the ground is hidden, but where the two meet at a glancing angle a
        // sliver of it can show. Painted the colour of the water's edge, it reads as water.
        col = mix(col, uEdge, 1.0 - step(-0.5, above));
        float pen = penAt(vDepth);
        col = mix(col, uInk, (1.0 - smoothstep(pen - 0.5, pen + 0.5, above)) * step(-0.5, above));
        gl_FragColor = vec4(col * uAmbient, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
    fog: true,
    polygonOffset: true,
    polygonOffsetFactor: 8,
    polygonOffsetUnits: 8,
  });
}

/**
 * In the film look, the prints walked into the ground round the camera, which the ground paints where it is
 * sand (see GROUND_PAINT; Footprints.ts keeps them): their map, the middle of the square of ground it holds
 * (x, z) and where in the map that middle lies (u, v), and how many metres across the square is (0: none).
 */
export const printUniforms = {
  uPrints: { value: null as THREE.Texture | null },
  uPrintWindow: { value: new THREE.Vector4() },
  uPrintSpan: { value: 0 },
};
/** Sand from this far above the water up to this far is damp, from dry (metres): there prints are clearer, and
 * gone sooner (see Footprints.ts). */
export const PRINT_DAMP = { from: 0.15, to: 0.55 };
/** Down by the water the map of kinds gives out (the build leaves the wet edges of the shores, as of the
 * river, without any): there the ground is sand from this far above the water down (metres, fading in over
 * the first of them). */
export const PRINT_SHORE = { from: 0.45, to: 0.6 };
/** In Terrain's grid of sand (see readKinds), where the map of kinds has none at all. */
const KINDLESS = 255;
/** How much a fresh print darkens the sand, dry and damp. */
const PRINT_DRY = 0.1;
const PRINT_WET = 0.24;

/**
 * GLSL: the film's grass and earth, painted over the ground's colours where its map of kinds (see
 * TerrainInfo.kinds) says they lie. The lawn is clumps of grass, each a crown of blade tips, the
 * nearer over the farther; packed earth has long soft sweeps of the brush and a scatter of pebbles;
 * where the two meet, the border follows the clumps' tufted outlines. Bare ground painted grey (the
 * gorge's floor) is a bank of rounded pebbles. Prints walked into the sand (see printUniforms).
 */
const GROUND_PAINT_GLSL = /* glsl */ `
uniform sampler2D uKinds;
uniform sampler2D uPrints;
uniform vec4 uPrintWindow;
uniform float uPrintSpan;
// How deep a print walked into the ground at p is, 0 to 1, as fresh as it is (see printUniforms): its sole's
// edge is halfway down the slope its map holds round it, so it is drawn smooth however few texels it spans,
// and as it fades it shallows from its edge in. None toward the edge of the square the map holds, nor where
// a print is too small in the picture to draw without shimmering.
float printAt(vec2 p, float px) {
  vec2 d = p - uPrintWindow.xy;
  float reach = 0.5 * uPrintSpan;
  float seen = (1.0 - smoothstep(reach - 2.0, reach - 0.5, max(abs(d.x), abs(d.y)))) * (1.0 - smoothstep(0.04, 0.11, px));
  if (seen <= 0.0) return 0.0;
  return seen * smoothstep(0.25, 0.75, textureLod(uPrints, d / uPrintSpan + uPrintWindow.zw, 0.0).r);
}
vec3 groundHash(vec2 p) {
  vec3 q = vec3(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)), dot(p, vec2(419.2, 371.9)));
  return fract(sin(q) * 43758.5453);
}
float groundNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = p - i;
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(groundHash(i).x, groundHash(i + vec2(1.0, 0.0)).x, f.x),
             mix(groundHash(i + vec2(0.0, 1.0)).x, groundHash(i + vec2(1.0, 1.0)).x, f.x), f.y);
}
// Clumps of grass about 'scale' metres apart, two cells in three holding one: a light yellow-green
// patch, sharp blade tips along its top (the side away from the camera), rounded and a little darker
// at its foot. The nearer clump lies over the farther, so each shows its tufted top over the one
// behind it; each is a little lighter or yellower than its neighbours. Returns the tone to multiply
// the grass's colour by (the plain green between clumps where none covers p), and in 'body' how far
// into a clump p lies (1 at its middle, 0 at its edge or outside). 'px' is how many metres a pixel
// spans there.
vec3 grassClumps(vec2 p, float scale, float px, out float body) {
  vec2 q = p / scale;
  vec2 cam = cameraPosition.xz / scale;
  float aa = 0.8 * px / scale;
  vec2 i = floor(q);
  vec2 f = q - i;
  float best = 1e9;
  float second = 1e9;
  vec3 toneBest = vec3(0.0);
  vec3 toneSecond = vec3(0.0);
  float coverBest = 0.0;
  float coverSecond = 0.0;
  body = 0.0;
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 g = vec2(float(x), float(y));
      vec3 h = groundHash(i + g);
      if (h.z > 0.68) continue;
      vec2 r = f - (g + 0.15 + 0.7 * h.xy);
      float d = length(r);
      float radius = 0.48 + 0.4 * fract(h.z * 7.13);
      if (d > 1.45 * radius + aa) continue;
      vec2 mid = q - r;
      vec2 away = normalize(mid - cam + 1e-4);
      float side = dot(r, away) / max(d, 1e-4);
      float tips = 1.0 - abs(fract(atan(r.y, r.x) * (11.0 + 6.0 * h.x) / 6.2831853 + h.y) * 2.0 - 1.0);
      float edge = radius * (0.86 + 0.55 * smoothstep(-0.15, 0.7, side) * tips * tips * tips);
      float cover = 1.0 - smoothstep(edge - aa, edge + aa, d);
      if (cover <= 0.0) continue;
      float far = distance(mid, cam);
      float up = dot(r, away) / edge;
      vec3 tone = mix(vec3(1.06, 1.08, 0.9), vec3(1.17, 1.15, 0.86), h.y) * mix(0.9, 1.0, smoothstep(-0.95, -0.35, up));
      if (far < best) {
        second = best;
        toneSecond = toneBest;
        coverSecond = coverBest;
        best = far;
        toneBest = tone;
        coverBest = cover;
        body = cover * (1.0 - d / edge);
      } else if (far < second) {
        second = far;
        toneSecond = tone;
        coverSecond = cover;
      }
    }
  }
  return mix(mix(vec3(0.95, 0.97, 0.98), toneSecond, coverSecond), toneBest, coverBest);
}
// Packed earth: long soft sweeps of the brush, wandering slowly over the ground, broad smudges a
// little darker or lighter, a scatter of small pebbles, each dark with a light top, and the earth
// darker toward its edges ('inside' is how surely p lies on it; 'px' how many metres a pixel spans
// there).
vec3 earthTone(vec2 p, float inside, float px) {
  float turn = 6.2831853 * groundNoise(p * 0.03 + 5.0);
  vec2 along = vec2(cos(turn), sin(turn));
  vec2 a = vec2(dot(p, along), dot(p, vec2(-along.y, along.x)));
  float sweep = 0.6 * groundNoise(vec2(a.x * 0.18, a.y * 2.4)) + 0.4 * groundNoise(vec2(a.x * 0.6, a.y * 6.5) + 11.0);
  float smudge = smoothstep(0.3, 0.75, groundNoise(p * 0.35 + 23.0));
  vec3 tone = vec3(mix(0.88, 1.09, sweep) * mix(0.93, 1.03, smudge))
              * mix(vec3(0.85, 0.83, 0.82), vec3(1.0), smoothstep(0.2, 0.85, inside));
  vec2 q = p / 0.3;
  float aa = 0.8 * px / 0.3;
  vec2 i = floor(q);
  vec3 h = groundHash(i + 37.0);
  if (h.z < 0.25 && aa < 0.12) {
    vec2 r = q - i - (0.2 + 0.6 * h.xy);
    float size = 0.06 + 0.08 * h.x;
    float stone = (1.0 - smoothstep(size - aa, size + aa, length(r))) * (1.0 - smoothstep(0.05, 0.12, aa));
    float lit = smoothstep(-0.6, 0.6, dot(r / size, vec2(-0.5, -0.85)));
    tone = mix(tone, mix(vec3(0.7, 0.68, 0.66), vec3(1.14, 1.12, 1.06), lit), stone);
  }
  return tone;
}
// A cheap hash for the pebbles, three values 0 to 1 for a cell (no sines: the bank is painted
// stone by stone over much of the screen along the riverside path).
vec3 pebbleHash(vec2 p) {
  vec3 q = fract(vec3(p.xyx) * vec3(0.1031, 0.103, 0.0973));
  q += dot(q, q.yzx + 33.33);
  return fract((q.xxy + q.yzz) * q.zyx);
}
// The stones of one size in a bank of pebbles: in a jittered grid of cells 'size' metres across, a
// 'fill' of them holding one, each an oval a little turned, worn round (lit over its top toward the
// sun, darker down to its rim), a little lighter or darker, cooler or warmer than the next. Returns
// the tone of the stone over p (to multiply the bank's colour by) and in 'cover' how much of p it
// covers; in 'shadow', how much of p the stones' soft shadows darken, cast away from the sun ('px' is
// how many metres a pixel spans there). Each stone keeps within half a cell of its own cell's middle,
// so only the four cells nearest p need looking at; its turn, size and tint all come from its cell's
// one hash, and only the stone on top is shaded.
vec3 cobbles(vec2 p, float size, float fill, float salt, float px, out float cover, out float shadow) {
  vec2 q = p / size;
  vec2 i = floor(q - 0.5);
  vec2 f = q - i;
  float aa = 0.8 * px / size;
  cover = 0.0;
  shadow = 0.0;
  vec3 top = vec3(0.0);
  vec2 off = vec2(0.0);
  float reach = 1.0;
  float far = 9.0;
  for (int y = 0; y <= 1; y++) {
    for (int x = 0; x <= 1; x++) {
      vec2 g = vec2(float(x), float(y));
      vec3 h = pebbleHash(i + g + salt);
      if (h.z > fill) continue;
      vec2 d = f - (g + 0.35 + 0.3 * h.xy);
      vec2 turn = normalize(h.yx - 0.5 + 1e-3);
      vec2 e = vec2(turn.x * d.x - turn.y * d.y, turn.y * d.x + turn.x * d.y);
      e.y *= 1.0 + 0.55 * fract(h.z * 7.31);
      float r = 0.27 + 0.16 * fract(h.z * 13.7);
      float dist = length(e) / r;
      shadow = max(shadow, 1.0 - smoothstep(0.8, 1.3, length(d - vec2(0.6, 0.8) * 0.22 * r) / r));
      float c = 1.0 - smoothstep(1.0 - aa / r, 1.0 + aa / r, dist);
      if (c > cover) {
        cover = c;
        top = h;
        off = d;
        reach = r;
        far = dist;
      }
    }
  }
  if (cover <= 0.0) return vec3(1.0);
  float lit = smoothstep(-0.9, 0.75, dot(off / reach, vec2(-0.6, -0.8)));
  float dome = 1.0 - smoothstep(0.55, 1.0, far);
  vec3 tone = vec3(mix(0.82, 1.13, lit) * mix(0.84, 1.0, dome) * mix(0.9, 1.1, fract(top.z * 9.7)));
  return tone * mix(vec3(0.95, 0.99, 1.05), vec3(1.06, 1.0, 0.91), fract(top.x * 5.1 + top.y * 3.3));
}
// A bank of rounded pebbles, as along the film's riverside path ('river below parkour stone landmark
// 1'): stones of every size packed close, a big flat cobble here and there among the smaller ones and
// the small stones and grit between them all; dark in the cracks, moss in them here and there, the
// stones darker and wet down by the water ('wet', 0 to 1). Each size fades to the bank's plain colour
// before it is small enough to shimmer ('px' is how many metres a pixel spans there). It had been one
// even size of pebble, as if paved (the user, 2026-10-21).
vec3 pebbleTone(vec2 p, float px, float wet) {
  float fadeBig = 1.0 - smoothstep(0.09, 0.22, px);
  if (fadeBig <= 0.0) return vec3(mix(1.0, 0.78, wet));
  float fadeMid = 1.0 - smoothstep(0.05, 0.11, px);
  float fadeSmall = 1.0 - smoothstep(0.025, 0.06, px);
  // The small stones and grit under everything: cells of a close-packed bank, dark between them.
  vec3 tone = vec3(0.86);
  if (fadeSmall > 0.0) {
    // Each in its cell's middle half or so, so the four cells nearest p hold the nearest stones.
    const float size = 0.09;
    vec2 q = p / size;
    vec2 i = floor(q - 0.5);
    vec2 f = q - i;
    float d1 = 9.0;
    float d2 = 9.0;
    vec2 r1 = vec2(0.0);
    vec3 h1 = vec3(0.0);
    for (int y = 0; y <= 1; y++) {
      for (int x = 0; x <= 1; x++) {
        vec2 g = vec2(float(x), float(y));
        vec3 h = pebbleHash(i + g + 71.0);
        vec2 r = g + 0.22 + 0.56 * h.xy - f;
        float d = dot(r, r);
        if (d < d1) {
          d2 = d1;
          d1 = d;
          r1 = r;
          h1 = h;
        } else if (d < d2) {
          d2 = d;
        }
      }
    }
    float aa = 0.8 * px / size;
    // Each small stone rounded too, darker toward its edge, the grit between them only a little
    // darker: not the dark lines of paving.
    float edge = sqrt(d2) - sqrt(d1);
    float crack = 1.0 - smoothstep(0.03, 0.09 + 2.0 * aa, edge);
    float lit = smoothstep(-0.45, 0.45, dot(-r1, vec2(-0.6, -0.8)) * 2.0);
    vec3 small = vec3(mix(0.8, 0.98, lit) * mix(0.8, 1.0, smoothstep(0.02, 0.3, edge)) * mix(0.86, 1.04, h1.z));
    small *= mix(vec3(0.97, 0.99, 1.03), vec3(1.04, 1.0, 0.94), fract(h1.z * 5.3));
    small = mix(small, vec3(0.7, 0.69, 0.67), 0.8 * crack);
    tone = mix(tone, small, fadeSmall);
  }
  float cover;
  float shadow;
  if (fadeMid > 0.0) {
    vec3 mid = cobbles(p, 0.24, 0.86, 41.0, px, cover, shadow);
    tone *= 1.0 - 0.28 * shadow * (1.0 - cover) * fadeMid;
    tone = mix(tone, mid, cover * fadeMid);
  }
  vec3 big = cobbles(p + 13.0, 0.6, 0.34, 83.0, px, cover, shadow);
  tone *= 1.0 - 0.32 * shadow * (1.0 - cover) * fadeBig;
  tone = mix(tone, big * 1.03, cover * fadeBig);
  // Moss in the cracks between them, in patches (a value noise of the cheap hash).
  vec2 mi = floor(p * 0.45 + 7.0);
  vec2 mf = p * 0.45 + 7.0 - mi;
  mf = mf * mf * (3.0 - 2.0 * mf);
  float mossy = mix(mix(pebbleHash(mi).x, pebbleHash(mi + vec2(1.0, 0.0)).x, mf.x),
                    mix(pebbleHash(mi + vec2(0.0, 1.0)).x, pebbleHash(mi + vec2(1.0, 1.0)).x, mf.x), mf.y);
  float moss = smoothstep(0.6, 0.85, mossy) * (1.0 - cover) * smoothstep(0.92, 0.7, tone.r);
  tone = mix(tone, vec3(0.66, 0.8, 0.52), 0.55 * moss);
  // Wet down by the water: darker, a little cooler.
  tone *= mix(vec3(1.0), vec3(0.74, 0.77, 0.8), wet);
  return mix(vec3(1.0), tone, fadeBig);
}
#ifdef SCREE
uniform sampler2D uScree;
// Stones fallen from the rocks, lying at their feet and over the steep ground under the cliffs, as the
// film scatters stones over its ground ('density', from the scree map, how thickly they lie, 0 to 1):
// in some of the half-metre cells where they lie thickest, fewer and smaller further out; pale and
// rounded, lit along their sunward side, shaded and darker along the other, each with a soft shadow on
// the ground beside it. Returns the stone's colour (rgb) and how much of p it covers (a), and in
// 'shadow' how much its shadow darkens the ground there; faded out before they are small enough to
// shimmer ('px' is how many metres a pixel spans there). On a slope ('fall', the way down it seen
// from above; 'level', its normal's height, 1 on the flat) each is measured along the ground, so it
// lies round on it rather than drawn out down the slope as a pattern painted from above would be.
vec4 screeStones(vec2 p, float density, float px, vec2 fall, float level, out float shadow) {
  const float size = 0.5;
  shadow = 0.0;
  float fade = 1.0 - smoothstep(0.05, 0.12, px);
  if (fade <= 0.0) return vec4(0.0);
  vec2 q = p / size;
  vec2 i = floor(q);
  vec2 f = q - i;
  float aa = 0.8 * px / size;
  float along = 1.0 / max(level, 0.4) - 1.0;
  vec4 stone = vec4(0.0);
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 g = vec2(float(x), float(y));
      vec3 h = groundHash(i + g + 113.0);
      if (h.z > 0.5 * density) continue;
      vec3 k = groundHash(i + g + 271.0);
      float r = (0.12 + 0.2 * k.x) * (0.7 + 0.5 * density);
      vec2 d = f - (g + 0.25 + 0.5 * h.xy);
      d += fall * dot(d, fall) * along;
      float turn = 6.2831853 * k.y;
      vec2 e = mat2(cos(turn), -sin(turn), sin(turn), cos(turn)) * d;
      e.y *= 1.2 + 0.5 * k.z;
      float dist = length(e);
      // Its shadow, cast away from the sun across the ground.
      shadow = max(shadow, 1.0 - smoothstep(0.75 * r, 1.4 * r, length(d - vec2(0.6, 0.8) * 0.5 * r)));
      float cover = 1.0 - smoothstep(r - aa, r + aa, dist);
      if (cover > stone.a) {
        float lit = smoothstep(-0.7, 0.5, dot(d, vec2(-0.6, -0.8)) / r);
        vec3 tone = mix(vec3(0.2, 0.19, 0.18), vec3(0.58, 0.56, 0.52), lit) * mix(0.84, 1.12, fract(h.z * 7.3));
        tone *= mix(vec3(0.97, 1.0, 1.04), vec3(1.05, 1.0, 0.94), k.z);
        tone = mix(tone, tone * 0.45, smoothstep(0.6 * r, r, dist) * (1.0 - 0.7 * lit));
        stone = vec4(tone, cover);
      }
    }
  }
  shadow *= fade;
  return vec4(stone.rgb, stone.a * fade);
}
#endif
`;

/** GLSL, after the colour map is read: the film's grass and earth over it (needs GROUND_PAINT_GLSL,
 * FLOOR_GLSL's uMap, and the ground's place in the world as vGroundWorld). How much a pixel spans
 * is worked out before anything branches, where the GPU can tell. */
const GROUND_PAINT = /* glsl */ `
{
  vec2 p = vGroundWorld.xz;
  vec3 kind = texture2D(uKinds, vMapUv).rgb;
  #ifdef SCREE
  float scree = texture2D(uScree, vMapUv).r;
  #endif
  float px = length(fwidth(p));
  vec2 uvdx = dFdx(vMapUv);
  vec2 uvdy = dFdy(vMapUv);
  // How level the ground is (its normal's height, 1 on the flat) and which way it falls: stones and
  // pebbles lie only on what is level enough to hold them, fewer and smaller as it steepens, none on
  // the steep feet of the cliffs, where painted from above they had been drawn out into long eggs.
  vec3 upward = inverseTransformDirection(vNormal, viewMatrix);
  float level = upward.y;
  vec2 fall = upward.xz / max(length(upward.xz), 1e-4);
  float hold = smoothstep(0.45, 0.75, level);
  float grass = kind.r;
  float bare = kind.g + kind.b;
  // How much of the ground here takes prints: its sand, not the pebbles; and down by the water, where the
  // map of kinds gives out, the wet sand at its edge.
  float printable = 1.0 - smoothstep(uSea + ${PRINT_SHORE.from.toFixed(2)}, uSea + ${PRINT_SHORE.to.toFixed(2)}, vGroundWorld.y);
  if (grass + bare > 0.05) {
    // The small clumps near the camera, the large ones on out into the middle distance, each fading
    // before it is small enough to shimmer.
    float nearFade = 1.0 - smoothstep(0.035, 0.11, px);
    float farFade = 1.0 - smoothstep(0.1, 0.3, px);
    float body = 0.0;
    float bodyFar = 0.0;
    vec3 near = vec3(1.0);
    vec3 far = vec3(1.0);
    if (grass > 0.01) {
      if (nearFade > 0.0) near = grassClumps(p, 0.55, px, body);
      if (farFade > 0.0) far = grassClumps(p + 31.0, 1.4, px, bodyFar);
    }
    float grassy = grass;
    // Where grass meets bare ground, the border follows the clumps' outlines, each spilling over the
    // edge as far as its body reaches; either side keeps its own colour, read a little way into it.
    if (grass > 0.02 && grass < 0.98 && grass + bare > 0.9) {
      float reach = mix(bodyFar, body, nearFade);
      grassy = smoothstep(0.42, 0.58, grass + 0.6 * (reach - 0.35));
      vec2 du = vec2(0.7 / uMap.z, 0.0);
      vec2 dv = vec2(0.0, 0.7 / uMap.z);
      vec2 g = vec2(textureGrad(uKinds, vMapUv + du, uvdx, uvdy).r - textureGrad(uKinds, vMapUv - du, uvdx, uvdy).r,
                    textureGrad(uKinds, vMapUv + dv, uvdx, uvdy).r - textureGrad(uKinds, vMapUv - dv, uvdx, uvdy).r);
      vec2 toGrass = g / max(length(g), 1e-4) / uMap.z;
      diffuseColor.rgb = mix(textureGrad(map, vMapUv - toGrass, uvdx, uvdy).rgb,
                             textureGrad(map, vMapUv + toGrass, uvdx, uvdy).rgb, grassy);
    }
    vec3 lawn = mix(vec3(1.0), near, nearFade) * mix(vec3(1.0), far, 0.7 * farFade * (1.0 - 0.5 * nearFade));
    vec3 tone = mix(vec3(1.0), lawn, grassy);
    float earth = (1.0 - grassy) * kind.g / max(bare, 1e-3);
    if (earth > 0.01) tone *= mix(vec3(1.0), earthTone(p, kind.g, px), earth);
    // Bare ground painted grey, not sand's warm colour, is the gorge's pebble bank.
    float sand = (1.0 - grassy) * kind.b / max(bare, 1e-3);
    printable = 0.0;
    if (sand > 0.01) {
      vec3 c = diffuseColor.rgb;
      float hi = max(c.r, max(c.g, c.b));
      float grey = 1.0 - smoothstep(0.38, 0.5, (hi - min(c.r, min(c.g, c.b))) / max(hi, 1e-3));
      if (grey * hold > 0.01) {
        float wet = 1.0 - smoothstep(uSea + 0.1, uSea + 0.55, vGroundWorld.y);
        tone *= mix(vec3(1.0), pebbleTone(p, px, wet), sand * grey * hold);
      }
      printable = sand * (1.0 - grey);
    }
    diffuseColor.rgb *= tone;
  }
  // Prints walked into it: faint where the sand is dry, clearer on the damp sand by the water, a little
  // warm, as the sand's shade is.
  float print = printable > 0.01 ? printAt(p, px) * printable : 0.0;
  if (print > 0.0) {
    float damp = 1.0 - smoothstep(uSea + ${PRINT_DAMP.from.toFixed(2)}, uSea + ${PRINT_DAMP.to.toFixed(2)}, vGroundWorld.y);
    diffuseColor.rgb *= 1.0 - print * mix(${PRINT_DRY.toFixed(2)}, ${PRINT_WET.toFixed(2)}, damp) * vec3(0.85, 1.0, 1.15);
  }
  #ifdef SCREE
  // Stones fallen from the rocks (see screeStones), over whatever ground they lie on; a little darker
  // on the steeper ground, damp under the cliffs.
  if (scree * hold > 0.02) {
    float shadow;
    vec4 stone = screeStones(p, scree * hold, px, fall, level, shadow);
    diffuseColor.rgb *= 1.0 - 0.45 * shadow;
    diffuseColor.rgb = mix(diffuseColor.rgb, stone.rgb * mix(0.8, 1.0, smoothstep(0.6, 0.92, level)), stone.a);
  }
  #endif
}
`;

/**
 * The film look's ground: the same painted colour map, its grass and earth painted over it the
 * film's way where `kinds` says they lie, and the stones fallen from the rocks where `scree` does,
 * lit by the sun through the soft ramp and shaded where rocks, trees and houses cast their shadows,
 * without the pen's waterline (the film paints its shores without a line).
 */
function filmGroundMaterial(
  colours: THREE.Texture,
  info: TerrainInfo,
  floor: THREE.Texture,
  kinds: THREE.Texture | null,
  scree: THREE.Texture | null,
): THREE.MeshToonMaterial {
  const material = new THREE.MeshToonMaterial({
    map: colours,
    gradientMap: paintedRamp(),
    polygonOffset: true,
    polygonOffsetFactor: 8,
    polygonOffsetUnits: 8,
  });
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, {
      uFloor: { value: floor },
      uMap: { value: new THREE.Vector4(info.origin[0], info.origin[1], info.size, info.height.grid) },
      uEdge: { value: new THREE.Color(WATER_EDGE) },
      uSea: { value: info.water },
      uPool: { value: poolUniform(info) },
      uKinds: { value: kinds },
      uScree: { value: scree },
      ...printUniforms,
    });
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vGroundWorld;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGroundWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        ${FLOOR_GLSL}
        ${kinds && scree ? '#define SCREE' : ''}
        ${kinds ? GROUND_PAINT_GLSL : ''}
        uniform vec3 uEdge;
        uniform float uSea;
        uniform vec4 uPool;
        varying vec3 vGroundWorld;`,
      )
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
        ${kinds ? GROUND_PAINT : ''}
        {
          // Under the water the ground is hidden, but where the two meet at a glancing angle a
          // sliver of it can show: painted the colour of the water's edge, it reads as water.
          float level = distance(vGroundWorld.xz, uPool.xy) < uPool.z ? uPool.w : uSea;
          float h = floorAt(vGroundWorld.xz);
          if (abs(h - level) < 0.2) h = floorAtSmooth(vGroundWorld.xz);
          float above = (h - level) / max(fwidth(h), 1e-5);
          diffuseColor.rgb = mix(diffuseColor.rgb, uEdge, 1.0 - step(-0.5, above));
        }`,
      );
    shadeUnderTrees(shader, 'vGroundWorld');
    fireLights(shader);
  };
  return material;
}

let terrain: Terrain | null = null;
/** The forbidden cave's floor and ceiling, once it has loaded: characters in it walk on it, not on the
 * island's ground over it (see Cave.ts). */
let cave: CaveGrid | null = null;

export function setCave(grid: CaveGrid | null): void {
  cave = grid;
}

/** Whether someone outside the cave could stand at (x, z), their feet at `y`: for finding the cave's
 * walls (see CaveGrid). */
export function outsideWalkable(x: number, z: number, y: number): boolean {
  return terrain ? terrain.walkable(x, z, y) && Math.abs(terrain.height(x, z) - y) < 0.6 : false;
}

/** Whether someone whose feet were at `feet` can stand at (x, z): in the cave on its floor, kept off its
 * walls (CaveGrid.walk); outside, on the island's ground (Terrain.walkable). */
function canStand(x: number, z: number, feet: number): boolean {
  if (!terrain) return true;
  if (cave) {
    if (cave.holds(x, z, feet)) {
      const k = cave.at(x, z);
      const floor = cave.floorAt(x, z);
      if (!cave.walk[k] || floor - feet > STEP_UP + 0.05) return false;
      return !blocked(x, z, PROP_MARGIN, floor);
    }
    if (cave.walled(x, z, feet)) return false;
  }
  return terrain.walkable(x, z, feet);
}

/**
 * Where someone whose feet were at `feet` stands at (x, z), if they can stand there at all: on the deck
 * within a step of their feet, or on the ground; NaN where they cannot (in water too deep, up a cliff, in
 * a rock or a prop). On the island only, never in the forbidden cave. For finding the way about it (see
 * life/Nav.ts), by the same rules as walking; `pad` keeps that much further from rocks and props.
 */
export function standAt(x: number, z: number, feet: number, pad = 0): number {
  if (!terrain) return NaN;
  if (cave && (cave.holds(x, z, feet) || cave.walled(x, z, feet))) return NaN;
  if (!terrain.walkable(x, z, feet, pad)) return NaN;
  return groundHeight(x, z, feet);
}

/** The island's map: its north-west corner (x, z) and how many metres it is across; null until it has
 * loaded. */
export function islandSquare(): { x: number; z: number; size: number } | null {
  return terrain ? { x: terrain.info.origin[0], z: terrain.info.origin[1], size: terrain.info.size } : null;
}

/** Whether someone can stand on the cave's floor at (x, z): where its walk grid lets them, clear of what
 * stands on it (the ledge's crystals and its fire); where the boat lets its rower out. */
export function caveStandable(x: number, z: number): boolean {
  if (!cave) return false;
  const k = cave.at(x, z);
  return k >= 0 && cave.walk[k] === 1 && !blocked(x, z, PROP_MARGIN, cave.floorAt(x, z));
}

/** Puts back a height grid stored as each sample less what its neighbours west, north and
 * north-west predict, round 65536 (predicted in art/blender/build_island.py), in place. */
function unpredict(q: Uint16Array, n: number): void {
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const k = j * n + i;
      const guess = i > 0 && j > 0 ? q[k - 1] + q[k - n] - q[k - n - 1] : i > 0 ? q[k - 1] : j > 0 ? q[k - n] : 0;
      q[k] = (q[k] + guess) & 0xffff;
    }
  }
}

/** Loads the island's ground once: its mesh, painted colours and height grid. */
export async function loadTerrain(): Promise<Terrain> {
  const gltf = await loadGltf('models/island/terrain.glb');
  let mesh: THREE.Mesh | null = null;
  gltf.scene.traverse((o) => {
    if (!mesh && (o as THREE.Mesh).isMesh) mesh = o as THREE.Mesh;
  });
  if (!mesh) throw new Error('No mesh in terrain.glb');
  const found = mesh as THREE.Mesh;
  const raw = found.userData.terrain ?? found.parent?.userData.terrain;
  if (typeof raw !== 'string') throw new Error('No terrain data in terrain.glb');
  const info = JSON.parse(raw) as TerrainInfo;
  // In the film look the ground and plants under the trees lie in their shade, and the waterfall's
  // clearing is hazy round the top of the falling water, a little behind where it lands.
  if (FILM) coverTrees(info.plants.crowns, info.origin, info.size);
  if (FILM && info.pool && info.waterfall) {
    const [px, pz] = info.pool.centre;
    const [fx, fz] = info.waterfall.foot;
    hazeClearing([fx + 0.6 * (fx - px), info.pool.level + 9, fz + 0.6 * (fz - pz)], 10, 0.75, 0.02);
  }

  const [buffer, colours, kinds, scree] = await Promise.all([
    fetch(info.height.url).then((r) => {
      if (!r.ok) throw new Error(`Could not load ${info.height.url}`);
      return r.arrayBuffer();
    }),
    new THREE.TextureLoader().loadAsync(info.colours),
    FILM && info.kinds ? new THREE.TextureLoader().loadAsync(info.kinds) : Promise.resolve(null),
    FILM && info.scree ? new THREE.TextureLoader().loadAsync(info.scree) : Promise.resolve(null),
  ]);
  const { grid, min, max } = info.height;
  const q = new Uint16Array(buffer);
  if (q.length !== grid * grid) throw new Error('height.bin does not match its grid');
  if (info.height.predicted) unpredict(q, grid);
  const heights = new Float32Array(q.length);
  for (let i = 0; i < q.length; i++) heights[i] = min + (q[i] / 65535) * (max - min);

  // The glTF's UVs start at the image's top-left (north-west), as the colour map is painted.
  colours.flipY = false;
  colours.colorSpace = THREE.SRGBColorSpace;
  colours.anisotropy = 4;
  colours.needsUpdate = true;
  for (const map of [kinds, scree]) {
    if (!map) continue;
    map.flipY = false;
    map.colorSpace = THREE.NoColorSpace;
    map.needsUpdate = true;
  }
  found.removeFromParent();
  found.position.set(0, 0, 0);
  found.rotation.set(0, 0, 0);
  found.scale.set(1, 1, 1);

  terrain = new Terrain(info, heights, found);
  if (kinds) terrain.readKinds(kinds.image as HTMLImageElement | ImageBitmap);
  found.material = FILM ? filmGroundMaterial(colours, info, terrain.texture, kinds, scree) : groundMaterial(colours, info, terrain.texture);
  found.receiveShadow = FILM;
  // The stepping stones: their tops and the rims' ledges to stand on, their bodies to bump into.
  for (const pad of info.stones?.pads ?? []) addPad(pad.centre[0], pad.centre[1], pad.outline, pad.top);
  for (const p of info.stones?.pillars ?? []) addCircle(p.centre[0], p.centre[1], p.radius, p.bottom, p.top);
  return terrain;
}

/**
 * Height of what someone stands on at (x, z): the ground, or the highest deck over it within a
 * step of `feet` (where their feet were), so a porch's floor carries whoever walks up its stairs
 * and not whoever walks underneath it. Leave `feet` out for the highest deck. Flat sea level until
 * the island has loaded.
 */
export function groundHeight(x: number, z: number, feet = Infinity): number {
  // In the cave, its own floor, under the island's ground.
  const ground = cave && cave.holds(x, z, feet) ? cave.floorAt(x, z) : terrain ? terrain.height(x, z) : 0;
  const deck = deckUnder(x, z, feet + STEP_UP);
  return deck === null ? ground : Math.max(ground, deck);
}

/** The bare ground's height at (x, z), under any deck. */
export function terrainHeight(x: number, z: number): number {
  return terrain ? terrain.height(x, z) : 0;
}

/** The surface of whatever water is at (x, z), the pool's or the sea's; the sea's until the island has loaded. */
export function waterLevelAt(x: number, z: number): number {
  return terrain ? terrain.waterLevel(x, z) : -0.32;
}

/** Whether the camera may be at (x, y, z): not inside a rock, a prop or a tree's crown; in the cave,
 * between its floor and its ceiling, not in its walls nor the rock over it. */
export function cameraClear(x: number, y: number, z: number): boolean {
  if (cave && terrain) {
    const k = cave.at(x, z);
    if (k >= 0 && !Number.isNaN(cave.floor[k])) {
      if (y < cave.ceiling[k] - 0.25) return y > cave.floor[k] + 0.25 && !cameraBlocked(x, y, z, CAMERA_MARGIN);
      if (y < terrain.height(x, z) + 0.3 || terrain.nearRock(x, z, CAMERA_MARGIN, y)) return false;
    } else if (cave.walled(x, z, y)) {
      return false;
    }
  }
  if (terrain && terrain.nearRock(x, z, CAMERA_MARGIN, y)) return false;
  return !cameraBlocked(x, y, z, CAMERA_MARGIN);
}

/** Keeps the camera, at p, framing someone at `target` (their middle) out of the ground: over it; in the
 * cave, between its floor and its ceiling, not up its skylight's well. */
export function cameraLimit(p: THREE.Vector3, target: THREE.Vector3): void {
  if (cave && cave.holds(target.x, target.z, target.y - 0.55)) {
    const k = cave.at(p.x, p.z);
    if (k >= 0 && !Number.isNaN(cave.floor[k])) {
      const top = Math.min(cave.ceiling[k], cave.info.dome.top - 1.5) - 0.3;
      p.y = Math.min(Math.max(p.y, cave.floorAt(p.x, p.z) + 0.5), Math.max(top, cave.floor[k] + 0.6));
      return;
    }
    // Out of the cave from inside it: back toward whoever it frames.
    p.lerp(target, 0.85);
    return;
  }
  p.y = Math.max(p.y, groundHeight(p.x, p.z) + 0.6);
}

/** Keeps the eyes at p, of someone whose feet are at `feet`, under the forbidden cave's roof while they
 * are in the cave: in places it hangs lower than a jump takes them. */
export function eyeLimit(p: THREE.Vector3, feet: number): void {
  if (!cave || !cave.holds(p.x, p.z, feet)) return;
  p.y = Math.min(p.y, cave.ceiling[cave.at(p.x, p.z)] - 0.15);
}

/**
 * Keeps a character who moved from `from` to `p` on ground they can stand on (`from.y` is where
 * their feet were): if `p` is in deep water, up a cliff, too high a step or inside something, they
 * slide along it (keeping whichever of the two moves is allowed), or stay where they were.
 */
export function clampToWalkable(p: THREE.Vector3, from: THREE.Vector3): void {
  const feet = from.y;
  if (!terrain || canStand(p.x, p.z, feet)) return;
  // Someone already somewhere they could not walk to (placed there) may walk out of it, though never deeper
  // into what stands in their way, nor into anything else: not on through a wall.
  const stuck = !canStand(from.x, from.z, feet);
  if (stuck && mayStep(p.x, p.z, from, feet, true)) return;
  if (mayStep(p.x, from.z, from, feet, stuck)) p.z = from.z;
  else if (mayStep(from.x, p.z, from, feet, stuck)) p.x = from.x;
  else {
    p.x = from.x;
    p.z = from.z;
  }
}

/** Whether someone whose feet were at `feet` at `from` may step to (x, z): onto what they can stand on, or,
 * `stuck` where they could not stand, anywhere that takes them no deeper into what is in their way. */
function mayStep(x: number, z: number, from: THREE.Vector3, feet: number, stuck: boolean): boolean {
  return stuck ? !deeper(from.x, from.z, x, z, PROP_MARGIN, feet) : canStand(x, z, feet);
}

/** Whether someone in the air with their feet at `y` can be at (x, z): not in a rock, nor in a prop
 * or a stepping stone's body at their height, nor over a prop they would come down inside (see
 * blockedInAir), nor over the cave skylight's opening, nor in ground more than a step above their feet. */
function clearInAir(x: number, z: number, y: number): boolean {
  if (!terrain) return true;
  if (cave) {
    // In the cave: over its floor, under its ceiling, clear of what stands in it.
    if (cave.holds(x, z, y)) {
      const k = cave.at(x, z);
      return (
        cave.floor[k] <= y + STEP_UP && y + 0.75 < cave.ceiling[k] && !blockedInAir(x, z, PROP_MARGIN, y, groundHeight(x, z, y))
      );
    }
    if (cave.walled(x, z, y)) return false;
  }
  if (terrain.nearRock(x, z, ROCK_MARGIN) || terrain.nearSkylight(x, z, EDGE_MARGIN)) return false;
  if (blockedInAir(x, z, PROP_MARGIN, y, groundHeight(x, z, y))) return false;
  return terrain.height(x, z) <= y + STEP_UP;
}

/**
 * Keeps a character in the air (their feet at `y`) who moved from `from` to `p` from passing into
 * anything standing higher than their feet, or over what they would come down inside: over a gap, a drop
 * or water they carry on; against a rock, a prop, a stepping stone's side or a bank they slide along it,
 * or stay where they were.
 */
export function clampInAir(p: THREE.Vector3, from: THREE.Vector3, y: number): void {
  if (!terrain || clearInAir(p.x, p.z, y)) return;
  // Someone already where they could not be (put there) may move out of it, though never deeper into what
  // is in their way, nor into anything else.
  const stuck = !clearInAir(from.x, from.z, y);
  if (stuck && mayFly(p.x, p.z, from, y, true)) return;
  if (mayFly(p.x, from.z, from, y, stuck)) p.z = from.z;
  else if (mayFly(from.x, p.z, from, y, stuck)) p.x = from.x;
  else {
    p.x = from.x;
    p.z = from.z;
  }
}

/** Whether someone in the air at `from`, their feet at `y`, may move to (x, z): where they are clear, or,
 * `stuck` where they were not, anywhere that takes them no deeper into what is in their way. */
function mayFly(x: number, z: number, from: THREE.Vector3, y: number, stuck: boolean): boolean {
  return stuck ? !deeper(from.x, from.z, x, z, PROP_MARGIN, y, groundHeight(x, z, y)) : clearInAir(x, z, y);
}

/**
 * Whether someone whose feet came down to `y` at p fell into water too deep to stand in (the river
 * under the stepping stones, the sea off a rock): if so they climb out at the nearest shore, p
 * moved there (see climbOut).
 */
export function splashDown(p: THREE.Vector3, y: number): boolean {
  if (!terrain) return false;
  if (cave && cave.holds(p.x, p.z, y)) {
    // Into the cave's sea: out again onto the nearest of its floor they can stand on.
    const surface = cave.info.water;
    if (y > surface || cave.floorAt(p.x, p.z) >= surface - WADE) return false;
    return climbOutOfCave(p, cave);
  }
  const surface = terrain.waterLevel(p.x, p.z);
  if (y > surface || groundHeight(p.x, p.z, y) >= surface - WADE) return false;
  return climbOut(p);
}

/**
 * Where someone who fell into water too deep to stand in at p climbs out: moves p to the nearest
 * place round it they can stand on the ground, a bank half a metre or more over the water but low
 * enough to climb onto from it (not a clifftop), looking outward ring by ring up to 30 m; false,
 * and p as it was, if there is none. Out of the gorge's river, that is its riverside path.
 */
function climbOutOfCave(p: THREE.Vector3, grid: CaveGrid): boolean {
  for (let r = 0.25; r <= 20; r += 0.25) {
    const n = Math.ceil((2 * Math.PI * r) / 0.25);
    for (let i = 0; i < n; i++) {
      const a = (2 * Math.PI * i) / n;
      const x = p.x + r * Math.cos(a);
      const z = p.z + r * Math.sin(a);
      const k = grid.at(x, z);
      if (k >= 0 && grid.walk[k] && grid.floor[k] > grid.info.water + 0.05 && !blocked(x, z, PROP_MARGIN, grid.floor[k])) {
        p.x = x;
        p.z = z;
        return true;
      }
    }
  }
  return false;
}

export function climbOut(p: THREE.Vector3): boolean {
  if (!terrain) return false;
  for (let r = 0.5; r <= 30; r += 0.5) {
    const n = Math.ceil((2 * Math.PI * r) / 0.5);
    for (let i = 0; i < n; i++) {
      const a = (2 * Math.PI * i) / n;
      const x = p.x + r * Math.cos(a);
      const z = p.z + r * Math.sin(a);
      const h = terrain.height(x, z);
      const surface = terrain.waterLevel(x, z);
      if (h > surface + 0.5 && h < surface + 1.5 && terrain.walkable(x, z, h)) {
        p.x = x;
        p.z = z;
        return true;
      }
    }
  }
  return false;
}
