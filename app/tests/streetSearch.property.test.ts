import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { haversine } from '../src/geo/distance';
import { buildGraph } from '../src/graph/build';
import {
  MAX_RESULTS,
  buildStreetIndex,
  normalise,
  searchStreets,
  type Centre,
  type SearchResult,
  type StreetIndex,
} from '../src/search/streetSearch';
import type { Segment } from '../src/types';

// Feature: gloam-web-app, Property 36: Street search returns only pack names, ignores case and diacritics, caps at 8 and is deterministic
// **Validates: Requirements 16.23, 19.1, 19.2, 19.6, 19.9**

const RUNS = { numRuns: 100 };
const STEP = 0.01;

const NAMES: ReadonlyArray<string | null> = [
  'Main Street',
  'MAIN STREET',
  'Main',
  'Maine Avenue',
  'Élan Way',
  'Elan Way',
  'Straße des 17. Juni',
  'Strasse 17',
  'Østergade',
  'Đorđe Road',
  'Łąka Lane',
  'Æble Alley',
  'Œuvre Row',
  'Church Lane',
  'church lane north',
  null,
];

interface Spec {
  name: string | null;
  x: number;
  y: number;
  vertical: boolean;
}

// Small lattice symmetric about (0, 0): mirrored stretches of one name sit at exactly equal distances.
const specArb: fc.Arbitrary<Spec> = fc.record({
  name: fc.constantFrom(...NAMES.slice(0, 6), NAMES[13]!, NAMES[13]!, NAMES[13]!, ...NAMES.slice(6)),
  x: fc.integer({ min: -3, max: 2 }),
  y: fc.integer({ min: -3, max: 2 }),
  vertical: fc.boolean(),
});

function toSegments(specs: ReadonlyArray<Spec>, mirror: boolean): Segment[] {
  const out: Segment[] = [];
  const mk = (s: Spec, id: string, sx: number, sy: number): Segment => ({
    id,
    name: s.name,
    highway: 'residential',
    litProbability: 0.5,
    confidence: 0.5,
    labelSource: 'estimated',
    coordinates: s.vertical
      ? [
          [sx * STEP, sy * STEP],
          [sx * STEP, (sy + 1) * STEP],
        ]
      : [
          [sx * STEP, sy * STEP],
          [(sx + 1) * STEP, sy * STEP],
        ],
  });
  specs.forEach((s, i) => {
    out.push(mk(s, `a${i}`, s.x, s.y));
    // Mirror about the equator (horizontal) or the prime meridian (vertical): equal distance from (0, 0).
    if (mirror) out.push(mk(s, `b${i}`, s.vertical ? -s.x : s.x, s.vertical ? s.y : -s.y));
  });
  return out;
}

const segmentsArb = fc
  .tuple(fc.array(specArb, { minLength: 1, maxLength: 25 }), fc.boolean())
  .map(([specs, mirror]) => toSegments(specs, mirror));

const centreArb: fc.Arbitrary<Centre> = fc.oneof(
  fc.constant({ lon: 0, lat: 0 }),
  fc.record({
    lon: fc.integer({ min: -40, max: 40 }).map((n) => n * STEP * 0.1),
    lat: fc.integer({ min: -40, max: 40 }).map((n) => n * STEP * 0.1),
  }),
);

// Packs of multi-Edge stretches: each stretch is a chain of 2 to 6 polyline Segments, every Segment starting at
// a vertex of the one before (end or interior, so Segments get cut into several Edges), some written in the
// reverse direction, with ids whose code-unit order differs from their numeric order ("s10" < "s2").
// Coordinates are off-lattice so lengths are not round numbers.
const vertexStep = fc.tuple(fc.integer({ min: -9, max: 9 }), fc.integer({ min: -9, max: 9 }));
const chainSegArb = fc.record({
  steps: fc.array(vertexStep, { minLength: 1, maxLength: 3 }),
  from: fc.nat(10),
  reversed: fc.boolean(),
});
const stretchArb = fc.record({
  name: fc.constantFrom('Church Lane', 'Main Street', 'Élan Way', 'Ring Road'),
  x: fc.integer({ min: -20, max: 20 }),
  y: fc.integer({ min: -20, max: 20 }),
  chain: fc.array(chainSegArb, { minLength: 2, maxLength: 6 }),
});

