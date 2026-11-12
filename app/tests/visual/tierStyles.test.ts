import { describe, expect, it } from 'vitest';
import { REDUCED_STYLES, NORMAL_STYLES, TIERS, tierStyle } from '../../src/visual/tierStyles';

// Requirements 4.1, 4.4, 4.13
describe('tierStyles', () => {
  it('has five tiers', () => {
    expect(TIERS).toHaveLength(5);
  });

  it('reduced-mode styles are pairwise different by dash pattern or width, not colour alone', () => {
    for (let i = 0; i < TIERS.length; i++) {
      for (let j = i + 1; j < TIERS.length; j++) {
        const a = tierStyle(TIERS[i]!, true);
        const b = tierStyle(TIERS[j]!, true);
        const sameDash = JSON.stringify(a.dash) === JSON.stringify(b.dash);
        const sameWidth = a.width === b.width;
        expect(sameDash && sameWidth, `${TIERS[i]} vs ${TIERS[j]}`).toBe(false);
      }
    }
  });

  it('confirmed_lit never flickers, in normal or reduced mode', () => {
    expect(NORMAL_STYLES.confirmed_lit.flicker).toBe(false);
    expect(REDUCED_STYLES.confirmed_lit.flicker).toBe(false);
    expect(tierStyle('confirmed_lit', false).flicker).toBe(false);
    expect(tierStyle('confirmed_lit', true).flicker).toBe(false);
  });

  it('mapped_unlit never flickers, in normal or reduced mode', () => {
    expect(NORMAL_STYLES.mapped_unlit.flicker).toBe(false);
    expect(REDUCED_STYLES.mapped_unlit.flicker).toBe(false);
    expect(tierStyle('mapped_unlit', false).flicker).toBe(false);
    expect(tierStyle('mapped_unlit', true).flicker).toBe(false);
  });
});
