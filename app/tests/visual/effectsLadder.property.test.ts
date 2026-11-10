import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { EFFECT_LADDER, FPS_FLOOR, initialEffects, stepEffects } from "../../src/visual/effects";

// Feature: gloam-web-app, Property 30: The effects ladder removes one effect at a time and stops at none
// **Validates: Requirements 5.6**

// One fps sample per second, mixing clearly low, borderline and healthy values.
const fpsArb = fc.oneof(
  fc.double({ min: 0, max: 29.999, noNaN: true }),
  fc.constantFrom(0, 29, 29.999, 30, 31, 60),
  fc.double({ min: 30, max: 120, noNaN: true }),
);
const samplesArb = fc.array(fpsArb, { minLength: 1, maxLength: 60 });
// Long low runs so the ladder actually reaches "none".
const lowRunArb = fc.array(fc.double({ min: 0, max: 29.9, noNaN: true }), { minLength: 20, maxLength: 40 });

function check(samples: number[], startMs: number): void {
  let state = initialEffects();
  let timeMs = startMs;
  for (let i = 0; i < samples.length; i++) {
    const prev = state;
    timeMs += 1000;
    state = stepEffects(prev, samples[i]!, timeMs);

    const removed = prev.active.filter((e) => !state.active.includes(e));
    const added = state.active.filter((e) => !prev.active.includes(e));

    // Never re-enabled, never more than one removed, never below none.
    expect(added).toEqual([]);
    expect(removed.length).toBeLessThanOrEqual(1);
    expect(state.active.length).toBeGreaterThanOrEqual(0);
    expect(state.active.length).toBe(prev.active.length - removed.length);

    // Order: the removed effect is the first active one in ladder order,
    // so the active set is always a suffix of the ladder.
    if (removed.length === 1) {
      const firstActive = EFFECT_LADDER.find((e) => prev.active.includes(e));
      expect(removed[0]).toBe(firstActive);
    }
    expect(state.active).toEqual(EFFECT_LADDER.slice(EFFECT_LADDER.length - state.active.length));

    if (removed.length === 1) {
      // Only removed while fps is below the floor, after 2 s of continuous low samples
      // (this sample and the two before it, spaced 1 s apart).
      expect(samples[i]).toBeLessThan(FPS_FLOOR);
      expect(i).toBeGreaterThanOrEqual(2);
      expect(samples[i - 1]).toBeLessThan(FPS_FLOOR);
      expect(samples[i - 2]).toBeLessThan(FPS_FLOOR);
    }
    if (samples[i]! >= FPS_FLOOR) {
      expect(removed).toEqual([]);
    }
    // An empty list is stable.
    if (prev.active.length === 0) {
      expect(state.active).toEqual([]);
    }
  }
}

describe("Property 30: effects ladder", () => {
  it("removes at most one effect per step, in ladder order, never re-enables", () => {
    fc.assert(
      fc.property(samplesArb, fc.integer({ min: 0, max: 1_000_000 }), (samples, start) => check(samples, start)),
      { numRuns: 200 },
    );
  });

  it("walks the whole ladder down to none under sustained low fps and stays there", () => {
    fc.assert(
      fc.property(lowRunArb, fc.integer({ min: 0, max: 1_000_000 }), (samples, start) => {
        check(samples, start);
        let state = initialEffects();
        let t = start;
        for (const fps of samples) {
          t += 1000;
          state = stepEffects(state, fps, t);
        }
        expect(state.active).toEqual([]);
      }),
      { numRuns: 100 },
    );
  });

  it("never removes anything while fps stays at 30 or more", () => {
    fc.assert(
      fc.property(fc.array(fc.double({ min: 30, max: 240, noNaN: true }), { maxLength: 60 }), (samples) => {
        let state = initialEffects();
        samples.forEach((fps, i) => {
          state = stepEffects(state, fps, (i + 1) * 1000);
        });
        expect(state.active).toEqual(EFFECT_LADDER);
      }),
      { numRuns: 100 },
    );
  });
});
