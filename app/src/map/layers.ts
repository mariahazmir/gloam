import type { LayerSpecification, SourceSpecification } from 'maplibre-gl';
import type { Tier } from '../types';
import type { Building, Position } from '../pack/parse';
import { ArgumentError } from '../validation/errors';
import { requireFinite, requireUnit } from '../validation/guards';
import { type Effect, EFFECT_LADDER } from '../visual/effects';
import { FLICKER_STEP_MS, flickerBrightness, flickerParams } from '../visual/flicker';
import { NIGHT, PALETTE } from '../visual/palette';
import {
  CONFIDENCE_BANDS,
  PHASES,
  TIERS,
  cohortKey,
  confidenceBand,
  phaseOf,
  tierStyle,
} from '../visual/tierStyles';

// Segment, building and route layers (Requirements 4.1 to 4.6, 4.11, 4.12, 5.2, 10.3).
// The style has no glyphs or sprite, so there are no symbol layers: the "your note"
// marker is a circle layer. Tiles are never named here; only GeoJSON sources are added.

export const SEGMENTS_SOURCE_ID = 'gloam-segments';
export const BUILDINGS_SOURCE_ID = 'gloam-buildings';
export const ROUTE_SOURCE_ID = 'gloam-route';

export const BUILDINGS_LAYER_ID = 'gloam-buildings-extrusion';
/** Buildings are drawn from this zoom up. */
export const BUILDINGS_MIN_ZOOM = 14;
export const NOTE_LAYER_ID = 'gloam-note';
export const ROUTE_CASING_LAYER_ID = 'gloam-route-casing';
/** The route layer. Always the last layer in the style (Requirement 4.6). */
export const ROUTE_LAYER_ID = 'gloam-route-line';

const ESTIMATED_TIERS: ReadonlyArray<Tier> = TIERS.filter((t) => tierStyle(t, false).flicker);
const FOG_TIERS: ReadonlyArray<Tier> = TIERS.filter((t) => tierStyle(t, false).fog);
const GLOW_TIERS: ReadonlyArray<Tier> = TIERS.filter((t) => tierStyle(t, false).glow);
const STATIC_TIERS: ReadonlyArray<Tier> = TIERS.filter((t) => !tierStyle(t, false).flicker);

export const glowLayerId = (t: Tier) => `gloam-glow-${t}`;
export const fogLayerId = (t: Tier) => `gloam-fog-${t}`;
export const staticLayerId = (t: Tier) => `gloam-static-${t}`;
export const cohortLayerId = (t: Tier, band: number, phase: number) => `gloam-flicker-${cohortKey(t, band, phase)}`;

/** Narrow view of the MapLibre map, so tests can pass a plain object. */
export interface LayerMap {
  addSource(id: string, source: SourceSpecification): unknown;
  addLayer(layer: LayerSpecification, beforeId?: string): unknown;
  removeLayer(id: string): unknown;
  removeSource(id: string): unknown;
  getLayer(id: string): unknown;
  getSource(id: string): unknown;
  setPaintProperty(layerId: string, name: string, value: unknown): unknown;
  setLayoutProperty(layerId: string, name: string, value: unknown): unknown;
  setFeatureState(feature: { source: string; id: string | number }, state: Record<string, unknown>): unknown;
}

interface DataSourceLike {
  setData(data: unknown): void;
}

export interface LayerSegment {
  id: string;
  tier: Tier;
  confidence: number;
  coordinates: ReadonlyArray<Position>;
}

export interface LayerEffects {
  reduced: boolean;
  /** Effects still on after load shedding (Requirement 5.6). */
  active: ReadonlyArray<Effect>;
}

export const FULL_EFFECTS: LayerEffects = { reduced: false, active: EFFECT_LADDER };

/** Numeric ids stay numbers, as in the shipped packs, so feature-state ids match (design). */
export function featureId(id: string): string | number {
  if (/^-?\d+$/.test(id)) {
    const n = Number(id);
    if (Number.isSafeInteger(n)) return n;
  }
  return id;
}

type FeatureCollection = { type: 'FeatureCollection'; features: unknown[] };

/** Properties: id (promoted), tier, conf, plus band and phase for the cohort filters. */
export function buildSegmentsGeoJSON(segments: ReadonlyArray<LayerSegment>): FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: segments.map((s) => {
      requireUnit(`confidence of segment ${s.id}`, s.confidence);
      return {
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: s.coordinates.map((p) => [p[0], p[1]]) },
        properties: {
          id: featureId(s.id),
          tier: s.tier,
          conf: s.confidence,
          band: confidenceBand(s.confidence),
          phase: phaseOf(s.id),
        },
      };
    }),
  };
}

