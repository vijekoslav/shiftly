import { describe, expect, it } from 'vitest';
import { addDays, diffDays, epochDay, localTimestamp, weekdayIndex } from './dates';
import { createDefaultPeriod, upsertPeriod } from './rotation';
import { Schedule, segmentsOf } from './schedule';
import type { DateKey, RotationPeriod, ShiftOverride } from './types';

const periods = [createDefaultPeriod()];
const base = () => new Schedule(periods);
const override = (date: DateKey, shift: ShiftOverride['shift'], note?: string): ShiftOverride => ({
  date,
  shift,
  note,
  updatedAt: 1,
});
const state = (s: Schedule, d: DateKey) => s.getDay(d).state;

describe('reference rotation', () => {
  const s = base();

  it('19 Oct 2026 is a day shift 08:00–20:00', () => {
    const day = s.getDay('2026-10-19');
    expect(day.state).toBe('day');
    expect(day.shifts[0]).toMatchObject({ kind: 'day', start: '08:00', end: '20:00' });
  });

  it('20 Oct 2026 is a night shift', () => {
    const day = s.getDay('2026-10-20');
    expect(day.state).toBe('night');
    expect(day.shifts[0]).toMatchObject({ start: '20:00', end: '08:00', endDate: '2026-10-21' });
  });

  it('21 Oct 2026 is an after-night recovery day', () => {
    const day = s.getDay('2026-10-21');
    expect(day.state).toBe('after_night');
    expect(day.recovery).toBe(true);
    expect(day.shifts).toHaveLength(0);
  });

  it('22 Oct 2026 is a day off', () => {
    const day = s.getDay('2026-10-22');
    expect(day.state).toBe('off');
    expect(day.recovery).toBe(false);
    expect(day.shifts).toHaveLength(0);
  });

  it('matches the example sequence from 19 to 26 October', () => {
    const got = Array.from({ length: 8 }, (_, i) => state(s, addDays('2026-10-19', i)));
    expect(got).toEqual(['day', 'night', 'after_night', 'off', 'day', 'night', 'after_night', 'off']);
  });
});

describe('cycle maths', () => {
  const s = base();

  it('repeats every four days, in both directions', () => {
    for (let n = -400; n <= 400; n += 7) {
      const d = addDays('2026-10-19', n);
      expect(state(s, d)).toBe(state(s, addDays(d, 4)));
      expect(state(s, d)).toBe(state(s, addDays(d, -4)));
    }
  });

  it('works backwards before the reference date', () => {
    expect(state(s, '2026-10-18')).toBe('off');
    expect(state(s, '2026-10-17')).toBe('after_night');
    expect(state(s, '2026-10-16')).toBe('night');
    expect(state(s, '2026-10-15')).toBe('day');
    expect(state(s, '2020-01-01')).toBe(state(s, addDays('2020-01-01', 4 * 100)));
    expect(diffDays('2020-01-01', '2026-10-19')).toBeLessThan(0);
  });

  it('continues across month and year boundaries', () => {
    // 19 Oct + 74 days = 1 Jan 2027, 74 mod 4 = 2 → after night.
    expect(addDays('2026-10-19', 74)).toBe('2027-01-01');
    expect(state(s, '2026-12-31')).toBe('night'); // +73 → 1
    expect(state(s, '2027-01-01')).toBe('after_night');
    expect(state(s, '2027-01-02')).toBe('off');
    expect(state(s, '2027-01-03')).toBe('day');
    // A leap day sits in the middle of the cycle without breaking it.
    expect(diffDays('2028-03-01', '2028-02-28')).toBe(2);
    expect(state(s, '2028-03-01')).toBe(state(s, addDays('2028-03-01', -4)));
  });

  it('is independent of the weekday', () => {
    const days = new Set<number>();
    for (let n = 0; n < 40; n += 4) days.add(weekdayIndex(addDays('2026-10-19', n)));
    expect(days.size).toBe(7);
    expect(weekdayIndex('2026-10-19')).toBe(0); // a Monday
  });
});

