# Kiro log

Credits: 4,000 at start (redeemed 8 Nov).

## 8 Nov: Steering files

- Ask: committed product.md, tech.md and structure.md to .kiro/steering/ (all `inclusion: always`).
- Result: Kiro listed all three when asked what steering it had loaded.
- Note: I drafted these myself. They hold the honesty rules
  (never say "safe route", untagged is not unlit) so every spec inherits them.
- Credits: 0.21

## 8 Nov: Spec 1, `pipeline` (Build a Feature)

### Requirements

- Ask: gave Kiro a 10-requirement draft of the data pipeline.
- Result: Kiro returned a 171-line requirements.md with 10 requirements and 7+1 property-test properties.
- What I caught in review:
  - AUC had no definition of "right"; added positives = tagged lit, negatives = tagged unlit only.
  - Confidence for cities unlike the training cities was promised but not specified.
  - Closed walkable ways (polygons) would have been dropped silently.
  - Tagged segments had no confidence value.
  - The baseline gives every footway the same score, so beating it proves little; added a second baseline.
- Credits: 11.39
  
### Design

- Result: design.md with 27 properties, 31-value feature vector, total-variation shift measure.
- Hand-checked: confidence 0.457/0.320/0.083, AUC 0.875, highway rates 0.75/0.7. All correct.
- What I caught: shop-tagged buildings would vanish from the 3D file; ground truth could be
  scored with a model trained on that same city; min-max scaling can be crushed by one outlier.
- Kiro asked 4 open questions; I answered them from my real data (ids look like way/123).
- Credits: 15.91

### Tasks

- Result: tasks.md with 16 top-level tasks (about 70 sub-tasks), 30 property tests,
  checkpoints at tasks 4, 9, 14 and 16, and a dependency graph.
- What I caught:
  - Every test task, including all 30 property tests, was marked optional (`*`),
    with a note saying they could be skipped for a faster MVP. Asked for all tests to be required.
  - A task told Kiro to write docs/kiro-log.md. Removed it; the log is mine, in my words.
  - README task could have rewritten my existing text; changed to append-only.
  - .gitignore task needed a note not to ignore the exported data/ folder or .kiro/.
- Checked by hand: the scaling examples in task 5.6 (p95 = 3.8, scaled values 0 / 0.526 / 1.0).
- Checked against data: the 95th-percentile scaling would break if a count was mostly zero.
  I tested KL, Berlin and London at 100 m and the 95th percentile is at least 2 everywhere.
  (Rough check: midpoints of segments, not full geometry.)
- Plan: run tasks one at a time, commit at each checkpoint, stop if one step uses
  more than about 200 credits.
- Credits: 7.53

## 8 Nov: Tasks

### Pipeline Task 1.1 Create the package skeleton and pinned dependencies

- Result: pyproject with pins (numpy 2.2.6, scikit-learn 1.7.2, hypothesis, pytest), 18 empty module files, Hypothesis profile (100 examples), .gitignore additions. `python -m gloam_pipeline` exits 0.
- Caught: Kiro skipped the "pytest runs with zero tests" check and its two summaries disagreed about tasks.md. Asked it to run the check.
- Kiro pinned older numpy/scikit-learn than the latest because newer ones may drop Python 3.10. Good call, but it only checked that those two versions exist.
- Caught: Kiro's pyproject said Python >= 3.10, but hypothesis 6.170.15 needs 3.11+ (checked against PyPI metadata). Raised the minimum to 3.11 across steering, specs and README.
- Pytest with zero tests exits 5 ("no tests collected"). That is the normal result, not a failure.
- Credits: 2.72

### Pipeline Task 1.2 Verify pinned dependency versions and install the environment

- Caught: Kiro's pyproject said Python >= 3.10, but hypothesis 6.170.15 needs 3.11+ (checked against PyPI metadata). Raised the minimum to 3.11 across the spec and pyproject.
- Pytest with zero tests exits 5 ("no tests collected"): the normal result.
- Credits for 1.1 verification + 1.2: 2.05

### Pipeline Task 1.3 Implement `errors.py`, `checks.py` and `config.py`

- Result: errors.py, checks.py, config.py (PipelineConfig) + 26 unit tests.
- Checked: config defaults vs design table, max_buildings_file_kb present: yes, booleans rejected: yes.
- Credits: 2.38

