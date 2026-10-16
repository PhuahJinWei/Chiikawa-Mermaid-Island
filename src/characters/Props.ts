import * as THREE from 'three';
import { toonRamp } from '../core/toon';
import { inkOutlineMaterial, outlineGeometry } from '../world/Ink';

/** A hand-held rice ball from the Blender prop, outlined with the world's pen. */
export function createOnigiri(geometry: THREE.BufferGeometry): THREE.Group {
  const body = new THREE.Mesh(geometry, new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toonRamp() }));
  const hull = new THREE.Mesh(outlineGeometry(geometry), inkOutlineMaterial());
  const group = new THREE.Group();
  group.add(body, hull);
  return group;
}
