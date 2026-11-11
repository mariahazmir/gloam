import type { StyleSpecification } from 'maplibre-gl';
import { NIGHT } from '../visual/palette';

// Bundled dark base style (Requirements 5.1, 5.3, 13.5). Pure: no I/O.
// Tiles come only through the TileJSON URL below. Never hardcode a tile URL:
// it carries a changing version folder. The style has no `glyphs`, no `sprite`,
// no symbol layers and no base building layer (buildings are drawn by layers.ts).

export const OPENFREEMAP_TILEJSON_URL = 'https://tiles.openfreemap.org/planet';
export const BASE_SOURCE_ID = 'openmaptiles';

/** Always-visible attribution, one string per part (Requirement 5.3). */
export const ATTRIBUTION_HTML: ReadonlyArray<string> = [
  '<a href="https://openfreemap.org" target="_blank" rel="noopener">OpenFreeMap</a>',
  '<a href="https://www.openmaptiles.org/" target="_blank" rel="noopener">© OpenMapTiles</a>',
  'Data from <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>',
  '© OpenStreetMap contributors',
];

/** Ids of the base layers, used by tileWatch to hide them (task 13.3). */
export const BASE_LAYER_IDS: ReadonlyArray<string> = [
  'base-landcover',
  'base-landuse',
  'base-park',
  'base-water',
  'base-waterway',
  'base-transportation',
];

export const BACKGROUND_LAYER_ID = 'background';

export function buildStyle(): StyleSpecification {
  const source = BASE_SOURCE_ID;
  return {
    version: 8,
    sources: {
      [BASE_SOURCE_ID]: {
        type: 'vector',
        url: OPENFREEMAP_TILEJSON_URL,
        attribution: ATTRIBUTION_HTML.join(' '),
      },
    },
    layers: [
      // Only the two night-gradient ends are used. Land is the lighter end laid over
      // the darker background at different opacities; water is left at the background
      // colour so it reads as the darkest area. Accent colours are kept for the tiers.
      { id: BACKGROUND_LAYER_ID, type: 'background', paint: { 'background-color': NIGHT.bottom } },
      {
        id: 'base-landcover', type: 'fill', source, 'source-layer': 'landcover',
        paint: { 'fill-color': NIGHT.top, 'fill-opacity': 0.25 },
      },
      {
        id: 'base-landuse', type: 'fill', source, 'source-layer': 'landuse',
        paint: { 'fill-color': NIGHT.top, 'fill-opacity': 0.3 },
      },
      {
        id: 'base-park', type: 'fill', source, 'source-layer': 'park',
        paint: { 'fill-color': NIGHT.top, 'fill-opacity': 0.55 },
      },
      {
        id: 'base-water', type: 'fill', source, 'source-layer': 'water',
        paint: { 'fill-color': NIGHT.bottom },
      },
      {
        id: 'base-waterway', type: 'line', source, 'source-layer': 'waterway',
        paint: { 'line-color': NIGHT.bottom, 'line-width': 1 },
      },
      {
        id: 'base-transportation', type: 'line', source, 'source-layer': 'transportation',
        paint: { 'line-color': NIGHT.top, 'line-width': 0.6 },
      },
    ],
  };
}
