import { useMemo, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { addDays, isValidTime, timeToMinutes } from '../engine/dates';
import { periodFor } from '../engine/rotation';
import { Schedule, shiftDurationMinutes, buildShift } from '../engine/schedule';
import type { DateKey, DayState, ShiftKind, ShiftOverride, ShiftSpec } from '../engine/types';
import { formatDuration, formatRange, longDate, STATE_LABEL, weekdayName } from '../lib/format';
import { useApp } from '../state/AppProvider';
import { t } from '../i18n';
import { Segmented } from './Segmented';
import { Sheet, SheetAction } from './Sheet';
import { ShiftIndicator } from './ShiftIndicator';
import { useUI } from './UIProvider';

type Choice = 'auto' | ShiftKind | 'off';

/** Edit what happens on one date. The rotation itself is never modified. */
export function EditDaySheet({ date, onClose }: { date: DateKey; onClose: () => void }) {
  const { schedule, data, actions } = useApp();
  const { toast, confirm } = useUI();
  const fmt = data.settings.timeFormat;
  const existing = schedule.getOverride(date);
  const period = periodFor(schedule.periods, date);
  const timesFor = (kind: ShiftKind) => (kind === 'day' ? period.day : period.night);

  const initialChoice: Choice = !existing || existing.shift === undefined ? 'auto' : existing.shift === null ? 'off' : existing.shift.kind;
  const initialTimes =
    existing?.shift
      ? { start: existing.shift.start, end: existing.shift.end }
      : initialChoice === 'night'
        ? timesFor('night')
        : timesFor('day');

  const [choice, setChoice] = useState<Choice>(initialChoice);
  const [start, setStart] = useState(initialTimes.start);
  const [end, setEnd] = useState(initialTimes.end);
  const [note, setNote] = useState(existing?.note ?? '');

  const rotationShift = schedule.getRotationShiftSpec(date);
  const rotationText = rotationShift
    ? `${STATE_LABEL[rotationShift.kind]} ${formatRange(rotationShift.start, rotationShift.end, fmt)}`
    : STATE_LABEL.off;

  const pick = (next: Choice) => {
    setChoice(next);
    if (next === 'day' || next === 'night') {
      const t = timesFor(next);
      setStart(t.start);
      setEnd(t.end);
    }
  };

  const hasShift = choice === 'day' || choice === 'night';
  const timesValid = !hasShift || (isValidTime(start) && isValidTime(end) && start !== end);
  const draftShift: ShiftSpec | null | undefined =
    choice === 'auto' ? undefined : choice === 'off' ? null : { kind: choice, start, end };

  // What the engine would show with this draft applied, to preview the knock-on effect.
  const preview = useMemo(() => {
    const others = data.overrides.filter((o) => o.date !== date);
    const draft: ShiftOverride[] =
      draftShift === undefined ? others : [...others, { date, shift: draftShift, updatedAt: 0 }];
    const s = new Schedule(data.periods, draft);
    return { day: s.getDay(date), next: s.getDay(addDays(date, 1)) };
  }, [data.periods, data.overrides, date, draftShift]);

  const durationText =
    hasShift && timesValid
      ? (() => {
          const shift = buildShift(date, { kind: choice as ShiftKind, start, end }, 'override');
          return `${formatDuration(shiftDurationMinutes(shift))}${shift.endDate !== date ? t('edit.endsNextDay') : ''}`;
        })()
      : null;

  const save = () => {
    if (!timesValid) return;
    const hadChange = existing !== undefined;
    actions.saveOverride(date, { shift: draftShift, note });
    toast(choice === 'auto' && !note.trim() ? t('toast.restored') : hadChange ? t('toast.changesSaved') : t('toast.shiftUpdated'));
    onClose();
  };

  const restore = async () => {
    const ok = await confirm({
      title: t('edit.restoreTitle'),
      message: t('edit.restoreMsg', { date: longDate(date), rotation: rotationText }),
      confirmLabel: t('common.restore'),
    });
    if (!ok) return;
    actions.restoreDate(date);
    toast(t('toast.restored'));
    onClose();
  };

  const nextState = preview.next;
  const nextLine =
    nextState.state === 'off'
      ? STATE_LABEL.off
      : nextState.shifts.length > 0 && nextState.recovery
        ? t('edit.nextWithRecovery', { state: STATE_LABEL[nextState.state] })
        : STATE_LABEL[nextState.state];

  return (
    <Sheet
      title={t('edit.title')}
      onClose={onClose}
      trailing={
        <SheetAction onClick={save} disabled={!timesValid}>
          {t('common.save')}
        </SheetAction>
      }
    >
      <div className="space-y-5">
        <div>
          <h3 className="text-[20px] font-semibold leading-tight">{longDate(date)}</h3>
          <p className="mt-0.5 text-[14px] text-label-2">
            {t('edit.rotationLine', { weekday: weekdayName(date), rotation: rotationText })}
          </p>
        </div>

        <Segmented<Choice>
          label={t('edit.scheduleFor')}
          value={choice}
          onChange={pick}
          options={[
            { value: 'auto', label: t('edit.auto') },
            { value: 'day', label: <><ShiftIndicator state="day" size={15} labelled={false} />{t('edit.day')}</>, ariaLabel: t('edit.dayAria') },
            { value: 'night', label: <><ShiftIndicator state="night" size={15} labelled={false} />{t('edit.night')}</>, ariaLabel: t('edit.nightAria') },
            { value: 'off', label: t('edit.off'), ariaLabel: t('edit.offAria') },
          ]}
        />

        {choice === 'auto' && (
          <p className="text-[14px] text-label-2">{t('edit.autoNote', { rotation: rotationText })}</p>
        )}
        {choice === 'off' && (
          <p className="text-[14px] text-label-2">
            {rotationShift ? t('edit.offRemoved') : t('edit.offNone')}
          </p>
        )}

        {hasShift && (
          <div className="overflow-hidden rounded-2xl bg-surface">
            <TimeRow id="shift-start" label={t('edit.starts')} value={start} onChange={setStart} />
            <div className="ml-4 border-t border-separator" />
            <TimeRow id="shift-end" label={t('edit.ends')} value={end} onChange={setEnd} />
            <div className="border-t border-separator px-4 py-2.5 text-[13px] text-label-2">
              {!timesValid
                ? t('edit.timesMustDiffer')
                : `${durationText}${!rotationShift ? ` · ${t('edit.extraShift')}` : ''}${
                    start !== timesFor(choice as ShiftKind).start || end !== timesFor(choice as ShiftKind).end ? ` · ${t('edit.customTimes')}` : ''
                  }`}
            </div>
          </div>
        )}

        <div>
          <label htmlFor="shift-note" className="mb-1.5 block px-1 text-[13px] font-medium uppercase tracking-wide text-label-2">
            {t('edit.note')}
          </label>
          <textarea
            id="shift-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={200}
            rows={2}
            placeholder={t('edit.notePlaceholder')}
            className="w-full resize-none rounded-2xl bg-surface px-4 py-3 text-label placeholder:text-label-3 focus:outline-none"
          />
        </div>

        <div className="rounded-2xl bg-surface px-4 py-3 text-[14px]" aria-live="polite">
          <p className="text-label-2">{t('edit.after')}</p>
          <p className="mt-1">
            <span className="font-medium">{weekdayName(date)}:</span> {summary(preview.day.state, preview.day.shifts[0], fmt)}
          </p>
          <p className="mt-0.5">
            <span className="font-medium">{weekdayName(addDays(date, 1))}:</span> {nextLine}
            {nextState.recovery && nextState.shifts.length === 0 && <span className="text-label-2"> (Zzz)</span>}
          </p>
        </div>

        {existing && (
          <button
            type="button"
            onClick={restore}
            className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-surface text-[16px] font-medium text-accent active:bg-surface-2"
          >
            <RotateCcw size={17} aria-hidden />
            {t('edit.restoreBtn')}
          </button>
        )}
      </div>
    </Sheet>
  );
}

function summary(state: DayState, shift: { start: string; end: string } | undefined, fmt: '24h' | '12h') {
  if (!shift) return STATE_LABEL[state];
  return `${STATE_LABEL[state]} ${formatRange(shift.start, shift.end, fmt)}${timeToMinutes(shift.end) <= timeToMinutes(shift.start) ? ` ${t('details.nextDayParen')}` : ''}`;
}

function TimeRow({ id, label, value, onChange }: { id: string; label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex min-h-12 items-center justify-between px-4">
      <label htmlFor={id} className="text-[16px]">
        {label}
      </label>
      <input
        id={id}
        type="time"
        value={value}
        onChange={(e) => e.target.value && onChange(e.target.value)}
        className="tabular rounded-lg bg-surface-2 px-3 py-1.5 text-label focus:outline-none"
        style={{ colorScheme: 'inherit' }}
      />
    </div>
  );
}
