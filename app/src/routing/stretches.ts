import type { Tier } from '../types';
import { requireFinite, requireUnit } from '../validation/guards';
import { ArgumentError } from '../validation/errors';

// The route's streets as a list of stretches (Requirements 18.2, 18.6). Pure: no I/O.
// A stretch is a run of consecutive pieces with the same street name and the same Tier.

export interface PieceInfo {
  name: string | null;
  tier: Tier;
  confidence: number;
  /** Length of this piece in metres. */
  lengthM: number;
}

export interface Stretch {
  name: string | null;
  tier: Tier;
  /** The lowest confidence of the pieces in the stretch. */
  confidence: number;
  lengthM: number;
}

const ESTIMATED: ReadonlySet<Tier> = new Set<Tier>(['brighter_than_most', 'typical', 'darker_than_most']);

export function isEstimatedTier(tier: Tier): boolean {
  return ESTIMATED.has(tier);
}

export function routeStretches(pieces: ReadonlyArray<PieceInfo>): Stretch[] {
  const out: Stretch[] = [];
  pieces.forEach((p, i) => {
    requireUnit(`pieces[${i}].confidence`, p.confidence);
    requireFinite(`pieces[${i}].lengthM`, p.lengthM);
    if (p.lengthM < 0) throw new ArgumentError(`pieces[${i}].lengthM`, `must be 0 or more, got ${p.lengthM}`);
    const last = out[out.length - 1];
    if (last !== undefined && last.name === p.name && last.tier === p.tier) {
      last.lengthM += p.lengthM;
      last.confidence = Math.min(last.confidence, p.confidence);
    } else {
      out.push({ name: p.name, tier: p.tier, confidence: p.confidence, lengthM: p.lengthM });
    }
  });
  return out;
}

/**
 * Displayed lengths in whole metres, by the largest-remainder method: each length is floored and
 * the metres still needed to reach the rounded total go one each to the largest fractional parts,
 * ties to the earlier stretch. So the shown lengths sum to the route's whole-metre length (18.6).
 */
export function wholeMetres(stretches: ReadonlyArray<Stretch>): number[] {
  stretches.forEach((s, i) => {
    requireFinite(`stretches[${i}].lengthM`, s.lengthM);
    if (s.lengthM < 0) throw new ArgumentError(`stretches[${i}].lengthM`, `must be 0 or more, got ${s.lengthM}`);
  });
  const total = stretches.reduce((sum, s) => sum + s.lengthM, 0);
  const out = stretches.map((s) => Math.floor(s.lengthM));
  let missing = Math.round(total) - out.reduce((sum, m) => sum + m, 0);
  const byRemainder = stretches
    .map((s, i) => ({ i, rem: s.lengthM - Math.floor(s.lengthM) }))
    .sort((a, b) => b.rem - a.rem || a.i - b.i);
  for (const { i } of byRemainder) {
    if (missing <= 0) break;
    out[i]! += 1;
    missing -= 1;
  }
  return out;
}

/** How many stretches have an estimated Tier. */
export function estimatedCount(stretches: ReadonlyArray<Stretch>): number {
  return stretches.filter((s) => isEstimatedTier(s.tier)).length;
}
