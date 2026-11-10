import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { assignTiers } from "../../src/scoring/tiers";
import type { LabelSource, Tier } from "../../src/types";

// Feature: gloam-web-app, Property 7: Tier assignment is total, rule-correct and rank-monotone
// **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.11, 16.11**

const TIERS: readonly Tier[] = [
  "confirmed_lit",
  "mapped_unlit",
  "brighter_than_most",
  "typical",
  "darker_than_most",
];
// Order for estimated tiers: lower index = brighter.
const ESTIMATED_ORDER: readonly Tier[] = ["brighter_than_most", "typical", "darker_than_most"];

interface Seg {
  id: string;
  labelSource: LabelSource;
  litProbability: number;
  confidence: number;
}

const probability = fc.oneof(
  fc.double({ min: 0, max: 1, noNaN: true }),
  fc.constantFrom(0, 0.25, 0.5, 0.75, 1), // forces ties
);

const labelSource = fc.constantFrom<LabelSource>("tagged_lit", "tagged_unlit", "estimated");

// Unique ids come from the index, so they can never collide.
const segmentList = fc
  .array(fc.record({ labelSource, litProbability: probability, confidence: probability }), {
    maxLength: 60,
  })
  .map((items): Seg[] => items.map((s, i) => ({ id: `seg-${i}`, ...s })));

/** Independent re-statement of the rank rule using integer arithmetic. */
function expectedEstimatedTier(p: number, estimated: readonly Seg[]): Tier {
  const total = estimated.length;
  const higher = estimated.filter((s) => s.litProbability > p).length;
  if (higher * 5 < total * 2) return "brighter_than_most";
  if (higher * 4 >= total * 3) return "darker_than_most";
  return "typical";
}

describe("Property 7: tier assignment", () => {
  it("is total and gives exactly one valid tier per segment", () => {
    fc.assert(
      fc.property(segmentList, (segments) => {
        const result = assignTiers(segments);
        expect(result.size).toBe(segments.length);
        for (const s of segments) {
          expect(TIERS).toContain(result.get(s.id));
        }
      }),
      { numRuns: 100 },
    );
  });

  it("maps tagged segments directly and estimated segments by the integer rank rule", () => {
    fc.assert(
      fc.property(segmentList, (segments) => {
        const result = assignTiers(segments);
        const estimated = segments.filter((s) => s.labelSource === "estimated");
        for (const s of segments) {
          if (s.labelSource === "tagged_lit") expect(result.get(s.id)).toBe("confirmed_lit");
          else if (s.labelSource === "tagged_unlit") expect(result.get(s.id)).toBe("mapped_unlit");
          else expect(result.get(s.id)).toBe(expectedEstimatedTier(s.litProbability, estimated));
        }
      }),
      { numRuns: 100 },
    );
  });

  it("gives equal probabilities equal tiers and never a darker tier to a higher probability", () => {
    fc.assert(
      fc.property(segmentList, (segments) => {
        const result = assignTiers(segments);
        const estimated = segments.filter((s) => s.labelSource === "estimated");
        for (const a of estimated) {
          for (const b of estimated) {
            const ta = ESTIMATED_ORDER.indexOf(result.get(a.id) as Tier);
            const tb = ESTIMATED_ORDER.indexOf(result.get(b.id) as Tier);
            if (a.litProbability === b.litProbability) expect(ta).toBe(tb);
            if (a.litProbability > b.litProbability) expect(ta).toBeLessThanOrEqual(tb);
          }
        }
      }),
      { numRuns: 100 },
    );
  });

  it("handles zero estimated segments", () => {
    fc.assert(
      fc.property(
        segmentList.map((list) => list.map((s) => ({ ...s, labelSource: "tagged_lit" as const }))),
        (segments) => {
          const result = assignTiers(segments);
          expect(result.size).toBe(segments.length);
          for (const s of segments) expect(result.get(s.id)).toBe("confirmed_lit");
        },
      ),
      { numRuns: 100 },
    );
    expect(assignTiers([]).size).toBe(0);
  });

  it("worked example: 10 distinct estimated segments give 4 brighter, 4 typical, 2 darker", () => {
    // higher = 0..9: higher*5 < 20 -> 0..3 brighter; higher*4 >= 30 -> 8, 9 darker; 4..7 typical.
    const segments: Seg[] = Array.from({ length: 10 }, (_, i) => ({
      id: `seg-${i}`,
      labelSource: "estimated",
      litProbability: (10 - i) / 20, // 0.5 down to 0.05, all distinct
      confidence: 0.5,
    }));
    const result = assignTiers(segments);
    const tiers = segments.map((s) => result.get(s.id));
    expect(tiers).toEqual([
      "brighter_than_most",
      "brighter_than_most",
      "brighter_than_most",
      "brighter_than_most",
      "typical",
      "typical",
      "typical",
      "typical",
      "darker_than_most",
      "darker_than_most",
    ]);
  });
});
