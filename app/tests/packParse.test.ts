import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { parseBuildingsFile, parseSegmentFile } from '../src/pack/parse';

// Feature: gloam-web-app, Property 3: Pack validation accepts valid files and rejects every listed defect
// Validates: Requirements 1.6, 1.7, 5.8
// Objects are passed directly (never via JSON) so NaN/Infinity survive.

const RUNS = { numRuns: 100 };

const unit = fc.double({ min: 0, max: 1, noNaN: true });
const position = fc.tuple(
  fc.double({ min: -180, max: 180, noNaN: true }),
  fc.double({ min: -90, max: 90, noNaN: true }),
);
const id = fc.oneof(fc.string({ minLength: 1 }), fc.integer({ min: 0, max: 1_000_000 }));

const segmentFeature = fc.record({
  type: fc.constant('Feature'),
  geometry: fc.record({
    type: fc.constant('LineString'),
    coordinates: fc.array(position, { minLength: 2, maxLength: 5 }),
  }),
  properties: fc.record({
    id,
    name: fc.string(),
    highway: fc.string(),
    lit_probability: unit,
    confidence: unit,
    label_source: fc.constantFrom('tagged_lit', 'tagged_unlit', 'estimated'),
  }),
});

const segmentFile = fc.array(segmentFeature, { minLength: 1, maxLength: 6 }).map((features) => ({
  type: 'FeatureCollection',
  metadata: { schema_version: 1, attribution: '© OpenStreetMap contributors', city: 'x' },
  features,
}));

const badUnit = fc.constantFrom(NaN, Infinity, -Infinity, -0.0001, 1.0001, -5, 7);
const badVersion = fc.oneof(
  fc.integer().filter((n) => n !== 1),
  fc.constantFrom('1', null, undefined, NaN),
);
const badGeomType = fc.constantFrom('Point', 'Polygon', 'MultiLineString');

type Defect =
  | { k: 'version'; v: unknown }
  | { k: 'lit'; v: number }
  | { k: 'conf'; v: number }
  | { k: 'geom'; v: string };

const defect: fc.Arbitrary<Defect> = fc.oneof(
  badVersion.map((v): Defect => ({ k: 'version', v })),
  badUnit.map((v): Defect => ({ k: 'lit', v })),
  badUnit.map((v): Defect => ({ k: 'conf', v })),
  badGeomType.map((v): Defect => ({ k: 'geom', v })),
);

describe('Property 3: segment file validation', () => {
  it('accepts valid files and returns string ids', () => {
    fc.assert(
      fc.property(segmentFile, (file) => {
        const r = parseSegmentFile(file);
        expect('kind' in r).toBe(false);
        if ('kind' in r) return;
        expect(r.segments).toHaveLength(file.features.length);
        r.segments.forEach((s, i) => {
          expect(typeof s.id).toBe('string');
          expect(s.id).toBe(String(file.features[i].properties.id));
        });
      }),
      RUNS,
    );
  });

  it('rejects each injected defect with an invalid segments problem', () => {
    fc.assert(
      fc.property(segmentFile, defect, fc.nat(), (file, d, n) => {
        const idx = n % file.features.length;
        // Fresh deep copy; structuredClone preserves NaN/Infinity.
        const bad = structuredClone(file) as typeof file & { metadata: Record<string, unknown> };
        const props = bad.features[idx].properties as Record<string, unknown>;
        if (d.k === 'version') bad.metadata.schema_version = d.v;
        else if (d.k === 'lit') props.lit_probability = d.v;
        else if (d.k === 'conf') props.confidence = d.v;
        else (bad.features[idx].geometry as { type: string }).type = d.v;

        const r = parseSegmentFile(bad);
        expect('kind' in r).toBe(true);
        if (!('kind' in r)) return;
        expect(r.file).toBe('segments');
        expect(r.kind).toBe('invalid');
      }),
      RUNS,
    );
  });
});

const goodHeight = fc.double({ min: 0, max: 500, noNaN: true });
const badHeight = fc.constantFrom<unknown>(
  undefined,
  NaN,
  Infinity,
  -Infinity,
  -1,
  -0.001,
  null,
  '12',
);

const ring = fc
  .array(position, { minLength: 3, maxLength: 5 })
  .map((pts) => [...pts, pts[0]]);

const buildingEntry = fc.record({
  ok: fc.boolean(),
  good: goodHeight,
  bad: badHeight,
  ring,
});

const buildingsMeta = { schema_version: 1, attribution: '© OpenStreetMap contributors' };

function toFeature(e: { ok: boolean; good: number; bad: unknown; ring: number[][] }) {
  const properties: Record<string, unknown> = {};
  if (e.ok) properties.height_m = e.good;
  else if (e.bad !== undefined) properties.height_m = e.bad;
  return {
    type: 'Feature',
    geometry: { type: 'Polygon', coordinates: [e.ring] },
    properties,
  };
}

describe('Property 3: buildings file validation', () => {
  it('accepts valid files with every building kept', () => {
    fc.assert(
      fc.property(fc.array(ring.chain((r) => fc.tuple(fc.constant(r), goodHeight)), { maxLength: 6 }), (items) => {
        const file = {
          metadata: buildingsMeta,
          features: items.map(([r, h]) => ({
            type: 'Feature',
            geometry: { type: 'Polygon', coordinates: [r] },
            properties: { height_m: h },
          })),
        };
        const r = parseBuildingsFile(file);
        expect('kind' in r).toBe(false);
        if ('kind' in r) return;
        expect(r.buildings).toHaveLength(items.length);
        expect(r.skipped).toHaveLength(0);
      }),
      RUNS,
    );
  });

  it('skips only buildings with missing/non-finite/negative height_m', () => {
    fc.assert(
      fc.property(fc.array(buildingEntry, { maxLength: 8 }), (entries) => {
        const r = parseBuildingsFile({
          metadata: buildingsMeta,
          features: entries.map(toFeature),
        });
        expect('kind' in r).toBe(false);
        if ('kind' in r) return;
        const okCount = entries.filter((e) => e.ok).length;
        expect(r.buildings).toHaveLength(okCount);
        expect(r.skipped).toHaveLength(entries.length - okCount);
        const badIdx = entries.flatMap((e, i) => (e.ok ? [] : [i]));
        expect(r.skipped.map((s) => s.index)).toEqual(badIdx);
        for (const s of r.skipped) expect(s.field).toBe('height_m');
      }),
      RUNS,
    );
  });
});
