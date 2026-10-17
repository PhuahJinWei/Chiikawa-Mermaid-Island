import * as THREE from 'three';
import { sharedUniforms } from '../characters/CharacterMaterial';
import { newSkyLook, skyAt } from './DayNight';
import { glowUniforms } from './Glow';
import { inkUniforms, windUniforms } from './Ink';
import { FLOOR_GLSL, WATER_EDGE, groundHeight, loadTerrain, terrainHeight, waterLevelAt, type Terrain } from './Island';
import { Landmarks } from './Landmarks';
import { Butterflies } from './Butterflies';
import { Props, type Placed } from './Props';
import { Zones, type ZoneDef } from './Zones';
import { Vegetation } from './Vegetation';

/** The sea's surface; the island's own data says the same once it has loaded. */
const WATER_LEVEL = -0.32;
/** The sea is a disc this wide around the camera, so its far edge (the horizon line) is the same distance away all round. */
const SEA_RADIUS = 600;

// Sampled from the film's beach frames.
const COLORS = {
  skyTop: '#3FA9F2',
  skyHorizon: '#BDE6F8',
  sun: '#FFF4E2',
  // The sea by depth: pale aqua at the water's edge, turquoise over the lagoon, blue past the reef.
  edge: WATER_EDGE,
  shallow: '#1BC4B3',
  mid: '#1590C2',
  deep: '#1A6FB2',
  foam: '#F4FFFC',
  cloud: '#FFFFFF',
  cloudShade: '#DCE4EC',
  moon: '#F5F1C9',
  star: '#FFFBE8',
};
const CONFETTI = ['#F0C866', '#F4A9B8', '#9FD3F0', '#F29E6B', '#FFFFFF', '#B9E58C'];


export class Stage {
  private readonly water: THREE.ShaderMaterial;
  private readonly sea: THREE.Mesh;
  private readonly clouds: THREE.Group;
  private readonly sky: THREE.Mesh;
  private readonly skyMaterial: THREE.ShaderMaterial;
  private readonly world: THREE.Group;
  private readonly scene: THREE.Scene;
  private readonly hemi: THREE.HemisphereLight;
  private readonly light: THREE.DirectionalLight;
  private readonly cloudMaterial: THREE.ShaderMaterial;
  /** Shared by the sea and the pool: how the hour tints the water, and the moon's road on it. */
  private readonly waterLight = {
    uTint: { value: new THREE.Color(1, 1, 1) },
    uMoonDir: { value: new THREE.Vector3(0, -1, 0) },
    uNight: { value: 0 },
    uMoon: { value: new THREE.Color(COLORS.moon) },
  };
  private readonly look = newSkyLook();
  private confettiMaterial: THREE.MeshBasicMaterial | null = null;
  private landmarks: Landmarks | null = null;
  private props: Props | null = null;
  private vegetation: Vegetation | null = null;
  private butterflies: Butterflies | null = null;
  /** The island's named places, once the layout has loaded. */
  zones: Zones | null = null;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    scene.background = new THREE.Color(COLORS.skyHorizon);
    // Light haze only: the karst pillars must read from anywhere on the island.
    scene.fog = new THREE.Fog(COLORS.skyHorizon, 180, 900);

    // The sun's light by day and the moon's by night, and soft light from the sky and the ground.
    this.hemi = new THREE.HemisphereLight('#DDF3FF', '#EBC48F', 1.6);
    this.light = new THREE.DirectionalLight(COLORS.sun, 2.4);
    this.light.position.set(20, 40, 14);
    scene.add(this.hemi, this.light);

