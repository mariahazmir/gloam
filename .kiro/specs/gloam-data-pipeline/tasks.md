# Implementation Plan: gloam-data-pipeline

## Overview

Implement the offline Python package `gloam_pipeline` under `pipeline/`, in the order the design's dependency direction allows: scaffolding, errors and config, loading, geometry and segments, features, scoring, baselines, model, validation, export, file I/O, CLI, then docs. Pure modules come first; `io.py` and `cli.py` are the only modules that touch files, the clock or stdout. Every step builds on the one before and ends with the CLI wiring everything together.

Conventions for all tasks:
- Language: Python 3.10 or later. Code in `pipeline/gloam_pipeline/`, tests in `pipeline/tests/`.
- Small, targeted diffs. Pure logic has no I/O and no hidden state.
- Every public function rejects NaN, infinite and out-of-range values with `InvalidArgumentError` naming the argument.
- Each property test is one Hypothesis test in its own file `pipeline/tests/test_property_NN_<topic>.py`, runs at least 100 examples (shared settings profile in `conftest.py`), and carries the tag comment `# Feature: gloam-data-pipeline, Property N: <text>`.
- Any example value in a test or doc is computed by hand against the formula first.
- Wording: no banned words from the product rules in any string, report template or doc.

New dependencies (explained, as the technical rules require):
- `numpy` (pinned exactly): array maths for vectorised prediction; required by scikit-learn.
- `scikit-learn` (pinned exactly): `LogisticRegression.fit` with `sample_weight` for the weighted positive-unlabeled model, with the deterministic `lbfgs` solver. Used only inside `model.fit`.
- `hypothesis` (dev, pinned exactly): property-based tests, required by steering.
- `pytest` (dev, pinned exactly): test runner.

## Tasks

- [ ] 1. Project scaffolding and shared foundations
  - [ ] 1.1 Create the package skeleton and pinned dependencies
    - Create `pipeline/pyproject.toml` (Python >= 3.10, package `gloam_pipeline`, console entry via `python -m gloam_pipeline`), with `numpy` and `scikit-learn` pinned exactly as runtime dependencies and `hypothesis` and `pytest` pinned exactly as dev dependencies
    - Create `pipeline/gloam_pipeline/__init__.py`, `__main__.py` (stub that calls `cli.main`), and empty module files named in the design layout
    - Create `pipeline/tests/conftest.py` with a Hypothesis settings profile (`max_examples=100`, deterministic database off) and `pipeline/tests/strategies.py` stub
    - Ignore only the large intermediate files under `pipeline/data/`. Do not ignore the root `data/` folder (exported city files the web app loads) and do not ignore `.kiro/`. After editing, check with `git check-ignore -v` that `data/` and `.kiro/` are not ignored and that a file under `pipeline/data/` is
    - _Requirements: 10.9_

  - [ ] 1.2 Verify pinned dependency versions and install the environment
    - Pins must come from versions confirmed to exist, never guessed. Look up the real released versions of `numpy`, `scikit-learn`, `hypothesis` and `pytest` (for example `pip index versions <pkg>` or `pip install --dry-run` with the pins) and confirm each is compatible with the chosen Python version
    - Fix any pin in `pipeline/pyproject.toml` that does not exist or is incompatible
    - Install the dev environment and confirm `python -m pytest` runs with zero tests
    - _Requirements: 10.9_

  - [ ] 1.3 Implement `errors.py`, `checks.py` and `config.py`
    - `GloamError`, `InvalidArgumentError(argument, value, allowed)`, `InputFileError`, `DataError`, `TrainingError`; messages like `argument 'feature_distance_m' rejected value nan; allowed 10 to 1000`
    - `check_finite`, `check_range` (open and closed bounds), `check_text_length` (also rejects whitespace-only), `check_count_between`
    - Frozen config dataclasses validated in `__post_init__` with the defaults and ranges from the design table, including `low_value < high_value`
    - _Requirements: 1.4, 3.2, 3.3, 5.4, 5.5, 6.2, 6.3, 6.4, 6.6, 8.3, 10.8_

