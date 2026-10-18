import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

/**
 * The film look, the island's look: the island painted the way the film's backgrounds are. Only the
 * characters and the ferry keep the pen's line, as in the film, where line art belongs to what is
 * animated and the scenery is painted without it; warm sunlight with cool shadows, which the rocks,
 * trees and houses cast on the ground; the jungle's leaves dabbed light and dark; haze into the
 * distance, a soft glow round bright light and the film's colour grade. While it is being finished,
 * `toon` in the address (?dev&toon) brings back the earlier toon look, with the pen on everything,
 * so the two can be compared side by side.
 */
export const FILM = !(typeof location !== 'undefined' && new URLSearchParams(location.search).has('toon'));

let ramp: THREE.DataTexture | null = null;

/**
 * The film's light ramp for scenery, across the toon material's lit side (dot of normal and light,
 * mapped to 0..1): none of the sun's light on the side turned away, rising softly through the
 * terminator to all of it, where the toon ramp has three hard steps that never go dark.
 */
export function paintedRamp(): THREE.DataTexture {
  if (!ramp) {
    const n = 64;
    const data = new Uint8Array(n);
    for (let i = 0; i < n; i++) data[i] = Math.round(255 * THREE.MathUtils.smoothstep(i / (n - 1), 0.44, 0.68));
    ramp = new THREE.DataTexture(data, n, 1, THREE.RedFormat);
    ramp.minFilter = THREE.LinearFilter;
    ramp.magFilter = THREE.LinearFilter;
    ramp.generateMipmaps = false;
    ramp.needsUpdate = true;
  }
  return ramp;
}

/**
 * What the trees' shade does to a character's flat colours in the film look: much darker and warm,
 * lit only by the light the leaves let through, as the film paints its characters in the jungle's
 * shade (white comes out a dark olive beige).
 */
export const CANOPY_SHADE = new THREE.Color('#8A8E74');

/** Toward the sun (or the moon), for painting what faces it; the stage keeps it with the hour. */
export const sunUniform = { value: new THREE.Vector3(0, 1, 0) };

/**
 * How much of the sky's light reaches under the middle of a tree's crown: the film's jungle floor,
 * and all that grows on it, lies in deep shade, the sun's dapples bright on it.
 */
const UNDER_CANOPY = 0.3;
/** The trees' cover is kept in this many texels across the map, its crowns' heights from COVER_LOW
 * over COVER_SPAN metres and their radii up to COVER_RADIUS. */
const COVER_TEXELS = 512;
const COVER_LOW = -10;
const COVER_SPAN = 64;
const COVER_RADIUS = 16;
/** How far round a point, in metres, the crowns hide its sky: most of the sky's light comes from
 * well off straight up, so a small gap among the crowns lets little of it through. */
const COVER_SPREAD = 4;

/** The trees' cover over the map (see coverTrees), for everything shaded under it. */
const coverUniforms = {
  uCover: { value: null as THREE.DataTexture | null },
  uCoverMap: { value: new THREE.Vector3(0, 0, 1) },
};
/** The same cover as laid (see coverTrees), for reading it at a point (see coverAt). */
let cover: { data: Uint8Array; origin: [number, number]; size: number } | null = null;

/** Blurs n x n values in place: a box `reach` texels each way, along the rows, then the columns. */
function blurSquare(values: Float32Array, n: number, reach: number): void {
  const line = new Float32Array(n);
  for (const across of [true, false]) {
    for (let a = 0; a < n; a++) {
      const at = (b: number) => (across ? a * n + b : b * n + a);
      for (let b = 0; b < n; b++) line[b] = values[at(b)];
      let sum = 0;
      for (let b = -reach; b <= reach; b++) sum += line[Math.min(Math.max(b, 0), n - 1)];
      for (let b = 0; b < n; b++) {
        values[at(b)] = sum / (2 * reach + 1);
        sum += line[Math.min(b + reach + 1, n - 1)] - line[Math.max(b - reach, 0)];
      }
    }
  }
}

/**
 * Lays the trees' crowns (x, y, z, radius) over the map (its origin x, z and size in metres) as
 * their cover, for shadeUnderTrees: in each texel how much of the sky the crowns hide (all of it
 * deep in the jungle, less in a clearing and toward the jungle's edge), and the crowns' height and
 * radius there.
 */
export function coverTrees(crowns: [number, number, number, number][], origin: [number, number], size: number): void {
  const n = COVER_TEXELS;
  const texel = size / n;
  const foot = new Float32Array(n * n);
  const heights = new Float32Array(n * n);
  const radii = new Float32Array(n * n);
  for (const [cx, cy, cz, r] of crowns) {
    const i0 = Math.max(Math.floor((cx - r - origin[0]) / texel), 0);
    const i1 = Math.min(Math.ceil((cx + r - origin[0]) / texel), n - 1);
    const j0 = Math.max(Math.floor((cz - r - origin[1]) / texel), 0);
    const j1 = Math.min(Math.ceil((cz + r - origin[1]) / texel), n - 1);
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const d = Math.hypot(origin[0] + (i + 0.5) * texel - cx, origin[1] + (j + 0.5) * texel - cz);
        const k = 1 - THREE.MathUtils.smoothstep(d, r * 0.5, r);
        const at = j * n + i;
        if (k <= foot[at]) continue;
        foot[at] = k;
        heights[at] = cy;
        radii[at] = r;
      }
    }
  }
  // Spread over the sky round each point; the heights and radii carried out into the gaps, weighed
  // by the crowns they come from.
  for (let i = 0; i < n * n; i++) {
    heights[i] *= foot[i];
    radii[i] *= foot[i];
  }
  const reach = Math.max(Math.round(COVER_SPREAD / texel), 1);
  for (const values of [foot, heights, radii]) {
    blurSquare(values, n, reach);
    blurSquare(values, n, reach);
  }
  const data = new Uint8Array(n * n * 4);
  for (let i = 0; i < n * n; i++) {
    const k = foot[i];
    const height = k > 1e-4 ? heights[i] / k : COVER_LOW;
    const r = k > 1e-4 ? radii[i] / k : 0;
    data[i * 4] = Math.round(Math.min(k * 1.3, 1) * 255);
    data[i * 4 + 1] = Math.round(THREE.MathUtils.clamp((height - COVER_LOW) / COVER_SPAN, 0, 1) * 255);
    data[i * 4 + 2] = Math.round(Math.min(r / COVER_RADIUS, 1) * 255);
    data[i * 4 + 3] = 255;
  }
  const texture = new THREE.DataTexture(data, n, n, THREE.RGBAFormat);
  texture.minFilter = texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  coverUniforms.uCover.value = texture;
  coverUniforms.uCoverMap.value.set(origin[0], origin[1], size);
  cover = { data, origin: [origin[0], origin[1]], size };
}

/**
 * How deep under the trees' crowns the point (x, y, z) lies, as shadeUnderTrees reads it: 1 under a
 * closed canopy, 0 out in the open, above the crowns or before the island has loaded.
 */
export function coverAt(x: number, y: number, z: number): number {
  if (!cover) return 0;
  const n = COVER_TEXELS;
  const u = THREE.MathUtils.clamp(((x - cover.origin[0]) / cover.size) * n - 0.5, 0, n - 1.001);
  const v = THREE.MathUtils.clamp(((z - cover.origin[1]) / cover.size) * n - 0.5, 0, n - 1.001);
  const i = Math.floor(u);
  const j = Math.floor(v);
  const { data } = cover;
  // One of the texels' values, blended between them as the GPU filters the texture.
  const read = (c: number): number => {
    const a = data[(j * n + i) * 4 + c];
    const b = data[(j * n + i + 1) * 4 + c];
    const d = data[((j + 1) * n + i) * 4 + c];
    const e = data[((j + 1) * n + i + 1) * 4 + c];
    return ((a + (b - a) * (u - i)) * (1 - (v - j)) + (d + (e - d) * (u - i)) * (v - j)) / 255;
  };
  const middle = COVER_LOW + COVER_SPAN * read(1);
  const r = Math.max(COVER_RADIUS * read(2), 0.5);
  return read(0) * (1 - THREE.MathUtils.smoothstep(y, middle - 0.5 * r, middle + 0.2 * r));
}