describe('overnight shifts', () => {
  const s = base();

  it('span midnight as a single interval', () => {
    const shift = s.getDay('2026-10-20').shifts[0];
    expect(shift.startTs).toBe(localTimestamp('2026-10-20', '20:00'));
    expect(shift.endTs).toBe(localTimestamp('2026-10-21', '08:00'));
    expect(shift.spillsIntoNextDay).toBe(true);
    // 12 hours of real time (no DST change on this night).
    expect((shift.endTs - shift.startTs) / 3_600_000).toBe(12);
  });

  it('is split into an evening and a morning segment for the week view', () => {
    const segments = segmentsOf(s.getDay('2026-10-20').shifts[0]);
    expect(segments).toHaveLength(2);
    expect(segments[0]).toMatchObject({ date: '2026-10-20', startMin: 1200, endMin: 1440, isStart: true, isEnd: false });
    expect(segments[1]).toMatchObject({ date: '2026-10-21', startMin: 0, endMin: 480, isStart: false, isEnd: true });
  });

  it('day shift occupies one third to five sixths of the day', () => {
    const [seg] = segmentsOf(s.getDay('2026-10-19').shifts[0]);
    expect(seg.startMin / 1440).toBeCloseTo(1 / 3);
    expect(seg.endMin / 1440).toBeCloseTo(5 / 6);
  });

  it('week segments include the morning half of a night that began the previous week', () => {
    // Sunday 25 Oct night? 25 Oct is after-night; use the night of Mon 19 → test with 26 Oct week.
    const segments = s.getSegments('2026-10-26', '2026-11-01');
    // 26 Oct is off, 27 Oct is day, 28 Oct night → Wed evening + Thu morning.
    expect(segments.map((x) => `${x.date}:${x.shift.kind}`)).toContain('2026-10-28:night');
    expect(segments.map((x) => `${x.date}:${x.shift.kind}`)).toContain('2026-10-29:night');
    // A night starting on Sunday spills into Monday of the next week.
    const sunNight = new Schedule(periods, [override('2026-11-01', { kind: 'night', start: '20:00', end: '08:00' })]);
    const next = sunNight.getSegments('2026-11-02', '2026-11-08');
    expect(next[0]).toMatchObject({ date: '2026-11-02', startMin: 0, endMin: 480, isStart: false });
  });

  it('a shift ending exactly at midnight does not create recovery', () => {
    const s2 = new Schedule(periods, [override('2026-10-22', { kind: 'day', start: '12:00', end: '00:00' })]);
    expect(s2.getDay('2026-10-22').shifts[0].spillsIntoNextDay).toBe(false);
    expect(state(s2, '2026-10-23')).toBe('day'); // the rotation's own day shift
    expect(s2.getDay('2026-10-23').recovery).toBe(false);
    expect(segmentsOf(s2.getDay('2026-10-22').shifts[0])).toHaveLength(1);
  });
});

describe('daylight saving time', () => {
  it('does not disturb day counting around the clock changes', () => {
    // Europe/Zagreb: 29 Mar 2026 (23h day) and 25 Oct 2026 (25h day).
    expect(diffDays('2026-03-30', '2026-03-28')).toBe(2);
    expect(diffDays('2026-10-26', '2026-10-24')).toBe(2);
    expect(addDays('2026-03-28', 1)).toBe('2026-03-29');
    expect(addDays('2026-03-29', 1)).toBe('2026-03-30');
    expect(addDays('2026-10-24', 1)).toBe('2026-10-25');
    expect(addDays('2026-10-25', 1)).toBe('2026-10-26');
    expect(epochDay('2026-10-26') - epochDay('2026-10-25')).toBe(1);
  });

  it('keeps the rotation intact across both transitions', () => {
    const s = base();
    expect(state(s, '2026-10-24')).toBe('night'); // night of the 25-hour day
    expect(state(s, '2026-10-25')).toBe('after_night');
    expect(state(s, '2026-10-26')).toBe('off');
    expect(state(s, '2026-10-27')).toBe('day');
    // 29 Mar 2026 is 204 days before the reference; 204 mod 4 = 0 → same as the reference day.
    expect(state(s, '2026-03-29')).toBe('day');
    expect(state(s, '2026-03-30')).toBe('night');
  });

  it('keeps wall-clock shift times and real durations follow the clock change', () => {
    const s = base();
    const night = s.getDay('2026-10-24').shifts[0]; // 20:00 Sat → 08:00 Sun, clocks go back 1h
    expect(night.start).toBe('20:00');
    expect(night.end).toBe('08:00');
    expect((night.endTs - night.startTs) / 3_600_000).toBe(13);
    expect(s.getDay('2026-10-25').carryIn[0].end).toBe('08:00');
  });
});

