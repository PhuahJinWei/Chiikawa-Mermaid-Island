/** Something you may answer with: words, or someone, shown by their face (see Faces) if they have one. */
export type Choice = string | { readonly text: string; readonly face: string | null };

/** A line in the text box (see DialogueBox.add): who says it, as named, with their face if they have one (see
 * Faces), and what; whoever says it (for the game to know them by); what you may answer it with, if anything,
 * and which you chose (-1: none yet, or none); and where it is: waiting its turn, in the box, or read (or
 * dropped). */
export interface Spoken {
  readonly name: string;
  readonly face: string | null;
  readonly text: string;
  readonly who: unknown;
  readonly choices: readonly Choice[];
  chosen: number;
  state: 'waiting' | 'shown' | 'done';
}

/** Characters typed out a second (the user, 2026-10-23: a typewriter, one character at a time); held down,
 * so many times faster. */
const TYPE_RATE = 22;
const HOLD_RATE = 6;
/** Typed out, a line stays this long and so much longer a character, then goes on its own (the island never
 * waits on you to tap); held down, only this long. A line with choices waits for yours. */
const LINGER = 2;
const LINGER_CHAR = 0.07;
const HOLD_LINGER = 0.25;
/** Pressed this long (seconds), a press is a hold: lines skipped through (up to one with choices). */
const HOLD_AFTER = 0.35;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  return node;
}

/**
 * The text box at the bottom of the screen (PLAN 6.5; the user, 2026-10-23): what is said to you, one line at a
 * time, the speaker's name on its corner, typed out a character at a time. A tap on it (or the action button,
 * or E or Enter: see press) shows the rest of a line at once, or once it is all out, goes on to the next; held
 * down, it skips through them. Lines said while another shows wait their turn. A line may come with choices,
 * buttons under it once it is out (or the keyboard's numbers: see choose), and waits for one.
 */
export class DialogueBox {
  private readonly box = el('div', 'dialogue');
  private readonly nameTag = el('div', 'dialogue-name');
  private readonly faceTag = el('img', 'dialogue-face');
  private readonly textBox = el('div', 'dialogue-text');
  private readonly typedPart = el('span', 'dialogue-typed');
  private readonly restPart = el('span', 'dialogue-rest');
  private readonly choiceRow = el('div', 'dialogue-choices');
  private readonly nextMark = el('div', 'dialogue-next');
  private readonly lines: Spoken[] = [];
  /** How far typed out the line in the box is (characters), and how long it has been all out (seconds). */
  private typed = 0;
  private shownFor = 0;
  private chars: string[] = [];
  /** Pressed: since when, and whether it still is (a finger on the box, a key down). */
  private pressedFor = 0;
  private stillHeld: (() => boolean) | null = null;
  private pointerDown = false;

