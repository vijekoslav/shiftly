import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { createDefaultPeriod } from '../engine/rotation';
import type { AppData } from '../engine/types';
import { createBackup, parseBackup, serializeBackup, summarizeData } from './backup';
import { ShiftlyDB } from './db';
import { createRepository } from './repository';

const sample: AppData = {
  settings: { theme: 'light', timeFormat: '12h' },
  periods: [
    createDefaultPeriod(),
    {
      id: 'summer',
      effectiveFrom: '2027-06-01',
      anchor: '2027-06-03',
      pattern: ['day', 'day', 'night', 'off', 'off'],
      day: { start: '07:00', end: '19:00' },
      night: { start: '19:00', end: '07:00' },
    },
  ],
  overrides: [
    { date: '2026-10-23', shift: null, note: 'Day off, swapped', updatedAt: 1000 },
    { date: '2026-10-22', shift: { kind: 'night', start: '21:00', end: '07:30' }, updatedAt: 2000 },
    { date: '2026-10-19', note: 'Only a note', updatedAt: 3000 },
  ],
  confirmations: [
    { month: '2026-10', confirmedAt: 5000, needsReview: true },
    { month: '2026-09', confirmedAt: 4000, needsReview: false },
  ],
};

describe('backup file', () => {
  it('round-trips data exactly', () => {
    const parsed = parseBackup(serializeBackup(sample));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.backup.data).toEqual(createBackup(sample).data);
    // Order is canonical, content is untouched.
    expect(parsed.backup.data.overrides.map((o) => o.date)).toEqual(['2026-10-19', '2026-10-22', '2026-10-23']);
    expect(parsed.backup.data.overrides[2].shift).toBeNull();
    expect(parsed.backup.data.overrides[0].shift).toBeUndefined();
    expect(parsed.backup.data.periods[1].anchor).toBe('2027-06-03');
    expect(parsed.backup.data.settings).toEqual(sample.settings);
  });

  it('summarises content for the import preview', () => {
    expect(summarizeData(sample)).toMatchObject({ rotations: 2, overrides: 3, confirmedMonths: 2, firstOverride: '2026-10-19' });
  });

  it('rejects text that is not JSON', () => {
    const r = parseBackup('not json {');
    expect(r.ok).toBe(false);
  });

  it('rejects JSON from another app or without data', () => {
    expect(parseBackup('{"hello":1}').ok).toBe(false);
    expect(parseBackup('[]').ok).toBe(false);
    expect(parseBackup('{"app":"shiftly","schemaVersion":1}').ok).toBe(false);
  });

  it('rejects backups from a newer schema', () => {
    const file = { ...createBackup(sample), schemaVersion: 99 };
    const r = parseBackup(JSON.stringify(file));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0]).toMatch(/newer/);
  });

  it('reports invalid entries instead of importing them', () => {
    const file = createBackup(sample);
    const bad = structuredClone(file) as unknown as { data: Record<string, any[]> };
    bad.data.overrides[0].date = '2026-13-45';
    bad.data.periods[0].pattern = ['day', 'lunch'];
    bad.data.confirmations[0].month = 'October';
    const r = parseBackup(JSON.stringify(bad));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.length).toBeGreaterThanOrEqual(3);
  });

  it('rejects backups with no rotation or conflicting rotations', () => {
    const none = { ...createBackup(sample), data: { ...sample, periods: [] } };
    expect(parseBackup(JSON.stringify(none)).ok).toBe(false);
    const dup = { ...createBackup(sample), data: { ...sample, periods: [sample.periods[1], { ...sample.periods[1], id: 'x' }] } };
    expect(parseBackup(JSON.stringify(dup)).ok).toBe(false);
  });
});

describe('IndexedDB persistence', () => {
  let db: ShiftlyDB;
  beforeEach(async () => {
    db = new ShiftlyDB(`test-${Math.random()}`);
    await db.open();
  });

  it('seeds the default rotation on first load', async () => {
    const data = await createRepository(db).load();
    expect(data.periods).toHaveLength(1);
    expect(data.periods[0].anchor).toBe('2026-10-19');
    expect(data.settings).toEqual({ theme: 'dark', timeFormat: '24h' });
    expect(data.overrides).toEqual([]);
  });

  it('restores a backup into the database and reads it back unchanged', async () => {
    const repo = createRepository(db);
    const parsed = parseBackup(serializeBackup(sample));
    if (!parsed.ok) throw new Error('parse failed');
    await repo.replaceAll(parsed.backup.data);
    const loaded = await repo.load();
    expect(loaded).toEqual(createBackup(sample).data);
  });

  it('export → wipe → import preserves everything', async () => {
    const repo = createRepository(db);
    await repo.replaceAll(createBackup(sample).data);
    const exported = serializeBackup(await repo.load());
    await repo.replaceAll({ settings: { theme: 'dark', timeFormat: '24h' }, periods: [createDefaultPeriod()], overrides: [], confirmations: [] });
    expect((await repo.load()).overrides).toHaveLength(0);
    const parsed = parseBackup(exported);
    if (!parsed.ok) throw new Error('parse failed');
    await repo.replaceAll(parsed.backup.data);
    expect(await repo.load()).toEqual(createBackup(sample).data);
  });

  it('replacing data removes what the backup does not contain', async () => {
    const repo = createRepository(db);
    await repo.replaceAll(createBackup(sample).data);
    await repo.replaceAll({ ...sample, overrides: [], confirmations: [] });
    const loaded = await repo.load();
    expect(loaded.overrides).toEqual([]);
    expect(loaded.confirmations).toEqual([]);
  });

  it('persists single changes', async () => {
    const repo = createRepository(db);
    await repo.saveOverride({ date: '2026-11-01', shift: null, updatedAt: 1 });
    await repo.saveConfirmation({ month: '2026-11', confirmedAt: 2, needsReview: false });
    await repo.saveSettings({ theme: 'system', timeFormat: '24h' });
    let d = await repo.load();
    expect(d.overrides).toHaveLength(1);
    expect(d.confirmations).toHaveLength(1);
    expect(d.settings.theme).toBe('system');
    await repo.deleteOverride('2026-11-01');
    await repo.deleteConfirmation('2026-11');
    d = await repo.load();
    expect(d.overrides).toHaveLength(0);
    expect(d.confirmations).toHaveLength(0);
  });
});
