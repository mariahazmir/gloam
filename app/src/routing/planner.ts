import { containsPoint } from '../geo/bounds';
import type { Bounds } from '../geo/bounds';
import type { StreetGraph } from '../graph/build';
import { snap } from '../graph/snap';
import type { SnapIndex, SnapPoint } from '../graph/snap';
import type { Override } from '../scoring/overrides';
import { DEFAULT_SETTINGS } from './costs';
import type { PersonalSettings } from './costs';
import { findRoute } from './router';
import type { Route } from './router';

// Turns the plan inputs (points, Lambda, settings) into one outcome for the UI.
// The Shortest_Route ignores Lambda and settings, so it is computed once per
// start/end pair and cached; only the Gloam_Route is recomputed when Lambda or
// the settings change (Requirements 6.5, 6.6, 6.8, 7.4, 7.8).

export interface PlanPack {
  graph: StreetGraph;
  index: SnapIndex;
  /** Segment bounds grown by the Snap_Distance (`packBounds`). */
  bounds: Bounds;
  medianConfidence: number;
}

export interface PlanPoint {
  lon: number;
  lat: number;
}

export interface PlanInput {
  pack: PlanPack | null;
  start: PlanPoint | null;
  end: PlanPoint | null;
  lambda: number;
  settings: PersonalSettings;
  overrides: ReadonlyMap<string, Override>;
}

export type PlanOutcome =
  /** No pack yet, or a point is not set. */
  | { kind: 'incomplete' }
  | { kind: 'outsideArea' }
  | { kind: 'tooFar' }
  /** Start and end snapped to the same point: zero pieces is not a route. */
  | { kind: 'samePlace' }
  | { kind: 'noRoute' }
  | { kind: 'route'; gloam: Route; shortest: Route; start: SnapPoint; end: SnapPoint };

export interface Planner {
  plan(input: PlanInput): PlanOutcome;
  /** How many times the Shortest_Route has been computed. For tests and timing checks. */
  readonly shortestRuns: number;
}

interface Cached {
  pack: PlanPack;
  overrides: ReadonlyMap<string, Override>;
  start: PlanPoint;
  end: PlanPoint;
  snapStart: SnapPoint | null;
  snapEnd: SnapPoint | null;
  shortest: Route | null;
  shortestDone: boolean;
}

const samePoint = (a: PlanPoint, b: PlanPoint): boolean => a.lon === b.lon && a.lat === b.lat;

/**
 * The cache holds one entry, for the last start/end pair on the same pack and overrides.
 * Overrides are part of the key because they change the Dark_Exposure carried on the route.
 */
export function createPlanner(): Planner {
  let cache: Cached | null = null;
  let shortestRuns = 0;

  const plan = (input: PlanInput): PlanOutcome => {
    const { pack, start, end, overrides } = input;
    if (pack === null) cache = null; // lets a replaced pack's graph be released
    if (pack === null || start === null || end === null) return { kind: 'incomplete' };
    if (!containsPoint(pack.bounds, start.lon, start.lat) || !containsPoint(pack.bounds, end.lon, end.lat)) {
      return { kind: 'outsideArea' };
    }

    if (
      cache === null ||
      cache.pack !== pack ||
      cache.overrides !== overrides ||
      !samePoint(cache.start, start) ||
      !samePoint(cache.end, end)
    ) {
      cache = {
        pack,
        overrides,
        start: { lon: start.lon, lat: start.lat },
        end: { lon: end.lon, lat: end.lat },
        snapStart: snap(pack.index, start.lon, start.lat),
        snapEnd: snap(pack.index, end.lon, end.lat),
        shortest: null,
        shortestDone: false,
      };
    }
    const entry = cache;
    if (entry.snapStart === null || entry.snapEnd === null) return { kind: 'tooFar' };

    const request = {
      graph: pack.graph,
      start: entry.snapStart,
      end: entry.snapEnd,
      overrides,
      medianConfidence: pack.medianConfidence,
    };
    if (!entry.shortestDone) {
      shortestRuns++;
      entry.shortest = findRoute({ ...request, lambda: 0, settings: DEFAULT_SETTINGS });
      entry.shortestDone = true; // a null result (no route) is cached too
    }
    if (entry.shortest === null) return { kind: 'noRoute' };
    if (entry.shortest.pieces.length === 0) return { kind: 'samePlace' };

    const gloam = findRoute({ ...request, lambda: input.lambda, settings: input.settings });
    if (gloam === null) return { kind: 'noRoute' };
    if (gloam.pieces.length === 0) return { kind: 'samePlace' };
    return { kind: 'route', gloam, shortest: entry.shortest, start: entry.snapStart, end: entry.snapEnd };
  };

  return {
    plan,
    get shortestRuns() {
      return shortestRuns;
    },
  };
}
