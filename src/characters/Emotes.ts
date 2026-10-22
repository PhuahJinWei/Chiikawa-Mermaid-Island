import * as THREE from 'three';
import type { AnchorName } from './Model';
import { PEN_METRES } from '../world/Ink';

export type EmoteKind = 'exclaim' | 'question' | 'zzz' | 'note' | 'heart';

/** What the effects need from a character. */
export interface EmoteHost {
  readonly facing: number;
  getAnchor(name: AnchorName, out: THREE.Vector3): THREE.Vector3;
}

/** Where the marks and words of the one the camera looks out of go, who has no head in view for them to show
 * over (see Character.setUnseen): onto the screen (Hud.ownMark, Hud.ownWords). */
export interface OwnView {
  mark(kind: EmoteKind): void;
  words(text: string): void;
}

interface Live {
  sprite: THREE.Sprite;
  kind: EmoteKind | 'bubble';
  host: EmoteHost;
  age: number;
  life: number;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  size: number;
  aspect: number;
  seed: number;
  own?: THREE.Texture;
}

const LIFE: Record<EmoteKind, number> = {
  exclaim: 1.3,
  question: 1.5,
  zzz: 1.9,
  note: 1.6,
  heart: 1.5,
};
const SIZE: Record<EmoteKind, number> = {
  exclaim: 0.3,
  question: 0.3,
  zzz: 0.2,
  note: 0.2,
  heart: 0.18,
};
const BUBBLE_HEIGHT = 0.3;
/** A bubble keeps its top under this far up the view (its edge being 1): close to someone, out of your own
 * eyes, it is brought down (and made smaller, at the closest) rather than rising off the screen. */
const BUBBLE_TOP = 0.9;
const _ndc = new THREE.Vector3();
const _eyes = new THREE.Vector3();
const ON_TOP = new Set<EmoteKind | 'bubble'>(['exclaim', 'question', 'bubble']);
const INK = '#5A3A2E';
export const ROUNDED_FONT =
  '"Hiragino Maru Gothic ProN","Hiragino Sans","BIZ UDPGothic","Yu Gothic UI","Meiryo","PingFang SC","Microsoft YaHei","Arial Rounded MT Bold",sans-serif';

const smooth = (x: number) => {
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
};
/**
 * Line width, in canvas pixels, that draws with the world's pen on a sprite `metres` tall
 * whose canvas is `canvasPx` tall. Tiny effects cap it so their shape still reads.
 */
const inkWidth = (canvasPx: number, metres: number) => Math.min((PEN_METRES / metres) * canvasPx, 0.12 * canvasPx);
const pop = (age: number) => (age < 0.12 ? (age / 0.12) * 1.2 : age < 0.22 ? 1.2 - ((age - 0.12) / 0.1) * 0.2 : 1);

