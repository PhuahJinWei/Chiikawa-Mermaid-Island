import { t } from '../i18n/I18n';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text = ''): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  if (text) node.textContent = text;
  return node;
}

/** Where the photo's frame is on the screen, in CSS pixels. */
export interface Frame {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** The photo's shapes, as a phone's camera offers them, each its long side to its short; tapped, the next. */
const SHAPES = { '4:3': [4, 3], '16:9': [16, 9], '1:1': [1, 1] } as const;
type Shape = keyof typeof SHAPES;
const SHAPE_ORDER: Shape[] = ['4:3', '16:9', '1:1'];
/** The zoom chips: how many times nearer each brings things than the eyes' own lens (only those the lens
 * reaches show: see update). */
const CHIPS = [1, 2, 3];
/** What the camera keeps for your next visit: the shape you chose. */
const KEY = 'mermaid-island:camera';
/** How long the word that a photo went to your device shows (milliseconds). */
const SAVED_FOR = 1500;
/** The camera's × (put away), stroked as the HUD's drawings are (see Hud's GLYPH). */
const CLOSE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.5 6.5 17.5 17.5M17.5 6.5 6.5 17.5"/></svg>';

/** Done once (see forgetOldPhotos). */
const OLD_PHOTOS_GONE = 'mermaid-island:old-photos-gone';

/**
 * The photos the camera used to keep (an album in the browser's IndexedDB, database `mermaid-island`, until
 * 2026-10-24), thrown away once (the user's wish): nothing reads them now. Nothing else keeps anything there.
 */
export function forgetOldPhotos(): void {
  try {
    if (localStorage.getItem(OLD_PHOTOS_GONE)) return;
    const req = indexedDB.deleteDatabase('mermaid-island');
    req.onsuccess = () => localStorage.setItem(OLD_PHOTOS_GONE, '1');
  } catch {
    // No storage here (a private window): there is nothing kept to throw away.
  }
}

/** A photo's file name, by when it was taken (mermaid-island-20261024-134205.jpg). */
function fileName(at: Date): string {
  const two = (n: number) => String(n).padStart(2, '0');
  const day = `${at.getFullYear()}${two(at.getMonth() + 1)}${two(at.getDate())}`;
  return `mermaid-island-${day}-${two(at.getHours())}${two(at.getMinutes())}${two(at.getSeconds())}.jpg`;
}

/** How near a zoom brings things, as a chip says it: 1, 1.4, 2. */
function times(k: number): string {
  return String(Math.round(k * 10) / 10);
}

/**
 * Your camera, held up (the camera's button; the user, 2026-10-24: a camera mode that looks as a phone's camera
 * app does, to take a photo more carefully; its black bars, but no grid, which was too much): the island in the
 * photo's frame, the rest of the screen dark round it, the HUD away; on the dark, in white as a phone's are, × to
 * put the camera away and the photo's shape (4:3, 16:9, 1:1) along the top (down the left, held sideways), and the
 * shutter along the bottom (down the right), with a chip for each zoom by it. Drag to aim, pinch or scroll to
 * zoom (see Input); the shutter, Space or Enter takes what is in the frame. It is kept
 * nowhere: it comes up as a print over the island, asking whether to keep it on your device (ほぞん, a download),
 * with シェア where the device shares and とりなおす to let it go and take another.
 */
export class CameraView {
  /** The shutter: what is in `frame` drawn and read back, the picture (or null, if it could not be). */
  onShutter: (frame: Frame) => HTMLCanvasElement | null = () => null;
  /** Put away (×, Escape). */
  onClose: () => void = () => {};
  /** A zoom chip tapped: things brought `times` nearer than through the eyes' own lens. */
  onZoom: (times: number) => void = () => {};

  private readonly root = el('div', 'cam');
  /** The photo's frame, the dark round it (see .cam-frame); the shutter's blink in it. */
  private readonly frameBox = el('div', 'cam-frame');
  private readonly blink = el('div', 'cam-blink');
  private readonly shapeWord = el('span', 'cam-shape');
  private shape: Shape = '4:3';
  private rect: Frame = { x: 0, y: 0, width: 0, height: 0 };
  private readonly zoomRow = el('div', 'cam-zoom');
  private readonly chips: HTMLButtonElement[] = [];
  /** A photo taken: the print, and what to do with it. */
  private readonly review = el('div', 'cam-review');
  private readonly print = el('div', 'cam-print');
  private readonly save = el('a', 'cam-act is-save');
  private readonly share = el('button', 'cam-act');
  private readonly toastBox = el('div', 'cam-toast');
  private toastTimer = 0;
  /** The window's size the controls were last laid out for (see update). */
  private laidW = 0;
  private laidH = 0;
  /** The zoom the chips show (see update): '' none, null not yet shown since the camera was held up. */
  private shownZoom: string | null = null;
  /** The photo just taken, a print till you choose; its file and its address, once made. */
  private shot: HTMLCanvasElement | null = null;
  private file: File | null = null;
  private url: string | null = null;

