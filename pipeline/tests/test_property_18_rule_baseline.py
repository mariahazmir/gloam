"""Property 18 for rule_baseline. Validates: Requirements 4.1, 4.2."""

import pytest
from hypothesis import given, strategies as st

from gloam_pipeline.baselines import RULE_LIT_CLASSES, rule_baseline
from gloam_pipeline.errors import InvalidArgumentError

# Feature: gloam-data-pipeline, Property 18: Rule baseline depends on highway class only

classes = st.one_of(
    st.sampled_from(sorted(RULE_LIT_CLASSES)),
    st.sampled_from(["residential", "footway", "primary_link", "Primary", " primary"]),
    st.text(max_size=12),
)


@given(highway=classes)
def test_lit_exactly_when_class_in_rule_set(highway):
    expected = 1.0 if highway in RULE_LIT_CLASSES else 0.0
    assert rule_baseline(highway) == expected
    # Same class, called again (other attributes cannot be passed): same output.
    assert rule_baseline(str(highway)) == rule_baseline(highway)


def test_rule_baseline_examples():
    assert [rule_baseline(h) for h in ("primary", "secondary", "tertiary")] == [1.0] * 3
    assert rule_baseline("residential") == 0.0
    assert rule_baseline("primary_link") == 0.0


def test_rule_baseline_rejects_non_string():
    with pytest.raises(InvalidArgumentError, match="highway"):
        rule_baseline(None)
