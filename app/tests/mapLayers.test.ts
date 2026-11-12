import { describe, expect, it } from 'vitest';
import type { Map as MapLibreMap } from 'maplibre-gl';
import {
  type LayerMap,
  type LayerSegment,
  type Timers,
  END_MARKER_LAYER_ID,
  MARKERS_SOURCE_ID,
  NOTE_LAYER_ID,
  ROUTE_CASING_LAYER_ID,
  ROUTE_LAYER_ID,
  START_MARKER_LAYER_ID,
  buildMarkersGeoJSON,
  setMarkers,
  SEGMENTS_SOURCE_ID,
  addGloamLayers,
  applyEffects,
  cohortOpacity,
  cohorts,
  featureId,
  setBuildings,
  setNoted,
  setRoute,
  startFlicker,
} from '../src/map/layers';
import { FLICKER_CAP, FLICKER_STEP_MS } from '../src/visual/flicker';

// Compile-time check: the real map satisfies the narrow interface.
export const assertRealMapFits = (m: MapLibreMap): LayerMap => m;

interface Layer { id: string; type: string; paint?: Record<string, unknown>; layout?: Record<string, unknown> }

function mockMap() {
  const layers: Layer[] = [];
  const sources = new Map<string, { spec: Record<string, unknown>; data?: unknown }>();
  const paint = new Map<string, unknown>();
  const states: Array<{ source: string; id: string | number; state: Record<string, unknown> }> = [];
  const map: LayerMap = {
    addSource: (id, spec) => void sources.set(id, { spec: spec as unknown as Record<string, unknown> }),
    addLayer: (l, before) => {
      const layer = l as unknown as Layer;
      const i = before ? layers.findIndex((x) => x.id === before) : -1;
      if (i >= 0) layers.splice(i, 0, layer);
      else layers.push(layer);
    },
    removeLayer: (id) => void layers.splice(layers.findIndex((l) => l.id === id), 1),
    removeSource: (id) => void sources.delete(id),
    getLayer: (id) => layers.find((l) => l.id === id),
    getSource: (id) => {
      const s = sources.get(id);
      return s ? { setData: (d: unknown) => void (s.data = d) } : undefined;
    },
    setPaintProperty: (id, name, v) => void paint.set(`${id}|${name}`, v),
    setLayoutProperty: (id, name, v) => {
      const l = layers.find((x) => x.id === id);
      if (l) (l.layout ??= {})[name] = v;
    },
    setFeatureState: (feature, state) => void states.push({ ...feature, state }),
  };
  return { map, layers, sources, paint, states };
}

const segs: LayerSegment[] = [
  { id: '1', tier: 'confirmed_lit', confidence: 1, coordinates: [[0, 0], [0, 1]] },
  { id: '2', tier: 'darker_than_most', confidence: 0.2, coordinates: [[0, 1], [1, 1]] },
];

