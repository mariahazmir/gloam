import 'maplibre-gl/dist/maplibre-gl.css';
import { STRINGS } from './content/strings';
import { boundsOf } from './geo/bounds';
import { buildGraph, type StreetGraph } from './graph/build';
import { buildSnapIndex, packBounds, snap } from './graph/snap';
import {
  addGloamLayers,
  applyEffects,
  removeGloamLayers,
  setBuildings,
  setMarkers,
  setRoute,
  startFlicker,
  type LayerEffects,
  type LayerSegment,
} from './map/layers';
import { createMapView } from './map/mapView';
import { loadPack } from './net/packLoader';
import { loadSampleData } from './net/sampleLoader';
import { FIRST_RUN_PACK, MANIFEST, SAMPLE_DATA_URL, type ManifestEntry, type PackId } from './pack/manifest';
import type { SampleCorrection } from './pack/sampleData';
import { medianConfidence } from './routing/costs';
import { heartbeatSeries, lowConfidenceThreshold } from './routing/heartbeat';
import type { PlanPack } from './routing/planner';
import { routeCoordinates } from './routing/routeGeometry';
import { compareStats } from './routing/summary';
import type { Override } from './scoring/overrides';
import { assignTiers } from './scoring/tiers';
import { createInitialState } from './state/appState';
import { createPlanController } from './state/planController';
import { browserStorage } from './storage/keyValueStorage';
import { createLocalSettingsStore } from './storage/localSettingsStore';
import type { PackMeta, Segment, Tier } from './types';
import { createCityPicker } from './ui/cityPicker';
import { createGuidance } from './ui/guidance';
import { createMapCorner } from './ui/mapCorner';
import { createPlanControls } from './ui/planControls';
import { createRoutePanel } from './ui/routePanel';
import { createShell } from './ui/shell';
import { createAboutDialog, createGuessDialog } from './ui/infoDialogs';
import { createTools } from './ui/tools';
import { el } from './ui/dom';
import { hostedDefault, prefersReducedMotion } from './state/firstRun';
import validationRaw from '../../docs/validation.md?raw';
import { EFFECT_LADDER } from './visual/effects';

// Wiring (task 14.7), for what exists so far: the map, the first-run Seattle pack drawn from
// its Segment_File, the flicker cohorts, then the Street_Graph built after first paint, the
// Sample_Walk and the buildings. Plan_Mode controls, taps, the route panel and the lantern
// route layer follow the plan controller's state. About, the guess screen, Legend, Demo_Mode,
// Reset and the Reduced_Effects switch are task 14.6. Report_Mode comes with task 14.5.

/** Camera when a pack is fitted. maxPitch (60) stays in mapView.ts. */
const FIT_PITCH = 45;
const FIT_BEARING = -15;

const root = document.getElementById('app');
if (!root) throw new Error('app: missing #app element');

const shell = createShell(root);

// First-run values: Reduced_Effects_Mode follows the system setting at load (Requirement 4.9) and
// Demo_Mode is on only in the hosted build (14.2, 17.11). The Reset_Control returns to these.
const reduced = prefersReducedMotion(window);
const hostedDemo = hostedDefault(import.meta.env.VITE_GLOAM_HOSTED);
document.documentElement.classList.toggle('reduced-effects', reduced);
/** Mutated by the Reduced_Effects switch; the flicker timer and layer calls read it each time. */
const effects: LayerEffects = { reduced, active: EFFECT_LADDER };
/** Reported while no street layers exist, so the flicker timer does nothing. */
const NO_LAYERS: LayerEffects = { reduced: true, active: [] };

const firstEntry = entryOf(FIRST_RUN_PACK);
const map = createMapView({
  container: shell.mapContainer,
  center: firstEntry.sampleWalk.start,
  zoom: 12,
});
// Register straight away: the inline style loads without waiting for any tile.
const styleReady = new Promise<void>((resolve) => map.once('style.load', () => resolve()));

