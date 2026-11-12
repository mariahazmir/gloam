// @vitest-environment node
import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { buildGraph } from "../../src/graph/build";
import type { SnapPoint } from "../../src/graph/snap";
import { findRoute } from "../../src/routing/router";
import { effectiveAttrs, medianConfidence, type PersonalSettings } from "../../src/routing/costs";
import { overrideFor, type Override } from "../../src/scoring/overrides";
import { assignTiers } from "../../src/scoring/tiers";
import { statusBySegment } from "../../src/corrections/status";
import type { Correction } from "../../src/corrections/store";
import type { ReportType, Segment } from "../../src/types";

// Feature: gloam-web-app, Property 21: Notes change per-user values only, never Tiers or status-driven routing
// **Validates: Requirements 10.3, 10.11, 10.12**

const unit = fc.double({ min: 0, max: 1, noNaN: true });
const highway = fc.constantFrom("steps", "service", "primary", "residential", "footway", "tertiary");
const labelSource = fc.constantFrom("tagged_lit", "tagged_unlit", "estimated") as fc.Arbitrary<
  Segment["labelSource"]
>;
const reportType = fc.constantFrom("actually_lit", "actually_dark", "light_is_out") as fc.Arbitrary<ReportType>;
const settingsArb: fc.Arbitrary<PersonalSettings> = fc.record({
  avoidSteps: fc.boolean(),
  avoidService: fc.boolean(),
  preferMain: fc.boolean(),
  lowConfidenceDarker: fc.boolean(),
});

const GRID = 4;
const pointArb = fc.record({ i: fc.integer({ min: 0, max: GRID - 1 }), j: fc.integer({ min: 0, max: GRID - 1 }) });
const segmentArb = fc
  .record({ a: pointArb, b: pointArb, highway, litProbability: unit, confidence: unit, labelSource })
  .filter((s) => s.a.i !== s.b.i || s.a.j !== s.b.j);

const dateArb = fc
  .integer({ min: 1, max: 28 })
  .map((d) => `2025-01-${String(d).padStart(2, "0")}`);
const TODAY = "2025-02-01";

const caseArb = fc
  .record({
    segs: fc.array(segmentArb, { minLength: 1, maxLength: 14 }),
    // Which segments carry a note on this device, and of which type.
    noteMask: fc.array(fc.option(reportType, { nil: undefined }), { minLength: 14, maxLength: 14 }),
    // Community corrections (several per segment so statuses can actually form).
    community: fc.array(fc.record({ pick: fc.nat(), type: reportType, date: dateArb }), { maxLength: 40 }),
    startPick: fc.nat(),
    endPick: fc.nat(),
    startT: unit,
    endT: unit,
    lambda: fc.double({ min: 0, max: 10, noNaN: true }),
    settings: settingsArb,
  })
  .map((c) => {
    const segments: Segment[] = c.segs.map((s, n) => ({
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
    const notes = new Map<string, ReportType>();
    segments.forEach((s, n) => {
      const t = c.noteMask[n];
      if (t !== undefined) notes.set(s.id, t);
    });
    const corrections: Correction[] = c.community.map((x) => ({
      segmentId: segments[x.pick % segments.length]!.id,
      type: x.type,
      date: x.date,
    }));
    return { segments, notes, corrections, c };
  });

describe("Property 21: Notes change per-user values only, never Tiers or status-driven routing", () => {
  it("overrides change exactly the noted Edges' effective values; Tiers and pack values are untouched", () => {
    fc.assert(
      fc.property(caseArb, ({ segments, notes }) => {
        const { graph } = buildGraph(segments);
        const segmentsBefore = JSON.stringify(segments);
        const edgesBefore = JSON.stringify(graph.edges);
        const tiersBefore = assignTiers(segments);

        const overrides = new Map<string, Override>();
        for (const [id, t] of notes) overrides.set(id, overrideFor(t));

        for (const e of graph.edges) {
          const v = effectiveAttrs(e, overrides);
          const t = notes.get(e.segmentId);
          if (t !== undefined) {
            expect(v.litProbability).toBe(t === "actually_lit" ? 1 : 0);
            expect(v.confidence).toBe(1);
          } else {
            expect(v.litProbability).toBe(e.litProbability);
            expect(v.confidence).toBe(e.confidence);
          }
          expect(v.lengthM).toBe(e.lengthM);
          expect(v.highway).toBe(e.highway);
        }

        // Tiers come from pack values only, so notes cannot move them.
        const tiersAfter = assignTiers(segments);
        expect([...tiersAfter]).toEqual([...tiersBefore]);
        // Applying overrides did not mutate the pack or the graph.
        expect(JSON.stringify(segments)).toBe(segmentsBefore);
        expect(JSON.stringify(graph.edges)).toBe(edgesBefore);
      }),
      { numRuns: 100 },
    );
  });

  it("findRoute is identical whether or not Community_Statuses are computed", () => {
    fc.assert(
      fc.property(caseArb, ({ segments, notes, corrections, c }) => {
        const { graph } = buildGraph(segments);
        const n = graph.edges.length;
        const overrides = new Map<string, Override>();
        for (const [id, t] of notes) overrides.set(id, overrideFor(t));
        const req = {
          graph,
          start: { edge: c.startPick % n, t: c.startT } as SnapPoint,
          end: { edge: c.endPick % n, t: c.endT } as SnapPoint,
          lambda: c.lambda,
          settings: c.settings,
          overrides,
          medianConfidence: medianConfidence(graph),
        };
        const before = findRoute(req);
        statusBySegment(corrections, TODAY); // computing statuses must have no effect on routing
        const after = findRoute(req);
        expect(after).toEqual(before);
      }),
      { numRuns: 100 },
    );
  });

  it("unit example: a lit note on a dark segment sets 1 and 1 on its Edge only", () => {
    const mk = (id: string, lit: number): Segment => ({
      id,
      name: null,
      highway: "residential",
      litProbability: lit,
      confidence: 0.25,
      labelSource: "estimated",
      coordinates: [
        [101, 3],
        [101.001, 3],
      ],
    });
    const segs = [mk("a", 0.2), mk("b", 0.4)];
    const { graph } = buildGraph(segs);
    const overrides = new Map([["a", overrideFor("actually_lit")]]);
    expect(effectiveAttrs(graph.edges[0]!, overrides)).toMatchObject({ litProbability: 1, confidence: 1 });
    expect(effectiveAttrs(graph.edges[1]!, overrides)).toMatchObject({ litProbability: 0.4, confidence: 0.25 });
  });
});
