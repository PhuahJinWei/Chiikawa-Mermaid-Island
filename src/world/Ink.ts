import * as THREE from 'three';
import { sharedUniforms } from '../characters/CharacterMaterial';

/**
 * The world's pen. Thick brown strokes are Chiikawa's look, so every line in the world,
 * from a character's outline to the clouds and the horizon, is drawn with one pen: a line
 * 2% of a cast member's height (1.8 cm), the same on everything at the same distance, so
 * nearer things get bolder lines and further ones lighter, never under half the pen where
 * the camera is looking. The backdrop (sky, clouds, horizon) uses the pen where the camera
 * is looking.
 */
export const INK = '#66432F'; // the film's outline brown

/** Height whose 2% sets the pen: a cast member. */
const PEN_REFERENCE_HEIGHT = 0.9;
/** The pen in metres, for line work drawn into textures at a known world size. */
export const PEN_METRES = 0.02 * PEN_REFERENCE_HEIGHT;

export const inkUniforms = {
  /** Pen width in drawing-buffer pixels where the camera is looking. */
  uPen: { value: 3 },
  /** Distance from the camera to where it is looking, in metres. */
  uPenFocus: { value: 7 },
  /** Widest line, in drawing-buffer pixels, for things right in front of the camera. */
  uPenMax: { value: 11 },
  uInk: { value: new THREE.Color(INK) },
};

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Sets the pen for this frame from the camera and the distance to what it looks at. */
export function updatePen(camera: THREE.PerspectiveCamera, focusDistance: number, viewHeight: number, pixelRatio: number): void {
  const vfov = THREE.MathUtils.degToRad(camera.fov) / camera.zoom;
  const pixelsPerMetre = viewHeight / (2 * Math.max(focusDistance, 0.1) * Math.tan(vfov / 2));
  inkUniforms.uPen.value = clamp(PEN_METRES * pixelsPerMetre, 1.5, 11) * pixelRatio;
  inkUniforms.uPenFocus.value = focusDistance;
  inkUniforms.uPenMax.value = 14 * pixelRatio;
}

/** Pen width in drawing-buffer pixels for something `depth` metres in front of the camera. */
export function penAt(depth: number): number {
  const u = inkUniforms;
  return Math.min(u.uPen.value * Math.max(u.uPenFocus.value / Math.max(depth, 1e-3), 0.5), u.uPenMax.value);
}

/** GLSL twin of penAt, for shaders that include inkUniforms. */
export const PEN_GLSL = /* glsl */ `
uniform float uPen;
uniform float uPenFocus;
uniform float uPenMax;
float penAt(float depth) {
  return min(uPen * max(uPenFocus / max(depth, 1e-3), 0.5), uPenMax);
}
`;

/** The wind's clock, shared by everything that sways. */
export const windUniforms = { uTime: { value: 0 } };

/**
 * GLSL: how far the wind moves a point of a plant, by its sway weight (0 where it is rooted, 1 at
 * its tips). Slow and soft, a little different from plant to plant.
 */
export const SWAY_GLSL = /* glsl */ `
uniform float uTime;
vec3 sway(vec3 p, float weight) {
  float ph = dot(p.xz, vec2(0.13, 0.09));
  return weight * vec3(
    0.09 * sin(uTime * 1.3 + ph) + 0.035 * sin(uTime * 2.9 + ph * 2.1),
    0.0,
    0.06 * sin(uTime * 1.1 + ph * 1.4));
}
`;

/**
 * GLSL: a butterfly's wings beating. Every vertex further than 6 mm from the body's middle (along
 * x) is wing, and turns up and down about the body; each instance beats at its own phase.
 */
export const FLAP_GLSL = /* glsl */ `
uniform float uTime;
float flapAngle(float id) {
  return 0.2 + 0.9 * sin(uTime * 15.0 + id * 2.3);
}
vec3 flapTurn(vec3 v, float side, float a) {
  return vec3(v.x * cos(a) - side * v.y * sin(a), side * v.x * sin(a) + v.y * cos(a), v.z);
}
`;

const OUTLINE_VERT = /* glsl */ `
#include <common>
#include <fog_pars_vertex>
uniform vec2 uResolution;
${PEN_GLSL}
#ifdef SWAY
attribute float aSway;
${SWAY_GLSL}
#endif
#ifdef FLAP
${FLAP_GLSL}
#endif
void main() {
  vec3 p = position;
  vec3 n = normal;
#ifdef SWAY
  p += sway(p, aSway);
#endif
#ifdef FLAP
  if (abs(p.x) > 0.006) {
    float a = flapAngle(float(gl_InstanceID));
    float side = sign(p.x);
    p = flapTurn(p, side, a);
    n = flapTurn(n, side, a);
  }
#endif
#ifdef USE_INSTANCING
  p = (instanceMatrix * vec4(p, 1.0)).xyz;
  n = mat3(instanceMatrix) * n;
#endif
  vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
  vec3 nV = normalize(normalMatrix * n);
  vec4 clip = projectionMatrix * mvPosition;
  // Inverted hull pushed out in screen space, so the line is the pen's width at any size.
  vec2 dir = (projectionMatrix * vec4(nV, 0.0)).xy * uResolution;
  float len = length(dir);
  dir = len > 1e-5 ? dir / len : vec2(0.0);
  // Surfaces facing the camera stay put: pushed out, their triangles can fold over at inward
  // corners (a starfish's arms, a frond's teeth) and show through as hairlines. The
  // silhouette, where the surface turns away, carries the outline.
  float push = 1.0 - smoothstep(0.3, 0.6, dot(nV, normalize(-mvPosition.xyz)));
  clip.xy += dir * penAt(-mvPosition.z) * push * 2.0 / uResolution * clip.w;
  gl_Position = clip;
  #include <fog_vertex>
}
`;

