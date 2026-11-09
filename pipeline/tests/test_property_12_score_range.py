"""Property 12 for score_segment. Validates: Requirements 6.1, 10.1."""

import math

from hypothesis import given, strategies as st

from gloam_pipeline.config import PipelineConfig
from gloam_pipeline.features import ScaledCounts
from gloam_pipeline.scoring import LABELS, score_segment

# Feature: gloam-data-pipeline, Property 12: Scores are finite and in range

unit = st.floats(min_value=0.0, max_value=1.0, allow_nan=False, allow_infinity=False)


@st.composite
def p12_configs(draw):
    return PipelineConfig(
        high_value=draw(st.floats(0.5, 1.0, allow_nan=False)),
        low_value=draw(st.floats(0.0, 0.49, allow_nan=False)),
        tagged_confidence=draw(st.floats(0.5, 1.0, allow_nan=False)),
    )


p12_counts = st.builds(ScaledCounts, unit, unit, unit, unit)


@given(
    label=st.sampled_from(LABELS),
    model_prob=unit,
    counts=p12_counts,
    missing=st.booleans(),
    shift=unit,
    cfg=p12_configs(),
)
def test_scores_are_finite_and_in_range(label, model_prob, counts, missing, shift, cfg):
    score = score_segment(label, model_prob, counts, missing, shift, cfg)

    for value in (score.lit_probability, score.confidence):
        assert math.isfinite(value)
        assert 0.0 <= value <= 1.0
