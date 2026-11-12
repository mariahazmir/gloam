// Picks one Sample_Walk per pack. Run (no extra dependency, uses the installed Vite):
//   npx vite build --ssr scripts/pickSampleWalks.ts --outDir .pick-tmp --emptyOutDir
//   node .pick-tmp/pickSampleWalks.js ; then delete .pick-tmp
// Prints the chosen points; they are copied into src/pack/manifest.ts by hand.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { haversine } from '../src/geo/distance';
import { buildGraph } from '../src/graph/build';
import type { StreetGraph } from '../src/graph/build';
import { buildSnapIndex, snap } from '../src/graph/snap';
import type { SnapIndex } from '../src/graph/snap';
import { parseSegmentFile } from '../src/pack/parse';
import { DEFAULT_SETTINGS, medianConfidence } from '../src/routing/costs';
import { findRoute } from '../src/routing/router';
import type { Route } from '../src/routing/router';
import { tierShares } from '../src/routing/tierShares';
import { assignTiers } from '../src/scoring/tiers';
import type { Tier } from '../src/types';
import { ArgumentError } from '../src/validation/errors';
import { requireFinite } from '../src/validation/guards';

const PACKS = ['seattle', 'kl', 'london', 'berlin', 'manchester'] as const;
const LAMBDA = 3;
const MIN_WALK_M = 800;
const MAX_WALK_M = 1500;
const MIN_SHARE_PCT = 5;
const MIN_TIERS = 3;
const CANDIDATES = 4000;
const SEED = 20260;

/** Small seeded generator so the pick is repeatable. */
export function mulberry32(seed: number): () => number {
  requireFinite('seed', seed);
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Metres through mapped_unlit or darker_than_most pieces. */
export function darkMetres(route: Route, tierOf: (edge: number) => Tier): number {
  let m = 0;
  for (const p of route.pieces) {
    const t = tierOf(p.edge);
    if (t === 'mapped_unlit' || t === 'darker_than_most') m += p.view.lengthM;
  }
  return m;
}

export interface Candidate {
  start: [number, number];
  end: [number, number];
  shares: Record<Tier, number>;
  gloamLengthM: number;
  shortestLengthM: number;
  gloamDarkM: number;
  shortestDarkM: number;
  diffM: number;
}

/** Number of Tiers whose share is at least minPct. */
export function tiersAtLeast(shares: Record<Tier, number>, minPct: number): number {
  if (!Number.isFinite(minPct)) throw new ArgumentError('minPct', 'must be finite');
  return Object.values(shares).filter((s) => s >= minPct).length;
}

function evaluate(
  graph: StreetGraph,
  index: SnapIndex,
  tierOf: (edge: number) => Tier,
  median: number,
  start: [number, number],
  end: [number, number],
): Candidate | null {
  const s = snap(index, start[0], start[1]);
  const e = snap(index, end[0], end[1]);
  if (!s || !e) return null;
  const base = { graph, start: s, end: e, settings: DEFAULT_SETTINGS, overrides: new Map(), medianConfidence: median };
  const gloam = findRoute({ ...base, lambda: LAMBDA });
  const shortest = findRoute({ ...base, lambda: 0 });
  if (!gloam || !shortest) return null;
  for (const r of [gloam, shortest]) {
    if (r.physicalLengthM < MIN_WALK_M || r.physicalLengthM > MAX_WALK_M) return null;
  }
  const gd = darkMetres(gloam, tierOf);
  const sd = darkMetres(shortest, tierOf);
  if (!(sd > gd)) return null;
  return {
    start,
    end,
    shares: tierShares(gloam.pieces, tierOf),
    gloamLengthM: gloam.physicalLengthM,
    shortestLengthM: shortest.physicalLengthM,
    gloamDarkM: gd,
    shortestDarkM: sd,
    diffM: sd - gd,
  };
}

/** Best candidate: largest dark-metre difference; first found wins ties. */
export function best(cands: ReadonlyArray<Candidate>, minPct: number): Candidate | null {
  let top: Candidate | null = null;
  for (const c of cands) {
    if (tiersAtLeast(c.shares, minPct) < MIN_TIERS) continue;
    if (top === null || c.diffM > top.diffM) top = c;
  }
  return top;
}

const round5 = (n: number): number => Math.round(n * 1e5) / 1e5;
const fmt = (p: [number, number]): string => `[${p[0]}, ${p[1]}]`;

function pickForPack(id: string): void {
  const dataDir = fileURLToPath(new URL('../../data/', import.meta.url));
  const parsed = parseSegmentFile(JSON.parse(readFileSync(`${dataDir}${id}.segments.geojson`, 'utf8')));
  if ('kind' in parsed) throw new ArgumentError('pack', `${id}: ${parsed.detail}`);
  const { graph } = buildGraph(parsed.segments);
  const tiers = assignTiers(parsed.segments);
  const tierOf = (edge: number): Tier => tiers.get(graph.edges[edge]!.segmentId)!;
  const median = medianConfidence(graph);
  const index = buildSnapIndex(graph);
  const rand = mulberry32(SEED);
  const pts: Array<[number, number]> = graph.edges
    .filter((e) => e.lengthM >= 20)
    .map((e) => {
      const c = e.coordinates[Math.floor(e.coordinates.length / 2)]!;
      return [round5(c[0]), round5(c[1])] as [number, number];
    });
  const cands: Candidate[] = [];
  for (let i = 0; i < CANDIDATES; i++) {
    const a = pts[Math.floor(rand() * pts.length)]!;
    // Straight-line 600-1200 m keeps the walked length near the 800-1500 m window.
    let b: [number, number] | null = null;
    for (let k = 0; k < 60 && b === null; k++) {
      const q = pts[Math.floor(rand() * pts.length)]!;
      const d = haversine(a[0], a[1], q[0], q[1]);
      if (d >= 600 && d <= 1200) b = q;
    }
    if (!b) continue;
    const c = evaluate(graph, index, tierOf, median, a, b);
    if (c) cands.push(c);
  }
  let chosen = best(cands, MIN_SHARE_PCT);
  let relaxed = false;
  if (!chosen) {
    relaxed = true;
    chosen = best(cands, 1);
  }
  if (!chosen) {
    console.log(`${id}: NO WALK FOUND (${cands.length} candidates with a darker Shortest_Route)`);
    return;
  }
  console.log(
    `${id}: start ${fmt(chosen.start)} end ${fmt(chosen.end)}${relaxed ? ' [5% RULE RELAXED TO 1%]' : ''}`,
  );
  console.log(`  candidates meeting dark rule: ${cands.length}`);
  console.log(`  Gloam_Route tier shares %: ${JSON.stringify(chosen.shares)}`);
  console.log(
    `  length m: gloam ${chosen.gloamLengthM.toFixed(0)}, shortest ${chosen.shortestLengthM.toFixed(0)}`,
  );
  console.log(
    `  dark m: shortest ${chosen.shortestDarkM.toFixed(0)} vs gloam ${chosen.gloamDarkM.toFixed(0)} (difference ${chosen.diffM.toFixed(0)})`,
  );
}

for (const id of PACKS) pickForPack(id);
