"""Property 22: ground-truth accuracy excludes unsure rows. Validates: Requirements 7.6."""

import pytest
from hypothesis import HealthCheck, given, settings
from hypothesis import strategies as st

from gloam_pipeline.errors import InvalidArgumentError
from gloam_pipeline.validation import (
    METHODS,
    evaluate_ground_truth,
    ground_truth_accuracy,
    parse_ground_truth,
)

# Feature: gloam-data-pipeline, Property 22: Ground-truth accuracy excludes unsure rows
# **Validates: Requirements 7.6**

SMALL = settings(
    max_examples=50, deadline=None, suppress_health_check=[HealthCheck.too_slow, HealthCheck.data_too_large]
)

_ids = st.integers(min_value=1, max_value=30)
_label = st.sampled_from(["lit", "dark", "unsure"])
_rows = st.lists(st.tuples(_ids, _label), max_size=25)
_score = st.sampled_from([0.0, 0.3, 0.49, 0.5, 0.51, 0.9, 1.0])


@st.composite
def _scores(draw):
    """Scores for a random subset of ids 1..30; every method scores the same ids."""
    present = draw(st.lists(_ids, unique=True, max_size=30))
    return {m: {i: draw(_score) for i in present} for m in METHODS}


def _hand(rows, scores):
    kept = [(i, lab) for i, lab in rows if lab != "unsure"]
    matched = [(i, lab) for i, lab in kept if i in scores["model"]]
    acc = {}
    for m in METHODS:
        hits = sum(1 for i, lab in matched if (scores[m][i] >= 0.5) == (lab == "lit"))
        acc[m] = hits / len(matched) if matched else None
    return len(rows) - len(kept), len(kept) - len(matched), len(matched), acc


@SMALL
@given(_rows, _scores())
def test_accuracy_matches_hand_computation_over_non_unsure_rows(rows, scores):
    result = ground_truth_accuracy(rows, scores)
    excluded, unmatched, scored, acc = _hand(rows, scores)
    assert result.excluded_unsure == excluded
    if all(lab == "unsure" for _, lab in rows):
        assert result.status == "not run"
        assert result.reason
        assert result.unmatched == 0 and result.scored == 0
        assert all(v is None for v in result.accuracy.values())
        return
    assert result.status == "run"
    assert set(result.accuracy) == set(METHODS) and len(result.accuracy) == 4
    assert result.unmatched == unmatched
    assert result.scored == scored
    for m in METHODS:
        assert result.accuracy[m] == acc[m]
        if acc[m] is None:
            assert scored == 0
        else:
            assert 0.0 <= result.accuracy[m] <= 1.0
            # Same denominator for every method: hits is a whole number out of `scored`.
            assert result.accuracy[m] * scored == pytest.approx(round(result.accuracy[m] * scored))


@SMALL
@given(_rows, st.lists(_ids, max_size=15), _scores())
def test_adding_unsure_rows_changes_only_excluded_count(rows, extra_ids, scores):
    base = ground_truth_accuracy(rows, scores)
    more = ground_truth_accuracy(rows + [(i, "unsure") for i in extra_ids], scores)
    assert more.excluded_unsure == base.excluded_unsure + len(extra_ids)
    if any(lab != "unsure" for _, lab in rows):
        assert more.status == base.status == "run"
        assert more.unmatched == base.unmatched
        assert more.scored == base.scored
        assert dict(more.accuracy) == dict(base.accuracy)


@SMALL
@given(st.lists(_ids, max_size=20), _scores())
def test_all_unsure_is_not_run_with_excluded_count(ids, scores):
    result = evaluate_ground_truth(
        "osm_id,label\n" + "".join(f"{i},unsure\n" for i in ids), scores
    )
    if ids:
        assert result.status == "not run"
        assert result.excluded_unsure == len(ids)
        assert result.scored == 0
    assert all(v is None for v in result.accuracy.values()) or result.status == "run"


@SMALL
@given(_rows, _scores())
def test_csv_round_trip_gives_same_result_as_rows(rows, scores):
    text = "osm_id,label\n" + "".join(f"{i},{lab}\n" for i, lab in rows)
    assert parse_ground_truth(text) == rows
    assert evaluate_ground_truth(text, scores) == ground_truth_accuracy(rows, scores)


def test_hand_checked_example():
    # 1 lit scored 0.9 -> hit; 2 dark scored 0.5 -> predicted lit, miss; 3 unsure excluded; 4 not in scores.
    scores = {m: {1: 0.9, 2: 0.5} for m in METHODS}
    result = ground_truth_accuracy([(1, "lit"), (2, "dark"), (3, "unsure"), (4, "lit")], scores)
    assert (result.excluded_unsure, result.unmatched, result.scored) == (1, 1, 2)
    assert all(result.accuracy[m] == 0.5 for m in METHODS)


def test_methods_with_different_scores_get_different_accuracy():
    # Rows 1..4 = lit, dark, lit, dark; unsure row 5 and unmatched row 6 are ignored.
    rows = [(1, "lit"), (2, "dark"), (3, "lit"), (4, "dark"), (5, "unsure"), (6, "lit")]
    scores = {
        "model": {1: 0.9, 2: 0.1, 3: 0.9, 4: 0.1},  # 4/4 hits
        "rule": {1: 0.9, 2: 0.1, 3: 0.9, 4: 0.9},  # 3/4
        "highway_rate": {1: 0.9, 2: 0.1, 3: 0.1, 4: 0.9},  # 2/4
        "highway_footway_rate": {1: 0.1, 2: 0.1, 3: 0.1, 4: 0.9},  # 1/4
    }
    result = ground_truth_accuracy(rows, scores)
    assert (result.excluded_unsure, result.unmatched, result.scored) == (1, 1, 4)
    assert dict(result.accuracy) == {
        "model": 1.0, "rule": 0.75, "highway_rate": 0.5, "highway_footway_rate": 0.25,
    }


def test_missing_highway_footway_rate_raises_naming_scores_by_method():
    scores = {m: {1: 0.9} for m in METHODS if m != "highway_footway_rate"}
    with pytest.raises(InvalidArgumentError, match="scores_by_method"):
        ground_truth_accuracy([(1, "lit")], scores)
