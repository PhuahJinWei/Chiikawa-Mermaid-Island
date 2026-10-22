import * as THREE from 'three';
import type { Character } from '../characters/Character';
import { FLOOR_GLSL, PRINT_DAMP, printUniforms, type Terrain } from './Island';

/** How many metres across the square of ground round the camera is that prints are kept on, and how many
 * texels across its map is (about 1.6 cm each). */
const SPAN = 24;
const TEXELS = 1536;
/** Only those walking within this far of the camera leave prints: further off they are too small to see. */
const REACH = 11;
/** How long a print lasts on dry sand and on the damp sand by the water (seconds): a level of the map's 255 is
 * taken off a print on dry sand each TICK, and one has faded from sight once GONE of them are (see printAt in
 * Island.ts). */
const DRY_LIFE = 120;
const DAMP_LIFE = 40;
const GONE = 0.75;
const TICK = DRY_LIFE / (GONE * 255);
/** How far out a print reaches on its map, in its sole's radii: as deep as a print gets out to 2 - RIM of the
 * way, it shallows to nothing at RIM, the sole's edge halfway down. With a few texels across that slope, the
 * edge is drawn as smooth as a pen's line; and as a print fades it shrinks a little, as a print fills in. */
const RIM = 1.4;
/** At most this many of others' prints at once, each counted until it has mostly faded (COUNTED seconds): the
 * fuller, the nearer the camera others must walk to leave them, and past it only yours are left, so the beach
 * is never trodden all over. */
const MOST = 300;
const COUNTED = 0.75 * DRY_LIFE;
/** How much of a foot's size its print is. */
const PRINT_SIZE = 1;
/** The map moves on with the camera once the camera is this many texels from its middle. */
const RECENTRE = 24;
/** Feet within this of the ground's own height stand on it (higher, on a deck, the pier or a stepping stone;
 * lower, in the forbidden cave under it); none are left in water deeper than IN_WATER. */
const ON_GROUND = 0.12;
const IN_WATER = 0.02;
/** Prints are left only where at least this much of the ground is sand (see Terrain.sandAt): elsewhere none
 * would show, and they would only count against MOST. */
const SANDY = 0.3;
/** How many prints can be drawn in a frame, each up to four times (where it crosses the map's edges). */
const QUADS = 96;

/** Whose feet the prints follow: their steps and whether they were in the air, last frame. */
interface Walker {
  steps: number;
  air: boolean;
}

const _at = new THREE.Vector3();
const _size = new THREE.Vector2();
const _clear = new THREE.Color();
const SIDES = [-1, 1, 1, -1];
const ENDS = [-1, -1, 1, 1];

/**
 * In the film look, the prints those walking near the camera leave in the ground, which the ground paints
 * where it is sand (see Island.ts, printUniforms): a foot's each time it comes down (Character.steps), where it
 * comes down, turned the way they walk, and both where they land from a jump; yours, and others' as long as the
 * beach has not too many of them (MOST). Not on decks, in water, nor in the forbidden cave.
 *
 * They are kept on a map of the square of ground round the camera, wrapped round on itself as it follows the
 * camera: the ground coming into the square takes the texels of the ground leaving it, cleared. A band of its
 * rows at a time, each print fades, gone in DRY_LIFE seconds on dry sand and DAMP_LIFE on damp.
 */
export class Footprints {
  private readonly map: THREE.WebGLRenderTarget;
  private readonly camera = new THREE.Camera();
  private readonly stamps = new THREE.Scene();
  private readonly fade = new THREE.Scene();
  private readonly quads: THREE.BufferGeometry;
  private readonly corners: Float32Array;
  private readonly shapes: Float32Array;
  /** Quads to draw this frame. */
  private count = 0;
  /** The map's middle in texels from the world's origin (NaN before the first frame), and where it lies. */
  private midX = NaN;
  private midZ = NaN;
  private readonly window = printUniforms.uPrintWindow.value;
  /** The next of the map's rows to fade, and how many rows are due. */
  private fadeRow = 0;
  private fadeDue = 0;
  private readonly walkers = new Map<Character, Walker>();
  /** When each of others' prints still counted (see MOST) was left. */
  private readonly others: number[] = [];
  private time = 0;

