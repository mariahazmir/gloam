"""Unit tests for the pair-rate baseline (hand-checked example from design.md).

Validates: Requirements 4.9, 4.11, 4.12, 4.13
"""

import pytest

from gloam_pipeline.baselines import (
    highway_footway_rate_baseline,
    learn_pair_rates,
    pair_fallback_counts,
)
from gloam_pipeline.errors import InvalidArgumentError, TrainingError

LIT, UNLIT, UNTAGGED = "tagged_lit", "tagged_unlit", "untagged"


def _rows(highway, kind, lit, unlit, untagged=0):
    return (
        [(highway, kind, LIT)] * lit
        + [(highway, kind, UNLIT)] * unlit
        + [(highway, kind, UNTAGGED)] * untagged
    )


# Hand computation:
#   (residential, sidewalk): 12 / (12 + 3)  = 12/15 = 0.8
#   (residential, none):     18 / (18 + 7)  = 18/25 = 0.72
#   (footway, sidewalk):     40 / (40 + 20) = 40/60 = 2/3 ~ 0.667
#   residential type: lit 12 + 18 = 30, unlit 3 + 7 = 10 -> 30/40 = 0.75
#   footway type: 40/60 ~ 0.667
#   overall: lit 30 + 40 = 70, unlit 10 + 20 = 30 -> 70/100 = 0.7
#   Untagged rows add to no count, so nothing changes.
TRAINING = (
    _rows("residential", "sidewalk", 12, 3, untagged=4)
    + _rows("residential", "none", 18, 7, untagged=2)
    + _rows("footway", "sidewalk", 40, 20, untagged=5)
    + [("steps", "none", UNTAGGED)] * 3
)


@pytest.fixture(scope="module")
def pairs():
    return learn_pair_rates(TRAINING)


def test_pairs_with_data_use_their_own_rate(pairs):
    assert highway_footway_rate_baseline(pairs, "residential", "sidewalk") == pytest.approx(0.8)
    assert highway_footway_rate_baseline(pairs, "residential", "none") == pytest.approx(0.72)


def test_unseen_pair_falls_back_to_highway_rate(pairs):
    assert highway_footway_rate_baseline(pairs, "residential", "crossing") == pytest.approx(0.75)
    assert highway_footway_rate_baseline(pairs, "footway", "crossing") == pytest.approx(40 / 60)


def test_unseen_highway_falls_back_to_overall_rate(pairs):
    # steps only has untagged rows, so it has no type rate either.
    assert pairs.overall_lit_rate == pytest.approx(0.7)
    assert highway_footway_rate_baseline(pairs, "steps", "none") == pytest.approx(0.7)


def test_untagged_rows_change_nothing(pairs):
    tagged_only = [r for r in TRAINING if r[2] != UNTAGGED]
    assert learn_pair_rates(tagged_only).rates == pairs.rates
    assert learn_pair_rates(tagged_only).overall_lit_rate == pairs.overall_lit_rate


def test_pair_fallback_counts_distinct_pairs(pairs):
    # (residential, sidewalk) has data and is skipped (listed twice, one distinct pair).
    # (residential, crossing): residential has a type rate -> type fallback.
    # (footway, crossing): footway has a type rate -> type fallback.
    # (steps, none): no type rate -> overall fallback.
    # So (type, overall) = (2, 1); 1 pair with data over 4 distinct pairs.
    city = [
        ("residential", "sidewalk"),
        ("residential", "sidewalk"),
        ("residential", "crossing"),
        ("footway", "crossing"),
        ("steps", "none"),
    ]
    assert pair_fallback_counts(pairs, city) == (2, 1)
    assert len(set(city)) == 4
    assert sum(p in pairs.rates for p in set(city)) == 1


def test_no_tagged_rows_raises_training_error():
    with pytest.raises(TrainingError):
        learn_pair_rates([("residential", "sidewalk", UNTAGGED)])
    with pytest.raises(TrainingError):
        learn_pair_rates([])


@pytest.mark.parametrize(
    "highway, kind, argument",
    [
        ("not_a_highway", "sidewalk", "highway"),
        ("residential", "not_a_kind", "footway_kind"),
    ],
)
def test_invalid_query_names_the_argument(pairs, highway, kind, argument):
    with pytest.raises(InvalidArgumentError) as exc:
        highway_footway_rate_baseline(pairs, highway, kind)
    assert exc.value.argument == argument
    assert argument in str(exc.value)


def test_invalid_training_footway_kind_names_the_argument():
    with pytest.raises(InvalidArgumentError) as exc:
        learn_pair_rates([("residential", "bogus", LIT)])
    assert exc.value.argument == "training footway_kind"


def test_invalid_training_highway_names_the_argument():
    with pytest.raises(InvalidArgumentError) as exc:
        learn_pair_rates([(5, "sidewalk", LIT)])
    assert exc.value.argument == "training highway"
