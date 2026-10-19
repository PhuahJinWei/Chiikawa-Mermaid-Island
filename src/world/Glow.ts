import * as THREE from 'three';
import { toonRamp } from '../core/toon';
import { fireLights } from './Firelight';
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
    fireLights(shader);
  };
  return material;
}

/**
 * A house's window pane: within `clear` metres of the camera it is clear, so the room behind shows,
 * lit by its own lantern; beyond `lit` it is a pane lit as the windows are (`bright` times white),
 * standing in for the lit room. Between, it fades through an ordered dither, each point drawn or not,
 * so the picture's alpha (the characters' mark in the film look) stays whole.
 */
export function paneMaterial(clear: number, lit: number, bright: number): THREE.MeshToonMaterial {
  const material = glowMaterial();
  const glow = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    glow(shader, renderer);
    shader.fragmentShader = shader.fragmentShader
      .replace('* uGlowBright, uGlow)', `* ${bright.toFixed(2)}, uGlow)`)
      .replace(
        'void main() {',
        `float paneDither(vec2 a) {
        a = floor(a);
        return fract(dot(a, vec2(0.5, a.y * 0.75)));
      }
      void main() {
        vec2 cell = gl_FragCoord.xy;
        float threshold = paneDither(0.5 * cell) * 0.25 + paneDither(cell);
        if (smoothstep(${clear.toFixed(1)}, ${lit.toFixed(1)}, length(vViewPosition)) <= threshold) discard;`,
      );
  };
  material.customProgramCacheKey = () => `pane:${clear}:${lit}:${bright}`;
  return material;
}
