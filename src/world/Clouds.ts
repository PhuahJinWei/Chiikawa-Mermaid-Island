import * as THREE from 'three';

/**
 * The film look's clouds, after its skies (the sea cliffs, the boat at sea, the sky over the palms)
 * and its aerial shot. Round the sky: towering cumulus, smaller cumulus, round puffs high up and long
 * flat banks along the horizon, each of its own shape, heaped of round lobes that run together into
 * one soft mass, as the film paints them: white where the light finds them and a pale sky-blue
 * turned from it, their lobes folding softly into one another, their flat bases in shade, their
 * edges soft, the low ones paling into the horizon's haze. Seen from high above (the aerial shot),
 * round clouds float below the camera round the island, where the film's shot has them, and their
 * shadows lie dark on the sea.
 *
 * Every cloud is a flat card facing the camera; its lobes are in a texture, and the card is shaded
 * as a surface heaped of a dome over each lobe, the domes blended where they meet so no seam shows
 * between them.
 */

/** The most lobes a cloud has (the lobe texture's width). */
const MAX_LOBES = 40;

type Kind = 'tower' | 'cumulus' | 'bank' | 'puff' | 'top';

/** How tall each kind stands for its width (in its own units, 2 across); a cloud seen from above
 * ('top') is round, as tall as it is wide. */
const HEIGHTS: Record<Kind, number> = { tower: 1.15, cumulus: 0.72, bank: 0.3, puff: 0.62, top: 2 };

type Lobe = [number, number, number, number];

