import { haversine } from '../geo/distance';
import { compareEdgeKeys, type Edge, type StreetGraph } from '../graph/build';
import type { Segment } from '../types';
import { ArgumentError } from '../validation/errors';
import { requireLatLon } from '../validation/guards';

/** Map centre, passed in by the caller. */
export interface Centre {
  lon: number;
  lat: number;
}

/** A named street stretch: Segments with one normalised name that touch through graph nodes. */
export interface Stretch {
  /** Smallest segment id in the stretch, by code unit. */
  key: string;
  /** Raw name of that Segment. */
  name: string;
  /** Normalised name. */
  norm: string;
  /** Segment ids, ascending by code unit. */
  segmentIds: ReadonlyArray<string>;
}

export interface StretchEntry extends Stretch {
  /** `norm` split on single spaces. */
  tokens: ReadonlyArray<string>;
  /** Midpoint by length along the stretch. */
  lon: number;
  lat: number;
}

/** Built once per loaded City_Pack; holds strings and numbers only. */
export interface StreetIndex {
  readonly entries: ReadonlyArray<StretchEntry>;
}

export interface SearchResult {
  name: string;
  stretchKey: string;
  lon: number;
  lat: number;
  /** Haversine distance from the centre in metres, unrounded. */
  distanceM: number;
}

export const MAX_RESULTS = 8;
const MIN_QUERY_CODE_POINTS = 2;

const FOLDS: Readonly<Record<string, string>> = {
  ß: 'ss',
  ø: 'o',
  đ: 'd',
  ł: 'l',
  æ: 'ae',
  œ: 'oe',
};

/**
 * Lowercase, strip diacritics, fold ß ø đ ł æ œ, split on anything that is not a letter or digit,
 * join tokens with one space. Pure; independent of the device language.
 */
export function normalise(text: string): string {
  const folded = text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[ßøđłæœ]/g, (ch) => FOLDS[ch] ?? ch);
  return folded.split(/[^\p{L}\p{N}]+/u).filter((t) => t.length > 0).join(' ');
}

const byCodeUnit = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

interface Match {
  entry: StretchEntry;
  tier: 0 | 1 | 2;
  distanceM: number;
}

function compareMatches(a: Match, b: Match): number {
  if (a.tier !== b.tier) return a.tier - b.tier;
  if (a.entry.norm.length !== b.entry.norm.length) return a.entry.norm.length - b.entry.norm.length;
  const byName = byCodeUnit(a.entry.norm, b.entry.norm);
  if (byName !== 0) return byName;
  if (a.distanceM !== b.distanceM) return a.distanceM < b.distanceM ? -1 : 1;
  return byCodeUnit(a.entry.key, b.entry.key);
}

/**
 * At most 8 matching stretches, the first 8 of the total order: tier (exact, prefix, other word start),
 * normalised-name length, normalised name, unrounded distance from `centre` (nearest first), stretch key.
 * Pure: no I/O, no stored state.
 */
export function searchStreets(index: StreetIndex, query: string, centre: Centre): SearchResult[] {
  if (typeof query !== 'string') throw new ArgumentError('query', 'must be a string');
  if (centre === null || typeof centre !== 'object') throw new ArgumentError('centre', 'must be an object');
  requireLatLon('centre', centre.lon, centre.lat);

  if ([...query.trim()].length < MIN_QUERY_CODE_POINTS) return [];
  const normQuery = normalise(query);
  if (normQuery === '') return [];
  const queryTokens = normQuery.split(' ');

  const matches: Match[] = [];
  for (const entry of index.entries) {
    const ok = queryTokens.every((q) => entry.tokens.some((t) => t.startsWith(q)));
    if (!ok) continue;
    const tier = entry.norm === normQuery ? 0 : entry.norm.startsWith(normQuery) ? 1 : 2;
    matches.push({ entry, tier, distanceM: haversine(centre.lon, centre.lat, entry.lon, entry.lat) });
  }
  matches.sort(compareMatches);
  return matches.slice(0, MAX_RESULTS).map(({ entry, distanceM }) => ({
    name: entry.name,
    stretchKey: entry.key,
    lon: entry.lon,
    lat: entry.lat,
    distanceM,
  }));
}

export type CompassKey = 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'nw';
const COMPASS: ReadonlyArray<CompassKey> = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'];

/** Compass key of the initial great-circle bearing from `from` to `to`. Display only. */
export function compassOf(from: Centre, to: Centre): CompassKey {
  requireLatLon('from', from.lon, from.lat);
  requireLatLon('to', to.lon, to.lat);
  const rad = Math.PI / 180;
  const p1 = from.lat * rad;
  const p2 = to.lat * rad;
  const dl = (to.lon - from.lon) * rad;
  const y = Math.sin(dl) * Math.cos(p2);
  const x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl);
  return compassOfBearing(Math.atan2(y, x) / rad);
}

/** Same sector rule applied to a bearing in degrees (0 to under 360). */
export function compassOfBearing(bearing: number): CompassKey {
  if (!Number.isFinite(bearing)) throw new ArgumentError('bearing', 'must be a finite number');
  const b = ((bearing % 360) + 360) % 360;
  return COMPASS[Math.floor(((b + 22.5) % 360) / 45)]!;
}

/**
 * Distance for display: rounded to 50 m; under 1000 m in metres, otherwise km to one decimal.
 * Returns null when it rounds to 0 ("at the map centre"). Never used for ordering.
 */
export function roundDistance(distanceM: number): string | null {
  if (!Number.isFinite(distanceM) || distanceM < 0) {
    throw new ArgumentError('distanceM', 'must be a finite number of 0 or more');
  }
  const r = Math.round(distanceM / 50) * 50;
  if (r === 0) return null;
  if (r < 1000) return `${r} m`;
  return `${(Math.round(distanceM / 100) / 10).toFixed(1)} km`;
}

