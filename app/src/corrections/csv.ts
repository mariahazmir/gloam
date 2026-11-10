import type { DarkSpot } from './darkSpots';

export const CSV_HEADER = 'name,highway,segment_id,actually_dark,light_is_out';

/** Quote a field: prefix a single quote when it starts with a formula character, double embedded quotes, wrap in quotes. */
function field(value: string): string {
  const guarded = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return `"${guarded.replace(/"/g, '""')}"`;
}

/** CSV of name, highway, segment id and the two counts only. Rows keep the order given. */
export function toCsv(rows: ReadonlyArray<DarkSpot>): string {
  const lines = [CSV_HEADER];
  for (const r of rows) {
    lines.push(
      [r.name ?? '', r.highway, r.segmentId, String(r.actuallyDark), String(r.lightIsOut)].map(field).join(','),
    );
  }
  return lines.join('\n');
}
