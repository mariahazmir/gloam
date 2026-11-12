import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  buildReport,
  classifyEncoding,
  findPackPaths,
  isHttps,
  judgeFile,
  parseUrl,
} from '../scripts/hostCheck';

describe('hostCheck', () => {
  it('classifies Content-Encoding values', () => {
    expect(classifyEncoding(null)).toBe('none');
    expect(classifyEncoding('identity')).toBe('none');
    expect(classifyEncoding('gzip')).toBe('gzip');
    expect(classifyEncoding('BR')).toBe('br');
    expect(classifyEncoding('deflate')).toBe('other');
  });

  it('only passes reachable gzip or Brotli files', () => {
    const base = { url: 'https://x/a.geojson' };
    expect(judgeFile({ ...base, status: 200, contentEncoding: 'br' }).ok).toBe(true);
    expect(judgeFile({ ...base, status: 200, contentEncoding: null }).ok).toBe(false);
    expect(judgeFile({ ...base, status: 404, contentEncoding: 'gzip' }).ok).toBe(false);
    expect(judgeFile({ ...base, status: 0, contentEncoding: null }).reachable).toBe(false);
  });

  it('finds hashed pack paths and rejects bad URLs by naming the argument', () => {
    const js = 'a="/assets/kl.segments-DuqRM6vd.json";b="assets/x.js"';
    expect(findPackPaths(js)).toEqual(['/assets/kl.segments-DuqRM6vd.json']);
    expect(() => parseUrl('nope')).toThrow(/url/);
    expect(isHttps(parseUrl('http://a.test/'))).toBe(false);
  });

  it('reports only real /assets/ packs, not source paths or map-library strings', () => {
    const js = [
      '"../../../data/kl.segments.geojson"',
      '"/data/seattle.segments.geojson"',
      '"../../../data/sample-data.json"',
      '`${t}.${n}.geojson`',
      '"/data/seattle.buildings.geojson"',
      '?r.json():r.text(',
      'n.json()}}catch{',
      'this.workerOptions.geojsonVtOptions.',
      '"/assets/london.segments-CQkqWw-o.json"',
      '"/gloam/assets/kl.buildings-BBl4d63W.json"',
    ].join(';');
    expect(findPackPaths(js)).toEqual([
      '/assets/london.segments-CQkqWw-o.json',
      '/gloam/assets/kl.buildings-BBl4d63W.json',
    ]);
  });

  it('report is ok only when every check passes', () => {
    const good = judgeFile({ url: 'u', status: 200, contentEncoding: 'gzip' });
    const bad = judgeFile({ url: 'v', status: 200, contentEncoding: null });
    const https = parseUrl('https://a.test/');
    expect(buildReport(https, 200, [good]).ok).toBe(true);
    expect(buildReport(https, 200, [good, bad]).ok).toBe(false);
    expect(buildReport(https, 500, [good]).ok).toBe(false);
    expect(buildReport(parseUrl('http://a.test/'), 200, [good]).ok).toBe(false);
    expect(buildReport(https, 200, []).ok).toBe(false);
  });

  it('property: encoding verdict ok implies reachable and compressed', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 599 }),
        fc.option(fc.constantFrom('gzip', 'br', 'identity', 'deflate'), { nil: null }),
        (status, enc) => {
          const v = judgeFile({ url: 'u', status, contentEncoding: enc });
          if (v.ok) expect(v.reachable && (v.compression === 'gzip' || v.compression === 'br')).toBe(true);
        },
      ),
    );
  });
});
