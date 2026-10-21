import { useSyncExternalStore } from 'react';
import type { Language } from '../engine/types';
import { en, type Key } from './en';
import { hr } from './hr';

export type { Key };

const dictionaries: Record<Language, Record<Key, string>> = { en, hr };

let current: Language = 'en';
const listeners = new Set<() => void>();

export function getLanguage(): Language {
  return current;
}

export function setLanguage(language: Language) {
  if (language === current) return;
  current = language;
  if (typeof document !== 'undefined') document.documentElement.lang = language;
  listeners.forEach((l) => l());
}

/** Subscribes the calling component to language changes, so it re-renders when the language switches. */
export function useLanguage(): Language {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    getLanguage,
  );
}

type Params = Record<string, string | number>;

function fill(template: string, params?: Params): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) => (name in params ? String(params[name]) : match));
}

/** Translates `key` into the current language, filling `{name}` placeholders. */
export function t(key: Key, params?: Params): string {
  return fill(dictionaries[current][key] ?? en[key], params);
}

/**
 * Plural-aware translation: picks `${base}.one|few|other` by the current language's plural rule
 * (Croatian has a separate form for 2–4) and exposes the count as `{count}`.
 */
export function tn(base: string, count: number, params?: Params): string {
  const category = new Intl.PluralRules(current).select(count);
  const dict = dictionaries[current] as Record<string, string>;
  const template = dict[`${base}.${category}`] ?? dict[`${base}.other`] ?? base;
  return fill(template, { ...params, count });
}

/** BCP 47 tag for `toLocaleDateString` and friends. */
export function localeTag(): string {
  return current === 'hr' ? 'hr-HR' : 'en-GB';
}

export function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
