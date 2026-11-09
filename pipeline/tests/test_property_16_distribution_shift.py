"""Property 16: distribution shift never raises confidence. Validates: Requirements 6.10, 10.7."""

from hypothesis import given, settings, strategies as st

from gloam_pipeline.config import PipelineConfig
from gloam_pipeline.features import ScaledCounts
from gloam_pipeline.scoring import score_segment
from gloam_pipeline.shift import FEATURES, N_BINS, city_shift, shift_penalty, to_proportions

# Feature: gloam-data-pipeline, Property 16: Distribution shift never raises confidence

CFG = PipelineConfig()
unit = st.floats(0.0, 1.0, allow_nan=False, allow_infinity=False)
counts5 = st.lists(st.integers(0, 1000), min_size=N_BINS, max_size=N_BINS)
hists = st.fixed_dictionaries({f: counts5.map(to_proportions) for f in FEATURES})


@settings(max_examples=200)
@given(
    scaled=st.tuples(unit, unit, unit, unit),
    model_prob=unit,
    missing=st.booleans(),
    a=unit,
    b=unit,
)
def test_higher_shift_never_raises_confidence(scaled, model_prob, missing, a, b):
    s1, s2 = min(a, b), max(a, b)
    sc = ScaledCounts(**dict(zip(FEATURES, scaled)))
    low = score_segment("untagged", model_prob, sc, missing, s1, CFG)
    high = score_segment("untagged", model_prob, sc, missing, s2, CFG)
    assert low.label_source == high.label_source == "estimated"
    assert high.confidence <= low.confidence


@settings(max_examples=200)
@given(a=unit, b=unit)
def test_shift_penalty_non_increasing_and_bounded(a, b):
    s1, s2 = min(a, b), max(a, b)
    assert 0.5 <= shift_penalty(s2) <= shift_penalty(s1) <= 1.0


@settings(max_examples=200)
@given(city=hists, train=hists)
def test_city_shift_in_unit_range(city, train):
    assert 0.0 <= city_shift(city, train) <= 1.0


@settings(max_examples=200)
@given(h=hists)
def test_city_shift_zero_for_identical_histograms(h):
    assert city_shift(h, h) == 0.0
