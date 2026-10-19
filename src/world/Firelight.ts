import * as THREE from 'three';
import { lightBlocked } from './Obstacles';

/** Each kind of source: its colour, how bright, and how far its light reaches, in metres. */
const KINDS = {
  flame: { colour: new THREE.Color('#FF8A30'), intensity: 24, reach: 15, warmth: 1 },
  // A lantern: a warm pool round where it hangs, so where they stand thick, along the festival's
  // street, the night still shows blue between the pools.
  glow: { colour: new THREE.Color('#FFBE72'), intensity: 3, reach: 6, warmth: 0.45 },
  // A room's lantern: bright enough to light the room from where it hangs, reaching little past it.
  // Its light on its house is baked (see Props), falling off and shadowed, coming back off the wood
  // only as much as the wood's colours give back; this bright, the room's lit side is as warm as when
  // its light filled the room evenly, while its corners and the floor under the furniture go dark.
  lamp: { colour: new THREE.Color('#FFBE72'), intensity: 20, reach: 6.5, warmth: 0.9 },
  // A room's lantern's own light out through one of its doorways or windows (see Opening), reaching
  // out over the ground before the house: as bright as the lantern, so it carries on from the light
  // baked on the house's porch.
  opening: { colour: new THREE.Color('#FFBE72'), intensity: 20, reach: 9, warmth: 0.9 },
} as const;
export type FireKind = keyof typeof KINDS;
/** How many of the sources reaching a character light them (see Firelight.lightsAt), the strongest. */
export const CHARACTER_LIGHTS = 4;
/** How fast a light comes and goes on a character as a wall comes between them, per second. */
const SEEN_RATE = 8;
/** How much a lit room's light, coming back off its walls, warms who stands in it, all round (as
 * the room's walls take its fill, uFireRoomFill). */
const ROOM_WARMTH = 0.7;
/** A light's way to a character starts this far out from the light, in metres, clear of its own
 * lantern or pole. */
const LIGHT_CLEAR = 0.3;
/** The light grid's cells, in metres across, and how many sources each cell holds at most, four to
 * a texel of the grid's texture: where more reach a cell (up to 12 along the festival's street), the
 * weakest there are left out, too faint beside the rest to show. */
const CELL = 2;
const SLOTS = 8;
const TEXELS = SLOTS / 4;
/** A grid slot holding no source; so at most 255 sources. */
const EMPTY = 255;
/** How a source lights what it reaches (the grid's table, row 4): all round, only in its room, or
 * only out through its opening. */
const SHAPE = { round: 0, room: 1, opening: 2 } as const;
/** How soft an opening's light's edge is, in metres either side of its frame where it lands. */
const OPENING_SOFT = 0.06;
/** Texels across an opening's mask (see Opening.mask). */
export const MASK = 32;

/** The room a lantern hangs in, which it alone lights: a box (its middle and half sizes, in metres)
 * turned `yaw` about the upright. */
export interface Room {
  centre: THREE.Vector3;
  half: THREE.Vector3;
  yaw: number;
}

/** A doorway or window a lantern's light passes out through, in the world: its middle on the wall's
 * outer face, the level way out of it, and its half width and half height; and where the light
 * passes, as its house's bake found (see opening_masks in art/blender/houses.py): over the opening,
 * MASK texels from its right to its left as one looks out through it, by MASK from its foot up, how
 * much of the lantern each sees, 0 to 255, so an open door leaf or a window's lattice shadows the
 * ground outside as it does the porch. Clear all over when left out. */
export interface Opening {
  centre: THREE.Vector3;
  out: THREE.Vector3;
  half: [number, number];
  mask?: Uint8Array;
}

/** What a source can be besides where it is and what kind: its lantern's room; the opening its light
 * passes out of; and, where a house has its lantern's light baked into it (see Props), that lantern:
 * the lantern itself, or the one whose light passes out of the opening. */
export interface SourceOptions {
  room?: Room | null;
  opening?: Opening | null;
  owner?: number;
}

interface Source {
  position: THREE.Vector3;
  kind: FireKind;
  phase: number;
  room: Room | null;
  opening: Opening | null;
  /** The lantern whose light, on its own house, is baked into the house, or -1: the grid leaves the
   * lantern and its light out of the house's openings off that house (see NIGHT_MAP). */
  owner: number;
}

