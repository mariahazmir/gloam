import type { StreetGraph } from "../../../src/graph/build";
import { edgeCost, effectiveAttrs, routingLength } from "../../../src/routing/costs";
import type { RouteRequest } from "../../../src/routing/router";

export interface BruteResult {
  /** Minimum Route_Cost over all simple paths, or null when start and end are not connected. */
  minCost: number | null;
  /** Minimum Routing_Distance over all simple paths, or null when not connected. */
  minRouting: number | null;
}

interface Arc {
  to: number;
  cost: number;
  routing: number;
}

/**
 * Independent oracle: split the snapped edges, then enumerate every simple node path by DFS.
 * It reuses only the per-piece cost formulas from costs.ts, not the router's search.
 */
/** Same 1 mm rule as the router: a position within 1 mm of an Edge end is that end. */
export function collapsePoint<P extends { edge: number; t: number }>(graph: StreetGraph, p: P): P {
  const len = graph.edges[p.edge]!.lengthM;
  if (p.t * len <= 0.001) return { ...p, t: 0 };
  if ((1 - p.t) * len <= 0.001) return { ...p, t: 1 };
  return p;
}

export function bruteForce(req: RouteRequest): BruteResult {
  const { graph, lambda, settings, overrides, medianConfidence } = req;
  const start = collapsePoint(graph, req.start);
  const end = collapsePoint(graph, req.end);
  let next = graph.nodes.length;
  const virt = new Map<string, number>();
  const nodeOf = (p: { edge: number; t: number }): number => {
    const e = graph.edges[p.edge]!;
    if (p.t === 0) return e.a;
    if (p.t === 1) return e.b;
    const k = `${p.edge},${p.t}`;
    if (!virt.has(k)) virt.set(k, next++);
    return virt.get(k)!;
  };
  const s = nodeOf(start);
  const t = nodeOf(end);

  // Cut points per edge (including the two ends), deduplicated by t.
  const pts = new Map<number, Map<number, number>>();
  graph.edges.forEach((e, i) => pts.set(i, new Map([[0, e.a], [1, e.b]])));
  for (const p of [start, end]) pts.get(p.edge)!.set(p.t, nodeOf(p));

  const arcs = new Map<number, Arc[]>();
  const add = (from: number, a: Arc): void => {
    const l = arcs.get(from) ?? [];
    l.push(a);
    arcs.set(from, l);
  };
  graph.edges.forEach((e, i) => {
    const view = effectiveAttrs(e, overrides);
    const list = [...pts.get(i)!.entries()].sort((x, y) => x[0] - y[0]);
    for (let j = 0; j + 1 < list.length; j++) {
      const [t0, n0] = list[j]!;
      const [t1, n1] = list[j + 1]!;
      const piece = { ...view, lengthM: (t1 - t0) * e.lengthM };
      const arc = {
        cost: edgeCost(piece, lambda, settings, medianConfidence),
        routing: routingLength(piece, settings),
      };
      add(n0, { to: n1, ...arc });
      add(n1, { to: n0, ...arc });
    }
  });

  let minCost: number | null = null;
  let minRouting: number | null = null;
  const seen = new Set<number>([s]);
  const dfs = (u: number, cost: number, routing: number): void => {
    if (u === t) {
      if (minCost === null || cost < minCost) minCost = cost;
      if (minRouting === null || routing < minRouting) minRouting = routing;
      return;
    }
    for (const a of arcs.get(u) ?? []) {
      if (seen.has(a.to)) continue;
      seen.add(a.to);
      dfs(a.to, cost + a.cost, routing + a.routing);
      seen.delete(a.to);
    }
  };
  dfs(s, 0, 0);
  return { minCost, minRouting };
}

export type { StreetGraph };
