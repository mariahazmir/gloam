"""Property 9: Training is reproducible (Validates R5.7)."""

import random

from hypothesis import HealthCheck, given, settings
from hypothesis import strategies as st

from gloam_pipeline.model import TrainingRow, fit, predict
from strategies import FOOTWAY_KINDS

HIGHWAYS = ["residential", "primary", "footway", "service"]
CITIES = ["city_a", "city_b"]
FEATURE_NAMES = ["f0", "f1", "f2"]
_HIST = {f: [1, 1, 1, 1, 1] for f in ("bus_stops", "food_places", "shops", "buildings")}
HISTOGRAMS = {c: _HIST for c in CITIES}


@st.composite
def training_sets(draw):
    """Tens of rows over 2 cities, unique segment ids, >=1 tagged_lit and >=1 target-0 row."""
    n = draw(st.integers(min_value=10, max_value=40))
    n_features = draw(st.integers(min_value=1, max_value=3))
    labels = draw(st.lists(st.sampled_from(["tagged_lit", "tagged_unlit", "untagged"]),
                           min_size=n, max_size=n))
    labels[0] = "tagged_lit"
    labels[1] = draw(st.sampled_from(["tagged_unlit", "untagged"]))
    cities = draw(st.lists(st.sampled_from(CITIES), min_size=n, max_size=n))
    cities[0], cities[1] = CITIES[0], CITIES[1]  # both cities present
    value = st.floats(min_value=-3.0, max_value=3.0, allow_nan=False, allow_infinity=False)
    rows = [
        TrainingRow(
            city_id=cities[i],
            segment_id=i,
            highway=draw(st.sampled_from(HIGHWAYS)),
            footway_kind=draw(FOOTWAY_KINDS),
            label=labels[i],
            vector=tuple(draw(st.lists(value, min_size=n_features, max_size=n_features))),
        )
        for i in range(n)
    ]
    return rows, FEATURE_NAMES[:n_features]


def _predictions(rows, names, seed):
    model, _ = fit(rows, names, HISTOGRAMS, untagged_weight=0.2, seed=seed)
    ordered = sorted(rows, key=lambda r: (r.city_id, r.segment_id))
    return predict(model, [r.vector for r in ordered]), ordered


# Feature: gloam-data-pipeline, Property 9: Training is reproducible
@settings(deadline=None, suppress_health_check=[HealthCheck.too_slow])
@given(data=training_sets(), seed=st.integers(min_value=0, max_value=2**31 - 1),
       shuffle_seed=st.integers(min_value=0, max_value=2**31 - 1))
def test_training_is_reproducible(data, seed, shuffle_seed):
    rows, names = data
    first, ordered = _predictions(rows, names, seed)
    second, _ = _predictions(rows, names, seed)

    shuffled = list(rows)
    random.Random(shuffle_seed).shuffle(shuffled)
    third, ordered_shuffled = _predictions(shuffled, names, seed)

    assert [(r.city_id, r.segment_id) for r in ordered] == [
        (r.city_id, r.segment_id) for r in ordered_shuffled
    ]
    for a, b, c in zip(first, second, third):
        assert abs(a - b) < 1e-6
        assert abs(a - c) < 1e-6
