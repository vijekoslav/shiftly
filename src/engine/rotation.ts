import { diffDays, mod } from './dates';
import type { DateKey, PatternStep, RotationPeriod, ShiftSpec } from './types';

/** Reference point from the brief: 19 October 2026 is a day shift. */
export const DEFAULT_REFERENCE_DATE: DateKey = '2026-10-19';
/** Sentinel for "since forever": the first period covers every earlier date. */
export const BEGINNING_OF_TIME: DateKey = '1900-01-01';

export const DEFAULT_PATTERN: PatternStep[] = ['day', 'night', 'off', 'off'];

export function createDefaultPeriod(): RotationPeriod {
  return {
    id: 'rotation-default',
    effectiveFrom: BEGINNING_OF_TIME,
    anchor: DEFAULT_REFERENCE_DATE,
    pattern: [...DEFAULT_PATTERN],
    day: { start: '08:00', end: '20:00' },
    night: { start: '20:00', end: '08:00' },
  };
}

export function sortPeriods(periods: readonly RotationPeriod[]): RotationPeriod[] {
  return [...periods].sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));
}

/**
 * The rotation in force on `date`: the latest period starting on or before it.
 * Dates before every period fall back to the first one, so history is never empty.
 * `periods` must be sorted by `effectiveFrom` (see `sortPeriods`).
 */
export function periodFor(periods: readonly RotationPeriod[], date: DateKey): RotationPeriod {
  if (periods.length === 0) throw new Error('At least one rotation period is required');
  let found = periods[0];
  for (const p of periods) {
    if (p.effectiveFrom <= date) found = p;
    else break;
  }
  return found;
}

/** The pattern step that applies on `date` within `period`; works for dates before the anchor. */
export function stepFor(period: RotationPeriod, date: DateKey): PatternStep {
  const idx = mod(diffDays(date, period.anchor), period.pattern.length);
  return period.pattern[idx];
}

/** The shift the rotation alone puts on `date`, or null for a day without a shift start. */
export function rotationShiftFor(period: RotationPeriod, date: DateKey): ShiftSpec | null {
  const step = stepFor(period, date);
  if (step === 'off') return null;
  const range = step === 'day' ? period.day : period.night;
  return { kind: step, start: range.start, end: range.end };
}

/** First date (exclusive) on which a later period takes over, or null for the last period. */
export function periodEnd(periods: readonly RotationPeriod[], period: RotationPeriod): DateKey | null {
  const idx = periods.findIndex((p) => p.id === period.id);
  return idx >= 0 && idx < periods.length - 1 ? periods[idx + 1].effectiveFrom : null;
}

/**
 * Inserts or replaces a period. A new period takes over from its `effectiveFrom` onward;
 * earlier periods are untouched, so history is preserved. A period already starting on the
 * same date is replaced.
 */
export function upsertPeriod(periods: readonly RotationPeriod[], next: RotationPeriod): RotationPeriod[] {
  const rest = periods.filter((p) => p.id !== next.id && p.effectiveFrom !== next.effectiveFrom);
  return sortPeriods([...rest, next]);
}

export function isSameShiftSpec(a: ShiftSpec | null, b: ShiftSpec | null): boolean {
  if (a === null || b === null) return a === b;
  return a.kind === b.kind && a.start === b.start && a.end === b.end;
}