/**
 * The film's haze in a jungle clearing: humid air the light pours into, glowing pale and warm
 * round where it comes in over the falling water while what stands near the camera stays clear. A
 * ball of haze (`centre` and `radius` in metres, its height squashed by `flat`) is worked into the
 * fog of every material: the farther a view runs through it, the more of the haze's colour it
 * takes, from the ball's middle up, where the light comes in; it fades away as the camera draws
 * far off. Set before anything is first drawn.
 */
export function hazeClearing(centre: [number, number, number], radius: number, flat: number, density: number): void {
  const at = `vec3(${centre.map((v) => v.toFixed(2)).join(', ')})`;
  THREE.ShaderChunk.fog_pars_vertex = /* glsl */ `
#ifdef USE_FOG
  varying float vFogDepth;
  varying vec3 vFogRay;
#endif
`;
  THREE.ShaderChunk.fog_vertex = /* glsl */ `
#ifdef USE_FOG
  vFogDepth = - mvPosition.z;
  // From the camera to the point, in the world.
  vFogRay = transpose(mat3(viewMatrix)) * mvPosition.xyz;
#endif
`;
  THREE.ShaderChunk.fog_pars_fragment = /* glsl */ `
#ifdef USE_FOG
  uniform vec3 fogColor;
  varying float vFogDepth;
  varying vec3 vFogRay;
  #ifdef FOG_EXP2
    uniform float fogDensity;
  #else
    uniform float fogNear;
    uniform float fogFar;
  #endif
  // How much haze the view to a point passes through: its way through the ball, where the point
  // stands high (from a little under the ball's middle up), gone as the camera draws far off.
  float hazeThrough(vec3 ray) {
    vec3 squash = vec3(1.0, ${(1 / flat).toFixed(3)}, 1.0);
    vec3 o = (cameraPosition - ${at}) * squash;
    vec3 r = ray * squash;
    float len = length(r);
    vec3 d = r / max(len, 1e-4);
    float b = dot(o, d);
    float disc = b * b - dot(o, o) + ${(radius * radius).toFixed(1)};
    if (disc <= 0.0) return 0.0;
    float s = sqrt(disc);
    float t0 = max(-b - s, 0.0);
    float t1 = min(-b + s, len);
    if (t1 <= t0) return 0.0;
    float high = smoothstep(${(centre[1] - 1.5).toFixed(2)}, ${(centre[1] + 4.0).toFixed(2)}, cameraPosition.y + ray.y);
    float away = smoothstep(${(2.2 * radius).toFixed(1)}, ${(3.6 * radius).toFixed(1)}, length(o));
    return (t1 - t0) * high * (1.0 - away);
  }
#endif
`;
  THREE.ShaderChunk.fog_fragment = /* glsl */ `
#ifdef USE_FOG
  #ifdef FOG_EXP2
    float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
  #else
    float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
  #endif
  gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );
  // The clearing's haze, the fog's colour warmed by the light in it.
  float hazeFactor = 1.0 - exp(-${density.toFixed(4)} * hazeThrough(vFogRay));
  gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor * vec3(1.06, 1.03, 0.86), hazeFactor );
#endif
`;
}

/** GLSL: how deep under the trees' crowns a point in the world lies (see coverTrees): 1 under a
 * crown's middle, easing to 0 toward its edge and up through the crown, nothing above it. */
const COVER_GLSL = /* glsl */ `
uniform sampler2D uCover;
uniform vec3 uCoverMap;
float underTrees(vec3 p) {
  vec4 c = texture2D(uCover, (p.xz - uCoverMap.xy) / uCoverMap.z);
  float middle = ${COVER_LOW.toFixed(1)} + ${COVER_SPAN.toFixed(1)} * c.g;
  float r = max(${COVER_RADIUS.toFixed(1)} * c.b, 0.5);
  return c.r * (1.0 - smoothstep(middle - 0.5 * r, middle + 0.2 * r, p.y));
}
`;

/**
 * Shades a toon material's scenery under the trees, from its onBeforeCompile: the sky's light dims
 * under their crowns (the sun's is the shadows' to take, dappled through them). Worked out at each
 * vertex, or, given `perPixel` (the GLSL name of the fragment's place in the world), at each pixel,
 * for the ground's wide triangles.
 */