  constructor(private readonly terrain: Terrain) {
    this.map = new THREE.WebGLRenderTarget(TEXELS, TEXELS, {
      format: THREE.RedFormat,
      type: THREE.UnsignedByteType,
      depthBuffer: false,
      generateMipmaps: false,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      wrapS: THREE.RepeatWrapping,
      wrapT: THREE.RepeatWrapping,
    });
    printUniforms.uPrints.value = this.map.texture;
    printUniforms.uPrintSpan.value = SPAN;

    // Each print a quad in the map's own frame (the vertices' x and y), round the sole's shape.
    const quads = new THREE.BufferGeometry();
    this.corners = new Float32Array(QUADS * 4 * 3);
    this.shapes = new Float32Array(QUADS * 4 * 2);
    quads.setAttribute('position', new THREE.BufferAttribute(this.corners, 3).setUsage(THREE.DynamicDrawUsage));
    quads.setAttribute('aShape', new THREE.BufferAttribute(this.shapes, 2).setUsage(THREE.DynamicDrawUsage));
    const index = new Uint16Array(QUADS * 6);
    for (let q = 0; q < QUADS; q++) index.set([4 * q, 4 * q + 1, 4 * q + 2, 4 * q, 4 * q + 2, 4 * q + 3], 6 * q);
    quads.setIndex(new THREE.BufferAttribute(index, 1));
    this.quads = quads;
    const stamp = new THREE.Mesh(
      quads,
      new THREE.ShaderMaterial({
        vertexShader: /* glsl */ `
          attribute vec2 aShape;
          varying vec2 vShape;
          void main() {
            vShape = aShape;
            gl_Position = vec4(position.xy, 0.0, 1.0);
          }`,
        // A round sole, a little narrower at the heel, its edge halfway down the slope out to RIM; pressed
        // deeper than any older print where they cross.
        fragmentShader: /* glsl */ `
          varying vec2 vShape;
          void main() {
            vec2 q = vec2(vShape.x / (0.86 + 0.14 * smoothstep(-1.0, 0.4, vShape.y)), vShape.y);
            gl_FragColor = vec4(clamp((${RIM.toFixed(2)} - length(q)) / ${(2 * (RIM - 1)).toFixed(2)}, 0.0, 1.0), 0.0, 0.0, 1.0);
          }`,
        blending: THREE.CustomBlending,
        blendEquation: THREE.MaxEquation,
        side: THREE.DoubleSide,
        depthTest: false,
        depthWrite: false,
      }),
    );
    stamp.frustumCulled = false;
    this.stamps.add(stamp);

    // The fading: over the whole map, a level off each print on dry sand, more on damp (by the ground's height
    // at the texel, where in the world it is now).
    const whole = new THREE.BufferGeometry();
    whole.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
    const { info } = terrain;
    const fading = new THREE.Mesh(
      whole,
      new THREE.ShaderMaterial({
        uniforms: {
          uFloor: { value: terrain.texture },
          uMap: { value: new THREE.Vector4(info.origin[0], info.origin[1], info.size, info.height.grid) },
          uSea: { value: info.water },
          uPrintWindow: printUniforms.uPrintWindow,
        },
        vertexShader: /* glsl */ `
          void main() {
            gl_Position = vec4(position.xy, 0.0, 1.0);
          }`,
        fragmentShader: /* glsl */ `
          ${FLOOR_GLSL}
          uniform float uSea;
          uniform vec4 uPrintWindow;
          void main() {
            vec2 d = fract(gl_FragCoord.xy / ${TEXELS.toFixed(1)} - uPrintWindow.zw + 0.5) - 0.5;
            float h = floorAt(uPrintWindow.xy + d * ${SPAN.toFixed(1)});
            float damp = 1.0 - smoothstep(uSea + ${PRINT_DAMP.from.toFixed(2)}, uSea + ${PRINT_DAMP.to.toFixed(2)}, h);
            gl_FragColor = vec4(mix(1.0, ${(DRY_LIFE / DAMP_LIFE).toFixed(2)}, damp) / 255.0, 0.0, 0.0, 1.0);
          }`,
        blending: THREE.CustomBlending,
        blendEquation: THREE.ReverseSubtractEquation,
        blendSrc: THREE.OneFactor,
        blendDst: THREE.OneFactor,
        side: THREE.DoubleSide,
        depthTest: false,
        depthWrite: false,
      }),
    );
    fading.frustumCulled = false;
    this.fade.add(fading);
  }

