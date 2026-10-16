import * as THREE from 'three';
import type { BrowKind, ExpressionId, EyeKind, FaceStyle, MouthKind } from './types';
import type { FaceLayers } from './Model';

interface ExpressionSpec {
  eyes: EyeKind;
  brows: BrowKind;
  /** 'neutral' resolves to the character's own resting mouth. */
  mouth: MouthKind | 'neutral';
  blush: number;
}

/**
 * Expressions drawn in code, for faces that are not painted (the islanders). Painted faces
 * take theirs from art/faces/<id>/expressions.txt instead.
 */
const EXPRESSIONS: Record<ExpressionId, ExpressionSpec> = {
  neutral: { eyes: 'open', brows: 'none', mouth: 'neutral', blush: 1 },
  smile: { eyes: 'open', brows: 'none', mouth: 'neutral', blush: 1.04 },
  happy: { eyes: 'happy', brows: 'none', mouth: 'grin', blush: 1.08 },
  determined: { eyes: 'open', brows: 'angry', mouth: 'neutral', blush: 1 },
  worried: { eyes: 'open', brows: 'worried', mouth: 'neutral', blush: 1 },
  teary: { eyes: 'teary', brows: 'worried', mouth: 'neutral', blush: 1.06 },
  sobbing: { eyes: 'squeeze', brows: 'worried', mouth: 'wail', blush: 1.1 },
  shocked: { eyes: 'open', brows: 'none', mouth: 'neutral', blush: 1 },
};

/**
 * How painted layers stack, and how far each follows the gaze, by the first word of the
 * layer's name. Anything else (sweat) goes on top.
 */
const PAINT_GROUPS: Record<string, { z: number; follow: readonly [number, number] }> = {
  skin: { z: 0, follow: [0.8, 0.8] },
  cheeks: { z: 1, follow: [0.5, 0.5] },
  tears: { z: 2, follow: [1, 1] },
  eyes: { z: 3, follow: [1, 1] },
  brows: { z: 4, follow: [0.5, 0.5] },
  mouth: { z: 5, follow: [0.35, 0.3] },
};
const PAINT_OTHER = { z: 6, follow: [0.5, 0.5] as const };
/** Painted layers that show on every expression. */
const ALWAYS = ['skin', 'cheeks'];
/** What a closed mouth opens to while talking or chewing, best first. */
const TALKING_MOUTHS = ['mouth half-open', 'mouth open', 'mouth half-open 2'];

const paintGroup = (name: string) => PAINT_GROUPS[name.split(' ')[0]] ?? PAINT_OTHER;

// Colours sampled from the film.
const INK = '#4A3026'; // eyes
const LINE = '#5E3D2C'; // mouth, hatching, brows: the same brown as the outlines
const MOUTH_IN = '#8A4540';
const TONGUE = '#F2A0A6';
const BLUSH = '#F8C3BC';
const LW = 0.028; // base line width, in head radii; matches the outline thickness

type Ctx = CanvasRenderingContext2D;

