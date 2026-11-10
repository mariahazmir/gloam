import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { flickerBrightness, FLICKER_DEPTH, FLICKER_HALF_WIDTH_S, FLICKER_STEP_MS } from '../../src/visual/flicker';

// Feature: gloam-web-app, Property 28: Brightness changes slowly
describe('Property 28: Brightness changes slowly', () => {
  /**
   * **Validates: Requirements 4.8**
   */
  it('steepest slope times (100 ms + one step) is at most 0.25', () => {
    const maxSlope = FLICKER_DEPTH / FLICKER_HALF_WIDTH_S; // triangular dip: depth over half-width
    expect(maxSlope * (0.1 + FLICKER_STEP_MS / 1000)).toBeLessThanOrEqual(0.25);
  });

  /**
   * **Validates: Requirements 4.8**
   */
  it('changes by at most 0.25 between samples within any 100 ms window', () => {
    // A rendered step function can differ across a 100 ms window by this many steps.
    const stepsPerWindow = Math.ceil(100 / FLICKER_STEP_MS);
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: 1, noNaN: true }),
        fc.integer({ min: 0, max: 4294967295 }),
        fc.double({ min: 0, max: 1000, noNaN: true }),
        fc.double({ min: 0, max: 1, noNaN: true }),
        (confidence, seed, startS, base) => {
          const n = 80;
          const samples: number[] = [];
          for (let i = 0; i < n; i++) {
            samples.push(flickerBrightness(confidence, seed, startS + (i * FLICKER_STEP_MS) / 1000, base));
          }
          for (let i = 0; i < n; i++) {
            for (let j = i + 1; j <= Math.min(n - 1, i + stepsPerWindow); j++) {
              expect(Math.abs(samples[j]! - samples[i]!)).toBeLessThanOrEqual(0.25);
            }
          }
        },
      ),
      { numRuns: 200 },
    );
  });
});
