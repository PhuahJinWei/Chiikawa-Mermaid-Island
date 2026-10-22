import * as THREE from 'three';
import { toonRamp } from '../core/toon';
import { fireLights } from '../world/Firelight';
import { inkOutlineMaterialLit, outlineGeometry } from '../world/Ink';
import { FOG_FRAGMENT, sharedUniforms } from './CharacterMaterial';
import { FILM } from '../world/Look';

/** The light a hand-held thing takes from whoever holds it (their uShade and uOpenAir, see
 * CharacterUniforms; Character gives it them): so it is lit as their hand is, in the trees' shade as in
 * the forbidden cave, never in a light they are not in. */
export interface HeldLight {
  uShade: THREE.IUniform<THREE.Color>;
  uOpenAir: THREE.IUniform<number>;
}

/** A hand-held thing from its Blender prop (the rice ball, Kurimanju's can), outlined with the world's pen,
 * lit as whoever holds it is (userData.light, a HeldLight): in the open air by the island's lights and the
 * trees' shade on them, in the forbidden cave flat in its light, as they are. `mark`: in the film look,
 * marked as the cast are in the picture's alpha (see CharacterMaterial), so the finishing passes leave it as
 * drawn however near the camera it is: what you hold, seen out of your own eyes (see HandView). */
export function createHeld(geometry: THREE.BufferGeometry, { mark = false }: { mark?: boolean } = {}): THREE.Group {
  const light: HeldLight = { uShade: { value: new THREE.Color(1, 1, 1) }, uOpenAir: { value: 1 } };
  const material = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toonRamp() });
  if (FILM && mark) material.defines = { FILM_MASK: '' };
  material.onBeforeCompile = (shader) => {
    fireLights(shader);
    Object.assign(shader.uniforms, light, { uAmbient: sharedUniforms.uAmbient });
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uAmbient;\nuniform vec3 uShade;\nuniform float uOpenAir;')
      .replace(
        '#include <opaque_fragment>',
        '#include <opaque_fragment>\ngl_FragColor.rgb = mix(diffuseColor.rgb * uAmbient, gl_FragColor.rgb, uOpenAir) * uShade;\n' +
          '#ifdef FILM_MASK\ngl_FragColor.a = 0.5;\n#endif',
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
