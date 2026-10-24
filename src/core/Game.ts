import * as THREE from 'three';
import { Stage } from '../world/Stage';
import {
  cameraClear,
  cameraLimit,
  caveStandable,
  clampInAir,
  clampToWalkable,
  climbOut,
  eyeLimit,
  footing,
  groundHeight,
  splashDown,
  standAt,
  terrainHeight,
  waterLevelAt,
} from '../world/Island';
import { Boat } from '../world/Boat';
import { TORCH_FLAME_UP, caveFlameMaterial, caveInkMaterial, caveThingMaterial } from '../world/Cave';
import { Input } from './Input';
import { CameraRig } from './CameraRig';
import { FirstPersonCamera } from './FirstPersonCamera';
import { FreeCamera } from './FreeCamera';
import { loadSettings, saveSettings, type Settings } from './Settings';
import { Hud } from '../ui/Hud';
import { TestPanel } from '../ui/TestPanel';
import { Character, type FrameContext } from '../characters/Character';
import { CROWD_KINDS, DEFINITIONS, islanderGait } from '../characters/definitions';
import { CHARACTER_IDS, type CharacterId, type ExpressionId } from '../characters/types';
import { loadCharacterModel, loadOutfitModel, type OutfitModel } from '../characters/Model';
import { EmoteSystem } from '../characters/Emotes';
import { groundShadows } from '../characters/GroundShadows';
import { Siren } from '../characters/Siren';
import { SirenTalk } from '../life/SirenTalk';
import { PlayerController, type Heading } from '../characters/PlayerController';
import { createHeld } from '../characters/Props';
import { loadProp } from '../world/PropModels';
import { sharedUniforms } from '../characters/CharacterMaterial';
import { addOutline, updatePen } from '../world/Ink';
import { FILM, FilmPost } from '../world/Look';
import type { ActionId } from '../characters/Actions';
import type { DevApi, StagedShot } from '../dev/DevTools';
import { t } from '../i18n/I18n';
import { zoneName, type ZoneId } from '../world/Zones';
import { Clock } from '../world/DayNight';
import { Life } from '../life/Life';
import { ISLANDERS } from '../life/profiles';
import { ItemModels, STALL_ITEM, carried, itemName } from '../life/Items';
import { Things, loadThingsPlan } from '../life/Things';
import { HAND_LAYER, HandView } from './HandView';
import { Focus } from './Focus';
import { Play } from './Play';
import { loadSave, writeSave, type SaveData } from './Save';
import { Sound, type Hearing } from './Sound';
import { CameraView, forgetOldPhotos, type Frame } from '../ui/CameraView';
import { glowUniforms } from '../world/Glow';

/** Where each character stands when you are not controlling it: x, z, facing. */
const HOMES: Record<CharacterId, [number, number, number]> = {
  // You, on the pier by its foot, looking up the beach to the festival through its arch: where a new island starts
  // you, everyone about their day (see start).
  player: [0, 3.2, Math.PI],
  chiikawa: [0, 0, 0],
  hachiware: [-1.7, -1.3, 0.35],
  usagi: [1.8, -1.1, -0.3],
  momonga: [-0.9, -2.9, 0.2],
  kurimanju: [2.7, 0.3, -0.5],
  rakko: [-2.9, 0.2, 0.45],
  // Furuhonya on the night beach (PLAN.md), the east end of the main beach, facing the sea.
  furuhonya: [70.5, -19.5, 0.5],
  // Shisa at the back on the left, beside Hachiware, the mane seen from the pier.
  shisa: [-2.75, -2.5, 0.4],
  // Hitoha and Futaba stand together, turned a little toward each other.
  hitoha: [1.1, -3.1, -0.35],
  futaba: [0.25, -3.25, 0.35],
};
/**
 * Where the islanders stand before their day starts (see life/Life.ts): x, z, facing, on the beach, in turn.
 */
const CROWD: [number, number, number][] = [
  [-2.9, -3.8, 0.5],
  [3.1, -3.4, -2.5],
  [0.2, -5.4, 3.1],
  [-4.2, -1.6, 1.3],
  [2.3, -6.3, 2.7],
];
/** Every islander is the one islander grey, Hitoha's and Futaba's (the user, 2026-10-23: "their colors should
 * all be the same islander grey color"), their crowns too; their heads tell them apart (CROWD_KINDS). */
const CROWD_COLOR = '#988584';
/** About this share of them go without a crown, as some of the film's welcome crowd ("bay 5"). */
const CROWD_BARE = 0.25;
/** How far out from the Siren toward the water the Test panel's visit puts you, between your middles. */
const SIREN_VISIT = 2.4;
const LINEUP_SPACING = 1.0;
const LINEUP_PITCH = 0.04;
const FOLLOW_PITCH = 0.16;
const FOLLOW_DISTANCE = 7;
/** The follow camera's lens (the lineup's, the third person's): a narrow one flattens perspective, like
 * the film's framing. Out of the eyes the lens is wider (see FirstPersonCamera). */
const FOLLOW_FOV = 30;
/**
 * The start card's view (see rest), as the film's title shot has the island: from high over the bay to the
 * south-south-west, as DevTools' aerial shot (matched to the film's) frames it, and how much of the view's width
 * the screen takes in (degrees either side): with sea round the island on a wide screen (`across`), the island
 * nearly edge to edge on a phone held upright (`upright`; the user, 2026-10-25: with the wide screen's margin it
 * was "way too zoomed out" there). The lens is made as wide as that needs on the screen as it is.
 */
const TITLE_VIEW = {
  position: [-97.5, 395.19, 399.9] as const,
  target: [-18.4, 0, -99.7] as const,
  across: 22.2,
  upright: 16.5,
  widest: 85,
};
/** How many times the title view is drawn before it is held still (see frame): enough for what is drawn from
 * there to settle (the plants let go round where you stand, the water's mirror, the pen). */
const TITLE_DRAWS = 40;
/** Down from the title view into your own eyes (see start): how long the card waits, dipped to the sky's
 * colour, while the island round you is gathered and first drawn, before it lifts (ms). */
const LANDING = 160;
/** Told where someone is (see Life.whereIs), a marker toward them this long (seconds), or till you are this
 * near them (metres). */
const SOUGHT_FOR = 60;
const SOUGHT_REACHED = 4;
/** Where the pen is sharpest while the free camera flies: this far ahead of it. */
const FREE_FOCUS = 12;
/** Out of the eyes, where the pen is sharpest: this far ahead, about where those you meet stand. */
const EYE_FOCUS = 3;
/** Where the film look's depth of field turns sharp, in metres from the camera (see Look.ts FOCUS):
 * past the leaves between the follow camera and the one it follows; out of the eyes, past what brushes
 * your face, so the ground at your feet stays sharp. */
const FOLLOW_SHARP = 3.5;
const EYE_SHARP = 0.6;
/**
 * Out of the eyes, looking down into the calm water you stand in or beside, you lean over it to see
 * yourself in it, as one does over a pond (see lookIntoWater): from looking this far down (radians) to this
 * far, all the way; your eyes going forward this far (metres), to just behind the front of your face; and how
 * quickly you lean and straighten again, per second.
 */
const BOW_FROM = 0.55;
const BOW_FULL = 0.95;
const LEAN_IN = 0.25;
const BOW_EASE = 6;
/**
 * At the edge of a deck over the water (the pier's end, the quay), looking down you lean out over it so
 * you can see the water under its edge, and yourself in it (see lookIntoWater): your eyes carried this
 * far out and this far down, from looking this far down (radians) to this far; an edge is a drop of
 * this much from your feet within this far ahead of you.
 */
const PEEK = 0.65;
const PEEK_DOWN = 0.12;
const PEEK_FROM = 0.6;
const PEEK_FULL = 1.0;
const PEEK_DROP = 0.4;
const PEEK_AHEAD = [0.3, 0.55, 0.8, 1.05];
/**
 * The drawing resolution, in device pixels per CSS pixel, adapts to keep the game smooth: it steps
 * down when the frame rate stays under SLOW for a few seconds, and back up when it stays over FAST
 * for longer, though never back to a resolution that has proved too slow until the window changes.
 * It never goes above the screen's own (or 2) nor below MIN_RATIO. A big window starts below the
 * screen's own, at the steps that keep it within START_PIXELS, as most of a frame's cost is its
 * pixels.
 */
const MIN_RATIO = 0.5;
const RATIO_STEP = 0.25;
const START_PIXELS = 1.5e6;
const SLOW = 48;
const FAST = 58;
/**
 * A photo (see takePhoto) is at most this many pixels on its longest side; to have that many, it is drawn at a
 * finer resolution than the screen may be drawn at, up to PHOTO_RATIO device pixels per CSS pixel. A zoom chip
 * eases the zoom to its own this quickly, per second (see CameraView).
 */
const PHOTO_SIDE = 1600;
const PHOTO_RATIO = 2;
const ZOOM_EASE = 9;
const ZERO = new THREE.Vector3();
const _fwd = new THREE.Vector3();
const _right = new THREE.Vector3();
const _want = new THREE.Vector3();
const _seat = new THREE.Vector3();
const _flame = new THREE.Vector3();
const _stick = new THREE.Vector3();
const _caveHeld = new THREE.Vector3();
const _seen = new THREE.Vector3();
const _boatFlame = new THREE.Vector3();
const _sought = new THREE.Vector3();
const _landing = new THREE.Vector3();
const _from = new THREE.Vector3();
const _to = new THREE.Vector3();
const _look = new THREE.Vector3();
const _myEyes = new THREE.Vector3();
const _myEyeR = new THREE.Vector3();
const _torch = new THREE.Vector3();
/** Kept every this many seconds of play (see save), and on leaving. */
const SAVE_EVERY = 20;
/** At most this many different things gone wrong in frames are told on the console (see failed). */
const FAILURES_KEPT = 50;
/** Sleeping through the night, you wake at this hour (the user: everyone wakes at 6:00). */
const WAKE = 6.05;
/** Standing in water deeper than this (metres; wading goes to 0.25), you are taken out at the nearest shore
 * (see keepFooting); a place kept for you (see save) must be no deeper, and within this much of the ground
 * there. */
const TOO_DEEP = 0.3;
const FOOTING = 0.3;
/** Where the feast's fire burns (see Places' FEAST_FIRE), the waterfall's foot, and the festival's street (x,
 * from z, to z), for what you hear (see hearing). */
