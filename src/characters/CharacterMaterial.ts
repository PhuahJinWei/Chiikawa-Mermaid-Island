import * as THREE from 'three';
import { MAX_PARTS, type OutfitInfo, type Rig, type SkirtPattern } from './Model';

/**
 * Uniforms every character shares: screen size and the day/night tint.
 * Characters are drawn in flat colour like the film, so there is no light direction.
 */
export const sharedUniforms = {
  uResolution: { value: new THREE.Vector2(1, 1) },
  uAmbient: { value: new THREE.Color(1, 1, 1) },
};

export interface CharacterUniforms {
  [name: string]: THREE.IUniform;
  uParts: THREE.IUniform<THREE.Matrix4[]>;
  uSquash: THREE.IUniform<number>;
  uLean: THREE.IUniform<THREE.Vector2>;
  uHeight: THREE.IUniform<number>;
  uOutlineWidth: THREE.IUniform<number>;
  uLineBias: THREE.IUniform<number>;
  uFace: THREE.IUniform<THREE.Texture>;
  uFaceOn: THREE.IUniform<number>;
  uColorOverride: THREE.IUniform<THREE.Vector4>;
}

const NO_TEXTURE = new THREE.Texture();

/** A grass skirt's fringe for the shader: hem height, tie height, stroke count, hem scallop. */
function skirtUniform(s: SkirtPattern | null | undefined): THREE.IUniform<THREE.Vector4> {
  return { value: new THREE.Vector4(s?.bottom ?? 0, s?.top ?? 1, s?.count ?? 0, s?.wave ?? 0) };
}

export function makeCharacterUniforms(
  rig: Rig,
  parts: THREE.Matrix4[],
  face: THREE.Texture,
  maskTexture: THREE.Texture | null = null,
): CharacterUniforms {
  const mask = rig.maskColor ?? null;
  return {
    ...sharedUniforms,
    uParts: { value: parts },
    uSquash: { value: 1 },
    uLean: { value: new THREE.Vector2() },
    uHeight: { value: rig.height },
    uOutlineWidth: { value: 3 },
    uLineBias: { value: 0.05 },
    uLineColor: { value: new THREE.Color(rig.outline) },
    uFace: { value: face },
    uFaceOn: { value: 1 },
    uColorOverride: { value: new THREE.Vector4(1, 1, 1, 0) },
    uMaskOn: { value: mask ? 1 : 0 },
    uMaskColor: { value: new THREE.Color(mask ?? '#ffffff') },
    uMaskTex: { value: maskTexture ?? NO_TEXTURE },
    uMaskTexOn: { value: maskTexture ? 1 : 0 },
    uSkirt: skirtUniform(rig.patterns?.skirt),
  };
}

/**
 * Uniforms for an outfit worn by a character. Every deformation uniform is the wearer's
 * own object, so the outfit squashes, leans and sways with them; only the pattern data
 * (the grass skirt's fringe) is the outfit's.
 */
export function makeOutfitUniforms(wearer: CharacterUniforms, info: OutfitInfo): CharacterUniforms {
  return {
    ...wearer,
    uFaceOn: { value: 0 },
    uMaskOn: { value: 0 },
    uSkirt: skirtUniform(info.skirt),
  };
}

