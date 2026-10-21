import * as THREE from 'three';
import { Stage } from '../world/Stage';
import { cameraClear, cameraLimit, caveStandable, clampInAir, clampToWalkable, eyeLimit, groundHeight, splashDown, terrainHeight } from '../world/Island';
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
import { CROWD_KINDS, DEFINITIONS } from '../characters/definitions';
import { CHARACTER_IDS, type CharacterId, type ExpressionId } from '../characters/types';
import { loadCharacterModel, loadOutfitModel, type OutfitModel } from '../characters/Model';
import { EmoteSystem } from '../characters/Emotes';
import { Siren } from '../characters/Siren';
import { PlayerController, type Heading } from '../characters/PlayerController';
import { createOnigiri } from '../characters/Props';
import { loadProp } from '../world/PropModels';
import { sharedUniforms } from '../characters/CharacterMaterial';
import { addOutline, updatePen } from '../world/Ink';
import { FILM, FilmPost } from '../world/Look';
import type { ActionId } from '../characters/Actions';
import type { DevApi, StagedShot } from '../dev/DevTools';
import { t } from '../i18n/I18n';
import { zoneName, type ZoneId } from '../world/Zones';
import { Clock } from '../world/DayNight';

/** Where each character stands when you are not controlling it: x, z, facing. */
const HOMES: Record<CharacterId, [number, number, number]> = {
  // You, on the pier, looking up the beach at the cast gathered under the welcome arch.
  player: [0, 3.2, Math.PI],
  chiikawa: [0, 0, 0],
  hachiware: [-1.7, -1.3, 0.35],
  usagi: [1.8, -1.1, -0.3],
  momonga: [-0.9, -2.9, 0.2],
  // Hitoha and Futaba stand together, turned a little toward each other.
  hitoha: [1.1, -3.1, -0.35],
  futaba: [0.25, -3.25, 0.35],
};
/**
 * Background islanders on the beach: x, z, facing, one of each kind in CROWD_KINDS. Tinted
 * grey-teal like the film's extras.
 */
const CROWD: [number, number, number][] = [
  [-2.9, -3.8, 0.5],
  [3.1, -3.4, -2.5],
  [0.2, -5.4, 3.1],
  [-4.2, -1.6, 1.3],
  [2.3, -6.3, 2.7],
];
const CROWD_COLOR = '#6E8783';
/** Everyone keeps their eyes on you within this many metres (see Character.watch): their head turns to you,
 * and their body after it once the head has turned as far as it goes; past it, they turn back home. */
const WATCH_FROM = 4;
/** How far out from the Siren toward the water the Test panel's visit puts you, between your middles. */
const SIREN_VISIT = 2.4;
const LINEUP_SPACING = 1.0;
const LINEUP_PITCH = 0.04;
const FOLLOW_PITCH = 0.16;
const FOLLOW_DISTANCE = 7;
/** The follow camera's lens (the lineup's, the third person's): a narrow one flattens perspective, like
 * the film's framing. Out of the eyes the lens is wider (see FirstPersonCamera). */
const FOLLOW_FOV = 30;
/** Where the pen is sharpest while the free camera flies: this far ahead of it. */
const FREE_FOCUS = 12;
/** Out of the eyes, where the pen is sharpest: this far ahead, about where those you meet stand. */
const EYE_FOCUS = 3;
/** Where the film look's depth of field turns sharp, in metres from the camera (see Look.ts FOCUS):
 * past the leaves between the follow camera and the one it follows; out of the eyes, past what brushes
 * your face, so the ground at your feet stays sharp. */
const FOLLOW_SHARP = 3.5;
const EYE_SHARP = 0.6;
/** How near anyone you walk up to you come, between your middles, as a share of your widths: just short
 * of touching (0.5), as you stop in front of someone, their face not filling your eyes. */
const APART = 0.6;
/**
 * Out of the eyes, looking down into the calm water you stand in or beside, you bend over it to see
 * yourself (see lookIntoWater): from looking this far down (radians) to this far, all the way; your face
 * kept this far over the water at the least, and carried out no further than this from your middle (from
 * the pier's end, far enough for the water to give it back past the deck's edge); and how quickly you
 * bend and straighten again, per second.
 */