/**
 * The light grid, for everything lit (see fireLights): each source in a texel column (row 0, its
 * place and reach; 1, its colour this moment; 2 and 3, its room's middle and half sizes with the
 * cosine and sine of its turn, or its opening's middle and way out with its half width and height;
 * 4, how it lights (SHAPE), its owner plus one and its opening's mask plus one), and the island in
 * cells of CELL metres, each listing the sources that reach it, the strongest first.
 */
export const fireUniforms = {
  uFireLights: { value: null as THREE.DataTexture | null },
  uFireGrid: { value: null as THREE.DataTexture | null },
  /** The grid's corner (x, z) and its cells' size. */
  uFireGridMap: { value: new THREE.Vector4(0, 0, 1, 0) },
  /** 1 while the firelight burns (from dusk to dawn), else 0. */
  uFireOn: { value: 0 },
  /** How much of a room's lantern comes back off the room's walls, filling it softly all over, as a
   * share of the lantern's light, on what stands in the room besides its house, whose own light from
   * the lantern is baked (see Props). */
  uFireRoomFill: { value: 0.12 },
  /** The openings' masks (see Opening.mask), one above another. */
  uFireMasks: { value: null as THREE.DataTexture | null },
};

const FIRE_PARS = /* glsl */ `
uniform sampler2D uFireLights;
uniform sampler2D uFireGrid;
uniform vec4 uFireGridMap;
uniform float uFireOn;
uniform float uFireRoomFill;
uniform sampler2D uFireMasks;
`;

/** GLSL, after three's own lights: every source the grid lists for this point's cell, lit as three
 * lights a point light (the same falloff and ramp); a room's lantern only inside its room, which its
 * light, coming back off the walls, also fills softly wherever it faces into the room; a lantern's
 * light out of an opening only where its way from the lantern passes through the opening. A house
 * with its night baked (NIGHT_MAP, vNight.x its lantern plus one) takes neither from its own lantern. */
const FIRE_LIGHT = /* glsl */ `
if (uFireOn > 0.5) {
  vec3 fireAt = cameraPosition + transpose(mat3(viewMatrix)) * geometryPosition;
  vec2 fireCell = (fireAt.xz - uFireGridMap.xy) / uFireGridMap.z;
  ivec2 fireCells = textureSize(uFireGrid, 0);
  if (fireCell.x >= 0.0 && fireCell.y >= 0.0 && fireCell.x < float(fireCells.x / ${TEXELS}) && fireCell.y < float(fireCells.y)) {
    ivec2 fireTexel = ivec2(int(fireCell.x) * ${TEXELS}, int(fireCell.y));
    for (int fireT = 0; fireT < ${TEXELS}; fireT++) {
      vec4 fireSlots = texelFetch(uFireGrid, fireTexel + ivec2(fireT, 0), 0) * 255.0;
      for (int fireK = 0; fireK < 4; fireK++) {
        if (fireSlots[fireK] > 254.5) break;
        int fireI = int(fireSlots[fireK] + 0.5);
        vec4 fireHow = texelFetch(uFireLights, ivec2(fireI, 4), 0);
        #ifdef NIGHT_MAP
        if (fireHow.y > 0.5 && abs(fireHow.y - vNight.x) < 0.5) continue;
        #endif
        vec4 fireSpot = texelFetch(uFireLights, ivec2(fireI, 0), 0);
        vec3 fireColour = texelFetch(uFireLights, ivec2(fireI, 1), 0).rgb;
        vec3 fireWay = fireSpot.xyz - fireAt;
        float fireD = length(fireWay);
        if (fireHow.x > 1.5) {
          // Out through a doorway or a window: beyond it, where the way from the lantern passes
          // through it, softly at its frame, as much as its mask lets through there.
          vec4 fireHole = texelFetch(uFireLights, ivec2(fireI, 2), 0);
          vec4 fireFace = texelFetch(uFireLights, ivec2(fireI, 3), 0);
          if (dot(fireAt - fireHole.xyz, fireFace.xyz) <= 0.0) continue;
          float fireThrough = dot(fireHole.xyz - fireSpot.xyz, fireFace.xyz) / dot(fireAt - fireSpot.xyz, fireFace.xyz);
          vec3 fireCross = fireSpot.xyz + (fireAt - fireSpot.xyz) * fireThrough - fireHole.xyz;
          float fireAlong = dot(fireCross, normalize(vec3(fireFace.z, 0.0, -fireFace.x)));
          float firePass = (1.0 - smoothstep(fireHole.w - ${OPENING_SOFT.toFixed(2)}, fireHole.w + ${OPENING_SOFT.toFixed(2)}, abs(fireAlong)))
            * (1.0 - smoothstep(fireFace.w - ${OPENING_SOFT.toFixed(2)}, fireFace.w + ${OPENING_SOFT.toFixed(2)}, abs(fireCross.y)));
          if (firePass <= 0.0) continue;
          if (fireHow.z > 0.5) {
            vec2 fireMask = clamp(vec2(fireAlong / fireHole.w, fireCross.y / fireFace.w) * 0.5 + 0.5, 0.0, 1.0) * ${MASK - 1}.0 + 0.5;
            firePass *= texture2D(uFireMasks, vec2(fireMask.x, (fireHow.z - 1.0) * ${MASK}.0 + fireMask.y) / vec2(textureSize(uFireMasks, 0))).r;
            if (firePass <= 0.0) continue;
          }
          fireColour *= firePass;
        } else if (fireHow.x > 0.5) {
          vec4 fireMiddle = texelFetch(uFireLights, ivec2(fireI, 2), 0);
          vec4 fireRoom = texelFetch(uFireLights, ivec2(fireI, 3), 0);
          vec3 fireQ = fireAt - fireMiddle.xyz;
          vec3 fireLocal = vec3(fireMiddle.w * fireQ.x - fireRoom.w * fireQ.z, fireQ.y, fireRoom.w * fireQ.x + fireMiddle.w * fireQ.z);
          if (any(greaterThan(abs(fireLocal), fireRoom.xyz))) continue;
          // Only what faces into the room: a wall's outer face can lie inside the box too.
          float fireInward = dot(geometryNormal, mat3(viewMatrix) * normalize(fireMiddle.xyz - fireAt));
          reflectedLight.indirectDiffuse += fireColour * uFireRoomFill * smoothstep(-0.1, 0.3, fireInward) * BRDF_Lambert(material.diffuseColor);
        }
        if (fireD >= fireSpot.w) continue;
        directLight.direction = mat3(viewMatrix) * (fireWay / fireD);
        directLight.color = fireColour * getDistanceAttenuation(fireD, fireSpot.w, 2.0);
        directLight.visible = true;
        RE_Direct(directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight);
      }
      if (fireSlots.w > 254.5) break;
    }
  }
}
`;