const multiEdgePackArb: fc.Arbitrary<Segment[]> = fc
  .array(stretchArb, { minLength: 1, maxLength: 5 })
  .map((stretches) => {
    const out: Segment[] = [];
    let n = 0;
    stretches.forEach((st, si) => {
      // Stretches sit far apart (0.5 degrees), so only the chain joins Segments of one stretch.
      let verts: Array<[number, number]> = [[si * 0.5 + st.x * 0.00137, st.y * 0.00091]];
      st.chain.forEach((c, ci) => {
        const start = ci === 0 ? verts[0]! : verts[c.from % verts.length]!;
        const coords: Array<[number, number]> = [start];
        for (const [dx, dy] of c.steps) {
          const p = coords[coords.length - 1]!;
          coords.push([p[0] + (dx === 0 && dy === 0 ? 1 : dx) * 0.00113, p[1] + dy * 0.00079]);
        }
        verts = coords;
        out.push({
          id: `s${n++ * 7 + 3}`,
          name: st.name,
          highway: 'residential',
          litProbability: 0.5,
          confidence: 0.5,
          labelSource: 'estimated',
          coordinates: c.reversed ? [...coords].reverse() : coords,
        });
      });
    });
    return out;
  });

const permutationKeys = fc.array(fc.double({ min: 0, max: 1, noNaN: true }), { minLength: 60, maxLength: 60 });

function permute<T>(items: ReadonlyArray<T>, keys: ReadonlyArray<number>): T[] {
  return items
    .map((item, i) => ({ item, k: keys[i % keys.length]!, i }))
    .sort((p, q) => p.k - q.k || p.i - q.i)
    .map((p) => p.item);
}

const queryArb = (segments: ReadonlyArray<Segment>): fc.Arbitrary<string> => {
  const named = segments.filter((s) => s.name !== null).map((s) => s.name as string);
  const base = named.length > 0 ? fc.constantFrom(...named) : fc.constant('main');
  return fc.oneof(
    base,
    fc.tuple(base, fc.nat(30)).map(([n, k]) => [...n].slice(0, k).join('')),
    fc.tuple(base, fc.nat(4)).map(([n, k]) => n.split(/\s+/)[k % n.split(/\s+/).length]!),
    fc.tuple(base, base).map(([a, b]) => `${b.split(/\s+/)[0]} ${a.split(/\s+/).pop()}`),
    fc.constantFrom('m', 'é', 'el', 'STRASSE 17', 'church lane', 'street main', '  ', 'xq', 'ø', 'ss'),
    fc.string({ maxLength: 6 }),
  );
};

function build(segments: ReadonlyArray<Segment>): StreetIndex {
  return buildStreetIndex(segments, buildGraph(segments).graph);
}

const cu = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** Reference: filter entries by token prefixes, then sort by the total order and take 8. */
function reference(index: StreetIndex, query: string, centre: Centre): Array<{ key: string; name: string }> {
  if ([...query.trim()].length < 2) return [];
  const nq = normalise(query);
  if (nq === '') return [];
  const qt = nq.split(' ');
  const rows = index.entries
    .filter((e) => qt.every((q) => e.tokens.some((t) => t.startsWith(q))))
    .map((e) => ({
      e,
      tier: e.norm === nq ? 0 : e.norm.startsWith(nq) ? 1 : 2,
      d: haversine(centre.lon, centre.lat, e.lon, e.lat),
    }));
  rows.sort(
    (p, q) =>
      p.tier - q.tier ||
      p.e.norm.length - q.e.norm.length ||
      cu(p.e.norm, q.e.norm) ||
      (p.d < q.d ? -1 : p.d > q.d ? 1 : 0) ||
      cu(p.e.key, q.e.key),
  );
  return rows.slice(0, 8).map((r) => ({ key: r.e.key, name: r.e.name }));
}

const view = (rs: SearchResult[]): unknown => rs.map((r) => ({ ...r }));

