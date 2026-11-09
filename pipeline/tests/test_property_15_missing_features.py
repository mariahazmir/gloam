"""Property 15: missing features lower confidence. Validates: Requirements 6.9."""

from hypothesis import given, settings, strategies as st

from gloam_pipeline.config import PipelineConfig
from gloam_pipeline.features import ScaledCounts
from gloam_pipeline.scoring import score_segment

# Feature: gloam-data-pipeline, Property 15: Missing features lower confidence

unit_st = st.floats(0.0, 1.0, allow_nan=False, allow_infinity=False)
counts_st = st.builds(
    ScaledCounts, bus_stops=unit_st, food_places=unit_st, shops=unit_st, buildings=unit_st
)
cfg_st = st.builds(
    PipelineConfig,
    high_value=st.floats(0.6, 1.0, allow_nan=False),
    low_value=st.floats(0.0, 0.4, allow_nan=False),
    tagged_confidence=st.floats(0.5, 1.0, allow_nan=False),
)


@settings(max_examples=200, deadline=None)
@given(prob=unit_st, counts=counts_st, shift=unit_st, cfg=cfg_st)
def test_missing_features_strictly_lower_confidence(prob, counts, shift, cfg):
    """**Validates: Requirements 6.9**"""
    clean = score_segment("untagged", prob, counts, False, shift, cfg)
    missing = score_segment("untagged", prob, counts, True, shift, cfg)
    assert clean.label_source == missing.label_source == "estimated"
    assert missing.confidence < clean.confidence
