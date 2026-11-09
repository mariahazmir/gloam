"""Property 24: export and reload preserve segments (R8.1, R8.2, R10.5)."""

import json

from hypothesis import given, strategies as st

from gloam_pipeline.config import PipelineConfig
from gloam_pipeline.export import LABEL_SOURCES, build_city_collection, parse_city_collection
from gloam_pipeline.scoring import Score
from gloam_pipeline.segments import Segment

_coord = st.tuples(
    st.floats(-180, 180, allow_nan=False, allow_infinity=False),
    st.floats(-90, 90, allow_nan=False, allow_infinity=False),
)
_unit = st.floats(0.0, 1.0, allow_nan=False, allow_infinity=False)


@st.composite
def _segment_and_score(draw, osm_id):
    coords = tuple(draw(st.lists(_coord, min_size=2, max_size=4)))
    seg = Segment(
        osm_id=osm_id,
        name=draw(st.text(max_size=10)),
        highway=draw(st.sampled_from(["residential", "footway", "primary"])),
        footway="",
        coords=coords,
        length_m=1.0,
        label="untagged",
    )
    score = Score(draw(_unit), draw(_unit), draw(st.sampled_from(LABEL_SOURCES)))
    return seg, score


@st.composite
def _cities(draw):
    ids = draw(st.lists(st.integers(1, 10**12), max_size=1000, unique=True))
    return [draw(_segment_and_score(i)) for i in ids]


# Feature: gloam-data-pipeline, Property 24: Export and reload preserve segments within rounding
# **Validates: Requirements 8.1, 8.2, 10.5**
@given(city=_cities(), via_json=st.booleans(), shift=_unit)
def test_export_reload_preserves_segments(city, via_json, shift):
    segments = [s for s, _ in city]
    scores = [sc for _, sc in city]
    doc = build_city_collection("Testville", segments, scores, shift, PipelineConfig())
    if via_json:
        doc = json.loads(json.dumps(doc))
    loaded = parse_city_collection(doc)

    assert {e.id for e in loaded} == {s.osm_id for s in segments}
    assert len(loaded) == len(segments)
    for seg, score, e in zip(segments, scores, loaded):
        assert e.id == seg.osm_id
        assert abs(e.lit_probability - score.lit_probability) <= 0.001
        assert abs(e.confidence - score.confidence) <= 0.001
        assert e.label_source == score.label_source
        assert e.coords == tuple((round(lo, 6), round(la, 6)) for lo, la in seg.coords)