function canvasTexture(w: number, h: number, draw: (c: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const c = canvas.getContext('2d');
  if (!c) throw new Error('2D canvas unavailable');
  draw(c);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function glyph(text: string, fill: string, metres: number, stroke = INK): THREE.CanvasTexture {
  return canvasTexture(128, 128, (c) => {
    c.font = `900 100px ${ROUNDED_FONT}`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.lineJoin = 'round';
    c.lineWidth = 2 * inkWidth(128, metres); // half of a text stroke hides under the fill
    c.strokeStyle = stroke;
    c.strokeText(text, 64, 70);
    c.fillStyle = fill;
    c.fillText(text, 64, 70);
  });
}

function buildTextures(): Record<EmoteKind, THREE.Texture> {
  return {
    exclaim: glyph('!', '#FF7A7A', SIZE.exclaim),
    question: glyph('?', '#7AB8FF', SIZE.question),
    zzz: glyph('Z', '#8FA8FF', SIZE.zzz, '#FFFFFF'),
    note: glyph('♪', '#FF8FB1', SIZE.note),
    heart: canvasTexture(64, 64, (c) => {
      c.beginPath();
      c.moveTo(32, 56);
      c.bezierCurveTo(4, 36, 6, 10, 22, 10);
      c.bezierCurveTo(28, 10, 32, 16, 32, 20);
      c.bezierCurveTo(32, 16, 36, 10, 42, 10);
      c.bezierCurveTo(58, 10, 60, 36, 32, 56);
      c.closePath();
      c.fillStyle = '#FF8FB1';
      c.fill();
      c.lineWidth = inkWidth(64, SIZE.heart);
      c.lineJoin = 'round';
      c.strokeStyle = INK;
      c.stroke();
    }),
  };
}

function bubbleTexture(text: string): { texture: THREE.CanvasTexture; aspect: number } {
  const fontPx = 44;
  const pad = 22;
  const tail = 16;
  const probe = document.createElement('canvas').getContext('2d');
  let textWidth = fontPx * text.length;
  if (probe) {
    probe.font = `700 ${fontPx}px ${ROUNDED_FONT}`;
    textWidth = probe.measureText(text).width;
  }
  const w = Math.ceil(textWidth + pad * 2);
  const h = Math.ceil(fontPx + pad * 1.4 + tail);
  const texture = canvasTexture(w, h, (c) => {
    const bh = h - tail - 4;
    const r = 24;
    c.beginPath();
    c.moveTo(3 + r, 3);
    c.lineTo(w - 3 - r, 3);
    c.quadraticCurveTo(w - 3, 3, w - 3, 3 + r);
    c.lineTo(w - 3, bh - r);
    c.quadraticCurveTo(w - 3, bh, w - 3 - r, bh);
    c.lineTo(w / 2 + 12, bh);
    c.lineTo(w / 2, h - 4);
    c.lineTo(w / 2 - 12, bh);
    c.lineTo(3 + r, bh);
    c.quadraticCurveTo(3, bh, 3, bh - r);
    c.lineTo(3, 3 + r);
    c.quadraticCurveTo(3, 3, 3 + r, 3);
    c.closePath();
    c.fillStyle = '#FFFFFF';
    c.fill();
    c.lineWidth = inkWidth(h, BUBBLE_HEIGHT);
    c.strokeStyle = INK;
    c.stroke();
    c.font = `700 ${fontPx}px ${ROUNDED_FONT}`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillStyle = INK;
    c.fillText(text, w / 2, bh / 2 + 2);
  });
  return { texture, aspect: w / h };
}

/** Pooled billboard effects: symbols and speech bubbles. */
export class EmoteSystem {
  /** The camera the bubbles are kept in view of (see BUBBLE_TOP), once the game gives it. */
  camera: THREE.PerspectiveCamera | null = null;
  /** Where your own marks and words show out of your own eyes, once the game gives it. */
  own: OwnView | null = null;
  private readonly textures: Record<EmoteKind, THREE.Texture>;
  private readonly pool: THREE.Sprite[] = [];
  private readonly live: Live[] = [];
  private readonly right = new THREE.Vector3();

  constructor(private readonly scene: THREE.Scene) {
    this.textures = buildTextures();
  }

  spawn(kind: EmoteKind, host: EmoteHost, side = 1): void {
    const sprite = this.take(this.textures[kind], ON_TOP.has(kind));
    const e: Live = {
      sprite,
      kind,
      host,
      age: 0,
      life: LIFE[kind],
      pos: new THREE.Vector3(),
      vel: new THREE.Vector3(),
      size: SIZE[kind],
      aspect: 1,
      seed: Math.random(),
    };
    this.axes(host);
    switch (kind) {
      case 'zzz':
      case 'note':
      case 'heart':
        host.getAnchor('head', e.pos);
        e.pos.addScaledVector(this.right, side * 0.22);
        e.vel.copy(this.right).multiplyScalar(side * 0.12);
        e.vel.y = 0.32;
        break;
      default:
        break;
    }
    this.live.push(e);
    this.place(e, 0);
  }

  /** Words in a bubble over `host`'s head, for `life` seconds. */
  say(host: EmoteHost, text: string, life = 1.9): void {
    for (const e of this.live) if (e.kind === 'bubble' && e.host === host) e.age = e.life;
    const { texture, aspect } = bubbleTexture(text);
    const sprite = this.take(texture, true);
    sprite.center.set(0.5, 0);
    const e: Live = {
      sprite,
      kind: 'bubble',
      host,
      age: 0,
      life,
      pos: new THREE.Vector3(),
      vel: new THREE.Vector3(),
      size: BUBBLE_HEIGHT,
      aspect,
      seed: 0,
      own: texture,
    };
    this.live.push(e);
    this.place(e, 0);
  }

  update(dt: number): void {
    for (let i = this.live.length - 1; i >= 0; i--) {
      const e = this.live[i];
      e.age += dt;
      if (e.age >= e.life) {
        e.sprite.visible = false;
        e.own?.dispose();
        this.pool.push(e.sprite);
        this.live.splice(i, 1);
        continue;
      }
      this.place(e, dt);
    }
  }

  private axes(host: EmoteHost): void {
    this.right.set(Math.cos(host.facing), 0, -Math.sin(host.facing));
  }

  private take(texture: THREE.Texture, onTop: boolean): THREE.Sprite {
    let sprite = this.pool.pop();
    if (!sprite) {
      const material = new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        depthWrite: false,
        fog: false,
      });
      sprite = new THREE.Sprite(material);
      this.scene.add(sprite);
    }
    const m = sprite.material;
    m.map = texture;
    m.depthTest = !onTop;
    m.opacity = 1;
    sprite.renderOrder = onTop ? 20 : 10;
    sprite.center.set(0.5, 0.5);
    sprite.visible = true;
    return sprite;
  }

  private place(e: Live, dt: number): void {
    const s = e.sprite;
    const { age } = e;
    const k = age / e.life;
    let scale = e.size;
    let opacity = 1;
    switch (e.kind) {
      case 'zzz':
      case 'note':
      case 'heart':
        e.pos.addScaledVector(e.vel, dt);
        s.position.copy(e.pos);
        s.position.x += Math.sin(age * 4 + e.seed * 6) * 0.03;
        scale = e.size * (0.6 + 0.6 * smooth(k * 3));
        opacity = 1 - smooth((k - 0.65) / 0.35);
        break;
      case 'exclaim':
      case 'question':
        this.axes(e.host);
        // Above the very top, so tall ears do not hide it.
        e.host.getAnchor('top', s.position);
        s.position.y += 0.2;
        s.position.addScaledVector(this.right, 0.14);
        scale = e.size * pop(age);
        opacity = 1 - smooth((k - 0.75) / 0.25);
        break;
      case 'bubble': {
        e.host.getAnchor('top', s.position);
        s.position.y += 0.1;
        scale = e.size * pop(age);
        opacity = 1 - smooth((k - 0.85) / 0.15);
        const camera = this.camera;
        if (camera) {
          _ndc.copy(s.position).setY(s.position.y + scale).project(camera);
          if (_ndc.z < 1 && _ndc.y > BUBBLE_TOP) {
            // Metres it rises too high, where it is: brought down that far, over tall ears if need be, but
            // no lower than just over their eyes; what still does not fit, made smaller.
            const across = s.position.distanceTo(camera.position) * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
            const over = (_ndc.y - BUBBLE_TOP) * across;
            e.host.getAnchor('eyeL', _eyes);
            const drop = Math.max(0, Math.min(over, s.position.y - (_eyes.y + 0.12)));
            s.position.y -= drop;
            if (over > drop) scale = Math.max(scale * 0.55, scale - (over - drop));
          }
        }
        break;
      }
    }
    s.scale.set(scale * e.aspect, scale, 1);
    s.material.opacity = opacity;
  }
}