  constructor(ui: HTMLElement) {
    const root = this.root;
    root.hidden = true;
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-label', t('hud.camera'));

    const close = this.button('cam-close', () => this.onClose());
    close.innerHTML = CLOSE;
    close.setAttribute('aria-label', t('panel.close'));
    try {
      const kept = (JSON.parse(localStorage.getItem(KEY) ?? '{}') as { shape?: unknown }).shape;
      if (typeof kept === 'string' && kept in SHAPES) this.shape = kept as Shape;
    } catch {
      // Nothing kept, or storage blocked: 4:3.
    }
    const shapeButton = this.button('cam-tool', () => {
      this.shape = SHAPE_ORDER[(SHAPE_ORDER.indexOf(this.shape) + 1) % SHAPE_ORDER.length];
      try {
        localStorage.setItem(KEY, JSON.stringify({ shape: this.shape }));
      } catch {
        // Storage blocked (private mode): for this visit only.
      }
      this.layout();
    });
    shapeButton.setAttribute('aria-label', t('camera.shape'));
    shapeButton.append(this.shapeWord);
    this.frameBox.append(this.blink);

    // The shutter, a chip for each zoom by it.
    const controls = el('div', 'cam-controls');
    for (const k of CHIPS) {
      const chip = this.button('cam-chip', () => this.onZoom(k));
      chip.setAttribute('aria-label', t('camera.zoom').replace('{0}', String(k)));
      this.chips.push(chip);
    }
    this.zoomRow.append(...this.chips);
    const shutter = this.button('cam-shutter', () => this.take());
    shutter.setAttribute('aria-label', t('camera.shutter'));
    shutter.append(el('span', 'cam-shutter-disc'));
    controls.append(this.zoomRow, shutter);

    // A photo taken: the print, the question, and to keep it (ほぞん), share it, or take another.
    const retake = this.button('cam-act', () => this.letGo());
    retake.textContent = t('camera.retake');
    this.share.type = 'button';
    this.share.textContent = t('camera.share');
    this.share.addEventListener('click', () => void this.shareShot());
    this.save.textContent = t('camera.save');
    this.save.addEventListener('click', (e) => {
      if (!this.url) {
        e.preventDefault();
        return;
      }
      // (The download goes on from the link's address after the print has gone: see letGo.)
      window.setTimeout(() => {
        this.letGo();
        this.toast(t('camera.saved'));
      }, 0);
    });
    const acts = el('div', 'cam-acts');
    acts.append(retake, this.share, this.save);
    // (The question broken after its comma where it must be, never inside a word: see .cam-ask span.)
    const ask = el('div', 'cam-ask');
    for (const part of t('camera.ask').replace(/、/g, '、\n').split('\n')) ask.append(el('span', '', part));
    const panel = el('div', 'cam-panel');
    panel.append(ask, acts);
    this.review.append(this.print, panel);
    this.review.hidden = true;

    root.append(this.frameBox, close, shapeButton, controls, this.review, this.toastBox);
    ui.append(root);
  }

  get isOpen(): boolean {
    return !this.root.hidden;
  }

  /** Held up: its controls laid out for this screen, the keyboard the camera's. */
  open(): void {
    if (this.isOpen) return;
    this.root.hidden = false;
    this.shownZoom = null;
    this.layout();
    window.addEventListener('keydown', this.onKey);
  }

  /** Put away, a photo still up let go of. */
  close(): void {
    if (!this.isOpen) return;
    this.letGo();
    this.root.hidden = true;
    window.removeEventListener('keydown', this.onKey);
  }

  /**
   * Each frame while it is held up: how near the zoom brings things now (`zoom`; null where the chips do nothing,
   * out of anyone's eyes but your own) and at most (`most`), on its chips, as a phone's are: the chip the zoom has
   * reached says how near it is now in the accent, the others their own; only those the lens reaches. Laid out
   * again if the window has changed.
   */
  update(zoom: number | null, most: number): void {
    if (window.innerWidth !== this.laidW || window.innerHeight !== this.laidH) this.layout();
    const key = zoom === null ? '' : `${times(zoom)}/${most.toFixed(2)}`;
    if (key === this.shownZoom) return;
    this.shownZoom = key;
    this.zoomRow.hidden = zoom === null;
    if (zoom === null) return;
    let at = 0;
    CHIPS.forEach((k, i) => {
      if (zoom >= k - 0.05) at = i;
    });
    this.chips.forEach((chip, i) => {
      chip.hidden = CHIPS[i] > most + 0.05;
      chip.classList.toggle('is-on', i === at);
      chip.textContent = i === at ? `${times(zoom)}×` : String(CHIPS[i]);
    });
  }

