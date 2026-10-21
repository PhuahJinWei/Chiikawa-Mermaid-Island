import * as THREE from 'three';
import type { ExpressionId } from './types';
import { loadGltf } from '../core/gltf';

/** Part indices, shared with art/blender/charlib.py. */
export const PART = {
  BODY: 0,
  ARM_L: 1,
  ARM_R: 2,
  FOOT_L: 3,
  FOOT_R: 4,
  EAR_L: 5,
  EAR_R: 6,
  EAR_L2: 7,
  EAR_R2: 8,
  SKIRT: 9,
  TAIL: 10,
  SPROUT: 11,
  /** A head that turns on its own about its neck (the Siren's, see Character.headPitch); the cast's heads
   * are their bodies. */
  HEAD: 12,
} as const;
export const MAX_PARTS = 13;

export type AnchorName = 'head' | 'top' | 'eyeL' | 'eyeR' | 'mouth' | 'sideL' | 'sideR' | 'handL' | 'handR';
type Vec3Tuple = [number, number, number];

/** A face feature's box in head radii: centre x (right +), centre y above the eye line, half width, half height. */
export type FaceBox = [number, number, number, number];

/** Where each face feature sits on the neutral face, measured from its paint by the converter. */
export interface FaceLayout {
  eyes?: FaceBox[];
  brows?: FaceBox[];
  cheeks?: FaceBox[];
  mouth?: FaceBox;
  tears?: FaceBox[];
}

/** One painted face layer: its place on the face canvas (x, y, w, h) and in the atlas image (ax, ay). */
export interface FaceLayerRect {
  x: number;
  y: number;
  w: number;
  h: number;
  ax: number;
  ay: number;
}

/** The model's own face art, baked in Blender into layers on one image. */
export interface FaceLayers {
  image: HTMLImageElement;
  size: number;
  rects: Record<string, FaceLayerRect>;
  /** Which layers make up each expression, from art/faces/<id>/expressions.txt. */
  expressions: Partial<Record<ExpressionId, string[]>>;
}

/** Metadata written by the Blender scripts into the node's glTF extras. */
export interface Rig {
  version: number;
  id: string;
  height: number;
  width: number;
  headR: number;
  eyeY: number;
  outline: string;
  /** Most an arm can be raised from rest before it sinks into the head (radians); none if unlimited. */
  armReach?: number | null;
  /** Second colour (Hachiware's cap, inner ears), painted where the mask is over 0.5. */
  maskColor?: string | null;
  /** The model's own painted mask, sampled per pixel with the model's UVs for a smooth edge. */
  maskTexture?: string | null;
  parts: { pivot: Vec3Tuple; parent: number }[];
  anchors: Partial<Record<AnchorName, Vec3Tuple>>;
  patterns?: {
    /** A grass skirt that is part of the model (the islanders'), not an outfit. */
    skirt?: SkirtPattern | null;
  };
  face?: FaceLayout | null;
  faceAtlas?: {
    url: string;
    size: number;
    layers: Record<string, FaceLayerRect>;
    expressions?: Partial<Record<ExpressionId, string[]>>;
  } | null;
}

/**
 * One foot sitting down: the leg turns by pitch and yaw about its hip (the top of the leg) to
 * stretch out in front, and the hip moves to `seat`.
 */
export interface SeatFoot {
  hip: THREE.Vector3;
  seat: THREE.Vector3;
  pitch: number;
  yaw: number;
  /** How far a seated foot pulls back to hide under a skirt, as the film's skirts cover the feet. */
  tuck: number;
}

/** How the model sits on the ground, measured from its geometry when it loads. */
export interface Seat {
  /** Height of the body's lowest point: how far the body drops to rest on the ground. */
  drop: number;
  /** Left and right foot; null for a model without separate feet. */
  feet: [SeatFoot | null, SeatFoot | null];
}

export interface CharacterModel {
  geometry: THREE.BufferGeometry;
  rig: Rig;
  pivots: THREE.Vector3[];
  parents: number[];
  /** Whether its head is a part of its own (PART.HEAD), which turns about its neck: not in models built
   * before it was. */
  hasHead: boolean;
  anchors: Record<AnchorName, THREE.Vector3>;
  faceLayers: FaceLayers | null;
  maskTexture: THREE.Texture | null;
  seat: Seat;
}