const BOW_FROM = 0.45;
const BOW_FULL = 0.8;
const BOW_OVER_WATER = 0.15;
const BOW_REACH = 3;
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
const ZERO = new THREE.Vector3();
const _fwd = new THREE.Vector3();
const _right = new THREE.Vector3();
const _want = new THREE.Vector3();
const _seat = new THREE.Vector3();
const _flame = new THREE.Vector3();
const _stick = new THREE.Vector3();
const _seen = new THREE.Vector3();
const _boatFlame = new THREE.Vector3();
const _landing = new THREE.Vector3();
const _from = new THREE.Vector3();
const _to = new THREE.Vector3();
const _look = new THREE.Vector3();
const _myEyes = new THREE.Vector3();
const _myEyeR = new THREE.Vector3();

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
  private staged: StagedShot | null = null;
  private readonly settings: Settings;
  private readonly focus = new THREE.Vector3();
  private readonly ctx: FrameContext;
  private controlled: CharacterId;
  private lineup = false;
  /** Whether the cast wears the island outfit (it is a separate asset they can take off). */
  private outfitOn = true;
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
  private running = false;
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
    this.emotes = new EmoteSystem(this.scene);
    this.panel = new TestPanel(
      ui,
      {
        selectCharacter: (id) => this.selectCharacter(id),
        toggleLineup: () => this.setLineup(!this.lineup),
        toggleOutfit: () => this.setOutfit(!this.outfitOn),
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
        visitSiren: () => this.visitSiren(),
      },
      () => ({
        character: this.controlled,
        lineup: this.lineup,
        outfit: this.outfitOn,
        thirdPerson: this.thirdPerson,
        expression: this.expression,
        clockRunning: this.clock.running,
        freeCamera: this.freeCamOn,
        reflections: FILM ? this.stage.reflections : null,
        siren: this.siren?.currentMood ?? null,
      }),
    );
    this.hud.onJump = () => this.input.queueJump();
    this.hud.onAction = () => this.input.queueAction();
    this.hud.onTest = () => this.panel.toggle();
    this.panel.onToggle = (open) => (this.viewLiftTarget = open ? 1 : 0);
    this.input.onFirstMove = () => this.hud.hideHint();

    this.ctx = {
      camera: this.camera,
      viewHeight: 1,
      pixelRatio: 1,
      groundHeight,
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
      const [models, outfits, onigiri, crowdKinds] = await Promise.all([
        Promise.all(CHARACTER_IDS.map((id) => loadCharacterModel(DEFINITIONS[id].model))),
        Promise.all(CHARACTER_IDS.map((id) => outfitFor(DEFINITIONS[id].outfit))),
        loadProp('onigiri'),
        Promise.all(CROWD_KINDS.map((k) => Promise.all([loadCharacterModel(k.model), outfitFor(k.outfit)]))),
        this.stage.load(),
      ]);
      CHARACTER_IDS.forEach((id, i) => {
        const ch = new Character(DEFINITIONS[id], models[i], createOnigiri(onigiri), { outfit: outfits[i] });
        const [x, z, yaw] = HOMES[id];
        ch.teleport(x, z, yaw);
        ch.attach(this.scene, this.emotes);
        this.characters.set(id, ch);
      });
      for (const [i, [x, z, yaw]] of CROWD.entries()) {
        const [model, outfit] = crowdKinds[i % crowdKinds.length];
        // Background islanders share the islanders' face and pace.
        const extra = new Character(DEFINITIONS.hitoha, model, new THREE.Group(), {
          crowd: { color: CROWD_COLOR },
          outfit,
        });
        extra.teleport(x, z, yaw);
        extra.attach(this.scene, this.emotes);
        this.crowd.push(extra);
      }
      this.stage.setCast([...this.characters.values(), ...this.crowd]);
      this.makeCave();
      if (this.stage.cave) this.siren = await Siren.load(this.stage.cave, this.emotes);
      await this.stage.warmShaders(this.renderer, this.camera);
    } catch (err) {
      console.error(err);
      this.hud.showError();
      return;
    }
    this.hud.doneLoading();
    this.rig.snapTo(this.focusPoint());
    this.eyes.lookFrom(this.me());
    this.running = true;
    this.renderer.setAnimationLoop(this.frame);
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
   * In the forbidden cave: the torch up in your hand while you walk in it (in the boat it stands at the
   * bow), lighting the way; the boat's button, to get in beside it and out at a shore; and the boat
   * where it floats. Called after the characters have moved.
   */
  private updateCave(): void {
    const cave = this.stage.cave;
    const boat = this.boat;
    if (!cave || !boat) return;
    const me = this.me();
    const p = me.position;
    const inside = !this.staged && !this.lineup && cave.isInside(p.x, me.feetY + 0.3, p.z);
    if (!this.staged) {
      const hold = inside && !this.rowing;
      if (hold !== me.holdsTorch) me.holdTorch(hold ? this.caveTorch : null);
      for (const ch of this.characters.values()) if (ch !== me && ch.holdsTorch) ch.holdTorch(null);
    }
    const held = [...this.characters.values()].some((ch) => ch.holdsTorch);
    this.caveTorch?.updateMatrixWorld(true);
    this.stage.caveTorches.carried = held && this.caveTorch ? _flame.set(0, TORCH_FLAME_UP, 0).applyMatrix4(this.caveTorch.matrixWorld) : null;
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
    this.hud.setAction(label);
    if (!this.input.consumeAction() || !label) return;
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
      const n = CHARACTER_IDS.length;
      CHARACTER_IDS.forEach((id, i) => {
        const ch = this.characters.get(id);
        if (!ch) return;
        ch.stopAction();
        ch.teleport((i - (n - 1) / 2) * LINEUP_SPACING, 0, 0);
      });
      // Out of the eyes, the follow camera is still where it was last used: it starts on the lineup.
      if (this.thirdPerson) this.rig.frame(0, LINEUP_PITCH, this.lineupDistance());
      else this.rig.cut(0, LINEUP_PITCH, this.lineupDistance(), this.focusPoint());
    } else {
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
    this.hud.showHint(on ? t('hud.freeHint') : null);
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
   * Out of the eyes, looking down into the calm water you stand in or beside, you bend over it as you
   * would to see yourself in it: your face carried out over the water so that the water gives it back to
   * you just where you look (or as near as you can reach), turned up toward your eyes. Only the water's
   * mirror shows you (see Character.setBow, Stage.drawMirror). Not where nothing is mirrored (the
   * forbidden cave, the boat), nor with dry ground under your face. At a deck's edge your eyes lean out
   * over it too (PEEK), or the deck would hide the water under it.
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
    eye.addScaledVector(_fwd, PEEK * this.peek);
    eye.y -= PEEK_DOWN * this.peek;
    me.getAnchor('eyeL', _from);
    me.getAnchor('eyeR', _to);
    const top = Math.max(h + BOW_OVER_WATER, (_from.y + _to.y) / 2 - 0.08);
    // The water gives a face back where the line from the eyes to its mirror image (as deep under the
    // water as the face is over it) meets the water: for that to be where you look, the face must be
    // out past that spot by as far again as it is high over the water, for as far as your eyes are.
    const reach = clamp((eye.y - h + (top - h)) / Math.tan(Math.max(down, 0.05)), 0.25, BOW_REACH);
    this.bowAt.set(eye.x + _fwd.x * reach, top, eye.z + _fwd.z * reach);
    this.bowToward.set(eye.x, 2 * h - eye.y, eye.z).sub(this.bowAt).normalize();
    const want = terrainHeight(this.bowAt.x, this.bowAt.z) < h ? THREE.MathUtils.smoothstep(down, BOW_FROM, BOW_FULL) : 0;
    this.bow += (want - this.bow) * (1 - Math.exp(-dt * BOW_EASE));
    me.setBow(this.bowAt, this.bowToward, this.bow);
  }

  /**
   * Keeps the character you control from walking into anyone else: they stop just short of touching
   * (APART) and slide round them. Out of their eyes, the camera would otherwise pass into the other's
   * head. Called after everyone has moved.
   */
  private keepApart(me: Character): void {
    for (const ch of this.characters.values()) this.stepAside(me, ch);
    for (const extra of this.crowd) this.stepAside(me, extra);
  }

  /** Moves `me` out of `other` if the two stand in each other, as far as the ground lets them. */
  private stepAside(me: Character, other: Character): void {
    if (other === me) return;
    const p = me.position;
    const q = other.position;
    const reach = (me.width + other.width) * APART;
    const dx = p.x - q.x;
    const dz = p.z - q.z;
    const d = Math.hypot(dx, dz);
    if (d >= reach || Math.abs(p.y - q.y) > 0.8) return;
    // Straight out from their middle; from right on it, back the way you face.
    const ux = d > 1e-4 ? dx / d : -Math.sin(me.facing);
    const uz = d > 1e-4 ? dz / d : -Math.cos(me.facing);
    _from.set(p.x, me.feetY, p.z);
    _to.set(q.x + ux * reach, me.feetY, q.z + uz * reach);
    clampToWalkable(_to, _from);
    p.x = _to.x;
    p.z = _to.z;
  }

  // ------------------------------------------------------------------ loop
  private frame = (now: number) => {
    this.timer.update(now);
    const dt = Math.min(this.timer.getDelta(), 1 / 20);
    this.step(dt);
    this.draw();
    this.updateStats(dt);
  };

  /** Draws the frame: straight to the screen, or through the film look's finishing passes, after
   * the calm water's mirror. */
  private draw(): void {
    if (this.post) {
      this.stage.drawMirror(this.renderer, this.camera);
      this.post.render();
    } else {
      this.renderer.render(this.scene, this.camera);
    }
  }

  /** Advance the whole simulation by dt seconds, without drawing. */
  private step(dt: number): void {
    this.time += dt;
    this.input.update();
    const me = this.me();
    const lookingOut = this.lookingOut;
    // Out of their eyes, the one you control faces the way you look; the rest face the way they walk.
    for (const ch of this.characters.values()) ch.look = lookingOut && ch === me ? this.eyes.facing : null;

    if (this.staged || this.lineup || this.freeCamOn) {
      for (const ch of this.characters.values()) ch.watch(null);
      for (const extra of this.crowd) extra.watch(null);
    }
    if (this.staged) {
      for (const [id, ch] of this.characters) {
        ch.setDesiredVelocity(ZERO);
        ch.setFacing(this.staged.characters[id]?.yaw ?? 0);
      }
    } else if (this.lineup || this.freeCamOn) {
      for (const ch of this.characters.values()) {
        ch.setDesiredVelocity(ZERO);
        if (this.lineup) ch.setFacing(0);
      }
    } else {
      const view = this.heading();
      if (this.rowing && this.boat) {
        // Rowing: the stick steers the boat, camera-relative as walking is; you sit in it.
        this.input.consumeJump();
        view.forward(_fwd);
        view.right(_right);
        _want.set(0, 0, 0).addScaledVector(_right, this.input.move.x).addScaledVector(_fwd, this.input.move.y);
        this.boat.row(dt, _want);
        me.setDesiredVelocity(ZERO);
        this.seatInBoat();
      } else {
        this.player.update(me, view);
      }
      // Everyone near keeps their eyes on yours.
      me.getAnchor('eyeL', _myEyes);
      me.getAnchor('eyeR', _myEyeR);
      _myEyes.add(_myEyeR).multiplyScalar(0.5);
      const watch = (ch: Character, home: number) => {
        const near = Math.hypot(me.position.x - ch.position.x, me.position.z - ch.position.z) < WATCH_FROM;
        ch.watch(near ? _myEyes : null);
        if (!near) ch.setFacing(home);
      };
      for (const [id, ch] of this.characters) {
        if (ch === me) {
          ch.watch(null);
          continue;
        }
        ch.setDesiredVelocity(ZERO);
        watch(ch, HOMES[id][2]);
      }
      for (const [i, extra] of this.crowd.entries()) watch(extra, CROWD[i][2]);
    }

    for (const ch of this.characters.values()) ch.update(dt, this.ctx);
    for (const extra of this.crowd) extra.update(dt, this.ctx);
    this.siren?.update(dt, this.ctx, this.staged || this.lineup || this.freeCamOn ? null : me);
    if (!this.staged && !this.lineup && !this.freeCamOn && !this.rowing) this.keepApart(me);
    this.updateCave();
    this.emotes.update(dt);
    if (this.staged) {
      const c = this.staged.camera;
      this.camera.position.set(...c.position);
      this.camera.lookAt(...c.target);
    } else if (this.freeCamOn) {
      this.freeCam.update(dt, this.input);
    } else if (lookingOut) {
      this.eyes.update(dt, this.input, me);
    } else {
      if (this.camera.fov !== FOLLOW_FOV) {
        this.camera.fov = FOLLOW_FOV;
        this.camera.updateProjectionMatrix();
      }
      this.rig.update(dt, this.input, this.focusPoint());
    }
    // Out of their eyes you see the one you control only in the calm water; the film look's depth of
    // field leaves the ground at their feet sharp.
    for (const ch of this.characters.values()) ch.setUnseen(lookingOut && ch === me);
    this.lookIntoWater(me, lookingOut, dt);
    if (this.post) this.post.focus.uniforms.uSharp.value = lookingOut ? EYE_SHARP : FOLLOW_SHARP;
    this.updateViewLift(dt);
    this.updateZone(dt);
    this.clock.advance(dt);
    this.stage.setHour(this.clock.hours);
    this.stage.setWaders(this.time);
    this.stage.update(this.camera, this.time);
    this.updateReflections();
    this.updateInk();
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

  /** One pen for the whole world, set from where the camera is looking; see world/Ink.ts. */
  private updateInk(): void {
    this.camera.updateMatrixWorld();
    const focus = this.staged ? _focus.set(...this.staged.camera.target) : this.rig.focus;
    const distance = this.staged
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
    if (k <= 0) this.camera.clearViewOffset();
    else this.camera.setViewOffset(w, h, 0, h * 0.3 * k, w, h);
  }

  /** Names the place the character you control walks into. */
  private updateZone(dt: number): void {
    this.zoneTimer -= dt;
    if (this.zoneTimer > 0 || !this.stage.zones || this.staged || this.lineup) return;
    this.zoneTimer = 0.25;
    // Flying, the place named is the one under the camera.
    const p = this.freeCamOn ? this.camera.position : this.me().position;
    const y = this.freeCamOn ? p.y : this.me().feetY + 0.3;
    const zone = this.stage.cave?.isInside(p.x, y, p.z) ? 'cave' : this.stage.zones.at(p.x, p.z);
    if (zone === this.zone) return;
    this.zone = zone;
    this.hud.showPlace(zoneName(zone));
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
    this.hud.setStats(`${this.clock.label()} · ${t('info.fps')} ${fps}`);
    const place = this.zone ? ` · ${t('info.zone')} ${zoneName(this.zone)}` : '';
    this.panel.setInfo(
      `${t('info.time')} ${this.clock.label()}${place} · ${t('info.fps')} ${fps} · ${t('info.draws')} ${info.calls} · ` +
        `${t('info.tris')} ${(info.triangles / 1000).toFixed(1)}k`,
    );
  }

  private resize = () => {
    const w = window.innerWidth;
    const h = window.innerHeight;
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
    this.pixelRatio = ratio;
    this.renderer.setPixelRatio(ratio);
    this.renderer.setSize(window.innerWidth, window.innerHeight, false);
    this.post?.setSize(window.innerWidth, window.innerHeight, ratio);
    this.renderer.getDrawingBufferSize(sharedUniforms.uResolution.value);
    this.ctx.pixelRatio = ratio;
  }

  /** Development only: stage a fixed shot to compare against a film frame. */
  devApi(): DevApi {
    return {
      stage: (shot) => {
        this.staged = shot;
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
          const [x, z, yaw] = CROWD[i];
          extra.teleport(x, z, yaw);
        }
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
