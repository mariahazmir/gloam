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

### Task 1.1 Create the package skeleton and pinned dependencies

- Result: pyproject with pins (numpy 2.2.6, scikit-learn 1.7.2, hypothesis, pytest), 18 empty module files, Hypothesis profile (100 examples), .gitignore additions. `python -m gloam_pipeline` exits 0.
- Caught: Kiro skipped the "pytest runs with zero tests" check and its two summaries disagreed about tasks.md. Asked it to run the check.
- Kiro pinned older numpy/scikit-learn than the latest because newer ones may drop Python 3.10. Good call, but it only checked that those two versions exist.
- Caught: Kiro's pyproject said Python >= 3.10, but hypothesis 6.170.15 needs 3.11+ (checked against PyPI metadata). Raised the minimum to 3.11 across steering, specs and README.
- Pytest with zero tests exits 5 ("no tests collected"). That is the normal result, not a failure.
- Credits: 2.72

### Task 1.2 Verify pinned dependency versions and install the environment

- Caught: Kiro's pyproject said Python >= 3.10, but hypothesis 6.170.15 needs 3.11+ (checked against PyPI metadata). Raised the minimum to 3.11 across the spec and pyproject.
- Pytest with zero tests exits 5 ("no tests collected"): the normal result.
- Credits for 1.1 verification + 1.2: 2.05

### Task 1.3 Implement `errors.py`, `checks.py` and `config.py`

- Result: errors.py, checks.py, config.py (PipelineConfig) + 26 unit tests.
- Checked: config defaults vs design table, max_buildings_file_kb present: yes, booleans rejected: yes.
- Credits: 2.38

### Task 2.1 Implement `classify.py`

- Result: parse_osm_key (top-level id first, @id fallback), classify (first match wins).
- KL, Berlin and London A counts matched my independent script exactly (segment, bus stop, food, shop, building).
- No feature lacked an id in any file. "other" (229 / 388 / 496) is mostly banks, pharmacies and other amenities outside the six types.
- Kiro's judgement call: a node tagged highway=residential is not a segment. Accepted.
- Credits: 2.29

### Task 2.2 Write property test for id parsing

- Mutation check passed: with the id priority swapped, 3 tests failed (shrunk example: top-level node/0 vs @id node/1). Reverted by hand because the file had uncommitted changes. Lesson: commit after every task so reverts are safe.
- Kiro's first generators were too clean: no non-ASCII digits, no "Way/1". Asked for wider ones. Python's isdigit() accepts Arabic-Indic, fullwidth and superscript digits, so those were the dangerous cases; the code already guarded with isascii().
- Left alone: .strip() means " way/1" parses.
- Credits: 4.74   Suite: 32 tests passing.

### Task 2.3 Implement `loader.py` merge and footprint pass

- KL, Berlin and London A+B all matched my independent counts: input, duplicates (London 1,083), unique, footprints (6,922 / 7,628 / 10,332). Accounting identity holds for all three.
- London overlap: 1,083 duplicates removed, first file wins.
- Credits: 2.7

### Task 2.4 Write property test for merge accounting

- Mutations tried: keep-last-instead-of-first → caught; skip duplicate count → caught.
- Known limit: the per-type recount uses classify(), so it can't catch a classify bug; classify has its own test and the real-file check.
- Credits: 3.66   Suite: 33 tests passing.

### Task 2.5 Write property test for the footprint pass

- Mutation: skip polygons that also carry a shop tag → caught. This is the regression test for the "shop buildings vanish from the 3D file" bug I caught in the design review.
- Credits: 2.55   Suite: 34 passing.

## 9 Nov: Tasks

### Task 2.6 Implement `io.read_geojson` and `summarise` argument checks

- Windows trap checked: every file open uses encoding="utf-8": yes
- Real-data run on London A+B: 31,415 / 1,083 / 10,332 matched.
- Kiro's naming choice: load_city lives in io.py so loader.py stays pure.
- Credits: 2.62   Suite: 43 passing.

### Tasks 2.7 Write unit tests for loading and key parsing

- 2.7: 9 unit tests (missing/invalid/empty file, two-file merge, parse_osm_key cases, keyless warning, shop+building polygon).
- Whole of task 2 checked on real KL / Berlin / London files. Encoding: utf-8 on the one read.
- Bad-encoding file gives InputFileError
- Credits: 2.61

### Task 3.1 Implement `geometry.py`

- I added hand examples + a grid-vs-brute-force property test (not in the plan). Mutation (centre cell only): caught.
- Kiro's API choice: GridIndex items are (x, y, payload) in projected metres, queried with within(x, y).
- Credits: 2.24  Tests: 9 in test_geometry.py; full suite 61 passing

### Task 3.2 Implement `segments.py`

- Checked on real files (KL / Berlin / London A): segments, labels, closed ways, skipped, unrecognised lit values matched my independent count. Berlin's one odd value: "opposite".
- Footway: Kiro stores normalised kind vs R2.3's raw tag.
- Credits: 3.08

### Task 3.3 Write property test for segment selection and labels

- 3 mutations all caught: trunk allowed, lit=no as untagged, unrecognised counter skipped.
- Generator was weak (no "yes ", "none", random text); Kiro widened it. Added "opposite" (a real Berlin value) as an example.
- Credits: 4.85

### Task 3.4 Write property test for lengths and degenerate or closed ways

