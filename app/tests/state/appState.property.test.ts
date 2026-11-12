import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { createInitialState, reduce } from '../../src/state/appState';
import type { AppAction, AppState, LonLat } from '../../src/state/appState';
import { ArgumentError } from '../../src/validation/errors';

// Feature: gloam-web-app, Property 31: Modes and taps behave as specified
// **Validates: Requirements 6.1, 6.11, 10.1, 17.13, 17.17**

const RUNS = { numRuns: 100 };

const lonArb = fc.double({ min: -180, max: 180, noNaN: true });
const latArb = fc.double({ min: -90, max: 90, noNaN: true });
const lonLatArb: fc.Arbitrary<LonLat> = fc.record({ lon: lonArb, lat: latArb });
const segArb = fc.option(fc.constantFrom('seg-1', 'seg-2', 'seg-3'), { nil: undefined });

const actionArb: fc.Arbitrary<AppAction> = fc.oneof(
  fc.record({ type: fc.constant('tap' as const), lon: lonArb, lat: latArb, segmentId: segArb }),
  fc.record({ type: fc.constant('setStartHere' as const), lon: lonArb, lat: latArb }),
  fc.record({ type: fc.constant('setEndHere' as const), lon: lonArb, lat: latArb }),
  fc.record({ type: fc.constant('useLocation' as const), lon: lonArb, lat: latArb }),
  fc.record({ type: fc.constant('switchMode' as const), mode: fc.constantFrom('plan' as const, 'report' as const) }),
  fc.record({
    type: fc.constant('chooseSettingState' as const),
    settingState: fc.constantFrom('start' as const, 'end' as const),
  }),
  fc.constant({ type: 'clearExample' as const }),
);

const actionsArb = fc.array(actionArb, { minLength: 0, maxLength: 25 });

const exampleArb = fc.option(fc.record({ start: lonLatArb, end: lonLatArb }), { nil: null });
const initialOptsArb = fc.record({
  example: exampleArb,
  reducedEffects: fc.boolean(),
  demo: fc.boolean(),
});

const initialArb: fc.Arbitrary<AppState> = initialOptsArb.map((o) => createInitialState(o));

