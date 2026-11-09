"""Property 5 for scale_counts. Validates: Requirements 3.6."""

from hypothesis import given, strategies as st

from gloam_pipeline.features import scale_counts

# Feature: gloam-data-pipeline, Property 5: Percentile-capped scaling stays in range and is monotone


@st.composite
def counts_and_flags(draw):
    n = draw(st.integers(0, 40))
    values = draw(st.lists(st.integers(0, 10_000), min_size=n, max_size=n))
    flags = draw(st.lists(st.booleans(), min_size=n, max_size=n))
    return values, flags


@given(counts_and_flags())
def test_scaling_in_range_monotone_and_missing_zero(data):
    values, flags = data
    scaled = scale_counts(values, flags)

    assert len(scaled) == len(values)
    # Every scaled value is in [0, 1].
    assert all(0.0 <= s <= 1.0 for s in scaled)
    # Missing-flagged entries get 0.0.
    assert all(s == 0.0 for s, m in zip(scaled, flags) if m)
    # A higher raw count never gives a lower scaled value (non-missing entries).
    kept = [(c, s) for c, s, m in zip(values, scaled, flags) if not m]
    for c1, s1 in kept:
        for c2, s2 in kept:
            if c1 > c2:
                assert s1 >= s2
