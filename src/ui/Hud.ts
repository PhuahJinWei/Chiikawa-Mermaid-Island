import { t, type StringKey } from '../i18n/I18n';
import type { JoystickView } from '../core/Input';
import { EMOTES, type ActionId } from '../characters/Actions';
import type { EmoteKind } from '../characters/Emotes';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  return node;
}

/** Where a thing's icon is in the sheet of them (see ItemModels.iconAt): its column and row of how many. */
export interface IconSpot {
  column: number;
  row: number;
  columns: number;
  rows: number;
}

/** The pouch: what is in your paw and in each of its slots, by name, icon and how many (null: empty). */
export interface PouchView {
  hand: { name: string; icon: IconSpot; count: number } | null;
  slots: ({ name: string; icon: IconSpot; count: number } | null)[];
}

const ICONS = 'models/props/item_icons.webp';

/** Your own marks, as they show on the screen out of your own eyes (see ownMark). */
const OWN_MARKS: Record<EmoteKind, string> = { exclaim: '！', question: '？', note: '♪', heart: '♥', zzz: 'Z' };
/** How long your own words show (as long as words over a head: Emotes.say), and a mark. */
const OWN_WORDS_FOR = 1900;
const OWN_MARK_FOR = 1300;

/** Title, frame stats, the floating joystick, the jump button, the action button (shown when there is
 * something to do: pick up, put down, give, sit, sleep, get into the cave's boat), the use button (eat,
 * drink, play what you hold), the pouch and its button, the きもち button and its panel (what you do
 * yourself: wave, bow, dance...), your own words and marks out of your own eyes, a word now and then, and
 * the test toggle. */
export class Hud implements JoystickView {
  onJump: () => void = () => {};
  /** The jump button let go of (held, you jump higher). */
  onJumpEnd: () => void = () => {};
  onAction: () => void = () => {};
  onUse: () => void = () => {};
  onTest: () => void = () => {};
  /** A slot of the pouch tapped (0 to 5): what is in it and what is in your paw change places. */
  onSlot: (slot: number) => void = () => {};
  /** The camera's button (a photo), and the notebook's (where everyone is, the album). */
  onCamera: () => void = () => {};
  onNotebook: () => void = () => {};
  /** Something to do picked from the きもち panel. */
  onEmote: (id: ActionId) => void = () => {};

  private readonly title = el('div', 'hud-title');
  private readonly stats = el('div', 'hud-stats');
  private readonly testButton = el('button', 'hud-test');
  private readonly joyBase = el('div', 'joy-base');
  private readonly joyKnob = el('div', 'joy-knob');
  private readonly jumpButton = el('button', 'jump-btn');
  private readonly actionButton = el('button', 'act-btn');
  private action: string | null = null;
  private readonly useButton = el('button', 'use-btn');
  private use: string | null = null;
  private readonly pouchButton = el('button', 'pouch-btn');
  private readonly pouch = el('div', 'pouch');
  private readonly pouchHand = el('div', 'pouch-hand');
  private readonly pouchSlots: HTMLButtonElement[] = [];
  private readonly toastBox = el('div', 'hud-toast');
  private toastTimer = 0;
  private readonly fadeBox = el('div', 'hud-fade');
  private readonly cameraButton = el('button', 'side-btn camera-btn');
  private readonly notebookButton = el('button', 'side-btn notebook-btn');
  private readonly emoteButton = el('button', 'emote-btn');
  private readonly emotes = el('div', 'emotes');
  private readonly emoteChips: HTMLButtonElement[] = [];
  /** Your own words and marks, out of your own eyes (see ownWords, ownMark). */
  private readonly own = el('div', 'hud-own');
  private readonly ownBubble = el('div', 'own-words');
  private ownTimer = 0;
  private readonly flashBox = el('div', 'hud-flash');
  private readonly hint = el('div', 'hud-hint');
  private readonly place = el('div', 'hud-place');
  private placeTimer = 0;
  private readonly loading = el('div', 'loading');