export function shadeUnderTrees(shader: THREE.WebGLProgramParametersWithUniforms, perPixel?: string): void {
  Object.assign(shader.uniforms, coverUniforms);
  // Kept within its range: at the picture's smoothed edges a thin leaf seen edge on is shaded beyond
  // its triangle, stretching a per-vertex value past it, into negative or blinding light.
  const dim = `reflectedLight.indirectDiffuse *= mix(1.0, ${UNDER_CANOPY.toFixed(2)}, ${perPixel ? `underTrees(${perPixel})` : 'clamp(vCover, 0.0, 1.0)'});
  #include <aomap_fragment>`;
  if (perPixel) {
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${COVER_GLSL}`)
      .replace('#include <aomap_fragment>', dim);
    return;
  }
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', `#include <common>\n${COVER_GLSL}\nvarying float vCover;`)
    .replace('#include <project_vertex>', 'vCover = underTrees((modelMatrix * vec4(transformed, 1.0)).xyz);\n#include <project_vertex>');
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', '#include <common>\nvarying float vCover;')
    .replace('#include <aomap_fragment>', dim);
}

const warm = new THREE.Color('#FFE3BC');
const hazeTop = new THREE.Color('#B4E1F4');
const hazeHorizon = new THREE.Color('#E6FAF6');

/**
 * The day's sky as the film paints it seen from under the jungle's trees (`enclosed`, 0 to 1):
 * paler and hazier, almost white at the horizon, so the distant trees fade into light; out in the
 * open, the plain blue of its open skies. Takes the sky's top and horizon colours and changes them
 * in place.
 */
export function filmSky(top: THREE.Color, horizon: THREE.Color, night: number, enclosed: number): void {
  const haze = 0.6 * (1 - night) * enclosed;
  top.lerp(hazeTop, haze);
  horizon.lerp(hazeHorizon, haze);
}
const cool = new THREE.Color('#9DC2EC');

/**
 * The day's lights as the film paints them: the sun warmer and the sky's fill cooler and stronger,
 * so the side turned from the sun, and every shadow, is a clear cool blue rather than a darker copy
 * of the lit side. Takes the toon look's sun and sky light and changes them in place.
 */
export function filmLights(light: THREE.DirectionalLight, hemi: THREE.HemisphereLight, night: number): void {
  const day = 1 - night;
  light.color.lerp(warm, 0.55 * day);
  light.intensity *= 0.78;
  hemi.color.lerp(cool, 0.5 * day);
  hemi.intensity *= 1.35;
}

/** GLSL: dabs of light and dark leaves over a plant, from where each point is in the world. */
export const LEAF_GLSL = /* glsl */ `
float leafHash(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
float leafNoise(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(leafHash(i), leafHash(i + vec3(1.0, 0.0, 0.0)), f.x),
                 mix(leafHash(i + vec3(0.0, 1.0, 0.0)), leafHash(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
             mix(mix(leafHash(i + vec3(0.0, 0.0, 1.0)), leafHash(i + vec3(1.0, 0.0, 1.0)), f.x),
                 mix(leafHash(i + vec3(0.0, 1.0, 1.0)), leafHash(i + vec3(1.0, 1.0, 1.0)), f.x), f.y), f.z);
}
float leafDabs(vec3 p) {
  float n = 0.65 * leafNoise(p * 1.7) + 0.35 * leafNoise(p * 4.6 + 3.1);
  return smoothstep(0.36, 0.64, n);
}
`;

/**
 * GLSL: the film's painted tree crowns. A lattice of jittered points in the world splits the
 * foliage into leaf clusters (`leafCells`: distance to the nearest point, how far from the border
 * with the next, and the way to the cluster's middle). `clusterTone` lights each cluster on its top
 * and darkens the gaps between them; `clusterCut` opens those gaps where the surface turns away
 * from the camera, so the crown's edge breaks into clusters instead of showing its polygons.
 * Only leaves take it: `leafy` picks out green vertex colours, leaving trunks and branches alone.
 */
export const CLUSTER_GLSL = /* glsl */ `
vec3 cellHash3(vec3 p) {
  p = vec3(dot(p, vec3(127.1, 311.7, 74.7)), dot(p, vec3(269.5, 183.3, 246.1)), dot(p, vec3(113.5, 271.9, 124.6)));
  return fract(sin(p) * 43758.5453);
}
void leafCells(vec3 p, out float f1, out float border, out vec3 rel, out vec3 id) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  float d1 = 8.0;
  float d2 = 8.0;
  vec3 nearest = vec3(0.0);
  id = i;
  for (int z = -1; z <= 1; z++) {
    for (int y = -1; y <= 1; y++) {
      for (int x = -1; x <= 1; x++) {
        vec3 g = vec3(float(x), float(y), float(z));
        vec3 r = g + cellHash3(i + g) * 0.85 - f;
        float d = dot(r, r);
        if (d < d1) { d2 = d1; d1 = d; nearest = r; id = i + g; } else if (d < d2) { d2 = d; }
      }
    }
  }
  f1 = sqrt(d1);
  border = sqrt(d2) - f1;
  rel = -nearest;
}
float leafy(vec3 colour) {
  return smoothstep(0.02, 0.12, colour.g - max(colour.r, colour.b) * 0.9);
}
// Each cluster a soft puff lit on its top, a little lighter or darker than its neighbours, with a
// shadowed seam where it tucks under the next.
vec3 clusterTone(vec3 rel, float border, vec3 id) {
  float top = dot(normalize(rel + vec3(1e-4)), normalize(vec3(0.3, 0.9, 0.35)));
  float puff = mix(0.76, 1.15, smoothstep(-0.55, 0.75, top));
  float seam = mix(0.8, 1.0, smoothstep(0.0, 0.32, border));
  vec3 vary = cellHash3(id + 17.0);
  return vec3(puff * seam * mix(0.88, 1.1, vary.x)) * mix(vec3(0.97, 0.98, 1.04), vec3(1.05, 1.03, 0.92), vary.y);
}
bool clusterCut(vec3 normalView, vec3 toCamera, float border) {
  float rim = 1.0 - abs(dot(normalView, normalize(toCamera)));
  return rim > 0.55 && border < (rim - 0.55) * 0.75;
}
`;

/**
 * GLSL: the film's foliage (needs CLUSTER_GLSL): round puffs of leaves overlapping like scales, the
 * higher ones over the lower, each lit on its side toward the sun. `p` is in puffs and `n` is the
 * surface's normal in the world. Returns 1 where p is in a puff, with the puff's light (-1 to 1),
 * how near its edge p is (0 to 1) and the puff's own hash. PUFF_FILL, if defined, swells the puffs.
 */
export const PUFF_GLSL = /* glsl */ `
#ifndef PUFF_FILL
#define PUFF_FILL 1.0
#endif
uniform vec3 uSun;
float leafPuffs(vec3 p, vec3 n, out float lit, out float edge, out vec3 tint) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  float best = -1e9;
  float found = 0.0;
  lit = 0.0;
  edge = 1.0;
  tint = vec3(0.5);
  for (int z = -1; z <= 1; z++) {
    for (int y = -1; y <= 1; y++) {
      for (int x = -1; x <= 1; x++) {
        vec3 g = vec3(float(x), float(y), float(z));
        vec3 h = cellHash3(i + g);
        vec3 r = g + h * 0.85 - f;
        float radius = (0.5 + 0.32 * h.x) * PUFF_FILL;
        float d = length(r);
        float priority = g.y + h.y + 0.5 * h.z;
        if (d < radius && priority > best) {
          best = priority;
          found = 1.0;
          lit = dot(normalize(-r / radius + n * 0.9), uSun);
          edge = d / radius;
          tint = h;
        }
      }
    }
  }
  return found;
}
`;

/**
 * GLSL: the film's painted bark (needs LEAF_GLSL and PUFF_GLSL's uSun): furrows running up the wood,
 * wandering a little, the ridges between them lighter and, on the side toward the sun, warm orange;
 * lichen in patches, moss on what faces up. `woody` picks out the plants' browns, leaving leaves and
 * flowers alone.
 */
export const BARK_GLSL = /* glsl */ `
float woody(vec3 c) {
  return step(c.b, c.g) * step(c.g, c.r) * smoothstep(0.06, 0.16, c.r - c.b) * (1.0 - smoothstep(0.45, 0.7, c.r));
}
vec3 paintBark(vec3 base, vec3 p, vec3 n) {
  float wander = leafNoise(p * vec3(0.6, 0.15, 0.6)) - 0.5;
  vec3 q = p + vec3(wander, 0.0, -wander) * 0.4;
  float furrows = leafNoise(q * vec3(2.6, 0.3, 2.6)) * 0.7 + leafNoise(q * vec3(7.0, 0.8, 7.0)) * 0.3;
  vec3 col = base * mix(0.6, 1.1, smoothstep(0.32, 0.68, furrows));
  float sunny = smoothstep(0.3, 0.8, dot(n, uSun));
  col = mix(col, col * vec3(1.42, 1.22, 0.86), sunny * smoothstep(0.5, 0.72, furrows));
  // Pale grey-green lichen in patches up the wood, as on the film's jungle trunks.
  float lichen = smoothstep(0.5, 0.62, leafNoise(p * vec3(1.2, 0.45, 1.2) + 7.0)) * smoothstep(0.3, 0.6, furrows);
  col = mix(col, vec3(0.42, 0.44, 0.28) * mix(0.85, 1.1, furrows), lichen * 0.8);
  float moss = smoothstep(0.5, 0.85, n.y) * smoothstep(0.55, 0.62, leafNoise(p * 1.4 + 3.0));
  return mix(col, vec3(0.16, 0.33, 0.06), moss);
}
`;

/**
 * GLSL: the film's painted leaves (needs CLUSTER_GLSL's leafy), from where on its leaf a point is
 * (`at`: how far along it from the stalk, plus 2 on a monstera's split leaf or 4 on a frond, and how
 * far across it from the middle; across 9 off the leaves). A monstera's splits run in from its edge
 * between the veins and a frond's leaflets part toward its edge, so both are cut away there; the
 * rest is lighter toward the tip, with a midrib and side veins rising from it toward the tip,
 * lighter on green leaves and darker on red ones. Returns how much of the point is left (0 where
 * it is cut away, soft at the cut's edge), for alpha to coverage: a leaf that throws points away
 * outright would lose the depth test that skips the leaves hidden behind it.
 */
export const VEIN_GLSL = /* glsl */ `
float paintVeins(inout vec3 colour, vec3 vertexColour, vec2 at) {
  if (at.y > 2.0) return 1.0;
  float kind = floor(at.x / 2.0);
  float along = at.x - kind * 2.0;
  float across = abs(at.y);
  float keep = 1.0;
  if (kind > 0.5 && kind < 1.5) {
    float run = along * 5.0 + across * 0.9 + 0.3;
    float d = abs(fract(run) - 0.5) - 0.1 * smoothstep(0.55, 0.9, across) * step(0.18, along);
    float w = fwidth(run) * 0.75 + 1e-4;
    keep = smoothstep(-w, w, d);
  }
  if (kind > 1.5) {
    float run = along * 10.0 - across * 0.6;
    float d = abs(fract(run) - 0.5) - 0.22 * smoothstep(0.45, 0.85, across);
    float w = fwidth(run) * 0.75 + 1e-4;
    keep = smoothstep(-w, w, d);
  }
  float rib = (1.0 - smoothstep(0.035, 0.08, across)) * smoothstep(0.03, 0.1, along) * (1.0 - smoothstep(0.85, 0.98, along));
  float v = fract(along * 6.0 - across * 1.5);
  float vein = (1.0 - smoothstep(0.03, 0.09, min(v, 1.0 - v))) * smoothstep(0.08, 0.2, across) * (1.0 - smoothstep(0.75, 0.95, across));
  vec3 c = colour * mix(0.8, 1.12, smoothstep(0.0, 0.85, along));
  vec3 veinColour = mix(c * 0.62, c * 1.25 + vec3(0.02, 0.03, 0.0), leafy(vertexColour));
  colour = mix(c, veinColour, max(rib, vein * 0.6));
  return keep;
}
`;

/**
 * Paints a toon material's leaves and bark the film's way, from its onBeforeCompile (after any change
 * to `transformed`, such as the wind's sway): leaves dabbed light and dark, or, for tree crowns
 * (`clusters`: the puffs' size in metres), in puffs lit toward the sun with the crown opening between
 * them at its edge and underneath; wood furrowed and lit warm (see BARK_GLSL). Needs vertex colours,
 * which tell leaves from wood.
 */
export function paintLeaves(shader: THREE.WebGLProgramParametersWithUniforms, clusters = 0): void {
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nvarying vec3 vLeaf;\nattribute vec2 aLeaf;\nvarying vec2 vLeafAt;')
    .replace(
      '#include <project_vertex>',
      'vLeaf = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvLeafAt = aLeaf;\n#include <project_vertex>',
    );
  shader.fragmentShader = shader.fragmentShader.replace(
    '#include <common>',
    `#include <common>\nvarying vec3 vLeaf;\nvarying vec2 vLeafAt;\n${LEAF_GLSL}\n${CLUSTER_GLSL}\n${PUFF_GLSL}\n${BARK_GLSL}\n${VEIN_GLSL}`,
  );
  shader.uniforms.uSun = sunUniform;
  if (!clusters) {
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <color_fragment>',
        '#include <color_fragment>\ndiffuseColor.rgb = clamp(diffuseColor.rgb, 0.0, 1.0);\ndiffuseColor.rgb *= mix(1.0, mix(0.8, 1.14, leafDabs(vLeaf)), leafy(vColor.rgb));',
      )
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
        diffuseColor.rgb = mix(diffuseColor.rgb, paintBark(diffuseColor.rgb, vLeaf, inverseTransformDirection(normal, viewMatrix)), woody(vColor.rgb));
        diffuseColor.a *= paintVeins(diffuseColor.rgb, vColor.rgb, vLeafAt);`,
      );
    return;
  }
  // A leaf's own colours kept within theirs, for the same reason as the trees' shade (see
  // shadeUnderTrees).
  shader.fragmentShader = shader.fragmentShader.replace(
    '#include <color_fragment>',
    '#include <color_fragment>\ndiffuseColor.rgb = clamp(diffuseColor.rgb, 0.0, 1.0);',
  );
  shader.fragmentShader = shader.fragmentShader.replace(
    '#include <normal_fragment_maps>',
    `#include <normal_fragment_maps>
    {
      // Leaves in puffs: the crown's edge breaks into them; each is yellower where it faces the
      // sun, bluer away from it and a little darker round its edge.
      float leaves = leafy(vColor.rgb);
      float puffLit, puffEdge;
      vec3 puffTint;
      float inPuff = leafPuffs(vLeaf / ${clusters.toFixed(2)}, inverseTransformDirection(normal, viewMatrix), puffLit, puffEdge, puffTint);
      // Between the puffs the crown opens to the light at its edge and underneath.
      vec3 nWorld = inverseTransformDirection(normal, viewMatrix);
      float rim = 1.0 - abs(dot(normal, normalize(vViewPosition)));
      float open = max(smoothstep(0.25, 0.45, rim), smoothstep(-0.2, -0.55, nWorld.y));
      if (leaves > 0.5 && inPuff < 0.5 && open > 0.5) discard;
      vec3 tone = mix(vec3(0.6, 0.72, 0.82), vec3(1.22, 1.16, 0.74), smoothstep(-0.1, 0.35, puffLit));
      tone *= mix(1.0, 0.76, smoothstep(0.62, 1.0, puffEdge)) * mix(0.88, 1.1, puffTint.x);
      tone = mix(vec3(0.42, 0.5, 0.52), tone, inPuff) * mix(0.94, 1.05, leafDabs(vLeaf * 2.0));
      diffuseColor.rgb *= mix(vec3(1.0), tone, leaves);
      diffuseColor.rgb = mix(diffuseColor.rgb, paintBark(diffuseColor.rgb, vLeaf, nWorld), woody(vColor.rgb));
    }`,
  );
}

/**
 * The film look's shadow for a crown painted in puffs (see paintLeaves): the sun passes through
 * the gaps between its puffs, so the ground and the rock under the trees lie in dappled light. Its
 * puffs are fuller than the crown's painted ones: light passes only where the leaves part widely, so
 * under the trees it is mostly shade, the dapples few and bright.
 * `clusters` is the puffs' size; `before` adds anything the crown's own material does to its
 * vertices first (such as the wind's sway), so the shadow moves with it. Only leaves let the light
 * through: their colours are told from the wood's as the crown's material tells them.
 */
export function puffShadow(clusters: number, before?: (shader: THREE.WebGLProgramParametersWithUniforms) => void): THREE.MeshDepthMaterial {
  const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  depth.onBeforeCompile = (shader) => {
    before?.(shader);
    shader.uniforms.uSun = sunUniform;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 color;\nvarying vec3 vLeaf;\nvarying vec3 vLeafColour;')
      .replace(
        '#include <project_vertex>',
        'vLeaf = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvLeafColour = color;\n#include <project_vertex>',
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vLeaf;\nvarying vec3 vLeafColour;\n#define PUFF_FILL 1.3\n${CLUSTER_GLSL}\n${PUFF_GLSL}`)
      .replace(
        'void main() {',
        `void main() {
        {
          float lit, edge;
          vec3 tint;
          if (leafy(vLeafColour) > 0.5 && leafPuffs(vLeaf / ${clusters.toFixed(2)}, vec3(0.0, 1.0, 0.0), lit, edge, tint) < 0.5) discard;
        }`,
      );
  };
  depth.customProgramCacheKey = () => `puffShadow:${clusters}:${before ? 'moved' : 'still'}`;
  return depth;
}

