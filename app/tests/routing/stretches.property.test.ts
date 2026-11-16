// @vitest-environment node
import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { TIER_ORDER } from "../../src/routing/tierShares";
import { estimatedCount, isEstimatedTier, routeStretches, wholeMetres, type PieceInfo } from "../../src/routing/stretches";
import type { Tier } from "../../src/types";
import { ArgumentError } from "../../src/validation/errors";

// Feature: gloam-web-app, Property 34: Stretches cover the route exactly and never repeat a neighbour

// A small name pool (with null) so neighbours often share a name.
const pieceArb: fc.Arbitrary<PieceInfo> = fc.record({
  name: fc.constantFrom<string | null>("A", "B", "C", null),
  tier: fc.constantFrom<Tier>(...TIER_ORDER),
  confidence: fc.double({ min: 0, max: 1, noNaN: true }),
  lengthM: fc.double({ min: 0, max: 5000, noNaN: true }),
});
const piecesArb = fc.array(pieceArb, { maxLength: 40 });

describe("Property 34: route stretches", () => {
  /** **Validates: Requirements 18.2, 18.6** */
  it("lengths add up, neighbours differ, confidence is the lowest piece, count is in range", () => {
    fc.assert(
      fc.property(piecesArb, (pieces) => {
        const out = routeStretches(pieces);
        const total = pieces.reduce((s, p) => s + p.lengthM, 0);
        const sum = out.reduce((s, x) => s + x.lengthM, 0);
        expect(Math.abs(sum - total)).toBeLessThanOrEqual(1e-6 * Math.max(1, total));
        for (let i = 1; i < out.length; i++) {
          expect(out[i]!.name === out[i - 1]!.name && out[i]!.tier === out[i - 1]!.tier).toBe(false);
        }
        // Walk the pieces again to rebuild each stretch's lowest confidence independently.
        let k = -1;
        const lowest: number[] = [];
        pieces.forEach((p, i) => {
          const prev = pieces[i - 1];
          if (i === 0 || prev!.name !== p.name || prev!.tier !== p.tier) lowest[++k] = p.confidence;
          else lowest[k] = Math.min(lowest[k]!, p.confidence);
        });
        expect(out.map((s) => s.confidence)).toEqual(lowest);
        const n = estimatedCount(out);
        expect(n).toBeGreaterThanOrEqual(0);
        expect(n).toBeLessThanOrEqual(out.length);
        expect(n).toBe(out.filter((s) => isEstimatedTier(s.tier)).length);
      }),
    );
  });

  /** **Validates: Requirement 18.6** */
  it("wholeMetres: non-negative integers, each under 1 m from exact, summing to the rounded total", () => {
    fc.assert(
      fc.property(piecesArb, (pieces) => {
        const out = routeStretches(pieces);
        const metres = wholeMetres(out);
        expect(metres).toHaveLength(out.length);
        const total = out.reduce((s, x) => s + x.lengthM, 0);
        expect(metres.reduce((s, m) => s + m, 0)).toBe(Math.round(total));
        metres.forEach((m, i) => {
          expect(Number.isInteger(m)).toBe(true);
          expect(m).toBeGreaterThanOrEqual(0);
          expect(Math.abs(m - out[i]!.lengthM)).toBeLessThan(1);
        });
      }),
    );
  });

  it("wholeMetres example: 10.5 + 20.5 + 30.5 = 61.5 rounds to 62 as 11, 21, 30 (ties to the earlier stretch)", () => {
    // Rounding each one alone would give 11 + 21 + 31 = 63, one metre more than the route.
    const s = (lengthM: number) => ({ name: null, tier: "typical" as const, confidence: 0.5, lengthM });
    expect(wholeMetres([s(10.5), s(20.5), s(30.5)])).toEqual([11, 21, 30]);
    expect(() => wholeMetres([s(1), s(NaN)])).toThrowError(/stretches\[1\]\.lengthM/);
  });

  it("rejects NaN, infinite and negative values, naming the argument", () => {
    fc.assert(
      fc.property(fc.constantFrom(NaN, Infinity, -Infinity, -1), fc.boolean(), (bad, inLength) => {
        const p: PieceInfo = { name: "A", tier: "typical", confidence: 0.5, lengthM: 10 };
        const broken = inLength ? { ...p, lengthM: bad } : { ...p, confidence: bad };
        expect(() => routeStretches([p, broken])).toThrowError(ArgumentError);
        expect(() => routeStretches([p, broken])).toThrowError(inLength ? /pieces\[1\]\.lengthM/ : /pieces\[1\]\.confidence/);
      }),
    );
  });

  it("example: A typical 100 + A typical 50 + B confirmed 30 gives two stretches, one estimated", () => {
    const out = routeStretches([
      { name: "A", tier: "typical", confidence: 0.6, lengthM: 100 },
      { name: "A", tier: "typical", confidence: 0.4, lengthM: 50 },
      { name: "B", tier: "confirmed_lit", confidence: 1, lengthM: 30 },
    ]);
    expect(out).toEqual([
      { name: "A", tier: "typical", confidence: 0.4, lengthM: 150 },
      { name: "B", tier: "confirmed_lit", confidence: 1, lengthM: 30 },
    ]);
    expect(estimatedCount(out)).toBe(1);
  });
});
