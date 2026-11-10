import { haversine } from '../geo/distance';
import type { LabelSource, Segment } from '../types';
import { ArgumentError } from '../validation/errors';
import { requireLatLon, requireUnit } from '../validation/guards';

export interface EdgeKey {
  segmentId: string;
  part: number;
}

export interface Edge {
  key: EdgeKey;
  segmentId: string;
  /** Ordinal of this piece within its segment, from 0. */
  part: number;
  /** Node indexes; a is the piece start along the segment. */
  a: number;
  b: number;
  lengthM: number;
  litProbability: number;
  confidence: number;
  labelSource: LabelSource;
  highway: string;
  coordinates: ReadonlyArray<readonly [number, number]>;
}

export interface Dart {
  edge: number;
  to: number;
  reverse: boolean;
}

export interface StreetGraph {
  nodes: ReadonlyArray<{ lon: number; lat: number }>;
  edges: ReadonlyArray<Edge>;
  adjacency: ReadonlyArray<ReadonlyArray<Dart>>;
}

export interface RejectedSegment {
  segmentId: string;
  field: string;
  message: string;
}

/** Compare strings by UTF-16 code unit (not locale). */
function cmpStr(x: string, y: string): number {
  return x < y ? -1 : x > y ? 1 : 0;
}

/** Canonical_Order: segment id by code unit, then part. */
export function compareEdgeKeys(x: EdgeKey, y: EdgeKey): number {
  return cmpStr(x.segmentId, y.segmentId) || x.part - y.part;
}

const coordKey = (lon: number, lat: number): string => `${lon},${lat}`;

type Pt = readonly [number, number];

/** Returns the cleaned coordinates, or a rejection (field + message). */
function checkSegment(s: Segment): { coords: Pt[] } | { field: string; message: string } {
  if (typeof s.id !== 'string' || s.id === '') return { field: 'id', message: 'id: must be a non-empty string' };
  try {
    requireUnit('litProbability', s.litProbability);
  } catch (e) {
    return { field: 'litProbability', message: (e as ArgumentError).message };
  }
  try {
    requireUnit('confidence', s.confidence);
  } catch (e) {
    return { field: 'confidence', message: (e as ArgumentError).message };
  }
  if (!Array.isArray(s.coordinates)) return { field: 'coordinates', message: 'coordinates: must be an array' };
  const coords: Pt[] = [];
  for (const c of s.coordinates) {
    try {
      if (!Array.isArray(c) || c.length < 2) throw new ArgumentError('coordinates', 'point must be [lon, lat]');
      requireLatLon('coordinates', c[0], c[1]);
    } catch (e) {
      return { field: 'coordinates', message: (e as ArgumentError).message };
    }
    const prev = coords[coords.length - 1];
    if (prev === undefined || prev[0] !== c[0] || prev[1] !== c[1]) coords.push([c[0], c[1]]);
  }
  if (coords.length < 2) {
    return { field: 'coordinates', message: 'coordinates: need at least 2 distinct consecutive points' };
  }
  return { coords };
}

export function buildGraph(segments: ReadonlyArray<Segment>): { graph: StreetGraph; rejected: RejectedSegment[] } {
  const rejected: RejectedSegment[] = [];

  // Duplicate ids: reject every copy so the result does not depend on input order.
  const idCounts = new Map<string, number>();
  for (const s of segments) {
    if (typeof s.id === 'string') idCounts.set(s.id, (idCounts.get(s.id) ?? 0) + 1);
  }

  const valid: Array<{ seg: Segment; coords: Pt[] }> = [];
  for (const s of segments) {
    if (typeof s.id === 'string' && (idCounts.get(s.id) ?? 0) > 1) {
      rejected.push({ segmentId: s.id, field: 'id', message: `id: duplicate id "${s.id}"` });
      continue;
    }
    const r = checkSegment(s);
    if ('coords' in r) valid.push({ seg: s, coords: r.coords });
    else rejected.push({ segmentId: String(s.id), field: r.field, message: r.message });
  }
  rejected.sort((x, y) => cmpStr(x.segmentId, y.segmentId) || cmpStr(x.field, y.field) || cmpStr(x.message, y.message));

  // Count slots per coordinate key across all valid segments.
  const slots = new Map<string, number>();
  for (const { coords } of valid) {
    for (const [lon, lat] of coords) {
      const k = coordKey(lon, lat);
      slots.set(k, (slots.get(k) ?? 0) + 1);
    }
  }

  // Node set: segment endpoints and shared coordinates.
  const nodePts = new Map<string, { lon: number; lat: number }>();
  const isNode = (k: string, i: number, n: number): boolean => i === 0 || i === n - 1 || (slots.get(k) ?? 0) > 1;
  for (const { coords } of valid) {
    coords.forEach(([lon, lat], i) => {
      const k = coordKey(lon, lat);
      if (isNode(k, i, coords.length)) nodePts.set(k, { lon, lat });
    });
  }
  const nodeKeys = [...nodePts.keys()].sort(cmpStr);
  const nodeIndex = new Map<string, number>(nodeKeys.map((k, i) => [k, i]));
  const nodes = nodeKeys.map((k) => nodePts.get(k)!);

  // Cut each segment into edges at node coordinates.
  const edges: Edge[] = [];
  for (const { seg, coords } of valid) {
    let piece: Pt[] = [coords[0]!];
    let length = 0;
    let part = 0;
    for (let i = 1; i < coords.length; i++) {
      const p = coords[i]!;
      const q = coords[i - 1]!;
      length += haversine(q[0], q[1], p[0], p[1]);
      piece.push(p);
      if (isNode(coordKey(p[0], p[1]), i, coords.length)) {
        const first = piece[0]!;
        edges.push({
          key: { segmentId: seg.id, part },
          segmentId: seg.id,
          part,
          a: nodeIndex.get(coordKey(first[0], first[1]))!,
          b: nodeIndex.get(coordKey(p[0], p[1]))!,
          lengthM: length,
          litProbability: seg.litProbability,
          confidence: seg.confidence,
          labelSource: seg.labelSource,
          highway: seg.highway,
          coordinates: piece,
        });
        part++;
        piece = [p];
        length = 0;
      }
    }
  }
  edges.sort((x, y) => compareEdgeKeys(x.key, y.key));

  // Adjacency: edges are already in key order, so pushing in order keeps darts sorted
  // by (segmentId, part, reverse) per node.
  const adjacency: Dart[][] = nodes.map(() => []);
  edges.forEach((e, i) => {
    adjacency[e.a]!.push({ edge: i, to: e.b, reverse: false });
    adjacency[e.b]!.push({ edge: i, to: e.a, reverse: true });
  });

  return { graph: { nodes, edges, adjacency }, rejected };
}
