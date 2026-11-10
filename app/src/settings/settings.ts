import { DEFAULT_SETTINGS } from '../routing/costs';
import type { PersonalSettings } from '../routing/costs';
import { ArgumentError } from '../validation/errors';

const KEYS = ['avoidSteps', 'avoidService', 'preferMain', 'lowConfidenceDarker'] as const;

/** Stores exactly four booleans and nothing else (Requirements 8.6, 13.3). Pure. */
export function serializeSettings(s: PersonalSettings): string {
  const out: Record<string, boolean> = {};
  for (const k of KEYS) {
    if (typeof s?.[k] !== 'boolean') throw new ArgumentError(`settings.${k}`, 'must be a boolean');
    out[k] = s[k];
  }
  return JSON.stringify(out);
}

/**
 * Parses stored text. Missing keys take the default; a non-boolean value or a
 * non-object throws ArgumentError naming the key. Unknown keys are ignored.
 */
export function parseSettings(text: string): PersonalSettings {
  if (typeof text !== 'string') throw new ArgumentError('text', 'must be a string');
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new ArgumentError('text', 'must be valid JSON');
  }
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new ArgumentError('text', 'must be a JSON object');
  }
  const obj = raw as Record<string, unknown>;
  const out: PersonalSettings = { ...DEFAULT_SETTINGS };
  for (const k of KEYS) {
    if (!(k in obj)) continue;
    if (typeof obj[k] !== 'boolean') throw new ArgumentError(`settings.${k}`, 'must be a boolean');
    out[k] = obj[k] as boolean;
  }
  return out;
}