describe('map layers', () => {
  it('promotes the id and adds the segment source without a tile url', () => {
    const { map, sources } = mockMap();
    addGloamLayers(map, segs);
    const spec = sources.get(SEGMENTS_SOURCE_ID)!.spec;
    expect(spec.promoteId).toBe('id');
    expect(JSON.stringify(spec)).not.toMatch(/https?:/);
    const props = (spec.data as { features: Array<{ properties: Record<string, unknown> }> }).features.map((f) => f.properties);
    expect(props[0]).toMatchObject({ id: 1, tier: 'confirmed_lit', conf: 1 });
    expect(props[1]).toMatchObject({ id: 2, tier: 'darker_than_most', conf: 0.2, band: 0 });
  });

  it('adds 27 flicker layers, no symbol layers, a circle note marker, and the route last', () => {
    const { map, layers } = mockMap();
    addGloamLayers(map, segs, undefined, []);
    expect(cohorts()).toHaveLength(27);
    expect(layers.filter((l) => l.id.startsWith('gloam-flicker-'))).toHaveLength(27);
    expect(layers.some((l) => l.type === 'symbol')).toBe(false);
    expect(layers.find((l) => l.id === NOTE_LAYER_ID)!.type).toBe('circle');
    expect(layers[layers.length - 1]!.id).toBe(ROUTE_LAYER_ID);
  });

  it('puts buildings below the segments and keeps the route last, whichever is added later', () => {
    const { map, layers } = mockMap();
    addGloamLayers(map, segs);
    setBuildings(map, [{ rings: [[[0, 0], [0, 1], [1, 1], [0, 0]]], heightM: 12 }]);
    const ext = layers.find((l) => l.type === 'fill-extrusion')!;
    expect(ext.paint!['fill-extrusion-height']).toEqual(['get', 'height_m']);
    expect(layers.findIndex((l) => l.id === ext.id)).toBeLessThan(layers.findIndex((l) => l.id.startsWith('gloam-fog-')));
    expect(layers[layers.length - 1]!.id).toBe(ROUTE_LAYER_ID);
  });

  it('switches reduced effects synchronously: glow and fog hidden, no flicker updates', () => {
    const { map, layers, paint } = mockMap();
    addGloamLayers(map, segs);
    applyEffects(map, { reduced: true, active: [] });
    for (const l of layers.filter((x) => /^gloam-(glow|fog)-/.test(x.id))) expect(l.layout!.visibility).toBe('none');
    const c = cohorts()[0]!;
    const before = paint.get(`${c.layerId}|line-opacity`);
    let tick = () => {};
    const timers: Timers = { setInterval: (fn) => ((tick = fn), 1), clearInterval: () => {}, nowMs: () => 500 };
    startFlicker(map, () => ({ reduced: true, active: [] }), timers);
    tick();
    expect(paint.get(`${c.layerId}|line-opacity`)).toBe(before);
  });

  it('updates cohort opacity on each tick when flicker is on, every 33 ms', () => {
    const { map, paint } = mockMap();
    addGloamLayers(map, segs);
    let tick = () => {};
    let interval = 0;
    let now = 0;
    const timers: Timers = { setInterval: (fn, ms) => ((tick = fn), (interval = ms), 1), clearInterval: () => {}, nowMs: () => now };
    startFlicker(map, () => ({ reduced: false, active: ['flicker'] }), timers);
    now = 250;
    tick();
    expect(interval).toBe(FLICKER_STEP_MS);
    const c = cohorts()[4]!;
    expect(paint.get(`${c.layerId}|line-opacity`)).toBe(cohortOpacity(c, 0.25));
  });

  it('flickers more than 3 times per second in no cohort', () => {
    for (const c of cohorts()) {
      let dips = 0;
      let prev = cohortOpacity(c, 0);
      let falling = false;
      for (let t = 0.001; t < 10; t += 0.001) {
        const o = cohortOpacity(c, t);
        if (o < prev && !falling) dips++;
        falling = o < prev || (o === prev && falling);
        prev = o;
      }
      expect(dips / 10).toBeLessThanOrEqual(FLICKER_CAP);
    }
  });

  it('drives the note marker by feature-state and sets the route source', () => {
    const { map, states, sources } = mockMap();
    addGloamLayers(map, segs);
    setNoted(map, '2', true);
    expect(states[0]).toEqual({ source: SEGMENTS_SOURCE_ID, id: 2, state: { noted: true } });
    setRoute(map, [[0, 0], [1, 1]]);
    expect((sources.get('gloam-route')!.data as { features: unknown[] }).features).toHaveLength(1);
    expect(featureId('abc')).toBe('abc');
  });

  it('draws markers above the segments and note layer, below the route, with different shapes', () => {
    const { map, layers } = mockMap();
    addGloamLayers(map, segs);
    const idx = (id: string) => layers.findIndex((l) => l.id === id);
    const lastSegment = Math.max(...layers.filter((l) => /^gloam-(fog|glow|static|flicker)-/.test(l.id)).map((l) => idx(l.id)));
    for (const id of [START_MARKER_LAYER_ID, END_MARKER_LAYER_ID]) {
      expect(layers[idx(id)]!.type).toBe('circle');
      expect(idx(id)).toBeGreaterThan(lastSegment);
      expect(idx(id)).toBeLessThan(idx(ROUTE_CASING_LAYER_ID));
      expect(idx(id)).toBeLessThan(idx(ROUTE_LAYER_ID));
    }
    const start = layers[idx(START_MARKER_LAYER_ID)]!.paint!;
    const end = layers[idx(END_MARKER_LAYER_ID)]!.paint!;
    expect(start['circle-radius']).not.toBe(end['circle-radius']);
    expect(start['circle-stroke-width']).not.toBe(end['circle-stroke-width']);
    expect(end['circle-opacity']).toBeLessThan(1); // the end ring is hollow-looking, the start disc is solid
    expect(start['circle-opacity']).toBeUndefined();
  });

  it('builds marker data: tapped position until a snap exists, then the snapped one', () => {
    const tapped = { lon: 10, lat: 20 };
    const other = { lon: 11, lat: 21 };
    expect(buildMarkersGeoJSON(null, null).features).toEqual([]);
    const before = buildMarkersGeoJSON(tapped, null);
    expect(before.features).toEqual([
      { type: 'Feature', properties: { role: 'start' }, geometry: { type: 'Point', coordinates: [10, 20] } },
    ]);
    const snapped = buildMarkersGeoJSON(tapped, other, (p) => (p === tapped ? { lon: 10.5, lat: 20.5 } : null));
    expect(snapped.features).toEqual([
      { type: 'Feature', properties: { role: 'start' }, geometry: { type: 'Point', coordinates: [10.5, 20.5] } },
      { type: 'Feature', properties: { role: 'end' }, geometry: { type: 'Point', coordinates: [11, 21] } },
    ]);
    expect(() => buildMarkersGeoJSON({ lon: Number.NaN, lat: 0 }, null)).toThrow(/start longitude/);
  });

  it('setMarkers updates the markers source', () => {
    const { map, sources } = mockMap();
    addGloamLayers(map, segs);
    setMarkers(map, { lon: 1, lat: 2 }, null);
    expect((sources.get(MARKERS_SOURCE_ID)!.data as { features: unknown[] }).features).toHaveLength(1);
  });

  it('rejects a bad confidence naming the argument', () => {
    const { map } = mockMap();
    expect(() => addGloamLayers(map, [{ ...segs[0]!, confidence: Number.NaN }])).toThrow(/confidence of segment 1/);
  });
});
