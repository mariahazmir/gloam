// The glob path is relative to this file: app/src/pack -> repository root /data.
// Query '?url' with import 'default' gives hashed asset URLs; nothing is fetched here.
const FILES = import.meta.glob('../../../data/{seattle,kl,london,berlin,manchester}.*.geojson', {
  query: '?url',
  import: 'default',
  eager: true,
}) as Record<string, string>;

const SAMPLE_FILES = import.meta.glob('../../../data/sample-data.json', {
  query: '?url',
  import: 'default',
  eager: true,
}) as Record<string, string>;

export type PackId = 'seattle' | 'kl' | 'london' | 'berlin' | 'manchester';

export interface ManifestEntry {
  id: PackId;
  /** City_Picker text. */
  label: string;
  /** Only kl has one. */
  description?: string;
  segmentsUrl: string;
  buildingsUrl: string;
  sampleWalk: { start: [lon: number, lat: number]; end: [lon: number, lat: number] };
}

function urlFor(id: PackId, kind: 'segments' | 'buildings'): string {
  const url = FILES[`../../../data/${id}.${kind}.geojson`];
  return url ?? '';
}

// sampleWalk points come from scripts/pickSampleWalks.ts (Gloam_Route at lambda 3 differs from the Shortest_Route).
function entry(
  id: PackId,
  label: string,
  start: [number, number],
  end: [number, number],
  description?: string,
): ManifestEntry {
  return {
    id,
    label,
    ...(description !== undefined ? { description } : {}),
    segmentsUrl: urlFor(id, 'segments'),
    buildingsUrl: urlFor(id, 'buildings'),
    sampleWalk: { start, end },
  };
}

/** Five shipped packs. Seattle is first and is the first-run pack. */
export const MANIFEST: ReadonlyArray<ManifestEntry> = [
  entry('seattle', 'Seattle', [-122.31081, 47.61418], [-122.31006, 47.60694]),
  entry(
    'kl',
    'Kuala Lumpur',
    [101.71795, 3.14787],
    [101.71923, 3.15581],
    'the case where lighting records are missing',
  ),
  entry('london', 'London', [-0.15445, 51.50584], [-0.14145, 51.50186]),
  entry('berlin', 'Berlin', [13.42469, 52.52586], [13.4392, 52.52948]),
  entry('manchester', 'Manchester', [-2.24257, 53.49918], [-2.2321, 53.49495]),
];

export const FIRST_RUN_PACK: PackId = 'seattle';

/** URL of the bundled Sample_Data file, or undefined if the file is missing. */
export const SAMPLE_DATA_URL: string | undefined = Object.values(SAMPLE_FILES)[0];
