import { STRINGS } from '../content/strings';
import { requireFinite } from '../validation/guards';
import { ArgumentError } from '../validation/errors';
import { EFFECT_LADDER, initialEffects, stepEffects, type EffectsState } from '../visual/effects';
import { applyEffects, type LayerMap } from './layers';
import { BACKGROUND_LAYER_ID, BASE_LAYER_IDS, BASE_SOURCE_ID } from './style';

// Tile watch (Requirements 5.7, 17.12) and the fps sampler (Requirements 5.5, 5.6).
// Timers, requestAnimationFrame and the clock are injected so tests can drive them.
// Nothing here touches the network or reads routes.

export const TILE_TIMEOUT_MS = 5000;
export const FPS_SAMPLE_MS = 1000;

/** The user-facing message when the base map is slow or failing. */
export const TILES_UNAVAILABLE_MESSAGE: string = STRINGS.errors.tilesUnavailable.text;

// ---- Tile watch -----------------------------------------------------------

interface MapEventLike {
  sourceId?: string;
  isSourceLoaded?: boolean;
  sourceDataType?: string;
  tile?: unknown;
}

/** Narrow view of the map, so tests can pass a plain object with a tiny event bus. */
export interface WatchMap {
  on(type: string, listener: (e: MapEventLike) => void): unknown;
  off(type: string, listener: (e: MapEventLike) => void): unknown;
  getLayer(id: string): unknown;
  setLayoutProperty(layerId: string, name: string, value: unknown): unknown;
  isSourceLoaded(id: string): boolean;
}

export interface TileTimers {
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

export const realTileTimers: TileTimers = {
  setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms),
  clearTimeout: (h) => globalThis.clearTimeout(h as ReturnType<typeof setTimeout>),
};

export type TileWatchState = 'watching' | 'loaded' | 'unavailable' | 'stopped';

export interface TileWatchOptions {
  map: WatchMap;
  /** Called once with the message when the base map is hidden. */
  onUnavailable: (message: string) => void;
  timers?: TileTimers;
  timeoutMs?: number;
}

export interface TileWatch {
  /** Starts the watch. Call when the style has loaded. */
  start(): void;
  stop(): void;
  state(): TileWatchState;
}

/**
 * If the base vector source has not loaded tiles within the timeout, or it
 * reports an error, base layers are hidden and the message is passed on. Segments
 * stay drawn on the background layer, which is never hidden. Routing is unaffected.
 */
export function createTileWatch(opts: TileWatchOptions): TileWatch {
  const timeoutMs = opts.timeoutMs ?? TILE_TIMEOUT_MS;
  requireFinite('timeoutMs', timeoutMs);
  if (timeoutMs <= 0) throw new ArgumentError('timeoutMs', `must be above 0, got ${timeoutMs}`);
  const { map } = opts;
  const timers = opts.timers ?? realTileTimers;

  let state: TileWatchState = 'stopped';
  let handle: unknown = null;

  const detach = () => {
    if (handle !== null) timers.clearTimeout(handle);
    handle = null;
    map.off('sourcedata', onSourceData);
    map.off('error', onError);
  };

  const fail = () => {
    if (state !== 'watching') return;
    detach();
    state = 'unavailable';
    for (const id of BASE_LAYER_IDS) {
      if (id !== BACKGROUND_LAYER_ID && map.getLayer(id)) map.setLayoutProperty(id, 'visibility', 'none');
    }
    opts.onUnavailable(TILES_UNAVAILABLE_MESSAGE);
  };

  function onSourceData(e: MapEventLike): void {
    if (state !== 'watching' || e.sourceId !== BASE_SOURCE_ID) return;
    if (e.sourceDataType === 'metadata') return; // TileJSON only, no tiles yet
    if (e.isSourceLoaded === true || map.isSourceLoaded(BASE_SOURCE_ID)) {
      detach();
      state = 'loaded';
    }
  }

  function onError(e: MapEventLike): void {
    if (e.sourceId === BASE_SOURCE_ID) fail();
  }

  return {
    start() {
      if (state === 'watching') return;
      state = 'watching';
      map.on('sourcedata', onSourceData);
      map.on('error', onError);
      handle = timers.setTimeout(fail, timeoutMs);
    },
    stop() {
      if (state === 'watching') detach();
      state = 'stopped';
    },
    state: () => state,
  };
}

// ---- fps sampler ----------------------------------------------------------

export interface FrameClock {
  requestAnimationFrame(cb: () => void): unknown;
  cancelAnimationFrame(handle: unknown): void;
  setInterval(fn: () => void, ms: number): unknown;
  clearInterval(handle: unknown): void;
  nowMs(): number;
}

export const realFrameClock: FrameClock = {
  requestAnimationFrame: (cb) => globalThis.requestAnimationFrame(() => cb()),
  cancelAnimationFrame: (h) => globalThis.cancelAnimationFrame(h as number),
  setInterval: (fn, ms) => globalThis.setInterval(fn, ms),
  clearInterval: (h) => globalThis.clearInterval(h as ReturnType<typeof setInterval>),
  nowMs: () => performance.now(),
};

export interface FpsSamplerOptions {
  clock?: FrameClock;
  /** Receives the new state after every sample. */
  onState: (state: EffectsState, fps: number) => void;
  initial?: EffectsState;
  /** Samples are skipped while this is false (a hidden tab draws no frames). */
  isVisible?: () => boolean;
}

export interface FpsSampler {
  stop(): void;
  state(): EffectsState;
}

/**
 * Counts animation frames; once per second passes the measured fps to stepEffects.
 * The elapsed time comes from the injected clock, not from the nominal 1000 ms.
 */
export function startFpsSampler(opts: FpsSamplerOptions): FpsSampler {
  const clock = opts.clock ?? realFrameClock;
  const isVisible = opts.isVisible ?? (() => typeof document === 'undefined' || document.visibilityState !== 'hidden');
  let state = opts.initial ?? initialEffects();
  let frames = 0;
  let lastMs = clock.nowMs();
  let stopped = false;
  let raf: unknown = null;

  const frame = () => {
    if (stopped) return;
    frames += 1;
    raf = clock.requestAnimationFrame(frame);
  };
  raf = clock.requestAnimationFrame(frame);

  const timer = clock.setInterval(() => {
    const now = clock.nowMs();
    const elapsed = now - lastMs;
    const counted = frames;
    frames = 0;
    lastMs = now;
    if (elapsed <= 0 || !isVisible()) return;
    const fps = counted / (elapsed / 1000);
    state = stepEffects(state, fps, now);
    opts.onState(state, fps);
  }, FPS_SAMPLE_MS);

  return {
    stop() {
      stopped = true;
      clock.clearInterval(timer);
      if (raf !== null) clock.cancelAnimationFrame(raf);
    },
    state: () => state,
  };
}

/** Sampler wired to the map: each sample re-applies the effects left on the ladder. */
export function startMapFpsSampler(
  map: LayerMap,
  getReduced: () => boolean,
  clock?: FrameClock,
  isVisible?: () => boolean,
): FpsSampler {
  return startFpsSampler({
    clock,
    isVisible,
    initial: { active: EFFECT_LADDER, belowSinceMs: null },
    onState: (s) => applyEffects(map, { reduced: getReduced(), active: s.active }),
  });
}
