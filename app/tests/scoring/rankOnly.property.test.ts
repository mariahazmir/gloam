import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { assignTiers } from '../../src/scoring/tiers';
import type { LabelSource } from '../../src/types';

type Seg = { id: string; labelSource: LabelSource; litProbability: number; confidence: number };

// Probabilities are k/1000 (integer-derived). Every transform below is strictly increasing
// and keeps distinct k values at least ~1e-6 apart, so no float collisions merge or split ties.
const segmentsArb = fc
  .array(
    fc.record({
      labelSource: fc.constantFrom<LabelSource>('tagged_lit', 'tagged_unlit', 'estimated', 'estimated'),
      k: fc.integer({ min: 0, max: 1000 }),
      confidence: fc.integer({ min: 0, max: 100 }).map((c) => c / 100),
    }),
    { minLength: 0, maxLength: 60 },
  )
  .map((rows) =>
    rows.map(
      (r, i): Seg => ({
        id: `s${i}`,
        labelSource: r.labelSource,
        litProbability: r.k / 1000,
        confidence: r.confidence,
      }),
    ),
  );

const transforms: Array<[string, (p: number) => number]> = [
  ['p*p', (p) => p * p],
  ['p/2', (p) => p / 2],
  ['0.1+0.8p', (p) => 0.1 + 0.8 * p],
  ['p/2.5 (all below 0.5)', (p) => p / 2.5],
  ['0.6+0.4p (all above 0.5)', (p) => 0.6 + 0.4 * p],
];

describe('Feature: gloam-web-app, Property 8: Tiers depend on rank only', () => {
  // **Validates: Requirements 3.7, 12.8, 16.20**
  for (const [name, f] of transforms) {
    it(`tiers are unchanged under ${name}`, () => {
      fc.assert(
        fc.property(segmentsArb, (segs) => {
          const moved = segs.map((s) => ({ ...s, litProbability: f(s.litProbability) }));
          for (const s of moved) {
            expect(s.litProbability).toBeGreaterThanOrEqual(0);
            expect(s.litProbability).toBeLessThanOrEqual(1);
          }
          expect(assignTiers(moved)).toEqual(assignTiers(segs));
        }),
        { numRuns: 100 },
      );
    });
  }

  it('shifting everything below or above 0.5 gives the same tiers (no fixed cut-off)', () => {
    fc.assert(
      fc.property(segmentsArb, (segs) => {
        const below = assignTiers(segs.map((s) => ({ ...s, litProbability: s.litProbability / 2.5 })));
        const above = assignTiers(segs.map((s) => ({ ...s, litProbability: 0.6 + 0.4 * s.litProbability })));
        expect(below).toEqual(above);
      }),
      { numRuns: 100 },
    );
  });
});
