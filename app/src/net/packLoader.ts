import type { ManifestEntry, PackId } from '../pack/manifest';
import {
  parseBuildingsFile,
  parseSegmentFile,
  type Building,
  type BuildingProblem,
  type PackFileKind,
  type PackProblem,
} from '../pack/parse';
import type { PackMeta, Segment } from '../types';

export const LOAD_DEADLINE_MS = 15_000;

export interface LoadedPack {
  id: PackId;
  meta: PackMeta;
  segments: Segment[];
  buildings: Building[];
  skippedBuildings: BuildingProblem[];
}

export type LoadResult =
  | { ok: true; pack: LoadedPack }
  | { ok: false; cancelled: true }
  | { ok: false; cancelled: false; problem: PackProblem };

export interface PackLoad {
  cancel(): void;
  result: Promise<LoadResult>;
}

export interface LoadOptions {
  deadlineMs?: number;
  /** Called once the Segment_File is parsed, so the street layer can be drawn before buildings load. */
  onSegments?: (data: { meta: PackMeta; segments: Segment[] }) => void;
}

/**
 * Fetches the Segment_File, then the Buildings_File. Requests carry only the two file URLs,
 * never a coordinate. Nothing is returned as loaded unless both files are valid.
 */
export function loadPack(
  entry: ManifestEntry,
  fetchFn: typeof fetch,
  options: LoadOptions = {},
): PackLoad {
  const controller = new AbortController();
  const deadlineMs = options.deadlineMs ?? LOAD_DEADLINE_MS;
  let cancelled = false;
  let timedOut = false;
  let current: PackFileKind = 'segments';

  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, deadlineMs);

  const problem = (kind: PackProblem['kind'], detail: string): LoadResult => ({
    ok: false,
    cancelled: false,
    problem: { file: current, kind, detail },
  });

  async function getJson(url: string): Promise<{ json: unknown } | LoadResult> {
    let res: Response;
    try {
      res = await fetchFn(url, { signal: controller.signal });
    } catch {
      return interrupted() ?? problem('unreadable', 'the request failed');
    }
    if (!res.ok) {
      return problem(res.status === 404 ? 'missing' : 'unreadable', `HTTP status ${res.status}`);
    }
    try {
      return { json: await res.json() };
    } catch {
      return interrupted() ?? problem('unreadable', 'the file is not valid JSON');
    }
  }

  function interrupted(): LoadResult | null {
    if (cancelled) return { ok: false, cancelled: true };
    if (timedOut) return problem('unreadable', `timed out after ${deadlineMs / 1000} s`);
    return null;
  }

  async function run(): Promise<LoadResult> {
    const seg = await getJson(entry.segmentsUrl);
    if (!('json' in seg)) return seg;
    const parsedSegments = parseSegmentFile(seg.json);
    if ('kind' in parsedSegments) return { ok: false, cancelled: false, problem: parsedSegments };
    if (cancelled) return { ok: false, cancelled: true };
    options.onSegments?.({ meta: parsedSegments.meta, segments: parsedSegments.segments });

    current = 'buildings';
    const bld = await getJson(entry.buildingsUrl);
    if (!('json' in bld)) return bld;
    const parsedBuildings = parseBuildingsFile(bld.json);
    if ('kind' in parsedBuildings) return { ok: false, cancelled: false, problem: parsedBuildings };
    if (cancelled) return { ok: false, cancelled: true };

    return {
      ok: true,
      pack: {
        id: entry.id,
        meta: parsedSegments.meta,
        segments: parsedSegments.segments,
        buildings: parsedBuildings.buildings,
        skippedBuildings: parsedBuildings.skipped,
      },
    };
  }

  const result = run().finally(() => clearTimeout(timer));

  return {
    cancel() {
      cancelled = true;
      controller.abort();
    },
    result,
  };
}
