import { M_PER_DEG } from './project';
import { ArgumentError } from '../validation/errors';
import { requireFinite, requireLatLon } from '../validation/guards';

export type LonLat = readonly [lon: number, lat: number];

/** South-west and north-east corners, each [lon, lat]. */
export interface Bounds {
  sw: [lon: number, lat: number];
  ne: [lon: number, lat: number];
}

/** Smallest box holding every point. Throws on an empty list. Pure. */
export function boundsOf(points: ReadonlyArray<LonLat>): Bounds {
  if (points.length === 0) throw new ArgumentError('points', 'must not be empty');
  let minLon = Infinity;
  let minLat = Infinity;
  let maxLon = -Infinity;
  let maxLat = -Infinity;
  points.forEach(([lon, lat], i) => {
    requireLatLon(`points[${i}]`, lon, lat);
    if (lon < minLon) minLon = lon;
    if (lon > maxLon) maxLon = lon;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
  });
  return { sw: [minLon, minLat], ne: [maxLon, maxLat] };
}

/**
 * Grow a box by `marginM` metres on every side. Longitude growth uses the
 * latitude furthest from the equator so the margin is never smaller than asked.
 * Results are clamped to valid ranges. Pure.
 */
export function growBounds(b: Bounds, marginM: number): Bounds {
  requireLatLon('bounds south-west', b.sw[0], b.sw[1]);
  requireLatLon('bounds north-east', b.ne[0], b.ne[1]);
  requireFinite('marginM', marginM);
  if (marginM < 0) throw new ArgumentError('marginM', `must be 0 or more, got ${marginM}`);
  const dLat = marginM / M_PER_DEG;
  const worstLat = Math.max(Math.abs(b.sw[1]), Math.abs(b.ne[1]));
  const cos = Math.cos((worstLat * Math.PI) / 180);
  const dLon = cos > 1e-9 ? marginM / (M_PER_DEG * cos) : 180;
  return {
    sw: [Math.max(-180, b.sw[0] - dLon), Math.max(-90, b.sw[1] - dLat)],
    ne: [Math.min(180, b.ne[0] + dLon), Math.min(90, b.ne[1] + dLat)],
  };
}

/** True when the point lies inside or on the edge of the box. */
export function containsPoint(b: Bounds, lon: number, lat: number): boolean {
  requireLatLon('point', lon, lat);
  return lon >= b.sw[0] && lon <= b.ne[0] && lat >= b.sw[1] && lat <= b.ne[1];
}