  /**
   * Each frame, after everyone has moved and before the frame is drawn: the map moved on with the camera (at
   * `at`), a band of it faded, and the prints left this frame by those in `cast` (`me` among them) drawn into it.
   */
  update(renderer: THREE.WebGLRenderer, at: THREE.Vector3, dt: number, cast: readonly Character[], me: Character): void {
    this.time += dt;
    const before = renderer.getRenderTarget();
    const autoClear = renderer.autoClear;
    renderer.autoClear = false;
    this.follow(renderer, at);
    this.fadeSome(renderer, dt);
    this.walk(cast, me, at);
    if (this.count > 0) this.stamp(renderer);
    this.map.scissorTest = false;
    renderer.setRenderTarget(before);
    renderer.autoClear = autoClear;
  }

  /** The map moved on to the camera at `at`, once it is RECENTRE texels from the map's middle, the ground coming
   * into it cleared of the prints of the ground leaving it (all of it, the first time or after a long way). */
  private follow(renderer: THREE.WebGLRenderer, at: THREE.Vector3): void {
    const texel = SPAN / TEXELS;
    const x = Math.round(at.x / texel);
    const z = Math.round(at.z / texel);
    const dx = x - this.midX;
    const dz = z - this.midZ;
    if (Math.abs(dx) < RECENTRE && Math.abs(dz) < RECENTRE) return;
    renderer.getClearColor(_clear);
    const alpha = renderer.getClearAlpha();
    renderer.setClearColor(0x000000, 0);
    const half = TEXELS / 2;
    if (!(Math.abs(dx) < TEXELS && Math.abs(dz) < TEXELS)) {
      this.clearRect(renderer, 0, 0, TEXELS, TEXELS);
    } else {
      // The square holds texels mid - half to mid + half: those it takes in are cleared, columns then rows.
      if (dx !== 0) this.clearBand(renderer, dx > 0 ? this.midX + half : x - half, Math.abs(dx), true);
      if (dz !== 0) this.clearBand(renderer, dz > 0 ? this.midZ + half : z - half, Math.abs(dz), false);
    }
    renderer.setClearColor(_clear, alpha);
    this.midX = x;
    this.midZ = z;
    this.window.set(x * texel, z * texel, THREE.MathUtils.euclideanModulo(x, TEXELS) / TEXELS, THREE.MathUtils.euclideanModulo(z, TEXELS) / TEXELS);
  }

  /** Clears `count` of the map's columns (or rows), from the one the world's texel `from` falls on, round its
   * edge if they reach it. */
  private clearBand(renderer: THREE.WebGLRenderer, from: number, count: number, columns: boolean): void {
    const start = THREE.MathUtils.euclideanModulo(from, TEXELS);
    const first = Math.min(count, TEXELS - start);
    const rest = count - first;
    if (columns) {
      this.clearRect(renderer, start, 0, first, TEXELS);
      if (rest > 0) this.clearRect(renderer, 0, 0, rest, TEXELS);
    } else {
      this.clearRect(renderer, 0, start, TEXELS, first);
      if (rest > 0) this.clearRect(renderer, 0, 0, TEXELS, rest);
    }
  }

  private clearRect(renderer: THREE.WebGLRenderer, x: number, y: number, w: number, h: number): void {
    this.map.scissor.set(x, y, w, h);
    this.map.scissorTest = true;
    renderer.setRenderTarget(this.map);
    renderer.clear(true, false, false);
  }

  /** Fades the rows of the map due this frame, each row once every TICK. */
  private fadeSome(renderer: THREE.WebGLRenderer, dt: number): void {
    this.fadeDue += (TEXELS * dt) / TICK;
    const rows = Math.min(TEXELS, Math.floor(this.fadeDue));
    if (rows <= 0) return;
    this.fadeDue -= rows;
    const from = this.fadeRow;
    this.fadeRow = (from + rows) % TEXELS;
    const first = Math.min(rows, TEXELS - from);
    this.fadeRows(renderer, from, first);
    if (rows > first) this.fadeRows(renderer, 0, rows - first);
  }