/** Lights a lit material by the firelight, from its onBeforeCompile (see Firelight). */
export function fireLights(shader: THREE.WebGLProgramParametersWithUniforms): void {
  Object.assign(shader.uniforms, fireUniforms);
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', `#include <common>\n${FIRE_PARS}`)
    .replace('#include <lights_fragment_begin>', `#include <lights_fragment_begin>\n${FIRE_LIGHT}`);
}

/** Whether (x, y, z) is inside `room`. */
function inRoom(room: Room, x: number, y: number, z: number): boolean {
  const qx = x - room.centre.x;
  const qz = z - room.centre.z;
  const c = Math.cos(room.yaw);
  const s = Math.sin(room.yaw);
  return (
    Math.abs(c * qx - s * qz) <= room.half.x && Math.abs(y - room.centre.y) <= room.half.y && Math.abs(s * qx + c * qz) <= room.half.z
  );
}

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(Math.max((x - a) / (b - a), 0), 1);
  return t * t * (3 - 2 * t);
};

/** An opening's mask (see Opening.mask) at (s, t), each 0 to 1 over the opening, from its right and
 * from its foot, 0 to 1, filtered as the GPU filters it. */
function maskAt(mask: Uint8Array, s: number, t: number): number {
  const x = Math.min(Math.max(s, 0), 1) * (MASK - 1);
  const y = Math.min(Math.max(t, 0), 1) * (MASK - 1);
  const i = Math.min(Math.floor(x), MASK - 2);
  const j = Math.min(Math.floor(y), MASK - 2);
  const fx = x - i;
  const fy = y - j;
  const at = (a: number, b: number) => mask[b * MASK + a] / 255;
  return (at(i, j) * (1 - fx) + at(i + 1, j) * fx) * (1 - fy) + (at(i, j + 1) * (1 - fx) + at(i + 1, j + 1) * fx) * fy;
}

/** How much of a lantern at `from` reaches (x, y, z) out through `opening`, 0 to 1, as the grid's
 * shader works it out (see FIRE_LIGHT). */