const VERT = /* glsl */ `
#include <common>
#include <fog_pars_vertex>

attribute vec4 aColor;
attribute float aPart0;
attribute float aPart1;
attribute float aWeight;
attribute float aOutline;
attribute float aLift;
attribute float aPaint;
attribute float aMask;
attribute vec2 aMaskUv;
#ifdef BILLBOARD
attribute vec3 aCenter;
attribute float aBill;
const float CROWN_ARCH = 0.15; // how far the crown's ends dip, in ring radii
#endif

uniform mat4 uParts[MAX_PARTS];
uniform float uSquash;
uniform vec2 uLean;
uniform float uHeight;
uniform float uOutlineWidth;
uniform float uLineBias;
uniform vec2 uResolution;

varying vec3 vColor;
varying vec2 vUv;
varying vec3 vRest;
varying float vPaint;
varying float vMask;
varying vec2 vMaskUv;
varying float vFacing;

// Soft body: volume-keeping squash and stretch, plus a bend that grows with height.
vec3 softBody(vec3 p) {
  float s = max(uSquash, 0.3);
  float k = inversesqrt(s);
  float h = max(p.y, 0.0) / uHeight;
  p.y *= s;
  p.xz *= k;
  p.xz += uLean * (h * h) * uHeight;
  return p;
}

void main() {
  // Two-bone blend: each vertex follows up to two parts (head + ear, ear + ear tip...).
  mat4 m = uParts[int(aPart0 + 0.5)] * (1.0 - aWeight) + uParts[int(aPart1 + 0.5)] * aWeight;
  vec3 p = softBody((m * vec4(position, 1.0)).xyz);
  vec3 n = normalize(mat3(m) * normal);
  float s = max(uSquash, 0.3);
  float k = inversesqrt(s);
  n = normalize(vec3(n.x / k, n.y / s, n.z / k));

  vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
  vec3 nV = normalize(normalMatrix * n);
#ifdef BILLBOARD
  if (aBill > 0.0) {
    // Crown flowers face the camera like the drawings: only their centre follows the body.
    // They were modelled facing the front, so their offsets map straight onto the view axes.
    // Pulling them toward the camera along the view ray keeps them where they are on screen
    // but draws them over the curve of the head.
    float scale = length(modelViewMatrix[0].xyz);
    vec4 c = modelViewMatrix * vec4(softBody((m * vec4(aCenter, 1.0)).xyz), 1.0);
    // The film draws a crown arching over the head from whichever side it is seen: flowers
    // toward the edges of the head, as the camera sees it, sit lower.
    vec4 axis = modelViewMatrix * vec4(softBody((m * vec4(0.0, aCenter.y, 0.0, 1.0)).xyz), 1.0);
    float ring = length(aCenter.xz) * scale;
    float side = (c.x - axis.x) / max(ring, 1e-4);
    c.y -= CROWN_ARCH * ring * side * side;
    c.xyz += normalize(-c.xyz) * (aBill * scale);
    mvPosition = vec4(c.xyz + (position - aCenter) * scale, 1.0);
    nV = normal;
  }
#endif
  // 1 where the surface faces the camera, 0 where it turns away at the silhouette.
  vFacing = abs(dot(nV, normalize(-mvPosition.xyz)));
#ifdef OUTLINE
  // Inverted hull. Solid parts (arms, legs) pull their hull toward the camera so their
  // outline shows where they overlap the body, like the inner lines of the drawings.
  mvPosition.xyz += normalize(-mvPosition.xyz) * (uLineBias * aLift);
  vec4 clip = projectionMatrix * mvPosition;
  vec2 dir = (projectionMatrix * vec4(nV, 0.0)).xy * uResolution;
  float len = length(dir);
  dir = len > 1e-5 ? dir / len : vec2(0.0);
  float push = uOutlineWidth * aOutline;
#ifdef BILLBOARD
  // A crown flower's face stays put and only its back rim is pushed out to make the outline.
  // Pushed out, the face's fan of triangles folds over at the notches between the petals
  // and shows through as hairlines.
  if (aBill > 0.0) push *= step(nV.z, 0.0);
#endif
  clip.xy += dir * push * 2.0 / uResolution * clip.w;
  gl_Position = clip;
#else
  gl_Position = projectionMatrix * mvPosition;
#endif
  vColor = aColor.rgb;
  vUv = uv;
  vRest = position;
  vPaint = aPaint;
  vMask = aMask;
  vMaskUv = aMaskUv;
  #include <fog_vertex>
}
`;

