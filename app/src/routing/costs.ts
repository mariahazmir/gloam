import type { Edge, StreetGraph } from '../graph/build';
import type { Override } from '../scoring/overrides';
import { dread } from '../scoring/dread';
import { ArgumentError } from '../validation/errors';
import { requireFinite, requireLambda, requireUnit } from '../validation/guards';

export interface PersonalSettings {
  avoidSteps: boolean;
  avoidService: boolean;
  preferMain: boolean;
  lowConfidenceDarker: boolean;
}

/** All toggles off (Requirement 8.2). */
export const DEFAULT_SETTINGS: PersonalSettings = Object.freeze({
  avoidSteps: false,
  avoidService: false,
  preferMain: false,
  lowConfidenceDarker: false,
});

export interface EdgeView {
  lengthM: number;
  litProbability: number;
  confidence: number;
  highway: string;
}

const MAIN_ROADS: ReadonlySet<string> = new Set(['primary', 'secondary', 'tertiary']);

function requirePositiveLength(v: number): number {
  requireFinite('lengthM', v);
  if (v <= 0) throw new ArgumentError('lengthM', `must be above 0, got ${v}`);
  return v;
}

/** Edge values with this device's override (if any) applied. Does not change the edge. */
export function effectiveAttrs(edge: Edge, overrides: ReadonlyMap<string, Override>): EdgeView {
  const o = overrides.get(edge.segmentId);
  return {
    lengthM: edge.lengthM,
    litProbability: o ? o.litProbability : edge.litProbability,
    confidence: o ? o.confidence : edge.confidence,
    highway: edge.highway,
  };
}

/** Number of toggles that are on and match this highway value (Requirement 8.3). */
export function penaltyCount(highway: string, s: PersonalSettings): number {
  let n = 0;
  if (s.avoidSteps && highway === 'steps') n++;
  if (s.avoidService && highway === 'service') n++;
  if (s.preferMain && !MAIN_ROADS.has(highway)) n++;
  return n;
}

/** Dread, with confidence treated as 0 when the low-confidence toggle is on and confidence < median. */
export function adjustedDread(v: EdgeView, s: PersonalSettings, medianConfidence: number): number {
  requireUnit('litProbability', v.litProbability);
  requireUnit('confidence', v.confidence);
  requireUnit('medianConfidence', medianConfidence);
  const c = s.lowConfidenceDarker && v.confidence < medianConfidence ? 0 : v.confidence;
  return dread(v.litProbability, c);
}

/** length x (1 + penaltyCount). */
export function routingLength(v: EdgeView, s: PersonalSettings): number {
  requirePositiveLength(v.lengthM);
  return v.lengthM * (1 + penaltyCount(v.highway, s));
}

/** routingLength + lambda x lengthM x adjustedDread. */
export function edgeCost(v: EdgeView, lambda: number, s: PersonalSettings, median: number): number {
  requireLambda(lambda);
  return routingLength(v, s) + lambda * v.lengthM * adjustedDread(v, s, median);
}

/** Median edge confidence; mean of the two middle values for an even count. */
export function medianConfidence(graph: StreetGraph): number {
  const vals = graph.edges.map((e) => requireUnit('confidence', e.confidence)).sort((a, b) => a - b);
  const n = vals.length;
  if (n === 0) throw new ArgumentError('graph', 'must have at least one edge');
  const mid = n >> 1;
  return n % 2 === 1 ? vals[mid]! : (vals[mid - 1]! + vals[mid]!) / 2;
}
