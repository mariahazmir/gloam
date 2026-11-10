// @vitest-environment node
import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  DEFAULT_SETTINGS,
  adjustedDread,
  edgeCost,
  routingLength,
  type EdgeView,
  type PersonalSettings,
} from "../../src/routing/costs";

const EPS = 1e-9;
const unit = fc.double({ min: 0, max: 1, noNaN: true });
const settings: fc.Arbitrary<PersonalSettings> = fc.record({
  avoidSteps: fc.boolean(),
  avoidService: fc.boolean(),
  preferMain: fc.boolean(),
  lowConfidenceDarker: fc.boolean(),
});
const highway = fc.constantFrom(
  "steps", "service", "primary", "secondary", "tertiary", "residential", "footway", "path", "unclassified",
);
const edgeView: fc.Arbitrary<EdgeView> = fc.record({
  lengthM: fc.double({ min: 1, max: 5000, noNaN: true }),
  litProbability: unit,
  confidence: unit,
  highway,
});

function dreadRef(lit: number, conf: number): number {
  const raw = 1 - lit;
  return raw + (1 - conf) * Math.max(0, 0.5 - raw);
}

function expectedN(hw: string, s: PersonalSettings): number {
  const main = hw === "primary" || hw === "secondary" || hw === "tertiary";
  return (
    (s.avoidSteps && hw === "steps" ? 1 : 0) +
    (s.avoidService && hw === "service" ? 1 : 0) +
    (s.preferMain && !main ? 1 : 0)
  );
}

describe("settings effects on cost", () => {
  // Feature: gloam-web-app, Property 14: Settings change cost exactly as specified
  // **Validates: Requirements 8.3, 8.4**
  it("routingLength is lengthM x (1 + matching toggles), and lengthM when all are off", () => {
    fc.assert(
      fc.property(edgeView, settings, (v, s) => {
        const n = expectedN(v.highway, s);
        expect(Math.abs(routingLength(v, s) - v.lengthM * (1 + n))).toBeLessThanOrEqual(EPS * v.lengthM);
        expect(routingLength(v, DEFAULT_SETTINGS)).toBe(v.lengthM);
      }),
    );
  });

  // **Validates: Requirements 8.3, 8.4**
  it("low-confidence toggle uses confidence 0 only when confidence is strictly below the median", () => {
    fc.assert(
      fc.property(edgeView, settings, unit, (v, s, median) => {
        const c = s.lowConfidenceDarker && v.confidence < median ? 0 : v.confidence;
        expect(Math.abs(adjustedDread(v, s, median) - dreadRef(v.litProbability, c))).toBeLessThanOrEqual(EPS);
      }),
    );
  });

  // **Validates: Requirements 8.3, 8.4**
  it("edgeCost equals routingLength + lambda x lengthM x adjustedDread", () => {
    fc.assert(
      fc.property(edgeView, settings, unit, fc.double({ min: 0, max: 10, noNaN: true }), (v, s, median, lambda) => {
        const c = s.lowConfidenceDarker && v.confidence < median ? 0 : v.confidence;
        const expected = v.lengthM * (1 + expectedN(v.highway, s)) + lambda * v.lengthM * dreadRef(v.litProbability, c);
        expect(Math.abs(edgeCost(v, lambda, s, median) - expected)).toBeLessThanOrEqual(EPS * Math.max(1, expected));
      }),
    );
  });

  it("hand-computed example: steps, lit 0.8, conf 0.4, median 0.5, toggles on, lambda 2, 100 m", () => {
    // raw 0.2; conf below median -> 0; dread = 0.2 + 1 * 0.3 = 0.5
    // penalties: avoidSteps + preferMain = 2 -> routingLength 300; cost = 300 + 2*100*0.5 = 400
    const v: EdgeView = { lengthM: 100, litProbability: 0.8, confidence: 0.4, highway: "steps" };
    const s: PersonalSettings = { avoidSteps: true, avoidService: true, preferMain: true, lowConfidenceDarker: true };
    expect(routingLength(v, s)).toBe(300);
    expect(adjustedDread(v, s, 0.5)).toBeCloseTo(0.5, 12);
    expect(edgeCost(v, 2, s, 0.5)).toBeCloseTo(400, 9);
    // confidence equal to median is unchanged: dread = 0.2 + 0.6*0.3 = 0.38
    expect(adjustedDread({ ...v, confidence: 0.5 }, s, 0.5)).toBeCloseTo(0.2 + 0.5 * 0.3, 12);
  });
});
