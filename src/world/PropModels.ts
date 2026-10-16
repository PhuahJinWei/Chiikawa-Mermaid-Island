import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

/** Props modelled in Blender by art/blender/build_props.py. */
export type PropId = 'palm' | 'log' | 'starfish' | 'onigiri';

const loader = new GLTFLoader();
const cache = new Map<PropId, Promise<THREE.BufferGeometry>>();

/** Geometry of a prop, with its vertex colours in the `color` attribute. */
export function loadProp(id: PropId): Promise<THREE.BufferGeometry> {
  let pending = cache.get(id);
  if (!pending) {
    pending = loader.loadAsync(`models/props/${id}.glb`).then((gltf) => {
      let geometry: THREE.BufferGeometry | null = null;
      gltf.scene.traverse((o) => {
        if (!geometry && (o as THREE.Mesh).isMesh) geometry = (o as THREE.Mesh).geometry;
      });
      if (!geometry) throw new Error(`No mesh in prop ${id}`);
      return geometry;
    });
    cache.set(id, pending);
  }
  return pending;
}
