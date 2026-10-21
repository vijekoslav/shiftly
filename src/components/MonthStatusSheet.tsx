import { CircleCheck, CircleDashed, TriangleAlert } from 'lucide-react';
import type { MonthKey } from '../engine/types';
import { monthYear } from '../lib/format';
import { monthStart } from '../engine/dates';
import { localeTag, t, tn } from '../i18n';
import { useApp, useMonthStatus } from '../state/AppProvider';
import { useUI } from './UIProvider';
import { Sheet } from './Sheet';

/** Confirm or unconfirm a month against the official roster. */
export function MonthStatusSheet({ month, onClose }: { month: MonthKey; onClose: () => void }) {
  const { actions, data } = useApp();
  const { toast } = useUI();
  const { status, needsReview } = useMonthStatus(month);
  const confirmation = data.confirmations.find((c) => c.month === month);
  const name = monthYear(monthStart(month));
  const editedCount = data.overrides.filter((o) => o.date.startsWith(month)).length;

  const confirm = () => {
    actions.confirmMonth(month);
    toast(t('ms.toastConfirmed', { month: name }));
    onClose();
  };
  const unconfirm = () => {
    actions.unconfirmMonth(month);
    toast(t('ms.toastPredicted', { month: name }));
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
                <p className="font-semibold">{t('status.predicted')}</p>
                <p className="mt-1 text-label-2">
                  {t('ms.predictedBody')}
                </p>
              </>
            )}
            {status === 'confirmed' && !needsReview && (
              <>
                <p className="font-semibold">{t('status.confirmed')}</p>
                <p className="mt-1 text-label-2">
                  {confirmation
                    ? t('ms.confirmedBodyDate', { date: new Date(confirmation.confirmedAt).toLocaleDateString(localeTag()) })
                    : t('ms.confirmedBody')}
                </p>
              </>
            )}
            {status === 'confirmed' && needsReview && (
              <>
                <p className="font-semibold">{t('ms.reviewTitle')}</p>
                <p className="mt-1 text-label-2">
                  {t('ms.reviewBody')}
                </p>
              </>
            )}
          </div>
        </div>

        {editedCount > 0 && (
          <p className="px-1 text-[13px] text-label-2">
            {tn('ms.editedCount', editedCount)}
          </p>
        )}

        <div className="space-y-2">
          {(status === 'predicted' || needsReview) && (
            <button
              type="button"
              onClick={confirm}
              className="min-h-12 w-full rounded-xl bg-accent text-[17px] font-semibold text-white active:opacity-80"
            >
              {needsReview ? t('ms.confirmAgain') : t('ms.confirm')}
            </button>
          )}
          {status === 'confirmed' && (
            <button
              type="button"
              onClick={unconfirm}
              className="min-h-12 w-full rounded-xl bg-surface text-[17px] font-medium text-accent active:bg-surface-2"
            >
              {t('ms.markPredicted')}
            </button>
          )}
        </div>
      </div>
    </Sheet>
  );
}
