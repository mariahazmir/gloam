"""Property 19 for the highway-rate baseline. Validates: Requirements 4.3, 4.4, 4.5."""

import pytest
from hypothesis import assume, given, strategies as st

from gloam_pipeline.baselines import (
    highway_rate_baseline,
    learn_highway_rates,
)
from gloam_pipeline.classify import SEGMENT_HIGHWAYS
from gloam_pipeline.errors import TrainingError

# Feature: gloam-data-pipeline, Property 19: Highway-rate baseline uses the training rate, with fallback

types = st.sampled_from(["primary", "residential", "service", "footway", "track"])
labels = st.sampled_from(["tagged_lit", "tagged_unlit", "untagged"])
rows = st.lists(st.tuples(types, labels), max_size=60)


@given(training=rows, probe=st.one_of(types, st.just("never_seen_type")))
def test_rate_or_overall_fallback(training, probe):
    tagged = [(h, lab) for h, lab in training if lab != "untagged"]
    assume(tagged)
    rates = learn_highway_rates(training)

    lit_all = sum(1 for _, lab in tagged if lab == "tagged_lit")
    assert rates.overall_lit_rate == lit_all / len(tagged)

    of_type = [lab for h, lab in tagged if h == probe]
    if of_type:
        expected = of_type.count("tagged_lit") / len(of_type)
    else:
        expected = rates.overall_lit_rate
    assert highway_rate_baseline(rates, probe) == expected
    assert 0.0 <= highway_rate_baseline(rates, probe) <= 1.0

    with_tags = {h for h, _ in tagged}
    assert rates.unseen_highway_types == len(SEGMENT_HIGHWAYS) - len(with_tags)


@given(training=rows)
def test_no_tagged_rows_raises_training_error(training):
    only_untagged = [(h, "untagged") for h, _ in training]
    with pytest.raises(TrainingError):
        learn_highway_rates(only_untagged)


def test_hand_checked_example():
    training = (
        [("residential", "tagged_lit")] * 30
        + [("residential", "tagged_unlit")] * 10
        + [("primary", "tagged_lit")] * 40
        + [("primary", "tagged_unlit")] * 20
        + [("track", "untagged")] * 5
    )
    # totals: lit 70, unlit 30
    rates = learn_highway_rates(training)
    assert highway_rate_baseline(rates, "residential") == 0.75
    assert rates.overall_lit_rate == 0.7
    assert highway_rate_baseline(rates, "track") == 0.7
    assert highway_rate_baseline(rates, "path") == 0.7
    # 16 walkable types; only residential and primary have tagged rows -> 14 unseen
    # (track is untagged only, the other 13 never appear).
    assert rates.unseen_highway_types == 14


def test_unseen_counts_against_all_16_types():
    assert len(SEGMENT_HIGHWAYS) == 16
    only_residential = [("residential", "tagged_lit"), ("residential", "tagged_unlit")]
    assert learn_highway_rates(only_residential).unseen_highway_types == 15


def test_tagged_type_outside_the_16_gets_a_rate_but_is_not_counted():
    rates = learn_highway_rates([("motorway", "tagged_lit"), ("residential", "tagged_unlit")])
    assert highway_rate_baseline(rates, "motorway") == 1.0
    assert rates.unseen_highway_types == 15  # only residential covers one of the 16
