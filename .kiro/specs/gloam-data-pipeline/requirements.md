# Requirements Document

## Introduction

The gloam pipeline is an offline Python tool. It reads OpenStreetMap (OSM) GeoJSON extracts for a city, splits the walkable street network into segments, builds features for each segment from nearby map data, learns which kinds of segments are tagged as lit, and exports a lit probability and a confidence for every segment. The web app loads these exported files. It never runs the pipeline.

Honesty constraints that shape this spec:
- In OSM, `lit=yes` is common but `lit=no` is rare. An untagged segment may be lit or unlit. The pipeline must never treat "untagged" as "unlit".
- Estimates are estimates. Every exported segment says whether it is tagged in OSM or estimated by the model.
- Validation must be reported per city, against a simple baseline, with the label caveat stated.

## Glossary

- **pipeline**: The offline Python tool described in this document, delivered as the `gloam_pipeline` package and its command line.
- **Segment**: one OSM way of a walkable highway type, identified by its OSM id.
- **City pack**: the extract for one city core area (about 2 km radius), for example `kl_core.geojson`. A city can have several input files (London has two).
- **Tagged lit**: a segment whose `lit` tag is `yes`, `24/7`, `automatic` or `dusk-dawn`.
- **Tagged unlit**: a segment whose `lit` tag is `no`.
- **Untagged**: a segment with no `lit` tag. Its true state is unknown.
- **Label source**: the origin of a segment's exported lit probability. It has exactly three values: `tagged_lit` (segment is tagged lit), `tagged_unlit` (segment is tagged unlit) and `estimated` (segment is untagged and the value comes from the model).
- **Lit probability**: the model's estimated probability, from 0 to 1, that a segment is lit.
- **Confidence**: a number from 0 to 1 for how much the estimate can be trusted. It is low where nearby map data is sparse or the city is unlike the training cities.
- **Rule baseline**: the rule "primary, secondary and tertiary roads are lit, everything else is not".
- **Highway-rate baseline**: a baseline that uses, as the lit probability of a segment, the lit rate of its highway type, where the lit rate of a highway type is the number of `tagged_lit` segments divided by the number of `tagged_lit` plus `tagged_unlit` segments of that type, learned from the training cities only.
- **Highway-footway-rate baseline**: a baseline that uses, as the lit probability of a segment, the lit rate of its pair of highway type and footway kind, where the lit rate of a pair is the number of `tagged_lit` segments divided by the number of `tagged_lit` plus `tagged_unlit` segments of that pair, learned from the training cities only. `untagged` segments are never counted. The footway kind takes the same values as the footway kind feature: sidewalk, crossing, other or none.
- **Overall lit rate**: the number of `tagged_lit` segments divided by the number of `tagged_lit` plus `tagged_unlit` segments across all training cities.
- **Baselines**: the rule baseline, the highway-rate baseline and the highway-footway-rate baseline together.
- **Held-out city**: a city left out of training and used only to evaluate the model.
- **Walking path**: a segment whose highway type is pedestrian, footway, path, cycleway or steps.
- **Vehicle road**: a segment whose highway type is any other walkable type listed in Requirement 2.
- **Ground-truth set**: a small hand-labeled list of streets marked lit or dark by people who know them (used for Kuala Lumpur).

## Requirements

### Requirement 1: Load city packs

**User Story:** As a developer, I want to load one or more GeoJSON files for a city, so that every later step works on a single combined city dataset.

#### Acceptance Criteria

1. WHEN given a list of 1 to 50 GeoJSON file paths and a city name of 1 to 100 characters, THE pipeline SHALL load all features from all files into one city dataset.
2. WHEN the same OSM element, identified by OSM element type and OSM id, appears in more than one file or more than once in the same file, THE pipeline SHALL keep exactly one copy of it in the city dataset, using the first occurrence in file-list order.
3. IF a file is missing, unreadable, not valid GeoJSON, or contains no features, THEN THE pipeline SHALL stop before producing any city dataset and report an error that names the file and the problem.
4. IF the list of file paths is empty, exceeds 50 paths, or the city name is empty, longer than 100 characters, or contains only whitespace, THEN THE pipeline SHALL stop before reading any file and report an error that names the invalid argument.
5. WHEN the city dataset has been loaded, THE pipeline SHALL record, for each city, the number of features loaded by type (walkable segments, bus stops, food places, shops, buildings, land-use areas), counted after duplicates are removed.
6. WHEN the city dataset has been loaded, THE pipeline SHALL record the number of features that match none of the six types and the number of duplicate features removed.

