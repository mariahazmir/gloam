# Implementation Plan: Gloam Web App

## Overview

The app is written in TypeScript (Vite, no UI framework). `maplibre-gl` is the only runtime dependency. Vitest and `fast-check` are dev dependencies; tests run in the `node` environment (no jsdom). Work goes in this order: pure core and its property tests, then the I/O shell and the Sample_Walk dev script and tests, then map and visuals, then UI, then Render hosting checks, then docs. Task 20 (street search for start and end, Requirement 19) was added later: pure search modules first, then their tests, then the statistics script, then the combobox UI, then a checkpoint.

Rules for every task:
- Pure modules (validation, pack parsing, graph, scoring, routing, corrections, visual maths, content, state, search) import nothing from the DOM, `fetch`, storage or `maplibre-gl`.
- Numeric inputs are validated with `ArgumentError`, whose message names the argument.
- Small diffs. Each task touches only the files it names.
- Property tests use at least 100 runs and carry the comment `Feature: gloam-web-app, Property N: <title>`.
- No UI string outside `content/strings.ts`. No banned words in any string, comment or doc.
- Task 20 rules: `search/` makes no network request, reads or writes no storage and prints nothing to the console. A Search_Query is never stored, logged or sent. Every task in group 20 ends with `npx tsc --noEmit` and `npx vitest --run` both clean (the checkpoint, task 21, requires the output to be shown). Task 20.18 is a manual step for the user and is never done by the executor.

## Tasks

- [x] 1. Scaffold the app and shared validation
  - [x] 1.1 Create the `app/` project
    - Add `package.json` (exact pinned versions; runtime dependency `maplibre-gl` only; dev dependencies `vite`, `typescript`, `vitest`, `fast-check`), `tsconfig.json`, `vite.config.ts` (with `VITE_GLOAM_HOSTED` flag and `?raw` import support), `index.html` stub, `src/main.ts` stub
    - Add `tests/setup.ts` calling `fc.configureGlobal({ numRuns: 100 })` and a meta-test that fails if any configured `numRuns` is below 100
    - Add `app/.gitignore` for `node_modules` and `dist` only; never ignore `.kiro/`
    - _Requirements: 16.18, 16.19_
  - [x] 1.2 Add `types.ts` and `validation/` (`errors.ts`, `guards.ts`)
    - `ArgumentError` with the argument name first in the message
    - `requireUnit`, `requireFinite`, `requireLambda`, `requireLatLon`
    - Shared types: `Segment`, `LabelSource`, `Tier`, `ReportType`, `PackMeta`
    - _Requirements: 7.10, 16.3_

- [x] 2. Geo helpers and pack parsing
  - [x] 2.1 Implement `geo/distance.ts`, `geo/project.ts`, `geo/bounds.ts`
    - Haversine with R = 6 371 008.8 m, local equirectangular projection, `boundsOf(points)`, pack bounds grown by a margin
    - _Requirements: 1.9, 2.6, 5.1, 6.5, 14.7, 17.7_
  - [x] 2.2 Write property test for bounds
    - **Property 32: Fitted bounds contain every point**
    - **Validates: Requirements 5.1, 14.7, 17.7**
  - [x] 2.3 Implement `pack/parse.ts`
    - `parseSegmentFile` and `parseBuildingsFile` returning data or a `PackProblem` (file kind plus missing, unreadable or invalid)
    - Supported `schema_version` list `[1]`; reject out-of-range or non-finite values and non-LineString geometry; convert `id` with `String(id)`; skip buildings with bad `height_m` and report `height_m`
    - _Requirements: 1.6, 1.7, 5.8_
  - [x] 2.4 Write property test for pack validation
    - **Property 3: Pack validation accepts valid files and rejects every listed defect**
    - **Validates: Requirements 1.6, 1.7, 5.8**

- [x] 3. Street graph and snapping
  - [x] 3.1 Implement `graph/build.ts`
    - Validate segments (reject with id and field), reject all copies of duplicate ids, drop consecutive duplicate points, split at shared coordinates and segment endpoints, sort nodes, edges and adjacency by value so input order never matters
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.8_
  - [x] 3.2 Write property test for input-order independence
    - **Property 4: Graph construction does not depend on input order**
    - **Validates: Requirements 2.3, 16.9**
  - [x] 3.3 Write property test for splitting, attributes and length
    - **Property 5: Graph construction splits at shared coordinates and preserves attributes and length**
    - **Validates: Requirements 2.1, 2.2, 2.4, 2.5, 2.6, 16.10**
  - [x] 3.4 Write property test for per-segment rejection
    - **Property 6: Invalid Segments are rejected individually**
    - **Validates: Requirements 2.8**
  - [x] 3.5 Implement `graph/snap.ts`
    - 200 m grid index, 3 x 3 cell query, inclusive 150 m limit, deterministic ties, out-of-area test using pack bounds grown by 150 m
    - _Requirements: 1.9, 6.5, 6.6_
  - [x] 3.6 Write property test for snapping
    - **Property 15: Snapping finds the nearest point within 150 m or reports none**
    - **Validates: Requirements 1.9, 6.5, 6.6**