function checkInputs(segments: ReadonlyArray<Segment>, graph: StreetGraph): void {
  if (!Array.isArray(segments)) throw new ArgumentError('segments', 'must be an array');
  for (const s of segments) {
    if (s === null || typeof s !== 'object') throw new ArgumentError('segments', 'every item must be an object');
  }
  if (graph === null || typeof graph !== 'object' || !Array.isArray(graph.edges)) {
    throw new ArgumentError('graph', 'must be a street graph with an edges array');
  }
}

interface Grouped {
  stretches: Stretch[];
  edgesByKey: Map<string, Edge[]>;
}

function group(segments: ReadonlyArray<Segment>, graph: StreetGraph): Grouped {
  checkInputs(segments, graph);

  // Ids seen more than once are rejected by buildGraph (no Edges), so they are never indexed.
  const counts = new Map<string, number>();
  for (const s of segments) counts.set(s.id, (counts.get(s.id) ?? 0) + 1);
  const normOf = new Map<string, { norm: string; name: string }>();
  for (const s of segments) {
    if (typeof s.id !== 'string' || typeof s.name !== 'string' || counts.get(s.id) !== 1) continue;
    const norm = normalise(s.name);
    if (norm !== '') normOf.set(s.id, { norm, name: s.name });
  }

  // Union-find over segment ids that have at least one Edge and a normalised name.
  const parent = new Map<string, string>();
  const find = (x: string): string => {
    let r = x;
    while (parent.get(r) !== r) r = parent.get(r)!;
    let c = x;
    while (c !== r) {
      const n = parent.get(c)!;
      parent.set(c, r);
      c = n;
    }
    return r;
  };
  const union = (x: string, y: string): void => {
    const rx = find(x);
    const ry = find(y);
    if (rx !== ry) parent.set(rx, ry);
  };

  const atNode = new Map<string, string>();
  const edgesOf = new Map<string, Edge[]>();
  for (const e of graph.edges) {
    const info = normOf.get(e.segmentId);
    if (info === undefined) continue;
    if (!parent.has(e.segmentId)) parent.set(e.segmentId, e.segmentId);
    let list = edgesOf.get(e.segmentId);
    if (list === undefined) edgesOf.set(e.segmentId, (list = []));
    list.push(e);
    for (const node of [e.a, e.b]) {
      const k = `${node}|${info.norm}`;
      const first = atNode.get(k);
      if (first === undefined) atNode.set(k, e.segmentId);
      else union(first, e.segmentId);
    }
  }

  const members = new Map<string, string[]>();
  for (const id of parent.keys()) {
    const r = find(id);
    let m = members.get(r);
    if (m === undefined) members.set(r, (m = []));
    m.push(id);
  }
  const stretches: Stretch[] = [];
  const edgesByKey = new Map<string, Edge[]>();
  for (const ids of members.values()) {
    ids.sort(byCodeUnit);
    const key = ids[0]!;
    const info = normOf.get(key)!;
    stretches.push({ key, name: info.name, norm: info.norm, segmentIds: ids });
    edgesByKey.set(key, ids.flatMap((id) => edgesOf.get(id)!));
  }
  stretches.sort((a, b) => byCodeUnit(a.key, b.key));
  return { stretches, edgesByKey };
}

/**
 * Stretches: Segments that share a graph node and an equal non-empty normalised name (no gap tolerance).
 * Unnamed Segments and Segments with no Edges are not indexed. Sorted by key; independent of input order.
 */
export function groupStretches(segments: ReadonlyArray<Segment>, graph: StreetGraph): Stretch[] {
  return group(segments, graph).stretches;
}

/** Point `target` metres along the polyline (clamped to its end). */
function pointAlong(coords: Edge['coordinates'], target: number): { lon: number; lat: number } {
  let remaining = target;
  for (let i = 1; i < coords.length; i++) {
    const p = coords[i - 1]!;
    const q = coords[i]!;
    const d = haversine(p[0], p[1], q[0], q[1]);
    if (remaining <= d && d > 0) {
      const f = remaining / d;
      return { lon: p[0] + (q[0] - p[0]) * f, lat: p[1] + (q[1] - p[1]) * f };
    }
    remaining -= d;
  }
  const last = coords[coords.length - 1]!;
  return { lon: last[0], lat: last[1] };
}

/** Midpoint by length over the Edges in compareEdgeKeys order, as in the design. */
function midpointOf(edges: ReadonlyArray<Edge>): { lon: number; lat: number } {
  const sorted = [...edges].sort((x, y) => compareEdgeKeys(x.key, y.key));
  let total = 0;
  for (const e of sorted) total += e.lengthM;
  const half = total / 2;
  let cum = 0;
  for (const e of sorted) {
    if (cum + e.lengthM >= half) return pointAlong(e.coordinates, half - cum);
    cum += e.lengthM;
  }
  const e = sorted[sorted.length - 1]!;
  return pointAlong(e.coordinates, e.lengthM);
}

/** Built once per loaded City_Pack: one entry per stretch, with tokens and midpoint. */
export function buildStreetIndex(segments: ReadonlyArray<Segment>, graph: StreetGraph): StreetIndex {
  const { stretches, edgesByKey } = group(segments, graph);
  const entries = stretches.map((s): StretchEntry => {
    const { lon, lat } = midpointOf(edgesByKey.get(s.key)!);
    return { ...s, tokens: s.norm.split(' '), lon, lat };
  });
  return { entries };
}
