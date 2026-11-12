import { describe, expect, it } from 'vitest';
import {
  ATTRIBUTION_HTML,
  BASE_LAYER_IDS,
  BASE_SOURCE_ID,
  OPENFREEMAP_TILEJSON_URL,
  buildStyle,
} from '../src/map/style';

describe('bundled map style', () => {
  const style = buildStyle();

  it('loads tiles only through the TileJSON url', () => {
    const src = style.sources[BASE_SOURCE_ID] as { type: string; url?: string; tiles?: unknown };
    expect(src.type).toBe('vector');
    expect(src.url).toBe(OPENFREEMAP_TILEJSON_URL);
    expect(src.tiles).toBeUndefined();
    expect(Object.keys(style.sources)).toEqual([BASE_SOURCE_ID]);
  });

  it('has no glyphs, sprite, symbol layers or base building layer', () => {
    expect(style.glyphs).toBeUndefined();
    expect(style.sprite).toBeUndefined();
    expect(style.layers.some((l) => l.type === 'symbol')).toBe(false);
    const sourceLayers = style.layers.flatMap((l) => ('source-layer' in l ? [l['source-layer']] : []));
    expect(sourceLayers).not.toContain('building');
    expect(new Set(sourceLayers)).toEqual(
      new Set(['landcover', 'landuse', 'park', 'water', 'waterway', 'transportation']),
    );
  });

  it('lists every base layer id', () => {
    const ids = style.layers.map((l) => l.id);
    for (const id of BASE_LAYER_IDS) expect(ids).toContain(id);
  });

  it('carries the three links and the contributors text', () => {
    const text = ATTRIBUTION_HTML.join(' ');
    expect(text).toContain('https://openfreemap.org');
    expect(text).toContain('https://www.openmaptiles.org/');
    expect(text).toContain('https://www.openstreetmap.org/copyright');
    expect(text).toContain('© OpenStreetMap contributors');
    const src = style.sources[BASE_SOURCE_ID] as { attribution?: string };
    expect(src.attribution).toBe(text);
  });
});
