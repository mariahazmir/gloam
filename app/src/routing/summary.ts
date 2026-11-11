import type { Tier } from '../types';
import { ArgumentError } from '../validation/errors';
import { compareRoutes } from './compare';
import type { RouteDelta } from './compare';
import { formatDistance, walkingMinutes } from './format';
import type { Route } from './router';
import { tierShares } from './tierShares';

// What the route panel shows for one route, and for the Gloam_Route against the
// Shortest_Route (Requirements 6.7, 7.8, 7.9). Pure: no I/O.

export interface RouteStats {
  /** Physical length in metres, unrounded. */
  distanceM: number;
  /** Displayed_Distance text: whole metres below 1000 m, else kilometres to one decimal. */
  distanceText: string;
  /** Walking time at 5 km/h in whole minutes, rounded up. */
  minutes: number;
  /** Whole-number Tier percentages that sum to exactly 100. */
  shares: Record<Tier, number>;
  /** Metres through `darker_than_most` pieces. */
  darkerTierM: number;
}

export function routeStats(route: Route, tierOf: (edge: number) => Tier): RouteStats {
  if (route.pieces.length === 0) throw new ArgumentError('route', 'must have at least one piece');
  let darker = 0;
  for (const p of route.pieces) if (tierOf(p.edge) === 'darker_than_most') darker += p.view.lengthM;
  return {
    distanceM: route.physicalLengthM,
    distanceText: formatDistance(route.physicalLengthM),
    minutes: walkingMinutes(Math.round(route.physicalLengthM)),
    shares: tierShares(route.pieces, tierOf),
    darkerTierM: darker,
  };
}

export interface RouteComparison {
  gloam: RouteStats;
  shortest: RouteStats;
  /** Signed differences of the Gloam_Route from the Shortest_Route. */
  delta: RouteDelta;
}

export function compareStats(gloam: Route, shortest: Route, tierOf: (edge: number) => Tier): RouteComparison {
  const g = routeStats(gloam, tierOf);
  const s = routeStats(shortest, tierOf);
  return { gloam: g, shortest: s, delta: compareRoutes(g, s) };
}
