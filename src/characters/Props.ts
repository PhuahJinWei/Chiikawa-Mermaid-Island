import * as THREE from 'three';
import { toonRamp } from '../core/toon';
import { fireLights } from '../world/Firelight';
import { inkOutlineMaterialLit, outlineGeometry } from '../world/Ink';
import { FOG_FRAGMENT, sharedUniforms } from './CharacterMaterial';
import { FILM, PEN_MARK } from '../world/Look';

/** The light a hand-held thing takes from whoever holds it (their uShade and uOpenAir, see
 * CharacterUniforms; Character gives it them): so it is lit as their hand is, in the trees' shade as in
 * the forbidden cave, never in a light they are not in. */
export interface HeldLight {
  uShade: THREE.IUniform<THREE.Color>;
  uOpenAir: THREE.IUniform<number>;
}

/** A hand-held thing from its Blender prop (Kurimanju's can, a thing one carries), outlined with the world's pen,
 * lit as whoever holds it is (userData.light, a HeldLight): in the open air by the island's lights and the
 * trees' shade on them, in the forbidden cave flat in its light, as they are. `mark`: in the film look,
 * marked as the cast are in the picture's alpha (see CharacterMaterial), so the finishing passes leave it as
 * drawn however near the camera it is: what you hold, seen out of your own eyes (see HandView). `map`: coloured
 * by that picture on its UVs (its vertex colours white: the book's cover). */
export function createHeld(
  geometry: THREE.BufferGeometry,
  { mark = false, map = null }: { mark?: boolean; map?: THREE.Texture | null } = {},
): THREE.Group {
  const light: HeldLight = { uShade: { value: new THREE.Color(1, 1, 1) }, uOpenAir: { value: 1 } };
  const group = new THREE.Group();
  group.add(...heldPart(geometry, light, { mark, map }));
  group.userData.light = light;
  return group;
}

/** A part of a held thing (see createHeld), lit with it (its `light`) and marked as it is, coloured by `map` if given:
 * its body and its pen (a book's halves open: see Items' ItemModels). */
export function heldPart(
  geometry: THREE.BufferGeometry,
  light: HeldLight,
  { mark = false, map = null }: { mark?: boolean; map?: THREE.Texture | null } = {},
): [THREE.Mesh, THREE.Mesh] {
  return [new THREE.Mesh(geometry, heldBody(light, mark, false, map)), new THREE.Mesh(outlineGeometry(geometry), heldInk(light, false))];
}

/** A held thing's halves open, if it is a book (see Items' ItemModels): its body shut and its pen, hidden while it is
 * open; its halves open, and the hinge its left half swings shut over its right about, and how far (radians); the box
 * it fills open, and its right half's (where it lies swung shut), in its own frame. */
export interface OpenBook {
  shut: THREE.Object3D[];
  open: THREE.Group;
  hinge: THREE.Object3D;
  swing: number;
  spread: THREE.Box3;
  half: THREE.Box3;
}

/** Shows a held thing open, if it is a book, `open` of the way (0 its left half swung shut over its right, 1 wide
 * open), or, null, shut, as it is held and lies. Anything not a book is left as it is. */
export function showOpen(thing: THREE.Object3D, open: number | null): void {
  const book = thing.userData.book as OpenBook | undefined;
  if (!book) return;
  const shown = open !== null;
  for (const o of book.shut) o.visible = !shown;
  book.open.visible = shown;
  if (shown) book.hinge.rotation.z = -(1 - THREE.MathUtils.clamp(open, 0, 1)) * book.swing;
}

/** The materials things lying about are drawn with, a kind's many at once (see Things): a held thing's body
 * and pen (see createHeld), each copy (instance) in a shade of its own, its instance colour, as the ground
 * where it lies is; in the open air (or, `openAir` false, in the forbidden cave, lit only as its shade says:
 * its own light there), never marked; coloured by `map` for a kind coloured by a picture. */
export function lyingMaterials(openAir = true, map: THREE.Texture | null = null): { body: THREE.MeshToonMaterial; ink: THREE.ShaderMaterial } {
  const light: HeldLight = { uShade: { value: new THREE.Color(1, 1, 1) }, uOpenAir: { value: openAir ? 1 : 0 } };
  return { body: heldBody(light, false, true, map), ink: heldInk(light, true) };
}

/** GLSL: the trees' shade on a held thing (HELD_SHADE): its holder's (uShade); for things lying about drawn at
 * once (LYING), each copy's own (vShade, its instance colour). */
const SHADE_PARS = /* glsl */ `
uniform vec3 uShade;
#ifdef LYING
flat varying vec3 vShade;
#define HELD_SHADE vShade
#else
#define HELD_SHADE uShade
#endif`;

/** A held thing's body (see createHeld); `lying`, things lying about's (see lyingMaterials); `map`, its picture. */
function heldBody(light: HeldLight, mark: boolean, lying: boolean, map: THREE.Texture | null = null): THREE.MeshToonMaterial {
  const material = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toonRamp(), map });
  if (FILM && mark) material.defines = { FILM_MASK: '' };
  if (lying) material.defines = { ...material.defines, LYING: '' };
  material.onBeforeCompile = (shader) => {
    fireLights(shader);
    Object.assign(shader.uniforms, light, { uAmbient: sharedUniforms.uAmbient });
    // Lying, each copy's shade is its instance colour, which three would tint its colour with before the
    // light: it is the shade, after the light, as for a held thing.
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\n#ifdef LYING\nflat varying vec3 vShade;\n#undef USE_INSTANCING_COLOR\n#endif')
      .replace('#include <color_vertex>', '#include <color_vertex>\n#ifdef LYING\nvShade = instanceColor;\n#endif');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nuniform vec3 uAmbient;\nuniform float uOpenAir;\n${SHADE_PARS}`)
      .replace(
        '#include <opaque_fragment>',
        '#include <opaque_fragment>\ngl_FragColor.rgb = mix(diffuseColor.rgb * uAmbient, gl_FragColor.rgb, uOpenAir) * HELD_SHADE;\n' +
          '#ifdef FILM_MASK\ngl_FragColor.a = 0.5;\n#endif',
      )
      .replace('#include <fog_fragment>', FOG_FRAGMENT);
  };
  return material;
}

/** A held thing's pen (see createHeld); `lying`, things lying about's (see lyingMaterials). */
function heldInk(light: HeldLight, lying: boolean): THREE.ShaderMaterial {
  const ink = inkOutlineMaterialLit(
    { uAmbient: sharedUniforms.uAmbient },
    /* glsl */ `
      #include <common>
      #include <fog_pars_fragment>
      uniform vec3 uInk;
      uniform vec3 uAmbient;
      uniform float uOpenAir;
      ${SHADE_PARS}
      void main() {
        gl_FragColor = vec4(uInk * uAmbient * HELD_SHADE, 1.0);
        #ifdef FILM_MASK
        gl_FragColor.a = ${PEN_MARK.toFixed(2)};
        #endif
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        ${FOG_FRAGMENT}
      }`,
    true,
  );
  if (lying) ink.defines.LYING = '';
  ink.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, light);
  };
  return ink;
}
