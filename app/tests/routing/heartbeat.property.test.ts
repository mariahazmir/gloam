// @vitest-environment node
import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  describeHeartbeat,
  heartbeatSeries,
  highestQuarterThreshold,
  lowConfidenceThreshold,
} from "../../src/routing/heartbeat";
import { formatDistance } from "../../src/routing/format";
import type { Route, RoutePiece } from "../../src/routing/router";
import type { EdgeView } from "../../src/routing/costs";

const EPS = 1e-9;
const unit = fc.double({ min: 0, max: 1, noNaN: true });

/** Independent reference for Dread: raw = 1 - p; raw + (1 - c) * max(0, 0.5 - raw). */
function refDread(p: number, c: number): number {
  const raw = 1 - p;
  return raw + (1 - c) * Math.max(0, 0.5 - raw);
}

const view: fc.Arbitrary<EdgeView> = fc.record({
  lengthM: fc.double({ min: 1, max: 500, noNaN: true }),
  litProbability: unit,
  confidence: unit,
  highway: fc.constantFrom("primary", "residential", "footway", "steps", "service"),
});

function makeRoute(views: EdgeView[]): Route {
  const pieces: RoutePiece[] = views.map((v, i) => ({
    edge: i,
    reverse: false,
    sub: 0,
    fromT: 0,
    toT: 1,
    view: v,
  }));
  const total = views.reduce((s, v) => s + v.lengthM, 0);
  return { pieces, physicalLengthM: total, routingDistanceM: total, darkExposure: 0, cost: 0 };
}

const routeViews = fc.array(view, { minLength: 1, maxLength: 25 });
const confList = fc.array(unit, { minLength: 0, maxLength: 60 });

/** Merge runs of flagged pieces into [from, to] spans (pieces are always adjacent). */
function runs(flags: boolean[], x0: number[], x1: number[]): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  flags.forEach((f, i) => {
    if (!f) return;
    if (i > 0 && flags[i - 1]) out[out.length - 1]![1] = x1[i]!;
    else out.push([x0[i]!, x1[i]!]);
  });
  return out;
}

describe("Property 18: Heartbeat series and summary match the route", () => {
  /** **Validates: Requirements 9.1, 9.2** */
  it("x ranges are contiguous from 0 to the total; y equals each piece's Dread in [0, 1]", () => {
    fc.assert(
      fc.property(routeViews, confList, (views, confs) => {
        const route = makeRoute(views);
        const s = heartbeatSeries(route, lowConfidenceThreshold(confs));
        expect(s.segments).toHaveLength(views.length);
        expect(s.segments[0]!.x0).toBe(0);
        let sum = 0;
        s.segments.forEach((seg, i) => {
          if (i > 0) expect(seg.x0).toBe(s.segments[i - 1]!.x1);
          sum += views[i]!.lengthM;
          expect(seg.x1 - seg.x0).toBeCloseTo(views[i]!.lengthM, 6);
          expect(Math.abs(seg.y - refDread(views[i]!.litProbability, views[i]!.confidence))).toBeLessThan(EPS);
          expect(seg.y).toBeGreaterThanOrEqual(0);
          expect(seg.y).toBeLessThanOrEqual(1);
        });
        expect(s.segments[s.segments.length - 1]!.x1).toBe(s.totalM);
        expect(Math.abs(s.totalM - sum)).toBeLessThan(1e-6);
      }),
    );
  });

  /** **Validates: Requirements 9.2** */
  it("a piece with higher Dread plots strictly higher than one with lower Dread", () => {
    fc.assert(
      fc.property(routeViews, (views) => {
        const s = heartbeatSeries(makeRoute(views), null);
        const d = views.map((v) => refDread(v.litProbability, v.confidence));
        for (let i = 0; i < d.length; i++) {
          for (let j = 0; j < d.length; j++) {
            if (d[i]! > d[j]! + EPS) expect(s.segments[i]!.y).toBeGreaterThan(s.segments[j]!.y);
          }
        }
      }),
    );
  });

  /** **Validates: Requirements 9.3** */
  it("low-confidence markers are present exactly on pieces at or below the lowest-quarter threshold", () => {
    fc.assert(
      fc.property(routeViews, confList, (views, confs) => {
        const th = lowConfidenceThreshold(confs);
        if (confs.length === 0) expect(th).toBeNull();
        else {
          const sorted = [...confs].sort((a, b) => a - b);
          expect(th).toBe(sorted[Math.ceil(confs.length / 4) - 1]);
          expect(confs.filter((c) => c <= th!).length).toBeGreaterThanOrEqual(Math.ceil(confs.length / 4));
        }
        const s = heartbeatSeries(makeRoute(views), th);
        s.segments.forEach((seg, i) => {
          expect(seg.lowConfidence).toBe(th !== null && views[i]!.confidence <= th);
        });
      }),
    );
  });

  /** **Validates: Requirements 9.4** */
  it("highest-quarter Dread flags match the threshold and always include the top piece", () => {
    fc.assert(
      fc.property(routeViews, (views) => {
        const s = heartbeatSeries(makeRoute(views), null);
        const ys = s.segments.map((g) => g.y);
        const sorted = [...ys].sort((a, b) => a - b);
        const th = sorted[ys.length - Math.ceil(ys.length / 4)]!;
        expect(highestQuarterThreshold(ys)).toBe(th);
        s.segments.forEach((seg) => {
          expect(seg.highDread).toBe(seg.y >= th);
        });
        expect(s.segments.some((x) => x.highDread)).toBe(true);
      }),
    );
  });

  /** **Validates: Requirements 9.4, 9.5** */
  it("the summary gives total distance and merged spans of each flagged stretch, or says none were found", () => {
    fc.assert(
      fc.property(routeViews, confList, (views, confs) => {
        const s = heartbeatSeries(makeRoute(views), lowConfidenceThreshold(confs));
        const text = describeHeartbeat(s);
        const x0 = s.segments.map((g) => g.x0);
        const x1 = s.segments.map((g) => g.x1);
        expect(text).toContain(`Route length ${formatDistance(s.totalM)}.`);

        const span = ([a, b]: [number, number]) => `${Math.round(a)} m to ${Math.round(b)} m`;
        const low = runs(s.segments.map((g) => g.lowConfidence), x0, x1);
        if (low.length === 0) {
          expect(text).toContain("No low-confidence stretches were found");
        } else {
          expect(text).not.toContain("No low-confidence stretches were found");
          const lowPart = text.slice(text.indexOf("Low-confidence stretches"));
          for (const r of low) expect(lowPart).toContain(span(r));
          expect(lowPart.split("; ")).toHaveLength(low.length);
        }
        const high = runs(s.segments.map((g) => g.highDread), x0, x1);
        const highPart = text.slice(text.indexOf("Highest-dread"), text.indexOf("Low-confidence stretches") === -1 ? undefined : text.indexOf("Low-confidence stretches"));
        for (const r of high) expect(highPart).toContain(span(r));
        expect(highPart.split("; ")).toHaveLength(high.length);
      }),
    );
  });

  /** **Validates: Requirements 9.5** */
  it("with an empty confidence list no piece is flagged and the summary says so", () => {
    fc.assert(
      fc.property(routeViews, (views) => {
        const s = heartbeatSeries(makeRoute(views), lowConfidenceThreshold([]));
        expect(s.segments.every((g) => !g.lowConfidence)).toBe(true);
        expect(describeHeartbeat(s)).toContain("No low-confidence stretches were found");
      }),
    );
  });
});

