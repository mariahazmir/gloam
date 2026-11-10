import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { darkSpots, DARK_SPOT_LIMIT } from '../../src/corrections/darkSpots';

// Feature: gloam-web-app, Property 23: The dark-spot list is ordered, limited and filtered
// **Validates: Requirements 11.1**

const typeArb = fc.constantFrom('actually_lit', 'actually_dark', 'light_is_out') as fc.Arbitrary<
  'actually_lit' | 'actually_dark' | 'light_is_out'
>;

// Small id pool so segments repeat and counts collide, exercising the tie-break.
const idArb = fc.constantFrom(
  ...Array.from({ length: 40 }, (_, i) => `seg-${String.fromCharCode(97 + (i % 26))}${i}`),
);

const correctionsArb = fc.array(
  fc.record({ segmentId: idArb, type: typeArb, date: fc.constant('2025-01-01') }),
  { maxLength: 300 },
);

const names = (id: string) => ({ name: `n-${id}`, highway: 'residential' });

describe('Property 23: The dark-spot list is ordered, limited and filtered', () => {
  it('lists only reported-dark segments, ordered, limited, with correct counts', () => {
    fc.assert(
      fc.property(correctionsArb, (corrections) => {
        const out = darkSpots(corrections, names);

        // expected counts per segment
        const expected = new Map<string, { dark: number; out: number }>();
        for (const c of corrections) {
          if (c.type === 'actually_lit') continue;
          const e = expected.get(c.segmentId) ?? { dark: 0, out: 0 };
          if (c.type === 'actually_dark') e.dark++;
          else e.out++;
          expected.set(c.segmentId, e);
        }

        // limited
        expect(out.length).toBe(Math.min(expected.size, DARK_SPOT_LIMIT));
        expect(out.length).toBeLessThanOrEqual(20);

        // unique, filtered, counts correct
        const seen = new Set<string>();
        for (const row of out) {
          expect(seen.has(row.segmentId)).toBe(false);
          seen.add(row.segmentId);
          const e = expected.get(row.segmentId);
          expect(e).toBeDefined();
          expect(row.actuallyDark).toBe(e!.dark);
          expect(row.lightIsOut).toBe(e!.out);
          expect(row.actuallyDark + row.lightIsOut).toBeGreaterThanOrEqual(1);
        }

        // ordered: total desc, then id asc
        for (let i = 1; i < out.length; i++) {
          const a = out[i - 1];
          const b = out[i];
          const ta = a.actuallyDark + a.lightIsOut;
          const tb = b.actuallyDark + b.lightIsOut;
          expect(ta).toBeGreaterThanOrEqual(tb);
          if (ta === tb) expect(a.segmentId < b.segmentId).toBe(true);
        }

        // top-N: nothing omitted outranks anything kept
        if (out.length > 0 && expected.size > out.length) {
          const last = out[out.length - 1];
          const lastTotal = last.actuallyDark + last.lightIsOut;
          for (const [id, e] of expected) {
            if (seen.has(id)) continue;
            const t = e.dark + e.out;
            expect(t < lastTotal || (t === lastTotal && id > last.segmentId)).toBe(true);
          }
        }
      }),
      { numRuns: 100 },
    );
  });
});
