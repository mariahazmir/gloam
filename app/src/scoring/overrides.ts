import type { ReportType } from '../types';

export interface Override {
  litProbability: 0 | 1;
  confidence: 1;
}

/** Per-user values for a noted segment. Tiers and community totals are not affected. */
export function overrideFor(type: ReportType): Override {
  return type === 'actually_lit'
    ? { litProbability: 1, confidence: 1 }
    : { litProbability: 0, confidence: 1 };
}

/** One override per segment id from this device's notes. A later row for the same id wins. Pure. */
export function overridesFromNotes(
  notes: ReadonlyArray<{ segmentId: string; type: ReportType }>,
): Map<string, Override> {
  const out = new Map<string, Override>();
  for (const n of notes) out.set(n.segmentId, overrideFor(n.type));
  return out;
}
