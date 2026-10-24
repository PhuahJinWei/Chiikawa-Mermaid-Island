import ja from '../locales/ja.json';
import type { StringKey } from '../i18n/I18n';
import { EXPRESSION_IDS, type ExpressionId } from '../characters/types';
import { ACTIONS, type ActionId } from '../characters/Actions';

/**
 * What everyone says, in their own voice (the user, 2026-10-24: every line suits whoever says it). The words
 * live in locales/ja.json in groups: a group's lines are `group.1`, `group.2`... (or `group` alone, one line),
 * and a voice's own are `group.<voice>.1`... (or `group.<voice>`). A voice is one of the cast, by id
 * (`talk.own.chiikawa.3`), or an islander's way of speaking (`talk.own.kid.2`, see profiles.ts VOICES); the
 * plain lines are any islander's. Someone's lines for a group are the first found of their voices', then
 * the plain ones (see Life.line, which also keeps them from saying the same thing twice running).
 *
 * A line may begin with a cue in brackets (the user, 2026-10-24: faces and actions to go with the words), which is
 * never shown: a face to make while it shows (`[happy]`, any of the faces: characters/types.ts), something to do as
 * they say it (`[cheer]`, `[drink]`, `[sword]`, `[hop]`: the actions, characters/Actions.ts; `[folded]`, his arms
 * folded, is 島二郎's alone: see ShimajiroTalk), or both (`[happy cheer]`). A face holds over the action's own; an
 * action they cannot do (a sword they have not got, seated) is passed over (see Resident.speak).
 */

const NUMBERED = /^(.+)\.(\d+)$/;
/** Every numbered group's lines, in order, by the group's key (built once from the game's text). */
const pools = new Map<string, StringKey[]>();
for (const key of Object.keys(ja)) {
  const m = NUMBERED.exec(key);
  if (!m) continue;
  const pool = pools.get(m[1]) ?? [];
  pool.push(key as StringKey);
  pools.set(m[1], pool);
}
for (const pool of pools.values()) pool.sort((a, b) => Number(NUMBERED.exec(a)?.[2]) - Number(NUMBERED.exec(b)?.[2]));

/** The lines under `prefix`: numbered, or the one line `prefix` itself; null if there are none. */
function under(prefix: string): StringKey[] | null {
  return pools.get(prefix) ?? (prefix in ja ? [prefix as StringKey] : null);
}

/** A line's words, and the face and the action its cue (if any) has them make with it. */
export interface Cue {
  text: string;
  face: ExpressionId | null;
  act: ActionId | 'hop' | null;
}

const CUE = /^\[([A-Za-z ,]+)\]\s*/;
const FACES = new Set<string>(EXPRESSION_IDS);

/** `line` read for its cue (see above): its words without it, and the face and the action it names. */
export function cueOf(line: string): Cue {
  const m = CUE.exec(line);
  const cue: Cue = { text: m ? line.slice(m[0].length) : line, face: null, act: null };
  for (const word of m ? m[1].split(/[ ,]+/) : []) {
    if (FACES.has(word)) cue.face = word as ExpressionId;
    else if (word === 'hop' || word in ACTIONS) cue.act = word as ActionId | 'hop';
  }
  return cue;
}

/** Who speaks in sounds only, never in words (the user, 2026-10-24: Chiikawa and Usagi): where a group has
 * none of their lines, they make their own sounds (`sounds.<id>`), never say anyone else's words. Their lines
 * name no one and nothing (no {0} or {1}: Life.whereIs shows where with its marker). */
const WORDLESS = new Set(['chiikawa', 'usagi']);

/** The lines of `group` for someone who speaks in `voices` (their own first): the first voice's that has
 * any, else anyone's (or their sounds, for one who has no words); none if the group is unknown. */
export function linesOf(group: string, voices: readonly string[]): StringKey[] {
  for (const voice of voices) {
    const own = under(`${group}.${voice}`);
    if (own) return own;
  }
  for (const voice of voices) if (WORDLESS.has(voice)) return under(`sounds.${voice}`) ?? [];
  return under(group) ?? [];
}
