import { DEFAULT_SETTINGS } from '../routing/costs';
import type { PersonalSettings } from '../routing/costs';
import { ArgumentError } from '../validation/errors';
import { requireLambda, requireLatLon } from '../validation/guards';

export type Mode = 'plan' | 'report';
export type SettingState = 'start' | 'end';

export interface LonLat {
  lon: number;
  lat: number;
}

export interface AppState {
  mode: Mode;
  settingState: SettingState;
  start: LonLat | null;
  end: LonLat | null;
  /** True while the points shown are the bundled Sample_Walk example. */
  exampleActive: boolean;
  lambda: number;
  settings: PersonalSettings;
  reducedEffects: boolean;
  demo: boolean;
  selectedSegmentId: string | null;
}

export const DEFAULT_LAMBDA = 3;

export interface InitialOptions {
  /** Sample_Walk start and end; when given, the example is active (first run). */
  example?: { start: LonLat; end: LonLat } | null;
  reducedEffects?: boolean;
  demo?: boolean;
}

export type AppAction =
  | { type: 'tap'; lon: number; lat: number; segmentId?: string | null }
  | { type: 'setStartHere'; lon: number; lat: number }
  | { type: 'setEndHere'; lon: number; lat: number }
  | { type: 'useLocation'; lon: number; lat: number }
  | { type: 'switchMode'; mode: Mode }
  | { type: 'chooseSettingState'; settingState: SettingState }
  | { type: 'clearExample' }
  | { type: 'showExample'; start: LonLat; end: LonLat }
  | { type: 'setLambda'; lambda: number }
  | { type: 'setSettings'; settings: PersonalSettings }
  | { type: 'setDemo'; demo: boolean }
  | { type: 'setReducedEffects'; reducedEffects: boolean }
  | ({ type: 'reset' } & InitialOptions);

/** First-run state: Plan_Mode, Start_Setting_State (Requirement 6.1). */
export function createInitialState(opts: InitialOptions = {}): AppState {
  const example = opts.example ?? null;
  return {
    mode: 'plan',
    settingState: 'start',
    start: example ? { ...example.start } : null,
    end: example ? { ...example.end } : null,
    exampleActive: example !== null,
    lambda: DEFAULT_LAMBDA,
    settings: { ...DEFAULT_SETTINGS },
    reducedEffects: opts.reducedEffects ?? false,
    demo: opts.demo ?? false,
    selectedSegmentId: null,
  };
}

/** Setting a point while the Sample_Walk shows clears it first (Requirement 17.17). */
function withoutExample(state: AppState): AppState {
  return state.exampleActive ? { ...state, start: null, end: null, exampleActive: false } : state;
}

/**
 * Setting state after a point is set: the unset point's state when exactly one of
 * start and end is unset, otherwise the prior state (Requirements 6.1, 17.17).
 */
function settingStateFor(start: LonLat | null, end: LonLat | null, prior: SettingState): SettingState {
  if (start === null && end !== null) return 'start';
  if (end === null && start !== null) return 'end';
  return prior;
}

function setStart(state: AppState, name: string, lon: number, lat: number): AppState {
  requireLatLon(name, lon, lat);
  const base = withoutExample(state);
  const start = { lon, lat };
  return { ...base, start, settingState: settingStateFor(start, base.end, state.settingState) };
}

function setEnd(state: AppState, name: string, lon: number, lat: number): AppState {
  requireLatLon(name, lon, lat);
  const base = withoutExample(state);
  const end = { lon, lat };
  return { ...base, end, settingState: settingStateFor(base.start, end, state.settingState) };
}

/** Pure reducer. Snapping and routing happen in effects, not here. */
export function reduce(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'tap': {
      requireLatLon('tap', action.lon, action.lat);
      if (state.mode === 'report') {
        // Report_Mode taps select a segment and never move points (Requirement 10.1).
        return { ...state, selectedSegmentId: action.segmentId ?? null };
      }
      // Plan_Mode taps never select a segment (Requirement 6.11).
      return state.settingState === 'start'
        ? setStart(state, 'tap', action.lon, action.lat)
        : setEnd(state, 'tap', action.lon, action.lat);
    }
    case 'setStartHere':
      return setStart(state, 'start', action.lon, action.lat);
    case 'setEndHere':
      return setEnd(state, 'end', action.lon, action.lat);
    case 'useLocation':
      return setStart(state, 'location', action.lon, action.lat);
    case 'switchMode':
      if (action.mode !== 'plan' && action.mode !== 'report') {
        throw new ArgumentError('mode', `must be 'plan' or 'report', got ${String(action.mode)}`);
      }
      return { ...state, mode: action.mode, selectedSegmentId: action.mode === 'plan' ? null : state.selectedSegmentId };
    case 'chooseSettingState':
      if (action.settingState !== 'start' && action.settingState !== 'end') {
        throw new ArgumentError('settingState', `must be 'start' or 'end', got ${String(action.settingState)}`);
      }
      return { ...state, settingState: action.settingState };
    case 'clearExample':
      return {
        ...state,
        mode: 'plan',
        settingState: 'start',
        start: null,
        end: null,
        exampleActive: false,
        selectedSegmentId: null,
      };
    case 'showExample':
      // A pack finished loading: show its Sample_Walk. Lambda, settings and the other switches stay.
      requireLatLon('example start', action.start.lon, action.start.lat);
      requireLatLon('example end', action.end.lon, action.end.lat);
      return {
        ...state,
        mode: 'plan',
        settingState: 'start',
        start: { ...action.start },
        end: { ...action.end },
        exampleActive: true,
        selectedSegmentId: null,
      };
    case 'setLambda':
      // Rejects NaN, infinite and out-of-range values; the state is then unchanged (Requirement 7.10).
      return { ...state, lambda: requireLambda(action.lambda) };
    case 'setSettings':
      return { ...state, settings: { ...action.settings } };
    case 'setDemo':
      return { ...state, demo: action.demo };
    case 'setReducedEffects':
      return { ...state, reducedEffects: action.reducedEffects };
    case 'reset': {
      const { type: _type, ...opts } = action;
      return createInitialState(opts);
    }
  }
}
