import { useRef, useState, type ReactNode } from 'react';
import { ChevronRight, Download, Plus, RefreshCw, Trash2, Upload } from 'lucide-react';
import { BEGINNING_OF_TIME, periodEnd, periodFor } from '../engine/rotation';
import { monthStart } from '../engine/dates';
import type { MonthConfirmation, PatternStep, RotationPeriod, ThemePreference, TimeFormat } from '../engine/types';
import { ImportSheet } from '../components/ImportSheet';
import { RotationEditorSheet } from '../components/RotationEditorSheet';
import { Segmented } from '../components/Segmented';
import { ShiftIndicator } from '../components/ShiftIndicator';
import { useUI } from '../components/UIProvider';
import { exportBackupFile, getLastExport, readFileAsText } from '../lib/files';
import { describeStep, formatDate, formatRange, longDate } from '../lib/format';
import { applyUpdate, checkForUpdate, usePWAState } from '../lib/pwa';
import { parseBackup, type BackupFile } from '../storage/backup';
import { useApp } from '../state/AppProvider';

export function SettingsView() {
  const { data, actions, today, storageWarning } = useApp();
  const { toast, confirm } = useUI();
  const pwa = usePWAState();
  const fileInput = useRef<HTMLInputElement>(null);
  const [editing, setEditing] = useState<{ period: RotationPeriod | null } | null>(null);
  const [pendingImport, setPendingImport] = useState<{ backup: BackupFile; fileName: string } | null>(null);
  const [checking, setChecking] = useState(false);
  const [lastExport, setLastExport] = useState(getLastExport);
  const fmt = data.settings.timeFormat;
  const current = periodFor(data.periods, today);

  const doExport = async () => {
    const stamp = formatDate(today, 'yyyy-MM-dd');
    const result = await exportBackupFile(actions.exportData(), `shiftly-backup-${stamp}.json`);
    setLastExport(getLastExport());
    if (result === 'downloaded') toast('Backup saved to your downloads');
    if (result === 'shared') toast('Backup exported');
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      if (file.size > 10 * 1024 * 1024) throw new Error('too large');
      const text = await readFileAsText(file);
      const parsed = parseBackup(text);
      if (!parsed.ok) {
        await confirm({
          title: 'Can’t use this file',
          message: parsed.errors.join('\n'),
          infoOnly: true,
        });
        return;
      }
      setPendingImport({ backup: parsed.backup, fileName: file.name });
    } catch {
      await confirm({ title: 'Can’t read this file', message: 'Choose a Shiftly backup (.json) exported from this app.', infoOnly: true });
    } finally {
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  const doCheck = async () => {
    setChecking(true);
    const result = await checkForUpdate();
    setChecking(false);
    if (result === 'unsupported') toast('Updates are checked in the installed app');
    else if (result === 'current') toast('Shiftly is up to date');
  };

  const eraseAll = async () => {
    const ok = await confirm({
      title: 'Erase all data?',
      message: 'This removes your rotation changes, manual shifts, confirmations and settings from this device and restores the defaults. Export a backup first if you may need it.',
      confirmLabel: 'Erase',
    });
    if (!ok) return;
    await actions.resetAll();
    toast('All data erased');
  };

  const confirmed = [...data.confirmations].sort((a, b) => b.month.localeCompare(a.month));

  return (
    <div className="mx-auto w-full max-w-xl space-y-7 px-4 pb-10 pt-2">
      <h1 className="px-1 text-[32px] font-bold leading-tight tracking-tight">Settings</h1>

      {storageWarning && <p className="rounded-2xl bg-warn/10 p-4 text-[14px] text-warn">{storageWarning}</p>}

      <Section title="Appearance">
        <div className="space-y-3 p-3">
          <Segmented<ThemePreference>
            label="Theme"
            value={data.settings.theme}
            onChange={actions.setTheme}
            options={[
              { value: 'system', label: 'System' },
              { value: 'dark', label: 'Dark' },
              { value: 'light', label: 'Light' },
            ]}
          />
          <Segmented<TimeFormat>
            label="Time format"
            value={data.settings.timeFormat}
            onChange={actions.setTimeFormat}
            options={[
              { value: '24h', label: '24-hour' },
              { value: '12h', label: '12-hour' },
            ]}
          />
        </div>
      </Section>

      <Section
        title="Rotation"
        footer="Edits to the current rotation also change past dates. To change the pattern only from a date onward, add a new rotation (handy for summer staffing). Manual changes are never overwritten."
      >
        <div className="p-4">
          <PatternChips period={current} />
          <dl className="mt-3 space-y-1 text-[14px]">
            <div className="flex justify-between gap-3">
              <dt className="text-label-2">Reference date</dt>
              <dd className="tabular font-medium">{longDate(current.anchor)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-label-2">Day shift</dt>
              <dd className="tabular font-medium">{formatRange(current.day.start, current.day.end, fmt)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-label-2">Night shift</dt>
              <dd className="tabular font-medium">{formatRange(current.night.start, current.night.end, fmt)}</dd>
            </div>
          </dl>
        </div>
        <Row onClick={() => setEditing({ period: current })} label="Edit current rotation" />
        <Row
          onClick={() => setEditing({ period: null })}
          label="New rotation from a date…"
          icon={<Plus size={18} className="text-accent" aria-hidden />}
        />
      </Section>

      {data.periods.length > 1 && (
        <Section title="Rotation history">
          {data.periods.map((p) => {
            const end = periodEnd(data.periods, p);
            const active = p.id === current.id;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => setEditing({ period: p })}
                className="flex min-h-14 w-full items-center gap-3 px-4 py-2.5 text-left active:bg-surface-2"
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-[16px]">
                    {p.effectiveFrom === BEGINNING_OF_TIME ? 'Beginning' : formatDate(p.effectiveFrom, 'MMM d, yyyy')}
                    {end ? ` → ${formatDate(end, 'MMM d, yyyy')}` : ' → ongoing'}
                  </span>
                  <span className="block text-[13px] text-label-2">
                    {p.pattern.length}-day cycle{active ? ' · in use today' : ''}
                  </span>
                </span>
                <ChevronRight size={18} className="shrink-0 text-label-3" aria-hidden />
              </button>
            );
          })}
        </Section>
      )}

      <Section
        title="Monthly schedule"
        footer="Months start as predicted. Tap the status under the month title to confirm it once you have checked the official roster."
      >
        {confirmed.length === 0 ? (
          <p className="px-4 py-5 text-center text-[14px] text-label-2">No months confirmed yet.</p>
        ) : (
          confirmed.map((c) => <ConfirmedRow key={c.month} confirmation={c} />)
        )}
      </Section>

      <Section
        title="Backup & restore"
        footer={`iOS can clear website data if the app is unused for a long time or storage runs low. Export a backup now and then. ${
          lastExport ? `Last export: ${new Date(lastExport).toLocaleDateString()}.` : 'You have not exported a backup yet.'
        }`}
      >
        <Row onClick={doExport} label="Export all data (JSON)" icon={<Download size={18} className="text-accent" aria-hidden />} />
        <Row
          onClick={() => fileInput.current?.click()}
          label="Restore from a backup…"
          icon={<Upload size={18} className="text-accent" aria-hidden />}
        />
        <input
          ref={fileInput}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(e) => void onFile(e.target.files?.[0])}
          aria-label="Choose a backup file"
        />
      </Section>

      <Section title="About">
        <InfoRow label="Version" value={__APP_VERSION__} />
        <InfoRow label="Data" value="Stored only on this device" />
        <InfoRow label="Offline" value={pwa.offlineReady || isStandaloneOrCached() ? 'Ready' : 'Available after first load'} />
        {pwa.needRefresh ? (
          <Row onClick={() => void applyUpdate()} label="Update available — install now" icon={<RefreshCw size={18} className="text-accent" aria-hidden />} />
        ) : (
          <Row
            onClick={() => void doCheck()}
            label={checking ? 'Checking…' : 'Check for updates'}
            icon={<RefreshCw size={18} className={`text-accent ${checking ? 'animate-spin' : ''}`} aria-hidden />}
          />
        )}
        <Row onClick={eraseAll} label="Erase all data" destructive icon={<Trash2 size={18} aria-hidden />} />
      </Section>

      <p className="px-4 text-center text-[12px] text-label-3">Shiftly · no accounts, no tracking, no server.</p>

      {pendingImport && <ImportSheet {...pendingImport} onClose={() => setPendingImport(null)} />}
      {editing && <RotationEditorSheet period={editing.period} onClose={() => setEditing(null)} />}
    </div>
  );
}

