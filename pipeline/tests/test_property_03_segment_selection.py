"""Property 3 for build_segments. Validates: Requirements 2.1, 2.2, 2.7, 2.8, 2.9."""

from collections import Counter

from hypothesis import given, strategies as st

from gloam_pipeline.segments import build_segments

# Feature: gloam-data-pipeline, Property 3: Segment building selects exactly the walkable ways and labels all of them

LISTED = [
    "primary", "secondary", "tertiary", "unclassified", "residential",
    "living_street", "service", "pedestrian", "footway", "path", "cycleway",
    "track", "steps", "primary_link", "secondary_link", "tertiary_link",
]
EXCLUDED = ["motorway", "motorway_link", "trunk", "trunk_link"]
UNLISTED = ["bus_stop", "proposed", "construction", "Residential", ""]
MISSING = object()

highways = st.one_of(
    st.sampled_from(LISTED),
    st.sampled_from(EXCLUDED),
    st.sampled_from(UNLISTED),
    st.text(max_size=8),  # arbitrary strings; membership in LISTED decides selection
    st.just(MISSING),
)
LIT_EXPECTED = {"yes": "tagged_lit", "24/7": "tagged_lit", "automatic": "tagged_lit",
                "dusk-dawn": "tagged_lit", "no": "tagged_unlit"}
OTHER_LIT = ["Yes", "NO", "yes ", " no", "none", "limited", "sunset-sunrise", "", "disused", "6", "yes;no", "opposite"]  # "opposite" is a real Berlin value
lits = st.one_of(
    st.sampled_from(sorted(LIT_EXPECTED)),
    st.sampled_from(OTHER_LIT),
    st.text(max_size=6),  # arbitrary strings; expected labels are derived from LIT_EXPECTED
    st.just(MISSING),
)
coord = st.tuples(
    st.integers(-1000, 1000).map(lambda n: n / 10.0),
    st.integers(-800, 800).map(lambda n: n / 10.0),
)
lines = st.lists(coord, min_size=2, max_size=6, unique=True)


@st.composite
def way_lists(draw):
    specs = draw(st.lists(st.tuples(highways, lits, lines), max_size=25))
    features = []
    for i, (hw, lit, line) in enumerate(specs):
        props = {}
        if hw is not MISSING:
            props["highway"] = hw
        if lit is not MISSING:
            props["lit"] = lit
        features.append({
            "type": "Feature",
            "id": f"way/{i + 1}",
            "properties": props,
            "geometry": {"type": "LineString", "coordinates": [list(p) for p in line]},
        })
    return specs, features


@given(way_lists())
def test_selects_walkable_ways_and_labels_all(data):
    specs, features = data
    result = build_segments(features)

    expected = {i + 1: (hw, lit) for i, (hw, lit, _) in enumerate(specs) if hw in LISTED}
    assert [s.osm_id for s in result.segments] == sorted(expected)  # one each, none excluded

    exp_unrecognised = Counter()
    for seg in result.segments:
        hw, lit = expected[seg.osm_id]
        assert seg.highway == hw
        if lit is MISSING:
            want = "untagged"
        elif lit in LIT_EXPECTED:
            want = LIT_EXPECTED[lit]
        else:
            want = "untagged"
            exp_unrecognised[lit] += 1
        assert seg.label == want

    assert result.unrecognised_lit == dict(exp_unrecognised)
    counts = Counter(s.label for s in result.segments)
    assert (counts["untagged"] + counts["tagged_lit"] + counts["tagged_unlit"]
            == len(result.segments) == len(expected))
    assert result.skipped_ways == ()


def test_examples():
    feats = [
        {"id": "way/1", "properties": {"highway": "motorway", "lit": "yes"},
         "geometry": {"type": "LineString", "coordinates": [[0, 0], [1, 1]]}},
        {"id": "way/2", "properties": {"highway": "footway", "lit": "limited"},
         "geometry": {"type": "LineString", "coordinates": [[0, 0], [1, 1]]}},
        {"id": "way/3", "properties": {"highway": "path", "lit": "no"},
         "geometry": {"type": "LineString", "coordinates": [[0, 0], [1, 1]]}},
    ]
    r = build_segments(feats)
    assert [(s.osm_id, s.label) for s in r.segments] == [(2, "untagged"), (3, "tagged_unlit")]
    assert r.unrecognised_lit == {"limited": 1}


def test_lit_opposite_is_untagged_and_counted_once():
    feat = {"id": "way/7", "properties": {"highway": "residential", "lit": "opposite"},
            "geometry": {"type": "LineString", "coordinates": [[0, 0], [1, 1]]}}
    r = build_segments([feat])
    assert [(s.osm_id, s.label) for s in r.segments] == [(7, "untagged")]
    assert r.unrecognised_lit == {"opposite": 1}