  private fadeRows(renderer: THREE.WebGLRenderer, from: number, count: number): void {
    this.map.scissor.set(0, from, TEXELS, count);
    this.map.scissorTest = true;
    renderer.setRenderTarget(this.map);
    renderer.render(this.fade, this.camera);
  }

  /** Who of the cast put a foot down this frame, or landed: a print for each foot that came down on the ground
   * near the camera (at `at`). */
  private walk(cast: readonly Character[], me: Character, at: THREE.Vector3): void {
    this.count = 0;
    const others = this.others;
    let gone = 0;
    while (gone < others.length && others[gone] < this.time - COUNTED) gone++;
    if (gone > 0) others.splice(0, gone);
    const reach = REACH * Math.max(0, 1 - others.length / MOST);
    for (const ch of cast) {
      const steps = ch.steps;
      const air = ch.inAir;
      const was = this.walkers.get(ch);
      if (!was) {
        this.walkers.set(ch, { steps, air });
        continue;
      }
      const landed = was.air && !air;
      const stepped = steps !== was.steps;
      was.steps = steps;
      was.air = air;
      if ((!stepped && !landed) || air || ch.ride || !ch.shown || !ch.root.visible) continue;
      const yours = ch === me;
      const p = ch.root.position;
      const far = Math.max(Math.abs(p.x - at.x), Math.abs(p.z - at.z));
      if (far > (yours ? REACH : reach)) continue;
      const feet = ch.feetY;
      const ground = this.terrain;
      if (Math.abs(feet - ground.height(p.x, p.z)) > ON_GROUND || feet < ground.waterLevel(p.x, p.z) - IN_WATER) continue;
      if (ground.sandAt(p.x, p.z) < SANDY) continue;
      if (landed) {
        this.print(ch, 0);
        this.print(ch, 1);
      } else {
        this.print(ch, steps % 2 === 1 ? 0 : 1);
      }
      if (!yours) others.push(this.time);
    }
  }

  /** A print of `ch`'s left (side 0) or right (1) foot where it stands, turned the way they face; drawn again
   * over the map's other side where it crosses an edge. */
  private print(ch: Character, side: 0 | 1): void {
    ch.sole(side, _at, _size);
    const along = (0.5 * RIM * PRINT_SIZE * _size.y) / SPAN;
    const across = (0.5 * RIM * PRINT_SIZE * _size.x) / SPAN;
    const extent = Math.max(along, across);
    const u = THREE.MathUtils.euclideanModulo(_at.x / SPAN, 1);
    const v = THREE.MathUtils.euclideanModulo(_at.z / SPAN, 1);
    // Which way over the map's edge it crosses, if it does.
    const du = u < extent ? 1 : u > 1 - extent ? -1 : 0;
    const dv = v < extent ? 1 : v > 1 - extent ? -1 : 0;
    const fx = Math.sin(ch.facing);
    const fz = Math.cos(ch.facing);
    for (let i = 0; i <= Math.abs(du); i++) {
      for (let j = 0; j <= Math.abs(dv); j++) {
        if (this.count >= QUADS) return;
        const q = this.count++;
        const cu = u + i * du;
        const cv = v + j * dv;
        for (let k = 0; k < 4; k++) {
          const a = ENDS[k];
          const b = SIDES[k];
          // Along the way they face (x, z), and across it, to their right (z, -x); in the map's frame, -1 to 1.
          const corner = (4 * q + k) * 3;
          this.corners[corner] = 2 * (cu + a * along * fx + b * across * fz) - 1;
          this.corners[corner + 1] = 2 * (cv + a * along * fz - b * across * fx) - 1;
          this.shapes[(4 * q + k) * 2] = b * RIM;
          this.shapes[(4 * q + k) * 2 + 1] = a * RIM;
        }
      }
    }
  }

  private stamp(renderer: THREE.WebGLRenderer): void {
    const quads = this.quads;
    for (const attribute of [quads.attributes.position, quads.attributes.aShape] as THREE.BufferAttribute[]) {
      attribute.clearUpdateRanges();
      attribute.addUpdateRange(0, this.count * 4 * attribute.itemSize);
      attribute.needsUpdate = true;
    }
    quads.setDrawRange(0, this.count * 6);
    this.map.scissorTest = false;
    renderer.setRenderTarget(this.map);
    renderer.render(this.stamps, this.camera);
  }
}