- 3.4 mutations: stop counting closed ways → caught; let single-coordinate way through.
- Includes closed LineStrings (not only polygons): yes
- Credits: 2.5

### Task 4 Checkpoint - Ensure all tests pass

- Checkpoint 4: 66 tests passing.
- Credits: 1.24

### Task 5 (5.1 to 5.6)


- Ran as one group because credits aren't the constraint (about 80 used of 4,000); time is.
- check_features.py output matched my independent calc: means/shares/p95/max within 1% (buildings 24.41 vs 24.51 mean, likely a centroid-definition difference); 9 of 10 sample segments exact, one off by 1. Missing segments 0; vector length 31. Run time 33 s for KL.
- Kiro's choices: midpoint = half the length along the line; scale_counts takes an optional missing list; the Property 7 test disables the deadline.
- Credits: 15.08

### Task 6 (6.1 to 6.10)

- Finding: I computed shift for 5 cities from the raw extracts. KL 0.098, Berlin 0.097, Seattle 0.090, Manchester 0.115, London 0.169 (vs pooled London+Berlin+Manchester). Penalty starts at 0.10, so it does not trigger for KL. 
  - A: leave the code as is. The measure found the five cities’ feature distributions similar, so the penalty is small in practice, and that the real KL risk, different lighting conventions, is handled by the KL ground-truth check and by the app’s wording.
  - B: tighten the thresholds, for example 0.05 and 0.25, so KL would get about 0.94 and London about 0.70. That changes the hand-checked 0.875 in the design and several tests, and the numbers would be tuned to match the five-city sample.
- Decision: A leave.
- Hand numbers 0.457 / 0.320 / 0.083125 and shift 0.2 → 0.875 confirmed in tests.
- Property 12 example count: 100 (from --hypothesis-show-statistics)
- Credits: 16.23

### Task 7 (7.1 to 7.3)

- Changed unseen_highway_types to count against all 16 walkable types, not only types seen in training.
- Credits: 5.35

### Task 8 (8.1 to 8.6)

- Property 6 failed twice with a Hypothesis deadline (255 ms vs 200 ms). Real KL features run took 32s. Decision: deadline=None on that one test only.
- Task 8 mutations: untagged weight [ ]; held-out rows kept [ ]; importance ascending [ ]; intercept noise [ ].
- Credits: 11.73

### Task 9

- Property 6 hit a deadline again. Kiro set deadline=None in the shared profile instead of per test. Accepted: first run took 232 s, rerun 9.8 s, so it's machine load (OneDrive?), not slow code (real KL run: 33 s). Watch total suite time, not per-test deadlines.
- 134 tests passing.
- Credits: 1.83
  
### Task 10 (10.1 to 10.9)

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

### Task 11 (11.1 to 11.5)

- Measured the file sizes the exporter would write (my independent calc from raw extracts): segments files 3.2 to 6.7 MB, buildings 1.8 to 3.1 MB, all under 1 MB gzipped. The spec's 5 MB default would have rejected Seattle and Manchester, so I raised both defaults to 8 MB.
- Extra field added by Kiro: building_count in buildings metadata. Kept.
- Credits: 11.4

### Task 12 (12.1 to 12.3)

- artifacts.py (city.json, features.json, model.json to and from dataclasses), io.py (read_json, write_json, write_geojson_checked), Property 27 round trip, 9 write tests.
- Oversized file test: the file is deleted, the earlier valid file stays byte-identical, and the error names city, file kind, size and limit.
- Windows check: final step uses os.replace. utf-8 on every text write. OneDrive lock problems: none.
- Kiro left a malformed pair_rates entry raising TypeError. Asked for InvalidArgumentError, because the CLI reads these files from disk.
- 8192 default applied everywhere (grep for 5120 comes back empty).
- Credits: 8.67   Suite: 254 passing.

### Task 13 (13.1 to 13.3)

- Task 13 (CLI, CLI tests, wording check): credits 15.52. 270 tests passing.
- Credits: 15.52

### Real run and Gate 1

- Pipeline's validate numbers at untagged weight 0.2 / 0.05 / 0.01 matched my independent replication to within 0.001.
- Held-out walking-path AUC (0.2 / 0.05 / 0.01): Berlin 0.776 / 0.825 / 0.872; London 0.652 / 0.651 / 0.639; Manchester 0.744 / 0.792 / 0.834. Baselines: rule 0.500; road type 0.505 / 0.556 / 0.534; road type + footway kind 0.828 / 0.627 / 0.845.
- Finding: model clearly beats the simple baselines but is roughly level with road type + footway kind. Nearby places add little on tagged walking paths. Weight to be chosen after KL ground truth.
- Precision at 0.5 equals the base rate (0.86 to 0.97): uninformative.
- Exports: 10 files, 3.1 to 6.6 MB (segments), 1.8 to 3.1 MB (buildings). KL: 77.6% of estimated segments >= 0.5 → the app must use relative thresholds.

### Task 14

- 270 tests passing in 39 s, no code changes.
- Credits: 1.24

### Task 15 (15.1 to 15.2)

- docs/model.md: one paragraph, about 100 words, test enforces the 150-word limit.
- README: Kiro appended a Pipeline notes section with placeholder file names and duplicated credit/disclaimer text. Asked it to use the real commands and remove the duplicates. First README command run as written.
- Credits: 4.39

### Task 16

- 271 tests passing in 25 s, no code changes.
- Credits: 1.76