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
