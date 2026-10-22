import type { StringKey } from '../i18n/I18n';

/**
 * What everyone says when you talk with them (see Life.talk), by who they are, what they are doing and the hour:
 * keys into the game's text (locales/ja.json, talk.*), so the words stay in one place. The cast say what is
 * like them (Chiikawa and Usagi mostly sounds); the islanders say what islanders would.
 */

const keys = (group: string, count: number) => Array.from({ length: count }, (_, i) => `talk.${group}.${i + 1}` as StringKey);

/** Each of the cast's own. */
export const CAST_LINES: Record<string, StringKey[]> = {
  hitoha: keys('hitoha', 3),
  futaba: keys('futaba', 3),
  chiikawa: keys('chiikawa', 3),
  hachiware: keys('hachiware', 3),
  usagi: keys('usagi', 3),
  momonga: keys('momonga', 3),
  kurimanju: keys('kurimanju', 3),
  rakko: keys('rakko', 3),
  shisa: keys('shisa', 3),
  furuhonya: keys('furuhonya', 3),
};

/** The islanders', any time of day. */
export const ISLANDER_LINES = keys('islander', 8);

/** Anyone's, at some hours or doing something: at their stall's counter, at the feast, in the fields. */
export const MORNING_LINES = keys('morning', 2);
export const EVENING_LINES = keys('evening', 2);
export const NIGHT_LINES = keys('night', 2);
export const WORK_LINES = keys('work', 3);
export const FEAST_LINES = keys('feast', 2);
export const FIELD_LINES = keys('fields', 1);

/** Anyone's who is fond of you (see Life.fondness): talking with you, and coming over to greet you. */
export const FOND_LINES = keys('fond', 3);
export const GREET_LINES = Array.from({ length: 3 }, (_, i) => `greet.${i + 1}` as StringKey);

/** The islanders' at the welcome on your first day (see Life.welcomeWord); the cast have their own,
 * welcome.<id>. */
export const WELCOME_LINES = Array.from({ length: 4 }, (_, i) => `welcome.${i + 1}` as StringKey);
