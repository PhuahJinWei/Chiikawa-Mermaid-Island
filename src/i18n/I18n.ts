import ja from '../locales/ja.json';
import en from '../locales/en.json';
import zhHans from '../locales/zh-Hans.json';

/** Japanese is the source of truth: every key must exist there. */
export type StringKey = keyof typeof ja;
export type Locale = 'ja' | 'en' | 'zh-Hans';
export const LOCALES: readonly Locale[] = ['ja', 'en', 'zh-Hans'];

const tables: Record<Locale, Partial<Record<StringKey, string>>> = {
  ja,
  en,
  'zh-Hans': zhHans,
};

let current: Locale = 'ja';
const listeners = new Set<() => void>();

/** Japanese unless the device language is English or Chinese. */
export function detectLocale(): Locale {
  const langs = navigator.languages?.length ? navigator.languages : [navigator.language];
  for (const raw of langs) {
    const l = (raw || '').toLowerCase();
    if (l.startsWith('ja')) return 'ja';
    if (l.startsWith('zh')) return 'zh-Hans';
    if (l.startsWith('en')) return 'en';
  }
  return 'ja';
}

export function getLocale(): Locale {
  return current;
}

export function setLocale(locale: Locale): void {
  current = locale;
  document.documentElement.lang = locale;
  document.title = t('app.title');
  for (const fn of listeners) fn();
}

export function t(key: StringKey): string {
  return tables[current][key] ?? ja[key] ?? key;
}

export function onLocaleChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Development aid: list keys that a translation is missing. */
export function reportMissingKeys(): void {
  const keys = Object.keys(ja) as StringKey[];
  for (const locale of LOCALES) {
    if (locale === 'ja') continue;
    const missing = keys.filter((k) => !(k in tables[locale]));
    if (missing.length) console.warn(`[i18n] ${locale} is missing ${missing.length} keys:`, missing);
  }
}
