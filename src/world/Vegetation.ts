import * as THREE from 'three';
import { loadGltf } from '../core/gltf';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { sceneryRamp } from '../core/toon';
import { fireLights } from './Firelight';
import { SWAY_GLSL, addOutline, windUniforms } from './Ink';
import { terrainHeight, type TerrainInfo } from './Island';
import { FILM, LEAF_KEEP_GLSL, moonEdges, paintLeaves, puffShadow, shadeUnderTrees } from './Look';
import { addCircle, addCrown } from './Obstacles';

/** Plants under the canopy are drawn only this close to the camera, in metres; the canopy and the
 * palms in full this close, and as their light far version beyond. */
const UNDERSTORY_REACH = 34;
const CANOPY_REACH = 38;
/** A patch of the understory is put together from its plants' shapes once the camera is this much
 * further than UNDERSTORY_REACH from it, ahead of being drawn, this many vertices a frame (about a
 * third of a millisecond on the dev PC, a patch in a few frames), and let go of again beyond this
 * much further (see Vegetation.update): some 30 MB of it on the GPU on a walk through the jungle, at
 * most 43, of the 176 that all of it takes. */
const UNDERSTORY_AHEAD = 6;
const UNDERSTORY_BUILD = 12000;
const UNDERSTORY_KEEP = 12;

/**
 * Toon-shaded plants that move in the wind, by the sway weight on each vertex. In the film look
 * they take the soft ramp and their leaves are dabbed light and dark; tree crowns (`clusters`: the
 * clusters' size in metres) are painted as the film paints them, in leaf clusters lit on top, their
 * edges broken into clusters too.
 */
/** Moves a plant's vertices in the wind, by the sway weight on each. */
function swayVertices(shader: THREE.WebGLProgramParametersWithUniforms): void {
  Object.assign(shader.uniforms, windUniforms);
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', `#include <common>\nattribute float aSway;\n${SWAY_GLSL}`)
    .replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed += sway(transformed, aSway);');
}

function plantMaterial(clusters = 0): THREE.MeshToonMaterial {
  const material = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: sceneryRamp() });
  material.onBeforeCompile = (shader) => {
    swayVertices(shader);
    if (FILM) {
      paintLeaves(shader, clusters);
      shadeUnderTrees(shader);
      moonEdges(shader);
      fireLights(shader);
    }
  };
  // Each cluster size compiles its own shader: the setup above reads the same for all of them.
  material.customProgramCacheKey = () => `plant:${clusters}`;
  // In the film look a leaf's splits and leaflets are cut away through the picture's smoothing.
  material.alphaToCoverage = FILM && !clusters;
  return material;
}

/**
 * The understory's shadow in the film look: it moves in the wind with the plants, and a leaf cut
 * from its card (a bush's oval leaves and flowers, a monstera's splits, a frond's leaflets) casts
 * only the leaf, as the plant's own material draws it.
 */
