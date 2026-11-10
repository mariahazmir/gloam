import { ArgumentError } from '../validation/errors';
import type { Correction } from './store';

export interface DarkSpot {
  segmentId: string;
  name: string | null;
  highway: string;
  actuallyDark: number;
  lightIsOut: number;
  /** True if any contributing Correction is sample data. */
  sample: boolean;
}

export const DARK_SPOT_LIMIT = 20;

/** Segments with at least one dark-side report, by total count desc then segment id asc (UTF-16), up to `limit`. */
export function darkSpots(
  corrections: ReadonlyArray<Correction & { sample?: boolean }>,
  names: (id: string) => { name: string | null; highway: string },
  limit: number = DARK_SPOT_LIMIT,
): DarkSpot[] {
  if (!Number.isInteger(limit) || limit < 0) {
    throw new ArgumentError('limit', `must be a whole number of 0 or more, got ${limit}`);
  }
  const byId = new Map<string, { dark: number; out: number; sample: boolean }>();
  for (const c of corrections) {
    if (c.type === 'actually_lit') continue;
    const e = byId.get(c.segmentId) ?? { dark: 0, out: 0, sample: false };
    if (c.type === 'actually_dark') e.dark += 1;
    else e.out += 1;
    if (c.sample === true) e.sample = true;
    byId.set(c.segmentId, e);
  }
  const rows: DarkSpot[] = [];
  for (const [segmentId, e] of byId) {
    const n = names(segmentId);
    rows.push({
      segmentId,
      name: n.name,
      highway: n.highway,
      actuallyDark: e.dark,
      lightIsOut: e.out,
      sample: e.sample,
    });
  }
  rows.sort((a, b) => {
    const d = b.actuallyDark + b.lightIsOut - (a.actuallyDark + a.lightIsOut);
    if (d !== 0) return d;
    return a.segmentId < b.segmentId ? -1 : a.segmentId > b.segmentId ? 1 : 0;
  });
  return rows.slice(0, limit);
}