/** A grass skirt's fringe, written by art/blender/outfits.py: hem and tie heights, strokes, hem scallop. */
export interface SkirtPattern {
  bottom: number;
  top: number;
  count: number;
  wave?: number;
}

/** Pattern data for an outfit, written by art/blender/outfits.py. */
export interface OutfitInfo {
  version: number;
  outfit: string;
  wearer: string;
  skirt: SkirtPattern | null;
}

export interface OutfitModel {
  geometry: THREE.BufferGeometry;
  info: OutfitInfo;
  /** Some pieces (the crown's flowers) always face the camera, as the film draws them. */
  billboard: boolean;
}

const RENAME: Record<string, string> = {
  _part0: 'aPart0',
  _part1: 'aPart1',
  _weight: 'aWeight',
  _paint: 'aPaint',
  _outline: 'aOutline',
  _lift: 'aLift',
  _mask: 'aMask',
  _center: 'aCenter',
  _bill: 'aBill',
  color: 'aColor',
  uv1: 'aMaskUv',
};
const REQUIRED = [
  'position',
  'normal',
  'uv',
  'aColor',
  'aPart0',
  'aPart1',
  'aWeight',
  'aPaint',
  'aOutline',
  'aLift',
  'aMask',
];

const cache = new Map<string, Promise<CharacterModel>>();
const outfitCache = new Map<string, Promise<OutfitModel>>();

export function loadCharacterModel(url: string): Promise<CharacterModel> {
  let pending = cache.get(url);
  if (!pending) {
    pending = load(url);
    cache.set(url, pending);
  }
  return pending;
}

export function loadOutfitModel(url: string): Promise<OutfitModel> {
  let pending = outfitCache.get(url);
  if (!pending) {
    pending = loadOutfit(url);
    outfitCache.set(url, pending);
  }
  return pending;
}

