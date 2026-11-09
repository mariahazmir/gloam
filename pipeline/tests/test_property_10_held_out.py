"""Property 10: the held-out city does not influence the model."""

from hypothesis import HealthCheck, given, settings
from hypothesis import strategies as st

from gloam_pipeline.model import LABELS, TrainingRow, fit

FEATURES = ["f0", "f1"]
HIGHWAYS = ["residential", "primary", "service", "footway"]
HELD_OUT = "zeta"

_value = st.floats(min_value=-5, max_value=5, allow_nan=False, allow_infinity=False)
_vector = st.tuples(_value, _value)


def _hist(seed: int) -> dict:
    return {
        "bus_stops": [seed, 1, 2, 3, 4],
        "food_places": [1, seed, 2, 3, 4],
        "shops": [1, 2, seed, 3, 4],
        "buildings": [1, 2, 3, seed, 4],
    }


@st.composite
def _training_rows(draw):
    """Rows for two training cities; always has a tagged_lit and a target-0 row."""
    rows = [
        TrainingRow("alpha", 0, "primary", "tagged_lit", draw(_vector)),
        TrainingRow("alpha", 1, "service", "untagged", draw(_vector)),
    ]
    for city in ("alpha", "beta"):
        n = draw(st.integers(0, 4))
        for i in range(n):
            rows.append(
                TrainingRow(
                    city,
                    100 + i,
                    draw(st.sampled_from(HIGHWAYS)),
                    draw(st.sampled_from(LABELS)),
                    draw(_vector),
                )
            )
    rows.append(TrainingRow("beta", 0, "residential", "tagged_unlit", draw(_vector)))
    return rows


@st.composite
def _held_out_rows(draw):
    n = draw(st.integers(1, 5))
    return [
        TrainingRow(
            HELD_OUT,
            i,
            draw(st.sampled_from(HIGHWAYS + ["motorway", "path"])),
            draw(st.sampled_from(LABELS)),
            draw(_vector),
        )
        for i in range(n)
    ]


# Feature: gloam-data-pipeline, Property 10: The held-out city does not influence the model
# **Validates: Requirements 4.3, 5.8**
@settings(max_examples=100, deadline=None, suppress_health_check=[HealthCheck.too_slow])
@given(
    train=_training_rows(),
    held_a=_held_out_rows(),
    held_b=_held_out_rows(),
    hist_a=st.integers(0, 50),
    hist_b=st.integers(0, 50),
)
def test_held_out_city_does_not_influence_model(train, held_a, held_b, hist_a, hist_b):
    base_hist = {"alpha": _hist(5), "beta": _hist(7)}
    model_a, _ = fit(
        train + held_a, FEATURES, {**base_hist, HELD_OUT: _hist(hist_a)}, held_out_city=HELD_OUT
    )
    model_b, _ = fit(
        train + held_b, FEATURES, {**base_hist, HELD_OUT: _hist(hist_b)}, held_out_city=HELD_OUT
    )

    for key in (
        "coefficients",
        "intercept",
        "highway_rates",
        "overall_lit_rate",
        "training_histograms",
    ):
        assert model_a[key] == model_b[key], key
    assert model_a == model_b
    assert HELD_OUT not in model_a["training_cities"]
    assert HELD_OUT not in model_b["training_cities"]