### Requirement 2: Build segments

**User Story:** As a developer, I want a clean list of walkable segments, so that scoring and routing work on the same units.

#### Acceptance Criteria

1. WHEN the pipeline builds segments from an OSM extract, THE pipeline SHALL create exactly one segment for each OSM way whose `highway` value is one of: primary, secondary, tertiary, unclassified, residential, living_street, service, pedestrian, footway, path, cycleway, track, steps, primary_link, secondary_link or tertiary_link.
2. THE pipeline SHALL NOT create a segment for any OSM way whose `highway` value is motorway, motorway_link, trunk, trunk_link, missing, or any value not listed in criterion 1.
3. THE pipeline SHALL store for each segment: OSM id, name (empty if no `name` tag), highway type, footway kind (value of the `footway` tag, such as sidewalk or crossing, empty if none), geometry, and length in metres.
4. THE pipeline SHALL compute each segment's length in metres from its geometry as a finite number greater than or equal to 0.
5. IF a way has fewer than 2 distinct nodes or its geometry cannot be resolved, THEN THE pipeline SHALL skip that way, count it in a report of skipped ways, and continue building the remaining segments.
6. WHEN a walkable way is closed (its first and last nodes are the same and it has at least 2 distinct nodes), THE pipeline SHALL use the polygon outline as a line, create a segment from it, and count it in a report of closed ways.
7. THE pipeline SHALL set each segment's label to exactly one of `tagged_lit`, `tagged_unlit` or `untagged`, based only on the `lit` tag: `tagged_lit` when the value is `yes`, `24/7`, `automatic` or `dusk-dawn`; `tagged_unlit` when the value is `no`; and `untagged` when the tag is missing.
8. IF a segment has a `lit` value that is present but is not one of `yes`, `24/7`, `automatic`, `dusk-dawn` or `no`, THEN THE pipeline SHALL label it `untagged` and count its value in a report of unrecognised `lit` values, listing each distinct value with its count.
9. THE pipeline SHALL NOT drop a segment because it is untagged, so that the number of `untagged` plus `tagged_lit` plus `tagged_unlit` segments equals the total number of segments created.

### Requirement 3: Build features

**User Story:** As a developer, I want features that describe each segment's surroundings, so that the model can learn which kinds of places tend to be lit.

#### Acceptance Criteria

1. WHEN the pipeline builds features for a city, THE pipeline SHALL compute for each segment: highway type, footway kind, length in metres, the counts of bus stops, food places, shops and buildings within a configurable distance of the segment, and the land-use class at the segment's midpoint.
2. THE pipeline SHALL accept a configurable feature distance with a default of 100 m, a minimum of 10 m and a maximum of 1,000 m.
3. IF the configured feature distance is NaN, infinite, or outside 10 m to 1,000 m, THEN THE pipeline SHALL stop before computing any features and report an error that names the distance argument and the allowed range.
4. THE pipeline SHALL NOT use the `lit` tag, or any tag derived from it, as a feature.
5. THE pipeline SHALL compute every feature for a city using only that city's own data, with no information from other cities.
6. WHEN the pipeline scales count features, THE pipeline SHALL scale each of the four counts relative to that city's own distribution, so that every scaled value is between 0 and 1 inclusive. Because per-city scaling hides differences between cities, the pipeline compares a city's unscaled feature distribution against the training cities' distribution separately (see Requirement 6, criterion 10).
7. IF a feature cannot be computed for a segment, THEN THE pipeline SHALL set that feature to its documented default value, mark the segment as having missing features, and continue processing the remaining segments.

