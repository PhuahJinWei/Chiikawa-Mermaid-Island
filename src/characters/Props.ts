import * as THREE from 'three';
import { toonRamp } from '../core/toon';
import { fireLights } from '../world/Firelight';
import { inkOutlineMaterialLit, outlineGeometry } from '../world/Ink';
import { FOG_FRAGMENT, sharedUniforms } from './CharacterMaterial';

/** The light a hand-held thing takes from whoever holds it (their uShade and uOpenAir, see
 * CharacterUniforms; Character gives it them): so it is lit as their hand is, in the trees' shade as in
 * the forbidden cave, never in a light they are not in. */
export interface HeldLight {
  uShade: THREE.IUniform<THREE.Color>;
  uOpenAir: THREE.IUniform<number>;
}

/** A hand-held rice ball from the Blender prop, outlined with the world's pen, lit as whoever holds it
 * is (userData.light, a HeldLight): in the open air by the island's lights and the trees' shade on them,
 * in the forbidden cave flat in its light, as they are. */
export function createOnigiri(geometry: THREE.BufferGeometry): THREE.Group {
  const light: HeldLight = { uShade: { value: new THREE.Color(1, 1, 1) }, uOpenAir: { value: 1 } };
  const material = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toonRamp() });
  material.onBeforeCompile = (shader) => {
    fireLights(shader);
    Object.assign(shader.uniforms, light, { uAmbient: sharedUniforms.uAmbient });
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uAmbient;\nuniform vec3 uShade;\nuniform float uOpenAir;')
      .replace(
        '#include <opaque_fragment>',
        '#include <opaque_fragment>\ngl_FragColor.rgb = mix(diffuseColor.rgb * uAmbient, gl_FragColor.rgb, uOpenAir) * uShade;',
      )
      .replace('#include <fog_fragment>', FOG_FRAGMENT);
  };
  const body = new THREE.Mesh(geometry, material);
  const ink = inkOutlineMaterialLit(
    { uAmbient: sharedUniforms.uAmbient },
    /* glsl */ `
      #include <common>
      #include <fog_pars_fragment>
      uniform vec3 uInk;
      uniform vec3 uAmbient;
      uniform vec3 uShade;
      uniform float uOpenAir;
      void main() {
        gl_FragColor = vec4(uInk * uAmbient * uShade, 1.0);
        #ifdef FILM_MASK
        gl_FragColor.a = 0.5;
        #endif
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        ${FOG_FRAGMENT}
      }`,
    true,
  );
  ink.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, light);
  };
  const hull = new THREE.Mesh(outlineGeometry(geometry), ink);
  const group = new THREE.Group();
  group.add(body, hull);
  group.userData.light = light;
  return group;
}
