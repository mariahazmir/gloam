import { ArgumentError } from '../validation/errors';
import { requireFinite } from '../validation/guards';

/** A drag on the Lambda slider recomputes the route at most this often. */
export const SLIDER_INTERVAL_MS = 100;

export interface RateLimited<A> {
  (arg: A): void;
  /** Drops a call that is waiting for its turn. */
  cancel(): void;
}

/**
 * Runs `fn` at most once per `intervalMs`. A call after a quiet period runs at once;
 * calls inside the interval are folded into one that runs when the interval ends with
 * the latest argument, so the last value of a drag is always applied.
 */
export function limitRate<A>(fn: (arg: A) => void, intervalMs: number = SLIDER_INTERVAL_MS): RateLimited<A> {
  requireFinite('intervalMs', intervalMs);
  if (intervalMs < 0) throw new ArgumentError('intervalMs', `must be 0 or more, got ${intervalMs}`);
  let lastRun = -Infinity;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending: { arg: A } | null = null;

  const run = (arg: A): void => {
    lastRun = Date.now();
    fn(arg);
  };

  const limited = ((arg: A): void => {
    const wait = lastRun + intervalMs - Date.now();
    if (timer === null && wait <= 0) {
      run(arg);
      return;
    }
    pending = { arg };
    if (timer === null) {
      timer = setTimeout(() => {
        timer = null;
        const p = pending;
        pending = null;
        if (p) run(p.arg);
      }, Math.max(0, wait));
    }
  }) as RateLimited<A>;

  limited.cancel = (): void => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
    pending = null;
  };
  return limited;
}
