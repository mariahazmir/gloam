import { describe, expect, it } from 'vitest';
import { buildGraph } from '../src/graph/build';
import {
  buildStreetIndex,
  compassOf,
  compassOfBearing,
  groupStretches,
  normalise,
  roundDistance,
  searchStreets,
  type StreetIndex,
  type StretchEntry,
} from '../src/search/streetSearch';
import type { Segment } from '../src/types';
import { ArgumentError } from '../src/validation/errors';

const ORIGIN = { lon: 0, lat: 0 };

function seg(id: string, name: string | null, coordinates: Array<[number, number]>): Segment {
  return { id, name, highway: 'residential', litProbability: 0.5, confidence: 0.5, labelSource: 'estimated', coordinates };
}

function entry(key: string, name: string, lon: number, lat: number): StretchEntry {
  const norm = normalise(name);
  return { key, name, norm, segmentIds: [key], tokens: norm.split(' '), lon, lat };
}

function indexOf(segments: Segment[]): StreetIndex {
  return buildStreetIndex(segments, buildGraph(segments).graph);
}

describe('street search: Church Lane distance ranking (Property 36, example 3)', () => {
  const offsets: Array<[string, number]> = [
    ['40', 3], ['12', -5], ['7', 1], ['31', -2], ['25', 5], ['9', -8], ['18', 4], ['60', -6], ['5', 9], ['22', -7],
  ];
  const entries = offsets.map(([k, n]) => entry(k, 'Church Lane', 0, n / 1000));
  const expectedKeys = ['7', '31', '40', '18', '12', '25', '60', '22'];
  const expectedDist = ['111.195', '222.390', '333.585', '444.780', '555.975', '555.975', '667.170', '778.366'];

  it('returns 8 in distance order with the stated distances, ties by key, dropping "9" and "5"', () => {
    const res = searchStreets({ entries }, 'church lane', ORIGIN);
    expect(res.map((r) => r.stretchKey)).toEqual(expectedKeys);
    expect(res.map((r) => r.distanceM.toFixed(3))).toEqual(expectedDist);
    expect(res.map((r) => r.stretchKey)).not.toContain('9');
    expect(res.map((r) => r.stretchKey)).not.toContain('5');
    expect(res[4]!.distanceM).toBe(res[5]!.distanceM);
  });

  it('is not the order key order alone would give', () => {
    const byKey = offsets.map(([k]) => k).sort().slice(0, 8);
    expect(byKey).toEqual(['12', '18', '22', '25', '31', '40', '5', '60']);
    expect(byKey).not.toEqual(expectedKeys);
  });

  it('gives the same 8 for shuffled index entries', () => {
    const shuffled = [...entries].reverse();
    const rotated = [...entries.slice(4), ...entries.slice(0, 4)];
    for (const list of [shuffled, rotated]) {
      expect(searchStreets({ entries: list }, 'church lane', ORIGIN).map((r) => r.stretchKey)).toEqual(expectedKeys);
    }
  });

  it('gives the same results for shuffled Segment input', () => {
    // Each stretch is one short north-south Segment centred on its latitude.
    const segs = offsets.map(([k, n]) =>
      seg(k, 'Church Lane', [[0, n / 1000 - 0.0001], [0, n / 1000 + 0.0001]]),
    );
    const a = searchStreets(indexOf(segs), 'church lane', ORIGIN).map((r) => r.stretchKey);
    const b = searchStreets(indexOf([...segs].reverse()), 'church lane', ORIGIN).map((r) => r.stretchKey);
    expect(a).toEqual(b);
    expect(a).toHaveLength(8);
    expect(a.slice(0, 4)).toEqual(['7', '31', '40', '18']);
    expect(a.slice(6)).toEqual(['60', '22']);
  });

  it('real buildStreetIndex output: shuffled Segment input gives the same 8 in the same order, with the exact tie "12" before "25"', () => {
    // One short north-south Segment per stretch, one Edge, so the midpoint is p + (q - p) * 0.5 with
    // f = (d / 2) / d = 0.5 exactly. The pair "12" (-5) and "25" (+5) is mirrored about the equator:
    // negation is exact in IEEE arithmetic, and haversine(0, 0, 0, lat) uses only sin(dlat / 2)^2 and
    // cos(lat), both symmetric, so the two distances are bit-equal. Nothing here sets a midpoint directly.
    for (const sign of [1, -1]) {
      const segs = offsets.map(([k, n]) =>
        seg(k, 'Church Lane', [[0, (sign * n) / 1000 - 0.0001], [0, (sign * n) / 1000 + 0.0001]]),
      );
      const rotated = [...segs.slice(3), ...segs.slice(0, 3)];
      const interleaved = [...segs].sort((p, q) => (Number(p.id) % 3) - (Number(q.id) % 3) || Number(q.id) - Number(p.id));
      const inputs = [segs, [...segs].reverse(), rotated, interleaved];
      const baseline = searchStreets(indexOf(segs), 'church lane', ORIGIN);
      expect(baseline.map((r) => r.stretchKey)).toEqual(expectedKeys);
      expect(baseline.map((r) => r.distanceM.toFixed(3))).toEqual(expectedDist);
      // The tie: positions 4 and 5, exactly equal (not just close), ordered by code unit of the key.
      expect(baseline[4]!.distanceM).toBe(baseline[5]!.distanceM);
      expect(Object.is(baseline[4]!.distanceM, baseline[5]!.distanceM)).toBe(true);
      expect([baseline[4]!.stretchKey, baseline[5]!.stretchKey]).toEqual(['12', '25']);
      expect(baseline[4]!.lat).toBe(-baseline[5]!.lat);
      for (const input of inputs) {
        const res = searchStreets(indexOf(input), 'church lane', ORIGIN);
        expect(res).toHaveLength(8);
        expect(res.map((r) => r.stretchKey)).toEqual(expectedKeys);
        expect(res.map((r) => r.distanceM)).toEqual(baseline.map((r) => r.distanceM));
        expect(res.map((r) => [r.lon, r.lat])).toEqual(baseline.map((r) => [r.lon, r.lat]));
      }
    }
  });
});

