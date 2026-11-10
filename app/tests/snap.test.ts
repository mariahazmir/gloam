import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { containsPoint } from '../src/geo/bounds';
import { M_PER_DEG, project } from '../src/geo/project';
import { buildGraph } from '../src/graph/build';
import type { StreetGraph } from '../src/graph/build';
import { buildSnapIndex, packBounds, snap, SNAP_DISTANCE_M } from '../src/graph/snap';
import type { Segment } from '../src/types';

const TOL_M = 1e-6;

/** Offsets in whole metres from a base point, turned into lon/lat. */
function toLonLat(baseLon: number, baseLat: number, mx: number, my: number): [number, number] {
  const cos = Math.cos((baseLat * Math.PI) / 180);
  return [baseLon + mx / (M_PER_DEG * cos), baseLat + my / M_PER_DEG];
}

const offsetArb = fc.integer({ min: -600, max: 600 });

const scenarioArb = fc
  .record({
    baseLon: fc.double({ min: -170, max: 170, noNaN: true }),
    baseLat: fc.double({ min: -60, max: 60, noNaN: true }),
    lines: fc.array(fc.array(fc.tuple(offsetArb, offsetArb), { minLength: 2, maxLength: 5 }), {
      minLength: 1,
      maxLength: 6,
    }),
  })
  .chain((s) =>
    fc.record({
      baseLon: fc.constant(s.baseLon),
      baseLat: fc.constant(s.baseLat),
      lines: fc.constant(s.lines),
      // Query offsets: mostly near the pack, some far away.
      queries: fc.array(fc.tuple(fc.integer({ min: -1500, max: 1500 }), fc.integer({ min: -1500, max: 1500 })), {
        minLength: 1,
        maxLength: 8,
      }),
      order: fc.shuffledSubarray(
        s.lines.map((_, i) => i),
        { minLength: s.lines.length, maxLength: s.lines.length },
      ),
    }),
  );

function makeSegments(baseLon: number, baseLat: number, lines: Array<Array<[number, number]>>): Segment[] {
  return lines.map((pts, i) => ({
    id: `s${i}`,
    name: null,
    highway: 'residential',
    litProbability: 0.5,
    confidence: 0.5,
    labelSource: 'estimated' as const,
    coordinates: pts.map(([mx, my]) => toLonLat(baseLon, baseLat, mx, my)),
  }));
}

/** Nearest distance over every edge polyline, in the frame centred on the query. */
function bruteForceNearest(graph: StreetGraph, lon: number, lat: number): number {
  let best = Infinity;
  for (const e of graph.edges) {
    const pts = e.coordinates.map(([plon, plat]) => project(lon, lat, plon, plat));
    for (let k = 1; k < pts.length; k++) {
      const a = pts[k - 1]!;
      const b = pts[k]!;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len2 = dx * dx + dy * dy;
      const u = len2 === 0 ? 0 : Math.min(1, Math.max(0, (-a.x * dx - a.y * dy) / len2));
      best = Math.min(best, Math.hypot(a.x + u * dx, a.y + u * dy));
    }
  }
  return best;
}

describe('snap', () => {
  // Feature: gloam-web-app, Property 15: Snapping finds the nearest point within 150 m or reports none
  // **Validates: Requirements 1.9, 6.5, 6.6**
  it('Property 15: finds the nearest point within 150 m or reports none', () => {
    fc.assert(
      fc.property(scenarioArb, ({ baseLon, baseLat, lines, queries, order }) => {
        const segments = makeSegments(baseLon, baseLat, lines as Array<Array<[number, number]>>);
        const { graph } = buildGraph(segments);
        fc.pre(graph.edges.length > 0);
        const index = buildSnapIndex(graph);
        const shuffled = buildSnapIndex(buildGraph(order.map((i) => segments[i]!)).graph);
        const bounds = packBounds(segments);

        for (const [qx, qy] of queries) {
          const [qlon, qlat] = toLonLat(baseLon, baseLat, qx, qy);
          const result = snap(index, qlon, qlat);
          const brute = bruteForceNearest(graph, qlon, qlat);

          // Skip only the knife edge where rounding could land either side of 150 m.
          if (Math.abs(brute - SNAP_DISTANCE_M) > TOL_M) {
            if (brute <= SNAP_DISTANCE_M) {
              expect(result).not.toBeNull();
              expect(Math.abs(result!.distanceM - brute)).toBeLessThanOrEqual(TOL_M);
              expect(result!.t).toBeGreaterThanOrEqual(0);
              expect(result!.t).toBeLessThanOrEqual(1);
              const p = project(qlon, qlat, result!.lon, result!.lat);
              expect(Math.abs(Math.hypot(p.x, p.y) - result!.distanceM)).toBeLessThanOrEqual(1e-4);
            } else {
              expect(result).toBeNull();
            }
          }

          // Outside the grown pack bounds there is nothing to snap to.
          if (!containsPoint(bounds, qlon, qlat)) expect(result).toBeNull();

          // Input order of segments does not change the answer.
          expect(snap(shuffled, qlon, qlat)).toEqual(result);
        }
      }),
      { numRuns: 100 },
    );
  });

  // Feature: gloam-web-app, Property 15: Snapping finds the nearest point within 150 m or reports none
  it('Property 15: points beyond the grown pack bounds return null', () => {
    fc.assert(
      fc.property(
        fc.double({ min: -170, max: 170, noNaN: true }),
        fc.double({ min: -60, max: 60, noNaN: true }),
        fc.array(fc.tuple(offsetArb, offsetArb), { minLength: 2, maxLength: 5 }),
        fc.double({ min: 1e-4, max: 0.01, noNaN: true }),
        fc.constantFrom('e', 'w', 'n', 's'),
        (baseLon, baseLat, pts, extra, side) => {
          const segments = makeSegments(baseLon, baseLat, [pts as Array<[number, number]>]);
          const { graph } = buildGraph(segments);
          fc.pre(graph.edges.length > 0);
          const b = packBounds(segments);
          const midLon = (b.sw[0] + b.ne[0]) / 2;
          const midLat = (b.sw[1] + b.ne[1]) / 2;
          const [lon, lat] =
            side === 'e' ? [b.ne[0] + extra, midLat] : side === 'w' ? [b.sw[0] - extra, midLat] : side === 'n' ? [midLon, b.ne[1] + extra] : [midLon, b.sw[1] - extra];
          expect(snap(buildSnapIndex(graph), lon, lat)).toBeNull();
        },
      ),
      { numRuns: 100 },
    );
  });

  // Hand-computed: equator, so cos(lat) = 1 and 1 deg lon = M_PER_DEG m.
  // Segment (0,0)-(0.01,0). Query (0.005, 100/M_PER_DEG) is 100 m due north of the midpoint,
  // so distance 100 and t = 0.5. Query 200 m north is beyond 150 m, so null.
  it('example: 100 m from the midpoint snaps at t = 0.5; 200 m gives null', () => {
    const seg: Segment = {
      id: 'a',
      name: null,
      highway: 'residential',
      litProbability: 0.5,
      confidence: 0.5,
      labelSource: 'estimated',
      coordinates: [
        [0, 0],
        [0.01, 0],
      ],
    };
    const index = buildSnapIndex(buildGraph([seg]).graph);
    const near = snap(index, 0.005, 100 / M_PER_DEG);
    expect(near).not.toBeNull();
    expect(near!.distanceM).toBeCloseTo(100, 6);
    expect(near!.t).toBeCloseTo(0.5, 9);
    expect(near!.edge).toBe(0);
    expect(snap(index, 0.005, 200 / M_PER_DEG)).toBeNull();
  });
});
