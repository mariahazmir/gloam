"""Property 4 for build_segments. Validates: Requirements 2.4, 2.5, 2.6."""

import math

from hypothesis import given, strategies as st

from gloam_pipeline.segments import build_segments

# Feature: gloam-data-pipeline, Property 4: Lengths are valid and degenerate or closed ways are handled

coord = st.tuples(
    st.integers(-1000, 1000).map(lambda n: n / 10.0),
    st.integers(-800, 800).map(lambda n: n / 10.0),
)
distinct = st.lists(coord, min_size=2, max_size=6, unique=True)
point = st.lists(coord, min_size=1, max_size=1)

UNRESOLVABLE = [
    None,
    {"type": "Point", "coordinates": [0, 0]},
    {"type": "LineString", "coordinates": None},
    {"type": "LineString", "coordinates": [[0, 0], [float("nan"), 1]]},
    {"type": "LineString", "coordinates": [[0, 0], [float("inf"), 1]]},
    {"type": "LineString", "coordinates": [[0, 0], [500, 1]]},
    {"type": "LineString", "coordinates": [[0, 0], ["x", 1]]},
]

kinds = st.sampled_from(
    ["open", "closed_line", "closed_polygon", "empty", "single", "repeated", "unresolvable"]
)


def _geometry(kind, pts, bad):
    if kind == "open":
        return "LineString", pts
    if kind == "closed_line":
        return "LineString", pts + [pts[0]]
    if kind == "closed_polygon":
        return "Polygon", [pts + [pts[0]]]
    if kind == "empty":
        return "LineString", []
    if kind == "single":
        return "LineString", pts[:1]
    if kind == "repeated":
        return "LineString", [pts[0]] * 3
    return None, bad


@st.composite
def way_lists(draw):
    specs = draw(st.lists(st.tuples(kinds, distinct, st.sampled_from(UNRESOLVABLE)), max_size=20))
    features = []
    for i, (kind, pts, bad) in enumerate(specs):
        pts = [list(p) for p in pts]
        gtype, coords = _geometry(kind, pts, bad)
        geometry = bad if gtype is None else {"type": gtype, "coordinates": coords}
        features.append({
            "type": "Feature",
            "id": f"way/{i + 1}",
            "properties": {"highway": "residential"},
            "geometry": geometry,
        })
    return specs, features


@given(way_lists())
def test_lengths_valid_and_degenerate_or_closed_ways_handled(data):
    specs, features = data
    result = build_segments(features)

    valid = {i + 1: kind for i, (kind, _, _) in enumerate(specs)
             if kind in ("open", "closed_line", "closed_polygon")}
    closed_ids = {i for i, k in valid.items() if k != "open"}

    # Valid ways are all processed, in order, exactly one segment each (R2.6 and others still processed).
    assert [s.osm_id for s in result.segments] == sorted(valid)
    for seg in result.segments:
        assert math.isfinite(seg.length_m) and seg.length_m >= 0  # R2.4
        if seg.osm_id in closed_ids:
            assert seg.coords[0] == seg.coords[-1]  # closing point kept (R2.6)
            assert len(seg.coords) >= 3 or len(set(seg.coords)) == 2

    assert result.closed_ways == len(closed_ids)  # R2.6

    # Degenerate and unresolvable ways are skipped with a reason (R2.5).
    skipped_expected = sorted(i + 1 for i, (k, _, _) in enumerate(specs) if k not in
                              ("open", "closed_line", "closed_polygon"))
    assert sorted(w for w, _ in result.skipped_ways) == skipped_expected
    assert all(isinstance(reason, str) and reason for _, reason in result.skipped_ways)


def test_closed_polygon_keeps_closing_point():
    ring = [[0, 0], [0, 1], [1, 1], [0, 0]]
    feat = {"id": "way/1", "properties": {"highway": "footway"},
            "geometry": {"type": "Polygon", "coordinates": [ring]}}
    r = build_segments([feat])
    assert len(r.segments) == 1 and r.closed_ways == 1
    assert r.segments[0].coords[0] == r.segments[0].coords[-1] and len(r.segments[0].coords) == 4
