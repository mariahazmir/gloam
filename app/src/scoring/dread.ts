import { requireUnit } from '../validation/guards';

/**
 * Dread from 0 to 1. raw = 1 - litProbability. Low confidence pulls a low raw value
 * toward 0.5, never past it: raw + (1 - confidence) * max(0, 0.5 - raw).
 */
export function dread(litProbability: number, confidence: number): number {
  requireUnit('litProbability', litProbability);
  requireUnit('confidence', confidence);
  const raw = 1 - litProbability;
  return raw + (1 - confidence) * Math.max(0, 0.5 - raw);
}
