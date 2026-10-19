import * as THREE from 'three';
import { loadGltf } from '../core/gltf';
import { sharedUniforms } from '../characters/CharacterMaterial';
import { sceneryRamp, toonRamp } from '../core/toon';
import { fireLights } from './Firelight';
import { PEN_GLSL, addOutline, inkUniforms } from './Ink';
import { poolUniform, type TerrainInfo } from './Island';
import { FILM, STONES, moonEdges, paintLeaves, paintStone, paintedRamp, puffShadow, type StoneKind } from './Look';

// The jungle waterfall's water: white, with pale grey-blue between its streaks, as in the film.
const COLORS = {
  water: '#F4FBFC',
  shade: '#BFDCE3',
  foam: '#FFFFFF',
};

/**
 * Toon-shaded stone with its painted colours, and the pen's waterline drawn where the rock
 * meets the sea or the waterfall's pool, as the ground draws it on the sand.
 */
function rockMaterial(info: TerrainInfo): THREE.MeshToonMaterial {
  const material = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toonRamp() });
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, inkUniforms, {
      uAmbient: sharedUniforms.uAmbient,
      uSea: { value: info.water },
      uPool: { value: poolUniform(info) },
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
      // In the film look the falling water is a soft white, its streaks showing, short of glowing.
      uBright: { value: FILM ? 0.66 : 1 },
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
      uniform float uBright;
      varying vec2 vUv;
      float hash1(float n) { return fract(sin(n * 127.1) * 43758.5453); }
      void main() {
        #ifdef FILM
        // A soft veil of fine streaks, each pouring at its own pace, thinning away at its sides
        // to show the rock, as the film paints it: white and glowing over the lip (v 0), greyer
        // as it falls, misting white where it lands.
        float columns = 26.0;
        float c = floor(vUv.x * columns);
        float across = fract(vUv.x * columns);
        float run = fract(vUv.y * (3.0 + 2.0 * hash1(c + 4.0)) - uTime * (0.9 + 0.6 * hash1(c)) + hash1(c + 9.0));
        float dash = smoothstep(0.0, 0.1, run) * (1.0 - smoothstep(0.3, 0.65, run));
        float line = 1.0 - smoothstep(0.05, 0.4, abs(across - 0.5 - 0.2 * (hash1(c + 2.0) - 0.5)));
        float veil = smoothstep(0.0, 0.35, vUv.x) * smoothstep(1.0, 0.65, vUv.x);
        float lip = smoothstep(0.12, 0.0, vUv.y);
        float white = max(lip, smoothstep(0.75, 1.0, vUv.y));
        vec3 col = mix(uShade, uWater, 0.4 + 0.3 * veil);
        col = mix(col, uFoam, 0.3 + 0.2 * veil + 0.35 * line * dash);
        col = mix(col, uFoam, white);
        float alpha = veil * clamp(0.3 + 0.4 * veil + 0.25 * line * dash + white, 0.0, 1.0);
        gl_FragColor = vec4(col * uAmbient * uBright * (1.0 + 0.6 * lip), alpha);
        #else
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
        gl_FragColor = vec4(col * uAmbient * uBright, 1.0);
        #endif
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
    fog: true,
    defines: FILM ? { FILM: '' } : {},
    transparent: FILM,
    depthWrite: !FILM,
  });
}

/**
 * The film look's mist where the waterfall lands: white, bluer underneath, its edges fading out so
 * it reads as spray rather than a solid.
 */
function mistMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
      uAmbient: sharedUniforms.uAmbient,
    },
    vertexShader: /* glsl */ `
      #include <common>
      #include <fog_pars_vertex>
      varying vec3 vNormalView;
      varying vec3 vToCamera;
      varying float vUp;
      void main() {
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        vNormalView = normalize(normalMatrix * normal);
        vToCamera = -mvPosition.xyz;
        vUp = normal.y;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      #include <common>
      #include <fog_pars_fragment>
      uniform vec3 uAmbient;
      varying vec3 vNormalView;
      varying vec3 vToCamera;
      varying float vUp;
      void main() {
        float facing = abs(dot(normalize(vNormalView), normalize(vToCamera)));
        vec3 col = mix(vec3(0.72, 0.86, 0.9), vec3(1.0), smoothstep(-0.4, 0.5, vUp));
        gl_FragColor = vec4(col * uAmbient, smoothstep(0.05, 0.9, facing) * 0.55);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
    fog: true,
    transparent: true,
    depthWrite: false,
  });
}

/**
 * The island's rock landmarks, built in Blender with the ground (art/blender/build_island.py):
 * limestone karst pillars and mesas crowned with jungle, the rocks behind the night beach, sea
 * spires round the lagoon and the sea cliffs; and in the middle of the island the jungle waterfall,
 * pouring off its wall of mossy rock into its pool, with its spray.
 */
export class Landmarks {
  readonly group = new THREE.Group();
  /** The waterfall's spray and its outline, which heave together. */
  private readonly spray: THREE.Object3D[] = [];

  private constructor(private readonly fall: THREE.ShaderMaterial) {}

  static async load(info: TerrainInfo): Promise<Landmarks> {
    const gltf = await loadGltf(info.landmarks);
    const landmarks = new Landmarks(waterfallMaterial());
    const meshes: THREE.Mesh[] = [];
    gltf.scene.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh);
    });
    // In the film look the stone is painted as the film paints it, without a line (see paintStone),
    // lit through the soft ramp, and casts and takes the sun's shadows: limestone in upright slabs,
    // the sea cliffs, the rocks behind the night beach and the forbidden cave's terraced outcrop (all
    // but bare of moss) in beds.
    const toonRocks = FILM ? null : rockMaterial(info);
    const painted = new Map<StoneKind, THREE.Material>();
    const rocksFor = (name: string): THREE.Material => {
      if (toonRocks) return toonRocks;
      const kind = name.startsWith('rocks_cliffs')
        ? STONES.bedded
        : name.startsWith('rocks_headland')
          ? STONES.layered
          : name.startsWith('rocks_cave')
            ? STONES.bare
            : name.startsWith('rocks_spires')
              ? STONES.spire
              : STONES.limestone;
      let material = painted.get(kind);
      if (!material) {
        const stone = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: paintedRamp() });
        stone.onBeforeCompile = (shader) => {
          paintStone(shader, kind);
          moonEdges(shader);
          fireLights(shader);
        };
        stone.customProgramCacheKey = () => 'stone';
        painted.set(kind, (material = stone));
      }
      return material;
    };
    const spray = FILM ? mistMaterial() : new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: sceneryRamp() });
    // The jungle on the rocks' tops, and the vines and moss hanging down them: in the film look
    // painted like the trees' leaves, the crowns in leaf clusters.
    let crowns: THREE.Material | null = toonRocks;
    let vines: THREE.Material | null = toonRocks;
    if (FILM) {
      const leaves = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: paintedRamp() });
      leaves.onBeforeCompile = (shader) => {
        paintLeaves(shader, 1.9);
        moonEdges(shader);
        fireLights(shader);
      };
      crowns = leaves;
      const hanging = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: paintedRamp() });
      hanging.onBeforeCompile = (shader) => {
        paintLeaves(shader);
        moonEdges(shader);
        fireLights(shader);
      };
      vines = hanging;
    }
    let crownShadow: THREE.MeshDepthMaterial | undefined;
    for (const mesh of meshes) {
      mesh.removeFromParent();
      // Nothing here is a leaf with veins to paint (see paintLeaves).
      const count = mesh.geometry.getAttribute('position').count;
      mesh.geometry.setAttribute('aLeaf', new THREE.BufferAttribute(new Float32Array(count * 2).fill(9), 2));
      const isSpray = mesh.name.startsWith('spray');
      const isFall = mesh.name.startsWith('waterfall');
      mesh.material = isFall
        ? landmarks.fall
        : isSpray
          ? spray
          : mesh.name.startsWith('crowns') && crowns
            ? crowns
            : mesh.name.startsWith('vines') && vines
              ? vines
              : rocksFor(mesh.name);
      landmarks.group.add(mesh);
      if (isSpray) landmarks.spray.push(mesh);
      if (FILM) {
        mesh.castShadow = mesh.receiveShadow = !isSpray && !isFall;
        // The sun comes through the gaps between the puffs of the jungle on the rocks' tops.
        if (mesh.name.startsWith('crowns')) mesh.customDepthMaterial = crownShadow ??= puffShadow(1.9);
        continue;
      }
      const hull = addOutline(mesh);
      if (isSpray) landmarks.spray.push(hull);
    }
    return landmarks;
  }

  update(time: number): void {
    this.fall.uniforms.uTime.value = time;
    const t = time * 5;
    // In the film look the spray is a wider cloud of mist.
    const k = FILM ? 2.1 : 1;
    for (const o of this.spray) o.scale.set(k * (1 + 0.05 * Math.sin(t)), k * (1 + 0.14 * Math.sin(t + 1.3)), k * (1 + 0.05 * Math.sin(t + 2.1)));
  }
}