- [x] 4. Scoring and tiers
  - [x] 4.1 Implement `scoring/dread.ts`, `scoring/tiers.ts`, `scoring/overrides.ts`
    - `dread` per the formula; `assignTiers` with the integer rank rule (`higher x 5 < total x 2`, `higher x 4 >= total x 3`) and no fixed probability cut-off; `overrideFor`
    - Throw `ArgumentError` naming the argument and the segment id for bad inputs
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.10, 3.11, 7.2, 10.3_
  - [x] 4.2 Write property test for Dread
    - **Property 1: Dread is bounded, finite and matches the formula**
    - **Validates: Requirements 7.2, 16.1, 16.2**
  - [x] 4.3 Write property test for input rejection in scoring and tiers
    - **Property 2: Invalid input is rejected with the argument name**
    - **Validates: Requirements 3.10, 7.10, 16.3**
  - [x] 4.4 Write property test for tier assignment
    - **Property 7: Tier assignment is total, rule-correct and rank-monotone**
    - **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.11, 16.11**
  - [x] 4.5 Write property test for rank-only tiers
    - **Property 8: Tiers depend on rank only**
    - **Validates: Requirements 3.7, 12.8, 16.20**

- [x] 5. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Routing
  - [x] 6.1 Implement `routing/costs.ts`
    - `DEFAULT_SETTINGS`, `effectiveAttrs`, `penaltyCount`, `adjustedDread`, `routingLength`, `edgeCost`, `medianConfidence`; validate lambda, probabilities, confidence and length
    - _Requirements: 7.2, 8.1, 8.2, 8.3, 8.4, 16.1_
  - [x] 6.2 Write property test for settings effects on cost
    - **Property 14: Settings change cost exactly as specified**
    - **Validates: Requirements 8.3, 8.4**
  - [x] 6.3 Implement `routing/router.ts`
    - Overlay for snapped points, backward Dijkstra with deterministic heap, forward walk choosing the smallest dart key among cheapest darts, relative tie tolerance `1e-12`, `null` when unreachable, lambda validation
    - _Requirements: 6.8, 7.3, 7.4, 7.5, 7.6, 7.7, 7.10, 16.4, 16.5, 16.6, 16.7, 16.8_
  - [x] 6.4 Write property test for cheapest route
    - **Property 9: The router returns a cheapest route**
    - Brute-force enumeration over small graphs; `{ verbose: true }`
    - **Validates: Requirements 7.3, 7.4**
  - [x] 6.5 Write property test for Dark_Exposure monotonicity
    - **Property 10: Raising lambda never raises Dark_Exposure**
    - **Validates: Requirements 7.5, 16.4**
  - [x] 6.6 Write property test for Routing_Distance monotonicity
    - **Property 11: Raising lambda never shortens Routing_Distance**
    - **Validates: Requirements 7.6, 16.5**
  - [x] 6.7 Write property test for tie-breaking
    - **Property 12: Ties go to the first route in Canonical_Order, whatever the input order**
    - Generator builds parallel and diamond equal-cost alternatives, then shuffles segment order
    - **Validates: Requirements 7.7, 16.6**
  - [x] 6.8 Write property test for path validity
    - **Property 13: Returned routes are valid paths, and disconnected points give no route**
    - **Validates: Requirements 6.8, 16.7, 16.8**
  - [x] 6.9 Implement `routing/tierShares.ts`, `compare.ts`, `format.ts`, `heartbeat.ts`
    - Largest-remainder shares summing to 100, `formatDistance`, `walkingMinutes` (integer form), `compareRoutes` on displayed values, `lowConfidenceThreshold`, highest-quarter rule, `heartbeatSeries`, `describeHeartbeat`
    - _Requirements: 6.7, 7.8, 7.9, 9.1, 9.2, 9.3, 9.4, 9.5, 16.22_
  - [x] 6.10 Write property test for tier shares and walking time
    - **Property 16: Tier shares are whole percentages summing to exactly 100**
    - **Validates: Requirements 6.7, 16.22**
  - [x] 6.11 Write property test for route comparison
    - **Property 17: Route comparison deltas are signed differences, and equal routes give zero**
    - **Validates: Requirements 7.8, 7.9**
  - [x] 6.12 Write property test for heartbeat series and summary
    - **Property 18: Heartbeat series and summary match the route**
    - **Validates: Requirements 9.1, 9.2, 9.3, 9.4, 9.5**

- [x] 7. Corrections and settings
  - [x] 7.1 Implement `corrections/status.ts`, `darkSpots.ts`, `csv.ts`, `store.ts`
    - `reportWeight` (UTC day numbers, clamped), `communityStatus` with canonical-order summing, `darkSpots` (limit 20), `toCsv` with quoting and formula guard, `CorrectionStore` interface and `StoreError`
    - _Requirements: 10.2, 10.4, 10.5, 10.6, 10.7, 10.8, 11.1, 11.3, 11.5_
  - [x] 7.2 Write property test for report weight
    - **Property 19: Report weight halves every 30 days and never grows**
    - **Validates: Requirements 10.4, 16.14**
  - [x] 7.3 Write property test for the status rule
    - **Property 20: The status rule follows the sides, ignores order and ignores single reports**
    - **Validates: Requirements 10.5, 10.6, 10.7, 16.12, 16.13**
  - [x] 7.4 Write property test for notes versus tiers and routing
    - **Property 21: Notes change per-user values only, never Tiers or status-driven routing**
    - **Validates: Requirements 10.3, 10.11, 10.12**
  - [x] 7.5 Write property test for the dark-spot list
    - **Property 23: The dark-spot list is ordered, limited and filtered**
    - **Validates: Requirements 11.1**
  - [x] 7.6 Write property test for CSV output
    - **Property 24: CSV output is quoted, guarded and complete**
    - **Validates: Requirements 11.3, 11.5**
  - [x] 7.7 Implement `settings/settings.ts`, `storage/localCorrectionStore.ts`, `storage/localSettingsStore.ts`
    - Keys `gloam.settings.v1` and `gloam.corrections.v1` only; `put` replaces an earlier note for the same segment; failures throw `StoreError` and leave earlier data unchanged; missing `localStorage` counts as failed read and write; stores take an injected storage object so tests need no DOM
    - _Requirements: 8.5, 8.6, 8.7, 10.2, 10.8, 10.9, 13.3, 13.10_
  - [x] 7.8 Write property test for storage round trips
    - **Property 22: Stored data round-trips and holds only the allowed fields**
    - **Validates: Requirements 8.5, 8.6, 10.2, 10.9, 13.10**

