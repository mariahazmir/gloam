import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { haversine } from '../src/geo/distance';
import { M_PER_DEG, project } from '../src/geo/project';
import { boundsOf, containsPoint, growBounds } from '../src/geo/bounds';
import { ArgumentError } from '../src/validation/errors';

describe('haversine', () => {
  it('0.001 degrees of latitude is about 111.2 m', () => {
    expect(haversine(101, 3, 101, 3.001)).toBeCloseTo(111.195, 2);
  });
  it('names the bad argument', () => {
    expect(() => haversine(NaN, 3, 101, 3)).toThrow(/from longitude/);
    expect(() => haversine(101, 3, 101, 91)).toThrow(ArgumentError);
  });
});

describe('project', () => {
  it('origin maps to 0,0 and north is +y', () => {
    expect(project(101, 3, 101, 3)).toEqual({ x: 0, y: 0 });
    expect(project(101, 3, 101, 3.001).y).toBeCloseTo(M_PER_DEG * 0.001, 6);
  });
  it('agrees with haversine at short range', () => {
    const p = project(101.69, 3.14, 101.691, 3.1405);
    expect(Math.hypot(p.x, p.y)).toBeCloseTo(haversine(101.69, 3.14, 101.691, 3.1405), 1);
  });
});

describe('bounds', () => {
  it('boundsOf rejects empty input', () => {
    expect(() => boundsOf([])).toThrow(/points/);
  });

  // Feature: gloam-web-app, Property 32: Fitted bounds contain every point
  // **Validates: Requirements 5.1, 14.7, 17.7**
  it('boundsOf is the smallest box containing every point', () => {
    const pt = fc.tuple(fc.double({ min: -180, max: 180, noNaN: true }), fc.double({ min: -90, max: 90, noNaN: true }));
    fc.assert(
      fc.property(fc.array(pt, { minLength: 1, maxLength: 30 }), (pts) => {
        const b = boundsOf(pts);
        expect(pts.every(([lon, lat]) => containsPoint(b, lon, lat))).toBe(true);
        expect(b.sw[0]).toBe(Math.min(...pts.map((p) => p[0])));
        expect(b.ne[0]).toBe(Math.max(...pts.map((p) => p[0])));
        expect(b.sw[1]).toBe(Math.min(...pts.map((p) => p[1])));
        expect(b.ne[1]).toBe(Math.max(...pts.map((p) => p[1])));
      }),
    );
  });

  // Feature: gloam-web-app, Property 32: Fitted bounds contain every point
  // **Validates: Requirements 5.1, 14.7, 17.7**
  it('growBounds contains the original bounds and every point', () => {
    const pt = fc.tuple(fc.double({ min: -180, max: 180, noNaN: true }), fc.double({ min: -90, max: 90, noNaN: true }));
    fc.assert(
      fc.property(fc.array(pt, { minLength: 1, maxLength: 30 }), fc.double({ min: 0, max: 5000, noNaN: true }), (pts, m) => {
        const b = boundsOf(pts);
        const g = growBounds(b, m);
        expect(containsPoint(g, b.sw[0], b.sw[1])).toBe(true);
        expect(containsPoint(g, b.ne[0], b.ne[1])).toBe(true);
        expect(pts.every(([lon, lat]) => containsPoint(g, lon, lat))).toBe(true);
      }),
    );
  });

  // **Validates: Requirements 1.9, 6.5**
  it('growBounds keeps points 150 m outside the box out of range of nothing closer', () => {
    const b = boundsOf([[101.6, 3.1], [101.8, 3.2]]);
    const g = growBounds(b, 150);
    expect(containsPoint(g, 101.6 - 0.0001, 3.15)).toBe(true); // about 11 m west
    expect(containsPoint(g, 101.6 - 0.01, 3.15)).toBe(false); // about 1.1 km west
    expect(g.sw[1]).toBeCloseTo(3.1 - 150 / M_PER_DEG, 9);
    expect(() => growBounds(b, -1)).toThrow(/marginM/);
  });
});
