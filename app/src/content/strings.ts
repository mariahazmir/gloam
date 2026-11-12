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

/** The Tier wording without a confidence figure, for row labels. */
export function tierLabel(tier: Tier): string {
  return TIER_WORDING[tier];
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
    clear: g('Clear example'),
  },
  route: {
    panel: g('Route summary'),
    gloamRoute: g('Gloam route'),
    shortestRoute: g('Shortest route'),
    distance: g('Distance'),
    walkingTime: g('Walking time'),
    shares: g('Share of route length by lighting'),
    difference: g('Gloam route compared with shortest route'),
    extraDistance: g('Extra distance'),
    extraTime: g('Extra walking time'),
    darkerChange: l('Change through estimated streets darker than most streets here'),
    unitMetres: g('m'),
    unitMinutes: g('min'),
  },
  chart: {
    title: g('Dread along the route'),
    xAxis: g('Distance along the route'),
    yAxis: g('Dread, 0 to 1'),
    lowConfidenceKey: g('Diamond and dashed band: estimate is least certain here'),
  },
  heartbeat: {
    routeLength: { kind: 'general', text: (distance: string) => `Route length ${distance}.` } as Tpl<[string]>,
    highStretches: {
      kind: 'general',
      text: (spans: string) => `Highest-dread stretches, the darkest quarter of this route: ${spans}.`,
    } as Tpl<[string]>,
    noHighStretches: g('No highest-dread stretches found.'),
    lowStretches: {
      kind: 'general',
      text: (spans: string) => `Low-confidence stretches, where the estimate is least certain: ${spans}.`,
    } as Tpl<[string]>,
    noLowStretches: g('No low-confidence stretches were found.'),
    span: { kind: 'general', text: (from: number, to: number) => `${from} m to ${to} m` } as Tpl<[number, number]>,
  },
  city: {
    kualaLumpurDescription: l('the case where lighting records are missing'),
  },
  hint: {
    setPoints: g("Tap the map to set where you start and where you're going"),
  },
  plan: {
    modeSwitch: g('Mode'),
    planMode: g('Plan'),
    reportMode: g('Report'),
    tapSets: g('tap sets:'),
    tapSetsStart: g('start'),
    tapSetsEnd: g('end'),
    setStartHere: g('Set start here'),
    setEndHere: g('Set end here'),
    useMyLocation: g('Use my location'),
    crosshair: g('Map centre'),
    lambdaLabel: g('Route preference'),
    lambdaMin: g('shortest'),
    lambdaMax: g('prefer better-lit streets'),
    settingsLegend: g('Routing settings'),
    avoidSteps: g('Avoid steps'),
    avoidService: g('Avoid service roads and back lanes'),
    preferMain: g('Prefer main roads'),
    lowConfidenceDarker: g('Treat low-confidence guesses as darker'),
    on: g('on'),
    off: g('off'),
  },
  legend: {
    glow: l('Steady glow: confirmed lit in OpenStreetMap'),
    flicker: l('Flicker: estimated, faster and less regular when less sure'),
    fog: l('Fog: likely dark, mapped as unlit or estimated darker'),
  },
  report: {
    heading: g('Report a street'),
    tapPrompt: g('Tap a street on the map to select it.'),
    noStreetThere: g('No street was found at that spot. Tap closer to a street.'),
    unnamed: g('unnamed'),
    actuallyLit: g('actually lit'),
    actuallyDark: g('actually dark'),
    lightIsOut: g('light is out'),
    yourNote: g('your note'),
    likelyWellLit: l('likely well lit'),
    likelyDark: l('likely dark'),
    buttons: g('Your note'),
  },
  darkSpots: {
    heading: g('Most reported darker streets'),
    export: g('Download CSV'),
    csvFile: g('gloam-darker-streets.csv'),
  },
  tools: {
    heading: g('Legend and settings'),
    legendHeading: g('Legend'),
    demoSwitch: g('Demo mode'),
    effectsSwitch: g('Reduced effects'),
    openAbout: g('About'),
    openGuess: g('How Gloam guesses'),
    resetHint: g('Reset returns to the example walk. Your notes stay on this device.'),
  },
  about: {
    title: g('About Gloam'),
    close: g('Close'),
    what: g(
      'Gloam is a haunted-map walking app for people walking at night. It estimates which streets are likely well lit from map data, and plans routes that trade distance against dread.',
    ),
    tiles: g(
      'The map tile provider can see the area you are viewing, but it cannot see your routes. Start points, end points and routes stay on your device.',
    ),
    noAccounts: g('There are no accounts and no sign-in. Notes you add are stored on this device only.'),
    mapCredit: g('Map data © OpenStreetMap contributors. Tiles from OpenFreeMap, schema from OpenMapTiles.'),
    cityHeading: g('About the loaded city'),
    noCity: g('No city is loaded yet.'),
  },
  guess: {
    title: g('How Gloam guesses'),
    fromMapData: g(
      'Gloam estimates which streets are likely well lit from map data, not from lighting records or sensors.',
    ),
    signal: g(
      'Most of the signal is road type and path kind. Nearby places such as shops and bus stops add little on tagged walking paths.',
    ),
    canBeWrong: g('Estimates can be wrong, and lighting records are missing in many cities.'),
    numbersHeading: g('How the guesses held up'),
    aucNote: g('AUC shows how well the model ranks lit streets above unlit ones. 0.5 is a coin flip, 1 is perfect.'),
    figure: {
      kind: 'general',
      text: (city: string, kind: string, model: string, baseline: string) =>
        `${city}, ${kind}: model AUC ${model}, highway-footway-rate baseline AUC ${baseline}`,
    } as Tpl<[string, string, string, string]>,
    didNotBeat: {
      kind: 'general',
      text: (cities: string) => `The model did not beat the highway-footway-rate baseline in: ${cities}.`,
    } as Tpl<[string]>,
    beatEverywhere: g('The model beat the highway-footway-rate baseline in every city that was tested.'),
    skipped: {
      kind: 'general',
      text: (cities: string) => `Not tested, because too few streets were mapped as unlit to check against: ${cities}.`,
    } as Tpl<[string]>,
    rawLink: g('Read the full validation text'),
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
