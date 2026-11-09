"""Shared Hypothesis strategies."""

from hypothesis import strategies as st

from gloam_pipeline.features import FOOTWAY_ORDER

FOOTWAY_KINDS = st.sampled_from(FOOTWAY_ORDER)
NON_FINITE = st.sampled_from([float("nan"), float("inf"), float("-inf")])


def invalid_number(lo: float, hi: float, lo_open: bool = False, hi_open: bool = False):
    """A value that check_range(lo, hi, lo_open, hi_open) must reject.

    Mixes NaN, +/-inf, values below lo, values above hi, and (for open
    bounds) the bound itself.
    """
    below = st.floats(lo - 1e6, lo, exclude_max=True, allow_nan=False, allow_infinity=False)
    above = st.floats(hi, hi + 1e6, exclude_min=True, allow_nan=False, allow_infinity=False)
    options = [NON_FINITE, below, above]
    if lo_open:
        options.append(st.just(lo))
    if hi_open:
        options.append(st.just(hi))
    return st.one_of(*options)


def invalid_city_name():
    """A city name check_text_length(1, 100) must reject: empty, whitespace-only or too long."""
    return st.one_of(
        st.just(""),
        st.text(alphabet=" \t\n\r", min_size=1, max_size=100),
        st.integers(101, 150).map(lambda n: "a" * n),
    )


def invalid_path_list():
    """A path list that is empty or has more than 50 entries."""
    return st.one_of(
        st.just([]),
        st.integers(51, 60).map(lambda n: [f"f{i}.geojson" for i in range(n)]),
    )
