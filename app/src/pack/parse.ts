import type { LabelSource, PackMeta, Segment } from '../types';

export type PackFileKind = 'segments' | 'buildings';
export type PackProblem = {
  file: PackFileKind;
  kind: 'missing' | 'unreadable' | 'invalid';
  detail: string;
};

export type Position = readonly [lon: number, lat: number];

export interface Building {
  /** Polygon rings, outer ring first. */
  rings: ReadonlyArray<ReadonlyArray<Position>>;
  heightM: number;
}

export interface BuildingProblem {
  /** Index of the feature in the file. */
  index: number;
  field: 'height_m' | 'geometry';
  detail: string;
}

export const SUPPORTED_SCHEMA_VERSIONS: readonly number[] = [1];

const LABEL_SOURCES: readonly string[] = ['tagged_lit', 'tagged_unlit', 'estimated'];

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const isFiniteNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

const isUnit = (v: unknown): v is number => isFiniteNumber(v) && v >= 0 && v <= 1;

function invalid(file: PackFileKind, detail: string): PackProblem {
  return { file, kind: 'invalid', detail };
}

function readPosition(v: unknown): Position | null {
  if (!Array.isArray(v) || v.length < 2) return null;
  const [lon, lat] = v;
  if (!isFiniteNumber(lon) || !isFiniteNumber(lat)) return null;
  return [lon, lat];
}

function readPositions(v: unknown): Position[] | null {
  if (!Array.isArray(v)) return null;
  const out: Position[] = [];
  for (const p of v) {
    const pos = readPosition(p);
    if (!pos) return null;
    out.push(pos);
  }
  return out;
}

/** Returns the file's metadata and features array, or a problem. */
function readCollection(
  json: unknown,
  file: PackFileKind,
): { metadata: Record<string, unknown>; features: unknown[] } | PackProblem {
  if (!isObject(json)) return invalid(file, 'file is not a JSON object');
  const metadata = json.metadata;
  if (!isObject(metadata)) return invalid(file, 'metadata is missing');
  const version = metadata.schema_version;
  if (typeof version !== 'number' || !SUPPORTED_SCHEMA_VERSIONS.includes(version)) {
    return invalid(file, `unsupported schema_version: ${String(version)}`);
  }
  if (!Array.isArray(json.features)) return invalid(file, 'features is missing');
  return { metadata, features: json.features };
}

export function parseSegmentFile(
  json: unknown,
): { meta: PackMeta; segments: Segment[] } | PackProblem {
  const col = readCollection(json, 'segments');
  if ('kind' in col) return col;
  const { metadata, features } = col;

  const meta: PackMeta = {
    schemaVersion: metadata.schema_version as number,
    attribution: typeof metadata.attribution === 'string' ? metadata.attribution : '',
    estimatesNote: typeof metadata.estimates_note === 'string' ? metadata.estimates_note : '',
    city: typeof metadata.city === 'string' ? metadata.city : '',
  };

  const segments: Segment[] = [];
  for (let i = 0; i < features.length; i++) {
    const f = features[i];
    if (!isObject(f)) return invalid('segments', `feature ${i} is not an object`);
    const geom = f.geometry;
    if (!isObject(geom) || geom.type !== 'LineString') {
      return invalid('segments', `feature ${i} geometry is not a LineString`);
    }
    const coordinates = readPositions(geom.coordinates);
    if (!coordinates) return invalid('segments', `feature ${i} has invalid coordinates`);
    const p = f.properties;
    if (!isObject(p)) return invalid('segments', `feature ${i} has no properties`);
    if (p.id === undefined || p.id === null) return invalid('segments', `feature ${i} has no id`);
    if (!isUnit(p.lit_probability)) {
      return invalid('segments', `feature ${i} lit_probability must be a number from 0 to 1`);
    }
    if (!isUnit(p.confidence)) {
      return invalid('segments', `feature ${i} confidence must be a number from 0 to 1`);
    }
    if (typeof p.label_source !== 'string' || !LABEL_SOURCES.includes(p.label_source)) {
      return invalid('segments', `feature ${i} has an unknown label_source`);
    }
    segments.push({
      id: String(p.id),
      name: typeof p.name === 'string' ? p.name : null,
      highway: typeof p.highway === 'string' ? p.highway : '',
      litProbability: p.lit_probability,
      confidence: p.confidence,
      labelSource: p.label_source as LabelSource,
      coordinates,
    });
  }
  return { meta, segments };
}

export function parseBuildingsFile(
  json: unknown,
): { buildings: Building[]; skipped: BuildingProblem[] } | PackProblem {
  const col = readCollection(json, 'buildings');
  if ('kind' in col) return col;

  const buildings: Building[] = [];
  const skipped: BuildingProblem[] = [];
  col.features.forEach((f, index) => {
    const props = isObject(f) && isObject(f.properties) ? f.properties : {};
    const h = props.height_m;
    if (!isFiniteNumber(h) || h < 0) {
      skipped.push({ index, field: 'height_m', detail: `height_m is ${String(h)}` });
      return;
    }
    const geom = isObject(f) ? f.geometry : undefined;
    if (!isObject(geom) || geom.type !== 'Polygon' || !Array.isArray(geom.coordinates)) {
      skipped.push({ index, field: 'geometry', detail: 'geometry is not a Polygon' });
      return;
    }
    const rings: Position[][] = [];
    for (const r of geom.coordinates) {
      const ring = readPositions(r);
      if (!ring) {
        skipped.push({ index, field: 'geometry', detail: 'polygon has invalid coordinates' });
        return;
      }
      rings.push(ring);
    }
    buildings.push({ rings, heightM: h });
  });
  return { buildings, skipped };
}
