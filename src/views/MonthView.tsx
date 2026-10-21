import { useRef, useState } from 'react';
import { CircleCheck, CircleDashed, TriangleAlert, ChevronLeft, ChevronRight } from 'lucide-react';
import { addDays, addMonths, monthEnd, monthOf, monthStart, startOfWeek, weekdayIndex } from '../engine/dates';
import type { DateKey, DayInfo, MonthKey } from '../engine/types';
import { ShiftIndicator } from '../components/ShiftIndicator';
import { DayDetails } from '../components/DayDetails';
import { MonthStatusSheet } from '../components/MonthStatusSheet';
import { useApp, useMonthStatus } from '../state/AppProvider';
import { formatDate, formatRange, longDate, monthName, monthYear, STATE_LABEL, weekdayName } from '../lib/format';
import { t } from '../i18n';
import { useSwipe } from '../lib/hooks';

const WEEKDAY_KEYS = ['wd.0', 'wd.1', 'wd.2', 'wd.3', 'wd.4', 'wd.5', 'wd.6'] as const;

interface Props {
  month: MonthKey;
  onMonthChange: (month: MonthKey) => void;
  selectedDate: DateKey;
  onSelectDate: (date: DateKey) => void;
  onEditDate: (date: DateKey) => void;
}

export function MonthView({ month, onMonthChange, selectedDate, onSelectDate, onEditDate }: Props) {
  const { today } = useApp();
  const [direction, setDirection] = useState<'next' | 'prev' | null>(null);
  const [statusOpen, setStatusOpen] = useState(false);

  const go = (n: number) => {
    setDirection(n > 0 ? 'next' : 'prev');
    onMonthChange(addMonths(month, n));
  };
  const goToday = () => {
    const target = monthOf(today);
    if (target !== month) setDirection(target > month ? 'next' : 'prev');
    onMonthChange(target);
    onSelectDate(today);
  };
  const swipe = useSwipe(() => go(-1), () => go(1));

  const monthDate = monthStart(month);
  const isCurrent = month === monthOf(today) && selectedDate === today;

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col px-3 pb-6 md:grid md:grid-cols-[minmax(0,1fr)_340px] md:gap-6 md:px-6">
      <div className="min-w-0">
        <header className="flex items-end justify-between px-1 pb-3 pt-2">
          <div className="min-w-0">
            <h1 className="flex items-baseline gap-2 text-[32px] font-bold leading-tight tracking-tight">
              <span>{monthName(monthDate)}</span>
              <span className="font-semibold text-label-2">{formatDate(monthDate, 'yyyy')}</span>
            </h1>
            <MonthStatusPill month={month} onClick={() => setStatusOpen(true)} />
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={goToday}
              disabled={isCurrent}
              className="min-h-11 rounded-full px-3 text-[15px] font-medium text-accent transition-opacity disabled:opacity-40"
            >
              {t('common.today')}
            </button>
            <button type="button" onClick={() => go(-1)} aria-label={t('nav.prevMonth')} className="flex size-11 items-center justify-center rounded-full text-accent active:bg-surface-2">
              <ChevronLeft size={24} />
            </button>
            <button type="button" onClick={() => go(1)} aria-label={t('nav.nextMonth')} className="flex size-11 items-center justify-center rounded-full text-accent active:bg-surface-2">
              <ChevronRight size={24} />
            </button>
          </div>
        </header>

        <div className="grid grid-cols-7 gap-1 pb-1.5" aria-hidden>
          {WEEKDAY_KEYS.map((k) => (
            <div key={k} className="text-center text-[11px] font-semibold uppercase tracking-wide text-label-2">
              {t(k)}
            </div>
          ))}
        </div>

        <div {...swipe} className="-m-0.5 touch-pan-y overflow-hidden p-0.5">
          <MonthGrid
            key={month}
            month={month}
            direction={direction}
            selectedDate={selectedDate}
            onSelect={(d) => {
              if (monthOf(d) !== month) {
                setDirection(d > monthEnd(month) ? 'next' : 'prev');
                onMonthChange(monthOf(d));
              }
              onSelectDate(d);
            }}
          />
        </div>
      </div>

      <div className="mt-4 md:mt-18">
        <DayDetails date={selectedDate} onEdit={() => onEditDate(selectedDate)} />
      </div>

      {statusOpen && <MonthStatusSheet month={month} onClose={() => setStatusOpen(false)} />}
    </div>
  );
}