function random(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * A cloud seen from the side, its lobes [x, y, radius, depth] in its own units: x across from -1 to
 * 1, y up from its flat base, depth toward the camera. A few big lobes make its body along the base;
 * columns of smaller ones rise from it to the top's outline; small ones heap along the top and down
 * its sides, the film's cauliflower bumps. The lower ones nearer, as a cloud seen from below shows
 * them.
 */
function sideLobes(kind: Exclude<Kind, 'top'>, rand: () => number): Lobe[] {
  const h = HEIGHTS[kind];
  const out: Lobe[] = [];
  const add = (x: number, y: number, r: number, z: number) => {
    const reach = CARD_X - 0.03 - r;
    if (out.length < MAX_LOBES) out.push([Math.min(Math.max(x, -reach), reach), y, r, z]);
  };
  // The top's outline: a dome, raised here and there into broad towers of its own.
  const towers = Array.from({ length: kind === 'bank' ? 3 : 2 + Math.floor(rand() * 2) }, () => ({
    at: rand() * 1.1 - 0.55,
    width: 0.22 + rand() * 0.22,
    rise: (0.2 + rand() * 0.4) * h,
  }));
  const top = (x: number): number => {
    const t = Math.max(0, 1 - Math.abs(x) ** 1.7);
    let v = h * (kind === 'bank' ? 0.8 : 0.55) * t ** 0.75;
    for (const tw of towers) v += tw.rise * Math.exp(-(((x - tw.at) / tw.width) ** 2)) * t;
    return Math.min(v, h);
  };
  const depth = (y: number) => 0.3 * (1 - y / h) + rand() * 0.06;
  // The body: big lobes side by side along the base, well under the top's outline, so the smaller
  // lobes above them make the cloud's bumpy top.
  const cores = kind === 'bank' ? 6 : kind === 'puff' ? 2 : 3 + Math.floor(rand() * 2);
  for (let i = 0; i < cores; i++) {
    const x = -0.62 + (1.24 * (i + 0.5 + (rand() - 0.5) * 0.4)) / cores;
    const cap = kind === 'tower' ? 0.42 : kind === 'bank' ? 0.2 : 0.34;
    const r = Math.min(Math.max(0.4 * top(x) + 0.05, 0.12), cap) * (0.85 + 0.25 * rand());
    add(x, r * 0.6, r, 0.42 + 0.08 * rand());
    // A lobe on each shoulder.
    if (kind !== 'bank') {
      for (const side of [-1, 1]) {
        const rs = r * (0.55 + 0.2 * rand());
        add(x + side * r * (0.85 + 0.2 * rand()), r * 0.6 + rs * (0.5 + 0.4 * rand()), rs, 0.36 + 0.06 * rand());
      }
    }
  }
  // Its ends along the base.
  for (const side of [-1, 1]) {
    const r = (kind === 'bank' ? 0.08 : 0.11) + 0.05 * rand();
    add(side * (0.8 + 0.08 * rand()), r * 0.7, r, 0.3);
  }
  // Columns from the body up to the top's outline, broad below and smaller as they rise.
  const columns = kind === 'bank' ? 0 : kind === 'puff' ? 2 : 5;
  for (let c = 0; c < columns; c++) {
    const x = -0.6 + (1.2 * (c + 0.5 + (rand() - 0.5) * 0.5)) / columns;
    const t = top(x);
    if (t < 0.35) continue;
    const count = Math.min(Math.max(Math.round(t / 0.32), 1), 3);
    for (let k = 1; k <= count; k++) {
      const f = k / count;
      const r = (0.26 - 0.1 * f) * Math.min(1, t / (0.6 * h)) * (0.8 + 0.4 * rand());
      const y = Math.min(0.2 + (t - 0.2) * f, t - r * 0.7);
      add(x + (rand() - 0.5) * 0.12, y, r, depth(y));
    }
  }
  // Cauliflower bumps along the top and down the sides, bulging out past the outline.
  const crown = kind === 'bank' ? 9 : kind === 'puff' ? 7 : 15;
  for (let i = 0; i < crown; i++) {
    const x = -0.9 + (1.8 * (i + 0.5 + (rand() - 0.5) * 0.6)) / crown;
    const t = top(x);
    if (t < 0.1) continue;
    const r = (0.05 + rand() * 0.06) * (1 + 0.7 * (t / h));
    add(x, Math.max(t - r * 0.45, r * 0.7), r, depth(t) - 0.05);
  }
  return out;
}

/** A cloud seen from above, round: a big middle, broad lobes round it and a few softer bumps round
 * its edge, a cauliflower from above, the middle nearest the camera. */
function topLobes(rand: () => number): Lobe[] {
  const out: Lobe[] = [[0, 0, 0.48 + 0.1 * rand(), 0.55]];
  const ring = 6;
  for (let k = 0; k < ring; k++) {
    const a = (2 * Math.PI * k) / ring + (rand() - 0.5) * 0.6;
    const d = 0.38 + 0.14 * rand();
    out.push([Math.cos(a) * d * 1.15, Math.sin(a) * d * 0.85, 0.3 + 0.12 * rand(), 0.42]);
  }
  const edge = 9;
  for (let k = 0; k < edge; k++) {
    const a = (2 * Math.PI * k) / edge + (rand() - 0.5) * 0.4;
    const d = 0.68 + 0.12 * rand();
    out.push([Math.cos(a) * d * 1.1, Math.sin(a) * d * 0.8, 0.15 + 0.1 * rand(), 0.3]);
  }
  return out;
}

/** How far a cloud's card reaches across, in its own units (its lobes stay inside). */
const CARD_X = 1.35;

interface Card {
  kind: Kind;
  /** The cloud's middle (sky clouds: round the camera; aerial ones: in the world). */
  centre: THREE.Vector3;
  width: number;
  /** How far it pales into the horizon's haze. */
  haze: number;
}

/** The sky's clouds round the camera, each kind in its own band of the sky. */
function skyCards(): Card[] {
  const rand = random(20261018);
  const out: Card[] = [];
  const deg = Math.PI / 180;
  const ring = (count: number, make: () => { kind: Kind; elevation: number; width: number; distance: number }) => {
    const offset = rand() * Math.PI * 2;
    for (let i = 0; i < count; i++) {
      const azimuth = offset + ((i + 0.5 * rand()) / count) * Math.PI * 2;
      const { kind, elevation, width, distance } = make();
      const e = elevation * deg;
      const centre = new THREE.Vector3(Math.sin(azimuth) * Math.cos(e), Math.sin(e), -Math.cos(azimuth) * Math.cos(e));
      out.push({ kind, centre: centre.multiplyScalar(distance), width, haze: 0.55 * (1 - THREE.MathUtils.smoothstep(e, 0.02, 0.2)) });
    }
  };
  // Long flat banks along the horizon, far off.
  ring(9, () => ({ kind: 'bank', elevation: 1.2 + rand() * 4, width: 130 + rand() * 120, distance: 560 }));
  // Big cumulus rising from near the horizon all round, some of them towering.
  ring(12, () => ({ kind: rand() < 0.35 ? 'tower' : 'cumulus', elevation: 2.5 + rand() * 9, width: 120 + rand() * 90, distance: 480 }));
  // Middle-sized cumulus higher up.
  ring(14, () => ({ kind: 'cumulus', elevation: 12 + rand() * 20, width: 70 + rand() * 65, distance: 420 }));
  // Round puffs scattered high overhead.
  ring(9, () => ({ kind: 'puff', elevation: 24 + rand() * 30, width: 32 + rand() * 32, distance: 380 }));
  return out;
}

/**
 * The clouds below the camera seen from high above: placed where the film's aerial shot has them,
 * through the camera matched to it (DevTools' 'aerial' shot), each at a point in the frame (across
 * and down, 0 to 1), its width there (of the frame's), and how high it floats; and a few more round
 * the island for other high views.
 */
function aerialCards(): Card[] {
  const eye = new THREE.Vector3(-78.73, 395.19, 427.39);
  const look = new THREE.Vector3(0.4, 0, -72.21);
  const forward = look.clone().sub(eye).normalize();
  const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();
  const up = new THREE.Vector3().crossVectors(right, forward);
  const tan = Math.tan(THREE.MathUtils.degToRad(10));
  const aspect = 1.86;
  const shot: [number, number, number, number][] = [
    [0.05, 0.72, 0.14, 230], [0.11, 0.93, 0.12, 250], [0.93, 0.22, 0.16, 210], [0.78, 0.13, 0.11, 190],
    [0.04, 0.2, 0.1, 200], [0.13, 0.08, 0.08, 180], [0.22, 0.95, 0.09, 260], [0.64, 0.09, 0.06, 170],
  ];
  const out: Card[] = shot.map(([u, v, w, altitude]) => {
    const ray = forward
      .clone()
      .addScaledVector(right, (2 * u - 1) * tan * aspect)
      .addScaledVector(up, (1 - 2 * v) * tan)
      .normalize();
    const t = (eye.y - altitude) / -ray.y;
    return { kind: 'top', centre: eye.clone().addScaledVector(ray, t), width: w * 2 * tan * aspect * t, haze: 0 };
  });
  // More round the island (its middle about -35, -140), over the sea.
  const rand = random(4242);
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + rand() * 0.4;
    const d = 240 + rand() * 70;
    out.push({
      kind: 'top',
      centre: new THREE.Vector3(-35 + Math.cos(a) * d, 170 + rand() * 80, -140 + Math.sin(a) * d),
      width: 45 + rand() * 40,
      haze: 0,
    });
  }
  return out;
}