- [ ] 2. Load city packs
  - [ ] 2.1 Implement `classify.py`
    - `parse_osm_key(feature)`: read top-level `id` (`way/123`) first, fall back to `properties["@id"]` only when the top-level id is missing or unparseable, else return `None`
    - `classify(feature)`: first match wins in the design order (segment, bus_stop, food, shop, building, landuse, other)
    - _Requirements: 1.2, 1.5, 1.6, 2.1_

  - [ ] 2.2 Write property test for id parsing
    - **Property 30: Top-level id wins, with fallback to `@id`**
    - **Validates: Requirements 1.2**

  - [ ] 2.3 Implement `loader.py` merge and footprint pass
    - `merge_features`: keep first occurrence per `(element type, id)` in file-list order, synthetic key `("unknown", file_index, position)` plus a warning for features with no parseable id, counts per type, unmatched and duplicates removed
    - `collect_building_footprints`: scan all deduplicated features, keep every Polygon with a `building` tag whatever its summary type, count non-Polygon building-tagged features as warnings; footprints are outside the exclusive counts
    - _Requirements: 1.1, 1.2, 1.5, 1.6, 3.1, 8.4_

  - [ ] 2.4 Write property test for merge accounting
    - **Property 1: Merge keeps the first copy and accounts for every feature**
    - **Validates: Requirements 1.2, 1.5, 1.6**

  - [ ] 2.5 Write property test for the footprint pass
    - **Property 28: Any building-tagged polygon is a footprint, and the summary counts it once**
    - **Validates: Requirements 1.5, 1.6, 3.1, 8.4**

  - [ ] 2.6 Implement `io.read_geojson` and `summarise` argument checks
    - `io.py`: `read_geojson(path)` raising `InputFileError(path, problem)` for missing, unreadable, invalid or empty files
    - Loader entry point that checks 1 to 50 paths and a 1 to 100 character, non-whitespace city name before reading any file, and builds no dataset if any file fails
    - _Requirements: 1.1, 1.3, 1.4_

  - [ ] 2.7 Write unit tests for loading and key parsing
    - Three files with one missing, one invalid, one empty (error names file and problem); merge of two small files
    - `parse_osm_key` examples: both ids present and different, top-level absent, unparseable top-level, neither present (synthetic key and one warning)
    - A polygon tagged both `shop` and `building` counts once as a shop and also appears in the footprint list
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6_

- [ ] 3. Geometry and segments
  - [ ] 3.1 Implement `geometry.py`
    - `Projector(lat0, lon0)` local equirectangular projection to metres, `polyline_length_m`, `point_polyline_distance_m`, `point_in_polygon` (outer ring), `GridIndex` with cell size equal to the feature distance
    - All outputs finite; reject NaN and infinite coordinates naming the argument
    - _Requirements: 2.4, 3.1_

  - [ ] 3.2 Implement `segments.py`
    - `Segment` dataclass, `lit_label` mapping (`yes`, `24/7`, `automatic`, `dusk-dawn` to `tagged_lit`; `no` to `tagged_unlit`; missing to `untagged`; other present values to `untagged` and counted), `build_segments`
    - Accept LineString and Polygon (outer ring); skip ways with fewer than 2 distinct coordinates or unresolvable geometry and record the reason; closed ways with at least 2 distinct coordinates become one segment and are counted; never drop untagged segments
    - Exclude motorway, trunk, missing and unlisted highway values; store id, name, highway, footway kind, geometry, length
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 2.9_

  - [ ] 3.3 Write property test for segment selection and labels
    - **Property 3: Segment building selects exactly the walkable ways and labels all of them**
    - **Validates: Requirements 2.1, 2.2, 2.7, 2.8, 2.9**

  - [ ] 3.4 Write property test for lengths and degenerate or closed ways
    - **Property 4: Lengths are valid and degenerate or closed ways are handled**
    - **Validates: Requirements 2.4, 2.5, 2.6**

