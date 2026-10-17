import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { sharedUniforms } from '../characters/CharacterMaterial';
import { PEN_GLSL, inkUniforms } from './Ink';
import { FILM, coverTrees, hazeClearing, paintedRamp, shadeUnderTrees } from './Look';
import { addRing, blocked, cameraBlocked, deckUnder, outlineAt } from './Obstacles';

/** What art/blender/build_island.py writes into the ground's glTF extras. */
export interface TerrainInfo {
  version: number;
  /** The map is a square this many metres across, starting at `origin` (x, z: its north-west corner). */
  size: number;
  origin: [number, number];
  /** The sea's surface height. */
  water: number;
  /** Ground heights on a grid x grid square over the map, as 16-bit values between min and max. */
  height: { url: string; grid: number; min: number; max: number };
  /** The painted colour map, laid over the whole square from above. */
  colours: string;
  /** A cave's skylight, a round opening in the ground over the sea come in under the island, if the
   * island has one (the cave is still to be placed): its middle (x, z), its edge (an outline, as
   * `outlineAt` reads it), and the mossy lip round it, out to `lip` from the middle, at `top`. */
  skylight?: { centre: [number, number]; edge: number[]; lip: number; top: number };
  /** The rock landmarks, the sea cliffs and the waterfall, built with the ground. */
  landmarks: string;
  /** Each rock's foot: its middle (x, z), and how far it reaches at even angles round it from east toward south. */
  rocks: { centre: [number, number]; outline: number[] }[];
  /** The jungle waterfall's pool: its water stands at `level` within `radius` of `centre` (x, z). */
  pool?: { centre: [number, number]; radius: number; level: number };
  /** Where the waterfall lands in its pool (x, z), and how far its splash spreads. */
  waterfall?: { foot: [number, number]; splash: number };
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

  /**
   * Whether a character whose feet were at `feet` can stand at (x, z): not bumping into a rock or
   * a prop, and either on a deck they can step onto, or on ground that is not under water deeper
   * than a wade nor up a cliff.
   */
  walkable(x: number, z: number, feet: number): boolean {
    if (this.nearRock(x, z, ROCK_MARGIN)) return false;
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
 * The film look's ground: the same painted colour map, lit by the sun through the soft ramp and
 * shaded where rocks, trees and houses cast their shadows, without the pen's waterline (the film
 * paints its shores without a line).
 */
function filmGroundMaterial(colours: THREE.Texture, info: TerrainInfo, floor: THREE.Texture): THREE.MeshToonMaterial {
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
    });
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vGroundWorld;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGroundWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        ${FLOOR_GLSL}
        uniform vec3 uEdge;
        uniform float uSea;
        uniform vec4 uPool;
        varying vec3 vGroundWorld;`,
      )
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
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
  };
  return material;
}

let terrain: Terrain | null = null;

/** Loads the island's ground once: its mesh, painted colours and height grid. */
export async function loadTerrain(): Promise<Terrain> {
  const gltf = await new GLTFLoader().loadAsync('models/island/terrain.glb');
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

  const [buffer, colours] = await Promise.all([
    fetch(info.height.url).then((r) => {
      if (!r.ok) throw new Error(`Could not load ${info.height.url}`);
      return r.arrayBuffer();
    }),
    new THREE.TextureLoader().loadAsync(info.colours),
  ]);
  const { grid, min, max } = info.height;
  const q = new Uint16Array(buffer);
  if (q.length !== grid * grid) throw new Error('height.bin does not match its grid');
  const heights = new Float32Array(q.length);
  for (let i = 0; i < q.length; i++) heights[i] = min + (q[i] / 65535) * (max - min);

  // The glTF's UVs start at the image's top-left (north-west), as the colour map is painted.
  colours.flipY = false;
  colours.colorSpace = THREE.SRGBColorSpace;
  colours.anisotropy = 4;
  colours.needsUpdate = true;
  found.removeFromParent();
  found.position.set(0, 0, 0);
  found.rotation.set(0, 0, 0);
  found.scale.set(1, 1, 1);

  terrain = new Terrain(info, heights, found);
  found.material = FILM ? filmGroundMaterial(colours, info, terrain.texture) : groundMaterial(colours, info, terrain.texture);
  found.receiveShadow = FILM;
  // The mossy lip round a cave's skylight is a ledge to walk on, up to a step back from its edge.
  if (info.skylight) {
    const { centre, edge, lip, top } = info.skylight;
    addRing(centre[0], centre[1], edge.map((r) => r + EDGE_MARGIN), lip, top);
  }
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
