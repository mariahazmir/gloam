// Route statistics per city and lambda. Offline: no network, writes no files except a
// temporary build folder that you delete afterwards. Run from app/:
//   npx vite build --ssr scripts/routeStats.ts --outDir .stats-tmp --emptyOutDir; node .stats-tmp/routeStats.js; Remove-Item -Recurse -Force .stats-tmp
// Pairs: 40 per city, straight-line 800-1500 m apart, both ends snap to the graph and both
// routes exist. The same pairs are used for every lambda. Personal settings are all off.
// Percent changes are Gloam relative to the shortest route (lambda 0), over all 40 pairs
// (identical routes count as 0). Dark exposure change skips pairs whose shortest route has
// no dark metres (percent undefined); "n" shows how many pairs it covers.
// Dread exposure is Route.darkExposure (sum of length x dread, what the router minimises),
// compared with the lambda 0 route for the same pair, skipping pairs where that is 0.
// Property 10 says it cannot rise, so any rise above TOLERANCE prints a WARNING line.
import { haversine } from '../src/geo/distance';
import { snap } from '../src/graph/snap';
import { DEFAULT_SETTINGS } from '../src/routing/costs';
import { findRoute } from '../src/routing/router';
import type { Route } from '../src/routing/router';
import { darkMetres, loadPack, mulberry32, PACKS, round5, SEED } from './pickSampleWalks';

const PAIRS = 40;
const MIN_M = 800;
const MAX_M = 1500;
const LAMBDAS = [1, 3, 6, 10] as const;
const MAX_TRIES = 200000;
const TOLERANCE = 1e-6; // Comparison_Tolerance, as in Property 10's test

type Pack = ReturnType<typeof loadPack>;
type Pt = [number, number];

/** Middle value (mean of the two middle values for an even count). */
export function median(xs: ReadonlyArray<number>): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

const edgesOf = (r: Route): string => r.pieces.map((p) => p.edge).join(',');

function plan(pack: Pack, s: ReturnType<typeof snap>, e: ReturnType<typeof snap>, lambda: number): Route | null {
  if (!s || !e) return null;
  return findRoute({
    graph: pack.graph,
    start: s,
    end: e,
    settings: DEFAULT_SETTINGS,
    overrides: new Map(),
    medianConfidence: pack.median,
    lambda,
  });
}

function pickPairs(pack: Pack): Array<{ s: NonNullable<ReturnType<typeof snap>>; e: NonNullable<ReturnType<typeof snap>>; shortest: Route }> {
  const rand = mulberry32(SEED);
  const pts: Pt[] = pack.graph.edges
    .filter((ed) => ed.lengthM >= 20)
    .map((ed) => {
      const c = ed.coordinates[Math.floor(ed.coordinates.length / 2)]!;
      return [round5(c[0]), round5(c[1])] as Pt;
    });
  const out: Array<{ s: NonNullable<ReturnType<typeof snap>>; e: NonNullable<ReturnType<typeof snap>>; shortest: Route }> = [];
  for (let i = 0; i < MAX_TRIES && out.length < PAIRS; i++) {
    const a = pts[Math.floor(rand() * pts.length)]!;
    const b = pts[Math.floor(rand() * pts.length)]!;
    const d = haversine(a[0], a[1], b[0], b[1]);
    if (d < MIN_M || d > MAX_M) continue;
    const s = snap(pack.index, a[0], a[1]);
    const e = snap(pack.index, b[0], b[1]);
    const shortest = plan(pack, s, e, 0);
    if (!s || !e || !shortest) continue;
    out.push({ s, e, shortest });
  }
  return out;
}

const range = (xs: number[]): string =>
  xs.length === 0 ? 'n/a' : `${Math.min(...xs).toFixed(1)} to ${Math.max(...xs).toFixed(1)}`;
const med = (xs: number[]): string => (xs.length === 0 ? 'n/a' : median(xs).toFixed(1));

console.log(`seed ${SEED}; ${PAIRS} pairs per city, ${MIN_M}-${MAX_M} m straight line; personal settings off`);
const packs = PACKS.map((id) => ({ id, pack: loadPack(id) }));
const pairsByCity = packs.map(({ id, pack }) => ({ id, pack, pairs: pickPairs(pack) }));

let warnings = 0;
for (const lambda of LAMBDAS) {
  console.log(`\nlambda ${lambda}${lambda === 3 ? ' (default)' : ''}`);
  console.log(
    'city        pairs  differ  dread exposure % (median; range; n)     dark metres % (median; range; n)        extra distance % (median; range)',
  );
  const notes: string[] = [];
  for (const { id, pack, pairs } of pairsByCity) {
    let differ = 0;
    const dread: number[] = [];
    const dark: number[] = [];
    const dist: number[] = [];
    let rises = 0;
    let worst = 0;
    for (const p of pairs) {
      const g = plan(pack, p.s, p.e, lambda);
      if (!g) continue;
      if (edgesOf(g) !== edgesOf(p.shortest)) differ++;
      const se = p.shortest.darkExposure;
      if (g.darkExposure > se + TOLERANCE) {
        rises++;
        worst = Math.max(worst, g.darkExposure - se);
      }
      if (se > 0) dread.push(((g.darkExposure - se) / se) * 100);
      const sd = darkMetres(p.shortest, pack.tierOf);
      if (sd > 0) dark.push(((darkMetres(g, pack.tierOf) - sd) / sd) * 100);
      dist.push(((g.physicalLengthM - p.shortest.physicalLengthM) / p.shortest.physicalLengthM) * 100);
    }
    if (rises > 0) {
      warnings += rises;
      notes.push(`WARNING: ${id} lambda ${lambda}: ${rises} pair(s) have dread exposure above lambda 0 by more than ${TOLERANCE} (largest rise ${worst.toExponential(3)}); Property 10 says this cannot happen`);
    }
    const col = (xs: number[], w: number): string => `${med(xs)}; ${range(xs)}; n=${xs.length}`.padEnd(w);
    console.log(`${id.padEnd(11)} ${String(pairs.length).padStart(5)}  ${String(differ).padStart(6)}  ${col(dread, 40)}${col(dark, 40)}${med(dist)}; ${range(dist)}`);
  }
  for (const n of notes) console.log(n);
}
console.log(warnings === 0 ? '\nNo pair has a Gloam route with more dread exposure than its lambda 0 route.' : `\n${warnings} pair(s) above tolerance in total.`);