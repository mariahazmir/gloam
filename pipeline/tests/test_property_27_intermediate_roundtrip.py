"""Property 27: intermediate files round-trip (R9.2).

Each artifact is written with io.write_json, read back with io.read_json and
rebuilt with its *_from_dict function; the result must equal the original.
"""

import tempfile
from pathlib import Path

from hypothesis import given, strategies as st

from gloam_pipeline import io
from gloam_pipeline.artifacts import (
    CityArtifact, CityReport, FeaturesArtifact, ModelArtifact,
    city_from_dict, city_to_dict, features_from_dict, features_to_dict,
    model_from_dict, model_to_dict,
)
from gloam_pipeline.features import LanduseAreas, PointSets, RawFeatures, ScaledCounts
from gloam_pipeline.loader import BuildingFootprint
from gloam_pipeline.segments import Segment

_num = st.floats(-1e6, 1e6, allow_nan=False, allow_infinity=False)
_pos = st.floats(0.0, 1e6, allow_nan=False, allow_infinity=False)
_unit = st.floats(0.0, 1.0, allow_nan=False, allow_infinity=False)
_int = st.integers(0, 10**12)
_text = st.text(max_size=8)
_pt = st.tuples(
    st.floats(-180, 180, allow_nan=False, allow_infinity=False),
    st.floats(-90, 90, allow_nan=False, allow_infinity=False),
)
_pts = st.lists(_pt, max_size=4).map(tuple)
_ring = st.lists(_pt, min_size=3, max_size=5).map(tuple)

_segment = st.builds(
    Segment, osm_id=_int, name=_text, highway=_text, footway=_text,
    coords=st.lists(_pt, min_size=2, max_size=4).map(tuple), length_m=_pos, label=_text,
)
_report = st.builds(
    CityReport,
    counts=st.dictionaries(_text, _int, max_size=4),
    unmatched=_int, duplicates=_int,
    warnings=st.lists(_text, max_size=3).map(tuple),
    skipped_ways=st.lists(st.tuples(st.none() | _int, _text), max_size=3).map(tuple),
    closed_ways=_int,
    unrecognised_lit=st.dictionaries(_text, _int, max_size=3),
)
_cities = st.builds(
    CityArtifact,
    city_name=_text,
    segments=st.lists(_segment, max_size=3).map(tuple),
    points=st.builds(PointSets, bus_stops=_pts, food_places=_pts, shops=_pts, buildings=_pts),
    footprints=st.lists(st.builds(BuildingFootprint, _int, _ring, _text), max_size=3).map(tuple),
    landuse=st.lists(st.tuples(_text, _ring), max_size=3).map(tuple).map(LanduseAreas),
    report=_report,
)

_raw = st.builds(
    RawFeatures, segment_id=_int, highway=_text, footway_kind=_text, length_m=_pos,
    bus_stops=_int, food_places=_int, shops=_int, buildings=_int, landuse=_text,
    missing=st.booleans(),
)
_scaled = st.builds(ScaledCounts, _unit, _unit, _unit, _unit)


@st.composite
def _features(draw):
    n = draw(st.integers(0, 4))
    return FeaturesArtifact(
        feature_distance_m=draw(_pos),
        raw=tuple(draw(st.lists(_raw, min_size=n, max_size=n))),
        scaled=tuple(draw(st.lists(_scaled, min_size=n, max_size=n))),
        length_scaled=tuple(draw(st.lists(_unit, min_size=n, max_size=n))),
        shift=draw(st.none() | _unit),
    )


@st.composite
def _models(draw):
    n = draw(st.integers(0, 4))
    return ModelArtifact(
        feature_names=tuple(draw(st.lists(_text, min_size=n, max_size=n))),
        intercept=draw(_num),
        coefficients=tuple(draw(st.lists(_num, min_size=n, max_size=n))),
        training_cities=tuple(draw(st.lists(_text, max_size=3))),
        held_out_city=draw(st.none() | _text),
        untagged_weight=draw(_unit),
        seed=draw(_int),
        highway_rates=draw(st.dictionaries(_text, _unit, max_size=3)),
        pair_rates=draw(st.dictionaries(_text, st.dictionaries(_text, _unit, max_size=3), max_size=3)),
        overall_lit_rate=draw(_unit),
        unseen_highway_types=draw(_int),
        # lists, not tuples: model_from_dict returns lists
        training_histograms=draw(st.dictionaries(_text, st.lists(_unit, max_size=4), max_size=3)),
    )


def _round_trip(obj, to_dict, from_dict):
    with tempfile.TemporaryDirectory() as tmp:
        path = Path(tmp) / "nested" / "artifact.json"
        io.write_json(path, to_dict(obj))
        return from_dict(io.read_json(path))


# Feature: gloam-data-pipeline, Property 27: Intermediate files round-trip
# **Validates: Requirements 9.2**
@given(city=_cities, features=_features(), model=_models())
def test_intermediate_files_round_trip(city, features, model):
    assert _round_trip(city, city_to_dict, city_from_dict) == city
    assert _round_trip(features, features_to_dict, features_from_dict) == features
    assert _round_trip(model, model_to_dict, model_from_dict) == model