const corner = createMapCorner(shell.cornerHost);
const picker = createCityPicker(shell.pickerHost, {
  entries: MANIFEST,
  statusHost: shell.panel,
  captionHost: shell.captionHost,
  onChoose: (id) => loadCity(entryOf(id)),
});

/** The one pack held in memory. `complete` is false while only its Segment_File has arrived. */
interface Shown {
  id: PackId;
  segments: Segment[];
  tiers: ReadonlyMap<string, Tier>;
  graph: StreetGraph | null;
  /** Routing data; null until the graph is built (or when the pack has no usable street). */
  plan: PlanPack | null;
  /** Lowest-quarter confidence of the pack's estimated segments, for the Heartbeat_Chart. */
  lowConfThreshold: number | null;
  complete: boolean;
}

let shown: Shown | null = null;
let activeLoad: { cancel(): void } | null = null;
let loadCounter = 0;
let flickerStarted = false;
/** True while the Gloam layers (and so the route source) are on the map. */
let layersReady = false;
/** False until the first pack has finished, so a point set before then is not overwritten. */
let anyPackCompleted = false;

// ---- Plan_Mode: state, controls, route panel ---------------------------------

const EMPTY_OVERRIDES: ReadonlyMap<string, Override> = new Map<string, Override>();
const controller = createPlanController({
  initial: createInitialState({ reducedEffects: reduced, demo: hostedDemo }),
  getPack: () => shown?.plan ?? null,
  getOverrides: () => EMPTY_OVERRIDES,
  getMapCenter: () => {
    const c = map.getCenter().wrap();
    return { lon: c.lng, lat: c.lat };
  },
  settingsStore: createLocalSettingsStore(browserStorage()),
  // Reading the property does not ask for permission; only a tap on "use my location" does.
  geolocation: typeof navigator === 'undefined' ? null : navigator.geolocation,
});

const guidanceHost = el('div');
const routeHost = el('div', { className: 'route-host' });
shell.panel.append(guidanceHost, routeHost);
createGuidance(guidanceHost, controller);
createPlanControls({ host: shell.panel, crosshairHost: shell.crosshairHost, controller });
const routePanel = createRoutePanel(routeHost);

// ---- Legend, Demo_Mode, Reduced_Effects switch, About, guess screen, Reset ------

const about = createAboutDialog();
const guess = createGuessDialog(validationRaw);

/** Reset_Control (Requirement 17.13): synchronous, so it finishes well inside 1 second. */
function resetToFirstRun(): void {
  const walk = (shown !== null ? entryOf(shown.id) : firstEntry).sampleWalk;
  controller.dispatch({
    type: 'showExample',
    start: { lon: walk.start[0], lat: walk.start[1] },
    end: { lon: walk.end[0], lat: walk.end[1] },
  });
  controller.dispatch({ type: 'setDemo', demo: hostedDemo });
  controller.dispatch({ type: 'setReducedEffects', reducedEffects: reduced });
}

const tools = createTools({
  host: shell.panel,
  controller,
  onAbout: () => about.open(),
  onGuess: () => guess.open(),
  onReset: resetToFirstRun,
});

/** Sample_Data held while Demo_Mode is on. The Dark_Spot_List and overlays (task 14.5) read it. */
let sampleCorrections: ReadonlyArray<SampleCorrection> = [];
let demoApplied = false;
let demoRequest = 0;

controller.subscribe(({ state }) => {
  // Reduced_Effects switch: applied at once, with no reload (Requirement 4.11).
  if (state.reducedEffects !== effects.reduced) {
    effects.reduced = state.reducedEffects;
    document.documentElement.classList.toggle('reduced-effects', state.reducedEffects);
    if (layersReady) applyEffects(map, effects);
  }
  // Demo_Mode: load Sample_Data when it turns on, drop it when it turns off (Requirements 14.3 to 14.6).
  if (state.demo === demoApplied) return;
  demoApplied = state.demo;
  const mine = ++demoRequest;
  if (!state.demo) {
    sampleCorrections = [];
    tools.showDemoError(false);
    return;
  }
  void loadSampleData(true, SAMPLE_DATA_URL, window.fetch.bind(window)).then((loaded) => {
    if (mine !== demoRequest) return; // switched again while loading
    // The loader gives an empty list when the file is missing or invalid, and a real file is never empty.
    if (loaded.length === 0) {
      tools.showDemoError(true);
      demoApplied = false;
      controller.dispatch({ type: 'setDemo', demo: false }); // keep Demo_Mode off (Requirement 14.6)
      return;
    }
    sampleCorrections = loaded;
    tools.showDemoError(false);
  });
});