/**
 * Shafts of sunlight slanting down through the haze, as the film paints them where the sun falls
 * into a clearing: soft bright bands standing on `bases` (x, y, z, each with its length and width
 * in metres), leaning toward the sun and turning to face the camera, gone when the sun is down.
 * `strength` is how bright they are at most.
 */
export function lightShafts(bases: [number, number, number, number, number][], strength: number): THREE.Mesh {
  const positions: number[] = [];
  const base: number[] = [];
  const size: number[] = [];
  const corner: number[] = [];
  const index: number[] = [];
  bases.forEach(([x, y, z, length, width], k) => {
    for (const [u, v] of [[0, 0], [1, 0], [1, 1], [0, 1]]) {
      positions.push(x, y, z);
      base.push(x, y, z);
      size.push(length, width, k);
      corner.push(u, v);
    }
    const i = k * 4;
    index.push(i, i + 1, i + 2, i, i + 2, i + 3);
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('aBase', new THREE.Float32BufferAttribute(base, 3));
  geometry.setAttribute('aSize', new THREE.Float32BufferAttribute(size, 3));
  geometry.setAttribute('aCorner', new THREE.Float32BufferAttribute(corner, 2));
  geometry.setIndex(index);
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uSun: sunUniform,
      uNight: nightUniform,
      uStrength: { value: strength },
      uTime: { value: 0 },
      uColour: { value: new THREE.Color('#FFF3CF') },
    },
    vertexShader: /* glsl */ `
      uniform vec3 uSun;
      attribute vec3 aBase;
      attribute vec3 aSize;
      attribute vec2 aCorner;
      varying vec2 vCorner;
      varying float vShaft;
      void main() {
        vec3 axis = normalize(uSun);
        vec3 toCamera = normalize(cameraPosition - aBase);
        vec3 side = normalize(cross(axis, toCamera));
        vec3 p = aBase + axis * (aCorner.y * aSize.x) + side * ((aCorner.x - 0.5) * aSize.y);
        vCorner = aCorner;
        vShaft = aSize.z;
        gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uSun;
      uniform float uNight;
      uniform float uStrength;
      uniform float uTime;
      uniform vec3 uColour;
      varying vec2 vCorner;
      varying float vShaft;
      void main() {
        float across = sin(3.14159 * vCorner.x);
        float along = smoothstep(0.0, 0.25, vCorner.y) * (1.0 - smoothstep(0.55, 1.0, vCorner.y));
        float shimmer = 0.8 + 0.2 * sin(uTime * 0.6 + vShaft * 2.3 + vCorner.y * 4.0);
        // Sunlight only: gone as the light passes to the moon.
        float day = smoothstep(0.05, 0.25, uSun.y) * (1.0 - smoothstep(0.2, 0.55, uNight));
        gl_FragColor = vec4(uColour * (across * across * along * shimmer * day * uStrength), 1.0);
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  return mesh;
}

/** How a kind of stone is painted (`paintStone`): the blocks it splits into (how wide and how tall,
 * in metres); whether it stands in upright slabs, each column of them breaking at heights of its own,
 * or lies in level beds, each bed's joints where they fall; how readily moss grows on what faces up;
 * and how strongly it is stained and streaked. */
export interface StoneKind {
  block: [number, number];
  upright: boolean;
  moss: number;
  stain: number;
}

/** Limestone splits into tall upright slabs, the sea spires' into narrower ones; bedded rock lies in
 * long, low blocks, the sea cliffs' sandstone in long beds with few joints and little stain, clean
 * and pale as the film paints it (its beds and joints are in the rock's own shape). */
export const STONES = {
  limestone: { block: [2.6, 7.0], upright: true, moss: 1, stain: 1 },
  spire: { block: [1.4, 3.5], upright: true, moss: 0.6, stain: 1 },
  bedded: { block: [9.0, 2.4], upright: false, moss: 0.5, stain: 0.35 },
  layered: { block: [3.0, 1.1], upright: false, moss: 0.7, stain: 1 },
} satisfies Record<string, StoneKind>;

/**
 * GLSL: the film's painted stone over a rock's own colours (needs LEAF_GLSL and CLUSTER_GLSL). The
 * stone splits into blocks, each its own shade, with flat painted patches of shade and stain across
 * it and streaks running down, a lit lip along its top and dark cracks round it; moss grows on what
 * faces up and wherever the rock's colours are moss, in broken patches painted as cushions, each lit
 * along its top. `p` is the point in the world, `n` its normal.
 */
export const STONE_GLSL = /* glsl */ `
uniform vec2 uBlock;
uniform float uUpright;
uniform float uMoss;
uniform float uStain;
uniform vec3 uMossLight;
uniform vec3 uMossDark;
vec2 stoneHash2(vec2 p) {
  p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
  return fract(sin(p) * 43758.5453);
}
// The cell of a plan of jittered points that p (in cells) falls in, and how far it is from the
// cell's edge.
void stoneCells(vec2 p, out vec2 id, out float border) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  float d1 = 8.0;
  float d2 = 8.0;
  id = i;
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 g = vec2(float(x), float(y));
      vec2 r = g + stoneHash2(i + g) * 0.9 - f;
      float d = dot(r, r);
      if (d < d1) { d2 = d1; d1 = d; id = i + g; } else if (d < d2) { d2 = d; }
    }
  }
  border = sqrt(d2) - sqrt(d1);
}
float mossy(vec3 colour) {
  return smoothstep(0.1, 0.2, colour.g - max(colour.r, colour.b));
}
// Noise turned off the grid's axes, octave by octave, so its shapes come out round, not blocky.
const mat3 STONE_TURN = mat3(0.00, 0.80, 0.60, -0.80, 0.36, -0.48, -0.60, -0.48, 0.64);
float roundNoise(vec3 p) {
  return leafNoise(STONE_TURN * p) * 0.6 + leafNoise(STONE_TURN * STONE_TURN * (p * 2.03) + 1.7) * 0.4;
}
float mossBumps(vec3 p) {
  return roundNoise(p * 0.55);
}
vec3 paintStone(vec3 base, vec3 p, vec3 n) {
  // Cracks wander a little as they run.
  vec2 warp = vec2(leafNoise(vec3(p.xz * 0.35, p.y * 0.09)), leafNoise(vec3(p.xz * 0.35 + 5.2, p.y * 0.09))) - 0.5;
  vec2 cid;
  float cBorder;
  float rise;
  if (uUpright > 0.5) {
    stoneCells(p.xz / uBlock.x + warp * 0.6, cid, cBorder);
    rise = p.y / uBlock.y + stoneHash2(cid + 7.1).x * 4.0 + warp.x * 0.5;
  } else {
    rise = p.y / uBlock.y + warp.x * 0.25;
    stoneCells(p.xz / uBlock.x + warp * 0.4 + stoneHash2(vec2(floor(rise), 3.3)) * 9.0, cid, cBorder);
  }
  float within = fract(rise);
  vec3 h = cellHash3(vec3(cid, floor(rise)));
  vec3 col = base * mix(0.86, 1.1, h.x);
  col *= mix(vec3(1.0), vec3(0.93, 1.03, 0.9), step(0.62, h.y));
  float stain = leafNoise(p * vec3(0.45, 0.18, 0.45) + h * 9.0) * 0.6 + leafNoise(p * vec3(1.3, 0.5, 1.3)) * 0.4;
  col = mix(col, col * vec3(0.8, 0.86, 0.76), smoothstep(0.5, 0.54, stain) * uStain);
  float streak = leafNoise(vec3(p.x * 2.2, p.y * 0.12, p.z * 2.2));
  col = mix(col, col * vec3(0.88, 0.9, 0.84), smoothstep(0.6, 0.66, streak) * 0.8 * uStain);
  // Low limestone, down in the jungle's damp, is filmed green in broad soft patches, as the film's
  // mossy cliffs are; the pillars' heights stay pale.
  float damp = smoothstep(0.4, 0.62, roundNoise(p * 0.2 + 2.4)) * (1.0 - smoothstep(24.0, 34.0, p.y)) * smoothstep(0.8, 1.0, uMoss);
  col = mix(col, col * vec3(0.7, 0.86, 0.6), damp * 0.75);
  // Cracks taper and widen along their length; only some blocks break from the one above.
  float wide = 0.3 + 1.4 * leafNoise(p * vec3(0.9, 0.22, 0.9));
  float joint = step(0.45, cellHash3(vec3(cid, floor(rise + 0.5)) + 3.0).z);
  float upright = cBorder * uBlock.x;
  float level = mix(9.0, min(within, 1.0 - within) * uBlock.y, joint);
  float lip = (1.0 - within) * uBlock.y;
  col = mix(col, col * vec3(1.12, 1.12, 1.06), (1.0 - smoothstep(0.12, 0.3, lip)) * smoothstep(0.08, 0.14, lip) * joint);
  float edge = min(upright, level);
  col = mix(col, col * 0.86, 1.0 - smoothstep(0.15 * wide, 0.45 * wide, edge));
  col = mix(col, base * vec3(0.38, 0.43, 0.32), 1.0 - smoothstep(0.07 * wide, 0.14 * wide, edge));
  // Moss in clumps: the rock's own moss thinned out in broad stretches, and what faces up.
  float clumps = smoothstep(0.34, 0.5, roundNoise(p * 0.16 + 1.7));
  float cover = max(mossy(base) * 0.85 * clumps, smoothstep(0.45, 0.85, n.y) * uMoss);
  float broken = roundNoise(p * 0.8 + 5.0);
  float grow = cover * (0.4 + 0.9 * broken);
  float moss = smoothstep(0.48, 0.53, grow);
  // Each cushion lit along its top and shaded under it, darker round the clump's edge.
  float lit = smoothstep(0.3, 0.7, (mossBumps(p) - mossBumps(p + vec3(0.0, 0.3, 0.0))) * 4.5 + 0.5);
  vec3 mossCol = mix(uMossDark, uMossLight, clamp(0.15 + 0.7 * lit + 0.25 * n.y, 0.0, 1.0));
  mossCol *= mix(0.75, 1.0, smoothstep(0.53, 0.62, grow)) * mix(0.93, 1.06, leafDabs(p * 1.2));
  // Turf on a flat top (the rock's own grass colours) is left as grass, softly dabbed, uncracked.
  float turf = smoothstep(0.15, 0.25, base.g - max(base.r, base.b)) * smoothstep(0.75, 0.9, n.y);
  return mix(mix(col, mossCol, moss), base * mix(0.93, 1.05, leafDabs(p * 0.8)), turf);
}
`;

/**
 * GLSL: thatch as the film paints its huts' roofs (needs LEAF_GLSL): straw laid in rows round the
 * roof, each row's ragged lower edge a dark line where it overlaps the row below, the straw
 * streaked along its fall and lighter along each row's top. `thatchy` picks out the straw by its
 * colour on a slope, leaving wood, walls and floors of the same colour alone. `p` is the point in
 * the world.
 */
const THATCH_GLSL = /* glsl */ `
float thatchy(vec3 c, vec3 n) {
  float warmth = c.g / max(c.r, 1e-3);
  float straw = smoothstep(0.47, 0.52, warmth) * (1.0 - smoothstep(0.8, 0.9, warmth))
    * (1.0 - smoothstep(0.3, 0.36, c.b / max(c.r, 1e-3))) * step(0.04, c.r);
  return straw * smoothstep(0.12, 0.25, n.y) * (1.0 - smoothstep(0.96, 0.99, n.y));
}
vec3 paintThatch(vec3 base, vec3 p) {
  float fall = leafNoise(vec3(p.x * 7.0, p.y * 0.9, p.z * 7.0));
  float row = p.y / 0.34 + 0.18 * leafNoise(p * vec3(1.5, 0.0, 1.5)) + 0.08 * fall;
  float within = fract(row);
  vec3 col = base * mix(0.84, 1.12, fall);
  col *= mix(1.0, 1.1, smoothstep(0.55, 0.95, within));
  return col * mix(1.0, 0.6, 1.0 - smoothstep(0.0, 0.1 + 0.12 * fall, within));
}
`;

/**
 * Paints a toon material's thatch the film's way (see THATCH_GLSL), from its onBeforeCompile; the
 * rest of what it draws is left as it is. Needs vertex colours.
 */
export function paintThatch(shader: THREE.WebGLProgramParametersWithUniforms): void {
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nvarying vec3 vThatch;')
    .replace('#include <project_vertex>', 'vThatch = (modelMatrix * vec4(transformed, 1.0)).xyz;\n#include <project_vertex>');
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', `#include <common>\nvarying vec3 vThatch;\n${LEAF_GLSL}\n${THATCH_GLSL}`)
    .replace(
      '#include <normal_fragment_maps>',
      `#include <normal_fragment_maps>
      {
        float thatch = thatchy(vColor.rgb, inverseTransformDirection(normal, viewMatrix));
        if (thatch > 0.0) diffuseColor.rgb = mix(diffuseColor.rgb, paintThatch(diffuseColor.rgb, vThatch), thatch);
      }`,
    );
}

