import { requireLatLon } from '../validation/guards';

/** Mean Earth radius in metres. */
export const EARTH_RADIUS_M = 6371008.8;

const toRad = (deg: number): number => (deg * Math.PI) / 180;

/** Great-circle distance in metres between two [lon, lat] points. Pure. */
export function haversine(lon1: number, lat1: number, lon2: number, lat2: number): number {
  requireLatLon('from', lon1, lat1);
  requireLatLon('to', lon2, lat2);
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(a)));
}
