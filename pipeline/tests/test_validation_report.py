"""Unit tests for validation, metrics, baselines and the report (R4.6, R4.7, R4.8, R7.7, R7.10)."""

import pytest

from gloam_pipeline.baselines import highway_rate_baseline, learn_highway_rates
from gloam_pipeline.errors import InvalidArgumentError
from gloam_pipeline.metrics import auc
from gloam_pipeline.report import fmt, render_validation
from gloam_pipeline.validation import (
    CityMetrics,
    ValidationError,
    ValidationResult,
    check_ground_truth_city,
    check_identical_segment_sets,
    evaluate_ground_truth,
    ground_truth_accuracy,
    parse_ground_truth,
)

BANNED = ("safe route", "safest", "guaranteed", "secure", "dangerous area", "bad neighborhood")


def test_auc_hand_example():
    # Pairs (pos, neg): 0.9>0.6, 0.9>0.2, 0.6=0.6 (half), 0.6>0.2 -> 3.5 / 4 = 0.875.
    assert auc([0.9, 0.6, 0.6, 0.2], [True, True, False, False]) == 0.875


def test_highway_rates_hand_example():
    # residential: 30 lit / 10 unlit -> 30/40 = 0.75.
    # primary: 40 lit / 20 unlit. Totals 70 lit / 30 unlit -> overall 70/100 = 0.7.
    training = (
        [("residential", "tagged_lit")] * 30
        + [("residential", "tagged_unlit")] * 10
        + [("primary", "tagged_lit")] * 40
        + [("primary", "tagged_unlit")] * 20
        + [("footway", "untagged")] * 5  # untagged never counts
    )
    rates = learn_highway_rates(training)
    assert highway_rate_baseline(rates, "residential") == pytest.approx(0.75)
    assert rates.overall_lit_rate == pytest.approx(0.7)
    assert highway_rate_baseline(rates, "footway") == pytest.approx(0.7)  # unseen -> overall


def test_mismatched_segment_sets_name_city_and_split():
    by_method = {
        "model": [(1, "residential", "tagged_lit", 0.5), (2, "residential", "tagged_unlit", 0.4)],
        "rule": [(1, "residential", "tagged_lit", 0.0)],
        "highway_rate": [(1, "residential", "tagged_lit", 0.7), (2, "residential", "tagged_unlit", 0.7)],
    }
    with pytest.raises(ValidationError) as exc:
        check_identical_segment_sets("kuala_lumpur", "walking_path", by_method)
    msg = str(exc.value)
    assert "kuala_lumpur" in msg and "walking_path" in msg


def test_mismatch_names_only_model_when_model_is_odd_one_out():
    same = [(1, "residential", "tagged_lit", 0.5), (2, "residential", "tagged_unlit", 0.4)]
    by_method = {
        "model": same[:1],
        "rule": same,
        "highway_rate": same,
        "highway_footway_rate": same,
    }
    with pytest.raises(ValidationError) as exc:
        check_identical_segment_sets("london", "vehicle_road", by_method)
    msg = str(exc.value)
    assert "london" in msg and "vehicle_road" in msg
    named = msg.split("differ for ", 1)[1].split(";", 1)[0].split(", ")
    assert named == ["model"]


def test_identical_segment_sets_pass():
    rows = [(1, "residential", "tagged_lit", 0.5), (2, "residential", "tagged_unlit", 0.4)]
    check_identical_segment_sets("london", "all", {"model": rows, "rule": rows[::-1], "highway_rate": rows})


def _result() -> ValidationResult:
    metrics = CityMetrics(
        "london", "vehicle_road", {"tagged_lit": 5, "tagged_unlit": 3, "untagged": 2}, 100,
        None,
        {"model": 0.875, "rule": 0.5, "highway_rate": 0.6},
        {"model": 1.0, "rule": None, "highway_rate": 0.5},
    )
    return ValidationResult(
        class_counts={"london": {"tagged_lit": 5, "tagged_unlit": 3, "untagged": 2}},
        skipped_cities=[],
        metrics=[metrics],
        did_not_beat=[],
        unseen_highway_types={"london": 2},
    )


def test_report_counts_and_caveats():
    text = render_validation(_result())
    assert "| london | 5 | 3 | 2 |" in text
    assert "tagged segments only" in text
    assert "Untagged segments are unknown, not unlit" in text
    assert "0.875" in text and "undefined" in text