describe('manual overrides', () => {
  it('only change the affected date', () => {
    const s = new Schedule(periods, [override('2026-10-23', null)]);
    const plain = base();
    expect(state(s, '2026-10-23')).toBe('off');
    for (let n = -30; n <= 30; n++) {
      const d = addDays('2026-10-23', n);
      if (d === '2026-10-23') continue;
      expect(state(s, d)).toBe(state(plain, d));
    }
    expect(state(s, '2026-10-24')).toBe('night');
    expect(state(s, '2026-10-27')).toBe('day');
  });

  it('can swap a day shift for a night shift and back to the rotation', () => {
    const swapped = new Schedule(periods, [override('2026-10-19', { kind: 'night', start: '20:00', end: '08:00' })]);
    expect(state(swapped, '2026-10-19')).toBe('night');
    expect(swapped.getDay('2026-10-19').shifts[0].source).toBe('override');
    // The night of the 19th now ends on the 20th morning, before the 20th's own night.
    expect(swapped.getDay('2026-10-20').recovery).toBe(true);
    expect(state(swapped, '2026-10-20')).toBe('night');
    expect(state(new Schedule(periods, []), '2026-10-19')).toBe('day');
  });

  it('supports custom times', () => {
    const s = new Schedule(periods, [override('2026-10-19', { kind: 'day', start: '07:00', end: '15:30' })]);
    expect(s.getDay('2026-10-19').shifts[0]).toMatchObject({ start: '07:00', end: '15:30', endDate: '2026-10-19' });
  });

  it('can add an extra shift on a day off', () => {
    const s = new Schedule(periods, [override('2026-10-22', { kind: 'day', start: '08:00', end: '20:00' })]);
    expect(state(s, '2026-10-22')).toBe('day');
    expect(s.getDay('2026-10-22').rotationShift).toBeNull();
  });

  it('a note-only override keeps the rotation shift', () => {
    const s = new Schedule(periods, [override('2026-10-19', undefined, 'Swap with Ivan')]);
    expect(state(s, '2026-10-19')).toBe('day');
    expect(s.getDay('2026-10-19').override?.note).toBe('Swap with Ivan');
    expect(s.getDay('2026-10-19').shifts[0].source).toBe('rotation');
  });

  it('removing a night shift clears the next day recovery state', () => {
    const s = new Schedule(periods, [override('2026-10-20', null)]);
    expect(state(s, '2026-10-20')).toBe('off');
    expect(state(s, '2026-10-21')).toBe('off');
    expect(s.getDay('2026-10-21').recovery).toBe(false);
  });

  it('adding an extra night shift creates recovery on the following day', () => {
    // 22 Oct is a day off, 23 Oct is a day shift.
    const s = new Schedule(periods, [override('2026-10-21', { kind: 'night', start: '20:00', end: '08:00' })]);
    expect(state(s, '2026-10-22')).toBe('after_night');
    const s2 = new Schedule(periods, [override('2026-10-22', { kind: 'night', start: '20:00', end: '08:00' })]);
    expect(state(s2, '2026-10-23')).toBe('day'); // work is not hidden behind Zzz…
    expect(s2.getDay('2026-10-23').recovery).toBe(true); // …but the recovery is still known
  });

  it('shows work on a recovery day instead of Zzz', () => {
    const s = new Schedule(periods, [override('2026-10-21', { kind: 'day', start: '12:00', end: '18:00' })]);
    const day = s.getDay('2026-10-21');
    expect(day.state).toBe('day');
    expect(day.shifts).toHaveLength(1);
    expect(day.carryIn).toHaveLength(1);
  });

  it('shortening a night shift to end before midnight removes recovery', () => {
    const s = new Schedule(periods, [override('2026-10-20', { kind: 'night', start: '14:00', end: '22:00' })]);
    expect(state(s, '2026-10-21')).toBe('off');
  });

  it('detects redundant overrides', () => {
    const s = base();
    expect(s.isRedundantOverride(override('2026-10-19', { kind: 'day', start: '08:00', end: '20:00' }))).toBe(true);
    expect(s.isRedundantOverride(override('2026-10-19', null))).toBe(false);
    expect(s.isRedundantOverride(override('2026-10-22', null))).toBe(true);
  });
});

