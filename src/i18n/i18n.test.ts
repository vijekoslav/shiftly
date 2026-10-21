import { afterEach, describe, expect, it } from 'vitest';
import { en } from './en';
import { hr } from './hr';
import { capitalize, setLanguage, t, tn } from './index';
import { formatDate, longDate, monthName, monthYear, weekdayName } from '../lib/format';

afterEach(() => setLanguage('en'));

const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe('dictionaries', () => {
  const keys = Object.keys(en) as (keyof typeof en)[];

  it('has a non-empty Croatian string for every English key', () => {
    for (const key of keys) {
      expect(hr[key], key).toBeTruthy();
    }
    expect(Object.keys(hr).sort()).toEqual([...keys].sort());
  });

  it('uses the same placeholders in both languages', () => {
    for (const key of keys) {
      expect(placeholders(hr[key]), key).toEqual(placeholders(en[key]));
    }
  });

  it('translates something for every key (nothing is left in English by accident)', () => {
    // Only short, language-neutral strings may be identical.
    const same = keys.filter((k) => hr[k] === en[k]);
    for (const key of same) expect(en[key].length, key).toBeLessThanOrEqual(12);
  });
});

describe('t and tn', () => {
  it('fills placeholders and falls back to the key set of English', () => {
    expect(t('details.prevEnded', { time: '08:00' })).toBe('Previous shift ended at 08:00.');
    setLanguage('hr');
    expect(t('details.prevEnded', { time: '08:00' })).toBe('Prethodna smjena završila je u 08:00.');
  });

  it('picks Croatian plural forms (1, 2–4, 5+, 21, 22)', () => {
    setLanguage('hr');
    expect(tn('ms.editedCount', 1)).toBe('1 dan ima ručne izmjene u ovom mjesecu.');
    expect(tn('ms.editedCount', 3)).toBe('3 dana imaju ručne izmjene u ovom mjesecu.');
    expect(tn('ms.editedCount', 5)).toBe('5 dana ima ručne izmjene u ovom mjesecu.');
    expect(tn('ms.editedCount', 21)).toBe('21 dan ima ručne izmjene u ovom mjesecu.');
    expect(tn('ms.editedCount', 22)).toBe('22 dana imaju ručne izmjene u ovom mjesecu.');
  });

  it('picks English plural forms', () => {
    expect(tn('ms.editedCount', 1)).toBe('1 day has manual changes this month.');
    expect(tn('ms.editedCount', 2)).toBe('2 days have manual changes this month.');
  });
});

describe('localised dates', () => {
  it('formats English dates as before', () => {
    expect(longDate('2026-10-19')).toBe('October 19, 2026');
    expect(weekdayName('2026-10-19')).toBe('Monday');
    expect(monthYear('2026-10-01')).toBe('October 2026');
  });

  it('formats Croatian dates with the right month forms', () => {
    setLanguage('hr');
    expect(longDate('2026-10-19')).toBe('19. listopada 2026.');
    expect(weekdayName('2026-10-19')).toBe('Ponedjeljak');
    expect(monthName('2026-10-01')).toBe('Listopad');
    expect(monthYear('2026-10-01')).toBe('Listopad 2026.');
    expect(formatDate('2026-10-19', 'EEE')).toBe('pon');
    expect(capitalize('čet')).toBe('Čet');
  });
});
