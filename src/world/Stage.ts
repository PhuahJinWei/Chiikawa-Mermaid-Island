import * as THREE from 'three';
import { toonRamp } from '../core/toon';
import { loadProp } from './PropModels';
import { PEN_GLSL, addOutline, inkUniforms } from './Ink';

/** A small sandy test island for Milestone 0. The real island arrives in Milestone 1. */
export const SAND_RADIUS = 19;
export const PLAY_RADIUS = 18.5;
const WATER_LEVEL = -0.32;
/** The sea is a disc this wide, so its far edge (the horizon line) is the same distance away all round. */
const SEA_RADIUS = 600;

// Sampled from the film's beach frames.
const COLORS = {
  sand: '#F0C28B',
  sandPatch: '#E3A770',
  wetSand: '#D9A774',
  skyTop: '#3FA9F2',
  skyHorizon: '#BDE6F8',
  sun: '#FFF4E2',
  shallow: '#0DAE9E',
  mid: '#1590C2',
  deep: '#1A6FB2',
  foam: '#F4FFFC',
  cloud: '#FFFFFF',
  cloudShade: '#DCE4EC',
};
const CONFETTI = ['#F0C866', '#F4A9B8', '#9FD3F0', '#F29E6B', '#FFFFFF', '#B9E58C'];

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export function groundHeight(x: number, z: number): number {
  const d = Math.hypot(x, z);
  const beach = smoothstep(SAND_RADIUS, SAND_RADIUS + 8, d);
  const ripple = 0.02 * Math.sin(x * 0.45 + 1.3) * Math.sin(z * 0.38 - 0.7) * (1 - beach);
  return ripple - 1.7 * beach;
}

export function clampToPlayArea(p: THREE.Vector3): void {
  const d = Math.hypot(p.x, p.z);
  if (d > PLAY_RADIUS) {
    p.x *= PLAY_RADIUS / d;
    p.z *= PLAY_RADIUS / d;
  }
}

function shoreRadius(): number {
  let lo = SAND_RADIUS;
  let hi = SAND_RADIUS + 8;
  for (let i = 0; i < 30; i++) {
    const mid = (lo + hi) / 2;
    if (-1.7 * smoothstep(SAND_RADIUS, SAND_RADIUS + 8, mid) > WATER_LEVEL) lo = mid;
    else hi = mid;
  }
  return lo;
}

function toon(params: THREE.MeshToonMaterialParameters = {}): THREE.MeshToonMaterial {
  return new THREE.MeshToonMaterial({ gradientMap: toonRamp(), ...params });
}

export class Stage {
  private readonly water: THREE.ShaderMaterial;
  private readonly sky: THREE.Mesh;
  private readonly skyMaterial: THREE.ShaderMaterial;
  private readonly world: THREE.Group;

  constructor(scene: THREE.Scene) {
    scene.background = new THREE.Color(COLORS.skyHorizon);
    scene.fog = new THREE.Fog(COLORS.skyHorizon, 60, 320);

    const hemi = new THREE.HemisphereLight('#DDF3FF', '#EBC48F', 1.6);
    const sun = new THREE.DirectionalLight(COLORS.sun, 2.4);
    sun.position.set(20, 40, 14);
    scene.add(hemi, sun);

    this.skyMaterial = this.makeSkyMaterial(sun.position);
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(500, 32, 16), this.skyMaterial);
    this.sky.renderOrder = -1;
    this.sky.frustumCulled = false;
    scene.add(this.sky);