const FIRE_AT: [number, number] = [75, -21];
const FALL_AT: [number, number] = [2, -199];
const STREET: [number, number, number] = [0, -10, -40];
/** How near the sea is, out to these distances (metres) all round, and how near that counts (see shoreness). */
const SHORE_RINGS: [number, number][] = [
  [4, 1],
  [12, 0.75],
  [25, 0.45],
  [45, 0.2],
];
/** The drawing resolution a `width` × `height` window starts at: `best`, or the step below it that keeps it within START_PIXELS. */
function startRatio(width: number, height: number, best: number): number {
  let ratio = best;
  while (ratio > MIN_RATIO && width * height * ratio * ratio > START_PIXELS) ratio = Math.max(MIN_RATIO, ratio - RATIO_STEP);
  return ratio;
}

const _focus = new THREE.Vector3();
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export class Game {
  private readonly renderer: THREE.WebGLRenderer;
  /** The hour the waterfall pool's mirror was last captured at, in the film look. */
  private reflectedHour = Number.NaN;
  /** The film look's finishing passes, when it is on. */
  private post: FilmPost | null = null;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(FOLLOW_FOV, 1, 0.1, 1200);
  private readonly timer = new THREE.Timer();
  private readonly stage: Stage;
  private readonly hud: Hud;
  private readonly input: Input;
  /** The game's camera: out of the eyes of the character you control. */
  private readonly eyes: FirstPersonCamera;
  /** How far you are bent over the water to see yourself in it, 0 to 1; where your eyes are carried to
   * then and the way your face turns (see lookIntoWater). */
  private bow = 0;
  private readonly bowAt = new THREE.Vector3();
  private readonly bowToward = new THREE.Vector3();
  /** How far your eyes lean out over a deck's edge to look down into the water, 0 to 1 (see PEEK). */
  private peek = 0;
  /** Testing: the follow camera from behind them instead (third person), from the Test panel. The
   * lineup frames with it too. */
  private thirdPerson = false;
  private readonly rig: CameraRig;
  /** Development: a camera that flies anywhere, while the character waits where it is. */
  private readonly freeCam: FreeCamera;
  private freeCamOn = false;
  private readonly player: PlayerController;
  private readonly emotes: EmoteSystem;
  private readonly panel: TestPanel;
  private readonly characters = new Map<CharacterId, Character>();
  private readonly crowd: Character[] = [];
  /** The Siren, resting on the forbidden cave's ledge, once she has loaded. */
  private siren: Siren | null = null;
  /** Everyone's days on the island (see life/Life.ts), once it has loaded. */
  private life: Life | null = null;
  /** What lies about the island, and what you do with your paws (see Play), once loaded. */
  private things: Things | null = null;
  private play: Play | null = null;
  /** The cave boat's word for the action button this frame, if it has one (see updateCave). */
  private caveLabel: string | null = null;
  /** The day the things lying about were last seen to for (see Things.morning). */
  private morningDay = -1;
  /** The time is being moved on (see passTime). */
  private passing = false;
  /** Seconds since the island was last kept (see save), and where you last stood on your own feet. */
  private sinceSave = 0;
  private readonly standing = new THREE.Vector3(Number.NaN, 0, 0);
  private standingYaw = 0;
  private readonly saved: SaveData | null = loadSave();
  /** The island's sound. */
  private readonly sound = new Sound();
  /** Your camera, held up (the camera's button, or C: see CameraView), and the zoom the eyes had before it was;
   * the zoom a chip of its asks for, eased to (null: none). */
  private readonly cameraView: CameraView;
  private framing = false;
  private zoomBefore = 0;
  private zoomGoal: number | null = null;
  /** How near the sea is where you hear from (see shoreness), looked at a few times a second; the footfalls
   * out of your own eyes heard so far (see FirstPersonCamera.footfalls). */
  private shore = 0;
  private shoreTimer = 0;
  private footfallsHeard = 0;
  private staged: StagedShot | null = null;
  private readonly settings: Settings;
  private readonly focus = new THREE.Vector3();
  private readonly ctx: FrameContext;
  private controlled: CharacterId;
  private lineup = false;
  /** Whether the cast wears the island outfit (it is a separate asset they can take off). */
  private outfitOn = true;
  /** Testing: whether those with clothes of their own (Rakko) wear the island outfit instead, from the Test
   * panel; never otherwise (the user, 2026-10-22). */
  private islandForAll = false;
  private expression: ExpressionId | null = null;
  private time = 0;
  private fps = 60;
  private statsTimer = 0;
  /** Seconds the frame rate has been too low, or comfortably high, for the drawing resolution. */
  private slowFor = 0;
  private fastFor = 0;
  private pixelRatio = 1;
  /** The highest drawing resolution not yet found too slow in this window. */
  private ratioCeiling = 1;
  /** The island's time of day, and the time it was before a staged shot held it. */
  private readonly clock = new Clock();
  private hoursBeforeShot: number | null = null;
  /** Where the character you control is, checked a few times a second. */
  private zone: ZoneId | null = null;
  private zoneTimer = 0;
  /** Whoever you were told of (see updateSought), by name, and for how long yet; the keyboard's 0 down. */
  private sought: { who: Character; name: string; face: string | null; left: number } | null = null;
  private zeroDown = false;
  private running = false;
  /** Whether the start card is up (see start and rest), and how many more times the island under it is drawn
   * before it is left as a still (see frame). */
  private waiting = false;
  private titleDraws = 0;
  /** What has gone wrong in frames (see failed): each by its part and message, and how many times. */
  private readonly failures = new Map<string, number>();
  /** In the forbidden cave: its rowboat, the torch carried through it, whether you are rowing, and
   * where on the shore you would step out of the boat. */
  private boat: Boat | null = null;
  private caveTorch: THREE.Group | null = null;
  /** The light on the carried torch's stick (its material's uLit), as on the cast where it is. */
  private caveTorchLit: THREE.Color | null = null;
  private rowing = false;
  private readonly shoreAt = new THREE.Vector3();
  /** 0..1: how far the view is lifted so characters stay visible above the open test panel. */
  private viewLift = 0;
  private viewLiftTarget = 0;

  constructor(canvas: HTMLCanvasElement, ui: HTMLElement) {
    this.settings = loadSettings();
    document.title = t('app.title');
    this.controlled = this.settings.character;

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    // What the GPU holds is all there is of the island's shapes and the props' painted wood once drawn
    // (see releaseOnUpload in Stage, and loadPaintMaps in Props): if the browser takes the GPU away and
    // gives it back, the game starts again rather than going on without them.
    canvas.addEventListener('webglcontextrestored', () => location.reload());
    if (FILM) {
      // The film look: soft shadows cast by the sun, and the finishing passes.
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type = THREE.PCFShadowMap;
      this.post = new FilmPost(this.renderer, this.scene, this.camera);
    }
    this.stage = new Stage(this.scene);
    this.hud = new Hud(ui);
    this.input = new Input(canvas, this.hud);
    this.eyes = new FirstPersonCamera(this.camera, eyeLimit);
    this.rig = new CameraRig(this.camera, cameraLimit, cameraClear);
    this.freeCam = new FreeCamera(this.camera, groundHeight);
    this.player = new PlayerController(this.input);
    this.emotes = new EmoteSystem();
    this.emotes.camera = this.camera;
    // Your own marks and words, out of your own eyes: on the screen.
    this.emotes.own = { mark: (kind) => this.hud.ownMark(kind), words: (text) => this.hud.ownWords(text) };
    this.panel = new TestPanel(
      ui,
      {
        selectCharacter: (id) => this.selectCharacter(id),
        toggleLineup: () => this.setLineup(!this.lineup),
        toggleOutfit: () => this.setOutfit(!this.outfitOn),
        toggleIslandForAll: () => this.setIslandForAll(!this.islandForAll),
        resetCamera: () => this.resetCamera(),
        toggleThirdPerson: () => this.setThirdPerson(!this.thirdPerson),
        action: (id) => this.playAction(id),
        expression: (e) => this.setExpression(e),
        setTime: (hours) => this.clock.set(hours),
        toggleClock: () => (this.clock.running = !this.clock.running),
        toggleFreeCamera: () => this.setFreeCamera(!this.freeCamOn),
        moveHere: () => this.moveHere(),
        toggleReflections: () => (this.stage.reflections = !this.stage.reflections),
        sirenMood: (mood) => this.siren?.setMood(mood),
        mermaids: (place) => this.siren?.mermaids.choose(place),
        visitSiren: () => this.visitSiren(),
      },
      () => ({
        character: this.controlled,
        lineup: this.lineup,
        outfit: this.outfitOn,
        islandForAll: this.islandForAll,
        thirdPerson: this.thirdPerson,
        expression: this.expression,
        clockRunning: this.clock.running,
        freeCamera: this.freeCamOn,
        reflections: FILM ? this.stage.reflections : null,
        siren: this.siren?.currentMood ?? null,
        mermaids: this.siren?.mermaids.where ?? null,
      }),
    );
    this.hud.setSound(this.sound.enabled);
    this.hud.onSound = (on) => this.sound.setOn(on);
    this.cameraView = new CameraView(ui);
    forgetOldPhotos();
    this.cameraView.onShutter = (frame) => this.takePhoto(frame);
    this.cameraView.onClose = () => this.setFraming(false);
    this.cameraView.onZoom = (times) => (this.zoomGoal = this.eyes.zoomFor(times));
    this.hud.onCamera = () => this.setFraming(true);
    this.hud.onTime = (hours) => void this.passTime(hours);
    this.hud.onJump = () => {
      this.input.queueJump();
      this.input.holdJump(true);
    };
    this.hud.onJumpEnd = () => this.input.holdJump(false);
    this.hud.onAction = () => this.input.queueAction();
    // (The use button, たべる・のむ・ひく・よむ, as F is on a keyboard: on a phone it had done nothing.)
    this.hud.onUse = () => this.input.queueUse();
    this.hud.onTest = () => this.panel.toggle();
    this.panel.onToggle = (open) => (this.viewLiftTarget = open ? 1 : 0);

    this.ctx = {
      camera: this.camera,
      viewHeight: 1,
      pixelRatio: 1,
      groundHeight,
      footing,
      clamp: clampToWalkable,
      air: clampInAir,
      splash: splashDown,
      caveLight: (x, y, z, out) => this.stage.caveLightAt(x, y, z, out),
    };
    // In the film look, characters walking under the trees go into their shade, and after dark the
    // firelight near them lights them from its side.
    if (FILM) {
      this.ctx.shade = (x, y, z) => this.stage.shadeAt(x, y, z);
      this.ctx.firelight = (x, y, z, seen, dt, out, from) => this.stage.firelightAt(x, y, z, seen, dt, out, from);
    }
    this.timer.connect(document);
    window.addEventListener('resize', this.resize);
    document.addEventListener('visibilitychange', this.onVisibility);
    this.resize();
  }

  async start(): Promise<void> {
    try {
      const outfitFor = (url?: string): Promise<OutfitModel | undefined> =>
        url ? loadOutfitModel(url) : Promise.resolve(undefined);
      const [models, outfits, owns, can, sword, ukulele, crowdKinds, items, thingsPlan] = await Promise.all([
        Promise.all(CHARACTER_IDS.map((id) => loadCharacterModel(DEFINITIONS[id].model))),
        Promise.all(CHARACTER_IDS.map((id) => outfitFor(DEFINITIONS[id].outfit))),
        Promise.all(CHARACTER_IDS.map((id) => outfitFor(DEFINITIONS[id].own?.outfit))),
        loadProp('can'),
        loadProp('sword'),
        loadProp('ukulele'),
        Promise.all(CROWD_KINDS.map((k) => Promise.all([loadCharacterModel(k.model), outfitFor(k.outfit)]))),
        ItemModels.load(),
        loadThingsPlan(),
        this.stage.load(),
      ]);
      CHARACTER_IDS.forEach((id, i) => {
        const def = DEFINITIONS[id];
        const carry = def.carries === 'can' ? createHeld(can) : undefined;
        const ownOutfit = owns[i];
        const own = ownOutfit
          ? { outfit: ownOutfit, carry: def.own?.carries === 'sword' ? createHeld(sword) : undefined }
          : undefined;
        // Rakko plays his own ukulele; anyone (you too) the stage's, once they have it.
        const instrument = createHeld(ukulele);
        const ch = new Character(def, models[i], { outfit: outfits[i], own, carry, instrument });
        const [x, z, yaw] = HOMES[id];
        ch.teleport(x, z, yaw);
        ch.attach(this.scene, this.emotes);
        this.characters.set(id, ch);
      });
      // The islanders who live here (see life/Life.ts), each their own head (CROWD_KINDS, in turn), some without
      // a crown; all the islander grey.
      for (let i = 0; i < ISLANDERS; i++) {
        const [x, z, yaw] = CROWD[i % CROWD.length];
        const [model, outfit] = crowdKinds[i % crowdKinds.length];
        const bare = (((Math.sin((i + 1) * 12.9898 + 5 * 78.233) * 43758.5453) % 1) + 1) % 1 < CROWD_BARE;
        // They share the islanders' face, each walking a little differently.
        const extra = new Character(DEFINITIONS.hitoha, model, {
          crowd: { color: CROWD_COLOR },
          outfit: bare ? undefined : outfit,
          // The stage's ukulele, once they have it.
          instrument: createHeld(ukulele),
          gait: islanderGait(i),
        });
        extra.teleport(x, z, yaw);
        extra.attach(this.scene, this.emotes);
        this.crowd.push(extra);
      }
      this.stage.setCast([...this.characters.values(), ...this.crowd]);
      // Everyone's shadows on the ground, drawn together (see GroundShadows).
      this.scene.add(groundShadows().group);
      this.makeCave();
      if (this.stage.cave) this.siren = await Siren.load(this.stage.cave, this.emotes);
      // Out of the cave, to the sea, she is drawn in the open air.
      this.siren?.setOutside(this.scene);
      // What lies about (public/data/things.json), there for everyone who lives here as for you.
      // (What lies in the forbidden cave is lit by its own light there, as everyone in it is.)
      this.things = new Things(
        items,
        this.scene,
        thingsPlan,
        FILM ? (x, y, z) => this.stage.shadeAt(x, y, z) : null,
        (x, y, z, out) => this.stage.caveLightAt(x, y, z, out),
      );
      // The village's torches each hold a brand (things.json's stands): a thing with its place in its stand,
      // which burns on its pole while it is there and goes dark while it is away.
      this.stage.brands.forEach((brand, i) => {
        const rule = thingsPlan.stands.find((s) => s.prop === brand.kind);
        if (rule) this.things?.addStand(`stand:${brand.kind}:${i}`, rule.item, brand.at, i);
      });
      this.things.onStand = (i, filled) => this.stage.setBrand(i, filled);
      this.life = await Life.create(this.characters, this.crowd, this.emotes, this.things);
      this.life.useBox(this.hud.dialogue);
      this.life.placeAt = (p) => this.placeName(p);
      this.life.onSought = (who, name, face) => (this.sought = { who, name, face, left: SOUGHT_FOR });
      this.makePlay(items);
      // Everyone where you left them; on a new island, where the hour has them, about their day, and you on the pier
      // (the user, 2026-10-25: you are one of the islanders, so no one gathers on the beach to welcome you).
      this.life.settle(this.clock.hours, this.me(), this.saved ? 'saved' : 'clock');
      await this.stage.warmShaders(this.renderer, this.camera, this.post?.picture ?? null);
    } catch (err) {
      console.error(err);
      this.hud.showError();
      return;
    }
    this.rig.snapTo(this.focusPoint());
    this.eyes.lookFrom(this.me());
    // One frame drawn behind the loading screen: what compiles only as it is first drawn (the sun's shadows' depth,
    // the finishing passes, the water's mirror, the footprints) compiles here, not in the first frame seen, which
    // had taken 0.8 s on the dev PC (2026-10-24).
    this.part('warm', () => {
      this.stage.update(this.camera, this.time);
      this.stage.tread(this.renderer, this.camera, 0, this.me());
      this.draw();
    });
    // The island going on under the start card, seen as the film's title shot has it, till a tap or a key (see
    // rest): then down into your own eyes under the card's dip to the sky, its sound, its clock and everyone's
    // day, and you yours to move.
    this.stage.titleView(true);
    this.titleDraws = TITLE_DRAWS;
    this.waiting = true;
    this.running = true;
    this.renderer.setAnimationLoop(this.frame);
    await this.hud.waitToStart(() => this.sound.wake());
    this.stage.titleView(false);
    this.input.dropQueued();
    this.waiting = false;
    await new Promise((done) => window.setTimeout(done, LANDING));
    this.hud.doneLoading();
  }

  /** Takes the start card away as a tap would: for a script driving the game where no one taps. */
  begin(): void {
    this.hud.begin();
  }

  /**
   * What you do with your paws (see Play), your paw before your eyes, and the island as you left it last
   * time (see Save): the hour and the day, where you stood, what you and everyone who lives here held and
   * kept, what lay where.
   */
  private makePlay(items: ItemModels): void {
    const life = this.life;
    const things = this.things;
    if (!life || !things) return;
    const view = new HandView(items, this.scene);
    // What you look at, shown (the ▽ over it, the sketch of what you would put down).
    const focus = new Focus(items, this.scene, FILM ? (x, y, z) => this.stage.shadeAt(x, y, z) : null, this.emotes);
    const play = new Play(things, life, this.hud, view, focus, this.input, this.me(), this.sound);
    play.onSleep = () => void this.sleepThrough();
    // Talking with the Siren on her ledge (see SirenTalk).
    if (this.siren) play.siren = new SirenTalk(this.siren, this.hud.dialogue, () => life.playerHands, () => this.sound?.give());
    this.play = play;
    // Only the game's camera draws your paw before your eyes.
    this.camera.layers.enable(HAND_LAYER);
    const saved = this.saved;
    if (saved) {
      this.clock.set(saved.hours);
      life.day = saved.day;
      play.restore(saved.play);
      life.restore(saved.residents);
      things.restore(saved.things ?? [], saved.beachDay ?? -1);
      life.adoptHomes();
      const at = saved.me;
      // Back where you stood, if one can stand there (else on the pier, where everyone starts).
      if (at && [at.x, at.y, at.z, at.yaw].every(Number.isFinite) && this.canStand(at.x, at.y, at.z)) {
        this.me().teleport(at.x, at.z, at.yaw, at.y);
      }
    }
    this.morningDay = life.day;
    life.morning(life.day);
    const save = () => this.save();
    window.addEventListener('pagehide', save);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) save();
    });
  }

  /** Keeps the island as it is now (see Save). */
  private save(): void {
    const life = this.life;
    const play = this.play;
    const things = this.things;
    if (!life || !play || !things || !this.running || this.staged) return;
    this.sinceSave = 0;
    const me = Number.isNaN(this.standing.x) ? null : { x: this.standing.x, y: this.standing.y, z: this.standing.z, yaw: this.standingYaw };
    writeSave({
      v: 1,
      hours: this.clock.hours,
      day: life.day,
      me,
      play: play.save(),
      residents: life.save(),
      things: things.save(),
      beachDay: things.beachDay,
    });
  }

  /** Asleep in your bed at night: the night goes by while the screen is dark, and you wake to the morning,
   * everyone where the morning has them. */
  private async sleepThrough(): Promise<void> {
    const play = this.play;
    if (!play || !(await this.passTime(WAKE, true))) return;
    const me = this.me();
    play.wake(me);
    // Sitting up, looking out over the room.
    this.eyes.lookFrom(me);
    await this.hud.fade(false);
    this.sound.morning();
    this.hud.toast(t('toast.morning'));
  }

  /**
   * The time moved on to `to` (hours past midnight) while the screen goes dark: your bed's night, or the hour
   * picked by the clock's chip (the user, 2026-10-24: players change the time by tapping it). Time only goes on: an
   * hour no later than now is tomorrow's, and a new day begins with its morning (see Life.morning; your bed's
   * night always ends in one). Everyone is put where the hour has them. Left dark if `sleeping` (the caller wakes
   * you, then fades back); false if the time could not be moved now.
   */
  private async passTime(to: number, sleeping = false): Promise<boolean> {
    const life = this.life;
    if (!life || !this.play || this.passing || this.staged || this.lineup) return false;
    this.passing = true;
    await this.hud.fade(true);
    const me = this.me();
    if (to <= this.clock.hours) life.day++;
    this.clock.set(to);
    life.settle(this.clock.hours, me);
    if (sleeping || life.day !== this.morningDay) {
      this.morningDay = life.day;
      life.morning(life.day);
    }
    this.save();
    this.passing = false;
    if (!sleeping) await this.hud.fade(false);
    return true;
  }

  /**
   * Your camera held up (on: the camera's button, or C), or put away (×, Escape, C again): you stand where you are
   * and every drag aims it, the HUD, the test panel and your paw before your eyes away, nothing done with your paws
   * till it is put away (see CameraView, Play's framing); put away, the eyes' zoom is as it was.
   */
  private setFraming(on: boolean): void {
    if (on === this.framing || (on && (!this.running || this.staged))) return;
    this.framing = on;
    this.input.setMoveEnabled(!on && !this.lineup);
    this.hud.setShown(!on);
    this.zoomGoal = null;
    if (on) {
      this.zoomBefore = this.eyes.zoom;
      this.panel.toggle(false);
      // (The view no longer lifted over the test panel, at once: it would be in the photo.)
      this.viewLift = this.viewLiftTarget = 0;
      this.applyViewLift();
      this.cameraView.open();
    } else {
      this.cameraView.close();
      this.eyes.zoom = this.zoomBefore;
    }
  }

  /**
   * The shutter: what is in the camera's `frame` (CSS pixels on the screen) drawn now, without your paw before your
   * eyes or the ▽ (put away while your camera is held up), and read back, at no more than PHOTO_SIDE pixels on its
   * longest side; drawn finer for it than the screen is if that gives it more of them (see PHOTO_RATIO). Kept
   * nowhere: the camera asks what to do with it.
   */
  private takePhoto(frame: Frame): HTMLCanvasElement | null {
    if (!this.running) return null;
    const was = this.pixelRatio;
    const ratio = clamp(PHOTO_SIDE / Math.max(frame.width, frame.height, 1), was, PHOTO_RATIO);
    const finer = ratio > was + 0.01;
    if (finer) {
      this.setPixelRatio(ratio);
      this.updateInk();
    }
    this.draw();
    const from = this.renderer.domElement;
    const k = from.width / window.innerWidth;
    const sx = Math.max(0, Math.round(frame.x * k));
    const sy = Math.max(0, Math.round(frame.y * k));
    const sw = Math.min(from.width - sx, Math.round(frame.width * k));
    const sh = Math.min(from.height - sy, Math.round(frame.height * k));
    const scale = Math.min(1, PHOTO_SIDE / Math.max(sw, sh));
    const shot = document.createElement('canvas');
    shot.width = Math.max(1, Math.round(sw * scale));
    shot.height = Math.max(1, Math.round(sh * scale));
    shot.getContext('2d')?.drawImage(from, sx, sy, sw, sh, 0, 0, shot.width, shot.height);
    if (finer) {
      // Back as it was, drawn again at once, so the screen is never left blank till the next frame.
      this.setPixelRatio(was);
      this.updateInk();
      this.draw();
    }
    this.sound.shutter();
    return shot;
  }

  /** How near the sea is to `p`: 1 on the shore or over the water, less the further it is to any water all
   * round (SHORE_RINGS), a little anywhere. */
  private shoreness(p: THREE.Vector3): number {
    const wet = (x: number, z: number) => terrainHeight(x, z) < waterLevelAt(x, z) - 0.05;
    if (wet(p.x, p.z)) return 1;
    for (const [r, near] of SHORE_RINGS) {
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2;
        if (wet(p.x + Math.cos(a) * r, p.z + Math.sin(a) * r)) return near;
      }
    }
    return 0.05;
  }

  /** What you hear this frame (see Sound): from where the camera is, of what is round it. */
  private hearing(dt: number, me: Character, lookingOut: boolean): Hearing {
    const p = this.camera.position;
    this.shoreTimer -= dt;
    if (this.shoreTimer <= 0) {
      this.shoreTimer = 0.5;
      this.shore = this.shoreness(p);
    }
    const near = (x: number, z: number, from: number, to: number) => 1 - THREE.MathUtils.smoothstep(Math.hypot(p.x - x, p.z - z), from, to);
    const hours = this.clock.hours;
    const life = this.life;
    const zone = this.zone;
    const inCave = !!this.stage.cave?.isInside(p.x, p.y, p.z);
    const [sx, sz0, sz1] = STREET;
    const streetZ = Math.min(sz0, Math.max(sz1, p.z));
    const open = life && life.openStalls.length > 0 ? 1 : 0.25;
    const rakko = life?.resident('rakko');
    const playing = rakko && rakko.ch.actionId === 'ukulele' && rakko.ch.shown;
    const siren = this.siren;
    let sirenNear = 0;
    if (siren?.where === 'lurk') {
      const s = siren.character.position;
      const d = Math.hypot(p.x - s.x, p.z - s.z);
      sirenNear = (1 - THREE.MathUtils.smoothstep(d, 30, 85)) * THREE.MathUtils.smoothstep(d, 16, 26);
    }
    // A footstep each time a foot comes down out of your own eyes, as your eyes dip with it (longer steps as you
    // run and sprint, none in the air: see FirstPersonCamera.steps): on the deck you stand on, in the water, on
    // sand or on grass.
    let step: Hearing['step'] = null;
    if (lookingOut && !me.ride && this.eyes.footfalls !== this.footfallsHeard) {
      this.footfallsHeard = this.eyes.footfalls;
      const x = me.position.x;
      const z = me.position.z;
      const feet = me.feetY;
      const ground = terrainHeight(x, z);
      const water = waterLevelAt(x, z);
      step =
        feet < water - 0.03 ? 'water'
        : feet > ground + 0.12 && !inCave ? 'wood'
        : inCave || ground < water + 1.0 || zone === 'mainBeach' || zone === 'nightBeach' || zone === 'westBeach' ||
            zone === 'festival' || zone === 'beach' || zone === 'village' ? 'sand'
        : 'grass';
    }
    return {
      dt,
      hours,
      shore: inCave ? 0.3 : this.shore,
      fall: near(FALL_AT[0], FALL_AT[1], 15, 80),
      fire: glowUniforms.uGlow.value > 0 ? near(FIRE_AT[0], FIRE_AT[1], 4, 30) : 0,
      festival: near(sx, streetZ, 8, 45) * open * (hours > 7 && hours < 23.5 ? 1 : 0),
      jungle: zone === 'jungle' ? 1 : zone === 'waterfall' || zone === 'gorge' || zone === 'shimajiro' ? 0.7 : 0,
      cave: inCave,
      ukulele: playing && rakko ? near(rakko.pos.x, rakko.pos.z, 4, 35) : 0,
      strumming: this.play?.strumming ?? false,
      siren: sirenNear,
      step,
    };
  }

  /** The forbidden cave's rowboat, moored at its beach, and the torch carried through it. */
  private makeCave(): void {
    const cave = this.stage.cave;
    if (!cave) return;
    const torch = new THREE.Group();
    const wood = caveThingMaterial();
    const lit = wood.uniforms.uLit as THREE.IUniform<THREE.Color>;
    this.caveTorchLit = lit.value;
    const stick = new THREE.Mesh(cave.torchGeometry, wood);
    torch.add(stick, new THREE.Mesh(cave.torchFlameGeometry, caveFlameMaterial()));
    addOutline(stick, 'still', false, caveInkMaterial(lit));
    torch.visible = false;
    this.scene.add(torch);
    this.caveTorch = torch;
    // Drawn up on the sand of the cavern's beach, on its north side, its bow along the shore, as the
    // film's; pushed off, it comes to rest out from the sand where it can be rowed off any way.
    const [bx, bz] = cave.info.beach?.boat ?? [-179.0, -125.0];
    const beach = Boat.beached(cave, [bx, bz], [bx, bz - 5]);
    const dock = (beach && Boat.launch(cave, beach)) || Boat.mooring(cave, [bx, bz], cave.info.dome.centre);
    this.boat = new Boat(cave, dock);
    if (beach) this.boat.drawnUp(beach, dock);
    this.scene.add(this.boat.group);
  }

  /**
   * In the forbidden cave: a torch you carry burns in your paw and lights the way (the user, 2026-10-23:
   * your own, or one of those lying by its mouth; in the boat its own stands at the bow); a staged shot may
   * put the cave's own torch in someone's hand; the boat's button, to get in beside it and out at a shore;
   * and the boat where it floats. Called after the characters have moved.
   */
  private updateCave(): void {
    this.caveLabel = null;
    const cave = this.stage.cave;
    const boat = this.boat;
    if (!cave || !boat) return;
    const me = this.me();
    const p = me.position;
    const inside = !this.staged && !this.lineup && cave.isInside(p.x, me.feetY + 0.3, p.z);
    if (!this.staged) for (const ch of this.characters.values()) if (ch.holdsTorch) ch.holdTorch(null);
    const held = [...this.characters.values()].some((ch) => ch.holdsTorch);
    this.caveTorch?.updateMatrixWorld(true);
    const staged = held && this.caveTorch ? _flame.set(0, TORCH_FLAME_UP, 0).applyMatrix4(this.caveTorch.matrixWorld) : null;
    this.stage.caveTorches.carried = staged ?? (inside ? (this.play?.torchFlame(_caveHeld) ?? null) : null);
    // Its stick lit as the cast are where it is, a little dimmer, as wood is (as the boat is).
    if (held && this.caveTorch && this.caveTorchLit) {
      const at = _stick.setFromMatrixPosition(this.caveTorch.matrixWorld);
      cave.lightOn(at.x, at.y, at.z, this.caveTorchLit).multiplyScalar(0.6);
    }
    boat.update(this.time);
    this.stage.caveTorches.boat = boat.torchFlame(_boatFlame);
    let label: string | null = null;
    if (this.staged || boat.sliding) label = null;
    else if (this.rowing) label = boat.shore(caveStandable, this.shoreAt) ? t('hud.getOut') : null;
    else if (inside && boat.canBoard(p)) label = t('hud.board');
    this.caveLabel = label;
    if (!label || !this.input.consumeAction()) return;
    if (this.rowing) {
      // Out onto the shore beside the boat; at the beach, onto the sand beside where it is drawn up.
      this.rowing = false;
      const s = boat.landingBeside(_landing) ?? this.shoreAt;
      const from = _from.copy(boat.position);
      boat.leave();
      me.ride = null;
      me.stopAction();
      me.teleport(s.x, s.z, Math.atan2(s.x - from.x, s.z - from.z), cave.grid.floorAt(s.x, s.z));
    } else {
      this.rowing = true;
      boat.board();
      me.play('sit');
      this.seatInBoat();
    }
  }

  /** Sits you where the boat's rower sits, facing its bow. */
  private seatInBoat(): void {
    if (!this.boat) return;
    const seat = this.boat.seat(_seat);
    this.me().ride = { x: seat.x, y: seat.y, z: seat.z, yaw: this.boat.heading };
  }

  // ------------------------------------------------------------------ test panel actions
  private me(): Character {
    const ch = this.characters.get(this.controlled);
    if (!ch) throw new Error(`Character ${this.controlled} not loaded`);
    return ch;
  }

  private targets(): Character[] {
    return this.lineup ? [...this.characters.values()] : [this.me()];
  }

  private selectCharacter(id: CharacterId): void {
    if (!this.characters.has(id)) return;
    this.controlled = id;
    this.settings.character = id;
    saveSettings(this.settings);
    this.applyExpression();
    if (this.lineup) return;
    this.eyes.lookFrom(this.me());
    this.rig.frame(this.rig.yaw, FOLLOW_PITCH, FOLLOW_DISTANCE);
  }

  private setLineup(on: boolean): void {
    this.lineup = on;
    this.input.setMoveEnabled(!on);
    this.hud.setControlsVisible(!on);
    if (on) {
      // Everyone's day on hold while they line up.
      this.life?.hold();
      const n = CHARACTER_IDS.length;
      CHARACTER_IDS.forEach((id, i) => {
        const ch = this.characters.get(id);
        if (!ch) return;
        ch.stopAction();
        ch.ride = null;
        ch.teleport((i - (n - 1) / 2) * LINEUP_SPACING, 0, 0);
      });
      // Out of the eyes, the follow camera is still where it was last used: it starts on the lineup.
      if (this.thirdPerson) this.rig.frame(0, LINEUP_PITCH, this.lineupDistance());
      else this.rig.cut(0, LINEUP_PITCH, this.lineupDistance(), this.focusPoint());
    } else {
      this.life?.settle(this.clock.hours, this.me());
      this.eyes.lookFrom(this.me());
      this.rig.frame(this.rig.yaw, FOLLOW_PITCH, FOLLOW_DISTANCE);
    }
    this.applyExpression();
  }

  /** Testing: the follow camera behind the character you control (on), or their eyes again (off),
   * either looking the way the other looked. */
  private setThirdPerson(on: boolean): void {
    this.thirdPerson = on;
    // The lineup and the free camera hand back to whichever it is when they end.
    if (this.lineup || this.freeCamOn) return;
    if (on) {
      this.rig.cut(this.eyes.yaw, FOLLOW_PITCH, FOLLOW_DISTANCE, this.focusPoint());
    } else {
      this.eyes.yaw = this.rig.yaw;
      this.eyes.pitch = 0;
      this.eyes.snap();
    }
  }

  private setFreeCamera(on: boolean): void {
    if (on && this.lineup) this.setLineup(false);
    this.freeCamOn = on;
    this.hud.setControlsVisible(!on);
    this.input.setMoveEnabled(true);
    if (on) {
      this.freeCam.begin();
    } else {
      this.rig.snapTo(this.focusPoint());
      this.eyes.snap();
    }
  }

  /** Puts the character you control on the ground under the free camera, facing the way it looks, and
   * follows it again. */
  private moveHere(): void {
    const p = this.camera.position;
    this.camera.getWorldDirection(_look);
    const yaw = Math.atan2(-_look.x, -_look.z);
    this.me().teleport(p.x, p.z, yaw + Math.PI);
    this.rig.yaw = yaw;
    this.eyes.lookFrom(this.me());
    this.setFreeCamera(false);
  }

  /** Testing: puts the character you control on the forbidden cave's ledge, a couple of steps out from the
   * Siren toward the water, facing her. */
  private visitSiren(): void {
    const siren = this.siren;
    const cave = this.stage.cave;
    if (!siren || !cave) return;
    if (this.lineup) this.setLineup(false);
    const me = this.me();
    if (this.rowing) {
      this.rowing = false;
      this.boat?.leave();
      me.ride = null;
    }
    me.stopAction();
    const { x, z, yaw } = siren.spot;
    const px = x + Math.sin(yaw) * SIREN_VISIT;
    const pz = z + Math.cos(yaw) * SIREN_VISIT;
    me.teleport(px, pz, yaw + Math.PI, cave.grid.floorAt(px, pz));
    this.rig.yaw = yaw;
    this.eyes.lookFrom(me);
    if (this.freeCamOn) this.setFreeCamera(false);
    else this.rig.snapTo(this.focusPoint());
  }

  private setOutfit(on: boolean): void {
    this.outfitOn = on;
    for (const ch of this.characters.values()) ch.setOutfitVisible(on);
  }

  private setIslandForAll(on: boolean): void {
    this.islandForAll = on;
    for (const ch of this.characters.values()) ch.wearIsland(on);
  }

  private resetCamera(): void {
    if (this.lineup) this.rig.frame(0, LINEUP_PITCH, this.lineupDistance());
    else if (this.thirdPerson) this.rig.frame(this.me().facing, FOLLOW_PITCH, FOLLOW_DISTANCE);
    else this.eyes.reset();
  }

  private playAction(id: ActionId | 'jump'): void {
    for (const ch of this.targets()) {
      if (id === 'jump') ch.jump();
      else ch.play(id);
    }
    // What you do, those near see and answer (see Life.reacted).
    const life = this.life;
    if (!life || this.lineup || this.staged) return;
    const me = this.me();
    if (id === 'jump') life.hopped(me.position);
    else life.reacted(id, me.position);
  }

  private setExpression(e: ExpressionId | null): void {
    this.expression = e;
    this.applyExpression();
  }

  private applyExpression(): void {
    const targets = new Set(this.targets());
    for (const ch of this.characters.values()) ch.expressionOverride = targets.has(ch) ? this.expression : null;
  }

  private lineupDistance(): number {
    const halfWidth = (CHARACTER_IDS.length * LINEUP_SPACING) / 2 + 0.25;
    const vfov = THREE.MathUtils.degToRad(FOLLOW_FOV);
    const hfov = 2 * Math.atan(Math.tan(vfov / 2) * this.camera.aspect);
    const fitWidth = halfWidth / Math.tan(hfov / 2);
    const fitHeight = 0.75 / Math.tan(vfov / 2);
    return clamp(Math.max(fitWidth, fitHeight) * 1.05, 3, 24);
  }

  private focusPoint(): THREE.Vector3 {
    if (this.lineup) return this.focus.set(0, 0.5, 0);
    const me = this.me();
    const p = me.position;
    return this.focus.set(p.x, me.feetY + 0.55, p.z);
  }

  /** Whether the camera looks out of the eyes of the character you control: unless the Test panel's
   * third person, the lineup, the free camera or a staged shot has it. */
  private get lookingOut(): boolean {
    return !this.thirdPerson && !this.lineup && !this.freeCamOn && !this.staged;
  }

  /** The camera the stick walks (and rows) by: the eyes, or the follow camera. */
  private heading(): Heading {
    return this.lookingOut ? this.eyes : this.rig;
  }

  /**
   * Out of the eyes, looking down into the calm water you stand in or beside, you lean over it as you would
   * over a pond to see yourself in it: your eyes forward to just behind the front of your face (LEAN_IN), your
   * face turned down about them toward their mirror image, so the water gives it back to you just under them,
   * looking up at you, the rest of you behind and above it. Only the water's mirror shows you (see
   * Character.setBow, Stage.drawMirror), your head clearly and the rest of you as faintly as anyone else (see
   * uHeadParts). Not where nothing is mirrored (the forbidden cave, the boat), nor with dry ground under your
   * face. At a deck's edge you lean further out over it (PEEK), or the deck would hide the water under it.
   */
  private lookIntoWater(me: Character, lookingOut: boolean, dt: number): void {
    for (const ch of this.characters.values()) if (ch !== me) ch.setBow(null);
    const eye = this.camera.position;
    const h = lookingOut && !me.ride ? this.stage.mirrorLevel(eye) : null;
    if (h === null) {
      this.bow = 0;
      this.peek = 0;
      me.setBow(null);
      return;
    }
    const down = -this.eyes.pitch;
    this.eyes.forward(_fwd);
    const p = me.position;
    const feet = me.feetY;
    // (Standing over the water, not in it: wading, the floor falling away ahead is no edge to lean over.)
    const edge = feet > h + 0.1 && PEEK_AHEAD.some((d) => {
      const x = p.x + _fwd.x * d;
      const z = p.z + _fwd.z * d;
      return groundHeight(x, z, feet) < feet - PEEK_DROP && terrainHeight(x, z) < h;
    });
    const lean = edge ? THREE.MathUtils.smoothstep(down, PEEK_FROM, PEEK_FULL) : 0;
    this.peek += (lean - this.peek) * (1 - Math.exp(-dt * BOW_EASE));
    // Your face where it is, or out over a deck's edge.
    me.getAnchor('eyeL', _from);
    me.getAnchor('eyeR', _to);
    this.bowAt.addVectors(_from, _to).multiplyScalar(0.5).addScaledVector(_fwd, PEEK * this.peek);
    this.bowAt.y -= PEEK_DOWN * this.peek;
    const want = terrainHeight(this.bowAt.x, this.bowAt.z) < h ? THREE.MathUtils.smoothstep(down, BOW_FROM, BOW_FULL) : 0;
    this.bow += (want - this.bow) * (1 - Math.exp(-dt * BOW_EASE));
    // Your eyes go with it, to just behind it; and it turns down toward them in the water.
    eye.addScaledVector(_fwd, LEAN_IN * this.bow + PEEK * this.peek);
    eye.y -= PEEK_DOWN * this.peek;
    this.bowToward.set(eye.x, 2 * h - eye.y, eye.z).sub(this.bowAt).normalize();
    me.setBow(this.bowAt, this.bowToward, this.bow);
  }

  // ------------------------------------------------------------------ loop
  /**
   * One frame: the simulation stepped, then drawn. Whatever goes wrong in a frame costs that frame, never the
   * game: three asks for the next frame only once this one has run, so an error thrown out of it stopped the
   * island for good (seen 2026-10-23, from one wrong thing in the pouch). The parts of a step that can go wrong
   * on their own are kept apart as well (see part), so one going wrong every frame leaves the rest running.
   */
  private frame = (now: number) => {
    this.timer.update(now);
    // (Never back in time: a frame stamped before the last one, as frames driven by hand and the browser's own
    // interleaved can be, would run everything backwards and blow up what it eases.)
    const dt = THREE.MathUtils.clamp(this.timer.getDelta(), 0, 1 / 20);
    if (this.waiting) {
      // Under the start card the island is drawn a few times to settle (and again when the screen changes its
      // size), then left as it is: a still, sharp, and nothing for a phone to do while it waits.
      if (window.innerWidth !== this.sizedW || window.innerHeight !== this.sizedH) this.titleDraws = TITLE_DRAWS;
      if (this.titleDraws <= 0) return;
      this.titleDraws--;
      this.part('step', () => this.rest(dt));
      this.part('draw', () => this.draw());
      return;
    }
    this.part('step', () => this.step(dt));
    this.part('draw', () => {
      this.draw();
      this.updateStats(dt);
    });
  };

  /** Runs one part of a frame; if it throws, what comes after it runs all the same (see failed). */
  private part(name: string, run: () => void): void {
    try {
      run();
    } catch (error) {
      this.failed(name, error);
    }
  }

  /** Something gone wrong in a part of a frame: told on the console the first time, then only counted (see
   * failures), so the same error every frame does not flood it. */
  private failed(part: string, error: unknown): void {
    const key = `${part}: ${error instanceof Error ? error.message : String(error)}`;
    const seen = this.failures.get(key);
    if (seen !== undefined) {
      this.failures.set(key, seen + 1);
    } else if (this.failures.size < FAILURES_KEPT) {
      this.failures.set(key, 1);
      console.error(`${part} went wrong; the game carries on`, error);
    }
  }

  /** Draws the frame: straight to the screen, or through the film look's finishing passes, after
   * the calm water's mirror. */
  private draw(): void {
    groundShadows().gather();
    if (this.post) {
      this.stage.drawMirror(this.renderer, this.camera);
      this.post.render();
    } else {
      this.renderer.render(this.scene, this.camera);
    }
    // The marks and words over heads, over the finished picture, each hidden where the scene is in front of it
    // (see EmoteSystem.overlay).
    this.emotes.beforeOverlay(this.post?.depth ?? null);
    this.renderer.setRenderTarget(null);
    const clear = this.renderer.autoClear;
    this.renderer.autoClear = false;
    // (Over the film look's picture, the screen's own depth is not the scene's: each mark tests the scene's.)
    if (this.post) this.renderer.clearDepth();
    this.renderer.render(this.emotes.overlay, this.camera);
    this.renderer.autoClear = clear;
  }

  /** Advance the whole simulation by dt seconds, without drawing. */
  private step(dt: number): void {
    this.time += dt;
    // The window's size is looked at each step as well as on its resize event: a window that loaded with
    // no size got its first one without the event reaching the game (seen 2026-10-23 in the browser pane).
    if (window.innerWidth !== this.sizedW || window.innerHeight !== this.sizedH) this.resize();
    this.input.update(dt);
    // Your camera held up or put away from the keyboard; held up, what is pressed is the camera's (see CameraView).
    if (this.input.consumeCamera()) this.setFraming(!this.framing);
    if (this.framing) this.input.dropQueued();
    const me = this.me();
    const lookingOut = this.lookingOut;
    // Out of their eyes, the one you control faces the way you look; the rest face the way they walk.
    for (const ch of this.characters.values()) ch.look = lookingOut && ch === me ? this.eyes.facing : null;
    // Only the one you play walks off edges (a porch's, the stage's, a cushion's); the islanders keep to them.
    for (const ch of this.characters.values()) ch.drops = ch === me;

    if (this.staged || this.lineup || this.freeCamOn) {
      for (const ch of this.characters.values()) ch.watch(null);
      for (const extra of this.crowd) extra.watch(null);
    }
    if (this.staged) {
      for (const [id, ch] of this.characters) {
        ch.setDesiredVelocity(ZERO);
        ch.setFacing(this.staged.characters[id]?.yaw ?? 0);
      }
    } else if (this.lineup) {
      for (const ch of this.characters.values()) {
        ch.setDesiredVelocity(ZERO);
        ch.setFacing(0);
      }
    } else {
      const view = this.heading();
      this.player.want.set(0, 0, 0);
      if (this.freeCamOn) {
        me.setDesiredVelocity(ZERO);
      } else if (this.rowing && this.boat) {
        // Rowing: the stick steers the boat, camera-relative as walking is; you sit in it.
        this.input.consumeJump();
        view.forward(_fwd);
        view.right(_right);
        _want.set(0, 0, 0).addScaledVector(_right, this.input.move.x).addScaledVector(_fwd, this.input.move.y);
        this.boat.row(dt, _want);
        me.setDesiredVelocity(ZERO);
        this.seatInBoat();
      } else if (this.play?.seat || this.play?.sleeping) {
        // Seated, the stick gets you up (see Play); no hopping off a seat.
        this.input.consumeJump();
        this.player.update(me, view);
      } else if (this.player.update(me, view)) {
        // Whoever is near sees you hop, and some hop or wave back.
        this.life?.hopped(me.position);
      }
      me.watch(null);
    }

    me.getAnchor('eyeL', _myEyes);
    me.getAnchor('eyeR', _myEyeR);
    _myEyes.add(_myEyeR).multiplyScalar(0.5);
    const life = this.life;
    const living = !!life && !this.staged && !this.lineup;
    const frame = living
      ? {
          dt,
          hours: this.clock.hours,
          camera: this.camera,
          ctx: this.ctx,
          me,
          myEyes: _myEyes,
          myWant: this.player.want,
          sirenSeen: this.siren?.seenFrom(this.camera) ?? false,
        }
      : null;
    // Everyone who lives here goes about their day (see life/Life.ts); you, and whoever no one's day
    // moves (the islander you are while you look out of someone else's eyes), as you are. (The island's life,
    // the Siren, the text box, your paws, the marks over heads, the sound and the saving are each a part of
    // their own: one going wrong leaves you walking, looking about and the island drawn; see frame.)
    if (life && frame) this.part('life', () => life.update(frame));
    for (const ch of this.characters.values()) if (!living || !life?.residentOf(ch)) ch.update(dt, this.ctx);
    this.keepFooting(me);
    if (!living) for (const extra of this.crowd) extra.update(dt, this.ctx);
    if (life && frame) {
      this.part('life', () => life.resolve(frame));
      // What a stall gave you, into your paw (or your pouch).
      const stall = life.playerServed;
      if (stall) {
        life.playerServed = null;
        const item = STALL_ITEM[stall.goods];
        if (item) {
          this.play?.receive(carried(item, 'player'), me);
          this.hud.toast(t('toast.served').replace('{0}', t(itemName(item))));
        }
      }
    }
    this.part('siren', () =>
      this.siren?.update(
        dt,
        this.ctx,
        this.staged || this.lineup || this.freeCamOn ? null : me,
        life && living ? { hours: this.clock.hours, day: life.day, camera: this.camera } : null,
      ),
    );
    this.part('siren talk', () => this.play?.siren?.update(dt, me.position));
    // What is said to you, in the text box: the action button, E or Enter show the rest of a line, or the next
    // (held, skipping through them); asked something, the keyboard's numbers choose (1 the first, 0 the tenth).
    const box = this.hud.dialogue;
    if (box.open && this.input.consumeAction()) box.press(() => this.input.held('KeyE') || this.input.held('Enter'));
    const zero = this.input.held('Digit0');
    if (box.choosing) {
      const n = this.input.consumeSlot();
      if (n >= 0) box.choose(n);
      else if (zero && !this.zeroDown) box.choose(9);
    }
    this.zeroDown = zero;
    this.part('dialogue', () => box.update(dt));
    this.updateCave();
    const play = this.play;
    if (play) {
      const inCave = !!this.stage.cave?.isInside(me.position.x, me.feetY + 0.3, me.position.z);
      this.part('play', () =>
        play.update({
          dt,
          me,
          camera: this.camera,
          lookingOut,
          hours: this.clock.hours,
          free: !this.staged && !this.lineup && !this.freeCamOn && !this.rowing,
          framing: this.framing,
          inCave,
          buttonTaken: this.caveLabel !== null,
          speed: Math.hypot(me.velocity.x, me.velocity.z),
        }),
      );
    }
    this.hud.setAction(box.choosing ? null : box.open ? t('hud.next') : (this.caveLabel ?? play?.action ?? null));
    this.part('emotes', () => this.emotes.update(dt));
    if (this.staged) {
      const c = this.staged.camera;
      this.camera.position.set(...c.position);
      this.camera.lookAt(...c.target);
    } else if (this.freeCamOn) {
      this.freeCam.update(dt, this.input);
    } else if (lookingOut) {
      this.easeZoom(dt);
      this.eyes.update(dt, this.input, me);
    } else {
      if (this.camera.fov !== FOLLOW_FOV) {
        this.camera.fov = FOLLOW_FOV;
        this.camera.updateProjectionMatrix();
      }
      this.rig.update(dt, this.input, this.focusPoint());
    }
    // (Its zoom chips only out of your own eyes: the follow camera and the free one zoom as they do.)
    if (this.framing) this.cameraView.update(lookingOut ? this.eyes.magnified : null, this.eyes.mostZoom);
    // Out of their eyes you see the one you control only in the calm water; the film look's depth of
    // field leaves the ground at their feet sharp.
    for (const ch of this.characters.values()) ch.setUnseen(lookingOut && ch === me);
    this.part('marker', () => this.updateSought(dt));
    // Your paw before your eyes (not while your camera is held up: it would be in the photo), and the light of a
    // torch you carry.
    this.camera.updateMatrixWorld();
    const pawShown = lookingOut && !this.framing;
    this.part('play', () => play?.updateView(dt, this.camera, me, pawShown, Math.hypot(me.velocity.x, me.velocity.z)));
    this.stage.setHeldLight(play?.torchFlame(_torch) ?? null);
    this.part('things', () => this.things?.update(this.camera.position));
    this.part('saving', () => this.keepUp(dt, me));
    if (!this.staged) this.part('sound', () => this.sound.update(this.hearing(dt, me, lookingOut)));
    this.lookIntoWater(me, lookingOut, dt);
    if (this.post) this.post.focus.uniforms.uSharp.value = lookingOut ? EYE_SHARP : FOLLOW_SHARP;
    this.updateViewLift(dt);
    this.updateZone(dt);
    this.clock.advance(dt);
    this.stage.setHour(this.clock.hours);
    this.stage.setWaders(this.time);
    this.stage.update(this.camera, this.time);
    this.stage.tread(this.renderer, this.camera, dt, me);
    this.updateReflections();
    this.updateInk();
  }

  /**
   * A step while the start card is up (see start): the island seen from high over the bay as the film's title
   * shot has it (TITLE_VIEW), going on below, its water, its wind, its sky and everyone in it breathing where they
   * stand, but its clock and everyone's day are held, and nothing pressed is yours yet.
   */
  private rest(dt: number): void {
    this.time += dt;
    if (window.innerWidth !== this.sizedW || window.innerHeight !== this.sizedH) this.resize();
    this.input.dropQueued();
    const me = this.me();
    const lookingOut = this.lookingOut;
    for (const ch of this.characters.values()) {
      ch.setUnseen(lookingOut && ch === me);
      ch.update(dt, this.ctx);
    }
    for (const extra of this.crowd) extra.update(dt, this.ctx);
    const view = TITLE_VIEW;
    const aspect = this.camera.aspect;
    const across = THREE.MathUtils.lerp(view.upright, view.across, THREE.MathUtils.smoothstep(aspect, 0.5, 1.3));
    const fov = Math.min(view.widest, 2 * THREE.MathUtils.radToDeg(Math.atan(Math.tan(THREE.MathUtils.degToRad(across)) / aspect)));
    if (Math.abs(this.camera.fov - fov) > 1e-3) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }
    this.camera.position.set(...view.position);
    this.camera.lookAt(...view.target);
    this.camera.updateMatrixWorld();
    this.part('things', () => this.things?.update(this.camera.position));
    if (this.post) this.post.focus.uniforms.uSharp.value = lookingOut ? EYE_SHARP : FOLLOW_SHARP;
    this.stage.setHour(this.clock.hours);
    this.stage.setWaders(this.time);
    this.stage.update(this.camera, this.time);
    this.updateReflections();
    this.updateInk(_focus.set(...view.target));
  }

  /** Out of your own eyes, the zoom a chip of your camera's asked for (see CameraView), eased to; a pinch or the
   * wheel takes over from it. */
  private easeZoom(dt: number): void {
    const goal = this.zoomGoal;
    if (goal === null) return;
    if (this.input.zoomPending) {
      this.zoomGoal = null;
      return;
    }
    const z = this.eyes.zoom + (goal - this.eyes.zoom) * (1 - Math.exp(-dt * ZOOM_EASE));
    this.eyes.zoom = Math.abs(goal - z) < 1e-3 ? goal : z;
    if (this.eyes.zoom === goal) this.zoomGoal = null;
  }

  /** Whether one can stand with their feet at (x, y, z): on ground or a deck within FOOTING of it, in the
   * forbidden cave on its floor, elsewhere where one can walk, not in water deeper than TOO_DEEP. */
  private canStand(x: number, y: number, z: number): boolean {
    const ground = groundHeight(x, z, y);
    if (!(Math.abs(ground - y) < FOOTING)) return false;
    if (this.stage.cave?.isInside(x, y + 0.3, z)) return true;
    return !Number.isNaN(standAt(x, z, y)) && y > waterLevelAt(x, z) - TOO_DEEP;
  }

  /**
   * Never left standing in water too deep to stand in (somewhere a jump, a seat or an old save left you):
   * out at once onto the nearest shore one can climb out onto, as after a fall into the sea (see climbOut).
   */
  private keepFooting(me: Character): void {
    if (me.ride || me.inAir || this.staged || this.lineup || this.freeCamOn) return;
    const p = me.position;
    const feet = me.feetY;
    if (this.stage.cave?.isInside(p.x, feet + 0.3, p.z) || feet > waterLevelAt(p.x, p.z) - TOO_DEEP) return;
    _landing.copy(p);
    if (!climbOut(_landing)) return;
    me.teleport(_landing.x, _landing.z, me.facing, groundHeight(_landing.x, _landing.z));
  }

  /** Each morning, what lies about is seen to (see Things.morning); where you stand on your own feet is
   * kept, and the island now and then (see save). */
  private keepUp(dt: number, me: Character): void {
    const life = this.life;
    if (!life || !this.play || this.staged || this.lineup) return;
    if (life.day !== this.morningDay) {
      this.morningDay = life.day;
      life.morning(life.day);
    }
    // Kept only where you stand on your own feet on firm ground: not in the air (whose feetY is the ground
    // under you, the sea's floor off the pier), nor in deep water.
    if (!me.ride && !this.freeCamOn && !me.inAir && this.canStand(me.position.x, me.feetY, me.position.z)) {
      this.standing.set(me.position.x, me.feetY, me.position.z);
      this.standingYaw = me.facing;
    }
    this.sinceSave += dt;
    if (this.sinceSave > SAVE_EVERY) this.save();
  }

  /** In the film look, has what the waterfall's pool mirrors captured again once the light has moved
   * on by half an hour, a face of it each step (see Stage.reflectPool). */
  private updateReflections(): void {
    if (!FILM) return;
    const hours = this.clock.hours;
    const since = Math.abs(hours - this.reflectedHour);
    if (!(Math.min(since, 24 - since) < 0.5)) {
      this.reflectedHour = hours;
      this.stage.recapturePool();
    }
    this.stage.reflectPool(this.renderer, this.camera);
  }

  /** One pen for the whole world, set from where the camera is looking (`looking`: at that point, as the title
   * view does); see world/Ink.ts. */
  private updateInk(looking?: THREE.Vector3): void {
    this.camera.updateMatrixWorld();
    const focus = looking ?? (this.staged ? _focus.set(...this.staged.camera.target) : this.rig.focus);
    const distance =
      looking || this.staged
        ? this.camera.position.distanceTo(focus)
        : this.freeCamOn
          ? FREE_FOCUS
          : this.lookingOut
            ? EYE_FOCUS
            : this.camera.position.distanceTo(focus);
    updatePen(this.camera, distance, this.ctx.viewHeight, this.ctx.pixelRatio);
    for (const ch of this.characters.values()) ch.updateOutline(this.ctx);
    for (const extra of this.crowd) extra.updateOutline(this.ctx);
    this.siren?.updateOutline(this.ctx);
  }

  private updateViewLift(dt: number): void {
    if (this.viewLift === this.viewLiftTarget) return;
    const step = dt * 4;
    this.viewLift =
      this.viewLiftTarget > this.viewLift
        ? Math.min(this.viewLiftTarget, this.viewLift + step)
        : Math.max(this.viewLiftTarget, this.viewLift - step);
    this.applyViewLift();
  }

  private applyViewLift(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const k = this.viewLift * this.viewLift * (3 - 2 * this.viewLift);
    // (A window with no size yet would make the offset NaN: see resize.)
    if (k <= 0 || !(w > 0 && h > 0)) this.camera.clearViewOffset();
    else this.camera.setViewOffset(w, h, 0, h * 0.3 * k, w, h);
  }

  /** The name of the place `p` is in (the cave's inside, or one of the island's places); none before they are
   * known. */
  private placeName(p: THREE.Vector3): string {
    if (this.stage.cave?.isInside(p.x, p.y + 0.3, p.z)) return zoneName('cave');
    return this.stage.zones ? zoneName(this.stage.zones.at(p.x, p.z)) : '';
  }

  /** The marker toward whoever you were told of (see Life.whereIs; the user, 2026-10-23: a marker for a
   * while), SOUGHT_FOR or till you are by them: over them while they are in view, else at the screen's edge,
   * pointing their way. */
  private updateSought(dt: number): void {
    const s = this.sought;
    if (!s) return;
    s.left -= dt;
    const me = this.me();
    const by = Math.hypot(s.who.position.x - me.position.x, s.who.position.z - me.position.z) < SOUGHT_REACHED;
    if (s.left <= 0 || by || this.staged || this.lineup) {
      this.sought = null;
      this.hud.setGuide(null);
      return;
    }
    const p = s.who.getAnchor('top', _sought).project(this.camera);
    // (Behind the camera, what is projected comes out mirrored.)
    const behind = p.z > 1;
    let x = behind ? -p.x : p.x;
    let y = behind ? -p.y : p.y;
    const over = !behind && Math.abs(x) < 0.9 && Math.abs(y) < 0.85;
    if (!over) {
      if (behind && Math.abs(x) + Math.abs(y) < 1e-3) y = -1;
      const k = 1 / Math.max(Math.abs(x) / 0.86, Math.abs(y) / 0.72);
      x *= k;
      y *= k;
    }
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.hud.setGuide({
      x: ((x + 1) / 2) * w,
      y: ((1 - y) / 2) * h,
      angle: over ? Math.PI : Math.atan2(x * w, y * h),
      over,
      name: s.name,
      face: s.face,
    });
  }

  /** Keeps up which place the character you control is in (for what you hear and the test panel's line; its name
   * no longer shows as you walk in: the user, 2026-10-24). */
  private updateZone(dt: number): void {
    this.zoneTimer -= dt;
    if (this.zoneTimer > 0 || !this.stage.zones || this.staged || this.lineup) return;
    this.zoneTimer = 0.25;
    // Flying, the place named is the one under the camera.
    const p = this.freeCamOn ? this.camera.position : this.me().position;
    const y = this.freeCamOn ? p.y : this.me().feetY + 0.3;
    const zone = this.stage.cave?.isInside(p.x, y, p.z) ? 'cave' : this.stage.zones.at(p.x, p.z);
    this.zone = zone;
  }

  /** Steps the drawing resolution down when frames are slow, and back up when there is room. */
  private adaptResolution(dt: number): void {
    if (this.fps < SLOW) {
      this.slowFor += dt;
      this.fastFor = 0;
    } else if (this.fps > FAST) {
      this.fastFor += dt;
      this.slowFor = 0;
    } else {
      this.slowFor = this.fastFor = 0;
    }
    let ratio = this.pixelRatio;
    if (this.slowFor > 3 && ratio > MIN_RATIO) {
      ratio = Math.max(MIN_RATIO, ratio - RATIO_STEP);
      this.ratioCeiling = ratio;
    } else if (this.fastFor > 12 && ratio < this.ratioCeiling) {
      ratio = Math.min(this.ratioCeiling, ratio + RATIO_STEP);
    }
    if (ratio !== this.pixelRatio) {
      this.slowFor = this.fastFor = 0;
      this.setPixelRatio(ratio);
    }
  }

  private updateStats(dt: number): void {
    this.fps += (1 / Math.max(dt, 1e-4) - this.fps) * 0.1;
    this.adaptResolution(dt);
    this.statsTimer -= dt;
    if (this.statsTimer > 0) return;
    this.statsTimer = 0.5;
    const info = this.renderer.info.render;
    const fps = Math.round(this.fps);
    this.hud.setClock(this.clock.hours, this.clock.label(), `${t('info.fps')} ${fps}`);
    const place = this.zone ? ` · ${t('info.zone')} ${zoneName(this.zone)}` : '';
    this.panel.setInfo(
      `${t('info.time')} ${this.clock.label()}${place} · ${t('info.fps')} ${fps} · ${t('info.draws')} ${info.calls} · ` +
        `${t('info.tris')} ${(info.triangles / 1000).toFixed(1)}k`,
    );
  }

  /** The window's size the camera and the picture were last set to (see resize). */
  private sizedW = 0;
  private sizedH = 0;

  private resize = () => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    // A window with no size yet (a tab opened in the background, a pane folded away) leaves the camera and
    // the picture as they are till it has one: a zero size made the aspect NaN, which poisoned the eyes'
    // direction and the player's facing for good (found 2026-10-23).
    if (!(w > 0 && h > 0)) return;
    this.sizedW = w;
    this.sizedH = h;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.applyViewLift();
    this.ctx.viewHeight = h;
    this.ratioCeiling = Math.min(window.devicePixelRatio || 1, 2);
    this.setPixelRatio(startRatio(w, h, this.ratioCeiling));
    if (this.lineup) this.rig.frame(0, LINEUP_PITCH, this.lineupDistance());
  };

  /** Draws at `ratio` device pixels per CSS pixel; the pen keeps its width on screen. */
  private setPixelRatio(ratio: number): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    // (No size yet: as it is, till the window has one: see resize.)
    if (!(w > 0 && h > 0)) return;
    this.pixelRatio = ratio;
    this.renderer.setPixelRatio(ratio);
    this.renderer.setSize(w, h, false);
    this.post?.setSize(w, h, ratio);
    this.renderer.getDrawingBufferSize(sharedUniforms.uResolution.value);
    this.ctx.pixelRatio = ratio;
  }

  /** Development only: stage a fixed shot to compare against a film frame. */
  devApi(): DevApi {
    return {
      stage: (shot) => {
        this.setFraming(false);
        this.staged = shot;
        // Everyone's day on hold while the shot stands, all of them shown.
        this.life?.hold();
        for (const extra of this.crowd) {
          extra.ride = null;
          extra.stopAction();
        }
        if (this.rowing) {
          this.rowing = false;
          this.boat?.leave();
        }
        if (this.boat && shot.boat) {
          this.boat.dockAt(shot.boat);
          this.boat.board();
        } else if (this.boat) {
          if (this.boat.manned) this.boat.leave();
          this.boat.toBeach();
        }
        let torch = false;
        for (const ch of this.characters.values()) ch.holdTorch(null);
        for (const [id, ch] of this.characters) {
          const placed = shot.characters[id];
          ch.stopAction();
          ch.ride = null;
          if (!placed) {
            ch.teleport(40, 40, 0);
            continue;
          }
          ch.teleport(placed.x, placed.z, placed.yaw, placed.y ?? NaN);
          ch.expressionOverride = placed.expression ?? null;
          if (placed.action) ch.play(placed.action);
          if (placed.torch && this.caveTorch) {
            ch.holdTorch(this.caveTorch);
            torch = true;
          }
          if (placed.seat !== undefined && this.boat && shot.boat) {
            const s = this.boat.seat(_seat, placed.seat);
            ch.ride = { x: s.x, y: s.y, z: s.z, yaw: shot.boat.heading + placed.yaw };
            if (!placed.action) ch.play('sit');
          }
        }
        this.boat?.showTorch(!!shot.boat && !torch);
        this.siren?.rest();
        this.siren?.setMood(shot.siren ?? 'calm');
        this.siren?.mermaids.put(shot.mermaids ?? (shot.siren === 'angry' ? 'head' : 'ledge'));
        for (const [i, extra] of this.crowd.entries()) {
          const spot = shot.crowd?.[i];
          if (spot) extra.teleport(spot[0], spot[1], spot[2]);
          else extra.teleport(40 + i * 2, 40, 0);
        }
        this.camera.fov = shot.camera.fov;
        this.camera.updateProjectionMatrix();
        // A staged shot holds its time of day, so it looks the same each time.
        this.hoursBeforeShot ??= this.clock.hours;
        this.clock.set(shot.hour ?? 11);
        this.clock.running = false;
      },
      release: () => {
        this.staged = null;
        for (const ch of this.characters.values()) {
          ch.ride = null;
          ch.holdTorch(null);
        }
        this.boat?.leave();
        this.boat?.toBeach();
        if (this.hoursBeforeShot !== null) this.clock.set(this.hoursBeforeShot);
        this.hoursBeforeShot = null;
        this.clock.running = true;
        this.camera.fov = FOLLOW_FOV;
        this.camera.updateProjectionMatrix();
        for (const [id, ch] of this.characters) {
          const [x, z, yaw] = HOMES[id];
          ch.teleport(x, z, yaw);
          ch.expressionOverride = null;
        }
        for (const [i, extra] of this.crowd.entries()) {
          const [x, z, yaw] = CROWD[i % CROWD.length];
          extra.teleport(x, z, yaw);
        }
        // Everyone back where the hour has them.
        this.life?.settle(this.clock.hours, this.me());
        this.eyes.lookFrom(this.me());
      },
      setOutfit: (on) => this.setOutfit(on),
      /**
       * Step the simulation for `settle` seconds, then render, so the canvas can be read back
       * even while the browser has paused the animation loop.
       */
      renderNow: (settle = 0) => {
        for (let t = 0; t < settle; t += 1 / 60) this.step(1 / 60);
        if (this.staged) {
          const c = this.staged.camera;
          this.camera.position.set(...c.position);
          this.camera.lookAt(...c.target);
        }
        this.draw();
      },
      canvas: () => this.renderer.domElement,
      caveDark: (on) => this.stage.cave?.darkTest(on),
      islandDark: (on) => {
        this.stage.darkTest(on);
        // The waterfall's pool mirrors what stood round it when it last looked: in the dark, while the
        // test ran. It looks again.
        if (!on) this.reflectedHour = Number.NaN;
      },
      drawAll: (on) => this.stage.drawAll(on),
      houseOpenings: () => this.stage.houseOpenings(),
      readScene: () => {
        const cave = this.stage.cave;
        const { x: width, y: height } = this.renderer.getDrawingBufferSize(new THREE.Vector2());
        const picture = new THREE.WebGLRenderTarget(width, height, { type: THREE.FloatType });
        picture.depthTexture = new THREE.DepthTexture(width, height);
        const where = new THREE.WebGLRenderTarget(width, height, { type: THREE.FloatType, depthBuffer: false });
        // Where each pixel's surface is in the world, from the picture's depth (w 0 where nothing is).
        const toWorld = new THREE.ShaderMaterial({
          uniforms: {
            tDepth: { value: picture.depthTexture },
            uUnproject: { value: this.camera.projectionMatrixInverse },
            uCameraWorld: { value: this.camera.matrixWorld },
          },
          vertexShader: /* glsl */ `
            varying vec2 vUv;
            void main() {
              vUv = uv;
              gl_Position = vec4(position.xy, 0.0, 1.0);
            }`,
          fragmentShader: /* glsl */ `
            uniform sampler2D tDepth;
            uniform mat4 uUnproject;
            uniform mat4 uCameraWorld;
            varying vec2 vUv;
            void main() {
              float d = texture2D(tDepth, vUv).x;
              if (d >= 1.0) {
                gl_FragColor = vec4(0.0);
                return;
              }
              vec4 view = uUnproject * vec4(vec3(vUv, d) * 2.0 - 1.0, 1.0);
              gl_FragColor = vec4((uCameraWorld * vec4(view.xyz / view.w, 1.0)).xyz, 1.0);
            }`,
        });
        const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), toWorld);
        quad.frustumCulled = false;
        const before = this.renderer.getRenderTarget();
        this.renderer.setRenderTarget(picture);
        this.renderer.render(this.scene, this.camera);
        this.renderer.setRenderTarget(where);
        this.renderer.render(quad, this.camera);
        this.renderer.setRenderTarget(before);
        const colour = new Float32Array(width * height * 4);
        const at = new Float32Array(width * height * 4);
        this.renderer.readRenderTargetPixels(picture, 0, 0, width, height, colour);
        this.renderer.readRenderTargetPixels(where, 0, 0, width, height, at);
        const out = new Uint8Array(width * height);
        if (cave) {
          const eye = this.camera.position;
          for (let i = 0; i < width * height; i++) {
            if (at[i * 4 + 3] === 0 || cave.seenOut(eye, _seen.set(at[i * 4], at[i * 4 + 1], at[i * 4 + 2]))) out[i] = 1;
          }
        }
        picture.depthTexture.dispose();
        picture.dispose();
        where.dispose();
        quad.geometry.dispose();
        toWorld.dispose();
        return { width, height, colour, where: at, out };
      },
      cave: () => {
        const cave = this.stage.cave;
        return cave ? { info: cave.info, floorAt: (x: number, z: number) => cave.grid.floorAt(x, z) } : null;
      },
    };
  }

  private onVisibility = () => {
    if (!this.running) return;
    if (document.hidden) {
      this.renderer.setAnimationLoop(null);
    } else {
      this.timer.reset();
      this.renderer.setAnimationLoop(this.frame);
    }
  };
}