const OUTLINE_FRAG = /* glsl */ `
#include <common>
#include <fog_pars_fragment>
uniform vec3 uInk;
uniform vec3 uAmbient;
void main() {
  gl_FragColor = vec4(uInk * uAmbient, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}
`;

/** How a hull moves with what it outlines: not at all, in the wind (plants), or beating (wings). */
export type OutlineMotion = 'still' | 'sway' | 'flap';

const outlineMaterials = new Map<OutlineMotion, THREE.ShaderMaterial>();

/**
 * The pen's outline material for solid objects (props, held items): an inverted hull. A swaying
 * hull moves in the wind with the plant it outlines (by its aSway weights); a flapping one beats
 * with a butterfly's wings.
 */
export function inkOutlineMaterial(motion: OutlineMotion = 'still'): THREE.ShaderMaterial {
  let material = outlineMaterials.get(motion);
  if (!material) {
    material = new THREE.ShaderMaterial({
      uniforms: {
        ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
        ...inkUniforms,
        ...(motion === 'still' ? {} : windUniforms),
        uResolution: sharedUniforms.uResolution,
        uAmbient: sharedUniforms.uAmbient,
      },
      defines: motion === 'sway' ? { SWAY: '' } : motion === 'flap' ? { FLAP: '' } : {},
      vertexShader: OUTLINE_VERT,
      fragmentShader: OUTLINE_FRAG,
      side: THREE.BackSide,
      fog: true,
    });
    outlineMaterials.set(motion, material);
  }
  return material;
}

const hullGeometries = new WeakMap<THREE.BufferGeometry, THREE.BufferGeometry>();

/**
 * A copy of a geometry for its outline hull, with normals averaged over vertices that share
 * a position. Where faces meet at a hard edge (a log's side and its cut end) each face keeps
 * its own normal, and a hull pushed along those normals would crack open at the corner.
 */
export function outlineGeometry(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
  const cached = hullGeometries.get(geometry);
  if (cached) return cached;
  const pos = geometry.getAttribute('position');
  const nrm = geometry.getAttribute('normal');
  const hull = new THREE.BufferGeometry();
  hull.setAttribute('position', pos);
  const swayWeights = geometry.getAttribute('aSway');
  if (swayWeights) hull.setAttribute('aSway', swayWeights);
  if (geometry.index) hull.setIndex(geometry.index);
  const key = (i: number) =>
    `${Math.round(pos.getX(i) * 1e4)},${Math.round(pos.getY(i) * 1e4)},${Math.round(pos.getZ(i) * 1e4)}`;
  const sums = new Map<string, THREE.Vector3>();
  for (let i = 0; i < pos.count; i++) {
    const k = key(i);
    let sum = sums.get(k);
    if (!sum) sums.set(k, (sum = new THREE.Vector3()));
    sum.x += nrm.getX(i);
    sum.y += nrm.getY(i);
    sum.z += nrm.getZ(i);
  }
  const normals = new Float32Array(pos.count * 3);
  const n = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    n.copy(sums.get(key(i)) as THREE.Vector3).normalize();
    normals.set([n.x, n.y, n.z], i * 3);
  }
  hull.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  hull.computeBoundingSphere();
  hullGeometries.set(geometry, hull);
  return hull;
}

/**
 * Gives a solid mesh its outline: a hull sharing its shape (and, for instanced meshes, its
 * instances), added beside it. Returns the hull.
 */
export function addOutline(mesh: THREE.Mesh, motion?: OutlineMotion): THREE.Mesh {
  let hull: THREE.Mesh;
  const geometry = outlineGeometry(mesh.geometry);
  const material = inkOutlineMaterial(motion ?? (geometry.getAttribute('aSway') !== undefined ? 'sway' : 'still'));
  if ((mesh as THREE.InstancedMesh).isInstancedMesh) {
    const src = mesh as THREE.InstancedMesh;
    const inst = new THREE.InstancedMesh(geometry, material, src.count);
    inst.instanceMatrix = src.instanceMatrix;
    hull = inst;
  } else {
    hull = new THREE.Mesh(geometry, material);
  }
  hull.position.copy(mesh.position);
  hull.quaternion.copy(mesh.quaternion);
  hull.scale.copy(mesh.scale);
  hull.frustumCulled = mesh.frustumCulled;
  mesh.parent?.add(hull);
  return hull;
}
