import * as THREE from 'three';
import { CHARACTER_LIGHTS } from '../world/Firelight';
import { FILM, FIRE_MARK, PEN_MARK } from '../world/Look';
import { MAX_PARTS, PART, type OutfitInfo, type Rig, type SkirtPattern } from './Model';

/**
 * Uniforms every character shares: screen size and the day/night tint.
 * Characters are drawn in flat colour like the film, so neither the sun nor the moon has a
 * direction on them; only the firelight after dark does (see uFire).
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
  /** The trees' shade on the character (white in the sun), which their outfit shares. */
  uShade: THREE.IUniform<THREE.Color>;
  /** The firelight on the character after dark, strongest first: each light's way from them (x, y,
   * z) and how much it warms them (w); see Firelight.lightsAt. Shared with their outfit. */
  uFire: THREE.IUniform<THREE.Vector4[]>;
  /** How much a lit room they stand in warms them all round, its light coming back off the walls. */
  uFireFill: THREE.IUniform<number>;
  /** How much of the open air's light reaches them, 1 or 0: the sky's in the air (the scene's fog) and
   * the island's lights; none in the forbidden cave, lit by its own. Shared with their outfit. */
  uOpenAir: THREE.IUniform<number>;
  /** Bent over to look into the water (see Character.setBow): turned forward about their own x axis
   * (the sine and cosine of how far) and carried up and forward (z, w), in their own frame; and before
   * that their head bowed forward about its neck (the sine and cosine of how far, and where the neck is,
   * y and z). Shared with their outfit. */
  uBow: THREE.IUniform<THREE.Vector4>;
  uBowHead: THREE.IUniform<THREE.Vector4>;
  /** What they mark themselves with in the film look's picture (its alpha): a half, as every one of the
   * cast; 2, beyond anything else, for the one whose eyes the camera looks out of, so the water knows
   * their own mirror image from the rest (see Character.setUnseen). Shared with their outfit. */
  uMark: THREE.IUniform<number>;
  /** Which of their parts are their head, as bits (the head and what hangs from it: ears, sprout, crown),
   * which bow with it (uBowHead). */
  uHeadParts: THREE.IUniform<number>;
  /** How far a grass skirt's hem spreads out round them on the ground as they sit (0 standing): its lower part
   * pushed out from their middle, the more the further down it is, its waist staying snug (see VERT). Shared
   * with their outfit. */
  uSkirtFlare: THREE.IUniform<number>;
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
  const fur = rig.fur ?? null;
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
    uShade: { value: new THREE.Color(1, 1, 1) },
    uFire: { value: Array.from({ length: CHARACTER_LIGHTS }, () => new THREE.Vector4()) },
    uFireFill: { value: 0 },
    uOpenAir: { value: 1 },
    uBow: { value: new THREE.Vector4(0, 1, 0, 0) },
    uMark: { value: 0.5 },
    uBowHead: { value: new THREE.Vector4(0, 1, 0, 0) },
    uHeadParts: { value: 0 },
    uSkirtFlare: { value: 0 },
    uMaskOn: { value: mask ? 1 : 0 },
    // Whether the pen draws along the second colour's edge (1), or it only changes colour there (0, Furuhonya's cap).
    uMaskLine: { value: rig.maskLine === false ? 0 : 1 },
    uMaskColor: { value: new THREE.Color(mask ?? '#ffffff') },
    uMaskTex: { value: maskTexture ?? NO_TEXTURE },
    uMaskTexOn: { value: maskTexture ? 1 : 0 },
    uSkirt: skirtUniform(rig.patterns?.skirt),
    // Fur's strokes (see FUR): how many round, their length, their gap from the edge, their most lean; the
    // middles of the head and of the body they are laid round, with their radii.
    uFur: { value: new THREE.Vector4(fur?.count ?? 0, fur?.length ?? 0, fur?.gap ?? 0, fur?.slant ?? 0) },
    uFurHead: { value: new THREE.Vector4(...(fur?.head ?? [0, 0, 0, 1])) },
    uFurBody: { value: new THREE.Vector4(...(fur?.body ?? [0, 0, 0, 1])) },
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
uniform vec4 uBow;
uniform vec4 uSkirt;
uniform float uSkirtFlare;
// How far a spread skirt's hull goes back behind it (metres for each unit of uSkirtFlare): its inside lies within
// millimetres under its top. Its inside's hull goes this far back (metres) out of sight as it starts to spread.
const float SKIRT_HULL_BACK = 0.06;
const float SKIRT_INSIDE_BACK = 1.0;
uniform int uHeadParts;
uniform vec4 uBowHead;
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
varying vec3 vFireNormal;
#ifdef FUR
uniform vec4 uFurHead;
uniform vec4 uFurBody;
varying vec4 vFurClip;
varying vec4 vFurCentre;
varying vec2 vFurScale;
varying vec3 vFurNormal;
varying vec3 vFurView;
varying float vFur;
#endif

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

