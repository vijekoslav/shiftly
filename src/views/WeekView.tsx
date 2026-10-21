import { useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { addDays, startOfWeek } from '../engine/dates';
import type { DateKey, Shift, ShiftSegment } from '../engine/types';
import { ShiftIndicator } from '../components/ShiftIndicator';
import { formatDate, formatTime, shortDate, STATE_LABEL, weekdayName } from '../lib/format';
import { t } from '../i18n';
import { useNowMinutes, useSwipe } from '../lib/hooks';
import { useApp } from '../state/AppProvider';

function hourLabel(h: number, fmt: '24h' | '12h'): string {
  if (fmt === '24h') return `${String(h).padStart(2, '0')}:00`;
  const suffix = h % 24 >= 12 ? 'PM' : 'AM';
  return `${h % 12 === 0 ? 12 : h % 12} ${suffix}`;
}

const HOURS = Array.from({ length: 13 }, (_, i) => i * 2); // 00, 02 … 24

interface Props {
  weekStart: DateKey;
  onWeekChange: (weekStart: DateKey) => void;
  onOpenShift: (shift: Shift) => void;
}

export function WeekView({ weekStart, onWeekChange, onOpenShift }: Props) {
  const { schedule, today, data } = useApp();
  const fmt = data.settings.timeFormat;
  const nowMin = useNowMinutes();
  const [direction, setDirection] = useState<'next' | 'prev' | null>(null);
  const first = useRef(true);
  const animate = !first.current || direction !== null;
  first.current = false;

  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const last = days[6];
  const segments = schedule.getSegments(weekStart, last);

  const go = (n: number) => {
    setDirection(n > 0 ? 'next' : 'prev');
    onWeekChange(addDays(weekStart, n * 7));
  };
  const goToday = () => {
    const target = startOfWeek(today);
    if (target !== weekStart) setDirection(target > weekStart ? 'next' : 'prev');
    onWeekChange(target);
  };
  const swipe = useSwipe(() => go(-1), () => go(1));

  // Year goes in the subtitle so the title stays short enough to sit beside the buttons.
  const title =
    weekStart.slice(0, 7) === last.slice(0, 7)
      ? `${formatDate(weekStart, t('fmt.weekFromSame'))} – ${formatDate(last, t('fmt.weekToSame'))}`
      : `${formatDate(weekStart, t('fmt.weekShort'))} – ${formatDate(last, t('fmt.weekShort'))}`;
  const year = weekStart.slice(0, 4) === last.slice(0, 4) ? weekStart.slice(0, 4) : `${weekStart.slice(0, 4)}/${last.slice(0, 4)}`;
  const isThisWeek = weekStart === startOfWeek(today);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-3 pb-4 md:px-6">
      <header className="flex items-end justify-between px-1 pb-2 pt-2">
        <div className="min-w-0">
          <h1 className="whitespace-nowrap text-[26px] font-bold leading-tight tracking-tight">{title}</h1>
          <p className="mt-0.5 flex items-center gap-3 text-[13px] text-label-2">
            <span className="whitespace-nowrap">{t('week.subtitle', { year, n: formatDate(weekStart, 'I') })}</span>
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={goToday}
            disabled={isThisWeek}
            className="min-h-11 rounded-full px-3 text-[15px] font-medium text-accent disabled:opacity-40"
          >
            {t('common.today')}
          </button>
          <button type="button" onClick={() => go(-1)} aria-label={t('nav.prevWeek')} className="flex size-11 items-center justify-center rounded-full text-accent active:bg-surface-2">
            <ChevronLeft size={24} />
          </button>
          <button type="button" onClick={() => go(1)} aria-label={t('nav.nextWeek')} className="flex size-11 items-center justify-center rounded-full text-accent active:bg-surface-2">
            <ChevronRight size={24} />
          </button>
        </div>
      </header>

      <div {...swipe} className="flex min-h-0 flex-1 touch-pan-y flex-col overflow-x-clip overflow-y-hidden">
        <div className="grid grid-cols-[2.25rem_repeat(7,minmax(0,1fr))] gap-px pb-1.5">
          <div />
          {days.map((d) => {
            const isToday = d === today;
            return (
              <div key={d} className="flex flex-col items-center gap-0.5 text-center" aria-label={`${weekdayName(d)} ${shortDate(d)}`}>
                <span className="text-[11px] font-semibold uppercase tracking-wide text-label-2">{formatDate(d, 'EEE')}</span>
                <span
                  className={`tabular flex size-7 items-center justify-center rounded-full text-[16px] font-medium ${
                    isToday ? 'bg-accent font-semibold text-white' : ''
                  }`}
                >
                  {Number(d.slice(8))}
                </span>
              </div>
            );
          })}
        </div>

        <div
          key={weekStart}
          className={`relative min-h-[480px] flex-1 ${animate ? (direction === 'prev' ? 'anim-slide-from-left' : 'anim-slide-from-right') : ''}`}
        >
          <div className="absolute inset-x-0 inset-y-2.5">
            {/* Hour gutter and grid lines */}
            {HOURS.map((h) => (
              <div key={h} className="pointer-events-none absolute inset-x-0" style={{ top: `${(h / 24) * 100}%` }} aria-hidden>
                <span className="tabular absolute left-0 w-9 -translate-y-1/2 text-right text-[10px] text-label-2">
                  {hourLabel(h, fmt)}
                </span>
                <div className="ml-10 border-t border-separator/70" />
              </div>
            ))}

            <div className="absolute inset-y-0 left-10 right-0 grid grid-cols-7 gap-px">
              {days.map((d) => (
                <DayColumn
                  key={d}
                  date={d}
                  isToday={d === today}
                  segments={segments.filter((s) => s.date === d)}
                  nowMin={nowMin}
                  fmt={fmt}
                  onOpen={onOpenShift}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function DayColumn({
  date,
  isToday,
  segments,
  nowMin,
  fmt,
  onOpen,
}: {
  date: DateKey;
  isToday: boolean;
  segments: ShiftSegment[];
  nowMin: number;
  fmt: '24h' | '12h';
  onOpen: (shift: Shift) => void;
}) {
  return (
    <div className={`relative border-l border-separator/70 ${isToday ? 'bg-surface/70' : ''}`}>
      {segments.map((seg) => (
        <SegmentBlock key={`${seg.shift.id}-${seg.date}`} seg={seg} fmt={fmt} onOpen={onOpen} />
      ))}
      {isToday && (
        <div
          className="pointer-events-none absolute inset-x-0 z-10 flex items-center"
          style={{ top: `${(nowMin / 1440) * 100}%` }}
          aria-hidden
        >
          <span className="-ml-[3px] size-1.5 rounded-full bg-accent" />
          <span className="h-px flex-1 bg-accent" />
        </div>
      )}
      <span className="sr-only">{weekdayName(date)}</span>
    </div>
  );
}

function SegmentBlock({ seg, fmt, onOpen }: { seg: ShiftSegment; fmt: '24h' | '12h'; onOpen: (shift: Shift) => void }) {
  const { shift } = seg;
  const top = (seg.startMin / 1440) * 100;
  const height = ((seg.endMin - seg.startMin) / 1440) * 100;
  const isDay = shift.kind === 'day';
  const label = t('week.shiftAria', {
    state: STATE_LABEL[shift.kind],
    startDate: shortDate(shift.date),
    startTime: formatTime(shift.start, fmt),
    endDate: shortDate(shift.endDate),
    endTime: formatTime(shift.end, fmt),
  });
  // Flat edges mark where an overnight shift continues across midnight.
  const radius = `${seg.isStart ? 'rounded-t-lg' : ''} ${seg.isEnd ? 'rounded-b-lg' : ''}`;

  return (
    <button
      type="button"
      aria-label={label}
      onClick={() => onOpen(shift)}
      className={`absolute inset-x-0.5 flex flex-col items-center justify-between overflow-hidden border-l-[3px] px-0.5 py-1 text-[10px] font-semibold leading-none transition-opacity active:opacity-70 ${radius} ${
        isDay ? 'border-day bg-day/25 text-day' : 'border-night bg-night/25 text-night'
      }`}
      style={{
        top: `calc(${top}% + ${seg.isStart ? 1 : 0}px)`,
        height: `calc(${height}% - ${seg.isStart ? 1 : 0}px - ${seg.isEnd ? 1 : 0}px)`,
      }}
    >
      <span className="flex flex-col items-center gap-1">
        <ShiftIndicator state={shift.kind} size={13} labelled={false} />
        {seg.isStart && <span className="tabular">{formatTime(shift.start, fmt)}</span>}
      </span>
      {seg.isEnd && <span className="tabular">{formatTime(shift.end, fmt)}</span>}
    </button>
  );
}