### Pipeline Task 2.1 Implement `classify.py`

- Result: parse_osm_key (top-level id first, @id fallback), classify (first match wins).
- KL, Berlin and London A counts matched my independent script exactly (segment, bus stop, food, shop, building).
- No feature lacked an id in any file. "other" (229 / 388 / 496) is mostly banks, pharmacies and other amenities outside the six types.
- Kiro's judgement call: a node tagged highway=residential is not a segment. Accepted.
- Credits: 2.29

### Pipeline Task 2.2 Write property test for id parsing

- Mutation check passed: with the id priority swapped, 3 tests failed (shrunk example: top-level node/0 vs @id node/1). Reverted by hand because the file had uncommitted changes. Lesson: commit after every task so reverts are safe.
- Kiro's first generators were too clean: no non-ASCII digits, no "Way/1". Asked for wider ones. Python's isdigit() accepts Arabic-Indic, fullwidth and superscript digits, so those were the dangerous cases; the code already guarded with isascii().
- Left alone: .strip() means " way/1" parses.
- Credits: 4.74   Suite: 32 tests passing.

### Pipeline Task 2.3 Implement `loader.py` merge and footprint pass

- KL, Berlin and London A+B all matched my independent counts: input, duplicates (London 1,083), unique, footprints (6,922 / 7,628 / 10,332). Accounting identity holds for all three.
- London overlap: 1,083 duplicates removed, first file wins.
- Credits: 2.7

### Pipeline Task 2.4 Write property test for merge accounting

- Mutations tried: keep-last-instead-of-first → caught; skip duplicate count → caught.
- Known limit: the per-type recount uses classify(), so it can't catch a classify bug; classify has its own test and the real-file check.
- Credits: 3.66   Suite: 33 tests passing.

### Pipeline Task 2.5 Write property test for the footprint pass

- Mutation: skip polygons that also carry a shop tag → caught. This is the regression test for the "shop buildings vanish from the 3D file" bug I caught in the design review.
- Credits: 2.55   Suite: 34 passing.

## 9 Nov: Tasks

### Pipeline Task 2.6 Implement `io.read_geojson` and `summarise` argument checks

- Windows trap checked: every file open uses encoding="utf-8": yes
- Real-data run on London A+B: 31,415 / 1,083 / 10,332 matched.
- Kiro's naming choice: load_city lives in io.py so loader.py stays pure.
- Credits: 2.62   Suite: 43 passing.

### Tasks 2.7 Write unit tests for loading and key parsing

- 2.7: 9 unit tests (missing/invalid/empty file, two-file merge, parse_osm_key cases, keyless warning, shop+building polygon).
- Whole of task 2 checked on real KL / Berlin / London files. Encoding: utf-8 on the one read.
- Bad-encoding file gives InputFileError
- Credits: 2.61

### Pipeline Task 3.1 Implement `geometry.py`

- I added hand examples + a grid-vs-brute-force property test (not in the plan). Mutation (centre cell only): caught.
- Kiro's API choice: GridIndex items are (x, y, payload) in projected metres, queried with within(x, y).
- Credits: 2.24  Tests: 9 in test_geometry.py; full suite 61 passing

### Pipeline Task 3.2 Implement `segments.py`

- Checked on real files (KL / Berlin / London A): segments, labels, closed ways, skipped, unrecognised lit values matched my independent count. Berlin's one odd value: "opposite".
- Footway: Kiro stores normalised kind vs R2.3's raw tag.
- Credits: 3.08

### Pipeline Task 3.3 Write property test for segment selection and labels

- 3 mutations all caught: trunk allowed, lit=no as untagged, unrecognised counter skipped.
- Generator was weak (no "yes ", "none", random text); Kiro widened it. Added "opposite" (a real Berlin value) as an example.
- Credits: 4.85

### Pipeline Task 3.4 Write property test for lengths and degenerate or closed ways

- 3.4 mutations: stop counting closed ways → caught; let single-coordinate way through.
- Includes closed LineStrings (not only polygons): yes
- Credits: 2.5

### Pipeline Task 4 Checkpoint - Ensure all tests pass

- Checkpoint 4: 66 tests passing.
- Credits: 1.24

### Pipeline Task 5 (5.1 to 5.6)