- [ ] 4. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 5. Build features
  - [ ] 5.1 Implement scaling in `features.py`
    - `percentile_linear(sorted_values, q)` with linear interpolation, `scale_counts` as `min(1, c / p95)`, zeros when fewer than two distinct values or `p95 = 0`, min-max scaling for length over non-missing segments
    - _Requirements: 3.6_

  - [ ] 5.2 Write property test for scaling
    - **Property 5: Percentile-capped scaling stays in range and is monotone**
    - **Validates: Requirements 3.6**

  - [ ] 5.3 Implement `raw_features` and `to_vector`
    - `RawFeatures`, `ScaledCounts`; counts of bus stops, food places, shops and building footprint centroids within the feature distance (using `GridIndex`); land use at the segment midpoint mapped to {residential, commercial, retail, industrial, other, none}; footway kind {sidewalk, crossing, other, none}
    - Validate feature distance 10 to 1000 m before computing; defaults plus `missing=True` when a feature cannot be computed, then continue
    - Use only the city's own data; never read `label` or the `lit` tag
    - 31-value vector: highway one-hot (16), footway kind (4), scaled length (1), four scaled counts (4), land use (6)
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7_

  - [ ] 5.4 Write property test for order and city independence
    - **Property 6: Features do not depend on input order or other cities**
    - **Validates: Requirements 3.5, 10.2**

  - [ ] 5.5 Write property test that features ignore the lit tag
    - **Property 7: Features ignore the lit tag**
    - **Validates: Requirements 3.4, 10.3**

  - [ ] 5.6 Write unit tests for features
    - Hand-built street with known counts at known distances; land-use midpoint lookup; missing-feature defaults
    - Scaling examples computed by hand: `[0, 2, 4]` gives `p95 = 3.8` and `[0.0, 0.526, 1.0]`; `[3, 3]` gives zeros; twenty zeros and one 9 give all zeros
    - Invalid feature distance (NaN, infinite, 5, 2000) names the argument and allowed range
    - _Requirements: 3.1, 3.2, 3.3, 3.6, 3.7_

- [ ] 6. Distribution shift and scoring
  - [ ] 6.1 Implement `shift.py`
    - Bin each raw count into {0, 1, 2, 3 to 5, 6 or more}, proportions over non-missing segments, total variation distance per feature, mean as the city shift (0 to 1), pooled training histograms
    - Penalty `g(shift) = 1 - 0.5 * clamp((shift - 0.10) / 0.40, 0, 1)` with `T_LOW = 0.10` and `T_HIGH = 0.50`
    - _Requirements: 6.10_

  - [ ] 6.2 Implement `scoring.py`
    - `score_segment` returning `Score(lit_probability, confidence, label_source)`: tagged labels use `high_value`, `low_value` and `tagged_confidence`, never read counts, never overwritten by the model; estimated segments use `base = tc * (0.25 + 0.60 * support)`, multiplied by 0.7 when missing and by `g(shift)`
    - `assert_valid_score(segment_id, field, value)` raising `DataError` for NaN, infinite or out-of-range values
    - Reject NaN, infinite or out-of-range inputs naming the argument; no I/O, no hidden state
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8, 6.9, 6.10, 6.11, 6.12, 10.8_

  - [ ] 6.3 Write property test for invalid arguments
    - **Property 2: Invalid arguments are rejected and named**
    - Cover config values, loader arguments, feature distance and scoring inputs through a shared invalid-value strategy
    - **Validates: Requirements 1.4, 3.3, 5.5, 6.6, 10.8**

  - [ ] 6.4 Write property test for score range
    - **Property 12: Scores are finite and in range**
    - **Validates: Requirements 6.1, 10.1**

  - [ ] 6.5 Write property test for label source and tagged values
    - **Property 13: Label source, tagged values and estimated confidence are consistent**
    - **Validates: Requirements 6.2, 6.3, 6.4, 6.5, 6.7, 10.4**

  - [ ] 6.6 Write property test for count monotonicity
    - **Property 14: More nearby places never lower confidence**
    - **Validates: Requirements 6.8, 10.6**

  - [ ] 6.7 Write property test for missing features
    - **Property 15: Missing features lower confidence**
    - **Validates: Requirements 6.9**

  - [ ] 6.8 Write property test for distribution shift
    - **Property 16: Distribution shift never raises confidence**
    - **Validates: Requirements 6.10, 10.7**

  - [ ] 6.9 Write property test for scoring determinism
    - **Property 17: Scoring is deterministic**
    - **Validates: Requirements 6.11**

  - [ ] 6.10 Write unit tests for scoring and shift
    - Hand-checked confidence values from the design: 0.457 (rounded from 0.4571875), 0.320 (from 0.32003125) and the minimum 0.083125 with `tc = 0.95`
    - Shift hand check: histograms `[0.5, 0.2, 0.1, 0.1, 0.1]` and `[0.7, 0.1, 0.1, 0.05, 0.05]` give `tvd = 0.2` and `g = 0.875`
    - NaN injected into a computed score raises `DataError` naming the segment and field
    - _Requirements: 6.1, 6.7, 6.9, 6.10, 6.12_