describe('Property 31: modes and taps', () => {
  it('initial state is Plan_Mode and Start_Setting_State', () => {
    fc.assert(
      fc.property(initialOptsArb, (opts) => {
        const s = createInitialState(opts);
        expect(s.mode).toBe('plan');
        expect(s.settingState).toBe('start');
        expect(s.selectedSegmentId).toBeNull();
        expect(s.exampleActive).toBe(opts.example !== null);
      }),
      RUNS,
    );
    const s = createInitialState();
    expect(s.start).toBeNull();
    expect(s.end).toBeNull();
  });

  it('Report_Mode taps never change start or end; Plan_Mode taps never select a segment', () => {
    fc.assert(
      fc.property(initialArb, actionsArb, (init, actions) => {
        let s = init;
        for (const a of actions) {
          const before = s;
          s = reduce(s, a);
          if (a.type === 'tap' && before.mode === 'report') {
            expect(s.start).toEqual(before.start);
            expect(s.end).toEqual(before.end);
            expect(s.mode).toBe('report');
          }
          if (a.type === 'tap' && before.mode === 'plan') {
            expect(s.selectedSegmentId).toBe(before.selectedSegmentId);
            expect(s.selectedSegmentId).toBeNull();
          }
        }
      }),
      RUNS,
    );
  });

  it('Plan_Mode tap sets start in Start_Setting_State then moves to End_Setting_State', () => {
    fc.assert(
      fc.property(initialArb, lonLatArb, lonLatArb, (init, p, q) => {
        const s0 = reduce(init, { type: 'chooseSettingState', settingState: 'start' });
        const s1 = reduce(s0, { type: 'tap', ...p });
        expect(s1.start).toEqual(p);
        expect(s1.end).toEqual(s0.exampleActive ? null : s0.end);
        expect(s1.settingState).toBe('end');
        // A second tap sets the end, leaving the start alone.
        const s2 = reduce(s1, { type: 'tap', ...q });
        expect(s2.start).toEqual(p);
        expect(s2.end).toEqual(q);
      }),
      RUNS,
    );
  });

  it('later points replace earlier points of the same kind', () => {
    fc.assert(
      fc.property(lonLatArb, lonLatArb, lonLatArb, lonLatArb, (a, b, c, d) => {
        let s = createInitialState();
        s = reduce(s, { type: 'tap', ...a }); // start = a
        s = reduce(s, { type: 'tap', ...b }); // end = b
        s = reduce(s, { type: 'tap', ...c }); // end = c replaces b
        expect(s.start).toEqual(a);
        expect(s.end).toEqual(c);
        s = reduce(s, { type: 'chooseSettingState', settingState: 'start' });
        s = reduce(s, { type: 'tap', ...d }); // start = d replaces a
        expect(s.start).toEqual(d);
        expect(s.end).toEqual(c);
        expect(s.settingState).toBe('start'); // both set: unchanged
      }),
      RUNS,
    );
  });

  it('setStartHere and useLocation set the start; setEndHere sets only the end', () => {
    fc.assert(
      fc.property(initialArb, actionsArb, lonLatArb, (init, actions, p) => {
        const s = actions.reduce(reduce, init);
        for (const type of ['setStartHere', 'useLocation'] as const) {
          const r = reduce(s, { type, ...p });
          expect(r.start).toEqual(p);
          expect(r.end).toEqual(s.exampleActive ? null : s.end);
          expect(r.mode).toBe(s.mode);
          expect(r.selectedSegmentId).toBe(s.selectedSegmentId);
        }
        const e = reduce(s, { type: 'setEndHere', ...p });
        expect(e.end).toEqual(p);
        expect(e.start).toEqual(s.exampleActive ? null : s.start);
        expect(e.mode).toBe(s.mode);
        expect(e.selectedSegmentId).toBe(s.selectedSegmentId);
      }),
      RUNS,
    );
  });

  it('switchMode to plan clears the selection; chooseSettingState sets only the setting state', () => {
    fc.assert(
      fc.property(initialArb, actionsArb, (init, actions) => {
        const s = actions.reduce(reduce, init);
        const plan = reduce(s, { type: 'switchMode', mode: 'plan' });
        expect(plan.mode).toBe('plan');
        expect(plan.selectedSegmentId).toBeNull();
        const rep = reduce(s, { type: 'switchMode', mode: 'report' });
        expect(rep.mode).toBe('report');
        expect(rep.start).toEqual(s.start);
        expect(rep.end).toEqual(s.end);
        const c = reduce(s, { type: 'chooseSettingState', settingState: 'end' });
        expect(c).toEqual({ ...s, settingState: 'end' });
      }),
      RUNS,
    );
  });

  it('clearExample clears points and example flag, returning to Plan_Mode and Start_Setting_State', () => {
    fc.assert(
      fc.property(initialArb, actionsArb, (init, actions) => {
        const s = reduce(actions.reduce(reduce, init), { type: 'clearExample' });
        expect(s.start).toBeNull();
        expect(s.end).toBeNull();
        expect(s.exampleActive).toBe(false);
        expect(s.mode).toBe('plan');
        expect(s.settingState).toBe('start');
        expect(s.selectedSegmentId).toBeNull();
      }),
      RUNS,
    );
  });

  it('reset restores the initial state for the given example and demo value', () => {
    fc.assert(
      fc.property(initialArb, actionsArb, initialOptsArb, (init, actions, opts) => {
        const s = reduce(actions.reduce(reduce, init), { type: 'reset', ...opts });
        expect(s).toEqual(createInitialState(opts));
        expect(s.demo).toBe(opts.demo);
        expect(s.start).toEqual(opts.example ? opts.example.start : null);
        expect(s.end).toEqual(opts.example ? opts.example.end : null);
      }),
      RUNS,
    );
  });

  it('does not alias the example object passed to createInitialState', () => {
    const example = { start: { lon: 101.7, lat: 3.1 }, end: { lon: 101.8, lat: 3.2 } };
    const s = createInitialState({ example });
    expect(s.start).toEqual(example.start);
    expect(s.start).not.toBe(example.start);
  });
});