### Requirement 4: Baseline

**User Story:** As a developer, I want three simple baselines, so that the model has something to beat.

#### Acceptance Criteria

1. THE pipeline SHALL provide a rule baseline that assigns a lit label to every segment whose highway class is exactly one of primary, secondary or tertiary, and a not-lit label to every other segment.
2. THE pipeline SHALL derive each rule baseline label from the segment's highway class alone, without reading any lighting tag, any other feature, or any model output.
3. THE pipeline SHALL provide a highway-rate baseline whose lit rate for each highway type is learned from the training cities only, and SHALL NOT use any segment of the held-out city to learn it.
4. THE pipeline SHALL derive each highway-rate baseline prediction from the segment's highway type alone, without reading any lighting tag of the segment, any other feature, or any model output.
5. IF a highway type has no `tagged_lit` and no `tagged_unlit` segments in the training cities, THEN THE pipeline SHALL use the overall lit rate as the highway-rate baseline prediction for segments of that type, and SHALL record the count of such highway types in the evaluation output.
6. THE pipeline SHALL evaluate the model, the rule baseline, the highway-rate baseline and the highway-footway-rate baseline using the same metrics, the same data splits, and the same held-out cities, on identical segment sets, and SHALL exclude `untagged` segments from AUC and precision as stated in Requirement 7.
7. WHEN the evaluation completes, THE pipeline SHALL write the model metrics, the rule baseline metrics, the highway-rate baseline metrics and the highway-footway-rate baseline metrics side by side in one validation results document, with each metric reported to 3 decimal places.
8. IF the model, the rule baseline, the highway-rate baseline and the highway-footway-rate baseline cannot be evaluated on identical segment sets, THEN THE pipeline SHALL stop with an error indicating which city or split differs, and SHALL NOT write baseline metrics.
9. THE pipeline SHALL provide a highway-footway-rate baseline whose lit rate for each pair of highway type and footway kind is learned from the `tagged_lit` and `tagged_unlit` segments of the training cities only, SHALL NOT count `untagged` segments in any rate, and SHALL NOT use any segment of the held-out city to learn it.
10. THE pipeline SHALL derive each highway-footway-rate baseline prediction from the segment's highway type and footway kind alone, without reading any lighting tag of the segment, any other feature, or any model output.
11. IF a pair of highway type and footway kind has no `tagged_lit` and no `tagged_unlit` segments in the training cities, THEN THE pipeline SHALL use the highway-rate baseline value for the highway type of that pair as the highway-footway-rate baseline prediction.
12. IF a pair of highway type and footway kind has no `tagged_lit` and no `tagged_unlit` segments in the training cities and its highway type also has none, THEN THE pipeline SHALL use the overall lit rate as the highway-footway-rate baseline prediction.
13. WHEN the evaluation completes, THE pipeline SHALL record in the evaluation output the count of distinct pairs of highway type and footway kind that appear in the evaluated (held-out) city and used the highway-type fallback in criterion 11, and the count of such distinct pairs that used the overall lit rate fallback in criterion 12.

### Requirement 5: Train the model

**User Story:** As a developer, I want a model that learns from tagged cities, so that it can estimate lighting where no tags exist.

#### Acceptance Criteria