function throughOpening(opening: Opening, from: THREE.Vector3, x: number, y: number, z: number): number {
  const { centre, out, half, mask } = opening;
  const beyond = (x - centre.x) * out.x + (y - centre.y) * out.y + (z - centre.z) * out.z;
  if (beyond <= 0) return 0;
  const along = (x - from.x) * out.x + (y - from.y) * out.y + (z - from.z) * out.z;
  const t = ((centre.x - from.x) * out.x + (centre.y - from.y) * out.y + (centre.z - from.z) * out.z) / along;
  const cx = from.x + (x - from.x) * t - centre.x;
  const cy = from.y + (y - from.y) * t - centre.y;
  const cz = from.z + (z - from.z) * t - centre.z;
  const across = (cx * out.z - cz * out.x) / (Math.hypot(out.x, out.z) || 1);
  const pass =
    (1 - smoothstep(half[0] - OPENING_SOFT, half[0] + OPENING_SOFT, Math.abs(across))) *
    (1 - smoothstep(half[1] - OPENING_SOFT, half[1] + OPENING_SOFT, Math.abs(cy)));
  return pass > 0 && mask ? pass * maskAt(mask, (across / half[0]) * 0.5 + 0.5, (cy / half[1]) * 0.5 + 0.5) : pass;
}

/**
 * Whether a lantern at `from` lights any of the square from (x0, z0) to (x1, z1) out through
 * `opening`, seen from above: whether any of the square beyond the opening's wall lies between the
 * ways from the lantern past either side of the opening. The square's corners beyond the wall, and
 * where its sides cross the wall, are each seen from the lantern on the wall's line; the opening
 * lights the square if what they span there overlaps it.
 */
function openingReaches(opening: Opening, from: THREE.Vector3, x0: number, z0: number, x1: number, z1: number): boolean {
  const { centre, out, half } = opening;
  // How far the wall stands out from the lantern.
  const wall = (centre.x - from.x) * out.x + (centre.z - from.z) * out.z;
  const along = (x: number, z: number) => ((x - centre.x) * out.z - (z - centre.z) * out.x) / (Math.hypot(out.x, out.z) || 1);
  const corners = [
    [x0, z0],
    [x1, z0],
    [x1, z1],
    [x0, z1],
  ];
  let lo = Infinity;
  let hi = -Infinity;
  const span = (at: number) => {
    lo = Math.min(lo, at);
    hi = Math.max(hi, at);
  };
  corners.forEach(([ax, az], k) => {
    const [bx, bz] = corners[(k + 1) % 4];
    const beyondA = (ax - from.x) * out.x + (az - from.z) * out.z - wall;
    const beyondB = (bx - from.x) * out.x + (bz - from.z) * out.z - wall;
    if (beyondA > 0) {
      const t = wall / (beyondA + wall);
      span(along(from.x + (ax - from.x) * t, from.z + (az - from.z) * t));
    }
    if (beyondA > 0 !== beyondB > 0) {
      const u = beyondA / (beyondA - beyondB);
      span(along(ax + (bx - ax) * u, az + (bz - az) * u));
    }
  });
  return lo <= half[0] + OPENING_SOFT && hi >= -half[0] - OPENING_SOFT;
}

/**
 * Firelight after dark, in the film look: the torches' flames and the lit windows and lanterns
 * light what stands round them warm against the blue night, flickering, as the film's torches light
 * its village. Every source lights what it reaches, from any distance: a grid over the island lists
 * the sources reaching each cell, and every lit material adds those (see fireLights), so what each
 * point pays for is the few lights that reach it. A room's lantern lights only its room, which its
 * light also fills softly, coming back off the walls; where its house has its night baked, the
 * lantern's light on the house is in the bake, and it lights the world outside out through the
 * house's doorways and windows. Characters are lit by the strongest few sources that reach them,
 * each from its own way, unless a wall stands between (see lightsAt).
 */
export class Firelight {
  private readonly sources: Source[] = [];
  /** The grid's sources, as fireUniforms.uFireLights holds them. */
  private table: Float32Array | null = null;
  /** What the light grid holds (for development): its sources, its cells across and down, the most
   * sources reaching one cell and how many cells have more than fit. */
  gridStats: { sources: number; cells: [number, number]; most: number; crowded: number } | null = null;
  private glow = 0;
  private time = 0;

  /** A flame, a glowing window or lantern, a room's lantern, or a lantern's light out of an opening
   * at `position` (for an opening, where its lantern hangs), with what it lights (see
   * SourceOptions). An opening's light flickers with its lantern's. */
  add(position: THREE.Vector3, kind: FireKind, options: SourceOptions = {}): void {
    const owner = options.owner ?? -1;
    const lantern = kind === 'opening' ? this.sources[owner] : undefined;
    this.sources.push({
      position: position.clone(),
      kind,
      phase: lantern ? lantern.phase : this.sources.length * 1.7,
      room: options.room ?? null,
      opening: options.opening ?? null,
      owner,
    });
  }

