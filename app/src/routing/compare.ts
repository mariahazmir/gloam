import { requireFinite } from '../validation/guards';
import { ArgumentError } from '../validation/errors';
import { walkingMinutes } from './format';

/** What the comparison needs from one route. */
export interface RouteSummary {
  /** Physical length in metres. */
  distanceM: number;
  /** Metres through `darker_than_most` Segments. */
  darkerTierM: number;
}

/** Signed differences of the Gloam_Route from the Shortest_Route, on displayed values. */
export interface RouteDelta {
  extraMeters: number;
  extraMinutes: number;
  darkerTierChangeM: number;
}

function displayed(name: string, v: number): number {
  requireFinite(name, v);
  if (v < 0) throw new ArgumentError(name, `must be 0 or more, got ${v}`);
  return Math.round(v);
}

/** Avoid -0 so equal routes give plain 0. */
const clean = (n: number): number => (n === 0 ? 0 : n);

/** Differences are taken after rounding to the values the user sees, so the numbers add up on screen. */
export function compareRoutes(gloam: RouteSummary, shortest: RouteSummary): RouteDelta {
  const gd = displayed('gloam.distanceM', gloam.distanceM);
  const sd = displayed('shortest.distanceM', shortest.distanceM);
  const gk = displayed('gloam.darkerTierM', gloam.darkerTierM);
  const sk = displayed('shortest.darkerTierM', shortest.darkerTierM);
  return {
    extraMeters: clean(gd - sd),
    extraMinutes: clean(walkingMinutes(gd) - walkingMinutes(sd)),
    darkerTierChangeM: clean(gk - sk),
  };
}