describe('Property 31: setting a point clears the Sample_Walk (17.17)', () => {
  const exampleOpts = fc.record({ example: fc.record({ start: lonLatArb, end: lonLatArb }) });
  const pointTypes = ['tap', 'setStartHere', 'setEndHere', 'useLocation'] as const;

  it('each point-setting action leaves only the new point and clears the example', () => {
    fc.assert(
      fc.property(exampleOpts, fc.constantFrom(...pointTypes), fc.constantFrom('start' as const, 'end' as const), lonLatArb, (o, type, ss, p) => {
        const init = reduce(createInitialState(o), { type: 'chooseSettingState', settingState: ss });
        const r = reduce(init, { type, ...p });
        expect(r.exampleActive).toBe(false);
        const isEnd = type === 'setEndHere' || (type === 'tap' && ss === 'end');
        expect(r.start).toEqual(isEnd ? null : p);
        expect(r.end).toEqual(isEnd ? p : null);
        expect(r.settingState).toBe(isEnd ? 'start' : 'end');
      }),
      RUNS,
    );
  });

  it('an end action with a user-set start stays in End_Setting_State', () => {
    fc.assert(
      fc.property(exampleOpts, lonLatArb, lonLatArb, lonLatArb, (o, a, b, c) => {
        let s = reduce(createInitialState(o), { type: 'setStartHere', ...a }); // example cleared, start = a
        s = reduce(s, { type: 'setEndHere', ...b });
        expect(s.start).toEqual(a);
        expect(s.end).toEqual(b);
        expect(s.settingState).toBe('end');
        s = reduce(s, { type: 'setEndHere', ...c });
        expect(s.start).toEqual(a);
        expect(s.end).toEqual(c);
        expect(s.settingState).toBe('end');
      }),
      RUNS,
    );
  });

  it('Report_Mode taps keep the example', () => {
    fc.assert(
      fc.property(exampleOpts, lonLatArb, segArb, (o, p, seg) => {
        const init = reduce(createInitialState(o), { type: 'switchMode', mode: 'report' });
        const r = reduce(init, { type: 'tap', ...p, segmentId: seg });
        expect(r.exampleActive).toBe(true);
        expect(r.start).toEqual(o.example.start);
        expect(r.end).toEqual(o.example.end);
      }),
      RUNS,
    );
  });

  it('hand-computed example: tap at (10, 20) in Start_Setting_State over an example', () => {
    const s = createInitialState({ example: { start: { lon: 1, lat: 2 }, end: { lon: 3, lat: 4 } } });
    const r = reduce(s, { type: 'tap', lon: 10, lat: 20 });
    expect(r.start).toEqual({ lon: 10, lat: 20 });
    expect(r.end).toBeNull();
    expect(r.exampleActive).toBe(false);
    expect(r.settingState).toBe('end');
    const e = reduce(s, { type: 'setEndHere', lon: 5, lat: 6 });
    expect(e.start).toBeNull();
    expect(e.end).toEqual({ lon: 5, lat: 6 });
    expect(e.settingState).toBe('start');
  });

  it('invalid coordinates leave the example untouched (reducer throws)', () => {
    const s = createInitialState({ example: { start: { lon: 1, lat: 2 }, end: { lon: 3, lat: 4 } } });
    expect(() => reduce(s, { type: 'setEndHere', lon: NaN, lat: 0 })).toThrow(ArgumentError);
    expect(s.exampleActive).toBe(true);
  });
});

