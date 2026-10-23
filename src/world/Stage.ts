import * as THREE from 'three';
import type { Character } from '../characters/Character';
import { sharedUniforms } from '../characters/CharacterMaterial';
import { Cave } from './Cave';
import { FilmClouds } from './Clouds';
import { MOON_RADIUS, newSkyLook, skyAt, SUN_RADIUS } from './DayNight';
import { FIRE_GLOW_GLSL, Firelight, fireUniforms } from './Firelight';
import { Footprints } from './Footprints';
import { glowUniforms } from './Glow';
import { inkUniforms, windUniforms } from './Ink';
import {
  FLOOR_GLSL,
  WATER_EDGE,
  groundHeight,
  loadTerrain,
  outsideWalkable,
  setCave,
  terrainHeight,
  waterLevelAt,
  type Terrain,
} from './Island';
import { Landmarks } from './Landmarks';
import {
  FILM,
  FIRE_MARK,
  MIRROR_LAYER,
  filmLights,
  caveUniform,
  goldenUniform,
  jungleHaze,
  lightShafts,
  moonUniforms,
  nightUniform,
  roomUniforms,
  sunUniform,
} from './Look';
import { canopyShade } from './Obstacles';
import { Butterflies } from './Butterflies';
import { Props, type Placed } from './Props';
import { WadeRings, wadeGlsl } from './Ripples';
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
/** In the film look, how many of those wading in the water it rings round at once (see setWaders); and
 * out of your own eyes, how much of the foam hugging your own legs shows, the ring round your feet that
 * would otherwise frame the water you look into, and your face in it. */
const WADERS = 6;
const OWN_COLLAR = 0.35;
/** In the film look, how far from the camera what stands by the calm water is mirrored in it (see
 * drawMirror), how high over the water (from their feet), and how big its mirror is drawn, as a share
 * of the frame each way. */
const MIRROR_REACH = 40;
const MIRROR_HEIGHT = 3;
const MIRROR_SCALE = 0.5;
/** Where round someone to look for the water that would mirror them (see byWater), in metres. */
const BY_WATER: [number, number][] = [
  [0, 0],
  [2, 0],
  [-2, 0],
  [0, 2],
  [0, -2],
];
/** In the film look, how near the waterfall's pool the camera comes before what the pool mirrors is
 * captured again (see reflectPool), and how far round the pool its water is the one mirrored. */
const POOL_REACH = 120;
const POOL_MIRROR_REACH = 30;
const _frustum = new THREE.Frustum();
const _viewProjection = new THREE.Matrix4();
const _sphere = new THREE.Sphere();
const _size = new THREE.Vector2();
const _clear = new THREE.Color();
const _up = new THREE.Vector3(0, 1, 0);
const _onWater = new THREE.Vector3();
const _eye = new THREE.Vector3();
const _shaded = new THREE.Vector3();
const _ahead = new THREE.Vector3();
const _turn = new THREE.Matrix4();
const _waterPlane = new THREE.Plane();
const _clip = new THREE.Vector4();
const _q = new THREE.Vector4();
/** From a camera's clip space to the picture's 0..1. */
const TO_PICTURE = new THREE.Matrix4().set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);

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
  /** In the film look, its water as the film paints it, measured on its aerial shot of the lagoon and
   * its beach seen from above (2026-10-21): pale and clear at the edge (WATER_EDGE), a richer
   * turquoise over the lagoon, azure where it deepens. */
  filmShallow: '#2BC9B4',
  filmMid: '#1F95D6',
  filmDeep: '#2474D6',
  foam: '#F4FFFC',
  // The jungle waterfall's pool: deep green under the trees, as in the film's frame.
  poolEdge: '#5DA88B',
  pool: '#2C6658',
  poolDeep: '#22554A',
  cloud: '#FFFFFF',
  cloudShade: '#DCE4EC',
  moon: '#F5F1C9',
  star: '#FFFBE8',
  /** In the film look the moon is a pale yellow, as the film paints its full moon (the user's frame
   * of it, 2026-10-20), and the stars pale cyan, as its night jungle paints them. */
  filmMoon: '#E6E8C8',
  filmStar: '#B8F0FF',
};
const _haze = new THREE.Color();
const _hazeLight = new THREE.Color();
const _hazeSky = new THREE.Color();
/** The sky's soft glow round the sun by day, and how it turns in the golden hour. */
const GLOW_TINT = new THREE.Color(1.0, 0.97, 0.88);
const GOLDEN_GLOW = new THREE.Color(1.0, 0.8, 0.46);
/** The cool cyan the moon rims things with at the height of the night (see moonEdges). */
const MOON_RIM = new THREE.Color(0.12, 0.36, 0.5);
/** The sunlight slanting into the waterfall's clearing: its colour by day and its strength (screened,
 * see lightShafts: as bright on the clearing, on the whole, as 0.11 added). */
const SHAFT_COLOUR = '#FFF3CF';
/** How readily the water takes a fire's colour where its light falls (a share of the eased light,
 * see the water's fragment shader), how much brighter it goes in it, and how bright the flames'
 * roads on its ripples are (see fireRoad). */
const WATER_FIRE = 0.65;
const WATER_FIRE_LIFT = 0.25;
const WATER_ROAD = 0.3;
const SHAFT_STRENGTH = 0.14;
const CONFETTI = ['#F0C866', '#F4A9B8', '#9FD3F0', '#F29E6B', '#FFFFFF', '#B9E58C'];

/**
 * Has `root`'s meshes let go of their vertices once the GPU holds them: nothing reads them after the
 * island is built, and the browser would otherwise keep every shape twice, once for the GPU and once
 * for itself (the plants, props, rocks and cave hold some 240 MB of them). Each mesh's bounds are
 * worked out first, for the culling and whatever else asks after them. Only what is never changed;
 * a mesh first drawn later lets go of its own when it is (the understory's patches, put together as
 * the camera comes near, do the same: see Vegetation.build). A lost GPU context then cannot be put
 * back from them, so the game starts again (see Game).
 */
function releaseOnUpload(root: THREE.Object3D): void {
  root.traverse((o) => {
    const geometry = (o as THREE.Mesh).geometry as THREE.BufferGeometry | undefined;
    if (!geometry?.isBufferGeometry || !geometry.getAttribute('position')) return;
    if (!geometry.boundingSphere) geometry.computeBoundingSphere();
    if (!geometry.boundingBox) geometry.computeBoundingBox();
    for (const attribute of [...Object.values(geometry.attributes), geometry.index]) {
      if (attribute instanceof THREE.BufferAttribute && attribute.usage === THREE.StaticDrawUsage) attribute.onUpload(release);
    }
  });
}