const FRAG = /* glsl */ `
#include <common>
#include <fog_pars_fragment>

uniform vec3 uAmbient;
uniform vec3 uLineColor;
uniform float uOutlineWidth;
uniform sampler2D uFace;
uniform float uFaceOn;
uniform vec4 uColorOverride;
uniform float uMaskOn;
uniform vec3 uMaskColor;
uniform sampler2D uMaskTex;
uniform float uMaskTexOn;
uniform vec4 uSkirt;

varying vec3 vColor;
varying vec2 vUv;
varying vec3 vRest;
varying float vPaint;
varying float vMask;
varying vec2 vMaskUv;
varying float vFacing;

// 1 inside a line of the given half-width in pixels, anti-aliased by one pixel.
float lineMask(float dist, float halfPx, float fw) {
  return 1.0 - smoothstep(halfPx * fw, (halfPx + 1.0) * fw, dist);
}

float hash1(float n) {
  return fract(sin(n * 127.1) * 43758.5453);
}

// Bold strokes with rounded ends rising from a hem, like the fringe lines on the grass skirts.
// coord runs once around the body; height01 is 0 at the hem; strokes begin at height01 = start.
float fringeStrokes(float coord, float count, float height01, float halfPx, float start) {
  float c = coord * count;
  float cell = floor(c);
  float top = mix(0.42, 0.64, hash1(cell + 3.7));
  // Distance in pixels from the stroke's centre line, measured round its ends.
  float dx = (fract(c) - 0.5) / max(fwidth(c), 1e-4);
  float dy = max(max(start - height01, height01 - top), 0.0) / max(fwidth(height01), 1e-4);
  float r = halfPx; // the same pen as every outline
  return 1.0 - smoothstep(r, r + 1.0, length(vec2(dx, dy)));
}

void main() {
  vec3 col = mix(vColor, uColorOverride.rgb, uColorOverride.a);
  int paint = int(vPaint + 0.5);
  float halfPx = uOutlineWidth * 0.5;
  float az = atan(vRest.x, vRest.z);
  float around = az / 6.2831853 + 0.5;

  // Second colour (Hachiware's cap, inner ears): crisp at the 0.5 contour, outlined like the film.
  if (uMaskOn > 0.5) {
    // With a mask texture, the per-vertex value only says where it applies.
    float m = uMaskTexOn > 0.5 ? texture2D(uMaskTex, vMaskUv).r * step(0.5, vMask) : vMask;
    float f = m - 0.5;
    float fw = max(fwidth(m), 1e-4);
    vec3 maskCol = mix(uMaskColor, uColorOverride.rgb, uColorOverride.a);
    col = mix(col, maskCol, smoothstep(-fw, fw, f));
    col = mix(col, uLineColor, lineMask(abs(f), halfPx, fw));
  }

  if (paint == 1) {
    if (uFaceOn > 0.5 && vRest.z > 0.0 && vUv.x >= 0.0 && vUv.x <= 1.0 && vUv.y >= 0.0 && vUv.y <= 1.0) {
      vec4 face = texture2D(uFace, vUv);
      col = col * (1.0 - face.a) + face.rgb;
    }
  } else if (paint == 2) {
    // Leaf veins as the film draws them: a midrib with side veins rising from it at about 45
    // degrees, in the world's pen. A leaf too small on screen to hold them loses the side
    // veins, then the midrib, so it stays a leaf instead of a brown blot.
    float x = abs(vUv.x);
    float fwx = max(fwidth(x), 1e-4);
    float pens = 1.0 / (fwx * max(halfPx, 0.5)); // the leaf's width, in pen widths
    float mid = lineMask(x, halfPx, fwx) * step(0.08, vUv.y) * step(vUv.y, 0.9) * smoothstep(2.5, 3.5, pens);
    float c = vUv.y * 3.2 - x;
    float d = abs(fract(c) - 0.5);
    float fwc = max(fwidth(c), 1e-4);
    float side = lineMask(d, halfPx, fwc) * step(0.2, vUv.y) * step(vUv.y, 0.88) * step(x, 0.6)
      * smoothstep(4.5, 6.0, pens);
    col = mix(col, uLineColor, max(mid, side));
  } else if (paint == 3) {
    float hem = uSkirt.x + uSkirt.w * (0.5 + 0.5 * cos(uSkirt.z * az));
    float hf = (vRest.y - hem) / max(uSkirt.y - hem, 1e-3);
    float fwY = max(fwidth(vRest.y), 1e-5);
    float topLine = lineMask(uSkirt.y - vRest.y, halfPx * 2.0, fwY);
    // No line along the hem: as in the film, the grass simply ends there, and the strokes
    // start a little above it. Where the skirt turns away at its sides the strokes would
    // crowd into a heavy band, so they thin out and leave the outline as thick as
    // everyone else's.
    float edge = smoothstep(0.05, 0.3, vFacing);
    float strokes = fringeStrokes(around, uSkirt.z, hf, halfPx * edge, 0.1) * step(0.05, vFacing);
    col = mix(col, uLineColor, max(topLine, strokes));
  }

  gl_FragColor = vec4(col * uAmbient, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}
`;

const OUTLINE_FRAG = /* glsl */ `
#include <common>
#include <fog_pars_fragment>
uniform vec3 uLineColor;
uniform vec3 uAmbient;
void main() {
  gl_FragColor = vec4(uLineColor * uAmbient, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}
`;

/** billboard: the geometry carries aCenter/aBill, and those pieces face the camera. */
export function createCharacterMaterials(
  uniforms: CharacterUniforms,
  options: { billboard?: boolean } = {},
): {
  body: THREE.ShaderMaterial;
  outline: THREE.ShaderMaterial;
} {
  const extra: Record<string, number> = options.billboard ? { BILLBOARD: 1 } : {};
  const body = new THREE.ShaderMaterial({
    uniforms: { ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog), ...uniforms },
    vertexShader: VERT,
    fragmentShader: FRAG,
    defines: { MAX_PARTS, ...extra },
    fog: true,
  });
  const outline = new THREE.ShaderMaterial({
    uniforms: { ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog), ...uniforms },
    vertexShader: VERT,
    fragmentShader: OUTLINE_FRAG,
    defines: { MAX_PARTS, OUTLINE: 1, ...extra },
    side: THREE.BackSide,
    fog: true,
  });
  return { body, outline };
}