describe('Property 31: setting state follows the unset point (6.1, 17.17)', () => {
  const pointTypes = ['tap', 'setStartHere', 'setEndHere', 'useLocation'] as const;
  it('after any point-setting action the state is the unset point state, or unchanged when both are set', () => {
    fc.assert(
      fc.property(initialArb, actionsArb, fc.constantFrom(...pointTypes), lonLatArb, (init, actions, type, p) => {
        const s = reduce(actions.reduce(reduce, init), { type: 'switchMode', mode: 'plan' });
        const r = reduce(s, { type, ...p });
        if (r.start === null && r.end !== null) expect(r.settingState).toBe('start');
        else if (r.end === null && r.start !== null) expect(r.settingState).toBe('end');
        else expect(r.settingState).toBe(s.settingState);
      }),
      RUNS,
    );
  });
  it('chooseSettingState overrides the computed state, and Report_Mode taps never change it', () => {
    fc.assert(
      fc.property(initialArb, actionsArb, fc.constantFrom(...pointTypes), lonLatArb, fc.constantFrom('start' as const, 'end' as const), (init, actions, type, p, ss) => {
        const s = reduce(actions.reduce(reduce, init), { type: 'switchMode', mode: 'plan' });
        expect(reduce(reduce(s, { type, ...p }), { type: 'chooseSettingState', settingState: ss }).settingState).toBe(ss);
        const rep = reduce(s, { type: 'switchMode', mode: 'report' });
        expect(reduce(rep, { type: 'tap', ...p }).settingState).toBe(s.settingState);
      }),
      RUNS,
    );
  });
  it('hand-computed example (a): end first, then a tap sets the start and the state stays start', () => {
    const e = reduce(createInitialState(), { type: 'setEndHere', lon: 5, lat: 6 });
    expect(e.start).toBeNull();
    expect(e.end).toEqual({ lon: 5, lat: 6 });
    expect(e.settingState).toBe('start');
    const t = reduce(e, { type: 'tap', lon: 10, lat: 20 });
    expect(t.start).toEqual({ lon: 10, lat: 20 });
    expect(t.end).toEqual({ lon: 5, lat: 6 });
    expect(t.settingState).toBe('start');
  });
  it('hand-computed example (b): with both points set the state is left unchanged', () => {
    let s = reduce(createInitialState(), { type: 'setStartHere', lon: 1, lat: 2 });
    s = reduce(s, { type: 'setEndHere', lon: 3, lat: 4 });
    expect(s.settingState).toBe('end');
    const e = reduce(s, { type: 'setEndHere', lon: 7, lat: 8 });
    expect(e.end).toEqual({ lon: 7, lat: 8 });
    expect(e.settingState).toBe('end');
    const st = reduce(s, { type: 'chooseSettingState', settingState: 'start' });
    const t = reduce(st, { type: 'tap', lon: 9, lat: 9 });
    expect(t.start).toEqual({ lon: 9, lat: 9 });
    expect(t.end).toEqual({ lon: 3, lat: 4 });
    expect(t.settingState).toBe('start');
  });
});

describe('Property 31: invalid coordinates are rejected by name', () => {
  const badLon = fc.oneof(
    fc.constantFrom(NaN, Infinity, -Infinity),
    fc.double({ min: 180.001, max: 1e6, noNaN: true }),
    fc.double({ min: -1e6, max: -180.001, noNaN: true }),
  );
  const badLat = fc.oneof(
    fc.constantFrom(NaN, Infinity, -Infinity),
    fc.double({ min: 90.001, max: 1e6, noNaN: true }),
    fc.double({ min: -1e6, max: -90.001, noNaN: true }),
  );
  const nameFor = { tap: 'tap', setStartHere: 'start', setEndHere: 'end', useLocation: 'location' } as const;
  const typeArb = fc.constantFrom('tap' as const, 'setStartHere' as const, 'setEndHere' as const, 'useLocation' as const);

  function thrown(s: AppState, a: AppAction): ArgumentError {
    try {
      reduce(s, a);
    } catch (e) {
      expect(e).toBeInstanceOf(ArgumentError);
      return e as ArgumentError;
    }
    throw new Error('expected ArgumentError');
  }

  it('bad longitude or latitude throws ArgumentError naming the argument', () => {
    fc.assert(
      fc.property(initialArb, typeArb, badLon, latArb, badLat, lonArb, fc.constantFrom('plan' as const, 'report' as const), (init, type, bl, la, bt, lo, mode) => {
        const s = reduce(init, { type: 'switchMode', mode });
        const e1 = thrown(s, { type, lon: bl, lat: la });
        expect(e1.message.startsWith(`${nameFor[type]} longitude`)).toBe(true);
        const e2 = thrown(s, { type, lon: lo, lat: bt });
        expect(e2.message.startsWith(`${nameFor[type]} latitude`)).toBe(true);
      }),
      RUNS,
    );
  });

  it('bad mode or setting state throws ArgumentError naming the argument', () => {
    const s = createInitialState();
    expect(thrown(s, { type: 'switchMode', mode: 'nope' as never }).argument).toBe('mode');
    expect(thrown(s, { type: 'chooseSettingState', settingState: 'nope' as never }).argument).toBe('settingState');
  });

  it('hand-computed example: lon 181 on a tap is rejected, lon 180 / lat -90 is accepted', () => {
    const s = createInitialState();
    expect(thrown(s, { type: 'tap', lon: 181, lat: 0 }).message).toContain('tap longitude');
    const ok = reduce(s, { type: 'tap', lon: 180, lat: -90 });
    expect(ok.start).toEqual({ lon: 180, lat: -90 });
    expect(ok.settingState).toBe('end');
  });
});
