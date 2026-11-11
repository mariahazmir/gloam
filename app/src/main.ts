import 'maplibre-gl/dist/maplibre-gl.css';
import { STRINGS } from './content/strings';
import { boundsOf } from './geo/bounds';
import { buildGraph, type StreetGraph } from './graph/build';
import {
  addGloamLayers,
  removeGloamLayers,
  setBuildings,
  startFlicker,
  type LayerEffects,
  type LayerSegment,
} from './map/layers';
import { createMapView } from './map/mapView';
import { loadPack } from './net/packLoader';
import { FIRST_RUN_PACK, MANIFEST, type ManifestEntry, type PackId } from './pack/manifest';
import { assignTiers } from './scoring/tiers';
import type { PackMeta, Segment } from './types';
import { createCityPicker } from './ui/cityPicker';
import { createMapCorner } from './ui/mapCorner';
import { createShell } from './ui/shell';
import { EFFECT_LADDER } from './visual/effects';

// Minimal wiring (part of task 14.7): the map, the first-run Seattle pack drawn from
// its Segment_File, the flicker cohorts, then the Street_Graph built after first paint
// and the buildings. No routing UI yet.

/** Camera when a pack is fitted. maxPitch (60) stays in mapView.ts. */
const FIT_PITCH = 45;
const FIT_BEARING = -15;

const root = document.getElementById('app');
if (!root) throw new Error('app: missing #app element');

const shell = createShell(root);

// Reduced_Effects_Mode follows the system setting until the switch exists (task 14.6).
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
document.documentElement.classList.toggle('reduced-effects', reduced);
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
  graph: StreetGraph | null;
  complete: boolean;
}

let shown: Shown | null = null;
let activeLoad: { cancel(): void } | null = null;
let loadCounter = 0;
let flickerStarted = false;

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
  const next: Shown = { id, segments, graph: null, complete: false };
  shown = next; // the previous pack's data is released here
  const bounds = boundsOf(segments.flatMap((s) => s.coordinates));
  map.fitBounds([bounds.sw, bounds.ne], { padding: 24, maxZoom: 17, duration: 0, pitch: FIT_PITCH, bearing: FIT_BEARING });
  corner.show(meta);
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

function discardPartial(): void {
  if (shown === null || shown.complete) return;
  removeGloamLayers(map);
  shown = null;
  corner.clear();
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
    setBuildings(map, pack.buildings, effects);
    for (const problem of pack.skippedBuildings) console.error('buildings: skipped', problem);
  }).catch((error: unknown) => {
    // Anything unexpected while drawing: say so and offer Retry instead of leaving the spinner up.
    console.error(error);
    if (current()) picker.showProblem(entry.id, STRINGS.errors.packFile.text);
  });
}

loadCity(firstEntry);
