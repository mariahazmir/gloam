// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { loadPack } from '../src/net/packLoader';
import { MANIFEST, type ManifestEntry } from '../src/pack/manifest';

// Validates: Requirements 1.1, 1.3, 1.4, 1.6, 1.11, 13.5, 13.9, 17.16

const entry: ManifestEntry = {
  ...MANIFEST[0]!,
  segmentsUrl: '/data/seattle.segments.geojson',
  buildingsUrl: '/data/seattle.buildings.geojson',
};

const segmentsFile = {
  metadata: { schema_version: 1, attribution: '© OpenStreetMap contributors', city: 'Seattle' },
  features: [
    {
      geometry: { type: 'LineString', coordinates: [[0, 0], [0, 1]] },
      properties: { id: 's1', lit_probability: 0.4, confidence: 0.7, label_source: 'estimated' },
    },
  ],
};
const buildingsFile = { metadata: { schema_version: 1 }, features: [] };

const jsonResponse = (body: unknown, status = 200) =>
  ({ ok: status >= 200 && status < 300, status, json: async () => body }) as Response;

function stubFetch(handler: (url: string, signal?: AbortSignal) => Promise<Response>) {
  const urls: string[] = [];
  const fn = ((url: string, init?: RequestInit) => {
    urls.push(url);
    return handler(url, init?.signal ?? undefined);
  }) as unknown as typeof fetch;
  return { fn, urls };
}

const okHandler = async (url: string) =>
  jsonResponse(url.includes('segments') ? segmentsFile : buildingsFile);

describe('pack loading', () => {
  it('requests exactly two URLs, segments then buildings', async () => {
    const { fn, urls } = stubFetch(okHandler);
    const res = await loadPack(entry, fn).result;
    expect(res.ok).toBe(true);
    expect(urls).toEqual([entry.segmentsUrl, entry.buildingsUrl]);
  });

  it('a later choice cancels an earlier load', async () => {
    const { fn } = stubFetch(
      (_u, signal) =>
        new Promise<Response>((_res, rej) => {
          signal?.addEventListener('abort', () => rej(new Error('aborted')));
        }),
    );
    const first = loadPack(entry, fn);
    const second = loadPack(entry, stubFetch(okHandler).fn);
    first.cancel();
    expect(await first.result).toEqual({ ok: false, cancelled: true });
    expect((await second.result).ok).toBe(true);
  });

  it('a failed load commits nothing and names the problem', async () => {
    const { fn } = stubFetch(async (url) =>
      url.includes('segments') ? jsonResponse(segmentsFile) : jsonResponse({}, 404),
    );
    const res = await loadPack(entry, fn).result;
    expect(res.ok).toBe(false);
    expect('pack' in res).toBe(false);
    if (!res.ok && !res.cancelled) {
      expect(res.problem).toMatchObject({ file: 'buildings', kind: 'missing' });
    }
  });

  it('gives a problem when the deadline passes', async () => {
    const { fn } = stubFetch(
      (_u, signal) =>
        new Promise<Response>((_res, rej) => {
          signal?.addEventListener('abort', () => rej(new Error('aborted')));
        }),
    );
    const res = await loadPack(entry, fn, { deadlineMs: 20 }).result;
    expect(res.ok).toBe(false);
    if (!res.ok && !res.cancelled) {
      expect(res.problem.kind).toBe('unreadable');
      expect(res.problem.detail).toContain('timed out');
    }
  });

  it('no requested URL contains a coordinate', async () => {
    const { fn, urls } = stubFetch(okHandler);
    await loadPack(entry, fn).result;
    for (const u of urls) {
      expect(u).not.toMatch(/-?\d+\.\d+/);
      expect(u).not.toContain('?');
    }
  });
});

describe('City_Picker manifest', () => {
  it('has five entries', () => {
    expect(MANIFEST).toHaveLength(5);
  });

  it('only kl has the description', () => {
    const described = MANIFEST.filter((e) => e.description !== undefined);
    expect(described.map((e) => e.id)).toEqual(['kl']);
    expect(described[0]!.description).toBe('the case where lighting records are missing');
  });
});
