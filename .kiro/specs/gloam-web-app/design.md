# Design Document

## Overview

The Gloam web app (`app/`) is a static browser app. It loads one small City_Pack at a time, draws a dark 2.5D map with MapLibre GL JS, and plans walking routes on the device by trading distance against Dread. There is no server of our own: no routing server, no database, no accounts.

The design follows the steering rules:

- TypeScript with Vite, no UI framework. `maplibre-gl` is the only runtime dependency. Vitest and `fast-check` are dev dependencies.
- Scoring, tiers, graph building, routing, status rules, CSV, flicker maths and wording checks are pure modules with no I/O and no hidden state. All I/O (fetch, local storage, geolocation, the map, the DOM) sits in a thin shell around them.
- Every pure function that takes numbers validates them and throws an `ArgumentError` whose message contains the argument name.
- No fixed probability cut-off exists anywhere. Estimated lighting is described by Rank within the loaded City_Pack only.
- Banned words, the Disclaimer, the "SAMPLE DATA" label and the privacy limits are enforced by structure (one string catalogue, one network module) and by tests.

Static hosting is confirmed as a Render static site. Everything that depends on it is isolated behind a build-time flag (`VITE_GLOAM_HOSTED`) and a standard Vite `dist/` output.

### Research summary

- OpenFreeMap documents that custom styles are allowed, and that a customised style must be hosted by the app itself. That matches the requirement that the map style is bundled ([OpenFreeMap quick start](https://openfreemap.org/quick_start/)). The bundled style references the OpenFreeMap vector source through its TileJSON URL `https://tiles.openfreemap.org/planet` (confirmed 10 Nov from the published `liberty` style). Tiles are never loaded from a hardcoded tile URL because it carries a changing version folder. Version 1 has no text labels or icons, so the style has no glyphs, no sprite and no symbol layers.
- The `data/*.segments.geojson` files in the repository show the real input shape: `metadata` holds `schema_version`, `kind`, `city`, `attribution`, `licence`, `estimates_note`; each feature is a LineString with `id` (a JSON number), `name`, `highway`, `lit_probability`, `confidence`, `label_source`. Segment ids are unique in all five shipped files (checked: berlin 16668, kl 10225, london 15296, manchester 21792, seattle 17402). Pack sizes are 3 to 6.3 MB for segments and 1.7 to 2.9 MB for buildings before gzip.
- Highway values seen in the data: footway, service, residential, steps, primary, secondary, cycleway, tertiary, path, unclassified, pedestrian, secondary_link, living_street, primary_link, tertiary_link, track. These drive the routing toggles in Requirement 8.
- `docs/validation.md` is the only source of figures for the How_Gloam_Guesses_Screen. It currently has metric tables for berlin, london and manchester (walking paths), and says hold-out validation was skipped for kl and seattle.

## Architecture

The app is a set of pure modules (the core) and a shell. The shell never contains decisions that the core could make.

```mermaid
flowchart TD
    subgraph Shell["Shell (I/O)"]
        UI["ui/ DOM components"]
        MAP["map/ MapLibre view, style, layers"]
        NET["net/packLoader.ts (only fetch caller)"]
        LS["storage/ localStorage stores"]
        GEO["geolocation wrapper"]
    end
    subgraph Core["Core (pure, no I/O)"]
        VAL["validation/ ArgumentError, guards"]
        PACK["pack/ parse + validate"]
        GRAPH["graph/ build, snap index"]
        SCORE["scoring/ dread, tiers, overrides"]
        ROUTE["routing/ router, summary, heartbeat"]
        CORR["corrections/ status, weights, dark spots, csv"]
        VIS["visual/ flicker, styles, effects ladder"]
        CONTENT["content/ strings, banned words, validation parser"]
        STATE["state/ app reducer"]
        SEARCH["search/ street index, match, rank, stretches, combobox state"]
    end
    NET --> PACK --> GRAPH
    PACK --> SCORE
    GRAPH --> ROUTE
    GRAPH --> SEARCH
    SEARCH --> UI
    SCORE --> ROUTE
    CORR --> ROUTE
    STATE --> UI
    ROUTE --> UI
    VIS --> MAP
    LS --> CORR
    GEO --> STATE
    CONTENT --> UI
    UI --> MAP
```

Rules that keep this honest:

- `net/packLoader.ts` and `net/sampleLoader.ts` are the only modules that call `fetch`, and they only request the files named in Requirement 13.5. The map library issues its own requests: the OpenFreeMap TileJSON request and the vector tiles it lists (both named in Requirement 13.5). It makes no glyph or sprite request. Pack files are served gzip- or Brotli-compressed (Requirement 17.6). No route, start, end or position value is ever passed to either (Requirements 13.4 to 13.6).
- Core modules import nothing from the shell, the DOM or `maplibre-gl`. No circular imports; dependency direction is shown in the diagram.
- Street search (Requirement 19) follows the same split. `search/streetSearch.ts` (index build, normalise, match, rank, group into stretches, distance and direction from the map centre) and `search/comboboxState.ts` (the combobox's keyboard and announcement logic) are pure: no I/O, no DOM, no `fetch`, no storage, no console output. `search/` imports only `graph/`, `geo/`, `pack/` types and `validation/`, and no wording; `content/strings.ts` makes the text from its numbers and compass codes. `ui/streetCombobox.ts` is the shell part: it owns the input element, the listbox DOM and the live region, reads the map centre, and calls the pure modules. The index is built from the loaded Segments and Street_Graph alone and adds no data file (Requirements 19.2, 19.9).
- The search wording (the named-streets-only line, no-results, result-count announcements, the distance and direction template with its 8 compass words, the "unnamed streets" note and the disabled-field messages) is in `content/strings.ts` in the app's own words. The existing banned-word test (`findBanned`) and the own-wording test against `reference.html` (Requirement 18.11) enumerate these strings like all others.
- All user-visible text lives in `content/strings.ts` (see Components). No other module contains a literal UI string.

### Repository layout (inside `app/`)

```
app/
  index.html
  vite.config.ts
  src/
    main.ts
    types.ts
    validation/    errors.ts, guards.ts
    geo/           distance.ts, project.ts, bounds.ts
    pack/          parse.ts, manifest.ts, sampleData.ts
    graph/         build.ts, snap.ts
    scoring/       dread.ts, tiers.ts, overrides.ts
    routing/       router.ts, costs.ts, compare.ts, tierShares.ts, heartbeat.ts, format.ts
    corrections/   store.ts, status.ts, darkSpots.ts, csv.ts
    search/        streetSearch.ts, comboboxState.ts
    settings/      settings.ts
    visual/        flicker.ts, tierStyles.ts, effects.ts
    content/       strings.ts, bannedWords.ts, validationDoc.ts
    state/         appState.ts
    net/           packLoader.ts, sampleLoader.ts
    storage/       localCorrectionStore.ts, localSettingsStore.ts
    map/           style.ts, mapView.ts, layers.ts, tileWatch.ts
    ui/            panels, controls, heartbeatChart.ts, aboutScreen.ts, streetCombobox.ts
    assets/fonts/  Caprasimo and DM Sans woff2 files (self-hosted)
  tests/           mirrors src/ (unit and property tests)
```

### Decisions and rationale

| Topic | Decision | Why |
|---|---|---|
| Pack delivery | Pack files are imported with `import.meta.glob('../../../data/{seattle,kl,london,berlin,manchester}.*.geojson', { query: '?url', import: 'default' })` and fetched on demand. The glob matches the ten files of the five shipped packs. The manifest in `pack/manifest.ts` lists the five cities and looks up each file URL from the glob result. | No copy step, hashed URLs, nothing fetched until the user chooses a city (Requirement 1.4). The manifest makes "one entry per shipped pack" explicit (Requirement 1.1). |
| Which packs ship | Five packs ship: Seattle, Kuala Lumpur, London, Berlin and Manchester. The manifest has one entry for each and the City_Picker lists all five. | Requirement 1.1 names all five. |
| Fonts | Caprasimo and DM Sans are committed as woff2 files and loaded with `@font-face`. | A font CDN request would break the network allow-list (Requirement 13.5). Both fonts are SIL OFL; the licence text goes in `docs/` and the README credits. |
| Map style | `map/style.ts` builds a `StyleSpecification` object in code: dark background, then dim layers from the `openmaptiles` vector source (`url: "https://tiles.openfreemap.org/planet"`) using only the source layers `water`, `waterway`, `landcover`, `landuse`, `park` and `transportation`. No `glyphs`, no `sprite`, no symbol layers, no `ne2_shaded` raster source. The base-map `building` layer is omitted because buildings come from the Buildings_File. Attribution is always open (`AttributionControl` with `compact: false`) and reads "OpenFreeMap © OpenMapTiles Data from OpenStreetMap" with links, plus "© OpenStreetMap contributors". | Style is bundled (no style request). No glyphs and no sprite means fewer requests (Requirement 13.5). Avoids two building layers. |
| Graph | Undirected. Every Edge is walkable both ways. Each Edge is stored once and the adjacency lists both directions as "darts". | Requirement glossary: Street_Graph is undirected. |
| Where the graph is built | Main thread, after the street layer is drawn, scheduled with `setTimeout(0)` so first paint is not blocked. A module Web Worker is the fallback if the 3 s target (Requirement 2.7) is missed on the reference phone. | Simplest thing that can meet the first-run order in Requirement 17.3. Measure before adding complexity. |
| Hosting | Render static site (confirmed by the user). Output is a plain `dist/` folder. `VITE_GLOAM_HOSTED=true` sets Demo_Mode on by default (Requirement 14.2). To verify on the deployed Render site, not assumed: (a) pack files are served gzip- or Brotli-compressed, checked via the `Content-Encoding` response header (Requirement 17.6); (b) the site is served over HTTPS; (c) the URL stays stable and up from 16 Dec to 29 Jan; (d) the site loads from the US, China and Malaysia, tested from China and Malaysia (Requirement 15.5). Record results in `docs/app-checks.md`. | Nothing in the app depends on a host except the flag and compression. |
| Persistence | Local storage holds exactly two keys: `gloam.settings.v1` and `gloam.corrections.v1`. Lambda, Demo_Mode, reduced-effects, city and mode are not persisted. | Requirement 13.3 limits storage to Personal_Settings and Corrections. |

### Decisions the requirements left to this design

| Item | Decision |
|---|---|
| Lambda (R7.1) | Slider 0 to 10, step 0.5, default 3. At default 3, a 100 m edge with Dread 0.8 costs 100 + 3 x 80 = 340, while a 150 m detour at Dread 0.2 costs 150 + 3 x 30 = 240, so the detour wins. Each pack's Sample_Walk must give a Gloam_Route at 3 (all toggles off) that differs from the Shortest_Route and crosses at least 3 different Tiers (Requirement 14.9); a test enforces both, and if a pack has no such walk, the default is revisited, not the test. |
| Penalty (R8.3) | Penalty = 1.0 x Edge distance for each *matching toggle that is on*. An Edge matching two toggles gets two penalties. Steps match "avoid steps". `highway=service` matches "avoid service roads and back lanes". "prefer main roads" matches every Edge whose highway is not exactly `primary`, `secondary` or `tertiary` (so `*_link` values match). `Routing_Distance = sum(length x (1 + penaltyCount))`. |
| Low-confidence toggle (R8.4) | Median confidence is computed once per loaded pack over all Edges of the original graph (mean of the two middle values for an even count), so user notes never move it. An Edge is treated as confidence 0 when `confidence < median` (strict). |
| Canonical_Order tie-break (R7.7) | See "Router" below: backward Dijkstra to get exact distances, then a forward walk that takes the smallest Edge key among Edges that lie on a cheapest path. |
| Tie tolerance | Two costs are equal when they differ by at most `1e-12 x max(1, cost)`. Test comparisons use the Comparison_Tolerance of 0.000001 from the glossary. |
| Tier cut-offs (R3.4) | 40 / 35 / 25 percent confirmed as written, evaluated with integers: with `higher` = count of Estimated_Segments with strictly higher lit probability and `total` = count of Estimated_Segments, the Tier is `brighter_than_most` if `higher x 5 < total x 2`, `darker_than_most` if `higher x 4 >= total x 3`, else `typical`. No floating point division. |
| User note (R10.3) | A note produces an override `{ litProbability: 1 or 0, confidence: 1 }` for that segment id, held in a map next to the pack. Routing, the Heartbeat_Chart and the segment card read effective values (override else pack value). Tiers, Rank, map tier styling and Community_Status read pack values only. A "your note" marker (outline pattern plus text, not colour alone) is drawn on the segment. |
| One note per segment per device | `CorrectionStore.put` replaces any earlier Correction for the same segment id. This keeps one device from becoming "confirmed by 3 people" by tapping three times, and means the local store can never reach the Status_Threshold alone. |
| Community_Status (R10.5) | `confirmed by N people` where N is the number of Corrections on the winning side. Each weight is at most 1, so a weighted sum of 3 or more means N is at least 3. Status changes labels only and never routing (Requirement 10.11). |
| Status arithmetic | Corrections are sorted by (date, type) before summing so floating point addition order cannot change a result (Requirements 10.7, 16.13). |
| Dates | A Correction date is a calendar day string `YYYY-MM-DD`. `age_in_days` is the integer difference of UTC day numbers, clamped to 0 or more. So age 30 gives weight 0.5 and age 90 gives 0.125. |
| Sample_Data dates | Sample_Data stores `days_ago` per correction and converts to a date at load. Fixed dates would decay to nothing before judging ends (a report 60 days old weighs 0.25). |
| Dark_Spot_List (R11) | Enabled in version 1. Counts combine local and Sample_Data Corrections. An entry is labelled "SAMPLE DATA" if any contributing Correction is sample. |
| "Lowest quarter" of confidence (R9.3 to R9.5) | Nearest-rank: sort the pack's Estimated_Segment confidences ascending, `n` of them, threshold = value at index `ceil(n / 4) - 1`; an Edge is low-confidence when its effective confidence is at or below the threshold. |
| "Highest quarter" of Dread (R9.4) | Sort the route's `m` Edge Dreads ascending, threshold = value at index `m - ceil(m / 4)`; an Edge is in the highest quarter when its Dread is at or above the threshold. |
| Tap state machine (R6.1) | Plan_Mode starts in Start_Setting_State. After any point-setting action (tap, `setStartHere`, `setEndHere`, `useLocation`, `chooseStreet`), and after the Sample_Walk is cleared first when it was showing (R17.17), if exactly one of start and end is unset the state becomes the unset point's state (start unset: Start_Setting_State; end unset: End_Setting_State); if both are set it is unchanged. So a start action with an end already set leaves the state as it was. Report_Mode taps never change it. A "tap sets: start / end" segmented control shows and changes the state. |
| Out-of-area (R1.9) and too far (R6.6) | Out of area means outside the bounding box of all Segment coordinates grown by 150 m. Inside that box but with no street within 150 m (inclusive) gives the "too far from a street" message. |
| Fit to Sample_Walk (R5.1, R14.7, R17.7) | `boundsOf(points)` returns the south-west and north-east corners of every route coordinate plus start and end. The map shell calls `fitBounds` with padding `{ top: 80, bottom: 300, left: 40, right: 40 }`, `maxZoom: 17`, `duration: 0` on first run. |
| Frame-rate fallback (R5.6) | Effects ladder in order: `flicker`, `glow`, `fog`, `extrusion`. A 1 s frame counter feeds a pure controller (see Components). |
| Geolocation timeout (R6.3) | `getCurrentPosition` with `timeout: 10000`, plus a guard timer of 10 s in case the browser never calls back. |
| Tile timeout (R5.7) | A 5 s watch starts when the style loads. If the base vector source has not reported loaded tiles by then, or a source error fires, base layers are hidden and the message is shown. |
| Zero-length route | If start and end snap to the same point, no route is shown; the app shows "Start and end are the same place". Approved. |
| Duplicate segment ids | Ids must be unique. If an id appears twice, every copy is rejected with an error naming `id`. Rejecting all copies keeps the result independent of input order. |
| Street search: normalisation (R19.2) | `normalise(text)`: lowercase with `toLowerCase()` (no locale argument, so the result does not depend on the device language), then `normalize('NFD')`, then delete combining marks U+0300 to U+036F, then fold these letters that do not decompose: `ß`→`ss`, `ø`→`o`, `đ`→`d`, `ł`→`l`, `æ`→`ae`, `œ`→`oe`. Then split into tokens on any run of characters that are not Unicode letters or digits (`/[^\p{L}\p{N}]+/u`) and join with one space. The folding is worth its few lines: the shipped packs include Berlin (`Straße`) and Kuala Lumpur and Manchester names that a user types without marks, and a missing fold would break "same results for a query that differs only in letter case or diacritics". The same function is used for names and queries. A name whose normal form has no tokens is unnamed and is not indexed. |
| Street search: matching and ranking (R19.2) | The query is normalised to tokens. Results exist only when the raw query, trimmed, has 2 or more code points and at least one token. A name matches when every query token is a prefix of some name token (word start; one name token may satisfy several query tokens). Rank tier 0: normalised name equals normalised query. Tier 1: normalised name starts with the normalised query (and is not equal). Tier 2: every token matches at a word start, otherwise. Sort comparator, a total order: tier ascending; then normalised-name length in UTF-16 code units ascending (shorter first); then normalised name by code unit; then distance from the map centre, nearest first, taken from the UNROUNDED haversine distance (never from the rounded display value of `roundDistance`); then stretch key by code unit. This is a total order because stretch keys are unique, so no two entries compare equal and the order cannot depend on sort stability or input order. The first 8 in this order are returned (for a name that appears in many places, the nearest 8). The `centre` argument is therefore part of the sort and of the result: the same query, same centre and same pack give the same results in the same order, and moving the map centre can change the order and which 8 are kept. The haversine is computed for every entry that passes the match (needed by the comparator), not for the 8 kept only. Rounding in `roundDistance` is for display only and must not feed the comparator. Hand-checked example: see "Street search: ranking by distance example" below. |
| Street search: ranking by distance example (R19.2) | One name, "Church Lane", 10 stretches in 10 places, map centre (lon 0, lat 0), every midpoint on the meridian lon 0, so the haversine reduces to `d = R x \|dlat in radians\|` with no longitude term. Constant: `R x pi / 180 = 6 371 008.8 x 0.0174532925 = 111 195.08 m` per degree, so 0.001 degree = 111.195 m (111.19508 m kept in the arithmetic, printed to 3 decimals, rounded half up). Midpoint latitudes in thousandths of a degree (n), stretch keys chosen so key order differs from distance order: key "40" at +3; "12" at -5; "7" at +1; "31" at -2; "25" at +5; "9" at -8; "18" at +4; "60" at -6; "5" at +9; "22" at -7. Distances `n x 111.19508`: n=1 111.195 m; n=2 222.390 m; n=3 333.585 m; n=4 444.780 m; n=5 555.975 m (twice: "12" south and "25" north, equal to the bit because the haversine is symmetric about the equator at lon 0); n=6 667.170 m; n=7 778.366 m (7 x 111.19508 = 778.36556); n=8 889.561 m (889.56064); n=9 1000.756 m (1000.75572). Query "church lane": all 10 are tier 0 with equal length and equal name, so distance decides. Returned 8, in order: "7" 111.195 m, "31" 222.390 m, "40" 333.585 m, "18" 444.780 m, "12" 555.975 m, "25" 555.975 m (equal distance, "12" before "25" by code unit), "60" 667.170 m, "22" 778.366 m. Dropped: "9" 889.561 m and "5" 1000.756 m. Key order alone would give "12", "18", "22", "25", "31", "40", "5", "60" instead, so the order is not explained by the key. Shuffling the Segment input, or rebuilding the index from any permutation, gives the same 8 in the same order, because entries are compared by values only. The test builds the index entries with the midpoints set directly, so the equal-distance tie is exact. |
| Street search: stretches (R19.3) | A stretch is a set of Segments with the same normalised name that are connected through graph nodes. Rule: union-find over the Segments in the Street_Graph; at every node, all Segments with the same normalised name among the Edges that meet there are joined. There is no gap tolerance: two same-named Segments that do not touch are separate stretches, so one name in two parts of a city gives two results. Trade-off: a street broken by an unnamed connector or a mapping gap can show as two results; the distance and direction wording still tells them apart. Stretch key = the smallest segment id in the stretch, compared as strings by code unit (unique, because a Segment has one name). Display name = the raw `name` of that smallest-id Segment. Cost: one pass over the darts, about 2 x Edge count steps (about 100 000 to 150 000 for a 22 000-Segment pack) plus normalising each name once; target under 100 ms, measured, not asserted. Built once per pack by `buildStreetIndex`, scheduled with `setTimeout(0)` after the graph build finishes, so it is off the first-paint path (Requirement 17.3). Segments rejected by `buildGraph` have no Edges and are not indexed. |
| Street search: midpoint (R19.4) | Take the stretch's Edges in canonical Edge-key order (`compareEdgeKeys`), each read along its polyline from `a` to `b`. Let `total` be the sum of their lengths and `half = total / 2`. Walk the Edges adding lengths; the first Edge whose cumulative length reaches `half` holds the midpoint, found by interpolating along that Edge's polyline by length. For a branching stretch this is a point on the stretch, not necessarily the geometric middle, which is enough: it is always on a street of that name. The midpoint is computed once at index build. Choosing a result passes `{ lon, lat }` through the same path as a tapped point: Plan_Mode only, `chooseStreet` action, then `snap` with the 150 m rule, the out-of-area check of R1.9, the "too far" message of R6.6, clearing the Sample_Walk first (R17.17) and the setting-state rule of R6.1. Which point it sets is the field's own (start field sets start, end field sets end), not the current setting state. |
| Street search: distance and direction wording (R19.3) | Inputs: map centre and result midpoint. Distance `d` = haversine (the same function as `geo/distance.ts`). Bearing = initial great-circle bearing, `atan2(sin dλ cos φ2, cos φ1 sin φ2 - sin φ1 cos φ2 cos dλ)` in degrees, normalised to 0 to under 360. Direction word = sector `floor(((bearing + 22.5) mod 360) / 45)`, which maps 0 to 7 to north, north-east, east, south-east, south, south-west, west, north-west; each sector is centred on its point and a bearing exactly on a boundary goes to the later sector. Distance text: `r = Math.round(d / 50) * 50`. If `r` is 0, the text is the "at the map centre" wording with no direction. If `r` is below 1000, "about r m". Otherwise km: `Math.round(d / 100) / 10` to one decimal, "about 1.2 km". Hand checks: 612 m at bearing 50 gives `r = round(12.24) x 50 = 600`, sector `floor(72.5 / 45) = 1`, "about 600 m north-east". 1240 m at bearing 181 gives `round(12.4) / 10 = 1.2`, sector `floor(203.5 / 45) = 4`, "about 1.2 km south". 975 m at bearing 337.5 gives `r = round(19.5) x 50 = 1000`, which is not below 1000, so km: `round(9.75) / 10 = 1.0`, sector `floor(360 / 45) mod 8 = 0`, "about 1.0 km north". 20 m gives `r = round(0.4) x 50 = 0`, "at the map centre". Last, from a centre of (0, 0) to a midpoint at latitude 0.0054 and longitude 0: `d = 0.0054 x 111 195.08 = 600.45 m`, bearing 0, so `r = round(12.009) x 50 = 600` and "about 600 m north". The map centre is an argument of `searchStreets`; reading it from the map is the shell's job. Distance wording is computed when the result list is built (each time the input changes), not while the map moves. |
| Street search: query lifetime (R19.2, R13.12) | The typed query lives only in the input element and one in-memory variable in `ui/streetCombobox.ts`. It is never written to storage, the console, the URL hash or any request. The pure modules receive it, and the map centre, as arguments and keep nothing; the centre is read from the map when the results are built and is not stored. |

## Components and Interfaces

### validation/

```ts
export class ArgumentError extends Error {
  constructor(public readonly argument: string, detail: string) {
    super(`${argument}: ${detail}`);
  }
}
export function requireUnit(name: string, v: number): number;        // finite, 0..1
export function requireFinite(name: string, v: number): number;
export function requireLambda(v: number, max?: number): number;       // finite, 0..max (default 10)
export function requireLatLon(name: string, lon: number, lat: number): void;
```

Each guard throws `ArgumentError` for NaN, infinity or out-of-range input. The message always starts with the argument name (Requirements 7.10, 16.3).

### pack/ (parse and validate)

```ts
export interface PackMeta { schemaVersion: number; attribution: string; estimatesNote: string; city: string }
export interface Segment {
  id: string;                       // String(feature.properties.id)
  name: string | null;
  highway: string;
  litProbability: number;           // 0..1
  confidence: number;               // 0..1
  labelSource: LabelSource;
  coordinates: ReadonlyArray<readonly [lon: number, lat: number]>;
}
export type PackFileKind = 'segments' | 'buildings';
export type PackProblem = { file: PackFileKind; kind: 'missing' | 'unreadable' | 'invalid'; detail: string };

export function parseSegmentFile(json: unknown): { meta: PackMeta; segments: Segment[] } | PackProblem;
export function parseBuildingsFile(json: unknown): { buildings: Building[]; skipped: BuildingProblem[] } | PackProblem;
```

- The supported `schema_version` list is `[1]`. Anything else, a non-finite or out-of-range `lit_probability` or `confidence`, or a non-LineString geometry makes the whole file `invalid` (Requirement 1.7).
- Buildings with `height_m` missing, non-finite or below 0 are skipped one by one and reported as `{ field: 'height_m' }`; the console report happens in the shell (Requirement 5.8).
- `PackProblem` carries the file kind so the message can name the file and say missing, unreadable or invalid (Requirement 1.6).

### net/packLoader.ts

```ts
export interface PackLoad { cancel(): void; result: Promise<LoadedPack> }
export function loadPack(entry: ManifestEntry, fetchFn: typeof fetch): PackLoad;
```

- Fetches the Segment_File first, hands it to the shell so the street layer can be drawn, then fetches the Buildings_File (Requirement 17.3).
- Uses one `AbortController` per load. Choosing another city calls `cancel()` on the earlier load, so only the latest choice completes (Requirement 1.11).
- A 15 s deadline aborts the load and returns a `PackProblem`, which shows the retry control (Requirement 17.16).
- On any failure, nothing is committed to app state, so the previous pack, view and route stay as they were (Requirement 1.6).
- When the new pack is committed, the previous `LoadedPack` reference is dropped, leaving exactly one pack in memory (Requirements 1.10, 15.7, 15.8).

### graph/build.ts

```ts
export interface Edge {
  key: EdgeKey;                     // { segmentId, part } ; compare with compareEdgeKeys
  segmentId: string;
  part: number;                     // ordinal of this piece within its segment, from 0
  a: number; b: number;             // node indexes, a is the piece start along the segment
  lengthM: number;                  // > 0
  litProbability: number; confidence: number;
  labelSource: LabelSource; highway: string;
  coordinates: ReadonlyArray<readonly [number, number]>;   // polyline a -> b
}
export interface StreetGraph {
  nodes: ReadonlyArray<{ lon: number; lat: number }>;       // sorted by coordinate key
  edges: ReadonlyArray<Edge>;                               // sorted by compareEdgeKeys
  adjacency: ReadonlyArray<ReadonlyArray<Dart>>;            // per node, sorted by dart key
}
export interface Dart { edge: number; to: number; reverse: boolean }
export interface RejectedSegment { segmentId: string; field: string; message: string }

export function buildGraph(segments: ReadonlyArray<Segment>): { graph: StreetGraph; rejected: RejectedSegment[] };
```

Algorithm:

1. Validate each Segment. A Segment with fewer than 2 coordinates, a NaN, infinite or out-of-range coordinate, or a bad `litProbability` or `confidence` is rejected with its id and field name; the rest continue (Requirement 2.8). Consecutive duplicate coordinates are dropped first. If fewer than 2 coordinates remain, the Segment is rejected with field `coordinates`.
2. Reject every copy of a duplicated id.
3. Coordinate key is `` `${lon},${lat}` `` using the parsed numbers. Count how many (segment, position) slots use each key.
4. A coordinate is a node if it is the first or last coordinate of a Segment, or if its key occurs in more than one slot anywhere (Requirement 2.1). A closed Segment therefore has its start node as both ends (Requirement 2.5).
5. Cut each Segment at its node coordinates into pieces. Each piece becomes an Edge with `part` = piece ordinal. Length is the sum of haversine distances (R = 6 371 008.8 m). For scale: 0.001 degrees of latitude is about 111.2 m.
6. Sort nodes by key, edges by `compareEdgeKeys`, and build adjacency in that order. Because everything is sorted by values and never by input position, any permutation of the input gives an identical graph (Requirements 2.3, 16.9). Disconnected parts need no special handling (Requirement 2.4).

Edge lengths sum to the Segment length by construction. The only difference is dropped duplicate points, which have zero length (Requirement 2.6).

### graph/snap.ts

```ts
export interface SnapPoint {
  edge: number; t: number;          // 0..1 along the Edge polyline by length
  lon: number; lat: number;         // snapped position
  distanceM: number;                // from the query point
}
export function buildSnapIndex(graph: StreetGraph): SnapIndex;
export function snap(index: SnapIndex, lon: number, lat: number, maxM?: number): SnapPoint | null;
export function packBounds(segments: ReadonlyArray<Segment>): Bounds;
```

- The index is a uniform grid of 200 m cells holding Edge ids. A query reads the 3 x 3 cells around the point, which covers the 150 m Snap_Distance (Requirement 6.5).
- Distances use a local equirectangular projection around the query point: `x = (lon - lon0) x cos(lat0) x mPerDeg`, `y = (lat - lat0) x mPerDeg`, `mPerDeg = R x pi / 180`, about 111 195 m. Error over 150 m is far below one metre.
- The nearest point is found by projecting onto every polyline piece of nearby Edges. Ties go to the smaller Edge key, then the smaller `t`, so the result is deterministic.
- `maxM` defaults to 150 and is inclusive. `null` means too far (Requirement 6.6).

### scoring/

```ts
export function dread(litProbability: number, confidence: number): number;
// raw = 1 - litProbability ; raw + (1 - confidence) * max(0, 0.5 - raw)

export type Tier = 'confirmed_lit' | 'mapped_unlit' | 'brighter_than_most' | 'typical' | 'darker_than_most';
export function assignTiers(segments: ReadonlyArray<Pick<Segment, 'id' | 'labelSource' | 'litProbability' | 'confidence'>>): Map<string, Tier>;

export interface Override { litProbability: 0 | 1; confidence: 1 }
export function overrideFor(type: ReportType): Override;
```

Hand-checked values for `dread`:

| litProbability | confidence | raw | Dread |
|---|---|---|---|
| 0.2 | 0.5 | 0.8 | 0.8 (no uplift because `0.5 - 0.8 < 0`) |
| 0.7 | 0.5 | 0.3 | 0.3 + 0.5 x 0.2 = 0.4 |
| 0.9 | 0 | 0.1 | 0.1 + 1 x 0.4 = 0.5 |
| 0.5 | 0 | 0.5 | 0.5 |
| 0.9 | 1 | 0.1 | 0.1 |

The result is always between 0 and 1: for `raw` at or above 0.5 it equals `raw`; below 0.5 it moves from `raw` toward 0.5 and never passes it.

`assignTiers`:

- `tagged_lit` maps to `confirmed_lit`, `tagged_unlit` to `mapped_unlit` (Requirements 3.2, 3.3).
- For Estimated_Segments, `higher` is computed by sorting the lit probabilities once and counting strictly greater values, so equal probabilities get equal Tiers (Requirement 3.5). The integer rule in the decisions table assigns the Tier. Only comparisons between probabilities are used, so any strictly increasing transformation leaves Tiers unchanged and no fixed value such as 0.5 appears in the code (Requirement 3.7).
- A NaN, infinite or out-of-range `litProbability` or `confidence` throws `ArgumentError` naming the argument and the segment id, and no map is returned (Requirement 3.10). With zero Estimated_Segments the function returns Tiers for the tagged ones only (Requirement 3.11).

Worked example with ten distinct Estimated_Segments, `total` = 10. The segment with `higher` = k gets: k = 0 to 3 `brighter_than_most` (k x 5 < 20), k = 4 to 7 `typical` (k x 5 >= 20 and k x 4 < 30), k = 8 and 9 `darker_than_most` (k x 4 >= 30). That is 4, 4 and 2 segments. In general, with all probabilities distinct, the number of `brighter_than_most` is `ceil(2n/5)` and the number of `darker_than_most` is `n - ceil(3n/4)`; for n = 10 these are 4 and 10 - 8 = 2.

### routing/costs.ts

```ts
export interface PersonalSettings { avoidSteps: boolean; avoidService: boolean; preferMain: boolean; lowConfidenceDarker: boolean }
export const DEFAULT_SETTINGS: PersonalSettings;      // all false (Requirement 8.2)
export interface EdgeView { lengthM: number; litProbability: number; confidence: number; highway: string }

export function effectiveAttrs(edge: Edge, overrides: ReadonlyMap<string, Override>): EdgeView;
export function penaltyCount(highway: string, s: PersonalSettings): number;
export function adjustedDread(v: EdgeView, s: PersonalSettings, medianConfidence: number): number;
export function routingLength(v: EdgeView, s: PersonalSettings): number;     // length x (1 + penaltyCount)
export function edgeCost(v: EdgeView, lambda: number, s: PersonalSettings, median: number): number;
export function medianConfidence(graph: StreetGraph): number;
```

`edgeCost = routingLength + lambda x lengthM x adjustedDread`. The Route_Cost of a route is the sum of its Edge costs, which equals `Routing_Distance + lambda x Dark_Exposure` (Requirement glossary). Inputs are validated: `lambda` finite and 0 or more, `litProbability` and `confidence` in 0 to 1, `lengthM` finite and above 0.

### routing/router.ts

```ts
export interface RouteRequest {
  graph: StreetGraph;
  start: RoutePoint; end: RoutePoint;   // RoutePoint = Pick<SnapPoint, 'edge' | 't'>; the router reads only these
  lambda: number;
  settings: PersonalSettings;
  overrides: ReadonlyMap<string, Override>;
  medianConfidence: number;
}
export interface RoutePiece { edge: number; reverse: boolean; sub: number; fromT: number; toT: number; view: EdgeView }
export interface Route {
  pieces: ReadonlyArray<RoutePiece>;
  physicalLengthM: number; routingDistanceM: number; darkExposure: number; cost: number;
}
export function findRoute(req: RouteRequest): Route | null;   // null = no connected path
```

**Overlay for snapped points.** Start and end usually fall inside an Edge. The router builds a small, local overlay without changing the graph: each snapped Edge is replaced by sub-pieces split at the snapped `t` values (sorted), with lengths scaled by `t` and the same attributes. `t` of 0 or 1 reuses the existing node. If start and end share an Edge, the piece between them is also a candidate. Sub-pieces carry a `sub` ordinal for tie-breaking. **1 mm collapse rule:** before splitting, a snap position within 1 mm of an Edge end (`t * lengthM <= 0.001`, or `(1 - t) * lengthM <= 0.001`) is collapsed onto that end node (`t` becomes 0 or 1), so returned `fromT`/`toT` and piece lengths use the collapsed position. This keeps piece costs above float resolution. The forward walk keeps a visited-node guard so it cannot loop; if float resolution makes the strict progress check find no step, it picks among darts with non-increasing distance (smallest dart key, never revisiting a node), and as a last resort follows the Dijkstra tree, so `findRoute` never returns null once the start node was reached.

**Algorithm.**

1. Validate `lambda` (0 to 10, finite) and the snapped points. Invalid input throws `ArgumentError` naming the argument and returns nothing (Requirement 7.10).
2. Run Dijkstra from the end node over the undirected overlay with Edge cost from `edgeCost`, using a binary heap. This yields `dist[n]`, the cheapest cost from every reached node to the end. Heap ties break by node index so the run is deterministic.
3. If the start node was not reached, return `null` (Requirements 6.8, 16.8).
4. Walk forward from the start. At node `u`, look at every dart `e` to `v` with `dist[v]` defined and `|cost(e) + dist[v] - dist[u]| <= 1e-12 x max(1, dist[u])`. These are exactly the darts that begin some cheapest path. Take the one with the smallest dart key `(segmentId, part, sub, reverse)`, comparing `segmentId` strings by UTF-16 code unit. Stop at the end node.
5. Because every Edge cost is above 0, `dist` falls strictly along the walk, so it ends and never loops.

**Why this meets Requirement 7.7.** The walk chooses, at every step, the smallest key among all first steps that still allow a cheapest route. That produces the first sequence in Canonical_Order among all cheapest routes, independent of input order, because the graph and adjacency are already in canonical order. Two cheapest routes cannot have one as a prefix of the other, since both end at the end node and every cost is above 0.

**Worked tie.** One pair of nodes A and B, joined by two routes. Route P1 is a single 100 m piece (segment id `"20"`, lit 0.2, confidence 1, Dread 0.8). Route P2 is two 75 m pieces (ids `"10"` and `"11"`, lit 0.8, confidence 1, Dread 0.2).

| Lambda | P1 cost | P2 cost | Chosen |
|---|---|---|---|
| 0.5 | 100 + 0.5 x 80 = 140 | 150 + 0.5 x 30 = 165 | P1 |
| 1 | 100 + 1 x 80 = 180 | 150 + 1 x 30 = 180 | tie, P2 (first id `"10"` is before `"20"`) |
| 3 | 100 + 3 x 80 = 340 | 150 + 3 x 30 = 240 | P2 |

At lambda 1 the doubles differ only by rounding (`1 - 0.8` is not exactly 0.2), which is why equality uses the relative tolerance. Dark_Exposure falls 80 to 30 and Routing_Distance rises 100 to 150 as lambda rises, as Requirements 7.5 and 7.6 require.

**Why monotonicity holds for any tie rule.** Let p1 and p2 be cheapest at lambda1 < lambda2, with distance D and exposure E. Then `D1 + l1 E1 <= D2 + l1 E2` and `D2 + l2 E2 <= D1 + l2 E1`. Adding them gives `(l2 - l1)(E2 - E1) <= 0`, so `E2 <= E1`. The first inequality then gives `D1 - D2 <= l1 (E2 - E1) <= 0`, so `D2 >= D1`. The router only has to return a true cheapest route for each lambda.

**Shortest_Route** is `findRoute` with `lambda = 0`, default settings and no overrides (see Shortest_Route in the glossary). At lambda 0 with toggles on, the result minimises Routing_Distance instead (Requirement 7.4).

### routing/compare.ts, tierShares.ts, format.ts, heartbeat.ts

```ts
export function tierShares(pieces: Route['pieces'], tierOf: (edge: number) => Tier): Record<Tier, number>;
export function compareRoutes(gloam: RouteSummary, shortest: RouteSummary): RouteDelta;
export function formatDistance(meters: number): string;
export function walkingMinutes(displayedMeters: number): number;
export function heartbeatSeries(route: Route, lowConfThreshold: number): HeartbeatSeries;
export function lowConfidenceThreshold(estimatedConfidences: ReadonlyArray<number>): number | null;
export function describeHeartbeat(series: HeartbeatSeries): string;     // screen-reader summary
```

- `tierShares` uses the largest-remainder method: exact share `100 x length / total`, floor each, then give the remaining points one at a time to the largest fractional parts, ties going to the earlier Tier in the order `confirmed_lit, mapped_unlit, brighter_than_most, typical, darker_than_most`. The five integers always sum to exactly 100 (Requirements 6.7, 16.22). Example: three Tiers of equal length have shares 33.33 each, floors sum to 99, and the first in order gets the extra point: 34, 33, 33. Example: 500, 300, 200 m of 1000 m gives 50, 30, 20.
- `formatDistance`: round to whole metres first. Below 1000 show metres. From 1000 show kilometres to one decimal using `Math.round(m / 100) / 10`. So 999.6 m is "1.0 km", 1049 m is "1.0 km" and 1050 m is "1.1 km".
- `walkingMinutes(m)` is `ceil(m x 3 / 250)` on the *displayed* whole metres. That is 5 km/h written with integers: 1000 m gives 12 minutes, 1200 m gives 14.4 and so 15, 1001 m gives 12.012 and so 13.
- `compareRoutes` works on displayed values so the numbers add up on screen. With Gloam 1200 m (15 min) and Shortest 1000 m (12 min) the delta is +200 m and +3 minutes. The change through `darker_than_most` is a signed difference of rounded metres. Identical routes give 0, 0 and 0 (Requirement 7.9).
- `lowConfidenceThreshold` and the highest-quarter rule follow the decisions table. With 8 confidences the threshold is at index `ceil(8/4) - 1` = 1, so the two lowest are flagged; with 10 it is index `ceil(10/4) - 1` = 2.
- `heartbeatSeries` has one segment per route piece: `x0` and `x1` are cumulative metres from 0 to total, `y` is the setting-adjusted Dread between 0 and 1, and `lowConfidence` marks the span. Adjacent flagged pieces merge into one stretch in the text summary. When there are none the summary says no low-confidence stretches were found (Requirements 9.1 to 9.5).

### corrections/

```ts
export type ReportType = 'actually_lit' | 'actually_dark' | 'light_is_out';
export interface Correction { segmentId: string; type: ReportType; date: string }   // exactly these three fields

export interface CorrectionStore {
  list(): Correction[];                         // throws StoreError on read failure
  put(c: Correction): void;                     // replaces any earlier one for the same segmentId; throws StoreError on write failure
  clear(): void;
}
export class StoreError extends Error {}

export function reportWeight(correctionDate: string, today: string): number;       // 0.5 ** (max(0, days) / 30)
export type CommunityStatus = { side: 'lit' | 'dark'; people: number } | null;
export function communityStatus(corrections: ReadonlyArray<Correction>, today: string, threshold?: number): CommunityStatus;
export function statusBySegment(corrections: ReadonlyArray<Correction>, today: string): Map<string, CommunityStatus>;

export function darkSpots(corrections: ReadonlyArray<Correction & { sample?: boolean }>, names: (id: string) => { name: string | null; highway: string }, limit?: number): DarkSpot[];
export function toCsv(rows: ReadonlyArray<DarkSpot>): string;
```

- `communityStatus` splits Corrections into the lit side (`actually_lit`) and the dark side (`actually_dark` plus `light_is_out`), sums canonical-order weights per side, and returns the side whose sum is at least the threshold (default 3) and strictly greater than the other. A single Correction can never reach the threshold, so it never creates or changes a status (Requirements 10.6, 16.12).
- Worked examples (today = the same day): three lit reports dated today give lit sum 3, dark sum 0, so lit, 3 people. Three lit plus one dark gives 3 against 1, lit, 3 people. Three lit and three dark gives a tie, so no status. Three lit reports each 30 days old give 3 x 0.5 = 1.5, below 3, so no status.
- `darkSpots` keeps segments with at least one `actually_dark` or `light_is_out` report, sorts by total count descending then segment id ascending, and keeps 20 (Requirement 11.1).
- `toCsv` writes the header `name,highway,segment_id,actually_dark,light_is_out`. Every field is wrapped in double quotes with embedded quotes doubled. A field whose first character is `=`, `+`, `-`, `@`, tab or carriage return gets a single quote prefix before quoting. An unnamed segment has an empty name field (Requirements 11.3, 11.5). The header row is written unquoted: its names are plain words with underscores, so quoting adds nothing. Only data fields are quoted. No coordinates, dates or user data are written.
- `storage/localCorrectionStore.ts` implements `CorrectionStore` over `localStorage` key `gloam.corrections.v1` as an array of `[segmentId, type, date]`. A failed read or write throws `StoreError`, leaves earlier data untouched, and the UI shows the error and carries on (Requirement 10.9). All app code uses the interface only (Requirement 10.8).

### settings/

`localSettingsStore` reads and writes `gloam.settings.v1` as a JSON object of four booleans. `parseSettings(text)` returns `DEFAULT_SETTINGS` for missing keys and throws for non-boolean values; the shell catches failures, keeps in-memory settings and shows the message (Requirement 8.7). Writes happen on each toggle change, well inside the 1 s limit (Requirement 8.5).

### visual/

```ts
export interface FlickerParams { meanIntervalS: number; jitter: number }
export function flickerParams(confidence: number): FlickerParams;
export function irregularity(confidence: number): number;           // jitter / sqrt(3)
export function maxFlickerRate(confidence: number): number;         // 1 / (meanIntervalS * (1 - jitter))
export function flickerBrightness(confidence: number, seed: number, tSeconds: number, base: number): number;
export const FLICKER_CAP = 3;
export const FLICKER_DEPTH = 0.25;        // fraction of the full brightness range
export const FLICKER_HALF_WIDTH_S = 0.15;
export const FLICKER_STEP_MS = 33;        // layer opacity update step
```

- With `u = 1 - confidence`: `meanIntervalS = 1 - 0.25 u` and `jitter = 0.5 u`. Each flash interval is `meanIntervalS x (1 + jitter x (2r - 1))` with `r` a seeded value in [0, 1]. For uniform `r` the coefficient of variation is `jitter / sqrt(3)`, which is 0 at confidence 1 and about 0.289 at confidence 0, so it never decreases as confidence falls and is strictly larger at 0 than at 1 (Requirements 4.2, 16.21).
- Fastest case: the shortest interval is `(1 - 0.25 u)(1 - 0.5 u) = 1 - 0.75 u + 0.125 u^2`. This falls as `u` rises, so its minimum is at `u = 1`: 1 - 0.75 + 0.125 = 0.375 s, a maximum of 2.67 flashes per second, under the cap of 3 (Requirements 4.7, 16.17).
- A flash is a triangular dip of depth 0.25 (of the full 0 to 1 brightness range) and half-width 0.15 s. Its slope is 0.25 / 0.15 = 1.667 per second. The layer opacity is sampled every `FLICKER_STEP_MS` = 33 ms, so the bound used is slope x (100 ms + one 33 ms step) = 1.667 x 0.133 = 0.222, under the 0.25 limit (Requirement 4.8). The extra step covers a 100 ms window that starts between samples. A full dip lasts 0.30 s, shorter than the 0.375 s minimum interval, so dips never overlap. The maximum flash rate is unchanged at 1 / 0.375 = 2.67 per second, under the cap of 3, because it depends only on the interval formula and not on the dip depth.
- The map shell groups estimated Segments into cohort layers by Tier (3 estimated Tiers), 3 confidence bands (edges 0, 1/3, 2/3, 1, centres 1/6, 1/2 and 5/6) and 3 phase offsets (0, 1/3 and 2/3 of the band's mean interval, chosen per Segment from a hash of its id). That is 3 x 3 x 3 = 27 flicker layers, near the target of 30. Each layer's `line-opacity` is set from the sampled `flickerBrightness` every 33 ms (about 30 updates per second, so about 810 paint updates per second across 27 layers). The frame-rate check for this cost is a measured target on the reference phone, not a guarantee (Requirement 5.5). Layers for `confirmed_lit` and `mapped_unlit` are never animated.
- Styles per Tier in normal mode: `confirmed_lit` is a solid line with a wide blurred underlay (steady glow). The three estimated Tiers are dashed so they differ from confirmed streets without colour: `brighter_than_most` long dashes at higher base brightness, `typical` short dashes, `darker_than_most` dots plus a fog underlay. `mapped_unlit` is a thin solid line with fog and no flicker.
- Reduced_Effects_Mode uses a static table of (pattern, width) pairs, all different: `confirmed_lit` solid 3.5 px, `brighter_than_most` dashes `[4, 2]` at 2.5 px, `typical` dashes `[2, 2]` at 2 px, `darker_than_most` dots `[0.5, 2]` at 2 px, `mapped_unlit` solid 1 px (Requirement 4.13). The mode starts on if `prefers-reduced-motion: reduce` matches at load (Requirement 4.9) and a keyboard and touch operable switch shows the current mode (Requirement 4.10).

**Effects ladder (`effects.ts`).**

```ts
export type Effect = 'flicker' | 'glow' | 'fog' | 'extrusion';
export interface EffectsState { active: ReadonlyArray<Effect>; belowSinceMs: number | null }
export function stepEffects(s: EffectsState, fps: number, nowMs: number): EffectsState;
```

`fps` below 30 starts a timer on first sight; once 2000 ms pass with `fps` still below 30, the first active effect (in the order above) is removed and the timer restarts. `fps` at 30 or more clears the timer. Effects are never re-enabled automatically; turning Reduced_Effects_Mode off restores all of them. Streets, routes and attribution are never part of the ladder (Requirement 5.6). When `fog` is removed the Tier is still shown by its static dash pattern.

### content/

- `strings.ts` exports a nested `const` catalogue plus small template functions, for example `tierWording(tier, confidencePct)`. Every entry has a `kind`: `'lighting'` for text that describes a segment's lighting, otherwise `'general'`. A test enumerates the catalogue with sample arguments.
- `DISCLAIMER` is the verbatim text from the product steering file, defined once and rendered by every route screen (Requirement 6.9).
- Tier wording: "confirmed lit in OpenStreetMap", "mapped as unlit", "estimated: brighter than most streets here", "estimated: typical", "estimated: darker than most streets here". Estimated Tiers append the confidence as a whole percentage, for example "estimated: typical (confidence 62%)". `Math.round(confidence x 100)` is used (Requirement 3.9).
- `bannedWords.ts` (in `tests/`, as the glossary says) holds the list from `product.md`: "safe route", "safest", "guaranteed", "secure", "dangerous area", "bad neighborhood". `findBanned(text)` lowercases, splits into word tokens on any non-letter, non-digit character, and looks for each entry as a contiguous run of whole tokens. So "Secure" and "SECURE!" match, while "securely" and "insecure" do not (Requirements 12.1, 12.10).
- `validationDoc.ts` imports `docs/validation.md?raw` at build time (Requirement 12.7) and exposes `parseValidation(text)`. It finds sections headed `### <city>: <kind>` and, in each table, reads the header row to locate the `Model` and `Highway-footway-rate baseline` columns and takes the `AUC` row. Figures stay as the original strings so they are quoted exactly. A city "did not beat" the baseline when its parsed model number is lower than the baseline number. Precision rows are never read or shown (Requirement 12.6). Cities with a "hold-out validation skipped" line are listed with that reason instead of numbers. If parsing finds no tables the screen shows "validation numbers are unavailable" and still shows the statements for Requirements 12.3 to 12.5. The link to the raw text opens an in-app view of the bundled string with no network request.

### search/ (Requirement 19)

`search/streetSearch.ts` and `search/comboboxState.ts` are pure. They read no map, DOM, storage or network, print nothing, and keep no state between calls. The rules they implement are in the decisions table ("Street search: ..." rows).

```ts
export interface Centre { lon: number; lat: number }               // passed in; the shell reads it from the map
export type Compass = 'N' | 'NE' | 'E' | 'SE' | 'S' | 'SW' | 'W' | 'NW';

export interface Stretch {
  key: string;                                  // smallest segment id in the stretch, by code unit
  name: string;                                 // raw name of that Segment
  norm: string;                                 // normalised name
  segmentIds: ReadonlyArray<string>;            // ascending by code unit
}
export interface StreetIndex {                  // built once per loaded City_Pack, holds strings and numbers only
  readonly entries: ReadonlyArray<StretchEntry>;   // Stretch + tokens + midpoint, in key order
}
export interface SearchResult {
  name: string;
  stretchKey: string;
  lon: number; lat: number;                     // midpoint by length along the stretch
  distanceM: number;                            // haversine from the centre, unrounded
  bearingDeg: number;                           // 0 to under 360, clockwise from north
  direction: Compass;
}
export type RoundedDistance = { kind: 'here' } | { kind: 'm'; metres: number } | { kind: 'km'; km: number };

export function normalise(text: string): string;
export function groupStretches(segments: ReadonlyArray<Segment>, graph: StreetGraph): Stretch[];  // also used by the statistics script
export function buildStreetIndex(segments: ReadonlyArray<Segment>, graph: StreetGraph): StreetIndex;
export function searchStreets(index: StreetIndex, query: string, centre: Centre): SearchResult[];
// at most 8, the first 8 of the total order: tier, normalised-name length, normalised name,
// unrounded haversine distance from `centre` (nearest first), stretch key. `centre` is part of the sort.
export function compassOf(bearingDeg: number): Compass;
export function roundDistance(distanceM: number): RoundedDistance;
```

- `searchStreets` throws `ArgumentError('query', ...)` when `query` is not a string, and `ArgumentError` naming `centre` (through `requireLatLon('centre', lon, lat)`) when the centre longitude or latitude is NaN, infinite or out of range. It returns no result in those cases (Requirement 16.3). A query that is a string but too short or empty is not an error; it returns `[]`.
- `searchStreets` matches every entry, computes the unrounded haversine distance for each match (the comparator needs it), sorts the matches by the total order of the decisions table, keeps the first 8, then computes the bearing and direction for those 8 only. Cost per keystroke: one pass over the entries (a prefix check on a few tokens each), one haversine per match and a sort of the matches; thousands of entries, expected far under the 100 ms target of Requirement 19.10, to be measured. `roundDistance` is applied to the 8 kept results for display only and never feeds the comparator.
- `buildStreetIndex` runs `groupStretches`, normalises each name once, and computes each midpoint once with the midpoint rule. It throws `ArgumentError` naming `segments` or `graph` when given a non-array or a missing graph.
- `roundDistance` and `compassOf` implement the wording rules in the decisions table. The text itself is made in `content/strings.ts` by `searchOffsetWording(rounded, direction)`, so `search/` imports no wording and the 8 compass words and the template are in one string file.
- Wording added to `content/strings.ts` (own words, checked by `findBanned` and by the own-wording test of Requirement 18.11): `search.helper` ("Only named streets can be found by search. You can also tap the map, use the crosshair or use your location." The unnamed-streets note: "Streets without a name are not in the search."), `search.shortQuery` ("Type at least 2 characters to search named streets."), `search.noMatch` ("No named street matches that."), `search.count(n)` ("1 street found" or "n streets found"), `search.unavailable.noPack` ("Street search is available once a city has loaded."), `search.unavailable.loading` ("Street search is available once the city has finished loading."), `search.unavailable.indexing` ("Street search is getting ready."), the 8 compass words ("north", "north-east", "east", "south-east", "south", "south-west", "west", "north-west"), and the offset template: `about 600 m north-east`, `about 1.2 km south`, and for the `here` case `at the map centre`. All have `kind: 'general'`. None uses a Banned_Words entry or says anything about safety.
- Two more strings in `content/strings.ts` (own words, `kind: 'general'`): `search.openLabel` = "Search streets" (the label of the Map_Screen sheet button, Requirement 18.2) and `hint.setPoints` = "Tap the map or type a street name to set where you start and where you're going" (79 characters, at most 90; Requirement 17.10). The design did not quote an earlier Map_Screen hint, so this is added, not replaced. Both are enumerated by the banned-word test and the own-wording test against `reference.html`. A new example test checks that `hint.setPoints` is at most 90 characters, mentions typing a street name, and equals the text the Reset_Control shows (Requirement 17.13). `guidance.ts` reads the hint by its key and needs no change.
- Entry point in `ui/streetCombobox.ts` terms: the fields live only on the Route_Screen. The Map_Screen button navigates there; on arrival with no route the start field is focused so a keyboard user can type at once (the focus move happens on the `hashchange` to `#/route` only, never on page load, so no focus is stolen on first run).

`search/comboboxState.ts` is a pure reducer so the keyboard and announcement rules can be tested in the node environment without a DOM (decision: yes, pure; `ui/streetCombobox.ts` only maps DOM events to actions and state to attributes).

```ts
export type Availability = 'ready' | 'no-pack' | 'loading' | 'indexing';
export interface ComboState {
  availability: Availability;
  query: string;
  results: ReadonlyArray<SearchResult>;
  open: boolean;
  activeIndex: number;                           // -1 means none
  status: 'idle' | 'short' | 'results' | 'noMatch';
}
export type ComboAction =
  | { type: 'input'; query: string; results: ReadonlyArray<SearchResult> }   // the shell runs searchStreets first
  | { type: 'arrowDown' } | { type: 'arrowUp' } | { type: 'enter' }
  | { type: 'escape' } | { type: 'blur' }
  | { type: 'pointerChoose'; index: number }
  | { type: 'availability'; value: Availability }
  | { type: 'reset' };
export function comboStep(s: ComboState, a: ComboAction): { state: ComboState; chosen: SearchResult | null };
export function announcement(s: ComboState): string | null;
```

- `input`: the query is stored. If the trimmed query has fewer than 2 code points the status is `short`, results are empty and the list is closed. Otherwise `results` come from the shell: zero results gives `noMatch` (closed list), one or more gives `results`, open, with `activeIndex` -1. When `availability` is not `ready`, `input` is ignored.
- `arrowDown`: if there are results and the list is closed, open it at index 0; if open, move to the next option and wrap from the last to the first. `arrowUp`: open at the last option when closed; when open move to the previous option and wrap from the first (or from -1) to the last.
- `enter`: if the list is open and `activeIndex` is 0 or more, return that result as `chosen`, close the list and set `activeIndex` to -1. With no active option it chooses nothing (no accidental choice). `pointerChoose` does the same for the given index (an index outside the results chooses nothing).
- `escape`: close the list and set `activeIndex` to -1; the query text and results are kept. `blur` (Tab leaving the field) closes the list and chooses nothing.
- `availability` other than `ready` clears query, results, activeIndex and closes the list. `reset` returns the initial state with the current availability (used on City_Pack switch).
- `announcement(s)` gives the text for the live region: `search.count(n)` for `results`, `search.noMatch` for `noMatch`, `search.shortQuery` for `short`, and null for `idle`. Moving with the arrow keys makes no announcement; the screen reader reads the active option through `aria-activedescendant`. The `short` text is a plain status message, never styled or announced as an error (Requirement 19.7).

### Street-name statistics script (Requirement 19.11)

`app/scripts/streetNameStats.ts` follows `app/scripts/routeStats.ts`: offline, no network request, console output only, writes nothing except a temporary build folder that is deleted afterwards. Run from `app/`:

```
npx vite build --ssr scripts/streetNameStats.ts --outDir .stats-tmp --emptyOutDir; node .stats-tmp/streetNameStats.js; Remove-Item -Recurse -Force .stats-tmp
```

It loops over `PACKS` and calls `loadPack(id)` from `pickSampleWalks.ts`. `loadPack` currently returns `graph`, `tierOf`, `median` and `index`; the implementation task adds `segments` to that return (a one-field addition that does not change its other uses). For each city it prints: the number of Segments; the share of Segments whose name is non-empty after `normalise` (percent, one decimal); the number of distinct normalised names; the number of those names with more than one stretch; and that number as a share of the distinct names (percent, one decimal, "n/a" when there are no names); and the largest number of stretches that share one normalised name, with that name (when several names tie, the one with the smallest normalised name by code unit; "n/a" when there are no names). This last figure is read from the same `groupStretches` result as the others (group the stretches by `norm`, take the largest group), so it cannot drift from the index. Printed line format, one line per pack, with fixed field order: `<city>: segments=<n> named=<p>% names=<n> multi-stretch=<n> (<p>%) most-stretches=<n> "<normalised name>"`, for example `seattle: segments=17402 named=61.3% names=2210 multi-stretch=640 (29.0%) most-stretches=14 "main street"` (the figures in this example line are placeholders for the format only and are not results). It imports `groupStretches` and `normalise` from `src/search/streetSearch.ts`, so the count uses exactly the grouping rule of the index and cannot drift from it. The script is run by the user. Its output is not cited in `docs/` until the user has confirmed it.

### state/appState.ts

A pure reducer `(state, action) => state`. State holds mode (`plan` or `report`), setting state (`start` or `end`), start and end positions, `exampleActive`, lambda, settings, reduced-effects, demo flag, and selected segment. Actions: `tap`, `setStartHere`, `setEndHere`, `useLocation`, `chooseStreet` (a chosen Search_Result's midpoint for the start or the end, Requirement 19.4), `switchMode`, `chooseSettingState`, `clearExample`, `reset`. `clearExample` clears the example start, end and route and returns to Plan_Mode in Start_Setting_State. In Report_Mode a tap never changes start or end; in Plan_Mode a tap never selects a segment (Requirements 6.1, 6.11, 10.1). While `exampleActive` is true, every point-setting action (a Plan_Mode `tap`, `setStartHere`, `setEndHere`, `useLocation`, `chooseStreet`) first clears both example points and the flag, then applies the new point alone; the state then follows the general rule below, which also applies when the example is not active. Report_Mode taps do not clear the example (Requirement 17.17). One helper computes the setting state from the resulting start and end: the unset point's state when exactly one is unset, otherwise the prior state; `setStart` and `setEnd` both use it, and `chooseSettingState` overrides it manually. Longitude and latitude are validated before any state change. Snapping and routing happen in effects triggered by state changes, not inside the reducer.

### map/

- `style.ts` returns the bundled style. `mapView.ts` creates the `maplibregl.Map` with `maxPitch: 60`, `attributionControl: { compact: false }` (always open, so it cannot be collapsed behind a button) and the always-visible attribution "OpenFreeMap © OpenMapTiles Data from OpenStreetMap" (each part a link) plus "© OpenStreetMap contributors", set as the vector source `attribution` in `style.ts` (Requirement 5.3). A test checks that the attribution string contains the three links and the contributors text. The attribution control is placed `top-left` and moved by CSS into a strip under the header, above every sheet, so nothing covers it (Requirement 18.10).
- Buildings use a `fill-extrusion` layer with `fill-extrusion-height` read from `height_m`. Buildings skipped by `parseBuildingsFile` are never added.
- `layers.ts` adds the Segments source with `promoteId: 'id'` and `tier` and `conf` properties copied into each feature. The "your note" marker uses feature-state: the shell calls `map.setFeatureState({ source, id }, { noted: true })` when a note is saved or restored (and `false` when removed), and the marker layer filters or styles on `['feature-state', 'noted']`. No GeoJSON data is rebuilt when a note changes. The id passed is the pack's `id` property in its original type (a number in the shipped files), then the cohort layers, the "your note" marker layer (driven by MapLibre feature-state, see below), and the route layer last so the lantern path stays on top (Requirement 4.6).
- Start and end markers (Requirement 6.12) are two `circle` layers on one GeoJSON source, added after the "your note" layer and before the route casing. Start is a filled lantern disc, end is a hollow pumpkin ring (larger, thicker stroke), so shape differs as well as colour. The pure `buildMarkersGeoJSON(start, end, snapTo)` gives each point its Snap position when `snapTo` returns one and its tapped position otherwise, so a marker shows as soon as the point is set.
- Reference styling (Requirement 18.7): the route casing is white and the route line uses `line-gradient` from pumpkin to glow, so the route source is added with `lineMetrics: true`. The start disc is pumpkin with a white stroke, the end ring is a translucent night fill with a thicker white stroke. Buildings are extruded in a light violet (`TONES.building`) at 0.6 opacity.
- `tileWatch.ts` implements the 5 s rule. When it fires, base layers get `visibility: none`, Segments stay on the plain background, and the message appears. Routing is unaffected (Requirements 5.7, 17.12).
- The map layer reads frame counts with `requestAnimationFrame` and passes `fps` to `stepEffects` once per second.

### ui/ screens (Requirement 18)
- `state/screens.ts` (pure): `type Screen = 'map' | 'route' | 'report' | 'about' | 'credits'`, `screenFromHash(hash): Screen` (unknown or empty gives `'map'`, a trailing slash or query is ignored) and `hashOf(screen): string`. `hashOf` then `screenFromHash` returns the same screen. `screenFromHash` looks at the hash only: `#/route` gives `'route'` whether or not a route exists, so the "Search streets" button on the Map_Screen can open it with no route planned (Requirements 18.2, 18.3).
- `ui/shell.ts` builds one layer per screen. The Route_Screen layer is built once and works with no route: its back control, the two Street_Comboboxes (start and end, with the helper line) and the four routing settings are always drawn; `ui/routePanel.ts` shows the Heartbeat_Chart, the stretches list, the side-by-side comparison and the Disclaimer only while a route is shown, and with no route shows a short "no route yet" line (or, after a failed plan, "No walking route found") with the way back to the Map_Screen (Requirement 18.3). The map and its overlays (header, chip row, attribution strip, Crosshair) stay mounted. The Map_Screen sheet and the Report_Screen sheet sit over the map; the Route_Screen, How_Gloam_Guesses_Screen and Credits_Screen are full-page layers over it. `showScreen(screen)` sets `data-screen` on the shell, and CSS shows the matching layer. Screen changes are synchronous.
- `main.ts` listens to `hashchange`. Entering `report` dispatches `switchMode: report`; any other screen dispatches `switchMode: plan`. The Mode_Switch buttons change the hash, so mode and screen never disagree.
- `routing/stretches.ts` (pure): `routeStretches(pieces, info)` where `info(edge)` gives `{ segmentId, name, tier, confidence, lengthM }` for the piece's length. Consecutive pieces with the same `name` and `tier` merge into one stretch; the stretch confidence is the lowest of its pieces; lengths add. `estimatedCount(stretches)` counts stretches whose Tier is one of the three estimated Tiers. `wholeMetres(stretches)` gives the displayed lengths by the largest-remainder method: each length is floored, and the metres still needed to reach `Math.round(total)` go one each to the largest fractional parts, ties to the earlier stretch (Requirement 18.6).
- The Map_Screen route card and tiles, the compact Heartbeat_Chart (the same chart with a smaller height and no key) and the Route_Screen list are drawn by `ui/routePanel.ts`. The Report_Screen reuses `ui/reportPanel.ts`. The Map_Screen sheet has a `collapsed` class: it hides everything except `.sheet-keep` parts (the details button, the Disclaimer while a route is shown and, if the measurement below allows, the "Search streets" control) and sets them at a smaller size, so the walking time is not drawn while collapsed (Requirement 18.9). Entry point to street search (Requirements 6.10, 18.2): the expanded sheet always holds a "Search streets" control, whether or not a route exists. It is a `<button type="button">` (not a link) with class `sheet-search`, label `search.openLabel` from `content/strings.ts`, `min-height: 44px`, reachable in the normal tab order; its click handler sets `location.hash` to the value of `hashOf('route')` (`#/route`), and the `hashchange` listener in `main.ts` shows the Route_Screen, so the browser back button returns to the Map_Screen. It is drawn by `ui/mapSheet.ts` outside the route card, so it exists with no route. Collapsed bar: the CSS rule is `.sheet.collapsed > :not(.sheet-keep) { display: none }`, so one class on one element decides, with no other style change. Default: the template does NOT add `sheet-keep` to `sheet-search` (expanded sheet only), because the bar with a route shown, the grab handle, the details button, the 44 px search control and the three-line Disclaimer is estimated at about 200 to 215 px against the limit of 211 px (25 percent of 844 at 390 x 844), too close to promise. The manual measurement (collapsed bar height with a route shown, at 390 x 844, in the browser developer tools) is recorded in `docs/app-checks.md`. IF the measured height with the control is at most 211 px, the template adds `sheet-keep` to it (a one-word change) and the control appears in the collapsed bar at the smaller size; IF it is above 211 px, the class stays off and the control is in the expanded sheet only (Requirement 18.2). While the start or end is unset the sheet shows the hint `hint.setPoints` (Requirement 17.10). A "change start or end" control, if used while a route is shown, groups the Crosshair buttons, the "tap sets" control and "use my location" behind one tap as in Requirement 6.10; it never holds or replaces "Search streets", so the street fields stay reachable in one tap from the sheet whether or not it is used. Hint wording: `hint.setPoints` is shown by the existing hint element, which reads it by key (`guidance.ts` is unchanged) and the Reset_Control shows the same text (Requirement 17.13). The pack estimates note is parsed and kept in `PackMeta` but never drawn (Requirement 1.8). The four routing settings sit on the Route_Screen, in a card that the route views never redraw, so a change keeps focus on the toggle (Requirement 18.3). The How_Gloam_Guesses_Screen and Credits_Screen replace `ui/infoDialogs.ts` with `ui/guessScreen.ts` and `ui/creditsScreen.ts`; the validation text and link are drawn as before.
### ui/streetCombobox.ts (Requirement 19, shell)

One combobox per field; the Route_Screen has two, a start field and an end field (Requirement 18.3). Both stay visible when no route exists. The control is a thin shell over `comboStep`: it turns DOM events into actions, runs `searchStreets`, and renders state to attributes.

- **Pattern (ARIA 1.2 combobox).** The input has `role="combobox"`, `aria-expanded`, `aria-controls` (the listbox id), `aria-autocomplete="list"`, `aria-activedescendant` (the active option id, removed when none) and `aria-describedby` (the helper line). The list is `role="listbox"` with an `aria-label`; each result is `role="option"` with a unique id, and `aria-selected="true"` on the active one. The label of each input is a real `<label>` ("Start" or "End" in the app's wording).
- **Keyboard.** ArrowDown and ArrowUp move through the options and wrap. Enter chooses the active option. Escape closes the list and keeps the typed text. Tab leaves the field and closes the list without choosing. A pointer or touch tap on an option chooses it.
- **Option size.** Each option is at least 44 px high (Requirement 19.1) with its name and, on a second line, the offset wording from `searchOffsetWording`, for example "Main Street" and "about 600 m north-east". Two results with the same name differ by that text, never by colour. The active option has a 2 px outline and a bold name, so it is distinguishable without colour.
- **Live region.** One `role="status"` element with `aria-live="polite"` and `aria-atomic="true"` per field. After each input event the shell writes `announcement(state)` to it: results count, no match, or the short-query hint. The short-query hint is a plain status line, not an error; nothing is announced on page load.
- **Helper line.** Under each field, always visible, the `search.helper` text: only named streets can be found by search, and tapping the map, the Crosshair buttons and "use my location" still set any point (Requirement 19.5).
- **Debounce.** None. The search is synchronous and cheap (one pass over the entries), so results update on every `input` event, which keeps the 100 ms target of Requirement 19.10 without a timer. Nothing is deferred, so there is no pending search to cancel; `reset` and `availability` actions simply discard the current state.
- **When search is unavailable.** With no City_Pack loaded, while a City_Pack is loading, or until the index has been built, the input is `disabled` and the helper line is replaced by the matching `search.unavailable.*` message (linked by `aria-describedby`). The three reasons are the `availability` values `no-pack`, `loading` and `indexing`.
- **City_Pack switch (Requirement 19.8).** When the user chooses a different City_Pack, the shell, before the new pack loads: clears the `setTimeout` that would build the old index, drops the `StreetIndex` reference, sets the input value to an empty string, and dispatches `availability: 'loading'` to both fields (which clears query and results and closes the lists). When the new pack's graph is built, the index build is scheduled again and, when it completes, `availability: 'ready'` is dispatched. A load that is cancelled by a newer choice (Requirement 1.11) never reaches the index build.
- **Choosing a result.** The shell dispatches `chooseStreet` with the field's own kind (start or end) and the result's `lon` and `lat` to the app reducer, then sets the input to the result's name. Snapping, the 150 m rule, the out-of-area message and the Sample_Walk clearing run as for a tapped point. If the point does not snap, the existing messages show ("too far from a street" of Requirement 6.6, or no street data of Requirement 1.9) and the other point is unchanged.
- **Reduced effects.** The list has no animation or transition in either mode (no fade, no slide), so Reduced_Effects_Mode needs no extra rule; the active-option outline is static.
- **Styling.** The list and the field group sit on a frosted-glass card (white at 13 percent, a 1.5 px border of white at 28 percent, backdrop blur). The field labels and the option names use DM Sans (bold for names); Caprasimo is used only for the Route_Screen heading above the fields. Contrast and focus indicators follow Requirement 15.4. The listbox sits below the input, is at most 8 options tall (about 8 x 44 px), and is placed so the helper line stays visible when it is closed.
- **Privacy.** The query is never stored, logged or sent (Requirements 13.12, 19.2). The shell holds it in the input element and one in-memory variable, and clears both on a City_Pack switch.

## Data Models

### City_Pack files (input)

```jsonc
// segments
{ "type": "FeatureCollection",
  "metadata": { "schema_version": 1, "kind": "segments", "city": "Kuala Lumpur",
                "attribution": "© OpenStreetMap contributors", "estimates_note": "..." },
  "features": [ { "type": "Feature",
      "geometry": { "type": "LineString", "coordinates": [[101.722657, 3.147889], ...] },
      "properties": { "id": 4578273, "name": "Jalan Bukit Bintang", "highway": "secondary",
                      "lit_probability": 0.897, "confidence": 0.282, "label_source": "estimated" } } ] }
```

`id` is a JSON number in the shipped files and is converted with `String(id)`. Canonical_Order compares these strings by code unit, so `"10"` sorts before `"9"`. Buildings features carry a footprint and `height_m`.

### Manifest and Sample_Walk

```ts
export interface ManifestEntry {
  id: 'seattle' | 'kl' | 'london' | 'berlin' | 'manchester';
  label: string;                         // City_Picker text
  // no description: a City_Picker entry shows the city name only (Requirement 1.3)
  segmentsUrl: string; buildingsUrl: string;     // from import.meta.glob
  sampleWalk: { start: [lon: number, lat: number]; end: [lon: number, lat: number] };
}
```

Seattle is the first-run pack (Requirement 1.2). Each entry has exactly one Sample_Walk (Requirement 14.8). There are five Sample_Walks, one per pack. A dev script picks each one once, then the points are fixed: for each of the five packs it searches for a walk whose Gloam_Route at lambda 3 (all toggles off) crosses at least 3 different Tiers and differs from the Shortest_Route. A test checks, for each pack, that start and end snap, a route exists, the Gloam_Route differs from the Shortest_Route at lambda 3 with toggles off, and that route crosses at least 3 different Tiers (Requirement 14.9). Another test checks that every Sample_Data segment id exists in the Segment_File of its pack (Requirement 14.10).

### Sample_Data

```jsonc
{ "schema_version": 1, "label": "SAMPLE DATA",
  "corrections": [ { "city": "seattle", "segment_id": "123456", "type": "actually_dark", "days_ago": 4 } ] }
```

`days_ago` is converted to a `YYYY-MM-DD` date at load. Sample corrections are held in a separate list from the local store and never written to local storage (Requirement 14.5). The file is fetched only while Demo_Mode is on (Requirement 13.5).

### Device storage

| Key | Value |
|---|---|
| `gloam.settings.v1` | `{"avoidSteps":false,"avoidService":false,"preferMain":false,"lowConfidenceDarker":false}` |
| `gloam.corrections.v1` | `[["4578273","actually_dark","2025-11-09"]]` (segment id, report type, date; nothing else) |

No cookies are set. No other key is written (Requirement 13.3).

### Derived in memory

- `Map<string, Tier>`: Tiers, computed once per pack and never recomputed from notes (Requirement 10.12).
- `Map<string, Override>`: the device's own notes. Built from the store; the latest `put` per segment wins.
- `medianConfidence`, `lowConfThreshold`: numbers computed once per pack from original values.
- `Map<string, CommunityStatus>`: recomputed from local plus sample Corrections for display only.


## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

Reflection: the prework produced about 60 testable criteria. Redundant ones were merged. Tier mapping, equal-probability, monotonicity and distribution counts became one Tier property. Dread bounds and finiteness became one. The lambda optimality and lambda-zero criteria became one model-based property. Sample-walk validity (Requirement 14.9) depends on real data and stays an example test per city. Street search (Requirement 19) adds Properties 36 and 37: the match, cap, case and diacritic rules and determinism are one property, and silence (no network, no storage, no console) is a second, in the style of Property 33. Combobox keyboard handling, wording and the real-pack lookups are example tests. UI timing, layout, hosting reach and frame-rate targets are measured, not property-tested.

### Property 1: Dread is bounded, finite and matches the formula

*For any* `litProbability` and `confidence` in 0 to 1 inclusive, `dread` returns a finite number between 0 and 1 equal to `raw + (1 - confidence) * max(0, 0.5 - raw)` with `raw = 1 - litProbability`. *For any* valid Edge view, finite `lambda` of 0 or more and Personal_Settings, `edgeCost` is finite.

**Validates: Requirements 7.2, 16.1, 16.2**

### Property 2: Invalid input is rejected with the argument name

*For any* scoring, tier or routing function and *for any* input that is NaN, positive or negative infinity, or outside its valid range (`litProbability`, `confidence`, `lambda`, `lengthM`), the function throws an `ArgumentError` whose message contains the offending argument's name and returns no result. For `assignTiers` the message also names the segment id and no Tier map is returned.

**Validates: Requirements 3.10, 7.10, 16.3**

### Property 3: Pack validation accepts valid files and rejects every listed defect

*For any* generated valid Segment_File, `parseSegmentFile` accepts it. *For any* generated Segment_File with one injected defect (unsupported `schema_version`, `lit_probability` or `confidence` that is NaN, infinite or outside 0 to 1, or a non-LineString geometry), it returns a `PackProblem` of kind `invalid` that names the segments file. *For any* Buildings_File, a building with `height_m` missing, non-finite or below 0 is skipped with a problem naming `height_m`, and every other building is kept.

**Validates: Requirements 1.6, 1.7, 5.8**

### Property 4: Graph construction does not depend on input order

*For any* set of Segments and *for any* permutation of it, `buildGraph` returns the same nodes, the same Edges and the same Edge attributes.

**Validates: Requirements 2.3, 16.9**

### Property 5: Graph construction splits at shared coordinates and preserves attributes and length

*For any* set of valid Segments (including closed Segments and several disconnected parts), every coordinate shared by two or more Segment positions, and every Segment endpoint, is a graph node, and no Edge has a node coordinate in its interior. Each Edge carries its source `segmentId`, `labelSource`, `highway`, `litProbability` and `confidence` unchanged, and the Edge lengths of each Segment sum to its polyline length within 0.001 m.

**Validates: Requirements 2.1, 2.2, 2.4, 2.5, 2.6, 16.10**

### Property 6: Invalid Segments are rejected individually

*For any* mix of valid Segments and Segments with fewer than 2 coordinates, a NaN, infinite or out-of-range coordinate, or a bad `litProbability` or `confidence`, `buildGraph` reports a rejection naming the segment id and the invalid field for each bad Segment and produces the same graph as building from the valid Segments alone.

**Validates: Requirements 2.8**

### Property 7: Tier assignment is total, rule-correct and rank-monotone

*For any* set of Segments, `assignTiers` gives each Segment exactly one Tier. `tagged_lit` maps to `confirmed_lit` and `tagged_unlit` to `mapped_unlit`. For Estimated_Segments, two with equal lit probability get the same Tier, and if the first has a lit probability at least the second's, its Tier is the same as or brighter than the second's. When all Estimated lit probabilities are distinct and there are `n` of them, exactly `ceil(2n/5)` get `brighter_than_most` and exactly `n - ceil(3n/4)` get `darker_than_most`. A set with zero Estimated_Segments is accepted.

**Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.11, 16.11**

### Property 8: Tiers depend on rank only

*For any* City_Pack and *for any* strictly increasing transformation of its Estimated lit probabilities that keeps distinct values distinct, `assignTiers` returns the same Tier for every Segment. No input value such as 0.5 changes a Tier except through its rank.

**Validates: Requirements 3.7, 12.8, 16.20**

### Property 9: The router returns a cheapest route

*For any* small generated Street_Graph, snapped start and end, `lambda` from 0 to 10, Personal_Settings and overrides, the cost of the route returned by `findRoute` equals the minimum Route_Cost over all simple paths found by brute-force enumeration, within the Comparison_Tolerance. At `lambda` 0 its Routing_Distance equals the minimum Routing_Distance over all simple paths.

**Validates: Requirements 7.3, 7.4**

### Property 10: Raising lambda never raises Dark_Exposure

*For any* Street_Graph, start, end, fixed Personal_Settings and lambdas `l1 < l2`, the Dark_Exposure (with setting-adjusted Dread) of the route at `l2` is at most that at `l1`, within the Comparison_Tolerance.

**Validates: Requirements 7.5, 16.4**

### Property 11: Raising lambda never shortens Routing_Distance

*For any* Street_Graph, start, end, fixed Personal_Settings and lambdas `l1 < l2`, the Routing_Distance of the route at `l2` is at least that at `l1`, within the Comparison_Tolerance.

**Validates: Requirements 7.6, 16.5**

### Property 12: Ties go to the first route in Canonical_Order, whatever the input order

*For any* generated Street_Graph that contains two or more routes of equal Route_Cost between the snapped points (the generator builds parallel and diamond alternatives with identical attributes) and *for any* permutation of the input Segments, `findRoute` returns the same route, and its sequence of Edge segment ids is the first in Canonical_Order among all cheapest routes.

**Validates: Requirements 7.7, 16.6**

### Property 13: Returned routes are valid paths, and disconnected points give no route

*For any* returned route, every piece exists in the graph, each piece ends where the next begins, the first begins at the snapped start and the last ends at the snapped end. *For any* graph where the snapped points lie in different connected parts, `findRoute` returns `null`.

**Validates: Requirements 6.8, 16.7, 16.8**

### Property 14: Settings change cost exactly as specified

*For any* Edge view and Personal_Settings, `routingLength` equals `lengthM x (1 + n)` where `n` is the number of enabled toggles whose rule matches the Edge's highway, and equals `lengthM` when all toggles are off. With "treat low-confidence guesses as darker" on, `adjustedDread` uses confidence 0 exactly when the Edge's effective confidence is strictly below the median, and the unchanged confidence otherwise.

**Validates: Requirements 8.3, 8.4**

### Property 15: Snapping finds the nearest point within 150 m or reports none

*For any* generated graph and query point, `snap` returns a point whose distance equals the brute-force minimum distance to any Edge polyline (within 0.01 m) when that minimum is at most 150 m, and `null` otherwise. The result is the same for any order of Edges. A point outside the pack bounds grown by 150 m is reported as out of area.

**Validates: Requirements 1.9, 6.5, 6.6**

### Property 16: Tier shares are whole percentages summing to exactly 100

*For any* route with total length above 0 and *for any* split of its length across Tiers, `tierShares` returns five non-negative integers that sum to 100, each within 1 of the exact share. *For any* whole-metre distance, `walkingMinutes` equals the smallest integer `k` with `k x 5000 / 60 >= metres`.

**Validates: Requirements 6.7, 16.22**

### Property 17: Route comparison deltas are signed differences, and equal routes give zero

*For any* two route summaries, `compareRoutes` returns the extra displayed metres, extra whole minutes and change in `darker_than_most` metres as signed differences of the Gloam_Route from the Shortest_Route computed from displayed values. When both summaries are the same route, all three are 0.

**Validates: Requirements 7.8, 7.9**

### Property 18: Heartbeat series and summary match the route

*For any* route and confidence list, `heartbeatSeries` has pieces whose `x` ranges are contiguous from 0 to the route's total distance, whose `y` values equal each piece's setting-adjusted Dread (between 0 and 1) so a higher Dread plots higher, and whose low-confidence markers are present exactly on pieces at or below the lowest-quarter threshold. When no piece is flagged the text summary says no low-confidence stretches were found; otherwise it lists each stretch's span in metres, each highest-quarter Dread span, and the total distance.

**Validates: Requirements 9.1, 9.2, 9.3, 9.4, 9.5**

### Property 19: Report weight halves every 30 days and never grows

*For any* Correction date and `today`, `reportWeight` is at least 0 and at most 1 (and greater than 0 for ages up to 50 years), equals 1 when the date is today or later, and equals `0.5 ^ (days / 30)` otherwise. *For any* Correction and two times `t1 <= t2`, the weight at `t2` is at most the weight at `t1`.

**Validates: Requirements 10.4, 16.14**

### Property 20: The status rule follows the sides, ignores order and ignores single reports

*For any* set of Corrections, `communityStatus` returns the lit side when the weighted lit sum is at least 3 and strictly above the dark sum (where dark combines `actually_dark` and `light_is_out`), the dark side in the mirrored case, and no status otherwise. The number of people reported is the count of agreeing Corrections. The result is the same for every permutation of the set. *For any* Segment with exactly one Correction the status is none.

**Validates: Requirements 10.5, 10.6, 10.7, 16.12, 16.13**

### Property 21: Notes change per-user values only, never Tiers or status-driven routing

*For any* pack and set of notes, applying overrides changes the effective `litProbability` and `confidence` of exactly the Edges of the noted segments (to 1 or 0, and 1), `assignTiers` over the pack returns the same Tiers before and after, and `findRoute` returns the same route whether or not Community_Statuses are computed for the same Corrections.

**Validates: Requirements 10.3, 10.11, 10.12**

### Property 22: Stored data round-trips and holds only the allowed fields

*For any* set of Corrections, writing them to a `CorrectionStore` and reading them back returns one record per segment id with exactly the three fields segment id, report type and date (the latest `put` wins), and the serialised form contains no other field. *For any* Personal_Settings, serialising and parsing returns equal settings. A failed write leaves earlier data unchanged.

**Validates: Requirements 8.5, 8.6, 10.2, 10.9, 13.10**

### Property 23: The dark-spot list is ordered, limited and filtered

*For any* set of Corrections, `darkSpots` lists only segments with at least one `actually_dark` or `light_is_out` report, orders them by total count descending then segment id ascending, keeps at most 20, and reports each type's count correctly.

**Validates: Requirements 11.1**

### Property 24: CSV output is quoted, guarded and complete

*For any* list of dark spots, including names with quotes, commas, newlines and leading `=`, `+`, `-`, `@`, tab or carriage return, `toCsv` produces a header row and one row per spot in order, every field in double quotes with embedded quotes doubled, no field starting with a formula character after unquoting (a single quote is prefixed), an empty name for unnamed segments, and no columns other than name, highway, segment id and the two counts. Parsing the output recovers the original values (apart from the guard prefix).

**Validates: Requirements 11.3, 11.5**

### Property 25: The banned-word matcher finds whole words and phrases only

*For any* banned entry, any letter case, any surrounding punctuation and whitespace, and any filler text, `findBanned` finds the entry. *For any* text where the entry appears only inside a longer word, it finds nothing. The Disclaimer and every catalogue string produce no match.

**Validates: Requirements 12.1, 16.15**

### Property 26: Quoted validation figures equal the document's

*For any* generated validation document with cities, model AUC and baseline AUC strings, `parseValidation` returns each figure exactly as written, lists as "did not beat" exactly the cities whose model figure is lower than the baseline figure, reads no precision value, and returns an unavailable result when no table is present.

**Validates: Requirements 12.6, 12.9, 12.11**

### Property 27: Flicker never exceeds the cap

*For any* confidence from 0 to 1 inclusive, `maxFlickerRate` is at most 3 flashes per second and every interval produced for any seed is at least the minimum implied by `flickerParams`.

**Validates: Requirements 4.7, 16.17**

### Property 28: Brightness changes slowly

*For any* confidence, seed, base brightness and start time, sample `flickerBrightness` with the real update step of 33 ms (`FLICKER_STEP_MS`). The change between any two samples at most 100 ms apart is at most 0.25 of the full range, and the curve's largest slope times (100 ms + 33 ms) is at most 0.25 (1.667 x 0.133 = 0.222). The bound is on the sampled curve, so it includes one step of sampling.

**Validates: Requirements 4.8**

### Property 29: Lower confidence is never less irregular

*For any* confidences `c1 > c2`, `irregularity(c2) >= irregularity(c1)`, and `irregularity(0) > irregularity(1)`.

**Validates: Requirements 4.2, 16.21**

### Property 30: The effects ladder removes one effect at a time and stops at none

*For any* sequence of (fps, time) samples with non-decreasing time, `stepEffects` removes at most one effect per step, removes the first active effect in ladder order, removes one only after 2000 ms of continuous fps below 30, never removes any when fps stays at 30 or more, never adds an effect, and leaves an empty list stable.

**Validates: Requirements 5.6**

### Property 31: Modes and taps behave as specified

*For any* sequence of reducer actions, in Report_Mode a tap never changes start or end, and in Plan_Mode a tap never selects a segment. In Plan_Mode a tap sets the start in Start_Setting_State and the end in End_Setting_State, replacing any earlier point of that kind. After each of the five point-setting actions (`tap`, `setStartHere`, `setEndHere`, `useLocation` and `chooseStreet`; after clearing the example first, if it was active, which leaves only the new point), if exactly one of start and end is unset, the setting state equals the unset point's state; if both are set it equals the prior setting state; `chooseSettingState` overrides it. Hand example: from a fresh state with no example, `setEndHere` at (5, 6) gives start null, end (5, 6), state `start`; a tap at (10, 20) then sets the start, both are set, and the state stays `start`. With start (1, 2), end (3, 4) and state `end`, `setEndHere` at (7, 8) leaves state `end`; with state `start` and both set, a tap at (9, 9) sets the start and leaves state `start`. Report_Mode taps keep the example and the state. The initial state is Plan_Mode and Start_Setting_State. `reset` clears start, end and route, restores the example and the first-run Demo_Mode value.

**Validates: Requirements 6.1, 6.11, 10.1, 17.13, 17.17, 19.4**

### Property 32: Fitted bounds contain every point

*For any* non-empty list of route, start and end coordinates, `boundsOf` returns a box whose corners are the minimum and maximum longitude and latitude, so every point lies inside it, and the box is the smallest such box.

**Validates: Requirements 5.1, 14.7, 17.7**

### Property 33: Pure modules make no network calls

*For any* generated input to the Graph_Builder, Tier_Assigner, Router, snapping, status rule and CSV functions, with `fetch`, `XMLHttpRequest`, `WebSocket` and `navigator.sendBeacon` replaced by stubs that fail the test when called, the number of calls during the run is 0.

**Validates: Requirements 13.4, 13.6, 13.9, 16.16**

### Property 34: Stretches cover the route exactly and never repeat a neighbour
*For any* list of route pieces with names, Tiers, confidences and non-negative lengths, the stretches' lengths sum to the pieces' total length (within the Comparison_Tolerance), no two neighbouring stretches share both name and Tier, every stretch's confidence is the lowest confidence of the pieces it covers, and the estimated count is between 0 and the number of stretches. The whole-metre lengths from `wholeMetres` are non-negative integers, each less than 1 m from its exact length, and they sum to the rounded total length.
**Validates: Requirements 18.2, 18.6**

### Property 35: Screen addresses round-trip
*For any* screen, `screenFromHash(hashOf(screen))` returns that screen. `screenFromHash` removes a leading `#` or `#/`, then everything from the first `/` or `?`, so a trailing slash and a query are ignored. *For any* string whose remainder after that removal is not a known screen name, `screenFromHash` returns `'map'`. Examples: `"#/route/"` and `"#/route?x=1"` give `'route'`; `"#/nonsense"`, `""` and `"#"` give `'map'`.
**Validates: Requirements 18.1**

### Property 36: Street search returns only pack names, ignores case and diacritics, caps at 8 and is deterministic for a given centre

*For any* generated pack (Segments with a mix of names with diacritics, mixed case, repeated names, the same name at distant places, names with `ß`, `ø`, `đ`, `ł`, `æ`, `œ`, and unnamed Segments), its built Street_Graph and *for any* centre and *for any* query: (a) every result's `name` equals the raw `name` of some Segment in the loaded pack and its `stretchKey` is the id of a Segment in the pack; (b) a query that differs only in letter case, in added or removed combining marks on letters, or in `ß` written as `ss` (and the other folded letters written as their folds) returns the same results in the same order for the same centre; (c) `searchStreets` returns at most 8 results, and `[]` when the trimmed query has fewer than 2 code points; (d) the same query, the same centre and the same pack return the same results in the same order, also when the index is rebuilt from any permutation of the same Segments, and the results are the first 8 of the total order tier, normalised-name length, normalised name, unrounded haversine distance from the centre (nearest first), stretch key (checked against a reference sort written in the test).

The generators include several stretches that share one name at varied distances from the centre (including pairs at exactly equal distance), and permutations of the Segment input.

Hand-checked example 3 (distance decides). See "Street search: ranking by distance example" in the decisions table: "Church Lane", 10 stretches, centre (0, 0). Latitude offsets in thousandths of a degree n, distance `n x 111.19508 m` (R x pi / 180 = 111 195.08 m per degree): key "7" at +1 (111.195 m), "31" at -2 (222.390 m), "40" at +3 (333.585 m), "18" at +4 (444.780 m), "12" at -5 and "25" at +5 (both 555.975 m), "60" at -6 (667.170 m), "22" at -7 (778.366 m), "9" at -8 (889.561 m), "5" at +9 (1000.756 m). Query "church lane" returns 8: "7", "31", "40", "18", "12", "25", "60", "22" in that order; "9" and "5" are dropped. "12" precedes "25" only because of the final key tie-break at equal distance. Key order alone would give a different list, and shuffling the Segment input does not change it.

Hand-checked example 1. Segments: id `"10"` "Main Street" from (0, 0) to (0.001, 0); id `"11"` "main  street" from (0.001, 0) to (0.002, 0), sharing the node (0.001, 0); id `"12"` "Main Street" from (0.05, 0) to (0.051, 0); id `"13"` "Maine Road" from (0, 0.001) to (0.001, 0.001); id `"14"` "Élan Way"; id `"15"` with no name. Stretches: `"10"` (ids 10 and 11, joined at the shared node, normal form "main street"), `"12"` (separate place), `"13"` ("maine road"), `"14"` ("elan way"); the unnamed Segment is not indexed. With the map centre at (0, 0). Query "main" (also "MAIN" and "máin"): "main street" and "maine road" both start with "main" (tier 1), neither equals it, and "elan way" does not match. Order by name length: "maine road" has 10 code units and "main street" has 11, so Maine Road (`"13"`) comes first; the two Main Street stretches have equal tier, length and name, so the nearer to the centre comes first (`"10"`, about 111 m from (0, 0), before `"12"`, about 5.6 km). The results are Maine Road (`"13"`), Main Street (`"10"`), Main Street (`"12"`), 3 results. Query "main street": normal form equals the name, tier 0, for stretches `"10"` and `"12"`, nearest first; "maine road" has no token starting with "street", so 2 results. Query "street main": not a prefix of any name, every token starts a name token, tier 2, the same 2 results in the same order. Query "m" and "é": fewer than 2 code points, `[]`. Query "el": "elan way" starts with "el", one result, Élan Way.

Hand-checked example 2. One Segment, id `"20"`, name "Straße des 17. Juni". Normal form: lowercase gives "straße des 17. juni", folding `ß` gives "strasse des 17. juni", tokens strasse, des, 17, juni, joined as "strasse des 17 juni". Query "STRASSE 17": tokens strasse and 17, each a prefix of a name token (not a prefix of the whole name), tier 2, one result. Query "Straße" and "strasse" and "STRAßE": all normalise to "strasse", a prefix of the name, tier 1, the same single result.

**Validates: Requirements 16.23, 19.1, 19.2, 19.6, 19.9**

### Property 37: Street search makes no network request and touches no storage

*For any* generated pack, query and centre, with `fetch`, `XMLHttpRequest`, `WebSocket` and `navigator.sendBeacon` replaced by stubs that fail the test when called, with `localStorage` and `sessionStorage` replaced by objects that throw on every read and write, and with `console` methods spied, building the Street_Index and running `searchStreets` (and `comboStep` and `announcement` on its results) makes 0 calls to the network stubs, 0 storage accesses and 0 console calls.

**Validates: Requirements 13.12, 16.24, 19.2**

## Error Handling

| Situation | Behaviour |
|---|---|
| Pack file missing, unreadable or invalid | `PackProblem` naming the file and kind. Message shown, partial data discarded, previous pack, view and route kept (Requirements 1.6, 15.6). |
| Pack not complete in 15 s | Load aborted, progress indicator replaced by a message and a retry control (Requirement 17.16). |
| Newer city chosen mid-load | Earlier load cancelled with its `AbortController`; only the latest completes (Requirement 1.11). |
| Building with bad `height_m` | Skipped; the rest drawn; error naming `height_m` logged to the console (Requirement 5.8). |
| Segment rejected by `buildGraph` | Listed in `rejected` with id and field; remaining Segments routable. The count appears in the console only. |
| Invalid number reaching a pure function | `ArgumentError` naming the argument. The shell keeps the previous route and slider value (Requirement 7.10). |
| Point outside pack area | Message that there is no street data there. No route, no network (Requirement 1.9). |
| No street within 150 m | "Too far from a street" message. Other point unchanged (Requirement 6.6). |
| No connected path | "No walking route found". No route, distance, time or Tier summary (Requirement 6.8). |
| Start and end snap to the same point | "Start and end are the same place". No route (approved). |
| Geolocation denied, unavailable or over 10 s | Message that the location could not be found. Start unchanged. Nothing sent anywhere (Requirements 6.3, 17.15). |
| Tile request slow (5 s) or failing | Base layers hidden, Segments on a plain background, message shown, attribution and routing kept (Requirement 5.7). |
| Frame rate under 30 fps for 2 s | Effects ladder drops one effect at a time (Requirement 5.6). |
| Settings read or write fails | In-memory settings used, message shown, toggles and routing still work (Requirement 8.7). |
| Corrections read or write fails | `StoreError`. Message shown, earlier data untouched, map and routing keep working (Requirement 10.9). |
| Sample_Data fails to load | Demo_Mode stays off, error message, rest of app usable (Requirement 14.6). |
| CSV cannot be created | Export-failed message, list stays usable (Requirement 11.7). |
| Validation numbers cannot be parsed | "Validation numbers are unavailable". No figure shown. The statements for Requirements 12.3 to 12.5 still appear (Requirement 12.9). |
| `localStorage` missing (private mode) | Treated as a failed read and write by both stores. |
| Street search: no match | The list stays closed and the live region says `search.noMatch`. Nothing is set. The helper line stays visible (Requirement 19.7). |
| Street search: query under 2 characters or empty | No results, list closed, live region says `search.shortQuery` as a plain status, not an error (Requirement 19.7). |
| Street search: no City_Pack loaded, load in progress, or index not built yet | Field disabled with the matching `search.unavailable.*` message. After a City_Pack switch the query text and results are cleared (Requirement 19.8). |
| Street search: invalid argument | `searchStreets` throws `ArgumentError` naming `query` (not a string) or `centre` (non-finite or out-of-range coordinate) and returns nothing. The shell always passes a string and the map centre, so this is a programming error and shows no UI message. |
| Street search: chosen result does not snap | The midpoint lies on the stretch, so this is rare. The same messages as a tapped point apply: "too far from a street" (Requirement 6.6) or no street data there (Requirement 1.9). No route is planned and the other point is unchanged. |

All messages come from `strings.ts`, so they pass the banned-word test. None says a route is safe.

## Testing Strategy

Property-based testing applies here. The core is pure logic with clear inputs and outputs (scoring, graph building, routing, status, CSV, parsing, flicker maths). It does not apply to MapLibre rendering, CSS layout, hosting reach, frame rate or browser permission prompts. Those use example tests, mocked map events, and measured targets.

**Libraries.** Vitest runs the tests; `fast-check` provides the properties. Nothing is written from scratch. Tests run in the `node` environment. DOM and layout checks (focus, attribution not covered, panel spacing) are manual.

**Property configuration.**
- Each property in this document is one `fc.assert(fc.property(...))` test with at least 100 runs. A shared setup file calls `fc.configureGlobal({ numRuns: 100 })`, and a meta-test fails if any configured `numRuns` is below 100 (Requirement 16.18).
- Each test carries a comment in the form `Feature: gloam-web-app, Property N: <title>`.
- fast-check reports the shrunk counterexample and the seed on failure, which satisfies Requirement 16.19. Tests for Properties 9 to 13 pass `{ verbose: true }` so the path and seed are printed.

**Generators.**
- Segments: coordinates on a small integer grid scaled to degrees, so shared coordinates, closed loops and disconnected parts occur often. Lit probabilities and confidences in 0 to 1, a mix of label sources, highway values drawn from the list seen in the data, and string ids drawn so that numeric-looking ids such as `"9"` and `"10"` both appear.
- Graphs for Properties 9 to 13: 2 to 8 nodes, so brute-force enumeration is cheap. A second generator builds equal-cost alternatives (parallel Edges and diamonds with identical attributes) and then shuffles the Segment order (Requirement 16.6).
- Invalid numbers: `fc.constantFrom(NaN, Infinity, -Infinity)` mixed with out-of-range values.
- Corrections: random type, a date within 200 days of `today`, ids from a small set to force several reports per segment.
- Street search (Properties 36 and 37): names built from a small word list with ASCII, accented letters (é, ü, ñ, ç, å) and the folded letters (ß, ø, đ, ł, æ, œ), random case per letter, random extra spaces and punctuation, duplicates (the same name on several Segments), the same name at two distant grid places and at touching places, and `null` or whitespace-only names. Queries are drawn from prefixes and word subsets of generated names (so matches are common) plus random strings of 0 to 12 characters. Case and diacritic variants are made by flipping case with `toUpperCase` and inserting U+0301 after letters. Centres are any valid longitude and latitude.

**Example and integration tests.**
- Hand-checked values from this document: the Dread table, the 4/4/2 Tier split for ten segments, the lambda tie table (140/165, 180/180, 340/240), tier shares 34/33/33 and 50/30/20, distance and minute formatting (999.6 m, 1049 m, 1050 m, 1000 m, 1200 m, 1001 m), report weights at 30 and 90 days, and the status examples.
- Tests on real files in `data/`: each of the five shipped packs parses; the graph builds; each Sample_Walk start and end snaps, a route exists, the Gloam_Route differs from the Shortest_Route at lambda 3 with toggles off, and it crosses at least 3 different Tiers (Requirement 14.9); every Sample_Data segment id exists in its pack (Requirement 14.10). The City_Picker test checks five entries and that none has a description.
- String catalogue: every entry (with sample arguments), the bundled `docs/validation.md` text and the Disclaimer pass `findBanned`; the failure report names the string and the entry (Requirement 12.10). Lighting strings use only the allowed terms.
- Validation quote test: parses `docs/validation.md` as it exists and checks each quoted figure against the file (Requirement 12.11). The expected "did not beat" cities are computed in the test from the parsed validation file (cities whose parsed model figure is lower than the parsed baseline figure), not from a hard-coded list, and the test checks that the screen names exactly those cities.
- Network test: with a stubbed `fetch`, loading a pack requests exactly two URLs, planning a route makes none, and no URL contains a coordinate (Requirements 13.5, 13.9). The allow-list in the test is exactly: the app files, the TileJSON at `https://tiles.openfreemap.org/planet`, the vector tiles it lists, the two pack files and the Sample_Data file while Demo_Mode is on. Glyph and sprite requests are not allowed.
- Map and UI: mocked MapLibre events for the tile-timeout rule; layer order check that the route layer is last; static style table check that the five reduced-effects styles are pairwise different; attribution element present and unobstructed.
- Street search, pure logic (node environment, no jsdom): the UI logic of the combobox is in the pure module `search/comboboxState.ts` (decided: pure), so example tests drive `comboStep` and `announcement` directly. They check ArrowDown and ArrowUp with wrap (including from no active option and from a closed list), Enter choosing the active option and choosing nothing when none is active, Escape closing while keeping the query and results, blur closing without choosing, `pointerChoose` with a valid and an invalid index, one-character and empty queries giving the `short` status with no results and no open list, zero results giving `noMatch`, and `availability` changes and `reset` clearing query, results and the open list. They also check the result texts of `announcement` ("1 street found", "3 streets found").
- Street search, example values from this document: the distance and direction cases (612 m at 50 degrees, 1240 m at 181 degrees, 975 m at 337.5 degrees, 20 m, and the (0, 0) to latitude 0.0054 case), the boundary bearings 22.5 (north-east), 67.5 (east) and 337.5 (north) for `compassOf`, normalisation of "Straße des 17. Juni", "Élan Way" and "main  street", the stretch grouping of hand example 1 of Property 36 (joined at a shared node, separate when apart, key = smallest id), and the midpoint rule on a stretch of three Edges of 100, 100 and 100 m, where the half (150 m) falls in the second Edge at its midpoint.
- Street search, real packs: for each of the five packs in `data/`, every named Segment (non-empty after `normalise`) is found when its own raw name is the query: the results include a result with that name whose stretch contains the Segment id, when the query has 2 or more code points (the results are capped at 8 and ordered by distance after tier, name length and name, so the check passes the Segment's own stretch midpoint as the map centre; that stretch is then at distance 0 and is first among stretches of equal name, so it is returned even for names shared by more than 8 stretches. A second check with the centre far away only asserts that every returned name matches and that the order equals the reference sort). Searching a known name from each pack (one name per pack, picked from the data and checked in it when the test is written; "Jalan Bukit Bintang" appears in the Kuala Lumpur pack's sample feature) returns at least one result. A result chosen from each pack's search snaps to the graph within 150 m.
- Own wording: every new string (the helper line, the unnamed-streets note, `shortQuery`, `noMatch`, `count(n)` for n = 0, 1 and 8, the three `unavailable` messages, the 8 compass words and `searchOffsetWording` for the `here`, metre and kilometre cases) is part of the enumerated catalogue, so the banned-word test (`findBanned`) and the own-wording test against `reference.html` (Requirement 18.11) cover it. The test also checks that the 8 compass words and the template are only in `strings.ts`.
- Street search, DOM-free shell check: a minimal fake element set (input, listbox, live region) checks that `ui/streetCombobox.ts` sets `role`, `aria-expanded`, `aria-controls`, `aria-autocomplete`, `aria-activedescendant` and `aria-selected` from `ComboState`, sets each option's `min-height` to 44 px or more, and clears the input value and index on a City_Pack switch. Focus rings, layout and screen-reader speech are checked by hand on a phone and recorded in `docs/app-checks.md`.

**Measured targets, not asserted in CI.** Graph build under 3 s for 22 000 Segments, 30 fps, 2 s to street layer and 5 s to Sample_Walk on the first run, and reach from the US, China and Malaysia. Results and the reference device are recorded in `docs/app-checks.md` and `docs/kiro-log.md`.

**Open items for you.** None. The static host is confirmed as Render (a Render static site). The host-dependent checks listed in the Hosting row of the Key decisions table are to be verified on the deployed site.