export function buildBuildingsGeoJSON(buildings: ReadonlyArray<Building>): FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: buildings.map((b, i) => {
      requireFinite(`height_m of building ${i}`, b.heightM);
      if (b.heightM < 0) throw new ArgumentError('height_m', `must be 0 or more, got ${b.heightM}`);
      return {
        type: 'Feature',
        geometry: { type: 'Polygon', coordinates: b.rings.map((r) => r.map((p) => [p[0], p[1]])) },
        properties: { height_m: b.heightM },
      };
    }),
  };
}

function routeGeoJSON(coords: ReadonlyArray<Position> | null): FeatureCollection {
  if (coords === null || coords.length < 2) return { type: 'FeatureCollection', features: [] };
  return {
    type: 'FeatureCollection',
    features: [
      { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: coords.map((p) => [p[0], p[1]]) } },
    ],
  };
}

// ---- Flicker cohorts -------------------------------------------------------

export interface Cohort {
  layerId: string;
  tier: Tier;
  band: number;
  phase: number;
  seed: number;
}

/** The 27 flicker cohorts: 3 estimated Tiers x 3 confidence bands x 3 phases. */
export function cohorts(): Cohort[] {
  const out: Cohort[] = [];
  for (const tier of ESTIMATED_TIERS) {
    for (let band = 0; band < CONFIDENCE_BANDS; band++) {
      for (let phase = 0; phase < PHASES; phase++) {
        out.push({ layerId: cohortLayerId(tier, band, phase), tier, band, phase, seed: out.length + 1 });
      }
    }
  }
  return out;
}

/** Band centres 1/6, 1/2, 5/6 (design). Using the centre keeps every rate under the cap. */
export function bandCentre(band: number): number {
  return (2 * band + 1) / (2 * CONFIDENCE_BANDS);
}

/** Line opacity of one cohort at time tSeconds. Pure. */
export function cohortOpacity(c: Cohort, tSeconds: number): number {
  requireFinite('tSeconds', tSeconds);
  const conf = bandCentre(c.band);
  const offset = (c.phase / PHASES) * flickerParams(conf).meanIntervalS;
  return flickerBrightness(conf, c.seed, tSeconds + offset, tierStyle(c.tier, false).baseBrightness);
}

// ---- Layer specs -----------------------------------------------------------

function lineLayer(id: string, filter: unknown[], paint: Record<string, unknown>): LayerSpecification {
  return { id, type: 'line', source: SEGMENTS_SOURCE_ID, filter, paint } as unknown as LayerSpecification;
}

const tierIs = (t: Tier) => ['==', ['get', 'tier'], t];

/** Zoom stops and the width multiplier at each. One table for every tier and underlay. */
export const WIDTH_ZOOM_STOPS: ReadonlyArray<readonly [zoom: number, factor: number]> = [
  [11, 0.35],
  [13, 0.7],
  [15, 1],
  [17, 1.6],
];

/**
 * Line width that scales with zoom. MapLibre only allows a zoom expression at the top
 * of a property, so the multiplier is folded into each stop (width x factor) rather than
 * written as a product. Every tier gets the same factors, so widths that differ at one
 * zoom differ at all zooms, and the Reduced_Effects styles stay pairwise different.
 */
export function zoomWidth(width: number): unknown[] {
  requireFinite('width', width);
  const expr: unknown[] = ['interpolate', ['linear'], ['zoom']];
  for (const [zoom, factor] of WIDTH_ZOOM_STOPS) expr.push(zoom, width * factor);
  return expr;
}

function tierLinePaint(t: Tier, reduced: boolean): Record<string, unknown> {
  const st = tierStyle(t, reduced);
  const paint: Record<string, unknown> = {
    'line-color': st.color,
    'line-width': zoomWidth(st.width),
    'line-opacity': st.baseBrightness,
  };
  if (st.dash.length > 0) paint['line-dasharray'] = [...st.dash];
  return paint;
}

function underlayPaint(color: string, opacity: number): Record<string, unknown> {
  return { 'line-color': color, 'line-width': zoomWidth(10), 'line-blur': 6, 'line-opacity': opacity };
}

