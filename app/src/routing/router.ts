import type { StreetGraph } from '../graph/build';
import type { SnapPoint } from '../graph/snap';
import type { Override } from '../scoring/overrides';
import { ArgumentError } from '../validation/errors';
import { requireFinite, requireLambda, requireUnit } from '../validation/guards';
import { adjustedDread, edgeCost, effectiveAttrs, routingLength } from './costs';
import type { EdgeView, PersonalSettings } from './costs';

/** The router reads only the Edge index and position along it from a snapped point. */
export type RoutePoint = Pick<SnapPoint, 'edge' | 't'>;

export interface RouteRequest {
  graph: StreetGraph;
  start: RoutePoint;
  end: RoutePoint;
  lambda: number;
  settings: PersonalSettings;
  overrides: ReadonlyMap<string, Override>;
  medianConfidence: number;
}

export interface RoutePiece {
  edge: number;
  /** True when the piece is walked from the Edge's b side toward its a side. */
  reverse: boolean;
  /** Ordinal of this sub-piece within a snapped Edge; 0 for Edges that were not split. */
  sub: number;
  /** Position along the Edge polyline (0..1) at the start and end of this piece, in walking direction. */
  fromT: number;
  toT: number;
  /** Effective attributes; lengthM is the length of this piece only. */
  view: EdgeView;
}

export interface Route {
  pieces: ReadonlyArray<RoutePiece>;
  physicalLengthM: number;
  routingDistanceM: number;
  darkExposure: number;
  cost: number;
}

/** Relative tolerance for treating two costs as equal (design: Tie tolerance). */
export const TIE_TOLERANCE = 1e-12;

/** Snap positions closer than this (metres) to an Edge end are treated as that end. */
export const COLLAPSE_M = 0.001;

/** Collapse t to 0 or 1 when it lies within COLLAPSE_M of the matching Edge end. */
export function collapseT(t: number, lengthM: number): number {
  if (t * lengthM <= COLLAPSE_M) return 0;
  if ((1 - t) * lengthM <= COLLAPSE_M) return 1;
  return t;
}

/** One undirected piece of the overlay, stored once and walked in either direction. */
interface OverlayPiece {
  edge: number;
  sub: number;
  from: number;
  to: number;
  fromT: number;
  toT: number;
  view: EdgeView;
}

/** One direction of travel along a piece or a whole Edge. */
interface Step {
  edge: number;
  sub: number;
  reverse: boolean;
  to: number;
  fromT: number;
  toT: number;
  /** Present for split pieces; whole Edges use the graph's own attributes. */
  piece: OverlayPiece | null;
}

// ---------- validation ----------

function checkPoint(name: string, p: RoutePoint, graph: StreetGraph): void {
  if (p === null || typeof p !== 'object') throw new ArgumentError(name, 'must be a snapped point');
  requireFinite(`${name}.edge`, p.edge);
  if (!Number.isInteger(p.edge) || p.edge < 0 || p.edge >= graph.edges.length) {
    throw new ArgumentError(`${name}.edge`, `must be an edge index from 0 to ${graph.edges.length - 1}, got ${p.edge}`);
  }
  requireUnit(`${name}.t`, p.t);
}

function checkRequest(req: RouteRequest): void {
  if (req === null || typeof req !== 'object') throw new ArgumentError('req', 'must be an object');
  requireLambda(req.lambda);
  if (!req.graph || !Array.isArray(req.graph.edges)) throw new ArgumentError('graph', 'must be a street graph');
  checkPoint('start', req.start, req.graph);
  checkPoint('end', req.end, req.graph);
  if (!req.settings || typeof req.settings !== 'object') throw new ArgumentError('settings', 'must be an object');
  if (!(req.overrides instanceof Map)) throw new ArgumentError('overrides', 'must be a Map');
  requireUnit('medianConfidence', req.medianConfidence);
}

// ---------- deterministic binary heap ----------

/** Min-heap ordered by (dist, node). Entries are never equal, so pop order is fully determined. */
class Heap {
  private readonly d: number[] = [];
  private readonly n: number[] = [];

  get size(): number {
    return this.d.length;
  }

  private less(i: number, j: number): boolean {
    return this.d[i]! < this.d[j]! || (this.d[i]! === this.d[j]! && this.n[i]! < this.n[j]!);
  }

  private swap(i: number, j: number): void {
    [this.d[i], this.d[j]] = [this.d[j]!, this.d[i]!];
    [this.n[i], this.n[j]] = [this.n[j]!, this.n[i]!];
  }

