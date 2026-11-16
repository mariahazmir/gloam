// Street name statistics per city. Offline: no network, writes no files except a
// temporary build folder that you delete afterwards. Run from app/:
//   npx vite build --ssr scripts/streetNameStats.ts --outDir .stats-tmp --emptyOutDir; node .stats-tmp/streetNameStats.js; Remove-Item -Recurse -Force .stats-tmp
// One line per pack:
//   <city>: segments=<n> named=<p>% names=<n> multi-stretch=<n> (<p>%) most-stretches=<n> "<name>"
// named = share of Segments whose normalised name is not empty. names = distinct normalised
// names among the stretches. multi-stretch = names with more than one stretch, and its share
// of distinct names. most-stretches = largest number of stretches sharing one normalised
// name (ties: smallest name by code unit). Names, multi-stretch and most-stretches all come
// from the same groupStretches result.
import { groupStretches, normalise } from '../src/search/streetSearch';
import { loadPack, PACKS } from './pickSampleWalks';

/** Plain code-unit order, not locale order. */
const byCodeUnit = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

function line(id: string): string {
  const { graph, segments } = loadPack(id);
  const named = segments.filter((s) => s.name !== null && normalise(s.name) !== '').length;
  const namedPct = segments.length === 0 ? 'n/a' : `${((named / segments.length) * 100).toFixed(1)}`;

  const counts = new Map<string, number>();
  for (const st of groupStretches(segments, graph)) counts.set(st.norm, (counts.get(st.norm) ?? 0) + 1);

  const names = counts.size;
  let multi = 0;
  let topName: string | null = null;
  let topCount = 0;
  for (const [name, n] of counts) {
    if (n > 1) multi++;
    if (n > topCount || (n === topCount && topName !== null && byCodeUnit(name, topName) < 0)) {
      topCount = n;
      topName = name;
    }
  }
  const multiPct = names === 0 ? 'n/a' : `${((multi / names) * 100).toFixed(1)}%`;
  const most = topName === null ? 'most-stretches=n/a' : `most-stretches=${topCount} "${topName}"`;
  return `${id}: segments=${segments.length} named=${namedPct}% names=${names} multi-stretch=${multi} (${multiPct}) ${most}`;
}

for (const id of PACKS) console.log(line(id));
