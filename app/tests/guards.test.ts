import { describe, expect, it } from 'vitest';
import { ArgumentError } from '../src/validation/errors';
import { requireFinite, requireLambda, requireLatLon, requireUnit } from '../src/validation/guards';

describe('guards', () => {
  it('returns valid values', () => {
    expect(requireUnit('p', 0.5)).toBe(0.5);
    expect(requireFinite('x', -3)).toBe(-3);
    expect(requireLambda(10)).toBe(10);
    expect(() => requireLatLon('start', 180, -90)).not.toThrow();
  });

  it('throws ArgumentError naming the argument', () => {
    for (const bad of [NaN, Infinity, -Infinity, 1.1, -0.1]) {
      expect(() => requireUnit('confidence', bad)).toThrow(ArgumentError);
      expect(() => requireUnit('confidence', bad)).toThrow(/^confidence: /);
    }
    expect(() => requireFinite('dist', NaN)).toThrow(/^dist: /);
    expect(() => requireLambda(11)).toThrow(/^lambda: /);
    expect(() => requireLambda(-1)).toThrow(/^lambda: /);
    expect(() => requireLambda(3, 2)).toThrow(/^lambda: /);
    expect(() => requireLatLon('end', 181, 0)).toThrow(/^end longitude: /);
    expect(() => requireLatLon('end', 0, NaN)).toThrow(/^end latitude: /);
  });

  it('exposes the argument field', () => {
    try {
      requireLambda(NaN);
    } catch (e) {
      expect((e as ArgumentError).argument).toBe('lambda');
    }
  });
});