- Ran as one group because credits aren't the constraint (about 80 used of 4,000); time is.
- check_features.py output matched my independent calc: means/shares/p95/max within 1% (buildings 24.41 vs 24.51 mean, likely a centroid-definition difference); 9 of 10 sample segments exact, one off by 1. Missing segments 0; vector length 31. Run time 33 s for KL.
- Kiro's choices: midpoint = half the length along the line; scale_counts takes an optional missing list; the Property 7 test disables the deadline.
- Credits: 15.08

### Pipeline Task 6 (6.1 to 6.10)

- Finding: I computed shift for 5 cities from the raw extracts. KL 0.098, Berlin 0.097, Seattle 0.090, Manchester 0.115, London 0.169 (vs pooled London+Berlin+Manchester). Penalty starts at 0.10, so it does not trigger for KL. 
  - A: leave the code as is. The measure found the five cities’ feature distributions similar, so the penalty is small in practice, and that the real KL risk, different lighting conventions, is handled by the KL ground-truth check and by the app’s wording.
  - B: tighten the thresholds, for example 0.05 and 0.25, so KL would get about 0.94 and London about 0.70. That changes the hand-checked 0.875 in the design and several tests, and the numbers would be tuned to match the five-city sample.
- Decision: A leave.
- Hand numbers 0.457 / 0.320 / 0.083125 and shift 0.2 → 0.875 confirmed in tests.
- Property 12 example count: 100 (from --hypothesis-show-statistics)
- Credits: 16.23

### Pipeline Task 7 (7.1 to 7.3)

- Changed unseen_highway_types to count against all 16 walkable types, not only types seen in training.
- Credits: 5.35

### Pipeline Task 8 (8.1 to 8.6)

- Property 6 failed twice with a Hypothesis deadline (255 ms vs 200 ms). Real KL features run took 32s. Decision: deadline=None on that one test only.
- Task 8 mutations: untagged weight [ ]; held-out rows kept [ ]; importance ascending [ ]; intercept noise [ ].
- Credits: 11.73

### Pipeline Task 9

- Property 6 hit a deadline again. Kiro set deadline=None in the shared profile instead of per test. Accepted: first run took 232 s, rerun 9.8 s, so it's machine load (OneDrive?), not slow code (real KL run: 33 s). Watch total suite time, not per-test deadlines.
- 134 tests passing.
- Credits: 1.83
  
### Pipeline Task 10 (10.1 to 10.9)

- Independent replication (my own scikit-learn run from raw extracts) gave held-out walking-path AUC: London 0.652, Berlin 0.777, Manchester 0.745 vs highway-rate 0.556 / 0.505 / 0.534 and rule 0.500. Pipeline's own numbers: [ ].
- Finding: road type + footway kind alone scores as well as all 31 features on London (0.663) and Berlin (0.807); nearby places add little on tagged walking paths. Decision: add a third baseline (type + footway kind) so the report says so.
- Kiro added 3 undocumented things; asked it to update design.md.
- Credits: 19.28

### Spec update: third baseline (highway + footway kind)

- Why: my independent run showed road type + footway kind alone matches the full model on London/Berlin.
- Reference AUCs for the new baseline (my replication, held-out walking paths): London 0.627, Berlin 0.828, Manchester 0.845 vs model 0.652 / 0.777 / 0.745. Expect "did not beat" for Berlin and Manchester.
- Untagged-weight sweep (mine): 0.5 → 0.645/0.763/0.722; 0.2 → 0.652/0.777/0.745; 0.05 → 0.652/0.826/0.793; 0.01 → 0.639/0.872/0.835. Plan: sweep in validate; decide default after KL ground truth.
- Decisions: fallback counts per evaluated city; raw footway stored in segments (fixes drift from R2.3); footway_kind on TrainingRow.
- Credits (spec update + tasks): 33.96

### Pipeline Task 11 (11.1 to 11.5)

- Measured the file sizes the exporter would write (my independent calc from raw extracts): segments files 3.2 to 6.7 MB, buildings 1.8 to 3.1 MB, all under 1 MB gzipped. The spec's 5 MB default would have rejected Seattle and Manchester, so I raised both defaults to 8 MB.
- Extra field added by Kiro: building_count in buildings metadata. Kept.
- Credits: 11.4

### Pipeline Task 12 (12.1 to 12.3)

