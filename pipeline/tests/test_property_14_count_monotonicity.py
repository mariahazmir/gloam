"""Property 14: more nearby places never lower confidence. Validates: Requirements 6.8, 10.6."""

from hypothesis import given, settings, strategies as st

from gloam_pipeline.config import PipelineConfig
from gloam_pipeline.features import ScaledCounts, scale_counts
from gloam_pipeline.scoring import score_segment

# Feature: gloam-data-pipeline, Property 14: More nearby places never lower confidence

CFG = PipelineConfig()
unit = st.floats(0.0, 1.0, allow_nan=False, allow_infinity=False)
FIELDS = ("bus_stops", "food_places", "shops", "buildings")


@settings(max_examples=200)
@given(
    base=st.tuples(unit, unit, unit, unit),
    field=st.sampled_from(FIELDS),
    a=unit,
    b=unit,
    model_prob=unit,
    missing=st.booleans(),
    shift=unit,
)
def test_higher_scaled_count_never_lowers_confidence(base, field, a, b, model_prob, missing, shift):
    lo, hi = min(a, b), max(a, b)
    values = dict(zip(FIELDS, base))
    low = score_segment("untagged", model_prob, ScaledCounts(**{**values, field: lo}), missing, shift, CFG)
    high = score_segment("untagged", model_prob, ScaledCounts(**{**values, field: hi}), missing, shift, CFG)
    assert high.label_source == low.label_source == "estimated"
    assert high.confidence >= low.confidence


@settings(max_examples=200)
@given(
    data=st.lists(
        st.tuples(st.integers(0, 10_000), st.booleans()), min_size=0, max_size=40
    )
)
def test_scale_counts_non_decreasing_in_raw_count(data):
    values = [c for c, _ in data]
    flags = [m for _, m in data]
    scaled = scale_counts(values, flags)
    kept = [(c, s) for c, s, m in zip(values, scaled, flags) if not m]
    for c1, s1 in kept:
        for c2, s2 in kept:
            if c1 <= c2:
                assert s1 <= s2


@settings(max_examples=200)
@given(
    raw=st.lists(st.integers(0, 10_000), min_size=2, max_size=40),
    i=st.integers(0, 39),
    j=st.integers(0, 39),
    field=st.sampled_from(FIELDS),
    model_prob=unit,
    shift=unit,
)
def test_raw_count_order_carries_through_to_confidence(raw, i, j, field, model_prob, shift):
    scaled = scale_counts(raw)
    i, j = i % len(raw), j % len(raw)
    if raw[i] > raw[j]:
        i, j = j, i  # ensure raw[i] <= raw[j]
    conf = []
    for k in (i, j):
        sc = ScaledCounts(**{**dict.fromkeys(FIELDS, 0.0), field: scaled[k]})
        conf.append(score_segment("untagged", model_prob, sc, False, shift, CFG).confidence)
    assert conf[0] <= conf[1]
