import * as THREE from 'three';
import { toonRamp } from '../core/toon';
import { FILM } from './Look';

/** How lit the island's lights are, 0 by day and 1 at night; the day's clock sets it. In the film
 * look they burn brighter than white, so they glow. */
export const glowUniforms = {
  uGlow: { value: 0 },
  uGlowColour: { value: new THREE.Color('#FFE08A') },
  uGlowBright: { value: FILM ? 1.7 : 1 },
};

/**
 * Toon-shaded vertex colours that light up warm at night, whatever the light: windows and
 * lanterns. By day they show their own colours.
 */
export function glowMaterial(): THREE.MeshToonMaterial {
  const material = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toonRamp() });
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, glowUniforms);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uGlow;\nuniform vec3 uGlowColour;\nuniform float uGlowBright;')
      .replace(
        '#include <opaque_fragment>',
        `#include <opaque_fragment>
        gl_FragColor.rgb = mix(gl_FragColor.rgb, mix(vColor.rgb, uGlowColour, 0.75) * uGlowBright, uGlow);`,
      );
  };
  return material;
}
