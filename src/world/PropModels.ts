import * as THREE from 'three';
import { loadGltf } from '../core/gltf';

/** Props the game's code asks for by name (the rest are placed by the layout file). */
export type PropId = 'can' | 'sword' | 'ukulele';

/** A face for painted words: its size in metres, whether they run down rather than across, their
 * colour, the face whose words it repeats (a stall's side boards repeat its front's), and how many
 * times as sharp as other faces' its words are painted (a small face seen close: the cave's sign). */
export interface LabelInfo {
  size: [number, number];
  vertical?: boolean;
  colour?: string;
  repeat?: number;
  sharp?: number;
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
  /** A house's night: its lantern's light on its body and room, baked in Blender into `map` (in
   * models/props) on the parts' UVs, each texel the square root of its light's share of `scale`,
   * for a lantern of `power` watts (see bake_night in art/blender/houses.py). */
  night?: { map: string; scale: number; power: number };
  /** A prop's painted texture (in models/props), `size` texels wide and high: its wood's grain, knots
   * and weather, its painted wood's paint worn through, its signs' peeling paint, rust, laid on its
   * body's and room's paint UVs (a baked house's second, `uv1`, a prop with no night its first,
   * `uv`; below 0 where a small thing keeps its own colour; see paintmap.py in art/blender). */
  paint?: { map: string; size?: number | [number, number] };
  /** A house's doorways and windows: each one's middle on the wall's outer face, the way out of it,
   * its width and height, and whether it is a doorway; its lantern's light spills out of them, as
   * its `mask` (base64) says it passes (see Opening in Firelight). */
  openings?: {
    at: [number, number, number];
    out: [number, number, number];
    size: [number, number];
    door: boolean;
    mask?: string;
  }[];
  /** A book's (art/blender/books.py): the line its left half swings shut about, along z through this point, as it
   * is opened to be read (see its `open` and `page` parts), and how far it swings to lie shut (radians). */
  hinge?: [number, number, number];
  swing?: number;
}

/**
 * body: lit and outlined; glow: lights up at night and lights what is round it (lanterns, the
 * ferry's windows); spot: a lamp under a shade shining on a sign, lit at night and lighting what is
 * near it brightly; lamp: a room's lantern, which lights up at night and lights the room; pane: a
 * house's window pane, lit at night seen from outside and turned away from inside so the window is
 * clear there, drawn without the pen and lighting nothing; flame: shows only at night;
 * inside: a room's inside, drawn only near; far: a light version for seeing from afar, drawn instead
 * of the body and the inside; label: painted words; board: drawn as the body, the board its words
 * are painted on, which takes the colour of a hand-lettered sign painted solid. A book's open halves,
 * shown only as it is read: open, each half's cloth and pages' block (`_open0` the right, `_open1` the
 * left); page, the tops of its pages, the spread's picture on them (`_page0`, `_page1`).
 */
export type PartRole = 'body' | 'glow' | 'spot' | 'lamp' | 'pane' | 'flame' | 'inside' | 'far' | 'label' | 'board' | 'open' | 'page';

export interface PropModel {
  parts: { role: PartRole; index: number; geometry: THREE.BufferGeometry }[];
  info: PropInfo;
}

const cache = new Map<string, Promise<PropModel>>();

function roleOf(name: string): [PartRole, number] {
  const label = /_label(\d*)$/.exec(name);
  if (label) return ['label', label[1] ? Number(label[1]) : 0];
  const book = /_(open|page)(\d)$/.exec(name);
  if (book) return [book[1] as 'open' | 'page', Number(book[2])];
  for (const role of ['glow', 'spot', 'lamp', 'pane', 'flame', 'inside', 'far', 'board'] as const) if (name.endsWith(`_${role}`)) return [role, 0];
  return ['body', 0];
}

/** A prop's parts, each geometry in the prop's own frame, and its info. */
export function loadPropModel(id: string): Promise<PropModel> {
  let pending = cache.get(id);
  if (!pending) {
    pending = loadGltf(`models/props/${id}.glb`).then((gltf) => {
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