1. WHEN training is started with a list of 1 to 20 training cities, THE pipeline SHALL train on segments from those cities, using `tagged_lit` as the positive class, `untagged` as the unlabeled class and `tagged_unlit` segments as confirmed negatives where they exist, with the weights set in criterion 4.
2. IF the training set contains zero `tagged_lit` segments, THEN THE pipeline SHALL stop without writing a model, report an error naming the cities checked and the count of `tagged_lit` segments found, and leave any previously saved model unchanged.
3. THE pipeline SHALL treat `untagged` as "unknown, probably lit less often", not as "unlit", and SHALL write a statement of this to the training log on every training run.
4. THE pipeline SHALL train with a positive-unlabeled approach in which `tagged_lit` segments have weight 1 as positives, `tagged_unlit` segments have weight 1 as confirmed negatives, and `untagged` segments have a configurable untagged weight strictly between 0 and 1 (default 0.2) instead of full weight as negatives.
5. IF the configured untagged weight is NaN, infinite, or not strictly between 0 and 1, THEN THE pipeline SHALL stop before training and report an error that names the untagged weight argument and the rejected value.
6. THE pipeline SHALL write the weights used for `tagged_lit`, `tagged_unlit` and `untagged` segments to the training log on every training run, and SHALL NOT train with `untagged` segments as ordinary full-weight negatives.
7. WHEN training is run twice with identical inputs, identical configuration and the same random seed, THE pipeline SHALL produce lit-probability outputs identical to at least 6 decimal places for every segment.
8. WHEN a held-out city is named, THE pipeline SHALL exclude every segment of that city from training and SHALL be able to name any one training city as the held-out city (hold-one-city-out).
9. IF the named held-out city is not among the available cities, or leaving it out leaves zero training cities, THEN THE pipeline SHALL stop without training and report an error naming the invalid city.
10. WHEN training completes, THE pipeline SHALL report a feature importance value for every input feature, ranked from highest to lowest, in the training log.
11. THE pipeline SHALL use a model type that can be described in one paragraph of no more than 150 words in `docs/`, such as a regularised linear model or a tree ensemble of at most 200 trees with a maximum depth of 6.

### Requirement 6: Estimate lit probability and confidence

**User Story:** As a developer, I want a lit probability and a confidence for every segment, so that the app can show how sure it is.

#### Acceptance Criteria

1. THE pipeline SHALL output, for every segment in a city pack, a lit probability and a confidence, each a finite number between 0 and 1 inclusive.
2. IF a segment is `tagged_lit`, THEN THE pipeline SHALL output a `label_source` of `tagged_lit` and a lit probability at or above the configured high value (default 0.9, allowed range 0.5 to 1 inclusive), and SHALL NOT overwrite the tag with a model estimate.
3. IF a segment is `tagged_unlit`, THEN THE pipeline SHALL output a `label_source` of `tagged_unlit` and a lit probability at or below the configured low value (default 0.1, allowed range 0 to 0.5 inclusive).
4. THE pipeline SHALL give every `tagged_lit` and `tagged_unlit` segment a fixed confidence equal to the configured tagged confidence (default 0.95, allowed range 0.5 to 1 inclusive), independent of the counts of nearby bus stops, food places, shops and buildings.
5. IF a segment is `untagged`, THEN THE pipeline SHALL output a `label_source` of `estimated` and a lit probability produced by the model from the segment's features.
6. IF the configured high value is less than or equal to the configured low value, or any of the high value, the low value or the tagged confidence lies outside its allowed range, THEN THE pipeline SHALL stop before scoring any segment and report an error naming the invalid configuration value.
7. THE pipeline SHALL give every `estimated` segment a confidence strictly lower than the configured tagged confidence.
8. WHEN the pipeline scores two estimated segments that differ only in one of bus-stop count, food-place count or shop count, THE pipeline SHALL give the segment with the lower count a confidence less than or equal to that of the segment with the higher count.
9. IF an estimated segment has one or more missing features, THEN THE pipeline SHALL give it a confidence strictly lower than that of an otherwise identical estimated segment with no missing features.
10. WHEN a city's feature distribution differs from the training cities' feature distribution, THE pipeline SHALL reduce the confidence of that city's estimated segments, with a larger difference giving a lower or equal confidence, and SHALL record the measured difference in the training or export summary. The difference measure and its thresholds are defined in the design.
11. WHEN the pipeline scores segments with identical feature values and identical `label_source`, THE pipeline SHALL output the same lit probability and the same confidence for each, across repeated runs with the same configuration and model.
12. IF a segment's computed lit probability or confidence is NaN, infinite, or outside 0 to 1, THEN THE pipeline SHALL stop and report an error naming the segment and the offending value, and SHALL NOT write that city pack's output.

### Requirement 7: Validate

**User Story:** As a developer, I want honest accuracy numbers, so that the write-up and the app make no claim that the data cannot support.