// A tap on the map sets a point in Plan_Mode; the reducer ignores it for points in Report_Mode.
map.on('click', (e) => {
  const p = e.lngLat.wrap();
  controller.dispatch({ type: 'tap', lon: p.lng, lat: p.lat });
});

/** The Sample_Walk is fitted once per showing (Requirement 17.7). */
let fittedFor: object | null = null;

controller.subscribe(({ state, outcome }) => {
  const pack = shown;
  // Markers appear as soon as a point is set: snapped when the graph is ready, else where tapped.
  if (layersReady) {
    const index = pack?.plan?.index ?? null;
    setMarkers(map, state.start, state.end, index === null ? undefined : (p) => snap(index, p.lon, p.lat));
  }
  if (outcome.kind === 'route' && pack !== null && pack.graph !== null && pack.plan !== null) {
    const graph = pack.graph;
    const tierOf = (edge: number): Tier => pack.tiers.get(graph.edges[edge]!.segmentId) ?? 'typical';
    const line = routeCoordinates(graph, outcome.gloam);
    if (layersReady) setRoute(map, line);
    routePanel.show({
      comparison: compareStats(outcome.gloam, outcome.shortest, tierOf),
      series: heartbeatSeries(outcome.gloam, pack.lowConfThreshold, {
        settings: state.settings,
        medianConfidence: pack.plan.medianConfidence,
      }),
    });
    if (state.exampleActive && state.start !== null && state.end !== null && fittedFor !== state.start) {
      fittedFor = state.start;
      const ends: Array<[number, number]> = [
        [state.start.lon, state.start.lat],
        [state.end.lon, state.end.lat],
      ];
      const bounds = boundsOf([...line.map((p): [number, number] => [p[0], p[1]]), ...ends]);
      map.fitBounds([bounds.sw, bounds.ne], { padding: 40, maxZoom: 17, duration: 0, pitch: FIT_PITCH, bearing: FIT_BEARING });
    }
    return;
  }
  if (layersReady) setRoute(map, null);
  routePanel.show(null);
  if (!state.exampleActive) fittedFor = null;
});

function entryOf(id: PackId): ManifestEntry {
  const entry = MANIFEST.find((e) => e.id === id);
  if (!entry) throw new Error(`manifest: no entry for ${id}`);
  return entry;
}

/** Draws a pack's streets, replacing whatever is shown, and fits the view to the pack. */
async function drawStreets(id: PackId, meta: PackMeta, segments: Segment[]): Promise<Shown> {
  await styleReady;
  if (shown !== null) removeGloamLayers(map);
  const tiers = assignTiers(segments);
  const layerSegments: LayerSegment[] = segments.map((s) => ({
    id: s.id,
    tier: tiers.get(s.id) ?? 'typical',
    confidence: s.confidence,
    coordinates: s.coordinates,
  }));
  addGloamLayers(map, layerSegments, effects);
  layersReady = true;
  const next: Shown = { id, segments, tiers, graph: null, plan: null, lowConfThreshold: null, complete: false };
  shown = next; // the previous pack's data is released here
  controller.refresh(); // drops the old pack from the planner and clears the route
  const bounds = boundsOf(segments.flatMap((s) => s.coordinates));
  map.fitBounds([bounds.sw, bounds.ne], { padding: 24, maxZoom: 17, duration: 0, pitch: FIT_PITCH, bearing: FIT_BEARING });
  corner.show(meta);
  about.setCity(meta);
  picker.setActive(id);
  if (!flickerStarted) {
    flickerStarted = true;
    startFlicker(map, () => (shown === null ? NO_LAYERS : effects));
  }
  return next;
}

