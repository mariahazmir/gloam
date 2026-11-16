// Street search on the five real packs in the repo-root data/ folder (Requirements 19.2, 19.3, 19.4, 19.6).
import { describe, expect, it } from 'vitest';
import berlinRaw from '../../data/berlin.segments.geojson?raw';
import klRaw from '../../data/kl.segments.geojson?raw';
import londonRaw from '../../data/london.segments.geojson?raw';
import manchesterRaw from '../../data/manchester.segments.geojson?raw';
import seattleRaw from '../../data/seattle.segments.geojson?raw';
import { haversine } from '../src/geo/distance';
import { buildGraph } from '../src/graph/build';
import { buildSnapIndex, snap, SNAP_DISTANCE_M } from '../src/graph/snap';
import { MANIFEST } from '../src/pack/manifest';
import { parseSegmentFile } from '../src/pack/parse';
import {
  buildStreetIndex,
  MAX_RESULTS,
  normalise,
  searchStreets,
  type StretchEntry,
} from '../src/search/streetSearch';

const SEGMENT_TEXT: Record<string, string> = {
  seattle: seattleRaw,
  kl: klRaw,
  london: londonRaw,
  berlin: berlinRaw,
  manchester: manchesterRaw,
};
const FAR = { lon: 0, lat: 0 };
const FAR_SAMPLE_EVERY = 20;

const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** Reference order, written separately from the implementation: tier, name length, name, distance, key. */
function referenceSearch(entries: ReadonlyArray<StretchEntry>, query: string, c: { lon: number; lat: number }) {
  const nq = normalise(query);
  const qt = nq.split(' ');
  const rows = entries
    .filter((e) => qt.every((q) => e.tokens.some((t) => t.startsWith(q))))
    .map((e) => ({
      e,
      tier: e.norm === nq ? 0 : e.norm.startsWith(nq) ? 1 : 2,
      d: haversine(c.lon, c.lat, e.lon, e.lat),
    }));
  rows.sort(
    (x, y) =>
      x.tier - y.tier ||
      x.e.norm.length - y.e.norm.length ||
      cmp(x.e.norm, y.e.norm) ||
      x.d - y.d ||
      cmp(x.e.key, y.e.key),
  );
  return rows.slice(0, MAX_RESULTS).map((r) => r.e.key);
}

describe('real packs: street search', () => {
  for (const entry of MANIFEST) {
    it(
      `${entry.id}: every named Segment is found from its own stretch, far-centre order matches, known name snaps`,
      () => {
        const parsed = parseSegmentFile(JSON.parse(SEGMENT_TEXT[entry.id]!));
        if ('kind' in parsed) throw new Error(`${entry.id}: ${parsed.detail}`);
        const { graph } = buildGraph(parsed.segments);
        const index = buildStreetIndex(parsed.segments, graph);
        const snapIndex = buildSnapIndex(graph);
        expect(index.entries.length, `${entry.id} has stretches`).toBeGreaterThan(0);

        const stretchOf = new Map<string, StretchEntry>();
        for (const s of index.entries) for (const id of s.segmentIds) stretchOf.set(id, s);

        // One check per distinct (raw name, stretch): the centre and query are the same for its Segments.
        const checked = new Set<string>();
        const queries = new Set<string>();
        let found = 0;
        for (const seg of parsed.segments) {
          const stretch = stretchOf.get(seg.id);
          if (stretch === undefined) continue; // unnamed, or no Edges
          const name = seg.name;
          if (name === null || normalise(name) === '') continue;
          if ([...name.trim()].length < 2) {
            expect(searchStreets(index, name, FAR), `${entry.id} short query`).toEqual([]);
            continue;
          }
          const k = `${name}\u0000${stretch.key}`;
          if (checked.has(k)) continue;
          checked.add(k);
          queries.add(name);

          const results = searchStreets(index, name, { lon: stretch.lon, lat: stretch.lat });
          const hit = results.find((r) => r.stretchKey === stretch.key);
          if (hit === undefined || normalise(hit.name) !== normalise(name)) {
            throw new Error(`${entry.id}: ${JSON.stringify(name)} (segment ${seg.id}) not found at its own stretch`);
          }
          expect(stretch.segmentIds).toContain(seg.id);
          expect(hit.distanceM).toBeLessThan(1e-6);
          found++;
        }
        expect(found, `${entry.id} checked Segments`).toBeGreaterThan(0);

        // Far centre: every name matches the query and the order equals the reference sort.
        const list = [...queries].sort(cmp);
        for (let i = 0; i < list.length; i += FAR_SAMPLE_EVERY) {
          const q = list[i]!;
          const qt = normalise(q).split(' ');
          const out = searchStreets(index, q, FAR);
          expect(out.length).toBeGreaterThan(0);
          for (const r of out) {
            const toks = normalise(r.name).split(' ');
            expect(qt.every((t) => toks.some((x) => x.startsWith(t))), `${entry.id} ${q} -> ${r.name}`).toBe(true);
          }
          expect(out.map((r) => r.stretchKey), `${entry.id} order for ${q}`).toEqual(
            referenceSearch(index.entries, q, FAR),
          );
        }

        // One known name from the data: first query in code-unit order.
        const known = list[0]!;
        const res = searchStreets(index, known, FAR);
        expect(res.length, `${entry.id} known name ${known}`).toBeGreaterThanOrEqual(1);
        const p = snap(snapIndex, res[0]!.lon, res[0]!.lat, SNAP_DISTANCE_M);
        expect(p, `${entry.id} midpoint of ${res[0]!.name} snaps`).not.toBeNull();
        expect(p!.distanceM).toBeLessThanOrEqual(150);
      },
      120_000,
    );
  }
});
