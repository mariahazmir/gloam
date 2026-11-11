import { describe, expect, it } from 'vitest';
import type { Building } from '../src/pack/parse';
import {
  type LayerMap,
  type LayerSegment,
  ROUTE_CASING_LAYER_ID,
  ROUTE_LAYER_ID,
  addGloamLayers,
  removeGloamLayers,
  setBuildings,
} from '../src/map/layers';
import {
  type FrameClock,
  type TileTimers,
  type WatchMap,
  TILES_UNAVAILABLE_MESSAGE,
  TILE_TIMEOUT_MS,
  createTileWatch,
  startFpsSampler,
  startMapFpsSampler,
} from '../src/map/tileWatch';
import { BACKGROUND_LAYER_ID, BASE_LAYER_IDS, BASE_SOURCE_ID } from '../src/map/style';

// Example tests with mocked map events (Requirements 4.6, 5.6, 5.7).

// ---- Tile watch ------------------------------------------------------------

type Listener = (e: Record<string, unknown>) => void;

function watchHarness(sourceLoaded = false) {
  const listeners = new Map<string, Set<Listener>>();
  const hidden: string[] = [];
  const existing = new Set<string>([BACKGROUND_LAYER_ID, ...BASE_LAYER_IDS, 'gloam-static-confirmed_lit']);
  const map: WatchMap = {
    on: (t, l) => void (listeners.get(t) ?? listeners.set(t, new Set()).get(t)!).add(l as Listener),
    off: (t, l) => void listeners.get(t)?.delete(l as Listener),
    getLayer: (id) => (existing.has(id) ? { id } : undefined),
    setLayoutProperty: (id, name, v) => void hidden.push(`${id}|${name}|${String(v)}`),
    isSourceLoaded: () => sourceLoaded,
  };
  let pending: (() => void) | null = null;
  let timeoutMs: number | null = null;
  let cleared = 0;
  const timers: TileTimers = {
    setTimeout: (fn, ms) => ((pending = fn), (timeoutMs = ms), 1),
    clearTimeout: () => void (cleared += 1, (pending = null)),
  };
  const messages: string[] = [];
  const watch = createTileWatch({ map, timers, onUnavailable: (m) => messages.push(m) });
  const emit = (type: string, e: Record<string, unknown>) => listeners.get(type)?.forEach((l) => l(e));
  return {
    watch, emit, hidden, messages, listeners,
    fireTimer: () => pending?.(),
    timeoutMs: () => timeoutMs,
    cleared: () => cleared,
  };
}