- [x] 8. Visual maths
  - [x] 8.1 Implement `visual/flicker.ts`
    - `flickerParams`, `irregularity`, `maxFlickerRate`, `flickerBrightness`, constants `FLICKER_CAP`, `FLICKER_DEPTH`, `FLICKER_HALF_WIDTH_S`, `FLICKER_STEP_MS`
    - _Requirements: 4.2, 4.7, 4.8, 16.17, 16.21_
  - [x] 8.2 Write property test for the flicker cap
    - **Property 27: Flicker never exceeds the cap**
    - **Validates: Requirements 4.7, 16.17**
  - [x] 8.3 Write property test for slow brightness change
    - **Property 28: Brightness changes slowly**
    - **Validates: Requirements 4.8**
  - [x] 8.4 Write property test for irregularity
    - **Property 29: Lower confidence is never less irregular**
    - **Validates: Requirements 4.2, 16.21**
  - [x] 8.5 Implement `visual/effects.ts` and `visual/tierStyles.ts`
    - `stepEffects` ladder (flicker, glow, fog, extrusion); normal-mode and Reduced_Effects_Mode style tables (five distinct pattern and width pairs); cohort grouping helper (tier x 3 confidence bands x 3 phases)
    - _Requirements: 4.1, 4.3, 4.4, 4.5, 4.12, 4.13, 5.6_
  - [x] 8.6 Write property test for the effects ladder
    - **Property 30: The effects ladder removes one effect at a time and stops at none**
    - **Validates: Requirements 5.6**
  - [x] 8.7 Write unit test for reduced-effects styles
    - Five styles pairwise different by pattern or width; confirmed_lit never flickers; mapped_unlit never flickers
    - _Requirements: 4.1, 4.4, 4.13_

- [x] 9. Content, wording and validation parsing
  - [x] 9.1 Implement `content/strings.ts`
    - Nested catalogue with `kind` ('lighting' or 'general'), template functions (`tierWording` with `Math.round(confidence x 100)`), `DISCLAIMER` verbatim, all messages named in the design's error table, the exact Kuala Lumpur description, the hint, the legend lines (each 80 characters or fewer), the reset and "SAMPLE DATA" labels
    - _Requirements: 1.3, 3.8, 3.9, 6.9, 12.2, 17.9, 17.10_
  - [x] 9.2 Implement `tests/helpers/bannedWords.ts` and `content/validationDoc.ts`
    - `findBanned` token-run matcher using the product.md list; `parseValidation` over `docs/validation.md?raw` returning strings as written, a did-not-beat list, no precision values, skipped-city reasons, unavailable result when no tables
    - _Requirements: 12.1, 12.6, 12.7, 12.9, 12.10, 12.11_
  - [x] 9.3 Write property test for the banned-word matcher
    - **Property 25: The banned-word matcher finds whole words and phrases only**
    - **Validates: Requirements 12.1, 16.15**
  - [x] 9.4 Write property test for validation figures
    - **Property 26: Quoted validation figures equal the document's**
    - **Validates: Requirements 12.6, 12.9, 12.11**
  - [x] 9.5 Write example tests for wording and the real validation file
    - Every catalogue entry (with sample arguments), the Disclaimer and the bundled `docs/validation.md` pass `findBanned` with a failure report naming the string and entry; lighting strings use only allowed terms; quoted figures equal `docs/validation.md`; "did not beat" cities computed from the parsed file
    - _Requirements: 12.1, 12.2, 12.6, 12.10, 12.11_

- [x] 10. App state reducer
  - [x] 10.1 Implement `state/appState.ts`
    - Pure reducer with `tap`, `setStartHere`, `setEndHere`, `useLocation`, `switchMode`, `chooseSettingState`, `clearExample`, `reset`; initial Plan_Mode and Start_Setting_State; Report_Mode taps never move points; Plan_Mode taps never select segments
    - _Requirements: 6.1, 6.10, 6.11, 10.1, 17.8, 17.13, 17.17_
  - [x] 10.2 Write property test for modes and taps
    - **Property 31: Modes and taps behave as specified**
    - **Validates: Requirements 6.1, 6.11, 10.1, 17.13, 17.17**

