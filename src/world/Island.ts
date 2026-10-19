import * as THREE from 'three';
import { loadGltf } from '../core/gltf';
import { sharedUniforms } from '../characters/CharacterMaterial';
import { fireLights } from './Firelight';
import { PEN_GLSL, inkUniforms } from './Ink';
import { FILM, coverTrees, hazeClearing, paintedRamp, shadeUnderTrees } from './Look';
import { addCircle, addPad, blocked, cameraBlocked, deckUnder, outlineAt } from './Obstacles';

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
  /** Where grass (red), bare earth (green: the paths, the village's clearing, the festival's street)
   * and sand (blue) lie, mapped as the colours are; the rest is fields, the waterfall pool's bank,
   * rubble and rock. The film look paints its grass and earth from it. */
  kinds?: string;
  /** A cave's skylight, if the island has one: a round opening in the ground like a well's mouth,
   * cut out of the ground's mesh, over a dome with the sea come in under the island at its foot. Its
   * middle (x, z) and radius, its edge wandering from round by a few waves (how many times round, how
   * far as a share of the radius, where each starts; see skylightEdge); about how far the dome
   * reaches from the middle at the water, and its floor under the water. */
  skylight?: { centre: [number, number]; radius: number; lumps: [number, number, number][]; dome: number; floor: number };
  /** The rock landmarks, the sea cliffs and the waterfall, built with the ground. */
  landmarks: string;
  /** Each rock's foot: its middle (x, z), and how far it reaches at even angles round it from east toward south. */
  rocks: { centre: [number, number]; outline: number[] }[];
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

/** The colour of the water at its very edge, where it is shallowest. */
export const WATER_EDGE = '#45DFC8';

/**
 * GLSL: the ground's height at a point (x, z), from the island's height grid, filtered between
 * its samples (which sit on texel centres). Shaders using it set `uFloor` to the grid's texture
 * and `uMap` to the map's (origin x, origin z, size, samples per side).
 */