  constructor(ui: HTMLElement) {
    const root = el('div', 'hud');
    const top = el('div', 'hud-top');
    const titleBox = el('div', 'hud-title-box');
    titleBox.append(this.title, this.stats);
    // The きもち button up by the test toggle (the buttons down the side already reach the jump button on a
    // phone held sideways), its panel opening under it.
    const emoteBox = el('div', 'emote-box');
    emoteBox.append(this.emoteButton, this.emotes);
    top.append(titleBox, emoteBox, this.testButton);
    this.joyBase.append(this.joyKnob);
    const side = el('div', 'hud-side');
    side.append(this.pouchButton, this.cameraButton, this.notebookButton);
    for (const [button, call] of [
      [this.cameraButton, () => this.onCamera()],
      [this.notebookButton, () => this.onNotebook()],
    ] as const) {
      button.type = 'button';
      button.addEventListener('click', call);
    }
    for (let i = 0; i < 6; i++) {
      const slot = el('button', 'pouch-slot');
      slot.type = 'button';
      slot.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        this.onSlot(i);
      });
      this.pouchSlots.push(slot);
    }
    const slots = el('div', 'pouch-slots');
    slots.append(...this.pouchSlots);
    this.pouch.append(this.pouchHand, slots);
    this.pouch.hidden = true;
    EMOTES.forEach((id, i) => {
      const chip = el('button', 'emote-chip');
      chip.type = 'button';
      chip.dataset.key = String(i + 1);
      chip.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        this.closeEmotes();
        this.onEmote(id);
      });
      this.emoteChips.push(chip);
    });
    this.emotes.append(...this.emoteChips);
    this.emotes.hidden = true;
    this.emoteButton.type = 'button';
    this.emoteButton.addEventListener('click', () => this.toggleEmotes());
    this.own.append(this.ownBubble);
    root.append(
      top,
      side,
      this.pouch,
      this.place,
      this.joyBase,
      this.jumpButton,
      this.actionButton,
      this.useButton,
      this.hint,
      this.own,
      this.toastBox,
      this.flashBox,
      this.fadeBox,
      this.loading,
    );
    ui.append(root);
    this.pouchButton.type = 'button';
    this.pouchButton.addEventListener('click', () => this.togglePouch());
    this.useButton.type = 'button';
    this.useButton.hidden = true;
    this.useButton.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.onUse();
    });

    this.testButton.type = 'button';
    this.jumpButton.type = 'button';
    this.testButton.addEventListener('click', () => this.onTest());
    this.jumpButton.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.onJump();
    });
    // Held as one rises, the jump goes higher: till the finger lifts, or slides off the button.
    for (const end of ['pointerup', 'pointercancel', 'pointerleave'] as const) {
      this.jumpButton.addEventListener(end, () => this.onJumpEnd());
    }
    this.actionButton.type = 'button';
    this.actionButton.hidden = true;
    this.actionButton.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.onAction();
    });
    window.addEventListener('resize', () => this.hide());
    this.refresh();
    this.hide();
  }

  refresh(): void {
    this.title.textContent = t('app.title');
    this.testButton.textContent = t('hud.test');
    this.jumpButton.textContent = t('hud.jump');
    this.cameraButton.textContent = t('hud.camera');
    this.notebookButton.textContent = t('hud.notebook');
    this.emoteButton.textContent = t('hud.emote');
    EMOTES.forEach((id, i) => (this.emoteChips[i].textContent = t(`action.${id}` as StringKey)));
    if (this.pouchButton.classList.contains('empty') || !this.pouchButton.style.backgroundImage) {
      this.pouchButton.textContent = t('hud.pouch');
    }
    this.hint.textContent = t('hud.hint');
    if (!this.loading.classList.contains('error')) this.loading.textContent = t('app.loading');
  }

  show(x: number, y: number): void {
    this.joyBase.classList.add('active');
    this.joyBase.style.transform = `translate(${x}px, ${y}px)`;
    this.joyKnob.style.transform = 'translate(-50%, -50%)';
  }

  move(dx: number, dy: number): void {
    this.joyKnob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
  }

  /** The stick goes pink while it sprints (held at its edge a moment: see Input.sprint). */
  sprint(on: boolean): void {
    this.joyBase.classList.toggle('sprint', on);
  }

  /** Rest the joystick ring in the bottom-left corner as a hint of where to touch. */
  hide(): void {
    this.joyBase.classList.remove('active');
    this.joyBase.style.transform = `translate(92px, ${window.innerHeight - 150}px)`;
    this.joyKnob.style.transform = 'translate(-50%, -50%)';
  }

  hideHint(): void {
    this.hint.classList.add('gone');
  }

  /** Shows a hint in the hint's place, or hides it again with null. */
  showHint(text: string | null): void {
    if (text === null) {
      this.hideHint();
      return;
    }
    this.hint.textContent = text;
    this.hint.classList.remove('gone');
  }

  /** Shows the action button with this label, or hides it (null). */
  setAction(label: string | null): void {
    if (label === this.action) return;
    this.action = label;
    this.actionButton.hidden = label === null;
    if (label !== null) this.actionButton.textContent = label;
  }

  /** Shows the use button with this label (eat, drink, play), or hides it (null). */
  setUse(label: string | null): void {
    if (label === this.use) return;
    this.use = label;
    this.useButton.hidden = label === null;
    if (label !== null) this.useButton.textContent = label;
  }

  /** Opens the pouch, or shuts it (and the きもち panel, which opens where it does). */
  togglePouch(): void {
    this.pouch.hidden = !this.pouch.hidden;
    this.pouchButton.classList.toggle('open', !this.pouch.hidden);
    if (!this.pouch.hidden) this.closeEmotes();
  }

  /** Opens the きもち panel, or shuts it (and the pouch). */
  toggleEmotes(): void {
    if (this.emotes.hidden) {
      this.emotes.hidden = false;
      this.emoteButton.classList.add('open');
      if (!this.pouch.hidden) this.togglePouch();
    } else {
      this.closeEmotes();
    }
  }

  closeEmotes(): void {
    this.emotes.hidden = true;
    this.emoteButton.classList.remove('open');
  }

  get emotesOpen(): boolean {
    return !this.emotes.hidden;
  }

  /** Your own words, out of your own eyes: in a bubble low in the middle of the screen, as from you. */
  ownWords(text: string): void {
    const bubble = this.ownBubble;
    bubble.textContent = text;
    bubble.classList.remove('shown');
    void bubble.offsetWidth;
    bubble.classList.add('shown');
    window.clearTimeout(this.ownTimer);
    this.ownTimer = window.setTimeout(() => bubble.classList.remove('shown'), OWN_WORDS_FOR);
  }

  /** One of your own marks (a note as you dance, a heart as you eat), out of your own eyes: rising from
   * where your words show, and fading. */
  ownMark(kind: EmoteKind): void {
    const mark = el('div', `own-mark own-${kind}`);
    mark.textContent = OWN_MARKS[kind];
    mark.style.setProperty('--drift', `${(Math.random() * 2 - 1) * 26}px`);
    this.own.append(mark);
    window.setTimeout(() => mark.remove(), OWN_MARK_FOR);
  }

  /** What the pouch and your paw hold now. */
  setPouch(view: PouchView): void {
    const show = (node: HTMLElement, what: PouchView['hand']) => {
      node.title = what?.name ?? '';
      node.setAttribute('aria-label', what?.name ?? t('hud.empty'));
      node.classList.toggle('empty', !what);
      // How many a slot's stack has, on its corner (none for one).
      node.dataset.count = what && what.count > 1 ? String(what.count) : '';
      if (!what) {
        node.style.backgroundImage = '';
        return;
      }
      const { column, row, columns, rows } = what.icon;
      node.style.backgroundImage = `url(${ICONS})`;
      node.style.backgroundSize = `${columns * 100}% ${rows * 100}%`;
      node.style.backgroundPosition = `${(column / Math.max(columns - 1, 1)) * 100}% ${(row / Math.max(rows - 1, 1)) * 100}%`;
    };
    show(this.pouchHand, view.hand);
    view.slots.forEach((slot, i) => show(this.pouchSlots[i], slot));
    // The button shows what your paw holds, or says what it is.
    show(this.pouchButton, view.hand);
    this.pouchButton.textContent = view.hand ? '' : t('hud.pouch');
  }

  /** A word for a moment over the controls (what you picked up, that the pouch is full). */
  toast(text: string): void {
    this.toastBox.textContent = text;
    this.toastBox.classList.add('shown');
    window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => this.toastBox.classList.remove('shown'), 2200);
  }

  /** The camera's flash, over the screen for a moment. */
  flash(): void {
    this.flashBox.classList.remove('on');
    void this.flashBox.offsetWidth;
    this.flashBox.classList.add('on');
  }

  /** Fades the screen to the night's dark (true) or back (false), resolving once it has. */
  fade(dark: boolean): Promise<void> {
    this.fadeBox.classList.toggle('dark', dark);
    return new Promise((done) => window.setTimeout(done, 900));
  }

  setControlsVisible(on: boolean): void {
    this.jumpButton.hidden = !on;
    this.joyBase.hidden = !on;
  }

  /** The name of the place just walked into, showing for a moment under the title. */
  showPlace(name: string): void {
    this.place.textContent = name;
    this.place.classList.add('shown');
    window.clearTimeout(this.placeTimer);
    this.placeTimer = window.setTimeout(() => this.place.classList.remove('shown'), 2600);
  }

  setStats(text: string): void {
    this.stats.textContent = text;
  }

  doneLoading(): void {
    this.loading.remove();
  }

  showError(): void {
    this.loading.classList.add('error');
    this.loading.textContent = t('app.error');
  }
}
