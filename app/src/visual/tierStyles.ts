import type { Tier } from '../types';
import { requireUnit } from '../validation/guards';

/** Design palette. */
export const PALETTE = { pumpkin: '#ff7100', lantern: '#fd9702', glow: '#e102ff', dusk: '#ae03ff' } as const;

export const TIERS: ReadonlyArray<Tier> = [
  'confirmed_lit',
  'mapped_unlit',
  'brighter_than_most',
  'typical',
  'darker_than_most',
];

export interface TierStyle {
  color: string;
  /** Line width in px. */
  width: number;
  /** Dash array; empty means solid. */
  dash: ReadonlyArray<number>;
  /** Base brightness from 0 to 1 (flicker dips below this). */
  baseBrightness: number;
  glow: boolean;
  fog: boolean;
  flicker: boolean;
}

export const NORMAL_STYLES: Readonly<Record<Tier, TierStyle>> = {
  confirmed_lit: { color: PALETTE.lantern, width: 3.5, dash: [], baseBrightness: 1, glow: true, fog: false, flicker: false },
  mapped_unlit: { color: PALETTE.dusk, width: 1, dash: [], baseBrightness: 0.3, glow: false, fog: true, flicker: false },
  brighter_than_most: { color: PALETTE.pumpkin, width: 2.5, dash: [4, 2], baseBrightness: 0.9, glow: false, fog: false, flicker: true },
  typical: { color: PALETTE.glow, width: 2, dash: [2, 2], baseBrightness: 0.65, glow: false, fog: false, flicker: true },
  darker_than_most: { color: PALETTE.dusk, width: 2, dash: [0.5, 2], baseBrightness: 0.4, glow: false, fog: true, flicker: true },
};

/** Reduced_Effects_Mode: static, no flicker, glow or fog; (dash, width) pairs all differ. */
export const REDUCED_STYLES: Readonly<Record<Tier, TierStyle>> = {
  confirmed_lit: { color: PALETTE.lantern, width: 3.5, dash: [], baseBrightness: 1, glow: false, fog: false, flicker: false },
  mapped_unlit: { color: PALETTE.dusk, width: 1, dash: [], baseBrightness: 0.3, glow: false, fog: false, flicker: false },
  brighter_than_most: { color: PALETTE.pumpkin, width: 2.5, dash: [4, 2], baseBrightness: 0.9, glow: false, fog: false, flicker: false },
  typical: { color: PALETTE.glow, width: 2, dash: [2, 2], baseBrightness: 0.65, glow: false, fog: false, flicker: false },
  darker_than_most: { color: PALETTE.dusk, width: 2, dash: [0.5, 2], baseBrightness: 0.4, glow: false, fog: false, flicker: false },
};

export function tierStyle(tier: Tier, reducedEffects: boolean): TierStyle {
  return (reducedEffects ? REDUCED_STYLES : NORMAL_STYLES)[tier];
}

export const CONFIDENCE_BANDS = 3;
export const PHASES = 3;

/** Band 0, 1 or 2 with edges 0, 1/3, 2/3, 1 (integer comparison; 1 falls in the top band). */
export function confidenceBand(confidence: number): number {
  requireUnit('confidence', confidence);
  return Math.min(CONFIDENCE_BANDS - 1, Math.floor(confidence * CONFIDENCE_BANDS));
}

/** Phase 0, 1 or 2 from a stable hash of the segment id (FNV-1a). */
export function phaseOf(id: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    h = Math.imul(h ^ id.charCodeAt(i), 0x01000193) >>> 0;
  }
  return h % PHASES;
}

export interface CohortInput {
  id: string;
  tier: Tier;
  confidence: number;
}

/** Cohort key: tier, confidence band, phase. */
export function cohortKey(tier: Tier, band: number, phase: number): string {
  return `${tier}|${band}|${phase}`;
}

/**
 * Groups flicker segments by tier x confidence band x phase. Only the three
 * estimated tiers flicker, so there are at most 3 x 3 x 3 = 27 cohorts.
 * Segments of other tiers are left out.
 */
export function groupCohorts(segments: ReadonlyArray<CohortInput>): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const s of segments) {
    if (!NORMAL_STYLES[s.tier].flicker) continue;
    const key = cohortKey(s.tier, confidenceBand(s.confidence), phaseOf(s.id));
    const list = out.get(key);
    if (list) list.push(s.id);
    else out.set(key, [s.id]);
  }
  return out;
}
