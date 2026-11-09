"""Property 26 for building heights. Validates: Requirement 8.4."""

import math

from hypothesis import given, strategies as st

from gloam_pipeline.config import PipelineConfig
from gloam_pipeline.export import build_buildings_collection, building_height_m
from gloam_pipeline.loader import BuildingFootprint

# Feature: gloam-data-pipeline, Property 26: Building height uses a valid tag or the default

RING = ((0.0, 0.0), (1.0, 0.0), (1.0, 1.0), (0.0, 0.0))

defaults = st.floats(min_value=0.1, max_value=500, allow_nan=False, allow_infinity=False)
good_heights = st.floats(
    min_value=1e-3, max_value=1e4, allow_nan=False, allow_infinity=False
)
suffixes = st.sampled_from(["", "m", " m"])

# Tags that can never be a positive finite height.
bad_numbers = st.one_of(
    st.floats(max_value=0, allow_nan=False, allow_infinity=False).map(repr),
    st.sampled_from(["nan", "inf", "-inf", "NaN", "Infinity", "0", "-0", "0m"]),
)
bad_text = st.text(alphabet="xyzq!@# ", max_size=6)
bad_tags = st.one_of(bad_numbers, bad_text)


@given(good_heights, suffixes, defaults)
def test_valid_height_tag_is_returned(height, suffix, default):
    assert building_height_m({"height": repr(height) + suffix}, default) == height


@given(bad_tags, suffixes, defaults)
def test_invalid_height_tag_gives_default(tag, suffix, default):
    text = tag if tag.endswith("m") else tag + suffix
    assert building_height_m({"height": text}, default) == default


@given(defaults)
def test_missing_or_non_string_height_gives_default(default):
    assert building_height_m({}, default) == default
    assert building_height_m({"height": None}, default) == default
    assert building_height_m({"height": 12}, default) == default


@given(st.lists(st.one_of(good_heights.map(repr), bad_tags, st.just("")), max_size=10), defaults)
def test_buildings_collection_heights_finite_and_positive(tags, default):
    cfg = PipelineConfig(default_building_height_m=default)
    buildings = [BuildingFootprint(i, RING, t) for i, t in enumerate(tags)]
    doc = build_buildings_collection("Testville", buildings, cfg)
    assert len(doc["features"]) == len(tags)
    for feature in doc["features"]:
        h = feature["properties"]["height_m"]
        assert math.isfinite(h) and h > 0
