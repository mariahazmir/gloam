// @vitest-environment node
import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { reportWeight } from "../../src/corrections/status";

// Feature: gloam-web-app, Property 19: Report weight halves every 30 days and never grows
// **Validates: Requirements 10.4, 16.14**

const MS_PER_DAY = 86_400_000;
const BASE = Date.UTC(2000, 0, 1);

/** Day offset from 2000-01-01 (0..60000 is about 164 years) as a YYYY-MM-DD string. */
function dateOf(dayOffset: number): string {
  return new Date(BASE + dayOffset * MS_PER_DAY).toISOString().slice(0, 10);
}

// Offsets are kept within 30,000 days (about 82 years) of each other. Beyond roughly
// 32,200 days of age, 0.5 ** (age / 30) underflows to exactly 0 in IEEE doubles.
const dayOffset = fc.integer({ min: 0, max: 30_000 });

describe("Property 19: report weight", () => {
  it("is in (0, 1], is 1 when date >= today, else 0.5^(days/30)", () => {
    fc.assert(
      fc.property(dayOffset, dayOffset, (c, t) => {
        const w = reportWeight(dateOf(c), dateOf(t));
        expect(w).toBeGreaterThan(0);
        expect(w).toBeLessThanOrEqual(1);
        if (c >= t) {
          expect(w).toBe(1);
        } else {
          expect(w).toBeCloseTo(0.5 ** ((t - c) / 30), 12);
        }
      }),
      { numRuns: 200 },
    );
  });

  it("never grows as today moves later (t1 <= t2)", () => {
    fc.assert(
      fc.property(dayOffset, dayOffset, dayOffset, (c, a, b) => {
        const t1 = Math.min(a, b);
        const t2 = Math.max(a, b);
        expect(reportWeight(dateOf(c), dateOf(t2))).toBeLessThanOrEqual(
          reportWeight(dateOf(c), dateOf(t1)),
        );
      }),
      { numRuns: 200 },
    );
  });

  it("halves exactly for every 30 days of extra age", () => {
    fc.assert(
      fc.property(dayOffset, fc.integer({ min: 0, max: 3000 }), (c, age) => {
        const w0 = reportWeight(dateOf(c), dateOf(c + age));
        const w30 = reportWeight(dateOf(c), dateOf(c + age + 30));
        expect(w30).toBeCloseTo(w0 / 2, 12);
      }),
      { numRuns: 200 },
    );
  });
});
