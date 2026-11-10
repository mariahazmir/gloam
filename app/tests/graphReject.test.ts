import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { buildGraph } from "../src/graph/build";
import type { Segment } from "../src/types";

type Pt = [number, number];

const gridPoint: fc.Arbitrary<Pt> = fc
  .tuple(fc.integer({ min: 0, max: 5 }), fc.integer({ min: 0, max: 5 }))
  .map(([x, y]) => [100 + x * 0.001, 3 + y * 0.001] as Pt);

// 2..5 distinct grid points, so consecutive points always differ and segments can share nodes.
const validCoords: fc.Arbitrary<Pt[]> = fc.uniqueArray(gridPoint, {
  minLength: 2,
  maxLength: 5,
  selector: (p) => `${p[0]},${p[1]}`,
});

const unit = fc.double({ min: 0, max: 1, noNaN: true });
const badUnit = fc.oneof(
  fc.constant(NaN),
  fc.constant(Infinity),
  fc.constant(-Infinity),
  fc.double({ min: 1.0001, max: 1e6, noNaN: true }),
  fc.double({ min: -1e6, max: -0.0001, noNaN: true }),
);
const badLon = fc.oneof(
  fc.constant(NaN),
  fc.constant(Infinity),
  fc.constant(-Infinity),
  fc.double({ min: 180.001, max: 1e6, noNaN: true }),
  fc.double({ min: -1e6, max: -180.001, noNaN: true }),
);
const badLat = fc.oneof(
  fc.constant(NaN),
  fc.constant(Infinity),
  fc.constant(-Infinity),
  fc.double({ min: 90.001, max: 1e6, noNaN: true }),
  fc.double({ min: -1e6, max: -90.001, noNaN: true }),
);

function seg(id: string, coordinates: Pt[], litProbability = 0.5, confidence = 0.5): Segment {
  return { id, name: null, highway: "residential", litProbability, confidence, labelSource: "estimated", coordinates };
}

interface Bad {
  segments: Segment[];
  /** Expected rejection field for every copy. */
  field: string;
}

// Each generated bad Segment has exactly one fault, so the expected field is unambiguous.
function badArb(id: string): fc.Arbitrary<Bad> {
  return fc.oneof(
    // fewer than 2 coordinates, or 2+ points that collapse to one
    fc.oneof(fc.constant<Pt[]>([]), gridPoint.map((p) => [p]), gridPoint.map((p) => [p, p])).map((c) => ({
      segments: [seg(id, c)],
      field: "coordinates",
    })),
    // one non-finite or out-of-range coordinate
    fc
      .tuple(validCoords, fc.nat(), fc.boolean(), badLon, badLat)
      .map(([c, i, useLon, lon, lat]) => {
        const copy = c.map((p) => [...p] as Pt);
        const p = copy[i % copy.length]!;
        if (useLon) p[0] = lon;
        else p[1] = lat;
        return { segments: [seg(id, copy)], field: "coordinates" };
      }),
    fc.tuple(validCoords, badUnit).map(([c, v]) => ({ segments: [seg(id, c, v, 0.5)], field: "litProbability" })),
    fc.tuple(validCoords, badUnit).map(([c, v]) => ({ segments: [seg(id, c, 0.5, v)], field: "confidence" })),
    // duplicate id: every copy is rejected
    fc.tuple(validCoords, validCoords, unit, unit).map(([a, b, l, f]) => ({
      segments: [seg(id, a, l, f), seg(id, b, f, l)],
      field: "id",
    })),
  );
}

describe("buildGraph rejects invalid Segments individually", () => {
  // Feature: gloam-web-app, Property 6: Invalid Segments are rejected individually
  // **Validates: Requirements 2.8**
  it("reports id and field for each bad Segment and builds the same graph as from valid Segments alone", () => {
    const scenario = fc
      .tuple(
        fc.array(fc.tuple(validCoords, unit, unit), { maxLength: 8 }),
        fc.integer({ min: 0, max: 6 }).chain((n) =>
          fc.tuple(...Array.from({ length: n }, (_, i) => badArb(`bad${i}`))),
        ),
        fc.array(fc.nat(), { minLength: 20, maxLength: 20 }),
      )
      .map(([v, bad, order]) => {
        const valid = v.map(([c, l, f], i) => seg(`ok${i}`, c, l, f));
        const all = [...valid, ...bad.flatMap((b) => b.segments)];
        // Deterministic interleave driven by generated numbers.
        const mixed = all
          .map((s, i) => ({ s, k: order[i % order.length]! * 1000 + i }))
          .sort((x, y) => x.k - y.k)
          .map((x) => x.s);
        return { valid, bad, mixed };
      });

    fc.assert(
      fc.property(scenario, ({ valid, bad, mixed }) => {
        const mixedResult = buildGraph(mixed);
        const validResult = buildGraph(valid);

        // Valid-only input has nothing to reject.
        expect(validResult.rejected).toEqual([]);

        // Each bad Segment (every copy for duplicates) is rejected with its id and field named.
        const expected = bad.flatMap((b) => b.segments.map((s) => `${s.id}|${b.field}`)).sort();
        const actual = mixedResult.rejected.map((r) => `${r.segmentId}|${r.field}`).sort();
        expect(actual).toEqual(expected);
        for (const r of mixedResult.rejected) {
          expect(r.message).toContain(r.field);
        }

        // The rest builds the same graph as the valid Segments alone.
        expect(mixedResult.graph).toEqual(validResult.graph);
      }),
      { numRuns: 100 },
    );
  });
});
