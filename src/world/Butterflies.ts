import * as THREE from 'three';
import { toonRamp } from '../core/toon';
import { fireLights } from './Firelight';
import { FLAP_GLSL, addOutline, windUniforms } from './Ink';
import { loadPropModel } from './PropModels';

/** Toon-shaded butterflies whose wings beat, each at its own phase. */
function wingMaterial(): THREE.MeshToonMaterial {
  const material = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toonRamp() });
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, windUniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${FLAP_GLSL}`)
      .replace(
        '#include <beginnormal_vertex>',
        `#include <beginnormal_vertex>
        float flapA = flapAngle(float(gl_InstanceID));
        float flapSide = sign(position.x);
        bool isWing = abs(position.x) > 0.006;
        if (isWing) objectNormal = flapTurn(objectNormal, flapSide, flapA);`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        if (isWing) transformed = flapTurn(transformed, flapSide, flapA);`,
      );
    fireLights(shader);
  };
  return material;
}

/**
 * Blue butterflies fluttering round flowering bushes, as in the film's jungle: each wanders in a
 * loose loop about its bush, rising and dipping, and faces the way it flies.
 */
export class Butterflies {
  readonly mesh: THREE.InstancedMesh;
  private readonly homes: THREE.Vector3[];
  private readonly matrix = new THREE.Matrix4();
  private readonly position = new THREE.Vector3();
  private readonly turn = new THREE.Quaternion();
  private readonly up = new THREE.Vector3(0, 1, 0);
  private readonly scale = new THREE.Vector3(1.6, 1.6, 1.6);

  private constructor(geometry: THREE.BufferGeometry, homes: [number, number, number][]) {
    this.homes = homes.map(([x, y, z]) => new THREE.Vector3(x, y, z));
    this.mesh = new THREE.InstancedMesh(geometry, wingMaterial(), this.homes.length);
    this.mesh.frustumCulled = false;
  }

  static async load(homes: [number, number, number][]): Promise<Butterflies> {
    const model = await loadPropModel('butterfly');
    return new Butterflies(model.parts[0].geometry, homes);
  }

  /** Adds the butterflies (and their outline) to a parent. */
  attach(parent: THREE.Object3D): void {
    parent.add(this.mesh);
    addOutline(this.mesh, 'flap').frustumCulled = false;
  }

  update(time: number): void {
    this.homes.forEach((home, i) => {
      const a = i * 1.7;
      const t = time * (0.55 + 0.1 * Math.sin(a));
      const x = home.x + 1.8 * Math.sin(t + a) + 0.6 * Math.sin(t * 2.3 + a * 2);
      const z = home.z + 1.8 * Math.sin(t * 0.8 + a * 1.3) + 0.6 * Math.cos(t * 1.9 + a);
      const y = home.y + 1.0 + 0.35 * Math.sin(t * 1.7 + a) + 0.12 * Math.sin(time * 6.0 + a);
      // Face along the way it is flying.
      const vx = 1.8 * Math.cos(t + a) + 1.38 * Math.cos(t * 2.3 + a * 2);
      const vz = 1.44 * Math.cos(t * 0.8 + a * 1.3) - 1.14 * Math.sin(t * 1.9 + a);
      this.turn.setFromAxisAngle(this.up, Math.atan2(-vx, -vz));
      this.matrix.compose(this.position.set(x, y, z), this.turn, this.scale);
      this.mesh.setMatrixAt(i, this.matrix);
    });
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
