"""Property 20 for AUC and precision. Validates: Requirements 7.1, 7.11."""

import random

import pytest
from hypothesis import given, strategies as st

from gloam_pipeline.metrics import auc, precision_at

# Feature: gloam-data-pipeline, Property 20: AUC and precision are valid or explicitly undefined

# Few distinct values so ties are common.
score = st.sampled_from([0.0, 0.1, 0.25, 0.5, 0.6, 0.75, 0.9, 1.0])
pairs = st.lists(st.tuples(score, st.booleans()), max_size=40)


@given(data=pairs)
def test_auc_in_range_or_undefined(data):
    scores = [s for s, _ in data]
    pos = [p for _, p in data]
    result = auc(scores, pos)
    if any(pos) and not all(pos):
        assert result is not None
        assert 0.0 <= result <= 1.0
    else:
        assert result is None


@given(data=pairs, seed=st.integers(0, 10_000))
def test_auc_invariant_under_order(data, seed):
    shuffled = list(data)
    random.Random(seed).shuffle(shuffled)
    a = auc([s for s, _ in data], [p for _, p in data])
    b = auc([s for s, _ in shuffled], [p for _, p in shuffled])
    if a is None:
        assert b is None
    else:
        assert b == pytest.approx(a, abs=1e-12)


@given(data=pairs)
def test_auc_flips_when_scores_inverted(data):
    scores = [s for s, _ in data]
    pos = [p for _, p in data]
    a = auc(scores, pos)
    flipped = auc([1.0 - s for s in scores], pos)
    if a is None:
        assert flipped is None
    else:
        assert flipped == pytest.approx(1.0 - a, abs=1e-9)


@given(data=pairs, cutoff=st.sampled_from([0.0, 0.25, 0.5, 0.75, 1.0]))
def test_precision_in_range_or_undefined(data, cutoff):
    scores = [s for s, _ in data]
    pos = [p for _, p in data]
    result = precision_at(scores, pos, cutoff)
    predicted = [p for s, p in data if s >= cutoff]
    if predicted:
        assert result is not None
        assert 0.0 <= result <= 1.0
        assert result == sum(predicted) / len(predicted)
    else:
        assert result is None  # undefined, not 0


def test_auc_hand_computed_example():
    # Pairs: 0.9>0.6 (1), 0.9>0.2 (1), 0.6=0.6 (0.5), 0.6>0.2 (1) -> 3.5 / 4 = 0.875
    assert auc([0.9, 0.6, 0.6, 0.2], [True, True, False, False]) == 0.875


def test_precision_undefined_when_nothing_at_cutoff():
    assert precision_at([0.1, 0.4], [True, False]) is None
    assert precision_at([0.5, 0.4], [True, False]) == 1.0