function ellipsePath(c: Ctx, x: number, y: number, rx: number, ry: number): void {
  c.beginPath();
  c.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

function openMouth(m: MouthKind): MouthKind {
  if (m === 'grin' || m === 'wail') return m;
  if (m === 'none') return 'o';
  return 'catOpen';
}

function closedMouth(m: MouthKind): MouthKind {
  if (m === 'grin') return 'catOpen';
  if (m === 'wail') return 'o';
  if (m === 'none') return 'none';
  return 'cat';
}

/**
 * A character's face, drawn into a texture that the body shader paints onto the front of the
 * head. The cast's faces are painted by hand (art/faces/<id>/): each expression is a stack of
 * painted layers, with "eyes closed" swapped in to blink or bow, "eyes sleep" (or else "eyes
 * closed") to doze, and another mouth to talk or chew. Faces without paintings (the islanders) are drawn in code. The texture is redrawn
 * only when something changes.
 */
export class Face {
  readonly texture: THREE.CanvasTexture;
  expression: ExpressionId = 'neutral';
  talking = false;
  chewing = false;
  /** Eyes shut by an action (bowing), like a long blink. */
  eyesClosed = false;
  /** Asleep: the sleeping eyes where the face has them, else the closed eyes. */
  asleep = false;
  readonly gaze = new THREE.Vector2();

  private readonly ctx: Ctx;
  private key = '';
  private blinkIn = 2 + Math.random() * 3;
  private blinkLeft = 0;
  private mouthIn = 0;
  private mouthOpen = false;

  constructor(
    private readonly style: FaceStyle,
    private readonly size = 768,
    private readonly layers: FaceLayers | null = null,
  ) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D canvas unavailable');
    this.ctx = ctx;
    this.texture = new THREE.CanvasTexture(canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.premultiplyAlpha = true;
    this.texture.anisotropy = 4;
    this.update(0);
  }

  update(dt: number): void {
    this.blinkIn -= dt;
    if (this.blinkIn <= 0) {
      this.blinkLeft = 0.12;
      this.blinkIn = Math.random() < 0.2 ? 0.25 : 1.8 + Math.random() * 3.5;
    }
    if (this.blinkLeft > 0) this.blinkLeft -= dt;

    if (this.talking || this.chewing) {
      this.mouthIn -= dt;
      if (this.mouthIn <= 0) {
        this.mouthOpen = !this.mouthOpen;
        this.mouthIn = this.chewing ? 0.14 : 0.06 + Math.random() * 0.1;
      }
    } else {
      this.mouthOpen = false;
    }

    const gx = Math.round(clamp(this.gaze.x, -0.05, 0.05) * 200) / 200;
    const gy = Math.round(clamp(this.gaze.y, -0.04, 0.04) * 200) / 200;
    if (this.layers) this.updatePainted(this.layers, gx, gy);
    else this.updateDrawn(gx, gy);
  }

  private has(name: string): boolean {
    return !!this.layers?.rects[name];
  }

  /** The painted layers showing this frame, bottom first. */
  private paintedLayers(L: FaceLayers): string[] {
    const recipe = L.expressions[this.expression] ?? L.expressions.neutral ?? [];
    const closed = this.blinkLeft > 0 || this.eyesClosed || this.asleep;
    const sleepEyes = this.asleep && this.has('eyes sleep');
    const names = ALWAYS.filter((name) => this.has(name));
    for (const layer of recipe) {
      let name = layer;
      const group = layer.split(' ')[0];
      if (sleepEyes && group === 'eyes') name = 'eyes sleep';
      else if (closed && group === 'eyes' && this.has('eyes closed')) name = 'eyes closed';
      else if (closed && layer === 'tears eyes open' && this.has('tears eyes closed')) name = 'tears eyes closed';
      else if (this.mouthOpen && group === 'mouth') name = this.otherMouth(layer);
      if (!names.includes(name)) names.push(name);
    }
    return names.sort((a, b) => paintGroup(a).z - paintGroup(b).z);
  }

  /** The mouth for the other beat of talking or chewing: open if this one is closed, else closed. */
  private otherMouth(mouth: string): string {
    if (mouth === 'mouth closed') return TALKING_MOUTHS.find((m) => this.has(m)) ?? mouth;
    return this.has('mouth closed') ? 'mouth closed' : mouth;
  }

  private updatePainted(L: FaceLayers, gx: number, gy: number): void {
    const names = this.paintedLayers(L);
    const key = `${names.join('+')}|${gx}|${gy}`;
    if (key === this.key) return;
    this.key = key;
    const c = this.ctx;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, this.size, this.size);
    for (const name of names) {
      const [fx, fy] = paintGroup(name).follow;
      this.drawLayer(name, gx * fx, gy * fy);
    }
    this.texture.needsUpdate = true;
  }

  private updateDrawn(gx: number, gy: number): void {
    const spec = EXPRESSIONS[this.expression];
    let eyes = spec.eyes;
    const closed = this.blinkLeft > 0 || this.eyesClosed || this.asleep;
    if (closed && (eyes === 'open' || eyes === 'teary')) eyes = 'closed';
    let mouth: MouthKind = spec.mouth === 'neutral' ? this.style.neutralMouth : spec.mouth;
    if (this.chewing) mouth = this.mouthOpen ? 'o' : 'cat';
    else if (this.talking) mouth = this.mouthOpen ? openMouth(mouth) : closedMouth(mouth);
    const st = this.style;

    const key = st.cheeksOnly ? `${spec.blush}|${gx}|${gy}` : `${eyes}|${spec.brows}|${mouth}|${spec.blush}|${gx}|${gy}`;
    if (key === this.key) return;
    this.key = key;
    const c = this.ctx;
    const S = this.size;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, S, S);
    // Draw in head radii with +y up; the canvas spans ±1 radius around the eye line.
    c.setTransform(S / 2, 0, 0, -S / 2, S / 2, S / 2);
    c.lineCap = 'round';
    c.lineJoin = 'round';
    for (const side of [-1, 1]) this.drawBlush(side * st.blushX + gx * 0.5, st.blushY + gy * 0.5, spec.blush);
    if (!st.cheeksOnly) {
      for (const side of [-1, 1]) this.drawEye(eyes, side, side * st.eyeX + gx, gy);
      this.drawBrows(spec.brows, gx, gy);
      this.drawMouth(mouth, gx * 0.35, st.mouthY + gy * 0.3);
    }
    this.texture.needsUpdate = true;
  }

  /** Draw one painted layer at its place on the canvas, shifted by (dx, dy) head radii. */
  private drawLayer(name: string, dx: number, dy: number): void {
    const L = this.layers;
    const r = L?.rects[name];
    if (!L || !r) return;
    const c = this.ctx;
    const k = this.size / L.size;
    const half = L.size / 2;
    c.save();
    c.setTransform(k, 0, 0, k, 0, 0);
    c.drawImage(L.image, r.ax, r.ay, r.w, r.h, r.x + dx * half, r.y - dy * half, r.w, r.h);
    c.restore();
  }

  /** A pink oval with short slanted hatch strokes; k scales it. */
  private drawBlush(x: number, y: number, k: number): void {
    const c = this.ctx;
    const st = this.style;
    const rx = st.blushRx * k;
    const ry = st.blushRy * k;
    if (st.blushPink) {
      c.fillStyle = BLUSH;
      ellipsePath(c, x, y, rx, ry);
      c.fill();
    }
    c.strokeStyle = LINE;
    c.lineWidth = st.hatchWidth;
    const spacing = rx * 0.42;
    for (let i = 0; i < st.hatch; i++) {
      const hx = x + (i - (st.hatch - 1) / 2) * spacing;
      c.beginPath();
      c.moveTo(hx - 0.016, y - ry * 0.42);
      c.lineTo(hx + 0.016, y + ry * 0.42);
      c.stroke();
    }
  }

  private drawEye(kind: EyeKind, side: number, x: number, y: number): void {
    const c = this.ctx;
    const st = this.style;
    const rx = st.eyeRx;
    const ry = st.eyeRy;
    c.strokeStyle = INK;
    c.fillStyle = INK;
    c.lineWidth = LW * 1.15;

    switch (kind) {
      case 'open':
        // Dark eye with the film's big upper highlight and a small lower one.
        ellipsePath(c, x, y, rx, ry);
        c.fill();
        c.fillStyle = '#FFFFFF';
        ellipsePath(c, x - rx * 0.2, y + ry * 0.3, rx * 0.5, rx * 0.5);
        c.fill();
        ellipsePath(c, x + rx * 0.35, y - ry * 0.42, rx * 0.17, rx * 0.17);
        c.fill();
        break;
      case 'happy':
        c.beginPath();
        c.moveTo(x - rx * 1.3, y - ry * 0.3);
        c.quadraticCurveTo(x, y + ry * 1.25, x + rx * 1.3, y - ry * 0.3);
        c.stroke();
        break;
      case 'closed':
        c.beginPath();
        c.moveTo(x - rx * 1.25, y + ry * 0.1);
        c.quadraticCurveTo(x, y - ry * 0.8, x + rx * 1.25, y + ry * 0.1);
        c.stroke();
        break;
      case 'squeeze': {
        const inward = -side;
        c.beginPath();
        c.moveTo(x - inward * rx * 1.1, y + ry * 0.85);
        c.lineTo(x + inward * rx * 0.9, y);
        c.lineTo(x - inward * rx * 1.1, y - ry * 0.85);
        c.stroke();
        break;
      }
      case 'teary': {
        const k = 1.12;
        ellipsePath(c, x, y, rx * k, ry * k);
        c.fill();
        c.save();
        ellipsePath(c, x, y, rx * k, ry * k);
        c.clip();
        c.fillStyle = 'rgba(150, 205, 255, 0.95)';
        ellipsePath(c, x, y - ry * 0.75, rx * 1.3, ry * 0.55);
        c.fill();
        c.restore();
        c.fillStyle = '#FFFFFF';
        ellipsePath(c, x - rx * 0.2, y + ry * 0.38, rx * 0.5, rx * 0.5);
        c.fill();
        ellipsePath(c, x + rx * 0.35, y - ry * 0.15, rx * 0.22, rx * 0.22);
        c.fill();
        break;
      }
    }
  }

  private drawBrows(kind: BrowKind, gx: number, gy: number): void {
    const c = this.ctx;
    const st = this.style;
    if (st.brows === 'none') return;
    c.strokeStyle = LINE;
    c.lineWidth = LW * 0.9;
    for (const side of [-1, 1]) {
      if (st.brows === 'usagi') {
        // Usagi's two big arcs on the forehead are part of the design and always show.
        const tilt = kind === 'worried' ? 0.05 : kind === 'angry' ? -0.05 : 0;
        const ox = gx * 0.3;
        const cy = st.browY + gy * 0.3;
        c.beginPath();
        c.moveTo(side * 0.07 + ox, cy - 0.03 + tilt);
        c.quadraticCurveTo(side * 0.3 + ox, cy + 0.2, side * 0.53 + ox, cy - 0.08 - tilt * 0.4);
        c.stroke();
        continue;
      }
      if (kind === 'none') continue;
      const bx = side * st.eyeX + gx * 0.5;
      const by = st.browY + gy * 0.5;
      const w = 0.07;
      const inner = bx - side * w;
      const outer = bx + side * w;
      c.beginPath();
      if (kind === 'worried') {
        c.moveTo(inner, by + 0.035);
        c.quadraticCurveTo(bx, by + 0.03, outer, by - 0.02);
      } else if (kind === 'angry') {
        c.moveTo(inner, by - 0.03);
        c.lineTo(outer, by + 0.03);
      } else {
        c.moveTo(inner, by - 0.005);
        c.quadraticCurveTo(bx, by + 0.03, outer, by - 0.005);
      }
      c.stroke();
    }
  }

  private drawMouth(kind: MouthKind, mx: number, my: number): void {
    const c = this.ctx;
    const s = this.style.mouthScale;
    c.strokeStyle = LINE;
    c.lineWidth = LW * 0.95;
    const cat = () => {
      c.beginPath();
      c.moveTo(mx - 0.068 * s, my + 0.014 * s);
      c.quadraticCurveTo(mx - 0.034 * s, my - 0.045 * s, mx, my);
      c.quadraticCurveTo(mx + 0.034 * s, my - 0.045 * s, mx + 0.068 * s, my + 0.014 * s);
      c.stroke();
    };
    const filled = (path: () => void, tongueY: number, tongueRx: number, tongueRy: number) => {
      path();
      c.fillStyle = MOUTH_IN;
      c.fill();
      c.save();
      path();
      c.clip();
      c.fillStyle = TONGUE;
      ellipsePath(c, mx, tongueY, tongueRx, tongueRy);
      c.fill();
      c.restore();
      path();
      c.lineWidth = LW * 0.85;
      c.stroke();
    };

    switch (kind) {
      case 'none':
        return;
      case 'cat':
        cat();
        return;
      case 'catOpen':
        filled(
          () => {
            c.beginPath();
            c.moveTo(mx - 0.042 * s, my - 0.012 * s);
            c.bezierCurveTo(mx - 0.045 * s, my - 0.105 * s, mx + 0.045 * s, my - 0.105 * s, mx + 0.042 * s, my - 0.012 * s);
            c.quadraticCurveTo(mx, my - 0.03 * s, mx - 0.042 * s, my - 0.012 * s);
            c.closePath();
          },
          my - 0.085 * s,
          0.035 * s,
          0.026 * s,
        );
        c.lineWidth = LW * 0.95;
        cat();
        return;
      case 'grin':
        filled(
          () => {
            c.beginPath();
            c.moveTo(mx - 0.085 * s, my + 0.005 * s);
            c.quadraticCurveTo(mx, my + 0.02 * s, mx + 0.085 * s, my + 0.005 * s);
            c.bezierCurveTo(mx + 0.08 * s, my - 0.14 * s, mx - 0.08 * s, my - 0.14 * s, mx - 0.085 * s, my + 0.005 * s);
            c.closePath();
          },
          my - 0.105 * s,
          0.06 * s,
          0.042 * s,
        );
        return;
      case 'o':
        ellipsePath(c, mx, my - 0.02 * s, 0.032 * s, 0.042 * s);
        c.fillStyle = MOUTH_IN;
        c.fill();
        c.lineWidth = LW * 0.7;
        c.stroke();
        return;
      case 'wail':
        filled(() => ellipsePath(c, mx, my - 0.06 * s, 0.068 * s, 0.085 * s), my - 0.13 * s, 0.055 * s, 0.04 * s);
        return;
    }
  }
}
