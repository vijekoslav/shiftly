import { describe, expect, it } from 'vitest';
import { createDefaultPeriod } from './rotation';
import { Schedule } from './schedule';
import { teamPeriod, TEAM_IDS } from './teams';

const dayOf = (team: 1 | 2 | 3 | 4, date: string) => new Schedule([teamPeriod(team)]).getDay(date).state;

describe('team rotations', () => {
  it('puts each team on a day shift on its reference date', () => {
    expect(dayOf(1, '2026-11-02')).toBe('day');
    expect(dayOf(2, '2026-11-04')).toBe('day');
    expect(dayOf(3, '2026-11-03')).toBe('day');
    expect(dayOf(4, '2026-11-01')).toBe('day');
  });

  it('follows the day, night, after night, off cycle', () => {
    const states = ['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05'].map((d) => dayOf(1, d));
    expect(states).toEqual(['day', 'night', 'after_night', 'off']);
  });

  it('has exactly one team on a day shift on any date', () => {
    for (const date of ['2026-10-19', '2026-11-04', '2027-03-15', '2025-01-01']) {
      expect(TEAM_IDS.filter((team) => dayOf(team, date) === 'day')).toHaveLength(1);
    }
  });

  it('matches the default rotation for team 2', () => {
    const own = new Schedule([createDefaultPeriod()]);
    const team = new Schedule([teamPeriod(2)]);
    for (const date of ['2026-10-19', '2026-11-04', '2027-01-09', '2026-01-01']) {
      expect(team.getDay(date).state).toBe(own.getDay(date).state);
    }
  });
});