  /**
   * Lays out the light grid once every source is in (see fireUniforms): each cell lists the sources
   * whose reach comes within it, the strongest at the cell's nearest point first, as many as fit; a
   * lantern's light out of an opening only cells it reaches through the opening (see openingReaches).
   */
  build(): void {
    const n = this.sources.length;
    if (n === 0) return;
    if (n >= EMPTY) console.warn(`The light grid holds ${EMPTY - 1} sources; ${n - EMPTY + 1} left out`);
    const width = n;
    const table = new Float32Array(width * 5 * 4);
    // The openings' masks, one above another.
    const masked = this.sources.filter((s) => s.opening?.mask);
    const masks = new Uint8Array(MASK * MASK * Math.max(masked.length, 1)).fill(255);
    masked.forEach((s, k) => masks.set(s.opening?.mask as Uint8Array, k * MASK * MASK));
    this.sources.forEach((s, i) => {
      table.set([s.position.x, s.position.y, s.position.z, KINDS[s.kind].reach], i * 4);
      if (s.opening) {
        const { centre, out, half } = s.opening;
        table.set([centre.x, centre.y, centre.z, half[0]], (2 * width + i) * 4);
        table.set([out.x, out.y, out.z, half[1]], (3 * width + i) * 4);
      } else if (s.room) {
        const { centre, half, yaw } = s.room;
        table.set([centre.x, centre.y, centre.z, Math.cos(yaw)], (2 * width + i) * 4);
        table.set([half.x, half.y, half.z, Math.sin(yaw)], (3 * width + i) * 4);
      }
      const shape = s.opening ? SHAPE.opening : s.room ? SHAPE.room : SHAPE.round;
      table.set([shape, s.owner + 1, masked.indexOf(s) + 1, 0], (4 * width + i) * 4);
    });
    const lights = new THREE.DataTexture(table, width, 5, THREE.RGBAFormat, THREE.FloatType);
    lights.needsUpdate = true;
    this.table = table;
    const maskTexture = new THREE.DataTexture(masks, MASK, MASK * Math.max(masked.length, 1), THREE.RedFormat, THREE.UnsignedByteType);
    maskTexture.minFilter = maskTexture.magFilter = THREE.LinearFilter;
    maskTexture.needsUpdate = true;

    let x0 = Infinity;
    let z0 = Infinity;
    let x1 = -Infinity;
    let z1 = -Infinity;
    for (const s of this.sources) {
      const r = KINDS[s.kind].reach;
      x0 = Math.min(x0, s.position.x - r);
      z0 = Math.min(z0, s.position.z - r);
      x1 = Math.max(x1, s.position.x + r);
      z1 = Math.max(z1, s.position.z + r);
    }
    const across = Math.ceil((x1 - x0) / CELL);
    const down = Math.ceil((z1 - z0) / CELL);
    const cells: { i: number; strength: number }[][] = Array.from({ length: across * down }, () => []);
    this.sources.forEach((s, i) => {
      if (i >= EMPTY) return;
      const { reach, intensity } = KINDS[s.kind];
      const { x, z } = s.position;
      const a0 = Math.max(Math.floor((x - reach - x0) / CELL), 0);
      const a1 = Math.min(Math.floor((x + reach - x0) / CELL), across - 1);
      const b0 = Math.max(Math.floor((z - reach - z0) / CELL), 0);
      const b1 = Math.min(Math.floor((z + reach - z0) / CELL), down - 1);
      for (let b = b0; b <= b1; b++) {
        for (let a = a0; a <= a1; a++) {
          // The cell's nearest point to the source, seen from above.
          const dx = Math.max(x0 + a * CELL - x, 0, x - (x0 + (a + 1) * CELL));
          const dz = Math.max(z0 + b * CELL - z, 0, z - (z0 + (b + 1) * CELL));
          const d = Math.hypot(dx, dz);
          if (d >= reach) continue;
          if (s.opening && !openingReaches(s.opening, s.position, x0 + a * CELL, z0 + b * CELL, x0 + (a + 1) * CELL, z0 + (b + 1) * CELL)) {
            continue;
          }
          const strength = (intensity / Math.max(d * d, 1)) * (1 - (d / reach) ** 4) ** 2;
          cells[b * across + a].push({ i, strength });
        }
      }
    });
    const grid = new Uint8Array(across * TEXELS * down * 4).fill(EMPTY);
    let most = 0;
    let crowded = 0;
    cells.forEach((list, k) => {
      most = Math.max(most, list.length);
      if (list.length > SLOTS) crowded++;
      list.sort((p, q) => q.strength - p.strength);
      list.slice(0, SLOTS).forEach((entry, slot) => (grid[k * SLOTS + slot] = entry.i));
    });
    const texture = new THREE.DataTexture(grid, across * TEXELS, down, THREE.RGBAFormat, THREE.UnsignedByteType);
    texture.needsUpdate = true;
    fireUniforms.uFireLights.value = lights;
    fireUniforms.uFireGrid.value = texture;
    fireUniforms.uFireMasks.value = maskTexture;
    fireUniforms.uFireGridMap.value.set(x0, z0, CELL, 0);
    this.gridStats = { sources: n, cells: [across, down], most, crowded };
  }

