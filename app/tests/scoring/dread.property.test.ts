// @vitest-environment node
import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { dread } from "../../src/scoring/dread";

const EPS = 1e-9;
const unit = fc.double({ min: 0, max: 1, noNaN: true });

describe("dread", () => {
  // Feature: gloam-web-app, Property 1: Dread is bounded, finite and matches the formula
  // **Validates: Requirements 7.2, 16.1, 16.2**
  it("is bounded, finite and matches the formula", () => {
    fc.assert(
      fc.property(unit, unit, (lit, confidence) => {
        const raw = 1 - lit;
        const d = dread(lit, confidence);
        expect(Number.isFinite(d)).toBe(true);
        expect(d).toBeGreaterThanOrEqual(0 - EPS);
        expect(d).toBeLessThanOrEqual(1 + EPS);
        expect(Math.abs(d - (raw + (1 - confidence) * Math.max(0, 0.5 - raw)))).toBeLessThanOrEqual(EPS);
        if (raw >= 0.5) expect(Math.abs(d - raw)).toBeLessThanOrEqual(EPS);
        if (raw < 0.5) expect(d).toBeLessThanOrEqual(0.5 + EPS);
      }),
      { numRuns: 200 },
    );
  });

  it("equals raw when confidence is 1", () => {
    fc.assert(
      fc.property(unit, (lit) => {
        expect(Math.abs(dread(lit, 1) - (1 - lit))).toBeLessThanOrEqual(EPS);
      }),
      { numRuns: 200 },
    );
  });

  // Hand-checked in the design: [litProbability, confidence, expected dread]
  it.each([
    [0.2, 0.5, 0.8],
    [0.7, 0.5, 0.4],
    [0.9, 0, 0.5],
    [0.5, 0, 0.5],
    [0.9, 1, 0.1],
  ])("dread(%f, %f) is %f", (lit, confidence, expected) => {
    expect(Math.abs(dread(lit, confidence) - expected)).toBeLessThanOrEqual(EPS);
  });
});
