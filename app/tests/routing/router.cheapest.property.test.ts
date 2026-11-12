// @vitest-environment node
import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { buildGraph, type Edge, type StreetGraph } from "../../src/graph/build";
import { DEFAULT_SETTINGS, type PersonalSettings } from "../../src/routing/costs";
import { findRoute, type RouteRequest } from "../../src/routing/router";
import type { Override } from "../../src/scoring/overrides";
import type { Segment } from "../../src/types";
import { bruteForce } from "./helpers/bruteForce";

const TOL = 1e-6; // Comparison_Tolerance

const unit = fc.double({ min: 0, max: 1, noNaN: true });
const highway = fc.constantFrom("steps", "service", "primary", "residential", "footway");
const settings: fc.Arbitrary<PersonalSettings> = fc.record({
  avoidSteps: fc.boolean(),
  avoidService: fc.boolean(),
  preferMain: fc.boolean(),
  lowConfidenceDarker: fc.boolean(),
});
// Mostly end points and the midpoint (exercise node snaps and shared cuts), sometimes any value.
// Full range [0, 1], including denormals such as 5e-324 (the router collapses positions within 1 mm of an end).
const tValue = fc.oneof(
  fc.constantFrom(0, 1, 0.5),
  fc.integer({ min: 0, max: 1000 }).map((k) => k / 1000),
  fc.double({ min: 0, max: 1, noNaN: true }),
  fc.constantFrom(5e-324, 7e-308, 1 - 1e-16),
);

/** 2 to 5 nodes on distinct coordinates; 1 to 8 straight two-point segments (parallel edges allowed). */
const segments: fc.Arbitrary<Segment[]> = fc.integer({ min: 2, max: 5 }).chain((n) =>
  fc
    .array(
      fc.record({
        a: fc.integer({ min: 0, max: n - 1 }),
        b: fc.integer({ min: 0, max: n - 1 }),
        lit: unit,
        conf: unit,
        hw: highway,
      }),
      { minLength: 1, maxLength: 8 },
    )
    .map((rows) =>
      rows
        .filter((r) => r.a !== r.b)
        .map(
          (r, i): Segment => ({
            id: `s${i}`,
            name: null,
            highway: r.hw,
            litProbability: r.lit,
            confidence: r.conf,
            labelSource: "estimated",
            coordinates: [
              [101 + r.a * 0.001, 3 + (r.a % 2) * 0.001],
              [101 + r.b * 0.001, 3 + (r.b % 2) * 0.001],
            ],
          }),
        ),
    )
    .filter((segs) => segs.length > 0),
);

const request: fc.Arbitrary<RouteRequest> = segments.chain((segs) => {
  const graph = buildGraph(segs).graph;
  const edgeIdx = fc.integer({ min: 0, max: graph.edges.length - 1 });
  const point = fc.record({ edge: edgeIdx, t: tValue });
  const overrides = fc
    .array(
      fc.record({
        id: fc.integer({ min: 0, max: segs.length - 1 }),
        lit: fc.constantFrom<0 | 1>(0, 1),
      }),
      { maxLength: 3 },
    )
    .map((rows) => new Map<string, Override>(rows.map((r) => [`s${r.id}`, { litProbability: r.lit, confidence: 1 }])));
  return fc.record({
    graph: fc.constant(graph),
    start: point,
    end: point,
    lambda: fc.double({ min: 0, max: 10, noNaN: true }),
    settings,
    overrides,
    medianConfidence: unit,
  });
});

describe("router cheapest route", () => {
  // Feature: gloam-web-app, Property 9: The router returns a cheapest route
  // **Validates: Requirements 7.3, 7.4**
  it("findRoute cost equals the brute-force minimum, and at lambda 0 so does Routing_Distance", () => {
    fc.assert(
      fc.property(request, (req) => {
        const oracle = bruteForce(req);
        const route = findRoute(req);
        if (oracle.minCost === null) {
          expect(route).toBeNull();
          return;
        }
        expect(route).not.toBeNull();
        expect(Math.abs(route!.cost - oracle.minCost)).toBeLessThanOrEqual(TOL);

        const r0 = findRoute({ ...req, lambda: 0 });
        const o0 = bruteForce({ ...req, lambda: 0 });
        expect(r0).not.toBeNull();
        expect(Math.abs(r0!.routingDistanceM - o0.minRouting!)).toBeLessThanOrEqual(TOL);
      }),
      { verbose: true },
    );
  });

  // Hand-checked: two parallel edges between nodes 0 and 1.
  //   A: 100 m, lit 1 (dread 0).  B: 50 m, lit 0, confidence 1 (dread 1).  Start and end are the two nodes.
  //   cost(A) = 100 + lambda*100*0 = 100.  cost(B) = 50 + lambda*50*1 = 50 + 50*lambda.
  //   lambda 0: B = 50 beats A = 100.  lambda 1: tie at 100.  lambda 2: A = 100 beats B = 150.
  const mkEdge = (id: string, len: number, lit: number): Edge => ({
    key: { segmentId: id, part: 0 },
    segmentId: id,
    part: 0,
    a: 0,
    b: 1,
    lengthM: len,
    litProbability: lit,
    confidence: 1,
    labelSource: "estimated",
    highway: "residential",
    coordinates: [],
  });
  const graph: StreetGraph = {
    nodes: [
      { lon: 0, lat: 0 },
      { lon: 0, lat: 0 },
    ],
    edges: [mkEdge("A", 100, 1), mkEdge("B", 50, 0)],
    adjacency: [
      [
        { edge: 0, to: 1, reverse: false },
        { edge: 1, to: 1, reverse: false },
      ],
      [
        { edge: 0, to: 0, reverse: true },
        { edge: 1, to: 0, reverse: true },
      ],
    ],
  };
  const base: RouteRequest = {
    graph,
    start: { edge: 0, t: 0 },
    end: { edge: 0, t: 1 },
    lambda: 0,
    settings: DEFAULT_SETTINGS,
    overrides: new Map(),
    medianConfidence: 0.5,
  };

  it.each([
    [0, 50],
    [1, 100],
    [2, 100],
  ])("hand-checked two-edge example at lambda %d costs %d", (lambda, expected) => {
    const req = { ...base, lambda };
    expect(findRoute(req)!.cost).toBeCloseTo(expected, 9);
    expect(bruteForce(req).minCost!).toBeCloseTo(expected, 9);
  });
});
