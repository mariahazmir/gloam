"""Hold-one-out validation and ground-truth accuracy (pure, no file I/O).

Callers pass in rows and (for ground truth) the CSV text; this module reads no files.
Validation scores use the raw model output, not `score_segment`, because that would
copy the tags back in. `untagged` rows are unknown, not unlit, so metrics drop them.
"""

import csv
import io
from collections.abc import Mapping, Sequence
from dataclasses import dataclass, field

from .baselines import (
    HighwayRates,
    PairRates,
    highway_footway_rate_baseline,
    highway_rate_baseline,
    learn_highway_rates,
    learn_pair_rates,
    pair_fallback_counts,
    rule_baseline,
)
from .checks import check_range
from .errors import GloamError, InputFileError, InvalidArgumentError
from .metrics import auc, precision_at, road_type, tagged_only
from .model import LABELS, TrainingRow, fit, predict

METHODS = ("model", "rule", "highway_rate", "highway_footway_rate")
BASELINES = ("rule", "highway_rate", "highway_footway_rate")
ROAD_TYPES = ("walking_path", "vehicle_road")
CUTOFF = 0.5
GT_LABELS = ("lit", "dark", "unsure")

# (segment_id, highway, label, score)
ScoredRow = tuple[int, str, str, float]


class ValidationError(GloamError):
    """The methods could not be compared on identical segment sets (R4.8)."""


@dataclass(frozen=True)
class CityMetrics:
    """Metrics for one city and road type; `skipped` is set when below the minimum."""

    city: str
    road_type: str
    counts: Mapping[str, int]  # tagged_lit, tagged_unlit, untagged for this road type
    threshold: int  # min_unlit_road_type
    skipped: str | None
    auc: Mapping[str, float | None]  # keys: the METHODS
    precision: Mapping[str, float | None]


@dataclass(frozen=True)
class SkippedCity:
    city: str
    tagged_unlit: int
    threshold: int


@dataclass(frozen=True)
class DidNotBeat:
    """The model AUC is not higher than this baseline's AUC (R7.9)."""

    city: str
    road_type: str
    baseline: str
    model_auc: float
    baseline_auc: float


@dataclass(frozen=True)
class ValidationResult:
    class_counts: Mapping[str, Mapping[str, int]]  # every city, all three classes
    skipped_cities: Sequence[SkippedCity]
    metrics: Sequence[CityMetrics]
    did_not_beat: Sequence[DidNotBeat]
    unseen_highway_types: Mapping[str, int]  # per validated city (R4.5)
    # Per validated city: pairs using the type rate / the overall rate (R4.13).
    type_fallback_pairs: Mapping[str, int] = field(default_factory=dict)
    overall_fallback_pairs: Mapping[str, int] = field(default_factory=dict)


@dataclass(frozen=True)
class GroundTruthResult:
    status: str  # "run" or "not run"
    reason: str | None
    excluded_unsure: int
    unmatched: int
    scored: int
    accuracy: Mapping[str, float | None]  # None when no matched rows


# ---------------------------------------------------------------- scoring


def rates_from_model(model: Mapping) -> HighwayRates:
    """Rebuild the highway-rate baseline stored in a saved model dict."""
    return HighwayRates(
        rates=dict(model["highway_rates"]),
        overall_lit_rate=float(model["overall_lit_rate"]),
        unseen_highway_types=int(model["unseen_highway_types"]),
    )


def pair_rates_from_model(model: Mapping) -> PairRates:
    """Rebuild the highway-footway-rate baseline stored in a saved model dict."""
    rates = rates_from_model(model)
    return PairRates(
        rates={
            (highway, kind): float(rate)
            for highway, kinds in model["pair_rates"].items()
            for kind, rate in kinds.items()
        },
        highway_rates=rates,
        overall_lit_rate=rates.overall_lit_rate,
    )


def score_methods(
    model: Mapping, rates: HighwayRates, pairs: PairRates, rows: Sequence[TrainingRow]
) -> dict[str, list[ScoredRow]]:
    """Raw model and the three baselines' scores for the same rows, in row order."""
    model_scores = predict(model, [r.vector for r in rows])
    per_method = {
        "model": model_scores,
        "rule": [rule_baseline(r.highway) for r in rows],
        "highway_rate": [highway_rate_baseline(rates, r.highway) for r in rows],
        "highway_footway_rate": [
            highway_footway_rate_baseline(pairs, r.highway, r.footway_kind) for r in rows
        ],
    }
    return {
        m: [(r.segment_id, r.highway, r.label, s) for r, s in zip(rows, scores)]
        for m, scores in per_method.items()
    }


