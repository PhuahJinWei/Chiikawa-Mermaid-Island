import * as THREE from 'three';
import { sharedUniforms } from '../characters/CharacterMaterial';
import { Cave } from './Cave';
import { FilmClouds } from './Clouds';
import { newSkyLook, skyAt } from './DayNight';
import { Firelight } from './Firelight';
import { glowUniforms } from './Glow';
import { inkUniforms, windUniforms } from './Ink';
import { FLOOR_GLSL, WATER_EDGE, groundHeight, loadTerrain, outsideWalkable, setCave, terrainHeight, type Terrain } from './Island';
import { Landmarks } from './Landmarks';
import {
  FILM,
  coverAt,
  filmLights,
  filmSky,
  caveUniform,
  goldenUniform,
  jungleHaze,
  lightShafts,
  moonUniforms,
  nightUniform,
  sunUniform,
} from './Look';
import { canopyShade } from './Obstacles';
import { Butterflies } from './Butterflies';
import { Props, type Placed } from './Props';
import { Zones, type ZoneDef } from './Zones';
import { Vegetation } from './Vegetation';

/** The sea's surface; the island's own data says the same once it has loaded. */
const WATER_LEVEL = -0.32;
/** The sea is a disc this wide around the camera, so its far edge (the horizon line) is the same distance away all round. */
const SEA_RADIUS = 600;
/** Where the haze starts and where it hides everything, from near the ground; nearer in the film
 * look, whose distant jungle and hills fade into a pale blue haze. */
const FOG_NEAR = FILM ? 18 : 180;
const FOG_FAR = FILM ? 320 : 900;
/** The film look's sun shadows: how far round the spot ahead of the camera they reach, in metres,
 * and the shadow map's size (1536 over 84 m is 5.5 cm a texel; at 2048 the map cost about 3 ms
 * more a frame at 1920 x 1200 on the dev PC, for shadows hardly sharper under the soft filter). */
const SHADOW_REACH = 42;
const SHADOW_MAP = 1536;

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
  // The jungle waterfall's pool: deep green under the trees, as in the film's frame.
  poolEdge: '#5DA88B',
  pool: '#2C6658',
  poolDeep: '#22554A',
  cloud: '#FFFFFF',
  cloudShade: '#DCE4EC',
  moon: '#F5F1C9',
  star: '#FFFBE8',
  /** In the film look the moon is whiter and the stars pale cyan, as its night jungle paints them. */
  filmMoon: '#EAF8FF',
  filmStar: '#B8F0FF',
};
const _haze = new THREE.Color();
const _hazeLight = new THREE.Color();
const _hazeSky = new THREE.Color();
/** The sky's glow seen from under the trees by day, and how it turns in the golden hour. */
const GLOW_TINT = new THREE.Color(1.0, 0.97, 0.88);
const GOLDEN_GLOW = new THREE.Color(1.0, 0.8, 0.46);
/** The cool cyan the moon rims things with at the height of the night (see moonEdges). */
const MOON_RIM = new THREE.Color(0.12, 0.36, 0.5);
/** The sunlight slanting into the waterfall's clearing: its colour by day and its strength. */
const SHAFT_COLOUR = '#FFF3CF';
const SHAFT_STRENGTH = 0.11;
const CONFETTI = ['#F0C866', '#F4A9B8', '#9FD3F0', '#F29E6B', '#FFFFFF', '#B9E58C'];