const FRAG = /* glsl */ `
uniform sampler2D uLobes;
uniform vec3 uLit;
uniform vec3 uShade;
uniform vec3 uHorizon;
uniform float uFade;
varying vec2 vLocal;
varying vec4 vCloud;
varying vec3 vLight;
void main() {
  int row = int(vCloud.x + 0.5);
  int count = int(vCloud.y + 0.5);
  float height = vCloud.w;
  bool fromAbove = height > 1.5;
  // The cloud's surface: a dome over each lobe, the domes blended where they meet (the nearer one
  // most), so the lobes fold softly into one another; and its outline, round all of them.
  float outline = 1e5;
  float top = -1e5;
  float weight = 0.0;
  vec3 normal = vec3(0.0);
  float lobeY = 0.0;
  for (int i = 0; i < ${MAX_LOBES}; i++) {
    if (i >= count) break;
    vec4 lobe = texelFetch(uLobes, ivec2(i, row), 0);
    vec2 d = vLocal - lobe.xy;
    float dd = dot(d, d);
    float r2 = lobe.z * lobe.z;
    outline = min(outline, sqrt(dd) - lobe.z);
    if (dd < r2) {
      // Each lobe a ball, a little flattened toward the camera; where lobes overlap, the nearer
      // surface counts most, blended into the other's so they fold softly into one another.
      float rise = sqrt(1.0 - dd / r2);
      float h = lobe.w + lobe.z * rise;
      if (h > top) {
        float s = exp(24.0 * (top - h));
        weight *= s;
        normal *= s;
        lobeY *= s;
        top = h;
      }
      float e = exp(24.0 * (h - top)) * smoothstep(0.0, 0.3, rise);
      weight += e;
      normal += e * normalize(vec3(d / lobe.z, (fromAbove ? 1.1 : 1.35) * rise));
      lobeY += e * lobe.y;
    }
  }
  lobeY /= max(weight, 1e-6);
  vec3 n = normalize(normal + vec3(0.0, 0.0, 1e-4));
  // A soft edge, softer on the clouds seen from above; a cloud seen from the side is cut flat at
  // its base.
  float aa = fwidth(outline);
  float feather = fromAbove ? 0.05 : 0.012;
  float alpha = 1.0 - smoothstep(-aa - feather, aa + 0.003, outline);
  if (!fromAbove) alpha *= smoothstep(-0.01, 0.05, vLocal.y - 0.018 * sin(vLocal.x * 11.0 + vCloud.x * 1.7));
  alpha *= uFade;
  if (alpha < 0.004) discard;
  // White where the light finds it, the pale shade turned from it, a soft band between; seen from
  // the side its base lies in shade and its low lobes a little darker.
  vec3 l = normalize(vLight);
  float lit = smoothstep(fromAbove ? 0.25 : -0.12, fromAbove ? 0.75 : 0.42, dot(n, l));
  if (!fromAbove) {
    lit *= mix(0.5, 1.0, smoothstep(0.0, max(0.2 * height, 0.07), vLocal.y));
    lit *= mix(0.86, 1.0, smoothstep(0.0, 0.55 * height, lobeY));
  }
  vec3 col = mix(uShade, uLit, lit);
  // With the light behind the cloud, its very edge glows a little.
  col = mix(col, uLit, 0.35 * smoothstep(-0.035, -0.004, outline) * smoothstep(0.1, -0.5, l.z));
  col = mix(col, uHorizon, vCloud.z);
  gl_FragColor = vec4(col, alpha);
  #include <colorspace_fragment>
}`;