/** First mesh in a .glb, its attributes renamed for the character shader, plus its JSON extras. */
async function loadMesh(url: string, key: string): Promise<{ geometry: THREE.BufferGeometry; data: unknown }> {
  const gltf = await loadGltf(url);
  const meshes: THREE.Mesh[] = [];
  gltf.scene.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh);
  });
  const mesh = meshes[0];
  if (!mesh) throw new Error(`No mesh in ${url}`);
  const raw = mesh.userData[key] ?? mesh.parent?.userData[key];
  if (typeof raw !== 'string') throw new Error(`No ${key} data in ${url}`);

  const geometry = mesh.geometry;
  for (const [from, to] of Object.entries(RENAME)) {
    const attr = geometry.getAttribute(from);
    if (attr) {
      geometry.setAttribute(to, attr);
      geometry.deleteAttribute(from);
    }
  }
  const missing = REQUIRED.filter((name) => !geometry.getAttribute(name));
  if (missing.length) throw new Error(`${url} is missing attributes: ${missing.join(', ')}`);

  // Deformation can push vertices past the rest bounds, so pad the culling sphere.
  geometry.computeBoundingSphere();
  if (geometry.boundingSphere) geometry.boundingSphere.radius *= 1.6;
  return { geometry, data: JSON.parse(raw) };
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Could not load ${url}`));
    img.src = url;
  });
}

async function load(url: string): Promise<CharacterModel> {
  const { geometry, data } = await loadMesh(url, 'rig');
  const rig = data as Rig;
  const anchors = {} as Record<AnchorName, THREE.Vector3>;
  for (const [name, v] of Object.entries(rig.anchors) as [AnchorName, Vec3Tuple][]) {
    anchors[name] = new THREE.Vector3(...v);
  }
  if (!anchors.top) anchors.top = anchors.head.clone();

  let faceLayers: FaceLayers | null = null;
  if (rig.faceAtlas) {
    const image = await loadImage(rig.faceAtlas.url);
    faceLayers = {
      image,
      size: rig.faceAtlas.size,
      rects: rig.faceAtlas.layers,
      expressions: rig.faceAtlas.expressions ?? {},
    };
  }
  let maskTexture: THREE.Texture | null = null;
  if (rig.maskTexture) {
    maskTexture = new THREE.Texture(await loadImage(rig.maskTexture));
    maskTexture.flipY = false; // glTF UVs start at the image's top-left
    maskTexture.colorSpace = THREE.NoColorSpace;
    maskTexture.needsUpdate = true;
  }
  // A rig written before a part was added has fewer parts: the rest stay where they are.
  const parts = Array.from({ length: MAX_PARTS }, (_, i) => rig.parts[i] ?? { pivot: [0, 0, 0] as Vec3Tuple, parent: -1 });
  return {
    geometry,
    rig,
    pivots: parts.map((p) => new THREE.Vector3(...p.pivot)),
    parents: parts.map((p) => p.parent),
    hasHead: rig.parts.length > PART.HEAD,
    anchors,
    faceLayers,
    maskTexture,
    seat: measureSeat(geometry),
  };
}

// Sitting, the soles tip up and the toes turn out (radians).
const SIT_TOE_UP = 0.35;
const SIT_TOE_OUT = 0.45;
// Seated feet sit this many foot radii out to the side, with their soles this far past the
// belly; under a skirt, they stay this far inside the belly's front.
const SEAT_SPLAY = 1.0;
const SEAT_SHOW = 1.6;
const SEAT_TUCK = 0.5;

/**
 * How the model sits, measured from its geometry: the body drops until its lowest point
 * touches the ground and, as the film's characters sit, the legs stretch out in front with
 * the soles just out from under the belly.
 */
function measureSeat(geometry: THREE.BufferGeometry): Seat {
  const pos = geometry.getAttribute('position');
  const part = geometry.getAttribute('aPart0');
  const boxes = [new THREE.Box3(), new THREE.Box3()];
  const p = new THREE.Vector3();
  let drop = Infinity;
  for (let i = 0; i < pos.count; i++) {
    const k = Math.round(part.getX(i));
    // The head, a part of its own, is the body here too, as it was before it was.
    if (k === PART.BODY || k === PART.HEAD) drop = Math.min(drop, pos.getY(i));
    else if (k === PART.FOOT_L || k === PART.FOOT_R) boxes[k - PART.FOOT_L].expandByPoint(p.fromBufferAttribute(pos, i));
  }
  if (!Number.isFinite(drop)) drop = 0;
  const feet = boxes.map((box, i): SeatFoot | null => {
    if (box.isEmpty()) return null;
    const out = i === 0 ? -1 : 1;
    const r = (box.max.x - box.min.x) / 2;
    const length = box.max.y - box.min.y;
    const x = (box.min.x + box.max.x) / 2;
    // The belly's front, in line with the foot, over the height the seated foot covers.
    let front = 0;
    for (let j = 0; j < pos.count; j++) {
      const kj = Math.round(part.getX(j));
      if (kj !== PART.BODY && kj !== PART.HEAD) continue;
      const y = pos.getY(j);
      if (y >= drop && y <= drop + 2 * r && Math.abs(pos.getX(j) - x) <= r) front = Math.max(front, pos.getZ(j));
    }
    const pitch = -(Math.PI / 2 + SIT_TOE_UP);
    const yaw = out * SIT_TOE_OUT;
    // The hip goes where the turned leg puts its sole's centre: on the ground, past the belly.
    const sole = new THREE.Vector3(x + out * SEAT_SPLAY * r, drop + r, front + SEAT_SHOW * r);
    const leg = new THREE.Vector3(0, -length, 0).applyEuler(new THREE.Euler(pitch, yaw, 0, 'YXZ'));
    return {
      hip: new THREE.Vector3(x, box.max.y, (box.min.z + box.max.z) / 2),
      seat: sole.sub(leg),
      pitch,
      yaw,
      tuck: (SEAT_SHOW + SEAT_TUCK) * r,
    };
  });
  return { drop, feet: [feet[0], feet[1]] };
}

async function loadOutfit(url: string): Promise<OutfitModel> {
  const { geometry, data } = await loadMesh(url, 'outfit');
  const billboard = !!geometry.getAttribute('aCenter') && !!geometry.getAttribute('aBill');
  return { geometry, info: data as OutfitInfo, billboard };
}