  push(dist: number, node: number): void {
    this.d.push(dist);
    this.n.push(node);
    let i = this.d.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (!this.less(i, p)) break;
      this.swap(i, p);
      i = p;
    }
  }

  pop(): { dist: number; node: number } {
    const top = { dist: this.d[0]!, node: this.n[0]! };
    const lastD = this.d.pop()!;
    const lastN = this.n.pop()!;
    if (this.d.length > 0) {
      this.d[0] = lastD;
      this.n[0] = lastN;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < this.d.length && this.less(l, m)) m = l;
        if (r < this.d.length && this.less(r, m)) m = r;
        if (m === i) break;
        this.swap(i, m);
        i = m;
      }
    }
    return top;
  }
}

// ---------- router ----------

/**
 * Cheapest route between two snapped points, or null when they are not connected.
 * Backward Dijkstra from the end gives exact costs; a forward walk then takes, at each node,
 * the smallest dart key (segmentId, part, sub, reverse) among darts that start a cheapest path.
 * Pure: no I/O, no hidden state. Throws ArgumentError naming the bad argument.
 */
export function findRoute(req: RouteRequest): Route | null {
  checkRequest(req);
  const { graph, lambda, settings, overrides, medianConfidence } = req;
  // Snap positions within COLLAPSE_M of an Edge end become that end node.
  const collapse = (p: RoutePoint): RoutePoint => ({ ...p, t: collapseT(p.t, graph.edges[p.edge]!.lengthM) });
  const start = collapse(req.start);
  const end = collapse(req.end);
  const nBase = graph.nodes.length;

  // --- overlay: split the snapped Edges at the snapped positions ---
  let nextVirtual = nBase;
  const virtualAt = new Map<string, number>(); // `${edge},${t}` -> virtual node
  const nodeFor = (p: RoutePoint): number => {
    const e = graph.edges[p.edge]!;
    if (p.t === 0) return e.a;
    if (p.t === 1) return e.b;
    const k = `${p.edge},${p.t}`;
    let v = virtualAt.get(k);
    if (v === undefined) {
      v = nextVirtual++;
      virtualAt.set(k, v);
    }
    return v;
  };
  const startNode = nodeFor(start);
  const endNode = nodeFor(end);

  const cuts = new Map<number, Array<{ t: number; node: number }>>(); // edge -> interior cuts
  for (const p of [start, end]) {
    if (p.t === 0 || p.t === 1) continue;
    const list = cuts.get(p.edge) ?? [];
    if (!list.some((c) => c.t === p.t)) list.push({ t: p.t, node: nodeFor(p) });
    cuts.set(p.edge, list);
  }

  // Steps leaving each node that belong to split pieces. Whole Edges come from graph.adjacency.
  const extra = new Map<number, Step[]>();
  const addStep = (node: number, s: Step): void => {
    const l = extra.get(node);
    if (l) l.push(s);
    else extra.set(node, [s]);
  };
  for (const [edgeIdx, list] of cuts) {
    const e = graph.edges[edgeIdx]!;
    const view = effectiveAttrs(e, overrides);
    list.sort((x, y) => x.t - y.t);
    const pts = [{ t: 0, node: e.a }, ...list, { t: 1, node: e.b }];
    for (let i = 0; i + 1 < pts.length; i++) {
      const p0 = pts[i]!;
      const p1 = pts[i + 1]!;
      const piece: OverlayPiece = {
        edge: edgeIdx,
        sub: i,
        from: p0.node,
        to: p1.node,
        fromT: p0.t,
        toT: p1.t,
        view: { ...view, lengthM: (p1.t - p0.t) * e.lengthM },
      };
      addStep(p0.node, { edge: edgeIdx, sub: i, reverse: false, to: p1.node, fromT: p0.t, toT: p1.t, piece });
      addStep(p1.node, { edge: edgeIdx, sub: i, reverse: true, to: p0.node, fromT: p1.t, toT: p0.t, piece });
    }
  }

  const baseCost = new Float64Array(graph.edges.length).fill(Number.NaN);
  const stepView = (s: Step): EdgeView => s.piece?.view ?? effectiveAttrs(graph.edges[s.edge]!, overrides);
  const stepCost = (s: Step): number => {
    if (s.piece) return edgeCost(s.piece.view, lambda, settings, medianConfidence);
    let c = baseCost[s.edge]!;
    if (Number.isNaN(c)) {
      c = edgeCost(effectiveAttrs(graph.edges[s.edge]!, overrides), lambda, settings, medianConfidence);
      baseCost[s.edge] = c;
    }
    return c;
  };
  const stepsFrom = (u: number): Step[] => {
    const out: Step[] = [];
    if (u < nBase) {
      for (const d of graph.adjacency[u]!) {
        if (cuts.has(d.edge)) continue;
        out.push({
          edge: d.edge,
          sub: 0,
          reverse: d.reverse,
          to: d.to,
          fromT: d.reverse ? 1 : 0,
          toT: d.reverse ? 0 : 1,
          piece: null,
        });
      }
    }
    const x = extra.get(u);
    if (x) out.push(...x);
    return out;
  };

  // Same point: nothing to walk.
  if (startNode === endNode) {
    return { pieces: [], physicalLengthM: 0, routingDistanceM: 0, darkExposure: 0, cost: 0 };
  }

  // --- backward Dijkstra from the end ---
  const dist = new Float64Array(nextVirtual).fill(Infinity);
  const done = new Uint8Array(nextVirtual);
  const parent = new Array<Step | null>(nextVirtual).fill(null); // step that last improved dist[to], walked from the parent
  const parentNode = new Int32Array(nextVirtual).fill(-1);
  dist[endNode] = 0;
  const heap = new Heap();
  heap.push(0, endNode);
  while (heap.size > 0) {
    const { dist: du, node: u } = heap.pop();
    if (done[u]) continue;
    done[u] = 1;
    if (u === startNode) break; // every node nearer than start is settled; start's value is final
    for (const s of stepsFrom(u)) {
      const nd = du + stepCost(s);
      if (nd < dist[s.to]!) {
        dist[s.to] = nd;
        parent[s.to] = s;
        parentNode[s.to] = u;
        heap.push(nd, s.to);
      }
    }
  }
  if (!Number.isFinite(dist[startNode]!)) return null;

  // --- forward walk: smallest dart key among darts that begin a cheapest path ---
  const keyCmp = (x: Step, y: Step): number => {
    const sx = graph.edges[x.edge]!.segmentId;
    const sy = graph.edges[y.edge]!.segmentId;
    if (sx !== sy) return sx < sy ? -1 : 1;
    const px = graph.edges[x.edge]!.part;
    const py = graph.edges[y.edge]!.part;
    return px - py || x.sub - y.sub || Number(x.reverse) - Number(y.reverse);
  };

  // Shortest-path-tree walk: always reaches endNode because startNode was settled. Used as the fallback.
  const treeWalk = (): Step[] => {
    const out: Step[] = [];
    let n = startNode;
    while (n !== endNode) {
      const s = parent[n]!;
      const p = parentNode[n]!;
      out.push({ edge: s.edge, sub: s.sub, reverse: !s.reverse, to: p, fromT: s.toT, toT: s.fromT, piece: s.piece });
      n = p;
    }
    return out;
  };

  let chosen: Step[] = [];
  const visited = new Set<number>([startNode]);
  let u = startNode;
  let stuck = false;
  while (u !== endNode) {
    const du = dist[u]!;
    const tol = TIE_TOLERANCE * Math.max(1, du);
    let best: Step | null = null;
    let weak: Step | null = null; // non-increasing dist (float resolution), within tolerance
    for (const s of stepsFrom(u)) {
      const dv = dist[s.to]!;
      if (visited.has(s.to) || !(dv <= du)) continue; // never revisit; skips unreached nodes (Infinity)
      if (Math.abs(stepCost(s) + dv - du) > tol) continue;
      if (dv < du) {
        if (best === null || keyCmp(s, best) < 0) best = s;
      } else if (weak === null || keyCmp(s, weak) < 0) weak = s;
    }
    const pick = best ?? weak;
    if (pick === null) {
      stuck = true;
      break;
    }
    chosen.push(pick);
    visited.add(pick.to);
    u = pick.to;
  }
  if (stuck) chosen = treeWalk();

  const pieces: RoutePiece[] = [];
  let physical = 0;
  let routing = 0;
  let dark = 0;
  let total = 0;
  for (const best of chosen) {
    const view = stepView(best);
    pieces.push({ edge: best.edge, reverse: best.reverse, sub: best.sub, fromT: best.fromT, toT: best.toT, view });
    physical += view.lengthM;
    routing += routingLength(view, settings);
    dark += view.lengthM * adjustedDread(view, settings, medianConfidence);
    total += stepCost(best);
  }
  return { pieces, physicalLengthM: physical, routingDistanceM: routing, darkExposure: dark, cost: total };
}
