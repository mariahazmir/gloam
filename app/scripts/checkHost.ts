// Checks a deployed Gloam site: HTTPS, page reachable, and each pack file
// reachable and served gzip or Brotli (Requirements 14.2, 17.1, 17.6).
// Run (no extra dependency, uses the installed Vite):
//   npx vite build --ssr scripts/checkHost.ts --outDir .check-tmp --emptyOutDir
//   node .check-tmp/checkHost.js https://your-site.onrender.com/ ; then delete .check-tmp
// Pack files are found by reading the page and its scripts, so hashed names work.
import { buildReport, findPackPaths, findScriptPaths, judgeFile, parseUrl } from './hostCheck';
import type { FileVerdict } from './hostCheck';

declare const process: { argv: string[]; exitCode?: number };

// Ask for compressed responses explicitly; fetch would otherwise hide the header.
const HEADERS = { 'Accept-Encoding': 'br, gzip' };

async function probe(url: string): Promise<{ status: number; contentEncoding: string | null }> {
  try {
    const res = await fetch(url, { method: 'HEAD', headers: HEADERS });
    return { status: res.status, contentEncoding: res.headers.get('content-encoding') };
  } catch {
    return { status: 0, contentEncoding: null };
  }
}

async function text(url: string): Promise<{ status: number; body: string }> {
  try {
    const res = await fetch(url, { headers: HEADERS });
    return { status: res.status, body: res.ok ? await res.text() : '' };
  } catch {
    return { status: 0, body: '' };
  }
}

async function main(): Promise<void> {
  const url = parseUrl(process.argv[2] ?? '');
  const page = await text(url.href);
  const scripts = findScriptPaths(page.body).map((p) => new URL(p, url).href);
  const bodies = [page.body];
  for (const s of scripts) bodies.push((await text(s)).body);
  const packUrls = [...new Set(bodies.flatMap(findPackPaths).map((p) => new URL(p, url).href))].sort();

  const verdicts: FileVerdict[] = [];
  for (const u of packUrls) verdicts.push(judgeFile({ url: u, ...(await probe(u)) }));
  const report = buildReport(url, page.status, verdicts);

  console.log(`${report.https ? 'PASS' : 'FAIL'}  HTTPS`);
  console.log(`${report.pageReachable ? 'PASS' : 'FAIL'}  page reachable (${page.status})`);
  if (verdicts.length === 0) console.log('FAIL  no pack files found');
  for (const v of verdicts) {
    console.log(`${v.ok ? 'PASS' : 'FAIL'}  ${v.url}  reachable=${v.reachable} encoding=${v.compression}`);
  }
  console.log(report.ok ? 'All checks passed.' : 'Some checks failed.');
  if (!report.ok) process.exitCode = 1;
}

void main();
