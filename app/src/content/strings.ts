// Every user-visible string in the app lives here. No other module holds a literal UI string.
// `kind` is 'lighting' for text that describes a segment's lighting, otherwise 'general'.
import type { PackFileKind, PackProblem } from '../pack/parse';
import type { Tier } from '../types';
import { requireUnit } from '../validation/guards';

export type StringKind = 'lighting' | 'general';
export interface Str {
  readonly kind: StringKind;
  readonly text: string;
}
export interface Tpl<A extends unknown[]> {
  readonly kind: StringKind;
  readonly text: (...args: A) => string;
}

const g = (text: string): Str => ({ kind: 'general', text });
const l = (text: string): Str => ({ kind: 'lighting', text });

/** Verbatim from the product rules. */
export const DISCLAIMER =
  "Gloam estimates which streets are likely well lit from map data. Estimates can be wrong, and Gloam can't tell you whether a route is safe. Trust your surroundings.";

export const SAMPLE_DATA_LABEL = 'SAMPLE DATA';

const TIER_WORDING: Record<Tier, string> = {
  confirmed_lit: 'confirmed lit in OpenStreetMap',
  mapped_unlit: 'mapped as unlit',
  brighter_than_most: 'estimated: brighter than most streets here',
  typical: 'estimated: typical',
  darker_than_most: 'estimated: darker than most streets here',
};

/** Tier wording. Estimated tiers append confidence as a whole percentage, e.g. "(confidence 62%)". */
export function tierWording(tier: Tier, confidence: number): string {
  requireUnit('confidence', confidence);
  const base = TIER_WORDING[tier];
  if (tier === 'confirmed_lit' || tier === 'mapped_unlit') return base;
  return `${base} (confidence ${Math.round(confidence * 100)}%)`;
}

/** "confirmed by N people"; N must be a whole number of 1 or more. */
export function confirmedBy(n: number): string {
  if (!Number.isInteger(n) || n < 1) throw new RangeError('n: must be a whole number of 1 or more');
  return `confirmed by ${n} ${n === 1 ? 'person' : 'people'}`;
}

/**
 * Message for a City_Pack file that is missing, unreadable or invalid. Names the
 * file (e.g. "seattle.segments.geojson") and says which of the three it is.
 */
export function packProblem(city: string, packId: string, file: PackFileKind, kind: PackProblem['kind']): string {
  return `${city} could not be loaded: ${packId}.${file}.geojson is ${kind}.`;
}

export const STRINGS = {
  app: {
    name: g('Gloam'),
  },
  shell: {
    cityPicker: g('Choose a city'),
    map: g('Street lighting map'),
    panel: g('Route and settings'),
    cityNote: g('About the city data on this map'),
  },
  sampleWalk: {
    label: g('Example walk, picked to show the difference. Yours may differ.'),
  },
  city: {
    kualaLumpurDescription: l('the case where lighting records are missing'),
  },
  hint: {
    setPoints: g("Tap the map to set where you start and where you're going"),
  },
  legend: {
    glow: l('Steady glow: confirmed lit in OpenStreetMap'),
    flicker: l('Flicker: estimated, faster and less regular when less sure'),
    fog: l('Fog: likely dark, mapped as unlit or estimated darker'),
  },
  labels: {
    reset: g('Reset'),
    sampleData: g(SAMPLE_DATA_LABEL),
    unknown: l('unknown'),
  },
  errors: {
    packFile: g('A city file could not be loaded. Your previous city and route are unchanged.'),
    previousKept: g('Your previous city and route are unchanged.'),
    packTimeout: g('Loading took too long. Check your connection and try again.'),
    retry: g('Retry'),
    outsideArea: g('There is no street data there.'),
    tooFarFromStreet: g('Too far from a street'),
    noRoute: g('No walking route found'),
    samePlace: g('Start and end are the same place'),
    locationUnavailable: g('Your location could not be found. Tap the map to set where you start.'),
    tilesUnavailable: g('The base map is slow or unavailable. Showing streets only.'),
    settingsStore: g('Your settings could not be read or saved. They will last until you close this page.'),
    correctionsStore: g('Your note could not be read or saved.'),
    sampleDataLoad: g('Sample data could not be loaded.'),
    csvExport: g('The export failed.'),
    validationUnavailable: g('Validation numbers are unavailable'),
    invalidNumber: g('That value was not valid, so the previous one was kept.'),
  },
  empty: {
    noReports: g('No reports exist yet.'),
  },
  templates: {
    loadingCity: { kind: 'general', text: (city: string) => `Loading ${city}…` } as Tpl<[string]>,
    packProblem: { kind: 'general', text: packProblem } as Tpl<[string, string, PackFileKind, PackProblem['kind']]>,
    tierWording: { kind: 'lighting', text: tierWording } as Tpl<[Tier, number]>,
    confirmedBy: { kind: 'lighting', text: confirmedBy } as Tpl<[number]>,
  },
} as const;
