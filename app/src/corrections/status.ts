import { ArgumentError } from '../validation/errors';
import { requireFinite } from '../validation/guards';
import type { Correction } from './store';

const MS_PER_DAY = 86_400_000;

/** UTC day number of a YYYY-MM-DD string. Throws ArgumentError naming `name`. */
function dayNumber(name: string, s: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(typeof s === 'string' ? s : '');
  if (!m) throw new ArgumentError(name, `must be a YYYY-MM-DD date, got ${String(s)}`);
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const ms = Date.UTC(y, mo - 1, d);
  const check = new Date(ms);
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== d) {
    throw new ArgumentError(name, `is not a real calendar day, got ${s}`);
  }
  return Math.round(ms / MS_PER_DAY);
}

/** Report_Weight = 0.5 ** (age_in_days / 30), age clamped to 0 or more. */
export function reportWeight(correctionDate: string, today: string): number {
  const age = Math.max(0, dayNumber('today', today) - dayNumber('correctionDate', correctionDate));
  return 0.5 ** (age / 30);
}

export type CommunityStatus = { side: 'lit' | 'dark'; people: number } | null;

export const DEFAULT_STATUS_THRESHOLD = 3;

/** Canonical order: date ascending, then type ascending (UTF-16 code units). */
function canonical(a: Correction, b: Correction): number {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1;
  if (a.type !== b.type) return a.type < b.type ? -1 : 1;
  return 0;
}

/**
 * Status for the Corrections of ONE segment. Lit side = actually_lit; dark side = actually_dark + light_is_out.
 * A side wins when its weighted sum is at or above the threshold and strictly above the other side.
 * Fewer than two Corrections never produce a status. Order of input does not matter.
 */
export function communityStatus(
  corrections: ReadonlyArray<Correction>,
  today: string,
  threshold: number = DEFAULT_STATUS_THRESHOLD,
): CommunityStatus {
  requireFinite('threshold', threshold);
  if (threshold <= 0) throw new ArgumentError('threshold', `must be above 0, got ${threshold}`);
  dayNumber('today', today);
  if (corrections.length < 2) return null;

  const sorted = [...corrections].sort(canonical);
  let lit = 0;
  let dark = 0;
  let litN = 0;
  let darkN = 0;
  for (const c of sorted) {
    const w = reportWeight(c.date, today);
    if (c.type === 'actually_lit') {
      lit += w;
      litN += 1;
    } else {
      dark += w;
      darkN += 1;
    }
  }
  if (lit >= threshold && lit > dark) return { side: 'lit', people: litN };
  if (dark >= threshold && dark > lit) return { side: 'dark', people: darkN };
  return null;
}

/** Status for every segment id that has at least one Correction. */
export function statusBySegment(
  corrections: ReadonlyArray<Correction>,
  today: string,
): Map<string, CommunityStatus> {
  const groups = new Map<string, Correction[]>();
  for (const c of corrections) {
    const g = groups.get(c.segmentId);
    if (g) g.push(c);
    else groups.set(c.segmentId, [c]);
  }
  const out = new Map<string, CommunityStatus>();
  for (const [id, g] of groups) out.set(id, communityStatus(g, today));
  return out;
}
