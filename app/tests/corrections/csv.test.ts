import { describe, it, expect } from 'vitest';
import { toCsv, CSV_HEADER } from '../../src/corrections/csv';
import type { DarkSpot } from '../../src/corrections/darkSpots';

function spot(name: string | null, highway = 'residential', segmentId = 's1'): DarkSpot {
  return { segmentId, name, highway, actuallyDark: 2, lightIsOut: 1, sample: false };
}

describe('toCsv formula guard', () => {
  // Hand computed: the guard prefix is added first, then the whole cell is quoted.
  it.each([
    ['=', '=SUM(A1)', `"'=SUM(A1)"`],
    ['+', '+44 Road', `"'+44 Road"`],
    ['-', '-Main Street', `"'-Main Street"`],
    ['@', '@home', `"'@home"`],
  ])('neutralises a street name starting with %s', (_c, name, cell) => {
    const out = toCsv([spot(name)]);
    expect(out).toBe(`${CSV_HEADER}\n${cell},"residential","s1","2","1"`);
  });

  it('neutralises highway and segment id cells too', () => {
    const out = toCsv([spot('Elm', '=cmd', '@x')]);
    expect(out).toBe(`${CSV_HEADER}\n"Elm","'=cmd","'@x","2","1"`);
  });

  it('leaves ordinary names unchanged and keeps embedded quotes doubled', () => {
    const out = toCsv([spot('A "B" St')]);
    expect(out).toBe(`${CSV_HEADER}\n"A ""B"" St","residential","s1","2","1"`);
  });

  it('guards before quoting, so a quote inside a guarded cell is still doubled', () => {
    expect(toCsv([spot('=a"b')])).toBe(`${CSV_HEADER}\n"'=a""b","residential","s1","2","1"`);
  });
});