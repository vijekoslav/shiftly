import { Pencil } from 'lucide-react';
import type { Shift } from '../engine/types';
import { shiftDurationMinutes } from '../engine/schedule';
import { formatDuration, formatTime, shortDate, STATE_LABEL } from '../lib/format';
import { useApp } from '../state/AppProvider';
import { Sheet, SheetAction } from './Sheet';
import { ShiftIndicator, STATE_TEXT_CLASS, STATE_TINT_CLASS } from './ShiftIndicator';

/** Details for one concrete shift, opened from the weekly view. */
export function ShiftDetailsSheet({
  shift,
  onClose,
  onEdit,
}: {
  shift: Shift;
  onClose: () => void;
  onEdit: () => void;
}) {
  const { data, schedule } = useApp();
  const fmt = data.settings.timeFormat;
  const override = schedule.getOverride(shift.date);
  const rotation = schedule.getRotationShiftSpec(shift.date);

  return (
    <Sheet
      title="Shift"
      onClose={onClose}
      leading={
        <SheetAction onClick={onClose} bold={false}>
          Close
        </SheetAction>
      }
      trailing={
        <SheetAction onClick={onEdit}>
          <span className="flex items-center gap-1.5">
            <Pencil size={15} aria-hidden />
            Edit
          </span>
        </SheetAction>
      }
    >
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <div className={`flex size-12 items-center justify-center rounded-xl ${STATE_TINT_CLASS[shift.kind]}`} aria-hidden>
            <ShiftIndicator state={shift.kind} size={24} labelled={false} />
          </div>
          <div>
            <p className={`text-[20px] font-semibold leading-tight ${STATE_TEXT_CLASS[shift.kind]}`}>{STATE_LABEL[shift.kind]}</p>
            <p className="tabular text-[14px] text-label-2">{formatDuration(shiftDurationMinutes(shift))}</p>
          </div>
        </div>

        <dl className="divide-y divide-separator overflow-hidden rounded-2xl bg-surface text-[15px]">
          <Row label="Starts" value={`${shortDate(shift.date)}, ${formatTime(shift.start, fmt)}`} />
          <Row label="Ends" value={`${shortDate(shift.endDate)}, ${formatTime(shift.end, fmt)}`} />
          <Row
            label="Source"
            value={
              shift.source === 'override'
                ? 'Edited manually'
                : 'From rotation'
            }
          />
        </dl>

        {shift.spillsIntoNextDay && (
          <p className="px-1 text-[13px] text-label-2">
            This is one shift that runs past midnight. After it ends you are in recovery on {shortDate(shift.endDate)}.
          </p>
        )}
        {override && rotation && override.shift !== undefined && (
          <p className="px-1 text-[13px] text-label-2">
            The rotation would have {STATE_LABEL[rotation.kind]} {formatTime(rotation.start, fmt)}–{formatTime(rotation.end, fmt)} here.
          </p>
        )}
        {override && !rotation && override.shift && (
          <p className="px-1 text-[13px] text-label-2">This is an extra shift on a day the rotation leaves free.</p>
        )}
        {override?.note && <p className="rounded-2xl bg-surface px-4 py-3 text-[15px]">{override.note}</p>}
      </div>
    </Sheet>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-h-12 items-center justify-between gap-4 px-4">
      <dt className="text-label-2">{label}</dt>
      <dd className="tabular text-right font-medium">{value}</dd>
    </div>
  );
}