  constructor(parent: HTMLElement) {
    this.textBox.append(this.typedPart, this.restPart);
    this.nextMark.textContent = '▼';
    this.faceTag.alt = '';
    this.faceTag.draggable = false;
    this.box.append(this.faceTag, this.nameTag, this.textBox, this.choiceRow, this.nextMark);
    this.box.hidden = true;
    this.box.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.pointerDown = true;
      this.press(() => this.pointerDown);
    });
    for (const end of ['pointerup', 'pointercancel', 'pointerleave'] as const) {
      this.box.addEventListener(end, () => (this.pointerDown = false));
    }
    parent.append(this.box);
  }

  /** The element, for the HUD to place among its own. */
  get element(): HTMLElement {
    return this.box;
  }

  /** Whether a line is in the box. */
  get open(): boolean {
    return this.lines.length > 0;
  }

  /** Whether the line in the box is all out and waits for you to choose. */
  get choosing(): boolean {
    const s = this.lines[0];
    return !!s && s.choices.length > 0 && this.typed >= this.chars.length;
  }

  /** `name` (their `face` by it, if they have one) says `text` to you, for you to answer with one of `choices`
   * if any: in the box now, or after the lines before it. */
  add(name: string, text: string, who: unknown, choices: readonly Choice[] = [], face: string | null = null): Spoken {
    const s: Spoken = { name, face, text, who, choices, chosen: -1, state: 'waiting' };
    this.lines.push(s);
    if (this.lines.length === 1) this.show();
    return s;
  }

  /** `s` taken out of the box, or out of its turn (its speaker gone off, or doing something else now). */
  drop(s: Spoken): void {
    const i = this.lines.indexOf(s);
    s.state = 'done';
    if (i < 0) return;
    this.lines.splice(i, 1);
    if (i === 0) this.show();
  }

  /** Every line whose speaker `gone` says is gone, taken out (see drop). */
  dropIf(gone: (who: unknown) => boolean): void {
    for (const s of [...this.lines]) if (gone(s.who)) this.drop(s);
  }

  /** Whether `who` has a line in the box, or waiting for it. */
  speaking(who: unknown): boolean {
    return this.lines.some((s) => s.who === who);
  }

  /** A tap (or a key, or the action button): the rest of the line at once, or once it is all out, the next
   * (not past a line waiting for your choice). `held` says whether the press goes on, held down (a hold skips
   * through the lines). */
  press(held: () => boolean = () => false): void {
    if (!this.open) return;
    this.pressedFor = 0;
    this.stillHeld = held;
    if (this.typed < this.chars.length) this.reveal(this.chars.length);
    else if (!this.choosing) this.next();
  }

  /** The `i`th choice (from 0) taken, the line in the box waiting for it: on to the next. */
  choose(i: number): void {
    const s = this.lines[0];
    if (!this.choosing || !s || i < 0 || i >= s.choices.length) return;
    s.chosen = i;
    this.next();
  }

  update(dt: number): void {
    const holding = !!this.stillHeld?.() && this.pressedFor >= HOLD_AFTER;
    if (this.stillHeld) {
      if (this.stillHeld()) this.pressedFor += dt;
      else this.stillHeld = null;
    }
    const s = this.lines[0];
    if (!s) return;
    if (this.typed < this.chars.length) {
      this.reveal(this.typed + dt * TYPE_RATE * (holding ? HOLD_RATE : 1));
      return;
    }
    if (s.choices.length > 0) return;
    this.shownFor += dt;
    if (this.shownFor >= (holding ? HOLD_LINGER : LINGER + LINGER_CHAR * this.chars.length)) this.next();
  }

  /** The line in the box read: the next one in. */
  private next(): void {
    const s = this.lines.shift();
    if (s) s.state = 'done';
    this.show();
  }

  /** The first line waiting into the box, typed out from its start, its speaker's face by their name and its
   * choices under it (someone by their face, if they have one); the box shut with none. */
  private show(): void {
    const s = this.lines[0];
    const opening = this.box.hidden;
    this.box.hidden = !s;
    if (!s) return;
    s.state = 'shown';
    this.nameTag.textContent = s.name;
    this.box.classList.toggle('faced', !!s.face);
    if (s.face) this.faceTag.src = s.face;
    this.chars = [...s.text];
    this.typed = 0;
    this.shownFor = 0;
    this.choiceRow.replaceChildren(
      ...s.choices.map((choice, i) => {
        const button = el('button', 'dialogue-choice');
        button.type = 'button';
        const text = typeof choice === 'string' ? choice : choice.text;
        const face = typeof choice === 'string' ? null : choice.face;
        if (face) {
          const picture = el('img', '');
          picture.src = face;
          picture.alt = '';
          picture.draggable = false;
          button.classList.add('face');
          button.append(picture);
          button.title = text;
          button.setAttribute('aria-label', text);
        } else {
          button.textContent = text;
        }
        if (i < 10) button.dataset.key = String((i + 1) % 10);
        // (Its own, not the box's tap.)
        button.addEventListener('pointerdown', (e) => {
          e.preventDefault();
          e.stopPropagation();
          this.choose(i);
        });
        return button;
      }),
    );
    this.box.classList.toggle('asks', s.choices.length > 0);
    this.reveal(0, true);
    // Come in as the box opens; from one line to the next it stays as it is, only its words typing anew (the user,
    // 2026-10-24: nothing moving while you read).
    if (!opening) return;
    this.box.classList.remove('shown');
    void this.box.offsetWidth;
    this.box.classList.add('shown');
  }

  /** Typed out to `typed` characters: the rest laid out already, unseen, so the lines never move as it types. */
  private reveal(typed: number, fresh = false): void {
    const before = Math.floor(this.typed);
    this.typed = Math.min(typed, this.chars.length);
    const now = Math.floor(this.typed);
    if (now === before && !fresh) return;
    this.typedPart.textContent = this.chars.slice(0, now).join('');
    this.restPart.textContent = this.chars.slice(now).join('');
    this.box.classList.toggle('typed', now >= this.chars.length);
  }
}