def check_identical_segment_sets(
    city: str, split: str, by_method: Mapping[str, Sequence[ScoredRow]]
) -> None:
    """Raise ValidationError naming the city and split if segment ids differ (R4.6, R4.8)."""
    ids = {m: sorted(row[0] for row in rows) for m, rows in by_method.items()}
    # Reference: the id set shared by most methods; ties go to the earliest method in by_method.
    sets = list(ids.values())
    reference = max(sets, key=lambda v: (sets.count(v), -sets.index(v)), default=[])
    differing = [m for m, v in ids.items() if v != reference]
    if differing:
        raise ValidationError(
            f"city '{city}' split '{split}': segment sets differ for "
            + ", ".join(differing)
            + "; no baseline metrics written"
        )


# ---------------------------------------------------------------- hold-one-out


def _class_counts(labels: Sequence[str]) -> dict[str, int]:
    return {label: sum(1 for x in labels if x == label) for label in LABELS}


def _min_count(name: str, value: int) -> int:
    if isinstance(value, bool) or not isinstance(value, int) or value < 1:
        raise InvalidArgumentError(name, value, "an integer of at least 1")
    return value


def _road_type_metrics(
    city: str, rtype: str, by_method: Mapping[str, Sequence[ScoredRow]], min_unlit_road_type: int
) -> CityMetrics:
    rows = by_method["model"]
    counts = _class_counts([r[2] for r in rows])
    n_unlit = counts["tagged_unlit"]
    if n_unlit < min_unlit_road_type:
        return CityMetrics(
            city, rtype, counts, min_unlit_road_type,
            f"{n_unlit} tagged_unlit segments, threshold {min_unlit_road_type}",
            {m: None for m in METHODS}, {m: None for m in METHODS},
        )
    aucs: dict[str, float | None] = {}
    precs: dict[str, float | None] = {}
    for m in METHODS:
        scores, positive = tagged_only([r[3] for r in by_method[m]], [r[2] for r in by_method[m]])
        aucs[m] = auc(scores, positive)
        precs[m] = precision_at(scores, positive, CUTOFF)
    return CityMetrics(city, rtype, counts, min_unlit_road_type, None, aucs, precs)


def did_not_beat(metrics: CityMetrics) -> list[DidNotBeat]:
    """One entry per baseline whose AUC the model does not exceed (both AUCs defined)."""
    out = []
    model_auc = metrics.auc.get("model")
    if model_auc is None:
        return out
    for b in BASELINES:
        base_auc = metrics.auc.get(b)
        if base_auc is not None and not model_auc > base_auc:
            out.append(DidNotBeat(metrics.city, metrics.road_type, b, model_auc, base_auc))
    return out


def hold_one_out(
    rows_by_city: Mapping[str, Sequence[TrainingRow]],
    histograms_by_city: Mapping[str, Mapping[str, Sequence[int]]],
    feature_names: Sequence[str],
    min_unlit_city: int = 200,
    min_unlit_road_type: int = 100,
    untagged_weight: float = 0.2,
    seed: int = 0,
) -> ValidationResult:
    """Hold each qualifying city out, train on the others, compare the model and three baselines."""
    _min_count("min_unlit_city", min_unlit_city)
    _min_count("min_unlit_road_type", min_unlit_road_type)
    cities = sorted(rows_by_city)
    all_rows = [r for c in cities for r in rows_by_city[c]]
    class_counts = {c: _class_counts([r.label for r in rows_by_city[c]]) for c in cities}

    skipped: list[SkippedCity] = []
    metrics: list[CityMetrics] = []
    beaten: list[DidNotBeat] = []
    unseen: dict[str, int] = {}
    type_fb: dict[str, int] = {}
    overall_fb: dict[str, int] = {}
    for city in cities:
        n_unlit = class_counts[city]["tagged_unlit"]
        if n_unlit < min_unlit_city:
            skipped.append(SkippedCity(city, n_unlit, min_unlit_city))
            continue
        # fit drops every row of the held-out city, so training uses other cities only.
        model, _log = fit(
            all_rows, feature_names, histograms_by_city, untagged_weight, seed, held_out_city=city
        )
        train_rows = [r for r in all_rows if r.city_id != city]
        rates = learn_highway_rates([(r.highway, r.label) for r in train_rows])
        pairs = learn_pair_rates([(r.highway, r.footway_kind, r.label) for r in train_rows])
        unseen[city] = rates.unseen_highway_types
        type_fb[city], overall_fb[city] = pair_fallback_counts(
            pairs, [(r.highway, r.footway_kind) for r in rows_by_city[city]]
        )
        scored = score_methods(model, rates, pairs, list(rows_by_city[city]))
        check_identical_segment_sets(city, "all", scored)
        city_metrics = []
        for rtype in ROAD_TYPES:
            split = {m: [r for r in rows if road_type(r[1]) == rtype] for m, rows in scored.items()}
            check_identical_segment_sets(city, rtype, split)
            city_metrics.append(_road_type_metrics(city, rtype, split, min_unlit_road_type))
        # Only reached when every check passed, so no baseline metrics exist on a mismatch.
        metrics.extend(city_metrics)
        for cm in city_metrics:
            beaten.extend(did_not_beat(cm))
    return ValidationResult(class_counts, skipped, metrics, beaten, unseen, type_fb, overall_fb)


