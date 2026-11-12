import type { ReportType } from '../types';

export type { ReportType };

/** Exactly three stored values: segment id, report type, calendar day (YYYY-MM-DD). */
export interface Correction {
  segmentId: string;
  type: ReportType;
  date: string;
}

/** Thrown by a CorrectionStore when reading or writing fails. Earlier data stays unchanged. */
export class StoreError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message);
    this.name = 'StoreError';
    if (options?.cause !== undefined) (this as { cause?: unknown }).cause = options.cause;
  }
}

export interface CorrectionStore {
  /** Throws StoreError on read failure. */
  list(): Correction[];
  /** Replaces any earlier Correction for the same segmentId. Throws StoreError on write failure. */
  put(c: Correction): void;
  clear(): void;
}
