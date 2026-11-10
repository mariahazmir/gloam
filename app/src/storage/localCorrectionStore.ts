import { StoreError } from '../corrections/store';
import type { Correction, CorrectionStore } from '../corrections/store';
import { ArgumentError } from '../validation/errors';
import type { KeyValueStorage } from './keyValueStorage';

export const CORRECTIONS_KEY = 'gloam.corrections.v1';

const TYPES = new Set(['actually_lit', 'actually_dark', 'light_is_out']);
const DAY = /^\d{4}-\d{2}-\d{2}$/;

function checkCorrection(c: Correction): void {
  if (c === null || typeof c !== 'object') throw new ArgumentError('correction', 'must be an object');
  if (typeof c.segmentId !== 'string' || c.segmentId === '') {
    throw new ArgumentError('segmentId', 'must be a non-empty string');
  }
  if (!TYPES.has(c.type)) throw new ArgumentError('type', `unknown report type ${String(c.type)}`);
  if (typeof c.date !== 'string' || !DAY.test(c.date) || Number.isNaN(Date.parse(`${c.date}T00:00:00Z`))) {
    throw new ArgumentError('date', 'must be a calendar day like 2025-01-31');
  }
}

/** CorrectionStore over an injected storage object (localStorage in the browser). */
export function createLocalCorrectionStore(storage: KeyValueStorage | null): CorrectionStore {
  function read(): Correction[] {
    if (!storage) throw new StoreError('Local storage is not available');
    let text: string | null;
    try {
      text = storage.getItem(CORRECTIONS_KEY);
    } catch (cause) {
      throw new StoreError('Could not read corrections', { cause });
    }
    if (text === null) return [];
    try {
      const raw: unknown = JSON.parse(text);
      if (!Array.isArray(raw)) throw new Error('not an array');
      return raw.map((row): Correction => {
        if (!Array.isArray(row) || row.length !== 3) throw new Error('bad row');
        const c = { segmentId: row[0], type: row[1], date: row[2] } as Correction;
        checkCorrection(c);
        return c;
      });
    } catch (cause) {
      throw new StoreError('Stored corrections are unreadable', { cause });
    }
  }

  function write(list: ReadonlyArray<Correction>): void {
    if (!storage) throw new StoreError('Local storage is not available');
    const rows = list.map((c) => [c.segmentId, c.type, c.date]);
    try {
      storage.setItem(CORRECTIONS_KEY, JSON.stringify(rows));
    } catch (cause) {
      throw new StoreError('Could not save corrections', { cause });
    }
  }

  return {
    list: read,
    put(c) {
      checkCorrection(c);
      const kept = read().filter((x) => x.segmentId !== c.segmentId);
      kept.push({ segmentId: c.segmentId, type: c.type, date: c.date });
      write(kept);
    },
    clear() {
      write([]);
    },
  };
}