def test_report_has_no_banned_words():
    lowered = render_validation(_result()).lower()
    for word in BANNED:
        assert word not in lowered


def test_fmt():
    assert fmt(None) == "undefined"
    assert fmt(0.5) == "0.500"


SCORES = {
    "model": {1: 0.9, 2: 0.1},
    "rule": {1: 1.0, 2: 0.0},
    "highway_rate": {1: 0.7, 2: 0.3},
    "highway_footway_rate": {1: 0.7, 2: 0.3},
}


def test_ground_truth_file_missing():
    res = evaluate_ground_truth(None, SCORES, problem="missing")
    assert res.status == "not run" and "missing" in res.reason
    assert "Not run" in render_validation(_result(), res)


@pytest.mark.parametrize(
    "text",
    ["id,label\n1,lit\n", "osm_id,label\nabc,lit\n", "osm_id,label\n1,maybe\n", "osm_id,label\n1\n", ""],
)
def test_ground_truth_unreadable_text(text):
    res = evaluate_ground_truth(text, SCORES)
    assert res.status == "not run" and "unreadable" in res.reason


def test_ground_truth_unreadable_problem_with_no_text():
    res = evaluate_ground_truth(None, SCORES, problem="unreadable")
    assert res.status == "not run" and "unreadable" in res.reason


def test_ground_truth_only_unsure_rows():
    res = evaluate_ground_truth("osm_id,label\n1,unsure\n2,unsure\n", SCORES)
    assert res.status == "not run" and res.reason
    assert res.excluded_unsure == 2
    assert "Not run" in render_validation(_result(), res)


def test_ground_truth_accuracy_hand_example():
    # Row 1 lit, row 2 dark, row 3 unsure (excluded), row 99 unmatched.
    rows = parse_ground_truth("osm_id,label\n1,lit\n2,dark\n3,unsure\n99,lit\n")
    res = ground_truth_accuracy(rows, SCORES)
    assert (res.status, res.excluded_unsure, res.unmatched, res.scored) == ("run", 1, 1, 2)
    assert res.accuracy == {"model": 1.0, "rule": 1.0, "highway_rate": 1.0, "highway_footway_rate": 1.0}


def test_guard_different_city_names_both_values():
    with pytest.raises(InvalidArgumentError) as exc:
        check_ground_truth_city("kuala_lumpur", "london")
    assert "kuala_lumpur" in str(exc.value) and "london" in str(exc.value)


def test_guard_null_held_out_city():
    with pytest.raises(InvalidArgumentError) as exc:
        check_ground_truth_city("kuala_lumpur", None)
    assert "kuala_lumpur" in str(exc.value) and "None" in str(exc.value)


def test_guard_matching_city_passes():
    check_ground_truth_city("kuala_lumpur", "kuala_lumpur")


# ---------------------------------------------------------------- fourth baseline (R4.6, R4.7, R4.8, R4.13, R7.9)

from gloam_pipeline.baselines import highway_footway_rate_baseline
from gloam_pipeline.model import TrainingRow
from gloam_pipeline.validation import DidNotBeat, pair_rates_from_model, score_methods

# Design hand example: residential sidewalk 12/3, none 18/7 (type 30/10 = 0.75); footway sidewalk 40/20;
# totals 70/30 -> overall 0.7. Only the entries the tests use are kept.
PAIR_MODEL = {
    "highway_rates": {"residential": 0.75},
    "overall_lit_rate": 0.7,
    "unseen_highway_types": 14,
    "pair_rates": {"residential": {"sidewalk": 0.8}},
    "coefficients": [0.0],
    "intercept": 0.0,
}


def _four_method_result() -> ValidationResult:
    metrics = CityMetrics(
        "london", "vehicle_road", {"tagged_lit": 5, "tagged_unlit": 3, "untagged": 2}, 100, None,
        {"model": 0.7, "rule": 0.5, "highway_rate": 0.6, "highway_footway_rate": 0.7123},
        {"model": 1.0, "rule": 0.5, "highway_rate": 0.25, "highway_footway_rate": None},
    )
    return ValidationResult(
        class_counts={"london": {"tagged_lit": 5, "tagged_unlit": 3, "untagged": 2}},
        skipped_cities=[],
        metrics=[metrics],
        did_not_beat=[DidNotBeat("london", "vehicle_road", "highway_footway_rate", 0.7, 0.7123)],
        unseen_highway_types={"london": 2},
        type_fallback_pairs={"london": 3},
        overall_fallback_pairs={"london": 1},
    )