- [x] 11. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 12. Shell I/O
  - [x] 12.1 Implement `pack/manifest.ts`, `pack/sampleData.ts`, `net/packLoader.ts`, `net/sampleLoader.ts`
    - Manifest of five packs (Seattle first-run) using `import.meta.glob` URLs; `sampleWalk` fields hold placeholders until task 12.2
    - `loadPack` fetches segments first, then buildings; one `AbortController` per load with cancel; 15 s deadline; nothing committed on failure; only these modules call `fetch`; Sample_Data loaded only while Demo_Mode is on, `days_ago` converted to dates
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.10, 1.11, 13.5, 14.3, 14.6, 15.7, 15.8, 17.3, 17.16_
  - [x] 12.2 Add `app/scripts/pickSampleWalks.ts`, the Sample_Data file and the manifest walks
    - Script searches each of the five packs for a walk whose Gloam_Route at lambda 3 (toggles off) differs from the Shortest_Route and crosses at least 3 Tiers; write the chosen points into `pack/manifest.ts`; add bundled Sample_Data JSON (`label: "SAMPLE DATA"`, `days_ago`) with ids that exist in the packs
    - _Requirements: 14.7, 14.8, 14.9, 14.10_
  - [x] 12.3 Write tests on the real packs
    - For each of the five packs: parse, build graph, each Sample_Walk start and end snaps, a route exists, Gloam_Route differs from Shortest_Route at lambda 3 with toggles off and crosses at least 3 Tiers; every Sample_Data segment id exists in its pack's Segment_File
    - _Requirements: 14.8, 14.9, 14.10_
  - [x] 12.4 Write example tests for loading
    - Stubbed `fetch`: loading requests exactly two URLs; a later choice cancels an earlier load; failure keeps previous pack; deadline gives a problem; no URL contains a coordinate; City_Picker manifest has five entries and only `kl` has the exact description
    - _Requirements: 1.1, 1.3, 1.4, 1.6, 1.11, 13.5, 13.9, 17.16_
  - [x] 12.5 Write property test for no network calls
    - **Property 33: Pure modules make no network calls**
    - Stub `fetch`, `XMLHttpRequest`, `WebSocket`, `navigator.sendBeacon`; run graph, tiers, router, snap, status and CSV over generated input
    - **Validates: Requirements 13.4, 13.6, 13.9, 16.16**
  - [x] 12.6 Implement a geolocation wrapper `net/geolocation.ts`
    - `getCurrentPosition` with `timeout: 10000` plus a 10 s guard timer; result kept in memory only; denial, unavailability or timeout resolve to a typed failure and send nothing
    - _Requirements: 6.2, 6.3, 13.7, 13.8, 17.14, 17.15_

- [x] 13. Map and visuals
  - [x] 13.1 Implement `map/style.ts` and `map/mapView.ts`
    - Bundled dark style (`openmaptiles` vector source via TileJSON `https://tiles.openfreemap.org/planet`; layers from water, waterway, landcover, landuse, park, transportation only; no glyphs, no sprite, no symbol layers, no base building layer); `maxPitch: 60`; always-open attribution for OpenStreetMap contributors, OpenFreeMap and OpenMapTiles
    - _Requirements: 5.1, 5.3, 5.4, 13.5_
  - [x] 13.2 Implement `map/layers.ts`
    - Segments source with `promoteId: 'id'` and `tier` and `conf` properties; steady glow, fog and static layers; 27 flicker cohort layers updated every 33 ms; "your note" marker layer driven by feature-state; building `fill-extrusion` from `height_m`; route layer last; reduced-effects switch applies within 500 ms
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.9, 4.11, 4.12, 5.2, 10.3_
  - [x] 13.3 Implement `map/tileWatch.ts` and the fps sampler
    - 5 s tile rule hides base layers and shows the message while segments stay on a plain background; `requestAnimationFrame` frame counter feeds `stepEffects` once per second
    - _Requirements: 5.5, 5.6, 5.7, 17.12_
  - [x] 13.4 Write example tests with mocked map events
    - Tile timeout and source error behaviour; route layer is last; fps sampler feeds the ladder
    - _Requirements: 4.6, 5.6, 5.7_

