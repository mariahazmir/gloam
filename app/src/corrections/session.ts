import { overridesFromNotes } from '../scoring/overrides';
import type { Override } from '../scoring/overrides';
import { StoreError } from './store';
import type { Correction, CorrectionStore } from './store';

// This device's notes for the running app (Requirements 10.2, 10.3, 10.8, 10.9). All reads and
// writes go through the CorrectionStore. The store keeps one note per segment, so one device can
// never count as several people. `overrides()` keeps the same Map until a note changes, which is
// what lets the planner's cache tell whether it must plan again.

export interface CorrectionSession {
  /** This device's notes. */
  corrections(): ReadonlyArray<Correction>;
  /** Lit probability 1 or 0 and confidence 1 for each noted segment. Same object until a note changes. */
  overrides(): ReadonlyMap<string, Override>;
  /** True after a read or save failed and until the next success (Requirement 10.9). */
  storeError(): boolean;
  /** Saves one note. Returns false, with nothing changed, when the store fails. */
  submit(c: Correction): boolean;
}

export function createCorrectionSession(store: CorrectionStore): CorrectionSession {
  let notes: ReadonlyArray<Correction> = [];
  let overrides: ReadonlyMap<string, Override> = new Map();
  let failed = false;

  const adopt = (list: ReadonlyArray<Correction>): void => {
    notes = list;
    overrides = overridesFromNotes(list);
  };

  try {
    adopt(store.list());
  } catch (error) {
    if (!(error instanceof StoreError)) throw error;
    failed = true; // map viewing and routing carry on without notes
  }

  return {
    corrections: () => notes,
    overrides: () => overrides,
    storeError: () => failed,
    submit(c) {
      try {
        store.put({ segmentId: c.segmentId, type: c.type, date: c.date }); // exactly three values
        adopt(store.list());
        failed = false;
        return true;
      } catch (error) {
        if (!(error instanceof StoreError)) throw error;
        failed = true;
        return false;
      }
    },
  };
}
