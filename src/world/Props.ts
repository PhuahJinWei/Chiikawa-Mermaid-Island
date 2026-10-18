import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { sceneryRamp } from '../core/toon';
import { t, type StringKey } from '../i18n/I18n';
import type { FireKind } from './Firelight';
import { glowMaterial, glowUniforms } from './Glow';
import { INK, addOutline, windUniforms } from './Ink';
import { terrainHeight } from './Island';
import { FILM, paintThatch } from './Look';
import { addBox, addCircle, addDeck } from './Obstacles';
import { loadPropModel, type LabelInfo, type PartRole, type PropInfo } from './PropModels';

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
  /** Props in the same group are joined together and drawn near or far together; others are
   * grouped by patch of the island. */
  group?: string;
}

/** Props are joined into meshes for each patch of this many metres, unless they name a group. */
const PATCH = 48;
/** A group's houses are drawn in full this close, and in their light far version beyond; their
 * rooms' insides only this close. */
const NEAR_REACH = 75;
const INSIDE_REACH = 32;
/** Small props (within a metre and a half of their middle: baskets, pots, logs, starfish) are
 * drawn only this close. */
const SMALL_SIZE = 1.5;
const SMALL_REACH = 60;
/** Painted words go into one atlas this size, as sharp as fits: at most LABEL_PIXELS pixels per
 * metre of a label face, fewer if every label would not fit otherwise. */
const LABEL_PIXELS = 220;
const ATLAS_WIDTH = 2048;
const ATLAS_HEIGHT = 1024;

/** Which pieces of a group are drawn when: always, near, inside (closer still), far, or at night. */
type Level = 'always' | 'near' | 'small' | 'inside' | 'far' | 'night';
type Kind = 'body' | 'glow' | 'flame';

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

/**
 * The hand-lettered signs, by the key of their words: paintings from art/signs/, copied into
 * public/signs/ by art/blender/build_signs.py and listed in its signs.json. None if there is no
 * list; a sign that fails to load keeps its typed words.
 */
