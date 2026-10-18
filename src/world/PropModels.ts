import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

/** Props the game's code asks for by name (the rest are placed by the layout file). */
export type PropId = 'onigiri';

/** A face for painted words: its size in metres, whether they run down rather than across, their colour. */
export interface LabelInfo {
  size: [number, number];
  vertical?: boolean;
  colour?: string;
}

/**
 * What a prop's build script tells the game about it, in the prop's own frame (x across, z
 * toward its front, y up; metres).
 */
export interface PropInfo {
  /** The ground it takes up from the ground to its top: circles (x, z, radius) and boxes (half sizes). */
  footprint?: { circle?: number; box?: [number, number]; circles?: [number, number, number][] };
  /** What stops walkers and the camera, each over a range of heights: a circle (x, z, radius) or a
   * box (centre x, z and half sizes). */
  blocks?: {
    circle?: [number, number, number];
    box?: [number, number, number, number];
    y: [number, number];
    walk?: boolean;
    camera?: boolean;
  }[];
  /** Surfaces to walk on: a rectangle (centre x, z and half sizes) at height `top` at its back edge,
   * and `front` at its front edge if it is a ramp. */
  decks?: { box: [number, number, number, number]; top: number; front?: number }[];
  /** How tall it stands, for keeping the camera out of it. */
  height?: number;
  /** How far it is set into the ground, so its foot meets a slope. */
  sink?: number;
  /** Faces for painted words, in the order of its `_label`, `_label1`... parts. */
  label?: LabelInfo;
  labels?: LabelInfo[];
}

/**
 * body: lit and outlined; glow: lights up at night (windows, lanterns); flame: shows only at night;
 * inside: a room's inside, drawn only near; far: a light version for seeing from afar, drawn instead
 * of the body and the inside; label: painted words; board: drawn as the body, the board its words
 * are painted on, which takes the colour of a hand-lettered sign painted solid.
 */
export type PartRole = 'body' | 'glow' | 'flame' | 'inside' | 'far' | 'label' | 'board';

export interface PropModel {
  parts: { role: PartRole; index: number; geometry: THREE.BufferGeometry }[];
  info: PropInfo;
}

const loader = new GLTFLoader();
const cache = new Map<string, Promise<PropModel>>();

function roleOf(name: string): [PartRole, number] {
  const label = /_label(\d*)$/.exec(name);
  if (label) return ['label', label[1] ? Number(label[1]) : 0];
  for (const role of ['glow', 'flame', 'inside', 'far', 'board'] as const) if (name.endsWith(`_${role}`)) return [role, 0];
  return ['body', 0];
}

/** A prop's parts, each geometry in the prop's own frame, and its info. */
export function loadPropModel(id: string): Promise<PropModel> {
  let pending = cache.get(id);
  if (!pending) {
    pending = loader.loadAsync(`models/props/${id}.glb`).then((gltf) => {
      gltf.scene.updateMatrixWorld(true);
      const parts: PropModel['parts'] = [];
      let info: PropInfo = {};
      gltf.scene.traverse((o) => {
        if (typeof o.userData.prop === 'string') info = JSON.parse(o.userData.prop) as PropInfo;
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        const [role, index] = roleOf(mesh.name);
        parts.push({ role, index, geometry: mesh.geometry.clone().applyMatrix4(mesh.matrixWorld) });
      });
      if (parts.length === 0) throw new Error(`No mesh in prop ${id}`);
      // The body first, whatever order the file has.
      parts.sort((a, b) => Number(b.role === 'body') - Number(a.role === 'body'));
      return { parts, info };
    });
    cache.set(id, pending);
  }
  return pending;
}

/** Geometry of a prop's body, with its vertex colours in the `color` attribute. */
export async function loadProp(id: PropId): Promise<THREE.BufferGeometry> {
  const model = await loadPropModel(id);
  return (model.parts.find((p) => p.role === 'body') ?? model.parts[0]).geometry;
}
