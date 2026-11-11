import { Map as MapLibreMap, setWorkerUrl } from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import { requireFinite, requireLatLon } from '../validation/guards';
import { buildStyle } from './style';

// MapLibre finds its worker file next to its own module (via import.meta.url). Vite moves
// the module in dev pre-bundling and into one bundle in the build, so that file is not
// found ("Worker failed to load") and no GeoJSON layer is drawn. Handing MapLibre the
// worker as a Vite asset URL works in dev and in the hosted build, including a /gloam/ base.
setWorkerUrl(workerUrl);

// Thin shell around the MapLibre map (Requirements 5.1, 5.3, 5.4).

export const MAX_PITCH = 60;

export interface MapViewOptions {
  container: HTMLElement;
  center: readonly [lon: number, lat: number];
  zoom: number;
}

export function createMapView(opts: MapViewOptions): MapLibreMap {
  requireLatLon('center', opts.center[0], opts.center[1]);
  requireFinite('zoom', opts.zoom);
  return new MapLibreMap({
    container: opts.container,
    style: buildStyle(),
    center: [opts.center[0], opts.center[1]],
    zoom: opts.zoom,
    pitch: 0,
    maxPitch: MAX_PITCH,
    // compact: false keeps the attribution open, never collapsed behind a button.
    attributionControl: { compact: false },
  });
}
