import type { ReportType } from '../types';
import { ArgumentError } from '../validation/errors';

/** A Sample_Data Correction with its city. Never written to local storage. */
export interface SampleCorrection {
  city: string;
  segmentId: string;
  type: ReportType;
  /** Calendar day, YYYY-MM-DD (UTC). */
  date: string;
}

const REPORT_TYPES: readonly string[] = ['actually_lit', 'actually_dark', 'light_is_out'];
const DAY_MS = 86_400_000;

/** Converts "days ago" to a YYYY-MM-DD date, counted in UTC days from `today`. */
export function dateFromDaysAgo(today: Date, daysAgo: number): string {
  if (!Number.isFinite(today.getTime())) throw new ArgumentError('today', 'must be a valid date');
  if (!Number.isInteger(daysAgo) || daysAgo < 0) {
    throw new ArgumentError('days_ago', 'must be a whole number of 0 or more');
  }
  const t = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()) - daysAgo * DAY_MS;
  return new Date(t).toISOString().slice(0, 10);
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** Returns the corrections, or null when the file is not valid Sample_Data. */
export function parseSampleData(json: unknown, today: Date): SampleCorrection[] | null {
  if (!isObject(json) || json.schema_version !== 1 || !Array.isArray(json.corrections)) return null;
  const out: SampleCorrection[] = [];
  for (const c of json.corrections) {
    if (!isObject(c)) return null;
    const { city, segment_id, type, days_ago } = c;
    if (typeof city !== 'string' || typeof type !== 'string' || !REPORT_TYPES.includes(type)) return null;
    if (typeof segment_id !== 'string' && typeof segment_id !== 'number') return null;
    if (typeof days_ago !== 'number' || !Number.isInteger(days_ago) || days_ago < 0) return null;
    out.push({
      city,
      segmentId: String(segment_id),
      type: type as ReportType,
      date: dateFromDaysAgo(today, days_ago),
    });
  }
  return out;
}