- [ ] 7. Baselines
  - [ ] 7.1 Implement `baselines.py`
    - `rule_baseline` (primary, secondary, tertiary lit, else not), `learn_highway_rates` from training tagged segments only, `highway_rate_baseline` with overall lit rate fallback and a count of unseen highway types; `TrainingError` when no tagged segments exist
    - Both baselines read highway class alone
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

  - [ ] 7.2 Write property test for the rule baseline
    - **Property 18: Rule baseline depends on highway class only**
    - **Validates: Requirements 4.1, 4.2**

  - [ ] 7.3 Write property test for the highway-rate baseline
    - **Property 19: Highway-rate baseline uses the training rate, with fallback**
    - **Validates: Requirements 4.3, 4.4, 4.5**

- [ ] 8. Train the model
  - [ ] 8.1 Implement `model.py`
    - Row targets and weights (`tagged_lit` 1/1, `tagged_unlit` 0/1, `untagged` 0/`untagged_weight`), rows sorted by `(city_id, segment_id)`, `LogisticRegression(C=1.0, solver="lbfgs", max_iter=1000, random_state=seed)` with `sample_weight`
    - Check 1 to 20 distinct cities, held-out city known and leaving at least one training city; drop held-out rows; `TrainingError` naming cities and count when there are zero `tagged_lit` rows or no target-0 rows
    - Pure numpy `predict` (sigmoid of `x @ w + b`) with no scikit-learn import; feature importance as `|coefficient|` ranked highest first with ties by name
    - Build the training log text (unknown-not-unlit statement, the three weights, row counts, importance ranking); model dict also carries highway rates, overall lit rate, unseen highway types, training histograms, seed
    - _Requirements: 4.3, 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8, 5.9, 5.10_

  - [ ] 8.2 Write property test for training weights
    - **Property 8: Training weights follow the label**
    - **Validates: Requirements 5.1, 5.4, 5.6**

  - [ ] 8.3 Write property test for reproducibility
    - **Property 9: Training is reproducible**
    - Use small generated datasets (tens of rows)
    - **Validates: Requirements 5.7**

  - [ ] 8.4 Write property test for the held-out city
    - **Property 10: The held-out city does not influence the model**
    - **Validates: Requirements 4.3, 5.8**

  - [ ] 8.5 Write property test for feature importance
    - **Property 11: Feature importance covers every feature in ranked order**
    - **Validates: Requirements 5.10**

  - [ ] 8.6 Write unit tests for training
    - Zero `tagged_lit` rows raises `TrainingError` and leaves the model dict result unwritten; log text contains the unknown-not-unlit statement and the three weights; unknown held-out city and "leaves zero training cities" errors name the city; invalid untagged weight names the argument
    - _Requirements: 5.2, 5.3, 5.5, 5.6, 5.9_