describe('street search: normalise', () => {
  it('normalises the hand-checked names', () => {
    expect(normalise('Straße des 17. Juni')).toBe('strasse des 17 juni');
    expect(normalise('Élan Way')).toBe('elan way');
    expect(normalise('main  street')).toBe('main street');
  });
});

describe('street search: hand example 1 (Main Street and friends)', () => {
  const segs = [
    seg('10', 'Main Street', [[0, 0], [0.001, 0]]),
    seg('11', 'main  street', [[0.001, 0], [0.002, 0]]),
    seg('12', 'Main Street', [[0.05, 0], [0.051, 0]]),
    seg('13', 'Maine Road', [[0, 0.001], [0.001, 0.001]]),
    seg('14', 'Élan Way', [[0.1, 0], [0.101, 0]]),
    seg('15', null, [[0.2, 0], [0.201, 0]]),
  ];
  const { graph } = buildGraph(segs);
  const index = buildStreetIndex(segs, graph);
  const keys = (q: string): string[] => searchStreets(index, q, ORIGIN).map((r) => r.stretchKey);

  it('groups stretches: joined at a shared node, separate when apart, key = smallest id', () => {
    const st = groupStretches(segs, graph);
    expect(st.map((s) => s.key)).toEqual(['10', '12', '13', '14']);
    expect(st[0]!.segmentIds).toEqual(['10', '11']);
    expect(st[0]!.norm).toBe('main street');
    expect(st.flatMap((s) => s.segmentIds)).not.toContain('15');
  });

  it('"main" (any case or accent): Maine Road, then the two Main Streets nearest first', () => {
    for (const q of ['main', 'MAIN', 'máin']) expect(keys(q)).toEqual(['13', '10', '12']);
    const res = searchStreets(index, 'main', ORIGIN);
    expect(res[1]!.name).toBe('Main Street');
    expect(res[1]!.distanceM).toBeCloseTo(111.195, 2);
    expect(res[2]!.distanceM / 1000).toBeCloseTo(5.6, 1);
  });

  it('"main street" gives 2 exact matches; "street main" gives the same 2', () => {
    expect(keys('main street')).toEqual(['10', '12']);
    expect(keys('street main')).toEqual(['10', '12']);
  });

  it('one-code-point queries give nothing; "el" finds Élan Way', () => {
    expect(keys('m')).toEqual([]);
    expect(keys('é')).toEqual([]);
    const res = searchStreets(index, 'el', ORIGIN);
    expect(res).toHaveLength(1);
    expect(res[0]!.name).toBe('Élan Way');
  });
});

