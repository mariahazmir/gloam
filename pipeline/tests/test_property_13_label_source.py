"""Property 13 for score_segment. Validates: Requirements 6.2, 6.3, 6.4, 6.5, 6.7, 10.4."""

from hypothesis import given, settings, strategies as st

from gloam_pipeline.config import PipelineConfig
from gloam_pipeline.features import ScaledCounts
from gloam_pipeline.scoring import score_segment

# Feature: gloam-data-pipeline, Property 13: Label source, tagged values and estimated confidence are consistent

unit = st.floats(0.0, 1.0, allow_nan=False, allow_infinity=False)


@st.composite
def configs(draw):
    return PipelineConfig(
        high_value=draw(st.floats(0.5, 1.0)),
        low_value=draw(st.floats(0.0, 0.49)),
        tagged_confidence=draw(st.floats(0.5, 1.0)),
    )


counts = st.builds(ScaledCounts, unit, unit, unit, unit)


@settings(max_examples=200)
@given(
    cfg=configs(),
    label=st.sampled_from(["tagged_lit", "tagged_unlit", "untagged"]),
    model_prob=unit,
    features=counts,
    missing=st.booleans(),
    shift=unit,
)
def test_label_source_values_and_confidence(cfg, label, model_prob, features, missing, shift):
    s = score_segment(label, model_prob, features, missing, shift, cfg)

    if label == "tagged_lit":
        assert s.label_source == "tagged_lit"
        assert s.lit_probability == cfg.high_value >= cfg.high_value
        assert s.confidence == cfg.tagged_confidence
    elif label == "tagged_unlit":
        assert s.label_source == "tagged_unlit"
        assert s.lit_probability == cfg.low_value
        assert s.confidence == cfg.tagged_confidence
    else:
        assert s.label_source == "estimated"
        assert s.lit_probability == model_prob
        assert 0.0 <= s.confidence < cfg.tagged_confidence