    this.skyMaterial = this.makeSkyMaterial(this.light.position);
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(500, 32, 16), this.skyMaterial);
    this.sky.renderOrder = -1;
    this.sky.frustumCulled = false;
    scene.add(this.sky);

    const world = new THREE.Group();
    this.water = this.makeWaterMaterial();
    const waterGeo = new THREE.CircleGeometry(SEA_RADIUS, 128).rotateX(-Math.PI / 2).translate(0, WATER_LEVEL, 0);
    this.sea = new THREE.Mesh(waterGeo, this.water);
    world.add(this.sea);
    this.cloudMaterial = this.makeCloudMaterial();
    this.clouds = this.makeClouds(this.cloudMaterial);
    world.add(this.clouds);
    scene.add(world);
    this.world = world;
  }

  /** Loads the island's ground, then what stands on it. */
  async load(): Promise<void> {
    const terrain = await loadTerrain();
    this.world.add(terrain.mesh);
    this.setSeaFloor(terrain);
    this.landmarks = await Landmarks.load(terrain.info);
    this.world.add(this.landmarks.group);
    this.vegetation = await Vegetation.load(terrain.info);
    this.world.add(this.vegetation.group);
    this.butterflies = await Butterflies.load(terrain.info.plants.butterflies);
    this.butterflies.attach(this.world);
    const response = await fetch('data/layout.json');
    if (!response.ok) throw new Error('Could not load data/layout.json');
    const layout = (await response.json()) as { props: Placed[]; zones: ZoneDef[] };
    this.zones = new Zones(layout.zones, groundHeight, waterLevelAt);
    this.props = await Props.load(layout.props, terrain.info.water);
    this.world.add(this.props.group);
    this.world.add(this.makeConfetti());
  }

  /** The sea's colours and surf follow the real sea floor once it has loaded. */
  private setSeaFloor(terrain: Terrain): void {
    const u = this.water.uniforms;
    const { origin, size } = terrain.info;
    u.uFloor.value = terrain.texture;
    u.uMap.value.set(origin[0], origin[1], size, terrain.info.height.grid);
    u.uLevel.value = terrain.info.water;

    // The waterfall pool: the same water at the pool's level, churned white where the fall lands.
    const { pool, waterfall } = terrain.info;
    const poolWater = this.water.clone();
    for (const name of ['uTime', 'uFloor', 'uMap'] as const) poolWater.uniforms[name] = u[name];
    Object.assign(poolWater.uniforms, this.waterLight);
    poolWater.uniforms.uLevel = { value: pool.level };
    poolWater.uniforms.uSplash = {
      value: new THREE.Vector4(waterfall.foot[0], waterfall.foot[1], waterfall.splash, 0),
    };
    const poolGeo = new THREE.CircleGeometry(pool.radius + 4, 64).rotateX(-Math.PI / 2);
    const poolMesh = new THREE.Mesh(poolGeo, poolWater);
    poolMesh.position.set(pool.centre[0], pool.level, pool.centre[1]);
    this.world.add(poolMesh);
  }

  /** Lights the island for `hours` past midnight: the sky, the sun or the moon, the sea, the
   * clouds, everything drawn with the ambient tint, and the festival's lights. */
  setHour(hours: number): void {
    const look = skyAt(hours, this.look);
    const u = this.skyMaterial.uniforms;
    u.uTop.value.copy(look.top);
    u.uHorizon.value.copy(look.horizon);
    u.uSunDir.value.copy(look.sunDir);
    u.uMoonDir.value.copy(look.moonDir);
    u.uNight.value = look.night;
    (this.scene.background as THREE.Color).copy(look.horizon);
    (this.scene.fog as THREE.Fog).color.copy(look.horizon);
    this.hemi.color.copy(look.hemiSky);
    this.hemi.groundColor.copy(look.hemiGround);
    this.hemi.intensity = look.hemiIntensity;
    this.light.color.copy(look.light);
    this.light.intensity = look.lightIntensity;
    this.light.position.copy(look.lightDir).multiplyScalar(50);
    sharedUniforms.uAmbient.value.copy(look.ambient);
    this.cloudMaterial.uniforms.uTint.value.copy(look.cloud);
    this.waterLight.uTint.value.copy(look.sea);
    this.waterLight.uMoonDir.value.copy(look.moonDir);
    this.waterLight.uNight.value = look.night;
    glowUniforms.uGlow.value = look.glow;
    this.confettiMaterial?.color.copy(look.ambient);
  }

  update(camera: THREE.Camera, time: number): void {
    this.water.uniforms.uTime.value = time;
    this.skyMaterial.uniforms.uTime.value = time;
    this.landmarks?.update(time);
    this.props?.update(time, camera);
    windUniforms.uTime.value = time;
    this.vegetation?.update(camera);
    this.butterflies?.update(time);
    this.sky.position.copy(camera.position);
    // The sea's colours come from where each point is in the world, so the disc can travel with
    // the camera. Its far edge meets the sky at the horizon line.
    this.sea.position.set(camera.position.x, 0, camera.position.z);
    // The clouds hang far off in a ring around the camera, wherever it goes, as part of the sky.
    this.clouds.position.copy(camera.position);
    const above = camera.position.y - WATER_LEVEL;
    this.skyMaterial.uniforms.uHorizonY.value = Math.sin(-Math.atan2(above, SEA_RADIUS));
  }

  private makeWaterMaterial(): THREE.ShaderMaterial {
    // A one-texel deep floor until the island loads, so the sea starts out deep blue.
    const deep = new THREE.DataTexture(
      new Uint16Array([THREE.DataUtils.toHalfFloat(-20)]),
      1,
      1,
      THREE.RedFormat,
      THREE.HalfFloatType,
    );
    deep.needsUpdate = true;
    // No fog: the sea keeps its blue right up to the horizon line, as in the film. The water
    // stops where the height grid says the ground rises out of it, rather than leaving the edge
    // to the depth test: the ground sits a little back in it (for outlines where things touch
    // it), by an amount that changes with every triangle's slope, which would make a ragged edge
    // that covers the pen's waterline in places.
    return new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uFloor: { value: deep },
        uMap: { value: new THREE.Vector4(-1, -1, 2, 2) },
        uLevel: { value: WATER_LEVEL },
        uSplash: { value: new THREE.Vector4(0, 0, 0, 0) },
        uEdge: { value: new THREE.Color(COLORS.edge) },
        uShallow: { value: new THREE.Color(COLORS.shallow) },
        uMid: { value: new THREE.Color(COLORS.mid) },
        uDeep: { value: new THREE.Color(COLORS.deep) },
        uFoam: { value: new THREE.Color(COLORS.foam) },
        ...this.waterLight,
      },
      vertexShader: /* glsl */ `
        varying vec3 vWorld;
        void main() {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vWorld = wp.xyz;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }`,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        uniform vec3 uTint;
        uniform vec3 uMoonDir;
        uniform float uNight;
        uniform vec3 uMoon;
        ${FLOOR_GLSL}
        uniform float uLevel;
        uniform vec4 uSplash;
        uniform vec3 uEdge;
        uniform vec3 uShallow;
        uniform vec3 uMid;
        uniform vec3 uDeep;
        uniform vec3 uFoam;
        varying vec3 vWorld;
        float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        void main() {
          // Beyond the island's map the sea floor falls away into the deep.
          vec2 outside = max(uMap.xy - vWorld.xz, vWorld.xz - (uMap.xy + uMap.z));
          float beyond = smoothstep(0.0, 40.0, max(outside.x, outside.y));
          float depth = mix(uLevel - floorAt(vWorld.xz), 30.0, beyond);
          if (depth < 0.01) discard;
          // Distance to the shore, from the depth and how steeply the floor rises toward it, so
          // the surf keeps its width on gentle beaches and steep rocks alike.
          float e = 1.5;
          vec2 slope = vec2(floorAt(vWorld.xz + vec2(e, 0.0)) - floorAt(vWorld.xz - vec2(e, 0.0)),
                            floorAt(vWorld.xz + vec2(0.0, e)) - floorAt(vWorld.xz - vec2(0.0, e))) / (2.0 * e);
          float shore = max(depth, 0.0) / max(length(slope), 0.02);

          vec3 col = mix(uEdge, uShallow, smoothstep(0.1, 1.2, depth));
          col = mix(col, uMid, smoothstep(2.6, 6.0, depth));
          col = mix(col, uDeep, smoothstep(8.0, 16.0, depth));
          float shallow = 1.0 - smoothstep(0.5, 3.0, depth);
          col += (sin(shore * 1.3 - uTime * 0.9) * 0.5 + 0.5) * 0.035 * shallow;
          // Surf: a band of foam just off the beach breathing in and out, and a fainter one beyond.
          float wave = 0.3 + 0.25 * sin(uTime * 0.8);
          float foam = 1.0 - smoothstep(0.0, 0.4, abs(shore - wave));
          float foam2 = 1.0 - smoothstep(0.0, 0.22, abs(shore - (wave + 1.2 + 0.2 * sin(uTime * 0.8 + 1.7))));
          col = mix(col, uFoam, max(foam * 0.85, foam2 * 0.45) * step(0.0, depth));
          // Where a waterfall lands: churned white, with rings spreading out from it.
          if (uSplash.z > 0.0) {
            vec2 off = vWorld.xz - uSplash.xy;
            float d = length(off) / uSplash.z;
            float edge = 0.62 + 0.06 * sin(atan(off.y, off.x) * 7.0 + uTime * 2.0);
            float churn = 1.0 - smoothstep(edge - 0.04, edge + 0.04, d);
            float rings = smoothstep(0.6, 0.85, sin(d * 34.0 - uTime * 4.0) * 0.5 + 0.5) * (1.0 - smoothstep(0.6, 1.0, d));
            col = mix(col, uFoam, max(churn, rings * 0.7));
          }
          col *= uTint;
          vec2 cell = floor(vWorld.xz * 1.6);
          float sparkle = step(0.986, hash(cell + floor(uTime * 1.5))) * shallow * (1.0 - uNight);
          float dotMask = 1.0 - smoothstep(0.05, 0.18, length(fract(vWorld.xz * 1.6) - 0.5));
          col = mix(col, vec3(1.0), sparkle * dotMask);
          // The moon's road: a broken streak of light across the water toward the moon, widening
          // into the distance, as in the film's night beach.
          if (uNight > 0.0 && uMoonDir.y > 0.0) {
            vec2 toward = vWorld.xz - cameraPosition.xz;
            float dist = length(toward);
            vec2 m = normalize(uMoonDir.xz);
            float along = dot(toward, m);
            float off = abs(toward.x * m.y - toward.y * m.x);
            float width = 0.5 + along * 0.05;
            float road = (1.0 - smoothstep(width * 0.55, width, off)) * smoothstep(0.0, 6.0, along);
            float broken = step(0.42, fract(along * 0.09 + 0.35 * sin(vWorld.x * 0.23 + uTime * 0.6) + 0.25 * sin(vWorld.z * 0.31 - uTime * 0.4)));
            col = mix(col, uMoon, road * broken * uNight * smoothstep(0.0, 0.12, uMoonDir.y) * 0.85);
          }
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
        uMoonDir: { value: new THREE.Vector3(0, -1, 0) },
        uMoonColor: { value: new THREE.Color(COLORS.moon) },
        uStarColor: { value: new THREE.Color(COLORS.star) },
        uNight: { value: 0 },
        uTime: { value: 0 },
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
        uniform vec3 uMoonDir;
        uniform vec3 uMoonColor;
        uniform vec3 uStarColor;
        uniform float uNight;
        uniform float uTime;
        uniform vec3 uInk;
        uniform float uPen;
        uniform float uHorizonY;
        varying vec3 vDir;
        float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        void main() {
          vec3 dir = normalize(vDir);
          float h = clamp(dir.y, 0.0, 1.0);
          vec3 col = mix(uHorizon, uTop, pow(h, 0.55));
          float s = max(dot(dir, uSunDir), 0.0);
          col += uSunColor * (pow(s, 400.0) * 1.5 + pow(s, 12.0) * 0.12) * (1.0 - uNight) * step(0.0, uSunDir.y);
          if (uNight > 0.0) {
            // Stars: dots scattered over the sky's directions, a few twinkling.
            vec2 sky = vec2(atan(dir.z, dir.x) * 38.0, asin(clamp(dir.y, -1.0, 1.0)) * 38.0);
            vec2 cell = floor(sky);
            float pick = hash(cell);
            vec2 at = cell + 0.25 + 0.5 * vec2(hash(cell + 7.1), hash(cell + 3.3));
            float r = 0.06 + 0.1 * hash(cell + 1.9);
            float star = (1.0 - smoothstep(r * 0.6, r, length(sky - at))) * step(0.9, pick);
            star *= 0.65 + 0.35 * sin(uTime * (1.5 + 3.0 * hash(cell + 5.0)) + pick * 40.0);
            col = mix(col, uStarColor, star * uNight * uNight * smoothstep(0.04, 0.2, dir.y));
            // The full moon: a big pale disc in a soft halo, outlined with the pen.
            float m = acos(clamp(dot(dir, uMoonDir), -1.0, 1.0));
            float radius = 0.06;
            col = mix(col, vec3(0.42, 0.52, 0.82), 0.4 * (1.0 - smoothstep(radius, radius * 4.0, m)) * uNight);
            float edge = (m - radius) / max(fwidth(m), 1e-6);
            float disc = 1.0 - smoothstep(-0.5, 0.5, edge);
            vec3 moon = mix(uInk, uMoonColor, disc);
            float drawn = 1.0 - smoothstep(uPen - 0.5, uPen + 0.5, edge);
            col = mix(col, moon, drawn * uNight * step(0.0, dir.y - uHorizonY));
          }
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
   * with the pen. Drawn from circles in the shader, so the outline stays crisp at any size; tinted
   * by the hour, pink at dusk and blue-grey at night.
   */
  private makeCloudMaterial(): THREE.ShaderMaterial {
    // Puffs in a 512 x 256 box, y down: x, y, radius.
    const puffs: [number, number, number][] = [
      [120, 170, 70],
      [190, 120, 88],
      [285, 105, 96],
      [370, 135, 78],
      [430, 172, 52],
      [250, 175, 70],
    ];
    return new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      defines: { PUFFS: puffs.length },
      uniforms: {
        ...inkUniforms,
        uPuffs: { value: puffs.map(([x, y, r]) => new THREE.Vector3(x, y, r)) },
        uCloud: { value: new THREE.Color(COLORS.cloud) },
        uShade: { value: new THREE.Color(COLORS.cloudShade) },
        uTint: { value: new THREE.Color(1, 1, 1) },
        uAmbient: sharedUniforms.uAmbient,
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
        uniform vec3 uTint;
        uniform vec3 uAmbient;
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
          vec3 col = mix(uInk * uAmbient, mix(uShade, uCloud, top) * uTint, inside);
          gl_FragColor = vec4(col, alpha);
          #include <colorspace_fragment>
        }`,
    });
  }

  private makeClouds(material: THREE.ShaderMaterial): THREE.Group {
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

  /** Paper confetti from the welcome festival, scattered over its plaza and street. */
  private makeConfetti(): THREE.InstancedMesh {
    const count = 900;
    // The beach in front of the stalls, and the street through the arch: x, z, half sizes.
    const areas: [number, number, number, number][] = [
      [0, -5, 26, 7],
      [0, -30, 6.2, 13],
    ];
    const geo = new THREE.PlaneGeometry(0.07, 0.05).rotateX(-Math.PI / 2);
    this.confettiMaterial = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
    const mesh = new THREE.InstancedMesh(geo, this.confettiMaterial, count);
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
      const [ax, az, hx, hz] = areas[i % 3 === 0 ? 1 : 0];
      pos.set(ax + (rand() * 2 - 1) * hx, 0, az + (rand() * 2 - 1) * hz);
      pos.y = terrainHeight(pos.x, pos.z) + 0.006;
      q.setFromAxisAngle(up, rand() * Math.PI);
      const k = 0.8 + rand() * 0.6;
      scale.set(k, 1, k);
      m.compose(pos, q, scale);
      mesh.setMatrixAt(i, m);
      mesh.setColorAt(i, new THREE.Color(CONFETTI[Math.floor(rand() * CONFETTI.length)]));
    }
    return mesh;
  }

}
