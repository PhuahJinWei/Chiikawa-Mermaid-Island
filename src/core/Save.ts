import type { SavedPlay } from './Play';
import type { SavedThing } from '../life/Things';
import type { SavedResident } from '../life/Life';

/**
 * Your island as you left it, kept in the browser (localStorage) and taken up again when you come back: the
 * hour and the day, where you stood and which way you faced, what is in your paw and your pouch, and what
 * lies about (what you put down, the beach's shells and starfish, the stage's ukulele). Opening the game
 * with `?fresh` starts the island anew.
 */

export interface SaveData {
  v: 1;
  hours: number;
  day: number;
  /** Where you stood (your feet) and which way you faced. */
  me: { x: number; y: number; z: number; yaw: number } | null;
  play: SavedPlay;
  /** What everyone who lives here holds and keeps, and how they are (not in saves from before they did). */
  residents?: Record<string, SavedResident>;
  things: SavedThing[];
  /** The last morning the sea left things on the beaches. */
  beachDay: number;
}

const KEY = 'mermaid-island:save:v1';

/** Whether this visit starts the island anew (`?fresh`). */
export const FRESH = typeof location !== 'undefined' && new URLSearchParams(location.search).has('fresh');

export function loadSave(): SaveData | null {
  if (FRESH) return null;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as SaveData;
    return data && data.v === 1 && Number.isFinite(data.hours) ? data : null;
  } catch {
    return null;
  }
}

export function writeSave(data: SaveData): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    // Private windows and full storage keep nothing; the island still plays.
  }
}
