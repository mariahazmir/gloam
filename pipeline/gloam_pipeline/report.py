"""Render docs/validation.md text (pure, no I/O).

Wording stays honest: results are estimates, untagged means unknown rather than unlit,
and nothing here claims a street or route is safe.
"""

from collections.abc import Mapping, Sequence

from .model import LABELS
from .validation import GroundTruthResult, ValidationResult

METHOD_COLUMNS = (("model", "Model"), ("rule", "Rule baseline"), ("highway_rate", "Highway-rate baseline"),
    ("highway_footway_rate", "Highway-footway-rate baseline"),
)
BASELINE_NAMES = {
    "rule": "rule baseline",
    "highway_rate": "highway-rate baseline",
    "highway_footway_rate": "highway-footway-rate baseline",
}
ROAD_TYPE_NAMES = {"walking_path": "walking paths", "vehicle_road": "vehicle roads"}

TAGGED_ONLY_NOTE = (
    "AUC and precision are computed on tagged segments only: `tagged_lit` segments are "
    "the positives and `tagged_unlit` segments are the only negatives. `untagged` "
    "segments are left out of both metrics."
)
UNTAGGED_CAVEAT = (
    "Untagged segments are unknown, not unlit. A missing `lit` tag says nothing about "
    "whether a street is lit."
)
LOW_BIAS_NOTE = (
    "Fitted probabilities are biased low, because untagged segments that are in fact lit "
    "still pull the model toward 0. No prior correction is applied. The output is a "
    "relative likelihood that is useful for ranking, so AUC is the main figure. "
    "Precision at the 0.5 cutoff is \"undefined\" when nothing crosses the cutoff."
)


def fmt(value: float | None) -> str:
    """Three decimal places, or "undefined" when the value is None."""
    return "undefined" if value is None else f"{value:.3f}"


def _table(header: Sequence[str], rows: Sequence[Sequence[str]]) -> list[str]:
    lines = ["| " + " | ".join(header) + " |", "|" + "|".join("---" for _ in header) + "|"]
    lines.extend("| " + " | ".join(r) + " |" for r in rows)
    return lines


def _counts_section(data: ValidationResult) -> list[str]:
    rows = [
        [city, *(str(data.class_counts[city].get(label, 0)) for label in LABELS)]
        for city in sorted(data.class_counts)
    ]
    return ["## Segments per class", "", *_table(["City", *LABELS], rows), ""]


def _skipped_section(data: ValidationResult) -> list[str]:
    lines = ["## Skipped", ""]
    skipped_road_types = [m for m in data.metrics if m.skipped is not None]
    if not data.skipped_cities and not skipped_road_types:
        return [*lines, "No cities or road types were skipped.", ""]
    for c in data.skipped_cities:
        lines.append(
            f"- City {c.city}: hold-out validation skipped, {c.tagged_unlit} `tagged_unlit` "
            f"segments, threshold {c.threshold}."
        )
    for m in skipped_road_types:
        lines.append(
            f"- City {m.city}, {ROAD_TYPE_NAMES.get(m.road_type, m.road_type)}: metrics skipped, "
            f"{m.counts.get('tagged_unlit', 0)} `tagged_unlit` segments, threshold {m.threshold}."
        )
    return [*lines, ""]


def _metrics_section(data: ValidationResult) -> list[str]:
    lines = ["## Hold-one-out metrics", "", TAGGED_ONLY_NOTE, "", UNTAGGED_CAVEAT, "", LOW_BIAS_NOTE, ""]
    done = [m for m in data.metrics if m.skipped is None]
    if not done:
        return [*lines, "No city and road type had enough tagged segments for metrics.", ""]
    for m in sorted(done, key=lambda x: (x.city, x.road_type)):
        name = ROAD_TYPE_NAMES.get(m.road_type, m.road_type)
        lines += [f"### {m.city}: {name}", ""]
        lines += _table(
            ["Metric", *(label for _, label in METHOD_COLUMNS)],
            [
                ["AUC", *(fmt(m.auc.get(k)) for k, _ in METHOD_COLUMNS)],
                ["Precision at 0.5", *(fmt(m.precision.get(k)) for k, _ in METHOD_COLUMNS)],
            ],
        )
        lines.append("")
    return lines


