import { CircleCheck, CircleDashed, TriangleAlert } from 'lucide-react';
import type { MonthKey } from '../engine/types';
import { formatDate } from '../lib/format';
import { monthStart } from '../engine/dates';
import { useApp, useMonthStatus } from '../state/AppProvider';
import { useUI } from './UIProvider';
import { Sheet } from './Sheet';

/** Confirm or unconfirm a month against the official roster. */
export function MonthStatusSheet({ month, onClose }: { month: MonthKey; onClose: () => void }) {
  const { actions, data } = useApp();
  const { toast } = useUI();
  const { status, needsReview } = useMonthStatus(month);
  const confirmation = data.confirmations.find((c) => c.month === month);
  const name = formatDate(monthStart(month), 'MMMM yyyy');
  const editedCount = data.overrides.filter((o) => o.date.startsWith(month)).length;

  const confirm = () => {
    actions.confirmMonth(month);
    toast(`${name} confirmed`);
    onClose();
  };
  const unconfirm = () => {
    actions.unconfirmMonth(month);
    toast(`${name} marked as predicted`);
    onClose();
  };

  return (
    <Sheet title={name} onClose={onClose}>
      <div className="space-y-4">
        <div className="flex items-start gap-3 rounded-2xl bg-surface p-4">
          {status === 'predicted' && <CircleDashed className="mt-0.5 shrink-0 text-label-2" size={22} aria-hidden />}
          {status === 'confirmed' && !needsReview && <CircleCheck className="mt-0.5 shrink-0 text-good" size={22} aria-hidden />}
          {status === 'confirmed' && needsReview && <TriangleAlert className="mt-0.5 shrink-0 text-warn" size={22} aria-hidden />}
          <div className="text-[15px]">
            {status === 'predicted' && (
              <>
                <p className="font-semibold">Predicted</p>
                <p className="mt-1 text-label-2">
                  Calculated from your rotation and not yet checked against the official work roster.
                </p>
              </>
            )}
            {status === 'confirmed' && !needsReview && (
              <>
                <p className="font-semibold">Confirmed</p>
                <p className="mt-1 text-label-2">
                  You checked this month against the official roster
                  {confirmation ? ` on ${new Date(confirmation.confirmedAt).toLocaleDateString()}` : ''}.
                </p>
              </>
            )}
            {status === 'confirmed' && needsReview && (
              <>
                <p className="font-semibold">Confirmed, but changed since</p>
                <p className="mt-1 text-label-2">
                  Shifts in this month were edited after you confirmed it. Your edits are kept. Check the month against the
                  roster again, then confirm it.
                </p>
              </>
            )}
          </div>
        </div>

        {editedCount > 0 && (
          <p className="px-1 text-[13px] text-label-2">
            {editedCount} {editedCount === 1 ? 'day has' : 'days have'} manual changes this month.
          </p>
        )}

        <div className="space-y-2">
          {(status === 'predicted' || needsReview) && (
            <button
              type="button"
              onClick={confirm}
              className="min-h-12 w-full rounded-xl bg-accent text-[17px] font-semibold text-white active:opacity-80"
            >
              {needsReview ? 'Confirm again' : 'Mark as confirmed'}
            </button>
          )}
          {status === 'confirmed' && (
            <button
              type="button"
              onClick={unconfirm}
              className="min-h-12 w-full rounded-xl bg-surface text-[17px] font-medium text-accent active:bg-surface-2"
            >
              Mark as predicted
            </button>
          )}
        </div>
      </div>
    </Sheet>
  );
}