  /** A button of the camera's, doing `call` when pressed. */
  private button(className: string, call: () => void): HTMLButtonElement {
    const node = el('button', className);
    node.type = 'button';
    node.addEventListener('click', (e) => {
      // (Pressed by a finger or the mouse, the keyboard's Space and Enter are left to the shutter: see onKey.)
      if (e.detail > 0) node.blur();
      call();
    });
    return node;
  }

  /**
   * The frame as big as the screen allows in the shape chosen, its long side across a wide screen (or one held
   * sideways) and up an upright one, in the middle of it, the dark round it; the controls in the middle of the dark
   * (see .cam-close, .cam-controls), over the frame's edge where too little is left for them.
   */
  private layout(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    if (!(w > 0 && h > 0)) return;
    this.laidW = w;
    this.laidH = h;
    const wide = w >= h;
    const [long, short] = SHAPES[this.shape];
    const aspect = wide ? long / short : short / long;
    let width = w;
    let height = w / aspect;
    if (height > h) {
      height = h;
      width = h * aspect;
    }
    this.rect = { x: (w - width) / 2, y: (h - height) / 2, width, height };
    const s = this.root.style;
    s.setProperty('--fx', `${this.rect.x.toFixed(1)}px`);
    s.setProperty('--fy', `${this.rect.y.toFixed(1)}px`);
    s.setProperty('--fw', `${width.toFixed(1)}px`);
    s.setProperty('--fh', `${height.toFixed(1)}px`);
    this.root.classList.toggle('is-wide', wide);
    this.shapeWord.textContent = this.shape;
  }

  /** Space or Enter the shutter (unless the keyboard is on one of the camera's own buttons); Escape lets a photo
   * taken go, or puts the camera away. */
  private onKey = (e: KeyboardEvent) => {
    if (e.code === 'Escape') {
      e.preventDefault();
      if (this.shot) this.letGo();
      else this.onClose();
      return;
    }
    if (e.code !== 'Space' && e.code !== 'Enter') return;
    if (e.target instanceof HTMLButtonElement || e.target instanceof HTMLAnchorElement) return;
    e.preventDefault();
    if (!e.repeat) this.take();
  };

  /** The shutter: the screen goes dark a moment, as a phone's does, and the photo comes up (see hold). */
  private take(): void {
    if (this.shot) return;
    const shot = this.onShutter({ ...this.rect });
    this.blink.classList.remove('on');
    void this.blink.offsetWidth;
    this.blink.classList.add('on');
    if (shot) this.hold(shot);
  }

  /** `shot` up as a print, asking what to do with it; its file made meanwhile, for the download and the share. */
  private hold(shot: HTMLCanvasElement): void {
    this.shot = shot;
    shot.className = 'cam-shot';
    this.print.replaceChildren(shot);
    this.review.hidden = false;
    this.root.classList.add('is-review');
    const name = fileName(new Date());
    this.save.download = name;
    this.save.removeAttribute('href');
    this.save.classList.add('is-wait');
    this.share.hidden = true;
    shot.toBlob(
      (blob) => {
        if (!blob || this.shot !== shot) return;
        this.url = URL.createObjectURL(blob);
        this.save.href = this.url;
        this.save.classList.remove('is-wait');
        this.file = new File([blob], name, { type: 'image/jpeg' });
        this.share.hidden = !navigator.canShare?.({ files: [this.file] });
      },
      'image/jpeg',
      0.92,
    );
  }

  /** The photo shared where the device shares (its own sheet); shared, back to the camera. */
  private async shareShot(): Promise<void> {
    const file = this.file;
    if (!file) return;
    try {
      await navigator.share({ files: [file], title: t('app.title') });
      if (this.file === file) this.letGo();
    } catch {
      // Not shared (put away, or not allowed here): it stays, to keep or let go.
    }
  }

  /** Back to the camera, the photo let go of (its address a while yet, for a download still under way). */
  private letGo(): void {
    this.print.replaceChildren();
    this.shot = null;
    this.file = null;
    const url = this.url;
    if (url) window.setTimeout(() => URL.revokeObjectURL(url), 10000);
    this.url = null;
    this.review.hidden = true;
    this.root.classList.remove('is-review');
  }

  /** A word for a moment in the middle of the screen. */
  private toast(text: string): void {
    this.toastBox.textContent = text;
    this.toastBox.classList.add('shown');
    window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => this.toastBox.classList.remove('shown'), SAVED_FOR);
  }
}
