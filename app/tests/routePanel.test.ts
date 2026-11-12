// Task 14.4: route statistics, route geometry and the strings behind the screen-reader summary.
import { describe, expect, it } from 'vitest';
import seattleRaw from '../../data/seattle.segments.geojson?raw';
import { STRINGS } from '../src/content/strings';
import { haversine } from '../src/geo/distance';
import { buildGraph } from '../src/graph/build';
import { buildSnapIndex, packBounds } from '../src/graph/snap';
import { MANIFEST } from '../src/pack/manifest';
import { parseSegmentFile } from '../src/pack/parse';
import { medianConfidence } from '../src/routing/costs';
import { formatDistance, formatSigned } from '../src/routing/format';
import { describeHeartbeat, heartbeatSeries, lowConfidenceThreshold } from '../src/routing/heartbeat';
import { createPlanner } from '../src/routing/planner';
import { routeCoordinates } from '../src/routing/routeGeometry';
import { compareStats } from '../src/routing/summary';
import { TIER_ORDER } from '../src/routing/tierShares';
import { assignTiers } from '../src/scoring/tiers';
import type { Tier } from '../src/types';
import { lowConfidenceStretches } from '../src/ui/heartbeatChart';

const parsed = parseSegmentFile(JSON.parse(seattleRaw));
if ('kind' in parsed) throw new Error(parsed.detail);
const { graph } = buildGraph(parsed.segments);
const tiers = assignTiers(parsed.segments);
const tierOf = (edge: number): Tier => tiers.get(graph.edges[edge]!.segmentId)!;
const walk = MANIFEST.find((m) => m.id === 'seattle')!.sampleWalk;

const outcome = createPlanner().plan({
  pack: { graph, index: buildSnapIndex(graph), bounds: packBounds(parsed.segments), medianConfidence: medianConfidence(graph) },
  start: { lon: walk.start[0], lat: walk.start[1] },
  end: { lon: walk.end[0], lat: walk.end[1] },
  lambda: 3,
  settings: { avoidSteps: false, avoidService: false, preferMain: false, lowConfidenceDarker: false },
  overrides: new Map(),
});
if (outcome.kind !== 'route') throw new Error('sample walk did not route');

describe('route statistics', () => {
  const cmp = compareStats(outcome.gloam, outcome.shortest, tierOf);

  it('Tier shares are whole percentages that sum to 100, for both routes', () => {
    for (const s of [cmp.gloam, cmp.shortest]) {
      const values = TIER_ORDER.map((t) => s.shares[t]);
      expect(values.every(Number.isInteger)).toBe(true);
      expect(values.reduce((a, b) => a + b, 0)).toBe(100);
    }
  });

  it('deltas are the Gloam_Route minus the Shortest_Route on displayed values', () => {
    expect(cmp.delta.extraMeters).toBe(Math.round(cmp.gloam.distanceM) - Math.round(cmp.shortest.distanceM));
    expect(cmp.delta.extraMeters).toBeGreaterThanOrEqual(0);
  });

  it('the same route against itself gives 0, 0 and 0', () => {
    const same = compareStats(outcome.gloam, outcome.gloam, tierOf);
    expect(same.delta).toEqual({ extraMeters: 0, extraMinutes: 0, darkerTierChangeM: 0 });
  });

  it('signed numbers carry their sign', () => {
    expect([formatSigned(200), formatSigned(-3), formatSigned(0), formatSigned(-0.2)]).toEqual(['+200', '-3', '0', '0']);
  });
});

describe('route geometry', () => {
  it('starts and ends at the snapped points and is about as long as the route', () => {
    const line = routeCoordinates(graph, outcome.gloam);
    const first = line[0]!;
    const last = line[line.length - 1]!;
    expect(haversine(first[0], first[1], outcome.start.lon, outcome.start.lat)).toBeLessThan(1);
    expect(haversine(last[0], last[1], outcome.end.lon, outcome.end.lat)).toBeLessThan(1);
    let len = 0;
    for (let i = 1; i < line.length; i++) len += haversine(line[i - 1]![0], line[i - 1]![1], line[i]![0], line[i]![1]);
    expect(Math.abs(len - outcome.gloam.physicalLengthM) / outcome.gloam.physicalLengthM).toBeLessThan(0.01);
  });
});

describe('heartbeat text and markers', () => {
  const estimated = parsed.segments.filter((s) => s.labelSource === 'estimated').map((s) => s.confidence);
  const series = heartbeatSeries(outcome.gloam, lowConfidenceThreshold(estimated), { medianConfidence: 0.5 });

  it('the summary is built from strings.ts and names the route length', () => {
    const text = describeHeartbeat(series);
    expect(text.startsWith(STRINGS.heartbeat.routeLength.text(formatDistance(series.totalM)))).toBe(true);
    expect(text).toMatch(/Highest-dread stretches|No highest-dread/);
  });

  it('low-confidence markers match the flagged pieces', () => {
    const stretches = lowConfidenceStretches(series);
    const flagged = series.segments.filter((s) => s.lowConfidence).reduce((a, s) => a + (s.x1 - s.x0), 0);
    expect(stretches.reduce((a, s) => a + (s.to - s.from), 0)).toBeCloseTo(flagged, 6);
  });
});
