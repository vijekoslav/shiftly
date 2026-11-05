import { useMemo } from 'react';
import { addDays } from '../engine/dates';
import { Schedule } from '../engine/schedule';
import { TEAM_IDS, teamPeriod, type TeamId } from '../engine/teams';
import { formatDate, STATE_LABEL, weekdayName } from '../lib/format';
import { t } from '../i18n';
import { useApp } from '../state/AppProvider';
import { ShiftIndicator } from './ShiftIndicator';

const DAYS = 7;

/** All four teams at a glance: today and the following six days. Tapping a row selects that team. */
export function TeamsOverview({ team, onSelect }: { team: TeamId; onSelect: (team: TeamId) => void }) {
  const { today } = useApp();
  const dates = Array.from({ length: DAYS }, (_, i) => addDays(today, i));
  const schedules = useMemo(() => TEAM_IDS.map((n) => new Schedule([teamPeriod(n)])), []);

  return (
    <section aria-label={t('teams.overview')} className="mb-3 rounded-2xl bg-surface px-3 py-2">
      <div className="grid grid-cols-[3.5rem_repeat(7,minmax(0,1fr))] items-center pb-1" aria-hidden>
        <span />
        {dates.map((d, i) => (
          <span
            key={d}
            className={`text-center text-[11px] font-semibold uppercase tracking-wide ${i === 0 ? 'text-accent' : 'text-label-2'}`}
          >
            {formatDate(d, 'EEEEE')}
          </span>
        ))}
      </div>
      {TEAM_IDS.map((n, row) => {
        const days = dates.map((d) => schedules[row].getDay(d));
        const selected = n === team;
        return (
          <button
            key={n}
            type="button"
            onClick={() => onSelect(n)}
            aria-pressed={selected}
            aria-label={`${t('team.n', { n })}. ${t('teams.todayAria', { state: STATE_LABEL[days[0].state] })}`}
            className={`grid min-h-11 w-full grid-cols-[3.5rem_repeat(7,minmax(0,1fr))] items-center rounded-xl text-left ${
              selected ? 'bg-surface-2' : ''
            }`}
          >
            <span className={`pl-2 text-[14px] ${selected ? 'font-semibold' : 'font-medium text-label-2'}`}>
              {t('team.n', { n })}
            </span>
            {days.map((info) => (
              <span key={info.date} className="flex h-7 items-center justify-center" title={`${weekdayName(info.date)}: ${STATE_LABEL[info.state]}`}>
                <ShiftIndicator state={info.state} size={16} labelled={false} />
              </span>
            ))}
          </button>
        );
      })}
    </section>
  );
}