async function loadPaintedSigns(): Promise<Map<string, ImageBitmap>> {
  const painted = new Map<string, ImageBitmap>();
  let names: string[] = [];
  try {
    const response = await fetch('signs/signs.json');
    if (response.ok) names = ((await response.json()) as { signs?: string[] }).signs ?? [];
  } catch {
    return painted;
  }
  await Promise.all(
    names.map(async (name) => {
      try {
        const response = await fetch(`signs/${encodeURIComponent(name)}.png`);
        if (response.ok) painted.set(name, await createImageBitmap(await response.blob()));
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
 * painted the film's way (see paintThatch). */
function toon(): THREE.MeshToonMaterial {
  const material = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: sceneryRamp() });
  if (FILM) material.onBeforeCompile = (shader) => paintThatch(shader);
  return material;
}

/** How much brighter than white the film look burns flames, so they glow. */
const FLAME_BRIGHT = 3;

/** Unlit vertex colours: flames, which make their own light, licking and wavering, the more the
 * higher up the flame (which the colours tell: a pale yellow heart, orange tips). */
function flameMaterial(): THREE.MeshBasicMaterial {
  const material = new THREE.MeshBasicMaterial({ vertexColors: true });
  if (FILM) material.color.setRGB(FLAME_BRIGHT, FLAME_BRIGHT, FLAME_BRIGHT);
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, windUniforms);
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime;').replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
      {
        float up = clamp((0.9 - color.g) / 0.76, 0.0, 1.0);
        float phase = dot(floor(position.xz * 2.0), vec2(1.7, 2.3));
        transformed.x += up * up * 0.07 * sin(uTime * 8.0 + phase + position.y * 3.0);
        transformed.z += up * up * 0.05 * cos(uTime * 6.5 + phase * 1.3 + position.y * 2.0);
        transformed.y += up * 0.08 * sin(uTime * 11.0 + phase * 0.7);
      }`,
    );
  };
  return material;
}

/** A part's geometry moved into place, with only what the merged mesh needs: position, normal and
 * colour (RGB, tinted), or the label's UVs. */
function placedGeometry(
  source: THREE.BufferGeometry,
  matrix: THREE.Matrix4,
  tint: THREE.Color | null,
  withUv: boolean,
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

/**
 * Paints every label's words into one texture, each in its own patch, and points its UVs there:
 * its hand-lettered sign where there is one, otherwise its words typed in the phone's own rounded
 * Japanese font, as the HUD uses, running across the face, or down a vertical one.
 */
function paintLabels(labels: Label[], painted: Map<string, ImageBitmap>): THREE.CanvasTexture {
  // Shelves, tallest labels first: left to right, then down. Lower the density until all fit.
  let sizes: number[][] = [];
  let places: [number, number][] = [];
  let used = 0;
  for (let density = LABEL_PIXELS; density >= 100; density -= 10) {
    sizes = labels.map((l) => [
      Math.min(ATLAS_WIDTH, Math.round(l.info.size[0] * density)),
      Math.min(ATLAS_WIDTH, Math.round(l.info.size[1] * density)),
    ]);
    const order = sizes.map((_, i) => i).sort((a, b) => sizes[b][1] - sizes[a][1]);
    places = new Array(labels.length);
    let x = 0;
    let y = 0;
    let shelf = 0;
    for (const i of order) {
      const [w, h] = sizes[i];
      if (x + w > ATLAS_WIDTH) {
        x = 0;
        y += shelf;
        shelf = 0;
      }
      places[i] = [x, y];
      x += w;
      shelf = Math.max(shelf, h);
    }
    used = y + shelf;
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
    // Point the face's UVs (0..1 across and down it) at its patch.
    const uv = label.geometry.getAttribute('uv');
    for (let k = 0; k < uv.count; k++) {
      uv.setXY(k, (px + uv.getX(k) * w) / ATLAS_WIDTH, (py + uv.getY(k) * h) / height);
    }
  });
  const texture = new THREE.CanvasTexture(canvas);
  // The UVs count down from the top, as the canvas does.
  texture.flipY = false;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
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
  private readonly flames: THREE.Object3D[] = [];
  /** Where each flame, lit window and lantern is, for the firelight (see Firelight). */
  readonly fires: { position: THREE.Vector3; kind: FireKind }[] = [];

  static async load(placed: Placed[], waterLevel: number): Promise<Props> {
    const kinds = [...new Set(placed.map((p) => p.kind))];
    const signs = loadPaintedSigns();
    const models = new Map(await Promise.all(kinds.map(async (k) => [k, await loadPropModel(k)] as const)));
    const props = new Props();
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
      const small = (body.boundingSphere as THREE.Sphere).radius * scale < SMALL_SIZE;
      const key = p.group ?? `${Math.floor(p.x / PATCH)},${Math.floor(p.z / PATCH)}`;
      const words = p.labels ?? (p.label ? [p.label] : []);
      const labelInfos = model.info.labels ?? (model.info.label ? [model.info.label] : []);
      for (const part of model.parts) {
        if (part.role === 'label') {
          const text = words[part.index];
          const info = labelInfos[part.index];
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
        const kind: Kind = part.role === 'glow' ? 'glow' : part.role === 'flame' ? 'flame' : 'body';
        props.collect(key, level, kind, placedGeometry(part.geometry, matrix, tint, false));
        if (kind !== 'body') {
          if (!part.geometry.boundingBox) part.geometry.computeBoundingBox();
          const centre = (part.geometry.boundingBox as THREE.Box3).getCenter(new THREE.Vector3()).applyMatrix4(matrix);
          props.fires.push({ position: centre, kind });
        }
      }
    });
    props.build();

    if (labels.length > 0) {
      const texture = paintLabels(labels, await signs);
      const words = new THREE.Mesh(
        mergeGeometries(labels.map((l) => l.geometry)),
        new THREE.MeshToonMaterial({
          map: texture,
          gradientMap: sceneryRamp(),
          transparent: true,
          depthWrite: false,
          polygonOffset: true,
          polygonOffsetFactor: -2,
          polygonOffsetUnits: -2,
        }),
      );
      props.group.add(words);
    }
    return props;
  }

  private collect(key: string, level: Level, kind: Kind, geometry: THREE.BufferGeometry): void {
    let group = this.groups.get(key);
    if (!group) {
      group = { geometries: new Map(), objects: new Map(), centre: new THREE.Vector3(), radius: 0 };
      this.groups.set(key, group);
    }
    const id = `${level}:${kind}`;
    const list = group.geometries.get(id) ?? [];
    list.push(geometry);
    group.geometries.set(id, list);
  }

  /** Joins each group's pieces into a mesh per level and kind, outlined, and finds its bounds. */
  private build(): void {
    const materials: Record<Kind, THREE.Material> = { body: toon(), glow: glowMaterial(), flame: flameMaterial() };
    const box = new THREE.Box3();
    const sphere = new THREE.Sphere();
    for (const group of this.groups.values()) {
      box.makeEmpty();
      for (const [id, list] of group.geometries) {
        const [level, kind] = id.split(':') as [Level, Kind];
        const mesh = new THREE.Mesh(mergeGeometries(list), materials[kind]);
        mesh.geometry.computeBoundingBox();
        box.union(mesh.geometry.boundingBox as THREE.Box3);
        this.group.add(mesh);
        const objects = group.objects.get(level) ?? [];
        objects.push(mesh);
        // In the film look the houses, stalls and pier are scenery, painted without a line, casting
        // and taking the sun's shadows.
        mesh.castShadow = mesh.receiveShadow = FILM && kind === 'body';
        if (kind === 'flame') this.flames.push(mesh);
        else if (!FILM) objects.push(addOutline(mesh));
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
    for (const part of parts) {
      if (part.role === 'label' || part.role === 'far' || part.role === 'inside') continue;
      const mesh = new THREE.Mesh(part.geometry, part.role === 'glow' ? glowMaterial() : toon());
      object.add(mesh);
      // The ferry moves, so even in the film look it is drawn with the pen, as the film draws it.
      addOutline(mesh);
      mesh.castShadow = FILM;
    }
    this.group.add(object);
    this.floaters.push({ object, y, phase: seed * 1.37 });
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
          (level === 'inside' && d < INSIDE_REACH) ||
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
