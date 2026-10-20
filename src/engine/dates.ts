import type { DateKey, MonthKey, TimeOfDay } from './types';

/**
 * Calendar-day arithmetic.
 *
 * Dates are `YYYY-MM-DD` strings and all day maths runs through UTC midnight, which has no
 * daylight-saving transitions, so a "day" is always exactly one day. Local `Date` objects are
 * only created at the edges (timestamps for display, month grids).
 */

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;
const MS_PER_DAY = 86_400_000;

export function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

export function isValidDateKey(value: unknown): value is DateKey {
  if (typeof value !== 'string') return false;
  const m = DATE_RE.exec(value);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

export function isValidTime(value: unknown): value is TimeOfDay {
  return typeof value === 'string' && TIME_RE.test(value);
}

export function parseDateKey(key: DateKey): { y: number; m: number; d: number } {
  const m = DATE_RE.exec(key);
  if (!m) throw new Error(`Invalid date key: ${key}`);
  return { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) };
}

export function makeDateKey(y: number, m: number, d: number): DateKey {
  return `${String(y).padStart(4, '0')}-${pad(m)}-${pad(d)}`;
}

/** Whole days since 1970-01-01 for a calendar date. Always an integer. */
export function epochDay(key: DateKey): number {
  const { y, m, d } = parseDateKey(key);
  return Math.round(Date.UTC(y, m - 1, d) / MS_PER_DAY);
}

export function fromEpochDay(n: number): DateKey {
  const dt = new Date(n * MS_PER_DAY);
  return makeDateKey(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

export function addDays(key: DateKey, n: number): DateKey {
  return fromEpochDay(epochDay(key) + n);
}

/** `a - b` in calendar days; negative when `a` is earlier. */
export function diffDays(a: DateKey, b: DateKey): number {
  return epochDay(a) - epochDay(b);
}

/** Mathematical modulo: the result is always in `[0, n)`, also for negative `a`. */
export function mod(a: number, n: number): number {
  return ((a % n) + n) % n;
}

export function addMonths(month: MonthKey, n: number): MonthKey {
  const [y, m] = month.split('-').map(Number);
  const idx = y * 12 + (m - 1) + n;
  return `${String(Math.floor(idx / 12)).padStart(4, '0')}-${pad(mod(idx, 12) + 1)}`;
}

export function monthOf(key: DateKey): MonthKey {
  return key.slice(0, 7);
}

export function monthStart(month: MonthKey): DateKey {
  return `${month}-01`;
}

export function daysInMonth(month: MonthKey): number {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export function monthEnd(month: MonthKey): DateKey {
  return `${month}-${pad(daysInMonth(month))}`;
}

/** 0 = Monday … 6 = Sunday. */
export function weekdayIndex(key: DateKey): number {
  // 1970-01-01 was a Thursday (index 3).
  return mod(epochDay(key) + 3, 7);
}

export function startOfWeek(key: DateKey): DateKey {
  return addDays(key, -weekdayIndex(key));
}

export function timeToMinutes(t: TimeOfDay): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

export function minutesToTime(min: number): TimeOfDay {
  return `${pad(Math.floor(min / 60))}:${pad(min % 60)}`;
}

/** Local timestamp for a date + wall-clock time. This is the only place a local `Date` is built. */
export function localTimestamp(key: DateKey, time: TimeOfDay): number {
  const { y, m, d } = parseDateKey(key);
  const [h, min] = time.split(':').map(Number);
  return new Date(y, m - 1, d, h, min, 0, 0).getTime();
}

/** Today's local calendar date. */
export function todayKey(now: Date = new Date()): DateKey {
  return makeDateKey(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

/** A local `Date` at noon: safe to hand to date-fns formatters across DST changes. */
export function dateKeyToDate(key: DateKey): Date {
  const { y, m, d } = parseDateKey(key);
  return new Date(y, m - 1, d, 12, 0, 0, 0);
}
