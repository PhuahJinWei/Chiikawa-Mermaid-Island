import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { sharedUniforms } from '../characters/CharacterMaterial';
import { toonRamp } from '../core/toon';
import { PEN_GLSL, addOutline, inkUniforms } from './Ink';
import type { TerrainInfo } from './Island';

const COLORS = {
  water: '#A6E8F2',
  shade: '#62C3D8',
  foam: '#FFFFFF',
};

/**
 * Toon-shaded stone with its painted colours, and the pen's waterline drawn where the rock
 * meets the sea or the pool, as the ground draws it on the sand.
 */
function rockMaterial(info: TerrainInfo): THREE.MeshToonMaterial {
  const material = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toonRamp() });
  const { centre, radius, level } = info.pool;
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, inkUniforms, {
      uAmbient: sharedUniforms.uAmbient,
      uSea: { value: info.water },
      uPool: { value: new THREE.Vector4(centre[0], centre[1], radius + 1, level) },
    });
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vRockWorld;\nvarying float vRockDepth;')
      .replace(
        '#include <project_vertex>',
        '#include <project_vertex>\nvRockWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvRockDepth = -mvPosition.z;',
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        ${PEN_GLSL}
        uniform vec3 uInk;
        uniform vec3 uAmbient;
        uniform float uSea;
        uniform vec4 uPool;
        varying vec3 vRockWorld;
        varying float vRockDepth;`,
      )
      .replace(
        '#include <opaque_fragment>',
        `#include <opaque_fragment>
        {
          float level = distance(vRockWorld.xz, uPool.xy) < uPool.z ? uPool.w : uSea;
          float above = (vRockWorld.y - level) / max(fwidth(vRockWorld.y), 1e-5);
          float pen = penAt(vRockDepth);
          gl_FragColor.rgb = mix(gl_FragColor.rgb, uInk * uAmbient,
            (1.0 - smoothstep(pen - 0.5, pen + 0.5, above)) * step(-0.5, above));
        }`,
      );
  };
  return material;
}

/** Water pouring down in streaks, white where it spills over the lip and where it lands. */
function waterfallMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
      uTime: { value: 0 },
      uAmbient: sharedUniforms.uAmbient,
      uWater: { value: new THREE.Color(COLORS.water) },
      uShade: { value: new THREE.Color(COLORS.shade) },
      uFoam: { value: new THREE.Color(COLORS.foam) },
    },
    vertexShader: /* glsl */ `
      #include <common>
      #include <fog_pars_vertex>
      varying vec2 vUv;
      void main() {
        vUv = uv;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      #include <common>
      #include <fog_pars_fragment>
      uniform float uTime;
      uniform vec3 uAmbient;
      uniform vec3 uWater;
      uniform vec3 uShade;
      uniform vec3 uFoam;
      varying vec2 vUv;
      float hash1(float n) { return fract(sin(n * 127.1) * 43758.5453); }
      void main() {
        // Columns of water side by side, each pouring at its own pace in white dashes.
        float columns = 7.0;
        float c = floor(vUv.x * columns);
        float across = fract(vUv.x * columns);
        float run = fract(vUv.y * (2.0 + hash1(c + 4.0)) - uTime * (0.8 + 0.5 * hash1(c)) + hash1(c + 9.0));
        float dash = smoothstep(0.0, 0.06, run) * (1.0 - smoothstep(0.45, 0.6, run));
        float middle = 1.0 - smoothstep(0.18, 0.42, abs(across - 0.5));
        vec3 col = mix(uShade, uWater, 0.35 + 0.65 * middle);
        col = mix(col, uFoam, dash * middle * 0.85);
        col = mix(col, uFoam, max(smoothstep(0.1, 0.0, vUv.y), smoothstep(0.82, 1.0, vUv.y) * 0.9));
        gl_FragColor = vec4(col * uAmbient, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
    fog: true,
  });
}

/**
 * The island's rock landmarks, built in Blender with the ground (art/blender/build_island.py):
 * limestone karst pillars crowned with jungle, the wall the waterfall pours from, the headland with
 * the cave mouth at its foot, and sea spires round the lagoon.
 */
export class Landmarks {
  readonly group = new THREE.Group();
  /** The waterfall's spray and its outline, which heave together. */
  private readonly spray: THREE.Object3D[] = [];

  private constructor(private readonly fall: THREE.ShaderMaterial) {}

  static async load(info: TerrainInfo): Promise<Landmarks> {
    const gltf = await new GLTFLoader().loadAsync(info.landmarks);
    const landmarks = new Landmarks(waterfallMaterial());
    const meshes: THREE.Mesh[] = [];
    gltf.scene.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh);
    });
    const rocks = rockMaterial(info);
    const spray = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toonRamp() });
    for (const mesh of meshes) {
      mesh.removeFromParent();
      const isSpray = mesh.name.startsWith('spray');
      mesh.material = mesh.name.startsWith('waterfall') ? landmarks.fall : isSpray ? spray : rocks;
      landmarks.group.add(mesh);
      const hull = addOutline(mesh);
      if (isSpray) landmarks.spray.push(mesh, hull);
    }
    return landmarks;
  }

  update(time: number): void {
    this.fall.uniforms.uTime.value = time;
    const t = time * 5;
    for (const o of this.spray) o.scale.set(1 + 0.05 * Math.sin(t), 1 + 0.14 * Math.sin(t + 1.3), 1 + 0.05 * Math.sin(t + 2.1));
  }
}
