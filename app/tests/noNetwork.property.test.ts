import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fc from 'fast-check';
import { buildGraph } from '../src/graph/build';
import { buildSnapIndex, snap } from '../src/graph/snap';
import { assignTiers } from '../src/scoring/tiers';
import { findRoute } from '../src/routing/router';
import { communityStatus, statusBySegment } from '../src/corrections/status';
import { darkSpots } from '../src/corrections/darkSpots';
import { toCsv } from '../src/corrections/csv';
import type { Correction } from '../src/corrections/store';
import type { LabelSource, ReportType, Segment } from '../src/types';

// Feature: gloam-web-app, Property 33: Pure modules make no network calls

const calls = { fetch: 0, xhr: 0, ws: 0, beacon: 0 };

beforeEach(() => {
  for (const k of Object.keys(calls) as Array<keyof typeof calls>) calls[k] = 0;
  vi.stubGlobal('fetch', () => {
    calls.fetch++;
    throw new Error('fetch called');
  });
  vi.stubGlobal('XMLHttpRequest', function () {
    calls.xhr++;
    throw new Error('XMLHttpRequest used');
  });
  vi.stubGlobal('WebSocket', function () {
    calls.ws++;
    throw new Error('WebSocket used');
  });
  vi.stubGlobal('navigator', { sendBeacon: () => { calls.beacon++; return false; } });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const unit = fc.double({ min: 0, max: 1, noNaN: true });
const lonLat = fc.tuple(fc.double({ min: 101, max: 101.01, noNaN: true }), fc.double({ min: 3.1, max: 3.11, noNaN: true }));

const segmentsArb: fc.Arbitrary<Segment[]> = fc
  .array(
    fc.record({
      highway: fc.constantFrom('primary', 'residential', 'service', 'steps', 'footway'),
      litProbability: unit,
      confidence: unit,
      labelSource: fc.constantFrom<LabelSource>('tagged_lit', 'tagged_unlit', 'estimated'),
      coordinates: fc.array(lonLat, { minLength: 2, maxLength: 4 }),
    }),
    { minLength: 1, maxLength: 8 },
  )
  .map((rows) => rows.map((r, i) => ({ ...r, id: `s${i}`, name: null })));

const correctionsArb: fc.Arbitrary<Correction[]> = fc.array(
  fc.record({
    segmentId: fc.constantFrom('s0', 's1', 's2'),
    type: fc.constantFrom<ReportType>('actually_lit', 'actually_dark', 'light_is_out'),
    date: fc.integer({ min: 0, max: 90 }).map((d) => new Date(Date.UTC(2025, 5, 30) - d * 86_400_000).toISOString().slice(0, 10)),
  }),
  { maxLength: 12 },
);

describe('Property 33: Pure modules make no network calls', () => {
  it('graph, tiers, router, snap, status and CSV never touch the network', () => {
    // **Validates: Requirements 13.4, 13.6, 13.9, 16.16**
    fc.assert(
      fc.property(
        segmentsArb,
        correctionsArb,
        unit,
        fc.double({ min: 0, max: 10, noNaN: true }),
        lonLat,
        fc.nat(),
        fc.nat(),
        (segments, corrections, median, lambda, [lon, lat], a, b) => {
          const { graph } = buildGraph(segments);
          assignTiers(segments);
          if (graph.edges.length > 0) {
            const index = buildSnapIndex(graph);
            snap(index, lon, lat);
            const pt = (n: number) => ({ edge: n % graph.edges.length, t: 0.5, lon, lat, distanceM: 0 });
            findRoute({
              graph,
              start: pt(a),
              end: pt(b),
              lambda,
              settings: { avoidSteps: false, avoidService: false, preferMain: false, lowConfidenceDarker: false },
              overrides: new Map(),
              medianConfidence: median,
            });
          }
          communityStatus(corrections, '2025-06-30');
          statusBySegment(corrections, '2025-06-30');
          toCsv(darkSpots(corrections, () => ({ name: null, highway: 'residential' })));

          expect(calls).toEqual({ fetch: 0, xhr: 0, ws: 0, beacon: 0 });
        },
      ),
    );
  });
});
