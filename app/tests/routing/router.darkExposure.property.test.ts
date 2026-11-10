// @vitest-environment node
import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { buildGraph, type StreetGraph } from "../../src/graph/build";
import type { SnapPoint } from "../../src/graph/snap";
import { findRoute } from "../../src/routing/router";
import { medianConfidence, type PersonalSettings } from "../../src/routing/costs";
import type { Segment } from "../../src/types";

// Feature: gloam-web-app, Property 10: Raising lambda never raises Dark_Exposure
// **Validates: Requirements 7.5, 16.4**

const TOLERANCE = 1e-6; // Comparison_Tolerance

const unit = fc.double({ min: 0, max: 1, noNaN: true });
const highway = fc.constantFrom("steps", "service", "primary", "residential", "footway", "tertiary");
const labelSource = fc.constantFrom("tagged_lit", "tagged_unlit", "estimated") as fc.Arbitrary<
  Segment["labelSource"]
>;
const settingsArb: fc.Arbitrary<PersonalSettings> = fc.record({
  avoidSteps: fc.boolean(),
  avoidService: fc.boolean(),
  preferMain: fc.boolean(),
  lowConfidenceDarker: fc.boolean(),
});

/** Lattice nodes about 50 to 150 m apart; each segment joins two distinct lattice points. */
const GRID = 4;
const pointArb = fc.record({ i: fc.integer({ min: 0, max: GRID - 1 }), j: fc.integer({ min: 0, max: GRID - 1 }) });

const segmentArb = fc
  .record({
    a: pointArb,
    b: pointArb,
    highway,
    litProbability: unit,
    confidence: unit,
    labelSource,
  })
  .filter((s) => s.a.i !== s.b.i || s.a.j !== s.b.j);

interface Case {
  graph: StreetGraph;
  start: SnapPoint;
  end: SnapPoint;
}

const tArb = fc.oneof(fc.constant(0), fc.constant(1), fc.double({ min: 0, max: 1, noNaN: true }), fc.constantFrom(5e-324, 1 - 1e-16));

const caseArb: fc.Arbitrary<Case> = fc
  .record({
    segs: fc.array(segmentArb, { minLength: 1, maxLength: 14 }),
    startPick: fc.nat(),
    endPick: fc.nat(),
    startT: tArb,
    endT: tArb,
  })
  .map(({ segs, startPick, endPick, startT, endT }) => {
    const segments: Segment[] = segs.map((s, n) => ({
      id: `s${String(n).padStart(2, "0")}`,
      name: null,
      highway: s.highway,
      litProbability: s.litProbability,
      confidence: s.confidence,
      labelSource: s.labelSource,
      coordinates: [
        [101 + s.a.i * 0.001, 3 + s.a.j * 0.001],
        [101 + s.b.i * 0.001, 3 + s.b.j * 0.001],
      ],
    }));
    const { graph } = buildGraph(segments);
    const n = graph.edges.length;
    return {
      graph,
      start: { edge: startPick % n, t: startT } as SnapPoint,
      end: { edge: endPick % n, t: endT } as SnapPoint,
    };
  });

const lambdaPairArb = fc
  .tuple(fc.double({ min: 0, max: 10, noNaN: true }), fc.double({ min: 0, max: 10, noNaN: true }))
  .filter(([x, y]) => x !== y)
  .map(([x, y]) => (x < y ? [x, y] : [y, x]) as [number, number]);

describe("Property 10: Raising lambda never raises Dark_Exposure", () => {
  it("Dark_Exposure at l2 is at most Dark_Exposure at l1 for l1 < l2", () => {
    fc.assert(
      fc.property(caseArb, settingsArb, lambdaPairArb, ({ graph, start, end }, settings, [l1, l2]) => {
        const median = medianConfidence(graph);
        const run = (lambda: number) =>
          findRoute({ graph, start, end, lambda, settings, overrides: new Map(), medianConfidence: median });
        const r1 = run(l1);
        const r2 = run(l2);
        // Reachability does not depend on lambda.
        expect(r2 === null).toBe(r1 === null);
        if (r1 === null || r2 === null) return;
        expect(r2.darkExposure).toBeLessThanOrEqual(r1.darkExposure + TOLERANCE);
      }),
      { verbose: true },
    );
  });

  it("unit example: a lit detour beats a dark shortcut once lambda is high enough", () => {
    // Two parallel segments between the same nodes, same length. Dark one is listed first.
    const mk = (id: string, lit: number, lon2: number): Segment => ({
      id,
      name: null,
      highway: "residential",
      litProbability: lit,
      confidence: 1,
      labelSource: "tagged_lit",
      coordinates: [
        [101, 3],
        [lon2, 3],
      ],
    });
    const { graph } = buildGraph([mk("a", 0, 101.001), mk("b", 1, 101.001)]);
    const settings: PersonalSettings = {
      avoidSteps: false,
      avoidService: false,
      preferMain: false,
      lowConfidenceDarker: false,
    };
    const base = { graph, start: { edge: 0, t: 0 }, end: { edge: 0, t: 1 }, settings, overrides: new Map(), medianConfidence: 1 };
    const low = findRoute({ ...base, lambda: 0 })!;
    const high = findRoute({ ...base, lambda: 5 })!;
    expect(high.darkExposure).toBeLessThanOrEqual(low.darkExposure + TOLERANCE);
  });
});
