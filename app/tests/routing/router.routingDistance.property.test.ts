// @vitest-environment node
import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { buildGraph, type Edge, type StreetGraph } from "../../src/graph/build";
import { findRoute } from "../../src/routing/router";
import { DEFAULT_SETTINGS, medianConfidence, type PersonalSettings } from "../../src/routing/costs";
import type { Segment } from "../../src/types";

// Comparison_Tolerance from the glossary.
const TOL = 0.000001;

const unit = fc.double({ min: 0, max: 1, noNaN: true });
const settingsArb: fc.Arbitrary<PersonalSettings> = fc.record({
  avoidSteps: fc.boolean(),
  avoidService: fc.boolean(),
  preferMain: fc.boolean(),
  lowConfidenceDarker: fc.boolean(),
});
const highwayArb = fc.constantFrom(
  "steps", "service", "primary", "secondary", "tertiary", "residential", "footway", "path", "unclassified",
);
const labelArb = fc.constantFrom("tagged_lit", "tagged_unlit", "estimated") as fc.Arbitrary<Segment["labelSource"]>;

// Small integer grid scaled to degrees so segments share coordinates, loop and sometimes disconnect.
const GRID = 4;
const point = fc
  .tuple(fc.integer({ min: 0, max: GRID }), fc.integer({ min: 0, max: GRID }))
  .map(([i, j]) => [101 + i * 0.001, 3 + j * 0.001] as const);

const segmentArb = (id: string): fc.Arbitrary<Segment> =>
  fc.record({
    id: fc.constant(id),
    name: fc.constant(null),
    highway: highwayArb,
    litProbability: unit,
    confidence: unit,
    labelSource: labelArb,
    coordinates: fc.array(point, { minLength: 2, maxLength: 4 }),
  });

const ids = ["1", "9", "10", "2", "a", "b", "11", "3"];
const segmentsArb = fc
  .integer({ min: 2, max: ids.length })
  .chain((n) => fc.tuple(...ids.slice(0, n).map(segmentArb)))
  .map((segs) => segs as Segment[]);

const tArb = fc.oneof(fc.constantFrom(0, 1, 0.5), fc.double({ min: 0, max: 1, noNaN: true }), fc.constantFrom(5e-324, 1 - 1e-16));
const lambdaArb = fc.integer({ min: 0, max: 20 }).map((k) => k * 0.5); // 0..10 step 0.5

describe("router: lambda and Routing_Distance", () => {
  // Feature: gloam-web-app, Property 11: Raising lambda never shortens Routing_Distance
  // **Validates: Requirements 7.6, 16.5**
  it("route at a higher lambda has Routing_Distance at least that of a lower lambda", () => {
    fc.assert(
      fc.property(
        segmentsArb,
        settingsArb,
        fc.tuple(fc.nat(), tArb),
        fc.tuple(fc.nat(), tArb),
        fc.tuple(lambdaArb, lambdaArb).filter(([a, b]) => a !== b),
        (segs, settings, [e1, t1], [e2, t2], [la, lb]) => {
          const { graph } = buildGraph(segs);
          fc.pre(graph.edges.length > 0);
          const start = { edge: e1 % graph.edges.length, t: t1 };
          const end = { edge: e2 % graph.edges.length, t: t2 };
          const base = {
            graph,
            start,
            end,
            settings,
            overrides: new Map(),
            medianConfidence: medianConfidence(graph),
          };
          const l1 = Math.min(la, lb);
          const l2 = Math.max(la, lb);
          const r1 = findRoute({ ...base, lambda: l1 });
          const r2 = findRoute({ ...base, lambda: l2 });
          // Connectivity does not depend on lambda.
          expect(r1 === null).toBe(r2 === null);
          if (r1 && r2) {
            expect(r2.routingDistanceM).toBeGreaterThanOrEqual(
              r1.routingDistanceM - TOL * Math.max(1, r1.routingDistanceM),
            );
          }
        },
      ),
    );
  });

  // Design worked example. The graph is built by hand so lengths are exactly 100 / 75 / 75 m.
  //   P1: S -> E, segment "20", 100 m, lit 0.2 -> dread 0.8, Dark_Exposure 80, cost 100 + 80 lambda.
  //   P2: S -> M -> E, segments "10" and "11", 75 m each, lit 0.8 -> dread 0.2,
  //       Dark_Exposure 30, physical 150 m, cost 150 + 30 lambda.
  describe("worked example: dim 100 m street vs better-lit 150 m detour", () => {
    const edge = (segmentId: string, a: number, b: number, lengthM: number, lit: number): Edge => ({
      key: { segmentId, part: 0 },
      segmentId,
      part: 0,
      a,
      b,
      lengthM,
      litProbability: lit,
      confidence: 1,
      labelSource: "tagged_lit",
      highway: "residential",
      coordinates: [[101, 3], [101.001, 3]],
    });
    // Nodes: 0 = S, 1 = M, 2 = E. Edges in Canonical_Order: "10", "11", "20".
    const edges: Edge[] = [edge("10", 0, 1, 75, 0.8), edge("11", 1, 2, 75, 0.8), edge("20", 0, 2, 100, 0.2)];
    const graph: StreetGraph = {
      nodes: [{ lon: 101, lat: 3 }, { lon: 101.001, lat: 3 }, { lon: 101.002, lat: 3 }],
      edges,
      adjacency: [
        [{ edge: 0, to: 1, reverse: false }, { edge: 2, to: 2, reverse: false }],
        [{ edge: 0, to: 0, reverse: true }, { edge: 1, to: 2, reverse: false }],
        [{ edge: 1, to: 1, reverse: true }, { edge: 2, to: 0, reverse: true }],
      ],
    };
    const route = (lambda: number) =>
      findRoute({
        graph,
        start: { edge: 0, t: 0 }, // node S
        end: { edge: 1, t: 1 }, // node E
        lambda,
        settings: DEFAULT_SETTINGS,
        overrides: new Map(),
        medianConfidence: 1,
      })!;
    const ids = (r: ReturnType<typeof route>) => r.pieces.map((p) => graph.edges[p.edge]!.segmentId);

    it("lambda 0.5 picks P1 (140 vs 165)", () => {
      const r = route(0.5);
      expect(ids(r)).toEqual(["20"]);
      expect(r.cost).toBeCloseTo(140, 9);
    });

    it("lambda 1 is a true tie (180 vs 180) and the first segment id wins", () => {
      const r = route(1);
      expect(ids(r)).toEqual(["10", "11"]);
      expect(r.cost).toBeCloseTo(180, 9);
    });

    it("lambda 3 picks P2 (340 vs 240)", () => {
      const r = route(3);
      expect(ids(r)).toEqual(["10", "11"]);
      expect(r.cost).toBeCloseTo(240, 9);
    });

    it("going from lambda 0.5 to 3: distance 100 -> 150 and Dark_Exposure 80 -> 30", () => {
      const lo = route(0.5);
      const hi = route(3);
      expect(lo.physicalLengthM).toBe(100);
      expect(lo.routingDistanceM).toBe(100);
      expect(lo.darkExposure).toBeCloseTo(80, 9);
      expect(hi.physicalLengthM).toBe(150);
      expect(hi.routingDistanceM).toBe(150);
      expect(hi.darkExposure).toBeCloseTo(30, 9);
    });
  });
});
