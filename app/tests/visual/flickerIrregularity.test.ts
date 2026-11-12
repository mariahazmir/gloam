import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { irregularity } from '../../src/visual/flicker';

// Feature: gloam-web-app, Property 29: Lower confidence is never less irregular
// **Validates: Requirements 4.2, 16.21**
describe('Property 29: Lower confidence is never less irregular', () => {
  it('irregularity(c1) >= irregularity(c2) whenever c1 <= c2', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: 1, noNaN: true }),
        fc.double({ min: 0, max: 1, noNaN: true }),
        (a, b) => {
          const c1 = Math.min(a, b);
          const c2 = Math.max(a, b);
          expect(irregularity(c1)).toBeGreaterThanOrEqual(irregularity(c2));
        },
      ),
      { numRuns: 100 },
    );
  });

  it('irregularity(0) > irregularity(1)', () => {
    expect(irregularity(0)).toBeGreaterThan(irregularity(1));
  });
});
