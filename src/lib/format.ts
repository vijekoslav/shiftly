import { format } from 'date-fns';
import { enUS } from 'date-fns/locale/en-US';
import { hr as hrLocale } from 'date-fns/locale/hr';
import { dateKeyToDate } from '../engine/dates';
import type { DateKey, DayState, PatternStep, TimeFormat, TimeOfDay } from '../engine/types';
import { capitalize, getLanguage, t } from '../i18n';

/** Day-state names in the current language. Getters, so each read reflects the active language. */
export const STATE_LABEL = {
  get day() {
    return t('state.day');
  },
  get night() {
    return t('state.night');
  },
  get after_night() {
    return t('state.after_night');
  },
  get off() {
    return t('state.off');
  },
} as Record<DayState, string>;

/** Formats a date with a date-fns pattern in the current language. */
export function formatDate(key: DateKey, pattern: string): string {
  return format(dateKeyToDate(key), pattern, { locale: getLanguage() === 'hr' ? hrLocale : enUS });
}

export const longDate = (key: DateKey) => formatDate(key, t('fmt.longDate'));
export const shortDate = (key: DateKey) => formatDate(key, t('fmt.shortDate'));
export const weekdayName = (key: DateKey) => capitalize(formatDate(key, 'EEEE'));
/** Month name on its own, e.g. "October" / "Listopad". */
export const monthName = (key: DateKey) => capitalize(formatDate(key, t('fmt.monthName')));
/** Month and year, e.g. "October 2026" / "Listopad 2026.". */
export const monthYear = (key: DateKey) => capitalize(formatDate(key, t('fmt.monthYear')));

/** 24-hour by default; the 12-hour option renders "8:00 AM". */
export function formatTime(time: TimeOfDay, fmt: TimeFormat): string {
  if (fmt === '24h') return time;
  const [h, m] = time.split(':').map(Number);
  const suffix = h >= 12 ? 'PM' : 'AM';
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, '0')} ${suffix}`;
}

export function formatRange(start: TimeOfDay, end: TimeOfDay, fmt: TimeFormat): string {
  return `${formatTime(start, fmt)}–${formatTime(end, fmt)}`;
}

export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

/** How a pattern step reads to the user: an "off" right after a night is an after-night day. */
export function describeStep(pattern: readonly PatternStep[], index: number): DayState {
  const step = pattern[index];
  if (step !== 'off') return step;
  const previous = pattern[(index - 1 + pattern.length) % pattern.length];
  return previous === 'night' ? 'after_night' : 'off';
}