describe('tile watch', () => {
  it('uses a 5 s timeout', () => {
    expect(TILE_TIMEOUT_MS).toBe(5000);
    const h = watchHarness();
    h.watch.start();
    expect(h.timeoutMs()).toBe(5000);
  });

  it('on timeout hides the base layers except the background, and tells once', () => {
    const h = watchHarness();
    h.watch.start();
    h.fireTimer();
    expect(h.watch.state()).toBe('unavailable');
    expect(h.messages).toEqual([TILES_UNAVAILABLE_MESSAGE]);
    expect(h.hidden).toEqual(BASE_LAYER_IDS.map((id) => `${id}|visibility|none`));
    expect(h.hidden.some((x) => x.startsWith(`${BACKGROUND_LAYER_ID}|`) || x.startsWith('gloam-'))).toBe(false);
    h.fireTimer();
    h.emit('error', { sourceId: BASE_SOURCE_ID });
    expect(h.messages).toHaveLength(1);
    expect(h.hidden).toHaveLength(BASE_LAYER_IDS.length);
  });

  it('a base source error hides the layers at once and cancels the timer', () => {
    const h = watchHarness();
    h.watch.start();
    h.emit('error', { sourceId: BASE_SOURCE_ID });
    expect(h.watch.state()).toBe('unavailable');
    expect(h.messages).toHaveLength(1);
    expect(h.cleared()).toBe(1);
    expect(h.listeners.get('error')!.size).toBe(0);
  });

  it('ignores errors from other sources', () => {
    const h = watchHarness();
    h.watch.start();
    h.emit('error', { sourceId: 'gloam-segments' });
    h.emit('error', {});
    expect(h.watch.state()).toBe('watching');
    expect(h.hidden).toEqual([]);
  });

  it('metadata-only sourcedata events do not count as loaded', () => {
    const h = watchHarness();
    h.watch.start();
    h.emit('sourcedata', { sourceId: BASE_SOURCE_ID, sourceDataType: 'metadata', isSourceLoaded: true });
    expect(h.watch.state()).toBe('watching');
    h.fireTimer();
    expect(h.watch.state()).toBe('unavailable');
  });

  it('a sourcedata event for another source, or not yet loaded, does not count', () => {
    const h = watchHarness(false);
    h.watch.start();
    h.emit('sourcedata', { sourceId: 'gloam-segments', isSourceLoaded: true });
    h.emit('sourcedata', { sourceId: BASE_SOURCE_ID, sourceDataType: 'content', isSourceLoaded: false });
    expect(h.watch.state()).toBe('watching');
  });

  it('a loaded base source cancels the timer and later errors change nothing', () => {
    const h = watchHarness();
    h.watch.start();
    h.emit('sourcedata', { sourceId: BASE_SOURCE_ID, sourceDataType: 'content', isSourceLoaded: true });
    expect(h.watch.state()).toBe('loaded');
    expect(h.cleared()).toBe(1);
    h.emit('error', { sourceId: BASE_SOURCE_ID });
    expect(h.messages).toEqual([]);
    expect(h.hidden).toEqual([]);
  });

  it('stop() cancels the timer and removes listeners', () => {
    const h = watchHarness();
    h.watch.start();
    h.watch.stop();
    expect(h.watch.state()).toBe('stopped');
    expect(h.cleared()).toBe(1);
    expect(h.listeners.get('sourcedata')!.size).toBe(0);
    expect(h.listeners.get('error')!.size).toBe(0);
    h.emit('error', { sourceId: BASE_SOURCE_ID });
    expect(h.messages).toEqual([]);
  });
});

// ---- Route layer is last ---------------------------------------------------

