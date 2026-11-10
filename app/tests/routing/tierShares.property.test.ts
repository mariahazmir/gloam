// @vitest-environment node
import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { TIER_ORDER, tierShares } from "../../src/routing/tierShares";
import { formatDistance, walkingMinutes } from "../../src/routing/format";
import type { Route } from "../../src/routing/router";
import type { Tier } from "../../src/types";

// Feature: gloam-web-app, Property 16: Tier shares are whole percentages summing to exactly 100

// Build pieces where piece i has edge index i and the given length; tierOf looks the Tier up by index.
function build(items: ReadonlyArray<{ tier: Tier; len: number }>) {
  const pieces = items.map((it, i) => ({ edge: i, view: { lengthM: it.len } })) as unknown as Route["pieces"];
  return { pieces, tierOf: (edge: number): Tier => items[edge]!.tier };
}

const tierArb = fc.constantFrom<Tier>(...TIER_ORDER);
// Whole-metre lengths keep the exact shares free of float noise.
const itemsArb = fc
  .array(fc.record({ tier: tierArb, len: fc.integer({ min: 0, max: 100_000 }) }), { minLength: 1, maxLength: 30 })
  .filter((xs) => xs.reduce((s, x) => s + x.len, 0) > 0);

describe("Property 16: tier shares and walking time", () => {
  /** **Validates: Requirements 6.7, 16.22** */
  it("tierShares gives five non-negative integers summing to 100, each within 1 of exact", () => {
    fc.assert(
      fc.property(itemsArb, (items) => {
        const { pieces, tierOf } = build(items);
        const shares = tierShares(pieces, tierOf);
        const total = items.reduce((s, x) => s + x.len, 0);
        let sum = 0;
        for (const tier of TIER_ORDER) {
          const v = shares[tier];
          expect(Number.isInteger(v)).toBe(true);
          expect(v).toBeGreaterThanOrEqual(0);
          const exact = (100 * items.filter((x) => x.tier === tier).reduce((s, x) => s + x.len, 0)) / total;
          expect(Math.abs(v - exact)).toBeLessThan(1 + 1e-9);
          sum += v;
        }
        expect(sum).toBe(100);
      }),
      { numRuns: 200 },
    );
  });

  /** **Validates: Requirements 6.7, 16.22** */
  it("walkingMinutes is the smallest k with k x 5000 / 60 >= metres", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 1_000_000 }), (m) => {
        const k = walkingMinutes(m);
        expect(Number.isInteger(k)).toBe(true);
        // k x 5000 / 60 >= m  <=>  k x 250 >= 3m (integers)
        expect(k * 250 >= 3 * m).toBe(true);
        if (k > 0) expect((k - 1) * 250 >= 3 * m).toBe(false);
      }),
      { numRuns: 500 },
    );
  });

  // Hand-computed examples from design.md.
  it("three equal Tiers give 34, 33, 33 with the extra point to the earliest Tier", () => {
    // 100 x 100 / 300 = 33.33 each; floors sum to 99; confirmed_lit comes first and gets the point.
    const { pieces, tierOf } = build([
      { tier: "confirmed_lit", len: 100 },
      { tier: "mapped_unlit", len: 100 },
      { tier: "brighter_than_most", len: 100 },
    ]);
    expect(tierShares(pieces, tierOf)).toEqual({
      confirmed_lit: 34,
      mapped_unlit: 33,
      brighter_than_most: 33,
      typical: 0,
      darker_than_most: 0,
    });
  });

  it("500, 300, 200 m of 1000 m give 50, 30, 20", () => {
    const { pieces, tierOf } = build([
      { tier: "confirmed_lit", len: 500 },
      { tier: "typical", len: 300 },
      { tier: "darker_than_most", len: 200 },
    ]);
    expect(tierShares(pieces, tierOf)).toEqual({
      confirmed_lit: 50,
      mapped_unlit: 0,
      brighter_than_most: 0,
      typical: 30,
      darker_than_most: 20,
    });
  });

  it("walkingMinutes examples: 0 -> 0, 1000 -> 12, 1200 -> 15 (14.4), 1001 -> 13 (12.012)", () => {
    expect(walkingMinutes(0)).toBe(0);
    expect(walkingMinutes(1000)).toBe(12);
    expect(walkingMinutes(1200)).toBe(15);
    expect(walkingMinutes(1001)).toBe(13);
  });

  it("formatDistance examples: rounds to whole metres first", () => {
    expect(formatDistance(999)).toBe("999 m");
    expect(formatDistance(999.6)).toBe("1.0 km"); // rounds to 1000 m
    expect(formatDistance(1049)).toBe("1.0 km"); // round(10.49) = 10
    expect(formatDistance(1050)).toBe("1.1 km"); // round(10.5) = 11
  });

  it("rejects bad input with an error naming the argument", () => {
    expect(() => walkingMinutes(Number.NaN)).toThrow(/displayedMeters/);
    expect(() => formatDistance(-1)).toThrow(/meters/);
  });
});
