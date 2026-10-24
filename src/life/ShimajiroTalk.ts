import * as THREE from 'three';
import { t, type StringKey } from '../i18n/I18n';
import type { Shimajiro } from '../characters/Shimajiro';
import type { DialogueBox, Spoken } from '../ui/DialogueBox';
import { cueOf, linesOf } from './lines';
import { faceOf } from '../ui/Faces';
import { ITEMS, itemName, type ItemId } from './Items';
import type { Hands } from './Hands';

/** His lines' voice in locales/ja.json (`talk.own.shimajiro.1`...: see lines.ts). */
const VOICE = ['shimajiro'];
/** Talking with him again within this long (seconds) is "again" (see Life's AGAIN_WITHIN). */
const AGAIN_WITHIN = 150;
/** Past this far from his middle (metres) you have gone off and the talk ends: out of his shop's door. */
const AWAY = 4;
/** Asked something, he waits for your answer at most this long (seconds), as everyone does (Resident's
 * CHOOSE_MOST). */
const WAIT_MOST = 40;

/** After this hour or before the morning's (the island's clock), his shop is shut: 今日はもう終わったよッ!! as he first
 * greets you (his first words to Chiikawa in the manga). */
const SHUT: [number, number] = [21, 6];

/**
 * Talking with 島二郎 in his shop (the user, 2026-10-25). His voice is the manga's Siren arc's (the user, 2026-10-25: look
 * up how he talks): おれ and お前, short hearty sentences mostly ending in ッ (サービスだッ, またなッ), a good grown-up who
 * feeds whoever is tired and is proud of his 貝汁 and カツカレー. His words in locales/ja.json: `talk.firstMeet`,
 * `talk.own`, `talk.again`, `talk.night` (his shop shut), `talk.spent`, `part.bye`, `talk.yours.*` (what you hold),
 * `thanks.*` and `talk.remember.*` (a gift), each `.shimajiro`. Holding something of your own, あげる: he thanks you
 * for it and does not hold it (the user: as the Siren), and speaks of it another time. They go into the text box as
 * everyone's do, with their cues (see
 * lines.ts): a face, or his arms folded (`[folded]`; the user: an expression of his to show as he talks). A line
 * with no action of its own he says talking as anyone does; a cue's other actions are not his. もっとはなす till he
 * has said all he has to say (never one line twice in a talk) and またね; walking off ends it.
 */
export class ShimajiroTalk {
  /** The line of his in the box now, if he is talking with you. */
  private spoken: Spoken | null = null;
  private more = true;
  /** You said またね: his goodbye is in the box, and then the talk is over. */
  private parting = false;
  private waited = 0;
  /** What he has said in this talk, and when you last talked; whether you have met him yet. */
  private readonly said = new Set<StringKey>();
  private talkedAt = -Infinity;
  private met = false;
  private now = 0;
  /** What the choices on his line in the box are (see say), and the last thing you gave him. */
  private asked: ('more' | 'give' | 'bye')[] = [];
  private gift: ItemId | null = null;

  constructor(
    readonly shimajiro: Shimajiro,
    private readonly box: DialogueBox,
    /** Your paws and pouch, once the game has them (what you hold, he speaks of; what is yours, you may give him). */
    private readonly hands: () => Hands | null = () => null,
    /** Something given (the game's sound of it). */
    private readonly gave: () => void = () => {},
    /** The island's clock, hours past midnight (his shop shut by night: see SHUT). */
    private readonly hours: () => number = () => 12,
  ) {}

  /** What you hold in your paw now, if anything. */
  private holding(): ItemId | null {
    return this.hands()?.hand?.item ?? null;
  }

  /** Whether what you hold is yours to give him: not bitten into, not lent you, not someone's, not with a place of
   * its own, not the island's secret (the mermaid's scale). */
  private canGive(): boolean {
    const hands = this.hands();
    const c = hands?.hand;
    return !!c && !hands.nibbled && !c.lent && !c.home && !ITEMS[c.item].secret && (c.owner === null || c.owner === 'player');
  }

  /** Whether he is talking with you. */
  get talking(): boolean {
    return this.spoken !== null;
  }

  /** You talk with him: his first line (on meeting him, who he is; again soon, that you are back; else something of
   * his own). */
  begin(): void {
    if (this.spoken) return;
    this.said.clear();
    this.more = true;
    this.parting = false;
    const again = this.now - this.talkedAt < AGAIN_WITHIN;
    this.talkedAt = this.now;
    const h = this.hours();
    const shut = h >= SHUT[0] || h < SHUT[1];
    const yours = this.yoursGroup();
    let group = 'talk.own';
    if (shut && Math.random() < 0.7) group = 'talk.night';
    else if (!this.met) group = 'talk.firstMeet';
    else if (again && Math.random() < 0.6) group = 'talk.again';
    else if (this.gift && Math.random() < 0.4) group = this.eaten(this.gift) ? 'talk.remember.ate' : 'talk.remember.kept';
    else if (yours && Math.random() < 0.5) group = yours;
    this.met = true;
    this.say(this.named(this.line(group), this.gift));
  }