export const FLOOR_GLSL = /* glsl */ `
uniform sampler2D uFloor;
uniform vec4 uMap;
float floorAt(vec2 xz) {
  vec2 g = (xz - uMap.xy) / uMap.z * (uMap.w - 1.0);
  return texture2D(uFloor, (g + 0.5) / uMap.w).r;
}
// The same, blended between the samples in full precision: the GPU's own filtering blends in
// steps of 1/256 of a sample, which would fray a line drawn along the waterline.
float floorAtExact(vec2 xz) {
  vec2 g = clamp((xz - uMap.xy) / uMap.z * (uMap.w - 1.0), vec2(0.0), vec2(uMap.w - 1.001));
  vec2 i = floor(g);
  vec2 f = g - i;
  ivec2 c = ivec2(i);
  float a = texelFetch(uFloor, c, 0).r;
  float b = texelFetch(uFloor, c + ivec2(1, 0), 0).r;
  float d = texelFetch(uFloor, c + ivec2(0, 1), 0).r;
  float e = texelFetch(uFloor, c + ivec2(1, 1), 0).r;
  return mix(mix(a, b, f.x), mix(d, e, f.x), f.y);
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

/** The island's ground, built in Blender: heights to walk on, and the mesh to draw. */
export class Terrain {
  /** Heights for shaders: the same grid, filtered between samples. */
  readonly texture: THREE.DataTexture;
  /** Each rock's foot, with its furthest reach for a quick first test. */
  private readonly rocks: { x: number; z: number; outline: number[]; reach: number }[];

  constructor(
    readonly info: TerrainInfo,
    private readonly heights: Float32Array,
    readonly mesh: THREE.Mesh,
  ) {
    const n = info.height.grid;
    const half = new Uint16Array(n * n);
    for (let i = 0; i < half.length; i++) half[i] = THREE.DataUtils.toHalfFloat(heights[i]);
    this.texture = new THREE.DataTexture(half, n, n, THREE.RedFormat, THREE.HalfFloatType);
    this.texture.magFilter = THREE.LinearFilter;
    this.texture.minFilter = THREE.LinearFilter;
    this.texture.needsUpdate = true;
    this.rocks = info.rocks.map((r) => ({ x: r.centre[0], z: r.centre[1], outline: r.outline, reach: Math.max(...r.outline) }));
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

  /** The surface of whatever water is at (x, z): the waterfall pool's, or the sea's. */
  waterLevel(x: number, z: number): number {
    const pool = this.info.pool;
    if (pool && Math.hypot(x - pool.centre[0], z - pool.centre[1]) < pool.radius + 1) return pool.level;
    return this.info.water;
  }

  /** Whether (x, z) is within `margin` metres of a rock's foot. */
  nearRock(x: number, z: number, margin: number): boolean {
    for (const rock of this.rocks) {
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
   * that is not under water deeper than a wade nor up a cliff.
   */
  walkable(x: number, z: number, feet: number): boolean {
    if (this.nearRock(x, z, ROCK_MARGIN) || this.nearSkylight(x, z, EDGE_MARGIN)) return false;
    const ground = this.height(x, z);
    const deck = deckUnder(x, z, feet + STEP_UP);
    const stand = deck !== null && deck > ground ? deck : ground;
    if (blocked(x, z, PROP_MARGIN, stand)) return false;
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
        if (abs(h - level) < 0.6) h = floorAtExact(vWorld.xz);
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
 * GLSL: the film's grass and earth, painted over the ground's colours where its map of kinds (see
 * TerrainInfo.kinds) says they lie. The lawn is clumps of grass, each a crown of blade tips, the
 * nearer over the farther; packed earth has long soft sweeps of the brush and a scatter of pebbles;
 * where the two meet, the border follows the clumps' tufted outlines. Bare ground painted grey (the
 * gorge's floor) is a bank of rounded pebbles.
 */
const GROUND_PAINT_GLSL = /* glsl */ `
uniform sampler2D uKinds;
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
// A bank of rounded pebbles packed close, as along the film's riverside path: each a little lighter
// or darker, cooler or warmer than its neighbours, lit along one side and shaded along the other,
// dark in the cracks between them; fading to the bank's plain colour before they are small enough to
// shimmer ('px' is how many metres a pixel spans there).
vec3 pebbleTone(vec2 p, float px) {
  const float size = 0.2;
  float fade = 1.0 - smoothstep(0.03, 0.08, px);
  if (fade <= 0.0) return vec3(1.0);
  vec2 q = p / size;
  vec2 i = floor(q);
  vec2 f = q - i;
  float d1 = 9.0;
  float d2 = 9.0;
  vec2 r1 = vec2(0.0);
  vec3 h1 = vec3(0.0);
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 g = vec2(float(x), float(y));
      vec3 h = groundHash(i + g + 71.0);
      vec2 r = g + 0.15 + 0.7 * h.xy - f;
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
  // Each pebble rounded: lit on its sunward side and shaded down its other, out to its rim; the
  // gaps between them only a little darker, the bank's own grit showing there.
  float edge = sqrt(d2) - sqrt(d1);
  float crack = (1.0 - smoothstep(0.03, 0.08 + 2.0 * aa, edge)) * mix(0.5, 1.0, h1.y);
  float dome = smoothstep(0.0, 0.35, edge);
  float lit = smoothstep(-0.45, 0.45, dot(-r1, vec2(-0.6, -0.8)) * 2.0);
  vec3 tone = vec3(mix(0.88, 1.1, lit * dome + 0.5 * (1.0 - dome)) * mix(0.88, 1.1, h1.z));
  tone *= mix(vec3(0.96, 0.99, 1.04), vec3(1.05, 1.0, 0.93), fract(h1.z * 5.3));
  tone = mix(tone, vec3(0.72, 0.71, 0.7), crack);
  return mix(vec3(1.0), tone, fade);
}
`;

/** GLSL, after the colour map is read: the film's grass and earth over it (needs GROUND_PAINT_GLSL,
 * FLOOR_GLSL's uMap, and the ground's place in the world as vGroundWorld). How much a pixel spans
 * is worked out before anything branches, where the GPU can tell. */
const GROUND_PAINT = /* glsl */ `
{
  vec2 p = vGroundWorld.xz;
  vec3 kind = texture2D(uKinds, vMapUv).rgb;
  float px = length(fwidth(p));
  vec2 uvdx = dFdx(vMapUv);
  vec2 uvdy = dFdy(vMapUv);
  float grass = kind.r;
  float bare = kind.g + kind.b;
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
    if (sand > 0.01) {
      vec3 c = diffuseColor.rgb;
      float hi = max(c.r, max(c.g, c.b));
      float grey = 1.0 - smoothstep(0.38, 0.5, (hi - min(c.r, min(c.g, c.b))) / max(hi, 1e-3));
      if (grey > 0.01) tone *= mix(vec3(1.0), pebbleTone(p, px), sand * grey);
    }
    diffuseColor.rgb *= tone;
  }
}
`;

/**
 * The film look's ground: the same painted colour map, its grass and earth painted over it the
 * film's way where `kinds` says they lie, lit by the sun through the soft ramp and shaded where
 * rocks, trees and houses cast their shadows, without the pen's waterline (the film paints its
 * shores without a line).
 */
function filmGroundMaterial(
  colours: THREE.Texture,
  info: TerrainInfo,
  floor: THREE.Texture,
  kinds: THREE.Texture | null,
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
    });
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vGroundWorld;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGroundWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        ${FLOOR_GLSL}
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
          if (abs(h - level) < 0.6) h = floorAtExact(vGroundWorld.xz);
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

  const [buffer, colours, kinds] = await Promise.all([
    fetch(info.height.url).then((r) => {
      if (!r.ok) throw new Error(`Could not load ${info.height.url}`);
      return r.arrayBuffer();
    }),
    new THREE.TextureLoader().loadAsync(info.colours),
    FILM && info.kinds ? new THREE.TextureLoader().loadAsync(info.kinds) : Promise.resolve(null),
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
  if (kinds) {
    kinds.flipY = false;
    kinds.colorSpace = THREE.NoColorSpace;
    kinds.needsUpdate = true;
  }
  found.removeFromParent();
  found.position.set(0, 0, 0);
  found.rotation.set(0, 0, 0);
  found.scale.set(1, 1, 1);

  terrain = new Terrain(info, heights, found);
  found.material = FILM ? filmGroundMaterial(colours, info, terrain.texture, kinds) : groundMaterial(colours, info, terrain.texture);
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
  const ground = terrain ? terrain.height(x, z) : 0;
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

/** Whether the camera may be at (x, y, z): not inside a rock, a prop or a tree's crown. */
export function cameraClear(x: number, y: number, z: number): boolean {
  if (terrain && terrain.nearRock(x, z, CAMERA_MARGIN)) return false;
  return !cameraBlocked(x, y, z, CAMERA_MARGIN);
}

/**
 * Keeps a character who moved from `from` to `p` on ground they can stand on (`from.y` is where
 * their feet were): if `p` is in deep water, up a cliff, too high a step or inside something, they
 * slide along it (keeping whichever of the two moves is allowed), or stay where they were.
 */
export function clampToWalkable(p: THREE.Vector3, from: THREE.Vector3): void {
  const feet = from.y;
  if (!terrain || terrain.walkable(p.x, p.z, feet)) return;
  // Someone already somewhere they could not walk to (placed there) may walk out of it.
  if (!terrain.walkable(from.x, from.z, feet)) return;
  if (terrain.walkable(p.x, from.z, feet)) p.z = from.z;
  else if (terrain.walkable(from.x, p.z, feet)) p.x = from.x;
  else {
    p.x = from.x;
    p.z = from.z;
  }
}

/** Whether someone in the air with their feet at `y` can be at (x, z): not in a rock, nor in a prop
 * or a stepping stone's body at their height, nor over the cave skylight's opening, nor in ground
 * more than a step above their feet. */
function clearInAir(x: number, z: number, y: number): boolean {
  if (!terrain) return true;
  if (terrain.nearRock(x, z, ROCK_MARGIN) || terrain.nearSkylight(x, z, EDGE_MARGIN) || blocked(x, z, PROP_MARGIN, y)) return false;
  return terrain.height(x, z) <= y + STEP_UP;
}

/**
 * Keeps a character in the air (their feet at `y`) who moved from `from` to `p` from passing into
 * anything standing higher than their feet: over a gap, a drop or water they carry on; against a
 * rock, a prop, a stepping stone's side or a bank they slide along it, or stay where they were.
 */
export function clampInAir(p: THREE.Vector3, from: THREE.Vector3, y: number): void {
  if (!terrain || clearInAir(p.x, p.z, y) || !clearInAir(from.x, from.z, y)) return;
  if (clearInAir(p.x, from.z, y)) p.z = from.z;
  else if (clearInAir(from.x, p.z, y)) p.x = from.x;
  else {
    p.x = from.x;
    p.z = from.z;
  }
}

/**
 * Whether someone whose feet came down to `y` at p fell into water too deep to stand in (the river
 * under the stepping stones, the sea off a rock): if so they climb out at the nearest shore, p
 * moved there (see climbOut).
 */
export function splashDown(p: THREE.Vector3, y: number): boolean {
  if (!terrain) return false;
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
