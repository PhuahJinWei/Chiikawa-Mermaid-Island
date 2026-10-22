import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { sceneryRamp } from '../core/toon';
import { t, type StringKey } from '../i18n/I18n';
import { fireLights, type FireKind, type Room, type SourceOptions } from './Firelight';
import { glowMaterial, glowUniforms, paneMaterial } from './Glow';
import { INK, addOutline, windUniforms } from './Ink';
import { terrainHeight } from './Island';
import { FILM, MIRROR_LAYER, paintThatch, paintWood } from './Look';
import { addBox, addCircle, addDeck } from './Obstacles';
import { loadPropModel, type LabelInfo, type PartRole, type PropInfo, type PropModel } from './PropModels';

/** One prop placed on the island, as public/data/layout.json lists it. */
export interface Placed {
  /** Which prop: a file in public/models/props. */
  kind: string;
  x: number;
  z: number;
  /** Degrees it is turned, as seen from above; at 0 it faces south (+z). */
  turn?: number;
  scale?: number;
  /** Height of its origin; the ground under it when left out. */
  y?: number;
  /** Floats on the sea, bobbing gently. */
  float?: boolean;
  /** Words painted on its label faces: keys into the game's text, one per face. */
  label?: string;
  labels?: string[];
  /** A colour laid over its own (starfish come in several). */
  tint?: string;
  /** What a stall sells, and the tools it is made with, on its counter and its work table: a prop
   * of its own (goods_<this>) standing in it. */
  goods?: string;
  /** Props in the same group are joined together and drawn near or far together; others are
   * grouped by patch of the island. */
  group?: string;
}

/** Props are joined into meshes for each patch of this many metres, unless they name a group. */
const PATCH = 48;
/** The land's own things, which the film paints without a line, as it paints its ground and trees.
 * Everything else placed is made (houses, stalls, flags, lanterns, furniture, poles, banners, pots,
 * logs), and the film draws its props with the pen, as it draws its characters. */
const UNLINED = new Set(['palm', 'starfish']);
/** What stands in the water, which the calm water mirrors in the film look (see Stage.drawMirror):
 * joined with the festival's stalls for drawing, so it has a copy of its own for the mirror, which
 * would otherwise draw the whole festival. (What floats, the ferry, is its own object, and mirrored
 * as it is.) */
const MIRRORED = new Set(['pier', 'quay']);
/** A group's houses are drawn in full this close, and in their light far version beyond; their
 * rooms' insides only this close. */
const NEAR_REACH = 75;
const INSIDE_REACH = 32;
/**
 * The windows' glass (see paneMaterial): in the film look every room is lit by its lantern, from any
 * distance (see Firelight), so the glass is clear as far off as the rooms are drawn (a pane that near
 * is always in a group near enough for its insides), then a lit stand-in, a little brighter than the
 * lantern-lit room seen through the glass and short of the glow. In the toon look, where nothing is
 * lit by the lanterns, it is clear only close by, then lit as the windows are.
 */
const PANE = FILM ? { clear: INSIDE_REACH - 8, lit: INSIDE_REACH, bright: 0.4 } : { clear: 8, lit: 14, bright: 1 };
/** Small props (within a metre and a half of their middle: baskets, pots, logs, starfish), and a
 * stall's goods however far they spread over its counter and table, are drawn only this close. */
const SMALL_SIZE = 1.5;
const SMALL_REACH = 60;
/** Painted words go into one atlas this size, as sharp as fits: at most LABEL_PIXELS pixels per
 * metre of a label face, fewer if every label would not fit otherwise. */
const LABEL_PIXELS = 220;
const ATLAS_WIDTH = 2048;
const ATLAS_HEIGHT = 1024;
/** Pixels of gutter round each label's patch in the atlas. A hand-lettered sign's edges are carried
 * out into it, so a sign filling its board to the edges never takes its neighbour's colours there,
 * near or far (where the texture's smaller copies blend neighbouring pixels). */
const LABEL_GUTTER = 4;
/** Pieces of a part that glows or burns lying closer than this, in metres, are one light (a stack
 * of lanterns on a pole); further apart, each is its own (the arch's two stacks, the lanterns
 * along a string). */
const LIGHT_GAP = 0.6;

/** Which pieces of a group are drawn when: always, near, inside (closer still), far, or at night. */
type Level = 'always' | 'near' | 'small' | 'inside' | 'far' | 'night';
/** How a piece is drawn: as the props are, as a house lit at night by its own lantern's baked light
 * (its body and room, see nightMaterial), glowing, as a window's pane, or as a flame. */
type Kind = 'body' | 'baked' | 'glow' | 'pane' | 'flame';

interface Group {
  geometries: Map<string, THREE.BufferGeometry[]>;
  objects: Map<Level, THREE.Object3D[]>;
  centre: THREE.Vector3;
  radius: number;
}

interface Label {
  geometry: THREE.BufferGeometry;
  /** The key of its words in the game's text, which also names its hand-lettered sign. */
  key: string;
  text: string;
  info: LabelInfo;
}

interface PaintedSigns {
  /** The paintings, by the key of their sign's words. */
  paintings: Map<string, ImageBitmap>;
  /** The colour of the board under each painting painted solid to its edges, by the same key. */
  boards: Map<string, THREE.Color>;
}

/**
 * The hand-lettered signs: paintings from art/signs/, copied into public/signs/ by
 * art/blender/build_signs.py (as lossless WebP, the list's `format`) and listed in its signs.json,
 * with the colours of the boards under those painted solid. None if there is no list; a sign that
 * fails to load keeps its typed words.
 */
async function loadPaintedSigns(): Promise<PaintedSigns> {
  const painted: PaintedSigns = { paintings: new Map(), boards: new Map() };
  let names: string[] = [];
  let format = 'png';
  try {
    const response = await fetch('signs/signs.json');
    if (!response.ok) return painted;
    const list = (await response.json()) as { signs?: string[]; boards?: Record<string, string>; format?: string };
    names = list.signs ?? [];
    format = list.format ?? format;
    for (const [name, colour] of Object.entries(list.boards ?? {})) painted.boards.set(name, new THREE.Color(colour));
  } catch {
    return painted;
  }
  await Promise.all(
    names.map(async (name) => {
      try {
        const response = await fetch(`signs/${encodeURIComponent(name)}.${format}`);
        if (response.ok) painted.paintings.set(name, await createImageBitmap(await response.blob()));
      } catch (error) {
        console.warn(`Hand-lettered sign ${name} did not load`, error);
      }
    }),
  );
  return painted;
}

interface Floater {
  object: THREE.Object3D;
  y: number;
  phase: number;
}

/** The props' own material: toon-shaded vertex colours, in the film look with the huts' thatch
 * painted the film's way (see paintThatch); with `paint`, the props' painted textures (see
 * loadPaintMaps) taking over their colours where a part's aPaintUv points into them. */
