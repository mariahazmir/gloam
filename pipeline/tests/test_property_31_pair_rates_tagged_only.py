"""Property 31 for pair rates. Validates: Requirements 4.9, 4.13."""

import pytest
from hypothesis import given, strategies as st

from gloam_pipeline.baselines import learn_pair_rates
from gloam_pipeline.errors import TrainingError
from gloam_pipeline.features import FOOTWAY_ORDER, HIGHWAY_ORDER

# Feature: gloam-data-pipeline, Property 31: Pair rates come from tagged training segments only

highways = st.sampled_from(HIGHWAY_ORDER)
kinds = st.sampled_from(FOOTWAY_ORDER)
tagged_labels = st.sampled_from(["tagged_lit", "tagged_unlit"])
tagged_rows = st.lists(st.tuples(highways, kinds, tagged_labels), min_size=1, max_size=60)
untagged_rows = st.lists(
    st.tuples(highways, kinds, st.just("untagged")), max_size=40
)
mixed_rows = st.lists(
    st.tuples(highways, kinds, st.sampled_from(["tagged_lit", "tagged_unlit", "untagged"])),
    max_size=80,
)


def _expected_pair_rates(rows):
    lit, unlit = {}, {}
    for h, k, label in rows:
        if label == "tagged_lit":
            lit[(h, k)] = lit.get((h, k), 0) + 1
        elif label == "tagged_unlit":
            unlit[(h, k)] = unlit.get((h, k), 0) + 1
    return {
        p: lit.get(p, 0) / (lit.get(p, 0) + unlit.get(p, 0)) for p in set(lit) | set(unlit)
    }


@given(training=mixed_rows)
def test_pair_rates_are_lit_over_tagged_and_untagged_only_pairs_absent(training):
    tagged = [r for r in training if r[2] != "untagged"]
    if not tagged:
        with pytest.raises(TrainingError):
            learn_pair_rates(training)
        return
    result = learn_pair_rates(training)
    expected = _expected_pair_rates(training)
    assert dict(result.rates) == expected
    tagged_pairs = {(h, k) for h, k, _ in tagged}
    for h, k, label in training:
        if (h, k) not in tagged_pairs:
            assert (h, k) not in result.rates
    lit = sum(1 for r in tagged if r[2] == "tagged_lit")
    assert result.overall_lit_rate == lit / len(tagged)


@given(training=tagged_rows, extras=untagged_rows, data=st.data())
def test_untagged_and_excluded_rows_have_no_effect(training, extras, data):
    # `training` is what the caller passes; excluded (e.g. held-out) rows never reach the function.
    base = learn_pair_rates(training)
    combined = list(training)
    for row in extras:
        combined.insert(data.draw(st.integers(0, len(combined))), row)
    padded = learn_pair_rates(combined)
    assert dict(padded.rates) == dict(base.rates)
    assert padded.highway_rates == base.highway_rates
    assert padded.overall_lit_rate == base.overall_lit_rate


@given(training=tagged_rows, held_out=tagged_rows)
def test_function_sees_only_the_rows_it_is_passed(training, held_out):
    # Learning from training alone equals the independent computation on training alone;
    # held-out rows (never passed) cannot appear, even when they hold pairs absent from training.
    result = learn_pair_rates(training)
    assert dict(result.rates) == _expected_pair_rates(training)
    training_pairs = {(h, k) for h, k, _ in training}
    for h, k, _ in held_out:
        if (h, k) not in training_pairs:
            assert (h, k) not in result.rates


@given(extras=untagged_rows)
def test_no_tagged_rows_raises_training_error(extras):
    with pytest.raises(TrainingError):
        learn_pair_rates(extras)
