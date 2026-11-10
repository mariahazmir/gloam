import { EARTH_RADIUS_M } from './distance';
import { requireLatLon } from '../validation/guards';

/** Metres per degree of latitude (about 111 195). */
export const M_PER_DEG = (EARTH_RADIUS_M * Math.PI) / 180;

export interface XY {
  x: number;
  y: number;
}

/** Local equirectangular projection around (lon0, lat0), in metres. Pure. */
export function project(lon0: number, lat0: number, lon: number, lat: number): XY {
  requireLatLon('origin', lon0, lat0);
  requireLatLon('point', lon, lat);
  return {
    x: (lon - lon0) * Math.cos((lat0 * Math.PI) / 180) * M_PER_DEG,
    y: (lat - lat0) * M_PER_DEG,
  };
}