/** The sky's clouds: cards fixed round the camera (the group they are in follows it), each facing
 * it, with their own axes for the light. */
const SKY_VERT = /* glsl */ `
attribute vec2 aLocal;
attribute vec4 aCloud;   // row in the lobe texture, how many lobes, haze, height
attribute vec3 aRight;
attribute vec3 aUp;
attribute vec3 aFacing;
uniform vec3 uLightDir;
varying vec2 vLocal;
varying vec4 vCloud;
varying vec3 vLight;
void main() {
  vLocal = aLocal;
  vCloud = aCloud;
  // The light's way in the cloud's own frame: across, up, and toward the camera.
  vLight = vec3(dot(uLightDir, aRight), dot(uLightDir, aUp), dot(uLightDir, aFacing));
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

/** The aerial clouds: fixed in the world, each card turned square to the camera wherever it is. */
const AERIAL_VERT = /* glsl */ `
attribute vec2 aLocal;
attribute vec4 aCloud;
attribute float aHalf;
uniform vec3 uLightDir;
varying vec2 vLocal;
varying vec4 vCloud;
varying vec3 vLight;
void main() {
  vLocal = aLocal;
  vCloud = aCloud;
  vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
  vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
  vec3 back = vec3(viewMatrix[0][2], viewMatrix[1][2], viewMatrix[2][2]);
  vLight = vec3(dot(uLightDir, right), dot(uLightDir, up), dot(uLightDir, back));
  vec3 p = position + (right * aLocal.x + up * aLocal.y) * aHalf;
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}`;

/** The aerial clouds' shadows on the sea: soft dark patches, each where its cloud's shadow falls, its
 * colour the sea's in shade, in the hour's light on the sea (uSeaLight). */
const SHADOW_VERT = /* glsl */ `
attribute vec2 aLocal;
varying vec2 vLocal;
void main() {
  vLocal = aLocal;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
const SHADOW_FRAG = /* glsl */ `
uniform vec3 uShadow;
uniform vec3 uSeaLight;
uniform float uFade;
varying vec2 vLocal;
void main() {
  float r = length(vLocal * vec2(1.0, 1.25));
  float wobble = 0.08 * sin(atan(vLocal.y, vLocal.x) * 5.0 + vLocal.x * 3.0);
  float alpha = (1.0 - smoothstep(0.55, 1.0, r + wobble)) * 0.42 * uFade;
  if (alpha < 0.004) discard;
  gl_FragColor = vec4(uShadow * uSeaLight, alpha);
  #include <colorspace_fragment>
}`;

/** From how high up the aerial clouds show, fading in over the second figure. */
const AERIAL_FROM = 110;
const AERIAL_OVER = 60;

export class FilmClouds {
  /** The sky's clouds, to be kept round the camera. */
  readonly mesh: THREE.Mesh;
  /** The clouds below the camera from high above, and their shadows: fixed in the world. */
  readonly aerial = new THREE.Group();
  private readonly uniforms: {
    uLobes: THREE.IUniform<THREE.DataTexture>;
    uLit: THREE.IUniform<THREE.Color>;
    uShade: THREE.IUniform<THREE.Color>;
    uHorizon: THREE.IUniform<THREE.Color>;
    uFade: THREE.IUniform<number>;
    uLightDir: THREE.IUniform<THREE.Vector3>;
  };
  private readonly aerialFade = { value: 0 };
  private readonly shadowFade = { value: 0 };
  private readonly shadows: THREE.Mesh;
  private readonly aerialCards: Card[];
  private shadowStrength = 1;

  /** `horizon` is the sky's horizon colour (shared with the sky, so the clouds pale into its haze);
   * `seaLight` the hour's light on the sea (shared with it), which the aerial clouds' shadows on it lie
   * in. */
  constructor(horizon: THREE.IUniform<THREE.Color>, seaLight: THREE.IUniform<THREE.Color>) {
    const sky = skyCards().sort((a, b) => b.centre.length() - a.centre.length());
    this.aerialCards = aerialCards();
    const rows = sky.length + this.aerialCards.length;
    const data = new Float32Array(MAX_LOBES * rows * 4);
    const rand = random(7);
    const lobesOf = (card: Card, row: number): number => {
      const seeded = random(1000 + row * 97 + Math.floor(rand() * 1000));
      const list = card.kind === 'top' ? topLobes(seeded) : sideLobes(card.kind, seeded);
      list.forEach((l, i) => data.set(l, (row * MAX_LOBES + i) * 4));
      return list.length;
    };
    const texture = new THREE.DataTexture(data, MAX_LOBES, rows, THREE.RGBAFormat, THREE.FloatType);
    this.uniforms = {
      uLobes: { value: texture },
      uLit: { value: new THREE.Color(1, 1, 1) },
      uShade: { value: new THREE.Color(0.6, 0.75, 0.86) },
      uHorizon: horizon,
      uFade: { value: 1 },
      uLightDir: { value: new THREE.Vector3(0, 1, 0) },
    };

    // The sky's clouds: one mesh of cards round the camera, the farthest drawn first.
    const skyGeometry = this.buildSky(sky, lobesOf);
    this.mesh = new THREE.Mesh(
      skyGeometry,
      new THREE.ShaderMaterial({
        uniforms: this.uniforms,
        vertexShader: SKY_VERT,
        fragmentShader: FRAG,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -1;

    // The aerial clouds and their shadows.
    const aerialGeometry = this.buildAerial(sky.length, lobesOf);
    texture.needsUpdate = true;
    const aerialClouds = new THREE.Mesh(
      aerialGeometry,
      new THREE.ShaderMaterial({
        uniforms: { ...this.uniforms, uFade: this.aerialFade },
        vertexShader: AERIAL_VERT,
        fragmentShader: FRAG,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );
    aerialClouds.frustumCulled = false;
    this.shadows = new THREE.Mesh(
      this.buildShadows(),
      new THREE.ShaderMaterial({
        uniforms: { uShadow: { value: new THREE.Color('#0B4A52') }, uSeaLight: seaLight, uFade: this.shadowFade },
        vertexShader: SHADOW_VERT,
        fragmentShader: SHADOW_FRAG,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );
    this.shadows.frustumCulled = false;
    this.aerial.add(this.shadows, aerialClouds);
    this.aerial.visible = false;
  }

  private buildSky(cards: Card[], lobesOf: (card: Card, row: number) => number): THREE.BufferGeometry {
    const positions: number[] = [];
    const local: number[] = [];
    const info: number[] = [];
    const right: number[] = [];
    const up: number[] = [];
    const facing: number[] = [];
    const index: number[] = [];
    const rand = random(11);
    const worldUp = new THREE.Vector3(0, 1, 0);
    cards.forEach((card, row) => {
      const count = lobesOf(card, row);
      const h = HEIGHTS[card.kind];
      // The card faces the camera square on, so a cloud high overhead is not squashed; its base
      // stays level across the view.
      const toward = card.centre.clone().negate().normalize();
      const across = new THREE.Vector3().crossVectors(worldUp, toward).normalize();
      const rise = new THREE.Vector3().crossVectors(toward, across).normalize();
      if (rand() < 0.5) across.negate();
      const half = card.width / 2;
      const first = positions.length / 3;
      for (const [u, v] of [[-CARD_X, -0.04], [CARD_X, -0.04], [CARD_X, h + 0.32], [-CARD_X, h + 0.32]]) {
        const p = card.centre.clone().addScaledVector(across, u * half).addScaledVector(rise, v * half);
        positions.push(p.x, p.y, p.z);
        local.push(u, v);
        info.push(row, count, card.haze, h);
        right.push(across.x, across.y, across.z);
        up.push(rise.x, rise.y, rise.z);
        facing.push(toward.x, toward.y, toward.z);
      }
      index.push(first, first + 1, first + 2, first, first + 2, first + 3);
    });
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('aLocal', new THREE.Float32BufferAttribute(local, 2));
    geometry.setAttribute('aCloud', new THREE.Float32BufferAttribute(info, 4));
    geometry.setAttribute('aRight', new THREE.Float32BufferAttribute(right, 3));
    geometry.setAttribute('aUp', new THREE.Float32BufferAttribute(up, 3));
    geometry.setAttribute('aFacing', new THREE.Float32BufferAttribute(facing, 3));
    geometry.setIndex(index);
    return geometry;
  }

  private buildAerial(firstRow: number, lobesOf: (card: Card, row: number) => number): THREE.BufferGeometry {
    const positions: number[] = [];
    const local: number[] = [];
    const info: number[] = [];
    const halves: number[] = [];
    const index: number[] = [];
    this.aerialCards.forEach((card, i) => {
      const row = firstRow + i;
      const count = lobesOf(card, row);
      const first = positions.length / 3;
      for (const [u, v] of [[-CARD_X, -1.15], [CARD_X, -1.15], [CARD_X, 1.15], [-CARD_X, 1.15]]) {
        positions.push(card.centre.x, card.centre.y, card.centre.z);
        local.push(u, v);
        info.push(row, count, 0, HEIGHTS.top);
        halves.push(card.width / 2);
      }
      index.push(first, first + 1, first + 2, first, first + 2, first + 3);
    });
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('aLocal', new THREE.Float32BufferAttribute(local, 2));
    geometry.setAttribute('aCloud', new THREE.Float32BufferAttribute(info, 4));
    geometry.setAttribute('aHalf', new THREE.Float32BufferAttribute(halves, 1));
    geometry.setIndex(index);
    return geometry;
  }

  /** Flat patches on the sea, one under each aerial cloud, moved to where its shadow falls as the
   * sun moves (see setHour). */
  private buildShadows(): THREE.BufferGeometry {
    const geometry = new THREE.BufferGeometry();
    const count = this.aerialCards.length;
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(count * 4 * 3), 3));
    const local: number[] = [];
    const index: number[] = [];
    for (let i = 0; i < count; i++) {
      local.push(-1, -1, 1, -1, 1, 1, -1, 1);
      index.push(i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3);
    }
    geometry.setAttribute('aLocal', new THREE.Float32BufferAttribute(local, 2));
    geometry.setIndex(index);
    return geometry;
  }

  /**
   * The hour's colours: `tint` lays the hour over the clouds (golden, rosy, the night's blue), their
   * shade is a pale mix of it and the sky's own colour, as the film's shadows on its clouds are the
   * sky's blue; `night` (0 to 1) lifts their tops toward the moon's pale light; `lightDir` points to
   * the sun or the moon, and the aerial clouds' shadows fall away from it onto the sea at `sea`.
   */
  setHour(tint: THREE.Color, top: THREE.Color, horizon: THREE.Color, night: number, lightDir: THREE.Vector3, sea: number): void {
    const u = this.uniforms;
    u.uLit.value.copy(tint).lerp(MOONLIT, night);
    _sky.copy(top).lerp(horizon, 0.5);
    u.uShade.value.copy(u.uLit.value).lerp(_sky, 0.42).multiplyScalar(0.95);
    u.uLightDir.value.copy(lightDir);
    const position = this.shadows.geometry.getAttribute('position') as THREE.BufferAttribute;
    const down = Math.max(lightDir.y, 0.2);
    this.aerialCards.forEach((card, i) => {
      const fall = (card.centre.y - sea) / down;
      const x = card.centre.x - lightDir.x * fall;
      const z = card.centre.z - lightDir.z * fall;
      const half = card.width * 0.75;
      [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([cx, cz], k) =>
        position.setXYZ(i * 4 + k, x + cx * half, sea + 0.4, z + cz * half),
      );
    });
    position.needsUpdate = true;
    // No shadows from the moon, nor in the evening's low sun.
    this.shadowStrength = (1 - night) * THREE.MathUtils.smoothstep(lightDir.y, 0.15, 0.4);
  }

  /** The light on the clouds put out, till the hour is next set (see Stage.darkTest). */
  putOut(): void {
    this.uniforms.uLit.value.setRGB(0, 0, 0);
    this.uniforms.uShade.value.setRGB(0, 0, 0);
  }

  /** Each frame: the aerial clouds shown only from high above. */
  update(camera: THREE.Camera): void {
    const fade = THREE.MathUtils.smoothstep(camera.position.y, AERIAL_FROM, AERIAL_FROM + AERIAL_OVER);
    this.aerialFade.value = fade;
    this.shadowFade.value = fade * this.shadowStrength;
    this.aerial.visible = fade > 0;
  }
}

const MOONLIT = new THREE.Color(0.11, 0.17, 0.4);
const _sky = new THREE.Color();
