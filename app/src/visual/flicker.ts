import { requireFinite, requireUnit } from '../validation/guards';

/** Hard cap on flashes per second (Requirements 4.7, 16.17). */
export const FLICKER_CAP = 3;
/** Depth of a flash, as a fraction of the full 0 to 1 brightness range. */
export const FLICKER_DEPTH = 0.25;
/** Half-width of the triangular dip, in seconds. */
export const FLICKER_HALF_WIDTH_S = 0.15;
/** Layer opacity update step, in milliseconds. */
export const FLICKER_STEP_MS = 33;

export interface FlickerParams {
  meanIntervalS: number;
  jitter: number;
}

/** Lower confidence gives a shorter mean interval and more jitter. */
export function flickerParams(confidence: number): FlickerParams {
  const u = 1 - requireUnit('confidence', confidence);
  return { meanIntervalS: 1 - 0.25 * u, jitter: 0.5 * u };
}

/** Coefficient of variation of flash intervals for uniform r: jitter / sqrt(3). */
export function irregularity(confidence: number): number {
  return flickerParams(confidence).jitter / Math.sqrt(3);
}

/** Flashes per second in the fastest case: 1 / (meanIntervalS * (1 - jitter)). */
export function maxFlickerRate(confidence: number): number {
  const { meanIntervalS, jitter } = flickerParams(confidence);
  return 1 / (meanIntervalS * (1 - jitter));
}

/** Seeded value in [0, 1] for flash number k. */
function seededUnit(seed: number, k: number): number {
  let h = (Math.floor(seed) % 4294967296) >>> 0;
  h = Math.imul(h ^ (k >>> 0), 0x9e3779b1) >>> 0;
  h ^= h >>> 15;
  h = Math.imul(h, 0x85ebca6b) >>> 0;
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35) >>> 0;
  h ^= h >>> 16;
  return (h >>> 0) / 4294967295;
}

/**
 * Brightness at time tSeconds for a segment: `base` minus a triangular dip
 * around each flash. Flash k is centred at k * mean + mean * jitter * (r_k - 0.5),
 * so neighbouring gaps are mean * (1 + jitter * (r_k - r_{k-1})), never below
 * mean * (1 - jitter). Dips (0.30 s wide) never overlap.
 */
export function flickerBrightness(confidence: number, seed: number, tSeconds: number, base: number): number {
  const { meanIntervalS, jitter } = flickerParams(confidence);
  requireFinite('seed', seed);
  requireFinite('tSeconds', tSeconds);
  requireUnit('base', base);
  const k0 = Math.round(tSeconds / meanIntervalS);
  let dip = 0;
  for (let k = k0 - 1; k <= k0 + 1; k++) {
    const centre = k * meanIntervalS + meanIntervalS * jitter * (seededUnit(seed, k) - 0.5);
    const d = 1 - Math.abs(tSeconds - centre) / FLICKER_HALF_WIDTH_S;
    if (d > dip) dip = d;
  }
  return Math.max(0, base - FLICKER_DEPTH * dip);
}
