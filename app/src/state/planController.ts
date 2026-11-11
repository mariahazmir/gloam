import { StoreError } from '../corrections/store';
import type { GeolocationLike } from '../net/geolocation';
import { getCurrentLocation } from '../net/geolocation';
import { createPlanner } from '../routing/planner';
import type { PlanInput, PlanOutcome, PlanPack, Planner } from '../routing/planner';
import type { PersonalSettings } from '../routing/costs';
import type { Override } from '../scoring/overrides';
import type { SettingsStore } from '../storage/localSettingsStore';
import { requireLambda } from '../validation/guards';
import { reduce } from './appState';
import type { AppAction, AppState, LonLat } from './appState';
import { limitRate, SLIDER_INTERVAL_MS } from './rateLimit';
import type { RateLimited } from './rateLimit';

// Plan_Mode state plus the effects that follow a state change: snapping and routing
// (Requirements 6.5, 6.6, 6.8), saving settings (8.5 to 8.7), "use my location" (6.2, 6.3)
// and the Lambda slider (7.1, 7.10). Nothing here sends a coordinate anywhere.

export interface Notices {
  /** Settings could not be read or saved (Requirement 8.7). */
  settings: boolean;
  /** The device position could not be found (Requirement 6.3). */
  location: boolean;
  /** A Lambda value was rejected and the previous one kept (Requirement 7.10). */
  number: boolean;
}

export interface PlanSnapshot {
  state: AppState;
  outcome: PlanOutcome;
  notices: Notices;
}

export interface PlanControllerOptions {
  initial: AppState;
  /** The loaded pack's routing data, or null while there is none (or the graph is still being built). */
  getPack: () => PlanPack | null;
  getOverrides: () => ReadonlyMap<string, Override>;
  /** Map centre, for "Set start here" and "Set end here". */
  getMapCenter: () => LonLat;
  settingsStore: SettingsStore;
  geolocation: GeolocationLike | undefined | null;
  /** Defaults to one recompute per 100 ms while the slider is dragged. */
  sliderIntervalMs?: number;
  planner?: Planner;
}

export interface PlanController {
  getSnapshot(): PlanSnapshot;
  /** Calls `listener` now and after every change. Returns the unsubscribe function. */
  subscribe(listener: (snapshot: PlanSnapshot) => void): () => void;
  dispatch(action: AppAction): void;
  setStartHere(): void;
  setEndHere(): void;
  useMyLocation(): Promise<void>;
  /** Slider input. A bad value is rejected at once; a good one is applied at most once per interval. */
  requestLambda(value: number): void;
  changeSettings(next: PersonalSettings): void;
  /** Plan again after the pack, its graph or the overrides changed. */
  refresh(): void;
}

export function createPlanController(opts: PlanControllerOptions): PlanController {
  const planner = opts.planner ?? createPlanner();
  const listeners = new Set<(s: PlanSnapshot) => void>();
  const notices: Notices = { settings: false, location: false, number: false };

  let state = opts.initial;
  // Saved settings are restored before the first route is planned (Requirement 8.6).
  try {
    state = reduce(state, { type: 'setSettings', settings: opts.settingsStore.load() });
  } catch (error) {
    if (!(error instanceof StoreError)) throw error;
    notices.settings = true; // continue with the in-memory settings
  }

  /** The inputs of the last plan, compared by reference or value to decide whether to plan again. */
  let planned: { input: PlanInput; outcome: PlanOutcome } | null = null;

  const outcomeNow = (force: boolean): PlanOutcome => {
    const key: PlanInput = {
      pack: opts.getPack(),
      overrides: opts.getOverrides(),
      start: state.start,
      end: state.end,
      lambda: state.lambda,
      settings: state.settings,
    };
    const p = planned?.input;
    if (
      !force &&
      planned !== null &&
      p !== undefined &&
      p.pack === key.pack &&
      p.overrides === key.overrides &&
      p.start === key.start &&
      p.end === key.end &&
      p.lambda === key.lambda &&
      p.settings === key.settings
    ) {
      return planned.outcome; // mode and setting-state changes do not touch the route
    }
    const outcome = planner.plan(key);
    planned = { input: key, outcome };
    return outcome;
  };

  let snapshot: PlanSnapshot = { state, outcome: outcomeNow(true), notices: { ...notices } };

  const publish = (force = false): void => {
    snapshot = { state, outcome: outcomeNow(force), notices: { ...notices } };
    for (const l of [...listeners]) l(snapshot);
  };

  const dispatch = (action: AppAction): void => {
    state = reduce(state, action);
    if (action.type === 'tap' || action.type === 'setStartHere' || action.type === 'setEndHere') {
      notices.location = false;
    }
    publish();
  };

  const applyLambda: RateLimited<number> = limitRate((value: number) => {
    notices.number = false;
    dispatch({ type: 'setLambda', lambda: value });
  }, opts.sliderIntervalMs ?? SLIDER_INTERVAL_MS);

  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      listener(snapshot);
      return () => {
        listeners.delete(listener);
      };
    },
    dispatch,
    setStartHere() {
      const c = opts.getMapCenter();
      dispatch({ type: 'setStartHere', lon: c.lon, lat: c.lat });
    },
    setEndHere() {
      const c = opts.getMapCenter();
      dispatch({ type: 'setEndHere', lon: c.lon, lat: c.lat });
    },
    async useMyLocation() {
      const result = await getCurrentLocation(opts.geolocation);
      if (!result.ok) {
        // The existing start point stays as it is (Requirement 6.3).
        notices.location = true;
        publish();
        return;
      }
      notices.location = false;
      dispatch({ type: 'useLocation', lon: result.lon, lat: result.lat });
    },
    requestLambda(value) {
      try {
        requireLambda(value);
      } catch {
        applyLambda.cancel();
        notices.number = true; // the previous value stays in the state and on the slider
        publish();
        return;
      }
      applyLambda(value);
    },
    changeSettings(next) {
      dispatch({ type: 'setSettings', settings: next });
      try {
        opts.settingsStore.save(state.settings);
        notices.settings = false;
      } catch (error) {
        if (!(error instanceof StoreError)) throw error;
        notices.settings = true; // the toggles and routing keep working in memory
      }
      publish();
    },
    refresh() {
      publish(true);
    },
  };
}
