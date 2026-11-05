import { createDefaultPeriod } from './rotation';
import type { DateKey, RotationPeriod } from './types';

export type TeamId = 1 | 2 | 3 | 4;
export const TEAM_IDS: readonly TeamId[] = [1, 2, 3, 4];

/** What the calendar is showing: the user's own editable schedule, or a team's read-only rotation. */
export type ScheduleView = 'mine' | TeamId;

/** A date on which each team works a day shift. All teams follow the same four-day rotation. */
const TEAM_DAY_SHIFT_ANCHOR: Record<TeamId, DateKey> = {
  1: '2026-11-02',
  2: '2026-11-04',
  3: '2026-11-03',
  4: '2026-11-01',
};

/** The default rotation for a team, offset so that its day shift falls on its anchor date. */
export function teamPeriod(team: TeamId): RotationPeriod {
  return { ...createDefaultPeriod(), id: `team-${team}`, anchor: TEAM_DAY_SHIFT_ANCHOR[team] };
}
