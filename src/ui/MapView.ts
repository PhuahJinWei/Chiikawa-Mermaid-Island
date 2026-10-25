import { t, type StringKey } from '../i18n/I18n';
import { terrainHeight, waterLevelAt } from '../world/Island';

/**
 * The island's map (ちず, or M; the user, 2026-10-25: players got lost in the jungle, finding 島二郎's shop and the
 * stepping stones, and finding their way back): a card over the island, the island from above with its places named
 * and where you stand and look marked on it, drawn once, the first time it is opened. Not a map kept up in a corner
 * of the screen, nor a picture of the island drawn again from above: it is the island's own painted colour map (the
 * one its ground is painted with, so its paths, clearings and the jungle's shade are on it, and no more to download),
 * the sea laid over it from the island's own heights, and while it is shut it costs nothing. It knows places, never
 * people: finding someone is the dialogue's.
 */

/** The part of the island it shows (game metres): its north-west corner and how far across, a square. */
const AREA = { x: -212, z: -296, size: 356 };
/** The island's colour map (build_island.py: COLOUR_SIZE texels over SIZE metres round CENTRE, north up). */
const COLOUR_MAP = { url: 'models/island/terrain.webp', x: -295, z: -400, size: 520 };
/** How many pixels across it is drawn, and the sea's samples (one a metre). */
const PIXELS = 1024;
const SEA_STEP = 1;
/** The sea's colours as the film paints its water (see Stage's water): pale and clear at its edge, the lagoon's
 * turquoise, azure deeper, by depth (metres). */
const SEA: [number, [number, number, number]][] = [
  [0, [170, 232, 222]],
  [0.6, [95, 210, 205]],
  [2.5, [58, 182, 205]],
  [6, [46, 140, 205]],
];
/** The places named on it: the words' key and where they are written (x, z). The forbidden cave and its beach are
 * left off: it is a hidden place, which no path leads to. */
const PLACES: [StringKey, number, number][] = [
  ['zone.pier', 13, 12],
  ['zone.mainBeach', -42, 2],
  ['zone.festival', 22, -28],
  ['zone.fields', -54, -52],
  ['zone.village', 6, -70],
  ['zone.nightBeach', 70, -12],
  ['zone.waterfall', 22, -175],
  ['zone.stones', -100, -222],
  ['zone.gorge', -132, -194],
  ['zone.shimajiro', -176, -146],
  ['zone.cliffs', 30, -282],
];

export class MapView {
  /** Shut (by its close, its scrim or Escape). */
  onClose: () => void = () => {};
  private readonly root = document.createElement('div');
  private readonly canvas = document.createElement('canvas');
  private readonly mark = document.createElement('div');
  private drawn: Promise<void> | null = null;