function segmentLayerSpecs(reduced: boolean): LayerSpecification[] {
  const specs: LayerSpecification[] = [];
  for (const t of FOG_TIERS) specs.push(lineLayer(fogLayerId(t), tierIs(t), underlayPaint(PALETTE.dusk, 0.35)));
  for (const t of GLOW_TIERS) specs.push(lineLayer(glowLayerId(t), tierIs(t), underlayPaint(PALETTE.lantern, 0.5)));
  for (const t of STATIC_TIERS) specs.push(lineLayer(staticLayerId(t), tierIs(t), tierLinePaint(t, reduced)));
  for (const c of cohorts()) {
    specs.push(
      lineLayer(
        c.layerId,
        ['all', tierIs(c.tier), ['==', ['get', 'band'], c.band], ['==', ['get', 'phase'], c.phase]],
        tierLinePaint(c.tier, reduced),
      ),
    );
  }
  return specs;
}

const NOTE_COLOR_OPACITY = ['case', ['boolean', ['feature-state', 'noted'], false], 1, 0];

function noteLayerSpec(): LayerSpecification {
  // Circle layers draw at each vertex of a line, so a noted street gets a ring of dots.
  return {
    id: NOTE_LAYER_ID,
    type: 'circle',
    source: SEGMENTS_SOURCE_ID,
    paint: {
      'circle-radius': 5,
      'circle-color': NIGHT.bottom,
      'circle-opacity': NOTE_COLOR_OPACITY,
      'circle-stroke-width': 2,
      'circle-stroke-color': PALETTE.pumpkin,
      'circle-stroke-opacity': NOTE_COLOR_OPACITY,
    },
  } as unknown as LayerSpecification;
}

function buildingsLayerSpec(): LayerSpecification {
  return {
    id: BUILDINGS_LAYER_ID,
    type: 'fill-extrusion',
    source: BUILDINGS_SOURCE_ID,
    minzoom: BUILDINGS_MIN_ZOOM,
    paint: {
      'fill-extrusion-color': NIGHT.top,
      'fill-extrusion-height': ['get', 'height_m'],
      'fill-extrusion-base': 0,
      'fill-extrusion-opacity': 0.85,
    },
  } as unknown as LayerSpecification;
}

function routeLayerSpecs(): LayerSpecification[] {
  return [
    {
      id: ROUTE_CASING_LAYER_ID,
      type: 'line',
      source: ROUTE_SOURCE_ID,
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': NIGHT.bottom, 'line-width': 11, 'line-opacity': 0.9 },
    },
    {
      id: ROUTE_LAYER_ID,
      type: 'line',
      source: ROUTE_SOURCE_ID,
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': PALETTE.lantern, 'line-width': 7, 'line-opacity': 1 },
    },
  ] as unknown as LayerSpecification[];
}

// ---- Public operations -----------------------------------------------------

const geojson = (data: FeatureCollection, extra: object = {}): SourceSpecification =>
  ({ type: 'geojson', data, ...extra }) as unknown as SourceSpecification;

/** First layer this module adds; buildings are inserted below it. */
function firstGloamLayerId(): string {
  return segmentLayerSpecs(false)[0]!.id;
}

/**
 * Adds the Segments source and layers, then the note marker, then the route
 * layers last (Requirement 4.6). Buildings, if given, go below the segments.
 */
export function addGloamLayers(
  map: LayerMap,
  segments: ReadonlyArray<LayerSegment>,
  effects: LayerEffects = FULL_EFFECTS,
  buildings: ReadonlyArray<Building> | null = null,
): void {
  map.addSource(SEGMENTS_SOURCE_ID, geojson(buildSegmentsGeoJSON(segments), { promoteId: 'id' }));
  map.addSource(ROUTE_SOURCE_ID, geojson(routeGeoJSON(null)));
  for (const spec of segmentLayerSpecs(effects.reduced)) map.addLayer(spec);
  map.addLayer(noteLayerSpec());
  for (const spec of routeLayerSpecs()) map.addLayer(spec);
  if (buildings !== null) setBuildings(map, buildings, effects);
  applyEffects(map, effects);
}

/** Adds or replaces the buildings, always below the segment layers (Requirement 5.2). */
export function setBuildings(
  map: LayerMap,
  buildings: ReadonlyArray<Building>,
  effects: LayerEffects = FULL_EFFECTS,
): void {
  const data = buildBuildingsGeoJSON(buildings);
  const existing = map.getSource(BUILDINGS_SOURCE_ID) as DataSourceLike | undefined;
  if (existing) {
    existing.setData(data);
    return;
  }
  map.addSource(BUILDINGS_SOURCE_ID, geojson(data));
  map.addLayer(buildingsLayerSpec(), firstGloamLayerId());
  applyEffects(map, effects);
}