- [x] 14. UI
  - [x] 14.1 Create the app shell: `index.html`, `ui/` base, self-hosted fonts and `@font-face`
    - Caprasimo and DM Sans woff2 in `assets/fonts/`; layout without horizontal scroll at 390 x 844; centred or two-panel at 768 px and wider; visible focus style; panels reserve space for attribution
    - _Requirements: 5.3, 15.2, 15.3, 15.4_
  - [x] 14.2 Implement City_Picker, progress state and error/retry messages
    - Five entries, progress removed within 500 ms of outcome, messages naming the file, retry control, attribution and estimates note shown in a map corner
    - _Requirements: 1.1, 1.3, 1.5, 1.6, 1.8, 15.6, 17.4, 17.16_
  - [x] 14.3 Implement Plan_Mode controls
    - Mode_Switch, Crosshair, "Set start here" and "Set end here", "tap sets: start / end" control, "use my location", no place search, lambda slider (0 to 10, step 0.5, default 3, labelled "shortest" and "prefer better-lit streets"), four settings toggles with save and restore, out-of-area / too-far / same-place / no-route messages, snapping and routing triggered from state changes
    - _Requirements: 1.9, 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.8, 6.10, 6.11, 7.1, 7.10, 8.1, 8.2, 8.5, 8.6, 8.7, 8.8_
  - [x] 14.4 Implement the route panel and `ui/heartbeatChart.ts`
    - Distance, minutes, Tier shares, Gloam_Route versus Shortest_Route with signed deltas, Disclaimer on every route screen, chart with shape-differing low-confidence markers, screen-reader text summary, no animation in Reduced_Effects_Mode, update within 1 s
    - _Requirements: 6.7, 6.9, 7.8, 7.9, 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7_
  - [x] 14.5 Implement Report_Mode, corrections and Dark_Spot_List
    - Segment selection, three one-tap report buttons, override applied within 1 s, "your note" marker, "confirmed by N people" labels, store error message, Dark_Spot_List with empty state, "SAMPLE DATA" labels, CSV download with export-failed message
    - _Requirements: 10.1, 10.3, 10.5, 10.8, 10.9, 10.10, 11.1, 11.2, 11.4, 11.6, 11.7_
  - [x] 14.6 Implement About, How_Gloam_Guesses_Screen, Legend, Demo_Mode, Reset and Reduced_Effects switch
    - About states that the tile provider sees the area viewed but not routes; guess screen shows required statements and parsed validation numbers, names cities that did not beat the baseline, links to the bundled raw text; Legend with glow, flicker and fog lines; Demo_Mode control with state, "SAMPLE DATA" badges, hosted default via `VITE_GLOAM_HOSTED`; Reset_Control; switch reflecting `prefers-reduced-motion` at load
    - _Requirements: 4.9, 4.10, 12.3, 12.4, 12.5, 12.6, 12.7, 12.9, 13.11, 14.1, 14.2, 14.3, 14.4, 14.5, 14.6, 17.9, 17.11, 17.13_
  - [x] 14.7 Wire everything in `main.ts`
    - First run: load Seattle segments, draw street layer, build graph after first paint via `setTimeout(0)`, then buildings; show the Sample_Walk with example label, clear control and fitted view (`padding`, `maxZoom: 17`, `duration: 0`); hint while start or end missing; no permission request on load; one pack in memory
    - _Requirements: 1.2, 1.10, 5.1, 14.7, 15.7, 15.8, 17.1, 17.2, 17.3, 17.5, 17.7, 17.8, 17.10_
  - [x] 14.8 Create `docs/app-checks.md` as the checklist and results file for DOM and layout checks
    - Record results in `docs/app-checks.md`, never in `docs/validation.md`
    - Focus order and visible focus, attribution not covered, 390 x 844 layout, 768 px layout, Chrome laptop and phone, Safari on iPhone where available, fps measurement on the reference phone, graph build time for 22 000 segments, keyboard use of the Mode_Switch, Reduced_Effects switch and report buttons
    - _Requirements: 2.7, 4.10, 5.3, 5.5, 15.1, 15.2, 15.3, 15.4_

- [x] 15. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 16. Hosting on Render
  - [x] 16.1 Add Render static-site config and `app/scripts/checkHost.ts`
    - `render.yaml` builds with `cd app && npm ci && npm run build`, publishes `app/dist`, and sets `NODE_VERSION` and `VITE_GLOAM_HOSTED=true`; a GitHub Pages fallback build script with `/gloam/` base path; `checkHost.ts` takes a URL and reports HTTPS, `Content-Encoding` of each pack file (gzip or Brotli), and that the page and pack files are reachable
    - _Requirements: 14.2, 17.1, 17.6_
  - [x] 16.2 Record hosting results in `docs/app-checks.md`
    - Run `checkHost.ts` against the deployed Render URL and record in `docs/app-checks.md` (never `docs/validation.md`, which the pipeline generates and the app parses): pack files compressed (Content-Encoding), HTTPS, URL stable and up 16 Dec to 29 Jan (recheck before submitting), load from the US, China and Malaysia within 10 s on 10 Mbit/s, and the reference phone used for fps and graph-time checks
    - _Requirements: 15.5, 17.3, 17.5, 17.6_
  - [x] 16.3 Serve pack files with a compressible type and tighten checkHost path matching
    - In `app/vite.config.ts`, make built `.geojson` pack assets emit as `assets/[name]-[hash].json` (via `assetFileNames`), because Render serves `.geojson` as `binary/octet-stream` with no Content-Encoding; source files in `data/` stay `.geojson` and app imports keep working; no new dependency. In `checkHost` path finding, report only pack files under `/assets/` that the app's own code requests, and ignore `/data/*.geojson` source paths and strings from map library code; add a test with those false cases as inputs
    - _Requirements: 17.6_

- [x] 17. Docs
  - [x] 17.1 Add an app section to `README.md`
    - Add an app section to the existing README without rewriting or removing what is there (do not create the README from scratch): what the app is, how to run and test, data credits, the Disclaimer, no-safety statement, privacy summary
    - _Requirements: 6.9, 12.1, 13.1, 13.2, 13.3_
  - [x] 17.2 Add attribution and font licence files
    - OpenStreetMap contributors, OpenFreeMap and OpenMapTiles credits in README and About text; SIL OFL licence text for Caprasimo and DM Sans in `docs/`
    - _Requirements: 5.3, 12.1_

- [x] 18. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.
- [x] 19. Screens and reference styling
  - [x] 19.1 Add `state/screens.ts` and `routing/stretches.ts` (pure)
    - _Requirements: 18.1, 18.2, 18.6_
  - [x] 19.2 Property test for screen addresses
    - **Property 35: Screen addresses round-trip**
    - **Validates: Requirement 18.1**
  - [x] 19.3 Property test for stretches
    - **Property 34: Stretches cover the route exactly and never repeat a neighbour**
    - **Validates: Requirements 18.2, 18.6**
  - [x] 19.4 Split the shell into the five screens, wire the hash, and move About and the guess dialog into screens
    - _Requirements: 6.9, 6.10, 6.11, 17.7, 17.9, 18.1 to 18.5, 18.8 to 18.10_
  - [x] 19.5 Restyle the screens and map layers to the design reference
    - _Requirements: 4.6, 6.12, 18.7_
  - [x] 19.6 Spec fixes: Property 35 examples, largest-remainder stretch metres (Property 34), own wording with a reference-text test, routing settings on the Route_Screen, add the screens to `docs/app-checks.md`
    - _Requirements: 18.1, 18.3, 18.5, 18.6, 18.11_
  - [x] 19.7 Compact collapsed sheet, no city description, no estimates note, glass attribution strip
    - _Requirements: 1.3, 1.8, 18.9, 18.10_

