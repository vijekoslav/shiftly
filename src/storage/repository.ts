import { createDefaultPeriod } from '../engine/rotation';
import type { AppData, AppSettings, MonthConfirmation, MonthKey, RotationPeriod, ShiftOverride } from '../engine/types';
import { DEFAULT_SETTINGS, normalizeData } from './backup';
import type { ShiftlyDB } from './db';

/**
 * The only module that reads or writes persisted app data. The UI and the scheduling engine
 * talk to this narrow interface, so a future sync or share backend can sit behind it.
 */
export interface Repository {
  load(): Promise<AppData>;
  replaceAll(data: AppData): Promise<void>;
  saveSettings(settings: AppSettings): Promise<void>;
  savePeriods(periods: RotationPeriod[]): Promise<void>;
  saveOverride(override: ShiftOverride): Promise<void>;
  deleteOverride(date: string): Promise<void>;
  saveConfirmation(confirmation: MonthConfirmation): Promise<void>;
  deleteConfirmation(month: MonthKey): Promise<void>;
}

const SETTINGS_KEY = 'app';

export function createRepository(db: ShiftlyDB): Repository {
  return {
    async load() {
      const [periods, overrides, confirmations, settingsRow] = await Promise.all([
        db.periods.toArray(),
        db.overrides.toArray(),
        db.confirmations.toArray(),
        db.settings.get(SETTINGS_KEY),
      ]);
      const data: AppData = {
        settings: { ...DEFAULT_SETTINGS, ...((settingsRow?.value as Partial<AppSettings>) ?? {}) },
        periods: periods.length > 0 ? periods : [createDefaultPeriod()],
        overrides,
        confirmations,
      };
      if (periods.length === 0) await db.periods.put(data.periods[0]);
      return normalizeData(data);
    },

    async replaceAll(data) {
      await db.transaction('rw', [db.periods, db.overrides, db.confirmations, db.settings], async () => {
        await Promise.all([db.periods.clear(), db.overrides.clear(), db.confirmations.clear(), db.settings.clear()]);
        await db.periods.bulkPut(data.periods);
        await db.overrides.bulkPut(data.overrides);
        await db.confirmations.bulkPut(data.confirmations);
        await db.settings.put({ key: SETTINGS_KEY, value: data.settings });
      });
    },

    async saveSettings(settings) {
      await db.settings.put({ key: SETTINGS_KEY, value: settings });
    },

    async savePeriods(periods) {
      await db.transaction('rw', db.periods, async () => {
        await db.periods.clear();
        await db.periods.bulkPut(periods);
      });
    },

    async saveOverride(override) {
      await db.overrides.put(override);
    },

    async deleteOverride(date) {
      await db.overrides.delete(date);
    },

    async saveConfirmation(confirmation) {
      await db.confirmations.put(confirmation);
    },

    async deleteConfirmation(month) {
      await db.confirmations.delete(month);
    },
  };
}

/** In-memory fallback used when IndexedDB is unavailable (e.g. some private-browsing modes). */
export function createMemoryRepository(initial?: AppData): Repository {
  let data = normalizeData(
    initial ?? { settings: DEFAULT_SETTINGS, periods: [createDefaultPeriod()], overrides: [], confirmations: [] },
  );
  return {
    async load() {
      return data;
    },
    async replaceAll(next) {
      data = normalizeData(next);
    },
    async saveSettings(settings) {
      data = { ...data, settings };
    },
    async savePeriods(periods) {
      data = { ...data, periods };
    },
    async saveOverride(override) {
      data = { ...data, overrides: [...data.overrides.filter((o) => o.date !== override.date), override] };
    },
    async deleteOverride(date) {
      data = { ...data, overrides: data.overrides.filter((o) => o.date !== date) };
    },
    async saveConfirmation(c) {
      data = { ...data, confirmations: [...data.confirmations.filter((x) => x.month !== c.month), c] };
    },
    async deleteConfirmation(month) {
      data = { ...data, confirmations: data.confirmations.filter((x) => x.month !== month) };
    },
  };
}