function toon(paint: PaintTextures | null = null): THREE.MeshToonMaterial {
  const material = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: sceneryRamp() });
  if (FILM) {
    material.onBeforeCompile = (shader) => {
      if (paint) paintFrom(shader, paint);
      paintThatch(shader);
      fireLights(shader);
    };
    material.customProgramCacheKey = () => (paint ? 'prop-painted' : 'prop');
  }
  return material;
}

/** Takes a material's colours from the props' painted textures (their light and their colour, see
 * loadPaintMaps) wherever its part's aPaintUv (the textures' UV and layer) is not below nought: the
 * two put back together as WebP takes them apart (BT.601), then from sRGB to light. */
function paintFrom(shader: THREE.WebGLProgramParametersWithUniforms, paint: PaintTextures): void {
  shader.uniforms.uPaintLight = { value: paint.light };
  shader.uniforms.uPaintColour = { value: paint.colour };
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nattribute vec3 aPaintUv;\nvarying vec3 vPaintUv;')
    .replace('#include <begin_vertex>', '#include <begin_vertex>\nvPaintUv = aPaintUv;');
  shader.fragmentShader = shader.fragmentShader
    .replace(
      '#include <common>',
      '#include <common>\nuniform highp sampler2DArray uPaintLight;\nuniform highp sampler2DArray uPaintColour;\nvarying vec3 vPaintUv;',
    )
    .replace('#include <color_fragment>', `#include <color_fragment>\n${PAINT_COLOUR}`);
}

/** GLSL, after the material's own colour: the painted textures' colour where a part has them. */
const PAINT_COLOUR = /* glsl */ `
if (vPaintUv.x >= 0.0) {
  vec2 paintColour = texture(uPaintColour, vPaintUv).rg - 0.5;
  vec3 painted = texture(uPaintLight, vPaintUv).r
    + vec3(1.402 * paintColour.y, -0.344136 * paintColour.x - 0.714136 * paintColour.y, 1.772 * paintColour.x);
  diffuseColor.rgb = sRGBTransferEOTF(vec4(clamp(painted, 0.0, 1.0), 1.0)).rgb;
}
`;

/** The houses' night maps (see PropInfo.night) side by side in one texture, and where each map lies
 * in it: its corner and size, in the texture's UVs. */
interface NightMaps {
  texture: THREE.Texture;
  tiles: Map<string, [number, number, number, number]>;
}

/**
 * Fetches the houses' night maps and lays them side by side in one texture, their light as Blender
 * wrote it: no colour conversion, and no mipmaps, whose smaller copies would blend a map's
 * neighbouring patches (a lit wall's inside into its dark outside). None if none loads.
 */
async function loadNightMaps(maps: string[]): Promise<NightMaps | null> {
  const images = new Map<string, ImageBitmap>();
  await Promise.all(
    maps.map(async (map) => {
      try {
        const response = await fetch(`models/props/${map}`);
        if (!response.ok) throw new Error(`${response.status}`);
        images.set(map, await createImageBitmap(await response.blob(), { colorSpaceConversion: 'none', premultiplyAlpha: 'none' }));
      } catch (error) {
        console.warn(`Night map ${map} did not load`, error);
      }
    }),
  );
  if (images.size === 0) return null;
  const size = Math.max(...[...images.values()].map((image) => Math.max(image.width, image.height)));
  const columns = Math.ceil(Math.sqrt(images.size));
  const canvas = document.createElement('canvas');
  canvas.width = columns * size;
  canvas.height = Math.ceil(images.size / columns) * size;
  const g = canvas.getContext('2d');
  const tiles: NightMaps['tiles'] = new Map();
  [...images].forEach(([map, image], k) => {
    const x = (k % columns) * size;
    const y = Math.floor(k / columns) * size;
    g?.drawImage(image, x, y, size, size);
    tiles.set(map, [x / canvas.width, y / canvas.height, size / canvas.width, size / canvas.height]);
  });
  const texture = new THREE.CanvasTexture(canvas);
  // The UVs count down from the top, as the canvas does (glTF's way).
  texture.flipY = false;
  texture.colorSpace = THREE.NoColorSpace;
  texture.generateMipmaps = false;
  texture.minFilter = THREE.LinearFilter;
  return { texture, tiles };
}

/** The props' painted textures (see loadPaintMaps): each map's light (its luma), whole, in layers
 * PAINT_LAYER square, and its colour (its two chroma), at half its size in layers half as big, as
 * its WebP file holds them: four texels' worth of light for each texel's worth of colour, where an
 * RGBA texture would hold sixteen, and the eye sees the light's detail, not the colour's. */
interface PaintTextures {
  light: THREE.Texture;
  colour: THREE.Texture;
}

/** The props' painted textures, each map's place in them (its corner, width and height in a layer's
 * UVs, and the layer), and the work of drawing the maps into them, for the renderer to do before the
 * first frame. */
interface PaintMaps extends PaintTextures {
  tiles: Map<string, PaintTile>;
  upload: (renderer: THREE.WebGLRenderer) => Promise<void>;
}
type PaintTile = [number, number, number, number, number];
type PaintSize = NonNullable<PropInfo['paint']>['size'];

/** A layer of the props' painted textures' light, in texels: as big as a prop's map can be. */
const PAINT_LAYER = 2048;

/** GLSL, splitting a painted map into its light and its colour (see loadPaintMaps): the map's texels
 * as its file holds them, sRGB, its corner `uCorner` in the layer drawn to. */
