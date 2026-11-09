"""Property 25 for build_city_collection. Validates: Requirements 6.12, 8.6."""

from dataclasses import replace

import pytest
from hypothesis import given, strategies as st

from gloam_pipeline.config import PipelineConfig
from gloam_pipeline.errors import DataError
from gloam_pipeline.export import build_city_collection
from gloam_pipeline.scoring import Score
from gloam_pipeline.segments import Segment

from strategies import NON_FINITE, invalid_number

# Feature: gloam-data-pipeline, Property 25: Export rejects invalid values

unit = st.floats(0.0, 1.0, allow_nan=False, allow_infinity=False)
lon = st.floats(-180, 180, allow_nan=False, allow_infinity=False)
lat = st.floats(-90, 90, allow_nan=False, allow_infinity=False)
point = st.tuples(lon, lat)


@st.composite
def valid_batches(draw):
    ids = draw(st.lists(st.integers(1, 10**9), min_size=1, max_size=6, unique=True))
    segments, scores = [], []
    for sid in ids:
        coords = tuple(draw(st.lists(point, min_size=2, max_size=5)))
        segments.append(Segment(sid, "n", "residential", "", coords, 10.0, "untagged"))
        scores.append(
            Score(
                draw(unit),
                draw(unit),
                draw(st.sampled_from(["tagged_lit", "tagged_unlit", "estimated"])),
            )
        )
    return segments, scores


bad_coord_value = st.one_of(
    NON_FINITE,
    st.floats(180.001, 1e6),
    st.floats(-1e6, -180.001),
)

injections = st.sampled_from(
    ["lit_probability", "confidence", "label_source", "coordinates"]
)


@given(
    batch=valid_batches(),
    field=injections,
    bad_score=invalid_number(0.0, 1.0),
    bad_label=st.text().filter(
        lambda s: s not in ("tagged_lit", "tagged_unlit", "estimated")
    ),
    bad_coord=bad_coord_value,
    axis=st.integers(0, 1),
    data=st.data(),
)
def test_export_rejects_invalid_value(batch, field, bad_score, bad_label, bad_coord, axis, data):
    segments, scores = batch
    segments, scores = list(segments), list(scores)
    i = data.draw(st.integers(0, len(segments) - 1))

    if field in ("lit_probability", "confidence"):
        scores[i] = replace(scores[i], **{field: bad_score})
    elif field == "label_source":
        scores[i] = replace(scores[i], label_source=bad_label)
    else:
        coords = [list(p) for p in segments[i].coords]
        j = data.draw(st.integers(0, len(coords) - 1))
        coords[j][axis] = bad_coord
        segments[i] = replace(segments[i], coords=tuple(tuple(p) for p in coords))

    with pytest.raises(DataError) as exc:
        build_city_collection("Testville", segments, scores, 0.0, PipelineConfig())

    assert exc.value.segment_id == segments[i].osm_id
    assert exc.value.field == field
    assert str(segments[i].osm_id) in str(exc.value)
    assert field in str(exc.value)
