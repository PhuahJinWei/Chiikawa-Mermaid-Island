import { CHARACTER_IDS, type CharacterId } from '../characters/types';

/** Dev mode: the address has ?dev (the user, 2026-10-24), wherever the game is served from. It shows the テスト
 * button and how fast the game draws; without it, the game as everyone plays it. */
export const DEV_MODE = typeof location !== 'undefined' && new URLSearchParams(location.search).has('dev');

/** v2 since you play a nameless islander (2026-10-21): a choice of the cast saved before that starts
 * as the islander again. */
const KEY = 'mermaid-island:settings:v2';

export interface Settings {
  /** Whose eyes you look out of: you, the islander, unless the Test panel chose one of the cast. */
  character: CharacterId;
}

export function loadSettings(): Settings {
  const fallback: Settings = { character: 'player' };
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return fallback;
    const data = JSON.parse(raw) as Partial<Settings>;
    return {
      character:
        data.character && (CHARACTER_IDS as readonly string[]).includes(data.character) ? data.character : 'player',
    };
  } catch {
    return fallback;
  }
}

export function saveSettings(settings: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    // Storage blocked (private mode): settings last for this visit only.
  }
}
