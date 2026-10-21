import { isValidDateKey, isValidTime } from '../engine/dates';
import { t } from '../i18n';
import { BEGINNING_OF_TIME, sortPeriods } from '../engine/rotation';
import type {
  AppData,
  AppSettings,
  MonthConfirmation,
  PatternStep,
  RotationPeriod,
  ShiftOverride,
  ShiftSpec,
  TimeRange,
} from '../engine/types';

/**
 * Version of the persisted data model (IndexedDB layout and backup files share it).
 * Bump it when the shape of `AppData` changes and add a step to `MIGRATIONS`.
 */
export const SCHEMA_VERSION = 1;
export const BACKUP_APP_ID = 'shiftly';

export const DEFAULT_SETTINGS: AppSettings = { theme: 'dark', timeFormat: '24h', language: 'en' };

export interface BackupFile {
  app: typeof BACKUP_APP_ID;
  schemaVersion: number;
  exportedAt: string;
  data: AppData;
}

/**
 * Upgrades a raw `data` payload from schema `n` to `n + 1`. Index 0 upgrades v1 → v2, and so on.
 * Version 1 is the first release, so the list is empty; it exists so an older backup file or
 * database is upgraded in place instead of being rejected.
 */
export const MIGRATIONS: Array<(data: Record<string, unknown>) => Record<string, unknown>> = [];

export function migrateData(data: Record<string, unknown>, fromVersion: number): Record<string, unknown> {
  let current = data;
  for (let v = fromVersion; v < SCHEMA_VERSION; v++) {
    const step = MIGRATIONS[v - 1];
    if (!step) throw new Error(`No migration from schema version ${v}`);
    current = step(current);
  }
  return current;
}

export function createBackup(data: AppData, now: Date = new Date()): BackupFile {
  return {
    app: BACKUP_APP_ID,
    schemaVersion: SCHEMA_VERSION,
    exportedAt: now.toISOString(),
    data: normalizeData(data),
  };
}

export function serializeBackup(data: AppData, now?: Date): string {
  return JSON.stringify(createBackup(data, now), null, 2);
}

/** Canonical ordering so equal data always serialises identically. */
export function normalizeData(data: AppData): AppData {
  return {
    settings: { ...data.settings },
    periods: sortPeriods(data.periods).map((p) => ({
      ...p,
      pattern: [...p.pattern],
      day: { ...p.day },
      night: { ...p.night },
    })),
    overrides: [...data.overrides]
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((o) => stripUndefined({ ...o, shift: o.shift ? { ...o.shift } : o.shift })),
    confirmations: [...data.confirmations].sort((a, b) => a.month.localeCompare(b.month)).map((c) => ({ ...c })),
  };
}

function stripUndefined<T extends object>(obj: T): T {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as T;
}

export type ParseResult = { ok: true; backup: BackupFile } | { ok: false; errors: string[] };

type Rec = Record<string, unknown>;
const isRec = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Parses and strictly validates backup text. Never throws; problems come back as messages. */
export function parseBackup(text: string): ParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, errors: [t('bk.notJson')] };
  }
  if (!isRec(raw) || raw.app !== BACKUP_APP_ID) {
    return { ok: false, errors: [t('bk.notShiftly')] };
  }
  const version = raw.schemaVersion;
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    return { ok: false, errors: [t('bk.noVersion')] };
  }
  if (version > SCHEMA_VERSION) {
    return {
      ok: false,
      errors: [t('bk.newer', { version })],
    };
  }
  if (!isRec(raw.data)) return { ok: false, errors: [t('bk.noData')] };

  let data: Rec;
  try {
    data = migrateData(raw.data, version);
  } catch (e) {
    return { ok: false, errors: [e instanceof Error ? e.message : t('bk.upgradeFail')] };
  }

  const errors: string[] = [];
  const result = validateData(data, errors);
  if (!result || errors.length > 0) return { ok: false, errors: errors.slice(0, 8) };
  return {
    ok: true,
    backup: {
      app: BACKUP_APP_ID,
      schemaVersion: SCHEMA_VERSION,
      exportedAt: typeof raw.exportedAt === 'string' ? raw.exportedAt : '',
      data: normalizeData(result),
    },
  };
}

function validateData(data: Rec, errors: string[]): AppData | null {
  const settings = validateSettings(data.settings, errors);
  const periods = validateList(data.periods, t('bk.lblPeriods'), errors, validatePeriod);
  const overrides = validateList(data.overrides, t('bk.lblOverrides'), errors, validateOverride);
  const confirmations = validateList(data.confirmations, t('bk.lblConfirmations'), errors, validateConfirmation);
  if (errors.length > 0) return null;

  if (periods.length === 0) errors.push(t('bk.needRotation'));
  if (new Set(periods.map((p) => p.id)).size !== periods.length) errors.push(t('bk.dupRotationId'));
  if (new Set(periods.map((p) => p.effectiveFrom)).size !== periods.length) {
    errors.push(t('bk.dupRotationDate'));
  }
  if (!periods.some((p) => p.effectiveFrom === BEGINNING_OF_TIME)) {
    // The first period must cover all earlier dates.
    const first = sortPeriods(periods)[0];
    if (first) first.effectiveFrom = BEGINNING_OF_TIME;
  }
  if (new Set(overrides.map((o) => o.date)).size !== overrides.length) errors.push(t('bk.dupOverride'));
  if (new Set(confirmations.map((c) => c.month)).size !== confirmations.length) errors.push(t('bk.dupConfirm'));
  if (errors.length > 0) return null;
  return { settings: settings!, periods, overrides, confirmations };
}

