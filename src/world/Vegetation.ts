import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { sceneryRamp } from '../core/toon';
import { SWAY_GLSL, addOutline, windUniforms } from './Ink';
import type { TerrainInfo } from './Island';
import { FILM, paintLeaves, puffShadow, shadeUnderTrees } from './Look';
import { addCircle, addCrown } from './Obstacles';

/** Plants under the canopy are drawn only this close to the camera, in metres; the canopy and the
 * palms in full this close, and as their light far version beyond. */
const UNDERSTORY_REACH = 34;
const CANOPY_REACH = 38;

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
    }
  };
  // Each cluster size compiles its own shader: the setup above reads the same for all of them.
  material.customProgramCacheKey = () => `plant:${clusters}`;
  // In the film look a leaf's splits and leaflets are cut away through the picture's smoothing.
  material.alphaToCoverage = FILM && !clusters;
  return material;
}

interface Patch {
  meshes: THREE.Object3D[];
  centre: THREE.Vector3;
  radius: number;
  /** For the canopy: the patch's far version, shown instead beyond CANOPY_REACH. */
  far: THREE.Object3D[];
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
 * list of where each copy stands, joined here into a mesh per patch. The canopy and palms are drawn
 * in full near the camera and in their light far version beyond; the smaller plants under them only
 * near. Trunks keep characters out, and crowns keep the camera out.
 */
export class Vegetation {
  readonly group = new THREE.Group();
  private readonly understory: Patch[] = [];
  private readonly canopy: Patch[] = [];

  static async load(info: TerrainInfo): Promise<Vegetation> {
    const gltf = await new GLTFLoader().loadAsync(info.plants.url);
    const vegetation = new Vegetation();
    const material = plantMaterial();
    // Tree crowns, near and far: in the film look painted in leaf clusters, larger far off.
    const crowns = FILM ? plantMaterial(0.85) : material;
    const crownsFar = FILM ? plantMaterial(2.4) : material;
    // In the film look the sun comes through the gaps between the crowns' puffs.
    const shadows = FILM ? { near: puffShadow(0.85, swayVertices), far: puffShadow(2.4, swayVertices) } : null;
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
    for (const [index, x, y, z, turn, s] of info.plants.placed.under ?? []) {
      const g = place(index, x, y, z, turn, s);
      if (g) add(`under:${patchOf(x, z, underPatches)}`, g);
    }

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
      if (layer === 'under') {
        vegetation.understory.push({ meshes: objects, centre: sphere.center.clone(), radius: sphere.radius, far: [] });
        continue;
      }
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

    // A trunk keeps the camera out up to where its crown begins, which the crowns cover from there.
    for (const [x, z, r] of info.plants.trunks) addCircle(x, z, r, -10, 12);
    for (const [x, y, z, r] of info.plants.crowns) addCrown(x, y, z, r);
    return vegetation;
  }

  update(camera: THREE.Camera): void {
    const p = camera.position;
    for (const patch of this.understory) {
      const near = p.distanceTo(patch.centre) - patch.radius < UNDERSTORY_REACH;
      for (const m of patch.meshes) m.visible = near;
    }
    for (const patch of this.canopy) {
      const near = p.distanceTo(patch.centre) - patch.radius < CANOPY_REACH;
      for (const m of patch.meshes) m.visible = near;
      for (const m of patch.far) m.visible = !near;
    }
  }
}
