import * as THREE from 'three';
import { t, type StringKey } from '../i18n/I18n';
import type { Siren } from '../characters/Siren';
import type { DialogueBox, Spoken } from '../ui/DialogueBox';
import { cueOf, linesOf } from './lines';
import { faceOf } from '../ui/Faces';
import { ITEMS, itemName, type ItemId } from './Items';
import type { Hands } from './Hands';

/** Her lines' voice in locales/ja.json (`talk.own.siren.1`...: see lines.ts). */
const VOICE = ['siren'];
/** Talking with her again within this long (seconds) is "again" (see Life's AGAIN_WITHIN). */
const AGAIN_WITHIN = 150;
/** Past this far from her middle (metres) you have gone off and the talk ends: her tail's bowl is near a metre
 * round, so this is as Life's BOX_AWAY from her front. */
const AWAY = 5;
/** Asked something, she waits for your answer at most this long (seconds), as everyone does (Resident's
 * CHOOSE_MOST). */
const WAIT_MOST = 40;

/**
 * Talking with the Siren on her ledge in the forbidden cave (the user, 2026-10-24: sweet but a little eerie). She
 * talks as she does in the manga's Siren arc: short plain sentences, nearly every one ending in の, casual, calm
 * and innocent, with her high laugh (キャーハハ…) and her sudden わかったッ; never of eating or of revenge, which
 * the game leaves out. Her lines go into the text box as everyone's do (see Life.boxed), her face as their cues
 * say (see lines.ts), with もっとはなす till she has said all she has to say (never one line twice in a talk) and
 * またね; walking off ends it. She knows nothing of where anyone is. Holding something of your own, あげる (the user,
 * 2026-10-24): she thanks you and keeps it (it goes from your paws: she is no shape to hold it as everyone does),
 * and speaks of the last thing you gave her another time; never what is not yours to give (lent you, or with a
 * place of its own, as the book).
 */
export class SirenTalk {
  /** The line of hers in the box now, if she is talking with you. */
  private spoken: Spoken | null = null;
  private more = true;
  /** You said またね: her goodbye is in the box, and then the talk is over. */
  private parting = false;
  private waited = 0;
  /** What she has said in this talk, and when you last talked; whether you have met her yet. */
  private readonly said = new Set<StringKey>();
  private talkedAt = -Infinity;
  private met = false;
  private now = 0;
  /** What the choices on her line in the box are (see say), and the last thing you gave her. */
  private asked: ('more' | 'give' | 'bye')[] = [];
  private gift: ItemId | null = null;

  constructor(
    readonly siren: Siren,
    private readonly box: DialogueBox,
    /** Your paws and pouch, once the game has them (what you hold, she speaks of; what is yours, you may give her). */
    private readonly hands: () => Hands | null,
    /** Something given (the game's sound of it). */
    private readonly gave: () => void = () => {},
  ) {}

  /** What you hold in your paw now, if anything. */
  private holding(): ItemId | null {
    return this.hands()?.hand?.item ?? null;
  }

  /** Whether what you hold is yours to give her: not bitten into, not lent you, not someone's, not with a place
   * of its own (the book, the stage's ukulele, a village torch's brand), not the island's secret (the mermaid's scale). */
  private canGive(): boolean {
    const hands = this.hands();
    const c = hands?.hand;
    return !!c && !hands.nibbled && !c.lent && !c.home && !ITEMS[c.item].secret && (c.owner === null || c.owner === 'player');
  }

  /** Whether she is talking with you. */
  get talking(): boolean {
    return this.spoken !== null;
  }