/** Builds the graph after the street layer has had a chance to paint. */
function buildGraphAfterPaint(target: Shown): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() =>
      setTimeout(() => {
        if (shown === target) {
          const { graph, rejected } = buildGraph(target.segments);
          target.graph = graph;
          if (rejected.length > 0) console.warn(`graph: skipped ${rejected.length} segment(s)`, rejected);
        }
        resolve();
      }, 0),
    );
  });
}

/** Routing data for a pack whose graph is built: snap index, bounds, median confidence, low-confidence threshold. */
function preparePlan(target: Shown): void {
  const graph = target.graph;
  if (graph === null || graph.edges.length === 0) return;
  target.plan = {
    graph,
    index: buildSnapIndex(graph),
    bounds: packBounds(target.segments),
    medianConfidence: medianConfidence(graph),
  };
  target.lowConfThreshold = lowConfidenceThreshold(
    target.segments.filter((s) => s.labelSource === 'estimated').map((s) => s.confidence),
  );
}

/**
 * Shows the loaded pack's Sample_Walk, replacing the points of any earlier pack.
 * On the first load a point the user already set is left alone.
 */
function showSampleWalk(entry: ManifestEntry): void {
  const { state } = controller.getSnapshot();
  const userSetPoint = !state.exampleActive && (state.start !== null || state.end !== null);
  const skip = !anyPackCompleted && userSetPoint;
  anyPackCompleted = true;
  if (skip) {
    controller.refresh();
    return;
  }
  const [start, end] = [entry.sampleWalk.start, entry.sampleWalk.end];
  controller.dispatch({
    type: 'showExample',
    start: { lon: start[0], lat: start[1] },
    end: { lon: end[0], lat: end[1] },
  });
}

function discardPartial(): void {
  if (shown === null || shown.complete) return;
  removeGloamLayers(map);
  layersReady = false;
  shown = null;
  controller.refresh();
  corner.clear();
  about.setCity(null);
  picker.setActive(null);
}

function loadCity(entry: ManifestEntry): void {
  activeLoad?.cancel();
  const mine = ++loadCounter;
  const current = () => mine === loadCounter;
  picker.showLoading(entry);

  // Assigned inside the onSegments callback below, so the cast keeps TypeScript from narrowing it to null.
  let early = null as Promise<Shown> | null;
  const load = loadPack(entry, window.fetch.bind(window), {
    // With no complete pack on screen, the street layer goes up as soon as the Segment_File is in.
    onSegments: ({ meta, segments }) => {
      if (!current() || (shown !== null && shown.complete)) return;
      early = drawStreets(entry.id, meta, segments);
    },
  });
  activeLoad = load;

  void load.result.then(async (result) => {
    if (!current()) return; // a newer choice took over
    if (!result.ok) {
      if (result.cancelled) return;
      await early;
      const hadPrevious = shown !== null && shown.complete;
      discardPartial();
      const { file, kind } = result.problem;
      const message = STRINGS.templates.packProblem.text(entry.label, entry.id, file, kind);
      picker.showProblem(entry.id, hadPrevious ? `${message} ${STRINGS.errors.previousKept.text}` : message);
      return;
    }

    const { pack } = result;
    const target = early ? await early : await drawStreets(pack.id, pack.meta, pack.segments);
    if (!current()) return;
    target.complete = true;
    picker.clearStatus();
    await buildGraphAfterPaint(target);
    if (!current() || shown !== target) return;
    preparePlan(target);
    showSampleWalk(entry);
    setBuildings(map, pack.buildings, effects);
    for (const problem of pack.skippedBuildings) console.error('buildings: skipped', problem);
  }).catch((error: unknown) => {
    // Anything unexpected while drawing: say so and offer Retry instead of leaving the spinner up.
    console.error(error);
    if (current()) picker.showProblem(entry.id, STRINGS.errors.packFile.text);
  });
}

loadCity(firstEntry);