- [ ] 9. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 10. Validation and report
  - [ ] 10.1 Implement `metrics.py`
    - `auc` (Mann-Whitney with average ranks, `None` when no positives or no negatives), `precision_at` (`None` when nothing scores at or above the cutoff), `road_type` (walking_path vs vehicle_road)
    - Positives `tagged_lit`, negatives `tagged_unlit`; `untagged` dropped before either metric
    - _Requirements: 7.1, 7.2, 7.3, 7.11_

  - [ ] 10.2 Write property test for AUC and precision
    - **Property 20: AUC and precision are valid or explicitly undefined**
    - **Validates: Requirements 7.1, 7.11**

  - [ ] 10.3 Implement `validation.py`
    - Hold-one-out orchestration: qualify cities by `min_unlit_city`, train on other cities only, learn highway rates from the same set, score the model (raw output), rule baseline and highway-rate baseline on identical segment sets (error naming city and split if they differ, no baseline metrics written)
    - Per road type metrics only at or above `min_unlit_road_type`; skipped cities and road types listed with count and threshold; no combined figure
    - "Did not beat" decision per baseline when both AUCs are defined
    - Ground truth: parse `osm_id,label` rows, exclude `unsure` and report the count, accuracy for model and both baselines, count unmatched ids, "not run" reason for missing, unreadable or all-`unsure` files
    - `check_ground_truth_city(gt_city, held_out_city)` raising `InvalidArgumentError` naming both values unless `held_out_city` is non-null and equal
    - _Requirements: 4.6, 4.8, 7.1, 7.3, 7.4, 7.5, 7.6, 7.8, 7.9, 7.10_

  - [ ] 10.4 Write property test for tagged-only metrics and minimums
    - **Property 21: Metrics use tagged segments only and respect road-type minimums**
    - **Validates: Requirements 7.2, 7.3, 7.4, 7.5, 7.8**

  - [ ] 10.5 Write property test for ground-truth accuracy
    - **Property 22: Ground-truth accuracy excludes unsure rows**
    - **Validates: Requirements 7.6**

  - [ ] 10.6 Write property test for the ground-truth city guard
    - **Property 29: Ground truth is only scored with a model that held out its city**
    - **Validates: Requirements 7.6**

  - [ ] 10.7 Implement `report.py`
    - Pure `render_validation(data) -> str`: per-city counts of the three classes, side-by-side model, rule and highway-rate tables to 3 decimals with "undefined" where needed, skipped cities and road types, tagged-only statement, untagged-is-unknown caveat, low-bias note, did-not-beat statements with both figures, ground-truth section or "not run" reason
    - Honest wording only; no banned words
    - _Requirements: 4.7, 7.7, 7.9, 7.10, 7.11_

  - [ ] 10.8 Write property test for the did-not-beat statement
    - **Property 23: The did-not-beat statement appears exactly when it should**
    - **Validates: Requirements 7.9**

  - [ ] 10.9 Write unit tests for validation and report
    - Hand-computed AUC 0.875 (positives `[0.9, 0.6]`, negatives `[0.6, 0.2]`) and highway rates 0.75 and 0.7
    - Mismatched segment sets raise an error naming city and split; report contents include per-class counts, tagged-only statement and caveat; ground-truth file missing, unreadable and only `unsure`; guard error includes both values for a different city and for a null `held_out_city`
    - _Requirements: 4.6, 4.7, 4.8, 7.7, 7.10_

- [ ] 11. Export
  - [ ] 11.1 Implement `export.py`
    - `build_city_collection` with metadata (schema version, kind, city, "© OpenStreetMap contributors", ODbL licence name, estimates note, distribution shift, segment count) and allow-listed properties only (`id`, `name`, `highway`, `lit_probability`, `confidence`, `label_source`); coordinates rounded to 6 decimals, probabilities to 3
    - `build_buildings_collection` from the footprint list (Polygon outer ring, `height_m`), `building_height_m` using a positive finite tag with optional trailing `m`, else the configured default; `parse_city_collection` for reload
    - Check every value before serialising; `DataError(segment_id, field, value)` and no document on a bad value
    - _Requirements: 6.12, 8.1, 8.2, 8.4, 8.5, 8.6, 8.7_

  - [ ] 11.2 Write property test for export round trip
    - **Property 24: Export and reload preserve segments within rounding**
    - **Validates: Requirements 8.1, 8.2, 10.5**

  - [ ] 11.3 Write property test for export validation
    - **Property 25: Export rejects invalid values**
    - **Validates: Requirements 6.12, 8.6**

  - [ ] 11.4 Write property test for building height
    - **Property 26: Building height uses a valid tag or the default**
    - **Validates: Requirements 8.4**

  - [ ] 11.5 Write unit tests for export content
    - Attribution text and licence name in both files; only allow-listed properties present; a shop polygon also tagged `building` appears in the buildings file
    - _Requirements: 8.4, 8.5, 8.7_

- [ ] 12. Intermediate files and file I/O
  - [ ] 12.1 Implement `artifacts.py` and the rest of `io.py`
    - Pure dict-to-dataclass conversions for `city.json` (segments, point sets, building footprints and height tags, land-use polygons, reports), `features.json` (raw features, scaled counts, feature distance, shift) and `model.json`
    - `io.py`: JSON read and write with temp-file-then-rename atomic writes; `write_geojson_checked(path, doc, limit_kb)` that measures the temp file, renames on success and returns size in kilobytes, or deletes the temp file and raises an error naming city, file, size and limit; earlier valid files stay untouched
    - _Requirements: 8.2, 8.3, 9.2, 9.5, 9.6_

  - [ ] 12.2 Write property test for intermediate file round trip
    - **Property 27: Intermediate files round-trip**
    - **Validates: Requirements 9.2**

  - [ ] 12.3 Write unit tests for file writes
    - Oversized city file and oversized buildings file are each removed, error names city, file, size and limit, earlier valid file unchanged (temporary directory); failed write leaves existing outputs unchanged
    - _Requirements: 8.3, 9.5, 9.6_

