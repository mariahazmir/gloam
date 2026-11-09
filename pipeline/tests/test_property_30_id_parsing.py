"""Property 30 for parse_osm_key. Validates: Requirements 1.2."""

from hypothesis import given, strategies as st

from gloam_pipeline.classify import parse_osm_key

# Feature: gloam-data-pipeline, Property 30: Top-level id wins, with fallback to @id

types = st.sampled_from(["node", "way", "relation"])
ids = st.integers(min_value=0, max_value=10**15)
good_keys = st.tuples(types, ids)
# Values that must not parse: wrong type, non-digit id, no slash, non-strings, missing.
bad_values = st.one_of(
    st.none(),
    st.integers(),
    st.just(""),
    st.just("way/"),
    st.just("way/abc"),
    st.just("way/-5"),
    st.just("way/1.5"),
    st.just("area/12"),
    st.just("way12"),
    st.just("Way/1"),  # element type is case-sensitive
    # Non-ASCII digits: str.isdigit() accepts these, the spec (ASCII digits only) does not.
    st.just("way/\u0661\u0662\u0663"),  # Arabic-Indic 123
    st.just("way/\u0661"),  # Arabic-Indic 1
    st.just("way/\uff11\uff12"),  # fullwidth 12
    st.just("way/\u00b2"),  # superscript two
)

# Extra strings that DO parse, with hand-computed results.
extra_good = st.sampled_from([("way/012", ("way", 12)), ("relation/1", ("relation", 1))])


def fmt(key):
    return f"{key[0]}/{key[1]}"


def build(top, at_id):
    feature = {"type": "Feature", "properties": {}}
    if top is not ABSENT:
        feature["id"] = top
    if at_id is not ABSENT:
        feature["properties"]["@id"] = at_id
    return feature


ABSENT = object()
maybe_bad = st.one_of(st.just(ABSENT), bad_values)
maybe_any = st.one_of(st.just(ABSENT), bad_values, good_keys.map(fmt))


@given(top=good_keys, at_id=maybe_any)
def test_top_level_id_wins(top, at_id):
    assert parse_osm_key(build(fmt(top), at_id)) == top


@given(top=maybe_bad, at=good_keys)
def test_fallback_to_at_id(top, at):
    assert parse_osm_key(build(top, fmt(at))) == at


@given(top=extra_good, at_id=maybe_any)
def test_extra_good_top_level_wins(top, at_id):
    assert parse_osm_key(build(top[0], at_id)) == top[1]


@given(top=maybe_bad, at=extra_good)
def test_extra_good_fallback(top, at):
    assert parse_osm_key(build(top, at[0])) == at[1]


@given(top=maybe_bad, at_id=maybe_bad)
def test_neither_parses_returns_none(top, at_id):
    assert parse_osm_key(build(top, at_id)) is None


def test_examples():
    assert parse_osm_key({"id": "way/123", "properties": {"@id": "node/9"}}) == ("way", 123)
    assert parse_osm_key({"id": "bogus", "properties": {"@id": "relation/9"}}) == ("relation", 9)
    assert parse_osm_key({"properties": {}}) is None