// Bent over to look into the water (see Character.setBow): turned forward about their own x axis, the
// face down, and carried up and forward. Standing as they are, nothing changes.
vec3 bowed(vec3 p) {
  return vec3(p.x, p.y * uBow.y - p.z * uBow.x + uBow.z, p.y * uBow.x + p.z * uBow.y + uBow.w);
}
vec3 bowedNormal(vec3 n) {
  return vec3(n.x, n.y * uBow.y - n.z * uBow.x, n.y * uBow.x + n.z * uBow.y);
}
// Before that, their head bowed forward about its neck, as much as a point is their head (share).
vec3 headBowed(vec3 p, float share) {
  if (uBowHead.x == 0.0) return p;
  vec2 q = p.yz - uBowHead.zw;
  return mix(p, vec3(p.x, q.x * uBowHead.y - q.y * uBowHead.x + uBowHead.z, q.x * uBowHead.x + q.y * uBowHead.y + uBowHead.w), share);
}
vec3 headBowedNormal(vec3 n, float share) {
  if (uBowHead.x == 0.0) return n;
  return normalize(mix(n, vec3(n.x, n.y * uBowHead.y - n.z * uBowHead.x, n.y * uBowHead.x + n.z * uBowHead.y), share));
}

void main() {
  // Sitting, a grass skirt spreads out on the ground round them as the film's do (the bonfire's, [anime]
  // chiikawa 5), rather than only growing shorter: its lower part pushed out from their middle, the more the
  // further down it is (uSkirt: its tie, y, and its hem, x), so the waist stays snug and the hem pools wide. As
  // much as the point is on the skirt (an islander's own skirt grows out of the body).
  vec3 rest = position;
  vec3 restNormal = normal;
  float onSkirt = (abs(aPart0 - float(SKIRT_PART)) < 0.5 ? 1.0 - aWeight : 0.0)
    + (abs(aPart1 - float(SKIRT_PART)) < 0.5 ? aWeight : 0.0);
  bool spread = uSkirtFlare > 0.0 && onSkirt > 0.0;
  if (spread) {
    float span = max(uSkirt.y - uSkirt.x, 1e-3);
    float down = clamp((uSkirt.y - rest.y) / span, 0.0, 1.0);
    float flare = uSkirtFlare * onSkirt;
    float grow = 1.0 + flare * down * down;
    // Its normal bent with it (the spread's inverse transpose), the outside's turning up, the inside's down: left
    // upright, the outline was pushed up the screen onto the skirt's further parts and drew over them as a dark band.
    float slope = rest.y < uSkirt.y && rest.y > uSkirt.x ? -2.0 * flare * down / span : 0.0;
    restNormal = normalize(vec3(normal.x / grow, normal.y - slope * dot(rest.xz, normal.xz) / grow, normal.z / grow));
    rest.xz *= grow;
  }
  // Two-bone blend: each vertex follows up to two parts (head + ear, ear + ear tip...).
  mat4 m = uParts[int(aPart0 + 0.5)] * (1.0 - aWeight) + uParts[int(aPart1 + 0.5)] * aWeight;
  // How much of this point is their head (see uHeadParts), to bow with it.
  float headShare = float((uHeadParts >> int(aPart0 + 0.5)) & 1) * (1.0 - aWeight) + float((uHeadParts >> int(aPart1 + 0.5)) & 1) * aWeight;
  vec3 p = bowed(headBowed(softBody((m * vec4(rest, 1.0)).xyz), headShare));
  // A spread skirt is also shortened (Character's skirtSeat): its normals by the inverse transpose there too.
  vec3 n = spread ? normalize(transpose(inverse(mat3(m))) * restNormal) : normalize(mat3(m) * normal);
  float s = max(uSquash, 0.3);
  float k = inversesqrt(s);
  n = bowedNormal(headBowedNormal(normalize(vec3(n.x / k, n.y / s, n.z / k)), headShare));

  vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
  vec3 nV = normalize(normalMatrix * n);
#ifdef BILLBOARD
  if (aBill > 0.0) {
    // Crown flowers face the camera like the drawings: only their centre follows the body.
    // They were modelled facing the front, so their offsets map straight onto the view axes.
    // Pulling them toward the camera along the view ray keeps them where they are on screen
    // but draws them over the curve of the head.
    float scale = length(modelViewMatrix[0].xyz);
    vec4 c = modelViewMatrix * vec4(bowed(headBowed(softBody((m * vec4(aCenter, 1.0)).xyz), headShare)), 1.0);
    // The film draws a crown arching over the head from whichever side it is seen: flowers
    // toward the edges of the head, as the camera sees it, sit lower.
    vec4 axis = modelViewMatrix * vec4(bowed(headBowed(softBody((m * vec4(0.0, aCenter.y, 0.0, 1.0)).xyz), headShare)), 1.0);
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
  vFireNormal = transpose(mat3(viewMatrix)) * nV;
#ifdef FUR
  // Fur where the pen draws no line (the head and body, aOutline 0; see furStrokes): its strokes are laid round
  // the middle of the head, or of the body, as the part is posed now; with the pixels a metre is at each.
  bool onHead = aPart0 > float(HEAD_PART) - 0.5;
  vFur = aOutline < 0.01 ? (onHead ? 2.0 : 1.0) : 0.0;
  vec4 furPart = onHead ? uFurHead : uFurBody;
  vec4 furAt = modelViewMatrix * vec4(bowed(headBowed(softBody((m * vec4(furPart.xyz, 1.0)).xyz), onHead ? 1.0 : 0.0)), 1.0);
  vec4 furHead = modelViewMatrix * vec4(bowed(headBowed(softBody((uParts[HEAD_PART] * vec4(uFurHead.xyz, 1.0)).xyz), 1.0)), 1.0);
  vFurCentre = projectionMatrix * furAt;
  float perMetre = projectionMatrix[1][1] * 0.5 * uResolution.y * length(modelViewMatrix[0].xyz);
  vFurScale = vec2(furPart.w / max(-furAt.z, 1e-3), uFurHead.w / max(-furHead.z, 1e-3)) * perMetre;
  vFurNormal = nV;
  vFurView = mvPosition.xyz;
#endif
#ifdef OUTLINE
  // Inverted hull. Solid parts (arms, legs) pull their hull toward the camera so their
  // outline shows where they overlap the body, like the inner lines of the drawings.
  mvPosition.xyz += normalize(-mvPosition.xyz) * (uLineBias * aLift);
  // A skirt spread out seated is nearly flat, its inside squashed to within millimetres of its top: its hull goes
  // a little back behind it, as far as it is spread; its inside's (facing in, toward their middle), which only
  // ever drew over the skirt and the gap round their waist as a dark band, far back out of sight.
  bool inside = dot(normal.xz, position.xz) < 0.0;
  float back = inside ? SKIRT_INSIDE_BACK * min(1.0, uSkirtFlare * 8.0) : SKIRT_HULL_BACK * uSkirtFlare;
  mvPosition.xyz -= normalize(-mvPosition.xyz) * (back * onSkirt);
  vec4 clip = projectionMatrix * mvPosition;
  vec2 dir = (projectionMatrix * vec4(nV, 0.0)).xy * uResolution;
  float len = length(dir);
  dir = len > 1e-5 ? dir / len : vec2(0.0);
  // Surfaces facing the camera stay put, as the world's pen leaves them (Ink.ts): pushed out the pen's
  // whole width whichever way their normals lean, their triangles fold over where those turn (across a
  // flat face such as Shisa's petals and ears, at a crease) and show through as hairlines. The
  // silhouette, where the surface turns away, carries the line.
  float facing = dot(nV, normalize(-mvPosition.xyz));
  float push = uOutlineWidth * aOutline * (1.0 - smoothstep(0.3, 0.6, facing));
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
#ifdef FUR
  vFurClip = gl_Position;
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

/**
 * GLSL: the firelight on a point of a character (see Firelight.lightsAt), as the film paints its
 * firelit cast (`chiikawa 6`): each light warms the side turned toward it, through a soft edge, a
 * warm cream at full strength against the night (FIRE_WARM); the side turned away keeps the night's
 * blue, the darker the stronger the fire round them, as the film exposes for its fire (its far side
 * about half as bright as the near), with a little of the fire's warmth coming back off the ground.
 * Lights on two sides light both; a lit room they stand in warms them all round (uFireFill). Far from
 * any fire, nothing changes. How much the fire lights the point is left in fireLight, for the
 * character's mark (see FIRE_MARK).
 */
const FIRE_GLSL = /* glsl */ `
uniform vec4 uFire[FIRE_LIGHTS];
uniform float uFireFill;
varying vec3 vFireNormal;
const vec3 FIRE_WARM = vec3(2.9, 2.05, 1.1);
const float FIRE_DIM = 0.4;
const float FIRE_FILL = 0.08;
float fireLight = 0.0;
vec3 fireTint() {
  vec3 n = normalize(vFireNormal);
  float near = uFireFill;
  float lit = uFireFill;
  for (int i = 0; i < FIRE_LIGHTS; i++) {
    near += uFire[i].w;
    // A light's way sent short of a unit wraps round them that much (the torch in their paw: see
    // Firelight's HELD_WRAP), lighting their far side too.
    float wrap = 1.0 - length(uFire[i].xyz);
    lit += uFire[i].w * smoothstep(-0.1 - wrap, 0.3, dot(n, uFire[i].xyz));
  }
  near = min(near, 1.0);
  // Not in a lit room (uFireFill): the film paints its cast in its rooms at night the night's pale blue.
  fireLight = min(lit, near) * (1.0 - smoothstep(0.0, 0.3, uFireFill));
  vec3 away = (1.0 - FIRE_DIM * near) * (1.0 + (FIRE_WARM - 1.0) * FIRE_FILL * near);
  vec3 toward = 1.0 + (FIRE_WARM - 1.0) * near;
  return mix(away, toward, min(lit, near) / max(near, 1e-3));
}
`;

/** The scene's fog, as three.js's fog_fragment draws it, where the open air's light reaches what is
 * drawn (uOpenAir). */
export const FOG_FRAGMENT = /* glsl */ `
#ifdef USE_FOG
  #ifdef FOG_EXP2
  float fogFactor = 1.0 - exp(-fogDensity * fogDensity * vFogDepth * vFogDepth);
  #else
  float fogFactor = smoothstep(fogNear, fogFar, vFogDepth);
  #endif
  gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, fogFactor * uOpenAir);
#endif`;

const FRAG = /* glsl */ `
#include <common>
#include <fog_pars_fragment>
${FIRE_GLSL}
uniform float uOpenAir;
uniform float uMark;

uniform vec3 uAmbient;
uniform vec3 uShade;
uniform vec3 uLineColor;
uniform float uOutlineWidth;
uniform sampler2D uFace;
uniform float uFaceOn;
uniform vec4 uColorOverride;
uniform float uMaskOn;
uniform float uMaskLine;
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

#ifdef FUR
uniform vec4 uFur;
uniform vec2 uResolution;
varying vec4 vFurClip;
varying vec4 vFurCentre;
varying vec2 vFurScale;
varying vec3 vFurNormal;
varying vec3 vFurView;
varying float vFur;

// The film draws no line round Rakko's head and body, only short strokes of fur in from their edge, square to it
// or a little askew, unevenly spaced (\`[anime] rakko 1\`). On screen, uFur.x of them are laid round the middle of
// the head (or of the body below it), each from uFur.z to uFur.z + uFur.y head radii in from the edge, as on a
// ball of the part's radius, by how far the surface has turned from the camera; leaning up to uFur.w off square,
// with rounded ends, in the pen. Each is a little longer or shorter, nearer or further, by a hash of its place.
float furStrokes(float halfPx) {
  if (vFur < 0.5) return 0.0;
  float f = clamp(dot(normalize(vFurNormal), normalize(-vFurView)), 0.0, 1.0);
  float d = (1.0 - sqrt(1.0 - f * f)) * vFurScale.x;
  vec2 rel = (vFurClip.xy / vFurClip.w - vFurCentre.xy / vFurCentre.w) * 0.5 * uResolution;
  float r = length(rel);
  // On the body, only along its sides, as the film's (its top is under the head, its foot behind the feet): where
  // the strokes run nearly level. The body is wide and short, so its rounded foot comes near level elsewhere.
  if (vFur < 1.5 && abs(rel.x) < 0.88 * r) return 0.0;
  float around = (atan(rel.y, rel.x) / 6.2831853 + 0.5) * uFur.x;
  float ink = 0.0;
  for (int k = -1; k <= 1; k++) {
    float cell = floor(around) + float(k);
    float id = mod(cell, uFur.x) + vFur * 17.0;
    float at = cell + 0.5 + 0.5 * (hash1(id + 0.37) - 0.5);
    float len = max(uFur.y * vFurScale.y * mix(0.7, 1.2, hash1(id + 1.91)), 2.5 * halfPx);
    float gap = uFur.z * vFurScale.y * mix(0.5, 1.5, hash1(id + 3.13));
    float lean = uFur.w * (2.0 * hash1(id + 5.77) - 1.0);
    float across = (around - at) / uFur.x * 6.2831853 * r + (d - gap - 0.5 * len) * lean;
    float along = max(max(gap - d, d - gap - len), 0.0);
    ink = max(ink, 1.0 - smoothstep(halfPx, halfPx + 1.0, length(vec2(across, along))));
  }
  return ink;
}
#endif

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
    col = mix(col, uLineColor, lineMask(abs(f), halfPx, fw) * uMaskLine);
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
  } else if (paint == 4) {
    // A mermaid's scales, as the film draws them on the Siren's tail: rows of scallops round it, each
    // hanging from two points like a wave's trough, every other row offset by half a scale, in the pen.
    // vUv.y counts the rows down the tail from the band; vUv.x counts the scales round it, or, negative,
    // how many go round the tail's bulb, measured here by the angle round her, which has no seam.
    const float SCALE_DEPTH = 0.6;
    float spin = vUv.x < 0.0 ? -vUv.x : 1.0;
    float scaleX = vUv.x < 0.0 ? around * spin : vUv.x;
    float fwS = vUv.x < 0.0 ? min(fwidth(around), fwidth(fract(around + 0.5))) * spin : fwidth(vUv.x);
    float row = floor(vUv.y);
    float sx = fract(scaleX + 0.5 * mod(row, 2.0)) * 2.0 - 1.0;
    float root = sqrt(max(1.0 - sx * sx, 0.0));
    float slope = SCALE_DEPTH * sx / max(root, 0.2);
    float px = abs(fract(vUv.y) - SCALE_DEPTH * root) / max(length(vec2(slope * 2.0 * fwS, fwidth(vUv.y))), 1e-5);
    col = mix(col, uLineColor, (1.0 - smoothstep(halfPx, halfPx + 1.0, px)) * step(0.0, vUv.y));
  } else if (paint == 5) {
    // The lines on the Siren's fin-hands, as the user's drawings of her have them: two strokes in from the
    // tip of each fin's faces, with rounded ends. vUv.x runs across the fin's end, the lines at -0.5 and
    // +0.5; vUv.y in from its tip.
    float fwX = max(fwidth(vUv.x), 1e-5);
    float fwY = max(fwidth(vUv.y), 1e-5);
    float lines = 0.0;
    for (int i = 0; i < 2; i++) {
      float dx = (vUv.x - (float(i) - 0.5)) / fwX;
      float dy = max(max(0.07 - vUv.y, vUv.y - 0.3), 0.0) / fwY;
      lines = max(lines, 1.0 - smoothstep(halfPx, halfPx + 1.0, length(vec2(dx, dy))));
    }
    col = mix(col, uLineColor, lines);
  } else if (paint == 6) {
    // The band round the Siren's waist, flush with her body as the user's drawings have it: inked along
    // both its edges from inside it, a whole pen wide, as nothing over its edges draws the other half (as
    // the grass skirt's top line). vUv.y runs from its bottom edge (0) to its top (1).
    float fwY = max(fwidth(vUv.y), 1e-5);
    col = mix(col, uLineColor, max(lineMask(vUv.y, halfPx * 2.0, fwY), lineMask(1.0 - vUv.y, halfPx * 2.0, fwY)));
  }
#ifdef FUR
  col = mix(col, uLineColor, furStrokes(halfPx));
#endif

  gl_FragColor = vec4(col * uAmbient * uShade * fireTint(), 1.0);
  #ifdef FILM_MASK
  // The mark, less as the fire lights them, so the night's grade leaves the firelit side its warmth
  // (see FIRE_MARK); your own reflection's mark (2) the same way, for the water to pass on.
  gl_FragColor.a = uMark - ${FIRE_MARK.toFixed(2)} * fireLight;
  #endif
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  ${FOG_FRAGMENT}
}
`;

const OUTLINE_FRAG = /* glsl */ `
#include <common>
#include <fog_pars_fragment>
${FIRE_GLSL}
uniform float uOpenAir;
uniform vec3 uLineColor;
uniform vec3 uAmbient;
uniform vec3 uShade;
#ifdef FUR
varying float vFur;
#endif
void main() {
#ifdef FUR
  // No line round the fur: its strokes are drawn instead (see furStrokes).
  if (vFur > 0.5) discard;
#endif
  gl_FragColor = vec4(uLineColor * uAmbient * uShade * fireTint(), 1.0);
  #ifdef FILM_MASK
  gl_FragColor.a = ${PEN_MARK.toFixed(2)};
  #endif
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  ${FOG_FRAGMENT}
}
`;

/** billboard: the geometry carries aCenter/aBill, and those pieces face the camera. fur: the model's rig has fur
 * (Rakko's): strokes of it where the pen draws no line (see furStrokes). */
export function createCharacterMaterials(
  uniforms: CharacterUniforms,
  options: { billboard?: boolean; fur?: boolean } = {},
): {
  body: THREE.ShaderMaterial;
  outline: THREE.ShaderMaterial;
} {
  const extra: Record<string, number> = options.billboard ? { BILLBOARD: 1 } : {};
  if (options.fur) Object.assign(extra, { FUR: 1, HEAD_PART: PART.HEAD });
  // In the film look characters mark themselves in the picture's alpha, so the scenery's
  // brushwork leaves them (and their lines) as drawn.
  if (FILM) extra.FILM_MASK = 1;
  const body = new THREE.ShaderMaterial({
    uniforms: { ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog), ...uniforms },
    vertexShader: VERT,
    fragmentShader: FRAG,
    defines: { MAX_PARTS, SKIRT_PART: PART.SKIRT, FIRE_LIGHTS: CHARACTER_LIGHTS, ...extra },
    fog: true,
  });
  const outline = new THREE.ShaderMaterial({
    uniforms: { ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog), ...uniforms },
    vertexShader: VERT,
    fragmentShader: OUTLINE_FRAG,
    defines: { MAX_PARTS, SKIRT_PART: PART.SKIRT, FIRE_LIGHTS: CHARACTER_LIGHTS, OUTLINE: 1, ...extra },
    side: THREE.BackSide,
    fog: true,
  });
  return { body, outline };
}
