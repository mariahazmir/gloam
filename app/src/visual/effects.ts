import { ArgumentError } from '../validation/errors';
import { requireFinite } from '../validation/guards';

/** Effects that can be dropped under load, in the order they are dropped (Requirement 5.6). */
export type Effect = 'flicker' | 'glow' | 'fog' | 'extrusion';

export const EFFECT_LADDER: ReadonlyArray<Effect> = ['flicker', 'glow', 'fog', 'extrusion'];
export const FPS_FLOOR = 30;
export const LOW_FPS_HOLD_MS = 2000;

export interface EffectsState {
  active: ReadonlyArray<Effect>;
  belowSinceMs: number | null;
}

export function initialEffects(): EffectsState {
  return { active: EFFECT_LADDER, belowSinceMs: null };
}

/**
 * Pure controller, fed once per second with measured frames per second.
 * Below 30 starts a timer; after 2000 ms still below, the first active effect
 * (flicker, glow, fog, extrusion) is removed and the timer restarts. 30 or more
 * clears the timer. Effects are never re-enabled here.
 */
export function stepEffects(s: EffectsState, fps: number, nowMs: number): EffectsState {
  if (typeof fps !== 'number' || Number.isNaN(fps)) throw new ArgumentError('fps', 'must be a number, got NaN');
  if (!Number.isFinite(fps)) throw new ArgumentError('fps', `must be finite, got ${fps}`);
  if (fps < 0) throw new ArgumentError('fps', `must be 0 or more, got ${fps}`);
  requireFinite('nowMs', nowMs);

  if (fps >= FPS_FLOOR || s.active.length === 0) {
    return s.belowSinceMs === null ? s : { active: s.active, belowSinceMs: null };
  }
  if (s.belowSinceMs === null) return { active: s.active, belowSinceMs: nowMs };
  if (nowMs - s.belowSinceMs < LOW_FPS_HOLD_MS) return s;

  const first = EFFECT_LADDER.find((e) => s.active.includes(e));
  const active = s.active.filter((e) => e !== first);
  return { active, belowSinceMs: active.length === 0 ? null : nowMs };
}
