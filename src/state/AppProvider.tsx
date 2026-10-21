import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createDefaultPeriod, periodEnd, sortPeriods, upsertPeriod } from '../engine/rotation';
import { addDays, monthEnd } from '../engine/dates';
import { Schedule } from '../engine/schedule';
import type {
  AppData,
  DateKey,
  MonthConfirmation,
  MonthKey,
  RotationPeriod,
  ShiftOverride,
  ShiftSpec,
  ThemePreference,
  TimeFormat,
  Language,
} from '../engine/types';
import { DEFAULT_SETTINGS, normalizeData, serializeBackup } from '../storage/backup';
import { ShiftlyDB } from '../storage/db';
import { createMemoryRepository, createRepository, type Repository } from '../storage/repository';
import { useToday } from '../lib/hooks';
import { setLanguage, t } from '../i18n';

export interface OverrideChange {
  /** undefined: keep the rotation's shift; null: remove it; object: replace it. */
  shift?: ShiftSpec | null;
  note?: string;
}

export interface AppActions {
  saveOverride(date: DateKey, change: OverrideChange): void;
  restoreDate(date: DateKey): void;
  savePeriod(period: RotationPeriod): void;
  deletePeriod(id: string): void;
  setTheme(theme: ThemePreference): void;
  setTimeFormat(format: TimeFormat): void;
  setLanguage(language: Language): void;
  confirmMonth(month: MonthKey): void;
  unconfirmMonth(month: MonthKey): void;
  exportData(): string;
  importData(data: AppData): Promise<void>;
  resetAll(): Promise<void>;
}

interface AppContextValue {
  data: AppData;
  schedule: Schedule;
  today: DateKey;
  actions: AppActions;
  /** Set when IndexedDB is unavailable and changes will not survive a reload. */
  storageWarning: string | null;
  onSaveError: (listener: (message: string) => void) => void;
}

const AppContext = createContext<AppContextValue | null>(null);

const EMPTY_DATA: AppData = {
  settings: DEFAULT_SETTINGS,
  periods: [createDefaultPeriod()],
  overrides: [],
  confirmations: [],
};

async function openRepository(): Promise<{ repo: Repository; data: AppData; warning: string | null }> {
  try {
    const db = new ShiftlyDB();
    await db.open();
    const repo = createRepository(db);
    return { repo, data: await repo.load(), warning: null };
  } catch {
    const repo = createMemoryRepository();
    return {
      repo,
      data: await repo.load(),
      warning: t('err.storage'),
    };
  }
}

