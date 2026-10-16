import { LOCALES, type Locale } from '../i18n/I18n';
import { CHARACTER_IDS, type CharacterId } from '../characters/types';

const KEY = 'mermaid-island:settings:v1';

export interface Settings {
  /** null until the player picks one; the device language decides until then. */
  locale: Locale | null;
  character: CharacterId;
}

export function loadSettings(): Settings {
  const fallback: Settings = { locale: null, character: 'chiikawa' };
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return fallback;
    const data = JSON.parse(raw) as Partial<Settings>;
    return {
      locale: data.locale && (LOCALES as readonly string[]).includes(data.locale) ? data.locale : null,
      character:
        data.character && (CHARACTER_IDS as readonly string[]).includes(data.character) ? data.character : 'chiikawa',
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
