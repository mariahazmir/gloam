import type { Segment, Tier } from '../types';
import { requireUnit } from '../validation/guards';
import { ArgumentError } from '../validation/errors';

type TierInput = Pick<Segment, 'id' | 'labelSource' | 'litProbability' | 'confidence'>;

function checked(name: string, id: string, v: number): void {
  try {
    requireUnit(name, v);
  } catch (e) {
    if (e instanceof ArgumentError) {
      throw new ArgumentError(name, `segment ${id}: ${e.message.slice(name.length + 2)}`);
    }
    throw e;
  }
}

/**
 * Tier per segment id. Tagged segments map directly. Estimated segments are placed by
 * rank within the city using integer arithmetic only; no fixed probability cut-off.
 * higher = Estimated segments with strictly higher lit probability, total = Estimated count.
 */
export function assignTiers(segments: ReadonlyArray<TierInput>): Map<string, Tier> {
  for (const s of segments) {
    checked('litProbability', s.id, s.litProbability);
    checked('confidence', s.id, s.confidence);
  }

  const result = new Map<string, Tier>();
  const estimated: TierInput[] = [];
  for (const s of segments) {
    if (s.labelSource === 'tagged_lit') result.set(s.id, 'confirmed_lit');
    else if (s.labelSource === 'tagged_unlit') result.set(s.id, 'mapped_unlit');
    else estimated.push(s);
  }

  const total = estimated.length;
  if (total === 0) return result;

  // Sort descending, then walk groups of equal probability so ties share a tier.
  const sorted = [...estimated].sort((a, b) => b.litProbability - a.litProbability);
  let i = 0;
  while (i < total) {
    const p = (sorted[i] as TierInput).litProbability;
    let j = i;
    while (j < total && (sorted[j] as TierInput).litProbability === p) j++;
    const higher = i;
    const tier: Tier =
      higher * 5 < total * 2
        ? 'brighter_than_most'
        : higher * 4 >= total * 3
          ? 'darker_than_most'
          : 'typical';
    for (let k = i; k < j; k++) result.set((sorted[k] as TierInput).id, tier);
    i = j;
  }
  return result;
}
