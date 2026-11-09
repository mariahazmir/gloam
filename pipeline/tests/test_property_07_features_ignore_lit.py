"""Property 7: features ignore the lit tag. Validates: Requirements 3.4, 10.3."""

from dataclasses import replace

from hypothesis import given, settings, strategies as st

from gloam_pipeline.features import (
    HIGHWAY_ORDER,
    LanduseAreas,
    PointSets,
    ScaledCounts,
    raw_features,
    scale_counts,
    scale_length,
    to_vector,
)
from gloam_pipeline.segments import Segment

# Feature: gloam-data-pipeline, Property 7: Features ignore the lit tag

LABELS = ("tagged_lit", "tagged_unlit", "untagged")

# Small area near a fixed origin so points and segments interact.
lon_st = st.floats(101.690, 101.692, allow_nan=False, allow_infinity=False)
lat_st = st.floats(3.150, 3.152, allow_nan=False, allow_infinity=False)
point_st = st.tuples(lon_st, lat_st)


@st.composite
def segment_st(draw, osm_id):
    coords = tuple(draw(st.lists(point_st, min_size=2, max_size=5, unique=True)))
    return Segment(
        osm_id=osm_id,
        name="",
        highway=draw(st.sampled_from(HIGHWAY_ORDER)),
        footway=draw(st.sampled_from(("sidewalk", "crossing", "", "track_side"))),
        coords=coords,
        length_m=draw(st.floats(1, 500, allow_nan=False, allow_infinity=False)),
        label=draw(st.sampled_from(LABELS)),
    )


@st.composite
def scenario(draw):
    n = draw(st.integers(1, 6))
    segs = [draw(segment_st(i + 1)) for i in range(n)]
    pts = PointSets(*[tuple(draw(st.lists(point_st, max_size=8))) for _ in range(4)])
    ring = tuple(draw(st.lists(point_st, min_size=3, max_size=6)))
    value = draw(st.sampled_from(("residential", "commercial", "retail", "industrial", "park")))
    relabels = [draw(st.sampled_from(LABELS)) for _ in segs]
    dist = draw(st.floats(10, 1000, allow_nan=False, allow_infinity=False))
    return segs, pts, LanduseAreas(((value, ring),)), relabels, dist


def _pipeline(segs, pts, areas, dist):
    raws = raw_features(segs, pts, areas, dist)
    miss = [r.missing for r in raws]
    sc = [scale_counts([getattr(r, k) for r in raws], miss)
          for k in ("bus_stops", "food_places", "shops", "buildings")]
    ls = scale_length([r.length_m for r in raws], miss)
    scaled = [ScaledCounts(sc[0][i], sc[1][i], sc[2][i], sc[3][i]) for i in range(len(raws))]
    vecs = [to_vector(r, s, l) for r, s, l in zip(raws, scaled, ls)]
    return raws, scaled, ls, vecs


@settings(deadline=None)
@given(scenario())
def test_features_identical_when_label_changes(data):
    segs, pts, areas, relabels, dist = data
    relabelled = [replace(s, label=lab) for s, lab in zip(segs, relabels)]

    assert _pipeline(segs, pts, areas, dist) == _pipeline(relabelled, pts, areas, dist)