describe("heartbeat hand-computed examples", () => {
  it("threshold index is ceil(n/4) - 1: 8 values give index 1, 10 values give index 2", () => {
    expect(lowConfidenceThreshold([0.8, 0.1, 0.5, 0.2, 0.7, 0.3, 0.6, 0.4])).toBe(0.2);
    expect(lowConfidenceThreshold([1, 0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3, 0.2, 0.1])).toBe(0.3);
    expect(lowConfidenceThreshold([])).toBeNull();
  });

  it("highest-quarter index is m - ceil(m/4): 8 values give index 6, 5 values give index 3", () => {
    expect(highestQuarterThreshold([0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8])).toBe(0.7);
    expect(highestQuarterThreshold([0.5, 0.1, 0.4, 0.2, 0.3])).toBe(0.4);
    expect(highestQuarterThreshold([])).toBeNull();
  });

  it("two-piece route: 100 m (p 0.8, c 0.5 -> 0.35) then 50 m (p 0.2, c 0.9 -> 0.8)", () => {
    // piece 1: raw 0.2, 0.2 + 0.5 * 0.3 = 0.35. piece 2: raw 0.8, max(0, -0.3) = 0, so 0.8.
    const route = makeRoute([
      { lengthM: 100, litProbability: 0.8, confidence: 0.5, highway: "residential" },
      { lengthM: 50, litProbability: 0.2, confidence: 0.9, highway: "residential" },
    ]);
    const s = heartbeatSeries(route, 0.5);
    expect(s.totalM).toBe(150);
    expect(s.segments[0]!.y).toBeCloseTo(0.35, 9);
    expect(s.segments[1]!.y).toBeCloseTo(0.8, 9);
    expect(s.segments.map((g) => g.lowConfidence)).toEqual([true, false]);
    expect(s.segments.map((g) => g.highDread)).toEqual([false, true]);
    const text = describeHeartbeat(s);
    expect(text).toContain("Route length 150 m.");
    expect(text).toContain("100 m to 150 m");
    expect(text).toContain("0 m to 100 m");
  });

  it("rejects NaN and out-of-range inputs, naming the argument", () => {
    expect(() => lowConfidenceThreshold([0.5, NaN])).toThrow(/estimatedConfidences/);
    expect(() => highestQuarterThreshold([1.5])).toThrow(/dreads/);
    const route = makeRoute([{ lengthM: 10, litProbability: 0.5, confidence: 0.5, highway: "path" }]);
    expect(() => heartbeatSeries(route, 2)).toThrow(/lowConfThreshold/);
  });
});