- artifacts.py (city.json, features.json, model.json to and from dataclasses), io.py (read_json, write_json, write_geojson_checked), Property 27 round trip, 9 write tests.
- Oversized file test: the file is deleted, the earlier valid file stays byte-identical, and the error names city, file kind, size and limit.
- Windows check: final step uses os.replace. utf-8 on every text write. OneDrive lock problems: none.
- Kiro left a malformed pair_rates entry raising TypeError. Asked for InvalidArgumentError, because the CLI reads these files from disk.
- 8192 default applied everywhere (grep for 5120 comes back empty).
- Credits: 8.67   Suite: 254 passing.

### Pipeline Task 13 (13.1 to 13.3)

- Task 13 (CLI, CLI tests, wording check): credits 15.52. 270 tests passing.
- Credits: 15.52

### Real run and Gate 1

- Pipeline's validate numbers at untagged weight 0.2 / 0.05 / 0.01 matched my independent replication to within 0.001.
- Held-out walking-path AUC (0.2 / 0.05 / 0.01): Berlin 0.776 / 0.825 / 0.872; London 0.652 / 0.651 / 0.639; Manchester 0.744 / 0.792 / 0.834. Baselines: rule 0.500; road type 0.505 / 0.556 / 0.534; road type + footway kind 0.828 / 0.627 / 0.845.
- Finding: model clearly beats the simple baselines but is roughly level with road type + footway kind. Nearby places add little on tagged walking paths. Weight to be chosen after KL ground truth.
- Precision at 0.5 equals the base rate (0.86 to 0.97): uninformative.
- Exports: 10 files, 3.1 to 6.6 MB (segments), 1.8 to 3.1 MB (buildings). KL: 77.6% of estimated segments >= 0.5 → the app must use relative thresholds.

### Pipeline Task 14

- 270 tests passing in 39 s, no code changes.
- Credits: 1.24

### Pipeline Task 15 (15.1 to 15.2)

- docs/model.md: one paragraph, about 100 words, test enforces the 150-word limit.
- README: Kiro appended a Pipeline notes section with placeholder file names and duplicated credit/disclaimer text. Asked it to use the real commands and remove the duplicates. First README command run as written.
- Credits: 4.39

### Pipeline Task 16

- 271 tests passing in 25 s, no code changes.
- Credits: 1.76

## 9 Nov: Spec 2, `web-app` (Build a Feature)

### Requirements

- What I did: Updated the steering files first (tech.md decisions, a "no fixed probability cut-offs" rule in product.md, and a new design.md that only loads for files under `app/`). Then I started a Build a Feature spec called `gloam-web-app`, pasted in my requirements draft and attached 4 design screenshots. Kiro produced 17 requirements.
- What Kiro got right: relative tiers with no 0.5 cutoff, the street graph split at shared coordinates, the dread formula, no network calls in the routing code, the flicker cap, and the first-run requirements for judges.
- What I reviewed and sent back (Kiro was changed in 2 rounds):
  - Default dread slider was 0, so the first sample walk would show two identical routes. Changed to 3.
  - The "more dread weight = never more dark exposure" property broke when personal settings were on. Split routing distance (with setting penalties) from displayed distance, and made Shortest_Route ignore the toggles.
  - The "only these network requests" rule was wrong (the app also fetches the map style, glyphs and sprites). Listed the allowed requests, and scoped the zero-requests test to route planning.
  - Tapping the map was overloaded and impossible by keyboard. Added crosshair buttons ("Set start here / Set end here") and a Plan/Report mode switch.
  - The low-confidence marker used a fixed 0.5. Changed to the lowest quarter of the pack's confidences.
  - Tie-break for equal-cost routes was written for a list of candidates that Dijkstra doesn't have. Replaced with a canonical order by street id.
  - Smaller: whole-word banned-word matching, CSV formula-injection escaping, a smaller browser test list, and 3 new properties.
- Decisions I made: ship KL, London and Seattle only; a user's own note changes only their own routing, never anyone's tiers; the validation page is bundled at build time; the About screen says the tile provider can see the viewed area but not routes.
- Observation: Kiro applied all nine sets of changes but only read back the first part of the file, so I had it print the changed criteria to check them. Reviewing the output was worth doing: the spec was good on the first pass, but the problems I found were interactions between criteria, such as the dread slider default against the sample walk, and the monotonicity property against the personal settings.
- Credits: 11

