import { t, type StringKey } from '../i18n/I18n';
import type { JoystickView } from '../core/Input';
import { EMOTES, type ActionId } from '../characters/Actions';
import type { EmoteKind } from '../characters/Emotes';
import { DialogueBox } from './DialogueBox';
import { loadFaces } from './Faces';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  return node;
}

/** A thing's icon as `node`'s background: the user's drawing of it, else its render from the sheet; null: none. */
function iconOn(node: HTMLElement, icon: IconSpot | null): void {
  if (!icon) {
    node.style.backgroundImage = '';
    return;
  }
  if (icon.src) {
    node.style.backgroundImage = `url(${icon.src})`;
    node.style.backgroundSize = 'contain';
    node.style.backgroundPosition = 'center';
    return;
  }
  const { column, row, columns, rows } = icon;
  node.style.backgroundImage = `url(${ICONS})`;
  node.style.backgroundSize = `${columns * 100}% ${rows * 100}%`;
  node.style.backgroundPosition = `${(column / Math.max(columns - 1, 1)) * 100}% ${(row / Math.max(rows - 1, 1)) * 100}%`;
}

/** A thing's icon: the user's drawing of it (`src`, see ItemModels.iconOf), or where its render is in the sheet of
 * them (see ItemModels.iconAt), its column and row of how many. */
export interface IconSpot {
  src: string | null;
  column: number;
  row: number;
  columns: number;
  rows: number;
}

/** A thing in the pouch, or in your paw: its name, icon and how many; for its card (see Hud.showCard), what it is for,
 * a line about it, and a word on it of its own (borrowed, back to its place each morning, bitten into), if any. */
export interface PouchThing {
  name: string;
  icon: IconSpot;
  count: number;
  kind: string;
  about: string | null;
  note: string | null;
}

/** The pouch: what is in your paw and in each of its slots (null: empty). */
export interface PouchView {
  hand: PouchThing | null;
  slots: (PouchThing | null)[];
}

const ICONS = 'models/props/item_icons.webp';

/**
 * The HUD's drawings, in the user's other game's own hand (Chiikawa-Hidamari, the user's choice, 2026-10-23: its
 * look over this one's, which was "underwhelming and cheap"): stroked lines in the ring's brown, round ends, on a 24
 * grid. Its own where it has them (jump, the bag, the camera, close, and its verbs), drawn the same way where it has
 * none.
 */