def _did_not_beat_section(data: ValidationResult) -> list[str]:
    lines = ["## Baseline comparison", ""]
    if not data.did_not_beat:
        return [*lines, "The model's AUC was higher than every baseline wherever both AUCs were defined.", ""]
    for d in data.did_not_beat:
        base = BASELINE_NAMES.get(d.baseline, d.baseline)
        lines.append(
            f"- The model did not beat the {base} for {d.city}, "
            f"{ROAD_TYPE_NAMES.get(d.road_type, d.road_type)}: "
            f"model AUC {fmt(d.model_auc)}, {base} AUC {fmt(d.baseline_auc)}."
        )
    undefined = [
        m for m in data.metrics
        if m.skipped is None and any(m.auc.get(k) is None for k, _ in METHOD_COLUMNS)
    ]
    for m in undefined:
        lines.append(
            f"- No comparison was made for {m.city}, {ROAD_TYPE_NAMES.get(m.road_type, m.road_type)} "
            "where an AUC is undefined."
        )
    return [*lines, ""]


def _unseen_section(
    unseen: Mapping[str, int],
    type_fallback: Mapping[str, int] | None = None,
    overall_fallback: Mapping[str, int] | None = None,
) -> list[str]:
    type_fallback = type_fallback or {}
    overall_fallback = overall_fallback or {}
    lines: list[str] = []
    if unseen:
        lines += ["## Highway types not seen in training", ""]
        lines += [f"- {city}: {unseen[city]}" for city in sorted(unseen)]
        lines.append("")
    cities = sorted(set(type_fallback) | set(overall_fallback))
    if cities:
        lines += [
            "## Pairs with no tagged training data",
            "",
            "Pairs of highway type and footway kind with no tagged training data, per city:",
            "",
        ]
        lines += [
            f"- {c}: {type_fallback.get(c, 0)} used the highway-type rate, "
            f"{overall_fallback.get(c, 0)} used the overall lit rate"
            for c in cities
        ]
        lines.append("")
    return lines


def _ground_truth_section(gt: GroundTruthResult | None) -> list[str]:
    lines = ["## Ground truth", ""]
    if gt is None:
        return [*lines, "Not run: no ground-truth file was provided.", ""]
    if gt.status != "run":
        return [*lines, f"Not run: {gt.reason}.", f"Rows marked unsure and excluded: {gt.excluded_unsure}.", ""]
    lines += [
        f"Rows marked unsure and excluded: {gt.excluded_unsure}.",
        f"Rows whose id is not a segment of the city: {gt.unmatched}.",
        f"Rows scored: {gt.scored}.",
        "",
        *_table(
            ["Metric", *(label for _, label in METHOD_COLUMNS)],
            [["Accuracy", *(fmt(gt.accuracy.get(k)) for k, _ in METHOD_COLUMNS)]],
        ),
        "",
    ]
    return lines


def render_validation(data: ValidationResult, ground_truth: GroundTruthResult | None = None) -> str:
    """Markdown for docs/validation.md. `ground_truth` None renders the "not run" section."""
    lines = [
        "# Validation",
        "",
        "Results are estimates from map data. They describe which streets are likely well lit "
        "or likely dark, and they can be wrong.",
        "",
        *_counts_section(data),
        *_skipped_section(data),
        *_metrics_section(data),
        *_did_not_beat_section(data),
        *_unseen_section(data.unseen_highway_types, data.type_fallback_pairs, data.overall_fallback_pairs),
        *_ground_truth_section(ground_truth),
    ]
    return "\n".join(lines).rstrip() + "\n"
