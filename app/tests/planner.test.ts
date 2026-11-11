// Task 14.3: planner cache, same-place handling, slider rate limit and the plan controller.
import fc from 'fast-check';
import { afterEach, describe, expect, it, vi } from 'vitest';
import seattleRaw from '../../data/seattle.segments.geojson?raw';
import { buildGraph } from '../src/graph/build';
import { buildSnapIndex, packBounds } from '../src/graph/snap';
import { MANIFEST } from '../src/pack/manifest';
import { parseSegmentFile } from '../src/pack/parse';
import { DEFAULT_SETTINGS, medianConfidence } from '../src/routing/costs';
import { createPlanner } from '../src/routing/planner';
import type { PlanInput, PlanPack } from '../src/routing/planner';
import { createInitialState, reduce } from '../src/state/appState';
import { createPlanController } from '../src/state/planController';
import { limitRate } from '../src/state/rateLimit';
import { createLocalSettingsStore } from '../src/storage/localSettingsStore';

const parsed = parseSegmentFile(JSON.parse(seattleRaw));
if ('kind' in parsed) throw new Error(parsed.detail);
const { graph } = buildGraph(parsed.segments);
const pack: PlanPack = {
  graph,
  index: buildSnapIndex(graph),
  bounds: packBounds(parsed.segments),
  medianConfidence: medianConfidence(graph),
};
const walk = MANIFEST.find((m) => m.id === 'seattle')!.sampleWalk;
const start = { lon: walk.start[0], lat: walk.start[1] };
const end = { lon: walk.end[0], lat: walk.end[1] };
const overrides = new Map();
const base: PlanInput = { pack, start, end, lambda: 3, settings: DEFAULT_SETTINGS, overrides };

afterEach(() => vi.useRealTimers());

describe('planner', () => {
  it('computes the Shortest_Route once per start/end pair, whatever Lambda and settings do', () => {
    fc.assert(
      fc.property(
        fc.array(fc.tuple(fc.integer({ min: 0, max: 20 }), fc.boolean(), fc.boolean()), { minLength: 1, maxLength: 6 }),
        (steps) => {
          const planner = createPlanner();
          for (const [half, steps_, main] of steps) {
            const out = planner.plan({
              ...base,
              lambda: half / 2,
              settings: { ...DEFAULT_SETTINGS, avoidSteps: steps_, preferMain: main },
            });
            expect(out.kind).toBe('route');
          }
          expect(planner.shortestRuns).toBe(1);
        },
      ),
      { numRuns: 20 },
    );
  });

  it('computes it again when a point changes', () => {
    const planner = createPlanner();
    planner.plan(base);
    planner.plan({ ...base, end: { lon: end.lon + 0.001, lat: end.lat } });
    expect(planner.shortestRuns).toBe(2);
  });

  it('start and end snapped to the same point is samePlace, with no route', () => {
    const planner = createPlanner();
    expect(planner.plan({ ...base, end: start })).toEqual({ kind: 'samePlace' });
  });

  it('a point outside the pack area is outsideArea, and no pack is incomplete', () => {
    const planner = createPlanner();
    expect(planner.plan({ ...base, end: { lon: 0, lat: 0 } })).toEqual({ kind: 'outsideArea' });
    expect(planner.plan({ ...base, pack: null })).toEqual({ kind: 'incomplete' });
  });
});

describe('limitRate', () => {
  it('runs at most once per 100 ms and applies the last value of a drag', () => {
    vi.useFakeTimers();
    const seen: number[] = [];
    const limited = limitRate((v: number) => seen.push(v), 100);
    for (let i = 0; i < 20; i++) {
      limited(i);
      vi.advanceTimersByTime(10); // a 200 ms drag
    }
    vi.advanceTimersByTime(200);
    expect(seen[0]).toBe(0);
    expect(seen.at(-1)).toBe(19);
    expect(seen.length).toBeLessThanOrEqual(3);
  });
});

describe('plan controller', () => {
  const make = () =>
    createPlanController({
      initial: createInitialState({ example: { start, end } }),
      getPack: () => pack,
      getOverrides: () => overrides,
      getMapCenter: () => start,
      settingsStore: createLocalSettingsStore(null),
      geolocation: null,
    });

  it('keeps working when settings cannot be read, and says so', () => {
    const c = make();
    expect(c.getSnapshot().notices.settings).toBe(true);
    expect(c.getSnapshot().outcome.kind).toBe('route');
  });

  it('rejects a bad Lambda and keeps the previous one', () => {
    const c = make();
    c.requestLambda(Number.NaN);
    c.requestLambda(11);
    expect(c.getSnapshot().state.lambda).toBe(3);
    expect(c.getSnapshot().notices.number).toBe(true);
    expect(() => reduce(c.getSnapshot().state, { type: 'setLambda', lambda: -1 })).toThrowError(/lambda/);
  });

  it('showExample keeps Lambda and settings; a tap then clears the example and sets the start alone', () => {
    const c = make();
    c.requestLambda(7);
    c.dispatch({ type: 'showExample', start, end });
    expect(c.getSnapshot().state.lambda).toBe(7);
    expect(c.getSnapshot().state.exampleActive).toBe(true);
    c.dispatch({ type: 'tap', lon: start.lon, lat: start.lat });
    const s = c.getSnapshot().state;
    expect(s.exampleActive).toBe(false);
    expect(s.start).toEqual(start);
    expect(s.end).toBeNull();
    expect(s.settingState).toBe('end');
    expect(c.getSnapshot().outcome.kind).toBe('incomplete');
  });

  it('Set start here and Set end here at the same place give samePlace', () => {
    const c = make();
    c.setStartHere();
    c.setEndHere();
    expect(c.getSnapshot().outcome.kind).toBe('samePlace');
  });
});