function layerMap() {
  const layers: Array<{ id: string; layout?: Record<string, unknown> }> = [];
  const sources = new Map<string, { data?: unknown }>();
  const map: LayerMap = {
    addSource: (id) => void sources.set(id, {}),
    addLayer: (l, before) => {
      const layer = l as unknown as { id: string };
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
    setPaintProperty: () => {},
    setLayoutProperty: (id, name, v) => {
      const l = layers.find((x) => x.id === id);
      if (l) (l.layout ??= {})[name] = v;
    },
    setFeatureState: () => {},
  };
  return { map, layers };
}

const segs: LayerSegment[] = [{ id: '1', tier: 'confirmed_lit', confidence: 1, coordinates: [[0, 0], [0, 1]] }];
const bld: Building[] = [{ rings: [[[0, 0], [0, 1], [1, 1], [0, 0]]], heightM: 9 }];

describe('route layer is last', () => {
  it('stays last after buildings arrive late twice, and after a pack is replaced', () => {
    const { map, layers } = layerMap();
    const lastTwo = () => layers.slice(-2).map((l) => l.id);
    addGloamLayers(map, segs);
    expect(lastTwo()).toEqual([ROUTE_CASING_LAYER_ID, ROUTE_LAYER_ID]);
    setBuildings(map, bld);
    setBuildings(map, bld);
    expect(layers.filter((l) => l.id === 'gloam-buildings-extrusion')).toHaveLength(1);
    expect(lastTwo()).toEqual([ROUTE_CASING_LAYER_ID, ROUTE_LAYER_ID]);
    removeGloamLayers(map);
    expect(layers).toHaveLength(0);
    addGloamLayers(map, segs, undefined, bld);
    expect(lastTwo()).toEqual([ROUTE_CASING_LAYER_ID, ROUTE_LAYER_ID]);
  });
});

// ---- fps sampler -----------------------------------------------------------

function fakeClock() {
  let now = 0;
  let frameCb: (() => void) | null = null;
  let tick: (() => void) | null = null;
  let intervalMs = 0;
  let intervalCleared = false;
  let rafCancelled = false;
  const clock: FrameClock = {
    requestAnimationFrame: (cb) => ((frameCb = cb), 1),
    cancelAnimationFrame: () => void (rafCancelled = true),
    setInterval: (fn, ms) => ((tick = fn), (intervalMs = ms), 2),
    clearInterval: () => void (intervalCleared = true),
    nowMs: () => now,
  };
  return {
    clock,
    /** Draws n frames, then moves the clock to atMs and fires the sampler interval. */
    sample(n: number, atMs: number) {
      for (let i = 0; i < n; i++) frameCb?.();
      now = atMs;
      tick?.();
    },
    drawFrame: () => frameCb?.(),
    intervalMs: () => intervalMs,
    intervalCleared: () => intervalCleared,
    rafCancelled: () => rafCancelled,
  };
}

describe('fps sampler', () => {
  it('samples once per second and passes frames / elapsed seconds to the ladder', () => {
    const f = fakeClock();
    const seen: number[] = [];
    const s = startFpsSampler({ clock: f.clock, isVisible: () => true, onState: (_st, fps) => seen.push(fps) });
    expect(f.intervalMs()).toBe(1000);
    // 30 frames over 1500 ms = 30 / 1.5 = 20 fps; 60 frames over 1000 ms = 60 fps.
    f.sample(30, 1500);
    f.sample(60, 2500);
    expect(seen).toEqual([20, 60]);
    expect(s.state().active).toHaveLength(4);
    s.stop();
  });

  it('drops effects in ladder order after fps stays under 30 for 2 s', () => {
    const f = fakeClock();
    const s = startFpsSampler({ clock: f.clock, isVisible: () => true, onState: () => {} });
    // 20 fps each second. 1000: timer starts. 2000: held 1000 ms. 3000: held 2000 ms, drop flicker.
    f.sample(20, 1000);
    f.sample(20, 2000);
    expect(s.state().active).toEqual(['flicker', 'glow', 'fog', 'extrusion']);
    f.sample(20, 3000);
    expect(s.state().active).toEqual(['glow', 'fog', 'extrusion']);
    // 4000 held 1000 ms; 5000 held 2000 ms, drop glow.
    f.sample(20, 4000);
    f.sample(20, 5000);
    expect(s.state().active).toEqual(['fog', 'extrusion']);
    // Recovering fps clears the timer but never brings effects back.
    f.sample(60, 6000);
    expect(s.state().active).toEqual(['fog', 'extrusion']);
    expect(s.state().belowSinceMs).toBeNull();
    s.stop();
  });

  it('skips samples while the tab is hidden and drops the frames counted then', () => {
    const f = fakeClock();
    let visible = false;
    const seen: number[] = [];
    const s = startFpsSampler({ clock: f.clock, isVisible: () => visible, onState: (_st, fps) => seen.push(fps) });
    f.sample(10, 1000);
    expect(seen).toEqual([]);
    expect(s.state().belowSinceMs).toBeNull();
    visible = true;
    f.sample(60, 2000); // only the 60 frames since the hidden sample: 60 / 1 s
    expect(seen).toEqual([60]);
    s.stop();
  });

  it('stop() clears the interval and cancels the pending frame', () => {
    const f = fakeClock();
    const s = startFpsSampler({ clock: f.clock, isVisible: () => true, onState: () => {} });
    s.stop();
    expect(f.intervalCleared()).toBe(true);
    expect(f.rafCancelled()).toBe(true);
  });

  it('startMapFpsSampler applies the shed effects to the map and honours reduced mode', () => {
    const { map, layers } = layerMap();
    addGloamLayers(map, segs);
    const f = fakeClock();
    const vis = (prefix: string) =>
      layers.filter((l) => l.id.startsWith(prefix)).map((l) => l.layout?.visibility);
    const s = startMapFpsSampler(map, () => false, f.clock, () => true);
    f.sample(20, 1000);
    f.sample(20, 2000);
    f.sample(20, 3000); // flicker dropped; glow still visible
    expect(vis('gloam-glow-').every((v) => v === 'visible')).toBe(true);
    f.sample(20, 4000);
    f.sample(20, 5000); // glow dropped
    expect(vis('gloam-glow-').length).toBeGreaterThan(0);
    expect(vis('gloam-glow-').every((v) => v === 'none')).toBe(true);
    expect(vis('gloam-fog-').every((v) => v === 'visible')).toBe(true);
    s.stop();
  });
});