#### Acceptance Criteria

1. FOR EACH city with at least a configured number of `tagged_unlit` segments (default 200; the Berlin and London extracts qualify), THE pipeline SHALL hold the city out of training, hide its `lit` tags, estimate lit probability for every segment in that city, and report both AUC (0.0 to 1.0) and precision at a cutoff of 0.5 lit probability, for the model, the rule baseline, the highway-rate baseline and the highway-footway-rate baseline (precision is "undefined" when a method predicts no lit segments, see criterion 11).
2. THE pipeline SHALL compute the AUC and precision metrics in criterion 1 using `tagged_lit` segments as positives and `tagged_unlit` segments as the only negatives, and SHALL exclude `untagged` segments from both metrics, because counting `untagged` as negative would reward copying mapping habits.
3. THE pipeline SHALL report every metric in criteria 1 and 6 separately for walking paths and for vehicle roads, and SHALL NOT report a single combined figure in place of the separate figures.
4. THE pipeline SHALL compute the AUC and precision metrics in criterion 1 for a road type (walking paths or vehicle roads) in a held-out city only WHEN that city has at least the configured minimum number of `tagged_unlit` segments of that road type (default 100).
5. IF a held-out city has fewer than the configured minimum number of `tagged_unlit` segments for a road type, THEN THE pipeline SHALL skip the metrics for that road type and SHALL list it in `docs/validation.md` as skipped, with the `tagged_unlit` segment count and the threshold.
6. WHEN a hand-labeled ground-truth CSV is provided for a city (Kuala Lumpur), THE pipeline SHALL report accuracy on the labeled segments for the model, the rule baseline, the highway-rate baseline and the highway-footway-rate baseline, excluding every row marked `unsure` and stating the number of rows excluded.
7. THE pipeline SHALL write all results to `docs/validation.md`, including the number of segments per class (`tagged_lit`, `tagged_unlit`, `untagged`) for each city, a statement that the AUC and precision metrics are computed on tagged segments only, and the caveat that untagged segments are unknown rather than unlit.
8. IF a city has fewer than the configured number of `tagged_unlit` segments, THEN THE pipeline SHALL skip hold-out validation for that city and SHALL list the city in `docs/validation.md` as skipped, with the segment count and the threshold.
9. IF the model's AUC is not higher than the AUC of the rule baseline, not higher than the AUC of the highway-rate baseline, or not higher than the AUC of the highway-footway-rate baseline, on a held-out city, THEN THE pipeline SHALL state in `docs/validation.md`, separately for each such baseline, that the model did not beat that baseline for that city, and SHALL include the figures for the model and that baseline.
10. IF the ground-truth CSV is missing, unreadable, or contains no rows other than `unsure`, THEN THE pipeline SHALL report an error indicating which condition occurred, SHALL still write the other results to `docs/validation.md`, and SHALL mark the ground-truth section as not run.
11. WHEN the model, the rule baseline, the highway-rate baseline or the highway-footway-rate baseline predicts no lit segments at the 0.5 cutoff for a city and road type, THE pipeline SHALL report its precision as "undefined" in `docs/validation.md`, and SHALL NOT treat this case as an error and SHALL NOT report the precision as 0.

### Requirement 8: Export

**User Story:** As an app developer, I want a small exported file per city, so that the web app can load scores without running the pipeline.

#### Acceptance Criteria

