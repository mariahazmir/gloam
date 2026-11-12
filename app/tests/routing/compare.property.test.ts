import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { compareRoutes, type RouteSummary } from "../../src/routing/compare";
import { walkingMinutes } from "../../src/routing/format";

// Feature: gloam-web-app, Property 17: Route comparison deltas are signed differences, and equal routes give zero
// **Validates: Requirements 7.8, 7.9**

const meters = fc.double({ min: 0, max: 100_000, noNaN: true });
const summary: fc.Arbitrary<RouteSummary> = fc.record({
  distanceM: meters,
  darkerTierM: meters,
});

describe("Property 17: compareRoutes", () => {
  it("returns signed differences of displayed (rounded) values", () => {
    fc.assert(
      fc.property(summary, summary, (g, s) => {
        const d = compareRoutes(g, s);
        const gd = Math.round(g.distanceM);
        const sd = Math.round(s.distanceM);
        expect(d.extraMeters).toBe(gd - sd);
        expect(d.extraMinutes).toBe(walkingMinutes(gd) - walkingMinutes(sd));
        expect(d.darkerTierChangeM).toBe(Math.round(g.darkerTierM) - Math.round(s.darkerTierM));
      }),
    );
  });

  it("is antisymmetric when the routes are swapped", () => {
    fc.assert(
      fc.property(summary, summary, (a, b) => {
        const ab = compareRoutes(a, b);
        const ba = compareRoutes(b, a);
        expect(ab.extraMeters + ba.extraMeters).toBe(0);
        expect(ab.extraMinutes + ba.extraMinutes).toBe(0);
        expect(ab.darkerTierChangeM + ba.darkerTierChangeM).toBe(0);
      }),
    );
  });

  it("gives 0, 0 and 0 (not -0) when both summaries are the same route", () => {
    fc.assert(
      fc.property(summary, (r) => {
        const d = compareRoutes(r, { ...r });
        expect(Object.is(d.extraMeters, 0)).toBe(true);
        expect(Object.is(d.extraMinutes, 0)).toBe(true);
        expect(Object.is(d.darkerTierChangeM, 0)).toBe(true);
      }),
    );
  });

  it("matches hand-computed examples", () => {
    // 1200 m -> 1200*3/250 = 14.4 -> 15 min; 1000 m -> 12 min. Delta +200 m, +3 min.
    expect(
      compareRoutes({ distanceM: 1200, darkerTierM: 100 }, { distanceM: 1000, darkerTierM: 300 }),
    ).toEqual({ extraMeters: 200, extraMinutes: 3, darkerTierChangeM: -200 });
    // 1001 m -> 12.012 -> 13 min; 1000 m -> 12. Delta +1 m, +1 min.
    expect(
      compareRoutes({ distanceM: 1001, darkerTierM: 0 }, { distanceM: 1000, darkerTierM: 0 }),
    ).toEqual({ extraMeters: 1, extraMinutes: 1, darkerTierChangeM: 0 });
    // 1000.4 -> 1000 and 999.6 -> 1000: displayed equal, so zero. Darker 50.5 -> 51, 20.4 -> 20: +31.
    expect(
      compareRoutes({ distanceM: 1000.4, darkerTierM: 50.5 }, { distanceM: 999.6, darkerTierM: 20.4 }),
    ).toEqual({ extraMeters: 0, extraMinutes: 0, darkerTierChangeM: 31 });
  });

  it("rejects NaN, infinite and negative values naming the argument", () => {
    const ok = { distanceM: 10, darkerTierM: 0 };
    expect(() => compareRoutes({ distanceM: NaN, darkerTierM: 0 }, ok)).toThrow(/gloam\.distanceM/);
    expect(() => compareRoutes(ok, { distanceM: 10, darkerTierM: Infinity })).toThrow(/shortest\.darkerTierM/);
    expect(() => compareRoutes({ distanceM: -1, darkerTierM: 0 }, ok)).toThrow(/gloam\.distanceM/);
  });
});