const SPLIT_VERTEX = /* glsl */ `
void main() {
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;
const SPLIT_LIGHT = /* glsl */ `
uniform highp sampler2D uMap;
uniform vec2 uCorner;
void main() {
  vec3 c = texelFetch(uMap, ivec2(gl_FragCoord.xy - uCorner), 0).rgb;
  gl_FragColor = vec4(dot(c, vec3(0.299, 0.587, 0.114)), 0.0, 0.0, 1.0);
}
`;
/** Each colour texel the mean of the two-by-two of the map's texels it stands for. */
const SPLIT_COLOUR = /* glsl */ `
uniform highp sampler2D uMap;
uniform vec2 uCorner;
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy - uCorner) * 2;
  vec3 c = 0.25 * (texelFetch(uMap, p, 0).rgb + texelFetch(uMap, p + ivec2(1, 0), 0).rgb
    + texelFetch(uMap, p + ivec2(0, 1), 0).rgb + texelFetch(uMap, p + ivec2(1, 1), 0).rgb);
  float y = dot(c, vec3(0.299, 0.587, 0.114));
  gl_FragColor = vec4(0.5 + (c.b - y) / 1.772, 0.5 + (c.r - y) / 1.402, 0.0, 1.0);
}
`;

/** One of the painted textures' two halves, drawn into layer by layer: `size` texels square. */
function paintTarget(size: number, layers: number, format: THREE.PixelFormat): THREE.WebGLArrayRenderTarget {
  return new THREE.WebGLArrayRenderTarget(size, size, layers, {
    format,
    type: THREE.UnsignedByteType,
    depthBuffer: false,
    minFilter: THREE.LinearMipmapLinearFilter,
    magFilter: THREE.LinearFilter,
    generateMipmaps: false,
    anisotropy: 4,
  });
}

/**
 * Fetches the props' painted textures (see PropInfo.paint), each a power of two wide and as high or
 * half as high (`maps`: each one's size, as its prop gives it), and lays them out in layers
 * PAINT_LAYER square, the biggest first, each in the smallest free space that holds it, what is left
 * of that space split in two beside and under it. Each is drawn into place by the renderer (see
 * upload), its light and its colour taken apart (see PaintTextures), two decoded at a time and let go
 * as soon as they are drawn; with smaller copies for far off, which may blend a little of a patch's
 * neighbours at its very edge (the patches lie a few texels apart). A blank texel of each if none
 * loads, every prop then keeping its own colours.
 */
async function loadPaintMaps(maps: Map<string, PaintSize>): Promise<PaintMaps> {
  const files = new Map<string, { blob: Blob; w: number; h: number }>();
  await Promise.all(
    [...maps].map(async ([map, size]) => {
      try {
        const response = await fetch(`models/props/${map}`);
        if (!response.ok) throw new Error(`${response.status}`);
        const blob = await response.blob();
        let [w, h] = typeof size === 'number' ? [size, size] : (size ?? [0, 0]);
        if (!w || !h) {
          // A prop that does not give its map's size: read it off the map.
          const image = await createImageBitmap(blob);
          [w, h] = [image.width, image.height];
          image.close();
        }
        files.set(map, { blob, w: Math.min(w, PAINT_LAYER), h: Math.min(h, PAINT_LAYER) });
      } catch (error) {
        console.warn(`Paint map ${map} did not load`, error);
      }
    }),
  );
  if (files.size === 0) {
    const light = new THREE.DataArrayTexture(new Uint8Array([255, 255, 255, 255]), 1, 1, 1);
    const colour = new THREE.DataArrayTexture(new Uint8Array([128, 128, 0, 255]), 1, 1, 1);
    light.needsUpdate = colour.needsUpdate = true;
    return { light, colour, tiles: new Map(), upload: async () => {} };
  }
  // Free spaces: corner, width, height, layer.
  const free: [number, number, number, number, number][] = [];
  let layers = 0;
  const places: { map: string; blob: Blob; x: number; y: number; w: number; h: number; layer: number }[] = [];
  const tiles: PaintMaps['tiles'] = new Map();
  const sorted = [...files].sort((a, b) => b[1].w * b[1].h - a[1].w * a[1].h || b[1].w - a[1].w);
  for (const [map, { blob, w, h }] of sorted) {
    let best = -1;
    for (let k = 0; k < free.length; k++) {
      const f = free[k];
      if (f[2] >= w && f[3] >= h && (best < 0 || f[2] * f[3] < free[best][2] * free[best][3])) best = k;
    }
    if (best < 0) {
      free.push([0, 0, PAINT_LAYER, PAINT_LAYER, layers++]);
      best = free.length - 1;
    }
    const [x, y, fw, fh, layer] = free.splice(best, 1)[0];
    if (fw > w) free.push([x + w, y, fw - w, h, layer]);
    if (fh > h) free.push([x, y + h, fw, fh - h, layer]);
    places.push({ map, blob, x, y, w, h, layer });
    tiles.set(map, [x / PAINT_LAYER, y / PAINT_LAYER, w / PAINT_LAYER, h / PAINT_LAYER, layer]);
  }
  const light = paintTarget(PAINT_LAYER, layers, THREE.RedFormat);
  const colour = paintTarget(PAINT_LAYER / 2, layers, THREE.RGFormat);
  const upload = async (renderer: THREE.WebGLRenderer): Promise<void> => {
    const map: { value: THREE.Texture | null } = { value: null };
    const corner = { value: new THREE.Vector2() };
    const pass = (fragmentShader: string) =>
      new THREE.ShaderMaterial({
        uniforms: { uMap: map, uCorner: corner },
        vertexShader: SPLIT_VERTEX,
        fragmentShader,
        depthTest: false,
        depthWrite: false,
        blending: THREE.NoBlending,
      });
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), pass(SPLIT_LIGHT));
    quad.frustumCulled = false;
    const scene = new THREE.Scene().add(quad);
    const camera = new THREE.OrthographicCamera();
    const passes: [THREE.WebGLArrayRenderTarget, THREE.ShaderMaterial, number][] = [
      [light, quad.material, 1],
      [colour, pass(SPLIT_COLOUR), 0.5],
    ];
    // Into `target`'s `layer`, as the rest of the game left the renderer.
    const draw = (target: THREE.WebGLArrayRenderTarget, layer: number) => {
      const before = [renderer.getRenderTarget(), renderer.getActiveCubeFace(), renderer.getActiveMipmapLevel()] as const;
      const autoClear = renderer.autoClear;
      renderer.autoClear = false;
      renderer.setRenderTarget(target, layer);
      renderer.render(scene, camera);
      renderer.setRenderTarget(...before);
      renderer.autoClear = autoClear;
    };
    const decoding: (Promise<ImageBitmap | null> | null)[] = places.map(() => null);
    const decode = (k: number) => {
      if (k >= places.length) return;
      decoding[k] = createImageBitmap(places[k].blob, { imageOrientation: 'none' }).catch((error) => {
        console.warn(`Paint map ${places[k].map} did not decode`, error);
        return null;
      });
    };
    decode(0);
    decode(1);
    for (let k = 0; k < places.length; k++) {
      const image = await decoding[k];
      decoding[k] = null;
      decode(k + 2);
      if (!image) continue;
      const { x, y, w, h, layer } = places[k];
      if (image.width !== w || image.height !== h) console.warn(`Paint map ${places[k].map} is ${image.width}×${image.height}, not ${w}×${h}`);
      const source = new THREE.Texture(image);
      source.flipY = false;
      source.generateMipmaps = false;
      source.minFilter = source.magFilter = THREE.NearestFilter;
      source.needsUpdate = true;
      map.value = source;
      for (const [target, material, scale] of passes) {
        quad.material = material;
        corner.value.set(x * scale, y * scale);
        target.viewport.set(x * scale, y * scale, w * scale, h * scale);
        draw(target, layer);
      }
      source.dispose();
      image.close();
    }
    // The smaller copies, once all are in: made as a frame drawn into each ends, here with nothing in it.
    map.value = null;
    quad.visible = false;
    for (const [target, material] of passes) {
      target.texture.generateMipmaps = true;
      draw(target, 0);
      material.dispose();
    }
    quad.geometry.dispose();
  };
  return { light: light.texture, colour: colour.texture, tiles, upload };
}

const NIGHT_VERTEX = /* glsl */ `
attribute vec2 aNightUv;
attribute vec2 aNight;
varying vec2 vNightUv;
varying vec2 vNight;
`;

const NIGHT_PARS = /* glsl */ `
uniform sampler2D uNightMap;
varying vec2 vNightUv;
varying vec2 vNight;
`;

/** GLSL, after three's own lights: the lantern's baked light, the map's (stored as its square root)
 * times its gain and the lantern's colour this moment in the light grid; and how much of the lantern
 * this point of the house sees (nightSeen, for the firelight's roofed rooms: what is in the room sees
 * it, the roof's outside does not). */
const NIGHT_LIGHT = /* glsl */ `
float nightSeen = 0.0;
if (uFireOn > 0.5) {
  vec3 nightLantern = texelFetch(uFireLights, ivec2(int(vNight.x - 0.5), 1), 0).rgb;
  vec3 nightLight = texture2D(uNightMap, vNightUv).rgb;
  nightSeen = max(nightLight.r, max(nightLight.g, nightLight.b));
  reflectedLight.indirectDiffuse += nightLight * nightLight * vNight.y * nightLantern * BRDF_Lambert(material.diffuseColor);
}
`;

/**
 * A house's body and room in the film look: lit as the props are (see toon), and at night by its own
 * lantern's light as Cycles baked it into the house (see PropInfo.night), shadowed under the
 * furniture, dimmer in the corners, coming back off the wood and out through the windows and the
 * doorway onto the porch. `map` holds every house's bake (see loadNightMaps), a part's aNightUv its
 * place there and aNight its lantern in the light grid plus one and its map's gain, so the light
 * flickers and fades with the lantern; the grid leaves that lantern, and its light out of the house's
 * doorways and windows, off the house (NIGHT_MAP in Firelight). A house with a painted texture
 * (`paint`, see loadPaintMaps) takes its colours from it where its aPaintUv points into it, and its
 * own colours where that is below nought.
 */
function nightMaterial(map: THREE.Texture, paint: PaintTextures | null): THREE.MeshToonMaterial {
  const material = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: sceneryRamp() });
  material.defines = { NIGHT_MAP: '' };
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uNightMap = { value: map };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${NIGHT_VERTEX}`)
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvNightUv = aNightUv;\nvNight = aNight;');
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>\n${NIGHT_PARS}`);
    if (paint) paintFrom(shader, paint);
    paintThatch(shader);
    paintWood(shader);
    fireLights(shader);
    shader.fragmentShader = shader.fragmentShader.replace('#include <lights_fragment_begin>', `#include <lights_fragment_begin>\n${NIGHT_LIGHT}`);
  };
  return material;
}