    const world = new THREE.Group();
    world.add(this.makeGround());
    this.water = this.makeWaterMaterial();
    const waterGeo = new THREE.CircleGeometry(SEA_RADIUS, 128).rotateX(-Math.PI / 2).translate(0, WATER_LEVEL, 0);
    world.add(new THREE.Mesh(waterGeo, this.water));
    world.add(this.makeClouds());
    world.add(this.makeConfetti());
    scene.add(world);
    this.world = world;
  }

  /** Adds the Blender-made palms, starfish and log. */
  async loadProps(): Promise<void> {
    const [palm, starfish, log] = await Promise.all([loadProp('palm'), loadProp('starfish'), loadProp('log')]);
    const palmMaterial = toon({ vertexColors: true });
    const palms: [number, number, number, number][] = [
      [-12.5, -9.5, 0.97, 0.4],
      [13.5, -7, 1.07, 2.4],
      [-7, 13, 0.86, 4.2],
    ];
    for (const [x, z, scale, turn] of palms) {
      const mesh = new THREE.Mesh(palm, palmMaterial);
      mesh.position.set(x, groundHeight(x, z) - 0.05, z);
      mesh.scale.setScalar(scale);
      mesh.rotation.y = turn;
      this.world.add(mesh);
      addOutline(mesh);
    }
    const stars = this.makeStarfish(starfish);
    this.world.add(stars);
    addOutline(stars);
    const logMesh = new THREE.Mesh(log, toon({ vertexColors: true }));
    logMesh.position.set(-3.8, groundHeight(-3.8, 2.2), 2.2);
    logMesh.rotation.y = 0.5;
    this.world.add(logMesh);
    addOutline(logMesh);
  }

  update(camera: THREE.Camera, time: number): void {
    this.water.uniforms.uTime.value = time;
    this.sky.position.copy(camera.position);
    // Where the sea's far edge meets the sky, as seen from the camera: the horizon line.
    const above = camera.position.y - WATER_LEVEL;
    const reach = SEA_RADIUS - Math.hypot(camera.position.x, camera.position.z);
    this.skyMaterial.uniforms.uHorizonY.value = Math.sin(-Math.atan2(above, reach));
  }

  private makeGround(): THREE.Mesh {
    const geo = new THREE.PlaneGeometry(80, 80, 100, 100).rotateX(-Math.PI / 2);
    const pos = geo.getAttribute('position') as THREE.BufferAttribute;
    const colors = new Float32Array(pos.count * 3);
    const sand = new THREE.Color(COLORS.sand);
    const patch = new THREE.Color(COLORS.sandPatch);
    const wet = new THREE.Color(COLORS.wetSand);
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      pos.setY(i, groundHeight(x, z));
      const d = Math.hypot(x, z);
      // Soft painted patches, like the brushwork on the film's sand.
      const blob =
        Math.sin(x * 0.31 + 1.2) * Math.sin(z * 0.27 - 0.4) +
        0.6 * Math.sin(x * 0.67 - z * 0.41 + 2.1) * Math.sin(z * 0.59 + x * 0.13);
      c.copy(sand).lerp(patch, smoothstep(0.35, 1.1, blob) * 0.55);
      c.lerp(wet, smoothstep(SAND_RADIUS + 0.6, SAND_RADIUS + 2.4, d));
      colors.set([c.r, c.g, c.b], i * 3);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    // The sand sits a hair back in the depth test, so outlines where things touch the ground
    // (a log's underside, a starfish's rim, a character's feet) are drawn over it, not under it.
    const material = new THREE.MeshBasicMaterial({
      vertexColors: true,
      polygonOffset: true,
      polygonOffsetFactor: 8,
      polygonOffsetUnits: 8,
    });
    return new THREE.Mesh(geo, material);
  }

  private makeWaterMaterial(): THREE.ShaderMaterial {
    // No fog: the sea keeps its blue right up to the horizon line, as in the film.
    return new THREE.ShaderMaterial({
      uniforms: {
        ...inkUniforms,
        uTime: { value: 0 },
        uShore: { value: shoreRadius() },
        uShallow: { value: new THREE.Color(COLORS.shallow) },
        uMid: { value: new THREE.Color(COLORS.mid) },
        uDeep: { value: new THREE.Color(COLORS.deep) },
        uFoam: { value: new THREE.Color(COLORS.foam) },
      },
      vertexShader: /* glsl */ `
        varying vec3 vWorld;
        varying float vDepth;
        void main() {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vWorld = wp.xyz;
          vec4 mvPosition = viewMatrix * wp;
          vDepth = -mvPosition.z;
          gl_Position = projectionMatrix * mvPosition;
        }`,
      fragmentShader: /* glsl */ `
        ${PEN_GLSL}
        uniform vec3 uInk;
        uniform float uTime;
        uniform float uShore;
        uniform vec3 uShallow;
        uniform vec3 uMid;
        uniform vec3 uDeep;
        uniform vec3 uFoam;
        varying vec3 vWorld;
        varying float vDepth;
        float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        void main() {
          float d = length(vWorld.xz);
          float t = clamp((d - uShore) / 45.0, 0.0, 1.0);
          vec3 col = mix(uShallow, uMid, smoothstep(0.0, 0.3, t));
          col = mix(col, uDeep, smoothstep(0.25, 1.0, t));
          col += (sin(d * 1.3 - uTime * 0.9) * 0.5 + 0.5) * 0.035 * (1.0 - t);
          float wave = uShore + 0.3 + 0.25 * sin(uTime * 0.8);
          float foam = 1.0 - smoothstep(0.0, 0.4, abs(d - wave));
          float foam2 = 1.0 - smoothstep(0.0, 0.22, abs(d - (wave + 1.2 + 0.2 * sin(uTime * 0.8 + 1.7))));
          col = mix(col, uFoam, max(foam * 0.85, foam2 * 0.45));
          vec2 cell = floor(vWorld.xz * 1.6);
          float sparkle = step(0.986, hash(cell + floor(uTime * 1.5))) * (1.0 - smoothstep(0.0, 0.8, t));
          float dotMask = 1.0 - smoothstep(0.05, 0.18, length(fract(vWorld.xz * 1.6) - 0.5));
          col = mix(col, vec3(1.0), sparkle * dotMask);
          // The waterline, drawn with the pen where the sea meets the sand.
          float outside = (d - uShore) / max(fwidth(d), 1e-5);
          float pen = penAt(vDepth);
          col = mix(col, uInk, (1.0 - smoothstep(pen - 0.5, pen + 0.5, outside)) * step(-1.0, outside));
          gl_FragColor = vec4(col, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
  }

  private makeSkyMaterial(sunPosition: THREE.Vector3): THREE.ShaderMaterial {
    return new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        ...inkUniforms,
        uHorizonY: { value: 0 },
        uTop: { value: new THREE.Color(COLORS.skyTop) },
        uHorizon: { value: new THREE.Color(COLORS.skyHorizon) },
        uSunColor: { value: new THREE.Color(COLORS.sun) },
        uSunDir: { value: sunPosition.clone().normalize() },
      },
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          p.z = p.w * 0.9999;
          gl_Position = p;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uTop;
        uniform vec3 uHorizon;
        uniform vec3 uSunColor;
        uniform vec3 uSunDir;
        uniform vec3 uInk;
        uniform float uPen;
        uniform float uHorizonY;
        varying vec3 vDir;
        void main() {
          vec3 dir = normalize(vDir);
          float h = clamp(dir.y, 0.0, 1.0);
          vec3 col = mix(uHorizon, uTop, pow(h, 0.55));
          float s = max(dot(dir, uSunDir), 0.0);
          col += uSunColor * (pow(s, 400.0) * 1.5 + pow(s, 12.0) * 0.12);
          // The horizon line, drawn with the pen just above the sea's far edge.
          float above = (dir.y - uHorizonY) / max(fwidth(dir.y), 1e-6);
          col = mix(col, uInk, (1.0 - smoothstep(uPen - 0.5, uPen + 0.5, above)) * step(-2.0, above));
          gl_FragColor = vec4(col, 1.0);
          #include <colorspace_fragment>
        }`,
    });
  }

  /**
   * Cartoon clouds: round puffs on a flat base, white tops over a blue-grey underside, outlined
   * with the pen. Drawn from circles in the shader, so the outline stays crisp at any size.
   */
  private makeClouds(): THREE.Group {
    // Puffs in a 512 x 256 box, y down: x, y, radius.
    const puffs: [number, number, number][] = [
      [120, 170, 70],
      [190, 120, 88],
      [285, 105, 96],
      [370, 135, 78],
      [430, 172, 52],
      [250, 175, 70],
    ];
    const material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      defines: { PUFFS: puffs.length },
      uniforms: {
        ...inkUniforms,
        uPuffs: { value: puffs.map(([x, y, r]) => new THREE.Vector3(x, y, r)) },
        uCloud: { value: new THREE.Color(COLORS.cloud) },
        uShade: { value: new THREE.Color(COLORS.cloudShade) },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uPuffs[PUFFS];
        uniform vec3 uCloud;
        uniform vec3 uShade;
        uniform vec3 uInk;
        uniform float uPen;
        varying vec2 vUv;
        void main() {
          vec2 p = vec2(vUv.x * 512.0, (1.0 - vUv.y) * 256.0);
          float shade = 1e5;
          float white = 1e5;
          for (int i = 0; i < PUFFS; i++) {
            vec3 c = uPuffs[i];
            shade = min(shade, length(p - vec2(c.x, c.y + 10.0)) - c.z);
            white = min(white, length(p - vec2(c.x - 4.0, c.y - 4.0)) - c.z * 0.92);
          }
          // A flat base under the puffs.
          vec2 b = abs(p - vec2(278.0, 205.0)) - vec2(160.0, 17.0);
          float base = length(max(b, 0.0)) + min(max(b.x, b.y), 0.0);
          float body = max(min(min(shade, white), base), p.y - 222.0);
          float px = body / max(fwidth(body), 1e-4);       // pixels outside the cloud
          float inside = 1.0 - smoothstep(-0.5, 0.5, px);
          float alpha = 1.0 - smoothstep(uPen - 0.5, uPen + 0.5, px);
          float top = 1.0 - smoothstep(-0.5, 0.5, white / max(fwidth(white), 1e-4));
          vec3 col = mix(uInk, mix(uShade, uCloud, top), inside);
          gl_FragColor = vec4(col, alpha);
          #include <colorspace_fragment>
        }`,
    });
    const group = new THREE.Group();
    const spots: [number, number, number][] = [
      [0.15, 52, 210],
      [0.95, 64, 170],
      [-0.7, 46, 190],
      [1.9, 38, 160],
      [2.8, 58, 200],
      [3.7, 44, 180],
      [4.6, 62, 170],
      [5.5, 40, 190],
    ];
    const plane = new THREE.PlaneGeometry(1, 0.5);
    spots.forEach(([angle, height, width], i) => {
      const cloud = new THREE.Mesh(plane, material);
      cloud.position.set(Math.sin(angle) * 300, height, -Math.cos(angle) * 300);
      cloud.lookAt(0, height, 0);
      // Every other cloud mirrored, so the sky is not one cloud repeated.
      cloud.scale.set(i % 2 ? -width : width, width, 1);
      cloud.renderOrder = -1;
      group.add(cloud);
    });
    return group;
  }

  /** Paper confetti from the welcome festival, scattered on the sand. */
  private makeConfetti(): THREE.InstancedMesh {
    const count = 320;
    const geo = new THREE.PlaneGeometry(0.07, 0.05).rotateX(-Math.PI / 2);
    const mesh = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }), count);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const pos = new THREE.Vector3();
    const scale = new THREE.Vector3();
    let seed = 7;
    const rand = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    for (let i = 0; i < count; i++) {
      const r = 7 * Math.pow(rand(), 0.7);
      const a = rand() * Math.PI * 2;
      pos.set(Math.cos(a) * r, 0, Math.sin(a) * r);
      pos.y = groundHeight(pos.x, pos.z) + 0.006;
      q.setFromAxisAngle(up, rand() * Math.PI);
      const k = 0.8 + rand() * 0.6;
      scale.set(k, 1, k);
      m.compose(pos, q, scale);
      mesh.setMatrixAt(i, m);
      mesh.setColorAt(i, new THREE.Color(CONFETTI[Math.floor(rand() * CONFETTI.length)]));
    }
    return mesh;
  }

  private makeStarfish(geometry: THREE.BufferGeometry): THREE.InstancedMesh {
    const spots: [number, number][] = [
      [3.2, 4.5],
      [-5.5, 6.2],
      [7.4, -3.1],
      [-9.8, -2.4],
      [11.6, 6.8],
      [-2.4, -9.6],
      [5.1, 12.4],
      [-13.2, 7.7],
    ];
    const colors = ['#F29E7A', '#F7B58A', '#F48C8C'];
    const mesh = new THREE.InstancedMesh(geometry, toon({ vertexColors: true }), spots.length);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const one = new THREE.Vector3(1, 1, 1);
    spots.forEach(([x, z], i) => {
      q.setFromAxisAngle(up, i * 1.7);
      m.compose(new THREE.Vector3(x, groundHeight(x, z) + 0.005, z), q, one);
      mesh.setMatrixAt(i, m);
      mesh.setColorAt(i, new THREE.Color(colors[i % colors.length]));
    });
    return mesh;
  }
}