function MonthStatusPill({ month, onClick }: { month: MonthKey; onClick: () => void }) {
  const { status, needsReview } = useMonthStatus(month);
  let icon = <CircleDashed size={13} aria-hidden />;
  let label = t('status.predicted');
  let tone = 'text-label-2';
  if (status === 'confirmed' && !needsReview) {
    icon = <CircleCheck size={13} aria-hidden />;
    label = t('status.confirmed');
    tone = 'text-good';
  } else if (status === 'confirmed') {
    icon = <TriangleAlert size={13} aria-hidden />;
    label = t('status.confirmedReview');
    tone = 'text-warn';
  }
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={t('status.aria', { label })}
      className={`-ml-2 mt-0.5 flex min-h-8 items-center gap-1 rounded-full px-2 text-[13px] font-medium ${tone}`}
    >
      {icon}
      {label}
    </button>
  );
}

function MonthGrid({
  month,
  direction,
  selectedDate,
  onSelect,
}: {
  month: MonthKey;
  direction: 'next' | 'prev' | null;
  selectedDate: DateKey;
  onSelect: (date: DateKey) => void;
}) {
  const { schedule, today, data } = useApp();
  const fmt = data.settings.timeFormat;
  const first = startOfWeek(monthStart(month));
  const last = addDays(startOfWeek(monthEnd(month)), 6);
  const dates: DateKey[] = [];
  for (let d = first; d <= last; d = addDays(d, 1)) dates.push(d);
  const firstRender = useRef(true);
  const animate = !firstRender.current || direction !== null;
  firstRender.current = false;

  return (
    <div
      className={`grid grid-cols-7 gap-1 ${animate ? (direction === 'prev' ? 'anim-slide-from-left' : 'anim-slide-from-right') : ''}`}
      role="group"
      aria-label={monthYear(monthStart(month))}
    >
      {dates.map((date) => {
        const info = schedule.getDay(date);
        const inMonth = monthOf(date) === month;
        const label = cellLabel(info, fmt);
        return (
          <DayCell
            key={date}
            info={info}
            inMonth={inMonth}
            isToday={date === today}
            selected={date === selectedDate}
            label={label}
            onSelect={() => onSelect(date)}
          />
        );
      })}
    </div>
  );
}

function cellLabel(info: DayInfo, fmt: '24h' | '12h'): string {
  const parts = [`${weekdayName(info.date)}, ${longDate(info.date)}`];
  const shift = info.shifts[0];
  if (shift) {
    const when = formatRange(shift.start, shift.end, fmt);
    parts.push(`${STATE_LABEL[shift.kind]}, ${when}${shift.spillsIntoNextDay ? ` ${t('common.nextDay')}` : ''}`);
  }
  if (info.recovery) parts.push(t('cell.recovery'));
  if (!shift && !info.recovery) parts.push(t('cell.dayOff'));
  if (info.override) parts.push(t('cell.edited'));
  return parts.join('. ');
}

function DayCell({
  info,
  inMonth,
  isToday,
  selected,
  label,
  onSelect,
}: {
  info: DayInfo;
  inMonth: boolean;
  isToday: boolean;
  selected: boolean;
  label: string;
  onSelect: () => void;
}) {
  const day = Number(info.date.slice(8));
  const weekend = weekdayIndex(info.date) >= 5;
  // Work always wins the main glyph; recovery then shows beside it as a small "Zzz".
  const hasWork = info.shifts.length > 0;
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={selected}
      aria-current={isToday ? 'date' : undefined}
      onClick={onSelect}
      className={`relative flex min-h-15 flex-col items-center rounded-xl pt-1.5 transition-[background-color,box-shadow] duration-150 sm:min-h-19 ${
        inMonth ? 'bg-surface' : 'bg-surface/40'
      } ${selected ? 'ring-[1.5px] ring-label-2' : ''}`}
    >
      <span
        className={`tabular flex size-6.5 items-center justify-center rounded-full text-[16px] leading-none ${
          isToday
            ? 'bg-accent font-semibold text-white'
            : inMonth
              ? weekend
                ? 'font-medium text-label-2'
                : 'font-medium'
              : 'font-medium text-label-3'
        }`}
      >
        {day}
      </span>
      <span className={`mt-1.5 flex h-5 items-center justify-center gap-0.5 ${inMonth ? '' : 'opacity-45'}`} aria-hidden>
        {hasWork ? (
          <>
            <ShiftIndicator state={info.state} size={18} labelled={false} />
            {info.recovery && <ShiftIndicator state="after_night" size={13} labelled={false} className="text-[9px]" />}
          </>
        ) : (
          <ShiftIndicator state={info.state} size={18} labelled={false} />
        )}
      </span>
      {info.override && (
        <span className="absolute right-1.5 top-1.5 size-1.5 rounded-full bg-label-2" aria-hidden />
      )}
    </button>
  );
}