  constructor(parent: HTMLElement) {
    const root = this.root;
    root.className = 'sheet map-sheet';
    const scrim = document.createElement('div');
    scrim.className = 'sheet-scrim';
    scrim.addEventListener('pointerdown', () => this.close());
    const card = document.createElement('div');
    card.className = 'sheet-card map-card';
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-modal', 'true');
    const tabs = document.createElement('div');
    tabs.className = 'sheet-tabs';
    const tab = document.createElement('span');
    tab.className = 'sheet-tab';
    tab.setAttribute('aria-selected', 'true');
    tab.textContent = t('map.title');
    tabs.append(tab);
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'sheet-close';
    close.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.5 6.5 17.5 17.5M17.5 6.5 6.5 17.5"/></svg>';
    close.setAttribute('aria-label', t('hud.close'));
    close.addEventListener('click', () => this.close());
    const frame = document.createElement('div');
    frame.className = 'map-frame';
    this.canvas.width = this.canvas.height = PIXELS;
    this.canvas.className = 'map-canvas';
    this.mark.className = 'map-mark';
    this.mark.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.5 18.5 19 12 15.2 5.5 19Z"/></svg>';
    frame.append(this.canvas, this.mark);
    card.append(tabs, close, frame);
    root.append(scrim, card);
    parent.append(root);
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Escape' && this.isOpen) this.close();
    });
  }

  get isOpen(): boolean {
    return this.root.classList.contains('is-open');
  }

  open(): void {
    this.drawn ??= this.draw().catch((err) => console.error(err));
    this.root.classList.add('is-open');
  }

  close(): void {
    if (!this.isOpen) return;
    this.root.classList.remove('is-open');
    this.onClose();
  }

  /** Where you stand (x, z) and the way you look (dx, dz, along the ground), marked on it while it is open. */
  update(x: number, z: number, dx: number, dz: number): void {
    if (!this.isOpen) return;
    const u = ((x - AREA.x) / AREA.size) * 100;
    const v = ((z - AREA.z) / AREA.size) * 100;
    this.mark.style.left = `${Math.min(100, Math.max(0, u)).toFixed(2)}%`;
    this.mark.style.top = `${Math.min(100, Math.max(0, v)).toFixed(2)}%`;
    this.mark.style.transform = `translate(-50%, -50%) rotate(${Math.atan2(dx, -dz).toFixed(3)}rad)`;
  }

  /** The island's colour map, the sea over it by depth, a paper's warmth and its edge, and the places' names. */
  private async draw(): Promise<void> {
    const ctx = this.canvas.getContext('2d') as CanvasRenderingContext2D;
    const image = new Image();
    image.src = COLOUR_MAP.url;
    await image.decode();
    const k = image.width / COLOUR_MAP.size;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(image, (AREA.x - COLOUR_MAP.x) * k, (AREA.z - COLOUR_MAP.z) * k, AREA.size * k, AREA.size * k, 0, 0, PIXELS, PIXELS);
    // The sea: a sample a metre, coloured by its depth, laid over the colour map's sea floor and smoothed up.
    const n = Math.round(AREA.size / SEA_STEP) + 1;
    const sea = new ImageData(n, n);
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const x = AREA.x + i * SEA_STEP;
        const z = AREA.z + j * SEA_STEP;
        const depth = waterLevelAt(x, z) - terrainHeight(x, z);
        if (depth <= 0) continue;
        const [r, g, b] = seaColour(depth);
        const o = (j * n + i) * 4;
        sea.data[o] = r;
        sea.data[o + 1] = g;
        sea.data[o + 2] = b;
        sea.data[o + 3] = Math.round(255 * Math.min(1, 0.55 + depth * 1.5));
      }
    }
    const layer = document.createElement('canvas');
    layer.width = layer.height = n;
    (layer.getContext('2d') as CanvasRenderingContext2D).putImageData(sea, 0, 0);
    ctx.drawImage(layer, 0, 0, n, n, 0, 0, PIXELS, PIXELS);
    // Warmed as paper is, a little, and darker toward its edge.
    ctx.fillStyle = 'rgba(255, 240, 210, 0.14)';
    ctx.fillRect(0, 0, PIXELS, PIXELS);
    const edge = ctx.createRadialGradient(PIXELS / 2, PIXELS / 2, PIXELS * 0.36, PIXELS / 2, PIXELS / 2, PIXELS * 0.72);
    edge.addColorStop(0, 'rgba(91, 76, 68, 0)');
    edge.addColorStop(1, 'rgba(91, 76, 68, 0.28)');
    ctx.fillStyle = edge;
    ctx.fillRect(0, 0, PIXELS, PIXELS);
    // The places, in the HUD's own rounded hand, brown on a cream halo.
    await document.fonts.ready;
    const family = getComputedStyle(document.documentElement).getPropertyValue('--font-ja').trim() || 'sans-serif';
    ctx.font = `700 ${Math.round(PIXELS * 0.036)}px ${family}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    for (const [key, x, z] of PLACES) {
      const px = ((x - AREA.x) / AREA.size) * PIXELS;
      const py = ((z - AREA.z) / AREA.size) * PIXELS;
      ctx.lineWidth = PIXELS * 0.011;
      ctx.strokeStyle = 'rgba(255, 253, 247, 0.92)';
      ctx.strokeText(t(key), px, py);
      ctx.fillStyle = '#5b4c44';
      ctx.fillText(t(key), px, py);
    }
  }
}

/** The sea's colour at `depth` metres (see SEA). */
function seaColour(depth: number): [number, number, number] {
  for (let i = 1; i < SEA.length; i++) {
    const [d1, c1] = SEA[i];
    const [d0, c0] = SEA[i - 1];
    if (depth <= d1) {
      const f = (depth - d0) / (d1 - d0);
      return [c0[0] + (c1[0] - c0[0]) * f, c0[1] + (c1[1] - c0[1]) * f, c0[2] + (c1[2] - c0[2]) * f];
    }
  }
  return SEA[SEA.length - 1][1];
}
