import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { StoreError } from '../../src/corrections/store';
import type { Correction } from '../../src/corrections/store';
import { parseSettings, serializeSettings } from '../../src/settings/settings';
import type { KeyValueStorage } from '../../src/storage/keyValueStorage';
import { CORRECTIONS_KEY, createLocalCorrectionStore } from '../../src/storage/localCorrectionStore';
import { SETTINGS_KEY, createLocalSettingsStore } from '../../src/storage/localSettingsStore';

function memoryStorage(failWrites = false): KeyValueStorage & { data: Map<string, string>; fail: boolean } {
  const data = new Map<string, string>();
  const s = {
    data,
    fail: failWrites,
    getItem: (k: string) => (data.has(k) ? (data.get(k) as string) : null),
    setItem: (k: string, v: string) => {
      if (s.fail) throw new Error('quota exceeded');
      data.set(k, v);
    },
  };
  return s;
}

const typeArb = fc.constantFrom('actually_lit', 'actually_dark', 'light_is_out') as fc.Arbitrary<Correction['type']>;
const dayArb = fc
  .date({ min: new Date('2000-01-01T00:00:00Z'), max: new Date('2099-12-31T00:00:00Z'), noInvalidDate: true })
  .map((d) => d.toISOString().slice(0, 10));
const correctionArb: fc.Arbitrary<Correction> = fc.record({
  segmentId: fc.string({ minLength: 1, maxLength: 12 }),
  type: typeArb,
  date: dayArb,
});
const settingsArb = fc.record({
  avoidSteps: fc.boolean(),
  avoidService: fc.boolean(),
  preferMain: fc.boolean(),
  lowConfidenceDarker: fc.boolean(),
});

// Feature: gloam-web-app, Property 22: Stored data round-trips and holds only the allowed fields
// **Validates: Requirements 8.5, 8.6, 10.2, 10.9, 13.10**
describe('Property 22: Stored data round-trips and holds only the allowed fields', () => {
  it('corrections: one record per segment (latest put wins), three fields only', () => {
    fc.assert(
      fc.property(fc.array(correctionArb, { maxLength: 20 }), (puts) => {
        const storage = memoryStorage();
        const store = createLocalCorrectionStore(storage);
        const latest = new Map<string, Correction>();
        for (const c of puts) {
          // Extra fields on the input must never reach storage.
          store.put({ ...c, extra: 'person-1', lat: 1, lon: 2 } as Correction);
          latest.set(c.segmentId, c);
        }
        const back = store.list();
        expect(back).toHaveLength(latest.size);
        for (const r of back) {
          expect(Object.keys(r).sort()).toEqual(['date', 'segmentId', 'type']);
          expect(r).toEqual(latest.get(r.segmentId));
        }
        const text = storage.getItem(CORRECTIONS_KEY);
        if (text !== null) {
          for (const row of JSON.parse(text) as unknown[]) {
            expect(Array.isArray(row)).toBe(true);
            expect((row as unknown[]).length).toBe(3);
          }
          expect(text).not.toContain('person-1');
          expect(text).not.toContain('extra');
        }
      }),
    );
  });

  it('settings: serialise then parse returns equal settings, four booleans only', () => {
    fc.assert(
      fc.property(settingsArb, (s) => {
        const text = serializeSettings(s);
        expect(parseSettings(text)).toEqual(s);
        expect(Object.keys(JSON.parse(text)).sort()).toEqual(
          ['avoidService', 'avoidSteps', 'lowConfidenceDarker', 'preferMain'],
        );
        const storage = memoryStorage();
        const store = createLocalSettingsStore(storage);
        store.save({ ...s, name: 'x' } as typeof s);
        expect(store.load()).toEqual(s);
        expect(storage.getItem(SETTINGS_KEY)).toBe(text);
      }),
    );
  });

  it('a failed write leaves earlier data unchanged', () => {
    fc.assert(
      fc.property(
        fc.array(correctionArb, { minLength: 1, maxLength: 10 }),
        correctionArb,
        settingsArb,
        settingsArb,
        (earlier, next, s1, s2) => {
          const storage = memoryStorage();
          const cs = createLocalCorrectionStore(storage);
          const ss = createLocalSettingsStore(storage);
          for (const c of earlier) cs.put(c);
          ss.save(s1);
          const cBefore = storage.getItem(CORRECTIONS_KEY);
          const sBefore = storage.getItem(SETTINGS_KEY);
          const listBefore = cs.list();
          storage.fail = true;
          expect(() => cs.put(next)).toThrow(StoreError);
          expect(() => cs.clear()).toThrow(StoreError);
          expect(() => ss.save(s2)).toThrow(StoreError);
          expect(storage.getItem(CORRECTIONS_KEY)).toBe(cBefore);
          expect(storage.getItem(SETTINGS_KEY)).toBe(sBefore);
          storage.fail = false;
          expect(cs.list()).toEqual(listBefore);
          expect(ss.load()).toEqual(s1);
        },
      ),
    );
  });
});
