"""Property 6 for raw_features. Validates: Requirements 3.5, 10.2."""

from hypothesis import given, strategies as st

from gloam_pipeline.features import (
    LanduseAreas,
    PointSets,
    raw_features,
    scale_counts,
    to_vector,
    ScaledCounts,
)
from gloam_pipeline.segments import Segment

# Feature: gloam-data-pipeline, Property 6: Features do not depend on input order or other cities

HIGHWAYS = ["residential", "primary", "footway", "service", "path"]
FOOTWAYS = ["sidewalk", "crossing", "", "track_side"]
LANDUSES = ["residential", "commercial", "retail", "industrial", "farmland"]

# Small area so nearby points actually land within the feature distance.
_lon = st.floats(10.0, 10.01, allow_nan=False)
_lat = st.floats(50.0, 50.01, allow_nan=False)
_pt = st.tuples(_lon, _lat)


@st.composite
def cities(draw):
    n = draw(st.integers(0, 8))
    ids = draw(st.lists(st.integers(1, 10_000), min_size=n, max_size=n, unique=True))
    segs = []
    for i in ids:
        coords = tuple(draw(st.lists(_pt, min_size=2, max_size=4)))
        segs.append(Segment(i, "", draw(st.sampled_from(HIGHWAYS)),
                            draw(st.sampled_from(FOOTWAYS)), coords,
                            draw(st.floats(0, 500, allow_nan=False)), "untagged"))
    plist = st.lists(_pt, max_size=8).map(tuple)
    points = PointSets(draw(plist), draw(plist), draw(plist), draw(plist))
    rings = st.tuples(
        st.sampled_from(LANDUSES),
        st.lists(_pt, min_size=3, max_size=5).map(tuple),
    )
    areas = LanduseAreas(tuple(draw(st.lists(rings, max_size=3))))
    dist = draw(st.floats(10, 1000, allow_nan=False))
    return segs, points, areas, dist


def _vectors(raws):
    cols = [scale_counts([getattr(r, k) for r in raws], [r.missing for r in raws])
            for k in ("bus_stops", "food_places", "shops", "buildings")]
    return {r.segment_id: to_vector(r, ScaledCounts(*(c[i] for c in cols)), 0.0)
            for i, r in enumerate(raws)}


@given(cities(), cities(), st.randoms(use_true_random=False))
def test_features_ignore_order_and_other_cities(city_a, city_b, rnd):
    segs, points, areas, dist = city_a
    baseline = {r.segment_id: r for r in raw_features(segs, points, areas, dist)}

    # (a) Any permutation of the segment list gives identical features per id.
    shuffled = list(segs)
    rnd.shuffle(shuffled)
    permuted = {r.segment_id: r for r in raw_features(shuffled, points, areas, dist)}
    assert permuted == baseline

    # (b) Another city's data being processed or present changes nothing.
    b_segs, b_points, b_areas, b_dist = city_b
    raw_features(b_segs, b_points, b_areas, b_dist)
    after_b = {r.segment_id: r for r in raw_features(segs, points, areas, dist)}
    assert after_b == baseline

    # Model vectors for city A are likewise unchanged.
    assert _vectors(list(after_b.values())) == _vectors(list(baseline.values()))
