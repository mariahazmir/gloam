import math

import pytest

from gloam_pipeline.errors import InvalidArgumentError
from gloam_pipeline.geometry import (
    GridIndex,
    Projector,
    point_in_polygon,
    point_polyline_distance_m,
    polyline_length_m,
)


def test_projector_latitude_degree():
    # 0.001 deg * pi/180 * 6371008.8 m = 111.195 m
    x, y = Projector(0.0, 0.0).project(0.0, 0.001)
    assert x == 0.0
    assert y == pytest.approx(111.195, abs=0.01)


def test_projector_longitude_shrinks_with_latitude():
    # cos(60 deg) = 0.5, so 0.001 deg of longitude is half of 111.195 m
    x, _ = Projector(60.0, 0.0).project(0.001, 60.0)
    assert x == pytest.approx(55.597, abs=0.01)


def test_polyline_length_two_segments():
    # two steps of 0.001 deg latitude near the equator
    assert polyline_length_m([(0, 0), (0, 0.001), (0, 0.002)]) == pytest.approx(222.39, abs=0.05)
    assert polyline_length_m([(0, 0)]) == 0.0


def test_point_polyline_distance():
    line = [(0, 0), (10, 0)]
    assert point_polyline_distance_m((5, 3), line) == 3.0
    assert point_polyline_distance_m((13, 4), line) == 5.0  # nearest is endpoint (10, 0)


def test_point_in_polygon_square():
    ring = [(0, 0), (4, 0), (4, 4), (0, 4), (0, 0)]
    assert point_in_polygon((2, 2), ring)
    assert not point_in_polygon((5, 2), ring)


def test_grid_index_within():
    idx = GridIndex([(0, 0, "a"), (50, 0, "b"), (150, 0, "c")], 100)
    assert sorted(idx.within(0, 0)) == ["a", "b"]
    assert idx.within(0, 0, 10) == ["a"]


@pytest.mark.parametrize("bad", [math.nan, math.inf, -math.inf])
def test_rejects_non_finite(bad):
    with pytest.raises(InvalidArgumentError, match="coords"):
        polyline_length_m([(0, 0), (bad, 1)])
    with pytest.raises(InvalidArgumentError, match=r"p\[0\]"):
        point_polyline_distance_m((bad, 0), [(0, 0), (1, 1)])
    with pytest.raises(InvalidArgumentError, match="lat0"):
        Projector(bad, 0)
    with pytest.raises(InvalidArgumentError, match="cell_m"):
        GridIndex([], bad)
