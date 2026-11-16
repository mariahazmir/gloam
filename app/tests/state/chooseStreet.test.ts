import { describe, expect, it } from 'vitest';
import { createInitialState, reduce } from '../../src/state/appState';
import { ArgumentError } from '../../src/validation/errors';

// chooseStreet: a chosen Search_Result's midpoint for the field's own point (Requirements 19.4, 6.1, 17.17).

const A = { lon: 101.7, lat: 3.1 };
const B = { lon: 101.71, lat: 3.11 };
const C = { lon: 101.72, lat: 3.12 };

describe('chooseStreet', () => {
  it('sets the field\'s own point whatever the setting state is', () => {
    const s = { ...createInitialState(), settingState: 'end' as const };
    const r = reduce(s, { type: 'chooseStreet', kind: 'start', ...A });
    expect(r.start).toEqual(A);
    expect(r.end).toBeNull();
    // end is unset, so the setting state becomes End_Setting_State
    expect(r.settingState).toBe('end');
    const r2 = reduce(createInitialState(), { type: 'chooseStreet', kind: 'end', ...B });
    expect(r2.end).toEqual(B);
    expect(r2.start).toBeNull();
    expect(r2.settingState).toBe('start'); // start is the unset point
  });

  it('clears the Sample_Walk first, then sets only the new point', () => {
    const s = createInitialState({ example: { start: A, end: B } });
    const r = reduce(s, { type: 'chooseStreet', kind: 'end', ...C });
    expect(r.exampleActive).toBe(false);
    expect(r.start).toBeNull();
    expect(r.end).toEqual(C);
    expect(r.settingState).toBe('start');
  });

  it('keeps the setting state when both points are set', () => {
    const s = { ...createInitialState(), start: A, end: B, settingState: 'end' as const };
    expect(reduce(s, { type: 'chooseStreet', kind: 'start', ...C }).settingState).toBe('end');
  });

  it('does nothing in Report_Mode, and keeps the Sample_Walk', () => {
    const s = { ...createInitialState({ example: { start: A, end: B } }), mode: 'report' as const };
    expect(reduce(s, { type: 'chooseStreet', kind: 'start', ...C })).toBe(s);
  });

  it('rejects a bad coordinate or kind, naming the argument', () => {
    const s = createInitialState();
    expect(() => reduce(s, { type: 'chooseStreet', kind: 'start', lon: NaN, lat: 0 })).toThrow(ArgumentError);
    expect(() => reduce(s, { type: 'chooseStreet', kind: 'middle' as 'start', ...A })).toThrow(/kind/);
  });
});
