// Tests on the five real packs in the repo-root data/ folder (Requirements 14.8, 14.9, 14.10).
import { describe, expect, it } from 'vitest';
// ?raw reads the repo-root data/ files without needing @types/node (same pattern as wording.test.ts).
import berlinRaw from '../../data/berlin.segments.geojson?raw';
import klRaw from '../../data/kl.segments.geojson?raw';
import londonRaw from '../../data/london.segments.geojson?raw';
import manchesterRaw from '../../data/manchester.segments.geojson?raw';
import sampleRaw from '../../data/sample-data.json?raw';
import seattleRaw from '../../data/seattle.segments.geojson?raw';
import { buildGraph } from '../src/graph/build';
import { buildSnapIndex, snap } from '../src/graph/snap';
import { MANIFEST } from '../src/pack/manifest';
import { parseSegmentFile } from '../src/pack/parse';
import { DEFAULT_SETTINGS, medianConfidence } from '../src/routing/costs';
import { findRoute } from '../src/routing/router';
import { TIER_ORDER } from '../src/routing/tierShares';
import { assignTiers } from '../src/scoring/tiers';
import type { Tier } from '../src/types';

const SEGMENT_TEXT: Record<string, string> = {
  seattle: seattleRaw,
  kl: klRaw,
  london: londonRaw,
  berlin: berlinRaw,
  manchester: manchesterRaw,
};
const LAMBDA = 3;
const MIN_TIER_SHARE = 0.05; // unrounded fraction of Gloam_Route length
const MIN_TIERS = 3;

const sample = JSON.parse(sampleRaw) as {
  corrections: Array<{ city: string; segment_id: string; label: string }>;
};

describe('real packs', () => {
  for (const entry of MANIFEST) {
    it(
      `${entry.id}: Sample_Walk snaps, routes differ, 3+ Tiers at 5% or more (unrounded), Sample_Data ids exist`,
      () => {
        const parsed = parseSegmentFile(JSON.parse(SEGMENT_TEXT[entry.id]!));
        if ('kind' in parsed) throw new Error(`${entry.id}: ${parsed.detail}`);
        const { graph } = buildGraph(parsed.segments);
        const tiers = assignTiers(parsed.segments);
        const tierOf = (edge: number): Tier => tiers.get(graph.edges[edge]!.segmentId)!;
        const index = buildSnapIndex(graph);

        const s = snap(index, entry.sampleWalk.start[0], entry.sampleWalk.start[1]);
        const e = snap(index, entry.sampleWalk.end[0], entry.sampleWalk.end[1]);
        expect(s, `${entry.id} start snaps`).not.toBeNull();
        expect(e, `${entry.id} end snaps`).not.toBeNull();

        const base = {
          graph,
          start: s!,
          end: e!,
          settings: DEFAULT_SETTINGS,
          overrides: new Map(),
          medianConfidence: medianConfidence(graph),
        };
        const gloam = findRoute({ ...base, lambda: LAMBDA });
        const shortest = findRoute({ ...base, lambda: 0 });
        expect(gloam, `${entry.id} Gloam_Route exists`).not.toBeNull();
        expect(shortest, `${entry.id} Shortest_Route exists`).not.toBeNull();

        const edgesOf = (r: NonNullable<typeof gloam>): string => r.pieces.map((p) => p.edge).join(',');
        expect(edgesOf(gloam!), `${entry.id} routes differ`).not.toBe(edgesOf(shortest!));

        // Unrounded shares: metres per Tier over total metres.
        const metres = new Map<Tier, number>(TIER_ORDER.map((t) => [t, 0]));
        let total = 0;
        for (const p of gloam!.pieces) {
          const t = tierOf(p.edge);
          metres.set(t, metres.get(t)! + p.view.lengthM);
          total += p.view.lengthM;
        }
        const shares = Object.fromEntries(TIER_ORDER.map((t) => [t, metres.get(t)! / total]));
        console.log(
          `${entry.id} unrounded tier shares %: ` +
            TIER_ORDER.map((t) => `${t} ${(shares[t]! * 100).toFixed(3)}`).join(', '),
        );
        const crossed = TIER_ORDER.filter((t) => shares[t]! >= MIN_TIER_SHARE).length;
        expect(crossed, `${entry.id} Tiers at 5% or more`).toBeGreaterThanOrEqual(MIN_TIERS);

        const ids = new Set(parsed.segments.map((seg) => seg.id));
        const mine = sample.corrections.filter((c) => c.city === entry.id);
        expect(mine.length).toBeGreaterThan(0);
        for (const c of mine) {
          expect(ids.has(c.segment_id), `${entry.id} segment ${c.segment_id} exists`).toBe(true);
          expect(c.label).toBe('SAMPLE DATA');
        }
      },
      60_000,
    );
  }

  it('every Sample_Data entry belongs to one of the five packs', () => {
    const known = new Set(MANIFEST.map((m) => m.id as string));
    for (const c of sample.corrections) expect(known.has(c.city)).toBe(true);
  });
});
