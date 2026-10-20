import Dexie, { type Table } from 'dexie';
import type { MonthConfirmation, RotationPeriod, ShiftOverride } from '../engine/types';

export interface SettingRow {
  key: string;
  value: unknown;
}

/**
 * IndexedDB layout. Dexie versions are the database migration mechanism: to change the
 * layout, add `this.version(2).stores({...}).upgrade(tx => ...)` below and keep version 1
 * as is, so existing installs are upgraded in place without losing data.
 * Keep `SCHEMA_VERSION` in backup.ts in step with the newest version here.
 */
export class ShiftlyDB extends Dexie {
  periods!: Table<RotationPeriod, string>;
  overrides!: Table<ShiftOverride, string>;
  confirmations!: Table<MonthConfirmation, string>;
  settings!: Table<SettingRow, string>;

  constructor(name = 'shiftly') {
    super(name);
    this.version(1).stores({
      periods: 'id, effectiveFrom',
      overrides: 'date',
      confirmations: 'month',
      settings: 'key',
    });
  }
}