- [ ] 20. Street search for start and end
  - [ ] 20.1 Implement `search/streetSearch.ts`: `normalise`, tokenising, matching and ranking
    - `normalise` (lowercase, NFD, strip U+0300 to U+036F, fold `ß ø đ ł æ œ`, split on non-letter/digit, join with one space); `searchStreets(index, query, centre)` returns at most 8 results, `[]` for a trimmed query under 2 code points; rank tiers exact, prefix, other word-start; total-order comparator (tier, normalised-name length, normalised name, distance from the map centre nearest first taken from the UNROUNDED haversine, stretch key), so `centre` is part of the order and the result; compute the haversine for every match; `roundDistance` is display-only and never feeds the comparator
    - Throw `ArgumentError` naming `query` (not a string) or `centre` (via `requireLatLon('centre', ...)`); no I/O, no console output
    - _Requirements: 16.3, 16.23, 19.1, 19.2, 19.6, 19.9_
  - [ ] 20.2 Add stretch grouping, midpoint and `buildStreetIndex` to `search/streetSearch.ts`
    - `groupStretches(segments, graph)` by union-find over shared nodes and equal normalised names (no gap tolerance; key = smallest segment id by code unit; display name = raw name of that Segment); `buildStreetIndex` normalises each name once and computes each midpoint by length over Edges in `compareEdgeKeys` order; throw `ArgumentError` naming `segments` or `graph`
    - _Requirements: 19.2, 19.3, 19.4, 19.6, 19.9_
  - [ ] 20.3 Add `compassOf` and `roundDistance` to `search/streetSearch.ts` and the new strings to `content/strings.ts`
    - Bearing sectors and distance rounding as in the design decisions table; in `strings.ts` (all `kind: 'general'`, own words): `search.helper`, the unnamed-streets note, `search.shortQuery`, `search.noMatch`, `search.count(n)`, `search.unavailable.noPack`, `.loading`, `.indexing`, `search.openLabel` ("Search streets", used by the Map_Screen control in 20.17), the 8 compass words and `searchOffsetWording(rounded, direction)` including the "at the map centre" case
    - _Requirements: 19.1, 19.3, 19.5, 19.7, 12.1, 18.11_
  - [ ] 20.4 Implement `search/comboboxState.ts`
    - Pure reducer `comboStep` and `announcement` with the actions, wrap-around keyboard rules, `availability` and `reset` handling from the design; no DOM
    - _Requirements: 19.1, 19.7, 19.8_
  - [ ] 20.5 Write property test for street search
    - **Property 36: Street search returns only pack names, ignores case and diacritics, caps at 8 and is deterministic**
    - Clause (d): same query, same centre and same pack give the same results in the same order, also after rebuilding the index from any permutation of the Segments, and the 8 results are the first 8 of the total order (tier, normalised-name length, normalised name, unrounded haversine distance from the centre nearest first, stretch key) checked against a reference sort written in the test
    - Generators as in the design, including several stretches that share one name at varied distances from the centre (with exactly equal-distance pairs) and Segment permutations
    - **Validates: Requirements 16.23, 19.1, 19.2, 19.6, 19.9**
  - [ ] 20.6 Write property test for street search silence
    - **Property 37: Street search makes no network request and touches no storage**
    - Stub `fetch`, `XMLHttpRequest`, `WebSocket`, `navigator.sendBeacon`; storage objects that throw on access; spy on `console`; as in Property 33
    - **Validates: Requirements 13.12, 16.24, 19.2**
  - [ ] 20.7 Write example tests for hand-checked search values
    - "Church Lane" hand example from design.md (Property 36, example 3): 10 stretches, centre (0, 0), midpoints on lon 0, latitude offsets in thousandths of a degree, 0.001 degree = 111.195 m. Keys and offsets: "40" +3, "12" -5, "7" +1, "31" -2, "25" +5, "9" -8, "18" +4, "60" -6, "5" +9, "22" -7. Query "church lane" returns 8 in order "7" 111.195 m, "31" 222.390 m, "40" 333.585 m, "18" 444.780 m, "12" 555.975 m, "25" 555.975 m (equal distance, "12" before "25" by key), "60" 667.170 m, "22" 778.366 m; "9" (889.561 m) and "5" (1000.756 m) are dropped; key order alone would give a different list; shuffled Segment input gives the same 8 in the same order. Build the index entries with the midpoints set directly so the tie is exact
    - Normalisation of "Straße des 17. Juni", "Élan Way", "main  street"; ranking and grouping of hand example 1 and 2 of Property 36 (queries "main", "main street", "street main", "m", "é", "el", "STRASSE 17"); `compassOf` boundaries 22.5, 67.5, 337.5; `roundDistance` and wording for 612 m at 50 degrees, 1240 m at 181, 975 m at 337.5, 20 m, and (0, 0) to latitude 0.0054; midpoint on a stretch of three 100 m Edges; `ArgumentError` names `query` and `centre`
    - _Requirements: 19.2, 19.3, 19.4, 16.3_
  - [ ] 20.8 Write example tests for the combobox state machine
    - Drive `comboStep` and `announcement`: ArrowDown and ArrowUp with wrap (closed list, no active option), Enter with and without an active option, Escape keeps query and results, blur closes without choosing, `pointerChoose` valid and invalid index, short and empty queries, no match, `availability` and `reset` clearing state, "1 street found" and "3 streets found"
    - _Requirements: 19.1, 19.7, 19.8_
  - [ ] 20.9 Add the new search strings to the own-wording tests
    - Include every new string (with sample arguments: `count` for 0, 1 and 8; `searchOffsetWording` for here, metre and kilometre cases; all 8 compass words) in the banned-word scan and the reference-text test of Requirement 18.11; check the compass words and the template appear only in `content/strings.ts`
    - _Requirements: 12.1, 12.2, 18.11, 19.3, 19.5_
  - [ ] 20.10 Write real-pack tests for street search
    - For each of the five packs in `data/`: every Segment with a non-empty normalised name is found when its own raw name is the query, passing the midpoint of that Segment's own stretch as the `centre` (that stretch is then at distance 0 and first among stretches of equal name, so it is returned even for names shared by more than 8 stretches; the test never expects name-only order). The result must have that name and a stretch containing the Segment id. A second check with a far-away centre only asserts that every returned name matches the query and that the order equals the reference sort. One known name per pack, picked from the data, returns at least one result; a chosen result's midpoint snaps to the graph within 150 m
    - _Requirements: 19.2, 19.3, 19.4, 19.6_
  - [ ] 20.11 Add `app/scripts/streetNameStats.ts` and the `segments` return in `loadPack`
    - Add `segments` to the return of `loadPack` in `app/scripts/pickSampleWalks.ts` (one field, other uses unchanged); the script follows `routeStats.ts`, runs offline, imports `groupStretches` and `normalise` from `src/search/streetSearch.ts`, and prints per pack: Segment count, share of Segments with a name (one decimal), number of distinct names, number with more than one stretch, and that as a share of distinct names ("n/a" when none), and the largest number of stretches sharing one normalised name with that name (ties: smallest normalised name by code unit; "n/a" when no names), read from the same `groupStretches` result
    - Line format, one per pack: `<city>: segments=<n> named=<p>% names=<n> multi-stretch=<n> (<p>%) most-stretches=<n> "<normalised name>"`
    - The executor only writes the script; the user runs it (see 20.18)
    - _Requirements: 19.11_
  - [ ] 20.12 Implement `ui/streetCombobox.ts` (DOM shell)
    - Thin shell over `comboStep`: `role="combobox"`, `aria-expanded`, `aria-controls`, `aria-autocomplete="list"`, `aria-activedescendant`; `role="listbox"` and `role="option"` with `aria-selected`; options at least 44 px high with name and offset wording; keyboard (arrows, Enter, Escape, Tab); `role="status"` live region with `aria-live="polite"`; always-visible helper line; input `disabled` with the `search.unavailable.*` message when not ready; no animation; the query is held only in the input and one in-memory variable; the shell passes the current map centre to `searchStreets` when building results
    - _Requirements: 19.1, 19.5, 19.7, 19.10, 13.12, 15.4_
  - [ ] 20.13 Wire the Street_Comboboxes into the Route_Screen and app state
    - Start and end fields on the Route_Screen (also shown when no route exists, see the entry point in 20.17); build the index once per pack with `setTimeout(0)` after the graph build, then dispatch `availability: 'ready'`; choosing a result dispatches the existing `chooseStreet` action for the field's own kind and goes through the existing snap, out-of-area, too-far and Sample_Walk-clearing path; on a City_Pack switch clear the pending build, the index, the input text and results and dispatch `availability: 'loading'`
    - Update the stale comment in `ui/planControls.ts` ("There is no place-name search (6.4)") to say that only the offline street-name search of Requirement 19 exists; change no other UI hint text
    - _Requirements: 6.1, 6.4, 6.5, 6.6, 17.17, 18.3, 19.1, 19.4, 19.5, 19.8, 19.9_
  - [ ] 20.14 Write a DOM-free shell test for `ui/streetCombobox.ts`
    - With a minimal fake element set: ARIA attributes follow `ComboState`, option `min-height` is 44 px or more, the input value and index are cleared on a City_Pack switch, disabled states show the matching message
    - _Requirements: 19.1, 19.7, 19.8_
  - [ ] 20.15 Add the street search screens to `docs/app-checks.md`
    - Checklist items to record by hand: keyboard use of both fields (arrows, Enter, Escape, Tab), screen-reader label and live-region check, 44 px option height, 390 x 844 layout with the list open, and a 100 ms measurement of results after typing on the reference phone (target, to be measured, not a guarantee)
    - "Search streets" control on the Map_Screen sheet: keyboard (Tab reaches it, Enter and Space activate it), 44 px minimum height, works with no route planned and with a route shown, opens `#/route` with the start field focused, browser back returns to the Map_Screen
    - Manual measurement of the collapsed bar height with a route shown at 390 x 844 in the developer tools (limit 211 px, 25 percent of 844), recorded with and without the control; `sheet-keep` is added to the control only if the measured height with it is 211 px or less
    - _Requirements: 15.2, 15.4, 18.2, 18.9, 19.1, 19.10_
  - [ ] 20.16 Change the `hint.setPoints` string and test it
    - In `app/src/content/strings.ts` change `hint.setPoints` to "Tap the map or type a street name to set where you start and where you're going" (79 characters, `kind: 'general'`)
    - Add an example test to `app/tests/wording.test.ts`: the text is at most 90 characters, mentions typing a street name, passes `findBanned`, and is the text the Reset_Control path shows (both read the one key `STRINGS.hint.setPoints`)
    - Files touched: `app/src/content/strings.ts`, `app/tests/wording.test.ts`, and `.kiro/specs/gloam-web-app/requirements.md` (already updated; not edited here). `app/src/ui/guidance.ts` reads the string by key (`STRINGS.hint.setPoints.text`) and is not edited. `app/tests/ownWording.test.ts` already enumerates the catalogue, so the new text is covered there with no edit
    - _Requirements: 17.10, 17.13, 12.1_
  - [ ] 20.17 Add the Map_Screen "Search streets" control and the Route_Screen with no route
    - In `ui/mapSheet.ts`, a `<button type="button">` with class `sheet-search`, label `search.openLabel` from `content/strings.ts`, `min-height: 44px`, in the normal tab order (keyboard and touch), drawn outside the route card so it exists with or without a route; its click sets `location.hash` to `hashOf('route')` (`#/route`)
    - Do NOT add `sheet-keep` by default (expanded sheet only). The CSS rule `.sheet.collapsed > :not(.sheet-keep) { display: none }` stays as is; `sheet-keep` is added to the control only after the manual measurement in 20.15 shows the collapsed bar at 211 px or less
    - The Route_Screen renders with no route: back control, both Street_Comboboxes, the four routing settings; route-only parts (chart, stretches, comparison, Disclaimer) hidden or replaced by a short "no route yet" line; the start field is focused on the `hashchange` to `#/route` only, never on page load
    - Do not change `ui/guidance.ts`; the "change start or end" control, if present, never holds or replaces "Search streets"
    - _Requirements: 6.10, 18.2, 18.3, 18.9, 19.1_
  - [ ] 20.18 MANUAL, USER ONLY: run the statistics script and confirm its output before citing it
    - The user runs the command from the design (`app/`: `npx vite build --ssr scripts/streetNameStats.ts --outDir .stats-tmp --emptyOutDir; node .stats-tmp/streetNameStats.js; Remove-Item -Recurse -Force .stats-tmp`) and confirms the output. Cite the results in `docs/` only after that confirmation.
    - The executor MUST NOT run this, tick it, or write any statistic into `docs/` without the user's confirmation
    - _Requirements: 19.11_

