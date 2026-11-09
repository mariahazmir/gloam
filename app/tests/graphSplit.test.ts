import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { buildGraph } from "../src/graph/build";
import { haversine } from "../src/geo/distance";
import type { LabelSource, Segment } from "../src/types";

type Pt = readonly [number, number];
const key = (p: Pt): string => `${p[0]},${p[1]}`;

// Points come from small grids so segments often share coordinates exactly.
// Two clusters far apart give disconnected parts.
const gridPoint: fc.Arbitrary<Pt> = fc
  .tuple(fc.constantFrom(0, 10), fc.integer({ min: 0, max: 3 }), fc.integer({ min: 0, max: 3 }))
  .map(([cluster, i, j]) => [cluster + i * 0.0005, 45 + cluster + j * 0.0005] as Pt);

const distinctConsecutive = (pts: Pt[]): boolean => pts.every((p, i) => i === 0 || key(p) !== key(pts[i - 1]!));

const openPath = fc.array(gridPoint, { minLength: 2, maxLength: 8 }).filter(distinctConsecutive);
const closedPath = fc
  .array(gridPoint, { minLength: 3, maxLength: 6 })
  .filter(distinctConsecutive)
  .map((pts) => [...pts, pts[0]!])
  .filter(distinctConsecutive);

const labelSource: fc.Arbitrary<LabelSource> = fc.constantFrom("tagged_lit", "tagged_unlit", "estimated");

const segmentsArb: fc.Arbitrary<Segment[]> = fc
  .array(
    fc.record({
      coords: fc.oneof(openPath, closedPath),
      name: fc.option(fc.string(), { nil: null }),
      highway: fc.constantFrom("residential", "primary", "footway", "service"),
      litProbability: fc.double({ min: 0, max: 1, noNaN: true }),
      confidence: fc.double({ min: 0, max: 1, noNaN: true }),
      labelSource,
    }),
    { minLength: 1, maxLength: 8 },
  )
  .map((rows) =>
    rows.map((r, i): Segment => ({
      id: `s${i}`,
      name: r.name,
      highway: r.highway,
      litProbability: r.litProbability,
      confidence: r.confidence,
      labelSource: r.labelSource,
      coordinates: r.coords,
    })),
  );

describe("graph construction splitting", () => {
  // Feature: gloam-web-app, Property 5: Graph construction splits at shared coordinates and preserves attributes and length
  // **Validates: Requirements 2.1, 2.2, 2.4, 2.5, 2.6, 16.10**
  it("splits at shared coordinates, keeps attributes and preserves length", () => {
    fc.assert(
      fc.property(segmentsArb, (segments) => {
        const { graph, rejected } = buildGraph(segments);
        expect(rejected).toEqual([]);

        // Count coordinate slots across all segments.
        const slots = new Map<string, number>();
        for (const s of segments) for (const p of s.coordinates) slots.set(key(p), (slots.get(key(p)) ?? 0) + 1);

        const nodeKeys = new Set(graph.nodes.map((n) => key([n.lon, n.lat])));
        expect(nodeKeys.size).toBe(graph.nodes.length);

        // Every shared coordinate and every endpoint is a node.
        for (const [k, n] of slots) if (n > 1) expect(nodeKeys.has(k)).toBe(true);
        for (const s of segments) {
          expect(nodeKeys.has(key(s.coordinates[0]!))).toBe(true);
          expect(nodeKeys.has(key(s.coordinates[s.coordinates.length - 1]!))).toBe(true);
        }

        // No edge has a node coordinate in its interior; ends are nodes.
        for (const e of graph.edges) {
          const c = e.coordinates;
          expect(key(c[0]!)).toBe(key([graph.nodes[e.a]!.lon, graph.nodes[e.a]!.lat]));
          expect(key(c[c.length - 1]!)).toBe(key([graph.nodes[e.b]!.lon, graph.nodes[e.b]!.lat]));
          for (let i = 1; i < c.length - 1; i++) expect(nodeKeys.has(key(c[i]!))).toBe(false);
        }

        for (const s of segments) {
          const mine = graph.edges.filter((e) => e.segmentId === s.id).sort((x, y) => x.part - y.part);
          expect(mine.length).toBeGreaterThan(0);

          // Attributes unchanged.
          for (const e of mine) {
            expect(e.litProbability).toBe(s.litProbability);
            expect(e.confidence).toBe(s.confidence);
            expect(e.labelSource).toBe(s.labelSource);
            expect(e.highway).toBe(s.highway);
          }

          // Pieces chain back into the original polyline.
          const rebuilt: Pt[] = [mine[0]!.coordinates[0] as Pt];
          for (const e of mine) for (const p of e.coordinates.slice(1)) rebuilt.push(p as Pt);
          expect(rebuilt.map(key)).toEqual(s.coordinates.map(key));

          // Lengths sum to polyline length within 0.001 m.
          let polyline = 0;
          for (let i = 1; i < s.coordinates.length; i++) {
            const a = s.coordinates[i - 1]!;
            const b = s.coordinates[i]!;
            polyline += haversine(a[0], a[1], b[0], b[1]);
          }
          const sum = mine.reduce((t, e) => t + e.lengthM, 0);
          expect(Math.abs(sum - polyline)).toBeLessThanOrEqual(0.001);
        }
      }),
    );
  });

  it("handles a closed segment and two disconnected parts without error", () => {
    const mk = (id: string, coordinates: Pt[]): Segment => ({
      id,
      name: null,
      highway: "residential",
      litProbability: 0.5,
      confidence: 0.5,
      labelSource: "estimated",
      coordinates,
    });
    const ring: Pt[] = [[0, 45], [0.001, 45], [0.001, 45.001], [0, 45]];
    const far: Pt[] = [[10, 55], [10.001, 55]];
    const { graph, rejected } = buildGraph([mk("ring", ring), mk("far", far)]);
    expect(rejected).toEqual([]);
    // Ring start and end are one node; the far segment adds two more.
    expect(graph.nodes).toHaveLength(3);
    expect(graph.edges.filter((e) => e.segmentId === "ring")).toHaveLength(1);
    expect(graph.edges.filter((e) => e.segmentId === "far")).toHaveLength(1);
  });
});
