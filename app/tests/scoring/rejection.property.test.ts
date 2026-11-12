import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { dread } from '../../src/scoring/dread';
import { assignTiers } from '../../src/scoring/tiers';
import { requireLambda } from '../../src/validation/guards';
import { ArgumentError } from '../../src/validation/errors';
import type { LabelSource } from '../../src/types';

// Feature: gloam-web-app, Property 2: Invalid input is rejected with the argument name
// **Validates: Requirements 3.10, 7.10, 16.3**

const NUM_RUNS = 100;

const invalidUnit = fc.oneof(
  fc.constantFrom(NaN, Infinity, -Infinity),
  fc.double({ min: 1.0000001, max: 1e9, noNaN: true }),
  fc.double({ min: -1e9, max: -1e-7, noNaN: true }),
);
const validUnit = fc.double({ min: 0, max: 1, noNaN: true });
const segmentId = fc.stringMatching(/^[a-z0-9_-]{1,12}$/);
const labelSource = fc.constantFrom<LabelSource>('tagged_lit', 'tagged_unlit', 'estimated');

function thrown(fn: () => unknown): unknown {
  try {
    fn();
  } catch (e) {
    return e;
  }
  return undefined;
}

describe('Property 2: invalid input is rejected with the argument name', () => {
  it('dread rejects an invalid litProbability, naming it', () => {
    fc.assert(
      fc.property(invalidUnit, validUnit, (bad, conf) => {
        const e = thrown(() => dread(bad, conf));
        expect(e).toBeInstanceOf(ArgumentError);
        expect((e as Error).message).toContain('litProbability');
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('dread rejects an invalid confidence, naming it', () => {
    fc.assert(
      fc.property(validUnit, invalidUnit, (p, bad) => {
        const e = thrown(() => dread(p, bad));
        expect(e).toBeInstanceOf(ArgumentError);
        expect((e as Error).message).toContain('confidence');
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('assignTiers rejects an invalid litProbability, naming it and the segment id, with no result', () => {
    fc.assert(
      fc.property(segmentId, labelSource, invalidUnit, validUnit, (id, src, bad, conf) => {
        let result: unknown;
        const e = thrown(() => {
          result = assignTiers([{ id, labelSource: src, litProbability: bad, confidence: conf }]);
        });
        expect(e).toBeInstanceOf(ArgumentError);
        expect((e as Error).message).toContain('litProbability');
        expect((e as Error).message).toContain(id);
        expect(result).toBeUndefined();
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('assignTiers rejects an invalid confidence, naming it and the segment id, with no result', () => {
    fc.assert(
      fc.property(segmentId, labelSource, validUnit, invalidUnit, (id, src, p, bad) => {
        let result: unknown;
        const e = thrown(() => {
          result = assignTiers([{ id, labelSource: src, litProbability: p, confidence: bad }]);
        });
        expect(e).toBeInstanceOf(ArgumentError);
        expect((e as Error).message).toContain('confidence');
        expect((e as Error).message).toContain(id);
        expect(result).toBeUndefined();
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('assignTiers rejects the whole list when one segment among valid ones is invalid', () => {
    fc.assert(
      fc.property(fc.array(validUnit, { maxLength: 5 }), invalidUnit, (goods, bad) => {
        const list = goods.map((p, i) => ({
          id: `ok${i}`,
          labelSource: 'estimated' as LabelSource,
          litProbability: p,
          confidence: 0.5,
        }));
        list.push({ id: 'bad-seg', labelSource: 'estimated', litProbability: bad, confidence: 0.5 });
        let result: unknown;
        const e = thrown(() => {
          result = assignTiers(list);
        });
        expect(e).toBeInstanceOf(ArgumentError);
        expect((e as Error).message).toContain('bad-seg');
        expect(result).toBeUndefined();
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('requireLambda rejects non-finite or out-of-range values, naming lambda', () => {
    const badLambda = fc.oneof(
      fc.constantFrom(NaN, Infinity, -Infinity),
      fc.double({ min: 10.0001, max: 1e9, noNaN: true }),
      fc.double({ min: -1e9, max: -1e-7, noNaN: true }),
    );
    fc.assert(
      fc.property(badLambda, (bad) => {
        const e = thrown(() => requireLambda(bad));
        expect(e).toBeInstanceOf(ArgumentError);
        expect((e as Error).message).toContain('lambda');
      }),
      { numRuns: NUM_RUNS },
    );
  });
});
