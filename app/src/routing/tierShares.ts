import type { Tier } from '../types';
import { ArgumentError } from '../validation/errors';
import type { Route } from './router';

/** Tier order; ties in the largest-remainder step go to the earlier Tier. */
export const TIER_ORDER: ReadonlyArray<Tier> = [
  'confirmed_lit',
  'mapped_unlit',
  'brighter_than_most',
  'typical',
  'darker_than_most',
];

/**
 * Share of route length in each Tier as whole percentages that sum to exactly 100,
 * by the largest-remainder method. Throws if the route has no length.
 */
export function tierShares(
  pieces: Route['pieces'],
  tierOf: (edge: number) => Tier,
): Record<Tier, number> {
  const lengths: Record<Tier, number> = {
    confirmed_lit: 0,
    mapped_unlit: 0,
    brighter_than_most: 0,
    typical: 0,
    darker_than_most: 0,
  };
  let total = 0;
  for (const p of pieces) {
    const len = p.view.lengthM;
    if (!Number.isFinite(len) || len < 0) {
      throw new ArgumentError('pieces', `piece length must be finite and 0 or more, got ${len}`);
    }
    lengths[tierOf(p.edge)] += len;
    total += len;
  }
  if (!(total > 0)) throw new ArgumentError('pieces', 'total route length must be above 0');

  const shares = {} as Record<Tier, number>;
  const remainders: Array<{ tier: Tier; rem: number; order: number }> = [];
  let sum = 0;
  TIER_ORDER.forEach((tier, order) => {
    const exact = (100 * lengths[tier]) / total;
    const floor = Math.floor(exact);
    shares[tier] = floor;
    sum += floor;
    remainders.push({ tier, rem: exact - floor, order });
  });
  remainders.sort((a, b) => b.rem - a.rem || a.order - b.order);
  for (let i = 0; sum < 100; i = (i + 1) % remainders.length, sum++) {
    shares[remainders[i]!.tier] += 1;
  }
  return shares;
}
