import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { toCsv, CSV_HEADER } from '../../src/corrections/csv';
import type { DarkSpot } from '../../src/corrections/darkSpots';

/** Minimal RFC 4180 parser: every field must be double quoted in data rows. */
function parseQuotedRows(text: string): string[][] {
  const rows: string[][] = [];
  let i = 0;
  while (i < text.length) {
    const row: string[] = [];
    for (;;) {
      if (text[i] !== '"') throw new Error(`field not quoted at ${i}`);
      i++;
      let v = '';
      for (;;) {
        if (text[i] === '"') {
          if (text[i + 1] === '"') {
            v += '"';
            i += 2;
          } else {
            i++;
            break;
          }
        } else {
          v += text[i++];
        }
      }
      row.push(v);
      if (text[i] === ',') {
        i++;
        continue;
      }
      break;
    }
    rows.push(row);
    if (i < text.length) {
      if (text[i] !== '\n') throw new Error(`expected newline at ${i}`);
      i++;
    }
  }
  return rows;
}

const FORMULA = /^[=+\-@\t\r]/;
const nastyChars = fc.constantFrom('"', ',', '\n', '\r', '=', '+', '-', '@', '\t', "'", 'a', 'Z', ' ', '1', 'é');
const text = fc.oneof(
  fc.string({ maxLength: 20 }),
  fc.array(nastyChars, { maxLength: 12 }).map((a) => a.join('')),
);
const spot = fc.record({
  segmentId: text,
  name: fc.option(text, { nil: null }),
  highway: text,
  actuallyDark: fc.nat({ max: 1000 }),
  lightIsOut: fc.nat({ max: 1000 }),
  sample: fc.boolean(),
}) as fc.Arbitrary<DarkSpot>;

describe('toCsv properties', () => {
  // Feature: gloam-web-app, Property 24: CSV output is quoted, guarded and complete
  it('Property 24: CSV output is quoted, guarded and complete', () => {
    // **Validates: Requirements 11.3, 11.5**
    fc.assert(
      fc.property(fc.array(spot, { maxLength: 25 }), (spots) => {
        const out = toCsv(spots);
        const nl = out.indexOf('\n');
        const header = nl === -1 ? out : out.slice(0, nl);
        expect(header).toBe(CSV_HEADER);
        expect(header.split(',')).toEqual([
          'name',
          'highway',
          'segment_id',
          'actually_dark',
          'light_is_out',
        ]);

        const body = nl === -1 ? '' : out.slice(nl + 1);
        const rows = parseQuotedRows(body);
        expect(rows).toHaveLength(spots.length);

        spots.forEach((s, k) => {
          const r = rows[k];
          expect(r).toHaveLength(5);
          const expected = [s.name ?? '', s.highway, s.segmentId, String(s.actuallyDark), String(s.lightIsOut)];
          for (let c = 0; c < 5; c++) {
            // No unquoted field starts with a formula character.
            expect(FORMULA.test(r[c])).toBe(false);
            // Round trip, apart from the guard prefix.
            expect(r[c]).toBe(FORMULA.test(expected[c]) ? `'${expected[c]}` : expected[c]);
          }
          if (s.name === null) expect(r[0]).toBe('');
        });
      }),
      { numRuns: 200 },
    );
  });
});