describe('Property 36: street search', () => {
  it('(a) results carry only names and stretch keys from the pack, at most 8', () => {
    fc.assert(
      fc.property(
        segmentsArb.chain((segs) => fc.tuple(fc.constant(segs), queryArb(segs), centreArb)),
        ([segs, q, c]) => {
          const names = new Set(segs.map((s) => s.name));
          const ids = new Set(segs.map((s) => s.id));
          const res = searchStreets(build(segs), q, c);
          expect(res.length).toBeLessThanOrEqual(MAX_RESULTS);
          for (const r of res) {
            expect(names.has(r.name)).toBe(true);
            expect(ids.has(r.stretchKey)).toBe(true);
          }
        },
      ),
      RUNS,
    );
  });

  it('(b) ignores letter case and combining marks', () => {
    fc.assert(
      fc.property(
        segmentsArb.chain((segs) => fc.tuple(fc.constant(segs), queryArb(segs), centreArb)),
        ([segs, q, c]) => {
          const index = build(segs);
          const upper = q.toUpperCase();
          const lower = q.toLowerCase();
          const stripped = q.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
          const marked = [...q].map((ch) => (/\p{L}/u.test(ch) ? `${ch}\u0301` : ch)).join('');
          const expected = view(searchStreets(index, q, c));
          for (const v of [upper, lower, stripped, marked]) {
            // The 2-code-point rule applies to the raw text, so compare only when both sides pass it.
            if ([...q.trim()].length >= 2 && [...v.trim()].length >= 2) {
              expect(view(searchStreets(index, v, c))).toEqual(expected);
            }
          }
          // ß written as ss
          if (q.includes('ß') && [...q.replace(/ß/g, 'ss').trim()].length >= 2 && [...q.trim()].length >= 2) {
            expect(view(searchStreets(index, q.replace(/ß/g, 'ss'), c))).toEqual(expected);
          }
        },
      ),
      RUNS,
    );
  });

  it('(c) returns [] when the trimmed query has fewer than 2 code points', () => {
    fc.assert(
      fc.property(segmentsArb, centreArb, fc.constantFrom('', ' ', 'm', ' m ', 'é', 'ß', '😀'), (segs, c, q) => {
        expect(searchStreets(build(segs), q, c)).toEqual([]);
      }),
      RUNS,
    );
  });

  it('(d) is deterministic, permutation-independent and the first 8 of the reference order', () => {
    fc.assert(
      fc.property(
        segmentsArb.chain((segs) => fc.tuple(fc.constant(segs), queryArb(segs), centreArb, permutationKeys)),
        ([segs, q, c, keys]) => {
          const index = build(segs);
          const first = searchStreets(index, q, c);
          expect(view(searchStreets(index, q, c))).toEqual(view(first));
          expect(view(searchStreets(build(permute(segs, keys)), q, c))).toEqual(view(first));
          expect(first.map((r) => ({ key: r.stretchKey, name: r.name }))).toEqual(reference(index, q, c));
        },
      ),
      RUNS,
    );
  });

  it('(e) every entry midpoint is bit-identical for any permutation of the same Segments (multi-Edge stretches)', () => {
    let multiEdge = 0;
    fc.assert(
      fc.property(multiEdgePackArb, permutationKeys, (segs, keys) => {
        const graph = buildGraph(segs).graph;
        const a = buildStreetIndex(segs, graph).entries;
        const b = build(permute(segs, keys)).entries;
        expect(b.map((e) => e.key)).toEqual(a.map((e) => e.key));
        if (graph.edges.length >= 3 && a.some((e) => e.segmentIds.length >= 2)) multiEdge++;
        a.forEach((e, i) => {
          const o = b[i]!;
          expect(o.lon === e.lon).toBe(true);
          expect(o.lat === e.lat).toBe(true);
          expect(Object.is(o.lon, e.lon)).toBe(true);
          expect(Object.is(o.lat, e.lat)).toBe(true);
        });
      }),
      RUNS,
    );
    expect(multiEdge).toBeGreaterThan(50); // the generator really made multi-Edge stretches
  });

  it('(d) orders equal-name stretches by distance, with exact ties broken by stretch key', () => {
    fc.assert(
      fc.property(
        fc.array(specArb.map((s) => ({ ...s, name: 'Church Lane' })), { minLength: 2, maxLength: 20 }),
        permutationKeys,
        (specs, keys) => {
          const segs = toSegments(specs, true);
          const c = { lon: 0, lat: 0 };
          const res = searchStreets(build(permute(segs, keys)), 'church lane', c);
          expect(res.length).toBeLessThanOrEqual(MAX_RESULTS);
          for (let i = 1; i < res.length; i++) {
            const p = res[i - 1]!;
            const r = res[i]!;
            expect(p.distanceM).toBeLessThanOrEqual(r.distanceM);
            if (p.distanceM === r.distanceM) expect(cu(p.stretchKey, r.stretchKey)).toBeLessThan(0);
          }
        },
      ),
      RUNS,
    );
  });
});
