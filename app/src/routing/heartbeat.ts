import { adjustedDread, DEFAULT_SETTINGS } from './costs';
import type { PersonalSettings } from './costs';
import { STRINGS } from '../content/strings';
import { formatDistance } from './format';
import type { Route } from './router';
import { ArgumentError } from '../validation/errors';
import { requireUnit } from '../validation/guards';

export interface HeartbeatSegment {
  /** Cumulative metres at the start and end of this route piece. */
  x0: number;
  x1: number;
  /** Setting-adjusted Dread, 0 to 1. */
  y: number;
  /** Piece confidence is at or below the lowest-quarter threshold. */
  lowConfidence: boolean;
  /** Piece Dread is in the highest quarter of this route's pieces. */
  highDread: boolean;
}

export interface HeartbeatSeries {
  totalM: number;
  segments: ReadonlyArray<HeartbeatSegment>;
}

export interface HeartbeatOptions {
  /** Defaults to all toggles off. */
  settings?: PersonalSettings;
  /** Median Edge confidence of the pack; only used by the low-confidence toggle. */
  medianConfidence?: number;
}

function sortedUnit(name: string, values: ReadonlyArray<number>): number[] {
  return values.map((v) => requireUnit(name, v)).sort((a, b) => a - b);
}

/**
 * Lowest-quarter confidence threshold (nearest rank): the value at index ceil(n / 4) - 1
 * of the ascending list. Returns null when the list is empty.
 */
export function lowConfidenceThreshold(estimatedConfidences: ReadonlyArray<number>): number | null {
  const v = sortedUnit('estimatedConfidences', estimatedConfidences);
  return v.length === 0 ? null : v[Math.ceil(v.length / 4) - 1]!;
}

/**
 * Highest-quarter Dread threshold: the value at index m - ceil(m / 4) of the ascending list.
 * Returns null when the list is empty.
 */
export function highestQuarterThreshold(dreads: ReadonlyArray<number>): number | null {
  const v = sortedUnit('dreads', dreads);
  return v.length === 0 ? null : v[v.length - Math.ceil(v.length / 4)]!;
}

/** One chart segment per route piece. A null threshold flags no piece as low confidence. */
export function heartbeatSeries(
  route: Route,
  lowConfThreshold: number | null,
  options: HeartbeatOptions = {},
): HeartbeatSeries {
  if (route.pieces.length === 0) throw new ArgumentError('route', 'must have at least one piece');
  if (lowConfThreshold !== null) requireUnit('lowConfThreshold', lowConfThreshold);
  const settings = options.settings ?? DEFAULT_SETTINGS;
  const median = options.medianConfidence ?? 0;

  const ys = route.pieces.map((p) => adjustedDread(p.view, settings, median));
  const high = highestQuarterThreshold(ys)!;
  let x = 0;
  const segments = route.pieces.map((p, i): HeartbeatSegment => {
    const x0 = x;
    x += p.view.lengthM;
    return {
      x0,
      x1: x,
      y: ys[i]!,
      lowConfidence: lowConfThreshold !== null && p.view.confidence <= lowConfThreshold,
      highDread: ys[i]! >= high,
    };
  });
  return { totalM: x, segments };
}

type Span = { from: number; to: number };

function mergedSpans(segments: ReadonlyArray<HeartbeatSegment>, flag: (s: HeartbeatSegment) => boolean): Span[] {
  const spans: Span[] = [];
  for (const s of segments) {
    if (!flag(s)) continue;
    const last = spans[spans.length - 1];
    if (last && last.to === s.x0) last.to = s.x1;
    else spans.push({ from: s.x0, to: s.x1 });
  }
  return spans;
}

function listSpans(spans: Span[]): string {
  return spans.map((s) => STRINGS.heartbeat.span.text(Math.round(s.from), Math.round(s.to))).join('; ');
}

/** Plain-text summary for screen readers. Adjacent flagged pieces are merged into one stretch. */
export function describeHeartbeat(series: HeartbeatSeries): string {
  const parts = [STRINGS.heartbeat.routeLength.text(formatDistance(series.totalM))];
  const high = mergedSpans(series.segments, (s) => s.highDread);
  parts.push(
    high.length > 0
      ? STRINGS.heartbeat.highStretches.text(listSpans(high))
      : STRINGS.heartbeat.noHighStretches.text,
  );
  const low = mergedSpans(series.segments, (s) => s.lowConfidence);
  parts.push(
    low.length > 0
      ? STRINGS.heartbeat.lowStretches.text(listSpans(low))
      : STRINGS.heartbeat.noLowStretches.text,
  );
  return parts.join(' ');
}
