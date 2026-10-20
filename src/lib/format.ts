import { format } from 'date-fns';
import { dateKeyToDate } from '../engine/dates';
import type { DateKey, DayState, PatternStep, TimeFormat, TimeOfDay } from '../engine/types';

export const STATE_LABEL: Record<DayState, string> = {
  day: 'Day Shift',
  night: 'Night Shift',
  after_night: 'After Night Shift',
  off: 'Day Off',
};

export function formatDate(key: DateKey, pattern: string): string {
  return format(dateKeyToDate(key), pattern);
}

export const longDate = (key: DateKey) => formatDate(key, 'MMMM d, yyyy');
export const weekdayName = (key: DateKey) => formatDate(key, 'EEEE');
export const shortDate = (key: DateKey) => formatDate(key, 'EEE, MMM d');

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
