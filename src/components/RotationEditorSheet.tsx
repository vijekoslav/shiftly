import { useMemo, useState } from 'react';
import { Minus, Plus, RotateCcw, TriangleAlert } from 'lucide-react';
import { addDays, isValidDateKey, isValidTime } from '../engine/dates';
import {
  BEGINNING_OF_TIME,
  DEFAULT_PATTERN,
  periodEnd,
  periodFor,
  upsertPeriod,
} from '../engine/rotation';
import { Schedule } from '../engine/schedule';
import type { DateKey, PatternStep, RotationPeriod } from '../engine/types';
import { describeStep, formatDate, longDate, STATE_LABEL } from '../lib/format';
import { useApp } from '../state/AppProvider';
import { Sheet, SheetAction } from './Sheet';
import { ShiftIndicator } from './ShiftIndicator';
import { useUI } from './UIProvider';

interface Props {
  /** Existing period to edit, or null to create a new one. */
  period: RotationPeriod | null;
  onClose: () => void;
}

const NEXT_STEP: Record<PatternStep, PatternStep> = { day: 'night', night: 'off', off: 'day' };
const MAX_STEPS = 28;

/** Create a rotation that starts on a chosen date, or edit an existing one. */
export function RotationEditorSheet({ period, onClose }: Props) {
  const { data, actions, today } = useApp();
  const { toast, confirm } = useUI();
  const isNew = period === null;
  const isFirst = period !== null && period.effectiveFrom === data.periods[0]?.effectiveFrom && data.periods[0].id === period.id;

  const startFrom = period ?? periodFor(data.periods, today);
  const [effectiveFrom, setEffectiveFrom] = useState<DateKey>(isNew ? today : period.effectiveFrom);
  const [anchor, setAnchor] = useState<DateKey>(isNew ? today : period.anchor);
  const [anchorTouched, setAnchorTouched] = useState(!isNew);
  const [pattern, setPattern] = useState<PatternStep[]>([...startFrom.pattern]);
  const [dayStart, setDayStart] = useState(startFrom.day.start);
  const [dayEnd, setDayEnd] = useState(startFrom.day.end);
  const [nightStart, setNightStart] = useState(startFrom.night.start);
  const [nightEnd, setNightEnd] = useState(startFrom.night.end);

  const datesValid = isValidDateKey(anchor) && (isFirst || isValidDateKey(effectiveFrom));
  const timesValid =
    [dayStart, dayEnd, nightStart, nightEnd].every(isValidTime) && dayStart !== dayEnd && nightStart !== nightEnd;
  const valid = datesValid && timesValid && pattern.length >= 1;

  const draft: RotationPeriod = useMemo(
    () => ({
      id: period?.id ?? `rotation-${Date.now().toString(36)}`,
      effectiveFrom: isFirst ? BEGINNING_OF_TIME : effectiveFrom,
      anchor,
      pattern,
      day: { start: dayStart, end: dayEnd },
      night: { start: nightStart, end: nightEnd },
    }),
    // The id for a new rotation is generated once per render; stable enough for previews.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [period?.id, isFirst, effectiveFrom, anchor, pattern, dayStart, dayEnd, nightStart, nightEnd],
  );

  const analysis = useMemo(() => {
    if (!valid) return null;
    const periods = upsertPeriod(data.periods, draft);
    const saved = periods.find((p) => p.id === draft.id) ?? draft;
    const end = periodEnd(periods, saved);
    const rotationOnly = new Schedule(periods, []);
    const inRange = data.overrides.filter((o) => o.date >= saved.effectiveFrom && (end === null || o.date < end));
    const conflicting = inRange.filter((o) => !rotationOnly.isRedundantOverride(o));
    const replaced = data.periods.find((p) => p.id !== draft.id && p.effectiveFrom === draft.effectiveFrom);
    const previewStart = isFirst ? today : effectiveFrom;
    const preview = Array.from({ length: 14 }, (_, i) => rotationOnly.getDay(addDays(previewStart, i)));
    return { conflicting, replaced, preview, end };
  }, [valid, data.periods, data.overrides, draft, isFirst, today, effectiveFrom]);

  const setEffective = (v: DateKey) => {
    setEffectiveFrom(v);
    if (!anchorTouched && isValidDateKey(v)) setAnchor(v);
  };

  const resetPattern = () => {
    setPattern([...DEFAULT_PATTERN]);
    setDayStart('08:00');
    setDayEnd('20:00');
    setNightStart('20:00');
    setNightEnd('08:00');
  };

  const save = async () => {
    if (!valid || !analysis) return;
    const warnings: string[] = [];
    if (isFirst) warnings.push('This changes the schedule for every date before the next rotation, including the past.');
    if (analysis.replaced) warnings.push(`It replaces the rotation that starts on ${longDate(draft.effectiveFrom)}.`);
    if (analysis.conflicting.length > 0) {
      warnings.push(
        `${analysis.conflicting.length} manual ${analysis.conflicting.length === 1 ? 'change falls' : 'changes fall'} in this range. They are kept and still take precedence.`,
      );
    }
    if (warnings.length > 0) {
      const ok = await confirm({ title: 'Save this rotation?', message: warnings.join('\n\n'), confirmLabel: 'Save' });
      if (!ok) return;
    }
    actions.savePeriod(draft);
    toast(isNew ? 'Rotation added' : 'Rotation saved');
    onClose();
  };

  const remove = async () => {
    if (!period || isFirst) return;
    const ok = await confirm({
      title: 'Delete this rotation?',
      message: `Dates from ${longDate(period.effectiveFrom)} on will follow the previous rotation again. Manual changes are kept.`,
      confirmLabel: 'Delete',
    });
    if (!ok) return;
    actions.deletePeriod(period.id);
    toast('Rotation deleted');
    onClose();
  };

  return (
    <Sheet
      title={isNew ? 'New rotation' : 'Edit rotation'}
      onClose={onClose}
      trailing={
        <SheetAction onClick={save} disabled={!valid}>
          Save
        </SheetAction>
      }
    >
      <div className="space-y-5">
        <Group label="Dates">
          {isFirst ? (
            <Row label="Applies from">
              <span className="text-label-2">The beginning</span>
            </Row>
          ) : (
            <Row label="Effective from" htmlFor="rot-from">
              <input
                id="rot-from"
                type="date"
                value={effectiveFrom}
                onChange={(e) => e.target.value && setEffective(e.target.value)}
                className="tabular rounded-lg bg-surface-2 px-3 py-1.5 text-label focus:outline-none"
              />
            </Row>
          )}
          <Row label="Reference date" htmlFor="rot-anchor" hint="Step 1 of the pattern falls on this date.">
            <input
              id="rot-anchor"
              type="date"
              value={anchor}
              onChange={(e) => {
                if (!e.target.value) return;
                setAnchor(e.target.value);
                setAnchorTouched(true);
              }}
              className="tabular rounded-lg bg-surface-2 px-3 py-1.5 text-label focus:outline-none"
            />
          </Row>
        </Group>

        <div>
          <SectionLabel>Pattern</SectionLabel>
          <div className="rounded-2xl bg-surface p-3">
            <ol className="grid grid-cols-4 gap-2 sm:grid-cols-6" aria-label="Rotation steps, one per day">
              {pattern.map((_, i) => {
                const state = describeStep(pattern, i);
                return (
                  <li key={i}>
                    <button
                      type="button"
                      onClick={() => setPattern((p) => p.map((s, j) => (j === i ? NEXT_STEP[s] : s)))}
                      aria-label={`Day ${i + 1}: ${STATE_LABEL[state]}. Tap to change.`}
                      className="flex min-h-[68px] w-full flex-col items-center justify-center gap-1 rounded-xl bg-surface-2 active:bg-surface-3"
                    >
                      <span className="text-[10px] font-medium text-label-2">Day {i + 1}</span>
                      <span className="flex h-5 items-center">
                        {state === 'off' ? <span className="size-2 rounded-full bg-label-3" aria-hidden /> : <ShiftIndicator state={state} size={18} labelled={false} />}
                      </span>
                      <span className="text-[10px] font-medium text-label-2">
                        {state === 'after_night' ? 'After night' : state === 'off' ? 'Off' : state === 'day' ? 'Day' : 'Night'}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ol>
            <div className="mt-3 flex items-center justify-between">
              <p className="text-[12px] text-label-2">Tap a day to switch Day, Night or Off. A day off after a night is shown as After night.</p>
              <div className="flex shrink-0 gap-2">
                <button
                  type="button"
                  aria-label="Remove last day"
                  disabled={pattern.length <= 1}
                  onClick={() => setPattern((p) => p.slice(0, -1))}
                  className="flex size-11 items-center justify-center rounded-full bg-surface-2 text-accent disabled:text-label-3"
                >
                  <Minus size={18} />
                </button>
                <button
                  type="button"
                  aria-label="Add a day"
                  disabled={pattern.length >= MAX_STEPS}
                  onClick={() => setPattern((p) => [...p, 'off'])}
                  className="flex size-11 items-center justify-center rounded-full bg-surface-2 text-accent disabled:text-label-3"
                >
                  <Plus size={18} />
                </button>
              </div>
            </div>
          </div>
        </div>

        <Group label="Shift times">
          <TimePair label="Day shift" idPrefix="day" start={dayStart} end={dayEnd} onStart={setDayStart} onEnd={setDayEnd} />
          <TimePair label="Night shift" idPrefix="night" start={nightStart} end={nightEnd} onStart={setNightStart} onEnd={setNightEnd} />
          {!timesValid && <p className="px-4 py-2 text-[13px] text-accent">Start and end times must be valid and different.</p>}
        </Group>

        {analysis && (
          <div>
            <SectionLabel>Preview, 14 days from {formatDate(isFirst ? today : effectiveFrom, 'MMM d')}</SectionLabel>
            <div className="scroll-y -mx-1 flex gap-1 overflow-x-auto px-1 pb-1">
              {analysis.preview.map((d) => (
                <div key={d.date} className="flex w-11 shrink-0 flex-col items-center rounded-xl bg-surface py-1.5">
                  <span className="text-[10px] font-medium uppercase text-label-2">{formatDate(d.date, 'EEEEE')}</span>
                  <span className="tabular text-[14px] font-medium">{Number(d.date.slice(8))}</span>
                  <span className="mt-0.5 flex h-4 items-center">
                    <ShiftIndicator state={d.state} size={14} />
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {analysis && (isFirst || analysis.conflicting.length > 0 || analysis.replaced) && (
          <div className="space-y-1.5 rounded-2xl bg-warn/10 p-4 text-[13px]">
            <p className="flex items-center gap-1.5 font-semibold text-warn">
              <TriangleAlert size={15} aria-hidden /> Before you save
            </p>
            {isFirst && <p>This rotation also covers past dates. To change only from a date onward, create a new rotation instead.</p>}
            {analysis.replaced && <p>It replaces the rotation that starts on {longDate(draft.effectiveFrom)}.</p>}
            {analysis.conflicting.length > 0 && (
              <p>
                {analysis.conflicting.length} manual {analysis.conflicting.length === 1 ? 'change' : 'changes'} in this range (
                {analysis.conflicting
                  .slice(0, 3)
                  .map((o) => formatDate(o.date, 'MMM d'))
                  .join(', ')}
                {analysis.conflicting.length > 3 ? '…' : ''}) will be kept and still override the rotation.
              </p>
            )}
          </div>
        )}

        <button
          type="button"
          onClick={resetPattern}
          className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-surface text-[16px] font-medium text-accent active:bg-surface-2"
        >
          <RotateCcw size={17} aria-hidden /> Reset pattern and times to default
        </button>

        {!isNew && !isFirst && (
          <button
            type="button"
            onClick={remove}
            className="min-h-12 w-full rounded-xl bg-surface text-[16px] font-medium text-accent active:bg-surface-2"
          >
            Delete rotation
          </button>
        )}
      </div>
    </Sheet>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <h3 className="mb-1.5 px-1 text-[13px] font-medium uppercase tracking-wide text-label-2">{children}</h3>;
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <SectionLabel>{label}</SectionLabel>
      <div className="divide-y divide-separator overflow-hidden rounded-2xl bg-surface">{children}</div>
    </div>
  );
}

function Row({ label, htmlFor, hint, children }: { label: string; htmlFor?: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="px-4 py-2">
      <div className="flex min-h-11 items-center justify-between gap-3">
        <label htmlFor={htmlFor} className="text-[16px]">
          {label}
        </label>
        {children}
      </div>
      {hint && <p className="-mt-1 pb-1 text-[12px] text-label-2">{hint}</p>}
    </div>
  );
}

function TimePair({
  label,
  idPrefix,
  start,
  end,
  onStart,
  onEnd,
}: {
  label: string;
  idPrefix: string;
  start: string;
  end: string;
  onStart: (v: string) => void;
  onEnd: (v: string) => void;
}) {
  const input = (id: string, value: string, onChange: (v: string) => void, aria: string) => (
    <input
      id={id}
      aria-label={aria}
      type="time"
      value={value}
      onChange={(e) => e.target.value && onChange(e.target.value)}
      className="tabular rounded-lg bg-surface-2 px-2 py-1.5 text-label focus:outline-none"
    />
  );
  return (
    <div className="flex min-h-12 items-center justify-between gap-2 px-4 py-2">
      <span className="text-[16px]">{label}</span>
      <span className="flex items-center gap-1.5">
        {input(`${idPrefix}-start`, start, onStart, `${label} start`)}
        <span className="text-label-2" aria-hidden>
          –
        </span>
        {input(`${idPrefix}-end`, end, onEnd, `${label} end`)}
      </span>
    </div>
  );
}
