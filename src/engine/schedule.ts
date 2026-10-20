import { addDays, localTimestamp, timeToMinutes } from './dates';
import { isSameShiftSpec, periodFor, rotationShiftFor, sortPeriods } from './rotation';
import type {
  DateKey,
  DayInfo,
  DayState,
  RotationPeriod,
  Shift,
  ShiftOverride,
  ShiftSegment,
  ShiftSpec,
} from './types';

/** Builds a concrete work interval. A shift whose end is not after its start ends the next day. */
export function buildShift(date: DateKey, spec: ShiftSpec, source: Shift['source']): Shift {
  const overnight = timeToMinutes(spec.end) <= timeToMinutes(spec.start);
  const endDate = overnight ? addDays(date, 1) : date;
  return {
    id: `shift-${date}`,
    date,
    endDate,
    kind: spec.kind,
    start: spec.start,
    end: spec.end,
    startTs: localTimestamp(date, spec.start),
    endTs: localTimestamp(endDate, spec.end),
    source,
    // Ending exactly at 00:00 leaves nothing on the next date.
    spillsIntoNextDay: overnight && timeToMinutes(spec.end) > 0,
  };
}

/** Splits a shift into the per-date pieces the weekly view draws. */
export function segmentsOf(shift: Shift): ShiftSegment[] {
  const startMin = timeToMinutes(shift.start);
  if (shift.endDate === shift.date) {
    return [{ shift, date: shift.date, startMin, endMin: timeToMinutes(shift.end), isStart: true, isEnd: true }];
  }
  const first: ShiftSegment = {
    shift,
    date: shift.date,
    startMin,
    endMin: 1440,
    isStart: true,
    isEnd: !shift.spillsIntoNextDay,
  };
  if (!shift.spillsIntoNextDay) return [first];
  return [
    first,
    { shift, date: shift.endDate, startMin: 0, endMin: timeToMinutes(shift.end), isStart: false, isEnd: true },
  ];
}

export function shiftDurationMinutes(shift: Shift): number {
  return Math.round((shift.endTs - shift.startTs) / 60_000);
}

/**
 * The scheduling engine: rotation periods + manual overrides in, day states and shifts out.
 * Pure and storage-agnostic. Nothing is pre-generated; every answer is computed on demand
 * from the reference date, so any date in the past or future works.
 */
export class Schedule {
  readonly periods: RotationPeriod[];
  private readonly overrides: Map<DateKey, ShiftOverride>;
  private readonly dayCache = new Map<DateKey, DayInfo>();

  constructor(periods: readonly RotationPeriod[], overrides: readonly ShiftOverride[] = []) {
    this.periods = sortPeriods(periods);
    this.overrides = new Map(overrides.map((o) => [o.date, o]));
  }

  getOverride(date: DateKey): ShiftOverride | undefined {
    return this.overrides.get(date);
  }

  /** What the rotation alone puts on `date`, ignoring overrides. */
  getRotationShiftSpec(date: DateKey): ShiftSpec | null {
    return rotationShiftFor(periodFor(this.periods, date), date);
  }

  /** The shift starting on `date` after overrides, or null. */
  getShiftStartingOn(date: DateKey): Shift | null {
    const override = this.overrides.get(date);
    if (override && override.shift !== undefined) {
      return override.shift === null ? null : buildShift(date, override.shift, 'override');
    }
    const spec = this.getRotationShiftSpec(date);
    return spec ? buildShift(date, spec, 'rotation') : null;
  }

  getDay(date: DateKey): DayInfo {
    const cached = this.dayCache.get(date);
    if (cached) return cached;

    const own = this.getShiftStartingOn(date);
    const previous = this.getShiftStartingOn(addDays(date, -1));
    const carryIn = previous && previous.spillsIntoNextDay && previous.endDate === date ? [previous] : [];
    const shifts = own ? [own] : [];

    // Work is never hidden behind a recovery marker: a shift starting today wins the headline.
    let state: DayState = 'off';
    if (own) state = own.kind;
    else if (carryIn.length > 0) state = 'after_night';

    const info: DayInfo = {
      date,
      state,
      shifts,
      carryIn,
      recovery: carryIn.length > 0,
      rotationShift: this.getRotationShiftSpec(date),
      override: this.overrides.get(date),
    };
    this.dayCache.set(date, info);
    return info;
  }

  /** Shifts that touch any date in `[from, to]`, including an overnight shift that began the day before. */
  getShiftsOverlapping(from: DateKey, to: DateKey): Shift[] {
    const result: Shift[] = [];
    for (let d = addDays(from, -1); d <= to; d = addDays(d, 1)) {
      const shift = this.getShiftStartingOn(d);
      if (!shift) continue;
      const lastDate = shift.spillsIntoNextDay ? shift.endDate : shift.date;
      if (lastDate >= from) result.push(shift);
    }
    return result;
  }

  /** Segments falling on dates within `[from, to]`. */
  getSegments(from: DateKey, to: DateKey): ShiftSegment[] {
    return this.getShiftsOverlapping(from, to)
      .flatMap(segmentsOf)
      .filter((s) => s.date >= from && s.date <= to);
  }

  /** True when the override leaves the date exactly as the rotation would have it. */
  isRedundantOverride(override: ShiftOverride): boolean {
    if (override.shift === undefined) return !override.note;
    return isSameShiftSpec(override.shift, this.getRotationShiftSpec(override.date)) && !override.note;
  }
}