/**
 * Paints a toon material's stone the film's way (see STONE_GLSL), from its onBeforeCompile: the
 * rock's own vertex colours split into slabs of `kind`, cracked, stained and mossed.
 */
export function paintStone(shader: THREE.WebGLProgramParametersWithUniforms, kind: StoneKind): void {
  Object.assign(shader.uniforms, {
    uBlock: { value: new THREE.Vector2(...kind.block) },
    uUpright: { value: kind.upright ? 1 : 0 },
    uMoss: { value: kind.moss },
    uStain: { value: kind.stain },
    uMossLight: { value: new THREE.Color('#9CCB55') },
    uMossDark: { value: new THREE.Color('#4E8A3A') },
  });
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nvarying vec3 vStone;')
    .replace('#include <project_vertex>', 'vStone = (modelMatrix * vec4(transformed, 1.0)).xyz;\n#include <project_vertex>');
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', `#include <common>\nvarying vec3 vStone;\n${LEAF_GLSL}\n${CLUSTER_GLSL}\n${STONE_GLSL}`)
    .replace(
      '#include <normal_fragment_maps>',
      `#include <normal_fragment_maps>
      diffuseColor.rgb = paintStone(clamp(diffuseColor.rgb, 0.0, 1.0), vStone, inverseTransformDirection(normal, viewMatrix));`,
    );
}

