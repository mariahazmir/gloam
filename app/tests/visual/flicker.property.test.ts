import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { FLICKER_CAP, flickerBrightness, flickerParams, maxFlickerRate } from "../../src/visual/flicker";

// Feature: gloam-web-app, Property 27: Flicker never exceeds the cap
// **Validates: Requirements 4.7, 16.17**

const confidence = fc.oneof(fc.double({ min: 0, max: 1, noNaN: true }), fc.constantFrom(0, 0.5, 1));
const seed = fc.integer({ min: 0, max: 2 ** 32 - 1 });

const STEP_S = 0.01;
const DURATION_S = 10;

/**
 * Start times of dips (brightness below base) sampled at STEP_S over [-LEAD_IN_S, DURATION_S].
 * The lead-in means a dip under way at t = 0 still has its start recorded, so the gap
 * between it and the next dip is checked like any other.
 */
const LEAD_IN_S = 1;
function flashStarts(conf: number, sd: number): number[] {
  const starts: number[] = [];
  const steps = Math.round((DURATION_S + LEAD_IN_S) / STEP_S);
  let inDip = flickerBrightness(conf, sd, -LEAD_IN_S, 1) < 1;
  for (let i = 1; i <= steps; i++) {
    const t = -LEAD_IN_S + i * STEP_S;
    const dipping = flickerBrightness(conf, sd, t, 1) < 1;
    if (dipping && !inDip) starts.push(t);
    inDip = dipping;
  }
  return starts;
}

describe("Property 27: Flicker never exceeds the cap", () => {
  it("maxFlickerRate is at most the cap for any confidence in [0, 1]", () => {
    fc.assert(
      fc.property(confidence, (c) => {
        expect(maxFlickerRate(c)).toBeLessThanOrEqual(FLICKER_CAP);
      }),
      { numRuns: 100 },
    );
  });

  it("measured flashes never exceed the cap in any one-second window, and gaps respect the minimum", () => {
    fc.assert(
      fc.property(confidence, seed, (c, sd) => {
        const { meanIntervalS, jitter } = flickerParams(c);
        const minGap = meanIntervalS * (1 - jitter);
        const starts = flashStarts(c, sd);
        for (let i = 1; i < starts.length; i++) {
          // Allow one sampling step of slack on each start time.
          expect(starts[i]! - starts[i - 1]!).toBeGreaterThanOrEqual(minGap - 2 * STEP_S - 1e-9);
        }
        // More than CAP starts inside a one-second window would exceed the cap.
        for (let i = 0; i + FLICKER_CAP < starts.length; i++) {
          expect(starts[i + FLICKER_CAP]! - starts[i]!).toBeGreaterThanOrEqual(1 - 1e-9);
        }
      }),
      { numRuns: 100 },
    );
  });

  it("example: lowest confidence flickers fastest, at 8/3 flashes per second", () => {
    // mean = 0.75, jitter = 0.5, so 1 / (0.75 * 0.5) = 2.666...
    expect(maxFlickerRate(0)).toBeCloseTo(8 / 3, 10);
  });
});