export class Stage {
  private readonly water: THREE.ShaderMaterial;
  private readonly sea: THREE.Mesh;
  private readonly clouds: THREE.Group;
  /** In the film look, the clouds painted as its skies have them. */
  private readonly filmClouds: FilmClouds | null = null;
  private readonly sky: THREE.Mesh;
  private readonly skyMaterial: THREE.ShaderMaterial;
  private readonly world: THREE.Group;
  private readonly scene: THREE.Scene;
  private readonly hemi: THREE.HemisphereLight;
  private readonly light: THREE.DirectionalLight;
  private readonly cloudMaterial: THREE.ShaderMaterial;
  /** How the hour tints the sea, and the moon's road on it. */
  private readonly waterLight = {
    uTint: { value: new THREE.Color(1, 1, 1) },
    uMoonDir: { value: new THREE.Vector3(0, -1, 0) },
    uNight: { value: 0 },
    uMoon: { value: new THREE.Color(COLORS.moon) },
    /** In the film look, the haze the sea pales into toward the horizon (see setHour). */
    uSeaHaze: { value: new THREE.Color(COLORS.skyHorizon) },
  };
  private readonly look = newSkyLook();
  /** Toward the sun (or the moon), for keeping the film look's shadows round the camera. */
  private readonly lightDir = new THREE.Vector3(0, 1, 0);
  private readonly ahead = new THREE.Vector3();
  private confettiMaterial: THREE.MeshBasicMaterial | null = null;
  private landmarks: Landmarks | null = null;
  private props: Props | null = null;
  /** In the film look, the light the torches, windows and lanterns throw after dark. */
  private firelight: Firelight | null = null;
  private vegetation: Vegetation | null = null;
  private butterflies: Butterflies | null = null;
  /** In the film look, the waterfall's pool and the camera that captures what it mirrors. */
  private pool: { surface: THREE.Mesh; probe: THREE.CubeCamera } | null = null;
  /** In the film look, the sunlight slanting into the waterfall's clearing. */
  private shafts: THREE.Mesh | null = null;
  /** In the film look, how far in under the trees the camera is, eased as it goes (see update),
   * and where and when it was last looked at. */
  private enclosed = 0;
  private readonly enclosedAt = new THREE.Vector3();
  private enclosedTime = 0;
  /** The hour's sky before the film look paints it (see paintSky), and how enclosed it was painted. */
  private readonly skyTop = new THREE.Color();
  private readonly skyHorizon = new THREE.Color();
  private skyNight = 0;
  private skyEnclosed = -1;
  /** The island's named places, once the layout has loaded. */
  zones: Zones | null = null;
  /** The forbidden cave's inside, once it has loaded (see Cave.ts). */
  cave: Cave | null = null;
  /** Where the torch carried through the cave burns, and the one set up in the boat's bow, this
   * frame (or null): set by whoever carries them before each update. */
  readonly caveTorches: { carried: THREE.Vector3 | null; boat: THREE.Vector3 | null } = { carried: null, boat: null };

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    scene.background = new THREE.Color(COLORS.skyHorizon);
    // Light haze only: the karst pillars must read from anywhere on the island.
    scene.fog = new THREE.Fog(COLORS.skyHorizon, FOG_NEAR, FOG_FAR);