  /** You talk with her: her first line (on meeting her, who you are; again soon, that you are back; else of
   * what you hold, or something of her own). */
  begin(): void {
    if (this.spoken) return;
    this.said.clear();
    this.more = true;
    this.parting = false;
    const again = this.now - this.talkedAt < AGAIN_WITHIN;
    this.talkedAt = this.now;
    const yours = this.yoursGroup();
    let group = 'talk.own';
    if (!this.met) group = 'talk.firstMeet';
    else if (again && Math.random() < 0.6) group = 'talk.again';
    else if (this.gift && Math.random() < 0.4) group = this.eaten(this.gift) ? 'talk.remember.ate' : 'talk.remember.kept';
    else if (yours && Math.random() < 0.6) group = yours;
    this.met = true;
    const line = this.line(group);
    this.say(this.gift ? line.replace('{0}', t(itemName(this.gift))) : line);
  }

  /** One frame: on to her next line when you ask for more, the talk over when you say またね, are silent long
   * enough, or go off. `you` is where you stand. */
  update(dt: number, you: THREE.Vector3): void {
    this.now += dt;
    const s = this.spoken;
    if (!s) return;
    const at = this.siren.character.position;
    if (Math.hypot(you.x - at.x, you.z - at.z) > AWAY || this.siren.where !== 'ledge') {
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
      const next = this.nextLine();
      this.more = next !== null;
      this.say(next ?? this.line('talk.spent'));
    } else if (chose === 'give') {
      this.give();
    } else if (chose === 'bye' && !this.parting) {
      // You said またね (the user, 2026-10-24): her goodbye, then the talk is over.
      this.parting = true;
      this.say(this.line('part.bye'), false);
    } else this.end();
  }

  /** Her line `line` (with its cue) into the box, with もっとはなす while she has more to say, and またね. */
  private say(line: string, ask = true): void {
    const cue = cueOf(line);
    this.siren.character.lineFace = cue.face;
    // (もっとはなす while she has more to say, あげる while you hold something yours, またね; her goodbye asks nothing.)
    this.asked = !ask ? [] : [...(this.more ? (['more'] as const) : []), ...(this.canGive() ? (['give'] as const) : []), 'bye'];
    const words = { more: t('talk.more'), give: t('talk.give'), bye: t('talk.bye') };
    this.waited = 0;
    this.spoken = this.box.add(t('char.siren'), cue.text, this, this.asked.map((k) => words[k]), faceOf('siren'));
  }

  /** You give her what you hold (see canGive): it goes from your paws, and she thanks you for it, as for something
   * to eat (she will share it with her little mermaids), to keep, or anything. */
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
    this.say(this.line(this.eaten(c.item) ? 'thanks.ate' : ITEMS[c.item].use === null ? 'thanks.kept' : 'thanks.got'));
  }

  /** Whether `item` is something to eat or drink. */
  private eaten(item: ItemId): boolean {
    const use = ITEMS[item].use;
    return use === 'eat' || use === 'drink';
  }

  private end(): void {
    this.spoken = null;
    this.siren.character.lineFace = null;
  }

  /** What she says next when you ask for more: something of what you hold, now and then, else her own; null
   * once she has said all she has. */
  private nextLine(): string | null {
    const yours = this.yoursGroup();
    if (yours && this.fresh(yours) && Math.random() < 0.3) return this.line(yours);
    return this.fresh('talk.own') ? this.line('talk.own') : null;
  }

  /** Her group of lines for what you hold, if she has one for it. */
  private yoursGroup(): string | null {
    const item = this.holding();
    if (!item) return null;
    const def = ITEMS[item];
    const group = def.light
      ? 'talk.yours.torch'
      : def.use === 'eat'
        ? 'talk.yours.food'
        : def.use === 'read'
          ? 'talk.yours.book'
          : def.use === 'play'
            ? 'talk.yours.ukulele'
            : def.use === 'ready'
              ? 'talk.yours.weapon'
              : 'talk.yours.keep';
    return linesOf(group, VOICE).some((k) => k.endsWith('.siren') || k.includes('.siren.')) ? group : null;
  }

  /** Whether she has anything in `group` not said yet in this talk. */
  private fresh(group: string): boolean {
    return linesOf(group, VOICE).some((key) => !this.said.has(key));
  }

  /** A line of hers from `group`, not one said yet in this talk while there is another. */
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
