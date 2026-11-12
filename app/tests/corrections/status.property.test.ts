import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { communityStatus } from '../../src/corrections/status';
import type { Correction } from '../../src/corrections/store';
import type { ReportType } from '../../src/types';

const TODAY = '2025-06-30';
const TODAY_MS = Date.UTC(2025, 5, 30);
const MS_PER_DAY = 86_400_000;

const dateAgo = (days: number): string => new Date(TODAY_MS - days * MS_PER_DAY).toISOString().slice(0, 10);

const typeArb = fc.constantFrom<ReportType>('actually_lit', 'actually_dark', 'light_is_out');

const correctionArb: fc.Arbitrary<Correction> = fc.record({
  segmentId: fc.constant('seg-1'),
  type: typeArb,
  date: fc.integer({ min: 0, max: 120 }).map(dateAgo),
});

const setArb = fc.array(correctionArb, { minLength: 0, maxLength: 12 });

/** Independent oracle written from the design text. */
function expected(cs: Correction[]): { side: 'lit' | 'dark'; people: number } | null {
  if (cs.length < 2) return null;
  let lit = 0;
  let dark = 0;
  let litN = 0;
  let darkN = 0;
  for (const c of cs) {
    const age = Math.round((TODAY_MS - Date.parse(c.date)) / MS_PER_DAY);
    const w = Math.pow(0.5, age / 30);
    if (c.type === 'actually_lit') {
      lit += w;
      litN++;
    } else {
      dark += w;
      darkN++;
    }
  }
  if (lit >= 3 && lit > dark) return { side: 'lit', people: litN };
  if (dark >= 3 && dark > lit) return { side: 'dark', people: darkN };
  return null;
}

describe('Property 20', () => {
  // Feature: gloam-web-app, Property 20: The status rule follows the sides, ignores order and ignores single reports
  // **Validates: Requirements 10.5, 10.6, 10.7, 16.12, 16.13**
  it('follows the sides, counts agreeing reports, ignores order', () => {
    fc.assert(
      fc.property(setArb, fc.infiniteStream(fc.nat()), (cs, rnd) => {
        const result = communityStatus(cs, TODAY);
        expect(result).toEqual(expected(cs));

        // Any permutation (Fisher-Yates driven by the random stream) gives the same result.
        const shuffled = [...cs];
        const it2 = rnd[Symbol.iterator]();
        for (let i = shuffled.length - 1; i > 0; i--) {
          const j = (it2.next().value as number) % (i + 1);
          [shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!];
        }
        expect(communityStatus(shuffled, TODAY)).toEqual(result);
        expect(communityStatus([...cs].reverse(), TODAY)).toEqual(result);
      }),
      { numRuns: 200 },
    );
  });

  it('gives no status for exactly one Correction', () => {
    fc.assert(
      fc.property(correctionArb, (c) => {
        expect(communityStatus([c], TODAY)).toBeNull();
      }),
      { numRuns: 100 },
    );
  });

  it('light_is_out counts on the dark side (example: 3 same-day reports)', () => {
    const d = dateAgo(0);
    const cs: Correction[] = [
      { segmentId: 's', type: 'actually_dark', date: d },
      { segmentId: 's', type: 'light_is_out', date: d },
      { segmentId: 's', type: 'light_is_out', date: d },
    ];
    expect(communityStatus(cs, TODAY)).toEqual({ side: 'dark', people: 3 });
  });
});