- [ ] 13. Command line and wording check
  - [ ] 13.1 Implement `cli.py` and wire all stages
    - `argparse` sub-commands `summarise`, `features`, `train`, `validate`, `export` with the arguments and defaults from the design; city ids match `[a-z0-9_]{1,50}`; each command runs only its own stage from files on disk
    - Print `warning: ...` lines, then a summary (command, city, records processed, files written, warning count)
    - Exit codes: 0 success; 1 data error; 2 missing or invalid argument or input file, and ground-truth city mismatch (checked before any work, nothing written); 3 validation written with ground truth "not run"; `-h` prints name, purpose and arguments and exits 0
    - `train` writes `model.json` and `train.log`; `export` computes the city's shift against the model's training histograms, scores, and writes the two GeoJSON files
    - _Requirements: 5.2, 7.6, 7.10, 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7_

  - [ ] 13.2 Write CLI end-to-end tests
    - Tiny fixture city runs all five commands; summary and `warning:` lines present; missing argument or file exits 2 and writes nothing; invalid value names argument and value; ground-truth city mismatch exits 2 and leaves an existing `docs/validation.md` unchanged; ground truth "not run" exits 3 with the report written; `--help` exits 0
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7, 7.10_

  - [ ] 13.3 Write wording check test
    - Scan package strings, report templates and docs for the banned words in the product rules and fail if any appear
    - _Requirements: 7.7_

- [ ] 14. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 15. Documentation
  - [ ] 15.1 Write `docs/model.md`
    - One paragraph of no more than 150 words describing the model (logistic regression over 31 features, per-city count scaling, untagged treated as low-weight negatives because untagged means unknown), using the design's description
    - Add a test that counts the words and asserts at most 150
    - _Requirements: 5.11_

  - [ ] 15.2 Update `README.md` with data credits and pipeline notes
    - Add "© OpenStreetMap contributors" and the ODbL licence name for data credits, the disclaimer text from the product rules, how to run the five commands, and the documented default building height (8.0 m)
    - Honest wording: estimates, not safety claims
    - Append only: do not rewrite, reorder or remove any existing README text. The README already has its own tone; add new sections after the existing content and match that tone.
    - _Requirements: 8.4, 8.5_

- [ ] 16. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- All test tasks are required: the tests are the evidence that the requirements hold, and Requirement 10.9 says they must run.
- Each task references specific requirements for traceability.
- Checkpoints ensure incremental validation.
- Property tests validate the 30 universal correctness properties from the design, each as its own sub-task with at least 100 examples.
- Unit tests validate specific examples and edge cases.
- Property 2 is checked after scoring exists (task 6.3) because it spans loader, feature and scoring arguments.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2"] },
    { "id": 2, "tasks": ["1.3"] },
    { "id": 3, "tasks": ["2.1", "3.1", "5.1", "6.1", "7.1"] },
    { "id": 4, "tasks": ["2.2", "2.3", "3.2", "5.2", "6.2", "7.2", "7.3"] },
    { "id": 5, "tasks": ["2.4", "2.5", "2.6", "3.3", "3.4", "5.3", "6.4", "6.5", "6.6", "6.7", "6.8", "6.9", "6.10", "10.1", "11.1"] },
    { "id": 6, "tasks": ["2.7", "5.4", "5.5", "5.6", "6.3", "8.1", "10.2", "11.2", "11.3", "11.4", "11.5"] },
    { "id": 7, "tasks": ["8.2", "8.3", "8.4", "8.5", "8.6", "10.3", "12.1"] },
    { "id": 8, "tasks": ["10.4", "10.5", "10.6", "10.7", "12.2", "12.3"] },
    { "id": 9, "tasks": ["10.8", "10.9", "13.1"] },
    { "id": 10, "tasks": ["13.2", "13.3", "15.1", "15.2"] }
  ]
}
```