function isStandaloneOrCached(): boolean {
  return 'serviceWorker' in navigator && !!navigator.serviceWorker.controller;
}

function PatternChips({ period }: { period: RotationPeriod }) {
  return (
    <ol className="flex flex-wrap items-center gap-1.5" aria-label="Rotation pattern">
      {period.pattern.map((_: PatternStep, i: number) => {
        const state = describeStep(period.pattern, i);
        return (
          <li key={i} className="flex items-center gap-1.5">
            <span className="flex h-9 min-w-9 items-center justify-center rounded-lg bg-surface-2 px-2" aria-label={`Day ${i + 1}`}>
              {state === 'off' ? <span className="size-2 rounded-full bg-label-3" role="img" aria-label="Day off" /> : <ShiftIndicator state={state} size={17} />}
            </span>
            {i < period.pattern.length - 1 && (
              <span className="text-label-3" aria-hidden>
                →
              </span>
            )}
          </li>
        );
      })}
      <li className="text-[13px] text-label-2">then repeats</li>
    </ol>
  );
}

function ConfirmedRow({ confirmation }: { confirmation: MonthConfirmation }) {
  const { actions } = useApp();
  const { toast } = useUI();
  return (
    <div className="flex min-h-12 items-center justify-between gap-3 px-4 py-2">
      <div>
        <p className="text-[16px]">{formatDate(monthStart(confirmation.month), 'MMMM yyyy')}</p>
        <p className={`text-[12px] ${confirmation.needsReview ? 'text-warn' : 'text-good'}`}>
          {confirmation.needsReview ? 'Edited since confirmed' : 'Confirmed'}
        </p>
      </div>
      <button
        type="button"
        onClick={() => {
          actions.unconfirmMonth(confirmation.month);
          toast('Marked as predicted');
        }}
        className="min-h-11 px-2 text-[15px] text-accent"
      >
        Unconfirm
      </button>
    </div>
  );
}

function Section({ title, footer, children }: { title: string; footer?: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="mb-1.5 px-4 text-[13px] font-medium uppercase tracking-wide text-label-2">{title}</h2>
      <div className="divide-y divide-separator overflow-hidden rounded-2xl bg-surface">{children}</div>
      {footer && <p className="mt-1.5 px-4 text-[12px] leading-snug text-label-2">{footer}</p>}
    </section>
  );
}

function Row({
  label,
  onClick,
  icon,
  destructive,
}: {
  label: string;
  onClick: () => void;
  icon?: ReactNode;
  destructive?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex min-h-12 w-full items-center gap-3 px-4 text-left text-[16px] active:bg-surface-2 ${destructive ? 'text-accent' : ''}`}
    >
      {icon}
      <span className="flex-1">{label}</span>
      {!icon && <ChevronRight size={18} className="text-label-3" aria-hidden />}
    </button>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-h-12 items-center justify-between gap-3 px-4 text-[16px]">
      <span>{label}</span>
      <span className="text-right text-label-2">{value}</span>
    </div>
  );
}
