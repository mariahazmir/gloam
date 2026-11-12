import { requireFinite } from '../validation/guards';
import { ArgumentError } from '../validation/errors';

function requireNonNegative(name: string, v: number): number {
  requireFinite(name, v);
  if (v < 0) throw new ArgumentError(name, `must be 0 or more, got ${v}`);
  return v;
}

/**
 * Whole metres below 1000 m, kilometres to one decimal from 1000 m.
 * Rounds to whole metres first, so 999.6 gives "1.0 km" and 1050 gives "1.1 km".
 */
export function formatDistance(meters: number): string {
  const m = Math.round(requireNonNegative('meters', meters));
  if (m < 1000) return `${m} m`;
  return `${(Math.round(m / 100) / 10).toFixed(1)} km`;
}

/** Whole minutes at 5 km/h, rounded up: ceil(m x 3 / 250) on whole displayed metres. */
export function walkingMinutes(displayedMeters: number): number {
  const m = Math.round(requireNonNegative('displayedMeters', displayedMeters));
  return Math.ceil((m * 3) / 250);
}

/** A whole number with an explicit sign: "+200", "-3", "0". */
export function formatSigned(n: number): string {
  requireFinite('n', n);
  const r = Math.round(n);
  if (r === 0) return '0';
  return r > 0 ? `+${r}` : `-${Math.abs(r)}`;
}