### Design

- What I did: Approved requirements, then had Kiro generate `design.md` for `gloam-web-app`. It read the real files in `data/` and `docs/validation.md` first, which it quoted correctly (segment counts, the highway types in the data, which cities have validation tables).
- What Kiro got right:
  - Split the app into a pure core (graph, tiers, router, corrections, wording checks, flicker maths) with no network or DOM, and a thin shell around it. That makes "zero network calls" a testable property.
  - Checked its own maths: tier cut-offs use integer comparisons instead of floating point, the equal-cost tie-break is a worked example (140/165, 180/180, 340/240), and it included a short proof of why raising the dread slider can never increase dark exposure.
  - 33 correctness properties, each linked back to a requirement.
  - Flagged its own gaps as open items (same-place route, duplicate ids, TileJSON request).
- What I reviewed and sent back:
  - The flicker limit (max 25% brightness change per 100 ms) was only met by the ideal curve. The map updates opacity in steps, so the real change could reach about 0.39. Fixed with shallower dips and faster updates, and the property now tests the stepped curve.
  - Every street in a layer would have flashed in sync. Added phase offsets.
  - A validation test hard-coded which cities fail to beat the baseline. Changed it to read the parsed file, since the numbers will change when I pick the final training weight.
  - Sample walks only had to differ from the shortest route. Now each must cross at least 3 tiers so glow, flicker and fog are all visible on first run.
  - Fixed smaller things: marker updates using feature-state, TileJSON added to the allowed requests, `clearExample` state.
-Decisions I made:
  - All five cities ship (Seattle, KL, London, Berlin, Manchester). Berlin, London and Manchester are the ones with real validation numbers, and packs only load when picked.
  - Skipped jsdom. It can't check layout or keyboard use, so I'll check those by hand in Chrome device mode.
  - Hosting: Render static site as main (tested open from Ningbo and KL), GitHub Pages as fallback.
- Observation: the first pass was strong again. The problems I found came from the gap between the maths and what actually runs (a smooth curve versus the stepped opacity updates the map can render). That kind of gap is hard to catch from the spec alone.
- Credits: 21.58

### Tasks

- What I did: Approved the design, then had Kiro generate `tasks.md` for `gloam-web-app`. It produced 19 top-level tasks, with all 33 correctness properties as their own sub-tasks and checkpoints at tasks 5, 11, 16 and 19.
- What Kiro got right:
  - Built the pure core first (validation, parsing, graph, scoring, routing, corrections, flicker maths) and its tests, then the shell, map, UI and docs. Each task names the files it touches and the requirements it covers.
  - Flagged three problems in its own plan before I did: an unrequested fallback host in the hosting task, a dependency-ordering slip between two tasks, and placeholder sample-walk points that nothing should read yet.
- What I reviewed and sent back:
  - Every test was marked optional, which would let "run all tasks" skip the property tests. I had the same problem in the pipeline spec. All tests are now required.
  - One task had Kiro writing `docs/kiro-log.md` and another rewriting the README. I write the log myself, and the README task now only adds an app section.
  - Hosting results were going into `docs/validation.md`, which the pipeline regenerates and the app parses. Moved them to `docs/app-checks.md` and fixed the requirement that pointed at it.
  - The Render config built from `app/` but the packs live in `data/`, so I had it build from the repo root. Node version pinned.
  - Reordered so the sample-walk picker runs before the UI wiring, so there is a walk to show on first run.
- Decisions I made:
  - Keep the GitHub Pages fallback build, as a back-up host.
  - Ignore Kiro's wave ordering and run tasks in numbered order, as with the pipeline.
  - Cut order if I fall behind: the Dark_Spot_List first, then corrections. The route, heartbeat and first-run walk stay.
  - Pack files have to be committed before Render can build, so `data/*.geojson` comes out of `.gitignore`.
  - Credits: 10.2

## 9 Nov: Tasks

### Web App Task 1: scaffold and validation

- Kiro set up `app/` (Vite, TypeScript, Vitest, fast-check, maplibre-gl as the only runtime dependency, exact pinned versions plus a lockfile) and the shared `ArgumentError` and guards. It said clearly that it hadn't run the checks itself, and that the numRuns meta-test only covers the global setting. I ran the checks.
- Credits: 4.94