describe('street search: hand example 2 (Straße des 17. Juni)', () => {
  const index = indexOf([seg('20', 'Straße des 17. Juni', [[0, 0], [0.001, 0]])]);
  it('finds the single stretch for each query', () => {
    for (const q of ['STRASSE 17', 'Straße', 'strasse', 'STRAßE']) {
      const res = searchStreets(index, q, ORIGIN);
      expect(res.map((r) => r.stretchKey)).toEqual(['20']);
      expect(res[0]!.name).toBe('Straße des 17. Juni');
    }
  });
});

describe('street search: wording', () => {
  it('compassOfBearing sector boundaries go to the later sector', () => {
    expect(compassOfBearing(22.5)).toBe('ne');
    expect(compassOfBearing(22.4999)).toBe('n');
    expect(compassOfBearing(67.5)).toBe('e');
    expect(compassOfBearing(337.5)).toBe('n');
    expect(compassOfBearing(337.4999)).toBe('nw');
  });

  it('compassOf uses the initial bearing', () => {
    expect(compassOf(ORIGIN, { lon: 0, lat: 0.0054 })).toBe('n');
    expect(compassOf(ORIGIN, { lon: 0.01, lat: 0 })).toBe('e');
    expect(compassOf(ORIGIN, { lon: 0, lat: -0.01 })).toBe('s');
    expect(compassOf(ORIGIN, { lon: -0.01, lat: 0 })).toBe('w');
  });

  it('distance and direction for the hand-checked cases', () => {
    expect(roundDistance(612)).toBe('600 m');
    expect(compassOfBearing(50)).toBe('ne');
    expect(roundDistance(1240)).toBe('1.2 km');
    expect(compassOfBearing(181)).toBe('s');
    expect(roundDistance(975)).toBe('1.0 km');
    expect(compassOfBearing(337.5)).toBe('n');
    expect(roundDistance(20)).toBeNull();
  });

  it('(0, 0) to latitude 0.0054 reads "600 m" north', () => {
    const idx = { entries: [entry('1', 'Some Road', 0, 0.0054)] };
    const [r] = searchStreets(idx, 'some road', ORIGIN);
    expect(r!.distanceM).toBeCloseTo(600.45, 2);
    expect(roundDistance(r!.distanceM)).toBe('600 m');
    expect(compassOf(ORIGIN, r!)).toBe('n');
  });
});

describe('street search: midpoint by length', () => {
  it('a stretch of three 100 m Edges has its midpoint at the middle of the second Edge', () => {
    const d = 100 / 111195.08; // degrees of longitude for 100 m at the equator
    const segs = [
      seg('a', 'Third Road', [[0, 0], [d, 0]]),
      seg('b', 'Third Road', [[d, 0], [2 * d, 0]]),
      seg('c', 'Third Road', [[2 * d, 0], [3 * d, 0]]),
    ];
    const { graph } = buildGraph(segs);
    expect(graph.edges).toHaveLength(3);
    for (const e of graph.edges) expect(e.lengthM).toBeCloseTo(100, 1);
    const index = buildStreetIndex(segs, graph);
    expect(index.entries).toHaveLength(1);
    const e = index.entries[0]!;
    expect(e.segmentIds).toEqual(['a', 'b', 'c']);
    expect(e.lat).toBe(0);
    expect(e.lon / d).toBeCloseTo(1.5, 3);
    expect(searchStreets(index, 'third road', ORIGIN)[0]!.distanceM).toBeCloseTo(150, 1);
  });
});

describe('street search: ArgumentError', () => {
  const index = { entries: [entry('1', 'Main Street', 0, 0)] };
  const argOf = (fn: () => unknown): string => {
    try {
      fn();
    } catch (e) {
      expect(e).toBeInstanceOf(ArgumentError);
      return (e as ArgumentError).argument;
    }
    throw new Error('did not throw');
  };

  it('names `query` for a non-string query', () => {
    expect(argOf(() => searchStreets(index, 5 as unknown as string, ORIGIN))).toBe('query');
    expect(() => searchStreets(index, undefined as unknown as string, ORIGIN)).toThrow(/^query/);
  });

  it('names `centre` for a missing or invalid centre', () => {
    expect(argOf(() => searchStreets(index, 'main', null as unknown as { lon: number; lat: number }))).toBe('centre');
    expect(() => searchStreets(index, 'main', { lon: 0, lat: Number.NaN })).toThrow(/^centre/);
    expect(() => searchStreets(index, 'main', { lon: 200, lat: 0 })).toThrow(/^centre/);
  });
});