1. WHEN the export stage runs for a city pack, THE pipeline SHALL write exactly one GeoJSON file containing, for each segment: segment id, name (empty when OSM has no name), highway type, geometry, lit probability (0 to 1 inclusive), confidence (0 to 1 inclusive), and label source (`tagged_lit`, `tagged_unlit` or `estimated`).
2. WHEN the export stage writes a city file, THE pipeline SHALL round coordinates to 6 decimal places and lit probability and confidence to 3 decimal places, and SHALL report the file size in kilobytes.
3. IF a written city file or buildings file exceeds its configured size limit (default 8 MB for each file, configurable separately; the limit applies to the uncompressed file), THEN THE pipeline SHALL stop with an error that names the city, the file, the actual size and the limit, SHALL NOT leave the oversized file in the output location, and SHALL leave any earlier valid file unchanged.
4. WHEN the export stage runs for a city pack, THE pipeline SHALL write a separate buildings file containing, for each building, its footprint geometry and a height in metres, using the tagged height where OSM provides a positive finite value and otherwise a default height documented in the pipeline documentation.
5. THE pipeline SHALL include the text "© OpenStreetMap contributors" and the licence name in the metadata of every exported file, including the city file and the buildings file.
6. IF an exported value is NaN, infinite, or outside its allowed range, THEN THE pipeline SHALL stop with an error that names the segment id and the field, and SHALL NOT write a partial output file.
7. THE pipeline SHALL NOT include user, device or location-trail data in its inputs or outputs.

### Requirement 9: Command line and logging

**User Story:** As a developer, I want simple commands, so that I can rerun any stage.

#### Acceptance Criteria

1. THE pipeline SHALL provide five separately invocable commands: load-and-summarise a city, build features, train, validate, and export.
2. WHEN a command is invoked with a city identifier and all required inputs present, THE pipeline SHALL run only that stage, using the outputs of earlier stages already on disk, and SHALL exit with status 0 on success.
3. WHEN a command finishes successfully, THE pipeline SHALL print a summary containing the command name, the city identifier, the count of records processed, the path of each file written, and the count of warnings raised.
4. WHEN a command raises a warning, THE pipeline SHALL print each warning on its own line, prefixed with the word "warning", before the final summary.
5. IF a required argument is missing or a required input file does not exist, THEN THE pipeline SHALL print an error message that names the missing argument or file, write nothing to the output files, and exit with a non-zero status. The one exception to "write nothing" is exit status 3: when the validate command finishes and writes `docs/validation.md` with the ground-truth section marked not run (Requirement 7, criterion 10), it prints the error and exits with status 3.
6. IF an argument value is invalid (for example an unknown city identifier or a NaN, infinite or out-of-range number), THEN THE pipeline SHALL print an error message that names the argument and the rejected value, leave existing output files unchanged, and exit with a non-zero status.
7. WHEN a command is invoked with a help option, THE pipeline SHALL print the command's name, purpose and arguments, and exit with status 0.

### Requirement 10: Correctness properties (for property-based testing)

**User Story:** As a developer, I want key rules checked on many generated inputs, so that bugs outside my examples are found.

#### Acceptance Criteria

1. FOR ALL generated segments and valid feature values, THE pipeline SHALL produce a lit probability and a confidence that are each finite and between 0 and 1 inclusive.
2. FOR ALL generated lists of segments, THE feature builder SHALL produce identical feature values for each segment id when the same input list is supplied in any permutation order.
3. FOR ALL generated segments with a `lit` tag, WHEN the `lit` tag value is changed or removed, THE feature builder SHALL produce identical feature values for that segment.
4. FOR ALL generated segments, THE exported `label_source` SHALL match the tag: `tagged_lit` for `tagged_lit` segments, `tagged_unlit` for `tagged_unlit` segments, and `estimated` for `untagged` segments.
5. FOR ALL generated cities with 0 to 1,000 segments, WHEN the city is exported and then reloaded, THE reloaded data SHALL contain exactly the same set of segment ids, with each lit probability and each confidence differing from the original by no more than 0.001.
6. FOR ALL generated pairs of segments identical except that one has a higher count of nearby bus stops, food places or shops, THE confidence of the segment with the higher count SHALL be greater than or equal to the confidence of the other.
7. FOR ALL generated pairs of estimated segments identical except that the feature distribution difference of one city is larger, THE confidence under the larger difference SHALL be less than or equal to the confidence under the smaller difference.
8. IF a scoring input is NaN, infinite or outside its documented valid range, THEN THE pipeline SHALL reject the input with an error that names the offending argument, and SHALL produce no score for that input.
9. WHEN a property test fails, THE test suite SHALL report the minimal failing generated example and SHALL run at least 100 generated examples per property when all pass.