/** How far into the night it is, 0 by day to 1 (see the grade); the stage keeps it with the hour. */
export const nightUniform = { value: 0 };
/** How golden the hour is, 0 to 1 in the late afternoon (see the grade and the jungle's haze); the
 * stage keeps it with the hour. */
export const goldenUniform = { value: 0 };

/** The moon's light for the moonlit edges (see moonEdges): the way to the moon in the world, and the
 * colour of the light it rims things with, black by day. The stage sets both with the hour. */
export const moonUniforms = {
  uMoonWay: { value: new THREE.Vector3(0, 1, 0) },
  uMoonRim: { value: new THREE.Color(0, 0, 0) },
};

/**
 * Moonlight catching the edges of what turns toward the moon at night, a cool cyan, as the film
 * paints its night jungle: leaves, trunks and rocks rimmed just where they turn away from the
 * camera and toward the moon. Only the very edge, so a broad face seen at a slant keeps its own
 * colour. For a toon material, from its onBeforeCompile.
 */
export function moonEdges(shader: THREE.WebGLProgramParametersWithUniforms): void {
  Object.assign(shader.uniforms, moonUniforms);
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', '#include <common>\nuniform vec3 uMoonWay;\nuniform vec3 uMoonRim;')
    .replace(
      '#include <opaque_fragment>',
      `{
        float edge = 1.0 - abs(dot(normal, normalize(vViewPosition)));
        float toMoon = smoothstep(-0.15, 0.55, dot(inverseTransformDirection(normal, viewMatrix), uMoonWay));
        outgoingLight += uMoonRim * smoothstep(0.62, 0.95, edge) * toMoon;
      }
      #include <opaque_fragment>`,
    );
}