/** An attribute's array let go of, once it has gone to the GPU (see releaseOnUpload). */
function release(this: THREE.BufferAttribute): void {
  (this as { array: unknown }).array = null;
}

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
    /** In the film look, the sky as its ripples catch it (see paintSky), and the way to the sun, whose
     * glitter it throws back. */
    uSeaSky: { value: new THREE.Color(COLORS.skyHorizon) },
    uSunDir: { value: new THREE.Vector3(0, 1, 0) },
  };
  /** In the film look, the foam whoever wades in the island's water makes in it (see setWaders): round
   * them, and the rings they leave, each where it was made. */
  private readonly waders = new WadeRings(WADERS);
  /** Who stands on the island (see setCast): for the rings round who wades, the calm water's mirror,
   * and what the pool's mirror leaves out. */
  private cast: Character[] = [];
  /** In the film look, the prints those walking near the camera leave in the sand (see tread). */
  private prints: Footprints | null = null;
  /** In the film look, the calm water's mirror of what stands by it (see drawMirror): the camera
   * under the water that sees it, the picture it draws, and what the water reads it by: the picture,
   * from where on the water to where in the picture, and the level of the water it mirrors (far
   * under everything when there is nothing to mirror). */
  private readonly mirror = {
    camera: new THREE.PerspectiveCamera(),
    picture: new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType }),
    uniforms: {
      uMirror: { value: null as THREE.Texture | null },
      uMirrorMatrix: { value: new THREE.Matrix4() },
      uMirrorLevel: { value: -1e4 },
    },
  };
  /** In the film look, whether the calm water mirrors what stands by it (a graphics setting), and who
   * of the cast it leaves out this frame, away from the water (see drawMirror). */
  reflections = true;
  private readonly offWater: Character[] = [];
  /** The sea's level and, once the island has loaded, the waterfall pool's middle, reach and level. */
  private seaLevel = WATER_LEVEL;
  private poolAt: { x: number; z: number; radius: number; level: number } | null = null;
  private readonly look = newSkyLook();
  /** Toward the sun (or the moon), for keeping the film look's shadows round the camera. */
  private readonly lightDir = new THREE.Vector3(0, 1, 0);
  private readonly ahead = new THREE.Vector3();
  private landmarks: Landmarks | null = null;
  private props: Props | null = null;
  /** In the film look, the light the torches, windows and lanterns throw after dark. */
  private firelight: Firelight | null = null;
  private vegetation: Vegetation | null = null;
  private butterflies: Butterflies | null = null;
  /** In the film look, the waterfall's pool and the camera that captures what it mirrors, and the
   * face of its cube it captures next (6: none wanted, see recapturePool). */
  private pool: { surface: THREE.Mesh; probe: THREE.CubeCamera; face: number } | null = null;
  /** In the film look, the sunlight slanting into the waterfall's clearing. */
  private shafts: THREE.Mesh | null = null;
  /** The hour's sky colours, overhead and at the horizon (see paintSky). */
  private readonly skyTop = new THREE.Color();
  private readonly skyHorizon = new THREE.Color();
  /** The hour and the moment last set (see setHour, update), and whether the dark test is on (see
   * darkTest). */
  private hours = 10;
  private time = 0;
  private dark = false;
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
      // What the calm water mirrors is lit as it stands (see drawMirror).
      this.hemi.layers.enable(MIRROR_LAYER);
      this.light.layers.enable(MIRROR_LAYER);
      this.mirror.camera.layers.set(MIRROR_LAYER);
      this.mirror.uniforms.uMirror.value = this.mirror.picture.texture;
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
    // In the film look, what stands between the water and the sun shades it.
    this.sea.receiveShadow = FILM;
    world.add(this.sea);
    this.cloudMaterial = this.makeCloudMaterial();
    if (FILM) {
      // The film look's clouds, many of their own shapes round the sky (see Clouds.ts).
      this.filmClouds = new FilmClouds(this.skyMaterial.uniforms.uHorizon, this.waterLight.uTint);
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
    if (FILM) this.prints = new Footprints(terrain);
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
   * waterfall lands; still, as the film paints it, its ripples catching hardly any of the sky and
   * the sun glittering on it only where it falls through the trees.
   */
  private setSeaFloor(terrain: Terrain): void {
    const u = this.water.uniforms;
    const { origin, size, pool, waterfall } = terrain.info;
    u.uFloor.value = terrain.texture;
    u.uMap.value.set(origin[0], origin[1], size, terrain.info.height.grid);
    u.uLevel.value = terrain.info.water;
    this.seaLevel = terrain.info.water;
    // (The forbidden cave's water, the sea come in under the spur, is the cave's own: see Cave.ts.)
    if (!pool) return;
    this.poolAt = { x: pool.centre[0], z: pool.centre[1], radius: pool.radius, level: pool.level };
    const water = this.water.clone();
    for (const name of ['uTime', 'uFloor', 'uMap'] as const) water.uniforms[name] = u[name];
    Object.assign(water.uniforms, this.waterLight, this.waders.uniforms, this.mirror.uniforms, {
      uLevel: { value: pool.level },
      uSurf: { value: 0 },
      uEdge: { value: new THREE.Color(COLORS.poolEdge) },
      uShallow: { value: new THREE.Color(COLORS.pool) },
      uMid: { value: new THREE.Color(COLORS.poolDeep) },
      uDeep: { value: new THREE.Color(COLORS.poolDeep) },
      uRipples: { value: 0.12 },
      uGlitter: { value: 0.5 },
      // (Its colours by depth as they were matched with the film's frame of it.)
      uShallowAt: { value: new THREE.Vector2(0.1, 1.2) },
      uMidAt: { value: new THREE.Vector2(2.6, 6.0) },
      uDeepAt: { value: new THREE.Vector2(8.0, 16.0) },
      uFromAbove: { value: 1 },
    });
    if (waterfall) water.uniforms.uSplash.value.set(waterfall.foot[0], waterfall.foot[1], waterfall.splash, 0);
    const surface = new THREE.Mesh(new THREE.CircleGeometry(pool.radius + 4, 64).rotateX(-Math.PI / 2), water);
    surface.position.set(pool.centre[0], pool.level, pool.centre[1]);
    surface.receiveShadow = FILM;
    this.world.add(surface);
    if (FILM) {
      // In the film look the pool mirrors the rock, the waterfall and the trees round it.
      const target = new THREE.WebGLCubeRenderTarget(256, { type: THREE.HalfFloatType });
      const probe = new THREE.CubeCamera(0.5, 600, target);
      probe.position.set(pool.centre[0], pool.level + 1.2, pool.centre[1]);
      this.scene.add(probe);
      water.uniforms.uReflect = { value: target.texture };
      water.uniforms.uReflectOn = { value: 1 };
      this.pool = { surface, probe, face: 6 };
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

  /** In the film look, has what the waterfall's pool mirrors captured again (see reflectPool), as the
   * light changes. */
  recapturePool(): void {
    if (this.pool) this.pool.face = 0;
  }

  /**
   * In the film look, captures what the waterfall's pool mirrors, a face of its cube each call while
   * a capture is wanted (see recapturePool), and only with the camera near enough to see the pool
   * (until then the capture waits): everything round it but the pool itself and the cast (who move
   * on), seen from the pool's middle with the plants near it drawn in full and the last frame's
   * shadows. Kept until the light changes. (All six faces at once, wherever the camera was, had cost
   * about 12.6 ms in one frame on the dev PC every half an hour of the island's day.)
   */
  reflectPool(renderer: THREE.WebGLRenderer, camera: THREE.Camera): void {
    const pool = this.pool;
    if (!pool || pool.face >= 6 || camera.position.distanceTo(pool.surface.position) > POOL_REACH) return;
    const { surface, probe } = pool;
    const shown = this.cast.map((ch) => ch.root.visible);
    for (const ch of this.cast) ch.root.visible = false;
    surface.visible = false;
    this.vegetation?.update(probe as unknown as THREE.Camera);
    this.sky.position.copy(probe.position);
    // The last frame's shadows, once there are any: the first capture, before the first frame has
    // drawn them, draws its own, or everything lit would be left out of the mirror.
    const auto = renderer.shadowMap.autoUpdate;
    if (this.light.shadow.map) renderer.shadowMap.autoUpdate = false;
    // One face, as the probe's own update draws all six.
    if (probe.coordinateSystem !== renderer.coordinateSystem) {
      probe.coordinateSystem = renderer.coordinateSystem;
      probe.updateCoordinateSystem();
    }
    const before = renderer.getRenderTarget();
    renderer.setRenderTarget(probe.renderTarget, pool.face);
    renderer.render(this.scene, probe.children[pool.face] as THREE.Camera);
    renderer.setRenderTarget(before);
    pool.face++;
    renderer.shadowMap.autoUpdate = auto;
    this.sky.position.copy(camera.position);
    this.vegetation?.update(camera);
    surface.visible = true;
    this.cast.forEach((ch, i) => (ch.root.visible = shown[i]));
  }

  /** Lights the island for `hours` past midnight: the sky, the sun or the moon, the sea, the
   * clouds, everything drawn with the ambient tint, and the festival's lights. */
  setHour(hours: number): void {
    this.hours = hours;
    const look = skyAt(hours, this.look);
    const u = this.skyMaterial.uniforms;
    this.skyTop.copy(look.top);
    this.skyHorizon.copy(look.horizon);
    this.paintSky();
    u.uSunDir.value.copy(look.sunDir);
    // The sun is the colour of its light: white by day, gold in the golden hour, orange as it sets.
    u.uSunColor.value.copy(look.light);
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
    // By night a lit room's roof and walls keep the sky's and the moon's light off what is in it, as
    // the night comes on (as filmLights softens the moon's shadows).
    fireUniforms.uFireRoofed.value = FILM ? THREE.MathUtils.smoothstep(look.night, 0.6, 1) : 0;
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
    // The glow round the sun turns gold too.
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
    this.waterLight.uSunDir.value.copy(look.sunDir);
    this.waterLight.uNight.value = look.night;
    glowUniforms.uGlow.value = look.glow;
    this.cave?.setLight(look);
    if (this.dark) this.putOut();
  }

  /**
   * For proving that nothing hidden by distance leaves a hole where it should show (the dev tools'
   * seeThrough): with `on`, the forbidden cave's inside and the houses' rooms are drawn however far off
   * they are and wherever the camera looks, until it is called off.
   */
  drawAll(on: boolean): void {
    if (this.cave) {
      this.cave.drawAll = on;
      if (on) this.cave.group.visible = true;
    }
    this.props?.showAll(on);
  }

  /** The houses' doorways and windows, each once: its middle on the wall's outer face, the way out of
   * it, and its half width and half height (see Firelight's Opening). For the dev tools' seeThrough. */
  houseOpenings(): { centre: [number, number, number]; out: [number, number, number]; half: [number, number] }[] {
    const found = new Map<string, { centre: [number, number, number]; out: [number, number, number]; half: [number, number] }>();
    for (const fire of this.props?.fires ?? []) {
      const o = fire.opening;
      if (!o) continue;
      const key = `${o.centre.x.toFixed(2)},${o.centre.y.toFixed(2)},${o.centre.z.toFixed(2)}`;
      if (!found.has(key)) found.set(key, { centre: [o.centre.x, o.centre.y, o.centre.z], out: [o.out.x, o.out.y, o.out.z], half: o.half });
    }
    return [...found.values()];
  }

  /**
   * For proving that nothing on the island gives light of its own: with `on`, every source of its
   * light is put out (see putOut), and the forbidden cave's with them (Cave.darkTest), until it is
   * called off; whatever still shows lit then is light from nowhere (the dev tools' islandDark renders
   * and finds it). The sky (and the moon and stars in it, and its clouds) is drawn where nothing else
   * is, and is left as it is.
   */
  darkTest(on: boolean): void {
    this.dark = on;
    this.cave?.darkTest(on);
    if (on) {
      this.putOut();
      return;
    }
    this.waterLight.uMoon.value.set(COLORS.moon);
    this.setHour(this.hours);
    this.firelight?.update(glowUniforms.uGlow.value, this.time);
  }

  /**
   * Every source of the island's light out (see darkTest). Nothing else may light anything on it: no
   * colour of its own in a shader, no copy of one of these that this cannot reach.
   */
  private putOut(): void {
    // The sun, or the moon once it has set; and the sky's light and the ground's on what faces them.
    this.light.intensity = 0;
    this.hemi.intensity = 0;
    // The hour's light on what is painted flat: the cast, their lines and their shadows, the pen's
    // lines, the falling water and its mist.
    sharedUniforms.uAmbient.value.setRGB(0, 0, 0);
    // The moon's cool rim on leaves, trunks and rock, and its road on the sea.
    moonUniforms.uMoonRim.value.setRGB(0, 0, 0);
    this.waterLight.uMoon.value.setRGB(0, 0, 0);
    // The sky's light in the air, which far things fade into; on the sea, in its ripples, and its haze.
    (this.scene.fog as THREE.Fog).color.setRGB(0, 0, 0);
    this.waterLight.uTint.value.setRGB(0, 0, 0);
    this.waterLight.uSeaSky.value.setRGB(0, 0, 0);
    this.waterLight.uSeaHaze.value.setRGB(0, 0, 0);
    // The clouds' light (seen from high up, they float over the island) and the sun's shafts into the
    // waterfall's clearing.
    this.filmClouds?.putOut();
    if (this.shafts) (this.shafts.material as THREE.ShaderMaterial).uniforms.uStrength.value = 0;
    // The island's lights: its windows and lanterns, the flames (drawn only while they burn), and the
    // light grid's light from all of them, the houses' baked lantern light and the light on the cast.
    glowUniforms.uGlow.value = 0;
    this.firelight?.update(0, this.time);
  }

  /** The hour's sky colours onto the sky, the background and the haze, the same wherever the camera
   * is; and onto the sea's ripples, which catch the sky low over the horizon. */
  private paintSky(): void {
    const u = this.skyMaterial.uniforms;
    u.uTop.value.copy(this.skyTop);
    u.uHorizon.value.copy(this.skyHorizon);
    (this.scene.background as THREE.Color).copy(u.uHorizon.value);
    (this.scene.fog as THREE.Fog).color.copy(u.uHorizon.value);
    this.waterLight.uSeaSky.value.copy(u.uHorizon.value).lerp(u.uTop.value, 0.25);
  }

  /** The brands the village's torches hold (see Props.brands): each where its flame burns. */
  get brands(): { kind: string; at: THREE.Vector3 }[] {
    return this.props?.brands ?? [];
  }

  /** Brand `i` put back in its stand (`lit`) or taken out of it: its flame shown or not, its light lit or put
   * out (see Props.setBrand, Firelight.setLit). */
  setBrand(i: number, lit: boolean): void {
    const brand = this.props?.brands[i];
    if (!brand) return;
    this.props?.setBrand(i, lit);
    this.firelight?.setLit(brand.fire, lit);
  }

  /** A torch carried about, its flame at `at` (null: none), lighting what is round it after dark (see
   * Firelight.setHeld). */
  setHeldLight(at: THREE.Vector3 | null): void {
    this.firelight?.setHeld(at);
  }

  /** Who stands on the island: the cast and the crowd. Called once they have been placed. */
  setCast(cast: Character[]): void {
    this.cast = cast;
  }

  /**
   * In the film look, who of the cast wades in water (not riding in the boat), for the foam their legs
   * make in it and the rings they leave (see WadeRings): in the island's sea or the pool, or in the
   * forbidden cave's (Cave.waders); as far round them as the water meets them, deeper the higher up them
   * (their skirts flare out). `time` is the water's clock (update's). Called each frame before update.
   */
  setWaders(time: number): void {
    if (!FILM) return;
    const island = this.waders;
    const cave = this.cave;
    island.begin();
    cave?.waders.begin();
    for (const ch of this.cast) {
      if (ch.ride || !ch.root.visible || !ch.shown) continue;
      const p = ch.root.position;
      const inCave = cave?.isInside(p.x, p.y + 0.3, p.z) ?? false;
      const deep = (cave && inCave ? cave.info.water : waterLevelAt(p.x, p.z)) - p.y;
      if (deep <= 0.01 || deep > 1.2) continue;
      const radius = ch.width * 0.44 * THREE.MathUtils.smoothstep(deep, 0.03, 0.14) + 0.06;
      const collar = ch.lookedOutOf ? OWN_COLLAR : 1;
      (cave && inCave ? cave.waders : island).wade(ch, p.x, p.z, radius, Math.min(1, deep / 0.06), time, collar);
    }
    island.end(time);
    cave?.waders.end(time);
  }

  /** In the film look, the prints those of the cast walking near the camera leave in the sand, `me` (whose eyes
   * you see out of, or whom the camera follows) among them (see Footprints). Called each frame once everyone
   * and the camera have moved, before the frame is drawn. */
  tread(renderer: THREE.WebGLRenderer, camera: THREE.Camera, dt: number, me: Character): void {
    this.prints?.update(renderer, camera.position, dt, this.cast, me);
  }

  /**
   * In the film look, draws the calm water's mirror of what stands by it, as this frame's camera
   * sees it (MIRROR_LAYER: the cast, the pier and the quay, the ferry), in the water nearest the
   * camera (the waterfall's pool round its clearing, the sea elsewhere), into a picture half the
   * frame's width and height that the water reads (see makeWaterMaterial). Nothing else is drawn in
   * it (no sky, no land, no lines), with the last frame's shadows, and of the cast only those by the
   * water (see byWater: the rest could only be mirrored under the land); and none of it at all unless
   * the mirror image of something in it could be in the camera's view. Called just before the frame
   * is drawn.
   */
  drawMirror(renderer: THREE.WebGLRenderer, camera: THREE.PerspectiveCamera): void {
    const level = this.mirror.uniforms.uMirrorLevel;
    level.value = -1e4;
    const p = camera.position;
    const h = this.mirrorLevel(p);
    if (h === null) return;
    camera.updateMatrixWorld();
    _frustum.setFromProjectionMatrix(_viewProjection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
    const away = this.offWater;
    away.length = 0;
    let seen = false;
    for (const ch of this.cast) {
      if (!ch.root.visible || !ch.shown) continue;
      const at = ch.root.position;
      if (!this.byWater(at, h, p)) {
        away.push(ch);
        continue;
      }
      _sphere.center.set(at.x, 2 * h - (at.y + ch.height / 2), at.z);
      _sphere.radius = 0.6 * Math.max(ch.height, ch.width);
      seen ||= _frustum.intersectsSphere(_sphere);
      // Bent over the water to look into it, their face is carried out over it (see Character.setBow).
      if (ch.bowAmount > 0) {
        _sphere.center.set(ch.bowAt.x, 2 * h - ch.bowAt.y, ch.bowAt.z);
        seen ||= _frustum.intersectsSphere(_sphere);
      }
    }
    for (const s of this.props?.mirrored ?? []) {
      if (seen) break;
      if (p.distanceTo(s.center) - s.radius > MIRROR_REACH) continue;
      _sphere.center.set(s.center.x, 2 * h - s.center.y, s.center.z);
      _sphere.radius = s.radius;
      seen = _frustum.intersectsSphere(_sphere);
    }
    if (!seen) return;
    for (const ch of away) ch.root.visible = false;
    renderer.getDrawingBufferSize(_size);
    const picture = this.mirror.picture;
    const wide = Math.max(1, Math.round(_size.x * MIRROR_SCALE));
    const tall = Math.max(1, Math.round(_size.y * MIRROR_SCALE));
    if (picture.width !== wide || picture.height !== tall) picture.setSize(wide, tall);
    const mirror = this.aimMirror(camera, h);
    const background = this.scene.background;
    this.scene.background = null;
    renderer.getClearColor(_clear);
    const alpha = renderer.getClearAlpha();
    renderer.setClearColor(0x000000, 0);
    const auto = renderer.shadowMap.autoUpdate;
    renderer.shadowMap.autoUpdate = false;
    const before = renderer.getRenderTarget();
    renderer.setRenderTarget(picture);
    renderer.clear();
    renderer.render(this.scene, mirror);
    renderer.setRenderTarget(before);
    renderer.shadowMap.autoUpdate = auto;
    renderer.setClearColor(_clear, alpha);
    this.scene.background = background;
    for (const ch of away) ch.root.visible = true;
    level.value = h;
  }

  /** In the film look, the level of the calm water mirrored for a camera at p (see drawMirror): the
   * waterfall's pool's round its clearing, the sea's elsewhere; null where none is (reflections turned
   * off, in the forbidden cave, under the water). */
  mirrorLevel(p: THREE.Vector3): number | null {
    if (!FILM || !this.reflections) return null;
    const pool = this.poolAt;
    const nearPool = pool !== null && Math.hypot(p.x - pool.x, p.z - pool.z) < pool.radius + POOL_MIRROR_REACH && p.y > pool.level;
    const h = pool && nearPool ? pool.level : this.seaLevel;
    if (p.y < h + 0.05 || this.cave?.encloses(p.x, p.y, p.z)) return null;
    return h;
  }

  /** Whether someone standing at `at` is by the water at height h, near enough to the camera (at p) for
   * the calm water to mirror them: their feet over it or not far above it, and the water within a
   * couple of metres of them. */
  private byWater(at: THREE.Vector3, h: number, p: THREE.Vector3): boolean {
    if (at.y - h > MIRROR_HEIGHT || at.y < h - 1.5 || p.distanceTo(at) > MIRROR_REACH) return false;
    for (const [dx, dz] of BY_WATER) if (terrainHeight(at.x + dx, at.z + dz) < h) return true;
    return false;
  }

  /**
   * The mirror's camera for `camera` over water at height h: under the water, as far below it as the
   * camera is above, looking up the way the camera looks down, its near plane laid on the water (so
   * nothing under the water is drawn: Lengyel's oblique clipping, as three's Reflector does it); and,
   * into the water's uniforms, from where on the water to where in the mirror's picture.
   */
  private aimMirror(camera: THREE.PerspectiveCamera, h: number): THREE.PerspectiveCamera {
    const mirror = this.mirror.camera;
    _onWater.set(camera.position.x, h, camera.position.z);
    _eye.setFromMatrixPosition(camera.matrixWorld);
    _turn.extractRotation(camera.matrixWorld);
    mirror.position.subVectors(_onWater, _eye).reflect(_up).negate().add(_onWater);
    _ahead.set(0, 0, -1).applyMatrix4(_turn).add(_eye);
    _ahead.subVectors(_onWater, _ahead).reflect(_up).negate().add(_onWater);
    mirror.up.set(0, 1, 0).applyMatrix4(_turn).reflect(_up);
    mirror.lookAt(_ahead);
    mirror.far = camera.far;
    mirror.updateMatrixWorld();
    mirror.projectionMatrix.copy(camera.projectionMatrix);
    this.mirror.uniforms.uMirrorMatrix.value.copy(TO_PICTURE).multiply(mirror.projectionMatrix).multiply(mirror.matrixWorldInverse);
    _waterPlane.setFromNormalAndCoplanarPoint(_up, _onWater).applyMatrix4(mirror.matrixWorldInverse);
    _clip.set(_waterPlane.normal.x, _waterPlane.normal.y, _waterPlane.normal.z, _waterPlane.constant);
    const e = mirror.projectionMatrix.elements;
    _q.set((Math.sign(_clip.x) + e[8]) / e[0], (Math.sign(_clip.y) + e[9]) / e[5], -1, (1 + e[10]) / e[14]);
    _clip.multiplyScalar(2 / _clip.dot(_q));
    e[2] = _clip.x;
    e[6] = _clip.y;
    e[10] = _clip.z + 1 - 0.003;
    e[14] = _clip.w;
    mirror.projectionMatrixInverse.copy(mirror.projectionMatrix).invert();
    return mirror;
  }

  /** How deep in the trees' shade the point (x, y, z) is from the sun (or the moon), 0 to 1; by night
   * none in a lit room, whose roof keeps the moon off and whose lantern lights who stands there (see
   * fireUniforms.uFireRoofed). */
  shadeAt(x: number, y: number, z: number): number {
    const shade = canopyShade(x, y, z, this.lightDir);
    const roofed = fireUniforms.uFireRoofed.value;
    if (shade > 0 && roofed > 0 && this.firelight?.roomAt(_shaded.set(x, y, z))) return shade * (1 - roofed);
    return shade;
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
   * game as it first comes into view, the props' painted textures drawn into place meanwhile; and has
   * the island's shapes let go of their vertices once they are on the GPU (see releaseOnUpload).
   * Called once everything is in the scene. */
  async warmShaders(renderer: THREE.WebGLRenderer, camera: THREE.Camera): Promise<void> {
    for (const group of [this.vegetation?.group, this.props?.group, this.landmarks?.group, this.cave?.group]) {
      if (group) releaseOnUpload(group);
    }
    await Promise.all([this.props?.uploadPaint(renderer), renderer.compileAsync(this.scene, camera)]);
  }

  update(camera: THREE.Camera, time: number): void {
    this.time = time;
    this.water.uniforms.uTime.value = time;
    if (this.shafts) (this.shafts.material as THREE.ShaderMaterial).uniforms.uTime.value = time;
    this.skyMaterial.uniforms.uTime.value = time;
    this.landmarks?.update(time);
    this.props?.update(time, camera);
    caveUniform.value = 0;
    let lookout: { x: number; z: number; r: number } | null = null;
    if (this.cave) {
      this.cave.update(time, camera, this.caveTorches.carried, this.caveTorches.boat);
      // No jungle haze in the cave: from inside it (or the rock round it) everything seen is the cave's
      // own dark, and its own night, not the moonlit grade's.
      const p = camera.position;
      if (this.cave.encloses(p.x, p.y, p.z)) jungleHaze.uJungleThick.value = 0;
      caveUniform.value = this.cave.immersion(p.x, p.y, p.z);
      // From deep in it, the outside shows only up the skylight's well: the rest is not drawn.
      lookout = this.cave.lookout(p.x, p.y, p.z);
    }
    if (this.landmarks) this.landmarks.group.visible = !lookout;
    this.firelight?.update(glowUniforms.uGlow.value, time);
    // The lit room the camera stands in, for the grade: counting from a third of a metre in from its
    // doorway, as far as the night has come (see roomUniforms).
    const inside = FILM ? this.firelight?.roomAt(camera.position) : null;
    if (inside) {
      const { centre, half, yaw } = inside.room;
      roomUniforms.uRoomMiddle.value.set(centre.x, centre.y, centre.z, yaw);
      const counts = THREE.MathUtils.smoothstep(inside.depth, 0, 0.35) * fireUniforms.uFireRoofed.value;
      roomUniforms.uRoomHalf.value.set(half.x, half.y, half.z, counts);
    } else roomUniforms.uRoomHalf.value.w = 0;
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
    if (this.dark) this.putOut();
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
    // In the film look it is painted as the film paints its sea (see the fragment shader): shaded
    // where something stands between it and the sun (three's own shadow map, so it takes the
    // scene's lights), the sky caught in its ripples, the sun's glitter, the sun netted on the sand
    // under its shallows, rings round whoever wades in it. GLITTER and CAUSTICS are the dearest of
    // these, about half a millisecond each with the water filling the screen (1024 x 768 on the dev
    // PC); a graphics setting can take either out of the defines.
    return new THREE.ShaderMaterial({
      defines: FILM ? { FILM: '', GLITTER: '', CAUSTICS: '' } : {},
      lights: FILM,
      uniforms: {
        ...(FILM ? THREE.UniformsUtils.clone(THREE.UniformsLib.lights) : {}),
        uTime: { value: 0 },
        uFloor: { value: deep },
        uMap: { value: new THREE.Vector4(-1, -1, 2, 2) },
        uLevel: { value: WATER_LEVEL },
        uDepth: { value: 0 },
        uSurf: { value: 1 },
        uSplash: { value: new THREE.Vector4(0, 0, 0, 0) },
        uEdge: { value: new THREE.Color(COLORS.edge) },
        uShallow: { value: new THREE.Color(FILM ? COLORS.filmShallow : COLORS.shallow) },
        uMid: { value: new THREE.Color(FILM ? COLORS.filmMid : COLORS.mid) },
        uDeep: { value: new THREE.Color(FILM ? COLORS.filmDeep : COLORS.deep) },
        // The depths, in metres, over which each colour gives way to the next: in the film look pale
        // and clear only over the first half metre, turquoise beyond, blue from a couple of metres
        // down, as the film paints its beaches seen from above; and how bright the water is seen
        // from straight above, against seen across it (see the shader).
        uShallowAt: { value: FILM ? new THREE.Vector2(0.05, 0.7) : new THREE.Vector2(0.1, 1.2) },
        uMidAt: { value: FILM ? new THREE.Vector2(1.8, 4.5) : new THREE.Vector2(2.6, 6.0) },
        uDeepAt: { value: FILM ? new THREE.Vector2(5.0, 12.0) : new THREE.Vector2(8.0, 16.0) },
        uFromAbove: { value: 0.9 },
        uFoam: { value: new THREE.Color(COLORS.foam) },
        uReflect: { value: null },
        uReflectOn: { value: 0 },
        uRipples: { value: 1 },
        uGlitter: { value: 1 },
        ...(FILM ? fireUniforms : {}),
        ...this.waterLight,
        ...this.waders.uniforms,
        ...this.mirror.uniforms,
      },
      vertexShader: /* glsl */ `
        #ifdef FILM
        #include <common>
        #include <shadowmap_pars_vertex>
        #endif
        varying vec3 vWorld;
        void main() {
          vec4 worldPosition = modelMatrix * vec4(position, 1.0);
          vWorld = worldPosition.xyz;
          vec4 mvPosition = viewMatrix * worldPosition;
          #ifdef FILM
          // Where it lies in the sun's shadow map (three's own chunk, which reads these names).
          vec3 transformedNormal = normalMatrix * normal;
          #include <shadowmap_vertex>
          #endif
          gl_Position = projectionMatrix * mvPosition;
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
        uniform vec2 uShallowAt;
        uniform vec2 uMidAt;
        uniform vec2 uDeepAt;
        uniform float uFromAbove;
        uniform vec3 uFoam;
        uniform samplerCube uReflect;
        uniform float uReflectOn;
        varying vec3 vWorld;
        float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        #ifdef FILM
        uniform vec3 uSeaSky;
        uniform vec3 uSunDir;
        uniform float uRipples;
        uniform float uGlitter;
        ${wadeGlsl(WADERS)}
        uniform sampler2D uMirror;
        uniform mat4 uMirrorMatrix;
        uniform float uMirrorLevel;
        #include <common>
        #include <packing>
        #include <lights_pars_begin>
        #include <shadowmap_pars_fragment>
        #include <shadowmask_pars_fragment>
        ${FIRE_GLOW_GLSL}
        // A hash without sin, so it keeps its precision far out over the sea and as the clock runs on.
        float hash2(vec2 p) {
          vec3 q = fract(vec3(p.xyx) * 0.1031);
          q += dot(q, q.yzx + 33.33);
          return fract((q.x + q.y) * q.z);
        }
        float valueNoise(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          return mix(mix(hash2(i), hash2(i + vec2(1.0, 0.0)), f.x), mix(hash2(i + vec2(0.0, 1.0)), hash2(i + vec2(1.0)), f.x), f.y);
        }
        // The sun's glitter in one cell of a grid size metres across: the cell holds a facet of the
        // ripples, which now and then (often, the chance of it) flashes the sun into the eye for a
        // beat of its own, a fleck a little wider than tall on the screen (J: how the point on the
        // water moves from pixel to pixel). How much of the point the fleck covers, times how bright
        // it is in its beat.
        float glitter(vec2 p, float size, mat2 J, float often) {
          vec2 cell = floor(p / size);
          float h = hash2(cell);
          float beat = uTime * (0.9 + 1.1 * fract(h * 7.13)) + 17.0 * h;
          float n = floor(beat);
          if (hash2(cell + vec2(n * 0.37, n * 0.61)) > often) return 0.0;
          vec2 at = (cell + 0.3 + 0.4 * vec2(fract(h * 31.7 + n * 0.618), fract(h * 57.3 + n * 0.414))) * size;
          // From metres on the water to pixels on the screen, through J's inverse.
          vec2 w = p - at;
          float det = J[0].x * J[1].y - J[1].x * J[0].y;
          vec2 px = vec2(J[1].y * w.x - J[1].x * w.y, J[0].x * w.y - J[0].y * w.x) / det;
          float d = length(px / vec2(3.6, 2.0));
          return (1.0 - smoothstep(0.6, 1.0, d)) * smoothstep(0.0, 0.25, sin(fract(beat) * PI));
        }
        // The sunlight the ripples gather into a net of bright lines on the sand under shallow water:
        // the borders between cells round points that wander (p in cells), the lines thin where they
        // gather it hardest, wider and fainter between.
        float causticNet(vec2 p, float t) {
          p += 0.45 * vec2(sin(p.y * 1.3 + t * 0.3), sin(p.x * 1.1 - t * 0.25));
          vec2 cell = floor(p);
          vec2 f = fract(p);
          float d1 = 8.0;
          float d2 = 8.0;
          for (int j = -1; j <= 1; j++) {
            for (int i = -1; i <= 1; i++) {
              vec2 g = vec2(float(i), float(j));
              float k = hash2(cell + g);
              vec2 h = vec2(k, fract(k * 37.17));
              vec2 o = g + 0.5 + 0.38 * sin(t * (0.5 + 0.6 * h) + 6.2831 * h) - f;
              float d = dot(o, o);
              if (d < d1) {
                d2 = d1;
                d1 = d;
              } else if (d < d2) {
                d2 = d;
              }
            }
          }
          float a = sqrt(d2) - sqrt(d1);
          return 0.75 * (1.0 - smoothstep(0.0, 0.07, a)) + 0.25 * (1.0 - smoothstep(0.0, 0.21, a));
        }
        #endif
        void main() {
          // Beyond the island's map the sea floor falls away into the deep. Water with a depth of its
          // own (the cave's, under ground the height grid holds over it) is that deep all over.
          vec2 outside = max(uMap.xy - vWorld.xz, vWorld.xz - (uMap.xy + uMap.z));
          float beyond = smoothstep(0.0, 40.0, max(outside.x, outside.y));
          // By the shore, the floor filtered smoothly, so the water stops along the line the ground's
          // own waterline is drawn to (see floorAtSmooth).
          float floorHere = floorAt(vWorld.xz);
          if (uDepth <= 0.0 && abs(floorHere - uLevel) < 0.2) floorHere = floorAtSmooth(vWorld.xz);
          float depth = uDepth > 0.0 ? uDepth : mix(uLevel - floorHere, 30.0, beyond);
          if (depth < 0.01) discard;
          // Distance to the shore, from the depth and how steeply the floor rises toward it, so
          // the surf keeps its width on gentle beaches and steep rocks alike. (Only water shallow
          // enough for surf and the bands along the shore looks for it: the open sea does not.)
          float shore = 1e3;
          if (depth < 8.0) {
            float e = 1.5;
            vec2 slope = vec2(floorAt(vWorld.xz + vec2(e, 0.0)) - floorAt(vWorld.xz - vec2(e, 0.0)),
                              floorAt(vWorld.xz + vec2(0.0, e)) - floorAt(vWorld.xz - vec2(0.0, e))) / (2.0 * e);
            shore = max(depth, 0.0) / max(length(slope), 0.02);
          }

          vec3 col = mix(uEdge, uShallow, smoothstep(uShallowAt.x, uShallowAt.y, depth));
          col = mix(col, uMid, smoothstep(uMidAt.x, uMidAt.y, depth));
          col = mix(col, uDeep, smoothstep(uDeepAt.x, uDeepAt.y, depth));
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
          #ifdef FILM
          // Round whoever wades in it: foam hugging them where the water meets them, broken a little,
          // and the rings they leave, each spreading where it was made as they walk on, broken into
          // arcs as they spread and fade.
          col = mix(col, uFoam, wadeFoam(vWorld.xz, uTime));
          #endif
          vec3 view = normalize(vWorld - cameraPosition);
          // A mirror of what stands round it, darker and greener than what it mirrors, smeared
          // by ripples into long wobbles as the film paints the waterfall's pool.
          if (uReflectOn > 0.5) {
            vec2 wobble = vec2(sin(vWorld.x * 0.9 + uTime * 0.7) + sin(vWorld.z * 1.3 - uTime * 0.5),
                               sin(vWorld.z * 1.1 + uTime * 0.6) + sin(vWorld.x * 1.5 - uTime * 0.8)) * 0.004;
            vec3 seen = textureCube(uReflect, reflect(view, normalize(vec3(wobble.x, 1.0, wobble.y)))).rgb;
            float fresnel = 0.22 + 0.4 * pow(1.0 - abs(view.y), 3.0);
            col = mix(col, seen * vec3(0.36, 0.5, 0.44), fresnel * 0.8);
          }
          float alpha = 1.0;
          #ifdef FILM
          // The film paints its sea a deep teal seen across it from the shore, most of all where it
          // is deep; seen from above, the lagoon over its sand in its own colours (not paled toward
          // white: uFromAbove).
          float down = abs(view.y);
          col *= mix(mix(0.66, 0.6, smoothstep(2.0, 12.0, depth)), uFromAbove, smoothstep(0.12, 0.5, down));
          // Darker where something stands between it and the sun (or the moon), as the film darkens
          // the water beside its pier and its boat.
          float lit = getShadowMask();
          col *= mix(0.58, 1.0, lit);
          // By day, the sunlight netted on the sand under the shallows, seen looking down into them
          // where the sun reaches; not where the net would be finer than the pixels.
          float day = (1.0 - uNight) * smoothstep(0.02, 0.2, uSunDir.y);
          #ifdef CAUSTICS
          vec2 cells = vWorld.xz / 0.6;
          float caustics = smoothstep(0.05, 0.35, depth) * (1.0 - smoothstep(1.2, 3.5, depth)) * smoothstep(0.3, 0.75, down)
            * (1.0 - smoothstep(0.06, 0.16, length(fwidth(cells)))) * day * lit;
          if (caustics > 0.01) col += vec3(0.75, 1.0, 0.92) * causticNet(cells, uTime * 0.8) * caustics * 0.13;
          #endif
          #endif
          col *= uTint;
          #ifdef FILM
          // The sky caught in its ripples: broken patches of it drifting with the waves, most where the
          // water is seen across, as the film paints its sea seen from the shore, in long flat shapes
          // nearby and finer toward the horizon; none where they would be finer than the pixels.
          vec2 q = vWorld.xz * 0.7 + vec2(uTime * 0.07, uTime * 0.03);
          float across = pow(1.0 - down, 3.0) * (1.0 - smoothstep(0.06, 0.25, length(fwidth(q)))) * uRipples * 0.42;
          if (across > 0.015) {
            float n = valueNoise(q) * 0.6 + valueNoise(q * 2.7 + 5.3 - uTime * 0.05) * 0.4;
            col = mix(col, uSeaSky, smoothstep(0.58, 0.64, n) * across);
          }
          // The island's fires on it by night, under the one rule everything lit is (see Firelight):
          // their warm pools on the water round the torches, the bonfire, the lanterns and a torch
          // carried, as on the sand before the film's fire ('[anime] fire by the beach'): the water
          // takes the fire's colour where its light falls, at its own brightness and a little more
          // (the light eased as it climbs, so a torch held right over the water lays a warm pool on
          // it, not a flood); and the flames' broken roads on the ripples between the eye and each
          // flame, in the flame's light.
          float pool = 0.0;
          vec3 fireTone = col;
          if (uFireOn > 0.5) {
            vec3 fire = fireGlow(vWorld, vec3(0.0, 1.0, 0.0));
            float fireMost = max(max(fire.r, fire.g), fire.b);
            if (fireMost > 1e-3) {
              pool = smoothstep(0.1, 3.0, fireMost) * ${WATER_FIRE.toFixed(2)};
              fireTone = fire / fireMost * (dot(col, vec3(0.2126, 0.7152, 0.0722)) + ${WATER_FIRE_LIFT.toFixed(2)} * pool);
              col = mix(col, fireTone, pool);
            }
            vec3 road = fireRoad(vWorld, cameraPosition, uTime);
            col += road / (1.0 + 0.5 * max(max(road.r, road.g), road.b)) * ${WATER_ROAD.toFixed(2)};
          }
          // What stands by it mirrored in it, when it is the water mirrored this frame (see drawMirror),
          // as real water mirrors it: faint seen from above, more the further across the water it is
          // seen (as the sky's light on it gives way to what it mirrors), shifted about and smeared
          // toward the eye by the ripples (less on the calm pool), broken by them into drifting strokes,
          // with much of the water's own colour in it. Never a crisp mirror. But yourself, bent over
          // the water to look into it out of your own eyes (marked in the picture's alpha with a 2,
          // beyond anything else: see Character.setUnseen), clearly, as calm water gives back a face
          // bent over it: the ripples still wave it and break it a little.
          if (abs(uLevel - uMirrorLevel) < 0.01) {
            vec2 wob = vec2(sin(vWorld.x * 3.1 + uTime * 1.6) + sin(vWorld.z * 4.3 - uTime * 1.2),
                            sin(vWorld.z * 2.7 + uTime * 1.4) + sin(vWorld.x * 3.7 - uTime * 1.9)) * 0.05 * mix(0.35, 1.0, uRipples);
            vec4 at = uMirrorMatrix * vec4(vWorld.x + wob.x, uLevel, vWorld.z + wob.y, 1.0);
            vec2 uv = at.xy / at.w;
            vec2 smear = vec2(0.0, 3.0 / float(textureSize(uMirror, 0).y));
            vec4 m0 = texture2D(uMirror, uv);
            vec4 m1 = texture2D(uMirror, uv + smear);
            vec4 m2 = texture2D(uMirror, uv - smear);
            // (The cast mark themselves in the picture's alpha with a half, everything else with a whole.)
            vec3 taps = vec3(step(0.1, m0.a) * 2.0, step(0.1, m1.a), step(0.1, m2.a));
            float cover = (taps.x + taps.y + taps.z) * 0.25;
            if (cover > 0.0) {
              vec3 seen = (m0.rgb * taps.x + m1.rgb * taps.y + m2.rgb * taps.z) / (cover * 4.0);
              // The strokes run across the view: long, thin in depth, drifting toward the eye.
              vec2 sq = vec2(length(vWorld.xz - cameraPosition.xz) * 5.0, (vWorld.x - vWorld.z) * 0.8) + uTime * vec2(-0.9, 0.2);
              float strokes = smoothstep(0.3, 0.55, valueNoise(sq) * 0.65 + valueNoise(sq * 2.3 + 4.7) * 0.35);
              float fresnel = 0.07 + 0.7 * pow(1.0 - down, 5.0);
              float own = smoothstep(1.1, 1.5, (m0.a * 2.0 + m1.a + m2.a) * 0.25);
              col = mix(col, mix(seen, col, mix(0.4, 0.2, own)), cover * mix(strokes * fresnel, 0.72 * mix(0.8, 1.0, strokes), own));
              // Your own reflection is marked in the picture as the cast are (their mark less the fire's
              // light on them, see FIRE_MARK: theirs is 2 in the mirror, and it is not the water's to
              // keep), so the night's grade paints it as it paints them: pale blue, warm where a fire
              // lights them.
              if (own > 0.5 && cover > 0.5) {
                alpha = 0.5 - ${FIRE_MARK.toFixed(2)} * clamp((2.0 - m0.a) / ${FIRE_MARK.toFixed(2)}, 0.0, 1.0);
                // Seen over water a fire lights, your reflection takes some of the fire's colour on the
                // water with it.
                col = mix(col, fireTone, 0.4 * pool);
              }
            }
          }
          // Paling into the distance toward the horizon's haze, as the film's sea does.
          float away = length(vWorld.xz - cameraPosition.xz);
          col = mix(col, uSeaHaze, 0.8 * pow(smoothstep(25.0, 560.0, away), 0.7));
          #ifdef GLITTER
          // The sun's glitter: flecks of it flashing on the ripples, thick on the sun's path over the
          // water (where the water would face halfway between the sun and the eye, give or take the
          // ripples' slopes) and few elsewhere, in the hour's light (white by day, golden in the golden
          // hour) brighter than white on the path, so the glow haloes them. Marked in the alpha as the
          // cast are, so the brushwork leaves them crisp. One grid, its cells about as many pixels
          // across at any distance: twice the size each time the distance doubles, the chance of a
          // flash a quarter as big as the cells shrink toward the next size, so the flecks stay as
          // thick on the screen.
          mat2 J = mat2(dFdx(vWorld.xz), dFdy(vWorld.xz));
          if (day > 0.0 && abs(J[0].x * J[1].y - J[1].x * J[0].y) > 1e-10) {
            float level = log2(max(max(length(J[0]), length(J[1])) * 16.0, 1e-4) / 0.04);
            vec3 h = normalize(uSunDir - view);
            float tilt = (1.0 - h.y * h.y) / max(h.y * h.y, 1e-4);
            float path = exp(-tilt / 0.04);
            // (Seen from high above, the path covers much of the view: fewer flecks then, or they
            // salt it white.)
            float often = mix(0.02, 0.9, path) * exp2(-2.0 * fract(level)) * mix(1.0, 0.25, smoothstep(0.3, 0.8, down));
            float flash = glitter(vWorld.xz, 0.04 * exp2(floor(level)), J, often) * day * lit
              * (1.0 - smoothstep(150.0, 400.0, away)) * uGlitter;
            col = mix(col, uTint * mix(1.3, 2.2, path), flash);
            if (flash > 0.5) alpha = 0.5;
          }
          #endif
          #else
          // The sun's glints on the shallows, in the hour's light on the sea (white by day).
          vec2 cell = floor(vWorld.xz * 1.6);
          float sparkle = step(0.986, hash(cell + floor(uTime * 1.5))) * shallow * (1.0 - uNight);
          float dotMask = 1.0 - smoothstep(0.05, 0.18, length(fract(vWorld.xz * 1.6) - 0.5));
          col = mix(col, uTint, sparkle * dotMask);
          #endif
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
          gl_FragColor = vec4(col, alpha);
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
        uniform vec3 uGlowTint;
        varying vec3 vDir;
        float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float moonNoise(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0)), f.x), f.y);
        }
        // One of the moon's seas, round c with half sizes r: how far inside it q is (x) and how near
        // its edge, which the film paints a little darker (y).
        vec2 moonSea(vec2 q, vec2 c, vec2 r) {
          float d = length((q - c) / r);
          return vec2(1.0 - smoothstep(0.6, 1.0, d), smoothstep(0.62, 0.84, d) * (1.0 - smoothstep(0.86, 1.04, d)));
        }
        // A crater's rim: a thin darker ring.
        float moonCrater(vec2 q, vec2 c, float r) {
          float d = length(q - c) / r;
          return smoothstep(0.55, 0.85, d) * (1.0 - smoothstep(0.9, 1.15, d));
        }
        // A rayed crater: darker spikes out from its middle.
        float moonRays(vec2 q, vec2 c, float r, float seed) {
          vec2 d = q - c;
          float l = length(d);
          float a = atan(d.y, d.x);
          float spikes = min(pow(abs(sin(a * 7.0 + seed)), 10.0) + pow(abs(sin(a * 12.0 + seed * 2.3)), 14.0), 1.0);
          return spikes * (1.0 - smoothstep(r * 0.3, r, l)) * smoothstep(r * 0.1, r * 0.25, l);
        }
        // The full moon's face as the film paints it, across its disc (q from -1 to 1, x to the right
        // and y up as it is seen): pale, a little darker toward its edge, its seas soft grey-green
        // patches with ragged edges outlined a little darker, a chain of them down its right side, a
        // broad one over its top and a faint one low on the left, a few small craters, and two rayed
        // ones low on either side. Its colour as a share of the moon's.
        vec3 moonFace(vec2 q) {
          vec2 w = q + 0.15 * (vec2(moonNoise(q * 4.0 + 3.1), moonNoise(q * 4.0 + 9.7)) - 0.5)
                     + 0.06 * (vec2(moonNoise(q * 11.0 + 1.7), moonNoise(q * 11.0 + 5.3)) - 0.5);
          vec2 sea = moonSea(w, vec2(0.3, 0.6), vec2(0.3, 0.19));
          sea = max(sea, moonSea(w, vec2(0.68, 0.3), vec2(0.14, 0.12)));
          sea = max(sea, moonSea(w, vec2(0.7, 0.02), vec2(0.1, 0.13)));
          sea = max(sea, moonSea(w, vec2(0.86, -0.2), vec2(0.07, 0.1)));
          sea = max(sea, moonSea(w, vec2(-0.62, 0.24), vec2(0.16, 0.2)));
          sea = max(sea, moonSea(w, vec2(-0.38, -0.5), vec2(0.17, 0.1)));
          sea = max(sea, moonSea(w, vec2(-0.08, -0.74), vec2(0.1, 0.06)));
          sea = max(sea, moonSea(w, vec2(-0.86, -0.22), vec2(0.07, 0.15)));
          sea = max(sea, moonSea(w, vec2(0.08, -0.86), vec2(0.12, 0.05)));
          sea = max(sea, moonSea(w, vec2(-0.42, -0.18), vec2(0.26, 0.22)) * 0.45);
          float pits = max(max(moonCrater(q, vec2(0.12, 0.3), 0.045), moonCrater(q, vec2(-0.24, 0.22), 0.035)),
                           max(moonCrater(q, vec2(0.5, -0.36), 0.04), moonCrater(q, vec2(-0.55, -0.24), 0.035)));
          float rays = max(moonRays(q, vec2(0.38, -0.66), 0.27, 1.3), moonRays(q, vec2(-0.74, -0.1), 0.17, 4.1));
          vec3 c = mix(vec3(1.0), vec3(0.93, 0.94, 0.87), sea.x);
          c = mix(c, vec3(0.86, 0.87, 0.8), max(sea.y * 0.55, pits * 0.4));
          c = mix(c, vec3(0.86, 0.88, 0.8), rays * 0.65);
          return c * (1.0 - 0.1 * dot(q, q));
        }
        void main() {
          vec3 dir = normalize(vDir);
          float h = clamp(dir.y, 0.0, 1.0);
          vec3 col = mix(uHorizon, uTop, pow(h, 0.55));
          float s = max(dot(dir, uSunDir), 0.0);
          col += uSunColor * pow(s, 12.0) * 0.12 * (1.0 - uNight) * step(0.0, uSunDir.y);
          #ifdef FILM
          // The plain pale blue of the film's open skies, the same wherever the camera is, a soft glow
          // round the sun.
          float day = (1.0 - uNight) * smoothstep(-0.05, 0.15, uSunDir.y);
          col += uGlowTint * day * 0.25 * pow(s, 24.0);
          #endif
          // The sun: a round disc in the hour's light, the sea's horizon cutting it as it rises and
          // sets.
          float sunAt = acos(clamp(dot(dir, uSunDir), -1.0, 1.0));
          float sunUp = (1.0 - uNight) * step(0.0, dir.y - uHorizonY);
          #ifdef FILM
          // As the film paints it (the user's frame of it): high in the day, a white disc soft at its
          // edge, in a ring of pale cream fading through a faint green into the sky's blue. The open
          // sky round it is held under the glow's threshold then, so the glow does not spread the
          // white past its edge. Low in the sky it burns in the hour's colour, gold or orange,
          // brighter than white, so the glow haloes it.
          float sunQ = sunAt / ${SUN_RADIUS};
          float sunHigh = smoothstep(0.1, 0.35, uSunDir.y);
          col = mix(col, min(col, vec3(0.9)), (1.0 - smoothstep(1.5, 3.5, sunQ)) * sunHigh * sunUp);
          float sunCore = 1.0 - smoothstep(0.82, 1.15, sunQ);
          vec3 sunWhite = mix(uSunColor / max(max(uSunColor.r, uSunColor.g), uSunColor.b), vec3(1.0), 0.75 * sunHigh);
          col = mix(col, uSunColor * vec3(0.8, 0.79, 0.68), 0.3 * exp(-max(sunQ - 1.0, 0.0)) * sunUp);
          col = mix(col, uSunColor * vec3(0.8, 0.78, 0.6), exp(-max(sunQ - 0.9, 0.0) / 0.35) * (1.0 - sunCore) * sunUp);
          col = mix(col, sunWhite * mix(1.3, 0.97, sunHigh), sunCore * sunUp);
          #else
          // In the toon look, outlined with the pen, as the moon is.
          float sunEdge = (sunAt - ${SUN_RADIUS}) / max(fwidth(sunAt), 1e-6);
          float sunDisc = 1.0 - smoothstep(-0.5, 0.5, sunEdge);
          col = mix(col, mix(uInk, uSunColor * 1.1, sunDisc), (1.0 - smoothstep(uPen - 0.5, uPen + 0.5, sunEdge)) * sunUp);
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
            // The full moon: a big pale disc with its seas and craters (moonFace) in a soft halo,
            // outlined with the pen.
            float m = acos(clamp(dot(dir, uMoonDir), -1.0, 1.0));
            float radius = ${MOON_RADIUS};
            #ifdef FILM
            col = mix(col, vec3(0.42, 0.52, 0.82), 0.15 * (1.0 - smoothstep(radius, radius * 4.0, m)) * uNight);
            #else
            col = mix(col, vec3(0.42, 0.52, 0.82), 0.4 * (1.0 - smoothstep(radius, radius * 4.0, m)) * uNight);
            #endif
            float edge = (m - radius) / max(fwidth(m), 1e-6);
            float disc = 1.0 - smoothstep(-0.5, 0.5, edge);
            vec3 moonRight = normalize(cross(uMoonDir, vec3(0.0, 1.0, 0.0)));
            vec2 q = vec2(dot(dir, moonRight), dot(dir, cross(moonRight, uMoonDir))) / sin(radius);
            vec3 face = uMoonColor * moonFace(q);
            #ifdef FILM
            // The film paints the moon without a line, its edge soft, glowing pale yellow round it,
            // through green into the sky's blue, in a wide halo of brighter blue. (The night's grade
            // leaves the moon and its glow as they are drawn: see GRADE in Look.ts.)
            col += vec3(0.16, 0.3, 0.62) * 0.55 * (1.0 - smoothstep(radius, radius * 9.0, m)) * uNight;
            col = mix(col, uMoonColor * 0.75, 0.9 * exp(-max(m - radius, 0.0) / (radius * 0.45)) * uNight);
            vec3 moon = face * 0.88;
            float drawn = 1.0 - smoothstep(radius * 0.94, radius * 1.01, m);
            #else
            vec3 moon = mix(uInk, face, disc);
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

  /** Paper confetti from the welcome festival, scattered over its plaza and street, in the hour's light
   * on what is painted flat (uAmbient). */
  private makeConfetti(): THREE.InstancedMesh {
    const count = 900;
    // The beach in front of the stalls, and the street through the arch: x, z, half sizes.
    const areas: [number, number, number, number][] = [
      [0, -5, 26, 7],
      [0, -29.5, 4.3, 14],
    ];
    const geo = new THREE.PlaneGeometry(0.07, 0.05).rotateX(-Math.PI / 2);
    const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
    material.onBeforeCompile = (shader) => {
      shader.uniforms.uAmbient = sharedUniforms.uAmbient;
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform vec3 uAmbient;')
        .replace('vec4 diffuseColor = vec4( diffuse, opacity );', 'vec4 diffuseColor = vec4( diffuse * uAmbient, opacity );');
    };
    const mesh = new THREE.InstancedMesh(geo, material, count);
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