const GLYPH: Record<string, string> = {
  jump: '<path d="M12 17.5V6.5"/><path d="m7 11.5 5-5 5 5"/><path d="M6.5 21c3.4-1.7 7.6-1.7 11 0"/>',
  bag:
    '<path d="M4.9 20.4v-8.8a4.4 4.4 0 0 1 4.4-4.4h5.4a4.4 4.4 0 0 1 4.4 4.4v8.8a1.4 1.4 0 0 1-1.4 1.4H6.3a1.4 1.4 0 0 1-1.4-1.4Z"/>' +
    '<path d="M9.9 7.3V6.1a2.1 2.1 0 0 1 4.2 0v1.2"/><path d="M8.7 21.8v-5.1a1 1 0 0 1 1-1h4.6a1 1 0 0 1 1 1v5.1"/>',
  camera:
    '<path d="M2.9 8.4h3.4l1.4-2.2h8.6l1.4 2.2h3.4v9.9a1 1 0 0 1-1 1H3.9a1 1 0 0 1-1-1Z"/><circle cx="12" cy="13.3" r="3.3"/>' +
    '<path d="M18.4 11h1.1"/>',
  close: '<path d="M6.5 6.5 17.5 17.5M17.5 6.5 6.5 17.5"/>',
  // A round face, smiling: how you feel, and what you do with it.
  emote: '<circle cx="12" cy="12" r="8.4"/><path d="M8.6 13.6a4.2 4.2 0 0 0 6.8 0"/><path d="M9.2 9.6h.01M14.8 9.6h.01"/>',
  // Three sliders: the test panel's switches.
  test: '<path d="M5 6.5h14M5 12h14M5 17.5h14"/><circle cx="9" cy="6.5" r="1.9"/><circle cx="15" cy="12" r="1.9"/><circle cx="8" cy="17.5" r="1.9"/>',
  sun: '<circle cx="12" cy="12" r="4.2"/><path d="M12 3.1v2.3M12 18.6v2.3M3.1 12h2.3M18.6 12h2.3M5.7 5.7l1.6 1.6M16.7 16.7l1.6 1.6M18.3 5.7l-1.6 1.6M7.3 16.7l-1.6 1.6"/>',
  moon: '<path d="M19.4 14.6A8.2 8.2 0 0 1 9.4 4.6a8.2 8.2 0 1 0 10 10Z"/>',
  grab: '<path d="M12 3.2v9"/><path d="m8.5 6.7 3.5-3.5 3.5 3.5"/><path d="M5 13.2a7 7 0 0 0 14 0"/>',
  put: '<path d="M12 3.6v9"/><path d="m8.5 9.1 3.5 3.5 3.5-3.5"/><path d="M5 18.4h14"/>',
  give: '<path d="M18.6 7.8H9.7a4.4 4.4 0 0 0 0 8.8h3.6"/><path d="m15.1 4.3 3.5 3.5-3.5 3.5"/>',
  talk: '<path d="M4.4 5.6h15.2v9.6h-8.4l-4 3.2v-3.2H4.4Z"/>',
  sit: '<path d="M8 4.6v7.6h7.8"/><path d="M5.4 12.2h11.4"/><path d="M7.2 15.1v4.3"/><path d="M15 15.1v4.3"/>',
  stand: '<path d="M12 19.4V6.2"/><path d="m7.4 10.8 4.6-4.6 4.6 4.6"/>',
  sleep: '<path d="M19.4 14.6A8.2 8.2 0 0 1 9.4 4.6a8.2 8.2 0 1 0 10 10Z"/>',
  // A stall: its awning, its counter, its open front.
  stall: '<path d="M4 9.5 6 5h12l2 4.5"/><path d="M4 9.5h16"/><path d="M5.5 9.5V19h13V9.5"/><path d="M9.5 19v-5h5v5"/>',
  // A bowl with steam over it.
  eat: '<path d="M4 12h16a8 8 0 0 1-16 0Z"/><path d="M9.4 4.4c-1 1.2 1 2 0 3.2M14.4 4.4c-1 1.2 1 2 0 3.2"/>',
  // A cup with its straw.
  drink: '<path d="M7 8h10l-1.3 11.2a1 1 0 0 1-1 .8H9.3a1 1 0 0 1-1-.8Z"/><path d="m12.5 8 2.5-4.5h2.5"/>',
  play: '<path d="M9 17.5V5.5l9-2v12"/><circle cx="6.8" cy="17.5" r="2.3"/><circle cx="15.8" cy="15.5" r="2.3"/>',
  read: '<path d="M12 6.5c-2-1.4-4.8-1.8-8-1.4v12.6c3.2-.4 6-.1 8 1.4 2-1.5 4.8-1.8 8-1.4V5.1c-3.2-.4-6 0-8 1.4Z"/><path d="M12 6.5v12.6"/>',
  stop: '<path d="m7 7 10 10"/><path d="m17 7-10 10"/>',
  // A forked staff held up on a slant (かまえる), and an arrow down (おろす).
  ready: '<path d="M5 19 13.5 10.5"/><path d="M13.5 10.5c-1.6-1.6-1.9-3.9-1-6"/><path d="M13.5 10.5c1.6 1.6 3.9 1.9 6 1"/>',
  lower: '<path d="M12 5v13"/><path d="m7.5 13.5 4.5 4.5 4.5-4.5"/>',
  next: '<path d="m9 6 6 6-6 6"/>',
  boat: '<path d="M3.5 14h17l-2.4 4.2a1.6 1.6 0 0 1-1.4.8H7.3a1.6 1.6 0 0 1-1.4-.8Z"/><path d="M12 14V4.5l5.5 7.5H12"/>',
};

/** A glyph's drawing (see GLYPH). */
function svg(name: string): string {
  return `<svg viewBox="0 0 24 24" aria-hidden="true">${GLYPH[name] ?? ''}</svg>`;
}

/** The glyph each word on the action and use buttons wears, by the word's key. */
const VERB_GLYPH: [StringKey, string][] = [
  ['hud.pickUp', 'grab'],
  ['hud.borrow', 'grab'],
  ['hud.put', 'put'],
  ['hud.putBack', 'put'],
  ['hud.give', 'give'],
  ['hud.serve', 'give'],
  ['hud.talk', 'talk'],
  ['hud.sit', 'sit'],
  ['hud.stand', 'stand'],
  ['hud.sleep', 'sleep'],
  ['hud.keepStall', 'stall'],
  ['hud.eat', 'eat'],
  ['hud.eatUp', 'eat'],
  ['hud.drink', 'drink'],
  ['hud.drinkUp', 'drink'],
  ['hud.play', 'play'],
  ['hud.read', 'read'],
  ['hud.ready', 'ready'],
  ['hud.lower', 'lower'],
  ['hud.stop', 'stop'],
  ['hud.close', 'stop'],
  ['hud.next', 'next'],
  ['hud.board', 'boat'],
  ['hud.getOut', 'boat'],
];

/** The paw slot's mark: a paw print. */
const PAW =
  '<svg viewBox="0 0 24 24" aria-hidden="true">' +
  '<ellipse cx="12" cy="15.5" rx="5.6" ry="4.6" fill="currentColor"/>' +
  '<circle cx="6" cy="9.6" r="2.3" fill="currentColor"/><circle cx="10" cy="6.4" r="2.3" fill="currentColor"/>' +
  '<circle cx="14" cy="6.4" r="2.3" fill="currentColor"/><circle cx="18" cy="9.6" r="2.3" fill="currentColor"/>' +
  '</svg>';