/**
 * The film's colour grade, on the finished picture (still in linear light), set by measuring the
 * film's jungle frames: warmer through the darks and the middle (the pale sky left alone), greens
 * leaning toward yellow, a little more colour and a fifth more contrast, shadows a touch green and
 * highlights warm, and the corners a little darker. By night, measured on the film's moonlit
 * beach, the picture is painted in blues: each colour drawn by its brightness toward a blue that
 * deepens in the darks and pales to white in the lights, what is blue already (the sky) left as it
 * is, firelight and lit windows keeping their warmth and the characters most of their own colours.
 */
const GRADE = {
  uniforms: {
    tDiffuse: { value: null },
    uNight: nightUniform,
    uGolden: goldenUniform,
    uSaturation: { value: 1.1 },
    uContrast: { value: 1.2 },
    uShadowTint: { value: new THREE.Vector3(-0.004, 0.008, 0.0) },
    uHighlightTint: { value: new THREE.Vector3(0.03, 0.02, -0.025) },
    uVignette: { value: 0.32 },
    uBalance: { value: new THREE.Vector3(1, 1, 0.96) },
    uYellow: { value: 0.2 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uSaturation;
    uniform float uContrast;
    uniform vec3 uShadowTint;
    uniform vec3 uHighlightTint;
    uniform float uVignette;
    uniform vec3 uBalance;
    uniform float uYellow;
    uniform float uNight;
    uniform float uGolden;
    varying vec2 vUv;
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      vec3 g = pow(max(c.rgb, 0.0), vec3(1.0 / 2.2));
      float l = dot(g, vec3(0.299, 0.587, 0.114));
      // Warmer through the darks and the middle, leaving the pale sky as it is; greens leaning
      // toward yellow.
      g = mix(g * uBalance, g, smoothstep(0.65, 0.95, l));
      g.r += uYellow * max(g.g - max(g.r, g.b), 0.0);
      g = mix(vec3(l), g, uSaturation);
      g = (g - 0.5) * uContrast + 0.5;
      g += uShadowTint * (1.0 - smoothstep(0.0, 0.55, l)) + uHighlightTint * smoothstep(0.45, 1.0, l);
      // The golden hour: everything warmer and more golden, greens leaning further toward yellow.
      if (uGolden > 0.0) {
        g = mix(g, g * vec3(1.07, 1.0, 0.8) + vec3(0.02, 0.015, 0.0), uGolden * 0.75);
        g.r += uGolden * 0.12 * max(g.g - max(g.r, g.b), 0.0);
      }
      float night = smoothstep(0.4, 1.0, uNight);
      if (night > 0.0) {
        float n = clamp(dot(g, vec3(0.299, 0.587, 0.114)), 0.0, 1.0);
        // Nothing goes black: the darkest shapes are a deep violet navy, the middle a blue-violet,
        // the lights a pale periwinkle, as the film paints its night jungle. Greens lean teal and
        // reds and purples violet, so the jungle keeps its kinds of leaf.
        vec3 moonlit = vec3(pow(n, 1.35) + 0.05 * (1.0 - n), pow(n, 1.2), pow(n, 0.65))
          + vec3(0.12, 0.08, 0.32) * (1.0 - smoothstep(0.0, 0.35, n));
        float green = smoothstep(0.01, 0.12, g.g - max(g.r, g.b));
        float red = smoothstep(0.03, 0.18, g.r - max(g.g, g.b));
        moonlit += (green * vec3(-0.02, 0.07, 0.03) + red * vec3(0.12, -0.02, 0.1)) * (0.35 + n);
        float warm = smoothstep(0.12, 0.4, g.r - g.b) * smoothstep(0.3, 0.7, n);
        float blue = smoothstep(0.15, 0.35, g.b - max(g.r, g.g));
        // Under the night's blue each thing keeps much of its own colour, the more colourful the
        // more, as the film's nights keep a red stall red, only darker and bluer; leaves alone go
        // over to the night's teal and violet.
        float top = max(max(g.r, g.g), g.b);
        float colourful = smoothstep(0.15, 0.6, (top - min(min(g.r, g.g), g.b)) / max(top, 1e-3)) * (1.0 - green);
        g = mix(g, moonlit, night * 0.75 * (1.0 - 0.65 * colourful) * (1.0 - warm) * (1.0 - blue) * (c.a < 0.75 ? 0.45 : 1.0));
      }
      vec2 d = vUv - 0.5;
      g *= 1.0 - uVignette * dot(d, d);
      gl_FragColor = vec4(pow(max(g, 0.0), vec3(2.2)), c.a);
    }`,
};

/**
 * The film's brushwork, on the scenery as rendered: each point takes the average colour of whichever
 * corner of the patch round it is most even (a Kuwahara filter), so fine render detail settles into
 * flat painted shapes while the edges between them stay sharp. Characters, marked in the picture's
 * alpha (see CharacterMaterial), are left as drawn and kept out of the scenery's averages, so their
 * lines stay crisp.
 */
const PAINT = {
  defines: { RADIUS: 2 },
  uniforms: {
    tDiffuse: { value: null },
    uTexel: { value: new THREE.Vector2(1, 1) },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform vec2 uTexel;
    varying vec2 vUv;
    void main() {
      vec4 here = texture2D(tDiffuse, vUv);
      if (here.a < 0.75) {
        gl_FragColor = vec4(here.rgb, 1.0);
        return;
      }
      vec3 sum[4];
      vec3 squares[4];
      float count[4];
      for (int k = 0; k < 4; k++) {
        sum[k] = vec3(0.0);
        squares[k] = vec3(0.0);
        count[k] = 0.0;
      }
      for (int j = -RADIUS; j <= RADIUS; j++) {
        for (int i = -RADIUS; i <= RADIUS; i++) {
          vec4 c = texture2D(tDiffuse, vUv + vec2(float(i), float(j)) * uTexel);
          if (c.a < 0.75) continue;
          vec3 v = c.rgb / (1.0 + c.rgb);
          if (i <= 0 && j <= 0) { sum[0] += v; squares[0] += v * v; count[0] += 1.0; }
          if (i >= 0 && j <= 0) { sum[1] += v; squares[1] += v * v; count[1] += 1.0; }
          if (i <= 0 && j >= 0) { sum[2] += v; squares[2] += v * v; count[2] += 1.0; }
          if (i >= 0 && j >= 0) { sum[3] += v; squares[3] += v * v; count[3] += 1.0; }
        }
      }
      float best = 1e9;
      vec3 picked = here.rgb / (1.0 + here.rgb);
      for (int k = 0; k < 4; k++) {
        if (count[k] < 1.0) continue;
        vec3 mean = sum[k] / count[k];
        vec3 spread = squares[k] / count[k] - mean * mean;
        float variance = spread.r + spread.g + spread.b;
        if (variance < best) {
          best = variance;
          picked = mean;
        }
      }
      // Averaged with highlights tamed, so a bright point does not smear; back to full light.
      gl_FragColor = vec4(picked / max(1.0 - picked, 1e-3), 1.0);
    }`,
};

/** The jungle's depth haze (see FOCUS): its colour in the shade and toward the sun, kept with the
 * hour by the stage. */
export const jungleHaze = {
  uJungle: { value: new THREE.Vector3(0.06, 0.26, 0.22) },
  uJungleWarm: { value: new THREE.Vector3(0.58, 0.46, 0.1) },
  uJungleGold: goldenUniform,
  /** How thick the haze is: 1 by day, thinner as the light goes in the evening. */
  uJungleThick: { value: 1 },
};

/**
 * The film's depth of field: leaves and stems hanging right in front of the camera go soft, as the
 * film blurs what is nearest its camera, while everything from a few metres on stays sharp, the
 * characters always. Reads the scene's depth; keeps the picture's alpha (the characters' mark) for
 * the brushwork after it. With it, the film's jungle depth: what lies deep under the trees fades
 * with distance into a soft teal haze, golden toward the sun, as the film paints its jungle's
 * layers and the jungle seen from its village; the open, and a clearing seen through the trees,
 * stay clear.
 */
const FOCUS = {
  uniforms: {
    tDiffuse: { value: null },
    tDepth: { value: null },
    uTexel: { value: new THREE.Vector2(1, 1) },
    uNear: { value: 0.1 },
    uFar: { value: 2000 },
    uSharp: { value: 3.5 },
    uRadius: { value: 9.0 },
    uProj: { value: new THREE.Vector2(1, 1) },
    uCameraWorld: { value: new THREE.Matrix4() },
    uSun: { value: new THREE.Vector3(0, 1, 0) },
    uJungle: { value: new THREE.Vector3() },
    uJungleWarm: { value: new THREE.Vector3() },
    uJungleGold: { value: 0 },
    uJungleThick: { value: 1 },
    uCover: { value: null },
    uCoverMap: { value: new THREE.Vector3(0, 0, 1) },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: /* glsl */ `
    #include <packing>
    uniform sampler2D tDiffuse;
    uniform sampler2D tDepth;
    uniform vec2 uTexel;
    uniform float uNear;
    uniform float uFar;
    uniform float uSharp;
    uniform float uRadius;
    uniform vec2 uProj;
    uniform mat4 uCameraWorld;
    uniform vec3 uSun;
    uniform vec3 uJungle;
    uniform vec3 uJungleWarm;
    uniform float uJungleGold;
    uniform float uJungleThick;
    varying vec2 vUv;
    ${COVER_GLSL}
    float softness(vec2 uv) {
      float metres = -perspectiveDepthToViewZ(texture2D(tDepth, uv).x, uNear, uFar);
      return clamp((uSharp - metres) / (uSharp - 0.4), 0.0, 1.0);
    }
    // The jungle's depth haze over what is seen at uv: by how deep under the trees it lies and how
    // far off it is.
    vec3 jungleHaze(vec3 colour, vec2 uv) {
      float viewZ = perspectiveDepthToViewZ(texture2D(tDepth, uv).x, uNear, uFar);
      vec3 view = vec3((uv * 2.0 - 1.0) / uProj * -viewZ, viewZ);
      float metres = length(view);
      if (metres > 450.0) return colour;
      vec3 world = (uCameraWorld * vec4(view, 1.0)).xyz;
      float deep = smoothstep(0.2, 0.8, underTrees(world));
      // Only the depth: what is near stays dark and clear, as the film keeps its foreground. In the
      // golden hour it glows gold over more of the way toward the sun, as the film's late afternoon
      // fills its jungle with golden light; through the evening it thins as the light goes.
      float amount = deep * 0.85 * uJungleThick * (1.0 - exp(-0.04 * max(metres - 12.0, 0.0)));
      float sunward = pow(max(dot(normalize(world - uCameraWorld[3].xyz), uSun), 0.0), mix(3.0, 1.8, uJungleGold));
      return mix(colour, mix(uJungle, uJungleWarm, sunward), amount);
    }
    // The scene's light as it should be, whatever a shader let slip: never below black, NaN or a
    // blinding spike, which the brushwork and the glow would spread into a disc of coloured light.
    vec4 sceneAt(vec2 uv) {
      vec4 c = texture2D(tDiffuse, uv);
      c.rgb = any(isnan(c.rgb)) ? vec3(0.0) : clamp(c.rgb, 0.0, 4.0);
      return c;
    }
    void main() {
      vec4 here = sceneAt(vUv);
      here.rgb = jungleHaze(here.rgb, vUv);
      float soft = softness(vUv);
      if (here.a < 0.75 || soft < 0.01) {
        gl_FragColor = here;
        return;
      }
      vec3 sum = here.rgb;
      float weight = 1.0;
      for (int ring = 1; ring <= 3; ring++) {
        for (int k = 0; k < 8; k++) {
          float a = 6.2831853 * (float(k) + 0.5 * float(ring)) / 8.0;
          vec2 uv = vUv + vec2(cos(a), sin(a)) * (float(ring) / 3.0) * uRadius * soft * uTexel;
          vec4 c = sceneAt(uv);
          // Sharp things behind do not bleed forward into the blur, nor do the characters.
          float w = step(0.75, c.a) * max(softness(uv), 0.25);
          sum += c.rgb * w;
          weight += w;
        }
      }
      gl_FragColor = vec4(sum / weight, here.a);
    }`,
};

/**
 * Draws the scene through the film's finishing passes: rendered with antialiasing into a
 * high-precision picture, the jungle's depth hazed and what is nearest the camera softened, the
 * scenery's brushwork, a soft glow
 * round the brightest light (the hazy sky, sun on white), the colour grade, then out to the screen.
 */
export class FilmPost {
  private readonly composer: EffectComposer;
  private readonly bloom: UnrealBloomPass;
  /** The depth of field (see FOCUS). */
  readonly focus: ShaderPass;
  /** The brushwork (see PAINT). */
  readonly paint: ShaderPass;
  private readonly camera: THREE.Camera;

  constructor(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera) {
    this.camera = camera;
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    const target = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 4 });
    target.depthTexture = new THREE.DepthTexture(size.x, size.y);
    this.composer = new EffectComposer(renderer, target);
    this.composer.addPass(new RenderPass(scene, camera));
    this.focus = new ShaderPass(FOCUS);
    this.focus.uniforms.uTexel.value.set(1 / size.x, 1 / size.y);
    // The pass copies its uniforms; these are kept by the stage and the island.
    Object.assign(this.focus.uniforms, jungleHaze, coverUniforms, { uSun: sunUniform });
    this.composer.addPass(this.focus);
    this.paint = new ShaderPass(PAINT);
    this.paint.uniforms.uTexel.value.set(1 / size.x, 1 / size.y);
    this.composer.addPass(this.paint);
    // Only light brighter than white glows (the sun, the hazy sky), not white things in daylight.
    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), 0.32, 0.75, 1.0);
    this.composer.addPass(this.bloom);
    const grade = new ShaderPass(GRADE);
    // The pass copies its uniforms; the night is the stage's to keep (see nightUniform).
    grade.uniforms.uNight = nightUniform;
    grade.uniforms.uGolden = goldenUniform;
    this.composer.addPass(grade);
    this.composer.addPass(new OutputPass());
  }

  setSize(width: number, height: number, pixelRatio: number): void {
    this.composer.setPixelRatio(pixelRatio);
    this.composer.setSize(width, height);
    this.paint.uniforms.uTexel.value.set(1 / (width * pixelRatio), 1 / (height * pixelRatio));
    this.focus.uniforms.uTexel.value.set(1 / (width * pixelRatio), 1 / (height * pixelRatio));
  }

  render(): void {
    const camera = this.camera as THREE.PerspectiveCamera;
    this.focus.uniforms.uNear.value = camera.near;
    this.focus.uniforms.uFar.value = camera.far;
    this.focus.uniforms.uProj.value.set(camera.projectionMatrix.elements[0], camera.projectionMatrix.elements[5]);
    this.focus.uniforms.uCameraWorld.value.copy(camera.matrixWorld);
    // The scene is drawn into whichever picture is being read when the frame starts; the depth of
    // field reads that one's depth.
    this.focus.uniforms.tDepth.value = this.composer.readBuffer.depthTexture;
    this.composer.render();
  }
}