function validateList<T>(
  value: unknown,
  label: string,
  errors: string[],
  validate: (item: unknown, label: string, errors: string[]) => T | null,
): T[] {
  if (!Array.isArray(value)) {
    errors.push(t('bk.missingList', { label }));
    return [];
  }
  const out: T[] = [];
  value.forEach((item, i) => {
    const parsed = validate(item, `${label} #${i + 1}`, errors);
    if (parsed) out.push(parsed);
  });
  return out;
}

function validateSettings(value: unknown, errors: string[]): AppSettings | null {
  if (!isRec(value)) {
    errors.push(t('bk.missingSettings'));
    return null;
  }
  const theme = value.theme;
  const timeFormat = value.timeFormat;
  // Backups made before the language option existed have no `language`; they default to English.
  const language = value.language ?? 'en';
  if (theme !== 'system' && theme !== 'dark' && theme !== 'light') errors.push(t('bk.badTheme'));
  if (timeFormat !== '24h' && timeFormat !== '12h') errors.push(t('bk.badTimeFormat'));
  if (language !== 'en' && language !== 'hr') errors.push(t('bk.badLanguage'));
  return {
    theme: theme as AppSettings['theme'],
    timeFormat: timeFormat as AppSettings['timeFormat'],
    language: language as AppSettings['language'],
  };
}

function validateRange(value: unknown): TimeRange | null {
  if (!isRec(value) || !isValidTime(value.start) || !isValidTime(value.end) || value.start === value.end) return null;
  return { start: value.start, end: value.end };
}

function validatePeriod(value: unknown, label: string, errors: string[]): RotationPeriod | null {
  if (!isRec(value)) {
    errors.push(t('bk.malformed', { item: label }));
    return null;
  }
  const pattern = value.pattern;
  const day = validateRange(value.day);
  const night = validateRange(value.night);
  const patternOk =
    Array.isArray(pattern) &&
    pattern.length >= 1 &&
    pattern.length <= 28 &&
    pattern.every((s) => s === 'day' || s === 'night' || s === 'off');
  if (
    typeof value.id !== 'string' ||
    !value.id ||
    !isValidDateKey(value.effectiveFrom) ||
    !isValidDateKey(value.anchor) ||
    !patternOk ||
    !day ||
    !night
  ) {
    errors.push(t('bk.invalid', { item: label }));
    return null;
  }
  return {
    id: value.id,
    effectiveFrom: value.effectiveFrom,
    anchor: value.anchor,
    pattern: [...(pattern as PatternStep[])],
    day,
    night,
  };
}

function validateShiftSpec(value: unknown): ShiftSpec | null {
  if (!isRec(value)) return null;
  const range = validateRange(value);
  if ((value.kind !== 'day' && value.kind !== 'night') || !range) return null;
  return { kind: value.kind, ...range };
}

function validateOverride(value: unknown, label: string, errors: string[]): ShiftOverride | null {
  if (!isRec(value) || !isValidDateKey(value.date) || typeof value.updatedAt !== 'number') {
    errors.push(t('bk.invalid', { item: label }));
    return null;
  }
  if (value.note !== undefined && typeof value.note !== 'string') {
    errors.push(t('bk.invalidNote', { item: label }));
    return null;
  }
  const out: ShiftOverride = { date: value.date, updatedAt: value.updatedAt };
  if (value.note) out.note = value.note;
  if (value.shift === null) out.shift = null;
  else if (value.shift !== undefined) {
    const spec = validateShiftSpec(value.shift);
    if (!spec) {
      errors.push(t('bk.invalidShift', { item: label }));
      return null;
    }
    out.shift = spec;
  }
  return out;
}

function validateConfirmation(value: unknown, label: string, errors: string[]): MonthConfirmation | null {
  if (
    !isRec(value) ||
    typeof value.month !== 'string' ||
    !isValidDateKey(`${value.month}-01`) ||
    typeof value.confirmedAt !== 'number' ||
    typeof value.needsReview !== 'boolean'
  ) {
    errors.push(t('bk.invalid', { item: label }));
    return null;
  }
  return { month: value.month, confirmedAt: value.confirmedAt, needsReview: value.needsReview };
}

export interface BackupSummary {
  exportedAt: string;
  rotations: number;
  overrides: number;
  confirmedMonths: number;
  firstOverride?: string;
  lastOverride?: string;
}

export function summarizeData(data: AppData, exportedAt = ''): BackupSummary {
  const dates = data.overrides.map((o) => o.date).sort();
  return {
    exportedAt,
    rotations: data.periods.length,
    overrides: data.overrides.length,
    confirmedMonths: data.confirmations.length,
    firstOverride: dates[0],
    lastOverride: dates[dates.length - 1],
  };
}