  /** How bright a source burns this moment: a flame wavers, a lantern barely. */
  private flicker(s: Source): number {
    if (s.kind !== 'flame') return 0.95 + 0.05 * Math.sin(this.time * 2.5 + s.phase);
    const t = this.time * 9 + s.phase;
    return 0.82 + 0.1 * Math.sin(t) + 0.08 * Math.sin(t * 2.7 + 1.3);
  }

  /** Every source's colour this moment into the light grid; `glow` is how lit the island's lights
   * are (0 by day, 1 at night). */
  update(glow: number, time: number): void {
    this.glow = glow;
    this.time = time;
    const table = this.table;
    const lights = fireUniforms.uFireLights.value;
    fireUniforms.uFireOn.value = glow > 0 && table ? 1 : 0;
    if (!table || !lights || glow <= 0) return;
    const width = this.sources.length;
    this.sources.forEach((s, i) => {
      const kind = KINDS[s.kind];
      const k = kind.intensity * glow * this.flicker(s);
      table.set([kind.colour.r * k, kind.colour.g * k, kind.colour.b * k, 0], (width + i) * 4);
    });
    lights.needsUpdate = true;
  }

  /**
   * The firelight on a character at (x, y, z) this moment: in `out`, the strongest few sources'
   * ways from the character to them (x, y, z) and how much each warms them (w), strongest first, the
   * rest 0; `from`, where the strongest is. A wall, a roof or a rock between them shuts a source
   * out, a room's lantern lights only who is in its room, and its light out of an opening only who
   * stands in it. `seen` is the character's own memory of how clearly each source reaches them, so a
   * light comes and goes softly as a wall passes, over `dt` seconds. Returns how much a lit room
   * they stand in warms them all round (ROOM_WARMTH).
   */
  lightsAt(x: number, y: number, z: number, seen: Map<number, number>, dt: number, out: THREE.Vector4[], from: THREE.Vector3): number {
    for (const v of out) v.set(0, 0, 0, 0);
    if (this.glow <= 0) {
      seen.clear();
      return 0;
    }
    const ease = Math.min(1, dt * SEEN_RATE);
    let fill = 0;
    this.sources.forEach((s, i) => {
      const kind = KINDS[s.kind];
      const dx = s.position.x - x;
      const dy = s.position.y - y;
      const dz = s.position.z - z;
      const d = Math.hypot(dx, dy, dz);
      if (d >= kind.reach) {
        seen.delete(i);
        return;
      }
      const clear = s.opening
        ? throughOpening(s.opening, s.position, x, y, z)
        : s.room
          ? Number(inRoom(s.room, x, y, z))
          : Number(
              d <= LIGHT_CLEAR ||
                !lightBlocked(s.position.x - (dx / d) * LIGHT_CLEAR, s.position.y - (dy / d) * LIGHT_CLEAR, s.position.z - (dz / d) * LIGHT_CLEAR, x, y, z),
            );
      const was = seen.get(i);
      const now = was === undefined ? clear : was + (clear - was) * ease;
      seen.set(i, now);
      if (s.room) fill = Math.max(fill, ROOM_WARMTH * this.flicker(s) * this.glow * now);
      const w = (1 - d / kind.reach) ** 2 * kind.warmth * this.flicker(s) * this.glow * now;
      if (w <= out[out.length - 1].w) return;
      // In among the strongest, kept in order.
      let k = out.length - 1;
      while (k > 0 && out[k - 1].w < w) {
        out[k].copy(out[k - 1]);
        k--;
      }
      out[k].set(dx / d, dy / d, dz / d, w);
      if (k === 0) from.copy(s.position);
    });
    return fill;
  }
}
