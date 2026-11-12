import type { SampleCorrection } from '../pack/sampleData';
import type { Correction } from './store';

// Joins this device's notes with the Sample_Data for one city, for community totals and the
// Dark_Spot_List (design: "Counts combine local and Sample_Data Corrections"). Pure.

export type TaggedCorrection = Correction & { sample: boolean };

/** Calendar day of `now`, as YYYY-MM-DD in UTC (the same day count Sample_Data uses). */
export function dayString(now: Date): string {
  return now.toISOString().slice(0, 10);
}

/**
 * Local notes whose segment is in the loaded pack, then Sample_Data rows for that city. Rows for
 * another city, or for a segment not in the pack, are left out. With no sample rows for the city
 * the result simply holds the local notes: that is not an error.
 */
export function combineCorrections(
  local: ReadonlyArray<Correction>,
  sample: ReadonlyArray<SampleCorrection>,
  cityId: string,
  hasSegment: (segmentId: string) => boolean,
): TaggedCorrection[] {
  const out: TaggedCorrection[] = [];
  for (const c of local) {
    if (hasSegment(c.segmentId)) out.push({ segmentId: c.segmentId, type: c.type, date: c.date, sample: false });
  }
  for (const s of sample) {
    if (s.city === cityId && hasSegment(s.segmentId)) {
      out.push({ segmentId: s.segmentId, type: s.type, date: s.date, sample: true });
    }
  }
  return out;
}