/** In the pouch: how long a slot is pressed before it is a long press (milliseconds), and how far it is pulled
 * before it is dragged (pixels). How long a thing's name shows over the bar once it comes into your paw. */
const LONG_PRESS = 450;
const DRAG_FROM = 8;
const NAME_FOR = 1600;
/** Your paw's slot, among the pouch's (0 to 5). */
const PAW_SLOT = -1;

/** The sound's button: a speaker, sounding (its waves) or not (crossed out). */
const SPEAKER =
  '<svg viewBox="0 0 24 24" aria-hidden="true">' +
  '<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/>' +
  '<path class="speaker-waves" d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/>' +
  '<path class="speaker-off" d="M15.5 9.5l5 5M20.5 9.5l-5 5"/>' +
  '</svg>';

/** Your own marks, as they show on the screen out of your own eyes (see ownMark). */
const OWN_MARKS: Record<EmoteKind, string> = { exclaim: '！', question: '？', note: '♪', heart: '♥', zzz: 'Z' };
/** How long your own words show (as long as words over a head: Emotes.say), and a mark. */
const OWN_WORDS_FOR = 1900;
const OWN_MARK_FOR = 1300;
/** Over whoever it points to, the marker's disc is lifted this far (pixels), its tab's tip on them (see the
 * tab in styles.css: the disc's radius and the tab). */
const GUIDE_LIFT = 35;

/** A round control with its word under it, in Hidamari's way: the shell on the disc, the word outside it. */
function disc(className: string, glyph: string): { button: HTMLButtonElement; face: HTMLSpanElement; cap: HTMLSpanElement } {
  const button = el('button', `ctl-icon ${className}`);
  button.type = 'button';
  const face = el('span', 'ctl-disc');
  face.innerHTML = glyph;
  const cap = el('span', 'ctl-cap');
  button.append(face, cap);
  return { button, face, cap };
}

/** One of the pouch's slots (PAW_SLOT your paw's, with its mark), on the bar or in the bag. */
function slotButton(slot: number): HTMLButtonElement {
  const node = el('button', slot === PAW_SLOT ? 'pack-slot is-paw' : 'pack-slot');
  node.type = 'button';
  node.dataset.slot = String(slot);
  if (slot === PAW_SLOT) {
    const paw = el('span', 'pack-paw');
    paw.innerHTML = PAW;
    node.append(paw);
  }
  return node;
}

/** Title (on the way in), the hour, the floating joystick, the jump button, the verbs on offer (the action button:
 * pick up, put down, give, sit, sleep, get into the cave's boat; the use button: eat, drink, play, read what you
 * hold), the pouch (its bar on a wide screen, its bag), the camera's button and your newest photo under it (the
 * album), the きもち button and its panel (what you do yourself: wave, bow, dance...), the sound's button, your own
 * words and marks out of your own eyes, the text box of what is said to you, a word now and then, and the test
 * toggle. Every control wears the shell of the user's Chiikawa-Hidamari (see styles.css). */
export class Hud implements JoystickView {
  onJump: () => void = () => {};
  /** The jump button let go of (held, you jump higher). */
  onJumpEnd: () => void = () => {};
  onAction: () => void = () => {};
  onUse: () => void = () => {};
  onTest: () => void = () => {};
  /** A slot of the pouch tapped (0 to 5): what is in it and what is in your paw change places. */
  onSlot: (slot: number) => void = () => {};
  /** Your paw's slot tapped: what is in your paw put away into the pouch. */
  onStow: () => void = () => {};
  /** A slot's things dragged onto another slot (0 to 5 each): onto its stack, or the two change places. */
  onMoveSlot: (from: number, to: number) => void = () => {};
  /** The camera's button (a photo), and your newest photo under it (the album). */
  onCamera: () => void = () => {};
  onPhotos: () => void = () => {};
  /** The sound turned on or off with its button. */
  onSound: (on: boolean) => void = () => {};
  /** Something to do picked from the きもち panel. */
  onEmote: (id: ActionId) => void = () => {};