/** Removes everything this module added (used when another pack is chosen). */
export function removeGloamLayers(map: LayerMap): void {
  const ids = [
    ROUTE_LAYER_ID,
    ROUTE_CASING_LAYER_ID,
    NOTE_LAYER_ID,
    ...cohorts().map((c) => c.layerId).reverse(),
    ...STATIC_TIERS.map(staticLayerId),
    ...GLOW_TIERS.map(glowLayerId),
    ...FOG_TIERS.map(fogLayerId),
    BUILDINGS_LAYER_ID,
  ];
  for (const id of ids) if (map.getLayer(id)) map.removeLayer(id);
  for (const id of [ROUTE_SOURCE_ID, BUILDINGS_SOURCE_ID, SEGMENTS_SOURCE_ID]) {
    if (map.getSource(id)) map.removeSource(id);
  }
}

const visibility = (on: boolean) => (on ? 'visible' : 'none');

/**
 * Applies Reduced_Effects_Mode and load shedding. Synchronous, so it takes effect
 * well inside 500 ms (Requirement 4.11). In reduced mode there is no glow, fog or
 * flicker; every segment sits at constant brightness (Requirement 4.12).
 */
export function applyEffects(map: LayerMap, effects: LayerEffects): void {
  const on = (e: Effect) => !effects.reduced && effects.active.includes(e);
  for (const t of GLOW_TIERS) map.setLayoutProperty(glowLayerId(t), 'visibility', visibility(on('glow')));
  for (const t of FOG_TIERS) map.setLayoutProperty(fogLayerId(t), 'visibility', visibility(on('fog')));
  if (map.getLayer(BUILDINGS_LAYER_ID)) {
    map.setLayoutProperty(BUILDINGS_LAYER_ID, 'visibility', visibility(effects.active.includes('extrusion')));
  }
  for (const t of TIERS) {
    const st = tierStyle(t, effects.reduced);
    const ids = t === 'confirmed_lit' || t === 'mapped_unlit'
      ? [staticLayerId(t)]
      : cohorts().filter((c) => c.tier === t).map((c) => c.layerId);
    for (const id of ids) {
      map.setPaintProperty(id, 'line-width', zoomWidth(st.width));
      map.setPaintProperty(id, 'line-opacity', st.baseBrightness);
    }
  }
}

/** Sets the opacity of all 27 cohort layers for time tSeconds. */
export function tickFlicker(map: LayerMap, tSeconds: number): void {
  for (const c of cohorts()) map.setPaintProperty(c.layerId, 'line-opacity', cohortOpacity(c, tSeconds));
}

export interface Timers {
  setInterval(fn: () => void, ms: number): unknown;
  clearInterval(handle: unknown): void;
  nowMs(): number;
}

const realTimers: Timers = {
  setInterval: (fn, ms) => globalThis.setInterval(fn, ms),
  clearInterval: (h) => globalThis.clearInterval(h as ReturnType<typeof setInterval>),
  nowMs: () => performance.now(),
};

/**
 * Updates the cohort opacities every 33 ms while flicker is on. When flicker is
 * off (reduced mode or shed by the fps ladder) a tick does nothing, and
 * `applyEffects` has already put the layers at constant brightness. Returns stop().
 */
export function startFlicker(
  map: LayerMap,
  getEffects: () => LayerEffects,
  timers: Timers = realTimers,
): () => void {
  const startMs = timers.nowMs();
  const handle = timers.setInterval(() => {
    const e = getEffects();
    if (e.reduced || !e.active.includes('flicker')) return;
    tickFlicker(map, (timers.nowMs() - startMs) / 1000);
  }, FLICKER_STEP_MS);
  return () => timers.clearInterval(handle);
}

/** Marks a segment as carrying the user's note (Requirement 10.3). No data is rebuilt. */
export function setNoted(map: LayerMap, id: string, noted: boolean): void {
  map.setFeatureState({ source: SEGMENTS_SOURCE_ID, id: featureId(id) }, { noted });
}

/** Shows the Gloam_Route, or clears it with null. */
export function setRoute(map: LayerMap, coords: ReadonlyArray<Position> | null): void {
  const src = map.getSource(ROUTE_SOURCE_ID) as DataSourceLike | undefined;
  if (!src) throw new ArgumentError('map', `has no source ${ROUTE_SOURCE_ID}; call addGloamLayers first`);
  src.setData(routeGeoJSON(coords));
}
