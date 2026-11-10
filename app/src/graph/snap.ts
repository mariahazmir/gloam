import { boundsOf, growBounds } from '../geo/bounds';
import type { Bounds, LonLat } from '../geo/bounds';
import { project } from '../geo/project';
import type { Segment } from '../types';
import { ArgumentError } from '../validation/errors';
import { requireFinite, requireLatLon } from '../validation/guards';
import type { StreetGraph } from './build';

/** Snap_Distance in metres (Requirement 6.5). */
export const SNAP_DISTANCE_M = 150;
/** Grid cell size in metres. A 3 x 3 query covers the 150 m Snap_Distance. */
export const SNAP_CELL_M = 200;

export interface SnapPoint {
  /** Index into graph.edges. */
  edge: number;
  /** 0..1 along the Edge polyline by length. */
  t: number;
  lon: number;
  lat: number;
  /** Distance from the query point in metres. */
  distanceM: number;
}

export interface SnapIndex {
  readonly graph: StreetGraph;
  /** Projection origin shared by every cell. */
  readonly lon0: number;
  readonly lat0: number;
  /** Cell key `${cx},${cy}` to ascending edge indexes. */
  readonly cells: ReadonlyMap<string, ReadonlyArray<number>>;
}

const cellKey = (cx: number, cy: number): string => `${cx},${cy}`;

/** Build a uniform 200 m grid of Edge ids. Each Edge is listed in every cell its box touches. Pure. */
export function buildSnapIndex(graph: StreetGraph): SnapIndex {
  let minLon = Infinity;
  let maxLon = -Infinity;
  let minLat = Infinity;
  let maxLat = -Infinity;
  for (const e of graph.edges) {
    for (const [lon, lat] of e.coordinates) {
      if (lon < minLon) minLon = lon;
      if (lon > maxLon) maxLon = lon;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
    }
  }
  if (graph.edges.length === 0) return { graph, lon0: 0, lat0: 0, cells: new Map() };

  const lon0 = (minLon + maxLon) / 2;
  const lat0 = (minLat + maxLat) / 2;
  const cells = new Map<string, number[]>();
  graph.edges.forEach((e, i) => {
    let x0 = Infinity;
    let x1 = -Infinity;
    let y0 = Infinity;
    let y1 = -Infinity;
    for (const [lon, lat] of e.coordinates) {
      const p = project(lon0, lat0, lon, lat);
      if (p.x < x0) x0 = p.x;
      if (p.x > x1) x1 = p.x;
      if (p.y < y0) y0 = p.y;
      if (p.y > y1) y1 = p.y;
    }
    const cx0 = Math.floor(x0 / SNAP_CELL_M);
    const cx1 = Math.floor(x1 / SNAP_CELL_M);
    const cy0 = Math.floor(y0 / SNAP_CELL_M);
    const cy1 = Math.floor(y1 / SNAP_CELL_M);
    for (let cx = cx0; cx <= cx1; cx++) {
      for (let cy = cy0; cy <= cy1; cy++) {
        const k = cellKey(cx, cy);
        const list = cells.get(k);
        if (list) list.push(i);
        else cells.set(k, [i]);
      }
    }
  });
  return { graph, lon0, lat0, cells };
}

/**
 * Nearest point on the graph within `maxM` metres (inclusive, default 150), or null.
 * Ties go to the smaller Edge key (edges are stored in key order), then the smaller t. Pure.
 */
export function snap(
  index: SnapIndex,
  lon: number,
  lat: number,
  maxM: number = SNAP_DISTANCE_M,
): SnapPoint | null {
  requireLatLon('point', lon, lat);
  requireFinite('maxM', maxM);
  if (maxM < 0) throw new ArgumentError('maxM', `must be 0 or more, got ${maxM}`);
  if (index.cells.size === 0) return null;

  // 3 x 3 cells for the default; wider only when a larger limit is asked for.
  const reach = Math.max(1, Math.ceil(maxM / SNAP_CELL_M));
  const q = project(index.lon0, index.lat0, lon, lat);
  const qcx = Math.floor(q.x / SNAP_CELL_M);
  const qcy = Math.floor(q.y / SNAP_CELL_M);
  const found = new Set<number>();
  for (let cx = qcx - reach; cx <= qcx + reach; cx++) {
    for (let cy = qcy - reach; cy <= qcy + reach; cy++) {
      const list = index.cells.get(cellKey(cx, cy));
      if (list) for (const i of list) found.add(i);
    }
  }
  const candidates = [...found].sort((a, b) => a - b);

  let best: SnapPoint | null = null;
  for (const i of candidates) {
    const e = index.graph.edges[i]!;
    // Local frame centred on the query point.
    const pts = e.coordinates.map(([plon, plat]) => project(lon, lat, plon, plat));
    const segLen: number[] = [];
    let total = 0;
    for (let k = 1; k < pts.length; k++) {
      const l = Math.hypot(pts[k]!.x - pts[k - 1]!.x, pts[k]!.y - pts[k - 1]!.y);
      segLen.push(l);
      total += l;
    }
    let before = 0;
    for (let k = 1; k < pts.length; k++) {
      const a = pts[k - 1]!;
      const b = pts[k]!;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len2 = dx * dx + dy * dy;
      // Query point is the origin of this frame.
      const u = len2 === 0 ? 0 : Math.min(1, Math.max(0, (-a.x * dx - a.y * dy) / len2));
      const d = Math.hypot(a.x + u * dx, a.y + u * dy);
      if (d <= maxM) {
        const t = total === 0 ? 0 : Math.min(1, (before + u * segLen[k - 1]!) / total);
        if (best === null || d < best.distanceM || (d === best.distanceM && i === best.edge && t < best.t)) {
          const c0 = e.coordinates[k - 1]!;
          const c1 = e.coordinates[k]!;
          best = {
            edge: i,
            t,
            lon: c0[0] + u * (c1[0] - c0[0]),
            lat: c0[1] + u * (c1[1] - c0[1]),
            distanceM: d,
          };
        }
      }
      before += segLen[k - 1]!;
    }
  }
  return best;
}

/**
 * Bounds of every segment coordinate, grown by the 150 m Snap_Distance. A point
 * outside this box is out of area (Requirement 6.6). Throws on an empty list. Pure.
 */
export function packBounds(segments: ReadonlyArray<Segment>): Bounds {
  const pts: LonLat[] = [];
  for (const s of segments) for (const c of s.coordinates) pts.push([c[0], c[1]]);
  return growBounds(boundsOf(pts), SNAP_DISTANCE_M);
}