function leafShadow(): THREE.MeshDepthMaterial {
  const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  depth.onBeforeCompile = (shader) => {
    swayVertices(shader);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec2 aLeaf;\nvarying vec2 vLeafAt;')
      .replace('#include <project_vertex>', 'vLeafAt = aLeaf;\n#include <project_vertex>');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec2 vLeafAt;\n${LEAF_KEEP_GLSL}`)
      .replace('void main() {', 'void main() {\n  if (leafKeep(vLeafAt) < 0.5) discard;');
  };
  return depth;
}

interface Patch {
  meshes: THREE.Object3D[];
  centre: THREE.Vector3;
  radius: number;
  /** For the canopy: the patch's far version, shown instead beyond CANOPY_REACH. */
  far: THREE.Object3D[];
}

/**
 * A patch of the understory: each of its plants, a shape and where it stands, and its bounds, those
 * of its mesh; and its mesh, outlined in the toon look, while the camera is near enough (see
 * Vegetation.update), put together from the shapes as it comes near.
 */
interface UnderPatch {
  copies: [THREE.BufferGeometry, THREE.Matrix4][];
  vertices: number;
  indices: number;
  centre: THREE.Vector3;
  radius: number;
  objects: THREE.Object3D[];
  /** The mesh being put together: its geometry's arrays, and how many of the copies are in them. */
  work: { geometry: THREE.BufferGeometry; done: number; vertex: number; index: number } | null;
}

/** A plant's geometry with only what the merged meshes need: position, normal, colour, sway and
 * where on its leaf each vertex is (off the leaves, across 9). */
function plain(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
  const out = new THREE.BufferGeometry();
  for (const name of ['position', 'normal', 'color'] as const) {
    const a = geometry.getAttribute(name);
    if (a) out.setAttribute(name, a);
  }
  const count = out.getAttribute('position').count;
  const sway = geometry.getAttribute('_sway') ?? geometry.getAttribute('aSway');
  out.setAttribute('aSway', sway ?? new THREE.BufferAttribute(new Float32Array(count), 1));
  const leaf = geometry.getAttribute('_leaf') ?? geometry.getAttribute('aLeaf');
  out.setAttribute('aLeaf', leaf ?? new THREE.BufferAttribute(new Float32Array(count * 2).fill(9), 2));
  if (geometry.index) out.setIndex(geometry.index);
  return out;
}

/**
 * The jungle, the fields' crops and the flowers round the village's huts, built in Blender with
 * the ground (art/blender/build_island.py). The canopy comes as a mesh per patch of the map, near
 * and far; plants planted many times (palms, the understory, crops) come as one shape each and a
 * list of where each copy stands, joined here into a mesh per patch: the palms' at once, the
 * understory's only as the camera comes near (see update). The canopy and palms are drawn in full
 * near the camera and in their light far version beyond; the smaller plants under them only near.
 * Trunks keep characters out, and crowns keep the camera out.
 */
export class Vegetation {
  readonly group = new THREE.Group();
  private readonly understory: UnderPatch[] = [];
  private readonly canopy: Patch[] = [];
  /** The understory's patches to be put together, nearest the camera first (see update). */
  private building: UnderPatch[] = [];
  private underMaterial: THREE.Material | null = null;
  private underShadow: THREE.Material | null = null;

  static async load(info: TerrainInfo): Promise<Vegetation> {
    const gltf = await loadGltf(info.plants.url);
    const vegetation = new Vegetation();
    const material = plantMaterial();
    // Tree crowns, near and far: in the film look painted in leaf clusters, larger far off.
    const crowns = FILM ? plantMaterial(0.85) : material;
    const crownsFar = FILM ? plantMaterial(2.4) : material;
    // In the film look the sun comes through the gaps between the crowns' puffs.
    const shadows = FILM ? { near: puffShadow(0.85, swayVertices), far: puffShadow(2.4, swayVertices) } : null;
    const underShadow = FILM ? leafShadow() : null;
    const shapes = new Map<number, THREE.BufferGeometry>();
    // Patches of the map, keyed "layer:i,j": the geometries to join into each.
    const parts = new Map<string, THREE.BufferGeometry[]>();
    const add = (key: string, g: THREE.BufferGeometry) => {
      const list = parts.get(key) ?? [];
      list.push(g);
      parts.set(key, list);
    };
    gltf.scene.updateMatrixWorld(true);
    gltf.scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const g = plain(mesh.geometry.clone().applyMatrix4(mesh.matrixWorld));
      const shape = /^v(\d+)$/.exec(mesh.name);
      if (shape) shapes.set(Number(shape[1]), g);
      else if (mesh.name.startsWith('canopyfar')) add(`far:${mesh.name.slice('canopyfar_'.length)}`, g);
      else if (mesh.name.startsWith('canopy')) add(`near:${mesh.name.slice('canopy_'.length)}`, g);
    });

    // Plant every copy of the shapes planted many times into its patch.
    const { origin, size } = info;
    const patchOf = (x: number, z: number, patches: number) => {
      const i = Math.min(Math.max(Math.floor(((x - origin[0]) / size) * patches), 0), patches - 1);
      const j = Math.min(Math.max(Math.floor(((z - origin[1]) / size) * patches), 0), patches - 1);
      return `${i}_${j}`;
    };
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const at = new THREE.Vector3();
    const scale = new THREE.Vector3();
    const place = (index: number, x: number, y: number, z: number, turn: number, s: number) => {
      const shape = shapes.get(index);
      if (!shape) return null;
      m.compose(at.set(x, y, z), q.setFromAxisAngle(up, turn), scale.set(s, s, s));
      return shape.clone().applyMatrix4(m);
    };
    const { canopy: canopyPatches, understory: underPatches } = info.plants.patches;
    for (const [index, x, y, z, turn, s, far] of info.plants.placed.palms ?? []) {
      const key = patchOf(x, z, canopyPatches);
      const near = place(index, x, y, z, turn, s);
      if (near) add(`palm:${key}`, near);
      const distant = far === undefined ? null : place(far, x, y, z, turn, s);
      if (distant) add(`palmfar:${key}`, distant);
    }
    // The understory's plants only listed, each patch's put together when the camera comes near it.
    const under = new Map<string, [THREE.BufferGeometry, THREE.Matrix4][]>();
    for (const [index, x, y, z, turn, s] of info.plants.placed.under ?? []) {
      const shape = shapes.get(index);
      if (!shape) continue;
      const key = patchOf(x, z, underPatches);
      const list = under.get(key) ?? [];
      under.set(key, list);
      list.push([shape, new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(up, turn), new THREE.Vector3(s, s, s))]);
    }
    for (const copies of under.values()) vegetation.understory.push(underPatch(copies));
    vegetation.underMaterial = material;
    vegetation.underShadow = underShadow;

    // Join each patch's plants into one mesh, outlined; in the film look painted without a line,
    // casting and taking the sun's shadows.
    const built = new Map<string, Patch>();
    for (const [key, list] of parts) {
      const [layer, cell] = key.split(':');
      const mesh = new THREE.Mesh(mergeGeometries(list), layer === 'near' ? crowns : layer === 'far' ? crownsFar : material);
      mesh.geometry.computeBoundingSphere();
      const sphere = mesh.geometry.boundingSphere as THREE.Sphere;
      vegetation.group.add(mesh);
      mesh.castShadow = mesh.receiveShadow = FILM;
      if (shadows && (layer === 'near' || layer === 'far')) mesh.customDepthMaterial = shadows[layer];
      const objects: THREE.Object3D[] = FILM ? [mesh] : [mesh, addOutline(mesh)];
      let patch = built.get(cell);
      if (!patch) {
        patch = { meshes: [], centre: sphere.center.clone(), radius: sphere.radius, far: [] };
        built.set(cell, patch);
        vegetation.canopy.push(patch);
      }
      if (layer === 'near' || layer === 'palm') {
        patch.meshes.push(...objects);
        if (layer === 'near') {
          patch.centre.copy(sphere.center);
          patch.radius = sphere.radius;
        }
      } else {
        patch.far.push(...objects);
      }
    }

    // A trunk keeps the camera out up to where its crown begins, which the crowns cover from there; from
    // a little under its foot, so the forbidden cave under the spur's jungle is clear of them.
    for (const [x, z, r] of info.plants.trunks) {
      const foot = terrainHeight(x, z);
      addCircle(x, z, r, foot - 1.5, foot + 12);
    }
    for (const [x, y, z, r] of info.plants.crowns) addCrown(x, y, z, r);
    return vegetation;
  }

  /**
   * Each patch near enough the camera drawn whole, the canopy's further off in its far version; and
   * with `lookout` (from deep in the forbidden cave, see Cave.lookout), only the plants near it and no
   * trees: from there the jungle shows only up the skylight's well, and the film shows it from the
   * water under it as the low plants round its edge against the sky (`cave interior 6`), though from
   * above the trees crowd round it (`cave interior 5`).
   *
   * The understory's patches are put together from their plants' shapes as the camera comes within
   * UNDERSTORY_AHEAD of their reach, nearest first and UNDERSTORY_BUILD vertices a frame (at once, if
   * one is in reach already: the camera has jumped), and let go of again beyond UNDERSTORY_KEEP. All
   * of them together, 11,549 plants of 58 shapes on 2026-10-21, are 3.7 million vertices and 176 MB on
   * the GPU, of which the camera needs a few patches at a time.
   */
  update(camera: THREE.Camera, lookout: { x: number; z: number; r: number } | null = null): void {
    const p = camera.position;
    const seen = (patch: { centre: THREE.Vector3; radius: number }) =>
      !lookout || Math.hypot(patch.centre.x - lookout.x, patch.centre.z - lookout.z) - patch.radius < lookout.r;
    const away = (patch: UnderPatch) => p.distanceTo(patch.centre) - patch.radius;
    for (const patch of this.understory) {
      const off = away(patch);
      if (off > UNDERSTORY_REACH + UNDERSTORY_KEEP) this.letGo(patch);
      else if (off < UNDERSTORY_REACH + UNDERSTORY_AHEAD && patch.objects.length === 0 && !this.building.includes(patch)) this.building.push(patch);
      const near = off < UNDERSTORY_REACH && seen(patch);
      if (near && patch.objects.length === 0) this.build(patch, Infinity);
      for (const m of patch.objects) m.visible = near;
    }
    this.building.sort((a, b) => away(a) - away(b));
    let budget = UNDERSTORY_BUILD;
    while (budget > 0 && this.building.length > 0) budget = this.build(this.building[0], budget);
    for (const patch of this.canopy) {
      const show = !lookout;
      const near = p.distanceTo(patch.centre) - patch.radius < CANOPY_REACH;
      for (const m of patch.meshes) m.visible = near && show;
      for (const m of patch.far) m.visible = !near && show;
    }
  }

  /**
   * Puts `patch`'s mesh together, up to `budget` vertices more of it, as a copy of each plant's shape
   * moved to where it stands and all joined would be (see place and mergeGeometries in load): the
   * same arrays, to the bit, in the same order. Returns what is left of the budget. Once whole, the
   * mesh lets go of its arrays as soon as the GPU has them, as the island's other shapes do (see
   * releaseOnUpload in Stage): it is put together again from the shapes if it is needed after being
   * let go of.
   */
  private build(patch: UnderPatch, budget: number): number {
    patch.work ??= { geometry: emptyJoin(patch), done: 0, vertex: 0, index: 0 };
    const work = patch.work;
    const out = work.geometry;
    const normal = new THREE.Matrix3();
    while (work.done < patch.copies.length && budget > 0) {
      const [shape, matrix] = patch.copies[work.done++];
      const count = shape.getAttribute('position').count;
      const e = matrix.elements;
      const n = normal.getNormalMatrix(matrix).elements;
      for (const name of Object.keys(out.attributes)) {
        const to = out.getAttribute(name) as THREE.BufferAttribute;
        const from = (shape.getAttribute(name) as THREE.BufferAttribute).array;
        const at = work.vertex * to.itemSize;
        const into = to.array as Float32Array;
        if (name === 'position') {
          for (let i = 0; i < count * 3; i += 3) {
            const x = from[i];
            const y = from[i + 1];
            const z = from[i + 2];
            into[at + i] = e[0] * x + e[4] * y + e[8] * z + e[12];
            into[at + i + 1] = e[1] * x + e[5] * y + e[9] * z + e[13];
            into[at + i + 2] = e[2] * x + e[6] * y + e[10] * z + e[14];
          }
        } else if (name === 'normal') {
          for (let i = 0; i < count * 3; i += 3) {
            const x = n[0] * from[i] + n[3] * from[i + 1] + n[6] * from[i + 2];
            const y = n[1] * from[i] + n[4] * from[i + 1] + n[7] * from[i + 2];
            const z = n[2] * from[i] + n[5] * from[i + 1] + n[8] * from[i + 2];
            const scale = 1 / (Math.sqrt(x * x + y * y + z * z) || 1);
            into[at + i] = x * scale;
            into[at + i + 1] = y * scale;
            into[at + i + 2] = z * scale;
          }
        } else {
          into.set(from, at);
        }
      }
      if (out.index && shape.index) {
        const into = out.index.array;
        const from = shape.index.array;
        for (let i = 0; i < from.length; i++) into[work.index + i] = from[i] + work.vertex;
        work.index += from.length;
      }
      work.vertex += count;
      budget -= count;
    }
    if (work.done < patch.copies.length) return budget;
    patch.work = null;
    this.building = this.building.filter((b) => b !== patch);
    out.boundingSphere = new THREE.Sphere(patch.centre.clone(), patch.radius);
    const mesh = new THREE.Mesh(out, this.underMaterial ?? undefined);
    mesh.castShadow = mesh.receiveShadow = FILM;
    if (this.underShadow) mesh.customDepthMaterial = this.underShadow;
    mesh.visible = false;
    this.group.add(mesh);
    patch.objects = FILM ? [mesh] : [mesh, addOutline(mesh)];
    for (const o of patch.objects) {
      const geometry = (o as THREE.Mesh).geometry;
      for (const attribute of [...Object.values(geometry.attributes), geometry.index]) (attribute as THREE.BufferAttribute | null)?.onUpload(release);
    }
    return budget;
  }

  /** Lets go of `patch`'s mesh, or what is put together of it, until the camera comes near again. */
  private letGo(patch: UnderPatch): void {
    if (patch.objects.length === 0 && !patch.work) return;
    for (const o of patch.objects) {
      o.removeFromParent();
      (o as THREE.Mesh).geometry.dispose();
    }
    patch.objects = [];
    patch.work = null;
    this.building = this.building.filter((b) => b !== patch);
  }
}

/**
 * A patch of the understory, its plants listed (each a shape and where it stands) and its mesh yet
 * to be put together (see Vegetation.build): how big the mesh will be, and its bounds, those three
 * would find for it, the box round its vertices as the GPU will have them and from the box's middle
 * out to the furthest.
 */
function underPatch(copies: [THREE.BufferGeometry, THREE.Matrix4][]): UnderPatch {
  let vertices = 0;
  let indices = 0;
  for (const [shape] of copies) {
    vertices += shape.getAttribute('position').count;
    indices += shape.index?.count ?? 0;
  }
  const f = Math.fround;
  const each = (visit: (x: number, y: number, z: number) => void) => {
    for (const [shape, matrix] of copies) {
      const from = (shape.getAttribute('position') as THREE.BufferAttribute).array;
      const e = matrix.elements;
      for (let i = 0; i < from.length; i += 3) {
        const x = from[i];
        const y = from[i + 1];
        const z = from[i + 2];
        visit(f(e[0] * x + e[4] * y + e[8] * z + e[12]), f(e[1] * x + e[5] * y + e[9] * z + e[13]), f(e[2] * x + e[6] * y + e[10] * z + e[14]));
      }
    }
  };
  const box = new THREE.Box3();
  each((x, y, z) => {
    if (x < box.min.x) box.min.x = x;
    if (y < box.min.y) box.min.y = y;
    if (z < box.min.z) box.min.z = z;
    if (x > box.max.x) box.max.x = x;
    if (y > box.max.y) box.max.y = y;
    if (z > box.max.z) box.max.z = z;
  });
  const centre = box.getCenter(new THREE.Vector3());
  let furthest = 0;
  each((x, y, z) => {
    const dx = centre.x - x;
    const dy = centre.y - y;
    const dz = centre.z - z;
    furthest = Math.max(furthest, dx * dx + dy * dy + dz * dz);
  });
  return { copies, vertices, indices, centre, radius: Math.sqrt(furthest), objects: [], work: null };
}

/** A geometry with room for every vertex of `patch`'s plants, its arrays of the kinds its first
 * plant's shape has (as mergeGeometries gives them), its index wide enough for all its vertices. */
function emptyJoin(patch: UnderPatch): THREE.BufferGeometry {
  const first = patch.copies[0][0];
  const out = new THREE.BufferGeometry();
  for (const name of Object.keys(first.attributes)) {
    const a = first.getAttribute(name) as THREE.BufferAttribute;
    const Kind = a.array.constructor as new (length: number) => THREE.TypedArray;
    out.setAttribute(name, new THREE.BufferAttribute(new Kind(patch.vertices * a.itemSize), a.itemSize, a.normalized));
  }
  if (first.index) out.setIndex(new THREE.BufferAttribute(patch.vertices - 1 >= 65535 ? new Uint32Array(patch.indices) : new Uint16Array(patch.indices), 1));
  return out;
}

/** An attribute's array let go of once it has gone to the GPU (see Vegetation.build). */
function release(this: THREE.BufferAttribute): void {
  (this as { array: unknown }).array = null;
}
