import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fc from 'fast-check';
import { buildGraph } from '../src/graph/build';
import { announcement, comboStep, initialComboState, type ComboAction } from '../src/search/comboboxState';
import {
  buildStreetIndex,
  compassOf,
  normalise,
  roundDistance,
  searchStreets,
  type Centre,
} from '../src/search/streetSearch';
import type { Segment } from '../src/types';

// Feature: gloam-web-app, Property 37: Street search makes no network request and touches no storage
// **Validates: Requirements 13.12, 16.24, 19.2**

const calls = { fetch: 0, xhr: 0, ws: 0, beacon: 0, storage: 0, console: 0 };
const consoleSpies: Array<ReturnType<typeof vi.spyOn>> = [];

function throwingStorage(): Storage {
  const fail = (): never => {
    calls.storage++;
    throw new Error('storage accessed');
  };
  return new Proxy({} as Storage, { get: fail, set: fail, has: fail, deleteProperty: fail, ownKeys: fail });
}

beforeEach(() => {
  for (const k of Object.keys(calls) as Array<keyof typeof calls>) calls[k] = 0;
  vi.stubGlobal('fetch', () => {
    calls.fetch++;
    throw new Error('fetch called');
  });
  vi.stubGlobal('XMLHttpRequest', function () {
    calls.xhr++;
    throw new Error('XMLHttpRequest used');
  });
  vi.stubGlobal('WebSocket', function () {
    calls.ws++;
    throw new Error('WebSocket used');
  });
  vi.stubGlobal('navigator', {
    sendBeacon: () => {
      calls.beacon++;
      return false;
    },
  });
  vi.stubGlobal('localStorage', throwingStorage());
  vi.stubGlobal('sessionStorage', throwingStorage());
  for (const m of ['log', 'info', 'warn', 'error', 'debug', 'trace'] as const) {
    consoleSpies.push(vi.spyOn(console, m).mockImplementation(() => {}));
  }
});

afterEach(() => {
  for (const s of consoleSpies) calls.console += s.mock.calls.length;
  consoleSpies.length = 0;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const NAMES = ['Main Street', 'Main', 'Élan Way', 'Straße des 17. Juni', 'Church Lane', 'Østergade', null];

const segmentsArb: fc.Arbitrary<Segment[]> = fc
  .array(
    fc.record({
      name: fc.constantFrom(...NAMES),
      x: fc.integer({ min: -3, max: 3 }),
      y: fc.integer({ min: -3, max: 3 }),
      vertical: fc.boolean(),
    }),
    { minLength: 1, maxLength: 15 },
  )
  .map((rows) =>
    rows.map((r, i): Segment => ({
      id: `s${i}`,
      name: r.name,
      highway: 'residential',
      litProbability: 0.5,
      confidence: 0.5,
      labelSource: 'estimated',
      coordinates: r.vertical
        ? [[r.x * 0.01, r.y * 0.01], [r.x * 0.01, (r.y + 1) * 0.01]]
        : [[r.x * 0.01, r.y * 0.01], [(r.x + 1) * 0.01, r.y * 0.01]],
    })),
  );

const centreArb: fc.Arbitrary<Centre> = fc.record({
  lon: fc.double({ min: -0.05, max: 0.05, noNaN: true }),
  lat: fc.double({ min: -0.05, max: 0.05, noNaN: true }),
});

const queryArb = fc.oneof(
  fc.constantFrom('main', 'main street', 'él', 'STRASSE 17', 'church lane', 'm', '  ', 'xq'),
  fc.string({ maxLength: 8 }),
);

const texts = { count: (n: number) => `${n} streets`, noMatch: 'none', shortQuery: 'short' };

describe('Property 37: Street search makes no network request and touches no storage', () => {
  it('index, search, helpers and combobox never use network, storage or console', () => {
    fc.assert(
      fc.property(
        segmentsArb,
        queryArb,
        centreArb,
        fc.double({ min: 0, max: 100_000, noNaN: true }),
        fc.array(fc.constantFrom('arrowDown', 'arrowUp', 'enter', 'escape', 'blur', 'reset'), { maxLength: 8 }),
        (segments, query, centre, dist, keys) => {
          const index = buildStreetIndex(segments, buildGraph(segments).graph);
          const results = searchStreets(index, query, centre);
          normalise(query);
          roundDistance(dist);
          for (const r of results) compassOf(centre, { lon: r.lon, lat: r.lat });

          let state = initialComboState();
          const actions: ComboAction[] = [
            { type: 'input', query, results },
            ...keys.map((type) => ({ type }) as ComboAction),
            { type: 'pointerChoose', index: 0 },
          ];
          for (const a of actions) {
            state = comboStep(state, a).state;
            announcement(state, texts);
          }

          for (const s of consoleSpies) calls.console += s.mock.calls.length;
          consoleSpies.forEach((s) => s.mockClear());
          expect(calls).toEqual({ fetch: 0, xhr: 0, ws: 0, beacon: 0, storage: 0, console: 0 });
        },
      ),
      { numRuns: 100 },
    );
  });
});