def test_report_fourth_baseline_column_and_values():
    lines = render_validation(_four_method_result()).splitlines()
    assert (
        "| Metric | Model | Rule baseline | Highway-rate baseline | Highway-footway-rate baseline |" in lines
    )
    # 0.7123 -> "0.712" at 3 decimals; None -> "undefined".
    assert "| AUC | 0.700 | 0.500 | 0.600 | 0.712 |" in lines
    assert "| Precision at 0.5 | 1.000 | 0.500 | 0.250 | undefined |" in lines


def test_report_fallback_counts_and_did_not_beat():
    text = render_validation(_four_method_result())
    assert "- london: 2" in text  # unseen_highway_types
    assert "Pairs of highway type and footway kind with no tagged training data, per city:" in text
    assert "- london: 3 used the highway-type rate, 1 used the overall lit rate" in text
    assert (
        "The model did not beat the highway-footway-rate baseline for london, vehicle roads: "
        "model AUC 0.700, highway-footway-rate baseline AUC 0.712." in text
    )


def test_ground_truth_table_has_four_accuracy_columns():
    gt = ground_truth_accuracy(parse_ground_truth("osm_id,label\n1,lit\n2,dark\n"), SCORES)
    lines = render_validation(_four_method_result(), gt).splitlines()
    header = next(i for i, ln in enumerate(lines) if ln.startswith("| Metric |") and i > lines.index("## Ground truth"))
    assert lines[header].count("|") - 1 == 5  # Metric + four methods
    assert lines[header + 2] == "| Accuracy | 1.000 | 1.000 | 1.000 | 1.000 |"


def test_ground_truth_accuracy_returns_four_methods():
    res = ground_truth_accuracy([(1, "lit")], SCORES)
    assert set(res.accuracy) == {"model", "rule", "highway_rate", "highway_footway_rate"}


def test_mismatch_only_in_highway_footway_rate_names_city_and_split():
    rows = [(1, "residential", "tagged_lit", 0.5), (2, "residential", "tagged_unlit", 0.4)]
    by_method = {
        "model": rows, "rule": rows, "highway_rate": rows,
        "highway_footway_rate": rows[:1],  # segment 2 missing
    }
    with pytest.raises(ValidationError) as exc:
        check_identical_segment_sets("kuala_lumpur", "walking_path", by_method)
    msg = str(exc.value)
    assert "kuala_lumpur" in msg and "walking_path" in msg and "highway_footway_rate" in msg


def test_pair_rates_from_model_rebuilds_baseline():
    pairs = pair_rates_from_model(PAIR_MODEL)
    # (residential, sidewalk): stored pair rate 12 / 15 = 0.8.
    assert highway_footway_rate_baseline(pairs, "residential", "sidewalk") == pytest.approx(0.8)
    # (residential, crossing): no pair, falls back to the residential type rate 30 / 40 = 0.75.
    assert highway_footway_rate_baseline(pairs, "residential", "crossing") == pytest.approx(0.75)
    # (steps, none): no pair, no steps type rate, falls back to overall 70 / 100 = 0.7.
    assert highway_footway_rate_baseline(pairs, "steps", "none") == pytest.approx(0.7)


def test_score_methods_highway_footway_rate_scores():
    from gloam_pipeline.validation import rates_from_model

    rows = [
        TrainingRow("london", 1, "residential", "sidewalk", "tagged_lit", (0.0,)),
        TrainingRow("london", 2, "steps", "none", "tagged_unlit", (0.0,)),
    ]
    scored = score_methods(PAIR_MODEL, rates_from_model(PAIR_MODEL), pair_rates_from_model(PAIR_MODEL), rows)
    # Segment 1: pair rate 0.8. Segment 2: no steps data -> overall 0.7.
    assert [r[3] for r in scored["highway_footway_rate"]] == pytest.approx([0.8, 0.7])
    # Model: sigmoid(0 * 0 + 0) = 0.5 for both rows; highway_rate: 0.75 then overall 0.7.
    assert [r[3] for r in scored["model"]] == pytest.approx([0.5, 0.5])
    assert [r[3] for r in scored["highway_rate"]] == pytest.approx([0.75, 0.7])
    assert [r[3] for r in scored["rule"]] == [0.0, 0.0]
