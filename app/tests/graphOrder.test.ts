import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { buildGraph } from '../src/graph/build';
import type { Segment } from '../src/types';

// Feature: gloam-web-app, Property 4: Graph construction does not depend on input order
// Validates: Requirements 2.3, 16.9

const RUNS = { numRuns: 100 };

// Small grid (4 x 4 points, about 111 m apart) so segments often share coordinates.
const point = fc
  .tuple(fc.integer({ min: 0, max: 3 }), fc.integer({ min: 0, max: 3 }))
  .map(([x, y]) => [101.7 + x * 0.001, 3.1 + y * 0.001] as const);

// A small id pool makes duplicate ids likely, so the duplicate-rejection path is covered.
const segment: fc.Arbitrary<Segment> = fc.record({
  id: fc.constantFrom('a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'),
  name: fc.constant(null),
  highway: fc.constantFrom('residential', 'primary', 'footway'),
  // Occasionally invalid values exercise the rejected list.
  litProbability: fc.oneof(
    { weight: 8, arbitrary: fc.double({ min: 0, max: 1, noNaN: true }) },
    { weight: 1, arbitrary: fc.constantFrom(NaN, 1.5, -0.5) },
  ),
  confidence: fc.oneof(
    { weight: 8, arbitrary: fc.double({ min: 0, max: 1, noNaN: true }) },
    { weight: 1, arbitrary: fc.constantFrom(NaN, Infinity) },
  ),
  labelSource: fc.constantFrom('tagged_lit', 'tagged_unlit', 'estimated'),
  // minLength 1 allows too-short and all-duplicate-point segments (rejected).
  coordinates: fc.array(point, { minLength: 1, maxLength: 6 }),
});

const segments = fc.array(segment, { minLength: 0, maxLength: 10 });

/** Reorder by sorting on generated random keys: a uniformly arbitrary permutation. */
function permute<T>(items: ReadonlyArray<T>, keys: ReadonlyArray<number>): T[] {
  return items
    .map((item, i) => ({ item, key: keys[i] ?? 0, i }))
    .sort((x, y) => x.key - y.key || x.i - y.i)
    .map((x) => x.item);
}

describe('buildGraph input-order independence', () => {
  it('Property 4: any permutation of the input gives the same graph and rejected list', () => {
    fc.assert(
      fc.property(segments, fc.array(fc.integer(), { minLength: 10, maxLength: 10 }), (input, keys) => {
        const original = buildGraph(input);
        const shuffled = buildGraph(permute(input, keys));
        expect(shuffled.graph).toEqual(original.graph);
        expect(shuffled.rejected).toEqual(original.rejected);
      }),
      RUNS,
    );
  });

  it('reversed input gives the same result for a fixed crossing example', () => {
    const base = { name: null, highway: 'residential', litProbability: 0.5, confidence: 0.5, labelSource: 'estimated' } as const;
    const input: Segment[] = [
      { ...base, id: 'h', coordinates: [[101.7, 3.1], [101.701, 3.1], [101.702, 3.1]] },
      { ...base, id: 'v', coordinates: [[101.701, 3.099], [101.701, 3.1], [101.701, 3.101]] },
    ];
    const a = buildGraph(input);
    const b = buildGraph([...input].reverse());
    expect(a.graph.edges).toHaveLength(4);
    expect(b).toEqual(a);
  });
});
