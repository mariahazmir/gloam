import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { buildGraph } from '../../src/graph/build';
import type { StreetGraph } from '../../src/graph/build';
import type { SnapPoint } from '../../src/graph/snap';
import { findRoute } from '../../src/routing/router';
import type { RouteRequest } from '../../src/routing/router';
import type { Segment } from '../../src/types';

// Feature: gloam-web-app, Property 13: Returned routes are valid paths, and disconnected points give no route

const HIGHWAYS = ['primary', 'residential', 'service', 'steps', 'footway'];
const unit = fc.double({ min: 0, max: 1, noNaN: true });

/** Lattice point pools: A is near lon 101, B is far away, so the two never share a coordinate. */
const pt = (pool: 'A' | 'B', i: number): [number, number] =>
  pool === 'A' ? [101 + i * 0.001, 3.1] : [101.5 + i * 0.001, 3.3];

interface Case {
  graph: StreetGraph;
  segments: Segment[];
  startRaw: { edge: number; t: number };
  endRaw: { edge: number; t: number };
  req: Omit<RouteRequest, 'graph' | 'start' | 'end'>;
}

const tGen = fc.oneof(fc.constant(0), fc.constant(1), fc.double({ min: 0, max: 1, noNaN: true }), fc.constantFrom(5e-324, 1 - 1e-16));

/** Build a case: random segments between lattice points of the given pools (no self-loops, unique ids). */
function caseGen(pools: Array<'A' | 'B'>, minPerPool: number): fc.Arbitrary<Case> {
  const segsFor = (pool: 'A' | 'B') =>
    fc.uniqueArray(fc.tuple(fc.integer({ min: 0, max: 5 }), fc.integer({ min: 0, max: 5 })).filter(([i, j]) => i !== j), {
      minLength: minPerPool,
      maxLength: 8,
      selector: ([i, j]) => `${Math.min(i, j)}-${Math.max(i, j)}`,
    }).map((pairs) => pairs.map(([i, j]) => ({ pool, i, j })));
  return fc
    .tuple(
      fc.tuple(...pools.map(segsFor)),
      fc.array(fc.constantFrom(...HIGHWAYS), { minLength: 16, maxLength: 16 }),
      fc.array(fc.tuple(unit, unit), { minLength: 16, maxLength: 16 }),
      fc.record({
        avoidSteps: fc.boolean(),
        avoidService: fc.boolean(),
        preferMain: fc.boolean(),
        lowConfidenceDarker: fc.boolean(),
      }),
      fc.double({ min: 0, max: 10, noNaN: true }),
      unit,
      fc.nat(),
      tGen,
      fc.nat(),
      tGen,
    )
    .map(([groups, hws, probs, settings, lambda, median, se, st, ee, et]) => {
      const flat = groups.flat();
      const segments: Segment[] = flat.map((s, k) => ({
        id: `s${k}`,
        name: null,
        highway: hws[k % hws.length]!,
        litProbability: probs[k % probs.length]![0],
        confidence: probs[k % probs.length]![1],
        labelSource: 'estimated',
        coordinates: [pt(s.pool, s.i), pt(s.pool, s.j)],
      }));
      const { graph } = buildGraph(segments);
      return {
        graph,
        segments,
        startRaw: { edge: se % graph.edges.length, t: st },
        endRaw: { edge: ee % graph.edges.length, t: et },
        req: { lambda, settings, overrides: new Map(), medianConfidence: median },
      };
    });
}

const toSnap = (r: { edge: number; t: number }): SnapPoint => ({ ...r, lon: 0, lat: 0, distanceM: 0 });

/** Identity of a position: base node for t=0/1, otherwise the cut point on that edge. */
function posId(g: StreetGraph, edge: number, t: number): string {
  const e = g.edges[edge]!;
  // Positions within 1 mm of an Edge end collapse onto that end node (design: Router overlay).
  if (t === 0 || t * e.lengthM <= 0.001) return `n${e.a}`;
  if (t === 1 || (1 - t) * e.lengthM <= 0.001) return `n${e.b}`;
  return `v${edge},${t}`;
}

/** Connected-component label per node via union-find. */
function components(g: StreetGraph): number[] {
  const parent = g.nodes.map((_, i) => i);
  const find = (x: number): number => {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]!]!;
      x = parent[x]!;
    }
    return x;
  };
  for (const e of g.edges) parent[find(e.a)] = find(e.b);
  return g.nodes.map((_, i) => find(i));
}

describe('Property 13: path validity and disconnected points', () => {
  it('returned routes are valid connected paths from start to end', () => {
    // **Validates: Requirements 6.8, 16.7**
    fc.assert(
      fc.property(caseGen(['A'], 1), (c) => {
        const { graph } = c;
        const start = toSnap(c.startRaw);
        const end = toSnap(c.endRaw);
        const route = findRoute({ graph, start, end, ...c.req });
        // Single pool segments may still be split into several parts; use components to know the expectation.
        const comp = components(graph);
        const connected = comp[graph.edges[start.edge]!.a] === comp[graph.edges[end.edge]!.a];
        if (!connected) {
          expect(route).toBeNull();
          return;
        }
        expect(route).not.toBeNull();
        const pieces = route!.pieces;
        const s = posId(graph, start.edge, start.t);
        const e = posId(graph, end.edge, end.t);
        if (pieces.length === 0) {
          expect(s).toBe(e);
          return;
        }
        for (const p of pieces) {
          expect(Number.isInteger(p.edge)).toBe(true);
          expect(p.edge).toBeGreaterThanOrEqual(0);
          expect(p.edge).toBeLessThan(graph.edges.length);
          // direction flag agrees with the walked interval
          expect(p.reverse ? p.fromT > p.toT : p.fromT < p.toT).toBe(true);
          expect(p.view.lengthM).toBeGreaterThan(0);
        }
        expect(posId(graph, pieces[0]!.edge, pieces[0]!.fromT)).toBe(s);
        expect(posId(graph, pieces[pieces.length - 1]!.edge, pieces[pieces.length - 1]!.toT)).toBe(e);
        for (let i = 0; i + 1 < pieces.length; i++) {
          const a = pieces[i]!;
          const b = pieces[i + 1]!;
          expect(posId(graph, a.edge, a.toT)).toBe(posId(graph, b.edge, b.fromT));
        }
      }),
    );
  });

  it('returns null when start and end lie in different connected parts', () => {
    // **Validates: Requirements 6.8, 16.8**
    fc.assert(
      fc.property(caseGen(['A', 'B'], 1), (c) => {
        const { graph } = c;
        const comp = components(graph);
        const a = graph.edges.findIndex((_, i) => graph.nodes[graph.edges[i]!.a]!.lat < 3.2);
        const b = graph.edges.findIndex((_, i) => graph.nodes[graph.edges[i]!.a]!.lat > 3.2);
        expect(comp[graph.edges[a]!.a]).not.toBe(comp[graph.edges[b]!.a]);
        const start = toSnap({ edge: a, t: c.startRaw.t });
        const end = toSnap({ edge: b, t: c.endRaw.t });
        expect(findRoute({ graph, start, end, ...c.req })).toBeNull();
        expect(findRoute({ graph, start: end, end: start, ...c.req })).toBeNull();
      }),
    );
  });
});