  /** One frame: on to his next line when you ask for more, the talk over when you say またね, are silent long enough,
   * or go off. `you` is where you stand. */
  update(dt: number, you: THREE.Vector3): void {
    this.now += dt;
    const s = this.spoken;
    if (!s) return;
    const at = this.shimajiro.character.position;
    if (Math.hypot(you.x - at.x, you.z - at.z) > AWAY) {
      this.box.drop(s);
      this.end();
      return;
    }
    if (s.state !== 'done') {
      if ((this.waited += dt) > WAIT_MOST) {
        this.box.drop(s);
        this.end();
      }
      return;
    }
    const chose = s.chosen >= 0 ? this.asked[s.chosen] : null;
    if (chose === 'more') {
      const yours = this.yoursGroup();
      const next =
        yours && this.fresh(yours) && Math.random() < 0.3 ? this.line(yours) : this.fresh('talk.own') ? this.line('talk.own') : null;
      this.more = next !== null;
      this.say(next ?? this.line('talk.spent'));
    } else if (chose === 'give') {
      this.give();
    } else if (chose === 'bye' && !this.parting) {
      this.parting = true;
      this.say(this.line('part.bye'), false);
    } else this.end();
  }

  /** His line `line` into the box, his face and arms as its cue says, with もっとはなす while he has more to say, and
   * またね; his goodbye asks nothing. */
  private say(line: string, ask = true): void {
    const cue = cueOf(line);
    const ch = this.shimajiro.character;
    ch.lineFace = cue.face;
    const act = cue.act === 'folded' ? 'folded' : 'talk';
    if (ch.actionId !== act) ch.play(act);
    this.asked = !ask ? [] : [...(this.more ? (['more'] as const) : []), ...(this.canGive() ? (['give'] as const) : []), 'bye'];
    const words = { more: t('talk.more'), give: t('talk.give'), bye: t('talk.bye') };
    this.waited = 0;
    this.spoken = this.box.add(t('char.shimajiro'), cue.text, this, this.asked.map((k) => words[k]), faceOf('shimajiro'));
  }

  /** You give him what you hold (see canGive): it goes from your paws, and he thanks you for it, as for something to
   * eat or drink (naming it), to keep, or anything. */
  private give(): void {
    const hands = this.hands();
    const c = hands?.hand;
    if (!hands || !c || !this.canGive()) {
      this.say(this.line('talk.own'));
      return;
    }
    hands.remove(c);
    this.gift = c.item;
    this.gave();
    const group = this.eaten(c.item) ? 'thanks.ate' : ITEMS[c.item].use === null ? 'thanks.kept' : 'thanks.got';
    this.say(this.named(this.line(group), c.item));
  }

  /** His group of lines for what you hold, if he has one for it. */
  private yoursGroup(): string | null {
    const item = this.holding();
    if (!item) return null;
    const def = ITEMS[item];
    const group = def.light
      ? 'talk.yours.torch'
      : def.use === 'eat'
        ? 'talk.yours.food'
        : def.use === 'drink'
          ? 'talk.yours.drink'
          : def.use === 'read'
            ? 'talk.yours.book'
            : def.use === 'play'
              ? 'talk.yours.ukulele'
              : def.use === 'ready'
                ? 'talk.yours.weapon'
                : 'talk.yours.keep';
    return linesOf(group, VOICE).some((k) => k.endsWith('.shimajiro') || k.includes('.shimajiro.')) ? group : null;
  }

  /** Whether `item` is something to eat or drink. */
  private eaten(item: ItemId): boolean {
    const use = ITEMS[item].use;
    return use === 'eat' || use === 'drink';
  }

  /** `line` with the thing's name for its {0}, if there is a thing. */
  private named(line: string, item: ItemId | null): string {
    return item ? line.replace('{0}', t(itemName(item))) : line;
  }

  /** The talk over: his face his own again, his arms down. */
  private end(): void {
    this.spoken = null;
    const ch = this.shimajiro.character;
    ch.lineFace = null;
    if (ch.actionId === 'folded' || ch.actionId === 'talk') ch.stopAction();
  }

  /** Whether he has anything in `group` not said yet in this talk. */
  private fresh(group: string): boolean {
    return linesOf(group, VOICE).some((key) => !this.said.has(key));
  }

  /** A line of his from `group`, not one said yet in this talk while there is another. */
  private line(group: string): string {
    const pool = linesOf(group, VOICE);
    if (pool.length === 0) return '';
    const fresh = pool.filter((key) => !this.said.has(key));
    const from = fresh.length > 0 ? fresh : pool;
    const key = from[Math.floor(Math.random() * from.length)];
    this.said.add(key);
    return t(key);
  }
}
