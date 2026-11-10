import { ArgumentError } from './errors';

function inRange(name: string, v: number, min: number, max: number): number {
  if (typeof v !== 'number' || Number.isNaN(v)) throw new ArgumentError(name, 'must be a number, got NaN');
  if (!Number.isFinite(v)) throw new ArgumentError(name, `must be finite, got ${v}`);
  if (v < min || v > max) throw new ArgumentError(name, `must be between ${min} and ${max}, got ${v}`);
  return v;
}

/** Finite number from 0 to 1. */
export function requireUnit(name: string, v: number): number {
  return inRange(name, v, 0, 1);
}

/** Any finite number. */
export function requireFinite(name: string, v: number): number {
  return inRange(name, v, -Infinity, Infinity);
}

/** Finite lambda from 0 to max (default 10). */
export function requireLambda(v: number, max = 10): number {
  return inRange('lambda', v, 0, max);
}

/** Longitude -180..180 and latitude -90..90, both finite. */
export function requireLatLon(name: string, lon: number, lat: number): void {
  inRange(`${name} longitude`, lon, -180, 180);
  inRange(`${name} latitude`, lat, -90, 90);
}
