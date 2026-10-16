import ja from '../locales/ja.json';

/**
 * The game is in Japanese only. Its text lives in locales/ja.json, looked up by key, so the
 * words stay in one place.
 */
export type StringKey = keyof typeof ja;

export function t(key: StringKey): string {
  return ja[key] ?? key;
}
