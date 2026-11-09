"""Unit tests for gloam_pipeline.features (R3.1, R3.2, R3.3, R3.6, R3.7)."""

import math

import pytest

from gloam_pipeline.errors import InvalidArgumentError
from gloam_pipeline.features import (
    LanduseAreas,
    PointSets,
    raw_features,
    scale_counts,
    scale_length,
)
from gloam_pipeline.segments import Segment

# One degree of latitude is about 111 km, so 0.00045 deg is about 50 m and
# 0.0018 deg is about 200 m. Every point below sits well clear of the 100 m
# threshold, so the small error of the local projection cannot flip a count.
# The street runs east along the equator from lon 0 to 0.002 (about 222 m).
STREET = Segment(
    osm_id=1, name="Test St", highway="residential", footway="sidewalk",
    coords=((0.0, 0.0), (0.002, 0.0)), length_m=222.0, label="untagged",
)
DIST = 100


def _street(**kw):
    return Segment(**{**STREET.__dict__, **kw})


def test_counts_at_known_distances():
    points = PointSets(
        # 50 m north of the middle (in); 55 m past the east end (in)
        bus_stops=((0.001, 0.00045), (0.0025, 0.0)),
        # 50 m south (in); 200 m north (out)
        food_places=((0.0005, -0.00045), (0.001, 0.0018)),
        # 222 m past the east end (out)
        shops=((0.004, 0.0),),
        # three within 50 m, one 200 m south (out)
        buildings=((0.0, 0.00045), (0.001, 0.0), (0.002, -0.00045), (0.001, -0.0018)),
    )
    (r,) = raw_features([STREET], points, LanduseAreas(), DIST)
    assert (r.bus_stops, r.food_places, r.shops, r.buildings) == (2, 1, 0, 3)
    assert r.highway == "residential" and r.footway_kind == "sidewalk"
    assert r.length_m == 222.0
    assert r.missing is False


def test_larger_distance_includes_more():
    points = PointSets(food_places=((0.001, 0.0018),))  # about 200 m away
    (near,) = raw_features([STREET], points, LanduseAreas(), 100)
    (far,) = raw_features([STREET], points, LanduseAreas(), 300)
    assert (near.food_places, far.food_places) == (0, 1)


def test_landuse_midpoint_lookup():
    square = lambda lo, hi: ((lo, -0.001), (hi, -0.001), (hi, 0.001), (lo, 0.001), (lo, -0.001))
    areas = LanduseAreas(areas=(
        ("residential", square(0.01, 0.02)),   # far away, does not hold the midpoint
        ("retail", square(0.0009, 0.0011)),    # holds the midpoint (lon 0.001)
        ("industrial", square(-0.01, 0.01)),   # also holds it, but comes later
    ))
    (r,) = raw_features([STREET], PointSets(), areas, DIST)
    assert r.landuse == "retail"


def test_landuse_unnamed_class_is_other_and_no_polygon_is_none():
    ring = ((-0.01, -0.01), (0.01, -0.01), (0.01, 0.01), (-0.01, 0.01), (-0.01, -0.01))
    (other,) = raw_features([STREET], PointSets(), LanduseAreas(areas=(("farmland", ring),)), DIST)
    (none,) = raw_features([STREET], PointSets(), LanduseAreas(), DIST)
    assert other.landuse == "other"
    assert none.landuse == "none"


def test_landuse_uses_midpoint_not_ends():
    # Covers only the west end (lon 0 to 0.0004); the midpoint is at lon 0.001.
    ring = ((-0.001, -0.001), (0.0004, -0.001), (0.0004, 0.001), (-0.001, 0.001), (-0.001, -0.001))
    (r,) = raw_features([STREET], PointSets(), LanduseAreas(areas=(("commercial", ring),)), DIST)
    assert r.landuse == "none"


@pytest.mark.parametrize(
    "bad",
    [
        _street(coords=((0.0, 0.0),)),            # one point only
        _street(length_m=float("nan")),           # unusable length
    ],
)
def test_missing_feature_defaults(bad):
    points = PointSets(bus_stops=((0.001, 0.0),))
    ring = ((-0.01, -0.01), (0.01, -0.01), (0.01, 0.01), (-0.01, 0.01), (-0.01, -0.01))
    areas = LanduseAreas(areas=(("commercial", ring),))
    (r,) = raw_features([bad], points, areas, DIST)
    assert r.missing is True
    assert (r.bus_stops, r.food_places, r.shops, r.buildings) == (0, 0, 0, 0)
    assert r.landuse == "none"
    assert r.footway_kind == "none"
    assert r.length_m == 0.0
    assert r.segment_id == bad.osm_id


def test_output_sorted_by_segment_id():
    a = _street(osm_id=7)
    b = _street(osm_id=3)
    out = raw_features([a, b], PointSets(), LanduseAreas(), DIST)
    assert [r.segment_id for r in out] == [3, 7]


# --- Scaling (R3.3, R3.6) ------------------------------------------------------


def test_scale_counts_p95_by_hand():
    # sorted [0,2,4]: position 0.95 * 2 = 1.9, so p95 = 2 + 0.9 * (4 - 2) = 3.8
    out = scale_counts([0, 2, 4])
    assert out == pytest.approx([0.0, 2 / 3.8, 1.0], abs=1e-9)
    assert [round(x, 3) for x in out] == [0.0, 0.526, 1.0]


def test_scale_counts_single_distinct_value_gives_zeros():
    assert scale_counts([3, 3]) == [0.0, 0.0]


def test_scale_counts_p95_zero_gives_zeros():
    # Twenty zeros and one 9: position 0.95 * 20 = 19 is still a zero, so p95 = 0.
    assert scale_counts([0] * 20 + [9]) == [0.0] * 21


def test_scale_length_min_max_and_constant():
    assert scale_length([10.0, 20.0, 30.0]) == pytest.approx([0.0, 0.5, 1.0])
    assert scale_length([5.0, 5.0]) == [0.0, 0.0]


# --- Validation (R3.1) ---------------------------------------------------------


@pytest.mark.parametrize("bad", [float("nan"), float("inf"), 5, 2000])
def test_invalid_feature_distance_rejected(bad):
    with pytest.raises(InvalidArgumentError) as exc:
        raw_features([STREET], PointSets(), LanduseAreas(), bad)
    assert "feature_distance_m" in str(exc.value)
    assert exc.value.argument == "feature_distance_m"
    assert "10 to 1000" in exc.value.allowed
    assert "10 to 1000" in str(exc.value)
    assert not math.isfinite(bad) or bad in (5, 2000)
