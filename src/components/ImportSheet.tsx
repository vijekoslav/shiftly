import { useState } from 'react';
import { TriangleAlert } from 'lucide-react';
import type { AppData } from '../engine/types';
import { summarizeData, type BackupFile } from '../storage/backup';
import { formatDate } from '../lib/format';
import { useApp } from '../state/AppProvider';
import { localeTag, t } from '../i18n';
import { Sheet, SheetAction } from './Sheet';
import { useUI } from './UIProvider';

/** Shows what a backup contains next to what is on the device before anything is replaced. */
export function ImportSheet({ backup, fileName, onClose }: { backup: BackupFile; fileName: string; onClose: () => void }) {
  const { data, actions } = useApp();
  const { toast } = useUI();
  const [busy, setBusy] = useState(false);
  const incoming = summarizeData(backup.data, backup.exportedAt);
  const current = summarizeData(data);

  const apply = async () => {
    setBusy(true);
    try {
      await actions.importData(backup.data as AppData);
      toast(t('imp.restored'));
      onClose();
    } catch {
      setBusy(false);
      toast(t('imp.failed'));
    }
  };

  const range = incoming.firstOverride
    ? `${formatDate(incoming.firstOverride, t('fmt.historyDate'))} – ${formatDate(incoming.lastOverride!, t('fmt.historyDate'))}`
    : '—';

  return (
    <Sheet
      title={t('imp.title')}
      onClose={onClose}
      trailing={
        <SheetAction onClick={apply} disabled={busy}>
          {t('imp.replace')}
        </SheetAction>
      }
    >
      <div className="space-y-4">
        <p className="px-1 text-[14px] text-label-2">
          <span className="break-all">{fileName}</span>
          {incoming.exportedAt && <> · {t('imp.exported', { date: new Date(incoming.exportedAt).toLocaleString(localeTag()) })}</>}
        </p>

        <div className="overflow-hidden rounded-2xl bg-surface text-[15px]">
          <div className="grid grid-cols-[1fr_5.5rem_5.5rem] gap-2 border-b border-separator px-4 py-2 text-[12px] font-medium uppercase tracking-wide text-label-2">
            <span />
            <span className="text-right">{t('imp.onDevice')}</span>
            <span className="text-right">{t('imp.backup')}</span>
          </div>
          <CompareRow label={t('imp.rotations')} now={current.rotations} next={incoming.rotations} />
          <CompareRow label={t('imp.manual')} now={current.overrides} next={incoming.overrides} />
          <CompareRow label={t('imp.confirmed')} now={current.confirmedMonths} next={incoming.confirmedMonths} />
        </div>

        <p className="px-1 text-[13px] text-label-2">{t('imp.span', { range })}</p>

        <div className="flex gap-2 rounded-2xl bg-warn/10 p-4 text-[13px]">
          <TriangleAlert size={16} className="mt-0.5 shrink-0 text-warn" aria-hidden />
          <p>
            {t('imp.warning')}
          </p>
        </div>
      </div>
    </Sheet>
  );
}

function CompareRow({ label, now, next }: { label: string; now: number; next: number }) {
  return (
    <div className="tabular grid grid-cols-[1fr_5.5rem_5.5rem] gap-2 px-4 py-2.5">
      <span>{label}</span>
      <span className="text-right text-label-2">{now}</span>
      <span className={`text-right font-semibold ${now === next ? '' : 'text-accent'}`}>{next}</span>
    </div>
  );
}