/** Flags confirmed months in `[from, to]` as needing review. Returns the changed rows. */
function flagForReview(
  confirmations: MonthConfirmation[],
  from: DateKey,
  to: DateKey | null,
): { next: MonthConfirmation[]; changed: MonthConfirmation[] } {
  const changed: MonthConfirmation[] = [];
  const next = confirmations.map((c) => {
    const inRange = monthEnd(c.month) >= from && (to === null || `${c.month}-01` < to);
    if (!inRange || c.needsReview) return c;
    const flagged = { ...c, needsReview: true };
    changed.push(flagged);
    return flagged;
  });
  return { next, changed };
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<AppData>(EMPTY_DATA);
  const [ready, setReady] = useState(false);
  const [storageWarning, setStorageWarning] = useState<string | null>(null);
  const repoRef = useRef<Repository>(createMemoryRepository());
  const dataRef = useRef<AppData>(EMPTY_DATA);
  const errorListener = useRef<(message: string) => void>(() => {});
  const today = useToday();

  useEffect(() => {
    let cancelled = false;
    openRepository().then(({ repo, data: loaded, warning }) => {
      if (cancelled) return;
      repoRef.current = repo;
      setLanguage(loaded.settings.language);
      dataRef.current = loaded;
      setData(loaded);
      setStorageWarning(warning);
      setReady(true);
      // Ask the browser not to evict our data under storage pressure (helps on iOS).
      void navigator.storage?.persist?.().catch(() => undefined);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  /** Applies a new state immediately and persists it in the background. */
  const commit = useCallback((next: AppData, persist: (repo: Repository) => Promise<unknown>) => {
    dataRef.current = next;
    setData(next);
    persist(repoRef.current).catch(() => errorListener.current(t('err.save')));
  }, []);

  const actions = useMemo<AppActions>(() => {
    const persistConfirmations = (repo: Repository, rows: MonthConfirmation[]) =>
      Promise.all(rows.map((c) => repo.saveConfirmation(c)));

    return {
      saveOverride(date, change) {
        const current = dataRef.current;
        const schedule = new Schedule(current.periods, []);
        const note = change.note?.trim() || undefined;
        const override: ShiftOverride = { date, updatedAt: Date.now() };
        if (change.shift !== undefined) override.shift = change.shift;
        if (note) override.note = note;

        // An override identical to the rotation is not an override: drop it.
        if (schedule.isRedundantOverride(override)) {
          this.restoreDate(date);
          return;
        }
        const { next: confirmations, changed } = flagForReview(current.confirmations, date, addDays(date, 1));
        commit(
          {
            ...current,
            overrides: [...current.overrides.filter((o) => o.date !== date), override],
            confirmations,
          },
          async (repo) => {
            await repo.saveOverride(override);
            await persistConfirmations(repo, changed);
          },
        );
      },

      restoreDate(date) {
        const current = dataRef.current;
        if (!current.overrides.some((o) => o.date === date)) return;
        const { next: confirmations, changed } = flagForReview(current.confirmations, date, addDays(date, 1));
        commit(
          { ...current, overrides: current.overrides.filter((o) => o.date !== date), confirmations },
          async (repo) => {
            await repo.deleteOverride(date);
            await persistConfirmations(repo, changed);
          },
        );
      },

      savePeriod(period) {
        const current = dataRef.current;
        const previous = current.periods.find((p) => p.id === period.id);
        const periods = upsertPeriod(current.periods, period);
        const from = previous && previous.effectiveFrom < period.effectiveFrom ? previous.effectiveFrom : period.effectiveFrom;
        const saved = periods.find((p) => p.id === period.id) ?? period;
        const { next: confirmations, changed } = flagForReview(current.confirmations, from, periodEnd(periods, saved));
        commit({ ...current, periods, confirmations }, async (repo) => {
          await repo.savePeriods(periods);
          await persistConfirmations(repo, changed);
        });
      },

      deletePeriod(id) {
        const current = dataRef.current;
        const sorted = sortPeriods(current.periods);
        const target = sorted.find((p) => p.id === id);
        if (!target || sorted.length <= 1) return;
        // Dates of the removed period fall back to the previous one (or, for the first, the next).
        const { next: confirmations, changed } = flagForReview(
          current.confirmations,
          target.effectiveFrom,
          periodEnd(sorted, target),
        );
        const periods = sorted.filter((p) => p.id !== id);
        if (target === sorted[0]) periods[0] = { ...periods[0], effectiveFrom: target.effectiveFrom };
        commit({ ...current, periods, confirmations }, async (repo) => {
          await repo.savePeriods(periods);
          await persistConfirmations(repo, changed);
        });
      },

      setTheme(theme) {
        const settings = { ...dataRef.current.settings, theme };
        commit({ ...dataRef.current, settings }, (repo) => repo.saveSettings(settings));
      },

      setTimeFormat(timeFormat) {
        const settings = { ...dataRef.current.settings, timeFormat };
        commit({ ...dataRef.current, settings }, (repo) => repo.saveSettings(settings));
      },

      setLanguage(language) {
        setLanguage(language);
        const settings = { ...dataRef.current.settings, language };
        commit({ ...dataRef.current, settings }, (repo) => repo.saveSettings(settings));
      },

      confirmMonth(month) {
        const confirmation: MonthConfirmation = { month, confirmedAt: Date.now(), needsReview: false };
        const current = dataRef.current;
        commit(
          { ...current, confirmations: [...current.confirmations.filter((c) => c.month !== month), confirmation] },
          (repo) => repo.saveConfirmation(confirmation),
        );
      },

      unconfirmMonth(month) {
        const current = dataRef.current;
        commit({ ...current, confirmations: current.confirmations.filter((c) => c.month !== month) }, (repo) =>
          repo.deleteConfirmation(month),
        );
      },

      exportData() {
        return serializeBackup(dataRef.current);
      },

      async importData(next) {
        const normalized = normalizeData(next);
        setLanguage(normalized.settings.language);
        dataRef.current = normalized;
        setData(normalized);
        await repoRef.current.replaceAll(normalized);
      },

      async resetAll() {
        const fresh: AppData = { ...EMPTY_DATA, periods: [createDefaultPeriod()] };
        setLanguage(fresh.settings.language);
        dataRef.current = fresh;
        setData(fresh);
        await repoRef.current.replaceAll(fresh);
      },
    };
  }, [commit]);

  const schedule = useMemo(() => new Schedule(data.periods, data.overrides), [data.periods, data.overrides]);

  const value = useMemo<AppContextValue>(
    () => ({
      data,
      schedule,
      today,
      actions,
      storageWarning,
      onSaveError: (listener) => {
        errorListener.current = listener;
      },
    }),
    [data, schedule, today, actions, storageWarning],
  );

  // Nothing meaningful to show until stored data has loaded; this takes a few milliseconds.
  if (!ready) return <div className="h-full bg-bg" aria-busy="true" />;
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside <AppProvider>');
  return ctx;
}

export function useMonthStatus(month: MonthKey): { status: 'predicted' | 'confirmed'; needsReview: boolean } {
  const { data } = useApp();
  const c = data.confirmations.find((x) => x.month === month);
  return { status: c ? 'confirmed' : 'predicted', needsReview: c?.needsReview ?? false };
}
