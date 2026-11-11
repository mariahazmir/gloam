import { haversine } from '../geo/distance';
import type { Edge, StreetGraph } from '../graph/build';
import type { Position } from '../pack/parse';
import { requireUnit } from '../validation/guards';
import type { Route } from './router';

// Map coordinates of a route, for the lantern route layer. Pure: no I/O.

function cumulative(coords: Edge['coordinates']): number[] {
  const cum = [0];
  for (let i = 1; i < coords.length; i++) {
    const a = coords[i - 1]!;
    const b = coords[i]!;
    cum.push(cum[i - 1]! + haversine(a[0], a[1], b[0], b[1]));
  }
  return cum;
}

function pointAt(coords: Edge['coordinates'], cum: number[], d: number): Position {
  const last = coords.length - 1;
  if (d <= 0) return [coords[0]![0], coords[0]![1]];
  if (d >= cum[last]!) return [coords[last]![0], coords[last]![1]];
  let i = 1;
  while (cum[i]! < d) i++;
  const span = cum[i]! - cum[i - 1]!;
  const u = span === 0 ? 0 : (d - cum[i - 1]!) / span;
  const a = coords[i - 1]!;
  const b = coords[i]!;
  return [a[0] + u * (b[0] - a[0]), a[1] + u * (b[1] - a[1])];
}

/** The part of an Edge polyline between two positions (0..1 by length), in walking direction. */
export function sliceEdge(edge: Edge, fromT: number, toT: number): Position[] {
  requireUnit('fromT', fromT);
  requireUnit('toT', toT);
  const cum = cumulative(edge.coordinates);
  const total = cum[cum.length - 1]!;
  const lo = Math.min(fromT, toT) * total;
  const hi = Math.max(fromT, toT) * total;
  const out: Position[] = [pointAt(edge.coordinates, cum, lo)];
  for (let i = 0; i < edge.coordinates.length; i++) {
    if (cum[i]! > lo && cum[i]! < hi) out.push([edge.coordinates[i]![0], edge.coordinates[i]![1]]);
  }
  out.push(pointAt(edge.coordinates, cum, hi));
  return fromT > toT ? out.reverse() : out;
}

/** All pieces joined into one line. Repeated join points are dropped. */
export function routeCoordinates(graph: StreetGraph, route: Route): Position[] {
  const out: Position[] = [];
  for (const piece of route.pieces) {
    for (const p of sliceEdge(graph.edges[piece.edge]!, piece.fromT, piece.toT)) {
      const prev = out[out.length - 1];
      if (prev && prev[0] === p[0] && prev[1] === p[1]) continue;
      out.push(p);
    }
  }
  return out;
}