  /** The hour, top left: the sun or the moon, the time, and how fast the game draws. */
  private readonly chipMark = el('span', 'chip-mark');
  private readonly chipTime = el('span', 'chip-word');
  private readonly chipFps = el('span', 'chip-sub');
  private chipNight: boolean | null = null;
  private readonly test = disc('hud-test', svg('test'));
  private readonly soundButton = disc('hud-sound', SPEAKER);
  private sound = true;
  private readonly emote = disc('emote-btn', svg('emote'));
  private readonly emotes = el('div', 'emotes');
  private readonly emoteChips: HTMLButtonElement[] = [];
  private readonly bag = disc('bag-btn', svg('bag'));
  private readonly camera = disc('camera-btn', svg('camera'));
  private readonly photoButton = el('button', 'photo-btn');
  private readonly joyBase = el('div', 'joy-base');
  private readonly joyKnob = el('div', 'joy-knob');
  private readonly jumpButton = el('button', 'act act-jump');
  /** The verbs on offer, one pill each, growing upward over the jump button: what you look at asks for (the
   * action), and what you hold (the use). */
  private readonly actionButton = el('button', 'ix');
  private action: string | null = null;
  private readonly useButton = el('button', 'ix');
  private use: string | null = null;
  private readonly verbGlyphs = new Map<string, string>();
  /** The pouch's bar along the bottom, on a wide screen: your paw and the six slots; the name of what comes into your
   * paw over it a moment. */
  private readonly hotbar = el('div', 'hotbar');
  private readonly barSlots: HTMLButtonElement[] = [];
  private readonly barName = el('div', 'hotbar-name');
  private barNameTimer = 0;
  private shownHand: string | null = null;
  /** The bag: your paw and the six slots, bigger, and what the one picked is, with what to do with it. */
  private readonly sheet = el('div', 'sheet');
  private readonly bagSlots: HTMLButtonElement[] = [];
  private readonly detail = el('div', 'detail');
  private readonly detailTile = el('div', 'detail-tile');
  private readonly detailName = el('div', 'detail-name');
  private readonly detailKind = el('span', 'detail-fam');
  private readonly detailAbout = el('div', 'detail-note');
  private readonly detailMeta = el('div', 'detail-meta');
  private readonly detailHint = el('p', 'detail-hint');
  private readonly detailAct = el('button', 'act-btn is-live');
  /** The slot picked in the bag (PAW_SLOT your paw's), or null. */
  private picked: number | null = null;
  /** A thing dragged from slot to slot, under your finger. */
  private readonly dragIcon = el('div', 'pack-ghost');
  /** A slot pressed: which, on the bar or in the bag, by which pointer, from where, and whether it became a long
   * press or a drag. */
  private press: { slot: number; inBag: boolean; id: number; x: number; y: number; timer: number; long: boolean; drag: boolean } | null =
    null;
  /** What the pouch and your paw hold, as last shown. */
  private pouchView: PouchView = { hand: null, slots: [] };
  private readonly toastBox = el('div', 'hud-toast');
  private toastTimer = 0;
  private readonly fadeBox = el('div', 'hud-fade');
  /** Your own words and marks, out of your own eyes (see ownWords, ownMark). */
  private readonly own = el('div', 'hud-own');
  private readonly ownBubble = el('div', 'own-words');
  private ownTimer = 0;
  private readonly flashBox = el('div', 'hud-flash');
  private readonly hint = el('div', 'hud-hint');
  private readonly place = el('div', 'hud-place');
  private placeTimer = 0;
  private readonly loading = el('div', 'loading');
  private readonly loadingTitle = el('div', 'loading-title');
  private readonly loadingWords = el('div', 'loading-words');
  /** What is said to you, in the text box at the bottom (see DialogueBox). */
  readonly dialogue: DialogueBox;
  /** The marker toward whoever you were told of (see setGuide): their face on a disc (or their name), with a
   * tab on its rim turned toward them. */
  private readonly guide = el('div', 'hud-guide');
  private readonly guideTurn = el('div', 'guide-turn');
  private readonly guideDisc = el('div', 'guide-disc');
  private readonly guideFace = el('img', 'guide-face');
  private readonly guideName = el('span', 'guide-name');