### Web App Task 2: geo helpers and pack parsing

- Kiro added the distance, projection and bounds helpers and the pack parser, with property tests for bounds (Property 32) and pack validation (Property 3), plus an extra growBounds property it added itself. 
- It defined the Building and BuildingProblem types the design had left out, and skips buildings with non-Polygon geometry (not in the design; I accepted it). 
- Credits: 6.52

### Web App Task 3: street graph and snapping

- Kiro built the graph builder (validates each segment alone, rejects every copy of a duplicate id, splits at shared coordinates, sorts everything by value so input order can't matter) and the snapper (200 m grid, 3x3 lookup, inclusive 150 m), with property tests 4, 5, 6 and 15. It sorts nodes by the string "lon,lat", which is deterministic but not geographic; that matches the design. 
- It left five type errors in the task 2 test file that it first reported as clean; I had it fix them.
- Credits: 13.99

## 10 Nov: Tasks

### Web app task 4: scoring and tiers

- Kiro wrote dread, the tier rule (integer rank comparisons, no 0.5 cut-off anywhere) and the note overrides, then property tests 1, 2, 7 and 8 (rank-only tiers: five order-preserving transforms and a shift of every probability below or above 0.5 all give identical tiers).
- The parts ran as separate sub-agents, so no one ran the whole suite until I did. I ran the full suite, which passed and ran tiers on all five real packs.
- Credits: 8.99

### Web App Task 5: checkpoint

- 49 tests passing in 58 s, no code changes.
- Credits: 1.34

### Web App Task 6 (6.1 to 6.8): routing

- Kiro wrote the cost functions and the router (backward Dijkstra, then a forward walk picking the smallest street id among cheapest steps) with property tests 9-14. 
- Property 9's brute-force check found a real bug: for tiny snap positions (t around 5e-324) the router returned "no route" even though one existed. 
- The sub-agent first narrowed the test generator to avoid it, which hides the bug. I had it fix the router (1 mm collapse onto the junction plus a safe walk) and restore the full range. 
- A weak example in the Property 11 test was replaced with the hand-checked one from the design.
- Real-data check of the router: 40 pairs of nodes about 1 km apart in KL and 40 in Seattle, routed at lambda 0, 1, 3, 6 and 10. Zero monotonicity violations. At lambda 3 the route differs from the shortest in 40/40 KL pairs and 38/40 Seattle pairs, with dark exposure 6-35% lower for 1-3% more distance in the pairs I looked at. Lambda 3, 6 and 10 gave identical routes, so the slider's top range may be wasted; I'll check before building the slider.
- Credits: 29.34

### Web App Task 6 (6.9 to 6.12): shares, comparison, heartbeat

- Kiro added the tier-share rounding (largest remainder, sums to exactly 100), distance and minutes formatting, route comparison on displayed values, and the heartbeat series and text summary, with properties 16, 17 and 18. 
- The sub-agents invented the RouteSummary, RouteDelta and HeartbeatSeries shapes because the design didn't define them; I accepted them and updated the design. 
- The heartbeat summary and unit strings were written outside strings.ts, so the banned-word test would not have seen them; I'm having Kiro move them at task 9.1.
- Credits: 8.94

### Web App Task 7: corrections and settings

- Kiro wrote the weight, status rule, dark-spot list, CSV export and the two local stores (one note per street per device; failed reads and writes leave earlier data untouched), with properties 19-24. 
- The sub-agents ran only their own files. 
- Decisions: capped the Property 19 date range because the weight underflows to 0 after about 88 years; header row unquoted in the CSV; added a small keyValueStorage wrapper so tests need no browser.
- Credits: 16.39

### Web App Task 8: visual maths

- Kiro wrote the flicker maths (max rate 8/3 per second, under the cap of 3), the effects ladder and the tier style tables, with properties 27-30. 
- My review found the slow-change test only compared samples up to 99 ms apart, short of the 4-step window the design's bound needs; Kiro strengthened it. 
- It also left 16 type errors in the task 7 tests because sub-agents only run their own files, so I added a standing rule to tech.md.
- Credits: 14.49

### Web App Task 9: strings, banned words, validation parsing

- Kiro wrote the string catalogue (Disclaimer verbatim, tier wording, templates), a whole-token banned-word matcher ("insecure" doesn't match "secure") and a parser for docs/validation.md that returns figures exactly as written, with properties 25 and 26 and example tests that expand every template and also scan the real validation file. 
- The sub-agent invented the lighting-terms check and the error/legend wording because the spec gave no mechanism.
- Credits: 11.05

### Web App Task 10

- Kiro wrote the app state reducer (starts in Plan_Mode, Start_Setting_State; Report_Mode taps never move points; Plan_Mode taps never select a street) with Property 31. 
- It noticed the spec didn't say what happens to the example flag when the user sets a point during the Sample_Walk. 
- I decided that setting any point clears the example first and applies the new point alone, and added R17.17. 
- Credits: 14.5

### Web App Task 11: checkpoint
  
- 163 tests passing in 20 s, no code changes.
- Credits: 1.3

### Web App Task 12: shell I/O, sample walks, no-network test

- Kiro wrote the pack manifest and loaders (segments first, then buildings; one AbortController per load; 15 s deadline; nothing committed on failure), the geolocation wrapper, the sample-walk picker and Property 33 (zero network calls from the pure modules). 
- Picker chose one walk per city by maximising the dark-metre difference; I noted that makes them best cases, not typical, and will label them honestly in the UI.
- Credits: 18.35

### Web App Task 13: map and visuals

- What Kiro built: the bundled dark map style (one OpenFreeMap vector source loaded through its TileJSON; only water, waterway, landcover, landuse, park and roads; no labels, icons or glyphs), the map view with an always-open attribution, the street layers with 27 flicker cohort layers, the "your note" marker, the 5 s tile-timeout fallback and an fps sampler, with mocked-event tests. tsc clean; 44 files, 207 tests passing. Not yet run in a browser.
- Spec changes made along the way: tile timeout raised from 3 s to 5 s (a cold tile from Ningbo took 1.7 s); the allowed-request list no longer includes glyphs or sprites.
- What went wrong: during 13.1 Kiro appended its own entry to this log, which I write myself. I told it off, deleted its entry and added a steering rule saying never to edit docs/kiro-log.md. Kiro also chose the base-map colours itself instead of using the palette in design.md; I've asked it to use one palette module for both the map and the tier colours.
- Credits: 16.76

### WWeb App Task 14.1 to 14.2: shell

- Kiro’s first browser check found the map blank. Cause: MapLibre 6.17 couldn’t locate its worker file, in dev and in the production build. Kiro fixed it by importing the worker as a Vite asset. My guess (Vite blocking the pack files) was wrong; I should have asked for the Console first.
- Credits: 29.79

### Web App Task 14.3: plan controls

- Kiro built the mode switch, crosshair buttons, "tap sets" control, "use my location", the four settings toggles, the lambda slider (0-10, step 0.5, default 3) and the planner that checks out-of-area, too-far, same-place and no-route cases. 
- It caches the Shortest_Route per start/end pair and throttles the slider (immediately after a pause, then at most every 100 ms with the last value always applied, which I prefer over a plain debounce). 
- One route on Seattle's 34,609-edge graph took 19 ms on a desktop (57 ms worst). Real-data check before this task: routes still change between slider steps up to lambda 10 in KL and Seattle, so I kept the range. 
- Nothing is wired into the page yet.
- Credits: 12.65

### Web App Task 14.4, 14.7: route panel, wiring

- 14.4: route panel with Gloam route and Shortest route side by side (distance, walking time, share of length by lighting tier, signed deltas), the verbatim Disclaimer, and the dread chart along the route.
- 14.7: wiring. Plan controller, crosshair buttons ("Set start here", "Set end here", "Use my location"), map taps, lantern route layer, and a first-run example walk per city with a label and a clear control.
- Slider updates use throttling, not debouncing, so the route moves while you drag. Measured 18–57 ms per replan. The cache key includes the user's overrides.
- Route panel and heartbeat chart built from `STRINGS`. Low-confidence markers differ by shape, not colour alone. Reduced-effects mode draws no pulse.
- The example walk is drawn automatically for each city from the picked sample walks. A new `showExample` reducer action sets and clears it. Only one pack is held in memory at a time.
- Result reported: `tsc` clean, 46 files, 223 tests passing. Nothing was run in a browser.
- Kiro had not opened a browser, so I had Mari run it herself. I told her not to let Kiro take screenshots, because they were unreliable earlier.
- Real browser check on Seattle at phone width (393 px):
  - The example walk loads with its label ("Example walk, picked to show the difference. Yours may differ.") and "Clear example".
  - Route panel shows 1.1 km, 14 min vs 13 min, confirmed lit 26% vs 0%, +34 m, +1 min, and −893 m through estimated streets darker than most streets here.
  - Heartbeat chart draws with a diamond marker for the low-confidence stretch.
  - Disclaimer, Plan/Report, start/end toggle, the three location buttons, slider and four settings all show.
- Gap found: tapping a point shows nothing on the map until a route exists, because there are no start/end markers. This goes into the next prompt.
- Polish for later, not blocking: the slider value at the right edge renders as a tiny glyph; the corner note is large on a phone; the UI overall needs a final visual pass.
- Next prompt to Kiro: start/end markers (different shape or ring for start vs end, drawn above the segments and below the route), then 14.6.
- Credits: 15.99

### Web App Task 14.6, 14.5: markers; legend/demo/reset, corrections

- Start/end markers (spec first: new R6.12 and a design note), different shapes so it isn't colour alone.
- 14.6: About, How Gloam Guesses (AUC from the bundled validation.md only, names the cities that did not beat the baseline), Legend (≤80 chars per line), Demo mode (on by default when hosted), Reset, Reduced-effects switch.
- 14.5: Report mode, one-tap notes, street card, Dark_Spot_List with CSV export.
- Markers: solid disc for start, hollow ring for end, drawn above the segments and below the route. Pure `buildMarkersGeoJSON` tested.
- 14.6: all items done. The raw-text link is a `blob:` URL, so no network request. Reset restores the example walk and display defaults and keeps my slider, toggles and notes.
- 14.5: a tap selects the street within about 10 px, querying only street layers. A note overrides lit probability and confidence for my routing only, and Tiers never see notes. Sample rows carry the SAMPLE DATA badge and vanish when Demo mode is off.
- Results: tsc clean, 48 files, 257 tests. `vite build` succeeds. No DOM tests, because the test setup has no jsdom, and Kiro listed the untested UI parts itself.
- Kiro treats an empty sample list as a load failure. I asked for a check that cities without sample rows don't show a false error. Kiro answered that all five cities have 12 sample rows. [ ] verified with the node one-liner
- Focus is lost after a report tap. Asked for a fix.
- Asked Kiro to check the CSV for spreadsheet formula injection.
- Credits: 26.58

### Web App Task 14.7, 14.8: final wiring check, manual-check document

- 14.7: finish the wiring. First run, Sample_Walk with label and clear control, hint, one pack in memory, no location request on load.
- 14.8: a manual-check document for the things tests can't cover (focus order, attribution, layouts, browsers, fps, graph build time, keyboard use). Results are mine to record.
- I added two fixes to the 14.7 prompt: restore keyboard focus after a report tap, and neutralise spreadsheet formula characters in the CSV.
- 14.7: it audited `main.ts` against each sub-item. Everything was already wired from the earlier UI tasks, so the only change was a stale header comment. Reported tsc exit 0, 48 files, 257 tests.
- 14.8: created `docs/app-checks.md` with nine sections (focus, attribution, 390 and 768 px layouts, browsers, fps, graph build time, keyboard use, hosting placeholder for task 16.2). All result fields empty, no checks run.
- Kiro did not report the focus fix or the CSV fix. The test count stayed at 257, so I treated both as not done and re-sent them.
- It did not capture the tsc output, which breaks the tech.md rule. Asked for the raw last lines of both commands from now on.
- It wrote an entry into `docs/kiro-log.md` for 14.8, even though the steering rule says never to. I removed it. Steering didn't stop it, so the rule now goes in every prompt, and I set the file read-only with `attrib +R` while Kiro works.
- Re-sent the two fixes with a requirement that the test count goes up.
- Credits: 7.16

### Web App Task 15: Checkpoint

- `npx tsc --noEmit` in `app/` printed no errors and exited 0.
- `npx vitest --run` ended with 49 test files and 264 tests passing, in 5.12 s. Nothing failed, so nothing was edited.
- Credits: 1.36

