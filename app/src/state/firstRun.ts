// First-run values for Demo_Mode and Reduced_Effects_Mode (Requirements 4.9, 14.2, 17.11). Pure.

/** Demo_Mode starts on only in the hosted build, where VITE_GLOAM_HOSTED is the text "true". */
export function hostedDefault(flag: unknown): boolean {
  return flag === true || flag === 'true';
}

export interface MediaQueryHost {
  matchMedia?: (query: string) => { matches: boolean };
}

/** True when the system "reduce motion" setting is on. False if the browser cannot say. */
export function prefersReducedMotion(host: MediaQueryHost): boolean {
  if (typeof host.matchMedia !== 'function') return false;
  return host.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
