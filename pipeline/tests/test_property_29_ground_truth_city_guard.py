"""Property 29: ground truth is only scored with a model that held out its city. Validates: Requirements 7.6."""

import pytest
from hypothesis import HealthCheck, given, settings
from hypothesis import strategies as st

from gloam_pipeline.errors import InvalidArgumentError
from gloam_pipeline.validation import check_ground_truth_city

# Feature: gloam-data-pipeline, Property 29: Ground truth is only scored with a model that held out its city
# **Validates: Requirements 7.6**

SMALL = settings(
    max_examples=100, deadline=None, suppress_health_check=[HealthCheck.too_slow, HealthCheck.data_too_large]
)

_city = st.text(alphabet="abcdefghijklmnopqrstuvwxyz0123456789-_", min_size=1, max_size=12)


@SMALL
@given(_city, st.one_of(st.none(), _city))
def test_passes_iff_held_out_equals_ground_truth_city(a, b):
    if b == a:
        assert check_ground_truth_city(a, b) is None
    else:
        with pytest.raises(InvalidArgumentError) as exc:
            check_ground_truth_city(a, b)
        assert a in str(exc.value)
        assert str(b) in str(exc.value)


@SMALL
@given(_city)
def test_equal_city_always_passes(a):
    check_ground_truth_city(a, a)


@SMALL
@given(_city)
def test_none_held_out_always_rejected_and_named(a):
    with pytest.raises(InvalidArgumentError) as exc:
        check_ground_truth_city(a, None)
    assert "None" in str(exc.value)


@pytest.mark.parametrize("bad", ["", None, 5])
def test_empty_or_non_string_gt_city_rejected(bad):
    with pytest.raises(InvalidArgumentError):
        check_ground_truth_city(bad, "kuala-lumpur")
