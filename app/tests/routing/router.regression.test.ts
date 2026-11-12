// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { Edge, StreetGraph } from "../../src/graph/build";
import type { SnapPoint } from "../../src/graph/snap";
import { DEFAULT_SETTINGS } from "../../src/routing/costs";
import { findRoute, type RouteRequest } from "../../src/routing/router";
import { bruteForce } from "./helpers/bruteForce";

// Regression: a Task 6.4 counterexample. start.t = 5e-324 on one edge and end.t ~ 7e-308 on a parallel
// edge made piece costs vanish below float resolution, and findRoute returned null for a connected pair.
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
const snap = (edge: number, t: number): SnapPoint => ({ edge, t, lon: 0, lat: 0, distanceM: 0 });
const base: RouteRequest = {
  graph,
  start: snap(0, 5e-324),
  end: snap(1, 7e-308),
  lambda: 1,
  settings: DEFAULT_SETTINGS,
  overrides: new Map(),
  medianConfidence: 0.5,
};

describe("router regression: denormal snap positions on parallel edges", () => {
  it("returns a route when start.t = 5e-324 and end.t ~ 7e-308 on parallel edges", () => {
    const route = findRoute(base);
    expect(route).not.toBeNull();
    // Both positions are within 1 mm of node 0, so they collapse to the same node: nothing to walk.
    expect(route!.pieces).toEqual([]);
    expect(bruteForce(base).minCost).toBe(0);
  });

  it("returns a route when a denormal start is paired with an end at the far node", () => {
    const req: RouteRequest = { ...base, end: snap(1, 1 - 1e-16), lambda: 0 };
    const route = findRoute(req);
    expect(route).not.toBeNull();
    // Collapsed start is node 0, collapsed end is node 1; cheapest at lambda 0 is B (50 m).
    expect(route!.pieces).toHaveLength(1);
    expect(route!.pieces[0]).toMatchObject({ edge: 1, reverse: false, fromT: 0, toT: 1 });
    expect(route!.cost).toBeCloseTo(50, 9);
    expect(bruteForce(req).minCost!).toBeCloseTo(50, 9);
  });
});
