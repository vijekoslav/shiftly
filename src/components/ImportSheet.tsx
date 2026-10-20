import { useState } from 'react';
import { TriangleAlert } from 'lucide-react';
import type { AppData } from '../engine/types';
import { summarizeData, type BackupFile } from '../storage/backup';
import { formatDate } from '../lib/format';
import { useApp } from '../state/AppProvider';
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
      toast('Backup restored');
      onClose();
    } catch {
      setBusy(false);
      toast('Could not restore the backup');
    }
  };

  const range = incoming.firstOverride
    ? `${formatDate(incoming.firstOverride, 'MMM d, yyyy')} – ${formatDate(incoming.lastOverride!, 'MMM d, yyyy')}`
    : '—';

  return (
    <Sheet
      title="Restore backup"
      onClose={onClose}
      trailing={
        <SheetAction onClick={apply} disabled={busy}>
          Replace
        </SheetAction>
      }
    >
      <div className="space-y-4">
        <p className="px-1 text-[14px] text-label-2">
          <span className="break-all">{fileName}</span>
          {incoming.exportedAt && <> · exported {new Date(incoming.exportedAt).toLocaleString()}</>}
        </p>

        <div className="overflow-hidden rounded-2xl bg-surface text-[15px]">
          <div className="grid grid-cols-[1fr_5.5rem_5.5rem] gap-2 border-b border-separator px-4 py-2 text-[12px] font-medium uppercase tracking-wide text-label-2">
            <span />
            <span className="text-right">On device</span>
            <span className="text-right">Backup</span>
          </div>
          <CompareRow label="Rotations" now={current.rotations} next={incoming.rotations} />
          <CompareRow label="Manual changes" now={current.overrides} next={incoming.overrides} />
          <CompareRow label="Confirmed months" now={current.confirmedMonths} next={incoming.confirmedMonths} />
        </div>

        <p className="px-1 text-[13px] text-label-2">Manual changes in the backup span: {range}</p>

        <div className="flex gap-2 rounded-2xl bg-warn/10 p-4 text-[13px]">
          <TriangleAlert size={16} className="mt-0.5 shrink-0 text-warn" aria-hidden />
          <p>
            Restoring replaces everything on this device, including your rotation, manual changes, confirmations and
            settings. This cannot be undone. Export a backup first if you might want the current data.
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