/** A house's baked part's way into its night map (see nightMaterial): its UVs moved to its map's
 * place among the maps, its lantern's place among the fires plus one, and its map's gain. */
function addNight(geometry: THREE.BufferGeometry, source: THREE.BufferGeometry, tile: [number, number, number, number], lantern: number, gain: number): void {
  const uv = source.getAttribute('uv');
  const at = new Float32Array(uv.count * 2);
  const night = new Float32Array(uv.count * 2);
  for (let i = 0; i < uv.count; i++) {
    at.set([tile[0] + uv.getX(i) * tile[2], tile[1] + uv.getY(i) * tile[3]], i * 2);
    night.set([lantern + 1, gain], i * 2);
  }
  geometry.setAttribute('aNightUv', new THREE.BufferAttribute(at, 2));
  geometry.setAttribute('aNight', new THREE.BufferAttribute(night, 2));
}

/** A part's way into the props' painted textures (see paintFrom): its paint UVs (a baked house's
 * second, `uv1`; a prop with no night's first, `uv`) moved to its map's place among the maps, with
 * its layer; below nought (its own colours) where it has none or a corner of it points nowhere.
 * Every part drawn painted has it, so they join into one mesh. */
function addPaint(geometry: THREE.BufferGeometry, uv: THREE.BufferAttribute | THREE.InterleavedBufferAttribute | undefined,
  tile: PaintTile | undefined): void {
  const count = geometry.getAttribute('position').count;
  const at = new Float32Array(count * 3).fill(-1);
  if (tile && uv) {
    for (let i = 0; i < count; i++) {
      const u = uv.getX(i);
      const v = uv.getY(i);
      if (u < 0 || v < 0) continue;
      at.set([tile[0] + u * tile[2], tile[1] + v * tile[3], tile[4]], i * 3);
    }
  }
  geometry.setAttribute('aPaintUv', new THREE.BufferAttribute(at, 3));
}

/**
 * A house's baked part's wood grain, for the film look's wood painter (see paintWood): the way it
 * runs, from the model's `_grain`, turned with the house, its length (how strongly it shows) kept;
 * nought where the model has none, so every baked part has it and they join into one mesh.
 */
function addGrain(geometry: THREE.BufferGeometry, source: THREE.BufferGeometry, matrix: THREE.Matrix4): void {
  const count = geometry.getAttribute('position').count;
  const grain = new Float32Array(count * 3);
  const from = source.getAttribute('_grain');
  if (from) {
    const turn = new THREE.Matrix3().setFromMatrix4(matrix);
    const v = new THREE.Vector3();
    for (let i = 0; i < count; i++) {
      v.fromBufferAttribute(from, i);
      const strength = v.length();
      if (strength < 0.01) continue;
      v.applyMatrix3(turn).setLength(strength);
      grain.set([v.x, v.y, v.z], i * 3);
    }
  }
  geometry.setAttribute('aGrain', new THREE.BufferAttribute(grain, 3));
}

/** How far a room's box reaches past its inside, in metres: the walls' inner faces lie on the box's
 * sides, so they are kept inside it, while their outer faces, a plank's thickness out, stay out. */
const ROOM_MARGIN = 0.06;

/**
 * The room a house's lantern lights, in the world: the box its inside (furniture, rugs, the walls'
 * inner faces) takes up, raised to the house's top so the roof's underside is in it too.
 */
function roomOf(parts: { role: PartRole; geometry: THREE.BufferGeometry }[], matrix: THREE.Matrix4, angle: number, scale: number): Room | null {
  const inside = parts.find((part) => part.role === 'inside');
  if (!inside) return null;
  if (!inside.geometry.boundingBox) inside.geometry.computeBoundingBox();
  const box = (inside.geometry.boundingBox as THREE.Box3).clone();
  const body = parts[0].geometry;
  if (!body.boundingBox) body.computeBoundingBox();
  box.max.y = Math.max(box.max.y, (body.boundingBox as THREE.Box3).max.y);
  return {
    centre: box.getCenter(new THREE.Vector3()).applyMatrix4(matrix),
    half: box.getSize(new THREE.Vector3()).multiplyScalar(scale / 2).addScalar(ROOM_MARGIN),
    yaw: angle,
  };
}

/** How much brighter than white the film look burns flames, so they glow. */
const FLAME_BRIGHT = 3;

/** Unlit vertex colours: flames, which make their own light, licking and wavering, the more the
 * higher up the flame (which the colours tell: a pale yellow heart, orange tips). `size`: how big the flame
 * is beside the village torches' (a torch carried in the paw's, 0.15), for how far it licks; `bright`: how
 * much brighter than white it burns in the film look. */
