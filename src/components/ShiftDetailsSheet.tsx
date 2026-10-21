import { Pencil } from 'lucide-react';
import type { Shift } from '../engine/types';
import { shiftDurationMinutes } from '../engine/schedule';
import { formatDuration, formatTime, shortDate, STATE_LABEL } from '../lib/format';
import { useApp } from '../state/AppProvider';
import { t } from '../i18n';
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
      title={t('sd.title')}
      onClose={onClose}
      leading={
        <SheetAction onClick={onClose} bold={false}>
          {t('common.close')}
        </SheetAction>
      }
      trailing={
        <SheetAction onClick={onEdit}>
          <span className="flex items-center gap-1.5">
            <Pencil size={15} aria-hidden />
            {t('common.edit')}
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
          <Row label={t('sd.starts')} value={`${shortDate(shift.date)}, ${formatTime(shift.start, fmt)}`} />
          <Row label={t('sd.ends')} value={`${shortDate(shift.endDate)}, ${formatTime(shift.end, fmt)}`} />
          <Row
            label={t('sd.source')}
            value={
              shift.source === 'override'
                ? t('sd.sourceEdited')
                : t('sd.sourceRotation')
            }
          />
        </dl>

        {shift.spillsIntoNextDay && (
          <p className="px-1 text-[13px] text-label-2">
            {t('sd.overnight', { date: shortDate(shift.endDate) })}
          </p>
        )}
        {override && rotation && override.shift !== undefined && (
          <p className="px-1 text-[13px] text-label-2">
            {t('sd.rotationWould', { state: STATE_LABEL[rotation.kind], range: `${formatTime(rotation.start, fmt)}–${formatTime(rotation.end, fmt)}` })}
          </p>
        )}
        {override && !rotation && override.shift && (
          <p className="px-1 text-[13px] text-label-2">{t('sd.extra')}</p>
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
