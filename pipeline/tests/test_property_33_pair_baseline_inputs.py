"""Property 33 for the pair baseline. Validates: Requirements 4.10."""

import math

from hypothesis import given, strategies as st

from gloam_pipeline.baselines import highway_footway_rate_baseline, learn_pair_rates
from gloam_pipeline.features import (
    FOOTWAY_ORDER,
    HIGHWAY_ORDER,
    LANDUSE_ORDER,
    RawFeatures,
    footway_kind_of,
)
from gloam_pipeline.segments import Segment

# Feature: gloam-data-pipeline, Property 33: Pair baseline prediction depends only on highway type and footway kind

highways = st.sampled_from(HIGHWAY_ORDER)
kinds = st.sampled_from(FOOTWAY_ORDER)
labels = st.sampled_from(["tagged_lit", "tagged_unlit", "untagged"])
training_rows = st.lists(st.tuples(highways, kinds, labels), max_size=40).filter(
    lambda rows: any(r[2] != "untagged" for r in rows)
)

# Raw footway text of any kind: the two named values, empty, or arbitrary text.
raw_footway = st.one_of(
    st.sampled_from(["sidewalk", "crossing", ""]),
    st.text(max_size=12),
)


def _raw_with_kind(kind: str):
    """Raw footway texts that footway_kind_of maps to `kind`."""
    return raw_footway.filter(lambda t: footway_kind_of(t) == kind)


@st.composite
def same_pair_segments(draw):
    """Two segments with the same highway and mapped kind, different elsewhere."""
    highway = draw(highways)
    kind = draw(kinds)
    segs = []
    for _ in range(2):
        segs.append(
            Segment(
                osm_id=draw(st.integers(0, 10**9)),
                name=draw(st.text(max_size=8)),
                highway=highway,
                footway=draw(_raw_with_kind(kind)),
                coords=((draw(st.floats(-180, 180)), draw(st.floats(-90, 90))),) * 2,
                length_m=draw(st.floats(0, 1e5)),
                label=draw(labels),
            )
        )
    return segs[0], segs[1]


@st.composite
def same_pair_features(draw):
    """Two feature records with the same highway and mapped kind, different elsewhere."""
    highway = draw(highways)
    kind = draw(kinds)
    out = []
    for _ in range(2):
        out.append(
            RawFeatures(
                segment_id=draw(st.integers(0, 10**9)),
                highway=highway,
                footway_kind=footway_kind_of(draw(_raw_with_kind(kind))),
                length_m=draw(st.floats(0, 1e5)),
                bus_stops=draw(st.integers(0, 50)),
                food_places=draw(st.integers(0, 50)),
                shops=draw(st.integers(0, 50)),
                buildings=draw(st.integers(0, 500)),
                landuse=draw(st.sampled_from(LANDUSE_ORDER)),
                missing=draw(st.booleans()),
            )
        )
    return out[0], out[1]


def _valid(prediction):
    return isinstance(prediction, float) and math.isfinite(prediction) and 0.0 <= prediction <= 1.0


@given(training=training_rows, pair=same_pair_segments())
def test_segments_with_same_pair_get_same_prediction(training, pair):
    learned = learn_pair_rates(training)
    a, b = pair
    pa = highway_footway_rate_baseline(learned, a.highway, footway_kind_of(a.footway))
    pb = highway_footway_rate_baseline(learned, b.highway, footway_kind_of(b.footway))
    assert pa == pb
    assert _valid(pa)


@given(training=training_rows, pair=same_pair_features())
def test_feature_records_with_same_pair_get_same_prediction(training, pair):
    learned = learn_pair_rates(training)
    a, b = pair
    pa = highway_footway_rate_baseline(learned, a.highway, a.footway_kind)
    pb = highway_footway_rate_baseline(learned, b.highway, b.footway_kind)
    assert pa == pb
    assert _valid(pa)
