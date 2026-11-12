// Pure helpers for checkHost.ts: no I/O, no hidden state.

export type Compression = 'br' | 'gzip' | 'none' | 'other';

export interface FileProbe {
  url: string;
  status: number; // 0 when the request failed
  contentEncoding: string | null;
}

export interface FileVerdict {
  url: string;
  reachable: boolean;
  compression: Compression;
  ok: boolean; // reachable and gzip or Brotli
}

export function parseUrl(raw: string): URL {
  if (typeof raw !== 'string' || raw.trim() === '') {
    throw new Error('url: expected a non-empty string');
  }
  try {
    return new URL(raw.trim());
  } catch {
    throw new Error(`url: not a valid absolute URL: ${raw}`);
  }
}

export function isHttps(url: URL): boolean {
  return url.protocol === 'https:';
}

export function classifyEncoding(header: string | null): Compression {
  if (header === null) return 'none';
  const tokens = header.toLowerCase().split(',').map((t) => t.trim()).filter((t) => t !== '');
  if (tokens.length === 0 || tokens.every((t) => t === 'identity')) return 'none';
  if (tokens.includes('br')) return 'br';
  if (tokens.includes('gzip') || tokens.includes('x-gzip')) return 'gzip';
  return 'other';
}

export function judgeFile(p: FileProbe): FileVerdict {
  const reachable = p.status >= 200 && p.status < 300;
  const compression = classifyEncoding(p.contentEncoding);
  return {
    url: p.url,
    reachable,
    compression,
    ok: reachable && (compression === 'br' || compression === 'gzip'),
  };
}

/**
 * Finds built pack files: whole quoted string literals that are a path through
 * an `assets/` folder ending in `-<hash>.json`. Source paths (`/data/x.geojson`,
 * `../../../data/x.json`) and map-library strings (".json", "geojsonvt_...") do
 * not match, because they are not quoted /assets/ paths.
 */
export function findPackPaths(text: string): string[] {
  const found = new Set<string>();
  for (const m of text.matchAll(/["'`]((?:\/|[A-Za-z0-9_.-]+\/)*assets\/[A-Za-z0-9_.]+-[A-Za-z0-9_-]+\.json)["'`]/g)) {
    if (m[1] !== undefined) found.add(m[1]);
  }
  return [...found].sort();
}

/** Finds script and modulepreload paths in the page HTML. */
export function findScriptPaths(html: string): string[] {
  const found = new Set<string>();
  for (const m of html.matchAll(/<(?:script|link)\b[^>]*?(?:src|href)="([^"]+\.(?:js|mjs))"/g)) {
    if (m[1] !== undefined) found.add(m[1]);
  }
  return [...found].sort();
}

export interface HostReport {
  https: boolean;
  pageReachable: boolean;
  packs: FileVerdict[];
  ok: boolean;
}

export function buildReport(url: URL, pageStatus: number, packs: FileVerdict[]): HostReport {
  const https = isHttps(url);
  const pageReachable = pageStatus >= 200 && pageStatus < 300;
  return {
    https,
    pageReachable,
    packs,
    ok: https && pageReachable && packs.length > 0 && packs.every((p) => p.ok),
  };
}
