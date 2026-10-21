/** Local calendar date, `YYYY-MM-DD`. Never a timestamp: schedule math is done on calendar days. */
export type DateKey = string;
/** Local calendar month, `YYYY-MM`. */
export type MonthKey = string;
/** Wall-clock time, `HH:mm` (24-hour). */
export type TimeOfDay = string;

export type ShiftKind = 'day' | 'night';
/** One day of a rotation pattern. "After night" is not a step: it is derived from the night before. */
export type PatternStep = 'day' | 'night' | 'off';

export interface TimeRange {
  start: TimeOfDay;
  end: TimeOfDay;
}

/**
 * A rotation in force from `effectiveFrom` until the next period begins. The first
 * period covers all earlier dates too. `anchor` is the date on which `pattern[0]` falls.
 */
export interface RotationPeriod {
  id: string;
  effectiveFrom: DateKey;
  anchor: DateKey;
  pattern: PatternStep[];
  day: TimeRange;
  night: TimeRange;
}

/** What a shift is, independent of where it came from. */
export interface ShiftSpec {
  kind: ShiftKind;
  start: TimeOfDay;
  end: TimeOfDay;
}

/**
 * A manual change for the shifts *starting* on `date`. It never touches the rotation.
 * - `shift` undefined: keep the rotation's shift (the override only carries a note)
 * - `shift` null: no shift starts on this date
 * - `shift` object: this shift replaces whatever the rotation says
 */
export interface ShiftOverride {
  date: DateKey;
  shift?: ShiftSpec | null;
  note?: string;
  updatedAt: number;
}

/** A concrete work interval. Overnight shifts are one shift with `endDate` after `date`. */
export interface Shift extends ShiftSpec {
  /** Stable per start date. */
  id: string;
  /** Date the shift starts on. */
  date: DateKey;
  /** Date the shift ends on (the next day for overnight shifts). */
  endDate: DateKey;
  /** Local timestamps (ms). */
  startTs: number;
  endTs: number;
  source: 'rotation' | 'override';
  /** True when part of the shift falls on `endDate` (i.e. it ends after 00:00). */
  spillsIntoNextDay: boolean;
}

/** The headline state of a calendar day. */
export type DayState = 'day' | 'night' | 'after_night' | 'off';

export interface DayInfo {
  date: DateKey;
  /** Headline state: a shift starting today wins over recovery, so work is never hidden. */
  state: DayState;
  /** Shifts that start on this date. */
  shifts: Shift[];
  /** Overnight shifts from the previous date that end on this date. */
  carryIn: Shift[];
  /** True whenever an overnight shift ended this morning, even if another shift starts today. */
  recovery: boolean;
  /** What the rotation alone says for this date (null: off). */
  rotationShift: ShiftSpec | null;
  override?: ShiftOverride;
}

/** A portion of a shift that falls on one calendar date, in minutes from 00:00. */
export interface ShiftSegment {
  shift: Shift;
  date: DateKey;
  startMin: number;
  endMin: number;
  /** First segment of the shift. */
  isStart: boolean;
  /** Last segment of the shift. */
  isEnd: boolean;
}

export interface MonthConfirmation {
  month: MonthKey;
  confirmedAt: number;
  /** Set when shifts in the month were edited after it was confirmed. */
  needsReview: boolean;
}

export type ThemePreference = 'system' | 'dark' | 'light';
export type TimeFormat = '24h' | '12h';
export type Language = 'en' | 'hr';

export interface AppSettings {
  theme: ThemePreference;
  timeFormat: TimeFormat;
  language: Language;
}

/** The complete, serialisable state of the app. Storage, backup and future sync all speak this. */
export interface AppData {
  settings: AppSettings;
  periods: RotationPeriod[];
  overrides: ShiftOverride[];
  confirmations: MonthConfirmation[];
}
