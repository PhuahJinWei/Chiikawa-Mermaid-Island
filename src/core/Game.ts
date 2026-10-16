import * as THREE from 'three';
import { Stage, clampToPlayArea, groundHeight } from '../world/Stage';
import { Input } from './Input';
import { CameraRig } from './CameraRig';
import { loadSettings, saveSettings, type Settings } from './Settings';
import { Hud } from '../ui/Hud';
import { TestPanel } from '../ui/TestPanel';
import { Character, type FrameContext } from '../characters/Character';
import { CROWD_KINDS, DEFINITIONS } from '../characters/definitions';
import { CHARACTER_IDS, type CharacterId, type ExpressionId } from '../characters/types';
import { loadCharacterModel, loadOutfitModel, type OutfitModel } from '../characters/Model';
import { EmoteSystem } from '../characters/Emotes';
import { PlayerController } from '../characters/PlayerController';
import { createOnigiri } from '../characters/Props';
import { loadProp } from '../world/PropModels';
import { sharedUniforms } from '../characters/CharacterMaterial';
import { updatePen } from '../world/Ink';
import type { ActionId } from '../characters/Actions';
import type { DevApi, StagedShot } from '../dev/DevTools';
import { t } from '../i18n/I18n';

/** Where each character stands when you are not controlling it: x, z, facing. */
const HOMES: Record<CharacterId, [number, number, number]> = {
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
const LINEUP_SPACING = 1.0;
const LINEUP_PITCH = 0.04;
const FOLLOW_PITCH = 0.16;
const FOLLOW_DISTANCE = 7;
const ZERO = new THREE.Vector3();
const _focus = new THREE.Vector3();
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export class Game {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  // A narrow lens flattens perspective, like the film's framing.
  private readonly camera = new THREE.PerspectiveCamera(30, 1, 0.1, 1200);
  private readonly timer = new THREE.Timer();
  private readonly stage: Stage;
  private readonly hud: Hud;
  private readonly input: Input;
  private readonly rig: CameraRig;
  private readonly player: PlayerController;
  private readonly emotes: EmoteSystem;
  private readonly panel: TestPanel;
  private readonly characters = new Map<CharacterId, Character>();
  private readonly crowd: Character[] = [];
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
  private running = false;
  /** 0..1: how far the view is lifted so characters stay visible above the open test panel. */
  private viewLift = 0;
  private viewLiftTarget = 0;

  constructor(canvas: HTMLCanvasElement, ui: HTMLElement) {
    this.settings = loadSettings();
    document.title = t('app.title');
    this.controlled = this.settings.character;

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.stage = new Stage(this.scene);
    this.hud = new Hud(ui);
    this.input = new Input(canvas, this.hud);
    this.rig = new CameraRig(this.camera);
    this.player = new PlayerController(this.input, this.rig);
    this.emotes = new EmoteSystem(this.scene);
    this.panel = new TestPanel(
      ui,
      {
        selectCharacter: (id) => this.selectCharacter(id),
        toggleLineup: () => this.setLineup(!this.lineup),
        toggleOutfit: () => this.setOutfit(!this.outfitOn),
        resetCamera: () => this.resetCamera(),
        action: (id) => this.playAction(id),
        expression: (e) => this.setExpression(e),
      },
      () => ({
        character: this.controlled,
        lineup: this.lineup,
        outfit: this.outfitOn,
        expression: this.expression,
      }),
    );
    this.hud.onJump = () => this.input.queueJump();
    this.hud.onTest = () => this.panel.toggle();
    this.panel.onToggle = (open) => (this.viewLiftTarget = open ? 1 : 0);
    this.input.onFirstMove = () => this.hud.hideHint();

    this.ctx = { camera: this.camera, viewHeight: 1, pixelRatio: 1, groundHeight, clamp: clampToPlayArea };
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
        this.stage.loadProps(),
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
    } catch (err) {
      console.error(err);
      this.hud.showError();
      return;
    }
    this.hud.doneLoading();
    this.rig.snapTo(this.focusPoint());
    this.running = true;
    this.renderer.setAnimationLoop(this.frame);
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
    if (!this.lineup) this.rig.frame(this.rig.yaw, FOLLOW_PITCH, FOLLOW_DISTANCE);
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
      this.rig.frame(0, LINEUP_PITCH, this.lineupDistance());
    } else {
      this.rig.frame(this.rig.yaw, FOLLOW_PITCH, FOLLOW_DISTANCE);
    }
    this.applyExpression();
  }

  private setOutfit(on: boolean): void {
    this.outfitOn = on;
    for (const ch of this.characters.values()) ch.setOutfitVisible(on);
  }

  private resetCamera(): void {
    if (this.lineup) this.rig.frame(0, LINEUP_PITCH, this.lineupDistance());
    else this.rig.frame(this.me().facing, FOLLOW_PITCH, FOLLOW_DISTANCE);
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
    const vfov = THREE.MathUtils.degToRad(this.camera.fov);
    const hfov = 2 * Math.atan(Math.tan(vfov / 2) * this.camera.aspect);
    const fitWidth = halfWidth / Math.tan(hfov / 2);
    const fitHeight = 0.75 / Math.tan(vfov / 2);
    return clamp(Math.max(fitWidth, fitHeight) * 1.05, 3, 24);
  }

  private focusPoint(): THREE.Vector3 {
    if (this.lineup) return this.focus.set(0, 0.5, 0);
    const p = this.me().position;
    return this.focus.set(p.x, groundHeight(p.x, p.z) + 0.55, p.z);
  }

  // ------------------------------------------------------------------ loop
  private frame = (now: number) => {
    this.timer.update(now);
    const dt = Math.min(this.timer.getDelta(), 1 / 20);
    this.step(dt);
    this.renderer.render(this.scene, this.camera);
    this.updateStats(dt);
  };

  /** Advance the whole simulation by dt seconds, without drawing. */
  private step(dt: number): void {
    this.time += dt;
    this.input.update();
    const me = this.me();

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
      this.player.update(me);
      for (const [id, ch] of this.characters) {
        if (ch === me) continue;
        ch.setDesiredVelocity(ZERO);
        const dx = me.position.x - ch.position.x;
        const dz = me.position.z - ch.position.z;
        if (dx * dx + dz * dz < 16) ch.faceToward(me.position.x, me.position.z);
        else ch.setFacing(HOMES[id][2]);
      }
    }

    for (const ch of this.characters.values()) ch.update(dt, this.ctx);
    for (const extra of this.crowd) extra.update(dt, this.ctx);
    this.emotes.update(dt);
    if (this.staged) {
      const c = this.staged.camera;
      this.camera.position.set(...c.position);
      this.camera.lookAt(...c.target);
    } else {
      this.rig.update(dt, this.input, this.focusPoint());
    }
    this.updateViewLift(dt);
    this.stage.update(this.camera, this.time);
    this.updateInk();
  }

  /** One pen for the whole world, set from where the camera is looking; see world/Ink.ts. */
  private updateInk(): void {
    this.camera.updateMatrixWorld();
    const focus = this.staged ? _focus.set(...this.staged.camera.target) : this.rig.focus;
    updatePen(this.camera, this.camera.position.distanceTo(focus), this.ctx.viewHeight, this.ctx.pixelRatio);
    for (const ch of this.characters.values()) ch.updateOutline(this.ctx);
    for (const extra of this.crowd) extra.updateOutline(this.ctx);
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

  private updateStats(dt: number): void {
    this.fps += (1 / Math.max(dt, 1e-4) - this.fps) * 0.1;
    this.statsTimer -= dt;
    if (this.statsTimer > 0) return;
    this.statsTimer = 0.5;
    const info = this.renderer.info.render;
    const fps = Math.round(this.fps);
    this.hud.setStats(`${t('info.fps')} ${fps}`);
    this.panel.setInfo(
      `${t('info.fps')} ${fps} · ${t('info.draws')} ${info.calls} · ${t('info.tris')} ${(info.triangles / 1000).toFixed(1)}k`,
    );
  }

  private resize = () => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    this.renderer.setPixelRatio(pixelRatio);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.applyViewLift();
    this.renderer.getDrawingBufferSize(sharedUniforms.uResolution.value);
    this.ctx.viewHeight = h;
    this.ctx.pixelRatio = pixelRatio;
    if (this.lineup) this.rig.frame(0, LINEUP_PITCH, this.lineupDistance());
  };

  /** Development only: stage a fixed shot to compare against a film frame. */
  devApi(): DevApi {
    return {
      stage: (shot) => {
        this.staged = shot;
        for (const [id, ch] of this.characters) {
          const placed = shot.characters[id];
          ch.stopAction();
          if (!placed) {
            ch.teleport(40, 40, 0);
            continue;
          }
          ch.teleport(placed.x, placed.z, placed.yaw);
          ch.expressionOverride = placed.expression ?? null;
          if (placed.action) ch.play(placed.action);
        }
        for (const [i, extra] of this.crowd.entries()) {
          const spot = shot.crowd?.[i];
          if (spot) extra.teleport(spot[0], spot[1], spot[2]);
          else extra.teleport(40 + i * 2, 40, 0);
        }
        this.camera.fov = shot.camera.fov;
        this.camera.updateProjectionMatrix();
      },
      release: () => {
        this.staged = null;
        this.camera.fov = 30;
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
        this.renderer.render(this.scene, this.camera);
      },
      canvas: () => this.renderer.domElement,
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