describe('rotation changes from a date', () => {
  const summer: RotationPeriod = {
    id: 'summer',
    effectiveFrom: '2027-06-01',
    anchor: '2027-06-01',
    pattern: ['day', 'day', 'night', 'night', 'off', 'off', 'off'],
    day: { start: '07:00', end: '19:00' },
    night: { start: '19:00', end: '07:00' },
  };

  it('leaves everything before the effective date untouched', () => {
    const before = base();
    const after = new Schedule(upsertPeriod(periods, summer));
    for (let n = -200; n < 225; n++) {
      const d = addDays('2026-10-19', n);
      if (d >= '2027-06-01') break;
      expect(after.getDay(d)).toEqual(before.getDay(d));
    }
  });

  it('applies the new pattern, anchor and times from the effective date', () => {
    const s = new Schedule(upsertPeriod(periods, summer));
    expect(state(s, '2027-05-31')).toBe(state(base(), '2027-05-31'));
    expect(state(s, '2027-06-01')).toBe('day');
    expect(state(s, '2027-06-02')).toBe('day');
    expect(state(s, '2027-06-03')).toBe('night');
    expect(state(s, '2027-06-04')).toBe('night');
    expect(state(s, '2027-06-05')).toBe('after_night');
    expect(state(s, '2027-06-06')).toBe('off');
    expect(state(s, '2027-06-08')).toBe('day'); // 7-day cycle repeats
    expect(s.getDay('2027-06-01').shifts[0]).toMatchObject({ start: '07:00', end: '19:00' });
  });

  it('can be followed by another rotation to return to the normal pattern', () => {
    const autumn: RotationPeriod = { ...createDefaultPeriod(), id: 'autumn', effectiveFrom: '2027-09-01', anchor: '2027-09-01' };
    const s = new Schedule(upsertPeriod(upsertPeriod(periods, summer), autumn));
    expect(state(s, '2027-08-31')).toBe(state(new Schedule(upsertPeriod(periods, summer)), '2027-08-31'));
    expect(state(s, '2027-09-01')).toBe('day');
    expect(state(s, '2027-09-02')).toBe('night');
  });

  it('replaces a period starting on the same date and keeps ordering', () => {
    const replaced = upsertPeriod(upsertPeriod(periods, summer), { ...summer, id: 'other', anchor: '2027-06-02' });
    expect(replaced.map((p) => p.id)).toEqual(['rotation-default', 'other']);
  });

  it('keeps overrides in place when the rotation changes', () => {
    const o = override('2027-06-02', null);
    const s = new Schedule(upsertPeriod(periods, summer), [o]);
    expect(state(s, '2027-06-02')).toBe('off');
    expect(state(s, '2027-06-01')).toBe('day');
  });

  it('a night spanning the switch-over still ends in the old rotation', () => {
    const s = new Schedule(upsertPeriod(periods, { ...summer, effectiveFrom: '2026-10-21', anchor: '2026-10-21' }));
    // The night of the 20th (old rotation) still ends on the 21st, so recovery shows.
    expect(s.getDay('2026-10-21').recovery).toBe(true);
    expect(state(s, '2026-10-21')).toBe('day'); // new rotation starts with a day shift
  });
});
