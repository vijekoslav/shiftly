import { Pencil } from 'lucide-react';
import { addDays } from '../engine/dates';
import type { DateKey, DayInfo, Shift } from '../engine/types';
import { formatDuration, formatRange, formatTime, longDate, STATE_LABEL, weekdayName } from '../lib/format';
import { shiftDurationMinutes } from '../engine/schedule';
import { useApp } from '../state/AppProvider';
import { ShiftIndicator, STATE_TEXT_CLASS, STATE_TINT_CLASS } from './ShiftIndicator';

/** The compact panel under the month grid describing the selected date. */
export function DayDetails({ date, onEdit }: { date: DateKey; onEdit: () => void }) {
  const { schedule, data } = useApp();
  const fmt = data.settings.timeFormat;
  const info = schedule.getDay(date);
  const shift = info.shifts[0];
  const carry = info.carryIn[0];

  return (
    <section aria-label={`Details for ${longDate(date)}`} className="anim-fade-in rounded-2xl bg-surface p-4" key={date}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-[20px] font-semibold leading-tight">{longDate(date)}</h2>
          <p className="mt-0.5 text-[14px] text-label-2">{weekdayName(date)}</p>
        </div>
        <button
          type="button"
          onClick={onEdit}
          className="flex min-h-11 items-center gap-1.5 rounded-full bg-surface-2 px-4 text-[15px] font-medium text-accent active:bg-surface-3"
        >
          <Pencil size={15} aria-hidden />
          Edit
        </button>
      </div>

      <div className="mt-3 space-y-3">
        {shift && <ShiftBlock shift={shift} fmt={fmt} />}
        {carry && (
          <StateBlock
            state="after_night"
            title={shift ? 'Recovery from last night' : STATE_LABEL.after_night}
            lines={[`Previous shift ended at ${formatTime(carry.end, fmt)}.`, shift ? 'Another shift starts today.' : 'Recovery day.']}
          />
        )}
        {!shift && !carry && <StateBlock state="off" title={STATE_LABEL.off} lines={['No scheduled work.']} />}
      </div>

      <OverrideInfo info={info} />
      {info.override?.note && (
        <p className="mt-3 rounded-xl bg-surface-2 px-3 py-2 text-[14px] text-label">{info.override.note}</p>
      )}
    </section>
  );
}

function ShiftBlock({ shift, fmt }: { shift: Shift; fmt: '24h' | '12h' }) {
  const lines = [
    shift.spillsIntoNextDay
      ? `${formatRange(shift.start, shift.end, fmt)} (next day)`
      : formatRange(shift.start, shift.end, fmt),
  ];
  lines.push(formatDuration(shiftDurationMinutes(shift)));
  return <StateBlock state={shift.kind} title={STATE_LABEL[shift.kind]} lines={lines} emphasizeFirst />;
}

function StateBlock({
  state,
  title,
  lines,
  emphasizeFirst,
}: {
  state: DayInfo['state'];
  title: string;
  lines: string[];
  emphasizeFirst?: boolean;
}) {
  return (
    <div className="flex items-center gap-3">
      <div
        className={`flex size-11 shrink-0 items-center justify-center rounded-xl ${STATE_TINT_CLASS[state]}`}
        aria-hidden
      >
        {state === 'off' ? <span className="size-2 rounded-full bg-label-3" /> : <ShiftIndicator state={state} size={22} labelled={false} />}
      </div>
      <div className="min-w-0">
        <p className={`text-[17px] font-semibold leading-tight ${STATE_TEXT_CLASS[state]}`}>{title}</p>
        {lines.map((l, i) => (
          <p key={l} className={`tabular mt-0.5 text-[14px] ${i === 0 && emphasizeFirst ? 'font-medium text-label' : 'text-label-2'}`}>
            {l}
          </p>
        ))}
      </div>
    </div>
  );
}

function OverrideInfo({ info }: { info: DayInfo }) {
  const { schedule, data } = useApp();
  if (!info.override) return null;
  const fmt = data.settings.timeFormat;
  const rotation = info.rotationShift;
  const base = rotation
    ? `${STATE_LABEL[rotation.kind]} ${formatRange(rotation.start, rotation.end, fmt)}`
    : 'Day Off';
  const changed = info.override.shift !== undefined;
  const nextDay = schedule.getDay(addDays(info.date, 1));
  return (
    <div className="mt-3 border-t border-separator pt-3 text-[13px] text-label-2">
      {changed ? (
        <p>
          <span className="font-medium text-label">Edited.</span> The rotation would have this as {base}.
        </p>
      ) : (
        <p>
          <span className="font-medium text-label">Note added.</span> The schedule follows the rotation.
        </p>
      )}
      {changed && nextDay.state !== 'off' && <p className="mt-0.5">Next day: {STATE_LABEL[nextDay.state]}.</p>}
    </div>
  );
}