  constructor(ui: HTMLElement) {
    const root = el('div', 'hud');
    // Top left the hour; top right what you do with the game (how you feel, the sound, the tests), and down the
    // side what you have and keep (the bag, the camera and its photos).
    const top = el('div', 'hud-top');
    const chip = el('div', 'hud-chip');
    const rule = el('span', 'chip-rule');
    chip.append(this.chipMark, this.chipTime, rule, this.chipFps);
    const emoteBox = el('div', 'emote-box');
    emoteBox.append(this.emote.button, this.emotes);
    const ctl = el('div', 'hud-ctl');
    ctl.append(emoteBox, this.soundButton.button, this.test.button);
    top.append(chip, ctl);
    const side = el('div', 'hud-side');
    side.append(this.bag.button, this.camera.button, this.photoButton);
    this.photoButton.type = 'button';
    this.photoButton.hidden = true;
    for (const [button, call] of [
      [this.camera.button, () => this.onCamera()],
      [this.photoButton, () => this.onPhotos()],
      [this.soundButton.button, () => this.onSound(this.setSound(!this.sound))],
      [this.test.button, () => this.onTest()],
      [this.bag.button, () => this.togglePouch()],
      [this.emote.button, () => this.toggleEmotes()],
    ] as const) {
      button.addEventListener('click', call);
    }
    this.joyBase.append(this.joyKnob);

    // The pouch's bar: your paw and the six slots, each tapped, long-pressed or dragged (see bindSlot).
    for (const slot of [PAW_SLOT, 0, 1, 2, 3, 4, 5]) {
      const node = slotButton(slot);
      this.bindSlot(node, slot, false);
      this.barSlots.push(node);
    }
    this.hotbar.append(...this.barSlots, this.barName);
    // The bag: a card over the island, its tab, its close, the slots bigger, and what the one picked is.
    const scrim = el('div', 'sheet-scrim');
    scrim.addEventListener('pointerdown', () => this.togglePouch());
    const card = el('div', 'sheet-card');
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-modal', 'true');
    const tabs = el('div', 'sheet-tabs');
    const tab = el('button', 'sheet-tab');
    tab.type = 'button';
    tab.setAttribute('aria-selected', 'true');
    tab.dataset.word = 'pouch.title';
    tabs.append(tab);
    const close = el('button', 'sheet-close');
    close.type = 'button';
    close.innerHTML = svg('close');
    close.addEventListener('click', () => this.togglePouch());
    const grid = el('div', 'bag-grid');
    for (const slot of [PAW_SLOT, 0, 1, 2, 3, 4, 5]) {
      const node = slotButton(slot);
      this.bindSlot(node, slot, true);
      this.bagSlots.push(node);
      grid.append(node);
    }
    const item = el('div', 'detail-item');
    const text = el('div', 'detail-text');
    const sub = el('div', 'detail-sub');
    sub.append(this.detailKind, this.detailMeta);
    text.append(this.detailName, sub, this.detailAbout);
    item.append(this.detailTile, text);
    this.detailAct.type = 'button';
    this.detailAct.addEventListener('click', () => this.usePicked());
    this.detail.append(this.detailHint, item, this.detailAct);
    card.append(tabs, close, grid, this.detail);
    this.sheet.append(scrim, card);
    this.dragIcon.hidden = true;
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Escape' && this.sheet.classList.contains('is-open')) this.togglePouch();
    });

    EMOTES.forEach((id, i) => {
      const chipButton = el('button', 'emote-chip');
      chipButton.type = 'button';
      chipButton.dataset.key = String(i + 1);
      chipButton.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        this.closeEmotes();
        this.onEmote(id);
      });
      this.emoteChips.push(chipButton);
    });
    this.emotes.append(...this.emoteChips);
    this.emotes.hidden = true;
    this.own.append(this.ownBubble);

    // The verbs on offer over the jump button: the first the bottom one (see .hud-verbs).
    const verbs = el('div', 'hud-verbs');
    for (const pill of [this.actionButton, this.useButton]) {
      pill.type = 'button';
      pill.hidden = true;
      pill.append(el('span', 'ix-mark'), el('span', 'ix-word'));
      pill.addEventListener('animationend', () => pill.classList.remove('is-fresh'));
    }
    verbs.append(this.actionButton, this.useButton);
    this.jumpButton.type = 'button';
    this.jumpButton.innerHTML = `${svg('jump')}<span class="sr-only"></span>`;

    const bar = el('div', 'loadbar');
    bar.append(el('div', 'loadbar-fill'));
    this.loading.append(this.loadingTitle, bar, this.loadingWords);
    // Under the hour, the name of the place you walk into over a word for a moment: one under the other.
    const notes = el('div', 'hud-notes');
    notes.append(this.place, this.toastBox);

    root.append(
      top,
      side,
      notes,
      this.joyBase,
      this.hotbar,
      verbs,
      this.jumpButton,
      this.hint,
      this.own,
      this.sheet,
      this.flashBox,
      this.fadeBox,
      this.loading,
      this.dragIcon,
    );
    // (Over the hint, under your own words, the night's fade and the rest.)
    this.dialogue = new DialogueBox(root);
    root.insertBefore(this.dialogue.element, this.own);
    void loadFaces();
    this.guideFace.alt = '';
    this.guideFace.draggable = false;
    this.guideDisc.append(this.guideFace, this.guideName);
    this.guide.append(this.guideTurn, this.guideDisc);
    this.guide.hidden = true;
    root.insertBefore(this.guide, this.dialogue.element);
    ui.append(root);

    this.useButton.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.onUse();
    });
    this.jumpButton.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.onJump();
    });
    // Held as one rises, the jump goes higher: till the finger lifts, or slides off the button.
    for (const end of ['pointerup', 'pointercancel', 'pointerleave'] as const) {
      this.jumpButton.addEventListener(end, () => this.onJumpEnd());
    }
    this.actionButton.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.onAction();
    });
    window.addEventListener('resize', () => this.hide());
    this.refresh();
    this.hide();
  }

  refresh(): void {
    this.test.cap.textContent = t('hud.test');
    this.camera.cap.textContent = t('hud.camera');
    this.bag.cap.textContent = t('hud.pouch');
    this.emote.cap.textContent = t('hud.emote');
    this.soundButton.cap.textContent = t('hud.sound');
    (this.jumpButton.querySelector('.sr-only') as HTMLElement).textContent = t('hud.jump');
    this.jumpButton.setAttribute('aria-label', t('hud.jump'));
    this.photoButton.setAttribute('aria-label', t('album.title'));
    this.setSound(this.sound);
    EMOTES.forEach((id, i) => (this.emoteChips[i].textContent = t(`action.${id}` as StringKey)));
    for (const node of this.sheet.querySelectorAll<HTMLElement>('[data-word]')) node.textContent = t(node.dataset.word as StringKey);
    (this.sheet.querySelector('.sheet-close') as HTMLElement).setAttribute('aria-label', t('panel.close'));
    this.verbGlyphs.clear();
    for (const [key, glyph] of VERB_GLYPH) this.verbGlyphs.set(t(key), glyph);
    this.hint.textContent = t('hud.hint');
    this.loadingTitle.textContent = t('app.title');
    if (!this.loading.classList.contains('error')) this.loadingWords.textContent = t('app.loading');
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

  /** The hour in its chip, top left: the sun by day and the moon by night, the time (`label`), and `fps`. */
  setClock(hours: number, label: string, fps: string): void {
    const night = hours < 5.5 || hours >= 18.5;
    if (night !== this.chipNight) {
      this.chipNight = night;
      this.chipMark.innerHTML = svg(night ? 'moon' : 'sun');
    }
    this.chipTime.textContent = label;
    this.chipFps.textContent = fps;
  }

  /** Shows the action button with this label, or hides it (null). */
  setAction(label: string | null): void {
    if (label === this.action) return;
    this.action = label;
    this.showVerb(this.actionButton, label);
  }

  /** Shows the use button with this label (eat, drink, play, read), or hides it (null). */
  setUse(label: string | null): void {
    if (label === this.use) return;
    this.use = label;
    this.showVerb(this.useButton, label);
  }

  /** A verb's pill with this word and its glyph (see VERB_GLYPH), or hidden (null): announced as it comes, and the
   * lowest one showing the one on offer (the accent: see .ix.is-primary). */
  private showVerb(pill: HTMLButtonElement, label: string | null): void {
    const was = !pill.hidden;
    pill.hidden = label === null;
    if (label !== null) {
      (pill.querySelector('.ix-word') as HTMLElement).textContent = label;
      const glyph = this.verbGlyphs.get(label);
      (pill.querySelector('.ix-mark') as HTMLElement).innerHTML = glyph ? svg(glyph) : '';
      if (!was) pill.classList.add('is-fresh');
    }
    this.actionButton.classList.toggle('is-primary', !this.actionButton.hidden);
    this.useButton.classList.toggle('is-primary', this.actionButton.hidden && !this.useButton.hidden);
  }

  /** Opens the bag, or shuts it (and the きもち panel, which opens near it). Opened, what your paw holds is picked. */
  togglePouch(): void {
    const open = !this.sheet.classList.contains('is-open');
    this.sheet.classList.toggle('is-open', open);
    this.bag.button.classList.toggle('is-on', open);
    if (open) {
      this.closeEmotes();
      this.pick(this.pouchView.hand ? PAW_SLOT : null);
    }
  }

  /** Opens the bag with `slot` picked (a long press on the bar). */
  private openBagAt(slot: number): void {
    if (!this.sheet.classList.contains('is-open')) this.togglePouch();
    this.pick(slot);
  }

  /** Opens the きもち panel, or shuts it (and the pouch). */
  toggleEmotes(): void {
    if (this.emotes.hidden) {
      this.emotes.hidden = false;
      this.emote.button.classList.add('is-on');
      if (this.sheet.classList.contains('is-open')) this.togglePouch();
    } else {
      this.closeEmotes();
    }
  }

  closeEmotes(): void {
    this.emotes.hidden = true;
    this.emote.button.classList.remove('is-on');
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

  /** The marker toward whoever you were told of (null: none), at `x`, `y` on the screen (pixels): their face
   * (the user, 2026-10-23: the face, not the name; the name only for anyone without one), its tab turned
   * `angle` (radians, clockwise from up) toward them: `over` them, the disc lifted so the tab points down at
   * them; at the screen's edge, the tab out toward them. */
  setGuide(g: { x: number; y: number; angle: number; over: boolean; name: string; face: string | null } | null): void {
    this.guide.hidden = !g;
    if (!g) return;
    this.guide.classList.toggle('named', !g.face);
    if (g.face && this.guideFace.getAttribute('src') !== g.face) this.guideFace.src = g.face;
    if (this.guideName.textContent !== g.name) this.guideName.textContent = g.name;
    const lift = g.over ? GUIDE_LIFT : 0;
    this.guide.style.transform = `translate(${g.x.toFixed(1)}px, ${(g.y - lift).toFixed(1)}px)`;
    this.guideTurn.style.transform = `rotate(${g.angle.toFixed(3)}rad)`;
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

  /** What the pouch and your paw hold now: on the bar and in the bag alike. */
  setPouch(view: PouchView): void {
    this.pouchView = view;
    const show = (node: HTMLElement, what: PouchThing | null) => {
      node.title = what?.name ?? '';
      node.setAttribute('aria-label', what?.name ?? t('hud.empty'));
      node.classList.toggle('is-empty', !what);
      // How many a slot's stack has, on its foot (none for one).
      node.dataset.count = what && what.count > 1 ? String(what.count) : '';
      iconOn(node, what?.icon ?? null);
    };
    for (const nodes of [this.barSlots, this.bagSlots]) {
      nodes.forEach((node) => show(node, this.thingIn(Number(node.dataset.slot))));
    }
    // (The bag as the pouch has it now; and, on the bar, the name of what has just come into your paw.)
    if (this.sheet.classList.contains('is-open')) this.pick(this.picked !== null && this.thingIn(this.picked) ? this.picked : view.hand ? PAW_SLOT : null);
    const hand = view.hand?.name ?? null;
    if (hand !== this.shownHand) {
      this.shownHand = hand;
      if (hand) this.flashName(hand);
    }
  }

  /** What is in slot `slot` of the pouch as last shown (PAW_SLOT: your paw), or null. */
  private thingIn(slot: number): PouchThing | null {
    return (slot === PAW_SLOT ? this.pouchView.hand : this.pouchView.slots[slot]) ?? null;
  }

  /** Over the bar, a thing's name for a moment (as it comes into your paw, or is pressed). */
  private flashName(text: string): void {
    this.barName.textContent = text;
    this.barName.classList.add('shown');
    window.clearTimeout(this.barNameTimer);
    this.barNameTimer = window.setTimeout(() => this.barName.classList.remove('shown'), NAME_FOR);
  }

  /**
   * A slot of the pouch (PAW_SLOT your paw's), on the bar or in the bag (`inBag`). On the bar, tapped, its things and
   * your paw's change places (your paw's slot tapped, what it holds is put away), its name over the bar; held (or
   * clicked with the mouse's other button), the bag opens with it picked. In the bag, tapped or held, it is picked
   * (see pick), and tapped again it is used (see usePicked). Either way, dragged onto another slot, at once or after a
   * hold, its things go onto that one's stack or the two change places (dragged onto your paw, one comes into it;
   * your paw's onto a slot, as a tap on that slot). With the mouse, pointing at a slot on the bar says its name.
   */
  private bindSlot(node: HTMLButtonElement, slot: number, inBag: boolean): void {
    node.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (this.press || e.button !== 0) return;
      // (Its moves and its lifting come here wherever the finger goes; a pointer no longer down cannot be captured.)
      try {
        node.setPointerCapture(e.pointerId);
      } catch {
        // (Followed only while over the slot.)
      }
      const press = { slot, inBag, id: e.pointerId, x: e.clientX, y: e.clientY, timer: 0, long: false, drag: false };
      press.timer = window.setTimeout(() => {
        press.long = true;
        if (inBag) this.pick(slot);
        else this.openBagAt(slot);
      }, LONG_PRESS);
      this.press = press;
    });
    node.addEventListener('pointermove', (e) => {
      const p = this.press;
      if (!p || p.id !== e.pointerId) return;
      // (Held a while first, it may still be dragged.)
      if (!p.drag && this.thingIn(slot) && Math.hypot(e.clientX - p.x, e.clientY - p.y) > DRAG_FROM) {
        p.drag = true;
        window.clearTimeout(p.timer);
        node.classList.add('is-source');
        iconOn(this.dragIcon, this.thingIn(slot)?.icon ?? null);
        this.dragIcon.hidden = false;
      }
      if (p.drag) this.dragOver(e.clientX, e.clientY);
    });
    const end = (e: PointerEvent, cancelled: boolean) => {
      const p = this.press;
      if (!p || p.id !== e.pointerId) return;
      this.press = null;
      window.clearTimeout(p.timer);
      if (p.drag) {
        const to = cancelled ? null : this.slotAt(e.clientX, e.clientY);
        node.classList.remove('is-source');
        this.dragOver(null);
        if (to !== null && to !== slot) this.dropped(slot, to);
      } else if (!p.long && !cancelled) {
        if (inBag) {
          if (this.picked === slot) this.usePicked();
          else this.pick(slot);
        } else if (slot === PAW_SLOT) this.onStow();
        else {
          const what = this.thingIn(slot);
          this.onSlot(slot);
          if (what) this.flashName(what.name);
        }
      }
    };
    node.addEventListener('pointerup', (e) => end(e, false));
    node.addEventListener('pointercancel', (e) => end(e, true));
    node.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      if (inBag) this.pick(slot);
      else this.openBagAt(slot);
    });
    node.addEventListener('pointerenter', (e) => {
      const what = this.thingIn(slot);
      if (!inBag && e.pointerType === 'mouse' && !this.press && what) this.flashName(what.name);
    });
  }

  /** The thing dragged, under your finger at (x, y), the slot it would go onto lit; null: dropped. */
  private dragOver(x: number | null, y = 0): void {
    for (const node of [...this.barSlots, ...this.bagSlots]) node.classList.remove('is-over');
    if (x === null) {
      this.dragIcon.hidden = true;
      return;
    }
    this.dragIcon.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
    const to = this.slotAt(x, y);
    if (to === null || to === this.press?.slot) return;
    const nodes = this.press?.inBag ? this.bagSlots : this.barSlots;
    nodes.find((n) => Number(n.dataset.slot) === to)?.classList.add('is-over');
  }

  /** The pouch's slot at (x, y) on the screen (PAW_SLOT your paw's), or null. */
  private slotAt(x: number, y: number): number | null {
    const node = document.elementFromPoint(x, y)?.closest<HTMLElement>('.pack-slot');
    return node?.dataset.slot !== undefined ? Number(node.dataset.slot) : null;
  }

  /** A slot's things dropped onto another's (see bindSlot). */
  private dropped(from: number, to: number): void {
    if (from === PAW_SLOT) this.onSlot(to);
    else if (to === PAW_SLOT) this.onSlot(from);
    else this.onMoveSlot(from, to);
  }

  /** In the bag, `slot` picked (PAW_SLOT your paw's; null none): lifted among the slots, and under them what it is
   * (its icon, name and how many, what it is for, a line about it, a word of its own) with what to do with it: to
   * hold it (もつ), or, in your paw, to put it away (しまう). Nothing picked, how the bag is used. */
  private pick(slot: number | null): void {
    const what = slot === null ? null : this.thingIn(slot);
    this.picked = what ? slot : null;
    for (const node of this.bagSlots) node.classList.toggle('is-picked', what !== null && Number(node.dataset.slot) === slot);
    this.detail.classList.toggle('is-picked', !!what);
    this.detail.classList.toggle('is-rest', !what);
    if (!what || slot === null) {
      this.detailHint.textContent = t('pouch.how');
      return;
    }
    iconOn(this.detailTile, what.icon);
    this.detailName.textContent = what.count > 1 ? `${what.name} ×${what.count}` : what.name;
    this.detailKind.textContent = what.kind;
    this.detailMeta.textContent = what.note ?? '';
    this.detailAbout.textContent = what.about ?? '';
    this.detailAct.textContent = t(slot === PAW_SLOT ? 'pouch.stow' : 'pouch.hold');
  }

  /** What is picked in the bag, used: into your paw (もつ), or out of it into the pouch (しまう). */
  private usePicked(): void {
    const slot = this.picked;
    if (slot === null) return;
    if (slot === PAW_SLOT) this.onStow();
    else this.onSlot(slot);
  }

  /** A word for a moment over the controls (what you picked up, that the pouch is full). */
  toast(text: string): void {
    this.toastBox.textContent = text;
    this.toastBox.classList.add('shown');
    window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => this.toastBox.classList.remove('shown'), 2200);
  }

  /** Your newest photo under the camera's button, to open the album with (null: none yet, and no button); one
   * just taken comes in with a little pop (`taken`). */
  setLastPhoto(url: string | null, taken = false): void {
    this.photoButton.hidden = !url;
    this.photoButton.style.backgroundImage = url ? `url(${url})` : '';
    this.photoButton.classList.remove('taken');
    if (url && taken) {
      void this.photoButton.offsetWidth;
      this.photoButton.classList.add('taken');
    }
  }

  /** Shows the sound on or off on its button; returns `on`. */
  setSound(on: boolean): boolean {
    this.sound = on;
    const button = this.soundButton.button;
    button.classList.toggle('off', !on);
    const label = t(on ? 'hud.soundOn' : 'hud.soundOff');
    button.setAttribute('aria-label', label);
    button.title = label;
    return on;
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
    this.hotbar.classList.toggle('is-off', !on);
  }

  /** The name of the place just walked into, showing for a moment under the hour. */
  showPlace(name: string): void {
    this.place.textContent = name;
    this.place.classList.add('shown');
    window.clearTimeout(this.placeTimer);
    this.placeTimer = window.setTimeout(() => this.place.classList.remove('shown'), 2600);
  }

  doneLoading(): void {
    this.loading.classList.add('is-gone');
    window.setTimeout(() => this.loading.remove(), 500);
  }

  showError(): void {
    this.loading.classList.add('error');
    this.loadingWords.textContent = t('app.error');
  }
}