    // The sun's light by day and the moon's by night, and soft light from the sky and the ground.
    this.hemi = new THREE.HemisphereLight('#DDF3FF', '#EBC48F', 1.6);
    this.light = new THREE.DirectionalLight(COLORS.sun, 2.4);
    this.light.position.set(20, 40, 14);
    scene.add(this.hemi, this.light);
    if (FILM) {
      // Rocks, trees and houses cast soft shadows round wherever the camera is looking.
      const shadow = this.light.shadow;
      this.light.castShadow = true;
      shadow.mapSize.set(SHADOW_MAP, SHADOW_MAP);
      shadow.camera.left = shadow.camera.bottom = -SHADOW_REACH;
      shadow.camera.right = shadow.camera.top = SHADOW_REACH;
      shadow.camera.near = 1;
      shadow.camera.far = 260;
      shadow.bias = -0.0004;
      shadow.normalBias = 0.06;
      shadow.radius = 3;
      scene.add(this.light.target);
    }

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
    if (FILM) {
      // The film look's clouds, many of their own shapes round the sky (see Clouds.ts).
      this.filmClouds = new FilmClouds(this.skyMaterial.uniforms.uHorizon, this.skyMaterial.uniforms.uEnclosed);
      this.clouds = new THREE.Group().add(this.filmClouds.mesh);
      world.add(this.filmClouds.aerial);
    } else {
      this.clouds = this.makeClouds(this.cloudMaterial);
    }
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
    if (terrain.info.cave) {
      // The forbidden cave under the outcrop and the spur: its own floor to walk on, its own light.
      this.cave = await Cave.load(terrain.info.cave.url, outsideWalkable);
      setCave(this.cave.grid);
      this.world.add(this.cave.group);
      const sky = terrain.info.skylight;
      if (sky) jungleHaze.uJungleHole.value.set(sky.centre[0], sky.centre[1], sky.radius * 1.15, this.cave.info.dome.top - 0.3);
    }
    this.vegetation = await Vegetation.load(terrain.info);
    this.world.add(this.vegetation.group);
    this.butterflies = await Butterflies.load(terrain.info.plants.butterflies);
    this.butterflies.attach(this.world);
    const response = await fetch('data/layout.json');
    if (!response.ok) throw new Error('Could not load data/layout.json');
    const layout = (await response.json()) as { props: Placed[]; zones: ZoneDef[] };
    this.zones = new Zones(layout.zones, groundHeight, terrain.info.water);
    this.props = await Props.load(layout.props, terrain.info.water);
    this.world.add(this.props.group);
    if (FILM) {
      this.firelight = new Firelight();
      for (const fire of this.props.fires) this.firelight.add(fire.position, fire.kind, fire);
      this.firelight.build();
    }
    this.world.add(this.makeConfetti());
  }

  /**
   * The sea's colours and surf follow the real sea floor once it has loaded. The waterfall's pool
   * is the same water at its own level, deep green and without surf, churned white where the
   * waterfall lands.
   */
  private setSeaFloor(terrain: Terrain): void {
    const u = this.water.uniforms;
    const { origin, size, pool, waterfall } = terrain.info;
    u.uFloor.value = terrain.texture;
    u.uMap.value.set(origin[0], origin[1], size, terrain.info.height.grid);
    u.uLevel.value = terrain.info.water;
    // (The forbidden cave's water, the sea come in under the spur, is the cave's own: see Cave.ts.)
    if (!pool) return;
    const water = this.water.clone();
    for (const name of ['uTime', 'uFloor', 'uMap'] as const) water.uniforms[name] = u[name];
    Object.assign(water.uniforms, this.waterLight, {
      uLevel: { value: pool.level },
      uSurf: { value: 0 },
      uEdge: { value: new THREE.Color(COLORS.poolEdge) },
      uShallow: { value: new THREE.Color(COLORS.pool) },
      uMid: { value: new THREE.Color(COLORS.poolDeep) },
      uDeep: { value: new THREE.Color(COLORS.poolDeep) },
    });
    if (waterfall) water.uniforms.uSplash.value.set(waterfall.foot[0], waterfall.foot[1], waterfall.splash, 0);
    const surface = new THREE.Mesh(new THREE.CircleGeometry(pool.radius + 4, 64).rotateX(-Math.PI / 2), water);
    surface.position.set(pool.centre[0], pool.level, pool.centre[1]);
    this.world.add(surface);
    if (FILM) {
      // In the film look the pool mirrors the rock, the waterfall and the trees round it.
      const target = new THREE.WebGLCubeRenderTarget(256, { type: THREE.HalfFloatType });
      const probe = new THREE.CubeCamera(0.5, 600, target);
      probe.position.set(pool.centre[0], pool.level + 1.2, pool.centre[1]);
      this.scene.add(probe);
      water.uniforms.uReflect = { value: target.texture };
      water.uniforms.uReflectOn = { value: 1 };
      this.pool = { surface, probe };
      // Sunlight slanting down into the clearing through the haze, over the water and the bank.
      const [px, pz] = pool.centre;
      const y = pool.level;
      this.shafts = lightShafts(
        [
          [px - 7, y, pz - 6, 34, 3.2],
          [px - 2, y, pz + 3, 30, 2.2],
          [px + 4, y, pz - 2, 36, 4.0],
          [px - 9, y + 0.8, pz + 4, 28, 1.8],
          [px + 1, y, pz - 9, 32, 2.6],
        ],
        SHAFT_STRENGTH,
      );
      this.world.add(this.shafts);
    }
  }

  /**
   * In the film look, captures what the waterfall's pool mirrors: everything round it but the pool
   * itself and `hide` (the characters, who move on), seen from the pool's middle with the plants
   * near it drawn in full and the last frame's shadows. Kept until the light changes.
   */
  reflectPool(renderer: THREE.WebGLRenderer, hide: THREE.Object3D[], camera: THREE.Camera): void {
    if (!this.pool) return;
    const { surface, probe } = this.pool;
    const shown = hide.map((o) => o.visible);
    for (const o of hide) o.visible = false;
    surface.visible = false;
    this.vegetation?.update(probe as unknown as THREE.Camera);
    this.sky.position.copy(probe.position);
    // The last frame's shadows, once there are any: the first capture, before the first frame has
    // drawn them, draws its own, or everything lit would be left out of the mirror.
    const auto = renderer.shadowMap.autoUpdate;
    if (this.light.shadow.map) renderer.shadowMap.autoUpdate = false;
    probe.update(renderer, this.scene);
    renderer.shadowMap.autoUpdate = auto;
    this.sky.position.copy(camera.position);
    this.vegetation?.update(camera);
    surface.visible = true;
    hide.forEach((o, i) => (o.visible = shown[i]));
  }

  /** Lights the island for `hours` past midnight: the sky, the sun or the moon, the sea, the
   * clouds, everything drawn with the ambient tint, and the festival's lights. */
  setHour(hours: number): void {
    const look = skyAt(hours, this.look);
    const u = this.skyMaterial.uniforms;
    this.skyTop.copy(look.top);
    this.skyHorizon.copy(look.horizon);
    this.skyNight = look.night;
    this.paintSky();
    u.uSunDir.value.copy(look.sunDir);
    u.uMoonDir.value.copy(look.moonDir);
    u.uNight.value = look.night;
    nightUniform.value = look.night;
    this.hemi.color.copy(look.hemiSky);
    this.hemi.groundColor.copy(look.hemiGround);
    this.hemi.intensity = look.hemiIntensity;
    this.light.color.copy(look.light);
    this.light.intensity = look.lightIntensity;
    this.light.position.copy(look.lightDir).multiplyScalar(50);
    this.lightDir.copy(look.lightDir);
    sunUniform.value.copy(look.lightDir);
    if (FILM) filmLights(this.light, this.hemi, look.night);
    sharedUniforms.uAmbient.value.copy(look.ambient);
    // The jungle's depth haze takes the hour's light: teal in the shade by day, golden toward the
    // sun. In the golden hour the shade's haze turns a thin amber, gold toward the sun, as the
    // film's late afternoon fills its jungle with golden light; from then on through the dusk it
    // takes the sky's own colours and thins as the light goes, so the jungle never fills with a
    // green fog.
    const a = look.ambient;
    const golden = THREE.MathUtils.smoothstep(hours, 15.2, 16.6) * (1 - THREE.MathUtils.smoothstep(hours, 17.4, 18.2));
    const evening = THREE.MathUtils.smoothstep(hours, 16.6, 18.2) * (1 - THREE.MathUtils.smoothstep(hours, 19.6, 20.6));
    goldenUniform.value = golden;
    // Seen from under the trees, the sky glows gold too.
    u.uGlowTint.value.copy(GLOW_TINT).lerp(GOLDEN_GLOW, golden);
    _haze.set(0.06 + 0.18 * golden, 0.26 - 0.08 * golden, 0.22 - 0.15 * golden).multiply(_hazeLight.copy(a));
    _haze.lerp(_hazeSky.copy(look.horizon).multiplyScalar(0.4), evening);
    jungleHaze.uJungle.value.set(_haze.r, _haze.g, _haze.b);
    _haze.setRGB(0.58, 0.46, 0.1).multiply(_hazeLight).multiplyScalar(1 + 0.5 * golden);
    _haze.lerp(_hazeSky.copy(look.horizon).multiplyScalar(0.75), evening * (1 - golden));
    jungleHaze.uJungleWarm.value.set(_haze.r, _haze.g, _haze.b);
    jungleHaze.uJungleThick.value = 1 - 0.3 * golden - 0.45 * evening * (1 - golden);
    // The moon rims what turns toward it in cool cyan, once night has fallen and it is up.
    moonUniforms.uMoonWay.value.copy(look.moonDir);
    moonUniforms.uMoonRim.value
      .copy(MOON_RIM)
      .multiplyScalar(look.night * look.night * THREE.MathUtils.smoothstep(look.moonDir.y, 0.0, 0.2));
    // The sunlight in the waterfall's clearing takes the sun's colour, gold in the golden hour.
    if (this.shafts) {
      const shafts = (this.shafts.material as THREE.ShaderMaterial).uniforms;
      shafts.uColour.value.set(SHAFT_COLOUR).lerp(look.light, 0.5);
      shafts.uStrength.value = SHAFT_STRENGTH * (1 + 0.8 * golden);
    }
    this.cloudMaterial.uniforms.uTint.value.copy(look.cloud);
    this.filmClouds?.setHour(look.cloud, u.uTop.value, u.uHorizon.value, look.night, look.lightDir, WATER_LEVEL);
    this.waterLight.uTint.value.copy(look.sea);
    // The sea's distance haze: between its deep blue at the hour and the open sky's horizon.
    this.waterLight.uSeaHaze.value.set(COLORS.deep).multiply(look.sea).lerp(look.horizon, 0.55);
    this.waterLight.uMoonDir.value.copy(look.moonDir);
    this.waterLight.uNight.value = look.night;
    glowUniforms.uGlow.value = look.glow;
    this.confettiMaterial?.color.copy(look.ambient);
    this.cave?.setHour(look.night);
  }

  /** The hour's sky colours onto the sky, the background and the haze, in the film look as seen
   * from where the camera is (see update). */
  private paintSky(): void {
    const u = this.skyMaterial.uniforms;
    u.uTop.value.copy(this.skyTop);
    u.uHorizon.value.copy(this.skyHorizon);
    if (FILM) filmSky(u.uTop.value, u.uHorizon.value, this.skyNight, this.enclosed);
    (this.scene.background as THREE.Color).copy(u.uHorizon.value);
    (this.scene.fog as THREE.Fog).color.copy(u.uHorizon.value);
    this.skyEnclosed = this.enclosed;
  }

  /** How deep in the trees' shade the point (x, y, z) is from the sun (or the moon), 0 to 1. */
  shadeAt(x: number, y: number, z: number): number {
    return canopyShade(x, y, z, this.lightDir);
  }

  /** The firelight on a character at (x, y, z): the strongest sources' ways and warmth, and where
   * the strongest is; returns how much a lit room they stand in warms them all round (see
   * Firelight.lightsAt). None by day or where none reaches. */
  firelightAt(
    x: number,
    y: number,
    z: number,
    seen: Map<number, number>,
    dt: number,
    out: THREE.Vector4[],
    from: THREE.Vector3,
  ): number {
    // In the cave, its torches and its fire, by day as by night.
    if (this.cave?.isInside(x, y, z)) return this.cave.firelightOn(x, y, z, out, from);
    if (this.firelight) return this.firelight.lightsAt(x, y, z, seen, dt, out, from);
    for (const v of out) v.set(0, 0, 0, 0);
    return 0;
  }

  /** The cave's own light on someone at (x, y, z), into `out`, if they are inside it (see Cave.lightOn). */
  caveLightAt(x: number, y: number, z: number, out: THREE.Color): boolean {
    if (!this.cave?.isInside(x, y, z)) return false;
    this.cave.lightOn(x, y, z, out);
    return true;
  }

  /** Compiles the shaders of everything in the scene ahead of its first frame, so none stalls the
   * game as it first comes into view. Called once everything is in the scene. */
  async warmShaders(renderer: THREE.WebGLRenderer, camera: THREE.Camera): Promise<void> {
    await renderer.compileAsync(this.scene, camera);
  }

  update(camera: THREE.Camera, time: number): void {
    this.water.uniforms.uTime.value = time;
    if (this.shafts) (this.shafts.material as THREE.ShaderMaterial).uniforms.uTime.value = time;
    this.skyMaterial.uniforms.uTime.value = time;
    this.landmarks?.update(time);
    this.props?.update(time, camera);
    caveUniform.value = 0;
    let lookout: { x: number; z: number; r: number } | null = null;
    if (this.cave) {
      this.cave.update(time, camera, this.caveTorches.carried, this.caveTorches.boat);
      // No jungle haze in the cave: from inside it everything seen is the cave's own dark, and its
      // own night, not the moonlit grade's.
      const p = camera.position;
      if (this.cave.isInside(p.x, p.y, p.z)) jungleHaze.uJungleThick.value = 0;
      caveUniform.value = this.cave.immersion(p.x, p.y, p.z);
      // From deep in it, the outside shows only up the skylight's well: the rest is not drawn.
      lookout = this.cave.lookout(p.x, p.y, p.z);
    }
    if (this.landmarks) this.landmarks.group.visible = !lookout;
    this.firelight?.update(glowUniforms.uGlow.value, time);
    windUniforms.uTime.value = time;
    this.vegetation?.update(camera, lookout);
    this.butterflies?.update(time);
    this.sky.position.copy(camera.position);
    // The sea's colours come from where each point is in the world, so the disc can travel with
    // the camera. Its far edge meets the sky at the horizon line; from high above (the free camera,
    // the aerial shot) it reaches twice as far, to the edge of what the camera draws, and the haze
    // thins so the island still reads.
    const above = camera.position.y - WATER_LEVEL;
    const reach = THREE.MathUtils.clamp(above / 60, 1, 2);
    this.sea.position.set(camera.position.x, 0, camera.position.z);
    this.sea.scale.set(reach, 1, reach);
    const fog = this.scene.fog as THREE.Fog;
    fog.near = FOG_NEAR * reach;
    fog.far = (FOG_FAR * reach * (reach + 1)) / 2;
    // The clouds hang far off in a ring around the camera, wherever it goes, as part of the sky.
    this.clouds.position.copy(camera.position);
    this.filmClouds?.update(camera);
    if (FILM) {
      // The sun's shadows cover the ground a little ahead of the camera, wherever it looks.
      camera.getWorldDirection(this.ahead);
      this.ahead.y = 0;
      this.ahead.normalize().multiplyScalar(SHADOW_REACH * 0.55).add(camera.position);
      this.ahead.y = Math.max(camera.position.y - 6, WATER_LEVEL);
      this.light.target.position.copy(this.ahead);
      this.light.position.copy(this.ahead).addScaledVector(this.lightDir, 140);
    }
    this.skyMaterial.uniforms.uHorizonY.value = Math.sin(-Math.atan2(above, SEA_RADIUS * reach));
    if (FILM) {
      // The film exposes for where its camera is: seen from under the trees the sky is hazy and
      // glows, out in the open it is plain blue. The sky eases between the two as the camera goes
      // in and out of the trees, at once when it jumps.
      const p = camera.position;
      const target = coverAt(p.x, p.y, p.z);
      const step = THREE.MathUtils.clamp(time - this.enclosedTime, 0, 0.5);
      this.enclosed =
        p.distanceTo(this.enclosedAt) > 6 ? target : this.enclosed + (target - this.enclosed) * (1 - Math.exp(-step / 0.8));
      this.enclosedAt.copy(p);
      this.enclosedTime = time;
      this.skyMaterial.uniforms.uEnclosed.value = this.enclosed;
      if (Math.abs(this.enclosed - this.skyEnclosed) > 0.01) this.paintSky();
    }
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
    // No fog: the sea keeps its blue right up to the horizon line; in the film look it pales a
    // little into the distance, as the film's sea does toward its horizon. The water
    // stops where the height grid says the ground rises out of it, rather than leaving the edge
    // to the depth test: the ground sits a little back in it (for outlines where things touch
    // it), by an amount that changes with every triangle's slope, which would make a ragged edge
    // that covers the pen's waterline in places.
    return new THREE.ShaderMaterial({
      defines: FILM ? { FILM: '' } : {},
      uniforms: {
        uTime: { value: 0 },
        uFloor: { value: deep },
        uMap: { value: new THREE.Vector4(-1, -1, 2, 2) },
        uLevel: { value: WATER_LEVEL },
        uDepth: { value: 0 },
        uSurf: { value: 1 },
        uSplash: { value: new THREE.Vector4(0, 0, 0, 0) },
        uEdge: { value: new THREE.Color(COLORS.edge) },
        uShallow: { value: new THREE.Color(COLORS.shallow) },
        uMid: { value: new THREE.Color(COLORS.mid) },
        uDeep: { value: new THREE.Color(COLORS.deep) },
        uFoam: { value: new THREE.Color(COLORS.foam) },
        uReflect: { value: null },
        uReflectOn: { value: 0 },
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
        uniform vec3 uSeaHaze;
        ${FLOOR_GLSL}
        uniform float uLevel;
        uniform float uDepth;
        uniform float uSurf;
        uniform vec4 uSplash;
        uniform vec3 uEdge;
        uniform vec3 uShallow;
        uniform vec3 uMid;
        uniform vec3 uDeep;
        uniform vec3 uFoam;
        uniform samplerCube uReflect;
        uniform float uReflectOn;
        varying vec3 vWorld;
        float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        void main() {
          // Beyond the island's map the sea floor falls away into the deep. Water with a depth of its
          // own (the cave's, under ground the height grid holds over it) is that deep all over.
          vec2 outside = max(uMap.xy - vWorld.xz, vWorld.xz - (uMap.xy + uMap.z));
          float beyond = smoothstep(0.0, 40.0, max(outside.x, outside.y));
          float depth = uDepth > 0.0 ? uDepth : mix(uLevel - floorAt(vWorld.xz), 30.0, beyond);
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
          col = mix(col, uFoam, max(foam * 0.85, foam2 * 0.45) * step(0.0, depth) * uSurf);
          // Where a waterfall lands: churned white, with rings spreading out from it.
          if (uSplash.z > 0.0) {
            vec2 off = vWorld.xz - uSplash.xy;
            float d = length(off) / uSplash.z;
            float edge = 0.62 + 0.06 * sin(atan(off.y, off.x) * 7.0 + uTime * 2.0);
            float churn = 1.0 - smoothstep(edge - 0.04, edge + 0.04, d);
            float rings = smoothstep(0.6, 0.85, sin(d * 34.0 - uTime * 4.0) * 0.5 + 0.5) * (1.0 - smoothstep(0.6, 1.0, d));
            col = mix(col, uFoam, max(churn, rings * 0.7));
          }
          // A mirror of what stands round it, darker and greener than what it mirrors, smeared
          // by ripples into long wobbles as the film paints the waterfall's pool.
          if (uReflectOn > 0.5) {
            vec3 view = normalize(vWorld - cameraPosition);
            vec2 wobble = vec2(sin(vWorld.x * 0.9 + uTime * 0.7) + sin(vWorld.z * 1.3 - uTime * 0.5),
                               sin(vWorld.z * 1.1 + uTime * 0.6) + sin(vWorld.x * 1.5 - uTime * 0.8)) * 0.004;
            vec3 seen = textureCube(uReflect, reflect(view, normalize(vec3(wobble.x, 1.0, wobble.y)))).rgb;
            float fresnel = 0.22 + 0.4 * pow(1.0 - abs(view.y), 3.0);
            col = mix(col, seen * vec3(0.36, 0.5, 0.44), fresnel * 0.8);
          }
          #ifdef FILM
          // The film paints its sea a deep teal seen across it from the shore, most of all where it
          // is deep; seen from above, the bright lagoon over its sand.
          float down = abs(normalize(vWorld - cameraPosition).y);
          col *= mix(mix(0.66, 0.6, smoothstep(2.0, 12.0, depth)), 1.0, smoothstep(0.12, 0.5, down));
          #endif
          col *= uTint;
          #ifdef FILM
          // Paling into the distance toward the horizon's haze, as the film's sea does.
          float away = length(vWorld.xz - cameraPosition.xz);
          col = mix(col, uSeaHaze, 0.8 * pow(smoothstep(25.0, 560.0, away), 0.7));
          #endif
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
      defines: FILM ? { FILM: '' } : {},
      uniforms: {
        ...inkUniforms,
        uHorizonY: { value: 0 },
        uTop: { value: new THREE.Color(COLORS.skyTop) },
        uHorizon: { value: new THREE.Color(COLORS.skyHorizon) },
        uSunColor: { value: new THREE.Color(COLORS.sun) },
        uSunDir: { value: sunPosition.clone().normalize() },
        uMoonDir: { value: new THREE.Vector3(0, -1, 0) },
        uMoonColor: { value: new THREE.Color(FILM ? COLORS.filmMoon : COLORS.moon) },
        uStarColor: { value: new THREE.Color(FILM ? COLORS.filmStar : COLORS.star) },
        uNight: { value: 0 },
        uTime: { value: 0 },
        uEnclosed: { value: 0 },
        uGlowTint: { value: GLOW_TINT.clone() },
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
        uniform float uEnclosed;
        uniform vec3 uGlowTint;
        varying vec3 vDir;
        float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        void main() {
          vec3 dir = normalize(vDir);
          float h = clamp(dir.y, 0.0, 1.0);
          vec3 col = mix(uHorizon, uTop, pow(h, 0.55));
          float s = max(dot(dir, uSunDir), 0.0);
          col += uSunColor * (pow(s, 400.0) * 1.5 + pow(s, 12.0) * 0.12) * (1.0 - uNight) * step(0.0, uSunDir.y);
          #ifdef FILM
          // The film's hazy daylight seen from under the trees (uEnclosed): brighter than white,
          // most of all toward the sun and low down, so it glows round the trees standing against
          // it. Out in the open, the plain pale blue of the film's open skies, a soft glow round the
          // sun.
          float day = (1.0 - uNight) * smoothstep(-0.05, 0.15, uSunDir.y);
          float glow = day * uEnclosed;
          col = col * mix(1.0, 1.2, glow) + uGlowTint
            * (glow * (0.38 * pow(s, 4.0) + 0.2 * (1.0 - smoothstep(0.0, 0.45, h))) + day * 0.25 * pow(s, 24.0));
          #endif
          if (uNight > 0.0) {
            // Stars: dots scattered over the sky's directions, a few twinkling; in the film look as
            // thick as the film's night skies, with a finer scatter of faint ones between them.
            vec2 sky = vec2(atan(dir.z, dir.x) * 38.0, asin(clamp(dir.y, -1.0, 1.0)) * 38.0);
            vec2 cell = floor(sky);
            float pick = hash(cell);
            vec2 at = cell + 0.25 + 0.5 * vec2(hash(cell + 7.1), hash(cell + 3.3));
            float r = 0.06 + 0.1 * hash(cell + 1.9);
            #ifdef FILM
            float many = 0.7;
            #else
            float many = 0.9;
            #endif
            float star = (1.0 - smoothstep(r * 0.6, r, length(sky - at))) * step(many, pick);
            star *= 0.65 + 0.35 * sin(uTime * (1.5 + 3.0 * hash(cell + 5.0)) + pick * 40.0);
            #ifdef FILM
            vec2 fine = sky * 2.3 + 11.0;
            vec2 cell2 = floor(fine);
            vec2 at2 = cell2 + 0.25 + 0.5 * vec2(hash(cell2 + 4.3), hash(cell2 + 8.9));
            float faint = (1.0 - smoothstep(0.05, 0.11, length(fine - at2))) * step(0.72, hash(cell2 + 2.2));
            star = max(star, faint * 0.55);
            #endif
            col = mix(col, uStarColor, star * uNight * uNight * smoothstep(0.04, 0.2, dir.y));
            // The full moon: a big pale disc in a soft halo, outlined with the pen.
            float m = acos(clamp(dot(dir, uMoonDir), -1.0, 1.0));
            float radius = 0.06;
            col = mix(col, vec3(0.42, 0.52, 0.82), 0.4 * (1.0 - smoothstep(radius, radius * 4.0, m)) * uNight);
            float edge = (m - radius) / max(fwidth(m), 1e-6);
            float disc = 1.0 - smoothstep(-0.5, 0.5, edge);
            #ifdef FILM
            // The film paints the moon without a line, glowing, in a wide halo of brighter blue.
            col += vec3(0.16, 0.3, 0.62) * 0.55 * (1.0 - smoothstep(radius, radius * 9.0, m)) * uNight;
            vec3 moon = uMoonColor * 1.7;
            float drawn = disc;
            #else
            vec3 moon = mix(uInk, uMoonColor, disc);
            float drawn = 1.0 - smoothstep(uPen - 0.5, uPen + 0.5, edge);
            #endif
            col = mix(col, moon, drawn * uNight * step(0.0, dir.y - uHorizonY));
          }
          #ifndef FILM
          // The horizon line, drawn with the pen just above the sea's far edge.
          float above = (dir.y - uHorizonY) / max(fwidth(dir.y), 1e-6);
          col = mix(col, uInk, (1.0 - smoothstep(uPen - 0.5, uPen + 0.5, above)) * step(-2.0, above));
          #endif
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
      defines: FILM ? { PUFFS: puffs.length, FILM: '' } : { PUFFS: puffs.length },
      uniforms: {
        ...inkUniforms,
        uPuffs: { value: puffs.map(([x, y, r]) => new THREE.Vector3(x, y, r)) },
        uCloud: { value: new THREE.Color(COLORS.cloud) },
        // The film's cumulus shade a little bluer under their puffs.
        uShade: { value: new THREE.Color(FILM ? '#C9D6E6' : COLORS.cloudShade) },
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
          #ifdef FILM
          // Painted without a line as the film's cumulus are: each puff white where the light finds
          // it and softly blue-grey under it, the whole cloud shadowed toward its flat base, its
          // edge soft.
          float nearest = 1e5;
          vec2 rel = vec2(0.0);
          for (int i = 0; i < PUFFS; i++) {
            vec3 c = uPuffs[i];
            float d = length(p - c.xy) - c.z;
            if (d < nearest) { nearest = d; rel = (p - c.xy) / c.z; }
          }
          float under = smoothstep(-0.2, 0.75, dot(rel, vec2(0.3, 0.95))) * 0.75;
          float shaded = max(under, smoothstep(150.0, 222.0, p.y));
          gl_FragColor = vec4(mix(uCloud, uShade, shaded) * uTint, 1.0 - smoothstep(-1.2, 1.2, px));
          #else
          float alpha = 1.0 - smoothstep(uPen - 0.5, uPen + 0.5, px);
          float top = 1.0 - smoothstep(-0.5, 0.5, white / max(fwidth(white), 1e-4));
          vec3 col = mix(uInk * uAmbient, mix(uShade, uCloud, top) * uTint, inside);
          gl_FragColor = vec4(col, alpha);
          #endif
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
      [0, -29.5, 4.3, 14],
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
