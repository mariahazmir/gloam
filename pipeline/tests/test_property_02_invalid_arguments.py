"""Property 2: invalid arguments are rejected and named.

Validates: Requirements 1.4, 3.3, 5.5, 6.6, 10.8.
"""

import pytest
from hypothesis import given, settings, strategies as st

from gloam_pipeline.config import PipelineConfig
from gloam_pipeline.errors import InvalidArgumentError
from gloam_pipeline.features import LanduseAreas, PointSets, ScaledCounts, raw_features
from gloam_pipeline.io import load_city
from gloam_pipeline.scoring import score_segment

from strategies import invalid_city_name, invalid_number, invalid_path_list

# Feature: gloam-data-pipeline, Property 2: Invalid arguments are rejected and named

_CFG = PipelineConfig()
_EMPTY_POINTS = PointSets((), (), (), ())
_EMPTY_AREAS = LanduseAreas(())


def _score(**over):
    args = dict(
        label="untagged",
        model_prob=0.5,
        features=ScaledCounts(0.5, 0.5, 0.5, 0.5),
        missing=False,
        shift=0.0,
        cfg=_CFG,
    )
    args.update(over)
    return score_segment(**args)


def _count(field):
    idx = ("bus_stops", "food_places", "shops", "buildings").index(field)

    def call(v):
        vals = [0.5] * 4
        vals[idx] = v
        return _score(features=ScaledCounts(*vals))

    return call


# (argument name the error must carry, strategy of invalid values, call under test)
CASES = [
    # Config values (R5.5, R6.6)
    ("feature_distance_m", invalid_number(10, 1000),
     lambda v: PipelineConfig(feature_distance_m=v)),
    ("untagged_weight", invalid_number(0, 1, True, True),
     lambda v: PipelineConfig(untagged_weight=v)),
    ("high_value", invalid_number(0.5, 1), lambda v: PipelineConfig(high_value=v)),
    ("low_value", invalid_number(0, 0.5), lambda v: PipelineConfig(low_value=v)),
    ("tagged_confidence", invalid_number(0.5, 1),
     lambda v: PipelineConfig(tagged_confidence=v)),
    # high <= low: only reachable at 0.5 / 0.5 given the individual ranges
    ("low_value", st.just(0.5),
     lambda v: PipelineConfig(high_value=v, low_value=v)),
    # Loader arguments (R1.4)
    ("paths", invalid_path_list(), lambda v: load_city(v, "Test City")),
    ("city_name", invalid_city_name(), lambda v: load_city(["a.geojson"], v)),
    # Feature distance (R3.3)
    ("feature_distance_m", invalid_number(10, 1000),
     lambda v: raw_features([], _EMPTY_POINTS, _EMPTY_AREAS, v)),
    # Scoring inputs (R6.6, R10.8)
    ("model_prob", invalid_number(0, 1), lambda v: _score(model_prob=v)),
    ("shift", invalid_number(0, 1), lambda v: _score(shift=v)),
    ("features.bus_stops", invalid_number(0, 1), _count("bus_stops")),
    ("features.food_places", invalid_number(0, 1), _count("food_places")),
    ("features.shops", invalid_number(0, 1), _count("shops")),
    ("features.buildings", invalid_number(0, 1), _count("buildings")),
]


@settings(deadline=None)
@given(st.data())
def test_invalid_arguments_rejected_and_named(data):
    name, strategy, call = data.draw(st.sampled_from(CASES))
    value = data.draw(strategy)

    with pytest.raises(InvalidArgumentError) as exc:
        call(value)

    assert exc.value.argument == name
    assert f"'{name}'" in str(exc.value)
