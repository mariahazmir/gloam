"""Property 17: scoring is deterministic. Validates: Requirements 6.11."""

from hypothesis import given, settings, strategies as st

from gloam_pipeline.config import PipelineConfig
from gloam_pipeline.features import ScaledCounts
from gloam_pipeline.scoring import LABELS, score_segment

# Feature: gloam-data-pipeline, Property 17: Scoring is deterministic

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
args_st = st.tuples(st.sampled_from(LABELS), unit_st, counts_st, st.booleans(), unit_st)


@settings(max_examples=200, deadline=None)
@given(
    args=args_st,
    cfg=cfg_st,
    others=st.lists(args_st, max_size=5),
    repeats=st.integers(2, 5),
)
def test_scoring_is_deterministic(args, cfg, others, repeats):
    """**Validates: Requirements 6.11**"""
    first = score_segment(*args, cfg)
    results = []
    for i in range(repeats):
        # Interleave unrelated calls (reversed on odd rounds) to expose hidden state.
        for o in others if i % 2 == 0 else reversed(others):
            score_segment(*o, cfg)
        results.append(score_segment(*args, cfg))
    for r in results:
        assert r == first
        assert r.lit_probability == first.lit_probability
        assert r.confidence == first.confidence
        assert r.label_source == first.label_source