# ---------------------------------------------------------------- ground truth


def check_ground_truth_city(gt_city: str, held_out_city: str | None) -> None:
    """Pass only when held_out_city is non-null and equals gt_city (R7.6)."""
    if not isinstance(gt_city, str) or not gt_city:
        raise InvalidArgumentError("--ground-truth-city", gt_city, "a non-empty city id")
    if held_out_city is None or held_out_city != gt_city:
        raise InvalidArgumentError(
            "--ground-truth-city",
            gt_city,
            f"a city equal to model.json held_out_city, which is {held_out_city!r}; "
            f"train with --held-out {gt_city}",
        )


def parse_ground_truth(text: str, source: str = "ground-truth CSV") -> list[tuple[int, str]]:
    """Parse `osm_id,label` rows; label is lit, dark or unsure. Raises InputFileError."""
    reader = csv.reader(io.StringIO(text))
    header = next(reader, None)
    if header is None or [h.strip() for h in header] != ["osm_id", "label"]:
        raise InputFileError(source, "header must be 'osm_id,label'")
    rows: list[tuple[int, str]] = []
    for line_no, rec in enumerate(reader, start=2):
        if not rec or all(not c.strip() for c in rec):
            continue
        if len(rec) != 2:
            raise InputFileError(source, f"line {line_no}: expected 2 columns")
        raw_id, label = rec[0].strip(), rec[1].strip()
        try:
            osm_id = int(raw_id)
        except ValueError:
            raise InputFileError(source, f"line {line_no}: osm_id '{raw_id}' is not an integer") from None
        if label not in GT_LABELS:
            raise InputFileError(source, f"line {line_no}: label '{label}' is not lit, dark or unsure")
        rows.append((osm_id, label))
    return rows


def ground_truth_not_run(reason: str) -> GroundTruthResult:
    return GroundTruthResult("not run", reason, 0, 0, 0, {m: None for m in METHODS})


def ground_truth_accuracy(
    rows: Sequence[tuple[int, str]], scores_by_method: Mapping[str, Mapping[int, float]]
) -> GroundTruthResult:
    """Accuracy per method over non-`unsure` rows; counts excluded and unmatched rows."""
    for m in METHODS:
        if m not in scores_by_method:
            raise InvalidArgumentError("scores_by_method", f"missing {m}", ", ".join(METHODS))
        for s in scores_by_method[m].values():
            check_range("scores", s, 0.0, 1.0)
    excluded = sum(1 for _, label in rows if label == "unsure")
    kept = [(i, label) for i, label in rows if label != "unsure"]
    if not kept:
        return GroundTruthResult(
            "not run", "the file has no rows other than unsure", excluded, 0, 0,
            {m: None for m in METHODS},
        )
    ids = scores_by_method["model"].keys()
    matched = [(i, label) for i, label in kept if i in ids]
    unmatched = len(kept) - len(matched)
    accuracy: dict[str, float | None] = {}
    for m in METHODS:
        if not matched:
            accuracy[m] = None
            continue
        hits = sum(
            1 for i, label in matched if (scores_by_method[m][i] >= CUTOFF) == (label == "lit")
        )
        accuracy[m] = hits / len(matched)
    return GroundTruthResult("run", None, excluded, unmatched, len(matched), accuracy)


def evaluate_ground_truth(
    text: str | None,
    scores_by_method: Mapping[str, Mapping[int, float]],
    problem: str = "missing",
) -> GroundTruthResult:
    """Ground truth from CSV text. `text` is None when the file was missing or unreadable.

    `problem` is "missing" or "unreadable" and sets the "not run" reason when text is None.
    """
    if text is None:
        if problem not in ("missing", "unreadable"):
            raise InvalidArgumentError("problem", problem, "missing or unreadable")
        return ground_truth_not_run(f"the ground-truth file is {problem}")
    try:
        rows = parse_ground_truth(text)
    except InputFileError as e:
        return ground_truth_not_run(f"the ground-truth file is unreadable: {e.problem}")
    return ground_truth_accuracy(rows, scores_by_method)


def scores_by_id(scored: Mapping[str, Sequence[ScoredRow]]) -> dict[str, dict[int, float]]:
    """Convert score_methods output to {method: {segment_id: score}} for ground truth."""
    return {m: {row[0]: row[3] for row in rows} for m, rows in scored.items()}
