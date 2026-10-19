import * as THREE from 'three';
import { toonRamp } from '../core/toon';
import { fireLights } from '../world/Firelight';
import { inkOutlineMaterial, outlineGeometry } from '../world/Ink';

/** A hand-held rice ball from the Blender prop, outlined with the world's pen. */
export function createOnigiri(geometry: THREE.BufferGeometry): THREE.Group {
  const material = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toonRamp() });
  material.onBeforeCompile = (shader) => fireLights(shader);
  const body = new THREE.Mesh(geometry, material);
  const hull = new THREE.Mesh(outlineGeometry(geometry), inkOutlineMaterial());
  const group = new THREE.Group();
  group.add(body, hull);
  return group;
}
