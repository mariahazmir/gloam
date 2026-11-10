import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { buildGraph } from '../../src/graph/build';
import type { StreetGraph } from '../../src/graph/build';
import { DEFAULT_SETTINGS } from '../../src/routing/costs';
import { findRoute } from '../../src/routing/router';
import type { Segment } from '../../src/types';

// Feature: gloam-web-app, Property 12: Ties go to the first route in Canonical_Order, whatever the input order
// Validates: Requirements 7.7, 16.6

type Pt = readonly [number, number];

interface Scenario {
  segments: Segment[];
  startId: string; // route starts at the first coordinate of this segment
  endId: string; // route ends at the last coordinate of this segment
  expected: string[]; // segment ids of the first route in Canonical_Order
  lambda: number;
}

const LON = 101.7;
const LAT = 3.1;

function seg(id: string, a: Pt, b: Pt, lit: number, conf: number): Segment {
  return {
    id,
    name: null,
    highway: 'residential',
    litProbability: lit,
    confidence: conf,
    labelSource: 'estimated',
    coordinates: [a, b],
  };
}

/** Canonical_Order: compare ids as strings by code unit. */
const minId = (ids: string[]): string => ids.reduce((m, x) => (x < m ? x : m));

/** n distinct ids, drawn so that "10" vs "9" style orderings occur. */
const distinctIds = (n: number): fc.Arbitrary<string[]> =>
  fc.uniqueArray(fc.integer({ min: 0, max: 120 }).map(String), { minLength: n, maxLength: n });

const attrs = fc.record({
  lit: fc.double({ min: 0, max: 1, noNaN: true }),
  conf: fc.double({ min: 0, max: 1, noNaN: true }),
  lambda: fc.double({ min: 0, max: 10, noNaN: true }),
});

/**
 * Stages in series; each stage is k parallel segments with identical geometry and attributes.
 * Every combination of one segment per stage costs the same.
 * Expected: the smallest id at each stage.
 */
const ladder: fc.Arbitrary<Scenario> = fc
  .tuple(fc.array(fc.integer({ min: 2, max: 4 }), { minLength: 1, maxLength: 3 }), attrs)
  .chain(([widths, a]) =>
    distinctIds(widths.reduce((s, w) => s + w, 0)).map((ids) => {
      const segments: Segment[] = [];
      const expected: string[] = [];
      let at = 0;
      widths.forEach((w, stage) => {
        const group = ids.slice(at, at + w);
        at += w;
        const p0: Pt = [LON + stage * 0.001, LAT];
        const p1: Pt = [LON + (stage + 1) * 0.001, LAT];
        for (const id of group) segments.push(seg(id, p0, p1, a.lit, a.conf));
        expected.push(minId(group));
      });
      return {
        segments,
        startId: segments[0]!.id,
        endId: segments[segments.length - 1]!.id,
        expected,
        lambda: a.lambda,
      };
    }),
  );

/**
 * Diamond: A to D via B or via C. B and C are mirror images across the A-D meridian, so both
 * routes have equal length. The route whose first id is smaller wins (first ids are distinct).
 */
const diamond: fc.Arbitrary<Scenario> = fc.tuple(distinctIds(4), attrs).map(([ids, a]) => {
  const [ab, bd, ac, cd] = ids as [string, string, string, string];
  const A: Pt = [LON, LAT];
  const D: Pt = [LON, LAT + 0.002];
  const B: Pt = [LON + 0.001, LAT + 0.001];
  const C: Pt = [LON - 0.001, LAT + 0.001];
  const segments = [
    seg(ab, A, B, a.lit, a.conf),
    seg(bd, B, D, a.lit, a.conf),
    seg(ac, A, C, a.lit, a.conf),
    seg(cd, C, D, a.lit, a.conf),
  ];
  return {
    segments,
    startId: ab,
    endId: bd,
    expected: ab < ac ? [ab, bd] : [ac, cd],
    lambda: a.lambda,
  };
});

const scenario = fc.oneof(ladder, diamond);

/** Reorder by sorting on generated keys: an arbitrary permutation. */
function permute<T>(items: ReadonlyArray<T>, keys: ReadonlyArray<number>): T[] {
  return items
    .map((item, i) => ({ item, key: keys[i] ?? 0, i }))
    .sort((x, y) => x.key - y.key || x.i - y.i)
    .map((x) => x.item);
}

function edgeIndex(graph: StreetGraph, segmentId: string): number {
  const i = graph.edges.findIndex((e) => e.segmentId === segmentId);
  if (i < 0) throw new Error(`no edge for segment ${segmentId}`);
  return i;
}

/** Route over the given segment order; start and end are snapped to graph nodes (t = 0 or 1). */
function routeIds(sc: Scenario, segments: Segment[]): string[] | null {
  const { graph, rejected } = buildGraph(segments);
  expect(rejected).toEqual([]);
  const route = findRoute({
    graph,
    start: { edge: edgeIndex(graph, sc.startId), t: 0 },
    end: { edge: edgeIndex(graph, sc.endId), t: 1 },
    lambda: sc.lambda,
    settings: DEFAULT_SETTINGS,
    overrides: new Map(),
    medianConfidence: 0.5,
  });
  return route === null ? null : route.pieces.map((p) => graph.edges[p.edge]!.segmentId);
}

describe('Property 12: ties go to the first route in Canonical_Order', () => {
  it('worked diamond: "12","1" beats "7","3" because "12" < "7" by code unit', () => {
    // AB="7", BD="3", AC="12", CD="1": equal cost by mirror symmetry; first ids "7" vs "12".
    const A: Pt = [LON, LAT];
    const D: Pt = [LON, LAT + 0.002];
    const B: Pt = [LON + 0.001, LAT + 0.001];
    const C: Pt = [LON - 0.001, LAT + 0.001];
    const segments = [seg('7', A, B, 0.3, 0.6), seg('3', B, D, 0.3, 0.6), seg('12', A, C, 0.3, 0.6), seg('1', C, D, 0.3, 0.6)];
    const sc: Scenario = { segments, startId: '7', endId: '3', expected: ['12', '1'], lambda: 2 };
    expect(routeIds(sc, segments)).toEqual(['12', '1']);
    expect(routeIds(sc, [...segments].reverse())).toEqual(['12', '1']);
  });

  it('worked parallel pair: ids "10", "9", "2" give "10" ("10" < "2" < "9")', () => {
    const p0: Pt = [LON, LAT];
    const p1: Pt = [LON + 0.001, LAT];
    const segments = [seg('9', p0, p1, 0.5, 0.5), seg('2', p0, p1, 0.5, 0.5), seg('10', p0, p1, 0.5, 0.5)];
    const sc: Scenario = { segments, startId: '9', endId: '9', expected: ['10'], lambda: 1 };
    expect(routeIds(sc, segments)).toEqual(['10']);
  });

  it('returns the canonical-first equal-cost route for any input order', () => {
    fc.assert(
      fc.property(
        scenario,
        fc.array(fc.integer(), { minLength: 12, maxLength: 12 }),
        fc.array(fc.integer(), { minLength: 12, maxLength: 12 }),
        (sc, keysA, keysB) => {
          const canonical = [...sc.segments].sort((x, y) => (x.id < y.id ? -1 : x.id > y.id ? 1 : 0));
          const orders = [sc.segments, canonical, [...canonical].reverse(), permute(sc.segments, keysA), permute(sc.segments, keysB)];
          for (const order of orders) {
            expect(routeIds(sc, order)).toEqual(sc.expected);
          }
        },
      ),
    );
  });
});
