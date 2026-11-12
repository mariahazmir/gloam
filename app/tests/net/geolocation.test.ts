import { describe, it, expect, vi } from 'vitest';
import { getCurrentLocation, type GeolocationLike } from '../../src/net/geolocation';

const ok = (latitude: number, longitude: number): GeolocationLike => ({
  getCurrentPosition: (s) => s({ coords: { latitude, longitude } }),
});

describe('getCurrentLocation', () => {
  it('returns a valid position', async () => {
    expect(await getCurrentLocation(ok(3.14, 101.7))).toEqual({ ok: true, lon: 101.7, lat: 3.14 });
  });
  it('rejects out-of-range or NaN readings', async () => {
    expect(await getCurrentLocation(ok(95, 10))).toEqual({ ok: false, reason: 'unavailable' });
    expect(await getCurrentLocation(ok(NaN, 10))).toEqual({ ok: false, reason: 'unavailable' });
  });
  it('maps denial and missing API', async () => {
    const denied: GeolocationLike = { getCurrentPosition: (_s, e) => e({ code: 1 }) };
    expect(await getCurrentLocation(denied)).toEqual({ ok: false, reason: 'denied' });
    expect(await getCurrentLocation(undefined)).toEqual({ ok: false, reason: 'unavailable' });
  });
  it('times out via the guard timer when no callback arrives', async () => {
    vi.useFakeTimers();
    const p = getCurrentLocation({ getCurrentPosition: () => {} });
    await vi.advanceTimersByTimeAsync(10000);
    expect(await p).toEqual({ ok: false, reason: 'timeout' });
    vi.useRealTimers();
  });
});
