import { requireLatLon } from '../validation/guards';

/** Minimal slice of the browser Geolocation API, so tests need no DOM. */
export interface GeolocationLike {
  getCurrentPosition(
    success: (pos: { coords: { latitude: number; longitude: number } }) => void,
    error: (err: { code: number }) => void,
    options?: { timeout?: number; enableHighAccuracy?: boolean; maximumAge?: number },
  ): void;
}

export type GeolocationFailureReason = 'denied' | 'unavailable' | 'timeout';

export type GeolocationResult =
  | { ok: true; lon: number; lat: number }
  | { ok: false; reason: GeolocationFailureReason };

export const GEOLOCATION_TIMEOUT_MS = 10000;

/**
 * Ask for the current position once. The result is returned to the caller only:
 * it is not stored and nothing is sent anywhere. Denial, unavailability, a bad
 * reading or a 10 s timeout (browser option plus a guard timer) resolve to a failure.
 */
export function getCurrentLocation(geo: GeolocationLike | undefined | null): Promise<GeolocationResult> {
  return new Promise((resolve) => {
    if (!geo) {
      resolve({ ok: false, reason: 'unavailable' });
      return;
    }
    let done = false;
    const finish = (r: GeolocationResult): void => {
      if (done) return;
      done = true;
      clearTimeout(guard);
      resolve(r);
    };
    const guard = setTimeout(() => finish({ ok: false, reason: 'timeout' }), GEOLOCATION_TIMEOUT_MS);
    try {
      geo.getCurrentPosition(
        (pos) => {
          try {
            const { longitude, latitude } = pos.coords;
            requireLatLon('position', longitude, latitude);
            finish({ ok: true, lon: longitude, lat: latitude });
          } catch {
            finish({ ok: false, reason: 'unavailable' });
          }
        },
        (err) => finish({ ok: false, reason: err.code === 1 ? 'denied' : err.code === 3 ? 'timeout' : 'unavailable' }),
        { timeout: GEOLOCATION_TIMEOUT_MS },
      );
    } catch {
      finish({ ok: false, reason: 'unavailable' });
    }
  });
}