export function flameMaterial(size = 1, bright = FLAME_BRIGHT): THREE.MeshBasicMaterial {
  const material = new THREE.MeshBasicMaterial({ vertexColors: true });
  if (FILM) material.color.setRGB(bright, bright, bright);
  const uFlameSize = { value: size };
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, windUniforms, { uFlameSize });
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;\nuniform float uFlameSize;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
      {
        float up = clamp((0.9 - color.g) / 0.76, 0.0, 1.0);
        vec3 at = position / uFlameSize;
        float phase = dot(floor(at.xz * 2.0), vec2(1.7, 2.3));
        transformed.x += up * up * 0.07 * uFlameSize * sin(uTime * 8.0 + phase + at.y * 3.0);
        transformed.z += up * up * 0.05 * uFlameSize * cos(uTime * 6.5 + phase * 1.3 + at.y * 2.0);
        transformed.y += up * 0.08 * uFlameSize * sin(uTime * 11.0 + phase * 0.7);
      }`,
      );
  };
  return material;
}

/** A part's geometry moved into place, with only what the merged mesh needs: position, normal and
 * colour (RGB, tinted, or all `paint` where given), or the label's UVs. */
function placedGeometry(
  source: THREE.BufferGeometry,
  matrix: THREE.Matrix4,
  tint: THREE.Color | null,
  withUv: boolean,
  paint: THREE.Color | null = null,
): THREE.BufferGeometry {
  const g = source.clone().applyMatrix4(matrix);
  const out = new THREE.BufferGeometry();
  const position = g.getAttribute('position');
  out.setAttribute('position', position);
  out.setAttribute('normal', g.getAttribute('normal'));
  if (withUv) {
    out.setAttribute('uv', g.getAttribute('uv'));
  } else {
    const src = g.getAttribute('color');
    const colours = new Float32Array(position.count * 3);
    for (let i = 0; i < position.count; i++) {
      if (paint) {
        colours.set([paint.r, paint.g, paint.b], i * 3);
        continue;
      }
      const r = src ? src.getX(i) : 1;
      const gr = src ? src.getY(i) : 1;
      const b = src ? src.getZ(i) : 1;
      colours.set([r * (tint?.r ?? 1), gr * (tint?.g ?? 1), b * (tint?.b ?? 1)], i * 3);
    }
    out.setAttribute('color', new THREE.BufferAttribute(colours, 3));
  }
  if (g.index) out.setIndex(g.index);
  else out.setIndex([...Array(position.count).keys()]);
  return out;
}

/** Where a patch `w` wide rests lowest on a skyline (the height already filled up each column of the
 * atlas): its first column and the height it rests at, the leftmost of the lowest. */
function lowestRest(sky: Int32Array, w: number): [number, number] {
  // The highest column under each window of w columns, by a queue of falling heights.
  const queue = new Int32Array(sky.length);
  let head = 0;
  let tail = 0;
  let best: [number, number] = [0, Infinity];
  for (let k = 0; k < sky.length; k++) {
    while (tail > head && sky[queue[tail - 1]] <= sky[k]) tail--;
    queue[tail++] = k;
    if (queue[head] <= k - w) head++;
    if (k >= w - 1 && sky[queue[head]] < best[1]) best = [k - w + 1, sky[queue[head]]];
  }
  return best;
}

/**
 * Paints every label's words into one texture, each in its own patch (faces painted alike sharing
 * one), and points its UVs there: its hand-lettered sign where there is one, otherwise its words
 * typed in the phone's own rounded Japanese font, as the HUD uses, running across the face, or
 * down a vertical one.
 */
function paintLabels(all: Label[], painted: Map<string, ImageBitmap>): THREE.CanvasTexture {
  // Faces painted alike (a stall's sign on its front and on its two sides) share one patch.
  const alike = new Map<string, Label[]>();
  for (const label of all) {
    const { size, vertical, colour, sharp } = label.info;
    const look = `${label.key} ${size[0]} ${size[1]} ${vertical ?? false} ${colour ?? ''} ${sharp ?? 1}`;
    alike.set(look, [...(alike.get(look) ?? []), label]);
  }
  const faces = [...alike.values()];
  const labels = faces.map((same) => same[0]);
  // Tallest labels first, each where it rests lowest on those already in (a skyline), so short ones
  // fill in beside the tall. Lower the density until all fit.
  let sizes: number[][] = [];
  let places: [number, number][] = [];
  let used = 0;
  for (let density = LABEL_PIXELS; density >= 100; density -= 10) {
    sizes = labels.map((l) => [
      Math.min(ATLAS_WIDTH - 2 * LABEL_GUTTER, Math.round(l.info.size[0] * density * (l.info.sharp ?? 1))),
      Math.min(ATLAS_WIDTH - 2 * LABEL_GUTTER, Math.round(l.info.size[1] * density * (l.info.sharp ?? 1))),
    ]);
    const order = sizes.map((_, i) => i).sort((a, b) => sizes[b][1] - sizes[a][1] || sizes[b][0] - sizes[a][0]);
    places = new Array(labels.length);
    const sky = new Int32Array(ATLAS_WIDTH);
    used = 0;
    for (const i of order) {
      const w = sizes[i][0] + 2 * LABEL_GUTTER;
      const h = sizes[i][1] + 2 * LABEL_GUTTER;
      const [x, y] = lowestRest(sky, w);
      places[i] = [x + LABEL_GUTTER, y + LABEL_GUTTER];
      sky.fill(y + h, x, x + w);
      used = Math.max(used, y + h);
    }
    if (used <= ATLAS_HEIGHT) break;
  }
  const height = THREE.MathUtils.ceilPowerOfTwo(Math.max(used, 1));
  const canvas = document.createElement('canvas');
  canvas.width = ATLAS_WIDTH;
  canvas.height = height;
  const g = canvas.getContext('2d');
  const font = getComputedStyle(document.documentElement).getPropertyValue('--font-ja').trim() || 'sans-serif';
  labels.forEach((label, i) => {
    const [w, h] = sizes[i];
    const [px, py] = places[i];
    const sign = painted.get(label.key);
    if (g && sign) {
      g.imageSmoothingEnabled = true;
      g.imageSmoothingQuality = 'high';
      g.drawImage(sign, px, py, w, h);
      // Its edges carried out into the gutter: its top and bottom rows up and down, then its sides
      // (and so the corners) out.
      const e = LABEL_GUTTER;
      g.imageSmoothingEnabled = false;
      g.drawImage(canvas, px, py, w, 1, px, py - e, w, e);
      g.drawImage(canvas, px, py + h - 1, w, 1, px, py + h, w, e);
      g.drawImage(canvas, px, py - e, 1, h + 2 * e, px - e, py - e, e, h + 2 * e);
      g.drawImage(canvas, px + w - 1, py - e, 1, h + 2 * e, px + w, py - e, e, h + 2 * e);
    } else if (g) {
      g.save();
      g.beginPath();
      g.rect(px, py, w, h);
      g.clip();
      g.fillStyle = label.info.colour ?? INK;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      const chars = [...label.text];
      if (label.info.vertical) {
        const size = Math.min(w * 0.8, (h * 0.94) / chars.length);
        g.font = `bold ${size}px ${font}`;
        chars.forEach((c, k) => g.fillText(c, px + w / 2, py + h / 2 + (k - (chars.length - 1) / 2) * size));
      } else {
        g.font = `bold 100px ${font}`;
        const size = Math.min(h * 0.74, (100 * w * 0.9) / Math.max(g.measureText(label.text).width, 1));
        g.font = `bold ${size}px ${font}`;
        g.fillText(label.text, px + w / 2, py + h / 2 + size * 0.04);
      }
      g.restore();
    }
    // Point the faces' UVs (0..1 across and down each) at their patch.
    for (const face of faces[i]) {
      const uv = face.geometry.getAttribute('uv');
      for (let k = 0; k < uv.count; k++) {
        uv.setXY(k, (px + uv.getX(k) * w) / ATLAS_WIDTH, (py + uv.getY(k) * h) / height);
      }
    }
  });
  const texture = new THREE.CanvasTexture(canvas);
  // The UVs count down from the top, as the canvas does.
  texture.flipY = false;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

const lightSpotsOf = new WeakMap<THREE.BufferGeometry, THREE.Vector3[]>();

/**
 * Where the lights of a part that glows or burns are, in the prop's frame: the middle of each
 * cluster of its pieces (see LIGHT_GAP). A part's lanterns can stand metres apart, and the middle
 * of them all is empty air, often right against something (the arch's banner, between its poles'
 * lanterns), which a light there would burn white.
 */
function lightSpots(geometry: THREE.BufferGeometry): THREE.Vector3[] {
  const known = lightSpotsOf.get(geometry);
  if (known) return known;
  const position = geometry.getAttribute('position');
  const count = position.count;
  // The pieces: vertices joined by triangles.
  const parent = new Int32Array(count).map((_, i) => i);
  const root = (i: number): number => {
    while (parent[i] !== i) i = parent[i] = parent[parent[i]];
    return i;
  };
  const index = geometry.getIndex();
  const corners = index ? index.count : count;
  for (let t = 0; t + 2 < corners; t += 3) {
    const a = root(index ? index.getX(t) : t);
    for (let k = 1; k < 3; k++) {
      const b = root(index ? index.getX(t + k) : t + k);
      if (a !== b) parent[b] = a;
    }
  }
  const pieces = new Map<number, THREE.Box3>();
  const p = new THREE.Vector3();
  for (let i = 0; i < count; i++) {
    const r = root(i);
    let box = pieces.get(r);
    if (!box) pieces.set(r, (box = new THREE.Box3()));
    box.expandByPoint(p.fromBufferAttribute(position, i));
  }
  // Pieces closer than the gap join into one cluster, until no two clusters are that close.
  const clusters = [...pieces.values()];
  for (let joined = true; joined; ) {
    joined = false;
    for (let i = 0; i < clusters.length && !joined; i++) {
      const near = clusters[i].clone().expandByScalar(LIGHT_GAP / 2);
      for (let j = i + 1; j < clusters.length; j++) {
        if (!near.intersectsBox(clusters[j].clone().expandByScalar(LIGHT_GAP / 2))) continue;
        clusters[i].union(clusters[j]);
        clusters.splice(j, 1);
        joined = true;
        break;
      }
    }
  }
  const spots = clusters.map((box) => box.getCenter(new THREE.Vector3()));
  lightSpotsOf.set(geometry, spots);
  return spots;
}

/** When each part of a prop is drawn. */
function levelOf(role: PartRole, hasFar: boolean, small: boolean): Level | null {
  switch (role) {
    case 'far':
      return 'far';
    case 'inside':
      return 'inside';
    case 'flame':
      return 'night';
    case 'label':
      return null;
    default:
      return hasFar ? 'near' : small ? 'small' : 'always';
  }
}

/**
 * The props standing on the island, as the layout file places them, modelled in Blender: the
 * festival's stalls, arch and banners, the village's huts and stage, the pier, the ferry, palms,
 * signs. Props that never move are joined into a few meshes, by group or by patch of the island,
 * with one outline each; a group's houses are drawn in full near the camera and as their light far
 * version beyond, their rooms' insides only close up. What they block keeps characters and the
 * camera out, and their decks carry walkers.
 */
export class Props {
  readonly group = new THREE.Group();
  private readonly floaters: Floater[] = [];
  private readonly groups = new Map<string, Group>();
  /** The rooms' insides drawn however far off they are: for the dev see-through test (see showAll). */
  private drawAll = false;
  private readonly flames: THREE.Object3D[] = [];
  /** Where each flame, lit window and lantern is, for the firelight (see Firelight), with the room a
   * room's lantern lights, and each house's lantern's light out of its doorways and windows. */
  readonly fires: ({ position: THREE.Vector3; kind: FireKind } & SourceOptions)[] = [];
  /** In the film look, where what the calm water mirrors stands (see MIRRORED): each piece of the
   * pier and the quay's copy, and each floater (bobbing a little round it). */
  readonly mirrored: THREE.Sphere[] = [];
  /** Their pieces, by prop, for the copies (see load). */
  private readonly mirrorPieces = new Map<number, THREE.BufferGeometry[]>();
  /** The drawing of the painted textures into their layers (see loadPaintMaps), until it is begun. */
  paintUpload: ((renderer: THREE.WebGLRenderer) => Promise<void>) | null = null;

  /** Draws the props' painted textures into place, once, before they are first drawn. */
  async uploadPaint(renderer: THREE.WebGLRenderer): Promise<void> {
    const upload = this.paintUpload;
    this.paintUpload = null;
    await upload?.(renderer);
  }

  static async load(layout: Placed[], waterLevel: number): Promise<Props> {
    // A stall's goods stand in it, placed with it (after the layout's own, which keep their places
    // in the list, and so the ferry its bobbing).
    const goods = layout.filter((p) => p.goods);
    const placed: Placed[] = [
      ...layout,
      ...goods.map((p) => ({ kind: `goods_${p.goods}`, x: p.x, z: p.z, turn: p.turn, scale: p.scale, y: p.y, group: p.group })),
    ];
    const kinds = [...new Set(placed.map((p) => p.kind))];
    const signs = loadPaintedSigns();
    const models = new Map(await Promise.all(kinds.map(async (k) => [k, await loadPropModel(k)] as const)));
    // In the film look, where the lanterns light the island, the houses' lanterns' light baked into them.
    const maps = [...new Set([...models.values()].flatMap((m) => (m.info.night ? [m.info.night.map] : [])))];
    const nights = FILM && maps.length > 0 ? loadNightMaps(maps) : Promise.resolve(null);
    // And the props' painted textures, the houses' and every other wooden thing's, drawn over them in
    // the film look.
    const paintMaps = new Map<string, PaintSize>();
    for (const m of models.values()) if (m.info.paint) paintMaps.set(m.info.paint.map, m.info.paint.size);
    const paints = FILM && paintMaps.size > 0 ? loadPaintMaps(paintMaps) : Promise.resolve(null);
    const painted = await signs;
    const night = await nights;
    const paint = await paints;
    const props = new Props();
    props.paintUpload = paint?.upload ?? null;
    const labels: Label[] = [];
    const up = new THREE.Vector3(0, 1, 0);

    placed.forEach((p, i) => {
      const model = models.get(p.kind);
      if (!model) return;
      const angle = THREE.MathUtils.degToRad(p.turn ?? 0);
      const scale = p.scale ?? 1;
      const y = p.float ? waterLevel : (p.y ?? terrainHeight(p.x, p.z) - (model.info.sink ?? 0));
      const matrix = new THREE.Matrix4().compose(
        new THREE.Vector3(p.x, y, p.z),
        new THREE.Quaternion().setFromAxisAngle(up, angle),
        new THREE.Vector3(scale, scale, scale),
      );
      const tint = p.tint ? new THREE.Color(p.tint) : null;
      props.addObstacles(p, model.info, angle, scale, y);

      if (p.float) {
        props.addFloater(model.parts, p, angle, scale, y, i);
        return;
      }
      const hasFar = model.parts.some((part) => part.role === 'far');
      const body = model.parts[0].geometry;
      if (!body.boundingSphere) body.computeBoundingSphere();
      const small = p.kind.startsWith('goods_') || (body.boundingSphere as THREE.Sphere).radius * scale < SMALL_SIZE;
      const key = p.group ?? `${Math.floor(p.x / PATCH)},${Math.floor(p.z / PATCH)}`;
      const words = p.labels ?? (p.label ? [p.label] : []);
      const labelInfos = model.info.labels ?? (model.info.label ? [model.info.label] : []);
      const room = model.parts.some((part) => part.role === 'lamp') ? roomOf(model.parts, matrix, angle, scale) : null;
      // A house with its lantern's light baked into it: the lantern first among its fires, so its
      // body and room know it (see nightMaterial).
      const bake = model.info.night;
      const tile = bake ? night?.tiles.get(bake.map) : undefined;
      const lantern = bake && tile ? props.addLantern(model, matrix, angle, scale, room) : -1;
      const gain = bake ? (bake.scale * 4 * Math.PI ** 2) / bake.power : 0;
      for (const part of model.parts) {
        if (part.role === 'label') {
          const info = labelInfos[part.index];
          const text = words[info?.repeat ?? part.index];
          if (text && info) {
            labels.push({
              geometry: placedGeometry(part.geometry, matrix, null, true),
              key: text,
              text: t(text as StringKey),
              info,
            });
          }
          continue;
        }
        const level = levelOf(part.role, hasFar, small);
        if (!level) continue;
        const baked = tile && (part.role === 'body' || part.role === 'inside') && part.geometry.hasAttribute('uv');
        const kind: Kind = baked
          ? 'baked'
          : part.role === 'glow' || part.role === 'spot' || part.role === 'lamp'
            ? 'glow'
            : part.role === 'pane' || part.role === 'flame'
              ? part.role
              : 'body';
        // A board under a hand-lettered sign painted solid takes the painting's colour.
        const board = part.role === 'board' && words[0] ? (painted.boards.get(words[0]) ?? null) : null;
        const geometry = placedGeometry(part.geometry, matrix, tint, false, board);
        if (baked) {
          addNight(geometry, part.geometry, tile, lantern, gain);
          addGrain(geometry, part.geometry, matrix);
        }
        if (kind === 'baked' || kind === 'body') {
          // Its painted wood: a baked house's second UVs, another prop's first; nought for the rest.
          const paintable = part.role === 'body' || part.role === 'inside';
          const uv = paintable ? (part.geometry.getAttribute('uv1') ?? (bake ? undefined : part.geometry.getAttribute('uv'))) : undefined;
          addPaint(geometry, uv, model.info.paint ? paint?.tiles.get(model.info.paint.map) : undefined);
        }
        props.collect(key, level, kind, !UNLINED.has(p.kind), geometry);
        if (FILM && MIRRORED.has(p.kind) && kind === 'body' && level !== 'far') {
          props.mirrorPieces.set(i, [...(props.mirrorPieces.get(i) ?? []), geometry]);
        }
        if ((kind === 'glow' && !(part.role === 'lamp' && lantern >= 0)) || kind === 'flame') {
          for (const spot of lightSpots(part.geometry)) {
            const lamp = part.role === 'lamp';
            const fire = lamp ? 'lamp' : part.role === 'spot' ? 'spot' : kind;
            props.fires.push({ position: spot.clone().applyMatrix4(matrix), kind: fire, room: lamp ? room : null });
          }
        }
      }
    });
    props.build(night?.texture ?? null, paint);
    // The pier and the quay once more, a piece for each, drawn by the calm water's mirror alone (see
    // MIRRORED), shaded as they are: each has bounds of its own, so the mirror draws only the pieces
    // whose mirror images it could see.
    const mirrorMaterial = toon(paint);
    for (const pieces of props.mirrorPieces.values()) {
      const mirror = new THREE.Mesh(mergeGeometries(pieces), mirrorMaterial);
      mirror.layers.set(MIRROR_LAYER);
      mirror.receiveShadow = true;
      mirror.geometry.computeBoundingSphere();
      props.group.add(mirror);
      props.mirrored.push((mirror.geometry.boundingSphere as THREE.Sphere).clone());
    }
    props.mirrorPieces.clear();

    if (labels.length > 0) {
      const texture = paintLabels(labels, painted.paintings);
      const material = new THREE.MeshToonMaterial({
        map: texture,
        gradientMap: sceneryRamp(),
        transparent: true,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
      });
      if (FILM) material.onBeforeCompile = (shader) => fireLights(shader);
      const words = new THREE.Mesh(mergeGeometries(labels.map((l) => l.geometry)), material);
      // In the film look the words take the sun's shadows with their boards, so a sign painted
      // solid stays the colour of the board round it, in shade as in sun.
      words.receiveShadow = FILM;
      props.group.add(words);
    }
    return props;
  }

  private collect(key: string, level: Level, kind: Kind, lined: boolean, geometry: THREE.BufferGeometry): void {
    let group = this.groups.get(key);
    if (!group) {
      group = { geometries: new Map(), objects: new Map(), centre: new THREE.Vector3(), radius: 0 };
      this.groups.set(key, group);
    }
    const id = `${level}:${kind}:${lined ? 'lined' : 'bare'}`;
    const list = group.geometries.get(id) ?? [];
    list.push(geometry);
    group.geometries.set(id, list);
  }

  /**
   * A house's lantern, its light baked into the house (see nightMaterial), into the firelight where
   * the bake placed it, in the middle of its lantern: lighting its room (what stands in it besides the
   * house), and out of each of the house's doorways and windows. Returns its place among the fires.
   */
  private addLantern(model: PropModel, matrix: THREE.Matrix4, angle: number, scale: number, room: Room | null): number {
    const lamp = model.parts.find((part) => part.role === 'lamp');
    if (!lamp) return -1;
    if (!lamp.geometry.boundingBox) lamp.geometry.computeBoundingBox();
    const position = (lamp.geometry.boundingBox as THREE.Box3).getCenter(new THREE.Vector3()).applyMatrix4(matrix);
    const owner = this.fires.length;
    this.fires.push({ position, kind: 'lamp', room, owner });
    const up = new THREE.Vector3(0, 1, 0);
    for (const o of model.info.openings ?? []) {
      const opening = {
        centre: new THREE.Vector3(...o.at).applyMatrix4(matrix),
        out: new THREE.Vector3(...o.out).applyAxisAngle(up, angle),
        half: [(o.size[0] / 2) * scale, (o.size[1] / 2) * scale] as [number, number],
        mask: o.mask ? Uint8Array.from(atob(o.mask), (c) => c.charCodeAt(0)) : undefined,
      };
      this.fires.push({ position, kind: 'opening', opening, owner });
    }
    return owner;
  }

  /** Joins each group's pieces into a mesh per level and kind, outlined, and finds its bounds; the
   * houses' baked parts with `nights`, their night maps (see loadNightMaps), and `paints`, their
   * painted textures (see loadPaintMaps). */
  private build(nights: THREE.Texture | null, paints: PaintTextures | null): void {
    const materials: Record<Kind, THREE.Material> = {
      body: toon(paints),
      baked: nights ? nightMaterial(nights, paints) : toon(paints),
      glow: glowMaterial(),
      pane: paneMaterial(PANE.clear, PANE.lit, PANE.bright),
      flame: flameMaterial(),
    };
    const box = new THREE.Box3();
    const sphere = new THREE.Sphere();
    for (const group of this.groups.values()) {
      box.makeEmpty();
      for (const [id, list] of group.geometries) {
        const [level, kind, lining] = id.split(':') as [Level, Kind, string];
        const mesh = new THREE.Mesh(mergeGeometries(list), materials[kind]);
        mesh.geometry.computeBoundingBox();
        box.union(mesh.geometry.boundingBox as THREE.Box3);
        this.group.add(mesh);
        const objects = group.objects.get(level) ?? [];
        objects.push(mesh);
        // In the film look what is made is drawn with the pen, as the film draws its props, and the
        // land's own things (UNLINED) are painted without a line; all cast and take the sun's shadows.
        mesh.castShadow = mesh.receiveShadow = FILM && (kind === 'body' || kind === 'baked');
        if (kind === 'flame') this.flames.push(mesh);
        // A pane is one sheet, turned away from inside its room: the pen's hull of it would show
        // there as a sheet of ink.
        else if ((!FILM || lining === 'lined') && kind !== 'pane') objects.push(addOutline(mesh, 'still', true));
        group.objects.set(level, objects);
      }
      box.getBoundingSphere(sphere);
      group.centre.copy(sphere.center);
      group.radius = sphere.radius;
      group.geometries.clear();
    }
  }

  /** Registers what the prop blocks, and its decks, for walking and the camera. */
  private addObstacles(p: Placed, info: PropInfo, angle: number, scale: number, y: number): void {
    const top = y + (info.height ?? 1) * scale;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const at = (lx: number, lz: number): [number, number] => [
      p.x + (lx * cos + lz * sin) * scale,
      p.z + (-lx * sin + lz * cos) * scale,
    ];
    const f = info.footprint;
    if (f?.circle) addCircle(p.x, p.z, f.circle * scale, y - 10, top);
    if (f?.box) addBox(p.x, p.z, f.box[0] * scale, f.box[1] * scale, angle, y - 10, top);
    for (const [lx, lz, r] of f?.circles ?? []) addCircle(...at(lx, lz), r * scale, y - 10, top);
    for (const b of info.blocks ?? []) {
      const options = { walk: b.walk ?? true, camera: b.camera ?? true };
      const y0 = y + b.y[0] * scale;
      const y1 = y + b.y[1] * scale;
      if (b.circle) addCircle(...at(b.circle[0], b.circle[1]), b.circle[2] * scale, y0, y1, options);
      if (b.box) addBox(...at(b.box[0], b.box[1]), b.box[2] * scale, b.box[3] * scale, angle, y0, y1, options);
    }
    for (const d of info.decks ?? []) {
      const [cx, cz, hx, hz] = d.box;
      addDeck(...at(cx, cz), hx * scale, hz * scale, angle, y + d.top * scale, y + (d.front ?? d.top) * scale);
    }
  }

  /** A prop riding the sea (the ferry): its own object, so it can bob. */
  private addFloater(
    parts: { role: PartRole; geometry: THREE.BufferGeometry }[],
    p: Placed,
    angle: number,
    scale: number,
    y: number,
    seed: number,
  ): void {
    const object = new THREE.Group();
    object.position.set(p.x, y, p.z);
    object.rotation.y = angle;
    object.scale.setScalar(scale);
    const bounds = new THREE.Box3();
    for (const part of parts) {
      if (part.role === 'label' || part.role === 'far' || part.role === 'inside') continue;
      const mesh = new THREE.Mesh(part.geometry, part.role === 'glow' ? glowMaterial() : toon());
      object.add(mesh);
      // The ferry moves, so even in the film look it is drawn with the pen, as the film draws it.
      addOutline(mesh);
      mesh.castShadow = FILM;
      // The calm water mirrors it, without its line (see MIRROR_LAYER).
      mesh.layers.enable(MIRROR_LAYER);
      if (!part.geometry.boundingBox) part.geometry.computeBoundingBox();
      bounds.union(part.geometry.boundingBox as THREE.Box3);
    }
    object.updateMatrix();
    const sphere = bounds.applyMatrix4(object.matrix).getBoundingSphere(new THREE.Sphere());
    sphere.radius += 0.2;
    this.mirrored.push(sphere);
    this.group.add(object);
    this.floaters.push({ object, y, phase: seed * 1.37 });
  }

  /** Draws the rooms' insides however far off they are, from now (on), or as their distance says again
   * from the next update (off): for the dev see-through test (see Stage.drawAll). */
  showAll(on: boolean): void {
    this.drawAll = on;
    if (!on) return;
    for (const group of this.groups.values()) for (const o of group.objects.get('inside') ?? []) o.visible = true;
  }

  update(time: number, camera: THREE.Camera): void {
    const night = glowUniforms.uGlow.value > 0.5;
    for (const group of this.groups.values()) {
      const d = camera.position.distanceTo(group.centre) - group.radius;
      const near = d < NEAR_REACH;
      for (const [level, objects] of group.objects) {
        const shown =
          level === 'always' ||
          (level === 'near' && near) ||
          (level === 'far' && !near) ||
          (level === 'small' && d < SMALL_REACH) ||
          (level === 'inside' && (d < INSIDE_REACH || this.drawAll)) ||
          (level === 'night' && night);
        for (const o of objects) o.visible = shown;
      }
    }
    for (const f of this.floaters) {
      f.object.position.y = f.y + 0.07 * Math.sin(time * 0.9 + f.phase);
      f.object.rotation.x = 0.008 * Math.sin(time * 0.8 + f.phase);
      f.object.rotation.z = 0.014 * Math.sin(time * 0.7 + f.phase * 2.0);
    }
  }
}