- [ ] 21. Checkpoint - Ensure all tests pass
  - Run `npx tsc --noEmit` and `npx vitest --run` in `app/`, show the output of both, and confirm both are clean. Ask the user if questions arise.

## Notes

- All tests, including property tests and example tests, are required.
- Each property test is its own sub-task and cites its numbered property from the design.
- Tasks 14.8 and 16.2 produce checklists and recorded results in `docs/app-checks.md`; the layout, browser, frame-rate and regional-reach checks themselves are done by hand and are targets to measure, not guarantees.
- Run tests once with `vitest --run`, never in watch mode.
- Task 20.18 is a manual step. The user runs `streetNameStats.ts` and confirms the output; statistics go into `docs/` only after that. It is left out of the dependency graph on purpose, and the executor must not do it.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2"] },
    { "id": 2, "tasks": ["2.1", "2.3", "4.1", "7.1", "7.7", "8.1", "9.1"] },
    { "id": 3, "tasks": ["2.2", "2.4", "3.1", "4.2", "4.3", "4.4", "4.5", "7.2", "7.3", "7.5", "7.6", "7.8", "8.2", "8.3", "8.4", "8.5", "9.2"] },
    { "id": 4, "tasks": ["3.2", "3.3", "3.4", "3.5", "6.1", "8.6", "8.7", "9.3", "9.4", "9.5", "10.1", "12.1", "12.6"] },
    { "id": 5, "tasks": ["3.6", "6.2", "6.3", "10.2", "12.4", "13.1"] },
    { "id": 6, "tasks": ["6.4", "6.5", "6.6", "6.7", "6.8", "6.9", "7.4", "12.5", "13.2", "13.3", "14.1"] },
    { "id": 7, "tasks": ["6.10", "6.11", "6.12", "13.4", "14.2", "14.3", "14.4", "14.5", "14.6"] },
    { "id": 8, "tasks": ["14.7", "12.2", "16.1"] },
    { "id": 9, "tasks": ["14.8", "12.3", "17.1", "17.2"] },
    { "id": 10, "tasks": ["16.2"] },
    { "id": 11, "tasks": ["16.3"] },
    { "id": 12, "tasks": ["20.1"] },
    { "id": 13, "tasks": ["20.2"] },
    { "id": 14, "tasks": ["20.3"] },
    { "id": 15, "tasks": ["20.4"] },
    { "id": 16, "tasks": ["20.5", "20.6", "20.7", "20.8", "20.9", "20.11", "20.16"] },
    { "id": 17, "tasks": ["20.10", "20.12"] },
    { "id": 18, "tasks": ["20.13", "20.14"] },
    { "id": 19, "tasks": ["20.15", "20.17"] }
  ]
}
```
